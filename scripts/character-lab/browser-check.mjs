// npm exec --yes --package=playwright -- node scripts/character-lab/browser-check.mjs [URL]
import assert from 'node:assert/strict';
import {access,mkdir,writeFile}from'node:fs/promises';import{delimiter,resolve}from'node:path';import{pathToFileURL}from'node:url';
let pw;for(const bin of process.env.PATH.split(delimiter)){try{const p=resolve(bin,'../playwright/index.mjs');await access(p);pw=await import(pathToFileURL(p));break}catch{}}
if(!pw)throw Error('Run with npm exec --yes --package=playwright -- node ...');
const browser=await pw.chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1440,height:1050}});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
const output='.review/character-lab/acceptance';await mkdir(output,{recursive:true});
try{
 await page.goto(process.argv[2]??'http://127.0.0.1:5183/character-lab.html');await page.waitForFunction(()=>window.__characterLab?.ready,{timeout:60000});await page.waitForTimeout(1500);
 const result=await page.evaluate(()=>{const l=window.__characterLab;const baseline=[l.scene.meshes.length,l.scene.materials.length,l.scene.skeletons.length];let configurations=0,samples=0;
 for(const id of ['fighter','rogue']){document.querySelector(`[data-character=${id}]`).click();for(const boots of [false,true])for(const armour of [false,true])for(const weapon of ['empty','sword','shield','sword-shield','bow']){
 document.querySelector(`[data-boots=${boots}]`).click();document.querySelector(`[data-armour=${armour}]`).click();const p=document.querySelector('#weapon');p.value=weapon;p.dispatchEvent(new Event('change'));
 const groups=[...new Set(l.assets.get(id).meshes.filter(m=>m.isEnabled()&&m.getTotalVertices()).map(m=>m.name.split('__')[0]))].sort();const expected=['base',boots?'boots':'bare',...(armour?['armour']:[]),...(weapon==='empty'?[]:weapon==='sword-shield'?['sword','shield']:[weapon])].sort();if(JSON.stringify(groups)!==JSON.stringify(expected))throw Error('Incorrect loadout: '+JSON.stringify({id,boots,armour,weapon,groups}));
 for(const t of [0,.8,1.8,3.6,4.4,4.9,5.5,6.4,8.2,10.3,11.9]){l.sample(t);samples++}configurations++;
 }}return {configurations,samples,baseline,after:[l.scene.meshes.length,l.scene.materials.length,l.scene.skeletons.length]};});
 assert.equal(result.configurations,40);assert.deepEqual(result.baseline,result.after);
 await page.locator('[data-character=fighter]').click();await page.selectOption('#weapon','shield');await page.evaluate(()=>window.__characterLab.sample(2));await page.locator('[data-armour=false]').click();assert.equal(await page.evaluate(()=>window.__characterLab.seconds),2);
 await page.locator('[data-character=rogue]').click();assert.equal(await page.evaluate(()=>window.__characterLab.seconds),0);await page.locator('[data-character=fighter]').click();assert.equal(await page.locator('#weapon').inputValue(),'shield');
 await page.locator('#reset').click();const box=await page.locator('#stage').boundingBox();const before=await page.evaluate(()=>window.__characterLab.camera.alpha);await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);await page.mouse.down();await page.mouse.move(box.x+box.width*.7,box.y+box.height*.5,{steps:10});await page.mouse.up();await page.waitForFunction(a=>Math.abs(window.__characterLab.camera.alpha-a)>.1,before);
 const radius=await page.evaluate(()=>window.__characterLab.camera.radius);await page.mouse.wheel(0,-200);await page.waitForFunction(r=>window.__characterLab.camera.radius<r-.05,radius);await page.locator('#reset').click();
 await page.locator('#grip-view').click();assert.ok(await page.evaluate(()=>{const l=window.__characterLab;const n=l.assets.get(l.current).transformNodes.find(n=>n.name==='middle_01_l');n.computeWorldMatrix(true);return l.camera.target.subtract(n.getAbsolutePosition()).length()<.001}));await page.locator('#reset').click();
 for(const id of ['fighter','rogue']){
  await page.locator(`[data-character=${id}]`).click();await page.locator('[data-armour=true]').click();await page.locator('[data-boots=true]').click();
  for(const weapon of ['sword-shield','bow']){await page.selectOption('#weapon',weapon);for(const t of [0,1.5,3.8,4.5,5.2,6.4])for(const [view,a]of[['front',Math.PI/2+.45],['side',Math.PI+.15]]){
   await page.evaluate(({t,a})=>{const l=window.__characterLab;l.sample(t);const n=l.assets.get(l.current).transformNodes.find(n=>n.name==='pelvis');n.computeWorldMatrix(true);const p=n.getAbsolutePosition();l.camera.setTarget(p.clone());l.camera.target.y=1.05;l.camera.alpha=a;l.camera.beta=1.35;l.camera.radius=4.3;l.render()},{t,a});await page.waitForTimeout(60);await page.locator('#stage').screenshot({path:`${output}/${id}-${weapon}-${t}-${view}.png`});
  }}
 }
 // Exercise the running render loop as well as deterministic scrub samples.
 for(const speed of ['1','0.25']){
  await page.selectOption('#speed',speed);await page.evaluate(()=>window.__characterLab.sample(3));await page.locator('#play').click();
  await page.waitForFunction(()=>window.__characterLab.seconds>3.35,null,{timeout:10000});await page.locator('#play').click();
  const stopped=await page.evaluate(()=>window.__characterLab.seconds);await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>window.__characterLab.seconds),stopped);
 }
 await page.locator('#reset').click();await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:`${output}/mobile.png`,fullPage:true});assert.deepEqual(errors,[]);
 await writeFile(`${output}/report.json`,JSON.stringify({...result,errors,orbit:true,zoom:true,mobile:true},null,2));console.log(JSON.stringify(result));
}finally{await browser.close()}
