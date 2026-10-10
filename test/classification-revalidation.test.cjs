'use strict';
// Offline regression fixtures: no live merchant requests or snapshot mutations.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {revalidateExisting,syncQueue,canPublishCorrection,sameIdentity,digest}=require('../scripts/collector/revalidate-existing.cjs');
const {revalidationCandidates}=require('../scripts/collector/classification-revalidation.cjs');
const {integrateDiscovery}=require('../scripts/collector/integrate-discovery.cjs');
const {applyUpdates}=require('../scripts/collector/publish.cjs');
const {progress,restoreCheckpoint}=require('../scripts/collector/queue-policy.cjs');
const {productKey,categoryKey}=require('../scripts/collector/discovery.cjs');
const snapshotEnvelope=require('../dist/source-snapshot.json');
const registry=require('../sources/registry.json');
const baseline=require('./fixtures/gear-discovery-baseline.json'),originalSuspects={items:baseline.revalidationItems.map(record=>record.item)};
const host='https://example.invalid',at='2026-10-10T00:00:00.000Z',before='2026-10-09T00:00:00.000Z';
const source={id:'fixture',name:'Offline fixture',sourceDomain:'example.invalid',officialURL:host,enabled:true,adapter:'product_jsonld',maxRequests:8,delayMs:0,cacheTtlMs:10800000,timeoutMs:1000,maxBytes:100000,products:[]};
const seed={adapter:'cafe24_category_links',categories:[],maxPages:1,maxProducts:10,maxProductVerifications:3,maxGearProductVerifications:6};
const product=id=>host+'/product/item/'+id+'/';
const base=originalSuspects.items.find(p=>p.source_kind==='direct_retailer_product_page'&&p.type==='gear');
function row(id=1,changes={}) { return {...structuredClone(base),id:'preserved-'+id,collector_key:'fixture:'+id+':default',source_id:source.id,seller_domain:source.sourceDomain,retailer:source.name,retailer_product_id:String(id),variant_id:null,title:'체리새우 10마리 생물 포장비 무료',type:'gear',subtype:null,product_url:product(id),declared_product_url:product(id),observed_at_utc:before,price_amount:1000,photo:null,variant_title:null,variant_attributes:[],quantity_per_pack:null,classification_basis:'Old packaging classification',...changes}; }
const snapshot=items=>({...structuredClone(snapshotEnvelope),items:structuredClone(items)});
const state=items=>({status:'success',products:structuredClone(items),updatedKeys:[],requests:0,cacheOnly:true,cache:{},errors:[]});
function detail(item,options={}) {
 const url=options.url||item.product_url,title=options.title||item.title,price=options.price??item.price_amount;
 const data={'@type':'Product',name:title,sku:options.sku||item.retailer_product_id,url,offers:{'@type':'Offer',price,priceCurrency:'KRW',url,availability:'https://schema.org/InStock'}};
 const origin=new URL(url).origin;
 return '<div class="ec-base-path"><a href="'+origin+'/category/own/20/">'+(options.crumb||'관상새우')+'</a></div><h1>'+title+'</h1><p>'+price.toLocaleString('en-US')+'원</p><script type="application/ld+json">'+JSON.stringify(data)+'</script>';
}
function transport(pages={},options={}) {
 let clock=Date.parse(options.at||at);const calls=[];
 return {calls,now:()=>clock,sleep:async ms=>{clock+=ms;},fetch:async url=>{
  calls.push({url,at:clock});
  const value=new URL(url).pathname==='/robots.txt'?(options.robots??'User-agent: *\nAllow: /'):pages[url];
  if(value===undefined)throw Error('Unexpected offline fixture URL: '+url);
  if(value instanceof Error)throw value;
  return typeof value==='number'?new Response('',{status:value}):new Response(value);
 }};
}
async function corrected(changes={}) {
 const old=row(),initial=state([old]),snap=snapshot([old]),t=transport({[old.product_url]:detail(old,{price:1200})});
 const out=await revalidateExisting({...source,...changes},seed,initial,snap,t);
 return {old,initial,snap,t,out,update:out.products.find(p=>p.id===old.id)};
}

