'use strict';
const $ = selector => document.querySelector(selector);
let filters = { type: 'gear', subtype: 'aquatic_plant', fishGroup: 'all', sort: 'low', days: 'all', query: '', includeUnknownRegistration: true };
let catalog = { schemaVersion: 1, status: 'pending', reason: '검증된 판매처 데이터를 불러오는 중입니다.', asOf: null, sellers: [], products: [] };
const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const formatTime = value => value === null ? '미확인' : new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) + ' KST';
const priceText = value => value === null ? '미확인' : value.amount.toLocaleString('ko-KR') + ' 원';
const PAGE_SIZE = 24;
let visibleLimit = PAGE_SIZE;
const subtypeNames = { fish: '물고기', shrimp: '새우', aquatic_plant: '수초', snail: '달팽이' };
function syncSubtypeControls() {
  $('#fishFilters').hidden = filters.type !== 'live' || filters.subtype !== 'fish';
  const counts = Object.fromEntries(Object.keys(AquaCatalog.fishGroups).map(key => [key, 0]));
  const base = AquaCatalog.selectProducts(catalog, { ...filters, type: 'live', subtype: 'fish', fishGroup: 'all' });
  for (const product of base.rows) { counts.all++; counts[AquaCatalog.fishGroup(product)]++; }
  document.querySelectorAll('[data-fish-group]').forEach(button => {
    const key = button.dataset.fishGroup;
    button.hidden = !['all','guppy','platy','molly','other'].includes(key) && counts[key] === 0 && key !== filters.fishGroup;
    button.textContent = AquaCatalog.fishGroups[key] + ' ' + counts[key];
    const active = key === filters.fishGroup; button.classList.toggle('active', active); button.setAttribute('aria-pressed', active);
  });
  $('#livestockFilters').hidden = filters.type !== 'live';
  document.querySelectorAll('[data-subtype]').forEach(button => { const active = button.dataset.subtype === filters.subtype; button.classList.toggle('active', active); button.setAttribute('aria-pressed', active); });
}

