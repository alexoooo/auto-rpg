import type { Scene } from "@babylonjs/core/scene.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import type { PhysicsEngine } from "../core/engine/engine.ts";
import { enlist, type Combatant } from "../core/combatant.ts";
import { armedWith } from "../core/items/held.ts";
import { modelInfo, resolveCharacter, type BodyModel, type ResolvedCharacter } from "../core/models.ts";
import type { AttributeOverrides } from "../core/character-attributes.ts";
import { configuredSpawn } from "./attribute-placement.ts";
import type { MindConfig } from "../core/mind/config.ts";
import { MODEL_DISPLAY } from "../render/models.ts";
import { createSenses, type SensesHub } from "../core/mind/senses.ts";
import { watchBlows, type BlowWatch, type LandedBlow } from "../core/rules/blows.ts";
import { levelsOf, stirs, type LevelAsk, type LevelRule } from "../core/rules/levels.ts";
import { rulebook } from "../core/rules/rulebook.ts";
import { cryptModel } from "./actors.ts";
import { createWorld, type Hook, type World } from "../core/world.ts";
import { isBody } from "../core/read-body.ts";
import { canSee, cellKey, clearSegment, distance, explorationGoal, findPath, reveal, sightIndex, walkable,
  type DungeonMap, type Point, type SightIndex } from "./map.ts";
import { DungeonCommands, screenMovement } from "./commands.ts";
import { buildDungeonWorld } from "./world.ts";
import type { DungeonSurfaces } from "./stone.ts";
import { CAMERA_AZIMUTH, CAMERA_PITCH, cameraToward } from "./camera.ts";
import { companionSpawn } from "./party-placement.ts";
import { generateEncounterLevel } from "./encounters.ts";
import type { NavigationReport } from "../core/mind/navigation.ts";
import type { Skills } from "../core/skills/skills.ts";
import type { Orders } from "../core/mind/orders.ts";
import { STAND_ORDERS } from "../core/mind/orders.ts";
import { createCommander } from "../core/command/commanders.ts";
import { SIGHT_METRES } from "../core/command/independent.ts";
import type { Commander, MemberReport, MemberView, SensedBody, TeamLevel, TeamView } from "../core/command/team.ts";
import type { Command } from "../core/command/commands.ts";
import { doorApproach } from "./door-approach.ts";

/**
 * **A crypt run**: the level's colliders are fixed boxes in a world
 * (`buildDungeonWorld`), and the party and the enemies are bodies (`src/core/`), each under a mind
 * that carries out its team's orders. Each side is a team under a Commander (`src/core/command/`):
 * the party under the person's (`partyCommander`), whose commands reach it only as `Command`s
 * and the live input of the keys and pointer (`DungeonCommands`); the enemies each at the nearest
 * member it sees (`independentCommander`). The run is their host: it answers for the map
 * (`TeamLevel`), asks the party's Commander and then the enemies' once a step, before every mind,
 * has the enemies look when the party looks, and gives each mind the orders its Commander gave.
 * The run keeps the map, who is built, each body's level, the doors that open, and its status.
 *
 * - **The hero** is the Warrior unless the page picks another, **the companions** whom the page names,
 *   **the enemies** the map's encounters; point-only maps supply skeletons. Model defaults
 *   provide each body's mind and equipment.
 * - **The tactics** carry out the orders. Humanoids attack the target's head;
 *   a reptile receives the nearest sensed collider surface within its mouth's reach.
 * - **Wounds** are the core's blows (`watchBlows`) under the dungeon's rulebook. A fighter is out
 *   of the fight once its pool has ended, or a fall ends that model's fight (`modelInfo`'s
 *   `fallEndsFight`); none does today, so a fallen body stays in the fight while it gets up. An eliminated body goes limp:
 *   nothing drives its muscles again, and a step costs it only what the solver takes.
 * - **An enemy is built** once a standing party member comes within `WAKE_METRES` of where it waits,
 *   beyond its sight: a standing body costs a step 0.53 ms of its 8.33
 *   (`docs/reference/play.md#bodies-in-the-step`).
 * - **Each body's level** is the core's rule's (`levelsOf`, `LEVELS`): an enemy waiting at its
 *   home with the party far off and nobody walking near is held, fixed where it stands with
 *   nothing driving it, until the party or a walker comes near again; and the dead, once they
 *   have lain long enough for their fall to end, are held where they lie while nobody walks near.
 *
 * The run is lost when the whole party has fallen and won when a standing member reaches the exit.
 */

