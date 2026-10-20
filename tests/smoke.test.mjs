/**
 * **Is the core broken?** The quick whole-path check: bare and equipped Arena bouts (Node, core
 * world, vendored Rapier, 120 Hz), both humanoids and the options and Classic fighters on open
 * floor, each played for its first 12 s twice over. Each runs its seconds or to a verdict, every
 * body stays finite and none is flung, neither side is assisted, and the two playings agree to the
 * bit. How well they fight is measured apart (`tests/smoke-capability.test.mjs`).
 */
import test from "node:test";
import { PRESETS } from "../src/core/mind/controllers.ts";
import { assertSmokeFloor, smokeFloor } from "./harness/smoke-floor.mjs";

const RECIPES = Object.freeze({
  "the Warrior against the Rogue": { left: "workshop-fighter", right: "workshop-rogue" },
  "the options fighter against the Classic fighter": { left: "workshop-fighter", right: "workshop-fighter", minds: { left: PRESETS.options.config, right: PRESETS.classic.config } },
  "club and buckler Warrior against sword and buckler Rogue on open floor": {
    left: "workshop-fighter", right: "workshop-rogue", level: "open",
    loadouts: { left: { left: "buckler", right: "club" }, right: { left: "buckler", right: "sword" } },
  },
});
for (const [name, recipe] of Object.entries(RECIPES)) test(`${name}: a short arena bout runs, stays finite, flings nobody, is unassisted, and plays the same twice`, async () => {
  const first = await smokeFloor(recipe), second = await smokeFloor(recipe);
  assertSmokeFloor(first, second);
});
