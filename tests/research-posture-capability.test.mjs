/**
 * **Whether the posture audit's statics hold the engine's body** (`research/core-posture-trials.mjs`),
 * measured on the core world, Rapier, 120 Hz, and not a gate (`tests/experimental.json`): the
 * statics' torques hold the body still where a flipped torque or none do not, and standing put on
 * the engine stays, held by its motors (the audit's reference solver) and handed to its stance (the
 * game's, `SOLVERS`), while a deep squat at a tenth of its strength falls. The statics alone are
 * `research-posture.test.mjs`'s.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { pointOfToRef } from "../src/core/control/support.ts";
import { modelSpec } from "../src/core/models.ts";
import { STANCE_LOWER } from "../src/core/skills/locomotion.ts";
import {
  AUDITED, handed, held, jointMomentsOf, leastShare, placeLike, posed, project, recordOf, rowNamed, search, staticBody,
} from "../research/core-posture-trials.mjs";
import { coreStand } from "./harness/core-stand.mjs";

const body = await staticBody();
test.after(() => body.dispose());

const near = (a, b, within, what) => assert.ok(Math.abs(a - b) <= within, `${what}: ${a} against ${b}`);

/** The reference pose put on both soles. */
function standing() {
  const row = rowNamed("stand"), start = { height: 1, pitch: 0, roll: 0, angles: body.freedoms.map(() => 0) };
  return { row, posture: project(body, row, start, { knobs: [] }).posture };
}

/** A row's searched answer, few evaluations, seed 0, as its record. */
function answer(row, { height, evals = 300, variant } = {}) {
  return recordOf(body, row, search(body, row, { evals, height, variant }), { height, variant });
}

test("the statics' torques hold the engine's body still", async () => {
  const spec = modelSpec(AUDITED);
  for (const name of ["fours", "half kneel"]) {
    const row = rowNamed(name), record = answer(row, { evals: 300 });
    assert.ok(record.held, name);
    posed(body, record.posture);
    const solved = leastShare(body, row, record.posture, { snap: true });
    const moments = jointMomentsOf(body, record.posture, solved.torques);
    // The segments' mean speed, its most over 0.1 s, the body put on the ground with nothing to fall,
    // its joints given these moments and its motors off. Held by torques that do not answer its motion,
    // on all fours an arm buckles, growing from about 0.1 s.
    const fastest = async (given) => {
      const stand = await coreStand(spec);
      try {
        posed(body, record.posture);
        placeLike(body, stand.built, 0);
        let peak = 0;
        const v = new Vector3();
        for (let step = 0; step < stand.seconds(0.1); step++) {
          body.joints.forEach((joint, j) => {
            const child = stand.built.segments.get(joint.child.spec.name), parent = stand.built.segments.get(joint.parent.spec.name);
            child.body.applyTorque(given[j]);
            parent.body.applyTorque(given[j].scale(-1));
          });
          stand.step(1);
          let mean = 0;
          for (const segment of stand.built.segments.values()) mean += segment.body.linearVelocityToRef(v).length() / stand.built.segments.size;
          peak = Math.max(peak, mean);
        }
        return peak;
      } finally { stand.dispose(); }
    };
    const still = await fastest(moments);
    // The largest torque's sign flipped, and no torque at all.
    const largest = solved.torques.reduce((best, t, i) => (Math.abs(t) > Math.abs(solved.torques[best]) ? i : best), 0);
    const flipped = jointMomentsOf(body, record.posture, solved.torques.map((t, i) => (i === largest ? -t : t)));
    const wrong = await fastest(flipped), limp = await fastest(moments.map(() => new Vector3()));
    assert.ok(still < 0.04, `${name}: held by the statics' torques, the segments moved ${still} m/s`);
    assert.ok(wrong > 3 * still, `${name}: ${body.freedoms[largest].name}'s torque turned, ${wrong} m/s`);
    assert.ok(limp > 8 * still, `${name}: limp, ${limp} m/s`);
  }
});

test("standing put on the engine stays, held by its motors and handed to its stance; a deep squat at a tenth of its strength falls", async () => {
  const { posture } = standing();
  const stand = await held({ row: "stand", posture });
  assert.deepEqual(Object.keys(stand), ["row", "variant", "drive", "solver", "k", "stayed", "drift", "worst", "peak", "touched", "leant"]);
  assert.deepEqual([stand.row, stand.solver, stand.stayed, stand.touched, stand.leant], ["stand", "reference", true, ["foot.left", "foot.right"], []]);
  // A squat that stays at its whole strength, held at a tenth of it: its share is over a tenth.
  const squat = answer(rowNamed("squat"), { height: 0.7 });
  assert.ok(squat.share > 0.1, `the squat asks ${squat.share} of its strength`);
  const whole = await held({ row: "squat", posture: squat.posture, k: 1 }), weak = await held({ row: "squat", posture: squat.posture, k: 0.1 });
  assert.ok(whole.stayed, `the squat at its whole strength moved ${whole.drift} m`);
  assert.ok(!weak.stayed && weak.drift > 0.1, `the squat at a tenth of its strength moved ${weak.drift} m`);
  // Handed to its stance standing, it ends where the stance asks: standing's centre, STANCE_LOWER down.
  const handed_ = await handed({ row: "stand", posture });
  posed(body, posture);
  const up = body.segments.reduce((sum, s) => sum + pointOfToRef(s, s.rigid.centre, new Vector3()).y * s.rigid.mass, 0) / body.mass;
  assert.deepEqual([handed_.solver, handed_.stood, handed_.down], ["game", true, false]);
  near(handed_.centre, up - STANCE_LOWER, 0.05, "the handed body's centre, m");
});
