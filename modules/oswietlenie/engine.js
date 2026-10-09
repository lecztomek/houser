// Oświetlenie nocą: lampy na rzucie (rodzaj oprawy, strumień, barwa, żarówka), natężenie światła na płaszczyźnie roboczej (0,75 m),
// cienie od ścian (drzwi zamknięte albo otwarte, otwarte przejścia i szkło przepuszczają), światło przez pustkę i antresolę
// (lampa na piętrze świeci w dół przez otwór w stropie, lampa wisząca w pustce – także na galerię), odbicia od ścian i sufitu.
// HouserLight.evaluate(project) -> {floors:{[f]:{map,pts}}, rooms, tasks, lamps, power, kwh, cost, issues, good, score}
// Ustawienia: project.lighting = {lamps:{[floor]:[{id,x,y (m),type,lm,K,bulb,h (m nad podłogą tej kondygnacji)}]}, doors:'closed'|'open', rho}
// Wymaga shared/quantities.js; opcjonalnie shared/energy.js (cena prądu).
(function(global){
  const TYPES={
    ceiling:{name:'Plafon / panel sufitowy',lm:1600,beam:120,up:0,mount:'ceiling',price:250,icon:'◯'},
    pendant:{name:'Lampa wisząca',lm:900,beam:100,up:.15,mount:'drop',drop:.8,price:400,icon:'⬤'},
    downlight:{name:'Oczko LED (spot)',lm:450,beam:60,up:0,mount:'ceiling',price:90,icon:'•'},
    track:{name:'Szynoprzewód z reflektorami',lm:1200,beam:40,up:0,mount:'ceiling',price:700,icon:'≡'},
    wall:{name:'Kinkiet',lm:400,beam:120,up:.5,mount:'fixed',h:1.9,price:200,icon:'◐'},
    floor:{name:'Lampa stojąca',lm:700,beam:120,up:.3,mount:'fixed',h:1.6,price:350,icon:'△'},
    table:{name:'Lampka stołowa / nocna',lm:350,beam:130,up:.2,mount:'fixed',h:.65,price:150,icon:'▵'},
    strip:{name:'Taśma LED pod szafkami',lm:800,beam:110,up:0,mount:'fixed',h:1.4,price:180,icon:'▬'},
    outdoor:{name:'Lampa zewnętrzna / schodowa',lm:400,beam:110,up:0,mount:'fixed',h:.4,price:180,icon:'▾'}
  };
  const BULBS={led:{name:'LED',eff:100},filament:{name:'LED filament (dekoracyjna)',eff:85},cfl:{name:'Świetlówka kompaktowa',eff:60},halogen:{name:'Halogen',eff:16},incand:{name:'Żarówka tradycyjna',eff:12}};
  const KS=[2700,3000,4000];
  // zalecane średnie natężenie [lx] (PN-EN 12464-1 i praktyka mieszkaniowa), godziny świecenia dziennie, zalecana barwa
  const ROOMS=[
    {k:'kitchen',re:/kuchni|aneks/i,name:'kuchnia',lx:200,task:500,h:3,K:[3000,4000]},
    {k:'bath',re:/łazien|lazien/i,name:'łazienka',lx:200,task:300,h:1.5,K:[3000,4000]},
    {k:'wc',re:/\bwc\b|toalet/i,name:'WC',lx:150,h:.5,K:[3000,4000]},
    {k:'living',re:/salon|dzienn/i,name:'salon',lx:150,h:4,K:[2700,3000]},
    {k:'dining',re:/jadal/i,name:'jadalnia',lx:150,task:300,h:2,K:[2700,3000]},
    {k:'study',re:/gabinet|biur|pracown/i,name:'gabinet',lx:300,task:500,h:3,K:[3000,4000]},
    {k:'kids',re:/dziec|dziecka/i,name:'pokój dziecka',lx:200,task:500,h:3,K:[3000,4000]},
    {k:'bedroom',re:/sypial|pokój|pokoj|gości|gosci/i,name:'sypialnia',lx:100,h:1,K:[2700,3000]},
    {k:'garage',re:/garaż|garaz/i,name:'garaż',lx:100,h:.5,K:[4000]},
    {k:'utility',re:/techn|kotłow|kotlow|gospodarcz|pralni/i,name:'pomieszczenie techniczne',lx:200,h:.5,K:[4000]},
    {k:'wardrobe',re:/garderob|spiżar|spizar|schowek/i,name:'garderoba / schowek',lx:150,h:.3,K:[3000,4000]},
    {k:'stairs',re:/schod/i,name:'schody',lx:150,h:1,K:[2700,3000,4000]},
    {k:'hall',re:/hol|korytarz|komunikac|wiatrołap|wiatrolap|przedpok|antresol|galeri/i,name:'komunikacja',lx:100,h:1.5,K:[2700,3000,4000]}
  ];
  // pomieszczenie łączone (np. „pokój dzienny z kuchnią”): wymagania pierwszego dopasowania, barwy – z obu
const kindOf=n=>{const m=ROOMS.filter(r=>r.re.test(n||''));if(!m.length)return {k:'other',name:'inne',lx:150,h:1,K:[2700,3000,4000]};return m.length>1?{...m[0],K:[...new Set(m.flatMap(r=>r.K))]}:m[0]};
  // miejsca pracy wzrokowej z mebli: blaty kuchenne, stół, biurko, umywalka
  const TASKS=[{re:/^k_(dolne|narozne|zlew|plyta|wyspa)/,name:'blat kuchenny',lx:500},{re:/^k_stol/,name:'stół jadalny',lx:300},{re:/^g_biurko/,name:'biurko',lx:500},{re:/^l_umywalka/,name:'umywalka / lustro',lx:300},{re:/^b_toaletka/,name:'toaletka',lx:300}];
  const WP=.75,STEP=.25,RHO=.5,fmt=(v,d=0)=>(Math.round(v*10**d)/10**d).toLocaleString('pl-PL',{minimumFractionDigits:d,maximumFractionDigits:d});
  const nOf=beam=>{const b=Math.max(20,Math.min(170,beam))/2*Math.PI/180;return Math.max(.4,Math.log(.5)/Math.log(Math.cos(b)))};
  const settings=p=>{const s=p.lighting||{};return {lamps:s.lamps&&typeof s.lamps==='object'?s.lamps:{},doors:s.doors==='open'?'open':'closed',rho:Number.isFinite(+s.rho)&&s.rho!==null?Math.max(.2,Math.min(.8,+s.rho)):RHO}};
  // opis lampy z ustawień (strumień, barwa, żarówka, wysokość) – h liczone od podłogi kondygnacji, na której stoi lampa
  function lampOf(L,ceilAt){const T=TYPES[L.type]||TYPES.ceiling,lm=+L.lm>0?+L.lm:T.lm,bulb=BULBS[L.bulb]?L.bulb:'led',K=KS.includes(+L.K)?+L.K:(T.mount==='fixed'&&L.type!=='strip'?2700:3000);
    const ceil=ceilAt(L.x,L.y);let h=+L.h>0?+L.h:T.mount==='ceiling'?ceil-.02:T.mount==='drop'?Math.max(1.9,ceil-(ceil>3.5?Math.min(ceil-2.6,1.6):T.drop)):T.h;h=Math.min(h,ceil-.02);
    return {...L,T,lm,bulb,K,h,W:lm/BULBS[bulb].eff,n:nOf(T.beam),up:T.up}}
  function evaluate(project){
    const q=HouserQuantities.compute(project),S=settings(project),W=q.W,H=q.H,c=q.c,lo=q.lo,up=q.up,G=q.G,gh=G.groundHeight,attic=q.attic,tan=Math.tan(G.roofPitch*Math.PI/180);
    const flat=f=>{const st=project.state?.[f]||[];return Array.isArray(st[0])?st.flat():st},st={[lo]:flat(lo),[up]:flat(up)};
    const defs={};for(const f of [lo,up])defs[f]=Object.fromEntries((project.definitionSnapshot?.floors?.[f]?.rooms||[]).map(r=>[r.id,r]));
    const idAt=(f,x,y)=>x<0||y<0||x>=W||y>=H?null:(st[f][y*W+x]||null),isVoid=(f,v)=>!v||defs[f][v]?.kind==='exteriorVoid',isHole=(f,v)=>f===up&&(v==='pustka'||v==='schody');
    const cellOf=(f,x,y)=>{const v=idAt(f,Math.floor(x/c),Math.floor(y/c));return isVoid(f,v)?null:v};
    const hasUp=st[up].some(v=>v&&!isVoid(up,v)),upH=G.upperType==='none'?0:G.upperType==='attic'?null:G.upperHeight;
    const roofOver=(x,y)=>{const a=q.across?x:y;return G.kneeWall+Math.min(a,q.span-a)*tan}; // poddasze: wysokość pod połacią
    // wysokość sufitu nad punktem (od podłogi kondygnacji); pod pustką – sufit piętra / połać nad parterem
    const ceilAt=f=>(x,y)=>{if(f===up)return attic?Math.max(1,Math.min(roofOver(x,y),G.upperHeight)):(G.upperHeight||2.6);
      const above=idAt(up,Math.floor(x/c),Math.floor(y/c));if(hasUp&&above==='pustka')return gh+(attic?roofOver(x,y):(upH||2.6));return gh};
    // przejście między kratkami: ta sama przestrzeń, otwór w stropie, otwarte przejście, szkło (85%), drzwi (otwarte / zamknięte)
    const O={[lo]:project.openings?.[lo]||{},[up]:project.openings?.[up]||{}};
    const edgeT=(f,ax,ay,bx,by)=>{const va=idAt(f,ax,ay),vb=idAt(f,bx,by);if(va===vb)return 1;if(isVoid(f,va)||isVoid(f,vb))return 0;if(isHole(f,va)||isHole(f,vb))return 1;
      const key=ax!==bx?'v:'+Math.max(ax,bx)+':'+ay:'h:'+ax+':'+Math.max(ay,by),o=O[f][key];return o==='opening'?1:o==='glass'?.85:o==='door'?(S.doors==='open'?1:0):0};
    // przepuszczalność odcinka w rzucie danej kondygnacji (iloczyn przejść przez krawędzie kratek)
    const seg=(f,x0,y0,x1,y1)=>{let cx=Math.floor(x0/c),cy=Math.floor(y0/c);const tx=Math.floor(x1/c),ty=Math.floor(y1/c),d=Math.hypot(x1-x0,y1-y0),n=Math.max(1,Math.ceil(d/(c/3)));let t=1;
      for(let i=1;i<=n&&t>0;i++){const px=Math.floor((x0+(x1-x0)*i/n)/c),py=Math.floor((y0+(y1-y0)*i/n)/c);if(px===cx&&py===cy)continue;
        if(px!==cx&&py!==cy){const a=edgeT(f,cx,cy,px,cy)*edgeT(f,px,cy,px,py),b=edgeT(f,cx,cy,cx,py)*edgeT(f,cx,py,px,py);t*=Math.max(a,b)}else t*=edgeT(f,cx,cy,px,py);cx=px;cy=py}
      return t};
    // lampy
    const lamps=[];for(const f of [lo,up])for(const L of S.lamps[f]||[]){if(!Number.isFinite(+L.x)||!Number.isFinite(+L.y))continue;const r=cellOf(f,+L.x,+L.y);
      lamps.push({...lampOf({...L,x:+L.x,y:+L.y},ceilAt(f)),f,room:r,abs:(f===up?gh:0)})}
    for(const L of lamps){L.abs+=L.h;L.void=L.f===lo?L.abs>gh+.05:isHole(up,idAt(up,Math.floor(L.x/c),Math.floor(L.y/c)))}
    // punkty obliczeniowe co 0,25 m w pomieszczeniach (bez otworów w stropie i wnęk)
    const floors={},rooms={};
    for(const f of [lo,up]){const pts=[];for(let j=0;j<H*c/STEP;j++)for(let i=0;i<W*c/STEP;i++){const x=(i+.5)*STEP,y=(j+.5)*STEP,v=cellOf(f,x,y);if(!v||isHole(f,v))continue;pts.push({x,y,i,j,room:v,E:0,dir:0})}
      floors[f]={pts,NI:Math.round(W*c/STEP),NJ:Math.round(H*c/STEP)}}
    for(const L of lamps)L.I0=L.lm*(1-L.up)*(L.n+1)/(2*Math.PI);
    const direct=(L,f,P)=>{const tAbs=(f===up?gh:0)+WP,dz=L.abs-tAbs;if(dz<=.05&&!(L.T.mount==='fixed'&&dz>-.6))return 0;const dzz=Math.max(.15,dz),dx=P.x-L.x,dy=P.y-L.y,d2=dx*dx+dy*dy+dzz*dzz;
      if(L.I0/d2<.5)return 0; // poniżej 0,5 lx – pomijamy (szybciej, bez wpływu na wynik)
      const d=Math.sqrt(d2),ct=dzz/d;
      // przesłonięcie: po tej samej stronie stropu – rzut tej przestrzeni; przez strop – tylko przez otwór (pustka, schody)
      let tr=1;const aboveL=L.abs>gh+.05,aboveT=f===up;
      if(aboveL===aboveT){const ck=(aboveT?'u':'g')+(Math.floor(P.y/c)*W+Math.floor(P.x/c)),C=L.tc||(L.tc={});tr=ck in C?C[ck]:(C[ck]=seg(aboveT?up:lo,L.x,L.y,(Math.floor(P.x/c)+.5)*c,(Math.floor(P.y/c)+.5)*c))}
      else if(hasUp){const tt=(L.abs-gh)/(L.abs-tAbs),ix=L.x+dx*tt,iy=L.y+dy*tt,hc=idAt(up,Math.floor(ix/c),Math.floor(iy/c));if(!isHole(up,hc))return 0;
        tr=aboveL?seg(up,L.x,L.y,ix,iy)*seg(lo,ix,iy,P.x,P.y):seg(lo,L.x,L.y,ix,iy)*seg(up,ix,iy,P.x,P.y)}else return 0;
      if(!tr)return 0;return tr*L.I0*Math.pow(ct,L.n)*ct/d2};
    for(const f of [lo,up])for(const P of floors[f].pts){for(const L of lamps){if(L.f!==f&&!hasUp)continue;const e=direct(L,f,P);if(e>0)P.dir+=e}P.E=P.dir}
    // odbicia: strefy połączone otwartymi przejściami / szkłem / pustką dzielą światło odbite (Φ·ρ / (S·(1−ρ)))
    const par={},find=k=>par[k]===k?k:(par[k]=find(par[k])),uni=(a,b)=>{par[find(a)]=find(b)};
    for(const f of [lo,up])for(let y=0;y<H;y++)for(let x=0;x<W;x++){const v=idAt(f,x,y);if(isVoid(f,v))continue;const k=f+'|'+v;if(!(k in par))par[k]=k;
      for(const [bx,by] of [[x+1,y],[x,y+1]]){const w=idAt(f,bx,by);if(isVoid(f,w)||w===v)continue;const kw=f+'|'+w;if(!(kw in par))par[kw]=kw;if(edgeT(f,x,y,bx,by)>.5)uni(k,kw)}
      if(f===up&&isHole(up,v)){const g=idAt(lo,x,y);if(!isVoid(lo,g)){const kg=lo+'|'+g;if(!(kg in par))par[kg]=kg;uni(k,kg)}}}
    const zone={};for(const r of q.rooms){const k=r.f+'|'+r.id;if(!(k in par))par[k]=k;const z=find(k),Z=zone[z]||(zone[z]={area:0,S:0,flux:0});const h=r.f===up?(attic?1.9:(upH||2.6)):gh,per=Math.sqrt(r.area)*4;Z.area+=r.area;Z.S+=2*r.area+per*h}
    for(const L of lamps){if(!L.room)continue;const k=L.f+'|'+L.room;if(!(k in par))continue;const Z=zone[find(k)];if(Z)Z.flux+=L.lm}
    for(const f of [lo,up])for(const P of floors[f].pts){const k=f+'|'+P.room;const Z=k in par?zone[find(k)]:null;if(Z&&Z.S>0)P.E+=Z.flux*S.rho/(Z.S*(1-S.rho))*.7}
    // pomieszczenia
    const out=[],issues=[],good=[],add=(p,text,tip,type,room)=>issues.push({p:Math.round(p*100)/100,text,tip:tip||'',type:type||'light',room});
    const elP=global.HouserEnergy?(()=>{try{return HouserEnergy.settings(project).pEl}catch(_){return 1.1}})():1.1;
    let kwh=0;
    for(const r of q.rooms){if(r.area<1.5)continue;const K=kindOf(r.name),P=floors[r.f].pts.filter(p=>p.room===r.id);if(!P.length)continue;
      const avg=P.reduce((a,p)=>a+p.E,0)/P.length,min=Math.min(...P.map(p=>p.E)),RL=lamps.filter(L=>L.f===r.f&&L.room===r.id),Wr=RL.reduce((a,L)=>a+L.W,0);kwh+=Wr*K.h*365/1000;
      const dark=P.filter(p=>p.E<K.lx*.3).length/P.length,ratio=avg/K.lx,stt=!RL.length&&avg<K.lx*.5?'none':ratio<.6?'dark':ratio>3?'bright':dark>.25?'uneven':'ok';
      const Kok=!RL.length||RL.filter(L=>L.type!=='table').every(L=>K.K.includes(L.K));
      out.push({key:r.f+'|'+r.id,f:r.f,id:r.id,name:r.name,area:r.area,kind:K.name,target:K.lx,avg,min,dark,lamps:RL.length,W:Wr,status:stt,Kok,K:[...new Set(RL.map(L=>L.K))]});
      const nm='„'+r.name+'”';
      if(stt==='none')add(1,'W pomieszczeniu '+nm+' nie ma żadnej lampy – nocą jest ciemno (ok. '+fmt(avg)+' lx).','Dodaj lampę sufitową albo oczka – zalecane ok. '+K.lx+' lx.','none',r.name);
      else if(stt==='dark')add(Math.min(1.2,.4+(1-ratio)),nm+': średnio '+fmt(avg)+' lx – za ciemno (zalecane ok. '+K.lx+' lx dla: '+K.name+').','Mocniejsze źródła (więcej lumenów) albo dodatkowa lampa.','dark',r.name);
      else if(stt==='bright')add(.3,nm+': średnio '+fmt(avg)+' lx – dużo jaśniej niż potrzeba ('+K.lx+' lx), więcej prądu i olśnienie.','Słabsze źródła albo ściemniacz.','bright',r.name);
      else if(stt==='uneven')add(.4,nm+': '+fmt(dark*100)+'% podłogi w cieniu (poniżej '+fmt(K.lx*.3)+' lx) – ciemne kąty.','Dodaj lampę w ciemnej części albo kinkiet.','uneven',r.name);
      if(!Kok)add(.2,nm+': barwa światła '+[...new Set(RL.filter(L=>L.type!=='table').map(L=>L.K))].join(' / ')+' K – do tego pomieszczenia lepiej '+K.K.join(' / ')+' K.',K.K[0]<3000?'Ciepła barwa (2700 K) sprzyja odpoczynkowi.':'Neutralna barwa (3000–4000 K) lepsza do pracy.','temp',r.name)}
    // miejsca pracy (meble)
    const tasks=[];for(const f of [lo,up])for(const it of project.furniture?.[f]||[]){const T=TASKS.find(t=>t.re.test(it.item||''));if(!T)continue;const x0=+it.x,y0=+it.y,x1=x0+ +it.w,y1=y0+ +it.h;
      const P=floors[f].pts.filter(p=>p.x>=x0&&p.x<=x1&&p.y>=y0&&p.y<=y1);if(!P.length)continue;const avg=P.reduce((a,p)=>a+p.E,0)/P.length;tasks.push({f,name:T.name,lx:T.lx,avg,ok:avg>=T.lx*.6});
      if(avg<T.lx*.6&&lamps.length)add(.4,'Miejsce pracy – '+T.name+': ok. '+fmt(avg)+' lx, zalecane '+T.lx+' lx.',T.name==='blat kuchenny'?'Taśma LED pod szafkami wiszącymi albo oczka nad blatem.':T.name==='stół jadalny'?'Lampa wisząca nad środkiem stołu.':T.name==='biurko'?'Lampka biurkowa albo oczko nad biurkiem.':'Kinkiet lub podświetlane lustro przy umywalce.','task')}
    // schody: bezpieczeństwo
    if(hasUp&&(project.stairs||[]).length&&lamps.length){const sc=[];for(let i=0;i<W*H;i++)if(st[up][i]==='schody')sc.push([(i%W+.5)*c,(Math.floor(i/W)+.5)*c]);
      if(sc.length){const P=floors[lo].pts.filter(p=>sc.some(([x,y])=>Math.abs(p.x-x)<c/2&&Math.abs(p.y-y)<c/2)),avg=P.length?P.reduce((a,p)=>a+p.E,0)/P.length:0;
        if(P.length&&avg<75)add(.6,'Schody: ok. '+fmt(avg)+' lx – za ciemno, łatwo o potknięcie.','Kinkiety przy biegu albo oprawy w stopniach / ścianie (co 3–4 stopnie).','stairs');else if(P.length)good.push('Schody oświetlone (ok. '+fmt(avg)+' lx).')}}
    const lit=out.filter(r=>r.status==='ok').length;if(lit)good.push(lit+' z '+out.length+' pomieszczeń oświetlonych zgodnie z zaleceniami.');
    if(lamps.some(L=>L.bulb==='halogen'||L.bulb==='incand'))add(.3,'Część lamp ma żarówki halogenowe / tradycyjne – 6–8× więcej prądu niż LED.','Wymień na LED o tym samym strumieniu (lm).','bulb');
    const voidLamps=lamps.filter(L=>L.void).length;
    if(voidLamps)good.push('Lampy w pustce: '+voidLamps+' – świecą na parter i na antresolę.');
    const power=lamps.reduce((a,L)=>a+L.W,0),price=lamps.reduce((a,L)=>a+(L.T.price||0),0);
    const score=lamps.length?Math.round(Math.max(0,10-issues.reduce((a,i)=>a+i.p,0))*10)/10:null;
    return {floors,rooms:out,tasks,lamps,power,kwh,costYear:kwh*elP,price,issues,good,score,set:S,lo,up,W,H,c,step:STEP,gh}}
  // układy oświetlenia pomieszczenia (tryb automatyczny) i poziomy jasności
  const SCHEMES={auto:'Dobrany do pomieszczenia',ceiling:'Plafon(y) na suficie',downlights:'Oczka LED w siatce',pendant:'Lampa wisząca + oczka',track:'Szynoprzewód z reflektorami',mood:'Nastrojowo: kinkiety i lampy stojące'};
  const LEVELS={low:['Nastrojowo (ciemniej)',.7],std:['Standard (wg zaleceń)',1],high:['Jasno',1.4]};
  // lampy dla jednego pomieszczenia: opt = {scheme, level, K}; auto + standard = propozycja domyślna
  function roomLamps(project,r,opt,q){q=q||HouserQuantities.compute(project);const c=q.c,id=()=>'l'+Math.random().toString(36).slice(2,8),o=opt||{},scheme=SCHEMES[o.scheme]?o.scheme:'auto',mult=(LEVELS[o.level]||LEVELS.std)[1];
    const flat=f=>{const st=project.state?.[f]||[];return Array.isArray(st[0])?st.flat():st},stU=flat(q.up);
    const F=f=>project.furniture?.[f]||[],inR=(r,x,y)=>r.cells.some(([cx,cy])=>x>=cx*c&&x<(cx+1)*c&&y>=cy*c&&y<(cy+1)*c);
    let out=[];
    if(scheme==='auto'){const K=kindOf(r.name),L=[],xs=r.cells.map(a=>a[0]),ys=r.cells.map(a=>a[1]),x0=Math.min(...xs)*c,x1=(Math.max(...xs)+1)*c,y0=Math.min(...ys)*c,y1=(Math.max(...ys)+1)*c;
      const cx=r.cells.reduce((a,p)=>a+p[0]+.5,0)/r.cells.length*c,cy=r.cells.reduce((a,p)=>a+p[1]+.5,0)/r.cells.length*c;
      const Kd=K.K.includes(3000)?3000:K.K[0],underHole=(x,y)=>r.f===q.lo&&/^pustka$/.test(stU[Math.floor(y/c)*q.W+Math.floor(x/c)]||'');
      const grid=(type,sp,lm)=>{const nx=Math.max(1,Math.round((x1-x0)/sp)),ny=Math.max(1,Math.round((y1-y0)/sp));for(let a=0;a<nx;a++)for(let b=0;b<ny;b++){const x=x0+(a+.5)*(x1-x0)/nx,y=y0+(b+.5)*(y1-y0)/ny;if(inR(r,x,y)&&!underHole(x,y))L.push({id:id(),x,y,type,lm,K:Kd})}};
      const furn=F(r.f).filter(it=>inR(r,+it.x+ +it.w/2,+it.y+ +it.h/2));
      const combo=K.k==='kitchen'&&/salon|dzienn|jadal/i.test(r.name);
      if(combo){ // salon z aneksem: plafony w części dziennej, oczka nad blatami, taśma pod szafkami
        const nC=Math.max(1,Math.round(r.area/22));for(let i=0;i<nC;i++){const t=(i+.5)/nC,x=(x1-x0)>=(y1-y0)?x0+(x1-x0)*t:cx,y=(x1-x0)>=(y1-y0)?cy:y0+(y1-y0)*t;if(inR(r,x,y)&&!underHole(x,y))L.push({id:id(),x,y,type:'ceiling',lm:Math.round(Math.max(1200,r.area/nC*150*1.6)),K:3000})}
        for(const it of furn.filter(i=>/^k_(dolne|narozne|zlew|plyta|wyspa)/.test(i.item||''))){const n=Math.max(1,Math.round(Math.max(+it.w,+it.h)/1.2)),hor=+it.w>=+it.h;for(let a=0;a<n;a++)L.push({id:id(),x:+it.x+(hor?(a+.5)/n*+it.w:+it.w/2),y:+it.y+(hor?+it.h/2:(a+.5)/n*+it.h),type:'downlight',lm:450,K:3000})}
        for(const it of furn.filter(i=>/^k_(dolne|narozne|zlew|plyta)/.test(i.item||'')))L.push({id:id(),x:+it.x+ +it.w/2,y:+it.y+ +it.h/2,type:'strip',lm:Math.round(650*Math.max(+it.w,+it.h)),K:3000})}
      else if(K.k==='kitchen'){grid('downlight',1.3,450);for(const it of furn.filter(i=>/^k_(dolne|narozne|zlew|plyta)/.test(i.item||'')))L.push({id:id(),x:+it.x+ +it.w/2,y:+it.y+ +it.h/2,type:'strip',lm:Math.round(650*Math.max(+it.w,+it.h))});}
      else if(K.k==='bath'||K.k==='wc'){grid('downlight',1.2,450);for(const it of furn.filter(i=>/^l_umywalka/.test(i.item||'')))L.push({id:id(),x:+it.x+ +it.w/2,y:+it.y+ +it.h/2,type:'wall',lm:500,K:4000});}
      else if(K.k==='garage'||K.k==='utility')grid('ceiling',K.k==='garage'?3:2.2,K.k==='garage'?2500:Math.round(Math.max(1500,r.area*K.lx*1.8)));
      else if(K.k==='hall'||K.k==='stairs'||K.k==='wardrobe')grid('downlight',1.4,K.k==='wardrobe'?600:450);
      else if(!underHole(cx,cy))L.push({id:id(),x:cx,y:cy,type:'ceiling',lm:Math.round(Math.max(1200,r.area*K.lx*1.6)),K:Kd});
      if(!combo&&!['kitchen','bath','wc','garage','utility','hall','stairs','wardrobe'].includes(K.k)){
        if(K.k==='bedroom'||K.k==='kids')for(const it of furn.filter(i=>/^b_nocna/.test(i.item||'')))L.push({id:id(),x:+it.x+ +it.w/2,y:+it.y+ +it.h/2,type:'table',lm:300,K:2700});
        if(K.k==='living')for(const it of furn.filter(i=>/^s_(fotel|naroznik|sofa3)/.test(i.item||'')).slice(0,1))L.push({id:id(),x:+it.x+.3,y:+it.y+.3,type:'floor',lm:700,K:2700});
}
      for(const it of furn.filter(i=>/^g_biurko/.test(i.item||'')))L.push({id:id(),x:+it.x+ +it.w/2,y:+it.y+ +it.h/2,type:'table',lm:600,K:4000});
      for(const it of furn.filter(i=>/^k_stol/.test(i.item||'')))L.push({id:id(),x:+it.x+ +it.w/2,y:+it.y+ +it.h/2,type:'pendant',lm:1200,K:2700});
      out=L;
    }else{const K=kindOf(r.name),xs=r.cells.map(a=>a[0]),ys=r.cells.map(a=>a[1]),x0=Math.min(...xs)*c,x1=(Math.max(...xs)+1)*c,y0=Math.min(...ys)*c,y1=(Math.max(...ys)+1)*c,L=[];
      const Kd=K.K.includes(3000)?3000:K.K[0],underHole=(x,y)=>r.f===q.lo&&stU[Math.floor(y/c)*q.W+Math.floor(x/c)]==='pustka',furn=F(r.f).filter(it=>inR(r,+it.x+ +it.w/2,+it.y+ +it.h/2));
      const total=K.lx*r.area/.7,r50=v=>Math.max(100,Math.round(v/50)*50),cx=r.cells.reduce((a,p)=>a+p[0]+.5,0)/r.cells.length*c,cy=r.cells.reduce((a,p)=>a+p[1]+.5,0)/r.cells.length*c,long=(x1-x0)>=(y1-y0);
      const spots=(n,type,lm,frac)=>{const ar=(x1-x0)/(y1-y0),nx=Math.max(1,Math.round(Math.sqrt(n*ar))),ny=Math.max(1,Math.round(n/nx)),pts=[];for(let a=0;a<nx;a++)for(let b=0;b<ny;b++){const x=x0+(a+.5)*(x1-x0)/nx,y=y0+(b+.5)*(y1-y0)/ny;if(inR(r,x,y)&&!underHole(x,y))pts.push([x,y])}
        if(!pts.length&&inR(r,cx,cy))pts.push([cx,cy]);for(const [x,y] of pts)L.push({id:id(),x,y,type,lm:lm||r50(total*(frac||1)/pts.length),K:Kd})};
      // miejsca przy ścianach (kinkiety): środki krawędzi kratek, za którymi nie ma tego pomieszczenia i nie ma otworu
      const walls=()=>{const set=new Set(r.cells.map(p=>p[0]+','+p[1])),ops=project.openings?.[r.f]||{},w=[];
        for(const [x,y] of r.cells)for(const [dx,dy,key,px,py,nx,ny] of [[0,-1,'h:'+x+':'+y,x+.5,y,0,1],[0,1,'h:'+x+':'+(y+1),x+.5,y+1,0,-1],[-1,0,'v:'+x+':'+y,x,y+.5,1,0],[1,0,'v:'+(x+1)+':'+y,x+1,y+.5,-1,0]])
          if(!set.has((x+dx)+','+(y+dy))&&!ops[key])w.push([px*c+nx*.08,py*c+ny*.08]);return w};
      if(scheme==='ceiling'){const n=Math.max(1,Math.round(r.area/18));spots(n,'ceiling')}
      else if(scheme==='downlights')spots(Math.max(2,Math.ceil(total/450)),'downlight',450);
      else if(scheme==='pendant'){const t=furn.find(i=>/^k_stol|^k_wyspa|^s_stolik/.test(i.item||''));const px=t?+t.x+ +t.w/2:cx,py=t?+t.y+ +t.h/2:cy;L.push({id:id(),x:px,y:py,type:'pendant',lm:r50(total*.4),K:2700});spots(Math.max(2,Math.ceil(total*.6/450)),'downlight',450)}
      else if(scheme==='track'){const n=Math.max(1,Math.ceil(total/2400));for(let i=0;i<n;i++){const t=(i+.5)/n,x=long?x0+(x1-x0)*t:cx,y=long?cy:y0+(y1-y0)*t;if(inR(r,x,y))L.push({id:id(),x,y,type:'track',lm:r50(total/n),K:Kd})}}
      else if(scheme==='mood'){const w=walls(),n=Math.max(2,Math.min(w.length,Math.round(Math.sqrt(r.area)*4/3)));for(let i=0;i<n;i++){const [x,y]=w[Math.floor((i+.5)*w.length/n)];L.push({id:id(),x,y,type:'wall',lm:Math.min(1500,r50(total*1.1/n)),K:2700})}
        const seat=furn.find(i=>/^s_(fotel|naroznik|sofa3)/.test(i.item||''));L.push({id:id(),x:seat?+seat.x+.3:x0+.4,y:seat?+seat.y+.3:y0+.4,type:'floor',lm:700,K:2700});
        for(const it of furn.filter(i=>/^b_nocna/.test(i.item||'')))L.push({id:id(),x:+it.x+ +it.w/2,y:+it.y+ +it.h/2,type:'table',lm:300,K:2700})}
      out=L}
    // pustka nad tym pomieszczeniem: lampa wisząca z połaci nad środkiem pustki (wisi wyżej niż antresola)
    if(scheme==='auto'){const hc=r.f===q.lo?r.cells.filter(([x,y])=>stU[y*q.W+x]==='pustka'):[];
      if(hc.length){const hx=(hc.reduce((a,p)=>a+p[0],0)/hc.length+.5)*c,hy=(hc.reduce((a,p)=>a+p[1],0)/hc.length+.5)*c;out=out.filter(L=>!(L.type==='ceiling'&&Math.hypot(L.x-hx,L.y-hy)<1.5));out.push({id:id(),x:hx,y:hy,type:'pendant',lm:2000,K:2700,h:q.G.groundHeight+1.4})}}
    for(const L of out){L.x=Math.round(L.x*100)/100;L.y=Math.round(L.y*100)/100;if(mult!==1)L.lm=Math.max(100,Math.round(L.lm*mult/50)*50);if(KS.includes(+o.K)&&!['table','floor'].includes(L.type))L.K=+o.K}
    return out}
  // propozycja dla całego domu: każde pomieszczenie wg swoich ustawień (project.lighting.rooms), domyślnie układ dobrany do pomieszczenia
  function suggest(project){const q=HouserQuantities.compute(project),out={[q.lo]:[],[q.up]:[]},RS=project.lighting?.rooms||{};
    for(const r of q.rooms){if(r.area<1.5)continue;const o=RS[r.f+'|'+r.id];if(o?.mode==='manual')continue;out[r.f].push(...roomLamps(project,r,o,q))}
    return out}
  global.HouserLight={TYPES,BULBS,KS,ROOMS,TASKS,WP,SCHEMES,LEVELS,kindOf,settings,evaluate,suggest,roomLamps};
})(typeof window!=='undefined'?window:globalThis);
