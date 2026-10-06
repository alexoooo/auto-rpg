// npm exec --yes --package=playwright -- node scripts/robot-browser-check.mjs [URL]
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
const base = process.argv[2] ?? "http://127.0.0.1:5188", output = ".review/robots";
await mkdir(output, { recursive: true });
const browser = await playwright.chromium.launch({ channel: "msedge", headless: true });
const errors = [], checks = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  // The game has no favicon; keep the browser's implicit request out of asset diagnostics.
  await page.route("**/favicon.ico", route => route.fulfill({ status: 204 }));
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(`${message.text()} (${message.location().url})`); });
  page.on("response", response => { if (response.status() >= 400) console.error(`${response.status()} ${response.url()}`); });
  const capture = name => page.screenshot({ path: `${output}/${name}.png` });
  await page.goto(`${base}/?play=arena`);
  await page.waitForFunction(() => window.__arena && !document.querySelector("#begin").disabled);
  await page.getByLabel("Left appearance", { exact: true }).selectOption("industrial");
  await page.getByLabel("Right character", { exact: true }).selectOption("workshop-fighter");
  await page.getByLabel("Right appearance", { exact: true }).selectOption("relic");
  await page.waitForTimeout(2000);
  await capture("arena-industrial-relic");
  await page.getByLabel("Left appearance", { exact: true }).selectOption("duelist");
  await page.waitForTimeout(2000);
  await capture("arena-duelist-relic");
  await page.locator("#begin").click();
  await page.waitForFunction(() => window.__arena?.duel);
  await page.evaluate(() => __arena.scene.whenReadyAsync());
  await page.waitForTimeout(500);
  await capture("arena-fight");
  assert.equal(new URL(page.url()).searchParams.get("appearance"), "duelist,relic");
  assert.ok(await page.evaluate(() => ["duelist", "relic"].every(id => __arena.scene.meshes.some(m => m.name.includes(`.${id}.`)))));
  await page.keyboard.press("Space");
  await page.locator("#restart").click();
  await page.waitForFunction(() => window.__arena?.duel);
  assert.equal(new URL(page.url()).searchParams.get("appearance"), "duelist,relic");
  await page.keyboard.press("Space");
  await page.locator("#leave").click();
  assert.equal(await page.getByLabel("Left appearance", { exact: true }).inputValue(), "duelist");
  await page.getByLabel("Right character", { exact: true }).selectOption("workshop-rogue");
  assert.equal(await page.getByLabel("Right appearance", { exact: true }).isVisible(), false);
  await page.getByLabel("Right character", { exact: true }).selectOption("workshop-fighter");
  assert.equal(await page.getByLabel("Right appearance", { exact: true }).inputValue(), "default");
  checks.push("Arena previews, fight, restart, setup and compatible selection");

  await page.setViewportSize({ width: 390, height: 844 });
  await capture("arena-mobile");
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${base}/?play=lab&scenario=stance&appearance=industrial&right=club`);
  await page.waitForFunction(() => window.__lab?.current()?.skin.meshes.length > 0);
  await page.evaluate(() => __lab.scene.whenReadyAsync());
  const frame = await page.evaluate(() => __lab.engine.frameId);
  await page.waitForFunction(previous => __lab.engine.frameId > previous + 2, frame);
  assert.equal(await page.evaluate(() => document.visibilityState), "visible");
  await capture("lab-default-camera");
  await page.evaluate(() => {
    const lab = __lab, loaded = lab.current();
    loaded.run.player.setPaused(true);
    window.robotCheck = { loaded, world: lab.world(), physics: lab.world().physics.save(), recording: loaded.run.recording() };
    const camera = lab.scene.activeCamera;
    camera.alpha = Math.PI / 2 + .4; camera.beta = 1.3; camera.radius = 3.7;
    camera.target.set(0, 1, 0);
  });
  const appearances = page.getByRole("group", { name: "Appearance", exact: true });
  const choose = async (name, id, ready = true) => {
    await appearances.getByRole("button", { name, exact: true }).click();
    await page.waitForFunction(appearance => __lab.current().appearance === appearance && __lab.current().skin.meshes.length > 0 &&
      __lab.current().skin.meshes.every(m => appearance === "default" ? m.name.includes(".skin.") : m.name.includes(`.${appearance}.`)), id);
    if (ready) await page.evaluate(() => __lab.scene.whenReadyAsync());
    await page.waitForTimeout(100);
  };
  for (const [name, id] of [["Steampunk", "relic"], ["Futuristic", "duelist"], ["Industrial", "industrial"]]) {
    await choose(name, id);
    await capture(`lab-${id}`);
    assert.equal(new URL(page.url()).searchParams.get("appearance"), id);
  }
  assert.ok(await page.evaluate(() => {
    const saved = robotCheck, now = __lab.world().physics.save();
    return __lab.current() === saved.loaded && __lab.world() === saved.world && now.length === saved.physics.length &&
      now.every((byte, index) => byte === saved.physics[index]) && JSON.stringify(saved.recording) === JSON.stringify(saved.loaded.run.recording());
  }));
  await page.getByRole("button", { name: "Tactical", exact: true }).click();
  await choose("Steampunk", "relic");
  assert.ok(await page.evaluate(() => __lab.current().skin.meshes.every(m => !m.isEnabled()) && __lab.current().view.meshes.every(m => m.isEnabled())));
  await capture("lab-tactical");
  await page.getByRole("button", { name: "World", exact: true }).click();
  assert.ok(await page.evaluate(() => __lab.current().skin.meshes.every(m => m.isEnabled())));
  checks.push("Lab switching preserves body, physics bytes, paused recording and Tactical visibility");

  let release, requested;
  const requestedPromise = new Promise(done => { requested = done; });
  const releasePromise = new Promise(done => { release = done; });
  await page.route("**/workshop-fighter.glb", async route => { requested(); await releasePromise; await route.continue(); });
  await appearances.getByRole("button", { name: "Original", exact: true }).click();
  await requestedPromise;
  await choose("Futuristic", "duelist", false);
  const response = page.waitForResponse(r => r.url().endsWith("/workshop-fighter.glb"));
  release(); await response;
  await page.evaluate(() => __lab.scene.whenReadyAsync());
  await page.waitForTimeout(100);
  assert.ok(await page.evaluate(() => __lab.current().skin.meshes.every(m => m.name.includes(".duelist."))));
  await page.unroute("**/workshop-fighter.glb");
  await choose("Original", "default");
  assert.ok(await page.getByRole("group", { name: "Wears", exact: true }).isVisible());
  await choose("Industrial", "industrial");
  const resources = () => page.evaluate(() => [__lab.scene.meshes.length, __lab.scene.materials.length,
    __lab.scene.onBeforeRenderObservable.observers.filter(o => !o._willBeUnregistered).length]);
  const baseline = await resources();
  for (let i = 0; i < 3; i++) {
    await choose("Steampunk", "relic"); await choose("Original", "default"); await choose("Industrial", "industrial");
  }
  assert.deepEqual(await resources(), baseline);
  checks.push("Late human asset cannot replace a newer shell; repeated switching retains resource counts");
  await page.evaluate(() => { __lab.current().run.player.setPaused(false); });
  await page.keyboard.down("w"); await page.waitForTimeout(800); await page.keyboard.up("w");
  await capture("lab-walking");
  await page.getByRole("button", { name: "60", exact: true }).click();
  await page.getByRole("button", { name: "Front", exact: true }).click();
  await page.waitForTimeout(900);
  await capture("lab-shoved");
  await page.getByRole("button", { name: "Rogue", exact: true }).click();
  await page.waitForFunction(() => __lab.current().built.spec.model === "workshop-rogue");
  assert.equal(await appearances.isVisible(), false);
  assert.equal(new URL(page.url()).searchParams.has("appearance"), false);
  await page.goto(`${base}/?play=lab&scenario=routine&appearance=relic&right=club`);
  await page.waitForFunction(() => window.__lab?.current()?.skin.meshes.length > 0);
  await page.evaluate(() => __lab.scene.whenReadyAsync());
  await page.waitForTimeout(500);
  await capture("lab-routine");
  checks.push("Movement, shove and Routine render; non-Warrior selection resets appearance");
  await writeFile(`${output}/checks.json`, JSON.stringify({ checks, errors }, null, 2));
  console.log(JSON.stringify({ checks, errors }));
  assert.deepEqual(errors, []);
  await page.goto("about:blank");
} finally { await browser.close(); }
