// Ocieplenie i elewacja – z czego są przegrody: ściana (mur + ocieplenie + wykończenie), dach, podłoga, okna, drzwi, mostki.
// Liczy współczynniki U i zapisuje je do project.energySettings (U, bridge) – z nich korzysta bilans w module Energia
// (a przez niego Ogrzewanie, Wentylacja, Porównanie…). Mnożniki cen trafiają do project.envelopePriceK (moduł Wycena).
// HouserEnvelope.evaluate(env) -> {U, bridge, layers, priceK, cost…}; HouserEnvelope.apply(project, env) zapisuje wynik w projekcie.
(function(global){
  // mur: λ [W/mK], grubość [m], cena muru z robocizną [zł/m²]
  const WALLS={
    aac:{name:'Beton komórkowy (gazobeton) 24 cm',d:.24,l:.18,price:320},
    aac36:{name:'Beton komórkowy 36,5 cm (bez ocieplenia lub z cienkim)',d:.365,l:.11,price:380},
    ceramic:{name:'Pustak ceramiczny 25 cm',d:.25,l:.30,price:330},
    ceramic44:{name:'Pustak ceramiczny poryzowany 44 cm (jednowarstwowy)',d:.44,l:.085,price:420},
    silicate:{name:'Silikat 18 cm',d:.18,l:.80,price:310},
    concrete:{name:'Bloczek betonowy / keramzyt 24 cm',d:.24,l:.45,price:290},
    timber:{name:'Szkielet drewniany 15 cm z wełną',d:.15,l:.055,price:300},
  };
  // ocieplenie: λ, cena za m² przy 15 cm (materiał + robocizna, bez wykończenia) i dopłata za każdy cm ponad/poniżej
  const INS={
    none:{name:'bez ocieplenia',l:1,base:0,perCm:0},
    eps:{name:'Styropian biały (EPS 040)',l:.040,base:110,perCm:3},
    graphite:{name:'Styropian grafitowy (EPS 031)',l:.031,base:125,perCm:4},
    wool:{name:'Wełna mineralna (036)',l:.036,base:170,perCm:6},
    pir:{name:'Płyty PIR (022)',l:.022,base:190,perCm:9},
  };
  const FINISH={
    plaster:{name:'Tynk cienkowarstwowy',price:60},
    silicone:{name:'Tynk silikonowy (lepiej się nie brudzi)',price:80},
    wood:{name:'Deska elewacyjna na ruszcie (wentylowana)',price:260},
    clinker:{name:'Płytki klinkierowe',price:230},
    fibre:{name:'Płyty włóknocementowe',price:300},
    mixed:{name:'Tynk + fragmenty drewna / klinkieru',price:120},
  };
  const WIN={
    std2:{name:'Dwuszybowe (Uw ok. 1,1)',win:1.1,roofwin:1.3,k:.85},
    std3:{name:'Trzyszybowe (Uw ok. 0,9)',win:.9,roofwin:1.1,k:1},
    warm3:{name:'Trzyszybowe z ciepłą ramką (Uw ok. 0,75)',win:.75,roofwin:1.0,k:1.15},
    passive:{name:'Pasywne (Uw ok. 0,6)',win:.6,roofwin:.8,k:1.4},
  };
  const DOOR={std:{name:'Standardowe (Ud ok. 1,3)',u:1.3,k:1},warm:{name:'Ciepłe (Ud ok. 1,0)',u:1.0,k:1.25},passive:{name:'Pasywne (Ud ok. 0,8)',u:.8,k:1.6}};
  const BRIDGE={good:{name:'staranne (ciepły montaż okien, izolowane nadproża i wieńce)',v:.03},std:{name:'typowe',v:.05},poor:{name:'słabe (bez ciepłego montażu, balkony z płyty)',v:.10}};
  const ROOF_INS={wool:{name:'Wełna mineralna (035)',l:.035},pur:{name:'Pianka PUR natryskowa (038)',l:.038},pir:{name:'Płyty PIR nakrokwiowe (022)',l:.022}};
  const FLOOR_INS={eps:{name:'Styropian podłogowy EPS 100 (036)',l:.036},xps:{name:'XPS (034)',l:.034},pir:{name:'Płyty PIR (022)',l:.022}};
  const WT={wall:.20,roof:.15,floor:.30,win:.9,roofwin:1.1,door:1.3};
  const DEF={wall:'aac',ins:'graphite',insT:15,finish:'plaster',roofIns:'wool',roofT:30,floorIns:'eps',floorT:15,win:'std3',door:'std',bridge:'std'};
  const r2=v=>Math.round(v*1000)/1000;
  function evaluate(env){
    const e={...DEF,...(env||{})},W=WALLS[e.wall]||WALLS.aac,I=INS[e.ins]||INS.none,insT=e.ins==='none'?0:Math.max(0,+e.insT||0);
    const Rw=.13+.04+W.d/W.l+(insT/100)/I.l+.02; // + tynki
    const wall=1/Rw;
    const RI=ROOF_INS[e.roofIns]||ROOF_INS.wool,roofT=Math.max(0,+e.roofT||0),roof=1/(.10+.04+(roofT/100)/RI.l*.9+.05); // 10% krokwie / legary
    const FI=FLOOR_INS[e.floorIns]||FLOOR_INS.eps,floorT=Math.max(0,+e.floorT||0),floor=1/(.17+(floorT/100)/FI.l+.15);
    const Wn=WIN[e.win]||WIN.std3,D=DOOR[e.door]||DOOR.std,B=BRIDGE[e.bridge]||BRIDGE.std;
    const U={wall:r2(wall),roof:r2(roof),floor:r2(floor),win:Wn.win,roofwin:Wn.roofwin,door:D.u};
    const insPrice=I.base?I.base+I.perCm*(insT-15):0,F=FINISH[e.finish]||FINISH.plaster;
    const facade=insPrice+F.price; // ocieplenie + wykończenie [zł/m²]
    const priceK={extwalls:W.price/320,facade:facade/290,windows:Wn.k,roofwin:Wn.k,hst:Wn.k,extdoor:D.k};
    const checks=Object.entries(WT).map(([k,max])=>({k,U:U[k],max,ok:U[k]<=max+1e-9}));
    const thick=W.d+insT/100+(e.finish==='wood'||e.finish==='fibre'?.06:.02);
    return {env:e,U,bridge:B.v,priceK,facade,insPrice,wallPrice:W.price,checks,thick,layers:{W,I,insT,F,RI,roofT,FI,floorT,Wn,D,B}};
  }
  function apply(project,env){const R=evaluate(env);project.envelope={...R.env};project.energySettings={...(project.energySettings||{}),U:{...R.U},bridge:R.bridge};project.envelopePriceK={...R.priceK};return R}
  global.HouserEnvelope={WALLS,INS,FINISH,WIN,DOOR,BRIDGE,ROOF_INS,FLOOR_INS,WT,DEF,evaluate,apply};
})(window);
