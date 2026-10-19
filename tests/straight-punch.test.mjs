/**
 * The straight punch's settings: what is wrong with them, and the bodies it fits. What a Puncher
 * does with it in a bout is measured apart (`tests/straight-punch-capability.test.mjs`).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { treeFaults } from "../src/core/mind/catalog.ts";
import { PUNCHER } from "../src/core/mind/config.ts";
import { modelSpec } from "../src/core/models.ts";
import { straightPunchFits } from "../src/core/skills/straight-punch.ts";

test("a straight punch's settings are finite and not negative, and it needs a chest that turns over two hands", () => {
  assert.deepEqual(treeFaults(PUNCHER), []);
  assert.deepEqual(treeFaults({ ...PUNCHER, executors: PUNCHER.executors.map(executor => ({ ...executor, reach: 0 })) }),
    ["executors.0: invalid straight punch settings"]);
  assert.deepEqual(treeFaults({ ...PUNCHER, executors: PUNCHER.executors.map(executor => ({ ...executor, lean: -.1 })) }).length, 1);
  assert.deepEqual([straightPunchFits(modelSpec("workshop-fighter")), straightPunchFits(modelSpec("reptile"))], [true, false]);
});
