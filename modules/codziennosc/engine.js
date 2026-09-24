// Codzienność – silnik: graf przejść po kratkach rzutu + scenariusze dnia codziennego.
// HouserDaily.evaluate(project, settings) -> {model, scenarios, overall}
// Graf:
//  • węzeł = kratka pomieszczenia (każda kondygnacja osobno) + węzły „na zewnątrz” przy drzwiach zewnętrznych parteru;
//  • w obrębie jednego pomieszczenia ruch swobodny (także po skosie), między pomieszczeniami tylko przez krawędź
//    z 'door' / 'opening' / 'hst'; drzwi / HST / przejście na zewnątrz (poza siatkę, pustą kratkę albo wnękę exteriorVoid) = wyjście;
//  • wyjścia łączą się ze sobą „dookoła domu” (odległość w linii prostej × 1,3 + 2 m na wyjście i wejście);
//  • schody: z project.stairs (geometria z shared/stairs.js: początek biegu na parterze → najbliższa kratka piętra przy końcu biegu)
//    albo – gdy ich brak – kratki pomieszczenia 'schody' / otworu 'schody' na piętrze; koszt = długość biegu + 5 m (wysiłek), liczone jako zmiana piętra.
(function(global){
'use strict';
const PASS={door:1,opening:1,hst:1};
const CLIMB=5, OUT_PEN=1, OUT_FACTOR=1.3, SQ2=Math.SQRT2;

// ---------- role pomieszczeń wg nazwy
const RE={
  garage:/garaż|garaz/i, wardrobe:/garderob/i, laundry:/pralni/i, utility:/techn|kotłown|kotlown|gospodarcz|kotł|kotl/i,
  pantry:/spiżar|spizar/i, kitchen:/kuchni|aneks/i, dining:/jadal/i, living:/salon|dzienn/i, bath:/łazien|lazien/i,
  wc:/(^|[^a-ząćęłńóśźż])wc([^a-ząćęłńóśźż]|$)|toalet/i, entrance:/wiatrołap|wiatrolap|wejści|wejsci|przedsion/i,
  hall:/(^|[^a-ząćęłńóśźż])hol([^a-ząćęłńóśźż]|$)|korytarz|komunikac|przedpok/i, study:/gabinet|biuro|pracowni/i,
  bedroom:/sypial|pokój|pokoj/i, master:/główn|glown|rodzic/i, stairs:/schod|otw[oó]r w strop/i, mezz:/antresol/i, storage:/schowek|skosy|strych|magazyn/i
};
function rolesOf(name){
  const n=String(name||''),r=new Set();for(const k in RE)if(RE[k].test(n))r.add(k);
  if(r.has('garage'))return new Set(['garage']);
  if(r.has('wardrobe'))return new Set(['wardrobe']);
  if(r.has('laundry'))r.delete('bath');
  if(r.has('living')||r.has('study')||r.has('kitchen')||r.has('dining'))r.delete('bedroom');
  if(r.has('bath')||r.has('wc'))r.delete('bedroom');
  if(r.has('bath'))r.delete('wc');
  if(!r.has('bedroom'))r.delete('master');
  if(r.has('hall')||r.has('entrance'))r.delete('stairs');
  return r;
}
const lin=(d,good,bad)=>d<=good?10:d>=bad?0:10*(bad-d)/(bad-good);
const clamp=v=>Math.max(0,Math.min(10,v));
const r1=v=>Math.round(v*10)/10;
const flatState=(project,f)=>{const st=project.state?.[f]||[];return Array.isArray(st[0])?st.flat():st};

// ---------- model
function build(project){
  const ds=project.definitionSnapshot||{},g=project.grid||ds.grid;
  if(!g||!(+g.width>0)||!(+g.height>0))return null;
  const W=+g.width,H=+g.height,c=+g.cellMeters||.5,N=W*H;
  let floors=(ds.floorOrder&&ds.floorOrder.length?ds.floorOrder:['ground','upper']).filter(f=>project.state?.[f]);
  if(!floors.length)return null;
  const F=floors.length,lo=floors[0],def={},st={};
  floors.forEach(f=>{def[f]={};for(const r of ds.floors?.[f]?.rooms||[])def[f][r.id]=r;st[f]=flatState(project,f)});
  let attic=false;try{const e=project.elevationSettings||{},across=HouserModel.slopesAcrossX(e.ridge==='north-south'?'north-south':'east-west',project.orientation?.top);attic=HouserModel.geometry(e,across?W*c:H*c).upperType==='attic'}catch(_){}
  const floorName=fi=>fi===0?'Parter':(F===2?(attic?'Poddasze':'Piętro'):'Piętro '+fi);
  const cellRoom=new Array(F*N).fill(null),holes=floors.map(()=>new Set()),rooms={},list=[];
  floors.forEach((f,fi)=>{const s=st[f];for(let i=0;i<N;i++){const v=s[i];if(!v)continue;const d=def[f][v];if(d&&d.kind==='exteriorVoid')continue;
    if(fi>0&&(v==='pustka'||v==='schody')){holes[fi].add(i);continue}
    const key=f+'|'+v;let r=rooms[key];if(!r){r=rooms[key]={key,f,fi,id:v,name:d?.name||v,color:d?.color||'#e5e7eb',roles:rolesOf(d?.name||v),cells:[],furn:[],nb:new Map(),exits:[]};list.push(r)}
    r.cells.push(i);cellRoom[fi*N+i]=r}});
  for(const r of list){let sx=0,sy=0;for(const i of r.cells){sx+=i%W;sy+=(i/W|0)}r.cx=sx/r.cells.length;r.cy=sy/r.cells.length;
    let best=r.cells[0],bd=1e9;for(const i of r.cells){const d=(i%W-r.cx)**2+((i/W|0)-r.cy)**2;if(d<bd){bd=d;best=i}}r.center=r.fi*N+best;r.area=r.cells.length*c*c}
  // meble -> kotwice (kuchenka, pralka, łóżko, kocioł, kominek…)
  floors.forEach((f,fi)=>{for(const it of project.furniture?.[f]||[]){const x=Math.floor((+it.x+(+it.w||0)/2)/c),y=Math.floor((+it.y+(+it.h||0)/2)/c);if(!(x>=0&&y>=0&&x<W&&y<H))continue;
    const r=cellRoom[fi*N+y*W+x];if(r)r.furn.push({item:String(it.item||''),type:String(it.type||''),node:fi*N+y*W+x})}});
  // krawędzie między pomieszczeniami i wyjścia
  const op=f=>project.openings?.[f]||{};
  const walk=(fi,x,y)=>x>=0&&y>=0&&x<W&&y<H?cellRoom[fi*N+y*W+x]:null;
  const exits=[],exitByNode=new Map();
  // tarasy (x,y,w,h w metrach albo cells)
  const terr=new Set();
  for(const o of project.outdoorStructures||[]){let cells=[];try{cells=HouserModel.outdoorCells(o,c)}catch(_){cells=Array.isArray(o.cells)?o.cells:[]}for(const [x,y] of cells)terr.add(x+','+y)}
  const nearTerr=(x,y)=>{for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(terr.has((x+dx)+','+(y+dy)))return true;return false};
  floors.forEach((f,fi)=>{const O=op(f);
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){const a=walk(fi,x,y);
      for(const [dx,dy,key] of [[1,0,'v:'+(x+1)+':'+y],[0,1,'h:'+x+':'+(y+1)],[-1,0,'v:'+x+':'+y],[0,-1,'h:'+x+':'+y]]){
        const b=walk(fi,x+dx,y+dy),t=O[key];
        if(a&&b&&a!==b&&PASS[t]&&dx+dy>0){a.nb.set(b.key,t);b.nb.set(a.key,t)}
        if(a&&!b&&fi===0&&PASS[t]&&!(holes[fi].has((y+dy)*W+x+dx))){
          const ox=x+dx,oy=y+dy,e={id:exits.length,node:fi*N+y*W+x,room:a,type:t,key,ox,oy,x,y,terrace:nearTerr(ox,oy)};exits.push(e);a.exits.push(e);
          (exitByNode.get(e.node)||exitByNode.set(e.node,[]).get(e.node)).push(e)}}}});
  // łazienka „przy sypialni” (tylko z sypialni / garderoby) = prywatna
  for(const r of list){const ns=[...r.nb.keys()].map(k=>rooms[k]);r.ensuite=(r.roles.has('bath')||r.roles.has('wc'))&&ns.length>0&&ns.every(n=>n.roles.has('bedroom')||n.roles.has('wardrobe'))}
  const isPrivate=r=>r.roles.has('bedroom')||r.roles.has('wardrobe')||r.roles.has('study')||r.ensuite;
  // schody
  const stairLinks=[],stairAdj=new Map(),notes=[];
  const addLink=(a,b,run,how)=>{if(a==null||b==null)return;stairLinks.push({a,b,run,how});for(const [p,q] of [[a,b],[b,a]])(stairAdj.get(p)||stairAdj.set(p,[]).get(p)).push({nb:q,run})};
  const nearestWalk=(fi,px,py,pref)=>{let best=null,bd=1e9;for(let i=0;i<N;i++){const r=cellRoom[fi*N+i];if(!r)continue;const d=Math.hypot(i%W+.5-px,(i/W|0)+.5-py)+(pref?pref(r,i):0);if(d<bd){bd=d;best=fi*N+i}}return bd<6/c+8?best:null};
  const prefUp=r=>isPrivate(r)?2.5:(r.roles.has('hall')||r.roles.has('mezz')?0:.5);
  if(F>=2){
    let fh=2.8;try{fh=HouserModel.geometry(project.elevationSettings||{},W*c).groundHeight+.3||2.8}catch(_){}
    const S=Array.isArray(project.stairs)?project.stairs:[];
    for(const s of S){try{
      const gm=HouserStairs.geometry(s,c,fh);if(!gm.start||!gm.end)continue;
      const a=nearestWalk(0,gm.start[0]/c,gm.start[1]/c),b=nearestWalk(1,gm.end[0]/c,gm.end[1]/c,prefUp);
      addLink(a,b,Math.hypot(gm.end[0]-gm.start[0],gm.end[1]-gm.start[1]),'stairs')}catch(_){}}
    if(!stairLinks.length){
      // bez geometrii: otwór 'schody' na piętrze / pomieszczenie schodów na parterze
      const upSt=project.state&&st[floors[1]],hole=[];for(let i=0;i<N;i++)if(upSt[i]==='schody')hole.push(i);
      const loStair=list.filter(r=>r.fi===0&&(r.id==='schody'||r.roles.has('stairs')));
      if(hole.length){let best=null,bs=1e9;const O=op(floors[1]);
        for(const i of hole){const x=i%W,y=i/W|0;for(const [dx,dy,key] of [[1,0,'v:'+(x+1)+':'+y],[0,1,'h:'+x+':'+(y+1)],[-1,0,'v:'+x+':'+y],[0,-1,'h:'+x+':'+y]]){
          const r=walk(1,x+dx,y+dy);if(!r)continue;const t=O[key],sc=prefUp(r)+(PASS[t]?-2:0)+(t==='window'?5:0);if(sc<bs){bs=sc;best={up:N+(y+dy)*W+x+dx,x,y}}}}
        if(best){let a=cellRoom[best.y*W+best.x]?best.y*W+best.x:null;
          if(a==null){const cand=loStair.length?loStair.flatMap(r=>r.cells):null;let bd=1e9;for(const i of cand||[]){const d=Math.hypot(i%W-best.x,(i/W|0)-best.y);if(d<bd){bd=d;a=i}}
            if(a==null)a=nearestWalk(0,best.x+.5,best.y+.5)}
          addLink(a,best.up,3,'hole')}}
      else if(loStair.length){const r=loStair[0],b=nearestWalk(1,r.cx+.5,r.cy+.5,prefUp);addLink(r.center,b,3,'room')}
    }
    if(!stairLinks.length&&list.some(r=>r.fi>0))notes.push('nostairs');
  }
  const M={project,W,H,c,N,F,floors,lo,floorName,cellRoom,holes,rooms,list,exits,exitByNode,stairLinks,stairAdj,terr,isPrivate,notes,def,st,openings:floors.map(f=>op(f))};
  return M;
}

// ---------- najkrótsza droga (Dijkstra z karą za wejście do „omijanych” pomieszczeń)
function route(M,sources,targets,opts={}){
  const {F,N,W,H,c,cellRoom,exits,exitByNode,stairAdj}=M,T=F*N+exits.length;
  const cost=new Float64Array(T).fill(Infinity),real=new Float64Array(T),prev=new Int32Array(T).fill(-1);
  const tgt=targets instanceof Set?targets:new Set(targets);if(!tgt.size||!sources.length)return null;
  const avoid=opts.avoid||(()=>0),outside=opts.outside!==false,noStairs=!!opts.noStairs;
  const heap=[];const push=(n,k)=>{heap.push([k,n]);let i=heap.length-1;while(i>0){const p=(i-1)>>1;if(heap[p][0]<=heap[i][0])break;[heap[p],heap[i]]=[heap[i],heap[p]];i=p}};
  const pop=()=>{const top=heap[0],last=heap.pop();if(heap.length){heap[0]=last;let i=0;for(;;){const l=2*i+1,r=l+1;let m=i;if(l<heap.length&&heap[l][0]<heap[m][0])m=l;if(r<heap.length&&heap[r][0]<heap[m][0])m=r;if(m===i)break;[heap[m],heap[i]]=[heap[i],heap[m]];i=m}}return top};
  for(const s of sources){if(s.node==null)continue;const k=s.cost||0;if(k<cost[s.node]){cost[s.node]=k;real[s.node]=k;push(s.node,k)}}
  const relax=(u,v,d,pen)=>{const k=cost[u]+d+pen;if(k<cost[v]-1e-9){cost[v]=k;real[v]=real[u]+d;prev[v]=u;push(v,k)}};
  let hit=-1;
  while(heap.length){const [k,u]=pop();if(k>cost[u])continue;if(tgt.has(u)){hit=u;break}
    if(u<F*N){const fi=u/N|0,i=u%N,x=i%W,y=i/W|0,ra=cellRoom[u],O=M.openings[fi];
      for(const [dx,dy,key] of [[1,0,'v:'+(x+1)+':'+y],[0,1,'h:'+x+':'+(y+1)],[-1,0,'v:'+x+':'+y],[0,-1,'h:'+x+':'+y]]){const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=W||ny>=H)continue;
        const v=fi*N+ny*W+nx,rb=cellRoom[v];if(!rb)continue;if(rb===ra)relax(u,v,c,0);else if(PASS[O[key]])relax(u,v,c,avoid(rb)||0)}
      for(const [dx,dy] of [[1,1],[1,-1],[-1,1],[-1,-1]]){const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=W||ny>=H)continue;const v=fi*N+ny*W+nx;
        if(cellRoom[v]===ra&&cellRoom[fi*N+y*W+nx]===ra&&cellRoom[fi*N+ny*W+x]===ra)relax(u,v,c*SQ2,0)}
      for(const e of exitByNode.get(u)||[]){const v=F*N+e.id;if(outside||tgt.has(v))relax(u,v,c/2+OUT_PEN,0)}
      if(!noStairs)for(const s of stairAdj.get(u)||[])relax(u,s.nb,s.run,CLIMB+(avoid(cellRoom[s.nb])||0));
    }else{const e=exits[u-F*N];relax(u,e.node,c/2+OUT_PEN,avoid(e.room)||0);
      if(outside)for(const o of exits){if(o===e)continue;relax(u,F*N+o.id,Math.hypot(o.ox-e.ox,o.oy-e.oy)*c*OUT_FACTOR,0)}}
  }
  if(hit<0)return null;
  const path=[];for(let n=hit;n>=0;n=prev[n])path.push(n);path.reverse();
  return analyze(M,path,real[hit]);
}
function analyze(M,path,dist){
  const {F,N,W,cellRoom,exits}=M,seq=[],doors=[],pts=[];let floors=0,prevFi=null,outside=false;
  const push=it=>{const l=seq[seq.length-1];if(l&&l.kind===it.kind&&l.key===it.key)return;seq.push(it)};
  for(let k=0;k<path.length;k++){const n=path[k];
    if(n<F*N){const fi=n/N|0,i=n%N,r=cellRoom[n];if(prevFi!=null&&fi!==prevFi){floors++;push({kind:'stairs',key:'s'+k})}prevFi=fi;
      push({kind:'room',key:r.key,room:r});pts.push({fi,x:i%W+.5,y:(i/W|0)+.5});
      const p=path[k-1];if(p!=null&&p<F*N&&(p/N|0)===fi&&cellRoom[p]!==r){const pi=p%N,px=pi%W,py=pi/W|0,x=i%W,y=i/W|0;
        const key=px!==x?'v:'+Math.max(px,x)+':'+y:'h:'+x+':'+Math.max(py,y);doors.push({fi,key,type:M.openings[fi][key]})}}
    else{const e=exits[n-F*N];outside=true;push({kind:'out',key:'out'});pts.push({fi:0,x:e.ox+.5,y:e.oy+.5,out:true,exit:e});doors.push({fi:0,key:e.key,type:e.type,exit:e});prevFi=0}}
  const roomsSeq=seq.filter(s=>s.kind==='room').map(s=>s.room);
  const first=seq[0],last=seq[seq.length-1];
  const crossed=seq.filter((s,i)=>s.kind==='room'&&s!==first&&s!==last).map(s=>s.room);
  return {dist,floors,seq,doors,pts,rooms:roomsSeq,crossed,outside,start:first,end:last,exitUsed:doors.filter(d=>d.exit).map(d=>d.exit)};
}

