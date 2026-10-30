import { atan2 } from "../../../core/math/real.ts";
import { paceToward } from "../../../core/control/stance-envelope.ts";
import type { GaitName } from "../../../core/skills/gaits.ts";
import { keepOut } from "../../../core/mind/clear-step.ts";
import type { Situation } from "./option.ts";
import type { Intent } from "../../../core/mind/intent.ts";

/** What an option asks of the legs: a movement goal under a ceiling, and a facing. */
type Walk = Pick<Intent, "move" | "face" | "movement" | "pace" | "travelFacing">;

/**
 * **How a standing option walks**: what its gaits hold, under its orders' pace;
 * which way its focus is; and a walk kept clear of what the body must keep clear of.
 */
export function walker() {
  /**
   * The speed the rule asks going `forward` and `right` (a direction, in the frame of the way the
   * body faces) with nothing ahead to stop for, m/s: what the gait holds that way (`paceToward`),
   * `gait` where it names one the legs have (`Sight.envelopeOf`), else the one they go by, under the
   * orders' pace; what an option prices a walk by. Forward unless given.
   */
  const pace = (now: Situation, gait?: GaitName | null, forward = 1, right = 0): number => {
    const envelope = (gait === undefined || gait === null ? null : now.sight.envelopeOf(gait)) ?? now.sight.envelope;
    return Math.min(envelope ? paceToward(envelope, forward, right) : Infinity, now.orders?.pace ?? Infinity);
  };
  return {
    pace,
    /** The speed its gait holds forward, m/s, before any orders' pace: what a second of carrying out orders is priced by. */
    stride(now: Situation): number {
      const envelope = now.sight.envelope;
      return envelope ? paceToward(envelope, 1, 0) : 0;
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
