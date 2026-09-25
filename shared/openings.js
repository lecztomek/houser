// Warianty okien i drzwi – wspólne dla modułu Okna i drzwi, Zewnątrz 3D i Wnętrza 3D.
// Otwór rysowany w Układzie pomieszczeń ma typ bazowy (project.openings[floor][edgeKey] = 'window'|'door'|'hst'|'opening').
// Wariant i wymiary zapisuje moduł Okna i drzwi: project.openingVariants[floor][edgeKey] = {variant, sill, height}.
(function(global){
  const VARIANTS={
    window:{
      standard:{name:'Standardowe',sill:.9,height:1.4},
      low:{name:'Niskie (niski parapet)',sill:.5,height:1.8},
      balcony:{name:'Balkonowe (do podłogi)',sill:0,height:2.2},
      transom:{name:'Naświetle (wysoko)',sill:1.6,height:.6},
      sloped:{name:'Ścięte pod skos dachu',sill:.9,height:2.4,shape:'sloped'},
      slopedLow:{name:'Ścięte niskie (pod skosem, nisko)',sill:.3,height:1.4,shape:'sloped'},
      slopedFull:{name:'Ścięte do podłogi (od podłogi pod skos)',sill:0,height:3.5,shape:'sloped'},
      knee:{name:'Niskie w ściance kolankowej',sill:.2,height:.6},
      roof:{name:'Dachowe (połaciowe)',sill:.5,height:1.2,shape:'roof'} // sill = odległość od okapu wzdłuż połaci, height = długość okna wzdłuż połaci
    },
    door:{
      single:{name:'Pojedyncze',sill:0,height:2.05},
      double:{name:'Dwuskrzydłowe',sill:0,height:2.05,leaves:2},
      sliding:{name:'Przesuwne',sill:0,height:2.05,sliding:true},
      entrance:{name:'Wejściowe z doświetlem',sill:0,height:2.3,glassTop:true},
      knee:{name:'Niskie – do schowka pod skosem',sill:0,height:1.0}
    },
    hst:{
      hst:{name:'HST – przesuwne tarasowe',sill:0,height:2.35},
      fixedLow:{name:'Przeszklenie do podłogi',sill:0,height:2.5}
    }
  };
  const DEFAULT={window:'standard',door:'single',hst:'hst'};
  const BASE_NAMES={window:'Okno',door:'Drzwi',hst:'HST / drzwi tarasowe'};

  function variantsFor(base){return VARIANTS[base]||{}}
  // pełny opis otworu: {base, variant, name, sill, height, shape, ...}
  function resolve(project,floor,key,base){
    const v=project?.openingVariants?.[floor]?.[key]||{},list=VARIANTS[base]||{},id=list[v.variant]?v.variant:DEFAULT[base],def=list[id]||{sill:0,height:2.1,name:base};
    return {...def,base,variant:id,slope:v.slope==='manual'?'manual':'roof',angle:Number.isFinite(+v.angle)&&v.angle!==''&&v.angle!=null?+v.angle:45,rise:v.rise==='left'?'left':'right',blind:v.blind||'',sill:Number.isFinite(+v.sill)&&v.sill!==''&&v.sill!=null?+v.sill:def.sill,height:Number.isFinite(+v.height)&&v.height!==''&&v.height!=null?+v.height:def.height};
  }
  function setVariant(project,floor,keys,data){
    if(!project.openingVariants)project.openingVariants={};if(!project.openingVariants[floor])project.openingVariants[floor]={};
    for(const k of keys){const cur=project.openingVariants[floor][k]||{};project.openingVariants[floor][k]={...cur,...data};}
  }
  // górna krawędź okna ściętego (od podłogi): u – odległość od lewego końca okna patrząc z zewnątrz, len – szerokość okna,
  // roofTop – wolna wysokość pod dachem w tym miejscu (tryb „wg dachu”). Tryb „własny”: wyższa strona (rise) ma wysokość height, skos pod kątem angle.
  function slopedTop(info,u,len,roofTop){const y0=+info.sill||0;
    if(info.slope==='manual'){const a=Math.max(0,Math.min(80,+info.angle||0))*Math.PI/180,d=info.rise==='left'?u:len-u;return Math.max(y0+.2,y0+info.height-Math.tan(a)*d)}
    return roofTop==null?y0+info.height:Math.max(y0+.3,Math.min(y0+info.height,roofTop-.25))}
  // zasięg ciągu otworów (sąsiednie krawędzie tego samego rodzaju i wariantu) – dla modułów, które rysują otwory krawędź po krawędzi
  function runExtent(project,floor,key){const ops=project?.openings?.[floor]||{},base=ops[key],[o,aS,bS]=key.split(':'),a=+aS,b=+bS,v=resolve(project,floor,key,base).variant;
    const k=i=>o==='h'?'h:'+i+':'+b:'v:'+a+':'+i,same=i=>ops[k(i)]===base&&resolve(project,floor,k(i),base).variant===v,at=o==='h'?a:b;
    let from=at,to=at;while(same(from-1))from--;while(same(to+1))to++;return {from,to,at}}
  global.HouserOpenings={VARIANTS,DEFAULT,BASE_NAMES,variantsFor,resolve,setVariant,slopedTop,runExtent};
})(window);
