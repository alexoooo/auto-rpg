/**
 * The straight punch in a bout: what a Puncher does bare-handed to a bare-handed Warrior standing
 * in guard in an Arena bout (Node, core world, Rapier, 120 Hz, the Arena's room).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { boutOf } from "../research/punch-in-bout.mjs";
import { PUNCHER } from "../src/core/mind/config.ts";

test("a Puncher that walks in lands its fist with the arm behind it, wounding a Warrior that stands in guard", async () => {
  // The game's Puncher holds at the edge of a foe's reach, and a foe that never comes waits out its patience there.
  const bout = await boutOf({ ...PUNCHER, tactics: { ...PUNCHER.tactics, list: PUNCHER.tactics.list.filter(behaviour => behaviour.kind !== "edge" && behaviour.kind !== "break-clinch") } }, { gap: 1.2, seconds: 5 });
  const wounding = bout.punches.filter((p) => p.hp[0] > 0.01);
  assert.ok(bout.thrown >= 2, `punches thrown: ${bout.thrown}`);
  assert.ok(wounding.length >= 2, `wounding punches: ${JSON.stringify(bout.punches)}`);
  assert.ok(wounding.some((p) => p.kg[0] >= 1.5), `the most a wounding fist met: ${Math.max(...wounding.map((p) => p.kg[0]))} kg`);
  assert.deepEqual([bout.down, bout.verdict], [0, null]);
});
