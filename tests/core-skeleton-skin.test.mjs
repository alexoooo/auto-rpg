/**
 * The crypt skeleton's skin (`src/render/skeleton-skin.ts`): every piece of `skeleton.glb` is
 * shown on a segment or named as unshown; each shown piece sits on its segment at the reference pose
 * (its vertices' centre within the segment's span and near its line); dressed on a body just built,
 * each piece is exactly at its bind; and as the body moves, each follows its segment. Node, a
 * NullEngine scene with the core stand's world, Rapier; to a micrometre, as Babylon's matrices are float32.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { createBody } from "../src/core/body.ts";
import { modelSpec } from "../src/core/human/spec.ts";
import { SKELETON_MODEL } from "../src/core/human/skeleton.ts";
import { bindMatrix, dressSkeleton, parseSkeletonArt, piecesOnSegments, SKELETON_PIECES, SKELETON_UNSHOWN } from "../src/render/skeleton-skin.ts";
import { coreStand } from "./harness/core-stand.mjs";

const bytes = await readFile(new URL("../public/assets/skeleton/skeleton.glb", import.meta.url));
const art = parseSkeletonArt(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));

test("every piece of the art is shown on a segment or named as unshown", () => {
  assert.deepEqual(new Set(art.keys()), new Set([...Object.keys(SKELETON_PIECES), ...Object.keys(SKELETON_UNSHOWN)]));
  assert.equal(art.get("head.head").eyes.length, 2);
});

test("each piece sits on its segment: its centre within the segment's span and 15 cm of its line", () => {
  const spec = modelSpec(SKELETON_MODEL);
  for (const [key, { part, segment }] of Object.entries(SKELETON_PIECES)) {
    const { positions } = art.get(key), place = bindMatrix(part), s = spec.segments.find((g) => g.name === segment);
    const from = Vector3.FromArray(s.proximal.value), axis = Vector3.FromArray(s.distal.value).subtract(from);
    const length = axis.length();
    axis.normalize();
    const centre = new Vector3(), count = positions.length / 3;
    for (let i = 0; i < count; i++) centre.addInPlace(Vector3.TransformCoordinates(Vector3.FromArray(positions, 3 * i), place));
    centre.scaleInPlace(1 / count);
    const along = Vector3.Dot(centre.subtract(from), axis), off = centre.subtract(from).subtract(axis.scale(along)).length();
    assert.ok(along >= 0 && along <= length, `${key} on ${segment}: ${along} along a ${length} m span`);
    assert.ok(off < 0.15, `${key} on ${segment}: ${off} m off its line`);
  }
});

test("dressed on a body just built each piece is at its bind, and as the body moves each follows its segment", async () => {
  const stand = await coreStand(modelSpec(SKELETON_MODEL), { ground: true, hz: 120 });
  const body = createBody(stand.built, stand.world, { servoSeconds: 0.1 });
  const skin = dressSkeleton(stand.built, art, stand.scene);
  const held = piecesOnSegments(stand.built);
  const meshOf = (key) => stand.scene.getMeshByName(`${SKELETON_MODEL}.skin.${key}`);
  try {
    for (const [key, { part }] of Object.entries(SKELETON_PIECES)) {
      const mesh = meshOf(key), bind = bindMatrix(part);
      assert.ok(Vector3.Distance(mesh.position, bind.getTranslation()) < 1e-6, `${key} at ${mesh.position}`);
      const turn = new Quaternion();
      bind.decompose(undefined, turn);
      assert.ok(Math.abs(Math.abs(Quaternion.Dot(turn, mesh.rotationQuaternion)) - 1) < 1e-6, key);
    }
    // Lower the body 5 cm and turn nothing: every segment moves, and the pieces with them.
    let goal = null;
    body.drive((view) => {
      const s = view.stance;
      if (!goal && view.time > 0) goal = { feet: ["left", "right"], centre: null, height: s.centre.y - s.support.y - 0.05, heading: 0 };
      return { posture: { "elbow.right flexion": -0.5 }, hands: { left: null, right: null }, pushes: [], stance: goal };
    });
    stand.step(stand.seconds(1));
    stand.scene.onBeforeRenderObservable.notifyObservers(stand.scene);
    let moved = 0;
    for (const [key, { segment, held: local }] of held) {
      const node = stand.built.segments.get(segment).node;
      const expected = local.multiply(Matrix.Compose(Vector3.One(), node.rotationQuaternion, node.position));
      const mesh = meshOf(key);
      assert.ok(Vector3.Distance(mesh.position, expected.getTranslation()) < 1e-6, `${key} left its segment`);
      if (Vector3.Distance(mesh.position, bindMatrix(SKELETON_PIECES[key].part).getTranslation()) > 0.01) moved++;
    }
    assert.ok(moved >= 10, `only ${moved} pieces moved`);
  } finally {
    skin.dispose();
    body.dispose();
    stand.dispose();
  }
});
