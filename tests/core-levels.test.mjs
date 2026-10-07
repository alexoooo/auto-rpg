/**
 * **A body's level** (`BodyLevel`, `src/core/muscle/driver.ts`): limp, its mind is not stepped and
 * its motors are released; held, every segment is fixed where it is; back at `full`, its mind goes
 * on from the body as it is, and is told so. A level is saved and loaded with the body. Node
 * stand, Rapier, 120 Hz; a skeleton with the club under the command layers, standing.
 *
 * **The rule that sets it** (`levelsOf`, `src/core/rules/levels.ts`): a body with nothing to do
 * and nobody near is held; any other is `full` in the fight and `limp` out of it. Each read on
 * both sides of each of its distances, from each level it may be at.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { createBody, SERVO_SECONDS } from "../src/core/body.ts";
import { buildBody } from "../src/core/build/build-body.ts";
import { centreOfToRef } from "../src/core/control/support.ts";
import { armed } from "../src/core/human/grip.ts";
import { modelSpec } from "../src/core/models.ts";
import { woodenClub } from "../src/core/items/club.ts";
import { standIntent } from "../src/core/mind/intent.ts";
import { embody } from "../src/core/mind/mind.ts";
import { driveBy } from "../src/core/mind/tactics.ts";
import { levelsOf, stirs } from "../src/core/rules/levels.ts";
import { coreStand, loadStand, saveStand } from "./harness/core-stand.mjs";
import { traceOf } from "./harness/trace.mjs";

const SKELETON = armed(modelSpec("crypt-skeleton"), "right", woodenClub());
/** A ceiling of the test's own, so that the assist's meter counts the steps it is given. */
const ASSIST = { force: 0.05, moment: 0.02 };
const LEVELS = ["full", "limp", "held"];

/** `built` under the command layers, driven to stand by tactics that count their calls and keep what each read of `resumed`. */
function standing(built, world) {
  const body = createBody(built, world, { servoSeconds: SERVO_SECONDS, assist: ASSIST });
  const seen = { calls: 0, resumed: [] };
  const skills = driveBy(body, { name: "stand", decide: ({ view }) => { seen.calls++; seen.resumed.push(view.resumed); return standIntent(0); } });
  return { body, skills, seen };
}
const rootOf = (body) => body.muscles.dynamics.root.segment;
/** A shove of `size` N s at `body`'s root, along x. */
const shove = (body, size) => { const root = rootOf(body); root.body.applyImpulse(new Vector3(size, 0, 0), centreOfToRef(root, new Vector3())); };
/** Every segment's position and rotation, as one record. */
const poseOf = (built) => [...built.segments.values()].flatMap((s) => [...s.node.position.asArray(), ...s.node.rotationQuaternion.asArray()]);
const ground = (p) => ({ x: p.x, z: p.z });
const apart = (a, b) => Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.z - b.z) * (a.z - b.z));

test("a_limp_body_is_let_go_and_its_mind_is_not_stepped", async () => {
  const stand = await coreStand(SKELETON), { body, seen } = standing(stand.built, stand.world);
  try {
    stand.step(stand.seconds(1));
    const root = rootOf(body).node.position, high = root.y, meter = { ...body.assist.meter }, calls = seen.calls;
    // The control: standing, it was driven and helped at every step, and its muscles pulled.
    assert.ok(calls === stand.seconds(1) && meter.steps === calls && body.muscles.ceiling.some((c) => c > 0), `${calls} calls, ${meter.steps} helped`);
    assert.deepEqual([body.level, body.has, body.view.down], ["full", "command", false]);
    body.setLevel("limp");
    stand.step(240);
    assert.deepEqual({ level: body.level, has: body.has, calls: seen.calls - calls, pulling: body.muscles.ceiling.filter((c) => c !== 0).length, meter: { ...body.assist.meter } },
      { level: "limp", has: "nobody", calls: 0, pulling: 0, meter });
    assert.ok(root.y < high / 2, `it is down: its root at ${root.y.toFixed(3)} m, standing at ${high.toFixed(3)}`);
  } finally { body.dispose(); stand.dispose(); }
});

test("a_held_body_stays_where_it_is_and_stands_when_let_go", async () => {
  for (const held of [1, 240, 600]) {
    const stand = await coreStand(SKELETON), { body, seen } = standing(stand.built, stand.world);
    try {
      stand.step(stand.seconds(1));
      body.setLevel("held");
      const pose = poseOf(stand.built), was = ground(rootOf(body).node.position);
      shove(body, 400);
      // Fixed, a segment may move once by the single precision the solver keeps a pose in, and never again.
      stand.step();
      const fixed = poseOf(stand.built), first = Math.max(...fixed.map((v, k) => Math.abs(v - pose[k])));
      assert.ok(first < 1e-6, `held, it moves ${first} in its first step`);
      stand.step(held - 1);
      assert.deepEqual(poseOf(stand.built), fixed, `held ${held} steps, it is where it was`);
      body.setLevel("full");
      const calls = seen.calls;
      stand.step();
      assert.deepEqual([seen.calls - calls, seen.resumed.at(-1), body.has], [1, true, "command"], `let go after ${held} steps, its driver is told at its first step`);
      stand.step(stand.seconds(3));
      const off = apart(ground(rootOf(body).node.position), was);
      assert.ok(!body.view.down && off < 0.3, `held ${held} steps, 3 s after it is let go it stands ${off.toFixed(3)} m from where it was held`);
    } finally { body.dispose(); stand.dispose(); }
  }
});

