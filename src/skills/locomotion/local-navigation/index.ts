import { variationFault, variedMake, type Varied } from "../../framework/variations.ts";
import type { BodySpec } from "../../../core/bodies/spec/body.ts";
import type { Vec3 } from "../../../core/quantity.ts";
import { deepFreeze } from "../../../core/state.ts";
import { clearStep } from "../shared/navigation/clear-step.ts";
import { routeWalker } from "../shared/navigation/navigation.ts";
import type { NavigatorPart } from "../../framework/navigation.ts";
import { anyBody, fitsAll } from "../../../parts/parts.ts";

/** **Local clearance**: the config of the walker that goes to a place only where the way there is clear. */
interface LocalNavigationConfig extends Varied { readonly kind: "local-navigation" }

/** Local clearance's variations: local clearance. */
const VARIATIONS = {
  "local-navigation": (spec: BodySpec, _config: LocalNavigationConfig) => routeWalker(spec, (here, aim, solids, radius, height) =>
    clearStep([here.x, height, here.z] as Vec3, [aim.x, height, aim.z] as Vec3, radius, solids) ? [{ ...aim }] : []),
};

/** **Local clearance** (`routeWalker`): a place reached straight where the sweep there is clear of the solids sensed, and not otherwise. */
export const LOCAL_NAVIGATION = deepFreeze<NavigatorPart<LocalNavigationConfig>>({
  role: "navigation", label: "Local clearance", stage: "experimental", fields: [], slots: [], defaults: { kind: "local-navigation" }, keys: { kind: true, variation: true },
  fits: fitsAll(variationFault("local-navigation", "local clearance", VARIATIONS), anyBody), faults: () => [],
  make: variedMake("local-navigation", VARIATIONS, (spec, config) => [spec, config]), variations: Object.keys(VARIATIONS),
});

declare module "../../framework/navigation.ts" {
  interface NavigationConfigs {
    readonly "local-navigation": LocalNavigationConfig;
  }
}
