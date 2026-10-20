import type { Scene } from "@babylonjs/core/scene.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import type { PhysicsEngine } from "../core/engine/engine.ts";
import { enlist, type Combatant } from "../core/combatant.ts";
import { armedWith } from "../core/items/held.ts";
import { modelInfo, modelSpec, type BodyModel } from "../core/models.ts";
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
import { DungeonCommands, screenMovement, type Order } from "./commands.ts";
import { buildDungeonWorld } from "./world.ts";
import type { DungeonSurfaces } from "./stone.ts";
import { CAMERA_AZIMUTH, CAMERA_PITCH, cameraToward } from "./camera.ts";
import { companionSpawn } from "./party-placement.ts";
import { generateEncounterLevel } from "./encounters.ts";
import { directMovement, placeMovement, type MovementRequest } from "../core/mind/movement.ts";
import type { NavigationReport } from "../core/mind/navigation.ts";
import type { Skills } from "../core/skills/skills.ts";
import type { Orders } from "../core/mind/orders.ts";
import { cos, sin } from "../core/math/real.ts";
import { doorApproach } from "./door-approach.ts";

/**
 * **A crypt run**: the level's colliders are fixed boxes in a world
 * (`buildDungeonWorld`), and the party and the enemies are bodies (`src/core/`), each driven
 * by tactics that carry out what the run plans for it. The run plans with the map: who sees whom,
 * whom each fights, and each destination; the person's orders reach the party only
 * through that plan (`DungeonCommands`), and tactics reach their body only through their intent.
 *
 * - **The hero** is the Warrior unless the page picks another, **the companions** whom the page names,
 *   **the enemies** the map's encounters; point-only maps supply skeletons. Model defaults
 *   provide each body's mind and equipment.
 * - **The tactics** carry out the plan through orders. Humanoids attack the target's head;
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
/** Every model a run of `options` on `map` fields, each once: the party's, then the enemies'. */
export function runModels(map: DungeonMap, options: Pick<DungeonRunOptions, "hero" | "companions" | "enemy">): BodyModel[] {
  return [...new Set([heroOf(options), ...(options.companions ?? []), ...map.spawns.map((_, i) => enemyAt(map, options, i))])];
}

/** Who stands for each model in the party list and the target panel. */
const NAMES = (model: BodyModel) => MODEL_DISPLAY[model].label.toLowerCase();

/** Who a body of the run is, by which its mind is chosen (`DungeonRunOptions.mind`): its id, its side and its model. */
export type Participant = Pick<DungeonActor, "id" | "side" | "model">;

export interface DungeonActor {
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
  target: DungeonActor | null; home: Point; lastSeen: Point | null; alertedUntil: number;
  /** The unexplored place selected by the run; its Mind owns every route to it. */
  goal: Point | null; readonly radius: number;
  /** Navigation feedback and geometric route from its selected Mind, where it exposes the role. */
  readonly navigation: NavigationReport | null;
  /**
   * A party member's standing order. A force
   * order is shared by reference with `DungeonCommands.order`, whose route grows while it is drawn, so
   * each member's navigator walks it and nobody consumes it for the others. An enemy's stays idle.
   */
  order: Order;
  /** A drawn order resumes at its current explicit point after an intervening door interaction. */
  routeStart: number;
  /** The reachable near side of an interactable door; its original objective resumes once open. */
  opening: { door: number; point: Point; request: string } | null;
  /** Where a companion was last sent, which it holds once there; null follows the hero. The hero's stays null. */
  post: Point | null;
  /** The order was dropped by the run rather than replaced by the person, and the member replans next step. */
  replan: boolean;
  /** Objectives carried out through the Mind: movement, an independent facing and a sensed foe. */
  plan: { move: MovementRequest | null; face: Point | null; attack: DungeonActor | null };
}

