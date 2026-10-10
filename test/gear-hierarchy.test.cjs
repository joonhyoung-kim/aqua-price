'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const A=require('../dist/data-model.js'),T=require('../dist/gear-taxonomy.js');
const actual=require('../dist/catalog.json');
const item=(name,extra={})=>({verified:true,type:'gear',name,originalTitle:name,...extra});

test('gear taxonomy has unique, exhaustive leaves and no overlapping parent ownership',()=>{
 const leaves=T.navigation.flatMap(g=>Object.keys(g.children));
 assert.equal(new Set(leaves).size,leaves.length);
 assert.deepEqual(new Set(leaves),new Set(Object.keys(T.groups).filter(k=>!['all','other'].includes(k))));
 for(const node of T.navigation)for(const key of Object.keys(node.children))assert.equal(T.parent(key).key,node.key);
});

test('real retailer title regression cases separate refills, media, medicine, food and equipment',()=>{
 const cases=[
  ['스펀지여과기 + 활성탄 증정','filter_sponge'],['스펀지여과기 사료 증정','filter_sponge'],
  ['외부여과기 겸용 호스','filter_parts'],['측면여과기 겸용 교체 스펀지','media_sponge'],
  ['외부여과기용 호스 2m','filter_parts'],['외부여과기 흡입구','filter_parts'],
  ['일체형 외부여과기','filter_external'],['어항 세트용 LED 조명','light_led'],
  ['SM 걸이식여과기 리필 필터 [소]','media_other'],
  ['에하임 외부여과기 임펠라 [2026/2028] 공용','filter_parts'],
  ['크랩 섭스볼 여과재 스펀지 여과기 CAF-012-82','filter_sponge'],
  ['외부여과기용 자외선 살균램프 11W','sterilizer'],
  ['생물학적 여과재 세라믹 링','media_bio'],
  ['생물 여과재','media_bio'],
  ['MANITO 8D 폴리나젤 여과 필터 30x30cm','media_sponge'],
  ['스펀지여과기 교체용 스펀지','media_sponge'],
  ['칸후 SF-0000 여과기 프리필터 (소)','filter_other'],
  ['API No2 테스트킷','water_test'],['API 멜라픽스','medication'],
  ['MANITO 갑각류전용 포션 물갈이제 비타민 염소제거제 100ml','conditioner'],
  ['MANITO 구피 사료 20g','feed_dry'],['사료 보관통','feeding_equipment'],
  ['새우 먹이통','feeding_equipment'],['AEM 6L 수질 완충 드립 배럴(환수통)','water_change'],
  ['MANITO 거북이 해태 석상','ornament'],['8point 뚜껑 받침대','tank_parts'],
  ['탄토라 나노 알몬드잎','water_adjuster'],['황호석3kg 수조장식 수석 어항돌','hardscape_stone'],
  ['아마존 걸이식 및 외부겸용 여과기','filter_other'],
  ['BMP 배면 섬프 일체형 어항 수조 LED 조명 포함','tank_set'],
  ['수조 스크래퍼 청소솔','cleaning'],['수초용 핀셋 30cm','plant_tools'],
  ['어항 받침대','tank_stand'],['바닥재 청소기','water_change'],['알테미아 부화기','feeding_equipment'],
  ['CO2 확산기 세트','co2_parts'],['히터 온도 조절기','temperature_controller'],
 ];
 for(const [title,key] of cases)assert.equal(T.classification(item(title)).key,key,title);
});

test('full category evidence disambiguates identical leaves and broad conflicting menus stay unknown',()=>{
 const category=label=>({observedCategoryLabels:[{label}]});
 assert.equal(T.classification(item('스펀지여과기',category('여과기 > 여과기 부품 > 교체용여과재 > 스펀지여과기'))).key,'media_sponge');
 assert.equal(T.classification(item('외부여과기',category('여과기 > 여과기 부품 > 교체용여과재 > 외부여과기'))).key,'media_other');
 assert.equal(T.classification(item('스펀지여과기',category('여과기 > 스펀지여과기'))).key,'filter_sponge');
 assert.equal(T.classification(item('스펀지여과기',{observedCategoryLabels:[{label:'스펀지여과기',ancestorLabels:['여과기','여과기 부품','교체용여과재']}]})).key,'media_sponge');
 assert.equal(T.classification(item('모델 123',category('LED 조명'))).key,'light_led');
 assert.equal(T.classification(item('모델 123',category('약품 / 테스터'))).key,'other');
 assert.equal(T.classification(item('모델 123',{observedCategoryLabels:[{label:'히터'},{label:'조명'}]})).key,'other');
 assert.equal(T.classification(item('모델 123',{sellerId:'famous-filter-shop',discoveryCategoryUrl:'https://example.invalid/category/196/'})).key,'other');
 assert.equal(T.classification(item('모델 123',{discoveryCategoryUrl:'https://example.invalid/category/Light-(조명)/532/'})).key,'light_other');
});

