'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{reassessReviews}=require('../scripts/collector/review-recovery.cjs');
function fixture(title='테트라'){
 const host='https://example.invalid',url=host+'/product/fish/1/',category=host+'/category/fish/2/',now=Date.now(),at=new Date(now).toISOString();
 const source={id:'test',name:'fixture',enabled:true,officialURL:host,sourceDomain:'example.invalid',maxRequests:3,delayMs:0,cacheTtlMs:10800000,timeoutMs:1000,maxBytes:100000};
 const seed={adapter:'cafe24_category_links',maxPages:1,maxPagesPerCategory:1,maxProducts:10,maxProductVerifications:2,categories:[{url:category,label:'테트라',type:'live',subtype:'fish'},{url:host+'/category/all/9/',label:'전체 생물',mixedCategories:true}]};
 const detail='<h1>'+title+'</h1><p>1,000원</p><script type="application/ld+json">'+JSON.stringify({'@type':'Product',name:title,sku:'fish-1',url,offers:{'@type':'Offer',price:1000,priceCurrency:'KRW'}})+'</script>';
 const listing='<div class="prdCount">1개</div><ul class="prdList"><li><a href="'+url+'">'+title+'</a></li></ul><div class="xans-product-normalpaging"></div>';
 const review={key:'example.invalid:1',title,reason:'Mixed or unresolved product category requires review',classificationVersion:5,status:'needs_review',candidate:{url,mixedCategories:true,type:null,subtype:null,discoveredInCategory:host+'/category/all/9/'}};
 const state={products:[],updatedKeys:[],requests:0,discoveryReviewQueue:[review],discoveryReviewIssues:[review],discoveryPending:[],cache:{[url]:{text:detail,fetchedAt:at},[category]:{text:listing,fetchedAt:at},[host+'/robots.txt']:{text:'User-agent: *\nAllow: /',fetchedAt:at}}};
 return {host,url,category,source,seed,state,now,listing};
}
test('review recovery requires parsed membership in an actual pure category and retains original evidence',()=>{
 const f=fixture(),r=reassessReviews(f.source,f.seed,f.state,new Set(),f.now);assert.equal(r.recovered.length,1);assert.equal(r.networkRequests,0);assert.equal(r.recovered[0].candidate.subtype,'fish');assert.equal(r.recovered[0].candidate.requiresFreshVerification,true);assert.equal(r.recovered[0].candidate.reviewRecovery.originalCategoryUrl,f.host+'/category/all/9/');assert.equal(r.recovered[0].candidate.reviewRecovery.evidencePageUrl,f.category);assert.equal(f.state.products.length,0);assert.equal(f.state.discoveryReviewQueue.length,1);
 delete f.state.cache[f.category];assert.equal(reassessReviews(f.source,f.seed,f.state).recovered.length,0);
});
test('conflicting subtype membership and feed conflicts remain under review',()=>{
 const f=fixture(),other=f.host+'/category/shrimp/3/';f.seed.categories.push({url:other,label:'새우',type:'live',subtype:'shrimp'});f.state.cache[other]={text:f.listing,fetchedAt:new Date(f.now).toISOString()};assert.equal(reassessReviews(f.source,f.seed,f.state).retained[0].reason,'conflicting_category_subtypes');
 const feed=fixture('테트라 사료');assert.equal(reassessReviews(feed.source,feed.seed,feed.state).recovered.length,0);
});
test('holds, robots denial, source denial and missing price never recover a review candidate',()=>{
 const f=fixture();f.source.reviewHoldProducts=[{url:f.url}];assert.equal(reassessReviews(f.source,f.seed,f.state).retained[0].reason,'identity_review_hold');delete f.source.reviewHoldProducts;
 f.state.cache[f.host+'/robots.txt'].text='User-agent: *\nDisallow: /product';assert.equal(reassessReviews(f.source,f.seed,f.state).recovered.length,0);
 f.state.requiresManualReview=true;assert.equal(reassessReviews(f.source,f.seed,f.state).assessed,0);
 const bad=fixture();bad.state.cache[bad.url].text='<h1>테트라</h1>';assert.equal(reassessReviews(bad.source,bad.seed,bad.state).recovered.length,0);
});
test('recovered cached detail is verified before leaving review and historical issues cannot resurrect it',async()=>{
 const f=fixture(),{integrateDiscovery}=require('../scripts/collector/integrate-discovery.cjs'),calls=[],options={recoverReviews:true,coverageLive:true,pendingFirst:true,fetch:async url=>{calls.push(url);assert.equal(url,f.url);return new Response(f.state.cache[f.url].text);}};
 const first=await integrateDiscovery(f.source,f.seed,f.state,{items:[]},options);assert.equal(first.products.length,1);assert.equal(first.discoveryReviewQueue.length,0);assert.equal(first.reviewRecoverySummary.eligible,1);assert.equal(first.products[0].subtype,'fish');assert.deepEqual(calls,[f.url]);
 const next=await integrateDiscovery(f.source,f.seed,{...first,requests:0},{items:first.products},options);assert.equal(next.products.length,1);assert.equal(next.discoveryReviewQueue.length,0);assert.deepEqual(calls,[f.url]);
});
