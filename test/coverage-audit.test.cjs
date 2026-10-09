'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{auditCoverage}=require('../scripts/audit-coverage.cjs');
test('merchant audit keeps overlapping category totals separate and exposes actual page tails',()=>{
 const source={id:'a',name:'a',sourceDomain:'a.invalid',enabled:true},state={sources:{a:{products:[],discoveryPending:[{url:'https://a.invalid/product/x/1/'}],dailyDiscovery:{cursor:{categories:{a:{entryUrl:'https://a.invalid/category/구피/1/',expectedProductCount:100,seenKeys:['a.invalid:1'],visitedPageUrls:['https://a.invalid/category/구피/1/'],nextUrl:'https://a.invalid/category/구피/1/?page=2'},b:{entryUrl:'https://a.invalid/category/생물/2/',expectedProductCount:100,seenKeys:['a.invalid:1'],visitedPageUrls:['https://a.invalid/category/생물/2/'],nextUrl:'https://a.invalid/category/생물/2/?page=2'}}}}}}};
 const row=auditCoverage({sources:[source]},state,{products:[]}).sources[0];assert.equal(row.fullRetailerCount,'unknown');assert.deepEqual(row.categories.map(c=>c.reportedProductCount),[100,100]);assert.ok(row.missingReasons.includes('first_page_only_with_remaining_cursor'));assert.equal(row.pending.count,1);assert.equal(row.fullCoverage,false);
});
test('publishing never collapses identical merchant titles across sellers',()=>{
 const {applyUpdates}=require('../scripts/collector/publish.cjs'),snapshot=require('../dist/source-snapshot.json');const first=structuredClone(snapshot.items.find(p=>p.seller_domain==='chunjane.com')),second=structuredClone(snapshot.items.find(p=>p.seller_domain==='sangaqua.co.kr'));
 first.id=first.collector_key='same-title-merchant-a';second.id=second.collector_key='same-title-merchant-b';first.title=second.title='동일 공개 상품 제목';delete first.display_title;delete second.display_title;
 const published=applyUpdates(snapshot,{a:{status:'success',cacheOnly:false,products:[first],updatedKeys:[first.collector_key]},b:{status:'success',cacheOnly:false,products:[second],updatedKeys:[second.collector_key]}});
 const rows=published.catalog.products.filter(p=>[first.id,second.id].includes(p.id));assert.equal(rows.length,2);assert.equal(new Set(rows.map(p=>p.sellerId)).size,2);assert.ok(rows.every(p=>p.originalTitle==='동일 공개 상품 제목'));
});
