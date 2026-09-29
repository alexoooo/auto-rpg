/**
 * **The core's rules** (`src/core/rules/`): the rulebook, and one pool of hit points per body with
 * its overflow, severing and endings, on the real humans' specs.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { humanSpec } from "../src/core/human/spec.ts";
import { impactEnergy } from "../src/core/rules/impact.ts";
import { createPool, partHitPoints } from "../src/core/rules/pool.ts";
import { rulebook } from "../src/core/rules/rulebook.ts";
import { sourced } from "../src/core/spec/quantity.ts";
import { specProvenanceFaults } from "./fixtures/spec.mjs";

const warrior = humanSpec("workshop-fighter"), rogue = humanSpec("workshop-rogue");
const RULES = rulebook("arena");
const close = (a, b, what) => assert.ok(Math.abs(a - b) < 1e-9, `${what}: ${a} against ${b}`);
const hitPoints = (spec) => new Map([...partHitPoints(spec)].map(([name, q]) => [name, q.value]));

test("the rulebook says where each number came from, is frozen, and an override makes a new one", () => {
  for (const mode of ["arena", "dungeon"]) {
    const rules = rulebook(mode);
    assert.deepEqual(specProvenanceFaults(rules), []);
    assert.ok(Object.isFrozen(rules));
    assert.equal(rules.mode, mode);
  }
  const loose = rulebook("arena", { severMargin: sourced(1, "1", "owner-hp-pool", "an experiment") });
  assert.equal(loose.severMargin.value, 1);
  assert.equal(rulebook("arena").severMargin.value, 0.5);
  assert.throws(() => rulebook("siege"));
});

test("a human's hit points are the owner's, split over its segments by cross-section, with provenance", () => {
  for (const [spec, total] of [[warrior, 6], [rogue, 4]]) {
    assert.deepEqual(specProvenanceFaults(spec), []);
    const shares = partHitPoints(spec);
    assert.deepEqual(specProvenanceFaults(Object.fromEntries(shares)), []);
    assert.equal(spec.wounds.hp.value, total);
    close([...shares.values()].reduce((sum, q) => sum + q.value, 0), total, `${spec.model} parts sum`);
    // By hand: a part's mass to the two-thirds over the body's sum of the same.
    const sum = spec.segments.reduce((s, g) => s + g.mass.value ** (2 / 3), 0);
    for (const g of spec.segments) close(shares.get(g.name).value, total * g.mass.value ** (2 / 3) / sum, `${spec.model} ${g.name}`);
  }
  const w = hitPoints(warrior);
  assert.equal(w.get("head").toFixed(2), "0.45");
  assert.equal(w.get("hand.right").toFixed(2), "0.09");
  assert.equal(w.get("thigh.left").toFixed(2), "0.72");
  assert.equal(w.get("hand.left"), w.get("hand.right"));
});

test("a blow within a part's hit points stays in it; blows on a severed part or of no damage do nothing", () => {
  const pool = createPool(warrior, RULES), max = hitPoints(warrior);
  const wound = pool.wound({ part: "thigh.left", damage: 0.3, clean: true });
  assert.deepEqual(wound, { taken: [{ part: "thigh.left", hp: 0.3 }], severed: [], lost: 0, spent: 0, ending: null });
  close(pool.hp("thigh.left"), max.get("thigh.left") - 0.3, "thigh left");
  close(pool.attachedHp(), 5.7, "attached");
  close(pool.bar(), 5.7 / 6, "bar");
  for (const damage of [0, -1, Number.NaN]) {
    assert.deepEqual(pool.wound({ part: "shank.left", damage, clean: true }), { taken: [], severed: [], lost: 0, spent: 0, ending: null });
  }
  assert.throws(() => pool.wound({ part: "tail", damage: 1, clean: false }));
});

test("the excess walks the attached parts nearest first, inward before outward", () => {
  const max = hitPoints(warrior);
  // Struck on the middle trunk, which never comes off, past it and its parent: the rest goes to
  // its child, the upper trunk, before anything beyond the parent.
  const pool = createPool(warrior, RULES);
  const wound = pool.wound({ part: "middleTrunk", damage: max.get("middleTrunk") + max.get("lowerTrunk") + 0.01, clean: true });
  assert.deepEqual(wound.taken.map((t) => t.part), ["middleTrunk", "lowerTrunk", "upperTrunk"]);
  close(wound.taken[2].hp, 0.01, "upper trunk");
  assert.deepEqual(wound.severed, []);
  assert.equal(wound.ending, null);
  // Enough to empty the next ring too: the thighs (beyond the lower trunk) before the head (beyond
  // the upper), in the spec's order.
  const next = createPool(warrior, RULES);
  const ring = ["middleTrunk", "lowerTrunk", "upperTrunk"].reduce((s, p) => s + max.get(p), 0);
  const deep = next.wound({ part: "middleTrunk", damage: ring + max.get("thigh.left") + 0.01, clean: false });
  assert.deepEqual(deep.taken.map((t) => t.part), ["middleTrunk", "lowerTrunk", "upperTrunk", "thigh.left", "thigh.right"]);
  close(next.hp("head"), max.get("head"), "head untouched");
});

test("a part comes off when a clean blow empties it, or any blow goes past empty by the margin; the trunk never does", () => {
  const max = hitPoints(warrior);
  // Clean, and just enough to empty the right forearm: it and the hand go, with the hand's hit points.
  let pool = createPool(warrior, RULES);
  let wound = pool.wound({ part: "forearm.right", damage: max.get("forearm.right"), clean: true });
  assert.deepEqual(wound.severed, ["forearm.right", "hand.right"]);
  close(wound.lost, max.get("hand.right"), "lost");
  assert.equal(pool.attached("hand.right"), false);
  close(pool.attachedHp(), 6 - max.get("forearm.right") - max.get("hand.right"), "attached");
  assert.equal(wound.ending, null);
  // A blow on a part that is gone does nothing.
  assert.deepEqual(pool.wound({ part: "hand.right", damage: 3, clean: true }).taken, []);
  // Off at the shoulder, the whole arm's hit points leave.
  pool = createPool(warrior, RULES);
  wound = pool.wound({ part: "upperArm.left", damage: max.get("upperArm.left"), clean: true });
  assert.deepEqual(wound.severed, ["upperArm.left", "forearm.left", "hand.left"]);
  close(wound.lost, max.get("forearm.left") + max.get("hand.left"), "an arm lost");

  // Not clean: it stays on until the blow goes past empty by half its hit points.
  for (const [past, off] of [[0.49, false], [0.5, true]]) {
    pool = createPool(warrior, RULES);
    wound = pool.wound({ part: "forearm.left", damage: max.get("forearm.left") * (1 + past), clean: false });
    assert.equal(wound.severed.length > 0, off, `past empty by ${past}`);
    // What was past empty walks on: to the upper arm, the forearm's parent.
    assert.equal(wound.taken[1].part, "upperArm.left");
    // Kept on, the hand beyond it is still there to take a later blow's overflow.
    assert.equal(pool.attached("hand.left"), !off);
  }
  // A part emptied earlier comes off to a later blow past the margin.
  pool = createPool(warrior, RULES);
  pool.wound({ part: "shank.left", damage: max.get("shank.left"), clean: false });
  assert.equal(pool.attached("foot.left"), true);
  assert.deepEqual(pool.wound({ part: "shank.left", damage: max.get("shank.left") / 2, clean: false }).severed, ["shank.left", "foot.left"]);

  // The trunk stays on under any blow.
  for (const part of ["upperTrunk", "middleTrunk", "lowerTrunk"]) {
    pool = createPool(warrior, RULES);
    assert.deepEqual(pool.wound({ part, damage: 3, clean: true }).severed, [], part);
  }
  // A looser rulebook, a looser margin.
  pool = createPool(warrior, rulebook("arena", { severMargin: sourced(1, "1", "owner-hp-pool", "an experiment") }));
  assert.deepEqual(pool.wound({ part: "forearm.left", damage: max.get("forearm.left") * 1.5, clean: false }).severed, []);
});

test("the body dies when its head is emptied or taken off, or its attached hit points are spent; the first ending stands", () => {
  const max = hitPoints(rogue);
  let pool = createPool(rogue, RULES);
  // The head emptied, not taken off (a blow that is not clean, short of the margin).
  let wound = pool.wound({ part: "head", damage: max.get("head") * 1.2, clean: false });
  assert.equal(wound.ending, "fatal");
  assert.equal(pool.attached("head"), true);
  assert.ok(pool.bar() > 0.8, `a head blow kills with the pool nearly whole: ${pool.bar()}`);
  // Later blows do not change how it ended.
  assert.equal(pool.wound({ part: "head", damage: 5, clean: true }).ending, "fatal");

  pool = createPool(rogue, RULES);
  assert.equal(pool.wound({ part: "head", damage: max.get("head"), clean: true }).ending, "severed");

  // Emptied by the overflow of a blow on the chest.
  pool = createPool(rogue, RULES);
  const chest = ["upperTrunk", "middleTrunk", "head"].reduce((s, p) => s + max.get(p), 0);
  assert.equal(pool.wound({ part: "upperTrunk", damage: chest, clean: false }).ending, "fatal");

  // Spent from the pelvis: the pool is exhausted, and the head emptied with it reads as that.
  pool = createPool(rogue, RULES);
  wound = pool.wound({ part: "lowerTrunk", damage: 4.5, clean: false });
  assert.equal(pool.attachedHp(), 0);
  assert.equal(pool.bar(), 0);
  close(wound.spent, 0.5, "spent");
  assert.equal(pool.hp("head"), 0);
  assert.equal(wound.taken.length, 16);
  assert.equal(wound.ending, "exhausted");
  // Exactly the pool, no more, from a foot (which comes off, past its margin): exhausted.
  pool = createPool(rogue, RULES);
  wound = pool.wound({ part: "foot.left", damage: 4, clean: false });
  assert.equal(pool.attachedHp(), 0);
  assert.equal(wound.ending, "exhausted");

  // With the head gone first, later spending does not change the ending.
  pool = createPool(rogue, RULES);
  pool.wound({ part: "head", damage: max.get("head"), clean: true });
  assert.equal(pool.wound({ part: "lowerTrunk", damage: 9, clean: false }).ending, "severed");
});

test("a blow's energy is its relative motion's, over the reduced mass of what each side meets", () => {
  // A 1.2 kg club meeting a 6 kg head at 20 m/s: mu = 1 kg, 200 J.
  close(impactEnergy(1.2, 6, 20), 200, 1e-12, "club on head");
  // The same the other way round: the rule does not know which side swung.
  close(impactEnergy(6, 1.2, 20), 200, 1e-12, "head on club");
  // Something nothing moves takes the striker's whole kinetic energy.
  close(impactEnergy(1.2, Infinity, 20), 240, 1e-12, "a wall");
  // A contact that is not closing is worth nothing.
  for (const v of [0, -3]) assert.equal(impactEnergy(1.2, 6, v), 0);
  for (const [m, M, v] of [[0, 6, 1], [-1, 6, 1], [Infinity, 6, 1], [1, 0, 1], [1, Number.NaN, 1], [1, 6, Number.NaN], [1, 6, Infinity]]) {
    assert.throws(() => impactEnergy(m, M, v), `${m} ${M} ${v}`);
  }
});
