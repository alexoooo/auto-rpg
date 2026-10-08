import { commandsBody } from "../core/body.ts";
import type { Minded } from "../core/mind/minds.ts";
import type { PhysicalBody } from "../core/physical-body.ts";
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

/**
 * **A fighter's fingers**, as its body holds its hands (`HandPoses`): closed in its fist or on what
 * it grips, open else. Every skill set closes a bare hand for its blow (`closesToStrike`), so the
 * fingers follow the body and no presentation of its own; a body without a hand's pose relaxes it.
 */
export function fighterHands(fighter: { readonly minded: Pick<Minded, "body"> }) {
  const poses = fighter.minded.body.built.handPoses.state;
  const closure = (hand: "left" | "right") => (poses[hand]?.applied ?? "open") === "open" ? 0 : 1;
  return { closure, snapshot: () => ({ left: closure("left"), right: closure("right") }), dispose() {} };
}
