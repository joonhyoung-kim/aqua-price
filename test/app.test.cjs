const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const AquaCatalog = require('../dist/data-model.js');
const { validateCatalog, selectProducts, usablePhoto } = require('../dist/data-model.js');
const { buildCatalog } = require('../scripts/build-catalog.cjs');
// Synthetic test fixtures only; never copied into the published catalog.
const AS_OF = '2026-10-08T00:00:00.000Z';
function product(id, overrides = {}) {
  return { id, verified: true, sellerId: 'test-seller', sourceUrl: 'https://example.invalid/products/' + id, name: '테스트 ' + id, spec: '테스트 전용', type: 'live', observedAt: AS_OF, registeredAt: '2026-10-06T00:00:00.000Z', price: { amount: 1000, currency: 'KRW' }, shipping: null, cumulativeSales: null, periodSales: null, photo: { url: null, usePermission: 'unknown', permissionEvidenceUrl: null }, ...overrides };
}
function catalog(products = []) { return { schemaVersion: 1, status: 'ready', reason: '', asOf: AS_OF, sellers: [{ id: 'test-seller', name: '테스트 전용 판매처', officialUrl: 'https://example.invalid/' }], products }; }
function select(data, overrides = {}) { return selectProducts(data, { type: 'live', sort: 'low', days: 7, query: '', ...overrides }); }

