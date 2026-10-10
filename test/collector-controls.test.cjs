'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { validateControls, loadControls, sourceDecision, scheduleDecision, DEFAULT_INTERVALS } = require('../scripts/collector/controls.cjs');
const registry = { sources: [{ id: 'retailer-02', enabled: true }, { id: 'retailer-01', enabled: true }] };
const config = (enabled = true) => ({ schemaVersion: 1, intervalsHours: { ...DEFAULT_INTERVALS }, sources: { 'retailer-01': { enabled } } });
test('strict controls validator normalizes sorted IDs, defaults newly missing sources OFF, and hashes semantic configuration', () => {
  const first = validateControls(config(), registry);
  assert.equal(first.config.sources['retailer-02'].enabled, false);
  assert.deepEqual(first.missingSourceIds, ['retailer-02']);
  assert.deepEqual(Object.keys(first.config.sources), ['retailer-01', 'retailer-02']);
  const other = { sources: { 'retailer-02': { enabled: false }, 'retailer-01': { enabled: true } }, intervalsHours: { reconcile: 24, gear: 12, live: 6 }, schemaVersion: 1 };
  assert.equal(first.revision, validateControls(other, registry).revision);
  assert.equal(first.revision.length, 64);
  assert.notEqual(first.revision, validateControls(config(false), registry).revision);
  for (const mutate of [x => { x.schemaVersion = 2; }, x => { x.unknown = true; }, x => { x.intervalsHours.live = 3; }, x => { x.intervalsHours.gear = 6; }, x => { x.intervalsHours.reconcile = 12; }, x => { x.intervalsHours.live = '6'; }, x => { delete x.intervalsHours.gear; }, x => { x.sources['retailer-01'].enabled = 'true'; }, x => { x.sources['retailer-01'].endpoint = 'https://bad.invalid'; }, x => { x.sources['unknown'] = { enabled: true }; }, x => { x.sources = []; }]) {
    const invalid = config(); mutate(invalid); assert.throws(() => validateControls(invalid, registry));
  }
});
test('ON is subordinate to registry, technical and persisted refusal/backoff gates', () => {
  const controls = validateControls(config(), registry), source = registry.sources[1], now = Date.parse('2026-10-09T00:00:00Z');
  assert.equal(sourceDecision(source, {}, controls, now).effectiveEnabled, true);
  assert.equal(sourceDecision({ ...source, enabled: false }, {}, controls, now).reason, 'registry_disabled');
  assert.equal(sourceDecision({ ...source, technicalReadiness: 'blocked' }, {}, controls, now).reason, 'technical_blocked');
  assert.equal(sourceDecision(source, { requiresManualReview: true }, controls, now).reason, 'manual_review');
  assert.equal(sourceDecision(source, { discoveryProgress: { requiresManualReview: true } }, controls, now).reason, 'manual_review');
  assert.equal(sourceDecision(source, { blockedUntil: '2026-10-10T00:00:00Z' }, controls, now).reason, 'backoff');
  assert.equal(sourceDecision(source, {}, validateControls(config(false), registry), now).reason, 'requested_off');
});
test('UTC slot windows honor every preset, delayed jitter, clock rollback, and interval changes', () => {
  const { scheduleWindow, INTERVAL_PRESETS } = require('../scripts/collector/controls.cjs');
  const now = Date.parse('2026-10-09T00:00:00Z');
  for (const [mode, presets] of Object.entries(INTERVAL_PRESETS)) for (const interval of presets) {
    const raw = config(); raw.intervalsHours[mode] = interval; const controls = validateControls(raw, registry);
    const window = scheduleWindow(mode, interval, now), delayed = Date.parse(window.startAt) + 9 * 60000;
    const status = { schedule: { modes: { [mode]: { lastAutomatedAttemptAt: new Date(delayed).toISOString(), lastAutomatedWindow: window, lastManualAttemptAt: window.endAt } } } };
    assert.equal(scheduleDecision(controls, status, { mode, runTrigger: 'schedule', now: Date.parse(window.endAt) - 1 }).due, false);
    assert.equal(scheduleDecision(controls, status, { mode, runTrigger: 'schedule', now: Date.parse(window.endAt) + 2 * 60000 }).due, true);
    assert.equal(scheduleDecision(controls, status, { mode, runTrigger: 'schedule', now: delayed - 1 }).reason, 'clock_rollback');
    assert.equal(scheduleDecision(controls, status, { mode, runTrigger: 'workflow_dispatch', now: delayed }).reason, 'manual_bypass');
  }
  const status = { schedule: { modes: { live: { lastAutomatedAttemptAt: '2026-10-09T00:26:00Z' } } } };
  const longer = config(); longer.intervalsHours.live = 12;
  assert.equal(scheduleDecision(validateControls(longer, registry), status, { mode: 'live', runTrigger: 'schedule', now: Date.parse('2026-10-09T06:20:00Z') }).due, false);
  assert.equal(scheduleDecision(validateControls(longer, registry), status, { mode: 'live', runTrigger: 'schedule', now: Date.parse('2026-10-09T12:20:00Z') }).due, true);
  assert.equal(scheduleDecision(validateControls(config(), registry), status, { mode: 'live', runTrigger: 'schedule', now: Date.parse('2026-10-09T06:20:00Z') }).due, true);
  assert.throws(() => scheduleDecision(validateControls(config(), registry), {}, { mode: 'all', runTrigger: 'schedule' }), /requires/);
});
function fixture() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'aqua-controls-')), repo = path.join(__dirname, '..');
  fs.cpSync(path.join(repo, 'scripts'), path.join(cwd, 'scripts'), { recursive: true });
  for (const dir of ['dist', 'sources', '.collector']) fs.mkdirSync(path.join(cwd, dir));
  for (const file of ['data-model.js', 'gear-taxonomy.js']) fs.copyFileSync(path.join(repo, 'dist', file), path.join(cwd, 'dist', file));
  const save = (file, value) => fs.writeFileSync(path.join(cwd, file), JSON.stringify(value));
  const read = file => JSON.parse(fs.readFileSync(path.join(cwd, file), 'utf8'));
  const host = 'https://example.invalid', product = host + '/product/fish/99/', category = host + '/category/betta/1/';
  const source = { id: 'retailer-01', name: 'Fixture', sourceDomain: 'example.invalid', officialURL: host, enabled: true, adapter: 'product_jsonld', products: [{ url: product, type: 'live', subtype: 'fish' }], maxRequests: 5, delayMs: 0, cacheTtlMs: 10800000, timeoutMs: 1000, maxBytes: 20000 };
  const snapshot = require('./isolated-snapshot.cjs')(); save('dist/source-snapshot.json', snapshot);
  save('dist/catalog.json', require('../scripts/build-catalog.cjs').buildCatalog(snapshot));
  save('dist/collector-status.json', { sources: [], schedule: { schemaVersion: 1, modes: { gear: { lastAutomatedAttemptAt: '2026-10-08T00:00:00Z', lastSuccessAt: '2026-10-08T00:01:00Z', customEvidence: 'retain gear lane' }, reconcile: { lastAutomatedAttemptAt: '2026-10-07T00:00:00Z', lastFailureAt: '2026-10-07T00:02:00Z', lastOutcome: 'failure' } } } });
  save('.collector/state.json', { sources: {} });
  save('sources/registry.json', { sources: [source] }); save('sources/collector-controls.json', config());
  save('sources/discovery-seeds.json', { sources: [{ id: source.id, adapter: 'cafe24_category_links', maxPages: 1, maxProducts: 3, maxProductVerifications: 2, categories: [{ url: category, label: '베타', type: 'live', subtype: 'fish', reviewBasis: 'Fixture' }] }] });
  const html = '<h1>검증 베타</h1><p>1,000원</p><script type="application/ld+json">' + JSON.stringify({ '@type': 'Product', name: '검증 베타', sku: '99', url: product, offers: { '@type': 'Offer', price: 1000, priceCurrency: 'KRW' } }) + '</script>';
  save('transport.json', { [host + '/robots.txt']: { text: 'User-agent: *\nAllow: /', status: 200 }, [product]: { text: html, status: 200 }, [category]: { text: '<ul class="prdList"><a href="/product/fish/99/">베타</a></ul><div class="xans-product-normalpaging"></div>', status: 200 } });
  // Isolated injection: config is a fixture-local sources/collector-controls.json;
  // --controls can point to another fixture file. Transport intercepts every request,
  // never falls back to network, and fixes Date only inside this child process.
  fs.writeFileSync(path.join(cwd, 'transport.cjs'), `
const fs=require('fs'),path=require('path'),root=__dirname,RealDate=Date;
global.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[process.env.FIXTURE_NOW]));}static now(){return RealDate.parse(process.env.FIXTURE_NOW);}};
const pages=JSON.parse(fs.readFileSync(path.join(root,'transport.json'))),calls=[],checkpoints=[];
global.fetch=async url=>{calls.push(url);fs.writeFileSync(path.join(root,'calls.json'),JSON.stringify(calls));if(!(url in pages))throw Error('Fixture rejected network URL '+url);const p=pages[url];if(p.error)throw Error(p.error);return new Response(p.text,{status:p.status});};
const rename=fs.renameSync.bind(fs);fs.renameSync=(a,b)=>{rename(a,b);if(b==='dist/collector-status.json'){checkpoints.push(JSON.parse(fs.readFileSync(b)));fs.writeFileSync(path.join(root,'checkpoints.json'),JSON.stringify(checkpoints));}};
`);
  const run = ({ trigger = 'schedule', now = '2026-10-09T00:26:00Z', script = 'collect-catalog.cjs', args = ['--mode', 'live', '--refresh-known', '--publish', '--quiet'] } = {}) => {
    save('calls.json', []); save('checkpoints.json', []);
    return spawnSync(process.execPath, ['--require', path.join(cwd, 'transport.cjs'), 'scripts/' + script, ...args], { cwd, encoding: 'utf8', timeout: 15000, env: { ...process.env, FIXTURE_NOW: now, GITHUB_EVENT_NAME: trigger, GITHUB_ACTIONS: trigger === 'schedule' ? 'true' : 'false', GITHUB_RUN_ID: 'fixture-run' } });
  };
  return { cwd, save, read, source, product, host, run, cleanup: () => fs.rmSync(cwd, { recursive: true, force: true }) };
}
test('actual CLI persists attempts before requests; fresh checkouts skip until due and preserve unrelated lane state at every checkpoint', () => {
  const f = fixture();
  try {
    const previous = f.read('dist/collector-status.json').schedule.modes;
    let result = f.run(); assert.equal(result.status, 0, result.stderr);
    let status = f.read('dist/collector-status.json');
    assert.equal(status.schedule.modes.live.lastAutomatedAttemptAt, '2026-10-09T00:26:00.000Z');
    assert.equal(status.schedule.modes.live.lastAutomatedOutcome, 'success');
    assert.equal(status.schedule.modes.live.lastAutomatedSuccessAt, '2026-10-09T00:26:00.000Z');
    assert.equal(f.read('calls.json').length, 2);
    assert.equal(status.schedule.modes.live.lastAutomatedWindow.startAt, '2026-10-09T00:17:00.000Z');
    const checkpoints = f.read('checkpoints.json'); assert.equal(checkpoints[0].schedule.modes.live.lastOutcome, 'running');
    for (const checkpoint of checkpoints) { assert.deepEqual(checkpoint.schedule.modes.gear, previous.gear); assert.deepEqual(checkpoint.schedule.modes.reconcile, previous.reconcile); }
    fs.rmSync(path.join(f.cwd, '.collector'), { recursive: true, force: true });
    result = f.run({ now: '2026-10-09T06:16:59Z' }); assert.equal(result.status, 0, result.stderr);
    status = f.read('dist/collector-status.json'); assert.equal(status.executionSkippedReason, 'not_due'); assert.deepEqual(f.read('calls.json'), []);
    assert.equal(status.schedule.modes.live.lastAutomatedAttemptAt, '2026-10-09T00:26:00.000Z'); assert.equal(status.schedule.modes.live.lastOutcome, 'success');
    result = f.run({ now: '2026-10-09T06:20:00Z' }); assert.equal(result.status, 0, result.stderr); assert.equal(f.read('calls.json').length, 2);
    assert.equal(f.read('dist/collector-status.json').schedule.modes.live.lastAutomatedAttemptAt, '2026-10-09T06:20:00.000Z');
  } finally { f.cleanup(); }
});
test('manual bypass does not postpone scheduled due time, and manual OFF makes zero requests and preserves product bytes', () => {
  const f = fixture();
  try {
    assert.equal(f.run().status, 0); f.save('.collector/state.json', { sources: {} });
    let result = f.run({ trigger: 'workflow_dispatch', now: '2026-10-09T01:00:00Z' }); assert.equal(result.status, 0, result.stderr); assert.equal(f.read('calls.json').length, 2);
    let status = f.read('dist/collector-status.json'); assert.equal(status.schedule.modes.live.lastAutomatedAttemptAt, '2026-10-09T00:26:00.000Z'); assert.equal(status.schedule.modes.live.lastManualAttemptAt, '2026-10-09T01:00:00.000Z');
    f.save('sources/collector-controls.json', config(false));
    const snapshot = fs.readFileSync(path.join(f.cwd, 'dist/source-snapshot.json'), 'utf8'), catalog = fs.readFileSync(path.join(f.cwd, 'dist/catalog.json'), 'utf8');
    const prior = f.read('.collector/state.json'); prior.sources['retailer-01'].products[0].price_krw = 777; prior.sources['retailer-01'].cacheOnly = false; f.save('.collector/state.json', prior);
    result = f.run({ trigger: 'workflow_dispatch', now: '2026-10-09T02:00:00Z' }); assert.equal(result.status, 0, result.stderr); assert.deepEqual(f.read('calls.json'), []);
    status = f.read('dist/collector-status.json'); assert.equal(status.sources[0].controlDecision.reason, 'requested_off'); assert.notEqual(status.collectorControls.evaluatedRevision,status.collectorControls.revision); assert.equal(status.schedule.modes.live.lastManualAttemptAt, '2026-10-09T01:00:00.000Z');
    assert.equal(fs.readFileSync(path.join(f.cwd, 'dist/source-snapshot.json'), 'utf8'), snapshot); assert.equal(fs.readFileSync(path.join(f.cwd, 'dist/catalog.json'), 'utf8'), catalog);
    result = f.run({ now: '2026-10-09T08:00:00Z' }); assert.equal(result.status, 0, result.stderr); assert.deepEqual(f.read('calls.json'), []); assert.equal(f.read('dist/collector-status.json').schedule.modes.live.lastAutomatedAttemptAt, '2026-10-09T00:26:00.000Z');
    f.save('sources/collector-controls.json', config(true)); f.save('.collector/state.json',{sources:{}});
    result = f.run({ now: '2026-10-09T08:01:00Z' }); assert.equal(result.status,0,result.stderr); assert.equal(f.read('calls.json').length,2); assert.equal(f.read('dist/collector-status.json').schedule.modes.live.lastAutomatedWindow.startAt,'2026-10-09T06:17:00.000Z');
  } finally { f.cleanup(); }
});
test('cache-only evaluation and no-known-product lane do not count as attempts', () => {
  const f = fixture();
  try {
    const pages = f.read('transport.json'), cache = Object.fromEntries(Object.entries(pages).map(([url, p]) => [url, { text: p.text, fetchedAt: '2026-10-08T23:30:00Z' }]));
    f.save('.collector/state.json', { sources: { 'retailer-01': { cache, products: [], collectorLastAttempt: '2026-10-08T20:00:00Z', collectorLastSuccess: '2026-10-08T20:00:00Z' } } });
    let result = f.run(); assert.equal(result.status, 0, result.stderr); let status = f.read('dist/collector-status.json');
    assert.deepEqual(f.read('calls.json'), []); assert.equal(status.schedule.modes.live.lastAutomatedAttemptAt, undefined); assert.equal(status.sources[0].collectorLastAttempt, '2026-10-08T20:00:00Z'); assert.equal(status.sources[0].collectorLastSuccess, '2026-10-08T20:00:00Z');
    result = f.run({ args: ['--mode', 'gear', '--refresh-known', '--publish'] }); assert.equal(result.status, 0, result.stderr); assert.deepEqual(f.read('calls.json'), []); assert.equal(f.read('dist/collector-status.json').schedule.modes.gear.lastAutomatedAttemptAt, '2026-10-08T00:00:00Z');
  } finally { f.cleanup(); }
});
test('failure records an automated failure without erasing prior success and survives subsequent due skip', () => {
  const f = fixture();
  try {
    assert.equal(f.run().status, 0); f.save('.collector/state.json', { sources: {} }); const pages = f.read('transport.json'); pages[f.host + '/robots.txt'] = { text: 'Forbidden', status: 403 }; f.save('transport.json', pages);
    const result = f.run({ now: '2026-10-09T06:20:00Z' }); assert.equal(result.status, 1, result.stderr); assert.equal(f.read('calls.json').length, 1);
    let lane = f.read('dist/collector-status.json').schedule.modes.live; assert.equal(lane.lastAutomatedFailureAt, '2026-10-09T06:20:00.000Z'); assert.equal(lane.lastAutomatedSuccessAt, '2026-10-09T00:26:00.000Z'); assert.equal(lane.lastOutcome, 'failure');
    assert.equal(f.run({ now: '2026-10-09T07:00:00Z' }).status, 0); assert.deepEqual(f.read('calls.json'), []); lane = f.read('dist/collector-status.json').schedule.modes.live; assert.equal(lane.lastOutcome, 'failure'); assert.equal(lane.lastAutomatedAttemptAt, '2026-10-09T06:20:00.000Z');
  } finally { f.cleanup(); }
});
test('actual CLI honors registry disabled, technical block, public quarantine and backoff despite requested ON', () => {
  for (const kind of ['registry_disabled', 'technical_blocked', 'manual_review', 'backoff']) {
    const f = fixture();
    try {
      if (kind === 'registry_disabled') f.source.enabled = false;
      if (kind === 'technical_blocked') f.source.technicalReadiness = 'blocked'; f.save('sources/registry.json', { sources: [f.source] });
      if (kind === 'manual_review' || kind === 'backoff') {
        const report = f.read('dist/collector-status.json'); report.sources = [{ id: f.source.id, discoveryProgress: { requiresManualReview: kind === 'manual_review', blockedUntil: kind === 'backoff' ? '2026-10-10T00:00:00Z' : null } }]; f.save('dist/collector-status.json', report);
        f.save('.collector/state.json', { sources: { [f.source.id]: { dailyDiscovery: {}, requiresManualReview: false, blockedUntil: null } } });
      }
      const result = f.run(); assert.equal(result.status, 0, result.stderr); assert.deepEqual(f.read('calls.json'), []);
      const status = f.read('dist/collector-status.json'); assert.equal(status.sources[0].controlDecision.reason, kind); assert.equal(status.schedule.modes.live.lastAutomatedAttemptAt, undefined);
    } finally { f.cleanup(); }
  }
});
test('requested ON cannot override robots disallow', () => {
  const f = fixture();
  try {
    const pages = f.read('transport.json'); pages[f.host + '/robots.txt'].text = 'User-agent: *\nDisallow: /'; f.save('transport.json', pages);
    const result = f.run(); assert.equal(result.status, 1, result.stderr); assert.deepEqual(f.read('calls.json'), [f.host + '/robots.txt']); assert.match(f.read('dist/collector-status.json').sources[0].errors.join(' '), /robots_denied/);
  } finally { f.cleanup(); }
});
test('missing real-registry controls and malformed/unknown config fail closed; explicit isolated config injection is supported', () => {
  const f = fixture();
  try {
    const raw = config(); raw.sources.unknown = { enabled: true }; f.save('sources/collector-controls.json', raw); let result = f.run(); assert.equal(result.status, 1); assert.deepEqual(f.read('calls.json'), []); assert.match(result.stderr, /Unknown source/);
    f.save('isolated-controls.json', config(false)); result = f.run({ args: ['--mode', 'live', '--publish', '--controls', 'isolated-controls.json'] }); assert.equal(result.status, 0, result.stderr); assert.deepEqual(f.read('calls.json'), []);
    fs.rmSync(path.join(f.cwd, 'sources/collector-controls.json')); f.source.officialURL = 'https://official.example.com'; f.save('sources/registry.json', { sources: [f.source] }); result = f.run(); assert.equal(result.status, 1); assert.deepEqual(f.read('calls.json'), []); assert.match(result.stderr, /collector-controls/);
  } finally { f.cleanup(); }
});
test('experimental discovery and coverage batch obey OFF, including saved resume slots, and preserve durable schedule lanes', () => {
  const f = fixture();
  try {
    f.save('sources/collector-controls.json', config(false)); const before = f.read('dist/collector-status.json').schedule;
    let result = f.run({ trigger: 'local', script: 'discover-catalog.cjs', args: ['--source', 'retailer-01', '--verify', '1'] }); assert.equal(result.status, 0, result.stderr); assert.deepEqual(f.read('calls.json'), []); assert.equal(f.read('.collector/discovery-report-retailer-01.json').controlDecision.reason, 'requested_off');
    result = f.run({ trigger: 'local', script: 'collect-coverage-batch.cjs', args: ['--rounds', '1', '--minutes', '1'] }); assert.equal(result.status, 0, result.stderr); assert.deepEqual(f.read('calls.json'), []); assert.deepEqual(f.read('dist/collector-status.json').schedule, before);
    const session = f.read('.collector/coverage-batch-session.json'); session.finishedAt = null; session.activePid = null; session.rounds = [{ index: 1, startedAt: '2026-10-09T00:00:00Z', before: session.before, plan: [{ id: f.source.id, mode: 'explore', maxRequests: 2 }], sources: [], finishedAt: null }]; f.save('.collector/coverage-batch-session.json', session);
    result = f.run({ trigger: 'local', script: 'collect-coverage-batch.cjs', args: ['--resume'] }); assert.equal(result.status, 0, result.stderr); assert.deepEqual(f.read('calls.json'), []); assert.equal(f.read('.collector/coverage-batch-session.json').rounds[0].sources[0].controlDecision.reason, 'requested_off'); assert.deepEqual(f.read('dist/collector-status.json').schedule, before);
    for (const script of ['discover-catalog.cjs', 'collect-coverage-batch.cjs']) { result = f.run({ script, args: script === 'discover-catalog.cjs' ? ['--source', 'retailer-01'] : [] }); assert.equal(result.status, 1); assert.deepEqual(f.read('calls.json'), []); assert.match(result.stderr, /Scheduled.*collect-catalog/); }
  } finally { f.cleanup(); }
});


