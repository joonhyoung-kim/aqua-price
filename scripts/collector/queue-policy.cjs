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
function restoreCheckpoint(previous,snapshot,source,report={}){
 const state=structuredClone(previous||{}),checkpoint=report.discoveryProgress;delete state.classificationRevalidationUpdates;
 if(!state.products?.length){state.products=sourceItems(snapshot,source).map(p=>({...structuredClone(p),source_id:source.id}));state.updatedKeys=[];state.cacheOnly=true;}
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
