import type { SourceKey } from "../../sources.ts";
import { sourced, type Quantity } from "../../spec/quantity.ts";
import type { Sex } from "./de-leva-1996.ts";
import type { Side } from "../../spec/body.ts";

/**
 * **How far each joint turns, from the anatomical position**: degrees, as each source prints them,
 * for young adults. `docs/reference/human-strike-reference.md` section 9 says why each source was
 * taken.
 *
 * - **Limbs: Moromizato 2016**, one table for every limb joint but the forearm's turn, the wrist's
 *   sideways bend and the foot's roll: passive range by goniometer from the neutral-zero start, 42
 *   men aged 20-29 and 36 women aged 20-25, each value the mean of both sides. A joint's limit is where a push
 *   stops it, so the passive range is the one taken.
 * - The forearm's turn: Zwerus 2019, passive, 18-29 y. The wrist's sideways bend: Kitsoulis 2010,
 *   active, 18-24 y, by side. The foot's roll: Hallaçeli 2014, passive, 19-32 y.
 * - **Neck: Niewiadomski 2019**, active, head on thorax; the sexes are pooled, since sex correlated
 *   with no range.
 * - **Spine.** The thoracic joint carries the thoracic spine, T1 to L1, and the lumbar joint the
 *   lumbar spine, L1 to S1. Thoracic bending forward and back: Jiang 2025, active, standing, by
 *   sex. Its bending sideways and turning: Fujimori 2014 (15 men) and 2012 (13 volunteers whose sex
 *   the abstract does not give), in vivo CT, from the abstracts. The lumbar spine: Pearcy 1985,
 *   men, active, standing. A row with one sample is read by both models.
 *
 * A row printed for both sides of the body keeps them; a spine or neck row printed for turning or
 * bending to the right and to the left keeps both directions.
 */
export type RangeRow =
  | "shoulderFlexion" | "shoulderExtension" | "shoulderAbduction" | "shoulderExternalRotation" | "shoulderInternalRotation"
  | "elbowFlexion" | "elbowHyperextension"
  | "forearmPronation" | "forearmSupination"
  | "wristFlexion" | "wristExtension" | "wristRadialDeviation" | "wristUlnarDeviation"
  | "hipFlexion" | "hipExtension" | "hipAbduction" | "hipAdduction" | "hipExternalRotation" | "hipInternalRotation"
  | "kneeFlexion" | "kneeHyperextension"
  | "ankleDorsiflexion" | "anklePlantarflexion" | "footInversion" | "footEversion"
  | "neckFlexion" | "neckExtension" | "neckLateralFlexionRight" | "neckLateralFlexionLeft" | "neckRotationRight" | "neckRotationLeft"
  | "thoracicFlexion" | "thoracicExtension" | "thoracicLateralFlexion" | "thoracicRotation"
  | "lumbarFlexion" | "lumbarExtension" | "lumbarLateralFlexionRight" | "lumbarLateralFlexionLeft" | "lumbarRotationRight" | "lumbarRotationLeft";

type BySide = { readonly left: number; readonly right: number };
type Cell = number | BySide;
interface Printed {
  readonly source: SourceKey;
  readonly where: string;
  /** Each sex's value; a row with one sample has the same in both. */
  readonly male: Cell;
  readonly female: Cell;
  /** Which sample the row is, when it is one for both sexes. */
  readonly sample?: string;
}

const moromizato = (motion: string, male: number, female: number): Printed =>
  ({ source: "moromizato-2016", where: `Table 1, ${motion}`, male, female });
const oneSample = (source: SourceKey, where: string, value: Cell, sample: string): Printed =>
  ({ source, where, male: value, female: value, sample });

