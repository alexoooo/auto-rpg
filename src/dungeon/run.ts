import type { Scene } from "@babylonjs/core/scene.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import { createBody, SERVO_SECONDS, type Body } from "../core/body.ts";
import { buildBody } from "../core/build/build-body.ts";
import type { PhysicsEngine } from "../core/engine/engine.ts";
import { armed } from "../core/human/grip.ts";
import { modelSpec, type BodyModel } from "../core/human/spec.ts";
import { woodenClub } from "../core/items/club.ts";
import { ATTACK_METRES, fighterTactics } from "../core/mind/fighter.ts";
import { driveBy, type Tactics } from "../core/mind/tactics.ts";
import type { Skills } from "../core/skills/skills.ts";
import { watchBlows, type BlowWatch, type Fighter, type LandedBlow } from "../core/rules/blows.ts";
import { createPool } from "../core/rules/pool.ts";
import { balanceCeiling, balancePoint, rulebook } from "../core/rules/rulebook.ts";
import type { BodySpec } from "../core/spec/body.ts";
import { createWorld, type Hook, type World } from "../core/world.ts";
import { canSee, cellKey, clearSegment, distance, explorationGoal, findPath, reveal, walkable,
  type DungeonMap, type Point } from "./map.ts";
import { generateLevel } from "./level.ts";
import { DungeonCommands, screenMovement, type Order } from "./commands.ts";
import { buildDungeonWorld } from "./world.ts";
import type { DungeonSurfaces } from "./stone.ts";
import { CAMERA_AZIMUTH, CAMERA_PITCH, cameraToward } from "./camera.ts";
import { companionSpawn } from "./party-placement.ts";

/**
 * **A crypt run**: the level's colliders are fixed boxes in a world
 * (`buildDungeonWorld`), and the party and the enemies are bodies (`src/core/`), each driven
 * by tactics that carry out what the run plans for it. The run plans with the map: who sees whom,
 * whom each fights, and the path each walks (`findPath`); the person's orders reach the party only
 * through that plan (`DungeonCommands`), and tactics reach their body only through their intent.
 *
 * - **The hero** is the Warrior unless the page picks another, **the companions** whom the page names,
 *   **the enemies** skeletons, each with the wooden club in the right hand, the one weapon the core has.
 * - **The tactics** are a fighter's (`fighterTactics`): it walks its plan's direction, and within
 *   `ATTACK_METRES` of its target attacks the target's head with the club.
 * - **Wounds** are the core's blows (`watchBlows`) under the dungeon's rulebook. A fighter is out
 *   of the fight once its pool has ended, or once its body has fallen (`SkillReport.fallen`): the
 *   core has no rising, so a body down stays down. Nobody attacks it.
 * - **An enemy is built** once a standing party member comes within `WAKE_METRES` of where it waits,
 *   beyond its sight, and is never taken out again: a body is costly to step, and a level's
 *   worth of skeletons built from the start runs slower than real time.
 *
 * The run is lost when the whole party has fallen and won when a standing member reaches the exit.
 */

/** Who stands for each model in the party list and the target panel. */
const NAMES: Readonly<Record<BodyModel, string>> = Object.freeze({
  "workshop-fighter": "warrior", "workshop-rogue": "rogue", "crypt-skeleton": "skeleton",
});

export interface DungeonActor {
  readonly id: string;
  readonly name: string;
  readonly model: BodyModel;
  readonly side: "party" | "enemy";
  /** The body and its pool, once built; an enemy waits unbuilt until the party is near (`WAKE_METRES`). */
  fighter: (Fighter & { readonly body: Body; readonly skills: Skills }) | null;
  /** Where the body stands on the ground: its centre of mass over the floor, or where it waits unbuilt. */
  feet(): Point;
  /** Whether it still fights: unbuilt, or built with its pool not ended and its body not fallen. */
  readonly alive: boolean;
  /** Its pool's bar: 1 whole, 0 spent. */
  readonly vitality: number;
  /** What the page drew for it (its skin), shown while it is in sight, and picked to select or lock it. */
  readonly meshes: AbstractMesh[];
  target: DungeonActor | null; home: Point; lastSeen: Point | null; alertedUntil: number;
  route: Point[]; goal: Point | null; nextPlan: number; readonly radius: number;
  /** Where the body last made progress along its route, and when. */
  progress: { at: Point; since: number };
  /**
   * A party member's standing order, and for a drawn route the index of the next point on it. A force
   * order is shared by reference with `DungeonCommands.order`, whose route grows while it is drawn, so
   * each member walks it by index and nobody consumes it for the others. An enemy's stays idle.
   */
  order: Order; next: number;
  /** Where a companion was last sent, which it holds once there; null follows the hero. The hero's stays null. */
  post: Point | null;
  /** The order was dropped by the run rather than replaced by the person, and the member replans next step. */
  replan: boolean;
  /** What its tactics carry out this step: a direction to walk (unit, world) or null to stand, a way to face, and whom to attack. */
  plan: { move: Point | null; face: Point | null; attack: DungeonActor | null };
}

