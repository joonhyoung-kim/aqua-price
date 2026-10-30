'use strict';
var ux5PanelEditing=false,ux5PanelState=null;
// Local UI state never leaves this browser and is not collector popularity data.
let libraryStorage;try{libraryStorage=typeof localStorage==='undefined'?null:localStorage;}catch{libraryStorage=null;}
const library=AquaCatalog.createLocalLibrary(libraryStorage);
const originalRender=render;
function displayName(p){return p.type==='live'&&!p.variantId?p.name:AquaCatalog.purchaseFacts(p).baseName;}
function livestockCardSpec(p){
  const spec=AquaCatalog.offerSpec(p);
  // Real selected options remain visible; inferred standalone counts are redundant.
  if(spec==='옵션·수량 미확인')return '';
  if(!p.variantId&&/^(?:(?:수량|판매단위|옵션)\s*[:：]?\s*)?\d+(?:\.\d+)?\s*(?:마리|쌍|개|촉|포트|컵)(?:\s*묶음)?$/.test(spec.trim()))return '';
  return spec;
}
function shippingDetail(p){
  if(p.shippingPolicy?.summary)return p.shippingPolicy.summary;
  if(p.sellerId==='solaqua.kr'&&/\/200\//.test(p.sourceUrl))return '배송 안내 상충: 상품 영역 5,000원·5만원 이상 무료 / 하단 2,500~6,000원. 2026-10-26 공개 페이지 확인. 포장비 등 최종 조건 확인 전 합계 보류.';
  return p.shipping===null?'배송비·포장비 미확인':('배송비 '+money(p.shipping.amount)+'원 표시 · 추가 조건은 판매처 확인');
}
function estimateHTML(p){
  if(!filters.wantedQty)return '';
  const e=AquaCatalog.estimatePurchase(p,filters.wantedQty,p.shippingPolicy);const partial=AquaCatalog.knownShipping(p,e.subtotal);
  if(e.subtotal===undefined)return '<p class="estimate">'+escapeHtml(e.reason)+'</p>';
  return '<div class="estimate">희망 '+e.wanted+e.unit+' → '+e.packs+'묶음 · 실제 '+e.actual+e.unit+'<br>예상 상품금액 '+money(e.subtotal)+'원'+(!e.minimumConfirmed?'<br>최소 주문 조건 별도 확인':'')+(e.total===null?(partial?'<br>상품+기본배송 '+money(partial.knownSubtotal)+'원 · 지역·포장비 미확인':'<br>배송 포함 합계 미확인'):'<br>배송 '+money(e.shipping)+'원 + 포장 '+money(e.packaging)+'원 = 예상 합계 '+money(e.total)+'원')+'</div>';
}
offerHTML=function(p){
  const f=AquaCatalog.purchaseFacts(p),u=AquaCatalog.unitPrice(p),status=AquaCatalog.comparisonStatus(p),age=AquaCatalog.observationAge(p);
  const price=status.comparable?(p.price.amount===0?status.label:money(p.price.amount)+' 원'):status.label;
  const saved=library.read().favorites.some(x=>x.id===p.id);
  if(p.type==='live'){
    const spec=livestockCardSpec(p);
    return '<div class="offer live-offer" data-offer-id="'+escapeHtml(p.id)+'">'+(spec?'<div class="offer-spec">'+escapeHtml(spec)+'</div>':'')+'<div class="price">'+escapeHtml(price)+'</div>'+(u?'<div class="unit-price">'+u.unit+'당 '+money(u.amount)+'원</div>':'')+estimateHTML(p)+'<div class="seller-label">'+escapeHtml(AquaCatalog.sellerDisplay(catalogQuery.seller(p.sellerId)))+'</div><div class="offer-actions"><a class="source" href="'+escapeHtml(p.sourceUrl)+'" target="_blank" rel="noopener noreferrer">판매처 보기 ↗</a><button type="button" data-favorite="'+escapeHtml(p.id)+'" aria-pressed="'+saved+'">'+(saved?'♥ 관심':'♡ 관심')+'</button></div></div>';
  }
  return '<div class="offer" data-offer-id="'+escapeHtml(p.id)+'"><div class="offer-spec">'+escapeHtml(AquaCatalog.offerSpec(p))+'</div><div class="price">'+escapeHtml(price)+'</div>'+(u?'<div class="unit-price">'+(f.volume?'내용량 '+money(f.volume.amount)+(f.volume.dimension==='volume'?'mL':'g'):'총 '+u.count+u.unit)+' · '+u.unit+'당 '+money(u.amount)+'원</div>':'')+estimateHTML(p)+'<div class="shipping">'+(p.shipping===null?'배송비 미확인':('배송비 '+money(p.shipping.amount)+'원 표시'))+'</div><div class="observed'+(age.stale?' stale':'')+'">'+escapeHtml('가격 '+AquaCatalog.relativeObservation(p))+'</div><div class="stock-unknown">'+(p.available===true?'재고: 마지막 상품 확인 당시 판매 가능':'재고 미확인')+'</div><div class="seller-label">'+escapeHtml(AquaCatalog.sellerDisplay(catalogQuery.seller(p.sellerId)))+'</div><div class="offer-actions"><a class="source" href="'+escapeHtml(p.sourceUrl)+'" target="_blank" rel="noopener noreferrer">판매처 보기 ↗</a><button type="button" data-favorite="'+escapeHtml(p.id)+'" aria-pressed="'+saved+'">'+(saved?'♥ 관심':'♡ 관심')+'</button></div><details class="offer-details"><summary>상품 상세·확인 정보</summary><p>원문: '+escapeHtml(p.originalTitle||p.name)+'</p><p>'+escapeHtml(f.basis||'구매 수량 근거 없음')+(f.reason?' · '+escapeHtml(f.reason):'')+'</p><p>'+escapeHtml(shippingDetail(p))+'</p><time datetime="'+escapeHtml(p.observedAt)+'">가격·상품 확인 '+escapeHtml(formatTime(p.observedAt))+'</time><p>가격 확인과 현재 재고는 다릅니다. 주문 전에 판매처의 옵션과 재고를 확인하세요.</p></details></div>';
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
function chipLabels(){return {query:filters.query,subtype:subtypeNames[filters.subtype],fishGroup:AquaCatalog.fishGroups[filters.fishGroup],liveGroup:AquaCatalog.livestockGroups[filters.subtype]?.[filters.liveGroup],browseGroup:AquaCatalog.livestockNavigation[filters.subtype]?.find(x=>x.key===filters.browseGroup)?.label,gearCategory:AquaCatalog.gearCategories[filters.gearCategory],gearGroup:AquaCatalog.gearGroups[filters.gearGroup],sort:{low:'낮은 가격',high:'높은 가격',observed:'최근 확인순',unit:'단가순',relevance:'관련도순',delivered:'배송 포함 예상금액순',new:'신상품순',sales:'판매순'}[filters.sort],seller:filters.seller?AquaCatalog.sellerDisplay(catalogQuery.seller(filters.seller)||{id:filters.seller,name:filters.seller}):'',minPrice:filters.minPrice===null?'':money(filters.minPrice)+'원 이상',maxPrice:filters.maxPrice===null?'':money(filters.maxPrice)+'원 이하',observedDays:filters.observedDays==='all'?'':'최근 '+filters.observedDays+'일',productRole:filters.type==='gear'?AquaCatalog.roleLabels[filters.productRole]:'',unitScope:filters.sort==='unit'?(catalogQuery.view(filters).result.unitState?.scopes.find(s=>s.value===filters.unitScope)?.label||''):'',wantedQty:filters.wantedQty?'희망 '+filters.wantedQty+(catalogQuery.view(filters).result.unitState?.scopes.find(s=>s.value===filters.unitScope)?.unit||' (상품별 구매단위)'):'',compareAcross:'동일 제품 비교',comparison:{all:'미확인 가격 포함',unpriced:'가격 확인 필요만'}[filters.comparison],groupOptions:'옵션 개별 표시',days:'등록 '+filters.days+'일',includeUnknownRegistration:'등록일 미확인 제외'};}
render=function(resetPage=true){
  const selected=catalogQuery.view(filters).result;
  const unitNotice=selected.unitState?.changed&&filters.sort==='unit';
  if(selected.effectiveFilters)filters={...filters,...selected.effectiveFilters};
  originalRender(resetPage);
  if(!$('#unitScope'))return;
  if(filters.sort==='unit'){const scopes=scopeOptions(catalogQuery.select({...filters,sort:'low'}).rows);$('#unitScope').innerHTML='<option value="">단가 비교 범위 선택</option>'+[...scopes].map(([id,label])=>'<option value="'+escapeHtml(id)+'">'+escapeHtml(label)+'</option>').join('');$('#unitScope').value=filters.unitScope;}
  $('#unitControls').hidden=filters.sort!=='unit';$('#wantedQty').value=filters.wantedQty||'';$('#compareAcross').checked=filters.compareAcross;
  if(filters.sort==='delivered'){$('#sortStatus').hidden=false;$('#sortStatus').textContent='수량·최소 주문·일반 배송·포장비가 모두 확인된 예상 합계만 정렬합니다. 미확인 비용이 있는 상품은 상품가격순에서 확인하세요.';}
  if(filters.sort==='unit'){$('#sortStatus').hidden=false;$('#sortStatus').textContent='선택한 용도·단위만 정렬합니다. 품종·규격·등급이 같다는 뜻은 아닙니다. 수량 미확인은 제외합니다.';}
  const labels=chipLabels();$('#activeFilters').innerHTML=Object.entries(labels).filter(([k,v])=>v&&filters[k]!==AquaCatalog.defaultFilters[k]).map(([k,v])=>'<button type="button" data-clear-filter="'+k+'">'+escapeHtml(v)+' ×</button>').join('');if($('#activeFilters').innerHTML)$('#activeFilters').innerHTML+='<button type="button" id="clearAllFilters">전체 초기화</button>';
  const rows=catalogQuery.view(filters).result.rows,products=AquaCatalog.groupOffers(rows),visible=filters.groupOptions===false?rows.slice(0,visibleLimit):products.slice(0,visibleLimit).flatMap(g=>g.offers);
  $('#resultTitle').textContent='상품 '+products.length.toLocaleString('ko-KR')+'개 · 옵션 포함 '+rows.length.toLocaleString('ko-KR')+'개';
  $('#paginationStatus').textContent=rows.length?'현재 상품 '+AquaCatalog.groupOffers(visible).length+'개 · 옵션 '+visible.length+'개 표시 / 전체 상품 '+products.length+'개':'';
  if(!rows.length&&catalog.status==='ready')$('#grid').innerHTML='<div class="empty"><strong>'+(selected.unitState?.needsSelection?'단가 범위 선택 필요':'현재 조건에 맞는 상품이 없습니다')+'</strong>'+escapeHtml(selected.reason)+'</div>';
  const matches=filters.compareAcross?AquaCatalog.compareSellers(rows):[];
  $('#sellerComparisons').hidden=!filters.compareAcross;
  $('#sellerComparisons').innerHTML=filters.compareAcross?(matches.length?matches.map(g=>'<details class="seller-comparison" open><summary>'+escapeHtml(g.label)+' · '+new Set(g.offers.map(p=>p.sellerId)).size+'개 판매처</summary><p>'+escapeHtml(g.basis)+' · 상품금액 기준. 배송 포함 최저가를 뜻하지 않습니다.</p>'+g.offers.map(p=>'<div class="comparison-offer"><strong>'+escapeHtml(AquaCatalog.sellerDisplay(catalogQuery.seller(p.sellerId)))+'</strong>'+offerHTML(p)+'</div>').join('')+'</details>').join(''):'<p>동일 조건이 확인된 판매처 조합이 없습니다. 브랜드·모델·구성 또는 생물의 품종·크기·성별·등급·수량이 불명확하면 묶지 않습니다.</p>'):'';
  if(catalog.status!=="ready")$("#resultTitle").textContent=catalog.status==="pending"?"데이터 불러오는 중":"데이터 불러오기 실패";
  renderLibrary();if(typeof renderAdvancedUI==="function")renderAdvancedUI();if(typeof renderWorkspaceUI==="function")renderWorkspaceUI();
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
$('#saveCondition').addEventListener('click',()=>{library.saveCondition((filters.query||'전체')+' · '+({all:'전체',live:'생물',gear:'용품'}[filters.type]),AquaCatalog.filtersToSearch(filters));renderLibrary();});
$('#clearLibrary').addEventListener('click',()=>{library.clear();render();});
render(false);

var renderAdvancedUI;
if($('#productRole')){
 const observations=AquaCatalog.createWatchStore(libraryStorage);let qualityCatalog=null,quality=[],observedCatalog=null,returnRestored=false;
 const specialLabels={careTemp:'수온 °C',carePH:'pH',adultMax:'성어 크기 상한 cm',tankLength:'수조 길이 cm',careDifficulty:'관리 조건',filterMethod:'여과 방식',tankLitres:'제조사 수조 L',flowMin:'유량 최솟값 L/h',wattMax:'소비전력 상한 W',hose:'호스',feedTarget:'사료 대상',feedBuoyancy:'사료 형태',particleMax:'입자 상한 mm',mediaPurpose:'여과재 용도',mediaMaterial:'여과재 재질',volumeMin:'용량 최솟값 mL',massMin:'중량 최솟값 g',includeUnknownGuidance:'조건 미확인 제외'};
 const oldChips=chipLabels;chipLabels=function(){const labels=oldChips();for(const k of Object.keys(AquaCatalog.specialDefaults)){if(filters[k]===AquaCatalog.specialDefaults[k]||filters[k]===undefined)continue;labels[k]=specialLabels[k]+(typeof filters[k]==='boolean'?'':' '+($('#'+k)?.selectedOptions?.[0]?.textContent||filters[k]));}return labels;};
 function guidanceHTML(p){const c=AquaCatalog.careProfile(p),e=AquaCatalog.equipmentFacts(p),r=e.reference;let h='';if(c)h+='<p>'+escapeHtml(c.label+' · '+c.id+' · '+c.temperature.join('~')+'°C · pH '+c.ph.join('~')+' · '+c.compatibility)+'</p><a href="'+escapeHtml(c.sourceUrl)+'" target="_blank" rel="noopener">사육 출처</a>';else if(p.type==='live')h+='<p>학명 동정 근거 미확인 · 사육 조건 자동 연결 보류. 필터의 대표 종 참고 자료를 확인하세요.</p>';if(r)h+='<p>'+escapeHtml(r.label+' · '+(r.region?r.region+' '+r.frequencyHz+'Hz 참고: '+r.tankLitres.join('~')+'L, '+r.flowLph+'L/h, '+r.watts+'W, '+r.hose+'mm · ':'')+r.caveat)+'</p><a href="'+escapeHtml(r.sourceUrl)+'" target="_blank" rel="noopener">제조사 출처 · '+AquaCatalog.guidance.checkedAt+' 확인</a>';return h;}
 const oldOffer=offerHTML;offerHTML=function(p){const role=AquaCatalog.productRole(p),shipping=AquaCatalog.knownShipping(p,p.price?.amount),review=p.reviewEvidence;
  let h=oldOffer(p);h=h.replace('<div class="offer-spec">',(p.type==='gear'?'<span class="role-tag" title="'+escapeHtml(role.basis)+'">'+role.label+'</span>':'')+'<div class="offer-spec">');
  h=h.replace('<div class="shipping">'+(p.shipping===null?'배송비 미확인':('배송비 '+money(p.shipping.amount)+'원 표시'))+'</div>','<div class="shipping">'+(shipping?'기본 배송 '+money(shipping.shipping)+'원 · 추가비용 미확인':p.shippingPolicy?'배송 조건 확인 후 7일 경과 또는 근거 부족 · 재확인 필요':'배송비 미확인')+'</div>');
  const stock=p.stockObservedAt?(p.available===true?'재고: 확인 당시 판매 가능':'재고 미확인'):'재고 확인 시각 미확인';
  h=h.replace(/<div class="stock-unknown">.*?<\/div>/,'<div class="stock-unknown">'+escapeHtml(stock)+'</div>');
  const extra='<p>재고 확인 시각: '+escapeHtml(p.stockObservedAt?formatTime(p.stockObservedAt):'미확인')+'</p>'+guidanceHTML(p)+'<p><a href="'+escapeHtml(review?.url||p.sourceUrl)+'" target="_blank" rel="noopener">'+(review?'원본 후기'+(review.count===null?'':' '+review.count+'개'):'원본에서 후기 확인')+'</a>'+(review?' · '+escapeHtml(formatTime(review.checkedAt))+' 확인 · 평점·구매 인증 미확인':' · 후기 수·위치 미확인')+'</p><fieldset class="watch-controls"><legend>관심상품 관찰 (사이트 열 때만)</legend><label>목표 판매가격 이하 (원)<input data-watch-price="'+escapeHtml(p.id)+'" type="number" min="0" step="1" inputmode="numeric"></label><label><input type="checkbox" data-watch-restock="'+escapeHtml(p.id)+'">확인된 품절 후 재입고 관찰</label><button type="button" data-watch-save="'+escapeHtml(p.id)+'">관찰 저장</button></fieldset><fieldset class="report-controls"><legend>오류 신고 초안 · 운영자 미접수</legend><select data-report-kind="'+escapeHtml(p.id)+'" aria-label="오류 유형"><option value="price">가격이 달라요</option><option value="stock">품절이에요</option><option value="identity">다른 상품이에요</option><option value="link">링크가 안 열려요</option></select><button type="button" data-report-save="'+escapeHtml(p.id)+'">내 브라우저에 초안 저장</button></fieldset>';
  return h.replace('</details></div>',extra+'</details></div>');
 };
 renderAdvancedUI=function(){
  $('#roleControls').hidden=filters.type!=='gear';$('#productRole').value=filters.productRole||'all';$('#liveSpecial').hidden=filters.type!=='live';$('#gearSpecial').hidden=filters.type!=='gear';
  for(const [k,v]of Object.entries(AquaCatalog.specialDefaults)){const n=$('#'+k);if(!n)continue;if(typeof v==='boolean')n.checked=filters[k]!==false;else n.value=filters[k]??'';}
  $('#grid').classList.toggle('table-view',$('#resultView').value==='table');
  if(catalog.status==='ready'&&catalog!==qualityCatalog){qualityCatalog=catalog;quality=AquaCatalog.sellerQuality(catalog);}
  $('#qualitySummary').innerHTML='<p>가격 7일 초과 비율 · 재고 확인 시각 별도. 가격/재고 불일치율은 원본 동시 대조 자료가 없어 미측정입니다. 아래 마지막 상품 시각은 판매처 수집 성공 시각과 다릅니다.</p><table><thead><tr><th>판매처</th><th>상품</th><th>7일 초과</th><th>재고시각 미확인</th></tr></thead><tbody>'+quality.map(s=>'<tr><td>'+escapeHtml(s.name)+'</td><td>'+s.count+'</td><td>'+Math.round(s.staleRatio*100)+'%</td><td>'+s.stockUnknown+'</td></tr>').join('')+'</tbody></table>';
  if(catalog.status==='ready'&&catalog!==observedCatalog){observedCatalog=catalog;observations.observe(catalog);}
  if(!returnRestored&&catalog.status==='ready'&&typeof requestAnimationFrame==='function'){returnRestored=true;try{const r=JSON.parse(sessionStorage.getItem('aqua-return'));if(r?.url===location.pathname+location.search&&Number.isFinite(r.y)&&r.y>=0&&Number.isSafeInteger(r.limit)){requestAnimationFrame(()=>{visibleLimit=Math.max(PAGE_SIZE,Math.min(r.limit,10000));render(false);requestAnimationFrame(()=>scrollTo(0,r.y));});}}catch{}}
  const st=observations.read();$('#watchStatus').textContent=(observations.persistent()?'내 브라우저에 저장됨':'저장소 사용 불가 · 이번 화면에서만 유지')+' · 백그라운드 알림·운영자 접수 서버 미연결';
  $('#watchList').innerHTML=st.watches.map(w=>'<p>'+escapeHtml(w.name)+' · '+(w.targetPrice===null?'':money(w.targetPrice)+'원 이하')+(w.restock?' · 재입고':'')+'<button type="button" data-watch-remove="'+escapeHtml(w.id)+'">관찰 해제</button></p>').join('')||'<p>관찰 설정 없음. 관심상품의 구매 조건에서 설정하세요.</p>';
  $('#watchEvents').innerHTML=st.events.map(e=>'<p>'+escapeHtml(st.watches.find(w=>w.id===e.id)?.name||e.id)+' · '+(e.kind==='restock'?'확인된 품절 후 재입고 관찰':'목표 판매가격 도달 '+money(e.price)+'원')+' · '+escapeHtml(formatTime(e.at))+'</p>').join('')||'<p>새로 확인된 관찰 변화 없음</p>';
  $('#reportDrafts').innerHTML=st.reports.map(r=>'<p>'+escapeHtml(r.name)+' · '+({price:'가격',stock:'품절',identity:'상품 연결',link:'링크'})[r.kind]+' · '+(r.status==='exported'?'내보내기 준비됨 · 미접수':'초안 · 미접수')+'</p>').join('')||'<p>신고 초안 없음</p>';
 };
 $('#careReference').innerHTML=AquaCatalog.guidance.species.map(c=>'<details><summary>'+escapeHtml(c.label+' · '+c.id)+'</summary><p>'+escapeHtml(c.temperature.join('~')+'°C · pH '+c.ph.join('~')+' · '+c.adultCm+'cm ('+c.sizeBasis+') · '+(c.tankBaseCm?'수조 바닥 '+c.tankBaseCm.join('×')+'cm':c.tankNote))+'</p><p>'+escapeHtml(c.diet+' · '+c.reason+' · '+c.compatibility)+'</p><a href="'+escapeHtml(c.sourceUrl)+'" target="_blank" rel="noopener">출처 · '+AquaCatalog.guidance.checkedAt+' 확인</a><p>'+escapeHtml(c.sourceScope)+'</p></details>').join('');
 $('#productRole').addEventListener('change',()=>{filters.productRole=$('#productRole').value;render();});
 $('#resultView').addEventListener('change',()=>render(false));
 $('#specialForm').addEventListener('submit',e=>{e.preventDefault();const n={...filters};for(const [k,v]of Object.entries(AquaCatalog.specialDefaults)){const el=$('#'+k);n[k]=typeof v==='boolean'?el.checked:AquaCatalog.specialEnums[k]?el.value:el.value.trim()===''?null:Number(el.value);}try{catalogQuery.select(n);filters=n;$('#specialError').textContent='';render();}catch{$('#specialError').textContent='양수인 수치와 선택 조건을 확인하세요.';}});
 function action(e){const save=e.target.closest('[data-watch-save]'),report=e.target.closest('[data-report-save]');const id=save?.dataset.watchSave||report?.dataset.reportSave;if(!id)return;const p=catalog.products.find(p=>p.id===id);if(!p)return;const scope=e.target.closest('.offer');if(save){const raw=scope.querySelector('[data-watch-price]').value.trim(),restock=scope.querySelector('[data-watch-restock]').checked;if(raw!==''&&(!/^\d+$/.test(raw)||!Number.isSafeInteger(Number(raw)))||raw===''&&!restock){$('#watchStatus').textContent='목표 가격 0 이상 또는 재입고 관찰을 선택하세요.';return;}if(!library.read().favorites.some(f=>f.id===p.id))library.favorite(p);observations.set({id:p.id,name:p.name,targetPrice:raw===''?null:Number(raw),restock,enabled:true,last:AquaCatalog.watchObservation(catalog,p.id)});}else observations.report(p,scope.querySelector('[data-report-kind]').value);render(false);}
 $('#grid').addEventListener('click',action);$('#sellerComparisons').addEventListener('click',action);
 $('#observationPanel').addEventListener('click',e=>{const b=e.target.closest('[data-watch-remove]');if(b){observations.remove(b.dataset.watchRemove);render(false);}});
 $('#clearWatchEvents').addEventListener('click',()=>{observations.clearEvents();render(false);});
 $('#exportReports').addEventListener('click',()=>{$('#reportExport').hidden=false;$('#reportExport').value=observations.exportReports();renderAdvancedUI();});
 // Browser handles bfcache scroll restoration. Persist a same-path fallback only on user navigation.
 if(typeof addEventListener==='function')addEventListener('pagehide',()=>{try{sessionStorage.setItem('aqua-return',JSON.stringify({url:location.pathname+location.search,y:scrollY,limit:visibleLimit}));}catch{}});
 render(false);

}

// UX4 changes the presentation of the existing query and v1 local-library contracts.
var renderWorkspaceUI;
if($('#toggleFilters')){
 const scopeNames={all:'전체',live:'생물',gear:'용품'};
 let restoredCondition=false;
 function displayShipping(p){const policy=AquaCatalog.knownShipping(p,p.price?.amount);return policy?'기본 '+money(policy.shipping)+'원 · 추가비용 미확인':p.shipping===null?'배송비 미확인':money(p.shipping.amount)+'원 · 조건 확인';}
 function makeTable(rows){return '<div class="table-caption">검색 결과 표 · 서로 다른 상품도 포함합니다. 동일 규격 판매처 비교와 별개입니다. 좁은 화면에서는 표 안에서 좌우로 이동하세요.</div><table><thead><tr><th scope="col">상품</th><th scope="col">규격·수량</th><th scope="col">판매처</th><th scope="col" class="numeric" aria-sort="'+(filters.sort==='low'?'ascending':filters.sort==='high'?'descending':'none')+'"><button type="button" data-table-price>판매가격 '+(filters.sort==='high'?'↓':'↑')+'</button></th><th scope="col" class="numeric">단가</th><th scope="col">배송비</th><th scope="col">확인 시점</th><th scope="col">판매처에서 보기</th></tr></thead><tbody>'+rows.map(p=>{const f=AquaCatalog.purchaseFacts(p),unit=AquaCatalog.unitPrice(p),status=AquaCatalog.comparisonStatus(p),saved=library.read().favorites.some(f=>f.id===p.id);return '<tr data-product-id="'+escapeHtml(p.id)+'"><td><strong>'+escapeHtml(displayName(p))+'</strong><details><summary>원문·확인 근거</summary><p>'+escapeHtml(p.originalTitle||p.name)+'</p><p>'+escapeHtml(f.basis||'규격 근거 미확인')+'</p><p>'+escapeHtml(shippingDetail(p))+'</p><p>재고 확인 '+escapeHtml(p.stockObservedAt?formatTime(p.stockObservedAt):'미확인')+'</p></details></td><td>'+escapeHtml(AquaCatalog.offerSpec(p))+'</td><td>'+escapeHtml(AquaCatalog.sellerDisplay(catalogQuery.seller(p.sellerId)))+'</td><td class="numeric">'+escapeHtml(status.comparable?priceText(p.price):status.label)+'</td><td class="numeric">'+(unit?escapeHtml(money(unit.amount)+'원/'+unit.unit):'단가 미확인')+'</td><td>'+escapeHtml(displayShipping(p))+'</td><td><time datetime="'+escapeHtml(p.observedAt)+'" title="'+escapeHtml(formatTime(p.observedAt))+'">가격 '+escapeHtml(AquaCatalog.relativeObservation(p))+'</time><small>'+(!p.stockObservedAt?'재고 시각 미확인':p.available===true?'재고: 확인 당시 판매 가능':'재고 미확인')+'</small></td><td><a href="'+escapeHtml(p.sourceUrl)+'" target="_blank" rel="noopener noreferrer">판매처 보기 ↗</a><br><button type="button" data-favorite="'+escapeHtml(p.id)+'" aria-pressed="'+saved+'">'+(saved?'♥ 관심':'♡ 관심')+'</button></td></tr>';}).join('')+'</tbody></table>';}
 function scopeBase(type){return {...AquaCatalog.defaultFilters,type,query:filters.query};}
 renderWorkspaceUI=function(){
  const result=catalogQuery.view(filters).result,rows=result.rows,groups=AquaCatalog.groupOffers(rows),shown=filters.groupOptions===false?rows.slice(0,visibleLimit):groups.slice(0,visibleLimit).flatMap(g=>g.offers);
  $('#toggleFilters').setAttribute('aria-expanded',String($('#moreFilters').open));
  $('#scopeStatus').textContent=restoredCondition?'저장 조건을 불러왔습니다 · 검색 범위 '+scopeNames[filters.type]:filters.query?'검색 범위: '+scopeNames[filters.type]:'기본 범위: '+scopeNames[filters.type]+' · 저장 조건은 직접 불러옵니다.';
  $('#openFavorites').textContent='♡ 관심상품 '+library.read().favorites.length;
  if(catalog.status==='ready'){$('#resultTitle').textContent='검색 결과 '+groups.length.toLocaleString('ko-KR')+'개';$('#optionCount').textContent='옵션 '+rows.length.toLocaleString('ko-KR')+'개';$('#dataStatus').textContent='전체 수집 '+catalog.products.length.toLocaleString('ko-KR')+'개 · 확인된 품절 제외';}
  $('#resultTable').hidden=$('#resultView').value!=='table'||!rows.length;
  $('#grid').hidden=$('#resultView').value==='table'&&rows.length>0;
  if(!$('#resultTable').hidden)$('#resultTable').innerHTML=makeTable(shown);
  const context=AquaCatalog.guidanceContext(filters),allowed=AquaCatalog.guidanceFields[context];
  $('#liveSpecial').hidden=context!=='live';$('#gearSpecial').hidden=['live','none'].includes(context);
  for(const key of Object.keys(AquaCatalog.specialDefaults)){if(key==='includeUnknownGuidance')continue;const el=$('#'+key);if(el)el.closest('label').hidden=!allowed.includes(key);}
  $('#specialFilters').querySelector('summary').textContent=({live:'사육 조건',feed:'사료 규격',filter:'여과기 규격',media:'여과재 규격',none:'상품군별 규격'})[context]+' 필터';
  $('#specialContextHint').textContent=context==='none'?'생물·용품 범위와 분류 또는 검색어에 맞는 규격 필터를 표시합니다. 사료·여과기·여과재를 선택하세요.':'현재 '+({live:'생물',feed:'사료',filter:'여과기',media:'여과재'})[context]+'에 관련된 조건만 적용합니다.';
  const matches=AquaCatalog.compareSellers(rows);
  $('#comparisonEntry').innerHTML=catalog.status!=='ready'?'':matches.length?matches.map((g,i)=>'<button type="button" data-compare-entry="'+i+'">판매처 '+new Set(g.offers.map(p=>p.sellerId)).size+'곳 비교 · '+escapeHtml(g.label)+'</button>').join(''):'';
  if(filters.compareAcross)$('#sellerComparisons').querySelectorAll('details.seller-comparison').forEach((el,i)=>{el.id='exact-comparison-'+i;el.querySelector('summary').textContent='동일 규격 판매처 비교 · '+el.querySelector('summary').textContent;});
  $('#rangeRecovery').innerHTML='';
  if(!rows.length&&catalog.status==='ready'&&filters.query){const counts=Object.fromEntries(['all','live','gear'].map(t=>[t,AquaCatalog.groupOffers(catalogQuery.view(scopeBase(t)).result.rows).length]));const own=counts[filters.type];$('#rangeRecovery').innerHTML='<p>'+(own?'검색어에 해당하는 상품이 '+own+'개 있지만 현재 필터로 제외됐습니다.':'현재 범위에서 이 검색어로 확인된 상품이 없습니다.')+'</p>'+Object.entries(counts).filter(([t,n])=>n>0).map(([t,n])=>'<button type="button" data-result-scope="'+t+'">'+scopeNames[t]+' '+n+'개 보기 · 추가 필터 해제</button>').join('')+(counts.all===0?'<p>다른 범위도 0개입니다. 검색어를 줄이거나 별칭을 확인하세요. 품절·미확인 상품은 결과를 늘리기 위해 노출하지 않습니다.</p>':'');}
 };
 const contextHint=document.createElement('p');contextHint.id='specialContextHint';contextHint.className='hint';$('#specialForm').prepend(contextHint);
 const familyButtons=document.createElement('div');familyButtons.className='compact-actions';familyButtons.id='specFamilies';familyButtons.innerHTML='<button type="button" data-spec-family="feed">사료</button><button type="button" data-spec-family="filter">외부여과기</button><button type="button" data-spec-family="media">생물학 여과재</button>';contextHint.after(familyButtons);
 $('#specFamilies').addEventListener('click',e=>{const b=e.target.closest('[data-spec-family]');if(!b)return;const family=b.dataset.specFamily;filters={...filters,type:'gear',gearCategory:family==='feed'?'feeding':'filtration',gearGroup:family==='feed'?'all':family==='filter'?'filter_external':'media_bio'};render();});
 $('#toggleFilters').addEventListener('click',()=>openUX5Panel('filters'));
 $('#moreFilters').addEventListener('toggle',()=>$('#toggleFilters').setAttribute('aria-expanded',String($('#moreFilters').open)));
 $('#openFavorites').addEventListener('click',()=>openUX5Panel('favorites'));
 $('#recentSearches').addEventListener('click',e=>{const b=e.target.closest('[data-recent]');if(b){restoreFilters({...filters,query:library.read().recent[Number(b.dataset.recent)]});$('#recentPanel').open=false;}});
 $('#savedConditions').addEventListener('click',e=>{const b=e.target.closest('[data-condition]'),remove=e.target.closest('[data-remove-condition]');if(b){restoredCondition=true;restoreFilters(AquaCatalog.filtersFromSearch(library.read().saved[Number(b.dataset.condition)].search));}if(remove){library.removeCondition(Number(remove.dataset.removeCondition));renderLibrary();}});
 $('#rangeRecovery').addEventListener('click',e=>{const b=e.target.closest('[data-result-scope]');if(b)restoreFilters(scopeBase(b.dataset.resultScope));});
 $('#comparisonEntry').addEventListener('click',e=>{const b=e.target.closest('[data-compare-entry]');if(!b)return;filters.compareAcross=true;render(false);const target=b.dataset.compareEntry==='none'?$('#sellerComparisons'):$('#exact-comparison-'+b.dataset.compareEntry);target?.scrollIntoView({block:'nearest'});});
 $('#resultTable').addEventListener('click',e=>{if(e.target.closest('[data-table-price]')){filters.sort=filters.sort==='low'?'high':'low';render(false);}else favoriteClick(e);});
 $('#search').addEventListener('submit',()=>{if(!composing&&!compositionEnter){restoredCondition=false;renderWorkspaceUI();}});

 render(false);
}
// UX5: presentation-only panels keep the existing query and local-library schema.
function openUX5Panel(kind){
 const dialog=$('#ux5Dialog');if(!dialog||dialog.open)return;
 const node=$({filters:'#moreFilters',favorites:'#personalLibrary',saved:'#savedPanel'}[kind]);
 ux5PanelState={kind,original:{...filters},draft:draftQuery,focus:document.activeElement,y:scrollY,node,fields:{}};ux5PanelEditing=true;
 history.pushState({aquaPanel:kind},'',location.href);
 $('#ux5PanelBody').append(node);node.open=true;
 $('#ux5PanelTitle').textContent={filters:'상세 필터',favorites:'관심상품',saved:'저장한 검색 조건'}[kind];
 $('#ux5PanelHint').textContent=kind==='filters'?'조건을 고른 뒤 적용하세요. 닫기·뒤로가기는 변경을 취소합니다.':'이 브라우저에만 저장됩니다. 상품이나 조건을 선택하면 검색 결과로 이동합니다.';
 $('#ux5PanelFooter').hidden=kind!=='filters';$('#ux5Close').setAttribute('aria-label',kind==='filters'?'변경 취소하고 닫기':'닫고 원래 결과로 돌아가기');
 document.body.classList.add('panel-open');dialog.showModal();$('#ux5Close').focus();
 $('#toggleFilters').setAttribute('aria-expanded',String(kind==='filters'));$('#openFavorites').setAttribute('aria-expanded',String(kind==='favorites'));
}
function finishUX5Panel(commit){
 if(!ux5PanelState||ux5PanelState.pending)return;
 ux5PanelState.pending={commit,filters:{...(commit?filters:ux5PanelState.original)}};
 history.back();
}
if($('#ux5Dialog')){
 const parking=$('#ux5Parking'),dialog=$('#ux5Dialog');
 const quick=document.createElement('div');quick.id='quickConditions';quick.className='quick-conditions';$('.filter-selects').before(quick);
 quick.append($('#livestockFilters'));
 const directCategories=document.createElement('details');directCategories.id='quickCategories';directCategories.hidden=true;directCategories.setAttribute('aria-label','생물 분류 선택');
 const categorySummary=document.createElement('summary');categorySummary.id='quickCategorySummary';directCategories.append(categorySummary);quick.after(directCategories);
 let directCategoryContext=null;
 document.querySelectorAll('[data-subtype]').forEach(button=>button.addEventListener('click',()=>{if(!directCategories.hidden)directCategories.open=true;}));
 $('#groupTree').addEventListener('click',event=>{if(!directCategories.hidden&&event.target.closest('[data-live-group]')){directCategories.open=false;categorySummary.focus({preventScroll:true});}});

 const browseDetails=$('#fishFilters').closest('.browse-details');

 const roles=document.createElement('div');roles.id='quickRoles';roles.className='pills';roles.setAttribute('role','group');roles.setAttribute('aria-label','용품 구성');
 roles.innerHTML=Object.entries({all:'모든 구성',body:'본체만',part:'부품',consumable:'소모품',set:'세트'}).map(([key,label])=>'<button type="button" data-quick-role="'+key+'">'+label+'</button>').join('');quick.append(roles);
 roles.addEventListener('click',e=>{const b=e.target.closest('[data-quick-role]');if(b){filters.productRole=b.dataset.quickRole;render();}});
 $('#paginationStatus').after($('#dataStatus'));
 const results=$('.results-head'),tools=document.createElement('div');tools.className='result-tools';tools.append($('#sort').closest('.control'),$('#resultView').closest('label'));results.append(tools);
 const load=document.createElement('button');load.id='loadConditions';load.type='button';load.textContent='조건 불러오기';$('#saveCondition').after(load);load.addEventListener('click',()=>openUX5Panel('saved'));
 const compare=document.createElement('button');compare.id='compareProducts';compare.type='button';compare.textContent='같은 제품 판매처 비교';results.append(compare);compare.addEventListener('click',()=>{filters.compareAcross=!filters.compareAcross;render(false);});
 $('#compareAcross').closest('label').hidden=true;
 const pricePanel=$('#shoppingFilters').closest('details');pricePanel.open=true;$('#moreFilters').prepend(pricePanel);
 for(const n of [$('#moreFilters'),$('#personalLibrary'),$('#savedPanel')]){parking.append(n);n.open=false;}
 $('#query').placeholder='예: 네온테트라 · 외부여과기';
 $('#ux5Close').addEventListener('click',()=>finishUX5Panel(false));dialog.addEventListener('cancel',e=>{e.preventDefault();finishUX5Panel(false);});
 $('#ux5Reset').addEventListener('click',()=>{ux5PanelState.fields={};restoreFilters({...AquaCatalog.defaultFilters,type:filters.type,query:filters.query,sort:filters.sort});});
 dialog.addEventListener('input',captureUX5Field,true);dialog.addEventListener('change',captureUX5Field,true);
 function captureUX5Field(event){const el=event.target;if(ux5PanelState?.kind==='filters'&&el.id&&el.matches('input,select'))ux5PanelState.fields[el.id]={value:el.value,checked:el.checked};}
 $('#ux5Apply').addEventListener('click',()=>{
  const special=Object.fromEntries(Object.keys(AquaCatalog.specialDefaults).map(k=>[k,{value:$('#'+k).value,checked:$('#'+k).checked}]));
  if(!$('#shoppingFilters').reportValidity()||!$('#specialForm').reportValidity())return;
  $('#shoppingFilters').requestSubmit();if($('#filterError').textContent||$('#quantityError').textContent)return;
  for(const [k,v]of Object.entries(special)){const el=$('#'+k);el.value=v.value;el.checked=v.checked;}
  $('#specialForm').requestSubmit();if($('#specialError').textContent)return;finishUX5Panel(true);
 });
 // Local draft changes never enter URL/history until Apply. Browser Back cancels.
 addEventListener('popstate',()=>{
  if(!ux5PanelState)return;
  const state=ux5PanelState,pending=state.pending||{commit:false,filters:state.original};ux5PanelState=null;
  dialog.close();state.node.open=false;parking.append(state.node);document.body.classList.remove('panel-open');ux5PanelEditing=false;
  restoreFilters(pending.filters);if(!pending.commit||state.kind==='filters'){draftQuery=state.draft;$('#query').value=draftQuery;draftStatus();}state.focus?.focus({preventScroll:true});
  if(pending.commit&&state.kind==='filters')results.scrollIntoView({block:'start'});else scrollTo({top:state.y,behavior:'instant'});
 });
 $('#favorites').addEventListener('click',e=>{if(e.target.closest('[data-open-favorite]'))setTimeout(()=>finishUX5Panel(true),0);});
 $('#savedConditions').addEventListener('click',e=>{if(e.target.closest('[data-condition]'))finishUX5Panel(true);});
 for(const host of [$('#grid'),$('#sellerComparisons')]){
  host.addEventListener('click',e=>{const title=e.target.closest('h3[data-full-name]');if(title){const expanded=title.getAttribute('aria-expanded')==='true';title.setAttribute('aria-expanded',String(!expanded));title.classList.toggle('full-name',!expanded);}});
  host.addEventListener('keydown',e=>{if(e.target.matches('h3[data-full-name]')&&['Enter',' '].includes(e.key)){e.preventDefault();e.target.click();}});
 }
 const previousWorkspace=renderWorkspaceUI;
 renderWorkspaceUI=function(){
  previousWorkspace();
  if(ux5PanelState?.kind==='filters')for(const [id,value]of Object.entries(ux5PanelState.fields)){const el=$('#'+id);if(el&&!el.closest('label')?.hidden){el.value=value.value;el.checked=value.checked;}}
  if(filters.query&&!$('#scopeStatus').textContent.startsWith('저장 조건'))$('#scopeStatus').textContent='';
  const direct=filters.type==='live'&&['fish','shrimp'].includes(filters.subtype);
  const target=direct?directCategories:browseDetails;
  if($('#fishFilters').parentElement!==target){if(direct)target.append($('#fishFilters'));else target.prepend($('#fishFilters'));}
  if(direct){
   const leaf=filters.subtype==='fish'?filters.fishGroup:filters.liveGroup,browse=filters.browseGroup||'all',key=filters.subtype+':'+leaf+':'+browse;
   if(key!==directCategoryContext)directCategories.open=leaf==='all'&&browse==='all';
   directCategoryContext=key;
   const label=leaf!=='all'?AquaCatalog.livestockGroups[filters.subtype][leaf]:AquaCatalog.livestockNavigation[filters.subtype]?.find(group=>group.key===browse)?.label||'전체';
   categorySummary.textContent=subtypeNames[filters.subtype]+' 분류 · '+label+' (선택·변경)';
  }else directCategoryContext=null;
  directCategories.hidden=!direct;browseDetails.hidden=direct;
  $('#quickRoles').hidden=filters.type!=='gear';$('#livestockFilters').hidden=filters.type!=='live';
  roles.querySelectorAll('button').forEach(b=>{b.classList.toggle('active',b.dataset.quickRole===filters.productRole);b.setAttribute('aria-pressed',String(b.dataset.quickRole===filters.productRole));});
  const count=[...$('#activeFilters').querySelectorAll('[data-clear-filter]')].filter(b=>!['query','sort','compareAcross'].includes(b.dataset.clearFilter)).length;
  $('#toggleFilters').textContent='필터'+(count?' '+count:'');$('#toggleFilters').setAttribute('aria-expanded',String(ux5PanelState?.kind==='filters'));
  $('#openFavorites').textContent=(library.read().favorites.length?'♥':'♡')+' 관심상품 '+library.read().favorites.length;
  $('#compareProducts').setAttribute('aria-pressed',String(filters.compareAcross));
  $('#compareProducts').hidden=catalog.status!=='ready';
  if(filters.compareAcross&&!AquaCatalog.compareSellers(catalogQuery.view(filters).result.rows).length){$('#sellerComparisons').innerHTML='<p>동일 규격·구성이 확인된 판매처 조합이 없습니다. 조건이 불명확한 상품은 합치지 않습니다.</p><button type="button" id="leaveComparison">일반 검색 계속 보기</button>';$('#leaveComparison').addEventListener('click',()=>{filters.compareAcross=false;render(false);});}
  document.querySelectorAll('#grid .body>h3').forEach(h=>{h.dataset.fullName='true';h.tabIndex=0;h.setAttribute('role','button');h.setAttribute('aria-expanded',String(h.classList.contains('full-name')));h.setAttribute('aria-label',h.textContent+' · 전체 상품명 펼치기');});
  document.querySelectorAll('.offer').forEach(o=>{
   const seller=o.querySelector(':scope>.seller-label'),observed=o.querySelector(':scope>.observed');if(seller&&observed)observed.before(seller);
   o.querySelectorAll('[data-favorite]').forEach(b=>{b.setAttribute('aria-label',b.getAttribute('aria-pressed')==='true'?'관심상품 해제':'관심상품 저장');b.textContent=b.getAttribute('aria-pressed')==='true'?'♥':'♡';});
   const stock=o.querySelector(':scope>.stock-unknown');if(stock&&stock.textContent.includes('미확인'))stock.textContent='재고 미확인';
  });
  const table=$('#resultTable');if(!table.hidden){
   table.querySelector('.table-caption').textContent='검색 결과 표 · 서로 다른 상품을 나란히 보는 탐색 화면입니다.';
   const list=document.createElement('div');list.className='mobile-result-list';
   table.querySelectorAll('tbody tr').forEach(tr=>{const cells=tr.cells,row=document.createElement('article');row.className='mobile-result-row';
    row.innerHTML='<div class="mobile-row-main"><strong>'+cells[0].querySelector('strong').innerHTML+'</strong><span class="mobile-price">'+cells[3].innerHTML+'</span></div><details><summary>규격·판매처·배송·확인 정보</summary>'+[1,2,4,5,6].map((i)=>'<p><b>'+['','규격·수량','판매처','','단가','배송비','확인 시점'][i]+'</b> '+cells[i].innerHTML+'</p>').join('')+cells[0].querySelector('details').innerHTML.replace(/<summary>.*?<\/summary>/,'')+cells[7].innerHTML+'</details>';list.append(row);});table.append(list);
   table.querySelectorAll('[data-favorite]').forEach(b=>b.setAttribute('aria-label',b.getAttribute('aria-pressed')==='true'?'관심상품 해제':'관심상품 저장'));
  }
  const result=catalogQuery.view(filters).result;
  if(!result.rows.length&&catalog.status==='ready'){
   const empty=$('#grid .empty');if(empty){const needs=result.unitState?.needsSelection;empty.innerHTML='<strong>'+(needs?'단가 비교 범위를 선택해 주세요':'현재 조건에 맞는 상품이 없습니다')+'</strong><p>'+escapeHtml(needs?'위에서 비교할 용도·단위를 고르세요.':Object.entries(chipLabels()).filter(([k,v])=>v&&k!=='sort'&&filters[k]!==AquaCatalog.defaultFilters[k]).map(([,v])=>v).join(' · ')||'선택 범위의 공개 상품 없음')+'</p>';}
   $('#clearQuery').classList.toggle('primary-recovery',!!filters.query);$('#resetFilters').classList.toggle('primary-recovery',!filters.query);
  }
 };
 render(false);
}
