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
