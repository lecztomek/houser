// Instalacja grzewcza zaprojektowana przez użytkownika (moduł Instalacja grzewcza) i jej ocena (moduł Ogrzewanie, Porównanie).
// project.heatingSystem = {main, extra, share, buffer, dhw, devices:{main|extra|out|buffer|dhw|man:<kondygnacja>:{f,x,y}}, emitters:{'<kond>|<id>':'floor'|…}}
// HouserHeatSys.evaluate(project) -> {designed, sys, rooms, devs, floors, issues, good, cost, invest, year, total, ease, …}
// Wymaga shared/quantities.js, shared/energy.js i shared/heating.js.
(function(global){
  const SOURCES={
    hp_air:{name:'Pompa ciepła powietrze–woda',dev:'Pompa ciepła – moduł wewnętrzny',short:'Pompa',foot:.5,hydro:true,out:true},
    hp_ground:{name:'Pompa ciepła gruntowa',dev:'Pompa ciepła gruntowa',short:'Pompa',foot:.6,hydro:true},
    gas:{name:'Kocioł gazowy kondensacyjny',dev:'Kocioł gazowy',short:'Gaz',foot:.3,hydro:true,flue:true},
    pellet:{name:'Kocioł na pellet',dev:'Kocioł na pellet z zasobnikiem',short:'Pellet',foot:2.2,hydro:true,flue:true,solid:true},
    wood:{name:'Kocioł zgazowujący drewno',dev:'Kocioł na drewno',short:'Drewno',foot:1,hydro:true,flue:true,solid:true},
    electric:{name:'Ogrzewanie elektryczne',dev:null,short:'Prąd',foot:0},
  };
  const EXTRAS={
    none:{name:'brak'},
    fireplace:{name:'Kominek z wkładem (powietrzny)',dev:'Kominek',short:'Kominek',share:25,flue:true,room:true,invest:18000,service:250,eff:.78,how:'grzeje salon i przez rozprowadzenie powietrza (DGP) sąsiednie pokoje'},
    fireplace_water:{name:'Kominek z płaszczem wodnym',dev:'Kominek z płaszczem wodnym',short:'Kominek',share:40,flue:true,room:true,hydro:true,invest:24000,service:300,eff:.75,how:'oddaje ciepło do bufora i dalej do całej instalacji'},
    hp_air:{name:'Pompa ciepła powietrze–woda',dev:'Pompa ciepła – moduł wewnętrzny',short:'Pompa 2',share:60,hydro:true,out:true,foot:.5},
    gas:{name:'Kocioł gazowy',dev:'Kocioł gazowy',short:'Gaz',share:25,hydro:true,flue:true,foot:.3},
    pellet:{name:'Kocioł na pellet',dev:'Kocioł na pellet',short:'Pellet',share:50,hydro:true,flue:true,solid:true,foot:2.2},
    wood:{name:'Kocioł na drewno',dev:'Kocioł na drewno',short:'Drewno',share:50,hydro:true,flue:true,solid:true,foot:1},
    electric:{name:'Grzałka / grzejniki elektryczne (zapas)',share:3,invest:1500,service:0},
  };
  const EMIT={floor:'podłogówka','floor+ladder':'podłogówka + drabinka','floor+rad':'podłogówka + grzejnik',rad:'grzejnik',ladder:'drabinka',none:'bez ogrzewania'};
  const DEVS={main:'Źródło ciepła',extra:'Źródło alternatywne',out:'Jednostka zewnętrzna',buffer:'Bufor ciepła',dhw:'Zasobnik ciepłej wody',man:'Rozdzielacz'};
  const DEF={main:'hp_air',extra:'none',share:null,buffer:'auto',dhw:200};
  const PRICE={floorM2:170,manifold:3500,rad:1100,ladder:1400,pipeM:60,mainM:130,outM:300,czopuch:1500,chimney:7000,flue2:2500,dhwTank:4000};
  const BUF={0:[0,0],100:[2500,.3],200:[3500,.4],300:[4200,.5],500:[5500,.7],800:[7500,1],1000:[8500,1.1]};
  const re={bath:/łazien|lazien/i,wc:/\bwc\b|toalet/i,util:/techn|kotłown|kotlown|kotł|kotl/i,garage:/garaż|garaz/i,bed:/sypial|pokój|pokoj|gabinet|dziec|gości|gosci/i,living:/salon|dzienny|jadal/i,kitchen:/kuchni|aneks/i,stairs:/schod/i};
  const fmt=(v,d=1)=>(Math.round(v*10**d)/10**d).toLocaleString('pl-PL',{minimumFractionDigits:d,maximumFractionDigits:d});
  const fm=v=>fmt(v,1)+' m';

  function defaultEmit(r){const n=r.name||'';if(re.garage.test(n)||re.stairs.test(n))return 'none';if(re.bath.test(n))return 'floor+ladder';if(r.area<3&&!re.wc.test(n))return 'none';return 'floor'}
  function normalize(project){const s={...DEF,...(project.heatingSystem||{})};if(!SOURCES[s.main])s.main=DEF.main;if(!EXTRAS[s.extra]||s.extra===s.main)s.extra='none';
    s.share=Number.isFinite(+s.share)&&s.share!==null?Math.max(0,Math.min(80,+s.share)):(EXTRAS[s.extra].share||0);s.devices={...(s.devices||{})};s.emitters={...(s.emitters||{})};return s}
  // które urządzenia są potrzebne przy wybranych źródłach
  function needed(s,floorsWithWater){const out=[];if(SOURCES[s.main].dev)out.push('main');const ex=EXTRAS[s.extra];if(ex.dev)out.push('extra');
    if(SOURCES[s.main].out||ex.out)out.push('out');out.push('dhw');if(s.buffer!=='0'&&s.buffer!==0)out.push('buffer');for(const f of floorsWithWater)out.push('man:'+f);return out}

  function evaluate(project){
    const designed=!!project.heatingSystem,s=normalize(project);
    const HS={...HouserHeating.DEF,...(project.heatingSettings||{})};
    const E=HouserEnergy.compute(project),q=E.q,S=E.s,c=q.c,lo=q.lo,up=q.up,W=q.W,H=q.H;
    const hFloor=(q.G.groundHeight||2.8)+.3;
    const occ=(f,x,y)=>q.rooms.find(r=>r.f===f&&r.cells.some(([a,b])=>a===x&&b===y));
    // zapotrzebowanie na ciepło w pokojach (przegrody pokoju), przeskalowane do bilansu z modułu Energia
    const U=S.U,br=S.bridge,eta=S.vent==='mech'?S.eta/100:0,heatedUp=q.net[up]>0;
    const rooms=q.rooms.map(r=>{const key=r.f+'|'+r.id,n=r.name||'',garage=re.garage.test(n);const h=r.f===lo?q.G.groundHeight:(q.attic?(r.minH+r.maxH)/2:q.G.upperHeight);
      const glaz=r.winA+r.hstA,wall=Math.max(0,r.extEdges*c*q.hWall[r.f]-glaz);
      let Hr=wall*(U.wall+br)+glaz*U.win+r.roofWinA*U.roofwin+.34*r.area*h*(.5*(1-eta)+S.inf);
      if(r.f===lo)Hr+=r.area*(U.floor+br)*.6;if(r.f===up||!heatedUp)Hr+=r.area*(U.roof+br)*(q.attic&&r.f===up?1.15:1);
      const emit=s.emitters[key]||defaultEmit(r);return {key,f:r.f,id:r.id,name:n,area:r.area,cells:r.cells,garage,bath:re.bath.test(n),Hr:garage?0:Hr,emit,emitAuto:!s.emitters[key]}});
    const sumH=rooms.reduce((a,r)=>a+r.Hr,0)||1,k=E.Htot/sumH;
    for(const r of rooms){r.load=r.Hr*k*E.dT;r.wpm=r.area>0?r.load/r.area:0}
    const elec=s.main==='electric';
    const water=r=>!elec&&r.emit!=='none';
    const floorsW=[lo,up].filter(f=>rooms.some(r=>r.f===f&&water(r)));
    const need=needed(s,floorsW);
    // pomieszczenie techniczne / garaż – domyślne miejsce urządzeń
    const util=rooms.find(r=>r.f===lo&&re.util.test(r.name))||rooms.find(r=>re.util.test(r.name))||rooms.find(r=>r.f===lo&&r.garage)||rooms.find(r=>r.f===lo&&re.kitchen.test(r.name))||rooms.find(r=>r.f===lo);
    const centre=r=>{if(!r)return {f:lo,x:0,y:0};const sx=r.cells.reduce((a,p)=>a+p[0],0)/r.cells.length,sy=r.cells.reduce((a,p)=>a+p[1],0)/r.cells.length;let b=r.cells[0],bd=1e9;for(const p of r.cells){const d=(p[0]-sx)**2+(p[1]-sy)**2;if(d<bd){bd=d;b=p}}return {f:r.f,x:b[0],y:b[1]}};
    const issues=[],good=[];const add=(p,text,tip,cost)=>issues.push({p,text,tip,cost:cost||0});
    // urządzenia: wstawione na rzut albo założone
    const devs={};for(const d of need){const v=s.devices[d];let pos=v&&Number.isFinite(v.x)?{...v}:null,placed=!!pos;
      if(!pos){if(d==='out'){const m=devs.main||centre(util);pos=nearestOutside(m)}else if(d.startsWith('man:')){const f=d.slice(4),m=devs.main||centre(util);pos=f===m.f?{...m}:{...m,f}}else if(d==='extra'&&EXTRAS[s.extra].room){pos=centre(rooms.find(r=>re.living.test(r.name)&&r.f===lo)||util)}else pos={...(devs.main||centre(util))}}
      pos.room=d==='out'?null:occ(pos.f,pos.x,pos.y)||null;devs[d]={...pos,placed,type:d}}
    function nearestOutside(m){let best=null,bd=1e9;for(let y=-1;y<=H;y++)for(let x=-1;x<=W;x++){if(occ(lo,x,y))continue;const nb=[[1,0],[-1,0],[0,1],[0,-1]].some(([a,b])=>occ(lo,x+a,y+b));if(!nb)continue;const d=Math.abs(x-m.x)+Math.abs(y-m.y);if(d<bd){bd=d;best={f:lo,x,y}}}return best||{f:lo,x:-1,y:0}}
    const unplacedIssue=()=>{const unplaced=need.filter(d=>!devs[d].placed);
    if(designed&&unplaced.length)add(0,'Nie wstawiono na rzut: '+unplaced.map(d=>d.startsWith('man:')?(d.slice(4)===lo?'Rozdzielacz na parterze':'Rozdzielacz na piętrze'):DEVS[d]).join(', ')+' – liczę tak, jakby stały w pomieszczeniu „'+(util?.name||'?')+'”.','Wstaw urządzenia na rzut w module Instalacja grzewcza, żeby policzyć dokładne odległości.');};
    const dist=(a,b)=>(Math.abs(a.x-b.x)+Math.abs(a.y-b.y))*c+(a.f!==b.f?hFloor:0);
    const cost=[];const addC=(name,v,note,room)=>{if(v>0)cost.push({name,v,note:note||'',room:!!room})};
    // podłogówka czy grzejniki – wpływa na sprawność pompy
    const fA=rooms.filter(r=>/floor/.test(r.emit)).reduce((a,r)=>a+r.area,0),rA=rooms.filter(r=>/rad/.test(r.emit)).reduce((a,r)=>a+r.area,0);
    const emitters=fA>=rA?'floor':'radiators';
    const C=HouserHeating.compare(project,{...HS,emitters}),M=C.list.find(m=>m.k===s.main),SRC=SOURCES[s.main],EX=EXTRAS[s.extra];
    // źródło główne
    addC(SRC.name,s.main==='wood'?M.invest-7000-(C.chimney?0:7000):s.main==='pellet'?M.invest-(C.chimney?0:7000):M.invest,s.main==='electric'?'maty / grzejniki elektryczne w pokojach':'urządzenie z montażem'+(s.main==='hp_air'||s.main==='hp_ground'||s.main==='gas'?', z zasobnikiem ciepłej wody':''));
    if(!['hp_air','hp_ground','gas'].includes(s.main))addC('Zasobnik ciepłej wody '+s.dhw+' l',PRICE.dhwTank);
    // źródło dodatkowe
    let exInv=0,exPer=0,exService=0;
    if(s.extra!=='none'){const m=C.list.find(x=>x.k===s.extra);
      if(EX.invest!=null){exInv=EX.invest;exService=EX.service}else{exInv=s.extra==='hp_air'?m.invest*.85:s.extra==='gas'?m.invest:m.invest-(C.chimney?0:7000)-(s.extra==='wood'?7000:0);exService=m.service}
      exPer=EX.eff?S.pWood/S.woodKWh/EX.eff:s.extra==='electric'?S.pEl*(HS.pv==='yes'?.6:1):m.perKWh;addC(EX.name,exInv,EX.how||'drugie urządzenie z montażem')}
    // bufor
    const load=E.load,solidMain=!!SRC.solid,hydroN=[SRC.hydro,EX.hydro].filter(Boolean).length;
    let rec=0,recWhy='';if(s.main==='wood'){rec=Math.max(800,Math.ceil(load*55/100)*100);recWhy='kocioł na drewno pracuje pełną mocą i potrzebuje bufora ok. 50 l na kW'}
      else if(s.extra==='wood'){rec=800;recWhy='kocioł na drewno jako drugie źródło potrzebuje dużego bufora'}
      else if(s.extra==='fireplace_water'){rec=500;recWhy='kominek z płaszczem wodnym oddaje ciepło do bufora'}
      else if(hydroN>=2){rec=200;recWhy='dwa źródła wodne trzeba połączyć przez bufor albo sprzęgło'}
      else if(s.main==='pellet'&&load<8){rec=200;recWhy='najmniejsze kotły na pellet mają ok. 10 kW – przy małym domu bufor wydłuża pracę kotła'}
      else if(SRC.out&&emitters==='radiators'){rec=100;recWhy='pompa z grzejnikami pracuje spokojniej z małym buforem'}
    if(elec)rec=0;
    let buf=s.buffer==='auto'?rec:+s.buffer||0;buf=[0,100,200,300,500,800,1000].find(v=>v>=buf)??1000;
    if(!buf){const i=need.indexOf('buffer');if(i>=0)need.splice(i,1);delete devs.buffer}
    unplacedIssue();
    const bufInfo=BUF[buf];if(buf)addC('Bufor ciepła '+buf+' l',bufInfo[0],s.buffer==='auto'?'dobrany automatycznie':'');
    if(rec&&buf<rec)add(rec>=500?2:1,(buf?'Bufor '+buf+' l to za mało':'Brak bufora')+': '+recWhy+' (zalecane ok. '+rec+' l).','Ustaw większy bufor w module Instalacja grzewcza.');
    else if(rec&&buf)good.push('Bufor '+buf+' l – '+recWhy+'.');
    if(!rec&&buf>=300)add(.3,'Bufor '+buf+' l jest większy, niż potrzeba – zajmuje miejsce i traci ciepło.','Przy jednym źródle i podłogówce bufor zwykle nie jest potrzebny.');
    // gaz w ulicy
    if((s.main==='gas'||s.extra==='gas')&&HS.gas==='no')add(5,'Wybrano kocioł gazowy, a w ulicy nie ma gazu.','Zmień źródło albo ustaw „Gaz w ulicy” w module Ogrzewanie.');
    // połączenia rurowe: źródło → rozdzielacze → pokoje
    let mainPipe=0,leadPipe=0,loops=0,radN=0,ladN=0,floorM2=0;const floors={};
    if(!elec){for(const f of floorsW){const man=devs['man:'+f],src=devs.main||devs.extra,d=src?dist(src,man):0;mainPipe+=d;
        const R=rooms.filter(r=>r.f===f&&water(r));let outs=0,maxLead=0,farRoom=null;
        for(const r of R){let md=1e9;for(const [x,y] of r.cells)md=Math.min(md,Math.abs(x-man.x)+Math.abs(y-man.y));const lead=Math.max(0,md-1)*c+1;r.lead=lead;
          let n=0;if(/floor/.test(r.emit)){const l=Math.max(1,Math.ceil(r.area/12));n+=l;loops+=l;floorM2+=r.area;leadPipe+=2*lead*l}
          if(/rad/.test(r.emit)){const nr=Math.max(1,Math.ceil((r.emit==='rad'?r.load:Math.max(0,r.load-r.area*.85*70))/1000));n+=nr;radN+=nr;leadPipe+=2*lead*nr}
          if(/ladder/.test(r.emit)){n++;ladN++;leadPipe+=2*lead}
          r.outs=n;outs+=n;if(lead>maxLead){maxLead=lead;farRoom=r}}
        const mans=Math.max(1,Math.ceil(outs/12));floors[f]={man,outs,mans,maxLead,farRoom,riser:d};
        if(mans>1)add(.5,'Rozdzielacz na '+(f===lo?'parterze':'piętrze')+' ma '+outs+' obwodów – potrzebne '+mans+' rozdzielacze.','Jeden rozdzielacz obsłuży ok. 12 pętli; drugi postaw po przeciwnej stronie kondygnacji.');
        if(maxLead>12)add(Math.min(2,(maxLead-12)/6),'Od rozdzielacza na '+(f===lo?'parterze':'piętrze')+' do pokoju „'+farRoom.name+'” jest ok. '+fm(maxLead)+' – długie doprowadzenia grzeją korytarze, a pętle wychodzą za długie.','Przesuń rozdzielacz bliżej środka kondygnacji.');
        if(f!==(devs.main||devs.extra)?.f){const hor=d-hFloor;if(hor>6)add(Math.min(1.5,(hor-6)/5),'Rozdzielacz na piętrze jest ok. '+fm(hor)+' w poziomie od źródła – rury trzeba prowadzić w stropie.','Najkrócej, gdy rozdzielacz na piętrze stoi nad pomieszczeniem technicznym.');else good.push('Rozdzielacz na piętrze blisko pionu od źródła ('+fm(d)+').')}}
      addC('Podłogówka '+fmt(floorM2,0)+' m²',floorM2*PRICE.floorM2,loops+' pętli, rury, izolacja, montaż (bez wylewki)',1);
      const mansN=Object.values(floors).reduce((a,x)=>a+x.mans,0);addC('Rozdzielacze ('+mansN+')',mansN*PRICE.manifold,'z szafką i grupą pompową',1);
      addC('Grzejniki ('+radN+')',radN*PRICE.rad*(SRC.out||s.main==='hp_ground'?1.3:1),SRC.out||s.main==='hp_ground'?'niskotemperaturowe (większe) – pod pompę ciepła':'',1);
      addC('Grzejniki łazienkowe – drabinki ('+ladN+')',ladN*PRICE.ladder,1);
      addC('Rury do pokoi',leadPipe*PRICE.pipeM,'ok. '+fmt(leadPipe,0)+' m (zasilanie + powrót)',1);
      addC('Rury źródło → rozdzielacze',mainPipe*2*PRICE.mainM,'ok. '+fmt(mainPipe,1)+' m trasy');
      if(rA>0&&(SRC.out||s.main==='hp_ground'))add(.5,'Pompa ciepła z grzejnikami pracuje z niższą sprawnością niż z podłogówką.','Grzejniki muszą być większe (niskotemperaturowe) – tam, gdzie się da, lepsza podłogówka.')}
    // jednostka zewnętrzna
    if(devs.out){const o=devs.out,inU=devs.main&&SOURCES[s.main].out?devs.main:devs.extra||devs.main;
      if(occ(lo,o.x,o.y))add(1.5,'Jednostka zewnętrzna stoi w środku domu.','Postaw ją na zewnątrz przy ścianie.');
      else{const near=[[1,0],[-1,0],[0,1],[0,-1]].some(([a,b])=>occ(lo,o.x+a,o.y+b));let dh=1e9;for(const r of rooms)if(r.f===lo)for(const [x,y] of r.cells)dh=Math.min(dh,Math.abs(x-o.x)+Math.abs(y-o.y));
        const pipe=(inU?dist(inU,o):0);addC('Połączenie z jednostką zewnętrzną',pipe*PRICE.outM,'ok. '+fm(pipe)+' przewodów');
        if(pipe>10)add(Math.min(1.5,(pipe-10)/8),'Jednostka zewnętrzna jest ok. '+fm(pipe)+' od modułu wewnętrznego – długie, ocieplone przewody i straty ciepła.','Postaw ją przy ścianie pomieszczenia technicznego.');else good.push('Jednostka zewnętrzna blisko modułu wewnętrznego ('+fm(pipe)+').');
        if(!near&&dh>2)add(.3,'Jednostka zewnętrzna stoi daleko od ściany domu.','');
        // okna sypialni w pobliżu
        let bw=null,bd=1e9;for(const run of q.runs){if(run.base!=='window'&&run.base!=='hst')continue;if(!run.ext)continue;const r=run.rooms[0];if(!r||!re.bed.test(r.name||''))continue;
          const mid=(run.from+run.to+1)/2,px=run.o==='h'?mid:run.line,py=run.o==='h'?run.line:mid;const d=Math.hypot(px-(o.x+.5),py-(o.y+.5))*c+(run.f===up?2.5:0);if(d<bd){bd=d;bw=r}}
        if(bw&&bd<3)add(1,'Jednostka zewnętrzna jest ok. '+fm(bd)+' od okna pokoju „'+bw.name+'” – szum w nocy.','Postaw ją przy ścianie kuchni, garażu albo technicznego, co najmniej 3–5 m od okien sypialni.');}}
    // pomieszczenia z urządzeniami: miejsce, komin, charakter pomieszczenia
    const byRoom={};for(const d of ['main','extra','buffer','dhw']){const v=devs[d];if(!v||!v.room)continue;(byRoom[v.room.f+'|'+v.room.id]=byRoom[v.room.f+'|'+v.room.id]||{room:v.room,list:[]}).list.push(d)}
    const footOf=d=>d==='main'?SRC.foot:d==='extra'?(EX.room?0:EX.foot||0):d==='buffer'?bufInfo[1]:d==='dhw'?(['hp_air','hp_ground','gas'].includes(s.main)&&devs.dhw.room===devs.main?.room?0:.4):0;
    for(const {room,list} of Object.values(byRoom)){const need_=list.reduce((a,d)=>a+footOf(d),0)*2.5;const util_=re.util.test(room.name||'')||re.garage.test(room.name||'');
      if(need_>0&&util_&&room.area<need_)add(Math.min(2,1+(need_-room.area)/3),'W pomieszczeniu „'+room.name+'” ('+fmt(room.area)+' m²) jest za ciasno: urządzenia z miejscem do obsługi potrzebują ok. '+fmt(need_)+' m².','Powiększ pomieszczenie techniczne albo przenieś bufor / zasobnik.');
      else if(need_>0&&util_)good.push('Urządzenia mieszczą się w pomieszczeniu „'+room.name+'” ('+fmt(room.area)+' m²).')}
    const chim=new Set(project.structure?.chimney||[]),chCells=[...chim].map(n=>({x:n%W,y:Math.floor(n/W)}));
    const flues=[];
    for(const d of ['main','extra']){const v=devs[d];if(!v)continue;const info=d==='main'?SRC:EX;const nm=d==='main'?SRC.name:EX.name;const room=v.room;const rn=room?.name||'';
      if(info.solid&&room&&!re.util.test(rn)&&!re.garage.test(rn))add(2.5,nm+' stoi w pomieszczeniu „'+rn+'” – kocioł na paliwo stałe musi stać w kotłowni.','Przenieś kocioł do pomieszczenia technicznego (kotłowni) z kominem i wentylacją.');
      if(d==='main'&&s.main==='gas'&&room&&(re.bed.test(rn)||re.living.test(rn)))add(1,'Kocioł gazowy w pomieszczeniu „'+rn+'”.','Kocioł gazowy najlepiej w technicznym, kuchni albo łazience.');
      if(/Pompa/.test(info.dev||'')&&room&&re.bed.test(rn))add(1,'Moduł pompy ciepła w pokoju „'+rn+'” – szum pompy obiegowej.','Postaw go w technicznym, pralni albo garażu.');
      if(info.flue&&!(d==='main'&&s.main==='gas')){let md=1e9;for(const ch of chCells)md=Math.min(md,Math.max(Math.abs(ch.x-v.x),Math.abs(ch.y-v.y)));
        if(md<=1){good.push(nm+' stoi przy kominie.');flues.push(d)}
        else if(md*c<=2){add(.5,nm+' jest ok. '+fm(md*c)+' od komina – potrzebny czopuch (poziomy łącznik).','Najlepiej, gdy urządzenie stoi tuż przy kominie.',PRICE.czopuch);addC('Czopuch do komina',PRICE.czopuch);flues.push(d)}
        else{add(1,(chCells.length?nm+' jest daleko od komina ('+fm(md*c)+')':'W projekcie nie ma komina')+' – trzeba zbudować osobny komin przy urządzeniu.','Wstaw komin przy kotłowni / kominku w module Układ pomieszczeń.',PRICE.chimney);addC('Nowy komin – '+nm,PRICE.chimney)}}}
    if(flues.length===2){addC('Drugi przewód w kominie',PRICE.flue2,'dwa urządzenia – komin dwuprzewodowy');good.push('Dwa urządzenia korzystają z komina – potrzebny komin z dwoma przewodami.')}
    // kominek: czy nie przegrzeje pokoju
    if(EX.room&&devs.extra?.room){const r=rooms.find(x=>x.key===devs.extra.room.f+'|'+devs.extra.room.id);if(r&&s.extra==='fireplace'&&r.load<2000)add(.5,'Kominek (ok. 6–8 kW) w pomieszczeniu „'+r.name+'”, które potrzebuje tylko ok. '+fmt(r.load/1000)+' kW – będzie za gorąco.','Wybierz mały wkład albo rozprowadzenie gorącego powietrza (DGP) do innych pokoi.');
      if(r&&!re.living.test(r.name))add(.3,'Kominek stoi w pomieszczeniu „'+r.name+'”, a zwykle stawia się go w salonie.','')}
    // połączenia źródeł
    if(s.extra!=='none'){const pair=s.main+'+'+s.extra;
      if(/^hp_.*\+fireplace/.test(pair))good.push('Pompa ciepła z kominkiem: kominek dogrzewa w mrozy, gdy pompa ma najniższą sprawność.');
      if(pair==='gas+hp_air'||pair==='hp_air+gas')good.push('Układ hybrydowy: pompa grzeje większość roku, gaz w największe mrozy.');
      if(SRC.solid&&EX.solid)add(1,'Dwa kotły na paliwo stałe – dużo obsługi i dwa przewody kominowe.','Połącz raczej kocioł z pompą ciepła albo z grzałką.');
      if(s.extra==='electric'&&SRC.out)good.push('Grzałka jako zapas – większość pomp ciepła już ją ma.');
      if(s.main==='electric'&&EX.hydro)add(1.5,'Ogrzewanie elektryczne z drugim źródłem wodnym – bez instalacji wodnej w pokojach drugie źródło nie ma czym oddać ciepła.','Przy grzejnikach elektrycznych drugim źródłem może być tylko kominek powietrzny.');
      if(hydroN>=2)good.push('Dwa źródła wodne – sterownik musi przełączać je automatycznie.')}
    // pokoje: czy ogrzewanie wystarczy
    const T_FLOOR={def:70,bath:100};
    for(const r of rooms){if(r.garage){if(r.emit!=='none')r.note='garaż zwykle się nie ogrzewa';continue}
      const capF=r.area*.85*(r.bath?T_FLOOR.bath:T_FLOOR.def),capL=/ladder/.test(r.emit)?500:0;
      if(r.emit==='none'){r.ok=r.load<400||r.area<4;if(!r.ok)add(Math.min(1,.4+r.load/3000),'Pokój „'+r.name+'” jest bez ogrzewania, a traci ok. '+fmt(r.load/1000,1)+' kW – będzie chłodny.','Dodaj podłogówkę albo grzejnik.')}
      else if(elec)r.ok=true;
      else if(r.emit==='floor'||r.emit==='floor+ladder'){r.cap=capF+capL;r.ok=r.cap>=r.load;if(!r.ok)add(Math.min(1.5,.5+(r.load-r.cap)/1500),'W pokoju „'+r.name+'” sama podłogówka nie da rady: potrzeba ok. '+Math.round(r.wpm)+' W/m², a podłoga odda ok. '+Math.round(r.cap/r.area)+' W/m² (duże okna / zewnętrzne ściany).','Dołóż grzejnik („podłogówka + grzejnik”) albo zmniejsz okna / popraw izolację.')}
      else r.ok=true}
    const noHeat=rooms.filter(r=>!r.garage&&!r.ok&&r.emit!=='none').length;if(!noHeat&&rooms.some(r=>/floor/.test(r.emit)))good.push('Podłogówka wystarczy we wszystkich pokojach, w których jest.');
    // koszt instalacji i rachunki
    const invest=cost.reduce((a,x)=>a+x.v,0),investSrc=cost.filter(x=>!x.room).reduce((a,x)=>a+x.v,0);const f=s.extra==='none'?0:s.share/100;
    const mainPer=M.perKWh;const fuel=E.Qh*f*exPer+(E.Qh*(1-f)+E.Qw)*mainPer;
    const fixed=(s.main==='gas'||s.extra==='gas')?480:0,service=M.service+exService;const year=fuel+fixed+service;const years=+HS.years||20,total=invest+years*year;
    // trudność montażu 0–10
    const pen=issues.reduce((a,x)=>a+x.p,0),ease=Math.max(0,Math.min(10,Math.round((10-pen)*10)/10));
    const name=SRC.name+(s.extra!=='none'?' + '+EX.name.replace(/ \(.*\)/,'').toLowerCase():'');
    return {designed,sys:s,name,E,C,rooms,devs,need,floors,floorsW,util,issues:issues.sort((a,b)=>b.p-a.p),good,cost,invest,investSrc,totalSrc:investSrc+years*year,fuel,fixed,service,year,years,total,ease,buffer:buf,bufRec:rec,share:f,emitters,loops,radN,ladN,floorM2,elec,mainPipe,leadPipe};
  }
  global.HouserHeatSys={SOURCES,EXTRAS,EMIT,DEVS,DEF,PRICE,defaultEmit,normalize,needed,evaluate};
})(window);
