'use strict';
// Only visible, explicit product-page evidence. No additional requests or global seller assumptions.
function metadata(html,item,context){
 const clean=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'');
 const text=clean.replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/\s+/g,' ');
 const result={};
 if(item.available===true||item.available===false)result.stock_observed_at_utc=context.observedAt;
 const matches=[...text.matchAll(/배송비\s*([\d,]+)원\s*\(([\d,]+)원\s*이상\s*구매\s*시\s*무료\)/g)];
 const policies=new Set(matches.map(m=>m[1]+':'+m[2]));
 const otherFees=[...text.matchAll(/배송\s*비용\s*:\s*([\d,]+)원/g)].map(m=>Number(m[1].replace(/,/g,'')));
 if(policies.size===1){const m=matches[0],amount=Number(m[1].replace(/,/g,'')),freeThreshold=Number(m[2].replace(/,/g,''));
  if(Number.isSafeInteger(amount)&&Number.isSafeInteger(freeThreshold)&&otherFees.every(n=>n===amount))result.shipping_policy={verified:true,sellerId:item.seller_domain,evidenceUrl:context.url,observedAt:context.observedAt,amount,freeThreshold,chargeUnit:'order',conditionsComplete:false,packaging:null,regionalSurcharge:null,combinedShipping:null,benefitConditions:null,summary:`상품 페이지 기본 배송 ${amount.toLocaleString('ko-KR')}원 · ${freeThreshold.toLocaleString('ko-KR')}원 이상 무료. 지역 추가금·포장비·합배송 조건 미확인.`,sourceScope:'this_product_only'};
 }
 if(/id=["']prdReview["']/.test(clean)){const counts=[...text.matchAll(/(?:상품후기|사용후기)\s*(\d+)/g)].map(m=>Number(m[1])),unique=[...new Set(counts)];result.review_evidence={url:context.url.split('#')[0]+'#prdReview',checkedAt:context.observedAt,count:unique.length===1?unique[0]:null,purchaseVerified:null,rating:null};}
 return result;
}
module.exports={metadata};
