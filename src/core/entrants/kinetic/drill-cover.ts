import { deepFreeze } from "../../state.ts";
import { VALUED_CHOOSER, chooserOf } from "./options/chooser.ts";
import { covers } from "./options/cover.ts";
import { stepSet } from "./options/option.ts";
import { guard, hold } from "./options/rest.ts";
import { situationReader } from "./options/situation.ts";
import { walker } from "./options/walk.ts";
import { anyBody } from "../../mind/parts.ts";
import type { Tactics } from "../../mind/tactics.ts";
import type { TacticsMaking, TacticsPart } from "../../mind/tactics-part.ts";

/** **The Cover drill's tactics**: stand and cover, and nothing else. */
interface CoverDrillConfig { readonly kind: "drill-cover" }

/**
 * Stands where it is, facing its focus or the way it faces with none (`Walker.facing`), asks no
 * action, and chooses by worth (`VALUED_CHOOSER`) between each hand's guard and its cover
 * (`covers`), on the situation Kinetic's options read (`situationReader`, with no strikes of its own):
 * what the Cover drill reads of a body's covers. Its memory is the chooser's, the situation's and
 * the covers'.
 */
function coverDrill(making: TacticsMaking): Tactics {
  const walk = walker(making.spec), hands = covers(making.spec);
  const options = [hold(walk), ...hands.options, ...[...new Set((making.spec.effectors ?? []).map((effector) => effector.segment))].map(guard)];
  const chosen = chooserOf(making.parts, VALUED_CHOOSER.defaults, options, 0);
  let reader: ReturnType<typeof situationReader> | null = null;
  const state = { chooser: chosen.state, cover: hands.state, situation: null as object | null, covering: false };
  return {
    name: "drill-cover", state,
    engagement: { get phase() { return state.covering ? "covering" : "standing"; } },
    decide(sight, dt) {
      // The situation is read at the world's rate, which the first decision's step gives.
      reader ??= situationReader({ spec: making.spec, hz: Math.round(1 / dt), rules: making.rules, strikes: [], measured: [], ordersOf: () => null, downs: [] });
      state.situation = reader.state;
      const now = reader.read(sight), { guard } = stepSet(chosen.decide(now), now, dt, () => ({ move: null, face: walk.facing(now) }));
      state.covering = Object.keys(guard).length > 0;
      return { move: null, face: walk.facing(now), guard, actions: [] };
    },
  };
}

export const COVER_DRILL_TACTICS: TacticsPart<CoverDrillConfig> = deepFreeze({
  role: "tactics", label: "Drill: stand and cover", stage: "experimental", fields: [], slots: [], defaults: { kind: "drill-cover" },
  keys: { kind: true }, fits: anyBody, faults: () => [],
  phases: { standing: "Standing", covering: "Covering" },
  make: (making) => coverDrill(making),
});
