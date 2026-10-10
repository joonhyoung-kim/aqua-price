'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {parseProductPage,validatedPrimaryProductEvidence}=require('../scripts/collector/product-jsonld.cjs');
const {classifyProduct}=require('../scripts/collector/classification.cjs');
// Synthetic reconstruction of identity/option shapes only. No network or publication.
const HOST='https://aquapro.kr',NAME='[야생베타] Betta simplex 베타 심플렉스',GROUP='cafe24_pucu32_1_6687';
const URL=HOST+'/product/야생베타-betta-simplex-베타-심플렉스/6687/';
const CATEGORY=HOST+'/product/list.html?cate_no=1177',OBSERVED='2026-10-09T12:00:00.000Z';
const OPTIONS=['생물포장비 (전체생물금액 3만원 이하)','고속버스택배비(고택)','3만원 이상 (미선택)','생물 포장비는 1회만 결제해주시면 됩니다.'];
const PRICES=[14500,32000,12000,12000];
const context={url:URL,domain:'aquapro.kr',sourceId:'retailer-07',name:'아쿠아프로 트레이딩',type:'gear',observedAt:OBSERVED};
const candidate={url:URL,type:'gear'},seed={categories:[{url:CATEGORY,label:'베타',type:'live',subtype:'fish'}]};
function group(){return {'@type':'ProductGroup',name:NAME,productGroupID:GROUP,url:URL,offers:{'@type':'AggregateOffer',lowPrice:12000,priceCurrency:'KRW'},hasVariant:OPTIONS.map((value,i)=>{
 const code='P0000JXF000'+'ABCD'[i],url=URL+'?item_code='+code;
 return {'@type':'Product',name:NAME+' '+value,sku:GROUP+'_'+code,url,additionalProperty:[{'@type':'PropertyValue',name:'생물포장비 선택',value}],offers:{'@type':'Offer',url,price:PRICES[i],priceCurrency:'KRW',availability:'https://schema.org/InStock'}};
})};}
function page(g=group(),{heading=g.name,options=OPTIONS,breadcrumb='베타',breadcrumbUrl=CATEGORY,extra=''}={}){
 const crumb=breadcrumb===null?'':'<div class="ec-base-path"><a href="'+breadcrumbUrl+'">'+breadcrumb+'</a></div>';
 return crumb+'<h2>'+heading+'</h2><p>12,000원</p><select>'+options.map(value=>'<option>'+value+'</option>').join('')+'</select>'+extra+'<script type="application/ld+json">'+JSON.stringify(g)+'</script>';
}
function run(html,ctx=context){const parsed=parseProductPage(html,ctx);return {...parsed,classifications:parsed.items.map(item=>classifyProduct(html,item,{...candidate,url:ctx.url},seed))};}
function rejected(html,label){const out=run(html);for(let i=0;i<out.items.length;i++)if(/000[AD]$/.test(out.items[i].variant_id))assert.notEqual(out.classifications[i].type,'live',label);return out;}

test('fresh visible ProductGroup keeps exact A–D identities and distinct prices while resolving packaging options to fish',()=>{
 const html=page(),out=run(html);assert.equal(out.status,'success');assert.deepEqual(out.issues,[]);assert.equal(out.items.length,4);
 assert.deepEqual(out.items.map(item=>item.price_amount),PRICES);assert.equal(new Set(out.items.map(item=>item.collector_key)).size,4);
 out.items.forEach((item,i)=>{
  const variant=group().hasVariant[i],key='retailer-07:'+GROUP+':'+variant.sku;
  assert.equal(item.id,key);assert.equal(item.collector_key,key);assert.equal(item.retailer_product_id,GROUP);assert.equal(item.variant_id,variant.sku);
  assert.equal(item.title,variant.name);assert.equal(item.product_url,variant.url);assert.deepEqual(item.variant_attributes,variant.additionalProperty);
  assert.equal(item.observed_at_utc,OBSERVED);assert.equal(item.primary_product_evidence.parent_name,NAME);assert.equal(item.primary_product_evidence.option.value,OPTIONS[i]);
  assert.equal(validatedPrimaryProductEvidence(html,item,URL).variant_id,item.variant_id);
  assert.equal(out.classifications[i].type,'live');assert.equal(out.classifications[i].subtype,'fish');
 });
});

