const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const source = fs.readFileSync(path.join(__dirname, '../dist/app.js'), 'utf8');

function setup(withTool = false) {
  const element = (dataset = {}) => ({
    dataset, value: '', textContent: '', innerHTML: '', listeners: {}, attributes: {},
    classList: { toggle() {} },
    setAttribute(key, value) { this.attributes[key] = String(value); },
    addEventListener(event, callback) { this.listeners[event] = callback; },
    click() { this.listeners.click?.(); },
    querySelector() { return this.check; },
    check: { textContent: '' },
  });
  const elements = Object.fromEntries(['period', 'query', 'search', 'resultTitle', 'resultNote', 'grid'].map(id => [id, element()]));
  elements.period.value = '30';
  const types = ['live', 'gear'].map(type => element({ type }));
  const sorts = ['low', 'high', 'sales', 'new'].map(sort => element({ sort }));
  let tool;
  const document = {
    querySelector(selector) {
      if (selector.startsWith('#')) return elements[selector.slice(1)];
      const match = selector.match(/^\[data-(type|sort)="(.+)"\]$/);
      return (match[1] === 'type' ? types : sorts).find(e => e.dataset[match[1]] === match[2]);
    },
    querySelectorAll(selector) {
      if (selector === '[data-type]') return types;
      if (selector === '[data-sort]') return sorts;
      if (selector === '.card') return Array.from({ length: names().length });
      throw Error(`Unexpected selector ${selector}`);
    },
  };
  if (withTool) document.modelContext = { registerTool(value) { tool = value; } };
  function names() { return [...elements.grid.innerHTML.matchAll(/<h3>(.*?)<\/h3>/g)].map(m => m[1]); }
  const context = vm.createContext({ document });
  vm.runInContext(source, context, { filename: 'dist/app.js' });
  return {
    elements, types, sorts, names, context, get tool() { return tool; },
    type(value) { types.find(e => e.dataset.type === value).click(); },
    sort(value) { sorts.find(e => e.dataset.sort === value).click(); },
    period(value) { elements.period.value = String(value); elements.period.listeners.change(); },
    search(value) { elements.query.value = value; elements.query.listeners.input({ target: elements.query }); },
  };
}

test('default live products: 30-day registration window and ascending prices', () => {
  const app = setup();
  assert.deepEqual(app.names(), ['네온테트라', '체리새우', '옐로우 구피', '피그미 코리도라스']);
  assert.equal(app.elements.resultTitle.textContent, '생물 4개');
});

test('7/30/90-day windows for both categories and inclusive boundary', () => {
  const app = setup();
  for (const type of ['live', 'gear']) {
    app.type(type);
    for (const [days, count] of [[7, 2], [30, 4], [90, 6]]) {
      app.period(days);
      assert.equal(app.names().length, count);
    }
  }
  app.type('live');
  app.period(12);
  assert.ok(app.names().includes('체리새우'));
  app.period(11);
  assert.ok(!app.names().includes('체리새우'));
});

test('descending price and newest registration order', () => {
  const app = setup();
  app.sort('high');
  assert.deepEqual(app.names(), ['피그미 코리도라스', '옐로우 구피', '체리새우', '네온테트라']);
  app.sort('new');
  assert.deepEqual(app.names(), ['네온테트라', '옐로우 구피', '체리새우', '피그미 코리도라스']);
  app.type('gear');
  app.sort('low');
  assert.deepEqual(app.names(), ['스펀지 여과기', '열대어 사료', '세라믹 여과재', '수조용 히터']);
});

test('trimmed search, form submission, case-insensitive matching and empty results', () => {
  const app = setup();
  app.search('  구피  ');
  assert.deepEqual(app.names(), ['옐로우 구피']);
  app.type('gear');
  app.period(90);
  app.search('led');
  assert.deepEqual(app.names(), ['수초용 LED 조명']);
  app.elements.query.value = '  히터  ';
  let prevented = false;
  app.elements.search.listeners.submit({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.deepEqual(app.names(), ['수조용 히터']);
  app.search('없는상품');
  assert.deepEqual(app.names(), []);
  assert.match(app.elements.grid.innerHTML, /조건에 맞는 샘플이 없어요/);
});

test('sales displays unavailable notice and no fabricated ranking', () => {
  const app = setup();
  app.sort('sales');
  assert.deepEqual(app.names(), []);
  assert.match(app.elements.grid.innerHTML, /판매량 데이터가 필요해요/);
  assert.match(app.elements.grid.innerHTML, /임의 순위를 만들지 않습니다/);
  app.sort('low');
  assert.equal(app.names().length, 4);
});

test('registered filter tool updates UI and rejects invalid inputs', () => {
  const app = setup(true);
  const result = app.tool.execute({ type: 'gear', sort: 'high', days: 90, query: '수조' });
  assert.deepEqual(app.names(), ['유리 수조', '수조용 히터']);
  assert.equal(result.count, 2);
  assert.equal(result.sample, true);
  assert.equal(result.salesDataAvailable, false);
  assert.equal(app.types[1].attributes['aria-pressed'], 'true');
  assert.equal(app.sorts[1].attributes['aria-pressed'], 'true');
  for (const input of [null, {}, { type: 'live', sort: 'low', days: 8 }, { type: 'bad', sort: 'low', days: 7 }, { type: 'live', sort: 'bad', days: 7 }, { type: 'live', sort: 'low', days: 7, query: 1 }]) {
    assert.throws(() => app.tool.execute(input), /잘못된 조회 조건/);
  }
  assert.equal(app.tool.execute({ type: 'live', sort: 'sales', days: 7 }).count, 0);
});

test('HTML references the preserved local script and declares sample limitations', () => {
  const html = fs.readFileSync(path.join(__dirname, '../dist/index.html'), 'utf8');
  assert.match(html, /<script src="app\.js"><\/script>/);
  assert.match(html, /lang="ko"/);
  assert.match(html, /2026\.10\.08/);
  assert.match(html, /가상 데이터/);
  assert.ok(!html.includes('&lt;!doctype'));
});

test('source bytes match the supplied UTF-8 SHA256 hashes', () => {
  for (const [file, expected] of [
    ['index.html', '8f22d1999ea6639db4fd8d9a4730c5a001116216cbd29d54d7d6e0b5b9bdb28d'],
    ['app.js', 'e622de0f9c036d88508fd130d0426cf1c18a1062ff3fa99a462a9a3e197c985f'],
  ]) {
    const bytes = fs.readFileSync(path.join(__dirname, '../dist', file));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expected);
  }
});
