// Konstrukcja dachu – układ więźby, przekroje, słupy i to, na czym się opierają (także pustki na piętrze).
// HouserRoof.evaluate(project) -> {ok, system, systems, geom, loads, members, lines, posts, voidWalls, voidEdges, issues, good, score, cost}
// Ustawienia: project.roofSettings = {system:'auto'|'rafter'|'collar'|'purlin'|'ridge'|'truss', spacing:.9, postSpan:'auto'|m, posts:[m wzdłuż kalenicy]}
// Uproszczone, orientacyjne (drewno C24 / klejone GL24h, obciążenia jak w module Konstrukcja) – do porównywania wariantów, nie zamiast konstruktora.
// Wymaga: shared/quantities.js, shared/house-model.js, modules/konstrukcja/engine.js
(function(global){
  const SYSTEMS={
    rafter:{name:'Krokwiowa',desc:'krokwie oparte na murłacie i w kalenicy, bez podpór pośrednich'},
    collar:{name:'Krokwiowo-jętkowa',desc:'poziome jętki spinają krokwie – sufit poddasza na jętkach'},
    purlin:{name:'Płatwiowo-kleszczowa',desc:'płatwie wzdłuż dachu na słupach, kleszcze spinają krokwie'},
    ridge:{name:'Belka kalenicowa (stodoła)',desc:'nośna belka w kalenicy (drewno klejone / stal) na ścianach szczytowych i słupach – wnętrze otwarte pod dach'},
    truss:{name:'Wiązary prefabrykowane',desc:'kratownice z fabryki – szybki montaż, ale strych bez poddasza użytkowego'}};
  const LIM={rafter:4.5,rafterMax:5.6,postSpan:4,ridgeSpan:8,wallFree:4,collarHead:2.3};
  const PRICE={post:2500,postFull:4500,purlinM:320,ridgeGlulamM:900,ridgeSteelM:1400,wallRibM:380,gableRibM:520,edgeBeamM:1100};
  const DEF={system:'auto',spacing:.9,postSpan:'auto',posts:null};
  const STD=[12,14,16,18,20,22,24,26,28,30,32,36,40,44,48,52,56,60];
  const fmt=(v,d=1)=>(Math.round(v*10**d)/10**d).toLocaleString('pl-PL',{minimumFractionDigits:d,maximumFractionDigits:d});
  // przekrój belki zginanej: rozpiętość l [m], obciążenie w [kN/m], szerokość b [cm], wytrzymałość f [MPa], smukłość k (h ≥ l/k – ugięcie)
  function section(l,w,b,f,k){const M=w*l*l/8,Wreq=M/(f*1000)*1e6,h=Math.max(Math.sqrt(6*Wreq/b),l*100/k),hs=STD.find(s=>s>=h)||Math.ceil(h/4)*4;return {b,h:hs,hReq:h,M}}
  const pl=(n,a,b,c_)=>n===1?a:(n%10>=2&&n%10<=4&&(n%100<12||n%100>14))?b:c_;
  function settings(p){return {...DEF,...(p.roofSettings||{})}}

  function evaluate(project){
    const set=settings(project),q=HouserQuantities.compute(project),G=q.G,c=q.c,W=q.W,H=q.H,lo=q.lo,up=q.up;
    if(!(q.roofA>0)||!G.roofPitch)return {ok:false,set,why:'Dom nie ma dachu dwuspadowego – nie ma czego liczyć.'};
    const K=global.HouserStructure?HouserStructure.evaluate(project):null;
    const st=project.structure||{},RG=(global.HouserStructure?.ROOF_G||{})[st.roof||'ceramic']||{g:.95},SN=(global.HouserStructure?.SNOW||{})[st.snow||2]||.9;
    const across=HouserModel.slopesAcrossX(G.ridge==='north-south'?'north-south':'east-west',project.orientation?.top),rr=HouserModel.roofRange(project);
    const S=q.span,half=S/2,al=G.roofPitch*Math.PI/180,tan=Math.tan(al),cos=Math.cos(al),rise=half*tan,attic=!!q.attic,hasUp=q.net?.[up]>0;
    const knee=attic?(G.kneeWall||0):0,eo=G.eaveOverhang||0,go=G.gableOverhang||0,L0=rr.l0,L1=rr.l1,Lr=L1-L0;
    const mu=G.roofPitch<=30?.8:G.roofPitch>=60?0:.8*(60-G.roofPitch)/30,snow=mu*SN,gk=(RG.g+.3+(attic?.35:0))/cos,qd=1.35*gk+1.5*snow; // na m² rzutu
    const loads={roof:RG.name||'',gk,snow,qd};
    const issues=[],good=[],costs=[];const add=(p,text,tip,type)=>issues.push({p:Math.round(p*100)/100,text,tip:tip||'',type:type||'roof'}),addC=(name,v,note)=>{if(v>0)costs.push({name,v:Math.round(v),note:note||''})};
    // ---------- stan piętra: pustki (antresola / pustka nad salonem) i otwory schodów
    const stF=f=>{const s=project.state?.[f]||[];return Array.isArray(s[0])?s.flat():s},sl=stF(lo),su=stF(up);
    const roomsOf=f=>Object.fromEntries((project.definitionSnapshot?.floors?.[f]?.rooms||[]).map(r=>[r.id,r]));const RL=roomsOf(lo),RU=roomsOf(up);
    const occ=(f,x,y)=>{if(x<0||y<0||x>=W||y>=H)return false;const v=(f===lo?sl:su)[y*W+x];return !!v&&(f===lo?RL:RU)[v]?.kind!=='exteriorVoid'};
    const idU=(x,y)=>su[y*W+x],isVoid=(x,y)=>occ(up,x,y)&&idU(x,y)==='pustka',isHole=(x,y)=>occ(up,x,y)&&(idU(x,y)==='pustka'||idU(x,y)==='schody');
    // punkt w metrach (a – w poprzek dachu od lewej ściany, l – wzdłuż kalenicy) -> kratka
    const cellAt=(a,l)=>{const ax=Math.min(W-1,Math.max(0,Math.floor((across?a:l)/c))),ay=Math.min(H-1,Math.max(0,Math.floor((across?l:a)/c)));return [ax,ay]};
    // ---------- warianty układu
    const L=(half+eo)/cos; // krokiew od kalenicy do okapu
    const xp=Math.min(half-.6,Math.max(1.2,Math.round(half*.45/c)*c)),zc=knee+xp*tan; // płatwie / jętki: w poziomie od ściany i wysokość nad podłogą poddasza
    const segP=Math.max((xp+eo)/cos,(half-xp)/cos); // najdłuższy odcinek krokwi z podporą pośrednią
    const ridgeH=knee+rise,systems={};
    const feas=(k,ok,why)=>systems[k]={...SYSTEMS[k],ok,why};
    feas('rafter',L<=LIM.rafter,L<=LIM.rafter?'krokiew '+fmt(L)+' m – bez podpór':'krokiew '+fmt(L)+' m – za długa bez podparcia (do ok. '+fmt(LIM.rafter)+' m)');
    feas('collar',segP<=LIM.rafter&&ridgeH-zc>=.6&&zc>=(attic?LIM.collarHead-.1:0)&&S<=11,attic&&zc<LIM.collarHead-.1?'jętki na wysokości ok. '+fmt(zc,2)+' m – za nisko nad podłogą poddasza':ridgeH-zc<.6?'za mało miejsca nad jętkami':S>11?'dom za szeroki na jętki':'jętki na wysokości ok. '+fmt(zc,2)+' m, krokiew do '+fmt(segP)+' m');
    feas('purlin',segP<=LIM.rafterMax,'płatwie ok. '+fmt(xp)+' m od ścian, słupy co ok. '+fmt(LIM.postSpan)+' m'+(attic?' – stoją na poddaszu':''));
    feas('ridge',half/cos<=LIM.rafterMax+.6,'belka w kalenicy, krokwie '+fmt(half/cos)+' m – otwarta przestrzeń pod dachem');
    feas('truss',!attic||!hasUp,attic&&hasUp?'zajmują poddasze – nie da się go użytkować':'rozpiętość '+fmt(S)+' m – bez słupów');
    const hasVoid=su.some((v,i)=>v==='pustka'&&occ(up,i%W,i/W|0));
    let auto=!attic||!hasUp?'truss':systems.rafter.ok?'rafter':systems.collar.ok?'collar':hasVoid&&systems.ridge.ok?'ridge':'purlin';
    const sys=set.system!=='auto'&&SYSTEMS[set.system]?set.system:auto;
    if(set.system!=='auto'&&!systems[sys].ok)add(1.5,'Wybrany układ „'+SYSTEMS[sys].name+'” nie pasuje do tego dachu: '+systems[sys].why+'.','Wybierz „automatycznie” albo układ oznaczony jako pasujący.','system');
    // ---------- linie nośne wzdłuż dachu (płatwie / belka kalenicowa) i słupy
    const lines=[];if(sys==='purlin'){lines.push({id:'L',a:xp,z:zc,name:'płatew lewa'},{id:'R',a:S-xp,z:zc,name:'płatew prawa'})}else if(sys==='ridge')lines.push({id:'C',a:half,z:ridgeH-.15,name:'belka kalenicowa'});
    const span=set.postSpan==='auto'?(sys==='ridge'?LIM.ridgeSpan-1:LIM.postSpan):Math.max(1.5,+set.postSpan||LIM.postSpan);
    let at=Array.isArray(set.posts)?set.posts.map(Number).filter(v=>v>L0+.3&&v<L1-.3).sort((a,b)=>a-b):null;
    if(!at){const n=Math.max(0,Math.ceil(Lr/span)-1);at=Array.from({length:n},(_,i)=>L0+Lr*(i+1)/(n+1))}
    const supports=[L0,...at,L1],maxSeg=Math.max(...supports.slice(1).map((v,i)=>v-supports[i]));
    const hLo=q.hWall?.[lo]||G.groundHeight||2.8,slab=.25,posts=[];
    // co jest pod słupem na parterze: ściana nośna / podciąg / słup z Konstrukcji w pobliżu (do ok. 0,3 m)
    const groundSupport=(a,l)=>{if(!K)return null;const X=across?a:l,Y=across?l:a,gx=Math.round(X/c),gy=Math.round(Y/c),near=v=>Math.abs(v*c-X)<.3,nearY=v=>Math.abs(v*c-Y)<.3;
      for(const cc of K.columns||[])if(Math.abs(cc.x*c-X)<.35&&Math.abs(cc.y*c-Y)<.35)return 'słup';
      const cx=Math.min(W-1,Math.max(0,Math.floor(X/c))),cy=Math.min(H-1,Math.max(0,Math.floor(Y/c)));
      if(near(gx)&&(K.supV(gx,cy)))return K.bearV(gx,cy)?'ściana':'podciąg';if(nearY(gy)&&K.supH(cx,gy))return K.bearH(cx,gy)?'ściana':'podciąg';return null};
    for(const ln of lines)for(const l of at){const [cx,cy]=cellAt(ln.a,l),P=qd*(sys==='ridge'?half:half*.55)*span; // kN na słup (obliczeniowo)
      const P0={line:ln.id,a:ln.a,l,cx,cy,P,len:ln.z};
      if(!hasUp||!attic){P0.status='ceiling';P0.text='na stropie / belce stropowej';posts.push(P0);continue}
      if(isHole(cx,cy)){const gs=groundSupport(ln.a,l);P0.status='void';P0.len=hLo+slab+ln.z;
        P0.text='nad '+(idU(cx,cy)==='schody'?'otworem schodów':'pustką')+' – słup musi zejść na parter (ok. '+fmt(P0.len)+' m)'+(gs?', pod nim '+gs:', pod nim nic – własny fundament');
        P0.gs=gs;addC('Słup przez całą wysokość nad pustką ('+ln.name+')',PRICE.postFull+(gs?0:1500));posts.push(P0);continue}
      const gs=groundSupport(ln.a,l);if(gs){P0.status='ok';P0.text='na stropie nad: '+gs}
      else{P0.status='slab';P0.text='na stropie bez ściany pod spodem – siła ok. '+fmt(P,0)+' kN na strop'}
      // słup w środku pokoju poddasza – przeszkadza
      const rid=idU(cx,cy);if(rid&&P0.status!=='void'&&!/kory|hol|komunik|garder|schow|strych/i.test(RU[rid]?.name||''))P0.room=RU[rid]?.name||'';
      posts.push(P0)}
    // jedna uwaga na rodzaj problemu (nie na każdy słup)
    const pv=posts.filter(p=>p.status==='void'),ps=posts.filter(p=>p.status==='slab');
    if(pv.length){const noF=pv.filter(p=>!p.gs).length;add(Math.min(2.5,pv.length*.8+noF*.5),pv.length+' '+pl(pv.length,'słup więźby wypada','słupy więźby wypadają','słupów więźby wypada')+' nad pustką / otworem w stropie – nie ma tam stropu, więc '+(pv.length===1?'musi':'muszą')+' zejść przez całą wysokość (ok. '+fmt(pv[0].len)+' m) na parter'+(noF?'; '+noF+' bez ściany pod spodem – własny fundament (stopa).':'.'),'Przesuń słupy wzdłuż dachu tak, żeby stały poza pustką (kliknij linię na rzucie), albo zaplanuj słup na całą wysokość jako element wnętrza.','void')}
    if(ps.length)add(Math.min(2,ps.length*.4),ps.length+' '+pl(ps.length,'słup stoi','słupy stoją','słupów stoi')+' na stropie bez ściany ani podciągu pod spodem (każdy ok. '+fmt(ps[0].P,0)+' kN).','Ustaw słupy nad ścianami nośnymi parteru (kliknij linię na rzucie, żeby je przesunąć) albo dodaj podciąg w module Konstrukcja.','slab');
    if(lines.length){const inRooms=[...new Set(posts.filter(p=>p.room).map(p=>p.room))];if(inRooms.length)add(.3*Math.min(3,inRooms.length),'Słupy więźby stoją w pokojach poddasza: '+inRooms.join(', ')+'.','Słupy da się wkomponować w ścianki działowe albo szafy – albo wybrać układ bez słupów (jętki / belka kalenicowa).','posts');
      addC(sys==='ridge'?'Belka kalenicowa – dopłata do zwykłej więźby':'Płatwie i kleszcze',sys==='ridge'?Lr*PRICE.ridgeGlulamM:2*Lr*PRICE.purlinM,fmt(Lr)+' m'+(sys==='purlin'?' × 2':''));
      addC('Słupy więźby',posts.filter(p=>p.status!=='void').length*PRICE.post,posts.filter(p=>p.status!=='void').length+' szt.')}
    // ---------- przekroje
    const a=Math.max(.6,Math.min(1.2,+set.spacing||.9)),members=[];
    const rafSpan=sys==='rafter'||sys==='truss'?L:sys==='ridge'?half/cos+eo/cos:segP,raf=section(rafSpan,qd*cos*a,8,16.6,20);
    if(sys!=='truss')members.push({name:'Krokwie (co '+fmt(a,2)+' m)',sec:'8 × '+raf.h+' cm',len:L,n:Math.ceil((Lr+2*go)/a+1)*2,note:'odcinek bez podparcia ok. '+fmt(rafSpan)+' m'});
    else members.push({name:'Wiązary (co ok. 0,9 m)',sec:'kratownica',len:S+2*eo,n:Math.ceil((Lr+2*go)/.9+1),note:'rozpiętość '+fmt(S)+' m'});
    if(sys==='collar')members.push({name:'Jętki',sec:'2 × 4 × 16 cm',len:S-2*xp,n:Math.ceil((Lr+2*go)/a+1),note:'na wysokości ok. '+fmt(zc,2)+' m'+(hasVoid?' – nad pustką widoczne pod dachem':'')});
    let beam=null;if(lines.length){const trib=sys==='ridge'?half:half*.55,glu=sys==='ridge'||maxSeg>4.2;beam=section(maxSeg,qd*trib,glu?16:14,glu?18.5:16.6,sys==='ridge'?17:20);
      const big=beam.h>(glu?60:26);members.push({name:sys==='ridge'?'Belka kalenicowa':'Płatwie',sec:(glu?'klejona ':'')+beam.b+' × '+beam.h+' cm',len:Lr,n:lines.length,note:'między podporami do '+fmt(maxSeg)+' m'});
      if(big)add(1,(sys==='ridge'?'Belka kalenicowa':'Płatew')+' między podporami ok. '+fmt(maxSeg)+' m – wychodzi bardzo wysoka ('+beam.h+' cm).','Dodaj słup pośredni (krótsze przęsło) albo belkę stalową.','beam');
      members.push({name:'Słupy',sec:'14 × 14 cm',len:Math.max(...posts.map(p=>p.len),0),n:posts.length,note:posts.some(p=>p.status==='void')?'część przez całą wysokość (nad pustką)':''})}
    if(sys==='rafter'&&knee>.3)good.push('Rozpór krokwi przejmuje murłata na ściance kolankowej z wieńcem.');
    if(sys==='collar')good.push('Jętki na wysokości ok. '+fmt(zc,2)+' m – wygodny sufit poddasza, bez słupów.');
    if(sys==='ridge')good.push('Belka kalenicowa – nad pustką i antresolą otwarta przestrzeń aż pod dach, bez jętek.');
    if(sys==='truss')good.push('Wiązary – najtańszy i najszybszy dach, bez słupów (strych nieużytkowy).');
    if(sys==='collar'&&hasVoid)add(.2,'Jętki przechodzą nad pustką – widać je pod dachem (belki na wysokości ok. '+fmt(zc,2)+' m).','Jeśli chcesz otwartą przestrzeń aż do kalenicy, wybierz belkę kalenicową.','void');
    // ---------- ściany przy pustce: na wysokości piętra nie ma stropu, który by je usztywniał
    const voidWalls=[],voidEdges=[];
    if(hasUp&&hasVoid){const wl={eave:0,gable:0},hEave=hLo+slab+knee,hGable=hEave+rise;
      for(let y=0;y<=H;y++)for(let x=0;x<W;x++){const A=occ(up,x,y-1),B=occ(up,x,y);if(A===B)continue;const [vx,vy]=A?[x,y-1]:[x,y];if(!isVoid(vx,vy)||!occ(lo,vx,vy))continue;wl[across?'gable':'eave']+=c}
      for(let x=0;x<=W;x++)for(let y=0;y<H;y++){const A=occ(up,x-1,y),B=occ(up,x,y);if(A===B)continue;const [vx,vy]=A?[x-1,y]:[x,y];if(!isVoid(vx,vy)||!occ(lo,vx,vy))continue;wl[across?'eave':'gable']+=c}
      if(wl.eave>0){voidWalls.push({kind:'eave',name:'ściana podłużna (pod okapem)',len:wl.eave,h:hEave});if(hEave>LIM.wallFree){add(Math.min(1.2,.4+wl.eave*.05),'Ściana zewnętrzna przy pustce ma ok. '+fmt(hEave)+' m wysokości bez stropu (na długości ok. '+fmt(wl.eave)+' m) – strop jej nie usztywnia.','Wieniec na poziomie stropu biegnie dalej jako belka (rygiel) przy pustce albo słupki żelbetowe co 3–4 m.','voidwall');addC('Rygiel / słupki żelbetowe w ścianie przy pustce',wl.eave*PRICE.wallRibM,fmt(wl.eave)+' m')}}
      if(wl.gable>0){voidWalls.push({kind:'gable',name:'ściana szczytowa',len:wl.gable,h:hGable});add(Math.min(1.5,.6+wl.gable*.06),'Ściana szczytowa przy pustce sięga ok. '+fmt(hGable)+' m (do kalenicy) bez stropu po drodze, na szerokości ok. '+fmt(wl.gable)+' m.','Szczyt wymaga wieńca skośnego pod połacią i słupków / rygla w połowie wysokości; przy dużych przeszkleniach – rama stalowa.','voidwall');addC('Usztywnienie ściany szczytowej przy pustce (wieniec skośny, słupki)',wl.gable*PRICE.gableRibM,fmt(wl.gable)+' m')}
      // brzegi pustki: krawędź stropu piętra – czy pod nią jest ściana albo podciąg na parterze
      let sup=0,uns=0;const edge=(ax,ay,bx,by,key,o,gx,gy)=>{if(!occ(up,ax,ay)||!occ(up,bx,by))return;const va=isVoid(ax,ay),vb=isVoid(bx,by);if(va===vb)return;const [ox,oy]=va?[bx,by]:[ax,ay];if(isHole(ox,oy))return;
        const s=K?(o==='v'?K.supV(gx,gy):K.supH(gx,gy)):false;if(s)sup+=c;else uns+=c};
      for(let y=1;y<H;y++)for(let x=0;x<W;x++)edge(x,y-1,x,y,'h:'+x+':'+y,'h',x,y);for(let x=1;x<W;x++)for(let y=0;y<H;y++)edge(x-1,y,x,y,'v:'+x+':'+y,'v',x,y);
      voidEdges.push({sup,uns});if(uns>=1)add(Math.min(1.2,.3+uns*.08),'Brzeg pustki (krawędź stropu antresoli) na długości ok. '+fmt(uns)+' m nie ma pod sobą ściany ani podciągu.','Krawędź oprzyj na belce krawędziowej / podciągu (moduł Konstrukcja) albo przesuń ją nad ścianę parteru.','voidedge');
      else if(sup>0)good.push('Brzegi pustki leżą nad ścianami / podciągami parteru.')}
    else if(hasUp&&!hasVoid)good.push('Bez pustki – strop usztywnia ściany na wysokości piętra.');
    // ---------- wynik
    const pen=issues.reduce((s,i)=>s+i.p,0),score=Math.round(Math.max(0,10-pen)*10)/10,total=costs.reduce((s,i)=>s+i.v,0);
    return {ok:true,set,system:sys,auto,systems,geom:{S,half,pitch:G.roofPitch,rise,knee,eo,go,L0,L1,Lr,across,xp,zc,ridgeH,L,attic,hasUp,hasVoid,hLo,W,H,c},loads,members,lines,posts,postsAt:at,maxSeg,voidWalls,voidEdges,issues,good,score,cost:{items:costs,total}}}
  global.HouserRoof={SYSTEMS,LIM,PRICE,DEF,settings,evaluate};
})(typeof window!=='undefined'?window:globalThis);
