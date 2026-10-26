'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),A=require('../dist/data-model.js');
const base=structuredClone(require('../dist/catalog.json').products.find(p=>p.type==='live'&&p.price.amount>0));
const p=(id,extra={})=>({...structuredClone(base),id,name:id,originalTitle:id,spec:'판매단위/옵션: 미확인',variantId:null,registeredAt:null,quantityPerPack:null,pairsPerPack:null,price:{amount:1000,currency:'KRW'},...extra});
const catalog=products=>({schemaVersion:1,status:'ready',reason:'',asOf:'2026-10-26T05:37:21.078Z',sellers:[{id:base.sellerId,name:'Fixture',officialUrl:new URL(base.sourceUrl).origin}],products});
test('zero alone is unconfirmed; affirmative free offers and paid online offers remain comparable',()=>{
 assert.equal(A.comparisonStatus(p('수조 주문 제작 견적의뢰')).comparable,false);
 const input=catalog([p('zero',{price:{amount:0,currency:'KRW'}}),p('무료 분양',{price:{amount:0,currency:'KRW'}}),p('1만원 이상 구매 시 무료 분양',{price:{amount:0,currency:'KRW'}}),p('무료배송 물고기',{price:{amount:0,currency:'KRW'}}),p('매장 판매 전용',{price:{amount:1200,currency:'KRW'}}),p('paid'),p('unknown',{price:null})]);
 assert.deepEqual(A.selectProducts(input,{...A.defaultFilters}).rows.map(p=>p.id),['무료 분양','paid']);
 const all=A.selectProducts(input,{...A.defaultFilters,comparison:'all'}).rows;assert.equal(all.length,7);assert.deepEqual(all.slice(0,2).map(p=>p.id),['무료 분양','paid']);
 assert.equal(A.selectProducts(input,{...A.defaultFilters,comparison:'unpriced'}).rows.length,5);assert.equal(input.products[0].price.amount,0);
});
test('unit prices accept explicit title counts; dimensions never create counts',()=>{
 for(const [count,total,unitAmount]of [[1,600,600],[5,3000,600],[10,5000,500]])assert.deepEqual(A.unitPrice(p('fish',{subtype:'fish',quantityPerPack:count,price:{amount:total,currency:'KRW'}})),{count,unit:'마리',amount:unitAmount});
 assert.deepEqual(A.unitPrice(p('10마리 6cm 등급 A')),{count:10,unit:'마리',amount:100});assert.equal(A.unitPrice(p('6cm 등급 A')),null);
 assert.equal(A.unitPrice(p('ambiguous',{quantityPerPack:0})),null);
 assert.deepEqual(A.unitPrice(p('pair',{pairsPerPack:2})),{count:2,unit:'쌍',amount:500});
 assert.deepEqual(A.unitPrice(p('gear',{type:'gear',subtype:null,quantityPerPack:4})),{count:4,unit:'개',amount:250});
});
test('recent observation uses each offer timestamp and current time, not site asOf',()=>{
 const now=Date.parse('2026-10-26T12:00:00Z'),day=86400000;
 const input=catalog([p('boundary',{observedAt:new Date(now-7*day).toISOString()}),p('older',{observedAt:new Date(now-7*day-1).toISOString()}),p('future',{observedAt:new Date(now+1).toISOString()})]);
 input.asOf=new Date(now+2).toISOString();const query=A.createCatalogQuery(input,{now:()=>now});assert.deepEqual(query.view({...A.defaultFilters,observedDays:7}).result.rows.map(p=>p.id),['boundary']);
 assert.equal(A.observationAge(input.products[0],now).stale,false);assert.equal(A.observationAge(input.products[1],now).stale,true);assert.equal(A.observationAge(input.products[2],now).days,null);
});
test('tokens ignore order, approved panda spelling works, and unrelated fields do not create a phrase',()=>{
 const input=catalog([p('tetra',{name:'네온테트라',originalTitle:'네온테트라'}),p('cory',{name:'팬더 코리도라스',originalTitle:'팬더 코리도라스'}),p('fields',{name:'청록',originalTitle:'물결'})]);
 const search=query=>A.selectProducts(input,{...A.defaultFilters,query}).rows.map(p=>p.id);
 assert.deepEqual(search('테트라 네온'),search('네온 테트라'));assert.deepEqual(search('판다 코리'),['cory']);assert.deepEqual(search('코리 팬더'),['cory']);assert.deepEqual(search('청록 물결'),[]);
});
test('price bounds and seller filters intersect; invalid bounds are rejected and URLs round trip',()=>{
 const input=catalog([p('low',{price:{amount:500,currency:'KRW'}}),p('edge',{price:{amount:1000,currency:'KRW'}})]);
 const filters={...A.defaultFilters,minPrice:1000,maxPrice:1000,seller:base.sellerId,observedDays:7,groupOptions:false,comparison:'all'};
 assert.deepEqual(A.filtersFromSearch(A.filtersToSearch(filters)),filters);
 assert.deepEqual(A.selectProducts(input,{...filters,observedDays:'all'}).rows.map(p=>p.id),['edge']);
 assert.equal(A.selectProducts(input,{...filters,observedDays:'all',seller:'missing.invalid'}).rows.length,0);
 for(const change of [{minPrice:-1},{maxPrice:0.5},{minPrice:1001,maxPrice:1000},{observedDays:2}])assert.throws(()=>A.selectProducts(input,{...A.defaultFilters,...change}));
 assert.equal(A.filtersFromSearch('?minPrice=9&maxPrice=1').minPrice,null);
});
test('group only exact seller/product variants, preserve every option URL and do not merge similar names',()=>{
 const a=p('a',{variantId:'A',sourceUrl:new URL('/product/fish/10/?item_code=A',base.sourceUrl).href}),b=p('b',{variantId:'B',sourceUrl:new URL('/product/fish/10/?item_code=B',base.sourceUrl).href}),c=p('c',{name:'same',sourceUrl:new URL('/product/fish/11/',base.sourceUrl).href});
 const rows=[a,c,b],copy=structuredClone(rows),groups=A.groupOffers(rows);assert.equal(groups.length,2);assert.deepEqual(groups[0].offers,[a,b]);assert.deepEqual(groups.flatMap(g=>g.offers.map(p=>p.sourceUrl)).sort(),rows.map(p=>p.sourceUrl).sort());assert.deepEqual(rows,copy);
});
