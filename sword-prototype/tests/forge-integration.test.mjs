import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("setup_exposes_a_real_Forge_workspace_and_no_construct_hand_editor", async () => {
  const [html, setup] = await Promise.all([
    source("../index.html"),
    source("../src/setup.ts"),
  ]);
  assert.match(html, /id="open-forge"[^>]*>Open Construct Forge/);
  assert.match(html, /id="forge-workspace"/);
  assert.match(html, /id="forge-library-select"/);
  assert.match(html, /id="forge-diagnostics-root"/);
  assert.match(setup, /controlSurface === "construct-v1"/);
  assert.match(setup, /data-humanoid-equipment/);
  assert.match(setup, /this\.humanoidEquipment\[side\].*hidden = construct/);
  assert.match(setup, /data-field="blueprint-label"/);
  assert.match(setup, /data-field="construct"/);
  assert.match(setup, /Blueprint .*Control .*Mind/);
});

test("the_browser_host_wires_library_preview_probe_diagnostics_and_Lab_callbacks", async () => {
  const main = await source("../src/main.ts");
  assert.match(main, /localStorage\.getItem\(forgeLibraryKey\)/);
  assert.match(main, /forgeLibraryKey = CONSTRUCT_LIBRARY_STORAGE_KEY/);
  assert.match(main, /parseConstructLibrary\(stored, WARDEN_SENSORS\)/);
  assert.match(main, /localStorage\.setItem\(forgeLibraryKey/);
  assert.match(main, /encodeConstructLibrary\(next, WARDEN_SENSORS\)/);
  assert.match(main, /preview: \(blueprint\) => \{\s*const runtime = compileConstruct/);
  assert.match(main, /probe = new Construct/);
  assert.match(main, /probe\.control\.setDebugCommand\(command\)/);
  assert.match(main, /probe\.observe\(target/);
  assert.match(main, /installedSensorsForBlueprint\(blueprint/);
  assert.match(main, /probe\.control\.snapshot\(\)/);
  assert.match(main, /probe\?\.dispose\(\)/);
  assert.match(main, /forgeScreen\.resetPreview\(\)/);
  assert.doesNotMatch(main, /const facts:[\s\S]{0,500}"core-upright": true/,
    "the Workshop must not regain its synthetic battle-fact fixture");
  assert.match(main, /_advancePhysicsEngineStep\(1000 \/ CONFIG\.world\.physicsHz\)/);
  assert.match(main, /movedMm/);
  assert.match(main, /const emptyDiagnosticFrame[^}]*paused: true/);
  assert.match(main, /onVisibleBout:/);
  assert.match(main, /onBatch: runLabBatch/);
  assert.match(main, /onCompare: compareLabRevision/);
  assert.match(main, /labJobs\(left, right, \[0x5eed_0001, 0x5eed_0002\]\)/);
  assert.match(main, /selection\.leftProgram/);
  assert.match(main, /selection\.rightProgram/);
  assert.match(main, /runBrowserConstructLabBatch\(jobs, WARDEN_SENSORS/);
  assert.match(main, /visibleConstructLab = sides/);
  assert.match(main, /leftSaved \? new Construct/);
  assert.match(main, /libraryId\(candidate\) === side\.constructId/);
  assert.match(main, /saved construct .* is unavailable; return to Setup/);
  assert.match(main, /setup\.chooseConstruct\(forgeEditingSide, libraryId\(saved\)\)/);
  assert.match(main, /initialSelection: guideLabRevisionId/);
  assert.match(main, /observeDiagnostic\(state\.matchup\[side\]\.constructId, side/);
  assert.match(main, /updateArenaConstructDiagnostics\(\)/);
  assert.doesNotMatch(main, /Visible Lab bout requires a dedicated visible-scene host/);
});