function render(resetPage = true) {
  if (resetPage) visibleLimit = PAGE_SIZE;
  syncSubtypeControls();
  $('#includeUnknown').disabled = filters.days === 'all';
  const result = AquaCatalog.selectProducts(catalog, filters);
  const visibleRows = result.rows.slice(0, visibleLimit);
  const sellerById = new Map(catalog.sellers.map(seller => [seller.id, seller]));
  $('#paginationStatus').textContent = result.rows.length ? `조회 ${result.rows.length}개 중 ${visibleRows.length}개 표시` : '';
  $('#moreResults').hidden = visibleRows.length >= result.rows.length;
  $('#moreResults').textContent = `상품 ${Math.min(PAGE_SIZE, result.rows.length - visibleRows.length)}개 더 보기`;
  $('#resultTitle').textContent = `${filters.type === 'live' ? '생물 · ' + subtypeNames[filters.subtype] : '용품'} ${result.rows.length}개`;
  $('#dataStatus').textContent = catalog.status === 'ready' ? '확인한 판매처 상품 목록입니다. 실시간 가격·재고·전체 판매처 비교가 아닙니다.' : catalog.reason;
  const exclusions = [result.excludedRegistration ? `등록일 미확인 ${result.excludedRegistration}개 제외` : '', (filters.sort === 'low' || filters.sort === 'high') && result.excludedPrice ? `가격 미확인 ${result.excludedPrice}개 제외` : '', result.excludedSales ? `선택 기간 판매량 미확인 ${result.excludedSales}개 제외` : ''].filter(Boolean);
  $('#hint').textContent = (filters.days === 'all' ? '전체 기간 · 등록일 미확인 상품도 포함합니다. 신상품순은 확인된 등록일이 필요합니다.' : '기간은 실제 상품 등록일 기준') + ' · 관찰 시각은 등록일이 아닙니다.' + (result.includedUnknownRegistration ? ` · 등록일 미확인 ${result.includedUnknownRegistration}개 포함: 선택 기간 해당 여부를 판단할 수 없습니다.` : '') + (exclusions.length ? ' · ' + exclusions.join(' · ') : '');
  if (!result.rows.length) {
    $('#grid').innerHTML = `<div class="empty"><strong>확인 가능한 상품이 없어요</strong>${escapeHtml(result.reason)}<br>낮은·높은 가격순에서 등록일 미확인 상품을 포함하거나 판매처에서 직접 확인할 수 있습니다.</div>`;
    return;
  }
  $('#grid').innerHTML = visibleRows.map(product => {
    const seller = sellerById.get(product.sellerId);
    const photo = AquaCatalog.usablePhoto(product);
    return `<article class="card"><div class="art${photo ? '' : ' no-photo'}"${photo ? '' : ' role="img" aria-label="상품 사진 없음"'}>${photo ? `<img src="${escapeHtml(photo)}" alt="${escapeHtml(product.name)} 상품 사진" loading="lazy" referrerpolicy="no-referrer"><span class="photo-fallback" hidden role="img" aria-label="상품 사진 없음"></span>` : ''}</div><div class="body"><div class="category">${escapeHtml(seller.name)}</div><h3>${escapeHtml(product.name)}</h3><div class="price">${priceText(product.price)}</div><a class="source" href="${escapeHtml(product.sourceUrl)}" target="_blank" rel="noopener noreferrer">판매처 이동 ↗</a></div></article>`;
  }).join('');
  $('#grid').querySelectorAll('img').forEach(img => {
    const showFallback = () => { img.hidden = true; img.parentElement.querySelector('.photo-fallback').hidden = false; };
    img.addEventListener('error', showFallback);
    if (img.complete && img.naturalWidth === 0) showFallback();
  });
}
document.querySelectorAll('[data-type]').forEach(button => button.addEventListener('click', () => {
  filters.type = button.dataset.type;
  document.querySelectorAll('[data-type]').forEach(other => {
    const active = other === button;
    other.classList.toggle('active', active); other.setAttribute('aria-pressed', active);
    other.querySelector('.check').textContent = active ? '✓' : '';
  });
  render();
}));
document.querySelectorAll('[data-sort]').forEach(button => button.addEventListener('click', () => {
  filters.sort = button.dataset.sort;
  document.querySelectorAll('[data-sort]').forEach(other => { other.classList.toggle('active', other === button); other.setAttribute('aria-pressed', other === button); });
  render();
}));
document.querySelectorAll('[data-subtype]').forEach(button => button.addEventListener('click', () => { filters.subtype = button.dataset.subtype; render(); }));
document.querySelectorAll('[data-fish-group]').forEach(button => button.addEventListener('click', () => { filters.fishGroup = button.dataset.fishGroup; render(); }));
$('#period').addEventListener('change', () => { filters.days = $('#period').value === 'all' ? 'all' : Number($('#period').value); render(); });
$('#includeUnknown').addEventListener('change', () => { filters.includeUnknownRegistration = $('#includeUnknown').checked; render(); });
$('#moreResults').addEventListener('click', () => { visibleLimit += PAGE_SIZE; render(false); });
$('#search').addEventListener('submit', event => { event.preventDefault(); filters.query = $('#query').value.trim(); render(); });
$('#query').addEventListener('input', event => { filters.query = event.target.value.trim(); render(); });
render();
fetch('catalog.json', { cache: 'no-store' }).then(response => {
  if (!response.ok) throw Error('data response ' + response.status);
  return response.json();
}).then(value => { catalog = AquaCatalog.validateCatalog(value); render(); }).catch(() => {
  catalog = { schemaVersion: 1, status: 'error', reason: '판매처 데이터 파일을 불러오거나 검증하지 못했습니다. 확인되지 않은 상품은 표시하지 않습니다.', asOf: null, sellers: [], products: [] };
  render();
});
if (document.modelContext?.registerTool) {
  try { Promise.resolve(document.modelContext.registerTool({
    name: 'set_product_filters', description: '검증된 관찰 상품의 종류·정렬·실제 등록 기간·검색어를 변경합니다. 데이터가 없거나 미확인이면 결과가 비어 있습니다.',
    inputSchema: { type: 'object', properties: { type: { enum: ['live', 'gear'] }, fishGroup: { enum: Object.keys(AquaCatalog.fishGroups) }, subtype: { enum: ['fish', 'shrimp', 'aquatic_plant', 'snail'] }, sort: { enum: ['low', 'high', 'sales', 'new'] }, days: { enum: [7, 30, 90, 'all'] }, query: { type: 'string' }, includeUnknownRegistration: { type: 'boolean' } }, required: ['type', 'sort', 'days'], additionalProperties: false },
    annotations: { readOnlyHint: false },
    execute(value) {
      const next = { type: value?.type, subtype: value?.subtype ?? filters.subtype, fishGroup: value?.fishGroup ?? filters.fishGroup, sort: value?.sort, days: value?.days, query: value?.query ?? '', includeUnknownRegistration: value?.includeUnknownRegistration ?? filters.includeUnknownRegistration };
      AquaCatalog.selectProducts(catalog, next);
      $(`[data-type="${next.type}"]`).click(); $(`[data-sort="${next.sort}"]`).click();
      $('#period').value = String(next.days); $('#query').value = next.query; $('#includeUnknown').checked = next.includeUnknownRegistration; filters = next; render();
      return { dataStatus: catalog.status, asOf: catalog.asOf, count: AquaCatalog.selectProducts(catalog, filters).rows.length, ...filters };
    },
  })).catch(() => {}); } catch {}
}
