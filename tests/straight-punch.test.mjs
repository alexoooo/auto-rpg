/**
 * The straight punch: what a Puncher does bare-handed to a bare-handed Warrior standing in guard in
 * an Arena bout (Node, core world, Rapier, 120 Hz, the Arena's room), and what is wrong with its
 * settings.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { boutOf } from "../research/punch-in-bout.mjs";
import { treeFaults } from "../src/core/mind/catalog.ts";
import { PUNCHER } from "../src/core/mind/config.ts";
import { modelSpec } from "../src/core/models.ts";
import { straightPunchFits } from "../src/core/skills/straight-punch.ts";
import { withParts } from "./fixtures/minds.mjs";

test("a Puncher walks in and lands its fist with the arm behind it, wounding a Warrior that stands in guard", async () => {
  const bout = await boutOf(PUNCHER, { gap: 1.2, seconds: 5 });
  const wounding = bout.punches.filter((p) => p.hp[0] > 0.01);
  assert.ok(bout.thrown >= 2, `punches thrown: ${bout.thrown}`);
  assert.ok(wounding.length >= 2, `wounding punches: ${JSON.stringify(bout.punches)}`);
  assert.ok(wounding.some((p) => p.kg[0] >= 1.5), `the most a wounding fist met: ${Math.max(...wounding.map((p) => p.kg[0]))} kg`);
  assert.deepEqual([bout.down, bout.verdict], [0, null]);
});

test("a straight punch's settings are finite and not negative, and it needs a chest that turns over two hands", () => {
  assert.deepEqual(treeFaults(PUNCHER), []);
  assert.deepEqual(treeFaults(withParts(PUNCHER, { blow: { reach: 0 } })),
    ["blow: a straight punch needs every setting finite and not negative, and a pace, reach, band and drive's length above zero"]);
  assert.deepEqual(treeFaults(withParts(PUNCHER, { blow: { lean: -0.1 } })).length, 1);
  assert.deepEqual([straightPunchFits(modelSpec("workshop-fighter")), straightPunchFits(modelSpec("reptile"))], [true, false]);
});
