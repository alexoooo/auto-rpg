/**
 * **How the Arena fighter rises and strikes in the control trials** (`research/arena-control-trials.mjs`;
 * Node Arena duel, Rapier, 120 Hz, no assist): rising from four shoves and walking, recovering twice
 * and striking again, and both hands and the club striking a box and returning.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { recoveryCycle, strikeCycle } from "../research/arena-control-trials.mjs";

test("Warrior rises from four arena shove directions and executes a commanded walk", async (t) => {
  for (const direction of [0, 1, 2, 3]) {
    const result = await recoveryCycle({ held: "empty", direction });
    assert.equal(result.success, true, JSON.stringify(result));
    assert.equal(result.trials[0].acquired, true);
    assert.deepEqual(result.assist, { force: 0, moment: 0 });
    t.diagnostic(JSON.stringify({ direction, trial: result.trials[0] }));
  }
});

test("empty hands and a retained club recover twice, walk, and resume actual strike-and-return cycles", async (t) => {
  for (const held of ["empty", "club"]) {
    const result = await recoveryCycle({ held, direction: 0, repeat: 2, attack: true, seconds: 180 });
    assert.equal(result.success, true, JSON.stringify(result));
    assert.equal(result.trials.length, 2);
    assert.ok(result.trials.every((r) => r.acquired && r.walk.steps > 0 && !r.walk.fell));
    assert.ok(result.attack.impacts.length >= 2);
    assert.ok(result.attack.returned.right >= 2);
    assert.equal(result.attack.fell, false);
    assert.deepEqual(result.assist, { force: 0, moment: 0 });
    t.diagnostic(JSON.stringify({ held, recovery: result.trials.map((r) => r.seconds), returns: result.attack.returned, failedReturns: result.attack.failed }));
  }
});

test("both hands strike and return repeatedly after contact and misses", async (t) => {
  for (const mode of ["hit", "miss"]) {
    const result = await strikeCycle({ held: "empty", hand: "alternate", mode });
    assert.equal(result.fell, false);
    t.diagnostic(JSON.stringify({ mode, returned: result.returned, failed: result.failed }));
    for (const hand of ["left", "right"]) {
      assert.ok(result.returned[hand] >= 3, JSON.stringify(result));
      if (mode === "hit") assert.ok(result.impacts.some((i) => i.hand === hand && i.closing > 0), JSON.stringify(result));
    }
    if (mode === "miss") { assert.equal(result.contactSteps, 0); assert.deepEqual(result.impacts, []); }
    // Every stroke thrown has ended, returned or not, but for the one under way.
    const sum = (record) => record.left + record.right, open = sum(result.thrown) - sum(result.returned) - result.failed - result.interrupted;
    assert.ok(open >= 0 && open <= 1, JSON.stringify(result));
  }
});

test("every return is verified, and the club strikes and returns after contact and misses", async () => {
  for (const mode of ["hit", "miss"]) for (const config of [{ held: "empty", hand: "alternate" }, { held: "club", hand: "right" }]) {
    const result = await strikeCycle({ ...config, mode });
    assert.equal(result.fell, false); assert.equal(result.failed, 0);
    assert.ok(result.returned.right >= 3, JSON.stringify(result));
    if (mode === "hit") assert.ok(result.impacts.some((i) => i.hand === "right" && i.closing > 0), JSON.stringify(result));
  }
});
