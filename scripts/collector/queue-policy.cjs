'use strict';
const {productKey}=require('./discovery.cjs');
const GROUPS=['fish','shrimp','aquatic_plant','snail','mixed'];
const CLASSIFICATION_VERSION=8;
function candidateGroup(candidate){return GROUPS.includes(candidate.subtype)?candidate.subtype:'mixed';}
function takeFairCandidates(candidates,limit,cursor=0,now=Date.now(),options={}){
 if(options.priorityKeys?.size){const priority=candidates.filter(c=>options.priorityKeys.has(productKey(c.url))),remaining=candidates.filter(c=>!options.priorityKeys.has(productKey(c.url))),base={...options,priorityKeys:null},first=takeFairCandidates(priority,limit,cursor,now,base),second=takeFairCandidates(remaining,limit-first.candidates.length,first.cursor,now,base);return {candidates:[...first.candidates,...second.candidates],cursor:second.cursor};}
 const schedule=options.prioritizeFish?['fish','fish','fish','shrimp','snail','mixed','aquatic_plant']:GROUPS;
 const buckets=new Map(GROUPS.map(group=>[group,candidates.filter(c=>candidateGroup(c)===group&&(!c.retryAfter||now>=Date.parse(c.retryAfter)))]));
 if(options.prioritizeFish){const categories=new Map();for(const c of buckets.get('fish')){const key=c.discoveredInCategory||'unknown';if(!categories.has(key))categories.set(key,[]);categories.get(key).push(c);}const fair=[];while([...categories.values()].some(a=>a.length))for(const a of categories.values())if(a.length)fair.push(a.shift());buckets.set('fish',fair);}
 if(options.discoveryScope==='gear'){const categories=new Map();for(const c of candidates.filter(c=>!c.retryAfter||now>=Date.parse(c.retryAfter))){const key=c.discoveredInCategory||'unknown';if(!categories.has(key))categories.set(key,[]);categories.get(key).push(c);}const keys=[...categories.keys()];if(keys.length){const offset=cursor%keys.length,order=[...keys.slice(offset),...keys.slice(0,offset)],fair=[];while(order.some(k=>categories.get(k).length))for(const key of order)if(categories.get(key).length)fair.push(categories.get(key).shift());return {candidates:fair.slice(0,limit),cursor:(offset+Math.min(limit,keys.length))%keys.length};}}
 const selected=[];let position=cursor%schedule.length,empty=0;
 while(selected.length<limit&&empty<schedule.length){const bucket=buckets.get(schedule[position]);if(bucket.length){selected.push(bucket.shift());empty=0;}else empty++;position=(position+1)%schedule.length;}
 return {candidates:selected,cursor:position};
}
function sourceItems(snapshot,source){return (snapshot.items||[]).filter(p=>p.source_id===source.id||p.seller_domain===source.sourceDomain);}
function verifiedKeys(snapshot,source,previous={}){return new Set([...sourceItems(snapshot,source),...(previous.products||[])].map(p=>{try{return productKey(p.product_url);}catch{return null;}}).filter(Boolean));}
// A warm live cursor does not prove that newer public gear backlog was consumed.
// Admit only public pending identities missing locally; existing warm rows,
// cursors, cold restoration, and exact-variant revalidation stay unchanged.
function restoreMissingPending(state,checkpoint,snapshot,source){
 const host=new URL(source.officialURL||'https://'+source.sourceDomain).hostname.replace(/^www\./,''),clone=value=>structuredClone(value);
 const fail=(key,reason)=>{throw new Error('checkpoint_queue_ambiguous:'+source.id+':'+key+':'+reason);};
 const time=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))?Date.parse(value):null;
 function ownedURL(value){try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password&&u.hostname.replace(/^www\./,'')===host;}catch{return false;}}
 function identity(row){const url=row.url||row.candidate?.url;if(url&&!ownedURL(url))return null;const key=url?productKey(url):row.key;return typeof key==='string'&&key.startsWith(host+':')&&(!row.key||row.key===key)&&(!row.source_id||row.source_id===source.id)?key:null;}
 const pendingKeys=new Set((state.discoveryPending||[]).map(identity)),known=verifiedKeys(snapshot,source,state);
 // A ledger projection or a listing href is not a primary-content decision.
 const decisionTime=row=>[row.reviewedAt,row.detailObservedAt,...(Array.isArray(row.evidence)?row.evidence.filter(e=>e.kind==='primary_detail').map(e=>e.observedAt):[])].map(time).filter(x=>x!==null).sort((a,b)=>b-a)[0]??null;
 const deferred=row=>['detail_parse_failed','missing_detail_preserved','request_failed_preserved','budget_limited','deferred','pending'].includes(row.status)||row.reason==='Cached primary identity/offer validation incomplete';
 function decisions(key){const found=[];for(const [origin,fields]of [[state,['discoveryReviewQueue','discoveryExcluded']],[checkpoint,['reviewQueue','excludedCandidates']]]){
  const isPublic=origin===checkpoint,pairs=fields.flatMap((field,index)=>(origin[field]||[]).filter(row=>identity(row)===key&&!deferred(row)).map(row=>({row,field:index?'discoveryExcluded':'discoveryReviewQueue',isPublic,fromQueue:true})));
  found.push(...pairs);
  for(const row of origin.discoveryLedger?.entries||[])if(identity(row)===key&&['review','excluded'].includes(row.status)&&!deferred(row)&&decisionTime(row)!==null)found.push({row,field:row.status==='review'?'discoveryReviewQueue':'discoveryExcluded',isPublic});
 }return found;}
 for(const candidate of checkpoint.pendingCandidates||[]){
  const key=identity(candidate);if(!key)fail('invalid_identity','foreign_or_inconsistent_pending');if(pendingKeys.has(key)||known.has(key))continue;
  let winner=null;
  for(const decision of decisions(key)){
   // Published pending+review pairs with this explicit flag are intentional
   // classification rechecks. Preserve that checkpoint's existing semantics.
   if(decision.isPublic&&decision.fromQueue&&decision.field==='discoveryReviewQueue'&&decision.row.status==='needs_review'&&identity(decision.row.candidate||{})===key&&Number.isFinite(decision.row.classificationVersion)&&decision.row.classificationVersion<=CLASSIFICATION_VERSION&&candidate.requiresFreshVerification)continue;
   const at=decisionTime(decision.row),recovery=candidate.requiresFreshVerification?candidate.reviewRecovery:null,recoveredAt=time(recovery?.detailObservedAt);
   if(recovery&&decision.row.status!=='robots_denied_product'){for(const field of ['categoryUrl','evidencePageUrl'])if(recovery[field]&&!ownedURL(recovery[field]))fail(key,'foreign_recovery_evidence');if(at===null||recoveredAt===null||at===recoveredAt)fail(key,'recovery_decision_chronology');if(recoveredAt>at)continue;}
   else if(at===null&&decision.field!=='discoveryExcluded')fail(key,'decision_time_missing');
   if(!winner||decision.row.status==='robots_denied_product'||winner.row.status!=='robots_denied_product'&&at!==null&&(decisionTime(winner.row)===null||decisionTime(winner.row)<at))winner=decision;
  }
  if(winner){
   // Never drop both candidate and its stronger decision. Copy public/ledger
   // evidence into its ordinary queue so subsequent evaluated reports keep it.
   const rows=state[winner.field]||[],index=rows.findIndex(row=>identity(row)===key),current=index<0?null:rows[index];
   const useWinner=!current||decisionTime(current)!==null&&decisionTime(winner.row)>decisionTime(current),restored=clone(useWinner?winner.row:current);
   if(!current){restored.key=key;restored.url=restored.url||candidate.url;}
   const hasLane=row=>{const c=row.candidate||row;return c.mixedCategories===true||c.scope==='mixed'||[c.type,c.scope,row.type,...(row.classifications||[]).map(x=>x.type)].some(x=>['live','gear'].includes(x))||['fish','shrimp','aquatic_plant','snail'].includes(c.subtype);};
   // Historical decisions often omit candidate/type. Retain this exact public
   // candidate's ownership so report projection cannot drop both records.
   if(!hasLane(restored)&&hasLane(candidate))restored.candidate=clone(candidate);
   if(!current||JSON.stringify(restored)!==JSON.stringify(current)){state[winner.field]=rows.slice();if(index<0)state[winner.field].push(restored);else state[winner.field][index]=restored;}
   continue;
  }
  state.discoveryPending=[...(state.discoveryPending||[]),clone(candidate)];pendingKeys.add(key);
  // Keep any intentional same-checkpoint recheck decision beside its candidate.
  for(const [from,to]of [['reviewQueue','discoveryReviewQueue'],['excludedCandidates','discoveryExcluded']])for(const row of checkpoint[from]||[])if(identity(row)===key&&!(state[to]||[]).some(x=>identity(x)===key))state[to]=[...(state[to]||[]),clone(row)];
 }
}
function restoreCheckpoint(previous,snapshot,source,report={}){
 const state=structuredClone(previous||{}),checkpoint=report.discoveryProgress;delete state.classificationRevalidationUpdates;
 if(!state.products?.length){state.products=sourceItems(snapshot,source).map(p=>({...structuredClone(p),source_id:source.id}));state.updatedKeys=[];state.cacheOnly=true;}
 if(checkpoint&&state.dailyDiscovery)restoreMissingPending(state,checkpoint,snapshot,source);
 if(checkpoint&&!state.dailyDiscovery){state.dailyDiscovery={cursor:structuredClone(checkpoint.cursor),categories:structuredClone(checkpoint.categories||[])};state.discoveryPending=structuredClone(checkpoint.pendingCandidates||[]);state.discoveryReviewQueue=structuredClone(checkpoint.reviewQueue||[]);state.discoveryExcluded=structuredClone(checkpoint.excludedCandidates||[]);state.discoveryLedger=structuredClone(checkpoint.discoveryLedger||null);state.categoryTree=structuredClone(checkpoint.categoryTree||null);state.detailQueueCursor=checkpoint.detailQueueCursor||0;}
 if(!checkpoint&&['quarantined','access_stopped'].includes(report.status))state.requiresManualReview=true;
 if(checkpoint){if(!state.gearDailyDiscovery&&checkpoint.gearDiscovery)state.gearDailyDiscovery=structuredClone(checkpoint.gearDiscovery);if(state.gearDetailQueueCursor==null)state.gearDetailQueueCursor=checkpoint.gearDetailQueueCursor||0;state.nextDiscoveryScope=state.nextDiscoveryScope||checkpoint.nextDiscoveryScope||'live';state.priceRefreshCursor=state.priceRefreshCursor||structuredClone(checkpoint.priceRefreshCursor||{});state.classificationRevalidation=state.classificationRevalidation||structuredClone(checkpoint.classificationRevalidation||[]);state.classificationRevalidationQueue=state.classificationRevalidationQueue||structuredClone(checkpoint.classificationRevalidationQueue||[]);}
 // Merge every hold independently. An older public checkpoint must never clear
 // a newer cache hold, even when restoring an absent daily-discovery cursor.
 state.requiresManualReview=previous?.requiresManualReview===true||state.requiresManualReview===true||checkpoint?.requiresManualReview===true||report.requiresManualReview===true;
 const backoffs=[previous?.blockedUntil,state.blockedUntil,checkpoint?.blockedUntil,report.blockedUntil].filter(value=>typeof value==='string'&&Number.isFinite(Date.parse(value)));
 state.blockedUntil=backoffs.sort((a,b)=>Date.parse(b)-Date.parse(a))[0]||null;
 state.collectorLastAttempt=state.collectorLastAttempt||report.collectorLastAttempt||null;
 state.collectorLastSuccess=state.collectorLastSuccess||report.collectorLastSuccess||null;state.discoverySummary=state.discoverySummary||report.discovery||null;
 return state;
}
function progress(state){return {schemaVersion:2,gearDiscovery:state.gearDailyDiscovery||null,gearTreeCoverage:require('./category-tree.cjs').treeProgress(state,'gear'),gearDetailQueueCursor:state.gearDetailQueueCursor||0,nextDiscoveryScope:state.nextDiscoveryScope||'live',priceRefreshCursor:state.priceRefreshCursor||{},classificationRevalidation:state.classificationRevalidation||[],classificationRevalidationQueue:state.classificationRevalidationQueue||[],classificationRevalidationSummary:state.classificationRevalidationSummary||null,cursor:state.dailyDiscovery?.cursor||null,categories:state.dailyDiscovery?.categories||[],categoryTree:state.categoryTree||null,treeCoverage:require('./category-tree.cjs').treeProgress(state),detailQueueCursor:state.detailQueueCursor||0,pendingCandidates:state.discoveryPending||[],reviewQueue:state.discoveryReviewQueue||[],excludedCandidates:state.discoveryExcluded||[],discoveryLedger:state.discoveryLedger||null,requiresManualReview:state.requiresManualReview===true,blockedUntil:state.blockedUntil||null};}
function sourceCursor(sources,prior,mode){const named=sources.findIndex(s=>s.id===prior.runNextSourceIds?.[mode]);return named>=0?named:Math.max(0,Number(prior.runCursors?.[mode])||0)%sources.length;}
module.exports={GROUPS,CLASSIFICATION_VERSION,candidateGroup,takeFairCandidates,sourceItems,verifiedKeys,restoreCheckpoint,progress,sourceCursor};
