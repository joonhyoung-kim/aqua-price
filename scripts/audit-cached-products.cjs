'use strict';
// Offline only: no collector execution, HTTP requests, state/catalog writes or freshness promotion.
const fs=require('node:fs'),path=require('node:path');
const {productKey}=require('./collector/discovery.cjs');
const {buildCandidateLedger,productURL}=require('./collector/candidate-ledger.cjs');
const {mergeTree}=require('./collector/category-tree.cjs');
function auditCachedProducts(root){
 const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
 const registry=read('sources/registry.json'),seeds=read('sources/discovery-seeds.json'),state=read('.collector/state.json'),catalog=read('dist/catalog.json');
 const result={schemaVersion:1,mode:'offline_cached_content_audit',catalogRows:catalog.products.length,networkRequests:0,productsAdded:0,requiresFreshVerification:true,sources:[]};
 for(const source of registry.sources){const s=state.sources[source.id];if(!s)continue;const seed=seeds.sources.find(x=>x.id===source.id)||{adapter:'cafe24_category_links',categories:[]},merged=mergeTree(source,seed,s),known=new Set();
  for(const p of catalog.products){const u=productURL(p.sourceUrl,source.officialURL,source.officialURL);if(u)known.add(productKey(u));}
  const ledger=buildCandidateLedger(source,merged.seed,s,known),counts=ledger.entries.reduce((a,e)=>{a[e.status]=(a[e.status]||0)+1;return a;},{});
  result.sources.push({id:source.id,name:source.name,cacheEntries:Object.keys(s.cache||{}).length,decisions:counts,recoveryCandidates:ledger.recoveryCandidates,ledger,categoryChanges:merged.tree.nodes.filter(n=>s.categoryTree?.nodes?.find(old=>old.key===n.key)?.scope!==n.scope).map(n=>({key:n.key,label:n.label,oldScope:s.categoryTree?.nodes?.find(old=>old.key===n.key)?.scope||null,newScope:n.scope}))});
 }
 result.summary=result.sources.reduce((a,s)=>{a.candidates+=s.ledger.entries.length;a.cachedRecoveryCandidates+=s.recoveryCandidates.length;a.liveRecoveryCandidates+=s.recoveryCandidates.filter(c=>c.classifications.every(x=>x.type==='live')).length;a.categoryChanges+=s.categoryChanges.length;for(const[k,v]of Object.entries(s.decisions))a.decisions[k]=(a.decisions[k]||0)+v;return a;},{candidates:0,cachedRecoveryCandidates:0,liveRecoveryCandidates:0,categoryChanges:0,decisions:{}});
 return result;
}
if(require.main===module){const root=process.cwd(),result=auditCachedProducts(root),output=process.argv.indexOf('--output');if(output>=0){if(!process.argv[output+1])throw Error('--output requires a path');fs.writeFileSync(path.resolve(process.argv[output+1]),JSON.stringify(result,null,2)+'\n');}
 console.log(JSON.stringify({mode:result.mode,catalogRows:result.catalogRows,productsAdded:0,networkRequests:0,summary:result.summary,sources:result.sources.map(s=>({id:s.id,name:s.name,decisions:s.decisions,liveRecoveryCandidates:s.recoveryCandidates.filter(c=>c.classifications.every(x=>x.type==='live')).map(c=>({key:c.key,title:c.title,detailObservedAt:c.detailObservedAt,requiresFreshVerification:true})),categoryChanges:s.categoryChanges.length}))},null,2));
}
module.exports={auditCachedProducts};
