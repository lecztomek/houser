// Wspólna nawigacja modułów.
// W stronie głównej (iframe) nic nie robi – tam nawigacją są zakładki.
// Gdy moduł otwarto samodzielnie, dodaje mały przycisk powrotu do strony głównej.
(function(){
  var embedded;
  try{embedded=window.self!==window.top;}catch(e){embedded=true;}
  if(embedded)return;
  var here=(document.currentScript&&document.currentScript.src)||'';
  var home=here?new URL('../',here).href:'../../';
  var id=location.pathname.replace(/\/(index\.html)?$/,'').split('/').pop();
  var a=document.createElement('a');
  a.href=home+(id?'#'+id:'');
  a.textContent='⌂ Moduły';
  a.title='Wróć do strony głównej z listą modułów';
  a.style.cssText='position:fixed;left:10px;bottom:10px;z-index:99999;background:#0f172a;color:#fff;'+
    'font:600 12px system-ui,Segoe UI,Arial,sans-serif;padding:7px 11px;border-radius:999px;'+
    'text-decoration:none;box-shadow:0 2px 8px rgba(0,0,0,.25);opacity:.85';
  a.onmouseenter=function(){a.style.opacity='1';};
  a.onmouseleave=function(){a.style.opacity='.85';};
  document.body.appendChild(a);
})();
