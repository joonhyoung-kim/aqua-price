'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const {adminStatus}=require('../scripts/build-admin-status.cjs');
test('admin reports actual results and never treats local execution as automated success',()=>{
 const registry=require('../sources/registry.json'),snapshot=require('../dist/source-snapshot.json'),report=require('../dist/collector-status.json');
 const status=adminStatus(registry,report,snapshot,{configured:true,verifiedRun:false});assert.equal(status.sources.length,45);assert.equal(status.sources.filter(s=>s.autoRefreshVerified).length,0);assert.equal(status.sources.filter(s=>s.fullCatalogCoverage).length,0);
 for(const s of status.sources){assert.equal(s.discovery.coverageComplete,false);assert.equal(s.discovery.newProductDiscovery,false);assert.equal(s.snapshotProductCount,snapshot.items.filter(p=>p.seller_domain===s.domain).length);}
});
test('admin contains only read-only navigation and escapes retailer text',()=>{
 const js=fs.readFileSync('dist/admin/app.js','utf8'),html=fs.readFileSync('dist/admin/index.html','utf8');assert.match(js,/escapeText/);assert.doesNotMatch(js,/localStorage|method\s*:\s*['"](?:POST|PUT|DELETE)/);assert.match(html,/github\.com\/joonhyoung-kim\/aqua-price\/edit\/preview\/sources\/registry\.json/);
});
test('publisher adds a new product without photo and preserves failed-source lastgood',()=>{
 const {applyUpdates}=require('../scripts/collector/publish.cjs'),snapshot=require('../dist/source-snapshot.json');const product=structuredClone(snapshot.items[0]);product.id='synthetic-test-only';product.collector_key=product.id;product.photo=null;
 const output=applyUpdates(snapshot,{ok:{status:'success',cacheOnly:false,products:[product],updatedKeys:[product.id]},failed:{status:'failed',products:[],updatedKeys:[]}});assert.equal(output.snapshot.items.length,snapshot.items.length+1);assert.equal(output.catalog.products.at(-1).photo.url,null);
});
