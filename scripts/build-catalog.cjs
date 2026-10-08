const fs = require('node:fs');
const path = require('node:path');
const { validateCatalog } = require('../dist/data-model.js');
const folder = path.join(__dirname, '../dist');
const snapshot = JSON.parse(fs.readFileSync(path.join(folder, 'source-snapshot.json'), 'utf8'));
const titles = ['LED 미니어항 세트', '3구 상면 여과기 세트', 'LED 미니 수족관'];
const catalog = {
  schemaVersion: 1, status: 'ready', reason: '', asOf: '2026-10-08T07:59:03Z',
  notice: snapshot.snapshot_notice_ko, sourceName: snapshot.source_name, sourceDocumentationUrl: snapshot.source_documentation_url,
  livestockNotice: '이번 연동에서 확인된 생물 상품이 없습니다. 이번 제한된 검색의 결과이며 전체 카탈로그에 생물이 없다는 뜻은 아닙니다.',
  sellers: snapshot.items.map(item => ({ id: item.seller_domain, name: item.seller_domain, officialUrl: new URL(item.product_url).origin + '/', sellerNameConfirmed: false })),
  products: snapshot.items.map((item, index) => ({
    id: item.id, verified: true, sellerId: item.seller_domain, sourceUrl: item.product_url,
    name: titles[index], originalTitle: item.title, description: item.description, spec: '옵션: ' + item.variant_title,
    variantId: item.variant_id, type: 'gear', observedAt: item.snapshot_at_utc, registeredAt: null,
    price: { amount: item.price_amount, currency: item.currency }, shipping: null,
    cumulativeSales: null, periodSales: null, available: item.available, availabilityBasis: item.availability_basis,
    detailLookupVerified: item.detail_lookup_verified,
    photo: { url: item.photo.verified_https_url, usePermission: 'allowed', permissionEvidenceUrl: snapshot.source_documentation_url,
      permissionScope: 'api-catalog-comparison', generalRepublicationLicenseVerified: false, checkedAt: item.photo.checked_at_utc },
  })),
};
validateCatalog(catalog);
fs.writeFileSync(path.join(folder, 'catalog.json'), JSON.stringify(catalog, null, 2) + '\n');
