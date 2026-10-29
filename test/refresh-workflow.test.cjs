'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {spawnSync}=require('node:child_process');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const workflow=read('sources/catalog-refresh.workflow.yml');
// Routing executes on the Linux Actions runner; native Windows keeps static checks.
const bashAvailable=process.platform!=='win32'&&spawnSync('bash',['--version'],{encoding:'utf8',timeout:3000}).status===0;
const schedules=[...workflow.matchAll(/^    - cron: '([^']+)'$/gm)].map(m=>m[1]);
const expected=['0 0,12 * * *'];
function runSelection(schedule='',requested=''){
 const block=workflow.match(/      - name: Refresh registered sources\n([\s\S]*?)(?=      - name:)/)?.[1];
 assert.ok(block,'collector step exists');
 const command=block.split('        run: |\n')[1].split('\n').map(line=>line.replace(/^          /,'')).join('\n');
 const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'aqua-schedule-'));
 try{
  fs.writeFileSync(path.join(cwd,'npm'),'#!/bin/sh\nprintf \'%s\\n\' "$@"\n',{mode:0o755});
  return spawnSync('bash',['-e','-o','pipefail','-c',command],{cwd,encoding:'utf8',timeout:5000,env:{...process.env,PATH:cwd+path.delimiter+process.env.PATH,EVENT_SCHEDULE:schedule,REQUESTED_MODE:requested}});
 }finally{fs.rmSync(cwd,{recursive:true,force:true});}
}
test('exactly two shared-budget slots at Korea 09 and 21, with no duplicate slots',()=>{
 assert.deepEqual(schedules,expected);
 assert.ok(workflow.includes("'"+expected[0]+"') mode=all ;;"));
 const slots=[];
 for(const cron of schedules){
  const [minute,hours,day,month,weekday]=cron.split(' ');
  assert.deepEqual([day,month,weekday],['*','*','*']);
  const selected=hours.split(',').map(Number);
  for(const hour of selected)slots.push(hour*60+Number(minute));
 }
 assert.deepEqual(slots,[0,720]);assert.equal(new Set(slots).size,2);
});
for(const [index,mode]of ['all'].entries())test('scheduled '+mode+' selects the existing combined collection mode',{skip:!bashAvailable},()=>{
 const result=runSelection(expected[index]);
 assert.equal(result.status,0,result.stderr);
 assert.deepEqual(result.stdout.trim().split('\n'),['run','collect','--','--mode',mode,'--publish','--quiet']);
});
for(const mode of ['all','live','gear','reconcile'])test('manual mode '+mode+' is preserved',{skip:!bashAvailable},()=>{
 const result=runSelection('',mode);assert.equal(result.status,0,result.stderr);
 assert.deepEqual(result.stdout.trim().split('\n'),['run','collect','--','--mode',mode,'--publish','--quiet']);
});
test('invalid manual modes fail before invoking the collector',{skip:!bashAvailable},()=>{
 const result=runSelection('','unsupported');assert.notEqual(result.status,0);assert.equal(result.stdout,'');
});
test('omitted manual mode keeps all; explicit mode overrides a schedule',{skip:!bashAvailable},()=>{
 for(const [schedule,requested,mode]of [['','','all'],[expected[0],'gear','gear']]){
  const result=runSelection(schedule,requested);assert.equal(result.status,0,result.stderr);assert.equal(result.stdout.trim().split('\n')[4],mode);
 }
});
test('schedule metadata and admin display match the cadence without claiming execution verification',()=>{
 const automation=JSON.parse(read('sources/automation-status.json'));
 assert.deepEqual(Object.values(automation.scheduleUTC),expected);
 const {adminStatus}=require('../scripts/build-admin-status.cjs');
 const enabled={id:'fixture',sourceDomain:'example.invalid',enabled:true};
 const out=adminStatus({sources:[enabled,{...enabled,id:'disabled',enabled:false}]},{sources:[]},{items:[]},automation);
 assert.equal(out.sources[0].schedule,'생물·용품 매일 09:00 / 21:00 (한국시간 · 시작 예정, 예약 지연 가능 · 공유 18분 예산)');
 assert.equal(out.sources[1].schedule,null);assert.equal(out.sources[0].autoRefreshVerified,false);
});
test('data-only production publication, pacing, recovery and both validation gates remain intact',()=>{
 assert.match(workflow,/ref: main/);assert.match(workflow,/node scripts\/publish-catalog\.cjs/);
 assert.equal([...workflow.matchAll(/\bnpm test\b/g)].length,2);
 assert.match(workflow,/timeout-minutes: 25/);assert.match(workflow,/cancel-in-progress: false/);
 assert.match(workflow,/Preserve lastgood and refusal quarantine\n        if: always\(\)/);
 assert.match(workflow,/Report source failures without retrying/);
 assert.doesNotMatch(workflow,/--refresh-known|--discover|cancel-in-progress: true/);
 assert.match(workflow,/git fetch origin main preview/);assert.match(workflow,/fetch-depth: 0/);
 assert.match(read('scripts/collect-catalog.cjs'),/executionBudgetMs\s*=\s*18\s*\*\s*60\s*\*\s*1000/);
 assert.match(read('scripts/collect-catalog.cjs'),/atomicJson\(reportPath,\s*current\)/);
 assert.match(read('scripts/collect-catalog.cjs'),/atomicJson\('dist\/collector-status\.json',\s*current\)/);
 const active=path.join(root,'.github/workflows/catalog-refresh.yml');
 if(fs.existsSync(active))assert.equal(fs.readFileSync(active,'utf8'),workflow,'active main workflow must match its preview template');
});
