'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { collectSource } = require('./collector/engine.cjs');
const { applyUpdates } = require('./collector/publish.cjs');
const { integrateDiscovery } = require('./collector/integrate-discovery.cjs');
const { refreshScope, refreshCursorAfter } = require('./collector/refresh-scope.cjs');
const { restoreCheckpoint, progress, sourceCursor } = require('./collector/queue-policy.cjs');
const { requestAllocation } = require('./collector/discovery-scope.cjs');
const { pruneCache } = require('./collector/cache-policy.cjs');
const { loadControls, sourceDecision, scheduleDecision, initializeSchedule, markAttempt, markOutcome, outcomeFor, controlsMetadata } = require('./collector/controls.cjs');
function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = file + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(value, (key, entry) => key === 'classificationRevalidationUpdates' ? undefined : entry, 2) + '\n');
  fs.renameSync(temp, file);
}
function entryLanes(entry) {
  const candidate = entry?.candidate || entry || {}, lanes = new Set();
  if (candidate.mixedCategories === true || candidate.scope === 'mixed') return ['live', 'gear'];
  for (const type of [candidate.type, candidate.scope, entry?.type, ...(entry?.classifications || []).map(item => item.type)]) if (['live', 'gear'].includes(type)) lanes.add(type);
  if (!lanes.size && ['fish', 'shrimp', 'aquatic_plant', 'snail'].includes(candidate.subtype)) lanes.add('live');
  return [...lanes];
}
function entryIdentity(entry) {
  if (typeof entry?.key === 'string') return entry.key;
  const url = entry?.url || entry?.candidate?.url || entry?.product_url;
  if (url) { try { return require('./collector/discovery.cjs').productKey(url); } catch {} }
  return entry?.id || JSON.stringify(entry);
}
function mergeLaneEntries(oldEntries = [], nextEntries = [], lanes, resolvedKeys = new Set(), observedKeys = new Set()) {
  if (!lanes.length) return structuredClone(oldEntries);
  const oldByKey = new Map(oldEntries.map(entry => [entryIdentity(entry), entry]));
  const admissible = nextEntries.filter(entry => {
    const owners = entryLanes(entry), key = entryIdentity(entry);
    return owners.some(lane => lanes.includes(lane)) || !owners.length && (oldByKey.has(key) || observedKeys.has(key) || resolvedKeys.has(key));
  });
  const entries = new Map(admissible.map(entry => [entryIdentity(entry), { ...structuredClone(oldByKey.get(entryIdentity(entry)) || {}), ...structuredClone(entry) }]));
  for (const old of oldEntries) {
    const key = entryIdentity(old), owned = entryLanes(old).some(lane => lanes.includes(lane));
    // Mixed candidates belong to an evaluated lane and may legitimately disappear.
    // Unknown/opposite-lane history survives unless this evaluation verified its
    // exact product identity. No source-level attempt timestamp proves resolution.
    if (!owned && !resolvedKeys.has(key)) entries.set(key, { ...entries.get(key), ...structuredClone(old) });
  }
  return [...entries.values()];
}
function mergeObservedTree(oldTree, nextTree, lanes) {
  if (!oldTree) return structuredClone(nextTree || null);
  if (!nextTree) return structuredClone(oldTree);
  const nodes = new Map((oldTree.nodes || []).map(node => [node.key || node.url || JSON.stringify(node), structuredClone(node)]));
  for (const node of nextTree.nodes || []) {
    const key = node.key || node.url || JSON.stringify(node), old = nodes.get(key);
    if (!old) { nodes.set(key, structuredClone(node)); continue; }
    const evaluated = entryLanes(node).some(lane => lanes.includes(lane));
    const oldAt = Date.parse(old.evidenceObservedAt), nextAt = Date.parse(node.evidenceObservedAt);
    const freshEvidence = evaluated && Number.isFinite(nextAt) && (!Number.isFinite(oldAt) || nextAt > oldAt);
    nodes.set(key, freshEvidence ? { ...old, ...structuredClone(node) } : { ...structuredClone(node), ...old });
  }
  const merged = [...nodes.values()];
  if (JSON.stringify(merged) === JSON.stringify(oldTree.nodes || [])) return structuredClone(oldTree);
  return { ...structuredClone(oldTree), ...structuredClone(nextTree), nodes: merged, discoveredCategoryCount: merged.length,
    excludedCategoryCount: merged.filter(node => node.scope === 'excluded').length, reviewCategoryCount: merged.filter(node => node.scope === 'review').length };
}
function revalidationIdentity(entry) {
  return entry?.id ? 'id:' + entry.id : entry?.collectorKey || entry?.collector_key ? 'collector:' + (entry.collectorKey || entry.collector_key) : 'product:' + entryIdentity(entry);
}
function mergeRevalidation(oldEntries, nextEntries, state, generatedIds = []) {
  const updated = new Set(state.updatedKeys || []), generated = new Set(generatedIds), resolved = new Set();
  for (const product of state.products || []) {
    const keys = [product.id ? 'id:' + product.id : null, product.collector_key ? 'collector:' + product.collector_key : null].filter(Boolean);
    for (const key of keys) if (updated.has(product.collector_key)) resolved.add(key);
  }
  const oldByKey = new Map(oldEntries.map(entry => [revalidationIdentity(entry), entry]));
  const merged = new Map(nextEntries.filter(entry => oldByKey.has(revalidationIdentity(entry)) || resolved.has(revalidationIdentity(entry)) || generated.has(revalidationIdentity(entry))).map(entry => [revalidationIdentity(entry), { ...structuredClone(oldByKey.get(revalidationIdentity(entry)) || {}), ...structuredClone(entry) }]));
  for (const old of oldEntries) if (!resolved.has(revalidationIdentity(old)) && !merged.has(revalidationIdentity(old))) merged.set(revalidationIdentity(old), structuredClone(old));
  return [...merged.values()];
}
function evaluatedDiscoveryLanes(summary, startedAt) {
  const current = lane => summary?.discoveryScope === 'all' ? summary.scopes?.[lane] : summary?.discoveryScope === lane ? summary : null;
  return ['live', 'gear'].filter(lane => { const value = current(lane); return value && Number.isFinite(Date.parse(value.lastAttempt)) && Date.parse(value.lastAttempt) >= startedAt; });
}
function reportProgress(state, old = {}, evaluation = { priceModes: [], discoveryLanes: [] }) {
  const next = progress(state), lanes = evaluation.discoveryLanes || [], merged = { ...structuredClone(old), ...next };
  const fields = { live: ['cursor', 'categories', 'treeCoverage', 'detailQueueCursor'], gear: ['gearDiscovery', 'gearTreeCoverage', 'gearDetailQueueCursor', 'classificationRevalidationQueue', 'classificationRevalidationSummary'] };
  for (const lane of ['live', 'gear']) if (!lanes.includes(lane)) for (const key of fields[lane]) if (Object.hasOwn(old, key)) merged[key] = structuredClone(old[key]);
  merged.priceRefreshCursor = { ...next.priceRefreshCursor, ...structuredClone(old.priceRefreshCursor || {}) };
  for (const mode of evaluation.priceModes || []) if (Object.hasOwn(next.priceRefreshCursor || {}, mode)) merged.priceRefreshCursor[mode] = next.priceRefreshCursor[mode];
  if (lanes.length < 2 && Object.hasOwn(old, 'nextDiscoveryScope')) merged.nextDiscoveryScope = old.nextDiscoveryScope;
  merged.categoryTree = mergeObservedTree(old.categoryTree, next.categoryTree, lanes);
  const updated = new Set(state.updatedKeys || []), resolvedKeys = new Set((state.products || []).filter(product => updated.has(product.collector_key)).map(entryIdentity));
  const observedKeys = new Set();
  const entries = [...(next.pendingCandidates || []), ...(next.reviewQueue || []), ...(next.excludedCandidates || []), ...(next.discoveryLedger?.entries || [])];
  for (const entry of entries) {
    const candidate = entry.candidate || entry, evidence = [...(entry.evidence || []), { page: candidate.discoveredInCategory || candidate.url, observedAt: entry.reviewedAt || candidate.discoveredAt }];
    if (evidence.some(item => (evaluation.fetchedPages || []).some(page => page.url === item.page && Number.isFinite(Date.parse(item.observedAt)) && Date.parse(item.observedAt) >= Date.parse(page.requestedAt)))) observedKeys.add(entryIdentity(entry));
  }
  for (const key of ['pendingCandidates', 'reviewQueue', 'excludedCandidates']) merged[key] = mergeLaneEntries(old[key] || [], next[key] || [], lanes, resolvedKeys, observedKeys);
  merged.classificationRevalidation = !lanes.length && Object.hasOwn(old, 'classificationRevalidation') ? structuredClone(old.classificationRevalidation) : mergeRevalidation(old.classificationRevalidation || [], next.classificationRevalidation || [], state, evaluation.generatedRevalidationIds || []);
  if (old.discoveryLedger || next.discoveryLedger) {
    merged.discoveryLedger = !lanes.length && old.discoveryLedger ? structuredClone(old.discoveryLedger) : { ...structuredClone(old.discoveryLedger || {}), ...next.discoveryLedger, entries: mergeLaneEntries(old.discoveryLedger?.entries || [], next.discoveryLedger?.entries || [], lanes, resolvedKeys, observedKeys) };
    if (lanes.length && (old.discoveryLedger?.recoveryCandidates || next.discoveryLedger?.recoveryCandidates)) merged.discoveryLedger.recoveryCandidates = mergeLaneEntries(old.discoveryLedger?.recoveryCandidates || [], next.discoveryLedger?.recoveryCandidates || [], lanes, resolvedKeys, observedKeys);
  }
  // Coverage for untouched lanes stays historical. Evaluated lane counts use the
  // preserved observed tree and merged queues without changing runtime state.
  if (lanes.length) {
    const counted = progress({ ...state, categoryTree: merged.categoryTree, discoveryPending: merged.pendingCandidates, dailyDiscovery: { cursor: merged.cursor, categories: merged.categories }, gearDailyDiscovery: merged.gearDiscovery });
    if (lanes.includes('live')) merged.treeCoverage = counted.treeCoverage;
    if (lanes.includes('gear')) merged.gearTreeCoverage = counted.gearTreeCoverage;
  }
  return merged;
}
function latestSuccess(...values) {
  return values.filter(value => typeof value === 'string' && Number.isFinite(Date.parse(value))).sort((a, b) => Date.parse(b) - Date.parse(a))[0] || null;
}
function preserveHolds(row, state) {
  const checkpoint = row.discoveryProgress || {};
  const requiresManualReview = checkpoint.requiresManualReview === true || row.requiresManualReview === true || state.requiresManualReview === true;
  const candidates = [checkpoint.blockedUntil, row.blockedUntil, state.blockedUntil].filter(value => typeof value === 'string' && Number.isFinite(Date.parse(value)));
  const blockedUntil = candidates.sort((a, b) => Date.parse(b) - Date.parse(a))[0] || null;
  row.discoveryProgress = { ...checkpoint, requiresManualReview, blockedUntil };
  if (requiresManualReview || Object.hasOwn(row, 'requiresManualReview')) row.requiresManualReview = requiresManualReview;
  if (blockedUntil || Object.hasOwn(row, 'blockedUntil')) row.blockedUntil = blockedUntil;
  return row;
}
async function main(args = process.argv.slice(2)) {
  const get = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
  const registryPath = get('--registry', 'sources/registry.json'), statePath = get('--state', '.collector/state.json'), reportPath = get('--report', '.collector/report.json'), mode = get('--mode', 'all');
  if (!['all', 'live', 'gear', 'reconcile'].includes(mode)) throw Error('Invalid collection mode');
  const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
  const registry = read(registryPath), controls = loadControls(registry, { controlsPath: get('--controls', undefined) });
  const prior = fs.existsSync(statePath) ? read(statePath) : { sources: {} };
  prior.sources = prior.sources || {};
  const seeds = fs.existsSync('sources/discovery-seeds.json') ? read('sources/discovery-seeds.json').sources : [];
  const discoveryMode = !args.includes('--refresh-known') || args.includes('--discover');
  const discoveryScope = get('--discovery-scope', ['live', 'gear'].includes(mode) ? mode : 'all');
  if (!['live', 'gear', 'all'].includes(discoveryScope)) throw Error('Invalid discovery scope');
  const publicPrior = fs.existsSync('dist/collector-status.json') ? read('dist/collector-status.json') : { sources: [] };
  const requestedCategory = get('--discovery-category', null), selected = args.includes('--source');
  if (requestedCategory && !selected) throw Error('--discovery-category requires --source');
  if (selected && !registry.sources.some(s => s.id === get('--source'))) throw Error('Unknown selected source');
  const snapshot = read('dist/source-snapshot.json');
  const publicRows = new Map((publicPrior.sources || []).map(row => [row.id, row]));
  for (const source of registry.sources) prior.sources[source.id] = restoreCheckpoint(prior.sources[source.id] || {}, snapshot, source, publicRows.get(source.id) || {});
  const initialStates = structuredClone(prior.sources);
  prior.runCursors = prior.runCursors || {};
  prior.runNextSourceIds = prior.runNextSourceIds || {};
  if (!prior.runNextSourceIds[mode] && publicPrior.mode === mode && publicPrior.nextSourceId) prior.runNextSourceIds[mode] = publicPrior.nextSourceId;
  const executionBudgetMs = 18 * 60 * 1000, deadline = Date.now() + executionBudgetMs, runTrigger = process.env.GITHUB_EVENT_NAME || 'local';
  const decision = scheduleDecision(controls, publicPrior, { mode, runTrigger });
  if (decision.automatic && !args.includes('--publish')) throw Error('Automatic collection requires --publish for durable schedule state');
  const report = { executionBudgetMs, productChanges: 0, executionSkippedReason: null, executionError: null, deferredSourceIds: [], startedAt: new Date().toISOString(), mode, discoveryScope, runTrigger, githubRunId: process.env.GITHUB_ACTIONS === 'true' ? process.env.GITHUB_RUN_ID || null : null, autoRefreshDeployed: false, fullCatalogCoverage: false, executionDeadlineReached: false, executionBudgetLimited: false, checkpointOnly: false, executionEnvironment: process.env.GITHUB_ACTIONS === 'true' ? 'github_actions' : 'local', collectorControls: controlsMetadata(controls, publicPrior.collectorControls), scheduleDecision: decision, schedule: initializeSchedule(publicPrior, controls, mode, decision), sourceDecisions: {}, sources: [] };
  const evaluated = [], actualAttempts = new Map(), evaluations = new Map(), updates = {};
  const rows = () => registry.sources.map(source => {
    const current = prior.sources[source.id] || {}, old = publicRows.get(source.id);
    const attempted = actualAttempts.has(source.id), completed = evaluated.includes(source.id);
    const st = completed ? current : initialStates[source.id] || {};
    // Untouched public history is copied, never reconstructed from a potentially
    // empty/stale cache. This applies to initial, partial, final and failure saves,
    // including OFF, deferred and unselected sources. Unknown checkpoint fields
    // survive as well. A completed cache evaluation may advance real progress,
    // but cannot advance actual-attempt/success timestamps or verified-run flags.
    const row = !completed && old ? structuredClone(old) : {
      ...structuredClone(old || {}), id: source.id, domain: source.sourceDomain,
      status: st.status || old?.status || 'not_run', collectorLastAttempt: st.collectorLastAttempt || old?.collectorLastAttempt || null,
      collectorLastSuccess: latestSuccess(st.collectorLastSuccess, old?.collectorLastSuccess), count: st.products?.length ?? old?.count ?? 0,
      coverage: st.coverage || old?.coverage || null, refreshScope: st.refreshScope || old?.refreshScope || null,
      discovery: completed && !(evaluations.get(source.id)?.discoveryLanes.length) && old?.discovery ? structuredClone(old.discovery) : st.discoverySummary || old?.discovery || null,
      discoveryProgress: completed ? reportProgress(st, old?.discoveryProgress || {}, evaluations.get(source.id)) : { ...structuredClone(old?.discoveryProgress || {}), ...progress(st) }, errors: st.errors || old?.errors || []
    };
    Object.assign(row, { id: source.id, domain: source.sourceDomain, requests: completed ? current.requests || 0 : 0,
      controlDecision: report.sourceDecisions[source.id] || sourceDecision(source, current, controls),
      attempted, attemptedThisExecution: attempted, evaluatedThisExecution: evaluated.includes(source.id),
      executionRunId: attempted ? report.githubRunId : old?.executionRunId || null,
      automatedExecutionVerified: process.env.GITHUB_ACTIONS === 'true' && runTrigger === 'schedule' && attempted && completed && current.status === 'success' });
    if (attempted) row.collectorLastAttempt = actualAttempts.get(source.id);
    else if (old) { row.collectorLastAttempt = old.collectorLastAttempt || null; row.collectorLastSuccess = old.collectorLastSuccess || null; }
    return preserveHolds(row, current);
  });
  const save = (checkpoint = false) => {
    const current = { ...publicPrior, ...report, checkpointOnly: checkpoint, finishedAt: checkpoint ? null : report.finishedAt, nextSourceId: prior.runNextSourceIds[mode] || null, attemptedSourceIds: [...actualAttempts.keys()], evaluatedSourceIds: [...evaluated], sources: rows() };
    if (checkpoint) current.lastConfirmedCheckpointAt = new Date().toISOString();
    atomicJson(reportPath, current);
    if (args.includes('--publish')) atomicJson('dist/collector-status.json', current);
    return current;
  };
  const publishProducts = () => {
    if (!args.includes('--publish') || !Object.keys(updates).length) return;
    // Only states accepted in THIS execution can publish. An OFF source's cached
    // updatedKeys or deletionAllowed flag must never replay an earlier mutation.
    const output = applyUpdates(snapshot, updates, mode);
    report.productChanges = output.changes;
    if (output.changes) { atomicJson('dist/source-snapshot.json', output.snapshot); atomicJson('dist/catalog.json', output.catalog); }
  };
  if (!decision.due) {
    report.executionSkippedReason = 'not_due';
    report.finishedAt = new Date().toISOString();
    const result = save();
    console.log(JSON.stringify({ mode, executionSkippedReason: 'not_due', scheduleDecision: decision, collectorControls: report.collectorControls }, null, 2));
    return result;
  }
  const cursor = selected ? 0 : sourceCursor(registry.sources, prior, mode), ordered = [...registry.sources.slice(cursor), ...registry.sources.slice(0, cursor)];
  const visited = new Set();
  try {
    for (const source of ordered) {
      if (selected && source.id !== get('--source')) continue;
      if (Date.now() >= deadline) { report.deferredSourceIds = ordered.filter(s => !visited.has(s.id) && (!selected || s.id === get('--source'))).map(s => s.id); break; }
      const previous = prior.sources[source.id], sourceControl = sourceDecision(source, previous, controls);
      report.sourceDecisions[source.id] = sourceControl;
      visited.add(source.id);
      if (!sourceControl.effectiveEnabled) continue;
      const allocation = requestAllocation(source, discoveryMode), scope = refreshScope(source, previous, mode, discoveryMode, { limit: allocation.knownProductLimit });
      const scoped = { ...source, maxRequests: allocation.knownRequestLimit, products: scope.products };
      evaluations.set(source.id, { priceModes: scope.products.length ? [mode] : [], discoveryLanes: [], fetchedPages: [], generatedRevalidationIds: [] });
      if (['live', 'gear'].includes(mode) && scoped.products.length === 0 && !discoveryMode) continue;
      const seed = seeds.find(s => s.id === source.id);
      if (requestedCategory && seed && !seed.categories.some(c => c.url === requestedCategory)) throw Error('Discovery category must match observed seed exactly');
      const fetchObserved = async (url, options) => {
        if (!actualAttempts.has(source.id)) {
          const at = new Date().toISOString(), first = actualAttempts.size === 0;
          actualAttempts.set(source.id, at);
          if (first) {
            markAttempt(report.schedule, mode, { at, automatic: decision.automatic, revision: controls.revision, runId: report.githubRunId });
            report.collectorControls = controlsMetadata(controls, report.collectorControls, true);
          }
          // Checkpoint the tracked status file before dispatch. The existing workflow
          // must commit it for durability across checkouts; a runner killed before
          // that commit can still lose its newest local attempt checkpoint.
          save(true);
        }
        const requestedAt = new Date().toISOString(), response = await fetch(url, options);
        if (response.ok && response.status === 200) evaluations.get(source.id).fetchedPages.push({ url, requestedAt });
        return response;
      };
      console.error('Collect ' + source.id + ' (' + source.sourceDomain + ')');
      let next = await collectSource(scoped, previous, { deadline, fetch: fetchObserved });
      next.priceRefreshCursor = next.status === 'budget_limited' ? refreshCursorAfter(scope, mode, next.priceRefreshCompletedCount) : scope.cursor;
      next.refreshScope = { ...scope.summary, requestAllocation: allocation };
      if (discoveryMode && seed && ['success', 'partial_failure', 'no_confirmed_products', 'budget_limited'].includes(next.status) && !(next.errors || []).includes('execution_deadline')) {
        const chosenSeed = requestedCategory ? { ...seed, categories: seed.categories.filter(c => c.url === requestedCategory) } : seed;
        const beforeSummary = next.discoverySummary || null, beforeRevalidation = next.classificationRevalidation, discoveryStartedAt = Date.now();
        // The integrator does not use its previous summary for collection. Clearing
        // only this input copy proves a returned summary was created by this call;
        // an unchanged early return cannot lend a historical all-lanes ownership.
        next = await integrateDiscovery({ ...source, maxRequests: allocation.total }, chosenSeed, { ...next, discoverySummary: null, classificationRevalidation: null }, snapshot, { deadline, discoveryScope, fetch: fetchObserved });
        evaluations.get(source.id).discoveryLanes = evaluatedDiscoveryLanes(next.discoverySummary, discoveryStartedAt);
        if (!next.discoverySummary) next.discoverySummary = beforeSummary;
        if (Array.isArray(next.classificationRevalidation)) evaluations.get(source.id).generatedRevalidationIds = next.classificationRevalidation.map(revalidationIdentity);
        else next.classificationRevalidation = beforeRevalidation;
      }
      // Engine cache evaluation is not a new actual attempt or success observation.
      if (!actualAttempts.has(source.id)) { next.collectorLastAttempt = previous.collectorLastAttempt || null; next.collectorLastSuccess = previous.collectorLastSuccess || null; }
      else next.collectorLastAttempt = actualAttempts.get(source.id);
      next.cache = pruneCache(next.cache); next.sourceId = source.id;
      prior.sources[source.id] = next; updates[source.id] = next; evaluated.push(source.id);
      report.sources.push({ id: source.id, status: next.status, discovery: next.discoverySummary || null, errors: next.errors || [] });
      if (!selected && registry.sources.length) { prior.runCursors[mode] = (registry.sources.indexOf(source) + 1) % registry.sources.length; prior.runNextSourceIds[mode] = registry.sources[prior.runCursors[mode]].id; }
      atomicJson(statePath, prior); publishProducts(); save(true);
      console.error(source.id + ': ' + next.status + ', verified products ' + next.products.length + ', requests ' + (next.requests || 0));
      if ([...(next.errors || []), ...(next.discoverySummary?.errors || [])].some(e => e.includes('execution_deadline'))) {
        report.executionDeadlineReached = true; report.deferredSourceIds = ordered.filter(s => !visited.has(s.id) && (!selected || s.id === get('--source'))).map(s => s.id);
        if (!selected) { prior.runCursors[mode] = registry.sources.indexOf(source); prior.runNextSourceIds[mode] = source.id; }
        atomicJson(statePath, prior); break;
      }
    }
    if (!report.deferredSourceIds.length && !report.executionDeadlineReached && !selected && registry.sources.length) { prior.runCursors[mode] = 0; prior.runNextSourceIds[mode] = registry.sources[0].id; }
    atomicJson(statePath, prior);
    report.executionBudgetLimited = report.deferredSourceIds.length > 0 || report.executionDeadlineReached;
    report.finishedAt = new Date().toISOString();
    if (actualAttempts.size) markOutcome(report.schedule, mode, outcomeFor(report.sources.filter(s => actualAttempts.has(s.id))), report.finishedAt);
    else { report.executionSkippedReason = 'no_actual_requests'; report.schedule.modes[mode].lastDecision = 'no_actual_requests'; }
    publishProducts();
    const result = save();
    console.log(JSON.stringify(args.includes('--quiet') ? { startedAt: result.startedAt, finishedAt: result.finishedAt, productChanges: result.productChanges || 0, executionSkippedReason: result.executionSkippedReason || null, scheduleDecision: decision, sources: result.sources.map(s => ({ id: s.id, status: s.status, count: s.count, requests: s.requests, controlDecision: s.controlDecision, errors: s.errors })) } : result, null, 2));
    if (report.sources.some(s => ['failed', 'access_stopped', 'partial_failure', 'robots_unverified'].includes(s.status))) process.exitCode = 1;
    return result;
  } catch (error) {
    report.finishedAt = new Date().toISOString(); report.executionError = error.message;
    if (actualAttempts.size) markOutcome(report.schedule, mode, 'failure', report.finishedAt);
    save(); throw error;
  }
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { atomicJson, main, reportProgress, evaluatedDiscoveryLanes };
