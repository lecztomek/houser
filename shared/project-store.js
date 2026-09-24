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
  // source: nazwa modułu, który zapisuje (np. 'projektowanie')
  function save(project,source){
    const rec={project,source:source||'',writer:selfId,updatedAt:new Date().toISOString()};
    try{localStorage.setItem(KEY,JSON.stringify(rec));return true;}catch(_){return false;}
  }
  // Zmiana fragmentu bieżącego projektu (np. tylko elevationSettings) bez nadpisywania reszty.
  function update(fn,source){
    const rec=load();if(!rec)return false;const p=JSON.parse(JSON.stringify(rec.project));const out=fn(p)||p;return save(out,source);
  }
  // cb(record) wywoływane, gdy projekt zmienił INNY dokument (inna ramka/karta).
  function subscribe(cb){listeners.push(cb);}
  global.addEventListener('storage',e=>{
    if(e.key!==KEY||!e.newValue)return;
    let rec;try{rec=JSON.parse(e.newValue);}catch(_){return;}
    if(!rec||!rec.project||rec.writer===selfId)return;
    for(const cb of listeners){try{cb(rec);}catch(err){console.error(err);}}
  });
  function clear(){try{localStorage.removeItem(KEY);}catch(_){}}
  // stały identyfikator projektu (np. do galerii zdjęć) – nie zmienia się przy edycji pomieszczeń
  function newId(){return 'p'+Date.now().toString(36)+Math.random().toString(36).slice(2,8)}
  function projectId(){const rec=load();if(!rec)return null;if(rec.project.projectId)return rec.project.projectId;const id=newId();rec.project.projectId=id;save(rec.project,rec.source||'');return id}

  global.HouserStore={KEY,load,save,update,subscribe,clear,newId,projectId};
})(window);