/** The map a run of `options` plays: its layout, or the encounter level its seed generates. */
export const runMap = (options: Pick<DungeonRunOptions, "seed" | "layout">): DungeonMap => options.layout ?? generateEncounterLevel(options.seed).map;
const heroOf = (options: Pick<DungeonRunOptions, "hero">): BodyModel => options.hero ?? "workshop-fighter";
const enemyAt = (map: DungeonMap, options: Pick<DungeonRunOptions, "enemy">, i: number): BodyModel =>
  options.enemy?.(i) ?? map.encounters?.[i]?.model ?? "crypt-skeleton";
/** Every body a run of `options` on `map` fields, as its mind is chosen (`DungeonRunOptions.mind`): the hero, the companions, then the enemies. */
export function runParticipants(map: DungeonMap, options: Pick<DungeonRunOptions, "hero" | "companions" | "enemy">): Participant[] {
  return [{ id: "hero", side: "party", model: heroOf(options) },
    ...(options.companions ?? []).map((model, i): Participant => ({ id: `ally-${i}`, side: "party", model })),
    ...map.spawns.map((_, i): Participant => ({ id: `enemy-${i}`, side: "enemy", model: enemyAt(map, options, i) }))];
}
/** Every model a run of `options` on `map` fields, each once: the party's, then the enemies'. */
export function runModels(map: DungeonMap, options: Pick<DungeonRunOptions, "hero" | "companions" | "enemy">): BodyModel[] {
  return [...new Set(runParticipants(map, options).map((participant) => participant.model))];
}

/** Who stands for each model in the party list and the target panel. */
const NAMES = (model: BodyModel) => MODEL_DISPLAY[model].label.toLowerCase();

/** Who a body of the run is, by which its mind is chosen (`DungeonRunOptions.mind`): its id, its side and its model. */
export type Participant = Pick<DungeonActor, "id" | "side" | "model">;

export interface DungeonActor {
  readonly character: ResolvedCharacter;
  readonly attackMetres: number;
  readonly id: string;
  readonly name: string;
  readonly model: BodyModel;
  readonly side: "party" | "enemy";
  /** The body, its mind (`minded`) and its pool, once built; an enemy waits unbuilt until the party is near (`WAKE_METRES`). */
  fighter: Combatant | null;
  /**
   * Where the body stands on the ground: its centre of mass over the floor; where its root lies,
   * limp; or where it waits unbuilt. A living body that is held reads where it stood, which is
   * where it stands.
   */
  feet(): Point;
  /** Whether it still fights under the crypt's wound and fall rules. */
  readonly alive: boolean;
  /** Whether its body lies limp: out of the fight, with nothing driving its muscles (`DungeonRun.levels`). */
  readonly limp: boolean;
  /** Whether its body is held: fixed where it is, with nothing driving it (`LEVELS`). */
  readonly held: boolean;
  /** The run's clock when it was first found out of the fight, s; null while it is in it. */
  outAt: number | null;
  /** Its pool's bar: 1 whole, 0 spent. */
  readonly vitality: number;
  /** What the page drew for it (its skin), shown while it is in sight, and picked to select or lock it. */
  readonly meshes: AbstractMesh[];
  /** The body it fights, as its team's Commander says (`MemberReport.target`); null when none. */
  readonly target: DungeonActor | null;
  /** Where it was placed: where an enemy waits, and a party member's start. */
  readonly home: Point;
  /** Its footprint's radius on the map, m (`cryptModel`). */
  readonly radius: number;
  /** Navigation feedback and geometric route from its selected Mind, where it exposes the role. */
  readonly navigation: NavigationReport | null;
  /** The skills its Mind runs, where it runs the game's: the way its legs face and the limits they state. */
  readonly skills: Skills | null;
}

