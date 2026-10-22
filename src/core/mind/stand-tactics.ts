import { deepFreeze } from "../state.ts";
import { standIntent } from "./intent.ts";
import { takesCommands } from "./parts.ts";
import type { TacticsPart } from "./tactics-part.ts";

/** **Stand in guard**: tactics that face where the body faces and do nothing else. */
interface StandTacticsConfig { readonly kind: "stand" }

export const STAND_TACTICS: TacticsPart<StandTacticsConfig> = deepFreeze({
  role: "tactics", label: "Stand in guard", stage: "game", fields: [], slots: [], defaults: { kind: "stand" },
  keys: { kind: true }, fits: takesCommands, faults: () => [],
  make: () => ({ name: "guard", decide: ({ report }) => standIntent(report.heading) }),
});
