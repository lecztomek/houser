// Wyposażenie domu w trzech częściach:
//  1) sprzęty – czy są w projekcie (lodówka, zmywarka, piekarnik, pralka, suszarka, zamrażarka): stoją w Meblowaniu albo w zabudowie,
//  2) ubrania – domownicy rozdzieleni na sypialnie, ubrania w szafach i komodach swojego pokoju (albo w garderobie) – czy się mieszczą,
//  3) rzeczy do schowania (odkurzacz, deska do prasowania, walizki, chemia…) – w którym meblu albo schowku leżą i czy się mieszczą.
// HouserEquip.evaluate(project) -> {appliances, clothes, items, places, issues, good, score, missing, placed, total, P}
// Ustawienia: project.equipment = {items:{[id]:{on, place}}, persons}
// Wymaga shared/quantities.js, modules/schowki/engine.js (rodzaje pomieszczeń), opcjonalnie shared/furniture.js (nazwy mebli).
(function(global){
  // sprzęty: slot – meble, w których stoją (zajmują miejsce na sprzęt); share – mieszczą się przy innym sprzęcie (okap nad płytą)
  const APPLIANCES=[
    {id:'fridge',name:'Lodówka',slot:['k_lodowka','k_wysokie'],big:true,tip:'Dodaj lodówkę (wolnostojącą) albo zabudowę wysoką z lodówką w Meblowaniu.'},
    {id:'dish',name:'Zmywarka',slot:['k_zlew','k_dolne','k_wyspa'],big:true,tip:'Zmywarka stoi w szafkach dolnych obok zlewu – dodaj szafki dolne.'},
    {id:'oven',name:'Płyta i piekarnik',slot:['k_plyta','k_dolne','k_wysokie'],big:true,tip:'Dodaj płytę z piekarnikiem albo szafki dolne / zabudowę wysoką.'},
    {id:'hood',name:'Okap',slot:['k_plyta','k_dolne','k_wyspa'],share:true},
    {id:'micro',name:'Mikrofalówka',slot:['k_wysokie','k_dolne','k_wyspa'],share:true},
    {id:'washer',name:'Pralka',slot:['t_pralka','l_pralka'],big:true,tip:'Dodaj pralkę w pralni, pomieszczeniu technicznym albo łazience (Meblowanie).'},
    {id:'dryer',name:'Suszarka do ubrań',slot:['t_suszarka','t_pralka','l_pralka'],tip:'Suszarka stoi na pralce (słupek) albo obok – dodaj ją w Meblowaniu.'},
    {id:'freezer',name:'Zamrażarka',slot:['k_wysokie','k_lodowka'],def:false,tip:'Zabudowa wysoka w kuchni albo osobna szafa w spiżarni / technicznym.'},
    {id:'boiler',name:'Kocioł / pompa ciepła, zasobnik CWU',slot:['t_kociol','t_cwu'],def:false,tip:'Dodaj urządzenia w pomieszczeniu technicznym (Meblowanie).'}
  ];
  // rzeczy do schowania: furn – meble, w których zwykle leżą; rooms – rodzaje pomieszczeń; v – objętość [m³] (funkcja liczby osób)
  const ITEMS=[
    {id:'coats',name:'Kurtki i buty',g:'Przy wejściu',furn:['p_szafa','p_buty'],rooms:['dress','hall'],v:p=>.12*p,tip:'Szafa wnękowa i szafka na buty przy wejściu (Meblowanie).'},
    {id:'seasonal',name:'Odzież sezonowa (zimowa / letnia)',g:'Ubrania',furn:['b_szafa','g_szafa','o_szafa','p_szafa'],rooms:['dress','box','attic'],v:p=>.08*p},
    {id:'linen',name:'Pościel i ręczniki na zmianę',g:'Ubrania',furn:['b_szafa','b_komoda','g_szafa','o_szafa','l_szafka'],rooms:['dress','box'],v:.2},
    {id:'vacuum',name:'Odkurzacz',g:'Sprzątanie',furn:['p_szafa','b_szafa','g_szafa','o_szafa','t_regal'],rooms:['box','tech','dress'],v:.15,tip:'Najwygodniej w schowku albo szafie przy holu.'},
    {id:'robot',name:'Robot sprzątający (stacja)',g:'Sprzątanie',rooms:['hall','box','tech','other','kitchen'],v:.05,def:false},
    {id:'mop',name:'Mop, wiadro, chemia',g:'Sprzątanie',furn:['l_szafka','p_szafa','t_regal','k_zlew'],rooms:['box','tech','bath'],v:.12},
    {id:'iron',name:'Deska do prasowania i żelazko',g:'Pranie',furn:['p_szafa','b_szafa','g_szafa','o_szafa','t_regal'],rooms:['tech','box','dress'],v:.08},
    {id:'rack',name:'Suszarka na pranie (rozkładana)',g:'Pranie',furn:['t_regal'],rooms:['tech','box','bath','dress'],v:.06},
    {id:'smallapp',name:'Małe AGD (ekspres, robot, toster)',g:'Kuchnia',furn:['k_dolne','k_wysokie','k_narozne','k_wyspa'],rooms:['pantry'],v:.25},
    {id:'food',name:'Zapasy jedzenia, przetwory',g:'Kuchnia',furn:['k_wysokie','k_dolne','k_narozne','k_wyspa'],rooms:['pantry'],v:p=>.15+.08*p},
    {id:'bins',name:'Kosze do segregacji (3–4 frakcje)',g:'Kuchnia',furn:['k_zlew','k_dolne','k_wyspa'],rooms:['pantry'],v:.12},
    {id:'firstaid',name:'Apteczka i leki',g:'Inne',furn:['l_szafka','l_umywalka','k_wysokie','k_dolne'],rooms:['bath'],v:.02},
    {id:'network',name:'Router / szafka teletechniczna',g:'Inne',furn:['t_regal','s_regal','g_regal'],rooms:['tech','box','hall'],v:.05},
    {id:'suitcases',name:'Walizki',g:'Sezonowe',furn:['b_szafa','p_szafa','g_szafa','o_szafa'],rooms:['box','dress','attic','garage'],v:.3},
    {id:'xmas',name:'Ozdoby świąteczne, rzeczy sezonowe',g:'Sezonowe',furn:['t_regal'],rooms:['box','attic','garage','tech'],v:.3},
    {id:'bikes',name:'Rowery',g:'Garaż i ogród',rooms:['garage','box'],v:p=>.45*Math.min(p,4),tip:'Garaż albo schowek z wejściem z zewnątrz.'},
    {id:'mower',name:'Kosiarka i narzędzia ogrodowe',g:'Garaż i ogród',rooms:['garage','box'],v:.6,tip:'Garaż, schowek albo domek ogrodowy.'},
    {id:'tools',name:'Narzędzia (wiertarka, skrzynka)',g:'Garaż i ogród',furn:['t_regal'],rooms:['garage','tech','box'],v:.15},
    {id:'tires',name:'Opony samochodowe (komplet)',g:'Garaż i ogród',rooms:['garage','box','attic'],v:.45,def:false},
    {id:'sport',name:'Sprzęt sportowy (narty, deski, namiot)',g:'Garaż i ogród',rooms:['garage','box','attic'],v:.3,def:false},
    {id:'pram',name:'Wózek dziecięcy',g:'Dziecko',rooms:['hall','garage','box'],v:.4,def:false}
  ];
  const GROUPS=[...new Set(ITEMS.map(i=>i.g))];
  // meble, w których coś się przechowuje (pojemność = objętość × współczynnik)
  const STORE=/^(b_szafa|g_szafa|o_szafa|p_szafa|p_buty|b_komoda|b_nocna|l_szafka|l_umywalka|t_regal|s_regal|g_regal|s_rtv|k_dolne|k_narozne|k_zlew|k_wysokie|k_wyspa|b_toaletka)$/;
  const WARD=/^(b_szafa|g_szafa|o_szafa|b_komoda)$/;
  // pojemność pomieszczeń bez mebli [m³ na m² podłogi] – regały / półki wzdłuż ścian
  const ROOMCAP={box:1,pantry:1,dress:1,tech:.5,garage:.35,hall:.12,bath:.15,kitchen:.05,other:.04,bed:.03,study:.03,attic:0};
  const CLOTHES_PP=.45; // ubrania na osobę [m³]: wiszące ok. 0,25 + składane ok. 0,2
  const fmt=(v,d=1)=>(Math.round(v*10**d)/10**d).toLocaleString('pl-PL',{minimumFractionDigits:d,maximumFractionDigits:d});
  const slotsOf=it=>{const id=it.item||'',L=Math.max(+it.w,+it.h);return /^(k_dolne|k_wyspa|k_wysokie)$/.test(id)?Math.max(1,Math.floor(L/.6)):1};
  function evaluate(project){
    const q=HouserQuantities.compute(project),c=q.c,S=project.equipment||{},P=Math.max(1,Math.round(+S.persons||+project.energySettings?.persons||4));
    const kindOf=global.HouserStorage?HouserStorage.kindOf:(n=>'other');
    const flat=f=>{const st=project.state?.[f]||[];return Array.isArray(st[0])?st.flat():st},st={[q.lo]:flat(q.lo),[q.up]:flat(q.up)};
    const roomOf=(f,x,y)=>{const v=st[f]?.[Math.floor(y/c)*q.W+Math.floor(x/c)];return v?q.rooms.find(r=>r.f===f&&r.id===v):null};
    const FN=global.HouserFurniture?(it=>HouserFurniture.nameFor(it)):(it=>it.label||it.item||it.type);
    // miejsca: meble i pomieszczenia do przechowywania
    const places=[],furnAll=[];
    for(const f of [q.lo,q.up])for(const it of project.furniture?.[f]||[]){if(!it.item)continue;const r=roomOf(f,+it.x+ +it.w/2,+it.y+ +it.h/2),vol=+it.w*+it.h*(+it.z||.8);
      const P0={key:'F:'+f+':'+it.id,type:'furn',item:it.item,name:FN(it),room:r?.name||'',roomKey:r?f+'|'+r.id:'',f,cap:STORE.test(it.item)?vol*.6:0,slots:slotsOf(it),used:0,usedSlots:0,list:[]};furnAll.push(P0);if(STORE.test(it.item))places.push(P0)}
    for(const r of q.rooms){const k=kindOf(r.name||'');if(r.area<.8||!['box','pantry','dress','tech','garage'].includes(k))continue;places.push({key:'R:'+r.f+'|'+r.id,type:'room',kind:k,name:r.name,room:r.name,roomKey:r.f+'|'+r.id,f:r.f,cap:r.area*(ROOMCAP[k]??.04),used:0,list:[]})}
    for(const r of q.rooms){const k=kindOf(r.name||'');if(['hall','bath'].includes(k)&&r.area>=2)places.push({key:'R:'+r.f+'|'+r.id,type:'room',kind:k,name:r.name,room:r.name,roomKey:r.f+'|'+r.id,f:r.f,cap:r.area*ROOMCAP[k],used:0,list:[],minor:true})}
    const bungalow=q.G.upperType==='none'||!(q.net[q.up]>0);if(bungalow&&q.G.roofPitch>=20)places.push({key:'A',type:'room',kind:'attic',name:'Strych (nad stropem)',room:'strych',cap:Math.min(6,q.foot*.08),used:0,list:[]});
    const byKey=Object.fromEntries([...places,...furnAll].map(p=>[p.key,p]));
    const issues=[],good=[],add=(p,text,tip,type)=>issues.push({p:Math.round(p*100)/100,text,tip:tip||'',type:type||'missing'});
    const label=p=>p.name+(p.room&&p.room!==p.name?' ('+p.room+')':'');
    // 1) sprzęty – w meblach z Meblowania; kuchnia bez mebli – zakładana zabudowa
    const hasK=furnAll.some(p=>/^k_/.test(p.item)),kitchens=q.rooms.filter(r=>/kuchni|aneks/i.test(r.name||''));
    const appliances=APPLIANCES.map(A=>{const o=S.items?.[A.id]||{},on=o.on!=null?!!o.on:A.def!==false,R={id:A.id,name:A.name,on,A,status:'off',where:''};if(!on)return R;
      let p=null;for(const id of A.slot){p=furnAll.find(x=>x.item===id&&(A.share||x.usedSlots<x.slots));if(p)break}
      if(p){if(!A.share)p.usedSlots++;R.status='ok';R.where=label(p);R.place=p.key}
      else if(!hasK&&A.slot.some(id=>/^k_/.test(id))&&kitchens.length){R.status='assumed';R.where='zakładana zabudowa ('+kitchens[0].name+')'}
      else{R.status='missing';add(A.big?1:.4,'Brak w projekcie: '+A.name.toLowerCase()+'.',A.tip,'appliance')}
      return R});
    if(appliances.some(a=>a.status==='assumed'))add(.3,'Kuchnia bez mebli w Meblowaniu – przyjęto standardową zabudowę (lodówka, zmywarka, piekarnik).','Rozmieść meble kuchenne w module Meblowanie, żeby sprawdzić, czy wszystko się zmieści.','virtual');
    // 2) ubrania – domownicy w sypialniach (sypialnia główna 2 osoby, pozostałe po 1, pokój gościnny 0)
    const beds=q.rooms.filter(r=>kindOf(r.name||'')==='bed'&&!/goś|gosc/i.test(r.name||'')).sort((a,b)=>(/główn|glown|rodzic|małż|malz/i.test(b.name)?1:0)-(/główn|glown|rodzic|małż|malz/i.test(a.name)?1:0)||b.area-a.area);
    let left=P;const clothes=[];beds.forEach((r,i)=>{if(left<=0)return;const n=i===0?Math.min(2,left):1;left-=n;clothes.push({room:r,n})});if(left>0){if(clothes.length)clothes[0].n+=left;else clothes.push({room:null,n:left})}
    const dress=places.filter(p=>p.type==='room'&&p.kind==='dress');
    for(const C of clothes){const need=C.n*CLOTHES_PP,key=C.room?C.room.f+'|'+C.room.id:'';let got=0;C.need=need;C.where=[];
      const own=places.filter(p=>p.type==='furn'&&WARD.test(p.item)&&p.roomKey===key);
      for(const p of [...own,...dress]){if(got>=need-1e-9)break;const free=p.cap-p.used;if(free<=.01)continue;const take=Math.min(free,need-got);p.used+=take;got+=take;p.list.push('ubrania'+(C.room?' – '+C.room.name:''));C.where.push(label(p))}
      C.got=got;C.ok=got>=need*.95;C.name=C.room?C.room.name:'cały dom';C.empty=!!C.room&&!furnAll.some(p=>p.roomKey===key);
      if(!C.ok&&C.empty)add(.2,'Ubrania ('+C.name+'): pokój bez mebli – przyjęto szafę w zabudowie.','Wstaw szafę albo komodę w Meblowaniu, żeby sprawdzić, czy ubrania się zmieszczą.','clothes');
      else if(!C.ok)add(got<need*.5?1:.6,'Ubrania ('+C.name+', '+C.n+' '+(C.n===1?'osoba':'osoby')+'): miejsca ok. '+fmt(got)+' m³, potrzeba ok. '+fmt(need)+' m³.',own.length?'Większa szafa (np. 2,5–3 m) albo dodatkowa komoda w tym pokoju; albo garderoba.':'W tym pokoju nie ma szafy ani komody – dodaj je w Meblowaniu albo zaplanuj garderobę.','clothes')}
    // 3) rzeczy do schowania: wybrane ręcznie albo automatycznie (najpierw pasujące meble, potem schowki)
    const vol=I=>typeof I.v==='function'?I.v(P):(I.v||0);
    const items=ITEMS.map(I=>{const o=S.items?.[I.id]||{};return {I,id:I.id,name:I.name,g:I.g,on:o.on!=null?!!o.on:I.def!==false,want:o.place||'auto',place:null,placeName:'',v:vol(I),auto:true}});
    const fits=(I,p)=>p.type==='furn'?(I.furn||[]).includes(p.item):(I.rooms||[]).includes(p.kind);
    const put=(R,p)=>{p.used+=R.v;p.list.push(R.name);R.place=p.key;R.placeName=label(p)};
    for(const R of [...items].sort((a,b)=>(a.want!=='auto'?0:1)-(b.want!=='auto'?0:1)||b.v-a.v)){if(!R.on)continue;const I=R.I;
      if(R.want!=='auto'){const p=byKey[R.want];if(p){put(R,p);R.auto=false;R.odd=!fits(I,p)}continue}
      const pref=[...(I.furn||[]).map(id=>p=>p.type==='furn'&&p.item===id),...(I.rooms||[]).map(k=>p=>p.type==='room'&&p.kind===k)];
      for(const t of pref){const p=places.find(p=>t(p)&&p.cap-p.used>=R.v*.999);if(p){put(R,p);break}}}
    for(const R of items.filter(r=>r.on&&!r.place))add(.4,'Nie ma gdzie schować: '+R.name.toLowerCase()+'.',R.I.tip||'Wybierz mebel albo schowek z listy – albo dodaj szafę / regał w Meblowaniu.','store');
    for(const p of places){if(p.cap>0&&p.used>p.cap*1.1)add(Math.min(1,.3+(p.used/p.cap-1)*.5),label(p)+': za dużo rzeczy – ok. '+fmt(p.used)+' m³ na '+fmt(p.cap)+' m³.','Przenieś część rzeczy gdzie indziej albo dodaj szafę / regał.','full')}
    for(const R of items)if(R.on&&R.odd)add(.15,R.name+' w „'+R.placeName+'” – nietypowo.',R.I.tip||'','odd');
    const onA=appliances.filter(a=>a.on),okA=onA.filter(a=>a.status!=='missing'),onI=items.filter(r=>r.on),okI=onI.filter(r=>r.place),okC=clothes.filter(x=>x.ok);
    const total=onA.length+onI.length+clothes.length,placed=okA.length+okI.length+okC.length;
    if(placed===total)good.push('Wszystko jest i ma swoje miejsce: '+onA.length+' sprzętów, ubrania '+P+' os., '+onI.length+' rzeczy.');
    const missing=[...onA.filter(a=>a.status==='missing'),...onI.filter(r=>!r.place),...clothes.filter(x=>!x.ok).map(x=>({name:'ubrania – '+x.name}))];
    const score=Math.round(Math.max(0,10-issues.reduce((a,i)=>a+i.p,0))*10)/10;
    return {appliances,clothes,items,places,furn:furnAll,issues:issues.sort((a,b)=>b.p-a.p),good,score,missing,placed,total,P,GROUPS}}
  global.HouserEquip={APPLIANCES,ITEMS,GROUPS,ROOMCAP,CLOTHES_PP,evaluate};
})(typeof window!=='undefined'?window:globalThis);
