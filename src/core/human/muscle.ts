import { derive, sourced, type Quantity } from "../spec/quantity.ts";
import type { HumanFigure } from "./figure.ts";
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
 * The body mass counted is the figure's muscled mass (`HumanFigure.muscled`), which a physique's
 * weight leaves as it is. What the owner has set an exertion to give in use over its measured peak
 * (`IN_USE`) multiplies the torque, and so does the figure's strength, where it has one.
 *
 * The regional muscle per body mass is Abe 2003's, for both sexes: the women's share and the men's
 * come from the same people in the same scanner, so their ratio carries no difference of method. A
 * man's torque is then his body mass over the men's times theirs; a woman's is also scaled by the
 * women's muscle per kilogram over the men's in the region. The women's measured column is never an
 * input: it checks the prediction.
 *
 * `docs/reference/human-strike-reference.md` section 9 has the check, the two other rules weighed,
 * and what none of them explains (the trunk).
 */
export function peakTorque(figure: HumanFigure, exertion: Exertion): Quantity<number> {
  const { sex } = figure;
  const region = REGION[exertion];
  const torque = derive("N m", "the men's torque, times the model's regional muscle over the men's, each body mass times "
    + "the region's muscle per body mass for its sex",
  [measuredTorque(exertion, "male"), figure.muscled ?? figure.mass, abeRegionalMuscle(sex, region), abeBodyMass(sex),
    subjectMass(exertion, "male"), abeRegionalMuscle("male", region), abeBodyMass("male")],
  (torque, mass, muscle, muscleMass, menMass, menMuscle, menMuscleMass) =>
    torque * (mass * muscle / muscleMass) / (menMass * menMuscle / menMuscleMass));
  const inUse = IN_USE[exertion];
  const used = inUse ? derive("N m", "the torque times what the exertion gives in use over its measured peak", [torque, inUse], (t, f) => t * f) : torque;
  return figure.strength ? derive("N m", "the torque times the figure's strength", [used, figure.strength], (t, s) => t * s) : used;
}

/**
 * What a leg's exertions give in use over their measured peaks, as the owner has set them: what the
 * run searched on the body is fastest and surest at (`docs/reference/run-body.md`). A person
 * running uses the hip at all of its measured capacity and pushes the ankle past a straight-legged
 * push's peak.
 */
const HIP_IN_USE = sourced(2.49, "1", "owner-run-body", "the hip's torque in use over its measured peak");
const KNEE_IN_USE = sourced(1.58, "1", "owner-run-body", "the knee's torque in use over its measured peak");
export const IN_USE: Readonly<Partial<Record<Exertion, Quantity<number>>>> = Object.freeze({
  hipFlexion: HIP_IN_USE, hipExtension: HIP_IN_USE, hipAbduction: HIP_IN_USE, hipAdduction: HIP_IN_USE,
  hipExternalRotation: HIP_IN_USE, hipInternalRotation: HIP_IN_USE, kneeExtension: KNEE_IN_USE, kneeFlexion: KNEE_IN_USE,
  anklePlantarflexion: sourced(2.75, "1", "owner-run-body", "the ankle's plantar flexion in use over its measured peak"),
});

/**
 * Which of Abe's regions holds the muscle that turns each joint. The neck, the spine and the
 * shoulder's girdle lie in the trunk; the elbow, forearm and wrist are moved from the arm; the hip
 * and knee from the upper leg, though the hip's upper gluteals and iliopsoas lie above the femoral
 * head, in Abe's trunk; the ankle and foot from the lower leg.
 */
const byJoint = <E extends Exertion>(region: MuscleRegion, exertions: readonly E[]) =>
  Object.fromEntries(exertions.map((e) => [e, region])) as Record<E, MuscleRegion>;

const REGION: Readonly<Record<Exertion, MuscleRegion>> = Object.freeze({
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
