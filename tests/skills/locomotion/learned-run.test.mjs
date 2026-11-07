import "../../harness/preload-data.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { coreStand } from "../../harness/core-stand.mjs";
import { modelSpec } from "../../../src/core/bodies/models.ts";
import { stockBody } from "../../../src/app/stock-body.ts";
import { decisionSteps } from "../../../src/core/math/learning/learner.ts";
import { guardPosture } from "../../../src/skills/guard/guard.ts";
import { walkRun, WALK_RUN, WALK_RUN_CYCLE } from "../../../src/skills/locomotion/walk-run.ts";
import { learnedRun, TRAVEL_LAYOUT } from "../../../src/skills/locomotion/learned-run.ts";
import { decide, untilAsked } from "../../../research/learner-adapter.mjs";

/** A fixed network whose outputs differ by channel. */
const network = (seed, { inputs, actions }) => ({ actions, layers: [{
  weights: Array.from({ length: actions }, (_, i) => Array.from({ length: inputs }, (_, j) => Math.sin(seed + 3 * i + j) * .02)),
  bias: Array.from({ length: actions }, (_, i) => Math.cos(seed + i) * .3),
}] });

test("a travel answer acts over exactly its own decision interval", async () => {
  const spec = modelSpec("workshop-fighter"), guard = guardPosture(spec);
  const stand = await coreStand(spec, { ground: true, groundSize: 400, posture: guard });
  let host;
  try {
    host = stockBody(stand.built, stand.world, { servoSeconds: .1, measuring: true });
    const body = host.driver, pace = 1;
    const settings = { travel: network(1, { inputs: TRAVEL_LAYOUT.inputs.length, actions: TRAVEL_LAYOUT.outputs.length }),
      reference: network(3, { inputs: 49, actions: 12 }), velocityScale: .01, referenceScale: 0,
      interval: 1 / 30, entry: "landing", trim: "continuous",
      stanceScale: { height: 0, heading: 0 } };
    const run = learnedRun(body, walkRun(body, WALK_RUN, WALK_RUN_CYCLE), settings, WALK_RUN_CYCLE.settle);
    const { learner, inference } = run.state;
    let goal = null;
    body.drive((view, dt) => {
      const d = run.goal(view, { walk: [pace, 0], face: 0 }, dt);
      if (d.kind === "drive") return { posture: { ...guard, ...d.posture }, pushes: d.pushes, stance: null };
      goal = d.goal ?? goal;
      return { posture: guard, pushes: [], stance: view.time > 0 ? goal : null };
    });
    const applied = [], step = () => { stand.step(); applied.push(inference.action.slice()); return { reward: 0, ended: null }; };
    assert.equal(untilAsked(learner, step, 8), "asked", "the fixture's travel learner must ask while walking");
    assert.ok(learner.running, "the fixture must use the shared travel learner");
    const interval = decisionSteps(learner, stand.world.dt), transitions = [];
    for (let n = 0; n < 8; n++) {
      const answer = Array.from({ length: TRAVEL_LAYOUT.outputs.length }, (_, i) => Math.sin(5 * n + i));
      applied.length = 0;
      const played = decide(learner, answer, step, stand.world.dt);
      transitions.push({ steps: played.steps, applied: applied.slice(),
        expected: answer });
    }
    for (const [n, transition] of transitions.entries()) {
      assert.equal(transition.steps, interval, `transition ${n} covers its interval`);
      for (const action of transition.applied) assert.deepEqual(action, transition.expected, `transition ${n} acts on its own answer`);
    }
  } finally { host?.dispose(); stand.dispose(); }
});
