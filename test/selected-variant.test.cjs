'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fixture=require('./fixtures/aquagarden-selected.json');
const {parseProductPage}=require('../scripts/collector/product-jsonld.cjs');
const {parseWpetPage}=require('../scripts/collector/wpet-public.cjs');
const context={url:fixture.url,domain:'aquagardenshop.com',sourceId:'retailer-42',name:'아쿠아가든 쇼핑몰',type:'gear',subtype:'food',observedAt:fixture.observedAt};
const parse=html=>parseProductPage(html,context);
test('captured standalone selected variant keeps exact 100mL price, URL and stable identity',()=>{
 const r=parse(fixture.html);assert.equal(r.status,'success');assert.deepEqual(r.issues,[]);assert.equal(r.items.length,1);
 const p=r.items[0];assert.equal(p.price_amount,4000);assert.equal(p.available,true);assert.equal(p.variant_title,'아쿠아가든 구피 열대어 사료 미니비트 100ml');assert.equal(p.product_url,fixture.url);
 assert.equal(p.collector_key,'retailer-42:cafe24_rorio2_1_2699_P0000DZV000D:default');assert.equal(p.shipping_amount,null);assert.equal(p.quantity_per_pack,null);assert.equal(p.primary_product_evidence,undefined);
});
test('mismatched parent, SKU, option amount, multiple selectors and hidden base fail closed',()=>{
 const mutations=[
  h=>h.replace('"inProductGroupWithID":"cafe24_rorio2_1_2699"','"inProductGroupWithID":"wrong"'),
  h=>h.replace('"sku":"cafe24_rorio2_1_2699_P0000DZV000D"','"sku":"wrong"'),
  h=>h.replace('option_price\\\":4000','option_price\\\":3999'),
  h=>h+'<select product_type="product_option"><option>Another axis</option></select>',
  h=>h.replace('id="span_product_price_text"','style="display:none" id="span_product_price_text"'),
  h=>h.replace('20,000원','19,999원'),
  h=>h.replace('is_selling\\\":\\\"T','is_selling\\\":\\\"F'),
  h=>h.replace('option_stock_data','unverified_option_data')
 ];
 for(const mutate of mutations){const h=mutate(fixture.html);assert.notEqual(h,fixture.html,'fixture mutation applied');assert.equal(parse(h).items.length,0);}
});
test('selected option disabled is not overridden by InStock JSON-LD',()=>{
 const h=fixture.html.replace('value="아쿠아가든 구피 열대어 사료 미니비트 100ml"','disabled value="아쿠아가든 구피 열대어 사료 미니비트 100ml"');assert.equal(parse(h).items.length,0);
});
test('sale-stopped wpet notice remains a review failure without new price or inferred option identity',()=>{
 const c={url:'https://www.wpet.co.kr/?act=shop.goods_view&CM=1754&GC=GD00'};
 const r=parseWpetPage('<p>죄송합니다. "아쿠아마린 더블소드 구피" 상품은 현재 판매가 중지된 상품입니다.</p>',c);
 assert.deepEqual(r,{status:'parse_failed',items:[],issues:['wpet_sale_stopped_identity_unverified']});
 assert.equal(parseWpetPage('<p>Unknown error</p>',c).issues[0],'wpet_canonical_identity_mismatch');
 assert.equal(parseWpetPage('<p>Unknown</p>',{url:'https://www.wpet.co.kr/?act=shop.goods_view&GS=1895'}).issues[0],'wpet_detail_route_unverified');
});