test('frozen original evidence queues precisely the eight preserved packaging-confusion offer identities',()=>{
 const original=JSON.stringify(originalSuspects),records=registry.sources.flatMap(s=>syncQueue(s,originalSuspects,{products:[]}));
 const expected=[['retailer-09','cafe24_alphafish_1_2081','default'],...['5426','5441','5163','984','5271'].map(id=>['retailer-12','cafe24_bizidduk83_1_'+id,'default']),...['A','D'].map(suffix=>['retailer-07','cafe24_pucu32_1_6687','cafe24_pucu32_1_6687_P0000JXF000'+suffix])].map(parts=>parts.join(':')).sort();
 assert.deepEqual(records.map(p=>p.id).sort(),expected);
 assert.equal(new Set(records.map(p=>p.id)).size,8);
 assert.equal(new Set(records.filter(p=>p.key==='aquapro.kr:6687').map(p=>p.variantId)).size,2);
 assert.ok(records.every(p=>p.status==='pending'&&p.requiresFreshVerification&&p.preserveIdentityAndVariants));
 assert.equal(JSON.stringify(originalSuspects),original);
});

test('exact existing ID and collector identity survive fresh gear-to-live verification and gear publication',async()=>{
 const {old,initial,snap,t,out,update}=await corrected();
 assert.equal(update.id,old.id);assert.ok(sameIdentity(old,update));assert.equal(update.type,'live');assert.equal(update.subtype,'shrimp');
 assert.equal(update.price_amount,1200);assert.equal(update.observed_at_utc,at);assert.ok(update.classification_evidence);assert.ok(canPublishCorrection(old,update,out));
 assert.equal(out.classificationRevalidationQueue[0].status,'corrected');assert.equal(out.classificationRevalidationSummary.correctedOffers,1);
 assert.deepEqual(t.calls.map(x=>x.url),[host+'/robots.txt',old.product_url]);assert.equal(out.requests,2);
 assert.deepEqual(initial,state([old]));assert.equal(snap.items[0].type,'gear');
 const published=applyUpdates(snap,{fixture:out},'gear');assert.equal(published.snapshot.items.length,1);assert.equal(published.snapshot.items[0].id,old.id);assert.equal(published.catalog.products[0].type,'live');
});

test('all six real default offer identities can be verified without minting IDs or losing prices',async()=>{
 for(const s of registry.sources.filter(s=>['retailer-09','retailer-12'].includes(s.id))){
  const candidates=revalidationCandidates(s,originalSuspects),items=originalSuspects.items.filter(p=>candidates.some(c=>c.id===p.id));
  const src={...s,maxRequests:20,delayMs:0,timeoutMs:1000,maxBytes:100000},pages=Object.fromEntries(items.map(p=>[p.product_url,detail(p)])),t=transport(pages);
  const out=await revalidateExisting(src,seed,state(items),snapshot(items),t);
  assert.equal(out.classificationRevalidationSummary.correctedOffers,items.length);
  for(const old of items){const fresh=out.products.find(p=>p.id===old.id);assert.ok(sameIdentity(old,fresh));assert.equal(fresh.type,'live');assert.equal(fresh.price_amount,old.price_amount);}
  assert.equal(out.products.length,items.length);assert.equal(t.calls.length,items.length+1);
 }
});

for(const cachedAt of [before,at,'2099-01-01T00:00:00.000Z'])test('fresh correction bypasses detail cache dated '+cachedAt,async()=>{
 const old=row(),initial=state([old]);initial.cache={[host+'/robots.txt']:{text:'User-agent: *\nAllow: /',fetchedAt:at},[old.product_url]:{text:detail(old,{price:9999}),fetchedAt:cachedAt}};
 const t=transport({[old.product_url]:detail(old,{price:1400})}),out=await revalidateExisting(source,seed,initial,snapshot([old]),t);
 assert.deepEqual(t.calls.map(x=>x.url),[old.product_url]);assert.equal(out.products[0].price_amount,1400);assert.equal(out.products[0].observed_at_utc,at);assert.equal(out.classificationRevalidationUpdates[0].cacheHit,false);
});

test('fresh unrelated product and same-product wrong retailer SKU never replace the existing identity',async()=>{
 for(const options of [{sku:'999',url:product(999)},{sku:'999'}]){
  const old=row(),initial=state([old]),t=transport({[old.product_url]:detail(old,options)}),out=await revalidateExisting(source,seed,initial,snapshot([old]),t);
  assert.deepEqual(out.products,initial.products);assert.deepEqual(out.updatedKeys,[]);assert.deepEqual(out.classificationRevalidationUpdates,[]);assert.equal(out.classificationRevalidationQueue[0].status,'identity_mismatch');
 }
});

