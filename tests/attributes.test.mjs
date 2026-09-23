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
  withArmSpeed,
  withAttributeSetting,
  withRecovery,
  withSize,
  SIZE_LAW_POWER,
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
import { bodyFamily, FAMILY_POLICY } from "../src/golem/family.ts";
import { FAMILY_SETUP } from "../src/golem/family-setup.ts";
import { randomViableOpponent } from "../src/golem/viability.ts";
import { mulberry32 } from "../src/rng.ts";
import { defaultGolemSetup, golemEffector, golemHead, golemSetupRefusal, golemUpperMassKg } from "../src/golem/build.ts";
import { Golem } from "../src/golem/golem.ts";
import { idleMind } from "../src/mind.ts";
import {
  BENCH_STAND_LOCOMOTION, BENCH_STAND_LOCOMOTION_SIZE, CHAIN_NONE, CHAIN_NONE_SIZE, CHAIN_PITCH, CHAIN_PITCH_SIZE,
  CHAIN_REACH, CHAIN_REACH_SIZE, CHAIN_WRIST, CHAIN_WRIST_SIZE, HEAD_NECK, HEAD_NECK_SIZE, HEAD_RAM, LOCOMOTION_BIPED,
  LOCOMOTION_BIPED_SIZE, LOCOMOTION_MULTILEG, LOCOMOTION_MULTILEG_SIZE, LOCOMOTION_WHEEL, LOCOMOTION_WHEEL_SIZE,
  TORSO_PLAIN, TORSO_PLATED, TORSO_WAIST, TORSO_WAIST_SIZE,
} from "../src/golem/config.ts";
import { TORSO_SIZE } from "../src/golem/torso/torso.ts";
import { RAM_SIZE } from "../src/golem/head/head.ts";
import { CHAIN_CROSSING_SIZE, CHAIN_LIMITS_SIZE } from "../src/golem/effectors/effector.ts";
import { HUMAN_BIPED, HUMAN_HEAD, HUMAN_TORSO } from "../src/golem/humanoid/body.ts";
import { EFFECTOR_TERMINALS, GOLEM_MODULES, golemModule } from "../src/golem/registry.ts";
import { PLAYABLE_BUILDS } from "../src/golem/roster.ts";
import { buildGolemStand, golemLayers } from "../src/golem/stand.ts";
import { freshIntent } from "../src/action-primitives.ts";
import { RIBCAGE, SKELETAL_REACH, SKELETAL_WRIST, SKELETON_ARMOUR, SKELETON_BIPED, SKULL, SPINE } from "../src/golem/skeleton/body.ts";
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
const MEASURED = Object.freeze(["movement", "turning", "stability", "recovery", "armour", "toughness", "armSpeed", "weight"]);

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

test("arm speed multiplies the named rates of a copy, and x1 is the table it was handed", () => {
  const fast = withArmSpeed(CHAIN_WRIST, ["rollRate", "bendRate"], 1.5);
  assert.deepEqual(fast, { ...CHAIN_WRIST, rollRate: CHAIN_WRIST.rollRate * 1.5, bendRate: CHAIN_WRIST.bendRate * 1.5 },
    "the two rates, multiplied; every other field, the wrist's own");
  assert.equal(withArmSpeed(CHAIN_REACH, ["anchorRate"], 0.5).anchorRate, CHAIN_REACH.anchorRate / 2);
  assert.equal(withArmSpeed(CHAIN_WRIST, ["rollRate", "bendRate"], 1), CHAIN_WRIST, "x1 is the table it was handed");
  assert.equal(CHAIN_WRIST.rollRate, fast.rollRate / 1.5, "the shared table is not written");
});