test('unverified and livestock products are never retyped and gifted food is not the primary product',()=>{
 assert.equal(T.classification(item('스펀지 여과기',{verified:false})),null);
 assert.equal(T.classification(item('구피',{type:'live'})),null);
 for(const title of ['생이새우 100 마리 + 전용사료증정 생물포장비없음','관찰용 물벼룩 500~1000 마리','[야생베타] Betta simplex 생물포장비'])assert.equal(T.classification(item(title)).key,'other');
});

test('all actual gear rows partition exactly once without modifying facts, live classification or prices',()=>{
 const before=JSON.stringify(actual),query=A.createCatalogQuery(actual),filters={...A.defaultFilters,type:'gear'};
 const all=query.view(filters),rows=all.result.rows;
 assert.equal(all.gearCounts.all,rows.length);
 assert.equal(Object.values(all.gearCounts.categories).reduce((a,b)=>a+b,0),rows.length);
 assert.equal(Object.values(all.gearCounts.groups).reduce((a,b)=>a+b,0),rows.length);
 for(const category of Object.keys(A.gearCategories).filter(k=>k!=='all')){
  const selected=query.select({...filters,gearCategory:category});
  assert.equal(selected.rows.length,all.gearCounts.categories[category]);
  for(const p of selected.rows)assert.equal(A.gearClassification(p).category,category);
 }
 for(const p of actual.products.filter(p=>p.type==='live'))assert.equal(A.gearGroup(p),null);
 assert.equal(JSON.stringify(actual),before);
});

test('gear parent and leaf filters round trip and invalid or contradictory URLs recover safely',()=>{
 const filter=A.filtersFromSearch('?type=gear&gearGroup=heater&sort=high&query=50w');
 assert.equal(filter.gearCategory,'temperature');assert.equal(filter.gearGroup,'heater');
 assert.deepEqual(A.filtersFromSearch(A.filtersToSearch(filter)),filter);
 assert.equal(A.filtersFromSearch('?type=gear&gearCategory=lighting&gearGroup=heater').gearGroup,'all');
 assert.equal(A.filtersFromSearch('?type=gear&gearCategory=bogus&gearGroup=bogus').gearCategory,'all');
 assert.throws(()=>A.createCatalogQuery(actual).select({...A.defaultFilters,type:'gear',gearCategory:'lighting',gearGroup:'heater'}));
});

test('gear cache and uncached queries agree across leaf, date, price and search filters',()=>{
 const q=A.createCatalogQuery(actual);
 for(const group of ['all','filter_internal','light_other','other'])for(const sort of ['low','high','new','sales','observed']){
  const category=group==='all'?'all':A.gearParent(group)?.key||'other';
  const f={...A.defaultFilters,type:'gear',gearCategory:category,gearGroup:group,sort,query:''};
  assert.deepEqual(q.view(f).result,A.selectProducts(actual,f));
  assert.deepEqual(q.select(f),A.selectProducts(actual,f));
  const expected=q.select({...f,gearCategory:'all',gearGroup:'all',sort:['new','sales'].includes(sort)?'low':sort});
  assert.deepEqual(q.view(f).base,expected);
 }
});

test('browser script dependencies load taxonomy before model and keep native buttons accessible',()=>{
 const html=fs.readFileSync('dist/index.html','utf8'),js=fs.readFileSync('dist/app.js','utf8');
 assert.ok(html.indexOf('src="gear-taxonomy.js"')<html.indexOf('src="data-model.js"'));
 assert.match(js,/data-gear-browse=.*aria-expanded/);assert.match(js,/data-gear-group=.*aria-pressed/);
 assert.match(html,/@media\(max-width:760px\)/);assert.match(html,/grid-template-columns:1fr/);
 assert.match(fs.readFileSync('scripts/serve.cjs','utf8'),/['"]\/gear-taxonomy\.js['"]:/);
});
