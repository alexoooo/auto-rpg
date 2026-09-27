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
 for(const id of ['fighter','rogue']) for(const weapon of ['shield','bow']) for(const pose of ['inspection','ready','raised','crouched']) for(const armour of [false,true]) {
  await page.locator(`[data-character=${id}]`).click(); await page.selectOption('#weapon',weapon);
  if(pose==='raised'||pose==='crouched') await page.locator('summary').click();
  await page.locator(`[data-pose=${pose}]`).click();
  if(pose==='raised'||pose==='crouched') await page.locator('summary').click();
  await page.locator(`[data-armour=${armour}]`).click();await page.locator('#reset').click();
  for(const [view,alpha] of [['front',Math.PI/2+.3],['back',-Math.PI/2+.3],['side',Math.PI+.3]]) {
   await page.evaluate(alpha=>{const l=window.__characterLab;l.camera.alpha=alpha;l.camera.radius=2.9;l.camera.target.y=1.18;l.render();},alpha);
   await page.locator('#stage').screenshot({path:`.review/character-lab/anatomy-${id}-${weapon}-${pose}-${armour?"plate":"cloth"}-${view}.png`});
  }
 }
 assert.deepEqual(errors,[]); console.log('96 whole upper-body views captured');
} finally {await browser.close();}
