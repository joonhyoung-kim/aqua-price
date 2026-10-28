'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync('dist/enhancements.js','utf8');
function panelHarness(){
 const nodes=new Map();const el=id=>nodes.get(id)||nodes.set(id,{id,open:false,textContent:'',attrs:{},append(){},setAttribute(k,v){this.attrs[k]=v;},focus(){},showModal(){this.open=true;}}).get(id);
 const history={pushes:0,backs:0,pushState(){this.pushes++;},back(){this.backs++;}};
 const ctx={$:el,filters:{type:'gear',query:'외부여과기',sort:'high'},draftQuery:'미제출 검색어',scrollY:875,history,location:{href:'http://test/'},document:{activeElement:{id:'trigger'},body:{classList:{add(){}}}},ux5PanelEditing:false,ux5PanelState:null};
 vm.createContext(ctx);vm.runInContext(source.slice(source.indexOf('function openUX5Panel('),source.indexOf("if($('#ux5Dialog')){")),ctx);return {ctx,history,el};
}
test('filter panel snapshots committed query, unsubmitted draft, focus and scroll only once',()=>{const {ctx,history,el}=panelHarness();ctx.openUX5Panel('filters');assert.equal(history.pushes,1);assert.equal(ctx.ux5PanelEditing,true);assert.equal(ctx.ux5PanelState.draft,'미제출 검색어');assert.equal(ctx.ux5PanelState.y,875);assert.equal(ctx.ux5PanelState.original.sort,'high');assert.equal(el('#ux5Dialog').open,true);ctx.openUX5Panel('favorites');assert.equal(history.pushes,1);});
test('cancel retains original conditions; apply captures draft without mutating original; double close is harmless',()=>{for(const commit of [false,true]){const {ctx,history}=panelHarness();ctx.openUX5Panel('filters');ctx.filters.maxPrice=5000;ctx.finishUX5Panel(commit);assert.equal(history.backs,1);assert.equal(ctx.ux5PanelState.pending.filters.maxPrice,commit?5000:undefined);assert.equal(ctx.ux5PanelState.original.maxPrice,undefined);ctx.finishUX5Panel(commit);assert.equal(history.backs,1);}});
test('favorite panel uses same reversible navigation without changing library records',()=>{const {ctx,el}=panelHarness();ctx.openUX5Panel('favorites');assert.equal(el('#ux5PanelFooter').hidden,true);assert.equal(el('#ux5PanelTitle').textContent,'관심상품');assert.equal(ctx.ux5PanelState.kind,'favorites');ctx.finishUX5Panel(false);assert.equal(ctx.ux5PanelState.pending.filters.query,'외부여과기');});
