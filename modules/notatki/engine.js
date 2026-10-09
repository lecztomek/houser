// Notatki do projektu – prosta lista: tekst, rodzaj (pomysł, pytanie, do zrobienia…), zrobione, ważne.
// HouserNotes.list(project, {cat, status, q}) -> notatki posortowane; HouserNotes.stats(project) -> {total, open, done, byCat}
// Dane: project.notes = [{id, text, cat, done, star, at, upd}]
(function(global){
  const CATS={idea:{name:'Pomysł',col:'#ca8a04'},question:{name:'Pytanie',col:'#2563eb'},todo:{name:'Do zrobienia',col:'#16a34a'},
    decision:{name:'Decyzja',col:'#7c3aed'},problem:{name:'Problem',col:'#dc2626'},cost:{name:'Koszt / oferta',col:'#0891b2'}};
  const newId=()=>'n'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
  function norm(n){const o=n&&typeof n==='object'?n:{};return {id:String(o.id||newId()),text:String(o.text||''),cat:CATS[o.cat]?o.cat:'idea',done:!!o.done,star:!!o.star,at:o.at||'',upd:o.upd||o.at||''}}
  const all=p=>(Array.isArray(p?.notes)?p.notes:[]).map(norm);
  function make(o){const now=new Date().toISOString();return norm({...o,id:newId(),at:now,upd:now})}
  // kolejność: otwarte przed zamkniętymi, ważne na górze, potem najnowsze
  function list(project,F){F=F||{};const q=String(F.q||'').trim().toLowerCase(),st=F.status||'all';
    return all(project).filter(n=>(!F.cat||n.cat===F.cat)&&(st==='all'||(st==='done')===n.done)&&(!q||n.text.toLowerCase().includes(q)))
      .sort((a,b)=>(a.done-b.done)||(b.star-a.star)||String(b.upd).localeCompare(String(a.upd)))}
  function stats(project){const L=all(project),byCat={};for(const n of L)if(!n.done)byCat[n.cat]=(byCat[n.cat]||0)+1;
    return {total:L.length,open:L.filter(n=>!n.done).length,done:L.filter(n=>n.done).length,byCat}}
  // zwykły tekst do skopiowania (np. pytania do architekta)
  function toText(L){const by={};for(const n of L)(by[n.cat]=by[n.cat]||[]).push(n);let s='';
    for(const [k,C] of Object.entries(CATS)){if(!by[k])continue;s+=C.name.toUpperCase()+'\n';for(const n of by[k])s+=(n.done?'[x] ':'[ ] ')+(n.star?'★ ':'')+n.text.replace(/\s*\n\s*/g,' / ')+'\n';s+='\n'}
    return s.trim()}
  global.HouserNotes={CATS,norm,all,make,list,stats,toText};
})(typeof window!=='undefined'?window:globalThis);
