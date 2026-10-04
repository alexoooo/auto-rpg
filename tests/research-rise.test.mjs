/**
 * **The battery of falls** (`research/core-rise-trials.mjs`): what counts as having risen, and a
 * shove of the battery's own that fells a body. Node, core world, Rapier, 120 Hz.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { RISE } from "../src/core/mind/rise/stages.ts";
import { risenAt, shoved, UP_SECONDS, WATCH_SECONDS } from "../research/core-rise-trials.mjs";

test("a rise is two seconds up running", () => {
  const hz = 10, run = UP_SECONDS * hz;
  const trace = (...spans) => spans.flatMap(([down, steps]) => Array.from({ length: steps }, () => down));
  assert.equal(risenAt(trace([true, 30], [false, run]), hz), 3, "down 3 s, then up the whole run");
  assert.equal(risenAt(trace([true, 30], [false, run - 1], [true, 5]), hz), null, "up a step short of it, and down again");
  assert.equal(risenAt(trace([true, 30], [false, run - 1]), hz), null, "up a step short of it when the watch ends");
  assert.equal(risenAt(trace([true, 30], [false, run - 1], [true, 5], [false, run + 4]), hz), 3 + (run - 1 + 5) / hz, "the run that counts is the first whole one");
  assert.equal(risenAt(trace([false, run]), hz), 0, "never down, it is up from the start");
  assert.equal(risenAt([], hz), null);
});

/** A fighter that hands its body to nobody: what drives it standing drives it lying. */
const DRIVEN = { kind: "fighter", subs: [], guard: "pose", aim: "head" };

test("a shove of the battery fells the Warrior, and it does not rise", async () => {
  for (const degrees of [0, 90]) {
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
    // The peak is read from a second after the fall, not from the fall: shoved to its side, it lands within that second.
    if (degrees === 90) assert.ok(row.peak < 1, `lying on its side, the fastest of its segments moved ${row.peak} m/s`);
    // Lying, it is still within 3 s of the fall; driven, it moves to the watch's last step.
    assert.ok(row.moved > 0.5 && row.moved < 3, `lying, it last moved ${row.moved} s after the fall`);
    assert.ok(Math.abs(driven.moved - (WATCH_SECONDS - 1 / 120)) < 1e-9, `driven, it last moved ${driven.moved} s after the fall`);
  }
  // The control: a shove it holds is no fall.
  assert.deepEqual(await shoved({ model: "workshop-fighter", held: "club", degrees: 0, impulse: 0.2 }),
    { fell: false, risen: false, seconds: null, peak: null, asked: null, moved: null, lie: null, stage: null, ended: null, up: null });
});

test("a row says how the body lay, and how far a riser got", async () => {
  // Under a mind whose sub-mind rises by stages (`stagedRise`), the row names the furthest stage of the game's rise it reached, or that it
  // reached none, and says whether the rise was played to its end. Watched 30 s: the rise takes 20 s and more.
  const rise = { kind: "fighter", subs: [{ kind: "staged-rise" }], guard: "pose", aim: "head" };
  const stages = ["none", ...RISE.rise.map((stage) => stage.name)], last = RISE.rise.at(-1).name;
  const rows = [];
  for (const degrees of [315, 0, 180]) rows.push(await shoved({ model: "workshop-fighter", held: "empty", degrees, mind: rise, watch: 30 }));
  for (const row of rows) assert.ok(row.fell && stages.includes(row.stage), `it reached ${row.stage}, lying on its ${row.lie}`);
  // The Warrior shoved forward and to its left ends on its front, twisted, and gets no further than its knees and hands; shoved forward
  // or backward it lies on its back, plays the rise to its end, and is up, and still up when the watch ends.
  assert.deepEqual(rows.map((row) => [row.lie, row.stage, row.ended, row.risen, row.up]), [["front", "fours", false, false, false], ["back", last, true, true, true], ["back", last, true, true, true]]);
});