test('same-collector-key identity with a different own product URL is rejected',async()=>{
 const old=row(),t=transport({[old.product_url]:detail(old,{url:product(999)})}),out=await revalidateExisting(source,seed,state([old]),snapshot([old]),t);
 assert.equal(out.products[0].type,'gear');assert.equal(out.classificationRevalidationQueue[0].status,'identity_mismatch');
});

test('matching source ID alone or matching domain alone cannot admit foreign rows',()=>{
 const a=row(1,{source_id:'foreign'}),b=row(2,{seller_domain:'other.invalid',product_url:'https://other.invalid/product/item/2/'});
 assert.deepEqual(syncQueue(source,snapshot([a,b]),state([a,b])),[]);
});

test('an older state copy does not override a newer corrected snapshot identity',()=>{
 const old=row(),fresh={...old,type:'live',subtype:'shrimp',observed_at_utc:at};
 assert.deepEqual(syncQueue(source,snapshot([fresh]),state([old])),[]);
});

test('already-corrected offers are not fetched again and old publication receipts are cleared',async()=>{
 const {old,out}=await corrected(),t=transport({});
 const next=await revalidateExisting(source,seed,{...out,requests:0},snapshot(out.products),t);
 assert.deepEqual(t.calls,[]);assert.equal(next.classificationRevalidationQueue[0].status,'corrected');assert.deepEqual(next.classificationRevalidationUpdates,[]);
});

test('state saved before publication cannot hide the still-published gear row or replay an old receipt',async()=>{
 const {old,out}=await corrected(),restored=restoreCheckpoint({...out,requests:0},snapshot([old]),source,{}),t=transport({[old.product_url]:detail(old,{price:1500})},{at:'2026-10-10T01:00:00.000Z'});
 assert.equal(restored.classificationRevalidationUpdates,undefined);
 const retried=await revalidateExisting(source,seed,restored,snapshot([old]),t);
 assert.equal(t.calls.filter(c=>c.url===old.product_url).length,1);assert.equal(retried.classificationRevalidationUpdates.length,1);
 const published=applyUpdates(snapshot([old]),{fixture:retried},'gear');assert.equal(published.snapshot.items[0].type,'live');assert.equal(published.snapshot.items[0].price_amount,1500);
});

test('newer state identity drift cannot replace the published reclassification target',async()=>{
 const old=row(),wrong=row(999,{id:old.id,observed_at_utc:at}),initial=state([wrong]),t=transport({[old.product_url]:detail(old,{price:1600})});
 const out=await revalidateExisting(source,seed,initial,snapshot([old]),t);
 assert.equal(t.calls.filter(c=>c.url===wrong.product_url).length,0);assert.equal(t.calls.filter(c=>c.url===old.product_url).length,1);
 const published=applyUpdates(snapshot([old]),{fixture:out},'gear');assert.ok(sameIdentity(old,published.snapshot.items[0]));assert.equal(published.snapshot.items[0].type,'live');
});

test('a state-only gear identity absent from the published snapshot cannot be reclassified or inserted',async()=>{
 const orphan=row(),published=row(2,{title:'외부여과기'}),t=transport({});
 const out=await revalidateExisting(source,seed,state([orphan]),snapshot([published]),t);
 assert.deepEqual(t.calls,[]);assert.deepEqual(out.classificationRevalidationUpdates,[]);assert.equal(out.classificationRevalidationSummary.correctedOffers,0);
 const result=applyUpdates(snapshot([published]),{fixture:out},'gear');assert.deepEqual(result.snapshot.items,[published]);
});

test('new classification version reopens a terminal review without resetting unrelated lane state',()=>{
 const {CLASSIFICATION_VERSION}=require('../scripts/collector/queue-policy.cjs'),old=row(),initial=state([old]),record=syncQueue(source,snapshot([old]),initial)[0];
 const queue=syncQueue(source,snapshot([old]),{...initial,classificationRevalidationQueue:[{...record,status:'needs_review',classificationVersion:CLASSIFICATION_VERSION-1}]});
 assert.equal(queue[0].status,'pending');assert.equal(queue[0].classificationVersion,CLASSIFICATION_VERSION);assert.equal(queue[0].id,old.id);
});

