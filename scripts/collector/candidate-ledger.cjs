'use strict';
const crypto=require('node:crypto');
const {productKey,scanHtml}=require('./discovery.cjs');
const {classifyProduct}=require('./classification.cjs');
const {CLASSIFICATION_VERSION}=require('./queue-policy.cjs');
function productURL(value,base,official){
 try{const u=new URL(String(value).replace(/&amp;/g,'&'),base),host=u.hostname.replace(/^www\./,'');if(host!==new URL(official).hostname.replace(/^www\./,'')||!['http:','https:'].includes(u.protocol))return null;
 const p=u.pathname,q=u.searchParams,numeric=x=>/^\d+$/.test(x||'');
 const ok=/^\/product\/[^/]+\/\d+\//.test(p)||p==='/product/detail.html'&&numeric(q.get('product_no'))||p==='/shop/shopdetail.html'&&numeric(q.get('branduid'))||p==='/goods/goods_view.php'&&numeric(q.get('goodsNo'))||/^\/(?:\d+\/?|shop_view\/?)?$/.test(p)&&numeric(q.get('idx'))||host==='wpet.co.kr'&&q.get('act')==='shop.goods_view'&&numeric(q.get('CM')||q.get('GS'));
 if(!ok||u.username||u.password)return null;u.hash='';return u.href;
 }catch{return null;}
}
// Pure local projection. It performs no requests and never changes catalog/state/cache.
function buildCandidateLedger(source,seed,state,known=new Set(),now=Date.now()){
 const entries=new Map(),details=new Map(),previous=new Map((state.discoveryLedger?.entries||[]).map(e=>[e.key,e]));
 function observe(url,page,at,kind){const key=productKey(url);let e=entries.get(key);if(!e){e={key,url,firstObservedAt:previous.get(key)?.firstObservedAt||at,lastObservedAt:at,evidence:[]};entries.set(key,e);}if(Date.parse(at)>Date.parse(e.lastObservedAt))e.lastObservedAt=at;if(!e.evidence.some(x=>x.page===page&&x.kind===kind))e.evidence.push({page,observedAt:at,kind});}
 for(const [page,cache]of Object.entries(state.cache||{})){
  if(!cache?.text)continue;let same=false;try{same=new URL(page).hostname.replace(/^www\./,'')===new URL(source.officialURL).hostname.replace(/^www\./,'')}catch{}if(!same)continue;
  const own=productURL(page,page,source.officialURL),at=cache.fetchedAt||null;
  if(own){observe(own,page,at,'primary_detail');const key=productKey(own),prior=details.get(key);if(!prior||Date.parse(at)>Date.parse(prior.cache.fetchedAt))details.set(key,{url:own,cache});}
  // Every actual href, including related/recommended products, is recorded as a candidate only.
  for(const link of scanHtml(cache.text).links){const url=productURL(link.href,page,source.officialURL);if(url)observe(url,page,at,own?'detail_outbound':'listing_or_navigation');}
  if(/sitemap|\.xml(?:\?|$)/i.test(page))for(const m of cache.text.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)){const url=productURL(m[1],page,source.officialURL);if(url)observe(url,page,at,'sitemap');}
 }
 const queue=new Map();for(const [status,items]of [['pending',state.discoveryPending||[]],['review',state.discoveryReviewQueue||[]],['review',state.discoveryReviewIssues||[]],['excluded',state.discoveryExcluded||[]]])for(const item of items){const url=productURL(item.url||item.candidate?.url,item.url||source.officialURL,source.officialURL);if(!url)continue;observe(url,item.candidate?.discoveredInCategory||item.discoveredInCategory||url,item.reviewedAt||item.discoveredAt||null,'checkpoint');queue.set(productKey(url),{status,item});}
 for(const old of previous.values())if(!entries.has(old.key))entries.set(old.key,{...old,evidence:[...(old.evidence||[])]});
 const held=new Set((source.reviewHoldProducts||[]).map(p=>productKey(p.url))),recoveryCandidates=[];
 for(const e of entries.values()){
  const old=previous.get(e.key),detail=details.get(e.key),queued=queue.get(e.key),accessHeld=!source.enabled||source.technicalReadiness==='blocked'||state.requiresManualReview||state.blockedUntil&&Date.parse(state.blockedUntil)>now;
  e.classificationVersion=CLASSIFICATION_VERSION;e.reassessable=true;e.reason='Observed actual product link; primary detail verification is pending';e.status='pending';
  if(known.has(e.key)){e.status='included';e.reason='Verified product identity already in catalog';}
  else if(held.has(e.key)||accessHeld||queued?.item.status==='robots_denied_product'){e.status=queued?.item.status==='robots_denied_product'?'excluded':'review';e.reason=held.has(e.key)?'identity_review_hold':accessHeld?'source_access_hold':'robots_denied_product';}
  else if(detail){
   e.detailObservedAt=detail.cache.fetchedAt;e.evidenceHash=crypto.createHash('sha256').update(detail.cache.text).digest('hex');
   const context={url:detail.url,domain:source.sourceDomain,sourceId:source.id,name:source.name,type:'gear',subtype:null,photosAllowed:false,observedAt:detail.cache.fetchedAt};
   const parser=source.adapter==='wpet_public_price'?require('./wpet-public.cjs').parseWpetPage:source.adapter==='godo_public_price'?require('./godo-public.cjs').parseGodoPage:require('./product-jsonld.cjs').parseProductPage;
   const parsed=parser(detail.cache.text,context),items=parsed.items||[];
   if(parsed.status!=='success'||(parsed.issues||[]).some(i=>i!=='duplicate_offer')||!items.length){e.status='review';e.reason='Cached primary identity/offer validation incomplete';e.parseIssues=parsed.issues||[];}
   else{
    const c=items.map(item=>classifyProduct(detail.cache.text,item,{url:detail.url,mixedCategories:true,requiresProductClassification:true},seed));e.classifications=c;e.title=items[0].title;
    if(c.every(x=>x.status==='classified')){e.status='pending';e.reason='Cached primary content verified; fresh detail/offer verification required before publishing';recoveryCandidates.push({key:e.key,url:detail.url,title:e.title,classifications:c,detailObservedAt:detail.cache.fetchedAt,cachedPriceOnly:true,requiresFreshVerification:true});}
    else if(c.every(x=>x.status==='excluded_scope')){e.status='excluded';e.reason=c[0].reason;}
    else{e.status='review';e.reason=c.find(x=>x.status!=='classified')?.reason||'Conflicting primary detail classifications';}
   }
  }else if(queued){e.status=queued.status;e.reason=queued.item.reason||queued.item.status||'Existing checkpoint awaiting primary detail';}
  e.decisionHistory=[...(old?.decisionHistory||[])];
  if(old&&(old.status!==e.status||old.reason!==e.reason||old.evidenceHash!==e.evidenceHash||old.classificationVersion!==e.classificationVersion))e.previousDecision={status:old.status,reason:old.reason,evidenceHash:old.evidenceHash||null,classificationVersion:old.classificationVersion};
  else if(!old&&queued&&queued.status!==e.status)e.previousDecision={status:queued.status,reason:queued.item.reason||queued.item.status,classificationVersion:queued.item.classificationVersion||0};
  if(e.previousDecision)e.decisionHistory.push(e.previousDecision);
 }
 return {schemaVersion:1,classificationVersion:CLASSIFICATION_VERSION,checkedAt:new Date(now).toISOString(),networkRequests:0,entries:[...entries.values()],recoveryCandidates};
}
module.exports={productURL,buildCandidateLedger};
