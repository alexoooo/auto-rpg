import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import { createHeadlessArena } from "./harness/golem-headless-arena.mjs";
import { Golem } from "../src/golem/golem.ts";
import { SKELETON_BUILDS, skeletonSetup } from "../src/golem/skeleton/presets.ts";
import { forgetSkeletonAssets, loadSkeletonAssets, skeletonArtKey } from "../src/golem/skeleton/appearance.ts";
import { stepProofGolem } from "../src/art-proof/motion.ts";
import { blankIntent } from "../src/policies.ts";
import { dressGolemPart, installGolemAppearance } from "../src/golem/appearance.ts";
import { GOLEM_MATERIAL_PROFILES } from "../src/golem/materials.ts";
import { GOLEM_MODULES } from "../src/golem/registry.ts";
import { buildGolemStand, golemLayers } from "../src/golem/stand.ts";
import { flatSupportedWorldRegistry } from "../src/supported-locomotion-production.ts";

// The modelled skeleton (`public/assets/skeleton/skeleton.glb`, compiled by
// `scripts/skeleton/build-assets.py`). Every figure here is from this Node harness,
// `createHeadlessArena` under NullEngine.

const glb = await readFile(new URL("../public/assets/skeleton/skeleton.glb", import.meta.url));
const glbDoc = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + glb.readUInt32LE(12))));

async function loadArt(bytes = glb) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(bytes);
  try { await loadSkeletonAssets(); } finally { globalThis.fetch = originalFetch; }
}

/** Every skeleton a person can pick, plus the fist and the whip, which no named build carries. */
const FIXTURES = [...SKELETON_BUILDS.map(build => [build.name, build.setup]), ["fists", skeletonSetup("fist", "fist")], ["fist-whip", skeletonSetup("fist", "whip")]];
const WEAPON = /\.(blade|plate|mace|maul|whip\.\d+|weight)$/;

const build = (scene, setup, facing = 0) => new Golem(scene, { side: "left", origin: Vector3.Zero(), facing,
  setup, mind: { name: "skeleton-art", decide: blankIntent }, controlPolicies: [] });
const artOn = (golem, host) => golem.costume.filter(mesh => mesh.parent === host && mesh.metadata?.skeletonArt);
const segment = id => id.split(".").pop();

/** A piece's bounding box in its host's frame -- which is the frame its vertices are written in. */
function localBox(mesh) {
  const box = mesh.getBoundingInfo().boundingBox;
  return { centre: box.center.clone(), extent: box.extendSize.scale(2) };
}
function worldCentre(mesh) {
  mesh.parent.computeWorldMatrix(true);
  return Vector3.TransformCoordinates(mesh.getBoundingInfo().boundingBox.center, mesh.computeWorldMatrix(true));
}

test("every skeleton body part has a modelled piece, and every weapon part keeps its own art", async () => {
  await loadArt();
  const arena = await createHeadlessArena({ populateDefaultGeometry: false });
  const used = new Set();
  try {
    for (const [name, setup] of FIXTURES) {
      const golem = build(arena.scene, setup);
      for (const part of golem.visualParts()) {
        const art = artOn(golem, part.host);
        const eyes = part.shells.filter(shell => /\.eye[LR]$/.test(shell.name));
        if (WEAPON.test(part.id)) {
          assert.equal(art.length, 0, `${name}: ${part.id} is a weapon and takes no bone`);
          assert.ok(part.shells.some(shell => shell.isVisible), `${name}: ${part.id} keeps its weapon art`);
        } else if (segment(part.id) === "rollRing") {
          assert.equal(art.length, 0, `${name}: ${part.id} is declared empty`);
          assert.ok(part.shells.every(shell => !shell.isVisible), `${name}: ${part.id} draws nothing`);
        } else {
          assert.equal(art.length, 1, `${name}: ${part.id} has one modelled piece`);
          assert.equal(art[0].metadata.skeletonArt, skeletonArtKey(part));
          used.add(art[0].metadata.skeletonArt);
          assert.ok(part.shells.every(shell => shell.isVisible === eyes.includes(shell)),
            `${name}: ${part.id} hides its primitives and shows only its eyes`);
        }
      }
      golem.dispose();
    }
  } finally { arena.dispose(); }
  // Both directions: a piece nothing asks for is a key the dresser spells differently.
  assert.deepEqual([...used].sort(), glbDoc.meshes.map(mesh => mesh.name).sort());
});