/** How near a standing party member comes before an enemy is built: beyond its sight, so it is standing when it can
 * first see (`docs/reference/play.md#sight`). */
export const WAKE_METRES = SIGHT_METRES + 2;
/**
 * The levels' rule (`levelsOf`; `docs/reference/play.md#levels`): an enemy is let go with a party
 * member within `wake`, before it could see one, or a body going somewhere within `company`,
 * before that body could reach it; waiting, it is held with the party beyond `rest` and nobody
 * going anywhere within `clear`. A body out of the fight is held by the last two once it has
 * lain `settle` seconds.
 */
export const LEVELS: LevelRule = Object.freeze({ wake: WAKE_METRES, rest: SIGHT_METRES + 4, company: 4, clear: 5, settle: 10 });
/** How near its home an enemy with nothing to do counts as waiting there, m (`docs/reference/play.md#levels`). */
const HOME_METRES = 0.5;
/** Who sees whom is read every `perceive`, s, and at once after a party member's plan is reset (`docs/reference/play.md#run-timing`). */
const RUN_TIMING = Object.freeze({ perceive: 0.2 });
/** How near the exit a standing party member wins the run, m (`docs/reference/play.md#arrival`). */
const EXIT_METRES = 1.1;
/** A run goes on until its party has fallen or one of it stands at the exit. */
export type RunStatus = "playing" | "won" | "dead";

interface DungeonRunOptions {
  readonly prepared?: ReturnType<typeof prepareDungeonCharacters>;
  /** Resolved before placement, including for enemies that wake later. */
  readonly attributes?: (participant: Participant) => AttributeOverrides | null;
  /** The level's seed (`generateLevel`), unless `layout` is given. */
  readonly seed: number;
  readonly engine: PhysicsEngine;
  /** The level's look (`buildDungeonWorld`); false draws nothing. */
  readonly visuals?: boolean | DungeonSurfaces;
  readonly layout?: DungeonMap;
  readonly hero?: BodyModel;
  readonly companions?: readonly BodyModel[];
  /** Each spawn's model; the skeleton unless given. */
  readonly enemy?: (i: number) => BodyModel;
  /** Each participant's mind, the party's and the enemies' alike; its model's own (`modelInfo`) where this gives none. */
  readonly mind?: (participant: Participant) => MindConfig | null;
  /** Hears each blow as it lands. */
  readonly onBlow?: (blow: LandedBlow) => void;
  /** The actor and its world, before its first step: presentation can subscribe even during run construction. */
  readonly onBuilt?: (actor: DungeonActor, world: World) => void;
  /** The levels' rule; `LEVELS` unless given. */
  readonly levels?: LevelRule;
}

/** Resolve every actor and its placement before allocating a world or replacing a running scene. */
export function prepareDungeonCharacters(map: DungeonMap, options: Pick<DungeonRunOptions, "hero" | "companions" | "enemy" | "attributes">) {
  const characters = new Map<string, ResolvedCharacter>();
  const prepare = (id: string, model: BodyModel, side: DungeonActor["side"]) => {
    const character = resolveCharacter({ model, attributes: options.attributes?.({ id, model, side }) ?? {} });
    characters.set(id, character); return cryptModel(model, character.spec);
  };
  const heroModel = heroOf(options), hero = prepare("hero", heroModel, "party");
  const geometryChanged = (id: string) => {
    const a = characters.get(id)!.config.attributes; return a.size !== 1 || a.weight !== 1;
  };
  if (geometryChanged("hero") && (!walkable(map, map.start, hero.radius, true) || !findPath(map, map.start, map.exit, hero.radius).length))
    throw new Error("Configured hero does not fit the dungeon's start or route to the exit.");
  const homes = new Map<string, Point>(), occupied = [{ ...map.start, radius: hero.radius }];
  const encounters = map.spawns.map((_, i) => prepare(`enemy-${i}`, enemyAt(map, options, i), "enemy"));
  map.spawns.forEach((at, i) => {
    const id = `enemy-${i}`, info = encounters[i]!;
    const remaining = map.spawns.slice(i + 1).map((point, k) => ({ ...point, radius: encounters[i + 1 + k]!.radius }));
    const home = geometryChanged(id) ? configuredSpawn(map, at, info.radius, [...occupied, ...remaining]) : at;
    homes.set(id, home); occupied.push({ ...home, radius: info.radius });
  });
  const partyTaken = [{ ...map.start, radius: hero.radius }];
  (options.companions ?? []).forEach((model, i) => {
    const id = `ally-${i}`, info = prepare(id, model, "party"), at = companionSpawn(map, partyTaken, info.radius);
    if (!at) throw new Error(`No floor beside the start for companion ${i + 1}`);
    partyTaken.push({ ...at, radius: info.radius }); homes.set(id, at);
  });
  return { characters, homes };
}

