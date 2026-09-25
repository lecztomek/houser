// Ilości policzone z projektu – wspólne dla modułów Wycena, Przepisy i Energia.
// HouserQuantities.compute(project) -> powierzchnie, ściany, otwory (także per pomieszczenie), dach, kubatura.
// Wymaga shared/house-model.js i shared/openings.js.
(function(global){
  function compute(project){
    const g=project.grid||project.definitionSnapshot?.grid,W=g.width,H=g.height,c=g.cellMeters,c2=c*c;
    const [lo,up]=project.definitionSnapshot?.floorOrder||['ground','upper'];
    const rooms=f=>project.definitionSnapshot?.floors?.[f]?.rooms||[];
    const def={};for(const f of [lo,up])def[f]=Object.fromEntries(rooms(f).map(r=>[r.id,r]));
    const flat=f=>{const st=project.state?.[f]||[];return Array.isArray(st[0])?st.flat():st};
    const st={[lo]:flat(lo),[up]:flat(up)};
    const id=(f,x,y)=>x<0||y<0||x>=W||y>=H?null:(st[f]?.[y*W+x]||null);
    const isHole=(f,v)=>f===up&&(v==='pustka'||v==='schody');
    const occ=(f,x,y)=>{const v=id(f,x,y);return !!v&&def[f]?.[v]?.kind!=='exteriorVoid'};
    const isVoid=(f,x,y)=>{const v=id(f,x,y);return !!v&&def[f]?.[v]?.kind==='exteriorVoid'};
    const e=project.elevationSettings||{},across=HouserModel.slopesAcrossX(e.ridge==='north-south'?'north-south':'east-west',project.orientation?.top);
    const span=across?W*c:H*c,length=across?H*c:W*c,G=HouserModel.geometry(e,span),tan=Math.tan(G.roofPitch*Math.PI/180),attic=G.upperType==='attic';
    // wysokość w świetle w danej kratce (poddasze: od ścianki kolankowej rośnie ze skosem, ograniczona stropem / jętkami)
    const clearH=(f,x,y)=>{if(f===lo)return G.groundHeight;if(!attic)return G.upperHeight;const a=across?(x+.5)*c:(y+.5)*c;return Math.min(G.kneeWall+Math.min(a,span-a)*tan,G.upperHeight)};
    const q={c,W,H,lo,up,span,length,G,attic,across};

    // pomieszczenia i powierzchnie
    const R={},GARAGE=/garaż|garaz/i;let foot=0,slab=0,volume=0,loggiaA=0,overhangA=0,garageA=0;const usable={[lo]:0,[up]:0},net={[lo]:0,[up]:0};
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      const gO=occ(lo,x,y),uO=occ(up,x,y);if(gO||uO)foot+=c2;
      if(gO&&isVoid(up,x,y))loggiaA+=c2; if(uO&&!gO)overhangA+=c2;
      if(uO&&!isHole(up,id(up,x,y)))slab+=c2;
      for(const f of [lo,up]){if(!occ(f,x,y))continue;const v=id(f,x,y);if(isHole(f,v))continue;const h=clearH(f,x,y),garage=GARAGE.test(def[f]?.[v]?.name||v),u=garage?0:h>=2.2?c2:h>=1.4?c2/2:0;
        net[f]+=c2;usable[f]+=u;if(!garage)volume+=c2*h;else garageA+=c2; // garaż: poza powierzchnią użytkową i kubaturą ogrzewaną
        const r=R[f+'|'+v]||(R[f+'|'+v]={f,id:v,name:def[f]?.[v]?.name||v,area:0,usable:0,cells:[],minH:99,maxH:0,areaH22:0,winA:0,roofWinA:0,wins:0,roofWins:0,hstA:0,doors:[],extEdges:0});
        r.area+=c2;r.usable+=u;r.cells.push([x,y]);r.minH=Math.min(r.minH,h);r.maxH=Math.max(r.maxH,h);if(h>=2.2)r.areaH22+=c2}}
    Object.assign(q,{foot,slab,volume,loggiaA,overhangA,garageA,usable,net,usableTotal:usable[lo]+usable[up]});

    // ściany zewnętrzne i działowe
    const hWall={[lo]:G.groundHeight,[up]:G.upperWall},hPart={[lo]:G.groundHeight,[up]:attic?Math.max(G.kneeWall,(G.kneeWall+G.upperHeight)/2):G.upperHeight};
    const extLen={[lo]:0,[up]:0},partLen={[lo]:0,[up]:0};
    const edge=(f,ax,ay,bx,by,key)=>{const A=occ(f,ax,ay),B=occ(f,bx,by);
      if(A!==B){extLen[f]+=c;const r=R[f+'|'+(A?id(f,ax,ay):id(f,bx,by))];if(r)r.extEdges++;return}
      if(!A)return;const va=id(f,ax,ay),vb=id(f,bx,by);if(va===vb||isHole(f,va)||isHole(f,vb))return;if(project.openings?.[f]?.[key]==='opening')return;partLen[f]+=c};
    for(const f of [lo,up]){for(let y=0;y<=H;y++)for(let x=0;x<W;x++)edge(f,x,y-1,x,y,'h:'+x+':'+y);for(let x=0;x<=W;x++)for(let y=0;y<H;y++)edge(f,x-1,y,x,y,'v:'+x+':'+y)}
    const gable=span*G.rise;

    // otwory: sąsiednie krawędzie tego samego rodzaju = jeden otwór
    const ops={win:0,winA:0,roofWin:0,roofWinA:0,hst:0,hstA:0,extDoor:0,extDoorA:0,intDoor:0},runs=[];
    for(const f of [lo,up]){const groups={};
      for(const [key,base] of Object.entries(project.openings?.[f]||{})){if(!['window','door','hst'].includes(base))continue;const [o,aS,bS]=key.split(':'),a=+aS,b=+bS;
        const ax=o==='h'?a:a-1,ay=o==='h'?b-1:b,A=occ(f,ax,ay),B=occ(f,a,b);if(!A&&!B)continue;const ext=A!==B,line=o==='h'?b:a,along=o==='h'?a:b;
        const ra=A?id(f,ax,ay):null,rb=B?id(f,a,b):null,gk=[o,line,base,ra,rb].join('|');(groups[gk]=groups[gk]||{f,o,line,base,ext,ra,rb,items:[]}).items.push({key,along})}
      for(const gr of Object.values(groups)){gr.items.sort((p,q)=>p.along-q.along);let run=null;
        for(const it of gr.items){if(run&&it.along===run.to+1&&(gr.base!=='door'||run.keys.length<4)){run.to=it.along;run.keys.push(it.key)}else{run={...gr,items:undefined,from:it.along,to:it.along,keys:[it.key]};runs.push(run)}}}}
    for(const r of runs){const info=HouserOpenings.resolve(project,r.f,r.keys[0],r.base);r.info=info;r.w=r.keys.length*c;r.h=+info.height||1.2;r.area=r.w*r.h;
      const rooms_=[r.ra,r.rb].filter(Boolean).map(v=>R[r.f+'|'+v]).filter(Boolean);r.rooms=rooms_;
      if(r.base==='window'){if(info.shape==='roof'){ops.roofWin++;ops.roofWinA+=r.area;for(const m of rooms_){m.roofWinA+=r.area;m.roofWins++}}else if(r.ext){ops.win++;ops.winA+=r.area;for(const m of rooms_){m.winA+=r.area;m.wins++}}}
      else if(r.base==='hst'){ops.hst++;ops.hstA+=r.area;for(const m of rooms_)m.hstA+=r.area}
      else{if(r.ext){ops.extDoor++;ops.extDoorA+=r.area}else ops.intDoor++;for(const m of rooms_)m.doors.push(r)}}
    const wallGross=extLen[lo]*hWall[lo]+extLen[up]*hWall[up],glaz=ops.winA+ops.hstA+ops.extDoorA;
    const extGross=wallGross+gable,extNet=Math.max(0,extGross-glaz);
    Object.assign(q,{hWall,hPart,extLen,partLen,gable,extGross,extNet,wallNet:Math.max(0,wallGross-glaz),partA:partLen[lo]*hPart[lo]+partLen[up]*hPart[up],ops,runs});

    // dach
    // dach tylko nad częścią domu, gdy piętro jest krótsze, a na końcu parteru jest balkon / taras (HouserModel.roofRange)
    const rr=HouserModel.roofRange(project),roofL=rr.l1-rr.l0;
    const eo=G.eaveOverhang,go=G.gableOverhang,cos=Math.cos(G.roofPitch*Math.PI/180),slope=(span/2+eo)/cos,roofA=2*slope*(roofL+2*go);
    let flatA=0;if(!rr.full)for(let y=0;y<H;y++)for(let x=0;x<W;x++){if(!occ(lo,x,y))continue;const a=(across?y+.5:x+.5)*c;if(a<rr.l0||a>rr.l1)flatA+=c2}
    Object.assign(q,{roofA,roofL,flatA,roofInnerA:2*(span/2)/cos*roofL,soffitA:G.soffit==='none'?0:2*eo*(roofL+2*go)+2*go*2*slope,gutter:2*(roofL+2*go)});
    // balkony: powierzchnia, wystające / nad parterem, styk płyty ze ścianą (mostek cieplny)
    const bal={area:0,cantA:0,overA:0,contact:0,psiL:0,rail:0,n:0},bset=new Set();for(const b of project.balconies||[])for(const [x,y] of b.cells||[])bset.add(x+','+y);
    for(const b of project.balconies||[]){bal.n++;for(const [x,y] of b.cells||[]){const over=occ(lo,x,y);bal.area+=c2;if(over)bal.overA+=c2;else bal.cantA+=c2;
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy;if(bset.has(nx+','+ny))continue;if(occ(up,nx,ny)){if(!over){bal.contact+=c;bal.psiL+=c*(b.thermalBreak===false?.5:.15)}}else bal.rail+=c}}}
    q.balc=bal;

    // komin, schody, łazienki, tarasy
    const ch=new Set(project.structure?.chimney||[]),seen=new Set();let chimneys=0;
    for(const n of ch){if(seen.has(n))continue;chimneys++;const stack=[n];while(stack.length){const k=stack.pop();if(seen.has(k)||!ch.has(k))continue;seen.add(k);const x=k%W;if(x>0)stack.push(k-1);if(x<W-1)stack.push(k+1);stack.push(k-W,k+W)}}
    const stairs=(project.stairs||[]).length?project.stairs.map(s=>s.type):(rooms(lo).some(r=>r.id==='schody')?['straight']:[]);
    let baths=0,wcs=0;for(const r of Object.values(R)){const nm=(r.name||'').toLowerCase();if(/łazien|lazien/.test(nm))baths++;else if(/\bwc\b|toalet/.test(nm))wcs++}
    const out={terrace:0,coveredTerrace:0,pergola:0};for(const o of project.outdoorStructures||[]){let a=0;try{a=HouserModel.outdoorCells(o,c).length*c2}catch(_){a=(o.cells||[]).length*c2};if(out[o.type]!=null)out[o.type]+=a} // x,y,w,h są w metrach
    const plaster=extLen[lo]*hWall[lo]+extLen[up]*(attic?G.kneeWall:hWall[up])+2*q.partA+net[lo]+(attic?q.roofInnerA*.55:net[up]);
    Object.assign(q,{chimneys,stairs,baths,wcs,out,plaster,rooms:Object.values(R)});
    return q;
  }
  global.HouserQuantities={compute};
})(window);