test("the part key strips any owner prefix, maps the trailing arm onto the left and splits a fist's hand", () => {
  const arm = "effector.skeletal.blade", fist = "effector.skeletal.fist";
  assert.equal(skeletonArtKey({ moduleId: "locomotion.skeleton", id: "hero.golem.legs.thighL" }), "legs.thighL");
  assert.equal(skeletonArtKey({ moduleId: arm, id: "golem.bench.primary.upperArm" }), "primary.upperArm");
  assert.equal(skeletonArtKey({ moduleId: "effector.skeletal.maul", id: "right.golem.primary.trailing.wrist" }), "secondary.wrist");
  assert.equal(skeletonArtKey({ moduleId: fist, id: "left.golem.secondary.wrist" }), "secondary.wrist.bare");
  assert.equal(skeletonArtKey({ moduleId: arm, id: "left.golem.secondary.wrist" }), "secondary.wrist");
  assert.equal(skeletonArtKey({ moduleId: "effector.reach.blade", id: "left.golem.primary.upperArm" }), null);
  // The bench names a module by its slot, and a maul it has swapped into secondary trails on the right.
  assert.equal(skeletonArtKey({ moduleId: "locomotion.skeleton", id: "golem.bench.locomotion.thighL" }), "legs.thighL");
  assert.equal(skeletonArtKey({ moduleId: "torso.ribcage", id: "golem.bench.torso.core" }), "trunk.core");
  assert.equal(skeletonArtKey({ moduleId: "effector.skeletal.maul", id: "golem.bench.primary.trailing.collar" }), "secondary.collar");
  assert.equal(skeletonArtKey({ moduleId: "effector.skeletal.maul", id: "golem.bench.secondary.trailing.collar" }), "primary.collar");
});

/** The bench builds one module on a stand and dresses it directly, naming it by its slot. */
function benchModule(scene, id, slot, socketOf = stand => stand.socket(slot)) {
  const option = GOLEM_MODULES.find(option => option.id === id);
  const stand = buildGolemStand(scene, { side: "left", ground: Vector3.Zero(), facing: Quaternion.Identity(), slot,
    socketHeight: option.standHeightM ?? undefined });
  const other = slot === "primary" ? "secondary" : "primary";
  const module = option.build({ scene, side: "left", name: `golem.bench.${slot}`, socket: socketOf(stand),
    companion: stand.socket(other), layers: golemLayers("left"), materials: stand.materials, world: flatSupportedWorldRegistry() });
  const dressed = module.parts.map(part => ({ part, shown: dressGolemPart({ slot, moduleId: id, id: part.id,
    host: part.part.mesh, shells: part.shell }, stand.materials) }));
  return { stand, module, dressed, dispose() { module.dispose(); stand.dispose(); } };
}

test("the bench dresses every skeleton module it can stand, on either side", async () => {
  await loadArt();
  const arena = await createHeadlessArena();
  try {
    const cases = [["locomotion.skeleton", "locomotion"], ["torso.ribcage", "torso"],
      ["effector.skeletal.fist", "primary"], ["effector.skeletal.blade", "secondary"],
      ["effector.skeletal.maul", "primary"], ["effector.skeletal.maul", "secondary"]];
    for (const [id, slot] of cases) {
      const bench = benchModule(arena.scene, id, slot);
      for (const { part, shown } of bench.dressed) {
        if (WEAPON.test(part.id) || segment(part.id) === "rollRing") continue;
        assert.equal(shown.filter(mesh => mesh.metadata?.skeletonArt).length, 1, `${id} in ${slot}: ${part.id} is dressed`);
      }
      // Each collar reaches toward its own sternum, which a piece from the wrong side would not.
      for (const { part, shown } of bench.dressed.filter(({ part }) => segment(part.id) === "collar")) {
        const piece = shown.find(mesh => mesh.metadata?.skeletonArt);
        assert.ok(Math.abs(worldCentre(piece).x) < Math.abs(part.part.mesh.position.x),
          `${id} in ${slot}: ${part.id} (${piece.metadata.skeletonArt}) reaches medially`);
      }
      bench.dispose();
    }
  } finally { arena.dispose(); }
});

