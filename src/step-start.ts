// Explicit `.ts` extensions for Node's resolver: `Combat` imports this, and the harness imports Combat.
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody.js";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Observer } from "@babylonjs/core/Misc/observable.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { jointsOf, partBodyOf } from "./rig.ts";

/** Where a body stood at one instant: its transform node's position and rotation. */
export interface BodyPose {
  readonly position: Vector3;
  readonly rotation: Quaternion;
}

/**
 * Where each body stood at the instant a reading is taken, or null for a body the source has no
 * reading of -- which the reader then takes where it stands now. `effectiveMassAt` in
 * `src/body-inertia.ts` takes one.
 */
export type PoseSource = (body: PhysicsBody) => BodyPose | null;

interface Posed {
  readonly node: TransformNode;
  readonly pose: { readonly position: Vector3; readonly rotation: Quaternion };
  captured: boolean;
}

interface Moving {
  readonly body: PhysicsBody;
  readonly linear: Vector3;
  readonly angular: Vector3;
}

/**
 * **The state every body was in as the solver step began**, for a contact reading that has to
 * describe one instant (`CONFIG.combat.contactReading: "arrival"`).
 *
 * A collision callback runs after the solver step that found the contact, and by then two different
 * instants are on the table. Havok's manifold -- the point and the normal -- is the collision
 * detection's, which runs before the step integrates, so it is in the geometry the bodies had as the
 * step *began*. The transform nodes are what `syncTransform` wrote at its *end*. Pricing one against
 * the other turns the distance a body moved in one step into a lever arm it does not have: on the
 * whip's 60 mm weight, a sphere whose true lever about its own centre is exactly zero, it read 26 mm
 * at 240 Hz and 50 mm at 120, and priced the weight at 0.31 and 0.16 kg against a true 0.42
 * (`docs/analysis/2026-09-25-rate-whip.md`, section 7). The error is the step's length, so it is a
 * rate dependence in a reading, which is the one thing a reading may not have.
 *
 * So this samples, on `onBeforePhysicsObservable` -- before every solver step, on the physics clock --
 * the linear and angular velocity of each watched striker and the pose of every body a reading may
 * walk. Two costs, kept apart on purpose:
 *
 * - **Velocities cross into the plugin**: one linear and one angular read per striker per substep,
 *   about 400 B by the figures in `AGENTS.md`. They are the whole point, and nothing cheaper holds
 *   them.
 * - **Poses do not.** A pose is `mesh.position` and `mesh.rotationQuaternion`, which Havok's
 *   `syncTransform` writes at the end of every step and which are therefore the pose the next step
 *   starts from; copying them is seven floats into storage allocated once, with no plugin read and
 *   no allocation. Reading them stamps no render id (`AGENTS.md`), and no world matrix is touched.
 *
 * **Which bodies**: every part joined to a tracked body through the joints `src/rig.ts` recorded --
 * the same walk `effectiveMassAt` makes, so a walk that starts on a tracked part never leaves the
 * set. `Combat` tracks its own strikers and whatever it is attached to. A body asked about that is
 * not tracked (a multi-actor host's target, resolved per contact) answers null *that once*, is
 * read where it stands, and is tracked from the next step on.
 *
 * A superset is harmless: a severed limb goes on being sampled until the owner disposes this, and
 * nothing asks about it.
 */
export class StepStart {
  private readonly scene: Scene;
  private readonly posed = new Map<PhysicsBody, Posed>();
  private readonly poseList: Posed[] = [];
  private readonly moving: Moving[] = [];
  private readonly movingOf = new Map<PhysicsBody, Moving>();
  private observer: Observer<Scene> | null;
  private readonly scratch = { delta: new Quaternion(), inverse: new Quaternion(), rel: new Vector3() };

  constructor(scene: Scene) {
    this.scene = scene;
    this.observer = scene.onBeforePhysicsObservable.add(() => this.capture());
  }