/**
 * **Every arm chain, both halves of the rate**: what it publishes on its envelope, and how far its
 * command actually travels. The second is the one that matters -- the wrist and the anatomical arm
 * each hold the rate in two places, the envelope and the slew, and an envelope that doubled over a
 * slew that did not would publish an arm the body cannot be. The travel is taken after one substep,
 * because the anatomical arm's first steps its command off the build pose, and over six more, far
 * short of any target. A point chain's swing, lift and reach are read off an anchor that moves in a
 * straight line, so they double to within a few per cent rather than exactly.
 *
 * The stat is handed straight to the builder at x2 rather than through a validated setup, because
 * what is being asserted is the builder's arithmetic and not the row's range.
 */
test("arm speed multiplies every arm chain's published rates and the rate its command travels at", async () => {
  const arena = await createHeadlessArena({ populateDefaultGeometry: false });
  const stand = buildGolemStand(arena.scene, { side: "left" });
  const factor = 2;
  const ctx = (name, armSpeed) => ({
    scene: arena.scene, side: "left", name, socket: stand.socket("primary"),
    companion: stand.socket("secondary"), layers: golemLayers("left"), materials: stand.materials,
    attributes: Object.freeze({ ...DEFAULT_ATTRIBUTES, armSpeed }),
  });
  const intent = freshIntent();
  Object.assign(intent.primary, { pointerX: 1, pointerY: 1, reach: 1, roll: 1, wristBend: 1 });
  const shared = [CHAIN_REACH.anchorRate, CHAIN_WRIST.rollRate, CHAIN_WRIST.bendRate, CHAIN_PITCH.targetRate];
  try {
    for (const chain of ["wrist", "skeletal", "anatomical", "pitch", "reach"]) {
      const measure = (armSpeed) => {
        const built = golemModule(`effector.${chain}.blade`).build(ctx(`${chain}.x${armSpeed}`, armSpeed));
        try {
          const rates = built.envelope().axes.map((axis) => [axis.id, axis.rate]);
          built.command(intent);
          built.step(1 / 240);
          const start = built.view().axes.map((axis) => axis.commanded);
          for (let i = 0; i < 6; i += 1) built.step(1 / 240);
          return { rates, travel: built.view().axes.map((axis, i) => [axis.id, axis.commanded - start[i]]) };
        } finally {
          built.dispose();
        }
      };
      const plain = measure(1);
      const fast = measure(factor);
      assert.ok(plain.rates.length > 0, `${chain} publishes an axis`);
      assert.deepEqual(fast.rates, plain.rates.map(([id, rate]) => [id, rate * factor]), `${chain}: every published rate`);
      for (const [i, [id, moved]] of plain.travel.entries()) {
        assert.ok(Math.abs(moved) > 1e-4, `${chain}.${id} moved at x1 (${moved}), so its ratio means something`);
        const ratio = fast.travel[i][1] / moved;
        assert.ok(Math.abs(ratio - factor) < 0.1, `${chain}.${id}'s command travels x${ratio.toFixed(3)} as far`);
      }
    }
    assert.deepEqual([CHAIN_REACH.anchorRate, CHAIN_WRIST.rollRate, CHAIN_WRIST.bendRate, CHAIN_PITCH.targetRate], shared,
      "and no shared table was written");
  } finally {
    stand.dispose();
    arena.dispose();
  }
});

/**
 * **Every part of every playable build, against the solver.** A body part's solver mass is its x1
 * mass times the stat; an item's -- any part of a terminal, or a ram's plate -- is its own; and the
 * wrist's two cast parts, which weigh their floor or `carryRatio` of the load, whichever is more,
 * land between the two, since only the floor is the body's. The fixture includes a load on each
 * side of that choice, and the test counts both. Havok keeps a mass in single precision, so
 * "equal" is to a part in a million.
 *
 * And what the carrier holds up agrees with the solver: its supported mass is the legs' solver
 * masses plus `golemUpperMassKg` at the same stat, at x1 and at the row's top. A wheel and a
 * multileg are handed no upper mass at all today -- only the biped implements `carry` -- which the
 * test states rather than hides.
 */
