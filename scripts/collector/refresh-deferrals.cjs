'use strict';
// Latest evidence per exact requested URL, not per parent product or guessed alias.
// Never edit the preserved offer, verified observation timestamp, or access hold.
const DAY = 86400000;
function keyOf(url) {
  try {
    const u = new URL(url);
    if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) return null;
    u.hash = '';
    return u.href;
  } catch { return null; }
}
function valid(record) {
  return record && ['deferred', 'recovered'].includes(record.status) &&
    Number.isFinite(Date.parse(record.lastCheckedAt)) &&
    (record.status === 'recovered' || Number.isFinite(Date.parse(record.retryAfter)));
}
function mergeDeferrals(...maps) {
  const merged = {};
  for (const map of maps) for (const [url, record] of Object.entries(map || {})) {
    const key = keyOf(url);
    if (!key || !valid(record)) continue;
    const old = merged[key];
    const nextAt = Date.parse(record.lastCheckedAt), oldAt = Date.parse(old?.lastCheckedAt);
    // A stale cache/public checkpoint cannot erase newer failure or recovery evidence.
    if (!old || nextAt > oldAt || (nextAt === oldAt && record.status === 'deferred' &&
        (old.status !== 'deferred' || Date.parse(record.retryAfter) > Date.parse(old.retryAfter)))) {
      merged[key] = structuredClone(record);
    }
  }
  return merged;
}
function isDeferred(state, url, now = Date.now()) {
  const key = keyOf(url), row = key && state?.productRefreshDeferrals?.[key];
  return Boolean(valid(row) && row.status === 'deferred' && now < Date.parse(row.retryAfter));
}
function deferRefresh(state, url, reason, observedAt, issues = []) {
  const key = keyOf(url), at = Date.parse(observedAt);
  if (!key || !Number.isFinite(at)) return;
  const map = state.productRefreshDeferrals ||= {}, old = map[key];
  if (valid(old) && Date.parse(old.lastCheckedAt) >= at) return;
  const delay = /^product_(404|410)_preserved$/.test(reason) ? 7 * DAY : DAY;
  map[key] = {...old, status: 'deferred', reason, issues: [...new Set(issues)].slice(0, 16),
    attempts: (Number.isSafeInteger(old?.attempts) ? old.attempts : 0) + 1,
    firstFailureAt: old?.firstFailureAt || new Date(at).toISOString(),
    lastFailureAt: new Date(at).toISOString(), lastCheckedAt: new Date(at).toISOString(),
    retryAfter: new Date(at + delay).toISOString()};
}
function recoverRefresh(state, url, observedAt) {
  const key = keyOf(url), old = key && state.productRefreshDeferrals?.[key], at = Date.parse(observedAt);
  if (!valid(old) || old.status !== 'deferred' || !Number.isFinite(at) || at < Date.parse(old.lastCheckedAt)) return;
  // Keep a compact recovery receipt; deleting it could resurrect an older hold.
  state.productRefreshDeferrals[key] = {...old, status: 'recovered',
    lastCheckedAt: new Date(at).toISOString(), recoveredAt: new Date(at).toISOString(), retryAfter: null};
}
function deferralSummary(map, now = Date.now()) {
  const rows = Object.values(map || {}).filter(row => valid(row) && row.status === 'deferred');
  const future = rows.filter(row => Date.parse(row.retryAfter) > now);
  const newest = rows.slice().sort((a,b) => Date.parse(b.lastCheckedAt) - Date.parse(a.lastCheckedAt))[0];
  return {unresolved: rows.length, deferred: future.length, due: rows.length - future.length,
    nextRetryAt: future.map(row => row.retryAfter).sort()[0] || null,
    lastReason: newest?.reason || null, lastFailureAt: newest?.lastFailureAt || null};
}
module.exports = {keyOf, mergeDeferrals, isDeferred, deferRefresh, recoverRefresh, deferralSummary};
