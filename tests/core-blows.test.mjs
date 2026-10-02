/**
 * **Blows between bodies** (`src/core/rules/blows.ts`): a hand the solver pushed on another side's
 * body has landed a blow there, priced by the rulebook from the masses the contact meets and the
 * closing speed the step before. Its record is two sides, the surfaces that met, each with its
 * share of the energy: the struck part takes the whole and is wounded, the hand none. Two balls,
 * weightless, meet through their centres, so the masses the contact meets are the bodies' own; a
 * ball held beside the hand is named when it is the one that touched; then a Warrior with a club
 * takes a skeleton's head off (Node core stand, Rapier, 120 Hz).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Scene } from "@babylonjs/core/scene.js";
import { createBody, SERVO_SECONDS } from "../src/core/body.ts";
import { buildBody } from "../src/core/build/build-body.ts";
import { armed } from "../src/core/human/grip.ts";
import { modelSpec } from "../src/core/human/spec.ts";
import { woodenClub } from "../src/core/items/club.ts";
import { GUARD_ACTION, standIntent } from "../src/core/mind/intent.ts";
import { driveBy } from "../src/core/mind/tactics.ts";
import { impactEnergy, reducedMass } from "../src/core/rules/impact.ts";
import { isClash, watchBlows, woundedIn } from "../src/core/rules/blows.ts";
import { createPool } from "../src/core/rules/pool.ts";
import { blowDamage, rulebook } from "../src/core/rules/rulebook.ts";
import { sourced } from "../src/core/spec/quantity.ts";
import { createWorld } from "../src/core/world.ts";
import { freshEngine } from "./harness/core-stand.mjs";

const RULES = rulebook("dungeon");
const q = (value, unit = "m") => sourced(value, unit, "de-leva-1996", "a stand-in leaf for the blow tests");

/**
 * A body of one ball, `kg`, 5 cm in radius, named `name`, with `hp` in it and the parts `whole`
 * never come off; its centre is 5 cm over its node. `spare` pins a ball as heavy under it, its
 * parent, which keeps the body standing with the first one off. `held`, it holds an item of one
 * ball as large, `ITEM_KG`, its centre `held` metres to the first one's right.
 */
function lone(model, name, kg, { hp = 1, whole = [], spare = false, held = null } = {}) {
  const ball = (part, y) => ({ name: part, proximal: q([0, y - 0.05, 0]), distal: q([0, y + 0.05, 0]), mass: q(kg, "kg"),
    centreOfMass: q([0, y, 0]), inertia: q([0.001, 0.001, 0.001], "kg m2"), shape: { kind: "sphere", centre: q([0, y, 0]), radius: q(0.05) } });
  const free = { unloadedSpeed: q(60, "rad/s"), curvature: q(0.25, "1"), eccentricCeiling: q(1.4, "1"), eccentricSlopeRatio: q(2, "1") };
  return {
    family: "test", model, mass: q(spare ? 2 * kg : kg, "kg"), stature: q(spare ? 0.2 : 0.1),
    segments: spare ? [ball("spare", -0.1), ball(name, 0)] : [ball(name, 0)],
    joints: spare ? [{ name: "pin", parent: "spare", child: name, centre: q([0, -0.05, 0]),
      dofs: [{ positive: "flexion", negative: "extension", axis: q([0, 0, 1], "1"), min: q(-3, "rad"), max: q(3, "rad"),
        muscle: { peakPositive: q(1, "N m"), peakNegative: q(1, "N m"), speedPositive: free, speedNegative: free } }] }] : [],
    wounds: { hp: q(hp, "HP"), vital: [], whole }, attributes: { balance: q(0, "%") },
    ...(held === null ? {} : { held: [{
      segment: name, origin: q([held, 0, 0]), along: q([0, 1, 0], "1"), across: q([1, 0, 0], "1"),
      item: { name: ITEM, mass: q(ITEM_KG, "kg"), centreOfMass: q([0, 0, 0]), inertia: q([0.0001, 0.0001, 0.0001], "kg m2"),
        shapes: [{ kind: "sphere", centre: q([0, 0, 0]), radius: q(0.05) }], points: {} },
    }] }),
  };
}
const ITEM = "held ball", ITEM_KG = 0.2;

