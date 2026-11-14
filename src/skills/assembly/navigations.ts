import type { PartConfig } from "../../parts/parts.ts";
import type { PartLookup } from "../../parts/lookup.ts";
import type { BodySpec } from "../../core/bodies/spec/body.ts";
import type { Navigator, NavigationReport } from "../framework/navigation.ts";
import { navigatorOf } from "../framework/navigation.ts";
import { skillName } from "../framework/variations.ts";

/** All enabled planners, retaining each route's memory while the mind chooses which to use. */
export function navigationRepertoire(parts: PartLookup, spec: BodySpec, configs: readonly PartConfig[]): Navigator {
  const navigators = configs.map(config => navigatorOf(parts, spec, config)), names = configs.map(skillName);
  const state = { selected: configs.length === 1 ? 0 : -1, navigators: navigators.map(navigator => navigator.state) };
  const current = () => navigators[state.selected];
  const unavailable: NavigationReport = { request: null, status: "unavailable", remaining: null, goal: null, route: [] };
  return {
    state, get report() { return current()?.report ?? unavailable; },
    select(name) {
      if (name === undefined) return;
      const index = names.indexOf(name);
      if (index < 0) throw new Error(`navigation ${name} is not selected`);
      state.selected = index;
    },
    step: (sight, request, gait, ceiling, dt, available) => current()?.step(sight, request, gait, ceiling, dt, available) ?? { move: null, face: null },
    steer: (view, heading, move) => current()?.steer(view, heading, move) ?? null,
    keepClear: (view, heading, move) => current()?.keepClear(view, heading, move) ?? null,
    exit: view => current()?.exit(view) ?? null,
    resume: () => { for (const navigator of navigators) navigator.resume(); },
  };
}