test('fresh feed breadcrumb confirms gear even when species and free-packaging words coexist',async()=>{
 for(const id of [1167,85]){const old=row(id,{title:'생이새우 100마리 전용사료증정 생물포장비없음'}),t=transport({[old.product_url]:detail(old,{crumb:'사료/먹이'})});
 const out=await revalidateExisting(source,seed,state([old]),snapshot([old]),t);
 assert.equal(out.products[0].type,'gear');assert.equal(out.classificationRevalidationQueue[0].status,'verified_gear');assert.deepEqual(out.classificationRevalidationUpdates,[]);}
});

test('ambiguous paid packaging stays in review without trusted parent-group evidence',async()=>{
 const old=row(6687,{title:'[야생베타] Betta simplex 베타 심플렉스 생물포장비 (전체생물금액 3만원 이하)'}),t=transport({[old.product_url]:detail(old,{crumb:'베타'})});
 const out=await revalidateExisting(source,seed,state([old]),snapshot([old]),t);
 assert.deepEqual(out.products,[old]);assert.equal(out.classificationRevalidationQueue[0].status,'needs_review');assert.ok(out.classificationRevalidationQueue[0].reason);assert.deepEqual(out.classificationRevalidationUpdates,[]);
});

for(const [label,sourcePatch,statePatch]of [
 ['disabled',{enabled:false},{}],['blocked',{technicalReadiness:'blocked'},{}],['manual quarantine',{}, {requiresManualReview:true}],['backoff',{}, {blockedUntil:'2099-01-01T00:00:00Z'}],['product review hold',{reviewHoldProducts:[{url:product(1)}]},{}]
])test(label+' makes no reclassification request and preserves last-good rows',async()=>{
 const old=row(),initial={...state([old]),...statePatch},t=transport({}),out=await revalidateExisting({...source,...sourcePatch},seed,initial,snapshot([old]),t);
 assert.deepEqual(t.calls,[]);assert.deepEqual(out.products,initial.products);assert.equal(out.classificationRevalidationQueue[0].status,'pending');assert.deepEqual(out.classificationRevalidationUpdates,[]);
});

test('unsupported adapter preserves reclassification queue without requests',async()=>{
 const old=row(),t=transport({}),out=await revalidateExisting(source,{...seed,adapter:'unsupported'},state([old]),snapshot([old]),t);
 assert.deepEqual(t.calls,[]);assert.equal(out.classificationRevalidationQueue[0].status,'pending');
});

for(const code of [404,410,500])test('HTTP '+code+' retains the exact offer and defers instead of deleting it',async()=>{
 const old=row(),t=transport({[old.product_url]:code}),out=await revalidateExisting(source,seed,state([old]),snapshot([old]),t);
 assert.deepEqual(out.products,[old]);assert.deepEqual(out.updatedKeys,[]);assert.deepEqual(out.classificationRevalidationUpdates,[]);assert.equal(out.classificationRevalidationQueue[0].status,'deferred');assert.ok(Date.parse(out.classificationRevalidationQueue[0].retryAfter)>Date.parse(at));
 const later=transport({}),again=await revalidateExisting(source,seed,{...out,requests:0},snapshot([old]),later);assert.deepEqual(later.calls,[]);assert.deepEqual(again.products,[old]);
});

for(const code of [403,429])test('HTTP '+code+' stops remaining reclassification immediately and preserves source holds',async()=>{
 const items=[row(1),row(2)],t=transport({[items[0].product_url]:code,[items[1].product_url]:detail(items[1])}),out=await revalidateExisting(source,seed,state(items),snapshot(items),t);
 assert.deepEqual(t.calls.map(x=>x.url),[host+'/robots.txt',items[0].product_url]);assert.deepEqual(out.products,items);assert.equal(out.httpStatus,code);assert.equal(out.requiresManualReview,code===403);assert.ok(out.blockedUntil);assert.deepEqual(out.classificationRevalidationUpdates,[]);
 const again=transport({});await revalidateExisting(source,seed,{...out,requests:0},snapshot(items),again);assert.deepEqual(again.calls,[]);
});

test('robots denial is terminal review evidence and never fetches a forbidden detail',async()=>{
 const old=row(),t=transport({}, {robots:'User-agent: *\nDisallow: /product/'}),out=await revalidateExisting(source,seed,state([old]),snapshot([old]),t);
 assert.deepEqual(t.calls.map(x=>x.url),[host+'/robots.txt']);assert.deepEqual(out.products,[old]);assert.equal(out.classificationRevalidationQueue[0].status,'robots_denied_product');
});

