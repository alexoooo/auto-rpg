/** Idle standing repairs an established stagger through the configured legs, and explicit requests remain authoritative. */
import test from "node:test";
import assert from "node:assert/strict";
import { rig } from "./harness/probes.mjs";
import { locomotion } from "../src/core/skills/locomotion/locomotion.ts";
import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector.js";

const feet = { "foot.left": "left", "foot.right": "right" };
function fixture(scale = 1) {
  const view = { born: 0, time: 1, standing: scale, down: false, root: { rotation: Quaternion.Identity() },
    stance: { centre: new Vector3(0, scale, 0), support: Vector3.Zero(), place: Vector3.Zero(), plan: Vector3.Zero(), velocity: Vector3.Zero(),
      soles: { left: new Vector3(-.15 * scale, 0, .15 * scale), right: new Vector3(.15 * scale, 0, -.15 * scale) },
      phase: "stand", touching: { left: true, right: true }, own: null } };
  const legs = locomotion(feet, null, { idleFooting: { offsets: { left: [-.15 * scale, 0], right: [.15 * scale, 0] }, length: .25 * scale } });
  const ask = (goal = {}, context) => { view.time += 1 / 120; return legs.goal(view, { walk: null, face: 0, ...goal }, 1 / 120, context).goal; };
  return { view, legs, ask };
}

test("idle settling debounces, scales, holds fixed targets, yields and resets", () => {
  for (const scale of [.5, 1, 2]) {
    const { view, legs, ask } = fixture(scale);
    for (let i = 0; i < 22; i++) assert.equal(ask()?.swing, undefined);
    let goal; for (let i = 0; i < 3; i++) goal = ask();
    assert.ok(goal.swing, "awkward idle footing must request a physical step");
    const target = [...goal.swing.to];
    view.stance.centre.x += .01 * scale; view.stance.phase = "swing";
    assert.deepEqual(ask().swing.to, target, "targets must not chase sway");
    assert.deepEqual(ask({ walk: [1, 0] }).swing.to, target, "a lifted foot lands before walking");
    assert.equal(ask({}, { idleSettle: false }).swing, undefined, "an action owning the stance overrides settling");
    legs.resume(view); view.stance.phase = "stand";
    for (let i = 0; i < 10; i++) assert.equal(ask()?.swing, undefined);
  }
  for (const constraint of [{ halt: true }, { centre: [0, 0] }, { height: 1 }, { heading: 0 }, { feet: ["foot.left", "foot.right"] }, { swing: null }]) {
    const { ask } = fixture();
    for (let i = 0; i < 40; i++) assert.equal(ask(constraint)?.swing ?? null, null);
  }
});

test("idle legs correct a physically established stagger and stop stepping", async () => {
  let available = false;
  const made = await rig({ legs: { kind: "move", rules: [], otherwise: "braced" },
    wrapLegs: legs => Object.create(legs, { goal: { value: (view, goal, dt) => legs.goal(view, goal, dt, { idleSettle: available }) } }) });
  try {
    const s = made.view.stance, footing = { "foot.left": [s.soles.left.x, s.soles.left.z + .15], "foot.right": [s.soles.right.x, s.soles.right.z - .15] };
    made.run(3, () => ({ legs: { footing } }));
    assert.ok(!made.view.down && Math.abs(s.soles.left.z - s.soles.right.z) > .2, "fixture must establish an upright stagger");
    made.run(.5, () => ({}));
    assert.ok(Math.abs(s.soles.left.z - s.soles.right.z) > .2, "stance authority must survive Move, walk-run and lowering delegation");
    available = true;
    made.run(5, () => ({}));
    assert.ok(!made.view.down, "settling must keep the body up");
    assert.ok(Math.abs(s.soles.left.z - s.soles.right.z) < .06, `remaining stagger ${s.soles.left.z - s.soles.right.z} m, limit .06`);
    made.run(1, () => ({}));
    assert.equal(s.phase, "stand");
    assert.ok(s.touching.left && s.touching.right);
  } finally { made.dispose(); }
});
