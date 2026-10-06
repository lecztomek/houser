// Kompletność domu: które decyzje są już podjęte, a które moduły liczą jeszcze na założeniach.
// HouserComplete.check(project) -> {items:[{mod, name, done, assumed}], missing, total, complete, byMod:{mod:[items]}}
// Decyzja jest podjęta, gdy moduł zapisał swoje ustawienia albo użytkownik kliknął „Zatwierdź” (project.confirmed[mod]).
// Nowy moduł z ustawieniami = nowy wpis w DECISIONS.
(function(global){
  const has=(o,...k)=>!!o&&k.every(x=>o[x]!==undefined&&o[x]!==null&&o[x]!=='');
  const twoFloors=p=>{try{const [lo,up]=p.definitionSnapshot?.floorOrder||['ground','upper'],st=p.state?.[up]||[];return (Array.isArray(st[0])?st.flat():st).some(v=>v&&v!=='pustka')}catch(_){return false}};
  const DECISIONS=[
    {mod:'kondygnacje-dach',name:'Kondygnacje i dach',done:p=>!!p.elevationSettings,assumed:'parter 2,8 m, poddasze, dach 35°'},
    {mod:'schody',name:'Schody',done:p=>!twoFloors(p)||(Array.isArray(p.stairs)&&p.stairs.length>0),assumed:'prosty bieg',when:twoFloors},
    {mod:'ocieplenie',name:'Mur, ocieplenie i okna',done:p=>!!p.envelope,assumed:'beton komórkowy 24 cm + 15 cm styropianu, okna 0,9'},
    {mod:'energia',name:'Domownicy i ceny energii',done:p=>has(p.energySettings,'persons'),assumed:'4 osoby, typowe ceny'},
    {mod:'instalacja-grzewcza',name:'Źródło ciepła i ogrzewanie w pokojach',done:p=>!!p.heatingSystem,assumed:'pompa ciepła powietrze–woda z podłogówką'},
    {mod:'wentylacja',name:'Wentylacja',done:p=>has(p.energySettings,'vent'),assumed:'rekuperacja'},
    {mod:'fotowoltaika',name:'Fotowoltaika – montuję czy nie',done:p=>has(p.pvSettings,'enabled'),assumed:'bez fotowoltaiki'},
    {mod:'konstrukcja',name:'Strop, ściany działowe, dach, grunt',done:p=>has(p.structure,'partUp','roof','soil'),assumed:'strop gęstożebrowy, murowane ścianki 12 cm, dachówka ceramiczna, grunt przeciętny'},
    // nie decyzja, tylko problem: strop nie wyrabia – tego nie da się „zatwierdzić”, trzeba wybrać strop albo wstawić podciąg / słup
    {mod:'konstrukcja',name:'Strop nie wyrabia – mocniejszy strop albo podciąg / słup',strict:true,assumed:'brak kosztu podciągu w Wycenie, dopóki nie rozwiążesz',
      done:p=>{if(!global.HouserStructure)return true;const K=HouserStructure.evaluate(p);return !K.hasUp||!K.regions.length},
      label:p=>{try{const R=HouserStructure.evaluate(p).regions;return R.length?'Strop nie wyrabia nad: '+R.map(r=>r.room).join('; '):null}catch(_){return null}}},
    {mod:'elektryka',name:'Standard instalacji elektrycznej',done:p=>!!p.elecSettings,assumed:'typowa liczba gniazd, płyta indukcyjna'},
    {mod:'wycena',name:'Standard wykończenia i ceny',done:p=>has(p.costSettings,'std'),assumed:'standard, ceny średnie'},
    {mod:'klimatyzacja',name:'Klimatyzacja – czy będzie',done:p=>has(p.hvacSettings,'ac'),assumed:'tylko pokoje z dużym ryzykiem przegrzania'},
  ];
  function check(project){const p=project||{},conf=p.confirmed||{},items=[];
    for(const d of DECISIONS){if(d.when&&!d.when(p))continue;let done=false,name=d.name;try{done=(!d.strict&&!!conf[d.mod])||d.done(p)}catch(_){}
      if(!done&&d.label)try{name=d.label(p)||name}catch(_){}items.push({mod:d.mod,name,assumed:d.assumed,done,strict:!!d.strict})}
    const missing=items.filter(i=>!i.done).length,byMod={};for(const i of items)(byMod[i.mod]=byMod[i.mod]||[]).push(i);
    return {items,missing,total:items.length,complete:!missing,byMod}}
  global.HouserComplete={DECISIONS,check};
})(window);
