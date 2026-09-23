// Wspólny renderer WebGL dla modułów 3D (Wnętrze 3D, Zewnątrz 3D).
// Rysuje płaskie wielokąty {points:[[x,y,z],...], color, stroke, line, alpha} z buforem głębokości,
// więc nie ma migania ani znikania elementów jak przy sortowaniu "malarskim" na canvas 2D.
// Bez zewnętrznych bibliotek – działa offline.
(function(global){
  function sub(a,b){return [a[0]-b[0],a[1]-b[1],a[2]-b[2]]}
  function dot(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]}
  function cross(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]}
  function norm(a){const l=Math.hypot(a[0],a[1],a[2])||1;return [a[0]/l,a[1]/l,a[2]/l]}
  const rgbCache=new Map();
  function rgb(hex){
    let c=rgbCache.get(hex);if(c)return c;
    const h=String(hex||'#888').replace('#','').slice(0,6),f=h.length===3?h.split('').map(x=>x+x).join(''):h;
    c=[parseInt(f.slice(0,2),16)/255||0,parseInt(f.slice(2,4),16)/255||0,parseInt(f.slice(4,6),16)/255||0];
    rgbCache.set(hex,c);return c;
  }

  function create(canvas){
    let gl=null;
    try{gl=canvas.getContext('webgl',{antialias:true,alpha:true,premultipliedAlpha:false})||canvas.getContext('experimental-webgl');}catch(e){}
    if(!gl)return null;
    const vs='attribute vec3 p;attribute vec4 c;uniform mat4 m;varying vec4 v;void main(){gl_Position=m*vec4(p,1.0);v=c;}';
    const fs='precision mediump float;varying vec4 v;void main(){gl_FragColor=v;}';
    const sh=(t,s)=>{const o=gl.createShader(t);gl.shaderSource(o,s);gl.compileShader(o);return o;};
    const prog=gl.createProgram();gl.attachShader(prog,sh(gl.VERTEX_SHADER,vs));gl.attachShader(prog,sh(gl.FRAGMENT_SHADER,fs));gl.linkProgram(prog);
    if(!gl.getProgramParameter(prog,gl.LINK_STATUS))return null;
    const aP=gl.getAttribLocation(prog,'p'),aC=gl.getAttribLocation(prog,'c'),uM=gl.getUniformLocation(prog,'m');
    const bufOpaque=gl.createBuffer(),bufLines=gl.createBuffer(),bufTrans=gl.createBuffer();
    const L=norm([.45,.8,.35]);
    let nOpaque=0,nLines=0,trans=[];

    function tris(p,out){
      const pts=p.points;if(!pts||pts.length<3)return;
      const n=norm(cross(sub(pts[1],pts[0]),sub(pts[2],pts[0]))),s=.8+.2*Math.abs(dot(n,L)),c=rgb(p.color),a=p.alpha??1;
      for(let i=1;i<pts.length-1;i++)for(const q of [pts[0],pts[i],pts[i+1]])out.push(q[0],q[1],q[2],c[0]*s,c[1]*s,c[2]*s,a);
    }
    function send(buf,arr){gl.bindBuffer(gl.ARRAY_BUFFER,buf);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(arr),gl.STATIC_DRAW);return arr.length/7;}
    function bind(buf){gl.bindBuffer(gl.ARRAY_BUFFER,buf);gl.vertexAttribPointer(aP,3,gl.FLOAT,false,28,0);gl.vertexAttribPointer(aC,4,gl.FLOAT,false,28,12);}

    // polys: lista wielokątów; opts.ground: {y,color,size} – płaszczyzna gruntu
    function upload(polys,opts={}){
      const o=[],l=[];trans=[];
      if(opts.ground){const g=opts.ground,S=g.size||200;tris({points:[[-S,g.y,-S],[-S,g.y,S],[S,g.y,S],[S,g.y,-S]],color:g.color||'#cdc8bd',alpha:1},o);}
      for(const p of polys){
        if((p.alpha??1)<1)trans.push(p);else tris(p,o);
        if((p.line??1)>0&&p.stroke){const c=rgb(p.stroke);for(let i=0;i<p.points.length;i++){const a=p.points[i],b=p.points[(i+1)%p.points.length];l.push(a[0],a[1],a[2],c[0],c[1],c[2],1,b[0],b[1],b[2],c[0],c[1],c[2],1);}}
      }
      nOpaque=send(bufOpaque,o);nLines=send(bufLines,l);
    }

    // cam: {pos, right, up, fwd} (wektory jednostkowe), sx/sy: skala rzutu (1/tan(pół-FOV)), near/far
    function draw(cam){
      const W=canvas.width,H=canvas.height,near=cam.near||.04,far=cam.far||500,A=(far+near)/(far-near),B=-2*far*near/(far-near);
      const row=(v,s)=>[v[0]*s,v[1]*s,v[2]*s,-dot(v,cam.pos)*s];
      const R0=row(cam.right,cam.sx),R1=row(cam.up,cam.sy),Rz=row(cam.fwd,1),R2=[Rz[0]*A,Rz[1]*A,Rz[2]*A,Rz[3]*A+B];
      const m=new Float32Array([R0[0],R1[0],R2[0],Rz[0],R0[1],R1[1],R2[1],Rz[1],R0[2],R1[2],R2[2],Rz[2],R0[3],R1[3],R2[3],Rz[3]]);
      gl.viewport(0,0,W,H);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      gl.useProgram(prog);gl.uniformMatrix4fv(uM,false,m);gl.enableVertexAttribArray(aP);gl.enableVertexAttribArray(aC);
      gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.BLEND);gl.depthMask(true);
      // wypełnienia lekko "odsunięte", żeby krawędzie leżące na nich były widoczne bez migotania
      gl.enable(gl.POLYGON_OFFSET_FILL);gl.polygonOffset(1,1);
      if(nOpaque){bind(bufOpaque);gl.drawArrays(gl.TRIANGLES,0,nOpaque);}
      gl.disable(gl.POLYGON_OFFSET_FILL);
      if(nLines){bind(bufLines);gl.drawArrays(gl.LINES,0,nLines);}
      if(trans.length){
        const t=[];trans.map(p=>({p,d:p.points.reduce((s,q)=>s+dot(sub(q,cam.pos),cam.fwd),0)/p.points.length})).sort((a,b)=>b.d-a.d).forEach(x=>tris(x.p,t));
        gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);
        const n=send(bufTrans,t);bind(bufTrans);gl.drawArrays(gl.TRIANGLES,0,n);gl.depthMask(true);gl.disable(gl.BLEND);
      }
    }
    return {upload,draw};
  }
  global.HouserGL={create};
})(window);
