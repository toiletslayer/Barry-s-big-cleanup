'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {webkit}=require('playwright');

const LIVE='https://toiletslayer.github.io/Barry-s-big-cleanup/?iphone-safari-qa=20260930';
const out=path.resolve('qa-iphone-safari');
fs.mkdirSync(out,{recursive:true});
const report={
  liveUrl:LIVE,engine:'Playwright WebKit',physicalIOS:false,
  errors:[],consoleErrors:[],requests:[],layouts:[],input:{},assets:{},upgrade:{},rotation:{}
};
const shot=async(page,name)=>{await page.screenshot({path:path.join(out,name),animations:'disabled'});};

function iphoneContext(browser,landscape=false){
  const portrait={width:393,height:852};
  const land={width:852,height:393};
  const vp=landscape?land:portrait;
  return browser.newContext({
    viewport:vp,screen:vp,deviceScaleFactor:3,isMobile:true,hasTouch:true,
    locale:'en-US',
    userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1'
  });
}

function attach(page,label){
  page.on('pageerror',e=>report.errors.push(label+' pageerror: '+e.message));
  page.on('console',m=>{if(m.type()==='error')report.consoleErrors.push(label+': '+m.text())});
  page.on('response',r=>{
    const u=r.url();
    if(u.includes('/Barry-s-big-cleanup/')) report.requests.push({label,url:u,status:r.status()});
  });
}

async function start(page){
  await page.goto(LIVE,{waitUntil:'networkidle',timeout:60000});
  await page.locator('#play').tap();
  await page.waitForFunction(()=>typeof started==='boolean'&&started&&things.length>0&&damageFrameManifest&&Object.keys(damageFrameManifest.frames).length===21,{timeout:30000});
}

async function layout(page,label){
  const v=await page.evaluate(()=>{
    const q=s=>document.querySelector(s).getBoundingClientRect();
    const c=q('#game'),pad=q('#pad'),fire=q('#firebtn'),dialog=q('#dialog'),hud=q('.top');
    const cssTouch=getComputedStyle(document.querySelector('#touch')).display;
    return {
      viewport:[innerWidth,innerHeight],scroll:[scrollX,scrollY],
      canvas:{x:c.x,y:c.y,w:c.width,h:c.height,right:c.right,bottom:c.bottom},
      pad:{x:pad.x,y:pad.y,w:pad.width,h:pad.height,right:pad.right,bottom:pad.bottom},
      fire:{x:fire.x,y:fire.y,w:fire.width,h:fire.height,right:fire.right,bottom:fire.bottom},
      dialog:{x:dialog.x,y:dialog.y,w:dialog.width,h:dialog.height,right:dialog.right,bottom:dialog.bottom},
      hud:{x:hud.x,y:hud.y,w:hud.width,h:hud.height,right:hud.right,bottom:hud.bottom},
      touchDisplay:cssTouch,
      dpr:devicePixelRatio,
      visualViewport:visualViewport?{w:visualViewport.width,h:visualViewport.height,scale:visualViewport.scale}:null
    };
  });
  assert.equal(v.scroll[0],0,label+' horizontally scrolled');
  assert.equal(v.scroll[1],0,label+' vertically scrolled');
  assert.equal(v.touchDisplay,'block',label+' touch controls hidden');
  assert.ok(v.canvas.x>=-1&&v.canvas.right<=v.viewport[0]+1,label+' canvas overflows horizontally');
  assert.ok(v.canvas.y>=-1&&v.canvas.bottom<=v.viewport[1]+1,label+' canvas overflows vertically');
  for(const [n,b] of [['pad',v.pad],['fire',v.fire]]){
    assert.ok(b.x>=-1&&b.y>=-1&&b.right<=v.viewport[0]+1&&b.bottom<=v.viewport[1]+1,label+' '+n+' offscreen');
    assert.ok(b.w>=55&&b.h>=55,label+' '+n+' too small to touch');
  }
  if(label.includes('portrait')){
    assert.ok(v.dialog.y>=v.canvas.bottom+4,label+' dialogue overlaps portrait playfield');
  }else{
    assert.ok(v.dialog.bottom<=v.canvas.y+v.canvas.h*.38,label+' dialogue overlaps landscape action area');
  }
  report.layouts.push({label,...v});
  await shot(page,label+'.png');
  return v;
}

