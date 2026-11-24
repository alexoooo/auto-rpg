import type { GaitName } from "../../skills/framework/skill.ts";
import { atan2, cos, hypot, sin } from "../../core/math/real.ts";
import type { BodySpec } from "../../core/bodies/spec/body.ts";
import { heldPace, steeredPace } from "../../control/stance/stance-envelope.ts";
import { legSeconds } from "../../skills/locomotion/shared/travel.ts";
import type { GroundPoint } from "../../skills/framework/movement.ts";
import { keepOut } from "../../skills/locomotion/shared/navigation/clear-step.ts";
import type { Situation } from "./option.ts";
import type { Intent } from "../../skills/framework/intent.ts";
import { orderedFacing } from "../ordered.ts";

/** What an option asks of the legs: a movement goal under a ceiling, and a facing. */
type Walk = Pick<Intent, "move" | "face" | "movement" | "pace" | "travelFacing">;

/**
 * The most the orders let the body go, m/s: their pace, and no faster than the body's plain walk
 * goes forward where they say to walk (`Orders.walk`, `Sight.walkEnvelope`).
 */
function ceiling(now: Situation): number {
  const orders = now.orders, envelope = now.sight.walkEnvelope;
  return Math.min(orders?.pace ?? Infinity, orders?.walk && envelope ? envelope.ways.forward.value : Infinity);
}

/** Where a walk's way is timed from, at what speed, and the seconds it takes before that (`WalkStartRule`). */
interface WalkFrom { readonly from: GroundPoint; readonly on: number; readonly before: number }

/**
 * **A rule for how a walk starts**, as `Walker.seconds` prices it: of the body at `where` going at
 * `velocity`, about to walk `way` (some point of which is off `where`) by a gait that goes on at its
 * speed for `lag` s once asked to change it (`Locomotion.lag`), where its way is timed from and at what
 * speed (`legSeconds`), and the seconds before that.
 */
interface WalkStartRule {
  readonly label: string;
  readonly start: (where: GroundPoint, way: readonly GroundPoint[], velocity: { readonly x: number; readonly z: number }, lag: number) => WalkFrom;
}

/**
 * **How a walk is priced as starting** (`Walker.seconds`): at the body's speed, whichever way it goes
 * (`speed`); at its speed along the walk's first leg, none where it goes across or away (`along`);
 * or at that speed, a body going away first going on away for its gait's lag, back along the first
 * leg, as a gait's step under way lands where it was planned (`signed`).
 */
export const WALK_STARTS = {
  speed: { label: "Its speed", start: (where, _way, velocity) => ({ from: where, on: hypot(velocity.x, velocity.z), before: 0 }) },
  along: { label: "Its speed along its way", start: (where, way, velocity) => ({ from: where, on: Math.max(0, alongFirst(where, way, velocity)), before: 0 }) },
  signed: {
    label: "Its speed along its way, going on away",
    start: (where, way, velocity, lag) => {
      const on = alongFirst(where, way, velocity);
      if (on >= 0 || lag === 0) return { from: where, on: Math.max(0, on), before: 0 };
      const first = way.find((point) => point.x !== where.x || point.z !== where.z)!, length = hypot(first.x - where.x, first.z - where.z), back = -on * lag;
      return { from: { x: where.x - (first.x - where.x) / length * back, z: where.z - (first.z - where.z) / length * back }, on: 0, before: lag };
    },
  },
} as const satisfies Readonly<Record<string, WalkStartRule>>;

export type WalkStart = keyof typeof WALK_STARTS;

/**
 * **How a standing option walks** a body of `spec`: what its gaits hold, under its orders' pace;
 * which way its focus is; and a walk kept clear of what the body must keep clear of; a walk priced
 * as starting at the speed `start` says (`WalkStart`).
 */
