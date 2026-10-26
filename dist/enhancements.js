'use strict';
// Local UI state never leaves this browser and is not collector popularity data.
let libraryStorage;try{libraryStorage=typeof localStorage==='undefined'?null:localStorage;}catch{libraryStorage=null;}
const library=AquaCatalog.createLocalLibrary(libraryStorage);
const originalRender=render;
function displayName(p){return AquaCatalog.purchaseFacts(p).baseName;}
function shippingDetail(p){
  if(p.shippingPolicy?.summary)return p.shippingPolicy.summary;
  if(p.sellerId==='solaqua.kr'&&/\/200\//.test(p.sourceUrl))return '배송 안내 상충: 상품 영역 5,000원·5만원 이상 무료 / 하단 2,500~6,000원. 2026-10-26 공개 페이지 확인. 포장비 등 최종 조건 확인 전 합계 보류.';
  return p.shipping===null?'배송비·포장비 미확인':('배송비 '+money(p.shipping.amount)+'원 표시 · 추가 조건은 판매처 확인');
}
function estimateHTML(p){
  if(!filters.wantedQty)return '';
  const e=AquaCatalog.estimatePurchase(p,filters.wantedQty,p.shippingPolicy);
  if(e.subtotal===undefined)return '<p class="estimate">'+escapeHtml(e.reason)+'</p>';
  return '<div class="estimate">희망 '+e.wanted+e.unit+' → '+e.packs+'묶음 · 실제 '+e.actual+e.unit+'<br>예상 상품금액 '+money(e.subtotal)+'원'+(!e.minimumConfirmed?'<br>최소 주문 조건 별도 확인':'')+(e.total===null?'<br>배송 포함 합계 미확인':'<br>배송 '+money(e.shipping)+'원 + 포장 '+money(e.packaging)+'원 = 예상 합계 '+money(e.total)+'원')+'</div>';
}
offerHTML=function(p){
  const f=AquaCatalog.purchaseFacts(p),u=AquaCatalog.unitPrice(p),status=AquaCatalog.comparisonStatus(p),age=AquaCatalog.observationAge(p);
  const price=status.comparable?(p.price.amount===0?status.label:money(p.price.amount)+' 원'):status.label;
  const saved=library.read().favorites.some(x=>x.id===p.id);
  return '<div class="offer" data-offer-id="'+escapeHtml(p.id)+'"><div class="offer-spec">'+escapeHtml(f.option)+'</div><div class="price">'+escapeHtml(price)+'</div>'+(u?'<div class="unit-price">'+(f.volume?'내용량 '+money(f.volume.amount)+(f.volume.dimension==='volume'?'mL':'g'):'총 '+u.count+u.unit)+' · '+u.unit+'당 '+money(u.amount)+'원</div>':'')+estimateHTML(p)+'<div class="shipping">'+(p.shipping===null?'배송비 미확인':('배송비 '+money(p.shipping.amount)+'원 표시'))+'</div><div class="observed'+(age.stale?' stale':'')+'">'+escapeHtml(AquaCatalog.relativeObservation(p))+'</div><div class="stock-unknown">'+(p.available===true?'재고: 마지막 상품 확인 당시 판매 가능':'재고 미확인')+'</div><div class="offer-actions"><a class="source" href="'+escapeHtml(p.sourceUrl)+'" target="_blank" rel="noopener noreferrer">판매처 이동 ↗</a><button type="button" data-favorite="'+escapeHtml(p.id)+'" aria-pressed="'+saved+'">'+(saved?'★ 관심':'☆ 관심')+'</button></div><details class="offer-details"><summary>구매 조건·확인 근거</summary><p>원문: '+escapeHtml(p.originalTitle||p.name)+'</p><p>'+escapeHtml(f.basis||'구매 수량 근거 없음')+(f.reason?' · '+escapeHtml(f.reason):'')+'</p><p>'+escapeHtml(shippingDetail(p))+'</p><time datetime="'+escapeHtml(p.observedAt)+'">가격·상품 확인 '+escapeHtml(formatTime(p.observedAt))+'</time><p>가격 확인과 현재 재고는 다릅니다. 주문 전에 판매처의 옵션과 재고를 확인하세요.</p></details></div>';
};
function restoreFilters(next){filters=next;draftQuery=filters.query;$('#query').value=draftQuery;expandedBrowse=null;expandedGear=null;render();}
function renderLibrary(){
  const saved=library.read(),products=new Map(catalog.products.map(p=>[p.id,p]));
  $('#recentSearches').innerHTML=saved.recent.map((q,i)=>'<button type="button" data-recent="'+i+'">'+escapeHtml(q)+'</button>').join('')||'<span>최근 검색어가 없습니다.</span>';
  $('#savedConditions').innerHTML=saved.saved.map((s,i)=>'<span><button type="button" data-condition="'+i+'">'+escapeHtml(s.label)+'</button><button type="button" data-remove-condition="'+i+'" aria-label="저장 조건 삭제">×</button></span>').join('')||'<span>저장한 조건이 없습니다.</span>';
  $('#favorites').innerHTML=saved.favorites.map(f=>{const p=products.get(f.id);return '<div class="favorite-row">'+(p?'<button type="button" data-open-favorite="'+escapeHtml(p.id)+'">'+escapeHtml(displayName(p))+'</button> · '+escapeHtml(priceText(p.price)):'<span>'+escapeHtml(f.name)+' · 현재 공개 조회 제외 · 재입고 확인 대기</span>')+'<button type="button" data-favorite="'+escapeHtml(f.id)+'" aria-label="관심상품 해제">×</button></div>';}).join('')||'<span>관심상품이 없습니다.</span>';
  $('#storageStatus').textContent=library.persistent()?'이 브라우저에만 저장합니다. 다른 기기·수집기와 공유하지 않습니다.':'브라우저 저장을 사용할 수 없어 이번 화면에서만 유지됩니다. 검색은 계속 사용할 수 있습니다.';
}
function scopeOptions(rows){const map=new Map();for(const p of rows){const u=AquaCatalog.comparisonUnit(p);if(u)map.set(u.scope,u.label);}return map;}
function chipLabels(){return {query:filters.query,subtype:subtypeNames[filters.subtype],fishGroup:AquaCatalog.fishGroups[filters.fishGroup],liveGroup:AquaCatalog.livestockGroups[filters.subtype]?.[filters.liveGroup],browseGroup:AquaCatalog.livestockNavigation[filters.subtype]?.find(x=>x.key===filters.browseGroup)?.label,gearCategory:AquaCatalog.gearCategories[filters.gearCategory],gearGroup:AquaCatalog.gearGroups[filters.gearGroup],sort:{low:'낮은 가격',high:'높은 가격',observed:'최근 확인순',unit:'단가순',new:'신상품순',sales:'판매순'}[filters.sort],seller:filters.seller?AquaCatalog.sellerDisplay(catalogQuery.seller(filters.seller)||{id:filters.seller,name:filters.seller}):'',minPrice:filters.minPrice===null?'':money(filters.minPrice)+'원 이상',maxPrice:filters.maxPrice===null?'':money(filters.maxPrice)+'원 이하',observedDays:filters.observedDays==='all'?'':'최근 '+filters.observedDays+'일',unitScope:$('#unitScope').selectedOptions?.[0]?.textContent||filters.unitScope,wantedQty:filters.wantedQty?'희망 '+filters.wantedQty+'단위':'',compareAcross:'동일 제품 비교',comparison:{all:'미확인 가격 포함',unpriced:'가격 확인 필요만'}[filters.comparison],groupOptions:'옵션 개별 표시',days:'등록 '+filters.days+'일',includeUnknownRegistration:'등록일 미확인 제외'};}
render=function(resetPage=true){
  originalRender(resetPage);
  if(!$('#unitScope'))return;
  if(filters.sort==='unit'){const scopes=scopeOptions(catalogQuery.select({...filters,sort:'low'}).rows);$('#unitScope').innerHTML='<option value="">단가 비교 범위 선택</option>'+[...scopes].map(([id,label])=>'<option value="'+escapeHtml(id)+'">'+escapeHtml(label)+'</option>').join('');$('#unitScope').value=filters.unitScope;}
  $('#unitControls').hidden=filters.sort!=='unit';$('#wantedQty').value=filters.wantedQty||'';$('#compareAcross').checked=filters.compareAcross;
  if(filters.sort==='unit'){$('#sortStatus').hidden=false;$('#sortStatus').textContent='선택한 용도·단위만 정렬합니다. 품종·규격·등급이 같다는 뜻은 아닙니다. 수량 미확인은 제외합니다.';}
  const labels=chipLabels();$('#activeFilters').innerHTML=Object.entries(labels).filter(([k,v])=>v&&filters[k]!==AquaCatalog.defaultFilters[k]).map(([k,v])=>'<button type="button" data-clear-filter="'+k+'">'+escapeHtml(v)+' ×</button>').join('');if($('#activeFilters').innerHTML)$('#activeFilters').innerHTML+='<button type="button" id="clearAllFilters">전체 초기화</button>';
  const rows=catalogQuery.view(filters).result.rows,products=AquaCatalog.groupOffers(rows),visible=filters.groupOptions===false?rows.slice(0,visibleLimit):products.slice(0,visibleLimit).flatMap(g=>g.offers);
  $('#resultTitle').textContent='상품 '+products.length.toLocaleString('ko-KR')+'개 · 옵션 포함 '+rows.length.toLocaleString('ko-KR')+'개';
  $('#paginationStatus').textContent=rows.length?'현재 상품 '+AquaCatalog.groupOffers(visible).length+'개 · 옵션 '+visible.length+'개 표시 / 전체 상품 '+products.length+'개':'';
  if(!rows.length&&catalog.status==='ready')$('#grid').innerHTML='<div class="empty"><strong>현재 조건에서 확인된 상품이 없습니다.</strong>검색어·가격·판매처 조건을 바꿔 보세요. 미수집·품절 제외된 상품을 임의로 표시하지 않습니다.</div>';
  const matches=filters.compareAcross?AquaCatalog.compareSellers(rows):[];
  $('#sellerComparisons').hidden=!filters.compareAcross;
  $('#sellerComparisons').innerHTML=filters.compareAcross?(matches.length?matches.map(g=>'<details class="seller-comparison" open><summary>'+escapeHtml(g.label)+' · '+new Set(g.offers.map(p=>p.sellerId)).size+'개 판매처</summary><p>'+escapeHtml(g.basis)+' · 상품금액 기준. 배송 포함 최저가를 뜻하지 않습니다.</p>'+g.offers.map(p=>'<div class="comparison-offer"><strong>'+escapeHtml(AquaCatalog.sellerDisplay(catalogQuery.seller(p.sellerId)))+'</strong>'+offerHTML(p)+'</div>').join('')+'</details>').join(''):'<p>동일 조건이 확인된 판매처 조합이 없습니다. 브랜드·모델·구성 또는 생물의 품종·크기·성별·등급·수량이 불명확하면 묶지 않습니다.</p>'):'';
  renderLibrary();
};
let suggestions=[],suggestionIndex=-1;
function closeSuggestions(){suggestions=[];suggestionIndex=-1;$('#searchSuggestions').innerHTML='';$('#searchSuggestions').hidden=true;$('#query').setAttribute('aria-expanded','false');$('#query').setAttribute('aria-activedescendant','');}
function paintSuggestions(){const list=$('#searchSuggestions');list.hidden=!suggestions.length;list.innerHTML=suggestions.map((s,i)=>'<button type="button" role="option" id="suggestion-'+i+'" data-suggestion="'+i+'" aria-selected="'+(i===suggestionIndex)+'">'+escapeHtml(s)+'</button>').join('');$('#query').setAttribute('aria-expanded',String(!!suggestions.length));$('#query').setAttribute('aria-activedescendant',suggestionIndex<0?'':'suggestion-'+suggestionIndex);}
function chooseSuggestion(i){if(!suggestions[i])return;draftQuery=suggestions[i];$('#query').value=draftQuery;draftStatus();closeSuggestions();}
$('#query').setAttribute('role','combobox');$('#query').setAttribute('aria-autocomplete','list');$('#query').setAttribute('aria-controls','searchSuggestions');$('#query').setAttribute('aria-expanded','false');
$('#query').addEventListener('input',event=>{draftQuery=event.target.value;draftStatus();if(composing)return;suggestions=catalogQuery.suggest(draftQuery,filters.type);suggestionIndex=-1;paintSuggestions();});
$('#query').addEventListener('compositionstart',closeSuggestions);
$('#query').addEventListener('keydown',event=>{if(composing||event.isComposing||event.keyCode===229)return;if(event.key==='Escape'){closeSuggestions();return;}if(!suggestions.length)return;if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();suggestionIndex=(suggestionIndex+(event.key==='ArrowDown'?1:-1)+suggestions.length)%suggestions.length;paintSuggestions();}else if(event.key==='Enter'&&suggestionIndex>=0){event.preventDefault();chooseSuggestion(suggestionIndex);compositionEnter=true;}});
$('#searchSuggestions').addEventListener('click',event=>{const b=event.target.closest('[data-suggestion]');if(b)chooseSuggestion(Number(b.dataset.suggestion));});
$('#search').addEventListener('submit',()=>{if(!composing&&!compositionEnter){closeSuggestions();library.search(filters.query);renderLibrary();}});
$('#unitScope').addEventListener('change',()=>{filters.unitScope=$('#unitScope').value;render();});
$('#wantedQty').addEventListener('change',()=>{const raw=$('#wantedQty').value.trim();if(raw!==''&&(!/^\d+$/.test(raw)||Number(raw)<1||Number(raw)>100000)){$('#quantityError').textContent='희망 수량은 1~100000 정수로 입력하세요.';return;}$('#quantityError').textContent='';/* Applied with the other shopping filters on submit. */});
$('#compareAcross').addEventListener('change',()=>{filters.compareAcross=$('#compareAcross').checked;render();});
$('#quickRecent').addEventListener('click',event=>{const b=event.target.closest('[data-recent-days]');if(b){filters.observedDays=Number(b.dataset.recentDays);render();}});
$('#activeFilters').addEventListener('click',event=>{const b=event.target.closest('[data-clear-filter]');if(event.target.id==='clearAllFilters'){restoreFilters({...AquaCatalog.defaultFilters,type:filters.type});return;}if(!b)return;const key=b.dataset.clearFilter;filters[key]=AquaCatalog.defaultFilters[key];if(key==='subtype')Object.assign(filters,{fishGroup:'all',liveGroup:'all',browseGroup:'all'});if(key==='gearCategory')filters.gearGroup='all';if(key==='query'){draftQuery='';$('#query').value='';}render();});
function favoriteClick(event){const b=event.target.closest('[data-favorite]');if(!b)return;const p=catalog.products.find(p=>p.id===b.dataset.favorite)||library.read().favorites.find(p=>p.id===b.dataset.favorite);if(p){library.favorite(p);render(false);}}
$('#grid').addEventListener('click',favoriteClick);$('#sellerComparisons').addEventListener('click',favoriteClick);
$('#personalLibrary').addEventListener('click',event=>{
  favoriteClick(event);const target=event.target,read=library.read();
  const recent=target.closest('[data-recent]');if(recent){restoreFilters({...filters,query:read.recent[Number(recent.dataset.recent)]});library.search(filters.query);renderLibrary();}
  const saved=target.closest('[data-condition]');if(saved)restoreFilters(AquaCatalog.filtersFromSearch(read.saved[Number(saved.dataset.condition)].search));
  const remove=target.closest('[data-remove-condition]');if(remove){library.removeCondition(Number(remove.dataset.removeCondition));renderLibrary();}
  const fav=target.closest('[data-open-favorite]');if(fav){const p=catalog.products.find(p=>p.id===fav.dataset.openFavorite);if(p)restoreFilters({...AquaCatalog.defaultFilters,type:p.type,query:p.name,seller:p.sellerId,comparison:'all'});}
});
$('#saveCondition').addEventListener('click',()=>{library.saveCondition((filters.query||'전체')+' · '+(filters.type==='live'?'생물':'용품'),AquaCatalog.filtersToSearch(filters));renderLibrary();});
$('#clearLibrary').addEventListener('click',()=>{library.clear();render();});
render(false);
