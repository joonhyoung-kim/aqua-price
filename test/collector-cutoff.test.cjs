'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {applyUpdates}=require('../scripts/collector/publish.cjs');
const {scheduleDecision,validateControls,initializeSchedule,markAttempt,markOutcome}=require('../scripts/collector/controls.cjs');
function fixture(){
 const snapshot=require('./isolated-snapshot.cjs')();
 snapshot.snapshot_at_utc='2026-10-26T10:57:36.754Z';
 const old=snapshot.items[0];
 old.stock_observed_at_utc='2026-01-01T00:00:00Z';
 const update={...old,price_amount:1500,observed_at_utc:'2026-10-29T18:38:40.000Z'};
 return {snapshot,update,state:{status:'success',products:[update],updatedKeys:[update.collector_key]}};
}
test('fresh observations after an older snapshot advance only publication cutoff; unchanged products and stock times survive',()=>{
 const {snapshot,update,state}=fixture();
 snapshot.items.push({...snapshot.items[0],id:'unchanged',collector_key:'unchanged'});
 const before=structuredClone(snapshot),now=Date.parse('2026-10-29T18:40:00Z');
 const result=applyUpdates(snapshot,{source:state},'all',{now});
 assert.equal(result.changes,1);assert.equal(result.catalog.asOf,'2026-10-29T18:40:00.000Z');
 assert.equal(result.catalog.products[0].observedAt,update.observed_at_utc);
 assert.equal(result.catalog.products[0].stockObservedAt,'2026-01-01T00:00:00Z');
 assert.deepEqual(result.snapshot.items[1],before.items[1]);assert.deepEqual(snapshot,before);
});
test('failed, cached, unverified and identical updates retain the old publication cutoff and observations',()=>{
 const {snapshot,state}=fixture();
 for(const skipped of [{...state,status:'failed'},{...state,cacheOnly:true},{...state,updatedKeys:[]},{...state,products:[snapshot.items[0]]}]){
  const result=applyUpdates(snapshot,{source:skipped});
  assert.equal(result.changes,0);assert.equal(result.catalog.asOf,snapshot.snapshot_at_utc);
  assert.deepEqual(result.snapshot.items,snapshot.items);
 }
});
test('future price or stock evidence and clock rollback still fail closed',()=>{
 const {snapshot,state,update}=fixture(),now=Date.parse(update.observed_at_utc)-1;
 assert.throws(()=>applyUpdates(snapshot,{source:state},'all',{now}),/cutoff/);
 assert.throws(()=>applyUpdates(snapshot,{source:state},'all',{now:Date.parse('2026-10-25')}),/clock/);
 assert.throws(()=>applyUpdates(snapshot,{source:{...state,products:[{...update,stock_observed_at_utc:'2026-11-01'}]}},'all',{now:Date.parse('2026-10-30')}),/cutoff/);
});
test('combined Korea 09/21 windows tolerate delayed starts and late finishes without duplicating a slot',()=>{
 const controls=validateControls({schemaVersion:1,intervalsHours:{live:12,gear:12,reconcile:24},sources:{}},{sources:[]});
 let now=Date.parse('2026-10-29T00:42:00Z');
 const decision=scheduleDecision(controls,{}, {mode:'all',runTrigger:'schedule',now});
 assert.equal(decision.window.startAt,'2026-10-29T00:00:00.000Z');
 const schedule=initializeSchedule({},controls,'all',decision);
 markAttempt(schedule,'all',{at:new Date(now).toISOString(),automatic:true,revision:controls.revision,runId:'test'});
 markOutcome(schedule,'all','partial_failure','2026-10-29T01:00:00Z');
 const read=at=>scheduleDecision(controls,{schedule},{mode:'all',runTrigger:'schedule',now:Date.parse(at)});
 assert.equal(read('2026-10-29T11:59:59Z').due,false);
 assert.equal(read('2026-10-29T12:00:00Z').due,true);
 assert.equal(read('2026-10-29T00:41:59Z').reason,'clock_rollback');
 assert.equal(scheduleDecision(controls,{schedule},{mode:'all',runTrigger:'workflow_dispatch',now}).reason,'manual_bypass');
 assert.equal(schedule.modes.all.lastAutomatedAttemptAt,'2026-10-29T00:42:00.000Z');
});