test('first entry includes every livestock subtype and valid URL overrides persist', () => {
  const defaults=AquaCatalog.filtersFromSearch('');
  assert.equal(defaults.type,'live');assert.equal(defaults.subtype,'all');assert.equal(defaults.days,'all');
  const data=catalog(['fish','shrimp','aquatic_plant','snail'].map(s=>product(s,{subtype:s})));
  assert.equal(selectProducts(data,defaults).rows.length,4);
  const explicit=AquaCatalog.filtersFromSearch('?type=gear&subtype=shrimp&sort=high&days=30&q=abc&includeUnknown=false');
  assert.deepEqual(explicit,{...defaults,type:'gear',subtype:'shrimp',sort:'high',days:30,query:'abc',includeUnknownRegistration:false});
  assert.deepEqual(AquaCatalog.filtersFromSearch('?type=bad&subtype=bad&sort=bad&days=1'),defaults);
});
test('detailed livestock groups reject substring traps and contradictory composite names',()=>{
 const group=(name,subtype='fish',extra={})=>AquaCatalog.livestockGroup(product(name,{name,originalTitle:name,subtype,...extra}));
 assert.equal(group('플래티넘 화이트 몰리'),'molly');assert.equal(group('Platinum White'),'other');
 assert.equal(group('브로치 코리도라스 3cm'),'cory');assert.equal(group('리코리스구라미'),'gourami');
 assert.equal(group('Carinotetraodon 인디언 복어'),'puffer');assert.equal(group('구피 테트라 혼합 세트'),'other');
 assert.equal(group('타비아 캣피쉬밥(코리) 65g'),'other');
 assert.equal(group('[비쉬림프] 야마토 새우','shrimp'),'shrimp_yamato');
 assert.equal(group('[생이새우] 블루벨벳 쉬림프','shrimp'),'shrimp_blue');
 assert.equal(group('노랑 빨강 파랑 생이새우 3종세트','shrimp'),'shrimp_mix');
 assert.equal(group('로탈라 루드위지아 혼합','aquatic_plant'),'other');
 assert.equal(group('어항청소 우렁이 애플스네일','snail'),'snail_apple');
 assert.equal(group('모르는 이름','fish',{type:'gear'}),null);
});
test('numeric retailer categories use identity-linked labels and conflicts remain unclassified',()=>{
 const evidence=label=>({label,url:'https://example.invalid/product/list.html?cate_no=1',evidencePage:'https://example.invalid/',observedAt:AS_OF});
 const p=product('mystery',{name:'알비노 풀레드',subtype:'fish',discoveryCategoryUrl:evidence('구피').url,observedCategoryLabels:[evidence('구피')]});
 validateCatalog(catalog([p]));assert.equal(AquaCatalog.fishGroup(p),'guppy');
 p.observedCategoryLabels.push(evidence('베타'));assert.equal(AquaCatalog.fishGroup(p),'other');
 p.observedCategoryLabels[0].url='https://unrelated.invalid/';assert.throws(()=>validateCatalog(catalog([p])),/카테고리 근거/);
});
test('live group URLs and sorting/windows intersect without excluding other groups from all view',()=>{
 const defaults=AquaCatalog.filtersFromSearch('?subtype=shrimp&liveGroup=shrimp_blue&sort=high&days=7');
 assert.equal(defaults.liveGroup,'shrimp_blue');
 const data=catalog([product('blue',{subtype:'shrimp',name:'블루벨벳 새우'}),product('red',{subtype:'shrimp',name:'체리새우'}),product('old',{subtype:'shrimp',name:'블루벨벳 새우',registeredAt:'2025-01-01T00:00:00.000Z'})]);
 assert.deepEqual(selectProducts(data,defaults).rows.map(p=>p.id),['blue']);
 assert.equal(selectProducts(data,{...defaults,days:'all'}).rows.length,2);
 assert.equal(selectProducts(data,{...defaults,subtype:'all',liveGroup:'all',days:'all'}).rows.length,3);
 assert.equal(AquaCatalog.filtersFromSearch('?subtype=snail&liveGroup=shrimp_blue').liveGroup,'all');
  assert.equal(AquaCatalog.filtersFromSearch('?fishGroup=guppy').subtype,'fish');
  assert.equal(AquaCatalog.filtersFromSearch('?subtype=fish&liveGroup=guppy').fishGroup,'guppy');
 assert.throws(()=>selectProducts(data,{...defaults,liveGroup:'plant_rotala'}),/세부 분류/);
});
test('URL serialization preserves unrelated parameters and reloads every selected filter',()=>{
 const filters={...AquaCatalog.defaultFilters,subtype:'aquatic_plant',liveGroup:'plant_rotala',sort:'observed',days:30,query:'로타라',includeUnknownRegistration:false};
 const search=AquaCatalog.filtersToSearch(filters,'?campaign=demo&fishGroup=guppy&q=old');
 assert.equal(new URLSearchParams(search).get('campaign'),'demo');assert.equal(new URLSearchParams(search).has('q'),false);
 assert.deepEqual(AquaCatalog.filtersFromSearch(search),filters);
 assert.equal(AquaCatalog.filtersToSearch({...AquaCatalog.defaultFilters},search),'?campaign=demo');
});
test('retailer category enrichment requires observed product membership and keeps original facts',()=>{
 const {enrichCategoryEvidence}=require('../scripts/collector/publish.cjs');
 const item={id:'fixture',type:'live',source_id:'fixture',seller_domain:'example.invalid',product_url:'https://example.invalid/product/fish/1/',price_amount:1234};
 const node={key:'example.invalid:10',url:'https://example.invalid/category/fish/10/',label:'베타',scope:'live',evidencePage:'https://example.invalid/',evidenceObservedAt:AS_OF};
 const state={fixture:{categoryTree:{nodes:[node]},dailyDiscovery:{cursor:{categories:{[node.key]:{seenKeys:[]}}}}}};
 enrichCategoryEvidence([item],state);assert.equal(item.observed_category_evidence,undefined);
 state.fixture.dailyDiscovery.cursor.categories[node.key].seenKeys=['example.invalid:1'];enrichCategoryEvidence([item],state);
 assert.equal(item.observed_category_evidence[0].label,'베타');assert.equal(item.price_amount,1234);
});
test('actual catalog subgroup partition conserves every livestock row and representative identities',()=>{
 const data=require('../dist/catalog.json');
 for(const [subtype,groups]of Object.entries(AquaCatalog.livestockGroups)){
  const rows=data.products.filter(p=>p.subtype===subtype),counts=Object.fromEntries(Object.keys(groups).filter(k=>k!=='all').map(k=>[k,0]));
  for(const p of rows){const key=AquaCatalog.livestockGroup(p);assert.ok(Object.hasOwn(counts,key));counts[key]++;}
  assert.equal(Object.values(counts).reduce((a,b)=>a+b,0),rows.length);
 }
 for(const [title,key]of [['플래티넘 화이트 마블 라이어테일','molly'],['리코리스구라미','gourami'],['브로치 코리도라스','cory'],['블루벨벳 새우','shrimp_blue'],['부세 파란드라','plant_buce'],['애플스네일','snail_apple']]){
  const sample=data.products.find(p=>p.name.includes(title));assert.ok(sample,title);assert.equal(AquaCatalog.livestockGroup(sample),key,sample.name);
 }
});
test('all-time sales ranks actual cumulative counts including zero and excludes unknowns', () => {
  const data=catalog([product('unknown'),product('zero',{cumulativeSales:0}),product('five',{cumulativeSales:5}),product('periodOnly',{periodSales:{count:99,startAt:'2026-10-01T00:00:00.000Z',endAt:AS_OF}})]);
  const result=select(data,{sort:'sales',days:'all'});
  assert.deepEqual(result.rows.map(p=>p.id),['five','zero']);assert.equal(result.excludedSales,2);
  assert.deepEqual(select(data,{sort:'sales',days:7}).rows.map(p=>p.id),['periodOnly']);
  assert.equal(AquaCatalog.sortAvailability(data,{...AquaCatalog.defaultFilters}).sales.available,true);
});
test('recent observation sorting is distinct from registration and obeys registration windows', () => {
  const data=catalog([product('observedLatest',{registeredAt:null}),product('registeredLatest',{registeredAt:'2026-10-07T00:00:00.000Z',observedAt:'2026-10-07T12:00:00.000Z'})]);
  assert.deepEqual(select(data,{sort:'observed',days:'all'}).rows.map(p=>p.id),['observedLatest','registeredLatest']);
  assert.deepEqual(select(data,{sort:'new',days:'all'}).rows.map(p=>p.id),['registeredLatest']);
  assert.deepEqual(select(data,{sort:'observed',days:7,includeUnknownRegistration:false}).rows.map(p=>p.id),['registeredLatest']);
});

