import type { PhysicsEngine } from "./engine.ts";

/**
 * **The engines the core can run on**, by name, each loaded on demand so a page or a test pays only
 * for the one it runs. The game runs `DEFAULT_ENGINE`; the Node stand (`tests/harness/core-stand.mjs`)
 * runs the one `CORE_ENGINE` names. An engine joins by a module meeting `engine.ts`'s contract and
 * a line here, after it has passed the physics bench (`src/physics-bench/`).
 */
const ENGINES = {
  rapier: () => import("./rapier.ts").then((m) => m.loadRapier()),
  // Measured-angle limit rows; controller migration is recorded in docs/reference/joint-limits.md.
  "rapier-coordinate": () => import("./rapier.ts").then((m) => m.loadRapier(true)),
  // Per-point friction profiles are measured in docs/reference/contact-friction.md.
  "rapier-coulomb": () => import("./rapier.ts").then((m) => m.loadRapier(false, true)),
  "rapier-coordinate-coulomb": () => import("./rapier.ts").then((m) => m.loadRapier(true, true)),
} as const satisfies Readonly<Record<string, () => Promise<PhysicsEngine>>>;

type EngineName = keyof typeof ENGINES;

/** The engine the game runs: Rapier, the owner's choice after the bake-off (`owner-physics-engine`). */
export const DEFAULT_ENGINE: EngineName = "rapier";

export const isEngineName = (name: string): name is EngineName => Object.hasOwn(ENGINES, name);

/** Load engine `name`. */
export function loadEngine(name: EngineName = DEFAULT_ENGINE): Promise<PhysicsEngine> {
  return ENGINES[name]();
}
