// Wygląd domu z zewnątrz – ocena wg prostych reguł kompozycji elewacji (nie gustu):
// wyrównane okna, osie pionowe, symetria szczytów, ile różnych rozmiarów okien, puste ściany, proporcje dachu.
// HouserLooks.evaluate(project) -> {score, parts:[{k,name,score,text}], facades:[{side,fac,len,gable,wins,score,notes}], items:[{p,head,text,tip}], good:[]}
// Wymaga shared/quantities.js (i przez niego openings.js, house-model.js).
(function(global){
  const ORD=['north','east','south','west'],PL={north:'północna',east:'wschodnia',south:'południowa',west:'zachodnia'};
  const fmt=(v,d=0)=>(Math.round(v*10**d)/10**d).toLocaleString('pl-PL',{minimumFractionDigits:d,maximumFractionDigits:d});
  const clamp=v=>Math.max(0,Math.min(10,v)),avg=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:null;
  function sideMap(project){const top=project?.orientation?.top,i=Math.max(0,ORD.indexOf(top));return {top:ORD[i],right:ORD[(i+1)%4],bottom:ORD[(i+2)%4],left:ORD[(i+3)%4]}}
  function evaluate(project){
    const q=HouserQuantities.compute(project),G=q.G,c=q.c,sm=sideMap(project),items=[],good=[];
    const eaveSide=s=>q.across?(s==='left'||s==='right'):(s==='top'||s==='bottom');
    // otwory na elewacjach: t – położenie wzdłuż ściany [m], y0..y1 – wysokość od terenu [m]
    const F={};for(const s of ['top','right','bottom','left'])F[s]={side:s,fac:sm[s],len:(s==='top'||s==='bottom'?q.W:q.H)*c,gable:!eaveSide(s),wins:[]};
    for(const r of q.runs){if(!r.ext||r.info.shape==='roof')continue;const s=r.o==='h'?(r.ra?'bottom':'top'):(r.ra?'right':'left'),base=r.f===q.lo?0:G.groundHeight,sill=+r.info.sill||0,h=+r.info.height||1.2;
      F[s].wins.push({f:r.f,base:r.base,t0:r.from*c,t1:(r.to+1)*c,tc:(r.from+r.to+1)*c/2,w:r.w,y0:base+sill,y1:base+sill+h,top:sill+h,sloped:r.info.shape==='sloped',name:r.info.name})}
    const facades=Object.values(F).filter(f=>f.len>0).sort((a,b)=>ORD.indexOf(a.fac)-ORD.indexOf(b.fac));
    for(const f of facades){const notes=[],sc=[];const P=n=>'Elewacja '+PL[f.fac];
      const glass=f.wins.filter(w=>w.base!=='door');
      // 1) górne krawędzie okien na jednej linii (na każdej kondygnacji osobno)
      for(const fl of [q.lo,q.up]){const ws=glass.filter(w=>w.f===fl&&!w.sloped&&w.top>1.6);if(ws.length<2)continue;
        const tops=ws.map(w=>w.top),spread=Math.max(...tops)-Math.min(...tops);sc.push(clamp(10-spread*14));
        if(spread>.12){const mode=tops.slice().sort((a,b)=>tops.filter(v=>Math.abs(v-b)<.05).length-tops.filter(v=>Math.abs(v-a)<.05).length)[0],off=ws.filter(w=>Math.abs(w.top-mode)>.05);
          for(const w of off)w.offTop=true;
          notes.push({p:spread>.3?1.2:.6,head:P()+(fl===q.lo?' · parter':' · piętro'),text:'Górne krawędzie okien są na różnych wysokościach (różnica '+fmt(spread*100)+' cm).',tip:'Ustaw okna tak, żeby ich góra była na jednej linii ('+fmt(mode,2)+' m od podłogi) – zmień parapet albo wysokość w module Okna i drzwi.'})}}
      // 2) osie pionowe: okna piętra nad oknami parteru (pełne piętro albo szczyt)
      const upW=glass.filter(w=>w.f===q.up&&!w.sloped),loW=f.wins.filter(w=>w.f===q.lo);
      if(upW.length>=1&&loW.length>=1&&upW.length+loW.length>=2&&(f.gable||!q.attic)){const al=upW.filter(u=>loW.some(l=>Math.abs(l.tc-u.tc)<=.3)).length/upW.length;sc.push(clamp(4+6*al));
        for(const u of upW)if(!loW.some(l=>Math.abs(l.tc-u.tc)<=.3))u.offAxis=true;
        if(al<.5&&upW.length>=2)notes.push({p:.8,head:P(),text:'Okna piętra nie stoją nad oknami parteru ('+Math.round(al*100)+'% w osi).',tip:'Przesuń okna piętra (albo parteru) tak, żeby leżały w tych samych osiach pionowych – elewacja wygląda wtedy spokojniej.'})}
      // 3) symetria ściany szczytowej: prawie symetryczna = najbardziej razi
      if(f.gable&&glass.length>=1){const L=f.len,mir=glass.map(w=>{let best=1e9;for(const v of glass){const d=Math.abs((L-v.tc)-w.tc)+Math.abs(v.w-w.w)*.5;if(d<best)best=d}return best});
        const sym=mir.filter(d=>d<=.08).length/glass.length,near=mir.filter(d=>d>.08&&d<=.45).length/glass.length;
        if(sym>=.99){sc.push(10);good.push(P()+' – symetryczna względem kalenicy.')}
        else if(near>0&&sym+near>=.8){sc.push(6.5);const d=Math.max(...mir.filter(v=>v>.08&&v<=.45));notes.push({p:.9,head:P(),text:'Szczyt jest prawie symetryczny – okna są przesunięte o ok. '+fmt(d*100)+' cm względem osi kalenicy.',tip:'Wyrównaj okna symetrycznie albo zrób wyraźną asymetrię – „prawie” wygląda jak błąd.'})}}
      // 4) ile różnych rozmiarów okien na jednej ścianie
      const sizes=new Set(glass.filter(w=>!w.sloped).map(w=>Math.round(w.w/.25)+'x'+Math.round((w.y1-w.y0)/.1)));
      if(sizes.size>=2)sc.push(clamp(12-2*sizes.size));
      if(sizes.size>4)notes.push({p:.7,head:P(),text:sizes.size+' różnych rozmiarów okien na jednej ścianie.',tip:'Ogranicz się do 2–3 rozmiarów (np. jeden typ w pokojach, jeden mały w łazienkach) – elewacja będzie spójniejsza.'});
      // 5) pusta ściana / przeszklenia
      const wallH=f.gable?G.groundHeight+(q.net[q.up]>0?(q.attic?G.kneeWall+G.rise/2:G.upperHeight):0):(q.net[q.up]>0?G.groundHeight+(q.attic?G.kneeWall:G.upperHeight):G.groundHeight),wallA=f.len*wallH;
      const gA=f.wins.reduce((a,w)=>a+w.w*(w.y1-w.y0),0),ratio=wallA>0?gA/wallA:0;f.ratio=ratio;
      if(f.len>=6&&ratio<.04){sc.push(5);notes.push({p:1,head:P(),text:'Prawie pusta ściana ('+fmt(f.len,1)+' m, przeszklenie '+fmt(ratio*100)+'%).',tip:'Dodaj choć jedno okno albo urozmaić ścianę wykończeniem (drewno, cegła), pnączami lub pergolą.'})}
      else if(ratio>=.06&&ratio<=.35)sc.push(9);
      f.score=sc.length?avg(sc):null;f.notes=notes;items.push(...notes)}
    // dach i bryła
    const parts=[],pitch=G.roofPitch,hasUp=q.net[q.up]>0;let roofSc=9;
    if(G.rise>0){if(pitch<22){roofSc=6;items.push({p:.8,head:'Dach',text:'Bardzo płaski dach dwuspadowy ('+fmt(pitch)+'°) – bryła wygląda na przysadzistą.',tip:'Przy dachu dwuspadowym ładniej wygląda 30–45°, albo zrób dach prawie płaski i ukryty za attyką.'})}
      else if(pitch>50&&G.eaveOverhang>.2){roofSc=7;items.push({p:.5,head:'Dach',text:'Stromy dach ('+fmt(pitch)+'°) z okapem – bliżej stylu tradycyjnego niż nowoczesnej stodoły.',tip:'Przy stromym dachu w stylu stodoły zwykle rezygnuje się z okapów.'})}
      else if(pitch>=30&&pitch<=45)good.push('Kąt dachu '+fmt(pitch)+'° – klasyczne, przyjemne proporcje.')}
    parts.push({k:'roof',name:'Dach i bryła',score:roofSc});
    // okna dachowe: na jednej połaci na jednej wysokości
    const rw={};for(const r of q.runs){if(r.info.shape!=='roof')continue;const s=r.o==='h'?(r.ra?'bottom':'top'):(r.ra?'right':'left');(rw[s]=rw[s]||[]).push(+r.info.sill||0)}
    for(const [s,a] of Object.entries(rw)){if(a.length<2)continue;const sp=Math.max(...a)-Math.min(...a);if(sp>.15){items.push({p:.6,head:'Okna dachowe · połać '+PL[sm[s]],text:'Okna dachowe na różnych wysokościach połaci (różnica '+fmt(sp*100)+' cm).',tip:'Ustaw je w jednym rzędzie (ta sama odległość od okapu) w module Okna i drzwi.'});parts.push({k:'roofwin',name:'Okna dachowe',score:clamp(10-sp*8)})}}
    const fs=facades.filter(f=>f.score!=null);parts.unshift({k:'fac',name:'Elewacje',score:fs.length?avg(fs.map(f=>f.score)):null});
    const sv=parts.filter(p=>p.score!=null),score=sv.length?(sv[0].k==='fac'?(sv[0].score*2+sv.slice(1).reduce((a,p)=>a+p.score,0))/(sv.length+1):avg(sv.map(p=>p.score))):null;
    if(fs.length&&fs.every(f=>!f.notes.length))good.push('Okna na elewacjach są wyrównane i spójne.');
    return {score,parts,facades,items:items.sort((a,b)=>b.p-a.p),good,G,q,sm}}
  global.HouserLooks={evaluate,PL};
})(window);
