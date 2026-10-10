'use strict';
const fs=require('fs');const {atomicJson}=require('./collect-catalog.cjs');
function scheduleText(automation={}){
 const entries=Object.entries({live:'생물',gear:'용품',reconcile:'목록 대조'}).map(([key,label])=>{
  const cron=automation.scheduleUTC?.[key];if(typeof cron!=='string'||!cron.trim())return null;
  const every=cron.match(/^(\d{1,2}) \*\/(\d{1,2}) \* \* \*$/),daily=cron.match(/^(\d{1,2}) (\d{1,2}) \* \* \*$/);
  return label+' '+(every?Number(every[2])+'시간마다':daily?'매일 '+daily[2].padStart(2,'0')+':'+daily[1].padStart(2,'0'):'cron '+cron);
 });
 return entries.filter(Boolean).length?entries.filter(Boolean).join(' / ')+' (UTC · 설정 기준)':'예약 주기 미확인';
}
// Names must come from observed content, never from a URL slug or every catalog row.
function discoveryProductNames(run={},products=[]){
 const {productKey}=require('./collector/discovery.cjs');
 const keyOf=value=>{try{return productKey(value);}catch{return null;}};
 const clean=value=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim():'';
 const titles=new Map(products.map(p=>[keyOf(p.product_url),clean(p.title)]).filter(([key,title])=>key&&title));
 const progress=run.discoveryProgress||{},discovery=run.discovery||{};
 const entries=[...(progress.pendingCandidates||[]),...(progress.reviewQueue||[]),...(discovery.reviewQueue||[]),...Object.values(discovery.scopes||{}).flatMap(scope=>scope.reviewQueue||[]),...(progress.discoveryLedger?.entries||[]).filter(entry=>entry.status!=='excluded')];
 const candidates=new Map();
 for(const entry of entries){
  const url=entry.url||entry.candidate?.url,key=keyOf(url)||entry.key;
  const title=clean(entry.title)||clean(entry.candidate?.title)||titles.get(key)||'';
  const identity=key||title;if(!identity)continue;
  const prior=candidates.get(identity);if(!prior||!prior.title&&title)candidates.set(identity,{title});
 }
 return {names:[...new Set([...candidates.values()].map(p=>p.title).filter(Boolean))],unnamedCount:[...candidates.values()].filter(p=>!p.title).length,candidateCount:candidates.size};
}
function adminStatus(registry,report,snapshot,automation={configured:false,verifiedRun:false},controls=null){
 const reports=new Map((report?.sources||[]).map(s=>[s.id,s]));
 return {schemaVersion:1,generatedAt:new Date().toISOString(),originalSourceCount:45,additionalSnapshotDomains:registry.additionalSnapshotDomains,automation,controls:controls?{schemaVersion:1,config:controls.config,revision:controls.revision,collectorRevision:report?.collectorControls?.revision||null,schedule:report?.schedule||null}:null,discoveryScope:{mappedSources:registry.sources.filter(s=>s.discovery?.mappedSeedCount).length,observedSeeds:registry.sources.reduce((n,s)=>n+(s.discovery?.mappedSeedCount||0),0),adapterEnabledSources:registry.sources.filter(s=>s.discovery?.newProductDiscovery).length,fullCatalogCoverage:false},
 sources:registry.sources.map(source=>{const run=reports.get(source.id),products=snapshot.items.filter(p=>p.seller_domain===source.sourceDomain),control=controls?require('./collector/controls.cjs').sourceDecision(source,run||{},controls,Date.now()):null;return {id:source.id,name:source.name,domain:source.sourceDomain,officialUrl:source.officialURL,technicalReadiness:source.technicalReadiness,enabled:source.enabled===true,control,snapshotProductCount:products.length,collectorProductCount:run?.count??0,refreshScope:run?.refreshScope??null,collectorStatus:run?.status??'not_run',collectorLastAttempt:run?.collectorLastAttempt??null,collectorLastSuccess:run?.collectorLastSuccess??null,collectorLastError:run?.errors?.at(-1)??null,blockers:source.blockers,discovery:{...source.discovery,...run?.discovery,productNames:discoveryProductNames(run,products),categoryTree:run?.discoveryProgress?.treeCoverage||run?.discovery?.categoryTree||null,adapter:source.discovery?.adapter},fullCatalogCoverage:run?.coverage?.kind==='full_catalog'&&run?.coverage?.paginationComplete===true,autoRefreshVerified:(automation.verifiedRun===true||automation.dataPipelineVerified===true)&&run?.automatedExecutionVerified===true&&source.enabled===true&&run?.status==='success',schedule:source.enabled===true?(controls?'생물 '+controls.config.intervalsHours.live+'시간 / 용품 '+controls.config.intervalsHours.gear+'시간 / 목록 대조 '+controls.config.intervalsHours.reconcile+'시간 (예약 슬롯 기준)':scheduleText(automation)):null};})};
}
if(require.main===module){const registry=require('../sources/registry.json');const report=fs.existsSync('dist/collector-status.json')?JSON.parse(fs.readFileSync('dist/collector-status.json','utf8')):null;const snapshot=require('../dist/source-snapshot.json');const automation=fs.existsSync('sources/automation-status.json')?JSON.parse(fs.readFileSync('sources/automation-status.json','utf8')):{configured:false,verifiedRun:false};let controls=null,controlsError=null;try{controls=require('./collector/controls.cjs').loadControls(registry);}catch{controlsError='수집 설정 파일이 없거나 잘못되어 설정 변경과 새 수집이 중지되었습니다. GitHub 설정 파일을 확인하세요.';}const status=adminStatus(registry,report,snapshot,automation,controls);if(controlsError)status.controlsError=controlsError;atomicJson('dist/admin/status.json',status);}
module.exports={adminStatus,scheduleText,discoveryProductNames};
