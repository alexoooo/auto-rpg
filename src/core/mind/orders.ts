import type { Vec3 } from "../spec/quantity.ts";

/** A direction on the ground, world. */
export interface Heading { readonly x: number; readonly z: number }

/**
 * **What a body is told to do**, by a person, a team's plan or its own tactics: plain data, in
 * the world's frame, naming no joint, pace or camera. Tactics that take orders carry them out
 * (`fighterTactics`); the body defends itself meanwhile.
 */
export interface Orders {
  /** Walk this way (its length is not read), at the body's own pace. Null stands. */
  readonly move: Heading | null;
  /** Face this way (its length is not read past 0.08). Null faces the walk, or, standing, as it stands. */
  readonly face: Heading | null;
  /** Attack this world point with the mind's chosen endpoint; the walk waits. Null guards. */
  readonly attack: Vec3 | null;
}

export const STAND_ORDERS: Orders = Object.freeze({ move: null, face: null, attack: null });

const isHeading = (value: unknown): value is Heading => typeof value === "object" && value !== null
  && Number.isFinite((value as Heading).x) && Number.isFinite((value as Heading).z);

/** Whether `value` is orders: what orders read from outside the program must be before a body is given them. */
export function isOrders(value: unknown): value is Orders {
  if (typeof value !== "object" || value === null) return false;
  const { move, face, attack } = value as Record<string, unknown>;
  return (move === null || isHeading(move)) && (face === null || isHeading(face))
    && (attack === null || (Array.isArray(attack) && attack.length === 3 && attack.every((n) => Number.isFinite(n))));
}

/** Whether two orders, or two absences of them, say the same thing. */
export const sameOrders = (a: Orders | null, b: Orders | null): boolean => JSON.stringify(a) === JSON.stringify(b);
