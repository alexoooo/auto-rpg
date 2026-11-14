import type { Body } from "../../control/body.ts";
import type { PartConfig } from "../../parts/parts.ts";
import type { PartLookup } from "../../parts/lookup.ts";
import type { LowSupportSkill, LowSupportReport } from "../framework/low-support.ts";
import { skillName } from "../framework/variations.ts";

/** The enabled supports, selected explicitly by the Option that uses one. */
export function supportRepertoire(parts: PartLookup, body: Body, configs: readonly PartConfig[]): LowSupportSkill {
  const supports = configs.map(config => parts.of("support", config).make(body, config)), names = configs.map(skillName);
  const state = { selected: configs.length === 1 ? 0 : -1, supports: supports.map(support => support.state) };
  const current = () => supports[state.selected];
  const inactive: LowSupportReport = { stage: "stand", ready: false, posture: {} };
  return {
    state, get report() { return current()?.report ?? inactive; },
    select(name, view) {
      if (name === undefined) return;
      const index = names.indexOf(name);
      if (index < 0) throw new Error(`support ${name} is not selected`);
      if (index === state.selected) return;
      current()?.resume(view); state.selected = index; current()!.resume(view);
    },
    carries: goal => current()?.carries(goal) ?? false,
    walks: () => current()?.walks() ?? true,
    tick: (view, height, moving, dt) => current()?.tick(view, height, moving, dt),
    lay: (view, goal) => current()?.lay(view, goal) ?? goal,
    resume: view => { for (const support of supports) support.resume(view); },
  };
}
