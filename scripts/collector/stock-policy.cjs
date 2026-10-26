'use strict';
const BASIS = new Set([
  'Public option selector disabled/sold-out state; checkout inventory not independently verified',
  'Retailer JSON-LD and primary page sold-out state agree; not checkout-confirmed inventory',
  'Retailer stock input matched visible product stock units; not animal count or checkout guarantee',
  'Primary product purchase row reports sold out; not checkout verification'
]);
function confirmedAvailability(item) {
  if (!item || typeof item.available !== 'boolean' || item.availability_conflict) return null;
  if (BASIS.has(item.availability_basis)) return item.available;
  const state = /^Retailer JSON-LD (InStock|OutOfStock|Discontinued|SoldOut); not checkout-confirmed inventory$/.exec(item.availability_basis || '')?.[1];
  if (state && item.available === (state === 'InStock')) return item.available;
  return null;
}
const isConfirmedOutOfStock = item => confirmedAvailability(item) === false;
function preserveStockHold(old, update, merged) {
  if (isConfirmedOutOfStock(old) && confirmedAvailability(update) === null) {
    merged.available = false;
    merged.availability_basis = old.availability_basis;
    merged.availability_last_confirmed_at_utc = old.availability_last_confirmed_at_utc || old.observed_at_utc || old.snapshot_at_utc;
    merged.availability_latest_check = { state: 'unconfirmed', observedAt: update.observed_at_utc || null };
  } else if (confirmedAvailability(update) !== null) {
    delete merged.availability_latest_check;
    delete merged.availability_last_confirmed_at_utc;
  }
  return merged;
}
// Conflicts are review failures, not permission to remove a product. Scope a
// visible signal to the primary no-option offer or one exact SKU/option only.
function stockConflict(html, { title, parentTitle, variantId, properties, available, url }, text) {
  if (typeof available !== 'boolean') return null;
  const visible = html.replace(/<script\b[\s\S]*?<\/script\s*>|<style\b[\s\S]*?<\/style\s*>|<!--[\s\S]*?-->/gi, '');
  const headings = [...visible.matchAll(/<h([12])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi)].map(m => text(m[2]));
  const attr = (tag, key) => tag.match(new RegExp('(?:^|\\s)' + key + '\\s*=\\s*["\']([^"\']*)["\']', 'i'))?.[1];
  const selects = [...visible.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select\s*>/gi)].filter(m => attr(m[1], 'product_type') === 'product_option');
  if (!variantId && !selects.length && headings.includes(title)) {
    const flags = [...html.matchAll(/\bvar\s+is_soldout_icon\s*=\s*['"]([TF])['"]/g)].map(m => m[1]);
    if (flags.length === 1 && flags[0] === 'T' && /<img\b[^>]*\balt\s*=\s*["']품절["']/i.test(visible) && available) return 'availability_conflict_primary_sold_out';
  }
  if (variantId && properties?.length === 1 && headings.includes(parentTitle || title)) {
    const page = new URL(url), id = page.searchParams.get('product_no') || page.pathname.match(/\/product\/[^/]+\/(\d+)(?:\/|$)/)?.[1];
    const prop = properties[0], code = page.searchParams.get('item_code');
    const grids = selects.filter(m => attr(m[1], 'option_product_no') === id && attr(m[1], 'option_title') === prop.name);
    if (grids.length !== 1) return null;
    const options = [...grids[0][2].matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option\s*>/gi)].filter(m => {
      const value = attr(m[1], 'value');
      return value && value !== '*' && value !== '**' && (code && value === code || value === prop.value);
    });
    if (options.length === 1 && (/\bdisabled(?:\s|=|$)/i.test(options[0][1]) || /(?:\[|\(|\s)품절(?:\]|\)|\s|$)/.test(text(options[0][2]))) && available) return 'availability_conflict_exact_option_sold_out';
  }
  return null;
}
module.exports = { confirmedAvailability, isConfirmedOutOfStock, preserveStockHold, stockConflict };
