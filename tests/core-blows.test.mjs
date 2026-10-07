/**
 * **Blows between bodies** (`src/core/rules/blows.ts`): any two segments of two sides that the
 * solver pushed on each other have met in a blow, priced by the rulebook from the masses the
 * contact meets and the closing speed the step before. Its record is two sides, the surfaces that
 * met, each with the share of the energy its compliance gives it and the wound that share made;
 * an item that states no surface is rigid and takes none. Two balls, weightless, meet through
 * their centres, so the masses the contact meets are the bodies' own; a ball held beside the hand
 * is named when it is the one that touched; then a Warrior with a club takes a skeleton's head off
 * (Node core stand, Rapier, 120 Hz).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Scene } from "@babylonjs/core/scene.js";
import { createBody, SERVO_SECONDS } from "../src/core/body.ts";
import { buildBody } from "../src/core/build/build-body.ts";
import { armed } from "../src/core/human/grip.ts";
import { modelSpec } from "../src/core/models.ts";
import { woodenClub } from "../src/core/items/club.ts";
import { GUARD_ACTION, standIntent } from "../src/core/mind/intent.ts";
import { driveBy } from "../src/core/mind/tactics.ts";
import { impactEnergy, reducedMass } from "../src/core/rules/impact.ts";
import { isClash, watchBlows, woundedIn } from "../src/core/rules/blows.ts";
import { createPool } from "../src/core/rules/pool.ts";
import { blowDamage, rulebook } from "../src/core/rules/rulebook.ts";
import { createWorld } from "../src/core/world.ts";
import { ITEM, ITEM_KG, lone } from "./fixtures/lone.mjs";
import { freshEngine } from "./harness/core-stand.mjs";

const RULES = rulebook("dungeon");
/** The fist's surface and the struck body's, N/m: the fist the softer, so the more of a blow is its own. */
const FIST_K = 100e3, STRUCK_K = 300e3;
/** What a surface of `own` takes of a blow against one of `other`: its compliance over the two. */
const shareOf = (own, other) => (1 / own) / (1 / own + 1 / other);
const FIST_SHARE = shareOf(FIST_K, STRUCK_K), STRUCK_SHARE = shareOf(STRUCK_K, FIST_K);

/**
 * Two lone bodies, weightless, 0.5 m apart along z: a fist at the origin, its ball named
 * `striking`, and what it meets, its ball named `struck`, `right` metres to the fist's right and
 * `up` over it. The watch is given the fist first, or the target with `targetFirst`; with
 * `bystander`, a third body of that side, 5 m off, is given to it too, at that place in its list.
 */
async function pair({ striking = "hand.right", struck = "trunk", sides = ["party", "enemy"], fistKg = 1, struckKg = 3, right = 0, up = 0,
  targetFirst = false, bystander = null, fist: fistOptions = {}, target: targetOptions = {} } = {}) {
  const scene = new Scene(new NullEngine());
  const world = createWorld(scene, await freshEngine(), { gravity: false });
  const make = (id, spec, x, y, z, side) => ({ id, side, built: buildBody(spec, world, { position: [x, y, z] }), pool: createPool(spec, RULES) });
  const fist = make("fist", lone("fist", striking, fistKg, { stiffness: FIST_K, ...fistOptions }), 0, 1, 0, sides[0]);
  const target = make("target", lone("target", struck, struckKg, { stiffness: STRUCK_K, ...targetOptions }), right, 1 + up, 0.5, sides[1]);
  const heard = [];
  const given = targetFirst ? [target, fist] : [fist, target];
  if (bystander) given.splice(bystander.at, 0, make("bystander", lone("bystander", "trunk", 1, { stiffness: STRUCK_K }), 5, 1, 0, bystander.side));
  const watch = watchBlows(world, given, RULES, (blow) => heard.push(blow));
  const { body: hand, node, rigid } = fist.built.segments.get(striking);
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
/** The two sides of a bare fist on a bare body, each wounded by its share. */
const BARE = [["fist", "hand.right", null, FIST_SHARE, (hp) => took("hand.right", hp)], ["target", "trunk", null, STRUCK_SHARE, (hp) => took("trunk", hp)]];

test("a fist sent into a body wounds both, each by its share", async () => {
  assert.ok(Math.abs(FIST_SHARE - 0.75) < 1e-15 && STRUCK_SHARE === 0.25, `${FIST_SHARE}, ${STRUCK_SHARE}`);
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
    // The softer fist takes three quarters and the body a quarter: the record whole.
    assert.deepEqual(blow, recordOf(blow, BARE));
    assert.equal(by.damage, blowDamage(RULES, "blunt", FIST_SHARE * blow.energy));
    assert.equal(on.damage, blowDamage(RULES, "blunt", STRUCK_SHARE * blow.energy));
    const whole = blowDamage(RULES, "blunt", blow.energy);
    assert.ok(Math.abs(by.damage + on.damage - whole) < 1e-15 && by.damage > 2.9 * on.damage, `${by.damage} + ${on.damage} of ${whole}`);
    assert.ok(Math.abs(p.fist.pool.hp("hand.right") - (1 - by.damage)) < 1e-12, "the fist lost its share's hit points");
    assert.ok(Math.abs(p.target.pool.hp("trunk") - (1 - on.damage)) < 1e-12, "the struck part lost its share's");
    assert.equal(isClash(blow), false);
    assert.deepEqual(woundedIn(blow), [by, on]);
  } finally { p.dispose(); }
});

