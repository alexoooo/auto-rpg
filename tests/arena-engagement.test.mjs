import test from "node:test";
import assert from "node:assert/strict";
import { targetWindow } from "../src/core/control/target-window.ts";
import { engagementArena, engagementTrial, orderOpponent } from "../research/arena-engagement.mjs";
import { STAND_ORDERS } from "../src/core/mind/orders.ts";
import { saveState } from "../src/core/state.ts";
import { traceOf } from "./harness/trace.mjs";

test("engagement window measures forward range and lateral clearance, including targets behind", () => {
  const range = { reach: .5, along: [-.1, .2] };
  assert.equal(targetWindow([0, 1, 0], 0, [0, 1, .5], range, .1).inside, true);
  assert.equal(targetWindow([0, 1, 0], 0, [0, 1, .35], range, .1).inside, false);
  assert.equal(targetWindow([0, 1, 0], 0, [0, 1, .75], range, .1).inside, false);
  assert.equal(targetWindow([0, 1, 0], 0, [.11, 1, .5], range, .1).inside, false);
  assert.equal(targetWindow([0, 1, 0], 0, [0, 1, -.5], range, .1).inside, false);
});

test("tracked engagement makes repeated useful right-hand cycles against a guarded arena opponent", async () => {
  const result = await engagementTrial({ engagement: "tracked", held: "empty", hand: "right", motion: "stationary", gap: 2.4 });
  assert.ok(result.usefulReturns >= 3, JSON.stringify(result));
  assert.equal(result.falls, 0);
});

test("ordered standing suppresses pursuit and moving-opponent engagement forks into a fresh Duel", async () => {
  const config = { engagement: "tracked", gap: 2.4, hand: "alternate" };
  const a = await engagementArena(config), b = await engagementArena(config);
  try {
    a.duel.order(a.side, STAND_ORDERS); a.world.step(180);
    assert.equal(a.fighter.minded.skills.report.engagement.phase, "guard");
    assert.equal(a.fighter.minded.skills.report.strike.hand, null);
    a.duel.order(a.side, null);
    for (let i = 0; i < 240; i++) { orderOpponent(a, "lateral", i); a.world.step(); }
    const saved = a.duel.save(); b.duel.load(saved);
    const traces = [a, b].map(s => traceOf(Object.values(s.duel.duelists).map(d => d.built)));
    for (let i = 240; i < 960; i++) for (const [k, stand] of [a, b].entries()) {
      orderOpponent(stand, "lateral", i); stand.world.step(); traces[k].take();
    }
    assert.deepEqual(saveState(a.duel.state), saveState(b.duel.state));
    assert.equal(traces[0].digest(), traces[1].digest());
  } finally { a.dispose(); b.dispose(); }
});
