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
  ['slab','Stan surowy otwarty','Strop nad parterem','m²',q=>q.slab,430,0,'powierzchnia piętra bez otworów w stropie'],
  ['stairs','Stan surowy otwarty','Schody','szt',q=>q.stairs.length,null,0,q=>q.stairs.map(t=>STAIR_PL[t]||t).join(', ')||'brak'],
  ['chimney','Stan surowy otwarty','Komin','szt',q=>q.chimneys,9000,0,'z rzutu'],
  ['roof','Stan surowy otwarty','Dach: więźba, membrana, łaty, pokrycie','m²',q=>q.roofA,480,0,'połacie z okapami'],
  ['gutters','Stan surowy otwarty','Rynny, obróbki blacharskie','mb',q=>q.gutter,220,0,'długość okapów'],
  ['soffit','Stan surowy otwarty','Podbitka dachu','m²',q=>q.soffitA,190,1,'spód okapów i wysunięć'],
  ['windows','Stan surowy zamknięty','Okna','m²',q=>q.ops.winA,1300,1,q=>q.ops.win+' szt.'],
  ['roofwin','Stan surowy zamknięty','Okna dachowe z kołnierzami','szt',q=>q.ops.roofWin,3800,1,'z projektu'],
  ['hst','Stan surowy zamknięty','Drzwi tarasowe przesuwne (HST)','m²',q=>q.ops.hstA,3000,1,q=>q.ops.hst+' szt.'],
  ['extdoor','Stan surowy zamknięty','Drzwi zewnętrzne','szt',q=>q.ops.extDoor,6500,1,'z projektu'],
  ['elec','Instalacje','Instalacja elektryczna','m²',q=>q.usableTotal,170,1,'powierzchnia użytkowa'],
  ['plumb','Instalacje','Instalacja wodno-kanalizacyjna','m²',q=>q.usableTotal,130,1,'powierzchnia użytkowa'],
  ['heatsrc','Instalacje','Źródło ciepła (pompa ciepła z montażem)','kpl',()=>1,45000,1,'ryczałt'],
  ['floorheat','Instalacje','Ogrzewanie podłogowe','m²',q=>q.usableTotal,120,1,'powierzchnia użytkowa'],
  ['vent','Instalacje','Wentylacja mechaniczna z rekuperacją','m²',q=>q.usableTotal,170,1,'powierzchnia użytkowa'],
  ['facade','Elewacja i wykończenie','Ocieplenie i tynk elewacji','m²',q=>q.extNet,290,1,'ściany zewnętrzne netto'],
  ['plaster','Elewacja i wykończenie','Tynki wewnętrzne / sufity','m²',q=>q.plaster,65,1,'ściany od środka i sufity'],
  ['screed','Elewacja i wykończenie','Wylewki z ociepleniem podłóg','m²',q=>Object.values(q.net).reduce((a,b)=>a+b,0),120,1,'powierzchnia podłóg'],
  ['floors','Elewacja i wykończenie','Posadzki (panele, deska, płytki)','m²',q=>Object.values(q.net).reduce((a,b)=>a+b,0),220,1,'powierzchnia podłóg'],
  ['paint','Elewacja i wykończenie','Malowanie','m²',q=>q.plaster,28,1,'ściany i sufity'],
  ['intdoor','Elewacja i wykończenie','Drzwi wewnętrzne z montażem','szt',q=>q.ops.intDoor,1500,1,'z projektu'],
  ['baths','Elewacja i wykończenie','Łazienki (płytki, biały montaż, armatura)','szt',q=>q.baths,24000,1,'pomieszczenia „łazienka”'],
  ['wc','Elewacja i wykończenie','WC','szt',q=>q.wcs,12000,1,'pomieszczenia „WC”'],
  ['kitchen','Elewacja i wykończenie','Zabudowa kuchenna z AGD','kpl',()=>1,35000,1,'ryczałt',false],
  ['terrace','Na zewnątrz','Taras','m²',q=>q.out.terrace,450,1,'z modułu Tarasy'],
  ['covterrace','Na zewnątrz','Taras zadaszony','m²',q=>q.out.coveredTerrace,1100,1,'z modułu Tarasy'],
  ['pergola','Na zewnątrz','Pergola','m²',q=>q.out.pergola,700,1,'z modułu Tarasy'],
  ['design','Inne','Projekt, adaptacja, formalności','kpl',()=>1,18000,0,'ryczałt'],
  ['manager','Inne','Kierownik budowy, geodeta','kpl',()=>1,10000,0,'ryczałt'],
];
const STD={eco:.85,std:1,high:1.35};
// udział materiałów w cenie jednostkowej (reszta = robocizna / usługa)
const MAT={found:.6,groundslab:.6,utilities:.7,extwalls:.55,partwalls:.5,slab:.6,stairs:.65,chimney:.6,roof:.6,gutters:.55,soffit:.5,windows:.85,roofwin:.8,hst:.88,extdoor:.85,
  elec:.45,plumb:.45,heatsrc:.8,floorheat:.55,vent:.65,facade:.45,plaster:.35,screed:.5,floors:.6,paint:.3,intdoor:.75,baths:.6,wc:.6,kitchen:.85,terrace:.6,covterrace:.6,pergola:.6,design:0,manager:0};
function cs(){const s=project.costSettings||{};return {std:STD[s.std]?s.std:'std',factor:Number.isFinite(+s.factor)&&+s.factor>0?+s.factor:1,prices:s.prices||{},mat:s.mat||{},lab:s.lab||{},off:s.off||{},on:s.on||{},reserve:Number.isFinite(+s.reserve)?+s.reserve:10}}
function compute(){
  const q=quantities(),s=cs(),rows=[];
  for(const [id,stage,name,unit,qf,defPrice,fin,how,defOn] of ITEMS){
    const qty=Math.max(0,qf(q)||0);let base=defPrice;if(id==='stairs')base=q.stairs.length?q.stairs.reduce((a,t)=>a+(STAIR_PRICE[t]||18000),0)/q.stairs.length:18000;
    const def=base*(fin?STD[s.std]:1)*s.factor,share=MAT[id]??.6,old=s.prices[id]!=null?+s.prices[id]:null; // starsze zapisy: jedna cena -> dzielona wg udziału
    const defMat=def*share,defLab=def*(1-share),mat=s.mat[id]!=null?+s.mat[id]:(old!=null?old*share:defMat),lab=s.lab[id]!=null?+s.lab[id]:(old!=null?old*(1-share):defLab);
    const on=s.off[id]?false:(defOn===false?!!s.on[id]:true),vm=on?qty*mat:0,vl=on?qty*lab:0;
    rows.push({id,stage,name,unit,qty,mat,lab,defMat,defLab,customMat:s.mat[id]!=null||old!=null,customLab:s.lab[id]!=null||old!=null,on,how:typeof how==='function'?how(q):how,vm,vl,value:vm+vl})}
  const subM=rows.reduce((a,r)=>a+r.vm,0),subL=rows.reduce((a,r)=>a+r.vl,0),sub=subM+subL,k=s.reserve/100;
  return {q,s,rows,subM,subL,sub,reserve:sub*k,reserveM:subM*k,reserveL:subL*k,total:sub*(1+k),totalM:subM*(1+k),totalL:subL*(1+k)};
}

const withP=fn=>p=>{const o=project;project=p;try{return fn()}finally{project=o}};
global.HouserCost={ITEMS,STD,MAT,STAIR_PRICE,STAIR_PL,settings:withP(cs),compute:withP(compute)};
})(window);
