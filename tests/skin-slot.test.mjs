import test from "node:test";
import assert from "node:assert/strict";
import { skinSlot } from "../src/render/skin-slot.ts";
import { dresserFor } from "../src/render/dress.ts";
import { modelSpec } from "../src/core/human/spec.ts";
import { coreStand } from "./harness/core-stand.mjs";

const clothing = { boots: true, armour: true };

test("skin replacement ignores late loads and disposal cancels pending construction", async () => {
  const stand = await coreStand(modelSpec("workshop-fighter"));
  const baseline = stand.scene.meshes.length, slot = skinSlot(stand.built);
  try {
    let resolve, staleBuilt = false;
    const pending = slot.replace(new Promise(done => { resolve = done; }), { clothing });
    await slot.replace(dresserFor("workshop-fighter", stand.scene, { appearance: "relic" }), { clothing });
    const latest = slot.meshes;
    resolve(() => { staleBuilt = true; throw new Error("stale constructor ran"); });
    await pending;
    assert.equal(staleBuilt, false);
    assert.equal(slot.meshes, latest);
    assert.ok(latest.length > 16);
    let reject;
    const failedStale = slot.replace(new Promise((_, fail) => { reject = fail; }), { clothing });
    await slot.replace(dresserFor("workshop-fighter", stand.scene, { appearance: "relic" }), { clothing });
    reject(new Error("obsolete request failed"));
    await failedStale;
    const retained = slot.meshes;
    await assert.rejects(slot.replace(Promise.reject(new Error("fixture failure")), { clothing }), /fixture failure/);
    assert.equal(slot.meshes, retained);
    const after = slot.replace(new Promise(done => { resolve = done; }), { clothing });
    slot.dispose(); slot.dispose();
    resolve(() => { staleBuilt = true; throw new Error("disposed constructor ran"); });
    await after;
    assert.equal(staleBuilt, false);
    assert.equal(slot.meshes.length, 0);
    assert.equal(stand.scene.meshes.length, baseline);
    await slot.replace(Promise.reject(new Error("request after disposal")), { clothing });
  } finally { slot.dispose(); stand.dispose(); }
});

test("visibility and clothing changed during loading reach the newly built instance", async () => {
  const stand = await coreStand(modelSpec("workshop-fighter"));
  const slot = skinSlot(stand.built);
  try {
    let resolve, supplied;
    const pending = slot.replace(new Promise(done => { resolve = done; }), { clothing });
    const dress = await dresserFor("workshop-fighter", stand.scene, { appearance: "duelist" });
    slot.setEnabled(false);
    slot.wear({ boots: false, armour: false });
    resolve((body, options) => { supplied = options; return dress(body, options); });
    await pending;
    assert.deepEqual(supplied, { clothing: { boots: false, armour: false } });
    assert.ok(slot.meshes.length > 16 && slot.meshes.every(m => !m.isEnabled()));
    slot.setEnabled(true);
    assert.ok(slot.meshes.every(m => m.isEnabled()));
  } finally { slot.dispose(); stand.dispose(); }
});
