import { sourced, type Quantity } from "../../spec/quantity.ts";

/**
 * **Segment densities**, Dempster's cadaver measurements as Winter tabulates them (Table 4.1). They
 * size a segment's collision shape from its mass where the rig gives no surface; they never set
 * a mass. The trunk's shapes are measured from the model instead (`envelope.ts`), so
 * the trunk rows are not taken.
 */
export type DensitySegment = "head" | "upperArm" | "forearm" | "hand" | "thigh" | "shank";

const printed = (segment: string, value: number): Quantity<number> =>
  sourced(value, "g/cm3", "winter-table-4-1", `Table 4.1, ${segment}, density`);

/** Each segment's density as Table 4.1 prints it (`winter-table-4-1`), g/cm3. */
export const SEGMENT_DENSITY: Readonly<Record<DensitySegment, Quantity<number>>> = Object.freeze({
  head: printed("head and neck", 1.11),
  upperArm: printed("upper arm", 1.07),
  forearm: printed("forearm", 1.13),
  hand: printed("hand", 1.16),
  thigh: printed("thigh", 1.05),
  shank: printed("leg", 1.09),
});
