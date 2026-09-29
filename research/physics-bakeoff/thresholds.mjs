/**
 * **The pass marks, written down before any other engine was swept.** Two bars:
 *
 * - `today`: at least as well as Havok does today.
 *   - Case A (the standing foot): the shared torque law cannot stand Havok at any setting tried
 *     (1-16 sub-steps, foot x1 and x100, `fidelity.mjs`), so today's standing foot is read off
 *     the core's own stance, in-solver velocity motors, foot x100, the Warrior on both feet for
 *     10 s at 120 Hz (`baseline-today.mjs`, Node stand): standing, foot RMS spin 0.00037 rad/s,
 *     largest foot tilt 0.39 deg, centre of mass drift 6.6 mm over 1-10 s. The spin mark is floored
 *     at 0.01 rad/s (0.6 deg/s, which nothing on screen shows); tilt and drift are today's,
 *     rounded up.
 *   - Case B (the forearm chain): Havok today, the shared law, 120 Hz, one solver step, Havok's
 *     default damping (0.1 angular, as the core's bodies have it): hand jitter 0.289 rad/s, wrist
 *     jitter 0.609 rad/s, ringing 0.2411 rad/s (marks rounded up), elbow deviation from the reference 0.0388 rad
 *     (`fidelity.mjs reference`, Node); the reference rings at 0.0784 rad/s.
 * - `clean`: what the fine reference reaches, within floors a player could not see: case A
 *   spin 0.01 rad/s, tilt 0.1 deg, drift 1 mm; case B jitter 0.01 rad/s both, deviation 0.01 rad
 *   from the reference, ringing within 0.01 rad/s of the reference's.
 *
 * The reference is MuJoCo at 16 sub-steps (1920 Hz), default solver; Rapier and Havok at 16
 * sub-steps are compared with it in `fidelity.mjs reference`.
 */
export const REFERENCE = { engine: "mujoco", hz: 120, substeps: 16 };

export const TODAY_A = { footSpinRms: 0.01, footTiltMaxLate: 0.4, comDrift: 7 };
export const TODAY_B = { handJitterRms: 0.289, wristJitterRms: 0.609, ringRms: 0.242, deviation: 0.039 };
export const CLEAN_A = { footSpinRms: 0.01, footTiltMaxLate: 0.1, comDrift: 1 };
export const CLEAN_B = { handJitterRms: 0.01, wristJitterRms: 0.01, deviation: 0.01, ringExcess: 0.01, ringReference: 0.0784 };

export function judgeA(r) {
  const within = (bar) => r.standing && r.footSpinRms <= bar.footSpinRms && r.footTiltMaxLate <= bar.footTiltMaxLate && r.comDrift <= bar.comDrift;
  return { today: within(TODAY_A), clean: within(CLEAN_A) };
}

export function judgeB(r) {
  const today = r.handJitterRms <= TODAY_B.handJitterRms && r.wristJitterRms <= TODAY_B.wristJitterRms && r.ringRms <= TODAY_B.ringRms
    && (TODAY_B.deviation === null || r.deviation <= TODAY_B.deviation);
  const clean = r.handJitterRms <= CLEAN_B.handJitterRms && r.wristJitterRms <= CLEAN_B.wristJitterRms && r.deviation <= CLEAN_B.deviation
    && (CLEAN_B.ringReference === null || r.ringRms <= CLEAN_B.ringReference + CLEAN_B.ringExcess);
  return { today, clean };
}
