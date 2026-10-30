import type { Region } from "../skills/action.ts";
import { isMovement, type MovementRequest, type GroundPoint } from "./movement.ts";

/** A direction on the ground, world. */
export type Heading = GroundPoint;

/**
 * **What a body is told to do**, by a person, a team's plan or its own tactics: plain data, in
 * the world's frame, naming no joint or camera, and a pace only as a ceiling. Tactics that take orders carry them out
 * (`actionTactics`); the body defends itself meanwhile. An order says as much as it likes: what it
 * leaves out its mind chooses (no `foe`, whom it fights; a `foe` and no `region`, `action` or
 * `limb`, where and how it strikes it), and what it names the mind keeps to (`orderAllows`,
 * `orderedRegions`).
 */
export interface Orders {
  /** A world movement objective. Null requests a controlled stop; omission leaves movement to the Mind. */
  readonly move?: MovementRequest | null;
  /** Walk no faster than this, m/s, as a walk coming to a stop does; absent, the body's own pace is the only bound. */
  readonly pace?: number;
  /** Walk, not run: no faster than the body's plain walk goes forward (`Intent.walk`). */
  readonly walk?: true;
  /** Face this way (its length is not read past 0.08). Null faces the walk, or, standing, as it stands. */
  readonly face: Heading | null;
  /** Attack this sensed body (`BodySense.id`) where the mind chooses on it. */
  readonly foe?: string;
  /** Aim at this region of the ordered body, a mark or a segment (`Region`); absent, at the regions each action aims at. */
  readonly region?: Region;
  /** Strike the ordered body with this action, by the name the mind's kit gives it (`KitEntry.action`); absent, with any. */
  readonly action?: string;
  /** Strike it with this limb, an effector (`hand.right`, `foot.left`); absent, with any. */
  readonly limb?: string;
}

export const STAND_ORDERS: Orders = Object.freeze({ move: null, face: null });

/**
 * Whether `orders` allow `action` with `limb` at `foe`: always, but where they move or stand the
 * body and name no foe (the hands are held from blows), or name that foe and another action or
 * another limb.
 */
export const orderAllows = (orders: Orders | null, foe: string, action: string, limb: string): boolean =>
  orders === null || (orders.foe === undefined ? orders.move === undefined
    : orders.foe !== foe || (orders.action === undefined || orders.action === action) && (orders.limb === undefined || orders.limb === limb));

/** The regions to aim at at `foe`: the region `orders` name there, else `regions`, an action's own. */
export const orderedRegions = (orders: Orders | null, foe: string, regions: readonly Region[]): readonly Region[] =>
  orders?.foe === foe && orders.region !== undefined ? [orders.region] : regions;

/** What `orders` name of a strike, as one string: a mind that keeps what it chose for an order chooses again when this changes. */
export const struckKey = (orders: Orders | null): string | null =>
  orders?.foe === undefined ? null : JSON.stringify([orders.foe, orders.region ?? null, orders.action ?? null, orders.limb ?? null]);

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
  const { move, pace, walk, face, foe, region, action, limb } = value as Record<string, unknown>;
  const named = (one: unknown) => one === undefined || typeof one === "string" && one.length > 0 && foe !== undefined;
  return (move === undefined || move === null || isMovement(move)) && (pace === undefined || typeof pace === "number" && Number.isFinite(pace) && pace >= 0) && (face === null || isHeading(face))
    && (walk === undefined || walk === true)
    && (foe === undefined || typeof foe === "string" && foe.length > 0)
    && (region === undefined || isRegion(region) && foe !== undefined) && named(action) && named(limb)
    && Object.keys(value).every(key => ["move", "pace", "walk", "face", "foe", "region", "action", "limb"].includes(key));
}

/** Whether two orders, or two absences of them, say the same thing. */
export const sameOrders = (a: Orders | null, b: Orders | null): boolean => JSON.stringify(a) === JSON.stringify(b);