async function touchDrag(page,selector,dx,dy,holdMs=650){
  return await page.evaluate(async({selector,dx,dy,holdMs})=>{
    const el=document.querySelector(selector),r=el.getBoundingClientRect();
    const x0=r.left+r.width/2,y0=r.top+r.height/2,x1=x0+dx,y1=y0+dy;
    const mk=(x,y,id=41)=>new Touch({identifier:id,target:el,clientX:x,clientY:y,pageX:x,pageY:y,screenX:x,screenY:y,radiusX:8,radiusY:8,rotationAngle:0,force:.7});
    const emit=(type,touches,changed)=>el.dispatchEvent(new TouchEvent(type,{bubbles:true,cancelable:true,touches,targetTouches:touches,changedTouches:changed}));
    const t0=mk(x0,y0); emit('touchstart',[t0],[t0]);
    const t1=mk(x1,y1); emit('touchmove',[t1],[t1]);
    await new Promise(r=>setTimeout(r,holdMs));
    emit('touchend',[],[t1]);
    return {supported:true};
  },{selector,dx,dy,holdMs});
}

async function holdTouch(page,selector,holdMs=900){
  return await page.evaluate(async({selector,holdMs})=>{
    const el=document.querySelector(selector),r=el.getBoundingClientRect();
    const x=r.left+r.width/2,y=r.top+r.height/2;
    const t=new Touch({identifier:43,target:el,clientX:x,clientY:y,pageX:x,pageY:y,screenX:x,screenY:y,radiusX:8,radiusY:8,force:.8});
    const emit=(type,touches,changed)=>el.dispatchEvent(new TouchEvent(type,{bubbles:true,cancelable:true,touches,targetTouches:touches,changedTouches:changed}));
    emit('touchstart',[t],[t]); await new Promise(r=>setTimeout(r,holdMs)); emit('touchend',[],[t]);
    return true;
  },{selector,holdMs});
}

async function inputChecks(page){
  const before=await page.evaluate(()=>({x:player.x,y:player.y,fuel:player.fuel,touchMove:{...touchMove},touchFire}));
  await touchDrag(page,'#pad',30,0,650);
  await page.waitForTimeout(120);
  const moved=await page.evaluate(()=>({x:player.x,y:player.y,touchMove:{...touchMove}}));
  assert.ok(moved.x>before.x+25,'touch joystick failed to move Barry right');
  assert.equal(moved.touchMove.x,0,'touch joystick stayed latched after touchend');

  const fixture=await page.evaluate(()=>{
    const t=things.find(x=>!x.dead);
    player.x=Math.max(70,t.x-145);player.y=t.y;player.dir=0;
    t.hp=Math.ceil(t.max*.757);
    return {index:things.indexOf(t),type:t.type,before:t.hp,x:t.x,y:t.y};
  });
  const fuelBefore=await page.evaluate(()=>player.fuel);
  await holdTouch(page,'#firebtn',1050);
  await page.waitForTimeout(120);
  const fired=await page.evaluate(i=>({fuel:player.fuel,hp:things[i].hp,stage:damageStage(things[i]),touchFire,locked:fuelLocked}),fixture.index);
  assert.ok(fired.fuel<fuelBefore-2,'touch fire button did not consume fuel');
  assert.ok(fired.hp<fixture.before-4,'touch fire button did not damage target');
  assert.ok(fired.stage>=1,'touch fire did not cross HP sprite stage');
  assert.equal(fired.touchFire,false,'fire button stayed latched after touchend');

  // Multi-touch sanity: movement touch and fire touch can be active together.
  const multi=await page.evaluate(async()=>{
    const pad=document.querySelector('#pad'),fire=document.querySelector('#firebtn');
    const pr=pad.getBoundingClientRect(),fr=fire.getBoundingClientRect();
    const p0=new Touch({identifier:51,target:pad,clientX:pr.left+pr.width*.78,clientY:pr.top+pr.height*.5,pageX:pr.left+pr.width*.78,pageY:pr.top+pr.height*.5});
    const f0=new Touch({identifier:52,target:fire,clientX:fr.left+fr.width*.5,clientY:fr.top+fr.height*.5,pageX:fr.left+fr.width*.5,pageY:fr.top+fr.height*.5});
    pad.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,cancelable:true,touches:[p0],targetTouches:[p0],changedTouches:[p0]}));
    pad.dispatchEvent(new TouchEvent('touchmove',{bubbles:true,cancelable:true,touches:[p0],targetTouches:[p0],changedTouches:[p0]}));
    fire.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,cancelable:true,touches:[f0],targetTouches:[f0],changedTouches:[f0]}));
    const active={moveX:touchMove.x,fire:touchFire};
    await new Promise(r=>setTimeout(r,280));
    fire.dispatchEvent(new TouchEvent('touchend',{bubbles:true,cancelable:true,touches:[],targetTouches:[],changedTouches:[f0]}));
    pad.dispatchEvent(new TouchEvent('touchend',{bubbles:true,cancelable:true,touches:[],targetTouches:[],changedTouches:[p0]}));
    return {active,released:{moveX:touchMove.x,fire:touchFire}};
  });
  assert.ok(multi.active.moveX>.25&&multi.active.fire,'simultaneous move+fire touch state failed');
  assert.equal(multi.released.moveX,0,'multi-touch movement stuck');
  assert.equal(multi.released.fire,false,'multi-touch fire stuck');

  report.input={before,moved,fixture,fired,multi};
  await shot(page,'portrait-after-touch-input.png');
}

