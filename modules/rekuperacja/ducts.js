// Projekt kanałów rekuperacji (system rozdzielaczowy): centrala, skrzynki rozdzielcze, pion (szacht), kanały Ø75 do każdej kratki,
// warstwa prowadzenia na każdej kondygnacji (sufit podwieszany / w stropie / w posadzce / strych) i jej skutki: obniżenie sufitu,
// wyższa wylewka, szacht (pogrubienie ściany), długości i koszt.
// HouserDucts.evaluate(project) -> {floors:{[f]:{layer,terms,paths,bundle}}, unit, riser, shaft, plenums, rooms, totals, issues, good, score, cost}
// Ustawienia: project.mvhrDesign = {layers:{[f]:'ceiling'|'slab'|'floor'|'attic'|'screed'}, unit:{f,x,y}, riser:{x,y}, terms:{[roomKey]:[[x,y],…]},
//   routes:{[f]:{[roomKey#nr]:[[x,y],…]}} – trasy poprowadzone ręcznie (załamania między źródłem a kratką)}
// Wymaga shared/quantities.js, shared/hvac.js; opcjonalnie modules/konstrukcja/engine.js (ściany nośne – trudniej przewiercić).
(function(global){
  const LAYERS={ceiling:{name:'Sufit podwieszany (obniżenie ok. 25 cm)',lvl:'top',drop:.25},slab:{name:'W stropie – w wylewce piętra (+7 cm), kratki w suficie parteru',lvl:'top',screed:.07,screedOn:'up'},
    floor:{name:'W posadzce tej kondygnacji (+7 cm), kratki podłogowe',lvl:'bottom',screed:.07,screedOn:'self'},attic:{name:'Nad sufitem – na strychu / w ociepleniu (kanały izolowane)',lvl:'top'},
    screed:{name:'W wylewce tej kondygnacji (+7 cm), kratki podłogowe',lvl:'bottom',screed:.07,screedOn:'self'}};
  const D75=30,FLEX_W=.085,PRICE={flex:24,main:95,plenum:1400,term:160,ceilingM2:160,screedM2:45,shaftM:650,insul:25,coreDrill:120};
  const fmt=(v,d=1)=>(Math.round(v*10**d)/10**d).toLocaleString('pl-PL',{minimumFractionDigits:d,maximumFractionDigits:d});
  const HALL=/hol|korytarz|komunikac|wiatrołap|wiatrolap|przedpok|garderob|techn|schowek|spiżar|spizar|antresol/i;
  // warstwy dostępne na kondygnacji
  // załamania trasy (bez punktów pośrednich na prostej) – do edycji ręcznej
  function corners(pts){const out=[];for(let i=1;i<pts.length-1;i++){const [ax,ay]=pts[i-1],[bx,by]=pts[i],[cx,cy]=pts[i+1];if(Math.abs((bx-ax)*(cy-by)-(by-ay)*(cx-bx))>1e-9)out.push([bx,by])}return out}
  function layersFor(f,q,hasUp){if(f===q.lo)return hasUp?['ceiling','slab','floor']:['attic','floor','ceiling'];return q.attic||q.G.upperType!=='none'?['attic','screed','ceiling']:['attic']}
  function evaluate(project){
    const H=HouserHVAC.evaluate(project,project.hvacSettings),q=H.q,c=q.c,W=q.W,Hh=q.H,lo=q.lo,up=q.up,hasUp=H.hasUp,G=q.G,set=project.mvhrDesign||{};
    const flat=f=>{const st=project.state?.[f]||[];return Array.isArray(st[0])?st.flat():st},st={[lo]:flat(lo),[up]:flat(up)};
    const defs={};for(const f of [lo,up])defs[f]=Object.fromEntries((project.definitionSnapshot?.floors?.[f]?.rooms||[]).map(r=>[r.id,r]));
    const idAt=(f,x,y)=>x<0||y<0||x>=W||y>=Hh?null:(st[f][y*W+x]||null),isVoid=(f,v)=>!v||defs[f][v]?.kind==='exteriorVoid',isHole=(f,v)=>f===up&&(v==='pustka'||v==='schody');
    const inside=(f,x,y)=>{const v=idAt(f,x,y);return !isVoid(f,v)&&!isHole(f,v)},underHole=(x,y)=>hasUp&&isHole(up,idAt(up,x,y));
    // punkt ustawiony ręcznie: zostaje tam, gdzie go upuszczono; poza dozwolonymi kratkami – przesunięty do najbliższej dozwolonej
    const nearPt=(x,y,okC)=>{const cx=Math.floor(x/c),cy=Math.floor(y/c);if(okC(cx,cy))return [x,y];let best=null,bd=Infinity;
      for(let j=0;j<Hh;j++)for(let i=0;i<W;i++){if(!okC(i,j))continue;const px=Math.min(Math.max(x,i*c+c*.15),(i+1)*c-c*.15),py=Math.min(Math.max(y,j*c+c*.15),(j+1)*c-c*.15),d=Math.hypot(px-x,py-y);if(d<bd){bd=d;best=[px,py]}}return best};
    const floors=hasUp?[lo,up]:[lo],issues=[],good=[],add=(p,text,tip,type)=>issues.push({p:Math.round(p*100)/100,text,tip:tip||'',type:type||'duct'});
    const layer={};for(const f of floors){const opts=layersFor(f,q,hasUp),L=set.layers?.[f];layer[f]=opts.includes(L)?L:opts[0]}
    // pomieszczenia i kratki: nawiew do pokoi, wywiew z kuchni / łazienek; salon z aneksem – także nawiew
    const terms={},rooms=[];for(const f of floors)terms[f]=[];
    const roomsAll=[...H.sup.map(r=>({...r,kind:'sup'})),...H.ex.map(r=>({...r,kind:'ex'}))];
    for(const r of H.ex)if(/salon|dzienn/i.test(r.name)&&!H.sup.some(s=>s.key===r.key))roomsAll.push({...r,kind:'sup',flow:Math.max(30,Math.round(r.area*1.2/5)*5)});
    for(const r of roomsAll){if(!floors.includes(r.f))continue;const n=Math.max(1,Math.ceil(r.flow/D75)),nT=r.area>30?2:1,key=r.key+'|'+r.kind;
      // miejsce kratki: daleko od drzwi (nawiew) albo przy kuchence / prysznicu (wywiew); nie pod pustką (brak sufitu)
      const doorCells=[];for(const [k,v] of Object.entries(project.openings?.[r.f]||{})){if(v!=='door'&&v!=='opening')continue;const [o,a,b]=k.split(':'),A=+a,B=+b;const cs=o==='h'?[[A,B-1],[A,B]]:[[A-1,B],[A,B]];for(const [x,y] of cs)if(r.cells.some(cc=>cc[0]===x&&cc[1]===y))doorCells.push([x,y])}
      const furn=(project.furniture?.[r.f]||[]).filter(it=>/^(k_plyta|l_prysznic|l_walkin|l_wanna|l_wc|t_pralka)/.test(it.item||'')).map(it=>[Math.floor((+it.x+ +it.w/2)/c),Math.floor((+it.y+ +it.h/2)/c)]).filter(([x,y])=>r.cells.some(cc=>cc[0]===x&&cc[1]===y));
      const ok=r.cells.filter(([x,y])=>!(r.f===lo&&layer[lo]!=='floor'&&underHole(x,y)));const cand=ok.length?ok:r.cells;
      const own=set.terms?.[key];let pts;
      if(Array.isArray(own)&&own.length){const inR=new Set(r.cells.map(([x,y])=>x+','+y));pts=own.map(([x,y])=>nearPt(+x,+y,(i,j)=>inR.has(i+','+j))||[+x,+y])}
      else{const dist=([x,y])=>doorCells.length?Math.min(...doorCells.map(([a,b])=>Math.abs(a-x)+Math.abs(b-y))):0,score=p=>r.kind==='ex'&&furn.length?-Math.min(...furn.map(([a,b])=>Math.abs(a-p[0])+Math.abs(b-p[1]))):dist(p);
        const srt=[...cand].sort((a,b)=>score(b)-score(a)),inner=srt.filter(([x,y])=>[[1,0],[-1,0],[0,1],[0,-1]].every(([dx,dy])=>r.cells.some(cc=>cc[0]===x+dx&&cc[1]===y+dy)));
        const base=inner.length?inner:srt;pts=[base[0]];if(nT>1){const far=[...base].sort((a,b)=>(Math.abs(b[0]-pts[0][0])+Math.abs(b[1]-pts[0][1]))-(Math.abs(a[0]-pts[0][0])+Math.abs(a[1]-pts[0][1])))[0];if(far)pts.push(far)}
        pts=pts.map(([x,y])=>[(x+.5)*c,(y+.5)*c])}
      const per=Math.max(1,Math.ceil(n/pts.length));pts.forEach((p,i)=>terms[r.f].push({key,room:r.name,roomKey:r.key,kind:r.kind,x:p[0],y:p[1],flow:Math.round(r.flow/pts.length),ducts:i<pts.length-1?per:Math.max(1,n-per*(pts.length-1))}));
      rooms.push({key,name:r.name,f:r.f,kind:r.kind,flow:r.flow,ducts:n,terms:pts.length})}
    // centrala
    const cellsOf=key=>H.rooms.find(r=>r.key===key)?.cells||[];
    let unit;const isExt=(f,x,y)=>[[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>isVoid(f,idAt(f,x+dx,y+dy)));
    const uOwn=set.unit&&floors.includes(set.unit.f)&&Number.isFinite(+set.unit.x)?nearPt(+set.unit.x,+set.unit.y,(i,j)=>inside(set.unit.f,i,j)):null;
    if(uOwn)unit={f:set.unit.f,x:uOwn[0],y:uOwn[1],loft:false,name:defs[set.unit.f][idAt(set.unit.f,Math.floor(uOwn[0]/c),Math.floor(uOwn[1]/c))]?.name||''};
    else if(H.unitLoft){const top=hasUp?up:lo,all=[];for(let y=0;y<Hh;y++)for(let x=0;x<W;x++)if(inside(top,x,y))all.push([x,y]);const mx=all.reduce((a,p)=>a+p[0],0)/all.length,my=all.reduce((a,p)=>a+p[1],0)/all.length,b=all.sort((a,b)=>Math.hypot(a[0]-mx,a[1]-my)-Math.hypot(b[0]-mx,b[1]-my))[0];unit={f:top,x:(b[0]+.5)*c,y:(b[1]+.5)*c,loft:true,name:'strych'}}
    else{const cs=cellsOf(H.unit.key),e=cs.filter(([x,y])=>isExt(H.unit.f,x,y)),b=(e.length?e:cs)[0];unit={f:H.unit.f,x:(b[0]+.5)*c,y:(b[1]+.5)*c,loft:false,name:H.unit.name}}
    if(unit.loft&&!(q.attic||G.upperType==='none'||!hasUp))add(1.5,'Centrala na strychu, ale nad piętrem nie ma strychu (płaski strop / pełne piętro).','Wybierz miejsce na centralę w pomieszczeniu technicznym (przeciągnij ją na planie).','unit');
    // poziomy: 0 – posadzka parteru, 1 – strop nad parterem (posadzka piętra), 2 – nad sufitem piętra (strych); parterowy: 0 / 1 (strych)
    const lvlOf=f=>{const L=LAYERS[layer[f]];if(f===lo)return L.lvl==='bottom'?0:1;return L.lvl==='bottom'?1:2};
    const uLvl=unit.loft?(hasUp?2:1):(unit.f===lo?1:2);
    const used=floors.filter(f=>terms[f].length),levels=used.map(lvlOf);
    // pion: między poziomem centrali a poziomami kanałów; przechodzi przez kondygnację (szacht), gdy łączy jej podłogę z sufitem
    const lvMin=Math.min(uLvl,...levels),lvMax=Math.max(uLvl,...levels);
    const throughFloors=[];if(hasUp){if(lvMin<=1&&lvMax>=2)throughFloors.push(up);if(lvMin<=0&&lvMax>=1&&!(unit.f===lo&&!unit.loft&&levels.every(l=>l>=1)))throughFloors.push(lo)}else if(lvMin<=0&&lvMax>=1&&unit.loft)throughFloors.push(lo);
    const remote=floors.filter(f=>terms[f].length&&lvlOf(f)!==uLvl),remoteDucts=remote.reduce((a,f)=>a+terms[f].reduce((s,t)=>s+t.ducts,0),0),viaMains=remoteDucts>=8;
    let riser=null;
    if(remote.length||throughFloors.length){const pf=throughFloors[0]||remote[0]||unit.f;
      const cand=[];for(let y=0;y<Hh;y++)for(let x=0;x<W;x++){const vp=idAt(pf,x,y);if(!inside(pf,x,y))continue;if(hasUp&&(!inside(lo,x,y)||(up!==pf&&!inside(up,x,y))&&!throughFloors.includes(lo)))continue;
        const nm=defs[pf][vp]?.name||'',hallish=HALL.test(nm),wall=[[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>idAt(pf,x+dx,y+dy)!==vp);if(!wall)continue;cand.push({x,y,s:Math.hypot((x+.5)*c-unit.x,(y+.5)*c-unit.y)+(hallish?0:3)})}
      cand.sort((a,b)=>a.s-b.s);const own=set.riser&&Number.isFinite(+set.riser.x)?nearPt(+set.riser.x,+set.riser.y,(i,j)=>inside(pf,i,j)&&(!hasUp||inside(lo,i,j))):null,b=cand[0];
      if(own)riser={x:own[0],y:own[1],own:true};else if(b)riser={x:(b.x+.5)*c,y:(b.y+.5)*c}}
    // szacht: wymiary z liczby kanałów
    let shaft=null;if(riser&&throughFloors.length){const n=viaMains?0:remoteDucts,w=viaMains?.45:Math.max(.25,n*FLEX_W+.06),d=viaMains?.25:.14,h=throughFloors.reduce((a,f)=>a+(f===lo?G.groundHeight:(G.upperHeight||2.6)),0);
      shaft={w,d,h,floors:throughFloors,area:w*d,room:throughFloors.map(f=>defs[f][idAt(f,Math.floor(riser.x/c),Math.floor(riser.y/c))]?.name).filter(Boolean).join(' / ')}}
    // skrzynki rozdzielcze: przy centrali; na drugim końcu pionu, gdy pion niesie kanały główne
    const plenums=[{f:unit.f,x:unit.x,y:unit.y,at:'centrala'}];if(riser&&viaMains)for(const f of remote)plenums.push({f,x:riser.x,y:riser.y,at:'pion'});
    // trasy: Dijkstra po kratkach kondygnacji; ściana działowa – przejście, nośna – trudniej, zewnętrzna i otwór w stropie – nie; sufit podwieszany – najlepiej przez hol
    const K=global.HouserStructure?(()=>{try{return HouserStructure.evaluate(project)}catch(_){return null}})():null;
    const bearing=(f,key)=>{if(f!==lo||!K?.bearV)return false;const [o,a,b]=key.split(':');try{return o==='v'?!!K.bearV(+a,+b):!!K.bearH(+a,+b)}catch(_){return false}};
    const paths={},bundle={};let flexLen=0,maxRun=0,bearCross=0;
    for(const f of floors){paths[f]=[];bundle[f]={};if(!terms[f].length)continue;const L=layer[f],src=(remote.includes(f)&&riser)?riser:unit;
      const ok=(x,y)=>inside(f,x,y)&&!(f===lo&&L!=='floor'&&underHole(x,y)),cost=(x,y)=>{const v=idAt(f,x,y),nm=defs[f][v]?.name||'';return L==='ceiling'?(HALL.test(nm)?1:3):1};
      const sx=Math.floor(src.x/c),sy=Math.floor(src.y/c),N=W*Hh,dist=new Float64Array(N).fill(Infinity),prev=new Int32Array(N).fill(-1),Q=[];
      const start=[];if(ok(sx,sy))start.push([sx,sy]);else for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]])if(ok(sx+dx,sy+dy))start.push([sx+dx,sy+dy]);
      for(const [x,y] of start){dist[y*W+x]=0;Q.push([0,y*W+x])}
      while(Q.length){let bi=0;for(let i=1;i<Q.length;i++)if(Q[i][0]<Q[bi][0])bi=i;const [d0,u]=Q[bi];Q[bi]=Q[Q.length-1];Q.pop();if(d0>dist[u])continue;const x=u%W,y=(u-x)/W;
        for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const a=x+dx,b=y+dy;if(!ok(a,b))continue;let w=cost(a,b)*c;const va=idAt(f,x,y),vb=idAt(f,a,b);
          if(va!==vb){const key=dx?'v:'+Math.max(x,a)+':'+y:'h:'+x+':'+Math.max(y,b),o=project.openings?.[f]?.[key];w+=o==='door'||o==='opening'?.05:o==='glass'?9:(bearing(f,key)?2:.6)}
          const v=b*W+a;if(d0+w<dist[v]){dist[v]=d0+w;prev[v]=u;Q.push([d0+w,v])}}}
      const seenK={};
      for(const t of terms[f]){const rk=t.key+'#'+(seenK[t.key]=(seenK[t.key]??-1)+1),own=set.routes?.[f]?.[rk];
        // trasa poprowadzona ręcznie: źródło -> załamania -> kratka (odcinki proste, dowolne)
        if(Array.isArray(own)){const pts=[[src.x,src.y],...own.filter(p=>Array.isArray(p)&&p.length===2).map(([x,y])=>[+x,+y]),[t.x,t.y]];let len=0,out=false;
          for(let i=1;i<pts.length;i++){const [ax,ay]=pts[i-1],[bx,by]=pts[i],d=Math.hypot(bx-ax,by-ay);len+=d;for(let k=1,n=Math.ceil(d/(c/2));k<n;k++){const x=ax+(bx-ax)*k/n,y=ay+(by-ay)*k/n;if(!inside(f,Math.floor(x/c),Math.floor(y/c)))out=true}}
          const vert=(remote.includes(f)&&riser?(viaMains?0:(shaft?.h||0)+1):0)+(unit.loft&&f===up?.5:0)+.6;len+=vert;t.len=len;t.outside=out;flexLen+=len*t.ducts;maxRun=Math.max(maxRun,len);paths[f].push({kind:t.kind,ducts:t.ducts,pts,key:t.key,rk,manual:true,outside:out});continue}
        const tx=Math.floor(t.x/c),ty=Math.floor(t.y/c);let v=ty*W+tx;if(!Number.isFinite(dist[v])){t.unreach=true;continue}
        const pts=[];while(v>=0){pts.push([(v%W+.5)*c,(Math.floor(v/W)+.5)*c]);const pv=prev[v];if(pv>=0){const ax=v%W,ay=Math.floor(v/W),bx=pv%W,by=Math.floor(pv/W),k=ax===bx?'h:'+ax+':'+Math.max(ay,by):'v:'+Math.max(ax,bx)+':'+ay;bundle[f][k]=(bundle[f][k]||0)+t.ducts}v=pv}
        pts.reverse();pts.unshift([src.x,src.y]);pts.push([t.x,t.y]);let len=0;for(let i=1;i<pts.length;i++)len+=Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]);
        const vert=(remote.includes(f)&&riser?(viaMains?0:(shaft?.h||0)+1):0)+(unit.loft&&f===up?.5:0)+.6;len+=vert;t.len=len;flexLen+=len*t.ducts;maxRun=Math.max(maxRun,len);paths[f].push({kind:t.kind,ducts:t.ducts,pts,key:t.key,rk,corners:corners(pts)})}}
    const mainLen=(viaMains&&shaft?2*(shaft.h+1):0)+(unit.loft?4:2*Math.max(1,isExt(unit.f,Math.floor(unit.x/c),Math.floor(unit.y/c))?1:4))+2;
    // skutki dla budynku
    const ceilA={},screedA={};for(const f of floors){const L=LAYERS[layer[f]];if(!paths[f].length)continue;const cells=new Set();for(const p of paths[f])for(let i=0;i<p.pts.length;i++){const [x,y]=p.pts[i];cells.add(Math.floor(x/c)+','+Math.floor(y/c));if(i){const [ax,ay]=p.pts[i-1],n=Math.ceil(Math.hypot(x-ax,y-ay)/(c/2));for(let k=1;k<n;k++)cells.add(Math.floor((ax+(x-ax)*k/n)/c)+','+Math.floor((ay+(y-ay)*k/n)/c))}}
      if(L.drop){ceilA[f]=cells.size*c*c;const low=[];for(const k of cells){const [x,y]=k.split(',').map(Number),nm=defs[f][idAt(f,x,y)]?.name||'';if(!HALL.test(nm)&&!low.includes(nm))low.push(nm)}
        const hh=f===lo?G.groundHeight:(G.upperHeight||2.6);if(hh-L.drop<2.5&&low.length)add(Math.min(2,.4*low.length),'Sufit podwieszany ('+(f===lo?'parter':'piętro')+') obniża pokoje: '+low.join(', ')+' do '+fmt(hh-L.drop,2)+' m.','Poprowadź kanały przez hol (przesuń centralę albo kratki) albo w stropie / posadzce.','ceiling');
        else good.push('Sufit podwieszany tylko tam, gdzie biegną kanały ('+fmt(ceilA[f],0)+' m²) – pokoje zostają wysokie.')}
      if(L.screed){const tf=L.screedOn==='up'?up:f,A=q.net?.[tf]||0;screedA[tf]=A;add(.3,'Kanały w wylewce: posadzka '+(tf===lo?'parteru':'piętra')+' wyżej o ok. '+fmt(L.screed*100,0)+' cm na całej powierzchni ('+fmt(A,0)+' m²).','Uwzględnij to w wysokości kondygnacji, drzwiach i schodach (wyższy pierwszy stopień).','screed')}}
    if(shaft)add(.5,'Szacht na kanały: ok. '+fmt(shaft.w*100,0)+' × '+fmt(shaft.d*100,0)+' cm przez '+shaft.floors.map(f=>f===lo?'parter':'piętro').join(' i ')+(shaft.room?' ('+shaft.room+')':'')+' – grubsza ściana w tym miejscu.','Najlepiej w ścianie holu, garderoby albo pomieszczenia technicznego, nie w pokoju.','shaft');
    if(maxRun>15)add(Math.min(1.5,(maxRun-15)*.1),'Najdłuższy kanał Ø75 ma ok. '+fmt(maxRun,0)+' m – zalecane do ok. 15 m (opory, hałas, regulacja).','Centrala bliżej środka domu albo druga skrzynka rozdzielcza.','long');
    const outR=Object.values(terms).flat().filter(t=>t.outside);if(outR.length)add(.8,'Trasa poprowadzona ręcznie wychodzi poza dom albo nad otwór w stropie: '+[...new Set(outR.map(t=>t.room))].join(', ')+'.','Przesuń załamania trasy tak, żeby biegła wewnątrz domu.','route');
    const un=Object.values(terms).flat().filter(t=>t.unreach);if(un.length)add(1.5,'Nie da się doprowadzić kanału do: '+[...new Set(un.map(t=>t.room))].join(', ')+' w wybranej warstwie.','Zmień warstwę (np. w stropie zamiast sufitu) albo przesuń kratkę / centralę.','reach');
    if(!unit.loft&&!isExt(unit.f,Math.floor(unit.x/c),Math.floor(unit.y/c)))add(.5,'Centrala nie stoi przy ścianie zewnętrznej – czerpnia i wyrzutnia wymagają dłuższych izolowanych kanałów Ø160.','Przesuń centralę do ściany zewnętrznej pomieszczenia technicznego.','unit');
    const nTerms=Object.values(terms).flat().length,nDucts=Object.values(terms).flat().reduce((a,t)=>a+t.ducts,0);
    good.push(nTerms+' kratek, '+nDucts+' kanałów Ø75, razem ok. '+fmt(flexLen,0)+' m.');
    const cost={flex:Math.round(flexLen*PRICE.flex),main:Math.round(mainLen*PRICE.main),plenum:plenums.length*2*PRICE.plenum,terms:nTerms*PRICE.term,ceiling:Math.round(Object.values(ceilA).reduce((a,b)=>a+b,0)*PRICE.ceilingM2),screed:Math.round(Object.values(screedA).reduce((a,b)=>a+b,0)*PRICE.screedM2),shaft:shaft?Math.round(shaft.h*PRICE.shaftM):0,attic:floors.some(f=>layer[f]==='attic')?Math.round(flexLen*PRICE.insul):0};
    cost.total=Object.values(cost).reduce((a,b)=>a+b,0);
    const score=Math.round(Math.max(0,10-issues.reduce((a,i)=>a+i.p,0))*10)/10;
    return {H,q,floors,layer,layersFor:f=>layersFor(f,q,hasUp),terms,paths,bundle,unit,riser,shaft,plenums,viaMains,throughFloors,rooms,flexLen,mainLen,maxRun,nTerms,nDucts,ceilA,screedA,issues,good,score,cost,lo,up,W,H2:Hh,c}}
  global.HouserDucts={LAYERS,PRICE,layersFor,evaluate};
})(typeof window!=='undefined'?window:globalThis);
