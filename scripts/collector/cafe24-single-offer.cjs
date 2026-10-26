'use strict';
const { parseProductPage, visibleText } = require('./product-jsonld.cjs');
// A small, explicitly reviewed known-URL source. Do not infer option prices or
// trust stock metadata when the merchant's primary detail contradicts it.
function parseSingleOffer(html, context) {
  const reject = issue => ({ status: 'parse_failed', items: [], issues: [issue] });
  const visible = html.replace(/<script\b[\s\S]*?<\/script\s*>|<style\b[\s\S]*?<\/style\s*>|<!--[\s\S]*?-->/gi, '');
  if (/<select\b[^>]*product_type\s*=\s*["']product_option["']/i.test(visible)) return reject('single_offer_options_require_review');
  const result = parseProductPage(html, context);
  if (result.status !== 'success' || result.issues.length || result.items.length !== 1 || result.items[0].variant_id) return reject('single_offer_identity_requires_review');
  const item = result.items[0];
  const headings = [...visible.matchAll(/<h([12])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi)].map(m => visibleText(m[2]));
  if (!headings.includes(item.title)) return reject('single_offer_primary_title_mismatch');
  const prices = [...visible.matchAll(/<([a-z]+)\b([^>]*\bid\s*=\s*["']span_product_price_text["'][^>]*)>([\s\S]*?)<\/\1\s*>/gi)];
  if (prices.length !== 1 || /\bhidden\b|display\s*:\s*none/i.test(prices[0][2])) return reject('single_offer_visible_price_missing');
  const price = visibleText(prices[0][3]).match(/^(\d+(?:,\d{3})*)\s*원$/);
  if (!price || Number(price[1].replace(/,/g, '')) !== item.price_amount || item.price_amount <= 0) return reject('single_offer_price_mismatch');
  // Require explicit primary-page sales state as well as the JSON-LD Offer.
  const flags = [...html.matchAll(/\bvar\s+is_soldout_icon\s*=\s*['"]([TF])['"]/g)].map(m => m[1]);
  if (flags.length !== 1 || typeof item.available !== 'boolean') return reject('single_offer_stock_unverified');
  const soldout = flags[0] === 'T';
  const icon = /<img\b[^>]*\balt\s*=\s*["']품절["']/i.test(visible);
  if (soldout !== icon || item.available !== !soldout) return reject('single_offer_stock_mismatch');
  item.verification_method = 'Single offer: primary heading, visible KRW sale price, absence of options, JSON-LD and page sold-out state agree';
  item.availability_basis = 'Retailer JSON-LD and primary page sold-out state agree; not checkout-confirmed inventory';
  return result;
}
module.exports = { parseSingleOffer };