test('missing robots and malformed primary detail cannot authorize a correction',async()=>{
 for(const [options,pages]of [[{robots:404},{}],[{}, {[product(1)]:'<h1>체리새우 10마리 생물포장비 무료</h1>'}]]){
  const old=row(),t=transport(pages,options),out=await revalidateExisting(source,seed,state([old]),snapshot([old]),t);
  assert.deepEqual(out.products,[old]);assert.deepEqual(out.classificationRevalidationUpdates,[]);assert.equal(out.classificationRevalidationQueue[0].status,'deferred');
 }
});

test('zero budget and expired deadline preserve unattempted pending queue entries',async()=>{
 for(const options of [{maxRequests:0},{deadline:Date.parse(at)}]){
  const old=row(),t=transport({}),out=await revalidateExisting({...source,...('maxRequests'in options?{maxRequests:options.maxRequests}:{})},seed,state([old]),snapshot([old]),{...t,...('deadline'in options?{deadline:options.deadline}:{})});
  assert.deepEqual(t.calls,[]);assert.deepEqual(out.products,[old]);assert.equal(out.classificationRevalidationQueue[0].status,'pending');assert.equal(out.requests,0);
 }
});

test('shared request budget includes robots and cannot overrun pre-existing requests',async()=>{
 const items=[row(1),row(2)],initial={...state(items),requests:3},t=transport({[items[0].product_url]:detail(items[0]),[items[1].product_url]:detail(items[1])});
 const out=await revalidateExisting({...source,maxRequests:5},seed,initial,snapshot(items),t);
 assert.equal(out.requests,5);assert.equal(t.calls.length,2);assert.equal(out.classificationRevalidationSummary.correctedOffers,1);assert.equal(out.classificationRevalidationQueue[1].status,'pending');
});

test('budget spent only on robots leaves unattempted detail pending without a failure backoff',async()=>{
 const old=row(),t=transport({}),out=await revalidateExisting({...source,maxRequests:1},seed,state([old]),snapshot([old]),t);
 assert.deepEqual(t.calls.map(x=>x.url),[host+'/robots.txt']);assert.deepEqual(out.products,[old]);assert.equal(out.requests,1);
 assert.equal(out.classificationRevalidationQueue[0].status,'pending');assert.equal(out.classificationRevalidationQueue[0].retryAfter,undefined);assert.equal(out.classificationRevalidationQueue[0].attempts,0);
});

test('deadline reached before request dispatch does not count as a failed detail attempt',async()=>{
 const old=row(),t=transport({}),out=await revalidateExisting(source,seed,state([old]),snapshot([old]),{...t,deadline:Date.parse(at)+500});
 assert.deepEqual(t.calls,[]);assert.deepEqual(out.products,[old]);assert.equal(out.requests,0);assert.equal(out.classificationRevalidationQueue[0].status,'pending');assert.equal(out.classificationRevalidationQueue[0].attempts,0);assert.equal(out.classificationRevalidationQueue[0].retryAfter,undefined);
});

test('a later access denial preserves a completed correction and never visits discovery categories',async()=>{
 const items=[row(1),row(2)],gear=host+'/category/gear/10/',t=transport({[items[0].product_url]:detail(items[0]),[items[1].product_url]:403});
 const out=await integrateDiscovery(source,{...seed,categories:[{url:gear,label:'여과기',type:'gear'}]},state(items),snapshot(items),{...t,discoveryScope:'gear'});
 assert.deepEqual(t.calls.map(c=>c.url),[host+'/robots.txt',items[0].product_url,items[1].product_url]);assert.equal(out.status,'partial_failure');assert.equal(out.requiresManualReview,true);assert.equal(out.classificationRevalidationUpdates.length,1);
 const published=applyUpdates(snapshot(items),{fixture:out},'gear');assert.equal(published.snapshot.items.find(p=>p.id===items[0].id).type,'live');assert.deepEqual(published.snapshot.items.find(p=>p.id===items[1].id),items[1]);
});

test('unverified robots stops both later category and discovery-detail work in the same run',async()=>{
 const old=row(),gear=host+'/category/gear/10/',initial={...state([old]),discoveryPending:[{url:product(999),type:'gear',mixedCategories:false}]},t=transport({}, {robots:404});
 const out=await integrateDiscovery(source,{...seed,categories:[{url:gear,label:'여과기',type:'gear'}]},initial,snapshot([old]),{...t,discoveryScope:'gear'});
 assert.deepEqual(t.calls.map(c=>c.url),[host+'/robots.txt']);assert.deepEqual(out.products,[old]);assert.deepEqual(out.discoveryPending,initial.discoveryPending);assert.deepEqual(out.classificationRevalidationUpdates,[]);
});

