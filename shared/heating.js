// Ogrzewanie – porównanie źródeł ciepła dla konkretnego domu: koszt instalacji, koszt roczny, koszt w N lat,
// wygoda obsługi i dopasowanie do domu (zapotrzebowanie, moc, kotłownia, komin, gaz, podłogówka).
// HouserHeating.compare(project, settings) -> {list, best, E, years, …}. Wymaga shared/quantities.js i shared/energy.js.
(function(global){
  const DEF={gas:'unknown',emitters:'floor',pv:'no',years:20};
  function compare(project,settings){
    const set={...DEF,...(settings||{})},years=+set.years||20;
    const E=HouserEnergy.compute(project),S=E.s,q=E.q;
    const Q=E.Qh+E.Qw,load=E.load,EU=E.EU;
    const floor=set.emitters==='floor',pvK=set.pv==='yes'?.6:1,pEl=S.pEl*pvK;
    const utility=q.rooms.find(r=>/techn|kotłown|kotlown|kotł|kotl/i.test(r.name||'')),utilA=utility?.area||0;
    const chimney=q.chimneys>0;
    const hpInvest=load<=6?32000:load<=9?38000:load<=12?45000:55000;
    const scopAir=S.scop*(floor?1:.85),scopGnd=4.6*(floor?1:.88);
    const list=[
      {k:'hp_air',name:'Pompa ciepła powietrze–woda',how:'jednostka zewnętrzna + moduł wewnętrzny i zasobnik ciepłej wody; najczęstszy wybór w nowych domach',
       invest:hpInvest,perKWh:pEl/scopAir,fixed:0,service:300,comfort:10,pros:['bez komina i kotłowni','pełna automatyka','latem może lekko chłodzić podłogą','dotacje (Moje Ciepło, Czyste Powietrze)'],cons:['jednostka zewnętrzna szumi – trzeba jej dobrać miejsce','przy dużych mrozach sprawność spada']},
      {k:'hp_ground',name:'Pompa ciepła gruntowa',how:'odwierty lub kolektor poziomy w ogrodzie; najwyższa sprawność przez cały rok',
       invest:25000+load*7500,perKWh:pEl/scopGnd,fixed:0,service:200,comfort:10,pros:['najniższe rachunki','cicha – nic nie stoi na zewnątrz','pasywne chłodzenie latem'],cons:['drogie odwierty (ok. 7–8 tys. zł za kW)','potrzebne miejsce na działce i zgoda na odwierty']},
      {k:'gas',name:'Kocioł gazowy kondensacyjny',how:'kocioł ścienny z zasobnikiem, przewód spalinowy przez dach lub ścianę',
       invest:15000+(set.gas==='yes'?9000:set.gas==='unknown'?9000:0)+3000,perKWh:S.pGas/.95,fixed:480,service:350,comfort:9,pros:['tani w zakupie','mały, mieści się w kuchni lub łazience','pełna automatyka'],cons:['potrzebne przyłącze gazu (ok. 9 tys. zł + opłaty stałe)','od 2029 w UE odchodzi się od kotłów na paliwa kopalne']},
      {k:'pellet',name:'Kocioł na pellet',how:'kocioł z podajnikiem i zasobnikiem pelletu, komin, miejsce na zapas worków',
       invest:28000+(chimney?0:7000)+2000,perKWh:S.pPel/1000/4.8/.88,fixed:0,service:600,comfort:6,pros:['tanie paliwo','kocioł sam podaje pellet przez kilka dni'],cons:['dosypywanie pelletu co kilka dni i wynoszenie popiołu','potrzebna kotłownia z kominem i miejsce na ok. 3–5 t pelletu','czyszczenie kotła i komina']},
      {k:'wood',name:'Kocioł zgazowujący drewno + bufor',how:'kocioł zgazowujący z buforem ciepła (zbiornik 1–2 m³), komin, skład drewna',
       invest:22000+7000+(chimney?0:7000),perKWh:S.pWood/S.woodKWh/.85,fixed:0,service:500,comfort:3,pros:['najtańsze paliwo (zwłaszcza własne drewno)','niezależność od prądu i gazu'],cons:['palenie codziennie w sezonie','kotłownia z buforem i duży skład drewna','praca przy drewnie i popiele']},
      {k:'electric',name:'Ogrzewanie elektryczne',how:'maty grzewcze lub grzejniki elektryczne + podgrzewacz wody',
       invest:Math.max(10000,load*900+3000),perKWh:pEl,fixed:0,service:0,comfort:10,pros:['najtańsze w instalacji','zero obsługi i serwisu'],cons:['najdroższe rachunki – ma sens tylko w domu pasywnym albo z dużą fotowoltaiką']},
      {k:'hp_fire',name:'Pompa ciepła + kominek',how:'pompa ciepła powietrze–woda i kominek z wkładem w salonie, który dogrzewa część domu',
       invest:hpInvest+18000+(chimney?0:7000),perKWh:null,fixed:0,service:450,comfort:9,pros:['klimat „żywego ognia” w salonie','kominek obniża rachunki w mrozy','ogrzewanie działa też przy braku prądu (kominek)'],cons:['kominek to dodatkowy koszt i komin','noszenie drewna i sprzątanie']},
    ];
    const f=Math.max(0,Math.min(.8,(S.fireShare??25)/100));
    for(const m of list){
      if(m.k==='hp_fire'){const wood=S.pWood/S.woodKWh/.78,hp=pEl/scopAir;m.fuel=E.Qh*f*wood+(E.Qh*(1-f)+E.Qw)*hp;m.perKWh=m.fuel/Math.max(1,Q)}else m.fuel=Q*m.perKWh;
      m.year=m.fuel+m.fixed+m.service;m.total=m.invest+years*m.year;
      // dopasowanie do tego domu 0–10
      let fit=6;const why=[];const add=(d,t)=>{fit+=d;why.push({d,t})};
      if(m.k==='hp_air'){if(EU<=70)add(2,'dom energooszczędny ('+Math.round(EU)+' kWh/m²) – pompa pracuje wydajnie');else add(-1,'duże zapotrzebowanie ('+Math.round(EU)+' kWh/m²) – pompa będzie pracować ciężko w mrozy');
        if(floor)add(1,'ogrzewanie podłogowe – niska temperatura wody, wysoka sprawność');else add(-1,'grzejniki wymagają cieplejszej wody – niższa sprawność');
        if(set.pv==='yes')add(1,'fotowoltaika obniża koszt prądu')}
      if(m.k==='hp_ground'){if(load<5)add(-2,'mała moc domu ('+load.toFixed(1)+' kW) – odwierty się nie opłacą');else if(load>9)add(1.5,'duża moc – wysoka sprawność gruntu się opłaca');if(floor)add(1,'podłogówka – idealna do pompy gruntowej');add(-1,'potrzebne miejsce na działce na odwierty lub kolektor')}
      if(m.k==='gas'){if(set.gas==='no')add(-6,'brak gazu w ulicy');else if(set.gas==='unknown')add(-1,'nie wiadomo, czy jest gaz w ulicy');else add(1,'gaz jest w ulicy');if(EU<=40)add(-1,'przy małym zapotrzebowaniu opłaty stałe za gaz są dużą częścią rachunku')}
      if(m.k==='pellet'||m.k==='wood'){if(!utility)add(-3,'brak kotłowni (pomieszczenia technicznego)');else if(utilA<6)add(-1.5,'kotłownia '+utilA.toFixed(1)+' m² – mało miejsca na kocioł'+(m.k==='wood'?', bufor':'')+' i opał');else add(.5,'jest kotłownia '+utilA.toFixed(1)+' m²');
        if(!chimney)add(-1,'w projekcie nie ma komina – trzeba go dobudować');else add(.5,'komin jest w projekcie');
        if(EU<=40)add(-1.5,'dom energooszczędny – kocioł na paliwo stałe będzie przewymiarowany');
        if(m.k==='wood')add(-1,'wymaga codziennej obsługi')}
      if(m.k==='electric'){if(EU<=25)add(3,'dom prawie pasywny – prąd wystarczy');else if(EU<=45)add(-1,'przy tym zapotrzebowaniu rachunki będą wysokie');else add(-4,'przy '+Math.round(EU)+' kWh/m² rachunki za prąd będą bardzo wysokie');if(set.pv==='yes')add(1,'fotowoltaika pomaga')}
      if(m.k==='hp_fire'){if(EU<=70)add(1.5,'dom energooszczędny – pompa pracuje wydajnie');if(floor)add(.5,'podłogówka');if(!chimney)add(-1,'trzeba dobudować komin do kominka');else add(.5,'komin jest w projekcie')}
      m.fit=Math.max(0,Math.min(10,Math.round(fit*10)/10));m.why=why}
    const ok=list.filter(m=>m.fit>=3),minT=Math.min(...ok.map(m=>m.total));
    for(const m of list)m.score=Math.round((.5*m.fit+.3*10*Math.min(1,minT/m.total)+.2*m.comfort)*10)/10;
    const best=[...list].sort((a,b)=>b.score-a.score)[0],cheapest=[...ok].sort((a,b)=>a.total-b.total)[0];
    return {set,E,list,best,cheapest,years,load,EU,Q,utility,chimney};
  }
  global.HouserHeating={DEF,compare};
})(window);