/** Travel brings a target into engagement range; its Mind chooses the combat footwork within it. */
export function ordersForActor(actor: DungeonActor): Orders {
  const { move, face, attack } = actor.plan;
  const engaged = attack !== null && move?.kind === "range" && move.focus === attack.id
    && distance(actor.feet(), attack.feet()) <= move.far;
  return { ...(engaged ? {} : { move }), face, ...(attack ? { foe: attack.id } : {}) };
}

/** How far behind the hero an unposted companion trails before it walks after it, metres: clear of the hero's reach
 * (`docs/reference/play.md#following`). */
const TRAIL_METRES = 2.5;
/** How far an enemy sees the party along a clear line (`canSee`), m (`docs/reference/play.md#sight`). */
const SIGHT_METRES = 14;
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
/**
 * With the cursor steering its facing, the hero takes on what the cursor points at, and also any enemy nearer than
 * `metres` wherever it stands, turning to it for as long as it stays within `keepMetres`
 * (`docs/reference/play.md#targets`).
 */
const SET_UPON = { metres: 2.5, keepMetres: 3.5 } as const;
/** The cone about the cursor's direction the hero picks targets from, as the cosine of its half-angle (73 degrees;
 * `docs/reference/play.md#targets`). */
const AIM_COSINE = 0.3;
/**
 * How far a party member sees an enemy along a clear line, m (`docs/reference/play.md#sight`): the one its order
 * locks, `locked`; one it may pick for itself, `pick`; and how far the one it fights may go before another is
 * picked, `keep`.
 */
const PARTY_SIGHT = Object.freeze({ locked: 12, pick: 8, keep: 5 });
/**
 * Who sees whom is read every `perceive`, s; an enemy pursues its last seen place for `alerted`
 * after losing sight (`docs/reference/play.md#run-timing`).
 */
const RUN_TIMING = Object.freeze({ perceive: 0.2, alerted: 7 });
/**
 * Arrival tolerances, m (`docs/reference/play.md#arrival`): an ordered destination, a companion's
 * post, an exploration goal, the last place a target was seen, and the exit.
 */
const ARRIVAL = Object.freeze({ point: 0.4, post: 0.6, explored: 0.5, lastSeen: 0.5, exit: 1.1 });
/**
 * Where several members sent to one floor point stand, m (`docs/reference/play.md#following`): no two slots nearer
 * than `apart`, on eight bearings of each of these rings about the point.
 */
const SLOTS = Object.freeze({ apart: 1.3, rings: [1.4, 2.8] });
const direction = (from: Point, to: Point): Point => {
  const d = Math.max(0.001, distance(from, to)); return { x: (to.x - from.x) / d, z: (to.z - from.z) / d };
};
const IDLE: Order = Object.freeze({ kind: "idle" });

/** A run goes on until its party has fallen or one of it stands at the exit. */
export type RunStatus = "playing" | "won" | "dead";

interface DungeonRunOptions {
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

export class DungeonRun {
  readonly map: DungeonMap;
  readonly commands = new DungeonCommands();
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
  /** Which party members the person's next mouse order goes to, by id. Everybody, until the person picks. */
  selected: ReadonlySet<string>;
  readonly explored = new Set<number>();
  visible = new Set<number>();
  status: RunStatus = "playing";
  notice = "";
  /** The camera's elevation, which decides where on a wall in front of the hero the cut-away falls. The page sets it. */
  pitch = CAMERA_PITCH;
  /** The unit step on the ground toward the camera, which decides what the keys walk along and which walls the
   * cut-away opens. The page sets it from its azimuth. */
  toward: Point = cameraToward(CAMERA_AZIMUTH);
  private nextPerception = 0;
  /** The map's sight index, and how many of its doors were open when it was made: `sight` makes it again when another has opened. */
  private seeing: { index: SightIndex; opened: number } | null = null;
  private commandRevision = -1;
  private watch: BlowWatch | null = null;
  private readonly planning: Hook;
  private readonly rules = rulebook("dungeon");
  private readonly options: DungeonRunOptions;
  private readonly senses: SensesHub;

