import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { modelSpec } from "../src/core/models.ts";
import { rulebook } from "../src/core/rules/rulebook.ts";
import { predictor } from "../src/core/entrants/option-skeleton/options/percepts.ts";
import { MINDS } from "../src/core/mind/controllers.ts";
import { treeFaults, treeRefusal } from "../src/core/mind/catalog.ts";
import { createMind } from "../src/core/mind/minds.ts";
import { groundPlacement } from "../src/lab/ground-starts.ts";
import { coreStand, saveStand, loadStand } from "./harness/core-stand.mjs";
import { traceOf } from "../src/evaluation/trace.ts";
import { SKELETON_GUARD } from "../src/core/entrants/option-skeleton/guard.ts";
import { withLoadout } from "../src/core/items/held.ts";
import { guardPosture } from "../src/core/skills/guard.ts";
import { saveState, loadState } from "../src/core/state.ts";

test("recovery retains an opportunity cost against a foe with no modelled hand attack", () => {
  const spec = modelSpec("crypt-skeleton"), foe = modelSpec("reptile");
  const reading = predictor();
  const cost = (seconds, stands) => {
    reading.reset({ spec, hz: 120, rules: rulebook("arena"), strikes: [], measured: [],
      focus: { spec: foe, centre: new Vector3(0, 0.3, 1), segments: new Map(), down: false, time: 0 },
      sight: { view: { head: new Vector3(0, 1.7, 0), stance: { centre: Vector3.Zero() },
        senses: { life: 1 }, time: 0.15 }, report: { ledger: [], actions: [] } },
      riseFrom: () => ({ seconds, stands, shelter: 0 }) });
    return reading.predictions.downCostAt("back");
  };
  const ordinary = cost(2, 1);
  assert.ok(ordinary > 0, "losing the ability to attack must still make lying down costly");
  assert.ok(cost(4, 1) > ordinary, "a longer recovery loses more opportunity");
  assert.ok(cost(2, 0.5) > ordinary, "failed attempts lose more opportunity");
  assert.equal(cost(2, 0), 1, "no route up costs the life that remains");
});

test("a sensed blade changes the captured guard rest in place, including across a fork", () => {
  const spec = modelSpec("crypt-skeleton"), config = { ...SKELETON_GUARD.defaults, shoulder: .9, abduction: .2, elbow: .6 };
  const guard = SKELETON_GUARD.make({ spec }, config), captured = guard.posture;
  const sword = withLoadout(spec, { left: "empty", right: "sword" }), club = withLoadout(spec, { left: "empty", right: "club" });
  const seen = others => ({ senses: { side: "blue", others } });
  const foe = spec => ({ spec, side: "red", out: false });
  const high = SKELETON_GUARD.posture(spec, { ...config, againstBlades: false }), ordinary = guardPosture(spec);
  assert.deepEqual(captured, ordinary, "without a sensed blade the configured rest is the ordinary guard");
  guard.command(seen([{ spec: sword, side: "blue", out: false }, foe(club)]), {});
  assert.equal(guard.posture, captured, "the arbiter and the punch retain this same rest object");
  assert.deepEqual(captured, ordinary, "an ally's blade does not select the raised guard");
  guard.command(seen([foe(sword)]), {});
  assert.deepEqual(captured, high, "the real held blade selects the caller's raised pose");
  const saved = saveState(guard.state);
  guard.command(seen([foe(spec)]), {});
  assert.deepEqual(captured, ordinary);
  loadState(guard.state, saved);
  assert.equal(guard.posture, captured);
  assert.deepEqual(captured, high, "loading restores the pose through the captured reference");
  assert.deepEqual(saveState(guard.state), saved);
});

test("a private recovery selected through the entrant's config runs and forks with its body", async () => {
  const spec = modelSpec("crypt-skeleton"), config = { ...MINDS["option-skeleton"].config,
    chooser: { kind: "skeleton-ranked", depth: 1 }, ground: [{ kind: "skeleton-recovery" }] };
  assert.deepEqual(treeFaults(config), []);
  assert.equal(treeRefusal(spec, config), null);
  const placement = groundPlacement(spec, { seed: 0, ground: { start: "placed", posture: "back", level: "open", degrees: null, impulse: null, foe: 0, gusts: false } }, undefined, .02);
  assert.ok(!("refused" in placement), "the placed back fixture is geometrically valid");
  const stand = await coreStand(spec, { ...placement, engine: "rapier-coordinate" });
  const made = createMind(stand.built, stand.world, config, { name: "private recovery contract", orders: () => null });
  try {
    let entered = false;
    for (let n = 0; n < 90; n++) {
      stand.step();
      entered ||= made.skills.report.actions.some(action => action.action === "skeleton-recovery" && action.phase === "commit");
    }
    assert.ok(entered, "the configured private recovery actually takes the body before the fork");
    const states = { mind: made.state, body: made.body.state }, saved = saveStand(stand.world, states);
    const tail = traceOf([stand.built]);
    for (let n = 0; n < 120; n++) { stand.step(); tail.take(); }
    const end = saveStand(stand.world, states);
    loadStand(stand.world, states, saved);
    const resumed = traceOf([stand.built]);
    for (let n = 0; n < 120; n++) { stand.step(); resumed.take(); }
    assert.equal(resumed.digest(), tail.digest(), "restoring the active private technique reproduces every pose");
    assert.deepEqual(saveStand(stand.world, states).state, end.state, "the complete world, body and mind state resumes to the bit");
  } finally { made.body.dispose(); stand.dispose(); }
});
