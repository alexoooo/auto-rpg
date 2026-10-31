import { DEFAULT_ENGINE } from "../src/core/engine/engines.ts";
/** Idle standing repairs an established stagger through the configured legs, and explicit requests remain authoritative. */
import test from "node:test";
import assert from "node:assert/strict";
import { rig } from "./harness/probes.mjs";
import { locomotion } from "../src/core/skills/locomotion/locomotion.ts";
import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector.js";

const feet = { "foot.left": "left", "foot.right": "right" };
function fixture(scale = 1) {
  const view = { born: 0, time: 1, standing: scale, down: false, root: { rotation: Quaternion.Identity() }, effectors: {},
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
  const made = await rig({ engine: DEFAULT_ENGINE, legs: { kind: "move", rules: [], otherwise: "braced" },
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


test("idle settling ignores body sway but steps a turned sole even at the right position", () => {
  const { view, ask } = fixture();
  view.stance.soles.left.z = 0; view.stance.soles.right.z = 0;
  for (let i = 0; i < 90; i++) {
    view.stance.centre.x = .1 * Math.sin(i);
    assert.equal(ask().swing, undefined, "centre-of-mass sway must not start another foot placement");
  }
  view.effectors["foot.left"] = { rotation: Quaternion.RotationAxis(new Vector3(0, 1, 0), .5) };
  assert.equal(ask().swing.foot, "left", "a turned foot needs a corrective step even when its middle is correctly placed");
});

test("idle placement untwists a physically turned footing", async () => {
  const made = await rig({ engine: DEFAULT_ENGINE });
  const yaw = side => {
    const q = made.view.root.rotation.multiply(made.view.effectors[`foot.${side}`].rotation);
    return Math.atan2(2 * (q.x * q.z + q.w * q.y), 1 - 2 * (q.x * q.x + q.y * q.y));
  };
  try {
    const s = made.view.stance, footing = { "foot.left": [s.soles.left.x, s.soles.left.z + .1], "foot.right": [s.soles.right.x, s.soles.right.z + .1] };
    made.run(3, () => ({ legs: { footing, heading: .4 } }));
    assert.ok(Math.max(Math.abs(yaw("left")), Math.abs(yaw("right"))) > .25 && !made.view.down, "fixture must establish turned soles while upright");
    made.run(5, () => ({}));
    assert.ok(!made.view.down);
    assert.ok(Math.abs(yaw("left")) < .2 && Math.abs(yaw("right")) < .2, `sole yaws ${yaw("left")}, ${yaw("right")} rad, limits .2`);
    made.run(1, () => ({}));
    assert.equal(s.phase, "stand");
  } finally { made.dispose(); }
});


test("following orders continues configured blows and releases recovery actions", async () => {
  const { followOrders, orderedBlow } = await import("../src/core/option/orders.ts");
  const actions = [{ name: "punch", executor: "punch", effectors: ["hand.left"] }];
  const punch = { id: 1, action: "punch", effector: "hand.left", target: { kind: "point", at: [0, 1, 1] }, holds: ["hand.left"] };
  const steady = { id: 2, action: "steady", effector: "foot.left", target: { kind: "point", at: [0, 0, 0] }, holds: ["legs"] };
  assert.ok(orderedBlow(actions, punch)); assert.ok(!orderedBlow(actions, steady));
  const option = followOrders({ kept: (_now, asked) => asked }, actions);
  const now = { orders: { move: null }, focus: null, sight: { report: { heading: 0, actions: [punch, steady] },
    needs: () => ["hand.left"] } };
  const { holds: _, ...request } = punch;
  assert.deepEqual(option.step(now).asked.actions, [request]);
});


test("two manual Lab shoves release recovery back to settling on the gameplay engine", async t => {
  const { coreStand } = await import("./harness/core-stand.mjs");
  const { labAddress } = await import("../src/lab/scenarios.ts");
  const { loadoutSpec } = await import("../src/lab/loadout.ts");
  const { groundPlacement } = await import("../src/lab/ground-starts.ts");
  const { labActor } = await import("../src/lab/actor.ts");
  const { startGround, STAND_CHECK, SHOVED_UNFELLED } = await import("../src/lab/ground-mode.ts");
  const address = labAddress("?scenario=ground&mind=option&seed=4&groundImpulse=90"), spec = loadoutSpec(address);
  const stand = await coreStand(spec, { ...groundPlacement(spec, address), engine: DEFAULT_ENGINE });
  let impulses = 0;
  const { balanceCeiling, balancePercent, rulebook } = await import("../src/core/rules/rulebook.ts");
  const actor = labActor(stand.built, stand.world, { mind: address.mind,
    assist: balanceCeiling(spec.attributes.balance.value, balancePercent(rulebook("arena"))) });
  const run = startGround(actor, address, { pushed: () => impulses++ });
  try {
    stand.step(24);
    const before = impulses;
    run.shove(); stand.step(12); run.shove();
    let fell = false;
    const cap = stand.seconds(SHOVED_UNFELLED + STAND_CHECK.cap + STAND_CHECK.standing + STAND_CHECK.walking);
    for (let i = 0; i < cap && !run.check.done(); i++) { stand.step(); fell ||= actor.body.view.down; }
    assert.ok(fell, "seed 4, Warrior, impulse 90 twice 0.1 s apart must reach the fall");
    assert.equal(impulses, before + 2, "two clicks must give exactly two shoves with no automatic retry");
    t.diagnostic(`Node ${DEFAULT_ENGINE}, 120 Hz, Warrior balance ${spec.attributes.balance.value}%, seed 4: verified ${run.check.state.verified} s, Lab cap ${STAND_CHECK.cap} s`);
    assert.equal(run.check.state.stage, "stood", `seed 4, double 90 N s shoves: ${JSON.stringify(run.check.state)}`);
    assert.ok(run.check.state.verified !== null && run.check.state.verified <= STAND_CHECK.cap);
    assert.deepEqual(actor.mind.skills.report.actions, [], "recovery must hand the body back, not remain committed as an ordered blow");
    // The check ends while walking; its last step lands before idle settling is judged.
    let quiet = 0;
    for (let i = 0; i < stand.seconds(STAND_CHECK.standing + STAND_CHECK.walking) && quiet < STAND_CHECK.quiet; i++) {
      stand.step(); const s = actor.body.view.stance;
      quiet = s.phase === "stand" && s.touching.left && s.touching.right && !actor.body.view.down ? quiet + stand.world.dt : 0;
    }
    assert.ok(quiet >= STAND_CHECK.quiet, "after the check's walk, idle legs must finish their steps and hold standing");
  } finally { run.dispose(); stand.dispose(); }
});
