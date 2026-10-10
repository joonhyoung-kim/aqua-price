'use strict';
const {discoverDaily}=require('./daily-discovery.cjs');const {verifyDiscovered}=require('./verify-discovered.cjs');const {productKey}=require('./discovery.cjs');const {CLASSIFICATION_VERSION,takeFairCandidates,verifiedKeys,sourceItems}=require('./queue-policy.cjs');
async function integrateDiscovery(source,seed,state,snapshot,options={}){
 const {discoveryScope,categoryEligible,candidateEligible,laneField}=require('./discovery-scope.cjs'),scope=discoveryScope(options);
 // Reconcile/all visits both independent lanes. Neither lane resets the other's pagination or detail rotation.
 if(scope==='all'){
  const expanded=require('./category-tree.cjs').mergeTree(source,seed,state,{discoveryScope:'all'}).seed,lanes=['live','gear'].filter(lane=>expanded.categories.some(c=>categoryEligible(c,lane))||(state.discoveryPending||[]).some(p=>candidateEligible(p,lane)));
  if(!lanes.includes('gear')&&require('./revalidate-existing.cjs').syncQueue(source,snapshot,state).some(x=>x.status==='pending'||x.status==='deferred'))lanes.push('gear');
  if(lanes.length===1)return integrateDiscovery(source,expanded,state,snapshot,{...options,discoveryScope:lanes[0],coverageLive:lanes[0]==='live'});
  const remaining=Math.max(0,source.maxRequests-(state.requests||0)),first=state.nextDiscoveryScope==='gear'?'gear':'live',second=first==='live'?'gear':'live';
  let next=await integrateDiscovery({...source,maxRequests:(state.requests||0)+Math.ceil(remaining/2)},seed,state,snapshot,{...options,discoveryScope:first,coverageLive:first==='live'});
  const firstSummary=next.discoverySummary;let secondSummary=null;
  if(!next.requiresManualReview&&!['access_stopped','quarantined','backoff','disabled'].includes(next.status)&&!(next.blockedUntil&&Date.now()<Date.parse(next.blockedUntil))){next=await integrateDiscovery(source,seed,next,snapshot,{...options,discoveryScope:second,coverageLive:second==='live'});secondSummary=next.discoverySummary;}
  next.nextDiscoveryScope=second;
  const summaries={[first]:firstSummary,...(secondSummary?{[second]:secondSummary}:{})};
  const values=Object.values(summaries).filter(Boolean);next.discoverySummary={...next.discoverySummary,discoveryScope:'all',scopes:summaries,pagesVisited:values.reduce((n,s)=>n+(s.pagesVisited||0),0),verifiedItems:values.reduce((n,s)=>n+(s.verifiedItems||0),0),newCandidates:values.reduce((n,s)=>n+(s.newCandidates||0),0),errors:[...new Set(values.flatMap(s=>s.errors||[]))]};
  return next;
 }
 if(scope==='gear')seed={...seed,maxPages:seed.maxGearPages||seed.maxPages,maxProducts:seed.maxGearProducts||seed.maxProducts};
 const field=laneField(scope),scopeOptions={...options,discoveryScope:scope,coverageLive:scope==='live'};

 let working=state,revalidationDetailCount=0;
 if(scope==='gear'){working=await require('./revalidate-existing.cjs').revalidateExisting(source,seed,state,snapshot,{...scopeOptions,detailLimit:seed.maxGearProductVerifications||6});revalidationDetailCount=working.classificationRevalidationSummary?.attemptedPages||0;}
 const next=structuredClone(working),maxPending=1000,known=verifiedKeys(snapshot,source,next),pending=new Map((next.discoveryPending||[]).map(p=>[productKey(p.url),p])),review=new Map((next.discoveryReviewQueue||[]).map(p=>[p.key,p])),excluded=new Map((next.discoveryExcluded||[]).map(p=>[p.key,p]));let remaining=Math.max(0,source.maxRequests-(next.requests||0));
 const tree=require('./category-tree.cjs');let merged=tree.mergeTree(source,seed,next,scopeOptions);seed=merged.seed;next.categoryTree=merged.tree;
 const held=new Set((source.reviewHoldProducts||[]).map(p=>productKey(p.url))),eligible=p=>candidateEligible(p,scope),lanePendingCount=()=>[...pending.values()].filter(eligible).length;
 for(const key of known)pending.delete(key);for(const key of held)pending.delete(key);
 for(const key of known)review.delete(key);
 // Retain old review records. Recover their actual URL only from an existing public-page cache, never invent it.
 for(const issue of next.discoveryReviewIssues||[]){if(issue.status!=='needs_review'||review.has(issue.key)||known.has(issue.key))continue;const cachedUrl=issue.url||Object.keys(next.cache||{}).find(u=>{try{return productKey(u)===issue.key;}catch{return false;}});review.set(issue.key,{...issue,candidate:issue.candidate|| (cachedUrl?{url:cachedUrl,type:null,subtype:null,mixedCategories:true,requiresProductClassification:true}:null),classificationVersion:issue.classificationVersion||0});}
 for(const item of review.values()){if(item.candidate&&eligible(item.candidate)&&(pending.has(item.key)||lanePendingCount()<maxPending)&&item.classificationVersion<CLASSIFICATION_VERSION&&!known.has(item.key)&&!held.has(item.key)){pending.set(item.key,{...item.candidate,requiresFreshVerification:true});item.classificationVersion=CLASSIFICATION_VERSION;}}
 // All saved actual product hrefs have a decision, even when they were only recommendations.
 const ledger=require('./candidate-ledger.cjs').buildCandidateLedger(source,seed,{...next,discoveryReviewQueue:[...review.values()],discoveryExcluded:[...excluded.values()]},known);
 next.discoveryLedger=ledger;
 next.classificationRevalidation=require('./classification-revalidation.cjs').revalidationCandidates(source,snapshot,next);
 for(const entry of ledger.entries){
  const content=entry.classifications?.[0];
  if(content?.status==='classified'&&!eligible({type:content.type,mixedCategories:false}))continue;
  if(entry.status==='pending'&&content?.status==='classified'&&pending.has(entry.key))pending.get(entry.key).requiresFreshVerification=true;
  if(entry.status!=='pending'||known.has(entry.key)||held.has(entry.key)||pending.has(entry.key)||lanePendingCount()>=maxPending)continue;
  if(excluded.has(entry.key)&&content?.status!=='classified')continue;
  if(excluded.has(entry.key))excluded.delete(entry.key);
  if(review.has(entry.key)&&content?.status!=='classified')continue;
  pending.set(entry.key,{url:entry.url,type:content?.type||null,subtype:content?.subtype||null,mixedCategories:!content,requiresProductClassification:true,requiresFreshVerification:!!content,discoveredAt:entry.firstObservedAt,discoveredInCategory:null,classificationBasis:'Actual cached public product href; primary content must be verified',ledgerEvidence:entry.evidence});
 }
 const eligibleBacklog=[...pending.values()].filter(eligible).filter(p=>!p.retryAfter||Date.now()>=Date.parse(p.retryAfter)).length;let discovery;
 const stopped=['robots_unverified','disabled','quarantined','backoff','access_stopped'].includes(next.classificationRevalidationSummary?.status)||next.requiresManualReview||next.blockedUntil&&(options.now||Date.now)()<Date.parse(next.blockedUntil)||(next.errors||[]).some(e=>e.includes('execution_deadline'));
 if(!stopped&&lanePendingCount()<maxPending&&remaining>0&&!(options.pendingFirst===true&&eligibleBacklog>0)&&!(scope==='live'&&eligibleBacklog>=Math.max(seed.maxProductVerifications,3)&&seed.exploreWithBacklog!==true)){
  discovery=await discoverDaily({...source,maxRequests:Math.min(remaining,seed.maxPages+1)},{...seed,maxProducts:Math.min(seed.maxProducts,maxPending-lanePendingCount())},{...next[field],cache:next.cache,requiresManualReview:next.requiresManualReview,blockedUntil:next.blockedUntil,lastRequestAt:next.lastRequestAt},{...scopeOptions,knownProductKeys:[...known]});next.cache=discovery.cache;next.lastRequestAt=discovery.lastRequestAt;remaining-=discovery.requests;next.requests=(next.requests||0)+discovery.requests;
  for(const candidate of discovery.products){const key=productKey(candidate.url);if(known.has(key)||held.has(key)||review.has(key)||excluded.has(key))continue;const old=pending.get(key);if(!old)pending.set(key,candidate);else if(!old.type&&candidate.type)pending.set(key,candidate);}
  const {cache,...publicState}=discovery;next[field]=publicState;
  merged=tree.mergeTree(source,seed,next,scopeOptions);seed=merged.seed;next.categoryTree=merged.tree;
 }else{discovery={status:scope==='live'&&eligibleBacklog?'draining_pending':lanePendingCount()>=maxPending?'backlog_limited':'request_budget_reached',products:[],requests:0,coverage:{pagesVisited:0},errors:[]};next[field]={...next[field],status:discovery.status,lastAttempt:new Date().toISOString()};}
 for(const field of ['requiresManualReview','blockedUntil','httpStatus'])if(discovery[field]!==undefined)next[field]=discovery[field];
 if(discovery.status==='access_stopped'||next.requiresManualReview){next.status='partial_failure';next.errors=[...(next.errors||[]),'discovery_access_stopped'];}
 let verification=null;
 if(options.recoverReviews){const recovery=require('./review-recovery.cjs').reassessReviews(source,seed,{...next,discoveryReviewQueue:[...review.values()],discoveryPending:[...pending.values()]},known);for(const entry of recovery.recovered)if(eligible(entry.candidate)&&(pending.has(entry.key)||lanePendingCount()<maxPending))pending.set(entry.key,{...entry.candidate,requiresFreshVerification:true});next.reviewRecoverySummary={assessed:recovery.assessed,eligible:recovery.recovered.length,evidence:recovery.recovered.map(x=>({key:x.key,...x.candidate.reviewRecovery})),retained:recovery.retained,networkRequests:0,checkedAt:new Date().toISOString()};}
 if(require('./legacy-discovery.cjs').ADAPTERS.has(seed.adapter)&&remaining>0&&(scope==='live'||revalidationDetailCount<(seed.maxGearProductVerifications||6))&&!['access_stopped','quarantined','backoff','disabled'].includes(discovery.status)&&!stopped&&!next.requiresManualReview){
  const ids=new Map();for(const item of [...sourceItems(snapshot,source),...(next.products||[])]){try{const key=productKey(item.product_url);if(!ids.has(key))ids.set(key,[]);ids.get(key).push(item);}catch{}}
  const detailLimit=Math.min(remaining,scope==='live'?20:Math.max(0,(seed.maxGearProductVerifications||6)-revalidationDetailCount)),eligibleCandidates=[...pending.values()].filter(eligible).filter(p=>!p.retryAfter||Date.parse(p.retryAfter)<=Date.now()),targets=options.preferCompletedCategories?require('./category-completion.cjs').completionTargets(next,known,eligibleCandidates,Math.max(0,detailLimit-1)):[],priorityKeys=new Set([...targets.flatMap(t=>t.keys),...(options.recoverReviews?next.reviewRecoverySummary?.evidence?.map(e=>e.key)||[]:[])]),selection=takeFairCandidates(eligibleCandidates,detailLimit,scope==='gear'?(next.gearDetailQueueCursor||0):(next.detailQueueCursor||0),Date.now(),{prioritizeFish:scope==='live',discoveryScope:scope,priorityKeys});if(scope==='gear')next.gearDetailQueueCursor=selection.cursor;else next.detailQueueCursor=selection.cursor;
  const candidates=selection.candidates.map(p=>{const matches=ids.get(productKey(p.url))||[],unique=[...new Map(matches.map(x=>[x.id,x])).values()];return unique.length===1?{...p,existingId:unique[0].id}:p;});
  verification=await verifyDiscovered({...source,maxRequests:Math.min(remaining,detailLimit+1)},{...seed,maxProductVerifications:detailLimit},candidates,{cache:next.cache,lastRequestAt:next.lastRequestAt,requiresManualReview:next.requiresManualReview,blockedUntil:next.blockedUntil},scopeOptions);next.cache=verification.cache;next.lastRequestAt=verification.lastRequestAt;next.requests+=verification.requests;
  for(const field of ['requiresManualReview','blockedUntil','httpStatus'])if(verification[field]!==undefined)next[field]=verification[field];
  if(['success','partial_failure','budget_limited','access_stopped'].includes(verification.status)){
   const rows=new Map((next.products||[]).map(p=>[p.collector_key||p.id,p]));
   for(const product of verification.products){const old=rows.get(product.collector_key);if(old)product.id=old.id;for(const [key,item]of rows)if(item.id===product.id&&key!==product.collector_key)rows.delete(key);rows.set(product.collector_key,product);review.delete(productKey(product.product_url));}
   next.products=[...rows.values()];next.updatedKeys=[...new Set([...(next.updatedKeys||[]),...verification.updatedKeys])];if(verification.products.length){next.cacheOnly=false;if(next.status==='no_confirmed_products')next.status='success';}
   for(const key of verification.completedCandidateKeys)pending.delete(key);for(const key of verification.deferredCandidateKeys){const p=pending.get(key);if(p)p.retryAfter=new Date(Date.now()+86400000).toISOString();}
  }
  for(const issue of verification.classificationIssues){if(issue.status==='needs_review')review.set(issue.key,{...issue,classificationVersion:CLASSIFICATION_VERSION,reviewedAt:new Date().toISOString()});if(['excluded_scope','robots_denied_product'].includes(issue.status))excluded.set(issue.key,{...issue,classificationVersion:CLASSIFICATION_VERSION});}
  if(['partial_failure','failed','access_stopped'].includes(verification.status)){next.status='partial_failure';next.errors=[...(next.errors||[]),...(verification.errors||[]),...(verification.status==='access_stopped'?['discovered_product_access_stopped']:[])];}
 }
 if(verification?.freshVerifiedPages&&verification.products.length){const newest=verification.products.map(p=>p.observed_at_utc).sort().at(-1);if(!next.collectorLastSuccess||Date.parse(newest)>Date.parse(next.collectorLastSuccess))next.collectorLastSuccess=newest;}
 next.discoveryPending=[...pending.values()];next.discoveryReviewQueue=[...review.values()].slice(-1000);next.discoveryExcluded=[...excluded.values()].slice(-1000);next.discoveryReviewIssues=[...(next.discoveryReviewIssues||[]),...(verification?.classificationIssues||[])].slice(-100);
 next.discoveryLedger=require('./candidate-ledger.cjs').buildCandidateLedger(source,seed,next,verifiedKeys(snapshot,source,next));
 const categories=Object.values(next[field]?.cursor?.categories||{});
 next.discoverySummary={discoveryScope:scope,status:verification?.status==='budget_limited'?'budget_limited':['partial_failure','failed','access_stopped'].includes(verification?.status)?'partial_discovery':discovery.status,representativeSeedCount:seed.categories.filter(c=>categoryEligible(c,scope)).length,adapter:seed.adapter,pagesVisited:discovery.coverage?.pagesVisited||0,pageBudget:seed.maxPages,productBudget:seed.maxProducts,detailBudget:Math.min(remaining,scope==='live'?20:Math.max(0,(seed.maxGearProductVerifications||6)-revalidationDetailCount)),newCandidates:discovery.products.length,verifiedItems:verification?.products?.length||0,pendingCandidates:pending.size,pendingCandidatesInScope:lanePendingCount(),pendingScopeLimit:maxPending,pendingByGroup:next.discoveryPending.reduce((a,p)=>{const k=p.subtype||'mixed';a[k]=(a[k]||0)+1;return a},{}),reviewRequired:review.size,reviewReasons:[...review.values()].reduce((a,p)=>{const k=p.reason||'Evidence missing';a[k]=(a[k]||0)+1;return a},{}),reviewQueue:next.discoveryReviewQueue,excludedCandidates:excluded.size,coverageComplete:false,deletionEnabled:false,nextCategoryIndex:next[field]?.cursor?.nextCategoryIndex??null,lastAttempt:next[field]?.lastAttempt||null,errors:[...(discovery.errors||[]),...(verification?.errors||[])],cursorCategories:categories.map(c=>({entryUrl:c.entryUrl,nextUrl:c.nextUrl,expectedProductCount:c.expectedProductCount??null,cycleSeenProductCount:c.seenKeys?.length||0,cyclesCompleted:c.cyclesCompleted||0,lastCycle:c.lastCycle||null,visitedPageUrls:c.visitedPageUrls||[],headProbePending:c.headProbePending===true}))};
 next.discoverySummary.categoryTree=tree.treeProgress(next,scope);
 next.discoverySummaries={...next.discoverySummaries,[scope]:next.discoverySummary};
 return next;
}
module.exports={integrateDiscovery};
