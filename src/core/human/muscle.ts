import { derive, type Quantity } from "../spec/quantity.ts";
import { bodyMass, WORKSHOP_SEX } from "./model.ts";
import type { WorkshopModel } from "./rig.ts";
import { abeBodyMass, abeRegionalMuscle, type MuscleRegion } from "./tables/abe-2003.ts";
import { measuredTorque, subjectMass, type Exertion } from "./tables/joint-torques.ts";

/**
 * **A model's peak joint torques, from the muscle it has.**
 *
 * A muscle's force is its specific tension times its physiological cross-section, and a joint's
 * torque is that force times a moment arm. Under geometric similarity torque therefore goes as
 * muscle volume, and muscle strength per unit cross-section does not differ between the sexes
 * (Miller 1993). So a model's torque is young men's measured torque times the model's muscle over
 * those men's, where the muscle counted is the region's that turns the joint:
 *
 *     torque = the men's torque x (model's regional muscle / the men's regional muscle)
 *     regional muscle = body mass x (the region's muscle per body mass, for the sex)
 *
 * The regional muscle per body mass is Abe 2003's, for both sexes: the women's share and the men's
 * come from the same people in the same scanner, so their ratio carries no difference of method. A
 * man's torque is then his body mass over the men's times theirs; a woman's is also scaled by the
 * women's muscle per kilogram over the men's in the region. The women's measured column is never an
 * input: `tests/core-human.test.mjs` holds it against the prediction.
 *
 * `docs/analysis/2026-09-27-human-strike-reference.md` section 9 has the check, the two other rules
 * weighed, and what none of them explains (the trunk).
 */
export function peakTorque(model: WorkshopModel, exertion: Exertion): Quantity<number> {
  const sex = WORKSHOP_SEX[model];
  const region = REGION[exertion];
  return derive("N m", "the men's torque, times the model's regional muscle over the men's, each body mass times "
    + "the region's muscle per body mass for its sex",
  [measuredTorque(exertion, "male"), bodyMass(model), abeRegionalMuscle(sex, region), abeBodyMass(sex),
    subjectMass(exertion, "male"), abeRegionalMuscle("male", region), abeBodyMass("male")],
  (torque, mass, muscle, muscleMass, menMass, menMuscle, menMuscleMass) =>
    torque * (mass * muscle / muscleMass) / (menMass * menMuscle / menMuscleMass));
}

/**
 * Which of Abe's regions holds the muscle that turns each joint. The neck, the spine and the
 * shoulder's girdle lie in the trunk; the elbow, forearm and wrist are moved from the arm; the hip
 * and knee from the upper leg, though the hip's upper gluteals and iliopsoas lie above the femoral
 * head, in Abe's trunk; the ankle and foot from the lower leg.
 */
const byJoint = <E extends Exertion>(region: MuscleRegion, exertions: readonly E[]) =>
  Object.fromEntries(exertions.map((e) => [e, region])) as Record<E, MuscleRegion>;

export const REGION: Readonly<Record<Exertion, MuscleRegion>> = Object.freeze({
  ...byJoint("trunk", ["neckFlexion", "neckExtension", "neckLateralFlexion", "neckRotation"]),
  ...byJoint("trunk", ["trunkFlexion", "trunkExtension", "trunkLateralFlexionRight", "trunkLateralFlexionLeft",
    "trunkRotationRight", "trunkRotationLeft"]),
  ...byJoint("trunk", ["shoulderFlexion", "shoulderExtension", "shoulderAbduction", "shoulderAdduction",
    "shoulderExternalRotation", "shoulderInternalRotation"]),
  ...byJoint("arms", ["elbowFlexion", "elbowExtension", "forearmSupination", "forearmPronation",
    "wristFlexion", "wristExtension", "wristUlnarDeviation", "wristRadialDeviation"]),
  ...byJoint("upperLegs", ["hipFlexion", "hipExtension", "hipAbduction", "hipAdduction", "hipExternalRotation",
    "hipInternalRotation", "kneeExtension", "kneeFlexion"]),
  ...byJoint("lowerLegs", ["ankleDorsiflexion", "anklePlantarflexion", "footInversion", "footEversion"]),
});
