'use strict';
// Cafe24 can emit only the selected Product instead of an inline ProductGroup.
// Accept it only when the public, single-axis selector and SKU-bound option data
// independently corroborate its parent, exact option and base-price adjustment.
// Never execute retailer JavaScript or use an aggregate/sale price as evidence.
function selectedVariant(html, product, context, visibleText) {
  const fail = () => null, parent = product.isVariantOf, offer = product.offers;
  if (!parent || typeof parent !== 'object' || parent['@type'] !== 'ProductGroup' || typeof parent.name !== 'string' || typeof product.name !== 'string' || !offer || typeof offer !== 'object' || Array.isArray(offer)) return fail();
  const props = product.additionalProperty;
  if (!Array.isArray(props) || props.length !== 1 || typeof props[0]?.name !== 'string' || typeof props[0]?.value !== 'string') return fail();
  const prop = props[0], group = parent.productGroupID;
  const pageId = u => u.pathname === '/product/detail.html' ? u.searchParams.get('product_no') : u.pathname.match(/^\/product\/[^/]+\/(\d+)(?:\/|$)/)?.[1];
  let page, declared, reference;
  try { page = new URL(context.url); declared = new URL(offer.url); reference = new URL(parent['@id']); } catch { return fail(); }
  const code = page.searchParams.get('item_code'), id = pageId(page);
  if (!/^\d+$/.test(id || '') || !/^[A-Z0-9]+$/.test(code || '') || ![declared, reference].every(u => u.origin === page.origin && pageId(u) === id) || declared.searchParams.get('item_code') !== code) return fail();
  if (typeof group !== 'string' || !group.endsWith('_' + id) || product.inProductGroupWithID !== group || product.sku !== group + '_' + code || offer.sku && offer.sku !== product.sku) return fail();
  const name = visibleText(parent.name || ''), value = visibleText(prop.value);
  if (!name || !value || visibleText(product.name || '') !== name + ' ' + value) return fail();
  const visible = html.replace(/<script\b[\s\S]*?<\/script\s*>|<style\b[\s\S]*?<\/style\s*>|<!--[\s\S]*?-->/gi, '');
  const attr = (s, k) => s.match(new RegExp('(?:^|\\s)' + k + '\\s*=\\s*(["\x27])(.*?)\\1', 'i'))?.[2];
  const headings = [...visible.matchAll(/<h([12])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi)].some(m => visibleText(m[2]) === name);
  const nameRows = [...visible.matchAll(/<tr\b([^>]*)>\s*<th\b[^>]*>([\s\S]*?)<\/th>\s*<td\b[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/gi)].filter(m => visibleText(m[2]) === '상품명');
  const metaNames = [...html.matchAll(/<meta\b[^>]*>/gi)].filter(m => attr(m[0], 'property') === 'og:title');
  if (!headings && !(nameRows.length === 1 && !/hidden|displaynone|display\s*:\s*none/i.test(nameRows[0][1]) && visibleText(nameRows[0][3]) === name && metaNames.length === 1 && attr(metaNames[0][0], 'content') === name)) return fail();
  const grids = [...visible.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select\s*>/gi)].filter(m => attr(m[1], 'product_type') === 'product_option');
  if (grids.length !== 1 || attr(grids[0][1], 'option_product_no') !== id || attr(grids[0][1], 'option_type') !== 'T' || attr(grids[0][1], 'option_title') !== prop.name || /\bhidden\b|display\s*:\s*none/i.test(grids[0][1])) return fail();
  const options = [...grids[0][2].matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option\s*>/gi)].filter(m => (attr(m[1], 'value') === prop.value || attr(m[1], 'value') === code));
  if (options.length !== 1 || /\bdisabled\b|\bhidden\b/i.test(options[0][1])) return fail();
  const bases = [...visible.matchAll(/<(span|strong)\b([^>]*\bid=["']span_product_price_text["'][^>]*)>([\s\S]*?)<\/\1>/gi)];
  const base = bases.length === 1 && !/\bhidden\b|display\s*:\s*none/i.test(bases[0][2]) && visibleText(bases[0][3]).match(/^(\d+(?:,\d{3})*)\s*원$/);
  if (!base) return fail();
  const literals = [...html.matchAll(/\boption_stock_data\s*=\s*'((?:\\.|[^'\\])*)'\s*;/g)];
  if (literals.length !== 1) return fail();
  let rows;
  try { rows = JSON.parse(literals[0][1].replace(/\\([\\'"])/g, '$1')); } catch { return fail(); }
  const row = rows?.[code], amount = Number(offer.price), adjustment = Number(row?.stock_price);
  const baseAmount = Number(base[1].replaceAll(',', ''));
  if (!row || !/^-?\d+(?:\.0+)?$/.test(String(row.stock_price)) || !Number.isSafeInteger(baseAmount) || !Number.isSafeInteger(amount) || !Number.isSafeInteger(adjustment) || !Number.isSafeInteger(row.option_price) || row.option_price !== amount || baseAmount + adjustment !== amount) return fail();
  if (row.option_name !== prop.name || row.option_value !== prop.value || JSON.stringify(row.option_name_original) !== JSON.stringify([prop.name]) || JSON.stringify(row.option_value_orginal) !== JSON.stringify([prop.value])) return fail();
  if (Object.values(rows).filter(r => r && typeof r === 'object' && r.option_name === prop.name && r.option_value === prop.value).length !== 1 || row.is_display !== 'T' || row.is_selling !== 'T' || row.is_auto_soldout === 'T') return fail();
  // Some public selectors use the exact item code as their value. In that case
  // corroborate the visible label and signed KRW adjustment as well as the row.
  const label = visibleText(options[0][2]);
  const delta = label.match(/^(.*?)\s+\(([+-])(\d+(?:,\d{3})*)원\)$/);
  const labelMatches = label === value && adjustment === 0 ||
    delta && delta[1] === value && Number(delta[3].replaceAll(',', '')) * (delta[2] === '-' ? -1 : 1) === adjustment;
  if (attr(options[0][1], 'value') === code ? !labelMatches : label !== value) return fail();
  return { parentName: name, option: prop.value, sku: product.sku };
}
module.exports = { selectedVariant };
