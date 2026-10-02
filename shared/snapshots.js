// Zdjęcia z podglądów 3D i wygenerowane z nich wizualizacje – IndexedDB w przeglądarce (za duże na localStorage).
// Rekord: {id, createdAt, source:'wnetrze-3d'|'zewnatrz-3d', meta:{...}, image:'data:image/jpeg;base64,...', results:[{id,createdAt,prompt,model,image}]}
(function(global){
  const DB='houser', STORE='snapshots';
  const bc=('BroadcastChannel' in global)?new BroadcastChannel('houser-snapshots'):null;
  let dbp=null;
  // Safari (iOS) potrafi zawiesić indexedDB.open – najpierw „budzimy” bazę, a otwarcie ma limit czasu (bez wiecznego czekania)
  const openIDB=(name,ver,up)=>{const wake=indexedDB.databases?Promise.race([indexedDB.databases().catch(()=>{}),new Promise(r=>setTimeout(r,400))]):Promise.resolve();
    return wake.then(()=>new Promise((res,rej)=>{let done=false;const r=indexedDB.open(name,ver);r.onupgradeneeded=()=>up(r.result);r.onsuccess=()=>{done=true;res(r.result)};r.onerror=()=>{done=true;rej(r.error)};setTimeout(()=>{if(!done)rej(new Error('Baza w przeglądarce nie odpowiada'))},4000)}))};
  function db(){if(dbp)return dbp;dbp=openIDB(DB,1,d=>{if(!d.objectStoreNames.contains(STORE))d.createObjectStore(STORE,{keyPath:'id'})}).catch(e=>{dbp=null;throw e});return dbp}
  function tx(mode,fn){return db().then(d=>new Promise((res,rej)=>{const t=d.transaction(STORE,mode),st=t.objectStore(STORE);const out=fn(st);t.oncomplete=()=>res(out&&out.result!==undefined?out.result:out);t.onerror=()=>rej(t.error)}))}
  const changed=()=>{try{bc&&bc.postMessage('changed')}catch(_){}};
  async function list(){const all=await tx('readonly',st=>st.getAll());return (all||[]).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))}
  async function get(id){return tx('readonly',st=>st.get(id))}
  async function put(rec){await tx('readwrite',st=>st.put(rec));changed();return rec}
  function ping(id){try{localStorage.setItem('houser:last-snapshot',id+'|'+Date.now())}catch(_){}}
  // zdjęcie należy do domu, który był otwarty (meta.projectId); starsze zdjęcia nie mają domu – pokazujemy je osobno jako „starsze”
  const curPid=()=>{try{return global.HouserStore?.projectId?.()||null}catch(_){return null}};
  async function forProject(pid){pid=pid||curPid();return (await list()).filter(s=>!s.meta?.projectId||s.meta.projectId===pid)}
  async function add(image,source,meta){const rec={id:'s'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),createdAt:new Date().toISOString(),source,meta:{...(meta||{}),projectId:curPid()},image,results:[]};await put(rec);ping(rec.id);return rec}
  async function remove(id){await tx('readwrite',st=>st.delete(id));changed()}
  // przypisanie starszego zdjęcia do domu (gdy użyjesz go w tym domu)
  async function claim(id,pid){const r=await get(id);if(r&&!r.meta?.projectId){r.meta={...(r.meta||{}),projectId:pid||curPid()};await put(r)}}
  function onChange(cb){if(bc)bc.addEventListener('message',()=>cb())}

  // Zdjęcie z płótna WebGL: tło (niebo z CSS) + scena, JPEG, maks. 1600 px szerokości.
  // Wywołuj zaraz po narysowaniu klatki (w tym samym zadaniu), wtedy bufor WebGL jest jeszcze pełny.
  function capture(canvas,skyTop,skyBottom){
    const maxW=1600,scale=Math.min(1,maxW/canvas.width),w=Math.round(canvas.width*scale),h=Math.round(canvas.height*scale);
    const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');
    const g=x.createLinearGradient(0,0,0,h);g.addColorStop(0,skyTop||'#b9d4e7');g.addColorStop(1,skyBottom||'#edf2f5');x.fillStyle=g;x.fillRect(0,0,w,h);
    x.drawImage(canvas,0,0,w,h);return c.toDataURL('image/jpeg',.9);
  }
  // PNG (i duże obrazy) -> JPEG, maks. 1600 px – wizualizacje AI przychodzą jako PNG, kilka razy większe
  function toJpeg(url,q=.88,maxW=1600){return new Promise(res=>{if(!url||!/^data:image\//.test(url)||/^data:image\/jpeg/.test(url)&&url.length<700000){res(url);return}
    const im=new Image();im.onload=()=>{const sc=Math.min(1,maxW/im.width),c=document.createElement('canvas');c.width=Math.round(im.width*sc);c.height=Math.round(im.height*sc);
      const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.drawImage(im,0,0,c.width,c.height);const out=c.toDataURL('image/jpeg',q);res(out.length<url.length?out:url)};
    im.onerror=()=>res(url);im.src=url})}
  global.HouserSnapshots={list,get,put,add,remove,onChange,capture,toJpeg,forProject,claim};
})(window);