  constructor(scene: Scene, options: DungeonRunOptions) {
    this.options = options;
    this.map = runMap(options);
    this.world = createWorld(scene, options.engine);
    this.senses = createSenses(this.world);
    this.level = buildDungeonWorld(scene, this.map, options.visuals ?? true, this.world.physics);
    // Before any body's own hooks, so each body's tactics read this step's plan.
    this.planning = this.world.beforeStep(() => this.plan());
    const create = (id: string, model: BodyModel, at: Point, side: DungeonActor["side"]): DungeonActor => {
      const actor: DungeonActor = {
        id, name: NAMES(model), model, side, fighter: null, meshes: [], outAt: null,
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
        target: null, home: { ...at }, lastSeen: null, alertedUntil: 0, goal: null, radius: cryptModel(model).radius,
        get navigation() { return (this.fighter?.minded as { readonly skills?: Skills } | undefined)?.skills?.report.navigation ?? null; },
        order: IDLE, routeStart: 0, opening: null, post: null, replan: false, plan: { move: null, face: null, attack: null },
      };
      this.actors.push(actor); return actor;
    };
    this.hero = create("hero", heroOf(options), this.map.start, "party");
    this.party.push(this.hero);
    this.map.spawns.forEach((at, i) => this.enemies.push(create(`enemy-${i}`, enemyAt(this.map, options, i), at, "enemy")));
    const taken = [{ ...this.map.start, radius: this.hero.radius }];
    (options.companions ?? []).forEach((model, i) => {
      const radius = cryptModel(model).radius, at = companionSpawn(this.map, taken, radius);
      if (!at) throw new Error(`No floor beside the start for companion ${i + 1}`);
      taken.push({ ...at, radius }); this.party.push(create(`ally-${i}`, model, at, "party"));
    });
    this.selected = new Set(this.party.map(member => member.id));
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
   * carries out `actor`'s plan, which the run hands it as `Orders`, its target as the foe
   * (`docs/reference/crypt-foe.md`). Facing remains independent of movement. It is asked only
   * while its body is at `full` (`levels`).
   */
  private build(actor: DungeonActor): void {
    const info = modelInfo(actor.model);
    actor.fighter = enlist(this.world, {
      id: actor.id, side: actor.side, spec: armedWith(modelSpec(actor.model), "right", info.held), at: [actor.home.x, 0, actor.home.z],
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
      orders: () => ordersForActor(actor),
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
    return actor.side === "enemy" && actor.alive && !actor.target && actor.alertedUntil <= this.clock &&
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
    let opened = 0;
    for (const door of this.map.doors) if (door.open) opened++;
    if (this.seeing?.opened !== opened) this.seeing = { index: sightIndex(this.map), opened };
    const visible = new Set<number>();
    for (const at of from) reveal(this.map, at, this.explored, 12, this.seeing.index, visible);
    return visible;
  }

  /**
   * The point itself for the first member sent to it, then the first of eight bearings on each ring of
   * `SLOTS`, nearest first, that is floor within sight of it and clear of every slot already given. Each
   * slot is recorded in `taken`.
   */
  private slot(point: Point, radius: number, taken: Point[]): Point {
    const free = (at: Point) => taken.every(other => distance(other, at) >= SLOTS.apart);
    let chosen: Point | null = free(point) ? { x: point.x, z: point.z } : null;
    for (const ring of SLOTS.rings) for (let i = 0; i < 8 && !chosen; i++) {
      const at = { x: point.x + sin(i * Math.PI / 4) * ring, z: point.z + cos(i * Math.PI / 4) * ring };
      if (free(at) && walkable(this.map, at, radius, true) && clearSegment(this.map, point, at, radius, true)) chosen = at;
    }
    const slot = chosen ?? { x: point.x, z: point.z };
    taken.push(slot); return slot;
  }

  /** The party member the camera follows and the page reports: the hero while it stands, then the first companion that does. */
  get leader(): DungeonActor { return this.party.find(member => member.alive) ?? this.hero; }

  /** Sends the person's next mouse order to these party members, or to everybody when `ids` is null. Unknown ids are dropped. */
  select(ids: readonly string[] | null): void {
    this.selected = new Set(ids === null ? this.party.map(m => m.id) : ids.filter(id => this.party.some(m => m.id === id)));
  }

  /** Calls the selected companions back to the hero: each drops its order and its post. The hero is not a companion. */
  regroup(): void {
    for (const member of this.party) if (member !== this.hero && this.selected.has(member.id)) {
      member.order = IDLE; member.post = null; member.replan = true;
    }
  }

  private perceive(): void {
    const members = this.party.filter(member => member.alive);
    // With nobody of the party standing the run is lost in this plan, and what it last saw stands.
    if (!members.length) return;
    const places = members.map(member => member.feet());
    this.visible = this.sight(places);
    // An enemy goes for the nearest party member it can see.
    for (const actor of this.enemies) {
      if (!actor.fighter || !actor.alive || actor.held) { actor.target = null; continue; }
      const at = actor.feet();
      let seen = -1, best = Infinity;
      for (let i = 0; i < members.length; i++) {
        const d = distance(at, places[i]);
        if (d < best && canSee(this.map, at, places[i], SIGHT_METRES, this.seeing?.index)) { best = d; seen = i; }
      }
      if (seen >= 0) {
        actor.lastSeen = { x: places[seen].x, z: places[seen].z }; actor.alertedUntil = this.clock + RUN_TIMING.alerted;
        actor.target = members[seen];
      } else actor.target = null;
    }
    members.forEach((member, i) => this.choose(member, places[i]));
  }

  /** Which enemy a party member fights: the one its order locks, or the nearest it can see. */
  private choose(member: DungeonActor, at: Point): void {
    const order = member.order;
    const fighting = (a: DungeonActor) => a.fighter !== null && a.alive;
    if (order.kind === "lock") {
      const locked = this.enemies.find(a => a.id === order.target);
      if (locked && fighting(locked) && canSee(this.map, at, locked.feet(), PARTY_SIGHT.locked, this.seeing?.index)) {
        member.target = locked; member.lastSeen = locked.feet(); return;
      }
      // Pursue the last observed position, never a hidden moving actor.
      if (locked && fighting(locked) && member.lastSeen && distance(at, member.lastSeen) > ARRIVAL.lastSeen &&
        findPath(this.map, at, member.lastSeen, member.radius).length) { member.target = null; return; }
      member.order = IDLE; member.replan = true; member.lastSeen = null;
    }
    const hero = member === this.hero, current = member.target;
    const rank = (actor: DungeonActor) => hero ? this.aimRank(actor) : 0;
    const candidates = this.enemies.filter(a => fighting(a) && canSee(this.map, at, a.feet(), PARTY_SIGHT.pick, this.seeing?.index))
      .filter(a => !hero || this.aimedAt(a) || distance(at, a.feet()) < (a === current ? SET_UPON.keepMetres : SET_UPON.metres))
      .sort((a, b) => rank(a) - rank(b) || distance(a.feet(), at) - distance(b.feet(), at));
    const keep = current && candidates.includes(current) && distance(current.feet(), at) < PARTY_SIGHT.keep && rank(current) <= rank(candidates[0]);
    member.target = keep ? current : candidates[0] ?? null;
  }

  /** Which the hero takes on first, lowest first: an enemy upon it that the cursor points at, one upon it, one the cursor points at, then the rest. */
  private aimRank(actor: DungeonActor): number {
    if (!this.commands.mode.facing || !this.commands.cursor) return 0;
    const reach = actor === this.hero.target ? SET_UPON.keepMetres : SET_UPON.metres;
    const upon = distance(this.hero.feet(), actor.feet()) < reach;
    return (upon ? 0 : 2) + (this.aimedAt(actor) ? 0 : 1);
  }

  /** Whether the cursor points the hero at `actor`: always, unless the cursor steers the hero's facing. */
  private aimedAt(actor: DungeonActor): boolean {
    const heroAt = this.hero.feet();
    if (!this.commands.mode.facing || !this.commands.cursor) return true;
    const look = direction(heroAt, this.commands.cursor), toward = direction(heroAt, actor.feet());
    return toward.x * look.x + toward.z * look.z > AIM_COSINE;
  }

  /** Completion belongs to the selected navigator; independent Minds may expose only their physical arrival. */
  private arrived(actor: DungeonActor, point: Point, near: number): boolean {
    if (distance(actor.feet(), point) > near) return false;
    const report = actor.navigation;
    return !report || report.status === "arrived" && report.goal?.x === point.x && report.goal.z === point.z;
  }

  /** A sensed opponent is approached to a band; no request routes through its centre. */
  private approach(focus: DungeonActor, far: number): MovementRequest {
    return { kind: "range", focus: focus.id, near: far * .8, far };
  }

  /** The run chooses destinations and target bands; each Mind routes and physically follows them. */
  memberMovement(actor: DungeonActor): MovementRequest | null {
    const { mode } = this.commands, order = actor.order, at = actor.feet(), hero = actor === this.hero;
    if (hero && mode.keyboard) {
      const move = screenMovement(this.commands.right, this.commands.up, this.toward);
      return move.x || move.z ? directMovement(move.x, move.z) : null;
    }
    if (order.kind === "force") {
      const last = order.points.at(-1);
      if (!last) return null;
      if (!order.drawing && this.arrived(actor, last, ARRIVAL.point)) {
        actor.order = IDLE; if (!hero) actor.post = { ...last };
        return null;
      }
      return { kind: "place", points: order.points.slice(actor.routeStart).map(point => ({ ...point })), near: ARRIVAL.point };
    }
    if (actor.target) return this.approach(actor.target, cryptModel(actor.model).attackMetres);
    if (order.kind === "lock" && actor.lastSeen) return placeMovement(actor.lastSeen, ARRIVAL.lastSeen);
    if (order.kind === "attack-move") {
      if (this.arrived(actor, order.destination, ARRIVAL.point)) {
        actor.order = IDLE; if (!hero) actor.post = { ...order.destination };
        return null;
      }
      return placeMovement(order.destination, ARRIVAL.point);
    }
    if (!hero) {
      if (actor.post) return placeMovement(actor.post, ARRIVAL.post);
      return this.hero.alive ? this.approach(this.hero, TRAIL_METRES) : null;
    }
    if (mode.facing) {
      const status = actor.navigation?.status;
      if (!actor.goal || this.arrived(actor, actor.goal, ARRIVAL.explored) || status === "unreachable" || status === "stalled")
        actor.goal = explorationGoal(this.map, at, this.explored, actor.radius);
      return actor.goal ? placeMovement(actor.goal, ARRIVAL.explored) : null;
    }
    return null;
  }

  /** An enemy pursues its sensed target, the last place it saw, or its home. */
  private enemyMovement(actor: DungeonActor): MovementRequest | null {
    if (actor.target) return this.approach(actor.target, cryptModel(actor.model).attackMetres);
    const goal = actor.alertedUntil > this.clock ? actor.lastSeen : actor.home;
    return goal ? placeMovement(goal, ARRIVAL.point) : null;
  }

  /** A blocked objective can first request opening a door; physical routing stays with the Mind. */
  private throughDoors(actor: DungeonActor, request: MovementRequest | null): MovementRequest | null {
    if (!request || request.kind === "direct") { actor.opening = null; return request; }
    const key = JSON.stringify(request);
    if (actor.opening) {
      if (actor.opening.request !== key || this.map.doors.find(door => door.id === actor.opening!.door)?.open) actor.opening = null;
      else return placeMovement(actor.opening.point);
    }
    const report = actor.navigation;
    if (report?.status !== "unreachable" || JSON.stringify(actor.plan.move) !== key) return request;
    let goal = report.goal;
    if (!goal && request.kind === "range") { const focus = request.focus; goal = this.actors.find(other => other.id === focus)?.feet() ?? null; }
    if (!goal && request.kind === "place") goal = request.points[0] ?? null;
    if (!goal) return request;
    const interaction = doorApproach(this.map, this.level.sensedSolids, actor.feet(), goal, actor.radius);
    if (!interaction) return request;
    if (request.kind === "place" && actor.order.kind === "force") {
      const index = actor.order.points.findIndex((point, i) => i >= actor.routeStart && point.x === goal.x && point.z === goal.z);
      if (index >= 0) {
        actor.routeStart = index;
        request = { ...request, points: actor.order.points.slice(index).map(point => ({ ...point })) };
      }
    }
    actor.opening = { ...interaction, request: JSON.stringify(request) };
    return placeMovement(interaction.point);
  }

  /** The run's part of a step, before the bodies': orders, doors, who is built, who sees whom, and each actor's plan. */
  private plan(): void {
    if (this.status === "playing") this.wake();
    this.levels();
    if (this.status !== "playing") {
      for (const actor of this.actors) actor.plan = { move: null, face: null, attack: null };
      return;
    }
    if (this.commands.revision !== this.commandRevision) {
      // The person's new order goes to the selected members, and replaces whatever each was doing.
      this.commandRevision = this.commands.revision;
      const order = this.commands.order, taken: Point[] = [];
      for (const member of this.party) if (this.selected.has(member.id)) {
        // Several sent to one floor point take the slots about it, or all but one crowd it for ever.
        member.order = order.kind === "attack-move"
          ? { kind: "attack-move", destination: this.slot(order.destination, member.radius, taken) } : order;
        member.replan = true;
        if (order.kind !== "idle") member.post = null;
      }
      this.notice = "";
    }
    for (const member of this.party) if (member.replan) {
      member.replan = false; member.goal = null; member.target = null; member.lastSeen = null; member.opening = null; member.routeStart = 0;
      this.nextPerception = 0;
      if (member.order.kind === "idle" && member === this.hero) this.notice = "";
    }
    this.level.openNearby(this.actors.filter(a => a.fighter && a.alive).map(a => a.feet()));
    if (this.clock >= this.nextPerception) { this.perceive(); this.nextPerception = this.clock + RUN_TIMING.perceive; }
    for (const actor of this.actors) {
      if (!actor.fighter || !actor.alive || actor.held) {
        actor.plan = { move: null, face: null, attack: null };
        continue;
      }
      const move = this.throughDoors(actor, actor.side === "party" ? this.memberMovement(actor) : this.enemyMovement(actor));
      const at = actor.feet(), target = actor.target;
      const face = target ? direction(at, target.feet())
        : actor === this.hero && this.commands.mode.facing && this.commands.cursor ? direction(at, this.commands.cursor) : null;
      actor.plan = { move, face, attack: actor.order.kind !== "force" && target?.fighter && target.alive ? target : null };
      if (actor.side === "party" && move?.kind === "place") {
        if (actor.opening) this.notice = "Approaching door";
        else if (actor.navigation?.status === "unreachable") this.notice = "Destination unreachable";
        else if (actor.navigation?.status === "stalled") this.notice = "Movement stalled";
      }
    }
    // A recovering party member keeps the run alive; reaching the exit requires an upright body.
    const alive = this.party.filter(member => member.alive);
    if (!alive.length) this.status = "dead";
    else if (alive.some(member => !member.fighter?.body.down && distance(member.feet(), this.map.exit) < ARRIVAL.exit)) this.status = "won";
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