  /** Sample this body's velocity before every step, and track its pose with its whole body's. */
  watchVelocity(body: PhysicsBody): void {
    if (!this.movingOf.has(body)) {
      const entry = { body, linear: new Vector3(), angular: new Vector3() };
      this.moving.push(entry);
      this.movingOf.set(body, entry);
    }
    this.track(body);
  }

  /** Track the pose of this body and of every part joined to it. Allocates; never per substep. */
  track(body: PhysicsBody): void {
    const queue: PhysicsBody[] = [body];
    while (queue.length > 0) {
      const next = queue.pop() as PhysicsBody;
      if (this.posed.has(next)) continue;
      const node = partBodyOf(next)?.part.mesh ?? next.transformNode;
      if (!node) continue;
      const entry: Posed = { node, captured: false,
        pose: { position: node.position.clone(), rotation: (node.rotationQuaternion ?? Quaternion.Identity()).clone() } };
      this.posed.set(next, entry);
      this.poseList.push(entry);
      for (const joint of jointsOf(next)) queue.push(joint.parent.body, joint.child.body);
    }
  }

  /** Called before every solver step. Allocation-free; two plugin reads per watched striker. */
  capture(): void {
    for (const entry of this.moving) {
      entry.body.getLinearVelocityToRef(entry.linear);
      entry.body.getAngularVelocityToRef(entry.angular);
    }
    for (const entry of this.poseList) {
      entry.pose.position.copyFrom(entry.node.position);
      const rotation = entry.node.rotationQuaternion;
      if (rotation) entry.pose.rotation.copyFrom(rotation);
      else entry.pose.rotation.set(0, 0, 0, 1);
      entry.captured = true;
    }
  }

  /** The velocity a watched body carried into the step, or null for one not watched. */
  velocityOf(body: PhysicsBody): { readonly linear: Vector3; readonly angular: Vector3 } | null {
    return this.movingOf.get(body) ?? null;
  }

  /**
   * The pose a body started the step in, or null for one with no sample yet -- which is then
   * tracked, so the next step has one. A `PoseSource`, bound so it can be handed on as one.
   */
  readonly poseOf: PoseSource = (body) => {
    const entry = this.posed.get(body);
    if (!entry) {
      this.track(body);
      return null;
    }
    return entry.captured ? entry.pose : null;
  };

  /**
   * A point fixed in `body`, given where it is now, carried back to where it was as the step began.
   * Written into `out`; the point itself if the body has no sample.
   */
  pointAtStart(body: PhysicsBody, now: Vector3, out: Vector3): Vector3 {
    const entry = this.posed.get(body);
    if (!entry?.captured) return out.copyFrom(now);
    const rel = this.scratch.rel.copyFrom(now).subtractInPlace(entry.node.position);
    return rel.applyRotationQuaternionToRef(this.delta(entry), out).addInPlace(entry.pose.position);
  }

  /** A direction fixed in `body`, given where it points now, turned back to the step's start. */
  directionAtStart(body: PhysicsBody, now: Vector3, out: Vector3): Vector3 {
    const entry = this.posed.get(body);
    if (!entry?.captured) return out.copyFrom(now);
    return now.applyRotationQuaternionToRef(this.delta(entry), out);
  }

  /** The rotation that takes the body's current orientation back to its start: start * now^-1. */
  private delta(entry: Posed): Quaternion {
    const now = entry.node.rotationQuaternion;
    const inverse = now ? Quaternion.InverseToRef(now, this.scratch.inverse) : this.scratch.inverse.set(0, 0, 0, 1);
    return entry.pose.rotation.multiplyToRef(inverse, this.scratch.delta);
  }

  dispose(): void {
    if (this.observer) this.scene.onBeforePhysicsObservable.remove(this.observer);
    this.observer = null;
    this.posed.clear();
    this.poseList.length = 0;
    this.moving.length = 0;
    this.movingOf.clear();
  }
}
