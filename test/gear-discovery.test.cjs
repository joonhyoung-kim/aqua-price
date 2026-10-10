'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {discoverDaily}=require('../scripts/collector/daily-discovery.cjs');
const {integrateDiscovery}=require('../scripts/collector/integrate-discovery.cjs');
const {classifyProduct}=require('../scripts/collector/classification.cjs');
const {collectSource}=require('../scripts/collector/engine.cjs');
const {categoryKey,productKey}=require('../scripts/collector/discovery.cjs');
const {scope,categoryLinks,mergeTree}=require('../scripts/collector/category-tree.cjs');
const {progress,restoreCheckpoint,takeFairCandidates}=require('../scripts/collector/queue-policy.cjs');
const {requestAllocation}=require('../scripts/collector/discovery-scope.cjs');
const {refreshScope}=require('../scripts/collector/refresh-scope.cjs');
const {revalidationCandidates}=require('../scripts/collector/classification-revalidation.cjs');
const host='https://example.invalid',gear=host+'/category/filters/10/',live=host+'/category/fish/20/',at='2026-10-09T12:00:00.000Z';
const source={id:'fixture',name:'Fixture',sourceDomain:'example.invalid',officialURL:host,enabled:true,adapter:'product_jsonld',maxRequests:20,delayMs:0,cacheTtlMs:10800000,timeoutMs:1000,maxBytes:100000,products:[]};
const seed={adapter:'cafe24_category_links',maxPages:1,maxProducts:10,maxProductVerifications:3,categories:[{url:live,label:'베타',type:'live',subtype:'fish'},{url:gear,label:'여과기',type:'gear'}]};
const product=id=>host+'/product/item/'+id+'/';
function page(ids,next){return '<ul class="prdList">'+ids.map(id=>'<a href="'+product(id)+'">item</a>').join('')+'</ul><div class="xans-product-normalpaging">'+(next?'<a href="?page='+next+'">next</a>':'')+'</div>';}
function detail(id,title='외부여과기',labels=['여과기','외부여과기']){return '<div class="ec-base-path">'+labels.map((label,i)=>'<a href="'+(i?(labels.includes('베타')||labels.includes('관상새우')?live:gear):host+'/category/all/1/')+'">'+label+'</a>').join('')+'</div><h1>'+title+'</h1><p>10,000원</p><script type="application/ld+json">'+JSON.stringify({'@type':'Product',sku:String(id),name:title,url:product(id),offers:{'@type':'Offer',price:10000,priceCurrency:'KRW',url:product(id)}})+'</script>';}
function transport(pages,options={}){const calls=[];let clock=Date.parse(at);return {calls,now:()=>clock,sleep:async ms=>{clock+=ms;},fetch:async url=>{calls.push({url,at:clock});const value=url===host+'/robots.txt'?(options.robots||'User-agent: *\nAllow: /'):pages[url];if(value===undefined)throw Error('Unexpected fixture URL '+url);return typeof value==='number'?new Response('',{status:value}):new Response(value);}};}
const state=()=>({status:'success',requests:0,products:[],updatedKeys:[],cache:{}});

