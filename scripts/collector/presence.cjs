'use strict';
// Evidence classification only. No published rows are deleted by this module.
function recordPresence(previous={},observation={},coverage={coverageComplete:false}){
 const next=structuredClone(previous);next.deletionEligible=false;
 const timestamp=Date.parse(observation.observedAt);if(!Number.isFinite(timestamp))throw Error('Presence observation timestamp required');
 if(observation.fresh!==true){next.status='cached_unconfirmed';return next;}
 if(observation.httpStatus===200&&observation.productVerified===true){next.status=observation.available===false?'out_of_stock':observation.available===true?'in_stock':'availability_unknown';next.missingEvidence=[];next.lastVerifiedAt=observation.observedAt;return next;}
 if(![404,410].includes(observation.httpStatus)){next.status='transient_or_unverified';next.lastErrorAt=observation.observedAt;return next;}
 const evidence=next.missingEvidence||[];if(!evidence.some(e=>e.observedAt===observation.observedAt))evidence.push({httpStatus:observation.httpStatus,observedAt:observation.observedAt});
 next.missingEvidence=evidence.slice(-4);next.status='missing_requires_confirmation';
 const dates=next.missingEvidence.map(e=>Date.parse(e.observedAt));const repeated=dates.length>=2&&Math.max(...dates)-Math.min(...dates)>=86400000;
 if(repeated)next.status='repeated_missing';next.deletionEligible=repeated&&coverage.coverageComplete===true&&coverage.requestFailures===0&&coverage.parseFailures===0;return next;
}
module.exports={recordPresence};
