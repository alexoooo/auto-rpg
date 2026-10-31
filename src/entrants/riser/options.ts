import { WHOLE } from "../../core/mind/choice.ts";
import { anyBody } from "../../core/parts/parts.ts";
import type { OptionKindPart } from "../../core/option/kinds.ts";
import { asking, blocked, READY, type Option } from "../../core/option/option.ts";
import type { ActionRequest } from "../../core/skills/framework/action.ts";
import { deepFreeze } from "../../core/state.ts";
import { recoveryMove, type RecoveryMove } from "./control.ts";
import { RECOVERY_ACTIONS } from "./executor.ts";

const HERE = deepFreeze({ kind: "point" as const, at: [0, 0, 0] as const });

/** One independently selectable option for each contact transition; rank chooses among admitted tasks. */
function recoveryOption(move: RecoveryMove): Option {
  const action = RECOVERY_ACTIONS[move], state = { request: null as ActionRequest | null };
  const unavailable = blocked("a different contact task is needed");
  return {
    name: `recovery: ${move}`, claims: WHOLE, state,
    entry: now => state.request || recoveryMove(now.sight.view) === move ? READY : unavailable,
    status(now) {
      if (state.request && now.sight.report.ledger.some(end => end.id === state.request!.id)) return "over";
      if (state.request && now.sight.report.actions.some(action => action.id === state.request!.id && action.phase === "release")) return "over";
      return "committed";
    },
    begin(now) { state.request = { id: now.sight.instance(), action, effector: "foot.left", target: HERE }; },
    end() { state.request = null; },
    // The ranked chooser needs no invented success estimate for an unmeasured movement.
    model: now => ({ duration: 0, dealt: 0, taken: 0, orders: 0, exit: { range: now.range, down: now.down ? 1 : 0 } }),
    step(now) {
      const asked = { move: null, face: now.sight.report.heading, actions: state.request ? [state.request] : [] };
      return { asked, holds: asking(now, asked) };
    },
  };
}

/** The option kinds are the entrant's; none invokes the toolkit's existing rise options. */
export const RECOVERY_OPTIONS: readonly OptionKindPart[] = (["extend", "plant", "gather", "right"] as const).map(move => deepFreeze({
  role: "option", label: `Recovery: ${move}`, stage: "experimental", fields: [], slots: [],
  defaults: { kind: `riser:${move}` }, keys: { kind: true }, fits: anyBody, faults: () => [],
  make: () => [recoveryOption(move)],
}));