test('robots crawl-delay applies between correction pages and respects the prior source request',async()=>{
 const items=[row(1),row(2)],t=transport(Object.fromEntries(items.map(p=>[p.product_url,detail(p)])),{robots:'User-agent: *\nAllow: /\nCrawl-delay: 5'});
 const out=await revalidateExisting(source,seed,{...state(items),lastRequestAt:Date.parse(at)},snapshot(items),t);
 assert.equal(t.calls.length,3);for(let i=1;i<t.calls.length;i++)assert.ok(t.calls[i].at-t.calls[i-1].at>=5000);assert.ok(out.requests<=source.maxRequests);
});

test('gear integration verifies known offers despite a saturated discovery backlog and preserves live cursors',async()=>{
 const old=row(),live=host+'/category/live/20/',oldLive={cursor:{schemaVersion:1,nextCategoryIndex:7,categories:{[categoryKey(live)]:{entryUrl:live,nextUrl:live+'?page=8',seenKeys:[]}}}};
 const pending=Array.from({length:1000},(_,i)=>({url:product(1000+i),type:'gear',mixedCategories:false}));
 const initial={...state([old]),dailyDiscovery:oldLive,detailQueueCursor:5,discoveryPending:[{url:old.product_url,type:'gear'},...pending]};
 const t=transport({[old.product_url]:detail(old)}),out=await integrateDiscovery({...source,maxRequests:2},seed,initial,snapshot([old]),{...t,discoveryScope:'gear'});
 assert.equal(out.products.find(p=>p.id===old.id).type,'live');assert.equal(out.classificationRevalidationQueue[0].status,'corrected');assert.deepEqual(out.dailyDiscovery,oldLive);assert.equal(out.detailQueueCursor,5);assert.deepEqual(out.discoveryPending,pending);assert.equal(out.requests,2);
 assert.equal(applyUpdates(snapshot([old]),{fixture:out},'gear').snapshot.items[0].type,'live');
});

test('live-only integration does not consume the independent existing-gear queue',async()=>{
 const old=row(),initial=state([old]);initial.classificationRevalidationQueue=syncQueue(source,snapshot([old]),initial);
 const t=transport({}),out=await integrateDiscovery({...source,maxRequests:0},seed,initial,snapshot([old]),{...t,discoveryScope:'live'});
 assert.deepEqual(t.calls,[]);assert.deepEqual(out.classificationRevalidationQueue,initial.classificationRevalidationQueue);assert.deepEqual(out.products,[old]);
});

for(const first of ['live','gear'])test('all-lane integration retains correction authority when '+first+' runs first',async()=>{
 const old=row(),initial={...state([old]),nextDiscoveryScope:first},category=host+'/category/own/20/';
 const t=transport({[old.product_url]:detail(old),[category]:'<span class="prdCount">총 0개</span><ul class="prdList"></ul><div class="xans-product-normalpaging"></div>'});
 const out=await integrateDiscovery(source,seed,initial,snapshot([old]),{...t,discoveryScope:'all'});
 assert.equal(out.products.find(p=>p.id===old.id).type,'live');assert.ok(canPublishCorrection(old,out.products.find(p=>p.id===old.id),out));assert.ok(out.requests<=source.maxRequests);assert.equal(t.calls.filter(c=>c.url===old.product_url).length,1);
 assert.equal(applyUpdates(snapshot([old]),{fixture:out},'gear').snapshot.items[0].type,'live');
});

test('cold checkpoint restores queue evidence without reusable publication authority or weakened holds',async()=>{
 const {old,out}=await corrected(),checkpoint=progress({...out,requiresManualReview:true,blockedUntil:'2099-01-01T00:00:00Z'});
 assert.equal(checkpoint.classificationRevalidationUpdates,undefined);
 const restored=restoreCheckpoint({},snapshot([old]),source,{discoveryProgress:checkpoint});
 assert.deepEqual(restored.classificationRevalidationQueue,out.classificationRevalidationQueue);assert.equal(restored.classificationRevalidationUpdates,undefined);assert.equal(restored.requiresManualReview,true);
 const warm=restoreCheckpoint({classificationRevalidationQueue:[{id:'warm',status:'needs_review'}],requiresManualReview:true,blockedUntil:'2099-02-01T00:00:00Z'},snapshot([old]),source,{discoveryProgress:checkpoint});
 assert.equal(warm.classificationRevalidationQueue[0].id,'warm');assert.equal(warm.requiresManualReview,true);assert.equal(warm.blockedUntil,'2099-02-01T00:00:00Z');
 const legacy=restoreCheckpoint(out,snapshot([old]),source,{});assert.equal(legacy.classificationRevalidationUpdates,undefined);
});