/** Each range as its source prints it, deg; a row names its own source (`moromizato-2016` and the others). */
const PRINTED: Readonly<Record<RangeRow, Printed>> = {
  shoulderFlexion: moromizato("Shoulder flexion", 174.7, 178.4),
  shoulderExtension: moromizato("Shoulder extension", 65.7, 67.6),
  shoulderAbduction: moromizato("Shoulder abduction", 179.8, 179.6),
  shoulderExternalRotation: moromizato("Shoulder external rotation", 91.5, 94.5),
  shoulderInternalRotation: moromizato("Shoulder internal rotation", 58.4, 67.4),
  elbowFlexion: moromizato("Elbow flexion", 141.0, 144.5),
  elbowHyperextension: moromizato("Elbow extension", 3.2, 5.6),
  forearmPronation: { source: "zwerus-2019", where: "Table 3, pronation, passive, 18-29 y", male: 86, female: 89 },
  forearmSupination: { source: "zwerus-2019", where: "Table 3, supination, passive, 18-29 y", male: 94, female: 96 },
  wristFlexion: moromizato("Wrist flexion", 87.0, 89.6),
  wristExtension: moromizato("Wrist extension", 79.0, 83.7),
  wristRadialDeviation: { source: "kitsoulis-2010", where: "Additional file 1, tables 5f) Men and 5g) Women, radial deviation",
    male: { left: 29.1, right: 28.3 }, female: { left: 28.6, right: 27.3 } },
  wristUlnarDeviation: { source: "kitsoulis-2010", where: "Additional file 1, tables 5f) Men and 5g) Women, ulnar deviation",
    male: { left: 46.9, right: 48.3 }, female: { left: 44.6, right: 45.5 } },
  hipFlexion: moromizato("Hip flexion", 126.7, 130.4),
  hipExtension: moromizato("Hip extension", 17.9, 16.1),
  hipAbduction: moromizato("Hip abduction", 32.1, 34.1),
  hipAdduction: moromizato("Hip adduction", 13.7, 13.9),
  hipExternalRotation: moromizato("Hip external rotation", 46.7, 40.6),
  hipInternalRotation: moromizato("Hip internal rotation", 37.1, 47.9),
  kneeFlexion: moromizato("Knee flexion", 147.1, 148.9),
  kneeHyperextension: moromizato("Knee extension", 2.0, 5.3),
  ankleDorsiflexion: moromizato("Ankle dorsi flexion", 22.3, 23.9),
  anklePlantarflexion: moromizato("Ankle plantar flexion", 50.1, 54.1),
  footInversion: { source: "hallaceli-2014", where: "Table 4, inversion, passive", male: 34.56, female: 32.85 },
  footEversion: { source: "hallaceli-2014", where: "Table 4, eversion, passive", male: 19.05, female: 20.76 },
  neckFlexion: oneSample("niewiadomski-2019", "Abstract and results, active, head on thorax, flexion", 65.3, "both sexes pooled"),
  neckExtension: oneSample("niewiadomski-2019", "Abstract and results, active, head on thorax, extension", 60.9, "both sexes pooled"),
  neckLateralFlexionRight: oneSample("niewiadomski-2019", "Abstract and results, active, head on thorax, lateral bending, right", 43.3, "both sexes pooled"),
  neckLateralFlexionLeft: oneSample("niewiadomski-2019", "Abstract and results, active, head on thorax, lateral bending, left", 45.3, "both sexes pooled"),
  neckRotationRight: oneSample("niewiadomski-2019", "Abstract and results, active, head on thorax, rotation, right", 71.2, "both sexes pooled"),
  neckRotationLeft: oneSample("niewiadomski-2019", "Abstract and results, active, head on thorax, rotation, left", 74.5, "both sexes pooled"),
  thoracicFlexion: { source: "jiang-2025", where: "Tables 1-3, thoracic flexion, natural neck, Vicon", male: 21.1, female: 22.2 },
  thoracicExtension: { source: "jiang-2025", where: "Tables 1-3, thoracic extension, natural neck, Vicon", male: 13.7, female: 13.8 },
  thoracicLateralFlexion: oneSample("fujimori-2014", "Abstract, lateral bending of T1 on L1, one side", 15.6, "15 men"),
  thoracicRotation: oneSample("fujimori-2012", "Abstract, axial rotation of T1 on L1, one side", 24.9, "13 healthy volunteers"),
  lumbarFlexion: oneSample("pearcy-1985", "Table 4, flexion, whole lumbar spine", 51, "men"),
  lumbarExtension: oneSample("pearcy-1985", "Table 4, extension, whole lumbar spine", 16, "men"),
  lumbarLateralFlexionRight: oneSample("pearcy-1985", "Table 4, lateral bending, right, whole lumbar spine", 17, "men"),
  lumbarLateralFlexionLeft: oneSample("pearcy-1985", "Table 4, lateral bending, left, whole lumbar spine", 18, "men"),
  lumbarRotationRight: oneSample("pearcy-1985", "Table 4, axial rotation, right, whole lumbar spine", 4, "men"),
  lumbarRotationLeft: oneSample("pearcy-1985", "Table 4, axial rotation, left, whole lumbar spine", 5, "men"),
};

/**
 * The range `row` for a body of `sex`, on `side` where the row is printed by side. A row for both
 * sexes is one leaf, which both read.
 */
export function rangeOfMotion(row: RangeRow, sex: Sex, side?: Side): Quantity<number> {
  const printed = PRINTED[row];
  const cell = printed[sex];
  const who = printed.sample ?? (sex === "male" ? "men" : "women");
  if (typeof cell === "number") return sourced(cell, "deg", printed.source, `${printed.where}, ${who}`);
  if (!side) throw new Error(`${row} is printed by side`);
  return sourced(cell[side], "deg", printed.source, `${printed.where}, ${who}, ${side}`);
}