// ---------- scenariusze
const SCEN=[
  {id:'zakupy',name:'Zakupy',desc:'Wnoszenie zakupów od wejścia (albo z garażu) do kuchni i spiżarni.',w:1},
  {id:'pranie',name:'Pranie',desc:'Brudne ubrania z sypialni i łazienki do pralni, suszenie, czyste do szaf.',w:1},
  {id:'kociol',name:'Palenie w kotle',desc:'Opał z ogrodu lub garażu do kotłowni / pomieszczenia technicznego.',w:0.5},
  {id:'kominek',name:'Palenie w kominku',desc:'Drewno z zewnątrz do kominka.',w:0.5},
  {id:'goscie',name:'Goście',desc:'Od drzwi do WC i do salonu – bez wchodzenia do strefy prywatnej.',w:1},
  {id:'noc',name:'Noc',desc:'Z każdej sypialni do najbliższej łazienki lub WC.',w:1.5},
  {id:'poranek',name:'Poranek',desc:'Sypialnia → łazienka → kuchnia → wyjście z domu.',w:1},
  {id:'gotowanie',name:'Gotowanie i podawanie',desc:'Kuchnia ↔ jadalnia ↔ salon – noszenie talerzy.',w:1},
  {id:'ogrod',name:'Ogród i grill',desc:'Z kuchni na taras / do ogrodu.',w:0.5},
  {id:'smieci',name:'Wynoszenie śmieci',desc:'Z kuchni na zewnątrz.',w:0.5},
  {id:'gabinet',name:'Praca w domu',desc:'Cisza w gabinecie – z dala od salonu i kuchni.',w:0.5}
];

