'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const {adminStatus}=require('../scripts/build-admin-status.cjs');
test('admin reports actual results and never treats local execution as automated success',()=>{
 const registry=require('../sources/registry.json'),snapshot=require('../dist/source-snapshot.json'),report=require('../dist/collector-status.json');
 const status=adminStatus(registry,report,snapshot,{configured:true,verifiedRun:false});assert.equal(status.sources.length,registry.sources.length);assert.equal(registry.sources.filter(s=>s.original45).length,45);assert.equal(status.sources.filter(s=>s.autoRefreshVerified).length,0);assert.equal(status.sources.filter(s=>s.fullCatalogCoverage).length,0);
 for(const s of status.sources){assert.equal(s.discovery.coverageComplete,false);assert.equal(s.discovery.newProductDiscovery,['cafe24_category_links','makeshop_category_links','godo_category_links','imweb_category_links','wpet_category_links'].includes(s.discovery.adapter));assert.equal(s.snapshotProductCount,snapshot.items.filter(p=>p.seller_domain===s.domain).length);}
});
test('admin contains only read-only navigation and escapes retailer text',()=>{
 const js=fs.readFileSync('dist/admin/app.js','utf8'),html=fs.readFileSync('dist/admin/index.html','utf8');assert.match(js,/escapeText/);assert.doesNotMatch(js,/localStorage|method\s*:\s*['"](?:POST|PUT|DELETE)/);assert.match(html,/github\.com\/joonhyoung-kim\/aqua-price\/edit\/preview\/sources\/collector-controls\.json/);
});
test('publisher adds a new product without photo and preserves failed-source lastgood',()=>{
 const {applyUpdates}=require('../scripts/collector/publish.cjs'),snapshot=require('../dist/source-snapshot.json');const product=structuredClone(snapshot.items[0]);product.id='synthetic-test-only';product.collector_key=product.id;product.photo=null;
 const output=applyUpdates(snapshot,{ok:{status:'success',cacheOnly:false,products:[product],updatedKeys:[product.id]},failed:{status:'failed',products:[],updatedKeys:[]}});assert.equal(output.snapshot.items.length,snapshot.items.length+1);assert.equal(output.catalog.products.at(-1).photo.url,null);
});
test('admin discovery column matches header, lists escaped names and hides cursor URLs',async()=>{const vm=require('node:vm'),nodes={};for(const id of ['query','statusFilter','rows','summary','automation','updated','scope'])nodes[id]={value:id==='statusFilter'?'all':'',innerHTML:'',textContent:'',addEventListener(){}};const source={id:'x',name:'safe',domain:'example.invalid',officialUrl:'https://example.invalid',enabled:true,collectorStatus:'success',technicalReadiness:'ready',snapshotProductCount:1,collectorProductCount:1,blockers:[],discovery:{mappedSeedCount:1,status:'budget_limited',cursorCategories:[{entryUrl:'<script>bad</script>',nextUrl:'<img src=x>'}],reviewQueue:[{key:'one',title:'<script>bad</script>',url:'https://example.invalid/product/private-long-url'}],errors:['<img onerror=x>']}};vm.runInNewContext(fs.readFileSync('dist/admin/app.js','utf8'),{document:{querySelector:s=>nodes[s.slice(1)]},fetch:async()=>({ok:true,json:async()=>({schemaVersion:1,sources:[source],automation:{configured:true,verifiedRun:false},additionalSnapshotDomains:[],discoveryScope:{mappedSources:32,observedSeeds:139,adapterEnabledSources:26},generatedAt:'test'})})});await new Promise(resolve=>setImmediate(resolve));assert.equal((nodes.rows.innerHTML.match(/<td\b/g)||[]).length,7);assert.equal((fs.readFileSync('dist/admin/index.html','utf8').match(/<th>/g)||[]).length,7);assert.ok(!nodes.rows.innerHTML.includes('<script>'));assert.match(nodes.rows.innerHTML,/&lt;script&gt;/);assert.ok(!nodes.rows.innerHTML.includes('private-long-url'));assert.ok(!nodes.rows.innerHTML.includes('&lt;img src=x&gt;'));assert.match(nodes.rows.innerHTML,/발견 현황/);assert.match(nodes.scope.textContent,/32곳/);assert.match(nodes.scope.textContent,/139개/);assert.match(nodes.rows.innerHTML,/접근 확인 · 부분 수집/);assert.match(nodes.rows.innerHTML,/전체 탐색 완료: 미검증/);});


test('admin cadence is derived from current schedule metadata, never a stale hardcoded promise',()=>{
 const {scheduleText}=require('../scripts/build-admin-status.cjs');
 assert.equal(scheduleText({scheduleUTC:{live:'17 */6 * * *',gear:'29 */12 * * *',reconcile:'43 2 * * *'}}),'생물 6시간마다 / 용품 12시간마다 / 목록 대조 매일 02:43 (UTC · 설정 기준)');
 assert.equal(scheduleText({}),'예약 주기 미확인');
 assert.match(scheduleText({scheduleUTC:{gear:'29 */8 * * *'}}),/8시간마다/);
 const registry={additionalSnapshotDomains:[],sources:[{id:'x',sourceDomain:'x.invalid',enabled:true}]};
 const report={sources:[{id:'x',status:'success',collectorLastSuccess:'2026-01-01T00:00:00Z'}]},snapshot={items:[]};
 const automation={configured:true,verifiedRun:false,scheduleUTC:{gear:'29 */12 * * *'}};
 const status=adminStatus(registry,report,snapshot,automation);
 assert.match(status.sources[0].schedule,/용품 12시간마다/);
 assert.equal(status.sources[0].collectorLastSuccess,'2026-01-01T00:00:00Z');assert.equal(status.sources[0].autoRefreshVerified,false);
});


test('served admin snapshot uses current configured cadence without rewriting run history',()=>{
 const served=JSON.parse(fs.readFileSync('dist/admin/status.json','utf8')),config=require('../sources/automation-status.json');
 assert.deepEqual(served.automation.scheduleUTC,config.scheduleUTC);
 const {scheduleText}=require('../scripts/build-admin-status.cjs');
 assert.match(scheduleText(served.automation),/생물 6시간마다 \/ 용품 12시간마다/);
});


test('candidate name projection deduplicates identities, never derives names from URLs or unrelated catalog rows',()=>{
 const {discoveryProductNames}=require('../scripts/build-admin-status.cjs');
 const candidate='https://example.invalid/product/never-use-this-slug/1/';
 const run={discoveryProgress:{pendingCandidates:[{url:candidate},{url:'https://example.invalid/product/unobserved-name/2/'}],reviewQueue:[{key:'example.invalid:1',url:candidate,title:'관찰 상품 A'}],discoveryLedger:{entries:[{url:'https://example.invalid/product/excluded/3/',title:'범위 제외',status:'excluded'},{url:'https://example.invalid/product/gear/4/',title:'여과기',status:'included'}]}},discovery:{reviewQueue:[{key:'example.invalid:1',title:'관찰 상품 A'}]}};
 const out=discoveryProductNames(run,[{product_url:'https://example.invalid/product/detail.html?product_no=4',title:'여과기'},{product_url:'https://example.invalid/product/unrelated/99/',title:'목록에 없는 상품'}]);
 assert.deepEqual(out,{names:['관찰 상품 A','여과기'],unnamedCount:1,candidateCount:3});
 assert.deepEqual(discoveryProductNames({},[{product_url:candidate,title:'전체 카탈로그 행을 발견 후보로 사용하지 않음'}]),{names:[],unnamedCount:0,candidateCount:0});
});
test('name projection can resolve an observed candidate using a verified same-product catalog title',()=>{
 const {discoveryProductNames}=require('../scripts/build-admin-status.cjs');
 const out=discoveryProductNames({discoveryProgress:{pendingCandidates:[{url:'https://example.invalid/product/slug/5/category/2/'}]}},[{product_url:'https://example.invalid/product/detail.html?product_no=5',title:'확인 상품명'},{product_url:'https://other.invalid/product/detail.html?product_no=5',title:'다른 판매처'}]);
 assert.deepEqual(out.names,['확인 상품명']);assert.equal(out.unnamedCount,0);
});
test('name-only cell is compact, escaped, URL-free and supports older status JSON',()=>{
 const vm=require('node:vm'),source=fs.readFileSync('dist/admin/app.js','utf8'),nodes={};for(const id of ['query','statusFilter'])nodes[id]={addEventListener(){}};
 const context=vm.createContext({document:{querySelector:s=>nodes[s.slice(1)]},fetch:()=>new Promise(()=>{})});vm.runInContext(source,context);
 const rendered=vm.runInContext(`discoveryCell({discovery:{productNames:{names:['A','B','C','D','E','<img src=x>'],unnamedCount:2}}})`,context);
 assert.match(rendered,/상품명 1개 더 보기/);assert.match(rendered,/&lt;img src=x&gt;/);assert.match(rendered,/상품명 확인 대기 2개/);assert.doesNotMatch(rendered,/<a\b|href=|<img\b/);
 const legacy=vm.runInContext(`discoveryCell({discovery:{reviewQueue:[{key:'x',url:'https://example.invalid/product/never-derive/1/'},{key:'y',title:'이름만',reason:'https://example.invalid/reason'}],cursorCategories:[{entryUrl:'https://example.invalid/category/2/'}]}})`,context);
 assert.match(legacy,/이름만/);assert.match(legacy,/상품명 확인 대기 1개/);assert.doesNotMatch(legacy,/example\.invalid|never-derive/);
});

test('admin safety decision preserves durable holds despite an older checkpoint',()=>{
 const {validateControls}=require('../scripts/collector/controls.cjs');const source={id:'a',name:'A',sourceDomain:'example.invalid',enabled:true},registry={sources:[source]},controls=validateControls({schemaVersion:1,intervalsHours:{live:6,gear:12,reconcile:24},sources:{a:{enabled:true}}},registry);
 const manual=adminStatus(registry,{sources:[{id:'a',requiresManualReview:true,discoveryProgress:{requiresManualReview:false}}]},{items:[]},{},controls);assert.equal(manual.sources[0].control.effectiveEnabled,false);assert.equal(manual.sources[0].control.reason,'manual_review');
 const future=new Date(Date.now()+86400000).toISOString();const blocked=adminStatus(registry,{sources:[{id:'a',blockedUntil:future,discoveryProgress:{blockedUntil:null}}]},{items:[]},{},controls);assert.equal(blocked.sources[0].control.effectiveEnabled,false);assert.equal(blocked.sources[0].control.reason,'backoff');
});
