// Fundamenty: ławy albo płyta fundamentowa, ściany fundamentowe liczone z terenu (spadek działki z modułu Działka),
// strefa przemarzania, grunt, woda gruntowa i piwnica – pod całym domem albo pod wybranym fragmentem (kratki rzutu parteru).
// HouserFoundation.evaluate(project) -> {set, zero, edges, base, walkout, q (ilości), cost {items, house, basement, total}, issues, good, score}
// Ustawienia: project.foundation = {type:'strip'|'slab', zone:1..4, water:'low'|'high', plinth, basement:{mode:'none'|'full'|'part', cells:['x,y'], h}}
// Grunt: project.structure.soil (wspólny z modułem Konstrukcja). Wymaga shared/quantities.js; opcjonalnie modules/dzialka/engine.js (teren), modules/konstrukcja/engine.js (ławy).
(function(global){
  const ZONES={1:{name:'I (zachód, 0,8 m)',d:.8},2:{name:'II (centrum, 1,0 m)',d:1},3:{name:'III (wschód, 1,2 m)',d:1.2},4:{name:'IV (Suwałki, góry, 1,4 m)',d:1.4}};
  const TYPES={strip:'Ławy i ściany fundamentowe',slab:'Płyta fundamentowa'};
  const SOIL={weak:{name:'słaby (glina plastyczna, nasyp)',kPa:100},avg:{name:'przeciętny (piasek średni, glina zwarta)',kPa:150},good:{name:'dobry (żwir, piasek zagęszczony)',kPa:250}};
  const PRICE={footing:760,wallBlock:330,lean:95,wallConcrete:540,bitumen:70,whiteTank:260,xps:95,dig:45,haul:35,backfill:30,slab:430,fill:120,baseFloor:240,baseStairs:7500,drain:130,walkDoor:4800,lightWell:2600};
  const FOOT_H=.35,BASE_SLAB=.25,FLOOR=.45; // wysokość ławy, strop nad piwnicą, warstwy podłogi na gruncie
  const fmt=(v,d=1)=>(Math.round(v*10**d)/10**d).toLocaleString('pl-PL',{minimumFractionDigits:d,maximumFractionDigits:d});
  function settings(project){const f=project.foundation||{},b=f.basement||{};
    return {type:TYPES[f.type]?f.type:'strip',zone:ZONES[f.zone]?+f.zone:2,water:f.water==='high'?'high':'low',plinth:Math.max(.15,Math.min(1.2,Number.isFinite(+f.plinth)&&f.plinth!==''&&f.plinth!=null?+f.plinth:.3)),
      basement:{mode:['full','part'].includes(b.mode)?b.mode:'none',cells:Array.isArray(b.cells)?b.cells.filter(k=>typeof k==='string'):[],h:Math.max(2.2,Math.min(3.2,+b.h||2.5))},
      soil:SOIL[project.structure?.soil]?project.structure.soil:'avg',configured:!!project.foundation}}
  function evaluate(project){
    const set=settings(project),q=HouserQuantities.compute(project),c=q.c,W=q.W,H=q.H,lo=q.lo,c2=c*c;
    const st=project.state?.[lo]||[],fl=Array.isArray(st[0])?st.flat():st,defs=Object.fromEntries((project.definitionSnapshot?.floors?.[lo]?.rooms||[]).map(r=>[r.id,r]));
    const occ=(x,y)=>x>=0&&y>=0&&x<W&&y<H&&!!fl[y*W+x]&&defs[fl[y*W+x]]?.kind!=='exteriorVoid';
    // teren pod domem: z(x,y) w metrach siatki; poziom ±0 = najwyższy punkt terenu pod domem + cokół
    let T={flat:true,z:()=>0,min:0,max:0,diff:0,dir:'none',pct:0};if(global.HouserSite){try{T=HouserSite.houseTerrain(project)}catch(_){}}
    const zero=T.max+set.plinth,frost=ZONES[set.zone].d;
    // piwnica: kratki parteru
    const cells=[];for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(occ(x,y))cells.push([x,y]);
    const bset=new Set(set.basement.mode==='full'?cells.map(p=>p.join(',')):set.basement.mode==='part'?set.basement.cells.filter(k=>{const [x,y]=k.split(',').map(Number);return occ(x,y)}):[]);
    const isB=(x,y)=>bset.has(x+','+y),baseFloor=zero-BASE_SLAB-set.basement.h; // poziom posadzki piwnicy
    // obwód i ściany: zewnętrzne krawędzie domu + granica piwnicy pod domem (ściana piwnicy wewnątrz obrysu)
    const edges=[];const mid=(o,x,y)=>o==='v'?[x*c,(y+.5)*c]:[(x+.5)*c,y*c];
    for(let y=0;y<=H;y++)for(let x=0;x<=W;x++)for(const o of ['v','h']){if(o==='v'&&y>=H||o==='h'&&x>=W)continue;
      const a=o==='v'?[x-1,y]:[x,y-1],b=[x,y],oa=occ(...a),ob=occ(...b);if(!oa&&!ob)continue;
      const [mx,my]=mid(o,x,y),z=T.z(mx,my),ext=oa!==ob,ba=oa&&isB(...a),bb=ob&&isB(...b),base=ba||bb,inner=!ext&&ba!==bb;
      if(!ext&&!inner)continue;
      // spód ławy: poniżej przemarzania od terenu i poniżej posadzki piwnicy
      const bottom=Math.min(ext?z-frost:zero-FLOOR-.8,base?baseFloor-FOOT_H:Infinity),wallH=Math.max(0,zero-(bottom+FOOT_H));
      // ściana piwnicy odsłonięta od strony spadku: teren poniżej posadzki piwnicy (wyjście do ogrodu) albo częściowo (okno)
      const expo=ext&&base?Math.max(0,Math.min(set.basement.h,z<=baseFloor+.05?set.basement.h:zero-BASE_SLAB-z)):0;
      edges.push({o,x,y,len:c,z,ext,base,inner,bottom,wallH,above:ext?zero-z:0,expo,walkout:ext&&base&&z<=baseFloor+.3})}
    const extE=edges.filter(e=>e.ext),Lext=extE.length*c;
    // ściany nośne wewnątrz (z Konstrukcji) – ławy wewnętrzne
    let Lint=0,footW=.6;if(global.HouserStructure){try{const K=HouserStructure.evaluate(project);if(K?.wallsRows?.length)footW=Math.max(.5,...K.wallsRows.map(w=>w.foot||.5));
      for(let y=0;y<=H;y++)for(let x=0;x<=W;x++){if(x>0&&x<W&&y<H&&occ(x-1,y)&&occ(x,y)&&K.bearV?.(x,y))Lint+=c;if(y>0&&y<H&&x<W&&occ(x,y-1)&&occ(x,y)&&K.bearH?.(x,y))Lint+=c}}catch(_){Lint=(q.partLen?.[lo]||0)*.4}}else Lint=(q.partLen?.[lo]||0)*.4;
    if(SOIL[set.soil].kPa<=100)footW=Math.max(footW,.7);
    const inner=edges.filter(e=>e.inner),Lbin=inner.length*c,area=cells.length*c2,bArea=bset.size*c2,bPer=edges.filter(e=>e.base).length*c;
    const avgWall=extE.length?extE.reduce((a,e)=>a+e.wallH,0)/extE.length:0,maxWall=extE.length?Math.max(...extE.map(e=>e.wallH)):0,minWall=extE.length?Math.min(...extE.map(e=>e.wallH)):0;
    const walkL=extE.filter(e=>e.walkout).length*c,expoA=extE.reduce((a,e)=>a+e.expo*c,0);
    // ---------- ilości
    const Q={area,Lext,Lint,footW,avgWall,maxWall,minWall,bArea,bPer,walkL};
    const items=[],baseItems=[],it=(arr,name,v,note)=>{if(v>0)arr.push({name,v:Math.round(v),note:note||''})};
    const noB=edges.filter(e=>!e.base&&e.ext),wallA_nb=noB.reduce((a,e)=>a+e.wallH*c,0),intWallH=Math.max(.6,set.plinth+.5);
    if(set.type==='strip'){
      const Lf=noB.length*c+Lint,Vf=Lf*footW*FOOT_H;Q.footV=Vf;it(items,'Ławy fundamentowe (beton zbrojony)',Vf*PRICE.footing,fmt(Vf,1)+' m³ · szer. '+fmt(footW*100,0)+' cm');
      it(items,'Chudy beton pod ławy i izolacja pozioma',Lf*(footW+.1)*PRICE.lean,fmt(Lf,0)+' m');
      const Aw=wallA_nb+Lint*intWallH;Q.wallA=Aw;it(items,'Ściany fundamentowe (bloczki betonowe)',Aw*PRICE.wallBlock,fmt(Aw,0)+' m² · wys. '+fmt(minWall,2)+'–'+fmt(maxWall,2)+' m');
      const dig=noB.reduce((a,e)=>a+(e.z-e.bottom)*(footW+.6)*c,0)+Lint*(footW+.4)*(intWallH+FOOT_H);Q.digV=dig;it(items,'Wykopy pod ławy i wywóz ziemi',dig*(PRICE.dig+PRICE.haul*.5),fmt(dig,0)+' m³');
      it(items,'Izolacja przeciwwilgociowa i ocieplenie ścian (XPS)',wallA_nb*(PRICE.bitumen+PRICE.xps),fmt(wallA_nb,0)+' m²');
      const nbA=area-bArea,fillV=nbA*Math.max(.2,set.plinth+(T.diff||0)/2-.1);Q.fillV=fillV;
      it(items,'Zasypka, podsypka i chudy beton pod posadzkę',fillV*PRICE.fill*.6,fmt(fillV,0)+' m³')}
    else{
      // płyta: na płaskim terenie; na stoku – nasyp pod płytę po stronie spadku
      const nbA=area-bArea,fillV=cells.filter(([x,y])=>!isB(x,y)).reduce((a,[x,y])=>a+Math.max(0,zero-FLOOR-.3-T.z((x+.5)*c,(y+.5)*c))*c2,0);Q.fillV=fillV;
      it(items,'Płyta fundamentowa z ociepleniem (XPS) i podbudową',nbA*PRICE.slab,fmt(nbA,0)+' m²');
      it(items,'Nasyp / wyrównanie terenu pod płytę',fillV*PRICE.fill,fmt(fillV,1)+' m³');
      it(items,'Ściany cokołowe na obwodzie',wallA_nb*PRICE.wallBlock*.6,fmt(wallA_nb,0)+' m²')}
    if(bArea>0){const walls=edges.filter(e=>e.base),wallA=walls.reduce((a,e)=>a+e.wallH*c,0),soilA=walls.filter(e=>e.ext).reduce((a,e)=>a+Math.max(0,e.wallH-e.expo)*c,0),depth=v=>Math.max(0,v);
      const digV=[...bset].reduce((a,k)=>{const [x,y]=k.split(',').map(Number);return a+depth(T.z((x+.5)*c,(y+.5)*c)-(baseFloor-FOOT_H-.15))*c2},0)+bPer*.8*Math.max(0,(T.max+T.min)/2-(baseFloor-FOOT_H));
      Q.bDigV=digV;Q.bWallA=wallA;Q.bSoilA=soilA;
      it(baseItems,'Wykop pod piwnicę i wywóz ziemi',digV*(PRICE.dig+PRICE.haul),fmt(digV,0)+' m³');
      it(baseItems,'Ławy pod ściany piwnicy',walls.length*c*footW*FOOT_H*PRICE.footing,fmt(walls.length*c,0)+' m');
      it(baseItems,'Ściany piwnicy (beton)',wallA*PRICE.wallConcrete,fmt(wallA,0)+' m²');
      it(baseItems,'Posadzka piwnicy',bArea*PRICE.baseFloor,fmt(bArea,0)+' m²');
      it(baseItems,set.water==='high'?'Biała wanna (beton wodoszczelny) i taśmy':'Hydroizolacja i ocieplenie ścian piwnicy',soilA*(PRICE.bitumen+PRICE.xps)+(set.water==='high'?(soilA+bArea)*PRICE.whiteTank:0),fmt(soilA,0)+' m² ścian w gruncie');
      it(baseItems,'Drenaż opaskowy',set.water==='high'||soilA>0?bPer*PRICE.drain:0,fmt(bPer,0)+' m');
      it(baseItems,'Schody do piwnicy',PRICE.baseStairs);
      const nw=Math.max(1,Math.round(bArea/20));if(walkL>=1)it(baseItems,'Drzwi / przeszklenie do ogrodu z piwnicy',PRICE.walkDoor);else if(expoA>2)it(baseItems,'Okna piwnicy (ściana nad terenem od strony spadku)',nw*1500,nw+' szt.');else it(baseItems,'Okna piwniczne z doświetlaczami',nw*PRICE.lightWell,nw+' szt.')}
    const house=items.reduce((a,i)=>a+i.v,0),basement=baseItems.reduce((a,i)=>a+i.v,0);
    // ---------- uwagi
    const issues=[],good=[],add=(p,text,tip,type)=>issues.push({p:Math.round(p*100)/100,text,tip:tip||'',type:type||'found'});
    if(!T.flat&&T.diff>=.5){if(maxWall-minWall>.8&&!bArea)add(Math.min(1.2,.3+(maxWall-minWall-.8)*.5),'Dom na stoku: ściany fundamentowe od '+fmt(minWall,2)+' do '+fmt(maxWall,2)+' m – od strony spadku wysokie.','Rozważ piwnicę pod częścią domu od strony spadku – i tak trzeba tam zejść nisko, a zyskujesz pomieszczenie z oknem albo wyjściem do ogrodu.','slope');
      if(set.type==='slab'&&T.diff>.6)add(Math.min(1.5,.4+T.diff*.4),'Płyta fundamentowa na stoku (różnica '+fmt(T.diff,2)+' m) – potrzebny duży nasyp ('+fmt(Q.fillV||0,0)+' m³).','Na stoku zwykle taniej wychodzą ławy albo piwnica od strony spadku.','slope')}
    if(bArea>0){if(set.water==='high')add(1,'Wysoka woda gruntowa i piwnica – potrzebna biała wanna, drenaż, a w czasie budowy odwodnienie wykopu.','Jeśli piwnica nie jest konieczna, podnieś posadzkę parteru albo zrób pomieszczenia gospodarcze na parterze.','water');
      if(walkL>=1)good.push('Piwnica wychodzi do ogrodu od strony spadku ('+fmt(walkL,1)+' m ściany odsłoniętej) – można zrobić okna i drzwi.');
      else if(expoA>2)good.push('Piwnica częściowo nad terenem od strony spadku – zwykłe okna zamiast doświetlaczy.');
      const stairsCells=(project.stairs||[]).flatMap(s=>s._cells?.lower||[]);if(stairsCells.length&&stairsCells.some(([x,y])=>isB(x,y)))good.push('Zejście do piwnicy pod biegiem schodów na piętro.');
      else add(.3,'Zaplanuj zejście do piwnicy – schody wewnętrzne (ok. 1 × 3,5 m) albo wejście z zewnątrz.','Najłatwiej pod schodami na piętro albo w holu / pomieszczeniu technicznym.','stairs');
      good.push('Piwnica: '+fmt(bArea,1)+' m² (wys. '+fmt(set.basement.h,2)+' m).')}
    if(SOIL[set.soil].kPa<=100&&set.type==='strip')add(.5,'Słaby grunt – ławy ok. '+fmt(footW*100,0)+' cm szerokości.','Zrób badania geotechniczne; przy słabym gruncie często lepsza płyta fundamentowa.','soil');
    if(set.water==='high'&&!bArea)good.push('Bez piwnicy – przy wysokiej wodzie gruntowej to dobra decyzja.');
    if(!issues.length)good.push(TYPES[set.type]+': posadowienie '+fmt(frost,1)+' m (strefa '+ZONES[set.zone].name+').');
    const score=Math.round(Math.max(0,10-issues.reduce((a,i)=>a+i.p,0))*10)/10;
    return {set,T,zero,frost,baseFloor,edges,bset,cells,W,H,c,lo,Q,walkL,expoA,cost:{items,baseItems,house,basement,total:house+basement},issues:issues.sort((a,b)=>b.p-a.p),good,score}}
  global.HouserFoundation={ZONES,TYPES,SOIL,PRICE,settings,evaluate};
})(typeof window!=='undefined'?window:globalThis);
