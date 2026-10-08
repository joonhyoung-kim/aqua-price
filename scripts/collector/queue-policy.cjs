'use strict';
const {productKey}=require('./discovery.cjs');
const GROUPS=['fish','shrimp','aquatic_plant','snail','mixed'];
const CLASSIFICATION_VERSION=3;
function candidateGroup(candidate){return GROUPS.includes(candidate.subtype)?candidate.subtype:'mixed';}
function takeFairCandidates(candidates,limit,cursor=0,now=Date.now()){
 const buckets=GROUPS.map(group=>candidates.filter(c=>candidateGroup(c)===group&&(!c.retryAfter||now>=Date.parse(c.retryAfter))));const selected=[];let position=cursor%GROUPS.length,empty=0;
 while(selected.length<limit&&empty<GROUPS.length){const bucket=buckets[position];if(bucket.length){selected.push(bucket.shift());empty=0;}else empty++;position=(position+1)%GROUPS.length;}
 return {candidates:selected,cursor:position};
}
function sourceItems(snapshot,source){return (snapshot.items||[]).filter(p=>p.source_id===source.id||p.seller_domain===source.sourceDomain);}
function verifiedKeys(snapshot,source,previous={}){return new Set([...sourceItems(snapshot,source),...(previous.products||[])].map(p=>{try{return productKey(p.product_url);}catch{return null;}}).filter(Boolean));}
function restoreCheckpoint(previous,snapshot,source,report={}){
 const state=structuredClone(previous||{}),checkpoint=report.discoveryProgress;
 if(!state.products?.length){state.products=sourceItems(snapshot,source).map(p=>({...structuredClone(p),source_id:source.id}));state.updatedKeys=[];state.cacheOnly=true;}
 if(checkpoint&&!state.dailyDiscovery){state.dailyDiscovery={cursor:structuredClone(checkpoint.cursor),categories:structuredClone(checkpoint.categories||[])};state.discoveryPending=structuredClone(checkpoint.pendingCandidates||[]);state.discoveryReviewQueue=structuredClone(checkpoint.reviewQueue||[]);state.discoveryExcluded=structuredClone(checkpoint.excludedCandidates||[]);state.requiresManualReview=checkpoint.requiresManualReview===true;state.blockedUntil=checkpoint.blockedUntil||null;}
 if(!checkpoint&&['quarantined','access_stopped'].includes(report.status))state.requiresManualReview=true;
 state.collectorLastSuccess=state.collectorLastSuccess||report.collectorLastSuccess||null;state.discoverySummary=state.discoverySummary||report.discovery||null;
 return state;
}
function progress(state){return {schemaVersion:1,cursor:state.dailyDiscovery?.cursor||null,categories:state.dailyDiscovery?.categories||[],pendingCandidates:state.discoveryPending||[],reviewQueue:state.discoveryReviewQueue||[],excludedCandidates:state.discoveryExcluded||[],requiresManualReview:state.requiresManualReview===true,blockedUntil:state.blockedUntil||null};}
module.exports={GROUPS,CLASSIFICATION_VERSION,candidateGroup,takeFairCandidates,sourceItems,verifiedKeys,restoreCheckpoint,progress};