test("weight multiplies every body part's solver mass and no item's, and the carrier's load agrees", async () => {
  const arena = await createHeadlessArena();
  try {
    const world = flatSupportedWorldRegistry();
    const build = (setup, i) => new Golem(arena.scene, {
      side: i === 0 ? "left" : "right", origin: new Vector3(0, 0, i * 8), facing: i * Math.PI,
      setup, mind: idleMind(), controlPolicies: [], locomotionWorld: world,
    });
    const level = ATTRIBUTES.weight.max;
    const near = (a, b) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b));
    const mass = (limb) => limb.part.body.getMassProperties().mass;
    const items = new Set([...Object.keys(EFFECTOR_TERMINALS), "ram"]);
    const cast = new Set(["rollRing", "wrist"]);
    const seen = { item: 0, castFloor: 0, castLoad: 0, bodyBlow: 0 };
    const carried = (golem, setup) => {
      const legs = golem.limbs.filter((limb) => limb.key.includes(".legs.")).reduce((sum, limb) => sum + mass(limb), 0);
      const upper = golem.locomotionModule.carry ? golemUpperMassKg(setup) : 0;
      return { supported: golem.locomotion.diagnostic().stability.supportedMassKg, expected: legs + upper };
    };
    for (const { name, setup } of PLAYABLE_BUILDS) {
      const heavySetup = withAttributeSetting(setup, { weight: level });
      const plain = build(setup, 0);
      const heavy = build(heavySetup, 1);
      assert.equal(heavy.limbs.length, plain.limbs.length, name);
      for (const [i, limb] of heavy.limbs.entries()) {
        const key = limb.key.replace(/^right\./, "");
        assert.equal(key, plain.limbs[i].key.replace(/^left\./, ""), name);
        const was = mass(plain.limbs[i]);
        const now = mass(limb);
        const segments = key.split(".");
        if (segments.some((segment) => items.has(segment))) {
          seen.item += 1;
          assert.ok(near(now, was), `${name} ${key}: an item keeps its ${was} kg, not ${now}`);
        } else if (cast.has(segments.at(-1))) {
          // A cast link is max(floor, carryRatio x load). Only the floor is the body's, so at xL it is
          // max(floor x L, load) -- which is max(floor x L, what it was) whichever side bound at x1.
          const hand = segments.find((segment) => segment === "primary" || segment === "secondary");
          const table = setup[hand].chain === "skeletal" ? SKELETAL_WRIST : CHAIN_WRIST;
          const floor = segments.at(-1) === "rollRing" ? table.ringMass : table.wristMass;
          assert.ok(near(now, Math.max(floor * level, was)), `${name} ${key}: ${was} -> ${now}, floor ${floor}`);
          if (near(now, was)) seen.castLoad += 1;
          else seen.castFloor += 1;
        } else {
          assert.ok(near(now, was * level), `${name} ${key}: ${was} kg went x${(now / was).toFixed(4)}`);
        }
      }
      // What a blow arrives with. An item's striker is the item's mass; a capped socket's is the cap,
      // which is body; a ram's is its plate plus the body behind it, and only the body share moves.
      assert.equal(heavy.strikers.length, plain.strikers.length, name);
      for (const [i, striker] of heavy.strikers.entries()) {
        const was = plain.strikers[i].impactMassKg;
        const want = striker.kind === "ram" ? (was - HEAD_RAM.plateMass) * level + HEAD_RAM.plateMass
          : striker.effectorId.endsWith(".shove") ? was * level : was;
        if (want !== was) seen.bodyBlow += 1;
        assert.ok(near(striker.impactMassKg, want), `${name} ${striker.effectorId}: ${was} -> ${striker.impactMassKg}, not ${want}`);
      }
      // What a stroke is timed against: the arm's share of the swing inertia grows with the body and
      // the item's share does not, so an armed effector lands strictly between x1 and xL.
      for (const hand of ["primary", "secondary"]) {
        const was = plain.view.self.capabilities.effectors[hand].swingInertia;
        const now = heavy.view.self.capabilities.effectors[hand].swingInertia;
        assert.ok(now > was * (1 + 1e-6) && now <= was * level * (1 + 1e-6),
          `${name} ${hand}: swing inertia ${was} -> ${now}`);
      }
      for (const [golem, s] of [[plain, setup], [heavy, heavySetup]]) {
        const { supported, expected } = carried(golem, s);
        assert.ok(near(supported, expected), `${name}: the carrier holds up ${supported} kg against ${expected}`);
      }
      plain.dispose();
      heavy.dispose();
    }
    assert.ok(seen.item > 0 && seen.castFloor > 0 && seen.castLoad > 0 && seen.bodyBlow >= 3,
      `the control: items, a cast on its floor, a cast on its load and body blows were all seen (${JSON.stringify(seen)})`);
  } finally {
    arena.dispose?.();
  }
});

