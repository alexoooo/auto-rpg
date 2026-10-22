import { deepFreeze } from "../../state.ts";
import type { ActionRequest } from "../../skills/action.ts";
import { structuredConfig, type BehaviourPart } from "../behaviour-part.ts";
import { anyBody } from "../parts.ts";

/** **Attack**: the actions under way go on, and the chosen candidate starts once it is ready. */
interface AttackConfig { readonly kind: "attack" }

export const ATTACK: BehaviourPart<AttackConfig> = deepFreeze({
  role: "behaviour", label: "Attack", stage: "game", phases: { attack: null }, fields: [], slots: [], defaults: { kind: "attack" },
  keys: { kind: true }, fits: anyBody, faults: () => [],
  make: () => ({ decide(turn) {
    if (turn.requested) return;
    const asks: ActionRequest[] = turn.sight.report.actions.map(action => ({ id: action.id, action: action.action, effector: action.effector, target: structuredConfig(action.target) }));
    if (turn.pending && turn.recheck(turn.pending).kind === "ready") asks.push(turn.start(turn.pending));
    turn.requested = asks;
    if (asks.length) turn.phase = "attack";
  } }),
});
