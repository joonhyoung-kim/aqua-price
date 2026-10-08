'use strict';
const { parseProductPage } = require('./product-jsonld.cjs');
const { parseGodoPage } = require('./godo-public.cjs');
const { httpsUrl, sourceUrl } = require('../../dist/data-model.js');
const AGENT = 'AquaPriceCatalog/0.1 (+https://github.com/joonhyoung-kim/aqua-price)';
function sameHost(a,b) { return new URL(a).hostname.replace(/^www\./,'') === new URL(b).hostname.replace(/^www\./,''); }
function robotsAllows(text, url) {
  const groups=[]; let group=null;
  for(const raw of text.split(/\r?\n/)) { const line=raw.split('#')[0].trim(); const m=line.match(/^(user-agent|allow|disallow)\s*:\s*(.*)$/i); if(!m)continue;
    const key=m[1].toLowerCase(), value=m[2].trim();
    if(key==='user-agent'){if(!group||group.rules.length){group={agents:[],rules:[]};groups.push(group);}group.agents.push(value.toLowerCase());}
    else if(group && value)group.rules.push({allow:key==='allow',path:value});
  }
  const specific=groups.filter(g=>g.agents.some(a=>a!=='*' && AGENT.toLowerCase().includes(a)));
  const applicable=specific.length?specific:groups.filter(g=>g.agents.includes('*'));
  const path=new URL(url).pathname+new URL(url).search;
  const rules=applicable.flatMap(g=>g.rules).filter(r=>{const pattern=r.path.replace(/[.+?^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*').replace(/\\\$$/,'$');return new RegExp('^'+pattern).test(path);});
  rules.sort((a,b)=>b.path.replace(/\*/g,'').length-a.path.replace(/\*/g,'').length||Number(b.allow)-Number(a.allow));
  return !rules.length || rules[0].allow;
}
function reconcile(previous, incoming, coverage) {
  const map = new Map(previous.map(x=>[x.collector_key || x.id,x]));
  for(const item of incoming)map.set(item.collector_key || item.id,item);
  const complete = coverage.kind === 'full_catalog' && coverage.paginationComplete === true && coverage.terminalPageReached === true && coverage.expectedPages > 0 && coverage.expectedPages === coverage.visitedPages && coverage.parseFailures === 0 && coverage.requestFailures === 0 && coverage.expectedProductCount === incoming.length;
  if(complete){const ids=new Set(incoming.map(x=>x.collector_key||x.id));for(const key of map.keys())if(!ids.has(key))map.delete(key);}
  return { products:[...map.values()], deletionAllowed:complete };
}
async function request(url, source, runtime, prior, redirectDepth=0) {
  if(!sourceUrl(url)||!sameHost(url,source.officialURL)||new URL(url).protocol==='http:'&&source.publicHttpApproved!==true)throw Error('URL outside registered public source');
  const clock=runtime.now(), cached=prior.cache?.[url];
  if(cached && clock-Date.parse(cached.fetchedAt)<source.cacheTtlMs)return {status:200,text:cached.text,cacheHit:true};
  if(runtime.requests>=source.maxRequests)throw Error('request_limit');
  if(runtime.lastRequest!==null)await runtime.sleep(Math.max(0,source.delayMs-(clock-runtime.lastRequest)));
  runtime.requests++;runtime.lastRequest=runtime.now();
  const response=await runtime.fetch(url,{headers:{'User-Agent':AGENT,Accept:'text/html,text/plain'},redirect:'manual',signal:AbortSignal.timeout(source.timeoutMs)});
  if([403,429].includes(response.status)){const error=Error('access_stopped');error.status=response.status;error.retryAfter=response.headers.get('retry-after');throw error;}
  if(response.status>=300&&response.status<400){
    const target=response.headers.get('location');const next=target?new URL(target,url).href:null;
    if(!next||!sourceUrl(next)||!sameHost(next,source.officialURL)||new URL(next).protocol==='http:'&&source.publicHttpApproved!==true||redirectDepth>=2)throw Error('redirect_requires_explicit_review');
    return request(next,source,runtime,prior,redirectDepth+1);
  }
  if(response.status===404)return {status:404,text:''};
  if(!response.ok)throw Error('http_'+response.status);
  const size=Number(response.headers.get('content-length'));if(Number.isFinite(size)&&size>source.maxBytes)throw Error('response_too_large');
  const reader=response.body?.getReader();let text='';
  if(reader){const parts=[];let bytes=0;while(true){const next=await reader.read();if(next.done)break;bytes+=next.value.byteLength;if(bytes>source.maxBytes){await reader.cancel();throw Error('response_too_large');}parts.push(next.value);}const buffer=Buffer.concat(parts);const header=response.headers.get('content-type')||'';const charset=header.match(/charset\s*=\s*["']?([\w-]+)/i)?.[1]||buffer.subarray(0,12000).toString('ascii').match(/charset\s*=\s*["']?([\w-]+)/i)?.[1]||'utf-8';text=new TextDecoder(charset).decode(buffer);}
  else {text=await response.text();if(Buffer.byteLength(text)>source.maxBytes)throw Error('response_too_large');}
  prior.cache=prior.cache||{};prior.cache[url]={text,fetchedAt:new Date(runtime.now()).toISOString()};
  return {status:response.status,text,cacheHit:false};
}
async function collectSource(source, previous={}, options={}) {
  const prior=structuredClone(previous), now=options.now||Date.now;
  const run={now,fetch:options.fetch||fetch,sleep:options.sleep||((ms)=>new Promise(resolve=>setTimeout(resolve,ms))),requests:0,lastRequest:null};
  const state={...prior,products:prior.products||[],collectorLastAttempt:new Date(now()).toISOString(),status:'pending',coverage:{kind:'known_product_urls',paginationComplete:false,terminalPageReached:false,visitedPages:0,expectedPages:source.products?.length||0,parseFailures:0,requestFailures:0},errors:[]};
  const fail=(status,error)=>({...state,cache:prior.cache||{},status,errors:[...state.errors,error],requests:run.requests});
  if(source.technicalReadiness==='blocked'||source.enabled!==true)return fail('disabled',source.blockers?.join('; ')||'Not enabled');
  if(prior.requiresManualReview)return fail('quarantined','Prior HTTP403 requires review; no retry or alternate route');
  if(prior.blockedUntil && now()<Date.parse(prior.blockedUntil))return fail('backoff','Previous HTTP denial backoff');
  const limits={maxRequests:12,delayMs:2000,cacheTtlMs:3*3600000,timeoutMs:15000,maxBytes:2000000,...source};
  const incoming=[];const updatedKeys=[];let fresh=0;
  try {
    const robots=await request(new URL('/robots.txt',limits.officialURL).href,limits,run,prior);
    if(robots.status!==200)return fail('robots_unverified','robots.txt not available; no product request made');
    const crawlDelays=[...robots.text.matchAll(/^\s*Crawl-delay:\s*(\d+(?:\.\d+)?)\s*$/gmi)].map(m=>Number(m[1])*1000);
    if(crawlDelays.length)limits.delayMs=Math.max(limits.delayMs,...crawlDelays);
    for(const product of limits.products||[]) {
      if(!robotsAllows(robots.text,product.url)){state.errors.push('robots_denied:'+product.url);state.coverage.requestFailures++;continue;}
      const page=await request(product.url,limits,run,prior);
      if(page.status===404){state.errors.push('product_404_preserved:'+product.url);state.coverage.requestFailures++;continue;}
      state.coverage.visitedPages++;
      const observedAt=page.cacheHit?(prior.cache?.[product.url]?.fetchedAt || state.collectorLastAttempt):new Date(now()).toISOString();
      const context={...product,url:product.url,sourceId:source.id,domain:source.sourceDomain,name:source.name,photosAllowed:source.photosAllowed===true,observedAt};
      const parsed=limits.adapter==='godo_public_price'?parseGodoPage(page.text,context):limits.adapter==='legacy_godo_public_price'?parseGodoPage(page.text,context,true):parseProductPage(page.text,context);
      if(parsed.status!=='success'){state.errors.push(...parsed.issues.map(x=>x+':'+product.url));state.coverage.parseFailures++;continue;}
      if(parsed.issues.some(x=>x!=='duplicate_offer')){state.errors.push(...parsed.issues.filter(x=>x!=='duplicate_offer').map(x=>x+':'+product.url));state.coverage.parseFailures++;}
      incoming.push(...parsed.items);if(!page.cacheHit){fresh++;updatedKeys.push(...parsed.items.map(p=>p.collector_key));}else updatedKeys.push(...parsed.items.filter(p=>!state.products.some(old=>old.collector_key===p.collector_key)).map(p=>p.collector_key));
    }
    const merged=reconcile(state.products,incoming,state.coverage);state.products=merged.products;state.updatedKeys=updatedKeys;state.deletionAllowed=merged.deletionAllowed;state.cache=prior.cache||{};state.requests=run.requests;
    state.status=state.errors.length?'partial_failure':incoming.length?'success':'no_confirmed_products';
    if(incoming.length && !state.errors.length && (fresh>0||!prior.collectorLastSuccess))state.collectorLastSuccess=new Date(now()).toISOString();
    state.cacheOnly=fresh===0&&incoming.length>0&&updatedKeys.length===0;
    return state;
  }catch(error){state.coverage.requestFailures++;if([403,429].includes(error.status)){state.blockedUntil=new Date(now()+24*3600000).toISOString();state.httpStatus=error.status;state.requiresManualReview=error.status===403;state.retryAfter=error.retryAfter??null;return fail('access_stopped',String(error.message));}return fail('failed',String(error.message));}
}
module.exports={collectSource,reconcile,robotsAllows};
