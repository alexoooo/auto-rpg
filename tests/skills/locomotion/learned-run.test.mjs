import "../../harness/preload-data.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { coreStand } from "../../harness/core-stand.mjs";
import { modelSpec } from "../../../src/core/bodies/models.ts";
import { commandedBody } from "../../../src/app/commanded-body.ts";
import { recoveryNetwork } from "../../../src/core/math/learning/recovery-network.ts";
import { decisionSteps } from "../../../src/core/math/learning/learner.ts";
import { guardPosture } from "../../../src/skills/guard/guard.ts";
import { walkRun, WALK_RUN, WALK_RUN_CYCLE } from "../../../src/skills/locomotion/walk-run.ts";
import { learnedRun } from "../../../src/skills/locomotion/learned-run.ts";
import { decide, untilAsked } from "../../../research/learner-adapter.mjs";

/** A fixed 49-input, twelve-action network whose outputs differ by channel. */
const network = (seed) => ({ actions: 12, layers: [{
  weights: Array.from({ length: 12 }, (_, i) => Array.from({ length: 49 }, (_, j) => Math.sin(seed + 3 * i + j) * .02)),
  bias: Array.from({ length: 12 }, (_, i) => Math.cos(seed + i) * .3),
}] });

test("a steered low-speed answer acts over exactly its own decision interval, blended with the decision's velocity actor", async () => {
  const spec = modelSpec("workshop-fighter"), guard = guardPosture(spec);
  const stand = await coreStand(spec, { ground: true, groundSize: 400, posture: guard });
  let host;
  try {
    host = commandedBody(stand.built, stand.world, { servoSeconds: .1, measuring: true });
    const body = host.driver, pace = 1;
    const settings = { velocity: network(1), braking: network(2), reference: network(3), velocityScale: .01, referenceScale: 0,
      interval: 1 / 30, entry: "landing", trim: "continuous", steered: "slow-velocity",
      slowVelocity: { fullPace: .5, untilPace: 1.5, network: network(4) } };
    const run = learnedRun(body, walkRun(body, WALK_RUN, WALK_RUN_CYCLE), settings, WALK_RUN_CYCLE.settle);
    const { learner, inference } = run.state, velocity = recoveryNetwork(settings.velocity), share = (1.5 - pace) / (1.5 - .5);
    let goal = null;
    body.drive((view, dt) => {
      const d = run.goal(view, { walk: [pace, 0], face: 0 }, dt);
      if (d.kind === "drive") return { posture: { ...guard, ...d.posture }, pushes: d.pushes, stance: null };
      goal = d.goal ?? goal;
      return { posture: guard, pushes: [], stance: view.time > 0 ? goal : null };
    });
    const applied = [], step = () => { stand.step(); applied.push(inference.velocityAction.slice()); return { reward: 0, ended: null }; };
    assert.equal(untilAsked(learner, step, 8), "asked", "the fixture's learner must ask while walking in its blend band");
    assert.ok(learner.running && share > 0 && share < 1, "the fixture must decide inside the low-speed band");
    const interval = decisionSteps(learner, stand.world.dt), transitions = [];
    for (let n = 0; n < 8; n++) {
      const fast = velocity(learner.inputs), answer = Array.from({ length: 12 }, (_, i) => Math.sin(5 * n + i));
      applied.length = 0;
      const played = decide(learner, answer, step, stand.world.dt);
      transitions.push({ steps: played.steps, applied: applied.slice(),
        expected: fast.map((value, i) => value + share * (answer[i] - value)) });
    }
    for (const [n, transition] of transitions.entries()) {
      assert.equal(transition.steps, interval, `transition ${n} covers its interval`);
      for (const action of transition.applied) assert.deepEqual(action, transition.expected, `transition ${n} acts on its own answer`);
    }
  } finally { host?.dispose(); stand.dispose(); }
});
