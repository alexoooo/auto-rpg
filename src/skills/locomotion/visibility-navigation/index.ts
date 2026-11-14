import { variationFault, variedMake, type Varied } from "../../framework/variations.ts";
import type { BodySpec } from "../../../core/bodies/spec/body.ts";
import { deepFreeze } from "../../../core/state.ts";
import { routeWalker } from "../shared/navigation/navigation.ts";
import type { NavigatorPart } from "../../framework/navigation.ts";
import { anyBody, fitsAll } from "../../../parts/parts.ts";

/** **Visibility routes**: the config of the walker that routes to a place by the shortest visibility route round what it senses. */
interface VisibilityNavigationConfig extends Varied { readonly kind: "visibility-navigation" }

/** Visibility routes' variations: visibility routes. */
const VARIATIONS = {
  "visibility-navigation": (spec: BodySpec, _config: VisibilityNavigationConfig) => routeWalker(spec, (_here, aim, _solids, _radius, _height, router) => router().route(aim)),
};

/** **Visibility routes** (`routeWalker`): a place reached by the shortest route round the solids sensed, corner to corner. */
export const VISIBILITY_NAVIGATION = deepFreeze<NavigatorPart<VisibilityNavigationConfig>>({
  role: "navigation", label: "Visibility routes", stage: "game", fields: [], slots: [], defaults: { kind: "visibility-navigation" }, keys: { kind: true, variation: true },
  fits: fitsAll(variationFault("visibility-navigation", "visibility routes", VARIATIONS), anyBody), faults: () => [],
  make: variedMake("visibility-navigation", VARIATIONS, (spec, config) => [spec, config]), variations: Object.keys(VARIATIONS),
});

declare module "../../framework/navigation.ts" {
  interface NavigationConfigs {
    readonly "visibility-navigation": VisibilityNavigationConfig;
  }
}
