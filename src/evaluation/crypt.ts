/**
 * **A Crypt run as a case**: a laid-out level (`CryptLayout`), the party placed on it, every party
 * member under one mind or each under its model's own, and a script of the person's orders
 * (`CryptLeg`), each leg given once the last is done, or none. It is the game's run (`DungeonRun`,
 * `src/dungeon/run.ts`), on its own scene with no canvas, each side under the Commander the case
 * names, the party under the person's and the enemies under a mob unless it names another. A Crypt run is bit-equal between JavaScript
 * engines, as a bout is: what lays it out, places it and steps it computes as the core does, and
 * its look (decals, dressing, the fog's shader) decides nothing a body meets.
 */
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import type { CommanderConfig } from "../core/command/commander.ts";
import type { Command } from "../core/command/commands.ts";
import { loadEngine, type EngineName } from "../core/engine/engines.ts";
import type { MindConfig } from "../core/mind/config.ts";
import { modelInfo, type BodyModel } from "../core/models.ts";
import type { World } from "../core/world.ts";
import { distance, type Door, type DungeonMap, type DungeonObstacle, type Point } from "../dungeon/map.ts";
import { DungeonRun, prepareDungeonCharacters, RUN_COMMANDERS, runParticipants } from "../dungeon/run.ts";
import type { CaseWorld, WorldKind } from "./evaluation.ts";

/**
 * A level as plain data: its floor as rows (row `z`, a character a cell along `x`: `.` floor, any
 * other rock), its doors and obstacles, the party's start, the exit, where each enemy waits, and
 * each one's model (skeletons unless given).
 */
export interface CryptLayout {
  readonly floor: readonly string[];
  readonly doors: readonly Door[];
  readonly obstacles: readonly DungeonObstacle[];
  readonly start: Point;
  readonly exit: Point;
  readonly spawns: readonly Point[];
  readonly enemies?: readonly BodyModel[];
}

/** What a leg does as it begins: the person's command to party members, by id, or a member struck dead where it stands. */
export type CryptAct = { readonly kind: "command"; readonly members: readonly string[]; readonly command: Command }
  | { readonly kind: "slain"; readonly member: string };

/**
 * When a leg is done: every member named has carried out its order (its Commander says it holds or
 * stands, `MemberReport.task`); a member has gone `metres` from where the leg began; an enemy is
 * held, or not; `seconds` have passed; or `seconds` have passed and an enemy fights nobody
 * (`MemberReport.target`).
 */
export type CryptUntil = { readonly kind: "arrived"; readonly members: readonly string[] }
  | { readonly kind: "gone"; readonly member: string; readonly metres: number }
  | { readonly kind: "held"; readonly enemy: string; readonly held: boolean }
  | { readonly kind: "seconds"; readonly seconds: number }
  | { readonly kind: "unaware"; readonly enemy: string; readonly seconds: number };

/**
 * A leg of the script: what it does, when it is done, and the most it may take, s; a leg not done in
 * time ends the case. A leg that brings about what the case is of (`fixture`), not done in time, ends
 * it unreached: the case says so, and its legs are not the motion's to fail.
 */
export interface CryptLeg {
  readonly acts: readonly CryptAct[];
  readonly until: CryptUntil;
  readonly most: number;
  readonly fixture?: true;
}

/**
 * One run, as plain data: the level, the party (the hero first, at the start) and where each stands
 * (null, where the run places a companion, `companionSpawn`), the party's mind (each member its
 * model's own, where none is given), the script, and each side's Commander where not the run's own.
 */
export interface CryptCase {
  readonly layout: CryptLayout;
  readonly party: readonly { readonly model: BodyModel; readonly at: Point | null }[];
  readonly mind?: MindConfig;
  readonly script: readonly CryptLeg[];
  readonly commanders?: { readonly party?: CommanderConfig; readonly enemies?: CommanderConfig };
}

/**
 * What a run came to: the legs done of all, and when the last was done (null, not all); each fall
 * of a party member in the fight, by id and time, s; the steps on which any two party members'
 * bodies were pushed apart, both in the fight and one of them out of it; the time read to, s; and
 * whether its fixture's legs were all done (`CryptLeg.fixture`).
 */
