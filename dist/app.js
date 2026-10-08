'use strict';
const $ = selector => document.querySelector(selector);
let filters = { type: 'gear', sort: 'low', days: 30, query: '', includeUnknownRegistration: true };
let catalog = { schemaVersion: 1, status: 'pending', reason: '검증된 판매처 데이터를 불러오는 중입니다.', asOf: null, sellers: [], products: [] };
const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const formatTime = value => value === null ? '미확인' : new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) + ' KST';
const priceText = value => value === null ? '미확인' : value.amount.toLocaleString('ko-KR') + ' 원';

function render() {
  const result = AquaCatalog.selectProducts(catalog, filters);
  $('#resultTitle').textContent = `${filters.type === 'live' ? '생물' : '용품'} ${result.rows.length}개`;
  $('#resultNote').textContent = '표시가격 기준 · 배송비 별도 · 규격 확인';
  $('#dataStatus').textContent = catalog.status === 'ready' ? catalog.notice || `확인된 관찰 데이터 · 기준 ${formatTime(catalog.asOf)} · 현재 가격·재고는 판매처에서 확인하세요.` : catalog.reason;
  const exclusions = [result.excludedRegistration ? `등록일 미확인 ${result.excludedRegistration}개 제외` : '', (filters.sort === 'low' || filters.sort === 'high') && result.excludedPrice ? `가격 미확인 ${result.excludedPrice}개 제외` : '', result.excludedSales ? `선택 기간 판매량 미확인 ${result.excludedSales}개 제외` : ''].filter(Boolean);
  $('#hint').textContent = '기간은 실제 상품 등록일 기준 · 관찰 시각은 등록일이 아닙니다.' + (result.includedUnknownRegistration ? ` · 등록일 미확인 ${result.includedUnknownRegistration}개 포함: 선택 기간 해당 여부를 판단할 수 없습니다.` : '') + (exclusions.length ? ' · ' + exclusions.join(' · ') : '');
  $('#sellerLinks').innerHTML = catalog.sellers.length ? '<span>판매처에서 직접 확인: </span>' + catalog.sellers.map(s => `<a href="${escapeHtml(s.officialUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(s.name)} ↗</a>`).join(' · ') : '검증된 판매처 공식 링크도 아직 제공되지 않았습니다.';
  if (!result.rows.length) {
    $('#grid').innerHTML = `<div class="empty"><strong>확인 가능한 상품이 없어요</strong>${escapeHtml(result.reason)}<br>낮은·높은 가격순에서 등록일 미확인 상품을 포함하거나 판매처에서 직접 확인할 수 있습니다.</div>`;
    return;
  }
  $('#grid').innerHTML = result.rows.map(product => {
    const seller = catalog.sellers.find(s => s.id === product.sellerId);
    const photo = AquaCatalog.usablePhoto(product);
    return `<article class="card"><div class="art">${photo ? `<img src="${escapeHtml(photo)}" alt="${escapeHtml(product.name)} 상품 사진" loading="lazy" referrerpolicy="no-referrer"><span class="photo-fallback" hidden>사진을 불러오지 못했습니다.<br>아래 판매처 링크에서 확인하세요.</span>` : '<span>사용 가능한 사진 미확인 · 판매처에서 확인</span>'}</div><div class="body"><div class="category">${escapeHtml(seller.name)} · 판매처명 미확인</div><h3>${escapeHtml(product.name)}</h3>${product.originalTitle ? `<details class="original"><summary>원래 상품명 보기</summary><p>${escapeHtml(product.originalTitle)}</p></details>` : ''}<div class="spec">${escapeHtml(product.spec)}</div><div class="price">${priceText(product.price)}</div><div class="spec">배송비 ${priceText(product.shipping)} · 표시가격 기준</div><div class="spec">카탈로그 판매 가능: ${product.available === true ? '표시됨 · 최종 재고 보장 아님' : product.available === false ? '불가로 표시됨' : '미확인'}</div><div class="meta"><span>상품 등록일 ${formatTime(product.registeredAt)}</span><span>확인 시각 ${formatTime(product.observedAt)}</span></div><p class="spec">누적 판매수: ${product.cumulativeSales === null ? '미확인' : product.cumulativeSales.toLocaleString('ko-KR')} · 선택 기간 판매량: ${product.periodSales && Date.parse(product.periodSales.startAt) === Date.parse(result.startAt) && Date.parse(product.periodSales.endAt) === Date.parse(result.endAt) ? product.periodSales.count.toLocaleString('ko-KR') : '미확인'}</p><a class="source" href="${escapeHtml(product.sourceUrl)}" target="_blank" rel="noopener noreferrer">판매처 상품 원문 확인 ↗</a></div></article>`;
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
$('#period').addEventListener('change', () => { filters.days = Number($('#period').value); render(); });
$('#includeUnknown').addEventListener('change', () => { filters.includeUnknownRegistration = $('#includeUnknown').checked; render(); });
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
    inputSchema: { type: 'object', properties: { type: { enum: ['live', 'gear'] }, sort: { enum: ['low', 'high', 'sales', 'new'] }, days: { enum: [7, 30, 90] }, query: { type: 'string' }, includeUnknownRegistration: { type: 'boolean' } }, required: ['type', 'sort', 'days'], additionalProperties: false },
    annotations: { readOnlyHint: false },
    execute(value) {
      const next = { type: value?.type, sort: value?.sort, days: value?.days, query: value?.query ?? '', includeUnknownRegistration: value?.includeUnknownRegistration ?? filters.includeUnknownRegistration };
      AquaCatalog.selectProducts(catalog, next);
      $(`[data-type="${next.type}"]`).click(); $(`[data-sort="${next.sort}"]`).click();
      $('#period').value = String(next.days); $('#query').value = next.query; $('#includeUnknown').checked = next.includeUnknownRegistration; filters = next; render();
      return { dataStatus: catalog.status, asOf: catalog.asOf, count: AquaCatalog.selectProducts(catalog, filters).rows.length, ...filters };
    },
  })).catch(() => {}); } catch {}
}
