(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AquaCatalog = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const DAY = 86400000;
  const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|\+00:00)$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 19) === value.slice(0, 19);
  function httpsUrl(value) {
    try { const url = new URL(value); return typeof value === 'string' && url.protocol === 'https:' && !url.username && !url.password; }
    catch { return false; }
  }
  function requireValue(condition, message) { if (!condition) throw Error(message); }
  function validateCatalog(catalog) {
    requireValue(catalog && catalog.schemaVersion === 1, '지원하지 않는 데이터 형식');
    requireValue(['pending', 'ready', 'error'].includes(catalog.status), '데이터 상태 오류');
    requireValue(typeof catalog.reason === 'string', '데이터 상태 이유 필요');
    requireValue(catalog.asOf === null || validDate(catalog.asOf), '기준 시각 오류');
    requireValue(catalog.status !== 'ready' || validDate(catalog.asOf), '준비된 데이터의 기준 시각 필요');
    requireValue(Array.isArray(catalog.sellers) && Array.isArray(catalog.products), '판매처·상품 목록 필요');
    requireValue(catalog.status === 'ready' || catalog.products.length === 0, '미검증 상태에 상품을 표시할 수 없음');
    const sellers = new Set();
    for (const seller of catalog.sellers) {
      requireValue(seller && typeof seller.id === 'string' && seller.id && !sellers.has(seller.id), '판매처 ID 오류');
      requireValue(typeof seller.name === 'string' && seller.name.trim() && httpsUrl(seller.officialUrl), '판매처 이름·공식 링크 필요');
      sellers.add(seller.id);
    }
    const ids = new Set();
    for (const product of catalog.products) {
      requireValue(product && typeof product.id === 'string' && product.id && !ids.has(product.id), '상품 ID 오류');
      ids.add(product.id);
      requireValue(product.verified === true && sellers.has(product.sellerId) && httpsUrl(product.sourceUrl), '검증된 판매처·출처 필요');
      requireValue(typeof product.name === 'string' && product.name.trim() && typeof product.spec === 'string', '상품 이름·규격 오류');
      requireValue(['live', 'gear'].includes(product.type), '상품 종류 오류');
      requireValue(validDate(product.observedAt) && Date.parse(product.observedAt) <= Date.parse(catalog.asOf), '관찰 시각 오류');
      requireValue(product.registeredAt === null || (validDate(product.registeredAt) && Date.parse(product.registeredAt) <= Date.parse(product.observedAt)), '실제 등록일 오류');
      requireValue(product.price === null || (product.price && product.price.currency === 'KRW' && Number.isFinite(product.price.amount) && product.price.amount >= 0), '상품 가격 오류');
      requireValue(product.shipping === null || (product.shipping && product.shipping.currency === 'KRW' && Number.isFinite(product.shipping.amount) && product.shipping.amount >= 0), '배송비 오류');
      requireValue(product.cumulativeSales === null || (Number.isSafeInteger(product.cumulativeSales) && product.cumulativeSales >= 0), '누적 판매량 오류');
      requireValue(product.available === undefined || product.available === null || typeof product.available === 'boolean', '카탈로그 판매 가능 상태 오류');
      requireValue(product.originalTitle === undefined || typeof product.originalTitle === 'string', '원래 상품명 오류');
      requireValue(product.periodSales === null || (product.periodSales && Number.isSafeInteger(product.periodSales.count) && product.periodSales.count >= 0 && validDate(product.periodSales.startAt) && validDate(product.periodSales.endAt) && Date.parse(product.periodSales.startAt) < Date.parse(product.periodSales.endAt) && Date.parse(product.periodSales.endAt) <= Date.parse(product.observedAt)), '기간 판매량 오류');
      const photo = product.photo;
      requireValue(photo && ['allowed', 'not_allowed', 'unknown'].includes(photo.usePermission), '사진 사용 가능 여부 필요');
      requireValue(photo.url === null || httpsUrl(photo.url), '사진 URL 오류');
      requireValue(photo.permissionEvidenceUrl === null || httpsUrl(photo.permissionEvidenceUrl), '사진 사용 근거 URL 오류');
      requireValue(photo.usePermission !== 'allowed' || (httpsUrl(photo.url) && httpsUrl(photo.permissionEvidenceUrl)), '사진 사용 허용 근거 필요');
    }
    return catalog;
  }
  function selectProducts(catalog, filters) {
    validateCatalog(catalog);
    requireValue(filters && ['live', 'gear'].includes(filters.type) && ['low', 'high', 'new', 'sales'].includes(filters.sort) && [7, 30, 90].includes(filters.days) && typeof filters.query === 'string' && (filters.includeUnknownRegistration === undefined || typeof filters.includeUnknownRegistration === 'boolean') && (filters.subtype === undefined || ['fish', 'shrimp', 'aquatic_plant', 'snail'].includes(filters.subtype)), '잘못된 조회 조건');
    if (catalog.status !== 'ready') return { rows: [], reason: catalog.reason, excludedRegistration: 0, excludedPrice: 0, excludedSales: 0, startAt: null, endAt: null };
    const end = Date.parse(catalog.asOf), start = end - filters.days * DAY;
    const startAt = new Date(start).toISOString(), endAt = new Date(end).toISOString();
    const needle = filters.query.trim().toLowerCase();
    let rows = catalog.products.filter(p => p.type === filters.type && (filters.type !== 'live' || filters.subtype === undefined || p.subtype === filters.subtype) && [p.name, p.originalTitle || '', p.spec].some(value => value.toLowerCase().includes(needle)));
    const unknownCount = rows.filter(p => p.registeredAt === null).length;
    const includeUnknown = filters.includeUnknownRegistration === true && filters.sort !== 'new';
    const excludedRegistration = includeUnknown ? 0 : unknownCount;
    const includedUnknownRegistration = includeUnknown ? unknownCount : 0;
    rows = rows.filter(p => p.registeredAt === null ? includeUnknown : Date.parse(p.registeredAt) >= start && Date.parse(p.registeredAt) <= end);
    const excludedPrice = rows.filter(p => p.price === null).length;
    if (filters.sort === 'low' || filters.sort === 'high') rows = rows.filter(p => p.price !== null);
    let excludedSales = 0;
    if (filters.sort === 'sales') {
      const matches = p => p.periodSales !== null && Date.parse(p.periodSales.startAt) === start && Date.parse(p.periodSales.endAt) === end;
      excludedSales = rows.filter(p => !matches(p)).length;
      rows = rows.filter(matches).sort((a, b) => b.periodSales.count - a.periodSales.count);
    } else if (filters.sort === 'new') rows.sort((a, b) => Date.parse(b.registeredAt) - Date.parse(a.registeredAt));
    else rows.sort((a, b) => filters.sort === 'high' ? b.price.amount - a.price.amount : a.price.amount - b.price.amount);
    const missingSubtype = filters.type === 'live' && filters.subtype !== undefined && !catalog.products.some(p => p.type === 'live' && p.subtype === filters.subtype);
    const reason = missingSubtype ? '현재 연결된 상품정보에 해당 생물이 없습니다. 모든 판매처의 품절·미판매를 뜻하지 않습니다.' : !catalog.products.some(p => p.type === filters.type) && filters.type === 'live' ? catalog.livestockNotice || '이번 연동에서 확인된 생물 상품이 없습니다.' : filters.sort === 'sales' && !rows.length ? '선택한 기간과 정확히 일치하는 실제 판매량이 없습니다. 누적 판매수로 기간 순위를 만들지 않습니다.' : filters.sort === 'new' && !rows.length && unknownCount ? '실제 상품 등록일이 확인되지 않아 신상품순으로 정렬할 수 없습니다. 관찰 시각으로 임의 정렬하지 않습니다.' : !rows.length ? '등록일·검색어·정렬 조건을 충족하는 확인 상품이 없습니다.' : '';
    return { rows, reason, excludedRegistration, includedUnknownRegistration, excludedPrice, excludedSales, startAt, endAt };
  }
  function usablePhoto(product) { return product.photo.usePermission === 'allowed' ? product.photo.url : null; }
  return { validateCatalog, selectProducts, usablePhoto, httpsUrl };
});
