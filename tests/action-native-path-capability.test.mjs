/**
 * **A native path action completes** (`nativeJab`, `tests/fixtures/native-actions.mjs`; the core
 * stand, Node, Rapier, 120 Hz): a jab of either hand, empty or with a club, prepares, commits and
 * releases, and the ledger records it completed.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { nativeJab } from "./fixtures/native-actions.mjs";

for (const side of ["left", "right"]) for (const held of ["empty", "club"]) test(`a ${side} native path action with ${held} prepares, commits, releases and completes`, async () => {
  const jab = await nativeJab(side, held);
  assert.deepEqual(jab.phases, ["prepare", "commit", "release"], JSON.stringify(jab.ledger));
  assert.ok(jab.committed >= 10, "withdrawal does not truncate the committed stroke");
  assert.equal(jab.ledger[0].ending.kind, "completed", JSON.stringify(jab.ledger[0].ending));
  assert.equal(jab.ledger[0].committed, true);
});
