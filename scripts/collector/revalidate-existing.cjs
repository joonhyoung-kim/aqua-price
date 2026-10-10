'use strict';
const crypto = require('node:crypto');
const {productKey} = require('./discovery.cjs');
const {revalidationCandidates} = require('./classification-revalidation.cjs');
const {verifyDiscovered} = require('./verify-discovered.cjs');
const VERSION = 1;
const {CLASSIFICATION_VERSION} = require('./queue-policy.cjs');
const terminal = new Set(['corrected', 'verified_gear', 'needs_review', 'identity_mismatch', 'robots_denied_product']);
function digest(update) { return crypto.createHash('sha256').update(JSON.stringify(update)).digest('hex'); }
function ownRows(source, snapshot, state) {
 const rows = new Map();
 for (const row of [...(snapshot.items || []), ...(state.products || [])]) {
  if (row.source_id !== source.id || row.seller_domain !== source.sourceDomain) continue;
  const old = rows.get(row.id);
  if(old&&!sameIdentity(old,row))continue;
  const at=Date.parse(row.observed_at_utc), before=Date.parse(old?.observed_at_utc);
  if (!old || Number.isFinite(at) && (!Number.isFinite(before) || at >= before)) rows.set(row.id, row);
 }
 // Local state can be saved before publication. A still-published gear identity
 // needs a new fresh receipt even when local state already contains the correction.
 for(const published of snapshot.items||[]){const current=rows.get(published.id);if(published.type==='gear'&&current?.type==='live'&&sameIdentity(published,current))rows.set(published.id,{...current,type:published.type,subtype:published.subtype,title:published.title});}
 return rows;
}
function sameIdentity(old, fresh) {
 try { return !!old?.collector_key && old.collector_key === fresh.collector_key && old.source_id === fresh.source_id &&
  old.seller_domain === fresh.seller_domain && old.retailer_product_id === fresh.retailer_product_id &&
  (old.variant_id || null) === (fresh.variant_id || null) && productKey(old.product_url) === productKey(fresh.product_url); }
 catch { return false; }
}
function syncQueue(source, snapshot, state) {
 const rows = ownRows(source, snapshot, state), saved = new Map((state.classificationRevalidationQueue || []).map(x => [x.id, x]));
 const flags = revalidationCandidates(source, {items: [...rows.values()]});
 for (const flag of flags) {
  const old = saved.get(flag.id), row = rows.get(flag.id);
  if (old && old.version === VERSION && old.classificationVersion === CLASSIFICATION_VERSION && old.status !== 'corrected' && old.collectorKey === row.collector_key && old.title === row.title) continue;
  saved.set(flag.id, {...flag, version: VERSION, classificationVersion: CLASSIFICATION_VERSION, status: 'pending', retailerProductId: row.retailer_product_id,
   variantId: row.variant_id || null, queuedAt: old?.queuedAt || null, attempts: old?.attempts || 0});
 }
 // Keep review evidence, but never enqueue a removed or already-corrected identity.
 return [...saved.values()].filter(x => rows.has(x.id)).map(x => {
  const row = rows.get(x.id);
  return row.type === 'gear' ? x : {...x, status: x.status === 'corrected' ? 'corrected' : 'no_longer_gear'};
 });
}
function canPublishCorrection(old, update, state) {
 const proof = (state.classificationRevalidationUpdates || []).find(x => x.id === update.id);
 if (!proof || !old || old.id !== update.id || old.type !== 'gear' || update.type !== 'live' || update.replaces_snapshot_id || !sameIdentity(old, update)) return false;
 return proof.version === VERSION && proof.status === 'verified_fresh' && proof.fromType === 'gear' && proof.cacheHit === false &&
  proof.collectorKey === update.collector_key && proof.sourceId === update.source_id && proof.previousObservedAt === old.observed_at_utc &&
  proof.observedAt === update.observed_at_utc && Number.isFinite(Date.parse(proof.observedAt)) &&
  Date.parse(proof.observedAt) >= Date.parse(proof.attemptStartedAt) && Date.parse(proof.observedAt) <= Date.parse(proof.verifiedAt) &&
  !!update.classification_basis && !!update.classification_evidence && update.classification_evidence.conflicts === false &&
  ['fish', 'shrimp', 'aquatic_plant', 'snail'].includes(update.subtype) && proof.updateSha256 === digest(update);
}
async function revalidateExisting(source, seed, state, snapshot, options = {}) {
 const next = structuredClone(state), now = options.now || Date.now;
 next.classificationRevalidation = revalidationCandidates(source, snapshot, next);
 next.classificationRevalidationQueue = syncQueue(source, snapshot, next);
 next.classificationRevalidationUpdates = [];
 const summary = {selectedPages: 0, attemptedPages: 0, verifiedOffers: 0, correctedOffers: 0, requests: 0, errors: []};
 next.classificationRevalidationSummary = summary;
 const rows = ownRows(source, snapshot, next), held = new Set((source.reviewHoldProducts || []).map(p => productKey(p.url)));
 if (!source.enabled || source.technicalReadiness === 'blocked' || next.requiresManualReview || next.blockedUntil && now() < Date.parse(next.blockedUntil)) return next;
 if (!require('./legacy-discovery.cjs').ADAPTERS.has(seed.adapter)) return next;
 const groups = new Map();
 for (const entry of next.classificationRevalidationQueue) {
  if (!(snapshot.items||[]).some(p=>p.id===entry.id&&p.type==='gear'&&sameIdentity(p,rows.get(entry.id))))continue;
  if (terminal.has(entry.status) || entry.status === 'no_longer_gear' || held.has(entry.key) || entry.retryAfter && now() < Date.parse(entry.retryAfter)) continue;
  if (!groups.has(entry.key)) groups.set(entry.key, []);
  groups.get(entry.key).push(entry);
 }
 const limit = Math.max(0, Math.min(options.detailLimit ?? 6, source.maxRequests - (next.requests || 0)));
 const selected = [...groups.values()].slice(0, limit); summary.selectedPages = selected.length;
 for (const entries of selected) {
  const remaining = source.maxRequests - (next.requests || 0);
  if (remaining < 1 || Number.isFinite(options.deadline) && now() >= options.deadline) break;
  const entry = entries[0], startedAt = new Date(now()).toISOString();
  const verification = await verifyDiscovered({...source, maxRequests: remaining}, {...seed, maxProductVerifications: 1},
   [{url: entry.url, type: 'gear', mixedCategories: true, requiresFreshVerification: true}],
   {cache: next.cache, lastRequestAt: next.lastRequestAt, requiresManualReview: next.requiresManualReview, blockedUntil: next.blockedUntil}, options);
  const attempted=verification.attemptedCandidateKeys?.includes(entry.key)===true;
  summary.status = verification.status; if(attempted)summary.attemptedPages++; summary.requests += verification.requests; summary.errors.push(...verification.errors);
  next.requests = (next.requests || 0) + verification.requests; next.cache = verification.cache; next.lastRequestAt = verification.lastRequestAt;
  for (const key of ['requiresManualReview', 'blockedUntil', 'httpStatus']) if (verification[key] !== undefined) next[key] = verification[key];
  const verifiedAt = new Date(now()).toISOString(), detail = verification.verifiedDetails?.find(x => x.key === entry.key);
  const fresh = detail && detail.cacheHit === false && Number.isFinite(Date.parse(detail.observedAt)) &&
   Date.parse(detail.observedAt) >= Date.parse(startedAt) && Date.parse(detail.observedAt) <= now();
  for (const record of entries) {
   record.lastCheckedAt = startedAt; record.queuedAt ||= startedAt;
   if(attempted){record.attempts = (record.attempts || 0) + 1; record.lastAttempt = startedAt;}
   if(!attempted&&verification.status==='budget_limited')continue;
   const old = rows.get(record.id), matches = verification.products.filter(item => sameIdentity(old, item));
   const issue = verification.classificationIssues.find(x => x.collectorKey === old.collector_key) || verification.classificationIssues.find(x => !x.collectorKey && x.key === record.key);
   if (fresh && matches.length === 1) {
    const item = {...matches[0], id: old.id}; delete item.replaces_snapshot_id;
    if (Date.parse(item.observed_at_utc) < Date.parse(old.observed_at_utc)) {
     record.status = 'deferred'; record.reason = 'Fresh observation is older than the preserved published observation';
    } else {
     record.status = item.type === 'live' ? 'corrected' : 'verified_gear';
     record.reason = item.classification_basis; record.evidence = {url: record.url, observedAt: item.observed_at_utc, cacheHit: false,
      basis: item.classification_basis, classification: item.classification_evidence, breadcrumbs: item.product_breadcrumb_evidence};
     record.verifiedAt = verifiedAt; delete record.retryAfter;
     const index = (next.products || []).findIndex(x => x.id === old.id);
     if (index < 0) (next.products ||= []).push(item); else next.products[index] = item;
     next.updatedKeys = [...new Set([...(next.updatedKeys || []), item.collector_key])]; next.cacheOnly = false;
     summary.verifiedOffers++; if (item.type === 'live') summary.correctedOffers++;
     if (item.type === 'live') next.classificationRevalidationUpdates.push({version: VERSION, status: 'verified_fresh', id: item.id,
      collectorKey: item.collector_key, sourceId: item.source_id, fromType: 'gear', previousObservedAt: (snapshot.items || []).find(x => x.id === old.id)?.observed_at_utc || old.observed_at_utc,
      observedAt: item.observed_at_utc, attemptStartedAt: startedAt, verifiedAt, cacheHit: false, updateSha256: digest(item)});
     if (!next.collectorLastSuccess || Date.parse(item.observed_at_utc) > Date.parse(next.collectorLastSuccess)) next.collectorLastSuccess = item.observed_at_utc;
     continue;
    }
   } else if (issue && ['needs_review', 'excluded_scope', 'robots_denied_product'].includes(issue.status)) {
    record.status = issue.status === 'robots_denied_product' ? issue.status : 'needs_review'; record.reason = issue.reason || issue.status;
    record.evidence = {url: record.url, observedAt: detail?.observedAt || null, cacheHit: detail?.cacheHit ?? null, classification: issue.evidence || null};
   } else if (fresh && verification.products.length) {
    record.status = 'identity_mismatch'; record.reason = 'Fresh detail did not contain the exact preserved product and variant identity';
   } else {
    record.status = 'deferred'; record.reason = issue?.reason || issue?.status || verification.errors.join('; ') || verification.status;
   }
   if (record.status === 'deferred') record.retryAfter = new Date(now() + 86400000).toISOString();
  }
  if (['failed', 'partial_failure', 'access_stopped', 'robots_unverified'].includes(verification.status)) {
   next.status = 'partial_failure'; next.errors = [...(next.errors || []), ...verification.errors, 'reclassification_' + verification.status];
  }
  if (verification.status === 'budget_limited') next.status = 'budget_limited';
  if (['access_stopped', 'quarantined', 'backoff', 'disabled', 'robots_unverified', 'budget_limited'].includes(verification.status)) break;
 }
 if (summary.verifiedOffers && ['no_confirmed_products', 'pending'].includes(next.status)) next.status = 'success';
 return next;
}
module.exports = {VERSION, digest, sameIdentity, syncQueue, canPublishCorrection, revalidateExisting};