test('classifying a ProductGroup never rewrites the original title, attributes, identity, or price',()=>{
 const html=page(),items=parseProductPage(html,context).items,before=structuredClone(items);
 for(const item of items)classifyProduct(html,item,candidate,seed);assert.deepEqual(items,before);
 // B/C also retain their pre-existing fish classification without the new record.
 for(const i of [1,2]){const item={...items[i]};delete item.primary_product_evidence;assert.equal(classifyProduct(html,item,candidate,seed).subtype,'fish');}
});

test('generic paid packaging title stays needs_review without parser-created parent evidence',()=>{
 const title=NAME+' '+OPTIONS[0],product={'@type':'Product',name:title,sku:GROUP,url:URL,offers:{price:14500,priceCurrency:'KRW'}};
 const html=page(product,{heading:title,extra:'<p>14,500원</p>'}),item=run(html).items[0];
 assert.equal(item.primary_product_evidence,undefined);assert.equal(classifyProduct(html,item,candidate,seed).status,'needs_review');
 assert.equal(classifyProduct(page(),{title},candidate,seed).status,'needs_review');
});

test('copied or tampered metadata cannot authorize an item with different bound facts',()=>{
 const html=page(),item=run(html).items[0];
 const patches=[{variant_id:GROUP+'_P0000JXF000D'},{retailer_product_id:'unrelated'},{collector_key:'another:key'},{source_id:'other-source'},{seller_domain:'elsewhere.invalid'},
  {title:'생물 포장비 [핫팩+스티로폼]'},{variant_title:'사료 110g'},{price_amount:12000},{currency:'USD'},{product_url:URL+'?item_code=P0000JXF000D'},
  {variant_attributes:[{name:'생물포장비 선택',value:'사료 110g'}]},{primary_product_evidence:{...item.primary_product_evidence,parent_name:'구피'}},
  {primary_product_evidence:{...item.primary_product_evidence,observed_at_utc:'2020-01-01T00:00:00Z'}}];
 for(const patch of patches){const changed={...item,...patch};assert.equal(validatedPrimaryProductEvidence(html,changed,URL),null,JSON.stringify(patch));assert.notEqual(classifyProduct(html,changed,candidate,seed).type,'live',JSON.stringify(patch));}
 const standalone=group().hasVariant[0],ownPage=page(standalone,{heading:standalone.name,extra:'<p>14,500원</p>'});
 assert.equal(validatedPrimaryProductEvidence(ownPage,item,URL),null);assert.notEqual(classifyProduct(ownPage,item,candidate,seed).type,'live');
});

test('current visible parent, option, exact group/member/offer URLs, SKU and relation are mandatory',()=>{
 rejected(page(group(),{heading:'다른 상품'}),'parent absent');rejected(page(group(),{options:[]}),'options absent');
 for(const change of [
  g=>delete g.url,g=>g.url=HOST+'/product/other/999/',g=>g.url=HOST+'/other?product_no=6687',g=>g.url=HOST+'/product/detail.html',g=>g.url='https://elsewhere.invalid/product/other/6687/',
  g=>g.hasVariant[0].url=HOST+'/product/other/999/',g=>g.hasVariant[0].url=URL+'?item_code=P0000JXF000D',
  g=>g.hasVariant[0].offers.url=URL+'?item_code=P0000JXF000D',g=>g.hasVariant[0].offers.sku='unrelated',
  g=>g.hasVariant[0].name=NAME+' 다른 베타 '+OPTIONS[0],g=>g.hasVariant[0].isVariantOf={productGroupID:'wrong'},
  g=>g.hasVariant[0].isVariantOf={productGroupID:'wrong',url:URL},g=>g.hasVariant[0].isVariantOf='unrelated',
  g=>g.hasVariant[0].additionalProperty.push({name:'먹이',value:'사료 110g'}),
  g=>g.hasVariant[0].additionalProperty[0].name='사료 선택',g=>g.hasVariant[0].additionalProperty=[null],
  g=>{g.hasVariant[0].additionalProperty[0].value+=' 사료 증정';g.hasVariant[0].name+=' 사료 증정';}
 ]){
  const g=group();change(g);const html=page(g),out=run(html),a=out.items.find(item=>item.variant_id===GROUP+'_P0000JXF000A');
  if(a){assert.equal(a.primary_product_evidence,undefined,String(change));assert.notEqual(classifyProduct(html,a,candidate,seed).type,'live',String(change));}
 }
});

