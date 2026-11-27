'use strict';const {productKey}=require('./discovery.cjs');const {isDeferred}=require('./refresh-deferrals.cjs');
function refreshScope(source,previous={},mode='all',daily=false,options={}){
 const rows=new Map();for(const p of source.products||[])rows.set(productKey(p.url),p);
 const groups=new Map();for(const p of previous.products||[]){if(p.source_id!==source.id||!['live','gear'].includes(p.type))continue;const key=productKey(p.product_url);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(p);}
 for(const [key,variants]of groups){const p=variants.find(x=>x.type===mode)||variants[0],configured=rows.get(key)||{};rows.set(key,{...configured,url:configured.url||p.product_url,type:p.type,subtype:p.subtype,classificationBasis:p.classification_basis||'Previously verified source product',existingId:variants.length===1?p.id:undefined});}
 const held=new Set((source.reviewHoldProducts||[]).map(p=>productKey(p.url)));
 const eligible=[...rows.values()].filter(p=>!held.has(productKey(p.url))).filter(p=>mode==='live'?p.type==='live':mode==='gear'?p.type==='gear':true),limit=Number.isSafeInteger(options.limit)?Math.max(0,options.limit):(daily?10:15),start=(previous.priceRefreshCursor?.[mode]||0)%Math.max(eligible.length,1),products=[];
 const now=options.now??Date.now(),available=eligible.filter(p=>!isDeferred(previous,p.url,now));
 const total=Math.min(limit,available.length),reserve=options.prioritizeOldest===true?Math.floor(total/3):0,rotationCount=total-reserve,rotationOffsets=[];
 // Keep the cursor on the stable base list, even when a hold appears or expires.
 // Each offset records how far the completed rotation has actually scanned.
 let scanned=0;while(products.length<rotationCount&&scanned<eligible.length){const p=eligible[(start+scanned)%eligible.length];scanned++;if(isDeferred(previous,p.url,now))continue;products.push(p);rotationOffsets.push(scanned);}
 const selected=new Set(products.map(p=>productKey(p.url)));
 const oldest=p=>{const variants=groups.get(productKey(p.url))||[];const stamps=variants.map(v=>Date.parse(v.observed_at_utc)).filter(Number.isFinite);return stamps.length?Math.min(...stamps):0;};
 for(const p of available.filter(p=>!selected.has(productKey(p.url))).map((p,i)=>({p,i,at:oldest(p)})).sort((a,b)=>a.at-b.at||a.i-b.i).slice(0,reserve))products.push(p.p);
 return {products,start,rotationCount,rotationOffsets,eligibleCount:eligible.length,cursor:{...previous.priceRefreshCursor,[mode]:(start+scanned)%Math.max(eligible.length,1)},summary:{reviewHeldProductCount:held.size,deferredProductCount:eligible.length-available.length,verifiedUrlCount:eligible.length,selectedUrlCount:products.length,productBudget:limit,oldestPriorityCount:reserve,rotationCount,priorityBasis:reserve?'oldest verified observation; remaining budget keeps round-robin fairness':'round_robin',allVerifiedUrlsSelected:eligible.length===products.length,fullRetailerCatalogCoverage:false}};
}
function refreshCursorAfter(scope,mode,completedCount){const completed=Math.max(0,Math.min(scope.rotationCount??scope.products.length,Math.trunc(Number(completedCount)||0))),offset=completed?(scope.rotationOffsets?.[completed-1]??completed):0;return {...scope.cursor,[mode]:(scope.start+offset)%Math.max(1,scope.eligibleCount)};}
module.exports={refreshScope,refreshCursorAfter};
