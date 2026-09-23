import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";

import {
  ARMOUR_CAP,
  ATTRIBUTES,
  ATTRIBUTE_IDS,
  armourAt,
  DEFAULT_ATTRIBUTES,
  attributeOf,
  attributesRefusal,
  describeAttributes,
  resolveAttributes,
  withAttribute,
  withAttributeSetting,
  withRecovery,
} from "../src/golem/attributes.ts";
import {
  golemMatchup,
  matchupFromQuery,
  matchupQuery,
  withGolemAttribute,
  withGolemBuild,
  withGolemSlot,
  withPolicy,
} from "../src/bout.ts";
import { FAMILY_POLICY } from "../src/golem/family.ts";
import { FAMILY_SETUP } from "../src/golem/family-setup.ts";
import { randomViableOpponent } from "../src/golem/viability.ts";
import { mulberry32 } from "../src/rng.ts";
import { defaultGolemSetup, golemSetupRefusal } from "../src/golem/build.ts";
import { Golem } from "../src/golem/golem.ts";
import { idleMind } from "../src/mind.ts";
import { LOCOMOTION_BIPED } from "../src/golem/config.ts";
import { SKELETON_ARMOUR, SKELETON_BIPED } from "../src/golem/skeleton/body.ts";
import { skeletonSetup } from "../src/golem/skeleton/presets.ts";
import { flatSupportedWorldRegistry } from "../src/supported-locomotion-production.ts";
import { createHeadlessArena } from "./harness/golem-headless-arena.mjs";

/**
 * A table where two rows are live, so the range rules can be checked before any shipped row is.
 * Built by spreading the shipped table, so every id the real one has is here and nothing else is.
 */
const LIVE = Object.freeze({
  ...ATTRIBUTES,
  movement: Object.freeze({ ...ATTRIBUTES.movement, min: 0.75, max: 1.5, live: true }),
  armour: Object.freeze({ ...ATTRIBUTES.armour, min: 0.5, max: 2, live: true }),
});

const BUILD = Object.freeze({
  locomotion: "locomotion.biped",
  torso: "torso.plain",
  head: "head.plain",
  primary: { chain: "wrist", terminal: "blade" },
  secondary: { chain: "wrist", terminal: "plate" },
});

test("every stat resolves to 1 when a setup names none, and a named one overlays only itself", () => {
  const plain = resolveAttributes({});
  assert.deepEqual(plain, DEFAULT_ATTRIBUTES);
  assert.deepEqual(Object.keys(plain), [...ATTRIBUTE_IDS], "one key per stat, in table order");
  assert.ok(Object.isFrozen(plain));

  const moved = resolveAttributes({ attributes: { movement: 1.2, armour: 0.9 } });
  assert.deepEqual(moved, { ...DEFAULT_ATTRIBUTES, movement: 1.2, armour: 0.9 });
  assert.deepEqual(resolveAttributes({ attributes: {} }), DEFAULT_ATTRIBUTES);
});

test("a build context without attributes reads every stat at 1, and one with them reads its own", () => {
  assert.equal(attributeOf({}, "movement"), 1, "a bench module handed no attributes");
  const attributes = resolveAttributes({ attributes: { turning: 0.8 } });
  assert.equal(attributeOf({ attributes }, "turning"), 0.8);
  assert.equal(attributeOf({ attributes }, "movement"), 1);
});

/** The rows a session has measured and turned live. Each stat's session adds its own. */
const MEASURED = Object.freeze(["movement", "turning", "stability", "recovery", "armour", "toughness"]);

test("only a measured row is live, and every other row accepts only 1", () => {
  // Each stat's own session turns its row live. Until then a value other than 1 is a stat nothing
  // reads, and a build carrying one is refused rather than built as if it had been honoured.
  for (const id of ATTRIBUTE_IDS) {
    const row = ATTRIBUTES[id];
    assert.equal(row.live, MEASURED.includes(id), id);
    assert.equal(attributesRefusal({ [id]: 1 }), null, `${id} at 1`);
    if (row.live) {
      assert.ok(row.min < 1 && row.max > 1, `${id}'s range goes both ways from its default`);
      assert.equal(attributesRefusal({ [id]: row.min }), null, `${id} at its floor`);
      assert.equal(attributesRefusal({ [id]: row.max }), null, `${id} at its ceiling`);
      assert.match(attributesRefusal({ [id]: row.max + row.step }) ?? "", /outside/, `${id} past its ceiling`);
    } else {
      assert.match(attributesRefusal({ [id]: 1.1 }) ?? "", /not measured yet/, `${id} at 1.1`);
    }
  }
});