test("an effector's item share is its terminal's mass and a head's is its ram plate, and weight moves only the rest", () => {
  const blade = golemEffector("wrist", "blade").definition;
  assert.equal(blade.itemMassKg, EFFECTOR_TERMINALS.blade.massKg);
  assert.ok(blade.massKg > blade.itemMassKg, "the control: the arm weighs something of its own");
  const base = defaultGolemSetup();
  const ram = { ...base, head: "head.ram" };
  for (const setup of [base, ram, skeletonSetup()]) {
    const plain = golemUpperMassKg(setup);
    const heavy = golemUpperMassKg(withAttributeSetting(setup, { weight: 2 }));
    assert.ok(heavy > plain && heavy < 2 * plain, `the body share doubles and the items do not (${plain} -> ${heavy})`);
  }
  assert.ok(golemHead("head.ram").itemMassKg > 0, "a ram's plate is an item");
  assert.equal(golemHead("head.plain").itemMassKg, 0);
  // An effector's items are the one share a stat leaves alone: at x2 the default's upper mass grows
  // by exactly its body share, which is everything but the blade and the plate.
  const items = EFFECTOR_TERMINALS.blade.massKg + EFFECTOR_TERMINALS.plate.massKg;
  const upper = golemUpperMassKg(base);
  assert.ok(Math.abs(golemUpperMassKg(withAttributeSetting(base, { weight: 2 })) - (2 * upper - items)) < 1e-9,
    "the blade and the plate are not doubled");
  // Between the plain head and the ram head the body is the same, so at x2 the upper mass grows by
  // the same amount on both: the plate is not doubled.
  const growth = (setup) => golemUpperMassKg(withAttributeSetting(setup, { weight: 2 })) - golemUpperMassKg(setup);
  assert.ok(Math.abs(growth(ram) - growth(base)) < 1e-9, `the ram's plate doubled: ${growth(ram)} against ${growth(base)}`);
});

test("size multiplies each field of a copy by its law's power, recurses where a law says to, and x1 is the table", () => {
  const table = Object.freeze({
    length: 2, mass: 3, rate: 4, band: [1, 2], names: ["a"], label: "stone", on: true, none: null,
    nested: Object.freeze({ torque: 5, ratio: 0.5 }), kept: Object.freeze({ anything: 7 }),
  });
  const laws = {
    length: "length", mass: "mass", rate: "frequency", band: "length", names: "one", none: "one",
    nested: { torque: "torque", ratio: "one" }, kept: "one",
  };
  assert.equal(withSize(table, laws, 1), table, "x1 is the very table");
  const s = 1.5;
  const sized = withSize(table, laws, s);
  assert.deepEqual(sized, {
    length: 2 * s, mass: 3 * s ** 3, rate: 4 * s ** -0.5, band: [s, 2 * s], names: ["a"], label: "stone",
    on: true, none: null, nested: { torque: 5 * s ** 4, ratio: 0.5 }, kept: { anything: 7 },
  });
  assert.equal(sized.kept, table.kept, "a record carried by `one` is carried whole");
  assert.deepEqual(table.nested, { torque: 5, ratio: 0.5 }, "and the table handed in was not written");
  assert.throws(() => withSize(table, { ...laws, mass: undefined }, s), /no size law for mass/);
  assert.throws(() => withSize(table, { ...laws, nested: { torque: "torque" } }, s), /no size law for nested\.ratio/);
  assert.throws(() => withSize(table, { ...laws, stale: "length" }, s), /names stale, which the table does not have/);
  // The powers are similarity at constant density, with time going as the root of length.
  assert.deepEqual(SIZE_LAW_POWER, {
    one: 0, length: 1, perLength: -1, mass: 3, inertia: 5, torque: 4, force: 3, impulse: 3.5,
    speed: 0.5, frequency: -0.5, angularAcceleration: -1, duration: 0.5,
  });
});