test("every_change_of_level_leaves_the_engine_and_the_motors_as_the_level_says", async () => {
  const read = [];
  for (const from of LEVELS) for (const to of LEVELS) {
    if (from === to) continue;
    const stand = await coreStand(SKELETON), { body } = standing(stand.built, stand.world);
    try {
      stand.step(stand.seconds(0.5));
      body.setLevel(from);
      stand.step();
      body.setLevel(to);
      const root = rootOf(body).node.position, was = root.clone();
      shove(body, 50);
      stand.step(12);
      read.push([from, to, root.subtract(was).length() > 0.001, body.muscles.ceiling.every((c) => c === 0)]);
    } finally { body.dispose(); stand.dispose(); }
  }
  // A shove moves a body that is not fixed, and its muscles pull only at `full`.
  assert.deepEqual(read, [
    ["full", "limp", true, true], ["full", "held", false, true],
    ["limp", "full", true, false], ["limp", "held", false, true],
    ["held", "full", true, false], ["held", "limp", true, true],
  ]);
});

test("a_level_set_twice_is_set_once", async () => {
  const stand = await coreStand(SKELETON);
  let idled = 0;
  const { own, dispose } = embody(stand.built, stand.world, () => ({ name: "counting", step() {}, idle() { idled++; } }));
  try {
    const counts = [];
    for (const level of ["limp", "held", "held", "full", "full", "limp"]) { own.muscles.setLevel(level); counts.push([level, own.muscles.level, idled]); }
    assert.deepEqual(counts, [["limp", "limp", 1], ["held", "held", 1], ["held", "held", 1], ["full", "full", 1], ["full", "full", 1], ["limp", "limp", 2]]);
  } finally { dispose(); stand.dispose(); }
});

test("a_level_is_saved_and_loaded", async () => {
  const stand = await coreStand(SKELETON), second = buildBody(SKELETON, stand.world, { position: [3, 0, 0] });
  const a = standing(stand.built, stand.world), b = standing(second, stand.world);
  const states = { a: a.body.state, aSkills: a.skills.state, b: b.body.state, bSkills: b.skills.state };
  try {
    stand.step(stand.seconds(1));
    a.body.setLevel("held");
    stand.step(10);
    const saved = saveStand(stand.world, states);
    /** From the save: the held one shoved and held 12 steps, where it stays; then let go, and both traced for 3 s. */
    const onward = () => {
      const pose = poseOf(stand.built);
      shove(a.body, 400);
      stand.step(12);
      assert.deepEqual(poseOf(stand.built), pose, "a shove does not move the held one");
      a.body.setLevel("full");
      const trace = traceOf([stand.built, second]);
      for (let i = 0; i < stand.seconds(3); i++) { stand.step(); trace.take(); }
      return trace.digest();
    };
    const original = onward();
    // Shoved about after it, both moving: the load puts the one back held and the other at full.
    shove(a.body, 400); shove(b.body, 400);
    stand.step(stand.seconds(1));
    assert.deepEqual([a.body.level, b.body.level], ["full", "full"]);
    loadStand(stand.world, states, saved);
    assert.deepEqual([a.body.level, b.body.level, a.body.has, b.body.has], ["held", "full", "nobody", "command"]);
    assert.equal(onward(), original, "let go at the same step, the load goes on as the original did");
  } finally { a.body.dispose(); b.body.dispose(); second.dispose(); stand.dispose(); }
});

test("a_mind_that_does_not_answer_idle_is_put_at_any_level", async () => {
  const stand = await coreStand(SKELETON);
  let steps = 0;
  const { own, dispose } = embody(stand.built, stand.world, () => ({ name: "bare", step() { steps++; } }));
  try {
    const read = [];
    for (const level of ["limp", "held", "full", "held", "limp", "full"]) { own.muscles.setLevel(level); stand.step(2); read.push([own.muscles.level, steps]); }
    assert.deepEqual(read, [["limp", 0], ["held", 0], ["full", 2], ["held", 2], ["limp", 2], ["full", 4]]);
  } finally { dispose(); stand.dispose(); }
});

/** The rule's distances, the test's own: each pair a line coming and a farther one going. */
const RULE = Object.freeze({ wake: 16, rest: 18, company: 4, clear: 5, settle: 3 });
const E = 0.01;
/** A body for the rule: an enemy in the fight at full, going somewhere, at the origin, unless `over` says. */
const ask = (over) => ({ level: "full", side: "enemy", at: { x: 0, z: 0 }, out: null, waiting: false, ...over });
const at = (x) => ({ x: x * 0.6, z: x * 0.8 });
/** A party member in the fight, going somewhere, `d` m off. */
const foe = (d, over = {}) => ask({ side: "party", at: at(d), ...over });
/** One of the body's own side going somewhere, `d` m off: no foe, so only by reach. */
const walker = (d) => ask({ at: at(d) });

