/**
 * **The crowd task's cases**: a party of Warriors in the Crypt under the person's orders, every
 * member minded by the subject, walking where its own side's bodies are in the way, moving or
 * fallen. Each situation is played on several seeds, a seed naming where the bodies stand and
 * where they are sent:
 *
 * - `reversal`: the party of four on a generated level (`generateLevel`), walked away from a
 *   resting enemy until it is held, then back to the start until it is let go, and on to the start;
 *   not reached where the enemy sees one of the party as it begins;
 * - `lone`: one body sent across a room and turned back under way;
 * - `following`: a leader turned back under way into the companion following it;
 * - `crossing`: two pairs sent across a room to each other's places, their paths crossing at its middle;
 * - `passage`: the party of four sent through a gap in a wall that passes one at a time, and back;
 * - `fallen`: a companion struck dead in the way, and two others sent past where it lies, and back.
 *
 * It is read until the script is done, or a leg is not done in its time (`CryptLeg.most`): the legs
 * done, each fall, and the steps the members' bodies were pushed apart.
 */
import type { Command } from "../../core/command/commands.ts";
import { hypot } from "../../core/math/real.ts";
import { randomStream } from "../../core/math/random.ts";
import type { MindConfig } from "../../core/mind/config.ts";
import { presetFitsModel } from "../../core/mind/controller.ts";
import { modelHolding, modelInfo, type BodyModel } from "../../core/models.ts";
import { deepFreeze } from "../../core/state.ts";
import { generateLevel } from "../../dungeon/level.ts";
import { findPath, walkable, type DungeonMap, type DungeonObstacle, type Point } from "../../dungeon/map.ts";
import { LEVELS } from "../../dungeon/run.ts";
import { mindFaults } from "../../ui/mind-link.ts";
import { FIGHT_ENTRY, CONTROLLERS, defaultMind } from "../../entrants/game.ts";
import { CRYPT_CAP, floorRows, type BuiltCrypt, type CryptCase, type CryptLayout, type CryptLeg, type CryptReading } from "../crypt.ts";
import type { Cases, Json, Reader, Subject } from "../evaluation.ts";

/** The situations, in their order. */
const SITUATIONS = ["reversal", "lone", "following", "crossing", "passage", "fallen"] as const;
export type Situation = (typeof SITUATIONS)[number];

/**
 * The protocol: the members' body; the seeds each situation is played on (the reversal's the
 * fixture's, `tests/crypt-core-capability.test.mjs@2a1b29ac`); the room's floor, m; the gap a wall
 * leaves in the passage, m (twice the level's least clearance, `LEVEL.clearance`); how long the
 * party is watched once its last order is carried out, s; and the most a leg may take, s. A change
 * here is a new protocol.
 */
const CROWD = deepFreeze({
  model: "workshop-fighter" as BodyModel,
  seeds: { reversal: [1, 2, 4, 5], lone: [1, 2, 3, 4], following: [1, 2, 3, 4], crossing: [1, 2, 3, 4], passage: [1, 2, 3, 4], fallen: [1, 2, 3, 4] } as Record<Situation, number[]>,
  room: { width: 16, depth: 12 }, gap: 1.3, settle: 3, most: 60,
});

/** One case's conditions: the situation and its seed. */
export type CrowdCondition = { readonly situation: Situation; readonly seed: number };

const apart = (a: Point, b: Point): number => hypot(a.x - b.x, a.z - b.z);
const to = (destination: Point): Command => ({ kind: "go", destination: { x: destination.x, z: destination.z } });
const order = (members: readonly string[], destination: Point) => ({ kind: "command" as const, members, command: to(destination) });
const settle: CryptLeg = { acts: [], until: { kind: "seconds", seconds: CROWD.settle }, most: CROWD.settle + 1 };

/**
 * A room of floor `width` by `depth` m, walled about, its cells from (1, 1), on a square map with
 * rock beyond: the party starts at `start`. The exit lies beyond the floor, where nobody wins.
 */
function room(start: Point, obstacles: readonly DungeonObstacle[] = []): CryptLayout {
  const { width, depth } = CROWD.room, size = Math.max(width, depth) + 2;
  const floor = Array.from({ length: size }, (_, z) => Array.from({ length: size }, (_, x) => x >= 1 && x <= width && z >= 1 && z <= depth ? "." : "#").join(""));
  return { floor, doors: [], obstacles, start: { ...start }, exit: { x: size + 10, z: size + 10 }, spawns: [] };
}

/**
 * The generated level of `seed` with the fixture's edits: its first spawn kept alone, and the start
 * moved to floor 15.5 m from it, inside `WAKE_METRES` and beyond an enemy's sight, nearest by a path
 * to floor `far` that is farther than `LEVELS.rest` from it.
 */
