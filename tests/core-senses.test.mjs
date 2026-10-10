/**
 * **The senses** (`createSenses`, `src/core/mind/senses.ts`): the one layer between the world and
 * what every mind is told of the other bodies, read before any mind steps; the fighter's own
 * choice of foe from them (`seekFoe`), and the aim its tactics hold (`recipeTactics`). Node
 * stand, Rapier, 120 Hz: two Warriors in one world on a ground, the second built two metres along
 * x, both limp unless a test says otherwise, so both are falling and every reading moves.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { createBody, SERVO_SECONDS } from "../src/core/body.ts";
import { buildBody } from "../src/core/build/build-body.ts";
import { centreOfToRef } from "../src/core/control/support.ts";
import { humanSpec } from "../src/core/human/spec.ts";
import { modelSpec } from "../src/core/models.ts";
import { RECIPE_FIGHTER } from "../src/core/mind/config.ts";
import { EDGE, recipeTactics, seekFoe } from "../src/core/mind/recipe-tactics.ts";
import { NO_COVER } from "../src/core/mind/intent.ts";
import { embody } from "../src/core/mind/mind.ts";
import { createSenses } from "../src/core/mind/senses.ts";
import { APPROACH, rangeOf } from "../src/core/skills/strike.ts";
import { coreStand } from "./harness/core-stand.mjs";

const spec = humanSpec("workshop-fighter");

/** A stand with the Warrior, and a second two metres along x. */
async function pair() {
  const stand = await coreStand(spec);
  const second = buildBody(spec, stand.world, { position: [2, 0, 0] });
  return { stand, second, dispose() { second.dispose(); stand.dispose(); } };
}

/** Every number the senses carry of `built`'s segments, read from the body as it stands. */
function standing(built) {
  const p = new Vector3(), v = new Vector3(), w = new Vector3();
  return [...built.segments.values()].map((s) => {
    const at = s.node.position, q = s.node.rotationQuaternion;
    centreOfToRef(s, p); s.body.linearVelocityToRef(v); s.body.angularVelocityToRef(w);
    return [at.x, at.y, at.z, q.x, q.y, q.z, q.w, p.x, p.y, p.z, v.x, v.y, v.z, w.x, w.y, w.z];
  });
}
/** The same numbers, as sensed. */
const sensed = (body) => [...body.segments.values()].map((s) => [...s.position.asArray(), ...s.rotation.asArray(),
  ...s.centre.asArray(), ...s.velocity.asArray(), ...s.spin.asArray()]);

test("a mind sees the others as the last step left them, whenever the senses were made", async () => {
  const { stand, second, dispose } = await pair();
  // The first Warrior is given its mind before the senses exist, so its hook is ahead of theirs.
  let sense = null, seen = null;
  const watcher = embody(stand.built, stand.world, () => ({ name: "watch", step(senses) { seen = sensed(senses.others[0]); } }), () => sense());
  const hub = createSenses(stand.world);
  sense = hub.add({ id: "a", side: "left", built: stand.built, out: () => false });
  const b = hub.add({ id: "b", side: "right", built: second, out: () => false });
  try {
    // The spec is compared by identity: it is the one the body was built from.
    const told = (senses) => senses.others.map((other) => [other.id, other.side, other.spec === spec, other.out]);
    assert.deepEqual(told(sense()), [["b", "right", true, false]]);
    assert.deepEqual(told(b()), [["a", "left", true, false]]);
    assert.deepEqual([sense().side, sense().out, b().side], ["left", false, "right"]);
    // A body is carried by its id, once.
    assert.throws(() => hub.add({ id: "a", side: "right", built: second, out: () => false }), /a body called a already/);
    assert.deepEqual(Object.keys(hub.state), ["a", "b"]);
    // Before any step each is shown as it was added.
    assert.deepEqual(sensed(sense().others[0]), standing(second));
    assert.deepEqual([...sense().others[0].segments.keys()], [...second.segments.keys()]);
    stand.step(30);
    const before = standing(second);
    stand.step(1);
    assert.deepEqual(seen, before, "what the mind saw as it stepped is the body as the step began, to the bit");
    assert.notDeepEqual(standing(second), before, "the control: the body moved in that step");
    assert.equal(sense().time, stand.world.time);
  } finally { watcher.dispose(); hub.dispose(); dispose(); }
});

