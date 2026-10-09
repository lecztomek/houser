// Testy obliczeń Housera: node tests/run.js   (po świadomej zmianie wyników: node tests/run.js --update)
// 1) każdy dom z examples/ – wszystkie liczby muszą być liczbami (bez NaN) i w rozsądnych granicach,
// 2) zależności, które muszą zachodzić (np. rekuperacja < wywiewna w stratach ciepła),
// 3) zapisane wyniki (tests/expected.json) – zmiana o więcej niż tolerancja = błąd do sprawdzenia.
const fs=require('fs'),path=require('path');const {load,ROOT}=require('./load.js');
const W=load(),UPDATE=process.argv.includes('--update');
let fails=0,passes=0;const ok=(cond,msg)=>{if(cond)passes++;else{fails++;console.log('  ✗ '+msg)}};
const fin=v=>typeof v==='number'&&Number.isFinite(v);
const clone=o=>JSON.parse(JSON.stringify(o));
const examples=fs.readdirSync(path.join(ROOT,'examples')).filter(f=>f.endsWith('.json')&&f!=='index.json'&&!f.startsWith('definicja'));
const snap={};

// ---------- 1) każdy dom: liczby i granice
for(const f of examples){const p=JSON.parse(fs.readFileSync(path.join(ROOT,'examples',f),'utf8'));console.log('• '+f);
  const q=W.HouserQuantities.compute(p);ok(q.usableTotal>20&&q.usableTotal<600,f+': powierzchnia użytkowa '+q.usableTotal);
  ok(Math.abs(q.rooms.reduce((a,r)=>a+r.usable,0)-q.usableTotal)<.5,f+': suma pokoi = powierzchnia użytkowa');
  ok(q.runs.filter(r=>r.ext&&(r.base==='window'||r.base==='hst')).every(r=>r.price&&fin(r.price.win)),f+': każde okno zewnętrzne ma cenę');
  const E=W.HouserEnergy.compute(p);ok(fin(E.Qh)&&E.Qh>0,f+': Qh '+E.Qh);ok(E.EU>10&&E.EU<300,f+': EU '+E.EU);ok(E.load>1&&E.load<30,f+': moc '+E.load);
  ok(E.rows.every(r=>fin(r.H)),f+': straty przegród');ok(fin(E.Qsol)&&E.Qsol>=0,f+': zyski od słońca '+E.Qsol);ok(fin(E.Qw)&&E.Qw>0,f+': ciepła woda');
  const C=W.HouserCost.compute(p);ok(fin(C.total)&&C.total>0,f+': koszt '+C.total);ok(C.rows.every(r=>fin(r.value)&&r.value>=0),f+': pozycje wyceny '+C.rows.filter(r=>!fin(r.value)).map(r=>r.id));
  ok(C.total/q.usableTotal>2500&&C.total/q.usableTotal<15000,f+': zł/m² '+Math.round(C.total/q.usableTotal));
  const HS=W.HouserHeatSys.evaluate(p);ok(fin(HS.year)&&HS.year>0,f+': rachunki '+HS.year);ok(fin(HS.invest),f+': inwestycja w ogrzewanie');
  {const Hc=W.HouserHeating.compare(p,{});ok(Hc.list.every(m=>fin(m.invest)&&fin(m.year)&&fin(m.fit)),f+': porównanie źródeł ciepła');
   const fa=W.HouserHeatSys.evaluate({...p,heatingSystem:{main:'fireplace_air',extra:'hp_air'}});ok(fin(fa.year)&&fa.year>0&&fa.loops===0&&fa.sys.extra==='none'&&fa.dhwSrc==='el',f+': kominek powietrzny bez instalacji wodnej');
   const hs=W.HouserHeatSys.evaluate({...p,heatingSystem:{main:'hp_air',extra:'stove'}});ok(fin(hs.year)&&hs.sys.extra==='stove'&&hs.share>0&&hs.cost.some(x=>/Koza/.test(x.name)),f+': pompa ciepła + koza');
   ok(fa.elShare>=.1&&fa.elShare<1&&fa.cost.some(x=>/DGP/.test(x.name)),f+': kominek powietrzny – DGP i udział prądu '+fa.elShare)}
  {const V=W.HouserPV.compute(p);ok(fin(V.kWp)&&fin(V.prod)&&fin(V.savings)&&fin(V.priceFactor)&&V.priceFactor>0&&V.priceFactor<=1&&V.cons.total>1500&&V.cons.total<20000,f+': fotowoltaika '+[V.kWp,V.prod,V.cons.total].map(Math.round));
   ok(V.monthly.length===12&&V.monthly.every(m=>fin(m.prod)&&fin(m.self)&&m.self<=m.prod+1e-6&&m.self<=m.cons+1e-6),f+': fotowoltaika – miesiące');
   if(V.kWp>0){const b=W.HouserPV.compute(p,{battery:10});ok(b.self>=V.self,f+': magazyn zwiększa autokonsumpcję')}
   const on={...p,pvSettings:{enabled:true}},h0=W.HouserHeatSys.evaluate({...p,heatingSystem:{main:'hp_air'}}),h1=W.HouserHeatSys.evaluate({...on,heatingSystem:{main:'hp_air'}});
   ok(V.kWp===0||h1.fuel<h0.fuel,f+': z fotowoltaiką pompa ciepła tańsza '+[Math.round(h0.fuel),Math.round(h1.fuel)])}
  {const K=W.HouserStructure.evaluate(p);ok(fin(K.score)&&K.score>=0&&K.score<=10&&fin(K.cost.total)&&K.cost.total>=0&&fin(K.rafter),f+': konstrukcja '+[K.score,Math.round(K.cost.total)]);
   ok(!K.hasUp||K.regions.every(r=>r.max>W.HouserStructure.LIM.slab)&&(K.regions.length?K.maxSpan>W.HouserStructure.LIM.slab:true),f+': konstrukcja – podciąg tylko przy rozpiętości > 6 m');
   ok(K.cost.total===0||W.HouserCost.compute(p).rows.some(r=>r.id==='structExtra'&&r.value>0),f+': wzmocnienia konstrukcji w Wycenie')}
  {const L=W.HouserElectric.evaluate(p);ok(L.points>10&&L.lights>3&&L.circuits>5&&fin(L.cost.total)&&L.cost.total>5000&&fin(L.peak)&&L.peak>3&&L.peak<60,f+': elektryka '+[L.points,L.lights,L.circuits,Math.round(L.cost.total),L.peak]);
   const L2=W.HouserElectric.evaluate(p,{ev:true});ok(L2.peak>=L.peak&&L2.cost.total>L.cost.total,f+': ładowarka auta podnosi moc i koszt');
   ok(W.HouserCost.compute(p).rows.some(r=>r.id==='elec'&&Math.abs(r.value-L.cost.total)<L.cost.total*.6),f+': elektryka w Wycenie')}
  const M=W.HouserHVAC.methods(p,p.hvacSettings);{const g=k=>M.list.find(m=>m.k===k);ok(M.list.length===5&&g('mvhr').yearly<=g('decentral').yearly&&g('decentral').yearly<g('exhaust').yearly&&g('exhaust').yearly<=g('grav').yearly&&g('hybrid').yearly===g('grav').yearly,f+': wentylacja – kolejność strat ciepła');
   ok(['decentral','hybrid'].every(v=>fin(W.HouserEnergy.compute({...p,energySettings:{...(p.energySettings||{}),vent:v}}).Qh)),f+': Energia z nowymi rodzajami wentylacji');
   ok(W.HouserHVAC.methods({...p,energySettings:{...(p.energySettings||{}),vent:'decentral'}},p.hvacSettings).chosen?.k==='decentral',f+': wybór rekuperatorów ściennych')}
for(const m of M.list){ok(fin(m.invest)&&fin(m.total)&&fin(m.score)&&fin(m.fan),f+': wentylacja '+m.k+' '+JSON.stringify([m.invest,m.fan,m.total,m.score]))}
  const S=W.HouserSolar.compute(p);ok(fin(S.house.season)&&S.house.season>=0,f+': słońce w sezonie');
  const L=W.HouserLooks.evaluate(p);ok(L.score==null||(fin(L.score)&&L.score>=0&&L.score<=10),f+': wygląd '+L.score);
  const A=W.HouserAdvice.collect(p);ok(fin(A.overall)&&A.overall>0&&A.overall<=10,f+': ocena ogólna '+A.overall);
  for(const m of A.mods)ok(m.score==null||(fin(m.score)&&m.score>=0&&m.score<=10),f+': ocena modułu '+m.name+' '+m.score);
  const B=W.HouserSavings.measure(W.HouserSavings.prep(p));for(const ch of W.HouserSavings.CHANGES){const v=W.HouserSavings.variant(p,ch);if(!v)continue;const R=W.HouserSavings.measure(v);ok(fin(R.cost)&&fin(R.score),f+': oszczędność '+ch.id)}
  snap[f]={overall:+A.overall.toFixed(2),cost:Math.round(C.total),Qh:Math.round(E.Qh),bills:Math.round(HS.year),area:+q.usableTotal.toFixed(2),mods:Object.fromEntries(A.mods.map(m=>[m.name,m.score==null?null:+m.score.toFixed(2)]))}}

