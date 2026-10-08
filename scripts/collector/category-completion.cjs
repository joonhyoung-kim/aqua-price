'use strict';
const {productKey}=require('./discovery.cjs');
function categoryEvidence(cursor,state,verified){
 const keys=[...new Set(cursor.seenKeys||[])],excluded=new Set((state.discoveryExcluded||[]).filter(i=>i.status==='excluded_scope').map(i=>i.key));
 const unresolved=keys.filter(k=>!verified.has(k)&&!excluded.has(k)),terminal=cursor.nextUrl===null&&cursor.lastCycle?.terminalPageReached===true;
 const count=cursor.lastCycle?.reportedCount,matched=terminal&&cursor.lastCycle?.categoryLinkCountMatched===true&&Number.isInteger(count)&&count===keys.length;
 return {terminalPageReached:terminal,listingCountMatched:matched,observedUniqueLinks:keys.length,verifiedObservedLinks:keys.filter(k=>verified.has(k)).length,excludedObservedLinks:keys.filter(k=>excluded.has(k)&&!verified.has(k)).length,unresolvedObservedKeys:unresolved,observedDetailsResolved:terminal&&unresolved.length===0&&(keys.length>0||count===0),detailCoverageComplete:matched&&unresolved.length===0};
}
function completionTargets(state,verified,candidates,maxDetails=11){
 const allowed=new Set((state.categoryTree?.nodes||[]).filter(n=>['live','mixed'].includes(n.scope)).map(n=>n.key)),eligible=new Set(candidates.map(p=>productKey(p.url))),targets=[];
 for(const [key,c]of Object.entries(state.dailyDiscovery?.cursor?.categories||{})){if(!allowed.has(key))continue;const evidence=categoryEvidence(c,state,verified);if(evidence.listingCountMatched&&evidence.unresolvedObservedKeys.length>0&&evidence.unresolvedObservedKeys.length<=maxDetails&&evidence.unresolvedObservedKeys.every(k=>eligible.has(k)))targets.push({categoryUrl:c.entryUrl,keys:evidence.unresolvedObservedKeys});}
 targets.sort((a,b)=>a.keys.length-b.keys.length||a.categoryUrl.localeCompare(b.categoryUrl));const chosen=[],used=new Set();for(const target of targets){const extra=target.keys.filter(k=>!used.has(k));if(used.size+extra.length>maxDetails)continue;chosen.push(target);for(const key of target.keys)used.add(key);}return chosen;
}
module.exports={categoryEvidence,completionTargets};
