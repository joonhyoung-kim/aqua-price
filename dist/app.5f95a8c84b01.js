'use strict';
const $ = selector => document.querySelector(selector);
let filters = AquaCatalog.filtersFromSearch(typeof location === 'object' ? location.search : '');
let catalog = { schemaVersion: 1, status: 'pending', reason: '검증된 판매처 데이터를 불러오는 중입니다.', asOf: null, sellers: [], products: [] };
const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const formatTime = value => value === null ? '미확인' : new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) + ' KST';
const priceText = value => value === null ? '미확인' : value.amount.toLocaleString('ko-KR') + ' 원';
const PAGE_SIZE = 24;
let visibleLimit = PAGE_SIZE;
const subtypeNames = { all: '전체', fish: '물고기', shrimp: '새우', aquatic_plant: '수초', snail: '달팽이' };
let expandedBrowse = null;
let expandedGear = null;
let catalogQuery=AquaCatalog.createCatalogQuery(catalog);
catalog=catalogQuery.catalog;
let draftQuery=filters.query;
let composing=false,compositionEnter=false;
let lastGridHTML=null,lastTreeHTML=null,historyReady=false,restoringHistory=false;
function draftStatus(){const changed=draftQuery.trim()!==filters.query;$('#draftStatus').hidden=!changed;$('#draftStatus').textContent=changed?'입력 중 · 검색 버튼 또는 Enter로 검색하세요. 현재 결과는 이전 검색 조건입니다.':'';}
function money(amount){return amount.toLocaleString('ko-KR',{maximumFractionDigits:2});}
function displayName(product){return product.name;}
function offerHTML(product){
  const status=AquaCatalog.comparisonStatus(product),unit=AquaCatalog.unitPrice(product),age=AquaCatalog.observationAge(product);
  const spec=product.spec.replace(/^판매단위\/옵션:\s*/, '');
  const price=status.comparable?(product.price.amount===0?status.label:money(product.price.amount)+' 원'):status.label;
  const detail=spec&&!/^(?:미확인|Retailer concrete offer)$/i.test(spec)?spec:'옵션·수량 미확인';
  return '<div class="offer" data-offer-id="'+escapeHtml(product.id)+'"><div class="offer-spec">'+escapeHtml(detail)+'</div><div class="price">'+escapeHtml(price)+'</div>'+(!status.comparable&&product.price?.amount>0?'<div class="price-note">표시가격 '+money(product.price.amount)+'원 · 기본 비교 제외</div>':'')+(unit?'<div class="unit-price">총 '+unit.count+unit.unit+' · '+unit.unit+'당 '+money(unit.amount)+'원</div>':'')+'<div class="shipping">'+(product.shipping===null?'배송비 미확인 · 판매처 확인':product.shipping.amount===0?'배송비 0원 확인 · 적용 조건은 판매처 확인':'배송비 '+money(product.shipping.amount)+'원 · 적용 조건은 판매처 확인')+'</div><div class="observed'+(age.stale?' stale':'')+'"><time datetime="'+escapeHtml(product.observedAt)+'">가격 확인 '+escapeHtml(new Date(product.observedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}))+' KST</time>'+(age.stale?'<span>'+age.days+'일 경과 · 가격·재고 재확인</span>':'')+'</div>'+(product.available===null?'<div class="stock-unknown">재고 미확인</div>':'')+'<a class="source" href="'+escapeHtml(product.sourceUrl)+'" target="_blank" rel="noopener noreferrer">판매처에서 보기 ↗</a></div>';
}
function setGridHTML(html){
  if(html===lastGridHTML)return false;
  $('#grid').innerHTML=html;
  lastGridHTML=html;
  return true;
}
function renderGearNavigation(view){
  const counts=view.gearCounts,category=filters.gearCategory||'all',leaf=filters.gearGroup||'all';
  const navigation=AquaCatalog.gearNavigation,parent=AquaCatalog.gearParent(leaf);
  if(expandedGear===null)expandedGear=parent?.key||(category!=='all'&&category!=='other'?category:'');
  $('#groupPath').textContent='용품'+(category!=='all'?' › '+AquaCatalog.gearCategories[category]:' › 전체')+(leaf!=='all'&&leaf!=='other'?' › '+AquaCatalog.gearGroups[leaf]:'');
  const choice=(key,label,count,major='all')=>`<button type="button" class="group-choice" data-gear-group="${key}" data-gear-category="${major}" aria-pressed="${(leaf===key||key==='other')&&category===major}"><span>${escapeHtml(label)}</span><span class="group-count">${count}개</span></button>`;
  const treeHTML=choice('all','용품 전체',counts.all)+navigation.map(group=>{
    const keys=Object.keys(group.children).filter(key=>counts.groups[key]>0||key===leaf),count=counts.categories[group.key];
    if(!keys.length&&category!==group.key)return '';
    const open=expandedGear===group.key,id='gear-panel-'+group.key;
    return `<div class="browse-node"><button type="button" class="browse-toggle" id="gear-toggle-${group.key}" data-gear-browse="${group.key}" aria-expanded="${open}" aria-controls="${id}"><span>${escapeHtml(group.label)}</span><span class="group-count">${count}개 <span aria-hidden="true">${open?'−':'+'}</span></span></button><div class="group-children" id="${id}" role="group" aria-labelledby="gear-toggle-${group.key}"${open?'':' hidden'}>${choice('all','이 분류 전체',count,group.key)}${keys.map(key=>choice(key,group.children[key],counts.groups[key],group.key)).join('')}</div></div>`;
  }).join('')+(counts.categories.other>0||category==='other'?choice('other','기타·미분류',counts.categories.other,'other'):'');
  if(treeHTML!==lastTreeHTML){$('#groupTree').innerHTML=treeHTML;lastTreeHTML=treeHTML;}
}
function renderGroupNavigation(view=catalogQuery.view(filters)) {
  if(filters.type==='all'){$('#groupPath').textContent='전체 범위 · 생물 또는 용품을 선택해 세부 분류를 좁힐 수 있습니다.';$('#groupTree').innerHTML='';lastTreeHTML=null;return;}
  if(filters.type==='gear'){renderGearNavigation(view);return;}
  const groups=AquaCatalog.livestockGroups[filters.subtype]||{all:'전체'},leaf=filters.subtype==='fish'?filters.fishGroup:filters.liveGroup;
  const counts=view.groupCounts;
  const navigation=AquaCatalog.livestockNavigation[filters.subtype]||[],parent=AquaCatalog.navigationParent(filters.subtype,leaf);
  if(expandedBrowse===null||expandedBrowse&&!navigation.some(group=>group.key===expandedBrowse))expandedBrowse=parent?.key||(filters.browseGroup!=='all'?filters.browseGroup:'');
  const selectedBrowse=navigation.find(group=>group.key===filters.browseGroup);
  $('#groupPath').textContent='생물 › '+subtypeNames[filters.subtype]+(leaf&&leaf!=='all'?(parent?' › '+parent.label:'')+' › '+groups[leaf]:selectedBrowse?' › '+selectedBrowse.label+' › 그룹 전체':' › 전체');
  const choice=(key,label,count,browse='all')=>`<button type="button" class="group-choice" data-live-group="${key}" data-browse-filter="${browse}" aria-pressed="${leaf===key&&(filters.browseGroup||'all')===browse}"><span>${escapeHtml(label)}</span><span class="group-count">${count}개</span></button>`;
  // Fish and shrimp expose their actual categories immediately, without another panel.
  if(['fish','shrimp'].includes(filters.subtype)){
    const keys=Object.keys(groups).filter(key=>key!=='all'&&(counts[key]>0||key===leaf));
    const treeHTML=choice('all',subtypeNames[filters.subtype]+' 전체',counts.all)+
      (selectedBrowse&&leaf==='all'?choice('all',selectedBrowse.label+' 전체',selectedBrowse.children.reduce((n,key)=>n+(counts[key]||0),0),selectedBrowse.key):'')+
      keys.map(key=>choice(key,groups[key],counts[key]||0)).join('');
    if(treeHTML!==lastTreeHTML){$('#groupTree').innerHTML=treeHTML;lastTreeHTML=treeHTML;}
    return;
  }
  const treeHTML=choice('all',subtypeNames[filters.subtype]+' 전체',counts.all)+navigation.map(group=>{
    const keys=group.children.filter(key=>counts[key]>0||key===leaf),count=group.children.reduce((sum,key)=>sum+(counts[key]||0),0);
    if(!keys.length&&filters.browseGroup!==group.key)return '';
    const open=expandedBrowse===group.key,id='group-panel-'+group.key;
    return `<div class="browse-node"><button type="button" class="browse-toggle" id="group-toggle-${group.key}" data-browse-group="${group.key}" aria-expanded="${open}" aria-controls="${id}"><span>${escapeHtml(group.label)}</span><span class="group-count">${count}개 <span aria-hidden="true">${open?'−':'+'}</span></span></button><div class="group-children" id="${id}" role="group" aria-labelledby="group-toggle-${group.key}"${open?'':' hidden'}>${choice('all','이 그룹 전체',count,group.key)}${keys.map(key=>choice(key,groups[key],counts[key]||0)).join('')}</div></div>`;
  }).join('')+(counts.other>0||leaf==='other'?choice('other',groups.other,counts.other||0):'');
  if(treeHTML!==lastTreeHTML){$('#groupTree').innerHTML=treeHTML;lastTreeHTML=treeHTML;}
}
function syncSubtypeControls(view) {
  document.querySelectorAll('[data-type]').forEach(button => { const active = button.dataset.type === filters.type; button.classList.toggle('active', active); button.setAttribute('aria-pressed', active); button.querySelector('.check').textContent = active ? '✓' : ''; });
  $('#fishFilters').hidden = filters.type === 'all' || filters.type === 'live' && filters.subtype === 'all';
  $('#groupTree').setAttribute('aria-label',filters.type==='gear'?'용품 세부 종류 탐색':'생물 세부 종류 탐색');
  renderGroupNavigation(view);
  $('#livestockFilters').hidden = filters.type !== 'live';
  document.querySelectorAll('[data-subtype]').forEach(button => { const active = button.dataset.subtype === filters.subtype; button.classList.toggle('active', active); button.setAttribute('aria-pressed', active); });
}

