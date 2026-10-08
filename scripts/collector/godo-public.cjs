'use strict';
const {visibleText,priceIsVisible}=require('./product-jsonld.cjs');const {httpsUrl}=require('../../dist/data-model.js');
function attrs(tag){const values={};for(const m of tag.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/g))values[m[1].toLowerCase()]=m[3];return values;}
function parseGodoPage(html,context,legacy=false){
 if(!httpsUrl(context.url))throw Error('HTTPS source required');const text=visibleText(html);const inputs=[...html.matchAll(/<input\b[^>]*>/gi)].map(m=>attrs(m[0]));
 const field=name=>inputs.find(x=>x.name?.toLowerCase()===name.toLowerCase())?.value;
 const rawPrice=legacy?visibleText((html.match(/<[^>]*\bid=["']price["'][^>]*>([\s\S]*?)<\//i)||[])[1]||'').replace(/[^\d]/g,''):field('set_goods_price');
 const amount=Number(rawPrice);if(!rawPrice||!/^\d+$/.test(rawPrice)||!Number.isSafeInteger(amount)||!priceIsVisible(text,amount))return {status:'parse_failed',items:[],issues:['godo_price_not_corroborated']};
 const query=new URL(context.url).searchParams;const retailerId=query.get('goodsNo')||query.get('goodsno');const idInput=field('goodsNo[]')||field('goodsno');
 if(!retailerId || (idInput&&idInput!==retailerId))return {status:'parse_failed',items:[],issues:['godo_product_id_mismatch']};
 const titles=[...html.matchAll(/<meta\b[^>]*>/gi)].map(m=>attrs(m[0])).filter(m=>m.property==='og:title').map(m=>m.content);
 const heading=(html.match(/class=["'][^"']*item_detail_tit[^"']*["'][^>]*>[\s\S]*?<h3[^>]*>([\s\S]*?)<\/h3>/i)||[])[1];
 const name=context.expectedName||visibleText(heading||titles.at(-1)||'');if(!name||!text.includes(name))return {status:'parse_failed',items:[],issues:['godo_identity_not_corroborated']};
 let stock=null,available=null,basis='Availability not verified';const rawStock=field('set_goods_stock');
 if(rawStock&&/^\d+$/.test(rawStock)&&new RegExp('상품재고\\s*'+rawStock+'\\s*개').test(text)){stock=Number(rawStock);available=stock>0;basis='Retailer stock input matched visible product stock units; not animal count or checkout guarantee';}
 const primarySoldOut=legacy&&/품절된 상품입니다/.test(text);if(primarySoldOut){available=false;basis='Primary product purchase row reports sold out; not checkout verification';}
 if(!['live','gear'].includes(context.type))return {status:'parse_failed',items:[],issues:['verified_category_required']};
 const image=[...html.matchAll(/<meta\b[^>]*>/gi)].map(m=>attrs(m[0])).find(m=>m.property==='og:image')?.content;
 const photoUrl=context.photosAllowed===true&&httpsUrl(image)&&[...html.matchAll(/<img\b[^>]*>/gi)].some(m=>attrs(m[0]).src===image)?image:null;
 const key=context.sourceId+':'+retailerId+':default';return {status:'success',issues:[],items:[{id:context.existingId||key,collector_key:key,source_id:context.sourceId,retailer_product_id:retailerId,variant_id:null,retailer:context.name,seller_domain:new URL(context.url).hostname.replace(/^www\./,''),source_kind:'direct_retailer_product_page',verification_method:'Public merchant price field corroborated against visible product identity and KRW price',type:context.type,subtype:context.subtype??null,title:name,product_url:context.url,observed_at_utc:context.observedAt,registered_at:null,price_amount:amount,currency:'KRW',shipping_amount:null,available,availability_basis:basis,stock_quantity:stock,quantity_per_pack:context.quantityPerPack??null,variant_title:context.variant??null,photo:photoUrl?{verified_https_url:photoUrl,permission_basis:'explicit_user_instruction',source_page_url:context.url,downloaded_or_rehosted:false}:null}]};
}
module.exports={parseGodoPage};
