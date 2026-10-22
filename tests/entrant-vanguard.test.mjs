import test from "node:test";
import assert from "node:assert/strict";
import { buildBout } from "../src/evaluation/bout.ts";
import { traceOf } from "../src/evaluation/trace.ts";
import { CONTROLLERS } from "../src/core/mind/controllers.ts";
import { saveState } from "../src/core/state.ts";
import { BOUT_ENGINE } from "../research/bout.mjs";

test("a committed body-relative punch forks during its stroke and returns exactly", async () => {
  const config = { ...CONTROLLERS.vanguard.defaults, commitAim: true };
  const built = await buildBout({ left: "workshop-fighter", right: "workshop-fighter", gap: .9,
    minds: { left: config, right: config } }, { engine: BOUT_ENGINE });
  try {
    const { duel, world } = built;
    duel.play([]);
    const striking = () => duel.duelists.left.minded.skills.report.actions.some(action => action.phase === "commit");
    // The ordinary mind smoke test forks before this stroke has selected its body-relative aim.
    while (duel.clock < 3 && !striking()) world.step();
    assert.ok(striking(), "the fixture reaches a committed punch before its deadline");
    const saved = duel.save(), until = duel.steps + world.hz / 2;
    const tail = () => {
      const trace = traceOf([duel.duelists.left.built, duel.duelists.right.built]);
      while (duel.steps < until) { world.step(); trace.take(); }
      return { trace: trace.digest(), minds: saveState({ left: duel.duelists.left.minded.state, right: duel.duelists.right.minded.state }) };
    };
    const first = tail();
    duel.load(saved);
    assert.ok(striking(), "the loaded fork restores the live commitment");
    assert.deepEqual(tail(), first, "both the moving aim and recovery survive the fork to the bit");
  } finally { built.dispose(); }
});