test("the modelled bone has its own material, so a primitive bone beside it keeps its colour", async () => {
  await loadArt();
  const arena = await createHeadlessArena();
  try {
    const golem = build(arena.scene, skeletonSetup("fist", "fist"));
    const art = golem.costume.filter(mesh => mesh.metadata?.skeletonArt);
    const primitives = golem.visualParts().flatMap(part => part.shells)
      .filter(shell => shell.material?.metadata?.golemSurfaceFamily === "bone");
    assert.ok(primitives.length > 20);
    const ivory = GOLEM_MATERIAL_PROFILES["carved-bone"].albedoByFaction.left;
    for (const shell of primitives) {
      assert.ok(!art.some(mesh => mesh.material === shell.material), `${shell.name} does not share the modelled material`);
      assert.ok(shell.material.albedoColor.asArray().every((v, i) => Math.abs(v - ivory[i]) < 1e-6), `${shell.name} keeps carved-bone ivory`);
    }
    for (const mesh of art) assert.ok(mesh.material.albedoColor.asArray().every(v => v >= .9), `${mesh.name} is tinted near white`);
    golem.dispose();
  } finally { arena.dispose(); }
});

test("modelled bones carry no authority and hang on their collider at the identity", async () => {
  await loadArt();
  const arena = await createHeadlessArena({ populateDefaultGeometry: false });
  try {
    for (const [name, setup] of FIXTURES) {
      const golem = build(arena.scene, setup, .7);
      const art = golem.costume.filter(mesh => mesh.metadata?.skeletonArt);
      assert.ok(art.length >= 19, `${name}: ${art.length} pieces`);
      for (const mesh of art) {
        assert.equal(mesh.physicsBody ?? null, null, `${mesh.name} has no body`);
        assert.ok(golem.visualParts().some(part => part.host === mesh.parent), `${mesh.name} rides a part`);
        assert.deepEqual(mesh.position.asArray(), [0, 0, 0]);
        assert.deepEqual(mesh.rotationQuaternion.asArray(), [0, 0, 0, 1]);
        assert.deepEqual(mesh.scaling.asArray(), [1, 1, 1]);
        assert.equal(mesh.material.metadata?.golemSurfaceFamily, "bone");
        assert.ok(mesh.isEnabled() && mesh.isVisible);
      }
      for (const eye of golem.costume.filter(mesh => /\.eye[LR]$/.test(mesh.name)))
        assert.ok(eye.isVisible && eye.material.name.endsWith(".rune"), `${eye.name} stays a rune`);
      golem.dispose();
    }
  } finally { arena.dispose(); }
});

test("the rune eyes sit in the modelled orbits and still pass through the installed appearance", async () => {
  await loadArt();
  const arena = await createHeadlessArena({ populateDefaultGeometry: false });
  try {
    const handed = [];
    installGolemAppearance(arena.scene, (part, palette) => { handed.push(...part.shells); return part.shells; });
    const golem = build(arena.scene, skeletonSetup());
    const eyes = golem.costume.filter(mesh => /\.eye[LR]$/.test(mesh.name));
    assert.equal(eyes.length, 2);
    // Forge style's `configure(palette)` lights the eyes from inside the installed appearance.
    assert.deepEqual(handed.filter(mesh => eyes.includes(mesh)).length, 2, "each eye is handed on");
    assert.ok(!handed.some(mesh => mesh.metadata?.skeletonArt), "a bone is not handed on");
    const sockets = glbDoc.meshes.find(mesh => mesh.name === "head.head").extras.eyes;
    for (const eye of eyes) {
      const socket = sockets[eye.name.endsWith("L") ? 0 : 1];
      assert.ok(eye.position.subtract(Vector3.FromArray(socket)).length() < 1e-6, `${eye.name} is in its orbit`);
    }
    // The left eye is the body's left, -X, the same side as `legs.thighL`.
    assert.ok(sockets[0][0] < 0 && sockets[1][0] > 0);
    golem.dispose();
  } finally { arena.dispose(); }
});

