'use strict';
// Prepared server boundary. No scheduler, destination, credentials or outbound transport is configured.
const {advanceWatch,watchObservation}=require('../dist/data-model.js');
function prepareEvents(catalog,watches,now=Date.now()){return watches.map(w=>advanceWatch(w,watchObservation(catalog,w.id,now)));}
const allowed={received:['reviewing','rejected'],reviewing:['verified','rejected'],verified:['resolved'],rejected:[],resolved:[]};
function transitionReport(report,next,evidence){if(!allowed[report.status]?.includes(next))throw Error('Invalid report transition');if(['verified','resolved'].includes(next)&&(!evidence?.reviewer||!/^https:\/\//.test(evidence.sourceUrl||'')||!Number.isFinite(Date.parse(evidence.checkedAt))))throw Error('Human review and source evidence required');return {...report,status:next,evidence:evidence||null};}
module.exports={prepareEvents,transitionReport,deliveryConfigured:false,reportStorageConfigured:false};
