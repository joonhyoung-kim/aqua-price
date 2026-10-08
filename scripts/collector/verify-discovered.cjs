'use strict';
const {request,robotsAllows}=require('./engine.cjs');const {parseProductPage}=require('./product-jsonld.cjs');const {classifyProduct}=require('./classification.cjs');const {productKey}=require('./discovery.cjs');
async function verifyDiscovered(source,seed,candidates,previous={},options={}){
 const prior=structuredClone(previous),now=options.now||Date.now,run={now,deadline:options.deadline,fetch:options.fetch||fetch,sleep:options.sleep||((ms)=>new Promise(r=>setTimeout(r,ms))),requests:0,lastRequest:prior.lastRequestAt??null},limits={delayMs:2000,cacheTtlMs:10800000,timeoutMs:15000,maxBytes:2000000,maxRequests:5,...source};
 const out={status:'success',products:[],updatedKeys:[],completedCandidateKeys:[],deferredCandidateKeys:[],classificationIssues:[],errors:[],freshVerifiedPages:0,cache:prior.cache||{}};const finish=status=>({...out,status,cache:prior.cache||{},requests:run.requests,lastRequestAt:run.lastRequest,cacheOnly:false});
 if(!source.enabled||source.technicalReadiness==='blocked')return finish('disabled');if(prior.requiresManualReview)return finish('quarantined');if(prior.blockedUntil&&now()<Date.parse(prior.blockedUntil))return finish('backoff');if(!candidates.length||limits.maxRequests<1)return finish('budget_limited');
 try{const robots=await request(new URL('/robots.txt',source.officialURL).href,limits,run,prior);if(robots.status!==200)return finish('robots_unverified');const delays=[...robots.text.matchAll(/^\s*Crawl-delay:\s*(\d+(?:\.\d+)?)\s*$/gmi)].map(m=>Number(m[1])*1000);if(delays.length)limits.delayMs=Math.max(limits.delayMs,...delays);
 for(const candidate of candidates.slice(0,seed.maxProductVerifications)){
  const key=productKey(candidate.url);if(!robotsAllows(robots.text,candidate.url)){out.classificationIssues.push({key,status:'robots_denied_product'});out.completedCandidateKeys.push(key);continue;}
  if(run.requests>=limits.maxRequests){out.errors.push('request_budget_reached');break;}const page=await request(candidate.url,limits,run,prior);if([404,410].includes(page.status)){out.classificationIssues.push({key,status:'missing_detail_preserved',httpStatus:page.status});out.deferredCandidateKeys.push(key);continue;}
  const parsed=parseProductPage(page.text,{...candidate,type:'gear',subtype:null,url:candidate.url,domain:source.sourceDomain,sourceId:source.id,name:source.name,photosAllowed:source.photosAllowed===true,observedAt:page.fetchedAt||new Date(now()).toISOString()});
  if(parsed.status!=='success'||parsed.issues.some(e=>e!=='duplicate_offer')){out.errors.push('detail_parse_failed:'+candidate.url);out.deferredCandidateKeys.push(key);continue;}
  let classified=0;for(const item of parsed.items){const classification=classifyProduct(page.text,item,candidate,seed);if(classification.status!=='classified'){out.classificationIssues.push({key,...classification});continue;}item.type=classification.type;item.subtype=classification.subtype;item.classification_basis=classification.basis;item.discovery_category_url=candidate.discoveredInCategory;out.products.push(item);out.updatedKeys.push(item.collector_key);classified++;}if(classified&&!page.cacheHit)out.freshVerifiedPages++;
  out.completedCandidateKeys.push(key);
 }
 return finish(out.errors.length?'partial_failure':'success');
 }catch(e){out.errors.push(e.message);if(e.message==='execution_deadline')return finish('budget_limited');if([403,429].includes(e.status)){out.requiresManualReview=e.status===403;out.blockedUntil=new Date(now()+86400000).toISOString();out.httpStatus=e.status;return finish('access_stopped');}return finish('failed');}
}
module.exports={verifyDiscovered};
