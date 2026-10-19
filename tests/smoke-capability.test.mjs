/**
 * **How the smoke bouts fight** (`tests/smoke.test.mjs`): the Warrior against the Rogue and the
 * options fighter against the Classic fighter (Node, core world, vendored Rapier, 120 Hz), each
 * played for its first 12 s. Blows land and wound both sides, and in the first nobody is down
 * after the opening exchanges.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { playBout } from "../research/bout.mjs";
import { PRESETS } from "../src/core/mind/controllers.ts";

const SECONDS = 12;

test("the Warrior and the Rogue wound each other in a short arena bout and both are up after it", async () => {
  const bout = await playBout({ left: "workshop-fighter", right: "workshop-rogue" }, SECONDS);
  assert.ok(bout.wounding > 0 && bout.bars.every((bar) => bar < 1), `blows land and wound both sides: ${bout.wounding} wounding, bars ${bout.bars}`);
  assert.deepEqual(bout.fallen, [], "nobody is down after the opening exchanges");
});

test("the options fighter wounds the classic fighter and is wounded", async () => {
  const bout = await playBout({ left: "workshop-fighter", right: "workshop-fighter", minds: { left: PRESETS.options.config, right: PRESETS.classic.config } }, SECONDS);
  assert.ok(bout.wounding > 0 && bout.bars.every((bar) => bar < 1), `blows land and wound both sides: ${bout.wounding} wounding, bars ${bout.bars}`);
});
