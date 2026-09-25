// Balkony na piętrze – wspólne dla modułów Balkony, Zewnątrz 3D, Energia, Nasłonecznienie, Wycena.
// project.balconies = [{id, cells:[[x,y],…], label, rail:'glass'|'bars', thermalBreak:true}]
// Kratka balkonu: poza obrysem piętra. Nad pomieszczeniem parteru = balkon / taras na stropie parteru („overGround”),
// poza obrysem domu = balkon wystający („cantilever”).
(function(global){
  const RAIL={glass:'szklana',bars:'stalowa (pręty)',wall:'murowana (pełna)'};
  const key=(x,y)=>x+','+y;
  function ctx(project){const g=project.grid||project.definitionSnapshot?.grid,[lo,up]=project.definitionSnapshot?.floorOrder||['ground','upper'];
    const st={};for(const f of [lo,up]){const s=project.state?.[f]||[];st[f]=Array.isArray(s[0])?s.flat():s}
    const def=f=>Object.fromEntries((project.definitionSnapshot?.floors?.[f]?.rooms||[]).map(r=>[r.id,r]));const D={[lo]:def(lo),[up]:def(up)};
    const id=(f,x,y)=>x<0||y<0||x>=g.width||y>=g.height?null:(st[f]?.[y*g.width+x]||null);
    const occ=(f,x,y)=>{const v=id(f,x,y);return !!v&&D[f][v]?.kind!=='exteriorVoid'&&!(f===up&&(v==='pustka'||v==='schody'))};
    return {g,lo,up,id,occ,hasUp:(project.definitionSnapshot?.floors?.[up]?.rooms||[]).length>0}}
  function list(project){return Array.isArray(project?.balconies)?project.balconies:[]}
  function map(project){const m=new Map();for(const b of list(project))for(const [x,y] of b.cells||[])m.set(key(x,y),b);return m}
  // czy w kratce można postawić balkon (poza obrysem piętra, w pobliżu domu)
  function paintable(project,x,y,margin){const C=ctx(project);if(x<-margin||y<-margin||x>=C.g.width+margin||y>=C.g.height+margin)return false;return !C.occ(C.up,x,y)}
  function kind(project,x,y){const C=ctx(project);return C.occ(C.lo,x,y)?'overGround':'cantilever'}
  // przebudowa listy po malowaniu: spójne grupy kratek = jeden balkon (ustawienia przechodzą ze starego balkonu)
  function fromCells(cellsSet,prev){const prevBy=new Map();for(const b of prev||[])for(const [x,y] of b.cells||[])prevBy.set(key(x,y),b);
    const left=new Set(cellsSet),out=[];
    for(const k0 of cellsSet){if(!left.has(k0))continue;const comp=[],stack=[k0];left.delete(k0);
      while(stack.length){const k=stack.pop(),[x,y]=k.split(',').map(Number);comp.push([x,y]);for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const n=key(x+dx,y+dy);if(left.has(n)){left.delete(n);stack.push(n)}}}
      const old=comp.map(([x,y])=>prevBy.get(key(x,y))).find(Boolean);
      out.push({id:old?.id||'b'+Date.now().toString(36)+Math.random().toString(36).slice(2,5),label:old?.label||'',rail:old?.rail||'glass',thermalBreak:old?.thermalBreak!==false,cells:comp.sort((a,b)=>a[1]-b[1]||a[0]-b[0])})}
    return out}
  // podsumowanie: powierzchnie, styk z domem (mostek cieplny), długość balustrady, dostęp z pokoju
  function stats(project){const C=ctx(project),c=C.g.cellMeters,m=map(project),ops=project.openings?.[C.up]||{},items=[];
    let area=0,cantA=0,overA=0,contact=0,contactBad=0,rail=0;
    for(const b of list(project)){const set=new Set((b.cells||[]).map(([x,y])=>key(x,y)));let a=0,ca=0,oa=0,con=0,rl=0,door=false,maxD=0;const rooms=new Set();
      for(const [x,y] of b.cells||[]){a+=c*c;if(C.occ(C.lo,x,y))oa+=c*c;else ca+=c*c;
        for(const [dx,dy,ek] of [[0,-1,'h:'+x+':'+y],[0,1,'h:'+x+':'+(y+1)],[-1,0,'v:'+x+':'+y],[1,0,'v:'+(x+1)+':'+y]]){const nx=x+dx,ny=y+dy;if(set.has(key(nx,ny)))continue;
          if(C.occ(C.up,nx,ny)){if(!C.occ(C.lo,x,y))con+=c;rooms.add(C.id(C.up,nx,ny));if(['door','hst'].includes(ops[ek]))door=true}else rl+=c}}
      // głębokość wysięgu: najdalsza kratka od ściany piętra (dla wystających)
      for(const [x,y] of b.cells||[]){if(C.occ(C.lo,x,y))continue;let d=1e9;for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){let n=1;while(n<20&&!C.occ(C.up,x+dx*n,y+dy*n)&&set.has(key(x+dx*n,y+dy*n)))n++;if(C.occ(C.up,x+dx*n,y+dy*n))d=Math.min(d,n)}if(d<1e9)maxD=Math.max(maxD,d*c)}
      area+=a;cantA+=ca;overA+=oa;contact+=con;rail+=rl;if(!b.thermalBreak)contactBad+=con;
      const roomNames=[...rooms].map(r=>project.definitionSnapshot?.floors?.[C.up]?.rooms?.find(q=>q.id===r)?.name||r);
      items.push({b,area:a,cantA:ca,overA:oa,contact:con,rail:rl,door,rooms:roomNames,depth:maxD,kind:ca>=oa?'cantilever':'overGround'})}
    return {items,area,cantA,overA,contact,contactBad,rail,psi:contact>0?(contactBad*.5+(contact-contactBad)*.15):0}}
  global.HouserBalcony={RAIL,key,list,map,paintable,kind,fromCells,stats};
})(window);
