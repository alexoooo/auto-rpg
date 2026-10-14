import { actionProducer } from "../../src/core/mind/action-producer.ts";
import { actionTactics } from "../../src/core/mind/action-tactics.ts";
import { approachActionWindow } from "../../src/core/mind/action-window.ts";
import { FIGHTING } from "../../src/core/mind/config.ts";
import { standIntent } from "../../src/core/mind/intent.ts";
import { bodyClearance } from "../../src/core/mind/sensed-bounds.ts";
import { STANCE_LOWER } from "../../src/core/skills/locomotion.ts";

/** Ordinary movement orders traverse the same ranked behaviour engine as gameplay. */
export const walkingTactics = (spec, orders) => actionTactics(spec, [], FIGHTING, orders);

/** A scripted observed point uses explicit protocol admission and the shared approach window. */
export function pointTactics(spec, target, observe = () => {}) {
  const producer = actionProducer(), radius = bodyClearance(spec) + .08;
  return { name: "point", state: producer.state, decide(sight, dt) {
    observe(sight, dt);
    const at = target(sight), around = { heading: sight.report.heading, placed: sight.view.stance.phase === "stand", support: sight.report.support ?? null, walk: null, lower: STANCE_LOWER };
    const asked = producer.request(sight, at ? { action: "strike", effector: "hand.right", target: { kind: "point", at: [...at] } } : null, around);
    const approach = asked.readiness?.kind === "position" ? approachActionWindow(sight.view, asked.readiness.window, sight.report.heading, sight.envelope?.walk.value ?? 0, radius) : {};
    return { ...standIntent(sight.report.heading), ...approach, actions: asked.requests };
  } };
}

/** Exact commitments are observable independently of executor-specific motion fields. */
export const committedRecords = report => [...report.actions.filter(action => action.phase === "commit"), ...report.ledger.filter(record => record.committed)];
