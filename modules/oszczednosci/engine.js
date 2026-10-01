// Oszczędności – lista prostych zmian w projekcie, które obniżają koszt budowy (albo rachunki).
// Każda zmiana: {id, name, why, run(p) -> true, jeśli coś zmieniła (modyfikuje przekazaną kopię projektu)}.
// Ocena zmian (koszt, rachunki, ocena ogólna) – HouserSavings.measure(p) na kopii projektu po zmianie.
// Wymaga: cost.js, heating-system.js, co-poprawic/advisors.js (i ich silników), ocieplenie/engine.js.
(function(global){
  const env=p=>p.envelope?{...HouserEnvelope.DEF,...p.envelope}:null;
  const setEnv=(p,e)=>{HouserEnvelope.apply(p,e);return true};
  const winOpts=(p,fn)=>{let n=0;for(const f of Object.keys(p.openings||{}))for(const [k,base] of Object.entries(p.openings[f])){if(base!=='window'&&base!=='hst')continue;const v=p.openingVariants?.[f]?.[k]||{};if(fn(v,base,f,k)){n++}}return n>0};
  const CHANGES=[
    {id:'sloped',name:'Okna ścięte → zwykłe prostokątne',why:'Okna trapezowe robi się na wymiar – są o ok. 60% droższe za m².',
      run:p=>winOpts(p,(v,base,f,k)=>{if(base!=='window'||!/^sloped/.test(v.variant||''))return false;const nv={variant:'standard',sill:.9,height:1.4};if(v.blind)nv.blind=v.blind;p.openingVariants[f][k]=nv;return true})},
    {id:'blinds',name:'Żaluzje fasadowe i screeny → rolety zewnętrzne',why:'Roleta zewnętrzna chroni przed słońcem prawie tak samo, a kosztuje mniej.',
      run:p=>winOpts(p,v=>{if(v.blind!=='venetian'&&v.blind!=='screen')return false;v.blind='external';return true})},
    {id:'winq',name:'Okna pasywne / z ciepłą ramką → trzyszybowe standardowe',why:'Różnica w stratach ciepła jest mała, a cena okien spada o 15–40%.',
      run:p=>{const e=env(p);if(!e||!['passive','warm3'].includes(e.win))return false;return setEnv(p,{...e,win:'std3'})}},
    {id:'insT',name:'Ocieplenie ścian grubsze niż 15 cm → 15 cm',why:'Każdy centymetr ponad 15 cm zwraca się bardzo długo.',
      run:p=>{const e=env(p);if(!e||e.ins==='none'||+e.insT<=15)return false;return setEnv(p,{...e,insT:15})}},
    {id:'insM',name:'Wełna / PIR na ścianach → styropian grafitowy',why:'Grafit daje podobne U przy niższej cenie (wełnę warto zostawić tylko przy domu drewnianym lub ze względów pożarowych).',
      run:p=>{const e=env(p);if(!e||!['wool','pir'].includes(e.ins)||e.wall==='timber')return false;return setEnv(p,{...e,ins:'graphite'})}},
    {id:'wall',name:'Mur jednowarstwowy → gazobeton 24 cm + styropian',why:'Ściana dwuwarstwowa jest zwykle tańsza przy tym samym cieple.',
      run:p=>{const e=env(p);if(!e||!['ceramic44','aac36'].includes(e.wall))return false;return setEnv(p,{...e,wall:'aac',ins:e.ins==='none'?'graphite':e.ins,insT:Math.max(15,+e.insT||0)})}},
    {id:'finish',name:'Elewacja z drewna / klinkieru / płyt → tynk z fragmentami drewna',why:'Okładzina na całej elewacji to 2–5× koszt tynku; akcenty dają podobny efekt.',
      run:p=>{const e=env(p);if(!e||!['wood','clinker','fibre'].includes(e.finish))return false;return setEnv(p,{...e,finish:'mixed'})}},
    {id:'std',name:'Standard wykończenia wysoki → standardowy',why:'Wykończenie (podłogi, łazienki, drzwi) w wysokim standardzie kosztuje ok. 35% więcej. Ocena domu tego nie widzi – zdecyduj sam.',
      run:p=>{if(p.costSettings?.std!=='high')return false;p.costSettings={...p.costSettings,std:'std'};return true}},
    {id:'hpGround',name:'Pompa gruntowa → pompa powietrzna',why:'Odwierty lub kolektor są drogie; pompa powietrzna jest tańsza w zakupie, ale ma trochę wyższe rachunki.',
      run:p=>{const h=p.heatingSystem;if(h?.main!=='hp_ground')return false;h.main='hp_air';return true}},
    {id:'extra',name:'Bez dodatkowego źródła ciepła',why:'Drugie źródło (kominek, druga pompa, kocioł) to osobna inwestycja – zostaw je, jeśli zależy Ci na zapasie lub klimacie.',
      run:p=>{const h=p.heatingSystem;if(!h||!h.extra||h.extra==='none')return false;h.extra='none';if(h.devices)delete h.devices.extra;return true}},
    {id:'floorRad',name:'Podłogówka → grzejniki',why:'Grzejniki są tańsze w montażu, ale pompa ciepła pracuje z nimi mniej wydajnie (wyższe rachunki).',
      run:p=>{const h=p.heatingSystem;if(!h)return false;const ev=HouserHeatSys.evaluate(p);let n=0;h.emitters=h.emitters||{};for(const r of ev.rooms){if(/floor/.test(r.emit)){h.emitters[r.key]=r.bath?'ladder':'rad';n++}}return n>0}},
    {id:'vent',name:'Rekuperacja → wentylacja wywiewna',why:'Taniej na starcie, ale więcej ciepła ucieka z powietrzem – wyższe rachunki i mniej komfortu.',
      run:p=>{const v=p.energySettings?.vent||'mech';if(v!=='mech')return false;p.energySettings={...(p.energySettings||{}),vent:'exhaust'};return true}},
    {id:'covTer',name:'Taras zadaszony → taras bez dachu (np. z markizą)',why:'Dach nad tarasem kosztuje ok. 650 zł/m² więcej niż sam taras.',
      run:p=>{let n=0;for(const o of p.outdoorStructures||[])if(o.type==='coveredTerrace'){o.type='terrace';n++}return n>0}},
    {id:'chimney',name:'Bez komina',why:'Komin jest potrzebny tylko przy kominku lub kotle na paliwo – przy pompie ciepła można go pominąć.',
      run:p=>{if(!(p.structure?.chimney||[]).length)return false;const h=HouserHeatSys.normalize(p),S=HouserHeatSys.SOURCES,X=HouserHeatSys.EXTRAS;if(S[h.main]?.flue||X[h.extra]?.flue)return false;p.structure={...p.structure,chimney:[]};return true}},
  ];
  function measure(p){const r={cost:null,score:null,bills:null};try{r.cost=HouserCost.compute(p).total}catch(e){console.error(e)}try{r.score=HouserAdvice.collect(p).overall}catch(e){console.error(e)}try{r.bills=HouserHeatSys.evaluate(p).year}catch(e){console.error(e)}return r}
  const clone=p=>JSON.parse(JSON.stringify(p));
  // jedna zmiana: kopia projektu po zmianie albo null, gdy nie dotyczy tego domu
  // stan wyjściowy liczony tak samo jak warianty (ocieplenie zawsze przeliczone na U i ceny)
  function prep(project){const p=clone(project);if(p.envelope&&global.HouserEnvelope)HouserEnvelope.apply(p,{...HouserEnvelope.DEF,...p.envelope});p.openingVariants=p.openingVariants||{};for(const f of Object.keys(p.openings||{}))p.openingVariants[f]=p.openingVariants[f]||{};return p}
  function variant(project,ch){const p=prep(project);if(!ch.run(p))return null;return p}
  global.HouserSavings={CHANGES,measure,variant,prep,YEARS:15};
})(window);
