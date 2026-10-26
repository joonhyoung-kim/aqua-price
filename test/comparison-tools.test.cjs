'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),M=require('../dist/data-model.js'),data=require('../dist/catalog.json');
const template=data.products.find(p=>p.type==='live'&&p.subtype==='fish');
const product=(name,extra={})=>({...structuredClone(template),name,originalTitle:name,spec:'미확인',quantityPerPack:null,pairsPerPack:null,variantId:null,price:{amount:5000,currency:'KRW'},...extra});
test('reviewed aliases, punctuation and model identities remain distinct',()=>{
 const q=M.createCatalogQuery(data),select=query=>q.select({...M.defaultFilters,type:'gear',query}).rows.map(p=>p.id);
 assert.deepEqual(select('섭스프로'),select('섭스트라트 프로'));assert.deepEqual(select('EHEIM SUBSTRAT-PRO'),select('에하임 섭스프로'));assert.equal(select('섭스프로').length,4);
 assert.equal(M.canonical('ABC-2213'),M.canonical('ABC 2213'));assert.notEqual(M.canonical('2213'),M.canonical('2215'));assert.notEqual(M.canonical('섭스프로'),M.canonical('섭스 플러스'));
 assert.deepEqual(q.select({...M.defaultFilters,query:'네온테트라'}).rows.map(p=>p.id),q.select({...M.defaultFilters,query:'네온 테트라'}).rows.map(p=>p.id));
 assert(q.suggest('섭스','gear').some(x=>/섭스/.test(x)));assert(q.suggest('네온','live').length<=8);
});
test('explicit option wins over base count; ambiguous bundles never create quantities',()=>{
 const p=product('체리바브 10마리 1마리',{variantId:'option-1',quantityPerPack:1,spec:'수량: 1마리'}),f=M.purchaseFacts(p);
 assert.equal(f.count,1);assert.equal(f.baseName,'체리바브');assert.match(f.reason,/옵션/);assert.equal(M.unitPrice(p).amount,5000);
 assert.equal(M.purchaseFacts(product('체리바브 10마리',{quantityPerPack:1})).count,null);
 for(const title of ['체리바브 1+1','체리바브 1마리 사은품','체리바브 1마리 / 10마리','체리바브 최소 10마리','체리바브 1~10마리'])assert.equal(M.purchaseFacts(product(title)).count,null,title);
 assert.equal(M.purchaseFacts(product('네온 테트라 10마리')).count,10);assert.equal(M.purchaseFacts(product('네온 테트라 2cm')).count,null);
});
test('unit sort is restricted to a chosen compatible purpose and unit',()=>{
 const d=structuredClone(data);d.products=[product('네온테트라 1마리',{id:'one',price:{currency:'KRW',amount:600}}),product('네온테트라 10마리',{id:'ten'}),product('체리바브 1마리',{id:'barb',price:{currency:'KRW',amount:100}})];
 const scope=M.comparisonUnit(d.products[0]).scope;
 assert.deepEqual(M.selectProducts(d,{...M.defaultFilters,sort:'unit',unitScope:scope}).rows.map(p=>p.id),['ten','one']);assert.equal(M.selectProducts(d,{...M.defaultFilters,sort:'unit'}).rows.length,0);
 const gear=data.products.find(p=>/섭스프로 \[1L\]/.test(p.name)),a={...gear,name:'에하임 섭스프로 500mL',originalTitle:'에하임 섭스프로 500mL'},b={...gear,name:'에하임 섭스프로 0.5L',originalTitle:'에하임 섭스프로 0.5L'};
 assert.equal(M.comparisonUnit(a).amount,M.comparisonUnit(b).amount);assert.equal(M.comparisonUnit(a).unit,'L');
 const salt={...gear,name:'해수염 1kg',originalTitle:'해수염 1kg'};assert.equal(M.comparisonUnit(salt)?.unit,'100g');assert.equal(M.comparisonUnit({...gear,name:'외부여과기 20L 수조용',originalTitle:'외부여과기 20L 수조용'}),null);
});
test('cross-seller comparison requires exact spec and composition, never just an alias',()=>{
 const groups=M.compareSellers(data.products),g=groups.find(g=>g.label.includes('섭스트라트'));assert(g);assert.equal(g.offers.length,2);assert.deepEqual(g.offers.map(p=>p.price.amount),[93000,128000]);
 const p=g.offers[0];for(const extra of [' 플러스',' plus',' 세트',' 2213 본체',' 교체 부품',' + 1L'])assert.equal(M.exactIdentity({...p,name:p.name+extra}),null,extra);
 assert.notEqual(M.exactIdentity(p).key,M.exactIdentity({...p,name:'에하임 섭스프로 1L',originalTitle:'에하임 섭스프로 1L'}).key);
 assert.equal(M.exactIdentity(product('네온 테트라 10마리')),null,'size/sex/grade absent');
 const identity={verified:true,evidenceUrl:p.sourceUrl,brand:'Eheim',model:'2213',specification:'220V',contents:'body only'};
 const a={...p,name:'외부여과기',comparisonIdentity:identity},b={...a,id:'other',sellerId:'second',comparisonIdentity:{...identity}};
 assert.equal(M.compareSellers([a,b]).length,1,'general structured identity is independent of Substrat family');
 for(const change of [{model:'2215'},{model:'2213 Pro Plus'},{contents:'media included set'},{contents:'replacement impeller'},{specification:''}])assert.equal(M.compareSellers([a,{...b,comparisonIdentity:{...identity,...change}}]).length,0);
 const fishIdentity={verified:true,evidenceUrl:p.sourceUrl,species:'neon tetra',size:'2cm',sex:'unsexed mixed confirmed',grade:'standard',quantity:'10 fish'};
 const x=product('네온 테트라',{comparisonIdentity:fishIdentity}),y={...x,id:'fish-second',sellerId:'second'};
 assert.equal(M.compareSellers([x,y]).length,1);assert.equal(M.compareSellers([x,{...y,comparisonIdentity:{...fishIdentity,size:'3cm'}}]).length,0);
});
test('desired quantity rounds packs, separates uncertain shipping, minimum and per-box fees',()=>{
 const p=product('네온테트라 10마리'),e=M.estimatePurchase(p,12);assert.equal(e.packs,2);assert.equal(e.actual,20);assert.equal(e.subtotal,10000);assert.equal(e.total,null);
 const now=Date.now(),policy={verified:true,sellerId:p.sellerId,evidenceUrl:p.sourceUrl,observedAt:new Date(now).toISOString(),conditionsComplete:true,minimumOrderPacks:1,amount:3000,freeThreshold:10000,chargeUnit:'order',packaging:{amount:500,unit:'order'}};
 assert.equal(M.estimatePurchase(p,12,policy,now).total,10500);assert.equal(M.estimatePurchase(p,10,policy,now).total,8500);
 assert.equal(M.estimatePurchase(p,21,{...policy,packaging:{amount:1000,unit:'box',packsPerBox:2}},now).packaging,2000);
 assert.equal(M.estimatePurchase({...p,minimumOrderPacks:3},1,policy,now).actual,30);
 for(const change of [{sellerId:'other'},{observedAt:new Date(now-8*86400000).toISOString()},{conditionsComplete:false},{packaging:null},{packaging:{amount:500,unit:'box'}}])assert.equal(M.estimatePurchase(p,12,{...policy,...change},now).total,null);
 for(const wanted of [0,-1,1.5,100001,NaN])assert.equal(M.estimatePurchase(p,wanted).total,null);
 assert.equal(M.estimatePurchase(product('수량 미확인'),12).subtotal,undefined);
 assert.equal(M.estimatePurchase(p,12,{...policy,minimumOrderPacks:undefined},now).total,null);
});
test('local storage is bounded and tolerates denial, malformed JSON and quota; missing favorites stay tracked',()=>{
 for(const storage of [null,{getItem(){throw Error('blocked');}}, {getItem(){return '{broken';},setItem(){throw Error('quota');}}]){const lib=M.createLocalLibrary(storage);lib.search('네온');lib.favorite(template);lib.saveCondition('네온','?query=네온');assert.equal(lib.read().favorites.length,1);assert.equal(lib.read().recent[0],'네온');assert.equal(lib.persistent(),false);}
 let raw;const storage={getItem(){return raw;},setItem(_k,v){raw=v;}};let lib=M.createLocalLibrary(storage);lib.favorite(template);lib.search('test');lib=M.createLocalLibrary(storage);assert.equal(lib.read().favorites[0].id,template.id);assert.equal(lib.read().recent[0],'test');lib.favorite(template);assert.equal(lib.read().favorites.length,0);
 for(let i=0;i<20;i++)lib.search('q'+i);assert.equal(lib.read().recent.length,10);
});
test('extended URL conditions round trip and reject invalid quantity',()=>{const f={...M.defaultFilters,sort:'unit',unitScope:'live:tetra:마리',wantedQty:12,compareAcross:true};assert.deepEqual(M.filtersFromSearch(M.filtersToSearch(f)),f);assert.equal(M.filtersFromSearch('?wantedQty=-1').wantedQty,null);assert.throws(()=>M.selectProducts(data,{...f,wantedQty:1.5}));});
test('oldest priority keeps the request budget and a resumable fair rotation',()=>{
 const {refreshScope,refreshCursorAfter}=require('../scripts/collector/refresh-scope.cjs');
 const source={id:'fixture',products:Array.from({length:9},(_,i)=>({url:'https://example.com/product/'+i,type:'live'}))};
 const prev={priceRefreshCursor:{live:0},products:source.products.map((p,i)=>({source_id:'fixture',type:'live',product_url:p.url,observed_at_utc:new Date(Date.UTC(2026,9,20-i)).toISOString()}))};
 const seen=new Set();for(let i=0;i<5;i++){const scope=refreshScope(source,prev,'live',true,{limit:3,prioritizeOldest:true});assert.equal(scope.products.length,3);assert.equal(scope.summary.oldestPriorityCount,1);scope.products.forEach(p=>seen.add(p.url));assert.equal(new Set(scope.products.map(p=>p.url)).size,3);assert.equal(refreshCursorAfter(scope,'live',1).live,(scope.start+1)%9);prev.priceRefreshCursor=scope.cursor;}
 assert.equal(seen.size,9);const a=refreshScope(source,{},'live',true,{limit:2,prioritizeOldest:true});assert.equal(a.summary.oldestPriorityCount,0);
});