export class DungeonRun {
  readonly map: DungeonMap;
  /** The left button's commands, each heard by the party's Commander as it is given. */
  readonly commands = new DungeonCommands((command) => this.command(command));
  /** The world every body and collider is in. */
  readonly world: World;
  /** The level built: its floor, walls and doors, drawn, and their colliders in `world`. */
  readonly level: ReturnType<typeof buildDungeonWorld>;
  readonly actors: DungeonActor[] = [];
  readonly hero: DungeonActor;
  /** The bodies one person orders: the hero first, then the companions. */
  readonly party: DungeonActor[] = [];
  readonly enemies: DungeonActor[] = [];
  /** Every blow and clash so far. */
  readonly blows: LandedBlow[] = [];
  readonly explored = new Set<number>();
  visible = new Set<number>();
  status: RunStatus = "playing";
  /** The camera's elevation, which decides where on a wall in front of the hero the cut-away falls. The page sets it. */
  pitch = CAMERA_PITCH;
  /** The unit step on the ground toward the camera, which decides what the keys walk along and which walls the
   * cut-away opens. The page sets it from its azimuth. */
  toward: Point = cameraToward(CAMERA_AZIMUTH);
  private nextPerception = 0;
  /** The map's sight index, and how many of its doors were open when it was made: `sight` makes it again when another has opened. */
  private seeing: { index: SightIndex; opened: number } | null = null;
  private watch: BlowWatch | null = null;
  private readonly planning: Hook;
  private readonly rules = rulebook("dungeon");
  private readonly options: DungeonRunOptions;
  private readonly senses: SensesHub;
  /** The party's Commander and the enemies', and the orders each last gave by member id: a body given none stands. */
  private readonly team: Commander;
  private readonly foes: Commander;
  private readonly given = new Map<string, Orders>();

  constructor(scene: Scene, options: DungeonRunOptions) {
    this.options = options;
    this.map = runMap(options);
    const { characters, homes } = options.prepared ?? prepareDungeonCharacters(this.map, options);
    this.world = createWorld(scene, options.engine);
    this.senses = createSenses(this.world);
    this.level = buildDungeonWorld(scene, this.map, options.visuals ?? true, this.world.physics);
    this.team = createCommander({ level: this.ground((places) => { this.visible = this.sight(places); }) }, { kind: "party" });
    this.foes = createCommander({ level: this.ground(() => {}) }, { kind: "independent" });
    // Before any body's own hooks, so each body's mind reads this step's orders.
    this.planning = this.world.beforeStep(() => this.plan());
    const run = this;
    const create = (id: string, model: BodyModel, at: Point, side: DungeonActor["side"]): DungeonActor => {
      const character = characters.get(id)!, info = cryptModel(model, character.spec);
      const actor: DungeonActor = {
        id, name: NAMES(model), model, character, attackMetres: info.attackMetres, side, fighter: null, meshes: [], outAt: null,
        feet() {
          if (!this.fighter) return { x: this.home.x, z: this.home.z };
          // A limp body's view is of the step its control left at; its root is where it lies now.
          const c = this.limp ? this.fighter.body.muscles.dynamics.root.segment.node.position : this.fighter.body.physical.centre;
          return { x: c.x, z: c.z };
        },
        get alive() { return this.fighter === null || this.fighter.pool.ending() === null &&
          (!cryptModel(this.model).fallEndsFight || !this.fighter.body.down); },
        get limp() { return !this.alive && this.fighter!.body.level !== "full"; },
        get held() { return this.fighter?.body.level === "held"; },
        get vitality() { return this.fighter?.pool.bar() ?? 1; },
        get target() { const id = run.report(this).target; return id === null ? null : run.actors.find((other) => other.id === id) ?? null; },
        home: { ...at }, radius: info.radius,
        get navigation() { return this.skills?.report.navigation ?? null; },
        get skills() { return (this.fighter?.minded as { readonly skills?: Skills } | undefined)?.skills ?? null; },
      };
      this.actors.push(actor); return actor;
    };
    this.hero = create("hero", heroOf(options), this.map.start, "party");
    this.party.push(this.hero);
    this.map.spawns.forEach((_, i) => this.enemies.push(create(`enemy-${i}`, enemyAt(this.map, options, i), homes.get(`enemy-${i}`)!, "enemy")));
    (options.companions ?? []).forEach((model, i) => {
      this.party.push(create(`ally-${i}`, model, homes.get(`ally-${i}`)!, "party"));
    });
    for (const member of this.party) this.build(member);
    this.wake();
    this.visible = this.sight(this.party.map(member => member.home));
  }

