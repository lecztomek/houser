// Wycena budowy z projektu – wspólna dla modułów Wycena i Porównanie.
// HouserCost.compute(project) -> {rows (pozycje: ilość × cena materiału / robocizny), subM, subL, total, totalM, totalL…}
// Wymaga shared/quantities.js.
(function(global){
let project=null;
const quantities=()=>HouserQuantities.compute(project);
// ---------- pozycje wyceny: [id, etap, nazwa, jm, ilość(q), cena domyślna, grupa standardu (fin = wykończenie/instalacje), opis ilości, domyślnie włączona]
const STAIR_PRICE={straight:16000,L:19000,U:22000,spiral:24000},STAIR_PL={straight:'proste',L:'L',U:'U (180°)',spiral:'kręcone'};
const ITEMS=[
  ['found','Stan zerowy','Fundamenty (ławy, ściany fundamentowe, izolacje)','m²',q=>q.foot,650,0,'powierzchnia zabudowy'],
  ['groundslab','Stan zerowy','Podłoga na gruncie (podsypka, chudziak, izolacja)','m²',q=>Object.values(q.net)[0]??q.foot,260,0,'powierzchnia parteru'],
  ['utilities','Stan zerowy','Przyłącza (prąd, woda, kanalizacja)','kpl',()=>1,25000,0,'ryczałt'],
  ['extwalls','Stan surowy otwarty','Ściany zewnętrzne (mur z robocizną)','m²',q=>q.extNet,320,0,'ściany netto bez otworów, ze szczytami'],
  ['partwalls','Stan surowy otwarty','Ściany działowe','m²',q=>q.partA,170,0,'długość × wysokość kondygnacji'],
  ['glasswalls','Elewacja i wykończenie','Ścianki szklane (aluminium + szkło hartowane, z montażem)','m²',q=>q.glassA||0,1300,1,'długość × wysokość kondygnacji'],
  ['slab','Stan surowy otwarty','Strop nad parterem','m²',q=>q.slab,430,0,'powierzchnia piętra bez otworów w stropie'],
  ['structExtra','Stan surowy otwarty','Wzmocnienia konstrukcji (podciągi, nadproża, wsporniki)','kpl',()=>0,0,0,'moduł Konstrukcja'],
  ['roofExtra','Stan surowy otwarty','Konstrukcja dachu – dopłaty (płatwie, słupy, belka kalenicowa, usztywnienia przy pustce)','kpl',()=>0,0,0,'moduł Konstrukcja dachu'],
  ['stairs','Stan surowy otwarty','Schody','szt',q=>q.stairs.length,null,0,q=>q.stairs.map(t=>STAIR_PL[t]||t).join(', ')||'brak'],
  ['chimney','Stan surowy otwarty','Komin','szt',q=>q.chimneys,9000,0,'z rzutu'],
  ['roof','Stan surowy otwarty','Dach: więźba, membrana, łaty, pokrycie','m²',q=>q.roofA,480,0,'połacie z okapami'],
  ['gutters','Stan surowy otwarty','Rynny, obróbki blacharskie','mb',q=>q.gutter,220,0,'długość okapów'],
  ['soffit','Stan surowy otwarty','Podbitka dachu','m²',q=>q.soffitA,190,1,'spód okapów i wysunięć'],
  ['balcony','Stan surowy otwarty','Balkony (płyta, hydroizolacja, posadzka, balustrada)','m²',q=>q.balc?.area||0,2800,0,q=>q.balc?.n?q.balc.n+' szt. · balustrada '+(Math.round(q.balc.rail*10)/10)+' m':'moduł Balkony'],
  ['windows','Stan surowy zamknięty','Okna','m²',q=>q.ops.winA,1300,1,q=>q.ops.win+' szt.'],
  ['roofwin','Stan surowy zamknięty','Okna dachowe z kołnierzami','szt',q=>q.ops.roofWin,3800,1,'z projektu'],
  ['hst','Stan surowy zamknięty','Drzwi tarasowe przesuwne (HST)','m²',q=>q.ops.hstA,3000,1,q=>q.ops.hst+' szt.'],
  ['blinds','Stan surowy zamknięty','Rolety, żaluzje, markizy','szt',q=>q.ops.blinds||0,1500,0,'moduł Okna i drzwi (osłona przy oknie) albo Nasłonecznienie'],
  ['extdoor','Stan surowy zamknięty','Drzwi zewnętrzne','szt',q=>q.ops.extDoor,6500,1,'z projektu'],
  ['elec','Instalacje','Instalacja elektryczna','m²',q=>q.usableTotal,170,1,'powierzchnia użytkowa'],
  ['plumb','Instalacje','Instalacja wodno-kanalizacyjna','m²',q=>q.usableTotal,130,1,'powierzchnia użytkowa'],
  ['plumbExtra','Instalacje','Dopłata za układ instalacji wod-kan','kpl',()=>0,0,1,'moduł Hydraulika'],
  ['heatsrc','Instalacje','Źródło ciepła (pompa ciepła z montażem)','kpl',()=>1,45000,1,'ryczałt'],
  ['floorheat','Instalacje','Ogrzewanie podłogowe','m²',q=>q.usableTotal,120,1,'powierzchnia użytkowa'],
  ['vent','Instalacje','Wentylacja mechaniczna z rekuperacją','m²',q=>q.usableTotal,170,1,'powierzchnia użytkowa'],
  ['ac','Instalacje','Klimatyzacja','kpl',()=>0,0,1,'moduł Klimatyzacja',false],
  ['facade','Elewacja i wykończenie','Ocieplenie i tynk elewacji','m²',q=>q.extNet,290,1,'ściany zewnętrzne netto'],
  ['plaster','Elewacja i wykończenie','Tynki wewnętrzne / sufity','m²',q=>q.plaster,65,1,'ściany od środka i sufity'],
  ['screed','Elewacja i wykończenie','Wylewki z ociepleniem podłóg','m²',q=>Object.values(q.net).reduce((a,b)=>a+b,0),120,1,'powierzchnia podłóg'],
  ['floors','Elewacja i wykończenie','Posadzki (panele, deska, płytki)','m²',q=>Object.values(q.net).reduce((a,b)=>a+b,0),220,1,'powierzchnia podłóg'],
  ['paint','Elewacja i wykończenie','Malowanie','m²',q=>q.plaster,28,1,'ściany i sufity'],
  ['intdoor','Elewacja i wykończenie','Drzwi wewnętrzne z montażem','szt',q=>q.ops.intDoor,1500,1,'z projektu'],
  ['glassdoors','Elewacja i wykończenie','Dopłata: drzwi szklane (szkło hartowane, okucia)','szt',q=>q.ops.glassDoor||0,2200,1,'wariant „Szklane” w module Drzwi wewnętrzne / Okna i drzwi'],
  ['luminaires','Elewacja i wykończenie','Oprawy oświetleniowe (lampy)','kpl',()=>0,0,1,'moduł Oświetlenie'],
  ['baths','Elewacja i wykończenie','Łazienki (płytki, biały montaż, armatura)','szt',q=>q.baths,24000,1,'pomieszczenia „łazienka”'],
  ['wc','Elewacja i wykończenie','WC','szt',q=>q.wcs,12000,1,'pomieszczenia „WC”'],
  ['kitchen','Elewacja i wykończenie','Zabudowa kuchenna z AGD','kpl',()=>1,35000,1,'ryczałt',false],
  ['terrace','Na zewnątrz','Taras','m²',q=>q.out.terrace,450,1,'z modułu Tarasy'],
  ['covterrace','Na zewnątrz','Taras zadaszony','m²',q=>q.out.coveredTerrace,1100,1,'z modułu Tarasy'],
  ['pergola','Na zewnątrz','Pergola','m²',q=>q.out.pergola,700,1,'z modułu Tarasy'],
  ['garage','Na zewnątrz','Garaż wolnostojący / wiata','kpl',()=>0,0,0,'moduł Garaż'],
  ['site','Na zewnątrz','Zagospodarowanie działki (podjazd, chodniki, trawnik, ogrodzenie)','kpl',()=>0,0,0,'moduł Działka – włącz, jeśli liczysz z budową',false],
  ['design','Inne','Projekt, adaptacja, formalności','kpl',()=>1,18000,0,'ryczałt'],
  ['manager','Inne','Kierownik budowy, geodeta','kpl',()=>1,10000,0,'ryczałt'],
];
const STD={eco:.85,std:1,high:1.35};
// udział materiałów w cenie jednostkowej (reszta = robocizna / usługa)
const MAT={blinds:.7,found:.6,groundslab:.6,utilities:.7,extwalls:.55,partwalls:.5,slab:.6,stairs:.65,chimney:.6,roof:.6,gutters:.55,soffit:.5,windows:.85,roofwin:.8,hst:.88,extdoor:.85,
  elec:.45,plumb:.45,structExtra:.55,roofExtra:.55,heatsrc:.8,floorheat:.55,vent:.65,facade:.45,plaster:.35,screed:.5,floors:.6,paint:.3,intdoor:.75,glassdoors:.8,luminaires:.85,baths:.6,wc:.6,kitchen:.85,terrace:.6,covterrace:.6,pergola:.6,garage:.55,site:.5,design:0,manager:0};
function cs(){const s=project.costSettings||{};return {std:STD[s.std]?s.std:'std',factor:Number.isFinite(+s.factor)&&+s.factor>0?+s.factor:1,prices:s.prices||{},mat:s.mat||{},lab:s.lab||{},off:s.off||{},on:s.on||{},reserve:Number.isFinite(+s.reserve)?+s.reserve:10}}
// koszty z modułów (gdy ich obliczenia są załadowane na stronie): wentylacja wybrana w module Wentylacja, instalacja
// grzewcza z modułu Instalacja grzewcza, wod-kan z Hydrauliki, klimatyzacja. Bez nich – stawki za m² jak wyżej.
function fromModules(){const D={};const T=f=>{try{return f()}catch(e){console.warn(e);return null}};
  if(global.HouserHVAC){const M=T(()=>HouserHVAC.methods(project,project.hvacSettings));if(M?.chosen)D.vent={name:'Wentylacja: '+M.chosen.name.replace(/^Wentylacja /,'').toLowerCase(),total:M.chosen.invest,how:'z modułu Wentylacja'};
    const V=M?.res;if(V?.ac&&V.ac.rooms.length)D.ac={name:'Klimatyzacja ('+V.ac.rooms.length+' '+(V.ac.rooms.length===1?'pokój':V.ac.rooms.length<5?'pokoje':'pokoi')+')',total:V.ac.best,how:'z modułu Klimatyzacja – włącz, jeśli planujesz'}}
  // instalacja grzewcza: zaprojektowana albo domyślna (pompa ciepła + podłogówka) – liczona tak samo jak w Ogrzewaniu i Porównaniu
  if(global.HouserHeatSys){const R=T(()=>HouserHeatSys.evaluate(project));if(R){const src=R.designed?'z modułu Instalacja grzewcza':'domyślna instalacja (nie zaprojektowano w module Instalacja grzewcza)';D.heatsrc={name:'Źródło ciepła: '+R.name.toLowerCase(),total:R.investSrc,how:src+' – źródła, bufor, komin'};D.floorheat={name:'Instalacja grzewcza w pokojach',total:R.invest-R.investSrc,how:src+' – podłogówka, grzejniki, rozdzielacze, rury'}}}
  // wod-kan: stawka za m² + dopłata za układ z Hydrauliki (dalekie łazienki, przesunięte piony, cyrkulacja)
  if(global.HouserPlumbing){const P=T(()=>HouserPlumbing.evaluate(project,project.plumbingSettings));if(P&&P.extra>0)D.plumbExtra={name:'Dopłata za układ instalacji wod-kan',total:P.extra,how:'z modułu Hydraulika – dłuższe rury i piony niż w układzie zwartym'}}
  // instalacja elektryczna: punkty, obwody, rozdzielnica (moduł Elektryka i oświetlenie)
  if(global.HouserElectric){const L=T(()=>HouserElectric.evaluate(project));if(L&&L.cost.total>0)D.elec={name:'Instalacja elektryczna ('+L.points+' gniazd i łączników, '+L.lights+' punktów światła, '+L.circuits+' obwodów)',total:L.cost.total,how:'z modułu Elektryka i oświetlenie – bez opraw oświetleniowych'}}
  // konstrukcja: podciągi, belki nad szerokimi otworami, wsporniki, słupy (moduł Konstrukcja)
  if(global.HouserRoof){const Rf=T(()=>HouserRoof.evaluate(project));if(Rf&&Rf.ok&&Rf.cost.total>0)D.roofExtra={name:'Konstrukcja dachu – dopłaty ('+Rf.cost.items.length+')',total:Rf.cost.total,how:'z modułu Konstrukcja dachu – '+Rf.cost.items.slice(0,3).map(x=>x.name.toLowerCase()).join(', ')+(Rf.cost.items.length>3?'…':'')}}
  if(global.HouserStructure){const K=T(()=>HouserStructure.evaluate(project));if(K&&K.cost.total>0)D.structExtra={name:'Wzmocnienia konstrukcji ('+K.cost.items.length+')',total:K.cost.total,how:'z modułu Konstrukcja – '+K.cost.items.slice(0,3).map(x=>x.name.toLowerCase()).join(', ')+(K.cost.items.length>3?'…':'')}}
  // lampy rozmieszczone w module Oświetlenie (bez punktów świetlnych – te w instalacji elektrycznej)
  if(global.HouserLight&&project.lighting?.lamps){const all=Object.values(project.lighting.lamps).flat().filter(Boolean),T=HouserLight.TYPES,v=all.reduce((a,L)=>a+(T[L.type]?.price||0),0);if(v>0)D.luminaires={name:'Oprawy oświetleniowe ('+all.length+' lamp)',total:v,how:'z modułu Oświetlenie – orientacyjnie, ceny średnie'}}
  // garaż wolnostojący / wiata (moduł Garaż) i zagospodarowanie działki (moduł Działka – tylko gdy działka narysowana)
  if(global.HouserGarage){const G=T(()=>HouserGarage.evaluate(project));if(G&&G.cost.total>0)D.garage={name:G.name+' ('+G.cars+' '+(G.cars===1?'auto':'auta')+', '+Math.round(G.area)+' m²)',total:G.cost.total,how:'z modułu Garaż'}}
  if(global.HouserSite&&project.site){const S=T(()=>HouserSite.evaluate(project));if(S&&S.cost.site>0)D.site={name:'Zagospodarowanie działki ('+Math.round(S.plot.area)+' m²)',total:S.cost.site,how:'z modułu Działka – podjazd, chodniki, trawnik, ogrodzenie, nasadzenia; włącz, jeśli liczysz z budową'}}
  return D}
function compute(){
  const q=quantities(),s=cs(),rows=[],DYN=fromModules();
  for(let [id,stage,name,unit,qf,defPrice,fin,how,defOn] of ITEMS){
    const dy=DYN[id];if(dy){unit='kpl';name=dy.name;how=dy.how;qf=()=>1;defPrice=dy.total;fin=0}
    const qty=Math.max(0,qf(q)||0);if((id==='glasswalls'||id==='glassdoors'||id==='luminaires'||id==='garage'||id==='site')&&!qty)continue; // pozycje tylko gdy są ścianki szklane / garaż / działka
    let base=defPrice;if(id==='windows'&&q.ops.winA>0&&q.ops.winCost)base=q.ops.winCost/q.ops.winA;if(id==='hst'&&q.ops.hstA>0&&q.ops.hstCost)base=q.ops.hstCost/q.ops.hstA;if(id==='roofwin'&&q.ops.roofWin>0&&q.ops.roofWinCost)base=q.ops.roofWinCost/q.ops.roofWin;if(id==='blinds'&&q.ops.blinds>0)base=q.ops.blindCost/q.ops.blinds; // średnia z cen okien wg typu (moduł Okna i drzwi)
    if(id==='stairs')base=q.stairs.length?q.stairs.reduce((a,t)=>a+(STAIR_PRICE[t]||18000),0)/q.stairs.length:18000;const ek=+project.envelopePriceK?.[id];if(ek>0)base*=ek; // mur, elewacja, okna wg modułu Ocieplenie i elewacja
    const def=base*(fin?STD[s.std]:1)*s.factor,share=MAT[id]??.6,old=s.prices[id]!=null?+s.prices[id]:null; // starsze zapisy: jedna cena -> dzielona wg udziału
    const defMat=def*share,defLab=def*(1-share),mat=s.mat[id]!=null?+s.mat[id]:(old!=null?old*share:defMat),lab=s.lab[id]!=null?+s.lab[id]:(old!=null?old*(1-share):defLab);
    const on=s.off[id]?false:(defOn===false?!!s.on[id]:true),vm=on?qty*mat:0,vl=on?qty*lab:0;
    rows.push({id,stage,name,unit,qty,mat,lab,defMat,defLab,customMat:s.mat[id]!=null||old!=null,customLab:s.lab[id]!=null||old!=null,on,how:typeof how==='function'?how(q):how,vm,vl,value:vm+vl})}
  const subM=rows.reduce((a,r)=>a+r.vm,0),subL=rows.reduce((a,r)=>a+r.vl,0),sub=subM+subL,k=s.reserve/100;
  // podział do porównań: sam dom / garaż wolnostojący lub wiata / zagospodarowanie działki (z rezerwą); siteFull – działka także gdy niewliczona
  const part=id=>rows.filter(r=>r.id===id).reduce((a,r)=>a+r.value,0)*(1+k),garage=part('garage'),site=part('site'),sr=rows.find(r=>r.id==='site');
  return {q,s,rows,subM,subL,sub,reserve:sub*k,reserveM:subM*k,reserveL:subL*k,total:sub*(1+k),totalM:subM*(1+k),totalL:subL*(1+k),
    house:sub*(1+k)-garage-site,garage,site,siteOn:!!sr?.on,siteFull:sr?sr.qty*(sr.mat+sr.lab)*(1+k):0};
}

const withP=fn=>p=>{const o=project;project=p;try{return fn()}finally{project=o}};
global.HouserCost={ITEMS,STD,MAT,STAIR_PRICE,STAIR_PL,settings:withP(cs),compute:withP(compute)};
})(window);
