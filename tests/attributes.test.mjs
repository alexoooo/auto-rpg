import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";

import {
  ATTRIBUTES,
  ATTRIBUTE_IDS,
  DEFAULT_ATTRIBUTES,
  attributeOf,
  attributesRefusal,
  describeAttributes,
  resolveAttributes,
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
import { defaultGolemSetup, golemSetupRefusal } from "../src/golem/build.ts";
import { Golem } from "../src/golem/golem.ts";
import { idleMind } from "../src/mind.ts";
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
const MEASURED = Object.freeze(["movement"]);

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
  assert.match(attributesRefusal({ turning: 1.1 }, LIVE) ?? "", /not measured yet/,
    "a row that is not live in this table still refuses");
});

test("a golem setup carrying a stat nothing reads is refused where every build is checked", () => {
  const setup = defaultGolemSetup();
  assert.equal(golemSetupRefusal(setup), null);
  assert.equal(golemSetupRefusal({ ...setup, attributes: { turning: 1 } }), null);
  assert.equal(golemSetupRefusal({ ...setup, attributes: { movement: 1.2 } }), null, "a measured stat inside its range");
  assert.match(golemSetupRefusal({ ...setup, attributes: { movement: 1.6 } }) ?? "", /Movement x1.6 is outside/);
  assert.match(golemSetupRefusal({ ...setup, attributes: { turning: 1.2 } }) ?? "", /Turning is not measured yet/);
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
    assert.throws(() => build({ ...defaultGolemSetup(), attributes: { turning: 1.2 } }, 0),
      /Turning is not measured yet/, "a stat nothing reads never reaches a body");

    // Every registered definition is frozen, so there is no builder to spy on: the proof that the
    // context reaches a module is a module doing something with it. The locomotion envelope is the
    // built body's own speed axis, read from the table its builder scaled.
    const fast = build({ ...defaultGolemSetup(), attributes: { movement: 1.5 } }, 1);
    const speedOf = (golem) => golem.locomotionModule.envelope().axes.find((axis) => axis.id === "speed");
    assert.equal(speedOf(fast).max, speedOf(plain).max * 1.5, "the top speed");
    assert.equal(speedOf(fast).rate, speedOf(plain).rate * 1.5, "and the acceleration");
  } finally {
    arena.dispose?.();
  }
});