test('atomic serialization preserves queue evidence but strips transient correction receipts at every depth',async()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{atomicJson}=require('../scripts/collect-catalog.cjs');
 const {out}=await corrected(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'aqua-reclassification-'));
 try{const file=path.join(dir,'state.json'),value={sources:{fixture:out},classificationRevalidationUpdates:out.classificationRevalidationUpdates};atomicJson(file,value);const saved=JSON.parse(fs.readFileSync(file,'utf8'));assert.equal(saved.classificationRevalidationUpdates,undefined);assert.equal(saved.sources.fixture.classificationRevalidationUpdates,undefined);assert.deepEqual(saved.sources.fixture.classificationRevalidationQueue,JSON.parse(JSON.stringify(out.classificationRevalidationQueue)));assert.equal(out.classificationRevalidationUpdates.length,1);assert.ok(!fs.existsSync(file+'.tmp'));}
 finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('gear publication accepts only the exact freshly authorized correction, not unrelated live rows',async()=>{
 const {old,out,update}=await corrected(),unrelated={...update,id:'unrelated',collector_key:'fixture:999:default',retailer_product_id:'999',product_url:product(999)};
 const result=applyUpdates(snapshot([old]),{fixture:{...out,products:[update,unrelated],updatedKeys:[update.collector_key,unrelated.collector_key]}},'gear');
 assert.equal(result.snapshot.items.length,1);assert.equal(result.snapshot.items[0].id,old.id);assert.equal(result.snapshot.items[0].type,'live');
});

test('correction authorization rejects stale, altered, cached, unsupported and mismatched evidence',async()=>{
 const {old,out,update}=await corrected();
 const cases=[
  ['missing proof',{}, {classificationRevalidationUpdates:[]}],
  ['cached receipt',{}, {proof:{cacheHit:true}}],
  ['wrong previous time',{}, {proof:{previousObservedAt:'2000-01-01T00:00:00Z'}}],
  ['wrong source',{}, {proof:{sourceId:'other'}}],
  ['wrong collector',{}, {proof:{collectorKey:'other'}}],
  ['wrong update digest',{}, {proof:{updateSha256:'0'.repeat(64)}}],
  ['receipt observation mismatch',{}, {proof:{observedAt:'2026-10-10T00:00:00.001Z'}}],
  ['unverified status',{}, {proof:{status:'pending'}}],
  ['old version',{}, {proof:{version:0}}],
  ['wrong origin type',{}, {proof:{fromType:'live'}}],
  ['invalid receipt time',{}, {proof:{observedAt:'invalid'}}],
  ['pre-attempt evidence',{}, {proof:{attemptStartedAt:'2099-01-01T00:00:00Z'}}],
  ['post-verification evidence',{}, {proof:{verifiedAt:'2000-01-01T00:00:00Z'}}],
  ['changed data',{price_amount:1999},{}],
  ['wrong variant',{variant_id:'unexpected'},{}],
  ['wrong product URL',{product_url:product(999)},{}],
  ['replacement deletion',{replaces_snapshot_id:old.id},{}],
  ['missing basis',{classification_basis:null},{}],
  ['missing evidence',{classification_evidence:null},{}],
  ['conflicted evidence',{classification_evidence:{conflicts:true}},{}],
  ['unsupported subtype',{subtype:'crab'},{}]
 ];
 for(const [label,patch,changes]of cases){const changed={...update,...patch},st={...out,...changes};if(changes.proof)st.classificationRevalidationUpdates=[{...out.classificationRevalidationUpdates[0],...changes.proof}];assert.equal(canPublishCorrection(old,changed,st),false,label);for(const mode of ['gear','live','all','reconcile']){const result=applyUpdates(snapshot([old]),{fixture:{...st,products:[changed]}},mode);assert.deepEqual(result.snapshot.items,[old],label+' in '+mode);}}
 assert.equal(canPublishCorrection(undefined,update,out),false);assert.equal(canPublishCorrection({...old,type:'live'},update,out),false);assert.equal(out.classificationRevalidationUpdates[0].updateSha256,digest(update));
});


