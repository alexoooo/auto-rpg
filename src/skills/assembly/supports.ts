import type { Body } from "../../control/body.ts";
import type { PartConfig } from "../../parts/parts.ts";
import type { PartLookup } from "../../parts/lookup.ts";
import type { LowSupportSkill, LowSupportReport } from "../framework/low-support.ts";
import { controllerSelection } from "./selection.ts";

/** The enabled supports, selected explicitly by the Option that uses one. */
export function supportRepertoire(parts: PartLookup, body: Body, configs: readonly PartConfig[]): LowSupportSkill {
  const supports = configs.map(config => parts.of("support", config).make(body, config));
  const state = { selected: configs.length === 1 ? 0 : -1, supports: supports.map(support => support.state) };
  const { current, select } = controllerSelection({ role: "support", configs, controllers: supports, state,
    resume: (support, view: Body["view"]) => support.resume(view) });
  const inactive: LowSupportReport = { stage: "stand", ready: false, posture: {} };
  return {
    state, get report() { return current()?.report ?? inactive; },
    select,
    carries: goal => current()?.carries(goal) ?? false,
    walks: () => current()?.walks() ?? true,
    tick: (view, height, moving, dt) => current()?.tick(view, height, moving, dt),
    lay: (view, goal) => current()?.lay(view, goal) ?? goal,
    resume: view => { for (const support of supports) support.resume(view); },
  };
}
