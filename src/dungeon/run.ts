import type { GolemSetup } from "../bout.ts";
import type { Scene } from "@babylonjs/core/scene.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import { Combat } from "../combat.ts";
import { Golem } from "../golem/golem.ts";
import { hasAnatomicalArm } from "../golem/humanoid/presets.ts";
import { NAMED_BUILDS, namedBuild } from "../golem/roster.ts";
import { unitDefinition } from "../units.ts";
import type { Intent, Mind } from "../mind.ts";
import { mulberry32 } from "../rng.ts";
import { canSee, cellKey, distance, explorationGoal, findPath, generateDungeon, reveal, walkable,
  type DungeonMap, type Point } from "./map.ts";
import { composeIntent, DungeonCommands, neutralIntent, screenMovement } from "./commands.ts";
import { resolveDungeonLocomotion } from "./locomotion.ts";
import { buildDungeonWorld } from "./world.ts";

export interface DungeonActor {
  id: string; name: string; body: Golem; combat: Combat; policy: Mind; intent: Intent;
  target: DungeonActor | null; home: Point; lastSeen: Point | null; alertedUntil: number;
  route: Point[]; goal: Point | null; nextPlan: number; radius: number;
  meshes: { mesh: AbstractMesh; visible: boolean }[]; stopped: boolean;
}
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
  private nextPerception = 0;
  private commandRevision = -1;
  private dodgeUntil = 0;
  private dodgeCooldown = 0;
  private dodgeStart: Point = { x: 0, z: 0 };
  private dodgeVector: Point = { x: 0, z: 0 };

  constructor(scene: Scene, seed: number, heroBuild = "default", visuals = true, layout?: DungeonMap, heroSetup?: GolemSetup) {
    this.map = layout ?? generateDungeon(seed);
    this.world = buildDungeonWorld(scene, this.map, visuals);
    const definition = unitDefinition("golem"), random = mulberry32(seed ^ 0x9e3779b9);
    const create = (id: string, buildName: string, at: Point, side: "left" | "right") => {
      const build = namedBuild(buildName);
      if (!build) throw new Error(`Unknown dungeon golem: ${buildName}`);
      const setup = id === "hero" && heroSetup ? heroSetup : build.setup;
      const policy = definition.createPolicy!(hasAnatomicalArm(setup) ? "humanoid-duelist" : "golem-duelist", Math.floor(random() * 0xffffffff));
      let intent = neutralIntent();
      const source: Mind = { name: "dungeon", decide: () => intent };
      const priorMeshes = new Set(scene.meshes);
      const body = new Golem(scene, { actorId: id, side, origin: new Vector3(at.x, 0, at.z), facing: side === "left" ? 0 : Math.PI,
        setup, mind: source, controlPolicies: definition.driverOptions, locomotionWorld: this.world.registry });
      const combat = new Combat(side, body.strikers);
      const actor: DungeonActor = { id, name: buildName, body, combat, policy,
        get intent() { return intent; }, set intent(value) { intent = value; }, target: null,
        home: { ...at }, lastSeen: null, alertedUntil: 0, route: [], goal: null, nextPlan: 0,
        radius: body.locomotion.footprint.radiusM,
        meshes: scene.meshes.filter(mesh => !priorMeshes.has(mesh)).map(mesh => ({ mesh, visible: mesh.isVisible })), stopped: false };
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
      if (canSee(this.map, actor.body.feetPosition(), heroAt, 14)) {
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

  step(dt: number): void {
    if (this.status !== "playing") return;
    this.clock += dt;
    if (this.commands.revision !== this.commandRevision) {
      this.commandRevision = this.commands.revision; this.hero.route = []; this.hero.goal = null;
      this.hero.target = null; this.hero.lastSeen = null; this.nextPerception = 0;
      this.notice = this.commands.order.kind === "force" ? "Force move — following your drawn route" : "Find the illuminated exit.";
    }
    this.world.openNearby(this.actors.filter(a => a.body.alive).map(a => a.body.feetPosition()));
    if (this.clock >= this.nextPerception) { this.perceive(); this.nextPerception = this.clock + 0.2; }
    // Observe everybody before deciding or driving anybody. No fake opponent for exploration.
    for (const actor of this.actors) actor.body.observe(actor.target?.body ?? null, this.clock);
    for (const actor of this.actors) actor.body.locomotion.beginControlStep();
    for (const actor of this.actors) {
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
    resolveDungeonLocomotion(this.actors.map(a => a.body.locomotion), dt);
    for (const actor of this.actors) actor.body.afterLocomotion(dt);
    if (!this.hero.body.alive) this.status = "dead";
    else if (distance(this.hero.body.feetPosition(), this.map.exit) < 1.1) this.status = "won";
  }

  present(): void {
    this.world.present(this.visible, this.explored, this.hero.body.feetPosition());
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
