import { Duel, SIDES, type DuelRecipe } from "../game/arena/duel.ts";
import { TeamBout, type TeamRecipe } from "../game/arena/team-bout.ts";
import { validBoutTiming, type CaseWorld, type WorldKind } from "./evaluation.ts";
import { GAME_ENDS } from "../game/arena/end-rule.ts";
import { addArenaSolids, arenaSolids } from "../game/arena/solids.ts";
import type { PhysicsEngine } from "../core/physics/engine.ts";
import { DEFAULT_ENGINE, loadEngine, type EngineName } from "../core/physics/engines.ts";
import { createWorld, type World } from "../core/world/world.ts";
import type { MindPlace } from "../minds/seat/apart.ts";
import { type GameContext } from "../game/arena/context.ts";
import type { Catalog } from "../minds/catalog/catalog.ts";
import { bonkFixture, validBonkFixture, type BonkFixture, type BonkFixtureConfig } from "./strike/bonk-fixture.ts";
import { loadState, saveState } from "../core/state.ts";
import { recordingKey } from "../core/world/recording.ts";

/** How a bout's world is built beside its recipe. */
interface BoutOptions {
  /** The engine by name, loaded here; the arena's unless given. */
  readonly engine?: EngineName;
  /** An engine already made, in place of the named one: an experiment's. */
  readonly physicsEngine?: PhysicsEngine;
  readonly hz?: number;
  readonly actuation?: World["actuation"];
  /** The command's delay, steps (`World.delay`): the game's unless a study asks for another. */
  readonly delay?: number;
  /** Where its minds run (`World.minds`); in the world's thread unless given. */
  readonly minds?: MindPlace;
  readonly hooks?: ConstructorParameters<typeof Duel>[3];
  readonly fixture?: BonkFixtureConfig;
}

/** A bout's world, its duel, and each solid's fixed collider by name. */
export interface BuiltBout {
  readonly catalog: Catalog;
  readonly world: World;
  readonly duel: Duel;
  readonly colliders: ReadonlyMap<string, number>;
  readonly fixture?: BonkFixture;
  dispose(): void;
}

export function createBout(context: GameContext) {
  const { defaultMind } = context;

  /** A world with the arena's solids and `recipe`'s bout in it. */
  async function buildBout(recipe: DuelRecipe, { engine: name = DEFAULT_ENGINE, physicsEngine, hz = 120, actuation, delay, minds, hooks = {}, fixture: fixtureConfig }: BoutOptions = {}): Promise<BuiltBout> {
    const world = createWorld(physicsEngine ?? await loadEngine(name), { hz, actuation, ...(delay === undefined ? {} : { delay }), ...(minds ? { minds } : {}) });
    try {
      const solids = arenaSolids(recipe.level);
      const fixed = addArenaSolids(world.physics, solids), colliders = new Map(solids.map((solid, k) => [solid.name, fixed[k].id]));
      let fixture: BonkFixture | undefined;
      const placement = fixtureConfig ? world.sense(() => fixture?.beforeSense()) : null;
      const duel = new Duel(world, recipe, context, { solids, ...hooks });
      try { if (fixtureConfig) { fixture = bonkFixture({ world, duel }, fixtureConfig); fixture.prepareBoundary(); } }
      catch (error) { duel.dispose(); throw error; }
      return { catalog: context.catalog, world, duel, colliders, ...fixture ? { fixture } : {}, dispose() { placement?.dispose(); fixture?.dispose(); duel.dispose(); world.dispose(); } };
    } catch (error) { world.dispose(); throw error; }
  }

  /** The bout world kind: built by `buildBout`, handed its tape, both sides traced, played by the bout's clock, each side under its recipe's mind or else its model's (`defaultMind`), ended by its recipe's end rules or the game's (`GAME_ENDS`), a side led by its recipe's Commander where it names one. */
  const BOUT_WORLD: WorldKind<Extract<CaseWorld, { readonly kind: "bout" }>, BuiltBout> = {
    build: (world, options) => {
      if (world.timing !== undefined && !validBoutTiming(world.timing)) return Promise.resolve({ refused: "invalid recorded bout timing" });
      if (world.fixture !== undefined && (!validBonkFixture(world.fixture) || world.recipe.senseDelay !== 0 || world.recipe.commanders?.left || world.recipe.commanders?.right))
        return Promise.resolve({ refused: "a bonk fixture needs valid placement, immediate observations and external orders" });
      if (world.timing && options?.hz !== undefined && options.hz !== world.timing.hz) return Promise.resolve({ refused: "a recorded bout's rate cannot be overridden" });
      return buildBout(world.recipe, { engine: world.engine, ...world.timing ?? (options?.hz === undefined ? {} : { hz: options.hz }), ...world.fixture ? { fixture: world.fixture } : {} });
    },
    start: (built, world) => built.duel.play(world.tape),
    traced: (built) => SIDES.map((side) => built.duel.duelists[side].built),
    clock: (built) => built.duel.clock,
    minds: (world) => SIDES.map((side) => world.recipe.minds?.[side] ?? defaultMind(world.recipe[side])),
    parts: (world) => [...(world.recipe.ends ?? GAME_ENDS).map((end) => end.kind), ...SIDES.flatMap((side) => world.recipe.commanders?.[side]?.kind ?? [])],
    hosted: (built) => SIDES.map((side) => built.duel.duelists[side].minded),
    save: (built) => ({ ...built.duel.save(), ...built.fixture ? { fixture: { config: built.fixture.reading().requested, state: saveState(built.fixture.state) } } : {} }),
    load: (built, saved) => {
      const snapshot = saved as ReturnType<Duel["save"]> & { readonly fixture?: { readonly config: BonkFixtureConfig; readonly state: unknown } };
      if (Boolean(built.fixture) !== (snapshot.fixture !== undefined)
        || built.fixture && recordingKey(built.fixture.reading().requested) !== recordingKey(snapshot.fixture!.config)) throw new Error("the saved bout has another fixture");
      built.duel.load(snapshot);
      if (built.fixture) loadState(built.fixture.state, snapshot.fixture!.state);
    },
  };

  /** A world with the arena's solids and `recipe`'s team bout in it. */
  async function buildTeamBout(recipe: TeamRecipe, { engine: name = DEFAULT_ENGINE, physicsEngine, hz = 120, minds }: Omit<BoutOptions, "hooks" | "actuation"> = {}): Promise<{ readonly world: World; readonly bout: TeamBout; dispose(): void }> {
    const world = createWorld(physicsEngine ?? await loadEngine(name), { hz, ...(minds ? { minds } : {}) });
    try {
      const solids = arenaSolids(recipe.level);
      addArenaSolids(world.physics, solids);
      const bout = new TeamBout(world, recipe, context, { solids });
      return { world, bout, dispose() { bout.dispose(); world.dispose(); } };
    } catch (error) { world.dispose(); throw error; }
  }

  return { buildBout, BOUT_WORLD, buildTeamBout };
}

/** The registered world factory for this builder. */
export const boutWorld = (context: GameContext) => createBout(context).BOUT_WORLD;
