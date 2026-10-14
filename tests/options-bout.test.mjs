/**
 * **The options fighter fights**: an Arena bout of the options fighter (`createOptionsFighter`)
 * against the Classic fighter, Warrior against Warrior (Node, core world, vendored Rapier, 120 Hz),
 * played for its first 12 s twice over. Blows land and wound both sides with no assist, and the two
 * playings agree to the bit.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { playBout } from "../research/bout.mjs";
import { PRESETS } from "../src/core/mind/controllers.ts";

const RECIPE = Object.freeze({ left: "workshop-fighter", right: "workshop-fighter", minds: { left: PRESETS.options.config, right: PRESETS.classic.config } });
const SECONDS = 12;

test("the options fighter wounds the classic fighter and is wounded, unassisted, the same each time", async () => {
  const first = await playBout(RECIPE, SECONDS), second = await playBout(RECIPE, SECONDS);
  assert.ok(first.seconds >= SECONDS || first.winner !== null, `the bout ran ${first.seconds} s to no verdict`);
  assert.ok(first.wounding > 0 && first.bars.every((bar) => bar < 1), `blows land and wound both sides: ${first.wounding} wounding, bars ${first.bars}`);
  assert.deepEqual(first.assist.flat(), [0, 0, 0, 0], "neither side is assisted");
  assert.deepEqual(second, first, "a bout is the same each time it is played");
});
