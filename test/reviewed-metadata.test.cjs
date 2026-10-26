const {test}=require('node:test'),assert=require('node:assert/strict'),M=require('../dist/data-model.js'),{buildCatalog}=require('../scripts/build-catalog.cjs');
const snapshot=require('./fixtures/ux2-prime-snapshot.json'),data=buildCatalog(snapshot);
test('reviewed Prime is a normal source product with current price, stock and explicit incomplete shipping',()=>{
 const p=data.products.find(p=>p.id==='retailer-25:cafe24_sangaquamall_1_20385:default');assert(p);assert.equal(p.price.amount,24000);assert.equal(p.available,true);assert.equal(p.shipping.amount,3000);assert.equal(p.shippingPolicy.freeThreshold,50000);assert.equal(p.shippingPolicy.conditionsComplete,false);assert.equal(M.estimatePurchase(p,3,p.shippingPolicy).total,null);assert.equal(M.estimatePurchase(p,3,p.shippingPolicy).subtotal,72000);assert.equal(M.comparisonUnit(p).amount,96000);
 const q=M.createCatalogQuery(data);assert.deepEqual(q.select({...M.defaultFilters,type:'gear',query:'시켐 프라임'}).rows.map(p=>p.id),q.select({...M.defaultFilters,type:'gear',query:'Seachem Prime'}).rows.map(p=>p.id));
});
test('general verified comparison metadata survives publication without inferring absent identities',()=>{
 const s=structuredClone(snapshot),p=s.items.find(p=>p.id==='retailer-25:cafe24_sangaquamall_1_20385:default');p.comparison_identity={verified:true,evidenceUrl:p.product_url,brand:'fixture',model:'model-2213',specification:'250mL',contents:'one bottle'};
 const result=buildCatalog(s).products.find(x=>x.id===p.id);assert.equal(M.exactIdentity(result).key,'gear:'+JSON.stringify(['fixture','model-2213','250mL','one bottle']));assert.equal(data.products.filter(x=>x.comparisonIdentity).length,0);
});