test('unrelated recommended groups and invalid, duplicate, or reference-only membership do not prove paid identities',()=>{
 const g=group();g.url=HOST+'/product/recommended/999/';g.hasVariant.forEach(v=>{v.url=g.url+'?item_code='+v.sku.split('_').at(-1);v.offers.url=v.url;});rejected(page(g),'unrelated group');
 const duplicate=group();duplicate.hasVariant.push(structuredClone(duplicate.hasVariant[0]));const out=rejected(page(duplicate),'duplicate membership');assert.ok(out.issues.includes('duplicate_offer'));
 const duplicateGroups=[group(),group()];rejected(page(duplicateGroups,{heading:NAME}),'duplicate groups');
 const malformed=group();malformed.hasVariant=[null,7,'bad',[],{'@id':'#unresolved-member'},...malformed.hasVariant];
 const result=parseProductPage(page(malformed),context);assert.equal(result.items.length,4);for(const item of result.items)assert.equal(validatedPrimaryProductEvidence(page(malformed),item,URL),null);
 const corrupted=page()+'<script type="application/ld+json">{</script>';rejected(corrupted,'malformed current JSON-LD');
});

test('fish navigation alone, missing/foreign breadcrumb, and feed ancestry cannot activate the exception',()=>{
 rejected(page(group(),{breadcrumb:null,extra:'<nav><a href="'+CATEGORY+'">베타</a></nav>'}),'navigation only');
 rejected(page(group(),{breadcrumb:'베타',breadcrumbUrl:'https://elsewhere.invalid/category/fish/1/'}),'foreign breadcrumb');
 rejected(page(group(),{breadcrumb:'베타',breadcrumbUrl:'https://user:secret@aquapro.kr/category/fish/1/'}),'credential URL');
 for(const breadcrumb of ['사료','먹이','수초','새우','어항용품'])rejected(page(group(),{breadcrumb}),breadcrumb);
 const html=page().replace('<a href="'+CATEGORY+'">베타</a>','<a href="'+HOST+'/product/list.html?cate_no=8">사료</a><a href="'+CATEGORY+'">베타</a>');
 for(const classification of run(html).classifications)assert.equal(classification.type,'gear');
});

test('standalone fees, feed identities and supply descriptions cannot inherit a fish ProductGroup classification',()=>{
 for(const title of ['생물 포장비 [핫팩+스티로폼]','[생물구매시 필수]생물안전포장비','베타 사료 110g','관찰용 물벼룩 500~1000마리']){
  const product={'@type':'Product',name:title,sku:'fee-1',url:URL,offers:{price:12000,priceCurrency:'KRW'}};
  const html=page(product,{heading:title}),item=run(html).items[0];assert.notEqual(classifyProduct(html,item,candidate,seed).type,'live',title);
 }
 for(const where of ['group','variant','typedVariant']){
  const g=group();(where==='group'?g:g.hasVariant[0]).description='본 상품은 관상어 사료입니다';if(where==='typedVariant')g.hasVariant[0]['@type']='https://schema.org/Product';
  const html=page(g),item=run(html).items[0];assert.notEqual(classifyProduct(html,item,candidate,seed).type,'live',where);
 }
 for(const name of ['베타 사료 110g','베타 침대','관찰용 물벼룩 500~1000마리']){
  const g=group();g.name=name;g.hasVariant.forEach((variant,i)=>variant.name=name+' '+OPTIONS[i]);
  const html=page(g);for(const classification of run(html).classifications)assert.notEqual(classification.type,'live',name);
 }
});

