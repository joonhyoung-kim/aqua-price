'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {parseProductPage}=require('../scripts/collector/product-jsonld.cjs');const {collectSource,reconcile,robotsAllows}=require('../scripts/collector/engine.cjs');
// Synthetic fixture facts only; no network calls and no publication.
const NOW=Date.parse('2026-10-08T12:00:00Z');
const ctx={url:'https://example.invalid/product/test/12/',domain:'example.invalid',sourceId:'test',name:'TEST',type:'live',subtype:'fish',photosAllowed:true,observedAt:new Date(NOW).toISOString()};
function page(price=1000,availability='InStock',extra={}) { const product={'@type':'Product',name:'TEST FISH',sku:'SKU-12',image:'https://example.invalid/fish.jpg',offers:{'@type':'Offer',price:String(price),priceCurrency:'KRW',availability:'https://schema.org/'+availability},...extra};return '<h1>TEST FISH</h1><p>'+Number(price).toLocaleString('en-US')+'원</p><script type="application/ld+json">'+JSON.stringify({'@graph':[product]})+'</script>'; }
const source={id:'test',name:'TEST',sourceDomain:'example.invalid',officialURL:'https://example.invalid/',technicalReadiness:'adapter_sample_tested',enabled:true,photosAllowed:true,delayMs:10,cacheTtlMs:1000,maxRequests:4,maxBytes:100000,timeoutMs:1000,products:[{url:ctx.url,type:'live',subtype:'fish'}]};
const httpImage='http://example.invalid/fish.jpg',verifiedImage={httpsUrl:'https://example.invalid/fish.jpg',checkedAt:'2026-10-08T13:00:00Z',contentType:'image/jpeg',sha256:'a'.repeat(64)};
test('HTTP photos require an exact recorded same-host HTTPS image verification',()=>{
 const html=page(1000,'InStock',{image:httpImage});assert.equal(parseProductPage(html,ctx).items[0].photo,null);
 const checked={...ctx,verifiedPhotoUrls:{[httpImage]:verifiedImage}};assert.equal(parseProductPage(html,checked).items[0].photo.verified_https_url,verifiedImage.httpsUrl);
 for(const record of [{...verifiedImage,httpsUrl:'https://other.invalid/fish.jpg'},{...verifiedImage,httpsUrl:'https://example.invalid/another.jpg'},{...verifiedImage,sha256:''},{...verifiedImage,checkedAt:'unknown'},{...verifiedImage,contentType:'text/html'}])assert.equal(parseProductPage(html,{...checked,verifiedPhotoUrls:{[httpImage]:record}}).items[0].photo,null);
 assert.equal(parseProductPage(html,{...checked,photosAllowed:false}).items[0].photo,null);
});
test('a verified image mapping never advances cached product or source success timestamps',async()=>{
 const old=new Date(NOW-100).toISOString(),prior={collectorLastSuccess:old,cache:{[ctx.url]:{text:page(1000,'InStock',{image:httpImage}),fetchedAt:old}}};
 const out=await collectSource({...source,verifiedPhotoUrls:{[httpImage]:verifiedImage}},prior,{now:()=>NOW,sleep:async()=>{},fetch:async u=>{assert.ok(u.endsWith('/robots.txt'));return new Response('User-agent: *\nAllow: /');}});
 assert.equal(out.products[0].photo.verified_https_url,verifiedImage.httpsUrl);assert.equal(out.products[0].observed_at_utc,old);assert.equal(out.collectorLastSuccess,old);
});
test('discovered products use only the source recorded photo mapping',async()=>{
 const {verifyDiscovered}=require('../scripts/collector/verify-discovered.cjs');const out=await verifyDiscovered({...source,verifiedPhotoUrls:{[httpImage]:verifiedImage}},{maxProductVerifications:1,categories:[]},[{url:ctx.url,type:'live',subtype:'fish',mixedCategories:false}],{}, {now:()=>NOW,sleep:async()=>{},fetch:async u=>new Response(u.endsWith('/robots.txt')?'User-agent: *\nAllow: /':page(1000,'InStock',{image:httpImage}))});assert.equal(out.products[0].photo.verified_https_url,verifiedImage.httpsUrl);assert.equal(out.products[0].subtype,'fish');
});
test('identical names and retailer-local IDs stay distinct across different sellers when published',()=>{
 const a=parseProductPage(page(),{...ctx,sourceId:'seller-A'}).items[0],b=parseProductPage(page(),{...ctx,sourceId:'seller-B',domain:'second.invalid',url:'https://second.invalid/product/test/12/'}).items[0];
 assert.equal(a.title,b.title);assert.equal(a.retailer_product_id,b.retailer_product_id);assert.notEqual(a.id,b.id);
 const {applyUpdates}=require('../scripts/collector/publish.cjs'),snapshot=require('../dist/source-snapshot.json'),out=applyUpdates(snapshot,{a:{status:'success',cacheOnly:false,products:[a],updatedKeys:[a.collector_key]},b:{status:'success',cacheOnly:false,products:[b],updatedKeys:[b.collector_key]}});
 assert.equal(out.catalog.products.filter(p=>[a.id,b.id].includes(p.id)).length,2);assert.equal(new Set(out.catalog.products.filter(p=>[a.id,b.id].includes(p.id)).map(p=>p.sellerId)).size,2);
});
function namedPage(visibleName,declaredName) {
 const product={'@type':'Product',name:declaredName,sku:'SKU-WS-12',offers:{'@type':'Offer',price:1000,priceCurrency:'KRW'}};
 return '<h1>'+visibleName+'</h1><p>1,000원</p><script type="application/ld+json">'+JSON.stringify(product)+'</script>';
}
test('Unicode whitespace differences corroborate identity without changing source names or SKU facts',()=>{
 const declared=' \t블랙\u00a0 \u2003스윗\u0085쉬림프 \u3000(1~1.5cm)\uFEFF ';
 const out=parseProductPage(namedPage('블랙 스윗 쉬림프 (1~1.5cm)',declared),ctx);
 assert.equal(out.status,'success');assert.deepEqual(out.issues,[]);
 assert.equal(out.items[0].title,declared.trim());assert.equal(out.items[0].retailer_product_id,'SKU-WS-12');
 assert.equal(out.items[0].price_amount,1000);assert.equal(out.items[0].registered_at,null);
 const entity=parseProductPage(namedPage('블랙&nbsp;&nbsp;스윗 쉬림프','블랙 스윗 쉬림프'),ctx);
 assert.equal(entity.status,'success');
});
test('identity whitespace matching never erases size, quantity, variety or Unicode digit differences',()=>{
 for(const [declared,visible]of [
  ['블랙 스윗 쉬림프 (1~1.5cm)','블랙 스윗 쉬림프 (1~2.5cm)'],
  ['스노우볼 새우 10마리 (선별불가)','스노우볼 새우 1마리 (선별불가)'],
  ['블루 벨벳 새우 10마리','레드 벨벳 새우 10마리'],
  ['네온테트라 10마리','네온테트라 １０마리'],
  ['네 온테트라','네온 테트라']
 ]){const out=parseProductPage(namedPage(visible,declared),ctx);assert.equal(out.items.length,0);assert.ok(out.issues.includes('identity_not_corroborated'));}
});
test('identity substring edges cannot match different numeric suffixes or attached variety names',()=>{
 for(const [declared,visible]of [['구피 1','구피 10'],['네온테트라','블랙네온테트라'],['테\u200b트라','테트라']]){
  const out=parseProductPage(namedPage(visible,declared),ctx);assert.equal(out.items.length,0);assert.ok(out.issues.includes('identity_not_corroborated'));
 }
});
test('group and variant property whitespace can corroborate a pack while quantity mismatches stay rejected',()=>{
 const group={'@type':'ProductGroup',name:'TEST\u2003FISH',productGroupID:'group-12',hasVariant:[{'@type':'Product',name:'TEST FISH variant',sku:'pack-10',quantitativeValue:{unitCode:'C62',value:10},additionalProperty:[{name:'수량',value:'10\u00a0마리'}],offers:{'@type':'Offer',price:1000,priceCurrency:'KRW'}}]};
 const html='<h1>TEST FISH</h1><select><option>10 마리</option></select><p>1,000원</p><script type="application/ld+json">'+JSON.stringify(group)+'</script>';
 const out=parseProductPage(html,ctx);assert.equal(out.items.length,1);assert.equal(out.items[0].quantity_per_pack,10);assert.equal(out.items[0].variant_id,'pack-10');
 const wrong=parseProductPage(html.replace('<option>10 마리</option>','<option>1 마리</option>'),ctx);assert.equal(wrong.items.length,0);assert.ok(wrong.issues.includes('identity_not_corroborated'));
});
test('one uncorroborated variant price remains an issue and cannot be supplied by normalization',async()=>{
 const group={'@type':'ProductGroup',name:'야마토 새우 10마리',productGroupID:'716',hasVariant:[10,1].map(q=>({'@type':'Product',name:'야마토 새우 10마리 '+q+'마리',sku:'716-'+q,additionalProperty:[{name:'수량',value:q+'마리'}],offers:{'@type':'Offer',price:q===10?6900:1000,priceCurrency:'KRW'}}))};
 const html='<h1>야마토 새우 10마리</h1><select><option>10마리</option><option>1마리</option></select><p>6,900원</p><script type="application/ld+json">'+JSON.stringify(group)+'</script>';
 const out=parseProductPage(html,ctx);assert.deepEqual(out.items.map(p=>p.price_amount),[6900]);assert.ok(out.issues.includes('visible_price_unverified'));
 const {verifyDiscovered}=require('../scripts/collector/verify-discovered.cjs');
 const verified=await verifyDiscovered({...source,delayMs:0},{maxProductVerifications:1},[{url:ctx.url,type:'live',subtype:'shrimp'}],{},runtime(response(200,html)));
 assert.equal(verified.products.length,0);assert.equal(verified.status,'partial_failure');assert.equal(verified.deferredCandidateKeys.length,1);
});
test('deadline defers a long robots wait without bypassing it or making a request',async()=>{
 const {request}=require('../scripts/collector/engine.cjs');let fetched=0,slept=0;
 await assert.rejects(request(ctx.url,{...source,delayMs:10000},{now:()=>NOW,deadline:NOW+5000,lastRequest:NOW,requests:0,sleep:async()=>{slept++},fetch:async()=>{fetched++}},{cache:{}}),/execution_deadline/);
 assert.equal(fetched,0);assert.equal(slept,0);
});
test('deadline retains fresh verified products and lastgood while stopping the remaining URLs',async()=>{
 let calls=0;const r={now:()=>NOW+calls*100,deadline:NOW+1150,sleep:async()=>{},fetch:async url=>{calls++;return response(200,url.endsWith('/robots.txt')?'User-agent: *\nAllow: /':page())}};
 const s=await collectSource({...source,products:[...source.products,{...source.products[0],url:'https://example.invalid/product/other/13/'}]},{products:[{id:'old',collector_key:'old'}]},r);
 assert.equal(s.status,'budget_limited');assert.equal(calls,2);assert.equal(s.products.length,2);assert.equal(s.updatedKeys.length,1);assert.equal(s.deletionAllowed,false);assert.ok(s.errors.includes('execution_deadline'));
});
function response(status,text=''){return {status,ok:status>=200&&status<300,headers:{get:()=>null},text:async()=>text};}
function runtime(productResponse=response(200,page()),robots='User-agent: *\nAllow: /') {const calls=[];return {calls,now:()=>NOW,sleep:async()=>{},fetch:async(url,options)=>{calls.push({url,options});return response(200,robots) && url.endsWith('/robots.txt')?response(200,robots):productResponse;}};}
test('JSON-LD graph parser preserves identity, visible KRW price, unknown dates/shipping and separate provenance',()=>{const result=parseProductPage(page(),ctx);assert.equal(result.status,'success');const p=result.items[0];assert.equal(p.price_amount,1000);assert.equal(p.retailer_product_id,'SKU-12');assert.equal(p.variant_id,null);assert.equal(p.source_kind,'direct_retailer_product_page');assert.equal(p.registered_at,null);assert.equal(p.shipping_amount,null);assert.equal(p.available,true);assert.equal(p.photo.verified_https_url,'https://example.invalid/fish.jpg');});
test('missing JSON-LD price never consumes script price 0; aggregate lowPrice is not an offer price',()=>{const noPrice=page(0,'InStock',{offers:{'@type':'Offer',priceCurrency:'KRW'}})+'<script>var product_price=0;</script>';assert.equal(parseProductPage(noPrice,ctx).status,'parse_failed');assert.equal(parseProductPage(page(1000,'InStock',{offers:{'@type':'AggregateOffer',lowPrice:'1000',priceCurrency:'KRW'}}),ctx).items.length,0);});
test('price must be corroborated outside scripts, zero is accepted only when explicitly offered and visible',()=>{assert.equal(parseProductPage(page().replace('<p>1,000원</p>',''),ctx).items.length,0);assert.equal(parseProductPage(page(0),ctx).items[0].price_amount,0);});
test('parser requires verified categories and safe URLs, separates variants and stock state',()=>{assert.equal(parseProductPage(page(),{...ctx,subtype:undefined}).items.length,0);assert.equal(parseProductPage(page(1000,'OutOfStock'),ctx).items[0].available,false);assert.equal(parseProductPage(page(1000,'PreOrder'),ctx).items[0].available,null);assert.equal(parseProductPage(page(1000,'InStock',{url:'javascript:alert(1)'}),ctx).items.length,0);const offers=[{price:'1000',priceCurrency:'KRW',sku:'A'},{price:'2000',priceCurrency:'KRW',sku:'B'}];const result=parseProductPage(page(1000,'InStock',{offers})+'<p>2,000원</p>',ctx);assert.equal(result.items.length,2);assert.notEqual(result.items[0].collector_key,result.items[1].collector_key);});
test('photo permissions and malformed JSON-LD do not invent facts',()=>{assert.equal(parseProductPage(page(),{...ctx,photosAllowed:false}).items[0].photo,null);assert.equal(parseProductPage('<script type="application/ld+json">{</script>',ctx).status,'parse_failed');});
test('source success stores last-success, observed date, stable ids, and partial known-URL coverage',async()=>{const r=runtime();const state=await collectSource(source,{},r);assert.equal(state.status,'success');assert.equal(state.collectorLastSuccess,new Date(NOW).toISOString());assert.equal(state.products.length,1);assert.equal(state.coverage.paginationComplete,false);assert.equal(state.deletionAllowed,false);assert.equal(r.calls.length,2);});
test('cache hits do not refetch product or advance observed/last-success timestamp',async()=>{const oldAt=new Date(NOW-100).toISOString();const existing=parseProductPage(page(),{...ctx,observedAt:oldAt}).items;const cached={collectorLastSuccess:oldAt,cache:{[ctx.url]:{text:page(),fetchedAt:oldAt},'https://example.invalid/robots.txt':{text:'User-agent: *\nAllow: /',fetchedAt:oldAt}},products:existing};const r=runtime();const s=await collectSource(source,cached,r);assert.equal(r.calls.length,0);assert.equal(s.cacheOnly,true);assert.equal(s.products[0].observed_at_utc,oldAt);assert.equal(s.collectorLastSuccess,oldAt);});
test('HTTP403 and 429 stop source immediately with lastgood and backoff; blocked registry makes no request',async()=>{for(const code of [403,429]){const r=runtime(response(code));const previous={products:[{id:'lastgood'}],collectorLastSuccess:'2026-10-01T00:00:00Z'};const s=await collectSource(source,previous,r);assert.equal(s.status,'access_stopped');assert.deepEqual(s.products,previous.products);assert.equal(s.collectorLastSuccess,previous.collectorLastSuccess);assert.ok(Date.parse(s.blockedUntil)>NOW);const retry=runtime();await collectSource(source,s,retry);assert.equal(retry.calls.length,0);}const r=runtime();const s=await collectSource({...source,technicalReadiness:'blocked'}, {},r);assert.equal(s.status,'disabled');assert.equal(r.calls.length,0);});
test('HTTP failure, product404 and parser failure retain previous product rather than deleting',async()=>{for(const resp of [response(500),response(404),response(200,'<p>no product</p>')]){const previous={products:[{id:'keep'}]};const s=await collectSource(source,previous,runtime(resp));assert.deepEqual(s.products,previous.products);assert.ok(['failed','partial_failure'].includes(s.status));}});
test('robots denial makes no product request; longer Allow wins; unavailable robots stops probing',async()=>{assert.equal(robotsAllows('User-agent: *\nDisallow: /product',ctx.url),false);assert.equal(robotsAllows('User-agent: *\nDisallow: /\nAllow: /product/',ctx.url),true);const r=runtime(response(200,page()),'User-agent: *\nDisallow: /');const s=await collectSource(source,{},r);assert.equal(r.calls.length,1);assert.equal(s.status,'partial_failure');const noRobots=runtime();noRobots.fetch=async()=>response(404);assert.equal((await collectSource(source,{},noRobots)).status,'robots_unverified');});
test('no confirmed products, parse failure and sold out remain distinguishable',async()=>{const s=await collectSource({...source,products:[]},{},runtime());assert.equal(s.status,'no_confirmed_products');const sold=await collectSource(source,{},runtime(response(200,page(1000,'OutOfStock'))));assert.equal(sold.status,'success');assert.equal(sold.products[0].available,false);assert.equal(sold.products.length,1);});
test('add/update/out-of-stock merge and deletion require explicit complete pagination with no failures',()=>{const old=[{id:'a',price:1},{id:'b',price:2}],next=[{id:'a',price:3,available:false},{id:'c',price:4}];const partial=reconcile(old,next,{kind:'known_product_urls'});assert.equal(partial.products.length,3);assert.equal(partial.products.find(p=>p.id==='a').price,3);const full={kind:'full_catalog',paginationComplete:true,terminalPageReached:true,expectedPages:2,visitedPages:2,parseFailures:0,requestFailures:0,expectedProductCount:2};assert.deepEqual(reconcile(old,next,full).products,next);for(const field of ['paginationComplete','terminalPageReached'])assert.equal(reconcile(old,next,{...full,[field]:false}).deletionAllowed,false);assert.equal(reconcile(old,next,{...full,requestFailures:1}).deletionAllowed,false);assert.equal(reconcile(old,[],{...full,expectedProductCount:0,visitedPages:1}).products.length,2);});
test('request bounds and registered domain stop uncontrolled fetches',async()=>{const r=runtime();const s=await collectSource({...source,maxRequests:1},{},r);assert.equal(s.status,'failed');assert.equal(r.calls.length,1);const outside=runtime();assert.equal((await collectSource({...source,products:[{url:'https://outside.invalid/a',type:'gear'}]},{},outside)).status,'failed');assert.equal(outside.calls.length,1);});
test('45 registry entries retain original denominator, blocked sources and separate four extra domains',()=>{const registry=require('../sources/registry.json');assert.equal(registry.sources.length,45);assert.equal(new Set(registry.sources.map(s=>s.sourceDomain)).size,45);assert.equal(registry.originalSourcesWithSnapshot,9);assert.equal(registry.additionalSnapshotDomains.length,4);assert.equal(registry.sources.filter(s=>s.enabled).length,32);assert.ok(registry.sources.filter(s=>s.technicalReadiness==='blocked').every(s=>s.enabled===false));assert.equal(registry.collectorVerifiedSources,0);});
test('ProductGroup variants preserve four SKU packs and offer prices without an extra parent card',()=>{
 const variants=[1,5,10,20].map((qty,i)=>({'@type':'Product',name:'TEST FISH '+qty+'마리',sku:'1518-'+qty,quantitativeValue:{unitCode:'C62',value:qty},offers:{'@type':'Offer',price:[2500,10500,20000,36000][i],priceCurrency:'KRW'}}));
 const html=variants.map(p=>'<h2>'+p.name+'</h2><p>'+p.offers.price.toLocaleString('en-US')+'원</p>').join('')+'<script type="application/ld+json">'+JSON.stringify({'@type':'ProductGroup',name:'TEST FISH',hasVariant:variants})+'</script>';
 const result=parseProductPage(html,{...ctx,existingId:'old-parent'});assert.equal(result.items.length,4);assert.deepEqual(result.items.map(p=>p.quantity_per_pack),[1,5,10,20]);assert.deepEqual(result.items.map(p=>p.price_amount),[2500,10500,20000,36000]);assert.deepEqual(result.items.map(p=>p.unit_price_amount),[2500,2100,2000,1800]);assert.equal(new Set(result.items.map(p=>p.collector_key)).size,4);assert.equal(new Set(result.items.map(p=>p.id)).size,4);
});
test('publish applies only fresh successful product keys and preserves 41-product lastgood on failure',async()=>{
 const {applyUpdates}=require('../scripts/collector/publish.cjs'),snapshot=require('../dist/source-snapshot.json');
 const unchanged=applyUpdates(snapshot,{x:{status:'failed',products:[]}});assert.equal(unchanged.changes,0);assert.equal(unchanged.catalog.products.length,snapshot.items.length);
 const old=snapshot.items.find(p=>p.id==='direct_animallo_799');const update={...old,collector_key:'test:799:default',source_id:'test',price_amount:15000,observed_at_utc:'2026-10-08T12:00:00Z'};
 const result=applyUpdates(snapshot,{x:{status:'success',updatedKeys:[update.collector_key],products:[update]}},'live');assert.equal(result.changes,1);assert.equal(result.catalog.products.find(p=>p.id===old.id).price.amount,15000);assert.equal(result.catalog.products.filter(p=>p.photo.url).length,snapshot.items.filter(p=>p.photo?.verified_https_url).length);
 assert.equal(applyUpdates(snapshot,{x:{status:'success',updatedKeys:[],products:[update]}}).changes,0);assert.equal(applyUpdates(snapshot,{x:{status:'success',updatedKeys:[update.collector_key],products:[{...update,observed_at_utc:'2025-01-01T00:00:00Z'}]}}).changes,0);
 assert.equal(applyUpdates(snapshot,{x:{status:'success',updatedKeys:[update.collector_key],products:[update]}},'gear').changes,0);
});
test('Godo public fields require visible price and stock agreement, legacy sold-out feed stays gear',()=>{
 const {parseGodoPage}=require('../scripts/collector/godo-public.cjs');const c={...ctx,url:'https://example.invalid/goods/goods_view.php?goodsNo=12',expectedName:'TEST FISH'};
 const html='<h3>TEST FISH</h3><p>1,000원 상품재고 915개</p><input name="set_goods_price" value="1000"><input name="set_goods_stock" value="915"><input name="goodsNo[]" value="12">';
 const result=parseGodoPage(html,c);assert.equal(result.items[0].stock_quantity,915);assert.equal(result.items[0].available,true);assert.equal(parseGodoPage(html.replace('상품재고 915개',''),c).items[0].stock_quantity,null);assert.equal(parseGodoPage(html.replace('1,000원',''),c).status,'parse_failed');
 const legacy='<h1>TEST FEED</h1><span id="price">4,000원</span><input name="goodsno" value="12"><p>품절된 상품입니다</p>';const p=parseGodoPage(legacy,{...c,type:'gear',subtype:'feed',expectedName:'TEST FEED'},true).items[0];assert.equal(p.available,false);assert.equal(p.type,'gear');
});
test('base offer and sale metadata stay separate, won suffix and punycode are handled',()=>{
 const html=page(10000)+'<meta property="product:sale_price:amount" content="9500">';const p=parseProductPage(html,ctx).items[0];assert.equal(p.price_amount,10000);assert.equal(p.price_metadata['product:sale_price:amount'],'9500');assert.ok(!p.price_basis.includes('lowest'));
 assert.equal(parseProductPage(page().replace('1,000원','1,000 won'),ctx).items.length,1);
 const unicode={...ctx,url:'https://한국구피.com/product/test/12/',domain:'xn--2e0bb8861auda.com'};assert.equal(parseProductPage(page(),unicode).items.length,1);
});
test('group starting price verifies only group basis while preserving four concrete variant prices',()=>{
 const variants=[1,5,10,20].map((qty,i)=>({'@type':'Product',name:'TEST FISH '+qty+'마리',sku:'1518-'+qty,additionalProperty:[{name:'마릿수',value:qty+'마리'}],offers:{price:[2500,10500,20000,36000][i],priceCurrency:'KRW'}}));
 const html='<h1>TEST FISH</h1><p>2,500원</p><select><option>1마리</option><option>5마리</option><option>10마리</option><option>20마리</option></select><script type="application/ld+json">'+JSON.stringify({'@type':'ProductGroup',name:'TEST FISH',productGroupID:'group-1518',offers:{'@type':'AggregateOffer',lowPrice:2500},hasVariant:variants})+'</script>';
 const result=parseProductPage(html,{...ctx,existingId:'old-group'});assert.equal(result.items.length,4);assert.deepEqual(result.items.map(p=>p.price_amount),[2500,10500,20000,36000]);assert.ok(result.items.every(p=>p.replaces_snapshot_id==='old-group'));assert.deepEqual(result.items.map(p=>p.quantity_per_pack),[1,5,10,20]);
});

test('identity review holds exclude only those product keys and retain other verified refresh URLs',()=>{const {refreshScope}=require('../scripts/collector/refresh-scope.cjs');const a={url:'https://example.invalid/product/a/12/',type:'live',subtype:'fish'},b={url:'https://example.invalid/product/b/13/',type:'live',subtype:'fish'};const r=refreshScope({id:'test',products:[a,b],reviewHoldProducts:[{url:a.url,reason:'identity_not_corroborated'}]},{},'all',false);assert.deepEqual(r.products,[b]);assert.equal(r.summary.reviewHeldProductCount,1);});