export type CryptReading = {
  readonly reached: boolean;
  readonly legs: number;
  readonly of: number;
  readonly done: number | null;
  readonly falls: readonly { readonly member: string; readonly time: number }[];
  readonly contactSteps: number;
  readonly fallenContactSteps: number;
  readonly seconds: number;
};

/** The longest a run may last, s, whatever its legs allow. */
export const CRYPT_CAP = 200;

/** `layout` as the run's map: the floor rows read, one room the size of the map. */
export function cryptMap(layout: CryptLayout): DungeonMap {
  const size = layout.floor.length, floor = new Uint8Array(size * size);
  layout.floor.forEach((row, z) => { for (let x = 0; x < size; x++) floor[z * size + x] = row[x] === "." ? 1 : 0; });
  return { seed: 0, size, floor, rooms: [{ id: 0, centre: { ...layout.start }, min: { x: 0, z: 0 }, max: { x: size - 1, z: size - 1 } }], doors: layout.doors.map((door) => ({ ...door, point: { ...door.point } })),
    obstacles: layout.obstacles.map((o) => ({ ...o })), start: { ...layout.start }, exit: { ...layout.exit }, spawns: layout.spawns.map((p) => ({ ...p })),
    ...(layout.enemies ? { encounters: layout.enemies.map((model, i) => ({ room: 0, model, point: { ...layout.spawns[i]! } })) } : {}) };
}

/** `map`'s floor as `CryptLayout` rows. */
export function floorRows(map: Pick<DungeonMap, "size" | "floor">): string[] {
  return Array.from({ length: map.size }, (_, z) => Array.from({ length: map.size }, (_, x) => map.floor[z * map.size + x] === 1 ? "." : "#").join(""));
}

/** A run's world, played a step at a time: after each step `afterStep`, until `ended`; then its `reading`. */
export interface BuiltCrypt {
  readonly world: World;
  readonly run: DungeonRun;
  readonly ended: boolean;
  afterStep(): void;
  reading(): CryptReading;
  dispose(): void;
}

