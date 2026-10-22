import type { LocomotionPart } from "../mind/locomotion-part.ts";
import { takesCommands } from "../mind/parts.ts";
import { deepFreeze } from "../state.ts";
import { STRIDE, stride, validStride, type StrideSettings } from "./stride.ts";

/** **The walk and run** (`stride`): steps it plans itself, its settings these. */
interface StrideConfig extends StrideSettings {
  readonly kind: "stride";
}

/**
 * **The stride** (`stride`): it holds its own envelope (`strideEnvelope`) where the body has one,
 * and stops as the stance's walk does.
 */
export const STRIDE_PART: LocomotionPart<StrideConfig> = deepFreeze({
  role: "locomotion", label: "Stride", stage: "experimental", fields: [], slots: [], defaults: { kind: "stride", ...STRIDE },
  keys: {
    kind: true, swing: true, transfer: true, lift: true, settle: true, width: true, longest: true, accel: true,
    turn: true, paced: true, lands: true, push: true, launch: true, lead: true, momentum: true, lever: true,
    arms: true, ramp: true, drive: true, lengthen: true,
  },
  fits: takesCommands,
  faults: (config) => validStride(config) ? [] : ["a stride needs every setting finite and positive, its double support not negative"],
  make: (body, config) => { const { kind: _, ...settings } = config; return stride(body, settings); },
});
