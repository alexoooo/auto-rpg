import fighterHull from "../../../assets/humanoid/workshop-fighter-trunk-hull.json" with { type: "json" };
import rogueHull from "../../../assets/humanoid/workshop-rogue-trunk-hull.json" with { type: "json" };
import type { SourceKey } from "../sources.ts";
import { sourced, type Quantity, type Vec3 } from "../spec/quantity.ts";
import type { WorkshopModel } from "./rig.ts";
import type { Side } from "../spec/body.ts";

/**
 * **The workshop models' clothed envelope**, as `scripts/core/workshop-envelope.mjs` measures it
 * from the GLBs: metres at the authored size, rounded to 0.1 mm, body frame.
 * `tests/core-human.test.mjs` measures it again and compares.
 *
 * - A trunk segment's surface is the corners of a convex hull, read from
 *   `assets/humanoid/workshop-*-trunk-hull.json`, which the script writes.
 * - A foot is the extents of its boot.
 */
export type TrunkSegment = "upper" | "middle" | "lower";
export const TRUNK_SEGMENTS: readonly TrunkSegment[] = Object.freeze(["upper", "middle", "lower"]);

export interface Extent { readonly min: Quantity<number>; readonly max: Quantity<number> }
export interface Extents { readonly x: Extent; readonly y: Extent; readonly z: Extent }
interface WorkshopEnvelope {
  /** Each trunk segment's hull corners. */
  readonly trunk: Readonly<Record<TrunkSegment, readonly Quantity<Vec3>[]>>;
  readonly feet: Readonly<Record<Side, Extents>>;
}

/** [x min, x max, y min, y max, z min, z max], as the script prints them. */
type Printed = readonly [number, number, number, number, number, number];

/** Each foot's extents as the measurement printed them (`workshop-envelope`), m. */
const PRINTED: Readonly<Record<WorkshopModel, { readonly feet: Record<Side, Printed> }>> = {
  "workshop-fighter": {
    feet: {
      left: [-0.2855, -0.1355, 0, 0.1058, -0.075, 0.2303],
      right: [0.1355, 0.2855, 0, 0.1037, -0.075, 0.2303],
    },
  },
  "workshop-rogue": {
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

type HullFile = Readonly<Record<TrunkSegment, readonly (readonly number[])[]>>;
const HULLS: Readonly<Record<WorkshopModel, { readonly file: HullFile; readonly source: SourceKey }>> = {
  "workshop-fighter": { file: fighterHull as HullFile, source: "workshop-fighter-trunk-hull" },
  "workshop-rogue": { file: rogueHull as HullFile, source: "workshop-rogue-trunk-hull" },
};

function hull(model: WorkshopModel, segment: TrunkSegment): readonly Quantity<Vec3>[] {
  const { file, source } = HULLS[model];
  return Object.freeze(file[segment].map((corner, i) => {
    if (corner.length !== 3) throw new Error(`${model} ${segment} trunk hull corner ${i} is not a point`);
    return sourced(corner as unknown as Vec3, "m", source, `/${segment}/${i}`);
  }));
}

export function workshopEnvelope(model: WorkshopModel): WorkshopEnvelope {
  const { feet } = PRINTED[model];
  return Object.freeze({
    trunk: Object.freeze({ upper: hull(model, "upper"), middle: hull(model, "middle"), lower: hull(model, "lower") }),
    feet: Object.freeze({
      left: extents(feet.left, `${model} left foot, body frame`),
      right: extents(feet.right, `${model} right foot, body frame`),
    }),
  });
}
