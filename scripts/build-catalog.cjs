const fs = require('node:fs');
const path = require('node:path');
const { validateCatalog } = require('../dist/data-model.js');
const folder = path.join(__dirname, '../dist');
const knownTitles = {
  cafe24_auroom260404_1_24799: 'LED 미니어항 세트',
  cafe24_honeystore033_1_172379: '3구 상면 여과기 세트',
  cafe24_honeystore081_1_28988: 'LED 미니 수족관',
};
function buildCatalog(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.items)) throw Error('확인 상품 배열 필요');
  const dates = snapshot.items.map(item => item.observed_at_utc || item.snapshot_at_utc);
  if (dates.some(date => !Number.isFinite(Date.parse(date)))) throw Error('관찰 시각 오류');
  const asOf = snapshot.snapshot_at_utc || (dates.length ? dates.reduce((latest, date) => Date.parse(date) > Date.parse(latest) ? date : latest) : null);
  const sellers = new Map();
  for (const item of snapshot.items) {
    if (new URL(item.product_url).hostname !== item.seller_domain) throw Error('상품 출처와 판매처 도메인 불일치');
    if (!sellers.has(item.seller_domain)) sellers.set(item.seller_domain, { id: item.seller_domain, name: item.seller_domain, officialUrl: new URL(item.product_url).origin + '/', sellerNameConfirmed: false });
  }
  const liveItems = snapshot.items.filter(item => item.type === 'live');
  const livestockNotice = liveItems.length && liveItems.every(item => item.subtype === 'aquatic_plant') ? `이번 확인본의 생물은 수초 ${liveItems.length}개입니다. 물고기·관상새우 상품은 아직 확보하지 못했습니다.` : liveItems.length ? '이번 공식 카탈로그에서 확인된 생물 목록입니다.' : '이번 연동에서 확인된 생물 상품이 없습니다. 제한된 검색의 결과이며 전체 카탈로그에 생물이 없다는 뜻은 아닙니다.';
  const catalog = {
  schemaVersion: 1, status: 'ready', reason: '', asOf,
  notice: snapshot.snapshot_notice_ko || '카페24 공식 카탈로그에서 확인한 한정된 상품 목록입니다. 가격은 항목별 확인 시각 기준이며 실시간 최저가·전체 판매처 비교가 아닙니다. 배송비·최종 가격·재고는 판매처에서 확인하세요.', sourceName: snapshot.source_name, sourceDocumentationUrl: snapshot.source_documentation_url,
  livestockNotice,
  sellers: [...sellers.values()],
  products: snapshot.items.map(item => {
    const type = item.type || (knownTitles[item.id] ? 'gear' : null);
    if (!['live', 'gear'].includes(type)) throw Error('새 상품은 검증된 live/gear 종류가 필요합니다');
    const photoAvailable = item.photo && typeof item.photo.verified_https_url === 'string' && item.photo.verified_https_url.startsWith('https://') && ((item.photo.http_status === 200 && item.photo.content_type?.startsWith('image/')) || (snapshot.photo_validation?.https_head_status === 200 && snapshot.photo_validation.verified_count === snapshot.items.length));
    return {
    id: item.id, verified: true, sellerId: item.seller_domain, sourceUrl: item.product_url,
    name: item.display_title || knownTitles[item.id] || item.title, originalTitle: item.title, description: item.description, spec: '옵션: ' + (item.variant_title || '미확인'),
    variantId: item.variant_id ?? null, type, subtype: item.subtype ?? null, observedAt: item.observed_at_utc || item.snapshot_at_utc, registeredAt: item.registered_at_utc ?? item.registered_at ?? null,
    price: item.price_amount === null ? null : { amount: item.price_amount, currency: item.currency }, shipping: item.shipping_amount == null ? null : { amount: item.shipping_amount, currency: item.currency },
    cumulativeSales: null, periodSales: null, available: item.available, availabilityBasis: item.availability_basis,
    detailLookupVerified: item.detail_lookup_verified,
    photo: { url: photoAvailable ? item.photo.verified_https_url : null, usePermission: photoAvailable ? 'allowed' : 'unknown', permissionEvidenceUrl: photoAvailable ? snapshot.source_documentation_url : null,
      permissionScope: 'api-catalog-comparison', generalRepublicationLicenseVerified: false, checkedAt: item.photo?.checked_at_utc ?? null },
  }; }),
};
validateCatalog(catalog);
return catalog;
}
if (require.main === module) {
  const snapshot = JSON.parse(fs.readFileSync(path.join(folder, 'source-snapshot.json'), 'utf8'));
  fs.writeFileSync(path.join(folder, 'catalog.json'), JSON.stringify(buildCatalog(snapshot), null, 2) + '\n');
}
module.exports = { buildCatalog };
