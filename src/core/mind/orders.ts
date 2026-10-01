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
  /** Attack this point, world, with what the right hand holds; the walk waits. Null guards. */
  readonly attack: Vec3 | null;
}

export const STAND_ORDERS: Orders = Object.freeze({ move: null, face: null, attack: null });

/** Whether two orders, or two absences of them, say the same thing. */
export const sameOrders = (a: Orders | null, b: Orders | null): boolean => JSON.stringify(a) === JSON.stringify(b);
