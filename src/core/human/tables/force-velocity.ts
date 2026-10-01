import { sourced, type Quantity } from "../../spec/quantity.ts";
import type { Sex } from "./de-leva-1996.ts";

/**
 * **How fast young adults' joint torque falls with speed**, as printed.
 *
 * - **Anderson 2007** fitted each direction of the hip, knee and ankle, 18-25 y, 7 men and 7
 *   women, on a Biodex System 3. C4 is the speed at which torque is 75 % of isometric and C5 the
 *   speed at which it is 50 % (Table 1); Table 3 prints both for each sex. Plantar flexion's C5 is
 *   more than three times its C4, so its fitted curve never reaches zero; it is left out.
 * - **Frey-Law 2012** measured the elbow isometrically and at 60-300 deg/s, 30 men and 24 women,
 *   gravity and passive torque subtracted. The columns taken are those at 65 deg of flexion, where
 *   both directions are near their isometric peak. The caption marks the sexes by shading, which
 *   the HTML dropped; in every row the first value is the larger and is read as the men's.
 * - **Thelen 2003** gives a generic muscle's curve: the Hill curvature (Af), the eccentric ceiling
 *   of a young adult (F-len), and the eccentric slope at rest against the concentric.
 */

export type AndersonDirection = "hipExtension" | "hipFlexion" | "kneeExtension" | "kneeFlexion" | "ankleDorsiflexion";

/** Table 3's C4 and C5 for the 18-25 y groups, as the paper prints them (`anderson-2007`), rad/s. */
const ANDERSON_TABLE_3: Readonly<Record<AndersonDirection, { readonly row: string } & Readonly<Record<Sex, readonly [number, number]>>>> = {
  hipExtension: { row: "HE", male: [1.578, 3.190], female: [1.567, 3.164] },
  hipFlexion: { row: "HF", male: [2.095, 4.267], female: [2.136, 4.349] },
  kneeExtension: { row: "KE", male: [1.517, 3.952], female: [1.393, 3.623] },
  kneeFlexion: { row: "KF", male: [2.008, 5.233], female: [1.698, 4.412] },
  ankleDorsiflexion: { row: "DF", male: [0.699, 1.940], female: [0.864, 2.399] },
};

/** Anderson's two points on a direction's curve: the speeds at three quarters and at half of isometric. */
export function andersonPoints(direction: AndersonDirection, sex: Sex): {
  readonly threeQuarters: Quantity<number>; readonly half: Quantity<number>;
} {
  const { row, [sex]: [c4, c5] } = ANDERSON_TABLE_3[direction];
  const group = sex === "male" ? "men" : "women";
  return {
    threeQuarters: sourced(c4, "rad/s", "anderson-2007", `Table 3, 18-25 y ${group}, ${row} C4`),
    half: sourced(c5, "rad/s", "anderson-2007", `Table 3, 18-25 y ${group}, ${row} C5`),
  };
}

/** The torque fractions that define C4 and C5. */
export const ANDERSON_C4_SHARE = sourced(75, "%", "anderson-2007", "Table 1: C4, the velocity at which torque is 75 % of isometric");
export const ANDERSON_C5_SHARE = sourced(50, "%", "anderson-2007", "Table 1: C5, the velocity at which torque is 50 % of isometric");

export type FreyLawDirection = "elbowFlexion" | "elbowExtension";

/** The test speeds of the paper's Tables 4 and 5 (`frey-law-2012`), deg/s, isometric first. */
const FREY_LAW_SPEEDS = [0, 60, 120, 180, 240, 300] as const;

/** The torques those tables print at 65 deg of flexion (`frey-law-2012`), N m, one for each test speed. */
const FREY_LAW_65 = {
  elbowFlexion: { table: "Table 4", male: [63.0, 44.7, 38.7, 33.1, 27.9, 25.7], female: [32.0, 21.4, 19.9, 17.9, 15.8, 14.1] },
  elbowExtension: { table: "Table 5", male: [52.8, 39.6, 35.6, 31.8, 26.1, 24.6], female: [29.2, 22.1, 20.0, 18.1, 15.9, 13.3] },
} as const satisfies Readonly<Record<FreyLawDirection, { readonly table: string } & Readonly<Record<Sex, readonly number[]>>>>;

/** Frey-Law's column at 65 deg for a direction and sex: each test speed with its torque. */
export function freyLawColumn(direction: FreyLawDirection, sex: Sex): readonly {
  readonly speed: Quantity<number>; readonly torque: Quantity<number>;
}[] {
  const { table, [sex]: torques } = FREY_LAW_65[direction];
  const group = sex === "male" ? "men" : "women";
  return FREY_LAW_SPEEDS.map((speed, i) => ({
    speed: sourced(speed, "deg/s", "frey-law-2012", `${table}, row ${speed} deg/s`),
    torque: sourced(torques[i], "N m", "frey-law-2012", `${table}, row ${speed} deg/s, 65 deg, ${group}`),
  }));
}

export const THELEN_CURVATURE = sourced(0.25, "1", "thelen-2003", "Appendix, force-velocity: Af, the curvature");
export const THELEN_ECCENTRIC_CEILING = sourced(1.4, "1", "thelen-2003", "Table 1: F-len, the lengthening ceiling, young adults");
export const THELEN_ECCENTRIC_SLOPE_RATIO = sourced(2, "1", "thelen-2003",
  "Appendix, force-velocity: the lengthening slope at rest is twice the shortening");
