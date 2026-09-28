import { sourced, type Quantity } from "../spec/quantity.ts";
import type { Side } from "./landmarks.ts";
import type { WorkshopModel } from "./rig.ts";

/**
 * **The workshop models' clothed envelope**, as `scripts/core/workshop-envelope.mjs` measures it
 * from the GLBs: metres at the authored size, rounded to 0.1 mm. `tests/core-human.test.mjs`
 * measures it again and compares.
 *
 * - A trunk segment's extents are in its own segment frame (`segmentFrame` of CERV to MIDH, at the
 *   segment's proximal end): x the body's right, y down the trunk line, z backward.
 * - A foot's extents are in the body frame.
 */
export type TrunkSegment = "upper" | "middle" | "lower";
export const TRUNK_SEGMENTS: readonly TrunkSegment[] = Object.freeze(["upper", "middle", "lower"]);

export interface Extent { readonly min: Quantity<number>; readonly max: Quantity<number> }
export interface Extents { readonly x: Extent; readonly y: Extent; readonly z: Extent }
export interface WorkshopEnvelope {
  readonly trunk: Readonly<Record<TrunkSegment, Extents>>;
  readonly feet: Readonly<Record<Side, Extents>>;
}

/** [x min, x max, y min, y max, z min, z max], as the script prints them. */
type Printed = readonly [number, number, number, number, number, number];

const PRINTED: Readonly<Record<WorkshopModel, { readonly trunk: Record<TrunkSegment, Printed>; readonly feet: Record<Side, Printed> }>> = {
  "workshop-fighter": {
    trunk: {
      upper: [-0.2147, 0.2147, -0.0073, 0.2439, -0.1741, 0.1266],
      middle: [-0.2062, 0.2062, 0, 0.2172, -0.1738, 0.1156],
      lower: [-0.1913, 0.1913, 0.0001, 0.2505, -0.1772, 0.1159],
    },
    feet: {
      left: [-0.2855, -0.1355, 0, 0.1058, -0.075, 0.2303],
      right: [0.1355, 0.2855, 0, 0.1037, -0.075, 0.2303],
    },
  },
  "workshop-rogue": {
    trunk: {
      upper: [-0.1761, 0.1761, -0.011, 0.207, -0.168, 0.1005],
      middle: [-0.1634, 0.1634, 0.0003, 0.1868, -0.1661, 0.0879],
      lower: [-0.1874, 0.1874, 0.0023, 0.2683, -0.1489, 0.1386],
    },
    feet: {
      left: [-0.2544, -0.1044, 0, 0.1035, -0.075, 0.215],
      right: [0.1044, 0.2544, 0, 0.1016, -0.075, 0.215],
    },
  },
};

function extents(printed: Printed, what: string): Extents {
  const leaf = (i: number, axis: string, end: string) => sourced(printed[i]!, "m", "workshop-envelope", `${what}, ${axis} ${end}`);
  return Object.freeze({
    x: Object.freeze({ min: leaf(0, "x", "min"), max: leaf(1, "x", "max") }),
    y: Object.freeze({ min: leaf(2, "y", "min"), max: leaf(3, "y", "max") }),
    z: Object.freeze({ min: leaf(4, "z", "min"), max: leaf(5, "z", "max") }),
  });
}

export function workshopEnvelope(model: WorkshopModel): WorkshopEnvelope {
  const { trunk, feet } = PRINTED[model];
  return Object.freeze({
    trunk: Object.freeze({
      upper: extents(trunk.upper, `${model} upper trunk, its segment frame`),
      middle: extents(trunk.middle, `${model} middle trunk, its segment frame`),
      lower: extents(trunk.lower, `${model} lower trunk, its segment frame`),
    }),
    feet: Object.freeze({
      left: extents(feet.left, `${model} left foot, body frame`),
      right: extents(feet.right, `${model} right foot, body frame`),
    }),
  });
}