test("a setting is refused by shape, by name and by range, and accepted inside its row", () => {
  assert.equal(attributesRefusal(undefined, LIVE), null, "no setting at all");
  assert.equal(attributesRefusal({}, LIVE), null);
  assert.equal(attributesRefusal({ movement: 0.75, armour: 2 }, LIVE), null, "both ends are inside");

  assert.match(attributesRefusal([], LIVE) ?? "", /not a record/);
  assert.match(attributesRefusal(null, LIVE) ?? "", /not a record/);
  assert.match(attributesRefusal(1.2, LIVE) ?? "", /not a record/);
  assert.match(attributesRefusal({ speed: 1.2 }, LIVE) ?? "", /no attribute "speed"/);
  assert.match(attributesRefusal({ movement: "1.2" }, LIVE) ?? "", /not a number/);
  assert.match(attributesRefusal({ movement: Number.NaN }, LIVE) ?? "", /not a number/);
  assert.match(attributesRefusal({ movement: Infinity }, LIVE) ?? "", /not a number/);
  assert.match(attributesRefusal({ movement: 1.51 }, LIVE) ?? "", /outside x0.75 to x1.5/);
  assert.match(attributesRefusal({ movement: 0.74 }, LIVE) ?? "", /outside/);
  assert.match(attributesRefusal({ size: 1.1 }, LIVE) ?? "", /not measured yet/,
    "a row that is not live in this table still refuses");
});

test("a golem setup carrying a stat nothing reads is refused where every build is checked", () => {
  const setup = defaultGolemSetup();
  assert.equal(golemSetupRefusal(setup), null);
  assert.equal(golemSetupRefusal({ ...setup, attributes: { size: 1 } }), null);
  assert.equal(golemSetupRefusal({ ...setup, attributes: { movement: 1.2 } }), null, "a measured stat inside its range");
  assert.match(golemSetupRefusal({ ...setup, attributes: { movement: 1.6 } }) ?? "", /Movement x1.6 is outside/);
  assert.match(golemSetupRefusal({ ...setup, attributes: { size: 1.2 } }) ?? "", /Size is not measured yet/);
  assert.match(golemSetupRefusal({ ...setup, attributes: { reach: 1 } }) ?? "", /no attribute "reach"/);
});

test("the readout names only the stats moved off 1", () => {
  assert.equal(describeAttributes(DEFAULT_ATTRIBUTES), "");
  assert.equal(
    describeAttributes(resolveAttributes({ attributes: { armour: 0.9, movement: 1.2, armSpeed: 1.25 } })),
    "movement x1.20, armour x0.90, arm speed x1.25",
    "in table order, whatever order they were set in");
});

test("setting a stat stores it, setting it back to 1 deletes it, and the field goes with its last key", () => {
  const base = withGolemBuild(golemMatchup(BUILD), "left", BUILD, 7);
  const one = withGolemAttribute(base, "left", "movement", 1.2);
  assert.deepEqual(one.left.golem.attributes, { movement: 1.2 });
  assert.equal(one.right.golem.attributes, undefined, "the other corner is untouched");
  assert.equal(one.left.seed, 7, "a stat tunes the drawn body rather than drawing another");
  assert.equal(base.left.golem.attributes, undefined, "the reducer did not write into its input");

  const two = withGolemAttribute(one, "left", "armour", 0.9);
  assert.deepEqual(two.left.golem.attributes, { movement: 1.2, armour: 0.9 });
  const back = withGolemAttribute(two, "left", "movement", 1);
  assert.deepEqual(back.left.golem.attributes, { armour: 0.9 });
  const none = withGolemAttribute(back, "left", "armour", 1);
  assert.ok(!("attributes" in none.left.golem), "no empty record is left behind");
  assert.deepEqual(none, base, "a body returned to its defaults is the body that was never touched");
});

test("a stat survives every other reducer, the copy they share and the link", () => {
  let matchup = withGolemAttribute(golemMatchup(BUILD), "right", "turning", 1.1);
  matchup = withPolicy(matchup, "right", "idle");
  matchup = withGolemSlot(matchup, "right", "head", "head.ram");
  assert.deepEqual(matchup.right.golem.attributes, { turning: 1.1 }, "the copy every reducer makes kept it");
  assert.deepEqual(matchupFromQuery(matchupQuery(matchup)), matchup, "and the codec carried it");
});

