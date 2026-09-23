// Zdjęcia z podglądów 3D i wygenerowane z nich wizualizacje – IndexedDB w przeglądarce (za duże na localStorage).
// Rekord: {id, createdAt, source:'wnetrze-3d'|'zewnatrz-3d', meta:{...}, image:'data:image/jpeg;base64,...', results:[{id,createdAt,prompt,model,image}]}
(function(global){
  const DB='houser', STORE='snapshots';
  const bc=('BroadcastChannel' in global)?new BroadcastChannel('houser-snapshots'):null;
  let dbp=null;
  function db(){
    if(dbp)return dbp;
    dbp=new Promise((res,rej)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>{const d=r.result;if(!d.objectStoreNames.contains(STORE))d.createObjectStore(STORE,{keyPath:'id'})};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});
    return dbp;
  }
  function tx(mode,fn){return db().then(d=>new Promise((res,rej)=>{const t=d.transaction(STORE,mode),st=t.objectStore(STORE);const out=fn(st);t.oncomplete=()=>res(out&&out.result!==undefined?out.result:out);t.onerror=()=>rej(t.error)}))}
  const changed=()=>{try{bc&&bc.postMessage('changed')}catch(_){}};
  async function list(){const all=await tx('readonly',st=>st.getAll());return (all||[]).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))}
  async function get(id){return tx('readonly',st=>st.get(id))}
  async function put(rec){await tx('readwrite',st=>st.put(rec));changed();return rec}
  function ping(id){try{localStorage.setItem('houser:last-snapshot',id+'|'+Date.now())}catch(_){}}
  async function add(image,source,meta){const rec={id:'s'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),createdAt:new Date().toISOString(),source,meta:meta||{},image,results:[]};await put(rec);ping(rec.id);return rec}
  async function remove(id){await tx('readwrite',st=>st.delete(id));changed()}
  async function clear(){await tx('readwrite',st=>st.clear());changed()}
  // zastąpienie wszystkich zdjęć (wczytanie pliku projektu)
  async function replaceAll(list){await tx('readwrite',st=>{st.clear();for(const r of list||[])if(r&&r.id&&r.image)st.put(r)});changed()}
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
  // wszystkie zdjęcia do pliku projektu – wyniki zmniejszone do JPEG
  async function exportAll(){const list=await list_();for(const r of list){r.image=await toJpeg(r.image);for(const x of r.results||[])x.image=await toJpeg(x.image)}return list}
  const list_=list;
  global.HouserSnapshots={list,get,put,add,remove,clear,replaceAll,onChange,capture,toJpeg,exportAll};
})(window);
