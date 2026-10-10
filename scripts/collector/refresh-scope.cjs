'use strict';const {productKey}=require('./discovery.cjs');
function refreshScope(source,previous={},mode='all',daily=false,options={}){
 const rows=new Map();for(const p of source.products||[])rows.set(productKey(p.url),p);
 const groups=new Map();for(const p of previous.products||[]){if(p.source_id!==source.id||!['live','gear'].includes(p.type))continue;const key=productKey(p.product_url);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(p);}
 for(const [key,variants]of groups){const p=variants.find(x=>x.type===mode)||variants[0],configured=rows.get(key)||{};rows.set(key,{...configured,url:configured.url||p.product_url,type:p.type,subtype:p.subtype,classificationBasis:p.classification_basis||'Previously verified source product',existingId:variants.length===1?p.id:undefined});}
 const held=new Set((source.reviewHoldProducts||[]).map(p=>productKey(p.url)));
 const eligible=[...rows.values()].filter(p=>!held.has(productKey(p.url))).filter(p=>mode==='live'?p.type==='live':mode==='gear'?p.type==='gear':true),limit=Number.isSafeInteger(options.limit)?Math.max(0,options.limit):(daily?10:15),start=(previous.priceRefreshCursor?.[mode]||0)%Math.max(eligible.length,1),products=[];
 for(let i=0;i<Math.min(limit,eligible.length);i++)products.push(eligible[(start+i)%eligible.length]);return {products,start,eligibleCount:eligible.length,cursor:{...previous.priceRefreshCursor,[mode]:(start+products.length)%Math.max(eligible.length,1)},summary:{reviewHeldProductCount:held.size,verifiedUrlCount:eligible.length,selectedUrlCount:products.length,productBudget:limit,allVerifiedUrlsSelected:eligible.length===products.length,fullRetailerCatalogCoverage:false}};
}
function refreshCursorAfter(scope,mode,completedCount){return {...scope.cursor,[mode]:(scope.start+Math.max(0,Math.min(scope.products.length,Number(completedCount)||0)))%Math.max(1,scope.eligibleCount)};}
module.exports={refreshScope,refreshCursorAfter};
