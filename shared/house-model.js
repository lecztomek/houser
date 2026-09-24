// Wspólny model bryły domu: wysokości kondygnacji, typ piętra i dach.
// Wszystkie moduły liczą dach tą samą funkcją, żeby rzut, elewacje i podglądy 3D się zgadzały.
//
// elevationSettings w JSON-ie:
//   groundHeight  wysokość parteru [m]
//   upperType     'none' = dom parterowy (nad parterem nieużytkowy strych), 'attic' = poddasze użytkowe, 'full' = pełne piętro
//   upperHeight   wysokość pełnego piętra [m] (dla poddasza: wysokość do stropu/jętek)
//   kneeWall      ścianka kolankowa poddasza [m]
//   roofPitch     kąt nachylenia połaci [°]
//   ridge         'north-south' | 'east-west' – kierunek kalenicy
//   roofHeight    wyliczana wysokość dachu od okapu do kalenicy [m] (zapisywana dla zgodności)
(function(global){
  const DEF={groundHeight:2.8,upperType:'full',upperHeight:2.8,kneeWall:1.0,roofPitch:35,ridge:'east-west',eaveOverhang:.5,gableOverhang:.4,soffit:'wood'};
  const SOFFITS={wood:'drewniana',white:'biała',graphite:'grafitowa',none:'brak (widoczne krokwie)'};
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const num=(v,d)=>{const n=Number(v);return Number.isFinite(n)&&v!==''&&v!=null?n:d;};

  // span = szerokość domu w poprzek kalenicy [m] (długość ściany szczytowej)
  function normalize(e,span){
    e=e||{};const half=Math.max(.5,(span||9)/2);
    let pitch=num(e.roofPitch,NaN);
    if(!Number.isFinite(pitch)){ // stare pliki: tylko roofHeight -> kąt z wysokości
      const rh=num(e.roofHeight,NaN);pitch=Number.isFinite(rh)?Math.atan(rh/half)*180/Math.PI:DEF.roofPitch;
    }
    return {
      groundHeight:clamp(num(e.groundHeight,DEF.groundHeight),2.2,4.5),
      upperType:['attic','none'].includes(e.upperType)?e.upperType:'full',
      upperHeight:clamp(num(e.upperHeight,DEF.upperHeight),2.2,4.5),
      kneeWall:clamp(num(e.kneeWall,DEF.kneeWall),0,2),
      roofPitch:clamp(Math.round(pitch*10)/10,5,60),
      ridge:e.ridge==='north-south'?'north-south':'east-west',
      eaveOverhang:clamp(num(e.eaveOverhang,DEF.eaveOverhang),0,1.5),   // okap – wysunięcie dachu przed ściany okapowe [m]
      gableOverhang:clamp(num(e.gableOverhang,DEF.gableOverhang),0,1.5), // wysunięcie dachu przed ściany szczytowe [m]
      soffit:SOFFITS[e.soffit]?e.soffit:DEF.soffit,                    // podbitka
    };
  }

  // Wymiary bryły dla danej rozpiętości: okap, kalenica, wysokość ścian piętra.
  function geometry(e,span){
    const n=normalize(e,span),half=Math.max(.5,(span||9)/2);
    const upperWall=n.upperType==='none'?0:n.upperType==='attic'?n.kneeWall:n.upperHeight; // ściana zewnętrzna piętra pod okapem (parterowy: okap nad parterem)
    const eave=n.groundHeight+upperWall;
    const rise=Math.tan(n.roofPitch*Math.PI/180)*half;
    return {...n,span:half*2,upperWall,eave,rise,ridgeY:eave+rise,roofHeight:Math.round(rise*100)/100};
  }

  // Ustawienia do zapisu: znormalizowane + wyliczone roofHeight dla starszych przeglądarek.
  function toSaved(e,span){const g=geometry(e,span);return {groundHeight:g.groundHeight,upperType:g.upperType,upperHeight:g.upperHeight,kneeWall:g.kneeWall,roofPitch:g.roofPitch,ridge:g.ridge,roofHeight:g.roofHeight,eaveOverhang:g.eaveOverhang,gableOverhang:g.gableOverhang,soffit:g.soffit};}

  // Czy połacie opadają w poprzek osi X siatki (kalenica biegnie wzdłuż osi Z / wierszy)?
  // Zależy od kierunku kalenicy i tego, jaki kierunek świata jest u góry siatki.
  function slopesAcrossX(ridge,top){
    const gridZIsNorthSouth=(top||'north')==='north'||top==='south';
    return (ridge==='north-south')===gridZIsNorthSouth;
  }

  // ---------- tarasy / pergole malowane kratkami
  // Element zewnętrzny: {id,type,label,cells:[[cx,cy],...]} – kratki siatki domu (mogą być ujemne, poza obrysem).
  // Dla zgodności element ma też prostokąt obejmujący x,y,w,h w metrach.
  const OUTDOOR_KEY=(x,y)=>x+','+y;
  function outdoorCells(it,cellM){
    if(Array.isArray(it?.cells)&&it.cells.length)return it.cells.map(c=>[Math.round(+c[0]),Math.round(+c[1])]).filter(c=>c.every(Number.isFinite));
    const x=+it?.x,y=+it?.y,w=+it?.w,h=+it?.h,out=[];if(![x,y,w,h].every(Number.isFinite)||!cellM)return out;
    const x0=Math.round(x/cellM),y0=Math.round(y/cellM),nx=Math.max(1,Math.round(w/cellM)),ny=Math.max(1,Math.round(h/cellM));
    for(let j=0;j<ny;j++)for(let i=0;i<nx;i++)out.push([x0+i,y0+j]);return out;
  }
  // mapa "x,y" -> typ  ->  lista elementów (spójne obszary jednego typu); etykiety przejmowane z poprzednich elementów
  function outdoorFromMap(map,cellM,prev){
    const seen=new Set(),out=[],prevByCell=new Map();
    for(const it of prev||[])for(const c of outdoorCells(it,cellM))prevByCell.set(OUTDOOR_KEY(c[0],c[1]),it);
    for(const [k,type] of map){if(seen.has(k))continue;const cells=[],stack=[k];seen.add(k);
      while(stack.length){const cur=stack.pop(),[x,y]=cur.split(',').map(Number);cells.push([x,y]);
        for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nk=OUTDOOR_KEY(x+dx,y+dy);if(!seen.has(nk)&&map.get(nk)===type){seen.add(nk);stack.push(nk);}}}
      cells.sort((a,b)=>a[1]-b[1]||a[0]-b[0]);
      const old=cells.map(c=>prevByCell.get(OUTDOOR_KEY(c[0],c[1]))).find(o=>o&&o.type===type);
      const xs=cells.map(c=>c[0]),ys=cells.map(c=>c[1]),x0=Math.min(...xs),y0=Math.min(...ys);
      out.push({id:old?.id||('o'+Date.now().toString(36)+Math.random().toString(36).slice(2,6)),type,label:old?.label||'',cells,
        x:x0*cellM,y:y0*cellM,w:(Math.max(...xs)-x0+1)*cellM,h:(Math.max(...ys)-y0+1)*cellM});
    }
    return out;
  }
  function outdoorMap(list,cellM){const m=new Map();for(const it of list||[])for(const c of outdoorCells(it,cellM))m.set(OUTDOOR_KEY(c[0],c[1]),it.type);return m;}
  // narożniki obszaru (wierzchołki siatki) – tam stoją słupki pergoli / zadaszenia
  function outdoorCorners(cells){
    const set=new Set(cells.map(c=>OUTDOOR_KEY(c[0],c[1]))),has=(x,y)=>set.has(OUTDOOR_KEY(x,y)),out=[],done=new Set();
    for(const [cx,cy] of cells)for(const [vx,vy] of [[cx,cy],[cx+1,cy],[cx,cy+1],[cx+1,cy+1]]){const k=OUTDOOR_KEY(vx,vy);if(done.has(k))continue;done.add(k);
      const a=has(vx-1,vy-1),b=has(vx,vy-1),c=has(vx-1,vy),d=has(vx,vy),n=a+b+c+d;
      if(n===1||n===3||(n===2&&a===d))out.push([vx,vy]);}
    return out;
  }

  global.HouserModel={DEF,SOFFITS,normalize,geometry,toSaved,slopesAcrossX,outdoorCells,outdoorFromMap,outdoorMap,outdoorCorners};
})(window);
