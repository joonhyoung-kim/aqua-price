'use strict';
// Standalone read-only experiment; deliberately not called by scheduled collect-catalog.
const fs=require('node:fs');const {discoverSource}=require('./collector/discovery.cjs');const {collectSource}=require('./collector/engine.cjs');const {atomicJson}=require('./collect-catalog.cjs');
async function main(){
 const args=process.argv.slice(2),get=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;const sourceId=get('--source',null);if(!sourceId)throw Error('--source original registry id is required');if(args.includes('--publish'))throw Error('Experimental discovery cannot publish');
 const registry=JSON.parse(fs.readFileSync('sources/registry.json','utf8')),seeds=JSON.parse(fs.readFileSync('sources/discovery-seeds.json','utf8'));const source=registry.sources.find(s=>s.id===sourceId),seed=seeds.sources.find(s=>s.id===sourceId);if(!source||!seed||seed.domainMustMatch&&source.sourceDomain!==seed.domainMustMatch)throw Error('Source/seed domain mismatch');
 if(!source.enabled||source.technicalReadiness==='blocked')throw Error('Source is disabled; discovery is not permitted');const stateFile='.collector/discovery-state.json',state=fs.existsSync(stateFile)?JSON.parse(fs.readFileSync(stateFile,'utf8')):{sources:{}};const collectorState=fs.existsSync('.collector/state.json')?JSON.parse(fs.readFileSync('.collector/state.json','utf8')):{sources:{}};
 const previous={...collectorState.sources[sourceId],...state.sources[sourceId]};if(collectorState.sources[sourceId]?.requiresManualReview)previous.requiresManualReview=true;if(collectorState.sources[sourceId]?.blockedUntil&&Date.now()<Date.parse(collectorState.sources[sourceId].blockedUntil))previous.blockedUntil=collectorState.sources[sourceId].blockedUntil;
 const verify=Number(get('--verify','0'));if(!Number.isSafeInteger(verify)||verify<0||verify>20)throw Error('--verify must be 0..20');
 const selectedCategory=get('--category',null);if(selectedCategory&&!seed.categories.some(c=>c.url===selectedCategory))throw Error('Category must match a reviewed seed exactly');
 const config={...seed,categories:selectedCategory?seed.categories.filter(c=>c.url===selectedCategory):seed.categories,maxPages:Number(get('--pages',seed.maxPages)),maxProducts:Number(get('--products',seed.maxProducts))};const result=await discoverSource({...source,discovery:config},previous);state.sources[sourceId]=result;atomicJson(stateFile,state);
 let verification=null;
 if(verify>0&&['success','partial_discovery'].includes(result.status)){
  const availableBudget=Math.max(0,source.maxRequests-result.requests);const candidates=result.products.filter(p=>p.type==='gear'||['fish','shrimp','aquatic_plant','snail'].includes(p.subtype)).slice(0,Math.min(verify,availableBudget));
  if(candidates.length){verification=await collectSource({...source,maxRequests:availableBudget,products:candidates},{cache:result.cache,products:[]});atomicJson('.collector/discovery-verified-'+sourceId+'.json',verification);}
 }
 const {cache,...report}=result;const verified=verification?{status:verification.status,errors:verification.errors,requests:verification.requests,products:verification.products}:null;atomicJson('.collector/discovery-report-'+sourceId+'.json',{published:false,discovery:report,verification:verified});console.log(JSON.stringify({published:false,source:sourceId,status:result.status,candidates:result.products.length,verified:verification?.products?.length||0,requests:result.requests+(verification?.requests||0),coverageComplete:result.coverage.coverageComplete,errors:result.errors},null,2));
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});module.exports={main};
