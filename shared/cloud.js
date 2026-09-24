// Konta i chmura (Firebase): logowanie przez Google, projekty prywatne / publiczne, zdjęcia galerii.
// Działa tylko w stronie głównej (index.html). Wymaga shared/firebase-config.js, project-store.js i gallery.js.
// Firestore (plan darmowy wystarcza, bez Storage):
//   projects/{projectId}                – opis: właściciel, nazwa, prywatny/publiczny, statystyki, miniaturka rzutu, okładka
//   projects/{projectId}/content/main   – pełny projekt (JSON jako tekst; bez obrazów)
//   projects/{projectId}/photos/{id}    – zdjęcia galerii (JPEG w dokumencie, każdy < 1 MB)
// Przeglądarka nadal trzyma bieżący projekt i galerię lokalnie; chmura jest kopią zapisywaną automatycznie po zmianach.
(function(global){
  const CFG=global.HOUSER_FIREBASE;
  const SDK='https://www.gstatic.com/firebasejs/10.14.1/';
  const LINKS='houser:cloud'; // projectId -> {owner, rev, at, vis} – projekty tej przeglądarki powiązane z chmurą
  const enabled=!!(CFG&&CFG.apiKey&&CFG.projectId);
  let fb=null,user=null,readyP=null,describe=async p=>({name:p?.definitionSnapshot?.name||p?.name||'bez nazwy'});
  const authCbs=[],statusCbs=[];
  let op={state:'idle',at:null,msg:''}; // idle | pending | saving | saved | error | conflict

  const links=()=>{try{return JSON.parse(localStorage.getItem(LINKS)||'{}')||{}}catch(_){return {}}};
  const setLink=(pid,v)=>{const l=links();if(v)l[pid]={...(l[pid]||{}),...v};else delete l[pid];try{localStorage.setItem(LINKS,JSON.stringify(l))}catch(_){}};
  const emit=()=>statusCbs.forEach(cb=>{try{cb(status())}catch(e){console.error(e)}});
  const setOp=(state,msg)=>{op={state,at:state==='saved'?new Date().toISOString():op.at,msg:msg||''};emit()};
  const curPid=()=>HouserStore.load()?.project?.projectId||null;
  function linkOf(pid){const L=pid&&links()[pid];return L&&!L.off&&user&&L.owner===user.uid?L:null}
  // czy projekt ma się zapisywać w chmurze (po zalogowaniu – każdy, chyba że użytkownik go z chmury usunął)
  const eligible=pid=>!!(user&&pid&&!links()[pid]?.off);
  // stan dla paska projektu
  function status(){const pid=curPid(),L=linkOf(pid);return {enabled,ready:!!fb,user,pid,linked:!!L,off:!!(pid&&links()[pid]?.off),vis:L?.vis||null,savedAt:L?.at||null,...op}}

  function init(){
    if(!enabled)return Promise.resolve(false);if(readyP)return readyP;
    readyP=(async()=>{
      const [A,U,F]=await Promise.all([import(SDK+'firebase-app.js'),import(SDK+'firebase-auth.js'),import(SDK+'firebase-firestore.js')]);
      const app=A.initializeApp(CFG),auth=U.getAuth(app),db=F.getFirestore(app);
      const emu=global.HOUSER_FIREBASE_EMULATOR; // tylko testy lokalne
      if(emu){U.connectAuthEmulator(auth,emu.auth,{disableWarnings:true});F.connectFirestoreEmulator(db,emu.host,emu.port)}
      fb={U,F,auth,db};
      await new Promise(res=>{let first=true;U.onAuthStateChanged(auth,u=>{
        user=u?{uid:u.uid,name:u.displayName||u.email||'',email:u.email||'',photo:u.photoURL||''}:null;
        if(first){first=false;res()}authCbs.forEach(cb=>{try{cb(user)}catch(e){console.error(e)}});emit()})});
      return true})().catch(e=>{console.error('Firebase:',e);readyP=null;throw e});
    return readyP}

  async function signIn(){await init();const p=new fb.U.GoogleAuthProvider();p.setCustomParameters({prompt:'select_account'});
    try{await fb.U.signInWithPopup(fb.auth,p)}
    catch(e){if(['auth/popup-blocked','auth/operation-not-supported-in-this-environment'].includes(e.code))return fb.U.signInWithRedirect(fb.auth,p);
      if(['auth/popup-closed-by-user','auth/cancelled-popup-request'].includes(e.code))return;throw e}}
  async function signOut(){await init();clearTimeout(timer);await fb.U.signOut(fb.auth)}
  async function _testSignIn(sub,name,email){await init();const cred=fb.U.GoogleAuthProvider.credential(JSON.stringify({sub,name,email,email_verified:true}));await fb.U.signInWithCredential(fb.auth,cred)}

  const D=(...p)=>fb.F.doc(fb.db,...p);
  async function getData(...p){const s=await fb.F.getDoc(D(...p));return s.exists()?s.data():null}
  const need=()=>{if(!user)throw new Error('Zaloguj się, żeby korzystać z chmury.')};
  function forCloud(p){const o={...p};delete o.visualizations;delete o.houserFile;return o}

  // nowy identyfikator dla bieżącego projektu (np. plik kogoś innego – jego identyfikator w chmurze jest zajęty); galeria idzie razem z nim
  async function rekey(project){const old=project.projectId,nid=HouserStore.newId();
    for(const r of await HouserGallery.list(old))await HouserGallery.put({...r,projectId:nid,cloudUp:false,cloudSig:''});
    project.projectId=nid;HouserStore.update(p=>{p.projectId=nid},'chmura');hooks.localWrite?.();return nid}

  // zapis bieżącego projektu. Zwraca {ok} albo {conflict:meta} (w chmurze jest nowsza wersja z innego urządzenia)
  async function saveProject(project,opt={}){
    await init();need();project=JSON.parse(JSON.stringify(project));
    if(!project.projectId){project.projectId=HouserStore.newId();HouserStore.update(p=>{p.projectId=project.projectId},'chmura');hooks.localWrite?.()}
    let pid=project.projectId,meta=null;
    try{meta=await getData('projects',pid)}catch(e){if(e.code!=='permission-denied')throw e;meta={owner:null}}
    if(meta&&meta.owner!==user.uid){pid=await rekey(project);meta=null}
    const L=links()[pid];
    if(meta&&!opt.force&&(!L||L.rev!==meta.rev))return {conflict:meta,pid};
    const now=new Date().toISOString(),rev=Math.random().toString(36).slice(2,10),d=await describe(project);
    const vis=opt.visibility||meta?.visibility||'private',json=JSON.stringify(forCloud(project));
    if(json.length>900000)throw new Error('Projekt jest za duży do zapisania w chmurze.');
    await fb.F.setDoc(D('projects',pid),{owner:user.uid,ownerName:user.name,ownerPhoto:user.photo,name:d.name||'bez nazwy',visibility:vis,
      createdAt:meta?.createdAt||now,updatedAt:now,rev,stats:d.stats||null,plan:d.plan||'',cover:meta?.cover||'',photoIds:meta?.photoIds||[]});
    await fb.F.setDoc(D('projects',pid,'content','main'),{json,updatedAt:now});
    setLink(pid,{owner:user.uid,rev,at:now,vis});
    if(!meta)await pushPhotos(pid); // pierwszy zapis – od razu zdjęcia z galerii
    return {ok:true,pid}}

  // zdjęcia: lokalne rekordy mają cloudUp (wysłane) i cloudSig (podpis, kolejność, okładka w chwili wysłania)
  const sig=r=>[r.caption||'',r.order,r.cover?1:0].join('|');
  async function photoDoc(r){let image=r.image,before=r.before||null;
    if(image.length>700000)image=await HouserGallery.resize(image,1280,.8);
    if(before&&image.length+before.length+(r.thumb||'').length>950000)before=await HouserGallery.resize(before,900,.72);
    if(before&&image.length+before.length+(r.thumb||'').length>950000)before=null;
    return {caption:r.caption||'',order:r.order,cover:!!r.cover,source:r.source||'upload',createdAt:r.createdAt,image,thumb:r.thumb||'',before,ref:r.ref||null}}
  async function pushPhotos(pid){need();const meta=await getData('projects',pid);if(!meta||meta.owner!==user.uid)return;
    const items=await HouserGallery.list(pid);
    for(const r of items){const s=sig(r);
      if(!r.cloudUp)await fb.F.setDoc(D('projects',pid,'photos',r.id),await photoDoc(r));
      else if(r.cloudSig!==s)await fb.F.setDoc(D('projects',pid,'photos',r.id),{caption:r.caption||'',order:r.order,cover:!!r.cover},{merge:true});
      else continue;
      await HouserGallery.put({...r,cloudUp:true,cloudSig:s})}
    const ids=items.map(r=>r.id);
    for(const id of meta.photoIds||[])if(!ids.includes(id))await fb.F.deleteDoc(D('projects',pid,'photos',id));
    const cov=items.find(r=>r.cover)||items[0];
    await fb.F.setDoc(D('projects',pid),{photoIds:ids,cover:cov?cov.thumb:''},{merge:true})}
  // zdjęcia z chmury do galerii tej przeglądarki (own: własny projekt – zdjęcia zostają powiązane z chmurą)
  async function pullPhotos(pid,localPid,own){
    const snap=await fb.F.getDocs(fb.F.collection(fb.db,'projects',pid,'photos')),cloud=snap.docs.map(d=>({id:d.id,...d.data()}));
    const local=await HouserGallery.list(localPid),cloudIds=new Set(cloud.map(c=>c.id));
    if(own)for(const r of local)if(r.cloudUp&&!cloudIds.has(r.id))await HouserGallery.remove(r.id); // usunięte na innym urządzeniu
    for(const c of cloud){const rec={id:own?c.id:'g'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),projectId:localPid,order:c.order,createdAt:c.createdAt||new Date().toISOString(),
      caption:c.caption||'',cover:!!c.cover,source:c.source||'upload',image:c.image,thumb:c.thumb||c.image,before:c.before||null,ref:c.ref||null,cloudUp:own,cloudSig:''};
      if(own)rec.cloudSig=sig(rec);await HouserGallery.put(rec)}}

  // otwarcie projektu z chmury: własny zostaje powiązany, cudzy (publiczny) to kopia z nowym identyfikatorem
  async function open(pid){await init();
    const meta=await getData('projects',pid);if(!meta)throw new Error('Nie ma takiego projektu w chmurze.');
    const c=await getData('projects',pid,'content','main');if(!c?.json)throw new Error('Projekt w chmurze jest pusty.');
    const project=JSON.parse(c.json),own=!!user&&meta.owner===user.uid;
    project.projectId=own?pid:HouserStore.newId();
    if(own)setLink(pid,{owner:user.uid,rev:meta.rev,at:meta.updatedAt,vis:meta.visibility});
    await pullPhotos(pid,project.projectId,own);
    return {project,own,meta}}

  const sortNew=a=>a.sort((x,y)=>(y.updatedAt||'').localeCompare(x.updatedAt||''));
  async function listMine(){await init();need();const s=await fb.F.getDocs(fb.F.query(fb.F.collection(fb.db,'projects'),fb.F.where('owner','==',user.uid)));return sortNew(s.docs.map(d=>({id:d.id,...d.data()})))}
  async function listPublic(){await init();const s=await fb.F.getDocs(fb.F.query(fb.F.collection(fb.db,'projects'),fb.F.where('visibility','==','public'),fb.F.limit(60)));return sortNew(s.docs.map(d=>({id:d.id,...d.data()})))}
  async function setVisibility(pid,vis){await init();need();await fb.F.setDoc(D('projects',pid),{visibility:vis},{merge:true});if(links()[pid])setLink(pid,{vis});emit()}
  async function remove(pid){await init();need();
    const ph=await fb.F.getDocs(fb.F.collection(fb.db,'projects',pid,'photos'));for(const d of ph.docs)await fb.F.deleteDoc(d.ref);
    await fb.F.deleteDoc(D('projects',pid,'content','main'));await fb.F.deleteDoc(D('projects',pid));const l=links();l[pid]={off:true};try{localStorage.setItem(LINKS,JSON.stringify(l))}catch(_){}
    for(const r of await HouserGallery.list(pid))if(r.cloudUp)await HouserGallery.put({...r,cloudUp:false,cloudSig:''});emit()}
  function unlink(pid){setLink(pid,null);emit()}
  // ponowne włączenie zapisu w chmurze dla projektu usuniętego wcześniej z chmury
  function enable(pid){setLink(pid,null);touch('project')}
  // projekt z chmury bez otwierania (eksport, duplikat)
  async function fetchProject(pid){await init();const meta=await getData('projects',pid);const c=await getData('projects',pid,'content','main');if(!meta||!c?.json)throw new Error('Nie ma takiego projektu w chmurze.');return {meta,project:JSON.parse(c.json)}}
  // kopia projektu w chmurze (nowy identyfikator, te same zdjęcia), bez zmiany bieżącego projektu
  async function duplicate(pid,name,newId){await init();need();const {meta,project}=await fetchProject(pid);
    project.projectId=newId;if(project.definitionSnapshot)project.definitionSnapshot.name=name;project.definitionName=name;
    const now=new Date().toISOString(),rev=Math.random().toString(36).slice(2,10);
    await fb.F.setDoc(D('projects',newId),{owner:user.uid,ownerName:user.name,ownerPhoto:user.photo,name,visibility:'private',createdAt:now,updatedAt:now,rev,stats:meta.stats||null,plan:meta.plan||'',cover:meta.cover||'',photoIds:[]});
    await fb.F.setDoc(D('projects',newId,'content','main'),{json:JSON.stringify(forCloud(project)),updatedAt:now});
    const ph=await fb.F.getDocs(fb.F.collection(fb.db,'projects',pid,'photos')),ids=[];
    for(const d of ph.docs){const id='g'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);await fb.F.setDoc(D('projects',newId,'photos',id),d.data());ids.push(id)}
    await fb.F.setDoc(D('projects',newId),{photoIds:ids},{merge:true});return newId}

  // automatyczny zapis powiązanego projektu po zmianach (projekt: 3 s, zdjęcia: 1,5 s od ostatniej zmiany)
  let timer=null,want={project:false,photos:false},busy=false;
  function touch(what){if(!enabled||!user)return;const pid=curPid();if(!eligible(pid)){emit();return}
    want[what==='photos'?'photos':'project']=true;if(op.state==='conflict')return;clearTimeout(timer);setOp('pending');timer=setTimeout(flush,want.project?3000:1500)}
  async function flush(){if(busy){clearTimeout(timer);timer=setTimeout(flush,1000);return}
    const rec=HouserStore.load(),pid=rec?.project?.projectId;if(!eligible(pid)){setOp('idle');return}
    busy=true;setOp('saving');const w=want;want={project:false,photos:false};
    try{if(w.project||!linkOf(pid)){const r=await saveProject(rec.project);if(r.conflict){setOp('conflict');hooks.conflict?.(r.conflict);return}}
      if(w.photos)await pushPhotos(curPid());setOp('saved')}
    catch(e){console.error(e);want={project:want.project||w.project,photos:want.photos||w.photos};setOp('error',e.message||String(e))}
    finally{busy=false}}
  global.addEventListener('online',()=>{if(op.state==='error')touch('project')});
  function saveNow(){clearTimeout(timer);want.project=true;want.photos=true;return flush()}

  const hooks={};
  global.HouserCloud={enabled,init,signIn,signOut,_testSignIn,user:()=>user,onAuth:cb=>authCbs.push(cb),onStatus:cb=>statusCbs.push(cb),status,
    configure(o){if(o.describe)describe=o.describe;Object.assign(hooks,o.hooks||{})},
    saveProject,open,listMine,listPublic,setVisibility,remove,unlink,enable,fetchProject,duplicate,touch,saveNow,isLinked:pid=>!!linkOf(pid),isOff:pid=>!!(pid&&links()[pid]?.off),
    resolveConflict:async keepLocal=>{op={state:'idle',at:null,msg:''};if(keepLocal){const rec=HouserStore.load();await saveProject(rec.project,{force:true});await pushPhotos(rec.project.projectId);setOp('saved')}else emit()}};
})(window);