function cardGroups(rows){
  if(filters.groupOptions===false)return rows.map(p=>({key:p.id,offers:[p]}));
  const grouped=AquaCatalog.groupOffers(rows.filter(p=>p.type!=='live')),byId=new Map(),seen=new Set();
  for(const g of grouped)for(const p of g.offers)byId.set(p.id,g);
  return rows.flatMap(p=>{if(p.type==='live')return [{key:p.id,offers:[p]}];const g=byId.get(p.id);if(seen.has(g))return [];seen.add(g);return [g];});
}
function render(resetPage = true) {
  if(resetPage){$('#recoveryStatus').textContent='';$('#filterError').textContent='';}
  const view=catalogQuery.view(filters);
  if (resetPage) visibleLimit = PAGE_SIZE;
  if(catalog.status==='ready'&&typeof history==='object'&&typeof location==='object'&&!(typeof ux5PanelEditing!=='undefined'&&ux5PanelEditing)){
    const url=new URL(location.href);const nextSearch=AquaCatalog.filtersToSearch(filters,url.search);const changed=nextSearch!==url.search;url.search=nextSearch;const method=historyReady&&!restoringHistory&&changed&&history.pushState?'pushState':'replaceState';history[method](null,'',url.pathname+url.search+url.hash);historyReady=true;
  }
  $('#sort').value = filters.sort;
  $('#period').value = String(filters.days);
  $('#comparison').value=filters.comparison??'priced';$('#observedDays').value=String(filters.observedDays??'all');$('#minPrice').value=filters.minPrice??'';$('#maxPrice').value=filters.maxPrice??'';$('#groupOptions').checked=filters.groupOptions!==false;
  const selectedSeller=filters.seller||'';
  $('#seller').innerHTML='<option value="">모든 판매처</option>'+catalog.sellers.filter(s=>catalog.products.some(p=>p.sellerId===s.id)).map(s=>'<option value="'+escapeHtml(s.id)+'">'+escapeHtml(AquaCatalog.sellerDisplay(s))+'</option>').join('')+(selectedSeller&&!catalog.sellers.some(s=>s.id===selectedSeller)?'<option value="'+escapeHtml(selectedSeller)+'">현재 상품 없는 판매처</option>':'');$('#seller').value=selectedSeller;
  $('#advancedMetrics').hidden=!catalog.products.some(p=>p.registeredAt!==null||p.cumulativeSales!==null||p.periodSales!==null)&&filters.days==='all'&&!['sales','new'].includes(filters.sort);
  draftStatus();
  syncSubtypeControls(view);
  const availability = view.availability;
  for (const [value, label] of [['sales', '판매순'], ['new', '신상품순']]) { const option = $('#sort').querySelector(`option[value="${value}"]`); option.disabled = !availability[value].available; option.hidden=option.disabled&&filters.sort!==value; option.textContent = label + (option.disabled ? ' (미확인)' : ''); }
  $('#sortStatus').hidden = catalog.status !== 'ready' || !['sales','new','observed'].includes(filters.sort);
  $('#sortStatus').textContent = filters.sort==='observed'?'최근 확인순은 개별 가격 확인 시각 기준입니다. 판매처 등록일·최초 수집일이 아닙니다.':['sales','new'].includes(filters.sort)?(availability[filters.sort].reason||'현재 조회 조건의 확인된 자료 기준입니다.'):'';
  $('#includeUnknown').disabled = filters.days === 'all';
  const result = view.result;
  const groups=cardGroups(result.rows);
  const visibleGroups=groups.slice(0,visibleLimit),visibleRows=visibleGroups.flatMap(g=>g.offers);
  $('#emptyActions').hidden=result.rows.length>0||catalog.status!=='ready';
  $('#paginationStatus').textContent = result.rows.length ? (filters.groupOptions===false?`조회 ${result.rows.length}개 중 ${visibleRows.length}개 표시`:`옵션 ${result.rows.length}개 · 상품 ${visibleGroups.length}/${groups.length}개 표시`) : '';
  $('#moreResults').hidden = visibleGroups.length >= groups.length;
  $('#moreResults').textContent = `상품 ${Math.min(PAGE_SIZE, groups.length - visibleGroups.length)}개 더 보기`;
  const selectedGroup=filters.subtype==='fish'?filters.fishGroup:filters.liveGroup,groupLabel=selectedGroup==='all'?AquaCatalog.livestockNavigation[filters.subtype]?.find(group=>group.key===filters.browseGroup)?.label:AquaCatalog.livestockGroups[filters.subtype]?.[selectedGroup];
  $('#resultTitle').textContent = `${filters.type === 'live' ? '생물 · ' + subtypeNames[filters.subtype]+(groupLabel?' · '+groupLabel:'') : '용품'+((filters.gearGroup||'all')!=='all'?' · '+AquaCatalog.gearGroups[filters.gearGroup]:(filters.gearCategory||'all')!=='all'?' · '+AquaCatalog.gearCategories[filters.gearCategory]:'')} ${result.rows.length}개`;
  $('#dataStatus').textContent = catalog.status === 'ready' ? '확인 상품 '+catalog.products.length.toLocaleString('ko-KR')+'개 · 가격·재고는 마지막 확인 기준' : catalog.reason;
  const exclusions = [result.excludedRegistration ? `등록일 미확인 ${result.excludedRegistration}개 제외` : '', (filters.sort === 'low' || filters.sort === 'high') && result.excludedPrice ? `가격 미확인 ${result.excludedPrice}개 제외` : '', result.excludedSales ? `${filters.days === 'all' ? '누적' : '선택 기간'} 판매량 미확인 ${result.excludedSales}개 제외` : ''].filter(Boolean);
  $('#hint').textContent = '총 판매금액 기준 · 배송비 별도 · 크기·수량·등급이 같은지 확인하세요.'+((filters.comparison??'priced')==='priced'&&result.excludedComparison?' · 매장·가격 확인 필요 '+result.excludedComparison+'개는 추가 필터에서 확인':'')+(filters.days!=='all'?' · 등록일 기간 조건 적용':'')+(exclusions.length?' · '+exclusions.join(' · '):'');
  if(catalog.status!=='ready'){setGridHTML('<div class="empty" role="status"><strong>'+(catalog.status==='pending'?'데이터 불러오는 중':'데이터 불러오기 실패')+'</strong>'+escapeHtml(catalog.reason)+'</div>');return;}
  if (!result.rows.length) {
    setGridHTML(`<div class="empty"><strong>확인 가능한 상품이 없어요</strong>${escapeHtml(result.reason)}<br>낮은·높은 가격순에서 검색어를 지우거나 필터를 초기화해 다시 찾아보세요.</div>`);
    return;
  }
  const gridHTML = visibleGroups.map(group => {
    const product=group.offers[0],seller=catalogQuery.seller(product.sellerId),photo=AquaCatalog.usablePhoto(product);
    return '<article class="card'+(product.type==='live'?' live-card':'')+'">'+(product.type==='live'?'<a class="card-product-link" href="'+escapeHtml(product.sourceUrl)+'" target="_blank" rel="noopener noreferrer" aria-label="'+escapeHtml(displayName(product)+' · '+AquaCatalog.offerSpec(product).replace(/^성별\s*[:：]\s*/,'').replace(/^옵션·수량 미확인$/,'')+' · '+AquaCatalog.sellerDisplay(seller)+' 상품 보기 (새 탭)')+'"></a>':'')+'<div class="art'+(photo?'':' no-photo')+'"'+(photo?'':' role="img" aria-label="상품 사진 없음"')+'>'+(photo?'<img src="'+escapeHtml(photo)+'" alt="'+escapeHtml(product.name)+' 상품 사진" loading="lazy" referrerpolicy="no-referrer"><span class="photo-fallback" hidden role="img" aria-label="상품 사진 없음"></span>':'사진 없음')+'</div><div class="body"><div class="category">'+escapeHtml(AquaCatalog.sellerDisplay(seller))+'</div><h3 title="'+escapeHtml(product.name)+'">'+escapeHtml(displayName(product))+'</h3>'+offerHTML(product)+(group.offers.length>1?'<details class="option-group"><summary>같은 상품의 다른 옵션 '+(group.offers.length-1)+'개</summary><p class="option-help">선택한 검색·가격 조건에 맞는 옵션입니다. 판매처에서 크기·수량을 다시 선택하세요.</p>'+group.offers.slice(1).map(p=>'<div class="option-name">'+escapeHtml(displayName(p))+'</div>'+offerHTML(p)).join('')+'</details>':'')+'</div></article>';
  }).join('');
  if(!setGridHTML(gridHTML))return;
  $('#grid').querySelectorAll('img').forEach(img => {
    const showFallback = () => { img.hidden = true; img.parentElement.querySelector('.photo-fallback').hidden = false; };
    img.addEventListener('error', showFallback);
    if (img.complete && img.naturalWidth === 0) showFallback();
  });
}
document.querySelectorAll('[data-type]').forEach(button => button.addEventListener('click', () => {
  filters.type = button.dataset.type;
  render();
}));
$('#sort').addEventListener('change', () => {
  filters.sort = $('#sort').value;
  render();
});
document.querySelectorAll('[data-subtype]').forEach(button => button.addEventListener('click', () => { filters.subtype = button.dataset.subtype; filters.liveGroup='all'; filters.fishGroup='all'; filters.browseGroup='all'; expandedBrowse=null; render(); }));
$('#groupTree').addEventListener('click',event=>{
  if(filters.type==='gear'){
    const toggle=event.target.closest('[data-gear-browse]'),choice=event.target.closest('[data-gear-group]');
    if(toggle){expandedGear=expandedGear===toggle.dataset.gearBrowse?'':toggle.dataset.gearBrowse;renderGroupNavigation();document.querySelector(`[data-gear-browse="${toggle.dataset.gearBrowse}"]`)?.focus?.({preventScroll:true});return;}
    if(!choice)return;
    filters.gearCategory=choice.dataset.gearCategory||'all';filters.gearGroup=choice.dataset.gearGroup||'all';
    expandedGear=['all','other'].includes(filters.gearCategory)?'':filters.gearCategory;
    render();document.querySelector(`[data-gear-group="${filters.gearGroup}"][data-gear-category="${filters.gearCategory}"]`)?.focus?.({preventScroll:true});return;
  }
  const toggle=event.target.closest('[data-browse-group]'),choice=event.target.closest('[data-live-group]');
  if(toggle){expandedBrowse=expandedBrowse===toggle.dataset.browseGroup?'':toggle.dataset.browseGroup;renderGroupNavigation();document.querySelector(`[data-browse-group="${toggle.dataset.browseGroup}"]`)?.focus?.({preventScroll:true});return;}
  if(!choice)return;
  const key=choice.dataset.liveGroup,browse=choice.dataset.browseFilter||'all';
  if(filters.subtype==='fish')filters.fishGroup=key;else filters.liveGroup=key;
  filters.browseGroup=browse;expandedBrowse=key==='all'?(browse==='all'?'':browse):AquaCatalog.navigationParent(filters.subtype,key)?.key||'';
  render();document.querySelector(`[data-live-group="${key}"][data-browse-filter="${browse}"]`)?.focus?.({preventScroll:true});
});
$('#period').addEventListener('change', () => { filters.days = $('#period').value === 'all' ? 'all' : Number($('#period').value); render(); });
$('#includeUnknown').addEventListener('change', () => { filters.includeUnknownRegistration = $('#includeUnknown').checked; render(); });
$('#moreResults').addEventListener('click', () => { visibleLimit += PAGE_SIZE; render(false); });
$('#query').addEventListener('input',event=>{
  draftQuery=event.target.value;draftStatus();
});
$('#query').addEventListener('compositionstart',()=>{
  composing=true;
  compositionEnter=false;
});
$('#query').addEventListener('compositionend',()=>{
  composing=false;
  draftQuery=$('#query').value;
});
$('#query').addEventListener('keydown',event=>{
  if(event.key==='Enter'||event.keyCode===229){
    compositionEnter=composing||event.isComposing===true||event.keyCode===229;
    if(compositionEnter&&event.key==='Enter')event.preventDefault();
  }else if(!composing&&event.isComposing!==true){
    compositionEnter=false;
  }
});
$('#query').addEventListener('keyup',event=>{
  if(event.key==='Enter'||event.keyCode===229)compositionEnter=false;
});
// A lost keyup must not suppress a later button click after focus leaves input.
$('#query').addEventListener('blur',()=>{
  composing=false;
  compositionEnter=false;
});
$('#search').addEventListener('submit',event=>{
  event.preventDefault();
  if(composing||compositionEnter||event.isComposing===true)return;
  draftQuery=$('#query').value;
  const nextQuery=draftQuery.trim();
  if(nextQuery===filters.query)return;
  filters.query=nextQuery;
  render();
});
$('#shoppingFilters').addEventListener('submit',event=>{
  event.preventDefault();const next={...filters,seller:$('#seller').value,comparison:$('#comparison').value,observedDays:$('#observedDays').value==='all'?'all':Number($('#observedDays').value)};
  if($('#wantedQty')){const raw=$('#wantedQty').value.trim();if(raw!==''&&(!/^\d+$/.test(raw)||Number(raw)<1||Number(raw)>100000)){$('#quantityError').textContent='희망 수량은 1~100000 정수로 입력하세요.';return;}next.wantedQty=raw===''?null:Number(raw);$('#quantityError').textContent='';}
  for(const key of ['minPrice','maxPrice']){const raw=$('#'+key).value.trim();if(raw!==''&&!/^\d+$/.test(raw)){$('#filterError').textContent='가격은 0 이상의 정수로 입력하세요.';return;}next[key]=raw===''?null:Number(raw);}
  try{catalogQuery.select(next);}catch{$('#filterError').textContent='최소·최대 가격 범위를 확인하세요.';return;}
  $('#filterError').textContent='';filters=next;render();
});
$('#observedDays').addEventListener('change',()=>{filters.observedDays=$('#observedDays').value==='all'?'all':Number($('#observedDays').value);render();});
$('#groupOptions').addEventListener('change',()=>{filters.groupOptions=$('#groupOptions').checked;render();});
$('#clearQuery').addEventListener('click',()=>{filters.query='';draftQuery='';$('#query').value='';render();});
$('#resetFilters').addEventListener('click',()=>{filters={...AquaCatalog.defaultFilters,type:filters.type,query:filters.query,sort:filters.sort};render();});
$('#searchAllTypes').addEventListener('click',()=>{filters={...AquaCatalog.defaultFilters,type:'all',query:filters.query};render();});
if(typeof addEventListener==='function')addEventListener('popstate',()=>{restoringHistory=true;filters=AquaCatalog.filtersFromSearch(location.search);draftQuery=filters.query;$('#query').value=draftQuery;$('#includeUnknown').checked=filters.includeUnknownRegistration;expandedBrowse=null;expandedGear=null;render();restoringHistory=false;});
$('#query').value = draftQuery;
$('#includeUnknown').checked = filters.includeUnknownRegistration;
render();
fetch('catalog.json?view='+Date.now(), { cache: 'no-store' }).then(response => {
  if (!response.ok) throw Error('data response ' + response.status);
  return response.json();
}).then(value => { catalogQuery=AquaCatalog.createCatalogQuery(value); catalog=catalogQuery.catalog; render(); }).catch(() => {
  catalogQuery=AquaCatalog.createCatalogQuery({ schemaVersion: 1, status: 'error', reason: '판매처 데이터 파일을 불러오거나 검증하지 못했습니다. 확인되지 않은 상품은 표시하지 않습니다.', asOf: null, sellers: [], products: [] });
  catalog=catalogQuery.catalog;
  render();
});
if (document.modelContext?.registerTool) {
  try { Promise.resolve(document.modelContext.registerTool({
    name: 'set_product_filters', description: '검증된 관찰 상품의 종류·정렬·실제 등록 기간·검색어를 변경합니다. 데이터가 없거나 미확인이면 결과가 비어 있습니다.',
    inputSchema: { type: 'object', properties: { productRole:{enum:Object.keys(AquaCatalog.roleLabels)},...Object.fromEntries(Object.entries(AquaCatalog.specialDefaults).map(([k,v])=>[k,AquaCatalog.specialEnums[k]?{enum:AquaCatalog.specialEnums[k]}:typeof v==='boolean'?{type:'boolean'}:{type:['number','null'],minimum:0,maximum:1000000}])),unitScope:{type: 'string'},wantedQty:{type:['integer','null'],minimum:1,maximum:100000},compareAcross:{type:'boolean'},comparison:{enum:['priced','all','unpriced']},seller:{type:'string'},minPrice:{type:['integer','null'],minimum:0},maxPrice:{type:['integer','null'],minimum:0},observedDays:{enum:['all',1,7,14,30]},groupOptions:{type:'boolean'},type: { enum: ['all', 'live', 'gear'] }, gearCategory:{enum:Object.keys(AquaCatalog.gearCategories)},gearGroup:{enum:Object.keys(AquaCatalog.gearGroups)}, fishGroup: { enum: Object.keys(AquaCatalog.fishGroups) }, liveGroup: { enum: [...new Set(Object.values(AquaCatalog.livestockGroups).flatMap(groups=>Object.keys(groups)))] }, browseGroup:{enum:['all',...new Set(Object.values(AquaCatalog.livestockNavigation).flatMap(groups=>groups.map(group=>group.key)))]}, subtype: { enum: ['all', 'fish', 'shrimp', 'aquatic_plant', 'snail'] }, sort: { enum: ['low', 'high', 'sales', 'new', 'observed', 'unit', 'relevance', 'delivered'] }, days: { enum: [7, 30, 90, 'all'] }, query: { type: 'string' }, includeUnknownRegistration: { type: 'boolean' } }, required: ['type', 'sort', 'days'], additionalProperties: false },
    annotations: { readOnlyHint: false },
    execute(value) {
      const next = { ...filters,...Object.fromEntries(Object.keys(AquaCatalog.specialDefaults).filter(k=>value?.[k]!==undefined).map(k=>[k,value[k]])),productRole:value?.productRole??filters.productRole, unitScope:value?.unitScope??filters.unitScope,wantedQty:value?.wantedQty===undefined?filters.wantedQty:value.wantedQty,compareAcross:value?.compareAcross??filters.compareAcross,comparison:value?.comparison??filters.comparison,seller:value?.seller??filters.seller,minPrice:value?.minPrice===undefined?filters.minPrice:value.minPrice,maxPrice:value?.maxPrice===undefined?filters.maxPrice:value.maxPrice,observedDays:value?.observedDays??filters.observedDays,groupOptions:value?.groupOptions??filters.groupOptions, type: value?.type, subtype: value?.subtype ?? filters.subtype, fishGroup: value?.fishGroup ?? filters.fishGroup, liveGroup:value?.liveGroup??(value?.subtype&&value.subtype!==filters.subtype?'all':filters.liveGroup), sort: value?.sort, days: value?.days, query: value?.query ?? '', includeUnknownRegistration: value?.includeUnknownRegistration ?? filters.includeUnknownRegistration };
      if(next.subtype==='fish'&&value?.liveGroup!==undefined&&value?.fishGroup===undefined){next.fishGroup=next.liveGroup;next.liveGroup='all';}
      next.browseGroup=value?.browseGroup??(value?.subtype&&value.subtype!==filters.subtype?'all':filters.browseGroup);if((next.subtype==='fish'?next.fishGroup:next.liveGroup)!=='all')next.browseGroup='all';
      next.gearCategory=value?.gearCategory??filters.gearCategory??'all';
      next.gearGroup=value?.gearGroup??(next.gearCategory!==(filters.gearCategory||'all')?'all':filters.gearGroup??'all');
      if(value?.gearGroup&&value.gearGroup!=='all'&&value?.gearCategory===undefined)next.gearCategory=AquaCatalog.gearParent(value.gearGroup)?.key||'other';
      catalogQuery.select(next);
      $('#period').value = String(next.days); $('#query').value = next.query; $('#includeUnknown').checked = next.includeUnknownRegistration; filters = next; draftQuery=next.query; composing=false; compositionEnter=false; expandedBrowse=null; expandedGear=null; render();
      return { dataStatus: catalog.status, asOf: catalog.asOf, count: catalogQuery.view(filters).result.rows.length, ...filters };
    },
  })).catch(() => {}); } catch {}
}
