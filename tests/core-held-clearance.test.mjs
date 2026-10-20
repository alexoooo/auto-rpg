import test from "node:test";
import assert from "node:assert/strict";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { heldClearance } from "../src/core/mind/held-clearance.ts";
import { sourced } from "../src/core/spec/quantity.ts";
import { withLoadout } from "../src/core/items/held.ts";
import { modelSpec } from "../src/core/models.ts";
import { createBody, SERVO_SECONDS } from "../src/core/body.ts";
import { guardPosture } from "../src/core/skills/guard.ts";
import { coreStand } from "./harness/core-stand.mjs";
import { lone } from "./fixtures/lone.mjs";

const q = (value, unit = "m") => sourced(value, unit, "owner-arena-items", "clearance geometry fixture");
const ball = (centre, radius) => ({ kind: "sphere", centre: q(centre), radius: q(radius) });
const capsule = (from, to, radius) => ({ kind: "capsule", from: q(from), to: q(to), radius: q(radius) });
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);

function fixture(shapes, contacts = []) {
  const spec = lone("clearance", "hand", 1, { held: 0 });
  spec.segments[0] = { ...spec.segments[0], proximal: q([0, 0, 0]), distal: q([0, 1, 0]),
    points: { anchor: q([0, .25, 0]) }, shape: ball([0, 0, 0], .01) };
  spec.effectors = [{ segment: "hand", base: "hand", point: "anchor" }];
  spec.held[0].item = { ...spec.held[0].item, shapes, contacts };
  return spec;
}

function sight() {
  return { stance: { centre: new Vector3() }, root: { position: new Vector3(), rotation: Quaternion.Identity() },
    effectors: { hand: { points: { anchor: new Vector3(0, .25, 0) }, rotation: Quaternion.Identity() } } };
}

test("unarmed observers need no humanoid root or effector observation", () => {
  assert.equal(heldClearance({})({ stance: { centre: { x: 0, z: 0 } } }), 0);
  const spec = fixture([ball([0, 0, 0], .1)]);
  close(heldClearance(spec)({ stance: { centre: { x: 0, z: 0 } },
    root: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } },
    effectors: { hand: { points: { anchor: { x: 0, y: .25, z: 0 } }, rotation: { x: 0, y: 0, z: 0, w: 1 } } } }), .1);
  assert.throws(() => heldClearance({ ...spec, effectors: [] }), /observed effector/);
  assert.throws(() => heldClearance(spec)({ stance: { centre: { x: 0, z: 0 } } }), /no current observation/);
  assert.throws(() => heldClearance({ ...spec, effectors: [{ ...spec.effectors[0], point: "absent" }] }), /point absent/);
});

test("round colliders include their radii and contact regions independently of broad shapes", () => {
  for (const [shape, expected] of [[ball([1, 0, 0], .4), 1.4], [capsule([-1, 0, 0], [0, 1, 0], .2), 1.2]])
    close(heldClearance(fixture([shape]))(sight()), expected);
  const spec = fixture([ball([0, 0, 0], .01)], [{ name: "far-tip", shape: ball([3, 0, 0], .1), surface: { stiffness: q(1, "N/m") } }]);
  close(heldClearance(spec)(sight()), 3.1);
});

test("hull vertices and segment-oriented box corners contribute their full extent", () => {
  close(heldClearance(fixture([{ kind: "hull", points: [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, -2]].map(p => q(p)) }]))(sight()), 2);
  const spec = fixture([]), segment = spec.segments[0];
  segment.right = q([1, 0, 1], "1");
  segment.shape = { kind: "box", centre: q([.5, 0, 0]), size: q([2, .2, .4]) };
  const cornerX = .5 + 1.2 / Math.sqrt(2), cornerZ = .8 / Math.sqrt(2);
  close(heldClearance(spec)(sight()), Math.sqrt(cornerX * cornerX + cornerZ * cornerZ));
});

test("the current effector anchor and turn move the whole shape rather than its named points alone", () => {
  const radius = heldClearance(fixture([capsule([0, 0, 0], [0, 2, 0], .2)])), view = sight();
  view.effectors.hand.rotation = new Quaternion(0, 0, Math.sqrt(.5), Math.sqrt(.5));
  view.effectors.hand.points.anchor.set(3, 1, 0);
  close(radius(view), 3.45);
  view.effectors.hand.points.anchor.x = -3;
  close(radius(view), 4.95);
  view.stance.centre.x = -3;
  close(radius(view), 1.95);
});

test("world-horizontal extent follows root tilt, placement and the actual centre of mass", () => {
  const radius = heldClearance(fixture([ball([0, 2, 0], .2)])), view = sight();
  view.root.rotation = new Quaternion(Math.sqrt(.5), 0, 0, Math.sqrt(.5));
  view.root.position.set(5, 3, -2);
  view.stance.centre.set(5, 3, -2);
  close(radius(view), 2.2);
  view.stance.centre.z = -1;
  close(radius(view), 1.2);
});

test("own observed equipment clearance agrees with complete physically built colliders", async () => {
  for (const loadout of [{ left: "buckler", right: "empty" }, { left: "buckler", right: "club" }]) {
    const spec = withLoadout(modelSpec("workshop-fighter"), loadout);
    const stand = await coreStand(spec, { gravity: false, ground: false, posture: guardPosture(spec),
      position: [3, 1, -2], rotation: Quaternion.FromEulerAngles(.3, .8, -.2).asArray() });
    const body = createBody(stand.built, stand.world, { servoSeconds: SERVO_SECONDS });
    try {
      const at = new Vector3(), turn = new Quaternion(), inverse = new Quaternion();
      let expected = 0, named = 0;
      for (const name of new Set(spec.held.map(held => held.segment))) {
        const part = stand.built.segments.get(name);
        part.node.rotationQuaternion.multiplyToRef(Quaternion.InverseToRef(part.rest, inverse), turn);
        for (const shape of part.rigid.shapes) {
          const points = shape.kind === "hull" ? shape.points.map(point => point.value)
            : shape.kind === "capsule" ? [shape.from.value, shape.to.value] : [shape.centre.value];
          assert.notEqual(shape.kind, "box", "the equipped physical fixture uses round hands and polyhedral shields");
          for (const point of points) {
            at.set(point[0] - part.frame.origin[0], point[1] - part.frame.origin[1], point[2] - part.frame.origin[2])
              .applyRotationQuaternionToRef(turn, at).addInPlace(part.node.position);
            const dx = at.x - body.view.stance.centre.x, dz = at.z - body.view.stance.centre.z;
            expected = Math.max(expected, Math.sqrt(dx * dx + dz * dz) + (shape.radius?.value ?? 0));
          }
        }
        for (const point of Object.values(body.view.effectors[name].points)) {
          point.applyRotationQuaternionToRef(body.view.root.rotation, at).addInPlace(body.view.root.position);
          const dx = at.x - body.view.stance.centre.x, dz = at.z - body.view.stance.centre.z;
          named = Math.max(named, Math.sqrt(dx * dx + dz * dz));
        }
      }
      assert.ok(Math.abs(heldClearance(spec)(body.view) - expected) < 1e-7,
        "detached unit-quaternion observations agree with the engine pose within float32 precision");
      assert.ok(expected > named, "collider extent exceeds the published named points");
    } finally { body.dispose(); stand.dispose(); }
  }
});
