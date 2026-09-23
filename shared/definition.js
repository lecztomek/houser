// Wspólna obsługa definicji domu (pomieszczenia + warunki) dla modułów Pomieszczenia, Warunki i Układ pomieszczeń.
// Definicja siedzi w projekcie jako project.definitionSnapshot:
//   {version, name, grid:{width,height,cellMeters}, floorOrder:[...], floors:{id:{name,subtitle,rooms:[{id,name,color,kind}]}},
//    conditions:[...], validationLevels:{...}, openingTypes:[...]}
(function(global){
  const CONDITION_TYPE_NAMES={minArea:'Min. powierzchnia',maxArea:'Maks. powierzchnia',fullPainted:'Cały obrys wypełniony',contiguousAll:'Spójność pomieszczeń',adjacent:'Pomieszczenia sąsiadują',notAdjacent:'Pomieszczenia nie sąsiadują',edge:'Pomieszczenie przy elewacji',exactOverlay:'Dokładne pokrycie pionowe',overlapMin:'Min. pokrycie pionowe',sharedEdgeMin:'Min. wspólna ściana',minRoomWidth:'Min. szerokość pomieszczenia',edgeLengthMin:'Min. długość na elewacji',validOpenings:'Poprawność otworów',openingBetween:'Min. otwór między pokojami',exteriorOpening:'Min. otwór zewnętrzny',reachableRooms:'Dostępność przez otwory'};
  const SEVERITY={hard:'Twardy',medium:'Ważny',soft:'Miękki'};
  const DIR_PL={north:'północ',east:'wschód',south:'południe',west:'zachód',any:'dowolna'};
  const DEFAULT_OPENING_TYPES=[{id:'door',name:'Drzwi',color:'#111827',placement:'anyWall'},{id:'opening',name:'Przejście otwarte',color:'#16a34a',placement:'anyWall'},{id:'window',name:'Okno',color:'#2563eb',placement:'exterior'},{id:'hst',name:'HST / drzwi tarasowe',color:'#0891b2',placement:'exterior'}];
  const DEFAULT_LEVELS={hard:{name:'Twardy',description:'Warunek funkcjonalny/geometryczny.'},medium:{name:'Ważny',description:'Istotne założenie.'},soft:{name:'Miękki',description:'Cel/optymalizacja.'}};

  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const floors=d=>Array.isArray(d?.floorOrder)&&d.floorOrder.length?d.floorOrder:Object.keys(d?.floors||{});
  const floorDef=(d,f)=>d?.floors?.[f]||{name:f,rooms:[]};
  const rooms=(d,f)=>floorDef(d,f).rooms||[];
  const openingTypes=d=>Array.isArray(d?.openingTypes)&&d.openingTypes.length?d.openingTypes:DEFAULT_OPENING_TYPES;
  const roomName=(d,f,id)=>rooms(d,f).find(r=>r.id===id)?.name||id||'?';

  // Nowa, pusta definicja (gdy ktoś zaczyna od zera)
  function emptyDefinition(){
    return {version:7,name:'Nowy dom',grid:{width:18,height:18,cellMeters:.5},floorOrder:['ground','upper'],
      floors:{ground:{name:'Parter',rooms:[{id:'salon',name:'Salon',color:'#fb7185',kind:'room'}]},upper:{name:'Piętro / poddasze',rooms:[{id:'sypialnia',name:'Sypialnia',color:'#60a5fa',kind:'room'}]}},
      conditions:[],validationLevels:DEFAULT_LEVELS,openingTypes:DEFAULT_OPENING_TYPES};
  }
  function isDefinition(o){return !!(o&&o.floors&&o.grid&&!o.state&&!o.definitionSnapshot)}
  // Projekt (format eksportu) zbudowany z samej definicji – rzut pusty
  function projectFromDefinition(def){
    const g=def.grid,state={},openings={},furniture={};
    for(const f of floors(def)){state[f]=Array(g.width*g.height).fill(null);openings[f]={};furniture[f]=[];}
    return {version:7,definitionName:def.name||null,definitionSnapshot:JSON.parse(JSON.stringify(def)),grid:{...g},savedAt:new Date().toISOString(),
      state,openings,orientation:{top:'north'},structure:{chimney:[]},furniture,outdoorStructures:[]};
  }

  function slugRoomId(d,f,name){
    let base=String(name||'pomieszczenie').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/ł/g,'l').replace(/Ł/g,'l').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'')||'pomieszczenie';
    let id=base,i=2;while(rooms(d,f).some(r=>r.id===id))id=base+'_'+(i++);return id;
  }

  function normalizeCondition(c,d){
    c={...c};const fl=floors(d),first=fl[0],second=fl[1]||first,types=openingTypes(d).map(t=>t.id),cellM=+d?.grid?.cellMeters||.5;
    const validFloor=v=>fl.includes(v)?v:first,validRoom=(f,v)=>rooms(d,f).some(r=>r.id===v)?v:rooms(d,f)[0]?.id;
    c.type=CONDITION_TYPE_NAMES[c.type]?c.type:'minArea';c.severity=SEVERITY[c.severity]?c.severity:'medium';c.enabled=c.enabled!==false;c.group=String(c.group||'Warunki');c.label=String(c.label||'');
    const edge=DIR_PL[c.edge]?c.edge:'any';
    if(['minArea','maxArea','minRoomWidth','edge','edgeLengthMin','exteriorOpening'].includes(c.type)){c.floor=validFloor(c.floor||first);c.room=validRoom(c.floor,c.room);}
    if(['fullPainted','contiguousAll','validOpenings'].includes(c.type))c.floor=validFloor(c.floor||first);
    if(['adjacent','notAdjacent','sharedEdgeMin','openingBetween'].includes(c.type)){c.floor=validFloor(c.floor||first);c.a=validRoom(c.floor,c.a);c.b=validRoom(c.floor,c.b&&c.b!==c.a?c.b:rooms(d,c.floor).find(r=>r.id!==c.a)?.id);}
    if(c.type==='minArea'||c.type==='maxArea')c.value=Math.max(0,Number(c.value)||0);
    if(['minRoomWidth','edgeLengthMin','sharedEdgeMin','openingBetween','exteriorOpening'].includes(c.type))c.meters=Math.max(cellM,Number(c.meters)||cellM);
    if(c.type==='edge'||c.type==='edgeLengthMin'||c.type==='exteriorOpening')c.edge=edge;
    if(c.type==='exactOverlay'){c.upperFloor=validFloor(c.upperFloor||second);c.lowerFloor=validFloor(c.lowerFloor||first);c.upperRoom=validRoom(c.upperFloor,c.upperRoom);c.lowerRoom=validRoom(c.lowerFloor,c.lowerRoom);}
    if(c.type==='overlapMin'){c.upperFloor=validFloor(c.upperFloor||second);c.lowerFloor=validFloor(c.lowerFloor||first);c.upperRoom=validRoom(c.upperFloor,c.upperRoom);c.lowerRooms=(Array.isArray(c.lowerRooms)?c.lowerRooms:[]).filter(r=>rooms(d,c.lowerFloor).some(x=>x.id===r));if(!c.lowerRooms.length&&rooms(d,c.lowerFloor)[0])c.lowerRooms=[rooms(d,c.lowerFloor)[0].id];c.ratio=clamp(Number(c.ratio)||.5,0,1);}
    if(c.type==='openingBetween'||c.type==='exteriorOpening'){c.types=(Array.isArray(c.types)?c.types:[]).filter(t=>types.includes(t));if(!c.types.length)c.types=[types[0]];}
    if(c.type==='reachableRooms'){c.floor=validFloor(c.floor||first);c.startRoom=validRoom(c.floor,c.startRoom);c.rooms=(Array.isArray(c.rooms)?c.rooms:[]).filter(r=>rooms(d,c.floor).some(x=>x.id===r));if(!c.rooms.length)c.rooms=rooms(d,c.floor).map(r=>r.id);c.types=(Array.isArray(c.types)?c.types:[]).filter(t=>types.includes(t));if(!c.types.length)c.types=[types[0]];}
    return c;
  }
  function defaultCondition(type,d){return normalizeCondition({type,severity:'medium',enabled:true,group:'Nowe warunki',label:''},d);}

  function conditionLabel(c,d){
    if(c.label)return c.label;const rn=(id,f)=>roomName(d,f||c.floor,id),fn=f=>floorDef(d,f).name||f;
    switch(c.type){
      case 'minArea':return rn(c.room)+' ≥ '+c.value+' m²';
      case 'maxArea':return rn(c.room)+' ≤ '+c.value+' m²';
      case 'fullPainted':return fn(c.floor)+': brak pustych kratek';
      case 'contiguousAll':return fn(c.floor)+': pomieszczenia spójne';
      case 'adjacent':return rn(c.a)+' ↔ '+rn(c.b);
      case 'notAdjacent':return rn(c.a)+' nie styka się z '+rn(c.b);
      case 'sharedEdgeMin':return rn(c.a)+' ↔ '+rn(c.b)+': ściana ≥ '+c.meters+' m';
      case 'minRoomWidth':return rn(c.room)+': szerokość ≥ '+c.meters+' m';
      case 'edge':return rn(c.room)+' dochodzi do elewacji ('+DIR_PL[c.edge]+')';
      case 'edgeLengthMin':return rn(c.room)+': elewacja '+DIR_PL[c.edge]+' ≥ '+c.meters+' m';
      case 'exactOverlay':return rn(c.upperRoom,c.upperFloor)+' dokładnie nad '+rn(c.lowerRoom,c.lowerFloor);
      case 'overlapMin':return rn(c.upperRoom,c.upperFloor)+': pokrycie ≥ '+Math.round((c.ratio||0)*100)+'%';
      case 'validOpenings':return fn(c.floor)+': otwory poprawne';
      case 'openingBetween':return rn(c.a)+' ↔ '+rn(c.b)+': otwór ≥ '+c.meters+' m';
      case 'exteriorOpening':return rn(c.room)+': otwór '+(c.edge==='any'?'zewnętrzny':DIR_PL[c.edge])+' ≥ '+c.meters+' m';
      case 'reachableRooms':return fn(c.floor)+': dojście od '+rn(c.startRoom);
    }
    return c.type;
  }
  // czy warunek dotyczy pomieszczenia (f,id)?
  function conditionUsesRoom(c,f,id){
    if(c.floor===f&&(['room','a','b','startRoom'].some(k=>c[k]===id)||(Array.isArray(c.rooms)&&c.rooms.includes(id))))return true;
    if(c.upperFloor===f&&c.upperRoom===id)return true;
    if(c.lowerFloor===f&&(c.lowerRoom===id||(Array.isArray(c.lowerRooms)&&c.lowerRooms.includes(id))))return true;
    return false;
  }
  // cele powierzchni pomieszczenia zapisane w warunkach (min / max)
  function areaTargets(d,f,id){
    const out=[];for(const c of d?.conditions||[]){if(c.enabled===false||c.floor!==f||c.room!==id)continue;if(c.type==='minArea')out.push({kind:'min',value:c.value,severity:c.severity});if(c.type==='maxArea')out.push({kind:'max',value:c.value,severity:c.severity});}
    return out;
  }

  global.HouserDefinition={CONDITION_TYPE_NAMES,SEVERITY,DIR_PL,DEFAULT_OPENING_TYPES,floors,floorDef,rooms,openingTypes,roomName,emptyDefinition,isDefinition,projectFromDefinition,slugRoomId,normalizeCondition,defaultCondition,conditionLabel,conditionUsesRoom,areaTargets};
})(window);
