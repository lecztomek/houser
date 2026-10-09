// Reguły generatora układu – same dane, bez logiki rysowania. Rozwijanie generatora = dopisanie wpisu tutaj.
//  TYPES     – rodzaje pomieszczeń (wymiary minimalne, proporcje, okno, z kim drzwi, w jakich strefach mogą stać)
//  QUESTIONS – ankieta (pytania i odpowiedzi domyślne)
//  ROOMS     – jakie pomieszczenia wynikają z odpowiedzi (kiedy, ile m², na której kondygnacji; floor 'flex' = generator wybiera)
//  RULES     – ogólne reguły: z odpowiedzi i listy pomieszczeń powstają warunki (format modułu Warunki + typy generatora)
// Funkcje w regułach dostają: a – odpowiedzi, r – pomieszczenie {id,type,t(rodzaj),name,area,floor}, P – program {rooms, has(id), side(rel)}
(function(global){
  // strefy w schematach: front – pas od wejścia, garden – pas od ogrodu, hall – pas korytarza, gar – blok garażu
  // blk: day / night / any / gar – w którym bloku (dzienny / nocny) może stać w schematach z podziałem na bloki
  // pass – można przez nie przejść dalej (hol, salon, kuchnia…); przez sypialnię czy łazienkę do innego pokoju się nie chodzi
  // hst – drzwi tarasowe od ogrodu; link – rodzaj połączenia z holem ('opening' = przejście bez drzwi)
  const TYPES={
    wiatrolap:{name:'Wiatrołap',color:'#a8a29e',pass:true,minW:1.5,asp:2.6,door:['hol','salon'],zones:['front','hall'],blk:'any',win:.5},
    hol:{name:'Hol',color:'#d6d3d1',pass:true,minW:1.2,hall:true},
    hol_gora:{name:'Hol',color:'#d6d3d1',pass:true,minW:1.2,hall:true},
    salon:{name:'Salon z jadalnią',color:'#22c55e',pass:true,hst:true,link:'opening',minW:3.6,asp:2.3,hab:true,door:['hol','wiatrolap'],zones:['garden'],blk:'day'},
    kuchnia:{name:'Kuchnia',color:'#14b8a6',pass:true,minW:2.4,asp:2.6,hab:true,door:['salon','hol'],zones:['garden','front','hall'],blk:'day'},
    spizarnia:{name:'Spiżarnia',color:'#eab308',minW:1.0,asp:3,door:['kuchnia','salon','hol'],zones:['front','garden','hall','gar'],blk:'day'},
    wc:{name:'WC',color:'#60a5fa',minW:1.2,asp:2.6,door:['hol','wiatrolap'],zones:['front','hall'],blk:'day',win:.3,wet:true},
    lazienka_p:{name:'Łazienka',color:'#3b82f6',minW:1.8,asp:2.4,door:['hol'],zones:['front','hall','garden'],blk:'any',win:.4,wet:true},
    tech:{name:'Pom. techniczne',color:'#64748b',pass:true,minW:1.5,asp:2.8,door:['hol','garaz','wiatrolap','kuchnia'],zones:['front','hall','gar'],blk:'day',win:.3,wet:true},
    gabinet:{name:'Gabinet',color:'#f59e0b',minW:2.4,asp:2.2,hab:true,door:['hol','hol_gora','salon'],zones:['front','garden','hall'],blk:'any'},
    gosc:{name:'Pokój gościnny',color:'#fb923c',minW:2.6,asp:2.2,hab:true,door:['hol'],zones:['front','garden','hall'],blk:'any'},
    pralnia:{name:'Pralnia',color:'#94a3b8',minW:1.5,asp:2.8,door:['hol','hol_gora','tech','garaz','lazienka'],zones:['front','hall','gar','garden'],blk:'any',win:.3,wet:true},
    garaz:{name:'Garaż',color:'#78716c',pass:true,minW:3.0,asp:2.4,door:['tech','hol','wiatrolap','pralnia'],zones:['gar'],blk:'gar'},
    sypialnia:{name:'Sypialnia',color:'#ef4444',minW:2.7,asp:2.1,hab:true,door:['hol','hol_gora'],zones:['front','garden','hall'],blk:'night'},
    lazienka:{name:'Łazienka',color:'#3b82f6',minW:1.8,asp:2.4,door:['hol_gora','hol'],zones:['front','garden','hall'],blk:'night',win:.4,wet:true},
    garderoba:{name:'Garderoba',color:'#a16207',minW:1.4,asp:3,door:['sypialnia1','hol_gora','hol'],zones:['front','garden','hall'],blk:'night'},
    pustka:{name:'Pustka nad salonem',color:'#e5e7eb',minW:2.4,asp:3,zones:['garden'],blk:'any',void:true}
  };
  const SIDE_OPTS=[['N','północ'],['E','wschód'],['S','południe'],['W','zachód']];
  const QUESTIONS=[
    {id:'persons',label:'Ile osób będzie mieszkać',type:'number',min:1,max:10,def:4},
    {id:'beds',label:'Ile sypialni',type:'number',min:1,max:6,def:3},
    {id:'storeys',label:'Kondygnacje',type:'choice',def:'attic',options:[['1','parterowy'],['attic','z poddaszem użytkowym'],['full','piętrowy (pełne piętro)']]},
    {id:'shape',label:'Kształt bryły',type:'choice',def:'any',options:[['any','dowolny – niech generator wybierze'],['rect','prostokąt'],['barn','stodoła (wąski, długi)'],['L','w kształcie L (parterowy)']]},
    {id:'area',label:'Powierzchnia użytkowa (m², puste = policz z liczby osób)',type:'number',min:0,max:400,def:0},
    {id:'kitchen',label:'Kuchnia',type:'choice',def:'open',options:[['open','otwarta na salon (aneks)'],['closed','osobna, zamykana']]},
    {id:'entrance',label:'Wejście do domu od strony',type:'choice',def:'N',options:SIDE_OPTS},
    {id:'garden',label:'Ogród (salon, taras) od strony',type:'choice',def:'S',options:SIDE_OPTS},
    {id:'garage',label:'Garaż w bryle domu',type:'choice',def:'0',options:[['0','bez garażu'],['1','na 1 auto'],['2','na 2 auta']]},
    {id:'extras',label:'Dodatkowo',type:'multi',def:['pantry','dress','laundry','mezz'],options:[['office','gabinet'],['guest','pokój gościnny na parterze'],['pantry','spiżarnia'],['dress','garderoba przy sypialni'],['laundry','pralnia'],['bath2','druga łazienka'],['mezz','antresola – pustka nad salonem']]}
  ];
  const one=a=>a.storeys==='1',x=(a,k)=>(a.extras||[]).includes(k);
  // pomieszczenia z odpowiedzi; floor: 'ground' | 'upper' | 'night' (sypialnie: piętro albo parter w parterowym) | 'flex' (generator wybiera)
  const ROOMS=[
    {id:'wiatrolap',type:'wiatrolap',floor:'ground',area:()=>4.5},
    {id:'salon',type:'salon',floor:'ground',area:a=>(a.kitchen==='open'?18:19)+3*a.persons,name:()=>'Salon z jadalnią'},
    // kuchnia zawsze osobnym pomieszczeniem; otwarta = szerokie przejście bez drzwi do salonu
    {id:'kuchnia',type:'kuchnia',floor:'ground',area:a=>a.kitchen==='open'?10:11,name:a=>a.kitchen==='open'?'Aneks kuchenny':'Kuchnia'},
    {id:'spizarnia',type:'spizarnia',floor:'ground',when:a=>x(a,'pantry'),area:()=>3},
    {id:'tech',type:'tech',floor:'ground',area:a=>+a.garage?4.5:6},
    {id:'garaz',type:'garaz',floor:'ground',when:a=>+a.garage>0,area:a=>+a.garage===1?20:36},
    {id:'wc',type:'wc',floor:'ground',when:a=>one(a)?(!x(a,'bath2')&&a.beds>=3):!(x(a,'bath2')||x(a,'guest')),area:a=>one(a)?2.5:3},
    {id:'lazienka_p',type:'lazienka_p',floor:'ground',when:a=>!one(a)&&(x(a,'bath2')||x(a,'guest')),area:()=>4.5},
    {id:'gabinet',type:'gabinet',floor:'flex',when:a=>x(a,'office'),area:()=>10},
    {id:'gosc',type:'gosc',floor:'ground',when:a=>!one(a)&&x(a,'guest'),area:()=>11},
    {id:'sypialnia{i}',type:'sypialnia',floor:'night',repeat:a=>a.beds,area:(a,i)=>i===1?15:11.5,name:(a,i)=>i===1?'Sypialnia główna':'Sypialnia '+i},
    {id:'lazienka',type:'lazienka',floor:'night',area:()=>7},
    {id:'lazienka2',type:'lazienka_p',floor:'night',when:a=>one(a)&&x(a,'bath2'),area:()=>4.5,name:()=>'Łazienka przy sypialni',blk:'night',door:['sypialnia1','hol']},
    {id:'garderoba',type:'garderoba',floor:'night',when:a=>x(a,'dress'),area:()=>5},
    {id:'pralnia',type:'pralnia',floor:'flex',when:a=>x(a,'laundry'),area:()=>4},
    {id:'pustka',type:'pustka',floor:'upper',when:a=>!one(a)&&x(a,'mezz'),area:(a,i,P)=>Math.max(9,Math.round((P.room('salon')?.area||30)*.38))}
  ];
  const D={N:'north',E:'east',S:'south',W:'west'},PL={N:'północ',E:'wschód',S:'południe',W:'zachód'};
  const f1=v=>(Math.round(v*10)/10).toLocaleString('pl-PL');
  // warunki: each – dla każdego pomieszczenia spełniającego warunek; when – raz, jeśli spełnione; make – warunek albo lista warunków
  // floor:'auto' – kondygnacja pomieszczenia (dla pomieszczeń, które generator może przenieść)
  const RULES=[
    {id:'minArea',group:'Powierzchnie',each:r=>!r.t.void,make:r=>({type:'minArea',severity:'hard',room:r.id,value:Math.round(r.area*.82*2)/2,label:r.name+': min. '+f1(r.area*.82)+' m²'})},
    {id:'maxArea',group:'Powierzchnie',each:r=>!r.t.void,make:r=>({type:'maxArea',severity:'medium',room:r.id,value:Math.round(r.area*1.25*2)/2,label:r.name+': maks. '+f1(r.area*1.25)+' m² (bez marnowania miejsca)'})},
    {id:'minWidth',group:'Szerokości',each:r=>!r.t.void,make:r=>{const m=r.id==='sypialnia1'?3:r.t.minW;return {type:'minRoomWidth',severity:'hard',room:r.id,meters:m,label:r.name+': szerokość min. '+f1(m)+' m'}}},
    {id:'window',group:'Światło',each:r=>r.t.hab,make:r=>({type:'edge',severity:'hard',room:r.id,edge:'any',label:r.name+': przy ścianie zewnętrznej (okno)'})},
    {id:'salonGarden',group:'Strony świata',each:r=>r.type==='salon',make:(r,a)=>[{type:'edge',severity:'hard',room:r.id,edge:D[a.garden],label:'Salon od ogrodu ('+PL[a.garden]+')'},
      {type:'edgeLengthMin',severity:'medium',room:r.id,edge:D[a.garden],meters:3.5,label:'Salon: min. 3,5 m ściany od ogrodu (przeszklenie, taras)'}]},
    {id:'entrance',group:'Strony świata',each:r=>r.type==='wiatrolap',make:(r,a)=>({type:'edge',severity:'hard',room:r.id,edge:D[a.entrance],label:'Wejście od strony: '+PL[a.entrance]})},
    {id:'garageGate',group:'Strony świata',each:r=>r.type==='garaz',make:(r,a)=>({type:'edge',severity:'hard',room:r.id,edge:D[a.entrance],label:'Brama garażu od strony wjazdu ('+PL[a.entrance]+')'})},
    {id:'kitchenSalon',group:'Sąsiedztwa',when:(a,P)=>P.has('kuchnia'),make:(r,a)=>a.kitchen==='open'?{type:'sharedEdgeMin',severity:'hard',floor:'ground',a:'kuchnia',b:'salon',meters:2.5,label:'Aneks kuchenny otwarty na salon (min. 2,5 m wspólnej ściany)'}:{type:'adjacent',severity:'medium',floor:'ground',a:'kuchnia',b:'salon',label:'Kuchnia obok salonu'}},
    {id:'pantryKitchen',group:'Sąsiedztwa',when:(a,P)=>P.has('spizarnia'),make:(r,a,P)=>({type:'openingBetween',severity:'medium',floor:'ground',a:'spizarnia',b:'kuchnia',types:['door'],meters:.9,label:'Spiżarnia z wejściem z kuchni'})},
    {id:'dressBed',group:'Sąsiedztwa',when:(a,P)=>P.has('garderoba'),make:()=>({type:'openingBetween',severity:'soft',floor:'auto',a:'garderoba',b:'sypialnia1',types:['door'],meters:.9,label:'Garderoba z wejściem z sypialni głównej'})},
    {id:'garageHouse',group:'Sąsiedztwa',when:(a,P)=>P.has('garaz'),make:()=>({type:'adjacent',severity:'soft',floor:'ground',a:'garaz',b:'tech',label:'Z garażu do domu przez pom. techniczne'})},
    {id:'quietBed',group:'Akustyka',when:a=>one(a),make:()=>({type:'notAdjacent',severity:'soft',floor:'ground',a:'salon',b:'sypialnia1',label:'Sypialnia główna nie przy salonie (cisza)'})},
    {id:'quietMezz',group:'Akustyka',when:(a,P)=>P.has('pustka'),make:()=>({type:'notAdjacent',severity:'soft',floor:'upper',a:'sypialnia1',b:'pustka',label:'Sypialnia główna nie przy pustce (cisza)'})},
    {id:'techWall',group:'Instalacje',when:(a,P)=>P.has('tech'),make:()=>({type:'edge',severity:'medium',floor:'ground',room:'tech',edge:'any',label:'Techniczne przy ścianie zewnętrznej (czerpnia, wyrzut spalin)'})},
    {id:'wetStack',group:'Instalacje',when:a=>!one(a),make:()=>({type:'overlapMin',severity:'soft',upperFloor:'upper',upperRoom:'lazienka',lowerFloor:'ground',lowerRooms:['wc','lazienka_p','tech','spizarnia','kuchnia','pralnia','wiatrolap','hol'],ratio:.6,label:'Łazienka piętra nad pomieszczeniami mokrymi / holem (krótkie piony)'})},
    {id:'mezzOver',group:'Antresola',when:(a,P)=>P.has('pustka'),make:()=>[{type:'overlapMin',severity:'hard',upperFloor:'upper',upperRoom:'pustka',lowerFloor:'ground',lowerRooms:['salon'],ratio:1,label:'Pustka (antresola) w całości nad salonem'},
      {type:'sharedEdgeMin',severity:'medium',floor:'upper',a:'pustka',b:'hol_gora',meters:1.5,label:'Antresola: z holu piętra widok na salon (min. 1,5 m)'}]},
    {id:'whole',group:'Kształt',make:(r,a,P)=>P.floors.map(f=>({type:'contiguousAll',severity:'hard',floor:f,label:(f==='ground'?'Parter':'Piętro')+': każde pomieszczenie w jednym kawałku'}))},
    {id:'reach',group:'Komunikacja',make:(r,a,P)=>P.floors.map(f=>({type:'reachableRooms',severity:'hard',floor:f,startRoom:f==='ground'?'wiatrolap':'hol_gora',rooms:['*'],types:['door','opening'],label:(f==='ground'?'Parter: od wejścia':'Piętro: od schodów')+' da się dojść do każdego pomieszczenia (nie przez sypialnię / łazienkę)'}))},
    // sens i oszczędność miejsca – typy generatora (gen:true; nie trafiają do modułu Warunki)
    {id:'hallShare',group:'Oszczędność miejsca',make:(r,a,P)=>P.floors.map(f=>{const m=P.one?.12:.15;return {type:'hallShare',gen:true,severity:'medium',floor:f,max:m,label:(f==='ground'?'Parter':'Piętro')+': hol'+(P.one?' i korytarze':' ze schodami')+' maks. '+Math.round(m*100)+'% powierzchni'}})},
    {id:'areaFit',group:'Oszczędność miejsca',make:()=>({type:'areaFit',gen:true,severity:'medium',tol:.08,label:'Dom nie większy niż trzeba: metraż pomieszczeń zgodny z programem (±8%)'})},
    {id:'shapes',group:'Oszczędność miejsca',make:()=>({type:'roomShapes',gen:true,severity:'medium',fill:.92,label:'Pomieszczenia prostokątne, bez „kiszek” i zakamarków (dają się umeblować)'})},
    {id:'compact',group:'Oszczędność miejsca',make:()=>({type:'compact',gen:true,severity:'soft',max:17.5,label:'Zwarta bryła (mniej ścian zewnętrznych = taniej i cieplej)'})},
    {id:'floorsBalance',group:'Oszczędność miejsca',when:a=>!one(a),make:()=>({type:'floorsBalance',gen:true,severity:'medium',tol:.12,label:'Parter i piętro podobnie wykorzystane (bez pustych metrów na żadnej kondygnacji)'})},
    {id:'stairs',group:'Komunikacja',when:a=>!one(a),make:()=>({type:'stairsFit',gen:true,severity:'hard',label:'Schody mieszczą się w holu na obu kondygnacjach'})}
  ];
  global.HouserGenRules={TYPES,QUESTIONS,ROOMS,RULES};
})(typeof window!=='undefined'?window:globalThis);
