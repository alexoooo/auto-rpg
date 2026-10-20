import { isMovement, type MovementRequest, type GroundPoint } from "./movement.ts";

/** A direction on the ground, world. */
export type Heading = GroundPoint;

/**
 * **What a body is told to do**, by a person, a team's plan or its own tactics: plain data, in
 * the world's frame, naming no joint or camera, and a pace only as a ceiling. Tactics that take orders carry them out
 * (`actionTactics`); the body defends itself meanwhile.
 */
export interface Orders {
  /** A world movement objective. Null requests a controlled stop; absent external orders leaves movement to the Mind. */
  readonly move: MovementRequest | null;
  /** Walk no faster than this, m/s, as a walk coming to a stop does; absent, the body's own pace is the only bound. */
  readonly pace?: number;
  /** Prefer running where the gait and requested facing permit it; pace remains a ceiling. */
  readonly run?: true;
  /** Face this way (its length is not read past 0.08). Null faces the walk, or, standing, as it stands. */
  readonly face: Heading | null;
  /** Attack this sensed body (`BodySense.id`) where the mind chooses on it. */
  readonly foe?: string;
  /** Prefer this anatomical segment on the ordered body; absent, use the configured regions. */
  readonly region?: string;
}

export const STAND_ORDERS: Orders = Object.freeze({ move: null, face: null });

const isHeading = (value: unknown): value is Heading => typeof value === "object" && value !== null
  && Number.isFinite((value as Heading).x) && Number.isFinite((value as Heading).z);

/** Whether `value` is orders: what orders read from outside the program must be before a body is given them. */
export function isOrders(value: unknown): value is Orders {
  if (typeof value !== "object" || value === null) return false;
  const { move, pace, run, face, foe, region } = value as Record<string, unknown>;
  return (move === null || isMovement(move)) && (pace === undefined || typeof pace === "number" && Number.isFinite(pace) && pace >= 0) && (face === null || isHeading(face))
    && (run === undefined || run === true)
    && (foe === undefined || typeof foe === "string" && foe.length > 0)
    && (region === undefined || typeof region === "string" && region.length > 0 && foe !== undefined)
    && Object.keys(value).every(key => ["move", "pace", "run", "face", "foe", "region"].includes(key));
}

/** Whether two orders, or two absences of them, say the same thing. */
export const sameOrders = (a: Orders | null, b: Orders | null): boolean => JSON.stringify(a) === JSON.stringify(b);
