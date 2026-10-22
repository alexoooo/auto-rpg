import { deepFreeze } from "../../state.ts";
import { number } from "../fields.ts";
import { fitsSoles } from "../../control/stance-balance.ts";
import type { SubMindPart } from "../sub-mind-part.ts";
import { getAway, type GetAwayConfig } from "./get-away.ts";

/** **Get away** (`getAway`): rolling clear of a foe nearer than its distance. */
export const GET_AWAY_PART: SubMindPart<GetAwayConfig> = deepFreeze({
  role: "sub-mind", label: "Get away", stage: "experimental", slots: [],
  fields: [number("metres", "Foe distance", .1, 10, .1, "m")], defaults: { kind: "get-away", metres: 2 }, keys: { kind: true, metres: true },
  down: { name: "roll away", seconds: 2, stands: 0, shelter: .5 },
  fits: fitsSoles,
  faults: (config) => Number.isFinite(config.metres) && config.metres > 0 ? [] : ["distance must be finite and positive"],
  make: (own, view, config) => getAway(own, view, config),
});
