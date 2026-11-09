import type { GaitName } from "../../skills/framework/skill.ts";
import { atan2, cos, hypot, sin } from "../../core/math/real.ts";
import type { BodySpec } from "../../core/bodies/spec/body.ts";
import { heldPace } from "../../control/stance/stance-envelope.ts";
import { legSeconds } from "../../skills/locomotion/travel.ts";
import type { GroundPoint } from "../../skills/framework/movement.ts";
import { keepOut } from "../../skills/locomotion/navigation/clear-step.ts";
import type { Situation } from "./option.ts";
import type { Intent } from "../../skills/framework/intent.ts";

/** What an option asks of the legs: a movement goal under a ceiling, and a facing. */
type Walk = Pick<Intent, "move" | "face" | "movement" | "pace" | "travelFacing">;

/**
 * **How a standing option walks** a body of `spec`: what its gaits hold, under its orders' pace;
 * which way its focus is; and a walk kept clear of what the body must keep clear of.
 */
export function walker(_spec: BodySpec) {
  /**
   * The speed the rule asks going `forward` and `right` (a direction, in the frame of the way the
   * body faces) with nothing ahead to stop for, m/s: what the gait holds that way (`heldPace`),
   * `gait` where it names one the legs have (`Sight.limitsOf`), else the one they go by, under the
   * orders' pace. Forward unless given.
   */
  const pace = (now: Situation, gait?: GaitName | null, forward = 1, right = 0): number => {
    const envelope = (gait === undefined || gait === null ? null : now.sight.limitsOf(gait)?.envelope) ?? now.sight.envelope;
    return Math.min(envelope ? heldPace(envelope, forward, right) : Infinity, now.orders?.pace ?? Infinity);
  };
  return {
    pace,
    /**
     * How long each leg of the way from where the body is through `way` takes by `gait`, s: at the
     * speed the legs are asked all along it (`legSeconds`, the speed rule), from the speed the body
     * goes (`velocity`), facing `face` where given and else the way each leg goes, under the orders'
     * pace; at that pace where the legs have no such gait. What an option prices a walk by.
     */
    seconds(now: Situation, gait: GaitName, way: readonly GroundPoint[], face: number | null): number[] {
      const limits = now.sight.limitsOf(gait), where = now.where, v = now.velocity, ceiling = now.orders?.pace ?? Infinity;
      if (!limits) {
        let at: GroundPoint = where;
        return way.map((point) => { const length = hypot(point.x - at.x, point.z - at.z); at = point; return length > 0 ? length / ceiling : 0; });
      }
      const frame = (x: number, z: number): readonly [number, number] => face === null ? [1, 0] : [x * sin(face) + z * cos(face), x * cos(face) - z * sin(face)];
      return legSeconds(limits, { x: where.x, z: where.z }, way, frame, hypot(v.x, v.z), ceiling);
    },
    /** The gait's measured forward speed, m/s, or the explicit ordered pace without an envelope: what a second of carrying out orders is priced by. */
    stride(now: Situation): number {
      const envelope = now.sight.envelope;
      return envelope ? heldPace(envelope, 1, 0) : now.orders?.pace ?? 0;
    },
    /** The heading to the focus, or the body's own with none. */
    facing(now: Situation): number {
      const { focus, sight } = now;
      return focus ? atan2(focus.centre.x - sight.view.stance.centre.x, focus.centre.z - sight.view.stance.centre.z) : sight.report.heading;
    },
    /**
     * `asked` kept out of what the body must keep clear of (`keepOut`): a solid's clearance and the
     * reach of every fallen body but `exempt` (the one it means to be near), at the orders' pace
     * and by their gait. What each option that asks the legs asks them is kept so: a limit of the
     * walk, not of the choice.
     */
    kept<A extends Walk>(now: Situation, asked: A, exempt: string | null = null): A {
      const kept = keepOut(now.sight.view, now.sight.clearance, asked, exempt, now.orders?.pace), gait = now.orders?.gait;
      return gait === undefined ? kept : { ...kept, gait };
    },
  };
}

export type Walker = ReturnType<typeof walker>;
