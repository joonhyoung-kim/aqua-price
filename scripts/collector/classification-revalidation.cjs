'use strict';
const {productKey}=require('./discovery.cjs');
const {identities}=require('./product-evidence.cjs');
// A review projection only. A title is enough to flag a conflict, never to rewrite a published identity.
function revalidationCandidates(source,snapshot,state={}){
 const rows=new Map();for(const row of [...(snapshot.items||[]),...(state.products||[])])if(row.source_id===source.id&&row.seller_domain===source.sourceDomain){const old=rows.get(row.id),at=Date.parse(row.observed_at_utc),before=Date.parse(old?.observed_at_utc);if(!old||Number.isFinite(at)&&(!Number.isFinite(before)||at>=before))rows.set(row.id,row);}
 const out=[];for(const row of rows.values()){
  if(row.type!=='gear'||!identities(row.title).length||!/생물\s*포장|포장비|배송비|사료\s*(?:증정|무료)/.test(row.title||''))continue;
  out.push({key:productKey(row.product_url),id:row.id,collectorKey:row.collector_key||null,url:row.product_url,title:row.title,previousType:row.type,previousSubtype:row.subtype||null,previousClassificationBasis:row.classification_basis||null,previousObservedAt:row.observed_at_utc||null,status:'fresh_primary_detail_required',reason:'Livestock identity and packaging/free-gift wording coexist; previous gear classification may reflect the ancillary service, not the product',preserveIdentityAndVariants:true,requiresFreshVerification:true,autoPublish:false});
 }
 return out;
}
module.exports={revalidationCandidates};
