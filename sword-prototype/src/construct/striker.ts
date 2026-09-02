import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";

import type { Striking } from "../combat.ts";
import type { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody.js";

import { moduleAtContact } from "./damage-target.ts";
import type { ConstructModule, ConstructRuntime } from "./runtime.ts";

/** A sword is the blueprint module collider already welded into its owning part, not a visual proxy. */
export class ConstructMountedSword implements Striking {
  readonly kind = "sword" as const;
  readonly hand = null;
  readonly effectorId: string;
  readonly body;
  readonly damageScale: number;
  private readonly module: ConstructModule;
  private readonly runtime: ConstructRuntime | null;
  private readonly available: () => boolean;
  private armed = false;
  private actionInstance: string | null = null;
  private readonly scratch = {
    anchor: new Vector3(), tip: new Vector3(), edge: new Vector3(), blade: new Vector3(), flat: new Vector3(),
    linear: new Vector3(), angular: new Vector3(), relative: new Vector3(), velocity: new Vector3(),
  };

  constructor(module: ConstructModule, available: () => boolean = () => true,
    runtime: ConstructRuntime | null = null) {
    if (module.spec.kind !== "sword" || !module.spec.striker) {
      throw new Error(`module "${module.id}" cannot become a sword striker without blueprint striker geometry`);
    }
    this.module = module;
    this.runtime = runtime;
    this.available = available;
    this.effectorId = module.id;
    this.body = module.socket.part.body;
    // Havok does not publish per-body collision events merely because an observer exists.
    // The mounted module is a leaf of its socket owner's compound collider, so that owner
    // must opt in exactly as a hand-held Weapon does or a physical sweep can never score.
    this.body.setCollisionCallbackEnabled(true);
    this.damageScale = module.spec.striker.damageScale;
  }

  /** A mounted blade is hardware until a public attack Action arms it as a scorer. */
  setActionState(actionInstance: string | null, armed: boolean): void {
    this.actionInstance = actionInstance;
    this.armed = armed;
  }

  get spent(): boolean {
    return !this.armed || this.actionInstance === null || !this.module.socket.part.attached || !this.available();
  }

  refusalForContact(body: PhysicsBody): "owner-contact" | "inactive-action" | null {
    if (this.runtime && [...this.runtime.parts.values()].some((part) => part.body === body)) {
      return "owner-contact";
    }
    return this.spent ? "inactive-action" : null;
  }

  /** The carrier's other compound leaves are anatomy or hardware, never an implicit sword. */
  allowsSourceContact(point: Vector3): boolean {
    return this.runtime === null || moduleAtContact(this.runtime, this.body, point)?.id === this.module.id;
  }

  /** World-space socket frame of the real mounted module, not an invented shoulder. */
  anchorPosition(): Vector3 {
    this.module.root.computeWorldMatrix(true).getTranslationToRef(this.scratch.anchor);
    return this.scratch.anchor;
  }

  velocityAt(world: Vector3): Vector3 {
    this.body.getLinearVelocityToRef(this.scratch.linear);
    this.body.getAngularVelocityToRef(this.scratch.angular);
    this.scratch.relative.copyFrom(world).subtractInPlace(this.module.socket.part.node.position);
    Vector3.CrossToRef(this.scratch.angular, this.scratch.relative, this.scratch.velocity);
    return this.scratch.velocity.addInPlace(this.scratch.linear);
  }

  edgeDirection(): Vector3 {
    return Vector3.TransformNormalFromFloatsToRef(
      ...this.module.spec.striker!.localEdgeDirection,
      this.module.root.computeWorldMatrix(true), this.scratch.edge,
    ).normalize();
  }

  bladeDirection(): Vector3 {
    Vector3.TransformNormalFromFloatsToRef(
      ...this.module.spec.striker!.localFlatDirection,
      this.module.root.computeWorldMatrix(true), this.scratch.flat,
    ).normalize();
    Vector3.CrossToRef(this.scratch.flat, this.edgeDirection(), this.scratch.blade);
    return this.scratch.blade.normalize();
  }

  tipPosition(): Vector3 {
    return Vector3.TransformCoordinatesFromFloatsToRef(
      ...this.module.spec.striker!.localTipM,
      this.module.root.computeWorldMatrix(true), this.scratch.tip,
    );
  }
}

/** A shield bash is the shield's real compound leaf, armed by one scheduler action instance. */
export class ConstructMountedContactStriker implements Striking {
  readonly kind = "empty" as const;
  readonly hand = null;
  readonly effectorId: string;
  readonly body;
  readonly damageScale = 0;
  readonly authoredSpecificImpulseMps: number;
  private readonly runtime: ConstructRuntime;
  private readonly module: ConstructModule;
  private readonly available: () => boolean;
  private actionInstance: string | null = null;
  private armed = false;
  private contacted = new WeakSet<PhysicsBody>();
  private readonly scratch = { point: new Vector3(), direction: new Vector3(), linear: new Vector3(),
    angular: new Vector3(), relative: new Vector3(), velocity: new Vector3(), anchor: new Vector3() };

  constructor(runtime: ConstructRuntime, module: ConstructModule, available: () => boolean = () => true) {
    const striker = module.spec.mountedContactStriker;
    if (module.spec.kind !== "shield" || !striker) {
      throw new Error(`module "${module.id}" cannot become a mounted-contact striker without authored shove geometry`);
    }
    this.runtime = runtime;
    this.module = module;
    this.available = available;
    this.effectorId = module.id;
    this.body = module.socket.part.body;
    this.authoredSpecificImpulseMps = striker.shoveSpecificImpulseMps;
    this.body.setCollisionCallbackEnabled(true);
  }

  /** The action/group key changes only when a fresh scheduler admission begins. */
  setActionState(actionInstance: string | null, armed: boolean): void {
    if (actionInstance !== this.actionInstance) {
      this.actionInstance = actionInstance;
      this.contacted = new WeakSet<PhysicsBody>();
    }
    this.armed = armed;
  }

  get spent(): boolean { return !this.armed || !this.module.socket.part.attached || !this.available(); }

  refusalForContact(body: PhysicsBody): "owner-contact" | "inactive-action" | null {
    if ([...this.runtime.parts.values()].some((part) => part.body === body)) return "owner-contact";
    return this.spent ? "inactive-action" : null;
  }

  allowsSourceContact(point: Vector3): boolean {
    return moduleAtContact(this.runtime, this.body, point)?.id === this.module.id;
  }

  claimContact(body: PhysicsBody): boolean {
    if (this.contacted.has(body)) return false;
    this.contacted.add(body);
    return true;
  }

  /** World-space module frame for factual opponent equipment perception. */
  anchorPosition(): Vector3 {
    this.module.root.computeWorldMatrix(true).getTranslationToRef(this.scratch.anchor);
    return this.scratch.anchor;
  }

  velocityAt(world: Vector3): Vector3 {
    this.body.getLinearVelocityToRef(this.scratch.linear);
    this.body.getAngularVelocityToRef(this.scratch.angular);
    this.scratch.relative.copyFrom(world).subtractInPlace(this.module.socket.part.node.position);
    Vector3.CrossToRef(this.scratch.angular, this.scratch.relative, this.scratch.velocity);
    return this.scratch.velocity.addInPlace(this.scratch.linear);
  }

  edgeDirection(): Vector3 {
    return Vector3.TransformNormalFromFloatsToRef(1, 0, 0,
      this.module.root.computeWorldMatrix(true), this.scratch.direction).normalize();
  }

  bladeDirection(): Vector3 {
    return Vector3.TransformNormalFromFloatsToRef(0, 0, 1,
      this.module.root.computeWorldMatrix(true), this.scratch.direction).normalize();
  }

  tipPosition(): Vector3 {
    return Vector3.TransformCoordinatesFromFloatsToRef(
      ...this.module.spec.mountedContactStriker!.localContactPoint,
      this.module.root.computeWorldMatrix(true), this.scratch.point);
  }
}