// ---------- 2) zależności
console.log('• zależności');
const base=JSON.parse(fs.readFileSync(path.join(ROOT,'examples','uklad-domu-v7.json'),'utf8'));
{const v=k=>{const p=clone(base);p.energySettings={...(p.energySettings||{}),vent:k};return W.HouserEnergy.compute(p).Qh};ok(v('mech')<v('exhaust')&&v('exhaust')<v('grav'),'straty: rekuperacja < wywiewna < grawitacyjna');
 const M=W.HouserHVAC.methods(base,{}),i=Object.fromEntries(M.list.map(m=>[m.k,m.invest]));ok(i.grav<i.exhaust&&i.exhaust<i.mvhr,'koszt wentylacji: grawitacyjna < wywiewna < rekuperacja '+JSON.stringify(i));}
{const e=t=>{const p=clone(base);W.HouserEnvelope.apply(p,{...W.HouserEnvelope.DEF,insT:t});return W.HouserEnergy.compute(p)};const a=e(10),b=e(25);ok(b.s.U.wall<a.s.U.wall&&b.Qh<a.Qh,'grubsze ocieplenie = niższe U i zapotrzebowanie');}
{const O=W.HouserOpenings,info=t=>O.resolve({openingVariants:{ground:{k:{variant:t}}}},'ground','k','window');
 ok(O.price(null,info('sloped'),2,'window').win>O.price(null,info('standard'),2,'window').win*1.5,'okno ścięte droższe o ponad 50%');ok(O.price(null,info('standard'),.2,'window').win===O.PRICE.minWin,'najmniejsze okno kosztuje minimum');
 const m={slope:'manual',angle:30,rise:'left',sill:.5,height:2};ok(O.slopedTop(m,0,2)>O.slopedTop(m,2,2),'skos „wyżej z lewej” – lewa krawędź wyżej');ok(O.slopedTop({...m,rise:'right'},2,2)>O.slopedTop({...m,rise:'right'},0,2),'skos „wyżej z prawej” – prawa krawędź wyżej');}
{const p=clone(base),s0=W.HouserSolar.compute(p).house.season;p.outdoorStructures=[];const s1=W.HouserSolar.compute(p).house.season;ok(s1>=s0,'zadaszony taras nie zwiększa zysków od słońca');
 const b=clone(base);for(const f of Object.keys(b.openings||{}))for(const [k,t] of Object.entries(b.openings[f]))if(t==='window'||t==='hst'){b.openingVariants=b.openingVariants||{};b.openingVariants[f]=b.openingVariants[f]||{};b.openingVariants[f][k]={...(b.openingVariants[f][k]||{}),blind:'external'}}
 const so=W.HouserSolar.compute(b).house.season;ok(Math.abs(so-W.HouserSolar.compute(base).house.season)<1,'rolety nie zmieniają zysków zimą (podniesione w sezonie grzewczym)');}
{const p=clone(base),q0=W.HouserQuantities.compute(p),d=q0.runs.find(r=>r.base==='door'&&!r.ext&&r.keys.length>=2);
 if(d){p.openingVariants=p.openingVariants||{};p.openingVariants[d.f]=p.openingVariants[d.f]||{};p.openingVariants[d.f][d.keys[0]]={variant:'sliding'};p.openingVariants[d.f][d.keys[1]]={variant:'single'};
  const q1=W.HouserQuantities.compute(p);ok(q1.runs.some(r=>r.base==='door'&&r.keys.includes(d.keys[0])&&r.keys.includes(d.keys[1])),'drzwi z kratkami o różnym ustawieniu to nadal jedne drzwi')}}
{const r=W.HouserDaily.rolesOf('Łazienka/Pralnia');ok(r.has('bath')&&r.has('laundry'),'„Łazienka/Pralnia” to łazienka i pralnia '+[...r]);}
{const sj=JSON.parse(fs.readFileSync(path.join(ROOT,'examples','stodola-jasna.json'),'utf8')),D=W.HouserDaily.evaluate(sj),noc=(D.scenarios||[]).find(x=>x.id==='noc');
 ok(noc&&noc.legs.length>=3&&noc.legs.every(l=>l.r&&l.r.floors===0),'Codzienność noc: z każdej sypialni do łazienki na tej samej kondygnacji '+JSON.stringify(noc?.legs.map(l=>[l.from,l.to,l.r?.floors])));}
// Codzienność – dom dla domowników: bez łazienki na piętrze z sypialniami ocena łazienek i nocy mocno spada
{const z=JSON.parse(fs.readFileSync(path.join(ROOT,'examples','zefir-2.json'),'utf8')),z1=JSON.parse(JSON.stringify(z).replace(/"Łazienka piętro"/g,'"Schowek piętro"'));
 const D=p=>W.HouserDaily.evaluate(p),da=D(z),db=D(z1),g=(d,id)=>d.house.groups.find(x=>x.id===id),a=g(da,'lazienki'),b=g(db,'lazienki'),na=da.scenarios.find(x=>x.id==='noc'),nb=db.scenarios.find(x=>x.id==='noc');
 ok(a&&b&&fin(a.score)&&a.score>=8&&b.score<=a.score-4,'Codzienność łazienki: brak łazienki przy sypialniach = duży minus '+[a?.score,b?.score]);
 ok(nb.score<=na.score-4,'Codzienność noc: łazienka tylko na parterze = duży minus '+[na.score,nb.score]);
 ok(a.table&&a.table.length>=5&&a.table.every(t=>t.to&&fin(t.dist)),'Codzienność łazienki: najbliższa łazienka z każdego pokoju');
 ok(da.house.groups.length===5&&da.house.groups.every(x=>fin(x.score)&&x.score>=0&&x.score<=10)&&fin(da.overall),'Codzienność: dom dla domowników – 5 grup z oceną');
 const z2=JSON.parse(JSON.stringify(z));z2.energySettings={...(z2.energySettings||{}),persons:8};ok(g(D(z2),'sypialnie').score<g(da,'sypialnie').score,'Codzienność: więcej domowników niż pokoi = minus w sypialniach');}
