'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const A=require('../dist/data-model.js');
const actual=require('../dist/catalog.json');

test('prepared selection, sort availability and navigation match the public API',()=>{
 const query=A.createCatalogQuery(actual);
 for(const search of [
  '', '?type=gear', '?subtype=fish&fishGroup=guppy',
  '?subtype=fish&browseGroup=bottom', '?subtype=shrimp&liveGroup=other',
  '?subtype=aquatic_plant&liveGroup=plant_rotala', '?subtype=snail'
 ]){
  for(const sort of ['low','high','new','sales','observed']){
   for(const days of ['all',7]){
    for(const text of ['','찾을수없는상품']){
     const filters={...A.filtersFromSearch(search),sort,days,query:text};
     const view=query.view(filters);
     assert.deepEqual(view.result,A.selectProducts(actual,filters));
     assert.deepEqual(query.select(filters),A.selectProducts(actual,filters));
     assert.deepEqual(view.availability,A.sortAvailability(actual,filters));
     const baseFilters={
      ...filters,fishGroup:'all',liveGroup:'all',browseGroup:'all',
      sort:['sales','new'].includes(sort)?'low':sort
     };
     assert.deepEqual(view.base,A.selectProducts(actual,baseFilters));
     const groups=A.livestockGroups[filters.subtype]||{all:'전체'};
     const counts=Object.fromEntries(Object.keys(groups).map(k=>[k,0]));
     for(const p of view.base.rows){
      counts.all++;const key=A.livestockGroup(p);
      if(Object.hasOwn(counts,key))counts[key]++;
     }
     assert.deepEqual(view.groupCounts,counts);
     for(const p of view.base.rows)
      assert.equal(query.group(p),A.livestockGroup(p));
    }
   }
  }
 }
});

test('public validation rejects mutation; prepared data owns a deeply frozen snapshot',()=>{
 const input=structuredClone(actual),query=A.createCatalogQuery(input);
 const before=query.select({...A.defaultFilters});
 input.products[0].price.amount=-1;
 assert.throws(()=>A.selectProducts(input,{...A.defaultFilters}));
 assert.deepEqual(query.select({...A.defaultFilters}),before);
 assert(Object.isFrozen(query.catalog));
 assert(Object.isFrozen(query.catalog.products[0].price));
 assert.throws(()=>{query.catalog.products[0].price.amount=-1;});
 assert.throws(()=>A.createCatalogQuery(input));
});

test('new catalog instances refresh indexes and private selection validates filters',()=>{
 const input=structuredClone(actual),old=A.createCatalogQuery(input);
 input.products[0].name='새로운검색표식';
 input.products[0].originalTitle=input.products[0].name;
 const next=A.createCatalogQuery(input);
 const filters={...A.defaultFilters,type:input.products[0].type,query:'새로운검색표식'};
 assert.equal(old.select(filters).rows.length,0);
 assert.equal(next.select(filters).rows.length,1);
 for(const change of [
  {type:'bad'},{sort:'bad'},{query:5},
  {subtype:'fish',fishGroup:'invented'}
 ])assert.throws(()=>next.view({...A.defaultFilters,...change}));
});

test('search does not join separate fields into invented matches',()=>{
 const input=structuredClone(actual);
 input.products=[{
  ...structuredClone(actual.products[0]),
  name:'청록',originalTitle:'관상',spec:'용품'
 }];
 const query=A.createCatalogQuery(input);
 const filters={...A.defaultFilters,type:input.products[0].type,query:'청록 관상'};
 assert.equal(query.select(filters).rows.length,0);
 assert.deepEqual(query.select(filters),A.selectProducts(input,filters));
});

