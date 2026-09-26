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
await mkdir('docs/character-lab', { recursive: true });
try {
  await page.goto(process.argv[2] ?? 'http://127.0.0.1:5182/character-lab.html');
  await page.waitForFunction(() => window.__characterLab?.ready, { timeout: 30000 });
  const result = await page.evaluate(() => {
    const lab = window.__characterLab;
    const baseline = [lab.scene.meshes.length, lab.scene.materials.length, lab.scene.skeletons.length];
    let combinations = 0, poses = 0;
    for (const id of ['fighter', 'rogue']) {
      document.querySelector(`[data-character=${id}]`).click();
      for (const boots of [false, true]) for (const armour of [false, true]) for (const weapon of ['empty', 'sword', 'shield', 'sword-shield', 'bow']) {
        document.querySelector(`[data-boots=${boots}]`).click(); document.querySelector(`[data-armour=${armour}]`).click();
        const picker = document.querySelector('#weapon'); picker.value = weapon; picker.dispatchEvent(new Event('change', { bubbles: true }));
        const expected = ['base', boots ? 'boots' : 'bare', ...(armour ? ['armour'] : []), ...(weapon === 'empty' ? [] : weapon === 'sword-shield' ? ['sword', 'shield'] : [weapon])].sort();
        const actual = [...new Set(lab.assets.get(id).meshes.filter(m => m.isEnabled() && m.getTotalVertices()).map(m => m.name.split('__')[0]))].sort();
        if (JSON.stringify(expected) !== JSON.stringify(actual)) throw Error('Incorrect equipment visibility');
        for (const [other, asset] of lab.assets) if (other !== id && asset.meshes.some(m => m.isEnabled() && m.getTotalVertices())) throw Error('Inactive character visible');
        for (const pose of ['inspection', 'ready', 'raised', 'crouched']) {
          document.querySelector(`[data-pose=${pose}]`).click(); lab.render(); poses++;
        }
        combinations++;
      }
    }
    return { combinations, poses, baseline, after: [lab.scene.meshes.length, lab.scene.materials.length, lab.scene.skeletons.length] };
  });
  assert.equal(result.combinations, 40); assert.equal(result.poses, 160); assert.deepEqual(result.baseline, result.after);
  // Retention must preserve different values, not just equal defaults.
  await page.locator('[data-character=fighter]').click(); await page.locator('[data-boots=false]').click(); await page.selectOption('#weapon', 'shield');
  await page.locator('[data-character=rogue]').click(); await page.locator('[data-boots=true]').click(); await page.selectOption('#weapon', 'bow');
  await page.locator('[data-character=fighter]').click();
  assert.equal(await page.locator('#weapon').inputValue(), 'shield');
  assert.equal(await page.locator('[data-boots=false]').getAttribute('aria-pressed'), 'true');
  const stage = await page.locator('#stage').boundingBox();
  const before = await page.evaluate(() => window.__characterLab.camera.alpha);
  await page.mouse.move(stage.x + stage.width * .6, stage.y + stage.height * .45);
  await page.mouse.down(); await page.mouse.move(stage.x + stage.width * .8, stage.y + stage.height * .45, { steps: 12 }); await page.mouse.up();
  await page.waitForFunction(a => Math.abs(window.__characterLab.camera.alpha - a) > .1, before);
  const radius = await page.evaluate(() => window.__characterLab.camera.radius);
  await page.mouse.wheel(0, -200); await page.waitForFunction(r => window.__characterLab.camera.radius < r - .05, radius);
  await page.locator('#reset').click();
  // Wait until camera inertia settles before inspecting reset and saving captures.
  await page.waitForFunction(() => Math.abs(window.__characterLab.camera.radius - 3.9) < .01);
  await page.locator('[data-boots=true]').click(); await page.locator('[data-armour=true]').click(); await page.selectOption('#weapon', 'sword-shield'); await page.locator('[data-pose=ready]').click();
  await page.screenshot({ path: 'docs/character-lab/fighter.jpg', type: 'jpeg', quality: 90, fullPage: true });
  await page.locator('[data-character=rogue]').click(); await page.locator('[data-armour=false]').click(); await page.selectOption('#weapon', 'bow');
  await page.screenshot({ path: 'docs/character-lab/rogue.jpg', type: 'jpeg', quality: 90, fullPage: true });
  // Review the difficult seam/fit poses from both sides with and without plate.
  for (const id of ['fighter', 'rogue']) for (const armour of [false, true]) for (const pose of ['raised', 'crouched']) {
    await page.locator(`[data-character=${id}]`).click(); await page.locator(`[data-armour=${armour}]`).click();
    await page.selectOption('#weapon', 'empty'); await page.evaluate(p => document.querySelector(`[data-pose=${p}]`).click(), pose);
    for (const [view, angle] of [['front', Math.PI / 2 + .3], ['back', -Math.PI / 2 + .3]]) {
      await page.evaluate(a => { window.__characterLab.camera.alpha = a; window.__characterLab.render(); }, angle);
      await page.locator('#stage').screenshot({ path: `${review}/${id}-${armour ? 'plate' : 'cloth'}-${pose}-${view}.png` });
    }
  }
  await page.locator('#reset').click(); await page.locator('[data-pose=inspection]').click();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'mobile horizontal overflow');
  await page.locator('[data-character=rogue]').click(); await page.locator('[data-armour=false]').click(); await page.selectOption('#weapon', 'bow');
  await page.screenshot({ path: 'docs/character-lab/mobile.jpg', type: 'jpeg', quality: 85, fullPage: true });
  assert.deepEqual(errors, [], 'browser console/page errors');
  await writeFile(`${review}/browser-report.json`, JSON.stringify({ ...result, errors, cameraDrag: 'passed', cameraWheel: 'passed', reset: 'passed', independentLoadouts: 'passed', mobile: 'passed', url: page.url() }, null, 2));
  console.log(JSON.stringify({ ...result, errors, interactions: 'passed', mobile: 'passed' }));
} finally { await browser.close(); }
