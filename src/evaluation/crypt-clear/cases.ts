/**
 * **The Crypt-clearing task's cases**: a party under the subject's Commander, its hero and
 * companions each under its model's own mind, through each of a fixed set of generated levels
 * against each enemy Commander, in repeated trials (`trialLayout`), until a standing member reaches
 * the exit, the whole party has fallen, or the protocol's seconds. Each is a Crypt run with no
 * script (`CryptCase`), bit-equal between JavaScript engines (`crypt.ts`).
 */
import type { CommanderConfig } from "../../core/command/kind.ts";
import { commanderFaults, commanderOf } from "../../core/command/commander.ts";
import type { BodyModel } from "../../core/models.ts";
import { deepFreeze } from "../../core/state.ts";
import { generateEncounterLevel } from "../../dungeon/encounters.ts";
import { walkable } from "../../dungeon/map.ts";
import { CRYPT_CAP, floorRows, type BuiltCrypt, type CryptLayout } from "../crypt.ts";
import type { Cases, Json } from "../evaluation.ts";

/**
 * The protocol: the levels' seeds, the trials of each, the enemies' Commanders, the party's hero
 * and companions, and how long a run lasts at most, s. The seeds are the two of 1 to 30 whose
 * levels have the shortest way from the start to the exit (about 40 m), so that a run can end
 * within the cap. A change here is a new protocol.
 */
const CRYPT_CLEAR = deepFreeze({
  seeds: [10, 25],
  trials: 2,
  enemies: [{ kind: "mob" }, { kind: "independent" }] as CommanderConfig[],
  hero: "workshop-fighter" as BodyModel,
  companions: ["workshop-rogue", "workshop-fighter"] as BodyModel[],
  seconds: 180,
});

/** How far each trial moves the party's start from the last, m: enough that no two trials play alike. */
const NUDGE = 0.1;
/** The ways a trial moves the start, in turn: +x, +z, -x, -z. */
const NUDGES: readonly (readonly [number, number])[] = Object.freeze([[1, 0], [0, 1], [-1, 0], [0, -1]]);
/** The footprint the start must hold once moved, m: a humanoid's (`cryptModel`) and a margin. */
const START_CLEARANCE = 0.5;

/**
 * The generated level of `seed` (`generateEncounterLevel`) as a layout for trial `trial`: its start
 * as generated for trial 0, and otherwise moved `NUDGE` m a trial along one of `NUDGES`, a ring
 * further every four. Throws where the start moved is not open floor.
 */
function trialLayout(seed: number, trial: number): CryptLayout {
  const map = generateEncounterLevel(seed).map;
  const [x, z] = trial === 0 ? [0, 0] : NUDGES[(trial - 1) % NUDGES.length]!, ring = NUDGE * (1 + Math.floor(Math.max(0, trial - 1) / NUDGES.length));
  const start = { x: map.start.x + x * ring, z: map.start.z + z * ring };
  if (!walkable(map, start, START_CLEARANCE, true)) throw new Error(`level ${seed}, trial ${trial}: the start moved is not open floor`);
  return { floor: floorRows(map), doors: map.doors.map((door) => ({ ...door, point: { ...door.point } })), obstacles: (map.obstacles ?? []).map((o) => ({ ...o })),
    start, exit: { ...map.exit }, spawns: map.spawns.map((p) => ({ ...p })), enemies: (map.encounters ?? []).map((encounter) => encounter.model) };
}

/** One run's conditions: the level's seed, the trial and the enemies' Commander. */
export type CryptCondition = { readonly seed: number; readonly trial: number; readonly enemies: CommanderConfig & Json };

/**
 * What a run came to: how it ended (`won` at the exit, `dead`, or still `playing` at the cap), the
 * time read to, s, the party's members and how many of them were out of the fight, and the
 * level's enemies and how many of them were.
 */
export type ClearReading = {
  readonly status: "won" | "dead" | "playing";
  readonly seconds: number;
  readonly members: number;
  readonly lost: number;
  readonly enemies: number;
  readonly defeated: number;
};

/** Why `value` is no Commander's config (`commanderFaults`), or one that leads no party. */
function faultsOf(value: Json): readonly string[] {
  const faults = commanderFaults(value);
  if (faults.length > 0) return faults;
  return commanderOf((value as unknown as CommanderConfig).kind)!.sides.includes("party") ? [] : [`the ${(value as unknown as CommanderConfig).kind} Commander leads no party`];
}

function clearCases(protocol: typeof CRYPT_CLEAR): Cases<CryptCondition, ClearReading, BuiltCrypt> {
  const conditions: CryptCondition[] = [];
  for (const enemies of protocol.enemies) for (const seed of protocol.seeds) for (let trial = 0; trial < protocol.trials; trial++)
    conditions.push({ seed, trial, enemies: enemies as CommanderConfig & Json });
  const seconds = Math.min(protocol.seconds, CRYPT_CAP);
  return {
    arity: 1,
    play: protocol as unknown as Json,
    conditions,
    seconds,
    faults: (value) => faultsOf(value),
    world: ([party], { seed, trial, enemies }, engine) => {
      const layout = trialLayout(seed, trial);
      return { kind: "crypt", engine, crypt: { layout, party: [{ model: protocol.hero, at: { ...layout.start } }, ...protocol.companions.map((model) => ({ model, at: null }))],
        script: [], commanders: { party: party as unknown as CommanderConfig, enemies } } };
    },
    read(built) {
      const { world, run } = built;
      return {
        afterStep: () => built.afterStep(),
        get ended() { return built.ended || world.time >= seconds; },
        reading: () => ({ status: run.status, seconds: world.time, members: run.party.length, lost: run.party.filter((member) => !member.alive).length,
          enemies: run.enemies.length, defeated: run.enemies.filter((enemy) => !enemy.alive).length }),
      };
    },
  };
}

/** Every protocol the Crypt-clearing task may be played on, by name. */
export const CRYPT_CLEAR_CASES: Readonly<Record<string, Cases<CryptCondition, ClearReading, BuiltCrypt>>> = Object.freeze({ standard: clearCases(CRYPT_CLEAR) });
