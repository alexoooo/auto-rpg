import { commandsBody } from "../core/body.ts";
import type { Minded } from "../core/mind/minds.ts";
import type { PhysicalBody } from "../core/physical-body.ts";
import type { Pool } from "../core/rules/pool.ts";
import type { StrikeReport } from "../core/skills/strike.ts";
import type { World } from "../core/world.ts";
import { handPose, type HandAction } from "./hand-pose.ts";

type Strike = Pick<StrikeReport, "hand" | "phase">;

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

/** Every skill-based fighter shares the same presentation; direct joint control asks for none. */
export function fighterHands(world: Pick<World, "afterStep">, fighter: { readonly minded: Minded; readonly pool: Pick<Pool, "ending"> }) {
  const mind = fighter.minded;
  if (mind.kind === "quadruped") return { closure: () => 0, snapshot: () => ({ left: 0, right: 0 }), dispose() {} };
  if ("skills" in mind && mind.skills.report.strike.physicalHands) {
    const closure = (hand: "left" | "right") => mind.body.built.handPoses.state[hand]?.applied === "open" ? 0 : 1;
    return { closure, snapshot: () => ({ left: closure("left"), right: closure("right") }), dispose() {} };
  }
  const read = (): Strike | null => {
    switch (mind.kind) {
      case "fighter": case "arena-fighter": return mind.skills.report.strike;
      case "direct": return null;
      default: { const never: never = mind; throw new Error(`unknown mind ${never}`); }
    }
  };
  return strikeHands(world, mind.body, read, () => fighter.pool.ending() === null);
}
