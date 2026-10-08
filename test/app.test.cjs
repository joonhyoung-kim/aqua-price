const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateCatalog, selectProducts, usablePhoto } = require('../dist/data-model.js');
const { buildCatalog } = require('../scripts/build-catalog.cjs');
// Synthetic test fixtures only; never copied into the published catalog.
const AS_OF = '2026-10-08T00:00:00.000Z';
function product(id, overrides = {}) {
  return { id, verified: true, sellerId: 'test-seller', sourceUrl: 'https://example.invalid/products/' + id, name: '테스트 ' + id, spec: '테스트 전용', type: 'live', observedAt: AS_OF, registeredAt: '2026-10-06T00:00:00.000Z', price: { amount: 1000, currency: 'KRW' }, shipping: null, cumulativeSales: null, periodSales: null, photo: { url: null, usePermission: 'unknown', permissionEvidenceUrl: null }, ...overrides };
}
function catalog(products = []) { return { schemaVersion: 1, status: 'ready', reason: '', asOf: AS_OF, sellers: [{ id: 'test-seller', name: '테스트 전용 판매처', officialUrl: 'https://example.invalid/' }], products }; }
function select(data, overrides = {}) { return selectProducts(data, { type: 'live', sort: 'low', days: 7, query: '', ...overrides }); }

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
  for (const value of ['low', 'high', 'sales', 'new']) assert.ok(html.includes(`data-sort="${value}"`));
  for (const value of [7, 30, 90]) assert.ok(html.includes(`value="${value}"`));
  assert.ok(html.indexOf('src="data-model.js"') < html.indexOf('src="app.js"'));
  assert.ok(html.includes('id="dataStatus"')); assert.ok(html.includes('id="sellerLinks"'));
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