test('published catalog preserves the supplied verified items, categories and unknown facts', () => {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../dist/catalog.json'), 'utf8'));
  validateCatalog(data);
  const snapshot = JSON.parse(fs.readFileSync(path.join(__dirname, '../dist/source-snapshot.json'), 'utf8'));
  assert.equal(data.status, 'ready'); assert.equal(data.products.length, snapshot.summary.offer_count); assert.equal(data.sellers.length, snapshot.summary.merchant_count);
  assert.equal(data.products.filter(p => p.subtype === 'aquatic_plant').length, snapshot.summary.live_plant_count);
  assert.equal(data.products.filter(p => p.type === 'gear').length, snapshot.summary.gear_count);
  assert.equal(data.products.filter(p => p.subtype === 'fish').length, snapshot.summary.fish_count); assert.equal(data.products.filter(p => p.subtype === 'shrimp').length, snapshot.summary.shrimp_count); assert.equal(data.products.filter(p => p.subtype === 'snail').length, snapshot.summary.snail_count);
  for (const [index, p] of data.products.entries()) {
    assert.equal(p.id, snapshot.items[index].id); assert.equal(p.originalTitle, snapshot.items[index].title);
    assert.equal(p.sourceUrl, snapshot.items[index].product_url); assert.equal(p.price.amount, snapshot.items[index].price_amount);
    assert.equal(p.photo.url, snapshot.items[index].photo?.verified_https_url ?? null);
    assert.equal(p.observedAt, snapshot.items[index].observed_at_utc);
    assert.equal(p.registeredAt, null); assert.equal(p.shipping, null); assert.equal(p.periodSales, null); assert.equal(p.cumulativeSales, null);
    assert.equal(new URL(p.sourceUrl).hostname.replace(/^www\./,''), p.sellerId); assert.equal(p.photo.permissionScope, p.photo.url ? (p.sourceKind === 'direct_retailer_product_page' ? 'product-comparison' : 'api-catalog-comparison') : null);
    assert.equal(p.photo.generalRepublicationLicenseVerified, false);
  }
  assert.deepEqual(select(data).rows, []);
  const displayed = select(data, { type: 'gear', includeUnknownRegistration: true });
  assert.equal(displayed.rows.length, snapshot.summary.gear_count);
  assert.deepEqual(displayed.rows.map(p => p.price.amount), snapshot.items.filter(p => p.type === 'gear').map(p => p.price_amount).sort((a,b) => a-b));
});
test('pending state contains no products and explains unavailable data', () => {
  const pending = { schemaVersion: 1, status: 'pending', reason: '아직 제공되지 않음', asOf: null, sellers: [], products: [] };
  assert.deepEqual(select(pending).rows, []); assert.match(select(pending).reason, /아직 제공되지/);
});
test('observation never substitutes for missing or old registration date', () => {
  const result = select(catalog([product('unknown', { registeredAt: null }), product('old', { registeredAt: '2025-01-01T00:00:00.000Z' }), product('known')]));
  assert.deepEqual(result.rows.map(p => p.id), ['known']); assert.equal(result.excludedRegistration, 1);
});
test('unknown registration opt-in keeps items visible without declaring them recent', () => {
  const data = catalog([product('unknown', { registeredAt: null }), product('old', { registeredAt: '2025-01-01T00:00:00.000Z' })]);
  const result = select(data, { includeUnknownRegistration: true });
  assert.deepEqual(result.rows.map(p => p.id), ['unknown']); assert.equal(result.includedUnknownRegistration, 1);
  assert.deepEqual(select(data, { includeUnknownRegistration: false }).rows, []);
  assert.deepEqual(select(data, { includeUnknownRegistration: true, sort: 'new' }).rows, []);
  assert.match(select(data, { includeUnknownRegistration: true, sort: 'new' }).reason, /登録|등록일/);
});
test('7/30/90 registration windows include boundary and keep category exclusive', () => {
  const data = catalog([product('day7', { registeredAt: '2026-10-01T00:00:00.000Z' }), product('day30', { registeredAt: '2026-09-08T00:00:00.000Z' }), product('day90', { registeredAt: '2026-07-10T00:00:00.000Z' }), product('gear', { type: 'gear' })]);
  assert.deepEqual(select(data).rows.map(p => p.id), ['day7']);
  assert.equal(select(data, { days: 30 }).rows.length, 2);
  assert.equal(select(data, { days: 90 }).rows.length, 3);
  assert.deepEqual(select(data, { type: 'gear' }).rows.map(p => p.id), ['gear']);
});
test('price sorting, newest sorting and case-insensitive trimmed search', () => {
  const data = catalog([product('a', { name: 'LED A', price: { amount: 5000, currency: 'KRW' } }), product('b', { name: 'LED B', price: { amount: 1000, currency: 'KRW' }, registeredAt: '2026-10-07T00:00:00.000Z' })]);
  assert.deepEqual(select(data).rows.map(p => p.id), ['b', 'a']);
  assert.deepEqual(select(data, { sort: 'high' }).rows.map(p => p.id), ['a', 'b']);
  assert.deepEqual(select(data, { sort: 'new' }).rows.map(p => p.id), ['b', 'a']);
  assert.equal(select(data, { query: '  led  ' }).rows.length, 2);
  assert.equal(select(data, { query: '없음' }).rows.length, 0);
});
test('unknown price is excluded from price ranking, zero price and free shipping remain known', () => {
  const data = catalog([product('unknown', { price: null }), product('free', { price: { amount: 0, currency: 'KRW' }, shipping: { amount: 0, currency: 'KRW' } })]);
  assert.deepEqual(select(data).rows.map(p => p.id), ['free']); assert.equal(select(data).excludedPrice, 1);
  assert.equal(select(data, { sort: 'new' }).rows.length, 2);
  assert.equal(data.products[0].shipping, null); assert.equal(data.products[1].shipping.amount, 0);
});
test('cumulative sales and other sales windows cannot rank selected-period sales', () => {
  const data = catalog([product('cumulative', { cumulativeSales: 9999 }), product('different', { periodSales: { count: 999, startAt: '2026-09-08T00:00:00.000Z', endAt: AS_OF } }), product('matching', { periodSales: { count: 2, startAt: '2026-10-01T00:00:00.000Z', endAt: AS_OF } })]);
  const result = select(data, { sort: 'sales' });
  assert.deepEqual(result.rows.map(p => p.id), ['matching']); assert.equal(result.excludedSales, 2);
  assert.deepEqual(select(catalog([data.products[0]]), { sort: 'sales' }).rows, []);
});
test('period-sales ranking uses only the exact interval including zero count', () => {
  const sales = count => ({ count, startAt: '2026-10-01T00:00:00.000Z', endAt: AS_OF });
  const data = catalog([product('zero', { periodSales: sales(0) }), product('five', { periodSales: sales(5) })]);
  assert.deepEqual(select(data, { sort: 'sales' }).rows.map(p => p.id), ['five', 'zero']);
});
test('photos require explicit permission and evidence; unknown is never loaded', () => {
  const p = product('photo', { photo: { url: 'https://example.invalid/image.jpg', usePermission: 'unknown', permissionEvidenceUrl: null } });
  validateCatalog(catalog([p])); assert.equal(usablePhoto(p), null);
  p.photo.usePermission = 'not_allowed'; assert.equal(usablePhoto(p), null);
  p.photo.usePermission = 'allowed'; assert.throws(() => validateCatalog(catalog([p])), /근거/);
  p.photo.permissionEvidenceUrl = 'https://example.invalid/license'; validateCatalog(catalog([p])); assert.equal(usablePhoto(p), p.photo.url);
});
test('missing provenance, unsafe URLs, invalid dates and unverified products fail validation', () => {
  for (const overrides of [{ sourceUrl: 'javascript:alert(1)' }, { sourceUrl: 'https://user:secret@example.invalid/x' }, { verified: false }, { sellerId: 'missing' }, { observedAt: '2026-10-09T00:00:00.000Z' }, { registeredAt: '2026-02-30T00:00:00.000Z' }, { price: { amount: -1, currency: 'KRW' } }, { cumulativeSales: -1 }]) assert.throws(() => validateCatalog(catalog([product('bad', overrides)])));
  assert.throws(() => validateCatalog(catalog([product('same'), product('same')])));
});
test('all required unknown fields must be explicit, pending data cannot contain products', () => {
  for (const field of ['registeredAt', 'price', 'shipping', 'cumulativeSales', 'periodSales', 'photo']) {
    const p = product('missing'); delete p[field]; assert.throws(() => validateCatalog(catalog([p])));
  }
  const data = catalog([product('pending')]); data.status = 'pending'; assert.throws(() => validateCatalog(data));
});
test('UI controls, data script order and honest status exist in HTML', () => {
  const html = fs.readFileSync(path.join(__dirname, '../dist/index.html'), 'utf8');
  for (const value of ['live', 'gear']) assert.ok(html.includes(`data-type="${value}"`));
  const sortSelect=html.match(/<select id="sort"[^>]*>([\s\S]*?)<\/select>/)?.[1];assert.ok(sortSelect);
  for (const value of ['low', 'high', 'sales', 'new', 'observed']) assert.ok(sortSelect.includes(`value="${value}"`));
  assert.ok(html.includes('<label for="sort" class="label">'));assert.ok(html.indexOf('id="sort"')<html.indexOf('id="period"'));assert.ok(!html.includes('data-sort='));
  for (const value of [7, 30, 90]) assert.ok(html.includes(`value="${value}"`));
  assert.ok(html.indexOf('src="data-model.js"') < html.indexOf('src="app.js"'));
  assert.ok(html.includes('id="dataStatus"')); assert.ok(html.includes('id="moreResults"'));
});
test('expanded snapshot deduplicates sellers and requires explicit category for new items', () => {
  const snapshot = JSON.parse(fs.readFileSync(path.join(__dirname, '../dist/source-snapshot.json'), 'utf8'));
  const next = structuredClone(snapshot.items[1]); next.id = 'SYNTHETIC-TEST-ONLY'; next.type = 'live'; next.title = 'TEST LIVESTOCK'; next.photo = null;
  snapshot.items.push(next);
  const result = buildCatalog(snapshot);
  assert.equal(result.sellers.length, snapshot.summary.merchant_count); assert.equal(result.products.length, snapshot.summary.offer_count + 1);
  assert.equal(result.products.at(-1).type, 'live'); assert.equal(result.products.at(-1).name, 'TEST LIVESTOCK');
  assert.equal(result.products.at(-1).photo.url, null); assert.equal(result.products.at(-1).registeredAt, null);
  delete next.type; assert.throws(() => buildCatalog(snapshot), /검증된 live\/gear/);
});
test('2,000-item filtering and price sorting meet a one-second local processing budget', () => {
  const { performance } = require('node:perf_hooks');
  const data = catalog(Array.from({ length: 2000 }, (_, i) => product('test-' + i, { registeredAt: null, price: { amount: 2000 - i, currency: 'KRW' } })));
  const start = performance.now();
  const result = select(data, { includeUnknownRegistration: true });
  const elapsed = performance.now() - start;
  assert.equal(result.rows.length, 2000); assert.equal(result.rows[0].price.amount, 1); assert.equal(result.rows.at(-1).price.amount, 2000);
  assert.ok(elapsed < 1000, `processing ${elapsed.toFixed(1)} ms`);
  console.log(`2,000-item filtering/sorting: ${elapsed.toFixed(1)} ms (Node only; browser painting not measured)`);
});

