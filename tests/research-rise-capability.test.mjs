/**
 * **How far the staged rise gets** (`stagedRise` under `supportRecovery`), measured by the battery of
 * falls (`research/core-rise-trials.mjs`) on Node, core world, Rapier, 120 Hz, and not a gate
 * (`tests/experimental.json`): the Warrior shoved three ways, empty-handed, watched 30 s. What a
 * row holds whatever its ending is `research-rise.test.mjs`'s.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { RISE } from "../src/core/mind/rise/stages.ts";
import { shoved } from "../research/core-rise-trials.mjs";
import { RECIPE_FIGHTER } from "../src/core/mind/config.ts";

/** A fighter whose sub-mind rises by stages (`supportRecovery`, which runs `stagedRise`). */
const STAGED = { ...RECIPE_FIGHTER, subs: [{ kind: "support-recovery" }] };

test("a row says how the body lay, and how far a riser got", async () => {
  // Under a mind whose sub-mind rises by stages (`stagedRise`), the row names the furthest stage of the game's rise it reached, or that it
  // reached none, and says whether the rise was played to its end. Watched 30 s: the rise takes 20 s and more.
  const rise = STAGED;
  const stages = ["none", ...RISE.rise.map((stage) => stage.name)], last = RISE.rise.at(-1).name;
  const rows = [];
  for (const degrees of [315, 0, 180]) rows.push(await shoved({ model: "workshop-fighter", held: "empty", degrees, mind: rise, watch: 30 }));
  for (const row of rows) assert.ok(row.fell && stages.includes(row.stage), `it reached ${row.stage}, lying on its ${row.lie}`);
  // The Warrior shoved forward and to its left ends on its front, twisted, and gets no further than its knees and hands; shoved forward
  // or backward it lies on its back, plays the rise to its end, and is up, and still up when the watch ends.
  assert.deepEqual(rows.map((row) => [row.lie, row.stage, row.ended, row.risen, row.up]), [["front", "fours", false, false, false], ["back", last, true, true, true], ["back", last, true, true, true]]);
});
