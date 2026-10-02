// Projekty w tej przeglądarce (bez logowania): każdy projekt, który zmieniasz, zapisuje się tu sam.
// IndexedDB 'houser-projects', rekord: {id (= projectId), name, updatedAt, stats, plan (miniaturka JPEG), project}
(function(global){
  const DB='houser-projects',STORE='projects';
  let dbp=null;
  // Safari (iOS) potrafi zawiesić indexedDB.open – najpierw „budzimy” bazę, a otwarcie ma limit czasu (bez wiecznego czekania)
  const openIDB=(name,ver,up)=>{const wake=indexedDB.databases?Promise.race([indexedDB.databases().catch(()=>{}),new Promise(r=>setTimeout(r,400))]):Promise.resolve();
    return wake.then(()=>new Promise((res,rej)=>{let done=false;const r=indexedDB.open(name,ver);r.onupgradeneeded=()=>up(r.result);r.onsuccess=()=>{done=true;res(r.result)};r.onerror=()=>{done=true;rej(r.error)};setTimeout(()=>{if(!done)rej(new Error('Baza w przeglądarce nie odpowiada'))},4000)}))};
  function db(){if(dbp)return dbp;dbp=openIDB(DB,1,d=>{if(!d.objectStoreNames.contains(STORE))d.createObjectStore(STORE,{keyPath:'id'})}).catch(e=>{dbp=null;throw e});return dbp}
  function tx(mode,fn){return db().then(d=>new Promise((res,rej)=>{const t=d.transaction(STORE,mode),st=t.objectStore(STORE);const q=fn(st);t.oncomplete=()=>res(q&&q.result!==undefined?q.result:undefined);t.onerror=()=>rej(t.error)}))}
  async function list(){const all=await tx('readonly',st=>st.getAll());return (all||[]).map(({project,...m})=>m).sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||''))}
  async function get(id){return tx('readonly',st=>st.get(id))}
  async function put(rec){await tx('readwrite',st=>st.put(rec));return rec}
  async function remove(id){await tx('readwrite',st=>st.delete(id))}
  global.HouserLibrary={list,get,put,remove};
})(window);
