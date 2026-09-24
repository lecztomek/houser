// Model nasłonecznienia dla modułu Nasłonecznienie i przegrzewanie (Polska, ok. 52°N).
// Pozycja słońca liczona co 15 min dla dnia z połowy miesiąca (deklinacja wg Coopera),
// promieniowanie bezchmurnego nieba wg Meinela (bezpośrednie) + prosty model rozproszonego,
// dzień pochmurny = samo promieniowanie rozproszone (25% bezchmurnego całkowitego),
// dzień przeciętny = mieszanka dnia słonecznego i pochmurnego dobrana tak, żeby dzienne
// promieniowanie na poziomą powierzchnię zgadzało się ze średnimi wieloletnimi dla środkowej Polski (PVGIS).
(function(global){
  const LAT=52,D2R=Math.PI/180,STEP=.25,DAYN=[17,47,75,105,135,162,198,228,258,288,318,344],MDAYS=[31,28,31,30,31,30,31,31,30,31,30,31];
  // średnie dzienne promieniowanie na płaszczyznę poziomą [kWh/m²·dzień], środkowa Polska (PVGIS, orientacyjnie)
  const GHI_AVG=[.65,1.21,2.29,3.70,4.71,5.00,4.90,4.29,2.87,1.61,.73,.48];
  const decl=n=>23.44*Math.sin(2*Math.PI*(284+n)/365);
  // profil dnia bezchmurnego: kroki {t (czas słoneczny), alt, az (azymut kompasowy, N=0, E=90), dni, dhi, ghi}
  function clearDay(month){
    const d=decl(DAYN[month-1])*D2R,f=LAT*D2R,out=[];
    for(let t=STEP/2;t<24;t+=STEP){const w=(t-12)*15*D2R,sa=Math.sin(f)*Math.sin(d)+Math.cos(f)*Math.cos(d)*Math.cos(w),alt=Math.asin(Math.max(-1,Math.min(1,sa)));
      let dni=0,dhi=0;
      if(alt>0){const altD=alt/D2R,am=1/(Math.sin(alt)+.50572*Math.pow(altD+6.07995,-1.6364));dni=.9*1361*Math.pow(.7,Math.pow(am,.678));dhi=.1*dni+20*Math.sin(alt)}
      const A=Math.atan2(Math.sin(w),Math.cos(w)*Math.sin(f)-Math.tan(d)*Math.cos(f)); // od południa, + na zachód
      out.push({t,alt,az:(180+A/D2R+360)%360,dni,dhi,ghi:dni*Math.max(0,Math.sin(alt))+dhi});}
    return out;
  }
  const CLEAR={},SUNNY_SHARE={};
  for(let m=1;m<=12;m++){const p=CLEAR[m]=clearDay(m),g=p.reduce((a,s)=>a+s.ghi,0)*STEP/1000,ov=.25*g;SUNNY_SHARE[m]=Math.max(.05,Math.min(.9,(GHI_AVG[m-1]-ov)/(g-ov)))}
  // profil dnia: kind 'clear' | 'avg' | 'overcast' -> kroki z dni (bezpośrednie normalne) i dhi (rozproszone poziome)
  const cache={};
  function day(month,kind){const k=month+kind;if(cache[k])return cache[k];const s=kind==='clear'?1:kind==='overcast'?0:SUNNY_SHARE[month];
    return cache[k]=CLEAR[month].map(p=>({...p,dni:s*p.dni,dhi:s*p.dhi+(1-s)*.25*p.ghi,ghi:s*p.ghi+(1-s)*.25*p.ghi}));}
  // promieniowanie na płaszczyznę (tilt 90 = pionowa ściana, az = kierunek, w który patrzy)
  function cosInc(p,tilt,az){const b=tilt*D2R;return Math.sin(p.alt)*Math.cos(b)+Math.cos(p.alt)*Math.sin(b)*Math.cos((p.az-az)*D2R)}
  function onPlane(p,tilt,az,rho=.2){const b=tilt*D2R,ci=cosInc(p,tilt,az),dir=p.alt>0&&ci>0?p.dni*ci:0;return {dir,ci,sky:p.dhi*(1+Math.cos(b))/2,gnd:p.ghi*rho*(1-Math.cos(b))/2}}
  // dzienna suma na płaszczyznę [kWh/m²]
  function dailyOn(month,kind,tilt,az){return day(month,kind).reduce((a,p)=>{const r=onPlane(p,tilt,az);return a+r.dir+r.sky+r.gnd},0)*STEP/1000}
  // współczynnik kąta padania dla szyby (przy stromym padaniu szyba odbija więcej)
  const iam=ci=>ci<=0?0:Math.max(0,1-.12*(1/ci-1));
  // Zacienienie okapem / daszkiem: okap na wysokości hO nad podłogą, wysięg P od lica ściany; okno od hB do hT.
  // Zwraca oświetloną część okna dla danej pozycji słońca (kąt profilowy w płaszczyźnie prostopadłej do ściany).
  function litByOverhang(p,az,sh,hB,hT){const cd=Math.cos((p.az-az)*D2R);if(cd<=0)return 0;const tanO=Math.tan(p.alt)/cd,edge=sh.hO-sh.P*tanO;return Math.max(0,Math.min(1,(edge-hB)/Math.max(.05,hT-hB)))}
  // udział nieba widzianego przez okno pod okapem (dla promieniowania rozproszonego)
  const skyByOverhang=(sh,hMid)=>1-.5*Math.atan(sh.P/Math.max(.1,sh.hO-hMid))/(Math.PI/2);
  // Zyski przez okno w każdym kroku dnia [W].
  // win: {A, ff (udział szyby), g, tilt, az, hB, hT, cols:[{shades:[{P,hO}], pergola:bool}]}, opt: {blind (mnożnik), pergolaT}
  function windowSteps(win,month,kind,opt){
    const prof=day(month,kind),k=win.A*win.ff*win.g*(opt.blind??1),cols=win.cols&&win.cols.length?win.cols:[{shades:[]}],hMid=(win.hB+win.hT)/2,out=new Float64Array(prof.length);
    let sky=0;for(const c of cols){let s=1;for(const sh of c.shades)s=Math.min(s,skyByOverhang(sh,hMid));sky+=s}sky/=cols.length;
    const pT=opt.pergolaT??.5;
    for(let i=0;i<prof.length;i++){const p=prof[i],r=onPlane(p,win.tilt,win.az);let dir=0;
      if(r.dir>0){let lit=0;for(const c of cols){let l=1;if(win.tilt>80)for(const sh of c.shades){l=Math.min(l,litByOverhang(p,win.az,sh,win.hB,win.hT));if(!l)break}if(c.pergola)l*=pT;lit+=l}dir=r.dir*iam(r.ci)*lit/cols.length}
      out[i]=k*(dir+.85*(r.sky*sky+r.gnd))}
    return out;
  }
  // temperatura zewnętrzna w lipcu (czas słoneczny): słoneczny / przeciętny dzień
  const tOut=(t,kind)=>kind==='clear'?22+6.5*Math.cos(2*Math.PI*(t-15)/24):19.5+5*Math.cos(2*Math.PI*(t-15)/24);
  global.HouserSun={LAT,STEP,MDAYS,GHI_AVG,SUNNY_SHARE,day,onPlane,dailyOn,windowSteps,litByOverhang,tOut,iam};
})(window);