test("a delay shows the others that many steps late", async () => {
  const { stand, second, dispose } = await pair();
  const hub = createSenses(stand.world, 12);
  const a = hub.add({ id: "a", side: "left", built: stand.built, out: () => false });
  hub.add({ id: "b", side: "right", built: second, out: () => false });
  try {
    // `history[j]` is the second body after `j` steps.
    const history = [standing(second)];
    const step = (n) => { for (let i = 0; i < n; i++) { stand.step(1); history.push(standing(second)); } };
    step(5);
    assert.equal(a().others[0].time,0);
    assert.deepEqual(sensed(a().others[0]), history[0], "inside the delay it is shown as it was added");
    step(35);
    // The fortieth step read the world 39 steps in, and showed it 12 late.
    assert.equal(a().others[0].time,27/120);
    assert.deepEqual(sensed(a().others[0]), history[27]);
    assert.notDeepEqual(history[27], history[28]);
    assert.notDeepEqual(history[27], history[26]);
    assert.throws(() => createSenses(stand.world, 1.5), /whole steps/);
    assert.throws(() => createSenses(stand.world, -1), /whole steps/);
  } finally { hub.dispose(); dispose(); }
});

test("a body is out, or down, to the others a step after it is, and out to itself at once", async () => {
  for (const [delay, steps] of [[0, 1], [3, 4]]) {
    const { stand, second, dispose } = await pair();
    const hub = createSenses(stand.world, delay);
    let out = false, down = false;
    const a = hub.add({ id: "a", side: "left", built: stand.built, out: () => false });
    const b = hub.add({ id: "b", side: "right", built: second, out: () => out, down: () => down });
    try {
      assert.deepEqual([b().out, a().others[0].out, a().others[0].down], [false, false, false]);
      out = true; down = true;
      assert.deepEqual([b().out, a().others[0].out, a().others[0].down], [true, false, false], "its own it knows at once; the other has not been shown it");
      stand.step(steps - 1);
      assert.deepEqual([a().others[0].out, a().others[0].down], [false, false], `a delay of ${delay}: not after ${steps - 1} steps`);
      stand.step(1);
      assert.deepEqual([a().others[0].out, a().others[0].down], [true, true], `a delay of ${delay}: after ${steps}`);
      assert.deepEqual([b().others[0].out, b().others[0].down], [false, false], "and the other is still in, and never down, since nothing says it is");
    } finally { hub.dispose(); dispose(); }
  }
});

test("a sensed centre is the body's own reading", async () => {
  const { stand, second, dispose } = await pair();
  const hub = createSenses(stand.world);
  const a = hub.add({ id: "a", side: "left", built: stand.built, out: () => false });
  const b = hub.add({ id: "b", side: "right", built: second, out: () => false });
  const body = createBody(second, stand.world, { servoSeconds: SERVO_SECONDS, senses: b });
  try {
    stand.step(20);
    const other = a().others[0], own = body.view.stance;
    const apart = (p, q) => Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
    assert.ok(apart(other.centre, own.centre) < 1e-9, `centre: ${apart(other.centre, own.centre)}`);
    assert.ok(apart(other.velocity, own.velocity) < 1e-9, `velocity: ${apart(other.velocity, own.velocity)}`);
    assert.ok(apart(other.segments.get("head").centre, body.view.head) < 1e-8, `head: ${apart(other.segments.get("head").centre, body.view.head)}`);
    // The control: the head's centre of mass is not its frame's origin, and the body is not at rest.
    assert.ok(apart(other.segments.get("head").position, body.view.head) > 0.01);
    assert.ok(other.velocity.length() > 1e-4, `it moves: ${other.velocity.length()}`);
    // The body under the command layers sees what the senses pass it.
    assert.ok(body.view.senses === b(), "the view holds the senses it was given");
    assert.deepEqual(body.view.senses.others.map((seen) => seen.id), ["a"]);
  } finally { body.dispose(); hub.dispose(); dispose(); }
});

