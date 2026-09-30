/**
 * **Today's standing foot, as the core stands it**: the Warrior (`humanSpec("workshop-fighter")`)
 * on both feet under the core's stance (`createBody`, velocity motors met inside Havok's solver),
 * asked to stand 3 cm under its reference height at the guard, for 10 s, Havok at 120 Hz, foot
 * conditioning x100 (`STANCE_FOOT_CONDITIONING`) and x1. Reads what case A reads: each foot's RMS
 * angular speed and largest tilt over 1-10 s, the centre of mass's drift and wander over 1-10 s.
 * These anchor case A's pass marks: the shared torque law cannot stand Havok at all, so "as well
 * as today" is read off the core's own stance. Node stand (tests/harness/core-stand.mjs).
 *
 * **It reproduces only at commit eaa182e5.** The core has since moved to Rapier and its stance to
 * torques through the body's floating-base dynamics, with no foot conditioning; here the
 * `footConditioning` it passes is no longer read, and both runs stand the same stance. Its numbers
 * in `REPORT.md` and `thresholds.mjs` are that commit's.
 *
 *     git checkout eaa182e5 && node research/physics-bakeoff/baseline-today.mjs
 */
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { createBody } from "../../src/core/body.ts";
import { humanSpec } from "../../src/core/human/spec.ts";
import { coreStand } from "../../tests/harness/core-stand.mjs";

const GUARD = {
  "shoulder.right flexion": 0.5, "shoulder.right abduction": -0.2, "elbow.right flexion": 1.3,
  "shoulder.left flexion": 0.5, "shoulder.left abduction": -0.2, "elbow.left flexion": 1.3,
};

async function standToday(footConditioning, seconds = 10) {
  const stand = await coreStand(humanSpec("workshop-fighter"), { ground: true, hz: 120 });
  const body = createBody(stand.built, stand.world, { servoSeconds: 0.1, stance: { footConditioning } });
  const feet = ["left", "right"].map((side) => stand.built.segments.get(`foot.${side}`));
  const spin = [[], []], tilt = [[], []];
  let goal = null, late = null, wander = 0, standing = true;
  const w = new Vector3(), q = new Quaternion(), up = new Vector3();
  body.drive((view) => {
    const s = view.stance;
    if (!goal && view.time > 0) goal = { feet: ["left", "right"], centre: null, height: s.centre.y - s.support.y - 0.03, heading: 0 };
    if (view.time >= 1) {
      if (!late) late = s.centre.clone();
      wander = Math.max(wander, Math.hypot(s.centre.x - late.x, s.centre.z - late.z));
      feet.forEach((foot, k) => {
        foot.body.getAngularVelocityToRef(w);
        spin[k].push(w.length());
        foot.node.rotationQuaternion.multiplyToRef(Quaternion.Inverse(foot.rest), q);
        new Vector3(0, 1, 0).applyRotationQuaternionToRef(q, up);
        tilt[k].push((Math.acos(Math.min(1, up.y)) * 180) / Math.PI);
      });
    }
    return { posture: GUARD, hands: { left: null, right: null }, pushes: [], stance: goal };
  });
  try {
    stand.step(stand.seconds(seconds));
    const s = body.view.stance;
    standing = s.centre.y - s.support.y > 0.8 * goal.height;
    const rms = (xs) => Math.sqrt(xs.reduce((a, x) => a + x * x, 0) / xs.length);
    return {
      footConditioning, standing,
      footSpinRms: Math.max(...spin.map(rms)),
      footTiltMaxLate: Math.max(...tilt.flat()),
      comDrift: Math.hypot(s.centre.x - late.x, s.centre.z - late.z) * 1000,
      comWander: wander * 1000,
    };
  } finally { body.dispose(); stand.dispose(); }
}

for (const k of [100, 1]) console.log(JSON.stringify(await standToday(k)));
