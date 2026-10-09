'use strict';
const assert=require('node:assert/strict');
function runChecks(buildCatalog, snapshot, priorCatalog, applyUpdates) {
 const ids = [
  'retailer-25:cafe24_sangaquamall_1_19497:default',
  'retailer-18:cafe24_weegal_1_2513:default'
 ].sort();
 const original = structuredClone(snapshot);
 const result = buildCatalog(snapshot);

 assert.deepEqual(snapshot, original, 'Builder mutated original source');
 assert.equal(result.products.length, snapshot.items.length - 2);
 assert.deepEqual(result.publicationExclusions.map(p => p.id).sort(), ids);
 assert(result.publicationExclusions.every(p =>
  p.code === 'service_fee' && p.reason && p.originalObservedAt));
 assert.deepEqual(
  result.products.map(p => p.id).sort(),
  priorCatalog.products.filter(p => !ids.includes(p.id)).map(p => p.id).sort()
 );
 for (const type of ['live', 'gear'])
  assert(!result.products.filter(p => p.type === type).some(p => ids.includes(p.id)));

 // A changed title, ID or URL must cease matching the exception.
 for (const id of ids) {
  const index = snapshot.items.findIndex(p => p.id === id);
  for (const change of [
   {title:'포장비닐 100매'},
   {title:'배송비 무료 생이새우 100마리'},
   {title:'핫팩 1개'},
   {title:'스티로폼 박스'},
   {title:'생이새우 100마리 생물포장비없음'},
   {title:'[야생베타] Betta simplex 베타 심플렉스 생물포장비 선택'},
   {id:id + ':changed'},
   {product_url:'https://' + snapshot.items[index].seller_domain + '/product/changed/999999/'}
  ]) {
   const changed = structuredClone(snapshot);
   changed.items[index] = {...changed.items[index], ...change};
   const catalog = buildCatalog(changed);
   assert.equal(catalog.publicationExclusions.length, 1);
   assert(catalog.products.some(p => p.id === changed.items[index].id));
  }
 }

 // Future unknown products with fee wording must not be excluded.
 const sample = snapshot.items.find(p => !ids.includes(p.id));
 for (const title of [
  '포장비닐 100매',
  '배송비 무료 생이새우 100마리',
  '생물 포장비 [핫팩+스티로폼]',
  '[생물구매시 필수]생물안전포장비'
 ]) {
  const changed = structuredClone(snapshot);
  const extra = {
   ...structuredClone(sample), id:'future:' + title, title,
   product_url:'https://' + sample.seller_domain + '/product/future/999999/'
  };
  changed.items.push(extra);
  const catalog = buildCatalog(changed);
  assert.equal(catalog.publicationExclusions.length, 2);
  assert(catalog.products.some(p => p.id === extra.id));
 }

 if (applyUpdates) {
  // Explicitly remove annotations to reconstruct the actual old gear state.
  const old = structuredClone(snapshot);
  for (const row of old.items) delete row.publication_exclusion;
  const fee = structuredClone(old.items.find(p => p.id === ids[0]));
  fee.type = 'gear';
  fee.collector_key = fee.collector_key || fee.id;
  assert.equal(fee.publication_exclusion, undefined);
  assert(old.items.every(p => p.publication_exclusion === undefined));
  const oldBefore = structuredClone(old);
  const updated = applyUpdates(old, {
   oldGear:{
    status:'success', cacheOnly:false,
    products:[fee], updatedKeys:[fee.collector_key]
   }
  });
  assert.deepEqual(old, oldBefore);
  assert.equal(updated.snapshot.items.length, old.items.length);
  assert.equal(updated.catalog.products.length, old.items.length - 2);
  for (const id of ids) {
   const before = old.items.find(p => p.id === id);
   const after = updated.snapshot.items.find(p => p.id === id);
   assert(after, 'Original fee source record removed');
   assert.equal(after.price_amount, before.price_amount);
   assert.equal(after.observed_at_utc, before.observed_at_utc);
   assert(!updated.catalog.products.some(p => p.id === id));
  }
 }
 return result;
}
const fs=require('node:fs'),path=require('node:path');
const {buildCatalog}=require('../scripts/build-catalog.cjs');
const {applyUpdates}=require('../scripts/collector/publish.cjs');
const folder=path.join(__dirname,'../dist');
runChecks(buildCatalog,
 JSON.parse(fs.readFileSync(path.join(folder,'source-snapshot.json'),'utf8')),
 JSON.parse(fs.readFileSync(path.join(folder,'catalog.json'),'utf8')),
 applyUpdates);
console.log('Service fee checks passed, including old gear republishing.');