const {collectSource}=require('../scripts/collector/engine.cjs');
const {refreshScope}=require('../scripts/collector/refresh-scope.cjs');
const {integrateDiscovery}=require('../scripts/collector/integrate-discovery.cjs');
const {revalidateExisting}=require('../scripts/collector/revalidate-existing.cjs');
const {applyUpdates}=require('../scripts/collector/publish.cjs');
function existingFixture(){
 const snapshot=structuredClone(require('../dist/source-snapshot.json'));
 snapshot.items=snapshot.items.filter(item=>item.source_id==='retailer-07'&&item.retailer_product_id===GROUP).sort((a,b)=>a.variant_id.localeCompare(b.variant_id));
 assert.equal(snapshot.items.length,4);
 // Identity provenance comes from the real rows; mutable catalog order, observation
 // times and prices must not determine this independent regression fixture.
 snapshot.items=snapshot.items.map((item,i)=>({...item,title:group().hasVariant[i].name,type:[0,3].includes(i)?'gear':'live',subtype:[0,3].includes(i)?null:'fish',price_amount:PRICES[i],observed_at_utc:'2026-10-08T00:00:00.000Z'}));
 assert.deepEqual(snapshot.items.map(item=>item.variant_id),'ABCD'.split('').map(suffix=>GROUP+'_P0000JXF000'+suffix));
 assert.deepEqual(snapshot.items.map(item=>item.type),['gear','live','live','gear']);
 return snapshot;
}
function sourceFixture(maxRequests=3){return {id:'retailer-07',name:'아쿠아프로 트레이딩',sourceDomain:'aquapro.kr',officialURL:HOST+'/',enabled:true,technicalReadiness:'adapter_sample_tested',delayMs:0,cacheTtlMs:3600000,timeoutMs:1000,maxBytes:100000,maxRequests,products:[]};}
const seedFixture={...seed,adapter:'cafe24_category_links',maxPages:1,maxProducts:10,maxProductVerifications:1,maxGearProductVerifications:1};
function transport(html,at=Date.parse(OBSERVED)){
 let wall=at;const calls=[];
 return {calls,now:()=>wall,sleep:async ms=>{wall+=ms;},fetch:async url=>{calls.push(url);if(url===HOST+'/robots.txt')return new Response('User-agent: *\nAllow: /');assert.equal(new globalThis.URL(url).pathname.includes('/6687/'),true,'Unexpected offline request '+url);return new Response(typeof html==='function'?html(calls):html);}};
}
function identityRows(items){return items.map(item=>({id:item.id,collector_key:item.collector_key,variant_id:item.variant_id,retailer_product_id:item.retailer_product_id,type:item.type,subtype:item.subtype,price_amount:item.price_amount}));}

