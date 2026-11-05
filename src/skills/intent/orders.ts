import type { Region, TargetRef } from "../framework/action.ts";
import type { BodySpec } from "../../core/bodies/spec/body.ts";
import { regionSegments } from "./action-aim.ts";
import type { GaitName } from "../locomotion/gaits.ts";
import { isMovement, type MovementRequest, type GroundPoint } from "./movement.ts";

/** A direction on the ground, world. */
export type Heading = GroundPoint;

/**
 * **What a body is told to do**, by a person, a team's plan or its own mind: plain data, in
 * the world's frame, naming no joint or camera, and a pace only as a ceiling. A mind that takes orders carries them out
 * (`Part.obeys`); the body defends itself meanwhile. An order says as much as it likes: what it
 * leaves out its mind chooses (no `foe`, whom it fights; a `foe` and no `region`, `skill` or
 * `limb`, where and how it strikes it), and what it names the mind keeps to (`orderAllows`,
 * `orderedRegions`, `orderedTarget`).
 */
export interface Orders {
  /** A world movement objective. Null requests a controlled stop; omission leaves movement to the Mind. */
  readonly move?: MovementRequest | null;
  /** Walk no faster than this, m/s, as a walk coming to a stop does; absent, the body's own pace is the only bound. */
  readonly pace?: number;
  /** Walk, not run: no faster than the body's plain walk goes forward (`Intent.walk`). */
  readonly walk?: true;
  /** Go by this gait (`Intent.gait`), where the legs go by gaits; absent, the mind's choice. */
  readonly gait?: GaitName;
  /** Hold the centre of mass this far under its standing height, m (`Intent.lower`); absent, the legs' own height. */
  readonly lower?: number;
  /** Face this way (its length is not read past 0.08). Null faces the walk, or, standing, as it stands. */
  readonly face: Heading | null;
  /** Attack this sensed body (`BodySense.id`) where the mind chooses on it. */
  readonly foe?: string;
  /** Aim at this region of the ordered body, a mark or a segment (`Region`); absent, at the regions each strike aims at. */
  readonly region?: Region;
  /** Strike the ordered body by this skill the body has, its executor's kind (`KitEntry.kind`: `straight-punch`, `club-blow`); absent, by any. */
  readonly skill?: string;
  /** Strike it with this limb, an effector (`hand.right`, `foot.left`); absent, with any limb that fits the skill. */
  readonly limb?: string;
  /** Carry them out first: a mind that weighs orders against its own judgement puts them before it. Absent, as the mind weighs them. */
  readonly firm?: true;
}

export const STAND_ORDERS: Orders = Object.freeze({ move: null, face: null });

/**
 * Whether `orders` allow a strike by `skill` (its executor's kind) with `limb` at `foe`: always,
 * but where they move or stand the body and name no foe (the hands are held from blows), or name
 * that foe and another skill or another limb.
 */
export const orderAllows = (orders: Orders | null, foe: string, skill: string, limb: string): boolean =>
  orders === null || (orders.foe === undefined ? orders.move === undefined
    : orders.foe !== foe || (orders.skill === undefined || orders.skill === skill) && (orders.limb === undefined || orders.limb === limb));

/** The regions to aim at at `foe`: the region `orders` name there, else `regions`, an action's own. */
export const orderedRegions = (orders: Orders | null, foe: string, regions: readonly Region[]): readonly Region[] =>
  orders?.foe === foe && orders.region !== undefined ? [orders.region] : regions;

/** Where to strike `foe` with an action aimed at `regions`: the first of its ordered regions (`orderedRegions`) the foe's body has; null where it has none. */
export function orderedTarget(orders: Orders | null, foe: { readonly id: string; readonly spec: BodySpec }, regions: readonly Region[]): TargetRef | null {
  const region = orderedRegions(orders, foe.id, regions).find((r) => regionSegments(foe.spec, r).length > 0);
  return region ? { kind: "body", body: foe.id, region } : null;
}

const MARKS: readonly string[] = ["high", "middle", "legs", "any"];

/** Whether `value` is a region: a mark of the body, or one of its segments by name. */
export function isRegion(value: unknown): value is Region {
  if (typeof value !== "object" || value === null) return false;
  const { kind, mark, segment } = value as Record<string, unknown>, keys = Object.keys(value);
  return kind === "mark" ? typeof mark === "string" && MARKS.includes(mark) && keys.length === 2
    : kind === "segment" && typeof segment === "string" && segment.length > 0 && keys.length === 2;
}

const isHeading = (value: unknown): value is Heading => typeof value === "object" && value !== null
  && Number.isFinite((value as Heading).x) && Number.isFinite((value as Heading).z);

/** Whether `value` is orders: what orders read from outside the program must be before a body is given them. */
export function isOrders(value: unknown): value is Orders {
  if (typeof value !== "object" || value === null) return false;
  const { move, pace, walk, gait, lower, face, foe, region, skill, limb, firm } = value as Record<string, unknown>;
  const named = (one: unknown) => one === undefined || typeof one === "string" && one.length > 0 && foe !== undefined;
  return (move === undefined || move === null || isMovement(move)) && (pace === undefined || typeof pace === "number" && Number.isFinite(pace) && pace >= 0) && (face === null || isHeading(face))
    && (lower === undefined || typeof lower === "number" && Number.isFinite(lower) && lower >= 0)
    && (walk === undefined || walk === true) && (firm === undefined || firm === true) && (gait === undefined || typeof gait === "string" && gait.length > 0)
    && (foe === undefined || typeof foe === "string" && foe.length > 0)
    && (region === undefined || isRegion(region) && foe !== undefined) && named(skill) && named(limb)
    && Object.keys(value).every(key => ["move", "pace", "walk", "gait", "lower", "face", "foe", "region", "skill", "limb", "firm"].includes(key));
}

/** Whether two orders, or two absences of them, say the same thing. */
export const sameOrders = (a: Orders | null, b: Orders | null): boolean => JSON.stringify(a) === JSON.stringify(b);
