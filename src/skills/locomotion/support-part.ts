import { SUPPORT_REFERENCE } from "../../control/support-reference.ts";
import { fitsSoles } from "../../control/stance/stance-balance.ts";
import { supportFold } from "./support-fold.ts";
import type { LowSupportPart } from "../framework/low-support.ts";



/** **Fighting from low support** (`supportFold`): lowering, folding and rising again. */
interface SupportFoldConfig { readonly kind: "support-fold" }

/** Fighting from low support, offered as an experimental part (`stage`). */
export const SUPPORT_FOLD: LowSupportPart<SupportFoldConfig> = {
  role: "support", requires: [SUPPORT_REFERENCE], label: "Fight from low support", stage: "experimental", fields: [], slots: [], defaults: { kind: "support-fold" }, keys: { kind: true },
  fits: fitsSoles, faults: () => [], make: (body) => supportFold(body),
};


declare module "../config.ts" {
  interface SupportConfigs {
    readonly "support-fold": SupportFoldConfig;
  }
}