// drzwi na dwóch kratkach, ustawienia tylko na jednej – obie kratki to te same drzwi (Zewnątrz 3D rysował dwoje po 0,5 m)
{const pr={openings:{ground:{'h:7:22':'door','h:8:22':'door'}},openingVariants:{ground:{'h:7:22':{variant:'entrance',sill:0,height:2.3}}}};const O=W.HouserOpenings,a=O.resolve(pr,'ground','h:8:22','door'),e=O.runExtent(pr,'ground','h:8:22');
 ok(a.variant==='entrance'&&e.from===7&&e.to===8,'drzwi na dwóch kratkach – wspólne ustawienia i jeden otwór');}
// konstrukcja: podciąg i słup skracają rozpiętość, płyty kanałowe przenoszą większą, belka bez oparcia = uwaga
{const z=JSON.parse(fs.readFileSync(path.join(ROOT,'examples','dom-z-poddaszem.json'),'utf8'));z.structure={...(z.structure||{}),beams:[],columns:[],slab:'std'};const S=W.HouserStructure,K0=S.evaluate(z),P=S.propose(z);
 ok(K0.regions.length>0&&P.variants.length>=2&&P.variants.some(v=>v.left===0&&v.patch.beams),'konstrukcja – propozycje rozwiązania stropu '+P.variants.map(v=>v.name));
 const vb=P.variants.find(v=>v.patch.beams),K1=S.evaluate({...z,structure:{...(z.structure||{}),...vb.patch}});
 ok(K1.maxSpan<K0.maxSpan&&K1.regions.length===0&&K1.beamInfo.every(b=>b.ok),'konstrukcja – podciąg z propozycji zbija rozpiętość '+[K0.maxSpan,K1.maxSpan]);
 const K2=S.evaluate({...z,structure:{...(z.structure||{}),slab:'hollow'}});ok(K2.loads.limRef===10&&K2.slabLim>K0.slabLim&&K2.regions.length<=K0.regions.length&&K2.cost.items.some(x=>/kanałowe/.test(x.name)),'konstrukcja – płyty kanałowe');
 const b0=vb.patch.beams[vb.patch.beams.length-1],K3=S.evaluate({...z,structure:{...(z.structure||{}),beams:[{...b0,to:b0.to-3}],columns:[]}});ok(K3.beamInfo[0]&&!K3.beamInfo[0].ends&&K3.issues.some(i=>i.kind==='beam'),'konstrukcja – podciąg bez oparcia na końcu');}
// konstrukcja – obciążenia: lekkie ścianki = dłuższa dopuszczalna rozpiętość; lekkie ściany parteru nie podpierają stropu; przekroje i fundamenty
{const z=JSON.parse(fs.readFileSync(path.join(ROOT,'examples','zefir-2.json'),'utf8')),S=W.HouserStructure,wS=st=>({...z,structure:{...(z.structure||{}),...st}});
 const a=S.evaluate(wS({partUp:'light'})),b=S.evaluate(wS({partUp:'masonry18'})),c=S.evaluate(wS({partLo:'light'})),d=S.evaluate(z);
 ok(a.slabLim>b.slabLim&&a.loads.qd<b.loads.qd,'konstrukcja – cięższe ścianki = krótsza rozpiętość '+[a.slabLim,b.slabLim]);
 ok(c.maxSpan>=d.maxSpan&&c.maxSpan>d.maxSpan-.01,'konstrukcja – lekkie ściany parteru nie podpierają stropu '+[d.maxSpan,c.maxSpan]);
 ok(d.wallsRows.length>=2&&d.wallsRows.every(w=>fin(w.nk)&&w.nk>5&&w.nk<300&&w.foot>=.5&&w.foot<2),'konstrukcja – ściany i ławy '+d.wallsRows.map(w=>Math.round(w.nk)));
 const s1=S.evaluate(wS({soil:'weak'})),s2=S.evaluate(wS({soil:'good'}));ok(Math.max(...s1.wallsRows.map(w=>w.foot))>=Math.max(...s2.wallsRows.map(w=>w.foot)),'konstrukcja – słaby grunt = szersza ława');
 const v=S.propose(z).variants.find(v=>v.patch.beams);if(v){const e=S.evaluate(wS(v.patch));ok(e.beamInfo.every(B=>fin(B.M)&&B.M>0&&B.heb>=100&&/cm/.test(B.section)),'konstrukcja – przekroje podciągów');ok(e.colInfo.every(C=>fin(C.Nd)&&C.foot>=.6),'konstrukcja – słupy i stopy')}
 ok(fin(d.weight)&&d.weight/9.81>50&&d.weight/9.81<800,'konstrukcja – ciężar domu '+Math.round(d.weight/9.81)+' t');}
// fotowoltaika: połać na południe daje więcej niż na północ
{const o=W.HouserPV.orientK;ok(o(35,0)>o(35,90)&&o(35,90)>o(35,180)&&Math.abs(o(35,0)-1)<.01,'fotowoltaika – kierunki połaci');}
// okno balkonowe (do podłogi) = drzwi balkonowe: przejście na balkon w Codzienności i w Balkonach
{const z=JSON.parse(fs.readFileSync(path.join(ROOT,'examples','zefir-2.json'),'utf8'));const up=Object.keys(z.state).find(f=>f!=='ground')||'upper';
 const pr={...z,openings:{...z.openings,[up]:{...(z.openings?.[up]||{}),'h:0:0':'window'}},openingVariants:{...(z.openingVariants||{}),[up]:{...(z.openingVariants?.[up]||{}),'h:0:0':{variant:'balcony',sill:0,height:2.2}}}};
 ok(W.HouserOpenings.walkable(pr,up,'h:0:0')&&!W.HouserOpenings.walkable({...pr,openingVariants:{}},up,'h:0:0'),'okno balkonowe liczy się jak drzwi, zwykłe okno nie');}
// Codzienność – balkon bez drzwi liczy się jako miejsce do suszenia (z podpowiedzią o drzwiach)
{const sj=JSON.parse(fs.readFileSync(path.join(ROOT,'examples','stodola-jasna.json'),'utf8'));const pr=W.HouserDaily.evaluate(sj).scenarios.find(x=>x.id==='pranie');
 ok(pr&&fin(pr.score),'Codzienność pranie liczy się');}
{const R=W.HouserAdvice.collect(base),n=R.mods.filter(m=>m.score!=null).length;ok(n>=8,'Co poprawić: ocenia co najmniej 8 modułów ('+n+')');}

