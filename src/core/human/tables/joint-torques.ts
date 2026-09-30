import type { SourceKey } from "../../sources.ts";
import { STANDARD_GRAVITY } from "../../spec/constants.ts";
import { derive, sourced, type Quantity } from "../../spec/quantity.ts";
import type { Sex } from "./de-leva-1996.ts";

/**
 * **How hard young adults turn each joint**: peak torque in newton metres, men's and women's
 * columns, with the mean body mass of the people who produced it. `humanSpec` reads the men's
 * column and scales it by muscle (`src/core/human/muscle.ts`); the women's column is the check on
 * that scaling, never an input to a spec. `docs/reference/human-strike-reference.md` section 9
 * says why each source was taken over the others.
 *
 * - **Danneskiold-Samsøe 2009** (DS2009) is the spine of the table: one laboratory, one dynamometer
 *   (Lido Active Multi Joint II), the dominant side, gravity-corrected, isometric, 20-29 y, 10 men
 *   and 18 women. It gives the shoulder, elbow, wrist flexion and extension, the hip but its flexion
 *   and extension, the knee and the ankle's bending. Its isometric tables print "(N)" where the text
 *   gives N m; they are N m.
 * - The hip's flexion and extension: Anderson 2007, whose Table 3 gives each group's peak isometric
 *   torque normalised by body weight times height (C1), 18-25 y, 7 men and 7 women. The torque is
 *   C1 times the group's mean weight and height.
 * - The trunk: Pan 2025, isometric from neutral, seated with the pelvis fixed, medians, 20-35 y.
 * - The neck: Vasavada, Li & Delp 2001, isometric, neutral, resolved at C7-T1, 11 men and 5 women.
 * - The forearm's turn: Axelsson 2018, isometric, right arm, 15-25 y band. The paper gives body mass
 *   only for each sex's whole cohort (15-85 y), which stands in for the band's.
 * - The wrist's sideways bend: Peleg 2025, concentric at 90 deg/s, right side. No isometric source
 *   by sex was found; a concentric peak understates the isometric one.
 * - The foot's roll: da Fonseca 2025, concentric at 30 deg/s, both ankles pooled, 20-60 y. Its body
 *   mass is given for both sexes together, which stands in for each sex's.
 */
export type Exertion =
  | "shoulderFlexion" | "shoulderExtension" | "shoulderAbduction" | "shoulderAdduction"
  | "shoulderExternalRotation" | "shoulderInternalRotation"
  | "elbowFlexion" | "elbowExtension"
  | "forearmSupination" | "forearmPronation"
  | "wristFlexion" | "wristExtension" | "wristUlnarDeviation" | "wristRadialDeviation"
  | "hipFlexion" | "hipExtension" | "hipAbduction" | "hipAdduction" | "hipExternalRotation" | "hipInternalRotation"
  | "kneeExtension" | "kneeFlexion"
  | "ankleDorsiflexion" | "anklePlantarflexion" | "footInversion" | "footEversion"
  | "trunkFlexion" | "trunkExtension" | "trunkLateralFlexionRight" | "trunkLateralFlexionLeft"
  | "trunkRotationRight" | "trunkRotationLeft"
  | "neckFlexion" | "neckExtension" | "neckLateralFlexion" | "neckRotation";

/** The people a source measured, by sex: mean body mass, and stature where a row needs it. */
interface Cohort {
  readonly source: SourceKey;
  readonly where: string;
  readonly mass: Readonly<Record<Sex, number>>;
  readonly stature?: Readonly<Record<Sex, number>>;
}

const COHORTS = {
  ds2009: { source: "ds-2009", where: "Appendices I and II, 20-29 y, weight", mass: { male: 73.8, female: 62.8 } },
  anderson: { source: "anderson-2007", where: "subjects, 18-25 y group",
    mass: { male: 72.8, female: 62.1 }, stature: { male: 1.748, female: 1.606 } },
  pan: { source: "pan-2025", where: "participants, body mass", mass: { male: 73.4, female: 55.1 } },
  vasavada: { source: "vasavada-2001", where: "Table 1, mass", mass: { male: 77, female: 65 } },
  axelsson: { source: "axelsson-2018", where: "Appendix A, whole cohort (15-85 y), weight", mass: { male: 84, female: 66 } },
  peleg: { source: "peleg-2025", where: "Methods, body mass", mass: { male: 74.3, female: 59.1 } },
  daFonseca: { source: "da-fonseca-2025", where: "Results, body mass, both sexes together", mass: { male: 77.1, female: 77.1 } },
} as const satisfies Readonly<Record<string, Cohort>>;
type CohortKey = keyof typeof COHORTS;

interface Printed {
  readonly cohort: CohortKey;
  readonly where: string;
  /** N m, or for Anderson 2007 the dimensionless C1. */
  readonly male: number;
  readonly female: number;
}

const ds = (where: string, male: number, female: number): Printed => ({ cohort: "ds2009", where: `${where}, 20-29 y`, male, female });
const pan = (where: string, male: number, female: number): Printed => ({ cohort: "pan", where: `Results, isometric, ${where}, median`, male, female });
const vasavada = (where: string, male: number, female: number): Printed =>
  ({ cohort: "vasavada", where: `Table 2, ${where}, resolved at C7-T1`, male, female });

