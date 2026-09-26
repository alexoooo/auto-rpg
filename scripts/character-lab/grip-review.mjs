// npm exec --yes --package=playwright -- node scripts/character-lab/browser-check.mjs [URL]
// Playwright is a disposable verification tool, not a game dependency.
import assert from 'node:assert/strict';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { delimiter, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

let playwright;
for (const bin of process.env.PATH.split(delimiter)) {
  const candidate = resolve(bin, '../playwright/index.mjs');
  try { await access(candidate); playwright = await import(pathToFileURL(candidate)); break; } catch { /* next npm bin */ }
}
if (!playwright) throw Error('Run through npm exec --yes --package=playwright -- node ...');
const browser = await playwright.chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const errors = []; page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
const review = resolve('.review/character-lab'); await mkdir(review, { recursive: true });
try {
 await page.goto(process.argv[2] ?? 'http://127.0.0.1:5182/character-lab.html');
 await page.waitForFunction(()=>window.__characterLab?.ready);
 for(const id of ['fighter','rogue']) for(const weapon of ['sword','shield','bow']) {
 await page.locator(`[data-character=${id}]`).click(); await page.selectOption('#weapon',weapon);
 await page.locator('[data-pose=ready]').click();
 await page.locator('#grip-view').click();
 assert.ok(await page.evaluate(()=>window.__characterLab.camera.radius < .8));
 for(let angle=0;angle<4;angle++) {
 await page.evaluate(({weapon,angle})=>{
 const l=window.__characterLab,m=l.assets.get(l.current).meshes.find(m=>m.name===`${weapon}__grip`);
 m.refreshBoundingInfo({applySkeleton:true}); m.computeWorldMatrix(true);
 l.camera.lowerRadiusLimit=.15; l.camera.setTarget(m.getBoundingInfo().boundingBox.centerWorld); l.camera.radius=weapon==='bow'?.65:.45;
 l.camera.alpha=angle*Math.PI/2+.3;l.camera.beta=1.1;l.render();
 },{weapon,angle});
 await page.screenshot({path:`.review/character-lab/${id}-${weapon}-${angle}.png`});
 }
 }
 assert.deepEqual(errors, []); console.log('24 grip views captured; close-up control and browser errors checked.');
} finally {await browser.close();}
