import {access,mkdir} from 'node:fs/promises';
import {delimiter,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
let pw;for(const bin of process.env.PATH.split(delimiter)){try{const file=resolve(bin,'../playwright/index.mjs');await access(file);pw=await import(pathToFileURL(file));break}catch{}}
const browser=await pw.chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1400,height:1000}});
const out='.review/character-lab/repair';await mkdir(out,{recursive:true});
try{
 await page.goto(process.argv[2]??'http://127.0.0.1:5183/character-lab.html');await page.waitForFunction(()=>window.__characterLab?.ready);await page.waitForTimeout(1200);
 for(const id of [process.argv[3]??'fighter']){
  await page.locator(`[data-character=${id}]`).click();await page.locator(`[data-armour=${process.argv[4]==='armour'}]`).click();
  for(const weapon of ['sword','shield','bow']){
   await page.selectOption('#weapon',weapon);await page.evaluate(()=>window.__characterLab.sample(0));await page.locator('#grip-view').click();
   for(const [view,alpha,beta]of[['palm',.3,.5],['outside',3.8,.65],['front',1.7,1.3]]){
    await page.evaluate(({alpha,beta})=>{const l=window.__characterLab;l.camera.alpha=alpha;l.camera.beta=beta;l.camera.radius=.85;l.render()},{alpha,beta});await page.waitForTimeout(80);await page.locator('#stage').screenshot({path:`${out}/${id}-${weapon}-${view}.png`});
   }
  }
  for(const weapon of ['sword-shield','bow']){
   await page.selectOption('#weapon',weapon);await page.locator('#reset').click();
   for(const t of [0,.8,1.5,3.48,3.8,4.2,4.3,4.65,5.3,5.5,6.4])for(const [view,alpha,beta]of[['front',1.75,1.25],['side',3.3,1.25],['back',5.0,1.25],['top',1.75,.38]]){
    await page.evaluate(({t,alpha,beta})=>{const l=window.__characterLab;l.sample(t);const node=l.assets.get(l.current).transformNodes.find(n=>n.name==='pelvis');node.computeWorldMatrix(true);const p=node.getAbsolutePosition().clone();p.y=1.3;l.camera.setTarget(p);l.camera.alpha=alpha;l.camera.beta=beta;l.camera.radius=3.3;l.render()},{t,alpha,beta});await page.waitForTimeout(50);await page.locator('#stage').screenshot({path:`${out}/${id}-${weapon}-${t}-${view}${process.argv[4]==='armour'?'-armour':''}.png`});
   }
  }
 }
}finally{await browser.close()}
