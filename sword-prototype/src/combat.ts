import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { PhysicsEventType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import type { IPhysicsCollisionEvent } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import type { Observer } from "@babylonjs/core/Misc/observable.js";

import { CONFIG } from "./config";
import type { Sword } from "./sword";
import type { Dummy, Limb } from "./dummy";
import { scoreHit, severs, type HitKind } from "./scoring";

export type { HitKind };

export interface HitReport {
  limb: string;
  kind: HitKind;
  /** Speed of the blade at the contact point, m/s. */
  speed: number;
  /** How squarely the edge was travelling into the cut, 0..1. */
  edgeAlignment: number;
  /** What the solver actually resolved, kept as a diagnostic. */
  solverImpulse: number;
  damage: number;
  severed: boolean;
  at: number;
}

/**
 * Turning a contact into a wound.
 *
 * Damage is computed from the blade's own speed at the contact point and how
 * closely that motion lines up with the edge, rather than from the impulse the
 * solver reports. The solver impulse is real, but it is dominated by how the
 * contact was resolved -- mass ratios, penetration depth, substep luck -- so
 * tuning against it means tuning against noise. Speed multiplied by alignment is
 * the quantity a player can actually feel themselves controlling, so that is the
 * quantity the damage is built from. The impulse is still surfaced in the
 * readout, because when the two disagree that is worth seeing.
 */
export class Combat {
  private observer: Observer<IPhysicsCollisionEvent> | null = null;
  private dummy: Dummy | null = null;
  private clock = 0;

  /** The most recent meaningful contact, for the readout. */
  lastHit: HitReport | null = null;
  /** Everything that has landed this run, newest first. */
  readonly log: HitReport[] = [];

  private readonly scratch = {
    velocity: new Vector3(),
    direction: new Vector3(),
    push: new Vector3(),
  };

  constructor(private readonly sword: Sword) {
    this.observer = sword.body.getCollisionObservable().add(this.onContact);
  }

  attach(dummy: Dummy): void {
    this.dummy = dummy;
  }

  /** Simulation time, seconds since the run started. */
  get now(): number {
    return this.clock;
  }

  advance(dt: number): void {
    this.clock += dt;
  }

  dispose(): void {
    if (this.observer) {
      this.sword.body.getCollisionObservable().remove(this.observer);
      this.observer = null;
    }
  }

  private readonly onContact = (event: IPhysicsCollisionEvent): void => {
    if (event.type === PhysicsEventType.COLLISION_FINISHED) return;
    if (!this.dummy || !event.point) return;

    const limb = this.dummy.limbFor(event.collidedAgainst);
    if (!limb || limb.severed) return;
    if (this.clock - limb.lastHitAt < CONFIG.combat.hitCooldown) return;

    const report = this.resolve(limb, event);
    limb.lastHitAt = this.clock;
    this.lastHit = report;
    this.log.unshift(report);
    if (this.log.length > 24) this.log.length = 24;
  };

  private resolve(limb: Limb, event: IPhysicsCollisionEvent): HitReport {
    const C = CONFIG.combat;
    const point = event.point as Vector3;

    const velocity = this.scratch.velocity.copyFrom(this.sword.velocityAt(point));
    const speed = velocity.length();

    const base = {
      limb: limb.label,
      solverImpulse: event.impulse,
      speed,
      at: this.clock,
    };

    if (speed < C.minCutSpeed) {
      return { ...base, kind: "weak", edgeAlignment: 0, damage: 0, severed: false };
    }

    const direction = this.scratch.direction.copyFrom(velocity).scaleInPlace(1 / speed);
    const edgeAlignment = Math.abs(Vector3.Dot(direction, this.sword.edgeDirection()));

    const score = scoreHit({
      speed,
      edgeAlignment,
      bladeAlignment: Math.abs(Vector3.Dot(direction, this.sword.bladeDirection())),
      nearTip: Vector3.Distance(point, this.sword.tipPosition()) < C.thrustTipZone,
    });
    const { kind, quality, damage } = score;

    limb.health -= damage;

    // The blade shoves what it strikes whether or not it bites. A flat slap
    // transfers the most push and the least damage, which is the trade the
    // player is being taught.
    const shove = this.scratch.push
      .copyFrom(direction)
      .scaleInPlace(speed * 0.11 * (1.35 - quality * 0.7));
    limb.part.body.applyImpulse(shove, point);

    const severed = severs(score, limb.health);
    if (severed) this.dummy?.sever(limb, direction);

    return { ...base, kind, edgeAlignment, damage, severed };
  }
}
