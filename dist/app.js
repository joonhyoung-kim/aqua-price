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
let lastGridHTML=null,lastTreeHTML=null;
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
  if(filters.type==='gear'){renderGearNavigation(view);return;}
  const groups=AquaCatalog.livestockGroups[filters.subtype]||{all:'전체'},leaf=filters.subtype==='fish'?filters.fishGroup:filters.liveGroup;
  const counts=view.groupCounts;
  const navigation=AquaCatalog.livestockNavigation[filters.subtype]||[],parent=AquaCatalog.navigationParent(filters.subtype,leaf);
  if(expandedBrowse===null||expandedBrowse&&!navigation.some(group=>group.key===expandedBrowse))expandedBrowse=parent?.key||(filters.browseGroup!=='all'?filters.browseGroup:'');
  const selectedBrowse=navigation.find(group=>group.key===filters.browseGroup);
  $('#groupPath').textContent='생물 › '+subtypeNames[filters.subtype]+(leaf&&leaf!=='all'?(parent?' › '+parent.label:'')+' › '+groups[leaf]:selectedBrowse?' › '+selectedBrowse.label+' › 그룹 전체':' › 전체');
  const choice=(key,label,count,browse='all')=>`<button type="button" class="group-choice" data-live-group="${key}" data-browse-filter="${browse}" aria-pressed="${leaf===key&&(filters.browseGroup||'all')===browse}"><span>${escapeHtml(label)}</span><span class="group-count">${count}개</span></button>`;
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
  $('#fishFilters').hidden = filters.type === 'live' && filters.subtype === 'all';
  $('#groupTree').setAttribute('aria-label',filters.type==='gear'?'용품 세부 종류 탐색':'생물 세부 종류 탐색');
  renderGroupNavigation(view);
  $('#livestockFilters').hidden = filters.type !== 'live';
  document.querySelectorAll('[data-subtype]').forEach(button => { const active = button.dataset.subtype === filters.subtype; button.classList.toggle('active', active); button.setAttribute('aria-pressed', active); });
}