  /** Seconds since the run began: the world's clock. */
  get clock(): number { return this.world.time; }

  /**
   * Build `actor`'s body where it waits, holding what its model holds, under its mind (the one the run
   * was given for it, `DungeonRunOptions.mind`, else its model's) with
   * the assist its character's balance gives it, and watch its blows with everybody's. The mind
   * carries out the orders its team's Commander gives it (`delivered`), its target as the foe
   * (`docs/reference/crypt-foe.md`). Facing remains independent of movement. It is asked only
   * while its body is at `full` (`levels`).
   */
  private build(actor: DungeonActor): void {
    const info = modelInfo(actor.model);
    actor.fighter = enlist(this.world, {
      id: actor.id, side: actor.side, spec: armedWith(actor.character.spec, "right", info.held), at: [actor.home.x, 0, actor.home.z],
      rules: this.rules, senses: this.senses, out: () => actor.fighter?.pool.ending() !== null && actor.fighter !== null,
      solids: () => this.level.sensedSolids,
      mind: this.options.mind?.(actor) ?? info.mind, name: `crypt ${actor.side}`,
      contactIdentity: other => {
        if (!other) return { kind: "world" };
        for (const candidate of [...this.party, ...this.enemies]) for (const segment of candidate.fighter?.built.segments.values() ?? []) {
          if (isBody(other, segment.body)) return { kind: "body", body: candidate.id, segment: segment.spec.name,
            guard: candidate.fighter!.built.spec.marks.guards.includes(segment.spec.name) };
        }
        return null;
      },
      orders: () => this.delivered(actor),
    });
    this.watch?.dispose();
    // The party first: a touch is read from the fighter given first (`watchBlows`), and the party's bodies are the fewer.
    const fighters = [...this.party, ...this.enemies].flatMap((a) => a.fighter ? [a.fighter] : []);
    this.watch = watchBlows(this.world, fighters, this.rules, (blow) => { this.blows.push(blow); this.options.onBlow?.(blow); });
    this.options.onBuilt?.(actor, this.world);
  }

  /**
   * What the run says of each built body, for its level: the actors, and their asks in the same
   * order. A body is out from the step it is found out of the fight, before `levels` marks it.
   */
  private asks(): { actors: DungeonActor[]; asks: LevelAsk[] } {
    const actors = this.actors.filter(actor => actor.fighter);
    return {
      actors,
      asks: actors.map(actor => ({
        level: actor.fighter!.body.level, side: actor.side, at: actor.feet(),
        out: actor.alive ? null : this.clock - (actor.outAt ?? this.clock), waiting: this.waiting(actor),
      })),
    };
  }

