// Wspólny model bryły domu: wysokości kondygnacji, typ piętra i dach.
// Wszystkie moduły liczą dach tą samą funkcją, żeby rzut, elewacje i podglądy 3D się zgadzały.
//
// elevationSettings w JSON-ie:
//   groundHeight  wysokość parteru [m]
//   upperType     'full' = pełne piętro, 'attic' = poddasze użytkowe
//   upperHeight   wysokość pełnego piętra [m] (dla poddasza: wysokość do stropu/jętek)
//   kneeWall      ścianka kolankowa poddasza [m]
//   roofPitch     kąt nachylenia połaci [°]
//   ridge         'north-south' | 'east-west' – kierunek kalenicy
//   roofHeight    wyliczana wysokość dachu od okapu do kalenicy [m] (zapisywana dla zgodności)
(function(global){
  const DEF={groundHeight:2.8,upperType:'full',upperHeight:2.8,kneeWall:1.0,roofPitch:35,ridge:'east-west'};
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const num=(v,d)=>{const n=Number(v);return Number.isFinite(n)&&v!==''&&v!=null?n:d;};

  // span = szerokość domu w poprzek kalenicy [m] (długość ściany szczytowej)
  function normalize(e,span){
    e=e||{};const half=Math.max(.5,(span||9)/2);
    let pitch=num(e.roofPitch,NaN);
    if(!Number.isFinite(pitch)){ // stare pliki: tylko roofHeight -> kąt z wysokości
      const rh=num(e.roofHeight,NaN);pitch=Number.isFinite(rh)?Math.atan(rh/half)*180/Math.PI:DEF.roofPitch;
    }
    return {
      groundHeight:clamp(num(e.groundHeight,DEF.groundHeight),2.2,4.5),
      upperType:e.upperType==='attic'?'attic':'full',
      upperHeight:clamp(num(e.upperHeight,DEF.upperHeight),2.2,4.5),
      kneeWall:clamp(num(e.kneeWall,DEF.kneeWall),0,2),
      roofPitch:clamp(Math.round(pitch*10)/10,5,60),
      ridge:e.ridge==='north-south'?'north-south':'east-west',
    };
  }

  // Wymiary bryły dla danej rozpiętości: okap, kalenica, wysokość ścian piętra.
  function geometry(e,span){
    const n=normalize(e,span),half=Math.max(.5,(span||9)/2);
    const upperWall=n.upperType==='attic'?n.kneeWall:n.upperHeight; // ściana zewnętrzna piętra pod okapem
    const eave=n.groundHeight+upperWall;
    const rise=Math.tan(n.roofPitch*Math.PI/180)*half;
    return {...n,span:half*2,upperWall,eave,rise,ridgeY:eave+rise,roofHeight:Math.round(rise*100)/100};
  }

  // Ustawienia do zapisu: znormalizowane + wyliczone roofHeight dla starszych przeglądarek.
  function toSaved(e,span){const g=geometry(e,span);return {groundHeight:g.groundHeight,upperType:g.upperType,upperHeight:g.upperHeight,kneeWall:g.kneeWall,roofPitch:g.roofPitch,ridge:g.ridge,roofHeight:g.roofHeight};}

  // Czy połacie opadają w poprzek osi X siatki (kalenica biegnie wzdłuż osi Z / wierszy)?
  // Zależy od kierunku kalenicy i tego, jaki kierunek świata jest u góry siatki.
  function slopesAcrossX(ridge,top){
    const gridZIsNorthSouth=(top||'north')==='north'||top==='south';
    return (ridge==='north-south')===gridZIsNorthSouth;
  }

  global.HouserModel={DEF,normalize,geometry,toSaved,slopesAcrossX};
})(window);
