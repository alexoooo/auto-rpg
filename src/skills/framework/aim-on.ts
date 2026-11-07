import type { BodyView } from "../../control/body.ts";
import type { Ended } from "./action.ts";

import { regionSegments, sensedActionTarget, type Aimed } from "./action-aim.ts";
import type { Aim } from "./aim-part.ts";
import type { BodySense } from "../../core/bodies/senses.ts";

/**
 * An aim at a body target: `find` is asked of the foe the target names and the segments of its
 * region, where the foe is sensed and has them; a point target is aimed at as it says.
 */
export function aimOn(find: (view: BodyView, foe: BodySense, names: readonly string[], effector: string, ledger: readonly Ended[]) => Aimed | null): Aim {
  return (view, target, effector, ledger = []) => {
    if (target.kind === "point") return { at: target.at, ...(target.direction ? { direction: target.direction } : {}) };
    const foe = sensedActionTarget(view, target);
    if (!foe) return null;
    const names = regionSegments(foe.spec, target.region);
    return names.length ? find(view, foe, names, effector, ledger) : null;
  };
}
