import type { PhysicsEngine } from "./engine.ts";

/**
 * **The engines the core can run on**, by name, each loaded on demand so a page or a test pays only
 * for the one it runs. The game runs `DEFAULT_ENGINE`; the Node stand (`tests/harness/core-stand.mjs`)
 * runs the one `CORE_ENGINE` names. An engine joins by a module meeting `engine.ts`'s contract and
 * a line here, after it has passed the physics bench (`src/physics-bench/`).
 */
const ENGINES = {
  rapier: () => import("./rapier.ts").then((m) => m.loadRapier()),
  // Angular limit rows along the gradient of the angle the limit reads, `2 atan2(q_i, w)`, where
  // Rapier's parent-axis rows let motion about the other axes carry it through the limit unseen
  // (vendor/rapier/README.md, angular-limit gradients).
  "rapier-coordinate": () => import("./rapier.ts").then((m) => m.loadRapier({ coordinateAngularLimits: true })),
  // Per-point Coulomb friction in place of Rapier's patch friction, which applies one tangential
  // and one twist constraint to each group of at most four contacts (the vendored binding's
  // `pointContactFriction` selector).
  "rapier-coulomb": () => import("./rapier.ts").then((m) => m.loadRapier({ pointContactFriction: true })),
  "rapier-coordinate-coulomb": () => import("./rapier.ts").then((m) => m.loadRapier({ coordinateAngularLimits: true, pointContactFriction: true })),
} as const satisfies Readonly<Record<string, () => Promise<PhysicsEngine>>>;

export type EngineName = keyof typeof ENGINES;

/** Gameplay runs with angular limits along the measured angle's gradient. */
export const DEFAULT_ENGINE: EngineName = "rapier-coordinate";

export const isEngineName = (name: string): name is EngineName => Object.hasOwn(ENGINES, name);

/** Load engine `name`. */
export function loadEngine(name: EngineName = DEFAULT_ENGINE): Promise<PhysicsEngine> {
  return ENGINES[name]();
}
