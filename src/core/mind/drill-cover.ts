import { deepFreeze } from "../state.ts";
import { NO_COVER } from "./intent.ts";
import { cover } from "./options/cover.ts";
import { situationReader } from "./options/situation.ts";
import { walker } from "./options/walk.ts";
import { anyBody } from "./parts.ts";
import type { Tactics } from "./tactics.ts";
import type { TacticsMaking, TacticsPart } from "./tactics-part.ts";

/** **The Cover drill's tactics**: stand and cover, and nothing else. */
interface CoverDrillConfig { readonly kind: "drill-cover" }

/**
 * Stands where it is, facing its focus or the way it faces with none (`Walker.facing`), asks no
 * action, and covers with a free hand as the options fighter does (`cover`), on the situation the
 * options read (`situationReader`, with no strikes of its own): what the Cover drill reads of a
 * body's covers. Its memory is the situation's and the cover's.
 */
function coverDrill(making: TacticsMaking): Tactics {
  const walk = walker(making.spec), hands = cover(making.spec);
  let reader: ReturnType<typeof situationReader> | null = null;
  const state = { cover: hands.state, situation: null as object | null, covering: false };
  return {
    name: "drill-cover", state,
    engagement: { get phase() { return state.covering ? "covering" : "standing"; } },
    decide(sight, dt) {
      // The situation is read at the world's rate, which the first decision's step gives.
      reader ??= situationReader({ spec: making.spec, hz: Math.round(1 / dt), rules: making.rules, strikes: [], measured: [], ordersOf: () => null, downs: [] });
      state.situation = reader.state;
      const now = reader.read(sight), covered = hands.step(now, []);
      state.covering = covered !== null;
      return { move: null, face: walk.facing(now), guard: covered ? { ...NO_COVER, ...covered } : NO_COVER, actions: [] };
    },
  };
}

export const COVER_DRILL_TACTICS: TacticsPart<CoverDrillConfig> = deepFreeze({
  role: "tactics", label: "Drill: stand and cover", stage: "experimental", fields: [], slots: [], defaults: { kind: "drill-cover" },
  keys: { kind: true }, fits: anyBody, faults: () => [],
  phases: { standing: "Standing", covering: "Covering" },
  make: (making) => coverDrill(making),
});