  /** Whether `actor` waits: an enemy in the fight with no target, not alerted, standing at its home. */
  private waiting(actor: DungeonActor): boolean {
    return actor.side === "enemy" && actor.alive && this.foes.idle(actor.id, this.clock) &&
      distance(actor.feet(), actor.home) < HOME_METRES;
  }

  /** Build each enemy that a party member, or a body going somewhere, has come near enough to stir (`stirs`). */
  private wake(): void {
    const { asks } = this.asks(), rule = this.options.levels ?? LEVELS;
    for (const enemy of this.enemies) if (!enemy.fighter && stirs(enemy.home, enemy.side, asks, rule)) this.build(enemy);
  }

  /**
   * Put each body at its level (`levelsOf`). One found out of the fight, for good, is out from now:
   * its assist is withdrawn, and the rule lets it go limp, so it lies as the blow or the fall left
   * it, wherever its mind had it.
   */
  private levels(): void {
    for (const actor of this.actors) if (actor.fighter && actor.outAt === null && !actor.alive) {
      actor.outAt = this.clock;
      actor.fighter.body.assist.withdraw();
    }
    const { actors, asks } = this.asks();
    levelsOf(asks, this.options.levels ?? LEVELS).forEach((level, i) => actors[i]!.fighter!.body.setLevel(level));
  }

  /** What the party sees from where its members stand: every member's cells, one set, a cell one member sees not looked at for the next. */
  private sight(from: readonly Point[]): Set<number> {
    const index = this.sightIndex(), visible = new Set<number>();
    for (const at of from) reveal(this.map, at, this.explored, 12, index, visible);
    return visible;
  }

  /** The party member the camera follows and the page reports: the hero while it stands, then the first companion that does. */
  get leader(): DungeonActor { return this.party.find(member => member.alive) ?? this.hero; }

  /** Which party members the person's commands go to, by id, as the party's Commander says. */
  get selected(): ReadonlySet<string> { return new Set(this.party.filter((member) => this.team.report(member.id).selected).map((member) => member.id)); }

  /** Sends the person's next commands to these party members, or to everybody when `ids` is null. Unknown ids are dropped. */
  select(ids: readonly string[] | null): void {
    this.command({ kind: "select", members: ids ?? this.party.map((member) => member.id) });
  }

  /** The person's command, heard by the party's Commander at once and carried out on the members selected. */
  command(command: Command): void { this.team.hear(command, this.partyView(false)); }

  /** What `actor`'s team's Commander says of it: whom it fights, what it is doing (`MemberReport`). */
  report(actor: DungeonActor): MemberReport { return (actor.side === "party" ? this.team : this.foes).report(actor.id); }

  /** What the party's Commander tells the person of the party's movement, or "". */
  get notice(): string { return this.team.notice; }

  /** The run's part of a step, before the bodies': who is built, each body's level, doors, each team's orders, and the status. */
  private plan(): void {
    if (this.status === "playing") this.wake();
    this.levels();
    if (this.status !== "playing") {
      this.given.clear();
      return;
    }
    this.level.openNearby(this.actors.filter(a => a.fighter && a.alive).map(a => a.feet()));
    const party = this.team.decide(this.partyView(this.clock >= this.nextPerception));
    if (party.looked) this.nextPerception = this.clock + RUN_TIMING.perceive;
    for (const [id, orders] of party.orders) this.given.set(id, orders);
    for (const [id, orders] of this.foes.decide(this.view(this.enemies, this.party, party.looked, null)).orders) this.given.set(id, orders);
    // A recovering party member keeps the run alive; reaching the exit requires an upright body.
    const alive = this.party.filter(member => member.alive);
    if (!alive.length) this.status = "dead";
    else if (alive.some(member => !member.fighter?.body.down && distance(member.feet(), this.map.exit) < EXIT_METRES)) this.status = "won";
  }

