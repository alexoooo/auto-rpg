/** A direction on the ground, world. */
export interface Heading { readonly x: number; readonly z: number }

/**
 * **What a body is told to do**, by a person, a team's plan or its own tactics: plain data, in
 * the world's frame, naming no joint or camera, and a pace only as a ceiling. Tactics that take orders carry them out
 * (`actionTactics`); the body defends itself meanwhile.
 */
export interface Orders {
  /** Walk this way (its length is not read), at the body's own pace. Null stands. */
  readonly move: Heading | null;
  /** Walk no faster than this, m/s, as a walk coming to a stop does; absent, the body's own pace is the only bound. */
  readonly pace?: number;
  /** Run: walk the way it is told facing that way, at its fastest walk forward; the facing told is set aside. */
  readonly run?: true;
  /** Face this way (its length is not read past 0.08). Null faces the walk, or, standing, as it stands. */
  readonly face: Heading | null;
  /** Attack this sensed body (`BodySense.id`) where the mind chooses on it. */
  readonly foe?: string;
  /** Prefer this anatomical segment on the ordered body; absent, use the configured regions. */
  readonly region?: string;
  /** How far the body is from where it is told to go, m; absent where it is told to go nowhere. */
  readonly destination?: number;
}

export const STAND_ORDERS: Orders = Object.freeze({ move: null, face: null });

const isHeading = (value: unknown): value is Heading => typeof value === "object" && value !== null
  && Number.isFinite((value as Heading).x) && Number.isFinite((value as Heading).z);

/** Whether `value` is orders: what orders read from outside the program must be before a body is given them. */
export function isOrders(value: unknown): value is Orders {
  if (typeof value !== "object" || value === null) return false;
  const { move, pace, run, face, foe, region, destination } = value as Record<string, unknown>;
  return (move === null || isHeading(move)) && (pace === undefined || typeof pace === "number" && Number.isFinite(pace) && pace >= 0) && (face === null || isHeading(face))
    && (run === undefined || run === true)
    && (foe === undefined || typeof foe === "string" && foe.length > 0)
    && (region === undefined || typeof region === "string" && region.length > 0 && foe !== undefined)
    && (destination === undefined || typeof destination === "number" && Number.isFinite(destination) && destination >= 0)
    && Object.keys(value).every(key => ["move", "pace", "run", "face", "foe", "region", "destination"].includes(key));
}

/** Whether two orders, or two absences of them, say the same thing. */
export const sameOrders = (a: Orders | null, b: Orders | null): boolean => JSON.stringify(a) === JSON.stringify(b);