{const C=W.HouserComplete,p0=JSON.parse(JSON.stringify(base));for(const k of ['energySettings','heatingSystem','pvSettings','elecSettings','costSettings','hvacSettings','envelope','elevationSettings','confirmed'])delete p0[k];
 const c0=C.check(p0);ok(c0.missing>=8&&!c0.complete,'Kompletność: dom bez ustawień ma braki ('+c0.missing+')');
 const p1={...p0,confirmed:{energia:'x',wentylacja:'x'}},c1=C.check(p1);ok(c1.missing===c0.missing-2,'Kompletność: „Zatwierdź” zalicza decyzję');
 const p2={...p0,pvSettings:{enabled:false}};ok(C.check(p2).missing===c0.missing-1,'Kompletność: wybór „bez PV” to też decyzja');
 ok(c0.items.every(i=>i.assumed&&i.name),'Kompletność: każdy brak mówi, jakie założenie jest przyjęte');}

{const S=W.HouserStructure,C=W.HouserComplete,z=JSON.parse(fs.readFileSync(path.join(ROOT,'examples','dom-z-poddaszem.json'),'utf8'));
 z.structure={...z.structure,beams:[],columns:[],slab:'std'};const K=S.evaluate(z),c=C.check(z);
 ok(K.regions.length&&!K.cost.items.some(x=>/Podciąg do zaprojektowania/.test(x.name)),'nierozwiązany strop nie ma zgadywanego kosztu');
 ok(!c.complete&&c.items.some(i=>i.strict&&!i.done),'nierozwiązany strop = dom nieskończony');
 z.confirmed=Object.fromEntries(C.DECISIONS.map(d=>[d.mod,'x']));ok(!C.check(z).complete,'„Zatwierdź” nie odhacza nierozwiązanego stropu');}

{const S=W.HouserStructure,p=JSON.parse(fs.readFileSync(path.join(ROOT,'examples','stodola-jasna.json'),'utf8')),ev=sl=>S.evaluate({...p,structure:{...(p.structure||{}),slab:sl}});
 const a=ev('std'),b=ev('hollow'),U=a.util.filter(Boolean);
 ok(U.length>0&&U.every(x=>fin(x.u)&&x.u>=0&&fin(x.M)),'wytężenie stropu: liczby skończone dla każdej kratki');
 ok(a.maxUtil>1&&a.regions.length>0,'wytężenie: strop, który nie wyrabia, ma ponad 100% ('+Math.round(a.maxUtil*100)+'%)');
 ok(b.maxUtil<a.maxUtil&&b.maxUtil<=1,'wytężenie: płyty kanałowe mniej wytężone ('+Math.round(b.maxUtil*100)+'%)');
 const mid=U.reduce((m,x)=>x.u>m.u?x:m),sp=a.span.filter(Boolean),edge=sp.some(x=>Math.min(x.tx,x.ty)<.1);ok(edge&&mid.u>U.reduce((m,x)=>Math.min(m,x.u),9),'wytężenie: największe w przęśle, mniejsze przy ścianach');}

{const S=W.HouserStructure,p=JSON.parse(fs.readFileSync(path.join(ROOT,'examples','stodola-mini-2a-g2.json'),'utf8')),K=S.evaluate(p);
 ok(K.wide.some(o=>o.w>=5&&o.bases.includes('door')),'szerokie otwory: brama garażowa podzielona na skrzydła liczy się jako jeden otwór');
 // HST 2 m + przeszklenie stałe 1 m + okno 1 m w jednej ścianie = jeden otwór 4 m (każdy z osobna < 3 m)
 const q=JSON.parse(JSON.stringify(p));for(const k of Object.keys(q.openings.ground))if(k.startsWith('v:0:'))delete q.openings.ground[k];
 for(let y=14;y<=21;y++){const k='v:0:'+y;q.openings.ground[k]=y<18?'hst':'window';q.openingVariants.ground[k]=y<18?{variant:'hst',sill:0,height:2.35}:y<20?{variant:'balcony',sill:0,height:2.2}:{variant:'standard',sill:.9,height:1.4}}
 const K2=S.evaluate(q),o=K2.wide.find(x=>x.keys.includes('v:0:14'));ok(o&&o.w===4&&o.bases.length===2,'szerokie otwory: HST + drzwi balkonowe + okno obok siebie = jeden otwór 4 m');}

{const R=W.HouserPlumbing.evaluate(JSON.parse(fs.readFileSync(path.join(ROOT,'examples','zefir-2.json'),'utf8')),{}),own=R.points.filter(p=>p.f===R.up&&!p.stackOver&&p.drain==='riser');
 ok(own.length>0&&own.every(p=>p.riserCell&&R.risers.some(r=>r.own&&r.cell===p.riserCell)),'hydraulika: mokre na piętrze nie nad mokrym – własny pion (nie długa rura w stropie)');
 ok(R.cost.offsets===0||R.points.some(p=>p.drain==='slab'),'hydraulika: przesunięcia w stropie tylko dla krótkich odcinków');
 ok(own.every(p=>p.paFloor===R.lo&&fin(p.len)),'hydraulika: woda do własnego pionu idzie po parterze');}

{const S=W.HouserStairs,b=sp=>S.geometry({type:'L',risers:16,width:.9,tread:.27,turn:'left',rot:0,x:0,y:0,split:sp},.5,2.8).bbox,mid=b(),e=b(2),l=b(12);
 ok(Math.abs(mid.x1-mid.z1)<.01&&e.x1>l.x1&&e.z1<l.z1,'schody L: skręt po wybranym stopniu zmienia długości biegów (środek = równe)');
 ok(S.geometry({type:'U',risers:16,width:.9,tread:.27,turn:'left',rot:0,x:0,y:0,split:4},.5,2.8).steps.length===15&&S.splitOf({split:99},15)===13&&S.splitOf({split:0},15)===1,'schody: spocznik zawsze z min. 1 stopniem w każdym biegu');}

// ścianka szklana (salon | pokój w Stodole Jasnej): osobno w ilościach i wycenie, nienośna w konstrukcji, słabo tłumi w akustyce, nieprzechodnia
{const sj=JSON.parse(fs.readFileSync(path.join(ROOT,'examples','stodola-jasna.json'),'utf8')),g=JSON.parse(JSON.stringify(sj));for(let x=0;x<=6;x++)g.openings.ground['h:'+x+':13']='glass';
 const q0=W.HouserQuantities.compute(sj),q1=W.HouserQuantities.compute(g);
 ok(Math.abs(q1.glassLen.ground-3.5)<1e-6&&q1.partLen.ground<q0.partLen.ground-3.4&&q1.glassA>8,'ścianka szklana: liczona osobno od ścian działowych ('+q1.glassA.toFixed(1)+' m²)');
 const c0=W.HouserCost.compute(sj),c1=W.HouserCost.compute(g),r=c1.rows.find(x=>x.id==='glasswalls');
 ok(r&&r.value>0&&!c0.rows.some(x=>x.id==='glasswalls')&&c1.total>c0.total,'ścianka szklana: pozycja w wycenie tylko gdy jest');
 const K=W.HouserStructure.evaluate(g);ok(K.hWall('ground',3,13)==='glass'&&!K.supH(3,13),'ścianka szklana: nienośna (nie podpiera stropu)');
 const A0=W.HouserAcoustics.evaluate(sj),A1=W.HouserAcoustics.evaluate(g),pk=A=>(A.quiet.find(x=>/pok/i.test(x.name))||{}).score;
 ok(pk(A1)!=null&&pk(A1)<=pk(A0),'ścianka szklana: gorsza akustyka niż ściana ('+pk(A0)+' → '+pk(A1)+')');
 ok(!W.HouserOpenings.walkable(g,'ground','h:3:13'),'ścianka szklana: nie da się przez nią przejść');}

