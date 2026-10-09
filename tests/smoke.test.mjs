/**
 * **Is the core broken?** The quick whole-path check: an Arena bout, the Warrior against the Rogue
 * (Node, core world, vendored Rapier, 120 Hz), played for its first 12 s twice over. It runs, they
 * close and wound each other with the bodies still up, and the two playings agree to the bit.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { playBout } from "../research/bout.mjs";

const RECIPE = Object.freeze({ left: "workshop-fighter", right: "workshop-rogue" });
const SECONDS = 12;

test("a short arena bout runs, wounds both sides, keeps both bodies up, and plays the same twice", async () => {
  const first = await playBout(RECIPE, SECONDS), second = await playBout(RECIPE, SECONDS);
  assert.ok(first.seconds >= SECONDS, `the bout ran ${first.seconds} s`);
  assert.ok(first.wounding > 0 && first.bars.every((bar) => bar < 1), `blows land and wound both sides: ${first.wounding} wounding, bars ${first.bars}`);
  assert.deepEqual(first.fallen, [], "nobody is down after the opening exchanges");
  assert.deepEqual(second, first, "a bout is the same each time it is played");
});