function evaluate(project,settings){
  const M=build(project);if(!M)return null;
  const S=settings||{},off=S.off||{},wset=S.w||{};
  const {list,exits,N}=M;
  const has=(r,role)=>r.roles.has(role);
  const byRole=role=>list.filter(r=>has(r,role));
  const cat=r=>M.isPrivate(r)?'private':(has(r,'living')||has(r,'dining')||has(r,'mezz'))?'living':has(r,'kitchen')?'kitchen':'other';
  const anchor=(r,kind)=>{
    const pick=re=>{const f=r.furn.find(x=>re.test(x.item));return f?f.node:null};
    let n=null;
    if(kind==='kitchen')n=pick(/^k_(plyta|zlew|dolne|lodowka|wysokie|wyspa|narozne)/);
    else if(kind==='laundry')n=pick(/pralk|suszar/);
    else if(kind==='boiler')n=pick(/kociol|kocioł|piec/);
    else if(kind==='bed'){const f=r.furn.find(x=>x.type==='bed');n=f?f.node:null}
    else if(kind==='dining')n=pick(/^k_stol/);
    else if(kind==='fire')n=pick(/kominek|koza|fireplace/);
    else if(kind==='living')n=pick(/^s_(naroznik|sofa)/);
    return n!=null?n:r.center};
  const src=n=>[{node:n,cost:0}];
  const exitNodes=es=>es.map(e=>M.F*N+e.id);
  const exitSrc=es=>es.map(e=>({node:M.F*N+e.id,cost:0}));
  const leg=(from,to,r,extra)=>Object.assign({from,to,r},extra||{});
  const fmt=v=>(Math.round(v*10)/10).toLocaleString('pl-PL',{maximumFractionDigits:1});
  // kary za omijanie: strefa prywatna mocno, salon lekko (ludzie wybierają drogę przez hol, jeśli jest)
  const AV=(opt={})=>r=>{if(opt.except&&opt.except.has(r.key))return 0;const k=cat(r);return k==='private'?(opt.priv??12):k==='living'?(opt.living??2):k==='kitchen'?(opt.kitchen??0):0};
  const lo0=arr=>arr.slice().sort((a,b)=>a.fi-b.fi||b.area-a.area);
  const kitchens=lo0(byRole('kitchen')),kitchen=kitchens[0];
  const livings=lo0(byRole('living')),living=livings[0];
  const baths=list.filter(r=>has(r,'bath')||has(r,'wc'));
  const bedrooms=byRole('bedroom');
  const master=bedrooms.find(r=>has(r,'master'))||bedrooms.slice().sort((a,b)=>b.area-a.area)[0];
  const garage=byRole('garage')[0];
  const nonGarageExits=exits.filter(e=>!has(e.room,'garage'));
  const doorPref=[e=>e.type==='door'&&has(e.room,'entrance'),e=>e.type==='door'&&has(e.room,'hall'),e=>e.type==='door'&&!has(e.room,'garage')&&!has(e.room,'utility'),e=>!has(e.room,'garage'),()=>true];
  let front=[];for(const p of doorPref){front=exits.filter(p);if(front.length)break}
  const frontIds=new Set(front.map(e=>e.id));
  let garden=exits.filter(e=>!has(e.room,'garage')&&!frontIds.has(e.id));
  const gardenOnlyFront=!garden.length;if(!garden.length)garden=nonGarageExits.length?nonGarageExits:exits;
  const terraceExits=exits.filter(e=>e.terrace&&!has(e.room,'garage'));
  // garaż połączony z domem?
  let garageIn=null;if(garage&&kitchen){const r=route(M,src(garage.center),[anchor(kitchen,'kitchen')],{outside:false,avoid:AV()});if(r)garageIn=r}
  const names=rs=>[...new Set(rs.map(r=>r.name))];
  const out=[];
  const verdict=s=>s>=7.5?'ok':s>=5?'warn':'bad';

  const mk=(def)=>({id:def.id,name:def.name,desc:def.desc,weight:wset[def.id]!=null&&isFinite(+wset[def.id])?+wset[def.id]:def.w,enabled:!off[def.id],why:[],hints:[],legs:[],applicable:true,score:null});
  const na=(s,reason,hint)=>{s.applicable=false;s.reason=reason;if(hint)s.hints.push(hint);return s};
  const crossCats=r=>{const o={private:[],living:[],kitchen:[],other:[]};for(const x of r.crossed)o[cat(x)].push(x);return o};
  const noExit='Na rzucie parteru nie ma drzwi zewnętrznych ani HST.';

  for(const def of SCEN){const s=mk(def);out.push(s);
    try{
    if(def.id==='zakupy'){
      if(!kitchen){na(s,'Brak kuchni na rzucie.');continue}
      const kA=anchor(kitchen,'kitchen');
      const cand=[];
      if(front.length){const r=route(M,exitSrc(front),[kA],{avoid:AV({living:3})});if(r)cand.push({r,from:'Wejście',how:'front'})}
      if(garageIn)cand.push({r:garageIn,from:garage.name,how:'garage'});
      if(!cand.length){na(s,exits.length?'Nie da się dojść do kuchni.':noExit);continue}
      const sc=c=>{const x=crossCats(c.r);return lin(c.r.dist,7,25)-3*c.r.floors-(x.living.length?1.5:0)-(x.private.length?3:0)};
      cand.sort((a,b)=>sc(b)-sc(a));const best=cand[0],x=crossCats(best.r);let score=sc(best);
      s.legs.push(leg(best.from,kitchen.name,best.r));
      s.why.push(best.how==='garage'?'Z garażu do kuchni przez dom: {n} m.'.replace('{n}',fmt(best.r.dist)):'Od drzwi wejściowych do kuchni: {n} m.'.replace('{n}',fmt(best.r.dist)));
      if(best.r.dist<=7)s.why.push('Kuchnia blisko wejścia – zakupy od razu na blat.');
      if(best.r.floors)s.why.push('Kuchnia jest na innej kondygnacji niż wejście.');
      if(x.living.length){s.why.push('Zakupy niesione przez salon lub jadalnię.');s.hints.push('Zaprojektuj przejście z holu do kuchni omijające salon.')}
      if(x.private.length){s.why.push('Trasa prowadzi przez pokój prywatny.');s.hints.push('Połącz kuchnię z holem – bez przechodzenia przez pokoje.')}
      if(garage&&!garageIn){score-=.5;s.why.push('Garaż nie ma wejścia do domu.');s.hints.push('Dodaj drzwi z garażu do domu (np. przez pomieszczenie gospodarcze) – zakupy z auta od razu do kuchni.')}
      if(garageIn&&best.how==='garage')s.why.push('Garaż połączony z domem – nie trzeba wychodzić na deszcz.');
      const pan=byRole('pantry');
      if(pan.length){const r=route(M,src(kA),pan.map(p=>p.center),{avoid:AV()});if(r){s.legs.push(leg(kitchen.name,r.end.room?.name||pan[0].name,r));
        if(r.dist<=4){score+=.5;s.why.push('Spiżarnia tuż przy kuchni.')}else if(r.dist>8){score-=1;s.why.push('Spiżarnia daleko od kuchni: {n} m.'.replace('{n}',fmt(r.dist)));s.hints.push('Przenieś spiżarnię bliżej kuchni.')}}}
      else s.hints.push('Dodaj spiżarnię lub schowek przy kuchni – zapasy będą pod ręką.');
      if(best.r.dist>12)s.hints.push('Przybliż kuchnię do wejścia albo dodaj wejście gospodarcze przy kuchni.');
      s.score=score;s.dist=best.r.dist;
    }
    else if(def.id==='pranie'){
      let L=byRole('laundry'),mode='laundry';
      if(!L.length){L=byRole('utility');mode='utility'}
      if(!L.length){L=baths.filter(b=>has(b,'bath'));mode='bath'}
      if(!L.length){na(s,'Brak pralni, pomieszczenia technicznego i łazienki.');continue}
      if(!bedrooms.length){na(s,'Brak sypialni na rzucie.');continue}
      // wybierz pralnię najbliżej sypialni
      let best=null;
      for(const l of L){const la=anchor(l,'laundry');let sum=0,ok=0,legs=[];
        for(const b of bedrooms){const r=route(M,src(anchor(b,'bed')),[la],{avoid:AV({except:new Set([l.key])})});if(r){sum+=r.dist;ok++;legs.push({b,r})}}
        if(ok&&(!best||sum/ok<best.avg))best={l,la,avg:sum/ok,legs}}
      if(!best){na(s,'Nie da się dojść z sypialni do pralni.');continue}
      const {l,la}=best;
      if(mode==='utility')s.why.push('Brak pralni – zakładam pralkę w pomieszczeniu technicznym.');
      if(mode==='bath')s.why.push('Brak pralni – zakładam pralkę w łazience.');
      const mLeg=best.legs.find(x=>x.b===master)||best.legs[0];
      s.legs.push(leg(mLeg.b.name,l.name,mLeg.r,{note:'brudne'}));
      // łazienka rodzinna najbliżej sypialni -> pralnia
      const fam=mode==='bath'?[]:baths.filter(b=>has(b,'bath')&&b!==l&&b.fi===mLeg.b.fi);let dB=null;
      if(fam.length){const rb=route(M,src(anchor(mLeg.b,'bed')),fam.map(b=>b.center),{avoid:AV()});if(rb&&rb.end.room){const r2=route(M,src(rb.end.room.center),[la],{avoid:AV({except:new Set([l.key])})});if(r2){dB=r2.dist;s.legs.push(leg(rb.end.room.name,l.name,r2))}}}
      const dirty=dB!=null?(best.avg+dB)/2:best.avg;
      // suszenie: na zewnątrz
      let dD=null,rD=null;if(exits.length){rD=route(M,src(la),exitNodes(garden),{avoid:AV({living:4})});if(rD){dD=rD.dist;s.legs.push(leg(l.name,rD.exitUsed.at(-1)?.terrace?'Taras':'Ogród',rD,{note:'suszenie'}))}}
      // czyste: do garderoby / sypialni głównej
      const wards=byRole('wardrobe');let dC=best.avg,rC=null;
      if(wards.length){rC=route(M,src(la),wards.map(w=>w.center),{avoid:AV({except:new Set(wards.map(w=>w.key))})});if(rC){dC=rC.dist;s.legs.push(leg(l.name,rC.end.room.name,rC,{note:'czyste'}))}}
      let score=lin((dirty+dC)/2,5,24);
      s.why.push('Średnio {n} m z sypialni do pralni.'.replace('{n}',fmt(best.avg)));
      const upB=bedrooms.filter(b=>b.fi!==l.fi).length;
      if(upB){score-=1.5*Math.min(1,upB/bedrooms.length*1.5);s.why.push('Pralnia jest na innej kondygnacji niż sypialnie – kosz z praniem po schodach.');s.hints.push('Przenieś pralnię na piętro obok sypialni (albo zaplanuj zrzutnię na pranie).')}
      else s.why.push('Pralnia na tej samej kondygnacji co sypialnie.');
      if(mLeg.r.crossed.some(r=>cat(r)==='living')){score-=1;s.why.push('Pranie niesione przez salon lub jadalnię.');s.hints.push('Zaplanuj pralnię przy holu sypialni, a nie za salonem.')}
      if(dD!=null){if(l.exits.length){score+=.5;s.why.push('Pralnia ma własne wyjście na zewnątrz – szybko rozwiesisz pranie.')}
        else if(dD<=5)score+=.3;
        else if(dD>12){score-=1;s.why.push('Do suszenia na zewnątrz daleko: {n} m.'.replace('{n}',fmt(dD)));s.hints.push('Dodaj drzwi z pralni do ogrodu lub na taras – do suszenia prania.')}
        if(rD.floors){score-=.5;s.why.push('Suszenie na zewnątrz wymaga zejścia po schodach – przyda się suszarka lub balkon.')}}
      if(mode==='bath'){score-=1;s.hints.push('Wydziel pralnię (choćby 2–3 m²) – pranie nie będzie blokować łazienki.')}
      if(!wards.length)s.hints.push('Garderoba obok sypialni skróci drogę z czystym praniem.');
      s.score=score;s.dist=best.avg;
    }
    else if(def.id==='kociol'){
      let U=list.filter(r=>r.furn.some(f=>/kociol|piec/.test(f.item)));if(!U.length)U=byRole('utility');
      if(!U.length){na(s,'Brak kotłowni / pomieszczenia technicznego. Jeśli ogrzewasz pompą ciepła – scenariusz nie dotyczy.');continue}
      if(!exits.length){na(s,noExit);continue}
      const u=U[0],ua=anchor(u,'boiler');
      const r=route(M,exitSrc(exits),[ua],{avoid:AV({priv:15,living:6,kitchen:2,except:new Set([u.key])})});
      if(!r){na(s,'Nie da się dojść do kotłowni.');continue}
      s.legs.push(leg(r.exitUsed[0]&&has(r.exitUsed[0].room,'garage')?garage.name:'Na zewnątrz',u.name,r,{note:'opał'}));
      let score=lin(r.dist,4,20);const x=crossCats(r);
      s.why.push('Z zewnątrz do kotłowni: {n} m.'.replace('{n}',fmt(r.dist)));
      if(u.exits.length){score+=1;s.why.push('Kotłownia ma własne drzwi na zewnątrz – opał wnosisz bez chodzenia po domu.')}
      else s.hints.push('Dodaj drzwi zewnętrzne do kotłowni (albo przejście z garażu).');
      if(r.exitUsed.some(e=>has(e.room,'garage')))s.why.push('Opał można trzymać w garażu – wejście do kotłowni przez garaż.');
      if(x.living.length){score-=3;s.why.push('Opał niesiony przez salon lub jadalnię – brud i pył.')}
      if(x.private.length){score-=3;s.why.push('Opał niesiony przez pokój prywatny.')}
      if(x.kitchen.length){score-=1;s.why.push('Opał niesiony przez kuchnię.')}
      if(r.floors){score-=3;s.why.push('Kotłownia na innej kondygnacji niż wejście.')}
      if(x.living.length||x.private.length||x.kitchen.length)s.hints.push('Przenieś kotłownię do ściany zewnętrznej, obok garażu lub wejścia gospodarczego.');
      const ch=M.project.structure?.chimney||[];
      if(ch.length){const W=M.W,near=ch.some(k=>{const x0=k%W,y0=k/W|0;return [[0,0],[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>{const n=(y0+dy)*W+x0+dx;return M.cellRoom[n]===u})});
        if(!near){score-=1;s.why.push('Komin nie przylega do kotłowni.');s.hints.push('Kocioł na paliwo stałe potrzebuje komina – dodaj przewód przy kotłowni.')}
        else s.why.push('Komin przy kotłowni.')}
      else s.hints.push('Kocioł na paliwo stałe potrzebuje komina – dodaj przewód przy kotłowni.');
      s.score=score;s.dist=r.dist;
    }
    else if(def.id==='kominek'){
      let fire=null,fr=null;for(const r of list){const f=r.furn.find(x=>/kominek|koza|fireplace/.test(x.item));if(f){fire=f.node;fr=r;break}}
      if(fire==null){const ch=M.project.structure?.chimney||[];for(const k of ch){const r=M.cellRoom[k];if(r&&(has(r,'living')||has(r,'dining'))){fire=k;fr=r;break}}}
      if(fire==null){na(s,'Brak kominka (mebel „Kominek / koza” albo komin w salonie).');continue}
      if(!exits.length){na(s,noExit);continue}
      const r=route(M,exitSrc(exits),[fire],{avoid:AV({priv:15,living:0,except:new Set([fr.key])})});
      if(!r){na(s,'Nie da się dojść do kominka.');continue}
      s.legs.push(leg('Na zewnątrz',fr.name,r,{note:'drewno'}));
      let score=lin(r.dist,5,20);const x=crossCats(r);
      s.why.push('Z zewnątrz do kominka: {n} m.'.replace('{n}',fmt(r.dist)));
      const eu=r.exitUsed[0];if(eu&&eu.room===fr)s.why.push('Drewno wniesiesz prosto z tarasu lub ogrodu.');
      if(x.private.length){score-=3;s.why.push('Drewno niesione przez pokój prywatny.')}
      if(r.floors){score-=3;s.why.push('Kominek na innej kondygnacji niż wejście.')}
      if(score<7)s.hints.push('Zaplanuj miejsce na drewno przy wyjściu na taras lub tuż przy kominku.');
      s.score=score;s.dist=r.dist;
    }
    else if(def.id==='goscie'){
      if(!front.length){na(s,noExit);continue}
      const wcs=baths.filter(b=>has(b,'wc')&&!b.ensuite),pub=baths.filter(b=>!b.ensuite);
      let T=wcs.filter(b=>b.fi===0);if(!T.length)T=pub.filter(b=>b.fi===0);if(!T.length)T=pub;if(!T.length)T=baths;
      let s1=null,s2=null;
      if(T.length){const r=route(M,exitSrc(front),T.map(b=>b.center),{avoid:AV({priv:25,except:new Set(T.map(b=>b.key))})});
        if(r){const b=r.end.room,x=crossCats(r);s.legs.push(leg('Wejście',b.name,r,{note:'WC'}));s1=lin(r.dist,5,16)-3*r.floors;
          s.why.push('Od drzwi do toalety: {n} m.'.replace('{n}',fmt(r.dist)));
          if(x.private.length||b.ensuite){s1-=4;s.why.push('Goście przechodzą przez strefę prywatną.');s.hints.push('Dodaj WC dla gości dostępne z holu, przy wejściu.')}
          if(r.floors){s.why.push('Toaleta dla gości jest na innej kondygnacji.');s.hints.push('Dodaj WC dla gości na parterze, przy wejściu.')}
          if(!has(b,'wc')){s1-=.5;s.hints.push('Osobne WC przy wejściu odciąży łazienkę domowników.')}
          else if(r.dist<=6)s.why.push('WC dla gości blisko wejścia.')}}
      else{s1=0;s.why.push('Brak łazienki i WC.');s.hints.push('Dodaj WC dla gości przy wejściu.')}
      if(living){const r=route(M,exitSrc(front),[anchor(living,'living')],{avoid:AV({priv:25,living:0})});
        if(r){const x=crossCats(r);s.legs.push(leg('Wejście',living.name,r));s2=lin(r.dist,6,18)-3*r.floors;s.why.push('Od drzwi do salonu: {n} m.'.replace('{n}',fmt(r.dist)));
          if(x.private.length){s2-=4;s.why.push('Droga do salonu prowadzi przez pokój prywatny.')}}}
      if(front.some(e=>has(e.room,'living'))&&!byRole('entrance').length){s2=(s2??10)-1;s.why.push('Wejście prosto do salonu – brak wiatrołapu.');s.hints.push('Wydziel wiatrołap przy drzwiach wejściowych – na kurtki i buty gości.')}
      if(s1==null&&s2==null){na(s,'Nie da się dojść do WC ani salonu.');continue}
      s.score=s1!=null&&s2!=null?.6*s1+.4*s2:(s1??s2);s.dist=s.legs[0]?.r.dist;
    }
    else if(def.id==='noc'){
      if(!bedrooms.length){na(s,'Brak sypialni na rzucie.');continue}
      if(!baths.length){na(s,'Brak łazienki i WC na rzucie.','Dodaj łazienkę przy sypialniach.');continue}
      const sc=[];let worst=null;
      for(const b of bedrooms){const own=baths.filter(x=>!x.ensuite||x.nb.has(b.key));
        const r=route(M,src(anchor(b,'bed')),own.map(x=>x.center),{avoid:AV({priv:8,living:3,except:new Set(own.map(x=>x.key))})});
        if(!r){sc.push(0);s.legs.push(leg(b.name,'Łazienka',null));continue}
        const x=crossCats(r);let v=lin(r.dist,5,16)-4*r.floors-(x.living.length?2:0)-(x.private.length?2:0);
        s.legs.push(leg(b.name,r.end.room.name,r));sc.push(clamp(v));if(!worst||v<worst.v)worst={v,b,r,x}}
      const mean=sc.reduce((a,b)=>a+b,0)/sc.length,min=Math.min(...sc);
      s.score=.7*mean+.3*min;s.dist=worst?worst.r.dist:null;
      const ens=bedrooms.filter(b=>baths.some(x=>x.nb.has(b.key)));
      if(ens.length)s.why.push('Łazienka bezpośrednio przy sypialni: {n}.'.replace('{n}',ens.length));
      if(worst){s.why.push('Najdalej: {n} m do łazienki.'.replace('{n}',fmt(worst.r.dist)));
        if(worst.r.floors){s.why.push('Z sypialni do łazienki trzeba zejść po schodach – niebezpieczne w nocy.');s.hints.push('Dodaj łazienkę lub WC na kondygnacji sypialni.')}
        if(worst.x.living.length){s.why.push('Nocą przez salon – ktoś tam może siedzieć, a przejście jest długie.');s.hints.push('Połącz sypialnie z łazienką wspólnym holem.')}
        if(worst.x.private.length){s.why.push('Do łazienki przez inny pokój.');s.hints.push('Połącz sypialnie z łazienką wspólnym holem.')}
        if(worst.r.dist>10&&!worst.r.floors)s.hints.push('Zbliż łazienkę do sypialni.')}
      if(master&&!ens.includes(master)&&bedrooms.length>1)s.hints.push('Rozważ łazienkę przy sypialni głównej.');
    }
    else if(def.id==='poranek'){
      if(!bedrooms.length||!kitchen||!baths.length){na(s,'Potrzebne: sypialnia, łazienka i kuchnia.');continue}
      const b=master,own=baths.filter(x=>!x.ensuite||x.nb.has(b.key));
      const r1_=route(M,src(anchor(b,'bed')),own.map(x=>x.center),{avoid:AV({except:new Set(own.map(x=>x.key))})});
      if(!r1_){na(s,'Nie da się dojść z sypialni do łazienki.');continue}
      const kA=anchor(kitchen,'kitchen'),r2=route(M,src(r1_.end.room.center),[kA],{avoid:AV({living:1})});
      if(!r2){na(s,'Nie da się dojść do kuchni.');continue}
      s.legs.push(leg(b.name,r1_.end.room.name,r1_),leg(r1_.end.room.name,kitchen.name,r2));
      let r3=null,to='Wyjście';
      if(garageIn){r3=route(M,src(kA),[garage.center],{outside:false,avoid:AV({living:1})});to=garage.name}
      if(!r3&&front.length)r3=route(M,src(kA),exitNodes(front),{avoid:AV({living:1})});
      if(r3)s.legs.push(leg(kitchen.name,to,r3));
      const tot=r1_.dist+r2.dist+(r3?r3.dist:0),fl=r1_.floors+r2.floors+(r3?r3.floors:0);
      let score=lin(tot,15,50);
      s.why.push('Cała poranna trasa: {n} m.'.replace('{n}',fmt(tot)));
      if(fl>1){score-=fl>2?2:1;s.why.push('Rano kilka razy po schodach.');s.hints.push('Łazienka na kondygnacji sypialni oszczędzi chodzenia rano po schodach.')}
      const x=[...r1_.crossed,...r2.crossed].filter(r=>cat(r)==='private');
      if(x.length){score-=1.5;s.why.push('Poranna trasa prowadzi przez cudzy pokój.')}
      if(!r3)s.why.push('Nie znaleziono wyjścia z domu.');
      if(tot>30)s.hints.push('Sypialnie, łazienka i kuchnia daleko od siebie – skróć hol albo przybliż kuchnię do schodów.');
      s.score=score;s.dist=tot;
    }
    else if(def.id==='gotowanie'){
      if(!kitchen){na(s,'Brak kuchni na rzucie.');continue}
      const kA=anchor(kitchen,'kitchen');let dining=has(kitchen,'dining')?kitchen:lo0(byRole('dining'))[0];
      let dA=null;
      if(!dining){const t=list.find(r=>(has(r,'living')||has(r,'kitchen'))&&r.furn.some(f=>/^k_stol/.test(f.item)));if(t){dining=t;s.why.push('Brak osobnej jadalni – stół w kuchni lub salonie.')}}
      if(!dining&&living){dining=living;s.why.push('Brak jadalni – zakładam stół w salonie.')}
      if(!dining){na(s,'Brak jadalni i salonu.');continue}
      dA=anchor(dining,'dining');
      const r=route(M,src(kA),[dA],{avoid:AV({living:0})});if(!r){na(s,'Nie da się dojść z kuchni do jadalni.');continue}
      s.legs.push(leg(kitchen.name,dining.name,r,{note:'talerze'}));
      let s1=lin(r.dist,3,12)-4*r.floors;
      s.why.push('Z kuchni do stołu: {n} m.'.replace('{n}',fmt(r.dist)));
      const t=kitchen.nb.get(dining.key);if(dining===kitchen)s.why.push('Stół w kuchni – wszystko pod ręką.');else if(t==='opening')s.why.push('Kuchnia otwarta na jadalnię.');
      if(r.crossed.some(x=>has(x,'hall')||has(x,'entrance'))){s1-=1.5;s.why.push('Talerze noszone przez hol.');s.hints.push('Połącz kuchnię bezpośrednio z jadalnią (drzwi lub otwarte przejście).')}
      if(r.floors)s.hints.push('Jadalnia powinna być na tej samej kondygnacji co kuchnia.');
      let s2=null;
      if(living&&living!==dining){const r2=route(M,src(dA),[anchor(living,'living')],{avoid:AV({living:0})});if(r2){s.legs.push(leg(dining.name,living.name,r2));s2=lin(r2.dist,4,14)-3*r2.floors;
        s.why.push('Ze stołu do salonu: {n} m.'.replace('{n}',fmt(r2.dist)));if(r2.dist>10)s.hints.push('Zbliż jadalnię do salonu – strefa dzienna będzie spójna.')}}
      if(r.dist>8)s.hints.push('Przenieś stół bliżej kuchni.');
      s.score=s2!=null?.65*s1+.35*s2:s1;s.dist=r.dist;
    }
    else if(def.id==='ogrod'){
      if(!kitchen){na(s,'Brak kuchni na rzucie.');continue}
      if(!exits.length){na(s,noExit);continue}
      const kA=anchor(kitchen,'kitchen'),T=terraceExits.length?terraceExits:garden;
      const r=route(M,src(kA),exitNodes(T),{avoid:AV({priv:15,living:0})});
      if(!r){na(s,'Nie da się wyjść z kuchni na zewnątrz.');continue}
      const eu=r.exitUsed.at(-1);s.legs.push(leg(kitchen.name,eu&&eu.terrace?'Taras':'Ogród',r));
      let score=lin(r.dist,5,20);const x=crossCats(r);
      s.why.push('Z kuchni na zewnątrz: {n} m.'.replace('{n}',fmt(r.dist)));
      if(eu&&(eu.room===kitchen||has(eu.room,'dining')))s.why.push('Wyjście na zewnątrz prosto z kuchni lub jadalni.');
      if(!terraceExits.length){score-=1;s.hints.push('Dodaj taras przy wyjściu z kuchni lub jadalni.')}else s.why.push('Przy wyjściu jest taras.');
      if(gardenOnlyFront){score-=1.5;s.why.push('Brak wyjścia do ogrodu – tylko drzwi wejściowe.');s.hints.push('Dodaj drzwi tarasowe (HST) w strefie dziennej.')}
      if(x.private.length){score-=3;s.why.push('Do ogrodu przez pokój prywatny.')}
      if(r.floors){score-=3;s.why.push('Kuchnia na innej kondygnacji niż wyjście.')}
      if(r.dist>10)s.hints.push('Dodaj wyjście na taras bliżej kuchni.');
      s.score=score;s.dist=r.dist;
    }
    else if(def.id==='smieci'){
      if(!kitchen){na(s,'Brak kuchni na rzucie.');continue}
      if(!exits.length){na(s,noExit);continue}
      const kA=anchor(kitchen,'kitchen'),T=exits.filter(e=>e.type==='door');
      const r=route(M,src(kA),exitNodes(T.length?T:exits),{avoid:AV({priv:15,living:3})});
      if(!r){na(s,'Nie da się wyjść z kuchni na zewnątrz.');continue}
      s.legs.push(leg(kitchen.name,'Na zewnątrz',r,{note:'śmieci'}));
      let score=lin(r.dist,5,18);const x=crossCats(r);
      s.why.push('Z kuchni do drzwi: {n} m.'.replace('{n}',fmt(r.dist)));
      if(x.living.length){score-=1;s.why.push('Śmieci niesione przez salon lub jadalnię.')}
      if(x.private.length){score-=3;s.why.push('Śmieci niesione przez pokój prywatny.')}
      if(r.floors)score-=3;
      if(r.dist>9||x.living.length)s.hints.push('Wyjście gospodarcze przy kuchni (lub przez spiżarnię) ułatwi wynoszenie śmieci.');
      s.score=score;s.dist=r.dist;
    }
    else if(def.id==='gabinet'){
      const st=byRole('study');if(!st.length){na(s,'Brak gabinetu na rzucie.','Jeśli pracujesz w domu – wydziel gabinet z dala od salonu.');continue}
      const g=st[0];const ref=[living,kitchen].filter(Boolean);
      if(!ref.length){na(s,'Brak salonu i kuchni – nie ma od czego mierzyć ciszy.');continue}
      const r=route(M,src(g.center),ref.map(x=>x.center),{avoid:AV({priv:0,living:0})});
      if(!r){na(s,'Nie da się dojść z gabinetu do salonu.');continue}
      s.legs.push(leg(g.name,r.end.room.name,r));
      let score=10*Math.max(0,Math.min(1,(r.dist-2)/7))+(r.floors?2:0);
      s.why.push('Z gabinetu do strefy dziennej: {n} m.'.replace('{n}',fmt(r.dist)));
      const nbT=ref.map(x=>g.nb.get(x.key)).filter(Boolean);
      if(nbT.includes('opening')){score-=3;s.why.push('Gabinet otwarty na strefę dzienną – brak ciszy.');s.hints.push('Oddziel gabinet drzwiami od salonu.')}
      else if(nbT.length){score-=1;s.why.push('Gabinet ma drzwi prosto do salonu lub kuchni.');s.hints.push('Wejście do gabinetu z holu, a nie z salonu, da więcej ciszy.')}
      if(r.floors)s.why.push('Gabinet na innej kondygnacji niż salon – ciszej.');
      if(front.length){const r2=route(M,exitSrc(front),[g.center],{avoid:AV({priv:0})});if(r2&&r2.dist<=6&&!r2.floors){score+=.5;s.why.push('Blisko wejścia – interesant nie przechodzi przez dom.')}}
      if(score<5)s.hints.push('Przenieś gabinet dalej od salonu i kuchni.');
      s.score=score;s.dist=r.dist;
    }
    }catch(err){console.error(err);na(s,'Nie udało się policzyć tego scenariusza.')}
  }
  for(const s of out){if(s.score!=null){s.score=r1(clamp(s.score));s.verdict=verdict(s.score);if(s.score>=9.5)s.hints=[]}
    s.hints=[...new Set(s.hints)];s.why=[...new Set(s.why)];
    const rs=s.legs.filter(l=>l.r);s.floors=rs.reduce((a,l)=>a+l.r.floors,0);
    s.private=names(rs.flatMap(l=>l.r.crossed.filter(r=>M.isPrivate(r))));}
  const act=out.filter(s=>s.enabled&&s.applicable&&s.weight>0);
  const wsum=act.reduce((a,s)=>a+s.weight,0);
  const overall=wsum?r1(act.reduce((a,s)=>a+s.score*s.weight,0)/wsum):null;
  return {model:M,scenarios:out,overall,verdict:overall==null?null:verdict(overall),count:act.length};
}
global.HouserDaily={evaluate,build,route,rolesOf,SCEN};
})(window);
