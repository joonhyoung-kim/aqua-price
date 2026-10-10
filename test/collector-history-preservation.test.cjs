'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const NOW = '2026-10-09T06:20:00.000Z';
const THEN = '2026-10-08T00:20:00.000Z';
const IDS = ['retailer-01', 'retailer-02', 'retailer-03'];
function source(id, index) {
  const host = 'https://fixture-' + index + '.invalid';
  return { id, name: 'Isolated history fixture ' + index, sourceDomain: new URL(host).hostname, officialURL: host, enabled: true, adapter: 'product_jsonld', products: [{ url: host + '/product/fish/1/', type: 'live', subtype: 'fish' }], maxRequests: 5, delayMs: 0, cacheTtlMs: 10800000, timeoutMs: 1000, maxBytes: 30000 };
}
function historicalRow(cfg, index) {
  const liveUrl = cfg.officialURL + '/category/fish/1/', gearUrl = cfg.officialURL + '/category/supplies/2/';
  const liveKey = cfg.sourceDomain + ':1', gearKey = cfg.sourceDomain + ':2';
  const cursor = { nextCategoryIndex: index + 4, nextCategoryKey: liveKey, categories: { [liveKey]: { entryUrl: liveUrl, nextUrl: liveUrl + '?page=2', seenKeys: [cfg.sourceDomain + ':99'], visitedPageUrls: [liveUrl], lastAttempt: THEN } } };
  return { id: cfg.id, domain: cfg.sourceDomain, status: index === 1 ? 'partial_failure' : 'success', collectorLastAttempt: THEN, collectorLastSuccess: '2026-10-07T00:20:00.000Z', count: 37 + index, requests: 88, attempted: true, attemptedThisExecution: true, evaluatedThisExecution: true, executionRunId: 'historical-run-' + index, automatedExecutionVerified: true,
    coverage: { kind: 'known_product_urls', visitedPages: 17 + index, historicalMarker: cfg.id }, refreshScope: { verifiedUrlCount: 80 + index }, discovery: { discoveryScope: 'live', lastAttempt: THEN, status: 'partial_discovery', historicalMarker: cfg.id }, errors: index === 1 ? ['historical_error_preserved'] : [], customHistory: { historical: cfg.id },
    discoveryProgress: { schemaVersion: 2, cursor, categories: [{ url: liveUrl, historical: true }], categoryTree: { schemaVersion: 1, nodes: [{ key: liveKey, url: liveUrl, label: '물고기', scope: 'live' }, { key: gearKey, url: gearUrl, label: '용품', scope: 'gear' }], excludedCategoryCount: 0, reviewCategoryCount: 0, historicalMarker: cfg.id }, treeCoverage: { historicalMarker: cfg.id, allowedCategoryCount: 1 }, gearTreeCoverage: { historicalGearMarker: cfg.id }, gearDiscovery: { lastAttempt: THEN, cursor: { nextCategoryIndex: 9 + index, nextCategoryKey: gearKey, categories: { [gearKey]: { nextUrl: gearUrl + '?page=3', seenKeys: [cfg.sourceDomain + ':gear-1'] } } }, categories: [{ url: gearUrl, historical: true }] },
      gearDetailQueueCursor: 12 + index, nextDiscoveryScope: 'gear', priceRefreshCursor: { live: 2 + index, gear: 7 + index, reconcile: 3 }, classificationRevalidation: [{ id: cfg.id, historical: true }], detailQueueCursor: 6 + index,
      pendingCandidates: [{ url: cfg.officialURL + '/product/fish/99/', type: 'live', subtype: 'fish', historicalMarker: cfg.id }], reviewQueue: [{ key: cfg.sourceDomain + ':98', historicalMarker: cfg.id }], excludedCandidates: [{ key: cfg.sourceDomain + ':97', historicalMarker: cfg.id }], discoveryLedger: { entries: [{ key: cfg.sourceDomain + ':96', historicalMarker: cfg.id }] }, requiresManualReview: false, blockedUntil: null, unknownFutureCheckpointField: { mustSurvive: cfg.id } }
  };
}
function fixture({ scenario = 'success', warm = null, allOff = false, dueSkip = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aqua-history-preservation-')), repo = path.join(__dirname, '..');
  fs.cpSync(path.join(repo, 'scripts'), path.join(root, 'scripts'), { recursive: true });
  for (const dir of ['sources', 'dist']) fs.mkdirSync(path.join(root, dir));
  for (const file of ['data-model.js', 'gear-taxonomy.js']) fs.copyFileSync(path.join(repo, 'dist', file), path.join(root, 'dist', file));
  const save = (file, value) => { fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.writeFileSync(path.join(root, file), JSON.stringify(value)); };
  const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
  const registry = { sources: IDS.map(source) }, history = registry.sources.map(historicalRow);
  const schedule = { schemaVersion: 1, modes: { live: { lastAutomatedAttemptAt: dueSkip ? NOW : THEN, lastAutomatedOutcome: 'success', lastSuccessAt: THEN }, gear: { lastAutomatedAttemptAt: THEN, lastOutcome: 'failure', lastFailureAt: THEN, durableGearEvidence: 'preserve' }, reconcile: { lastAutomatedAttemptAt: THEN, lastOutcome: 'success', lastSuccessAt: THEN, durableReconcileEvidence: 'preserve' } } };
  save('sources/registry.json', registry); save('sources/discovery-seeds.json', { sources: [] });
  save('sources/collector-controls.json', { schemaVersion: 1, intervalsHours: { live: 6, gear: 12, reconcile: 24 }, sources: Object.fromEntries(IDS.map((id, index) => [id, { enabled: !allOff && index !== 2 }])) });
  save('dist/source-snapshot.json', require('./isolated-snapshot.cjs')());
  save('dist/collector-status.json', { sources: history, schedule, mode: 'gear', githubRunId: 'old-root-run', nextSourceId: IDS[1] });
  if (warm) save('.collector/state.json', { sources: warm, runCursors: { gear: 2 }, runNextSourceIds: { gear: IDS[2] } });
  const cfg = registry.sources[0], product = cfg.products[0].url;
  const pages = { [cfg.officialURL + '/robots.txt']: 'User-agent: *\nAllow: /', [product]: '<h1>검증 베타</h1><p>1,000원</p><script type="application/ld+json">' + JSON.stringify({ '@type': 'Product', name: '검증 베타', sku: '1', url: product, offers: { '@type': 'Offer', price: 1000, priceCurrency: 'KRW' } }) + '</script>' };
  save('transport.json', pages);
  fs.writeFileSync(path.join(root, 'transport.cjs'), `
const fs=require('fs'),path=require('path'),root=__dirname,RealDate=Date,pages=JSON.parse(fs.readFileSync(path.join(root,'transport.json')));
let clock=RealDate.parse(${JSON.stringify(NOW)}),calls=[];
global.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}};
const rename=fs.renameSync.bind(fs);fs.renameSync=(a,b)=>{rename(a,b);if(b==='dist/collector-status.json')fs.appendFileSync(path.join(root,'captured-checkpoints.ndjson'),fs.readFileSync(b,'utf8').replace(/\\n/g,'')+'\\n');};
global.fetch=async url=>{calls.push(url);fs.writeFileSync(path.join(root,'calls.json'),JSON.stringify(calls));if(!(url in pages))throw Error('Fixture refused unexpected network URL '+url);if(process.env.HISTORY_SCENARIO==='failure')return new Response('Forbidden',{status:403});if(process.env.HISTORY_SCENARIO==='deadline')clock+=20*60000;return new Response(pages[url],{status:200});};
if(process.env.HISTORY_SCENARIO==='fatal')require(path.join(root,'scripts/collector/cache-policy.cjs')).pruneCache=()=>{throw Error('fixture checkpoint failure');};
`);
  const run = (args = ['--source', IDS[0]]) => spawnSync(process.execPath, ['--require', path.join(root, 'transport.cjs'), 'scripts/collect-catalog.cjs', '--mode', 'live', '--refresh-known', '--publish', '--quiet', ...args], { cwd: root, encoding: 'utf8', timeout: 15000, env: { ...process.env, GITHUB_EVENT_NAME: 'schedule', GITHUB_ACTIONS: 'true', GITHUB_RUN_ID: 'current-fixture-run', HISTORY_SCENARIO: scenario } });
  const captures = () => fs.readFileSync(path.join(root, 'captured-checkpoints.ndjson'), 'utf8').trim().split('\n').map(JSON.parse);
  return { root, registry, history, schedule, save, read, pages, run, captures, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}
function assertUntouched(actual, old, { manualReview = false, blockedUntil = null } = {}) {
  for (const field of ['status', 'collectorLastAttempt', 'collectorLastSuccess', 'count', 'coverage', 'refreshScope', 'discovery', 'errors', 'customHistory', 'executionRunId']) assert.deepEqual(actual[field], old[field], old.id + '.' + field);
  assert.deepEqual(actual.discoveryProgress, { ...old.discoveryProgress, requiresManualReview: manualReview, blockedUntil });
  assert.equal(actual.requests, 0); assert.equal(actual.attempted, false); assert.equal(actual.attemptedThisExecution, false); assert.equal(actual.evaluatedThisExecution, false); assert.equal(actual.automatedExecutionVerified, false);
}
function assertOtherLanes(report, initial) {
  assert.deepEqual(report.schedule.modes.gear, initial.schedule.modes.gear);
  assert.deepEqual(report.schedule.modes.reconcile, initial.schedule.modes.reconcile);
}
test('cold run keeps every untouched public history field at initial, processed-source and final checkpoints', () => {
  const f = fixture();
  try {
    const result = f.run(); assert.equal(result.status, 0, result.stderr);
    const reports = f.captures(); assert.ok(reports.length >= 3); assert.equal(reports[0].checkpointOnly, true); assert.equal(reports.at(-1).checkpointOnly, false);
    assert.equal(reports[0].sources[0].status, 'success'); assert.equal(reports[0].sources[0].collectorLastSuccess, f.history[0].collectorLastSuccess);
    assert.equal(reports[0].sources[0].attempted, true); assert.equal(reports[0].sources[0].evaluatedThisExecution, false); assert.equal(reports[0].sources[0].automatedExecutionVerified, false);
    assert.deepEqual(reports[0].sources[0].discoveryProgress, f.history[0].discoveryProgress);
    assert.ok(reports.some(r => r.checkpointOnly && r.sources[0].evaluatedThisExecution));
    for (const report of reports) { for (const index of [1, 2]) assertUntouched(report.sources[index], f.history[index]); assertOtherLanes(report, f); }
    assert.equal(reports.at(-1).sources[0].automatedExecutionVerified, true);
    assert.deepEqual(reports.at(-1).sources[0].discoveryProgress.gearDiscovery, f.history[0].discoveryProgress.gearDiscovery);
    assert.equal(reports.at(-1).sources[0].discoveryProgress.gearDetailQueueCursor, f.history[0].discoveryProgress.gearDetailQueueCursor);
    assert.equal(reports.at(-1).sources[0].discoveryProgress.priceRefreshCursor.gear, f.history[0].discoveryProgress.priceRefreshCursor.gear);
  } finally { f.cleanup(); }
});
for (const scenario of ['failure', 'fatal', 'deadline']) test('cold ' + scenario + ' retains untouched and OFF history at every durable save', () => {
  const f = fixture({ scenario });
  try {
    const result = f.run(scenario === 'deadline' ? [] : ['--source', IDS[0]]); assert.equal(result.status, scenario === 'deadline' ? 0 : 1, result.stderr);
    const reports = f.captures(); assert.ok(reports.length >= 2);
    for (const report of reports) { for (const index of [1, 2]) assertUntouched(report.sources[index], f.history[index]); assertOtherLanes(report, f); }
    if (scenario === 'deadline') { assert.equal(reports.at(-1).executionBudgetLimited, true); assert.deepEqual(reports.at(-1).deferredSourceIds, IDS.slice(1)); }
    if (scenario === 'fatal') { assert.equal(reports.at(-1).executionError, 'fixture checkpoint failure'); assert.equal(reports.at(-1).sources[0].automatedExecutionVerified, false); assert.equal(reports.at(-1).sources[0].evaluatedThisExecution, false); assert.deepEqual(reports.at(-1).sources[0].discoveryProgress, f.history[0].discoveryProgress); }
    assert.equal(reports.at(-1).sources[0].collectorLastSuccess, f.history[0].collectorLastSuccess);
  } finally { f.cleanup(); }
});
for (const option of ['allOff', 'dueSkip']) test(option + ' saves keep all historical source payloads without advancing success or consuming requests', () => {
  const f = fixture({ [option]: true });
  try {
    const result = f.run([]); assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.existsSync(path.join(f.root, 'calls.json')), false);
    for (const report of f.captures()) { for (const index of [0, 1, 2]) assertUntouched(report.sources[index], f.history[index]); assertOtherLanes(report, f); }
    assert.equal(f.read('dist/collector-status.json').schedule.modes.live.lastAutomatedAttemptAt, f.schedule.modes.live.lastAutomatedAttemptAt);
  } finally { f.cleanup(); }
});
test('stale warm data cannot overwrite untouched public history; newer warm holds are merged without changing historical status', () => {
  const warm = { [IDS[1]]: { status: 'failed', collectorLastAttempt: '2026-10-01T00:00:00Z', collectorLastSuccess: '2026-10-01T00:00:00Z', dailyDiscovery: { cursor: null }, categoryTree: null, discoveryPending: [], discoveryReviewQueue: [], requiresManualReview: true, blockedUntil: '2026-10-12T00:00:00Z' }, [IDS[2]]: { dailyDiscovery: {}, requiresManualReview: false, blockedUntil: '2026-10-13T00:00:00Z' } };
  const f = fixture({ warm });
  try {
    const result = f.run(); assert.equal(result.status, 0, result.stderr);
    for (const report of f.captures()) { assertUntouched(report.sources[1], f.history[1], { manualReview: true, blockedUntil: '2026-10-12T00:00:00Z' }); assertUntouched(report.sources[2], f.history[2], { blockedUntil: '2026-10-13T00:00:00Z' }); assert.equal(report.sources[1].requiresManualReview, true); assertOtherLanes(report, f); }
  } finally { f.cleanup(); }
});
test('an interrupted public attempt timestamp never replaces genuinely newer warm progress or opposite-lane cursors', () => {
  const warm = { [IDS[1]]: { collectorLastAttempt: '2026-10-08T12:00:00Z', dailyDiscovery: { lastAttempt: '2026-10-08T12:00:00Z', cursor: { nextCategoryIndex: 123, categories: {} } }, gearDailyDiscovery: { lastAttempt: '2026-10-08T13:00:00Z', cursor: { nextCategoryIndex: 456, categories: {} } }, categoryTree: { nodes: [], warmUncommittedMarker: true }, discoveryPending: [{ url: 'https://fixture-1.invalid/product/fish/888/', type: 'live' }], requiresManualReview: true, blockedUntil: '2026-10-14T00:00:00Z' } };
  const f = fixture({ warm });
  try {
    const publicStatus = f.read('dist/collector-status.json'); publicStatus.sources[1].collectorLastAttempt = '2026-10-09T05:30:00Z'; publicStatus.sources[1].attempted = true; publicStatus.sources[1].evaluatedThisExecution = false; publicStatus.sources[1].automatedExecutionVerified = false;
    f.history[1] = structuredClone(publicStatus.sources[1]); f.save('dist/collector-status.json', publicStatus);
    const result = f.run(); assert.equal(result.status, 0, result.stderr);
    for (const report of f.captures()) assertUntouched(report.sources[1], f.history[1], { manualReview: true, blockedUntil: '2026-10-14T00:00:00Z' });
    const saved = f.read('.collector/state.json').sources[IDS[1]];
    assert.deepEqual(saved.dailyDiscovery, warm[IDS[1]].dailyDiscovery); assert.deepEqual(saved.gearDailyDiscovery, warm[IDS[1]].gearDailyDiscovery); assert.deepEqual(saved.categoryTree, warm[IDS[1]].categoryTree); assert.deepEqual(saved.discoveryPending, warm[IDS[1]].discoveryPending);
  } finally { f.cleanup(); }
});
test('cache-only evaluation publishes real cursor progress without claiming a new actual attempt or success', () => {
  const f = fixture();
  try {
    f.save('.collector/state.json', { sources: { [IDS[0]]: { cache: Object.fromEntries(Object.entries(f.pages).map(([url, text]) => [url, { text, fetchedAt: '2026-10-09T06:00:00Z' }])), collectorLastAttempt: THEN, collectorLastSuccess: f.history[0].collectorLastSuccess } } });
    const result = f.run(); assert.equal(result.status, 0, result.stderr); assert.equal(fs.existsSync(path.join(f.root, 'calls.json')), false);
    const report = f.read('dist/collector-status.json'), row = report.sources[0];
    assert.notDeepEqual(row.discoveryProgress.priceRefreshCursor, f.history[0].discoveryProgress.priceRefreshCursor); assert.equal(row.discoveryProgress.priceRefreshCursor.live, 0); assert.equal(row.discoveryProgress.priceRefreshCursor.gear, f.history[0].discoveryProgress.priceRefreshCursor.gear); assert.deepEqual(row.discoveryProgress.gearDiscovery, f.history[0].discoveryProgress.gearDiscovery); assert.deepEqual(row.discoveryProgress.unknownFutureCheckpointField, f.history[0].discoveryProgress.unknownFutureCheckpointField); assert.equal(row.status, f.history[0].status); assert.equal(row.collectorLastAttempt, f.history[0].collectorLastAttempt); assert.equal(row.collectorLastSuccess, f.history[0].collectorLastSuccess);
    assert.equal(row.attempted, false); assert.equal(row.attemptedThisExecution, false); assert.equal(row.evaluatedThisExecution, true); assert.equal(row.automatedExecutionVerified, false); assert.equal(report.schedule.modes.live.lastAutomatedAttemptAt, THEN);
    for (const index of [1, 2]) assertUntouched(report.sources[index], f.history[index]); assertOtherLanes(report, f);
  } finally { f.cleanup(); }
});

test('completed known-price refresh cannot replace either public discovery lane or shared queues with stale warm state', () => {
  const stale = { collectorLastAttempt: '2026-10-01T00:00:00Z', collectorLastSuccess: '2026-10-01T00:00:00Z', dailyDiscovery: { cursor: { nextCategoryIndex: 1, categories: {} } }, gearDailyDiscovery: { lastAttempt: '2026-10-01T00:00:00Z', cursor: { nextCategoryIndex: 1, nextCategoryKey: 'stale-old-key', categories: {} } }, gearDetailQueueCursor: 1, detailQueueCursor: 1, priceRefreshCursor: { live: 0, gear: 1 }, categoryTree: { nodes: [] }, discoveryPending: [], discoveryReviewQueue: [], discoveryExcluded: [], discoveryLedger: { entries: [] } };
  const f = fixture({ warm: { [IDS[0]]: stale } });
  try {
    const result = f.run(); assert.equal(result.status, 0, result.stderr);
    for (const report of f.captures()) {
      const row = report.sources[0], historical = f.history[0].discoveryProgress;
      for (const key of ['gearDiscovery', 'gearDetailQueueCursor', 'gearTreeCoverage', 'cursor', 'categories', 'detailQueueCursor', 'treeCoverage', 'categoryTree', 'pendingCandidates', 'reviewQueue', 'excludedCandidates', 'discoveryLedger', 'classificationRevalidation']) assert.deepEqual(row.discoveryProgress[key], historical[key], key);
      assert.equal(row.discoveryProgress.priceRefreshCursor.gear, 7);
    }
    const final = f.read('dist/collector-status.json'); assert.equal(final.sources[0].attemptedThisExecution, true); assert.equal(final.sources[0].evaluatedThisExecution, true);
    const internal = f.read('.collector/state.json').sources[IDS[0]]; assert.deepEqual(internal.gearDailyDiscovery, stale.gearDailyDiscovery); assert.deepEqual(internal.categoryTree, stale.categoryTree);
  } finally { f.cleanup(); }
});
function progressFixture() {
  const cfg = source(IDS[0], 0), old = historicalRow(cfg, 0).discoveryProgress;
  const candidate = (number, type, extra = {}) => ({ url: cfg.officialURL + '/product/item/' + number + '/', ...(type ? { type } : {}), ...extra });
  const live = candidate(201, 'live', { publicMarker: 'live' }), gear = candidate(202, 'gear', { publicMarker: 'gear' }), mixed = candidate(203, null, { mixedCategories: true }), unknown = candidate(204, null, { publicMarker: 'unknown' });
  old.pendingCandidates = [live, gear, mixed, unknown];
  old.reviewQueue = [live, gear, mixed, unknown].map(candidate => ({ key: require('../scripts/collector/discovery.cjs').productKey(candidate.url), candidate, preservedReviewField: true }));
  old.excludedCandidates = structuredClone(old.reviewQueue);
  old.discoveryLedger = { unknownLedgerField: true, entries: [live, gear, mixed, unknown].map(candidate => ({ key: require('../scripts/collector/discovery.cjs').productKey(candidate.url), candidate, preservedLedgerField: true })) };
  old.categoryTree.nodes[0] = { ...old.categoryTree.nodes[0], label: 'Observed live leaf', ancestorLabels: ['Observed ancestor'], evidencePage: cfg.officialURL + '/observed-menu/', evidenceObservedAt: THEN, provenanceExtension: { retained: true } };
  old.categoryTree.nodes[1] = { ...old.categoryTree.nodes[1], label: 'Observed gear leaf', ancestorLabels: ['Observed gear ancestor'], evidencePage: cfg.officialURL + '/observed-gear-menu/', evidenceObservedAt: THEN };
  const state = { products: [], updatedKeys: [], dailyDiscovery: { cursor: { nextCategoryIndex: 101, categories: {} }, categories: [] }, gearDailyDiscovery: { lastAttempt: '2026-10-01T00:00:00Z', cursor: { nextCategoryIndex: 202, categories: {} }, categories: [] }, detailQueueCursor: 100, gearDetailQueueCursor: 200, priceRefreshCursor: { live: 0, gear: 0 }, categoryTree: { nodes: old.categoryTree.nodes.map(n => ({ key: n.key, url: n.url, scope: n.scope, label: 'Stale bare label', evidenceObservedAt: '2026-10-01T00:00:00Z' })) }, discoveryPending: [], discoveryReviewQueue: [], discoveryExcluded: [], discoveryLedger: { entries: [] } };
  return { cfg, old, state, live, gear, mixed, unknown };
}
for (const lane of ['live', 'gear']) test('completed ' + lane + ' discovery preserves opposite/unknown queue ownership without resurrecting resolved active or mixed entries', () => {
  const { reportProgress } = require('../scripts/collect-catalog.cjs'), f = progressFixture(), other = lane === 'live' ? 'gear' : 'live';
  const opposite = f[other], staleOpposite = { ...opposite, publicMarker: 'stale replacement' }, newActive = { url: f.cfg.officialURL + '/product/item/205/', type: lane };
  f.state.discoveryPending = [staleOpposite, newActive];
  const merged = reportProgress(f.state, f.old, { priceModes: [lane], discoveryLanes: [lane] });
  assert.deepEqual(merged.pendingCandidates.find(c => c.url === opposite.url), opposite);
  assert.ok(merged.pendingCandidates.some(c => c.url === f.unknown.url)); assert.ok(merged.pendingCandidates.some(c => c.url === newActive.url));
  assert.ok(!merged.pendingCandidates.some(c => c.url === f[lane].url || c.url === f.mixed.url));
  for (const key of ['reviewQueue', 'excludedCandidates']) {
    assert.ok(merged[key].some(c => c.candidate.url === opposite.url)); assert.ok(merged[key].some(c => c.candidate.url === f.unknown.url)); assert.ok(!merged[key].some(c => c.candidate.url === f[lane].url || c.candidate.url === f.mixed.url));
  }
  assert.ok(merged.discoveryLedger.entries.some(c => c.candidate.url === opposite.url)); assert.ok(!merged.discoveryLedger.entries.some(c => c.candidate.url === f[lane].url || c.candidate.url === f.mixed.url)); assert.equal(merged.discoveryLedger.unknownLedgerField, true);
  assert.deepEqual(merged.categoryTree.nodes, f.old.categoryTree.nodes, 'same-key stale nodes must not replace stronger observed provenance');
  const oppositeFields = other === 'gear' ? ['gearDiscovery', 'gearDetailQueueCursor', 'gearTreeCoverage'] : ['cursor', 'categories', 'detailQueueCursor', 'treeCoverage'];
  for (const key of oppositeFields) assert.deepEqual(merged[key], f.old[key]);
  assert.equal(merged.priceRefreshCursor[other], f.old.priceRefreshCursor[other]);
  assert.equal(lane === 'live' ? merged.cursor.nextCategoryIndex : merged.gearDiscovery.cursor.nextCategoryIndex, lane === 'live' ? 101 : 202);
  assert.equal(f.state.categoryTree.nodes[0].label, 'Stale bare label', 'report merging must never rewrite warm runtime state');
});
test('both actually evaluated lanes advance; exact verified identity resolves unknown pending without deleting unrelated evidence', () => {
  const { reportProgress } = require('../scripts/collect-catalog.cjs'), f = progressFixture();
  const key = require('../scripts/collector/discovery.cjs').productKey(f.unknown.url);
  f.state.products = [{ collector_key: 'verified-current-key', product_url: f.unknown.url }]; f.state.updatedKeys = ['verified-current-key'];
  const merged = reportProgress(f.state, f.old, { priceModes: ['reconcile'], discoveryLanes: ['live', 'gear'] });
  assert.equal(merged.cursor.nextCategoryIndex, 101); assert.equal(merged.gearDiscovery.cursor.nextCategoryIndex, 202);
  assert.deepEqual(merged.pendingCandidates, []); assert.ok(!merged.reviewQueue.some(entry => entry.key === key)); assert.ok(!merged.discoveryLedger.entries.some(entry => entry.key === key));
  assert.deepEqual(merged.categoryTree.nodes, f.old.categoryTree.nodes);
});
test('a genuinely newer category observation can refine its own evaluated lane while category evidence is unioned', () => {
  const { reportProgress } = require('../scripts/collect-catalog.cjs'), f = progressFixture();
  f.state.categoryTree.nodes = [{ ...f.old.categoryTree.nodes[0], label: 'Newly observed live label', evidenceObservedAt: NOW }, { key: 'new-observed-node', url: f.cfg.officialURL + '/category/extra/3/', scope: 'live', label: 'New observed leaf', evidencePage: f.cfg.officialURL + '/new-menu/', evidenceObservedAt: NOW }];
  const merged = reportProgress(f.state, f.old, { priceModes: [], discoveryLanes: ['live'] });
  assert.equal(merged.categoryTree.nodes.length, 3); assert.equal(merged.categoryTree.nodes[0].label, 'Newly observed live label');
  assert.deepEqual(merged.categoryTree.nodes.find(n => n.key === f.old.categoryTree.nodes[1].key), f.old.categoryTree.nodes[1]);
  assert.deepEqual(merged.categoryTree.nodes[0].provenanceExtension, { retained: true });
});

test('public-empty opposite queues stay empty despite stale warm entries; active and mixed additions remain eligible', () => {
  const { reportProgress } = require('../scripts/collect-catalog.cjs'), f = progressFixture();
  f.old.pendingCandidates = []; f.old.reviewQueue = []; f.old.excludedCandidates = []; f.old.discoveryLedger = { entries: [], recoveryCandidates: [] };
  f.state.discoveryPending = [f.gear, f.live, f.mixed, f.unknown];
  f.state.discoveryReviewQueue = [f.gear, f.live, f.mixed, f.unknown].map(candidate => ({ key: require('../scripts/collector/discovery.cjs').productKey(candidate.url), candidate }));
  f.state.discoveryExcluded = structuredClone(f.state.discoveryReviewQueue);
  f.state.discoveryLedger = { entries: structuredClone(f.state.discoveryReviewQueue), recoveryCandidates: structuredClone(f.state.discoveryReviewQueue) };
  const merged = reportProgress(f.state, f.old, { priceModes: ['live'], discoveryLanes: ['live'] });
  assert.deepEqual(merged.pendingCandidates.map(c => c.url), [f.live.url, f.mixed.url]);
  for (const entries of [merged.reviewQueue, merged.excludedCandidates, merged.discoveryLedger.entries, merged.discoveryLedger.recoveryCandidates]) assert.deepEqual(entries.map(c => c.candidate.url), [f.live.url, f.mixed.url]);
});
test('current-only unknown queue additions require exact successful-fetch provenance', () => {
  const { reportProgress } = require('../scripts/collect-catalog.cjs'), f = progressFixture();
  f.old.pendingCandidates = []; f.old.reviewQueue = []; f.old.excludedCandidates = []; f.old.discoveryLedger = { entries: [] };
  f.state.discoveryPending = [{ ...f.unknown, discoveredAt: NOW, discoveredInCategory: f.cfg.officialURL + '/observed-live-page/' }];
  f.state.discoveryLedger = { entries: [{ key: require('../scripts/collector/discovery.cjs').productKey(f.unknown.url), url: f.unknown.url, evidence: [{ page: f.cfg.officialURL + '/observed-live-page/', observedAt: NOW }] }] };
  const evaluation = { priceModes: [], discoveryLanes: ['live'], fetchedPages: [{ url: f.cfg.officialURL + '/observed-live-page/', requestedAt: NOW }] };
  let merged = reportProgress(f.state, f.old, evaluation); assert.equal(merged.pendingCandidates.length, 1); assert.equal(merged.discoveryLedger.entries.length, 1);
  merged = reportProgress(f.state, f.old, { ...evaluation, fetchedPages: [{ url: f.cfg.officialURL + '/different-page/', requestedAt: NOW }] }); assert.equal(merged.pendingCandidates.length, 0); assert.equal(merged.discoveryLedger.entries.length, 0);
  merged = reportProgress(f.state, f.old, { ...evaluation, fetchedPages: [{ url: f.cfg.officialURL + '/observed-live-page/', requestedAt: '2026-10-10T00:00:00Z' }] }); assert.equal(merged.pendingCandidates.length, 0);
});
test('equal-time bare category nodes cannot erase stronger public ancestry or evidence', () => {
  const { reportProgress } = require('../scripts/collect-catalog.cjs'), f = progressFixture();
  f.state.categoryTree.nodes = [{ key: f.old.categoryTree.nodes[0].key, url: f.old.categoryTree.nodes[0].url, scope: 'live', label: 'Bare stale label', ancestorLabels: [], evidenceObservedAt: THEN }];
  const merged = reportProgress(f.state, f.old, { priceModes: [], discoveryLanes: ['live'] });
  assert.deepEqual(merged.categoryTree.nodes, f.old.categoryTree.nodes);
});
test('revalidation preserves two variants sharing a product key and resolves only the exact verified variant', () => {
  const { reportProgress } = require('../scripts/collect-catalog.cjs'), f = progressFixture();
  const url = f.cfg.officialURL + '/product/variant/6687/', key = require('../scripts/collector/discovery.cjs').productKey(url);
  const a = { id: 'variant-a', collectorKey: 'collector-variant-a', key, url, previousType: 'gear', requiresFreshVerification: true, unknownVariantField: 'a' }, b = { ...a, id: 'variant-b', collectorKey: 'collector-variant-b', unknownVariantField: 'b' };
  f.old.classificationRevalidation = [a, b]; f.state.classificationRevalidation = structuredClone([a, b]);
  let merged = reportProgress(f.state, f.old, { priceModes: [], discoveryLanes: ['live'] }); assert.deepEqual(merged.classificationRevalidation, [a, b]);
  f.state.classificationRevalidation = []; f.state.products = [{ id: a.id, collector_key: a.collectorKey, product_url: url }]; f.state.updatedKeys = [a.collectorKey];
  merged = reportProgress(f.state, f.old, { priceModes: [], discoveryLanes: ['live'] }); assert.deepEqual(merged.classificationRevalidation, [b]);
  f.old.classificationRevalidation = []; f.state.products = [{ id: b.id, collector_key: b.collectorKey, product_url: url }]; f.state.updatedKeys = []; f.state.classificationRevalidation = [b];
  merged = reportProgress(f.state, f.old, { priceModes: [], discoveryLanes: ['live'] }); assert.deepEqual(merged.classificationRevalidation, [], 'stale warm review must not resurrect public-empty variant state');
});
test('only invocation-created current summaries grant lane ownership, including equal-count cache evaluation', () => {
  const { evaluatedDiscoveryLanes } = require('../scripts/collect-catalog.cjs'), start = Date.parse(NOW);
  assert.deepEqual(evaluatedDiscoveryLanes(null, start), []);
  assert.deepEqual(evaluatedDiscoveryLanes({ discoveryScope: 'all', scopes: { live: { lastAttempt: THEN }, gear: { lastAttempt: THEN } } }, start), []);
  assert.deepEqual(evaluatedDiscoveryLanes({ discoveryScope: 'all', scopes: { live: { lastAttempt: NOW, pagesVisited: 0, verifiedItems: 0 }, gear: { lastAttempt: THEN } } }, start), ['live']);
  assert.deepEqual(evaluatedDiscoveryLanes({ discoveryScope: 'gear', lastAttempt: NOW, pagesVisited: 0, verifiedItems: 0 }, start), ['gear']);
  const collector = fs.readFileSync(path.join(__dirname, '../scripts/collect-catalog.cjs'), 'utf8');
  assert.match(collector, /integrateDiscovery\([^\n]+\{ \.\.\.next, discoverySummary: null, classificationRevalidation: null \}/);
  assert.match(collector, /if \(!next\.discoverySummary\) next\.discoverySummary = beforeSummary/);
});


test('newly generated exact revalidation records are admitted without requiring a premature verified update', () => {
  const { reportProgress } = require('../scripts/collect-catalog.cjs'), f = progressFixture();
  const record = { id: 'fresh-suspect-variant', collectorKey: 'fresh-suspect-collector', key: 'fixture-0.invalid:6687', url: f.cfg.officialURL + '/product/variant/6687/', requiresFreshVerification: true, autoPublish: false, previousType: 'gear' };
  f.old.classificationRevalidation = []; f.state.classificationRevalidation = [record]; f.state.products = []; f.state.updatedKeys = [];
  const generated = reportProgress(f.state, f.old, { priceModes: [], discoveryLanes: ['live'], generatedRevalidationIds: ['id:fresh-suspect-variant'] });
  assert.deepEqual(generated.classificationRevalidation, [record]);
  const stale = reportProgress(f.state, f.old, { priceModes: [], discoveryLanes: ['live'], generatedRevalidationIds: [] }); assert.deepEqual(stale.classificationRevalidation, []);
});


test('a completed failed attempt cannot regress the latest published success to stale warm success history', () => {
  const f = fixture({ scenario: 'failure', warm: { [IDS[0]]: { status: 'success', collectorLastAttempt: '2026-10-01T00:00:00Z', collectorLastSuccess: '2026-10-01T00:00:00Z', dailyDiscovery: { cursor: { categories: {} } } } } });
  try {
    const result = f.run(); assert.equal(result.status, 1, result.stderr);
    for (const report of f.captures()) { assert.equal(report.sources[0].collectorLastSuccess, f.history[0].collectorLastSuccess); assert.equal(report.sources[0].automatedExecutionVerified, false); }
    const final = f.read('dist/collector-status.json'); assert.equal(final.sources[0].status, 'access_stopped'); assert.equal(final.sources[0].collectorLastAttempt, NOW); assert.equal(final.sources[0].evaluatedThisExecution, true);
  } finally { f.cleanup(); }
});
