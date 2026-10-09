// Generator układu domu: ankieta -> program (pomieszczenia + warunki z reguł w rules.js) -> algorytm genetyczny -> rzut.
// Rzut powstaje z gotowych schematów (pasy: strefa wejścia / korytarz / strefa ogrodowa; blok dzienny i nocny; garaż z boku).
// Genom: schemat, głębokość i wielkość domu, szerokość korytarza, kondygnacja pomieszczeń „flex”, strefa i kolejność pomieszczeń, schody.
// Ocena: każdy warunek ma funkcję sprawdzającą w rejestrze CHECKS (ocena 0..1, waga wg ważności) – nowy typ warunku = nowa funkcja.
// Liczymy w układzie „kanonicznym” (ogród na dole rzutu); toProject obraca rzut tak, żeby ogród był po wybranej stronie świata.
// HouserGen.program(answers) -> prog; HouserGen.createRun(prog,{seed,pop}) -> {step(), best, top(n)}; HouserGen.toProject(prog, layout, name)
// Wymaga modules/generator/rules.js; schody – shared/stairs.js.
(function(global){
  const RU=global.HouserGenRules,T=RU.TYPES,C=.5,C2=C*C,OUT='poza_obrysem',LO='ground',UP='upper';
  const SIDES=['N','E','S','W'],EN={north:'N',east:'E',south:'S',west:'W'};
  const SEV_W={hard:10,medium:4,soft:1.5};
  const KNOWN=new Set(['minArea','maxArea','fullPainted','contiguousAll','adjacent','notAdjacent','edge','exactOverlay','overlapMin','sharedEdgeMin','minRoomWidth','edgeLengthMin','validOpenings','openingBetween','exteriorOpening','reachableRooms']);
  const rnd=seed=>{let a=seed>>>0;return ()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296}};
  const fmt=(v,d=1)=>(Math.round(v*10**d)/10**d).toFixed(d).replace('.',',');
  const tOf=r=>T[r.type]||{};

  // ---------- ankieta -> odpowiedzi znormalizowane
  function answers(raw){const o={};for(const q of RU.QUESTIONS)o[q.id]=raw&&raw[q.id]!=null?raw[q.id]:(Array.isArray(q.def)?q.def.slice():q.def);
    o.persons=Math.max(1,Math.min(10,Math.round(+o.persons||4)));o.beds=Math.max(1,Math.min(6,Math.round(+o.beds||3)));o.area=Math.max(0,+o.area||0);
    for(const q of RU.QUESTIONS)if(q.type==='choice'&&!q.options.some(([v])=>String(v)===String(o[q.id])))o[q.id]=q.def;
    o.garage=String(o.garage);if(!Array.isArray(o.extras))o.extras=[];if(o.storeys==='1')o.extras=o.extras.filter(e=>e!=='mezz');if(o.shape==='L'&&o.storeys!=='1')o.shape='any';return o}
  // ---------- program: pomieszczenia i warunki z reguł
  function program(raw){const A=answers(raw),one=A.storeys==='1',rooms=[];
    const P={A,rooms,one,floors:one?[LO]:[LO,UP],has:id=>rooms.some(r=>r.id===id),room:id=>rooms.find(r=>r.id===id)};
    for(const E of RU.ROOMS){if(E.when&&!E.when(A))continue;const n=E.repeat?E.repeat(A):1;
      for(let i=1;i<=n;i++){const f=E.floor==='night'?(one?LO:UP):E.floor==='flex'?(one?LO:'flex'):E.floor;if(f===UP&&one)continue;
        const t=T[E.type];rooms.push({id:E.id.replace('{i}',i),type:E.type,f,area:E.area(A,i,P),name:E.name?E.name(A,i,P):t.name,color:t.color,blk:E.blk,door:E.door,zones:E.zones})}}
    // metraż podany przez inwestora: przeskaluj (bez najmniejszych pomieszczeń; korytarze dochodzą z rzutu ok. 10%)
    const sum=rooms.reduce((a,r)=>a+r.area,0);if(A.area>0){const k=Math.max(.6,Math.min(1.8,A.area*.9/sum));for(const r of rooms)if(r.area>5)r.area=Math.round(r.area*k*2)/2}
    // strony: kanoniczny dół = ogród
    const gi=SIDES.indexOf(A.garden),abs={bottom:A.garden,left:SIDES[(gi+1)%4],top:SIDES[(gi+2)%4],right:SIDES[(gi+3)%4]};
    P.abs=abs;P.canOf=Object.fromEntries(Object.entries(abs).map(([k,v])=>[v,k]));P.cars=+A.garage;
    P.conditions=conditions(P);P.templates=templates(P);return P}
  function conditions(P){const out=[],A=P.A;
    for(const R of RU.RULES){const push=(c,r)=>{for(const x of [].concat(c||[])){const o={enabled:true,rule:R.id,group:R.group,...x};if(!o.floor&&!o.upperFloor&&!['areaFit','roomShapes','compact','floorsBalance','stairsFit'].includes(o.type))o.floor=r?(r.f==='flex'?'auto':r.f):LO;out.push(o)}};
      if(R.each){for(const r of P.rooms){if(!R.each({...r,t:T[r.type]}))continue;push(R.make({...r,t:T[r.type]},A,P),r)}}
      else if(!R.when||R.when(A,P))push(R.make(null,A,P),null)}
    return out}

  // ---------- schematy (drzewa podziału na bloki i pasy)
  function templates(P){const {A}=P,L=[],one=P.one,rect=A.shape==='rect'||A.shape==='barn',Ls=A.shape==='L';
    if(!Ls)L.push({id:'pasy',name:'Trzy pasy z korytarzem',blocks:[{blk:'*',hall:true}]});
    if(one&&A.shape!=='barn')L.push({id:'dzien-noc',name:Ls?'L: skrzydło dzienne i nocne':'Strefa dzienna | nocna',blocks:[{blk:'day'},{blk:'night',hall:true}],L:Ls?true:(rect?false:'gene')});
    return L}
  function blockLeaves(b,f){if(b.blk==='gar')return [{id:'G',cls:'gar',blk:'gar'}];
    if(b.hall)return [{id:b.blk+'T',cls:'front',blk:b.blk},{id:b.blk+'H',cls:'hall',blk:b.blk,hall:f===UP?'hol_gora':'hol'},{id:b.blk+'B',cls:'garden',blk:b.blk}];
    return [{id:b.blk+'T',cls:'front',blk:b.blk},{id:b.blk+'B',cls:'garden',blk:b.blk}]}

  // ---------- genom
  function randomGenome(P,R){const g={tpl:Math.floor(R()*P.templates.length),D:R(),hT:R(),fk:R(),jit:[.6+R()*.9,.6+R()*.9],mirror:R()<.5,lr:R(),la:R()<.5,gD:R()<.5,
    zone:{},ord:{},fl:{},pk:{},tr:{ground0:R(),ground1:R(),upper0:R(),upper1:R()},st:R(),se:R()<.5,sd:R()<.5,stk:R()};for(const r of P.rooms){g.zone[r.id]=R();g.ord[r.id]=R();g.fl[r.id]=R();g.pk[r.id]=R()}return g}
  function mutate(g,P,R,rate){const m=JSON.parse(JSON.stringify(g)),p=rate||.18,J=(v,s)=>Math.max(0,Math.min(.9999,v+(R()-.5)*s));
    if(R()<p*.4)m.tpl=Math.floor(R()*P.templates.length);if(R()<p)m.D=J(m.D,.4);if(R()<p)m.hT=R();if(R()<p)m.fk=J(m.fk,.3);if(R()<p)m.jit=m.jit.map(v=>Math.max(.45,Math.min(2.2,v*(1+(R()-.5)*.5))));
    if(R()<p*.5)m.mirror=!m.mirror;if(R()<p)m.lr=J(m.lr,.5);if(R()<p*.5)m.la=!m.la;if(R()<p*.5)m.gD=!m.gD;if(R()<p)m.st=J(m.st,.5);if(R()<p*.5)m.se=!m.se;if(R()<p*.5)m.sd=!m.sd;if(R()<p)m.stk=R();m.tr=m.tr||{};for(const k of ['ground0','ground1','upper0','upper1'])if(R()<p)m.tr[k]=R();
    for(const r of P.rooms){if(R()<p)m.zone[r.id]=R();if(R()<p)m.ord[r.id]=J(m.ord[r.id],.6);if(R()<p*.5)m.fl[r.id]=R();if(R()<p)m.pk[r.id]=R()}
    // zamiana miejscami dwóch pomieszczeń
    if(R()<p*1.5){const ids=P.rooms.map(r=>r.id),a=ids[Math.floor(R()*ids.length)],b=ids[Math.floor(R()*ids.length)];[m.ord[a],m.ord[b]]=[m.ord[b],m.ord[a]];[m.zone[a],m.zone[b]]=[m.zone[b],m.zone[a]]}
    return m}
  function cross(a,b,R){const o={};for(const k of Object.keys(a)){if(k==='zone'||k==='ord'||k==='fl'||k==='pk'){o[k]={};for(const id of Object.keys(a[k]))o[k][id]=R()<.5?a[k][id]:b[k][id]}else o[k]=JSON.parse(JSON.stringify(R()<.5?a[k]:b[k]))}return o}

  // ---------- budowa rzutu z genomu (układ kanoniczny)
  function build(P,g){const tp=P.templates[g.tpl%P.templates.length],one=P.one,floors=P.floors;
    const rooms=P.rooms.map(r=>({...r,f:r.f==='flex'?(g.fl[r.id]<.5?LO:UP):r.f}));
    const blocks=tp.blocks.map(b=>({...b}));if(P.cars)blocks.push({blk:'gar'});
    const leaves={};for(const f of floors)leaves[f]=blocks.map(b=>blockLeaves(b,f));
    const assign={};
    for(const r of rooms){const t=T[r.type],zones=r.zones||t.zones||[],blk=r.blk||t.blk||'any';
      const cand=leaves[r.f].flat().filter(L=>zones.includes(L.cls)&&(L.blk==='gar'?zones.includes('gar'):(L.blk==='*'||blk==='any'||L.blk===blk)));
      if(cand.length)assign[r.id]=cand[Math.floor(g.zone[r.id]*cand.length)].id}
    const inLeaf=(f,id)=>rooms.filter(r=>r.f===f&&assign[r.id]===id).sort((a,b)=>g.ord[a.id]-g.ord[b.id]);
    const hT=one?3+Math.round(g.hT*2):4+Math.round(g.hT*3),barn=P.A.shape==='barn';
    const dR=barn?[13,17]:one?[18,28]:[16,24],Dmain=Math.round(dR[0]+g.D*(dR[1]-dR[0])),fk=.9+g.fk*.18;
    const areaOf=(f,b)=>leaves[f][blocks.indexOf(b)].reduce((s,L)=>s+inLeaf(f,L.id).reduce((a,r)=>a+r.area,0),0),attic=P.A.storeys==='attic';
    for(const b of blocks){if(b.blk==='gar'){b.w=P.cars===1?8:13;continue}
      b.h=Dmain;if(b.blk==='night'&&tp.L&&(tp.L===true||g.lr>.6)){const k=.55+(tp.L===true?g.lr:(g.lr-.6)/.4)*.3;b.h=Math.max(14,Math.round(Dmain*k))}
      const dem=Math.max(...floors.map(f=>areaOf(f,b)*(f===UP&&attic?1.12:1)))*fk/C2,eff=b.h-(b.hall?hT:0);b.w=Math.max(6,Math.round(dem/Math.max(4,eff)))}
    const mainH=Math.max(...blocks.filter(b=>b.blk!=='gar').map(b=>b.h));
    for(const b of blocks)if(b.blk==='gar'){const need=areaOf(LO,b)/C2,short=!(P.A.shape==='rect'||barn)&&g.gD;b.h=short?Math.min(mainH,Math.max(12,Math.ceil(need/b.w))):mainH}
    if(blocks.some(b=>!(b.w>0&&b.h>0)))return null;
    const H=Math.max(...blocks.map(b=>b.h)),W=blocks.reduce((s,b)=>s+b.w,0);if(W>80||H>80)return null;
    let x0=0;for(const b of (g.mirror?[...blocks].reverse():blocks)){b.x=x0;b.y=g.la||b.h===H?0:H-b.h;x0+=b.w}
    for(const b of blocks)if(b.blk==='gar')b.y=P.canOf[P.A.entrance]==='bottom'?H-b.h:0;
    const grid={};for(const f of floors)grid[f]=new Array(W*H).fill(OUT);
    const leafRect={},warn=[];
    // pasy w bloku: wysokości z sumy powierzchni obu kondygnacji (ściany idą w pionie)
    for(const b of blocks){const bi=blocks.indexOf(b),Ls=leaves[floors[0]][bi];
      if(Ls.length===1){for(const f of floors)if(!(f===UP&&b.blk==='gar'))leafRect[f+':'+Ls[0].id]={x:b.x,y:b.y,w:b.w,h:b.h};continue}
      const wsum=L=>floors.reduce((s,f)=>s+inLeaf(f,L.id).reduce((a,r)=>a+r.area,0),0);
      const hallL=Ls.find(L=>L.cls==='hall'),hh=hallL?hT:0,rest=b.h-hh,others=Ls.filter(L=>L!==hallL),ws=others.map((L,i)=>wsum(L)*(g.jit[i]||1)),tot=ws.reduce((a,v)=>a+v,0)||1;
      const hs=others.map((L,i)=>ws[i]>0?Math.max(5,Math.round(rest*ws[i]/tot)):0),diff=rest-hs.reduce((a,v)=>a+v,0);if(hs.length){const k=hs[0]>=hs[hs.length-1]?0:hs.length-1;hs[k]+=diff}
      if(hs.some(v=>v<0))return null;
      let y=b.y,oi=0;for(const L of Ls){const h=L===hallL?hh:hs[oi++];for(const f of floors)leafRect[f+':'+L.id]={x:b.x,y,w:b.w,h};y+=h}}
    const hallRects=f=>Object.entries(leafRect).filter(([k])=>k.startsWith(f+':')&&/H$/.test(k)).map(([,r])=>r);
    // skracanie holu: na końcu korytarza pomieszczenie z pasa obok pogłębia się o szerokość korytarza (genom tr: brak / z pasa od wejścia / od ogrodu)
    for(const f of floors)for(const b of blocks){if(f===UP&&b.blk==='gar')continue;const Ls=leaves[f][blocks.indexOf(b)],hallL=Ls.find(L=>L.hall),hr=hallL&&leafRect[f+':'+hallL.id];
      if(hr)for(let y=hr.y;y<hr.y+hr.h;y++)for(let x=hr.x;x<hr.x+hr.w;x++)grid[f][y*W+x]=null;
      const mode=k=>{const v=g.tr?.[f+k]??0;return v<.4?null:v<.7?'front':'garden'};
      for(const L of Ls){if(L.hall)continue;const r=leafRect[f+':'+L.id];if(!r||r.w<=0||r.h<=0)continue;const rs=inLeaf(f,L.id);
        if(!rs.length){for(let y=r.y;y<r.y+r.h;y++)for(let x=r.x;x<r.x+r.w;x++)grid[f][y*W+x]=null;continue}
        const ext=hr&&hr.w>=hr.h?{first:mode(0)===L.cls?hr.h:0,last:mode(1)===L.cls?hr.h:0}:{first:0,last:0};
        paintBand(g,grid[f],W,r,rs,hr||hallRects(f).find(h=>h.x<r.x+r.w&&h.x+h.w>r.x)||null,ext)}
      if(hallL&&hr)paintHall(g,grid[f],W,hr,inLeaf(f,hallL.id),hallL.hall,warn)}
    for(const f of floors)fillGaps(grid[f],W,H);
    const stairs=one?null:placeStairs(P,g,grid,W,H,leafRect);
    const lay={W,H,grid,blocks,rooms,tp:tp.id,tpName:tp.name,stairs,warn,hT,g};
    lay.openings=openingsFor(P,lay);return lay}
  function fillGaps(arr,W,H){for(let pass=0;pass<60;pass++){let left=0;const nx=arr.slice();for(let i=0;i<arr.length;i++){if(arr[i]!==null)continue;const x=i%W,y=(i-x)/W,cnt={};
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const a=x+dx,b=y+dy;if(a<0||b<0||a>=W||b>=H)continue;const v=arr[b*W+a];if(v&&v!==OUT&&v!=='schody'&&v!=='pustka')cnt[v]=(cnt[v]||0)+1}
      const best=Object.entries(cnt).sort((p,q)=>q[1]-p[1])[0];if(best)nx[i]=best[0];else left++}for(let i=0;i<arr.length;i++)arr[i]=nx[i];if(!left)break}
    for(let i=0;i<arr.length;i++)if(arr[i]===null)arr[i]=OUT}
  // pas pomieszczeń wzdłuż dłuższego boku; małe pomieszczenia jedno za drugim (w głąb pasa) – to, które wchodzi z holu, od strony holu
  function paintBand(g,arr,W,r,rs,hall,ext){const along=r.w>=r.h,Lc=along?r.w:r.h,dc=along?r.h:r.w,dm=dc*C;ext=ext||{first:0,last:0};
    const tot=rs.reduce((a,x)=>a+x.area,0),wI=rs.map(x=>x.area/tot*Lc);
    let hs=null;if(hall){if(along)hs=hall.y>=r.y+r.h?1:hall.y+hall.h<=r.y?0:null;else hs=hall.x>=r.x+r.w?1:hall.x+hall.w<=r.x?0:null}
    const needHall=x=>{const d=x.door||tOf(x).door||[];return d[0]==='hol'||d[0]==='hol_gora'?2:d.includes('hol')||d.includes('hol_gora')?1:0};
    // para jedno za drugim: gdy pomieszczenie za wąskie albo gdy tak chce genom (pk); z tyłu tylko to, do którego nie wchodzi się z holu
    const slots=[];for(let i=0;i<rs.length;i++){const a=rs[i],b=rs[i+1],ta=tOf(a),wa=wI[i]*C,narrow=wa<ta.minW*.95||dm/Math.max(.1,wa)>(ta.asp||2.5)*1.05;
      const can=!!b&&dm>=ta.minW+tOf(b).minW-.01&&Math.min(needHall(a),needHall(b))<2&&!(tOf(a).hab&&tOf(b).hab);
      if(can&&(narrow||(g.pk?.[a.id]??1)<.35)){slots.push({items:[a,b],w:wI[i]+wI[i+1]});i++}else slots.push({items:[a],w:wI[i]})}
    // szerokości: pole / głębokość (skrajne pomieszczenie pogłębione o korytarz jest węższe)
    if(!along||hs===null)ext={first:0,last:0};
    {const raw=slots.map((s,i)=>s.items.reduce((a,x)=>a+x.area,0)/(dc+(i===0?ext.first:0)+(i===slots.length-1?ext.last:0))),sr=raw.reduce((a,v)=>a+v,0)||1;slots.forEach((s,i)=>s.w=raw[i]/sr*Lc)}
    const ws=slots.map(s=>Math.max(2,Math.floor(s.w)));let diff=Lc-ws.reduce((a,v)=>a+v,0);const rem=slots.map((s,i)=>[s.w-Math.floor(s.w),i]).sort((p,q)=>q[0]-p[0]);
    let k=0;while(diff>0&&rem.length){ws[rem[k%rem.length][1]]++;diff--;k++}while(diff<0){const i=ws.indexOf(Math.max(...ws));ws[i]--;diff++}
    let pos=0;slots.forEach((s,si)=>{const w=ws[si];let items=s.items;
      if(items.length===2){if(hs!==null){const [a,b]=items;if(needHall(b)>needHall(a))items=[b,a];if(hs===1)items=[items[1],items[0]]}else if(g.stk<.5)items=[items[1],items[0]]}
      const ta=items.reduce((a,x)=>a+x.area,0);let d0=0;items.forEach((it,ii)=>{const dd=ii===items.length-1?dc-d0:Math.max(2,Math.min(dc-2,Math.round(dc*it.area/ta)));
        for(let u=pos;u<pos+w;u++)for(let v=d0;v<d0+dd;v++){const x=along?r.x+u:r.x+v,y=along?r.y+v:r.y+u;arr[y*W+x]=it.id}d0+=dd});
      const e=si===0?ext.first:si===slots.length-1?ext.last:0;if(e){const id=(hs===1?items[items.length-1]:items[0]).id;for(let u=pos;u<pos+w;u++)for(let k=0;k<e;k++){const y=hs===1?r.y+r.h+k:r.y-1-k,x=r.x+u;if(arr[y*W+x]===null)arr[y*W+x]=id}}
      pos+=w})}
  // pas korytarza: hol + ewentualnie pomieszczenia na jego końcach (WC, techniczne…)
  function paintHall(g,arr,W,r0,rs,hallId,warn){const al=r0.w>=r0.h;
    // wolny odcinek pasa (bez końców zajętych przez pogłębione pomieszczenia)
    let a=0,b=al?r0.w:r0.h;const free=u=>arr[al?r0.y*W+r0.x+u:(r0.y+u)*W+r0.x]===null;while(a<b&&!free(a))a++;while(b>a&&!free(b-1))b--;
    const r=al?{x:r0.x+a,y:r0.y,w:b-a,h:r0.h}:{x:r0.x,y:r0.y+a,w:r0.w,h:b-a};if(b<=a){warn.push('hall-short');return}
    const along=al,Lc=b-a,dc=al?r.h:r.w,dm=dc*C;
    const ws=rs.map(x=>Math.max(2,Math.round(x.area/dm/C)));let used=ws.reduce((a,v)=>a+v,0);if(Lc-used<4){warn.push('hall-short');while(Lc-used<4&&ws.some(v=>v>2)){const i=ws.indexOf(Math.max(...ws));ws[i]--;used--}}
    const head=[],tail=[];rs.forEach((x,i)=>(g.ord[x.id]<.5?head:tail).push(i));let pos=0;
    const put=(id,w)=>{for(let u=pos;u<pos+w;u++)for(let v=0;v<dc;v++){const x=along?r.x+u:r.x+v,y=along?r.y+v:r.y+u;arr[y*W+x]=id}pos+=w};
    for(const i of head)put(rs[i].id,ws[i]);put(hallId,Math.max(0,Lc-used));for(const i of tail)put(rs[i].id,ws[i])}
  // schody proste wzdłuż korytarza, w części, gdzie jest hol na obu kondygnacjach; na piętrze otwór w stropie wg geometrii modułu Schody
  function placeStairs(P,g,grid,W,H,leafRect){const S=global.HouserStairs,hr=Object.entries(leafRect).find(([k])=>k.startsWith(LO+':')&&/H$/.test(k))?.[1];if(!hr)return null;
    const gh=2.8,d=S?S.defaults('straight',gh):{risers:16,tread:.27,width:.9},len=Math.ceil((d.risers-1)*d.tread/C)+1,along=hr.w>=hr.h,Lc=along?hr.w:hr.h;
    const at=(f,u,v)=>along?grid[f][(hr.y+v)*W+hr.x+u]:grid[f][(hr.y+u)*W+hr.x+v],ok=u=>at(LO,u,0)==='hol'&&at(UP,u,0)==='hol_gora';
    let best=null,run=[];for(let u=0;u<=Lc;u++){if(u<Lc&&ok(u))run.push(u);else{if(run.length>=len&&(!best||run.length>best.length))best=run;run=[]}}
    let s0,fit=true;if(best)s0=best[0]+Math.round(g.st*(best.length-len));else{fit=false;s0=Math.max(0,Math.round(g.st*(Lc-len)))}
    const dc=along?hr.h:hr.w,v0=g.se?0:dc-2,x=along?hr.x+s0:hr.x+v0,y=along?hr.y+v0:hr.y+s0,rot=along?(g.sd?90:270):(g.sd?180:0);
    const st={id:'st1',type:'straight',rot,width:d.width||.9,risers:d.risers,tread:d.tread,turn:'left',x,y};
    let cells=null;if(S){try{cells=S.cells(st,C,gh,W,H)}catch(_){}}
    if(!cells){cells={lower:[],upper:[]};for(let i=0;i<len;i++)for(let j=0;j<2;j++){const cx=along?x+i:x+j,cy=along?y+j:y+i;cells.lower.push([cx,cy]);if(i>=3)cells.upper.push([cx,cy])}}
    for(const [cx,cy] of cells.upper)if(cx>=0&&cy>=0&&cx<W&&cy<H)grid[UP][cy*W+cx]='schody';
    st._cells={lower:cells.lower,upper:cells.upper};st.fit=fit;return st}

  // ---------- jeden przebieg po siatce: biegi wspólnych ścian (para pomieszczeń) i ścian zewnętrznych (pomieszczenie + strona)
  function edgesOf(arr,W,H){const pair={},ext={},at=(x,y)=>x<0||y<0||x>=W||y>=H?OUT:arr[y*W+x];
    const D=[[1,0,'right'],[0,1,'bottom'],[-1,0,'left'],[0,-1,'top']];
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){const a=arr[y*W+x];if(!a||a===OUT)continue;
      for(const [dx,dy,s] of D){const b=at(x+dx,y+dy);if(b===a)continue;const line=dx?'v'+(x+(dx>0?1:0)):'h'+(y+(dy>0?1:0)),e={x,y,dx,dy,o:dx?y:x,side:s};
        if(b===OUT){const k=a+'|'+s;((ext[k]=ext[k]||{})[line]=ext[k][line]||[]).push(e)}else{const k=a+'>'+b;((pair[k]=pair[k]||{})[line]=pair[k][line]||[]).push(e)}}}
    const runs=m=>{const out=[];for(const list of Object.values(m)){list.sort((p,q)=>p.o-q.o);let cur=[];for(const e of list){if(cur.length&&e.o!==cur[cur.length-1].o+1){out.push(cur);cur=[]}cur.push(e)}if(cur.length)out.push(cur)}return out.sort((p,q)=>q.length-p.length)};
    const cache={};return {between:(a,b)=>cache[a+'>'+b]||(cache[a+'>'+b]=pair[a+'>'+b]?runs(pair[a+'>'+b]):[]),
      outside:(a,s)=>{if(s)return cache[a+'|'+s]||(cache[a+'|'+s]=ext[a+'|'+s]?runs(ext[a+'|'+s]):[]);return ['top','right','bottom','left'].flatMap(q=>cache[a+'|'+q]||(cache[a+'|'+q]=ext[a+'|'+q]?runs(ext[a+'|'+q]):[])).sort((p,q)=>q.length-p.length)}}}
  // ---------- drzwi, przejścia i okna (krawędź: {a:[x,y], b:[x,y], t, v})
  function openingsFor(P,lay){const {W,H,grid}=lay,out={},attic=P.A.storeys==='attic',ridgeX=W>=H;
    for(const f of P.floors){const arr=grid[f],L=[],used=new Set(),E=edgesOf(arr,W,H),ids=[...new Set(arr)].filter(v=>v&&v!==OUT),has=id=>ids.includes(id),room=id=>lay.rooms.find(r=>r.id===id);
      const put=(run,s,n,t,v)=>{for(let i=s;i<s+n&&i<run.length;i++){const e=run[i],k=e.x+','+e.y+','+e.dx+','+e.dy;if(used.has(k))continue;used.add(k);L.push({a:[e.x,e.y],b:[e.x+e.dx,e.y+e.dy],t,v})}};
      const door=(a,b,t,n)=>{const r=E.between(a,b).find(r=>r.length>=2);if(!r)return false;const w=Math.min(n||2,r.length),s=r.length-w>=2?1:0;put(r,s,w,t||'door');return true};
      if(f===LO&&has('wiatrolap')){const r=E.outside('wiatrolap',P.canOf[P.A.entrance]).find(r=>r.length>=2)||E.outside('wiatrolap').find(r=>r.length>=2);if(r)put(r,Math.floor((r.length-2)/2),2,'door','entrance')}
      if(f===LO&&has('garaz')){const n=P.cars===1?5:10,r=[...E.outside('garaz',P.canOf[P.A.entrance]),...E.outside('garaz')].find(r=>r.length>=5);if(r){const k=Math.min(n,r.length);put(r,Math.floor((r.length-k)/2),k,'door')}}
      for(const id of ids){if(['hol','hol_gora','schody','pustka'].includes(id))continue;const r=room(id);if(!r)continue;const t=tOf(r),pref=r.door||t.door||['hol'];
        let ok=false;for(const b of pref){if(b===id||!has(b))continue;const link=(b==='hol'||b==='hol_gora')&&t.link?t.link:'door';if(door(id,b,link,link==='opening'?4:2)){ok=true;break}}
        if(!ok)for(const b of ['hol','hol_gora','wiatrolap','salon'])if(b!==id&&has(b)&&door(id,b,'door')){ok=true;break}}
      if(has('kuchnia')&&has('salon'))door('kuchnia','salon','opening',P.A.kitchen==='open'?6:3);
      if(f===LO&&has('hol')&&has('wiatrolap'))door('wiatrolap','hol','door');
      // okna: pokoje ok. 1/8 podłogi; poddasze – od okapu okna dachowe, w szczycie zwykłe; salon – drzwi tarasowe od ogrodu
      const S=stats(arr,W,H,E);(lay._st=lay._st||{})[f]=S;
      for(const id of ids){const r=room(id),st=S.rooms[id];if(!r||!st||id==='pustka'||id==='schody')continue;const t=tOf(r);if(!t.hab&&!t.win)continue;
        let need=Math.max(2,Math.ceil((t.hab?st.area/8/1.4:(t.win||.3)*2)/C));
        if(t.hst){const r0=E.outside(id,'bottom').find(x=>x.length>=4);if(r0){const n=Math.min(r0.length-2,Math.max(4,Math.round(r0.length*.55)));put(r0,Math.floor((r0.length-n)/2),n,'hst');need-=n}}
        for(const run of E.outside(id)){if(need<=0)break;if(run.length<3)continue;const side=run[0].side,eave=f===UP&&attic&&(ridgeX?(side==='top'||side==='bottom'):(side==='left'||side==='right'));
          const n=Math.min(need,run.length-2,eave?4:8),s=Math.floor((run.length-n)/2);put(run,s,n,'window',eave?'roof':'standard');need-=n}}
      out[f]=L}
    return out}

  // ---------- statystyki pomieszczeń: pole, obrys, szerokość w najwęższym miejscu, ściany zewnętrzne, wspólne ściany
  function stats(arr,W,H,E0){const R={},shared={},hr=new Int16Array(W*H),vr=new Int16Array(W*H);
    for(let y=0;y<H;y++){let s=0;for(let x=1;x<=W;x++)if(x===W||arr[y*W+x]!==arr[y*W+s]){for(let k=s;k<x;k++)hr[y*W+k]=x-s;s=x}}
    for(let x=0;x<W;x++){let s=0;for(let y=1;y<=H;y++)if(y===H||arr[y*W+x]!==arr[s*W+x]){for(let k=s;k<y;k++)vr[k*W+x]=y-s;s=y}}
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){const id=arr[y*W+x];if(!id||id===OUT)continue;const r=R[id]||(R[id]={n:0,x0:1e9,y0:1e9,x1:-1,y1:-1,minW:1e9});
      r.n++;r.x0=Math.min(r.x0,x);r.y0=Math.min(r.y0,y);r.x1=Math.max(r.x1,x);r.y1=Math.max(r.y1,y);r.minW=Math.min(r.minW,hr[y*W+x],vr[y*W+x])}
    const E=E0||edgesOf(arr,W,H);
    for(const [id,r] of Object.entries(R)){r.area=r.n*C2;r.bw=r.x1-r.x0+1;r.bh=r.y1-r.y0+1;r.fill=r.n/(r.bw*r.bh);r.minWm=r.minW*C;r.ext={};for(const s of ['top','right','bottom','left'])r.ext[s]=(E.outside(id,s)[0]||[]).length;r.extAny=Math.max(...Object.values(r.ext))}
    const ids=Object.keys(R);for(const a of ids)for(const b of ids)if(a<b){const l=(E.between(a,b)[0]||[]).length;if(l)shared[a+'|'+b]=l*C}
    return {rooms:R,shared,E}}
  function contiguous(arr,W,H,id){let s=-1,n=0;for(let i=0;i<arr.length;i++)if(arr[i]===id){n++;if(s<0)s=i}if(n<=1)return true;const seen=new Uint8Array(arr.length),q=[s];seen[s]=1;let c=1;
    while(q.length){const i=q.pop(),x=i%W,y=(i-x)/W;for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const a=x+dx,b=y+dy;if(a<0||b<0||a>=W||b>=H)continue;const j=b*W+a;if(!seen[j]&&arr[j]===id){seen[j]=1;c++;q.push(j)}}}return c===n}

  // ---------- ocena: rejestr funkcji sprawdzających (ocena 0..1 i opis)
  const grade=(v,need)=>v>=need-1e-9?1:Math.max(0,1-(need-v)/Math.max(.01,need)*1.5);
  const CHECKS={
    minArea:(X,c)=>{const a=X.R(c.room)?.area||0;return {g:grade(a,+c.value),d:fmt(a)+' m²'}},
    maxArea:(X,c)=>{const a=X.R(c.room)?.area||0;return {g:a<=+c.value?1:Math.max(-4,1-(a-c.value)/c.value*2),d:fmt(a)+' m²'}},
    minRoomWidth:(X,c)=>{const w=X.R(c.room)?.minWm||0;return {g:grade(w,+c.meters),d:fmt(w,2)+' m'}},
    edge:(X,c)=>{const r=X.R(c.room),s=X.side(c.edge);return {g:r&&(s==='any'?r.extAny:r.ext[s])>0?1:0}},
    edgeLengthMin:(X,c)=>{const r=X.R(c.room),s=X.side(c.edge),l=r?(s==='any'?r.extAny:r.ext[s])*C:0;return {g:grade(l,+c.meters),d:fmt(l)+' m'}},
    adjacent:(X,c)=>({g:X.shared(c.a,c.b)>0?1:0}),
    notAdjacent:(X,c)=>({g:X.shared(c.a,c.b)>0?0:1}),
    sharedEdgeMin:(X,c)=>{const l=X.shared(c.a,c.b);return {g:grade(l,+c.meters),d:fmt(l)+' m'}},
    openingBetween:(X,c)=>{const l=X.doorLen(c.a,c.b,c.types||['door']);return {g:l>=+c.meters-.01?1:0,d:fmt(l)+' m'}},
    overlapMin:(X,c)=>{const U=X.grid[c.upperFloor],D=X.grid[c.lowerFloor];if(!U||!D)return {g:0};let t=0,k=0;for(let i=0;i<U.length;i++)if(U[i]===c.upperRoom){t++;if((c.lowerRooms||[]).includes(D[i]))k++}const r=t?k/t:0;return {g:t?grade(r,+c.ratio):0,d:Math.round(r*100)+'%'}},
    reachableRooms:(X,c)=>{const G=X.graph(),seen=new Set([c.startRoom]),q=[c.startRoom];
      while(q.length){const a=q.pop(),open=a===c.startRoom||X.pass(a);for(const b of G[a]||[])if(!seen.has(b)&&(open||X.served(b,a))){seen.add(b);q.push(b)}}
      const want=(c.rooms||[]).includes('*')?Object.keys(X.S.rooms).filter(id=>id!==c.startRoom&&id!=='pustka'&&id!=='schody'):(c.rooms||[]).filter(id=>X.S.rooms[id]),miss=want.filter(id=>!seen.has(id));
      const r=want.length?1-miss.length/want.length:1;return {g:r*r,d:miss.length?'bez dojścia: '+miss.map(X.name).join(', '):''}},
    contiguousAll:(X,c)=>{const bad=Object.keys(X.S.rooms).filter(id=>!contiguous(X.arr,X.W,X.H,id));return {g:bad.length?0:1,d:bad.map(X.name).join(', ')}},
    fullPainted:()=>({g:1}),
    hallShare:(X,c)=>{const hid=c.floor===UP?'hol_gora':'hol',h=X.R(hid)?.area||0,tot=Object.entries(X.S.rooms).filter(([k])=>k!=='pustka'&&k!=='schody').reduce((a,[,r])=>a+r.area,0),sh=tot?h/tot:0;return {g:sh<=+c.max?1:Math.max(-3,1-(sh-c.max)*12),d:Math.round(sh*100)+'%'}},
    areaFit:(X,c)=>{let got=0,want=0;const k=r=>r.f===UP&&X.P.A.storeys==='attic'?.9:1;for(const r of X.rooms){want+=r.area;got+=(X.RR(r)?.area||0)*k(r)}const dev=want?got/want-1:0;return {g:Math.abs(dev)<=+c.tol?1:Math.max(-4,1-(Math.abs(dev)-c.tol)*6),d:(dev>=0?'+':'')+Math.round(dev*100)+'%'}},
    roomShapes:(X,c)=>{let bad=0;const worst=[];for(const r of X.rooms){const s=X.RR(r),t=tOf(r);if(!s||t.void)continue;const asp=Math.max(s.bw,s.bh)/Math.min(s.bw,s.bh),b=Math.max(0,asp-(t.asp||2.5))/(t.asp||2.5)+Math.max(0,(+c.fill||.92)-s.fill)*2;if(b>.02){bad+=b;worst.push(r.name)}}
      return {g:Math.max(0,1-bad*.8),d:worst.slice(0,3).join(', ')}},
    compact:(X,c)=>{const v=X.compact();return {g:v<=+c.max?1:Math.max(0,1-(v-c.max)/c.max*3),d:fmt(v)}},
    floorsBalance:(X,c)=>{const k=f=>{let got=0,want=0;const s=f===UP&&X.P.A.storeys==='attic'?.9:1;for(const r of X.rooms)if(r.f===f){want+=r.area;got+=(X.RR(r)?.area||0)*s}return want?got/want:1},d=Math.abs(k(LO)-k(UP));return {g:d<=+c.tol?1:Math.max(0,1-(d-c.tol)*4),d:'parter '+Math.round(k(LO)*100)+'%, piętro '+Math.round(k(UP)*100)+'%'}},
    stairsFit:(X)=>({g:X.lay.stairs&&X.lay.stairs.fit?1:0})};
  function evaluate(P,lay,conds){const {W,H,grid}=lay,res=[],ST={};for(const f of P.floors)ST[f]=lay._st?.[f]||stats(grid[f],W,H);
    const roomF={};for(const r of lay.rooms)roomF[r.id]=r.f;
    const graphs={},graphOf=f=>graphs[f]||(graphs[f]=(()=>{const G={};for(const o of lay.openings[f]||[]){if(!['door','opening'].includes(o.t))continue;const [bx,by]=o.b;if(bx<0||by<0||bx>=W||by>=H)continue;
      const a=grid[f][o.a[1]*W+o.a[0]],b=grid[f][by*W+bx];if(!b||b===OUT)continue;(G[a]=G[a]||new Set()).add(b);(G[b]=G[b]||new Set()).add(a)}
      // otwór schodów łączy się z holem piętra
      if(f===UP){(G.hol_gora=G.hol_gora||new Set()).add('schody');(G.schody=G.schody||new Set()).add('hol_gora')}return G})());
    let comp=null;
    for(const c0 of conds||P.conditions){if(c0.enabled===false)continue;const c={...c0};if(c.floor==='auto')c.floor=roomF[c.room||c.a]||LO;const f=c.floor||c.upperFloor||LO,S=ST[f]||ST[LO];
      const X={P,lay,grid,W,H,S,arr:grid[f]||grid[LO],rooms:lay.rooms,R:id=>S.rooms[id],RR:r=>ST[r.f]?.rooms[r.id],side:e=>e==='any'?'any':P.canOf[EN[e]],shared:(a,b)=>S.shared[[a,b].sort().join('|')]||0,
        name:id=>lay.rooms.find(r=>r.id===id)?.name||(id==='hol'||id==='hol_gora'?'hol':id),pass:id=>id==='hol'||id==='hol_gora'||id==='schody'||!!T[lay.rooms.find(r=>r.id===id)?.type]?.pass,graph:()=>graphOf(f),served:(b,a)=>{const r=lay.rooms.find(x=>x.id===b);return !!r&&(r.door||T[r.type]?.door||[])[0]===a},
        doorLen:(a,b,types)=>{let n=0;for(const o of lay.openings[f]||[]){if(!types.includes(o.t))continue;const [bx,by]=o.b;const p=grid[f][o.a[1]*W+o.a[0]],q=bx<0||by<0||bx>=W||by>=H?OUT:grid[f][by*W+bx];if(p===a&&q===b||p===b&&q===a)n++}return n*C},
        compact:()=>comp!=null?comp:(comp=(()=>{let per=0,n=0;const g0=grid[LO];for(let y=0;y<H;y++)for(let x=0;x<W;x++){if(g0[y*W+x]===OUT)continue;n++;for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const a=x+dx,b=y+dy;if(a<0||b<0||a>=W||b>=H||g0[b*W+a]===OUT)per++}}return n?(per*C)**2/(n*C2):99})())};
      const fn=CHECKS[c.type];let r={g:1,d:''};try{r=fn?fn(X,c):{g:1,d:'nieznany typ'}}catch(e){r={g:0,d:'błąd: '+e.message}}
      res.push({c:c0,floor:c.floor,ok:r.g>=.999,g:r.g,detail:r.d||'',w:SEV_W[c.severity]||4})}
    // pomieszczenie, którego nie udało się umieścić – zawsze duża kara
    let pen=res.reduce((a,x)=>a+(x.ok?0:x.w*(x.c.severity==='hard'?.5+.5*(1-x.g):1-x.g)),0);const missing=lay.rooms.filter(r=>!ST[r.f]?.rooms[r.id]);pen+=missing.length*15;if(lay.warn.includes('hall-short'))pen+=4;
    const hard=res.filter(x=>x.c.severity==='hard'),score=Math.round(Math.max(0,10-pen/6)*10)/10;
    return {pen,res,score,missing,hardOk:hard.filter(x=>x.ok).length,hardN:hard.length,okN:res.filter(x=>x.ok).length,n:res.length,stats:ST}}

  // ---------- algorytm genetyczny (losowe ziarno = za każdym razem inne domy)
  function createRun(P,opts){opts=opts||{};const seed=opts.seed!=null?opts.seed:Math.floor(Math.random()*2**31),R=rnd(seed),N=opts.pop||60,ELITE=Math.max(2,Math.round(N*.06)),conds=opts.conditions||P.conditions;
    const evalG=g=>{let lay=null;try{lay=build(P,g)}catch(e){lay=null}if(!lay)return {g,pen:1e9};const ev=evaluate(P,lay,conds);return {g,lay,ev,pen:ev.pen}};
    let pop=[];for(let i=0;i<N;i++)pop.push(evalG(opts.from&&i<N/2?mutate(opts.from,P,R,i?.35:0):randomGenome(P,R)));pop.sort((a,b)=>a.pen-b.pen);
    let gen=0;const hist=[],pick=()=>{let b=null;for(let i=0;i<3;i++){const c=pop[Math.floor(R()*pop.length)];if(!b||c.pen<b.pen)b=c}return b};
    function step(){gen++;const next=pop.slice(0,ELITE),rate=.12+.2*Math.max(0,1-gen/40);
      while(next.length<N){const a=pick(),b=pick();let g=R()<.75?cross(a.g,b.g,R):JSON.parse(JSON.stringify(a.g));next.push(evalG(mutate(g,P,R,rate)))}
      for(let i=0;i<Math.round(N*.05);i++)next[next.length-1-i]=evalG(randomGenome(P,R));
      pop=next.sort((a,b)=>a.pen-b.pen);hist.push(pop[0].pen);return pop[0]}
    // najlepsze, ale różne: inny schemat, odbicie albo rozmieszczenie pomieszczeń
    function top(n){const out=[],seen=new Set(),sig=x=>[x.lay.tp,x.g.mirror,x.lay.rooms.map(r=>{const i=x.lay.grid[r.f]?.indexOf(r.id);return r.f[0]+(i>=0?Math.floor((i%x.lay.W)/(x.lay.W/3))+''+Math.floor(i/x.lay.W/(x.lay.H/2)):'-')}).join('')].join('/');
      for(const x of pop){if(!x.lay)continue;const s=sig(x);if(seen.has(s))continue;seen.add(s);out.push(x);if(out.length>=n)break}return out}
    return {seed,step,top,get best(){return pop[0]},get gen(){return gen},hist,pop:()=>pop}}
  function run(P,opts){const r=createRun(P,opts),G=opts?.gens||40;for(let i=0;i<G;i++)r.step();return r}

  // ---------- eksport: rzut kanoniczny -> projekt Housera
  function transform(P,W,H){const g=P.A.garden;if(g==='S')return {W,H,p:(x,y)=>[x,y]};if(g==='N')return {W,H,p:(x,y)=>[W-1-x,H-1-y]};
    if(g==='W')return {W:H,H:W,p:(x,y)=>[H-1-y,x]};return {W:H,H:W,p:(x,y)=>[y,W-1-x]}}
  const edgeKey=([ax,ay],[bx,by])=>ay===by?'v:'+Math.max(ax,bx)+':'+ay:'h:'+ax+':'+Math.max(ay,by);
  function toProject(P,lay,name,conds){const {W,H,grid}=lay,TR=transform(P,W,H),one=P.one,fl=[LO,UP];
    const state={},openings={},variants={};for(const f of fl){state[f]=new Array(TR.W*TR.H).fill(null);openings[f]={};variants[f]={}}
    for(const f of P.floors)for(let y=0;y<H;y++)for(let x=0;x<W;x++){const [X,Y]=TR.p(x,y);state[f][Y*TR.W+X]=grid[f][y*W+x]}
    const VAR={entrance:{variant:'entrance',sill:0,height:2.3},roof:{variant:'roof',sill:.5,height:1.2},standard:{variant:'standard',sill:.9,height:1.4}};
    for(const f of P.floors)for(const o of lay.openings[f]||[]){const k=edgeKey(TR.p(...o.a),TR.p(...o.b));openings[f][k]=o.t;if(o.t==='hst')variants[f][k]={variant:'hst',sill:0,height:2.2};else if(o.v&&VAR[o.v])variants[f][k]={...VAR[o.v]}}
    let stairs=[];if(lay.stairs&&!one){const s=lay.stairs,cs=s._cells.lower.map(([x,y])=>TR.p(x,y)),turn={S:0,N:180,W:90,E:270}[P.A.garden];
      const st={id:'st1',type:'straight',rot:((s.rot+turn)%360+360)%360,width:s.width,risers:s.risers,tread:s.tread,turn:'left',x:Math.min(...cs.map(p=>p[0])),y:Math.min(...cs.map(p=>p[1]))};
      const S=global.HouserStairs;let c=null;if(S){try{c=S.cells(st,C,2.8,TR.W,TR.H)}catch(_){}}
      if(c){for(let i=0;i<state[UP].length;i++)if(state[UP][i]==='schody')state[UP][i]='hol_gora';for(const [x,y] of c.upper)state[UP][y*TR.W+x]='schody';st._cells={lower:c.lower,upper:c.upper}}
      stairs=[st]}
    const roomsDef=f=>{const ids=new Set(state[f].filter(Boolean)),list=[];
      const hid=f===LO?'hol':'hol_gora';if(ids.has(hid))list.push({id:hid,name:f===LO?'Hol':(ids.has('pustka')?'Hol – antresola':'Hol'),color:'#d6d3d1',kind:'room'});
      for(const r of lay.rooms)if(r.f===f&&ids.has(r.id))list.push({id:r.id,name:r.name,color:r.color,kind:'room'});
      if(ids.has('schody'))list.push({id:'schody',name:'Otwór w stropie',color:'#cbd5e1',kind:'room'});
      if(ids.has(OUT))list.push({id:OUT,name:'Poza obrysem',color:'#e2e8f0',kind:'exteriorVoid'});return list};
    // warunki dla modułu Warunki: tylko typy, które on zna; 'auto' i '*' rozwinięte na konkretne pomieszczenia
    const roomF={};for(const r of lay.rooms)roomF[r.id]=r.f;
    const cond=(conds||P.conditions).filter(c=>KNOWN.has(c.type)).map(c=>{const o=JSON.parse(JSON.stringify(c));if(o.floor==='auto')o.floor=roomF[o.room||o.a]||LO;
      if(o.type==='reachableRooms'&&(o.rooms||[]).includes('*'))o.rooms=[...new Set(state[o.floor].filter(v=>v&&v!==OUT&&v!=='pustka'&&v!=='schody'&&v!==o.startRoom))];delete o.rule;delete o.gen;return o})
      // tylko pomieszczenia, które są w rzucie (moduł Układ pomieszczeń odrzuca warunki z nieznanym pomieszczeniem)
      .filter(o=>{const ex=(f,id)=>!!f&&!!id&&state[f]?.includes(id);if(o.lowerRooms){o.lowerRooms=o.lowerRooms.filter(id=>ex(o.lowerFloor,id));if(!o.lowerRooms.length)return false}
        if(o.rooms){o.rooms=o.rooms.filter(id=>ex(o.floor,id));if(!o.rooms.length)return false}
        for(const k of ['room','a','b','startRoom'])if(o[k]!=null&&!ex(o.floor,o[k]))return false;if(o.upperRoom!=null&&!ex(o.upperFloor,o.upperRoom))return false;return true});
    const ridgeX=TR.W>=TR.H,A=P.A,ridge=ridgeX?'east-west':'north-south',base={eaveOverhang:.6,gableOverhang:.4,soffit:'wood',ridge,groundHeight:2.8};
    const elev=one?{...base,upperType:'none',upperHeight:2.6,kneeWall:1,roofPitch:30}:A.storeys==='attic'?{...base,upperType:'attic',upperHeight:2.6,kneeWall:1.2,roofPitch:40}:{...base,upperType:'full',upperHeight:2.7,kneeWall:1,roofPitch:25};
    const def={version:7,name:name||'Dom z generatora',grid:{width:TR.W,height:TR.H,cellMeters:C},floorOrder:fl,
      floors:{ground:{name:'Parter',subtitle:'',rooms:roomsDef(LO)},upper:{name:one?'Strych':A.storeys==='attic'?'Poddasze':'Piętro',subtitle:'',rooms:one?[]:roomsDef(UP)}},
      conditions:cond,validationLevels:{hard:{name:'Twardy',description:'Warunek funkcjonalny/geometryczny.'},medium:{name:'Ważny',description:'Istotne założenie.'},soft:{name:'Miękki',description:'Cel/optymalizacja.'}},
      openingTypes:[{id:'door',name:'Drzwi',color:'#111827',placement:'anyWall'},{id:'opening',name:'Przejście otwarte',color:'#16a34a',placement:'anyWall'},{id:'window',name:'Okno',color:'#2563eb',placement:'anyWall'},{id:'hst',name:'HST / drzwi tarasowe',color:'#0891b2',placement:'exterior'}]};
    return {version:7,definitionName:def.name,definitionSnapshot:def,grid:{...def.grid},savedAt:new Date().toISOString(),state,openings,openingVariants:variants,orientation:{top:'north'},
      structure:{chimney:[]},furniture:{ground:[],upper:[]},outdoorStructures:[],elevationSettings:elev,stairs,energySettings:{persons:A.persons},
      generator:{answers:A,template:lay.tp,genome:lay.g,rules:(conds||P.conditions).filter(c=>!KNOWN.has(c.type))}}}

  global.HouserGen={T,KNOWN,CHECKS,answers,program,conditions,build,evaluate,createRun,run,toProject,stats,randomGenome,mutate,cross};
})(typeof window!=='undefined'?window:globalThis);
