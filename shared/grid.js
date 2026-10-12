// Zagęszczenie siatki projektu (np. 0,5 m -> 0,25 m): każda kratka dzieli się na k × k mniejszych.
// Przeliczane są wszystkie dane zapisane w kratkach: rzut, otwory (z wariantami), komin, schody, balkony, tarasy,
// belki / słupy / rodzaje ścian (Konstrukcja), urządzenia grzewcze, piwnica. Dane w metrach (meble, lampy,
// kanały, działka, punkty widoku) zostają bez zmian. Dom po zagęszczeniu ma te same wymiary i te same wyniki.
// HouserGrid.refine(project, k=2) -> nowy projekt; HouserGrid.canRefine(project, k) -> bool
(function(global){
  const MIN=.2;
  function canRefine(project,k){const g=project?.grid||project?.definitionSnapshot?.grid;return !!g&&Number.isInteger(k)&&k>=2&&(+g.cellMeters)/k>=MIN-1e-9}
  function refine(project,k){k=k||2;if(!canRefine(project,k))throw new Error('Siatki nie da się bardziej zagęścić.');
    const p=JSON.parse(JSON.stringify(project)),g=p.grid||p.definitionSnapshot.grid,W=g.width,H=g.height,W2=W*k,H2=H*k;
    const cells=([x,y])=>{const r=[];for(let a=0;a<k;a++)for(let b=0;b<k;b++)r.push([x*k+a,y*k+b]);return r};
    // krawędź 'v:x:y' / 'h:x:y' -> k krawędzi
    const edge=key=>{const m=/^([vh]):(-?\d+):(-?\d+)$/.exec(key);if(!m)return [key];const a=+m[2],b=+m[3],o=[];for(let i=0;i<k;i++)o.push(m[1]==='v'?'v:'+a*k+':'+(b*k+i):'h:'+(a*k+i)+':'+b*k);return o};
    for(const f of Object.keys(p.state||{})){const st=p.state[f]||[],fl=Array.isArray(st[0])?st.flat():st,n=new Array(W2*H2).fill(null);
      for(let y=0;y<H2;y++)for(let x=0;x<W2;x++)n[y*W2+x]=fl[Math.floor(y/k)*W+Math.floor(x/k)]??null;p.state[f]=n}
    for(const f of Object.keys(p.openings||{})){const o=p.openings[f]||{},v=p.openingVariants?.[f]||{},n={},nv={};
      for(const [key,t] of Object.entries(o))for(const e of edge(key)){n[e]=t;if(v[key])nv[e]=JSON.parse(JSON.stringify(v[key]))}
      p.openings[f]=n;if(p.openingVariants)p.openingVariants[f]=nv}
    const S=p.structure;if(S){if(Array.isArray(S.chimney))S.chimney=S.chimney.flatMap(i=>{const x=i%W,y=Math.floor(i/W);return cells([x,y]).map(([a,b])=>b*W2+a)});
      if(Array.isArray(S.beams))S.beams=S.beams.map(b=>({...b,line:+b.line*k,from:+b.from*k,to:+b.to*k+k-1}));
      if(Array.isArray(S.columns))S.columns=S.columns.map(c=>({...c,x:+c.x*k,y:+c.y*k}));
      if(S.wallKind&&typeof S.wallKind==='object'){const n={};for(const [key,v] of Object.entries(S.wallKind)){const pre=key.includes('|')?key.slice(0,key.indexOf('|')+1):'',e=key.includes('|')?key.slice(key.indexOf('|')+1):key;for(const x of edge(e))n[pre+x]=v}S.wallKind=n}}
    for(const s of p.stairs||[]){s.x=+s.x*k;s.y=+s.y*k;if(s._cells)s._cells={lower:(s._cells.lower||[]).flatMap(cells),upper:(s._cells.upper||[]).flatMap(cells)}}
    for(const b of p.balconies||[])if(Array.isArray(b.cells))b.cells=b.cells.flatMap(cells);
    for(const o of p.outdoorStructures||[])if(Array.isArray(o.cells))o.cells=o.cells.flatMap(cells);
    const dv=p.heatingSystem?.devices;if(dv)for(const d of Object.values(dv))if(d&&Number.isFinite(+d.x)){d.x=(+d.x)*k+Math.floor(k/2);d.y=(+d.y)*k+Math.floor(k/2)}
    const bc=p.foundation?.basement?.cells;if(Array.isArray(bc))p.foundation.basement.cells=bc.flatMap(key=>{const [x,y]=key.split(',').map(Number);return cells([x,y]).map(c=>c.join(','))});
    if(p.outline?.edges)p.outline.edges=p.outline.edges.flatMap(edge);
    const ng={...g,width:W2,height:H2,cellMeters:Math.round(g.cellMeters/k*1e6)/1e6};p.grid=ng;if(p.definitionSnapshot)p.definitionSnapshot.grid={...ng};
    return p}
  global.HouserGrid={refine,canRefine,MIN};
})(typeof window!=='undefined'?window:globalThis);