  /** The ground as a team of the run knows it (`TeamLevel`): the map's, its doors as they stand; `look` is what the team's look reveals. */
  private ground(look: TeamLevel["look"]): TeamLevel {
    const map = this.map;
    return {
      sees: (from, to, metres) => canSee(map, from, to, metres, this.sightIndex()),
      look,
      fits: (at, radius) => walkable(map, at, radius, true),
      passes: (from, to, radius) => clearSegment(map, from, to, radius, true),
      reaches: (from, to, radius) => findPath(map, from, to, radius).length > 0,
      frontier: (from, radius) => explorationGoal(map, from, this.explored, radius),
      doorway: (from, to, radius) => doorApproach(map, this.level.sensedSolids, from, to, radius),
      open: (door) => map.doors.find((d) => d.id === door)?.open ?? false,
    };
  }

  /** What the party senses now, the person's keys and pointer its lead. */
  private partyView(look: boolean): TeamView {
    const { mode, cursor } = this.commands;
    return this.view(this.party, this.enemies, look, {
      keys: mode.keyboard ? screenMovement(this.commands.right, this.commands.up, this.toward) : null, walk: false,
      aim: mode.facing ? cursor : null, strike: null, explore: mode.facing,
    });
  }

  /** What a team of `members` senses now: its built members, and every built body of `foes`. */
  private view(members: readonly DungeonActor[], foes: readonly DungeonActor[], look: boolean, lead: TeamView["lead"]): TeamView {
    const built = (actor: DungeonActor) => actor.fighter !== null;
    return {
      time: this.clock, look, lead,
      members: members.filter(built).map((actor): MemberView => ({
        id: actor.id, at: actor.feet(), fighting: actor.alive, held: actor.held, radius: actor.radius,
        reach: actor.attackMetres, home: actor.home, navigation: actor.navigation,
        gait: actor.skills?.gait ?? null, heading: actor.skills?.report.heading ?? null,
      })),
      others: foes.filter(built).map((actor): SensedBody => ({ id: actor.id, at: actor.feet(), fighting: actor.alive })),
    };
  }

  /**
   * The orders `actor`'s mind is given now: its Commander's, but with no movement once it stands
   * within the band of the foe it attacks, where its mind's own footwork takes over.
   */
  private delivered(actor: DungeonActor): Orders {
    const orders = this.given.get(actor.id) ?? STAND_ORDERS, move = orders.move;
    const foe = orders.foe === undefined ? undefined : this.actors.find((other) => other.id === orders.foe);
    if (!foe || move?.kind !== "range" || move.focus !== foe.id || distance(actor.feet(), foe.feet()) > move.far) return orders;
    return Object.fromEntries(Object.entries(orders).filter(([key]) => key !== "move")) as unknown as Orders;
  }

  /** The map's sight index, made again once another door has opened. */
  private sightIndex(): SightIndex {
    let opened = 0;
    for (const door of this.map.doors) if (door.open) opened++;
    if (this.seeing?.opened !== opened) this.seeing = { index: sightIndex(this.map), opened };
    return this.seeing.index;
  }

  /** `n` steps of the world, each running the run's plan and then every body. */
  step(n = 1): void { this.world.step(n); }

  /** The steps owed after `seconds` of real time, no more than `most` (`World.advance`); none once the run is over. */
  advance(seconds: number, most?: number): number { return this.status === "playing" ? this.world.advance(seconds, most) : 0; }

  present(): void {
    this.level.present(this.visible, this.explored, this.leader.feet(), this.pitch, this.toward);
    for (const actor of this.actors) {
      const shown = actor.side === "party" || this.visible.has(cellKey(this.map, actor.feet()));
      for (const mesh of actor.meshes) mesh.isVisible = shown;
    }
  }

  targetAt(mesh: AbstractMesh): DungeonActor | null {
    return this.enemies.find(a => a.fighter && a.alive && a.meshes.includes(mesh) &&
      this.visible.has(cellKey(this.map, a.feet()))) ?? null;
  }

  /** The party member whose body this mesh belongs to, standing, or null: a click on one selects it. */
  memberAt(mesh: AbstractMesh): DungeonActor | null {
    return this.party.find(a => a.alive && a.meshes.includes(mesh)) ?? null;
  }

  dispose(): void {
    this.watch?.dispose();
    this.planning.dispose();
    this.senses.dispose();
    for (const actor of this.actors) actor.fighter?.body.dispose();
    this.level.dispose();
    this.world.dispose();
  }
}
