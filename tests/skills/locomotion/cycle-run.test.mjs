import "../../harness/preload-data.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { coreStand } from "../../harness/core-stand.mjs";
import { modelSpec } from "../../../src/core/bodies/models.ts";
import { stockBody } from "../../../src/app/stock-body.ts";
import { Vector3 } from "../../../src/core/math/vector.ts";
import { guardPosture } from "../../../src/skills/guard/shared/guard.ts";
import { runCycle } from "../../../src/skills/locomotion/walk-run/walk-run/cycle-run.ts";
import { WALK_RUN_CYCLE } from "../../../src/skills/locomotion/walk-run/walk-run/walk-run.ts";
import { legOf } from "../../../src/skills/locomotion/shared/leg.ts";

test("run cadence scales clip feedforward with the reference phase", async () => {
  const spec = modelSpec("man");
  const stand = await coreStand(spec, { gravity: false, ground: false, posture: guardPosture(spec), engine: "rapier-coordinate" });
  let host;
  try {
    host = stockBody(stand.built, stand.world, { servoSeconds: .1, measuring: true });
    stand.step();
    const body = host.commanded, channel = body.muscles.channel("knee.right flexion"), angle = body.muscles.angle(channel), dt = 1 / stand.world.hz;
    const stance = { ...body.view.stance, velocity: new Vector3(0, 0, 4),
      ends: Object.fromEntries(Object.entries(body.view.stance.ends).map(([name, end]) => [name, { ...end, touching: false }])) };
    const view = Object.create(body.view, { stance: { value: stance } });
    const read = (cadence, phase, settle) => {
      const tuning = { ...WALK_RUN_CYCLE, wait: 0, settle };
      const cycle = runCycle(body, tuning, legOf(spec), 1, tuning, { steer: () => ({
        swingHip: 0, swingOut: 0, swingKnee: 0, swingAnkle: 0, stanceKnee: 0, stanceAnkle: 0,
        stanceRoll: 0, lean: 0, bank: 0, cadence, pace: 0, effort: 0,
      }) });
      cycle.begin(view, 0, "left"); cycle.state.phase = phase;
      const push = cycle.drive(view, dt, 0, 4).pushes.find(push => push.channel === "knee.right flexion");
      assert.ok(push, "the fixture must command its knee channel");
      return { requested: push.speed, phase: cycle.state.phase };
    };
    // Two servo times separate the reference's derivative from its pose-error correction.
    const reference = (cadence, phase) => {
      const a = read(cadence, phase, .1), b = read(cadence, phase, .2);
      const feedforward = (.2 * b.requested - .1 * a.requested) / (.2 - .1);
      return { feedforward, angle: angle + .1 * (a.requested - feedforward), phase: a.phase };
    };
    for (const cadence of [0, .2, -.2]) {
      const phase = .12, h = 1e-6, centre = reference(cadence, phase);
      const lo = reference(cadence, phase - h), hi = reference(cadence, phase + h);
      const derivative = (hi.angle - lo.angle) / (hi.phase - lo.phase), phaseRate = (centre.phase - phase) / dt;
      const expected = derivative * phaseRate;
      assert.ok(Math.abs(expected) > .1, "the fixture must read a moving reference");
      assert.ok(Math.abs(centre.feedforward - expected) < 1e-6,
        JSON.stringify({ recipe: "Warrior airborne controller, 120 Hz, 4 m/s view, no landing resets", cadence, expected, actual: centre.feedforward }));
    }
  } finally { host?.dispose(); stand.dispose(); }
});
