// Konstrukcja – uproszczona ocena, czy układ da się tanio zbudować (to nie jest projekt konstrukcyjny).
// HouserStructure.evaluate(project) -> {score, verdict, issues, good, cost:{items, total}, spans, walls, openings, roof, …}
// Sprawdzamy:
//  • rozpiętość stropu nad parterem – odległość między ścianami parteru w każdej kratce (krótszy kierunek); ponad ok. 6 m potrzebny podciąg;
//  • ściany piętra, pod którymi na parterze nie ma ściany (zewnętrzne = podciąg; działowe = lekkie ścianki na stropie);
//  • piętro wysunięte poza parter (wspornik), otwory w stropie (schody, antresola – belki wymianowe);
//  • szerokie otwory w ścianach zewnętrznych (nadproża, belki) i przeszklenia narożne (słup);
//  • dach: długość krokwi, rodzaj więźby, wysoka ścianka kolankowa; balkony wysunięte daleko.
// Ceny orientacyjne (z robocizną) trafiają do Wyceny jako „Wzmocnienia konstrukcji”.
// Wymaga shared/house-model.js, shared/openings.js, shared/quantities.js (opcjonalnie shared/balconies.js).
(function(global){
  const LIM={slab:6.0,slabMax:7.5,rafter:4.5,rafterMax:6.5,lintel:3.0,lintelBig:4.5,cant:1.2,balcony:1.5,knee:1.2};
  // rodzaje stropu nad parterem: do jakiej rozpiętości wystarczą i ile kosztują więcej za m² (ponad zwykły strop w Wycenie)
  const SLABS={std:{name:'Gęstożebrowy (np. Teriva) albo płyta 20 cm',lim:6,addM2:0},thick:{name:'Płyta żelbetowa 25 cm',lim:7.5,addM2:60},hollow:{name:'Płyty kanałowe sprężone',lim:10,addM2:120,note:'montaż dźwigiem'}};
  // podciąg: widoczny pod sufitem (taniej, do ok. 7,5 m między podporami) albo ukryty w stropie (sufit płaski, do ok. 6 m)
  const BEAM={visible:{lim:7.5,m:1100,h:.3,w:.25},hidden:{lim:6,m:1600}};
  // ---------- obciążenia (uproszczone wg PN-EN 1990/1991; wartości charakterystyczne w kN/m², kN/m; obliczeniowe ×1,35 stałe, ×1,5 zmienne)
  const SLAB_G={std:3.8,thick:6.3,hollow:4.3},SLAB_H={std:.24,thick:.25,hollow:.265},FINISH_G=1.6,LIVE=1.5;
  const PART={light:{name:'lekkie – płyty g-k na stelażu',wall:.5},masonry12:{name:'murowane 12 cm (bloczki, silikat)',wall:2.2},masonry18:{name:'murowane 18 cm',wall:3.3}};
  const ROOF_G={sheet:{name:'blacha / blachodachówka',g:.35},concrete:{name:'dachówka betonowa',g:.75},ceramic:{name:'dachówka ceramiczna',g:.95}};
  const SNOW={1:.7,2:.9,3:1.2,4:1.6,5:2.0};
  const SOIL={weak:{name:'słaby (glina plastyczna, nasyp)',kPa:100},avg:{name:'przeciętny (piasek średni, glina zwarta)',kPa:150},good:{name:'dobry (żwir, piasek zagęszczony)',kPa:250}};
  // ściany zewnętrzne (moduł Ocieplenie): ciężar muru kN/m³ i orientacyjna nośność ściany parteru kN/m (obliczeniowo)
  const WALL_MAT={aac:{g:6,cap:300},aac36:{g:6,cap:430},ceramic:{g:9,cap:520},ceramic44:{g:8,cap:600},silicate:{g:19,cap:900},concrete:{g:14,cap:600},timber:{g:1.2,cap:80}};
  const HEB=[[100,89.9,450],[120,144,864],[140,216,1510],[160,311,2490],[180,426,3830],[200,570,5700],[220,736,8090],[240,938,11260],[260,1150,14920],[280,1380,19270],[300,1680,25170],[340,2160,36660],[400,2880,57680]];
  const FCD=14300,FYD=235000,ES=210e6;
  const PRICE={column:3500,beamM:1400,post:3500,lintelM:600,lintelBigM:1300,corner:4500,cantM2:900,trimmer:1800,knee:220,purlinPost:2500,partitionM:0};
  const fmt=(v,d=1)=>(Math.round(v*10**d)/10**d).toLocaleString('pl-PL',{minimumFractionDigits:d,maximumFractionDigits:d});
  const verdict=s=>s>=8?'ok':s>=6?'mid':'bad';

  function evaluate(project){
    const ST=project.structure||{},slabK=SLABS[ST.slab]?ST.slab:'std',SL=SLABS[slabK];
    const envWall=()=>{const w=project.envelope?.wall;return WALL_MAT[w]?w:'aac'};
    const set={partUp:PART[ST.partUp]?ST.partUp:'masonry12',partLo:ST.partLo==='light'?'light':'masonry',roof:ROOF_G[ST.roof]?ST.roof:'ceramic',snow:SNOW[ST.snow]?+ST.snow:2,soil:SOIL[ST.soil]?ST.soil:'avg',wallKind:ST.wallKind&&typeof ST.wallKind==='object'?ST.wallKind:{}};
    const beams=(Array.isArray(ST.beams)?ST.beams:[]).filter(b=>b&&(b.o==='h'||b.o==='v')&&Number.isFinite(+b.line)&&+b.to>=+b.from),columns=(Array.isArray(ST.columns)?ST.columns:[]).filter(p=>p&&Number.isFinite(+p.x)&&Number.isFinite(+p.y));
    const q=HouserQuantities.compute(project),{W,H,c,lo,up,G}=q,N=W*H;
    const def={};for(const f of [lo,up])def[f]=Object.fromEntries((project.definitionSnapshot?.floors?.[f]?.rooms||[]).map(r=>[r.id,r]));
    const flat=f=>{const st=project.state?.[f]||[];return Array.isArray(st[0])?st.flat():st};
    const st={[lo]:flat(lo),[up]:flat(up)};
    const id=(f,x,y)=>x<0||y<0||x>=W||y>=H?null:(st[f]?.[y*W+x]||null);
    const isHoleV=v=>v==='pustka'||v==='schody';
    const occ=(f,x,y)=>{const v=id(f,x,y);return !!v&&def[f]?.[v]?.kind!=='exteriorVoid'};
    const hole=(x,y)=>isHoleV(id(up,x,y));
    const room=(f,x,y)=>occ(f,x,y)&&!(f===up&&hole(x,y))?id(f,x,y):null;
    const nm=(f,v)=>def[f]?.[v]?.name||v;
    const O=f=>project.openings?.[f]||{};
    const hasUp=q.net[up]>0;
    // ściana na krawędzi: zewnętrzna (dom / na zewnątrz) albo między różnymi pomieszczeniami bez otwartego przejścia
    const wallAt=(f,ax,ay,bx,by,key)=>{const A=occ(f,ax,ay),B=occ(f,bx,by);if(A!==B)return f===up&&((A&&hole(ax,ay))||(B&&hole(bx,by)))?null:'ext';if(!A)return null;
      if(f===up&&(hole(ax,ay)||hole(bx,by)))return null;const va=id(f,ax,ay),vb=id(f,bx,by);if(va===vb)return null;const ot=O(f)[key];return ot==='opening'?null:ot==='glass'?'glass':'int'}; // 'glass' – ścianka szklana: lekka, nienośna
    const vWall=(f,x,y)=>wallAt(f,x-1,y,x,y,'v:'+x+':'+y),hWall=(f,x,y)=>wallAt(f,x,y-1,x,y,'h:'+x+':'+y);
    // krawędzie siatki zajęte przez podciągi (h:x:linia / v:linia:y) – podpierają strop jak ściana
    const beamKey=new Map();beams.forEach((b,i)=>{for(let a=+b.from;a<=+b.to;a++)beamKey.set(b.o==='h'?'h:'+a+':'+b.line:'v:'+b.line+':'+a,i)});
    const colAt=new Set(columns.map(p=>(+p.x)+','+(+p.y)));
    // ściana parteru nośna: zewnętrzna zawsze; wewnętrzna – murowana (domyślnie) albo oznaczona jako nośna; lekka nie podpiera stropu
    const lightLo=key=>{const k=set.wallKind[key];return k?k==='light':set.partLo==='light'};
    const bearV=(x,y)=>{const t=vWall(lo,x,y);return t==='ext'||(t==='int'&&!lightLo('v:'+x+':'+y))},bearH=(x,y)=>{const t=hWall(lo,x,y);return t==='ext'||(t==='int'&&!lightLo('h:'+x+':'+y))};
    const supV=(x,y)=>bearV(x,y)||beamKey.has('v:'+x+':'+y),supH=(x,y)=>bearH(x,y)||beamKey.has('h:'+x+':'+y);
    // ---------- obciążenia stropu i dopuszczalna rozpiętość (zależy od ciężaru ścianek działowych na stropie)
    const hUp=q.attic?((G.kneeWall||1)+(G.upperHeight||2.6))/2:(G.upperHeight||2.6),partLine=PART[set.partUp].wall*hUp;
    const issues=[],good=[],cost=[];const add=(p,text,tip,kind)=>issues.push({p,text,tip:tip||'',kind:kind||''});const addC=(name,v,note)=>{if(v>0)cost.push({name,v,note:note||''})};

    // ścianki działowe piętra jako obciążenie równomierne (PN-EN 1991-1-1 6.3.1.2: do 3 kN/m – zastępcze 0,5–1,2 kN/m²; cięższe – ok. 1/2,5 ciężaru na m ściany)
    const gPart=partLine<=1?.5:partLine<=2?.8:partLine<=3?1.2:Math.round(partLine/2.5*10)/10,gSlab=SLAB_G[slabK];
    const gk=gSlab+FINISH_G+gPart,qk=gk+LIVE,qd=1.35*gk+1.5*LIVE,qdRef=1.35*(gSlab+FINISH_G+1.2)+1.5*LIVE;
    const slabLim=Math.round(SL.lim*Math.sqrt(qdRef/qd)*10)/10;
    const loads={gSlab,gFinish:FINISH_G,gPart,partLine,hUp,live:LIVE,gk,qk,qd,slabLim,limRef:SL.lim};
    // ---------- 1. strop nad parterem: rozpiętość w każdej kratce
    const span=new Array(N).fill(null);let maxSpan=0;const over=new Set();
    if(hasUp){for(let y=0;y<H;y++)for(let x=0;x<W;x++){if(!occ(lo,x,y)||!room(up,x,y))continue;
      let l=x;while(!supV(l,y))l--;let r=x+1;while(!supV(r,y))r++;let t=y;while(!supH(x,t))t--;let b=y+1;while(!supH(x,b))b++;
      const sx=(r-l)*c,sy=(b-t)*c,s=Math.min(sx,sy);span[y*W+x]={s,sx,sy,tx:(x+.5-l)/(r-l),ty:(y+.5-t)/(b-t)};if(s>maxSpan)maxSpan=s;if(s>slabLim)over.add(y*W+x)}}
    // pomieszczenia parteru z za dużą rozpiętością – podciąg (belka w stropie) w poprzek dłuższego kierunku
    // pomieszczenia połączone otwartym przejściem (bez ściany) to jedna przestrzeń – jeden podciąg
    const par={},find=v=>par[v]==null||par[v]===v?(par[v]=v):(par[v]=find(par[v]));
    for(const [k,t] of Object.entries(O(lo))){if(t!=='opening')continue;const [o,aS,bS]=k.split(':'),a=+aS,b=+bS,va=o==='h'?id(lo,a,b-1):id(lo,a-1,b),vb=id(lo,a,b);if(va&&vb&&va!==vb)par[find(va)]=find(vb)}
    const regions=[];{const by={};for(const i of over){const v=id(lo,i%W,i/W|0),g=find(v),sp=span[i];const R=by[g]||(by[g]={names:new Set(),cells:[],max:0});R.names.add(nm(lo,v));R.cells.push(i);if(sp.s>R.max){R.max=sp.s;R.at=sp}}
      for(const R of Object.values(by))R.room=[...R.names].join(', ');
      for(const R of Object.values(by)){R.beam=Math.max(R.at.sx,R.at.sy);R.posts=R.beam>7?1:0;regions.push(R)}regions.sort((a,b)=>b.max-a.max)}
    let spanPen=0;for(const R of regions){const p=Math.min(1.8,.5+(R.max-slabLim)*.4);spanPen+=p;
      add(Math.min(p,Math.max(0,3-(spanPen-p))),'Strop nad „'+R.room+'” ma rozpiętość ok. '+fmt(R.max)+' m – więcej niż '+fmt(slabLim)+' m dla stropu „'+SL.name.toLowerCase()+'”.','Wstaw podciąg (i słup) na rzucie albo wybierz mocniejszy strop – przycisk „Zaproponuj rozwiązanie” podpowie warianty.','span');
      // nierozwiązany strop nie ma kosztu (nie zgadujemy podciągu) – to brak do rozwiązania, dom jest nieskończony (shared/completeness.js)
      R.est=R.beam*PRICE.beamM+R.posts*PRICE.column}
    if(hasUp&&!regions.length&&maxSpan>0)good.push('Strop nad parterem: największa rozpiętość ok. '+fmt(maxSpan)+' m – „'+SL.name.toLowerCase()+'” wystarczy.');
    if(hasUp&&SL.addM2)addC('Strop: '+SL.name.toLowerCase(),q.slab*SL.addM2,fmt(q.slab,0)+' m² – dopłata do zwykłego stropu'+(SL.note?', '+SL.note:''));
    // podciągi i słupy wstawione na rzucie: oparcie na końcach, odległość między podporami
    const vtxWall=(x,y,o)=>o==='h'?(bearV(x,y-1)||bearV(x,y)):(bearH(x-1,y)||bearH(x,y));
    const beamInfo=beams.map((b,i)=>{const t=b.hidden?BEAM.hidden:BEAM.visible,a0=+b.from,a1=+b.to+1,L=(a1-a0)*c;const sup=[];
      for(let a=a0;a<=a1;a++){const [vx,vy]=b.o==='h'?[a,+b.line]:[+b.line,a];const lineWall=a===a0?(b.o==='h'?bearH(a-1,+b.line):bearV(+b.line,a-1)):a===a1?(b.o==='h'?bearH(a,+b.line):bearV(+b.line,a)):null;
        if(colAt.has(vx+','+vy)||vtxWall(vx,vy,b.o)||lineWall)sup.push(a)}
      let maxSeg=0;for(let k=1;k<sup.length;k++)maxSeg=Math.max(maxSeg,(sup[k]-sup[k-1])*c);const ends=sup.includes(a0)&&sup.includes(a1);
      return {i,b,L,hidden:!!b.hidden,sup,maxSeg,ends,ok:ends&&maxSeg<=t.lim,lim:t.lim}});
    // obciążenie podciągu: strop z obu stron (połowa rozpiętości) + ściany piętra stojące na nim + ciężar własny
    const upWallLine=key=>{const [o,aS,bS]=key.split(':'),a=+aS,b=+bS,t=o==='h'?wallAt(up,a,b-1,a,b,key):wallAt(up,a-1,b,a,b,key);return t==='ext'?WALL_MAT[envWall()]?.g*.3*hUp+.5*hUp:t==='int'?partLine:0};
    for(const B of beamInfo){const b=B.b;let tw=0,n=0,wUp=0;for(let a=+b.from;a<=+b.to;a++){const i1=b.o==='h'?(+b.line-1)*W+a:a*W+(+b.line-1),i2=b.o==='h'?(+b.line)*W+a:a*W+(+b.line);
        const sp=[span[i1],span[i2]].filter(Boolean),w=sp.reduce((s_,x)=>s_+(b.o==='h'?x.sy:x.sx)/2,0);tw+=w;n++;wUp=Math.max(wUp,upWallLine(b.o==='h'?'h:'+a+':'+b.line:'v:'+b.line+':'+a))}
      B.trib=n?tw/n:0;B.wUp=wUp;const self=b.hidden?.6*SLAB_H[slabK]*25:.25*.45*25;B.wd=qd*B.trib+1.35*(wUp+self);B.wk=B.wd/1.4;
      const Ls=B.maxSeg||B.L;B.M=B.wd*Ls*Ls/8;B.V=B.wd*Ls/2;
      const dV=Math.sqrt(B.M/(.17*.25*FCD));B.hVis=Math.max(.3,Math.ceil(Math.max(Ls/12,dV+.05)*20)/20);
      const dH=SLAB_H[slabK]-.04;B.bHid=Math.max(.4,Math.ceil(B.M/(.17*dH*dH*FCD)*20)/20);
      const Wr=B.M/FYD*1e6*1.1,Ir=5*B.wk*Ls**3*250/(384*ES)*1e8;B.heb=(HEB.find(([h,w,i])=>w>=Wr&&i>=Ir)||HEB[HEB.length-1])[0];
      B.section=b.hidden?'ukryty '+Math.round(B.bHid*100)+' × '+Math.round(SLAB_H[slabK]*100)+' cm':'żelbet 25 × '+Math.round(B.hVis*100)+' cm';
      // reakcje na podporach (słupy, ściany)
      B.reactions=[];for(let k=1;k<B.sup.length;k++){const seg=(B.sup[k]-B.sup[k-1])*c;B.reactions.push([B.sup[k-1],B.wd*seg/2],[B.sup[k],B.wd*seg/2])}
      if(b.hidden&&B.bHid>1.2)add(.6,'Podciąg ukryty w stropie ('+fmt(B.L)+' m) musiałby mieć ok. '+fmt(B.bHid*100,0)+' cm szerokości – za dużo.','Zrób podciąg widoczny (wyższy) albo postaw słup w środku.','beam')}
    for(const B of beamInfo){const nm_='Podciąg '+fmt(B.L)+' m'+(B.hidden?' (ukryty w stropie)':'');
      if(!B.ends)add(1.5,nm_+' nie ma oparcia na '+(B.sup.length?'jednym końcu':'końcach')+'.','Dociągnij podciąg do ściany albo postaw słup na końcu.','beam');
      else if(B.maxSeg>B.lim)add(Math.min(1.5,.6+(B.maxSeg-B.lim)*.4),nm_+' ma '+fmt(B.maxSeg)+' m między podporami – za dużo dla '+(B.hidden?'belki ukrytej w stropie (do ok. 6 m)':'belki (do ok. 7,5 m)')+'.','Postaw słup pośrodku albo zrób podciąg widoczny (wyższy).','beam');
      addC(nm_,B.L*(B.hidden?BEAM.hidden.m:BEAM.visible.m),B.hidden?'sufit płaski, belka szeroka i zbrojona mocniej':'widoczny ok. 30 cm pod sufitem')}
    if(beamInfo.length&&beamInfo.every(B=>B.ok))good.push('Podciągi wstawione na rzucie mają oparcie i właściwe rozpiętości.');
    for(const p of columns){const x=+p.x,y=+p.y;if(![[x-1,y-1],[x,y-1],[x-1,y],[x,y]].some(([a,b])=>occ(lo,a,b)))add(.5,'Słup stoi poza domem.','Przesuń słup do wnętrza parteru.','beam')}
    const soil=SOIL[set.soil].kPa;
    const colInfo=columns.map((p,i)=>{let Nd=0;for(const B of beamInfo){const b=B.b,on=b.o==='h'?+p.y===+b.line:+p.x===+b.line,a=b.o==='h'?+p.x:+p.y;if(!on)continue;for(const [va,r] of B.reactions)if(va===a)Nd+=r}
      Nd+=1.35*.0625*25*(G.groundHeight||2.8);const side=Nd<=700?25:Nd<=1000?30:35,Nk=Nd/1.4,B_=Math.max(.6,Math.ceil(Math.sqrt((Nk+10)/soil)*10)/10);return {i,p,Nd,section:side+' × '+side+' cm',foot:B_}});
    if(columns.length)addC('Słupy żelbetowe ('+columns.length+')',columns.length*PRICE.column,'z fundamentem pod słupem');

    // ---------- 2. ściany piętra bez ściany pod spodem
    let extUns=0,intUns=0;const unsupported=[];
    // ścianka szklana na piętrze ('glass') jest lekka – stoi na stropie bez wzmocnień
    if(hasUp){const chk=(key,ax,ay,bx,by)=>{const u=wallAt(up,ax,ay,bx,by,key);if(!u||u==='glass')return;if(!occ(lo,ax,ay)&&!occ(lo,bx,by))return; // nad niczym – wspornik, liczony niżej
        const lw=wallAt(lo,ax,ay,bx,by,key),l=(lw==='ext'||(lw==='int'&&!lightLo(key)))||beamKey.has(key);if(l)return;
        // ściana zewnętrzna piętra stojąca nad wnętrzem parteru (piętro cofnięte – np. balkon nad parterem)
        unsupported.push({key,kind:u});if(u==='ext')extUns+=c;else intUns+=c};
      for(let y=0;y<=H;y++)for(let x=0;x<W;x++)chk('h:'+x+':'+y,x,y-1,x,y);for(let x=0;x<=W;x++)for(let y=0;y<H;y++)chk('v:'+x+':'+y,x-1,y,x,y)}
    // ---------- wytężenie stropu: moment zginający w danym miejscu ÷ nośność wybranego stropu (mapa na rzucie)
    // pasmo stropu niesie się w krótszym kierunku: moment od obciążenia równomiernego qd·s²/8, w przęśle rozkład 4t(1−t) (zero przy ścianie, max w środku);
    // ściana piętra stojąca na stropie dokłada siłę liniową P (kN/m) w swoim miejscu: 1,35·P·s·t(1−t); nośność = qd·slabLim²/8 (z definicji zasięgu stropu)
    const util=[];let maxUtil=0;if(hasUp){const cap=qd*slabLim*slabLim/8,wl={};
      for(const u of unsupported){const [o,aS,bS]=u.key.split(':'),a=+aS,b=+bS,P=upWallLine(u.key);for(const [cx,cy] of o==='h'?[[a,b-1],[a,b]]:[[a-1,b],[a,b]])if(cx>=0&&cy>=0&&cx<W&&cy<H)wl[cy*W+cx]=Math.max(wl[cy*W+cx]||0,P)}
      for(let i=0;i<W*H;i++){const sp=span[i];if(!sp)continue;const t=sp.sx<=sp.sy?sp.tx:sp.ty,shape=4*t*(1-t),M=qd*sp.s*sp.s/8*shape+(wl[i]?1.35*wl[i]*sp.s*t*(1-t):0);
        util[i]={u:M/cap,M,wall:wl[i]||0};if(util[i].u>maxUtil)maxUtil=util[i].u}}
    if(extUns>=c){add(Math.min(2.5,.6+extUns*.15),'Ściana zewnętrzna piętra stoi na stropie, bez ściany pod spodem – ok. '+fmt(extUns)+' m (piętro cofnięte nad parterem).','Pod ciężką ścianą zewnętrzną potrzebny podciąg albo ściana nośna na parterze dokładnie pod nią.','wall');
      addC('Podciągi pod ścianami zewnętrznymi piętra',extUns*PRICE.beamM,'ok. '+fmt(extUns)+' m')}
    if(intUns>=4*c){const heavy=partLine>3;
      if(heavy&&intUns>4)add(Math.min(1.5,.4+(intUns-4)*.05),'Ściany działowe piętra ('+PART[set.partUp].name+', ok. '+fmt(partLine)+' kN/m) stoją na stropie bez ściany pod spodem: ok. '+fmt(intUns)+' m.','Pod murowanymi ściankami strop potrzebuje żeber albo zbrojenia – albo zrób te ścianki lekkie (g-k), albo ustaw je nad ścianami parteru.','wall');
      else if(!heavy)good.push('Ścianki działowe piętra są lekkie ('+fmt(partLine)+' kN/m) – mogą stać na stropie w dowolnym miejscu ('+fmt(intUns)+' m bez ściany pod spodem).');
      else good.push('Większość ścian piętra stoi nad ścianami parteru; ok. '+fmt(intUns)+' m ścianek na stropie.');
      if(heavy)addC('Wzmocnienie stropu pod murowanymi ściankami',intUns*300,'ok. '+fmt(intUns)+' m żeber / dodatkowego zbrojenia')}
    else if(hasUp)good.push('Ściany piętra stoją nad ścianami parteru – prosty układ obciążeń.');

    // ---------- 3. piętro wysunięte poza parter (wspornik)
    // głębokość: odległość kratki od najbliższej kratki parteru (w czterech kierunkach)
    let cantA=0,cantD=0;if(hasUp)for(let y=0;y<H;y++)for(let x=0;x<W;x++){if(!(occ(up,x,y)&&!occ(lo,x,y)))continue;cantA+=c*c;let d=99;
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){let n=1;while(n<20&&!occ(lo,x+dx*n,y+dy*n)&&x+dx*n>=0&&y+dy*n>=0&&x+dx*n<W&&y+dy*n<H)n++;if(occ(lo,x+dx*n,y+dy*n))d=Math.min(d,n)}
      if(d<99)cantD=Math.max(cantD,d*c)}
    if(cantA>0){const deep=cantD>LIM.cant;add(deep?Math.min(2,.8+(cantD-LIM.cant)*.8):.3,'Piętro wysunięte poza parter: ok. '+fmt(cantA)+' m², do '+fmt(cantD)+' m.',deep?'Wysunięcie ponad ok. 1,2 m wymaga belek wspornikowych albo słupów pod narożnikami.':'Wspornik w płycie stropu – trzeba go uwzględnić w projekcie stropu.','cant');
      addC('Wspornik piętra (nadwieszenie)',cantA*PRICE.cantM2*(deep?1.6:1),fmt(cantA)+' m²')}

    // ---------- 4. otwory w stropie: schody, antresola
    const holes=[];if(hasUp){const seen=new Set();for(let i=0;i<N;i++){const x=i%W,y=i/W|0;if(seen.has(i)||!hole(x,y)||!occ(lo,x,y))continue;const R={n:0},stk=[i];
      while(stk.length){const k=stk.pop();if(seen.has(k))continue;const kx=k%W,ky=k/W|0;if(!hole(kx,ky)||!occ(lo,kx,ky))continue;seen.add(k);R.n++;if(kx>0)stk.push(k-1);if(kx<W-1)stk.push(k+1);if(ky>0)stk.push(k-W);if(ky<H-1)stk.push(k+W)}
      R.area=R.n*c*c;holes.push(R)}}
    for(const h of holes){addC('Belki wymianowe przy otworze w stropie ('+fmt(h.area)+' m²)',PRICE.trimmer*(h.area>12?2:1),h.area>12?'duży otwór – antresola / pustka':'schody')}
    const bigHole=holes.filter(h=>h.area>12);if(bigHole.length)add(.4,'Duży otwór w stropie (antresola, pustka nad salonem): '+bigHole.map(h=>fmt(h.area)+' m²').join(', ')+' – krawędzie trzeba oprzeć na belkach.','Krawędź antresoli najlepiej nad ścianą parteru albo na podciągu.','hole');

    // ---------- 5. szerokie otwory w ścianach zewnętrznych, przeszklenia narożne
    // nadproże przekrywa cały otwór w ścianie: sąsiadujące otwory w tej samej ścianie (HST obok przeszklenia stałego, okno przy drzwiach,
    // brama garażowa podzielona na skrzydła) to jeden otwór – łączymy je bez względu na rodzaj i ustawienie
    const wide=[];{const segs={};for(const r of q.runs||[]){if(!r.ext||!['window','hst','door'].includes(r.base)||r.info?.shape==='roof')continue;
        for(const k of r.keys){const [o,aS,bS]=k.split(':'),a=+aS,b=+bS,line=o==='h'?b:a,at=o==='h'?a:b;(segs[r.f+'|'+o+'|'+line]=segs[r.f+'|'+o+'|'+line]||[]).push({at,k,r})}}
      for(const L of Object.values(segs)){L.sort((x,y)=>x.at-y.at);let cur=null;const flush=()=>{if(!cur)return;const w=cur.keys.length*c;if(w>=LIM.lintel){const r=cur.runs[0],bases=[...new Set(cur.runs.map(x=>x.base))];
            wide.push({r,w,f:r.f,keys:cur.keys,bases,big:w>=LIM.lintelBig,upAbove:r.f===lo&&hasUp,room:(r.rooms||[])[0]?.name||''})}cur=null};
        for(const it of L){if(cur&&it.at===cur.to+1){cur.keys.push(it.k);cur.to=it.at;if(!cur.runs.includes(it.r))cur.runs.push(it.r)}else{flush();cur={keys:[it.k],to:it.at,runs:[it.r]}}}flush()}}
    const groups={};for(const o of wide){const k=[o.bases.join('+'),o.w,o.room,o.upAbove].join('|');(groups[k]=groups[k]||{...o,n:0}).n++}
    for(const o of Object.values(groups)){const B=o.bases,t=B.length>1?'Otwór ('+B.map(b=>b==='hst'?'HST':b==='door'?'drzwi':'okno').join(' + ')+')':B[0]==='hst'?'Przeszklenie HST':B[0]==='door'?(o.w>=2.5&&/gara/i.test(o.room)?'Brama garażowa':'Drzwi'):'Okno';
      add((o.big?(o.upAbove?1:.7):(o.upAbove?.4:.2))*Math.min(2,o.n),t+' '+fmt(o.w)+' m'+(o.n>1?' ('+o.n+' szt.)':'')+(o.room?' w pomieszczeniu „'+o.room+'”':'')+(o.upAbove?' pod piętrem':'')+' – '+(o.big?'potrzebna belka żelbetowa lub stalowa nad otworem':'wzmocnione nadproże')+'.',o.big?'Belka nad otworem (żelbet lub stal) i wieniec – uwzględnij w projekcie; albo podziel otwór słupkiem.':'','open');
      addC(t+' '+fmt(o.w)+' m'+(o.n>1?' × '+o.n:'')+' – '+(o.big?'belka nad otworem':'wzmocnione nadproże'),o.n*o.w*(o.big?PRICE.lintelBigM:PRICE.lintelM)*(o.upAbove?1.2:1))}
    // narożnik: przeszklenie na dwóch ścianach w tym samym wierzchołku
    const corners=[];for(const f of [lo,up]){const V={};const ops=O(f);
      for(const [k,t] of Object.entries(ops)){if(t!=='window'&&t!=='hst')continue;const [o,aS,bS]=k.split(':'),a=+aS,b=+bS;const ax=o==='h'?a:a-1,ay=o==='h'?b-1:b;if(occ(f,ax,ay)===occ(f,a,b))continue;
        const info=global.HouserOpenings?.resolve(project,f,k,t);if(info?.shape==='roof')continue;const ends=o==='h'?[[a,b],[a+1,b]]:[[a,b],[a,b+1]];for(const [vx,vy] of ends){const vk=vx+','+vy;(V[vk]=V[vk]||new Set()).add(o)}}
      for(const [vk,s] of Object.entries(V))if(s.size===2){const [vx,vy]=vk.split(',').map(Number);const n=[[vx-1,vy-1],[vx,vy-1],[vx-1,vy],[vx,vy]].filter(([x,y])=>occ(f,x,y)).length;if(n===1||n===3)corners.push({f,x:vx,y:vy})}}
    if(corners.length){add(Math.min(1.5,.6*corners.length),'Przeszklenie narożne ('+corners.length+') – w narożniku nie ma muru, dach lub strop opiera się na słupie albo belce wspornikowej.','Słup stalowy w narożniku (najprościej) albo belka wspornikowa – do projektu konstrukcji.','corner');
      addC('Przeszklenia narożne – słup / belka ('+corners.length+')',corners.length*PRICE.corner)}

    // ---------- 6. dach i balkony
    const halfSpan=q.span/2,rafter=(halfSpan+(G.eaveOverhang||0))/Math.cos((G.roofPitch||35)*Math.PI/180),attic=q.attic;
    let roofType;if(q.roofA<=0)roofType='–';
    else if(rafter<=LIM.rafter)roofType='krokwiowa (krokwie bez podparcia)';else if(rafter<=LIM.rafterMax)roofType='krokwiowo-jętkowa (jętki podpierają krokwie)';else roofType='płatwiowo-kleszczowa (płatwie na słupach) albo wiązary';
    // szczegóły więźby (płatwie, słupy, na czym stoją) – moduł Konstrukcja dachu; tutaj tylko zgrubnie, gdy go nie ma
    if(global.HouserRoof&&q.roofA>0)good.push('Więźba dachu: '+roofType.split(' (')[0]+' – szczegóły (słupy, płatwie, pustka) w module Konstrukcja dachu.');
    else if(q.roofA>0&&rafter>LIM.rafterMax){if(attic){add(1,'Krokwie ok. '+fmt(rafter)+' m – dach potrzebuje płatwi podpartych słupami, które staną na poddaszu.','Słupy wypadną w pokojach poddasza – zaplanuj je przy ściankach albo węższy dom / większy kąt dachu.','roof');addC('Słupy i płatwie w więźbie (poddasze)',2*PRICE.purlinPost)}
      else good.push('Szeroki dom bez poddasza użytkowego – dach na wiązarach (prefabrykowane, szybki montaż).')}
    else if(q.roofA>0)good.push('Dach: krokwie ok. '+fmt(rafter)+' m – więźba '+roofType.split(' (')[0]+', bez słupów na poddaszu.');
    const knee=attic?(G.kneeWall||0):0;if(knee>LIM.knee){const L=2*(q.roofL||0);add(.3,'Ścianka kolankowa '+fmt(knee,2)+' m – przy wysokiej ściance potrzebny wieniec i słupki żelbetowe (rozpór dachu).','','roof');addC('Wieniec i słupki ścianki kolankowej',L*PRICE.knee,'ok. '+fmt(L)+' m')}
    let deepBal=null;try{if(global.HouserBalcony){const S=HouserBalcony.stats(project);deepBal=S.items.filter(i=>i.kind==='cantilever'&&i.depth>LIM.balcony)}}catch(_){}
    if(deepBal&&deepBal.length)add(.5*deepBal.length,'Balkon wysunięty '+deepBal.map(i=>fmt(i.depth)+' m').join(', ')+' – płyta wspornikowa powyżej ok. 1,5 m jest ciężka i droga.','Słupy pod narożnikami balkonu albo płytsze wysunięcie (do 1,5 m).','balc');

    // ---------- 7. ściany i fundamenty: obciążenie na metr ściany parteru i szerokość ławy
    const wm=WALL_MAT[envWall()]||WALL_MAT.aac,wd_=(global.HouserEnvelope?.WALLS?.[envWall()]?.d)||.24,wallG=wm.g*wd_+.6; // + tynk i ocieplenie
    const pitch=(G.roofPitch||35),al=pitch*Math.PI/180,mu=pitch<=30?.8:pitch>=60?0:.8*(60-pitch)/30,snowL=mu*SNOW[set.snow];
    const roofG=(ROOF_G[set.roof].g+.3+(q.attic?.35:0))/Math.cos(al),roofQ=roofG+snowL,roofHalf=q.span/2+(G.eaveOverhang||0);
    // średnia rozpiętość stropu przy ścianach zewnętrznych
    let es=0,en=0;if(hasUp)for(let y=0;y<H;y++)for(let x=0;x<W;x++){const sp=span[y*W+x];if(!sp)continue;if(vWall(lo,x,y)==='ext'||vWall(lo,x+1,y)==='ext'){es+=sp.sx;en++}if(hWall(lo,x,y)==='ext'||hWall(lo,x,y+1)==='ext'){es+=sp.sy;en++}}
    const slabEdge=hasUp&&en?es/en/2:0,hLo=q.hWall?.[lo]||G.groundHeight||2.8,hUpWall=hasUp?(q.attic?(G.kneeWall||1):(G.upperHeight||2.6)):0,ceilUp=hasUp?.6*q.span/4:.8*q.span/4;
    const eaveNk=roofQ*roofHalf+wallG*(hLo+hUpWall+.3)+qk*slabEdge+ceilUp,gableNk=wallG*(hLo+hUpWall+.3+(q.G.rise||0)/2)+qk*slabEdge+ceilUp;
    let intNk=0;if(hasUp)for(let y=0;y<H;y++)for(let x=0;x<W;x++){for(const [o,kx,ky] of [['v',x,y],['h',x,y]]){const t=o==='v'?vWall(lo,kx,ky):hWall(lo,kx,ky);if(t!=='int')continue;const key=o+':'+kx+':'+ky;if(lightLo(key))continue;
      const a=o==='v'?span[ky*W+kx-1]:span[(ky-1)*W+kx],b2=span[ky*W+kx];const tr=((a?(o==='v'?a.sx:a.sy):0)+(b2?(o==='v'?b2.sx:b2.sy):0))/2;const upW=upWallLine(key);intNk=Math.max(intNk,qk*tr+upW+3.3*hLo)}}
    const ft=nk=>Math.max(.5,Math.ceil((nk+12)/soil*20)/20);
    const wallsRows=[{name:'Ściana zewnętrzna pod okapem (niesie dach)',nk:eaveNk},{name:'Ściana szczytowa',nk:gableNk}];if(intNk>0)wallsRows.push({name:'Najbardziej obciążona ściana nośna wewnątrz',nk:intNk});
    for(const w of wallsRows){w.nd=w.nk*1.4;w.foot=ft(w.nk);w.cap=w.name.startsWith('Najb')?450:wm.cap;w.use=w.nd/w.cap}
    for(const w of wallsRows){if(w.use>.8)add(Math.min(1.5,.5+(w.use-.8)*3),w.name+': ok. '+fmt(w.nd,0)+' kN/m – blisko nośności muru ('+fmt(w.cap,0)+' kN/m).','Mocniejszy materiał ścian parteru (silikat, ceramika) albo dodatkowa ściana nośna.','wall');
      if(w.foot>.8)add(.4,w.name+': ława fundamentowa ok. '+fmt(w.foot*100,0)+' cm szerokości – grunt „'+SOIL[set.soil].name+'”.','Przy słabym gruncie rozważ płytę fundamentową albo badania geotechniczne.','found')}
    if(wallsRows.every(w=>w.foot<=.6))good.push('Ławy fundamentowe ok. '+fmt(Math.max(...wallsRows.map(w=>w.foot))*100,0)+' cm – typowe dla tego gruntu.');
    // ciężar domu (charakterystyczny) – orientacyjnie
    const extL=(q.extLen?.[lo]||0),extU=(q.extLen?.[up]||0),bearInt=(q.partLen?.[lo]||0)*(set.partLo==='light'?.3:.6);
    const weight=wallG*(extL*hLo+extU*hUpWall+(q.gable||0))+3.3*hLo*bearInt+(hasUp?qk*q.slab+partLine*(q.partLen?.[up]||0):0)+roofQ*q.foot+12*(extL+bearInt);
    const pen=issues.reduce((a,i)=>a+i.p,0),score=Math.max(0,Math.min(10,Math.round((10-pen)*10)/10));
    const total=cost.reduce((a,x)=>a+x.v,0);
    return {set,loads,colInfo,wallsRows,roofQ,snowL,roofG,weight,soil,bearV,bearH,lightLo,slab:slabK,SL,slabLim,beams,columns,beamInfo,beamKey,supV,supH,q,W,H,c,lo,up,hasUp,span,maxSpan,regions,unsupported,util,maxUtil,extUns,intUns,cantA,cantD,holes,wide,corners,rafter,roofType,knee,
      issues:issues.sort((a,b)=>b.p-a.p),good,cost:{items:cost,total},score,verdict:verdict(score),LIM,occ,room:room,vWall,hWall}}
  // propozycje: mocniejszy strop albo podciąg (z słupem, gdy belka wychodzi za długa) – kilka wariantów z kosztem
  function propose(project){
    const K=evaluate(project);if(!K.hasUp||!K.regions.length)return {base:K,variants:[]};
    const ST=project.structure||{},base={...ST},withS=patch=>({...project,structure:{...base,...patch}}),variants=[];
    const tryV=(name,desc,patch)=>{try{const R=evaluate(withS(patch));variants.push({name,desc,patch,score:R.score,maxSpan:R.maxSpan,cost:R.cost.total,left:R.regions.length,addCost:R.cost.total-K.cost.total})}catch(e){console.error(e)}};
    for(const k of ['thick','hollow'])if(SLABS[k].lim>K.loads.limRef&&K.maxSpan<=SLABS[k].lim*K.slabLim/K.loads.limRef)tryV(SLABS[k].name,'bez podciągów i słupów – strop przenosi '+fmt(K.maxSpan)+' m'+(SLABS[k].note?' ('+SLABS[k].note+')':''),{slab:k});
    // podciągi: dla każdego obszaru – linia siatki w poprzek, od ściany do ściany; wybór najlepszej (rozpiętość, koszt, ściana piętra nad belką)
    const {W,H,c,lo}=K,occL=(x,y)=>K.occ(lo,x,y);
    const beamAlong=(o,line,start)=>{const wallE=a=>o==='h'?K.bearH(a,line):K.bearV(line,a),cellsOK=a=>o==='h'?occL(a,line-1)&&occL(a,line):occL(line-1,a)&&occL(line,a),
      vSup=a=>o==='h'?(K.bearV(a,line-1)||K.bearV(a,line)):(K.bearH(line-1,a)||K.bearH(line,a));
      if(!cellsOK(start)||wallE(start))return null;let a0=start,a1=start;while(!vSup(a0)&&cellsOK(a0-1)&&!wallE(a0-1))a0--;while(!vSup(a1+1)&&cellsOK(a1+1)&&!wallE(a1+1))a1++;return {o,line,from:a0,to:a1}};
    const plan=(hidden)=>{let beams=[...(base.beams||[])],cols=[...(base.columns||[])],guard=0;
      while(guard++<3){const R=evaluate(withS({beams,columns:cols}));if(!R.regions.length)break;const reg=R.regions[0];let best=null;
        const xs=reg.cells.map(i=>i%W),ys=reg.cells.map(i=>i/W|0),bx=[Math.min(...xs),Math.max(...xs)+1],by=[Math.min(...ys),Math.max(...ys)+1];
        for(const o of ['h','v']){const [l0,l1]=o==='h'?by:bx,mid=o==='h'?Math.round((bx[0]+bx[1])/2):Math.round((by[0]+by[1])/2);
          for(let line=l0+1;line<l1;line++){const b=beamAlong(o,line,mid);if(!b)continue;b.hidden=hidden;const L=(b.to-b.from+1)*c,lim=hidden?BEAM.hidden.lim:BEAM.visible.lim,nc=Math.max(0,Math.ceil(L/lim)-1),cs=[];
            for(let k=1;k<=nc;k++){const a=Math.round(b.from+(b.to+1-b.from)*k/(nc+1));cs.push(o==='h'?{x:a,y:line}:{x:line,y:a})}
            const T=evaluate(withS({beams:[...beams,b],columns:[...cols,...cs]})),under=K.unsupported.filter(u=>beamKeyOf(b).has(u.key)).length;
            const sc=(T.regions.find(r=>r.cells.some(i=>reg.cells.includes(i)))?.max||0)*1000+T.cost.total-under*400;if(!best||sc<best.sc)best={sc,b,cs}}}
        if(!best)break;beams.push(best.b);cols.push(...best.cs)}
      return {beams,columns:cols}};
    const vis=plan(false),hid=plan(true);
    tryV('Podciąg widoczny'+(vis.columns.length>(base.columns||[]).length?' + słup':''),'belka ok. 30 cm pod sufitem, najtańsza; '+(vis.beams.length-(base.beams||[]).length)+' podciąg(i)',vis);
    tryV('Podciąg ukryty w stropie'+(hid.columns.length>(base.columns||[]).length?' + słup':''),'sufit płaski, droższa belka; '+(hid.beams.length-(base.beams||[]).length)+' podciąg(i)',hid);
    variants.sort((a,b)=>(a.left-b.left)||(a.cost-b.cost));
    return {base:K,variants}}
  const beamKeyOf=b=>{const s=new Set();for(let a=+b.from;a<=+b.to;a++)s.add(b.o==='h'?'h:'+a+':'+b.line:'v:'+b.line+':'+a);return s};
  global.HouserStructure={LIM,PRICE,SLABS,BEAM,PART,ROOF_G,SNOW,SOIL,evaluate,propose};
})(window);
