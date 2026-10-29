'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fixture=require('./fixtures/dreamaqua-single.json');
const {parseSingleOffer}=require('../scripts/collector/cafe24-single-offer.cjs');
const {collectSource}=require('../scripts/collector/engine.cjs');
const {applyUpdates}=require('../scripts/collector/publish.cjs');
const {requestAllocation}=require('../scripts/collector/discovery-scope.cjs');
const {sourceCursor}=require('../scripts/collector/queue-policy.cjs');
const registry=require('../sources/registry.json').sources,source=registry.find(s=>s.id==='retailer-54');
const context={url:fixture.url,domain:source.sourceDomain,sourceId:source.id,name:source.name,type:'live',subtype:'shrimp',photosAllowed:false,observedAt:fixture.observedAt};
test('reviewed shrimp is exactly 3000 KRW, hidden SOLD OUT is not primary stock, pack quantity unknown',()=>{
 const r=parseSingleOffer(fixture.html,context);assert.deepEqual(r.issues,[]);assert.equal(r.items.length,1);const p=r.items[0];assert.equal(p.price_amount,3000);assert.equal(p.available,true);assert.equal(p.quantity_per_pack,null);assert.equal(p.shipping_amount,null);assert.equal(p.photo,null);assert.equal(p.subtype,'shrimp');
});
test('new source adds one known URL, reserves no discovery and preserves source resume identity',()=>{
 assert.equal(source.maxRequests,2);assert.equal(source.delayMs,10000);assert.equal(source.products.length,1);assert.equal(source.products[0].subtype,'shrimp');assert.equal(source.discovery.newProductDiscovery,false);
 assert.deepEqual(requestAllocation(source,true),{total:2,knownProductLimit:1,knownRequestLimit:2,discoveryRequestReserve:0});assert.equal(registry[sourceCursor(registry,{runNextSourceIds:{live:'retailer-38'}},'live')].id,'retailer-38');
 assert.equal(require('../sources/collector-controls.json').sources[source.id].enabled,true);
});
test('bounded collector preserves failed or blocked products; sold-out projection and restock remain reversible',async()=>{
 const local={...source,delayMs:0,cacheTtlMs:0};
 const fetchPage=html=>async url=>new Response(url.endsWith('/robots.txt')?'User-agent: *\nAllow: /':html);
 const good=await collectSource(local,{}, {fetch:fetchPage(fixture.html)});assert.equal(good.status,'success');assert.equal(good.requests,2);assert.equal(good.products.length,1);
 const bad=await collectSource(local,good,{fetch:fetchPage(fixture.html.replace('3,000원','2,999원'))});assert.equal(bad.status,'partial_failure');assert.deepEqual(bad.products,good.products);
 const denied=await collectSource(local,good,{fetch:async()=>new Response('',{status:403})});assert.equal(denied.requests,1);assert.deepEqual(denied.products,good.products);assert.equal(denied.requiresManualReview,true);
 const lost=await collectSource(local,good,{fetch:async url=>url.endsWith('/robots.txt')?new Response('User-agent: *\nAllow: /'):new Response('',{status:404})});assert.deepEqual(lost.products,good.products);assert.match(lost.errors[0],/product_404_preserved/);
 const p=good.products[0],snapshot={items:[],summary:{},snapshot_at_utc:fixture.observedAt};
 const unavailable={...p,available:false,availability_basis:'Retailer JSON-LD OutOfStock; not checkout-confirmed inventory'};
 const project=product=>applyUpdates(snapshot,{[source.id]:{status:'success',products:[product],updatedKeys:[p.collector_key]}});
 const hidden=project(unavailable);assert.equal(hidden.snapshot.items.length,1);assert.equal(hidden.catalog.products.length,0);
 const restored=applyUpdates(hidden.snapshot,{[source.id]:{status:'success',products:[p],updatedKeys:[p.collector_key]}});assert.equal(restored.catalog.products.length,1);
});
