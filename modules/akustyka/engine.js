// Akustyka i spokój – proste reguły na rzucie.
// HouserAcoustics.evaluate(project, settings) -> {rooms, quiet, sources, conflicts, overall, verdict}
// Pokoje „ciche” (sypialnie, pokoje, gabinet) oceniamy od 10 w dół: kary za wspólne ściany z głośnymi pomieszczeniami,
// drzwi prosto do strefy dziennej, głośne pomieszczenie nad / pod pokojem, antresolę otwartą na salon i okna od ulicy.
// Wymaga shared/quantities.js (i jego zależności).
(function(global){
  // klasy pomieszczeń: q – ciche (chronione), s – źródło hałasu (siła 0–3), b – bufor (szafa, garderoba, spiżarnia)
  const CLASSES=[
    {k:'garage',re:/garaż|garaz/i,name:'garaż',src:3,why:'brama, silnik, prace warsztatowe'},
    {k:'laundry',re:/pralni/i,name:'pralnia',src:2.5,why:'wirowanie pralki, suszarka'},
    {k:'utility',re:/techn|kotłown|kotlown|kotł|kotl/i,name:'pomieszczenie techniczne',src:2.5,why:'kocioł / pompa ciepła, rekuperator, hydrofor'},
    {k:'living',re:/salon|dzienn/i,name:'salon',src:2,why:'telewizor, muzyka, rozmowy, goście'},
    {k:'kitchen',re:/kuchni|aneks/i,name:'kuchnia',src:2,why:'okap, zmywarka, gotowanie'},
    {k:'bath',re:/łazien|lazien/i,name:'łazienka',src:1.2,why:'woda w rurach, prysznic, wentylator'},
    {k:'wc',re:/\bwc\b|toalet/i,name:'WC',src:1.3,why:'spłuczka, pion kanalizacyjny'},
    {k:'stairs',re:/schod/i,name:'schody',src:1.5,why:'kroki, dudnienie stopni'},
    {k:'dining',re:/jadal/i,name:'jadalnia',src:1.2,why:'rozmowy, krzesła'},
    {k:'entrance',re:/wiatrołap|wiatrolap|wejści|wejsci/i,name:'wiatrołap',src:1.2,why:'drzwi wejściowe, domofon'},
    {k:'hall',re:/hol|korytarz|komunikac|antresol/i,name:'hol',src:.35,why:'przechodzenie, kroki'},
    {k:'buffer',re:/garderob|szaf|spiżar|spizar|schowek|składzik|skladzik/i,name:'garderoba / schowek',buffer:true},
    {k:'study',re:/gabinet|biur|pracown/i,name:'gabinet',quiet:.8},
    {k:'bedroom',re:/sypial|pokój|pokoj|dziec|gości|gosci/i,name:'sypialnia',quiet:1},
  ];
  const DEF={street:'none',walls:'standard',nightVoid:true};
  function classify(name){for(const c of CLASSES)if(c.re.test(name||''))return c;return {k:'other',name:'inne',src:.5}}
  const ORD=['north','east','south','west'],SIDE_PL={north:'północ',east:'wschód',south:'południe',west:'zachód'};

  function evaluate(project,settings){
    const set={...DEF,...(settings||{})};
    const q=HouserQuantities.compute(project),W=q.W,H=q.H,c=q.c,lo=q.lo,up=q.up,fl=[lo,up];
    const defs={};for(const f of fl)defs[f]=Object.fromEntries((project.definitionSnapshot?.floors?.[f]?.rooms||[]).map(r=>[r.id,r]));
    const flat=f=>{const st=project.state?.[f]||[];return Array.isArray(st[0])?st.flat():st};
    const st={};for(const f of fl)st[f]=flat(f);
    const id=(f,x,y)=>x<0||y<0||x>=W||y>=H?null:(st[f][y*W+x]||null);
    const isVoid=(f,v)=>!v||defs[f][v]?.kind==='exteriorVoid';
    const isHole=(f,v)=>f===up&&(v==='pustka'||v==='schody');
    // pomieszczenia
    const rooms={};
    for(const r of q.rooms){const cls=classify(r.name);rooms[r.f+'|'+r.id]={key:r.f+'|'+r.id,f:r.f,id:r.id,name:r.name,area:r.area,cells:r.cells,color:defs[r.f][r.id]?.color||'#cbd5e1',cls,
      quiet:cls.quiet||0,src:cls.src||0,buffer:!!cls.buffer,walls:{},opens:{},doors:{},above:{},below:{},winSides:{},voidEdge:0,issues:[],score:null}}
    const R=(f,v)=>rooms[f+'|'+v];
    // krawędzie między kratkami: wspólne ściany, otwarte przejścia, drzwi
    const ops=f=>project.openings?.[f]||{};
    const sm=(()=>{const top=project.orientation?.top,i=Math.max(0,ORD.indexOf(top));return {top:ORD[i],right:ORD[(i+1)%4],bottom:ORD[(i+2)%4],left:ORD[(i+3)%4]}})();
    for(const f of fl){const O=ops(f);
      const edge=(ax,ay,bx,by,key,sideA,sideB)=>{const va=id(f,ax,ay),vb=id(f,bx,by),A=!isVoid(f,va)&&va,B=!isVoid(f,vb)&&vb,o=O[key];
        if(A&&B&&va!==vb){const ra=R(f,va),rb=R(f,vb);
          if(isHole(f,va)||isHole(f,vb)){const r=isHole(f,va)?rb:ra;if(r&&va==='pustka'||vb==='pustka')r&&(r.voidEdge+=c);return}
          if(!ra||!rb)return;
          const tgt=o==='opening'?'opens':'walls';ra[tgt][rb.key]=(ra[tgt][rb.key]||0)+c;rb[tgt][ra.key]=(rb[tgt][ra.key]||0)+c;
          if(o==='door'||o==='hst'){ra.doors[rb.key]=1;rb.doors[ra.key]=1}}
        else if(A!==B&&(o==='window'||o==='hst')){const r=A?R(f,va):R(f,vb);if(r){const side=A?sideB:sideA;r.winSides[sm[side]]=(r.winSides[sm[side]]||0)+c}}};
      for(let y=0;y<=H;y++)for(let x=0;x<W;x++)edge(x,y-1,x,y,'h:'+x+':'+y,'top','bottom');
      for(let x=0;x<=W;x++)for(let y=0;y<H;y++)edge(x-1,y,x,y,'v:'+x+':'+y,'left','right')}
    // piętro nad parterem: co jest nad / pod pokojem
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){const g=id(lo,x,y),u=id(up,x,y);if(isVoid(lo,g)||isVoid(up,u)||isHole(up,u))continue;const rg=R(lo,g),ru=R(up,u);if(!rg||!ru)continue;
      rg.above[ru.key]=(rg.above[ru.key]||0)+c*c;ru.below[rg.key]=(ru.below[rg.key]||0)+c*c}
    // antresola / pustka nad salonem – dźwięk z parteru idzie prosto na piętro
    let voidOverLiving=false;for(let y=0;y<H;y++)for(let x=0;x<W;x++){if(id(up,x,y)==='pustka'){const g=R(lo,id(lo,x,y));if(g&&(g.src>=1.5))voidOverLiving=true}}
    const soft=set.walls==='acoustic'?.55:1; // ściany akustyczne (Rw ≥ 50 dB) tłumią lepiej

    const conflicts=[];
    for(const r of Object.values(rooms)){if(!r.quiet)continue;let pen=0;const add=(p,type,text,tip,other,len)=>{p=Math.round(p*100)/100;if(p<=0)return;pen+=p;const it={p,type,text,tip,other,len};r.issues.push(it);if(other)conflicts.push({a:r.key,b:other,p,type,len})};
      for(const [k,len] of Object.entries(r.walls)){const o=rooms[k];if(!o||o.buffer)continue;
        if(o.src){const p=o.src*Math.min(1,len/3)*soft;add(p,'wall','Wspólna ściana z pomieszczeniem „'+o.name+'” ('+fmtM(len)+') – '+o.cls.why+'.',
          o.cls.k==='bath'||o.cls.k==='wc'?'Pion kanalizacyjny prowadź z dala od tej ściany (w bruździe z izolacją), ściana z bloczków silikatowych lub podwójna płyta g-k z wełną.':o.cls.k==='garage'?'Ściana z garażem powinna być masywna (Rw ≥ 55 dB), najlepiej oddzielona garderobą lub korytarzem.':'Ściana akustyczna (np. silikat 18 cm albo podwójna płyta g-k z wełną) albo szafa wnękowa na całej ścianie jako bufor.',k,len)}
        else if(o.quiet&&len>=1)add(.3*soft,'wall','Ściana z pokojem „'+o.name+'” – rozmowy i muzyka zza ściany.','Między sypialniami ściana pełna (bez gniazdek na wprost siebie) albo szafy wnękowe.',k,len)}
      for(const [k,len] of Object.entries(r.opens)){const o=rooms[k];if(!o||!o.src)continue;add(o.src*1.6,'open','Otwarte przejście do pomieszczenia „'+o.name+'” – nic nie tłumi hałasu.','Zamiast otwartego przejścia daj drzwi (najlepiej z uszczelką).',k,len)}
      for(const k of Object.keys(r.doors)){const o=rooms[k];if(!o||o.src<1.5||o.cls.k==='bath'||o.cls.k==='wc')continue;add(1.2,'door','Drzwi otwierają się prosto do pomieszczenia „'+o.name+'” (bez holu).','Wejście do sypialni z holu lub korytarza, a nie wprost z salonu czy kuchni.',k)}
      for(const [k,a] of Object.entries(r.above)){const o=rooms[k];if(!o||!o.src)continue;const wet=o.cls.k==='bath'||o.cls.k==='wc'||o.cls.k==='laundry';
        add((wet?1.2:o.src*.5)*Math.min(1,a/4),'above','Nad pokojem jest „'+o.name+'” ('+fmtA(a)+') – '+(wet?'woda i odpływy w stropie.':'kroki i dudnienie przez strop.'),wet?'Łazienkę na piętrze układaj nad łazienką lub kuchnią na parterze, piony w obudowie z izolacją.':'Strop z pływającą wylewką na wełnie (izolacja od kroków).',k)}
      for(const [k,a] of Object.entries(r.below)){const o=rooms[k];if(!o||!o.src)continue;add(o.src*.6*Math.min(1,a/4),'below','Pod pokojem jest „'+o.name+'” ('+fmtA(a)+') – '+o.cls.why+'.',o.cls.k==='garage'?'Nad garażem strop z dobrą izolacją akustyczną i cieplną, albo przenieś sypialnię.':'Strop z pływającą wylewką; w salonie pod sypialnią – głośniki z dala od sufitu.',k)}
      if(r.f===up&&set.nightVoid&&(r.voidEdge>0||Object.keys(r.opens).some(k=>rooms[k]?.cls.k==='hall'))&&voidOverLiving)add(1.5,'void','Pokój przy antresoli / pustce nad salonem – dźwięki z parteru idą prosto na piętro.','Drzwi do pokoju z uszczelką, a przy pustce szklana balustrada do sufitu albo zasłona akustyczna.');
      if(set.street!=='none'&&r.winSides[set.street]){add(1.5*r.quiet,'street','Okno od ulicy ('+SIDE_PL[set.street]+').','Okna akustyczne (Rw ≥ 38 dB), nawiewniki akustyczne albo przenieś sypialnię na stronę ogrodu.')}
      r.score=Math.max(0,Math.min(10,10-pen));r.pen=pen;r.issues.sort((a,b)=>b.p-a.p)}
    const quiet=Object.values(rooms).filter(r=>r.quiet).sort((a,b)=>a.score-b.score);
    const sources=Object.values(rooms).filter(r=>r.src>=1.2).map(r=>({...r,near:quiet.filter(qr=>qr.walls[r.key]||qr.opens[r.key]||qr.above[r.key]||qr.below[r.key]).map(qr=>qr.name)})).sort((a,b)=>b.src-a.src);
    const wsum=quiet.reduce((a,r)=>a+r.area*r.quiet,0);
    const overall=quiet.length?Math.round(quiet.reduce((a,r)=>a+r.score*r.area*r.quiet,0)/wsum*10)/10:null;
    return {q,set,rooms,quiet,sources,conflicts,overall,verdict:overall==null?null:overall>=8?'ok':overall>=6?'mid':'bad',voidOverLiving,W,H,c,lo,up,st,defs};
  }
  const fmtM=v=>(Math.round(v*10)/10).toLocaleString('pl-PL')+' m',fmtA=v=>(Math.round(v*10)/10).toLocaleString('pl-PL')+' m²';
  global.HouserAcoustics={CLASSES,DEF,classify,evaluate};
})(window);
