'use strict';
/*
 * Actual headless Chromium playtest of the static site.
 * This checks runtime image decoding, each HP-rendered frame, a short real
 * keyboard/mouse gameplay sequence, district snapshots, and mobile layouts.
 * Run: npm install --no-save playwright && npx playwright install chromium
 *      node tests/browser-render-qa.cjs
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const out=path.join(root,'qa-artifacts');
fs.mkdirSync(out,{recursive:true});
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.css':'text/css'};
const server=http.createServer((req,res)=>{
  let name;
  try {
    name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(name==='/')name='/index.html';
    const p=path.resolve(root,'.'+name);
    if(p!==root&&!p.startsWith(root+path.sep)){res.writeHead(403);res.end();return}
    fs.readFile(p,(err,data)=>{
      if(err){res.writeHead(404);res.end('missing '+name);return}
      res.writeHead(200,{'Content-Type':mime[path.extname(p)]||'application/octet-stream','Cache-Control':'no-store'});
      res.end(data);
    });
  }catch(err){res.writeHead(400);res.end(String(err))}
});
const report={screenshots:[],errors:[],checks:[],assets:[],districts:[],render:null,play:null,layouts:[]};
const log=(check,value)=>{report.checks.push({check,value});console.log('CHECK '+check+': '+JSON.stringify(value))};
const shot=async(page,name)=>{
  await page.screenshot({path:path.join(out,name),animations:'disabled'});
  report.screenshots.push(name);
};
async function waitLoaded(page){
  await page.waitForFunction(()=>typeof started==='boolean'&&started&&things.length>0&&damageFrameManifest&&Object.keys(damageFrameManifest.frames).length===21,{timeout:30000});
  return await page.evaluate(async()=>{
    // Decode only active block assets before timing real play; 21-at-once is a synthetic stress case.
    const types=[...new Set(things.map(t=>t.type))];
    return await Promise.all(types.map(async type=>{
      const img=getDamageImage(type);
      await img.decode();
      return {type,width:img.naturalWidth,height:img.naturalHeight,url:new URL(img.src).pathname};
    }));
  });
}
async function renderAll(page){
  return await page.evaluate(()=>{
    const types=Object.keys(damageFiles);
    const preview=document.createElement('canvas');
    const colW=260,rowH=156;
    preview.width=colW*5+150;
    preview.height=rowH*types.length+35;
    const pc=preview.getContext('2d');
    pc.fillStyle='#25212c';pc.fillRect(0,0,preview.width,preview.height);
    pc.textBaseline='top';
    pc.fillStyle='#fff5dd';pc.font='bold 13px sans-serif';
    ['FULL','3/4','1/2','1/4','DESTROYED'].forEach((n,i)=>pc.fillText(n,150+i*colW+10,8));
    const old=ctx.drawImage;
    const oldBurn=drawBurnDamage;
    const oldRubble=drawDestroyedThing;
    let currentDraw=null,procedural=0,rubble=0;
    ctx.drawImage=function(...args){
      if(args[0]&&typeof args[0].src==='string'&&args[0].src.indexOf('/assets/sprites/damage/')>=0){
        currentDraw={src:args[0].src,nums:args.slice(1)};
      }
      return old.apply(this,args);
    };
    drawBurnDamage=function(){procedural++};
    drawDestroyedThing=function(){rubble++};
    const results=[];
    try {
      for(let row=0;row<types.length;row++){
        const type=types[row];
        const stages=[];
        pc.fillStyle='#fff5dd';pc.font='bold 15px sans-serif';pc.fillText(type,5,35+row*rowH+48);
        const t=makeThing(type,640,475,1);
        const frameRects=damageFrameManifest.frames[type];
        for(let stage=0;stage<5;stage++){
          t.hp=Math.round(t.max*[1,.69,.44,.19,0][stage]);
          t.dead=stage===4;t.burn=0;t.flash=0;
          ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.clearRect(0,0,W,H);
          currentDraw=null;
          drawThing(t);
          const px=ctx.getImageData(0,0,W,H).data;
          let count=0,minX=W,minY=H,maxX=0,maxY=0,h=2166136261;
          for(let y=0;y<H;y++)for(let x=0;x<W;x++){
            const i=(y*W+x)*4;
            if(px[i+3]>90){
              count++;minX=Math.min(minX,x);minY=Math.min(minY,y);
              maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
              if((x+y)%19===0){h^=px[i]+(px[i+1]<<8)+(px[i+2]<<16);h=Math.imul(h,16777619)>>>0}
            }
          }
          ctx.restore();
          const f=frameRects[stage];
          const ok=!!currentDraw && currentDraw.nums.length===8 &&
            currentDraw.nums.slice(0,4).every((x,i)=>Math.abs(x-f[i])<.02) &&
            currentDraw.src.endsWith('/'+damageFiles[type]);
          const bbox=count?{minX,minY,maxX,maxY,width:maxX-minX+1,height:maxY-minY+1}:null;
          stages.push({stage,drawn:ok,visiblePixels:count,bbox,hash:h});
          // Draw what the actual game renderer painted into a visual audit board.
          const regionW=Math.max(95,t.w*2.6),regionH=Math.max(120,t.h*2.6);
          pc.save();pc.beginPath();pc.rect(150+stage*colW,35+row*rowH,colW,rowH);pc.clip();
          pc.drawImage(c,640-regionW/2,475-regionH*.62,regionW,regionH,150+stage*colW+18,35+row*rowH+6,colW-32,rowH-18);
          pc.restore();
        }
        results.push({type,nominal:{width:t.w,height:t.h},stages});
      }
      // The PNG path must not invoke either old procedural visual overlay.
      const o=makeThing('house',640,475,1);o.hp=Math.round(o.max*.45);o.burn=.4;
      drawThing(o);
      o.dead=true;o.hp=0;drawThing(o);
    } finally {
      ctx.drawImage=old;drawBurnDamage=oldBurn;drawDestroyedThing=oldRubble;
    }
    return {results,procedural,rubble,image:preview.toDataURL('image/png')};
  });
}
function checkRender(data){
  assert.equal(data.results.length,21,'Every object family is represented');
  for(const entry of data.results){
    assert.equal(entry.stages.length,5,entry.type+' stage count');
    for(const s of entry.stages){
      assert.ok(s.drawn,entry.type+' stage '+s.stage+' did not use correct PNG frame');
      assert.ok(s.visiblePixels>22,entry.type+' stage '+s.stage+' invisible');
      assert.ok(s.bbox&&s.bbox.width>3&&s.bbox.height>3,entry.type+' stage '+s.stage+' tiny/empty');
    }
    const hashes=entry.stages.map(x=>x.hash);
    assert.ok(new Set(hashes).size>=4,entry.type+' stage images look identical');
  }
  for(const type of ['canopy','pavilion','bench']){
    const entry=data.results.find(x=>x.type===type);
    const actual=entry.stages[0].bbox.width;
    assert.ok(actual/entry.nominal.width>=.9,type+' full sprite is too narrow for its collision footprint');
  }
  assert.equal(data.procedural,0,'old burn overlay called for new PNGs');
  assert.equal(data.rubble,0,'old rubble renderer called for new PNGs');
}
async function playShort(page){
  const from=await page.evaluate(()=>player.x);
  await page.keyboard.down('d');await page.waitForTimeout(500);await page.keyboard.up('d');
  const to=await page.evaluate(()=>player.x);
  assert.ok(to>from+35,'keyboard walking did not move Barry');
  log('real-keyboard-walk',{from,to});
  let target=await page.evaluate(()=>{
    const t=things.find(x=>x.type==='house'&&!x.dead)||things.find(x=>!x.dead);
    player.x=Math.max(70,t.x-155);player.y=t.y;
    // Near-threshold fixture: real flame must cause the HP stage transition.
    const originalHp=t.hp;t.hp=Math.ceil(t.max*.757);
    return {index:things.indexOf(t),x:t.x,y:t.y,type:t.type,before:t.hp,originalHp,seededNearThreshold:true};
  });
  const rect=await page.locator('#game').boundingBox();
  await page.mouse.move(rect.x+target.x*rect.width/1280,rect.y+target.y*rect.height/720);
  const timeBefore=await page.evaluate(()=>time);
  const wallBefore=Date.now();
  await page.mouse.down();
  await page.waitForTimeout(2800);
  const firingDebug=await page.evaluate(i=>({mouse:{...mouse},player:{...player},hit:flameTouches(things[i]),wantsFire:mouse.down||keys.Space||touchFire,fuelLocked,paused,started,target:{x:things[i].x,y:things[i].y,hp:things[i].hp,max:things[i].max,w:things[i].w,h:things[i].h}}),target.index);
  log('firing-debug',{...firingDebug,simulatedSeconds:await page.evaluate(()=>time)-timeBefore,wallSeconds:(Date.now()-wallBefore)/1000});
  await shot(page,'desktop-during-fire.png');
  await page.mouse.up();
  const after=await page.evaluate(i=>({hp:things[i].hp,max:things[i].max,stage:damageStage(things[i]),fuel:player.fuel}),target.index);
  assert.ok(after.hp<target.before-3,'real firing input did not damage the chosen object');
  assert.ok(after.stage>=1,'firing did not transition to a damaged sprite stage');
  await shot(page,'desktop-real-fire.png');
  const small=await page.evaluate(()=>{
    let t=things.find(x=>x.type==='trash'&&!x.dead)||things.find(x=>x.type==='shrub'&&!x.dead);
    if(!t)return null;
    player.x=Math.max(70,t.x-145);player.y=t.y;
    // Low-HP fixture checks the genuine destroyed transition and score award.
    t.hp=Math.min(t.hp,4);
    return {index:things.indexOf(t),x:t.x,y:t.y,type:t.type,seededLowHp:true};
  });
  if(small){
    await page.mouse.move(rect.x+small.x*rect.width/1280,rect.y+small.y*rect.height/720);
    await page.mouse.down();await page.waitForTimeout(1900);await page.mouse.up();
    const afterSmall=await page.evaluate(i=>({dead:things[i].dead,hp:things[i].hp,score}),small.index);
    assert.ok(afterSmall.dead,'normal gameplay did not destroy a small target');
    assert.ok(afterSmall.score>0,'normal gameplay did not award cleanliness');
    await shot(page,'desktop-destroyed-object.png');
    return {target,burnedTo:after,small,afterSmall};
  }
  return {target,burnedTo:after,small:null};
}
async function layout(page,label){
  const v=await page.evaluate(()=>{
    const c=document.querySelector('#game').getBoundingClientRect();
    const fire=document.querySelector('#firebtn').getBoundingClientRect();
    const pad=document.querySelector('#pad').getBoundingClientRect();
    const dialog=document.querySelector('#dialog').getBoundingClientRect();
    const isTouch=getComputedStyle(document.querySelector('#touch')).display!=='none';
    return {viewport:[innerWidth,innerHeight],canvas:{x:c.x,y:c.y,w:c.width,h:c.height,bottom:c.bottom},dialogTop:dialog.top,fire:{x:fire.x,y:fire.y,right:fire.right,bottom:fire.bottom},pad:{x:pad.x,y:pad.y,right:pad.right,bottom:pad.bottom},touch:isTouch};
  });
  assert.ok(v.canvas.w>150&&v.canvas.h>80,'Canvas too small in '+label);
  if(label.indexOf('mobile')===0){
    assert.ok(v.touch,'Missing mobile controls');
    assert.ok(v.fire.x>=0&&v.fire.right<=v.viewport[0]+3&&v.fire.bottom<=v.viewport[1]+3,'Fire button offscreen');
    assert.ok(v.pad.x>=0&&v.pad.bottom<=v.viewport[1]+3,'Movement pad offscreen');
  }
  if(label==='mobile-portrait')assert.ok(v.dialogTop>v.canvas.bottom+4,'Portrait dialogue covers actual playfield');
  report.layouts.push({label,...v});
  await shot(page,label+'.png');
}
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port+'/';
  let browser;
  try{
    browser=await chromium.launch({headless:true,args:['--no-sandbox']});
    const desktop=await browser.newContext({viewport:{width:1440,height:810},deviceScaleFactor:1});
    const page=await desktop.newPage();
    page.on('pageerror',e=>report.errors.push('desktop pageerror '+e.message));
    page.on('response',r=>{
      if(/\/assets\/sprites\/damage\//.test(r.url()))report.assets.push({url:new URL(r.url()).pathname,status:r.status()});
    });
    await page.goto(base,{waitUntil:'networkidle'});
    await page.locator('#play').click();
    const imgs=await waitLoaded(page);
    assert.ok(imgs.length>=4&&imgs.length<=21,'Unexpected initial asset count');
    assert.ok(imgs.every(x=>x.width===2172&&x.height===724),'Bad sheet dimensions');
    log('load-only-active-block-assets',imgs.length);
    await page.waitForTimeout(120);
    await layout(page,'desktop-start');
    report.play=await playShort(page);
    log('real-play',report.play);
    // Exercise the game's real block-completion modal and upgrade callbacks.
    for(let step=0;step<3;step++){
      await page.evaluate(()=>{for(const t of things){if(!t.dead)cleanThing(t)}});
      await page.locator('#upgrade').waitFor({state:'visible',timeout:12000});
      if(step===0)await shot(page,'real-upgrade-modal.png');
      if(step===2){
        const title=await page.locator('#upgrade h2').innerText();
        assert.ok(title.indexOf('DISTRICT')>=0,'Third block did not show district reward');
      }
      await page.locator('#upgrade .up').first().click();
      await page.waitForFunction(step=>level===step+1,step,{timeout:12000});
    }
    const progressed=await page.evaluate(()=>({level,block:blockNumber(),district:currentDistrict().name}));
    assert.equal(progressed.level,3);
    log('clear-three-blocks-and-upgrade',progressed);
    // Explicitly stress-test the entire catalog only after the real-play timing sample.
    const allLoaded=await page.evaluate(async()=>await Promise.all(Object.keys(damageFiles).map(async type=>{
      const img=getDamageImage(type);await img.decode();return {type,w:img.naturalWidth,h:img.naturalHeight};
    })));
    assert.equal(allLoaded.length,21);
    log('load-all-21-assets-for-stress-test',allLoaded.length);
    const audit=await renderAll(page);
    fs.writeFileSync(path.join(out,'all-21-rendered-stages.png'),Buffer.from(audit.image.split(',')[1],'base64'));
    delete audit.image;
    report.render=audit;
    checkRender(audit);
    log('21x5-rendered',{types:audit.results.length,frames:audit.results.reduce((n,r)=>n+r.stages.length,0),procedural:audit.procedural,rubble:audit.rubble});
    // Cycle through the actual level constructor and background for every district.
    const num=await page.evaluate(()=>districts.length);
    for(let d=0;d<num*3;d++){
      const snapshot=await page.evaluate(d=>{
        level=d;spawnLevel();
        draw();
        return {district:currentDistrict().name,block:currentBlock().name,types:[...new Set(things.map(x=>x.type))],count:things.length};
      },d);
      report.districts.push(snapshot);
      await page.waitForTimeout(170);
      await shot(page,'block-'+String(d+1).padStart(2,'0')+'.png');
    }
    log('all-18-block-snapshots',report.districts);
    await desktop.close();
    for(const [label,viewport] of [
      ['mobile-portrait',{width:390,height:844}],
      ['mobile-landscape',{width:844,height:390}]
    ]){
      const ctxMobile=await browser.newContext({viewport,isMobile:true,hasTouch:true,deviceScaleFactor:2});
      const mobile=await ctxMobile.newPage();
      mobile.on('pageerror',e=>report.errors.push(label+' pageerror '+e.message));
      await mobile.goto(base,{waitUntil:'networkidle'});
      await mobile.locator('#play').click();
      await waitLoaded(mobile);
      await mobile.waitForTimeout(200);
      await layout(mobile,label);
      await ctxMobile.close();
    }
    assert.deepEqual(report.errors,[],'Uncaught browser exceptions');
    assert.ok(report.assets.every(x=>x.status===200),'Sprite asset HTTP failures');
    console.log('PASS: real browser gameplay; 105 rendered frames; all districts; portrait and landscape.');
  } catch(err) {
    report.errors.push(err.stack||String(err));
    console.error('BROWSER QA FAILED:',err.stack||err);
    process.exitCode=1;
  } finally {
    fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
    if(browser)await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
})();