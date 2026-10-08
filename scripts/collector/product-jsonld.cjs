'use strict';
const { httpsUrl, sourceUrl } = require('../../dist/data-model.js');
function host(url) { return new URL(url).hostname.replace(/^www\./, ''); }
function decode(text) { return String(text).replace(/&(?:amp|quot|apos|lt|gt|nbsp);|&#(\d+);|&#x([a-f\d]+);/gi, (entity, dec, hex) => dec || hex ? String.fromCodePoint(Number.parseInt(dec || hex, dec ? 10 : 16)) : ({'&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>','&nbsp;':' '})[entity.toLowerCase()]); }
function normalizeIdentityText(text) { return String(text).replace(/[\p{White_Space}\uFEFF]+/gu, ' ').trim(); }
function visibleText(html) { return normalizeIdentityText(decode(html.replace(/<script\b[\s\S]*?<\/script\s*>|<style\b[\s\S]*?<\/style\s*>|<!--[\s\S]*?-->/gi, '').replace(/<[^>]*>/g, ' '))); }
function identityIsVisible(text, value) {
  const name = normalizeIdentityText(value);
  if (!name) return false;
  for (let start = text.indexOf(name); start !== -1; start = text.indexOf(name, start + 1)) {
    const left = text.slice(0, start), right = text.slice(start + name.length);
    if (/^[\p{L}\p{N}]/u.test(name) && /[\p{L}\p{N}]$/u.test(left)) continue;
    if (/[\p{L}\p{N}]$/u.test(name) && /^[\p{L}\p{N}]/u.test(right)) continue;
    return true;
  }
  return false;
}
function walk(value, found) {
  if (Array.isArray(value)) return value.forEach(x => walk(x, found));
  if (!value || typeof value !== 'object') return;
  const types = Array.isArray(value['@type']) ? value['@type'] : [value['@type']];
  if (types.some(x => typeof x === 'string' && /(?:^|[\/#])ProductGroup$/.test(x))) {
    for (const child of Array.isArray(value.hasVariant) ? value.hasVariant : value.hasVariant ? [value.hasVariant] : []) {
      walk({ name: value.name, image: value.image, url: value.url, ...child, _groupName: value.name, _groupId: value.productGroupID || value.sku || value.productID, _groupLowPrice:value.offers?.lowPrice, '@type': child['@type'] || 'Product' }, found);
    }
  } else if (types.some(x => typeof x === 'string' && /(?:^|[\/#])Product$/.test(x))) found.push(value);
  if (value['@graph']) walk(value['@graph'], found);
}
function productIdentity(product, url) {
  const explicit = product.sku ?? product.productID;
  if (typeof explicit === 'string' && explicit.trim()) return explicit.trim();
  const parsed = new URL(url), query = parsed.searchParams.get('product_no') || parsed.searchParams.get('goodsNo');
  if (query) return query;
  const pathId = parsed.pathname.match(/\/product\/(?:[^/]+\/)?(\d+)(?:\/|$)/);
  return pathId ? pathId[1] : parsed.pathname.startsWith('/product/') ? parsed.pathname.replace(/\/$/,'').split('/').pop() : null;
}
function priceIsVisible(text, amount) {
  const options = [...new Set([String(amount), amount.toLocaleString('en-US')])].map(value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return options.some(value => new RegExp(`(?:^|[^\\d,])${value}\\s*(?:원|won|KRW)(?:\\s|$|[^\\d])|[₩\\u20a9]\\s*${value}(?:$|[^\\d,])`, 'i').test(text));
}
function parseProductPage(html, context) {
  if (typeof html !== 'string' || !context || !sourceUrl(context.url) || host(context.url) !== context.domain.replace(/^www\./, '')) throw Error('Invalid public product-page context');
  const products = [], issues = [];
  for (const match of html.matchAll(/<script\b[^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi)) {
    try { walk(JSON.parse(match[1].trim()), products); } catch { issues.push('invalid_jsonld'); }
  }
  if (!products.length) return { status: 'parse_failed', items: [], issues: [...issues, 'no_product_jsonld'] };
  const text = visibleText(html), items = [], keys = new Set(), groupedSkus=new Set(products.filter(p=>p._groupName&&p.sku).map(p=>p.sku));
  const meta={};for(const m of html.matchAll(/<meta\b[^>]*>/gi)){const tag=m[0],key=tag.match(/\bproperty\s*=\s*["'](product:(?:sale_)?price:(?:amount|currency))["']/i)?.[1],value=tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i)?.[1];if(key&&value!==undefined)meta[key]=value;}
  for (const product of products) {
    if(!product._groupName && groupedSkus.has(product.sku))continue;
    const title = typeof product.name === 'string' ? decode(product.name).trim() : '';
    const retailerProductId = product._groupId || productIdentity(product, context.url);
    const properties=Array.isArray(product.additionalProperty)?product.additionalProperty:product.additionalProperty?[product.additionalProperty]:[];
    const groupCorroborated=product._groupName && identityIsVisible(text,decode(product._groupName)) && ((properties.length && properties.every(p=>typeof p.value==='string'&&identityIsVisible(text,decode(p.value)))) || typeof product.color==='string'&&identityIsVisible(text,decode(product.color)));
    if (!title || (!identityIsVisible(text,title)&&!groupCorroborated) || !retailerProductId) { issues.push('identity_not_corroborated'); continue; }
    const offers = Array.isArray(product.offers) ? product.offers : product.offers ? [product.offers] : [];
    for (const offer of offers) {
      if (!offer || typeof offer !== 'object' || offer['@type'] === 'AggregateOffer') { issues.push('no_concrete_offer'); continue; }
      const raw = offer.price;
      if (!['string','number'].includes(typeof raw) || String(raw).trim() === '' || !/^\d+(?:\.0+)?$/.test(String(raw).trim()) || offer.priceCurrency !== 'KRW') { issues.push('missing_or_invalid_krw_price'); continue; }
      const amount = Number(raw);
      const visiblePrice=priceIsVisible(text,amount);
      const metaPrice=meta['product:price:currency']==='KRW' && /^\d+$/.test(meta['product:price:amount']||'') && Number(meta['product:price:amount'])===amount;
      const groupBaseCorroborated=product._groupName && Number.isFinite(Number(product._groupLowPrice)) && (priceIsVisible(text,Number(product._groupLowPrice)) || (meta['product:price:currency']==='KRW' && Number(meta['product:price:amount'])===Number(product._groupLowPrice)));
      if (!Number.isSafeInteger(amount) || (!visiblePrice&&!metaPrice&&!groupBaseCorroborated)) { issues.push('visible_price_unverified'); continue; }
      const declaredUrl=offer.url || product.url || context.url;
      const productUrl = typeof declaredUrl==='string' && declaredUrl.startsWith('http://') && host(declaredUrl)===host(context.url) ? context.url : declaredUrl;
      if (!sourceUrl(productUrl) || host(productUrl) !== host(context.url)) { issues.push('unsafe_product_url'); continue; }
      const variantId = product._groupName ? product.sku || offer.sku || offer['@id'] || null : offer.sku || offer['@id'] || null;
      if (offers.length > 1 && !variantId) { issues.push('ambiguous_variant_identity'); continue; }
      if (variantId !== null && typeof variantId !== 'string') { issues.push('invalid_variant_id'); continue; }
      const key = `${context.sourceId}:${encodeURIComponent(retailerProductId)}:${encodeURIComponent(variantId || 'default')}`;
      if (keys.has(key)) { issues.push('duplicate_offer'); continue; } keys.add(key);
      const availability = typeof offer.availability === 'string' ? offer.availability.split(/[\/#]/).pop() : null;
      const available = availability === 'InStock' ? true : ['OutOfStock','Discontinued','SoldOut'].includes(availability) ? false : null;
      const image = Array.isArray(product.image) ? product.image[0] : product.image;
      const imageUrl = typeof image === 'string' ? image : image?.url || image?.contentUrl;
      const photoUrl = httpsUrl(imageUrl) && context.photosAllowed === true ? imageUrl : null;
      if (!['live','gear'].includes(context.type) || (context.type === 'live' && !['fish','shrimp','aquatic_plant','snail'].includes(context.subtype))) { issues.push('verified_category_required'); continue; }
      const countProperty=properties.find(p=>p.name==='마릿수'&&typeof p.value==='string'&&/^\d+마리$/.test(p.value));
      const quantity = context.quantityPerPack ?? (product.quantitativeValue?.unitCode === 'C62' ? product.quantitativeValue.value : countProperty ? Number.parseInt(countProperty.value,10) : null);
      const quantityPerPack = Number.isSafeInteger(quantity) && quantity > 0 ? quantity : null;
      items.push({ id: products.length === 1 && offers.length === 1 && context.existingId ? context.existingId : key, collector_key: key, source_id: context.sourceId, retailer_product_id: retailerProductId, variant_id: variantId,
        retailer: context.name, seller_domain: host(context.url), source_kind: 'direct_retailer_product_page', verification_method: visiblePrice ? 'Product JSON-LD identity and KRW price corroborated against visible page text' : groupBaseCorroborated ? 'ProductGroup identity and starting price corroborated; each concrete variant Offer price retained, rendered option checkout price not independently checked' : 'Visible product identity and JSON-LD Offer corroborated against matching public product price metadata; rendered purchase price not independently checked',
        type: context.type, subtype: context.subtype ?? null, title, variant_title: typeof offer.name === 'string' ? decode(offer.name) : typeof product.color==='string' ? '색상: '+product.color : context.variant ?? (quantityPerPack ? quantityPerPack+'마리 묶음' : null), quantity_per_pack: quantityPerPack, unit_price_amount: quantityPerPack ? amount / quantityPerPack : null,
        product_url: productUrl, declared_product_url:declaredUrl, observed_at_utc: context.observedAt, registered_at: null, price_amount: amount, currency: 'KRW', shipping_amount: null, variant_attributes: properties, price_metadata:meta, price_basis:'Concrete JSON-LD Offer base price; sale metadata is preserved separately, discount conditions not verified',
        available, availability_basis: availability ? `Retailer JSON-LD ${availability}; not checkout-confirmed inventory` : 'Availability not supplied', stock_quantity: null,
        photo: photoUrl ? { verified_https_url: photoUrl, permission_basis: 'explicit_user_instruction', source_page_url: context.url, downloaded_or_rehosted: false } : null });
    }
  }
  if(context.existingId && products.length>1 && items.length>1 && issues.length===0)for(const item of items)item.replaces_snapshot_id=context.existingId;
  return { status: items.length ? 'success' : 'parse_failed', items, issues };
}
module.exports = { parseProductPage, visibleText, priceIsVisible };