test('checkpoint restoration ORs all refusal flags and takes the latest valid hold across cold and warm state', () => {
  const { restoreCheckpoint } = require('../scripts/collector/queue-policy.cjs');
  const source = { id: 'retailer-01', sourceDomain: 'example.invalid' };
  const times = [null, 'invalid date', '2026-10-10T00:00:00Z', '2026-10-11T00:00:00Z'];
  for (const warm of [false, true]) {
    for (const priorHold of [false, true]) for (const checkpointHold of [false, true]) for (const reportHold of [false, true]) {
      const previous = { requiresManualReview: priorHold, ...(warm ? { dailyDiscovery: {} } : {}) };
      const report = { requiresManualReview: reportHold, discoveryProgress: { requiresManualReview: checkpointHold } };
      const restored = restoreCheckpoint(previous, { items: [] }, source, report);
      assert.equal(restored.requiresManualReview, priorHold || checkpointHold || reportHold, JSON.stringify({ warm, priorHold, checkpointHold, reportHold }));
      assert.equal(previous.requiresManualReview, priorHold, 'input state must remain unchanged');
    }
    for (const priorUntil of times) for (const checkpointUntil of times) for (const reportUntil of times) {
      const previous = { blockedUntil: priorUntil, ...(warm ? { dailyDiscovery: {} } : {}) };
      const report = { blockedUntil: reportUntil, discoveryProgress: { blockedUntil: checkpointUntil } };
      const restored = restoreCheckpoint(previous, { items: [] }, source, report);
      const expected = [priorUntil, checkpointUntil, reportUntil].filter(t => typeof t === 'string' && Number.isFinite(Date.parse(t))).sort((a,b) => Date.parse(b)-Date.parse(a))[0] || null;
      assert.equal(restored.blockedUntil, expected, JSON.stringify({ warm, priorUntil, checkpointUntil, reportUntil }));
      assert.equal(previous.blockedUntil, priorUntil, 'input state must remain unchanged');
    }
  }
  assert.equal(restoreCheckpoint({ requiresManualReview: true }, { items: [] }, source, {}).requiresManualReview, true);
  assert.equal(restoreCheckpoint({}, { items: [] }, source, { status: 'quarantined' }).requiresManualReview, true);
});
test('requested ON cannot erase cold cached holds through an older false/null public checkpoint', () => {
  for (const kind of ['manual_review', 'backoff']) {
    const f = fixture();
    try {
      f.save('.collector/state.json', { sources: { [f.source.id]: { requiresManualReview: kind === 'manual_review', blockedUntil: kind === 'backoff' ? '2026-10-11T00:00:00Z' : null } } });
      const published = f.read('dist/collector-status.json');
      published.sources = [{ id: f.source.id, requiresManualReview: false, blockedUntil: null, discoveryProgress: { requiresManualReview: false, blockedUntil: null } }];
      f.save('dist/collector-status.json', published);
      const result = f.run(); assert.equal(result.status, 0, result.stderr); assert.deepEqual(f.read('calls.json'), []);
      const status = f.read('dist/collector-status.json'); assert.equal(status.sources[0].controlDecision.reason, kind); assert.equal(status.schedule.modes.live.lastAutomatedAttemptAt, undefined);
      const saved = f.read('.collector/state.json').sources[f.source.id];
      assert.equal(saved.requiresManualReview, kind === 'manual_review'); assert.equal(saved.blockedUntil, kind === 'backoff' ? '2026-10-11T00:00:00Z' : null);
    } finally { f.cleanup(); }
  }
});
