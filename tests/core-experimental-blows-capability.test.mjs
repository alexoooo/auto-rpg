/**
 * **How the research blows land on the punch stand** (`driven-strike`, `whole-body-strike`;
 * `punchStand`, Node, core world, vendored Rapier, 120 Hz, no assist): each first blow at the pad,
 * landed or missed, and whether the body kept its feet.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { blowConfig } from "../research/competencies.mjs";
import { firstBlow } from "./fixtures/stand-blow.mjs";

test("each research blow on the stand takes a blow, lands it or misses, and gives the body back standing", async () => {
  // The driven strike's stroke ends where its bearing support fails, before the fist reaches the pad.
  assert.deepEqual(await firstBlow(blowConfig("driven-strike")), { ended: true, thrown: 1, landed: 0, whole: "none", holders: ["default"], fell: false });
  assert.deepEqual(await firstBlow(blowConfig("whole-body-strike")), { ended: true, thrown: 1, landed: 1, whole: "all", holders: ["default"], fell: false });
  assert.deepEqual(await firstBlow(blowConfig("whole-body-strike", "drive=flat-out")), { ended: true, thrown: 1, landed: 1, whole: "all", holders: ["default"], fell: false });
});
