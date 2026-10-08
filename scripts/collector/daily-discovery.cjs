'use strict';
const {categoryUrl,categoryKey,productKey,parseCategoryPage}=require('./discovery.cjs');const {request,robotsAllows}=require('./engine.cjs');
async function discoverDaily(source,seed,previous={},options={}){
 const now=options.now||Date.now,prior=structuredClone(previous),cursor=prior.cursor?.schemaVersion===1?structuredClone(prior.cursor):{schemaVersion:1,nextCategoryIndex:0,categories:{}};
 const run={now,deadline:options.deadline,fetch:options.fetch||fetch,sleep:options.sleep||((ms)=>new Promise(r=>setTimeout(r,ms))),requests:0,lastRequest:prior.lastRequestAt??null};const limits={delayMs:2000,cacheTtlMs:10800000,timeoutMs:15000,maxBytes:2000000,maxRequests:10,...source};
 const out={sourceId:source.id,status:'pending',lastAttempt:new Date(now()).toISOString(),cursor,categories:[],products:[],requests:0,errors:[],coverage:{kind:'representative_category_seeds',coverageComplete:false,deletionAllowed:false,pageBudget:seed.maxPages,productBudget:seed.maxProducts,pagesVisited:0,representativeSeedCount:seed.categories.length},cache:prior.cache||{}};const found=new Map();const known=new Set(options.knownProductKeys||[]);
 const finish=status=>({...out,status,products:[...found.values()],requests:run.requests,lastRequestAt:run.lastRequest,cache:prior.cache||{}});
 if(!source.enabled||source.technicalReadiness==='blocked')return finish('disabled');if(prior.requiresManualReview)return finish('quarantined');if(prior.blockedUntil&&now()<Date.parse(prior.blockedUntil))return finish('backoff');if(seed.adapter!=='cafe24_category_links')return finish('adapter_not_implemented');
 if(!Number.isSafeInteger(seed.maxPages)||seed.maxPages<1||seed.maxPages>10||!Number.isSafeInteger(seed.maxProducts)||seed.maxProducts<1||seed.maxProducts>100)throw Error('Invalid daily discovery budget');
 const entries=seed.categories.filter(c=>!c.excluded);if(!entries.length)return finish('no_reviewed_categories');
 try{
  const robots=await request(new URL('/robots.txt',source.officialURL).href,limits,run,prior);if(robots.status!==200)return finish('robots_unverified');const crawl=[...robots.text.matchAll(/^\s*Crawl-delay:\s*(\d+(?:\.\d+)?)\s*$/gmi)].map(m=>Number(m[1])*1000);if(crawl.length)limits.delayMs=Math.max(limits.delayMs,...crawl);
  const start=cursor.nextCategoryIndex%entries.length;
  for(let offset=0;offset<entries.length;offset++){
   if(out.coverage.pagesVisited>=seed.maxPages||found.size>=seed.maxProducts)break;const index=(start+offset)%entries.length,entry=entries[index],first=categoryUrl(entry.url,entry.url,source.officialURL),key=first&&categoryKey(first);if(!first||!key){out.errors.push('unsupported_category_route');continue;}
   let saved=cursor.categories[key];if(!saved||saved.entryUrl!==first||!saved.nextUrl){saved={entryUrl:first,nextUrl:first,seenKeys:[],cycleStartedAt:new Date(now()).toISOString(),cyclesCompleted:saved?.cyclesCompleted||0,lastCycle:saved?.lastCycle||null,visitedPageUrls:[]};}
   if(categoryKey(saved.nextUrl)!==key||categoryUrl(saved.nextUrl,saved.nextUrl,source.officialURL)===null){out.errors.push('invalid_saved_cursor');saved.nextUrl=first;saved.seenKeys=[];}
   cursor.categories[key]=saved;
   const seen=new Set(saved.seenKeys),record={url:first,label:entry.label,visitedPages:[],expectedProductCount:saved.expectedProductCount??null,terminalPageReached:false,coverageComplete:false,errors:[],headProbe:false};out.categories.push(record);
   let next=saved.nextUrl;const remainingPages=seed.maxPages-out.coverage.pagesVisited;
   const head=next!==first&&seed.probeFirstPage!==false&&remainingPages>=2&&saved.headProbePending!==true;let headDone=!head;const visited=new Set();record.headProbeDeferred=next!==first&&!head;
   while(next&&out.coverage.pagesVisited<seed.maxPages&&found.size<seed.maxProducts){
    const url=headDone?next:first;if(visited.has(url)){record.errors.push('pagination_cycle');break;}if(!robotsAllows(robots.text,url)){record.errors.push('robots_denied_category');break;}
    if(headDone)saved.nextUrl=url;const page=await request(url,limits,run,prior);if(page.status!==200){record.errors.push('category_http_'+page.status);break;}if(!headDone)saved.headProbePending=true;else saved.headProbePending=false;visited.add(url);out.coverage.pagesVisited++;record.visitedPages.push(url);saved.visitedPageUrls=[...new Set([...(saved.visitedPageUrls||[]),url])];const parsed=parseCategoryPage(page.text,url,source.officialURL);record.errors.push(...parsed.issues);
    if(parsed.expectedTotal!==null){if(saved.expectedProductCount!==undefined&&saved.expectedProductCount!==parsed.expectedTotal){saved.countChanged=true;}saved.expectedProductCount=parsed.expectedTotal;record.expectedProductCount=parsed.expectedTotal;}
    else record.errors.push('expected_total_unverified');
    let consumed=true;
    for(const productUrl of parsed.products){const id=productKey(productUrl);if(seen.has(id))continue;if(!robotsAllows(robots.text,productUrl)){record.errors.push('robots_denied_product');continue;}if(known.has(id)){seen.add(id);saved.seenKeys=[...seen].slice(-50000);continue;}if(found.size>=seed.maxProducts){consumed=false;break;}seen.add(id);saved.seenKeys=[...seen].slice(-50000);found.set(id,{url:productUrl,type:entry.type??null,subtype:entry.subtype??null,mixedCategories:entry.mixedCategories===true,classificationBasis:entry.reviewBasis,discoveredInCategory:first,discoveredAt:page.fetchedAt||new Date(now()).toISOString(),requiresProductClassification:true});}
    if(!headDone){headDone=true;record.headProbe=true;if(!consumed){record.errors.push('product_budget_reached');break;}continue;}
    if(!consumed){record.errors.push('product_budget_reached');saved.nextUrl=url;break;}
    record.terminalPageReached=parsed.terminal;if(parsed.issues.length){saved.nextUrl=url;break;}next=parsed.nextPage;saved.nextUrl=next;
    if(parsed.terminal){saved.cyclesCompleted++;saved.lastCycleFinishedAt=new Date(now()).toISOString();record.categoryCycleFinished=true;record.coverageComplete=parsed.expectedTotal!==null&&parsed.expectedTotal===seen.size&&!saved.countChanged&&record.errors.length===0;saved.lastCycle={finishedAt:saved.lastCycleFinishedAt,reportedCount:parsed.expectedTotal,observedUniqueLinks:seen.size,terminalPageReached:true,categoryLinkCountMatched:record.coverageComplete,detailCoverageComplete:false};break;}
   }
   if(saved.nextUrl&&(out.coverage.pagesVisited>=seed.maxPages||found.size>=seed.maxProducts))record.errors.push(out.coverage.pagesVisited>=seed.maxPages?'page_budget_reached':'product_budget_reached');
   saved.seenKeys=[...seen].slice(-50000);saved.lastAttempt=out.lastAttempt;cursor.categories[key]=saved;cursor.nextCategoryIndex=(index+1)%entries.length;record.nextPage=saved.nextUrl;record.cycleSeenProductCount=seen.size;record.errors=[...new Set(record.errors)];out.errors.push(...record.errors.map(e=>e+':'+first));
  }
  const hard=out.errors.filter(e=>!e.startsWith('page_budget_reached')&&!e.startsWith('product_budget_reached'));out.budgetLimited=out.errors.length>hard.length;return finish(hard.length?'partial_discovery':out.budgetLimited?'budget_limited':'success');
 }catch(e){out.errors.push(e.message);if(e.message==='execution_deadline')return finish('budget_limited');if([403,429].includes(e.status)){out.requiresManualReview=e.status===403;out.blockedUntil=new Date(now()+86400000).toISOString();out.httpStatus=e.status;return finish('access_stopped');}return finish('failed');}
}
module.exports={discoverDaily};