test("a stat is one editor's rule: kept off 1, deleted on 1, and a setup carries the setting whole or not at all", () => {
  assert.deepEqual(withAttribute(undefined, "movement", 1.2), { movement: 1.2 });
  const two = withAttribute({ movement: 1.2 }, "armour", 0.9);
  assert.deepEqual(two, { movement: 1.2, armour: 0.9 });
  assert.deepEqual(withAttribute(two, "movement", 1), { armour: 0.9 });
  assert.deepEqual(withAttribute({ armour: 0.9 }, "armour", 1), {});

  const setup = { ...BUILD, attributes: { turning: 1.1 } };
  const tuned = withAttributeSetting(setup, two);
  assert.deepEqual(tuned, { ...BUILD, attributes: { movement: 1.2, armour: 0.9 } }, "the setting replaces, not merges");
  assert.notEqual(tuned.attributes, two, "and is copied, so a later edit to the dialog's record cannot reach it");
  assert.deepEqual(withAttributeSetting(setup, {}), BUILD, "an empty setting leaves no field");
  assert.ok(!("attributes" in withAttributeSetting(setup, undefined)), "and nor does none");
  assert.deepEqual(setup, { ...BUILD, attributes: { turning: 1.1 } }, "the input was not written");
});

test("randomize and the family buttons pick a body, not a tuning, so the corner keeps its stats", () => {
  const tuned = withGolemAttribute(withGolemBuild(golemMatchup(BUILD), "left", BUILD, 7), "left", "movement", 1.2);
  const expect = (matchup, build, seed) => ({ ...matchup.left, golem: { ...build, attributes: { movement: 1.2 } }, seed });

  // Randomize: `SetupScreen.randomize` draws an opponent for the other corner and installs it.
  const drawn = randomViableOpponent(mulberry32(11), tuned.right.golem);
  const randomized = withGolemBuild(tuned, "left", drawn, 11);
  assert.deepEqual(randomized.left, expect(tuned, drawn, 11));
  assert.deepEqual(randomized.right, tuned.right, "the other corner is untouched");

  // A family button: the family's own body, then its own policy, as `SetupScreen.onClick` does.
  for (const family of Object.keys(FAMILY_SETUP)) {
    const body = FAMILY_SETUP[family]();
    const picked = withPolicy(withGolemBuild(tuned, "left", body, 12), "left", FAMILY_POLICY[family]);
    assert.deepEqual(picked.left, { ...expect(tuned, body, 12), policy: FAMILY_POLICY[family] }, family);
  }

  // A build that brings stats of its own lays them over the corner's rather than losing either.
  const brought = withGolemBuild(tuned, "left", { ...BUILD, attributes: { armour: 0.9 } }, 13);
  assert.deepEqual(brought.left.golem.attributes, { movement: 1.2, armour: 0.9 });
  // The control: an untuned corner takes a drawn body with no attributes field at all.
  assert.ok(!("attributes" in withGolemBuild(golemMatchup(BUILD), "left", drawn, 11).left.golem));
});

test("a link whose stats are not a record of numbers is refused by shape", () => {
  const good = golemMatchup(BUILD);
  const encode = (attributes) => `?matchup=${encodeURIComponent(JSON.stringify({
    ...good, left: { ...good.left, golem: { ...BUILD, attributes } },
  }))}`;
  assert.notEqual(matchupFromQuery(encode({ movement: 1.2 })), null, "the control: a well-formed stat decodes");
  assert.equal(matchupFromQuery(encode([1.2])), null, "an array");
  assert.equal(matchupFromQuery(encode(1.2)), null, "a number");
  assert.equal(matchupFromQuery(encode({ speed: 1.2 })), null, "an id that is not a stat");
  assert.equal(matchupFromQuery(encode({ movement: "1.2" })), null, "a value that is not a number");
});

test("recovery shortens a knockdown's lie and leaves its rise to the port and its table alone", () => {
  const rule = SKELETON_BIPED.knockdown;
  const fast = withRecovery(SKELETON_BIPED, 2);
  assert.deepEqual(fast.knockdown, { ...rule, restSeconds: rule.restSeconds / 2, maxLyingSeconds: rule.maxLyingSeconds / 2 },
    "the rest window and the cap, divided; the rest speed, the rise peak and the hold rule untouched");
  assert.deepEqual(withRecovery(SKELETON_BIPED, 0.5).knockdown.maxLyingSeconds, rule.maxLyingSeconds * 2);
  assert.equal(SKELETON_BIPED.knockdown, rule, "the shared table is not written");
  assert.equal(withRecovery(SKELETON_BIPED, 1), SKELETON_BIPED, "x1 is the table it was handed");
  assert.equal(LOCOMOTION_BIPED.knockdown, null);
  assert.equal(withRecovery(LOCOMOTION_BIPED, 2), LOCOMOTION_BIPED, "a body with no knockdown has no lie of its own to shorten");
});

