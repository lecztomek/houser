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
  if(embedded)return;
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
