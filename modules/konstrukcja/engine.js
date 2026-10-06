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
  const PRICE={beamM:1400,post:3500,lintelM:600,lintelBigM:1300,corner:4500,cantM2:900,trimmer:1800,knee:220,purlinPost:2500,partitionM:0};
  const fmt=(v,d=1)=>(Math.round(v*10**d)/10**d).toLocaleString('pl-PL',{minimumFractionDigits:d,maximumFractionDigits:d});
  const verdict=s=>s>=8?'ok':s>=6?'mid':'bad';

  function evaluate(project){
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
      if(f===up&&(hole(ax,ay)||hole(bx,by)))return null;const va=id(f,ax,ay),vb=id(f,bx,by);if(va===vb)return null;return O(f)[key]==='opening'?null:'int'};
    const vWall=(f,x,y)=>wallAt(f,x-1,y,x,y,'v:'+x+':'+y),hWall=(f,x,y)=>wallAt(f,x,y-1,x,y,'h:'+x+':'+y);
    const issues=[],good=[],cost=[];const add=(p,text,tip,kind)=>issues.push({p,text,tip:tip||'',kind:kind||''});const addC=(name,v,note)=>{if(v>0)cost.push({name,v,note:note||''})};

    // ---------- 1. strop nad parterem: rozpiętość w każdej kratce
    const span=new Array(N).fill(null);let maxSpan=0;const over=new Set();
    if(hasUp){for(let y=0;y<H;y++)for(let x=0;x<W;x++){if(!occ(lo,x,y)||!room(up,x,y))continue;
      let l=x;while(!vWall(lo,l,y))l--;let r=x+1;while(!vWall(lo,r,y))r++;let t=y;while(!hWall(lo,x,t))t--;let b=y+1;while(!hWall(lo,x,b))b++;
      const sx=(r-l)*c,sy=(b-t)*c,s=Math.min(sx,sy);span[y*W+x]={s,sx,sy};if(s>maxSpan)maxSpan=s;if(s>LIM.slab)over.add(y*W+x)}}
    // pomieszczenia parteru z za dużą rozpiętością – podciąg (belka w stropie) w poprzek dłuższego kierunku
    // pomieszczenia połączone otwartym przejściem (bez ściany) to jedna przestrzeń – jeden podciąg
    const par={},find=v=>par[v]==null||par[v]===v?(par[v]=v):(par[v]=find(par[v]));
    for(const [k,t] of Object.entries(O(lo))){if(t!=='opening')continue;const [o,aS,bS]=k.split(':'),a=+aS,b=+bS,va=o==='h'?id(lo,a,b-1):id(lo,a-1,b),vb=id(lo,a,b);if(va&&vb&&va!==vb)par[find(va)]=find(vb)}
    const regions=[];{const by={};for(const i of over){const v=id(lo,i%W,i/W|0),g=find(v),sp=span[i];const R=by[g]||(by[g]={names:new Set(),cells:[],max:0});R.names.add(nm(lo,v));R.cells.push(i);if(sp.s>R.max){R.max=sp.s;R.at=sp}}
      for(const R of Object.values(by))R.room=[...R.names].join(', ');
      for(const R of Object.values(by)){R.beam=Math.max(R.at.sx,R.at.sy);R.posts=R.beam>7?1:0;regions.push(R)}regions.sort((a,b)=>b.max-a.max)}
    let spanPen=0;for(const R of regions){const big=R.max>LIM.slabMax,p=Math.min(1.8,.5+(R.max-LIM.slab)*.4);spanPen+=p;
      add(Math.min(p,Math.max(0,3-(spanPen-p))),'Strop nad „'+R.room+'” ma rozpiętość ok. '+fmt(R.max)+' m – '+(big?'za dużo nawet dla grubszej płyty':'więcej niż typowe 6 m')+'.',big?'Potrzebny podciąg (belka w stropie) i słup albo ściana nośna w środku pomieszczenia.':'Podciąg w stropie albo ściana nośna dzieląca pomieszczenie; ewentualnie grubsza płyta (droższa).','span');
      addC('Podciąg w stropie – '+R.room,R.beam*PRICE.beamM+R.posts*PRICE.post,'ok. '+fmt(R.beam)+' m belki'+(R.posts?' + słup':''))}
    if(hasUp&&!regions.length&&maxSpan>0)good.push('Strop nad parterem: największa rozpiętość ok. '+fmt(maxSpan)+' m – zwykła płyta wystarczy, bez podciągów.');

    // ---------- 2. ściany piętra bez ściany pod spodem
    let extUns=0,intUns=0;const unsupported=[];
    if(hasUp){const chk=(key,ax,ay,bx,by)=>{const u=wallAt(up,ax,ay,bx,by,key);if(!u)return;if(!occ(lo,ax,ay)&&!occ(lo,bx,by))return; // nad niczym – wspornik, liczony niżej
        const l=wallAt(lo,ax,ay,bx,by,key);if(l)return;
        // ściana zewnętrzna piętra stojąca nad wnętrzem parteru (piętro cofnięte – np. balkon nad parterem)
        unsupported.push({key,kind:u});if(u==='ext')extUns+=c;else intUns+=c};
      for(let y=0;y<=H;y++)for(let x=0;x<W;x++)chk('h:'+x+':'+y,x,y-1,x,y);for(let x=0;x<=W;x++)for(let y=0;y<H;y++)chk('v:'+x+':'+y,x-1,y,x,y)}
    if(extUns>=c){add(Math.min(2.5,.6+extUns*.15),'Ściana zewnętrzna piętra stoi na stropie, bez ściany pod spodem – ok. '+fmt(extUns)+' m (piętro cofnięte nad parterem).','Pod ciężką ścianą zewnętrzną potrzebny podciąg albo ściana nośna na parterze dokładnie pod nią.','wall');
      addC('Podciągi pod ścianami zewnętrznymi piętra',extUns*PRICE.beamM,'ok. '+fmt(extUns)+' m')}
    if(intUns>=4*c){if(intUns>8)add(Math.min(1,.2+(intUns-8)*.05),'Ściany działowe na piętrze bez ściany pod spodem: ok. '+fmt(intUns)+' m – muszą być lekkie (płyty g-k albo cienkie bloczki), a strop policzony na ich ciężar.','Ustaw ściany pokoi na piętrze nad ścianami parteru tam, gdzie się da.','wall');
      else good.push('Większość ścian piętra stoi nad ścianami parteru; ok. '+fmt(intUns)+' m lekkich ścianek na stropie.')}
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
    const wide=[];for(const r of q.runs||[]){if(!r.ext||!['window','hst','door'].includes(r.base)||r.info?.shape==='roof')continue;const w=r.keys.length*c;if(w<LIM.lintel)continue;
      const keyF=r.keys[0];const upAbove=r.f===lo&&hasUp;wide.push({r,w,f:r.f,keys:r.keys,big:w>=LIM.lintelBig,upAbove,room:(r.rooms||[])[0]?.name||''});}
    const groups={};for(const o of wide){const k=[o.r.base,o.w,o.room,o.upAbove].join('|');(groups[k]=groups[k]||{...o,n:0}).n++}
    for(const o of Object.values(groups)){const t=o.r.base==='hst'?'Przeszklenie HST':o.r.base==='door'?'Drzwi':'Okno';
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
    if(q.roofA>0&&rafter>LIM.rafterMax){if(attic){add(1,'Krokwie ok. '+fmt(rafter)+' m – dach potrzebuje płatwi podpartych słupami, które staną na poddaszu.','Słupy wypadną w pokojach poddasza – zaplanuj je przy ściankach albo węższy dom / większy kąt dachu.','roof');addC('Słupy i płatwie w więźbie (poddasze)',2*PRICE.purlinPost)}
      else good.push('Szeroki dom bez poddasza użytkowego – dach na wiązarach (prefabrykowane, szybki montaż).')}
    else if(q.roofA>0)good.push('Dach: krokwie ok. '+fmt(rafter)+' m – więźba '+roofType.split(' (')[0]+', bez słupów na poddaszu.');
    const knee=attic?(G.kneeWall||0):0;if(knee>LIM.knee){const L=2*(q.roofL||0);add(.3,'Ścianka kolankowa '+fmt(knee,2)+' m – przy wysokiej ściance potrzebny wieniec i słupki żelbetowe (rozpór dachu).','','roof');addC('Wieniec i słupki ścianki kolankowej',L*PRICE.knee,'ok. '+fmt(L)+' m')}
    let deepBal=null;try{if(global.HouserBalcony){const S=HouserBalcony.stats(project);deepBal=S.items.filter(i=>i.kind==='cantilever'&&i.depth>LIM.balcony)}}catch(_){}
    if(deepBal&&deepBal.length)add(.5*deepBal.length,'Balkon wysunięty '+deepBal.map(i=>fmt(i.depth)+' m').join(', ')+' – płyta wspornikowa powyżej ok. 1,5 m jest ciężka i droga.','Słupy pod narożnikami balkonu albo płytsze wysunięcie (do 1,5 m).','balc');

    const pen=issues.reduce((a,i)=>a+i.p,0),score=Math.max(0,Math.min(10,Math.round((10-pen)*10)/10));
    const total=cost.reduce((a,x)=>a+x.v,0);
    return {q,W,H,c,lo,up,hasUp,span,maxSpan,regions,unsupported,extUns,intUns,cantA,cantD,holes,wide,corners,rafter,roofType,knee,
      issues:issues.sort((a,b)=>b.p-a.p),good,cost:{items:cost,total},score,verdict:verdict(score),LIM,occ,room:room,vWall,hWall}}
  global.HouserStructure={LIM,PRICE,evaluate};
})(window);