/** Two lone bodies, weightless, 0.5 m apart along z: a fist at the origin and what it strikes, `right` metres to the fist's right. */
async function pair({ struck = "trunk", sides = ["party", "enemy"], fistKg = 1, struckKg = 3, right = 0, fist: fistOptions = {}, target: targetOptions = {} } = {}) {
  const scene = new Scene(new NullEngine());
  const world = createWorld(scene, await freshEngine(), { gravity: false });
  const make = (id, spec, x, z, side) => ({ id, side, built: buildBody(spec, world, { position: [x, 1, z] }), pool: createPool(spec, RULES) });
  const fist = make("fist", lone("fist", "hand.right", fistKg, fistOptions), 0, 0, sides[0]);
  const target = make("target", lone("target", struck, struckKg, targetOptions), right, 0.5, sides[1]);
  const heard = [];
  const watch = watchBlows(world, [fist, target], RULES, (blow) => heard.push(blow));
  const { body: hand, node, rigid } = fist.built.segments.get("hand.right");
  /** The fist's centre of mass, world, with what it holds: its node is at its lower end, and it has not turned. */
  const centre = () => node.position.add(new Vector3(rigid.centre[0], rigid.centre[1] + 0.05, rigid.centre[2]));
  /** Send the fist toward the target at `speed`, m/s, through its centre. */
  const send = (speed) => {
    const v = hand.linearVelocityToRef(new Vector3());
    hand.applyImpulse(new Vector3(0, 0, (speed - v.z) * rigid.mass), centre());
  };
  return { world, fist, target, watch, heard, hand, send, centre, dispose: () => { watch.dispose(); world.dispose(); scene.dispose(); } };
}

/** A wound that took `hp` from `part` and nothing else. */
const took = (part, hp) => ({ taken: [{ part, hp }], severed: [], lost: 0, spent: 0, ending: null });
/**
 * `blow`'s record whole, from what it read (when, where, how fast, the masses met) and what the
 * rule makes of that: each of `sides` is its fighter, segment, item, share, and its wound given its damage.
 */
function recordOf(blow, sides) {
  const energy = impactEnergy(blow.sides[0].kg, blow.sides[1].kg, blow.closing);
  return {
    time: blow.time, point: blow.point, normal: blow.normal, closing: blow.closing, energy,
    sides: sides.map(([fighter, segment, item, share, wound], k) => {
      const damage = share > 0 ? blowDamage(RULES, "blunt", share * energy) : 0;
      return { fighter, segment, item, kg: blow.sides[k].kg, share, damage, wound: wound(damage) };
    }),
  };
}
const none = () => null;

test("a fist sent into a body lands one blow, priced from the two masses and the closing speed", async () => {
  const p = await pair();
  try {
    p.send(6);
    p.world.step(60);
    assert.equal(p.watch.blows.length, 1, JSON.stringify(p.watch.blows));
    assert.deepEqual(p.heard, p.watch.blows);
    const [blow] = p.watch.blows;
    const [by, on] = blow.sides;
    assert.ok(blow.time > 0 && blow.time <= p.world.time, `${blow.time} s`);
    assert.ok(Math.abs(blow.closing - 6) < 1e-6, `${blow.closing} m/s`);
    assert.ok(Math.abs(by.kg - 1) < 1e-6 && Math.abs(on.kg - 3) < 1e-6, `${by.kg}, ${on.kg} kg`);
    assert.ok(Math.hypot(blow.normal[0], blow.normal[1], blow.normal[2] - 1) < 1e-3, `${blow.normal}`);
    // On the line between the centres, between where the fist's surface and the target's were.
    assert.ok(Math.hypot(blow.point[0], blow.point[1] - 1) < 1e-3 && blow.point[2] > 0.4 && blow.point[2] < 0.5, `${blow.point}`);
    const energy = reducedMass(1, 3) * 36 / 2;
    assert.ok(Math.abs(blow.energy - energy) < 1e-6, `${blow.energy} J`);
    // The struck side takes the whole blow and the hand none: the record whole.
    assert.deepEqual(blow, recordOf(blow, [["fist", "hand.right", null, 0, none], ["target", "trunk", null, 1, (hp) => took("trunk", hp)]]));
    assert.equal(on.damage, blowDamage(RULES, "blunt", blow.energy));
    assert.ok(on.damage > 0 && Math.abs(p.target.pool.hp("trunk") - (1 - on.damage)) < 1e-12, "the struck part lost the blow's hit points");
    assert.equal(p.fist.pool.hp("hand.right"), 1, "the striker is not wounded");
    assert.equal(isClash(blow), false);
    assert.deepEqual(woundedIn(blow), [on]);
  } finally { p.dispose(); }
});

