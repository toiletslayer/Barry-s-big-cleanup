const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const m=JSON.parse(fs.readFileSync(path.join(root,'assets/sprites/manifest.json'),'utf8'));
assert.equal(Object.keys(m.damageSheets).length,21);
assert.equal(m.damageStageOrder.join(','),'full,three_quarter,half,quarter,destroyed');
for(const [type,file] of Object.entries(m.damageSheets)){
  assert.ok(m.objects[type],'Missing SVG fallback: '+type);
  const data=fs.readFileSync(path.join(root,m.damageBasePath,file));
  assert.equal(data.subarray(0,8).toString('hex'),'89504e470d0a1a0a',file+' signature');
  assert.equal(data.readUInt32BE(16),2172,file+' width');
  assert.equal(data.readUInt32BE(20),724,file+' height');
  assert.equal(data[25],6,file+' RGBA color mode');
}
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const jsStart=html.indexOf('<script>'),jsEnd=html.indexOf('</script>',jsStart);
assert.ok(jsStart>=0&&jsEnd>jsStart,'Game inline script missing');
new vm.Script(html.slice(jsStart+8,jsEnd));
const fnStart=html.indexOf('function damageStage(t){'),fnEnd=html.indexOf('}',fnStart);
assert.ok(fnStart>=0&&fnEnd>fnStart,'Damage stage mapping missing');
const stage=vm.runInNewContext(html.slice(fnStart,fnEnd+1)+'; damageStage');
for(const [hp,expected] of [[100,0],[75.1,0],[75,1],[50.1,1],[50,2],[25.1,2],[25,3],[.1,3],[0,4]])
  assert.equal(stage({hp,max:100,dead:false}),expected,'HP '+hp);
assert.equal(stage({hp:100,max:100,dead:true}),4);
assert.ok(html.includes('if(ds&&ds.complete&&ds.naturalWidth)'),'PNG renderer not active');
assert.ok(html.includes('drawDestroyedThing(t)'),'Legacy destroyed fallback missing');
console.log('PASS: 21 RGBA sheets, source syntax, HP boundaries, and legacy fallbacks');
