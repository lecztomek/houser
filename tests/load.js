// Ładuje silniki obliczeń (te same pliki co strona) do piaskownicy Node – bez przeglądarki.
const fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.join(__dirname,'..');
const FILES=['shared/house-model.js','shared/openings.js','shared/stairs.js','shared/project-store.js','shared/balconies.js','shared/quantities.js','shared/completeness.js','shared/furniture.js',
  'modules/naslonecznienie/sun.js','modules/naslonecznienie/calc.js','shared/energy.js','shared/cost.js','modules/przepisy/engine.js','modules/codziennosc/engine.js','modules/codziennosc/house.js','modules/konstrukcja/engine.js','modules/konstrukcja-dachu/engine.js','modules/garaz/engine.js','modules/dzialka/engine.js','modules/oswietlenie/engine.js','modules/rekuperacja/ducts.js','modules/schowki/equipment.js','modules/notatki/engine.js','modules/elektryka/engine.js',
  'modules/akustyka/engine.js','modules/hydraulika/engine.js','modules/schowki/engine.js','shared/hvac.js','shared/heating.js','shared/heating-system.js','shared/pv.js',
  'modules/ocieplenie/engine.js','modules/wyglad/engine.js','modules/co-poprawic/advisors.js','modules/oszczednosci/engine.js'];
function load(){
  const mem={},storage={getItem:k=>k in mem?mem[k]:null,setItem:(k,v)=>{mem[k]=String(v)},removeItem:k=>{delete mem[k]}};
  const ctx={console,Math,JSON,Date,setTimeout,clearTimeout,localStorage:storage,sessionStorage:storage,addEventListener(){},removeEventListener(){},
    document:{createElement:()=>({getContext:()=>null,style:{}}),addEventListener(){},querySelector:()=>null,querySelectorAll:()=>[]},navigator:{language:'pl-PL'},location:{hash:''}};
  ctx.window=ctx;ctx.self=ctx;ctx.top=ctx;ctx.parent=ctx;vm.createContext(ctx);
  for(const f of FILES)vm.runInContext(fs.readFileSync(path.join(ROOT,f),'utf8'),ctx,{filename:f});
  return ctx}
module.exports={load,ROOT};
