'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const assetDir = path.join(root, 'assets', 'sprites', 'damage');
const manifest = JSON.parse(fs.readFileSync(path.join(assetDir, 'manifest.json'), 'utf8'));
const expected = ['trash', 'shrub', 'fence', 'mailbox', 'car', 'shed', 'house', 'hydrant', 'tree', 'bench', 'streetlight', 'dumpster', 'sign', 'storefront', 'cart', 'gasPump', 'canopy', 'bigbox', 'booth', 'table', 'pavilion'];
assert.equal(manifest.version, 1);
assert.deepEqual(manifest.dimensions, [2172, 724]);
assert.equal(Object.keys(manifest.files).length, 21);
assert.deepEqual(Object.keys(manifest.files).sort(), [...expected].sort());
assert.deepEqual(Object.keys(manifest.frames).sort(), [...expected].sort());
for (const type of expected) {
  const file = path.join(assetDir, manifest.files[type]);
  assert.ok(fs.existsSync(file), `${type} missing PNG: ${file}`);
  const b = fs.readFileSync(file);
  assert.equal(b.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${type} not PNG`);
  assert.equal(b.readUInt32BE(16), 2172, `${type} width`);
  assert.equal(b.readUInt32BE(20), 724, `${type} height`);
  assert.equal(b[25], 6, `${type} not RGBA`);
  assert.equal(manifest.frames[type].length, 5, `${type} not five frames`);
  manifest.frames[type].forEach(([x, y, w, h], stage) => {
    const left = Math.round(stage * 2172 / 5);
    const right = Math.round((stage + 1) * 2172 / 5);
    assert.ok(x >= left && x + w <= right && y >= 0 && y + h <= 724 && w > 0 && h > 0,
      `${type} stage ${stage} rectangle out of bounds`);
  });
}
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const inlineScript = html.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(inlineScript, 'game inline script missing');
assert.doesNotThrow(() => new vm.Script(inlineScript[1]), 'game JavaScript syntax error');
const match = html.match(/function damageStage\(hp,max,dead=false\)\{[^}]+\}/);
assert.ok(match, 'missing canonical damageStage helper');
const damageStage = vm.runInNewContext(`${match[0]}; damageStage`);
for(const [hp,max,dead,want] of [
  [100,100,false,0],[76,100,false,0],[75,100,false,1],[51,100,false,1],
  [50,100,false,2],[26,100,false,2],[25,100,false,3],[1,100,false,3],
  [0,100,false,4],[75,100,true,4]
]) assert.equal(damageStage(hp,max,dead), want, `damageStage(${hp}/${max},${dead})`);
assert.match(html,/assets\/sprites\/damage\/manifest\.json/, 'manifest loader missing');
assert.match(html,/function loadDamageSprite\(/, 'lazy damage image loader missing');
assert.match(html,/if\(damageReady\)\{/, 'canonical art early-return missing');
assert.match(html,/drawBurnDamage\(t,soot,hot\)/, 'legacy burn fallback removed');
assert.match(html,/drawDestroyedThing\(t\)/, 'legacy destroyed fallback removed');
console.log('PASS: 21 RGBA sheets, 105 frame rectangles, HP boundary behavior, manifest loader, visual fallbacks');