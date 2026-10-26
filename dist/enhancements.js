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
  const e=AquaCatalog.estimatePurchase(p,filters.wantedQty,p.shippingPolicy);const partial=AquaCatalog.knownShipping(p,e.subtotal);
  if(e.subtotal===undefined)return '<p class="estimate">'+escapeHtml(e.reason)+'</p>';
  return '<div class="estimate">희망 '+e.wanted+e.unit+' → '+e.packs+'묶음 · 실제 '+e.actual+e.unit+'<br>예상 상품금액 '+money(e.subtotal)+'원'+(!e.minimumConfirmed?'<br>최소 주문 조건 별도 확인':'')+(e.total===null?(partial?'<br>상품+기본배송 '+money(partial.knownSubtotal)+'원 · 지역·포장비 미확인':'<br>배송 포함 합계 미확인'):'<br>배송 '+money(e.shipping)+'원 + 포장 '+money(e.packaging)+'원 = 예상 합계 '+money(e.total)+'원')+'</div>';
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
  if(!rows.length&&catalog.status==='ready')$('#grid').innerHTML='<div class="empty"><strong>'+(selected.unitState?.needsSelection?'단가 범위 선택 필요':'현재 조건에서 확인된 상품이 없습니다.')+'</strong>'+escapeHtml(selected.reason)+'</div>';
  const matches=filters.compareAcross?AquaCatalog.compareSellers(rows):[];
  $('#sellerComparisons').hidden=!filters.compareAcross;
  $('#sellerComparisons').innerHTML=filters.compareAcross?(matches.length?matches.map(g=>'<details class="seller-comparison" open><summary>'+escapeHtml(g.label)+' · '+new Set(g.offers.map(p=>p.sellerId)).size+'개 판매처</summary><p>'+escapeHtml(g.basis)+' · 상품금액 기준. 배송 포함 최저가를 뜻하지 않습니다.</p>'+g.offers.map(p=>'<div class="comparison-offer"><strong>'+escapeHtml(AquaCatalog.sellerDisplay(catalogQuery.seller(p.sellerId)))+'</strong>'+offerHTML(p)+'</div>').join('')+'</details>').join(''):'<p>동일 조건이 확인된 판매처 조합이 없습니다. 브랜드·모델·구성 또는 생물의 품종·크기·성별·등급·수량이 불명확하면 묶지 않습니다.</p>'):'';
  if(catalog.status!=="ready")$("#resultTitle").textContent=catalog.status==="pending"?"데이터 불러오는 중":"데이터 불러오기 실패";
  renderLibrary();if(typeof renderAdvancedUI==="function")renderAdvancedUI();
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

