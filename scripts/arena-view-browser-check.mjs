// npm exec --yes --package=playwright -- node scripts/arena-view-browser-check.mjs [URL]
import assert from "node:assert/strict";
import { access, mkdir, writeFile } from "node:fs/promises";
import { delimiter, resolve } from "node:path";
import { pathToFileURL } from "node:url";

let playwright;
for (const bin of process.env.PATH.split(delimiter)) {
  try {
    const file = resolve(bin, "../playwright/index.mjs");
    await access(file); playwright = await import(pathToFileURL(file)); break;
  } catch { /* npm exec places its package's bin directory on PATH. */ }
}
if (!playwright) throw new Error("Run with npm exec --yes --package=playwright -- node ...");
const base = process.argv[2] ?? "http://127.0.0.1:5188", output = ".review/arena-view";
await mkdir(output, { recursive: true });
const browser = await playwright.chromium.launch({ channel: "msedge", headless: true });
const errors = [], checks = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.route("**/favicon.ico", route => route.fulfill({ status: 204 }));
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(`${message.text()} (${message.location().url})`); });
  const url = `${base}/?play=arena&matchup=workshop-fighter,workshop-fighter&appearance=relic,duelist&you=right&gap=4&control=scrapper,classic&recovery=15`;
  await page.goto(url);
  await page.waitForFunction(() => window.__arena?.duel);
  await page.keyboard.press("Space");
  await page.evaluate(() => __arena.scene.whenReadyAsync());
  await page.screenshot({ path: `${output}/world.png` });
  assert.equal(await page.evaluate(() => document.visibilityState), "visible");
  const startFrame = await page.evaluate(() => __arena.engine.frameId);
  await page.waitForFunction(start => __arena.engine.frameId > start + 2, startFrame);
  const panel = page.locator("#arena-view");
  assert.ok(await panel.isVisible());
  const pick = async (group, name) => {
    await panel.getByRole("group", { name: group, exact: true }).getByRole("button", { name, exact: true }).click();
    await page.waitForTimeout(150);
  };
  await page.evaluate(() => {
    window.viewBaseline = { duel: __arena.duel, world: __arena.world, snapshot: JSON.stringify(__arena.duel.save()),
      resources: [__arena.scene.meshes.length, __arena.scene.materials.length,
        __arena.scene.onBeforeRenderObservable.observers.filter(o => !o._willBeUnregistered).length] };
  });
  await pick("View", "Tactical");
  await page.evaluate(() => __arena.scene.whenReadyAsync());
  assert.ok(await page.evaluate(() => {
    const names = [...__arena.duel.duelists.left.built.segments.values(), ...__arena.duel.duelists.right.built.segments.values()].map(s => s.node);
    const meshes = __arena.scene.meshes.filter(m => names.includes(m.parent));
    return meshes.filter(m => /\.(relic|duelist)\./.test(m.name)).every(m => !m.isEnabled()) &&
      meshes.filter(m => m.name.endsWith(".view")).length === 32 && meshes.filter(m => m.name.endsWith(".view")).every(m => m.isEnabled());
  }));
  await page.screenshot({ path: `${output}/tactical.png` });
  await pick("Camera", "Isometric");
  assert.ok(await panel.getByRole("group", { name: "Projection", exact: true }).isVisible());
  await page.waitForTimeout(1000);
  assert.equal(await page.evaluate(() => __arena.scene.activeCamera.mode), 1);
  await pick("Focus", "Left");
  await page.screenshot({ path: `${output}/isometric.png` });
  const extents = await page.evaluate(() => { const c = __arena.scene.activeCamera; return [c.orthoRight, c.orthoTop]; });
  await page.setViewportSize({ width: 800, height: 1000 });
  await page.waitForTimeout(100);
  const narrow = await page.evaluate(() => { const c = __arena.scene.activeCamera; return [c.orthoRight, c.orthoTop]; });
  assert.ok(Math.abs(narrow[0] / narrow[1] - .8) < .001 && narrow[0] < extents[0]);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await pick("Projection", "Perspective");
  assert.equal(await page.evaluate(() => __arena.scene.activeCamera.mode), 0);
  await pick("Focus", "Both");
  await pick("Camera", "Chase");
  assert.equal(new URL(page.url()).searchParams.get("focus"), "right");
  assert.equal(await panel.getByRole("button", { name: "Both", exact: true }).count(), 0);
  assert.equal(await panel.getByRole("group", { name: "Projection", exact: true }).isVisible(), false);
  await pick("View", "World");
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${output}/chase.png` });
  for (let i = 0; i < 4; i++) { await pick("View", "Tactical"); await pick("View", "World"); }
  assert.ok(await page.evaluate(() => viewBaseline.duel === __arena.duel && viewBaseline.world === __arena.world &&
    viewBaseline.snapshot === JSON.stringify(__arena.duel.save())));
  assert.deepEqual(await page.evaluate(() => [__arena.scene.meshes.length, __arena.scene.materials.length,
    __arena.scene.onBeforeRenderObservable.observers.filter(o => !o._willBeUnregistered).length]), await page.evaluate(() => viewBaseline.resources));
  checks.push("World/Tactical, all cameras, focus and projection preserve paused simulation and resource counts");
  const selected = new URL(page.url()).search;
  await page.locator("#restart").click();
  await page.waitForFunction(() => __arena.duel !== viewBaseline.duel);
  assert.equal(new URL(page.url()).search, selected);
  await page.keyboard.press("Space");
  await page.locator("#leave").click();
  assert.equal(await panel.isVisible(), false);
  await page.locator("#begin").click();
  await page.waitForFunction(() => window.__arena?.duel);
  await page.keyboard.press("Space");
  assert.equal(new URL(page.url()).search, selected);
  checks.push("Replay and setup preserve view settings and appearance URLs");
  await pick("Camera", "Isometric");
  await page.waitForTimeout(1200);
  await page.keyboard.press("Space");
  await page.keyboard.down("w");
  await page.waitForTimeout(60);
  const movement = await page.evaluate(() => {
    const move = __arena.duel.tape.filter(entry => entry.side === "right" && entry.orders.move).at(-1)?.orders.move;
    const c = __arena.scene.activeCamera, target = c.getTarget(), x = target.x - c.position.x, z = target.z - c.position.z;
    const size = Math.hypot(x, z); return { move, x: x / size, z: z / size };
  });
  await page.keyboard.up("w");
  assert.ok(movement.move && Math.abs(movement.move.x - movement.x) < .02 && Math.abs(movement.move.z - movement.z) < .02);
  const bounds = await panel.getByRole("button", { name: "World", exact: true }).boundingBox();
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  assert.ok(await page.evaluate(() => __arena.duel.tape.filter(entry => entry.side === "right").at(-1)?.orders.attack === null));
  checks.push("Camera-relative walking follows Isometric; panel clicks do not attack");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(url.replace("gap=4", "gap=4&cap=1"));
  await page.waitForFunction(() => window.__arena?.duel?.verdict);
  assert.equal(await panel.evaluate(e => e.open), false);
  await panel.locator("summary").click();
  await pick("Camera", "Chase");
  await page.screenshot({ path: `${output}/mobile-verdict.png` });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.ok(await page.evaluate(() => [...document.querySelectorAll("#hud .hud-col, #bout-end, #arena-view")].every(element => {
    const r = element.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth;
  })));
  checks.push("View controls remain available at verdict and fit a narrow screen");
  await page.goto(`${base}/?play=lab&scenario=stance&appearance=duelist`);
  await page.waitForFunction(() => window.__lab?.current()?.skin.meshes.length > 0);
  await page.evaluate(() => __lab.scene.whenReadyAsync());
  await page.getByRole("button", { name: "Isometric", exact: true }).click();
  await page.getByRole("button", { name: "Perspective", exact: true }).click();
  await page.getByRole("button", { name: "Chase", exact: true }).click();
  await page.getByRole("button", { name: "Free", exact: true }).click();
  await page.screenshot({ path: `${output}/lab-controls.png` });
  checks.push("Lab retains all shared controls");
  await writeFile(`${output}/checks.json`, JSON.stringify({ checks, errors }, null, 2));
  console.log(JSON.stringify({ checks, errors }));
  assert.deepEqual(errors, []);
  await page.goto("about:blank");
} finally { await browser.close(); }
