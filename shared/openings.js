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
      roof:{name:'Dachowe (połaciowe)',sill:0,height:1.2,shape:'roof'}
    },
    door:{
      single:{name:'Pojedyncze',sill:0,height:2.05},
      double:{name:'Dwuskrzydłowe',sill:0,height:2.05,leaves:2},
      sliding:{name:'Przesuwne',sill:0,height:2.05,sliding:true},
      entrance:{name:'Wejściowe z doświetlem',sill:0,height:2.3,glassTop:true}
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
    return {...def,base,variant:id,sill:Number.isFinite(+v.sill)&&v.sill!==''&&v.sill!=null?+v.sill:def.sill,height:Number.isFinite(+v.height)&&v.height!==''&&v.height!=null?+v.height:def.height};
  }
  function setVariant(project,floor,keys,data){
    if(!project.openingVariants)project.openingVariants={};if(!project.openingVariants[floor])project.openingVariants[floor]={};
    for(const k of keys){const cur=project.openingVariants[floor][k]||{};project.openingVariants[floor][k]={...cur,...data};}
  }
  global.HouserOpenings={VARIANTS,DEFAULT,BASE_NAMES,variantsFor,resolve,setVariant};
})(window);
