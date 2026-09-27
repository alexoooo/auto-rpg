import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { PhysicsMotionType, PhysicsEventType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import { ShapeCastResult } from "@babylonjs/core/Physics/shapeCastResult.js";
import type { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { Material } from "@babylonjs/core/Materials/material.js";
import type { Observer } from "@babylonjs/core/Misc/observable.js";
import type { Striking } from "../../combat.ts";
import type { ProjectileView } from "../../mind.ts";
import { CONFIG } from "../../config.ts";
import { layersFor, type Side } from "../../physics.ts";
import { boxPart, type Part } from "../../rig.ts";

/** Preallocated real bodies. Sweeps and solver contacts share Combat's normal contact stream. */
export class ArcherArrow implements Striking {
  readonly kind = "arrow" as const;
  readonly hand = null;
  readonly part: Part;
  readonly body;
  readonly effectorId: string;
  readonly projectilePoolIndex: number;
  readonly projectileImpact = Object.freeze({ massKg: .035, lengthM: .95, radiusM: .0045, penetrationEfficiency: 1 });
  shotSerial = 0;
  spent = true;
  age = 0;
  private pending = false;
  private readonly velocity = Vector3.Zero();
  private readonly direction = Vector3.Forward();
  private readonly tip = Vector3.Zero();
  private readonly layers;
  private readonly plugin: HavokPlugin;
  private readonly input = new ShapeCastResult();
  private readonly hit = new ShapeCastResult();

  constructor(scene: Scene, side: Side, name: string, index: number, material: Material) {
    this.effectorId = name; this.projectilePoolIndex = index;
    this.layers = layersFor(side);
    this.plugin = scene.getPhysicsEngine()!.getPhysicsPlugin() as HavokPlugin;
    this.part = boxPart(scene, { name: `${name}.arrow.${index}`, position: new Vector3(0, -100-index, 0),
      size: new Vector3(.009, .009, .95), mass: .035, layer: 0, collidesWith: this.layers.arrowCollides,
      material, motionType: PhysicsMotionType.STATIC });
    this.body = this.part.body;
    this.body.setCollisionCallbackEnabled(true);
    this.body.getCollisionObservable().add(event => {
      if (!this.spent && event.type !== PhysicsEventType.COLLISION_FINISHED) this.pending = true;
    });
    this.part.mesh.setEnabled(false);
  }
  launch(nock: Vector3, direction: Vector3, velocity: Vector3): void {
    if (!this.spent) throw new Error("Cannot recycle a flying arrow");
    this.direction.copyFrom(direction).normalize(); this.velocity.copyFrom(velocity);
    this.body.setMotionType(PhysicsMotionType.DYNAMIC);
    this.part.mesh.position.copyFrom(nock).addInPlace(this.direction.scale(.475));
    this.part.mesh.rotationQuaternion = Quaternion.FromLookDirectionRH(this.direction, Vector3.Up().subtract(this.direction.scale(this.direction.y)).normalize()).normalize();
    this.part.mesh.setEnabled(true);
    this.part.shape.filterMembershipMask = this.layers.arrow;
    this.body.disablePreStep = false;
    this.plugin.setPhysicsBodyTransformation(this.body, this.part.mesh);

    this.body.setLinearVelocity(velocity); this.body.setAngularVelocity(Vector3.Zero());
    this.pending = false; this.spent = false; this.age = 0; this.shotSerial++;
    this.tip.copyFrom(nock).addInPlace(this.direction.scale(.95));
  }
  step(dt: number): void {
    this.age += dt;
    if (this.spent) {
      if (this.age > CONFIG.arrow.lifeSeconds + CONFIG.arrow.stickSeconds) this.part.mesh.setEnabled(false);
      return;
    }
    if (this.pending || this.age > CONFIG.arrow.lifeSeconds) {
      this.spent = true; this.pending = false;
      this.part.shape.filterMembershipMask = 0;
      this.body.setMotionType(PhysicsMotionType.STATIC);
    }
    if (this.spent) return;
    this.body.getLinearVelocityToRef(this.velocity);
    Vector3.Forward().rotateByQuaternionToRef(this.part.mesh.rotationQuaternion!, this.direction);
    // Preserve the pre-impact velocity and pose for scoring; solver impulses must not rewrite them.
    this.tip.copyFrom(this.part.mesh.position).addInPlace(this.direction.scale(.475));
    const rotation = this.part.mesh.rotationQuaternion!;
    this.input.reset(); this.hit.reset();
    this.plugin.shapeCast({ shape: this.part.shape, rotation, startPosition: this.part.mesh.position,
      endPosition: this.part.mesh.position.add(this.velocity.scale(dt)), shouldHitTriggers: false,
      ignoreBody: this.body }, this.input, this.hit);
    if (this.hit.hasHit && this.hit.body) {
      this.tip.addInPlace(this.velocity.scale(dt*this.hit.hitFraction));
      this.body.getCollisionObservable().notifyObservers({ collider: this.body, collidedAgainst: this.hit.body,
        colliderIndex: 0, collidedAgainstIndex: this.hit.bodyIndex ?? 0,
        type: PhysicsEventType.COLLISION_STARTED, point: this.hit.hitPoint.clone(), normal: this.hit.hitNormal.clone(),
        distance: 0, impulse: 0 });
    }
  }
  velocityAt(): Vector3 { return this.velocity; }
  edgeDirection(): Vector3 { return Vector3.Up(); }
  bladeDirection(): Vector3 { return this.direction; }
  impactBladeDirection(): Vector3 { return this.direction; }
  tipPosition(): Vector3 { return this.tip; }
  impactTipPosition(): Vector3 { return this.tip; }
  nearTip(point: Vector3): number { return Vector3.Distance(point, this.tip); }
  dispose(): void { this.body.dispose(); this.part.shape.dispose(); this.part.mesh.dispose(false, false); }
}

export class ArcherQuiver {
  readonly arrows: ArcherArrow[];
  private readonly scene: Scene;
  private readonly observer: Observer<Scene>;
  private readonly after: Observer<Scene>;
  constructor(scene: Scene, side: Side, name: string, material: Material) {
    this.scene = scene;
    this.arrows = Array.from({length: 12}, (_, i) => new ArcherArrow(scene, side, name, i, material));
    this.after=scene.onAfterPhysicsObservable.add(()=>{for(const arrow of this.arrows)arrow.body.disablePreStep=true;});
    // Independent of the shooter's living controller: a released arrow outlives its owner.
    this.observer = scene.onBeforePhysicsObservable.add(() => {
      for (const arrow of this.arrows) arrow.step(1 / CONFIG.world.physicsHz);
    });
  }
  fire(nock: Vector3, direction: Vector3, speed: number, inherited: Vector3): boolean {
    const arrow = this.arrows.find(a => a.spent);
    if (!arrow) return false;
    arrow.launch(nock, direction, direction.scale(speed).add(inherited)); return true;
  }
  publish(into: ProjectileView[], at: number, owner: "self" | "opponent"): number {
    for (const arrow of this.arrows) if (!arrow.spent) {
      const row = into[at] ?? (into[at] = { kind: "arrow", owner, position: Vector3.Zero(), velocity: Vector3.Zero(), age: 0 });
      row.owner = owner; row.age = arrow.age;
      row.position.copyFrom(arrow.part.mesh.position); row.velocity.copyFrom(arrow.velocityAt()); at++;
    }
    return at;
  }
  dispose(): void { this.scene.onBeforePhysicsObservable.remove(this.observer); this.scene.onAfterPhysicsObservable.remove(this.after); this.arrows.forEach(a => a.dispose()); }
}
