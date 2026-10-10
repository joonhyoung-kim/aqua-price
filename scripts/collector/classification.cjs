'use strict';
const {scanHtml,categoryKey}=require('./discovery.cjs');
const {contentEvidence,identities,primaryIdentityText,SUPPLY,UNSUPPORTED}=require('./product-evidence.cjs');
const {validatedPrimaryProductEvidence}=require('./product-jsonld.cjs');
function breadcrumbs(html){
 const lists=[];let nodes=0;function walk(v){if(++nodes>10000)return;if(Array.isArray(v))return v.forEach(walk);if(!v||typeof v!=='object')return;if(/BreadcrumbList$/.test(String(v['@type']||'')))lists.push(v.itemListElement||[]);for(const [key,value]of Object.entries(v))if(key!=='itemListElement')walk(value);}
 for(const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi)){try{walk(JSON.parse(m[1]));}catch{}}
 const nodesInList=lists.flat().map(e=>({source:'structured_breadcrumb',name:e.name||e.item?.name||'',url:typeof e.item==='string'?e.item:e.item?.['@id']||e.item?.url||''}));
 // Only a product breadcrumb container, never the site's complete navigation menu.
 const container=html.match(/<(?:div|section)\b[^>]*class\s*=\s*["'][^"']*(?:xans-product-headcategory|ec-base-path|breadcrumb)[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|section)>/i)?.[1];
 if(container)for(const a of scanHtml(container).links)nodesInList.push({source:'product_container',name:a.text.replace(/\s+/g,' ').trim(),url:a.href});return nodesInList;
}
function ownBreadcrumbs(html,productUrl){
 return breadcrumbs(html).filter(crumb=>{if(!crumb.url)return crumb.source==='product_container';try{const url=new URL(crumb.url,productUrl),product=new URL(productUrl);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password&&url.hostname.replace(/^www\./,'')===product.hostname.replace(/^www\./,'')&&url.port===product.port;}catch{return false;}});
}
function classifyProduct(html,item,candidate,seed){
 if(/포장비|배송비|핫팩|아이스팩|스티로폼|생물\s*포장/.test(item.title||'')&&!identities(item.title).length)return {status:'classified',type:'gear',subtype:null,basis:'Explicit packaging/shipping supply identity overrides livestock navigation'};
 if(/물벼룩|실지렁이|장구벌레|밀웜|냉동\s*(?:짱구|장구)|브라인\s*쉬림프|알테미아/.test(item.title||''))return {status:'classified',type:'gear',subtype:null,basis:'Explicit live/frozen feed identity is not ornamental livestock'};
 const rawTitle=item.title||'',crumbs=ownBreadcrumbs(html,candidate.url);if(item.seller_domain==='wpet.co.kr'){const primary=html.match(/<div\b[^>]*class=["'][^"']*\bsub_page_navi\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1],text=require('./product-jsonld.cjs').visibleText(primary||'');for(const name of text.split('>').map(x=>x.trim()).filter(x=>['열대어','새우','수초'].includes(x)))crumbs.push({name,url:''});}const names=crumbs.map(c=>c.name).filter(n=>n&&n!==rawTitle);
 const rawEvidence=contentEvidence(html,item,names),primary=validatedPrimaryProductEvidence(html,item,candidate.url);
 // The exception needs a fresh, exact parser record AND an own-product fish
 // breadcrumb. Generic paid titles, navigation, and stored metadata cannot use it.
 const parentTypes=primary?identities(primary.parent_name):[],useParent=primary&&parentTypes.length===1&&parentTypes[0]==='fish'&&!SUPPLY.test(primaryIdentityText(primary.parent_name))&&!UNSUPPORTED.test(primary.parent_name)&&names.some(name=>identities(name).includes('fish')&&!SUPPLY.test(name));
 const title=useParent?primary.parent_name:rawTitle,identityTitle=primaryIdentityText(title);
 const evidence=useParent?{...contentEvidence(html,{...item,title,variant_title:null,variant_attributes:[],description:[rawEvidence.description,primary.parent_description,primary.variant_description].filter(Boolean).join(' ')},names),rawVariantTitle:rawTitle,primary_product_evidence:primary,basis:'Visible ProductGroup fish identity and exact packaging-only variant membership corroborated by the own-product fish breadcrumb'}:rawEvidence;
 const categoryScope=require('./category-tree.cjs'),ownSupplyBreadcrumb=names.some(name=>categoryScope.scope(name).scope==='gear'),explicitSupplyTitle=categoryScope.supplies.test(identityTitle)||/석상|장식품|피규어|필터/.test(identityTitle);
 if(ownSupplyBreadcrumb&&explicitSupplyTitle&&!/포장비|배송비|생물\s*포장/.test(identityTitle))return {status:'classified',type:'gear',subtype:null,basis:'Explicit primary supply identity corroborated by the verified own-product supply breadcrumb',evidence};
 if(/가재|크랩|crayfish|\bcrab\b/i.test(title)&&!/가재귀신/.test(title))return {status:'excluded_scope',reason:'Primary crayfish/crab identity is outside fish, ornamental shrimp, aquatic plant and aquatic snail scope',evidence};
 if(/육상|육지달팽이|관엽|공기정화|테라리움|파충류|양서류|도마뱀|게코|거북|햄스터|토끼|앵무/.test(title)||!evidence.subtypes.length&&/^(파충류|양서류|거북|육지식물)$/.test(names.at(-1)||''))return {status:'excluded_scope',reason:'Primary product identity is terrestrial, reptile, amphibian or horticultural',evidence};
 const feedPath=names.some(n=>/^(?:사료(?:[/·].*)?|먹이|생먹이|냉동사료|동결건조사료|사료\/용품)$/.test(n.trim()));
 if(feedPath)return {status:'classified',type:'gear',subtype:null,basis:'Verified product breadcrumb explicitly places this product under feed/supplies; live-food animals are not ornamental livestock'};
 const supplyPath=names.length&&require('./category-tree.cjs').scope(names.at(-1),names.slice(0,-1)).scope==='gear';
 if(supplyPath)return {status:'classified',type:'gear',subtype:null,basis:'Verified primary product breadcrumb has aquarium supply ancestry',evidence};
 const conflict=evidence.conflicts||/침대|제거제|모형|치료제|약품|사료|생먹이|냉동|동결건조|건조먹이|인조|조화|모형|플라스틱수초|제거제|약품|비료|수초용품|수초용\s*(?:가위|핀셋)|빈\s*포트|포트만|유목|씨앗/.test(identityTitle);
 if(evidence.sufficient)return {status:'classified',type:'live',subtype:evidence.subtypes[0],basis:evidence.basis,evidence};
 let type=null,subtype=null,basis=null;
 for(const crumb of crumbs){let url;try{url=new URL(crumb.url,candidate.url).href;}catch{continue;}const key=categoryKey(url);const matching=seed.categories.find(c=>!c.excluded&&!c.mixedCategories&&c.type&&categoryKey(c.url)===key);if(matching){type=matching.type;subtype=matching.subtype;basis='Verified product breadcrumb matches a reviewed retailer category';}}
 if(!type){const leaf=names.at(-1)||'';if(/^(베타|몰리|플래티|플레티|구피|코리도라스|테트라|열대어|관상어|메다카|메다카 분양|구피|카라신과|라스보라|새끼낳는어종)$/.test(leaf)){type='live';subtype='fish';basis='Verified product breadcrumb explicitly identifies an ornamental-fish category';}else if(/^(새우|관상새우|CRS새우|체리새우|생이새우)$/.test(leaf)){type='live';subtype='shrimp';basis='Verified product breadcrumb explicitly identifies ornamental shrimp';}else if(/^(수초|음성수초|모둠수초|수중수초|활착수초)$/.test(leaf)){type='live';subtype='aquatic_plant';basis='Verified product breadcrumb explicitly identifies aquatic plants';}else if(/^(수중달팽이|관상용물달팽이)$/.test(leaf)){type='live';subtype='snail';basis='Verified product breadcrumb explicitly identifies aquatic snails';}else if(/^(여과기|여과재|어항|수조|조명|어항용품|수족관 용품|수초용품|인조수초|장식)$/.test(leaf)){type='gear';basis='Verified product breadcrumb explicitly identifies aquarium supplies';}}
 if(!type&&candidate.mixedCategories){
  const confirmedMixed=crumbs.some(crumb=>{try{const key=categoryKey(new URL(crumb.url,candidate.url).href);return seed.categories.some(c=>!c.excluded&&c.mixedCategories&&categoryKey(c.url)===key&&/새우|가재|스네일|달팽이|생물/.test(c.label));}catch{return false;}});
  if(confirmedMixed&&/체리새우|생이새우|노랭이새우|야마토\s*새우|블루벨벳(?:\s*새우|\s*\d+마리)|관상새우|CRS\s*새우|크리스탈\s*(?:레드|블랙)\s*쉬림프/.test(title)){type='live';subtype='shrimp';basis='Verified aquatic-livestock breadcrumb plus explicit ornamental-shrimp product identity';}
  else if(confirmedMixed&&/애플\s*스네일|네리트\s*(?:스네일|달팽이)|관상용물달팽이|수중달팽이/.test(title)){type='live';subtype='snail';basis='Verified aquatic-livestock breadcrumb plus explicit aquatic-snail product identity';}
 }
 if(!type&&candidate.type==='gear'&&!candidate.mixedCategories&&require('./category-tree.cjs').supplies.test(identityTitle)&&!identities(identityTitle).length){type='gear';basis='Explicit primary supply title corroborates the observed aquarium-supply category';}
 if(!type&&!candidate.mixedCategories&&candidate.type==='live'&&(identities(title).length||evidence.salesSpecification||evidence.aquaticDescription)){type=candidate.type;subtype=candidate.subtype;basis='Primary product identity or sales specification corroborates a reviewed discovery hint; no contradictory breadcrumb or title found';}
 if(type==='live'&&subtype==='fish'&&/새우|우렁|달팽/.test(title)){
  if(/체리새우|블루벨벳\s*새우|노랭이\s*새우|CBS\s*새우|CRS\s*새우|크리스탈\s*(?:레드|블랙)\s*(?:쉬림프|새우)/.test(title)){subtype='shrimp';basis='Verified aquatic-livestock context plus explicit ornamental-shrimp identity overrides broad fish category';}
  else if(/^우렁이(?:\s*\d+마리)?$|네리트\s*(?:스네일|달팽이)|수중달팽이|애완물달팽이/.test(title)){subtype='snail';basis='Verified aquatic-livestock context plus explicit aquatic-snail identity overrides broad fish category';}
  else return {status:'needs_review',reason:'Non-fish identity conflicts with broad fish category'};
 }
 if(!type||type==='live'&&(conflict||!['fish','shrimp','aquatic_plant','snail'].includes(subtype)))return {status:'needs_review',reason:conflict?'Feed/artificial plant/supply conflict blocks livestock classification':'Mixed or unresolved product category requires review',evidence};
 // An explicit own-product subtype beats a broad discovery category, but ambiguous shrimp/feed identities do not.
 if(type==='live'&&evidence.subtypes.length===1&&evidence.ownContext&&!conflict)subtype=evidence.subtypes[0];
 return {status:'classified',type,subtype,basis,evidence};
}
module.exports={classifyProduct,breadcrumbs,ownBreadcrumbs};
