/**
 * Orders: whom to fight and where to go (skill ceiling session 06, the orders half).
 *
 * **A person commands and does not puppet.** What a person, or an auto-commander on an AI side,
 * hands a body is an `Orders`: a target and a destination. The mind still drives the body -- its
 * arms, its trunk, its footwork -- and the orders bend only where it goes. `docs/analysis/2026-09-26-orders.md`
 * is the argument.
 *
 * - `target` is a body id, a point on the ground, or null. A body id is the enemy to fight: the
 *   host resolves it into the view's `opponent`, because the view is where a mind reads its enemy
 *   from and the host is what builds the view (the arena has one enemy, the dungeon many). A point
 *   is an attack-move: go there, and fight whatever comes within `ORDER_TUNING.engageM` on the way.
 *   Null is the nearest enemy, which is what every mind did before orders existed.
 * - `destination` is a point on the ground to move to and hold, while still defending: the mind's
 *   arms, trunk and facing are its own, and only `forward` and `strafe` are the order's while the
 *   body is outside the leash (`OrderFollower`). Null leaves the footwork to the mind.
 *
 * **No orders is not an order.** A body whose commander hands over null, or which has no commander,
 * is decided exactly as before this file existed, to the bit: `GolemDriver.step` in
 * `src/golem/golem-control.ts` does not reach `OrderFollower` at all. The null-control bout set in
 * the analysis doc is what says so.
 *
 * Imports only types, so the whole of it runs under Node and nothing here can reach a module the
 * DOM owns.
 */
import type { FighterView, Intent } from "./mind.ts";

/** A point on the ground, world metres: the arena's and the dungeon's floor plane is (x, z). */
export interface GroundPoint {
  readonly x: number;
  readonly z: number;
}

/** A body id, a point on the ground, or null for the nearest enemy. */
export type OrderTarget = string | GroundPoint | null;

export interface Orders {
  readonly target: OrderTarget;
  readonly destination: GroundPoint | null;
}

export const isGroundPoint = (target: OrderTarget | undefined): target is GroundPoint =>
  typeof target === "object" && target !== null;

/** Whether a set of orders asks for anything: null, and orders with both fields null, do not. */
export const hasOrders = (orders: Orders | null | undefined): orders is Orders =>
  !!orders && (orders.target !== null || orders.destination !== null);

/**
 * How a body carries out a destination. Metres throughout, on the ground plane.
 *
 * - `arriveM`: inside this a moving body counts as arrived and hands its footwork back to the mind.
 *   A carrier's own stopping distance at walking pace is a couple of decimetres (`src/golem/config.ts`),
 *   so a tighter band would be a body oscillating over the point.
 * - `leashM`: a body holding a point is walked back once it strays past this. The gap between the two
 *   is the room a holding mind has for its own footwork: a lunge in and a step back, not a chase.
 * - `slowM`: the walk is at full command until this far out, then eases in proportion, so a body
 *   does not overrun its point at the carrier's top speed.
 * - `engageM`: an attack-move stops walking and leaves the fight to the mind once the enemy's ground
 *   is this close -- past every striker's reach plus a step, so the mind has the approach to itself.
 * - `threatM`: within this, a body moving under orders keeps the mind's facing, which is the mind's
 *   guard pointed at the enemy; beyond it, the body turns to face where it is going.
 */
export const ORDER_TUNING = Object.freeze({
  arriveM: 0.3,
  leashM: 0.8,
  slowM: 0.6,
  engageM: 4,
  threatM: 3.5,
  /** How hard a body turns toward its travel direction, per radian of heading error. */
  turnGain: 2,
});

const clamp1 = (value: number): number => Math.max(-1, Math.min(1, value));
const wrap = (angle: number): number => Math.atan2(Math.sin(angle), Math.cos(angle));

/**
 * Copies a command into a record this module owns, every field and one level down, without naming
 * any of them -- so a field added to `Intent` tomorrow is carried tomorrow (the dropped-field trap in
 * `AGENTS.md`). The mind's own record is never written: a mind that reads back its last command
 * would otherwise be reading the order's.
 */
function copyInto(out: Record<string, unknown>, from: Record<string, unknown>): void {
  for (const key of Object.keys(from)) {
    const value = from[key];
    if (value !== null && typeof value === "object") {
      const into = out[key];
      out[key] = Object.assign(into !== null && typeof into === "object" ? into : {}, value);
    } else {
      out[key] = value;
    }
  }
}

/**
 * Carries a set of orders out on top of a mind's command, one decision at a time.
 *
 * Plain fields only, so a fork's walk (`src/fork/graph.ts`) captures it whole. `holding` is the
 * hysteresis between `arriveM` and `leashM`; `destination` is the point it was measured against,
 * so a new point starts a new walk.
 */
export class OrderFollower {
  holding = false;
  private goalX = Number.NaN;
  private goalZ = Number.NaN;
  private readonly out: Record<string, unknown> = {};

