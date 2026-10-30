import { deepFreeze } from "../state.ts";
import { routeWalker } from "./navigation.ts";
import type { NavigatorPart } from "./navigator.ts";
import { anyBody } from "./parts.ts";

/** **Visibility routes**: the config of the walker that routes to a place by the shortest visibility route round what it senses. */
interface VisibilityNavigationConfig { readonly kind: "visibility-navigation" }

/** **Visibility routes** (`routeWalker`): a place reached by the shortest route round the solids sensed, corner to corner. */
export const VISIBILITY_NAVIGATION: NavigatorPart<VisibilityNavigationConfig> = deepFreeze({
  role: "navigation", label: "Visibility routes", stage: "game", fields: [], slots: [], defaults: { kind: "visibility-navigation" }, keys: { kind: true },
  fits: anyBody, faults: () => [],
  make: (spec) => routeWalker(spec, (_here, aim, _solids, _radius, _height, router) => router().route(aim)),
});