test("modelled bones leave the body identical, and without the asset the primitives stay", async () => {
  const runs = [];
  for (const art of [false, true]) {
    if (art) await loadArt(); else forgetSkeletonAssets();
    const arena = await createHeadlessArena();
    try {
      const samples = [];
      for (const [index, [name, setup]] of FIXTURES.entries()) {
        const golem = build(arena.scene, setup, .3);
        const pieces = golem.costume.filter(mesh => mesh.metadata?.skeletonArt).length;
        if (art) assert.ok(pieces > 0, `${name} is dressed`);
        else {
          assert.equal(pieces, 0, `${name} without the asset has no bones`);
          assert.ok(golem.visualParts().every(part => part.shells.every(shell => shell.isVisible || shell === part.host)), `${name} keeps every primitive`);
        }
        for (let frame = 0; frame < 30; frame++) {
          stepProofGolem(golem, 1 / 60, frame / 60);
          arena.scene._renderId++;
          arena.scene._advancePhysicsEngineStep(1000 / 60);
        }
        samples.push(golem.limbs.map(limb => ({ id: limb.key, p: limb.part.mesh.position.asArray(),
          q: limb.part.mesh.rotationQuaternion.asArray(), mass: limb.part.body.getMassProperties().mass })));
        const limb = golem.limbs.find(limb => limb.key.includes("primary"));
        golem.sever(limb, new Vector3(index % 2 ? 1 : -1, 0, 0));
        golem.dispose();
      }
      runs.push(samples);
    } finally { arena.dispose(); }
  }
  assert.deepEqual(runs[1], runs[0], "art cannot move a body or change its mass");
});

/**
 * Where each piece sits on its collider, in the collider's frame. Measured (this harness, the
 * assets of 2026-09-23): long bones within 27 mm of centre and 1.02-1.28 of the joint spacing along
 * Y; boxes within 43 mm; the spine pieces 37-77 mm off, because the lumbar and cervical runs are
 * shorter than the capsules that overlap their neighbours; the collar 84 mm, because the scapula
 * is behind it and the clavicle runs to the sternum; the hand's pieces 18-58 mm.
 */
const FIT = {
  thighL: { off: 30, y: [.85, 1.35] }, thighR: { off: 30, y: [.85, 1.35] },
  shinL: { off: 30, y: [.85, 1.35] }, shinR: { off: 30, y: [.85, 1.35] },
  upperArm: { off: 30, y: [.85, 1.35] }, forearm: { off: 30, y: [.85, 1.35] },
  pelvis: { off: 45 }, core: { off: 50 }, head: { off: 45 }, footL: { off: 45 }, footR: { off: 45 },
  waist: { off: 90 }, neck: { off: 50 }, collar: { off: 110 },
  wrist: { off: 40 }, "wrist.bare": { off: 40 }, fist: { off: 70 },
};

test("each modelled piece sits on its collider", async () => {
  await loadArt();
  const arena = await createHeadlessArena({ populateDefaultGeometry: false });
  try {
    for (const [name, setup] of FIXTURES) {
      const golem = build(arena.scene, setup);
      for (const part of golem.visualParts()) for (const mesh of artOn(golem, part.host)) {
        const key = mesh.metadata.skeletonArt, fit = FIT[key.replace(/^\w+\./, "")];
        assert.ok(fit, `${key} has a tolerance`);
        const art = localBox(mesh), host = localBox(part.host);
        const off = art.centre.subtract(host.centre).length() * 1000;
        assert.ok(off <= fit.off, `${name}: ${key} is ${off.toFixed(1)} mm off its collider (limit ${fit.off})`);
        for (const axis of ["x", "y", "z"]) assert.ok(
          Math.abs(art.centre[axis] - host.centre[axis]) < (art.extent[axis] + host.extent[axis]) / 2,
          `${name}: ${key} overlaps its collider along ${axis}`);
        if (fit.y) {
          const ratio = art.extent.y / host.extent.y;
          assert.ok(ratio >= fit.y[0] && ratio <= fit.y[1], `${name}: ${key} spans ${ratio.toFixed(2)} of its joint spacing`);
        }
      }
      golem.dispose();
    }
  } finally { arena.dispose(); }
});

test("the skeleton faces forward and is not mirrored", async () => {
  await loadArt();
  const arena = await createHeadlessArena({ populateDefaultGeometry: false });
  try {
    const golem = build(arena.scene, skeletonSetup("fist", "fist"));
    const piece = key => golem.costume.find(mesh => mesh.metadata?.skeletonArt === key);
    const host = key => piece(key).parent.position;
    // Front and back: the face and the toes are on +Z, the spinous processes behind.
    for (const eye of golem.costume.filter(mesh => /\.eye[LR]$/.test(mesh.name)))
      assert.ok(worldCentre(eye).z - host("head.head").z > .05, `${eye.name} is in the face`);
    for (const foot of ["legs.footL", "legs.footR"])
      assert.ok(worldCentre(piece(foot)).z > host(foot.replace("foot", "shin")).z + .01, `${foot}'s toes lead`);
    assert.ok(worldCentre(piece("head.neck")).z < host("head.neck").z, "the cervical spine is behind the throat");
    // Left and right: each collar runs to the sternum, so a piece mirrored in X would point outwards.
    assert.ok(worldCentre(piece("primary.collar")).x < host("primary.collar").x - .04);
    assert.ok(worldCentre(piece("secondary.collar")).x > host("secondary.collar").x + .04);
    assert.ok(worldCentre(piece("primary.upperArm")).x > .1 && worldCentre(piece("secondary.upperArm")).x < -.1);
    golem.dispose();
  } finally { arena.dispose(); }
});

