/** Equipped obstacle-court software floor: Node core world, vendored Rapier, 120 Hz. */
import test from "node:test";
import { assertSmokeFloor, smokeFloor } from "./harness/smoke-floor.mjs";

const RECIPE = Object.freeze({
  left: "workshop-rogue", right: "workshop-fighter", level: "obstacle-court",
  loadouts: { left: { left: "buckler", right: "club" }, right: { left: "buckler", right: "sword" } },
});

test("club and buckler Rogue against sword and buckler Warrior in the obstacle court runs, stays finite, flings nobody, is unassisted, and plays the same twice", async () => {
  const first = await smokeFloor(RECIPE), second = await smokeFloor(RECIPE);
  assertSmokeFloor(first, second);
});
