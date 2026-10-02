// Wspólna nawigacja modułów.
// HouserNav.go('id-modułu') – przejście do innego modułu (zakładka w stronie głównej albo zwykły link).
// Gdy moduł otwarto samodzielnie, dodaje mały przycisk powrotu do strony głównej.
(function(){
  var embedded;
  try{embedded=window.self!==window.top;}catch(e){embedded=true;}
  var here=(document.currentScript&&document.currentScript.src)||'';
  var home=here?new URL('../',here).href:'../../';
  window.HouserNav={go:function(target){
    if(embedded){try{window.top.location.hash=target;return;}catch(e){}}
    location.href=home+'modules/'+target+'/';
  }};
  // W aplikacji (ramka strony głównej) plik projektu obsługuje wspólny pasek u góry – chowamy przyciski plików modułu.
  if(embedded){
    document.documentElement.classList.add('hs-embedded');
    var st=document.createElement('style');
    st.textContent='html.hs-embedded label:has(> input[type=file][accept*="json"]),'+
      'html.hs-embedded :is(#export,#exportDef,#exportProj,#newDef,#resetProject,#reset,#loadDefinitionBtn,#downloadDefinitionBtn,#saveProjectBtn,#loadProjectBtn,#undoBtn){display:none!important}'+
      'html.hs-embedded .section:has(> .row > label > input[type=file][accept*="json"]):not(:has(#fit)){display:none!important}';
    document.head.appendChild(st);
    // Ctrl+Z / Ctrl+Y w module → wspólne Cofnij/Ponów strony głównej (poza polami tekstowymi)
    document.addEventListener('keydown',function(e){if(!(e.ctrlKey||e.metaKey)||e.altKey)return;var t=e.target;if(t&&(t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.tagName==='SELECT'||t.isContentEditable))return;
      var u;try{u=window.top.HouserUndo}catch(_){}if(!u)return;var k=(e.key||'').toLowerCase();
      if(k==='z'&&!e.shiftKey){e.preventDefault();u.undo()}else if(k==='y'||(k==='z'&&e.shiftKey)){e.preventDefault();u.redo()}});
    return;
  }
  var id=location.pathname.replace(/\/(index\.html)?$/,'').split('/').pop();
  var a=document.createElement('a');
  a.href=home+(id?'#'+id:'');
  a.textContent='⌂ Moduły';
  a.title='Wróć do strony głównej z listą modułów';
  a.style.cssText='position:fixed;left:10px;bottom:10px;z-index:99999;background:#fff;color:#0f172a;border:1px solid #cbd5e1;'+
    'font:600 12px system-ui,Segoe UI,Arial,sans-serif;padding:7px 11px;border-radius:999px;'+
    'text-decoration:none;box-shadow:0 2px 8px rgba(15,23,42,.15);opacity:.9';
  a.onmouseenter=function(){a.style.opacity='1';};
  a.onmouseleave=function(){a.style.opacity='.9';};
  document.body.appendChild(a);
})();
// Pasek „czyj to dom” na górze każdego modułu: mój (zapisuje się) albo tylko podgląd (cudzy dom / brak konta – nic się nie zapisuje).
(function(){
  if(!document.body)return;
  var bar=document.createElement('div');bar.className='hs-lockbar';
  var css=document.createElement('style');css.textContent='.hs-lockbar{position:sticky;top:0;z-index:50;font:600 12.5px/1.4 system-ui,sans-serif;padding:5px 14px;text-align:center}@media(max-width:700px){.hs-lockbar{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:4px 10px;font-size:12px}}@media(max-width:700px){html.hs-embedded .hs-lockbar{display:none!important}}'+
    '.hs-lockbar.mine{background:#dcfce7;color:#166534}.hs-lockbar.shared{background:#dbeafe;color:#1e40af}.hs-lockbar.ro{background:#ffedd5;color:#9a3412;border-bottom:1px solid #fdba74}.hs-lockbar.flash{animation:hsflash .9s}'+
    '@keyframes hsflash{0%,100%{background:#ffedd5}40%{background:#fb923c;color:#fff}}.hs-rotoast{position:fixed;left:50%;top:44px;transform:translateX(-50%);background:#9a3412;color:#fff;padding:7px 14px;border-radius:8px;font:600 13px system-ui;z-index:60}';
  document.head.appendChild(css);document.body.insertBefore(bar,document.body.firstChild);
  function esc(t){return String(t||'').replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
  function paint(){var S=window.HouserStore,p=S&&S.load()&&S.load().project,why=S&&S.lockReason?S.lockReason():null,name='';try{name=localStorage.getItem('houser:user-name')||''}catch(e){}
    if(!p){bar.style.display='none';return}bar.style.display='';
    var narrow=window.innerWidth<700; // na telefonie krótko, w jednej linii
    if(why==='ro'){var ro=p.readOnly||{};bar.className='hs-lockbar ro';bar.innerHTML=narrow?'👁 Podgląd · '+(ro.src==='base'?'baza Housera':esc(ro.owner||'społeczność'))+' – nic się nie zapisuje':'👁 Tylko podgląd · '+(ro.src==='base'?'baza Housera':'społeczność · autor: '+esc(ro.owner||'nieznany'))+' – zmiany nie są zapisywane. Żeby pracować nad tym domem, zrób kopię do siebie (przycisk na górze strony).'}
    else if(why==='guest'){bar.className='hs-lockbar ro';bar.innerHTML=narrow?'👁 Bez konta – tylko podgląd':'👁 Tylko podgląd – bez konta zmiany nie są zapisywane. Zaloguj się na górze strony, żeby projektować.'}
    else if(p.sharedEdit){bar.className='hs-lockbar shared';bar.innerHTML=narrow?'✏️ Wspólny dom · '+esc(p.sharedEdit.owner||'')+' – zmiany zapisują się':'✏️ Wspólny dom · autor: '+esc(p.sharedEdit.owner||'nieznany')+' – możesz zmieniać, zmiany zapisują się w tym samym domu'}
    else{bar.className='hs-lockbar mine';bar.innerHTML='🏠 Mój dom'+(name?' · '+esc(name):'')+' – zmiany zapisują się same'}}
  window.HouserLock={flash:function(){bar.classList.remove('flash');void bar.offsetWidth;bar.classList.add('flash');
    var t=document.createElement('div');t.className='hs-rotoast';t.textContent='Tylko podgląd – ta zmiana nie została zapisana';document.body.appendChild(t);setTimeout(function(){t.remove()},2200)},paint:paint};
  paint();window.addEventListener('storage',function(e){if(!e.key||e.key==='houser:current-project'||e.key==='houser:guest'||e.key==='houser:user-name')paint()});
  try{if(sessionStorage.getItem('houser:ro-flash')){sessionStorage.removeItem('houser:ro-flash');setTimeout(window.HouserLock.flash,300)}}catch(e){}
})();
