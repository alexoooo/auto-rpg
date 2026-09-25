import type { GolemSetup } from "../bout.ts";
import type { Scene } from "@babylonjs/core/scene.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import type { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody.js";
import type { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin.js";
import { PhysicsActivationControl } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import { Combat } from "../combat.ts";
import { Golem } from "../golem/golem.ts";
import { bodyFamily, FAMILY_POLICY } from "../golem/family.ts";
import { NAMED_BUILDS, namedBuild } from "../golem/roster.ts";
import { unitDefinition } from "../units.ts";
import type { Intent, Mind } from "../mind.ts";
import { mulberry32 } from "../rng.ts";
import { canSee, cellKey, distance, explorationGoal, findPath, reveal, walkable,
  type DungeonMap, type Point } from "./map.ts";
import { generateLevel } from "./level.ts";
import { composeIntent, DungeonCommands, neutralIntent, screenMovement } from "./commands.ts";
import { resolveDungeonLocomotion } from "./locomotion.ts";
import { buildDungeonWorld } from "./world.ts";
import { CAMERA_PITCH } from "./camera.ts";

export interface DungeonActor {
  id: string; name: string; body: Golem; combat: Combat; policy: Mind; intent: Intent;
  target: DungeonActor | null; home: Point; lastSeen: Point | null; alertedUntil: number;
  route: Point[]; goal: Point | null; nextPlan: number; radius: number;
  /** Where the body last made progress along its route, and when. */
  progress: { at: Point; since: number };
  meshes: { mesh: AbstractMesh; visible: boolean }[]; stopped: boolean;
  /** Every physics body the golem was built with, and whether they are held asleep (`DORMANCY`). */
  bodies: PhysicsBody[]; dormant: boolean;
}
/**
 * A body with a route that has not moved 50 mm, in any direction, in half a second has the route
 * replanned from where it is. The slowest carrier in `src/golem/config.ts` (the multileg: 0.8 m/s
 * backing, 6.5 m/s2) covers 50 mm from rest in about 0.13 s, and in about 0.15 s at the lowest
 * movement stat (x0.75, which scales both; size leaves acceleration alone), so a body that has not
 * is usually stuck -- typically on a corner its leg cleared from where it was planned. Anything
 * else that holds a body still, a knockdown or another actor in the way, replans it too, which is
 * harmless: a replan that finds no route keeps the one it had, and the step to the cell's middle in
 * `follow` is taken only by a body standing on rock's clearance. Node headless harness: seed 2's
 * explorer sat on a room corner for 93 s without this, and needed exactly one replan with it.
 */
const STALL = { seconds: 0.5, metres: 0.05 } as const;
/** How far an enemy sees the hero along a clear line (`canSee`). */
const SIGHT_METRES = 14;
/**
 * An enemy standing at home, unalerted and far from everybody awake, is taken out of the simulation:
 * its bodies are held asleep in Havok, and the run neither observes, decides for nor drives it, which
 * pauses that one body where it stands. It wakes before it could see the hero -- `wakeMetres` is
 * beyond `SIGHT_METRES` -- and before a body walking up to it could reach it (`companyMetres`, about
 * two arm reaches). The gap up to `sleepMetres` keeps a body on the boundary from toggling, and
 * nothing sleeps in the first second, while bodies built in their bind pose settle onto their feet.
 *
 * What it buys, per 4.17 ms physics substep (Node headless harness, whole runs on generated levels
 * 1-13 with 8 enemies and the hero exploring alone, each against the same run with this switched
 * off): 0.58-2.98 ms against 1.30-3.90, a median of 0.57 of the cost. The owner's Firefox took
 * 2.3-3.3 ms a substep before this, over half of real time, and a page that far behind falls further
 * behind. Four of those runs end identically; the rest part in a fight, by a tenth of a micrometre at
 * first, once a woken enemy joins it -- as they do when far enemies are merely nudged by 1e-4 N s.
 */
const DORMANCY = { sleepMetres: SIGHT_METRES + 4, wakeMetres: SIGHT_METRES + 2, companyMetres: 4,
  homeMetres: 0.5, settleSeconds: 1 } as const;
const direction = (from: Point, to: Point): Point => {
  const d = Math.max(0.001, distance(from, to)); return { x: (to.x - from.x) / d, z: (to.z - from.z) / d };
};

export class DungeonRun {
  readonly map: DungeonMap;
  readonly commands = new DungeonCommands();
  readonly world: ReturnType<typeof buildDungeonWorld>;
  readonly actors: DungeonActor[] = [];
  readonly hero: DungeonActor;
  readonly explored = new Set<number>();
  visible = new Set<number>();
  clock = 0;
  status: "playing" | "won" | "dead" = "playing";
  notice = "Find the exit. Click to move; drag to keep moving through danger.";
  /** The camera's elevation, which decides how much ground a wall hides in front of the hero. The page sets it. */
  pitch = CAMERA_PITCH;
  private nextPerception = 0;
  private readonly plugin: HavokPlugin;
  /** The bodies of each sleeper whose transform Babylon was copying back from Havok every step. */
  private readonly unsynced = new Map<DungeonActor, PhysicsBody[]>();
  private commandRevision = -1;
  private dodgeUntil = 0;
  private dodgeCooldown = 0;
  private dodgeStart: Point = { x: 0, z: 0 };
  private dodgeVector: Point = { x: 0, z: 0 };

  constructor(scene: Scene, seed: number, heroBuild = "default", visuals = true, layout?: DungeonMap, heroSetup?: GolemSetup) {
    this.map = layout ?? generateLevel(seed).map;
    this.world = buildDungeonWorld(scene, this.map, visuals);
    this.plugin = scene.getPhysicsEngine()!.getPhysicsPlugin() as HavokPlugin;
    const definition = unitDefinition("golem"), random = mulberry32(seed ^ 0x9e3779b9);
    const create = (id: string, buildName: string, at: Point, side: "left" | "right") => {
      const build = namedBuild(buildName);
      if (!build) throw new Error(`Unknown dungeon golem: ${buildName}`);
      const setup = id === "hero" && heroSetup ? heroSetup : build.setup;
      const policy = definition.createPolicy!(FAMILY_POLICY[bodyFamily(setup)], Math.floor(random() * 0xffffffff));
      let intent = neutralIntent();
      const source: Mind = { name: "dungeon", decide: () => intent };
      const priorMeshes = new Set(scene.meshes);
      const body = new Golem(scene, { actorId: id, side, origin: new Vector3(at.x, 0, at.z), facing: side === "left" ? 0 : Math.PI,
        setup, mind: source, controlPolicies: definition.driverOptions, locomotionWorld: this.world.registry });
      const combat = new Combat(side, body.strikers);
      const made = scene.meshes.filter(mesh => !priorMeshes.has(mesh));
      const actor: DungeonActor = { id, name: buildName, body, combat, policy,
        get intent() { return intent; }, set intent(value) { intent = value; }, target: null,
        home: { ...at }, lastSeen: null, alertedUntil: 0, route: [], goal: null, nextPlan: 0,
        progress: { at: { ...at }, since: 0 },
        radius: body.locomotion.footprint.radiusM,
        meshes: made.map(mesh => ({ mesh, visible: mesh.isVisible })), stopped: false,
        bodies: made.flatMap(mesh => mesh.physicsBody ? [mesh.physicsBody] : []), dormant: false };
      this.actors.push(actor); return actor;
    };
    this.hero = create("hero", heroBuild, this.map.start, "left");
    this.map.spawns.forEach((at, i) => create(`enemy-${i}`, NAMED_BUILDS[Math.floor(random() * NAMED_BUILDS.length)].name, at, "right"));
    // One lookup per body, independent of which enemy the player has selected.
    const owners = new Map(this.actors.flatMap(actor => actor.body.limbs.map(limb => [limb.part.body, actor] as const)));
    for (const actor of this.actors) actor.combat.attachResolver(body => {
      const hit = owners.get(body);
      return hit && hit !== actor && hit.body.side !== actor.body.side && hit.body.alive ? hit.body : null;
    });
    this.visible = reveal(this.map, this.hero.home, this.explored);
  }

  private follow(actor: DungeonActor, goal: Point): Point {
    const at = actor.body.feetPosition();
    if (!actor.route.length || distance(at, actor.progress.at) > STALL.metres) actor.progress = { at: { x: at.x, z: at.z }, since: this.clock };
    else if (this.clock - actor.progress.since > STALL.seconds) {
      let route = findPath(this.map, at, goal, actor.radius);
      // A body wedged on the clearance arc of a rock corner is handed the same leg again: clear at
      // `clearSegment`'s 0.2 m samples, blocked within a millimetre. The middle of its own cell is
      // away from that corner, so it goes there first and plans on from it. Only a body standing on
      // rock's clearance does: one held up by another body, a mid-fight stall, keeps its leg.
      const middle = { x: Math.round(at.x), z: Math.round(at.z) };
      if (route.length && distance(route[0], actor.route[0]) < 0.01 && !walkable(this.map, at, actor.radius + 0.02) &&
        distance(at, middle) > 0.3 && walkable(this.map, middle, actor.radius)) route = [middle, ...findPath(this.map, middle, goal, actor.radius)];
      if (route.length) { actor.goal = { x: goal.x, z: goal.z }; actor.route = route; actor.nextPlan = this.clock + 0.5; }
      actor.progress = { at: { x: at.x, z: at.z }, since: this.clock };
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
    const heroAt = this.hero.body.feetPosition();
    this.visible = reveal(this.map, heroAt, this.explored);
    for (const actor of this.actors.slice(1)) {
      if (!actor.body.alive) { actor.target = null; continue; }
      if (canSee(this.map, actor.body.feetPosition(), heroAt, SIGHT_METRES)) {
        actor.lastSeen = { x: heroAt.x, z: heroAt.z }; actor.alertedUntil = this.clock + 7;
        actor.target = this.hero;
      } else actor.target = null;
    }
    const order = this.commands.order;
    if (order.kind === "lock") {
      const locked = this.actors.find(a => a.id === order.target);
      if (locked?.body.alive && canSee(this.map, heroAt, locked.body.feetPosition(), 12)) {
        const position = locked.body.feetPosition();
        this.hero.target = locked; this.hero.lastSeen = { x: position.x, z: position.z }; return;
      }
      // Pursue the last observed position, never a hidden moving actor.
      if (locked?.body.alive && this.hero.lastSeen && distance(heroAt, this.hero.lastSeen) > 0.5 &&
        findPath(this.map, heroAt, this.hero.lastSeen, this.hero.radius).length) { this.hero.target = null; return; }
      this.commands.clear(); this.hero.lastSeen = null;
    }
    const look = this.commands.cursor ? direction(heroAt, this.commands.cursor) : null;
    const candidates = this.actors.slice(1).filter(a => a.body.alive && canSee(this.map, heroAt, a.body.feetPosition(), 8))
      .filter(a => {
        if (!this.commands.mode.facing || !look) return true;
        const toward = direction(heroAt, a.body.feetPosition()); return toward.x * look.x + toward.z * look.z > 0.3;
      }).sort((a, b) => distance(a.body.feetPosition(), heroAt) - distance(b.body.feetPosition(), heroAt));
    const current = this.hero.target;
    this.hero.target = current && candidates.includes(current) && distance(current.body.feetPosition(), heroAt) < 5 ? current : candidates[0] ?? null;
  }

  private heroMovement(): Point | null {
    const { mode, order } = this.commands, actor = this.hero, at = actor.body.feetPosition();
    if (mode.keyboard) return screenMovement(this.commands.right, this.commands.up);
    if (order.kind === "force") {
      while (order.points.length && distance(at, order.points[0]) < 0.4) { order.points.shift(); actor.goal = null; }
      if (!order.points.length) { if (!order.drawing) this.commands.order = { kind: "idle" }; return { x: 0, z: 0 }; }
      const move = this.follow(actor, order.points[0]);
      if (!actor.route.length && distance(at, order.points[0]) >= 0.4) this.notice = "That path is blocked. Draw a new route on the floor.";
      return move;
    }
    if (actor.target) {
      const targetAt = actor.target.body.feetPosition();
      if (distance(at, targetAt) > 3.5) return this.follow(actor, targetAt);
      return null; // Combat policy owns close-range positioning unless the player owns movement.
    }
    if (order.kind === "lock" && actor.lastSeen) return this.follow(actor, actor.lastSeen);
    if (order.kind === "attack-move") {
      if (distance(at, order.destination) < 0.4) { this.commands.order = { kind: "idle" }; return { x: 0, z: 0 }; }
      const move = this.follow(actor, order.destination);
      if (!actor.route.length) this.notice = "Destination unreachable. Choose another floor point.";
      return move;
    }
    if (mode.facing) {
      if (!actor.goal || distance(at, actor.goal) < 0.5 || !actor.route.length) {
        actor.goal = null;
        const goal = explorationGoal(this.map, at, this.explored, actor.radius);
        if (goal) return this.follow(actor, goal);
        return { x: 0, z: 0 };
      }
      return this.follow(actor, actor.goal);
    }
    return { x: 0, z: 0 };
  }

  private evade(move: Point): Point {
    if (Math.hypot(move.x, move.z) < 0.1) return move;
    const at = this.hero.body.feetPosition();
    if (this.clock >= this.dodgeCooldown && this.clock > 0.6) {
      const danger = this.actors.slice(1).some(a => a.body.alive && distance(at, a.body.feetPosition()) < 4 &&
        Object.values(a.body.view.self.hands).some(hand => {
          if (hand.lost || hand.tipSpeed < 3) return false;
          const x = hand.tip.x - at.x, z = hand.tip.z - at.z;
          const vx = hand.tipVelocity.x, vz = hand.tipVelocity.z;
          const t = Math.max(0, Math.min(0.2, -(x * vx + z * vz) / Math.max(0.01, vx * vx + vz * vz)));
          return t > 0 && Math.hypot(x + vx * t, z + vz * t) < this.hero.radius + 0.3;
        }));
      if (danger) for (const sign of [1, -1]) {
        const side = { x: -move.z * sign, z: move.x * sign };
        if (!walkable(this.map, { x: at.x + side.x * 0.35, z: at.z + side.z * 0.35 }, this.hero.radius, true)) continue;
        this.dodgeVector = side; this.dodgeStart = { x: at.x, z: at.z };
        this.dodgeUntil = this.clock + 0.25; this.dodgeCooldown = this.clock + 1; break;
      }
    }
    if (this.clock >= this.dodgeUntil || distance(at, this.dodgeStart) >= 0.35) return move;
    const x = move.x + this.dodgeVector.x * 0.65, z = move.z + this.dodgeVector.z * 0.65;
    const length = Math.max(1, Math.hypot(x, z)); return { x: x / length, z: z / length };
  }

  /** Paths route around walls; local steering lets a route pass an occupied floor point. */
  private avoidCrowd(actor: DungeonActor, move: Point): Point {
    if (Math.hypot(move.x, move.z) < 0.1) return move;
    const at = actor.body.feetPosition();
    const obstruction = this.actors.filter(other => other !== actor && other.body.alive).map(other => {
      const p = other.body.feetPosition(), dx = p.x - at.x, dz = p.z - at.z;
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
        distance(endpoint, obstruction.other.body.feetPosition()) > Math.hypot(obstruction.dx, obstruction.dz) - 0.05) return candidate;
    }
    return move;
  }

  /**
   * Puts to sleep, and wakes, the enemies nobody is near (`DORMANCY`). Company is a body going
   * somewhere: the hero, or an enemy that is not resting at home. Two resting neighbours are none to
   * each other, so a pair sleeps together rather than holding each other awake, and one that arrives
   * home beside a sleeper does not wake it and fall asleep in the same step, over and over.
   */
  private rest(): void {
    if (this.clock < DORMANCY.settleSeconds) return;
    const resting = (actor: DungeonActor) => {
      const state = actor.body.locomotion.state;
      return actor !== this.hero && !actor.target && actor.alertedUntil <= this.clock && state !== "fallen" &&
        state !== "rising" && distance(actor.body.feetPosition(), actor.home) < DORMANCY.homeMetres;
    };
    const company = this.actors.filter(a => a.body.alive && !a.dormant && !resting(a)).map(a => a.body.feetPosition());
    const near = (at: Point, metres: number) => company.some(other => distance(other, at) < metres);
    const heroAt = this.hero.body.feetPosition();
    for (const actor of this.actors) {
      if (actor === this.hero || !actor.body.alive) continue;
      const at = actor.body.feetPosition(), fromHero = distance(at, heroAt);
      if (actor.dormant) {
        if (fromHero < DORMANCY.wakeMetres || near(at, DORMANCY.companyMetres)) this.setDormant(actor, false);
      } else if (fromHero > DORMANCY.sleepMetres && resting(actor) && !near(at, DORMANCY.companyMetres + 1)) this.setDormant(actor, true);
    }
  }

  /**
   * A body held asleep cannot move, and Babylon would still copy its transform back from Havok on every step. So
   * its sync is off while it sleeps, and back to what it was on waking. Measured in the Node headless harness, with
   * most enemies asleep, that cut 12-28 % from each substep on four generated levels, and runs on levels 1-6 ended
   * exactly as with the sync left on.
   */
  private setDormant(actor: DungeonActor, dormant: boolean): void {
    // A second call would overwrite the list of bodies to restore with an empty one.
    if (actor.dormant === dormant) return;
    actor.dormant = dormant;
    const mode = dormant ? PhysicsActivationControl.ALWAYS_INACTIVE : PhysicsActivationControl.SIMULATION_CONTROLLED;
    for (const body of actor.bodies) this.plugin.setActivationControl(body, mode);
    if (dormant) {
      const synced = actor.bodies.filter(body => !body.disableSync);
      for (const body of synced) body.disableSync = true;
      this.unsynced.set(actor, synced);
    } else {
      for (const body of this.unsynced.get(actor) ?? []) body.disableSync = false;
      this.unsynced.delete(actor);
    }
  }

  step(dt: number): void {
    if (this.status !== "playing") return;
    this.clock += dt;
    if (this.commands.revision !== this.commandRevision) {
      this.commandRevision = this.commands.revision; this.hero.route = []; this.hero.goal = null;
      this.hero.target = null; this.hero.lastSeen = null; this.nextPerception = 0;
      this.notice = this.commands.order.kind === "force" ? "Force move — following your drawn route" : "Find the illuminated exit.";
    }
    this.world.openNearby(this.actors.filter(a => a.body.alive).map(a => a.body.feetPosition()));
    this.rest();
    if (this.clock >= this.nextPerception) { this.perceive(); this.nextPerception = this.clock + 0.2; }
    const live = this.actors.filter(actor => !actor.dormant);
    // Observe everybody before deciding or driving anybody. No fake opponent for exploration.
    for (const actor of live) actor.body.observe(actor.target?.body ?? null, this.clock);
    // What each body's neighbours press on it with, before any boundary reads it. The dungeon's group
    // resolver has no pair push (`resolvePhysicalSupportedPair` has), so a body walked into here
    // is stopped rather than shoved; an arm's press reaches it all the same.
    const sources = live.map((actor) => actor.body.pressSource());
    live.forEach((actor, i) => actor.body.sampleContactPress(sources.filter((_, j) => j !== i)));
    for (const actor of live) actor.body.locomotion.beginControlStep();
    for (const actor of live) {
      if (!actor.body.alive) {
        if (!actor.stopped) { actor.combat.stop(); actor.body.stopFighting(); actor.stopped = true; }
        continue;
      }
      const at = actor.body.feetPosition();
      const base = actor.target?.body.alive ? actor.policy.decide(actor.body.view, dt) : neutralIntent();
      let move: Point | null, look: Point | null = null;
      if (actor === this.hero) {
        move = this.heroMovement();
        if (move) move = this.evade(move);
        if (this.commands.mode.facing) look = this.commands.cursor
          ? { x: this.commands.cursor.x - at.x, z: this.commands.cursor.z - at.z }
          : { x: Math.sin(actor.body.view.self.facing), z: Math.cos(actor.body.view.self.facing) };
      } else if (actor.target && distance(at, actor.target.body.feetPosition()) <= 3.5) move = null;
      else {
        const goal = actor.target?.body.feetPosition() ?? (actor.alertedUntil > this.clock ? actor.lastSeen : actor.home);
        move = goal && distance(at, goal) > 0.4 ? this.follow(actor, goal) : { x: 0, z: 0 };
      }
      if (move && !(actor === this.hero && this.commands.mode.keyboard)) move = this.avoidCrowd(actor, move);
      if (!look && move && Math.hypot(move.x, move.z) > 0.1 && (!actor.target || distance(at, actor.target.body.feetPosition()) > 3.5)) look = move;
      if (actor === this.hero && this.commands.mode.facing && this.commands.cursor && look && Math.hypot(look.x, look.z) <= 0.08)
        look = { x: Math.sin(actor.body.view.self.facing), z: Math.cos(actor.body.view.self.facing) };
      actor.intent = composeIntent(base, actor.body.view.self.facing, move, look);
      actor.body.control.driver.step(dt);
      actor.combat.advance(dt);
    }
    // A sleeper's combat clock keeps time: a limb's hit cooldown is stamped with its attacker's clock
    // and read against the next attacker's, so every clock must read the same.
    for (const actor of this.actors) if (actor.dormant) actor.combat.advance(dt);
    resolveDungeonLocomotion(live.map(a => a.body.locomotion), dt);
    for (const actor of live) actor.body.afterLocomotion(dt);
    if (!this.hero.body.alive) this.status = "dead";
    else if (distance(this.hero.body.feetPosition(), this.map.exit) < 1.1) this.status = "won";
  }

  present(): void {
    this.world.present(this.visible, this.explored, this.hero.body.feetPosition(), this.pitch);
    for (const actor of this.actors) {
      const shown = actor === this.hero || this.visible.has(cellKey(this.map, actor.body.feetPosition()));
      for (const { mesh, visible } of actor.meshes) mesh.isVisible = shown && visible;
    }
  }

  targetAt(mesh: AbstractMesh): DungeonActor | null {
    return this.actors.find(a => a !== this.hero && a.body.alive && a.body.owns(mesh) &&
      this.visible.has(cellKey(this.map, a.body.feetPosition()))) ?? null;
  }

  dispose(): void { for (const a of this.actors) a.combat.dispose(); for (const a of this.actors) a.body.dispose(); this.world.dispose(); }
}
