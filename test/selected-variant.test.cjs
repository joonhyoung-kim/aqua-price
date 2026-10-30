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

const fisherman=require('./fixtures/fisherman-selected.json');
const fishermanContext={url:fisherman.url,domain:'fishermanbt.com',sourceId:'retailer-49',name:'피셔맨브라더스',type:'live',subtype:'fish',observedAt:fisherman.observedAt};
const parseFisher=(html,context=fishermanContext)=>parseProductPage(html,context);
test('captured SKU-valued selector corroborates selected fish without confusing accessory selectors',()=>{
 const r=parseFisher(fisherman.html);assert.equal(r.status,'success');assert.deepEqual(r.issues,[]);
 const p=r.items[0];assert.equal(p.price_amount,800);assert.equal(p.variant_title,'1마리');assert.equal(p.available,true);
 assert.equal(p.collector_key,'retailer-49:cafe24_week22_1_2989:cafe24_week22_1_2989_P0000EKZ000D');
 assert.equal(p.product_url,fisherman.url);assert.equal(p.quantity_per_pack,null);assert.equal(p.primary_product_evidence,undefined);
});
test('SKU selector requires exact public label, unique option, availability and price agreement',()=>{
 const mutations=[
  h=>h.replace('value="P0000EKZ000D"  link_image="">1마리','value="P0000EKZ000D">2마리'),
  h=>h.replace('value="P0000EKZ000D"  link_image="">1마리','value="P0000EKZ000D"  link_image="">1마리 (+1원)'),
  h=>h.replace('value="P0000EKZ000D"  link_image="">1마리','disabled value="P0000EKZ000D"  link_image="">1마리'),
  h=>h.replace('value="P0000EKZ000D"  link_image="">1마리','value="P0000EKZ000X">1마리'),
  h=>h.replace('800원','799원'),
  h=>h.replace('</optgroup>','<option value="P0000EKZ000D"  link_image="">1마리</option></optgroup>'),
  h=>h+'<select product_type="product_option"></select>',
  h=>h.replace('option_stock_data','unverified_stock')
 ];
 for(const mutate of mutations){const h=mutate(fisherman.html);assert.notEqual(h,fisherman.html);assert.equal(parseFisher(h).items.length,0);}
});
test('synthetic selected bundle must match exact visible signed KRW delta; other option prices do not suffice',()=>{
 let h=fisherman.html;
 const re=/<script type="application\/ld\+json">([\s\S]*?)<\/script>/;
 const product=JSON.parse(h.match(re)[1]);
 product.name='네온 테트라 10마리';product.sku=product.sku.replace('000D','000E');
 product.additionalProperty[0].value='10마리';product.offers.price=6000;product.offers.url=product.offers.url.replace('000D','000E');
 h=h.replace(re,'<script type="application/ld+json">'+JSON.stringify(product)+'</script>');
 const c={...fishermanContext,url:product.offers.url};
 assert.equal(parseFisher(h,c).items[0].price_amount,6000);
 for(const label of ['10마리','10마리 (+5,199원)','10마리 (-5,200원)','50마리 (+5,200원)','10마리 (+5,200달러)']){
  assert.equal(parseFisher(h.replace('10마리 (+5,200원)',label),c).items.length,0);
 }
});

test('standalone SKU refresh keeps existing group identities and preserves unobserved siblings',async()=>{
 const {collectSource}=require('../scripts/collector/engine.cjs');
 const fresh=parseFisher(fisherman.html).items[0],oldTime='2026-10-08T16:53:15.721Z';
 const siblings=[['D',800,'1마리'],['E',6000,'10마리'],['F',29000,'50마리']].map(([suffix,price,label])=>{
  const sku='cafe24_week22_1_2989_P0000EKZ000'+suffix,key='retailer-49:cafe24_week22_1_2989:'+sku;
  return {...fresh,id:key,collector_key:key,retailer_product_id:'cafe24_week22_1_2989',variant_id:sku,price_amount:price,variant_title:label,title:'네온 테트라 '+label,product_url:fisherman.url.replace('000D','000'+suffix),observed_at_utc:oldTime};
 });
 const source={id:'retailer-49',name:'피셔맨브라더스',sourceDomain:'fishermanbt.com',officialURL:'https://fishermanbt.com/',enabled:true,technicalReadiness:'adapter_sample_tested',maxRequests:2,delayMs:0,cacheTtlMs:0,timeoutMs:1000,maxBytes:2000000,products:[{url:fisherman.url,type:'live',subtype:'fish'}]};
 const result=await collectSource(source,{products:siblings},{now:()=>Date.parse(fisherman.observedAt),sleep:async()=>{},fetch:async url=>new Response(url.endsWith('/robots.txt')?'User-agent: *\nAllow: /':fisherman.html)});
 assert.equal(result.status,'success');assert.equal(result.products.length,3);
 assert.deepEqual(result.updatedKeys,[siblings[0].collector_key]);
 assert.equal(result.products[0].id,siblings[0].id);assert.equal(result.products[0].observed_at_utc,fisherman.observedAt);
 assert.deepEqual(result.products.slice(1),siblings.slice(1));assert.equal(result.deletionAllowed,false);
});