export function walker(_spec: BodySpec, start: WalkStart) {
  /**
   * The speed the rule asks going `forward` and `right` (a direction, in the frame of the way the
   * body faces) with nothing ahead to stop for, m/s: what the gait holds that way (`heldPace`),
   * `gait` where it names one the legs have (`SkillsLegs.limitsOf`), else the one they go by, under the
   * orders' ceiling (`ceiling`). Forward unless given.
   */
  const pace = (now: Situation, gait?: GaitName | null, forward = 1, right = 0): number => {
    const envelope = (gait === undefined || gait === null ? null : now.sight.legs.limitsOf(gait)?.envelope) ?? now.sight.legs.envelope;
    return Math.min(envelope ? heldPace(envelope, forward, right) : Infinity, ceiling(now));
  };
  /**
   * The forward speed the legs' gait now was measured to hold, m/s, or the explicit ordered pace
   * without an envelope: what a second of orders already carried out is priced by, the same by
   * every gait.
   */
  const stride = (now: Situation): number => {
    const envelope = now.sight.legs.envelope;
    return envelope ? heldPace(envelope, 1, 0) : now.orders?.pace ?? 0;
  };
  /** The way the frame of `face` (rad) reads a ground direction: forward and to the right; forward everywhere with none. */
  const frameOf = (face: number | null) => (x: number, z: number): readonly [number, number] =>
    face === null ? [1, 0] : [x * sin(face) + z * cos(face), x * cos(face) - z * sin(face)];
  /**
   * How long each leg of the way from where the body is through `way` takes by `gait`, s: at the
   * speed the legs are asked all along it (`legSeconds`, the speed rule), from the speed the body
   * goes (`velocity`; under `along`, its part along the first leg), facing `face` where given and else the way each leg goes, under the orders'
   * ceiling; at that ceiling where the legs have no such gait. What an option prices a walk by.
   * Facing the way each leg goes, the body steers as it walks, so a gait is priced no faster than
   * it can steer (`steeredPace`). A walk that cannot turn at its top speed slows itself to a speed
   * it can turn at.
   */
  const seconds = (now: Situation, gait: GaitName, way: readonly GroundPoint[], face: number | null): number[] => {
    const limits = now.sight.legs.limitsOf(gait), where = now.where, v = now.velocity, envelope = limits?.envelope;
    const most = face === null && envelope ? Math.min(ceiling(now), steeredPace(envelope, heldPace(envelope, 1, 0))) : ceiling(now);
    if (!limits) {
      let at: GroundPoint = where;
      return way.map((point) => { const length = hypot(point.x - at.x, point.z - at.z); at = point; return length > 0 ? length / most : 0; });
    }
    const { from, on, before } = WALK_STARTS[start].start({ x: where.x, z: where.z }, way, v, limits.lag);
    const legs = legSeconds(limits, { from, way, frame: frameOf(face), on, ceiling: most });
    if (before > 0) legs[0]! += before;
    return legs;
  };
  return {
    pace,
    seconds,
    stride,
    /**
     * How fast `gait` carries out `now`'s orders to move, m/s: along an ordered place's way (the
     * navigator's route there where it plans its way to that place, else the order's points), or to
     * an ordered range of a body (the navigator's route to its spot where it plans one, else straight
     * toward the body to the middle of the range), its length over its time (`seconds`), facing as
     * ordered or along the way; along an ordered direction, at its pace that way (`pace`); and at the
     * stride (`stride`) where the orders stand or face, the body is at the place or in the range, or
     * the legs go by no gait.
     */
    obeying(now: Situation, gait: GaitName | null): number {
      const move = now.orders?.move, face = orderedFacing(now.orders?.face ?? null), where = now.where, route = now.sight.report.navigation;
      if (gait === null || !move) return stride(now);
      /** How fast `gait` goes `way`, m/s, where it is longer than `near`. */
      const along = (way: readonly GroundPoint[], near: number): number => {
        let length = 0, at: GroundPoint = where;
        for (const point of way) { length += hypot(point.x - at.x, point.z - at.z); at = point; }
        if (length <= near) return stride(now);
        const time = seconds(now, gait, way, face).reduce((sum, one) => sum + one, 0);
        return time > 0 ? length / time : stride(now);
      };
      switch (move.kind) {
        case "direct": {
          const { x, z } = move.direction, length = hypot(x, z);
          if (length === 0) return stride(now);
          const [forward, right] = frameOf(face)(x / length, z / length);
          return pace(now, gait, forward, right);
        }
        case "range": {
          const other = now.sight.view.senses.others.find((body) => body.id === move.focus && !body.out);
          if (!other) return stride(now);
          const dx = other.centre.x - where.x, dz = other.centre.z - where.z, apart = hypot(dx, dz), gap = apart - (move.near + move.far) / 2;
          if (apart - move.far <= 0 && move.near - apart <= 0) return stride(now);
          const spot = { x: where.x + dx * gap / apart, z: where.z + dz * gap / apart };
          return along(route?.route.length ? route.route : [spot], 0);
        }
        case "place": {
          const goal = move.points.at(-1)!;
          return along(route?.goal && route.goal.x === goal.x && route.goal.z === goal.z && route.route.length ? route.route : move.points, move.near);
        }
        default: { const never: never = move; throw new Error(`unknown movement ${JSON.stringify(never)}`); }
      }
    },
    /** The heading to the focus, or the body's own with none. */
    facing(now: Situation): number {
      const { focus, sight } = now;
      return focus ? atan2(focus.centre.x - sight.view.stance.centre.x, focus.centre.z - sight.view.stance.centre.z) : sight.report.legs.heading;
    },
    /**
     * `asked` kept out of what the body must keep clear of (`keepOut`): a solid's clearance and the
     * reach of every fallen body but `exempt` (the one it means to be near), at the orders' pace
     * and by their gait. What each option that asks the legs asks them is kept so: a limit of the
     * walk, not of the choice.
     */
    kept<A extends Walk>(now: Situation, asked: A, exempt: string | null = null): A {
      const kept = keepOut(now.sight.view, now.sight.navigation.clearance, asked, exempt, now.orders?.pace), gait = now.orders?.gait;
      return gait === undefined ? kept : { ...kept, gait };
    },
  };
}

export type Walker = ReturnType<typeof walker>;

/** The part of `velocity` along the first leg of `way` from `from` that has a length, m/s, below 0 going away; none where no leg has a length. */
function alongFirst(from: GroundPoint, way: readonly GroundPoint[], velocity: { readonly x: number; readonly z: number }): number {
  for (const point of way) {
    const x = point.x - from.x, z = point.z - from.z, length = hypot(x, z);
    if (length > 0) return (velocity.x * x + velocity.z * z) / length;
  }
  return 0;
}