/**
 * Every table a size law serves, walked leaf by leaf. A spread table -- the skeleton's, the human's
 * -- carries fields the type of its laws never saw, and a law that names a field the table lost is
 * one that has drifted; both are refused at build rather than scaled by a default. This is where
 * that refusal is exercised on the shipped tables, and where each leaf is checked to have moved by
 * exactly its law's power.
 */
test("every shipped body table has a size law for every field, and each leaf moves by its law's power", () => {
  const served = [
    [LOCOMOTION_BIPED_SIZE, { LOCOMOTION_BIPED, SKELETON_BIPED, HUMAN_BIPED }],
    [BENCH_STAND_LOCOMOTION_SIZE, { BENCH_STAND_LOCOMOTION }],
    [LOCOMOTION_WHEEL_SIZE, { LOCOMOTION_WHEEL }],
    [LOCOMOTION_MULTILEG_SIZE, { LOCOMOTION_MULTILEG }],
    [TORSO_SIZE, { TORSO_PLAIN, TORSO_PLATED, RIBCAGE, HUMAN_TORSO }],
    [TORSO_WAIST_SIZE, { TORSO_WAIST, SPINE }],
    [HEAD_NECK_SIZE, { HEAD_NECK, SKULL, HUMAN_HEAD }],
    [RAM_SIZE, { ram: (({ guardPitch, ...ram }) => ram)(HEAD_RAM) }],
    [CHAIN_REACH_SIZE, { CHAIN_REACH, SKELETAL_REACH }],
    [CHAIN_WRIST_SIZE, { CHAIN_WRIST, SKELETAL_WRIST }],
    [CHAIN_PITCH_SIZE, { CHAIN_PITCH }],
    [CHAIN_NONE_SIZE, { CHAIN_NONE }],
    [CHAIN_LIMITS_SIZE, Object.fromEntries(Object.entries(EFFECTOR_TERMINALS).filter(([, t]) => t.limits).map(([id, t]) => [id, t.limits]))],
    [CHAIN_CROSSING_SIZE, Object.fromEntries(Object.entries(EFFECTOR_TERMINALS).filter(([, t]) => t.crossing).map(([id, t]) => [id, t.crossing]))],
  ];
  const s = 1.1;
  let leaves = 0;
  const walk = (was, now, laws, path) => {
    for (const [key, value] of Object.entries(was)) {
      const law = laws[key];
      const at = `${path}.${key}`;
      if (typeof value === "number") {
        leaves += 1;
        const want = value * s ** SIZE_LAW_POWER[law];
        assert.ok(Math.abs(now[key] - want) <= 1e-12 * Math.max(1, Math.abs(want)), `${at} (${law}): ${value} -> ${now[key]}`);
      } else if (Array.isArray(value)) {
        assert.deepEqual(now[key], law === "one" ? value : value.map((item) => item * s ** SIZE_LAW_POWER[law]), at);
      } else if (value !== null && typeof value === "object") {
        if (law === "one") assert.equal(now[key], value, at);
        else walk(value, now[key], law, at);
      } else {
        assert.equal(now[key], value, at);
      }
    }
  };
  for (const [laws, tables] of served) {
    for (const [name, table] of Object.entries(tables)) {
      const before = JSON.stringify(table);
      walk(table, withSize(table, laws, s), laws, name);
      assert.equal(JSON.stringify(table), before, `${name} was not written`);
    }
  }
  assert.ok(leaves > 500, `the control: the walk reached the tables' leaves (${leaves})`);
});

