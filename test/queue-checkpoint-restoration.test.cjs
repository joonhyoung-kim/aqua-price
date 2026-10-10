'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { restoreCheckpoint } = require('../scripts/collector/queue-policy.cjs');
const { integrateDiscovery } = require('../scripts/collector/integrate-discovery.cjs');
const { reportProgress, evaluatedDiscoveryLanes } = require('../scripts/collect-catalog.cjs');
const HOST = 'https://example.invalid', CATEGORY = HOST + '/category/filters/10/';
const OLD = '2026-10-09T18:20:35Z', NOW = '2026-10-10T00:00:00Z', NEW = '2026-10-10T01:00:00Z';
const SOURCE = { id: 'fixture', name: 'Fixture', sourceDomain: 'example.invalid', officialURL: HOST, enabled: true, adapter: 'product_jsonld', maxRequests: 20, delayMs: 0, cacheTtlMs: 0, timeoutMs: 1000, maxBytes: 100000, products: [] };
const SEED = { adapter: 'cafe24_category_links', maxPages: 1, maxGearPages: 1, maxProducts: 10, maxProductVerifications: 3, categories: [{ url: CATEGORY, label: '여과기', type: 'gear' }] };
const GEAR = { url: HOST + '/product/gear/901/', type: 'gear', discoveredInCategory: CATEGORY, discoveredAt: NOW, classificationBasis: 'Actual synthetic gear listing href', requiresProductClassification: true };
const LIVE = { url: HOST + '/product/live/701/', type: 'live', subtype: 'fish' };
const KEY = 'example.invalid:901';
const clone = value => structuredClone(value);
function fixture() {
  return { warm: { products: [], requests: 0, status: 'success', cache: {}, updatedKeys: [], collectorLastAttempt: OLD, dailyDiscovery: { lastAttempt: OLD, cursor: { schemaVersion: 1, nextCategoryIndex: 2, categories: {} } }, discoveryPending: [clone(LIVE)], discoveryReviewQueue: [], discoveryExcluded: [] }, checkpoint: { cursor: { schemaVersion: 1, nextCategoryIndex: 0, categories: {} }, categories: [], pendingCandidates: [clone(LIVE), clone(GEAR)], reviewQueue: [], excludedCandidates: [], gearDiscovery: { cursor: { schemaVersion: 1, nextCategoryIndex: 0, categories: {} }, lastAttempt: NOW }, gearDetailQueueCursor: 4 } };
}
const restore = (f, snapshot = { items: [] }) => restoreCheckpoint(f.warm, snapshot, SOURCE, { discoveryProgress: f.checkpoint });
const decision = (status = 'needs_review', at = NEW) => ({ key: KEY, url: GEAR.url, status, reason: 'Explicit primary-content decision', reviewedAt: at, classificationVersion: 8, candidate: clone(GEAR), customProvenance: { preserved: true } });
function transport(status = 404) {
  const calls = [], fetch = async url => { calls.push(url); if (url === HOST + '/robots.txt') return new Response('User-agent: *\nAllow: /'); if (url === CATEGORY) return new Response('<ul class="prdList"></ul><div class="xans-product-normalpaging"></div>'); if (url === GEAR.url) return new Response(status === 200 ? '<h1>not a verified product</h1>' : 'Gone', { status }); throw Error('Offline fixture rejected unexpected URL ' + url); };
  return { calls, fetch };
}
test('fresh public gear901 enters warm collector input without changing either lane continuation', () => {
  const f = fixture(), original = clone(f), state = restore(f);
  assert.deepEqual(state.discoveryPending, [LIVE, GEAR]);
  assert.deepEqual(state.dailyDiscovery, f.warm.dailyDiscovery);
  assert.deepEqual(state.gearDailyDiscovery, f.checkpoint.gearDiscovery);
  assert.equal(state.gearDetailQueueCursor, 4); assert.deepEqual(f, original);
});
test('actual synthetic gear evaluation requests restored901 and preserves404 deferral in published progress', async () => {
  const f = fixture(), restored = restore(f), io = transport(), started = Date.now();
  const next = await integrateDiscovery(SOURCE, SEED, restored, { items: [] }, { discoveryScope: 'gear', fetch: io.fetch });
  assert.ok(io.calls.includes(GEAR.url)); assert.equal(next.products.length, 0); assert.equal(next.updatedKeys.length, 0);
  const pending = next.discoveryPending.find(p => p.url === GEAR.url); assert.ok(pending?.retryAfter);
  const lanes = evaluatedDiscoveryLanes(next.discoverySummary, started); assert.deepEqual(lanes, ['gear']);
  const saved = reportProgress(next, f.checkpoint, { discoveryLanes: lanes, priceModes: [], fetchedPages: io.calls.map(url => ({ url, requestedAt: new Date().toISOString() })), generatedRevalidationIds: [] });
  assert.ok(saved.pendingCandidates.some(p => p.url === GEAR.url)); assert.ok(saved.pendingCandidates.some(p => p.url === LIVE.url));
});
test('zero request budget retains full restored candidate without any network', async () => {
  const f = fixture(), io = transport(); f.checkpoint.pendingCandidates[1] = { ...GEAR, requiresFreshVerification: true, retryAfter: '2099-01-01T00:00:00Z', provenance: { nested: ['keep every byte'] } };
  const state = restore(f), next = await integrateDiscovery({ ...SOURCE, maxRequests: 0 }, SEED, state, { items: [] }, { discoveryScope: 'gear', fetch: io.fetch });
  assert.deepEqual(io.calls, []); assert.deepEqual(next.discoveryPending.find(p => p.url === GEAR.url), f.checkpoint.pendingCandidates[1]);
});
test('future retry remains unresolved and is not requested even with available budget', async () => {
  const f = fixture(), io = transport(); f.checkpoint.pendingCandidates[1].retryAfter = '2099-01-01T00:00:00Z';
  const next = await integrateDiscovery(SOURCE, SEED, restore(f), { items: [] }, { discoveryScope: 'gear', fetch: io.fetch });
  assert.ok(!io.calls.includes(GEAR.url)); assert.deepEqual(next.discoveryPending.find(p => p.url === GEAR.url), f.checkpoint.pendingCandidates[1]);
});
for (const field of ['discoveryReviewQueue', 'discoveryExcluded']) test('stronger warm ' + field + ' suppresses restoration and retains its evidence', () => {
  const f = fixture(), row = decision(field === 'discoveryExcluded' ? 'excluded_scope' : 'needs_review'); f.warm[field] = [row];
  const state = restore(f); assert.deepEqual(state.discoveryPending, [LIVE]); assert.deepEqual(state[field], [row]);
});
for (const field of ['reviewQueue', 'excludedCandidates']) test('public ' + field + ' suppression copies winning evidence into warm shared state', () => {
  const f = fixture(), row = decision(field === 'excludedCandidates' ? 'excluded_scope' : 'needs_review'); f.checkpoint[field] = [row];
  const state = restore(f); assert.deepEqual(state.discoveryPending, [LIVE]); assert.deepEqual(state[field === 'reviewQueue' ? 'discoveryReviewQueue' : 'discoveryExcluded'], [row]);
});
test('verified exact product identity suppresses restoration while same-title unrelated identity does not', () => {
  const f = fixture(); f.warm.products = [{ product_url: GEAR.url, id: 'verified', observed_at_utc: NEW }];
  assert.deepEqual(restore(f).discoveryPending, [LIVE]); f.warm.products[0].product_url = HOST + '/product/gear/902/';
  assert.deepEqual(restore(f).discoveryPending, [LIVE, GEAR]);
  assert.deepEqual(restore(f, { items: [{ source_id: SOURCE.id, product_url: GEAR.url, id: 'published-verified', observed_at_utc: NEW }] }).discoveryPending, [LIVE]);
});
test('interrupted newer warm attempt and opposite-lane cursors do not imply901 resolution', () => {
  const f = fixture(); f.warm.collectorLastAttempt = '2026-10-11T00:00:00Z'; f.warm.dailyDiscovery.lastAttempt = f.warm.collectorLastAttempt;
  f.warm.gearDailyDiscovery = { cursor: { nextCategoryIndex: 19, categories: { keep: { nextUrl: CATEGORY + '?page=3' } } }, lastAttempt: NEW };
  f.warm.gearDetailQueueCursor = 23; f.warm.detailQueueCursor = 5; f.warm.priceRefreshCursor = { live: 4, gear: 8 }; f.warm.categoryTree = { nodes: [], preserve: 'warm tree' };
  const state = restore(f); assert.deepEqual(state.discoveryPending, [LIVE, GEAR]);
  for (const key of ['dailyDiscovery', 'gearDailyDiscovery', 'gearDetailQueueCursor', 'detailQueueCursor', 'priceRefreshCursor', 'categoryTree', 'collectorLastAttempt']) assert.deepEqual(state[key], f.warm[key]);
});
test('existing warm candidate remains byte-equivalent, including newer deferred continuation', () => {
  const f = fixture(), row = { ...GEAR, discoveredAt: NEW, retryAfter: '2099-01-01T00:00:00Z', requiresFreshVerification: true, untouched: { nested: 1 } }; f.warm.discoveryPending.push(row);
  const state = restore(f); assert.deepEqual(state.discoveryPending, f.warm.discoveryPending);
});
test('intentional public fresh recheck pair survives import and a second restoration unchanged', () => {
  const f = fixture(); f.checkpoint.pendingCandidates[1].requiresFreshVerification = true; f.checkpoint.reviewQueue = [decision('needs_review', OLD)];
  const first = restore(f), second = restoreCheckpoint(first, { items: [] }, SOURCE, { discoveryProgress: f.checkpoint });
  assert.deepEqual(first.discoveryPending, f.checkpoint.pendingCandidates); assert.deepEqual(first.discoveryReviewQueue, f.checkpoint.reviewQueue); assert.deepEqual(second, first);
});
test('ordinary unresolved import and cold restoration are idempotent', () => {
  const f = fixture(), first = restore(f); assert.deepEqual(restoreCheckpoint(first, { items: [] }, SOURCE, { discoveryProgress: f.checkpoint }), first);
  const cold = restoreCheckpoint({}, { items: [] }, SOURCE, { discoveryProgress: f.checkpoint });
  assert.deepEqual(cold.discoveryPending, f.checkpoint.pendingCandidates); assert.deepEqual(restoreCheckpoint(cold, { items: [] }, SOURCE, { discoveryProgress: f.checkpoint }), cold);
});
test('stronger refusal flags and latest backoff survive unresolved backlog admission', async () => {
  const f = fixture(), io = transport(); f.warm.requiresManualReview = true; f.warm.blockedUntil = '2099-01-02T00:00:00Z'; f.checkpoint.blockedUntil = '2099-01-01T00:00:00Z';
  const state = restore(f), next = await integrateDiscovery(SOURCE, SEED, state, { items: [] }, { discoveryScope: 'gear', fetch: io.fetch });
  assert.equal(state.requiresManualReview, true); assert.equal(state.blockedUntil, f.warm.blockedUntil); assert.deepEqual(io.calls, []); assert.ok(next.discoveryPending.some(p => p.url === GEAR.url));
});
test('ledger projection times and unverified included status cannot suppress unresolved901', () => {
  for (const status of ['pending', 'review', 'excluded', 'included']) { const f = fixture(); f.warm.discoveryLedger = { checkedAt: NEW, entries: [{ key: KEY, url: GEAR.url, status, lastObservedAt: NEW }] }; assert.deepEqual(restore(f).discoveryPending, [LIVE, GEAR]); }
});
test('primary-detail ledger review suppresses901 with a traceable retained decision', () => {
  const f = fixture(), row = { key: KEY, url: GEAR.url, status: 'review', detailObservedAt: NEW, reason: 'Unsupported primary content', classificationVersion: 8 }; f.warm.discoveryLedger = { checkedAt: '2099-01-01T00:00:00Z', entries: [row] };
  const state = restore(f); assert.deepEqual(state.discoveryPending, [LIVE]); assert.deepEqual(state.discoveryReviewQueue, [{ ...row, candidate: GEAR }]); assert.deepEqual(state.discoveryLedger, f.warm.discoveryLedger);
});
test('parse failures,404 and future retries are unresolved even when stored beside review evidence', () => {
  for (const status of ['detail_parse_failed', 'missing_detail_preserved', 'request_failed_preserved', 'deferred']) { const f = fixture(); f.warm.discoveryReviewQueue = [{ ...decision(status), retryAfter: '2099-01-01T00:00:00Z' }]; assert.deepEqual(restore(f).discoveryPending, [LIVE, GEAR]); }
  const f = fixture(); f.warm.discoveryLedger = { entries: [{ key: KEY, url: GEAR.url, status: 'review', detailObservedAt: NEW, reason: 'Cached primary identity/offer validation incomplete' }] }; assert.deepEqual(restore(f).discoveryPending, [LIVE, GEAR]);
});
test('later listing observation alone cannot reactivate a primary-content review', () => {
  const f = fixture(); f.warm.discoveryReviewQueue = [decision('needs_review', OLD)]; f.checkpoint.pendingCandidates[1] = { ...GEAR, discoveredAt: NEW, requiresFreshVerification: true };
  assert.deepEqual(restore(f).discoveryPending, [LIVE]);
});
test('genuinely newer same-retailer recovery retains fresh verification requirement without publishing', () => {
  const f = fixture(); f.warm.discoveryReviewQueue = [decision('needs_review', OLD)]; f.checkpoint.pendingCandidates[1] = { ...GEAR, requiresFreshVerification: true, reviewRecovery: { detailObservedAt: NEW, categoryUrl: CATEGORY, evidencePageUrl: CATEGORY } };
  const state = restore(f); assert.deepEqual(state.discoveryPending, f.checkpoint.pendingCandidates); assert.deepEqual(state.products, []); assert.deepEqual(state.updatedKeys, []);
});
test('missing,invalid or equal contradictory recovery chronology fails explicitly without mutation', () => {
  for (const at of [null, 'not a timestamp', NOW]) { const f = fixture(); f.warm.discoveryReviewQueue = [decision('needs_review', at)]; f.checkpoint.pendingCandidates[1] = { ...GEAR, requiresFreshVerification: true, reviewRecovery: { detailObservedAt: NOW, categoryUrl: CATEGORY } }; const before = clone(f); assert.throws(() => restore(f), /checkpoint_queue_ambiguous:fixture:example.invalid:901:recovery_decision_chronology/); assert.deepEqual(f, before); }
});
test('an undated conflicting explicit review fails closed without inventing an HTTP hold', () => {
  const f = fixture(); f.warm.discoveryReviewQueue = [decision('needs_review', null)]; const before = clone(f); assert.throws(() => restore(f), /decision_time_missing/); assert.deepEqual(f, before); assert.equal(f.warm.requiresManualReview, undefined);
});
test('foreign ownership and inconsistent canonical keys never enter collector backlog', () => {
  for (const patch of [{ url: 'https://other.invalid/product/gear/901/' }, { key: 'example.invalid:999' }, { source_id: 'other-retailer' }]) { const f = fixture(); Object.assign(f.checkpoint.pendingCandidates[1], patch); assert.throws(() => restore(f), /invalid_identity/); }
});
test('same-product exact variant revalidation fields are untouched by backlog restoration', () => {
  const f = fixture(), variants = ['a', 'b'].map(id => ({ id, collectorKey: 'exact:' + id, key: KEY, status: 'pending', productUrl: GEAR.url, requiresFreshVerification: true })); f.warm.classificationRevalidation = clone(variants); f.warm.classificationRevalidationQueue = clone(variants);
  const state = restore(f); assert.deepEqual(state.classificationRevalidation, variants); assert.deepEqual(state.classificationRevalidationQueue, variants); assert.deepEqual(state.discoveryPending, [LIVE, GEAR]);
});
test('fresh flag never bypasses public excluded or robots-denied decisions', () => {
  for (const status of ['excluded_scope', 'robots_denied_product']) for (const at of [NEW, null]) { const f = fixture(); f.checkpoint.pendingCandidates[1].requiresFreshVerification = true; const row = decision(status, at); f.checkpoint.excludedCandidates = [row]; const state = restore(f); assert.deepEqual(state.discoveryPending, [LIVE]); assert.deepEqual(state.discoveryExcluded, [row]); }
});
test('interrupted newer warm exclusion without reviewedAt remains authoritative', () => {
  const f = fixture(), row = decision('excluded_scope'); delete row.reviewedAt; f.warm.collectorLastAttempt = NEW; f.warm.discoveryExcluded = [row]; f.checkpoint.pendingCandidates[1].requiresFreshVerification = true;
  const state = restore(f); assert.deepEqual(state.discoveryPending, [LIVE]); assert.deepEqual(state.discoveryExcluded, [row]);
});
test('fresh flag cannot bypass a primary-content ledger exclusion', () => {
  const f = fixture(), row = { key: KEY, url: GEAR.url, status: 'excluded', detailObservedAt: NEW, reason: 'Unsupported primary content' }; f.checkpoint.pendingCandidates[1].requiresFreshVerification = true; f.checkpoint.discoveryLedger = { entries: [row] };
  const state = restore(f); assert.deepEqual(state.discoveryPending, [LIVE]); assert.deepEqual(state.discoveryExcluded, [{ ...row, candidate: f.checkpoint.pendingCandidates[1] }]);
});
test('an intentional review recheck cannot hide a newer primary ledger exclusion', () => {
  const f = fixture(), row = { key: KEY, url: GEAR.url, status: 'excluded', detailObservedAt: NEW, reason: 'New primary exclusion' }; f.checkpoint.pendingCandidates[1].requiresFreshVerification = true; f.checkpoint.reviewQueue = [decision('needs_review', OLD)]; f.checkpoint.discoveryLedger = { entries: [row] };
  const state = restore(f); assert.deepEqual(state.discoveryPending, [LIVE]); assert.deepEqual(state.discoveryExcluded, [{ ...row, candidate: f.checkpoint.pendingCandidates[1] }]);
});
for (const status of ['excluded_scope', 'robots_denied_product']) test('undated bare ' + status + ' remains visible after real gear evaluation and report projection', async () => {
  const f = fixture(), row = { key: KEY, url: GEAR.url, status }, io = transport(); f.warm.discoveryExcluded = [row];
  const started = Date.now(), restored = restore(f), next = await integrateDiscovery(SOURCE, SEED, restored, { items: [] }, { discoveryScope: 'gear', fetch: io.fetch });
  assert.ok(!io.calls.includes(GEAR.url)); assert.ok(!next.discoveryPending.some(p => p.url === GEAR.url));
  const saved = reportProgress(next, f.checkpoint, { discoveryLanes: evaluatedDiscoveryLanes(next.discoverySummary, started), priceModes: [], fetchedPages: [], generatedRevalidationIds: [] });
  assert.ok(!saved.pendingCandidates.some(p => p.url === GEAR.url)); assert.deepEqual(saved.excludedCandidates.find(r => r.key === KEY), { ...row, candidate: GEAR }); assert.deepEqual(f.warm.discoveryExcluded, [row]);
});
test('cached review recovery cannot reopen an exact robots denial', () => {
  const f = fixture(); f.warm.discoveryExcluded = [{ key: KEY, url: GEAR.url, status: 'robots_denied_product' }]; f.checkpoint.pendingCandidates[1] = { ...GEAR, requiresFreshVerification: true, reviewRecovery: { detailObservedAt: NEW, categoryUrl: CATEGORY } };
  assert.deepEqual(restore(f).discoveryPending, [LIVE]);
});
