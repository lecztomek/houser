// Działka: wymiary, położenie domu, nawierzchnie (podjazd, chodniki, żwir, rabaty), drzewa, ogrodzenie, garaż (moduł Garaż).
// HouserSite.evaluate(project) -> {set, plot, house, garage, cells, areas, setbacks, links, parking, issues, good, score, cost}
// Ustawienia: project.site = {w, d (m), road:'bottom'|'top'|'left'|'right', hx, hy (m – lewy górny róg siatki domu na działce),
//   cells:{'i,j':'drive'|'parking'|'path'|'gravel'|'bed'} (kratki 0,5 m działki; reszta – trawa), trees:[{x,y,k:'tree'|'pine'|'shrub'}],
//   fence:'panel'|'hedge'|'none', gate:m (środek bramy wzdłuż ulicy), pbcMin:%, coverMax:%}
// Wymaga: shared/quantities.js; opcjonalnie modules/garaz/engine.js.
(function(global){
  const C=.5;
  const SURF={drive:{name:'Podjazd (kostka)',color:'#a8a29e',price:210},parking:{name:'Miejsce postojowe (kostka)',color:'#c4b8a8',price:190},path:{name:'Chodnik',color:'#d6cfc4',price:170},gravel:{name:'Żwir / grys',color:'#e7dcc5',price:70},bed:{name:'Rabata / krzewy',color:'#86a35a',price:90}};
  const FENCE={panel:{name:'Ogrodzenie panelowe',m:230},hedge:{name:'Żywopłot',m:90},none:{name:'Bez ogrodzenia',m:0}};
  const PRICE={lawnM2:18,gate:6500,wicket:1800,tree:350};
  const ROAD={bottom:'od dołu rzutu',top:'od góry rzutu',left:'z lewej',right:'z prawej'};
  const fmt=(v,d=1)=>(Math.round(v*10**d)/10**d).toLocaleString('pl-PL',{minimumFractionDigits:d,maximumFractionDigits:d});
  const r05=v=>Math.round(v/C)*C;
  // obrys domu (+ tarasy) w kratkach siatki domu
  function footprint(project){const g=project.grid||project.definitionSnapshot?.grid,W=g.width,H=g.height,fl=project.definitionSnapshot?.floorOrder||['ground','upper'],st=project.state?.[fl[0]]||[],s=Array.isArray(st[0])?st.flat():st;
    const R=Object.fromEntries((project.definitionSnapshot?.floors?.[fl[0]]?.rooms||[]).map(r=>[r.id,r])),house=new Set();
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){const v=s[y*W+x];if(v&&R[v]?.kind!=='exteriorVoid')house.add(x+','+y)}
    const out=new Map();if(global.HouserModel)for(const it of project.outdoorStructures||[])for(const [x,y] of HouserModel.outdoorCells(it,g.cellMeters))out.set(x+','+y,it.type);
    return {W,H,c:g.cellMeters,house,out}}
  // ustawienia z domyślnymi: działka ok. 6 m przed domem od ulicy, ogród z tyłu, po bokach min. 4 m
  function settings(project){const s={...(project.site||{})},F=footprint(project),k=F.c/C,all=[...F.house,...F.out.keys()].map(t=>t.split(',').map(Number));
    const minX=Math.min(...all.map(a=>a[0])),maxX=Math.max(...all.map(a=>a[0]))+1,minY=Math.min(...all.map(a=>a[1])),maxY=Math.max(...all.map(a=>a[1]))+1;
    const bw=(maxX-minX)*F.c,bd=(maxY-minY)*F.c;s.road=ROAD[s.road]?s.road:'bottom';const along=s.road==='left'||s.road==='right';
    // garaż wolnostojący / wiata obok domu (wzdłuż ulicy) – miejsce na niego w domyślnej działce
    const Gg=global.HouserGarage?HouserGarage.evaluate(project):null,gx=Gg&&(Gg.type==='detached'||Gg.type==='carport')?(along?Gg.d:Gg.w)+1.5:0;
    if(!(+s.w>0))s.w=along?Math.ceil(bw+18):Math.ceil(Math.max(18,bw+gx+10));if(!(+s.d>0))s.d=along?Math.ceil(Math.max(18,bd+gx+10)):Math.ceil(bd+18);
    const PW=along?s.d:s.w; // PW – szerokość działki wzdłuż ulicy
    if(!Number.isFinite(+s.hx)||!Number.isFinite(+s.hy)||s.hx===null||s.hy===null){
      const front=6,side=(PW-(along?bd:bw)-gx)/2; // dom (z garażem obok) na środku szerokości, 6 m od ulicy
      if(s.road==='bottom'){s.hx=r05(side)-minX*F.c;s.hy=r05(s.d-front-bd)-minY*F.c}
      else if(s.road==='top'){s.hx=r05(side)-minX*F.c;s.hy=front-minY*F.c}
      else if(s.road==='left'){s.hx=front-minX*F.c;s.hy=r05(side)-minY*F.c}
      else{s.hx=r05(s.w-front-bw)-minX*F.c;s.hy=r05(side)-minY*F.c}}
    s.w=+s.w;s.d=+s.d;s.hx=r05(+s.hx);s.hy=r05(+s.hy);s.cells=s.cells&&typeof s.cells==='object'?s.cells:{};s.trees=Array.isArray(s.trees)?s.trees:[];
    s.fence=FENCE[s.fence]?s.fence:'panel';s.pbcMin=Number.isFinite(+s.pbcMin)&&s.pbcMin!==null&&s.pbcMin!==''?+s.pbcMin:40;s.coverMax=Number.isFinite(+s.coverMax)&&s.coverMax!==null&&s.coverMax!==''?+s.coverMax:30;
    const roadLen=s.road==='bottom'||s.road==='top'?s.w:s.d;s.gate=Number.isFinite(+s.gate)&&s.gate!==null&&s.gate!==''?Math.max(2.5,Math.min(roadLen-2.5,+s.gate)):null;
    return {s,F,bbox:{minX,maxX,minY,maxY}}}
  // wejście do domu: drzwi „wejściowe”, inaczej drzwi z wiatrołapu / holu / przedsionka, inaczej pierwsze zewnętrzne poza garażem
  function entrances(q){if(!q)return [];const ext=q.runs.filter(r=>r.ext&&r.base==='door'&&r.f===q.lo),names=r=>(r.rooms||[]).map(x=>x.name||x).join(' ');
    const a=ext.filter(r=>r.info?.variant==='entrance');if(a.length)return a;const b=ext.filter(r=>/wiatro|hol|przedsion|wej/i.test(names(r)));if(b.length)return b;
    const c=ext.find(r=>!/gara[zż]/i.test(names(r)));return c?[c]:[]}
  function evaluate(project){
    const {s,F,bbox}=settings(project),q=global.HouserQuantities?HouserQuantities.compute(project):null,Gg=global.HouserGarage?HouserGarage.evaluate(project):null;
    const NI=Math.round(s.w/C),NJ=Math.round(s.d/C),k=Math.round(F.c/C),ox=Math.round(s.hx/C),oy=Math.round(s.hy/C);
    const issues=[],good=[];const add=(p,text,tip,type)=>issues.push({p:Math.round(p*100)/100,text,tip:tip||'',type:type||'site'});
    // zajętość kratek działki: dom, tarasy, garaż wolnostojący / wiata
    const occ=new Map(),inPlot=(i,j)=>i>=0&&j>=0&&i<NI&&j<NJ;let houseOut=0;
    for(const t of F.house){const [x,y]=t.split(',').map(Number);for(let a=0;a<k;a++)for(let b=0;b<k;b++){const i=ox+x*k+a,j=oy+y*k+b;if(inPlot(i,j))occ.set(i+','+j,'house');else houseOut++}}
    for(const [t,ty] of F.out){const [x,y]=t.split(',').map(Number);for(let a=0;a<k;a++)for(let b=0;b<k;b++){const i=ox+x*k+a,j=oy+y*k+b;if(inPlot(i,j)&&!occ.has(i+','+j))occ.set(i+','+j,'out:'+ty)}}
    let garage=null;if(Gg&&(Gg.type==='detached'||Gg.type==='carport')){let gx=+Gg.x,gy=+Gg.y;
      if(!Number.isFinite(gx)||!Number.isFinite(gy)||Gg.x===null||Gg.y===null){ // domyślnie: obok domu (od strony ulicy równo z frontem)
        const b=bbox,X0=s.hx+b.minX*F.c,X1=s.hx+b.maxX*F.c,Y0=s.hy+b.minY*F.c,Y1=s.hy+b.maxY*F.c;
        if(s.road==='bottom'){gx=X1+1.5;gy=Y1-Gg.d}else if(s.road==='top'){gx=X1+1.5;gy=Y0}else if(s.road==='left'){gx=X0;gy=Y1+1.5}else{gx=X1-Gg.w;gy=Y1+1.5}}
      garage={x:r05(gx),y:r05(gy),w:Gg.w,d:Gg.d,type:Gg.type,cars:Gg.cars,roof:Gg.roof,name:Gg.name};let over=0;
      for(let i=Math.round(garage.x/C);i<Math.round((garage.x+garage.w)/C);i++)for(let j=Math.round(garage.y/C);j<Math.round((garage.y+garage.d)/C);j++){if(!inPlot(i,j))continue;if(occ.get(i+','+j)==='house')over++;else occ.set(i+','+j,'garage')}
      if(over)add(2,'Garaż nachodzi na dom – przesuń go na planie działki.','Przeciągnij garaż na wolne miejsce.','garage');
      const out=garage.x<0||garage.y<0||garage.x+garage.w>s.w+1e-6||garage.y+garage.d>s.d+1e-6;if(out)add(2,'Garaż wystaje poza działkę.','Przesuń garaż albo powiększ działkę.','garage')}
    if(houseOut)add(3,'Dom (albo taras) wystaje poza działkę – działka jest za mała albo dom źle ustawiony.','Powiększ działkę albo przesuń dom na planie.','house');
    // nawierzchnie (bez kratek pod domem / garażem)
    const area={grass:0,drive:0,parking:0,path:0,gravel:0,bed:0},cell=C*C;
    for(const [t,ty] of Object.entries(s.cells)){if(!SURF[ty])continue;const [i,j]=t.split(',').map(Number);if(!inPlot(i,j)||occ.has(t))continue;area[ty]+=cell}
    const plotA=s.w*s.d,occA=occ.size*cell,surfA=area.drive+area.parking+area.path+area.gravel+area.bed;area.grass=Math.max(0,plotA-occA-surfA);
    const houseFoot=q?q.foot:F.house.size*F.c*F.c,outA=[...occ.values()].filter(v=>v.startsWith('out:')).length*cell,covA=[...occ.values()].filter(v=>v==='out:coveredTerrace'||v==='out:pergola').length*cell;
    const built=houseFoot+(garage?garage.w*garage.d:0)+covA,green=area.grass+area.bed,pbc=green/plotA*100,cover=built/plotA*100;
    if(pbc<s.pbcMin)add(Math.min(2.5,.5+(s.pbcMin-pbc)*.15),'Powierzchnia biologicznie czynna '+fmt(pbc,0)+'% – mniej niż '+s.pbcMin+'% (wymóg miejscowego planu / warunków zabudowy).','Zmniejsz utwardzenia (żwir zamiast kostki, kratka ażurowa liczona w 50%) albo większa działka.','pbc');
    else good.push('Powierzchnia biologicznie czynna '+fmt(pbc,0)+'% (wymóg '+s.pbcMin+'%).');
    if(cover>s.coverMax)add(Math.min(2,.5+(cover-s.coverMax)*.12),'Wskaźnik zabudowy '+fmt(cover,0)+'% – więcej niż '+s.coverMax+'%.','Sprawdź dopuszczalny wskaźnik w planie miejscowym; mniejszy garaż / wiata albo większa działka.','cover');
    // odległości od granic (WT §12: ściana z oknami / drzwiami ≥ 4 m, bez otworów ≥ 3 m)
    const hb=settingsBox(F),sides={left:s.hx+hb.minX*F.c,right:s.w-(s.hx+hb.maxX*F.c),top:s.hy+hb.minY*F.c,bottom:s.d-(s.hy+hb.maxY*F.c)},open={left:false,right:false,top:false,bottom:false};
    for(const r of q?.runs||[]){if(!r.ext||!['window','door','hst'].includes(r.base)||r.info?.shape==='roof')continue;const side=r.o==='v'?(r.ra?'right':'left'):(r.ra?'bottom':'top');open[side]=true}
    const SN={left:'lewej',right:'prawej',top:'górnej',bottom:'dolnej'},setbacks=[];
    for(const sd of ['left','right','top','bottom']){const need=open[sd]?4:3,d=sides[sd];setbacks.push({side:sd,d,need,open:open[sd]});
      if(d<need-1e-6&&d>=-1e-6)add(Math.min(3,1+(need-d)*.6),'Dom stoi '+fmt(d)+' m od '+SN[sd]+' granicy – przy ścianie '+(open[sd]?'z oknami / drzwiami min. 4 m':'bez otworów min. 3 m')+'.','Przesuń dom na planie działki (przeciągnij) albo zmień wymiary działki.','setback')}
    if(garage){const gd=[garage.x,s.w-garage.x-garage.w,garage.y,s.d-garage.y-garage.d].map(v=>Math.max(0,v)),mn=Math.min(...gd);
      if(mn>.05&&mn<1.5)add(1,'Garaż '+fmt(mn)+' m od granicy – może stać przy samej granicy albo min. 1,5 m od niej (ściana bez okien).','Dosuń garaż do granicy albo odsuń na 1,5 m.','garage')}
    // podjazd: od ulicy do bramy garażu (albo do domu), chodnik do wejścia
    const surf=(i,j)=>s.cells[i+','+j],walk=t=>t==='drive'||t==='parking'||t==='path'||t==='gravel',drv=t=>t==='drive'||t==='parking'||t==='gravel';
    const roadCells=[];for(let n=0;n<(s.road==='bottom'||s.road==='top'?NI:NJ);n++){const [i,j]=s.road==='bottom'?[n,NJ-1]:s.road==='top'?[n,0]:s.road==='left'?[0,n]:[NI-1,n];roadCells.push([i,j])}
    const reach=ok=>{const seen=new Set(),st=[];for(const [i,j] of roadCells)if(ok(surf(i,j))&&!occ.has(i+','+j)){seen.add(i+','+j);st.push([i,j])}
      while(st.length){const [i,j]=st.pop();for(const [a,b] of [[i+1,j],[i-1,j],[i,j+1],[i,j-1]]){const t=a+','+b;if(!inPlot(a,b)||seen.has(t)||occ.has(t)||!ok(surf(a,b)))continue;seen.add(t);st.push([a,b])}}return seen};
    const R1=reach(drv),R2=reach(walk);
    // cele: przed bramą garażu w domu (kratki działki tuż za drzwiami garażu) / przed garażem wolnostojącym (od ulicy) / przed wejściem do domu
    const outside=(key)=>{const [o,aS,bS]=key.split(':'),a=+aS,b=+bS,cells=[];for(let u=0;u<k;u++){if(o==='h'){const i=ox+a*k+u;for(const j of [oy+b*k-1,oy+b*k])cells.push([i,j])}else{const j=oy+b*k+u;for(const i of [ox+a*k-1,ox+a*k])cells.push([i,j])}}return cells.filter(([i,j])=>inPlot(i,j)&&!occ.has(i+','+j))};
    const links=[];
    if(Gg?.type==='house'&&Gg.inHouse?.gates.length){const tg=Gg.inHouse.gates.flatMap(g=>g.keys.flatMap(outside));links.push({what:'brama garażu w domu',ok:tg.some(([i,j])=>R1.has(i+','+j)),n:tg.length})}
    if(garage){const tg=[];const gi0=Math.round(garage.x/C),gi1=Math.round((garage.x+garage.w)/C),gj0=Math.round(garage.y/C),gj1=Math.round((garage.y+garage.d)/C);
      if(s.road==='bottom')for(let i=gi0;i<gi1;i++)tg.push([i,gj1]);else if(s.road==='top')for(let i=gi0;i<gi1;i++)tg.push([i,gj0-1]);else if(s.road==='left')for(let j=gj0;j<gj1;j++)tg.push([gi0-1,j]);else for(let j=gj0;j<gj1;j++)tg.push([gi1,j]);
      links.push({what:garage.type==='carport'?'wiata':'brama garażu',ok:tg.some(([i,j])=>R1.has(i+','+j))})}
    const entCells=entrances(q).flatMap(r=>r.keys.flatMap(outside));
    if(entCells.length)links.push({what:'wejście do domu',ok:entCells.some(([i,j])=>R2.has(i+','+j)),walk:true});
    const anySurf=surfA>0;
    for(const L of links){if(L.ok)good.push((L.walk?'Chodnik / podjazd prowadzi':'Podjazd prowadzi')+' od ulicy do: '+L.what+'.');
      else add(L.walk?.8:1.5,(L.walk?'Brak dojścia (chodnik / podjazd) od ulicy do: ':'Podjazd z ulicy nie dochodzi do: ')+L.what+'.',anySurf?'Domaluj podjazd z kostki (albo żwiru) od granicy z ulicą aż pod '+L.what+'.':'Na planie działki pomaluj podjazd i chodnik – albo użyj „Podjazd automatycznie”.','link')}
    // miejsca postojowe: garaż + wydzielone miejsca (2,5 × 5 m) + podjazd przed garażem
    const openSpots=Math.floor(area.parking/12.5),garSpots=Gg&&Gg.type!=='none'?Gg.cars||0:0,spots=garSpots+openSpots;
    if(spots<2)add(spots?0.6:1.2,'Miejsca postojowe: '+spots+' – zwykle potrzeba co najmniej 2 (plan miejscowy często wymaga 2 na dom).','Dodaj miejsce postojowe (2,5 × 5 m) z kostki przy podjeździe albo garaż na 2 auta.','parking');
    else good.push('Miejsca postojowe: '+spots+' ('+(garSpots?garSpots+' w garażu':'')+(garSpots&&openSpots?' + ':'')+(openSpots?openSpots+' na zewnątrz':'')+').');
    // koszt
    const items=[];for(const [t,v] of Object.entries(SURF))if(area[t]>0)items.push({name:v.name,v:Math.round(area[t]*v.price),note:fmt(area[t])+' m²'});
    if(area.grass>0)items.push({name:'Trawnik (ziemia, siew / rolka)',v:Math.round(area.grass*PRICE.lawnM2),note:fmt(area.grass,0)+' m²'});
    const per=2*(s.w+s.d),roadLen=s.road==='bottom'||s.road==='top'?s.w:s.d;
    if(s.fence!=='none'){items.push({name:FENCE[s.fence].name,v:Math.round((per-5.5)*FENCE[s.fence].m),note:fmt(per-5.5,0)+' m'});items.push({name:'Brama wjazdowa i furtka',v:PRICE.gate+PRICE.wicket})}
    if(s.trees.length)items.push({name:'Drzewa i krzewy (sadzonki)',v:s.trees.length*PRICE.tree,note:s.trees.length+' szt.'});
    if(Gg)for(const it of Gg.cost.items)items.push({...it,garage:true});
    const score=Math.round(Math.max(0,10-issues.reduce((a,i)=>a+i.p,0))*10)/10;
    return {set:s,plot:{w:s.w,d:s.d,area:plotA,NI,NJ,road:s.road,roadLen},house:{ox,oy,k,W:F.W,H:F.H,c:F.c,box:hb},occ,garage,garageEval:Gg,area,pbc,cover,built,setbacks,links,spots,issues,good,score,
      cost:{items,total:items.reduce((a,i)=>a+i.v,0),site:items.filter(i=>!i.garage).reduce((a,i)=>a+i.v,0),garage:items.filter(i=>i.garage).reduce((a,i)=>a+i.v,0)}}}
  function settingsBox(F){const all=[...F.house].map(t=>t.split(',').map(Number));return {minX:Math.min(...all.map(a=>a[0])),maxX:Math.max(...all.map(a=>a[0]))+1,minY:Math.min(...all.map(a=>a[1])),maxY:Math.max(...all.map(a=>a[1]))+1}}
  // podjazd automatycznie: najtańsza trasa (z karą za zakręty) od ulicy do bramy garażu, miejsca postojowe przy ulicy, chodnik 1 m do wejścia
  function autoPaths(project,opt){const R=evaluate(project),s=R.set,cells=Object.fromEntries(Object.entries(s.cells).filter(([,t])=>!(opt?.fresh&&(t==='drive'||t==='parking'||t==='path')))),NI=R.plot.NI,NJ=R.plot.NJ,occ=R.occ,k=R.house.k,ox=R.house.ox,oy=R.house.oy;
    const free=(i,j)=>i>=0&&j>=0&&i<NI&&j<NJ&&!occ.has(i+','+j),walk=t=>t==='drive'||t==='parking'||t==='path'||t==='gravel';
    const blockOk=(i,j,B)=>{for(let a=0;a<B;a++)for(let b=0;b<B;b++)if(!free(i+a,j+b))return false;return true};
    const paint=(i,j,B,t)=>{for(let a=0;a<B;a++)for(let b=0;b<B;b++){const key=(i+a)+','+(j+b);if(t==='path'&&(cells[key]==='drive'||cells[key]==='parking'))continue;cells[key]=t}};
    const atRoad=(i,j,B)=>s.road==='bottom'?j+B>=NJ:s.road==='top'?j<=0:s.road==='left'?i<=0:i+B>=NI;
    const paved=(i,j,B)=>{for(let a=0;a<B;a++)for(let b=0;b<B;b++)if(!walk(cells[(i+a)+','+(j+b)]))return false;return true};
    const D=[[1,0],[-1,0],[0,1],[0,-1]];
    // Dijkstra po blokach B×B (stan: blok + kierunek), start – bloki docelowe, koniec – blok przy ulicy albo na gotowej nawierzchni połączonej z ulicą
    function route(starts,B,t){const N=NI*NJ,dist=new Float64Array(N*4).fill(Infinity),prev=new Int32Array(N*4).fill(-1),h=[];
      const push=(c,v)=>{h.push([c,v]);let n=h.length-1;while(n){const p=(n-1)>>1;if(h[p][0]<=h[n][0])break;[h[p],h[n]]=[h[n],h[p]];n=p}};
      const pop=()=>{const top=h[0],last=h.pop();if(h.length){h[0]=last;let n=0;for(;;){const l=2*n+1,r=l+1;let m=n;if(l<h.length&&h[l][0]<h[m][0])m=l;if(r<h.length&&h[r][0]<h[m][0])m=r;if(m===n)break;[h[m],h[n]]=[h[n],h[m]];n=m}}return top};
      for(const [i,j,c0=0] of starts)if(blockOk(i,j,B))for(let d=0;d<4;d++){const v=(j*NI+i)*4+d;if(dist[v]>c0){dist[v]=c0;push(c0,v)}}
      const okC=new Map(),ok=(i,j)=>{const key=i*100000+j;if(!okC.has(key))okC.set(key,blockOk(i,j,B));return okC.get(key)};
      let end=-1;while(h.length){const [c,v]=pop();if(c>dist[v])continue;const d=v%4,cell=(v-d)/4,i=cell%NI,j=(cell-i)/NI;
        if(atRoad(i,j,B)||(prev[v]>=0&&paved(i,j,B))){end=v;break}
        for(let nd=0;nd<4;nd++){const a=i+D[nd][0],b=j+D[nd][1];if(!ok(a,b))continue;const w=c+(paved(a,b,B)?.2:1)+(nd===d?0:3),u=(b*NI+a)*4+nd;if(w<dist[u]){dist[u]=w;prev[u]=v;push(w,u)}}}
      if(end<0)return false;for(let v=end;v>=0;v=prev[v]){const cell=(v-v%4)/4,i=cell%NI,j=(cell-i)/NI;paint(i,j,B,t)}return true};
    // bloki docelowe przy krawędziach (kratki zewnętrzne tuż za otworem), wyśrodkowane na otworze
    const edgeStarts=(keys,B)=>{const ks=keys.map(t=>t.split(':')),o=ks[0][0],line=+ks[0][o==='h'?2:1],al=ks.map(a=>+a[o==='h'?1:2]),m=(Math.min(...al)+Math.max(...al)+1)/2*k,res=[];
      const c0=Math.round(m-B/2),L=line*k,base=o==='h'?oy:ox,c0b=(o==='h'?ox:oy)+c0;
      for(const off of [0,-1,1,-2,2])for(const side of [L,L-B]){const p=base+side;res.push(o==='h'?[c0b+off,p,Math.abs(off)*4]:[p,c0b+off,Math.abs(off)*4])}return res.filter(([i,j])=>blockOk(i,j,B))};
    const G=R.garage,Gg=R.garageEval;let gs=0;
    if(G){const gi0=Math.round(G.x/C),gi1=Math.round((G.x+G.w)/C),gj0=Math.round(G.y/C),gj1=Math.round((G.y+G.d)/C),B=6,st=[];
      for(const off of [0,-1,1,-2,2]){const ci=Math.round((gi0+gi1)/2-B/2)+off,cj=Math.round((gj0+gj1)/2-B/2)+off,pc=Math.abs(off)*4;
        if(s.road==='bottom')st.push([ci,gj1,pc]);else if(s.road==='top')st.push([ci,gj0-B,pc]);else if(s.road==='left')st.push([gi0-B,cj,pc]);else st.push([gi1,cj,pc])}
      route(st,B,'drive');gs=G.cars||0}
    else if(Gg?.type==='house'&&Gg.inHouse?.gates.length){for(const g of Gg.inHouse.gates)route(edgeStarts(g.keys,6),6,'drive');gs=Gg.inHouse.cars||0}
    // miejsca postojowe (2,5 × 5 m) przy ulicy – tyle, żeby razem z garażem były 2
    const need=Math.max(0,2-gs);if(need){const PW=need*5,PD=10,along=s.road==='bottom'||s.road==='top',L=along?NI:NJ,hb=R.house.box,mid=along?ox+(hb.minX+hb.maxX)/2*k:oy+(hb.minY+hb.maxY)/2*k;
      const cand=[];for(let p=0;p+PW<=L;p++)cand.push(p);cand.sort((a,b)=>Math.abs(a+PW/2-mid)-Math.abs(b+PW/2-mid));
      for(const p of cand){const [i0,j0,wi,wj]=s.road==='bottom'?[p,NJ-PD,PW,PD]:s.road==='top'?[p,0,PW,PD]:s.road==='left'?[0,p,PD,PW]:[NI-PD,p,PD,PW];let ok=true;
        for(let a=0;a<wi&&ok;a++)for(let b=0;b<wj;b++)if(!free(i0+a,j0+b)||cells[(i0+a)+','+(j0+b)]==='drive'){ok=false;break}
        if(ok){for(let a=0;a<wi;a++)for(let b=0;b<wj;b++)cells[(i0+a)+','+(j0+b)]='parking';break}}}
    // chodnik do wejścia
    const ent=entrances(HouserQuantities.compute(project))[0];
    if(ent)route(edgeStarts(ent.keys,2),2,'path');
    return cells}
  // bramy / furtki: odcinki granicy z ulicą (m od początku), przy których jest podjazd, chodnik albo żwir
  function gates(R){const s=R.set,P=R.plot,along=s.road==='bottom'||s.road==='top',n=along?P.NI:P.NJ,out=[];let cur=null;
    for(let t=0;t<n;t++){const key=s.road==='bottom'?t+','+(P.NJ-1):s.road==='top'?t+',0':s.road==='left'?'0,'+t:(P.NI-1)+','+t,v=s.cells[key],ok=!!SURF[v]&&v!=='bed'&&!R.occ.has(key);
      if(ok){if(cur&&cur.b===t*C)cur.b=(t+1)*C;else{cur={a:t*C,b:(t+1)*C};out.push(cur)}}}return out}
  global.HouserSite={C,SURF,FENCE,PRICE,ROAD,settings,evaluate,autoPaths,footprint,gates,entrances};
})(typeof window!=='undefined'?window:globalThis);