/**
 * **Every module a golem or a skeleton can be built from, on the stand at x1 and at x1.25.** Size is
 * not live yet (session 12a): no setup may carry it, so this stands each module on the bench, as
 * the arm-speed test does, and hands it the stat directly.
 *
 * A body part's solver mass is its x1 mass times s^3, and where it sits relative to its socket is
 * its x1 offset times s. An item -- a terminal's parts and a ram's plate -- keeps its mass. A
 * wrist's two cast parts weigh their floor or `carryRatio` of the load, whichever is more, and only
 * the floor is the body's, so they land on max(floor x s^3, what they were). What the module
 * publishes follows the laws: a metre axis's limits go as s and its rate as a speed, a radian
 * axis's limits stay and its rate goes as a frequency. The human's modules are absent: its family
 * fixes size at x1, which the next test holds it to.
 */
/**
 * A carrier's published axes are a command's, not a limb's: their ranges are a speed, a turn rate
 * and a height, and their rates the acceleration toward each -- which the unit field, `m` or `rad`,
 * does not say. The laws are the carrier table's own (`CARRIER_SIZE` in `config.ts`).
 */
const CARRIER_AXIS_LAWS = Object.freeze({
  speed: ["speed", "one"], strafe: ["speed", "one"], yaw: ["frequency", "angularAcceleration"], height: ["length", "speed"],
});

