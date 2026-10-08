'use strict';
const {scanHtml,categoryKey}=require('./discovery.cjs');
function breadcrumbs(html){
 const lists=[];let nodes=0;function walk(v){if(++nodes>10000)return;if(Array.isArray(v))return v.forEach(walk);if(!v||typeof v!=='object')return;if(/BreadcrumbList$/.test(String(v['@type']||'')))lists.push(v.itemListElement||[]);for(const [key,value]of Object.entries(v))if(key!=='itemListElement')walk(value);}
 for(const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi)){try{walk(JSON.parse(m[1]));}catch{}}
 const nodesInList=lists.flat().map(e=>({name:e.name||e.item?.name||'',url:typeof e.item==='string'?e.item:e.item?.['@id']||e.item?.url||''}));
 // Only a product breadcrumb container, never the site's complete navigation menu.
 const container=html.match(/<(?:div|section)\b[^>]*class\s*=\s*["'][^"']*(?:xans-product-headcategory|ec-base-path|breadcrumb)[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|section)>/i)?.[1];
 if(container)for(const a of scanHtml(container).links)nodesInList.push({name:a.text.replace(/\s+/g,' ').trim(),url:a.href});return nodesInList;
}
function classifyProduct(html,item,candidate,seed){
 const title=item.title||'',crumbs=breadcrumbs(html),names=crumbs.map(c=>c.name).filter(n=>n&&n!==title),context=names.join(' > ');
 if(/육상|육지달팽이|관엽|공기정화|테라리움|파충류|양서류|도마뱀|게코|거북|햄스터|토끼|앵무/.test(title+' '+context))return {status:'excluded_scope',reason:'Terrestrial, reptile, amphibian or horticultural scope is not supported'};
 const feedPath=names.some(n=>/^(?:사료(?:\/먹이)?|먹이|생먹이|냉동사료|동결건조사료|사료\/용품)$/.test(n.trim()));
 if(feedPath)return {status:'classified',type:'gear',subtype:null,basis:'Verified product breadcrumb explicitly places this product under feed/supplies; live-food animals are not ornamental livestock'};
 const conflict=/제거제|모형|치료제|약품|사료|생먹이|냉동|동결건조|건조먹이|인조|조화|모형|플라스틱수초|제거제|약품|비료|수초용품|수초용\s*(?:가위|핀셋)|빈\s*포트|포트만|유목|씨앗/.test(title);
 let type=null,subtype=null,basis=null;
 for(const crumb of crumbs){let url;try{url=new URL(crumb.url,candidate.url).href;}catch{continue;}const key=categoryKey(url);const matching=seed.categories.find(c=>!c.excluded&&!c.mixedCategories&&c.type&&categoryKey(c.url)===key);if(matching){type=matching.type;subtype=matching.subtype;basis='Verified product breadcrumb matches a reviewed retailer category';}}
 if(!type){const leaf=names.at(-1)||'';if(/^(베타|몰리|플래티|플레티|구피|코리도라스|테트라|열대어|관상어|메다카|메다카 분양|구피|카라신과|라스보라|새끼낳는어종)$/.test(leaf)){type='live';subtype='fish';basis='Verified product breadcrumb explicitly identifies an ornamental-fish category';}else if(/^(새우|관상새우|CRS새우|체리새우|생이새우)$/.test(leaf)){type='live';subtype='shrimp';basis='Verified product breadcrumb explicitly identifies ornamental shrimp';}else if(/^(수초|음성수초|모둠수초|수중수초|활착수초)$/.test(leaf)){type='live';subtype='aquatic_plant';basis='Verified product breadcrumb explicitly identifies aquatic plants';}else if(/^(수중달팽이|관상용물달팽이)$/.test(leaf)){type='live';subtype='snail';basis='Verified product breadcrumb explicitly identifies aquatic snails';}else if(/^(여과기|여과재|어항|수조|조명|어항용품|수족관 용품|수초용품|인조수초|장식)$/.test(leaf)){type='gear';basis='Verified product breadcrumb explicitly identifies aquarium supplies';}}
 if(!type&&candidate.mixedCategories){
  const confirmedMixed=crumbs.some(crumb=>{try{const key=categoryKey(new URL(crumb.url,candidate.url).href);return seed.categories.some(c=>!c.excluded&&c.mixedCategories&&categoryKey(c.url)===key&&/새우|가재|스네일|달팽이|생물/.test(c.label));}catch{return false;}});
  if(confirmedMixed&&/체리새우|생이새우|노랭이새우|야마토\s*새우|블루벨벳(?:\s*새우|\s*\d+마리)|관상새우|CRS\s*새우|크리스탈\s*(?:레드|블랙)\s*쉬림프/.test(title)){type='live';subtype='shrimp';basis='Verified aquatic-livestock breadcrumb plus explicit ornamental-shrimp product identity';}
  else if(confirmedMixed&&/애플\s*스네일|네리트\s*(?:스네일|달팽이)|관상용물달팽이|수중달팽이/.test(title)){type='live';subtype='snail';basis='Verified aquatic-livestock breadcrumb plus explicit aquatic-snail product identity';}
 }
 if(!type&&!candidate.mixedCategories&&candidate.type){type=candidate.type;subtype=candidate.subtype;basis='Observed link in a reviewed retailer category plus verified detail identity; no contradictory breadcrumb or title found';}
 if(!type||type==='live'&&(conflict||!['fish','shrimp','aquatic_plant','snail'].includes(subtype)))return {status:'needs_review',reason:conflict?'Feed/artificial plant/supply conflict blocks livestock classification':'Mixed or unresolved product category requires review'};
 return {status:'classified',type,subtype,basis};
}
module.exports={classifyProduct,breadcrumbs};