/** A sensed body's spec as `seekFoe` reads it: where it is aimed at, a human's marks. */
const MARKED = { marks: modelSpec("workshop-fighter").marks };

test("a fighter picks its foe from what it sees", () => {
  const at = (x, y, z) => new Vector3(x, y, z);
  const body = (side, out, centre, head) => ({ side, out, centre, spec: MARKED, segments: new Map(head ? [["head", { centre: head }]] : []) });
  const plan = (others, out = false) => seekFoe({ view: { stance: { centre: at(0, 1, 0) }, senses: { side: "left", out, others } } });
  const east = { x: 1, z: 0 }, north = { x: 0, z: 1 };

  assert.deepEqual(plan([]), { move: null, face: null, attack: null }, "nobody");
  assert.deepEqual(plan([body("right", false, at(4, 1, 0), at(4, 1.6, 0))]), { move: east, face: null, attack: null }, "a foe out of reach");
  assert.deepEqual(plan([body("right", false, at(0, 1, 1.5), at(0.1, 1.6, 1.4))]), { move: null, face: north, attack: [0.1, 1.6, 1.4] }, "a foe within reach");
  assert.deepEqual(plan([body("right", false, at(0, 1.2, 1.5), null)]), { move: null, face: north, attack: [0, 1.2, 1.5] }, "a foe with no head");
  // Reach is across the ground: a foe 1.5 m off and far below is still within it.
  assert.deepEqual(plan([body("right", false, at(0, -5, 1.5), at(0, -4, 1.5))]).attack, [0, -4, 1.5]);
  assert.deepEqual(plan([body("right", true, at(0, 1, 1.5), at(0, 1.6, 1.5))]), { move: null, face: north, attack: null }, "the foe out");
  assert.deepEqual(plan([body("right", false, at(0, 1, 1.5), at(0, 1.6, 1.5))], true), { move: null, face: north, attack: null }, "itself out");
  assert.deepEqual(plan([body("right", false, at(4, 1, 0), at(4, 1.6, 0))], true), { move: null, face: east, attack: null }, "itself out, the foe far");
  assert.deepEqual(plan([body("left", false, at(0, 1, 1), at(0, 1.6, 1)), body("right", false, at(3, 1, 0), at(3, 1.6, 0))]),
    { move: east, face: null, attack: null }, "a friend nearer than the foe");
  assert.deepEqual(plan([body("left", false, at(0, 1, 1), at(0, 1.6, 1))]), { move: null, face: null, attack: null }, "a friend alone");
  const far = body("right", false, at(3, 1, 0), at(3, 1.6, 0)), near = body("right", false, at(0, 1, 2), at(0, 1.6, 2));
  for (const order of [[far, near], [near, far]]) assert.deepEqual(plan(order), { move: north, face: null, attack: null }, "the nearer of two");
  const down = { ...near, out: true };
  for (const order of [[far, down], [down, far]]) assert.deepEqual(plan(order), { move: east, face: null, attack: null }, "the nearer out: the farther");
  const downFar = { ...far, out: true };
  for (const order of [[downFar, down], [down, downFar]]) assert.deepEqual(plan(order), { move: null, face: north, attack: null }, "both out: it faces the nearer");
  // A foe that is down is let rise: faced from where any part of it lies 0.9 m clear, backed away from nearer.
  const lying = (z, head) => ({ ...body("right", false, at(0, 0.2, z), at(0, 0.2, head)), down: true });
  assert.deepEqual(plan([lying(1.5, 2.4)]), { move: null, face: north, attack: null }, "a foe down, clear");
  assert.deepEqual(plan([lying(1.5, 0.6)]), { move: { x: -0, z: -1 }, face: north, attack: null }, "a foe down, its head under the next step");
});

