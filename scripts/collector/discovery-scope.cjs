'use strict';
// Discovery lanes share the source's request/access budget, not each other's cursor.
const SCOPES=new Set(['live','gear','all']);
function discoveryScope(options={}){const scope=options.discoveryScope||(options.coverageLive?'live':'all');if(!SCOPES.has(scope))throw Error('Invalid discovery scope');return scope;}
function categoryEligible(category,scope){if(category.excluded)return false;if(scope==='all')return true;return category.type===scope||category.scope===scope||category.mixedCategories===true||category.scope==='mixed';}
function candidateEligible(candidate,scope){return scope==='all'||candidate.type===scope||candidate.mixedCategories===true;}
function laneField(scope){return scope==='gear'?'gearDailyDiscovery':'dailyDiscovery';}
function requestAllocation(source,discovery=true){const total=Math.max(0,Math.min(20,Number.isSafeInteger(source.maxRequests)?source.maxRequests:20));const knownProductLimit=discovery?Math.min(3,Math.max(0,total-4)):Math.min(15,Math.max(0,total-1));return {total,knownProductLimit,knownRequestLimit:Math.min(total,knownProductLimit+1),discoveryRequestReserve:discovery?Math.max(0,total-knownProductLimit-1):0};}
module.exports={SCOPES,discoveryScope,categoryEligible,candidateEligible,laneField,requestAllocation};
