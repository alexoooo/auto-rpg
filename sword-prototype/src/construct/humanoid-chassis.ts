/**
 * The fixed Swordbearer is a purpose-built stone automaton, not a scale switch hidden in the
 * renderer.  These values are the collision primitives which the carrier, combat and shell
 * presentation all share.  Keeping them in one immutable profile makes a visibly slimmer body
 * a physically slimmer body as well.
 *
 * Both narrower candidates are retained for later work but rejected by the current physical
 * sword-exchange proof. The selected baseline therefore remains the honest collision envelope:
 * support feet, hip centres, longitudinal lengths and actuator limits stay qualified rather than
 * being hidden behind a slimmer visual shell.
 */
export const ATHLETIC_HUMANOID_CHASSIS_CANDIDATES_V1 = Object.freeze({
  "athletic-15": Object.freeze({
    id: "athletic-15",
    torso: Object.freeze([0.612, 0.78, 0.289] as const),
    pelvis: Object.freeze([0.510, 0.22, 0.255] as const),
    upperArmRadiusM: 0.08925, forearmRadiusM: 0.0765,
    thighRadiusM: 0.102, shinRadiusM: 0.085,
    wristRadiusM: 0.068, ankleRadiusM: 0.07225, swordBearingRadiusM: 0.1105,
    hand: Object.freeze([0.187, 0.16, 0.2125] as const),
  }),
  "athletic-20": Object.freeze({
    id: "athletic-20",
    torso: Object.freeze([0.576, 0.78, 0.272] as const),
    pelvis: Object.freeze([0.480, 0.22, 0.240] as const),
    upperArmRadiusM: 0.084, forearmRadiusM: 0.072,
    thighRadiusM: 0.096, shinRadiusM: 0.080,
    wristRadiusM: 0.064, ankleRadiusM: 0.068, swordBearingRadiusM: 0.104,
    hand: Object.freeze([0.176, 0.16, 0.20] as const),
  }),
});

export const HUMANOID_CHASSIS_BASELINE_V1 = Object.freeze({
  id: "baseline-retained",
  torso: Object.freeze([0.72, 0.78, 0.34] as const),
  pelvis: Object.freeze([0.60, 0.22, 0.30] as const),
  upperArmRadiusM: 0.105, forearmRadiusM: 0.09,
  thighRadiusM: 0.12, shinRadiusM: 0.10,
  wristRadiusM: 0.08, ankleRadiusM: 0.085, swordBearingRadiusM: 0.13,
  hand: Object.freeze([0.22, 0.16, 0.25] as const),
});

// `athletic-20` lost the right mirror's multi-part exchange; `athletic-15` lost the left
// mirror.  Selection refuses both rather than claiming a geometry-only improvement.
export const ATHLETIC_HUMANOID_CHASSIS_V1 = HUMANOID_CHASSIS_BASELINE_V1;

export const ATHLETIC_HUMANOID_CHASSIS_V1_SUMMARY =
  "athletic-15 and athletic-20 were rejected by opposite mirrored sword-exchange gates; the baseline collision chassis remains selected with feet, hip centres, lengths, masses, joints and health fixed";