test("a fighter aims at a foe's head, its upper trunk, or the part its right hand's recipe nets the most on", () => {
  const at = (x, y, z) => new Vector3(x, y, z);
  const head = [0.1, 1.6, 1.4], trunk = [0, 1.3, 1.5], none = { high: null, middle: null };
  const whole = new Map([["head", { centre: at(...head) }], ["upperTrunk", { centre: at(...trunk) }]]);
  const sight = (right, left, segments) => ({
    view: { stance: { centre: at(0, 1, 0) }, senses: { side: "left", out: false, others: [{ side: "right", out: false, centre: at(0, 1, 1.5), spec: MARKED, segments }] } },
    report: { strike: { nets: { left, right } } },
  });
  const aimed = (aim, right, left = none, segments = whole) => seekFoe(sight(right, left, segments), aim).attack;
  // A bare fist nets more on a trunk, a club on a head: under "pays" each is aimed where it does.
  const fist = { high: -0.03, middle: 0.2 }, club = { high: 0.98, middle: 0.5 };
  assert.deepEqual([aimed("pays", fist), aimed("pays", club)], [trunk, head]);
  assert.deepEqual([aimed("head", fist), aimed("head", club)], [head, head]);
  // Under "body" it is the upper trunk, whatever pays, and the head where it has none.
  assert.deepEqual([aimed("body", fist), aimed("body", club), aimed("body", none, none, new Map([["head", { centre: at(...head) }]]))], [trunk, trunk, head]);
  // Left to itself a fighter aims at the head (`RECIPE_FIGHTER.tactics.aim`).
  assert.equal(RECIPE_FIGHTER.tactics.aim, "head");
  assert.deepEqual(seekFoe(sight(fist, none, whole)).attack, head);
  // Of equals the first band, the high one; a band its hand has no recipe in is not aimed at, whatever the other nets.
  assert.deepEqual(aimed("pays", { high: 0.2, middle: 0.2 }), head);
  assert.deepEqual(aimed("pays", { high: null, middle: -0.01 }), trunk);
  assert.deepEqual(aimed("pays", { high: -0.01, middle: null }), head);
  assert.deepEqual(aimed("pays", none), head);
  // It is the right hand's recipes that are read, the hand a fighter attacks with.
  assert.deepEqual(aimed("pays", club, fist), head);
  assert.deepEqual(aimed("pays", fist, club), trunk);
  // A foe with no such part is attacked at its head, and with no head at its centre.
  assert.deepEqual(aimed("pays", fist, none, new Map([["head", { centre: at(...head) }]])), head);
  assert.deepEqual(aimed("pays", fist, none, new Map()), [0, 1, 1.5]);
  assert.throws(() => aimed("heart", fist), /aims at the head or at what pays/);
});

