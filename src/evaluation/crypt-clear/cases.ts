/**
 * **The Crypt-clearing task's cases**: the hero alone, under the protocol's mind and the subject's
 * Commander, through each of a fixed set of generated levels against each enemy Commander, in
 * repeated trials (`trialLayout`). A case is read by its score (`scoreOf`): the hero's life at the
 * end less a price on the time taken and the time the route left would take. It stops at the exit,
 * at the hero's death, or once its life less the time's price is spent (`spent`). Each is a Crypt
 * run with no script (`CryptCase`), bit-equal between JavaScript engines (`crypt.ts`); the run plays
 * as the game's, and only this reading knows the price.
 */
import type { CommanderConfig } from "../../core/command/kind.ts";
import { commanderFaults, commanderOf } from "../../core/command/commander.ts";
import { paceToward } from "../../core/control/stance-envelope.ts";
import type { BodyModel } from "../../core/models.ts";
import { deepFreeze } from "../../core/state.ts";
import { generateEncounterLevel } from "../../dungeon/encounters.ts";
import { distance, findPath, walkable, type DungeonMap, type Point } from "../../dungeon/map.ts";
import { MINDS } from "../../entrants/game.ts";
import { CRYPT_CAP, floorRows, type BuiltCrypt, type CryptLayout } from "../crypt.ts";
import type { Cases, Json } from "../evaluation.ts";

/**
 * The protocol: the levels' seeds, the trials of each, the enemies' Commanders, the hero's model and
 * the mind it plays (a preset of `MINDS`), alone, and the share of its full life a walk of the
 * level's route from the start to the exit with no foes costs (`priceOf`). The seeds are the two of
 * 1 to 30 whose levels have the shortest way from the start to the exit (about 40 m). A run lasts
 * until its score's rule stops it, within the Crypt's cap (`CRYPT_CAP`). A change here is a new
 * protocol.
 */
const ALONE = deepFreeze({
  seeds: [10, 25],
  trials: 2,
  enemies: [{ kind: "mob" }, { kind: "independent" }] as CommanderConfig[],
  hero: "workshop-fighter" as BodyModel,
  mind: "option",
  walk: 0.5,
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
 * What a run came to: how it ended (`won` at the exit, `dead`, `spent` by the score's rule, or still
 * `playing` at the Crypt's cap); the time read to, s; the hero's life at the end (its pool's bar, 0
 * dead); the route from the start to the exit and from where the hero ends to the exit (0 at the
 * exit), m (`routeLength`); the hero's pace, m/s; the score (`scoreOf`); and the level's enemies
 * and how many of them were out of the fight.
 */
export type ClearReading = {
  readonly status: "won" | "dead" | "spent" | "playing";
  readonly seconds: number;
  readonly life: number;
  readonly route: number;
  readonly left: number;
  readonly pace: number;
  readonly score: number;
  readonly enemies: number;
  readonly defeated: number;
};

/** The length of the route a body of `radius` walks from `from` to `to` (`findPath`, doors opened on the way), m; null where there is none. */
function routeLength(map: DungeonMap, from: Point, to: Point, radius: number): number | null {
  const path = findPath(map, from, to, radius);
  if (path.length === 0) return null;
  let metres = 0, at = from;
  for (const point of path) { metres += distance(at, point); at = point; }
  return metres;
}

/** The price of time, the share of full life a second: `walk` of it for the route from the start to the exit at `pace`. */
const priceOf = (walk: number, route: number, pace: number): number => walk * pace / route;

/**
 * **A run's score**, in shares of full life: `life - price * (elapsed + left / pace)`, the life at
 * the end less the price of the time taken and of the time the route left would take at the pace.
 */
export const scoreOf = (life: number, price: number, elapsed: number, left: number, pace: number): number => life - price * (elapsed + left / pace);

/** Why `value` is no Commander's config (`commanderFaults`), or one that leads no party. */
function faultsOf(value: Json): readonly string[] {
  const faults = commanderFaults(value);
  if (faults.length > 0) return faults;
  return commanderOf((value as unknown as CommanderConfig).kind)!.sides.includes("party") ? [] : [`the ${(value as unknown as CommanderConfig).kind} Commander leads no party`];
}

function clearCases(protocol: typeof ALONE): Cases<CryptCondition, ClearReading, BuiltCrypt> {
  const conditions: CryptCondition[] = [];
  for (const enemies of protocol.enemies) for (const seed of protocol.seeds) for (let trial = 0; trial < protocol.trials; trial++)
    conditions.push({ seed, trial, enemies: enemies as CommanderConfig & Json });
  const mind = MINDS[protocol.mind];
  if (!mind) throw new Error(`the Crypt-clearing protocol's mind ${protocol.mind} is no preset`);
  return {
    arity: 1,
    play: protocol as unknown as Json,
    conditions,
    seconds: CRYPT_CAP,
    faults: (value) => faultsOf(value),
    world: ([party], { seed, trial, enemies }, engine) => {
      const layout = trialLayout(seed, trial);
      return { kind: "crypt", engine, crypt: { layout, party: [{ model: protocol.hero, at: { ...layout.start } }], mind: mind.config,
        script: [], commanders: { party: party as unknown as CommanderConfig, enemies } } };
    },
    read(built, { seed, trial }) {
      const { world, run } = built, hero = run.hero, map = run.map;
      const envelope = hero.fighter?.minded.report?.gait?.envelope;
      if (!envelope) throw new Error(`level ${seed}, trial ${trial}: the hero's mind states no gait to pace the route by`);
      const pace = paceToward(envelope, 1, 0), route = routeLength(map, map.start, map.exit, hero.radius);
      if (route === null) throw new Error(`level ${seed}, trial ${trial}: no route from the start to the exit`);
      const price = priceOf(protocol.walk, route, pace);
      let spent = false;
      const life = () => run.status === "dead" ? 0 : hero.vitality;
      return {
        afterStep() {
          built.afterStep();
          if (!built.ended && life() - price * world.time <= 0) spent = true;
        },
        get ended() { return built.ended || spent; },
        reading: () => {
          const status = run.status !== "playing" ? run.status : spent ? "spent" : "playing", end = life();
          // A body lying where no route starts is read straight to the exit, the least its route can be.
          const left = status === "won" ? 0 : routeLength(map, hero.feet(), map.exit, hero.radius) ?? distance(hero.feet(), map.exit);
          return { status, seconds: world.time, life: end, route, left, pace, score: scoreOf(end, price, world.time, left, pace),
            enemies: run.enemies.length, defeated: run.enemies.filter((enemy) => !enemy.alive).length };
        },
      };
    },
  };
}

/** Every protocol the Crypt-clearing task may be played on, by name. */
export const CRYPT_CLEAR_CASES: Readonly<Record<string, Cases<CryptCondition, ClearReading, BuiltCrypt>>> = Object.freeze({ alone: clearCases(ALONE) });
