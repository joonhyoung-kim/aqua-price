'use strict';
const fs = require('node:fs');
const crypto = require('node:crypto');
const MODES = ['live', 'gear', 'reconcile'];
const INTERVAL_PRESETS = Object.freeze({ live: [6, 12, 24, 48, 72], gear: [12, 24, 48, 72], reconcile: [24, 48, 72] });
const DEFAULT_INTERVALS = Object.freeze({ live: 6, gear: 12, reconcile: 24 });
function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw Error(label + ' must be an object');
}
function keys(value, allowed, label, required = allowed) {
  object(value, label);
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw Error('Unknown ' + label + ' key: ' + key);
  for (const key of required) if (!Object.hasOwn(value, key)) throw Error('Missing ' + label + ' key: ' + key);
}
function validateControls(raw, registry) {
  keys(raw, ['schemaVersion', 'intervalsHours', 'sources'], 'controls');
  if (raw.schemaVersion !== 1) throw Error('Unsupported collector controls schemaVersion');
  keys(raw.intervalsHours, MODES, 'intervalsHours');
  const intervalsHours = {};
  for (const mode of MODES) {
    if (!INTERVAL_PRESETS[mode].includes(raw.intervalsHours[mode])) throw Error('Invalid interval for ' + mode);
    intervalsHours[mode] = raw.intervalsHours[mode];
  }
  if (!Array.isArray(registry?.sources)) throw Error('Registry sources must be an array');
  const ids = registry.sources.map(source => source.id);
  if (ids.some(id => typeof id !== 'string' || !id || ['__proto__', 'prototype', 'constructor'].includes(id)) || new Set(ids).size !== ids.length) throw Error('Invalid registry source IDs');
  object(raw.sources, 'sources');
  for (const id of Object.keys(raw.sources)) {
    if (!ids.includes(id)) throw Error('Unknown source ID: ' + id);
    keys(raw.sources[id], ['enabled'], 'source ' + id);
    if (typeof raw.sources[id].enabled !== 'boolean') throw Error('Source enabled must be boolean: ' + id);
  }
  const missingSourceIds = ids.filter(id => !Object.hasOwn(raw.sources, id)).sort();
  const sources = Object.fromEntries([...ids].sort().map(id => [id, { enabled: Object.hasOwn(raw.sources, id) && raw.sources[id].enabled }]));
  const config = { schemaVersion: 1, intervalsHours, sources };
  const canonicalJSON = JSON.stringify(config);
  const revision = crypto.createHash('sha256').update(canonicalJSON).digest('hex');
  return { config, revision, configHash: revision, canonicalJSON, missingSourceIds };
}
function isolatedFixture(registry) {
  return registry.sources?.length > 0 && registry.sources.every(source => {
    try { return new URL(source.officialURL).hostname.endsWith('.invalid'); } catch { return false; }
  });
}
function loadControls(registry, options = {}) {
  const controlsPath = options.controlsPath || 'sources/collector-controls.json';
  // Fixture CLIs should pass --controls <isolated file>. Older offline fixtures without
  // a file remain supported ONLY when every registered official host ends in .invalid.
  // Real registries never get implicit ON defaults, even when --registry is supplied.
  if (!fs.existsSync(controlsPath) && !options.controlsPath && isolatedFixture(registry)) {
    const loaded = validateControls({ schemaVersion: 1, intervalsHours: DEFAULT_INTERVALS, sources: Object.fromEntries(registry.sources.map(s => [s.id, { enabled: s.enabled === true }])) }, registry);
    return { ...loaded, controlsPath: null, fixtureOnly: true };
  }
  return { ...validateControls(JSON.parse(fs.readFileSync(controlsPath, 'utf8')), registry), controlsPath, fixtureOnly: false };
}
function sourceDecision(source, prior = {}, controls, now = Date.now()) {
  const config = controls?.config || controls;
  const requestedEnabled = config?.sources?.[source.id]?.enabled === true;
  const registryEligible = source.enabled === true && source.technicalReadiness !== 'blocked';
  const manualReview = prior.requiresManualReview === true || prior.discoveryProgress?.requiresManualReview === true || ['quarantined', 'access_stopped'].includes(prior.status) && prior.httpStatus !== 429 && !prior.discoveryProgress;
  const blockedUntil = [prior.blockedUntil, prior.discoveryProgress?.blockedUntil].filter(Boolean).sort((a,b) => Date.parse(b)-Date.parse(a))[0];
  const reason = !requestedEnabled ? 'requested_off' : source.enabled !== true ? 'registry_disabled' : source.technicalReadiness === 'blocked' ? 'technical_blocked' : manualReview ? 'manual_review' : blockedUntil && now < Date.parse(blockedUntil) ? 'backoff' : 'eligible';
  return { requestedEnabled, registryEligible, effectiveEnabled: reason === 'eligible', reason, blockedUntil: reason === 'backoff' ? blockedUntil : null };
}
// Fixed UTC anchors match the unchanged workflow slots. Longer periods are
// deterministic multiples from the Unix epoch, not elapsed timers after a delay.
const WINDOW_ANCHORS = Object.freeze({ live: 17 * 60000, gear: 29 * 60000, reconcile: (2 * 60 + 43) * 60000 });
function scheduleWindow(mode, intervalHours, now) {
  if (!INTERVAL_PRESETS[mode]?.includes(intervalHours) || !Number.isFinite(now)) throw Error('Invalid schedule window');
  const width = intervalHours * 3600000, anchor = WINDOW_ANCHORS[mode];
  const start = Math.floor((now - anchor) / width) * width + anchor;
  const startAt = new Date(start).toISOString(), endAt = new Date(start + width).toISOString();
  return { id: mode + ':' + intervalHours + ':' + startAt, startAt, endAt, intervalHours, anchorAt: new Date(anchor).toISOString() };
}
function scheduleDecision(controls, publicStatus = {}, { mode, runTrigger = 'local', now = Date.now() } = {}) {
  if (![...MODES, 'all'].includes(mode)) throw Error('Invalid collection mode');
  const automatic = runTrigger === 'schedule';
  if (automatic && mode === 'all') throw Error('Automatic collection requires live, gear, or reconcile mode');
  const intervalHours = mode === 'all' ? null : (controls.config || controls).intervalsHours[mode];
  const lane = publicStatus.schedule?.modes?.[mode] || {};
  const lastAttemptAt = lane.lastAutomatedAttemptAt || null;
  if (lastAttemptAt && !Number.isFinite(Date.parse(lastAttemptAt))) throw Error('Invalid durable last automated attempt for ' + mode);
  const window = mode === 'all' ? null : scheduleWindow(mode, intervalHours, now);
  const storedWindow = lane.lastAutomatedWindow || null;
  if (storedWindow && (typeof storedWindow !== 'object' || !Number.isFinite(Date.parse(storedWindow.startAt)) || !Number.isFinite(Date.parse(storedWindow.endAt)) || !INTERVAL_PRESETS[mode]?.includes(storedWindow.intervalHours))) throw Error('Invalid durable automated window for ' + mode);
  // Re-anchor the actual attempt under the CURRENT interval when configuration
  // changes. A longer period absorbs old attempts; a newly reached shorter period
  // becomes eligible. Legacy elapsed-gate timestamps also migrate deterministically.
  const previousWindow = mode === 'all' ? null : lastAttemptAt ? scheduleWindow(mode, intervalHours, Date.parse(lastAttemptAt)) : storedWindow ? scheduleWindow(mode, intervalHours, Date.parse(storedWindow.startAt)) : null;
  const clockRollback = !!(lastAttemptAt && now < Date.parse(lastAttemptAt)) || !!(previousWindow && now < Date.parse(previousWindow.startAt));
  const due = !automatic || !previousWindow || !clockRollback && Date.parse(window.startAt) > Date.parse(previousWindow.startAt);
  return { automatic, due, reason: !automatic ? 'manual_bypass' : clockRollback ? 'clock_rollback' : due ? 'due' : 'already_attempted_window', intervalHours, lastAttemptAt, gate: 'utc_slot_window', window, previousWindow, nextDueAt: previousWindow && Date.parse(previousWindow.endAt) > Date.parse(window.endAt) ? previousWindow.endAt : window?.endAt || null };
}
function initializeSchedule(publicStatus = {}, controls, mode, decision, at = new Date().toISOString()) {
  const schedule = structuredClone(publicStatus.schedule || { schemaVersion: 1, modes: {} });
  if (schedule.schemaVersion !== 1 || !schedule.modes || typeof schedule.modes !== 'object' || Array.isArray(schedule.modes)) throw Error('Invalid durable collector schedule');
  for (const lane of MODES) schedule.modes[lane] = schedule.modes[lane] || {};
  schedule.modes[mode] = { ...schedule.modes[mode], intervalHours: decision.intervalHours, lastEvaluatedAt: at, lastDecision: decision.reason, evaluatedConfigRevision: controls.revision };
  return schedule;
}
function markAttempt(schedule, mode, { at, automatic, revision, runId = null }) {
  const lane = schedule.modes[mode];
  if (automatic) lane.lastAutomatedWindow = scheduleWindow(mode, lane.intervalHours, Date.parse(at));
  Object.assign(lane, { lastAttemptAt: at, [automatic ? 'lastAutomatedAttemptAt' : 'lastManualAttemptAt']: at, lastAttemptConfigRevision: revision, lastAttemptRunId: runId, lastAttemptAutomatic: automatic, [automatic ? 'lastAutomatedOutcome' : 'lastManualOutcome']: 'running', lastOutcome: 'running', lastDecision: 'attempted' });
}
function markOutcome(schedule, mode, outcome, at = new Date().toISOString()) {
  const lane = schedule.modes[mode];
  Object.assign(lane, { lastOutcome: outcome, lastFinishedAt: at, [lane.lastAttemptAutomatic ? 'lastAutomatedOutcome' : 'lastManualOutcome']: outcome });
  if (outcome === 'success') { lane.lastSuccessAt = at; lane[lane.lastAttemptAutomatic ? 'lastAutomatedSuccessAt' : 'lastManualSuccessAt'] = at; }
  if (['failure', 'partial_failure'].includes(outcome)) { lane.lastFailureAt = at; lane[lane.lastAttemptAutomatic ? 'lastAutomatedFailureAt' : 'lastManualFailureAt'] = at; }
}
function outcomeFor(rows) {
  if (rows.some(r => ['failed', 'access_stopped', 'robots_unverified'].includes(r.status))) return 'failure';
  if (rows.some(r => r.status === 'partial_failure' || ['partial_discovery', 'failed', 'access_stopped', 'robots_unverified'].includes(r.discovery?.status) || (r.errors || []).length || (r.discovery?.errors || []).length)) return 'partial_failure';
  if (rows.some(r => r.status === 'budget_limited')) return 'budget_limited';
  return rows.some(r => r.status === 'success') ? 'success' : 'no_confirmed_products';
}
function controlsMetadata(controls, previous = {}, attempted = false) {
  const revision = attempted ? controls.revision : previous?.lastAttemptConfigRevision || previous?.revision || null;
  return { schemaVersion: 1, revision, lastAttemptConfigRevision: revision, evaluatedRevision: controls.revision, evaluatedConfigHash: controls.revision, intervalsHours: controls.config.intervalsHours, missingSourceIds: controls.missingSourceIds, fixtureOnly: controls.fixtureOnly === true };
}
module.exports = { MODES, INTERVAL_PRESETS, DEFAULT_INTERVALS, validateControls, loadControls, sourceDecision, scheduleWindow, scheduleDecision, initializeSchedule, markAttempt, markOutcome, outcomeFor, controlsMetadata };
