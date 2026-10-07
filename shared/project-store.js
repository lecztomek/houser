// Wspólny "bieżący projekt" wszystkich modułów – trzymany w localStorage przeglądarki.
// Moduł, który coś zmienia, zapisuje projekt (format jak eksport z Projektowania).
// Pozostałe moduły (także otwarte w innych kartach lub ramkach) dostają powiadomienie i się odświeżają.
// Nic nie wychodzi poza przeglądarkę.
(function(global){
  const KEY='houser:current-project';
  const listeners=[];
  const selfId=Math.random().toString(36).slice(2);

  function load(){
    try{const raw=localStorage.getItem(KEY);if(!raw)return null;const rec=JSON.parse(raw);return rec&&rec.project?rec:null;}catch(_){return null;}
  }
  // tylko podgląd: cudzy dom (project.readOnly) albo brak konta (flaga 'houser:guest' ustawiana przez stronę główną).
  // Moduły nie mogą wtedy nic zapisać; strona główna (HOUSER_SHELL) zapisuje zawsze (otwieranie domu, kopia do siebie).
  function lockReason(){try{const p=load()?.project;if(p?.readOnly)return 'ro';if(localStorage.getItem('houser:guest')==='1')return 'guest'}catch(_){}return null}
  let lastInput=0;for(const ev of ['pointerdown','keydown','change','input'])global.addEventListener?.(ev,()=>{lastInput=Date.now()},true);
  let reverting=false;
  function blocked(){if(reverting)return;const userEdit=Date.now()-lastInput<1500;
    try{global.HouserLock?.flash?.()}catch(_){}
    if(userEdit){reverting=true;setTimeout(()=>{try{sessionStorage.setItem('houser:ro-flash','1')}catch(_){}location.reload()},700)}} // zmiana z ręki – wracamy do zapisanego stanu
  // source: nazwa modułu, który zapisuje (np. 'projektowanie')
  // czy „nowy” projekt to tylko uporządkowany stary: te same wartości, najwyżej dopisane pola (np. wyliczona wysokość dachu, inna kolejność kluczy)
  function onlyTidied(n,o){if(o===undefined)return true;if(o===null||typeof o!=='object')return n===o;if(n===null||typeof n!=='object'||Array.isArray(n)!==Array.isArray(o))return false;
    if(Array.isArray(o))return n.length===o.length&&o.every((v,i)=>onlyTidied(n[i],v));return Object.keys(o).every(k=>onlyTidied(n[k],o[k]))}
  function sameHouse(project){const cur=load()?.project;if(!cur||!project)return false;const strip=p=>{const c={...p};delete c.savedAt;delete c.definitionFingerprint;return c};return onlyTidied(strip(project),strip(cur))}
  function save(project,source){
    // podgląd: zapis bez prawdziwej zmiany (moduł tylko uporządkował projekt, np. po przełączeniu piętra) – pomijamy po cichu, bez cofania
    if(!global.HOUSER_SHELL&&lockReason()){if(!sameHouse(project))blocked();return false}
    const rec={project,source:source||'',writer:selfId,updatedAt:new Date().toISOString()};
    try{localStorage.setItem(KEY,JSON.stringify(rec));return true;}catch(_){return false;}
  }
  // Zmiana fragmentu bieżącego projektu (np. tylko elevationSettings) bez nadpisywania reszty.
  function update(fn,source){
    const rec=load();if(!rec)return false;const p=JSON.parse(JSON.stringify(rec.project));const out=fn(p)||p;return save(out,source);
  }
  // cb(record) wywoływane, gdy projekt zmienił INNY dokument (inna ramka/karta).
  function subscribe(cb){listeners.push(cb);}
  // moduł schowany w tle (ramka strony głównej z display:none) nie przelicza się przy każdej zmianie – zapamiętuje
  // tylko ostatnią wersję i odświeża się raz, gdy znów jest widoczny (strona główna woła HouserStore.wake()).
  // Bez tego każda zmiana przeliczała wszystkie odwiedzone moduły naraz i strona zwalniała z czasem.
  let pendingRec=null;
  const hiddenFrame=()=>{try{const fe=global.frameElement;return !!fe&&!fe.getClientRects().length}catch(_){return false}};
  const notify=rec=>{for(const cb of listeners){try{cb(rec);}catch(err){console.error(err);}}};
  global.addEventListener('storage',e=>{
    if(e.key!==KEY||!e.newValue)return;
    let rec;try{rec=JSON.parse(e.newValue);}catch(_){return;}
    if(!rec||!rec.project||rec.writer===selfId)return;
    if(hiddenFrame()){pendingRec=rec;return}
    pendingRec=null;notify(rec);
  });
  function wake(){if(!pendingRec)return;const rec=load()||pendingRec;pendingRec=null;if(rec.writer!==selfId)notify(rec)}
  function clear(){try{localStorage.removeItem(KEY);}catch(_){}}
  // stały identyfikator projektu (np. do galerii zdjęć) – nie zmienia się przy edycji pomieszczeń
  function newId(){return 'p'+Date.now().toString(36)+Math.random().toString(36).slice(2,8)}
  function projectId(){const rec=load();if(!rec)return null;if(rec.project.projectId)return rec.project.projectId;const id=newId();rec.project.projectId=id;save(rec.project,rec.source||'');return id}

  global.HouserStore={KEY,load,save,update,subscribe,wake,clear,newId,projectId,lockReason};
})(window);
