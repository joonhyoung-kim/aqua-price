'use strict';
// Shared public-category scanning and URL identity helpers.
const {request,robotsAllows}=require('./engine.cjs');
const VOID=new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
const decode=s=>String(s||'').replace(/&(?:amp|quot|apos|lt|gt|#(\d+)|#x([\da-f]+));/gi,(all,n,h)=>n||h?String.fromCodePoint(Math.min(0x10ffff,parseInt(n||h,h?16:10))):({'&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>'})[all.toLowerCase()]||all);
function attributes(tag){const result={};for(const m of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g))result[m[1].toLowerCase()]=decode(m[2]??m[3]??m[4]);return result;}
function sameHost(a,b){try{return new URL(a).hostname.replace(/^www\./,'')===new URL(b).hostname.replace(/^www\./,'');}catch{return false;}}
function safeUrl(href,base,official){try{const url=new URL(decode(href),base);if(url.protocol!=='https:'||url.username||url.password||!sameHost(url.href,official))return null;url.hash='';return url;}catch{return null;}}
function categoryKey(value){const u=new URL(value),host=u.hostname.replace(/^www\./,'');if(u.pathname==='/shop/shopbrand.html'&&/^\d+$/.test(u.searchParams.get('xcode')||''))return host+':makeshop:'+['xcode','mcode','scode'].map(k=>u.searchParams.get(k)||'').join(':');if(u.pathname==='/goods/goods_list.php'&&/^\d+$/.test(u.searchParams.get('cateCd')||''))return host+':godo:'+u.searchParams.get('cateCd');const route=u.pathname.match(/^\/category\/[^/]+\/(\d+)\/?$/);if(route)return host+':'+route[1];if(/^\/product\/list(?:\d+_\d+)?\.html$/.test(u.pathname)&&/^\d+$/.test(u.searchParams.get('cate_no')||''))return host+':'+u.searchParams.get('cate_no');return null;}
function categoryUrl(href,base,official){const u=safeUrl(href,base,official);if(!u||!categoryKey(u.href))return null;const p=u.searchParams.get('page');u.search='';if(/^\/product\/list(?:\d+_\d+)?\.html$/.test(u.pathname))u.searchParams.set('cate_no',new URL(decode(href),base).searchParams.get('cate_no'));if(p&&/^\d+$/.test(p)&&Number(p)>1)u.searchParams.set('page',String(Number(p)));return u.href;}
function nextCategoryUrl(href,base,official){const u=safeUrl(href,base,official);if(!u||!categoryKey(u.href)||[...u.searchParams.keys()].some(k=>!['cate_no','page','sort_method'].includes(k)))return null;return u.href;}
function productUrl(href,base,official){const u=safeUrl(href,base,official);if(!u)return null;if(/^\/product\/[^/]+\/\d+\/(?:category\/.*)?$/.test(u.pathname))return u.href;const id=u.searchParams.get('product_no');if(u.pathname==='/product/detail.html'&&/^\d+$/.test(id||''))return u.href;return null;}
function productKey(value){const u=new URL(value);return u.hostname.replace(/^www\./,'')+':'+(u.pathname.match(/^\/product\/[^/]+\/(\d+)\//)?.[1]||u.searchParams.get('product_no')||u.searchParams.get('goodsNo')||u.searchParams.get('branduid')||u.pathname.replace(/\/$/,''));}
function scanHtml(html,profile={}){
 const input=String(html).replace(/<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'');const stack=[],links=[],counts=[];let paginationFound=false,listFound=false;
 for(const token of input.match(/<[^>]+>|[^<]+/g)||[]){
  if(!token.startsWith('<')){for(const f of stack)if(f.capture)f.text+=decode(token);continue;}
  const close=token.match(/^<\/([\w-]+)/);if(close){const at=stack.findLastIndex(f=>f.tag===close[1].toLowerCase());if(at>=0){for(const f of stack.splice(at))if(f.count)counts.push(f.text.trim());}continue;}
  const start=token.match(/^<([\w-]+)/);if(!start)continue;const tag=start[1].toLowerCase(),a=attributes(token),classes=(a.class||'').split(/\s+/);
  const list=classes.some(c=>(profile.listClasses||['prdList','xans-product-listnormal']).includes(c)),pager=classes.some(c=>(profile.pagerClasses||['paginate','pagination','xans-product-normalpaging']).includes(c)),count=classes.some(c=>(profile.countClasses||['prdCount']).includes(c)),blocked=classes.some(c=>(profile.blockClasses||[]).includes(c));listFound||=list;paginationFound||=pager;
  const f={tag,list,pager,count,blocked,text:'',capture:tag==='a'||count};
  if(tag==='img'&&classes.some(c=>(profile.productImageClasses||[]).includes(c))){const anchor=stack.findLast(s=>s.tag==='a'&&s.href);if(anchor&&!stack.some(s=>s.blocked)){anchor.inList=true;listFound=true;}}
  if((tag==='a'||tag==='link')&&a.href){f.href=a.href;f.rel=a.rel||'';f.inList=(list||stack.some(s=>s.list))&&!blocked&&!stack.some(s=>s.blocked);f.inPager=pager||stack.some(s=>s.pager);links.push(f);}
  if(!VOID.has(tag)&&!token.endsWith('/>'))stack.push(f);
 }
 for(const f of stack)if(f.count)counts.push(f.text.trim());return {links,counts,paginationFound,listFound};
}
function categoryCandidates(html,base,official){const map=new Map();for(const a of scanHtml(html).links){const url=categoryUrl(a.href,base,official);if(url&&!map.has(url))map.set(url,{url,label:a.text.replace(/\s+/g,' ').trim()});}return [...map.values()];}
function parseCategoryPage(html,pageUrl,official){
 const scan=scanHtml(html),current=Number(new URL(pageUrl).searchParams.get('page')||1),key=categoryKey(pageUrl),products=new Map(),pages=new Map(),issues=[];
 for(const a of scan.links){if(a.inList){const url=productUrl(a.href,pageUrl,official);if(url&&!products.has(productKey(url)))products.set(productKey(url),url);}if(a.inPager||/\bnext\b/i.test(a.rel)){const url=nextCategoryUrl(a.href,pageUrl,official);if(url&&categoryKey(url)===key){const n=Number(new URL(url).searchParams.get('page')||1);if(Number.isSafeInteger(n)&&n>current)pages.set(n,url);}else if(/\bnext\b/i.test(a.rel))issues.push('next_anchor_unusable');}}
 const values=scan.counts.map(text=>text.match(/(?:총\s*)?([\d,]+)\s*(?:개|items?|products?)/i)?.[1]).filter(Boolean).map(n=>Number(n.replaceAll(',','')));const expectedTotal=values.length&&values.every(n=>n===values[0])?values[0]:null;
 if(!scan.listFound)issues.push('product_list_not_found');if(values.length&&expectedTotal===null)issues.push('conflicting_product_counts');
 const nextPage=pages.get(current+1)||null;if(pages.size&&!nextPage)issues.push('pagination_gap');
 const terminal=!pages.size&&(scan.paginationFound||(expectedTotal!==null&&expectedTotal<=products.size));
 if(!nextPage&&!terminal)issues.push('pagination_terminal_unverified');
 return {products:[...products.values()],expectedTotal,nextPage,terminal,paginationFound:scan.paginationFound,issues};
}
async function discoverSource(source,previous={},options={}){
 const prior=structuredClone(previous),now=options.now||Date.now,runtime={now,fetch:options.fetch||fetch,sleep:options.sleep||((ms)=>new Promise(r=>setTimeout(r,ms))),requests:0,lastRequest:null};
 const config=source.discovery||{},maxPages=config.maxPages??5,maxProducts=config.maxProducts??100,limits={maxRequests:20,delayMs:2000,cacheTtlMs:10800000,timeoutMs:15000,maxBytes:2000000,...source},errors=[],categories=[],products=new Map(),conflicts=new Set();
 const result={sourceId:source.id,status:'pending',startedAt:new Date(now()).toISOString(),products:[],categories,errors,coverage:{kind:'reviewed_categories',coverageComplete:false,newProductDiscovery:true,deletionAllowed:false,pagesVisited:0,productBudget:maxProducts,pageBudget:maxPages},cache:prior.cache||{}};
 const finish=status=>({...result,status,products:[...products.values()],requests:runtime.requests,finishedAt:new Date(now()).toISOString(),cache:prior.cache||{}});
 if(!source.enabled||source.technicalReadiness==='blocked')return finish('disabled');
 if(prior.requiresManualReview)return finish('quarantined');if(prior.blockedUntil&&now()<Date.parse(prior.blockedUntil))return finish('backoff');
 if(!Number.isSafeInteger(maxPages)||maxPages<1||maxPages>50||!Number.isSafeInteger(maxProducts)||maxProducts<1||maxProducts>1000)throw Error('Invalid discovery budget');
 const entries=config.categories||[];if(!entries.length)return finish('no_reviewed_categories');
 try{
  const robots=await request(new URL('/robots.txt',source.officialURL).href,limits,runtime,prior);if(robots.status!==200)return finish('robots_unverified');
  const delays=[...robots.text.matchAll(/^\s*Crawl-delay:\s*(\d+(?:\.\d+)?)\s*$/gmi)].map(m=>Number(m[1])*1000);if(delays.length)limits.delayMs=Math.max(limits.delayMs,...delays);
  for(const entry of entries){
   const first=categoryUrl(entry.url,entry.url,source.officialURL);if(!first||!['live','gear'].includes(entry.type)||!entry.reviewBasis){errors.push('unreviewed_or_invalid_category');continue;}
   const record={url:first,type:entry.type,subtype:entry.subtype??null,visitedPages:[],expectedProductCount:null,discoveredProductCount:0,terminalPageReached:false,coverageComplete:false,errors:[]};categories.push(record);let next=first;const visited=new Set(),ids=new Set();
   while(next){
    if(result.coverage.pagesVisited>=maxPages){record.errors.push('page_budget_reached');break;}if(products.size>=maxProducts){record.errors.push('product_budget_reached');break;}if(visited.has(next)){record.errors.push('pagination_cycle');break;}
    if(!robotsAllows(robots.text,next)){record.errors.push('robots_denied_category');break;}
    const page=await request(next,limits,runtime,prior);if(page.status!==200){record.errors.push('category_http_'+page.status);break;}
    visited.add(next);record.visitedPages.push(next);result.coverage.pagesVisited++;const parsed=parseCategoryPage(page.text,next,source.officialURL);record.errors.push(...parsed.issues);
    if(parsed.expectedTotal===null)record.errors.push('expected_total_unverified');else if(record.expectedProductCount===null)record.expectedProductCount=parsed.expectedTotal;else if(record.expectedProductCount!==parsed.expectedTotal)record.errors.push('expected_total_changed');
    for(const url of parsed.products){if(!robotsAllows(robots.text,url)){record.errors.push('robots_denied_product');continue;}const id=productKey(url);if(conflicts.has(id)){record.errors.push('category_classification_conflict');continue;}if(!products.has(id)&&products.size>=maxProducts){record.errors.push('product_budget_reached');break;}ids.add(id);const old=products.get(id);if(old&&(old.type!==entry.type||(old.subtype&&entry.subtype&&old.subtype!==entry.subtype))){record.errors.push('category_classification_conflict');products.delete(id);conflicts.add(id);continue;}products.set(id,{url:old?.url||url,type:entry.type,subtype:old?.subtype||entry.subtype||null,classificationBasis:old?.subtype?old.classificationBasis:entry.reviewBasis,discoveredInCategory:first,discoveredAt:page.fetchedAt||new Date(now()).toISOString()});}
    record.terminalPageReached=parsed.terminal;next=parsed.nextPage;if(parsed.issues.length)break;
   }
   record.discoveredProductCount=ids.size;record.errors=[...new Set(record.errors)];record.coverageComplete=record.terminalPageReached&&record.expectedProductCount!==null&&record.expectedProductCount===ids.size&&record.errors.length===0;errors.push(...record.errors.map(e=>e+':'+first));
  }
  result.coverage.coverageComplete=config.allSourceCategoriesReviewed===true&&categories.length===entries.length&&categories.length>0&&categories.every(c=>c.coverageComplete)&&errors.length===0;
  // Discovery reports candidates; product verification and deletion are separate stages.
  return finish(errors.length?'partial_discovery':'success');
 }catch(e){errors.push(e.message);if([403,429].includes(e.status)){result.blockedUntil=new Date(now()+24*3600000).toISOString();result.requiresManualReview=e.status===403;result.httpStatus=e.status;return finish('access_stopped');}return finish('failed');}
}
module.exports={categoryCandidates,parseCategoryPage,discoverSource,categoryUrl,productUrl,productKey,categoryKey,scanHtml};