/** A waiting body at `level` beside `other`: the levels of both. */
const beside = (level, other) => levelsOf([ask({ level, waiting: true }), other], RULE);

test("a_waiting_body_is_held_and_let_go_on_both_sides_of_each_distance", () => {
  const rows = {
    "full, a foe inside rest": beside("full", foe(RULE.rest - E)),
    "full, a foe outside rest": beside("full", foe(RULE.rest + E)),
    "full, a walker inside clear": beside("full", walker(RULE.clear - E)),
    "full, a walker outside clear": beside("full", walker(RULE.clear + E)),
    "held, a foe inside wake": beside("held", foe(RULE.wake - E)),
    "held, a foe outside wake": beside("held", foe(RULE.wake + E)),
    "held, a walker inside company": beside("held", walker(RULE.company - E)),
    "held, a walker outside company": beside("held", walker(RULE.company + E)),
    // Between the two lines a body stays as it is.
    "full, a foe between wake and rest": beside("full", foe((RULE.wake + RULE.rest) / 2)),
    "held, a foe between wake and rest": beside("held", foe((RULE.wake + RULE.rest) / 2)),
    "full, a walker between company and clear": beside("full", walker((RULE.company + RULE.clear) / 2)),
    "held, a walker between company and clear": beside("held", walker((RULE.company + RULE.clear) / 2)),
  };
  assert.deepEqual(rows, {
    "full, a foe inside rest": ["full", "full"],
    "full, a foe outside rest": ["held", "full"],
    "full, a walker inside clear": ["full", "full"],
    "full, a walker outside clear": ["held", "full"],
    "held, a foe inside wake": ["full", "full"],
    "held, a foe outside wake": ["held", "full"],
    "held, a walker inside company": ["full", "full"],
    "held, a walker outside company": ["held", "full"],
    "full, a foe between wake and rest": ["full", "full"],
    "held, a foe between wake and rest": ["held", "full"],
    "full, a walker between company and clear": ["full", "full"],
    "held, a walker between company and clear": ["held", "full"],
  });
  // Two waiting side by side with nobody near are both held.
  assert.deepEqual(levelsOf([ask({ waiting: true }), ask({ waiting: true, at: at(1) })], RULE), ["held", "held"]);
});

test("a_body_with_something_to_do_is_full_wherever_it_is", () => {
  const far = foe(1000, { waiting: true });
  assert.deepEqual([levelsOf([ask({})], RULE), levelsOf([ask({}), far], RULE), levelsOf([ask({ level: "held" }), far], RULE)],
    [["full"], ["full", "held"], ["full", "held"]]);
});

test("a_body_out_lies_loose_until_it_has_settled_and_nobody_walks_near", () => {
  /** A body out for `out` s at `level` beside `others`: its level. */
  const dead = (level, out, ...others) => levelsOf([ask({ level, out }), ...others], RULE)[0];
  const settled = RULE.settle + E;
  const rows = {
    "limp, out just under settle": dead("limp", RULE.settle - E),
    "limp, out just over settle": dead("limp", settled),
    "held, out just under settle": dead("held", RULE.settle - E),
    "limp, a walker inside clear": dead("limp", settled, walker(RULE.clear - E)),
    "limp, a walker outside clear": dead("limp", settled, walker(RULE.clear + E)),
    "held, a walker inside company": dead("held", settled, walker(RULE.company - E)),
    "held, a walker outside company": dead("held", settled, walker(RULE.company + E)),
    "limp, a foe that waits a metre off": dead("limp", settled, foe(1, { waiting: true })),
    "limp, a foe going somewhere a metre off": dead("limp", settled, foe(1)),
  };
  assert.deepEqual(rows, {
    "limp, out just under settle": "limp",
    "limp, out just over settle": "held",
    "held, out just under settle": "limp",
    "limp, a walker inside clear": "limp",
    "limp, a walker outside clear": "held",
    "held, a walker inside company": "limp",
    "held, a walker outside company": "held",
    "limp, a foe that waits a metre off": "held",
    "limp, a foe going somewhere a metre off": "limp",
  });
});

test("a_waiting_body_is_no_company", () => {
  const held = ask({ level: "held", waiting: true });
  assert.deepEqual([levelsOf([held, ask({ waiting: true, at: at(1) })], RULE), levelsOf([held, ask({ at: at(1) })], RULE)],
    [["held", "held"], ["full", "full"]]);
});

test("stirs_is_the_rule_s_own_letting_go", () => {
  const others = [foe(RULE.wake - E), foe(RULE.wake + E), walker(RULE.company - E), walker(RULE.company + E), foe(RULE.rest - E), walker(RULE.clear - E)];
  const read = others.map((other) => [stirs({ x: 0, z: 0 }, "enemy", [other], RULE), beside("held", other)[0] !== "held"]);
  assert.deepEqual(read.map(([stirred]) => stirred), [true, false, true, false, false, false]);
  assert.deepEqual(read.map(([stirred]) => stirred), read.map(([, letGo]) => letGo));
});
