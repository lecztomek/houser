// Obliczenia nasłonecznienia (zyski od słońca latem i zimą per pomieszczenie) – wspólne dla modułów Nasłonecznienie i Porównanie.
// HouserSolar.compute(project) -> {rooms, list, wins, house…}. Wymaga shared/quantities.js i sun.js.
(function(global){
let project=null;
const S=HouserSun,D2R=Math.PI/180;
const fmt=(v,d=0)=>(Math.round((+v||0)*10**d)/10**d).toLocaleString('pl-PL',{minimumFractionDigits:d,maximumFractionDigits:d});
const ORD=['north','east','south','west'],AZ={north:0,east:90,south:180,west:270};
const FAC={north:{short:'Pn',adj:'północne',fem:'północna',on:'Na północy'},east:{short:'Wsch',adj:'wschodnie',fem:'wschodnia',on:'Na wschodzie'},south:{short:'Pd',adj:'południowe',fem:'południowa',on:'Na południu'},west:{short:'Zach',adj:'zachodnie',fem:'zachodnia',on:'Na zachodzie'}};
const BLIND={none:1,internal:.65,external:.25};
const RISK=[{n:'niskie',bg:'#fbe7cf',fg:'#0f172a'},{n:'umiarkowane',bg:'#f5b77a',fg:'#0f172a'},{n:'wysokie',bg:'#e2753a',fg:'#fff'},{n:'bardzo wysokie',bg:'#a8421a',fg:'#fff'}];
const NOWIN='#f1efea';
const WINT=['#e3eefc','#b7d3f6','#86b6ef','#3987e5','#1c5cab'],WINT_T=[5,15,30,50]; // kWh/m² podłogi w sezonie
// serie wykresu godzinowego – kolor przypisany do źródła (stały, niezależny od kolejności)
const SRC=[['south','Okna południowe','#2a78d6'],['west','Okna zachodnie','#eb6834'],['east','Okna wschodnie','#1baf7a'],['north','Okna północne','#eda100'],['roof','Okna dachowe','#e87ba4'],['roofHeat','Ciepło przez dach','#008300'],['internal','Zyski wewnętrzne','#4a3aa7']];
const SEASON={10:.8,11:.95,12:1,1:1,2:.95,3:.85,4:.6}; // miesiące sezonu grzewczego i współczynnik wykorzystania zysków
const MONTHS=['sty','lut','mar','kwi','maj','cze','lip','sie','wrz','paź','lis','gru'];
const LOCAL_SHIFT=.75; // czas letni (CEST) ≈ czas słoneczny + 45 min dla środkowej Polski

function ss(){const s=project?.solarSettings||{},num=(v,d)=>Number.isFinite(+v)&&v!==''&&v!=null?+v:d;
  return {g:Math.max(.1,Math.min(.9,num(s.g,.5))),blinds:BLIND[s.blinds]?s.blinds:'none',weather:s.weather==='avg'?'avg':'sunny',internal:Math.max(0,Math.min(10,num(s.internal,0)))}}
function sideMap(){const top=project?.orientation?.top,i=Math.max(0,ORD.indexOf(top));return {top:ORD[i],right:ORD[(i+1)%4],bottom:ORD[(i+2)%4],left:ORD[(i+3)%4]}}
// ---------------------------------------------------------------- obliczenia
function compute(){
  const q=HouserQuantities.compute(project),G=q.G,c=q.c,W=q.W,H=q.H,lo=q.lo,up=q.up,s=ss(),sm=sideMap(),tan=Math.tan(G.roofPitch*D2R),cosP=Math.cos(G.roofPitch*D2R);
  const dsn=project.definitionSnapshot||{},def={};for(const f of [lo,up])def[f]=Object.fromEntries((dsn.floors?.[f]?.rooms||[]).map(r=>[r.id,r]));
  const flat=f=>{const st=project.state?.[f]||[];return Array.isArray(st[0])?st.flat():st},st={[lo]:flat(lo),[up]:flat(up)};
  const id=(f,x,y)=>x<0||y<0||x>=W||y>=H?null:(st[f]?.[y*W+x]||null);
  const occ=(f,x,y)=>{const v=id(f,x,y);return !!v&&def[f]?.[v]?.kind!=='exteriorVoid'};
  const upAbove=(x,y)=>{const v=id(up,x,y);return !!v&&v!=='pustka'&&v!=='schody'};
  const hasUp=q.rooms.some(r=>r.f===up);
  const out=HouserModel.outdoorMap(project.outdoorStructures||[],c);
  const kind=s.weather==='sunny'?'clear':'avg',blind=BLIND[s.blinds];
  const rooms={};for(const r of q.rooms){if(r.area<.5)continue;rooms[r.f+'|'+r.id]={...r,key:r.f+'|'+r.id,floorName:dsn.floors?.[r.f]?.name||(r.f===lo?'Parter':'Piętro'),wins:[],fac:{north:0,east:0,south:0,west:0,roof:0},src:{}}}
  const slopeSide=(x,y)=>q.across?((x+.5)*c<q.span/2?'left':'right'):((y+.5)*c<q.span/2?'top':'bottom');
  const isEave=side=>q.across?(side==='left'||side==='right'):(side==='top'||side==='bottom');
  const wins=[];
  for(const r of q.runs){
    if(r.base!=='window'&&r.base!=='hst')continue;const roof=r.info.shape==='roof';if(!r.ext&&!roof)continue;
    const ids=[...new Set([r.ra,r.rb].filter(Boolean))].map(v=>rooms[r.f+'|'+v]).filter(Boolean);if(!ids.length)continue;
    const [o,aS,bS]=r.keys[Math.floor(r.keys.length/2)].split(':'),a=+aS,b=+bS,cellA=o==='h'?[a,b-1]:[a-1,b],cellB=[a,b];
    const w={f:r.f,rooms:ids,base:r.base,info:r.info,A:r.area,g:s.g,roof,keys:r.keys,o:r.o,line:r.line,from:r.from,to:r.to};
    if(roof){const cell=r.ra?cellA:cellB;w.side=slopeSide(cell[0],cell[1]);w.tilt=G.roofPitch;w.ff=.65;w.hB=0;w.hT=1;w.cols=[{shades:[]}];w.cell=cell}
    else{
      const side=w.side=o==='h'?(r.ra?'bottom':'top'):(r.ra?'right':'left'),L=r.line,base=r.f===lo?0:G.groundHeight;
      w.tilt=90;w.ff=r.base==='hst'?.8:.7;w.hB=+r.info.sill||0;w.hT=w.hB+(+r.info.height||1.2);w.eave=isEave(side);
      const dist=(side==='top'||side==='left'?L:(side==='bottom'?H-L:W-L))*c;
      const outCell=(i,k)=>side==='top'?[i,L-k]:side==='bottom'?[i,L+k-1]:side==='left'?[L-k,i]:[L+k-1,i];
      w.cols=[];w.roofP=w.eave?dist+G.eaveOverhang:dist+G.gableOverhang;
      for(let i=r.from;i<=r.to;i++){const sh=[];
        let hO;if(w.eave)hO=G.eave-G.eaveOverhang*tan-base;else{const a=(i+.5)*c,t=Math.max(0,1-Math.abs(a-q.span/2)/(q.span/2));hO=G.eave+G.rise*t-base}
        sh.push({kind:'roof',P:w.roofP,hO:Math.max(hO,w.hT+.05)});
        let pergola=false;
        if(r.f===lo){
          if(hasUp){let k=1;while(k<30){const [x,y]=outCell(i,k);if(!upAbove(x,y))break;k++}if(k>1)sh.push({kind:'upper',P:(k-1)*c,hO:Math.max(G.groundHeight,w.hT+.05)})}
          let k=1;while(k<40){const [x,y]=outCell(i,k);if(out.get(x+','+y)!=='coveredTerrace')break;k++}
          if(k>1)sh.push({kind:'terrace',P:(k-1)*c,hO:Math.max(Math.min(G.groundHeight,2.7),w.hT+.05)});
          const [x1,y1]=outCell(i,1);pergola=out.get(x1+','+y1)==='pergola';
        }
        w.cols.push({shades:sh,pergola})}
      w.shadedBy={upper:w.cols.some(c=>c.shades.some(x=>x.kind==='upper')),terrace:w.cols.some(c=>c.shades.some(x=>x.kind==='terrace')),pergola:w.cols.some(c=>c.pergola)};
      w.roofHO=w.cols[0].shades[0].hO;
    }
    w.facing=sm[w.side];w.az=AZ[w.facing];
    w.blindKind=BLIND[w.info.blind]!=null?w.info.blind:s.blinds;w.blindK=BLIND[w.blindKind]; // roleta ustawiona przy oknie (moduł Okna i drzwi) albo domyślna
    // zyski
    w.sum=S.windowSteps(w,7,kind,{blind:w.blindK,pergolaT:.5});
    w.sumDay=w.sum.reduce((a,v)=>a+v,0)*S.STEP/1000;
    w.janDay=S.windowSteps(w,1,kind,{pergolaT:.8}).reduce((a,v)=>a+v,0)*S.STEP/1000;
    w.month=[];for(let m=1;m<=12;m++){const summer=m>=5&&m<=9;w.month.push(S.windowSteps(w,m,'avg',{blind:summer?w.blindK:1,pergolaT:summer?.5:.8}).reduce((a,v)=>a+v,0)*S.STEP/1000*S.MDAYS[m-1])}
    w.season=Object.entries(SEASON).reduce((a,[m,eta])=>a+w.month[m-1]*eta*(m>=5&&m<=9?1:1),0);
    // (zima bez osłon – miesiące sezonu nie mają rolet, bo SEASON nie obejmuje maja–września)
    w.part=1/ids.length;wins.push(w);
    for(const m of ids){m.wins.push(w);m.fac[roof?'roof':w.facing]+=w.A*w.part}
  }
  // ciepło przez dach (lato): poddasze – połać nad pokojem, pod strychem – strop (część wpływu połaci)
  const Uroof=Number.isFinite(+project.energySettings?.U?.roof)&&+project.energySettings.U.roof>0?+project.energySettings.U.roof:.13;
  const prof=S.day(7,kind),n=prof.length,lag=Math.round(3/S.STEP),slopeI={};
  for(const side of ['top','bottom','left','right']){const az=AZ[sm[side]];slopeI[side]=prof.map(p=>{const r=S.onPlane(p,G.roofPitch,az);return r.dir+r.sky+r.gnd})}
  const toBin=t=>Math.floor((t+LOCAL_SHIFT)%24);
  for(const R of Object.values(rooms)){
    const steps={},add=(k,arr)=>{const a=steps[k]||(steps[k]=new Float64Array(n));for(let i=0;i<n;i++)a[i]+=arr[i]};
    for(const w of R.wins){const k=w.roof?'roof':w.facing,arr=w.part===1?w.sum:w.sum.map(v=>v*w.part);add(k,arr)}
    let roofUA={top:0,bottom:0,left:0,right:0},attic=0,any=false;
    for(const [x,y] of R.cells){const side=slopeSide(x,y);
      if(R.f===up&&G.upperType==='attic'){roofUA[side]+=c*c/cosP;attic++;any=true}
      else if(R.f===up||(R.f===lo&&!upAbove(x,y))){roofUA[side]+=c*c*.35;any=true}}
    R.light=attic>R.cells.length/2; // lekka konstrukcja pod skosami – mniejsza bezwładność cieplna
    R.attic=attic>0;
    if(any){const arr=new Float64Array(n);for(const side in roofUA){if(!roofUA[side])continue;const I=slopeI[side];
        for(let i=0;i<n;i++){const j=(i-lag+n)%n,dT=.7*I[j]/18+S.tOut(prof[j].t,kind)-24;if(dT>0)arr[i]+=Uroof*roofUA[side]*dT}}
      if(arr.some(v=>v>0))add('roofHeat',arr)}
    if(s.internal>0)add('internal',new Float64Array(n).fill(s.internal*R.area));
    // godziny zegarowe (czas letni)
    const bins={};R.hours=new Array(24).fill(0);
    for(const k in steps){const b=bins[k]=new Array(24).fill(0);for(let i=0;i<n;i++)b[toBin(prof[i].t)]+=steps[k][i]*S.STEP}
    for(const k in bins)for(let h=0;h<24;h++)R.hours[h]+=bins[k][h];
    R.bins=bins;R.srcDay={};for(const k in bins)R.srcDay[k]=bins[k].reduce((a,v)=>a+v,0)/1000;
    R.sumDay=R.hours.reduce((a,v)=>a+v,0)/1000;
    R.solarDay=R.wins.reduce((a,w)=>a+w.sumDay*w.part,0);
    R.peakW=Math.max(...R.hours);R.peakH=R.hours.indexOf(R.peakW);R.peak=R.peakW/R.area;
    const th=[15,30,50].map(v=>R.light?v*.8:v);R.risk=R.peak<th[0]?0:R.peak<th[1]?1:R.peak<th[2]?2:3;R.th=th;
    R.season=R.wins.reduce((a,w)=>a+w.season*w.part,0);R.janDay=R.wins.reduce((a,w)=>a+w.janDay*w.part,0);
    R.month=Array.from({length:12},(_,m)=>R.wins.reduce((a,w)=>a+w.month[m]*w.part,0));
    R.glazA=R.wins.reduce((a,w)=>a+w.A*w.part,0);
  }
  const list=Object.values(rooms);
  const house={sumDay:list.reduce((a,r)=>a+r.solarDay,0),season:list.reduce((a,r)=>a+r.season,0),janDay:list.reduce((a,r)=>a+r.janDay,0),month:Array.from({length:12},(_,m)=>wins.reduce((a,w)=>a+w.month[m],0))};
  const facSum={};for(const w of wins){const k=w.roof?'roof':w.facing;facSum[k]=(facSum[k]||0)+w.sumDay}
  house.facSum=facSum;
  return {q,G,s,sm,rooms,list,wins,house,kind,blind,out,occ,W,H,c,lo,up};
}

const withP=fn=>p=>{const o=project;project=p;try{return fn()}finally{project=o}};
global.HouserSolar={ORD,AZ,FAC,BLIND,RISK,NOWIN,WINT,WINT_T,SRC,SEASON,MONTHS,LOCAL_SHIFT,settings:withP(ss),sideMap:withP(sideMap),compute:withP(compute)};
})(window);
