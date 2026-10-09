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
      roofShape:e.roofShape==='rect'?'rect':'auto',                   // dach dopasowany do obrysu (L, T…) albo jeden nad prostokątem siatki
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
  function toSaved(e,span){const g=geometry(e,span);return {groundHeight:g.groundHeight,upperType:g.upperType,upperHeight:g.upperHeight,kneeWall:g.kneeWall,roofPitch:g.roofPitch,ridge:g.ridge,roofHeight:g.roofHeight,eaveOverhang:g.eaveOverhang,gableOverhang:g.gableOverhang,soffit:g.soffit,roofShape:g.roofShape};}

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
      const keep=old?Object.fromEntries(Object.entries(old).filter(([k])=>!['id','type','label','cells','x','y','w','h'].includes(k))):{}; // wysokość, dach, ściany
      out.push({...keep,id:old?.id||('o'+Date.now().toString(36)+Math.random().toString(36).slice(2,6)),type,label:old?.label||'',cells,
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

  // zadaszony taras / pergola: wysokość, dach (płaski / jednospadowy – spadek i strona niższa), ściany z każdej strony
  // it.height – wysokość dolnej krawędzi dachu [m], it.roof 'flat'|'mono', it.pitch [°], it.fall 'auto'|'top'|'right'|'bottom'|'left' (strona niższa na rzucie),
  // it.sides {top,right,bottom,left: 'open'|'glass'|'wall'|'slats'|'screen'}; isHouse(x,y) – kratka domu (ściana domu zamiast boku)
  const SIDE_KINDS={open:'otwarta',glass:'szkło (przesuwne)',wall:'pełna ściana',slats:'lamele / żaluzja',screen:'screen (roleta tekstylna)'};
  function outdoorGeom(it,cellM,isHouse){const cells=outdoorCells(it,cellM);if(!cells.length)return null;const set=new Set(cells.map(c=>OUTDOOR_KEY(c[0],c[1]))),has=(x,y)=>set.has(OUTDOOR_KEY(x,y));
    const xs=cells.map(c=>c[0]),ys=cells.map(c=>c[1]),x0=Math.min(...xs),x1=Math.max(...xs)+1,y0=Math.min(...ys),y1=Math.max(...ys)+1;
    const edges=[],adj={top:0,right:0,bottom:0,left:0};
    for(const [x,y] of cells)for(const [dx,dy,side,ax,ay,bx,by] of [[0,-1,'top',x,y,x+1,y],[1,0,'right',x+1,y,x+1,y+1],[0,1,'bottom',x,y+1,x+1,y+1],[-1,0,'left',x,y,x,y+1]]){
      if(has(x+dx,y+dy))continue;const house=isHouse?!!isHouse(x+dx,y+dy):false;if(house){adj[side]++;continue}edges.push({side,x1:ax*cellM,y1:ay*cellM,x2:bx*cellM,y2:by*cellM})}
    const opp={top:'bottom',bottom:'top',left:'right',right:'left'},hi=Object.entries(adj).sort((a,b)=>b[1]-a[1])[0];
    const roof=it.roof==='mono'?'mono':'flat',pitch=roof==='mono'?Math.max(1,Math.min(30,+it.pitch||8)):0,fall=['top','right','bottom','left'].includes(it.fall)?it.fall:(hi[1]>0?opp[hi[0]]:'bottom');
    const height=Math.max(2,Math.min(4.5,+it.height||(it.type==='pergola'?2.6:2.5))),tan=Math.tan(pitch*Math.PI/180),X0=x0*cellM,X1=x1*cellM,Y0=y0*cellM,Y1=y1*cellM;
    // wysokość dachu w punkcie (m od terenu): najniżej przy stronie „fall”
    const roofAt=(x,y)=>height+tan*(fall==='bottom'?Y1-y:fall==='top'?y-Y0:fall==='right'?X1-x:x-X0);
    const sides={};for(const sd of ['top','right','bottom','left'])sides[sd]=SIDE_KINDS[it.sides?.[sd]]?it.sides[sd]:'open';
    for(const e of edges)e.kind=sides[e.side];
    return {cells,bbox:{x0:X0,x1:X1,y0:Y0,y1:Y1},edges,adj,roof,pitch,fall,height,roofAt,sides,maxH:Math.max(roofAt(X0,Y0),roofAt(X1,Y1),roofAt(X0,Y1),roofAt(X1,Y0))}}
  // zakres dachu wzdłuż kalenicy [m] (l0..l1). Bez balkonów – cała siatka (jak dotąd). Kratki parteru pod balkonem
  // na końcu domu (piętro krótsze) wypadają spod dachu – tam jest stropodach z tarasem / balkonem.
  function roofRange(project){const g=project.grid||project.definitionSnapshot?.grid,c=g.cellMeters,e=project.elevationSettings||{},across=slopesAcrossX(e.ridge==='north-south'?'north-south':'east-west',project.orientation?.top);
    const n=across?g.height:g.width,full={l0:0,l1:n*c,full:true,across};const bal=project.balconies;if(!Array.isArray(bal)||!bal.length)return full;
    const [lo,up]=project.definitionSnapshot?.floorOrder||['ground','upper'],st={};for(const f of [lo,up]){const v=project.state?.[f]||[];st[f]=Array.isArray(v[0])?v.flat():v}
    const kinds=f=>Object.fromEntries((project.definitionSnapshot?.floors?.[f]?.rooms||[]).map(r=>[r.id,r.kind])),K={[lo]:kinds(lo),[up]:kinds(up)};
    const occ=(f,x,y)=>{const v=st[f]?.[y*g.width+x];return !!v&&K[f][v]!=='exteriorVoid'&&!(f===up&&(v==='pustka'||v==='schody'))};
    const B=new Set();for(const b of bal)for(const [x,y] of b.cells||[])B.add(x+','+y);
    let a0=1e9,a1=-1e9;for(let y=0;y<g.height;y++)for(let x=0;x<g.width;x++){if(occ(up,x,y)||(occ(lo,x,y)&&!B.has(x+','+y))){const a=across?y:x;a0=Math.min(a0,a);a1=Math.max(a1,a)}}
    if(a0>a1)return full;return {l0:a0*c,l1:(a1+1)*c,full:a0===0&&a1===n-1,across}}
  // ---------- dach ze skrzydeł (obrys L, T…): każdy prostokąt obrysu ma własny dach dwuspadowy, skrzydła boczne wchodzą
  // w dach główny aż do jego kalenicy (powstają kosze). Prostokątny obrys – jedno skrzydło jak dotąd.
  // Część parterowa przy domu z piętrem (np. garaż) dostaje niższy dach z okapem na wysokości parteru.
  // elevationSettings.roofShape: 'auto' (dopasowany do obrysu) | 'rect' (jeden dach nad całym prostokątem siatki)
  // roofWings(project) -> [{x0,z0,x1,z1 (m), slopeX (połacie w poprzek osi X), span, eave, rise, top, level, main, l0,l1 (zasięg wzdłuż kalenicy z przedłużeniem), free0,free1 (wolne szczyty)}]
  function roofWings(project){const g=project.grid||project.definitionSnapshot?.grid;if(!g)return [];const c=g.cellMeters,W=g.width,H=g.height,e=project.elevationSettings||{};
    const top=project.orientation?.top,mainSX=slopesAcrossX(e.ridge==='north-south'?'north-south':'east-west',top);
    const legacy=()=>{const span=mainSX?W*c:H*c,G=geometry(e,span),rr=roofRange(project);return [{x0:0,z0:0,x1:W*c,z1:H*c,slopeX:mainSX,span,eave:G.eave,rise:G.rise,top:G.eave+G.rise,level:'top',main:true,l0:rr.l0,l1:rr.l1,free0:true,free1:true,legacy:true}]};
    if(e.roofShape==='rect')return legacy();
    const [lo,up]=project.definitionSnapshot?.floorOrder||['ground','upper'],K={},st={};
    for(const f of [lo,up]){const v=project.state?.[f]||[];st[f]=Array.isArray(v[0])?v.flat():v;K[f]=Object.fromEntries((project.definitionSnapshot?.floors?.[f]?.rooms||[]).map(r=>[r.id,r.kind]))}
    const n0=normalize(e,9),storey=n0.upperType!=='none'&&st[up].some(v=>v&&K[up][v]!=='exteriorVoid');
    const occ=(f,i)=>{const v=st[f][i];return !!v&&K[f][v]!=='exteriorVoid'},inHouse=(f,i)=>!!st[f][i]&&st[f][i]!=='poza_obrysem'; // wnęka / loggia (inna pustka niż „poza obrysem”) zostaje pod dachem
    // poziom dachu głównego: piętro (z wnękami) albo parter domu parterowego; niższy: parter bez piętra nad nim
    const A=new Uint8Array(W*H),B=new Uint8Array(W*H);
    for(let i=0;i<W*H;i++){if(storey){if(occ(up,i)||(inHouse(up,i)&&occ(lo,i)))A[i]=1;else if(occ(lo,i))B[i]=1}else if(occ(lo,i))A[i]=1}
    const rectsOf=M=>{let x0=W,y0=H,x1=-1,y1=-1,n=0;for(let i=0;i<W*H;i++)if(M[i]){const x=i%W,y=(i-x)/W;x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);n++}if(!n)return [];
      // wnęki i małe wcięcia (dotykają najwyżej jednego boku obrysu) wypełniamy – zostają pod dachem
      const F=M.slice(),seen=new Uint8Array(W*H);for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const i=y*W+x;if(F[i]||seen[i])continue;const comp=[],q=[i];seen[i]=1;let sides=new Set(),cx0=x,cx1=x,cy0=y,cy1=y;
        while(q.length){const j=q.pop(),a=j%W,b=(j-a)/W;comp.push(j);cx0=Math.min(cx0,a);cx1=Math.max(cx1,a);cy0=Math.min(cy0,b);cy1=Math.max(cy1,b);if(a===x0)sides.add('l');if(a===x1)sides.add('r');if(b===y0)sides.add('t');if(b===y1)sides.add('b');
          for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const na=a+dx,nb=b+dy;if(na<x0||nb<y0||na>x1||nb>y1)continue;const k=nb*W+na;if(!F[k]&&!seen[k]){seen[k]=1;q.push(k)}}}
        const small=Math.min(cx1-cx0+1,cy1-cy0+1)*c<=2.5||comp.length*c*c<=6;if(sides.size<=1&&small)for(const j of comp)F[j]=1}
      // największe prostokąty po kolei (min. 2,5 m szerokości)
      const out=[],minC=Math.ceil(2.5/c-1e-9);for(let guard=0;guard<6;guard++){let best=null;const hgt=new Int32Array(W);
        for(let y=y0;y<=y1;y++){for(let x=x0;x<=x1;x++)hgt[x]=F[y*W+x]?hgt[x]+1:0;
          for(let x=x0;x<=x1;x++){if(!hgt[x])continue;let h=hgt[x];for(let x2=x;x2<=x1&&hgt[x2];x2++){h=Math.min(h,hgt[x2]);const w=x2-x+1,ar=w*h,sc=ar*Math.sqrt(Math.min(w,h)/Math.max(w,h));if(w>=minC&&h>=minC&&(!best||sc>best.sc))best={x0:x,x1:x2,y0:y-h+1,y1:y,ar,sc}}}}
        if(!best||best.ar*c*c<6)break;out.push(best);for(let y=best.y0;y<=best.y1;y++)for(let x=best.x0;x<=best.x1;x++)F[y*W+x]=0}
      return out};
    const RA=rectsOf(A),RB=storey?rectsOf(B):[];if(!RA.length)return legacy();
    if(RA.length===1&&!RB.length&&RA[0].x0===0&&RA[0].y0===0&&RA[0].x1===W-1&&RA[0].y1===H-1)return legacy();
    const tan=Math.tan(n0.roofPitch*Math.PI/180),eaveA=geometry(e,9).eave,eaveB=n0.groundHeight;
    const wings=[];const mk=(r,level,main)=>({x0:r.x0*c,z0:r.y0*c,x1:(r.x1+1)*c,z1:(r.y1+1)*c,level,main,cell:r});
    RA.forEach((r,i)=>wings.push(mk(r,'top',i===0)));RB.forEach(r=>wings.push(mk(r,'low',false)));
    // styk dwóch prostokątów: wspólny odcinek krawędzi
    const touch=(a,b)=>{const ox=Math.min(a.x1,b.x1)-Math.max(a.x0,b.x0),oz=Math.min(a.z1,b.z1)-Math.max(a.z0,b.z0),E=1e-6;
      if(Math.abs(a.x1-b.x0)<E&&oz>E)return 'x1';if(Math.abs(a.x0-b.x1)<E&&oz>E)return 'x0';if(Math.abs(a.z1-b.z0)<E&&ox>E)return 'z1';if(Math.abs(a.z0-b.z1)<E&&ox>E)return 'z0';return null};
    for(const w of wings){if(w.main){w.slopeX=mainSX;w.parent=null}
      else{// rodzic: wcześniejsze skrzydło (najpierw wyższe), do którego przylega; kalenica prostopadle do styku (szczyt na zewnątrz)
        const par=wings.find(o=>o!==w&&wings.indexOf(o)<wings.indexOf(w)&&touch(w,o))||wings.find(o=>o!==w&&touch(w,o));w.parent=par||null;const t=par?touch(w,par):null;
        const along=t?((t==='z0'||t==='z1')?w.x1-w.x0:w.z1-w.z0):0,depth=t?((t==='z0'||t==='z1')?w.z1-w.z0:w.x1-w.x0):0;
        // zwykle szczyt na zewnątrz (kalenica prostopadle do styku); skrzydło przyklejone długim bokiem – kalenica wzdłuż styku
        w.slopeX=t?((t==='z0'||t==='z1')!==(along>depth*2)):((w.x1-w.x0)<(w.z1-w.z0));w.joint=t}
      w.span=w.slopeX?w.x1-w.x0:w.z1-w.z0;w.eave=w.level==='top'?eaveA:eaveB;w.rise=tan*w.span/2;w.top=w.eave+w.rise;
      w.l0=w.slopeX?w.z0:w.x0;w.l1=w.slopeX?w.z1:w.x1;w.free0=true;w.free1=true}
    // przedłużenie skrzydła w dach rodzica (ten sam poziom): do kalenicy rodzica, gdy ta biegnie wzdłuż styku
    for(const w of wings){const p=w.parent,t=w.joint;if(!p||!t)continue;
      const end=(t==='z0'||t==='x0')?0:1;if(end===0)w.free0=false;else w.free1=false;
      if(p.level!==w.level)continue;const perp=(t==='z0'||t==='z1')?w.slopeX:!w.slopeX;if(!perp){if(end===0)w.free0=true;else w.free1=true;continue}const pRidgeAlongJoint=(t==='z0'||t==='z1')?!p.slopeX:p.slopeX;if(!pRidgeAlongJoint)continue;
      const pr=p.slopeX?(p.x0+p.x1)/2:(p.z0+p.z1)/2;if(end===0)w.l0=Math.min(w.l0,pr);else w.l1=Math.max(w.l1,pr)}
    // szczyt skrzydła przylegający do innego (niebędącego rodzicem) też nie jest wolny
    for(const w of wings)for(const o of wings){if(o===w)continue;const t=touch(w,o);if(!t)continue;if(w.slopeX&&t==='z0'||!w.slopeX&&t==='x0')w.free0=false;if(w.slopeX&&t==='z1'||!w.slopeX&&t==='x1')w.free1=false}
    return wings}
  // wysokość połaci nad punktem (m od terenu) – najwyższe skrzydło nad punktem; null = poza dachem
  function roofYAt(wings,x,z){let best=null;for(const w of wings){const a=w.slopeX?x:z,a0=w.slopeX?w.x0:w.z0,l=w.slopeX?z:x;if(a<a0-1e-6||a>a0+w.span+1e-6||l<w.l0-1e-6||l>w.l1+1e-6)continue;
      const y=w.eave+Math.min(a-a0,a0+w.span-a)*Math.tan(Math.atan(w.rise/(w.span/2)));if(best==null||y>best)best=y}return best}
  // skrzydło, pod którym leży punkt (bez przedłużeń)
  function wingAt(wings,x,z){let best=null;for(const w of wings)if(x>=w.x0-1e-6&&x<=w.x1+1e-6&&z>=w.z0-1e-6&&z<=w.z1+1e-6&&(!best||w.top>best.top))best=w;return best}
  global.HouserModel={roofRange,roofWings,roofYAt,wingAt,DEF,SOFFITS,normalize,geometry,toSaved,slopesAcrossX,outdoorCells,outdoorFromMap,outdoorMap,outdoorCorners,outdoorGeom,SIDE_KINDS};
})(window);
