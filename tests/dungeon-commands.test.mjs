// What a dungeon order reads as (`orderLabel`, `src/dungeon/commands.ts`).
import test from "node:test";
import assert from "node:assert/strict";
import { orderLabel } from "../src/dungeon/commands.ts";

test("a_dungeon_order_reads_as_its_label", () => {
  // Every kind, so a missing or swapped case fails, and `never` makes a new kind a compile error.
  assert.equal(orderLabel({ kind: "idle" }, null, true), "standing");
  assert.equal(orderLabel({ kind: "idle" }, null, false), "with you");
  assert.equal(orderLabel({ kind: "idle" }, { x: 1, z: 1 }, false), "holding");
  assert.equal(orderLabel({ kind: "lock", target: "enemy-0" }, null, false), "fighting");
  assert.equal(orderLabel({ kind: "attack-move", destination: { x: 1, z: 1 } }, null, false), "attack-moving");
  assert.equal(orderLabel({ kind: "force", points: [{ x: 1, z: 1 }], drawing: false }, null, false), "force-moving");
});