test("a blunt blow that empties a part takes it off only past empty by the rulebook's margin", async () => {
  const damage = blowDamage(RULES, "blunt", reducedMass(1, 3) * 36 / 2);
  // Emptied, and short of the margin by a tenth of it; then past it by as much.
  for (const [hp, off] of [[damage / (1 + 0.9 * RULES.severMargin.value), false], [damage / (1 + 1.1 * RULES.severMargin.value), true]]) {
    const p = await pair({ target: { hp } });
    try {
      p.send(6);
      p.world.step(60);
      const [, on] = p.watch.blows[0].sides;
      assert.ok(Math.abs(on.damage - damage) < 1e-9 * damage, `${on.damage} HP`);
      assert.deepEqual([on.wound.severed, p.target.pool.attached("trunk")], off ? [["trunk"], false] : [[], true], `${hp} HP`);
    } finally { p.dispose(); }
  }
});

test("a fist pressed on lands once, and lands again only after it has left", async () => {
  const p = await pair({ struckKg: 1000 });
  try {
    p.send(3);
    // Held against the heavy body: pushed on at every step.
    const press = p.world.beforeStep(() => p.hand.applyImpulse(new Vector3(0, 0, 0.05), p.centre()));
    p.world.step(60);
    press.dispose();
    assert.equal(p.watch.blows.length, 1, "pressed for half a second, one blow");
    p.send(-1);
    p.world.step(30);
    p.send(2);
    p.world.step(60);
    assert.equal(p.watch.blows.length, 2);
    // The heavy body drifts at a few mm/s from the first blow and the press.
    const drift = p.target.built.segments.get("trunk").body.linearVelocityToRef(new Vector3()).z;
    assert.ok(drift > 0 && Math.abs(p.watch.blows[1].closing - (2 - drift)) < 0.005, `${p.watch.blows[1].closing} m/s, the target drifting ${drift}`);
  } finally { p.dispose(); }
});

test("a body of the same side, a fallen striker or target, a hand off and a clash of hands wound nobody", async () => {
  // Every fixture here lands a blow as it stands, so a silence below is the rule's.
  for (const options of [{}, { fist: { whole: ["hand.right"] } }, { target: { whole: ["trunk"] } }, { fist: { spare: true } }]) {
    const control = await pair(options);
    try {
      control.send(6);
      control.world.step(60);
      assert.equal(control.watch.blows.length, 1, JSON.stringify(options));
    } finally { control.dispose(); }
  }
  const same = await pair({ sides: ["party", "party"] });
  try {
    same.send(6);
    same.world.step(60);
    assert.deepEqual(same.watch.blows, []);
    assert.equal(same.target.pool.hp("trunk"), 1);
  } finally { same.dispose(); }
  // Each wounded one way only: [fist standing, its hand on, target standing, its part on]. The
  // hand's 0.5 HP taken off just past the margin leaves the spare ball the excess and some over.
  for (const [what, options, who, name, damage, state] of [
    ["the fist fallen", { fist: { whole: ["hand.right"] } }, "fist", "hand.right", 2, [false, true, true, true]],
    ["the target fallen", { target: { whole: ["trunk"] } }, "target", "trunk", 2, [true, true, false, true]],
    ["the hand off", { fist: { spare: true } }, "fist", "hand.right", 0.5 * (1 + RULES.severMargin.value) + 0.05, [true, false, true, true]],
  ]) {
    const p = await pair(options);
    try {
      p[who].pool.wound({ part: name, damage, clean: false });
      assert.deepEqual([p.fist.pool.ending() === null, p.fist.pool.attached("hand.right"),
        p.target.pool.ending() === null, p.target.pool.attached("trunk")], state, what);
      p.send(6);
      p.world.step(60);
      assert.deepEqual(p.watch.blows, [], what);
    } finally { p.dispose(); }
  }
  const clash = await pair({ struck: "hand.left" });
  try {
    clash.send(6);
    clash.world.step(60);
    // Each hand met the other: a clash each way, each with its energy, and neither side took any of it.
    const [one, other] = clash.watch.blows;
    assert.equal(clash.watch.blows.length, 2);
    assert.deepEqual(one, recordOf(one, [["fist", "hand.right", null, 0, none], ["target", "hand.left", null, 0, none]]));
    assert.deepEqual(other, recordOf(other, [["target", "hand.left", null, 0, none], ["fist", "hand.right", null, 0, none]]));
    assert.ok(clash.watch.blows.every((b) => b.energy > 0 && isClash(b) && woundedIn(b).length === 0));
    assert.equal(clash.target.pool.hp("hand.left"), 1);
    assert.equal(clash.fist.pool.hp("hand.right"), 1);
  } finally { clash.dispose(); }
});