function restFixture(seed: number): { map: DungeonMap; far: Point } {
  const map = generateLevel(seed).map, spawn = map.spawns[0]!, floor: Point[] = [];
  for (let x = 0; x < map.size; x++) for (let z = 0; z < map.size; z++) if (walkable(map, { x, z }, 0.7, true)) floor.push({ x, z });
  const starts = floor.filter((p) => Math.abs(apart(p, spawn) - 15.5) < 0.3), fars = floor.filter((p) => apart(spawn, p) > LEVELS.rest + 0.7);
  let best: { start: Point; far: Point; length: number } | null = null;
  for (const start of starts) for (const far of fars) {
    if (apart(start, far) > 6 || (best && apart(start, far) >= best.length)) continue;
    const route = findPath(map, start, far, 0.35);
    if (route.length && (!best || route.length < best.length)) best = { start, far, length: route.length };
  }
  if (!best) throw new Error(`no floor for the reversal on seed ${seed}`);
  map.spawns = [spawn]; map.start = best.start;
  return { map, far: best.far };
}

/** The floor nearest `from` by a path that is between `least` and `most` m from `at`, by a path that keeps `wide` m from `at`. */
function floorBetween(map: DungeonMap, at: Point, from: Point, least: number, most: number, wide: number): Point {
  wide = Math.min(wide, apart(from, at) - 0.01);
  const clear = (a: Point, b: Point) => { for (let i = 0; i <= 20; i++) if (apart({ x: a.x + (b.x - a.x) * i / 20, z: a.z + (b.z - a.z) * i / 20 }, at) < wide) return false; return true; };
  let best: { p: Point; length: number } | null = null;
  for (let x = 0; x < map.size; x++) for (let z = 0; z < map.size; z++) {
    const p = { x, z }, d = apart(p, at);
    if (d <= least || d >= most || !walkable(map, p, 0.7, true) || (best && apart(p, from) >= best.length)) continue;
    const route = findPath(map, from, p, 0.35);
    if (!route.length || !route.every((q, i) => clear(i ? route[i - 1]! : from, q))) continue;
    if (!best || route.length < best.length) best = { p, length: route.length };
  }
  if (!best) throw new Error("no floor away from the enemy");
  return best.p;
}

const PARTY = ["hero", "ally-0", "ally-1", "ally-2"] as const;

