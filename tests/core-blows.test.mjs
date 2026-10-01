/**
 * **Blows between bodies** (`src/core/rules/blows.ts`): a hand the solver pushed on another side's
 * body has landed a blow there, priced by the rulebook from the masses the contact meets and the
 * closing speed the step before, and wounding the struck part. Two balls, weightless, meet through
 * their centres, so the masses the contact meets are the bodies' own; then a Warrior
 * with a club takes a skeleton's head off (Node core stand, Rapier, 120 Hz).
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
import { watchBlows } from "../src/core/rules/blows.ts";
import { createPool } from "../src/core/rules/pool.ts";
import { blowDamage, rulebook } from "../src/core/rules/rulebook.ts";
import { sourced } from "../src/core/spec/quantity.ts";
import { createWorld } from "../src/core/world.ts";
import { freshEngine } from "./harness/core-stand.mjs";

const RULES = rulebook("dungeon");
const q = (value, unit = "m") => sourced(value, unit, "de-leva-1996", "a stand-in leaf for the blow tests");

/**
 * A body of one ball, `kg`, 5 cm across, named `name`, with `hp` in it and the parts `whole` never
 * come off; its centre is 5 cm over its node. `spare` pins a ball as heavy under it, its parent,
 * which keeps the body standing with the first one off.
 */
function lone(model, name, kg, { hp = 1, whole = [], spare = false } = {}) {
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
  };
}

/** Two lone bodies, weightless, 0.5 m apart along z: a fist at the origin and what it strikes. */
async function pair({ struck = "trunk", sides = ["party", "enemy"], fistKg = 1, struckKg = 3, fist: fistOptions = {}, target: targetOptions = {} } = {}) {
  const scene = new Scene(new NullEngine());
  const world = createWorld(scene, await freshEngine(), { gravity: false });
  const make = (id, spec, z, side) => ({ id, side, built: buildBody(spec, world, { position: [0, 1, z] }), pool: createPool(spec, RULES) });
  const fist = make("fist", lone("fist", "hand.right", fistKg, fistOptions), 0, sides[0]);
  const target = make("target", lone("target", struck, struckKg, targetOptions), 0.5, sides[1]);
  const heard = [];
  const watch = watchBlows(world, [fist, target], RULES, (blow) => heard.push(blow));
  const hand = fist.built.segments.get("hand.right").body;
  /** The fist's centre of mass, world: its node is at its lower end. */
  const centre = () => fist.built.segments.get("hand.right").node.position.add(new Vector3(0, 0.05, 0));
  /** Send the fist toward the target at `speed`, m/s, through its centre. */
  const send = (speed) => {
    const v = hand.linearVelocityToRef(new Vector3());
    hand.applyImpulse(new Vector3(0, 0, speed * fistKg - v.z * fistKg), centre());
  };
  return { world, fist, target, watch, heard, hand, send, centre, dispose: () => { watch.dispose(); world.dispose(); scene.dispose(); } };
}

test("a fist sent into a body lands one blow, priced from the two masses and the closing speed", async () => {
  const p = await pair();
  try {
    p.send(6);
    p.world.step(60);
    assert.equal(p.watch.blows.length, 1, JSON.stringify(p.watch.blows));
    assert.deepEqual(p.heard, p.watch.blows);
    const [blow] = p.watch.blows;
    assert.deepEqual([blow.attacker, blow.striker, blow.target, blow.part, blow.clash], ["fist", "hand.right", "target", "trunk", false]);
    assert.ok(Math.abs(blow.closing - 6) < 1e-6, `${blow.closing} m/s`);
    assert.ok(Math.abs(blow.strikerKg - 1) < 1e-6 && Math.abs(blow.struckKg - 3) < 1e-6, `${blow.strikerKg}, ${blow.struckKg} kg`);
    assert.ok(Math.hypot(blow.normal[0], blow.normal[1], blow.normal[2] - 1) < 1e-3, `${blow.normal}`);
    // On the line between the centres, between where the fist's surface and the target's were.
    assert.ok(Math.hypot(blow.point[0], blow.point[1] - 1) < 1e-3 && blow.point[2] > 0.4 && blow.point[2] < 0.5, `${blow.point}`);
    const energy = reducedMass(1, 3) * 36 / 2;
    assert.ok(Math.abs(blow.energy - energy) < 1e-6, `${blow.energy} J`);
    assert.equal(blow.energy, impactEnergy(blow.strikerKg, blow.struckKg, blow.closing));
    assert.equal(blow.damage, blowDamage(RULES, "blunt", blow.energy));
    assert.ok(Math.abs(p.target.pool.hp("trunk") - (1 - blow.damage)) < 1e-12, "the struck part lost the blow's hit points");
    assert.deepEqual(blow.wound.taken, [{ part: "trunk", hp: blow.damage }]);
    assert.equal(p.fist.pool.hp("hand.right"), 1, "the striker is not wounded");
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
      const [blow] = p.watch.blows;
      assert.ok(Math.abs(blow.damage - damage) < 1e-9 * damage, `${blow.damage} HP`);
      assert.deepEqual([blow.wound.severed, p.target.pool.attached("trunk")], off ? [["trunk"], false] : [[], true], `${hp} HP`);
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
    // Each hand met the other: a clash each way, each with its energy, and neither wounded.
    assert.deepEqual(clash.watch.blows.map((b) => [b.attacker, b.part, b.clash, b.damage, b.wound]),
      [["fist", "hand.left", true, 0, null], ["target", "hand.right", true, 0, null]]);
    assert.ok(clash.watch.blows.every((b) => b.energy > 0));
    assert.equal(clash.target.pool.hp("hand.left"), 1);
    assert.equal(clash.fist.pool.hp("hand.right"), 1);
  } finally { clash.dispose(); }
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
    assert.deepEqual([blow.attacker, blow.part], ["warrior", "head"]);
    assert.ok(blow.closing > 10 && blow.energy > 50, `${blow.closing} m/s, ${blow.energy} J`);
    assert.equal(skeleton.pool.ending(), blow.wound.ending);
    assert.notEqual(skeleton.pool.ending(), null, "the fight ended");
    watch.dispose();
  } finally { warrior.body.dispose(); skeleton.body.dispose(); world.dispose(); scene.dispose(); }
});