{const O=W.HouserOpenings,pr={openings:{upper:{'h:4:0':'window','h:5:0':'window','h:6:0':'window'}},openingVariants:{upper:{'h:4:0':{variant:'standard',sill:.5,slope:'manual',angle:35,rise:'left'},'h:5:0':{variant:'standard',sill:.5,slope:'manual',angle:35,rise:'left'},'h:6:0':{variant:'standard',sill:.5}}}};
 const e=O.runExtent(pr,'upper','h:6:0');ok(e.from===4&&e.to===6,'okna: resztki ustawień skosu w zwykłym oknie nie dzielą okna');
 pr.openingVariants.upper['h:6:0']={variant:'sloped',sill:.3,height:2.4};pr.openingVariants.upper['h:4:0'].variant=pr.openingVariants.upper['h:5:0'].variant='sloped';
 ok(O.runExtent(pr,'upper','h:6:0').from===6,'okna: ścięte z innym skosem to osobne okna');}

// konstrukcja dachu: układ więźby, słupy i pustka na piętrze
{const RF=W.HouserRoof,ld=f=>JSON.parse(fs.readFileSync(path.join(ROOT,'examples',f),'utf8'));
 for(const f of examples){const p=ld(f),R=RF.evaluate(p);if(!R.ok)continue;ok(fin(R.score)&&R.score>=0&&R.score<=10&&fin(R.cost.total)&&R.members.every(m=>fin(m.len)&&m.n>=0),f+': konstrukcja dachu – liczby skończone ('+R.system+')')}
 const par=RF.evaluate(ld('dom-parterowy.json'));ok(par.system==='truss','konstrukcja dachu: dom bez poddasza – wiązary');
 const sj=ld('stodola-jasna.json'),R0=RF.evaluate(sj);ok(R0.geom.hasVoid&&R0.voidWalls.some(w=>w.kind==='gable'&&w.h>7)&&R0.issues.some(i=>i.type==='voidwall'),'konstrukcja dachu: szczyt przy pustce bez stropu – uwaga');
 const pu=JSON.parse(JSON.stringify(sj));pu.roofSettings={system:'purlin'};const R1=RF.evaluate(pu);
 ok(R1.posts.some(x=>x.status==='void'&&x.len>5)&&R1.issues.some(i=>i.type==='void'),'konstrukcja dachu: słup nad pustką schodzi na parter');
 const okAt=R1.postsAt.map(v=>v);pu.roofSettings.posts=[2.5,7.5];const R2=RF.evaluate(pu);ok(R2.postsAt.length===2&&R2.postsAt[0]===2.5,'konstrukcja dachu: słupy ustawione ręcznie');
 const rg=JSON.parse(JSON.stringify(sj));rg.roofSettings={system:'ridge',postSpan:6};const R3=RF.evaluate(rg);ok(R3.members.some(m=>/kalenic/i.test(m.name))&&R3.lines.length===1,'konstrukcja dachu: belka kalenicowa');
 ok(W.HouserCost.compute(pu).rows.some(r=>r.id==='roofExtra'&&r.value>0),'konstrukcja dachu: dopłaty w Wycenie');}

// garaż i działka: rodzaj garażu, miejsca, podjazd automatycznie, odległości od granic, Wycena
{const G=W.HouserGarage,SI=W.HouserSite,ld=f=>JSON.parse(fs.readFileSync(path.join(ROOT,'examples',f),'utf8'));
 for(const f of examples){const p=ld(f),g=G.evaluate(p),R=SI.evaluate(p);
   ok(fin(g.cost.total)&&g.cost.total>=0&&(g.score==null||g.score>=0&&g.score<=10),f+': garaż – liczby skończone ('+g.type+')');
   ok(fin(R.score)&&R.score>=0&&R.score<=10&&fin(R.pbc)&&R.pbc>0&&R.pbc<=100&&fin(R.cover)&&R.cover>0&&R.cover<100&&fin(R.cost.total)&&R.plot.area>=R.built,f+': działka – liczby skończone, rozsądne granice');
   ok(R.setbacks.every(b=>b.d>=b.need-1e-6),f+': działka domyślna – odległości od granic spełnione');
   const p2={...p,site:{...R.set,cells:SI.autoPaths(p)}},R2=SI.evaluate(p2);ok(R2.links.length&&R2.links.every(l=>l.ok)&&R2.spots>=2,f+': podjazd automatycznie łączy ulicę z garażem i wejściem, 2 miejsca postojowe');
   ok(R2.pbc<R.pbc&&R2.cost.site>R.cost.site,f+': nawierzchnie zmniejszają biologicznie czynną i kosztują')}
 const par=ld('dom-parterowy.json'),gp=G.evaluate(par);ok(gp.type==='house'&&gp.cars===1&&gp.issues.some(i=>/Brama/.test(i.text)),'garaż w domu: dom parterowy – 1 auto, wąska brama');
 const sm=G.evaluate(ld('stodola-mini-2a-g2.json'));ok(sm.cars===2&&sm.inHouse.gates.length===1&&sm.inHouse.gate>=5,'garaż w domu: Stodoła Mini – 2 auta, jedna brama 5,5 m');
 const sj=ld('stodola-jasna.json');sj.garage={type:'detached',cars:2};const gd=G.evaluate(sj);ok(gd.w>=6&&gd.cost.total>80000&&gd.cost.total<200000,'garaż wolnostojący na 2 auta: wymiary i koszt');
 const sc={...sj,garage:{type:'carport',cars:2}};ok(G.evaluate(sc).cost.total<gd.cost.total/2,'wiata tańsza od garażu');
 const Rd=SI.evaluate(sj);ok(Rd.garage&&!Rd.issues.some(i=>i.type==='garage'),'działka: garaż wolnostojący domyślnie obok domu, bez kolizji');
 {const Cg=W.HouserCost.compute(sj),C0=W.HouserCost.compute(ld('stodola-jasna.json'));ok(Cg.garage>0&&Math.abs(Cg.house-C0.house)<1&&Math.abs(Cg.total-Cg.house-Cg.garage-Cg.site)<1&&C0.house===C0.total,'Wycena: koszt domu bez garażu wolnostojącego – porównywalny między domami')}
 ok(W.HouserCost.compute(sj).rows.some(r=>r.id==='garage'&&r.value>0)&&!W.HouserCost.compute(ld('stodola-jasna.json')).rows.some(r=>r.id==='garage'),'Wycena: garaż wolnostojący tylko gdy wybrany');
 const ss=ld('zefir-2.json');ss.site={w:14,d:20};const Rs=SI.evaluate(ss);ok(Rs.issues.some(i=>i.type==='setback'||i.type==='house'),'działka: za wąska działka – uwaga o odległości od granicy');
 for(const rot of [90,180,270]){const pr=ld('dom-parterowy.json');pr.site={rot};const Rr=SI.evaluate(pr),R2=SI.evaluate({...pr,site:{...Rr.set,cells:SI.autoPaths(pr)}});
   ok(!Rr.orient.ok&&Rr.issues.some(i=>i.type==='orient')&&R2.links.every(l=>l.ok)&&Rr.setbacks.every(b=>b.d>=b.need-1e-6),'działka: dom obrócony o '+rot+'° – uwaga o stronach świata, podjazd i odległości liczone po obrocie')}
 {const pr=ld('dom-parterowy.json');pr.site={rot:90,top:'west'};ok(SI.evaluate(pr).orient.ok,'działka: obrót domu zgodny ze stronami świata działki – bez uwagi')}
 {const pr=ld('stodola-jasna.json');pr.garage={type:'detached',cars:2,rot:90};const Rg=SI.evaluate(pr);ok(Rg.garage.gate==='left'&&Rg.garage.w===Rg.garage.len*0+6.2,'działka: obrócony garaż – brama z boku, wymiary zamienione')}
 const ws={...ss,site:{...SI.evaluate(ld('zefir-2.json')).set}},cr=W.HouserCost.compute(ws).rows.find(r=>r.id==='site');ok(cr&&!cr.on&&cr.qty===1,'Wycena: zagospodarowanie działki – pozycja do włączenia');}