/** How far behind the hero an unposted companion trails before it walks after it, metres: clear of the hero's reach. */
const TRAIL_METRES = 2.5;
/**
 * A body with a route that has not moved 50 mm in a second has the route replanned from where it
 * is. The slowest walker, the skeleton, walks at 0.2 m/s (`assets/core/stance-envelope.json`), so a body that
 * has not is stuck or held up; a replan that finds no route keeps the one it had.
 */
const STALL = { seconds: 1, metres: 0.05 } as const;
/** How far an enemy sees the party along a clear line (`canSee`). */
const SIGHT_METRES = 14;
/** How near a standing party member comes before an enemy is built: beyond its sight, so it is standing when it can first see. */
export const WAKE_METRES = SIGHT_METRES + 2;
/**
 * The clearance a body's path keeps from rock, m: half a human's shoulders' breadth (the Warrior's
 * are 0.46 m across) and a margin for the stance's sway.
 */
const FOOTPRINT_METRES = 0.35;
/**
 * With the cursor steering its facing, the hero takes on what the cursor points at, and also any enemy nearer than
 * `metres` wherever it stands, turning to it for as long as it stays within `keepMetres`.
 */
const SET_UPON = { metres: 2.5, keepMetres: 3.5 } as const;
/** The cone about the cursor's direction the hero picks targets from, as the cosine of its half-angle (73 degrees). */
const AIM_COSINE = 0.3;
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
  /** Hears each blow as it lands. */
  readonly onBlow?: (blow: LandedBlow) => void;
  /** Called with each actor as its body is built, before it first steps: the page dresses it. */
  readonly onBuilt?: (actor: DungeonActor) => void;
}

