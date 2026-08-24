import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector.js";
import { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody.js";
import { PhysicsShapeBox } from "@babylonjs/core/Physics/v2/physicsShape.js";
import { PhysicsMotionType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import type { IPhysicsCollisionEvent } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import { PhysicsEventType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";

import { CONFIG } from "./config.ts";
import { COLLIDES, LAYER } from "./physics.ts";
import type { HandName, Striker } from "./hands.ts";
import { objectMaterialsFor, type WeaponMaterials } from "./weapon.ts";
import { applyObjectSurface, disposeCarriedRoot } from "./object-surfaces.ts";

/**
 * Arrows, and the quiver that owns them.
 *
 * The first thing in this prototype that hurts somebody it is not touching, and
 * the first that exists in a number that is not fixed at build time -- which is
 * the whole of why it is a file rather than a kind. Every other body in the
 * program is created in a constructor and lives until the bout is disposed.
 *
 * **Nothing here is created while a bout is running.** A quiver builds all of
 * its arrows with the fighter and parks them, and `loose` wakes one. That was a
 * choice against the obvious alternative -- build a body per shot and dispose it
 * on cull -- and it was taken on three measurements rather than on taste:
 *
 * - A pool is what makes the acceptance check true *by construction*. `scene.meshes`
 *   cannot drift across a hundred shots if a hundred shots create nothing.
 * - `Combat` goes on binding its observers once, in its constructor, exactly as
 *   it does for a blade. A body that appears mid-bout would have needed a
 *   `watch`/`unwatch` pair called at 240 Hz, and an arrow that outlived its
 *   observer would be an arrow that silently stops scoring.
 * - It is free. Twenty-four arrows parked STATIC on membership mask 0 measured
 *   **-0.0015 ms/frame** against a 0.0555 ms baseline -- below the noise of the
 *   bench that took it. Parked the *naive* way, DYNAMIC on mask 0, the same
 *   twenty-four cost **+0.0726 ms/frame**, because a body that collides with
 *   nothing still falls: they were 3.5 km below the arena and accelerating.
 *
 * **Teleporting a dynamic body is not `setTargetTransform`.** That is the target
 * of a *keyframed* body, and against a DYNAMIC one it does nothing at all --
 * six shots nominally from the same origin ended 12 m apart, because the body
 * carried on from wherever the last shot left it while `mesh.position` was being
 * overwritten from it every step. The recipe is to write the transform node and
 * set `disablePreStep = false`, which is `PhysicsPrestepType.TELEPORT` under a
 * boolean's name. Measured that way, a hundred launches landed at the same place
 * to the last bit -- spread 0.
 */

/** Everything a quiver needs to know about whose arrows these are. */
export interface QuiverOptions {
  hand: HandName;
  /** Prefix for every node, so four quivers in one scene are tellable apart. */
  name: string;
  /** The side's arrow layer, from `layersFor`. */
  layer: number;
  collidesWith: number;
}

/**
 * Where a parked arrow waits.
 *
 * Well below the arena rather than at the origin, so that a bug which leaves one
 * parked-but-collidable is visible as an arrow under the floor rather than
 * invisible as an arrow inside somebody's shin.
 */
const PARK = new Vector3(0, -60, 0);
/** Enough line to follow at speed, without turning the shot into an opaque beam. */
const TRACE_VISIBILITY = 0.62;

/**
 * One arrow.
 *
 * It satisfies `combat.ts`'s `Striking` structurally and by intention: that
 * interface was written from the six members this file can answer, rather than
 * this file being bent to look like a `Weapon`. Two of the six mean nothing for
 * an arrow -- `edgeDirection` is a shaft with no edge, `tipPosition` is a head
 * that `scoring.ts` never asks about, because an arrow's bite is `how: "point"`
 * and has no tip zone. They are answered anyway because `HitReport` keeps them,
 * and a blow that scored nothing is unarguable until you can see it.
 */
export class Arrow {
  readonly kind: Striker = "arrow";
  readonly hand: HandName;
  readonly root: TransformNode;
  readonly body: PhysicsBody;
  /**
   * One box, and **not** a `PhysicsShapeContainer`, which is a correctness
   * requirement rather than a simplification.
   *
   * Havok filters on the *leaf* shapes and ignores a container's own filter
   * entirely: measured, a container masked down to zero collides with everything
   * exactly as before, and reading its `filterMembershipMask` back hands you
   * garbage. An arrow is re-layered twice per shot and would have spent the
   * whole bout colliding with the archer who loosed it. `.review/mask-probe.mjs`
   * is the six-case drop that establishes it, and `weapon.ts` had the same fault
   * for its whole life -- see `Weapon.finish`.
   */
  readonly shape: PhysicsShapeBox;

  /**
   * One pooled render-only tube. It is advanced from the same fixed control
   * step as the arrow, so it owns no render observer and cannot outlive a
   * recycled shot. Its points are world-space because the projectile root is
   * moving while the history deliberately is not.
   */
  readonly traceRoot: TransformNode;
  readonly trail: Mesh;
  readonly tracePoints: Vector3[];

  /** Whether it is in the world at all, as opposed to parked. */
  live = false;
  /** Whether it has hit something and stopped being a projectile. */
  struck = false;

  /**
   * `Striking.spent`: an arrow that has hit something is not a weapon any more.
   *
   * The alias exists so that `Combat` can ask one question of a blade and of an
   * arrow. Without it a spent shaft resting against a moving limb is billed
   * every `hitCooldown` for as long as it lies there, and the limb drags it past
   * `minArrowSpeed` often enough to matter: measured, it turned 62 "hits"
   * averaging 2.9 damage into what should have been a handful averaging forty.
   */
  get spent(): boolean {
    return this.struck;
  }
  /** Seconds since it was loosed, or since it struck. */
  age = 0;

  /**
   * Set on the step it is loosed and cleared on the next one. See `Quiver.update`
   * for why the order of those two matters more than it looks.
   */
  private teleporting = false;
  /**
   * It touched something. Promoted to `struck` by `step`, one control step
   * later, and **that delay is the whole of whether an arrow ever scores**.
   *
   * `Combat` refuses to score a `spent` striker, and `spent` is `struck`. Both
   * this class and `Combat` watch the same body's collision observable, and this
   * one is added first -- in the constructor, before the fighter exists to be
   * handed to a `Combat` -- so setting `struck` inside the callback marks the
   * arrow spent *before* the watcher that scores it has been called. Measured:
   * every arrow scored nothing, 0 of 288 over twelve bouts, with no error
   * anywhere and a flight that looked perfectly healthy.
   *
   * Promoting it a step later means the contact that caused it is scored and
   * everything after it is not, without either watcher needing to know the other
   * exists or which order they were added in.
   */
  private touched = false;
  /** The one body entitled to score the contact that made this arrow spent. */
  private firstContact: PhysicsBody | null = null;
  /** Set by the contact callback, applied by `step`. See `onContact`. */
  private planting = false;

  private readonly collidesWith: number;
  private readonly layer: number;

  /**
   * How fast it was going on the last control step before it hit anything.
   *
   * **This is what a hit is scored from**, and the difference is not small. See
   * `velocityAt`.
   */
  private readonly arrival = new Vector3();

  private readonly scratch = {
    dir: new Vector3(),
    edge: new Vector3(),
    tip: new Vector3(),
    rel: new Vector3(),
    vel: new Vector3(),
  };

  constructor(scene: Scene, name: string, opts: QuiverOptions, materials: WeaponMaterials) {
    this.hand = opts.hand;
    const A = CONFIG.arrow;
    this.layer = opts.layer;
    this.collidesWith = opts.collidesWith;

    this.root = new TransformNode(name, scene);
    this.root.position.copyFrom(PARK);
    this.root.rotationQuaternion = Quaternion.Identity();

    // Same local frame as every weapon: +Y along it, from nock toward head. An
    // arrow is the one thing here for which that is the *only* axis that means
    // anything.
    const shaft = MeshBuilder.CreateCylinder(
      `${name}.shaft`,
      { height: A.length, diameter: A.shaftDiameter, tessellation: 6 },
      scene,
    );
    applyObjectSurface(shaft, "arrow.shaft", objectMaterialsFor(materials));
    shaft.parent = this.root;

    const head = MeshBuilder.CreateCylinder(
      `${name}.head`,
      {
        height: A.headLength,
        diameterBottom: A.shaftDiameter * 2.4,
        diameterTop: 0,
        tessellation: 6,
      },
      scene,
    );
    head.position.set(0, A.length / 2, 0);
    head.parent = this.root;

    const fletch = MeshBuilder.CreateBox(
      `${name}.fletch`,
      { width: A.shaftDiameter * 4, height: A.fletchLength, depth: A.shaftDiameter * 0.6 },
      scene,
    );
    fletch.position.set(0, -A.length / 2 + A.fletchLength * 0.7, 0);
    applyObjectSurface(fletch, "arrow.fletch", objectMaterialsFor(materials));
    fletch.parent = this.root;

    applyObjectSurface(head, "arrow.head", objectMaterialsFor(materials));

    this.traceRoot = new TransformNode(`${name}.trace-root`, scene);
    const traceSamples = Math.ceil(A.visual.trailSeconds * CONFIG.world.physicsHz) + 1;
    this.tracePoints = Array.from({ length: traceSamples }, () => PARK.clone());
    this.trail = MeshBuilder.CreateTube(
      `${name}.trace`,
      {
        path: this.tracePoints,
        radius: A.visual.trailDiameter / 2,
        tessellation: 5,
        cap: 0,
        updatable: true,
      },
      scene,
    );
    applyObjectSurface(this.trail, "arrow.trace", objectMaterialsFor(materials));
    this.trail.isPickable = false;
    this.trail.receiveShadows = false;
    this.trail.parent = this.traceRoot;

    // One box for the whole shaft. A cylinder would be more honest about the
    // shape and less honest about what matters: what an arrow needs from the
    // solver is a long thin thing that reports the contact, and the head is 9 mm
    // across either way.
    this.shape = new PhysicsShapeBox(
      Vector3.Zero(),
      Quaternion.Identity(),
      new Vector3(A.shaftDiameter, A.length, A.shaftDiameter),
      scene,
    );
    this.shape.filterMembershipMask = 0;
    this.shape.filterCollideMask = 0;

    this.body = new PhysicsBody(this.root, PhysicsMotionType.DYNAMIC, false, scene);
    this.body.shape = this.shape;
    this.body.setMassProperties({ mass: A.mass });
    this.body.setCollisionCallbackEnabled(true);
    this.body.getCollisionObservable().add((event) => this.onContact(event));
    this.park();
  }

  /**
   * Out of the world: static, on no layer, and well below the floor.
   *
   * STATIC is the load-bearing half and mask 0 is not enough on its own. A body
   * that collides with nothing is still integrated, so a parked-but-dynamic
   * arrow falls forever -- 24 of them measured at +0.0726 ms/frame purely for
   * accelerating away from the arena.
   */
  park(): void {
    this.live = false;
    this.struck = false;
    this.touched = false;
    this.firstContact = null;
    this.planting = false;
    this.age = 0;
    this.shape.filterMembershipMask = 0;
    this.shape.filterCollideMask = 0;
    this.body.setLinearVelocity(Vector3.Zero());
    this.body.setAngularVelocity(Vector3.Zero());
    this.body.setMotionType(PhysicsMotionType.STATIC);
    this.root.position.copyFrom(PARK);
    this.root.rotationQuaternion?.copyFromFloats(0, 0, 0, 1);
    this.resetTrace(PARK);
    this.trail.visibility = 0;
    this.traceRoot.setEnabled(false);
    this.teleport();
  }

  /**
   * Into the world, from `from`, pointing and travelling along `along`.
   *
   * `along` is expected to be a unit vector -- it is the bow's own +Y, which
   * `Weapon.bladeDirectionToRef` hands back normalised -- and it is both the
   * heading and the attitude, because an arrow that flies sideways to the way it
   * is pointing is one that has already gone wrong.
   */
  loose(from: Vector3, along: Vector3, speed: number): void {
    this.live = true;
    this.struck = false;
    this.touched = false;
    this.firstContact = null;
    this.planting = false;
    this.age = 0;
    this.shape.filterMembershipMask = this.layer;
    this.shape.filterCollideMask = this.collidesWith;
    this.body.setMotionType(PhysicsMotionType.DYNAMIC);
    this.root.position.copyFrom(from);
    if (this.root.rotationQuaternion) {
      pointAlong(along, this.root.rotationQuaternion);
    }
    this.teleport();
    this.resetTrace(from);
    this.trail.visibility = TRACE_VISIBILITY;
    this.traceRoot.setEnabled(true);
    this.body.setLinearVelocity(this.scratch.dir.copyFrom(along).scaleInPlace(speed));
    this.body.setAngularVelocity(Vector3.Zero());
    // Seeded here as well as in `step`, so an arrow that finds something on the
    // very first substep is still scored at the speed it left the string.
    this.arrival.copyFrom(this.scratch.dir);
  }

  /** Ask the plugin to take the node's transform, for exactly one step. */
  private teleport(): void {
    this.body.disablePreStep = false;
    this.teleporting = true;
  }

  /**
   * It hit something.
   *
   * The *only* thing that happens here is a flag, and that restraint is
   * deliberate: this runs from inside Havok's contact dispatch, and changing a
   * body's motion type from there is asking the solver to rebuild a list it is
   * currently walking. `update` does the work one step later, which is soon
   * enough for something that has already stopped.
   *
   * Note what does **not** need doing: nothing marks the arrow as spent for
   * scoring. `combat.minArrowSpeed` is 8 m/s, `stickDamping` leaves it under
   * four, and `Combat`'s early-out is the weapon's own floor -- so an arrow lying
   * against a limb cannot score again, by the rule that is already there rather
   * than by a second one bolted beside it.
   */
  private onContact(event: IPhysicsCollisionEvent): void {
    if (event.type === PhysicsEventType.COLLISION_FINISHED) return;
    if (!this.live || this.touched) return;
    this.touched = true;
    this.firstContact = event.collidedAgainst;
    // Standing in the ground is what a spent arrow looks like; hanging in the
    // air where a fighter used to be is not. So it plants only in the world.
    const into = event.collidedAgainst;
    this.planting = ((into?.shape?.filterMembershipMask ?? 0) & LAYER.WORLD) !== 0;
  }

  /** One control step of ageing, latch-clearing and settling. */
  step(dt: number): void {
    if (this.teleporting) {
      this.body.disablePreStep = true;
      this.teleporting = false;
    }
    if (!this.live) return;

    // A step late, on purpose. See `touched`: marking it spent inside the
    // contact callback marks it spent before the watcher that scores it runs.
    if (this.touched && !this.struck) {
      this.struck = true;
      this.age = 0;
    }
    // The last reading taken while it was still only flying. Held here rather
    // than asked for at the contact, because by then it is not the same number.
    if (!this.struck) this.body.getLinearVelocityToRef(this.arrival);
    this.age += dt;

    if (!this.struck) {
      for (let i = 0; i < this.tracePoints.length - 1; i += 1) {
        this.tracePoints[i].copyFrom(this.tracePoints[i + 1]);
      }
      this.tracePoints[this.tracePoints.length - 1].copyFrom(this.root.position);
      this.updateTrace();
    } else {
      this.trail.visibility = TRACE_VISIBILITY * Math.max(0, 1 - this.age / CONFIG.arrow.visual.fadeSeconds);
      if (this.trail.visibility === 0) this.traceRoot.setEnabled(false);
    }

    if (this.struck && this.planting) {
      this.planting = false;
      this.body.setLinearVelocity(Vector3.Zero());
      this.body.setAngularVelocity(Vector3.Zero());
      this.body.setMotionType(PhysicsMotionType.STATIC);
      this.shape.filterMembershipMask = LAYER.SPENT_ARROW;
      this.shape.filterCollideMask = COLLIDES.SPENT_ARROW;
    } else if (this.struck) {
      // Into a body rather than into the world. It cannot be pinned there --
      // the thing it hit is moving, and an arrow welded to a limb is a session
      // of its own -- so it is bled of nearly all its speed and dropped. That is
      // an arrow that arrives, stops dead and falls at the target's feet, which
      // is honest about what this models: it is *not* an arrow standing out of
      // somebody's chest.
      //
      // Bleeding it matters more than it sounds. A 35 g arrow at 45 m/s into a
      // keyframed trunk **bounces**: measured against a static wall, one came
      // back 3.3 m in half a second.
      const keep = 1 - CONFIG.arrow.stickDamping;
      this.body.setLinearVelocity(this.body.getLinearVelocity().scaleInPlace(keep));
      this.body.setAngularVelocity(this.body.getAngularVelocity().scaleInPlace(keep));
      this.shape.filterMembershipMask = LAYER.SPENT_ARROW;
      this.shape.filterCollideMask = COLLIDES.SPENT_ARROW;
    }

    const spent = this.struck ? CONFIG.arrow.stickSeconds : CONFIG.arrow.lifeSeconds;
    if (this.age > spent || this.root.position.y < -2) this.park();
  }

  // ---- what `Combat` reads -----------------------------------------------

  allowsContact(body: PhysicsBody): boolean {
    return !this.struck && this.touched && body === this.firstContact;
  }

  /** World direction along the shaft, nock to head. Cache-free, as everything
   *  read on the control step has to be. */
  bladeDirection(): Vector3 {
    const q = this.root.rotationQuaternion;
    if (!q) return this.scratch.tip.set(0, 1, 0);
    return this.scratch.tip.set(
      2 * (q.x * q.y - q.w * q.z),
      1 - 2 * (q.x * q.x + q.z * q.z),
      2 * (q.y * q.z + q.w * q.x),
    );
  }

  /**
   * The shaft's +X.
   *
   * An arrow has no edge and `scoring.ts` never asks -- `how: "point"` is what
   * says so. It is answered because the report carries it and the overlay draws
   * it, and a direction that is always zero would be a worse lie than one that
   * is merely uninteresting.
   */
  edgeDirection(): Vector3 {
    const q = this.root.rotationQuaternion;
    if (!q) return this.scratch.edge.set(1, 0, 0);
    return this.scratch.edge.set(
      1 - 2 * (q.y * q.y + q.z * q.z),
      2 * (q.x * q.y + q.w * q.z),
      2 * (q.x * q.z - q.w * q.y),
    );
  }

  /** The head. */
  tipPosition(): Vector3 {
    return this.bladeDirection()
      .scaleInPlace(CONFIG.arrow.length / 2)
      .addInPlace(this.root.position);
  }

  /**
   * How fast it was travelling when it arrived -- which for an arrow is **not**
   * the same question `Weapon` answers, and copying that answer was worth a
   * factor of nine.
   *
   * A blade's contact point genuinely moves at `linear + w x r`: the whole damage
   * model is about the speed of a tip on the end of a rotating arm, and the
   * rotation is the arm's, present before the contact and the reason the blow is
   * worth anything. An arrow does not rotate in flight -- its angular velocity is
   * zero from the moment it leaves the string -- so any `w` it has at the contact
   * was put there **by** the contact, and `w x r` over a 0.36 m half-shaft is
   * tens of metres a second of pure collision response.
   *
   * Measured, firing at a keyframed slab and reading three ways:
   *
   * | loosed at | body's linear velocity | last control step | `linear + w x r` |
   * |---|---|---|---|
   * | 48 | 38.4 | 48.0 | **5.6** |
   * | 40 | 39.5 | 40.0 | 30.5 |
   * | 30 | 29.5 | 30.0 | 20.6 |
   *
   * The last column is what the damage model was being handed. At 48 m/s the
   * spin very nearly cancelled the flight, so the hardest shot in the game
   * scored as a graze -- and it did it *consistently*, in a tight band around
   * 27 m/s, which is exactly the shape of a systematic error rather than of
   * noise. `world` is accepted and ignored: an arrow is rigid and not spinning,
   * so every point of it arrives at the same speed.
   */
  velocityAt(world: Vector3): Vector3 {
    void world;
    return this.scratch.vel.copyFrom(this.arrival);
  }

  /** Collapse all history at a new shot's origin or at the off-world park. */
  private resetTrace(at: Vector3): void {
    for (const point of this.tracePoints) point.copyFrom(at);
    this.updateTrace();
  }

  /** Refill the constructor-built tube; `instance` means no mesh is allocated. */
  private updateTrace(): void {
    MeshBuilder.CreateTube(
      this.trail.name,
      { path: this.tracePoints, instance: this.trail },
      this.root.getScene(),
    );
  }

  /** Body before node, which is `weapon.ts`'s rule and the same one applies. */
  dispose(): void {
    this.body.dispose();
    disposeCarriedRoot(this.traceRoot);
    disposeCarriedRoot(this.root);
  }
}

/**
 * A fixed set of arrows, and whose they are.
 *
 * A **recycling** pool rather than a stock: an arrow that is culled goes back on
 * the list and can be shot again, so `count` is a ceiling on how many are in the
 * world at once and not on how many a fighter has. Running out of arrows would
 * be a good rule and it is not this one -- it wants a readout, a way to pick more
 * up, and a policy that counts, which is three things and a session.
 */
export class Quiver {
  readonly arrows: readonly Arrow[];

  constructor(scene: Scene, opts: QuiverOptions, materials: WeaponMaterials) {
    const arrows: Arrow[] = [];
    for (let i = 0; i < CONFIG.arrow.count; i += 1) {
      arrows.push(new Arrow(scene, `${opts.name}.${i}`, opts, materials));
    }
    this.arrows = arrows;
  }

  /**
   * Age every arrow by one control step.
   *
   * **Call this before any `loose` in the same step**, and the reason is not
   * style. `loose` asks the plugin to take the node's transform for exactly one
   * step, and this is what takes the request back down again -- so calling it
   * *after* a loose in the same step would cancel the teleport before the solver
   * had ever seen it, and every shot would start from wherever the last one
   * ended. That failure has a signature and it is in the file header: six shots
   * from one origin, 12 m apart. `tests/arrow.test.mjs` pins the spread at zero,
   * which is the assertion that goes red if this is ever reordered.
   */
  step(dt: number): void {
    for (const arrow of this.arrows) arrow.step(dt);
  }

  /**
   * Put one in the air, and say whether one went.
   *
   * A parked arrow if there is one, and otherwise the one that has been out
   * longest -- so a fighter shooting faster than the pool recycles takes its own
   * oldest arrow back rather than being silently refused a shot.
   */
  loose(from: Vector3, along: Vector3, speed: number): boolean {
    let pick: Arrow | null = null;
    for (const arrow of this.arrows) {
      if (!arrow.live) {
        pick = arrow;
        break;
      }
      if (!pick || arrow.age > pick.age) pick = arrow;
    }
    if (!pick) return false;
    pick.loose(from, along, speed);
    return true;
  }

  /** How many are out, which is what a readout would want. */
  get flying(): number {
    let n = 0;
    for (const arrow of this.arrows) if (arrow.live && !arrow.spent) n += 1;
    return n;
  }

  get spent(): number {
    let n = 0;
    for (const arrow of this.arrows) if (arrow.live && arrow.spent) n += 1;
    return n;
  }

  get parked(): number {
    return this.arrows.length - this.flying - this.spent;
  }

  dispose(): void {
    for (const arrow of this.arrows) arrow.dispose();
  }
}

/**
 * The rotation that takes local +Y onto `along`.
 *
 * Written out rather than composed from `Quaternion.FromLookDirectionLH` or a
 * pair of Euler angles, because both of those decide the roll about the axis for
 * you and an arrow's roll is the one thing about its attitude that does not
 * matter -- so the cheapest correct answer is the shortest arc, which is what
 * this is: the axis is `up x along` and the angle is between them, packed
 * straight into a quaternion via the half-angle identity.
 */
function pointAlong(along: Vector3, into: Quaternion): Quaternion {
  // `w = 1 + dot(up, along)` with the axis unnormalised is the shortest-arc
  // quaternion up to scale; one normalise at the end settles it.
  const w = 1 + along.y;
  if (w < 1e-6) return into.copyFromFloats(0, 0, 1, 0); // straight down
  return into.copyFromFloats(along.z, 0, -along.x, w).normalize();
}