test("size scales every golem and skeleton module's body parts by s^3 in mass and s in place, and leaves items alone", async () => {
  const arena = await createHeadlessArena({ populateDefaultGeometry: false });
  const s = 1.25;
  const near = (a, b) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b));
  const items = new Set([...Object.keys(EFFECTOR_TERMINALS), "ram"]);
  const cast = new Set(["rollRing", "wrist"]);
  const seen = { body: 0, item: 0, castFloor: 0, castLoad: 0, metreAxis: 0, radianAxis: 0, ramBlow: 0, shoveBlow: 0 };
  const tables = () => [CHAIN_REACH, CHAIN_WRIST, CHAIN_PITCH, CHAIN_NONE, LOCOMOTION_BIPED, TORSO_WAIST, HEAD_NECK,
    HEAD_RAM, SKELETON_BIPED, SKELETAL_WRIST, LOCOMOTION_WHEEL, LOCOMOTION_MULTILEG].map((table) => JSON.stringify(table));
  const shared = tables();
  const modules = GOLEM_MODULES.filter((option) => !option.id.includes("human") && !option.id.includes("anatomical"));
  try {
    for (const option of modules) {
      const slot = option.mode === "effector" ? "primary" : option.mode;
      const measure = (size) => {
        const stand = buildGolemStand(arena.scene, {
          side: "left", slot, ...(option.standHeightM ? { socketHeight: option.standHeightM * size } : {}),
        });
        const socket = stand.socket(slot);
        const companion = stand.socket("secondary");
        const prefix = `${option.id}.x${size}.`;
        const built = option.build({
          scene: arena.scene, side: "left", name: `${option.id}.x${size}`, socket, companion,
          layers: golemLayers("left"), materials: stand.materials, world: flatSupportedWorldRegistry(),
          attributes: Object.freeze({ ...DEFAULT_ATTRIBUTES, size }),
        });
        try {
          return {
            parts: built.parts.map((p) => ({
              id: p.id.slice(prefix.length), mass: p.part.body.getMassProperties().mass,
              // A second hand hangs from the companion socket, and the stand is not what was sized.
              offset: p.part.mesh.position.subtract((p.id.startsWith(`${prefix}trailing.`) ? companion : socket).world),
            })),
            strikers: built.strikers.map((striker) => ({ kind: striker.kind, id: striker.effectorId, mass: striker.impactMassKg })),
            envelope: built.envelope(),
          };
        } finally {
          built.dispose();
          stand.dispose();
        }
      };
      const plain = measure(1);
      const big = measure(s);
      assert.deepEqual(big.parts.map((p) => p.id), plain.parts.map((p) => p.id), option.id);
      for (const [i, part] of big.parts.entries()) {
        const was = plain.parts[i];
        const at = `${option.id} ${part.id}`;
        const segments = part.id.split(".");
        if (segments.some((segment) => items.has(segment))) {
          seen.item += 1;
          assert.ok(near(part.mass, was.mass), `${at}: an item keeps its ${was.mass} kg, not ${part.mass}`);
          continue;
        }
        if (cast.has(segments.at(-1))) {
          const table = option.id.includes("skeletal") ? SKELETAL_WRIST : CHAIN_WRIST;
          const floor = segments.at(-1) === "rollRing" ? table.ringMass : table.wristMass;
          assert.ok(near(part.mass, Math.max(floor * s ** 3, was.mass)), `${at}: ${was.mass} -> ${part.mass}, floor ${floor}`);
          if (near(part.mass, was.mass)) seen.castLoad += 1;
          else seen.castFloor += 1;
        } else {
          seen.body += 1;
          assert.ok(near(part.mass, was.mass * s ** 3), `${at}: ${was.mass} kg went x${(part.mass / was.mass).toFixed(4)}`);
        }
        const drift = part.offset.subtract(was.offset.scale(s)).length();
        assert.ok(drift < 1e-6, `${at}: sits ${drift} m from s times where it sat`);
      }
      assert.equal(big.strikers.length, plain.strikers.length, option.id);
      for (const [i, striker] of big.strikers.entries()) {
        const was = plain.strikers[i].mass;
        let want = was;
        if (striker.kind === "ram") {
          want = (was - HEAD_RAM.plateMass) * s ** 3 + HEAD_RAM.plateMass;
          seen.ramBlow += 1;
        } else if (striker.id.endsWith(".shove")) {
          want = was * s ** 3;
          seen.shoveBlow += 1;
        }
        assert.ok(near(striker.mass, want), `${option.id} ${striker.id}: ${was} -> ${striker.mass}, not ${want}`);
      }
      for (const [i, axis] of big.envelope.axes.entries()) {
        const was = plain.envelope.axes[i];
        const at = `${option.id} ${axis.id}`;
        assert.equal(axis.id, was.id, at);
        const [range, rate] = option.mode === "locomotion" ? CARRIER_AXIS_LAWS[axis.id]
          : axis.unit === "m" ? ["length", "speed"] : ["one", "frequency"];
        if (range === "length") seen.metreAxis += 1;
        if (range === "one") seen.radianAxis += 1;
        const k = s ** SIZE_LAW_POWER[range];
        assert.ok(near(axis.min, was.min * k) && near(axis.max, was.max * k), `${at}: [${was.min}, ${was.max}] -> [${axis.min}, ${axis.max}]`);
        assert.ok(near(axis.rate, was.rate * s ** SIZE_LAW_POWER[rate]), `${at}: rate ${was.rate} -> ${axis.rate}`);
      }
      // What a stroke is timed against. A chain's own share is a mass times a length squared; an
      // item's is its fixed mass on the sized arm's lever, so an armed effector grows by less, and
      // an empty socket -- all chain -- by exactly s^5.
      if (option.mode === "effector") {
        const [was, now] = [plain.envelope.swingInertia, big.envelope.swingInertia];
        if (option.id === "effector.none") assert.ok(near(now, was * s ** 5), `${option.id}: swing inertia ${was} -> ${now}`);
        else assert.ok(now > was && now < was * s ** 5, `${option.id}: swing inertia ${was} -> ${now}`);
      }
      // How near its command a module must be to count as there: metres for a module whose command
      // is a place -- a carrier, a reaching arm, an empty socket's cap -- and radians for one whose
      // command is an angle.
      const band = option.mode === "locomotion" || option.id === "effector.none" || big.envelope.axes.some((axis) => axis.unit === "m")
        ? s : 1;
      assert.ok(near(big.envelope.settledBand, plain.envelope.settledBand * band),
        `${option.id}: settled band ${plain.envelope.settledBand} -> ${big.envelope.settledBand}`);
      const reachable = plain.envelope.reachable;
      if (reachable) {
        for (const [key, value] of Object.entries(reachable)) {
          const law = key.startsWith("reach") || key === "carryMin" ? s : 1;
          assert.ok(near(big.envelope.reachable[key], value * law), `${option.id} reachable.${key}`);
        }
      }
    }
    assert.deepEqual(tables(), shared, "and no shared table was written");
    assert.ok(Object.values(seen).every((count) => count > 0),
      `the control: every kind of part, blow and axis was seen (${JSON.stringify(seen)})`);
  } finally {
    arena.dispose?.();
  }
});