// drzwi szklane: wariant drzwi, liczony w ilościach, Wycenie i Akustyce
{const ld=f=>JSON.parse(fs.readFileSync(path.join(ROOT,'examples',f),'utf8')),p=ld('dom-parterowy.json'),q0=W.HouserQuantities.compute(p);
 const d=q0.runs.find(r=>!r.ext&&r.base==='door'&&(r.rooms||[]).some(x=>/syp/i.test(x.name||'')));W.HouserOpenings.setVariant(p,d.f,d.keys,{variant:'glass',sill:0,height:2.05});
 const q1=W.HouserQuantities.compute(p);ok(q0.ops.glassDoor===0&&q1.ops.glassDoor===1&&q1.ops.intDoor===q0.ops.intDoor,'drzwi szklane: liczone osobno, nadal jako drzwi wewnętrzne');
 ok(W.HouserCost.compute(p).rows.some(r=>r.id==='glassdoors'&&r.value>0)&&!W.HouserCost.compute(ld('dom-parterowy.json')).rows.some(r=>r.id==='glassdoors'),'drzwi szklane: dopłata w Wycenie tylko gdy są');
 ok(W.HouserOpenings.resolve(p,d.f,d.keys[0],'door').glass,'drzwi szklane: wariant zapisany');}

// oświetlenie: lampy, natężenie, cienie, pustka, prąd, Elektryka i Wycena
{const LG=W.HouserLight,ld=f=>JSON.parse(fs.readFileSync(path.join(ROOT,'examples',f),'utf8'));
 for(const f of ['dom-parterowy.json','stodola-jasna.json','zefir-2.json']){const p=ld(f);ok(LG.evaluate(p).score===null,f+': oświetlenie bez lamp – brak oceny');p.lighting={lamps:LG.suggest(p)};const R=LG.evaluate(p);
   ok(R.lamps.length>5&&fin(R.score)&&R.score>=7&&R.rooms.every(r=>fin(r.avg)&&r.avg>=0&&r.min<=r.avg+1e-9)&&fin(R.power)&&R.power>50&&R.power<2000,f+': propozycja oświetlenia – liczby skończone, ocena '+R.score);
   ok(R.rooms.filter(r=>r.status==='ok').length>=R.rooms.length*.8,f+': propozycja oświetlenia – większość pomieszczeń zgodna z zaleceniami');
   const E=W.HouserElectric.evaluate(p),n=R.lamps.filter(L=>!['floor','table'].includes(L.type)&&L.room).length,eL=E.rooms.reduce((a,r)=>a+r.lights,0);ok(Math.abs(eL-n)<=2,f+': Elektryka liczy punkty światła z rozmieszczonych lamp ('+eL+' / '+n+')');
   ok(W.HouserCost.compute(p).rows.some(r=>r.id==='luminaires'&&r.value>0)&&!W.HouserCost.compute(ld(f)).rows.some(r=>r.id==='luminaires'),f+': oprawy w Wycenie tylko z lampami')}
 {const p=ld('dom-parterowy.json'),q=W.HouserQuantities.compute(p),r=q.rooms.find(z=>/salon/i.test(z.name)),key=r.f+'|'+r.id,inR=L=>r.cells.some(([x,y])=>L.x>=x*q.c&&L.x<(x+1)*q.c&&L.y>=y*q.c&&L.y<(y+1)*q.c);
  for(const sc of Object.keys(LG.SCHEMES)){const L=LG.roomLamps(p,r,{scheme:sc});ok(L.length>0&&L.every(inR),'oświetlenie: układ „'+LG.SCHEMES[sc]+'” – lampy w pomieszczeniu ('+L.length+')')}
  const sum=lv=>LG.roomLamps(p,r,{scheme:'ceiling',level:lv}).reduce((a,L)=>a+L.lm,0);ok(sum('low')<sum('std')&&sum('std')<sum('high'),'oświetlenie: jasność zmienia strumień lamp');
  ok(LG.roomLamps(p,r,{scheme:'downlights',K:4000}).every(L=>L.K===4000),'oświetlenie: barwa ustawiona dla pomieszczenia');
  p.lighting={rooms:{[key]:{mode:'manual'}}};const S=LG.suggest(p);ok(!S[q.lo].some(inR)&&S[q.lo].length>5,'oświetlenie: rozmieszczanie całego domu pomija pomieszczenia w trybie ręcznym')}
 {const p=ld('dom-parterowy.json'),q=W.HouserQuantities.compute(p),hol=q.rooms.find(r=>/hol/i.test(r.name)),cc=hol.cells[Math.floor(hol.cells.length/2)];
  p.lighting={lamps:{[q.lo]:[{id:'a',x:(cc[0]+.5)*q.c,y:(cc[1]+.5)*q.c,type:'ceiling',lm:3000}]}};const sum=R=>R.rooms.filter(r=>r.id!==hol.id).reduce((a,r)=>a+r.avg,0);
  const Rc=LG.evaluate(p);p.lighting.doors='open';const Ro=LG.evaluate(p);ok(sum(Ro)>sum(Rc)*1.2,'oświetlenie: otwarte drzwi wpuszczają światło z holu do pokoi');
  {const L=Rc.lamps[0],A=Rc.at(L.x,L.y,0,[0,1,0]),B=Rc.at(L.x+2,L.y,0,[0,1,0]);ok(fin(A.E)&&A.E>B.E&&A.t.every(v=>v>0&&v<=1),'oświetlenie 3D (noc): pod lampą jaśniej niż obok, barwa w zakresie')}
  {const far=q.rooms.find(r=>/syp/i.test(r.name)),cf=far.cells[Math.floor(far.cells.length/2)],X=(cf[0]+.5)*q.c,Y=(cf[1]+.5)*q.c,pc={...p,lighting:{lamps:p.lighting.lamps}};ok(LG.evaluate(pc).at(X,Y,0,[0,1,0]).E<5,'oświetlenie 3D (noc): w sypialni za zamkniętymi drzwiami ciemno')}
  const h0=Rc.power;p.lighting.lamps[q.lo][0].bulb='halogen';ok(LG.evaluate(p).power>h0*5,'oświetlenie: halogen zużywa kilka razy więcej prądu niż LED');}
 {const p=ld('stodola-jasna.json'),q=W.HouserQuantities.compute(p),st=p.state[q.up].flat?p.state[q.up].flat():p.state[q.up],i=st.indexOf('pustka'),x=(i%q.W+.5)*q.c,y=(Math.floor(i/q.W)+.5)*q.c;
  p.lighting={lamps:{[q.lo]:[{id:'v',x,y,type:'pendant',lm:2000,h:q.G.groundHeight+1.4}]}};const R=LG.evaluate(p);ok(R.lamps[0].void&&R.floors[q.up].pts.some(P=>P.dir>5)&&R.floors[q.lo].pts.some(P=>P.dir>20),'oświetlenie: lampa wisząca w pustce świeci na parter i na antresolę');
  p.lighting={lamps:{[q.up]:[{id:'u',x,y,type:'ceiling',lm:2000}]}};const R2=LG.evaluate(p);ok(R2.floors[q.lo].pts.some(P=>P.dir>5),'oświetlenie: lampa na piętrze nad pustką świeci na parter');
  const j=st.findIndex((v,k)=>v&&v!=='pustka'&&v!=='schody'&&!(p.definitionSnapshot.floors[q.up].rooms.find(r=>r.id===v)?.kind==='exteriorVoid')),x2=(j%q.W+.5)*q.c,y2=(Math.floor(j/q.W)+.5)*q.c;
  p.lighting={lamps:{[q.up]:[{id:'w',x:x2,y:y2,type:'ceiling',lm:2000}]}};ok(LG.evaluate(p).floors[q.lo].pts.every(P=>P.dir<1e-9),'oświetlenie: lampa na piętrze nad stropem nie świeci na parter');}}

