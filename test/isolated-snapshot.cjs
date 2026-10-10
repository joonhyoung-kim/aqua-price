'use strict';
// Background data for isolated CLI tests. Never import arbitrary live inventory
// into fake retailer IDs or transport allowlists when the real catalog reorders.
module.exports=function isolatedSnapshot(){return {
 source_name:'Synthetic test fixture only',
 summary:{offer_count:1,merchant_count:1},
 items:[{
  id:'neutral-background-fixture',collector_key:'neutral-background-fixture:1:default',
  source_id:'neutral-background-fixture',seller_domain:'background.invalid',
  product_url:'https://background.invalid/product/neutral/1/',
  type:'gear',subtype:null,title:'Synthetic background fixture',
  observed_at_utc:'2026-01-01T00:00:00Z',price_amount:1000,currency:'KRW',
  photo:null,registered_at:null,shipping_amount:null,available:true
 }]
};};