const PRINTED: Readonly<Record<Exertion, Printed>> = {
  shoulderFlexion: ds("shoulder, isometric flexion", 63.0, 30.0),
  shoulderExtension: ds("shoulder, isometric extension", 91.9, 43.5),
  shoulderAbduction: ds("shoulder, isometric abduction", 60.2, 30.9),
  shoulderAdduction: ds("shoulder, isometric adduction", 89.6, 42.0),
  shoulderExternalRotation: ds("shoulder, isometric external rotation", 35.9, 19.4),
  shoulderInternalRotation: ds("shoulder, isometric internal rotation", 59.4, 26.3),
  elbowFlexion: ds("elbow, isometric flexion at 60 deg", 70.3, 36.2),
  elbowExtension: ds("elbow, isometric extension at 60 deg", 53.2, 28.2),
  forearmSupination: { cohort: "axelsson", where: "Appendix E, right arm, 15-25 y, supination", male: 9.2, female: 5.7 },
  forearmPronation: { cohort: "axelsson", where: "Appendix E, right arm, 15-25 y, pronation", male: 7.8, female: 4.4 },
  wristFlexion: ds("wrist, isometric flexion", 23.9, 14.3),
  wristExtension: ds("wrist, isometric extension", 13.1, 6.9),
  wristUlnarDeviation: { cohort: "peleg", where: "results, ulnar deviation, concentric at 90 deg/s", male: 26.5, female: 20.0 },
  wristRadialDeviation: { cohort: "peleg", where: "results, radial deviation, concentric at 90 deg/s", male: 14.9, female: 8.5 },
  hipFlexion: { cohort: "anderson", where: "Table 3, 18-25 y, hip flexion, C1", male: 0.113, female: 0.127 },
  hipExtension: { cohort: "anderson", where: "Table 3, 18-25 y, hip extension, C1", male: 0.161, female: 0.181 },
  hipAbduction: ds("Appendix XI, hip, isometric abduction, side-lying", 185, 114),
  hipAdduction: ds("Appendix XI, hip, isometric adduction, side-lying", 217, 124),
  hipExternalRotation: ds("Appendix XI, hip, isometric external rotation, prone", 49.7, 36.6),
  hipInternalRotation: ds("Appendix XI, hip, isometric internal rotation, prone", 72.7, 40.6),
  kneeExtension: ds("knee, isometric extension at 65 deg", 242, 160),
  kneeFlexion: ds("knee, isometric flexion", 132, 88.6),
  ankleDorsiflexion: ds("ankle, isometric dorsiflexion", 40.2, 25.4),
  anklePlantarflexion: ds("ankle, isometric plantar flexion", 142, 94.6),
  footInversion: { cohort: "daFonseca", where: "Table 6, inversion, concentric at 30 deg/s", male: 37.0, female: 30.0 },
  footEversion: { cohort: "daFonseca", where: "Table 6, eversion, concentric at 30 deg/s", male: 33.4, female: 22.3 },
  trunkFlexion: pan("flexion", 87.3, 56.9),
  trunkExtension: pan("extension", 118.1, 88.1),
  trunkLateralFlexionRight: pan("lateral bending, right", 63.2, 46.2),
  trunkLateralFlexionLeft: pan("lateral bending, left", 71.3, 49.5),
  trunkRotationRight: pan("axial rotation, right", 49.2, 35.2),
  trunkRotationLeft: pan("axial rotation, left", 47.7, 34.1),
  neckFlexion: vasavada("flexion", 30, 15),
  neckExtension: vasavada("extension", 52, 21),
  neckLateralFlexion: vasavada("lateral bending", 36, 16),
  neckRotation: vasavada("axial rotation", 15, 6),
};

const column = (sex: Sex): string => (sex === "male" ? "men" : "women");

/** The mean body mass of the people whose `exertion` a source measured, kg. */
export function subjectMass(exertion: Exertion, sex: Sex): Quantity<number> {
  const cohort: Cohort = COHORTS[PRINTED[exertion].cohort];
  return sourced(cohort.mass[sex], "kg", cohort.source, `${cohort.where}, ${column(sex)}`);
}

/** Peak torque of `exertion` in the source's people of `sex`, N m, as a magnitude. */
export function measuredTorque(exertion: Exertion, sex: Sex): Quantity<number> {
  const printed = PRINTED[exertion];
  const cohort: Cohort = COHORTS[printed.cohort];
  if (!cohort.stature) return sourced(printed[sex], "N m", cohort.source, `${printed.where}, ${column(sex)}`);
  const c1 = sourced(printed[sex], "1", cohort.source, `${printed.where}, ${column(sex)}`);
  const stature = sourced(cohort.stature[sex], "m", cohort.source, `${cohort.where}, height, ${column(sex)}`);
  return derive("N m", "C1 times the group's mean body weight and height", [c1, subjectMass(exertion, sex), STANDARD_GRAVITY, stature],
    (c, m, g, h) => c * m * g * h);
}

export const EXERTIONS = Object.freeze(Object.keys(PRINTED) as Exertion[]);
