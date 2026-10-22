import { deepFreeze } from "../../state.ts";
import { takesCommands } from "../parts.ts";
import type { SubMindPart } from "../sub-mind-part.ts";
import { supportRecovery } from "./support-recovery.ts";

/** Rise by stages, then stand quiet on loaded feet before giving the body back (`supportRecovery`). */
interface SupportRecoveryConfig { readonly kind: "support-recovery" }

/** **Rise, then steady** (`supportRecovery`): the human's recipe (`RISE`), for a body that takes the commands it gives. */
export const SUPPORT_RECOVERY_PART: SubMindPart<SupportRecoveryConfig> = deepFreeze({
  role: "sub-mind", label: "Rise, then steady", stage: "game", fields: [], slots: [], defaults: { kind: "support-recovery" }, keys: { kind: true },
  fits: takesCommands, faults: () => [],
  make: (own, view, _config, kit, clock) => supportRecovery(own, view, clock, kit),
});
