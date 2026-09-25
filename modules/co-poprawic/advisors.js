// Co poprawić – zbiera uwagi z modułów oceniających w jednej, wspólnej postaci.
// Moduły NIE są tu przeliczane inaczej – każdy „doradca” tylko woła silnik modułu i tłumaczy jego wynik na:
//   {score 0–10 | null, items:[{p 0–3 (waga problemu), text, tip}], good:[tekst]}
// Nowy moduł oceniający = jeden nowy wpis w ADVISORS (plus <script> silnika w index.html i w porównaniu).
(function(global){
  const fmt=(v,d=1)=>(Math.round(v*10**d)/10**d).toLocaleString('pl-PL',{minimumFractionDigits:d,maximumFractionDigits:d});
  const clamp=v=>Math.max(0,Math.min(10,v));
  const FAC={north:'północ',south:'południe',east:'wschód',west:'zachód'};
  const ADVISORS=[
    {id:'przepisy',name:'Przepisy',w:1.5,need:'HouserRules',run:p=>{const {out}=HouserRules.check(p);const bad=out.filter(o=>o.st==='bad'),warn=out.filter(o=>o.st==='warn');
      return {score:clamp(10-2*bad.length-.5*warn.length),items:[...bad.map(o=>({p:2.5,head:o.room,text:o.name+' – '+o.val+' (wymagane: '+o.req+')',tip:o.fix})),...warn.map(o=>({p:.8,head:o.room,text:o.name+' – '+o.val+' ('+o.req+')',tip:o.fix}))],
        good:bad.length?[]:['Zgodny z uproszczonymi warunkami technicznymi (okna, wysokości, drzwi, schody).']}}},
    {id:'codziennosc',name:'Codzienność',w:1.2,need:'HouserDaily',run:p=>{const D=HouserDaily.evaluate(p,p.dailySettings);const sc=D.scenarios.filter(s=>s.enabled!==false&&s.score!=null);
      return {score:D.overall,items:sc.filter(s=>s.score<7.5).map(s=>({p:Math.min(3,(7.5-s.score)/2*(s.weight||1)+.3),head:s.name+' · '+fmt(s.score)+' / 10',text:s.why[0]||s.desc,tip:s.hints[0]||''})),
        good:sc.filter(s=>s.score>=9).map(s=>'Wygodnie na co dzień: '+s.name.toLowerCase()+' ('+fmt(s.score)+' / 10).')}}},
    {id:'schowki',name:'Schowki i szafy',w:1,need:'HouserStorage',run:p=>{const R=HouserStorage.evaluate(p,p.storageSettings);return {score:R.overall,items:R.issues.filter(i=>i.p>0).map(i=>({p:Math.min(3,i.p*1.3),text:i.text,tip:i.tip})),good:R.good}}},
    {id:'akustyka',name:'Akustyka',w:1,need:'HouserAcoustics',run:p=>{const A=HouserAcoustics.evaluate(p,p.acousticSettings);const items=[];
      for(const r of Object.values(A.rooms))for(const i of r.issues||[])if(i.p>=.8)items.push({p:Math.min(3,i.p*1.2),head:r.name,text:i.text,tip:i.tip});
      return {score:A.overall,items,good:A.overall>=8?['Cicho w sypialniach i pokojach do pracy (akustyka '+fmt(A.overall)+' / 10).']:[]}}},
    {id:'naslonecznienie',name:'Nasłonecznienie',w:1,need:'HouserSolar',run:p=>{const S=HouserSolar.compute(p);const ws=S.list.filter(r=>r.wins&&r.wins.length),hot=ws.filter(r=>r.risk>=2);
      return {score:ws.length?clamp(10*(1-hot.length/ws.length)):null,items:hot.map(r=>{const f=[...new Set(r.wins.filter(w=>!w.roof).map(w=>FAC[w.facing]).filter(Boolean))];
        return {p:r.risk>=3?2:1.2,text:'„'+r.name+'” latem mocno się nagrzewa'+(f.length?' – okna od strony: '+f.join(' · '):''),tip:'Rolety zewnętrzne, okap lub zadaszenie nad oknami od południa i zachodu – albo mniejsze okna od zachodu.'}}),
        good:ws.length&&!hot.length?['Żaden pokój nie ma wysokiego ryzyka przegrzania latem.']:[]}}},
    {id:'energia',name:'Energia',w:1,need:'HouserEnergy',run:p=>{const E=HouserEnergy.compute(p);if(!(E.q.usableTotal>0))return {score:null,items:[],good:[]};const top=[...E.rows].sort((a,b)=>b.share-a.share)[0];
      const items=E.EU>70?[{p:Math.min(3,(E.EU-70)/25+1),text:'Duże zapotrzebowanie na ciepło: '+Math.round(E.EU)+' kWh/m² na rok.',tip:'Najwięcej ciepła ucieka przez: '+top.name.toLowerCase()+' ('+Math.round(top.share*100)+'%) – tam poprawa daje najwięcej.'}]:[];
      return {score:clamp(10*(120-E.EU)/105),items,good:E.EU<=40?['Dom energooszczędny: '+Math.round(E.EU)+' kWh/m² na rok.']:[]}}},
    {id:'hydraulika',name:'Hydraulika',w:.8,need:'HouserPlumbing',run:p=>{const P=HouserPlumbing.evaluate(p,p.plumbingSettings);const items=[];
      for(const pt of P.points)for(const i of pt.issues||[])if(i.p>=.8)items.push({p:Math.min(3,i.p),head:pt.name,text:i.text,tip:i.tip});
      return {score:P.overall,items,good:P.overall>=8.5?['Zwarta instalacja wod-kan – mokre pomieszczenia blisko siebie i jedno nad drugim.']:[]}}},
    {id:'instalacja-grzewcza',name:'Ogrzewanie',w:.8,need:'HouserHeatSys',run:p=>{if(!p.heatingSystem)return {score:null,items:[],good:[]};const R=HouserHeatSys.evaluate(p);
      return {score:R.ease,items:R.issues.filter(i=>i.p>0).map(i=>({p:Math.min(3,i.p),text:i.text,tip:i.tip})),good:R.good.slice(0,2)}}},
    {id:'rekuperacja',name:'Rekuperacja',w:.6,need:'HouserHVAC',run:p=>{const V=HouserHVAC.evaluate(p,p.hvacSettings);return {score:V.difficulty,items:(V.dIss||[]).map(i=>({p:Math.min(3,i.p*.8),text:i.text,tip:i.tip})),good:V.difficulty>=8?['Rekuperację łatwo zrobić – krótkie kanały, dobre miejsce na centralę.']:[]}}},
  ];
  function collect(project){
    const mods=[],all=[];
    for(const A of ADVISORS){if(typeof global[A.need]==='undefined')continue;let r;try{r=A.run(project)}catch(e){console.warn(A.id,e);continue}
      const m={...A,score:r.score==null?null:Math.round(r.score*10)/10,items:r.items,good:r.good||[]};mods.push(m);
      for(const it of r.items)all.push({...it,mod:A.id,modName:A.name,prio:it.p*A.w})}
    all.sort((a,b)=>b.prio-a.prio);
    // pięć najważniejszych – najwyżej dwie z jednego modułu, żeby lista była różnorodna
    const top=[],per={};for(const it of all){if(top.length>=5)break;if((per[it.mod]||0)>=2)continue;per[it.mod]=(per[it.mod]||0)+1;top.push(it)}
    const scored=mods.filter(m=>m.score!=null),sorted=[...scored].sort((a,b)=>b.score-a.score);
    const strengths=sorted.filter(m=>m.score>=7.5).slice(0,3).map(m=>({mod:m.id,modName:m.name,score:m.score,text:m.good[0]||m.name+': '+fmt(m.score)+' / 10'}));
    const weaknesses=[...sorted].reverse().filter(m=>m.score<7).slice(0,3).map(m=>({mod:m.id,modName:m.name,score:m.score,text:([...m.items].sort((a,b)=>b.p-a.p)[0]||{}).text||'',head:([...m.items].sort((a,b)=>b.p-a.p)[0]||{}).head||''}));
    const wsum=scored.reduce((a,m)=>a+m.w,0),overall=wsum?Math.round(scored.reduce((a,m)=>a+m.w*m.score,0)/wsum*10)/10:null;
    return {mods,all,top,strengths,weaknesses,overall,major:all.filter(i=>i.p>=2).length};
  }
  global.HouserAdvice={ADVISORS,collect};
})(window);
