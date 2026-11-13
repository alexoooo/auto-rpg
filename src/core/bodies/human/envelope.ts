import manHull from "../../../../assets/humanoid/man-trunk-hull.json" with { type: "json" };
import womanHull from "../../../../assets/humanoid/woman-trunk-hull.json" with { type: "json" };
import type { SourceKey } from "../../sources.ts";
import { sourced, type Quantity, type Vec3 } from "../../quantity.ts";
import type { HumanModel } from "./rig.ts";
import type { Side } from "../bilateral.ts";

/**
 * **The human models' clothed envelope**, as `scripts/humanoid/clothed-envelope.mjs` measures it
 * from the GLBs: metres at the authored size, rounded to 0.1 mm, body frame.
 *
 * - A trunk segment's surface is the corners of a convex hull, read from
 *   `assets/humanoid/*-trunk-hull.json`, which the script writes.
 * - A foot is the extents of its boot.
 */
export type TrunkSegment = "upper" | "middle" | "lower";

export interface Extent { readonly min: Quantity<number>; readonly max: Quantity<number> }
export interface Extents { readonly x: Extent; readonly y: Extent; readonly z: Extent }
interface HumanEnvelope {
  /** Each trunk segment's hull corners. */
  readonly trunk: Readonly<Record<TrunkSegment, readonly Quantity<Vec3>[]>>;
  readonly feet: Readonly<Record<Side, Extents>>;
}

/** [x min, x max, y min, y max, z min, z max], as the script prints them. */
type Printed = readonly [number, number, number, number, number, number];

/** Each foot's extents as the measurement printed them (`clothed-envelope`), m. */
const PRINTED: Readonly<Record<HumanModel, { readonly feet: Record<Side, Printed> }>> = {
  man: {
    feet: {
      left: [-0.2855, -0.1355, 0, 0.1058, -0.075, 0.2303],
      right: [0.1355, 0.2855, 0, 0.1037, -0.075, 0.2303],
    },
  },
  woman: {
    feet: {
      left: [-0.2544, -0.1044, 0, 0.1035, -0.075, 0.215],
      right: [0.1044, 0.2544, 0, 0.1016, -0.075, 0.215],
    },
  },
};

function extents(printed: Printed, what: string): Extents {
  const leaf = (i: number, axis: string, end: string) => sourced(printed[i]!, "m", "clothed-envelope", `${what}, ${axis} ${end}`);
  return Object.freeze({
    x: Object.freeze({ min: leaf(0, "x", "min"), max: leaf(1, "x", "max") }),
    y: Object.freeze({ min: leaf(2, "y", "min"), max: leaf(3, "y", "max") }),
    z: Object.freeze({ min: leaf(4, "z", "min"), max: leaf(5, "z", "max") }),
  });
}

type HullFile = Readonly<Record<TrunkSegment, readonly (readonly number[])[]>>;
const HULLS: Readonly<Record<HumanModel, { readonly file: HullFile; readonly source: SourceKey }>> = {
  man: { file: manHull as HullFile, source: "man-trunk-hull" },
  woman: { file: womanHull as HullFile, source: "woman-trunk-hull" },
};

function hull(model: HumanModel, segment: TrunkSegment): readonly Quantity<Vec3>[] {
  const { file, source } = HULLS[model];
  return Object.freeze(file[segment].map((corner, i) => {
    if (corner.length !== 3) throw new Error(`${model} ${segment} trunk hull corner ${i} is not a point`);
    return sourced(corner as unknown as Vec3, "m", source, `/${segment}/${i}`);
  }));
}

export function humanEnvelope(model: HumanModel): HumanEnvelope {
  const { feet } = PRINTED[model];
  return Object.freeze({
    trunk: Object.freeze({ upper: hull(model, "upper"), middle: hull(model, "middle"), lower: hull(model, "lower") }),
    feet: Object.freeze({
      left: extents(feet.left, `${model} left foot, body frame`),
      right: extents(feet.right, `${model} right foot, body frame`),
    }),
  });
}
