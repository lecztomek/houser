// Przepisy – uproszczone sprawdzenie z warunkami technicznymi (WT 2021): okna, wysokości, powierzchnie, drzwi, schody.
// HouserRules.check(project) -> {q, out:[{grp,room,f,kind,name,st:'ok'|'warn'|'bad'|'info',val,req,ref,fix}]}
// Wymaga shared/quantities.js i shared/stairs.js.
(function(global){
let project=null;
const m=v=>(Math.round(v*100)/100).toLocaleString('pl-PL')+' m',m2=v=>(Math.round(v*10)/10).toLocaleString('pl-PL')+' m²';
function kindOf(name){const n=(name||'').toLowerCase();
  if(/łazien|lazien|\bwc\b|toalet/.test(n))return 'bath';if(/kuchni|aneks/.test(n))return 'kitchen';
  if(/salon|dzienn|jadal|pokój|pokoj|sypial|gabinet|gościn|goscin|dziec|biuro/.test(n))return 'living';
  return 'aux'}
const KIND_PL={living:'pokój mieszkalny',kitchen:'kuchnia',bath:'łazienka / WC',aux:'pomieszczenie pomocnicze'};

function checks(){
  const q=HouserQuantities.compute(project),out=[],G=q.G,add=(o)=>out.push(o);
  const floorName=f=>f===q.lo?'parter':(q.attic?'poddasze':'piętro');
  for(const r of q.rooms){const k=kindOf(r.name),grp=r.f+'|'+r.id,base={grp,room:r.name,f:r.f,kind:k};if(r.area<0.3)continue;
    // oświetlenie dzienne
    if(k==='living'||k==='kitchen'){const gl=r.winA+r.hstA+r.roofWinA,ratio=gl/r.area;
      if(gl<=0)add({...base,name:'Okno (oświetlenie dzienne)',st:k==='living'?'bad':'warn',val:'brak okna',req:k==='living'?'pokój musi mieć okno':'kuchnia bez okna – potrzebna wentylacja mechaniczna',ref:'§ 57, § 94',fix:'Dodaj okno na ścianie zewnętrznej w module Układ pomieszczeń.'});
      else add({...base,name:'Powierzchnia okien do podłogi',st:ratio>=1/8?'ok':'bad',val:'1 : '+(Math.round(10/ratio)/10).toLocaleString('pl-PL')+' ('+m2(gl)+' okien)',req:'co najmniej 1 : 8 ('+m2(r.area/8)+')',ref:'§ 57 ust. 2',fix:ratio<1/8?'Powiększ okna (moduł Okna i drzwi – wysokość) albo dodaj kolejne; brakuje ok. '+m2(r.area/8-gl)+'.':''})}
    // wysokość
    const req=k==='living'||k==='kitchen'?2.5:2.2;
    if(r.f===q.up&&q.attic){if(k!=='aux'||r.area>=2){const share=r.areaH22/r.area;add({...base,name:'Wysokość na poddaszu',st:share>=.5?'ok':'bad',val:Math.round(share*100)+'% powierzchni ma ≥ 2,2 m (od '+m(r.minH)+' do '+m(r.maxH)+')',req:'≥ 2,2 m na co najmniej połowie powierzchni',ref:'§ 72 ust. 2',fix:share<.5?'Podnieś ściankę kolankową albo zwiększ kąt dachu (moduł Kondygnacje i dach).':''})}}
    else{const h=r.maxH;add({...base,name:'Wysokość pomieszczenia',st:h>=req-1e-6?'ok':'bad',val:m(h),req:'≥ '+m(req),ref:'§ 72',fix:h<req?'Zwiększ wysokość kondygnacji w module Kondygnacje i dach.':''})}
    // powierzchnia (zalecenia)
    if(k==='living'){const n=r.name.toLowerCase();
      if(/salon|dzienn/.test(n))add({...base,name:'Powierzchnia pokoju dziennego',st:r.area>=16?'ok':'warn',val:m2(r.area),req:'zalecane ≥ 16 m²',ref:'§ 94 ust. 1 (mieszkania)',fix:r.area<16?'Pokój dzienny jest mały – rozważ powiększenie w Układzie pomieszczeń.':''});
      else add({...base,name:'Powierzchnia pokoju',st:r.area>=8?'ok':'warn',val:m2(r.area),req:'zalecane ≥ 8 m²',ref:'§ 94 (mieszkania)',fix:r.area<8?'Pokój poniżej 8 m² – nadaje się raczej na garderobę lub gabinet.':''})}
    // wentylacja łazienki/kuchni
    if(k==='bath'&&r.wins+r.roofWins===0)add({...base,name:'Wentylacja',st:'info',val:'bez okna',req:'wymagana wentylacja wywiewna (kanał lub mechaniczna)',ref:'§ 149',fix:'Zaplanuj kanał wentylacyjny albo rekuperację.'});
    // drzwi do pomieszczenia
    for(const d of r.doors){if(d.ext)continue;const clear=d.w-.1,need=k==='bath'?.7:(k==='living'||k==='kitchen'?.8:.7);
      const rk=x=>({living:3,kitchen:3,bath:2,aux:1})[kindOf(x.name)],other=d.rooms.find(x=>x!==r); // każde drzwi raz – od strony ważniejszego pomieszczenia
      if(other&&(rk(other)>rk(r)||(rk(other)===rk(r)&&d.rooms[0]!==r)))continue;
      add({...base,name:'Szerokość drzwi',st:clear>=need-1e-6?'ok':'bad',val:m(clear)+' w świetle (otwór '+m(d.w)+')',req:'≥ '+m(need),ref:'§ 62',fix:clear<need?'Poszerz drzwi na rzucie o kolejną kratkę.':''});
      if(d.h<2.0-1e-6)add({...base,name:'Wysokość drzwi',st:d.info?.variant==='low'?'warn':'bad',val:m(d.h),req:'≥ 2,0 m (niższe tylko do schowków)',ref:'§ 62',fix:'Zmień wysokość w module Drzwi wewnętrzne.'})}
  }
  // drzwi wejściowe
  const ext=q.runs.filter(r=>r.base==='door'&&r.ext);
  if(!ext.length)add({grp:'bud',room:'Budynek',name:'Drzwi wejściowe',st:'bad',val:'brak',req:'budynek musi mieć wejście',ref:'§ 61',fix:'Wstaw drzwi na ścianie zewnętrznej.'});
  for(const d of ext){const clear=d.w-.1,room=d.rooms[0]?.name||'';add({grp:'bud',room:'Budynek',name:'Drzwi zewnętrzne'+(room?' ('+room+')':''),st:clear>=.9-1e-6?'ok':'bad',val:m(clear)+' w świetle',req:'≥ 0,90 m',ref:'§ 62 ust. 1',fix:clear<.9?'Poszerz drzwi zewnętrzne.':''})}
  // schody
  for(const s of project.stairs||[]){const H=G.groundHeight,cf=HouserStairs.comfort(s,H),w=+s.width||.9,nm={straight:'proste',L:'w kształcie L',U:'zabiegowe 180°',spiral:'kręcone'}[s.type]||s.type,base={grp:'stairs',room:'Schody '+nm};
    add({...base,name:'Szerokość biegu',st:w>=.8-1e-6?'ok':'bad',val:m(w),req:'≥ 0,80 m',ref:'§ 68 ust. 1',fix:w<.8?'Zwiększ szerokość w module Schody.':''});
    add({...base,name:'Wysokość stopnia',st:cf.rise<=.19+1e-6?'ok':'bad',val:(cf.rise*100).toFixed(1)+' cm',req:'≤ 19 cm',ref:'§ 68 ust. 1',fix:cf.rise>.19?'Dodaj stopni w module Schody.':''});
    if(s.type!=='spiral')add({...base,name:'Wygoda (2h + s)',st:cf.step>=.59&&cf.step<=.66?'ok':'warn',val:(cf.step*100).toFixed(0)+' cm',req:'60–65 cm',ref:'§ 68 ust. 5',fix:!(cf.step>=.59&&cf.step<=.66)?'Dopasuj głębokość stopnia lub liczbę stopni.':''});
    add({...base,name:'Prześwit nad schodami',st:'info',val:'otwór w stropie wg modułu Schody',req:'≥ '+m(HouserStairs.HEADROOM),ref:'§ 68 ust. 7',fix:''})}
  if(!(project.stairs||[]).length&&q.net[q.up]>0)add({grp:'stairs',room:'Schody',name:'Schody na piętro',st:'warn',val:'brak w module Schody',req:'dostęp do kondygnacji',ref:'§ 68',fix:'Wstaw schody w module Schody – wtedy sprawdzę ich wymiary.'});
  // ogólne
  add({grp:'gen',room:'Ogólne',name:'Balustrady (antresola, schody, loggia)',st:'info',val:'—',req:'wysokość ≥ 1,10 m, prześwity ≤ 12 cm',ref:'§ 298',fix:''});
  add({grp:'gen',room:'Ogólne',name:'Izolacyjność cieplna przegród',st:'info',val:'zobacz moduł Energia',req:'U ściany ≤ 0,20, dachu ≤ 0,15, okna ≤ 0,9 W/m²K',ref:'zał. 2 WT 2021',fix:''});
  add({grp:'gen',room:'Ogólne',name:'Odległość od granic działki',st:'info',val:'brak danych o działce',req:'4 m (ściana z oknami) / 3 m (bez okien)',ref:'§ 12',fix:''});
  return {q,out};
}
global.HouserRules={kindOf,KIND_PL,check:p=>{const o=project;project=p;try{return checks()}finally{project=o}}};
})(window);
