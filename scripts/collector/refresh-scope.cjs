'use strict';const {productKey}=require('./discovery.cjs');
function refreshScope(source,previous={},mode='all',daily=false){
 const rows=new Map();for(const p of source.products||[])rows.set(productKey(p.url),p);
 for(const p of previous.products||[]){if(!p.source_id||p.source_id!==source.id||!['live','gear'].includes(p.type))continue;const key=productKey(p.product_url);if(!rows.has(key))rows.set(key,{url:p.product_url,type:p.type,subtype:p.subtype,classificationBasis:p.classification_basis||'Previously verified source product',existingId:p.id});}
 const eligible=[...rows.values()].filter(p=>mode==='live'?p.type==='live':mode==='gear'?p.type==='gear':true),limit=daily?10:15,start=(previous.priceRefreshCursor?.[mode]||0)%Math.max(eligible.length,1),products=[];
 for(let i=0;i<Math.min(limit,eligible.length);i++)products.push(eligible[(start+i)%eligible.length]);return {products,cursor:{...previous.priceRefreshCursor,[mode]:(start+products.length)%Math.max(eligible.length,1)},summary:{verifiedUrlCount:eligible.length,selectedUrlCount:products.length,productBudget:limit,allVerifiedUrlsSelected:eligible.length===products.length,fullRetailerCatalogCoverage:false}};
}
module.exports={refreshScope};
