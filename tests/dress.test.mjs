import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dresserFor } from "../src/render/dress.ts";
import { parseSkeletonArt } from "../src/render/skeleton-skin.ts";
import { modelSpec } from "../src/core/models.ts";
import { coreStand } from "./harness/core-stand.mjs";

const clothing = { boots: true, armour: true };
const bytes = await readFile(new URL("../public/assets/skeleton/skeleton.glb", import.meta.url));
const art = parseSkeletonArt(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));

test("one loaded dresser creates independently owned visual instances", async () => {
  const stand = await coreStand(modelSpec("crypt-skeleton"));
  try {
    const dress = await dresserFor("crypt-skeleton", stand.scene, { skeletonArt: async () => art });
    const a = dress(stand.built, { clothing }), b = dress(stand.built, { clothing });
    assert.ok(a.meshes.length > 20);
    assert.notEqual(a.meshes[0].material, b.meshes[0].material);
    a.setEnabled(false);
    assert.ok(a.meshes.every(m => !m.isEnabled()));
    assert.ok(b.meshes.every(m => m.isEnabled()));
    a.dispose();
    assert.ok(b.meshes.every(m => !m.isDisposed()));
    b.wear({ boots: false, armour: false });
    b.dispose();
  } finally { stand.dispose(); }
});

test("a failed skin provides the complete view contract without changing the body", async () => {
  const stand = await coreStand(modelSpec("crypt-skeleton"));
  try {
    const spec = stand.built.spec;
    const dress = await dresserFor("crypt-skeleton", stand.scene, {
      skeletonArt: async () => { throw new Error("fixture asset unavailable"); },
    });
    const view = dress(stand.built, { clothing });
    assert.equal(view.meshes.length, spec.segments.length);
    view.setEnabled(false);
    view.wear(clothing);
    assert.ok(view.meshes.every(m => !m.isEnabled()));
    view.setEnabled(true);
    assert.ok(view.meshes.every(m => m.isEnabled()));
    view.dispose();
    assert.equal(stand.built.spec, spec);
    assert.ok([...stand.built.segments.values()].every(s => !s.node.isDisposed()));
  } finally { stand.dispose(); }
});
