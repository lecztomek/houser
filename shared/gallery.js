// Galeria domu – wybrane zdjęcia (wizualizacje AI, zdjęcia z 3D, własne pliki) przypięte do projektu (project.projectId).
// Trzymane w przeglądarce (IndexedDB), NIE w pliku projektu. Później: synchronizacja do chmury.
// Rekord: {id, projectId, order, createdAt, caption, cover, source:'ai'|'3d'|'upload', image (JPEG ≤1600 px), thumb (JPEG ≤420 px), before (zdjęcie z 3D do porównania), ref}
(function(global){
  const DB='houser-gallery',STORE='items',MAX=30;
  const bc=('BroadcastChannel' in global)?new BroadcastChannel('houser-gallery'):null;
  let dbp=null;
  // Safari (iOS) potrafi zawiesić indexedDB.open – najpierw „budzimy” bazę, a otwarcie ma limit czasu (bez wiecznego czekania)
  const openIDB=(name,ver,up)=>{const wake=indexedDB.databases?Promise.race([indexedDB.databases().catch(()=>{}),new Promise(r=>setTimeout(r,400))]):Promise.resolve();
    return wake.then(()=>new Promise((res,rej)=>{let done=false;const r=indexedDB.open(name,ver);r.onupgradeneeded=()=>up(r.result);r.onsuccess=()=>{done=true;res(r.result)};r.onerror=()=>{done=true;rej(r.error)};setTimeout(()=>{if(!done)rej(new Error('Baza w przeglądarce nie odpowiada'))},4000)}))};
  function db(){if(dbp)return dbp;dbp=openIDB(DB,1,d=>{if(!d.objectStoreNames.contains(STORE)){const s=d.createObjectStore(STORE,{keyPath:'id'});s.createIndex('project','projectId')}}).catch(e=>{dbp=null;throw e});return dbp}
  function tx(mode,fn){return db().then(d=>new Promise((res,rej)=>{const t=d.transaction(STORE,mode),st=t.objectStore(STORE);const out=fn(st);t.oncomplete=()=>res(out&&out.result!==undefined?out.result:out);t.onerror=()=>rej(t.error)}))}
  const changed=()=>{try{bc&&bc.postMessage('changed')}catch(_){}};
  // zmniejszenie do JPEG (maks. szerokość/wysokość)
  function resize(url,max,q=.86){return new Promise((res,rej)=>{const im=new Image();im.onload=()=>{const sc=Math.min(1,max/Math.max(im.width,im.height)),c=document.createElement('canvas');c.width=Math.round(im.width*sc);c.height=Math.round(im.height*sc);
    const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.drawImage(im,0,0,c.width,c.height);res(c.toDataURL('image/jpeg',q))};im.onerror=()=>rej(new Error('Nie udało się odczytać obrazu.'));im.src=url})}
  async function list(projectId){if(!projectId)return [];const all=await tx('readonly',st=>st.index('project').getAll(projectId));return (all||[]).sort((a,b)=>a.order-b.order||a.createdAt.localeCompare(b.createdAt))}
  const guard=()=>{if(!global.HOUSER_SHELL&&global.HouserStore?.lockReason?.())throw new Error('Tylko podgląd – w cudzym domu (albo bez konta) nie można zmieniać galerii.')};
  async function put(rec){guard();await tx('readwrite',st=>st.put(rec));changed();return rec}
  async function add(projectId,image,opts={}){
    guard();if(!projectId)throw new Error('Brak projektu.');const items=await list(projectId);if(items.length>=MAX){const e=new Error('Galeria ma już '+MAX+' zdjęć – usuń któreś, żeby dodać nowe.');e.limit=true;throw e}
    const [big,thumb,before]=await Promise.all([resize(image,1600),resize(image,420,.8),opts.before?resize(opts.before,1600):null]);
    const rec={id:'g'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),projectId,order:(items.at(-1)?.order??-1)+1,createdAt:new Date().toISOString(),caption:opts.caption||'',cover:!items.length,source:opts.source||'upload',image:big,thumb,before,ref:opts.ref||null};
    return put(rec)}
  async function remove(id){guard();const rec=await tx('readonly',st=>st.get(id));await tx('readwrite',st=>st.delete(id));
    if(rec?.cover){const rest=await list(rec.projectId);if(rest[0]){rest[0].cover=true;await tx('readwrite',st=>st.put(rest[0]))}}changed()}
  async function setCover(projectId,id){guard();const items=await list(projectId);await tx('readwrite',st=>{for(const r of items){r.cover=r.id===id;st.put(r)}});changed()}
  async function reorder(projectId,ids){guard();const items=await list(projectId),byId=Object.fromEntries(items.map(r=>[r.id,r]));await tx('readwrite',st=>{ids.forEach((id,i)=>{const r=byId[id];if(r){r.order=i;st.put(r)}})});changed()}
  async function cover(projectId){const items=await list(projectId);return items.find(r=>r.cover)||items[0]||null}
  async function hasRef(projectId,refKey){return (await list(projectId)).some(r=>r.ref?.key===refKey)}
  function onChange(cb){if(bc)bc.addEventListener('message',()=>cb())}
  global.HouserGallery={MAX,list,add,put,remove,setCover,reorder,cover,hasRef,onChange,resize};
})(window);
