'use strict';
const {test}=require('node:test'),a=require('node:assert/strict'),M=require('../dist/data-model.js'),fixture=require('./fixtures/ux2-catalog.json'),{metadata}=require('../scripts/collector/product-metadata.cjs');
const base=fixture.products.find(p=>p.type==='live'&&p.subtype==='fish'),p=(name,x={})=>({...structuredClone(base),name,originalTitle:name,spec:'미확인',variantId:null,quantityPerPack:null,pairsPerPack:null,price:{amount:5000,currency:'KRW'},...x});
test('head seals, hoses, bodies and media sets keep different roles and relevance',()=>{
 const body=p('에하임 외부여과기 2213',{type:'gear'}),ring=p('에하임 외부여과기 헤드고무링 [2213용/7273118]',{type:'gear'}),hose=p('외부여과기 호스 12/16mm',{type:'gear'}),set=p('에하임 외부여과기 2213 + 섭스프로2L 세트',{type:'gear'});
 a.equal(M.gearGroup(ring),'filter_parts');a.equal(M.productRole(ring).key,'part');a.equal(M.productRole(body).key,'body');a.equal(M.productRole(set).key,'set');a(M.relevance(body,'외부여과기')>M.relevance(ring,'외부여과기'));a(M.relevance(hose,'외부여과기 호스')>M.relevance(body,'외부여과기 호스'));
 a.equal(M.productRole(p('칸후 20큐브 매트 6T - 수조용 EVA 매트',{type:'gear'})).key,'part');
 a.equal(M.productRole(p('외부여과기',{type:'gear',observedCategoryLabels:[]})).key,'unknown');
 a.equal(M.exactIdentity(set),null);a.notEqual(M.canonical('2213'),M.canonical('2215'));a.notEqual(M.canonical('프로'),M.canonical('프로플러스'));
});
test('unit scope resolves on query/type/category/URL/saved restore and inactive sort clears scope',()=>{
 const d=structuredClone(fixture);d.products=[p('네온테트라 1마리',{id:'neon'}),p('체리새우 10마리',{id:'shrimp',subtype:'shrimp'})];const q=M.createCatalogQuery(d);
 const old={...M.defaultFilters,query:'네온테트라',sort:'unit',unitScope:'live:tetra:마리'};
 for(const next of [{...old,query:'체리새우'},{...old,query:'체리새우',subtype:'shrimp'},M.filtersFromSearch(M.filtersToSearch({...old,query:'체리새우'}))]){const r=q.view(next).result;a.equal(r.rows.length,1);a.equal(r.effectiveFilters.unitScope,'live:shrimp_red:마리');a.equal(r.unitState.needsSelection,false);}
 a.equal(q.select({...old,sort:'low'}).effectiveFilters.unitScope,'');a.equal(q.select({...old,type:'gear'}).unitState.noComparable,true);
 const r=q.select({...old,query:'',unitScope:''});a.equal(r.unitState.needsSelection,true);a.match(r.reason,/선택/);
});
test('native packaging display keeps 22g and unit arithmetic precise',()=>{const g=p('히카리 팬시구피 사료 22g',{type:'gear'});a.equal(M.purchaseFacts(g).option,'22g');a.equal(M.comparisonUnit(g).amount,5000/22*100);});
test('sourced care needs verified scientific identity; European specs stay reference only',()=>{
 const n=p('네온테트라');a.equal(M.careProfile(n),null);a.equal(M.careProfile({...n,careIdentity:{verified:true,species:'Paracheirodon innesi',evidenceUrl:n.sourceUrl,checkedAt:n.observedAt}}).adultCm,3);
 const b=p('에하임 2213 외부여과기',{type:'gear'}),e=M.equipmentFacts(b);a.equal(e.reference.frequencyHz,50);a.equal(e.flowLph,undefined);a.equal(M.equipmentFacts(p('에하임 2213 헤드고무링',{type:'gear'})).reference,undefined);
 a.equal(M.matchesGuidance(n,{careTemp:24,includeUnknownGuidance:false}),false);a.equal(M.matchesGuidance(n,{careTemp:24,includeUnknownGuidance:true}),true);
});
test('shipping parser refuses conflicts and never fills unknown costs; free boundary exact',()=>{
 const item={seller_domain:'sangaqua.co.kr',available:true},context={observedAt:new Date().toISOString(),url:'https://sangaqua.co.kr/product/x/1/'};
 const html='<p>배송비 3,000원 (50,000원 이상 구매 시 무료)</p><p>배송 비용 : 3,000원</p><div id="prdReview">상품후기 21</div>';
 const m=metadata(html,item,context);a.equal(m.shipping_policy.conditionsComplete,false);a.equal(m.review_evidence.count,21);a.equal(m.stock_observed_at_utc,context.observedAt);
 const product=p('장비',{sellerId:item.seller_domain,shippingPolicy:m.shipping_policy});a.equal(M.knownShipping(product,49999).shipping,3000);a.equal(M.knownShipping(product,50000).shipping,0);a.equal(M.knownShipping(product,50000).complete,false);
 a.equal(metadata(html+'배송 비용 : 5,000원',item,context).shipping_policy,undefined);a.equal(metadata('<p>배송비 문의</p>',{available:null},context).stock_observed_at_utc,undefined);a.equal(M.knownShipping({...product,sellerId:'other'},50000),null);
});
test('observations require exact identity, fresh explicit stock and monotonic timestamps; no duplicates',()=>{
 const old='2026-10-25T00:00:00Z',now='2026-10-26T00:00:00Z',w={id:'a',enabled:true,restock:true,targetPrice:1000,last:{stock:false,stockAt:old,price:2000,priceAt:old}};
 const o={id:'a',stock:true,stockAt:now,price:900,priceAt:now},r=M.advanceWatch(w,o);a.equal(r.events.length,2);a.equal(M.advanceWatch(r.watch,o).events.length,0);a.equal(M.advanceWatch(w,{...o,id:'b'}).events.length,0);a.equal(M.advanceWatch(w,{id:'a',stock:null,price:null}).events.length,0);a.equal(M.advanceWatch(w,{...o,stockAt:old,priceAt:old}).events.length,0);
 const d=structuredClone(fixture);d.products=[p('魚',{id:'a',available:true,stockObservedAt:null})];a.equal(M.watchObservation(d,'a').stock,null);
});
test('local reports remain unsubmitted, corrupt or blocked stores do not break search; human verification required',()=>{
 const store=M.createWatchStore({getItem(){throw Error('blocked');},setItem(){throw Error('quota');}});store.report(p('魚'),'price');a.equal(store.read().reports[0].status,'draft');a.equal(JSON.parse(store.exportReports()).delivery,'not_submitted');a.equal(store.persistent(),false);
 const J=require('../scripts/observation-jobs.cjs');a.equal(J.deliveryConfigured,false);a.throws(()=>J.transitionReport({status:'reviewing'},'verified',{}));a.equal(J.transitionReport({status:'received'},'reviewing').status,'reviewing');
});