test("a human's size is fixed at x1: refused on its setup, not set on its corner, and dropped when a corner draws one", () => {
  const human = FAMILY_SETUP.human();
  assert.equal(bodyFamily(human), "human");
  assert.match(golemSetupRefusal({ ...human, attributes: { size: 1.25 } }), /Size is fixed at x1 on a human/);
  assert.equal(golemSetupRefusal({ ...human, attributes: { size: 1 } }), null, "the control: x1 is a human's size");
  assert.match(golemSetupRefusal({ ...defaultGolemSetup(), attributes: { size: 1.25 } }), /not measured yet/,
    "and a stone golem's is refused only because the row is not live");

  const corner = withGolemBuild(golemMatchup(BUILD), "left", human, 3);
  assert.equal(withGolemAttribute(corner, "left", "size", 1.25), corner, "a human corner refuses the stat");
  assert.notEqual(withGolemAttribute(corner, "left", "movement", 1.2), corner, "the control: it takes another");

  const tuned = golemMatchup(BUILD);
  tuned.left.golem = { ...BUILD, attributes: { size: 1.25, movement: 1.2 } };
  assert.deepEqual(withGolemBuild(tuned, "left", human, 4).left.golem.attributes, { movement: 1.2 },
    "a corner that draws a human keeps its other stats and loses size");
  assert.deepEqual(withGolemBuild(tuned, "left", skeletonSetup(), 4).left.golem.attributes, { size: 1.25, movement: 1.2 },
    "the control: a skeleton keeps both");
});

/**
 * A ram's lunge is the neck's, so it follows the body: a larger head drives, follows and stays armed
 * for longer, each as a duration (the root of s), while its plate keeps its own size. Read from the
 * striker's own gate -- armed is what decides whether a touch is a blow -- counted in control steps
 * from the thrust edge.
 */
test("a larger ram's lunge is armed for the root of its size longer", async () => {
  const arena = await createHeadlessArena({ populateDefaultGeometry: false });
  const s = 1.25;
  const dt = 1 / 240;
  try {
    const armedSteps = (size) => {
      const stand = buildGolemStand(arena.scene, { side: "left", slot: "head" });
      const built = golemModule("head.ram").build({
        scene: arena.scene, side: "left", name: `ram.x${size}`, socket: stand.socket("head"),
        layers: golemLayers("left"), materials: stand.materials, attributes: Object.freeze({ ...DEFAULT_ATTRIBUTES, size }),
      });
      try {
        const [striker] = built.strikers;
        assert.notEqual(striker.gate.refusal(), null, "the control: a ram at rest is not armed");
        const intent = freshIntent();
        intent.natural.thrust = true;
        built.command(intent);
        let steps = 0;
        do {
          built.step(dt);
          steps += 1;
        } while (striker.gate.refusal() === null && steps < 2400);
        return steps;
      } finally {
        built.dispose();
        stand.dispose();
      }
    };
    const plain = armedSteps(1);
    const big = armedSteps(s);
    assert.ok(plain > 10 && plain < 2400, `the control: a lunge arms and disarms (${plain} steps)`);
    assert.ok(Math.abs(big - plain * Math.sqrt(s)) <= 2, `armed ${plain} steps at x1 and ${big} at x${s}`);
  } finally {
    arena.dispose?.();
  }
});
