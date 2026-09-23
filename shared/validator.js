// Sprawdzanie warunków układu – wspólne dla modułów Warunki i Układ pomieszczeń.
// Funkcje przeniesione 1:1 z modułu Układ pomieszczeń; tutaj działają na podanym projekcie.
// HouserValidator.create(project) -> {evaluate(c) -> {ok, detail}, results() -> [...]}
(function(global){
  function create(project){
    const definition=project.definitionSnapshot, g=project.grid||definition.grid;
    const W=g.width, H=g.height, CELL_M=Number(g.cellMeters), CELL_M2=CELL_M*CELL_M;
    const DIRS=['north','east','south','west'];
    const flo=Array.isArray(definition.floorOrder)&&definition.floorOrder.length?definition.floorOrder:Object.keys(definition.floors||{});
    const state={};for(const f of flo){const s=project.state?.[f];state[f]=Array.isArray(s)?(Array.isArray(s[0])?s.flat():s.slice()):Array(W*H).fill(null);}
    const openings={};for(const f of flo)openings[f]={...(project.openings?.[f]||{})};
    const chimney=new Set((project.structure?.chimney||project.chimney||[]).map(Number));
    const orientation={top:project.orientation?.top||'north'};
    let floor=flo[0];
    function floors(){return flo;}
    function adjacent(f,a,b){const arr=state[f];for(let i=0;i<arr.length;i++)if(arr[i]===a)for(const j of neighbors(i))if(arr[j]===b)return true;return false;}
    function allEdgeKeys(){const a=[];for(let x=0;x<=W;x++)for(let y=0;y<H;y++)a.push(edgeKey('v',x,y));for(let y=0;y<=H;y++)for(let x=0;x<W;x++)a.push(edgeKey('h',x,y));return a;}
    function allPainted(f){return state[f].every(Boolean);}
    function canPlaceType(f,k,typeId){const t=openingTypeDef(typeId),info=edgeInfo(f,k);if(!t||info.kind==='invalid')return false;if(typeId==='opening'&&info.kind==='exterior')return true;if(t.placement==='interior')return info.kind==='interior';if(t.placement==='exterior')return info.kind==='exterior';return info.kind==='interior'||info.kind==='exterior';}
    function cardinalMap(){const ti=DIRS.indexOf(orientation.top);return{top:DIRS[ti],right:DIRS[(ti+1)%4],bottom:DIRS[(ti+2)%4],left:DIRS[(ti+3)%4]};}
    function conditionDetail(c){if(c.type==='minArea')return'aktualnie '+roomArea(c.floor,c.room).toFixed(2)+' m² / wymagane '+Number(c.value).toFixed(2);if(c.type==='maxArea')return'aktualnie '+roomArea(c.floor,c.room).toFixed(2)+' m² / max '+Number(c.value).toFixed(2);if(c.type==='sharedEdgeMin')return'wspólny prosty odcinek '+sharedEdgeLength(c.floor,c.a,c.b).toFixed(2)+' m / min '+Number(c.meters).toFixed(2);if(c.type==='minRoomWidth')return'najwęższe miejsce '+roomMinWidth(c.floor,c.room).toFixed(2)+' m / min '+Number(c.meters).toFixed(2);if(c.type==='edgeLengthMin')return'ciągła ściana '+edgeLength(c.floor,c.room,c.edge).toFixed(2)+' m / min '+Number(c.meters).toFixed(2);if(c.type==='overlapMin')return'pokrycie '+(overlapRatio(c.upperFloor,c.upperRoom,c.lowerFloor,c.lowerRooms)*100).toFixed(0)+'% / min '+(Number(c.ratio)*100).toFixed(0)+'%';if(c.type==='validOpenings')return'nieprawidłowe segmenty: '+invalidOpeningCount(c.floor);if(c.type==='openingBetween')return'aktualny ciąg '+openingBetweenLength(c.floor,c.a,c.b,c.types).toFixed(2)+' m / min '+Number(c.meters).toFixed(2)+' m';if(c.type==='exteriorOpening')return'aktualny ciąg '+exteriorOpeningLength(c.floor,c.room,c.types,c.edge||'any').toFixed(2)+' m / min '+Number(c.meters).toFixed(2)+' m';if(c.type==='reachableRooms'){const seen=reachableRooms(c.floor,c.startRoom,c.types),miss=c.rooms.filter(r=>!seen.has(r));return miss.length?'brak dojścia do: '+miss.map(r=>roomName(r,c.floor)).join(', '):'wszystkie wskazane pomieszczenia osiągalne';}return'';}
    function edgeInfo(f,k){const e=parseEdgeKey(k);if(!e)return{kind:'invalid',rooms:[]};let a=null,b=null,outA=false,outB=false,screenSide=null;
      if(e.o==='v'){if(e.x===0){outA=true;screenSide='left';}else a=state[f][idx(e.x-1,e.y)];if(e.x===W){outB=true;screenSide='right';}else b=state[f][idx(e.x,e.y)];}
      else{if(e.y===0){outA=true;screenSide='top';}else a=state[f][idx(e.x,e.y-1)];if(e.y===H){outB=true;screenSide='bottom';}else b=state[f][idx(e.x,e.y)];}
      if(outA!==outB){const room=outA?b:a;if(!room||isExteriorVoid(f,room))return{kind:'invalid',rooms:[]};return{kind:'exterior',rooms:[room],room,screenSide,side:cardinalMap()[screenSide],viaNiche:false};}
      if(!outA&&!outB&&a&&b&&a!==b){const av=isExteriorVoid(f,a),bv=isExteriorVoid(f,b);if(av!==bv){const room=av?b:a;if(e.o==='v')screenSide=av?'left':'right';else screenSide=av?'top':'bottom';return{kind:'exterior',rooms:[room],room,screenSide,side:cardinalMap()[screenSide],viaNiche:true,niche:av?a:b};}if(!av&&!bv)return{kind:'interior',rooms:[a,b]};}
      return{kind:'invalid',rooms:[a,b].filter(Boolean)};
    }
    function edgeKey(o,x,y){return o+':'+x+':'+y;}
    function edgeLength(f,id,edge){if(edge==='any')return Math.max(0,...DIRS.map(d=>exteriorWallLength(f,id,d)));return exteriorWallLength(f,id,edge);}
    function edgeMatchesExterior(f,k,room,edge){const info=edgeInfo(f,k);return info.kind==='exterior'&&info.room===room&&(edge==='any'||info.side===edge);}
    function edgeMatchesRooms(f,k,a,b){const info=edgeInfo(f,k);return info.kind==='interior'&&((info.rooms[0]===a&&info.rooms[1]===b)||(info.rooms[0]===b&&info.rooms[1]===a));}
    function evalCondition(c){switch(c.type){case'minArea':return roomArea(c.floor,c.room)>=Number(c.value);case'maxArea':return roomArea(c.floor,c.room)<=Number(c.value);case'fullPainted':return allPainted(c.floor);case'contiguousAll':return interiorRooms(c.floor).every(r=>isContiguous(c.floor,r.id));case'adjacent':return adjacent(c.floor,c.a,c.b);case'sharedEdgeMin':return sharedEdgeLength(c.floor,c.a,c.b)+1e-9>=Number(c.meters);case'minRoomWidth':return roomMinWidth(c.floor,c.room)+1e-9>=Number(c.meters);case'edgeLengthMin':return edgeLength(c.floor,c.room,c.edge)+1e-9>=Number(c.meters);case'notAdjacent':return!adjacent(c.floor,c.a,c.b);case'edge':return touchesEdge(c.floor,c.room,c.edge);case'exactOverlay':return exactSameCells(c.upperFloor,c.upperRoom,c.lowerFloor,c.lowerRoom);case'overlapMin':return overlapRatio(c.upperFloor,c.upperRoom,c.lowerFloor,c.lowerRooms)>=Number(c.ratio);case'validOpenings':return invalidOpeningCount(c.floor)===0;case'openingBetween':return openingBetweenLength(c.floor,c.a,c.b,c.types)+1e-9>=Number(c.meters);case'exteriorOpening':return exteriorOpeningLength(c.floor,c.room,c.types,c.edge||'any')+1e-9>=Number(c.meters);case'reachableRooms':{const seen=reachableRooms(c.floor,c.startRoom,c.types);return c.rooms.every(r=>seen.has(r));}default:return false;}}
    function exactSameCells(uf,ur,lf,lr){let count=0;for(let i=0;i<W*H;i++){const u=state[uf][i]===ur,l=state[lf][i]===lr;if(u!==l)return false;if(u)count++;}return count>0;}
    function exteriorOpeningLength(f,room,types,edge){return longestOpeningRun(f,k=>edgeMatchesExterior(f,k,room,edge||'any'),types);}
    function exteriorWallLength(f,id,cardinal){const groups=new Map();for(const k of allEdgeKeys()){const info=edgeInfo(f,k);if(info.kind!=='exterior'||info.room!==id||info.side!==cardinal)continue;const e=parseEdgeKey(k),g=e.o==='v'?'v:'+e.x:'h:'+e.y,v=e.o==='v'?e.y:e.x;if(!groups.has(g))groups.set(g,[]);groups.get(g).push(v);}let best=0;for(const vals of groups.values())best=Math.max(best,longestConsecutive(vals));return best*CELL_M;}
    function floorDef(f=floor){return definition.floors[f];}
    function idx(x,y){return y*W+x;}
    function interiorRooms(f=floor){return rooms(f).filter(r=>(r.kind||'room')!=='exteriorVoid');}
    function invalidOpeningCount(f){let n=0;for(const[k,t]of Object.entries(openings[f]||{}))if(!canPlaceType(f,k,t))n++;return n;}
    function isContiguous(f,id){const arr=state[f],cs=[];for(let i=0;i<arr.length;i++)if(arr[i]===id)cs.push(i);if(cs.length<=1)return true;const want=new Set(cs),seen=new Set([cs[0]]),q=[cs[0]];while(q.length){const cur=q.shift();for(const n of neighbors(cur))if(want.has(n)&&!seen.has(n)){seen.add(n);q.push(n);}}return seen.size===cs.length;}
    function isExteriorVoid(f,id){return !!id&&roomKind(id,f)==='exteriorVoid';}
    function longestConsecutive(values){const a=[...new Set(values)].sort((x,y)=>x-y);let best=0,cur=0,prev=null;for(const v of a){if(prev!==null&&v===prev+1)cur++;else cur=1;if(cur>best)best=cur;prev=v;}return best;}
    function longestOpeningRun(f,predicate,types){const groups=new Map();for(const[k,t]of Object.entries(openings[f]||{})){if(!types.includes(t)||!predicate(k)||!canPlaceType(f,k,t))continue;const e=parseEdgeKey(k),g=e.o==='v'?'v:'+e.x:'h:'+e.y,v=e.o==='v'?e.y:e.x;if(!groups.has(g))groups.set(g,[]);groups.get(g).push(v);}let best=0;for(const vals of groups.values())best=Math.max(best,longestConsecutive(vals));return best*CELL_M;}
    function neighbors(i){const[x,y]=xy(i),o=[];if(x>0)o.push(idx(x-1,y));if(x<W-1)o.push(idx(x+1,y));if(y>0)o.push(idx(x,y-1));if(y<H-1)o.push(idx(x,y+1));return o;}
    function openingBetweenLength(f,a,b,types){return longestOpeningRun(f,k=>edgeMatchesRooms(f,k,a,b),types);}
    function openingTypeDef(id){return openingTypes().find(t=>t.id===id)||null;}
    function openingTypes(){return definition.openingTypes||[];}
    function overlapRatio(uf,ur,lf,lrs){let total=0,ok=0;for(let i=0;i<W*H;i++)if(state[uf][i]===ur){total++;if(lrs.includes(state[lf][i]))ok++;}return total?ok/total:0;}
    function parseEdgeKey(k){const m=/^([vh]):(\d+):(\d+)$/.exec(k);return m?{o:m[1],x:Number(m[2]),y:Number(m[3])}:null;}
    function reachableRooms(f,start,types){const graph={};for(const r of interiorRooms(f))graph[r.id]=new Set();for(const[k,t]of Object.entries(openings[f]||{})){if(!types.includes(t)||!canPlaceType(f,k,t))continue;const info=edgeInfo(f,k);if(info.kind==='interior'){const[a,b]=info.rooms;graph[a]?.add(b);graph[b]?.add(a);}}const seen=new Set([start]),q=[start];while(q.length){const cur=q.shift();for(const n of graph[cur]||[])if(!seen.has(n)){seen.add(n);q.push(n);}}return seen;}
    function roomArea(f,id){let n=0;for(let i=0;i<state[f].length;i++)if(state[f][i]===id&&!chimney.has(i))n++;return n*CELL_M2;}
    function roomDef(id,f=floor){return definition.floors[f]?.rooms.find(r=>r.id===id)||null;}
    function roomKind(id,f=floor){return roomDef(id,f)?.kind||'room';}
    function roomMinWidth(f,id){const arr=state[f],positions=[];for(let i=0;i<arr.length;i++)if(arr[i]===id)positions.push(i);if(!positions.length)return 0;let best=Infinity;for(const i of positions){const[x,y]=xy(i);let left=x,right=x,top=y,bottom=y;while(left>0&&arr[idx(left-1,y)]===id)left--;while(right<W-1&&arr[idx(right+1,y)]===id)right++;while(top>0&&arr[idx(x,top-1)]===id)top--;while(bottom<H-1&&arr[idx(x,bottom+1)]===id)bottom++;best=Math.min(best,Math.min(right-left+1,bottom-top+1));}return best*CELL_M;}
    function roomName(id,f=floor){return roomDef(id,f)?.name||id;}
    function rooms(f=floor){return floorDef(f).rooms;}
    function sharedEdgeLength(f,a,b){const arr=state[f],vertical=new Map(),horizontal=new Map(),add=(m,k,v)=>{if(!m.has(k))m.set(k,[]);m.get(k).push(v);};for(let y=0;y<H;y++)for(let x=0;x<W;x++){if(x<W-1){const l=arr[idx(x,y)],r=arr[idx(x+1,y)];if((l===a&&r===b)||(l===b&&r===a))add(vertical,x+1,y);}if(y<H-1){const t=arr[idx(x,y)],d=arr[idx(x,y+1)];if((t===a&&d===b)||(t===b&&d===a))add(horizontal,y+1,x);}}let best=0;for(const vals of vertical.values())best=Math.max(best,longestConsecutive(vals));for(const vals of horizontal.values())best=Math.max(best,longestConsecutive(vals));return best*CELL_M;}
    function touchesEdge(f,id,edge){const wanted=edge==='any'?null:edge;for(const k of allEdgeKeys()){const info=edgeInfo(f,k);if(info.kind==='exterior'&&info.room===id&&(!wanted||info.side===wanted))return true;}return false;}
    function xy(i){return[i%W,Math.floor(i/W)];}
    return {
      evaluate(c){let ok=false,detail='';try{ok=!!evalCondition(c);}catch(e){ok=false;detail='błąd: '+e.message;}try{detail=detail||conditionDetail(c)||'';}catch(_){}return {ok,detail};},
      results(){return (definition.conditions||[]).map(c=>c.enabled===false?null:this.evaluate(c));}
    };
  }
  global.HouserValidator={create};
})(window);
