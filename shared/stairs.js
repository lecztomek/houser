// Wspólna geometria schodów: moduł Schody (rzut), Układ pomieszczeń (kratki), Wnętrze 3D (stopnie).
// Schody w projekcie: project.stairs = [{id,type,x,y,rot,width,risers,tread,turn}]
//   type   'straight' | 'L' (zabiegowe 90° ze spocznikiem) | 'U' (dwubiegowe 180° ze spocznikiem) | 'spiral' (kręcone)
//   x,y    kratka lewego-górnego rogu obrysu schodów na siatce
//   rot    0|90|180|270 – obrót (0 = wejście na dole, wchodzimy „w górę” rzutu)
//   width  szerokość biegu [m], risers – liczba podniesień, tread – głębokość stopnia [m], turn 'left'|'right'
(function(global){
  const TYPES={straight:'Proste (jednobiegowe)',L:'L – ze spocznikiem 90°',U:'Dwubiegowe 180° (U)',spiral:'Kręcone'};
  const HEADROOM=2.0, SLAB=.25; // min. wysokość nad stopniem, grubość stropu

  function defaults(type,floorHeight){
    const risers=Math.max(10,Math.round((floorHeight||2.8)/.175));
    return {type,rot:0,width:type==='spiral'?.8:.9,risers,tread:type==='spiral'?.25:.27,turn:'left'};
  }
  const rotPt=([u,v],rot)=>rot===90?[-v,u]:rot===180?[-u,-v]:rot===270?[v,-u]:[u,v];

  // Stopnie w układzie lokalnym: u w poprzek biegu (0..width), v do przodu (w górę rzutu = -y na ekranie).
  // Zwraca [{poly:[[u,v]...], top:numer stopnia 1..N-1}] – top*wysokość podniesienia = wysokość wierzchu
  function localSteps(s){
    const N=Math.max(3,Math.round(s.risers)),w=Math.max(.5,+s.width||.9),t=Math.max(.18,+s.tread||.27),n=N-1,out=[];
    const rect=(u0,v0,u1,v1,k)=>out.push({poly:[[u0,v0],[u1,v0],[u1,v1],[u0,v1]],top:k});
    const L=s.turn==='right'?1:-1; // skręt: lewo = w stronę -u
    if(s.type==='L'){
      const n1=Math.floor((n-1)/2),n2=n-1-n1;
      for(let i=0;i<n1;i++)rect(0,i*t,w,(i+1)*t,i+1);
      const lv=n1*t;rect(0,lv,w,lv+w,n1+1); // spocznik
      for(let j=0;j<n2;j++){const a=j*t,b=(j+1)*t;if(L<0)rect(-b,lv,-a,lv+w,n1+2+j);else rect(w+a,lv,w+b,lv+w,n1+2+j);}
    }else if(s.type==='U'){
      const gap=.1,n1=Math.floor((n-1)/2),n2=n-1-n1,lv=Math.max(n1,n2)*t;
      for(let i=0;i<n1;i++)rect(0,lv-(n1-i)*t,w,lv-(n1-i-1)*t,i+1); // pierwszy bieg kończy się przy spoczniku
      const u2=L<0?-(w+gap):w+gap;
      rect(Math.min(0,u2),lv,Math.max(w,u2+w),lv+w,n1+1); // spocznik na całą szerokość obu biegów
      for(let j=0;j<n2;j++)rect(u2,lv-(j+1)*t,u2+w,lv-j*t,n1+2+j); // drugi bieg wraca
    }else if(s.type==='spiral'){
      const R=w+.1,r0=.1,cu=R,cv=R,sweep=Math.min(2*Math.PI*.92,n*(t/(R*.65)));const da=sweep/n,dir=L<0?-1:1,a0=Math.PI/2*(dir<0?1:1);
      for(let i=0;i<n;i++){const a=a0+dir*i*da,b=a0+dir*(i+1)*da,seg=4,poly=[];
        for(let k=0;k<=seg;k++){const q=a+(b-a)*k/seg;poly.push([cu+Math.cos(q)*R,cv-Math.sin(q)*R]);}
        for(let k=seg;k>=0;k--){const q=a+(b-a)*k/seg;poly.push([cu+Math.cos(q)*r0,cv-Math.sin(q)*r0]);}
        out.push({poly,top:i+1});}
      out.center=[cu,cv];out.pole=r0;
    }else{
      for(let i=0;i<n;i++)rect(0,i*t,w,(i+1)*t,i+1);
    }
    return out;
  }

  // Geometria w metrach na siatce (x w prawo, z w dół ekranu). cellM – rozmiar kratki.
  function geometry(s,cellM,floorHeight){
    const loc=localSteps(s),rot=((+s.rot||0)%360+360)%360;
    // lokalne v rośnie „w górę rzutu” -> na ekranie -z
    const toScreen=p=>{const [u,v]=rotPt([p[0],-p[1]],rot);return [u,v]};
    let steps=loc.map(st=>({poly:st.poly.map(toScreen),top:st.top}));
    const all=steps.flatMap(st=>st.poly),minX=Math.min(...all.map(p=>p[0])),minZ=Math.min(...all.map(p=>p[1]));
    const ox=(+s.x||0)*cellM-minX,oz=(+s.y||0)*cellM-minZ;
    steps=steps.map(st=>({poly:st.poly.map(([x,z])=>[x+ox,z+oz]),top:st.top}));
    const xs=steps.flatMap(st=>st.poly.map(p=>p[0])),zs=steps.flatMap(st=>st.poly.map(p=>p[1]));
    const N=Math.max(3,Math.round(s.risers)),rise=(floorHeight||2.8)/N;
    let center=null;if(loc.center){const c=toScreen(loc.center);center=[c[0]+ox,c[1]+oz];}
    return {steps,rise,N,center,pole:loc.pole||0,bbox:{x0:Math.min(...xs),z0:Math.min(...zs),x1:Math.max(...xs),z1:Math.max(...zs)},
      start:steps[0]?centroid(steps[0].poly):null,end:steps.length?centroid(steps[steps.length-1].poly):null};
  }
  function centroid(poly){let x=0,z=0;for(const p of poly){x+=p[0];z+=p[1];}return [x/poly.length,z/poly.length];}
  function inPoly(pt,poly){let c=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const [xi,zi]=poly[i],[xj,zj]=poly[j];if(((zi>pt[1])!==(zj>pt[1]))&&(pt[0]<(xj-xi)*(pt[1]-zi)/(zj-zi)+xi))c=!c;}return c;}

  // Kratki: lower – zajęte przez schody na dolnej kondygnacji; upper – otwór w stropie (za mało miejsca nad głową).
  // Kratka należy do schodów, jeśli większa część jej próbek leży na stopniu.
  function cells(s,cellM,floorHeight,gridW,gridH){
    const g=geometry(s,cellM,floorHeight),lower=[],upper=[],limit=(floorHeight||2.8)-SLAB-HEADROOM,S=4;
    const cx0=Math.floor(g.bbox.x0/cellM),cz0=Math.floor(g.bbox.z0/cellM),cx1=Math.ceil(g.bbox.x1/cellM),cz1=Math.ceil(g.bbox.z1/cellM);
    for(let cy=cz0;cy<cz1;cy++)for(let cx=cx0;cx<cx1;cx++){
      if(cx<0||cy<0||cx>=gridW||cy>=gridH)continue;let hit=0,maxTop=0;
      for(let a=0;a<S;a++)for(let b=0;b<S;b++){const p=[(cx+(a+.5)/S)*cellM,(cy+(b+.5)/S)*cellM];for(const st of g.steps)if(inPoly(p,st.poly)){hit++;maxTop=Math.max(maxTop,st.top);break;}}
      if(hit/(S*S)>=.4){lower.push([cx,cy]);if(maxTop*g.rise>limit)upper.push([cx,cy]);}
    }
    return {lower,upper,geometry:g};
  }
  // wygoda: ocena wygody (2h + s ≈ 60–65 cm)
  function comfort(s,floorHeight){const h=(floorHeight||2.8)/Math.max(3,Math.round(s.risers)),t=+s.tread||.27,k=2*h+t;return {rise:h,tread:t,step:k,ok:h<=.19&&k>=.59&&k<=.66};}

  global.HouserStairs={TYPES,HEADROOM,SLAB,defaults,geometry,cells,comfort,inPoly};
})(window);
