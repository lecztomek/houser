// Wyposażenie domu: lista rzeczy, które muszą się gdzieś zmieścić (AGD, pranie, sprzątanie, ubrania, rzeczy sezonowe, garaż i ogród),
// i przypisanie każdej do miejsca – mebla z Meblowania (zabudowa kuchenna, szafa, słupek…) albo pomieszczenia (spiżarnia, schowek,
// garderoba, techniczne / pralnia, garaż, strych). Sprawdza, czego brakuje i co się nie mieści.
// HouserEquip.evaluate(project) -> {items, places, issues, good, score, missing, placed}
// Ustawienia: project.equipment = {items:{[id]:{on, qty, place}}, persons}
// Wymaga shared/quantities.js, modules/schowki/engine.js (rodzaje pomieszczeń), opcjonalnie shared/furniture.js (nazwy mebli).
(function(global){
  // slot – sprzęt zajmuje miejsce w meblu (lodówka w zabudowie, zmywarka pod blatem); share – nie zajmuje osobnego miejsca;
  // furn – meble, w których można trzymać; rooms – rodzaje pomieszczeń; v – objętość [m³] (funkcja liczby osób)
  const ITEMS=[
    {id:'fridge',name:'Lodówka',g:'Kuchnia',slot:['k_lodowka','k_wysokie'],big:true,tip:'Dodaj lodówkę albo zabudowę wysoką w Meblowaniu (kuchnia).'},
    {id:'freezer',name:'Zamrażarka',g:'Kuchnia',slot:['k_wysokie','k_lodowka'],rooms:['pantry','tech','garage'],v:.35,def:false,tip:'Zabudowa wysoka w kuchni albo miejsce w spiżarni / pomieszczeniu technicznym.'},
    {id:'dish',name:'Zmywarka',g:'Kuchnia',slot:['k_zlew','k_dolne','k_wyspa'],big:true,tip:'Zmywarka stoi w szafkach dolnych obok zlewu – dodaj szafki dolne.'},
    {id:'oven',name:'Płyta i piekarnik',g:'Kuchnia',slot:['k_plyta','k_dolne','k_wysokie'],big:true,tip:'Dodaj płytę z piekarnikiem albo szafki dolne.'},
    {id:'micro',name:'Mikrofalówka',g:'Kuchnia',slot:['k_wysokie','k_dolne','k_wyspa'],share:true},
    {id:'hood',name:'Okap',g:'Kuchnia',slot:['k_plyta','k_dolne','k_wyspa'],share:true},
    {id:'bins',name:'Kosze do segregacji (3–4 frakcje)',g:'Kuchnia',slot:['k_zlew','k_dolne','k_wyspa'],share:true,tip:'Kosze najlepiej pod zlewem – dodaj szafkę zlewową.'},
    {id:'smallapp',name:'Małe AGD (ekspres, robot, toster)',g:'Kuchnia',furn:['k_dolne','k_wysokie','k_narozne','k_wyspa'],rooms:['pantry'],v:.25},
    {id:'food',name:'Zapasy jedzenia, przetwory',g:'Kuchnia',rooms:['pantry'],furn:['k_wysokie','k_dolne','k_narozne','k_wyspa'],v:p=>.15+.08*p},
    {id:'washer',name:'Pralka',g:'Pranie',slot:['t_pralka','l_pralka'],rooms:['tech','bath'],v:.3,big:true,tip:'Pralka potrzebuje wody i odpływu – pralnia, techniczne albo łazienka.'},
    {id:'dryer',name:'Suszarka do ubrań',g:'Pranie',slot:['t_suszarka','t_pralka','l_pralka'],rooms:['tech','bath'],v:.3,tip:'Na pralce (słupek) albo obok – w pralni / technicznym.'},
    {id:'iron',name:'Deska do prasowania i żelazko',g:'Pranie',rooms:['tech','box','dress'],furn:['p_szafa','b_szafa','g_szafa','o_szafa'],v:.08},
    {id:'rack',name:'Suszarka na pranie (rozkładana)',g:'Pranie',rooms:['tech','box','bath','dress'],v:.06},
    {id:'vacuum',name:'Odkurzacz',g:'Sprzątanie',rooms:['box','tech','dress'],furn:['p_szafa','b_szafa','g_szafa','o_szafa','t_regal'],v:.15,tip:'Najwygodniej w schowku albo szafie przy holu.'},
    {id:'robot',name:'Robot sprzątający (stacja)',g:'Sprzątanie',rooms:['hall','box','tech','other','kitchen'],v:.05,def:false},
    {id:'mop',name:'Mop, wiadro, chemia',g:'Sprzątanie',rooms:['box','tech','bath'],furn:['l_szafka','p_szafa','t_regal','k_zlew'],v:.12},
    {id:'coats',name:'Kurtki i buty domowników',g:'Przy wejściu',furn:['p_szafa','p_buty'],rooms:['dress','hall'],v:p=>.12*p,tip:'Szafa wnękowa i szafka na buty przy wejściu (Meblowanie).'},
    {id:'clothes',name:'Ubrania domowników',g:'Ubrania i pościel',furn:['b_szafa','g_szafa','o_szafa','b_komoda'],rooms:['dress'],v:p=>.4*p,tip:'Szafy w sypialniach albo garderoba.'},
    {id:'linen',name:'Pościel i ręczniki na zmianę',g:'Ubrania i pościel',furn:['b_szafa','b_komoda','g_szafa','o_szafa','l_szafka'],rooms:['dress','box'],v:.2},
    {id:'suitcases',name:'Walizki',g:'Sezonowe',rooms:['box','dress','attic','garage'],furn:['b_szafa','p_szafa','g_szafa'],v:.3},
    {id:'xmas',name:'Ozdoby świąteczne, rzeczy sezonowe',g:'Sezonowe',rooms:['box','attic','garage','tech'],v:.3},
    {id:'bikes',name:'Rowery',g:'Garaż i ogród',rooms:['garage','box'],v:p=>.45*Math.min(p,4),tip:'Garaż albo schowek z wejściem z zewnątrz.'},
    {id:'mower',name:'Kosiarka i narzędzia ogrodowe',g:'Garaż i ogród',rooms:['garage','box'],v:.6,tip:'Garaż, schowek albo domek ogrodowy.'},
    {id:'tools',name:'Narzędzia (wiertarka, skrzynka)',g:'Garaż i ogród',rooms:['garage','tech','box'],furn:['t_regal'],v:.15},
    {id:'tires',name:'Opony samochodowe (komplet)',g:'Garaż i ogród',rooms:['garage','box','attic'],v:.45,def:false},
    {id:'sport',name:'Sprzęt sportowy (narty, deski, namiot)',g:'Garaż i ogród',rooms:['garage','box','attic'],v:.3,def:false},
    {id:'pram',name:'Wózek dziecięcy',g:'Dziecko',rooms:['hall','garage','box'],v:.4,def:false},
    {id:'firstaid',name:'Apteczka i leki',g:'Inne',furn:['l_szafka','l_umywalka','k_wysokie','k_dolne'],rooms:['bath'],v:.02},
    {id:'network',name:'Router / szafka teletechniczna',g:'Inne',rooms:['tech','box','hall'],v:.05}
  ];
  const GROUPS=[...new Set(ITEMS.map(i=>i.g))];
  // pojemność pomieszczeń [m³ na m² podłogi] – regały / półki wzdłuż ścian
  const ROOMCAP={box:1,pantry:1,dress:1,tech:.5,garage:.35,hall:.12,bath:.15,kitchen:.05,other:.04,bed:.03,study:.03,attic:0};
  const FURNCAP=.6;
  const fmt=(v,d=1)=>(Math.round(v*10**d)/10**d).toLocaleString('pl-PL',{minimumFractionDigits:d,maximumFractionDigits:d});
  const slotsOf=it=>{const id=it.item||'',L=Math.max(+it.w,+it.h);return /^(k_dolne|k_wyspa)$/.test(id)?Math.max(1,Math.floor(L/.6)):id==='k_wysokie'?Math.max(1,Math.floor(L/.6)):1};
  function evaluate(project){
    const q=HouserQuantities.compute(project),c=q.c,S=project.equipment||{},P=Math.max(1,Math.round(+S.persons||+project.energySettings?.persons||4));
    const kindOf=global.HouserStorage?HouserStorage.kindOf:(n=>'other');
    const flat=f=>{const st=project.state?.[f]||[];return Array.isArray(st[0])?st.flat():st},st={[q.lo]:flat(q.lo),[q.up]:flat(q.up)};
    const roomOf=(f,x,y)=>{const v=st[f]?.[Math.floor(y/c)*q.W+Math.floor(x/c)];return v?q.rooms.find(r=>r.f===f&&r.id===v):null};
    const FN=global.HouserFurniture?(it=>HouserFurniture.nameFor(it)):(it=>it.label||it.item||it.type);
    // miejsca: meble i pomieszczenia
    const places=[];
    for(const f of [q.lo,q.up])for(const it of project.furniture?.[f]||[]){if(!it.item)continue;const r=roomOf(f,+it.x+ +it.w/2,+it.y+ +it.h/2),vol=+it.w*+it.h*(+it.z||.8);
      places.push({key:'F:'+f+':'+it.id,type:'furn',item:it.item,name:FN(it),room:r?.name||'',f,cap:/^(k_lodowka|l_pralka|t_pralka|t_suszarka|k_plyta)$/.test(it.item)?0:vol*FURNCAP,slots:slotsOf(it),used:0,usedSlots:0,list:[]})}
    for(const r of q.rooms){const k=kindOf(r.name||'');if(r.area<.8)continue;places.push({key:'R:'+r.f+'|'+r.id,type:'room',kind:k,name:r.name,room:r.name,f:r.f,cap:r.area*(ROOMCAP[k]??.04),slots:0,used:0,usedSlots:0,list:[]})}
    // kuchnia bez mebli w Meblowaniu: zakładana zabudowa (lodówka, zmywarka, piekarnik, szafki) – z uwagą, żeby ją dorysować
    const hasK=places.some(p=>p.type==='furn'&&/^k_/.test(p.item));let virtualK=[];
    if(!hasK)for(const r of q.rooms.filter(r=>kindOf(r.name||'')==='kitchen'||/kuchni|aneks/i.test(r.name||''))){const p={key:'K:'+r.f+'|'+r.id,type:'furn',item:'k_virtual',virtual:true,name:'Zakładana zabudowa kuchenna',room:r.name,f:r.f,cap:1.6,slots:4,used:0,usedSlots:0,list:[]};places.push(p);virtualK.push(p)}
    const bungalow=q.G.upperType==='none'||!(q.net[q.up]>0);if(bungalow&&q.G.roofPitch>=20)places.push({key:'A',type:'room',kind:'attic',name:'Strych (nad stropem)',room:'strych',cap:Math.min(6,q.foot*.08),slots:0,used:0,usedSlots:0,list:[]});
    const byKey=Object.fromEntries(places.map(p=>[p.key,p]));
    const isK=I=>[...(I.slot||[]),...(I.furn||[])].some(id=>/^k_/.test(id));
    const fits=(I,p)=>{if(p.virtual)return isK(I);if(p.type==='furn')return (I.slot||[]).includes(p.item)||(I.furn||[]).includes(p.item);return (I.rooms||[]).includes(p.kind)};
    const vol=I=>typeof I.v==='function'?I.v(P):(I.v||0);
    const usesSlot=(I,p)=>p.type==='furn'&&((I.slot||[]).includes(p.item)||(p.virtual&&(I.slot||[]).length))&&!I.share;
    const canTake=(I,p)=>{if(p.virtual&&!isK(I))return false;if(p.virtual&&I.share)return true;if(usesSlot(I,p))return p.usedSlots<p.slots;if(p.type==='furn'&&(I.slot||[]).includes(p.item)&&I.share)return true;const v=vol(I);return p.cap-p.used>=v*.999||(v===0)};
    const put=(I,p,R)=>{if(usesSlot(I,p))p.usedSlots++;else if(!(p.type==='furn'&&((I.slot||[]).includes(p.item)||p.virtual)&&I.share))p.used+=vol(I);p.list.push(I.name);R.place=p.key;R.placeName=p.name+(p.room&&p.room!==p.name?' ('+p.room+')':'')};
    // kolejność: najpierw rzeczy wybrane ręcznie, potem sprzęty z wymaganym miejscem (sloty), potem duże objętości
    const items=ITEMS.map(I=>{const o=S.items?.[I.id]||{};return {I,id:I.id,name:I.name,g:I.g,on:o.on!=null?!!o.on:I.def!==false,want:o.place||'auto',place:null,placeName:'',v:vol(I),auto:true}});
    const order=[...items].sort((a,b)=>(a.want!=='auto'?0:1)-(b.want!=='auto'?0:1)||((b.I.slot&&!b.I.share?1:0)-(a.I.slot&&!a.I.share?1:0))||b.v-a.v);
    for(const R of order){if(!R.on)continue;const I=R.I;
      if(R.want!=='auto'){const p=byKey[R.want];if(p){put(I,p,R);R.auto=false;R.forced=!fits(I,p)}continue}
      const pref=[...(I.slot||[]).map(id=>p=>p.type==='furn'&&p.item===id),...(I.furn||[]).map(id=>p=>p.type==='furn'&&p.item===id),...(I.rooms||[]).map(k=>p=>p.type==='room'&&p.kind===k),p=>p.virtual&&isK(I)];
      for(const test of pref){const p=places.find(p=>test(p)&&canTake(I,p));if(p){put(I,p,R);break}}}
    const issues=[],good=[],add=(p,text,tip,type)=>issues.push({p:Math.round(p*100)/100,text,tip:tip||'',type:type||'missing'});
    const missing=items.filter(R=>R.on&&!R.place);
    for(const R of missing)add(R.I.big?1:.4,'Brak miejsca na: '+R.name.toLowerCase()+'.',R.I.tip||('Pasuje: '+[...(R.I.slot||[]),...(R.I.furn||[])].map(id=>global.HouserFurniture?.ITEMS?.[id]?.name||id).concat((R.I.rooms||[]).map(k=>({box:'schowek',pantry:'spiżarnia',dress:'garderoba',tech:'techniczne / pralnia',garage:'garaż',hall:'hol',bath:'łazienka',attic:'strych',kitchen:'kuchnia',other:'pokój'})[k]||k)).slice(0,5).join(', ')+'.'),'missing');
    for(const p of places){if(p.cap>0&&p.used>p.cap*1.1)add(Math.min(1,.3+(p.used/p.cap-1)*.5),p.name+(p.room&&p.room!==p.name?' ('+p.room+')':'')+': za dużo rzeczy – ok. '+fmt(p.used)+' m³ na '+fmt(p.cap)+' m³ miejsca.','Przenieś część rzeczy gdzie indziej albo dodaj szafę / regał.','full');
      if(p.slots&&p.usedSlots>p.slots)add(.5,p.name+': za mało miejsca na sprzęty ('+p.usedSlots+' na '+p.slots+').','Dłuższa zabudowa albo osobne miejsce na sprzęt.','full')}
    if(virtualK.some(p=>p.list.length))add(.3,'Kuchnia bez mebli w Meblowaniu – przyjęto standardową zabudowę (lodówka, zmywarka, piekarnik, szafki).','Rozmieść meble kuchenne w module Meblowanie, żeby sprawdzić, czy wszystko się zmieści.','virtual');
    for(const R of items)if(R.forced&&R.on)add(.2,R.name+' w miejscu „'+R.placeName+'” – nietypowo.',R.I.tip||'','odd');
    const on=items.filter(R=>R.on),placed=on.filter(R=>R.place);
    if(placed.length===on.length)good.push('Wszystkie rzeczy z listy ('+on.length+') mają swoje miejsce.');else good.push(placed.length+' z '+on.length+' rzeczy ma swoje miejsce.');
    const score=Math.round(Math.max(0,10-issues.reduce((a,i)=>a+i.p,0))*10)/10;
    return {items,places,issues:issues.sort((a,b)=>b.p-a.p),good,score,missing,placed:placed.length,total:on.length,P,GROUPS}}
  global.HouserEquip={ITEMS,GROUPS,ROOMCAP,evaluate};
})(typeof window!=='undefined'?window:globalThis);