/** `crypt`'s run on `engine`: the party placed, every member under the case's mind and the enemies under their own, its script begun. */
export async function buildCrypt(crypt: CryptCase, engine: EngineName): Promise<BuiltCrypt> {
  const map = cryptMap(crypt.layout), [hero, ...companions] = crypt.party;
  if (!hero || !hero.at || distance(hero.at, map.start) > 1e-9) throw new Error("the hero stands at the start");
  const options = { seed: 0, layout: map, hero: hero.model, companions: companions.map((member) => member.model) };
  const prepared = prepareDungeonCharacters(map, options);
  companions.forEach((member, i) => { if (member.at) prepared.homes.set(`ally-${i}`, { ...member.at }); });
  const babylon = new NullEngine(), scene = new Scene(babylon);
  const run = new DungeonRun(scene, { ...options, prepared, engine: await loadEngine(engine), visuals: false,
    mind: (participant) => participant.side === "party" ? crypt.mind ?? null : null, party: crypt.commanders?.party, enemies: crypt.commanders?.enemies });
  const party = run.party, falls: { member: string; time: number }[] = [], down = new Map<string, boolean>(), slain = new Set<string>();
  let reached = true, leg = -1, began = 0, from: Point | null = null, pending: CryptAct[] = [], done: number | null = null, ended = false, contactSteps = 0, fallenContactSteps = 0;
  const member = (id: string) => {
    const found = party.find((one) => one.id === id);
    if (!found) throw new Error(`no party member ${id}`);
    return found;
  };
  const actor = (id: string) => run.actors.find((one) => one.id === id) ?? (() => { throw new Error(`no body ${id}`); })();
  /** Begin leg `k`: its acts given one a step, from the next. */
  const begin = (k: number): void => {
    leg = k; began = run.clock; pending = [...(crypt.script[k]?.acts ?? [])];
    const until = crypt.script[k]?.until;
    from = until?.kind === "gone" ? member(until.member).feet() : null;
  };
  /** Give the next act: the person's command to its members, selected first, or a member slain. */
  const act = (): void => {
    const next = pending.shift()!;
    switch (next.kind) {
      case "command":
        run.select(next.members);
        run.command(next.command);
        return;
      case "slain": {
        const body = member(next.member).fighter!;
        body.pool.wound({ part: body.built.spec.wounds.vital[0]!, damage: body.pool.total, clean: false });
        slain.add(next.member);
        return;
      }
      default: { const never: never = next; throw new Error(`no act ${JSON.stringify(never)}`); }
    }
  };
  const met = (until: CryptUntil): boolean => {
    switch (until.kind) {
      case "arrived": return until.members.every((id) => { const task = run.report(member(id)).task; return task === "holding" || task === "standing"; });
      case "gone": return distance(member(until.member).feet(), from!) >= until.metres;
      case "held": { const enemy = actor(until.enemy); return enemy.alive && enemy.held === until.held; }
      case "seconds": return run.clock - began >= until.seconds;
      case "unaware": return run.clock - began >= until.seconds && run.report(actor(until.enemy)).target === null;
      default: { const never: never = until; throw new Error(`no condition ${JSON.stringify(never)}`); }
    }
  };
  const bodyOf = new Map<unknown, string>();
  for (const one of party) for (const segment of one.fighter!.built.segments.values()) bodyOf.set(segment.body, one.id);
  begin(0);
  if (pending.length) act();
  return {
    world: run.world, run,
    get ended() { return ended; },
    afterStep() {
      for (const one of party) {
        const now = !!one.fighter?.body.down;
        if (now && !down.get(one.id) && one.alive && !slain.has(one.id)) falls.push({ member: one.id, time: run.clock });
        down.set(one.id, now);
      }
      let touched = false, touchedFallen = false;
      for (const one of party) {
        if (!one.fighter || !one.alive) continue;
        for (const segment of one.fighter.built.segments.values()) for (const touch of run.world.physics.contactsOf(segment.body)) {
          const other = touch.other === null ? undefined : bodyOf.get(touch.other);
          if (other === undefined || other === one.id || !(touch.impulse > 0)) continue;
          if (member(other).alive) touched = true; else touchedFallen = true;
        }
      }
      if (touched) contactSteps++;
      if (touchedFallen) fallenContactSteps++;
      if (ended) return;
      if (run.status !== "playing" || run.clock >= CRYPT_CAP) { ended = true; return; }
      if (pending.length) { act(); return; }
      // With no script, the run plays to its end.
      const current = crypt.script[leg];
      if (!current) return;
      if (met(current.until)) {
        if (leg + 1 >= crypt.script.length) { done = run.clock; ended = true; return; }
        begin(leg + 1);
        if (pending.length) act();
      } else if (run.clock - began > current.most) { ended = true; reached = !current.fixture; }
    },
    reading: () => ({ reached, legs: done !== null ? crypt.script.length : leg, of: crypt.script.length, done, falls: falls.map((fall) => ({ ...fall })),
      contactSteps, fallenContactSteps, seconds: run.clock }),
    dispose() { run.dispose(); scene.dispose(); babylon.dispose(); },
  };
}

/**
 * The Crypt world kind: built by `buildCrypt`, every fighting body traced, played by the world's
 * clock; its party under the case's mind or each member's model's, its enemies under their own,
 * and each side under the case's Commander or the run's own (`RUN_COMMANDERS`).
 */
export const CRYPT_WORLD: WorldKind<Extract<CaseWorld, { readonly kind: "crypt" }>, BuiltCrypt> = {
  build: (world) => buildCrypt(world.crypt, world.engine),
  traced: (built) => built.run.actors.flatMap((actor) => actor.fighter ? [actor.fighter.built] : []),
  clock: (built) => built.world.time,
  minds: ({ crypt }) => {
    const [hero, ...companions] = crypt.party;
    return runParticipants(cryptMap(crypt.layout), { hero: hero!.model, companions: companions.map((one) => one.model) })
      .map((one) => one.side === "party" ? crypt.mind ?? modelInfo(one.model).mind : modelInfo(one.model).mind);
  },
  parts: ({ crypt }) => [crypt.commanders?.party?.kind ?? RUN_COMMANDERS.party.kind, crypt.commanders?.enemies?.kind ?? RUN_COMMANDERS.enemies.kind],
  hosted: (built) => built.run.actors.flatMap((actor) => actor.fighter ? [actor.fighter.minded] : []),
};
