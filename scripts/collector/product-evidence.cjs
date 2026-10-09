'use strict';
// Shared identities, not permission to classify navigation or recommendations as a product.
const FISH=/구피|플래티|플라티|플레티|몰리|코리|테트라|메다카|송사리|베타|시클리드|디스커스|엔젤|라스보라|바브|미꾸라지|로치|플레코|플래코|금붕어|금어|비단잉어|잉어과|붕어|난태생|카라신|열대어|관상어|해수어|탕가|탕카|말라위|킬리|아로와나|기수어|복어|다니오|레인보우|오토싱|안시|아피스토|민물고기|철갑상어|메기|가오리|고비|거전|구라미|구루미|스테노포마|폴립테루스|비키르|엔드리케리|콘기쿠스|찬나|스네이크\s*헤드|캣피쉬|캣피시|가아피쉬|다트니오|폐어|토종어|대형어|고대어|피라냐|피라루크|\b(?:fish|goby|gourami|polypterus|channa|pleco|betta)\b/i;
const SUPPLY=/사료|먹이|용품|장식|모형|인조|조화|조명|여과|어항|수조|침대|과립|플레이크|치어용|램프|소켓|약품|치료제|제거제|달팽이제거|소일|바닥재|비료|씨앗|알테미아|브라인|냉동|건조|가위|핀셋|집게|수초툴|영양제|촉진제|은신처|산란상|포장비|배송비|핫팩|스티로폼|빈\s*포트|포트만|\b(?:food|feed|plastic|decoration|fertilizer)\b/i;
const UNSUPPORTED=/파충|양서|곤충|거북|육지|관상용식물|원예|선주문/;
function identities(value){const s=String(value||''),out=[];if(FISH.test(s))out.push('fish');if(/새우|shrimp|CRS|CBS/i.test(s))out.push('shrimp');if(/수초|음성수초|양성수초|활착수초/.test(s))out.push('aquatic_plant');if(/스네일|달팽이|우렁이|snail/i.test(s))out.push('snail');return out;}
function plain(value){return String(value||'').replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/\s+/g,' ').trim();}
function contentEvidence(html,item,names=[]){
 const title=plain(item.title),descriptions=[];let visited=0;
 function walk(v){if(++visited>10000)return;if(Array.isArray(v)){v.forEach(walk);return;}if(!v||typeof v!=='object')return;const types=[].concat(v['@type']||[]);if(types.includes('Product')&&plain(v.name)===title&&typeof v.description==='string')descriptions.push(plain(v.description));for(const [k,x]of Object.entries(v))if(k!=='description')walk(x);}
 for(const m of String(html).matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi)){try{walk(JSON.parse(m[1]));}catch{}}
 if(item.description)descriptions.push(plain(item.description));
 const description=[...new Set(descriptions)].join(' ').slice(0,12000);
 const options=plain([item.variant_title,...(item.variant_attributes||[]).map(v=>typeof v==='string'?v:v.value||v.name||'')].join(' '));
 const specification=plain([title,options,item.quantity_per_pack?`${item.quantity_per_pack}마리`:'' ].join(' '));
 const salesSpecification=/\d+(?:\s*[-~]\s*\d+)?\s*(?:cm|mm|마리|쌍|촉)|한\s*쌍|트리오|분양/i.test(specification);
 const aquaticDescription=/(?:담수|민물|수중|관상|열대어|어종|사육|유영|freshwater|ornamental|live fish)/i.test(description);
 const titleTypes=identities(title),subtypes=titleTypes.length?titleTypes:identities(options+(aquaticDescription?' '+description:''));
 const ownContext=names.some(n=>/생물|관상|열대어|수조크기별/.test(n)||identities(n).length>0&&!SUPPLY.test(n));
 const ambiguousAnimal=(/^(?:생새우|새우|달팽이)(?:\s*\d+마리)?$/.test(title)&&!aquaticDescription)||/달팽이귀신|달귀/.test(title);
 const incompatibleSpec=subtypes.some(t=>['fish','shrimp','snail'].includes(t))&&/\d\s*(?:kg|g|ml|리터|그램)\b/i.test(specification);
 const explicitSupplyDescription=/본\s*(?:상품|제품)은\s*.{0,15}(?:사료|먹이|용품)(?:입니다|\s*상품|\s*제품)|fish\s+food|artificial\s+plant/i.test(description);
 const conflicts=SUPPLY.test(title+' '+options)||/플라스틱|포트\s*(?:화분|키트)|SUDO|수도\s*수초포트/i.test(title)||incompatibleSpec||explicitSupplyDescription;
 return {title,description,options,salesSpecification,aquaticDescription,ownContext,subtypes,conflicts,
  sufficient:!conflicts&&!ambiguousAnimal&&subtypes.length===1&&(ownContext||(salesSpecification&&aquaticDescription)),
  basis:'Primary product title, own breadcrumb and description/options/sales specification; category is a discovery hint'};
}
module.exports={FISH,SUPPLY,UNSUPPORTED,identities,contentEvidence};
