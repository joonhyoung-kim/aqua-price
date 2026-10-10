'use strict';
const {buildCatalog}=require('../build-catalog.cjs');
const {productKey,categoryKey}=require('./discovery.cjs');
function enrichCategoryEvidence(items,states){
 for(const item of items){const state=states[item.source_id];if(!['live','gear'].includes(item.type)||!state?.categoryTree?.nodes)continue;
  let key;try{key=productKey(item.product_url);}catch{continue;}
  const evidence=state.categoryTree.nodes.filter(n=>[item.type,'mixed'].includes(n.scope)&&typeof n.label==='string'&&n.label.trim()&&n.evidencePage&&[state.dailyDiscovery,state.gearDailyDiscovery].some(lane=>lane?.cursor?.categories?.[n.key]?.seenKeys?.includes(key))).filter(n=>{try{return new URL(n.url).hostname.replace(/^www\./,'')===item.seller_domain.replace(/^www\./,'')&&new URL(n.evidencePage).hostname.replace(/^www\./,'')===item.seller_domain.replace(/^www\./,'');}catch{return false;}}).map(n=>({label:n.label,ancestorLabels:n.ancestorLabels||[],url:n.url,evidencePage:n.evidencePage,observedAt:n.evidenceObservedAt||null}));
  if(evidence.length)item.observed_category_evidence=evidence;
 }
 return items;
}
function applyUpdates(snapshot, states, mode='all'){
 const next=structuredClone(snapshot);if(next.photo_validation && !next.photo_validation.verified_item_ids)next.photo_validation.verified_item_ids=next.items.filter(p=>!p.source_kind&&p.photo?.verified_https_url).map(p=>p.id);const rows=new Map(next.items.map(p=>[p.id,p])),publishedGearByCollector=new Map(next.items.filter(p=>p.type==='gear'&&p.collector_key).map(p=>[p.collector_key,p]));let changes=0;
 for(const state of Object.values(states)){
   if(!['success','partial_failure','budget_limited'].includes(state.status)||state.cacheOnly)continue;
   for(const update of state.products){
     if(!update.collector_key || !update.observed_at_utc || !['live','gear'].includes(update.type) || !state.updatedKeys?.includes(update.collector_key))continue;
     const old=rows.get(update.id),replaced=rows.get(update.replaces_snapshot_id);
     // An unpublished local correction can survive a crash without its receipt.
     // A price refresh must not promote it through all/reconcile/live, nor through
     // a new ID or replacement marker. Check before any deletion or field merge.
     const origins=[...new Map([old,replaced,publishedGearByCollector.get(update.collector_key)].filter(p=>p?.type==='gear').map(p=>[p.id,p])).values()];
     const verifiedCorrection=update.type==='live'&&origins.length===1&&require('./revalidate-existing.cjs').canPublishCorrection(origins[0],update,state);
     if(update.type==='live'&&origins.length&&!verifiedCorrection)continue;
     if(mode==='live'&&update.type!=='live'||mode==='gear'&&update.type!=='gear'&&!verifiedCorrection)continue;
     if(update.replaces_snapshot_id && rows.has(update.replaces_snapshot_id)){rows.delete(update.replaces_snapshot_id);changes++;}
     if(old && Date.parse(update.observed_at_utc)<Date.parse(old.observed_at_utc))continue;
     const photo=old && old.photo?.verified_https_url===update.photo?.verified_https_url?old.photo:update.photo;
     const merged={...old,...update,photo};
     if(old?.registered_at && !update.registered_at)merged.registered_at=old.registered_at;
     if(old?.shipping_amount!=null && update.shipping_amount==null)merged.shipping_amount=old.shipping_amount;
     if(JSON.stringify(old)!==JSON.stringify(merged)){rows.set(update.id,merged);changes++;}
   }
   // Production source collector currently emits only known_product_urls, never deletion.
   if(state.deletionAllowed && state.coverage?.kind==='full_catalog' && mode==='reconcile'){
     const ids=new Set(state.products.map(p=>p.id));for(const [id,p]of rows)if(p.source_id===state.sourceId&&!ids.has(id)){rows.delete(id);changes++;}
   }
 }
 next.items=[...rows.values()];next.summary={...next.summary,fish_or_shrimp_count:next.items.filter(p=>["fish","shrimp"].includes(p.subtype)).length,direct_retailer_products:next.items.filter(p=>p.source_kind==="direct_retailer_product_page").length,verified_https_photos:next.items.filter(p=>p.photo?.verified_https_url).length,offer_count:next.items.length,merchant_count:new Set(next.items.map(p=>p.seller_domain)).size,live_plant_count:next.items.filter(p=>p.subtype==='aquatic_plant').length,fish_count:next.items.filter(p=>p.subtype==='fish').length,shrimp_count:next.items.filter(p=>p.subtype==='shrimp').length,snail_count:next.items.filter(p=>p.subtype==='snail').length,gear_count:next.items.filter(p=>p.type==='gear').length};
 next.snapshot_notice_ko='상품정보 확인본입니다. 가격은 항목별 확인 시각 기준이며 실시간 최저가·전체 판매처 비교가 아닙니다. 갱신 실패 시 마지막 확인 정보를 보존합니다. 배송비와 현재 재고는 판매처에서 확인하세요.';
 enrichCategoryEvidence(next.items,states);
 const catalog=buildCatalog(next);return {snapshot:next,catalog,changes};
}
module.exports={applyUpdates,enrichCategoryEvidence};
