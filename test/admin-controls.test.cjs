'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const controls=require('../dist/admin/controls.js');
const fixture=()=>({schemaVersion:1,intervalsHours:{live:6,gear:12,reconcile:24},sources:{a:{enabled:true},b:{enabled:false}}});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function harness(){
 const nodes={};for(const id of ['controlsPanel','controlsMessage','controlsDraft','copyControls','verifyControls','reloadControls','draftState','githubRevision','collectorRevision','githubSettings','rows','interval-live','interval-gear','interval-reconcile'])nodes[id]={value:'',innerHTML:'',textContent:'',disabled:false,handlers:{},addEventListener(e,cb){this.handlers[e]=cb;},focus(){this.focused=true;},select(){this.selected=true;}};
 let stored=fixture(),sha='oldsha',failure=null;const requests=[],copied=[];
 const context=vm.createContext({document:{getElementById:id=>nodes[id]},fetch:async(url,options)=>{requests.push({url,options});return failure?{ok:false,status:failure}:{ok:true,json:async()=>({type:'file',sha,encoding:'base64',content:Buffer.from(JSON.stringify(stored)).toString('base64')})};},navigator:{clipboard:{writeText:async text=>copied.push(text)}},TextDecoder,Uint8Array,atob,structuredClone,console});
 vm.runInContext(fs.readFileSync('dist/admin/controls.js','utf8'),context);
 const data={sources:[{id:'a',name:'A',enabled:true,control:{registryEligible:true}},{id:'b',name:'B',enabled:false,control:{registryEligible:false}}],controls:{config:fixture(),revision:'deployed-hash',collectorRevision:'applied-old-hash'}};
 return {nodes,context,requests,copied,data,api:context.AquaAdminControls,setStored(c,s='newsha'){stored=c;sha=s;},setFailure(code){failure=code;},init(){context.AquaAdminControls.init(data);}};
}
test('controls schema accepts bounded intervals only and missing sources fail closed',()=>{
 assert.deepEqual(controls.normalize(fixture(),['b','a','c']),{...fixture(),sources:{a:{enabled:true},b:{enabled:false},c:{enabled:false}}});
 const invalid=fixture();invalid.intervalsHours.gear=6;assert.throws(()=>controls.normalize(invalid,['a','b']),/주기/);
 for(const mutate of [x=>x.sources.a.enabled='true',x=>x.sources.evil={enabled:true},x=>x.secret='not allowed',x=>x.intervalsHours.command='anything',x=>x.sources=[],x=>x.intervalsHours=[],x=>x.sources.a=[]]){const value=fixture();mutate(value);assert.throws(()=>controls.normalize(value,['a','b']));}
});
test('loaded GitHub settings update the actual draft but changing controls remains unsaved',async()=>{
 const h=harness(),latest=fixture();latest.intervalsHours.live=12;h.setStored(latest,'saved-sha');h.init();await tick();
 assert.equal(h.nodes['interval-live'].value,'12');assert.match(h.nodes.draftState.textContent,/저장본과 같습니다/);
 h.nodes.rows.handlers.change({target:{dataset:{controlSource:'a'},checked:false}});
 assert.equal(JSON.parse(h.nodes.controlsDraft.value).sources.a.enabled,false);assert.match(h.nodes.draftState.textContent,/아직 GitHub에 저장하지/);assert.equal(h.copied.length,0);
 assert.match(h.api.toggleMarkup(h.data.sources[1]),/disabled/);assert.equal(h.requests.every(r=>!r.options.method),true);
});
test('copy does not claim save; verification requires exact GitHub stored content match',async()=>{
 const h=harness();h.init();await tick();h.nodes['interval-gear'].value='24';h.nodes['interval-gear'].handlers.change();
 await h.nodes.copyControls.handlers.click();assert.equal(h.copied.length,1);assert.match(h.nodes.controlsMessage.textContent,/복사했습니다/);assert.match(h.nodes.draftState.textContent,/아직 GitHub에 저장하지/);
 await h.nodes.verifyControls.handlers.click();assert.match(h.nodes.controlsMessage.textContent,/저장본과 현재 초안이 다릅니다/);assert.equal(h.nodes.copyControls.disabled,true);
 h.setStored(JSON.parse(h.nodes.controlsDraft.value),'exact-saved-sha');await h.nodes.verifyControls.handlers.click();assert.match(h.nodes.controlsMessage.textContent,/GitHub 저장을 확인/);assert.match(h.nodes.draftState.textContent,/저장본과 같습니다/);assert.match(h.nodes.collectorRevision.textContent,/applied-old-/);
});
test('concurrent GitHub change blocks stale copy and preserves the draft',async()=>{
 const h=harness();h.init();await tick();h.nodes['interval-live'].value='24';h.nodes['interval-live'].handlers.change();const latest=fixture();latest.intervalsHours.gear=24;h.setStored(latest);
 await h.nodes.copyControls.handlers.click();assert.equal(h.copied.length,0);assert.match(h.nodes.controlsMessage.textContent,/다른 설정이 먼저 저장/);assert.equal(JSON.parse(h.nodes.controlsDraft.value).intervalsHours.live,24);assert.equal(h.nodes.copyControls.disabled,true);
 await h.nodes.reloadControls.handlers.click();assert.equal(JSON.parse(h.nodes.controlsDraft.value).intervalsHours.gear,24);assert.equal(JSON.parse(h.nodes.controlsDraft.value).intervalsHours.live,6);
});
test('GitHub read failures never become saved status or write requests',async()=>{
 const h=harness();h.setFailure(429);h.init();await tick();assert.match(h.nodes.controlsMessage.textContent,/429/);assert.match(h.nodes.draftState.textContent,/최신 저장본 확인 필요/);assert.equal(h.nodes.copyControls.disabled,true);assert.equal(h.requests.every(r=>!r.options.method),true);
 const js=fs.readFileSync('dist/admin/controls.js','utf8');assert.doesNotMatch(js,/localStorage|sessionStorage|Authorization|github_pat_|method\s*:\s*['"](?:POST|PUT|DELETE)/);
});

test('editing after save verification clears the previous success claim',async()=>{
 const h=harness();h.init();await tick();await h.nodes.verifyControls.handlers.click();assert.match(h.nodes.controlsMessage.textContent,/GitHub 저장을 확인/);h.nodes['interval-live'].value='12';h.nodes['interval-live'].handlers.change();assert.doesNotMatch(h.nodes.controlsMessage.textContent,/GitHub 저장을 확인/);assert.match(h.nodes.controlsMessage.textContent,/초안/);
});
test('a held source that was ON can be turned OFF, but not back ON',async()=>{
 const h=harness(),c=fixture();c.sources.b.enabled=true;h.setStored(c);h.init();await tick();assert.doesNotMatch(h.api.toggleMarkup(h.data.sources[1]),/disabled/);h.nodes.rows.handlers.change({target:{dataset:{controlSource:'b'},checked:false}});assert.equal(JSON.parse(h.nodes.controlsDraft.value).sources.b.enabled,false);assert.match(h.api.toggleMarkup(h.data.sources[1]),/disabled/);h.nodes.rows.handlers.change({target:{dataset:{controlSource:'b'},checked:true}});assert.equal(JSON.parse(h.nodes.controlsDraft.value).sources.b.enabled,false);
});