test("a blow that ends the first side's fight still wounds the second", async () => {
  // The fist holds less than its share of its own punch: its pool is spent by it.
  const p = await pair({ fist: { hp: 0.01, whole: ["hand.right"] } });
  try {
    p.send(6);
    p.world.step(60);
    const [blow] = p.watch.blows;
    assert.equal(p.watch.blows.length, 1);
    assert.equal(p.fist.pool.ending(), "exhausted");
    const spent = blow.sides[0].damage - 0.01;
    assert.deepEqual(blow, recordOf(blow, [
      ["fist", "hand.right", null, FIST_SHARE, () => ({ taken: [{ part: "hand.right", hp: 0.01 }], severed: [], lost: 0, spent, ending: "exhausted" })],
      ["target", "trunk", null, STRUCK_SHARE, (hp) => took("trunk", hp)]]));
    assert.ok(blow.sides[1].damage > 0 && p.target.pool.hp("trunk") < 1);
  } finally { p.dispose(); }
});

test("two bare hands that meet share the blow, a half each where they are as stiff", async () => {
  const p = await pair({ struck: "hand.left", target: { stiffness: FIST_K } });
  try {
    p.send(6);
    p.world.step(60);
    const [blow] = p.watch.blows;
    assert.equal(p.watch.blows.length, 1, "one meeting, one blow");
    assert.deepEqual(blow, recordOf(blow, [["fist", "hand.right", null, 0.5, (hp) => took("hand.right", hp)], ["target", "hand.left", null, 0.5, (hp) => took("hand.left", hp)]]));
    assert.ok(blow.sides[0].damage > 0 && blow.sides[0].damage === blow.sides[1].damage);
    assert.equal(isClash(blow), false);
  } finally { p.dispose(); }
});

test("a blunt blow that empties a part takes it off only past empty by the rulebook's margin", async () => {
  const energy = reducedMass(1, 3) * 36 / 2;
  // Either side's part, by its own share: emptied, and short of the margin by a tenth of it; then past it by as much.
  for (const [who, part, share] of [["target", "trunk", STRUCK_SHARE], ["fist", "hand.right", FIST_SHARE]]) {
    const damage = blowDamage(RULES, "blunt", share * energy);
    for (const [hp, off] of [[damage / (1 + 0.9 * RULES.severMargin.value), false], [damage / (1 + 1.1 * RULES.severMargin.value), true]]) {
      const p = await pair({ [who]: { hp } });
      try {
        p.send(6);
        p.world.step(60);
        const side = p.watch.blows[0].sides.find((one) => one.fighter === who);
        assert.ok(Math.abs(side.damage - damage) < 1e-9 * damage, `${side.damage} HP`);
        assert.deepEqual([side.wound.severed, p[who].pool.attached(part)], off ? [[part], false] : [[], true], `${who}, ${hp} HP`);
      } finally { p.dispose(); }
    }
  }
});

