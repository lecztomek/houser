// Warianty okien i drzwi – wspólne dla modułu Okna i drzwi, Zewnątrz 3D i Wnętrza 3D.
// Otwór rysowany w Układzie pomieszczeń ma typ bazowy (project.openings[floor][edgeKey] = 'window'|'door'|'hst'|'opening').
// Wariant i wymiary zapisuje moduł Okna i drzwi: project.openingVariants[floor][edgeKey] = {variant, sill, height}.
(function(global){
  const VARIANTS={
    window:{
      standard:{name:'Standardowe',sill:.9,height:1.4},
      low:{name:'Niskie (niski parapet)',sill:.5,height:1.8},
      balcony:{name:'Balkonowe (do podłogi) – drzwi balkonowe',sill:0,height:2.2},
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
      knee:{name:'Niskie – do schowka pod skosem',sill:0,height:1.0},
      glass:{name:'Szklane (skrzydło ze szkła hartowanego)',sill:0,height:2.05,glass:true},
      glassSliding:{name:'Szklane przesuwne',sill:0,height:2.05,glass:true,sliding:true}
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
  // drzwi rysowane na kilku kratkach to jedne drzwi: kratka bez własnych ustawień bierze je od najbliższej kratki tych samych drzwi
  function doorData(project,floor,key){const V=project?.openingVariants?.[floor]||{};if(V[key])return V[key];const ops=project?.openings?.[floor]||{},[o,aS,bS]=key.split(':'),a=+aS,b=+bS,at=o==='h'?a:b,k=i=>o==='h'?'h:'+i+':'+b:'v:'+a+':'+i;
    for(let d=1;d<=4;d++)for(const s of [-1,1]){let ok=true;for(let j=1;j<=d;j++)if(ops[k(at+s*j)]!=='door'){ok=false;break}if(ok&&V[k(at+s*d)])return V[k(at+s*d)]}return null}
  function resolve(project,floor,key,base){
    const v=(base==='door'?doorData(project,floor,key):project?.openingVariants?.[floor]?.[key])||{},list=VARIANTS[base]||{},id=list[v.variant]?v.variant:DEFAULT[base],def=list[id]||{sill:0,height:2.1,name:base};
    return {...def,base,variant:id,slope:v.slope==='manual'?'manual':'roof',angle:Number.isFinite(+v.angle)&&v.angle!==''&&v.angle!=null?+v.angle:45,rise:v.rise==='left'?'left':'right',blind:v.blind||'',sill:Number.isFinite(+v.sill)&&v.sill!==''&&v.sill!=null?+v.sill:def.sill,height:Number.isFinite(+v.height)&&v.height!==''&&v.height!=null?+v.height:def.height};
  }
  function setVariant(project,floor,keys,data){
    if(!project.openingVariants)project.openingVariants={};if(!project.openingVariants[floor])project.openingVariants[floor]={};
    for(const k of keys){const cur=project.openingVariants[floor][k]||{};project.openingVariants[floor][k]={...cur,...data};}
  }
  // górna krawędź okna ściętego (od podłogi): u – odległość od lewego końca okna patrząc z zewnątrz, len – szerokość okna,
  // roofTop – wolna wysokość pod dachem w tym miejscu (tryb „wg dachu”). Tryb „własny”: wyższa strona (rise) ma wysokość height, skos pod kątem angle.
  function slopedTop(info,u,len,roofTop){const y0=+info.sill||0;
    if(info.slope==='manual'){const a=Math.max(0,Math.min(80,+info.angle||0))*Math.PI/180,d=info.rise==='left'?u:len-u;let t=y0+info.height-Math.tan(a)*d;if(roofTop!=null)t=Math.min(t,roofTop-.25);return Math.max(y0+.2,t)} // ręczny skos – przycięty do ściany / dachu
    return roofTop==null?y0+info.height:Math.max(y0+.3,Math.min(y0+info.height,roofTop-.25))}
  // zasięg ciągu otworów (sąsiednie krawędzie tego samego rodzaju i wariantu) – dla modułów, które rysują otwory krawędź po krawędzi
  // osłony przeciwsłoneczne: ile ciepła ze słońca przechodzi przy opuszczonej osłonie (latem; w sezonie grzewczym osłony są podniesione)
  const BLIND={none:1,curtain:.8,internal:.65,awning:.4,screen:.3,external:.25,venetian:.2};
  const BLIND_NAMES={none:'bez osłon',curtain:'zasłony / firany',internal:'roleta / żaluzja wewnętrzna',awning:'markiza (na oknie dachowym: markizeta)',screen:'screen zewnętrzny (tkanina)',external:'roleta zewnętrzna',venetian:'żaluzja zewnętrzna (fasadowa)'};
  // jak narysować osłonę (prosto): box – kaseta rolety/żaluzji nad oknem na zewnątrz, awning – markiza (pochyła płachta), band – roleta wewnętrzna, curtain – zasłony po bokach od środka
  const BLIND_LOOK={curtain:{look:'curtain',color:'#e6d8bf'},internal:{look:'band',color:'#eeebe4'},awning:{look:'awning',color:'#c2532d'},screen:{look:'box',color:'#80868f'},external:{look:'box',color:'#5b6470'},venetian:{look:'box',color:'#9a9184'}};
  const blindOf=(project,info)=>{const k=info?.blind||project?.solarSettings?.blinds||'none';return BLIND_LOOK[k]?{kind:k,...BLIND_LOOK[k]}:null};
  // ceny orientacyjne (z montażem): okno zł/m² × mnożnik wariantu (nietypowy kształt = robione na wymiar), okno dachowe za sztukę, osłony zł/m² z minimum za sztukę
  const PRICE={window:1300,hst:3000,roof:3800,minWin:900};
  const VPRICE={window:{standard:1,low:1.05,balcony:1.15,transom:1.15,sloped:1.6,slopedLow:1.6,slopedFull:1.7,knee:1.2},hst:{hst:1,fixedLow:.7}};
  const BLIND_PRICE={curtain:[150,300],internal:[250,350],awning:[900,1500],screen:[1100,1600],external:[800,1200],venetian:[1300,2000]};
  const ROOF_BLIND_PRICE={curtain:300,internal:550,awning:900,screen:1100,external:2200,venetian:2200};
  function price(project,info,area,base){if(base!=='window'&&base!=='hst')return null;const roof=base==='window'&&info.shape==='roof',k=VPRICE[base]?.[info.variant]??1;
    const win=roof?PRICE.roof:Math.max(base==='window'?PRICE.minWin:0,area*PRICE[base]*k);
    const bk=info.blind||project?.solarSettings?.blinds||'none',bp=BLIND_PRICE[bk];const blind=!bp?0:roof?ROOF_BLIND_PRICE[bk]:Math.max(bp[1],area*bp[0]);
    return {win,blind,k,blindKind:bp?bk:null}}
  // podpis ustawień otworu – sąsiednie kratki z tym samym podpisem to jedno okno / drzwi
  // podpis okna (sąsiednie kratki o tym samym podpisie = jedno okno); skos (slope/angle/rise) liczy się tylko dla okien ściętych –
  // resztki tych ustawień po zmianie okna ściętego na zwykłe nie dzielą okna
  const sig=i=>[i.variant,...(i.shape==='sloped'?[i.slope,i.angle,i.rise]:['','','']),i.sill,i.height,i.blind].join('|');
  function runExtent(project,floor,key){const ops=project?.openings?.[floor]||{},base=ops[key],[o,aS,bS]=key.split(':'),a=+aS,b=+bS,v=sig(resolve(project,floor,key,base));
    const k=i=>o==='h'?'h:'+i+':'+b:'v:'+a+':'+i,same=i=>ops[k(i)]===base&&(base==='door'||sig(resolve(project,floor,k(i),base))===v),at=o==='h'?a:b;
    let from=at,to=at;while(same(from-1))from--;while(same(to+1))to++;return {from,to,at}}
  // czy przez otwór da się przejść: drzwi, HST, przejście – i okno balkonowe (do podłogi), czyli drzwi balkonowe
  function walkable(project,floor,key){const t=project?.openings?.[floor]?.[key];if(t==='door'||t==='hst'||t==='opening')return true;if(t!=='window')return false;
    const i=resolve(project,floor,key,'window');return i.shape!=='roof'&&(i.variant==='balcony'||i.variant==='slopedFull')&&(+i.sill||0)<=.1}
  global.HouserOpenings={doorData,walkable,VARIANTS,DEFAULT,BASE_NAMES,variantsFor,resolve,setVariant,slopedTop,runExtent,sig,BLIND,BLIND_NAMES,BLIND_LOOK,blindOf,PRICE,VPRICE,price};
})(window);
