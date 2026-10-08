const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const AquaCatalog = require('../dist/data-model.js');
const actual = JSON.parse(fs.readFileSync(path.join(__dirname, '../dist/catalog.json'), 'utf8'));
const source = fs.readFileSync(path.join(__dirname, '../dist/app.js'), 'utf8');
async function setup(data = actual, fail = false) {
  const element = (dataset = {}) => ({ dataset, value: '', checked: false, textContent: '', innerHTML: '', listeners: {}, attributes: {}, classList: { toggle() {} }, check: { textContent: '' }, setAttribute(k, v) { this.attributes[k] = String(v); }, addEventListener(e, cb) { this.listeners[e] = cb; }, click() { this.listeners.click?.(); }, querySelector() { return this.check; } });
  const nodes = Object.fromEntries(['grid', 'resultTitle', 'resultNote', 'dataStatus', 'hint', 'sellerLinks', 'period', 'query', 'search', 'includeUnknown'].map(id => [id, element()]));
  nodes.period.value = '30'; nodes.includeUnknown.checked = true;
  const types = ['live', 'gear'].map(type => element({ type }));
  const sorts = ['low', 'high', 'sales', 'new'].map(sort => element({ sort }));
  let images = [], tool;
  nodes.grid.querySelectorAll = () => {
    images = [...nodes.grid.innerHTML.matchAll(/<img src="([^"]+)"/g)].map(match => {
      const fallback = { hidden: true };
      return { src: match[1], hidden: false, complete: false, naturalWidth: 1, listeners: {}, fallback, addEventListener(e, cb) { this.listeners[e] = cb; }, parentElement: { querySelector() { return fallback; } } };
    }); return images;
  };
  const document = {
    querySelector(selector) {
      if (selector.startsWith('#')) return nodes[selector.slice(1)];
      const match = selector.match(/^\[data-(type|sort)="(.+)"\]$/);
      return (match[1] === 'type' ? types : sorts).find(e => e.dataset[match[1]] === match[2]);
    },
    querySelectorAll(selector) { return selector === '[data-type]' ? types : sorts; },
    modelContext: { registerTool(value) { tool = value; } },
  };
  const context = vm.createContext({ document, AquaCatalog, fetch: () => fail ? Promise.reject(Error('offline')) : Promise.resolve({ ok: true, json: () => Promise.resolve(data) }) });
  vm.runInContext(source, context, { filename: 'dist/app.js' });
  await new Promise(resolve => setImmediate(resolve));
  return { nodes, types, sorts, get images() { return images; }, get tool() { return tool; }, names() { return [...nodes.grid.innerHTML.matchAll(/<h3>(.*?)<\/h3>/g)].map(m => m[1]); }, sort(v) { sorts.find(e => e.dataset.sort === v).click(); }, type(v) { types.find(e => e.dataset.type === v).click(); } };
}
test('gear default shows all three actual items with unknown delivery and catalog-stock caveat', async () => {
  const app = await setup();
  assert.deepEqual(app.names(), ['3구 상면 여과기 세트', 'LED 미니 수족관', 'LED 미니어항 세트']);
  assert.match(app.nodes.dataStatus.textContent, /16:59/); assert.match(app.nodes.dataStatus.textContent, /실시간 최저가 또는 전체/);
  assert.match(app.nodes.hint.textContent, /미확인 3개 포함/); assert.match(app.nodes.hint.textContent, /기간 해당 여부를 판단할 수 없습니다/);
  assert.match(app.nodes.grid.innerHTML, /배송비 미확인/); assert.match(app.nodes.grid.innerHTML, /최종 재고 보장 아님/);
  for (const product of actual.products) { assert.ok(app.nodes.grid.innerHTML.includes(product.sourceUrl)); assert.ok(app.nodes.grid.innerHTML.includes(product.originalTitle)); }
  assert.equal(app.images.length, 3); assert.ok(app.images.every(img => img.src.startsWith('https://')));
});
test('sorts stay exclusive, unknown dates never become newest or sales ranking', async () => {
  const app = await setup();
  app.sort('high'); assert.deepEqual(app.names(), ['LED 미니어항 세트', 'LED 미니 수족관', '3구 상면 여과기 세트']);
  app.sort('sales'); assert.deepEqual(app.names(), []); assert.match(app.nodes.grid.innerHTML, /실제 판매량이 없습니다/);
  assert.equal(app.sorts.filter(b => b.attributes['aria-pressed'] === 'true').length, 1);
  app.sort('new'); assert.deepEqual(app.names(), []); assert.match(app.nodes.grid.innerHTML, /신상품순으로 정렬할 수 없습니다/);
  app.sort('low'); app.type('live'); assert.deepEqual(app.names(), []); assert.match(app.nodes.grid.innerHTML, /이번 연동에서 확인된 생물 상품이 없습니다/);
  assert.equal(app.types.filter(b => b.attributes['aria-pressed'] === 'true').length, 1);
});
test('unknown-registration checkbox and all three period choices are honest', async () => {
  const app = await setup();
  for (const days of [7, 30, 90]) { app.nodes.period.value = String(days); app.nodes.period.listeners.change(); assert.equal(app.names().length, 3); }
  app.nodes.includeUnknown.checked = false; app.nodes.includeUnknown.listeners.change(); assert.deepEqual(app.names(), []);
  assert.match(app.nodes.hint.textContent, /미확인 3개 제외/);
  app.nodes.includeUnknown.checked = true; app.nodes.includeUnknown.listeners.change(); assert.equal(app.names().length, 3);
});
test('search is local and includes original product title, not only short title', async () => {
  const app = await setup();
  app.nodes.query.value = '  A2WFGUI2Z  '; app.nodes.query.listeners.input({ target: app.nodes.query });
  assert.deepEqual(app.names(), ['3구 상면 여과기 세트']);
  app.nodes.query.value = 'no match'; let prevented = false; app.nodes.search.listeners.submit({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true); assert.deepEqual(app.names(), []);
});
test('product text and attribute strings are escaped; source links remain safe', async () => {
  const data = structuredClone(actual);
  data.products[0].name = '<img src=x onerror=alert(1)>';
  data.products[0].originalTitle = '" <script>alert(1)</script> &';
  data.products[0].sourceUrl += '&x="unsafe"';
  const app = await setup(data);
  assert.ok(!app.nodes.grid.innerHTML.includes('<script>alert'));
  assert.ok(!app.nodes.grid.innerHTML.includes('<img src=x'));
  assert.ok(app.nodes.grid.innerHTML.includes('&lt;script&gt;'));
  assert.ok(app.nodes.grid.innerHTML.includes('&amp;x=&quot;unsafe&quot;'));
  assert.match(app.nodes.grid.innerHTML, /rel="noopener noreferrer"/);
});
test('failed photo keeps seller link and exposes fallback text', async () => {
  const app = await setup();
  const image = app.images[0]; image.listeners.error();
  assert.equal(image.hidden, true); assert.equal(image.fallback.hidden, false);
  assert.match(app.nodes.grid.innerHTML, /사진을 불러오지 못했습니다/); assert.match(app.nodes.grid.innerHTML, /판매처 상품 원문 확인/);
});
test('failed or invalid catalog never falls back to fictitious sample products', async () => {
  for (const app of [await setup(actual, true), await setup({ bad: true })]) {
    assert.deepEqual(app.names(), []); assert.match(app.nodes.dataStatus.textContent, /불러오거나 검증하지 못했습니다/);
    assert.ok(!app.nodes.grid.innerHTML.includes('네온테트라'));
  }
});
test('tool updates all controls including registration opt-in and rejects malformed filters', async () => {
  const app = await setup();
  assert.equal(app.tool.execute({ type: 'gear', sort: 'low', days: 7, includeUnknownRegistration: false }).count, 0);
  assert.equal(app.nodes.includeUnknown.checked, false);
  assert.equal(app.tool.execute({ type: 'gear', sort: 'low', days: 30, includeUnknownRegistration: true }).count, 3);
  assert.throws(() => app.tool.execute({ type: 'bad', sort: 'low', days: 7 }), /잘못된 조회 조건/);
  assert.throws(() => app.tool.execute({ type: 'gear', sort: 'low', days: 7, query: 5 }), /잘못된 조회 조건/);
});
test('markup declares gear default and responsive rules for narrow and wide screens', () => {
  const html = fs.readFileSync(path.join(__dirname, '../dist/index.html'), 'utf8');
  assert.match(html, /data-type="gear" class="active" aria-pressed="true"/);
  assert.match(html, /data-type="live" aria-pressed="false"/);
  assert.match(html, /id="includeUnknown" type="checkbox" checked/);
  assert.match(html, /확인한 용품 3개 목록/);
  assert.match(html, /@media\(max-width:760px\)/); assert.match(html, /repeat\(2,minmax\(0,1fr\)\)/); assert.match(html, /repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(html, /overflow-wrap:anywhere/);
});
