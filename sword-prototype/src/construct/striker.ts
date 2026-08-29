import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";

import type { Striking } from "../combat.ts";
import type { ConstructModule } from "./runtime.ts";

/** A sword is the blueprint module collider already welded into its owning part, not a visual proxy. */
export class ConstructMountedSword implements Striking {
  readonly kind = "sword" as const;
  readonly hand = null;
  readonly effectorId: string;
  readonly body;
  readonly damageScale: number;
  private readonly module: ConstructModule;
  private readonly available: () => boolean;
  private readonly scratch = {
    anchor: new Vector3(), tip: new Vector3(), edge: new Vector3(), blade: new Vector3(), flat: new Vector3(),
    linear: new Vector3(), angular: new Vector3(), relative: new Vector3(), velocity: new Vector3(),
  };

  constructor(module: ConstructModule, available: () => boolean = () => true) {
    if (module.spec.kind !== "sword" || !module.spec.striker) {
      throw new Error(`module "${module.id}" cannot become a sword striker without blueprint striker geometry`);
    }
    this.module = module;
    this.available = available;
    this.effectorId = module.id;
    this.body = module.socket.part.body;
    // Havok does not publish per-body collision events merely because an observer exists.
    // The mounted module is a leaf of its socket owner's compound collider, so that owner
    // must opt in exactly as a hand-held Weapon does or a physical sweep can never score.
    this.body.setCollisionCallbackEnabled(true);
    this.damageScale = module.spec.striker.damageScale;
  }

  get spent(): boolean { return !this.module.socket.part.attached || !this.available(); }

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