test('an interrupted unpublished correction plus fresh price cannot bypass failed revalidation in any publication mode',async()=>{
 const {old,out}=await corrected(),snap=snapshot([old]),restored=restoreCheckpoint(JSON.parse(JSON.stringify(out,(key,value)=>key==='classificationRevalidationUpdates'?undefined:value)),snap,source,{});
 const {collectSource}=require('../scripts/collector/engine.cjs');
 const ambiguous='체리새우 10마리 생물 포장비 3000원';
 for(const response of [500,404,'ambiguous']){
  const runtime=transport({[old.product_url]:detail(old,{title:ambiguous,price:1250})},{at:'2026-10-11T00:00:00.000Z'});
  const refreshed=await collectSource({...source,products:[{url:old.product_url,type:'live',subtype:'shrimp',existingId:old.id}]},restored,runtime);
  assert.equal(refreshed.products[0].type,'live');assert.equal(refreshed.products[0].price_amount,1250);
  const freshRuntime=transport({[old.product_url]:response==='ambiguous'?detail(old,{title:ambiguous,price:1250}):response},{at:'2026-10-11T00:00:01.000Z'});
  const failed=await revalidateExisting(source,seed,refreshed,snap,freshRuntime);
  assert.equal(failed.classificationRevalidationUpdates.length,0);assert.equal(canPublishCorrection(old,failed.products[0],failed),false);
  for(const mode of ['gear','live','all','reconcile'])assert.deepEqual(applyUpdates(snap,{fixture:failed},mode).snapshot.items,[old],response+' in '+mode);
 }
});

test('fresh existing-ID correction is accepted in every mode while ID and replacement evasions are rejected',async()=>{
 const {old,out,update}=await corrected();
 for(const mode of ['gear','live','all','reconcile']){
  const accepted=applyUpdates(snapshot([old]),{fixture:out},mode);assert.equal(accepted.snapshot.items[0].type,'live');assert.equal(accepted.snapshot.items[0].id,old.id);
  for(const patch of [{id:'changed-id'},{id:'changed-id',replaces_snapshot_id:old.id},{id:'changed-id',collector_key:'fixture:999:default',retailer_product_id:'999',replaces_snapshot_id:old.id}]){
   const changed={...update,...patch},state={...out,products:[changed],updatedKeys:[changed.collector_key]};assert.equal(canPublishCorrection(old,changed,state),false);
   assert.deepEqual(applyUpdates(snapshot([old]),{fixture:state},mode).snapshot.items,[old],mode+' '+JSON.stringify(patch));
  }
 }
});

test('v3 report projection preserves untouched gear queue and keeps shared-product variant decisions independent',()=>{
 const {reportProgress}=require('../scripts/collect-catalog.cjs');
 assert.equal(typeof reportProgress,'function','Admin v3 checkpoint projection is required');
 const oldQueue=['A','D'].map(suffix=>({id:'variant-'+suffix,collectorKey:'fixture:6687:'+suffix,key:'example.invalid:6687',previousType:'gear',status:'pending',attempts:0}));
 const oldSummary={attemptedPages:0,correctedOffers:0},old={classificationRevalidationQueue:oldQueue,classificationRevalidationSummary:oldSummary};
 const nextQueue=[{...oldQueue[0],status:'corrected',attempts:1},{...oldQueue[1],status:'needs_review',attempts:1}],nextSummary={attemptedPages:1,correctedOffers:1};
 const next={products:[],classificationRevalidationQueue:nextQueue,classificationRevalidationSummary:nextSummary};
 for(const discoveryLanes of [[],['live']]){
  const projected=reportProgress(next,old,{priceModes:['live'],discoveryLanes});
  assert.deepEqual(projected.classificationRevalidationQueue,oldQueue);assert.deepEqual(projected.classificationRevalidationSummary,oldSummary);
 }
 for(const discoveryLanes of [['gear'],['live','gear']]){
  const projected=reportProgress(next,old,{priceModes:['gear'],discoveryLanes});
  assert.deepEqual(projected.classificationRevalidationQueue,nextQueue);assert.deepEqual(projected.classificationRevalidationSummary,nextSummary);
  assert.equal(new Set(projected.classificationRevalidationQueue.map(entry=>entry.id)).size,2);
 }
});
