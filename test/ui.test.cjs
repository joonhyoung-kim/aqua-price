const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const AquaCatalog = require('../dist/data-model.js');
const actual = JSON.parse(fs.readFileSync(path.join(__dirname, '../dist/catalog.json'), 'utf8'));
const gear = actual.products.filter(p => p.type === 'gear').sort((a,b) => a.price.amount - b.price.amount);
const plants = actual.products.filter(p=>p.subtype==='aquatic_plant').sort((a,b)=>a.price.amount-b.price.amount);
const fish = actual.products.filter(p=>p.subtype==='fish').sort((a,b)=>a.price.amount-b.price.amount);
const live = actual.products.filter(p => p.type === 'live');
const source = fs.readFileSync(path.join(__dirname, '../dist/app.js'), 'utf8');
async function setup(data = actual, fail = false) {
  const element = (dataset = {}) => ({ dataset, value: '', checked: false, textContent: '', innerHTML: '', listeners: {}, attributes: {}, classList: { toggle() {} }, check: { textContent: '' }, setAttribute(k, v) { this.attributes[k] = String(v); }, addEventListener(e, cb) { this.listeners[e] = cb; }, click() { this.listeners.click?.(); }, querySelector() { return this.check; } });
  const nodes = Object.fromEntries(['grid', 'resultTitle', 'resultNote', 'dataStatus', 'hint', 'sellerLinks', 'catalogScope', 'coverageNotice', 'paginationStatus', 'moreResults', 'period', 'query', 'search', 'includeUnknown', 'livestockFilters'].map(id => [id, element()]));
  nodes.period.value = 'all'; nodes.includeUnknown.checked = true;
  const types = ['live', 'gear'].map(type => element({ type }));
  const subtypes = ['fish', 'shrimp', 'aquatic_plant', 'snail'].map(subtype => element({ subtype }));
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
      const match = selector.match(/^\[data-(type|sort|subtype)="(.+)"\]$/);
      return (match[1] === 'type' ? types : match[1] === 'subtype' ? subtypes : sorts).find(e => e.dataset[match[1]] === match[2]);
    },
    querySelectorAll(selector) { return selector === '[data-type]' ? types : selector === '[data-subtype]' ? subtypes : sorts; },
    modelContext: { registerTool(value) { tool = value; } },
  };
  const context = vm.createContext({ document, AquaCatalog, fetch: () => fail ? Promise.reject(Error('offline')) : Promise.resolve({ ok: true, json: () => Promise.resolve(data) }) });
  vm.runInContext(source, context, { filename: 'dist/app.js' });
  await new Promise(resolve => setImmediate(resolve));
  return { nodes, types, sorts, subtypes, subtype(v) { subtypes.find(e => e.dataset.subtype === v).click(); }, get images() { return images; }, get tool() { return tool; }, names() { return [...nodes.grid.innerHTML.matchAll(/<h3>(.*?)<\/h3>/g)].map(m => m[1]); }, sort(v) { sorts.find(e => e.dataset.sort === v).click(); }, type(v) { types.find(e => e.dataset.type === v).click(); } };
}
test('gear default shows observed items with unknown delivery and catalog-stock caveat', async () => {
  const app = await setup();
  assert.deepEqual(app.names(), gear.slice(0,24).map(p => p.name));
  assert.match(app.nodes.dataStatus.textContent, /항목별 확인 시각/); assert.match(app.nodes.dataStatus.textContent, /실시간 최저가/);
  assert.ok(app.nodes.hint.textContent.includes(`미확인 ${gear.length}개 포함`)); assert.match(app.nodes.hint.textContent, /기간 해당 여부를 판단할 수 없습니다/);
  assert.match(app.nodes.grid.innerHTML, /배송비 미확인/); assert.match(app.nodes.grid.innerHTML, /최종 재고 보장 아님/);
  for (const product of gear.slice(0,24)) { assert.ok(app.nodes.grid.innerHTML.includes(product.sourceUrl)); assert.ok(app.nodes.grid.innerHTML.includes(product.originalTitle)); }
  assert.equal(app.images.length, gear.slice(0,24).filter(p=>p.photo.url).length); assert.ok(app.images.every(img => img.src.startsWith('https://')));
});
test('sorts stay exclusive, unknown dates never become newest or sales ranking', async () => {
  const app = await setup();
  app.sort('high'); assert.deepEqual(app.names(), [...gear].sort((a,b)=>b.price.amount-a.price.amount).slice(0,24).map(p=>p.name));
  app.sort('sales'); assert.deepEqual(app.names(), []); assert.match(app.nodes.grid.innerHTML, /실제 판매량이 없습니다/);
  assert.equal(app.sorts.filter(b => b.attributes['aria-pressed'] === 'true').length, 1);
  app.sort('new'); assert.deepEqual(app.names(), []); assert.match(app.nodes.grid.innerHTML, /신상품순으로 정렬할 수 없습니다/);
  app.sort('low'); app.type('live'); assert.equal(app.names().length, Math.min(24,plants.length)); assert.ok(app.nodes.coverageNotice.textContent.includes('수초 '+plants.length+'개')); assert.ok(app.nodes.coverageNotice.textContent.includes('물고기 '+fish.length+'개'));
  assert.equal(app.types.filter(b => b.attributes['aria-pressed'] === 'true').length, 1);
});
test('unknown-registration checkbox and all three period choices are honest', async () => {
  const app = await setup();
  for (const days of [7, 30, 90]) { app.nodes.period.value = String(days); app.nodes.period.listeners.change(); assert.equal(app.names().length, Math.min(24,gear.length)); }
  app.nodes.includeUnknown.checked = false; app.nodes.includeUnknown.listeners.change(); assert.deepEqual(app.names(), []);
  assert.ok(app.nodes.hint.textContent.includes(`미확인 ${gear.length}개 제외`));
  app.nodes.includeUnknown.checked = true; app.nodes.includeUnknown.listeners.change(); assert.equal(app.names().length, Math.min(24,gear.length));
});
test('search is local and includes original product title, not only short title', async () => {
  const app = await setup();
  app.nodes.query.value = '  HJ-952  '; app.nodes.query.listeners.input({ target: app.nodes.query });
  assert.ok(app.names().length > 0); assert.ok(app.names().every(name => name.includes('HJ-952')));
  app.nodes.query.value = 'no match'; let prevented = false; app.nodes.search.listeners.submit({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true); assert.deepEqual(app.names(), []);
});
test('product text and attribute strings are escaped; source links remain safe', async () => {
  const data = structuredClone(actual);
  const product = data.products.find(p=>p.type==='gear');
  product.name = '<img src=x onerror=alert(1)>';
  product.originalTitle = '" <script>alert(1)</script> &';
  product.sourceUrl += '&x="unsafe"';
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
  assert.equal(app.tool.execute({ type: 'gear', sort: 'low', days: 30, includeUnknownRegistration: true }).count, gear.length);
  assert.throws(() => app.tool.execute({ type: 'bad', sort: 'low', days: 7 }), /잘못된 조회 조건/);
  assert.throws(() => app.tool.execute({ type: 'gear', sort: 'low', days: 7, query: 5 }), /잘못된 조회 조건/);
});
test('markup declares gear default and responsive rules for narrow and wide screens', () => {
  const html = fs.readFileSync(path.join(__dirname, '../dist/index.html'), 'utf8');
  assert.match(html, /data-type="gear" class="active" aria-pressed="true"/);
  assert.match(html, /data-type="live" aria-pressed="false"/);
  assert.match(html, /id="includeUnknown" type="checkbox" checked/);
  assert.match(html, /id="catalogScope"/);
  assert.match(html, /@media\(max-width:760px\)/); assert.match(html, /repeat\(2,minmax\(0,1fr\)\)/); assert.match(html, /repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(html, /overflow-wrap:anywhere/);
});
test('larger confirmed lists render 24 cards at a time and reset pages after filters', async () => {
  const data = structuredClone(actual);
  data.products = Array.from({ length: 2000 }, (_, i) => ({ ...structuredClone(gear[i % gear.length]), id: 'synthetic-test-' + i, name: 'TEST ' + i, price: { amount: i + 1, currency: 'KRW' } }));
  const app = await setup(data);
  assert.equal(app.names().length, 24); assert.equal(app.nodes.moreResults.hidden, false);
  assert.match(app.nodes.paginationStatus.textContent, /2000개 중 24개/);
  app.nodes.moreResults.listeners.click(); assert.equal(app.names().length, 48);
  app.sort('high'); assert.equal(app.names().length, 24); assert.equal(app.names()[0], 'TEST 1999');
});
test('seller list counts only sellers with actual products, excluding research-only entries', async () => {
  const data = structuredClone(actual);
  data.sellers.push({ id: 'research-only', name: 'INVESTIGATED ONLY', officialUrl: 'https://example.invalid/' });
  const app = await setup(data);
  assert.ok(app.nodes.catalogScope.textContent.includes(`판매처 ${actual.sellers.length}곳`));
  assert.match(app.nodes.catalogScope.textContent, /사전 조사한 사이트 수와 연동 판매처 수는 다릅니다/);
  assert.ok(!app.nodes.sellerLinks.innerHTML.includes('INVESTIGATED ONLY'));
});

test('livestock subfilters default to plants, show honest empty categories and survive gear round trips', async () => {
  const app = await setup(); assert.equal(app.nodes.livestockFilters.hidden, true);
  app.type('live'); assert.equal(app.nodes.livestockFilters.hidden, false); assert.equal(app.names().length, Math.min(24,plants.length));
  assert.match(app.nodes.resultTitle.textContent, /수초/);
  for (const subtype of ['fish','shrimp','snail']) {
    app.subtype(subtype); assert.equal(app.names().length, actual.products.filter(p=>p.subtype===subtype).length); assert.match(app.nodes.grid.innerHTML, /판매처 페이지 직접 확인/); assert.equal(app.images.length, actual.products.filter(p=>p.subtype===subtype&&p.photo.url).length);
    assert.equal(app.subtypes.filter(b=>b.attributes['aria-pressed']==='true').length, 1);
  }
  app.type('gear'); assert.equal(app.nodes.livestockFilters.hidden, true); assert.equal(app.names().length, 24);
  app.type('live'); assert.match(app.nodes.resultTitle.textContent, /달팽이/); assert.equal(app.names().length,actual.products.filter(p=>p.subtype==='snail').length);
  app.subtype('aquatic_plant'); assert.equal(app.names().length, Math.min(24,plants.length));
  app.nodes.query.value='2구'; app.nodes.query.listeners.input({target:app.nodes.query}); assert.equal(app.names().length, 2);
  app.subtype('fish'); assert.deepEqual(app.names(), []); app.subtype('aquatic_plant'); assert.equal(app.names().length, 2);
  app.nodes.query.value='찾을수없는상품'; app.nodes.query.listeners.input({target:app.nodes.query}); assert.deepEqual(app.names(), []); assert.match(app.nodes.grid.innerHTML, /검색어/);
});
test('livestock controls wrap into four mobile columns with clear pressed state and keyboard focus', () => {
 const html=fs.readFileSync(path.join(__dirname,'../dist/index.html'),'utf8');
 for(const value of ['fish','shrimp','aquatic_plant','snail']) assert.ok(html.includes('data-subtype="'+value+'"'));
 assert.match(html,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/); assert.match(html, /min-height:44px/); assert.match(html,/focus-visible/); assert.match(html,/\[hidden\]\{display:none!important\}/);
});

test('missing verified subtype still explains only connected information; direct photos never become placeholders',async()=>{
 const data=structuredClone(actual); data.products=data.products.filter(p=>p.subtype!=='fish'); const app=await setup(data);app.type('live');app.subtype('fish');assert.deepEqual(app.names(),[]);assert.match(app.nodes.grid.innerHTML,/현재 연결된 상품정보에 해당 생물이 없습니다/);assert.match(app.nodes.grid.innerHTML,/모든 판매처의 품절·미판매를 뜻하지 않습니다/);
 const actualApp=await setup();actualApp.type('live');actualApp.subtype('fish');assert.equal(actualApp.names().length,Math.min(24,fish.length));assert.equal(actualApp.images.length,fish.slice(0,24).filter(p=>p.photo.url).length); for (const img of actualApp.images) {assert.ok(img.src.startsWith('https://')); img.listeners.error(); assert.equal(img.hidden,true); assert.equal(img.fallback.hidden,false);}assert.match(actualApp.nodes.grid.innerHTML,/판매처 페이지 직접 확인/);assert.ok(!actualApp.nodes.grid.innerHTML.includes('카페24 공식 API'));
 actualApp.subtype('aquatic_plant');assert.equal(actualApp.images.length,plants.slice(0,24).filter(p=>p.photo.url).length);assert.match(actualApp.nodes.grid.innerHTML,/카페24 공식 API/);
});

test('direct livestock original photos have descriptive escaped alt text and retain seller fallback',async()=>{
 const app=await setup();app.type('live');for(const subtype of ['fish','shrimp','snail']){app.subtype(subtype);const rows=actual.products.filter(p=>p.subtype===subtype).sort((a,b)=>a.price.amount-b.price.amount).slice(0,24);assert.equal(app.images.length,rows.filter(p=>p.photo.url).length);for(const p of rows){if(p.photo.url){assert.ok(app.nodes.grid.innerHTML.includes('alt="'+p.name+' 상품 사진"'));assert.ok(app.nodes.grid.innerHTML.includes(p.photo.url));}assert.ok(app.nodes.grid.innerHTML.includes(p.sourceUrl));}assert.ok(!app.nodes.grid.innerHTML.includes('<svg'));}
});

test('all period defaults without a registration bound and tool preserves category/query/sort',async()=>{
 const app=await setup();assert.equal(app.nodes.period.value,'all');assert.equal(app.nodes.includeUnknown.disabled,true);assert.match(app.nodes.hint.textContent,/전체 기간/);
 assert.equal(app.tool.execute({type:'live',subtype:'fish',sort:'low',days:'all',query:'',includeUnknownRegistration:false}).count,fish.length);assert.match(app.nodes.resultTitle.textContent,/물고기/);
 app.nodes.period.value='7';app.nodes.period.listeners.change();assert.equal(app.nodes.includeUnknown.disabled,false);app.nodes.period.value='all';app.nodes.period.listeners.change();assert.equal(app.names().length,fish.length);
 app.sort('sales');assert.deepEqual(app.names(),[]);app.sort('new');assert.deepEqual(app.names(),[]);
});