test('livestock filters use verified subtype, never infer category from title, and reject invalid filters',()=>{
 const data=catalog([product('plant',{subtype:'aquatic_plant'}),product('fish',{subtype:'fish'}),product('shrimp',{subtype:'shrimp'}),product('snail',{subtype:'snail'}),product('unknown',{name:'물고기 새우 달팽이 수초',subtype:null})]);
 for(const subtype of ['fish','shrimp','aquatic_plant','snail']) assert.deepEqual(select(data,{subtype}).rows.map(p=>p.id),[subtype==='aquatic_plant'?'plant':subtype]);
 assert.equal(select(data).rows.length,5);
 assert.throws(()=>select(data,{subtype:'unknown'}),/잘못된 조회 조건/);
 const absent=select(catalog([product('plant',{subtype:'aquatic_plant'})]),{subtype:'fish'}); assert.deepEqual(absent.rows,[]); assert.match(absent.reason,/현재 연결된 상품정보/);
});

test('direct retailer evidence is separate from API and six livestock photos use verified original URLs',()=>{
 const data=JSON.parse(fs.readFileSync(path.join(__dirname,'../dist/catalog.json'),'utf8'));
 const direct=data.products.filter(p=>p.sourceKind==='direct_retailer_product_page'); const snapshot=JSON.parse(fs.readFileSync(path.join(__dirname,'../dist/source-snapshot.json'),'utf8')); assert.equal(direct.length,snapshot.items.filter(p=>p.source_kind==='direct_retailer_product_page').length); assert.equal(data.products.length,snapshot.items.length); assert.equal(data.sellers.length,new Set(snapshot.items.map(p=>p.seller_domain)).size);
 assert.equal(data.products.filter(p=>p.sourceKind==='cafe24_global_catalog_api').length,snapshot.items.filter(p=>!p.source_kind).length); assert.equal(data.products.filter(p=>p.photo.url).length,snapshot.items.filter(p=>p.photo?.verified_https_url).length);
 for(const p of direct){if(p.photo.url){assert.ok(p.photo.url.startsWith('https://'));assert.equal(p.photo.usePermission,'allowed');assert.equal(p.photo.permissionEvidenceUrl,p.sourceUrl);assert.equal(p.photo.permissionBasis,'explicit_user_instruction');}else assert.equal(p.photo.usePermission,'unknown');assert.equal(p.registeredAt,null);assert.equal(p.shipping,null);assert.equal(p.periodSales,null);assert.match(p.availabilityBasis,/checkout|not supplied|not verified/);assert.equal(typeof p.verificationMethod,'string');}
});

