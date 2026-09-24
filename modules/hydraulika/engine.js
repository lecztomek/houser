// Hydraulika – ocena, jak łatwo i tanio zrobić instalację wod-kan przy danym układzie (bez projektowania rur).
// HouserPlumbing.evaluate(project, settings) -> {points, clusters, risers, source, cost, baseCost, overall, verdict…}
// Liczymy: długość połączeń od źródła ciepłej wody (pomieszczenie techniczne) do każdego mokrego pomieszczenia (poziomo po rzucie
// + w pionie między kondygnacjami), czy mokre pomieszczenia na piętrze stoją nad mokrymi na parterze (wspólny pion kanalizacyjny),
// ile pionów trzeba i czy przechodzą przez „suche” pokoje, oraz orientacyjny koszt w porównaniu z układem zwartym.
// Wymaga shared/quantities.js.
(function(global){
  const KINDS=[
    {k:'bath',re:/łazien|lazien/i,name:'łazienka',pts:3,toilet:true,w:1.2,need:'wanna / prysznic, umywalka, WC'},
    {k:'wc',re:/\bwc\b|toalet/i,name:'WC',pts:2,toilet:true,w:1,need:'WC, umywalka'},
    {k:'kitchen',re:/kuchni|aneks/i,name:'kuchnia',pts:2,w:1,need:'zlew, zmywarka'},
    {k:'laundry',re:/pralni/i,name:'pralnia',pts:2,w:.8,need:'pralka, zlew / wpust'},
    {k:'utility',re:/techn|kotłown|kotlown|kotł|kotl/i,name:'pomieszczenie techniczne',pts:2,w:.5,need:'przyłącze, zasobnik c.w.u., wpust'},
  ];
  const DEF={source:'auto',circulation:'auto'};
  // ceny orientacyjne (zł, z robocizną)
  const PRICE={supply:120,circ:60,drain:140,riserFloor:2500,point:600,upperOffset:2500,upperOffsetM:250,boxing:1200,circBase:2500};
  const kindOf=name=>KINDS.find(k=>k.re.test(name||''))||null;
  const fmtM=v=>(Math.round(v*10)/10).toLocaleString('pl-PL')+' m';

  function evaluate(project,settings){
    const set={...DEF,...(settings||{})};
    const q=HouserQuantities.compute(project),c=q.c,lo=q.lo,up=q.up,W=q.W,H=q.H;
    const hFloor=(q.G.groundHeight||2.8)+.3;
    const rooms=q.rooms.map(r=>({...r,key:r.f+'|'+r.id,kind:kindOf(r.name)}));
    const byKey=Object.fromEntries(rooms.map(r=>[r.key,r]));
    const wet=rooms.filter(r=>r.kind&&r.area>=1);
    // źródło ciepłej wody / przyłącze: wybrane przez użytkownika albo techniczne → garaż → kuchnia na parterze
    let source=set.source!=='auto'?byKey[set.source]:null,sourceAuto=false;
    if(!source){sourceAuto=true;source=rooms.find(r=>r.kind?.k==='utility'&&r.f===lo)||rooms.find(r=>r.kind?.k==='utility')||rooms.find(r=>/garaż|garaz/i.test(r.name)&&r.f===lo)||rooms.find(r=>r.kind?.k==='kitchen'&&r.f===lo)||wet.find(r=>r.f===lo)||null}
    const cellSet=r=>new Set(r.cells.map(([x,y])=>x+','+y));
    const minDist=(a,b)=>{let best=1e9,pa=null,pb=null;for(const [x1,y1] of a.cells)for(const [x2,y2] of b.cells){const d=Math.abs(x1-x2)+Math.abs(y1-y2);if(d<best){best=d;pa=[x1,y1];pb=[x2,y2]}}return {d:Math.max(0,best-1)*c,pa,pb}}; // odległość między ścianami pomieszczeń
    const overlap=(u,g)=>{const s=cellSet(g);let n=0;for(const [x,y] of u.cells)if(s.has(x+','+y))n++;return n*c*c};
    const adjacent=(a,b)=>{if(a.f!==b.f)return false;const s=cellSet(b);for(const [x,y] of a.cells)if(s.has((x+1)+','+y)||s.has((x-1)+','+y)||s.has(x+','+(y+1))||s.has(x+','+(y-1)))return true;return false};
    const groundWet=wet.filter(r=>r.f===lo);
    // punkty (mokre pomieszczenia) – bez samego źródła
    const points=[];
    for(const r of wet){const isSrc=source&&r.key===source.key;
      const P={key:r.key,f:r.f,name:r.name,kind:r.kind,area:r.area,cells:r.cells,isSrc,issues:[],score:10};
      if(source&&!isSrc){const md=minDist(r,source);P.hor=md.d+1.5;P.ver=r.f!==source.f?hFloor:0;P.len=P.hor+P.ver;P.pa=md.pa;P.pb=md.pb}else{P.hor=0;P.ver=0;P.len=isSrc?0:null}
      // ciepła woda: rura PEX 20 mm ≈ 0,2 l/m, przepływ ok. 0,1 l/s → ok. 2 s czekania na każdy metr
      P.wait=P.len!=null?Math.round(P.len*2):null;
      if(r.f===up){let best=0,under=null;for(const g of groundWet){const o=overlap(r,g);if(o>best){best=o;under=g}}
        P.stackOver=best>=.5?under:null;
        if(!P.stackOver){let nd=1e9,near=null;for(const g of groundWet){const d=minDist(r,g).d;if(d<nd){nd=d;near=g}}P.offset=near?nd+1:null;P.offsetTo=near;
          // przez które suche pomieszczenie parteru zejdzie pion
          const s=cellSet(r);const cnt={};for(const g of rooms)if(g.f===lo&&!g.kind){let n=0;for(const [x,y] of g.cells)if(s.has(x+','+y))n++;if(n)cnt[g.key]=n}
          const dry=Object.entries(cnt).sort((a,b)=>b[1]-a[1])[0];P.dryBelow=dry?byKey[dry[0]]:null}}
      points.push(P)}
    // grupy mokrych pomieszczeń (sąsiadujące na kondygnacji albo jedno nad drugim) = wspólne piony / gałęzie kanalizacji
    const parent={};const find=k=>parent[k]===k?k:(parent[k]=find(parent[k]));for(const p of points)parent[p.key]=p.key;
    const uni=(a,b)=>{parent[find(a)]=find(b)};
    for(const a of points)for(const b of points)if(a.key<b.key&&adjacent(byKey[a.key],byKey[b.key]))uni(a.key,b.key);
    for(const p of points)if(p.stackOver&&parent[p.stackOver.key])uni(p.key,p.stackOver.key);
    const groups={};for(const p of points)(groups[find(p.key)]=groups[find(p.key)]||[]).push(p);
    const clusters=Object.values(groups);clusters.forEach((g,i)=>g.forEach(p=>p.cluster=i));
    // piony: jeden na grupę z piętrem + osobny dla każdego mokrego pomieszczenia na piętrze, które nie stoi nad mokrym
    const hasUp=q.net[up]>0;
    const risers=[];for(const g of clusters){if(g.some(p=>p.f===up&&p.stackOver))risers.push({group:g,stacked:true,rooms:g.filter(p=>p.f===up).map(p=>p.name)})}
    for(const p of points)if(p.f===up&&!p.stackOver)risers.push({group:[p],stacked:false,rooms:[p.name],through:p.dryBelow?.name||null});
    // cyrkulacja ciepłej wody – gdy najdłuższe połączenie > 10 m (albo wymuszona w ustawieniach)
    const maxLen=Math.max(0,...points.filter(p=>!p.isSrc&&p.len!=null).map(p=>p.len));
    const circ=set.circulation==='yes'||(set.circulation==='auto'&&maxLen>10);
    // oceny pomieszczeń
    for(const p of points){if(p.isSrc){p.score=null;continue}const add=(pen,type,text,tip)=>{pen=Math.round(pen*100)/100;if(pen<=0)return;p.issues.push({p:pen,type,text,tip});p.score-=pen};
      if(!source)add(2,'nosrc','Nie wiadomo, skąd idzie woda – w projekcie nie ma pomieszczenia technicznego.','Dodaj pomieszczenie techniczne (przyłącze, zasobnik ciepłej wody) na parterze, najlepiej przy łazience lub kuchni.');
      else{
        if(p.len>5)add(Math.min(3,(p.len-5)/3),'long','Daleko od źródła ciepłej wody: ok. '+fmtM(p.len)+' rury (ciepła woda po ok. '+p.wait+' s'+(circ?', z cyrkulacją od razu':'')+').',
          circ?'Cyrkulacja ciepłej wody rozwiązuje czekanie, ale kosztuje i traci ciepło – lepiej zbliżyć to pomieszczenie do technicznego.':'Zbliż to pomieszczenie do technicznego albo przewidź cyrkulację ciepłej wody.');
        if(p.ver)add(.5,'vertical','Na innej kondygnacji niż źródło – rury idą przez strop ('+fmtM(p.ver)+' w pionie).','Najkrócej, gdy łazienka na piętrze stoi nad technicznym lub łazienką na parterze.')}
      if(p.f===up&&hasUp){
        if(p.stackOver)p.good=(p.good||[]).concat('Stoi nad pomieszczeniem „'+p.stackOver.name+'” – wspólny pion kanalizacyjny.');
        else if(p.offset!=null){add(Math.min(4,2+(p.kind.toilet?1:0)+.4*Math.max(0,p.offset-1)),'offset','Nie stoi nad żadnym mokrym pomieszczeniem parteru – kanalizacja musi iść poziomo w stropie ok. '+fmtM(p.offset)+(p.kind.toilet?' (rura 110 mm od WC)':'')+' do pionu przy „'+p.offsetTo.name+'”.',
            'Przesuń pomieszczenie nad łazienkę / kuchnię / techniczne na parterze. Poziomą rurę trzeba ukryć w stropie (spadek 2%) albo w podwieszanym suficie pomieszczenia poniżej.');
          if(p.dryBelow)add(1,'boxing','Pion zejdzie przez „'+p.dryBelow.name+'” – trzeba go obudować (szacht w rogu pokoju, szum wody).','Pion kanalizacyjny w obudowie z wełną; najlepiej w ścianie przy łazience, a nie w salonie czy sypialni.')}}
      if(!clusters[p.cluster].some(o=>o!==p&&o.f===p.f)&&!(p.f===up&&p.stackOver)&&points.length>2)add(.8,'alone','Stoi osobno – nie sąsiaduje z innym mokrym pomieszczeniem, więc potrzebuje własnych podejść i gałęzi kanalizacji.','Mokre pomieszczenia (łazienka, WC, kuchnia, pralnia) najlepiej grupować przy jednej ścianie instalacyjnej.');
      p.score=Math.max(0,Math.min(10,p.score))}
    // koszt orientacyjny
    const pts=points.reduce((a,p)=>a+p.kind.pts,0),runLen=points.filter(p=>!p.isSrc&&p.len!=null).reduce((a,p)=>a+p.len,0);
    const upperOff=points.filter(p=>p.f===up&&!p.stackOver&&p.offset!=null);
    const cost={points:pts*PRICE.point,supply:runLen*PRICE.supply,drain:points.filter(p=>!p.isSrc).reduce((a,p)=>a+Math.min(8,(p.hor||0)*.6+1.5),0)*PRICE.drain,
      risers:risers.length*PRICE.riserFloor*(hasUp?2:1),offsets:upperOff.reduce((a,p)=>a+PRICE.upperOffset+p.offset*PRICE.upperOffsetM,0),boxing:upperOff.filter(p=>p.dryBelow).length*PRICE.boxing,
      circ:circ?PRICE.circBase+runLen*PRICE.circ:0};
    cost.total=Object.values(cost).reduce((a,b)=>a+b,0);
    // układ zwarty: te same przybory, każde pomieszczenie ok. 3 m od technicznego, piętro nad parterem (jeden pion)
    const n=points.filter(p=>!p.isSrc).length,nUp=points.filter(p=>p.f===up).length;
    const baseLen=points.filter(p=>!p.isSrc).reduce((a,p)=>a+3+(p.f!==(source?.f??lo)?hFloor:0),0);
    const baseCost=pts*PRICE.point+baseLen*PRICE.supply+n*2.5*PRICE.drain+(nUp?1:0)*PRICE.riserFloor*2+(hasUp&&!nUp?0:0);
    const scored=points.filter(p=>p.score!=null);const wsum=scored.reduce((a,p)=>a+p.kind.w,0);
    const avg=scored.length?scored.reduce((a,p)=>a+p.score*p.kind.w,0)/wsum:null,extraPen=Math.min(2,Math.max(0,cost.total-baseCost)/2500);
    const overall=avg==null?null:Math.round(Math.max(0,avg-extraPen)*10)/10; // średnia pomieszczeń minus kara za dopłatę względem układu zwartego
    return {q,set,points,clusters,risers,source,sourceAuto,maxLen,circ,cost,baseCost,extra:Math.max(0,cost.total-baseCost),avg,extraPen,overall,verdict:overall==null?null:overall>=8?'ok':overall>=6?'mid':'bad',hasUp,hFloor,rooms,lo,up,W,H,c};
  }
  global.HouserPlumbing={KINDS,DEF,PRICE,kindOf,evaluate};
})(window);