/** The case `situation` on `seed` plays, its party under `mind`. */
function crowdCase(situation: Situation, seed: number, mind: MindConfig): CryptCase {
  const draw = randomStream(seed), jitter = (most: number): number => (draw.next() * 2 - 1) * most, model = CROWD.model;
  const middle = 0.5 + CROWD.room.depth / 2, most = CROWD.most;
  const at = (x: number, z: number): Point => ({ x, z });
  switch (situation) {
    case "reversal": {
      const { map, far } = restFixture(seed);
      const away = floorBetween(map, map.spawns[0]!, far, LEVELS.rest + 3.5, LEVELS.rest + 5, 1.2);
      return { mind, party: PARTY.map((_, i) => ({ model, at: i ? null : { ...map.start } })),
        layout: { floor: floorRows(map), doors: map.doors.map((door) => ({ ...door, point: { ...door.point } })), obstacles: map.obstacles ?? [],
          start: map.start, exit: map.exit, spawns: map.spawns },
        script: [
          // The enemy at rest, beyond sight of the party: where a companion stands in its sight, the case is not reached.
          { acts: [], until: { kind: "unaware", enemy: "enemy-0", seconds: 1 }, most: 1.5, fixture: true },
          { acts: [order(PARTY, away)], until: { kind: "held", enemy: "enemy-0", held: true }, most },
          { acts: [order(PARTY, map.start)], until: { kind: "held", enemy: "enemy-0", held: false }, most },
          { acts: [], until: { kind: "arrived", members: PARTY }, most }, settle] };
    }
    case "lone": {
      const start = at(3, middle + jitter(1)), there = at(14, middle + jitter(1.5));
      return { mind, party: [{ model, at: start }], layout: room(start), script: [
        { acts: [order(["hero"], there)], until: { kind: "gone", member: "hero", metres: 4 + jitter(1) }, most },
        { acts: [order(["hero"], start)], until: { kind: "arrived", members: ["hero"] }, most }, settle] };
    }
    case "following": {
      const start = at(4.5, middle + jitter(0.5)), there = at(14, middle + jitter(1.5));
      return { mind, party: [{ model, at: start }, { model, at: at(2.5, start.z + jitter(0.5)) }], layout: room(start), script: [
        { acts: [order(["hero"], there)], until: { kind: "gone", member: "hero", metres: 5 + jitter(1) }, most },
        { acts: [order(["hero"], at(2.5, start.z + jitter(1)))], until: { kind: "arrived", members: ["hero"] }, most }, settle] };
    }
    case "crossing": {
      const west = at(2.5, middle + jitter(1)), east = at(14.5, middle + jitter(1)), south = at(8.5 + jitter(1), 2), north = at(8.5 + jitter(1), 11);
      return { mind, party: [west, east, south, north].map((place) => ({ model, at: place })), layout: room(west), script: [
        { acts: [order(["hero"], east), order(["ally-0"], west), order(["ally-1"], north), order(["ally-2"], south)], until: { kind: "arrived", members: PARTY }, most },
        settle] };
    }
    case "passage": {
      // A wall across the room at its middle, its gap `CROWD.gap` wide, the party on its west.
      const centre = middle + jitter(2), x = 0.5 + CROWD.room.width / 2, low = centre - CROWD.gap / 2, high = centre + CROWD.gap / 2;
      const top = 0.5 + CROWD.room.depth, wall = (id: string, from: number, until: number): DungeonObstacle =>
        ({ id, x, z: (from + until) / 2, width: 0.6, depth: until - from, height: 2.5, blocksSight: true });
      const start = at(4.5, middle + jitter(0.3));
      const party = [start, at(3, start.z - 1.4 + jitter(0.2)), at(3, start.z + 1.4 + jitter(0.2)), at(1.8, start.z + jitter(0.2))];
      return { mind, party: party.map((place) => ({ model, at: place })), layout: room(start, [wall("wall.south", 0.5, low), wall("wall.north", high, top)]), script: [
        { acts: [order(PARTY, at(13.5, middle + jitter(1)))], until: { kind: "arrived", members: PARTY }, most },
        { acts: [order(PARTY, at(3.5, middle + jitter(1)))], until: { kind: "arrived", members: PARTY }, most }, settle] };
    }
    case "fallen": {
      const start = at(3, middle + jitter(0.5)), lies = at(7.5, start.z + jitter(0.3)), there = at(13.5, start.z + jitter(0.5));
      return { mind, party: [{ model, at: start }, { model, at: lies }, { model, at: at(1.8, start.z + 1.3 + jitter(0.2)) }], layout: room(start), script: [
        { acts: [{ kind: "slain", member: "ally-0" }], until: { kind: "seconds", seconds: 3 }, most: 4 },
        { acts: [order(["hero", "ally-1"], there)], until: { kind: "arrived", members: ["hero", "ally-1"] }, most },
        { acts: [order(["hero", "ally-1"], start)], until: { kind: "arrived", members: ["hero", "ally-1"] }, most }, settle] };
    }
    default: { const never: never = situation; throw new Error(`no situation ${never}`); }
  }
}

/** Why `value` is no mind, or what keeps it from the member's body holding what its model holds (`mindFaults`). */
function faultsOf(value: Json, subject?: Subject): readonly string[] {
  const kind = typeof value === "object" && value !== null && !Array.isArray(value) ? (value as { kind?: unknown }).kind : undefined;
  if (typeof kind !== "string" || !Object.hasOwn(CONTROLLERS, kind)) return [`no mind: a config names its kind (${Object.keys(CONTROLLERS).join(", ")})`];
  if (!presetFitsModel(subject ?? {}, CROWD.model))
    return [`named calibration allows ${subject?.models?.join(", ") || "no bodies"}; ${CROWD.model} is unavailable`];
  const held = modelInfo(CROWD.model).held;
  return mindFaults(value as unknown as MindConfig, modelHolding(CROWD.model, { left: "empty", right: held }), { entry: FIGHT_ENTRY }).map((fault) => `${CROWD.model} holding ${held}: ${fault}`);
}

/** A run's reader: the run's own ending, and its reading. */
const readCrypt = (built: BuiltCrypt): Reader<CryptReading> =>
  ({ afterStep: () => built.afterStep(), get ended() { return built.ended; }, reading: () => built.reading() });

function crowdCases(protocol: typeof CROWD): Cases<CrowdCondition, CryptReading, BuiltCrypt> {
  return {
    arity: 1,
    play: protocol as unknown as Json,
    conditions: SITUATIONS.flatMap((situation) => protocol.seeds[situation].map((seed) => ({ situation, seed }))),
    seconds: CRYPT_CAP,
    faults: (value, _condition, subject) => faultsOf(value, subject),
    world: ([mind], { situation, seed }, engine) => ({ kind: "crypt", engine, crypt: crowdCase(situation, seed, mind as unknown as MindConfig) }),
    read: (built) => readCrypt(built),
  };
}

/** Every protocol the crowd task may be played on, by name. */
export const CROWD_CASES: Readonly<Record<string, Cases<CrowdCondition, CryptReading, BuiltCrypt>>> = Object.freeze({ standard: crowdCases(CROWD) });

/** The members' mind unless another is named: their model's own. */
export const CROWD_MIND = defaultMind(CROWD.model);
