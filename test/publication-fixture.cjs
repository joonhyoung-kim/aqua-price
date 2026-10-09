'use strict';
const assert=require('node:assert/strict');
// Independent expected identities; do not import the builder's exclusion list.
const fees=[
 {
  id:'retailer-25:cafe24_sangaquamall_1_19497:default',
  title:'생물 포장비 [핫팩+스티로폼]',
  product_url:'https://sangaqua.co.kr/product/생물-포장비-핫팩스티로폼/19497/'
 },
 {
  id:'retailer-18:cafe24_weegal_1_2513:default',
  title:'[생물구매시 필수]생물안전포장비',
  product_url:'https://oqua.co.kr/product/생물구매시-필수생물안전포장비/2513/'
 }
];
function publicationItems(snapshot,catalog){
 const matches=item=>fees.some(e=>
  e.id===item.id&&e.title===item.title&&e.product_url===item.product_url);
 const excluded=snapshot.items.filter(matches);
 const included=snapshot.items.filter(item=>!matches(item));
 const metadata=catalog.publicationExclusions||[];
 assert.equal(new Set(snapshot.items.map(p=>p.id)).size,snapshot.items.length);
 assert.equal(new Set(catalog.products.map(p=>p.id)).size,catalog.products.length);
 assert.deepEqual(metadata.map(p=>p.id).sort(),excluded.map(p=>p.id).sort());
 for(const item of excluded){
  const record=metadata.find(p=>p.id===item.id);
  assert.equal(record.code,'service_fee');
  assert.equal(record.title,item.title);
  assert.equal(record.sourceUrl,item.product_url);
  assert.equal(record.originalObservedAt,item.observed_at_utc||item.snapshot_at_utc);
  assert.equal(record.reason,
   'Verified standalone packaging service fee is not a comparison product');
 }
 const publishedIds=new Set(catalog.products.map(p=>p.id));
 assert.deepEqual(
  snapshot.items.filter(p=>!publishedIds.has(p.id)).map(p=>p.id).sort(),
  excluded.map(p=>p.id).sort()
 );
 assert.deepEqual(catalog.products.map(p=>p.id),included.map(p=>p.id));
 for(let i=0;i<included.length;i++){
  const source=included[i],published=catalog.products[i];
  assert.equal(published.originalTitle,source.title);
  assert.equal(published.sourceUrl,source.product_url);
 }
 assert.equal(snapshot.summary.offer_count,snapshot.items.length);
 assert.equal(catalog.products.length+excluded.length,snapshot.items.length);
 return included;
}
module.exports={publicationItems};
