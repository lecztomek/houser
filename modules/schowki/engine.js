// Schowki i szafy – ile miejsca na rzeczy daje dom: szafy i zabudowy z Meblowania, garderoby, spiżarnie, schowki,
// garaż, skosy, miejsce pod schodami i strych – oraz czy to wystarczy dla tylu osób.
// Gdzie nie ma mebli, liczymy miejsce, które układ daje: najdłuższą wolną ścianę (bez okien i drzwi) na szafę.
// HouserStorage.evaluate(project, settings) -> {cats, rooms, issues, good, cap, need, overall, persons…}
// Wymaga shared/quantities.js (i shared/furniture.js – opcjonalnie, dla nazw mebli).
(function(global){
  const DEF={persons:null,stuff:'avg'};
  const STUFF={min:.75,avg:1,lots:1.3};
  const CATS=[
    {k:'clothes',name:'Ubrania i pościel',w:3,need:P=>1+1.2*P,how:'szafy w sypialniach, garderoby, komody'},
    {k:'entry',name:'Przy wejściu',w:1.5,need:P=>.5+.35*P,how:'kurtki, buty, parasole – szafa w przedpokoju lub wiatrołapie'},
    {k:'kitchen',name:'Kuchnia i jedzenie',w:2,need:P=>1.5+.35*P,how:'szafki kuchenne dolne i górne, zabudowa wysoka, spiżarnia'},
    {k:'bath',name:'Łazienka i chemia',w:.5,need:P=>.2+.1*P,how:'szafki pod umywalką, słupki'},
    {k:'utility',name:'Gospodarcze i sezonowe',w:2,need:P=>2+.8*P,how:'odkurzacz, walizki, dekoracje, narzędzia, rzeczy sezonowe – schowek, garaż, techniczne, strych'},
  ];
  const re={bed:/sypial|pokój|pokoj|dziec|gości|gosci/i,dress:/garder/i,pantry:/spiżar|spizar/i,box:/schow|skos|gospodar|magazyn|strych|komórk|komork/i,
    hall:/hol|przedpok|wiatroł|wiatrol|koryt|sień|sien/i,kitchen:/kuchni|aneks/i,bath:/łazien|lazien|\bwc\b/i,garage:/garaż|garaz/i,tech:/techn|kotłown|kotlown|pralni/i,study:/gabinet|biuro/i};
  const kindOf=n=>re.dress.test(n)?'dress':re.pantry.test(n)?'pantry':re.box.test(n)?'box':re.garage.test(n)?'garage':re.tech.test(n)?'tech':re.bath.test(n)?'bath':re.kitchen.test(n)?'kitchen':re.hall.test(n)?'hall':re.bed.test(n)?'bed':re.study.test(n)?'study':'other';
  // meble: [kategoria gdy stoją w dowolnym pokoju, współczynnik użytecznej objętości]
  const WARD=new Set(['b_szafa','g_szafa','o_szafa','p_szafa']);
  const ITEM={b_szafa:['clothes',.75],g_szafa:['clothes',.75],o_szafa:['clothes',.75],p_szafa:['entry',.75],b_komoda:['clothes',.7],b_nocna:['clothes',.5],p_buty:['entry',.7],
    k_dolne:['kitchen',.55],k_narozne:['kitchen',.4],k_zlew:['kitchen',.3],k_wysokie:['kitchen',.5],k_wyspa:['kitchen',.55],
    l_umywalka:['bath',.5],l_szafka:['bath',.7],t_regal:['utility',.6],s_regal:['other',.6],g_regal:['other',.6],s_rtv:['other',.5]};
  const UPPER_M3=.35*.7*.75; // szafki wiszące nad dolnymi – na metr
  const fmt=(v,d=1)=>(Math.round(v*10**d)/10**d).toLocaleString('pl-PL',{minimumFractionDigits:d,maximumFractionDigits:d});
  const WARD_M3=m=>m*.62*2.3*.75; // szafa 60 cm na metr bieżący

  function evaluate(project,settings){
    const set={...DEF,...(settings||{})};
    const q=HouserQuantities.compute(project),c=q.c,lo=q.lo,up=q.up,W=q.W,H=q.H,G=q.G;
    const P=Math.max(1,Math.round(+set.persons||+project.energySettings?.persons||4)),mul=STUFF[set.stuff]||1;
    const tan=Math.tan(G.roofPitch*Math.PI/180);
    const clearH=(f,x,y)=>{if(f===lo)return G.groundHeight;if(!q.attic)return G.upperHeight;const a=q.across?(x+.5)*c:(y+.5)*c;return Math.min(G.kneeWall+Math.min(a,q.span-a)*tan,G.upperHeight)};
    const st={};for(const f of [lo,up]){const s=project.state?.[f]||[];st[f]=Array.isArray(s[0])?s.flat():s}
    const idAt=(f,x,y)=>x<0||y<0||x>=W||y>=H?null:(st[f]?.[y*W+x]||null);
    const rooms=q.rooms.filter(r=>r.area>=.5).map(r=>({key:r.f+'|'+r.id,f:r.f,id:r.id,name:r.name||r.id,area:r.area,cells:r.cells,minH:r.minH,maxH:r.maxH,kind:kindOf(r.name||''),items:[],cap:{},wall:null}));
    const byKey=Object.fromEntries(rooms.map(r=>[r.key,r]));
    const roomAt=(f,xm,ym)=>{const id=idAt(f,Math.floor(xm/c),Math.floor(ym/c));return id?byKey[f+'|'+id]:null};
    const addCap=(r,cat,v,label,src,note)=>{if(!(v>0))return;r.items.push({cat,v,label,src,note:note||''})};
    // najdłuższa wolna ściana w pokoju (bez okien, drzwi i otwarć; na poddaszu tylko tam, gdzie jest ≥ 2 m wysokości)
    const ops=f=>project.openings?.[f]||{};
    function freeWall(r){const own=new Set(r.cells.map(([x,y])=>x+','+y)),runs={};
      const push=(o,line,side,along,key)=>{const k=o+'|'+line+'|'+side;(runs[k]=runs[k]||[]).push({along,key})};
      for(const [x,y] of r.cells){if(clearH(r.f,x,y)<2.0)continue;
        for(const [dx,dy,o,line,along,key] of [[0,-1,'h',y,x,'h:'+x+':'+y],[0,1,'h',y+1,x,'h:'+x+':'+(y+1)],[-1,0,'v',x,y,'v:'+x+':'+y],[1,0,'v',x+1,y,'v:'+(x+1)+':'+y]]){
          if(own.has((x+dx)+','+(y+dy)))continue;const nb=idAt(r.f,x+dx,y+dy);if(r.f===up&&(nb==='pustka'||nb==='schody'))continue;if(ops(r.f)[key])continue;push(o,line,dx+dy,along,key)}}
      let best=0;for(const [k,list] of Object.entries(runs)){list.sort((a,b)=>a.along-b.along);let run=0,prev=null;for(const it of list){run=prev!=null&&it.along===prev+1?run+1:1;prev=it.along;if(run>best){best=run;const [o,line]=k.split('|');r.seg={o,line:+line,from:it.along-run+1,to:it.along}}}}
      // pokój z drzwiami: przy drzwiach zostaw ok. 0,3 m
      return Math.max(0,best*c-(best*c>1.2?.3:0))}
    // 1) meble z Meblowania
    const fur=project.furniture||{};let furN=0;
    for(const f of [lo,up])for(const it of fur[f]||[]){const def=ITEM[it.item];if(!def)continue;const r=roomAt(f,it.x+it.w/2,it.y+it.h/2);if(!r)continue;furN++;
      let [cat,u]=def;const len=Math.max(it.w,it.h),dep=Math.min(it.w,it.h),z=+it.z||2;
      if(WARD.has(it.item)){cat=r.kind==='hall'?'entry':(r.kind==='garage'||r.kind==='tech'||r.kind==='box')?'utility':'clothes'}
      if(cat==='other')continue;
      let v=len*dep*z*u;if(it.item==='k_dolne'||it.item==='k_zlew'||it.item==='k_narozne')v+=len*UPPER_M3;
      const nm=global.HouserFurniture?.nameFor?.(it)||it.item;addCap(r,cat,v,nm,'meble',fmt(len,1)+' m');r.hasFur=r.hasFur||{};r.hasFur[cat]=true}
    // 2) pomieszczenia do przechowywania i miejsce, które daje układ
    const avgH=r=>Math.min(2.4,(r.minH+r.maxH)/2);
    const halls=[];
    for(const r of rooms){r.wall=freeWall(r);const fw=r.wall;
      if(r.kind==='dress')addCap(r,'clothes',Math.min(r.area*.55,fw*2*.6+.6)*Math.min(2.2,avgH(r))*.8,'Garderoba – półki i drążki wzdłuż ścian','pom',fmt(r.area)+' m²');
      else if(r.kind==='pantry')addCap(r,'kitchen',r.area*.5*Math.min(2.2,avgH(r))*.8,'Spiżarnia – półki','pom',fmt(r.area)+' m²');
      else if(r.kind==='box')addCap(r,'utility',r.area*.6*Math.min(2,avgH(r))*.75,'Schowek','pom',fmt(r.area)+' m²');
      else if(r.kind==='garage'){const cars=r.area>=30?2:1,free=Math.max(0,r.area-cars*14);addCap(r,'utility',Math.min(8,(free*.5+(r.area>=16?1.5:0))*2*.75),'Regały w garażu (poza miejscem na '+(cars===2?'2 auta':'auto')+')','pom',fmt(r.area)+' m²')}
      else if(r.kind==='tech')addCap(r,'utility',Math.max(0,r.area-3.5)*.3*2*.75,'Regał w pomieszczeniu technicznym','pom',fmt(r.area)+' m²');
      // gdzie nie ma mebli – miejsce na zabudowę na wolnej ścianie
      const need=r.kind==='bed'?'clothes':r.kind==='hall'?'entry':r.kind==='kitchen'?'kitchen':r.kind==='bath'?'bath':null;
      if(need&&!(r.hasFur&&r.hasFur[need])){
        if(need==='clothes'){const L=Math.min(fw,r.area>=14?3:2.4);if(L>=.9)addCap(r,'clothes',WARD_M3(L),'Miejsce na szafę '+fmt(L,1)+' m (wolna ściana)','szac');r.noWall=L<.9}
        else if(need==='entry'){if(r.area>=2.5){const L=Math.min(fw,2.4);if(L>=.8)halls.push({r,L})}}
        else if(need==='bath'&&r.area>=2.5)addCap(r,'bath',.35,'Szafka pod umywalką','szac')}
      if(r.kind==='kitchen'){const L=Math.min(Math.max(fw,Math.sqrt(r.area)),5.5),est=L*(.6*.72*.55+UPPER_M3),has=r.items.filter(i=>i.cat==='kitchen').reduce((x,i)=>x+i.v,0);
        if(est>has+.2)addCap(r,'kitchen',est-has,has?'Miejsce na dalsze szafki (razem ok. '+fmt(L,1)+' m zabudowy)':'Szafki kuchenne ok. '+fmt(L,1)+' m (dolne + górne)','szac')}
      // skosy na poddaszu: niska część pokoju (0,6–1,4 m) – zabudowa pod skosem
      if(r.f===up&&q.attic&&r.kind!=='box'){let a=0,v=0;for(const [x,y] of r.cells){const h=clearH(up,x,y);if(h>=.6&&h<1.4){a+=c*c;v+=c*c*h}}if(a>=.5)addCap(r,'utility',v*.6,'Zabudowa pod skosem','pot',fmt(a)+' m² niskiej części')}}
    // przy wejściu liczy się najlepsza szafa w holu / wiatrołapie na parterze; pozostałe hole – szafa gospodarcza (połowa)
    const entryHas=rooms.some(r=>r.hasFur&&r.hasFur.entry);halls.sort((a,b)=>(b.r.f===lo)-(a.r.f===lo)||b.L-a.L);
    halls.forEach((h,i)=>{if(i===0&&h.r.f===lo&&!entryHas)addCap(h.r,'entry',WARD_M3(h.L)*.9,'Miejsce na szafę w przedpokoju '+fmt(h.L,1)+' m','szac');else addCap(h.r,'utility',WARD_M3(Math.min(h.L,1.5))*.5,'Miejsce na szafę gospodarczą '+fmt(Math.min(h.L,1.5),1)+' m','szac')});
    // pod schodami, strych
    const extra=[];
    if(!(project.stairs||[]).length&&q.net[up]>0){const r=rooms.find(x=>x.f===lo&&/schod/i.test(x.name));if(r)addCap(r,'utility',1.2,'Schowek pod schodami','pot')}
    const stairs=(project.stairs||[]).filter(s=>s.type!=='spiral');for(const s of stairs){const cl=s._cells?.lower||[[s.x,s.y]],m=cl[Math.floor(cl.length/2)]||[0,0],id=idAt(lo,m[0],m[1]);const r=(id&&byKey[lo+'|'+id])||rooms.find(x=>x.f===lo&&x.kind==='hall');if(r)addCap(r,'utility',1.2,'Schowek pod schodami','pot')}
    if(!(q.net[up]>0)&&G.roofPitch>=20){const w=Math.max(0,q.span-2*1.2/tan);if(w>1.5){const v=Math.min(8,q.length*w*.35*.5);extra.push({cat:'utility',v,label:'Strych nieużytkowy (schody strychowe)',src:'pot',note:'zimno zimą, gorąco latem – na rzeczy sezonowe'})}}
    // kategorie
    const cats=CATS.map(C=>{const items=[];for(const r of rooms)for(const it of r.items)if(it.cat===C.k)items.push({...it,room:r.name,f:r.f});for(const it of extra)if(it.cat===C.k)items.push({...it,room:'—'});
      const cap=items.reduce((a,x)=>a+x.v,0),need=C.need(P)*mul,ratio=need>0?cap/need:1;return {...C,items:items.sort((a,b)=>b.v-a.v),cap,need,ratio,score:Math.max(0,Math.min(10,Math.round(10*Math.min(1,ratio)**1.2*10)/10))}});
    const cap=cats.reduce((a,x)=>a+x.cap,0),need=cats.reduce((a,x)=>a+x.need,0);
    const wsum=cats.reduce((a,x)=>a+x.w,0);let overall=cats.reduce((a,x)=>a+x.w*x.score,0)/wsum;
    const issues=[],good=[];const add=(p,text,tip)=>issues.push({p,text,tip});
    const noWall=rooms.filter(r=>r.noWall);
    for(const r of noWall)add(1,'W pokoju „'+r.name+'” nie ma wolnej ściany na szafę – na każdej są okna, drzwi albo skos.','Zostaw jedną ścianę bez okna i drzwi (min. 1–2 m) albo zaplanuj szafę w przedpokoju / garderobę obok.');
    overall=Math.max(0,overall-.5*noWall.length);
    const C=Object.fromEntries(cats.map(x=>[x.k,x]));
    const short=(k,text,tip)=>{const x=C[k];if(x.ratio<.8)add(x.ratio<.5?1.5:.8,text.replace('{c}',fmt(x.cap)).replace('{n}',fmt(x.need)),tip)};
    short('clothes','Na ubrania i pościel jest ok. {c} m³, a potrzeba ok. {n} m³.',rooms.some(r=>r.kind==='dress')?'Powiększ garderobę albo zaplanuj dłuższe szafy w sypialniach.':'Garderoba (nawet 3–4 m²) przy sypialni głównej mieści tyle, co 2–3 szafy.');
    short('entry','Przy wejściu jest ok. {c} m³ na kurtki i buty, a potrzeba ok. {n} m³.','Szafa wnękowa w wiatrołapie lub przedpokoju (ok. 1,5–2 m).');
    short('kitchen','W kuchni jest ok. {c} m³ szafek, a potrzeba ok. {n} m³.',rooms.some(r=>r.kind==='pantry')?'Dodaj zabudowę wysoką albo szafki w wyspie.':'Spiżarnia 1,5–2 m² przy kuchni mieści zapasy za kilka szafek.');
    short('utility','Na rzeczy gospodarcze i sezonowe jest ok. {c} m³, a potrzeba ok. {n} m³.','Schowek, pomieszczenie gospodarcze albo regały w garażu – walizki, odkurzacz, dekoracje i narzędzia muszą gdzieś stać.');
    if(!rooms.some(r=>r.kind==='dress'))issues.push({p:0,text:'W domu nie ma garderoby – ubrania mieszczą się tylko w szafach w pokojach.',tip:''});
    if(!rooms.some(r=>['box','garage','tech','pantry'].includes(r.kind)))add(.8,'W domu nie ma żadnego schowka, pomieszczenia gospodarczego ani garażu.','Nawet 1,5–2 m² schowka pod schodami albo przy wejściu bardzo pomaga.');
    for(const x of cats)if(x.ratio>=1.3)good.push(x.name+': ok. '+fmt(x.cap)+' m³ przy potrzebie ok. '+fmt(x.need)+' m³ – z zapasem.');
    if(!furN)issues.push({p:0,text:'W projekcie nie ma jeszcze mebli – szafy liczę z wolnych ścian (miejsce na zabudowę).',tip:'Wstaw szafy i szafki w module Meblowanie, żeby policzyć dokładnie.'});
    overall=Math.round(overall*10)/10;
    const pot=cats.reduce((a,x)=>a+x.items.filter(i=>i.src==='pot'||i.src==='szac').reduce((b,i)=>b+i.v,0),0);
    return {set,P,mul,cats,rooms,extra,issues:issues.sort((a,b)=>b.p-a.p),good,cap,need,overall,noWall,furN,pot,perPerson:cap/P};
  }
  global.HouserStorage={DEF,CATS,STUFF,kindOf,evaluate};
})(window);
