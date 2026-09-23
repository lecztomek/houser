// Katalog mebli w kategoriach – moduł Meblowanie (wstawianie) i Wnętrze 3D (wysokość, kształt, kolor).
// Mebel w projekcie: {id, type, label, x, y, w, h, item, z, view, color}
//   type  – typ bazowy (storage|surface|bed|seating|other) – zgodność ze starszymi plikami
//   item  – id z katalogu, z – wysokość [m], view – kształt w 3D (solid|surface|counter|bed|seating|ring)
(function(global){
  // [id, nazwa, szerokość, głębokość, wysokość, typ bazowy, kształt 3D, kolor]
  const C={
    kuchnia:{name:'Kuchnia',items:[
      ['k_dolne','Szafki dolne z blatem',1.8,.6,.9,'surface','counter','#e7e0d4'],
      ['k_narozne','Blat narożny',.9,.9,.9,'surface','counter','#e7e0d4'],
      ['k_zlew','Zlewozmywak z szafką',.8,.6,.9,'surface','counter','#dfe6ea'],
      ['k_plyta','Płyta z piekarnikiem',.6,.6,.9,'surface','counter','#374151'],
      ['k_wysokie','Zabudowa wysoka (AGD)',1.2,.6,2.2,'storage','solid','#e7e0d4'],
      ['k_lodowka','Lodówka',.6,.65,2.0,'storage','solid','#cbd5e1'],
      ['k_wyspa','Wyspa kuchenna',1.8,.9,.92,'surface','counter','#d6c7ad'],
      ['k_stol','Stół jadalniany 6 os.',1.6,.9,.76,'surface','surface','#a47148'],
      ['k_stol_ok','Stół okrągły 4 os.',1.1,1.1,.76,'surface','surface','#a47148'],
      ['k_krzeslo','Krzesło',.45,.5,.9,'seating','seating','#6b7280']]},
    salon:{name:'Salon',items:[
      ['s_sofa3','Sofa 3-osobowa',2.2,.95,.8,'seating','seating','#94a3b8'],
      ['s_naroznik','Narożnik',2.7,1.7,.8,'seating','seating','#94a3b8'],
      ['s_fotel','Fotel',.85,.85,.8,'seating','seating','#a3a3a3'],
      ['s_stolik','Stolik kawowy',1.1,.6,.42,'surface','surface','#8b6b4a'],
      ['s_rtv','Szafka RTV',1.8,.42,.5,'storage','solid','#57534e'],
      ['s_regal','Regał na książki',1.0,.35,2.0,'storage','solid','#8b6b4a'],
      ['s_kominek','Kominek / koza',.8,.6,1.2,'other','solid','#1f2937']]},
    sypialnia:{name:'Sypialnia',items:[
      ['b_160','Łóżko 160 × 200',1.6,2.1,.5,'bed','bed','#cbd5e1'],
      ['b_180','Łóżko 180 × 200',1.8,2.1,.5,'bed','bed','#cbd5e1'],
      ['b_140','Łóżko 140 × 200',1.4,2.1,.5,'bed','bed','#cbd5e1'],
      ['b_90','Łóżko pojedyncze 90',.9,2.0,.5,'bed','bed','#cbd5e1'],
      ['b_szafa','Szafa 2 m',2.0,.62,2.3,'storage','solid','#e7e0d4'],
      ['b_komoda','Komoda',1.2,.5,.9,'storage','solid','#b08968'],
      ['b_nocna','Szafka nocna',.45,.4,.55,'storage','solid','#b08968'],
      ['b_toaletka','Toaletka',1.0,.45,.76,'surface','surface','#b08968']]},
    lazienka:{name:'Łazienka',items:[
      ['l_wanna','Wanna',1.7,.75,.58,'other','solid','#f8fafc'],
      ['l_prysznic','Kabina prysznicowa',.9,.9,2.0,'other','solid','#dbeafe'],
      ['l_walkin','Prysznic walk-in',1.2,.9,.05,'other','solid','#e2e8f0'],
      ['l_umywalka','Umywalka z szafką',.8,.46,.85,'surface','counter','#f1f5f9'],
      ['l_wc','WC',.4,.65,.42,'other','solid','#f8fafc'],
      ['l_pralka','Pralka',.6,.6,.85,'storage','solid','#e5e7eb'],
      ['l_szafka','Słupek łazienkowy',.4,.35,1.8,'storage','solid','#f1f5f9']]},
    gabinet:{name:'Gabinet / pokój',items:[
      ['g_biurko','Biurko',1.4,.7,.75,'surface','surface','#b08968'],
      ['g_biurko_l','Biurko narożne',1.6,1.2,.75,'surface','surface','#b08968'],
      ['g_krzeslo','Krzesło biurowe',.6,.6,1.0,'seating','seating','#374151'],
      ['g_regal','Regał',.8,.35,1.9,'storage','solid','#8b6b4a'],
      ['g_szafa','Szafa',1.0,.6,2.1,'storage','solid','#e7e0d4']]},
    przedpokoj:{name:'Przedpokój',items:[
      ['p_szafa','Szafa wnękowa',1.8,.62,2.4,'storage','solid','#e7e0d4'],
      ['p_buty','Szafka na buty',.8,.35,1.0,'storage','solid','#d6c7ad'],
      ['p_lawka','Ławka / siedzisko',1.0,.4,.45,'seating','seating','#8b6b4a'],
      ['p_lustro','Lustro z wieszakiem',.6,.1,1.8,'other','solid','#94a3b8']]},
    techniczne:{name:'Techniczne',items:[
      ['t_kociol','Kocioł / pompa ciepła (jedn. wewn.)',.6,.6,1.8,'storage','solid','#e5e7eb'],
      ['t_cwu','Zasobnik CWU',.65,.65,1.8,'other','solid','#f1f5f9'],
      ['t_bufor','Bufor ciepła',.6,.6,1.5,'other','solid','#e2e8f0'],
      ['t_pralka','Pralka',.6,.6,.85,'storage','solid','#e5e7eb'],
      ['t_suszarka','Suszarka',.6,.6,.85,'storage','solid','#e5e7eb'],
      ['t_rekuperator','Rekuperator',.8,.6,.6,'other','solid','#cbd5e1'],
      ['t_regal','Regał metalowy',1.0,.5,1.8,'storage','solid','#9ca3af']]},
    inne:{name:'Inne',items:[
      ['o_szafa','Szafa / zabudowa (dowolna)',1.2,.6,2.2,'storage','solid','#cbd5e1'],
      ['o_blat','Blat / stół (dowolny)',1.2,.6,.8,'surface','surface','#fde68a'],
      ['o_siedzisko','Siedzisko (dowolne)',1.2,.8,.8,'seating','seating','#fecdd3'],
      ['o_inne','Inny obiekt',.8,.8,.8,'other','solid','#ddd6fe']]}
  };
  const ITEMS={};for(const [cat,c] of Object.entries(C))for(const [id,name,w,d,z,type,view,color] of c.items)ITEMS[id]={id,cat,name,w,d,z,type,view,color};
  // kolor na rzucie wg kategorii
  const CAT_FILL={kuchnia:'#fde68a',salon:'#fecdd3',sypialnia:'#bfdbfe',lazienka:'#a5f3fc',gabinet:'#ddd6fe',przedpokoj:'#e7e5e4',techniczne:'#d1d5db',inne:'#e9d5ff'};
  const TYPE_FILL={storage:'#cbd5e1',surface:'#fde68a',bed:'#bfdbfe',seating:'#fecdd3',other:'#ddd6fe'};
  function fillFor(it){const c=ITEMS[it.item];return c?CAT_FILL[c.cat]:(TYPE_FILL[it.type]||'#ddd6fe')}
  function nameFor(it){return it.label||ITEMS[it.item]?.name||({storage:'Szafa / zabudowa',surface:'Blat / stół',bed:'Łóżko',seating:'Siedzisko',other:'Inne'}[it.type])||'Mebel'}
  function create(id,x,y){const c=ITEMS[id];return {id:'f'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),type:c.type,label:'',item:c.id,x,y,w:c.w,h:c.d,z:c.z,view:c.view,color:c.color}}
  global.HouserFurniture={CATEGORIES:C,ITEMS,CAT_FILL,fillFor,nameFor,create};
})(window);
