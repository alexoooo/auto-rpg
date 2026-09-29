import { sourced, type Quantity } from "../../spec/quantity.ts";
import type { Sex } from "./de-leva-1996.ts";

/**
 * **Where young adults' skeletal muscle is, by sex**: Abe, Kearns & Fukunaga 2003, Table 1. Whole
 * body MRI, contiguous 1 cm slices from C1 to the ankles, 10 men and 10 women, Japanese college
 * students aged about 21 who exercised two or three times a week. Mean body mass and skeletal
 * muscle by region, kg.
 *
 * The regions are the paper's cuts:
 * - **trunk**, from C1 to the femoral heads, less the arms: it holds the neck below C1, the whole
 *   shoulder girdle proximal to the axillary fold, and the hip muscles above the femoral heads;
 * - **arms**, from just below the axillary fold;
 * - **upper legs**, from the femoral heads to the knees; **lower legs**, from the knees to the
 *   ankles, the feet excluded.
 *
 * The regions sum to the printed total within its rounding (men 22.4 against 22.3 kg).
 */
export type MuscleRegion = "trunk" | "arms" | "upperLegs" | "lowerLegs";

const ROW: Readonly<Record<MuscleRegion, string>> = { trunk: "SM trunk", arms: "SM arms", upperLegs: "SM upper legs", lowerLegs: "SM lower legs" };
const PRINTED: Readonly<Record<Sex, { readonly mass: number } & Readonly<Record<MuscleRegion, number>>>> = {
  male: { mass: 63.5, trunk: 9.7, arms: 2.3, upperLegs: 8.0, lowerLegs: 2.4 },
  female: { mass: 55.6, trunk: 5.5, arms: 1.2, upperLegs: 5.0, lowerLegs: 1.8 },
};
const column = (sex: Sex): string => (sex === "male" ? "men" : "women");

/** The mean body mass of the paper's people of `sex`. */
export const abeBodyMass = (sex: Sex): Quantity<number> =>
  sourced(PRINTED[sex].mass, "kg", "abe-2003", `Table 1, body mass (kg), ${column(sex)}`);

/** Their mean skeletal muscle in `region`. */
export const abeRegionalMuscle = (sex: Sex, region: MuscleRegion): Quantity<number> =>
  sourced(PRINTED[sex][region], "kg", "abe-2003", `Table 1, ${ROW[region]} (kg), ${column(sex)}`);
