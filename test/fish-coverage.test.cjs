'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {takeFairCandidates}=require('../scripts/collector/queue-policy.cjs');
const {discoverDaily}=require('../scripts/collector/daily-discovery.cjs');
test('fish priority shares scarce detail budget across categories and preserves nonfish turns and retry hold',()=>{
 const list=[...Array.from({length:5},(_,i)=>({url:'old'+i,subtype:'fish',discoveredInCategory:'guppy'})),{url:'beta',subtype:'fish',discoveredInCategory:'betta'},{url:'cory',subtype:'fish',discoveredInCategory:'cory'},...['shrimp','snail','mixed','aquatic_plant'].map(subtype=>({url:subtype,subtype})),{url:'held',subtype:'fish',retryAfter:new Date(Date.now()+86400000).toISOString()}];
 const first=takeFairCandidates(list,7,0,Date.now(),{prioritizeFish:true});assert.deepEqual(first.candidates.map(c=>c.url),['old0','beta','cory','shrimp','snail','mixed','aquatic_plant']);assert.ok(!first.candidates.some(c=>c.url==='held'));
});
test('one page per category explores another group and retains actual next-page links',async()=>{
 const host='https://example.invalid',a=host+'/category/betta/1/',b=host+'/category/cory/2/';
 const page=(id,next)=>'<div class="prdCount">2개</div><ul class="prdList"><a href="/product/fish/'+id+'/">fish</a></ul><div class="xans-product-normalpaging">'+(next?'<a href="?page=2">next</a>':'')+'</div>';
 const source={id:'test',officialURL:host,enabled:true,maxRequests:6,delayMs:0,cacheTtlMs:0,timeoutMs:1000,maxBytes:10000};
 const seed={adapter:'cafe24_category_links',maxPages:2,maxPagesPerCategory:1,maxProducts:10,probeFirstPage:false,categories:[a,b].map(url=>({url,label:'Fish',type:'live',subtype:'fish',reviewBasis:'Fixture'}))};
 const pages={[a]:page(1,true),[b]:page(2,false),[a+'?page=2']:page(3,false)},calls=[];
 const transport={fetch:async u=>{calls.push(u);return new Response(u.endsWith('/robots.txt')?'User-agent: *\nAllow: /':pages[u]||'',{status:u.endsWith('/robots.txt')||pages[u]?200:404});},sleep:async()=>{}};
 const first=await discoverDaily(source,seed,{},transport);assert.equal(first.coverage.pagesVisited,2);assert.deepEqual(first.categories.map(c=>c.url),[a,b]);assert.equal(first.cursor.categories['example.invalid:1'].nextUrl,a+'?page=2');
 calls.length=0;await discoverDaily(source,seed,first,transport);assert.ok(calls.includes(a+'?page=2'));assert.equal(first.coverage.coverageComplete,false);
});
test('coverage expansion has public menu evidence and excludes manually identified supply categories',()=>{
 const evidence=require('../sources/fish-category-expansion-evidence.json'),seed=require('../sources/discovery-seeds.json');assert.equal(evidence.newCategoryCount-evidence.oldCategoryCount,evidence.added.length);assert.equal(evidence.unknownFullCoverage,true);
 for(const row of evidence.added){assert.ok(row.evidencePage);assert.ok(row.observedAt);assert.ok(seed.sources.find(s=>s.id===row.sourceId).categories.some(c=>c.url===row.url&&c.subtype==='fish'));}
 for(const row of evidence.rejected)assert.ok(!seed.sources.find(s=>s.id===row.sourceId).categories.some(c=>c.url===row.url&&c.subtype==='fish'));
});
test('backlog exploration and pending verification share one source budget without discarding older candidates',async()=>{
 const {integrateDiscovery}=require('../scripts/collector/integrate-discovery.cjs'),host='https://example.invalid',category=host+'/category/fish/1/';
 const detail=id=>'<h1>Betta '+id+'</h1><p>1,000원</p><script type="application/ld+json">'+JSON.stringify({'@type':'Product',name:'Betta '+id,sku:String(id),url:host+'/product/fish/'+id+'/',offers:{'@type':'Offer',price:1000,priceCurrency:'KRW'}})+'</script>';
 const calls=[],pages={[category]:'<ul class="prdList"><a href="/product/fish/4/">Fish</a></ul><div class="xans-product-normalpaging"></div>',...Object.fromEntries([1,2,3,4].map(id=>[host+'/product/fish/'+id+'/',detail(id)]))};
 const source={id:'test',sourceDomain:'example.invalid',name:'Fixture',officialURL:host,enabled:true,maxRequests:5,delayMs:0,cacheTtlMs:10800000,timeoutMs:1000,maxBytes:10000};
 const seed={adapter:'cafe24_category_links',exploreWithBacklog:true,maxPages:1,maxPagesPerCategory:1,maxProducts:10,maxProductVerifications:3,categories:[{url:category,label:'Betta',type:'live',subtype:'fish',reviewBasis:'Fixture'}]};
 const old=[1,2,3].map(id=>({url:host+'/product/fish/'+id+'/',type:'live',subtype:'fish',discoveredInCategory:category}));
 const result=await integrateDiscovery(source,seed,{status:'success',requests:0,products:[],discoveryPending:old},{items:[]},{coverageLive:true,fetch:async u=>{calls.push(u);return new Response(u.endsWith('/robots.txt')?'User-agent: *\nAllow: /':pages[u]||'',{status:200});},sleep:async()=>{}});
 assert.ok(calls.includes(category));assert.ok(result.requests<=5);assert.equal(result.discoveryPending.length+result.products.length,4);assert.ok(result.products.length>0);assert.equal(result.discoverySummary.deletionEnabled,false);
});
