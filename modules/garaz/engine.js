// Garaż: w bryle domu (pomieszczenie „Garaż”), wolnostojący albo wiata – wymiary, miejsca, brama, koszt.
// HouserGarage.evaluate(project) -> {type, name, cars, w, d, area, x, y, roof, door, inHouse, cost, issues, good, score}
// Ustawienia: project.garage = {type:'auto'|'none'|'house'|'detached'|'carport', cars:1-3, w, d, roof:'flat'|'gable', x, y (m na działce, lewy górny róg)}
// Położenie na działce ustawia moduł Działka (przeciąganie), tu – rodzaj i wymiary.
(function(global){
  const TYPES={none:'Bez garażu',house:'Garaż w bryle domu',detached:'Garaż wolnostojący',carport:'Wiata garażowa (carport)'};
  const SIZE={detached:{1:[3.6,6.2],2:[6.4,6.2],3:[9.2,6.2]},carport:{1:[3.3,5.5],2:[6,5.5],3:[8.7,5.5]}};
  const PER_CAR={w:2.8,d:5.4}; // minimum wewnątrz na auto (wygodnie 3,0 × 5,8)
  const PRICE={detachedM2:2600,carportM2:850,gate:6500,gableK:1.12};
  const DEF={type:'auto',cars:2,roof:'flat',w:null,d:null,x:null,y:null};
  const fmt=(v,d=1)=>(Math.round(v*10**d)/10**d).toLocaleString('pl-PL',{minimumFractionDigits:d,maximumFractionDigits:d});
  // garaż w bryle domu: pomieszczenie o nazwie „garaż” na parterze, jego powierzchnia i szerokość bramy (drzwi zewnętrzne w tym pomieszczeniu)
  function inHouse(project){if(!global.HouserQuantities)return null;const q=HouserQuantities.compute(project),rs=q.rooms.filter(r=>r.f===q.lo&&/gara[zż]/i.test(r.name||''));if(!rs.length)return null;
    const ids=new Set(rs.map(r=>r.id)),area=rs.reduce((s,r)=>s+r.area,0);let gate=0;const gates=[];
    // drzwi zewnętrzne garażu; sąsiednie biegi na jednej linii (drzwi łączą się po 2 m) – jedna brama; węższe niż 2 m – zwykłe drzwi
    const runs=[];for(const r of q.runs||[])if(r.f===q.lo&&r.ext&&r.base==='door'&&(r.rooms||[]).some(x=>ids.has(x.id)||ids.has(x)))for(const k of r.keys){const [o,a,b]=k.split(':');runs.push({o,line:+(o==='h'?b:a),al:+(o==='h'?a:b),k})}
    runs.sort((p,r)=>p.o.localeCompare(r.o)||p.line-r.line||p.al-r.al);const doors=[];let cur=null;
    for(const r of runs){if(cur&&cur.o===r.o&&cur.line===r.line&&r.al===cur.to+1){cur.to=r.al;cur.keys.push(r.k)}else{cur={o:r.o,line:r.line,to:r.al,keys:[r.k]};doors.push(cur)}}
    for(const d of doors){const w=d.keys.length*q.c;if(w>=2-1e-6){gate+=w;gates.push({keys:d.keys,w})}}
    // ile aut: z wymiarów (obrys z kratek, z grubością ścian ok. 0,4 m) – auta obok siebie wzdłuż dłuższego boku, ok. 3 m na auto
    const xs=rs.flatMap(r=>r.cells.map(c=>c[0])),ys=rs.flatMap(r=>r.cells.map(c=>c[1])),bw=(Math.max(...xs)-Math.min(...xs)+1)*q.c,bd=(Math.max(...ys)-Math.min(...ys)+1)*q.c,L=Math.max(bw,bd),S=Math.min(bw,bd);
    const cars=S-.4<PER_CAR.d?(L-.4>=PER_CAR.d&&S-.4>=PER_CAR.w?1:0):Math.max(0,Math.min(Math.floor((L-.4)/3),Math.floor(area/14)));
    return {area,w:bw,d:bd,rooms:rs.map(r=>r.name),cars,gate,gates,doors:doors.filter(d=>d.keys.length*q.c<2-1e-6).length}}
  function settings(p){return {...DEF,...(p.garage||{})}}
  function evaluate(project){
    const s=settings(project),H=inHouse(project);
    let type=s.type==='auto'?(H?'house':'none'):s.type;if(!TYPES[type])type='none';
    const issues=[],good=[];const add=(p,text,tip)=>issues.push({p,text,tip:tip||''});
    const cars=Math.max(1,Math.min(3,Math.round(+s.cars||2)));
    if(type==='none'){good.push('Bez garażu – auto na podjeździe / miejscu postojowym (moduł Działka).');return {type,name:TYPES[type],cars:0,w:0,d:0,area:0,inHouse:H,cost:{total:0,items:[]},issues,good,score:null,set:s}}
    if(type==='house'){if(!H){add(2,'Wybrano garaż w bryle domu, ale w projekcie nie ma pomieszczenia „Garaż”.','Dodaj pomieszczenie o nazwie „Garaż” na parterze albo wybierz garaż wolnostojący / wiatę.');return {type,name:TYPES[type],cars:0,w:0,d:0,area:0,inHouse:null,cost:{total:0,items:[]},issues,good,score:8,set:s}}
      const per=H.cars?H.area/H.cars:0;if(H.cars<1)add(2,'Garaż w domu ma tylko '+fmt(H.area)+' m² – za mało na auto (min. ok. 15 m²).','Powiększ garaż do ok. 3 × 6 m na auto.');
      else if(per<17)add(.6,'Garaż w domu: '+fmt(H.area)+' m² na '+H.cars+' '+(H.cars===1?'auto':'auta')+' – ciasno (wygodnie ok. 18 m² na auto).','Dodaj 0,5–1 m szerokości – łatwiej otworzyć drzwi auta.');
      else good.push('Garaż w domu: '+fmt(H.area)+' m², mieści '+H.cars+' '+(H.cars===1?'auto':'auta')+'.');
      if(H.gate<=0)add(1.5,'Garaż w domu nie ma bramy (drzwi zewnętrznych).','Dodaj szerokie drzwi zewnętrzne (bramę) w module Okna i drzwi / Układ.');
      else if(H.gate<2.4*Math.min(1,H.cars)||(H.cars>=2&&H.gate<4.5&&H.gates.length<2))add(.6,'Brama garażu ok. '+fmt(H.gate)+' m – wąsko na '+H.cars+' '+(H.cars===1?'auto':'auta')+'.','Brama na 1 auto ok. 2,5 m, na 2 auta ok. 5 m (albo dwie po 2,5 m).');
      const score=Math.round(Math.max(0,10-issues.reduce((a,i)=>a+i.p,0))*10)/10;
      return {type,name:TYPES[type],cars:H.cars,w:0,d:0,area:H.area,inHouse:H,cost:{total:0,items:[]},issues,good,score,set:s}}
    const [dw,dd]=SIZE[type][cars],w=Math.max(2.5,+s.w||dw),d=Math.max(3,+s.d||dd),area=w*d,roof=s.roof==='gable'?'gable':'flat';
    const fit=Math.floor((w-.4)/PER_CAR.w),deep=d-.4>=PER_CAR.d;
    if(fit<cars||!deep)add(1.5,TYPES[type]+' '+fmt(w)+' × '+fmt(d)+' m nie mieści '+cars+' '+(cars===1?'auta':'aut')+' (na auto min. ok. '+fmt(PER_CAR.w)+' × '+fmt(PER_CAR.d)+' m w środku).','Powiększ do co najmniej '+fmt(cars*PER_CAR.w+.4)+' × '+fmt(PER_CAR.d+.4)+' m.');
    else if(w/cars<3.1&&type==='detached')add(.4,'Garaż '+fmt(w)+' m szerokości na '+cars+' '+(cars===1?'auto':'auta')+' – mieści, ale ciasno przy otwieraniu drzwi.','Wygodnie ok. 3,2 m szerokości na auto.');
    else good.push(TYPES[type]+' '+fmt(w)+' × '+fmt(d)+' m – wygodnie na '+cars+' '+(cars===1?'auto':'auta')+'.');
    if(type==='carport')good.push('Wiata – tańsza od garażu, auto osłonięte od śniegu i słońca (bez ogrzewania i zamykania).');
    const items=[];if(type==='detached'){items.push({name:'Garaż wolnostojący '+fmt(w)+' × '+fmt(d)+' m ('+(roof==='gable'?'dach dwuspadowy':'dach płaski')+')',v:Math.round(area*PRICE.detachedM2*(roof==='gable'?PRICE.gableK:1))});items.push({name:'Brama garażowa (segmentowa, z napędem)',v:PRICE.gate*(cars>=2&&w>=6?1:1)})}
    else items.push({name:'Wiata garażowa '+fmt(w)+' × '+fmt(d)+' m',v:Math.round(area*PRICE.carportM2)});
    const score=Math.round(Math.max(0,10-issues.reduce((a,i)=>a+i.p,0))*10)/10;
    return {type,name:TYPES[type],cars,w,d,area,roof,x:s.x,y:s.y,inHouse:H,cost:{total:items.reduce((a,i)=>a+i.v,0),items},issues,good,score,set:s}}
  global.HouserGarage={TYPES,SIZE,PER_CAR,PRICE,DEF,settings,inHouse,evaluate};
})(typeof window!=='undefined'?window:globalThis);
