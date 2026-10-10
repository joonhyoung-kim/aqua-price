'use strict';
const {categoryKey,productKey}=require('./discovery.cjs');
const {mergeTree}=require('./category-tree.cjs');
const {classifyProduct}=require('./classification.cjs');
const {parseProductPage}=require('./product-jsonld.cjs');
const {robotsAllows}=require('./engine.cjs');
function reassessReviews(source,seed,state,known=new Set(),now=Date.now()){
 const result={assessed:0,recovered:[],retained:[],networkRequests:0};
 if(!state.discoveryReviewQueue?.length||!seed||!require('./legacy-discovery.cjs').ADAPTERS.has(seed.adapter))return result;
 if(!source.enabled||source.technicalReadiness==='blocked'||state.requiresManualReview||state.blockedUntil&&Date.parse(state.blockedUntil)>now)return result;
 const held=new Set((source.reviewHoldProducts||[]).map(p=>productKey(p.url))),merged=mergeTree(source,seed,state),routes=seed.adapter==='cafe24_category_links'?require('./discovery.cjs'):require('./legacy-discovery.cjs'),membership=new Map(),details=new Map();
 const pure=merged.seed.categories.filter(c=>!c.excluded&&!c.mixedCategories&&c.type==='live'&&['fish','shrimp','aquatic_plant','snail'].includes(c.subtype));
 for(const [url,cache]of Object.entries(state.cache||{})){
  if(!cache?.text)continue;let same=false;try{same=new URL(url).hostname.replace(/^www\./,'')===new URL(source.officialURL).hostname.replace(/^www\./,'')}catch{}if(!same)continue;
  const category=pure.find(c=>{try{return categoryKey(c.url)===categoryKey(url)}catch{return false}});
  if(category){const parsed=routes.parseCategoryPage(cache.text,url,source.officialURL);for(const productUrl of parsed.products||[]){const key=productKey(productUrl);if(!membership.has(key))membership.set(key,[]);membership.get(key).push({category,url,fetchedAt:cache.fetchedAt});}}
  else {try{const key=productKey(url);if(!details.has(key)||Date.parse(cache.fetchedAt)>Date.parse(details.get(key).cache.fetchedAt))details.set(key,{url,cache})}catch{}}
 }
 const robots=state.cache?.[new URL('/robots.txt',source.officialURL).href]?.text;
 const parser=source.adapter==='wpet_public_price'?require('./wpet-public.cjs').parseWpetPage:source.adapter==='godo_public_price'?require('./godo-public.cjs').parseGodoPage:parseProductPage;
 for(const review of state.discoveryReviewQueue||[]){
  if(known.has(review.key))continue;result.assessed++;
  const pending=(state.discoveryPending||[]).find(p=>productKey(p.url)===review.key),detail=details.get(review.key),proofs=membership.get(review.key)||[];
  let reason=null;if(held.has(review.key))reason='identity_review_hold';else if(pending?.retryAfter&&Date.parse(pending.retryAfter)>now)reason='retry_backoff';else if(!detail)reason='no_cached_detail';else if(!robots||!robotsAllows(robots,detail.url))reason='robots_not_verified_or_denied';else if(!proofs.length)reason='no_verified_single_subtype_category_membership';else if(new Set(proofs.map(p=>p.category.subtype)).size!==1)reason='conflicting_category_subtypes';
  if(reason){result.retained.push({key:review.key,reason});continue;}
  const proof=proofs[0],candidate={...review.candidate,url:detail.url,type:proof.category.type,subtype:proof.category.subtype,mixedCategories:false,requiresProductClassification:true,requiresFreshVerification:true,discoveredInCategory:proof.category.url};
  const parsed=parser(detail.cache.text,{...candidate,domain:source.sourceDomain,sourceId:source.id,name:source.name,observedAt:detail.cache.fetchedAt,photosAllowed:source.photosAllowed===true,verifiedPhotoUrls:source.verifiedPhotoUrls});
  const classifications=(parsed.items||[]).map(item=>classifyProduct(detail.cache.text,item,candidate,merged.seed));
  if(parsed.status!=='success'||parsed.issues?.some(i=>i!=='duplicate_offer')||!classifications.length||classifications.some(c=>c.status!=='classified'||c.type!==candidate.type||c.subtype!==candidate.subtype)){result.retained.push({key:review.key,reason:'detail_identity_price_or_category_conflict'});continue;}
  candidate.reviewRecovery={method:'Actual same-retailer parsed category membership plus cached detail identity, KRW price and unchanged classification rules',originalCategoryUrl:review.candidate?.discoveredInCategory||null,categoryUrl:proof.category.url,evidencePageUrl:proof.url,evidenceObservedAt:proof.fetchedAt,detailObservedAt:detail.cache.fetchedAt,originalReason:review.reason};
  result.recovered.push({key:review.key,candidate});
 }
 return result;
}
module.exports={reassessReviews};
