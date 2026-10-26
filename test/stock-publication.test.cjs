'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {buildCatalog}=require('../scripts/build-catalog.cjs');
const {applyUpdates}=require('../scripts/collector/publish.cjs');
const {confirmedAvailability}=require('../scripts/collector/stock-policy.cjs');
const {parseProductPage}=require('../scripts/collector/product-jsonld.cjs');
const {adminStatus}=require('../scripts/build-admin-status.cjs');
const base=require('./isolated-snapshot.cjs')();
const basis=value=>`Retailer JSON-LD ${value?'InStock':'OutOfStock'}; not checkout-confirmed inventory`;
const row=(id,available,extra={})=>({...base.items[0],id,collector_key:id,available,availability_basis:typeof available==='boolean'?basis(available):'Availability not supplied',...extra});
const snapshot=items=>({...structuredClone(base),items});
test('confirmed sold out is excluded across domains; unknown and unsupported false are preserved',()=>{
 const items=[row('out',false),row('in',true),row('unknown',null),row('unsupported',false,{availability_basis:'unverified'}),row('other-out',false,{seller_domain:'second.invalid',product_url:'https://second.invalid/p'})];
 const input=snapshot(items),copy=structuredClone(input),result=buildCatalog(input);
 assert.deepEqual(result.products.map(p=>p.id),['in','unknown','unsupported']);
 assert.equal(result.publicationExclusions.length,2);assert.deepEqual(input,copy);
 assert.equal(confirmedAvailability({...items[0],availability_conflict:true}),null);
});
test('options are independent and confirmed restock returns the exact offer',()=>{
 const out=row('sku-A',false,{variant_id:'A'}),available=row('sku-B',true,{variant_id:'B'}),input=snapshot([out,available]);
 assert.deepEqual(buildCatalog(input).products.map(p=>p.id),['sku-B']);
 const update={...out,available:true,availability_basis:basis(true),observed_at_utc:'2026-01-02T00:00:00Z'};
 const result=applyUpdates(input,{source:{status:'success',products:[update],updatedKeys:['sku-A']}});
 assert.deepEqual(result.catalog.products.map(p=>p.id),['sku-A','sku-B']);assert.equal(result.snapshot.items.length,2);
});
test('unknown refresh keeps last confirmed stock hold; errors and missing receipts cannot delete offers',()=>{
 const old=row('held',false),input=snapshot([old,row('visible',true)]);
 const update={...old,available:null,availability_basis:'Availability not supplied',observed_at_utc:'2026-01-02T00:00:00Z'};
 const held=applyUpdates(input,{source:{status:'partial_failure',products:[update],updatedKeys:['held']}});
 assert.equal(held.snapshot.items[0].available,false);assert.equal(held.snapshot.items[0].availability_last_confirmed_at_utc,old.observed_at_utc);
 assert.equal(held.snapshot.items[0].availability_latest_check.state,'unconfirmed');assert.deepEqual(held.catalog.products.map(p=>p.id),['visible']);
 for(const state of [{status:'parse_failed',products:[]},{status:'success',products:[update],updatedKeys:[]}]){
  const result=applyUpdates(input,{source:state});assert.equal(result.snapshot.items.length,2);assert.deepEqual(result.catalog.products.map(p=>p.id),['visible']);
 }
 const restored=applyUpdates(held.snapshot,{source:{status:'success',products:[{...update,available:true,availability_basis:basis(true)}],updatedKeys:['held']}});
 assert.equal(restored.catalog.products.length,2);assert.equal(restored.snapshot.items[0].availability_latest_check,undefined);
});
test('fully sold-out catalog stays valid and observation time does not regress',()=>{
 const input=snapshot([row('last',false,{observed_at_utc:'2026-01-03T00:00:00Z'})]);
 const catalog=buildCatalog(input);assert.equal(catalog.products.length,0);assert.equal(catalog.asOf,'2026-01-03T00:00:00Z');assert.equal(input.items.length,1);
});
const context={url:'https://example.invalid/product/fish/123/',domain:'example.invalid',sourceId:'example',name:'Example',type:'live',subtype:'fish',observedAt:'2026-01-02T00:00:00Z'};
const offer=(url=context.url)=>({'@type':'Offer',price:1000,priceCurrency:'KRW',availability:'https://schema.org/InStock',url});
test('primary visible sold-out conflicting with in-stock metadata is held for review',()=>{
 const product={'@type':'Product',name:'Fish',productID:'123',offers:offer()};
 const html=`<h1>Fish</h1><p>1,000원</p><img alt="품절"><script>var is_soldout_icon = 'T';</script><script type="application/ld+json">${JSON.stringify(product)}</script>`;
 const result=parseProductPage(html,context);assert.equal(result.items.length,0);assert.ok(result.issues.includes('availability_conflict_primary_sold_out'));
 const unrelated=parseProductPage(html.replace('<h1>Fish</h1>','<h1>Unrelated</h1><p>Fish</p>'),context);assert.equal(unrelated.items.length,1);
});
test('a sold-out exact option conflict does not mark another option sold out',()=>{
 const group={'@type':'ProductGroup',name:'Fish',productGroupID:'123',hasVariant:['A','B'].map(sku=>({'@type':'Product',name:'Fish '+sku,sku,additionalProperty:[{name:'Size',value:sku}],offers:offer(context.url+'?item_code='+sku)}))};
 const html=`<h1>Fish</h1><p>Fish A Fish B 1,000원</p><select product_type="product_option" option_product_no="123" option_title="Size"><option value="A" disabled>A [품절]</option><option value="B">B</option></select><script type="application/ld+json">${JSON.stringify(group)}</script>`;
 const result=parseProductPage(html,context);assert.deepEqual(result.items.map(p=>p.variant_id),['B']);assert.equal(result.items[0].available,true);assert.ok(result.issues.includes('availability_conflict_exact_option_sold_out'));
});
test('admin public counts match catalog while tracked raw count is retained',()=>{
 const input=snapshot([row('out',false),row('in',true),row('unknown',null)]);
 const registry={sources:[{id:'neutral-background-fixture',sourceDomain:'background.invalid',discovery:{}}]};
 const result=adminStatus(registry,null,input);assert.equal(result.sources[0].snapshotProductCount,3);assert.equal(result.sources[0].publicProductCount,buildCatalog(input).products.length);assert.equal(result.sources[0].confirmedOutOfStockCount,1);
});