function render(resetPage = true) {
  const view=catalogQuery.view(filters);
  if (resetPage) visibleLimit = PAGE_SIZE;
  if(catalog.status==='ready'&&typeof history==='object'&&typeof location==='object'){
    const url=new URL(location.href);url.search=AquaCatalog.filtersToSearch(filters,url.search);history.replaceState(null,'',url.pathname+url.search+url.hash);
  }
  $('#sort').value = filters.sort;
  $('#period').value = String(filters.days);
  syncSubtypeControls(view);
  const availability = view.availability;
  for (const [value, label] of [['sales', '판매순'], ['new', '신상품순']]) { const option = $('#sort').querySelector(`option[value="${value}"]`); option.disabled = !availability[value].available; option.textContent = label + (option.disabled ? ' (미확인)' : ''); }
  $('#sortStatus').hidden = catalog.status !== 'ready' || availability.sales.available && availability.new.available && filters.sort !== 'observed';
  $('#sortStatus').textContent = [!availability.sales.available ? '현재 조회 조건에 확인된 판매량이 없어 판매순을 사용할 수 없습니다.' : '', !availability.new.available ? '현재 조회 조건에 확인된 판매처 등록일이 없어 신상품순을 사용할 수 없습니다.' : '', '최근 확인순은 가격 확인 시각 기준이며, 판매처 등록일·최초 수집일이 아닙니다.'].filter(Boolean).join(' ');
  $('#includeUnknown').disabled = filters.days === 'all';
  const result = view.result;
  const visibleRows = result.rows.slice(0, visibleLimit);
  $('#paginationStatus').textContent = result.rows.length ? `조회 ${result.rows.length}개 중 ${visibleRows.length}개 표시` : '';
  $('#moreResults').hidden = visibleRows.length >= result.rows.length;
  $('#moreResults').textContent = `상품 ${Math.min(PAGE_SIZE, result.rows.length - visibleRows.length)}개 더 보기`;
  const selectedGroup=filters.subtype==='fish'?filters.fishGroup:filters.liveGroup,groupLabel=selectedGroup==='all'?AquaCatalog.livestockNavigation[filters.subtype]?.find(group=>group.key===filters.browseGroup)?.label:AquaCatalog.livestockGroups[filters.subtype]?.[selectedGroup];
  $('#resultTitle').textContent = `${filters.type === 'live' ? '생물 · ' + subtypeNames[filters.subtype]+(groupLabel?' · '+groupLabel:'') : '용품'+((filters.gearGroup||'all')!=='all'?' · '+AquaCatalog.gearGroups[filters.gearGroup]:(filters.gearCategory||'all')!=='all'?' · '+AquaCatalog.gearCategories[filters.gearCategory]:'')} ${result.rows.length}개`;
  $('#dataStatus').textContent = catalog.status === 'ready' ? '확인한 판매처 상품 목록입니다. 실시간 가격·재고·전체 판매처 비교가 아닙니다.' : catalog.reason;
  const exclusions = [result.excludedRegistration ? `등록일 미확인 ${result.excludedRegistration}개 제외` : '', (filters.sort === 'low' || filters.sort === 'high') && result.excludedPrice ? `가격 미확인 ${result.excludedPrice}개 제외` : '', result.excludedSales ? `${filters.days === 'all' ? '누적' : '선택 기간'} 판매량 미확인 ${result.excludedSales}개 제외` : ''].filter(Boolean);
  $('#hint').textContent = (filters.days === 'all' ? '전체 기간 · 등록일 미확인 상품도 포함합니다. 신상품순은 확인된 등록일이 필요합니다.' : '기간은 실제 상품 등록일 기준') + ' · 관찰 시각은 등록일이 아닙니다.' + (result.includedUnknownRegistration ? ` · 등록일 미확인 ${result.includedUnknownRegistration}개 포함: 선택 기간 해당 여부를 판단할 수 없습니다.` : '') + (exclusions.length ? ' · ' + exclusions.join(' · ') : '');
  if (!result.rows.length) {
    setGridHTML(`<div class="empty"><strong>확인 가능한 상품이 없어요</strong>${escapeHtml(result.reason)}<br>낮은·높은 가격순에서 등록일 미확인 상품을 포함하거나 판매처에서 직접 확인할 수 있습니다.</div>`);
    return;
  }
  const gridHTML = visibleRows.map(product => {
    const seller = catalogQuery.seller(product.sellerId);
    const photo = AquaCatalog.usablePhoto(product);
    return `<article class="card"><div class="art${photo ? '' : ' no-photo'}"${photo ? '' : ' role="img" aria-label="상품 사진 없음"'}>${photo ? `<img src="${escapeHtml(photo)}" alt="${escapeHtml(product.name)} 상품 사진" loading="lazy" referrerpolicy="no-referrer"><span class="photo-fallback" hidden role="img" aria-label="상품 사진 없음"></span>` : ''}</div><div class="body"><div class="category">${escapeHtml(seller.name)}</div><h3 title="${escapeHtml(product.name)}">${escapeHtml(product.name)}</h3><div class="price">${priceText(product.price)}</div><a class="source" href="${escapeHtml(product.sourceUrl)}" target="_blank" rel="noopener noreferrer">판매처 이동 ↗</a></div></article>`;
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
  draftQuery=event.target.value;
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
    inputSchema: { type: 'object', properties: { type: { enum: ['live', 'gear'] }, gearCategory:{enum:Object.keys(AquaCatalog.gearCategories)},gearGroup:{enum:Object.keys(AquaCatalog.gearGroups)}, fishGroup: { enum: Object.keys(AquaCatalog.fishGroups) }, liveGroup: { enum: [...new Set(Object.values(AquaCatalog.livestockGroups).flatMap(groups=>Object.keys(groups)))] }, browseGroup:{enum:['all',...new Set(Object.values(AquaCatalog.livestockNavigation).flatMap(groups=>groups.map(group=>group.key)))]}, subtype: { enum: ['all', 'fish', 'shrimp', 'aquatic_plant', 'snail'] }, sort: { enum: ['low', 'high', 'sales', 'new', 'observed'] }, days: { enum: [7, 30, 90, 'all'] }, query: { type: 'string' }, includeUnknownRegistration: { type: 'boolean' } }, required: ['type', 'sort', 'days'], additionalProperties: false },
    annotations: { readOnlyHint: false },
    execute(value) {
      const next = { type: value?.type, subtype: value?.subtype ?? filters.subtype, fishGroup: value?.fishGroup ?? filters.fishGroup, liveGroup:value?.liveGroup??(value?.subtype&&value.subtype!==filters.subtype?'all':filters.liveGroup), sort: value?.sort, days: value?.days, query: value?.query ?? '', includeUnknownRegistration: value?.includeUnknownRegistration ?? filters.includeUnknownRegistration };
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
