import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { PhysicsEventType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import type { IPhysicsCollisionEvent } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import type { Observer } from "@babylonjs/core/Misc/observable.js";

import { CONFIG } from "./config.ts";
import type { Side } from "./physics.ts";
import type { Sword } from "./sword.ts";
import type { Fighter, Limb } from "./fighter.ts";
import { scoreHit, severs, type HitKind } from "./scoring.ts";

export type { HitKind };

export interface HitReport {
  /**
   * Which side landed it. A bout that ends has to be able to say who won and
   * how, and the report of the blow that ended it is the only place that knows.
   */
  by: Side;
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
  /**
   * Where the contact was, how the blade was moving there, and which way the
   * edge was pointing at that instant -- all in world space, and all owned
   * copies rather than views onto scratch that the next contact would overwrite.
   *
   * None of the three is read by the damage model, which is computed entirely
   * from the two scalars above. They are kept because the log is the only record
   * of a blow that survives it, and a blow that scored nothing is unarguable
   * until you can see where it landed and which way the edge was facing when it
   * did. `src/rigview.ts` draws them.
   */
  point: Vector3;
  velocity: Vector3;
  edge: Vector3;
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
 *
 * One of these per side, each watching one blade and pointed at the other
 * fighter. It used to be built around one sword and one dummy, and that
 * asymmetry was the whole of what made it a training-yard object rather than a
 * fight: it knew which body was allowed to be hurt. It now knows which blade it
 * is watching and whose body that blade is entitled to find, and two of them
 * make a bout. `scoring.ts` is untouched by any of it, being already pure and
 * already knowing nothing about who is swinging.
 */
export class Combat {
  /** Which side's blade this watches. Stamped onto every report it files. */
  readonly side: Side;

  private readonly sword: Sword;
  private observer: Observer<IPhysicsCollisionEvent> | null = null;
  private target: Fighter | null = null;
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

  constructor(side: Side, sword: Sword) {
    this.side = side;
    this.sword = sword;
    this.observer = sword.body.getCollisionObservable().add(this.onContact);
  }

  /**
   * Whose body this blade may find.
   *
   * Only the opposite fighter is ever passed in, and the collision layers say
   * the same thing again in the solver -- a blade does not even generate a
   * contact against its own side. Two statements of one rule, deliberately: the
   * layer mask is what keeps the arm from shoving its owner across the arena,
   * and this is what keeps a stray contact from being scored against the wrong
   * body if the masks are ever loosened.
   */
  attach(target: Fighter): void {
    this.target = target;
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
    if (!this.target || !event.point) return;

    const limb = this.target.limbFor(event.collidedAgainst);
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
      by: this.side,
      limb: limb.label,
      solverImpulse: event.impulse,
      speed,
      at: this.clock,
      point: point.clone(),
      velocity: velocity.clone(),
      edge: this.sword.edgeDirection().clone(),
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
    if (severed) this.target?.sever(limb, direction);

    return { ...base, kind, edgeAlignment, damage, severed };
  }
}
