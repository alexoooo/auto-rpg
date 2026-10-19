/**
 * **A native action's cycle completes** (`nativeCycle`, `tests/fixtures/native-actions.mjs`; the
 * core stand, Node, Rapier, 120 Hz): a kick, a whole-body strike and the two low strikes prepare,
 * commit, release and complete; the low ones lower and rise again through the support fold, which
 * stands again unready.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { nativeCycle } from "./fixtures/native-actions.mjs";

for (const kind of ["kick", "whole", "low", "low-wide"]) test(`a native ${kind} prepares, commits and physically returns through the action compositor`, async () => {
  const cycle = await nativeCycle(kind);
  assert.deepEqual(cycle.phases, ["prepare", "commit", "release"], JSON.stringify({ stages: cycle.stages, ledger: cycle.ledger }));
  assert.deepEqual(cycle.ledger[0].ending, { kind: "completed" });
  assert.equal(cycle.ledger[0].committed, true);
  if (kind.startsWith("low")) {
    assert.equal(cycle.stages.includes("lower"), true);
    assert.equal(cycle.stages.includes("rise"), true);
    assert.deepEqual(cycle.support, { ...cycle.support, stage: "stand", ready: false });
  }
});
