'use strict';
// Keep old fingerprinted files: a cached HTML document may still reference them.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const root=path.join(__dirname,'../dist'),manifest={};
let html=fs.readFileSync(path.join(root,'index.html'),'utf8');
for(const stem of ['gear-taxonomy','data-model','app','enhancements']){
 const source=stem+'.js',bytes=fs.readFileSync(path.join(root,source)),hash=createHash('sha256').update(bytes).digest('hex').slice(0,12),file=stem+'.'+hash+'.js';
 fs.writeFileSync(path.join(root,file),bytes);manifest[source]=file;
 html=html.replace(new RegExp('src="'+stem+'(?:\\.[a-f0-9]{12})?\\.js"','g'),'src="'+file+'"');
}
fs.writeFileSync(path.join(root,'index.html'),html);
fs.writeFileSync(path.join(root,'ui-assets.json'),JSON.stringify(manifest,null,2)+'\n');
