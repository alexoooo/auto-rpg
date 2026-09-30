/**
 * **The pass marks, fixed before the engines were swept.** Two bars:
 *
 * - `today`: the baseline bar, rounded up from the baseline readings REPORT.md records (its Setup).
 *   - Case A (the standing foot): standing, with foot spin at most 0.01 rad/s (0.6 deg/s, which
 *     nothing on screen shows), foot tilt 0.4 deg and centre of mass drift 7 mm over 1-10 s.
 *   - Case B (the forearm chain): hand jitter 0.289 rad/s, wrist jitter 0.609 rad/s, ringing
 *     0.242 rad/s, and elbow deviation 0.039 rad from the reference.
 * - `clean`: what the fine reference reaches, within floors a player could not see: case A
 *   spin 0.01 rad/s, tilt 0.1 deg, drift 1 mm; case B jitter 0.01 rad/s both, deviation 0.01 rad
 *   from the reference, ringing within 0.01 rad/s of the reference's.
 *
 * The reference is MuJoCo at 16 sub-steps (1920 Hz), default solver; it rings at 0.0784 rad/s.
 * `fidelity.mjs reference` compares the other engines at 16 sub-steps with it.
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
