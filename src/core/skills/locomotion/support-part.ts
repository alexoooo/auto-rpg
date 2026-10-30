import type { Body } from "../../body.ts";
import { fitsSoles } from "../../control/stance-balance.ts";
import type { KeysOf, Part, PartConfig } from "../../parts/parts.ts";
import { supportFold, type SupportSkill } from "./support-fold.ts";

/** **A kind of low support**: a part of role `support` that makes the skill a body fights from low support by. */
export interface SupportPart<C extends PartConfig = PartConfig> extends Part<C> {
  readonly role: "support";
  readonly keys: KeysOf<C>;
  make(body: Body, config: C): SupportSkill;
}

/** **Fighting from low support** (`supportFold`): lowering, folding and rising again. */
interface SupportFoldConfig { readonly kind: "support-fold" }

/** The opening tactics' research, offered beside the game's. */
export const SUPPORT_FOLD: SupportPart<SupportFoldConfig> = {
  role: "support", label: "Fight from low support", stage: "experimental", fields: [], slots: [], defaults: { kind: "support-fold" }, keys: { kind: true },
  fits: fitsSoles, faults: () => [], make: (body) => supportFold(body),
};