test('all period includes old and unknown registration without fabricating dates or all-time sales',()=>{
 const data=catalog([product('old',{registeredAt:'2020-01-01T00:00:00.000Z'}),product('unknown',{registeredAt:null})]);const result=select(data,{days:'all',includeUnknownRegistration:false});assert.equal(result.rows.length,2);assert.equal(result.startAt,null);assert.equal(result.rows.find(p=>p.id==='unknown').registeredAt,null);assert.equal(select(data,{days:'all',sort:'new'}).rows.length,1);assert.equal(select(data,{days:'all',sort:'sales'}).rows.length,0);
});

test('fish family classification never promotes feed or unknown product types',()=>{
 const p={verified:true,type:'live',subtype:'fish',name:'옐로우 구피',originalTitle:''};assert.equal(AquaCatalog.fishGroup(p),'guppy');
 assert.equal(AquaCatalog.fishGroup({...p,name:'플레티'}),'platy');assert.equal(AquaCatalog.fishGroup({...p,name:'블랙 몰리'}),'molly');
 assert.equal(AquaCatalog.fishGroup({...p,name:'구피 사료',type:'gear'}),null);assert.equal(AquaCatalog.fishGroup({...p,name:'구피 사료'}),'other');
 assert.equal(AquaCatalog.fishGroup({...p,subtype:undefined}),null);assert.equal(AquaCatalog.fishGroup({...p,name:'미분류 물고기'}),'other');
});
