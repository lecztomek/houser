// Codzienność – „Dom dla domowników”: to, czego nie widać w trasach po domu.
// HouserDailyHouse.check(project, ctx) -> {score, verdict, groups:[{id, name, desc, score, items:[{st, text, tip}], legs?, table?}]}
// ctx podaje silnik trasy (modules/codziennosc/engine.js): model M, role pomieszczeń, łazienki, sypialnie, wyszukiwanie tras.
// Grupy: łazienki i WC, sypialnie dla domowników, wielkości i proporcje pokoi, układ pomieszczeń, strony świata.
// Powierzchnie użytkowe (pod skosem liczone jak w Wycenie) – z HouserQuantities, jeśli jest wczytany.
(function(global){
'use strict';
const clamp=v=>Math.max(0,Math.min(10,v));
const r1=v=>Math.round(v*10)/10;
const verdict=s=>s>=7.5?'ok':s>=5?'warn':'bad';
const DIRS=['north','east','south','west'];
const DIR_PL={north:'północ',east:'wschód',south:'południe',west:'zachód'};

// zalecane (wygodne) powierzchnie użytkowe [m²] – poniżej „warn”, poniżej min – „bad”
const SIZE={
  master:{min:10,ok:12,name:'sypialnię główną'},
  bedroom:{min:8,ok:9,name:'pokój do spania'},
  bath:{min:3,ok:4,name:'łazienkę'},
  wc:{min:1,ok:1.2,name:'WC'},
  kitchen:{min:5,ok:7,name:'kuchnię'},
  entrance:{min:2,ok:3,name:'wiatrołap'},
  wardrobe:{min:1.5,ok:2.5,name:'garderobę'},
  laundry:{min:2,ok:3,name:'pralnię'},
  study:{min:6,ok:7,name:'gabinet'}
};

function check(project,X){
  const {M,has,list,bedrooms,baths,master,front,bathRoute,anchor,route,src,AV,leg,fmt}=X;
  const W=M.W,c=M.c,N=M.N;
  const es=project.energySettings||{};
  const persons=Number.isFinite(+es.persons)&&+es.persons>0?+es.persons:Math.max(2,bedrooms.length+1);
  // powierzchnia użytkowa pokoju (skosy) – z Wyceny, inaczej z kratek
  let Q=null;try{if(global.HouserQuantities)Q=HouserQuantities.compute(project)}catch(_){}
  const qBy={};if(Q)for(const r of Q.rooms||[])qBy[r.f+'|'+r.id]=r;
  const area=r=>{const q=qBy[r.key];return q&&q.usable>0?q.usable:r.area};
  // wymiary: obrys kratek pokoju (szerokość = krótszy bok; przy kształcie L – powierzchnia / dłuższy bok)
  const dims=r=>{let x0=1e9,y0=1e9,x1=-1,y1=-1;for(const i of r.cells){const x=i%W,y=i/W|0;x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y)}
    const a=(x1-x0+1)*c,b=(y1-y0+1)*c,L=Math.max(a,b),fill=r.cells.length*c*c/(a*b);return {L,S:fill>.85?Math.min(a,b):r.cells.length*c*c/L,fill}};
  const groups=[];
  const G=(id,name,desc)=>{const g={id,name,desc,items:[],pen:0};groups.push(g);return g};
  const add=(g,st,p,text,tip)=>{g.items.push({st,text,tip:tip||''});g.pen+=p||0};
  const lo=list.filter(r=>r.fi===0),fl=[...new Set(list.map(r=>r.fi))].sort();
  const full=baths.filter(b=>has(b,'bath')),wcOnly=baths.filter(b=>!has(b,'bath'));

  // ---------- 1. łazienki i WC
  {const g=G('lazienki','Łazienki i WC','Ile łazienek i WC na liczbę domowników, czy każda kondygnacja z sypialniami ma swoją łazienkę, najbliższa łazienka z każdego pokoju.');
    const perFl=fl.map(fi=>({fi,beds:bedrooms.filter(b=>b.fi===fi),full:full.filter(b=>b.fi===fi),wc:wcOnly.filter(b=>b.fi===fi),day:list.some(r=>r.fi===fi&&(has(r,'living')||has(r,'kitchen')))}));
    add(g,'info',0,'{n} os., {n} sypialni: łazienek {n}, osobnych WC {n}.'.replace('{n}',persons).replace('{n}',bedrooms.length).replace('{n}',full.length).replace('{n}',wcOnly.length));
    for(const F_ of perFl)if(F_.full.length||F_.wc.length||F_.beds.length)add(g,'info',0,M.floorName(F_.fi)+': '+[F_.beds.length?F_.beds.length+' syp.':'',F_.full.length?F_.full.length+' łaz.':'',F_.wc.length?F_.wc.length+' WC':''].filter(Boolean).join(', ')+(F_.full.length+F_.wc.length?'':' – bez łazienki i WC'));
    if(!baths.length)add(g,'bad',10,'Na rzucie nie ma łazienki ani WC.','Dodaj łazienkę przy sypialniach.');
    else{
      if(!full.length)add(g,'bad',4,'W domu nie ma pełnej łazienki (tylko WC).','Dodaj łazienkę z prysznicem lub wanną.');
      for(const F_ of perFl){if(!F_.beds.length)continue;
        if(!F_.full.length&&!F_.wc.length)add(g,'bad',4.5,'Na kondygnacji „{q}” są sypialnie ({n}), ale nie ma łazienki ani WC – w nocy trzeba schodzić po schodach.'.replace('{q}',M.floorName(F_.fi)).replace('{n}',F_.beds.length),'Dodaj łazienkę (choćby WC z umywalką) na kondygnacji sypialni.');
        else if(!F_.full.length)add(g,'warn',1.5,'Na kondygnacji „{q}” przy sypialniach jest tylko WC – kąpiel na innym piętrze.'.replace('{q}',M.floorName(F_.fi)),'Zamień WC przy sypialniach na łazienkę z prysznicem.')}
      for(const F_ of perFl)if(F_.day&&!F_.full.length&&!F_.wc.length)add(g,'warn',1.5,'Przy salonie i kuchni ({q}) nie ma WC – w ciągu dnia i dla gości trzeba iść na inne piętro.'.replace('{q}',M.floorName(F_.fi)),'Dodaj WC na kondygnacji dziennej, najlepiej przy wejściu.');
      // poranna kolejka: osoby na wspólną łazienkę (łazienka przy sypialni – tylko jej mieszkańcy)
      const shared=full.filter(b=>!b.ensuite).length,ens=full.filter(b=>b.ensuite);
      const ensP=ens.reduce((a,b)=>a+[...b.owners].reduce((n,k)=>n+(bedrooms.find(x=>x.key===k&&has(x,'master'))?2:1),0),0);
      const rest=Math.max(0,persons-ensP),pp=shared?rest/shared:(rest?99:0);
      if(full.length){if(pp>4)add(g,'bad',2.5,'Na jedną wspólną łazienkę przypada ok. {n} osób – rano kolejka.'.replace('{n}',fmt(pp)),'Dodaj drugą łazienkę albo łazienkę przy sypialni głównej.');
        else if(pp>3)add(g,'warn',1.2,'Na jedną wspólną łazienkę przypada ok. {n} osób – rano bywa ciasno.'.replace('{n}',fmt(pp)),'Dodaj drugą łazienkę albo łazienkę przy sypialni głównej.');
        else add(g,'ok',0,'Ok. {n} os. na wspólną łazienkę – bez porannej kolejki.'.replace('{n}',fmt(pp)))}
      if(baths.length===1&&persons>=3)add(g,'warn',1.5,'Jedna toaleta na cały dom – gdy ktoś się kąpie, reszta czeka.','Osobne WC (choćby 1,2 m²) odciąży łazienkę.');
      else if(bedrooms.length>=4&&baths.length<3)add(g,'warn',.7,'Przy {n} sypialniach przyda się trzecia toaleta (łazienka przy sypialni głównej albo WC).'.replace('{n}',bedrooms.length),'');
      // najbliższa łazienka z każdego pokoju (trasy na rzucie)
      const rooms_=list.filter(r=>has(r,'bedroom')||has(r,'living')||has(r,'kitchen')||has(r,'study'));const pub=baths.filter(b=>!b.ensuite);
      g.table=[];g.legs=[];let far=null;
      for(const r of rooms_){const isBed=has(r,'bedroom');
        const rr=isBed?bathRoute(r,anchor(r,'bed'),{priv:8,living:3}):pub.length?route(M,src(r.center),pub.map(b=>b.center),{avoid:AV({priv:8,except:new Set(pub.map(b=>b.key))})}):null;
        g.table.push({room:r.name,floor:M.floorName(r.fi),to:rr?.end?.room?.name||null,dist:rr?rr.dist:null,floors:rr?rr.floors:null,bed:isBed,li:rr?g.legs.length:null});
        if(rr)g.legs.push(leg(r.name,rr.end.room.name,rr));
        if(rr&&isBed&&(!far||rr.dist+8*rr.floors>far.dist+8*far.floors))far={...rr,name:r.name}}
      if(far&&far.dist>10&&!far.floors)add(g,'warn',Math.min(1.5,(far.dist-10)/4),'Z pokoju „{q}” do łazienki aż {n} m.'.replace('{q}',far.name).replace('{n}',fmt(far.dist)),'Zbliż łazienkę do sypialni.')}}

  // ---------- 2. sypialnie dla domowników
  {const g=G('sypialnie','Sypialnie dla domowników','Czy każdy ma swój pokój: para w sypialni głównej, dziecko lub inny domownik – osobny pokój; pokój zapasowy dla gości lub do pracy.');
    const need=persons<=2?1:persons-1,n=bedrooms.length;
    if(!n)add(g,'bad',8,'Na rzucie nie ma sypialni.','Nazwij pomieszczenia do spania „Sypialnia” albo „Pokój”.');
    else if(n<need)add(g,'bad',Math.min(5,2*(need-n)),'Dla {n} osób potrzeba ok. {n} sypialni (para + osobny pokój dla każdego), jest {n}.'.replace('{n}',persons).replace('{n}',need).replace('{n}',n),'Dodaj pokój albo zmień liczbę domowników w module Energia.');
    else if(n===need)add(g,'ok',0,'{n} sypialni na {n} os. – każdy ma swój pokój.'.replace('{n}',n).replace('{n}',persons));
    else add(g,'ok',0,'{n} sypialni na {n} os. – jest pokój zapasowy (goście, praca, hobby).'.replace('{n}',n).replace('{n}',persons));
    if(n&&!master&&n>1)add(g,'info',0,'Nie rozpoznano sypialni głównej – przyjmuję największą.','');
    // pokój z łazienką na parterze, gdy sypialnie są na górze (goście, starsi rodzice, po kontuzji)
    if(fl.length>1&&bedrooms.some(b=>b.fi>0)){const gr=lo.filter(r=>has(r,'bedroom')||has(r,'study')),gb=full.filter(b=>b.fi===0&&!b.ensuite);
      if(gr.length&&gb.length)add(g,'ok',0,'Na parterze jest pokój „{q}” i łazienka – dla gości, starszych rodziców albo gdy ktoś nie może chodzić po schodach.'.replace('{q}',gr[0].name));
      else if(gr.length)add(g,'warn',.5,'Na parterze jest pokój „{q}”, ale bez łazienki z prysznicem – gość albo ktoś po kontuzji musi chodzić na górę.'.replace('{q}',gr[0].name),'Zaplanuj prysznic w łazience lub WC na parterze.');
      else add(g,'warn',1,'Wszystkie pokoje są na piętrze – na parterze nie ma gdzie przenocować gościa ani zamieszkać, gdy ktoś nie może chodzić po schodach.','Zaplanuj na parterze pokój (gabinet / pokój gościnny) przy łazience.')}}

  // ---------- 3. wielkości i proporcje pokoi
  {const g=G('wielkosci','Wielkości i proporcje pokoi','Czy pokoje mają wygodną powierzchnię i kształt: salon na liczbę domowników, sypialnie, łazienki, kuchnia; za wąskie i długie pokoje; ile domu zajmują korytarze.');
    const day=list.filter(r=>has(r,'living')||has(r,'dining')),dayA=day.reduce((a,r)=>a+area(r),0),kit=list.filter(r=>has(r,'kitchen'));
    // salon (z jadalnią i kuchnią otwartą – liczone razem)
    const openK=kit.filter(k=>day.includes(k)||day.some(d=>k.nb.get(d.key)==='opening')),needDay=14+3*persons+(openK.length?6:0);
    const dA=dayA+openK.filter(k=>!day.includes(k)).reduce((a,r)=>a+area(r),0);
    if(day.length){if(dA<needDay*.75)add(g,'bad',2,'Strefa dzienna (salon{q}) ma {n} m² – dla {n} os. wygodnie ok. {n} m².'.replace('{q}',openK.length?' z kuchnią':'').replace('{n}',fmt(dA)).replace('{n}',persons).replace('{n}',Math.round(needDay)),'Powiększ salon kosztem korytarza albo połącz go z jadalnią.');
      else if(dA<needDay)add(g,'warn',.8,'Strefa dzienna (salon{q}) ma {n} m² – dla {n} os. wygodnie ok. {n} m².'.replace('{q}',openK.length?' z kuchnią':'').replace('{n}',fmt(dA)).replace('{n}',persons).replace('{n}',Math.round(needDay)),'Powiększ salon kosztem korytarza albo połącz go z jadalnią.');
      else add(g,'ok',0,'Strefa dzienna {n} m² – wygodnie dla {n} os.'.replace('{n}',fmt(dA)).replace('{n}',persons))}
    else add(g,'warn',1,'Nie rozpoznano salonu – nazwij pomieszczenie „Salon” albo „Pokój dzienny”.','');
    // pozostałe pokoje wg roli
    const roleOf=r=>has(r,'bath')?'bath':has(r,'wc')?'wc':has(r,'kitchen')&&!day.includes(r)&&!openK.includes(r)?'kitchen':r===master?'master':has(r,'bedroom')?'bedroom':has(r,'entrance')?'entrance':has(r,'wardrobe')?'wardrobe':has(r,'laundry')?'laundry':has(r,'study')?'study':null;
    let small=0;
    for(const r of list){const k=roleOf(r);if(!k)continue;const S=SIZE[k],a=area(r);
      if(a<S.min){small++;add(g,'bad',Math.min(1.5,.6+(S.min-a)/2),'„{q}” ma {n} m² – za mało na {q} (wygodnie od {n} m²).'.replace('{q}',r.name).replace('{n}',fmt(a)).replace('{q}',S.name).replace('{n}',fmt(S.ok)),k==='bath'?'Łazienka poniżej 3 m² mieści tylko prysznic, umywalkę i WC – powiększ ją, jeśli ma być wanna.':'Powiększ pomieszczenie kosztem korytarza lub sąsiedniego pokoju.')}
      else if(a<S.ok){small++;add(g,'warn',.4,'„{q}” ma {n} m² – ciasno jak na {q} (wygodnie od {n} m²).'.replace('{q}',r.name).replace('{n}',fmt(a)).replace('{q}',S.name).replace('{n}',fmt(S.ok)),'')}}
    if(!small)add(g,'ok',0,'Sypialnie, łazienki i pomieszczenia pomocnicze mają wygodną wielkość.');
    // kształt: za wąskie i za długie pokoje
    for(const r of list){const bed=has(r,'bedroom'),liv=has(r,'living');if(!bed&&!liv)continue;const d=dims(r);
      const minW=liv?3.3:2.6,okW=liv?3.6:2.9;
      if(d.S<minW)add(g,'bad',1,'„{q}” ma tylko ok. {n} m szerokości – trudno ustawić łóżko lub kanapę i przejść obok.'.replace('{q}',r.name).replace('{n}',fmt(d.S)),'Poszerz pokój (pokój do spania co najmniej 2,7–3 m).');
      else if(d.S<okW)add(g,'warn',.3,'„{q}” ma ok. {n} m szerokości – ciasno przy ustawianiu mebli.'.replace('{q}',r.name).replace('{n}',fmt(d.S)),'');
      if(d.L/d.S>2.3&&d.fill>.85)add(g,'warn',.5,'„{q}” jest długi i wąski ({n} × {n} m) – jak korytarz, trudno go umeblować.'.replace('{q}',r.name).replace('{n}',fmt(d.L)).replace('{n}',fmt(d.S)),'Najwygodniejsze są pokoje o proporcjach do ok. 1 : 1,5.')}
    // korytarze
    const tot=list.filter(r=>!has(r,'garage')).reduce((a,r)=>a+area(r),0),hallA=list.filter(r=>has(r,'hall')||has(r,'entrance')).reduce((a,r)=>a+area(r),0),sh=tot?hallA/tot:0;
    if(sh>.2)add(g,'warn',Math.min(1.5,(sh-.2)*10+.5),'Korytarze, hole i wiatrołap to {n}% domu – dużo powierzchni, która tylko łączy pokoje.'.replace('{n}',Math.round(sh*100)),'Skróć korytarze – połącz hol ze strefą dzienną albo przesuń drzwi bliżej siebie.');
    else if(tot)add(g,'ok',0,'Korytarze i hole to {n}% domu – mało straconego miejsca.'.replace('{n}',Math.round(sh*100)))}

  // ---------- 4. układ pomieszczeń
  {const g=G('uklad','Układ pomieszczeń','Strefa dzienna i nocna, pokoje przechodnie, drzwi do łazienki z kuchni lub salonu, wejście do domu, kuchnia przy jadalni.');
    const rooms=M.rooms||{},byKey=k=>list.find(r=>r.key===k);
    const dayRoom=r=>has(r,'living')||has(r,'dining')||has(r,'kitchen');
    let bad=0;
    // sypialnia z drzwiami prosto ze strefy dziennej
    for(const b of bedrooms){const d=[...b.nb.keys()].map(byKey).filter(x=>x&&dayRoom(x));
      if(d.length){bad++;add(g,'warn',.6,'Do pokoju „{q}” wchodzi się prosto ze strefy dziennej („{q}”) – hałas i mało prywatności.'.replace('{q}',b.name).replace('{q}',d[0].name),'Wejście do sypialni z holu oddziela strefę nocną od dziennej.')}}
    // pokój przechodni: z sypialni do innego pomieszczenia (poza łazienką i garderobą tej sypialni)
    for(const b of bedrooms){const other=[...b.nb.keys()].map(byKey).filter(x=>x&&!((has(x,'bath')||has(x,'wc'))&&x.ensuite)&&!has(x,'wardrobe')&&!has(x,'stairs'));
      if(other.length>=2&&other.some(x=>has(x,'bedroom')||dayRoom(x)||has(x,'study'))){bad++;add(g,'warn',1,'„{q}” jest pokojem przechodnim – prowadzi do „{q}”.'.replace('{q}',b.name).replace('{q}',other.find(x=>has(x,'bedroom')||dayRoom(x)||has(x,'study')).name),'Daj osobne wejście z holu do każdego pokoju.')}}
    // łazienka / WC z drzwiami z kuchni lub salonu
    for(const t of baths){if(t.ensuite)continue;const d=[...t.nb.keys()].map(byKey).filter(x=>x&&dayRoom(x));
      if(d.length){bad++;add(g,'warn',.6,'Drzwi do „{q}” prowadzą prosto z „{q}” – przy stole i kanapie słychać i widać toaletę.'.replace('{q}',t.name).replace('{q}',d[0].name),'Wejście do łazienki i WC z holu albo wiatrołapu.')}}
    // wejście do domu
    const fr=front.map(e=>e.room);
    if(fr.length&&fr.every(r=>dayRoom(r))){bad++;add(g,'warn',.8,'Drzwi wejściowe prowadzą prosto do „{q}” – brak strefy na kurtki i buty.'.replace('{q}',fr[0].name),'Wydziel wiatrołap lub hol przy wejściu.')}
    else if(fr.some(r=>has(r,'entrance')))add(g,'ok',0,'Wejście przez wiatrołap – miejsce na kurtki i buty.');
    // kuchnia przy jadalni / salonie
    const kit=list.filter(r=>has(r,'kitchen'));
    for(const k of kit){const dayNb=[...k.nb.keys()].map(byKey).filter(x=>x&&(has(x,'living')||has(x,'dining')));
      if(!dayNb.length&&!has(k,'living')&&!has(k,'dining')){bad++;add(g,'warn',.8,'Kuchnia „{q}” nie łączy się bezpośrednio z jadalnią ani salonem.'.replace('{q}',k.name),'Połącz kuchnię z jadalnią drzwiami albo otwartym przejściem.')}}
    // sypialnie zebrane razem (strefa nocna) – na tej samej kondygnacji
    if(!bad)add(g,'ok',0,'Układ czytelny: sypialnie z holu, toalety poza strefą dzienną, kuchnia przy jadalni.');}

  // ---------- 5. strony świata (okna pokoi)
  {const g=G('strony','Strony świata','Gdzie wychodzą okna: salon najlepiej na południe lub zachód (słońce po południu), sypialnie na wschód lub północ (chłodniej w nocy), kuchnia może być od północy.');
    const top=project.orientation?.top||'north',ti=Math.max(0,DIRS.indexOf(top));
    const side=s=>DIRS[(ti+({top:0,right:1,bottom:2,left:3}[s]))%4];
    const winDirs=r=>{const O=M.openings[r.fi]||{},out=new Set();const occ=(x,y)=>x>=0&&y>=0&&x<W&&y<M.H&&(M.cellRoom[r.fi*N+y*W+x]||M.holes[r.fi].has(y*W+x));
      for(const i of r.cells){const x=i%W,y=i/W|0;
        for(const [dx,dy,key,s] of [[0,-1,'h:'+x+':'+y,'top'],[0,1,'h:'+x+':'+(y+1),'bottom'],[-1,0,'v:'+x+':'+y,'left'],[1,0,'v:'+(x+1)+':'+y,'right']]){
          const t=O[key];if((t==='window'||t==='hst')&&!occ(x+dx,y+dy))out.add(side(s))}}
      return [...out]};
    const liv=list.filter(r=>has(r,'living'));
    for(const r of liv){const d=winDirs(r);if(!d.length){add(g,'bad',1.5,'Salon „{q}” nie ma okien na zewnątrz.'.replace('{q}',r.name),'Dodaj okna lub drzwi tarasowe w salonie.');continue}
      const txt=d.map(x=>DIR_PL[x]).join(', ');
      if(d.includes('south')||d.includes('west'))add(g,'ok',0,'Salon „{q}” ma okna na: {q} – dużo słońca w strefie dziennej.'.replace('{q}',r.name).replace('{q}',txt));
      else add(g,'warn',1.2,'Salon „{q}” ma okna tylko na: {q} – mało słońca w strefie dziennej.'.replace('{q}',r.name).replace('{q}',txt),'Obróć dom (moduł Układ pomieszczeń – orientacja) albo dodaj okno salonu od południa lub zachodu.')}
    let westB=[];for(const b of bedrooms){const d=winDirs(b);if(d.length&&d.every(x=>x==='west'))westB.push(b.name)}
    if(westB.length)add(g,'warn',Math.min(1,.4*westB.length),'Sypialnie z oknami tylko na zachód ({q}) – latem nagrzewają się przed snem.'.replace('{q}',westB.join(', ')),'Rolety zewnętrzne albo sypialnie od wschodu lub północy.');
    else if(bedrooms.length)add(g,'ok',0,'Żadna sypialnia nie ma okien tylko na zachód – wieczorem nie nagrzewają się od słońca.');
    const kit=list.filter(r=>has(r,'kitchen')&&!has(r,'living'));for(const k of kit){const d=winDirs(k);if(d.length===1&&d[0]==='south')add(g,'info',0,'Kuchnia „{q}” od południa – latem bywa w niej gorąco.'.replace('{q}',k.name),'')}}

  for(const g of groups){g.score=r1(clamp(10-g.pen));g.verdict=verdict(g.score);g.hints=[...new Set(g.items.filter(i=>i.tip&&i.st!=='ok').map(i=>i.tip))];
    g.lead=(g.items.find(i=>i.st==='bad')||g.items.find(i=>i.st==='warn')||{}).text||null}
  const WG={lazienki:1.5,sypialnie:1,wielkosci:1,uklad:1,strony:.6};
  const ws=groups.reduce((a,g)=>a+(WG[g.id]||1),0),score=r1(groups.reduce((a,g)=>a+g.score*(WG[g.id]||1),0)/ws);
  return {score,verdict:verdict(score),groups,persons};
}
global.HouserDailyHouse={check,SIZE};
})(window);
