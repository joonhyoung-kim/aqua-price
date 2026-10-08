'use strict';
const fs=require('node:fs');
const {productKey,categoryKey}=require('./collector/discovery.cjs');
const {ADAPTERS}=require('./collector/legacy-discovery.cjs');
const {integrateDiscovery}=require('./collector/integrate-discovery.cjs');
const {applyUpdates}=require('./collector/publish.cjs');
const {progress}=require('./collector/queue-policy.cjs');
const {auditCoverage}=require('./audit-coverage.cjs');
const {atomicJson}=require('./collect-catalog.cjs');
const SESSION='.collector/coverage-batch-session.json';
function assertOwnerExited(session,probe=pid=>process.kill(pid,0)){
 if(!Number.isInteger(session.activePid)||session.activePid<1)return;
 try{probe(session.activePid);}catch(e){if(e.code==='ESRCH')return;throw Error('Cannot verify prior batch owner; refuse concurrent resume');}
 throw Error('Prior batch owner is still running; refuse concurrent resume');
}
function selectPlan(registry,seeds,state,audit,session,now=Date.now()){
 const candidates=registry.sources.filter(s=>s.enabled&&s.technicalReadiness!=='blocked').map(source=>{
  const seed=seeds.sources.find(s=>s.id===source.id),st=state.sources[source.id]||{},a=audit.sources.find(s=>s.id===source.id),holds=new Set((source.reviewHoldProducts||[]).map(p=>productKey(p.url)));
  const eligibleCandidates=(st.discoveryPending||[]).filter(p=>(p.type==='live'||p.mixedCategories===true)&&!holds.has(productKey(p.url))&&(!p.retryAfter||Date.parse(p.retryAfter)<=now)),eligibleKeys=new Set(eligibleCandidates.map(p=>productKey(p.url))),allowed=new Set((st.categoryTree?.nodes||[]).filter(n=>['live','mixed'].includes(n.scope)).map(n=>n.key));
  const ready=(a?.categories||[]).filter(c=>allowed.has(categoryKey(c.url))&&c.listingCountMatched&&c.terminalPageReached&&c.unresolvedObservedKeys?.length>0&&c.unresolvedObservedKeys.length<=Math.min(12,source.maxRequests)-1&&c.unresolvedObservedKeys.every(k=>eligibleKeys.has(k)));
  return {source,seed,eligible:eligibleCandidates.length,ready,readySize:ready.length?Math.min(...ready.map(c=>c.unresolvedObservedKeys.length)):Infinity,unvisited:a?.tree?.unvisited||0,ratio:a?.tree?.allowed?1-a.tree.unvisited/a.tree.allowed:1,used:session.sourceVisits[source.id]||0,last:Date.parse(a?.access?.latestAttempt||'1970-01-01'),st};
 }).filter(c=>ADAPTERS.has(c.seed?.adapter)&&!c.st.requiresManualReview&&!(c.st.blockedUntil&&Date.parse(c.st.blockedUntil)>now)&&(c.eligible>0||c.unvisited>0));
 const selected=[],compare=(a,b)=>a.used-b.used||a.ratio-b.ratio||a.last-b.last||a.source.id.localeCompare(b.source.id);
 for(const mode of ['explore','drain','explore','drain','explore']){
  const pool=candidates.filter(c=>!selected.some(p=>p.id===c.source.id)&&(mode==='explore'?c.unvisited>0:c.eligible>0));
  pool.sort(mode==='explore'?compare:(a,b)=>a.used-b.used||a.readySize-b.readySize||a.last-b.last||b.eligible-a.eligible);
  const pick=pool[0];if(pick)selected.push({id:pick.source.id,name:pick.source.name,mode,maxRequests:Math.min(12,pick.source.maxRequests),eligiblePending:pick.eligible,unvisited:pick.unvisited,completionReadyCategoryUrls:pick.ready.map(c=>c.url)});
 }
 return selected;
}
function limits(args){const value=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback,rounds=Number(value('--rounds',3)),minutes=Number(value('--minutes',32));if(!Number.isInteger(rounds)||rounds<1||rounds>3||!Number.isInteger(minutes)||minutes<1||minutes>35)throw Error('Batch limited to 1–3 rounds and 1–35 collection minutes');return {rounds,minutes,roundRequests:60,totalRequests:rounds*60};}
function totals(audit,catalog){return {products:catalog.products.length,unvisited:audit.sources.reduce((n,s)=>n+(s.tree?.unvisited||0),0),terminalCategories:audit.sources.reduce((n,s)=>n+(s.tree?.terminalCategories||0),0),detailCompleteCategories:audit.sources.reduce((n,s)=>n+(s.tree?.detailCompleteCategories||0),0),pending:audit.sources.reduce((n,s)=>n+s.pending.count,0),review:audit.sources.reduce((n,s)=>n+s.classificationReview.length,0)};}
async function run(args=[]){
 const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),registry=read('sources/registry.json'),seeds=read('sources/discovery-seeds.json'),state=read('.collector/state.json');let snapshot=read('dist/source-snapshot.json'),catalog=read('dist/catalog.json'),audit=auditCoverage(registry,state,catalog),session;
 if(args.includes('--resume')){session=read(SESSION);if(session.finishedAt)throw Error('Batch already finished; no implicit new budget');assertOwnerExited(session);session.resumptions=[...(session.resumptions||[]),{resumedAt:new Date().toISOString(),requestsAlreadySpent:session.transactions.length,lastCompletedCheckpoint:session.lastCheckpointAt,deadlinePreserved:session.deadline}];}
 else {const old=fs.existsSync(SESSION)?read(SESSION):null;if(old&&!old.finishedAt)throw Error('Unfinished batch exists; use --resume');if(old){fs.mkdirSync('.collector/coverage-batch-history',{recursive:true});atomicJson('.collector/coverage-batch-history/'+Date.parse(old.startedAt)+'.json',old);}const priorBatches=old?[...(old.priorBatches||[]),{batchId:old.batchId,startedAt:old.startedAt,finishedAt:old.finishedAt,before:old.before,after:old.after,requests:old.transactions.length,stopReason:old.stopReason}]:[];const cap=limits(args);session={schemaVersion:1,batchId:'coverage-batch-'+Date.now(),activePid:process.pid,startedAt:new Date().toISOString(),deadline:new Date(Date.now()+cap.minutes*60000).toISOString(),limits:cap,baselineIds:snapshot.items.map(p=>p.id),before:totals(audit,catalog),priorBatches,sourceVisits:{},rounds:[],transactions:[],finishedAt:null,stopReason:null,fullCatalogCoverage:false};atomicJson(SESSION,session);}
 session.activePid=process.pid;atomicJson(SESSION,session);
 const deadline=Date.parse(session.deadline);const saveSession=()=>{atomicJson(SESSION,session);const {baselineIds,...publicSession}=session;atomicJson('dist/coverage-batch-report.json',publicSession);};
 for(let index=0;index<session.limits.rounds;index++){
  if(Date.now()+30000>=deadline){session.stopReason='execution_deadline';break;}
  let round=session.rounds[index];if(round?.finishedAt)continue;
  if(!round){const plan=selectPlan(registry,seeds,state,audit,session);if(!plan.length){session.stopReason='no_eligible_sources';break;}round={index:index+1,startedAt:new Date().toISOString(),before:totals(audit,catalog),plan,sources:[],finishedAt:null};session.rounds.push(round);saveSession();console.log(JSON.stringify({round:round.index,plan}));}
  const startTransactions=()=>session.transactions.filter(t=>t.round===round.index).length;
  for(const slot of round.plan){
   if(round.sources.some(s=>s.id===slot.id))continue;
   if(Date.now()+30000>=deadline||session.transactions.length>=session.limits.totalRequests||startTransactions()>=60)break;
   const cfg=registry.sources.find(s=>s.id===slot.id),seed=seeds.sources.find(s=>s.id===slot.id),prior=state.sources[slot.id]||{},used=session.transactions.filter(t=>t.round===round.index&&t.sourceId===slot.id).length;
   const remaining=Math.min(slot.maxRequests-used,60-startTransactions(),session.limits.totalRequests-session.transactions.length);
   if(remaining<=0){round.sources.push({id:slot.id,status:'prior_requests_consumed_without_completed_checkpoint',requests:used,requestLimit:slot.maxRequests});saveSession();continue;}
   const before=catalog.products.filter(p=>p.sellerId===cfg.sourceDomain).length,startedAt=new Date().toISOString(),priorPending=prior.discoveryPending?.length||0;
   const priorTransactions=session.transactions.filter(t=>t.round===round.index&&t.sourceId===slot.id),lastRequest=priorTransactions.at(-1),denial=priorTransactions.find(t=>[403,429].includes(t.httpStatus));
   const current={...prior,requests:0,errors:[],collectorLastAttempt:startedAt,lastRequestAt:Math.max(prior.lastRequestAt||0,lastRequest?Date.parse(lastRequest.requestedAt):0)};
   if(denial){current.requiresManualReview=denial.httpStatus===403;current.blockedUntil=new Date(Date.parse(denial.requestedAt)+86400000).toISOString();current.httpStatus=denial.httpStatus;}
   const fetchObserved=async(url,options)=>{
    if(session.transactions.length>=session.limits.totalRequests||startTransactions()>=60||session.transactions.filter(t=>t.round===round.index&&t.sourceId===slot.id).length>=slot.maxRequests)throw Error('request_limit');
    const transaction={round:round.index,sourceId:slot.id,url,requestedAt:new Date().toISOString(),httpStatus:null,method:'standard_same_official_host_https'};session.transactions.push(transaction);saveSession();
    try{const response=await fetch(url,options);transaction.httpStatus=response.status;transaction.checkedAt=new Date().toISOString();saveSession();return response;}catch(e){transaction.error=e.message;saveSession();throw e;}
   };
   const next=await integrateDiscovery({...cfg,maxRequests:remaining},{...seed,maxPages:2,maxPagesPerCategory:1,probeFirstPage:false},current,snapshot,{fetch:fetchObserved,deadline,coverageLive:true,pendingFirst:slot.mode==='drain',preferUnvisitedCategories:slot.mode==='explore',preferCompletedCategories:slot.mode==='drain'});
   state.sources[slot.id]=next;const published=applyUpdates(snapshot,{[slot.id]:next},'reconcile');snapshot=published.snapshot;catalog=published.catalog;
   if(session.baselineIds.some(id=>!snapshot.items.some(p=>p.id===id)))throw Error('Baseline product removed');
   const entry={id:slot.id,name:cfg.name,mode:slot.mode,startedAt,finishedAt:new Date().toISOString(),requestLimit:slot.maxRequests,requests:session.transactions.filter(t=>t.round===round.index&&t.sourceId===slot.id).length,before,after:catalog.products.filter(p=>p.sellerId===cfg.sourceDomain).length,pendingBefore:priorPending,pendingAfter:next.discoveryPending?.length||0,newCandidates:next.discoverySummary?.newCandidates||0,verifiedOffers:next.discoverySummary?.verifiedItems||0,pagesVisited:next.discoverySummary?.pagesVisited||0,detailBudget:next.discoverySummary?.detailBudget||0,status:next.discoverySummary?.status,errors:next.discoverySummary?.errors||[],tree:next.discoverySummary?.categoryTree};
   round.sources.push(entry);session.sourceVisits[slot.id]=(session.sourceVisits[slot.id]||0)+1;
   atomicJson('.collector/state.json',state);atomicJson('dist/source-snapshot.json',snapshot);atomicJson('dist/catalog.json',catalog);audit=auditCoverage(registry,state,catalog);atomicJson('dist/merchant-coverage-audit.json',audit);
   const collector=read('dist/collector-status.json'),row=collector.sources.find(s=>s.id===slot.id);Object.assign(row,{status:next.status,count:entry.after,collectorLastAttempt:next.collectorLastAttempt,collectorLastSuccess:next.collectorLastSuccess,requests:entry.requests,discovery:next.discoverySummary,discoveryProgress:progress(next),errors:next.errors,latestTargetedAudit:entry,automatedExecutionVerified:false});collector.targetedAudit={batchId:session.batchId,startedAt:session.startedAt,finishedAt:null,reportPath:'coverage-batch-report.json',fullCatalogCoverage:false};atomicJson('dist/collector-status.json',collector);
   session.lastCheckpointAt=entry.finishedAt;session.after=totals(audit,catalog);saveSession();console.log(JSON.stringify({checkpoint:slot.id,round:round.index,products:catalog.products.length,added:entry.after-entry.before,pending:entry.pendingAfter,requests:entry.requests,mode:slot.mode}));
  }
  round.finishedAt=new Date().toISOString();round.after=totals(audit,catalog);round.requests=startTransactions();round.progress=round.after.products>round.before.products||round.after.unvisited<round.before.unvisited||round.after.terminalCategories>round.before.terminalCategories||round.after.detailCompleteCategories>round.before.detailCompleteCategories||round.after.pending<round.before.pending;
  saveSession();console.log(JSON.stringify({roundFinished:round.index,requests:round.requests,before:round.before,after:round.after,progress:round.progress}));
  if(!round.progress){session.stopReason='no_new_collection_progress';break;}
  if(Date.now()+30000>=deadline){session.stopReason='execution_deadline';break;}
 }
 session.finishedAt=new Date().toISOString();session.activePid=null;session.stopReason=session.stopReason||'finite_round_limit';session.after=totals(audit,catalog);session.requestBudgetVerified=session.transactions.length<=session.limits.totalRequests&&session.rounds.every(r=>r.requests<=60&&r.sources.every(s=>s.requests<=s.requestLimit));session.baselineProductsRemoved=0;
 if(!session.requestBudgetVerified)throw Error('Batch request budget invalid');saveSession();const collector=read('dist/collector-status.json');collector.targetedAudit.finishedAt=session.finishedAt;atomicJson('dist/collector-status.json',collector);console.log(JSON.stringify({finishedAt:session.finishedAt,stopReason:session.stopReason,before:session.before,after:session.after,requests:session.transactions.length,budgetVerified:session.requestBudgetVerified}));
}
if(require.main===module)run(process.argv.slice(2)).catch(e=>{console.error(e.stack);process.exitCode=1;});
module.exports={selectPlan,limits,totals,assertOwnerExited};