test("a fist pressed on lands once, and lands again only after it has left", async () => {
  const p = await pair({ struckKg: 1000 });
  try {
    p.send(3);
    // Held against the heavy body: pushed on at every step.
    const press = p.world.beforeStep(() => p.hand.applyImpulse(new Vector3(0, 0, 0.05), p.centre()));
    p.world.step(120);
    press.dispose();
    assert.equal(p.watch.blows.length, 1, "pressed for a second, one blow");
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

test("a touch lands once for the two bodies, read from the one the watch was given first", async () => {
  for (const targetFirst of [false, true]) {
    const p = await pair({ targetFirst });
    try {
      p.send(6);
      p.world.step(60);
      const [blow] = p.watch.blows;
      assert.equal(p.watch.blows.length, 1, `${targetFirst}: ${JSON.stringify(p.watch.blows)}`);
      // The first side is the first given, and the normal runs out of it into the second.
      assert.deepEqual(blow, recordOf(blow, targetFirst ? [BARE[1], BARE[0]] : BARE));
      assert.ok(Math.hypot(blow.normal[0], blow.normal[1], blow.normal[2] - (targetFirst ? -1 : 1)) < 1e-3, `${blow.normal}`);
      assert.ok(Math.abs(blow.closing - 6) < 1e-6, `${blow.closing} m/s`);
    } finally { p.dispose(); }
  }
});

test("a touch is read wherever its two fighters stand in the watch's list", async () => {
  // A third fighter of either side before, between or after the two: the fist's blow lands once, its sides in the order given.
  for (const side of ["party", "enemy"]) for (const at of [0, 1, 2]) for (const targetFirst of [false, true]) {
    const p = await pair({ targetFirst, bystander: { side, at } });
    try {
      p.send(6);
      p.world.step(60);
      assert.deepEqual(p.watch.blows.map((blow) => blow.sides.map((one) => one.fighter)), [targetFirst ? ["target", "fist"] : ["fist", "target"]], `a bystander of the ${side}'s at ${at}, the target ${targetFirst ? "first" : "second"}`);
    } finally { p.dispose(); }
  }
});

test("any two segments that meet have met in a blow", async () => {
  for (const [striking, struck] of [["foot.left", "thigh.right"], ["head", "upperTrunk"], ["forearm.left", "forearm.right"]]) {
    const p = await pair({ striking, struck });
    try {
      p.send(6);
      p.world.step(60);
      const [blow] = p.watch.blows;
      assert.equal(p.watch.blows.length, 1, `${striking} into ${struck}`);
      assert.deepEqual(blow, recordOf(blow, [["fist", striking, null, FIST_SHARE, (hp) => took(striking, hp)], ["target", struck, null, STRUCK_SHARE, (hp) => took(struck, hp)]]));
    } finally { p.dispose(); }
  }
});

test("a body of the same side, a fighter whose fight has ended and a part that has come off neither wound nor are wounded", async () => {
  /** The blows the fist's hand and the target's trunk met in: a spare ball under either may be met besides. */
  const met = (p) => p.watch.blows.filter((blow) => blow.sides[0].segment === "hand.right" && blow.sides[1].segment === "trunk");
  // Every fixture here lands a blow as it stands, so a silence below is the rule's.
  for (const options of [{}, { fist: { whole: ["hand.right"] } }, { target: { whole: ["trunk"] } }, { fist: { spare: true } }, { target: { spare: true } }]) {
    const control = await pair(options);
    try {
      control.send(6);
      control.world.step(60);
      assert.equal(met(control).length, 1, JSON.stringify(options));
    } finally { control.dispose(); }
  }
  const same = await pair({ sides: ["party", "party"] });
  try {
    same.send(6);
    same.world.step(60);
    assert.deepEqual(same.watch.blows, []);
    assert.deepEqual([same.fist.pool.hp("hand.right"), same.target.pool.hp("trunk")], [1, 1]);
  } finally { same.dispose(); }
  // Each wounded one way only: [the fist's fight on, its hand on, the target's fight on, its part on]. A
  // part's 0.5 HP taken off just past the margin leaves the spare ball the excess and some over.
  const off = 0.5 * (1 + RULES.severMargin.value) + 0.05;
  for (const [what, options, who, name, damage, state] of [
    ["the fist's fight ended", { fist: { whole: ["hand.right"] } }, "fist", "hand.right", 2, [false, true, true, true]],
    ["the target's fight ended", { target: { whole: ["trunk"] } }, "target", "trunk", 2, [true, true, false, true]],
    ["the fist's hand off", { fist: { spare: true } }, "fist", "hand.right", off, [true, false, true, true]],
    ["the target's part off", { target: { spare: true } }, "target", "trunk", off, [true, true, true, false]],
  ]) {
    const p = await pair(options);
    try {
      p[who].pool.wound({ part: name, damage, clean: false });
      assert.deepEqual([p.fist.pool.ending() === null, p.fist.pool.attached("hand.right"),
        p.target.pool.ending() === null, p.target.pool.attached("trunk")], state, what);
      const before = [p.fist.pool.attachedHp(), p.target.pool.attachedHp()];
      p.send(6);
      p.world.step(60);
      assert.deepEqual(met(p), [], what);
      // With the trunk off, the fist goes on to the spare ball under it, which is another meeting: no blow names the trunk.
      const others = what === "the target's part off" ? p.watch.blows.filter((blow) => blow.sides[1].segment === "spare") : [];
      assert.deepEqual(p.watch.blows, others, what);
      if (others.length === 0) assert.deepEqual([p.fist.pool.attachedHp(), p.target.pool.attachedHp()], before, what);
    } finally { p.dispose(); }
  }
});

test("a fighter whose fight a blow has ended meets in no other in that step", async () => {
  // The target's two balls stand one on the other, and the fist comes in level with where they meet: it touches both in one step.
  for (const [hp, blows] of [[1, 2], [0.001, 1]]) {
    const p = await pair({ up: 0.05, fist: { hp, whole: ["hand.right"] }, target: { spare: true } });
    try {
      p.send(6);
      p.world.step(60);
      assert.equal(p.watch.blows.length, blows, `${hp} HP: ${JSON.stringify(p.watch.blows.map((b) => [b.time, b.sides[1].segment]))}`);
      assert.equal(new Set(p.watch.blows.map((b) => b.time)).size, 1, "in one step");
      assert.equal(p.fist.pool.ending(), hp < 1 ? "exhausted" : null);
    } finally { p.dispose(); }
  }
});

test("what an item strikes takes the whole blow, and what the hand that holds it strikes shares it", async () => {
  // The hand holds a ball 0.3 m to its right. What it strikes stands ahead of the one or the other.
  for (const [right, sides] of [
    [0.3, [["fist", "hand.right", ITEM, 0, none], ["target", "trunk", null, 1, (hp) => took("trunk", hp)]]],
    [0, BARE],
  ]) {
    const p = await pair({ right, fist: { held: 0.3 } });
    try {
      p.send(6);
      p.world.step(60);
      const [blow] = p.watch.blows;
      assert.equal(p.watch.blows.length, 1, JSON.stringify(p.watch.blows));
      assert.deepEqual(blow, recordOf(blow, sides));
      assert.ok(blow.sides[1].damage > 0 && blow.closing > 5, `${blow.sides[1].damage} HP at ${blow.closing} m/s`);
      assert.equal(p.fist.pool.hp("hand.right") === 1, right > 0, "the holder of what struck is not wounded");
      // A blow one side took none of is no clash: the other was wounded.
      assert.deepEqual([isClash(blow), woundedIn(blow).map((side) => side.fighter)], [false, right > 0 ? ["target"] : ["fist", "target"]]);
    } finally { p.dispose(); }
  }
});

test("an item that states a surface shares the blow by it, and its holder is wounded by its share", async () => {
  const p = await pair({ right: 0.3, fist: { held: 0.3, itemStiffness: STRUCK_K } });
  try {
    p.send(6);
    p.world.step(60);
    const [blow] = p.watch.blows;
    assert.deepEqual(blow, recordOf(blow, [["fist", "hand.right", ITEM, 0.5, (hp) => took("hand.right", hp)], ["target", "trunk", null, 0.5, (hp) => took("trunk", hp)]]));
  } finally { p.dispose(); }
});

test("two items meeting wound nobody", async () => {
  // Each hand holds its ball toward the other's side: the two held balls stand in line, and the hands apart.
  const p = await pair({ struck: "hand.left", right: 0.6, fist: { held: 0.3 }, target: { held: -0.3 } });
  try {
    p.send(6);
    p.world.step(60);
    const [blow] = p.watch.blows;
    assert.equal(p.watch.blows.length, 1, JSON.stringify(p.watch.blows));
    assert.deepEqual(blow, recordOf(blow, [["fist", "hand.right", ITEM, 0, none], ["target", "hand.left", ITEM, 0, none]]));
    assert.ok(blow.energy > 0 && isClash(blow) && woundedIn(blow).length === 0);
    assert.deepEqual([p.fist.pool.hp("hand.right"), p.target.pool.hp("hand.left")], [1, 1]);
  } finally { p.dispose(); }
});

test("a bare hand that meets an item takes the whole blow", async () => {
  // The target holds its ball ahead of the fist, and stands aside itself.
  const p = await pair({ struck: "hand.left", right: 0.3, target: { held: -0.3 } });
  try {
    p.send(6);
    p.world.step(60);
    const [blow] = p.watch.blows;
    assert.equal(p.watch.blows.length, 1, JSON.stringify(p.watch.blows));
    assert.deepEqual(blow, recordOf(blow, [["fist", "hand.right", null, 1, (hp) => took("hand.right", hp)], ["target", "hand.left", ITEM, 0, none]]));
    assert.ok(blow.sides[0].damage > 0 && p.target.pool.hp("hand.left") === 1);
  } finally { p.dispose(); }
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
      // The surface is the shape's that was named: the hand's own shares the blow, the held ball takes none.
      assert.deepEqual(blow.sides.map((side) => side.share), item === null ? [FIST_SHARE, STRUCK_SHARE] : [0, 1]);
    } finally { p.dispose(); }
  }
});

test("a fighter with a segment that states no surface in N/m is refused", async () => {
  for (const [who, options] of [["fist", { stiffness: null }], ["target", { stiffness: null }], ["fist", { stiffness: 100, unit: "N/mm" }], ["target", { spare: true, stiffness: null }]]) {
    await assert.rejects(() => pair({ [who]: options }), new RegExp(`${who}'s (hand\\.right|trunk|spare) states no surface in N/m`), JSON.stringify(options));
  }
  // An item's stated surface is held to the same; one that states none is rigid.
  await assert.rejects(() => pair({ fist: { held: 0.3, itemStiffness: 100, itemUnit: "N/mm" } }), new RegExp("fist's hand\\.right states no surface in N/m"));
  await assert.rejects(() => pair({ fist: { held: 0.3, itemStiffness: NaN } }), /stiffness|finite/);
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
  // Built 1.7 m ahead: from 1.4 and 1.5 m the blow at the head lands on the upper trunk.
  const skeleton = make("skeleton", modelSpec("crypt-skeleton"), 1.7, "enemy");
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
    // The club is rigid: its side takes none of it, the head's all. The record whole, with the wound the pool gave.
    assert.deepEqual(blow, recordOf(blow, [["warrior", "hand.right", "wooden club", 0, none], ["skeleton", "head", null, 1, () => blow.sides[1].wound]]));
    assert.ok(blow.closing > 10 && blow.energy > 50, `${blow.closing} m/s, ${blow.energy} J`);
    assert.equal(skeleton.pool.ending(), blow.sides[1].wound.ending);
    assert.notEqual(skeleton.pool.ending(), null, "the fight ended");
    assert.equal(warrior.pool.bar(), 1, "the club's holder is whole");
    watch.dispose();
  } finally { warrior.body.dispose(); skeleton.body.dispose(); world.dispose(); scene.dispose(); }
});
