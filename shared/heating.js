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
      {k:'coal',name:'Kocioł na ekogroszek',how:'kocioł z podajnikiem ślimakowym i zasobnikiem węgla, komin, skład opału w kotłowni',
       invest:20000+(chimney?0:7000)+1500,perKWh:S.pCoal/1000/7.5/.85,fixed:0,service:700,comfort:5,pros:['tani opał','kocioł sam podaje węgiel przez 2–4 dni'],cons:['uchwały antysmogowe w wielu województwach ograniczają lub zakazują palenia węglem – sprawdź swoją gminę','brak dotacji, a w nowych domach to wybór coraz rzadszy','dosypywanie opału, codzienne wynoszenie popiołu, czyszczenie kotła i komina','potrzebna kotłownia z kominem i miejsce na ok. 3–4 t opału']},
      {k:'wood',name:'Kocioł zgazowujący drewno + bufor',how:'kocioł zgazowujący z buforem ciepła (zbiornik 1–2 m³), komin, skład drewna; latem ciepłą wodę grzeje grzałka',
       invest:22000+7000+(chimney?0:7000),perKWh:S.pWood/S.woodKWh/.85,fixed:0,service:500,comfort:3,pros:['najtańsze paliwo (zwłaszcza własne drewno)','niezależność od prądu i gazu'],cons:['palenie codziennie w sezonie','kotłownia z buforem i duży skład drewna','praca przy drewnie i popiele','latem ciepła woda z prądu']},
      {k:'electric',name:'Ogrzewanie elektryczne',how:'maty grzewcze lub grzejniki elektryczne + podgrzewacz wody',
       invest:Math.max(10000,load*900+3000),perKWh:pEl,fixed:0,service:0,comfort:10,pros:['najtańsze w instalacji','zero obsługi i serwisu'],cons:['najdroższe rachunki – ma sens tylko w domu pasywnym albo z dużą fotowoltaiką']},
      {k:'fireplace_water',name:'Kominek z płaszczem wodnym',how:'kominek z wkładem z płaszczem wodnym w salonie, podłączony do bufora ciepła – grzeje cały dom i wodę; latem wodę grzeje grzałka',
       invest:22000+6000+(chimney?0:7000),perKWh:null,fixed:0,service:400,comfort:3,pros:['ogień w salonie i ciepło w całym domu','tanie paliwo (drewno)','niezależność od gazu, a przy braku prądu – od pompy obiegowej z UPS'],cons:['palenie codziennie w sezonie – gdy nikt nie pali, dom stygnie','potrzebny bufor ciepła i drugie źródło na wyjazdy (grzałka, pompa ciepła)','noszenie drewna do salonu i sprzątanie popiołu','latem ciepła woda z prądu']},
      {k:'hp_fire',name:'Pompa ciepła + kominek',how:'pompa ciepła powietrze–woda i kominek z wkładem w salonie, który dogrzewa część domu',
       invest:hpInvest+18000+(chimney?0:7000),perKWh:null,fixed:0,service:450,comfort:9,pros:['klimat „żywego ognia” w salonie','kominek obniża rachunki w mrozy','ogrzewanie działa też przy braku prądu (kominek)'],cons:['kominek to dodatkowy koszt i komin','noszenie drewna i sprzątanie']},
    ];
    const f=Math.max(0,Math.min(.8,(S.fireShare??25)/100));
    for(const m of list){m.rate=m.perKWh; // koszt 1 kWh ciepła z tego źródła (bez założeń o ciepłej wodzie latem)
      if(m.k==='wood'){const wood=S.pWood/S.woodKWh/.85;m.rate=wood;m.fuel=E.Qh*wood+E.Qw*(.5*wood+.5*pEl);m.perKWh=m.fuel/Math.max(1,Q)}else if(m.k==='fireplace_water'){const wood=S.pWood/S.woodKWh/.75;m.rate=wood;m.fuel=E.Qh*wood+E.Qw*(.5*wood+.5*pEl);m.perKWh=m.fuel/Math.max(1,Q)}else if(m.k==='hp_fire'){const wood=S.pWood/S.woodKWh/.78,hp=pEl/scopAir;m.fuel=E.Qh*f*wood+(E.Qh*(1-f)+E.Qw)*hp;m.perKWh=m.fuel/Math.max(1,Q)}else m.fuel=Q*m.perKWh;
      m.year=m.fuel+m.fixed+m.service;m.total=m.invest+years*m.year;
      // dopasowanie do tego domu 0–10
      let fit=6;const why=[];const add=(d,t)=>{fit+=d;why.push({d,t})};
      if(m.k==='hp_air'){if(EU<=70)add(2,'dom energooszczędny ('+Math.round(EU)+' kWh/m²) – pompa pracuje wydajnie');else add(-1,'duże zapotrzebowanie ('+Math.round(EU)+' kWh/m²) – pompa będzie pracować ciężko w mrozy');
        if(floor)add(1,'ogrzewanie podłogowe – niska temperatura wody, wysoka sprawność');else add(-1,'grzejniki wymagają cieplejszej wody – niższa sprawność');
        if(set.pv==='yes')add(1,'fotowoltaika obniża koszt prądu')}
      if(m.k==='hp_ground'){if(load<5)add(-2,'mała moc domu ('+load.toFixed(1)+' kW) – odwierty się nie opłacą');else if(load>9)add(1.5,'duża moc – wysoka sprawność gruntu się opłaca');if(floor)add(1,'podłogówka – idealna do pompy gruntowej');add(-1,'potrzebne miejsce na działce na odwierty lub kolektor')}
      if(m.k==='gas'){if(set.gas==='no')add(-6,'brak gazu w ulicy');else if(set.gas==='unknown')add(-1,'nie wiadomo, czy jest gaz w ulicy');else add(1,'gaz jest w ulicy');if(EU<=40)add(-1,'przy małym zapotrzebowaniu opłaty stałe za gaz są dużą częścią rachunku')}
      if(m.k==='pellet'||m.k==='wood'||m.k==='coal'){if(!utility)add(-3,'brak kotłowni (pomieszczenia technicznego)');else if(utilA<6)add(-1.5,'kotłownia '+utilA.toFixed(1)+' m² – mało miejsca na kocioł'+(m.k==='wood'?', bufor':'')+' i opał');else add(.5,'jest kotłownia '+utilA.toFixed(1)+' m²');
        if(!chimney)add(-1,'w projekcie nie ma komina – trzeba go dobudować');else add(.5,'komin jest w projekcie');
        if(EU<=40)add(-1.5,'dom energooszczędny – kocioł na paliwo stałe będzie przewymiarowany');
        if(m.k==='wood')add(-1,'wymaga codziennej obsługi');
        if(m.k==='coal')add(-1.5,'paliwo kopalne – uchwały antysmogowe i odchodzenie od węgla (ryzyko zakazu w przyszłości)')}
      if(m.k==='fireplace_water'){if(!chimney)add(-1,'w projekcie nie ma komina – trzeba go dobudować przy kominku');else add(.5,'komin jest w projekcie');
        if(!q.rooms.some(r=>/salon|dzienn/i.test(r.name||'')))add(-1,'brak salonu, w którym stałby kominek');
        if(!utility)add(-1,'brak pomieszczenia technicznego na bufor ciepła');
        if(EU<=40)add(-1.5,'dom energooszczędny – kominek łatwo przegrzeje salon, a instalacja wodna jest przewymiarowana');else if(EU>70)add(.5,'duże zapotrzebowanie – kominek odda dużo ciepła do całego domu');
        add(-1,'wymaga codziennego palenia w sezonie')}
      if(m.k==='electric'){if(EU<=25)add(3,'dom prawie pasywny – prąd wystarczy');else if(EU<=45)add(-1,'przy tym zapotrzebowaniu rachunki będą wysokie');else add(-4,'przy '+Math.round(EU)+' kWh/m² rachunki za prąd będą bardzo wysokie');if(set.pv==='yes')add(1,'fotowoltaika pomaga')}
      if(m.k==='hp_fire'){if(EU<=70)add(1.5,'dom energooszczędny – pompa pracuje wydajnie');if(floor)add(.5,'podłogówka');if(!chimney)add(-1,'trzeba dobudować komin do kominka');else add(.5,'komin jest w projekcie')}
      m.fit=Math.max(0,Math.min(10,Math.round(fit*10)/10));m.why=why}
    for(const m of list)if(m.rate==null)m.rate=m.perKWh;
    const ok=list.filter(m=>m.fit>=3),minT=Math.min(...ok.map(m=>m.total));
    for(const m of list)m.score=Math.round((.5*m.fit+.3*10*Math.min(1,minT/m.total)+.2*m.comfort)*10)/10;
    const best=[...list].sort((a,b)=>b.score-a.score)[0],cheapest=[...ok].sort((a,b)=>a.total-b.total)[0];
    return {set,E,list,best,cheapest,years,load,EU,Q,utility,chimney,pEl};
  }
  global.HouserHeating={DEF,compare};
})(window);
