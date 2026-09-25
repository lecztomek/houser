// Wentylacja, rekuperacja i klimatyzacja – ocena potrzeby, trudności i kosztu (bez projektowania kanałów).
// HouserHVAC.evaluate(project, settings) -> {rooms, mvhr:{flow, unit, ducts, difficulty, cost, need, savings…}, ac:{rooms, cost…}}
// Wymaga shared/quantities.js, shared/energy.js oraz modules/naslonecznienie/sun.js + calc.js (przegrzewanie pokoi).
(function(global){
  // role pomieszczeń: nawiew (świeże powietrze do pokoi), wywiew (z kuchni i łazienek), przepływ (hol, korytarz)
  // strumienie wg PN-83/B-03430 i praktyki projektowej [m³/h]
  const ROLES=[
    {k:'kitchen',re:/kuchni|aneks/i,role:'ex',flow:s=>s.kitchen==='gas'?70:50,name:'kuchnia'},
    {k:'bath',re:/łazien|lazien/i,role:'ex',flow:()=>50,name:'łazienka'},
    {k:'wc',re:/\bwc\b|toalet/i,role:'ex',flow:()=>30,name:'WC'},
    {k:'laundry',re:/pralni/i,role:'ex',flow:()=>30,name:'pralnia'},
    {k:'utility',re:/techn|kotłown|kotlown|kotł|kotl/i,role:'ex',flow:()=>20,name:'techniczne'},
    {k:'wardrobe',re:/garderob|spiżar|spizar|schowek/i,role:'ex',flow:()=>15,name:'garderoba / spiżarnia'},
    {k:'living',re:/salon|dzienn/i,role:'sup',flow:()=>60,name:'salon',people:3},
    {k:'dining',re:/jadal/i,role:'sup',flow:()=>30,name:'jadalnia',people:2},
    {k:'master',re:/główn|glown/i,role:'sup',flow:()=>40,name:'sypialnia',people:2},
    {k:'bedroom',re:/sypial|pokój|pokoj|dziec|gości|gosci/i,role:'sup',flow:()=>30,name:'pokój',people:1},
    {k:'study',re:/gabinet|biur|pracown/i,role:'sup',flow:()=>30,name:'gabinet',people:1},
    {k:'garage',re:/garaż|garaz/i,role:'none',flow:()=>0,name:'garaż'},
    {k:'hall',re:/hol|korytarz|komunikac|wiatrołap|wiatrolap|antresol|schod/i,role:'pass',flow:()=>0,name:'komunikacja'},
  ];
  const DEF={unit:'auto',kitchen:'electric',ac:'auto',acThreshold:3};
  const PRICE={unit:[[250,9000],[350,11500],[450,14000],[600,17500],[1e9,21000]],duct:75,plenum:1400,vent:280,intake:2600,labour:4500,ceiling:900,
    split:[[2.6,5600],[3.5,6600],[5,8600],[1e9,10500]],multiOut:6500,multiIn:2600,acPipe:160,acInterior:2500,fanW:.3};
  const roleOf=name=>ROLES.find(r=>r.re.test(name||''))||{k:'other',role:'sup',flow:()=>20,name:'inne',people:0};
  const price=(tab,v)=>tab.find(([m])=>v<=m)[1];

  function evaluate(project,settings){
    const set={...DEF,...(settings||{})};
    const q=HouserQuantities.compute(project),c=q.c,lo=q.lo,up=q.up,G=q.G,hasUp=q.net[up]>0;
    const hFloor=(G.groundHeight||2.8)+.3;
    const rooms=q.rooms.filter(r=>r.area>=1).map(r=>{const R=roleOf(r.name);return {...r,key:r.f+'|'+r.id,R,role:R.role,flow:R.flow(set),win:r.winA+r.roofWinA+r.hstA}});
    const byKey=Object.fromEntries(rooms.map(r=>[r.key,r]));
    // ---------- rekuperacja: strumienie
    const persons=Number.isFinite(+project.energySettings?.persons)?+project.energySettings.persons:4;
    const sup=rooms.filter(r=>r.role==='sup'),ex=rooms.filter(r=>r.role==='ex');
    let supSum=sup.reduce((a,r)=>a+r.flow,0);const exSum=ex.reduce((a,r)=>a+r.flow,0);
    const minACH=.5*q.volume,minPeople=persons*30;
    const flow=Math.round(Math.max(exSum,supSum,minPeople,minACH*.8)/10)*10;
    if(supSum>0&&supSum<flow)for(const r of sup)r.flow=Math.round(r.flow*flow/supSum/5)*5; // nawiew do pokoi = strumień domu
    if(exSum>0&&exSum<flow)for(const r of ex)r.flow=Math.round(r.flow*flow/exSum/5)*5;
    // ---------- centrala: strych (dom parterowy / poddasze z nieużytkowym strychem), techniczne, garaż, pralnia
    let unit=null,unitLoft=false;
    if(set.unit==='loft'||(set.unit==='auto'&&!hasUp))unitLoft=true;
    else if(set.unit!=='auto'&&byKey[set.unit])unit=byKey[set.unit];
    else unit=rooms.find(r=>r.R.k==='utility'&&r.f===lo)||rooms.find(r=>r.R.k==='garage')||rooms.find(r=>r.R.k==='laundry')||rooms.find(r=>r.R.k==='utility')||(q.attic?null:rooms.find(r=>r.f===lo&&r.role==='ex'));
    if(!unit&&!unitLoft){unitLoft=true} // bez technicznego – najprościej na strychu / poddaszu nieużytkowym
    const loftFloor=hasUp?up:lo; // strych nad najwyższą kondygnacją
    const minDist=(a,b)=>{let best=1e9;for(const [x1,y1] of a.cells)for(const [x2,y2] of b.cells){const d=Math.abs(x1-x2)+Math.abs(y1-y2);if(d<best)best=d}return Math.max(0,best-1)*c};
    // centrum domu (dla centrali na strychu)
    const allCells=rooms.flatMap(r=>r.cells),cx=allCells.reduce((a,p)=>a+p[0],0)/allCells.length,cy=allCells.reduce((a,p)=>a+p[1],0)/allCells.length;
    const loftUnit={cells:[[Math.round(cx),Math.round(cy)]]};
    let hardRooms=0;
    for(const r of [...sup,...ex]){
      if(unitLoft){const hor=minDist(r,loftUnit);r.duct=hor+2+(r.f===lo&&hasUp?hFloor:0)+1;r.route=r.f===loftFloor?'strych':(q.attic||G.upperType==='attic'?'przez ściankę kolankową / szacht':'szacht przez piętro');
        r.hard=r.f===lo&&hasUp;}
      else{const hor=minDist(r,unit);r.duct=hor+2+(r.f!==unit.f?hFloor:0);
        if(r.f===lo){r.route=hasUp?'w stropie nad parterem (sufit podwieszany w holu)':'na strychu nad parterem';r.hard=hasUp}
        else{r.route='szachtem na strych, nad sufitem piętra';r.hard=false}}
      r.vents=r.area>30?2:1;if(r.hard)hardRooms++}
    const ductLen=[...sup,...ex].reduce((a,r)=>a+r.duct,0)+6; // + czerpnia i wyrzutnia
    const vents=[...sup,...ex].reduce((a,r)=>a+r.vents,0);
    const avgDuct=[...sup,...ex].length?ductLen/[...sup,...ex].length:0;
    // trudność 0–10 (10 = łatwo)
    let diff=10;const dIss=[];const dAdd=(p,t,tip)=>{if(p<=0)return;diff-=p;dIss.push({p:Math.round(p*10)/10,text:t,tip})};
    if(!unitLoft&&!unit)dAdd(2,'Nie ma dobrego miejsca na centralę (techniczne, garaż, strych).','Zarezerwuj ok. 1,5 m² w pomieszczeniu technicznym, garażu albo na strychu – centrala waży ok. 50 kg i potrzebuje odpływu skroplin.');
    if(avgDuct>8)dAdd(Math.min(2.5,(avgDuct-8)/3),'Długie kanały: średnio '+fmt1(avgDuct)+' m do pokoju.','Centrala w środku domu (lub na strychu nad środkiem) skraca kanały i obniża koszt.');
    if(hardRooms)dAdd(Math.min(3,hardRooms*.5),hardRooms+' '+pl(hardRooms,'pomieszczenie wymaga','pomieszczenia wymagają','pomieszczeń wymaga')+' prowadzenia kanałów w stropie między kondygnacjami (sufity podwieszane albo kanały płaskie w wylewce).','Zaplanuj sufit podwieszany w holu / korytarzu parteru (ok. 20 cm) – tam rozprowadzisz kanały do pokoi.');
    if(hasUp&&G.upperType==='attic')diff+=0; // poddasze: kanały w przestrzeni nad sufitem – bez kary
    diff=Math.max(0,Math.min(10,Math.round(diff*10)/10));
    // koszt rekuperacji
    const cost={unit:price(PRICE.unit,flow),ducts:ductLen*PRICE.duct,plenum:2*PRICE.plenum,vents:vents*PRICE.vent,intake:PRICE.intake,labour:PRICE.labour,ceilings:hardRooms*PRICE.ceiling};
    cost.total=Object.values(cost).reduce((a,b)=>a+b,0);
    // ---------- potrzeba rekuperacji: szczelność, pomieszczenia bez okien, oszczędność energii
    let saving=null,fanCost=null,payback=null,heatSave=null;
    try{const es=project.energySettings||{};const pg={...project,energySettings:{...es,vent:'grav'}},pm={...project,energySettings:{...es,vent:'mech',eta:es.eta??85}};
      const Eg=HouserEnergy.compute(pg),Em=HouserEnergy.compute(pm),S=Em.s,priceHeat=S.pEl/S.scop;
      heatSave=Math.max(0,Eg.Qh-Em.Qh);fanCost=PRICE.fanW*flow*8760/1000*S.pEl;saving=heatSave*priceHeat-fanCost;payback=saving>50?cost.total/saving:null}catch(e){console.error(e)}
    const inf=Number.isFinite(+project.energySettings?.inf)?+project.energySettings.inf:.1;
    const dark=ex.filter(r=>r.win<.2&&(r.R.k==='bath'||r.R.k==='wc'));
    const openKitchen=rooms.some(r=>r.R.k==='kitchen'&&Object.values(q.runs||[]).length>=0&&project.openings?.[r.f]&&Object.entries(project.openings[r.f]).some(([k,v])=>v==='opening'));
    let needPts=0;const why=[];
    if(inf<=.2){needPts+=3;why.push('Dom szczelny (infiltracja '+String(inf).replace('.',',')+' 1/h) – wentylacja grawitacyjna słabo działa w szczelnym domu, będzie wilgoć i duszno.')}else why.push('Dom mniej szczelny – wentylacja grawitacyjna będzie jakoś działać.');
    if(dark.length){needPts+=2;why.push('Pomieszczenia bez okna: '+dark.map(r=>r.name).join(', ')+' – wymagają wentylacji mechanicznej.')}
    if(heatSave!=null&&heatSave>1500){needPts+=2;why.push('Odzysk ciepła: ok. '+fmt0(heatSave)+' kWh/rok mniej na ogrzewanie.')}
    if(q.usableTotal>120){needPts+=1;why.push('Duży dom – bez rekuperacji trzeba wietrzyć wiele pokoi.')}
    why.push('Rekuperacja daje stałe świeże powietrze z filtrem (pyłki, smog) przy zamkniętych oknach.');
    const need=needPts>=5?'high':needPts>=3?'mid':'low';
    // ---------- klimatyzacja: pokoje z ryzykiem przegrzania (moduł Nasłonecznienie)
    let solar=null;try{solar=HouserSolar.compute(project)}catch(e){console.error(e)}
    const acRooms=[];
    if(solar)for(const s of solar.list){const r=byKey[s.key]||byKey[s.f+'|'+s.id];if(!r||r.role==='ex'||r.role==='none'||r.role==='pass')continue;
      const people=r.R.people||1,load=s.peakW+people*80+(r.R.k==='living'||r.R.k==='kitchen'?250:100)+r.area*(s.attic?22:10);
      r.solarRisk=s.risk;r.coolW=load;
      const wanted=set.ac==='none'?false:set.ac==='all'?true:s.risk>=set.acThreshold;
      if(wanted){const kW=load/1000*1.15,ext=r.extEdges>0;acRooms.push({key:r.key,name:r.name,f:r.f,risk:s.risk,kW,size:kW<=2.6?2.5:kW<=3.5?3.5:kW<=5?5:7,ext,cells:r.cells})}}
    const acSplit=acRooms.reduce((a,r)=>a+price(PRICE.split,r.kW)+(r.ext?0:PRICE.acInterior),0);
    const pipe=acRooms.reduce((a,r)=>a+(r.ext?4:9)+(r.f===up&&hasUp?0:0),0);
    const acMulti=acRooms.length?Math.ceil(acRooms.length/4)*PRICE.multiOut+acRooms.length*PRICE.multiIn+pipe*PRICE.acPipe+acRooms.filter(r=>!r.ext).length*PRICE.acInterior:0;
    const hot=solar?solar.list.filter(s=>s.risk>=3&&byKey[s.key]?.role==='sup').length:0,warm=solar?solar.list.filter(s=>s.risk===2&&byKey[s.key]?.role==='sup').length:0;
    const acNeed=hot>=2||solar?.list.some(s=>s.risk>=3&&s.attic)?'high':hot+warm>=2?'mid':'low';
    const acDiff=acRooms.length?Math.max(0,10-acRooms.filter(r=>!r.ext).length*2-(acRooms.length>4?1:0)):10;
    return {q,set,rooms,sup,ex,flow,persons,supSum,exSum,unit,unitLoft,loftFloor,loftUnit,ductLen,vents,avgDuct,hardRooms,difficulty:diff,dIss,cost,heatSave,fanCost,saving,payback,need,why,dark,
      ac:{rooms:acRooms,split:acSplit,multi:acMulti,best:acRooms.length?Math.min(acSplit,acMulti):0,need:acNeed,hot,warm,difficulty:acDiff},hasUp,lo,up,W:q.W,H:q.H,c};
  }
  const fmt1=v=>(Math.round(v*10)/10).toLocaleString('pl-PL'),fmt0=v=>Math.round(v).toLocaleString('pl-PL');
  const pl=(n,a,b,c)=>{const d=n%10,t=n%100;return n===1?a:d>=2&&d<=4&&(t<12||t>14)?b:c};
  global.HouserHVAC={ROLES,DEF,PRICE,roleOf,evaluate};
})(window);
