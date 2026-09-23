// Prosty krajobraz wokół domu do podglądów 3D (i jako podpowiedź dla wizualizacji AI):
// trawa, działka z żywopłotem, drzewa w ogrodzie, las i wzgórza na horyzoncie. Bez losowości między przebudowami (stałe ziarno).
// HouserLandscape.build({minX,minZ,maxX,maxZ,y}) -> {ground:{y,color,size}, polys:[{points,color,stroke,line,alpha}]}
(function(global){
  function rng(seed){let s=seed>>>0||1;return ()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return ((s>>>0)%100000)/100000}}
  function build(o){
    const y=o.y??0,minX=o.minX,minZ=o.minZ,maxX=o.maxX,maxZ=o.maxZ,cx=(minX+maxX)/2,cz=(minZ+maxZ)/2,R=Math.max(maxX-minX,maxZ-minZ)/2;
    const r=rng(o.seed||20240917),polys=[],P=(points,color)=>polys.push({points,color,stroke:color,line:0,alpha:1});
    const quad=(x0,z0,x1,z1,yy,color)=>P([[x0,yy,z1],[x1,yy,z1],[x1,yy,z0],[x0,yy,z0]],color);
    function box(x0,y0,z0,x1,y1,z1,color){
      P([[x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0]],color);P([[x1,y0,z1],[x0,y0,z1],[x0,y1,z1],[x1,y1,z1]],color);
      P([[x0,y0,z1],[x0,y0,z0],[x0,y1,z0],[x0,y1,z1]],color);P([[x1,y0,z0],[x1,y0,z1],[x1,y1,z1],[x1,y1,z0]],color);
      P([[x0,y1,z0],[x1,y1,z0],[x1,y1,z1],[x0,y1,z1]],color);
    }
    // stożek / bryła korony z n boków: od y0 (promień r0) do y1 (promień r1)
    function frustum(x,z,y0,y1,r0,r1,n,color){for(let i=0;i<n;i++){const a=i/n*Math.PI*2,b=(i+1)/n*Math.PI*2;
      const p=(ang,rr,yy)=>[x+Math.cos(ang)*rr,yy,z+Math.sin(ang)*rr];
      if(r1<.01)P([p(a,r0,y0),p(b,r0,y0),[x,y1,z]],color);else P([p(a,r0,y0),p(b,r0,y0),p(b,r1,y1),p(a,r1,y1)],color)}}
    const LEAF=['#5b8c3e','#4f7d36','#6a9a47','#58863c'],PINE=['#35603a','#2f5634','#3c6b40'];
    function tree(x,z,s){const h=2.2*s;box(x-.13*s,y,z-.13*s,x+.13*s,y+h,z+.13*s,'#6b4f35');const c=LEAF[Math.floor(r()*LEAF.length)],w=1.9*s;
      frustum(x,z,y+h*.8,y+h+1.3*s,w*.55,w,7,c);frustum(x,z,y+h+1.3*s,y+h+2.9*s,w,0,7,c)}
    function pine(x,z,s){box(x-.1*s,y,z-.1*s,x+.1*s,y+1*s,z+.1*s,'#5b4330');const c=PINE[Math.floor(r()*PINE.length)];
      frustum(x,z,y+.8*s,y+4.2*s,1.5*s,.35*s,6,c);frustum(x,z,y+3.2*s,y+7*s,1.05*s,0,6,c)}
    // działka: jaśniejsza, skoszona trawa + żywopłot z przerwą na wjazd
    const m=Math.max(12,R*1.1),px0=minX-m,px1=maxX+m,pz0=minZ-m,pz1=maxZ+m;
    quad(px0,pz0,px1,pz1,y+.012,'#9cc26f');
    const hh=1.1,ht=.7,hc='#3f7134',gap=4;
    box(px0,y,pz0,px1,y+hh,pz0+ht,hc);box(px0,y,pz0,px0+ht,y+hh,pz1,hc);box(px1-ht,y,pz0,px1,y+hh,pz1,hc);
    box(px0,y,pz1-ht,cx-gap/2,y+hh,pz1,hc);box(cx+gap/2,y,pz1-ht,px1,y+hh,pz1,hc);
    quad(cx-gap/2+.3,pz1-ht-.1,cx+gap/2-.3,pz1+30,y+.02,'#b9b2a4'); // podjazd od przerwy w żywopłocie
    // drzewa w ogrodzie – między domem (z zapasem na tarasy) a żywopłotem
    const inner=6.5;let placed=0,tries=0;
    while(placed<9&&tries<400){tries++;const x=px0+1.5+r()*(px1-px0-3),z=pz0+1.5+r()*(pz1-pz0-3);
      if(x>minX-inner&&x<maxX+inner&&z>minZ-inner&&z<maxZ+inner)continue;if(Math.abs(x-cx)<gap+2&&z>maxZ)continue;
      if(Math.min(x-px0,px1-x,z-pz0,pz1-z)>3.5)continue; // tylko przy żywopłocie – środek ogrodu wolny, dom widać
      (r()<.3?pine:tree)(x,z,.8+r()*.6);placed++}
    // pas drzew za działką i las na horyzoncie
    for(let i=0;i<26;i++){const a=r()*Math.PI*2,d=m+R+24+r()*30,x=cx+Math.cos(a)*d,z=cz+Math.sin(a)*d;if(Math.abs(x-cx)<5&&z>cz)continue;(r()<.5?pine:tree)(x,z,1+r()*.7)}
    for(let i=0;i<70;i++){const a=i/70*Math.PI*2+r()*.05,d=95+r()*20,x=cx+Math.cos(a)*d,z=cz+Math.sin(a)*d;pine(x,z,1.6+r()*1.2)}
    // wzgórza: pierścień łagodnych wzniesień za lasem
    const N=36;for(let i=0;i<N;i++){const a=i/N*Math.PI*2,b=(i+1)/N*Math.PI*2,d0=125,d1=170,h0=6+8*Math.abs(Math.sin(i*1.7)),h1=6+8*Math.abs(Math.sin((i+1)*1.7));
      const p=(ang,d,hh)=>[cx+Math.cos(ang)*d,y+hh,cz+Math.sin(ang)*d];
      P([p(a,d0,0),p(b,d0,0),p(b,d1,h1),p(a,d1,h0)],i%2?'#8fae7c':'#86a674');
      P([p(a,d1,h0),p(b,d1,h1),p(b,d1+25,h1*.6),p(a,d1+25,h0*.6)],'#9bb58f')}
    return {ground:{y:y-.02,color:'#8db764',size:260},polys};
  }
  global.HouserLandscape={build};
})(window);