  /**
   * The command to apply: the mind's own, or a copy with `forward`, `strafe` and (away from the
   * enemy) `turn` written by the orders. The arms, the trunk and the natural striker are always the
   * mind's, which is what "still defending itself" is.
   */
  obey(intent: Intent, view: FighterView, orders: Orders): Intent {
    const self = view.self;
    const enemy = view.opponent;
    const ex = enemy.ground.x - self.ground.x, ez = enemy.ground.z - self.ground.z;
    const enemyGap = Math.hypot(ex, ez);
    let goal = orders.destination;
    if (!goal && isGroundPoint(orders.target) && !(enemyGap <= ORDER_TUNING.engageM)) goal = orders.target;
    if (!goal) { this.holding = false; return intent; }
    if (goal.x !== this.goalX || goal.z !== this.goalZ) {
      this.goalX = goal.x; this.goalZ = goal.z; this.holding = false;
    }
    const dx = goal.x - self.ground.x, dz = goal.z - self.ground.z;
    const d = Math.hypot(dx, dz);
    const facing = self.facing;
    const sin = Math.sin(facing), cos = Math.cos(facing);
    const out = this.out;
    if (this.holding ? d <= ORDER_TUNING.leashM : d <= ORDER_TUNING.arriveM) {
      this.holding = true;
      if (d <= ORDER_TUNING.arriveM) return intent;
      // Between the bands the mind's own footwork stands, less whatever of it points away from the
      // point, tapered to nothing at the leash: a lunge in and a step back, and no chase. Without
      // the taper a duelist holding a point beside an idle body walked out to 1.32 m after it,
      // was walked back and walked out again, past the leash half the time (Node bout runner).
      const vx = intent.forward * sin + intent.strafe * cos;
      const vz = intent.forward * cos - intent.strafe * sin;
      const rx = -dx / d, rz = -dz / d;
      const outward = vx * rx + vz * rz;
      if (outward <= 0) return intent;
      const cut = outward * (1 - (ORDER_TUNING.leashM - d) / (ORDER_TUNING.leashM - ORDER_TUNING.arriveM));
      const wx = vx - cut * rx, wz = vz - cut * rz;
      copyInto(out, intent as unknown as Record<string, unknown>);
      out.forward = clamp1(wx * sin + wz * cos);
      out.strafe = clamp1(wx * cos - wz * sin);
      return out as unknown as Intent;
    }
    this.holding = false;
    copyInto(out, intent as unknown as Record<string, unknown>);
    const speed = Math.min(1, d / ORDER_TUNING.slowM) / Math.max(d, 1e-6);
    const ux = dx * speed, uz = dz * speed;
    out.forward = clamp1(ux * sin + uz * cos);
    out.strafe = clamp1(ux * cos - uz * sin);
    if (!(enemyGap <= ORDER_TUNING.threatM)) {
      out.turn = clamp1(wrap(Math.atan2(dx, dz) - facing) * ORDER_TUNING.turnGain);
    }
    return out as unknown as Intent;
  }
}

/**
 * Something that hands a body its orders at every decision: a person, or an auto-commander on an
 * AI side. Null is no orders, and a body with no commander is a body with none.
 */
export interface Commander {
  readonly name: string;
  orders(view: FighterView): Orders | null;
}

/**
 * A person's commander: whatever the page last set, and nothing it did not. The arena's `Controls`
 * and the dungeon's party write `current`; the body reads it at its next decision.
 */
export class StandingOrders implements Commander {
  readonly name = "person";
  current: Orders | null = null;
  orders(): Orders | null { return this.current; }
}

/**
 * Attack the nearest: an auto-commander that hands over no orders at all, because a mind with none
 * already fights the nearest enemy. It exists so that an AI side names its commander, and naming
 * it costs nothing -- a bout under it is the bout without it, to the bit.
 */
export class AttackNearest implements Commander {
  readonly name = "attack-nearest";
  orders(): Orders | null { return null; }
}

/**
 * Hold here: the ground the body stood on at its first decision under this commander, held as a
 * destination for the rest of the bout. The body fights from there; it steps in and out inside the
 * leash and is walked back past it.
 */
export class HoldHere implements Commander {
  readonly name = "hold-here";
  point: GroundPoint | null = null;
  orders(view: FighterView): Orders {
    if (!this.point) this.point = { x: view.self.ground.x, z: view.self.ground.z };
    return { target: null, destination: this.point };
  }
}

/** The auto-commanders an AI side may be given, by name. */
export const AUTO_COMMANDERS = Object.freeze(["attack-nearest", "hold-here"] as const);
export type AutoCommanderName = (typeof AUTO_COMMANDERS)[number];
export const isAutoCommanderName = (name: string): name is AutoCommanderName =>
  (AUTO_COMMANDERS as readonly string[]).includes(name);

/** A fresh auto-commander. A name without a case is a compile error, never a substitution. */
export function autoCommander(name: AutoCommanderName): Commander {
  switch (name) {
    case "attack-nearest": return new AttackNearest();
    case "hold-here": return new HoldHere();
    default: {
      const unknown: never = name;
      throw new Error(`no auto-commander "${String(unknown)}"`);
    }
  }
}