test('gear-only discovery never requests pure live menus and preserves the live page/detail cursors',async()=>{
 const previous={...state(),dailyDiscovery:{cursor:{schemaVersion:1,nextCategoryIndex:7,categories:{[categoryKey(live)]:{entryUrl:live,nextUrl:live+'?page=8',seenKeys:['example.invalid:8']}}}},detailQueueCursor:4},before=structuredClone(previous),t=transport({[gear]:page([101]),[product(101)]:detail(101)});
 const out=await integrateDiscovery(source,seed,previous,{items:[]},{...t,discoveryScope:'gear'});
 assert.deepEqual(previous,before);assert.deepEqual(out.dailyDiscovery,previous.dailyDiscovery);assert.equal(out.detailQueueCursor,4);assert.ok(out.gearDailyDiscovery.cursor.categories[categoryKey(gear)]);assert.ok(out.products.some(p=>p.type==='gear'));assert.ok(t.calls.every(c=>c.url!==live));assert.ok(out.requests<=source.maxRequests);assert.equal(out.discoverySummary.discoveryScope,'gear');
});
test('all discovery budgets and rotates both live and gear lanes, retaining separate tails',async()=>{
 const t=transport({[gear]:page([101],2),[live]:page([201],2),[product(101)]:detail(101),[product(201)]:detail(201,'베타 1마리',['생물','베타'])});
 const out=await integrateDiscovery(source,seed,state(),{items:[]},{...t,discoveryScope:'all'});
 assert.equal(out.discoverySummary.discoveryScope,'all');assert.equal(out.nextDiscoveryScope,'gear');assert.equal(out.dailyDiscovery.cursor.categories[categoryKey(live)].nextUrl,live+'?page=2');assert.equal(out.gearDailyDiscovery.cursor.categories[categoryKey(gear)].nextUrl,gear+'?page=2');assert.ok(out.products.some(p=>p.type==='live'));assert.ok(out.products.some(p=>p.type==='gear'));assert.ok(out.requests<=20);assert.equal(out.discoverySummary.coverageComplete,false);
});
test('gear pagination resumes the exact observed page after product interruption and never guesses a next URL',async()=>{
 const one={...seed,maxProducts:1,categories:[seed.categories[1]]},a=await discoverDaily(source,one,{}, {...transport({[gear]:page([1,2],2)}),discoveryScope:'gear'}),b=await discoverDaily({...source,cacheTtlMs:0},one,a,{...transport({[gear]:page([1,2],2)}),discoveryScope:'gear'});
 assert.equal(a.cursor.categories[categoryKey(gear)].nextUrl,gear);assert.equal(b.products[0].url,product(2));assert.equal(b.cursor.categories[categoryKey(gear)].nextUrl,gear+'?page=2');
 const c=await discoverDaily({...source,cacheTtlMs:0},one,b,{...transport({[gear+'?page=2']:page([3])}),discoveryScope:'gear'});assert.equal(c.products[0].url,product(3));assert.equal(c.cursor.categories[categoryKey(gear)].nextUrl,null);assert.equal(c.coverage.coverageComplete,false);
});
test('named gear category rotation survives seed insertion and details share turns across categories',async()=>{
 const second=host+'/category/heaters/11/',inserted=host+'/category/light/9/',base={...seed,categories:[seed.categories[1],{url:second,type:'gear'}]},a=await discoverDaily(source,base,{}, {...transport({[gear]:page([])}),discoveryScope:'gear'});
 const b=await discoverDaily(source,{...base,categories:[{url:inserted,type:'gear'},...base.categories]},a,{...transport({[second]:page([])}),discoveryScope:'gear'});assert.equal(b.categories[0].url,second);
 const candidates=[1,2,3,4].map((n)=>({url:product(n),type:'gear',discoveredInCategory:n<4?gear:second})),selected=takeFairCandidates(candidates,2,0,Date.now(),{discoveryScope:'gear'});assert.deepEqual(selected.candidates.map(c=>c.discoveredInCategory),[gear,second]);
});
test('cold public checkpoint restores both lane states and price rotation without replacing a warm live cursor',()=>{
 const s={...state(),dailyDiscovery:{cursor:{schemaVersion:1,nextCategoryIndex:4,categories:{}}},gearDailyDiscovery:{cursor:{schemaVersion:1,nextCategoryIndex:2,categories:{[categoryKey(gear)]:{nextUrl:gear+'?page=3'}}}},gearDetailQueueCursor:2,detailQueueCursor:3,priceRefreshCursor:{gear:12},nextDiscoveryScope:'gear',classificationRevalidation:[{id:'held',autoPublish:false}]},checkpoint=progress(s),restored=restoreCheckpoint({}, {items:[]},source,{discoveryProgress:checkpoint});
 assert.deepEqual(restored.dailyDiscovery.cursor,s.dailyDiscovery.cursor);assert.deepEqual(restored.gearDailyDiscovery,s.gearDailyDiscovery);assert.equal(restored.gearDetailQueueCursor,2);assert.deepEqual(restored.priceRefreshCursor,{gear:12});assert.equal(restored.nextDiscoveryScope,'gear');assert.deepEqual(restored.classificationRevalidation,s.classificationRevalidation);
 const warm=restoreCheckpoint({dailyDiscovery:{cursor:{nextCategoryIndex:99}}},{items:[]},source,{discoveryProgress:checkpoint});assert.equal(warm.dailyDiscovery.cursor.nextCategoryIndex,99);assert.deepEqual(warm.gearDailyDiscovery,s.gearDailyDiscovery);
});
test('known gear prices retain a rotating allocation while listing and detail verification stay within one source ceiling',async()=>{
 const previous={...state(),products:Array.from({length:9},(_,i)=>({id:'known'+i,source_id:source.id,product_url:product(300+i),type:'gear'}))},allocation=requestAllocation(source),refresh=refreshScope(source,previous,'gear',true,{limit:allocation.knownProductLimit});assert.equal(refresh.products.length,3);assert.ok(allocation.discoveryRequestReserve>=10);
 const pages={[gear]:page([501])};for(const p of refresh.products)pages[p.url]=detail(Number(p.url.match(/(\d+)\/$/)[1]));pages[product(501)]=detail(501);const t=transport(pages);
 let next=await collectSource({...source,maxRequests:allocation.knownRequestLimit,products:refresh.products},previous,t);next.priceRefreshCursor=refresh.cursor;next=await integrateDiscovery(source,{...seed,categories:[seed.categories[1]]},next,{items:[]},{...t,discoveryScope:'gear'});assert.ok(next.products.some(p=>p.retailer_product_id==='501'));assert.ok(next.requests<=20);assert.equal(t.calls.length,next.requests);const following=refreshScope(source,next,'gear',true,{limit:allocation.knownProductLimit});assert.equal(following.products[0].existingId,'known3');
});
for(const code of [403,429])test('gear HTTP'+code+' stops immediately, retains all lane state, and prevents a retry',async()=>{
 const previous={...state(),dailyDiscovery:{cursor:{schemaVersion:1,categories:{},nextCategoryIndex:4}}},t=transport({[gear]:code}),out=await integrateDiscovery(source,seed,previous,{items:[]},{...t,discoveryScope:'gear'});assert.equal(t.calls.length,2);assert.equal(out.httpStatus,code);assert.equal(out.requiresManualReview,code===403);assert.ok(out.blockedUntil);assert.deepEqual(out.dailyDiscovery,previous.dailyDiscovery);
 const after=await integrateDiscovery(source,seed,{...out,requests:0},{items:[]},{discoveryScope:'gear',fetch:()=>{throw Error('Must not retry');},now:()=>Date.parse(at)});assert.equal(after.requests,0);
});
test('gear robots denial, disabled sellers, unsupported adapters, and an expired deadline do not request products',async()=>{
 const denied=transport({}, {robots:'User-agent: *\nDisallow: /category/'}),out=await discoverDaily(source,seed,{}, {...denied,discoveryScope:'gear'});assert.equal(denied.calls.length,1);assert.match(out.errors[0],/robots_denied_category/);
 for(const [cfg,s,expected]of [[{...source,enabled:false},seed,'disabled'],[source,{...seed,adapter:'not_implemented'},'adapter_not_implemented']])assert.equal((await discoverDaily(cfg,s,{}, {discoveryScope:'gear',fetch:()=>{throw Error('No network');}})).status,expected);
 const expired=await discoverDaily(source,seed,{}, {discoveryScope:'gear',deadline:Date.parse(at),now:()=>Date.parse(at),fetch:()=>{throw Error('No network');}});assert.equal(expired.status,'budget_limited');assert.equal(expired.requests,0);
});
test('robots crawl delay is honored across gear listing and detail stages',async()=>{
 const t=transport({[gear]:page([101]),[product(101)]:detail(101)}, {robots:'User-agent: *\nAllow: /\nCrawl-delay: 5'}),out=await integrateDiscovery(source,seed,state(),{items:[]},{...t,discoveryScope:'gear'});assert.equal(out.products.length,1);for(let i=1;i<t.calls.length;i++)assert.ok(t.calls[i].at-t.calls[i-1].at>=5000);
});
test('observed full supply ancestry survives generic leaves, mixed menus remain mixed, and external hrefs are rejected',()=>{
 const html='<ul><li><a href="/category/filter/1/">여과기</a><ul><li><a href="/category/external/2/">외부여과기</a><ul><li><a href="/category/parts/3/">부속</a></li></ul></li></ul></li><li><a href="https://evil.invalid/category/gear/4/">히터</a></li></ul>',nodes=categoryLinks(html,gear,source,seed.adapter),leaf=nodes.find(n=>n.key==='example.invalid:3');assert.deepEqual(leaf.ancestorLabels,['여과기','외부여과기']);assert.equal(leaf.type,'gear');assert.ok(!nodes.some(n=>n.url.includes('evil')));
 assert.equal(scope('수초/수초용품').scope,'mixed');assert.equal(scope('활착유목/음성수초',['수초']).scope,'mixed');assert.notEqual(scope('이끼/청소 물고기',['시클리드']).scope,'gear');assert.equal(scope('베타',['사료']).scope,'gear');assert.equal(scope('사료',['파충류']).scope,'excluded');
 const merged=mergeTree(source,seed,{categoryTree:{nodes:[{...leaf,scope:'excluded',excluded:true,scopeVersion:2}]}},{discoveryScope:'gear'});assert.equal(merged.tree.nodes.find(n=>n.key===leaf.key).scope,'gear');
});
test('free packaging and gift-feed phrases cannot force a live product to gear; paid variant ambiguity stays in review',()=>{
 for(const title of ['생이새우 100 마리 + 전용사료증정 생물포장비없음','믹스칼라 생이새우 20 마리 / 체리새우 (생물 포장비 무료)']){const result=classifyProduct(detail(1,title,['생물','관상새우']),{title},{url:product(1),type:'gear',mixedCategories:false},seed);assert.equal(result.type,'live');assert.equal(result.subtype,'shrimp');}
 const paid='[야생베타] Betta simplex 베타 심플렉스 생물포장비 (전체생물금액 3만원 이하)';assert.equal(classifyProduct(detail(1,paid,['생물','베타']),{title:paid},{url:product(1),type:'gear'},seed).status,'needs_review');assert.equal(classifyProduct('',{title:'생물 포장비 [핫팩+스티로폼]'},{url:product(1),type:'live',subtype:'fish'},seed).type,'gear');
 assert.equal(classifyProduct(detail(1,'모델 2213',['여과기','외부여과기','부속']),{title:'모델 2213'},{url:product(1),mixedCategories:true},seed).type,'gear');
});
// Historical regression evidence must not depend on the most recent collector run.
const historicalEvidence=require('./fixtures/gear-discovery-baseline.json');
test('frozen discovery evidence retains original provenance and exact excerpt bytes',()=>{
 const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
 assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'fixtures/gear-discovery-baseline.json'))).digest('hex'),'68804ecd6f71d606073809cedb60f359876d5fa1a58c90f5cd15690190c234b3');
 assert.equal(historicalEvidence.provenance.commit,'e44719334b3423c7cc1d3781097211f087a2249d');
 assert.equal(historicalEvidence.provenance.reportSha256,'d02c51497be3e4fe9342ae01f936081df71241b34149f69a1ee06b54a46681f0');
 assert.equal(historicalEvidence.observations.length,1212);assert.equal(historicalEvidence.revalidationItems.length,10);
 for(const e of historicalEvidence.observations)assert.match(e.jsonPointer,/^\/sources\/\d+\/discoveryProgress\/categoryTree\/nodes\/\d+$/);
});
function assertRevalidationInvariants(snapshot,registry){
 const before=JSON.stringify(snapshot),candidates=registry.sources.flatMap(s=>revalidationCandidates(s,snapshot));
 assert.equal(JSON.stringify(snapshot),before);
 assert.ok(candidates.every(c=>c.requiresFreshVerification&&c.autoPublish===false&&c.preserveIdentityAndVariants));
 assert.equal(new Set(candidates.map(c=>c.id)).size,candidates.length);
 return candidates;
}
test('historical suspect offers require fresh-detail review without mutating products or merging variants',()=>{
 const snapshot={items:historicalEvidence.revalidationItems.map(e=>e.item)},registry=require('../sources/registry.json');
 const candidates=assertRevalidationInvariants(snapshot,registry);assert.equal(candidates.length,8);
 assert.equal(candidates.filter(c=>c.url.includes('/6687/')).length,2);assert.ok(!candidates.some(c=>c.url.includes('/19497/')||c.url.includes('/2513/')));
});
test('current suspect offers preserve identities and remain unmodified regardless of changing counts',()=>{
 assertRevalidationInvariants(require('../dist/source-snapshot.json'),require('../sources/registry.json'));
});
test('all expanded gear seeds retain original observed same-retailer evidence, independent of current checkpoints',()=>{
 const registry=require('../sources/registry.json'),seeds=require('../sources/discovery-seeds.json'),report=require('../sources/gear-discovery-review.json'),{ADAPTERS}=require('../scripts/collector/legacy-discovery.cjs');
 const observed=new Map(historicalEvidence.observations.map(e=>[e.sourceId+':'+categoryKey(e.node.url),e.node]));
 assert.equal(observed.size,historicalEvidence.observations.length);let added=0;
 for(const s of seeds.sources){const source=registry.sources.find(r=>r.id===s.id);for(const c of s.categories){
  if(c.reviewBasis!=='Existing observed same-retailer navigation and full supply ancestry; discovery hint only, fresh primary product verification required')continue;
  added++;assert.equal(c.type,'gear');const original=observed.get(s.id+':'+categoryKey(c.url));assert.ok(original,'Missing original observed route: '+s.id+' '+c.url);
  for(const key of ['url','label','ancestorLabels','evidencePage','evidenceObservedAt'])assert.deepEqual(c[key],original[key],s.id+' '+key+' '+c.url);
  assert.equal(c.observedHref,original.observedHref||original.url);assert.equal(scope(original.label,original.ancestorLabels||[]).scope,'gear');
  for(const url of [c.url,c.evidencePage]){const u=new URL(url);assert.ok(['http:','https:'].includes(u.protocol));assert.equal(u.username,'');assert.equal(u.password,'');assert.equal(u.hostname.replace(/^www\./,''),new URL(source.officialURL).hostname.replace(/^www\./,''));}
  assert.ok(Number.isFinite(Date.parse(c.evidenceObservedAt)));assert.ok(c.requiresProductClassification);assert.ok(ADAPTERS.has(s.adapter));
 }}
 assert.equal(added,observed.size);assert.equal(added,report.addedObservedGearMenus);assert.ok(added>1000);assert.equal(report.importedProducts,0);assert.equal(report.networkRequests,0);assert.deepEqual(report.unimplementedAdapters.map(s=>s.sourceId),['retailer-20','retailer-45']);
});
for(const includeKnown of [false,true])test('scheduled gear CLI discovers '+(includeKnown?'alongside known-price refresh':'with zero registered products')+' and preserves live checkpoints',()=>{
 const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process'),cwd=fs.mkdtempSync(path.join(os.tmpdir(),'aqua-gear-cli-')),repo=path.join(__dirname,'..'),save=(file,value)=>fs.writeFileSync(path.join(cwd,file),JSON.stringify(value));
 try{
  fs.cpSync(path.join(repo,'scripts'),path.join(cwd,'scripts'),{recursive:true});for(const dir of ['dist','sources','.collector'])fs.mkdirSync(path.join(cwd,dir));for(const file of ['data-model.js','gear-taxonomy.js'])fs.copyFileSync(path.join(repo,'dist',file),path.join(cwd,'dist',file));
  const snapshot=require('./isolated-snapshot.cjs')();save('dist/source-snapshot.json',snapshot);save('dist/collector-status.json',{sources:[]});save('sources/registry.json',{sources:[{...source,maxRequests:8,products:includeKnown?[{url:product(55),type:'gear',existingId:'known-55'}]:[]}]});save('sources/discovery-seeds.json',{sources:[{...seed,id:source.id}]});
  const oldLive={cursor:{schemaVersion:1,nextCategoryIndex:9,categories:{[categoryKey(live)]:{entryUrl:live,nextUrl:live+'?page=17',seenKeys:[]}}}};save('.collector/state.json',{sources:{[source.id]:{...state(),dailyDiscovery:oldLive,detailQueueCursor:3}}});
  save('transport.json',{[host+'/robots.txt']:'User-agent: *\nAllow: /',[gear]:page([99]),[product(99)]:detail(99),...(includeKnown?{[product(55)]:detail(55,'기존 외부여과기')}: {})});
  fs.writeFileSync(path.join(cwd,'transport.cjs'),"const fs=require('node:fs'),path=require('node:path'),pages=JSON.parse(fs.readFileSync(path.join(__dirname,'transport.json'))),calls=[];global.fetch=async url=>{calls.push(url);fs.writeFileSync(path.join(__dirname,'calls.json'),JSON.stringify(calls));if(!(url in pages))throw Error('Unexpected fixture URL '+url);return new Response(pages[url]);};");
  const result=spawnSync(process.execPath,['--require',path.join(cwd,'transport.cjs'),'scripts/collect-catalog.cjs','--mode','gear','--publish','--quiet'],{cwd,encoding:'utf8',timeout:15000});assert.equal(result.status,0,result.stderr);
  const next=JSON.parse(fs.readFileSync(path.join(cwd,'.collector/state.json'))).sources[source.id],catalog=JSON.parse(fs.readFileSync(path.join(cwd,'dist/catalog.json'))),report=JSON.parse(fs.readFileSync(path.join(cwd,'.collector/report.json')));assert.deepEqual(next.dailyDiscovery,oldLive);assert.equal(next.detailQueueCursor,3);assert.equal(report.discoveryScope,'gear');assert.ok(catalog.products.some(p=>p.name==='외부여과기'&&p.type==='gear'));assert.ok(next.requests<=8);assert.equal(report.executionBudgetMs,18*60*1000);assert.equal(report.fullCatalogCoverage,false);assert.deepEqual(JSON.parse(fs.readFileSync(path.join(cwd,'calls.json'))),[host+'/robots.txt',...(includeKnown?[product(55)]:[]),gear,product(99)]);
 }finally{fs.rmSync(cwd,{recursive:true,force:true});}
});