test("a golem resolves its stats once, and every module it builds is handed them", async () => {
  const arena = await createHeadlessArena();
  try {
    const world = flatSupportedWorldRegistry();
    const build = (setup, i) => new Golem(arena.scene, {
      side: i === 0 ? "left" : "right", origin: new Vector3(0, 0, i * 8), facing: i * Math.PI,
      setup, mind: idleMind(), controlPolicies: [], locomotionWorld: world,
    });
    const plain = build(defaultGolemSetup(), 0);
    assert.deepEqual(plain.attributes, DEFAULT_ATTRIBUTES);
    const explicit = build({ ...defaultGolemSetup(), attributes: { movement: 1, size: 1 } }, 1);
    assert.deepEqual(explicit.attributes, DEFAULT_ATTRIBUTES);
    assert.throws(() => build({ ...defaultGolemSetup(), attributes: { size: 1.2 } }, 0),
      /Size is not measured yet/, "a stat nothing reads never reaches a body");

    // Every registered definition is frozen, so there is no builder to spy on: the proof that the
    // context reaches a module is a module doing something with it. The locomotion envelope is the
    // built body's own speed axis, read from the table its builder scaled.
    const fast = build({ ...defaultGolemSetup(), attributes: { movement: 1.5 } }, 1);
    const speedOf = (golem) => golem.locomotionModule.envelope().axes.find((axis) => axis.id === "speed");
    assert.equal(speedOf(fast).max, speedOf(plain).max * 1.5, "the top speed");
    assert.equal(speedOf(fast).rate, speedOf(plain).rate * 1.5, "and the acceleration");
    const yawOf = (golem) => golem.locomotionModule.envelope().axes.find((axis) => axis.id === "yaw");
    assert.deepEqual(yawOf(fast), yawOf(plain), "movement leaves the turn alone");
    const turning = ATTRIBUTES.turning.max;
    const quick = build({ ...defaultGolemSetup(), attributes: { turning, movement: 1.5 } }, 0);
    assert.equal(yawOf(quick).max, yawOf(plain).max * turning, "the turn rate");
    assert.equal(yawOf(quick).rate, yawOf(plain).rate * turning, "and how hard it starts one");
    assert.deepEqual(speedOf(quick), speedOf(fast), "and turning leaves the travel alone, with both set");
  } finally {
    arena.dispose?.();
  }
});

test("armour multiplies the fraction a part was built with, stops at the cap, and gives none to a part that has none", () => {
  assert.equal(armourAt(0.1, 1.5), 0.1 * 1.5);
  assert.equal(armourAt(0.34, 0.5), 0.34 * 0.5);
  assert.equal(armourAt(0.6, 2), ARMOUR_CAP, "a skeleton's thrust at x2 is capped");
  assert.equal(armourAt(0, 2), 0, "no armour stays none");
  assert.equal(armourAt(0.95, 1), 0.95, "x1 is the fraction as built, not a capped one");
  assert.ok(ARMOUR_CAP < 1, "armouredDamage refuses 1");
  assert.ok(Math.abs(10 * (1 - armourAt(0.6, 2)) - 1) < 1e-12, "and a capped blow still lands a tenth of itself");
});

test("a golem's armour stat reaches every blow through the part's own fraction, per kind", async () => {
  const arena = await createHeadlessArena();
  try {
    const world = flatSupportedWorldRegistry();
    const build = (setup, i) => new Golem(arena.scene, {
      side: i === 0 ? "left" : "right", origin: new Vector3(0, 0, i * 8), facing: i * Math.PI,
      setup, mind: idleMind(), controlPolicies: [], locomotionWorld: world,
    });
    const top = ATTRIBUTES.armour.max;
    const low = ATTRIBUTES.armour.min;
    const limb = (golem, suffix) => golem.limbs.find((l) => l.key.endsWith(suffix));
    const blow = (golem, suffix, kind) => golem.applyDamage(limb(golem, suffix), 10, kind);
    // Stone: its core's single fraction, and a pelvis with none, which no setting moves.
    const stone = build(withAttributeSetting(defaultGolemSetup(), { armour: top }), 0);
    const plainStone = build(defaultGolemSetup(), 1);
    const core = 10 - blow(plainStone, "trunk.core", "cut");
    assert.ok(core > 0, "the control: a stone core has armour to scale");
    assert.ok(Math.abs(blow(stone, "trunk.core", "cut") - 10 * (1 - armourAt(core / 10, top))) < 1e-12);
    assert.equal(blow(stone, "legs.pelvis", "cut"), blow(plainStone, "legs.pelvis", "cut"));
    assert.equal(blow(plainStone, "legs.pelvis", "cut"), 10, "the pelvis has none to scale");
    stone.dispose(); plainStone.dispose();
    // The skeleton's per-kind table, at both ends: a cut and a thrust move, a club's crush does not.
    for (const level of [low, top]) {
      const bone = build(withAttributeSetting(skeletonSetup(), { armour: level }), 0);
      for (const kind of ["cut", "thrust", "crush", "slap"]) {
        const expected = 10 * (1 - Math.min(ARMOUR_CAP, SKELETON_ARMOUR[kind] * level));
        assert.ok(Math.abs(blow(bone, "trunk.core", kind) - expected) < 1e-12, `x${level} ${kind}`);
      }
      bone.dispose();
    }
  } finally {
    arena.dispose?.();
  }
});

