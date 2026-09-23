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
import { defaultGolemSetup, golemEffector, golemHead, golemSetupRefusal, golemUpperMassKg } from "../src/golem/build.ts";
import { Golem } from "../src/golem/golem.ts";
import { idleMind } from "../src/mind.ts";
import { CHAIN_PITCH, CHAIN_REACH, CHAIN_WRIST, HEAD_RAM, LOCOMOTION_BIPED } from "../src/golem/config.ts";
import { EFFECTOR_TERMINALS, golemModule } from "../src/golem/registry.ts";
import { PLAYABLE_BUILDS } from "../src/golem/roster.ts";
import { buildGolemStand, golemLayers } from "../src/golem/stand.ts";
import { freshIntent } from "../src/action-primitives.ts";
import { SKELETAL_WRIST, SKELETON_ARMOUR, SKELETON_BIPED } from "../src/golem/skeleton/body.ts";
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
    const core = (golem) => golem.limbs.find((limb) => limb.key.endsWith("trunk.core"));
    for (const base of [defaultGolemSetup(), skeletonSetup()]) {
      const worn = { ...base, wear: { torso: 0.62 } };
      const plain = build(worn, 1);
      assert.ok(near(core(plain).health / core(plain).maxHealth, 0.62), "the control: the torso arrives worn");
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
