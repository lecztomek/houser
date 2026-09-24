// Codzienność – widok: kafelki, karty scenariuszy, rzut z trasą, ustawienia (zapis tylko po zmianie przez użytkownika).
(function(){
'use strict';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fmt=(v,d=1)=>(Math.round(v*10**d)/10**d).toLocaleString('pl-PL',{minimumFractionDigits:0,maximumFractionDigits:d});
const VERD={ok:'dobrze',warn:'do poprawy',bad:'słabo',na:'nie dotyczy'};
const WEIGHTS=[[0.25,'marginalne'],[0.5,'mało ważne'],[1,'ważne'],[1.5,'bardzo ważne'],[2,'kluczowe']];
const LEGC=['#2563eb','#db2777','#059669','#7c3aed','#0891b2','#65a30d','#9f1239'];
const NOTE={brudne:'brudne',czyste:'czyste',suszenie:'suszenie','opał':'opał',drewno:'drewno',WC:'WC',talerze:'talerze','śmieci':'śmieci'};
let project=null,res=null,sel=null,settings={};
const narrow=()=>matchMedia('(max-width:1180px)').matches;

function readSettings(){const d=project?.dailySettings;settings={off:{...(d?.off||{})},w:{...(d?.w||{})}}}
let tS=null;
function saveSettings(){const s=JSON.parse(JSON.stringify(settings));project.dailySettings=s;clearTimeout(tS);
  tS=setTimeout(()=>HouserStore.update(p=>{p.dailySettings=s},'codziennosc'),250);render()}

function renderSettings(){
  const box=$('settings');
  box.innerHTML=HouserDaily.SCEN.map(d=>{const on=!settings.off[d.id],w=settings.w[d.id]!=null?+settings.w[d.id]:d.w;
    return '<div class="srow'+(on?'':' off')+'"><input type="checkbox" id="en_'+d.id+'" data-en="'+d.id+'"'+(on?' checked':'')+'><label for="en_'+d.id+'" title="'+esc(d.desc)+'">'+esc(d.name)+'</label>'+
      '<select data-w="'+d.id+'" title="Waga scenariusza w ocenie ogólnej">'+WEIGHTS.map(([v,l])=>'<option value="'+v+'"'+(Math.abs(v-w)<1e-6?' selected':'')+'>'+l+'</option>').join('')+'</select></div>'}).join('');
  box.querySelectorAll('[data-en]').forEach(el=>el.onchange=()=>{const id=el.dataset.en;if(el.checked)delete settings.off[id];else settings.off[id]=true;saveSettings()});
  box.querySelectorAll('[data-w]').forEach(el=>el.onchange=()=>{settings.w[el.dataset.w]=+el.value;saveSettings()});
}
$('resetSet').onclick=()=>{if(!project)return;settings={off:{},w:{}};saveSettings()};

function chipsFor(r){
  if(!r)return '<span class="chip priv">brak przejścia</span>';
  const M=res.model,out=[];
  for(const s of r.seq){
    if(s.kind==='room')out.push('<span class="chip'+(M.isPrivate(s.room)&&s!==r.start&&s!==r.end?' priv':'')+'" title="'+esc(M.floorName(s.room.fi))+'">'+esc(s.room.name)+'</span>');
    else if(s.kind==='out')out.push('<span class="chip out">Na zewnątrz</span>');
    else out.push('<span class="chip st">schody</span>');
  }
  return out.join('<span class="arr">›</span>');
}
function card(s,i){
  const v=s.applicable?s.verdict:'na',on=s.enabled&&s.weight>0;
  let h='<div class="sc '+v+(sel===s.id?' sel':'')+(on?'':' dis')+'" data-sc="'+s.id+'">';
  h+='<div class="hd"><div class="num c-'+v+'">'+(s.applicable?fmt(s.score):'–')+'</div><div style="min-width:0"><div class="t">'+esc(s.name)+'</div><div class="d">'+esc(s.desc)+'</div></div>'+
    '<div class="tags"><span class="pill '+v+'">'+VERD[v]+'</span>'+(on?'':'<span class="pill na">wyłączony</span>')+'</div></div>';
  if(!s.applicable){h+='<div class="reason">'+esc(s.reason||'')+'</div>'+(s.hints.length?'<div class="fixbox"><ul class="fix">'+s.hints.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul></div>':'')+'</div>';return h}
  h+='<div class="facts">'+(s.dist!=null?'<span><small>Trasa</small><b>'+fmt(s.dist)+' m</b></span>':'')+
    '<span><small>Zmiany piętra</small><b>'+s.floors+'</b></span>'+
    '<span><small>Strefa prywatna</small><b class="'+(s.private.length?'c-bad':'')+'">'+(s.private.length?'':'nie')+'</b>'+s.private.map(n=>'<span class="chip priv">'+esc(n)+'</span>').join(' ')+'</span></div>';
  h+='<div class="legs">'+s.legs.map((l,k)=>'<div class="leg"><span class="sw" style="background:'+LEGC[k%LEGC.length]+'"></span><div class="chips">'+chipsFor(l.r)+(l.note?'<span class="note">'+esc(NOTE[l.note]||l.note)+'</span>':'')+'</div><span class="dist">'+(l.r?fmt(l.r.dist)+' m':'–')+'</span></div>').join('')+'</div>';
  if(s.why.length)h+='<ul class="why">'+s.why.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>';
  if(s.hints.length&&s.verdict!=='ok'||s.hints.length&&s.score<9)h+='<div class="fixbox'+(s.verdict==='bad'?' b':'')+'"><h4>Co poprawić</h4><ul class="fix">'+s.hints.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul></div>';
  return h+'</div>';
}

function render(){
  const M_=$('main');
  if(!project||!(project.grid||project.definitionSnapshot?.grid)){M_.innerHTML='<div class="empty">Brak projektu. Narysuj rzut w <b>Układzie pomieszczeń</b> albo kliknij „Przykład” na pasku u góry.</div>';$('settings').innerHTML='';return}
  try{res=HouserDaily.evaluate(project,settings)}catch(e){console.error(e);res=null}
  if(!res||!res.model.list.length){M_.innerHTML='<div class="empty">Na rzucie nie ma jeszcze pomieszczeń. Narysuj je w <b>Układzie pomieszczeń</b>.</div>';renderSettings();return}
  renderSettings();
  const S=res.scenarios,app=S.filter(s=>s.applicable);
  if(!sel||!S.find(s=>s.id===sel&&s.applicable)){const cand=app.filter(s=>s.enabled).sort((a,b)=>a.score-b.score);sel=(cand[0]||app[0]||{}).id||null}
  const cnt={ok:0,warn:0,bad:0};for(const s of app)if(s.enabled&&s.weight>0)cnt[s.verdict]++;
  const ov=res.overall,ovv=ov==null?'na':res.verdict;
  let h='<div class="tiles"><div class="tile big"><div class="l">Ocena codzienności</div><div class="v c-'+ovv+'">'+(ov==null?'–':fmt(ov))+' <small>/ 10</small></div><div class="s"><span class="pill '+ovv+'">'+VERD[ovv]+'</span> <span>średnia ważona</span> · <span>scenariusze: '+res.count+'</span></div></div>'+
    [['ok','dobrze'],['warn','do poprawy'],['bad','słabo']].map(([k,l])=>'<div class="tile"><div class="l">'+l+'</div><div class="v c-'+k+'">'+cnt[k]+'</div></div>').join('')+'</div>';
  const notes=[];
  if(res.model.notes.includes('nostairs'))notes.push('Na piętrze są pomieszczenia, ale nie znaleziono schodów – trasy na piętro nie da się policzyć. Dodaj schody w module Schody.');
  if(!res.model.exits.length)notes.push('Na rzucie parteru nie ma drzwi zewnętrznych ani HST.');
  if(notes.length)h+=notes.map(n=>'<div class="warnbox">'+esc(n)+'</div>').join('');
  const order=S.slice().sort((a,b)=>(b.applicable-a.applicable)||((b.enabled&&b.weight>0)-(a.enabled&&a.weight>0))||(a.score??0)-(b.score??0));
  h+='<div class="cols"><div class="cards"><div class="hint">Od najsłabszego scenariusza. Kliknij kartę, żeby zobaczyć trasę na rzucie.</div>'+order.map(card).join('')+'</div><div class="planCard" id="planCard"></div></div>';
  M_.innerHTML=h;
  M_.querySelectorAll('[data-sc]').forEach(el=>el.onclick=()=>{const s=S.find(x=>x.id===el.dataset.sc);if(!s||!s.applicable)return;sel=s.id;
    M_.querySelectorAll('[data-sc]').forEach(e=>e.classList.toggle('sel',e.dataset.sc===sel));renderPlan();
    if(narrow()){const p=$('planCard');if(p)p.scrollIntoView({behavior:'smooth',block:'start'})}});
  renderPlan();
}

// ---------- rzut z trasą
function renderPlan(){
  const box=$('planCard');if(!box)return;const M=res.model,{W,H,N,c}=M,s=res.scenarios.find(x=>x.id===sel);
  const CS=20;
  // zasięg: siatka + tarasy + wyjścia
  let x0=0,y0=0,x1=W,y1=H;for(const k of M.terr){const [x,y]=k.split(',').map(Number);x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x+1);y1=Math.max(y1,y+1)}
  x0-=1;y0-=1;x1+=1;y1+=1;
  const legs=s?s.legs.filter(l=>l.r):[];
  const floorsShown=M.floors.map((f,fi)=>fi).filter(fi=>fi===0||M.list.some(r=>r.fi===fi)||M.holes[fi].size);
  let h='<h2>'+(s?esc(s.name):'Rzut')+'</h2><div class="sub">'+(s?esc(s.desc):'')+'</div><div class="floors">';
  for(const fi of floorsShown){
    const f=M.floors[fi],O=M.openings[fi],used=new Set();for(const l of legs)for(const d of l.r.doors)if(d.fi===fi)used.add(d.key);
    let g='';
    // tarasy (tylko parter)
    if(fi===0)for(const k of M.terr){const [x,y]=k.split(',').map(Number);g+='<rect x="'+x*CS+'" y="'+y*CS+'" width="'+CS+'" height="'+CS+'" fill="#fdecc8" stroke="#f5d9a0" stroke-width=".6"/>'}
    // kratki pomieszczeń i otworów w stropie
    for(let i=0;i<N;i++){const x=i%W,y=i/W|0,r=M.cellRoom[fi*N+i];
      if(r)g+='<rect x="'+x*CS+'" y="'+y*CS+'" width="'+(CS+.4)+'" height="'+(CS+.4)+'" fill="'+esc(r.color)+'" fill-opacity=".42"/>';
      else if(M.holes[fi].has(i))g+='<rect x="'+x*CS+'" y="'+y*CS+'" width="'+(CS+.4)+'" height="'+(CS+.4)+'" fill="url(#hatch'+fi+')"/>';}
    // ściany, drzwi, okna
    const zone=(x,y)=>{if(x<0||y<0||x>=W||y>=H)return null;const r=M.cellRoom[fi*N+y*W+x];if(r)return r.key;return M.holes[fi].has(y*W+x)?'#hole':null};
    let walls='',ops='';
    const edge=(ax,ay,bx,by,key,X1,Y1,X2,Y2)=>{const a=zone(ax,ay),b=zone(bx,by);if(a===b)return;const t=O[key],line=(col,w,extra)=>'<line x1="'+X1+'" y1="'+Y1+'" x2="'+X2+'" y2="'+Y2+'" stroke="'+col+'" stroke-width="'+w+'" stroke-linecap="butt"'+(extra||'')+'/>';
      if(a==='#hole'&&!b||b==='#hole'&&!a)return;
      if(a==='#hole'||b==='#hole'){walls+=line('#94a3b8',1,' stroke-dasharray="3 3"');return}
      if(t==='opening'){walls+=line('#94a3b8',.8,' stroke-dasharray="2 3"');if(used.has(key))ops+=line('#f97316',4,' stroke-opacity=".9"');return}
      walls+=line('#334155',2.4);
      if(t==='door')ops+=line('#ffffff',3)+line(used.has(key)?'#f97316':'#a16207',used.has(key)?5:2.2);
      else if(t==='hst')ops+=line('#ffffff',3)+line(used.has(key)?'#f97316':'#0ea5e9',used.has(key)?5:3);
      else if(t==='window')ops+=line('#bae6fd',3.2)+line('#0284c7',1);};
    for(let y=0;y<=H;y++)for(let x=0;x<W;x++)edge(x,y-1,x,y,'h:'+x+':'+y,x*CS,y*CS,(x+1)*CS,y*CS);
    for(let x=0;x<=W;x++)for(let y=0;y<H;y++)edge(x-1,y,x,y,'v:'+x+':'+y,x*CS,y*CS,x*CS,(y+1)*CS);
    g+=walls+ops;
    // komin
    if(fi===0)for(const k of M.project.structure?.chimney||[]){const x=k%W,y=k/W|0;g+='<rect x="'+(x*CS+3)+'" y="'+(y*CS+3)+'" width="'+(CS-6)+'" height="'+(CS-6)+'" fill="#475569" rx="2"><title>Komin</title></rect>'}
    // etykiety
    for(const r of M.list){if(r.fi!==fi||r.cells.length<6)continue;const fs=Math.max(9,Math.min(13,Math.sqrt(r.cells.length)*2.2));
      g+='<text x="'+(r.cx+.5)*CS+'" y="'+(r.cy+.5)*CS+'" text-anchor="middle" dominant-baseline="middle" font-size="'+fs.toFixed(1)+'" font-weight="650" fill="#1e293b" fill-opacity=".85" pointer-events="none" paint-order="stroke" stroke="#fff" stroke-width="3" stroke-opacity=".7">'+esc(r.name.length>18?r.name.slice(0,17)+'…':r.name)+'</text>'}
    // schody – miejsca przejścia między kondygnacjami
    for(const l of M.stairLinks)for(const n of [l.a,l.b]){if((n/N|0)!==fi)continue;const i=n%N;g+='<circle cx="'+((i%W)+.5)*CS+'" cy="'+((i/W|0)+.5)*CS+'" r="6" fill="#1e40af" fill-opacity=".85"><title>Schody</title></circle><text x="'+((i%W)+.5)*CS+'" y="'+((i/W|0)+.5)*CS+'" font-size="9" text-anchor="middle" dominant-baseline="central" fill="#fff" pointer-events="none">↕</text>'}
    // trasy
    let rt='';
    legs.forEach((l,k)=>{const col=LEGC[k%LEGC.length],pts=l.r.pts;let seg=[];const segs=[];
      for(let j=0;j<pts.length;j++){const p=pts[j];if(p.fi!==fi){if(seg.length)segs.push(seg);seg=[];continue}seg.push(p)}if(seg.length)segs.push(seg);
      const off=(k%3-1)*2.2; // lekkie przesunięcie, żeby nakładające się odcinki były widoczne
      for(const sg of segs){const q=simplify(sg);const d=q.map((p,j)=>(j?'L':'M')+(p.x*CS+off).toFixed(1)+' '+(p.y*CS+off).toFixed(1)).join(' ');
        rt+='<path d="'+d+'" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" stroke-opacity=".85"/>';
        rt+='<path d="'+d+'" fill="none" stroke="'+col+'" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>';
        const outs=[];for(let j=1;j<sg.length;j++)if(sg[j].out&&sg[j-1].out)outs.push(sg[j-1],sg[j]);
        for(let j=0;j+1<outs.length;j+=2)rt+='<line x1="'+(outs[j].x*CS+off)+'" y1="'+(outs[j].y*CS+off)+'" x2="'+(outs[j+1].x*CS+off)+'" y2="'+(outs[j+1].y*CS+off)+'" stroke="#fff" stroke-width="2" stroke-dasharray="4 4"/>'}
      const a=pts[0],b=pts[pts.length-1];
      if(a.fi===fi)rt+='<circle cx="'+(a.x*CS+off)+'" cy="'+(a.y*CS+off)+'" r="6.5" fill="'+col+'" stroke="#fff" stroke-width="2"/><text x="'+(a.x*CS+off)+'" y="'+(a.y*CS+off)+'" font-size="9" font-weight="800" fill="#fff" text-anchor="middle" dominant-baseline="central" pointer-events="none">'+(k+1)+'</text>';
      if(b.fi===fi)rt+='<circle cx="'+(b.x*CS+off)+'" cy="'+(b.y*CS+off)+'" r="6" fill="#fff" stroke="'+col+'" stroke-width="3"/>';
    });
    g+=rt;
    h+='<div class="floor"><h4>'+esc(M.floorName(fi))+'</h4><svg class="plan" viewBox="'+x0*CS+' '+y0*CS+' '+(x1-x0)*CS+' '+(y1-y0)*CS+'" role="img" aria-label="'+esc(M.floorName(fi))+'"><defs><pattern id="hatch'+fi+'" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#f1f5f9"/><line x1="0" y1="0" x2="0" y2="6" stroke="#cbd5e1" stroke-width="2"/></pattern></defs>'+g+'</svg></div>';
  }
  h+='</div>';
  if(legs.length)h+='<div class="legend">'+legs.map((l,k)=>'<span><i style="background:'+LEGC[k%LEGC.length]+'"></i><b>'+(k+1)+'.</b> <span>'+esc(l.from)+'</span> → <span>'+esc(l.to)+'</span></span>').join('')+'</div>';
  h+='<div class="legend"><span><i style="background:#f97316"></i><span>użyte drzwi i przejścia</span></span><span><i style="background:#fdecc8;height:10px"></i><span>taras</span></span><span><i style="background:#1e40af;height:10px;width:10px;border-radius:50%"></i><span>schody</span></span></div>';
  box.innerHTML=h;
}
function simplify(p){if(p.length<3)return p;const o=[p[0]];for(let i=1;i<p.length-1;i++){const a=o[o.length-1],b=p[i],c=p[i+1];if(Math.abs((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x))>1e-6||b.out!==c.out)o.push(b)}o.push(p[p.length-1]);return o}

// start
if(matchMedia('(max-width:900px)').matches)$('setBox').removeAttribute('open');
const rec=HouserStore.load();project=rec?rec.project:null;readSettings();render();
HouserStore.subscribe(r=>{project=r.project;readSettings();render()});
let tR=null;addEventListener('resize',()=>{clearTimeout(tR);tR=setTimeout(()=>{if(res)renderPlan()},200)});
})();
