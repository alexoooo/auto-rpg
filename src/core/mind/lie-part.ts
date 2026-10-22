import { deepFreeze } from "../state.ts";
import { lying } from "./lie.ts";
import { anyBody } from "./parts.ts";
import type { SubMindPart } from "./sub-mind-part.ts";

/** Lie still while down: ask the muscles for nothing (`lying`). */
interface LieConfig { readonly kind: "lie" }

/** **Lie still** (`lying`): it fits any body. */
export const LIE_PART: SubMindPart<LieConfig> = deepFreeze({
  role: "sub-mind", label: "Lie still", stage: "game", fields: [], slots: [], defaults: { kind: "lie" }, keys: { kind: true },
  down: { name: "lie still", seconds: 2, stands: 0, shelter: 0 },
  fits: anyBody, faults: () => [],
  make: (own, view) => lying(own, view),
});