async function assetChecks(page){
  const x=await page.evaluate(async()=>{
    const entries=Object.entries(damageFiles);
    const res=[];
    for(const [type,file] of entries){
      const url=new URL('assets/sprites/damage/'+file,location.href).href;
      const r=await fetch(url,{cache:'no-store'});
      const blob=await r.blob();
      const bmp=await createImageBitmap(blob);
      res.push({type,file,status:r.status,w:bmp.width,h:bmp.height,size:blob.size});
      bmp.close();
    }
    return res;
  });
  assert.equal(x.length,21);
  assert.ok(x.every(a=>a.status===200),'one or more live PNGs failed HTTP');
  assert.ok(x.every(a=>a.w===2172&&a.h===724),'one or more live PNG dimensions wrong');
  report.assets={count:x.length,items:x};
}

async function upgradeCheck(page){
  await page.evaluate(()=>{for(const t of things){if(!t.dead)cleanThing(t)}});
  await page.locator('#upgrade').waitFor({state:'visible',timeout:10000});
  const b=await page.locator('.upgrade-box').boundingBox();
  const vp=await page.evaluate(()=>({w:innerWidth,h:innerHeight}));
  assert.ok(b.x>=0&&b.y>=0&&b.x+b.width<=vp.w+1&&b.y+b.height<=vp.h+1,'upgrade modal clipped on portrait iPhone viewport');
  const label=await page.locator('#upgrade .up').first().innerText();
  await page.locator('#upgrade .up').first().tap();
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('#upgrade')).display==='none',{timeout:5000});
  report.upgrade={box:b,viewport:vp,firstChoice:label,tapWorked:true};
}

(async()=>{
  let browser;
  try{
    browser=await webkit.launch({headless:true});
    const ctx=await iphoneContext(browser,false);
    const page=await ctx.newPage();attach(page,'portrait');
    await start(page);
    await layout(page,'live-iphone-portrait');
    await assetChecks(page);
    await inputChecks(page);
    await upgradeCheck(page);

    // Rotate the same running page landscape and back portrait to catch stale CSS/input geometry.
    await page.setViewportSize({width:852,height:393});
    await page.waitForTimeout(350);
    const land=await layout(page,'live-iphone-landscape');
    const landBefore=await page.evaluate(()=>player.x);
    await touchDrag(page,'#pad',26,0,450);
    await page.waitForTimeout(100);
    const landAfter=await page.evaluate(()=>player.x);
    assert.ok(landAfter>landBefore+15,'joystick failed after portrait -> landscape rotation');

    await page.setViewportSize({width:393,height:852});
    await page.waitForTimeout(350);
    const portraitAgain=await layout(page,'live-iphone-portrait-after-rotation');
    report.rotation={landscape:land,portraitAgain,movedAfterRotate:landAfter-landBefore};
    await ctx.close();

    // Fresh landscape launch as Safari users often enter the page already rotated.
    const ctxLand=await iphoneContext(browser,true);
    const landPage=await ctxLand.newPage();attach(landPage,'fresh-landscape');
    await start(landPage);
    await layout(landPage,'live-iphone-fresh-landscape');
    await holdTouch(landPage,'#firebtn',450);
    const freshFire=await landPage.evaluate(()=>({touchFire,fuel:player.fuel}));
    assert.equal(freshFire.touchFire,false,'fresh landscape fire stayed latched');
    report.input.freshLandscapeFire=freshFire;
    await ctxLand.close();

    const bad=report.requests.filter(r=>r.status>=400);
    assert.deepEqual(bad,[],'live site returned failed requests');
    assert.deepEqual(report.errors,[],'uncaught WebKit page errors');
    assert.deepEqual(report.consoleErrors,[],'console errors in WebKit');
    console.log('PASS: live GitHub Pages build in iPhone-sized WebKit portrait/landscape, touch movement/fire, multitouch, rotation, assets and upgrade modal.');
  }catch(err){
    report.errors.push(err.stack||String(err));
    console.error('IPHONE SAFARI QA FAILED:',err.stack||err);
    process.exitCode=1;
  }finally{
    fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
    if(browser)await browser.close();
  }
})();