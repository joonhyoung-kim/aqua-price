'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {parseSingleOffer}=require('../scripts/collector/cafe24-single-offer.cjs');
const {collectSource}=require('../scripts/collector/engine.cjs');
const {requestAllocation}=require('../scripts/collector/discovery-scope.cjs');
const {sourceCursor}=require('../scripts/collector/queue-policy.cjs');
const source=require('../sources/registry.json').sources.find(s=>s.sourceDomain==='solaqua.kr');
const url='https://example.invalid/product/fish/135/';
const context={url,domain:'example.invalid',sourceId:'fixture',name:'Fixture',type:'live',subtype:'fish',photosAllowed:false,observedAt:'2026-10-26T01:14:25.155Z'};
function page({price=8000,soldout=true}={}){
 const product={'@type':'Product',name:'화이트 판다 코리도라스',sku:'cafe24_fixture_135',offers:{'@type':'Offer',price,priceCurrency:'KRW',url,availability:'https://schema.org/'+(soldout?'OutOfStock':'InStock')}};
 return '<h2>화이트 판다 코리도라스</h2><strong id="span_product_price_text">'+price.toLocaleString('en-US')+'원 </strong>'+(soldout?'<img alt="품절" src="soldout.gif">':'')+'<script>var is_soldout_icon = '+JSON.stringify(soldout?'T':'F')+';</script><script type="application/ld+json">'+JSON.stringify(product)+'</script>';
}
test('single no-option offers preserve verified sale price and sold-out state',()=>{
 for(const soldout of [true,false]){const r=parseSingleOffer(page({soldout}),context);assert.equal(r.status,'success');assert.equal(r.items.length,1);assert.equal(r.items[0].price_amount,8000);assert.equal(r.items[0].available,!soldout);assert.equal(r.items[0].photo,null);}
});
test('new options, mismatched visible price, zero price and hidden price never publish',()=>{
 for(const html of [page()+'<select product_type="product_option"><option>large +3000원</option></select>',page().replace('8,000원','7,000원'),page({price:0}),page().replace('id="span_product_price_text"','style="display:none" id="span_product_price_text"')])assert.equal(parseSingleOffer(html,context).items.length,0);
});
test('conflicting or missing stock evidence and unrelated primary headings require review',()=>{
 for(const html of [page().replace('OutOfStock','InStock'),page().replace('alt="품절"','alt="unverified"'),page().replace('var is_soldout_icon','var unknown'),page().replace('<h2>화이트 판다 코리도라스</h2>','<h2>Other fish</h2><p>화이트 판다 코리도라스</p>')])assert.equal(parseSingleOffer(html,context).items.length,0);
});
test('bounded known source reserves no discovery work and keeps the existing next-source cursor',()=>{
 assert.equal(source.maxRequests,4);assert.equal(source.products.length,3);assert.equal(source.discovery.newProductDiscovery,false);assert.equal(source.photosAllowed,false);
 assert.deepEqual(requestAllocation(source,true),{total:4,knownProductLimit:3,knownRequestLimit:4,discoveryRequestReserve:0});
 const registry=require('../sources/registry.json').sources,prior={runNextSourceIds:{live:'retailer-38'}};
 assert.equal(registry[sourceCursor(registry,prior,'live')].id,'retailer-38');
 assert.ok(registry.findIndex(s=>s.id===source.id)<registry.findIndex(s=>s.id==='retailer-54'));assert.equal(require('../sources/collector-controls.json').sources[source.id].enabled,true);
});
test('strict adapter is used by the collector, respects four requests and preserves lastgood on mismatch',async()=>{
 const fixture={...source,id:'fixture',officialURL:'https://example.invalid/',sourceDomain:'example.invalid',delayMs:0,cacheTtlMs:0,products:[{url,type:'live',subtype:'fish'}]};
 const fetchPage=html=>async u=>new Response(u.endsWith('/robots.txt')?'User-agent: *\nAllow: /':html);
 const good=await collectSource(fixture,{}, {fetch:fetchPage(page())});assert.equal(good.status,'success');assert.equal(good.requests,2);assert.equal(good.products.length,1);
 const bad=await collectSource(fixture,good,{fetch:fetchPage(page().replace('OutOfStock','InStock'))});assert.equal(bad.status,'partial_failure');assert.deepEqual(bad.products,good.products);
 const many={...fixture,products:[1,2,3,4,5].map(n=>({url:url+'?sample='+n,type:'live',subtype:'fish'}))};
 const limited=await collectSource(many,{}, {fetch:fetchPage(page())});assert.equal(limited.requests,4);assert.equal(limited.status,'budget_limited');
 const denied=await collectSource(fixture,good,{fetch:async()=>new Response('',{status:403})});assert.equal(denied.requiresManualReview,true);assert.equal(denied.requests,1);assert.deepEqual(denied.products,good.products);
});
