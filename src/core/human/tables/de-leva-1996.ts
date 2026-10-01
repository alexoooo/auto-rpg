import { sourced, type Quantity } from "../../spec/quantity.ts";

/**
 * **de Leva 1996, Table 4**: segment lengths, masses, centres of mass and radii of gyration for
 * young adults, his adjustment of Zatsiorsky and Seluyanov's gamma-ray data (J Biomech
 * 29:1223-1230). Transcribed as printed; each leaf says which row and column.
 *
 * - Mass is a percentage of body mass.
 * - The centre of mass is a percentage of the segment's length from its **origin**, the first of
 *   the row's two landmarks (the proximal or cranial one).
 * - Each radius of gyration is a percentage of the segment's length, about the segment's sagittal
 *   (antero-posterior), transverse (medio-lateral) and longitudinal axes.
 *
 * The rows are those whose landmarks the workshop rigs have as joint centres; where the main row
 * ends on a landmark the rig lacks, the paper's alternative row is taken, and the row's name says
 * so. Rows marked * in the paper ("not adjusted values") are the head (VERT-CERV), the upper trunk
 * (CERV-XYPH), the middle trunk and the foot.
 *
 * `docs/reference/human-strike-reference.md` section 6 discusses the table.
 */
export type Sex = "male" | "female";

export type DeLevaSegment =
  | "head" | "upperTrunk" | "middleTrunk" | "lowerTrunk"
  | "upperArm" | "forearm" | "hand" | "thigh" | "shank" | "foot";

export interface DeLevaRow {
  /** The row's two landmarks, origin first, as the paper names them. */
  readonly landmarks: string;
  readonly length: Quantity<number>;
  readonly mass: Quantity<number>;
  readonly centreOfMass: Quantity<number>;
  readonly radiusSagittal: Quantity<number>;
  readonly radiusTransverse: Quantity<number>;
  readonly radiusLongitudinal: Quantity<number>;
}

/** [female, male], as the paper prints each cell. */
type Cell = readonly [number, number];
interface Printed {
  readonly row: string;
  readonly landmarks: string;
  readonly length: Cell; readonly mass: Cell; readonly centreOfMass: Cell;
  readonly sagittal: Cell; readonly transverse: Cell; readonly longitudinal: Cell;
}

/** Table 4 as the paper prints it (`de-leva-1996`). */
const PRINTED: Readonly<Record<DeLevaSegment, Printed>> = {
  head: { row: "Head (alternative row)", landmarks: "VERT-CERV",
    length: [243.7, 242.9], mass: [6.68, 6.94], centreOfMass: [48.41, 50.02], sagittal: [27.1, 30.3], transverse: [29.5, 31.5], longitudinal: [26.1, 26.1] },
  upperTrunk: { row: "UPT (alternative row)", landmarks: "CERV-XYPH",
    length: [228.0, 242.1], mass: [15.45, 15.96], centreOfMass: [50.50, 50.66], sagittal: [46.6, 50.5], transverse: [31.4, 32.0], longitudinal: [44.9, 46.5] },
  middleTrunk: { row: "MPT", landmarks: "XYPH-OMPH",
    length: [205.3, 215.5], mass: [14.65, 16.33], centreOfMass: [45.12, 45.02], sagittal: [43.3, 48.2], transverse: [35.4, 38.3], longitudinal: [41.5, 46.8] },
  lowerTrunk: { row: "LPT", landmarks: "OMPH-MIDH",
    length: [181.5, 145.7], mass: [12.47, 11.17], centreOfMass: [49.20, 61.15], sagittal: [43.3, 61.5], transverse: [40.2, 55.1], longitudinal: [44.4, 58.7] },
  upperArm: { row: "Upper arm", landmarks: "SJC-EJC",
    length: [275.1, 281.7], mass: [2.55, 2.71], centreOfMass: [57.54, 57.72], sagittal: [27.8, 28.5], transverse: [26.0, 26.9], longitudinal: [14.8, 15.8] },
  forearm: { row: "Forearm", landmarks: "EJC-WJC",
    length: [264.3, 268.9], mass: [1.38, 1.62], centreOfMass: [45.59, 45.74], sagittal: [26.1, 27.6], transverse: [25.7, 26.5], longitudinal: [9.4, 12.1] },
  hand: { row: "Hand (alternative row)", landmarks: "WJC-DAC3",
    length: [170.1, 187.9], mass: [0.56, 0.61], centreOfMass: [34.27, 36.24], sagittal: [24.4, 28.8], transverse: [20.8, 23.5], longitudinal: [15.4, 18.4] },
  thigh: { row: "Thigh", landmarks: "HJC-KJC",
    length: [368.5, 422.2], mass: [14.78, 14.16], centreOfMass: [36.12, 40.95], sagittal: [36.9, 32.9], transverse: [36.4, 32.9], longitudinal: [16.2, 14.9] },
  shank: { row: "Shank (alternative row)", landmarks: "KJC-AJC",
    length: [438.6, 440.3], mass: [4.81, 4.33], centreOfMass: [43.52, 43.95], sagittal: [26.7, 25.1], transverse: [26.3, 24.6], longitudinal: [9.2, 10.2] },
  foot: { row: "Foot", landmarks: "HEEL-TTIP",
    length: [228.3, 258.1], mass: [1.29, 1.37], centreOfMass: [40.14, 44.15], sagittal: [29.9, 25.7], transverse: [27.9, 24.5], longitudinal: [13.9, 12.4] },
};

const COLUMN: Readonly<Record<Sex, 0 | 1>> = { female: 0, male: 1 };
const WHO: Readonly<Record<Sex, string>> = { female: "females", male: "males" };

function table(sex: Sex): Readonly<Record<DeLevaSegment, DeLevaRow>> {
  const column = COLUMN[sex];
  const leaf = (printed: Printed, cell: Cell, unit: "mm" | "%", heading: string) =>
    sourced(cell[column], unit, "de-leva-1996", `Table 4, ${printed.row} ${printed.landmarks}, ${WHO[sex]}, ${heading}`);
  const rows = {} as Record<DeLevaSegment, DeLevaRow>;
  for (const [segment, printed] of Object.entries(PRINTED) as [DeLevaSegment, Printed][]) {
    rows[segment] = Object.freeze({
      landmarks: printed.landmarks,
      length: leaf(printed, printed.length, "mm", "length"),
      mass: leaf(printed, printed.mass, "%", "mass"),
      centreOfMass: leaf(printed, printed.centreOfMass, "%", "CM position"),
      radiusSagittal: leaf(printed, printed.sagittal, "%", "r sagittal"),
      radiusTransverse: leaf(printed, printed.transverse, "%", "r transverse"),
      radiusLongitudinal: leaf(printed, printed.longitudinal, "%", "r longitudinal"),
    });
  }
  return Object.freeze(rows);
}

export const DE_LEVA_1996: Readonly<Record<Sex, Readonly<Record<DeLevaSegment, DeLevaRow>>>> =
  Object.freeze({ female: table("female"), male: table("male") });