/** A model with the club in its right hand. */
const clubbed = (model: BodyModel): BodySpec => armed(modelSpec(model), "right", woodenClub());

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
  notice = "Find the exit. Click to move; drag to keep moving through danger.";
  /** The camera's elevation, which decides where on a wall in front of the hero the cut-away falls. The page sets it. */
  pitch = CAMERA_PITCH;
  /** The unit step on the ground toward the camera, which decides what the keys walk along and which walls the
   * cut-away opens. The page sets it from its azimuth. */
  toward: Point = cameraToward(CAMERA_AZIMUTH);
  private nextPerception = 0;
  private commandRevision = -1;
  private watch: BlowWatch | null = null;
  private readonly planning: Hook;
  private readonly rules = rulebook("dungeon");
  private readonly options: DungeonRunOptions;

  constructor(scene: Scene, options: DungeonRunOptions) {
    this.options = options;
    this.map = options.layout ?? generateLevel(options.seed).map;
    this.world = createWorld(scene, options.engine);
    this.level = buildDungeonWorld(scene, this.map, options.visuals ?? true, this.world.physics);
    // Before any body's own hooks, so each body's tactics read this step's plan.
    this.planning = this.world.beforeStep(() => this.plan());
    const create = (id: string, model: BodyModel, at: Point, side: DungeonActor["side"]): DungeonActor => {
      const actor: DungeonActor = {
        id, name: NAMES[model], model, side, fighter: null, meshes: [],
        feet() {
          if (!this.fighter) return { x: this.home.x, z: this.home.z };
          const c = this.fighter.body.view.stance.centre; return { x: c.x, z: c.z };
        },
        get alive() { return this.fighter === null || this.fighter.pool.ending() === null && !this.fighter.skills.report.fallen; },
        get vitality() { return this.fighter?.pool.bar() ?? 1; },
        target: null, home: { ...at }, lastSeen: null, alertedUntil: 0, route: [], goal: null, nextPlan: 0,
        radius: FOOTPRINT_METRES, progress: { at: { ...at }, since: 0 },
        order: IDLE, next: 0, post: null, replan: false, plan: { move: null, face: null, attack: null },
      };
      this.actors.push(actor); return actor;
    };
    this.hero = create("hero", options.hero ?? "workshop-fighter", this.map.start, "party");
    this.party.push(this.hero);
    this.map.spawns.forEach((at, i) => this.enemies.push(create(`enemy-${i}`, options.enemy?.(i) ?? "crypt-skeleton", at, "enemy")));
    const taken: Point[] = [this.map.start];
    (options.companions ?? []).forEach((model, i) => {
      const at = companionSpawn(this.map, taken);
      if (!at) throw new Error(`No floor beside the start for companion ${i + 1}`);
      taken.push(at); this.party.push(create(`ally-${i}`, model, at, "party"));
    });
    this.selected = new Set(this.party.map(member => member.id));
    for (const member of this.party) this.build(member);
    this.wake();
    this.visible = this.sight(this.party.map(member => member.home));
  }

  /** Seconds since the run began: the world's clock. */
  get clock(): number { return this.world.time; }

  /** Build `actor`'s body where it waits, hand it its tactics, and watch its blows with everybody's. */
  private build(actor: DungeonActor): void {
    const spec = clubbed(actor.model);
    const built = buildBody(spec, this.world, { position: [actor.home.x, 0, actor.home.z] });
    const assist = balanceCeiling(spec.attributes.balance.value, balancePoint(this.rules));
    const body = createBody(built, this.world, { servoSeconds: SERVO_SECONDS, assist });
    const skills = driveBy(body, this.tactics(actor));
    actor.fighter = { id: actor.id, side: actor.side, built, pool: createPool(spec, this.rules), body, skills };
    this.watch?.dispose();
    const fighters = this.actors.flatMap((a) => a.fighter ? [a.fighter] : []);
    this.watch = watchBlows(this.world, fighters, this.rules, (blow) => { this.blows.push(blow); this.options.onBlow?.(blow); });
    this.options.onBuilt?.(actor);
  }

  /**
   * What carries out `actor`'s plan (`fighterTactics`), which the run hands over as `Orders`: the
   * plan's facing is for a fighter that stands, and one that walks faces its walk. A fighter out of
   * the fight only faces.
   */
  private tactics(actor: DungeonActor): Tactics {
    return fighterTactics(`crypt ${actor.side}`, () => {
      const { move, face, attack } = actor.plan, head = attack?.fighter?.body.view.head;
      return actor.alive
        ? { move, face: move ? null : face, attack: head ? [head.x, head.y, head.z] : null }
        : { move: null, face, attack: null };
    });
  }

  /** Build each enemy a standing party member has come within `WAKE_METRES` of. */
  private wake(): void {
    const standing = this.party.filter(member => member.alive).map(member => member.feet());
    for (const enemy of this.enemies) if (!enemy.fighter && standing.some(at => distance(at, enemy.home) < WAKE_METRES)) this.build(enemy);
  }

  /** What the party sees from where its members stand: every member's cells, one set. */
  private sight(from: readonly Point[]): Set<number> {
    const [first, ...rest] = from, visible = reveal(this.map, first, this.explored);
    for (const at of rest) for (const cell of reveal(this.map, at, this.explored)) visible.add(cell);
    return visible;
  }

  /**
   * The point itself for the first member sent to it, then the first of eight bearings on a 1.4 m ring,
   * and a 2.8 m one, that is floor within sight of it and clear of every slot already given. Each slot
   * is recorded in `taken`.
   */
  private slot(point: Point, radius: number, taken: Point[]): Point {
    const free = (at: Point) => taken.every(other => distance(other, at) >= 1.3);
    let chosen: Point | null = free(point) ? { x: point.x, z: point.z } : null;
    for (const ring of [1.4, 2.8]) for (let i = 0; i < 8 && !chosen; i++) {
      const at = { x: point.x + Math.sin(i * Math.PI / 4) * ring, z: point.z + Math.cos(i * Math.PI / 4) * ring };
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
      member.order = IDLE; member.next = 0; member.post = null; member.replan = true;
    }
  }

  private follow(actor: DungeonActor, goal: Point): Point {
    const at = actor.feet();
    if (!actor.route.length || distance(at, actor.progress.at) > STALL.metres) actor.progress = { at, since: this.clock };
    else if (this.clock - actor.progress.since > STALL.seconds) {
      const route = findPath(this.map, at, goal, actor.radius);
      if (route.length) { actor.goal = { x: goal.x, z: goal.z }; actor.route = route; actor.nextPlan = this.clock + 0.5; }
      actor.progress = { at, since: this.clock };
    }
    if (!actor.goal || distance(goal, actor.goal) > 0.65 || this.clock >= actor.nextPlan && !actor.route.length) {
      actor.goal = { x: goal.x, z: goal.z }; actor.route = findPath(this.map, at, goal, actor.radius);
      actor.nextPlan = this.clock + 0.5;
    }
    while (actor.route.length && distance(at, actor.route[0]) < 0.3) actor.route.shift();
    if (!actor.route.length) return { x: 0, z: 0 };
    return direction(at, actor.route[0]);
  }

  private perceive(): void {
    const members = this.party.filter(member => member.alive);
    const places = members.map(member => member.feet());
    this.visible = this.sight(places);
    // An enemy goes for the nearest party member it can see.
    for (const actor of this.enemies) {
      if (!actor.fighter || !actor.alive) { actor.target = null; continue; }
      const at = actor.feet();
      let seen = -1, best = Infinity;
      for (let i = 0; i < members.length; i++) {
        const d = distance(at, places[i]);
        if (d < best && canSee(this.map, at, places[i], SIGHT_METRES)) { best = d; seen = i; }
      }
      if (seen >= 0) {
        actor.lastSeen = { x: places[seen].x, z: places[seen].z }; actor.alertedUntil = this.clock + 7;
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
      if (locked && fighting(locked) && canSee(this.map, at, locked.feet(), 12)) {
        member.target = locked; member.lastSeen = locked.feet(); return;
      }
      // Pursue the last observed position, never a hidden moving actor.
      if (locked && fighting(locked) && member.lastSeen && distance(at, member.lastSeen) > 0.5 &&
        findPath(this.map, at, member.lastSeen, member.radius).length) { member.target = null; return; }
      member.order = IDLE; member.next = 0; member.replan = true; member.lastSeen = null;
    }
    const hero = member === this.hero, current = member.target;
    const rank = (actor: DungeonActor) => hero ? this.aimRank(actor) : 0;
    const candidates = this.enemies.filter(a => fighting(a) && canSee(this.map, at, a.feet(), 8))
      .filter(a => !hero || this.aimedAt(a) || distance(at, a.feet()) < (a === current ? SET_UPON.keepMetres : SET_UPON.metres))
      .sort((a, b) => rank(a) - rank(b) || distance(a.feet(), at) - distance(b.feet(), at));
    const keep = current && candidates.includes(current) && distance(current.feet(), at) < 5 && rank(current) <= rank(candidates[0]);
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

  /**
   * Where a party member walks this step, or null when it is close enough to its target to fight.
   * The person's keyboard and mouse facing drive the hero alone; a mouse order is each selected member's.
   */
  memberMovement(actor: DungeonActor): Point | null {
    const { mode } = this.commands, order = actor.order, at = actor.feet(), hero = actor === this.hero;
    if (hero && mode.keyboard) return screenMovement(this.commands.right, this.commands.up, this.toward);
    if (order.kind === "force") {
      while (actor.next < order.points.length && distance(at, order.points[actor.next]) < 0.4) { actor.next++; actor.goal = null; }
      if (actor.next >= order.points.length) {
        if (!order.drawing) {
          const last = order.points[order.points.length - 1];
          actor.order = IDLE; actor.next = 0; if (!hero && last) actor.post = { x: last.x, z: last.z };
        }
        return { x: 0, z: 0 };
      }
      const point = order.points[actor.next], move = this.follow(actor, point);
      if (!actor.route.length && distance(at, point) >= 0.4) this.notice = "That path is blocked. Draw a new route on the floor.";
      return move;
    }
    if (actor.target) {
      const targetAt = actor.target.feet();
      return distance(at, targetAt) > ATTACK_METRES ? this.follow(actor, targetAt) : null;
    }
    if (order.kind === "lock" && actor.lastSeen) return this.follow(actor, actor.lastSeen);
    if (order.kind === "attack-move") {
      if (distance(at, order.destination) < 0.4) {
        actor.order = IDLE; if (!hero) actor.post = { x: order.destination.x, z: order.destination.z };
        return { x: 0, z: 0 };
      }
      const move = this.follow(actor, order.destination);
      if (!actor.route.length) this.notice = "Destination unreachable. Choose another floor point.";
      return move;
    }
    if (!hero) {
      // A companion with nothing to do holds where it was sent, or walks after the hero.
      const post = actor.post;
      if (post) return distance(at, post) > 0.6 ? this.follow(actor, post) : { x: 0, z: 0 };
      if (!this.hero.alive) return { x: 0, z: 0 };
      const heroAt = this.hero.feet();
      return distance(at, heroAt) > TRAIL_METRES ? this.follow(actor, heroAt) : { x: 0, z: 0 };
    }
    if (mode.facing) {
      if (!actor.goal || distance(at, actor.goal) < 0.5 || !actor.route.length) {
        actor.goal = null;
        const goal = explorationGoal(this.map, at, this.explored, actor.radius);
        return goal ? this.follow(actor, goal) : { x: 0, z: 0 };
      }
      return this.follow(actor, actor.goal);
    }
    return { x: 0, z: 0 };
  }

  /** Where an enemy walks this step, or null when it is close enough to its target to fight: after what it saw, else home. */
  private enemyMovement(actor: DungeonActor): Point | null {
    const at = actor.feet();
    if (actor.target && distance(at, actor.target.feet()) <= ATTACK_METRES) return null;
    const goal = actor.target?.feet() ?? (actor.alertedUntil > this.clock ? actor.lastSeen : actor.home);
    return goal && distance(at, goal) > 0.4 ? this.follow(actor, goal) : { x: 0, z: 0 };
  }

  /** Paths route around walls; local steering lets a route pass an occupied floor point. */
  private avoidCrowd(actor: DungeonActor, move: Point): Point {
    if (Math.hypot(move.x, move.z) < 0.1) return move;
    const at = actor.feet();
    const obstruction = this.actors.filter(other => other !== actor && other.fighter && other.alive).map(other => {
      const p = other.feet(), dx = p.x - at.x, dz = p.z - at.z;
      return { other, dx, dz, forward: dx * move.x + dz * move.z,
        lateral: -dx * move.z + dz * move.x, clearance: actor.radius + other.radius + 0.15 };
    }).filter(p => p.forward > 0 && p.forward < p.clearance + 1 && Math.abs(p.lateral) < p.clearance)
      .sort((a, b) => a.forward - b.forward)[0];
    if (!obstruction) return move;
    const preferred = obstruction.lateral > 0.05 ? -1 : 1;
    for (const sign of [preferred, -preferred]) {
      const angle = 1.05 * sign, c = Math.cos(angle), s = Math.sin(angle);
      const candidate = { x: move.x * c - move.z * s, z: move.x * s + move.z * c };
      const endpoint = { x: at.x + candidate.x * 0.65, z: at.z + candidate.z * 0.65 };
      if (walkable(this.map, endpoint, actor.radius, true) &&
        distance(endpoint, obstruction.other.feet()) > Math.hypot(obstruction.dx, obstruction.dz) - 0.05) return candidate;
    }
    return move;
  }

  /** The run's part of a step, before the bodies': orders, doors, who is built, who sees whom, and each actor's plan. */
  private plan(): void {
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
        member.next = 0; member.replan = true;
        if (order.kind !== "idle") member.post = null;
      }
      this.notice = order.kind === "force" ? "Force move — following your drawn route" : "Find the illuminated exit.";
    }
    for (const member of this.party) if (member.replan) {
      member.replan = false; member.route = []; member.goal = null; member.target = null; member.lastSeen = null;
      this.nextPerception = 0;
      if (member.order.kind === "idle" && member === this.hero) this.notice = "Find the illuminated exit.";
    }
    this.level.openNearby(this.actors.filter(a => a.fighter && a.alive).map(a => a.feet()));
    this.wake();
    if (this.clock >= this.nextPerception) { this.perceive(); this.nextPerception = this.clock + 0.2; }
    for (const actor of this.actors) {
      if (!actor.fighter || !actor.alive) {
        // Out of the fight its assist is withdrawn: a body that is down still has a stance that asks.
        actor.fighter?.body.assist.withdraw();
        actor.plan = { move: null, face: null, attack: null };
        continue;
      }
      let move = actor.side === "party" ? this.memberMovement(actor) : this.enemyMovement(actor);
      if (move && !(actor === this.hero && this.commands.mode.keyboard)) move = this.avoidCrowd(actor, move);
      const walking = move !== null && Math.hypot(move.x, move.z) > 0.1;
      const at = actor.feet(), target = actor.target;
      const face = target ? direction(at, target.feet())
        : actor === this.hero && this.commands.mode.facing && this.commands.cursor ? direction(at, this.commands.cursor) : null;
      actor.plan = { move: walking ? move : null, face, attack: move === null && target?.fighter && target.alive ? target : null };
    }
    // The run is lost when the whole party has fallen, and won when anybody still standing reaches the exit.
    const standing = this.party.filter(member => member.alive);
    if (!standing.length) this.status = "dead";
    else if (standing.some(member => distance(member.feet(), this.map.exit) < 1.1)) this.status = "won";
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
    for (const actor of this.actors) actor.fighter?.body.dispose();
    this.level.dispose();
    this.world.dispose();
  }
}
