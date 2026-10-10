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
const expected=['17 */6 * * *','29 */12 * * *','43 2 * * *'];
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
test('exactly seven scheduled slots per UTC day, with no duplicate slots',()=>{
 assert.deepEqual(schedules,expected);
 for(const [index,mode]of ['live','gear','reconcile'].entries())assert.ok(workflow.includes("'"+expected[index]+"') mode="+mode+" ;;"));
 const slots=[];
 for(const cron of schedules){
  const [minute,hours,day,month,weekday]=cron.split(' ');
  assert.deepEqual([day,month,weekday],['*','*','*']);
  const selected=hours.startsWith('*/')?Array.from({length:24/Number(hours.slice(2))},(_,i)=>i*Number(hours.slice(2))):[Number(hours)];
  for(const hour of selected)slots.push(hour*60+Number(minute));
 }
 assert.equal(slots.length,7);assert.equal(new Set(slots).size,7);
});
for(const [index,mode]of ['live','gear','reconcile'].entries())test('scheduled '+mode+' selects only its existing collection mode',{skip:!bashAvailable},()=>{
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
 assert.equal(out.sources[0].schedule,'생물 6시간마다 / 용품 12시간마다 / 목록 대조 매일 02:43 (UTC · 설정 기준)');
 assert.equal(out.sources[1].schedule,null);assert.equal(out.sources[0].autoRefreshVerified,false);
});
test('preview-only publication, pacing, recovery and both validation gates remain intact',()=>{
 assert.match(workflow,/ref: preview/);assert.match(workflow,/git push origin HEAD:preview/);
 assert.equal([...workflow.matchAll(/\bnpm test\b/g)].length,2);
 assert.match(workflow,/timeout-minutes: 25/);assert.match(workflow,/cancel-in-progress: false/);
 assert.match(workflow,/Preserve lastgood and refusal quarantine\n        if: always\(\)/);
 assert.match(workflow,/Report source failures without retrying/);
 assert.doesNotMatch(workflow,/--refresh-known|--discover|HEAD:main|cancel-in-progress: true/);
 assert.match(workflow,/git add -- dist\/catalog\.json dist\/source-snapshot\.json dist\/collector-status\.json dist\/admin\/status\.json/);
 assert.match(read('scripts/collect-catalog.cjs'),/executionBudgetMs\s*=\s*18\s*\*\s*60\s*\*\s*1000/);
 assert.match(read('scripts/collect-catalog.cjs'),/atomicJson\(reportPath,\s*current\)/);
 assert.match(read('scripts/collect-catalog.cjs'),/atomicJson\('dist\/collector-status\.json',\s*current\)/);
 const active=path.join(root,'.github/workflows/catalog-refresh.yml');
 if(fs.existsSync(active))assert.equal(fs.readFileSync(active,'utf8'),workflow,'active main workflow must match its preview template');
});