test("a fighter at the edge stands just outside its foe's reach and attacks when the foe is in its window", () => {
  const at = (x, y, z) => new Vector3(x, y, z);
  // Its own blow reaches 0.25 m ahead of its head, and lands from 5 cm nearer to 5 cm further.
  const mine = { reach: 0.25, along: [-0.05, 0.05] }, spec = modelSpec("workshop-rogue");
  const theirs = rangeOf(spec, "right", 0), outside = theirs.reach + theirs.along[1];
  const sight = (apart, strike = {}) => ({
    view: { head: at(0, 1.6, 0), stance: { centre: at(0, 1, 0) }, senses: { side: "left", out: false,
      others: [{ side: "right", out: false, spec, centre: at(apart, 1, 0), segments: new Map([["head", { centre: at(apart, 1.6, 0) }]]) }] } },
    report: { strike: { phase: null, still: 0, rangeAt: (hand, up) => { assert.deepEqual([hand, up], ["right", 0]); return mine; }, ...strike } },
  });
  // Backing out is the way to the foe turned round, a zero across it negated.
  const east = { x: 1, z: 0 }, west = { x: -1, z: -0 };
  const orders = (apart, strike, edge) => seekFoe(sight(apart, strike), "head", "edge", edge);
  // The fixture's foe outreaches it, so the edge is outside its own window.
  assert.ok(outside > mine.reach + mine.along[1] + 0.1, `the foe reaches ${outside} m`);
  assert.deepEqual(orders(outside + EDGE.band + 0.01), { move: east, face: null, attack: null }, "beyond the edge it walks in");
  assert.deepEqual(orders(outside + EDGE.band - 0.01), { move: null, face: east, attack: null }, "at the edge it stands, facing the foe");
  assert.deepEqual(orders(outside + 0.01), { move: null, face: east, attack: null });
  assert.deepEqual(orders(outside - 0.01), { move: west, face: east, attack: null }, "inside the foe's reach it backs out");
  // The foe's head in its window, from either side of the window: it attacks from where it stands.
  for (const apart of [0.2, 0.25, 0.3]) assert.deepEqual(orders(apart), { move: null, face: east, attack: [apart, 1.6, 0] }, `in its window at ${apart} m`);
  assert.deepEqual(orders(0.19), { move: west, face: east, attack: null }, "nearer than its window, and inside the foe's reach");
  // Stood still its patience, it attacks all the same; and a blow under way goes on to its end.
  assert.deepEqual(orders(outside + 0.1, { still: EDGE.patience }), { move: null, face: east, attack: [outside + 0.1, 1.6, 0] });
  assert.deepEqual(orders(outside + 0.1, { still: EDGE.patience - 0.01 }).attack, null);
  assert.deepEqual(orders(outside + 0.1, { still: 1 }, { band: 0.25, patience: 1 }).attack, [outside + 0.1, 1.6, 0], "an experiment's edge");
  assert.deepEqual(orders(outside + 1, { phase: "approach" }).attack, [outside + 1, 1.6, 0]);
  assert.deepEqual(orders(outside + 0.3, {}, { band: 0.5, patience: 4 }).move, null, "a wider band stands further out");
  // Walking in is the fighter's way unless it is told otherwise.
  assert.equal(RECIPE_FIGHTER.tactics.range, "close");
});

test("a fighter holds the point it aims at until the plan's leaves it, a blow is thrown or one is under way", () => {
  let attack = [1, 1.6, 0], thrown = 0, resumed = false, phase = "settle";
  const tactics = recipeTactics("aim", () => ({ move: null, face: null, attack }));
  const decide = () => tactics.decide({ view: { resumed }, report: { heading: 0.25, strike: { hand: null, thrown: { left: 0, right: thrown }, phase } }, envelope: null }, 1 / 120);
  const reach = APPROACH.reach;
  assert.deepEqual(decide().attack, { kind: "blow", hand: "right", target: [1, 1.6, 0] });
  // A point that sways inside the reach is not followed, though the plan moves its own array.
  attack[0] = 1 + 0.9 * reach;
  assert.deepEqual(decide().attack.target, [1, 1.6, 0]);
  // One that leaves it is.
  const beyond = attack = [1 + 1.1 * reach, 1.6, 0];
  assert.deepEqual(decide().attack.target, beyond);
  // A blow thrown, it aims again, however near the point has stayed.
  attack = [1 + 1.2 * reach, 1.6, 0];
  assert.deepEqual(decide().attack.target, beyond);
  thrown = 1;
  assert.deepEqual(decide().attack.target, attack);
  // A step with nothing to attack forgets the aim: the next is taken where the point is then.
  const held = attack;
  attack = null;
  assert.deepEqual(decide(), { move: null, face: 0.25, guard: NO_COVER, attack: null });
  attack = [held[0] + 0.5 * reach, 1.6, 0];
  assert.deepEqual(decide().attack.target, attack);
  // Back from another mind, it aims afresh, however near the point has stayed.
  const aimed = attack;
  attack = [aimed[0] + 0.5 * reach, 1.6, 0];
  assert.deepEqual(decide().attack.target, aimed);
  resumed = true;
  assert.deepEqual(decide().attack.target, attack);
  // A blow committed, it aims at the point itself, step by step, and holds it again before the next.
  resumed = false;
  let aim = attack;
  for (const [now, followed] of [["approach", false], ["place", false], ["settle", false], ["chamber", true], ["swing", true], [null, false]]) {
    phase = now;
    attack = [attack[0] + 0.1 * reach, 1.6, 0];
    if (followed) aim = attack;
    assert.deepEqual(decide().attack.target, aim, `${now}`);
  }
});
