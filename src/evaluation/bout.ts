import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { Duel, SIDES, type DuelRecipe } from "../arena/duel.ts";
import { modelInfo } from "../core/models.ts";
import type { CaseWorld, WorldKind } from "./evaluation.ts";
import { GAME_ENDS } from "../arena/end-rule.ts";
import { addArenaSolids, arenaSolids } from "../arena/room.ts";
import type { PhysicsEngine } from "../core/engine/engine.ts";
import { DEFAULT_ENGINE, loadEngine, type EngineName } from "../core/engine/engines.ts";
import { createWorld, type World } from "../core/world.ts";

/** How a bout's world is built beside its recipe. */
interface BoutOptions {
  /** The engine by name, loaded here; the arena's unless given. */
  readonly engine?: EngineName;
  /** An engine already made, in place of the named one: an experiment's. */
  readonly physicsEngine?: PhysicsEngine;
  readonly hz?: number;
  readonly actuation?: World["actuation"];
  readonly hooks?: ConstructorParameters<typeof Duel>[2];
}

/** A bout's world, its duel, and each solid's fixed collider by name. */
export interface BuiltBout {
  readonly world: World;
  readonly duel: Duel;
  readonly colliders: ReadonlyMap<string, number>;
  dispose(): void;
}

/** A world with the arena's solids and `recipe`'s bout in it, on a scene of its own with no canvas. */
export async function buildBout(recipe: DuelRecipe, { engine: name = DEFAULT_ENGINE, physicsEngine, hz = 120, actuation, hooks = {} }: BoutOptions = {}): Promise<BuiltBout> {
  const engine = new NullEngine(), scene = new Scene(engine);
  const world = createWorld(scene, physicsEngine ?? await loadEngine(name), { hz, actuation });
  const solids = arenaSolids(recipe.level);
  const fixed = addArenaSolids(world.physics, solids), colliders = new Map(solids.map((solid, k) => [solid.name, fixed[k].id]));
  try {
    const duel = new Duel(world, recipe, { solids, ...hooks });
    return { world, duel, colliders, dispose() { duel.dispose(); world.dispose(); scene.dispose(); engine.dispose(); } };
  } catch (error) { world.dispose(); scene.dispose(); engine.dispose(); throw error; }
}

/** The bout world kind: built by `buildBout`, handed its tape, both sides traced, played by the bout's clock, each side under its recipe's mind or else its model's (`modelInfo`), ended by its recipe's end rules or the game's (`GAME_ENDS`). */
export const BOUT_WORLD: WorldKind<Extract<CaseWorld, { readonly kind: "bout" }>, BuiltBout> = {
  build: (world) => buildBout(world.recipe, { engine: world.engine }),
  start: (built, world) => built.duel.play(world.tape),
  traced: (built) => SIDES.map((side) => built.duel.duelists[side].built),
  clock: (built) => built.duel.clock,
  minds: (world) => SIDES.map((side) => world.recipe.minds?.[side] ?? modelInfo(world.recipe[side]).mind),
  parts: (world) => (world.recipe.ends ?? GAME_ENDS).map((end) => end.kind),
};
