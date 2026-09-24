// Bilans cieplny domu (metoda uproszczona, sezonowa) – wspólny dla modułów Energia i Porównanie.
// HouserEnergy.compute(project) -> {rows, Htot, load (kW), Qh (kWh/rok ogrzewanie), Qw (ciepła woda), EU (kWh/m²·rok), src (koszty źródeł ciepła)…}
// Wymaga shared/quantities.js.
(function(global){
let project=null;
const fmt=(v,d=0)=>(Math.round(v*10**d)/10**d).toLocaleString('pl-PL',{minimumFractionDigits:d,maximumFractionDigits:d});
// strefy klimatyczne PN-EN 12831: temperatura obliczeniowa i sezonowe stopniodni (orientacyjnie)
const ZONES={I:{name:'I – zachód (Szczecin, Poznań, Wrocław)',te:-16,hdd:3500},II:{name:'II – (Gdańsk, Łódź, Kraków)',te:-18,hdd:3700},III:{name:'III – centrum (Warszawa, Kielce, Lublin)',te:-20,hdd:3900},IV:{name:'IV – wschód (Białystok, Olsztyn)',te:-22,hdd:4200},V:{name:'V – góry (Zakopane, Suwałki)',te:-24,hdd:4700}};
const PARTS=[['wall','Ściany zewnętrzne',.20,.18],['roof','Dach / strop pod nieogrzewanym',.15,.13],['floor','Podłoga na gruncie',.30,.25],['win','Okna i drzwi tarasowe',.90,.85],['roofwin','Okna dachowe',1.10,1.0],['door','Drzwi zewnętrzne',1.30,1.1]];
function es(){const s=project.energySettings||{},U={};for(const [k,,,d] of PARTS)U[k]=Number.isFinite(+s.U?.[k])&&+s.U[k]>0?+s.U[k]:d;
  const num=(v,d)=>Number.isFinite(+v)&&v!==''&&v!=null?+v:d;
  return {zone:ZONES[s.zone]?s.zone:'III',persons:num(s.persons,4),ti:num(s.ti,20),U,bridge:num(s.bridge,.05),vent:s.vent==='grav'?'grav':'mech',eta:num(s.eta,85),inf:num(s.inf,.1),pEl:num(s.pEl,1.10),scop:num(s.scop,3.6),pGas:num(s.pGas,.32),pPel:num(s.pPel,1400),pWood:num(s.pWood,380),woodKWh:num(s.woodKWh,1600),fireShare:num(s.fireShare,25)}}
function compute(){
  const q=HouserQuantities.compute(project),s=es(),Z=ZONES[s.zone],dT=s.ti-Z.te,G=q.G;
  // przegrody zewnętrzne (powierzchnie z projektu)
  const heatedUp=q.net[q.up]>0;                                                    // dom parterowy: nad parterem nieogrzewany strych
  const wall=q.wallNet+(q.attic&&heatedUp?q.gable*.75:0);                        // na poddaszu część szczytów jest ogrzewana
  const roof=(heatedUp?(q.attic?q.roofInnerA:q.slab):q.net[q.lo])+q.loggiaA+q.overhangA; // skosy / strop pod strychem + nad wnęką i nadwieszeniem
  const floor=q.net[q.lo],bFloor=.6;                                            // grunt jest cieplejszy od powietrza – współczynnik redukcji
  const A={wall,roof,floor,win:q.ops.winA+q.ops.hstA,roofwin:q.ops.roofWinA,door:q.ops.extDoorA};
  const rows=PARTS.map(([k,name])=>{const u=s.U[k]+s.bridge*(k==='wall'||k==='roof'||k==='floor'?1:0),H=A[k]*u*(k==='floor'?bFloor:1);return {k,name,A:A[k],U:s.U[k],H}}).filter(r=>r.A>0);
  const eta=s.vent==='mech'?s.eta/100:0,nMin=.5,V=q.volume,Hv=.34*V*(nMin*(1-eta)+s.inf);
  rows.push({k:'vent',name:s.vent==='mech'?'Wentylacja (z odzyskiem '+Math.round(eta*100)+'%)':'Wentylacja grawitacyjna',A:null,U:null,H:Hv,V});
  const Htot=rows.reduce((a,r)=>a+r.H,0);for(const r of rows){r.W=r.H*dT;r.share=r.H/Htot}
  const load=Htot*dT/1000;                                                          // kW
  const Qloss=Htot*Z.hdd*24/1000,Qint=3*q.usableTotal*5000/1000,Qsol=(A.win+A.roofwin)*125,Qh=Math.max(0,Qloss-.9*(Qint+Qsol));
  const Qw=s.persons*2.6*365*1.15,EU=q.usableTotal>0?Qh/q.usableTotal:0;
  const hp=[3,4,5,6,7,8,9,10,12,14,16].find(k=>k>=load+.25*s.persons)||Math.ceil(load+.25*s.persons);
  let src=[['Pompa ciepła',s.pEl/s.scop,'prąd '+fmt(s.pEl,2)+' zł/kWh ÷ SCOP '+fmt(s.scop,1)],['Kocioł gazowy',s.pGas/.95,'gaz '+fmt(s.pGas,2)+' zł/kWh, sprawność 95%'],['Kocioł na pellet',s.pPel/1000/4.8/.88,'pellet '+fmt(s.pPel)+' zł/t (4,8 kWh/kg), sprawność 88%'],['Grzejniki elektryczne',s.pEl,'prąd bezpośrednio'],
    ['Kocioł zgazowujący drewno',s.pWood/s.woodKWh/.85,'drewno '+fmt(s.pWood)+' zł/mp ('+fmt(s.woodKWh)+' kWh/mp), sprawność 85%, z buforem ciepła'],
    ['Kominek z płaszczem wodnym',s.pWood/s.woodKWh/.75,'drewno '+fmt(s.pWood)+' zł/mp, sprawność 75%, grzeje też wodę – trzeba palić codziennie']]
    .map(([name,zlkWh,how])=>({name,zlkWh,how,cost:(Qh+Qw)*zlkWh}));
  // pompa ciepła + kominek powietrzny w salonie, który przejmuje część ogrzewania (ciepła woda z pompy)
  {const f=Math.max(0,Math.min(.8,s.fireShare/100)),wood=s.pWood/s.woodKWh/.78,hpk=s.pEl/s.scop,cost=Qh*f*wood+(Qh*(1-f)+Qw)*hpk;
    src.push({name:'Pompa ciepła + kominek',zlkWh:cost/Math.max(1,Qh+Qw),how:'kominek (sprawność 78%) daje '+Math.round(f*100)+'% ciepła do ogrzewania – ok. '+fmt(Qh*f/s.woodKWh/.78,1)+' mp drewna rocznie; resztę i ciepłą wodę – pompa',cost})}
  return {q,s,Z,dT,rows,Htot,load,Qloss,Qint,Qsol,Qh,Qw,EU,hp,src,A};
}
function klass(EU){return EU<=15?['pasywny','#15803d','#f0fdf4','#bbf7d0']:EU<=40?['energooszczędny','#15803d','#f0fdf4','#bbf7d0']:EU<=70?['zgodny z WT 2021 (orientacyjnie)','#1d4ed8','#eff6ff','#bfdbfe']:EU<=120?['standard sprzed 2014','#b45309','#fffbeb','#fde68a']:['wysokie zużycie','#b91c1c','#fef2f2','#fecaca']}
const withP=fn=>p=>{const o=project;project=p;try{return fn()}finally{project=o}};
global.HouserEnergy={ZONES,PARTS,klass,settings:withP(es),compute:withP(compute)};
})(window);
