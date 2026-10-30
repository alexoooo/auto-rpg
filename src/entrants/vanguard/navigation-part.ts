import { number } from "../../core/parts/fields.ts";
import type { NavigationSight, NavigatorPart } from "../../core/mind/navigator.ts";
import type { SolidSense } from "../../core/mind/object-senses.ts";
import { anyBody } from "../../core/parts/parts.ts";
import { VISIBILITY_NAVIGATION } from "../../core/mind/visibility-navigation.ts";
import { deepFreeze } from "../../core/state.ts";

interface RoomConfig { readonly kind: "vanguard:navigation"; readonly room: number }

/** Extra horizontal room for a routed approach; the physical clearance exit keeps its actual geometry. */
export const VANGUARD_NAVIGATION: NavigatorPart<RoomConfig> = deepFreeze({
  role: "navigation", label: "Room for an exchange", stage: "experimental", slots: [],
  fields: [number<RoomConfig, "room">("room", "Room beside obstacles", 0, 1, .05, "m")],
  // The approach leaves room for a punch's trunk motion beside a solid.
  defaults: { kind: "vanguard:navigation", room: .1 }, keys: { kind: true, room: true }, fits: anyBody,
  faults: config => Number.isFinite(config.room) && config.room >= 0 ? [] : ["room must be finite and nonnegative"],
  make(spec, config) {
    const base = VISIBILITY_NAVIGATION.make(spec, VISIBILITY_NAVIGATION.defaults);
    if (config.room === 0) return base;
    const state = { base: base.state, source: null as readonly SolidSense[] | null, padded: [] as readonly SolidSense[] };
    const roomy = (view: NavigationSight["view"]): NavigationSight["view"] => {
      const solids = view.senses.solids ?? null;
      if (state.source !== solids) {
        state.source = solids;
        state.padded = deepFreeze((solids ?? []).map((solid): SolidSense => {
          switch (solid.kind) {
            case "box": return { ...solid, size: [solid.size[0] + 2 * config.room, solid.size[1], solid.size[2] + 2 * config.room] };
            case "hull": return { ...solid, points: solid.points.flatMap(point => [-1, 1].flatMap(x => [-1, 1].map(z =>
              [point[0] + x * config.room, point[1], point[2] + z * config.room] as const))) };
            default: { const never: never = solid; throw new Error(`unknown sensed solid ${never}`); }
          }
        }));
      }
      return { ...view, senses: { ...view.senses, solids: state.padded } };
    };
    return { ...base, state,
      step: (sight, request, gait, ceiling, dt, available) => base.step({ ...sight, view: roomy(sight.view) }, request, gait, ceiling, dt, available),
      steer: (view, heading, move) => base.steer(roomy(view), heading, move),
    };
  },
});
