'use strict';
const fs=require('node:fs');const path=require('node:path');const {collectSource}=require('./collector/engine.cjs');const {applyUpdates}=require('./collector/publish.cjs');const {integrateDiscovery}=require('./collector/integrate-discovery.cjs');const {refreshScope}=require('./collector/refresh-scope.cjs');
const {restoreCheckpoint,progress,sourceCursor}=require('./collector/queue-policy.cjs');
const {pruneCache}=require('./collector/cache-policy.cjs');
function atomicJson(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});const temp=file+'.tmp';fs.writeFileSync(temp,JSON.stringify(value,null,2)+'\n');fs.renameSync(temp,file);}
async function main(){
 const args=process.argv.slice(2);const get=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
 const registryPath=get('--registry','sources/registry.json'),statePath=get('--state','.collector/state.json'),reportPath=get('--report','.collector/report.json'),mode=get('--mode','all');
 if(!['all','live','gear','reconcile'].includes(mode))throw Error('Invalid collection mode');
 const registry=JSON.parse(fs.readFileSync(registryPath,'utf8'));const prior=fs.existsSync(statePath)?JSON.parse(fs.readFileSync(statePath,'utf8')):{sources:{}};
 const seeds=fs.existsSync('sources/discovery-seeds.json')?JSON.parse(fs.readFileSync('sources/discovery-seeds.json','utf8')).sources:[];const discoveryMode=['all','live','reconcile'].includes(mode)||args.includes('--discover');
 const coverageLive=discoveryMode && !args.includes('--refresh-known');
 const publicPrior=fs.existsSync('dist/collector-status.json')?JSON.parse(fs.readFileSync('dist/collector-status.json','utf8')):{sources:[]};
 prior.runNextSourceIds=prior.runNextSourceIds||{};if(!prior.runNextSourceIds[mode]&&publicPrior.mode===mode&&publicPrior.nextSourceId)prior.runNextSourceIds[mode]=publicPrior.nextSourceId;
 const requestedCategory=get('--discovery-category',null);if(requestedCategory&&!args.includes('--source'))throw Error('--discovery-category requires --source');
 const snapshot=JSON.parse(fs.readFileSync('dist/source-snapshot.json','utf8'));
 const executionBudgetMs=18*60*1000,deadline=Date.now()+executionBudgetMs;
 const selected=args.includes('--source'),cursor=selected?0:sourceCursor(registry.sources,prior,mode);
 const ordered=[...registry.sources.slice(cursor),...registry.sources.slice(0,cursor)];
 prior.runCursors=prior.runCursors||{};prior.runNextSourceIds=prior.runNextSourceIds||{};
 const report={executionBudgetMs,deferredSourceIds:[],startedAt:new Date().toISOString(),mode,runTrigger:process.env.GITHUB_EVENT_NAME||'local',githubRunId:process.env.GITHUB_ACTIONS==='true'?process.env.GITHUB_RUN_ID||null:null,autoRefreshDeployed:false,fullCatalogCoverage:false,sources:[]};
 for(const source of ordered){
  if(args.includes('--source')&&source.id!==get('--source'))continue;
  if(Date.now()>=deadline){report.deferredSourceIds=ordered.filter(s=>!report.sources.some(r=>r.id===s.id)&&(!selected||s.id===get('--source'))).map(s=>s.id);break;}
  const previous=restoreCheckpoint(prior.sources[source.id]||{},snapshot,source,publicPrior.sources.find(r=>r.id===source.id)||{}),scope=refreshScope(source,previous,mode,discoveryMode);const scoped={...source,products:coverageLive?[]:scope.products};
  console.error('Collect '+source.id+' ('+source.sourceDomain+')');
  if(['live','gear'].includes(mode)&&scoped.products.length===0&&!coverageLive)continue;
  let next=await collectSource(scoped,previous,{deadline});next.priceRefreshCursor=scope.cursor;next.refreshScope=scope.summary;const seed=seeds.find(s=>s.id===source.id);
  if(discoveryMode&&seed&&['success','partial_failure','no_confirmed_products'].includes(next.status)){
   if(requestedCategory&&!seed.categories.some(c=>c.url===requestedCategory))throw Error('Discovery category must match observed seed exactly');
   const selected=requestedCategory?{...seed,categories:seed.categories.filter(c=>c.url===requestedCategory)}:seed;next=await integrateDiscovery(source,selected,next,snapshot,{deadline,coverageLive});
  }
  next.cache=pruneCache(next.cache);next.sourceId=source.id;prior.sources[source.id]=next;report.sources.push({id:source.id,domain:source.sourceDomain,status:next.status,collectorLastAttempt:next.collectorLastAttempt,collectorLastSuccess:next.collectorLastSuccess??null,count:next.products.length,coverage:next.coverage,discovery:next.discoverySummary??null,requests:next.requests??0,errors:next.errors});if(!selected){prior.runCursors[mode]=(registry.sources.indexOf(source)+1)%registry.sources.length;prior.runNextSourceIds[mode]=registry.sources[prior.runCursors[mode]].id;}atomicJson(statePath,prior);console.error(source.id+': '+next.status+', verified products '+next.products.length+', requests '+(next.requests||0));
  const partial={...report,checkpointOnly:true,finishedAt:null,lastConfirmedCheckpointAt:new Date().toISOString(),nextSourceId:prior.runNextSourceIds[mode]||null,attemptedSourceIds:report.sources.map(r=>r.id),fullCatalogCoverage:false,sources:registry.sources.map(cfg=>{const st=prior.sources[cfg.id]||{};return {id:cfg.id,domain:cfg.sourceDomain,status:st.status||'not_run',collectorLastAttempt:st.collectorLastAttempt||null,collectorLastSuccess:st.collectorLastSuccess||null,count:st.products?.length||0,requests:st.requests||0,coverage:st.coverage||null,discovery:st.discoverySummary||null,discoveryProgress:progress(st),errors:st.errors||[],attemptedThisExecution:report.sources.some(r=>r.id===cfg.id),automatedExecutionVerified:false};})};atomicJson(reportPath,partial);if(args.includes('--publish')){const saved=applyUpdates(snapshot,prior.sources,mode);if(saved.changes){atomicJson('dist/source-snapshot.json',saved.snapshot);atomicJson('dist/catalog.json',saved.catalog);}atomicJson('dist/collector-status.json',partial);}

  if([...(next.errors||[]),...(next.discoverySummary?.errors||[])].some(e=>e.includes('execution_deadline'))){report.executionDeadlineReached=true;report.deferredSourceIds=ordered.filter(s=>!report.sources.some(r=>r.id===s.id)&&(!selected||s.id===get('--source'))).map(s=>s.id);next.priceRefreshCursor=previous.priceRefreshCursor??0;if(!selected){prior.runCursors[mode]=registry.sources.indexOf(source);prior.runNextSourceIds[mode]=source.id;}atomicJson(statePath,prior);break;}
 }
 if(!report.deferredSourceIds.length&&!report.executionDeadlineReached&&!selected){prior.runCursors[mode]=0;prior.runNextSourceIds[mode]=registry.sources[0].id;}atomicJson(statePath,prior);
 report.executionBudgetLimited=report.deferredSourceIds.length>0||report.executionDeadlineReached===true;
 report.finishedAt=new Date().toISOString();report.nextSourceId=prior.runNextSourceIds[mode]||null;
 const attempted=report.sources;report.attemptedSourceIds=attempted.map(s=>s.id);report.executionEnvironment=process.env.GITHUB_ACTIONS==='true'?'github_actions':'local';
 report.sources=registry.sources.map(source=>{const next=prior.sources[source.id]||{},attemptedThisExecution=report.attemptedSourceIds.includes(source.id);return {id:source.id,domain:source.sourceDomain,status:next.status||'not_run',collectorLastAttempt:next.collectorLastAttempt??null,collectorLastSuccess:next.collectorLastSuccess??null,count:next.products?.length??0,requests:next.requests??0,coverage:next.coverage??null,refreshScope:next.refreshScope??null,discovery:next.discoverySummary??null,discoveryProgress:progress(next),errors:next.errors||[],attemptedThisExecution,executionRunId:report.githubRunId,automatedExecutionVerified:process.env.GITHUB_ACTIONS==='true'&&attemptedThisExecution&&next.status==='success'};});
 if(args.includes('--publish')){
  const output=applyUpdates(snapshot,prior.sources,mode);report.productChanges=output.changes;
  if(output.changes){atomicJson('dist/source-snapshot.json',output.snapshot);atomicJson('dist/catalog.json',output.catalog);}
  atomicJson('dist/collector-status.json',report);
 }
 atomicJson(reportPath,report);console.log(JSON.stringify(args.includes('--quiet')?{startedAt:report.startedAt,finishedAt:report.finishedAt,productChanges:report.productChanges??0,sources:report.sources.map(s=>({id:s.id,status:s.status,count:s.count,requests:s.requests,errors:s.errors}))}:report,null,2));
 if(attempted.some(s=>['failed','access_stopped','partial_failure','robots_unverified'].includes(s.status)))process.exitCode=1;
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={atomicJson};
