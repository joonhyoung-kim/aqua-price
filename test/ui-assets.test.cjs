const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
test('HTML uses ordered content-addressed scripts that exactly match reviewed source',()=>{
 const root=path.join(__dirname,'../dist'),manifest=require('../dist/ui-assets.json'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');let prior=-1;
 for(const source of ['gear-taxonomy.js','data-model.js','app.js','enhancements.js']){
  const bytes=fs.readFileSync(path.join(root,source)),file=manifest[source],hash=createHash('sha256').update(bytes).digest('hex').slice(0,12);
  assert.equal(file,source.replace('.js','.'+hash+'.js'));assert(fs.readFileSync(path.join(root,file)).equals(bytes));
  const index=html.indexOf('src="'+file+'"');assert(index>prior,source);prior=index;assert(!html.includes('src="'+source+'"'));
 }
});