var renderAdvancedUI;
if($('#productRole')){
 const observations=AquaCatalog.createWatchStore(libraryStorage);let qualityCatalog=null,quality=[],observedCatalog=null,returnRestored=false;
 const specialLabels={careTemp:'수온 °C',carePH:'pH',adultMax:'성어 크기 상한 cm',tankLength:'수조 길이 cm',careDifficulty:'관리 조건',filterMethod:'여과 방식',tankLitres:'제조사 수조 L',flowMin:'유량 최솟값 L/h',wattMax:'소비전력 상한 W',hose:'호스',feedTarget:'사료 대상',feedBuoyancy:'사료 형태',particleMax:'입자 상한 mm',mediaPurpose:'여과재 용도',mediaMaterial:'여과재 재질',volumeMin:'용량 최솟값 mL',massMin:'중량 최솟값 g',includeUnknownGuidance:'조건 미확인 제외'};
 const oldChips=chipLabels;chipLabels=function(){const labels=oldChips();for(const k of Object.keys(AquaCatalog.specialDefaults)){if(filters[k]===AquaCatalog.specialDefaults[k]||filters[k]===undefined)continue;labels[k]=specialLabels[k]+(typeof filters[k]==='boolean'?'':' '+($('#'+k)?.selectedOptions?.[0]?.textContent||filters[k]));}return labels;};
 function guidanceHTML(p){const c=AquaCatalog.careProfile(p),e=AquaCatalog.equipmentFacts(p),r=e.reference;let h='';if(c)h+='<p>'+escapeHtml(c.label+' · '+c.id+' · '+c.temperature.join('~')+'°C · pH '+c.ph.join('~')+' · '+c.compatibility)+'</p><a href="'+escapeHtml(c.sourceUrl)+'" target="_blank" rel="noopener">사육 출처</a>';else if(p.type==='live')h+='<p>학명 동정 근거 미확인 · 사육 조건 자동 연결 보류. 필터의 대표 종 참고 자료를 확인하세요.</p>';if(r)h+='<p>'+escapeHtml(r.label+' · '+(r.region?r.region+' '+r.frequencyHz+'Hz 참고: '+r.tankLitres.join('~')+'L, '+r.flowLph+'L/h, '+r.watts+'W, '+r.hose+'mm · ':'')+r.caveat)+'</p><a href="'+escapeHtml(r.sourceUrl)+'" target="_blank" rel="noopener">제조사 출처 · '+AquaCatalog.guidance.checkedAt+' 확인</a>';return h;}
 const oldOffer=offerHTML;offerHTML=function(p){const role=AquaCatalog.productRole(p),shipping=AquaCatalog.knownShipping(p,p.price?.amount),review=p.reviewEvidence;
  let h=oldOffer(p);h=h.replace('<div class="offer-spec">',(p.type==='gear'?'<span class="role-tag" title="'+escapeHtml(role.basis)+'">'+role.label+'</span>':'')+'<div class="offer-spec">');
  h=h.replace('<div class="shipping">'+(p.shipping===null?'배송비 미확인':('배송비 '+money(p.shipping.amount)+'원 표시'))+'</div>','<div class="shipping">'+(shipping?'기본 배송 '+money(shipping.shipping)+'원 · 상품+기본배송 '+money(shipping.knownSubtotal)+'원<br><small>지역·포장 추가금 미확인 · 결제 총액 아님</small>':p.shippingPolicy?'배송 조건 확인 후 7일 경과 또는 근거 부족 · 재확인 필요':'배송비 미확인')+'</div>');
  const stock=p.stockObservedAt?('재고 '+formatTime(p.stockObservedAt)+' 확인 · '+(p.available===true?'당시 판매 가능':'미확인')):'재고 확인 시각 미확인';
  h=h.replace(/<div class="stock-unknown">.*?<\/div>/,'<div class="stock-unknown">'+escapeHtml(stock)+'</div>');
  const extra=guidanceHTML(p)+'<p><a href="'+escapeHtml(review?.url||p.sourceUrl)+'" target="_blank" rel="noopener">'+(review?'원본 후기'+(review.count===null?'':' '+review.count+'개'):'원본에서 후기 확인')+'</a>'+(review?' · '+escapeHtml(formatTime(review.checkedAt))+' 확인 · 평점·구매 인증 미확인':' · 후기 수·위치 미확인')+'</p><fieldset class="watch-controls"><legend>관심상품 관찰 (사이트 열 때만)</legend><label>목표 판매가격 이하 (원)<input data-watch-price="'+escapeHtml(p.id)+'" type="number" min="0" step="1" inputmode="numeric"></label><label><input type="checkbox" data-watch-restock="'+escapeHtml(p.id)+'">확인된 품절 후 재입고 관찰</label><button type="button" data-watch-save="'+escapeHtml(p.id)+'">관찰 저장</button></fieldset><fieldset class="report-controls"><legend>오류 신고 초안 · 운영자 미접수</legend><select data-report-kind="'+escapeHtml(p.id)+'" aria-label="오류 유형"><option value="price">가격이 달라요</option><option value="stock">품절이에요</option><option value="identity">다른 상품이에요</option><option value="link">링크가 안 열려요</option></select><button type="button" data-report-save="'+escapeHtml(p.id)+'">내 브라우저에 초안 저장</button></fieldset>';
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