test("toughness multiplies every body part's health, keeps wear's share and the bar's shape, and leaves a held piece alone", async () => {
  const arena = await createHeadlessArena();
  try {
    const world = flatSupportedWorldRegistry();
    const build = (setup, i) => new Golem(arena.scene, {
      side: i === 0 ? "left" : "right", origin: new Vector3(0, 0, i * 8), facing: i * Math.PI,
      setup, mind: idleMind(), controlPolicies: [], locomotionWorld: world,
    });
    const near = (a, b) => Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(b));
    // The primary arm's own first part, which the body wounds: a socket fitted from the parts bin is
    // how a body arrives worn, now that nothing else carries wear into a bout.
    const arm = (golem) => golem.limbs.find((limb) => limb.key.includes("primary") && golem.parriedBy(limb.part.body) === null);
    for (const base of [defaultGolemSetup(), skeletonSetup()]) {
      const worn = { ...base, primary: { ...base.primary, durability: 0.62 } };
      const plain = build(worn, 1);
      assert.ok(near(arm(plain).health / arm(plain).maxHealth, 0.62), "the control: the arm arrives worn");
      for (const level of [ATTRIBUTES.toughness.min, ATTRIBUTES.toughness.max]) {
        const tough = build(withAttributeSetting(worn, { toughness: level }), 0);
        // A piece that parries -- the blade and the plate in both builds -- is never wounded, and is
        // the item's to scale rather than the body's. `parriedBy` is the question `Combat` asks.
        const held = tough.limbs.filter((limb) => tough.parriedBy(limb.part.body) !== null).map((limb) => limb.key);
        assert.deepEqual(held.map((key) => key.split(".").pop()).sort(), ["blade", "plate"], "the control");
        for (const [i, limb] of tough.limbs.entries()) {
          const was = plain.limbs[i];
          assert.equal(limb.key.replace(/^left\./, ""), was.key.replace(/^right\./, ""));
          assert.equal(limb.vitalityWeight, was.vitalityWeight, `${limb.key}: the bar's weights stay`);
          const scale = held.includes(limb.key) ? 1 : level;
          assert.ok(near(limb.maxHealth, was.maxHealth * scale), `${limb.key} x${level} max`);
          assert.ok(near(limb.health / limb.maxHealth, was.health / was.maxHealth), `${limb.key} x${level} worn share`);
        }
        tough.dispose();
      }
      plain.dispose();
      // The bar: wounds that empty it exactly at x1 -- each part losing the same share of its own
      // health, a share the weights sum to one of -- leave it at 1 - 1/level above x1 and empty below.
      const fresh = build(base, 1);
      const share = 1 / fresh.limbs.reduce((sum, limb) => sum + limb.vitalityWeight, 0);
      const wounds = fresh.limbs.map((limb) => limb.maxHealth * share);
      const wound = (golem) => golem.limbs.forEach((limb, i) => { limb.health -= wounds[i]; });
      wound(fresh);
      assert.ok(Math.abs(fresh.vitality) < 1e-9, `the control: the wounds empty the bar at x1 (${fresh.vitality})`);
      fresh.dispose();
      for (const level of [ATTRIBUTES.toughness.min, 1.5, ATTRIBUTES.toughness.max]) {
        const tough = build(withAttributeSetting(base, { toughness: level }), 0);
        wound(tough);
        assert.ok(Math.abs(tough.vitality - Math.max(0, 1 - 1 / level)) < 1e-9, `x${level} bar ${tough.vitality}`);
        tough.dispose();
      }
    }
  } finally {
    arena.dispose?.();
  }
});
