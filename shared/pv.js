// Fotowoltaika – ile paneli zmieści się na dachu, ile prądu wyprodukują, ile zużyje dom i ile to oszczędza.
// HouserPV.compute(project, settings?) -> {slopes, flat, kWp, prod, cons, monthly, self, export, import, savings, invest, payback, priceFactor, score, issues, good}
// HouserPV.priceFactor(project) -> mnożnik ceny prądu dla innych modułów (Ogrzewanie, Instalacja grzewcza, Energia), gdy fotowoltaika jest włączona.
// Dach: dwie połacie (kalenica i orientacja z projektu), okapy, okna dachowe i komin zabierają miejsce; dach płaski nad parterem – panele na stelażu.
// Zużycie: prąd domowy (domownicy), ogrzewanie i ciepła woda wg instalacji grzewczej, wentylacja, auto elektryczne. Rozliczenie: net-billing.
// Wymaga shared/house-model.js, shared/quantities.js, shared/energy.js.
(function(global){
  const DEF={enabled:false,size:'auto',kWp:6,battery:0,slopes:'auto',evKm:0,pExp:.4,priceKWp:3800,priceBatt:2600};
  const PANEL={w:1.134,h:1.722,wp:440}; // panel ok. 1,13 × 1,72 m, 440 Wp
  const MARGIN=.5;                        // pas wolny przy okapie, kalenicy i szczycie (wiatr, przepisy ppoż.)
  const DIRS=['north','east','south','west'],AZ={north:0,east:90,south:180,west:270};
  const DIR_PL={north:'północ',east:'wschód',south:'południe',west:'zachód'};
  // udział miesięcy w rocznej produkcji (Polska) i w zużyciu
  const PM=[.025,.045,.08,.11,.13,.13,.135,.12,.09,.06,.03,.02],PMS=PM.reduce((a,b)=>a+b,0);
  const HW=[.18,.16,.13,.08,.03,0,0,0,.02,.08,.14,.18];
  const BW=[.095,.085,.085,.08,.08,.075,.075,.075,.08,.085,.09,.095];
  const DAYS=[31,28,31,30,31,30,31,31,30,31,30,31];
  const BASE_YIELD=1050; // kWh z 1 kWp na południe, nachylenie ok. 35°, Polska

  // sprawność ustawienia: nachylenie t [°] i odchylenie od południa dAz [°]
  function orientK(t,dAz){t=Math.max(0,Math.min(90,t));const s=.87+.13*(1-((t-35)/35)**2),D=.38*Math.sin(t*Math.PI/180)/Math.sin(35*Math.PI/180);
    return Math.max(.3,s-(1-Math.cos(dAz*Math.PI/180))/2*D)}

  function settings(project){return {...DEF,...(project?.pvSettings||{})}}

  // prąd domu w ciągu roku [kWh]: domowy, ogrzewanie, ciepła woda, wentylacja, auto
  function consumption(project,E,set){const S=E.s,hs=global.HouserHeatSys?.normalize?HouserHeatSys.normalize(project):{main:'hp_air',extra:'none',share:0,...(project.heatingSystem||{})};
    const main=hs.main||'hp_air',extra=hs.extra||'none',sh=extra==='none'?0:Math.max(0,Math.min(.8,(+hs.share||0)/100)),dhw=hs.dhwSrc||'auto';
    const persons=S.persons||4,base=900+500*persons,scop=S.scop||3.6,f=Math.max(0,Math.min(.8,(S.fireShare??25)/100));
    // prąd na 1 kWh ciepła do ogrzewania i na 1 kWh ciepłej wody – wg źródła
    const elOf=k=>k==='hp_air'?[1/scop,1/(scop*.8)]:k==='hp_ground'?[1/4.6,1/(4.6*.8)]:k==='hp_fire'?[(1-f)/scop,1/(scop*.8)]:k==='electric'?[1,1]:k==='fireplace_air'?[.3,1]:
      k==='wood'||k==='fireplace_water'?[0,.5]:k==='fireplace'||k==='stove'?[0,0]:[0,0];
    const [hm,wm]=elOf(main),[he]=elOf(extra);
    let heat=E.Qh*((1-sh)*hm+sh*he)+(['gas','pellet','coal','wood','fireplace_water'].includes(main)?200:0),water=E.Qw*wm; // + pompy obiegowe i sterowanie kotła
    if(dhw==='extra'&&extra!=='none')water=E.Qw*elOf(extra)[1];else if(dhw==='el')water=E.Qw;else if(dhw==='hp_dhw')water=E.Qw/2.8;else if(dhw==='solar')water*=.4;else if(dhw==='main_el')water=E.Qw*(.5*wm+.5);
    const vent=S.vent==='mech'?420:S.vent==='decentral'?300:S.vent==='exhaust'?260:S.vent==='hybrid'?60:0;
    const ev=Math.max(0,+set.evKm||0)*.18;
    return {base,heat,water,vent,ev,total:base+heat+water+vent+ev}}

  function compute(project,over){
    const set={...settings(project),...(over||{})};
    const q=HouserQuantities.compute(project),E=HouserEnergy.compute(project),G=q.G,c=q.c,W=q.W,H=q.H;
    const e=project.elevationSettings||{},top=project.orientation?.top||'north',across=HouserModel.slopesAcrossX(e.ridge==='north-south'?'north-south':'east-west',top);
    const ti=Math.max(0,DIRS.indexOf(top)),side=s=>DIRS[(ti+({top:0,right:1,bottom:2,left:3}[s]))%4];
    const pitch=G.roofPitch||35,cos=Math.cos(pitch*Math.PI/180),span=across?W*c:H*c,eo=G.eaveOverhang||0,go=G.gableOverhang||0;
    const slopeLen=(span/2+eo)/cos,roofLen=(q.roofL||0)+2*go;
    // okna dachowe i komin – na której połaci i gdzie (x – wzdłuż kalenicy od szczytu, y – w dół połaci od kalenicy, w metrach)
    const sides=across?['left','right']:['top','bottom'],obs={left:[],right:[],top:[],bottom:[]},rwin={left:0,right:0,top:0,bottom:0};
    const rr=HouserModel.roofRange(project),x0=(rr.l0||0)-go,eaveY=slopeLen-eo/cos;
    for(const r of q.runs||[]){if(r.base!=='window'||r.info?.shape!=='roof')continue;let s;
      if(r.o==='v')s=r.ra?'right':'left';else s=r.ra?'bottom':'top';if(!obs[s])continue;rwin[s]++;
      const a0=r.from*c-x0,a1=(r.to+1)*c-x0,sill=Math.max(0,+r.info.sill||0),hh=Math.max(.4,+r.info.height||1.2),yb=Math.max(.2,eaveY-sill);
      obs[s].push({kind:'win',x0:a0,x1:a1,y0:Math.max(0,yb-hh),y1:yb})}
    for(const n of project.structure?.chimney||[]){const x=n%W,y=Math.floor(n/W),s=across?(x+.5<W/2?'left':'right'):(y+.5<H/2?'top':'bottom');
      const along=(across?y:x)*c-x0,acr=(across?x:y)*c,d=Math.max(0,Math.abs(acr+c/2-span/2)-c/2);obs[s].push({kind:'chimney',x0:along,x1:along+c,y0:d/cos,y1:(d+c)/cos})}
    // panele w rzędach od kalenicy, z pominięciem okien dachowych i komina (z odstępem)
    const layout=(L,Hs,ob)=>{const gap=.2,xa=MARGIN,xb=L-MARGIN,ya=.3,yb=Math.max(ya,Hs-.3),cols=Math.floor((xb-xa)/PANEL.w),rows=Math.floor((yb-ya)/PANEL.h),xs=xa+((xb-xa)-cols*PANEL.w)/2,out=[];
      for(let r=0;r<rows;r++)for(let k=0;k<cols;k++){const p={x0:xs+k*PANEL.w,y0:ya+r*PANEL.h};p.x1=p.x0+PANEL.w;p.y1=p.y0+PANEL.h;
        if(ob.some(o=>p.x0<o.x1+gap&&p.x1>o.x0-gap&&p.y0<o.y1+gap&&p.y1>o.y0-gap))continue;out.push(p)}return out};
    // połacie
    const slopes=[];
    if(q.roofA>0)for(const s of sides){const dir=side(s),dAz=Math.abs(((AZ[dir]-180)+540)%360-180),k=orientK(pitch,dAz);
      const gross=slopeLen*roofLen,rects=layout(roofLen,eaveY,obs[s]);
      slopes.push({side:s,dir,dirPL:DIR_PL[dir],dAz,tilt:pitch,k,yield:BASE_YIELD*k,area:gross,maxPanels:rects.length,rects,obstacles:obs[s],L:roofLen,Hs:slopeLen,eaveY,roofWins:rwin[s],panels:0,kWp:0,prod:0})}
    // dach płaski nad parterem: panele na stelażu ok. 15° na południe, w rzędach (ok. 45% powierzchni)
    const flatPanels=Math.floor((q.flatA||0)*.45/(PANEL.w*PANEL.h));
    if(flatPanels>0)slopes.push({side:'flat',dir:'south',dirPL:'płaski dach (stelaż na południe)',dAz:0,tilt:15,k:orientK(15,0)*.97,yield:BASE_YIELD*orientK(15,0)*.97,area:q.flatA,maxPanels:flatPanels,roofWins:0,obstacles:[],rects:null,panels:0,kWp:0,prod:0});
    const cons=consumption(project,E,set);
    // które połacie: auto – bez północnych (odchylenie > 110°) i o uzysku poniżej 70%
    const okS=slopes.filter(s=>set.slopes==='all'||(s.dAz<=110&&s.k>=.7));
    const ranked=[...okS].sort((a,b)=>b.yield-a.yield),maxKWp=ranked.reduce((a,s)=>a+s.maxPanels*PANEL.wp/1000,0);
    const bestY=ranked[0]?.yield||BASE_YIELD*.8;
    let target=set.size==='max'?maxKWp:set.size==='manual'?Math.max(0,+set.kWp||0):Math.max(3,cons.total*1.1/bestY);
    target=Math.min(target,maxKWp);
    let left=Math.round(target*1000/PANEL.wp);
    for(const s of ranked){const n=Math.min(left,s.maxPanels);s.panels=n;s.kWp=n*PANEL.wp/1000;s.prod=s.kWp*s.yield;left-=n}
    const kWp=slopes.reduce((a,s)=>a+s.kWp,0),prod=slopes.reduce((a,s)=>a+s.prod,0);
    // miesiące: produkcja vs zużycie, autokonsumpcja (część zużycia w dzień + magazyn)
    const B=Math.max(0,+set.battery||0),monthly=[];let self=0,exp=0,imp=0;
    for(let m=0;m<12;m++){const p=prod*PM[m]/PMS,b=cons.base*BW[m],h=cons.heat*HW[m],w=cons.water/12,v=cons.vent/12,ev=cons.ev/12,c_=b+h+w+v+ev;
      const day=b*.35+w*.6+h*.3+v*.45+ev*.3,direct=Math.min(p,day),bat=Math.min(B*.9*DAYS[m],p-direct,c_-direct),s=direct+Math.max(0,bat);
      monthly.push({m,prod:p,cons:c_,self:s,export:p-s,import:c_-s});self+=s;exp+=p-s;imp+=c_-s}
    const S=E.s,pEl=S.pEl,pExp=+set.pExp||.4,savings=self*pEl+exp*pExp;
    const invest=kWp>0?Math.max(9000,kWp*(+set.priceKWp||3800))+(B?B*(+set.priceBatt||2600)+2500:0):0;
    const payback=savings>50?invest/savings:null;
    const factor=cons.total>0?Math.max(.1,Math.min(1,(cons.total*pEl-savings)/(cons.total*pEl))):1;
    // ocena potencjału dachu: ile zużycia da się pokryć z najlepszych połaci, jak dobre są ich kierunki
    const potential=maxKWp*bestY,cover=cons.total>0?potential/cons.total:0;
    const issues=[],good=[];const add=(p,text,tip)=>issues.push({p,text,tip:tip||''});
    const all=slopes.filter(s=>s.side!=='flat');
    if(!slopes.length)add(5,'Dom nie ma dachu, na którym zmieszczą się panele.','Panele można postawić na gruncie albo na garażu / wiacie.');
    else{const south=all.find(s=>s.dAz<=45);
      if(south)good.push('Połać na '+south.dirPL+' ('+Math.round(pitch)+'°) – najlepsze miejsce na panele, mieści ok. '+(south.maxPanels*PANEL.wp/1000).toFixed(1).replace('.',',')+' kWp.');
      else if(all.some(s=>s.dAz<=110))add(1.2,'Połacie dachu są na '+all.map(s=>s.dirPL).join(' i ')+' – panele dadzą ok. '+Math.round(Math.max(...all.map(s=>s.k))*100)+'% tego, co z połaci na południe.','Kalenica wschód–zachód daje połać na południe – rozważ obrót dachu w module Kondygnacje i dach.');
      if(cover<1&&cons.total>0)add(Math.min(3,(1-cover)*4),'Na dachu zmieści się ok. '+maxKWp.toFixed(1).replace('.',',')+' kWp – to ok. '+Math.round(cover*100)+'% rocznego zużycia prądu ('+Math.round(cons.total)+' kWh).','Mniej okien dachowych na połaci południowej albo panele na garażu / gruncie.');
      else if(cons.total>0)good.push('Dach mieści więcej, niż dom zużywa w roku ('+Math.round(cover*100)+'% zużycia).');
      const sb=all.filter(s=>s.dAz<=90&&s.roofWins>0);for(const s of sb)add(Math.min(1,.3*s.roofWins),'Okna dachowe na połaci '+s.dirPL+' ('+s.roofWins+') zabierają miejsce na panele.','Okna dachowe lepiej na połaci północnej, a panele na południowej.')}
    const score=Math.max(0,Math.min(10,Math.round((10-issues.reduce((a,i)=>a+i.p,0))*10)/10));
    // magazyn energii: ile więcej prądu zużyje dom sam i czy dopłata się zwraca (porównanie wariantów 0 / 5 / 10 / 15 kWh)
    let batteries=null;if(!over?.noCompare&&kWp>0)batteries=[0,5,10,15].map(b=>{const r=b===B?null:compute(project,{...set,battery:b,noCompare:true}),sv=r?r.savings:savings,iv=r?r.invest:invest,sf=r?r.self:self;
      return {kWh:b,self:sf,savings:sv,invest:iv,extra:iv-(b?0:iv),payback:sv>50?iv/sv:null}}).map((x,i,a)=>({...x,addSave:x.savings-a[0].savings,addInvest:x.invest-a[0].invest,addPayback:x.kWh&&x.savings-a[0].savings>20?(x.invest-a[0].invest)/(x.savings-a[0].savings):null}));
    // kąt dachu: ile dałyby te same połacie przy innym nachyleniu (kWh z 1 kWp na najlepszej użytej połaci)
    const ref=ranked[0]||all[0],pitches=ref?[15,25,30,35,40,45,50].map(t=>({t,yield:BASE_YIELD*orientK(t,ref.dAz),cur:Math.abs(t-pitch)<2.5})):[];
    if(ref&&!pitches.some(x=>x.cur))pitches.push({t:Math.round(pitch),yield:BASE_YIELD*orientK(pitch,ref.dAz),cur:true}),pitches.sort((a,b)=>a.t-b.t);
    return {set,slopes,PANEL,roofLen,slopeLen,batteries,pitches,pitchDir:ref?.dirPL||'',kWp,maxKWp,panels:slopes.reduce((a,s)=>a+s.panels,0),prod,cons,monthly,self,export:exp,import:imp,selfShare:prod>0?self/prod:0,cover,
      savings,invest,payback,priceFactor:factor,pEl,pExp,score,issues,good,enabled:!!set.enabled}}

  // mnożnik ceny prądu dla innych modułów: tylko gdy fotowoltaika jest włączona w projekcie
  function priceFactor(project){if(!project?.pvSettings?.enabled)return null;try{return compute(project).priceFactor}catch(e){console.error(e);return null}}
  global.HouserPV={DEF,PANEL,orientK,settings,consumption,compute,priceFactor};
})(window);
