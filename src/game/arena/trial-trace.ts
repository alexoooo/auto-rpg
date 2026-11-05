/**
 * **A drill trial's trace**: what its overlays draw (`trial-overlay.ts`), read after every step
 * the bout takes, where it steps: where the striker's actions aim (`ActionStatus.aim`, as its mind
 * reports them, `MindReport`), the target's path (the centre of the region its last action aims
 * at, the middle of the other body before one), each action's effector's path while it is under
 * way, and each contact between the two. Nothing here decides anything.
 */
import { Vector3 } from "../../core/math/vector.ts";
import { regionSegments } from "../../skills/intent/action-aim.ts";
import { centreOfToRef } from "../../core/bodies/read-motion.ts";
import type { Region } from "../../skills/framework/action.ts";
import type { Vec3 } from "../../core/bodies/spec/quantity.ts";
import type { Duel } from "./duel.ts";

/** The middle of a body, where the striker has not yet aimed at a region of it. */
const MIDDLE: Region = Object.freeze({ kind: "mark", mark: "middle" });

/**
 * What a trial's steps added to its overlays since the last were read, plain data a worker sends:
 * the target's path, each action's effector's points by the action's id, the aims, and the
 * contacts, each struck with an action's effector or touched with anything else. World, m.
 */
export interface TrialTrace {
  readonly target: readonly Vec3[];
  readonly effectors: readonly { readonly id: number; readonly at: Vec3 }[];
  readonly aims: readonly Vec3[];
  readonly contacts: readonly { readonly struck: boolean; readonly at: Vec3 }[];
}

/**
 * **What `duel`'s trial draws**, the left side striking the right, read after every step:
 * `take` gives what the steps since the last call added. A listener only reads: a bout with one
 * is the same bout.
 */
export function trialTrace(duel: Duel) {
  const striker = duel.duelists.left, target = duel.duelists.right;
  const segmentsOf = (region: Region) => regionSegments(target.built.spec, region).map((name) => target.built.segments.get(name)!).filter(Boolean);
  let region = MIDDLE, targeted = segmentsOf(region), blowsRead = 0;
  /** The effectors the striker's actions have used: a contact made with one is struck. */
  const struckWith = new Set<string>(), at = new Vector3(), centre = new Vector3();
  let trace = { target: [] as Vec3[], effectors: [] as { id: number; at: Vec3 }[], aims: [] as Vec3[], contacts: [] as { struck: boolean; at: Vec3 }[] };
  const hook = duel.world.afterStep(() => {
    for (const action of striker.minded.report?.actions ?? []) {
      if (action.target.kind !== "body") continue;
      if (JSON.stringify(action.target.region) !== JSON.stringify(region)) { region = action.target.region; targeted = segmentsOf(region); }
      struckWith.add(action.effector);
      const segment = striker.built.segments.get(action.effector);
      if (segment) { centreOfToRef(segment, at); trace.effectors.push({ id: action.id, at: [at.x, at.y, at.z] }); }
      if (action.aim) trace.aims.push([action.aim[0], action.aim[1], action.aim[2]]);
    }
    if (targeted.length) {
      centre.setAll(0);
      for (const segment of targeted) centre.addInPlace(centreOfToRef(segment, at));
      centre.scaleInPlace(1 / targeted.length);
      trace.target.push([centre.x, centre.y, centre.z]);
    }
    const blows = duel.blows;
    for (; blowsRead < blows.length; blowsRead++) {
      const blow = blows[blowsRead]!, by = blow.sides.find((side) => side.fighter === striker.side), on = blow.sides.find((side) => side.fighter === target.side);
      if (by && on) trace.contacts.push({ struck: struckWith.has(by.segment), at: [blow.point[0], blow.point[1], blow.point[2]] });
    }
  });
  return {
    /** What the steps since the last call added, or null where they added nothing. */
    take(): TrialTrace | null {
      const taken = trace;
      if (!taken.target.length && !taken.effectors.length && !taken.aims.length && !taken.contacts.length) return null;
      trace = { target: [], effectors: [], aims: [], contacts: [] };
      return taken;
    },
    dispose(): void { hook.dispose(); },
  };
}
