'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');const {categoryCandidates,parseCategoryPage,discoverSource}=require('../scripts/collector/discovery.cjs');
const host='https://example.invalid',category=host+'/product/list.html?cate_no=7';
function page(ids,total,next){return '<div class="prdCount">총 <strong>'+total+'</strong>개</div><ul class="prdList">'+ids.map(id=>'<li><a href="/product/item/'+id+'/category/7/">item</a><a href="/product/detail.html?product_no='+id+'&amp;cate_no=7">duplicate</a></li>').join('')+'</ul><div class="xans-product-normalpaging">'+(next?'<a rel="next" href="?cate_no=7&amp;page='+next+'">다음</a>':'')+'</div>';}
const source={id:'test-only',officialURL:host+'/',enabled:true,technicalReadiness:'adapter_sample_tested',maxRequests:8,delayMs:0,cacheTtlMs:0,timeoutMs:1000,maxBytes:10000,discovery:{maxPages:5,maxProducts:10,allSourceCategoriesReviewed:false,categories:[{url:category,type:'live',subtype:'fish',reviewBasis:'Synthetic reviewed fish category'}]}};
function transport(pages){const calls=[];return {calls,fetch:async url=>{calls.push(url);if(url.endsWith('/robots.txt'))return new Response('User-agent: *\nAllow: /');return pages[url] instanceof Response?pages[url]:new Response(pages[url]||'not found',{status:pages[url]?200:404});}};}
test('category candidates exclude scripts, external links and unsafe URLs and retain reviewed entry labels',()=>{
 const html='<script>"<a href="/category/secret/99/">not visible</a>"</script><a href="/category/fish/7/">열대어</a><a href="/category/fish/7/">dup</a><a href="https://other.invalid/category/fish/7/">other</a><a href="javascript:alert(1)">bad</a>';
 assert.deepEqual(categoryCandidates(html,host,host),[{url:host+'/category/fish/7/',label:'열대어'}]);
});
test('only product-list links are discovered; pagination stays in the same category',()=>{
 const html=page([1,2],4,2)+'<a href="/product/advert/99/">not a list item</a><div class="xans-product-normalpaging"><a href="?cate_no=999&page=2">foreign category</a></div>';
 const result=parseCategoryPage(html,category,host);assert.equal(result.expectedTotal,4);assert.equal(result.products.length,2);assert.ok(!result.products.some(u=>u.includes('99/')));assert.equal(result.nextPage,category+'&page=2');assert.equal(result.terminal,false);
});
test('two completed category pages do not imply full source coverage without exhaustive-category review',async()=>{
 // Use the same URL shape per id to make total count unambiguous.
 const html=(ids,next)=>page(ids,4,next).replaceAll(/<a href="\/product\/detail\.html[^<]*<\/a>/g,'');const t=transport({[category]:html([1,2],2),[category+'&page=2']:html([3,4])});
 const out=await discoverSource(source,{},t);assert.equal(out.status,'success');assert.equal(out.products.length,4);assert.equal(out.categories[0].coverageComplete,true);assert.equal(out.coverage.coverageComplete,false);assert.equal(out.coverage.deletionAllowed,false);assert.equal(out.requests,3);
});
test('budgets return partial candidates and never allow deletion',async()=>{
 const t=transport({[category]:page([1,2],20,2)});const out=await discoverSource({...source,discovery:{...source.discovery,maxProducts:1}}, {},t);assert.equal(out.products.length,1);assert.equal(out.status,'partial_discovery');assert.ok(out.errors.some(e=>e.startsWith('product_budget_reached')));assert.equal(out.coverage.coverageComplete,false);
 const t2=transport({[category]:page([1],10,2)}),out2=await discoverSource({...source,discovery:{...source.discovery,maxPages:1}}, {},t2);assert.equal(out2.coverage.pagesVisited,1);assert.ok(out2.errors.some(e=>e.startsWith('page_budget_reached')));assert.equal(t2.calls.length,2);
});
test('missing count, pagination gaps and malformed list do not invent completeness',()=>{
 const missing=parseCategoryPage('<ul class="prdList"><a href="/product/x/1/">x</a></ul>',category,host);assert.equal(missing.expectedTotal,null);assert.equal(missing.terminal,false);
 const gap=parseCategoryPage(page([1],3,3),category,host);assert.ok(gap.issues.includes('pagination_gap'));assert.equal(gap.nextPage,null);
 const malformed=parseCategoryPage('<div class="prdCount">0개</div>',category,host);assert.ok(malformed.issues.includes('product_list_not_found'));
});
test('next-page URL is the actual anchor including sort parameter, never an invented page query',()=>{const html=page([1],2,2).replace('?cate_no=7&amp;page=2','?sort_method=3&amp;cate_no=7&amp;page=2');assert.equal(parseCategoryPage(html,category,host).nextPage,host+'/product/list.html?sort_method=3&cate_no=7&page=2');assert.equal(parseCategoryPage(page([1],2,2).replace('?cate_no=7&amp;page=2','?page=2'),category,host).nextPage,null);});
test('robots denial, disabled sources and HTTP403 stop without alternate probing',async()=>{
 const denied={fetch:async url=>new Response(url.endsWith('robots.txt')?'User-agent: *\nDisallow: /product/':'should not request')};const out=await discoverSource(source,{},denied);assert.equal(out.requests,1);assert.equal(out.products.length,0);
 const disabled=await discoverSource({...source,enabled:false},{},{fetch:()=>{throw Error('must not request')}});assert.equal(disabled.status,'disabled');assert.equal(disabled.requests,0);
 const forbidden=transport({[category]:new Response('denied',{status:403})});const stopped=await discoverSource(source,{},forbidden);assert.equal(stopped.status,'access_stopped');assert.equal(stopped.requiresManualReview,true);const retry=await discoverSource(source,stopped,{fetch:()=>{throw Error('must not retry')}});assert.equal(retry.status,'quarantined');
});
test('category HTTP404 is failure evidence and never empties the published catalog',async()=>{
 const out=await discoverSource(source,{},transport({}));assert.equal(out.status,'partial_discovery');assert.equal(out.coverage.deletionAllowed,false);assert.ok(out.errors.some(e=>e.startsWith('category_http_404')));
});
