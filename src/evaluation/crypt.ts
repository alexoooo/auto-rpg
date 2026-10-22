/**
 * **A Crypt run as a case**: a generated level (`generateEncounterLevel`) with no visuals, its
 * party and its enemies each under the Commander the case names, in a world of its own
 * (`DungeonRun`). It is deterministic in Node, but not bit-equal between JavaScript engines: the
 * level's generation uses arithmetic each engine rounds its own way.
 */
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import type { BuiltBody } from "../core/build/build-body.ts";
import type { CommanderConfig } from "../core/command/commanders.ts";
import { loadEngine, type EngineName } from "../core/engine/engines.ts";
import type { BodyModel } from "../core/models.ts";
import type { World } from "../core/world.ts";
import { generateEncounterLevel } from "../dungeon/encounters.ts";
import { walkable, type DungeonMap } from "../dungeon/map.ts";
import { DungeonRun, runModels } from "../dungeon/run.ts";

/**
 * One Crypt run, as plain data: the level's seed, the trial (`trialMap`), the party's hero and
 * companions, and each side's Commander in full.
 */
export interface CryptCase {
  readonly seed: number;
  readonly trial: number;
  readonly hero: BodyModel;
  readonly companions: readonly BodyModel[];
  readonly party: CommanderConfig;
  readonly enemies: CommanderConfig;
}

/** How far each trial moves the party's start from the last, m: enough that no two trials play alike. */
const NUDGE = 0.1;
/** The ways a trial moves the start, in turn: +x, +z, -x, -z. */
const NUDGES: readonly (readonly [number, number])[] = Object.freeze([[1, 0], [0, 1], [-1, 0], [0, -1]]);
/** The footprint the start must hold once moved, m: a humanoid's (`cryptModel`) and a margin. */
const START_CLEARANCE = 0.5;

/**
 * The level of `seed` for trial `trial`: as generated for trial 0, and otherwise its start moved
 * `NUDGE` m a trial along one of `NUDGES`, a ring further every four. Throws where the start
 * moved is not open floor.
 */
export function trialMap(seed: number, trial: number): DungeonMap {
  const map = generateEncounterLevel(seed).map;
  if (trial === 0) return map;
  const [x, z] = NUDGES[(trial - 1) % NUDGES.length]!, ring = NUDGE * (1 + Math.floor((trial - 1) / NUDGES.length));
  const start = { x: map.start.x + x * ring, z: map.start.z + z * ring };
  if (!walkable(map, start, START_CLEARANCE, true)) throw new Error(`level ${seed}, trial ${trial}: the start moved is not open floor`);
  map.start = start;
  return map;
}

/** Every model `crypt`'s run fields, each once: the party's, then its level's enemies'. Each plays its own mind. */
export const cryptModels = (crypt: CryptCase): BodyModel[] => runModels(generateEncounterLevel(crypt.seed).map, crypt);

/** A Crypt run's world, played a step at a time. */
export interface BuiltCrypt {
  readonly world: World;
  readonly run: DungeonRun;
  /** Every body built so far, in the run's order: what a trace reads. */
  readonly bodies: Iterable<BuiltBody>;
  dispose(): void;
}

/** `crypt`'s run on `engine`, on a scene of its own with no canvas and nothing drawn. */
export async function buildCrypt(crypt: CryptCase, engine: EngineName): Promise<BuiltCrypt> {
  const babylon = new NullEngine(), scene = new Scene(babylon);
  try {
    const run = new DungeonRun(scene, { seed: crypt.seed, layout: trialMap(crypt.seed, crypt.trial), engine: await loadEngine(engine), visuals: false,
      hero: crypt.hero, companions: crypt.companions, party: crypt.party, enemies: crypt.enemies });
    return {
      world: run.world, run,
      bodies: { *[Symbol.iterator]() { for (const actor of run.actors) if (actor.fighter) yield actor.fighter.built; } },
      dispose() { run.dispose(); scene.dispose(); babylon.dispose(); },
    };
  } catch (error) { scene.dispose(); babylon.dispose(); throw error; }
}
