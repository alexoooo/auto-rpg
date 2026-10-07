import { commandsBody } from "../core/body.ts";
import type { Minded } from "../core/mind/minds.ts";
import type { PhysicalBody } from "../core/physical-body.ts";
import type { Pool } from "../core/rules/pool.ts";
import type { StrikeReport } from "../core/skills/strike.ts";
import type { World } from "../core/world.ts";
import { handPose, type HandAction } from "./hand-pose.ts";

type Strike = Pick<StrikeReport, "hand" | "phase" | "physicalHands">;

/** A skill's phase as finger presentation; approach and guard leave empty hands relaxed. */
function actionOf(phase: Strike["phase"]): HandAction {
  switch (phase) {
    case "chamber": return "close";
    case "swing": return "fist";
    case "approach": case "place": case "return": case "settle": case null: return "relax";
    default: { const never: never = phase; throw new Error(`unknown strike phase ${never}`); }
  }
}

/** Follow the command owner's report, never a stale attack from before a takeover or elimination. */
export function strikeHands(world: Pick<World, "afterStep">, body: Pick<PhysicalBody, "has" | "level">,
  read: () => Strike | null, active: () => boolean = () => true) {
  const pose = handPose();
  const hook = world.afterStep(dt => {
    const strike = commandsBody(body) && active() ? read() : null;
    for (const hand of ["left", "right"] as const)
      pose.step(hand, strike?.hand === hand ? actionOf(strike.phase) : "relax", dt);
  });
  return { closure: pose.closure, snapshot: pose.snapshot, dispose: () => hook.dispose() };
}

/**
 * **A fighter's fingers**: every skill-based fighter's from its strike report; a mind that strikes
 * with no hand, or drives joints directly, asks for none and its hands relax. A strike that closes
 * the body's own hands (`StrikeReport.physicalHands`) is shown as the body holds them.
 */
export function fighterHands(world: Pick<World, "afterStep">, fighter: { readonly minded: Minded; readonly pool: Pick<Pool, "ending"> }) {
  const mind = fighter.minded;
  const read = (): Strike | null => {
    switch (mind.kind) {
      case "recipe-fighter": case "path-fighter": return mind.skills.report.strike;
      case "quadruped": case "direct": return null;
      default: { const never: never = mind; throw new Error(`unknown mind ${never}`); }
    }
  };
  if (read()?.physicalHands) {
    const closure = (hand: "left" | "right") => mind.body.built.handPoses.state[hand]?.applied === "open" ? 0 : 1;
    return { closure, snapshot: () => ({ left: closure("left"), right: closure("right") }), dispose() {} };
  }
  return strikeHands(world, mind.body, read, () => fighter.pool.ending() === null);
}
