'use strict';
// Primary-title predicate and selection hints. Menu hints alone never authorize requests or publication.
const filterMenu=/여과기|여과\/모터|filtration/i;
const accessory=/부품|리필|교체|여과재|카트리지|프리\s*필터|입수관|출수관|거치대|임펠/i;
function filtrationSubject(title){
 const text=String(title||'');
 return /(?:단지|외부|스펀지|스폰지|걸이식|측면|내부|저면|상면|저수위|도시락)\s*여과기/.test(text)&&
  !/\d+\s*(?:마리|쌍)|분양|여과기.{0,10}(?:증정|사은품)|육지|테라리움|파충류|양서류|도마뱀|게코|햄스터|토끼|앵무/.test(text);
}
function preferredCategory(entry){return !entry.excluded&&entry.type==='gear'&&filterMenu.test(entry.label||'')&&!/부품|리필|교체|카트리지|프리\s*필터|입수관|출수관|거치대|임펠/i.test(entry.label||'');}
function preferredCandidate(candidate,ledger=[]){
 const entry=ledger.find(e=>e.url===candidate.url||e.key===candidate.key);
 const title=candidate.title||entry?.title||'';
 if(title)return filtrationSubject(title)&&!accessory.test(title);
 return (candidate.discoveredCategoryLabels||[]).some(label=>filterMenu.test(label)&&!accessory.test(label));
}
function categoryOrder(order,entries,maxPages){
 if(maxPages<2)return [...order];
 const quota=Math.max(1,Math.floor(maxPages/2)),first=order.filter(i=>preferredCategory(entries[i])).slice(0,quota),chosen=new Set(first);
 return [...first,...order.filter(i=>!chosen.has(i))];
}
module.exports={filtrationSubject,preferredCategory,preferredCandidate,categoryOrder};
