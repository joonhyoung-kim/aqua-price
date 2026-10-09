'use strict';
function pruneCache(cache,now=Date.now()){
 const entries=Object.entries(cache||{}).filter(([,v])=>v&&typeof v.text==='string'&&Number.isFinite(Date.parse(v.fetchedAt))&&now-Date.parse(v.fetchedAt)<=86400000&&Date.parse(v.fetchedAt)<=now).sort((a,b)=>Date.parse(b[1].fetchedAt)-Date.parse(a[1].fetchedAt));const kept={};let bytes=0;
 for(const [url,v]of entries){const size=Buffer.byteLength(v.text);if(Object.keys(kept).length>=60||bytes+size>12000000)continue;kept[url]=v;bytes+=size;}return kept;
}
module.exports={pruneCache};