// rekuperacja – projekt kanałów: kratki, trasy, pion / szacht, warstwy i ich skutki
{const DU=W.HouserDucts,ld=f=>JSON.parse(fs.readFileSync(path.join(ROOT,'examples',f),'utf8'));
 for(const f of examples){const p=ld(f),R=DU.evaluate(p);ok(R.nTerms>0&&fin(R.flexLen)&&R.flexLen>0&&fin(R.cost.total)&&R.cost.total>0&&R.floors.every(fl=>R.terms[fl].every(t=>t.unreach||fin(t.len)&&t.len>0)),f+': kanały rekuperacji – liczby skończone ('+R.nDucts+' kanałów, '+Math.round(R.flexLen)+' m)');
   ok(R.rooms.every(r=>r.ducts>=Math.ceil(r.flow/30)),f+': kanały rekuperacji – Ø75 wystarczy na strumień każdego pomieszczenia')}
 const p=ld('zefir-2.json'),R=DU.evaluate(p);ok(R.riser&&R.shaft&&R.shaft.floors.length>=1&&R.shaft.w>0,'kanały: dom piętrowy – pion i szacht');
 const lo=R.lo;p.mvhrDesign={layers:{[lo]:'slab'}};const R2=DU.evaluate(p);ok(R2.screedA[R2.up]>0&&!Object.keys(R2.ceilA).length,'kanały: w stropie – wyższa wylewka piętra zamiast sufitu podwieszanego');
 p.mvhrDesign={layers:{[lo]:'ceiling'}};const R3=DU.evaluate(p);ok(R3.ceilA[lo]>0,'kanały: sufit podwieszany – powierzchnia obniżenia');
 {const p=ld('zefir-2.json'),R0=DU.evaluate(p),u=R0.unit,t=R0.terms[R0.lo][0],L=R0.terms[R0.lo].filter(x=>x.key===t.key);
  p.mvhrDesign={unit:{f:u.f,x:u.x+.37,y:u.y+.21}};const R1=DU.evaluate(p);ok(Math.abs(R1.unit.x-(u.x+.37))<.3&&Math.abs(R1.unit.y-(u.y+.21))<.3,'kanały: centrala zostaje tam, gdzie ją upuszczono');
  p.mvhrDesign={unit:{f:u.f,x:-50,y:u.y}};const R2=DU.evaluate(p);const cy=Math.floor(R2.unit.y/R2.c),row=R2.H.rooms.filter(r=>r.f===u.f).flatMap(r=>r.cells).filter(([i,j])=>j===cy).map(([i])=>i);ok(row.length&&Math.floor(R2.unit.x/R2.c)===Math.min(...row),'kanały: centrala poza domem – przesunięta do najbliższego miejsca w domu, nie w miejsce automatyczne');
  p.mvhrDesign={terms:{[t.key]:L.map((x,i)=>i?[x.x,x.y]:[x.x+.12,x.y+.08])}};const R3=DU.evaluate(p),t3=R3.terms[R3.lo].find(x=>x.key===t.key),P3=R3.paths[R3.lo].find(x=>x.key===t.key);
  ok(Math.abs(t3.x-(t.x+.12))<1e-6&&Math.abs(t3.y-(t.y+.08))<1e-6&&P3&&P3.pts.at(-1)[0]===t3.x&&P3.pts.at(-1)[1]===t3.y,'kanały: kratka w dowolnym miejscu pokoju, kanał dochodzi do niej');
  p.mvhrDesign={terms:{[t.key]:L.map(x=>[x.x+99,x.y])}};const R4=DU.evaluate(p),hr=R4.H.rooms.find(r=>r.key===R4.terms[R4.lo].find(x=>x.key===t.key).roomKey);ok(R4.terms[R4.lo].filter(x=>x.key===t.key).every(x=>hr.cells.some(([i,j])=>i===Math.floor(x.x/R4.c)&&j===Math.floor(x.y/R4.c))),'kanały: kratka wyciągnięta poza pokój zostaje na jego skraju');}
 const b=ld('dom-parterowy.json'),RB=DU.evaluate(b);ok(!RB.shaft&&RB.layer[RB.lo]==='attic','kanały: dom parterowy – kanały na strychu, bez szachtu');}

