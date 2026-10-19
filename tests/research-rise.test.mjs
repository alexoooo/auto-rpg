/**
 * **The battery of falls** (`research/core-rise-trials.mjs`): a shove of the battery's own that
 * fells a body, and the row it writes of the fall. Node, core world, Rapier, 120 Hz. What counts as
 * having risen is `research-risen.test.mjs`'s; how far a riser gets is
 * `research-rise-capability.test.mjs`'s.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { RISE } from "../src/core/mind/rise/stages.ts";
import { shoved, WATCH_SECONDS } from "../research/core-rise-trials.mjs";
import { RECIPE_FIGHTER } from "../src/core/mind/config.ts";

/** A fighter that hands its body to nobody: what drives it standing drives it lying. */
const DRIVEN = { ...RECIPE_FIGHTER, subs: [] };

test("a shove of the battery fells the Warrior, and it does not rise", async () => {
  for (const degrees of [45, 270]) {
    const row = await shoved({ model: "workshop-fighter", held: "club", degrees });
    assert.deepEqual(Object.keys(row), ["fell", "risen", "seconds", "peak", "asked", "moved", "lie", "stage", "ended", "up"]);
    // How it lay a second after the fall; and it has no riser, so no stage, and no rise to end.
    assert.ok(["front", "back", "left", "right"].includes(row.lie), `it lay on its ${row.lie}`);
    assert.deepEqual([row.stage, row.ended], [null, null]);
    assert.deepEqual({ fell: row.fell, risen: row.risen, seconds: row.seconds, up: row.up }, { fell: true, risen: false, seconds: null, up: false }, `shoved ${degrees} degrees about up`);
    assert.ok(row.peak > 0 && Number.isFinite(row.peak), `the fastest of its segments moved ${row.peak} m/s`);
    // Lying, the game's mind asks its stance nothing; one that keeps the body asks more than its soles give.
    assert.equal(row.asked, 0);
    const driven = await shoved({ model: "workshop-fighter", held: "club", degrees, mind: DRIVEN });
    assert.ok(driven.fell && driven.asked > 0, `driven, its stance asked ${driven.asked} weights more than its soles gave`);
    assert.ok(driven.peak > row.peak, `driven, the fastest of its segments moved ${driven.peak} m/s, and lying ${row.peak}`);
    // Driven, it moves to the watch's last step; lying, it moved after the fall, and whether it then lies still is the case below.
    assert.ok(row.moved > 0.5, `lying, it last moved ${row.moved} s after the fall`);
    assert.ok(Math.abs(driven.moved - (WATCH_SECONDS - 1 / 120)) < 1e-9, `driven, it last moved ${driven.moved} s after the fall`);
  }
  // The control: a shove it holds is no fall.
  assert.deepEqual(await shoved({ model: "workshop-fighter", held: "club", degrees: 0, impulse: 0.2 }),
    { fell: false, risen: false, seconds: null, peak: null, asked: null, moved: null, lie: null, stage: null, ended: null, up: null });
});

// Shoved to its left it lands on its back, but under the game's `lie` its club arm (hand.right, forearm.right) twitches at
// 0.01-0.1 m/s for the whole watch: a slack body that never comes to rest.
test("a felled body lies still within three seconds of the fall", { todo: "the slack club arm under `lie` never settles" }, async () => {
  for (const degrees of [45, 270]) {
    const row = await shoved({ model: "workshop-fighter", held: "club", degrees });
    assert.ok(row.fell, `shoved ${degrees} degrees about up: the fixture did not reach its case`);
    // The peak is read from a second after the fall, not from the fall: the last of a club hand's swing settles in it.
    assert.ok(row.peak < 1.5 && row.moved < 3, `lying on its ${row.lie}, the fastest of its segments moved ${row.peak} m/s, and the last moved ${row.moved} s after the fall`);
  }
});

/** A fighter whose sub-mind rises by stages (`supportRecovery`, which runs `stagedRise`). */
const STAGED = { ...RECIPE_FIGHTER, subs: [{ kind: "support-recovery" }] };

test("a row says how the body lay, and how far a riser got, whatever its ending", async () => {
  const stages = ["none", ...RISE.rise.map((stage) => stage.name)];
  const row = await shoved({ model: "workshop-fighter", held: "empty", degrees: 0, mind: STAGED, watch: 5 });
  assert.ok(row.fell, "the fixture did not reach its case: the shove did not fell the Warrior");
  assert.deepEqual(Object.keys(row), ["fell", "risen", "seconds", "peak", "asked", "moved", "lie", "stage", "ended", "up"]);
  assert.ok(["front", "back", "left", "right"].includes(row.lie), `it lay on its ${row.lie}`);
  assert.ok(stages.includes(row.stage), `it reached ${row.stage}`);
  assert.equal(typeof row.ended, "boolean");
  assert.equal(row.risen, row.seconds !== null);
  assert.ok(Number.isFinite(row.peak) && Number.isFinite(row.asked) && Number.isFinite(row.moved), JSON.stringify(row));
});