/**
 * The file is written for Babylon's own winding rather than glTF's, which is why the importer swaps
 * no index. `MeshBuilder` is the reference: every one of its triangles has a geometric normal,
 * `(p1 - p0) x (p2 - p0)`, pointing against its vertex normals, and so must every piece's.
 */
test("every piece winds its triangles the way MeshBuilder does", async () => {
  await loadArt();
  const arena = await createHeadlessArena({ populateDefaultGeometry: false });
  const agreement = mesh => {
    const p = mesh.getVerticesData(VertexBuffer.PositionKind), n = mesh.getVerticesData(VertexBuffer.NormalKind);
    const index = mesh.getIndices();
    let against = 0, counted = 0;
    for (let t = 0; t < index.length; t += 3) {
      const [a, b, c] = [index[t], index[t + 1], index[t + 2]].map(i => Vector3.FromArray(p, i * 3));
      const normal = Vector3.FromArray(n, index[t] * 3).add(Vector3.FromArray(n, index[t + 1] * 3)).add(Vector3.FromArray(n, index[t + 2] * 3));
      const face = Vector3.Cross(b.subtract(a), c.subtract(a));
      if (face.lengthSquared() < 1e-14) continue;
      counted++;
      if (Vector3.Dot(face, normal) < 0) against++;
    }
    return against / counted;
  };
  try {
    assert.equal(agreement(MeshBuilder.CreateSphere("reference", { segments: 8 }, arena.scene)), 1);
    const seen = new Set();
    for (const setup of [skeletonSetup("fist", "blade"), skeletonSetup("blade", "fist")]) {
      const golem = build(arena.scene, setup);
      for (const mesh of golem.costume.filter(mesh => mesh.metadata?.skeletonArt)) {
        seen.add(mesh.metadata.skeletonArt);
        assert.ok(agreement(mesh) > .97, `${mesh.metadata.skeletonArt}: ${(agreement(mesh) * 100).toFixed(1)}% wound like MeshBuilder`);
      }
      golem.dispose();
    }
    assert.equal(seen.size, glbDoc.meshes.length, "every piece in the file is checked");
  } finally { arena.dispose(); }
});

test("rebuilding a skeleton returns every mesh and material, severed limbs included", async () => {
  await loadArt();
  const arena = await createHeadlessArena({ populateDefaultGeometry: false });
  try {
    const cycle = index => {
      const golem = build(arena.scene, FIXTURES[index % FIXTURES.length][1]);
      const limb = golem.limbs.find(limb => limb.key.includes("secondary") || limb.key.includes("trailing"));
      const pieces = artOn(golem, limb.part.mesh);
      golem.sever(limb, new Vector3(0, 0, 1));
      assert.ok(pieces.every(mesh => !mesh.isDisposed() && mesh.parent === limb.part.mesh), "a severed limb keeps its bone");
      golem.dispose();
    };
    for (let index = 0; index < FIXTURES.length; index++) cycle(index);
    const meshes = arena.scene.meshes.length, materials = arena.scene.materials.length;
    for (let index = 0; index < 10; index++) cycle(index);
    assert.equal(arena.scene.meshes.length, meshes);
    assert.equal(arena.scene.materials.length, materials);
  } finally { arena.dispose(); }
});

test("a failed load leaves the bones out and the next load retries", async () => {
  forgetSkeletonAssets();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("missing", { status: 404 });
  try { await assert.rejects(loadSkeletonAssets(), /404/); } finally { globalThis.fetch = originalFetch; }
  const arena = await createHeadlessArena({ populateDefaultGeometry: false });
  try {
    const golem = build(arena.scene, skeletonSetup());
    assert.equal(golem.costume.filter(mesh => mesh.metadata?.skeletonArt).length, 0);
    golem.dispose();
    await loadArt();
    const dressed = build(arena.scene, skeletonSetup());
    assert.ok(dressed.costume.filter(mesh => mesh.metadata?.skeletonArt).length > 0);
    dressed.dispose();
  } finally { arena.dispose(); }
});