test('known and unknown prices, dates and sales keep their existing semantics',()=>{
 const input=structuredClone(actual);
 const a=structuredClone(actual.products.find(p=>p.type==='gear'));
 a.id='metric-fixture';a.registeredAt=input.asOf;a.observedAt=input.asOf;
 a.price=null;a.cumulativeSales=0;
 a.periodSales={
  count:2,startAt:new Date(Date.parse(input.asOf)-7*86400000).toISOString(),
  endAt:input.asOf
 };
 input.products.push(a);
 const query=A.createCatalogQuery(input);
 for(const sort of ['low','high','sales','new','observed'])
  for(const days of ['all',7,30])
   for(const includeUnknownRegistration of [true,false]){
    const filters={...A.defaultFilters,type:'gear',sort,days,includeUnknownRegistration};
    assert.deepEqual(query.view(filters).result,A.selectProducts(input,filters));
    assert.deepEqual(query.view(filters).availability,A.sortAvailability(input,filters));
   }
});

test('view cache is read-only and pending/error states keep the public behavior',()=>{
 const query=A.createCatalogQuery(actual),filters={...A.defaultFilters};
 const first=query.view(filters);
 assert.equal(query.view({...filters}),first);
 assert(Object.isFrozen(first.result.rows));
 assert.throws(()=>first.result.rows.pop());
 for(const status of ['pending','error']){
  const input={schemaVersion:1,status,reason:'테스트',asOf:null,sellers:[],products:[]};
  const pending=A.createCatalogQuery(input);
  assert.deepEqual(pending.select(filters),A.selectProducts(input,filters));
  const view=pending.view(filters);
  assert.deepEqual(view.result,A.selectProducts(input,filters));
  assert.deepEqual(view.availability,A.sortAvailability(input,filters));
  assert.deepEqual(view.base,A.selectProducts(input,filters));
  assert.deepEqual(view.groupCounts,{all:0});
 }
});

test('cache keys read inherited filters and ignore unrelated metadata',()=>{
 const query=A.createCatalogQuery(actual);
 const low=Object.create({...A.defaultFilters,type:'gear',sort:'low'});
 const high=Object.create({...A.defaultFilters,type:'gear',sort:'high'});
 assert.deepEqual(query.view(low).result,A.selectProducts(actual,low));
 assert.deepEqual(query.view(high).result,A.selectProducts(actual,high));
 const extra={...A.defaultFilters,irrelevant:1n};extra.circular=extra;
 assert.equal(query.view(extra),query.view({...A.defaultFilters}));
});

test('availability and navigation do not reorder cached result rows',()=>{
 const query=A.createCatalogQuery(actual);
 const filters={...A.defaultFilters,type:'gear',sort:'high'};
 const first=query.view(filters),ids=first.result.rows.map(p=>p.id);
 for(const sort of ['observed','new','sales','low','high'])
  query.view({...filters,sort});
 assert.deepEqual(first.result.rows.map(p=>p.id),ids);
 assert.deepEqual(first.result,A.selectProducts(actual,filters));
});

if(process.argv.includes('--bench')){
 const {performance}=require('node:perf_hooks');
 const started=performance.now();
 const query=A.createCatalogQuery(actual);
 const prepareMs=performance.now()-started;
 const cases=[];
 for(const type of ['live','gear'])
  for(const sort of ['low','high','new','sales','observed'])
   for(const days of ['all',7])
    for(const text of ['','구피','새우','수초','소일','찾을수없는상품'])
     cases.push({...A.defaultFilters,type,sort,days,query:text});
 const measure=fn=>{
  const times=[];
  for(const filters of cases){
   const start=performance.now();fn(filters);times.push(performance.now()-start);
  }
  times.sort((a,b)=>a-b);
  return {cases:times.length,medianMs:times[Math.floor(times.length/2)],
   p95Ms:times[Math.floor(times.length*.95)]};
 };
 const legacy=measure(filters=>{
  A.selectProducts(actual,filters);
  A.sortAvailability(actual,filters);
  const base=A.selectProducts(actual,{
   ...filters,fishGroup:'all',liveGroup:'all',browseGroup:'all',
   sort:['sales','new'].includes(filters.sort)?'low':filters.sort
  });
  for(const p of base.rows)A.livestockGroup(p);
 });
 const prepared=measure(filters=>query.view(filters));
 console.log(JSON.stringify({prepareMs,legacy,prepared},null,2));
 console.log('Model timings only; browser DOM/layout and image work require separate profiling.');
}