test('real 6687 snapshot flows through gear refresh, dedicated fresh correction, gear publication and subsequent live refresh',async()=>{
 const snapshot=existingFixture(),before=structuredClone(snapshot),source=sourceFixture(),runtime=transport(page());
 const prior={products:structuredClone(snapshot.items),cache:{},updatedKeys:[]};
 const scope=refreshScope(source,prior,'gear',false,{limit:1});assert.equal(scope.products.length,1);assert.equal(scope.products[0].type,'gear');
 const refreshed=await collectSource({...source,products:scope.products},prior,runtime);
 assert.equal(refreshed.status,'success');assert.deepEqual(identityRows(refreshed.products),identityRows(snapshot.items),'Known refresh preserves each sibling classification');
 const corrected=await integrateDiscovery(source,seedFixture,refreshed,snapshot,{...runtime,discoveryScope:'gear'});
 assert.equal(corrected.classificationRevalidationSummary.correctedOffers,2);assert.equal(corrected.classificationRevalidationSummary.attemptedPages,1);
 assert.deepEqual(corrected.classificationRevalidationQueue.map(record=>record.status),['corrected','corrected']);
 assert.equal(corrected.classificationRevalidationUpdates.length,2);assert.equal(runtime.calls.length,3,'Fresh queue must refetch the just-cached detail once');
 assert.equal(runtime.calls.filter(url=>url!==HOST+'/robots.txt').length,2);
 const published=applyUpdates(snapshot,{[source.id]:corrected},'gear');assert.equal(published.snapshot.items.length,4);
 assert.deepEqual(published.snapshot.items.map(item=>item.id),snapshot.items.map(item=>item.id));assert.deepEqual(published.snapshot.items.map(item=>item.price_amount),PRICES);
 for(const item of published.snapshot.items){assert.equal(item.type,'live');assert.equal(item.subtype,'fish');}
 for(const i of [1,2])assert.deepEqual(published.snapshot.items[i],snapshot.items[i],'Gear correction leaves existing B/C completely unchanged');
 assert.deepEqual(snapshot,before,'Publication is a projection, not an in-place snapshot rewrite');
 const liveRuntime=transport(page(),Date.parse(OBSERVED)+3600001),liveSource=sourceFixture(2),livePrior={...corrected,products:published.snapshot.items};
 const liveScope=refreshScope(liveSource,livePrior,'live',false,{limit:1});assert.equal(liveScope.products.length,1);
 const liveRefresh=await collectSource({...liveSource,products:liveScope.products},livePrior,liveRuntime);
 assert.equal(liveRefresh.status,'success');assert.deepEqual(identityRows(liveRefresh.products),identityRows(published.snapshot.items));
 const republished=applyUpdates(published.snapshot,{[source.id]:liveRefresh},'live');assert.deepEqual(identityRows(republished.snapshot.items),identityRows(published.snapshot.items));
 assert.equal(new Set(republished.snapshot.items.map(item=>item.id)).size,4);assert.equal(liveRuntime.calls.length,2);
});

test('partial group refresh preserves a missing existing variant and exact correction never admits an unknown member',async()=>{
 const snapshot=existingFixture(),source=sourceFixture(),partial=group();partial.hasVariant.pop();
 const runtime=transport(page(partial)),prior={products:structuredClone(snapshot.items),cache:{},updatedKeys:[]};
 const scope=refreshScope(source,prior,'gear',false,{limit:1});
 const refreshed=await collectSource({...source,products:scope.products},prior,runtime);
 assert.equal(refreshed.products.length,4);assert.deepEqual(refreshed.products[3],snapshot.items[3],'Missing D must retain its last-good row');
 const unknown=structuredClone(partial.hasVariant[0]);unknown.sku=GROUP+'_P0000JXF000E';unknown.url=URL+'?item_code=P0000JXF000E';unknown.offers.url=unknown.url;unknown.offers.price=15000;partial.hasVariant.push(unknown);
 const correctionRuntime=transport(page(partial)),corrected=await revalidateExisting(source,seedFixture,refreshed,snapshot,correctionRuntime);
 assert.equal(corrected.classificationRevalidationSummary.correctedOffers,1);assert.equal(corrected.products.length,4);assert.ok(!corrected.products.some(item=>item.variant_id===unknown.sku));
 assert.deepEqual(corrected.products[3],snapshot.items[3]);assert.equal(corrected.classificationRevalidationQueue.find(record=>record.id===snapshot.items[3].id).status,'identity_mismatch');
 const published=applyUpdates(snapshot,{[source.id]:corrected},'gear');assert.equal(published.snapshot.items.length,4);assert.equal(published.snapshot.items[0].type,'live');
 for(const i of [1,2,3])assert.deepEqual(published.snapshot.items[i],snapshot.items[i]);
 assert.deepEqual(published.snapshot.items.map(item=>item.id),snapshot.items.map(item=>item.id));assert.deepEqual(published.snapshot.items.map(item=>item.price_amount),PRICES);
});
