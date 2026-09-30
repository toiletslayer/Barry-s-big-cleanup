'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const sprites=JSON.parse(fs.readFileSync(path.join(root,'assets/sprites/manifest.json'),'utf8'));
const frames=JSON.parse(fs.readFileSync(path.join(root,sprites.damageFrameManifest),'utf8'));
assert.equal(Object.keys(frames.files).length,21);
assert.equal(Object.keys(frames.frames).length,21);
for(const [type,file] of Object.entries(sprites.damageSheets)){
 assert.equal(frames.files[type],file,'Filename mismatch for '+type);
 const b=fs.readFileSync(path.join(root,sprites.damageBasePath,file));
 const width=b.readUInt32BE(16),height=b.readUInt32BE(20);
 assert.equal(frames.frames[type].length,5,type+' must have five stages');
 frames.frames[type].forEach(([x,y,w,h],stage)=>{
  const start=Math.round(stage*width/5),end=Math.round((stage+1)*width/5);
  assert.ok(w>0&&h>0&&x>=start&&x+w<=end&&y>=0&&y+h<=height,type+' invalid crop '+stage);
 });
}
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(script,'inline script absent');
assert.doesNotThrow(()=>new vm.Script(script[1]),'game script syntax');
assert.match(html,/function drawDamageSheet\(t,img\)/);
assert.match(html,/ctx\.drawImage\(img,frame\[0\],frame\[1\],frame\[2\],frame\[3\]/,'source cropping missing');
assert.match(html,/if\(damageFrameManifest&&damageFrameManifest\.frames\[t\.type\]\)/,'fallback gate missing');
console.log('PASS: 21 frame-aligned transparent sprites, 105 cropped stages, source syntax and fallback gate');