test("a_blow_names_the_item_that_touched_and_the_hand_when_it_was_the_hand", async () => {
  // The hand holds a ball 0.3 m to its right. What it strikes stands ahead of the one or the other.
  for (const [right, item] of [[0.3, ITEM], [0, null]]) {
    const p = await pair({ right, fist: { held: 0.3 } });
    try {
      p.send(6);
      p.world.step(60);
      const [blow] = p.watch.blows;
      assert.equal(p.watch.blows.length, 1, JSON.stringify(p.watch.blows));
      assert.deepEqual(blow, recordOf(blow, [["fist", "hand.right", item, 0, none], ["target", "trunk", null, 1, (hp) => took("trunk", hp)]]));
      assert.ok(blow.sides[1].damage > 0 && blow.closing > 5, `${blow.sides[1].damage} HP at ${blow.closing} m/s`);
    } finally { p.dispose(); }
  }
});

test("of two shapes that touched, a blow names the one the solver pushed on harder", async () => {
  // The held ball's centre is 8 cm to the hand's right: what stands ahead and `right` of the hand meets both.
  for (const [right, item] of [[0.03, null], [0.06, ITEM]]) {
    const p = await pair({ right, fist: { held: 0.08 } });
    try {
      p.send(6);
      let touched = [];
      for (let i = 0; i < 60 && p.watch.blows.length === 0; i++) {
        p.world.step();
        touched = p.world.physics.contactsOf(p.hand);
      }
      const [blow] = p.watch.blows;
      assert.deepEqual(touched.map((contact) => contact.pairs.map(({ mine, theirs }) => [mine, theirs])), [[[0, 0], [1, 0]]], "the hand's ball and the held one both touched");
      const [own, held] = touched[0].pairs;
      assert.equal(held.impulse > own.impulse, item !== null, `${own.impulse} N s on the hand's ball, ${held.impulse} on the held one`);
      assert.equal(blow.sides[0].item, item);
    } finally { p.dispose(); }
  }
});

test("a Warrior's club blow at a skeleton's head lands there and ends the fight", async () => {
  const scene = new Scene(new NullEngine());
  const world = createWorld(scene, await freshEngine());
  world.physics.addFixedBox([0, -0.5, 0], [20, 1, 20]);
  const make = (id, spec, z, side) => {
    const built = buildBody(spec, world, { position: [0, 0, z] });
    return { id, side, built, body: createBody(built, world, { servoSeconds: SERVO_SECONDS }), pool: createPool(spec, RULES) };
  };
  const warrior = make("warrior", armed(modelSpec("workshop-fighter"), "right", woodenClub()), 0, "party");
  const skeleton = make("skeleton", modelSpec("crypt-skeleton"), 1.4, "enemy");
  try {
    driveBy(warrior.body, { name: "attack", decide: ({ report }) => {
      const h = skeleton.body.view.head;
      const right = report.strike.thrown.right > 0 ? GUARD_ACTION : { kind: "attack", target: [h.x, h.y, h.z] };
      return { move: null, face: 0, hands: { left: GUARD_ACTION, right } };
    } });
    driveBy(skeleton.body, { name: "stand", decide: () => standIntent(0) });
    const watch = watchBlows(world, [warrior, skeleton], RULES);
    for (let i = 0; i < 8 * world.hz && skeleton.pool.ending() === null; i++) world.step();
    const blow = watch.blows.at(-1);
    assert.ok(blow, "a blow landed");
    // The club's side takes none of it, the head's all: the record whole, with the wound the pool gave.
    assert.deepEqual(blow, recordOf(blow, [["warrior", "hand.right", "wooden club", 0, none], ["skeleton", "head", null, 1, () => blow.sides[1].wound]]));
    assert.ok(blow.closing > 10 && blow.energy > 50, `${blow.closing} m/s, ${blow.energy} J`);
    assert.equal(skeleton.pool.ending(), blow.sides[1].wound.ending);
    assert.notEqual(skeleton.pool.ending(), null, "the fight ended");
    watch.dispose();
  } finally { warrior.body.dispose(); skeleton.body.dispose(); world.dispose(); scene.dispose(); }
});