test('animal names on actual equipment or ornaments do not trigger livestock exclusions, while actual animals stay excluded',()=>{
 for(const title of ['크랩 섭스볼 여과재 스펀지 여과기 CAF-012-82','MANITO 거북이 해태 석상','도핀 측면여과기 FC-603 (거북이어항 여과기)']){const r=classifyProduct(detail(1,title,['어항용품','장식']),{title},{url:product(1),type:'gear'},seed);assert.equal(r.type,'gear',title);}
 for(const title of ['미니크랩 1마리','거북이 1마리'])assert.equal(classifyProduct(detail(1,title,['어항용품']),{title},{url:product(1),type:'gear'},seed).status,'excluded_scope');
});
test('a full pure-live pending backlog does not block the separate gear admission budget',async()=>{
 const previous={...state(),discoveryPending:Array.from({length:1000},(_,i)=>({url:product(1000+i),type:'live',subtype:'fish',mixedCategories:false}))},t=transport({[gear]:page([101]),[product(101)]:detail(101)}),out=await integrateDiscovery(source,seed,previous,{items:[]},{...t,discoveryScope:'gear'});assert.ok(out.products.some(p=>p.type==='gear'));assert.equal(out.discoveryPending.length,1000);assert.deepEqual(out.discoveryPending,previous.discoveryPending);assert.equal(out.discoverySummary.pendingScopeLimit,1000);assert.equal(out.discoverySummary.pendingCandidatesInScope,0);
});
test('foreign and credential-bearing structured breadcrumb URLs cannot establish supply identity',()=>{
 for(const item of ['https://evil.invalid/category/gear/7/','https://user:secret@example.invalid/category/gear/7/']){const html='<script type="application/ld+json">'+JSON.stringify({'@type':'BreadcrumbList',itemListElement:[{name:'여과기',item}]})+'</script>';const r=classifyProduct(html,{title:'베타 1마리'},{url:product(1),type:'live',subtype:'fish'},seed);assert.notEqual(r.type,'gear');}
 const noUrl='<script type="application/ld+json">'+JSON.stringify({'@type':'BreadcrumbList',itemListElement:[{name:'여과기'}]})+'</script>';assert.notEqual(classifyProduct(noUrl,{title:'베타 1마리'},{url:product(1),type:'live',subtype:'fish'},seed).type,'gear');
});
test('fish-named heaters, breeding boxes, feeders, nets and lights cannot become live from fish breadcrumbs',()=>{
 for(const title of ['베타 히터 25W','베타 전용 산란통','구피 자동 급여기','새우 뜰채 4cm','수초 LED 20W','구피 수질 테스트'])for(const type of ['gear','live']){const r=classifyProduct(detail(1,title,['생물','베타']),{title},{url:product(1),type,subtype:'fish'},seed);assert.notEqual(r.type,'live',title);}
});
test('a redirect that consumes the known-price allocation preserves refreshed rows and leaves remaining budget for discovery',async()=>{
 const allocation=requestAllocation(source),known=product(1),redirected=product(2),third=product(3),t=transport({[known]:detail(1),[redirected]:detail(2),[third]:detail(3),[gear]:page([101]),[product(101)]:detail(101)}),fetch=t.fetch,initial=product(21);t.fetch=async url=>url===initial?(t.calls.push({url,at:t.now()}),new Response('',{status:302,headers:{location:known}})):fetch(url);
 let out=await collectSource({...source,maxRequests:allocation.knownRequestLimit,products:[{url:initial,type:'gear'},{url:redirected,type:'gear'},{url:third,type:'gear'}]},state(),t);assert.equal(out.status,'budget_limited');assert.ok(out.errors.includes('request_limit'));assert.equal(out.products.length,2);assert.equal(out.updatedKeys.length,2);assert.equal(out.requests,4);out=await integrateDiscovery(source,{...seed,categories:[seed.categories[1]]},out,{items:[]},{...t,discoveryScope:'gear'});assert.ok(out.products.some(p=>p.retailer_product_id==='101'));assert.ok(out.requests<=20);assert.ok(!t.calls.some(c=>c.url===third));
});
test('old version gear reviews require a fresh primary detail before they can publish',async()=>{
 const url=product(101),html=detail(101).replace(/<div class="ec-base-path">[\s\S]*?<\/div>/,''),previous={...state(),discoveryReviewQueue:[{key:productKey(url),status:'needs_review',classificationVersion:6,candidate:{url,type:'gear',mixedCategories:false}}],cache:{[host+'/robots.txt']:{text:'User-agent: *\nAllow: /',fetchedAt:at},[url]:{text:html,fetchedAt:at}}},t=transport({[url]:html}),out=await integrateDiscovery(source,seed,previous,{items:[]},{...t,discoveryScope:'gear',pendingFirst:true});assert.deepEqual(t.calls.map(c=>c.url),[url]);assert.equal(out.products.length,1);assert.equal(out.discoveryReviewQueue.length,0);
 const failed=await integrateDiscovery(source,seed,previous,{items:[]},{...transport({[url]:500}),discoveryScope:'gear',pendingFirst:true});assert.equal(failed.products.length,0);assert.equal(failed.discoveryReviewQueue.length,1);assert.equal(failed.discoveryPending[0].requiresFreshVerification,true);
});
test('known-price cursor resumes the first unattempted URL after a redirect consumes the reserved budget',async()=>{
 const {refreshCursorAfter}=require('../scripts/collector/refresh-scope.cjs'),urls=[product(21),product(2),product(3)],configured={...source,products:urls.map(url=>({url,type:'gear'}))},allocation=requestAllocation(configured),previous=state(),first=refreshScope(configured,previous,'gear',true,{limit:allocation.knownProductLimit}),t=transport({[product(1)]:detail(1),[product(2)]:detail(2),[product(3)]:detail(3)}),fetch=t.fetch;t.fetch=async url=>url===product(21)?(t.calls.push({url,at:t.now()}),new Response('',{status:302,headers:{location:product(1)}})):fetch(url);
 const out=await collectSource({...configured,maxRequests:allocation.knownRequestLimit,products:first.products},previous,t);assert.equal(out.status,'budget_limited');assert.equal(out.priceRefreshCompletedCount,2);out.priceRefreshCursor=refreshCursorAfter(first,'gear',out.priceRefreshCompletedCount);assert.equal(out.priceRefreshCursor.gear,2);const second=refreshScope(configured,out,'gear',true,{limit:allocation.knownProductLimit});assert.equal(second.products[0].url,product(3));
});
test('an old review already in a saturated gear queue still receives the mandatory fresh-verification flag',async()=>{
 const url=product(1000),html=detail(1000).replace(/<div class="ec-base-path">[\s\S]*?<\/div>/,''),candidate={url,type:'gear',mixedCategories:false},previous={...state(),discoveryPending:[candidate,...Array.from({length:999},(_,i)=>({url:product(1001+i),type:'gear',mixedCategories:false}))],discoveryReviewQueue:[{key:productKey(url),status:'needs_review',classificationVersion:6,candidate}],cache:{[host+'/robots.txt']:{text:'User-agent: *\nAllow: /',fetchedAt:at},[url]:{text:html,fetchedAt:at}}},t=transport({[url]:html}),out=await integrateDiscovery({...source,maxRequests:1},seed,previous,{items:[]},{...t,discoveryScope:'gear',pendingFirst:true});assert.deepEqual(t.calls.map(c=>c.url),[url]);assert.equal(out.products.length,1);
});
