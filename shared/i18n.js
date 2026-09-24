// Wersje językowe (PL / EN). Strona jest pisana po polsku; w trybie EN ten skrypt tłumaczy w locie
// teksty w DOM (także dodawane później), atrybuty (title, placeholder, aria-label, alt), tytuł strony,
// okna alert/confirm/prompt i napisy rysowane na canvasie. Słownik: shared/i18n-en.js (ładowany przed tym plikiem).
// Wybór języka: localStorage 'houser:lang' ('pl' | 'en'), domyślnie wg języka przeglądarki.
// Zgodność ze starszym Safari (iOS < 15.4): Array.prototype.at, structuredClone
if(!Array.prototype.at)Object.defineProperty(Array.prototype,'at',{value:function(i){i=Math.trunc(i)||0;if(i<0)i+=this.length;return this[i]},writable:true,configurable:true});
if(!String.prototype.at)Object.defineProperty(String.prototype,'at',{value:function(i){i=Math.trunc(i)||0;if(i<0)i+=this.length;return this[i]},writable:true,configurable:true});
if(typeof structuredClone!=='function')window.structuredClone=v=>v===undefined?v:JSON.parse(JSON.stringify(v));
(function(global){
  const KEY='houser:lang';
  let lang=null;try{lang=localStorage.getItem(KEY)}catch(_){}
  if(lang!=='pl'&&lang!=='en')lang=/^pl\b/i.test(navigator.language||'pl')?'pl':'en';
  const api={lang,set(l){try{localStorage.setItem(KEY,l)}catch(_){}(global.top||global).location.reload()},t:s=>s};
  global.HouserI18n=api;
  document.documentElement.lang=lang;
  if(lang==='pl')return;

  const D=global.HOUSER_I18N_EN||{},cache=new Map();
  // liczba: 12 · 12,5 · 1.25 · 17 073 (spacja tysięcy); w EN przecinek dziesiętny → kropka, spacja tysięcy → przecinek
  const NUM=/(^|[^\p{L}\d])(\d{1,3}(?:[ \u00a0\u202f]\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)*)(?![\p{L}\d])/gu; // bez lookbehind – starsze Safari (iOS < 16.4) go nie znają
  const enNum=m=>/^\d+,\d+$/.test(m)?m.replace(',','.'):m.replace(/[ \u00a0\u202f](?=\d{3})/g,',').replace(/,(\d+)$/,(x,d)=>d.length===3&&/[ \u00a0\u202f]/.test(m)?x:'.'+d);
  // fragmenty: wielowyrazowe frazy i pojedyncze słowa od wielkiej litery (np. nazwy pomieszczeń), najdłuższe najpierw
  const esc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const frag=Object.keys(D).filter(k=>!k.includes('{n}')&&k.length>=3&&/^[\p{L}„(]/u.test(k)&&(/\s/.test(k)||/^\p{Lu}/u.test(k))&&!/^\p{Lu}+$/u.test(k)).sort((a,b)=>b.length-a.length);
  const FR=frag.length?new RegExp('(^|[^\\p{L}\\d])('+frag.map(esc).join('|')+')(?![\\p{L}\\d])','gu'):null;
  const PL=/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/;

  const look=s=>{if(s in D)return D[s];const nums=[];const tpl=s.replace(NUM,(m,pre,n)=>{nums.push(n);return pre+'{n}'});
    if(nums.length&&tpl in D){let i=0;return D[tpl].replace(/\{n\}/g,()=>enNum(nums[i++]??''))}
    // nazwy w cudzysłowie („Salon”) jako {q} – nazwę tłumaczymy osobno
    if(s.includes('„')){const qs=[],n2=[];const t2=s.replace(/„([^”]*)”/g,(m,x)=>{qs.push(x);return '„{q}”'}).replace(NUM,(m,pre,n)=>{n2.push(n);return pre+'{n}'});
      if(t2 in D){let i=0,j=0;return D[t2].replace(/\{q\}/g,()=>core(qs[j++]??'')).replace(/\{n\}/g,()=>enNum(n2[i++]??''))}}
    return null};
  // rozbij tekst na dwie części przy pierwszym albo ostatnim separatorze i przetłumacz każdą osobno (wybór: mniej polskich znaków w wyniku)
  const plLeft=r=>(r.match(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g)||[]).length;
  const split=(s,re)=>{const all=[...s.matchAll(re)].filter(m=>m.index>0&&m.index+m[0].length<s.length);if(!all.length)return null;
    const at=m=>{const k=m[1]?m[1].length:0,a=m.index+k;return core(s.slice(0,a))+m[0].slice(k)+core(s.slice(m.index+m[0].length))};
    const a=at(all[0]);if(all.length===1)return a;const b=at(all[all.length-1]);return plLeft(b)<plLeft(a)?b:a};
  const memo=new Map();
  function core(s){let r=memo.get(s);if(r===undefined){r=core0(s);memo.set(s,r)}return r}
  function core0(s){
    const r=look(s);if(r!=null)return r;
    const pre=/^(\s*(?:\d+\.|[-•·–✓✗⚠️⭐↶↷💾📷]+)\s+)([\s\S]+)$/u.exec(s);if(pre)return pre[1]+core(pre[2]);
    const post=/^([\s\S]+?)(\s*[:.…!?]+)$/.exec(s);if(post){const q=look(post[1]);if(q!=null)return q+post[2]}
    return split(s,/\n+/g)??split(s,/\s+[·–—↔|→]\s+|\s*<->\s*/g)??split(s,/([.!?])\s+(?=[\p{Lu}„(])/gu)??split(s,/:\s+|;\s+|\s+\(|\)\s*/g)??(FR?s.replace(FR,(m,pre,w)=>pre+D[w]):s);
  }
  function t(s){
    if(!s||typeof s!=='string')return s;
    const m=/^(\s*)([\s\S]*?)(\s*)$/.exec(s),body=m[2];if(!body||!/\p{L}/u.test(body))return s;
    const key=body.replace(/\s+/g,' ');let r=cache.get(key);
    if(r===undefined){r=core(key);if(cache.size>20000)cache.clear();cache.set(key,r)}
    return r===key?s:m[1]+r+m[3];
  }
  const tl=s=>s.split(/(\n+)/).map(x=>/\n/.test(x)?x:t(x)).join(''); // tekst wieloliniowy (okna dialogowe) – każda linia osobno
  api.t=t;

  const SKIP=new Set(['SCRIPT','STYLE','TEXTAREA','CODE','PRE','NOSCRIPT']);
  const ATTRS=['title','placeholder','aria-label','alt','label'];
  const done=new WeakMap(); // węzeł -> ostatnio wstawione tłumaczenie (żeby nie tłumaczyć dwa razy)
  const skipEl=el=>{for(let e=el;e;e=e.parentElement){if(SKIP.has(e.tagName)||e.isContentEditable||e.hasAttribute?.('data-noi18n'))return true}return false};
  function textNode(n){const v=n.data;if(done.get(n)===v)return;const pe=n.parentElement;if(!pe||skipEl(pe))return;const r=t(v);done.set(n,r);if(r!==v){if(pe.tagName==='OPTION'&&!pe.hasAttribute('value'))pe.setAttribute('value',pe.value);n.data=r}}
  function attrs(el){if(el.hasAttribute('data-noi18n'))return;
    for(const a of ATTRS){const v=el.getAttribute(a);if(!v)continue;const k='a:'+a;const prev=el['__i18n'+k];if(prev===v)continue;const r=t(v);el['__i18n'+k]=r;if(r!==v)el.setAttribute(a,r)}
    if(el.tagName==='INPUT'&&/^(button|submit|reset)$/i.test(el.type)&&el.value){const r=t(el.value);if(r!==el.value)el.value=r}}
  function walk(root){
    if(root.nodeType===3){textNode(root);return}
    if(root.nodeType!==1&&root.nodeType!==9&&root.nodeType!==11)return;
    if(root.nodeType===1){if(SKIP.has(root.tagName))return;attrs(root)}
    const w=document.createTreeWalker(root,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT,{acceptNode:n=>n.nodeType===1&&SKIP.has(n.tagName)?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT});
    let n;while(n=w.nextNode()){if(n.nodeType===3)textNode(n);else attrs(n)}
  }
  const obs=new MutationObserver(recs=>{
    for(const r of recs){if(r.type==='characterData')textNode(r.target);else if(r.type==='attributes')attrs(r.target);else for(const n of r.addedNodes)walk(n)}
    obs.takeRecords();
  });
  obs.observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:ATTRS});
  const full=()=>{walk(document.documentElement);obs.takeRecords()};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',full);else full();

  // okna dialogowe
  for(const f of ['alert','confirm']){const o=global[f];if(o)global[f]=function(msg){return o.call(this,tl(String(msg??'')))}}
  if(global.prompt){const o=global.prompt;global.prompt=function(msg,def){return o.call(this,tl(String(msg??'')),def)}}
  // napisy na canvasie (rzuty, etykiety w 3D)
  const C=global.CanvasRenderingContext2D?.prototype;
  if(C)for(const f of ['fillText','strokeText','measureText']){const o=C[f];C[f]=function(s,...a){return o.call(this,typeof s==='string'?t(s):s,...a)}}
})(window);
