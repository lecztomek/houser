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
  const M=W.HouserHVAC.methods(p,p.hvacSettings);for(const m of M.list){ok(fin(m.invest)&&fin(m.total)&&fin(m.score)&&fin(m.fan),f+': wentylacja '+m.k+' '+JSON.stringify([m.invest,m.fan,m.total,m.score]))}
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
{const R=W.HouserAdvice.collect(base),n=R.mods.filter(m=>m.score!=null).length;ok(n>=8,'Co poprawić: ocenia co najmniej 8 modułów ('+n+')');}

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
