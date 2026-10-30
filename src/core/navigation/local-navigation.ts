import type { Vec3 } from "../spec/quantity.ts";
import { deepFreeze } from "../state.ts";
import { clearStep } from "./clear-step.ts";
import { routeWalker } from "./navigation.ts";
import type { NavigatorPart } from "./navigator.ts";
import { anyBody } from "../parts/parts.ts";

/** **Local clearance**: the config of the walker that goes to a place only where the way there is clear. */
interface LocalNavigationConfig { readonly kind: "local-navigation" }

/** **Local clearance** (`routeWalker`): a place reached straight where the sweep there is clear of the solids sensed, and not otherwise. */
export const LOCAL_NAVIGATION: NavigatorPart<LocalNavigationConfig> = deepFreeze({
  role: "navigation", label: "Local clearance", stage: "experimental", fields: [], slots: [], defaults: { kind: "local-navigation" }, keys: { kind: true },
  fits: anyBody, faults: () => [],
  make: (spec) => routeWalker(spec, (here, aim, solids, radius, height) =>
    clearStep([here.x, height, here.z] as Vec3, [aim.x, height, aim.z] as Vec3, radius, solids) ? [{ ...aim }] : []),
});
