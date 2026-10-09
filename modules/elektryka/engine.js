// Elektryka i oświetlenie – ile gniazd, punktów światła i obwodów potrzeba, rozdzielnica, kable, koszt i moc przyłączeniowa.
// HouserElectric.evaluate(project, settings) -> {rooms, circuits, dedicated, board, cable, points, cost, power, issues, good, score}
// Zasady (praktyka i PN-HD 60364): gniazda wg rodzaju i wielkości pokoju, osobne obwody dla kuchni, łazienek i urządzeń dużej mocy,
// oświetlenie do 10 punktów na obwód, różnicówki (RCD) na grupy obwodów, ogranicznik przepięć. Moc szczytowa ze współczynnikiem
// jednoczesności – porównana z typowym przyłączem 14 kW i z mocą fotowoltaiki (moc instalacji PV nie może przekroczyć mocy przyłączeniowej).
// Wymaga shared/quantities.js, shared/energy.js; opcjonalnie shared/heating-system.js, shared/pv.js, shared/hvac.js.
(function(global){
  const DEF={level:'std',induction:true,ev:false,smart:false,board:'auto',outdoor:true};
  const PRICE={point:150,light:170,board:{24:2800,36:3800,48:4800,72:6500},dedicated:450,threePhase:650,cableM:0,smart:.35,ev:4500,outdoor:350,sub:2200};
  const CONN=[[13.8,'3 × 20 A'],[17.3,'3 × 25 A'],[22.2,'3 × 32 A'],[27.7,'3 × 40 A'],[34.6,'3 × 50 A'],[44.3,'3 × 63 A']];
  // rodzaje pomieszczeń: gniazda = base + area/perM2, światło = punkty na m², obwody specjalne
  const KINDS=[
    {k:'kitchen',re:/kuchni|aneks/i,name:'kuchnia',sock:[6,0],lightM2:6,minL:2,ded:[['Płyta indukcyjna (400 V)',7.4,'3f'],['Piekarnik',3.5],['Zmywarka',2.2],['Lodówka',.3]],own:2},
    {k:'bath',re:/łazien|lazien/i,name:'łazienka',sock:[2,0],lightM2:5,minL:2,ded:[],own:1,fan:true,ip:true},
    {k:'wc',re:/\bwc\b|toalet/i,name:'WC',sock:[1,0],lightM2:5,minL:1,ded:[],own:0,fan:true},
    {k:'laundry',re:/pralni/i,name:'pralnia',sock:[2,0],lightM2:6,minL:1,ded:[['Pralka',2.2],['Suszarka',2.5]],own:0},
    {k:'living',re:/salon|dzienn/i,name:'salon',sock:[6,4],lightM2:8,minL:2,ded:[],own:0},
    {k:'dining',re:/jadal/i,name:'jadalnia',sock:[2,6],lightM2:8,minL:1,ded:[],own:0},
    {k:'study',re:/gabinet|biur|pracown/i,name:'gabinet',sock:[6,0],lightM2:8,minL:1,ded:[],own:0},
    {k:'bedroom',re:/sypial|pokój|pokoj|dziec|gości|gosci/i,name:'sypialnia',sock:[5,8],lightM2:10,minL:1,ded:[],own:0},
    {k:'garage',re:/garaż|garaz/i,name:'garaż',sock:[3,0],lightM2:12,minL:2,ded:[['Brama garażowa',.5]],own:0},
    {k:'utility',re:/techn|kotłown|kotlown|kotł|kotl|gospodarcz/i,name:'techniczne',sock:[2,0],lightM2:8,minL:1,ded:[],own:0},
    {k:'wardrobe',re:/garderob|spiżar|spizar|schowek/i,name:'garderoba / schowek',sock:[1,0],lightM2:6,minL:1,ded:[],own:0},
    {k:'hall',re:/hol|korytarz|komunikac|wiatrołap|wiatrolap|przedpok|antresol|schod/i,name:'komunikacja',sock:[1,8],lightM2:5,minL:1,ded:[],own:0}
  ];
  const kindOf=n=>KINDS.find(k=>k.re.test(n||''))||{k:'other',name:'inne',sock:[2,8],lightM2:10,minL:1,ded:[],own:0};
  const fmt=(v,d=1)=>(Math.round(v*10**d)/10**d).toLocaleString('pl-PL',{minimumFractionDigits:d,maximumFractionDigits:d});

  function evaluate(project,settings){
    const set={...DEF,...(project.elecSettings||{}),...(settings||{})},lvl=set.level==='komfort'?1.3:set.level==='eco'?.8:1;
    const q=HouserQuantities.compute(project),{c,lo,up}=q,hasUp=q.net[up]>0;
    const LIV=KINDS.find(k=>k.k==='living');
    const rooms=q.rooms.filter(r=>r.area>=.8).map(r=>{const K=kindOf(r.name),both=K.k==='kitchen'&&LIV.re.test(r.name||''); // pokój dzienny z kuchnią: gniazda kuchni + salonu
      const sockets=Math.max(1,Math.round((K.sock[0]+(K.sock[1]?r.area/K.sock[1]:0)+(both?LIV.sock[0]:0))*lvl));
      // punkty światła: z rozmieszczonych lamp (moduł Oświetlenie), inaczej wg powierzchni
      const LL=project.lighting?.lamps?.[r.f],placed=Array.isArray(LL)&&Object.values(project.lighting.lamps).some(a=>a?.length)?LL.filter(L=>r.cells.some(([x,y])=>+L.x>=x*c&&+L.x<(x+1)*c&&+L.y>=y*c&&+L.y<(y+1)*c)&&!['floor','table'].includes(L.type)).length:null;
      const lights=placed!=null?placed:Math.max(K.minL,Math.round(r.area/(both?LIV.lightM2:K.lightM2)));const doors=(r.doors||[]).length;const switches=Math.max(1,doors>=2?2:1)+(lights>2?1:0);
      const cx=r.cells.reduce((a,p)=>a+p[0],0)/r.cells.length,cy=r.cells.reduce((a,p)=>a+p[1],0)/r.cells.length;
      return {key:r.f+'|'+r.id,f:r.f,name:r.name,area:r.area,K,sockets,lights,switches,cx,cy,cells:r.cells,ded:[...K.ded],noWin:!(r.wins+r.roofWins)&&r.hstA<=0}});
    // urządzenia z innych modułów: ogrzewanie, wentylacja, klimatyzacja, fotowoltaika, auto
    const ded=[];const addD=(name,kw,ph,room)=>ded.push({name,kw,ph:ph||'1f',room:room||''});
    for(const r of rooms){for(const [n,kw,ph] of r.ded){if(n.startsWith('Płyta')&&!set.induction){addD('Płyta gazowa – zapłon',.1,'1f',r.name);continue}addD(n,kw,ph,r.name)}if(r.K.fan)addD('Wentylator łazienkowy',.05,'1f',r.name)}
    let E=null;try{E=HouserEnergy.compute(project)}catch(_){}
    let hs=null;try{if(global.HouserHeatSys)hs=HouserHeatSys.normalize(project)}catch(_){}
    const main=hs?.main||project.heatingSystem?.main||'hp_air',load=E?.load||6;
    const util=rooms.find(r=>r.K.k==='utility')?.name||'';
    if(main==='hp_air'||main==='hp_ground'||main==='hp_fire')addD('Pompa ciepła (sprężarka)',Math.max(2,load/2.6),'3f',util),addD('Grzałka pompy / zasobnika',3,'3f',util);
    else if(main==='electric')addD('Ogrzewanie elektryczne (maty / grzejniki)',load*1.1,'3f');
    else if(main==='fireplace_air')addD('Grzejniki elektryczne w łazienkach',1.5,'1f');
    else addD('Kocioł – sterownik, pompy',.3,'1f',util);
    if(['wood','fireplace_water'].includes(main)||hs?.dhwSrc==='el'||hs?.dhwSrc==='main_el')addD('Grzałka ciepłej wody',2.5,'1f',util);
    const vent=E?.s?.vent;if(vent==='mech')addD('Rekuperator',.3,'1f',util);else if(vent==='exhaust')addD('Wentylator wywiewny',.1,'1f',util);
    let ac=null;try{if(global.HouserHVAC){const V=HouserHVAC.evaluate(project,project.hvacSettings);if(V.ac?.rooms?.length&&(project.hvacSettings?.ac==='all'||project.costSettings?.on?.ac))ac=V.ac}}catch(_){}
    if(ac)addD('Klimatyzacja ('+ac.rooms.length+' pom.)',ac.rooms.reduce((a,r)=>a+r.kW,0)/3,'1f');
    if(set.ev)addD('Ładowarka auta elektrycznego (11 kW)',11,'3f',rooms.find(r=>r.K.k==='garage')?.name||'na zewnątrz');
    // obwody
    const sockC=[];let lightPts=0;
    for(const F of [lo,up]){const R=rooms.filter(r=>r.f===F);if(!R.length)continue;lightPts+=R.reduce((a,r)=>a+r.lights,0);
      // kuchnia i łazienki – osobne obwody; reszta grupowana po ok. 8 gniazd
      let rest=0,restRooms=[];for(const r of R){if(r.K.own){for(let i=0;i<r.K.own;i++)sockC.push({name:'Gniazda – '+r.name+(r.K.own>1?' ('+(i+1)+')':''),n:Math.ceil(r.sockets/r.K.own)})}else{rest+=r.sockets;restRooms.push(r.name)}}
      const nRest=Math.ceil(rest/8);for(let i=0;i<nRest;i++)sockC.push({name:'Gniazda – '+(F===lo?'parter':'piętro')+' ('+(i+1)+')',n:Math.round(rest/nRest)})}
    const lightC=[lo,up].map(F=>{const n=rooms.filter(r=>r.f===F).reduce((a,r)=>a+r.lights,0);return {F,n,circ:Math.ceil(n/10)}}).filter(x=>x.n);
    let outdoor=0;if(set.outdoor){const ext=(q.ops?.extDoor||0)+(q.ops?.hst||0);outdoor=Math.max(2,ext)+((q.out?.terrace||0)+(q.out?.coveredTerrace||0)>0?1:0);ded.push({name:'Gniazda i oświetlenie zewnętrzne ('+outdoor+' pkt)',kw:.5,ph:'1f',room:'na zewnątrz'})}
    const nLightC=lightC.reduce((a,x)=>a+x.circ,0)+(outdoor?1:0),nSockC=sockC.length,nDed=ded.filter(d=>d.kw>=.25||/Płyta|Pralka|Zmywarka|Piekarnik/.test(d.name)).length;
    const circuits=nLightC+nSockC+nDed;
    // rozdzielnica: obwody + RCD co ok. 5 obwodów + wyłącznik główny, SPD, kontrolki faz
    const rcd=Math.ceil(circuits/8),threeP=ded.filter(d=>d.ph==='3f').length,modules=circuits+threeP*2+rcd*(threeP?4:2)+4+4+3;
    const boardSize=[24,36,48,72].find(m=>m>=modules*1.2)||72;
    const sub=hasUp&&circuits>24;
    // gdzie rozdzielnica: techniczne / wiatrołap / hol na parterze
    const board=rooms.find(r=>r.f===lo&&r.K.k==='utility')||rooms.find(r=>r.f===lo&&/wiatrołap|wiatrolap/i.test(r.name))||rooms.find(r=>r.f===lo&&r.K.k==='hall')||rooms.find(r=>r.f===lo&&r.K.k==='garage')||rooms.find(r=>r.f===lo);
    const hFloor=(q.G.groundHeight||2.8)+.3;let cable=0,far=null;
    for(const r of rooms){const d=board?(Math.abs(r.cx-board.cx)+Math.abs(r.cy-board.cy))*c*1.25+(r.f!==board.f?hFloor:0)+2:5;r.dist=d;
      cable+=(r.sockets+r.lights+r.switches)*(d*.35+3.5);if(!far||d>far.dist)far=r}
    cable=Math.round(cable/10)*10;
    // moc szczytowa: domowa podstawa + urządzenia ze współczynnikami jednoczesności
    const base=4+.01*q.usableTotal;const big=ded.reduce((a,d)=>a+d.kw,0),maxOne=Math.max(0,...ded.map(d=>d.kw)),peak=Math.round(Math.max(base*.5+big*.5,maxOne+3)*10)/10;
    const conn=CONN.find(([kw])=>kw>=peak)||CONN[CONN.length-1];
    let pv=null;try{if(global.HouserPV&&project.pvSettings?.enabled)pv=HouserPV.compute(project)}catch(_){}
    // koszt
    const points=rooms.reduce((a,r)=>a+r.sockets+r.switches,0)+outdoor,lights=lightPts+outdoor;
    const cost=[];const addC=(name,v,note)=>{if(v>0)cost.push({name,v,note:note||''})};
    addC('Gniazda i łączniki ('+points+' pkt)',points*PRICE.point,'puszki, przewody, osprzęt, robocizna');
    addC('Punkty oświetlenia ('+lights+')',lights*PRICE.light,'bez opraw (lampy osobno)');
    addC('Obwody dla urządzeń ('+nDed+')',nDed*PRICE.dedicated+threeP*PRICE.threePhase,threeP?threeP+' trójfazowe (400 V)':'');
    addC('Rozdzielnica '+boardSize+' modułów',PRICE.board[boardSize],circuits+' obwodów, '+rcd+' różnicówek, ogranicznik przepięć');
    if(sub)addC('Podrozdzielnica na piętrze',PRICE.sub,'krótsze kable, łatwiejsza rozbudowa');
    if(set.ev)addC('Ładowarka auta (wallbox 11 kW)',PRICE.ev,'z obwodem 400 V');
    if(set.smart){const s=cost.reduce((a,x)=>a+x.v,0)*PRICE.smart;addC('Inteligentny dom (sterowanie, czujniki)',s,'ok. +35% do instalacji')}
    const total=cost.reduce((a,x)=>a+x.v,0);
    // uwagi
    const issues=[],good=[];const add=(p,text,tip)=>issues.push({p,text,tip:tip||''});
    if(peak>13.8)add(Math.min(1.5,.3+(peak-13.8)*.08),'Moc szczytowa ok. '+fmt(peak)+' kW – więcej niż typowe przyłącze 14 kW.','We wniosku o warunki przyłączenia podaj ok. '+Math.ceil(conn[0])+' kW (zabezpieczenie '+conn[1]+'); opłata przyłączeniowa będzie wyższa.');
    else good.push('Moc szczytowa ok. '+fmt(peak)+' kW – wystarczy typowe przyłącze 14 kW (3 × 20 A).');
    if(pv&&pv.kWp>Math.max(conn[0],13.8)+.1)add(1,'Fotowoltaika '+fmt(pv.kWp)+' kWp to więcej niż moc przyłączeniowa ('+fmt(Math.max(conn[0],13.8))+' kW) – mikroinstalacja nie może jej przekroczyć.','Zwiększ moc przyłączeniową we wniosku albo zmniejsz instalację PV.');
    else if(pv)good.push('Fotowoltaika '+fmt(pv.kWp)+' kWp mieści się w mocy przyłączeniowej.');
    if(!board)add(1,'Nie ma dobrego miejsca na rozdzielnicę (techniczne, wiatrołap, hol).','Zaplanuj ok. 60 cm ściany w holu lub pomieszczeniu technicznym, blisko wejścia.');
    else good.push('Rozdzielnica: „'+board.name+'” – '+(board.K.k==='utility'?'pomieszczenie techniczne':'blisko wejścia')+'.');
    if(far&&far.dist>22&&!sub)add(.5,'Do pokoju „'+far.name+'” od rozdzielnicy ok. '+fmt(far.dist)+' m przewodu – długie obwody.','Rozdzielnica bliżej środka domu albo podrozdzielnica na piętrze.');
    const dark=rooms.filter(r=>r.noWin&&['bedroom','living','study','kitchen'].includes(r.K.k));for(const r of dark)add(.3,'„'+r.name+'” nie ma okna – potrzebne mocniejsze oświetlenie przez cały dzień.','');
    if(hasUp)good.push('Schody i hole: łączniki schodowe (włączanie światła na dole i na górze).');
    const score=Math.max(0,Math.min(10,Math.round((10-issues.reduce((a,i)=>a+i.p,0))*10)/10));
    return {set,rooms,ded,sockC,lightC,circuits,nLightC,nSockC,nDed,rcd,threeP,modules,boardSize,board,sub,cable,points,lights,outdoor,peak,conn,pv,cost:{items:cost,total},issues,good,score,lo,up,hasUp,W:q.W,H:q.H,c}}
  global.HouserElectric={DEF,PRICE,KINDS,kindOf,evaluate};
})(window);
