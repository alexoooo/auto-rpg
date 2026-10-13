import { copyActionTarget, sameActionIdentity } from "../skills/action.ts";
import type { ActionAround, ActionRequest, Readiness, TargetRef } from "../skills/action.ts";
import type { ActionSight } from "./action-tactics.ts";

/** A script chooses a named action and endpoint; its point may move without changing identity. */
interface Choice { readonly action: string; readonly effector: string; readonly target: TargetRef }

/** One script commitment, explicitly retried with a new id only after fresh admission checks. */
export function actionProducer() {
  const state = { current: null as ActionRequest | null };
  return {
    state,
    request(sight: ActionSight, choice: Choice | null, around: ActionAround): {
      readonly requests: readonly ActionRequest[]; readonly readiness: Readiness | null;
    } {
      if (!choice) { state.current = null; return { requests: [], readiness: null }; }
      const current = state.current;
      if (current && sameActionIdentity(current, choice) && sight.report.actions.some(action => action.id === current.id)) {
        state.current = { ...choice, target: copyActionTarget(choice.target), id: current.id };
        return { requests: [state.current], readiness: { kind: "ready" } };
      }
      state.current = null;
      const readiness = sight.readiness(sight.view, choice.action, choice.effector, choice.target, around);
      if (readiness.kind !== "ready") return { requests: [], readiness };
      state.current = { ...choice, target: copyActionTarget(choice.target), id: sight.instance() };
      return { requests: [state.current], readiness };
    },
  };
}
