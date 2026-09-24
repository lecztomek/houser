// Projekty w tej przeglądarce (bez logowania): każdy projekt, który zmieniasz, zapisuje się tu sam.
// IndexedDB 'houser-projects', rekord: {id (= projectId), name, updatedAt, stats, plan (miniaturka JPEG), project}
(function(global){
  const DB='houser-projects',STORE='projects';
  let dbp=null;
  function db(){if(dbp)return dbp;dbp=new Promise((res,rej)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>{const d=r.result;if(!d.objectStoreNames.contains(STORE))d.createObjectStore(STORE,{keyPath:'id'})};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});return dbp}
  function tx(mode,fn){return db().then(d=>new Promise((res,rej)=>{const t=d.transaction(STORE,mode),st=t.objectStore(STORE);const q=fn(st);t.oncomplete=()=>res(q&&q.result!==undefined?q.result:undefined);t.onerror=()=>rej(t.error)}))}
  async function list(){const all=await tx('readonly',st=>st.getAll());return (all||[]).map(({project,...m})=>m).sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||''))}
  async function get(id){return tx('readonly',st=>st.get(id))}
  async function put(rec){await tx('readwrite',st=>st.put(rec));return rec}
  async function remove(id){await tx('readwrite',st=>st.delete(id))}
  global.HouserLibrary={list,get,put,remove};
})(window);
