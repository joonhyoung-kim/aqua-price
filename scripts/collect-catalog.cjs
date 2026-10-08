'use strict';
const fs=require('node:fs');const path=require('node:path');const {collectSource}=require('./collector/engine.cjs');const {applyUpdates}=require('./collector/publish.cjs');
function atomicJson(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});const temp=file+'.tmp';fs.writeFileSync(temp,JSON.stringify(value,null,2)+'\n');fs.renameSync(temp,file);}
async function main(){
 const args=process.argv.slice(2);const get=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
 const registryPath=get('--registry','sources/registry.json'),statePath=get('--state','.collector/state.json'),reportPath=get('--report','.collector/report.json'),mode=get('--mode','all');
 if(!['all','live','gear','reconcile'].includes(mode))throw Error('Invalid collection mode');
 const registry=JSON.parse(fs.readFileSync(registryPath,'utf8'));const prior=fs.existsSync(statePath)?JSON.parse(fs.readFileSync(statePath,'utf8')):{sources:{}};
 const report={startedAt:new Date().toISOString(),mode:'explicit_local_run',autoRefreshDeployed:false,fullCatalogCoverage:false,sources:[]};
 for(const source of registry.sources){
  if(args.includes('--source')&&source.id!==get('--source'))continue;
  const scoped={...source,products:source.products.filter(p=>mode==='live'?p.type==='live':mode==='gear'?p.type==='gear':true)};
  if(['live','gear'].includes(mode)&&scoped.products.length===0)continue;
  const next=await collectSource(scoped,prior.sources[source.id]||{});next.sourceId=source.id;prior.sources[source.id]=next;report.sources.push({id:source.id,domain:source.sourceDomain,status:next.status,collectorLastAttempt:next.collectorLastAttempt,collectorLastSuccess:next.collectorLastSuccess??null,count:next.products.length,coverage:next.coverage,requests:next.requests??0,errors:next.errors});atomicJson(statePath,prior);
 }
 report.finishedAt=new Date().toISOString();
 const attempted=report.sources;report.attemptedSourceIds=attempted.map(s=>s.id);report.executionEnvironment=process.env.GITHUB_ACTIONS==='true'?'github_actions':'local';
 report.sources=registry.sources.map(source=>{const next=prior.sources[source.id]||{};return {id:source.id,domain:source.sourceDomain,status:next.status||'not_run',collectorLastAttempt:next.collectorLastAttempt??null,collectorLastSuccess:next.collectorLastSuccess??null,count:next.products?.length??0,coverage:next.coverage??null,errors:next.errors||[],attemptedThisExecution:report.attemptedSourceIds.includes(source.id),automatedExecutionVerified:false};});
 if(args.includes('--publish')){
  const snapshot=JSON.parse(fs.readFileSync('dist/source-snapshot.json','utf8'));const output=applyUpdates(snapshot,prior.sources,mode);report.productChanges=output.changes;
  if(output.changes){atomicJson('dist/source-snapshot.json',output.snapshot);atomicJson('dist/catalog.json',output.catalog);}
  atomicJson('dist/collector-status.json',report);
 }
 atomicJson(reportPath,report);console.log(JSON.stringify(args.includes('--quiet')?{startedAt:report.startedAt,finishedAt:report.finishedAt,productChanges:report.productChanges??0,sources:report.sources.map(s=>({id:s.id,status:s.status,count:s.count,requests:s.requests,errors:s.errors}))}:report,null,2));
 if(attempted.some(s=>['failed','access_stopped','partial_failure','robots_unverified'].includes(s.status)))process.exitCode=1;
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={atomicJson};