// wyposażenie: rzeczy i ich miejsca
{const EQ=W.HouserEquip,ld=f=>JSON.parse(fs.readFileSync(path.join(ROOT,'examples',f),'utf8'));
 for(const f of examples){const R=EQ.evaluate(ld(f));ok(fin(R.score)&&R.score>=0&&R.score<=10&&R.total>15&&R.placed<=R.total&&R.places.every(p=>fin(p.used)&&p.used>=0),f+': wyposażenie – liczby skończone ('+R.placed+'/'+R.total+')')}
 const sj=EQ.evaluate(ld('stodola-jasna.json')),A=(R,id)=>R.appliances.find(a=>a.id===id),I=(R,id)=>R.items.find(i=>i.id===id);
 ok(A(sj,'fridge').status==='ok'&&A(sj,'dish').status==='ok','wyposażenie: lodówka i zmywarka stoją w meblach kuchennych');
 ok(sj.clothes.length>0&&sj.clothes.every(c=>fin(c.need)&&c.need>0&&fin(c.got)&&c.n>=1)&&sj.clothes.reduce((a,c)=>a+c.n,0)===sj.P,'wyposażenie: ubrania – wszyscy domownicy rozdzieleni na sypialnie');
 const dp=ld('dom-parterowy.json'),R0=EQ.evaluate(dp);ok(A(R0,'fridge').status==='missing'&&R0.issues.some(i=>i.type==='appliance')&&I(R0,'bikes').placeName==='Garaż','wyposażenie: brak lodówki wykryty, rowery w garażu');
 dp.equipment={items:{vacuum:{place:'R:ground|tech'},bikes:{on:false}}};const R1=EQ.evaluate(dp);ok(I(R1,'vacuum').placeName==='Techniczne'&&!I(R1,'bikes').place&&R1.total===R0.total-1,'wyposażenie: miejsce wybrane ręcznie i rzecz wyłączona');
 const fk=R1.places.find(p=>p.type==='furn');if(fk){dp.equipment.items.iron={place:fk.key};const R2=EQ.evaluate(dp);ok(I(R2,'iron').place===fk.key&&R2.places.find(p=>p.key===fk.key).list.includes(I(R2,'iron').name),'wyposażenie: rzecz schowana w wybranym meblu')}
 const zf=EQ.evaluate(ld('zefir-2.json'));ok(A(zf,'fridge').status==='assumed'&&zf.issues.some(i=>i.type==='virtual'),'wyposażenie: kuchnia bez mebli – zakładana zabudowa z uwagą');}

// tarasy: wysokość, dach jednospadowy, ściany z boków
{const ld=f=>JSON.parse(fs.readFileSync(path.join(ROOT,'examples',f),'utf8')),p=ld('dom-parterowy.json'),g=p.grid||p.definitionSnapshot.grid,ct=(p.outdoorStructures||[]).find(o=>o.type==='coveredTerrace');
 if(ct){const st=p.state.ground,fl=Array.isArray(st[0])?st.flat():st,isH=(x,y)=>x>=0&&y>=0&&x<g.width&&y<g.height&&!!fl[y*g.width+x];
  const G0=W.HouserModel.outdoorGeom(ct,g.cellMeters,isH);ok(G0.roof==='flat'&&G0.height===2.5&&G0.edges.length>0&&Object.values(G0.adj).some(v=>v>0),'tarasy: zadaszenie domyślne – płaskie 2,5 m, bok przy domu rozpoznany');
  Object.assign(ct,{height:2.4,roof:'mono',pitch:10,sides:{[G0.edges[0].side]:'glass'}});const G1=W.HouserModel.outdoorGeom(ct,g.cellMeters,isH),hi=Object.entries(G1.adj).sort((a,b)=>b[1]-a[1])[0][0];
  ok(G1.maxH>G1.height+.2&&G1.fall==={top:'bottom',bottom:'top',left:'right',right:'left'}[hi],'tarasy: dach jednospadowy – wyżej przy domu, spadek od domu');
  const C1=W.HouserCost.compute(p).rows.find(r=>r.id==='terraceSides');ok(C1&&C1.qty>1&&C1.value>C1.qty*1000,'tarasy: przeszklenie boku w Wycenie');
  const m=new Map(W.HouserModel.outdoorMap(p.outdoorStructures,g.cellMeters)),re=W.HouserModel.outdoorFromMap(m,g.cellMeters,p.outdoorStructures).find(o=>o.type==='coveredTerrace');ok(re.roof==='mono'&&re.height===2.4&&re.sides,'tarasy: ustawienia zostają po przemalowaniu kratek')}
 else ok(false,'tarasy: brak zadaszonego tarasu w przykładzie');}

// notatki: prosta lista w projekcie
{const NO=W.HouserNotes,p={notes:[{id:'a',text:'Zapytać o strop',cat:'question',upd:'2026-01-01'},{id:'b',text:'Kominek',cat:'xxx',star:true,upd:'2025-01-01'},{id:'c',text:'Oferta okien',cat:'cost',done:true,upd:'2026-02-01'}]};
 const L=NO.list(p,{status:'all'});ok(L.map(n=>n.id).join()==='b,a,c'&&NO.all(p)[1].cat==='idea','notatki: kolejność (ważne, nowsze, zamknięte na końcu) i nieznany rodzaj → pomysł');
 const S=NO.stats(p);ok(S.total===3&&S.open===2&&S.done===1&&S.byCat.question===1&&!S.byCat.cost,'notatki: liczniki');
 ok(NO.list(p,{status:'open',q:'STROP'}).length===1&&NO.list(p,{cat:'cost',status:'done'}).length===1&&NO.list({},{}).length===0,'notatki: filtry i projekt bez notatek');
 const n=NO.make({text:'x',cat:'todo'});ok(n.id&&n.at&&n.cat==='todo'&&!n.done,'notatki: nowa notatka');
 ok(NO.toText(L).includes('PYTANIE\n[ ] Zapytać o strop')&&NO.toText(L).includes('[x] Oferta okien'),'notatki: eksport tekstu');}

// ---------- składnia: każdy skrypt strony (pliki .js i <script> w .html) musi się dać sparsować
console.log('• składnia skryptów');
{const vm=require('vm'),walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?(['node_modules','.git'].includes(e.name)?[]:walk(path.join(d,e.name))):[path.join(d,e.name)]);
 for(const f of walk(ROOT).filter(f=>/\.(js|html)$/.test(f)&&!f.includes(path.sep+'tests'+path.sep))){const rel=path.relative(ROOT,f),src=fs.readFileSync(f,'utf8');
   const parts=f.endsWith('.js')?[src]:[...src.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*type=["']?module)[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
   for(const code of parts){let err=null;try{new vm.Script(code,{filename:rel})}catch(e){err=e.message}ok(!err,rel+': błąd składni – '+err)}}}

// ---------- 3) zapisane wyniki
const EXP=path.join(__dirname,'expected.json');
if(UPDATE||!fs.existsSync(EXP)){fs.writeFileSync(EXP,JSON.stringify(snap,null,1)+'\n');console.log('• zapisano wyniki wzorcowe: tests/expected.json')}
else{console.log('• porównanie z tests/expected.json');const exp=JSON.parse(fs.readFileSync(EXP,'utf8'));
  for(const [f,e] of Object.entries(exp)){const s=snap[f];if(!s){ok(false,f+': brak domu');continue}
    const near=(a,b,rel)=>Math.abs(a-b)<=Math.max(1,Math.abs(b)*rel);
    ok(Math.abs(s.overall-e.overall)<=.05,f+': ocena ogólna '+e.overall+' → '+s.overall);
    for(const k of ['cost','Qh','bills','area'])ok(near(s[k],e[k],.005),f+': '+k+' '+e[k]+' → '+s[k]);
    for(const [m,v] of Object.entries(e.mods))ok(v==null?s.mods[m]==null:Math.abs((s.mods[m]??-99)-v)<=.05,f+': '+m+' '+v+' → '+s.mods[m])}}
console.log('\n'+(fails?'✗ '+fails+' błędów, ':'✓ ')+passes+' sprawdzeń OK');process.exit(fails?1:0);
