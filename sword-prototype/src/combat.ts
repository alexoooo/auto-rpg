import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { PhysicsEventType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import type { IPhysicsCollisionEvent } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import type { Observer } from "@babylonjs/core/Misc/observable.js";

import { CONFIG } from "./config.ts";
import type { Side } from "./physics.ts";
import type { Weapon, WeaponKind } from "./weapon.ts";
import type { Fighter, Limb } from "./fighter.ts";
import { biteFloor, scoreHit, severs, type HitKind } from "./scoring.ts";

export type { HitKind };

export interface HitReport {
  /**
   * Which side landed it. A bout that ends has to be able to say who won and
   * how, and the report of the blow that ended it is the only place that knows.
   */
  by: Side;
  /** Which of the side's two hands landed it. A bout can end on either. */
  weapon: WeaponKind;
  /** The limb's label, which is what a person reads in the banner. */
  limb: string;
  /**
   * The limb's key, which is what code matches on.
   *
   * Both, because they are different jobs and the label is allowed to be
   * rewritten for the readout without silently breaking a lookup. `bout.ts`
   * already keys its own rules this way -- `beaten()` names `"head"` and
   * `"torso"`, never "Head".
   */
  key: string;
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
 * What a blow stopped by each kind is called in the readout.
 *
 * A total record over the kinds that can stop one, so adding a kind is a compile
 * error here rather than a blow that reads as "Guard" for the rest of the
 * session. `empty` is in it because a bare forearm genuinely can stop a blade,
 * and "Guard" is what that is.
 */
const PARRY_LABEL: Record<WeaponKind, string> = {
  sword: "Blade",
  axe: "Haft",
  shield: "Shield",
  buckler: "Buckler",
  club: "Club",
  empty: "Guard",
};

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

  /**
   * Every weapon this side is carrying, and the observer watching each.
   *
   * One `Combat` per side rather than per blade, which is what it has always
   * been -- but a side now carries up to two things and either of them can score.
   * The alternative was a watcher per weapon and a list of them in `bout.sides`,
   * which would have moved the same change into `main.ts`, `rigview.ts`, the
   * HUD's "newest blow by anybody" reduction and `scripts/measure.mjs`. What
   * scores is a property of a side; what it is holding is a detail of it.
   *
   * The weapon is captured per observer rather than looked up from the event,
   * because `getCollisionObservable` is already per body -- so the binding is
   * exact and free, and there is no way for a report to name the wrong blade.
   */
  private readonly watching: { weapon: Weapon; observer: Observer<IPhysicsCollisionEvent> }[] = [];
  private target: Fighter | null = null;
  private clock = 0;
  /** Parries share one cooldown, since two blades resting together contact
   *  every step and a log full of one block is a log of nothing. */
  private lastParryAt = -999;

  /** The most recent meaningful contact, for the readout. */
  lastHit: HitReport | null = null;
  /** Everything that has landed this run, newest first. */
  readonly log: HitReport[] = [];

  private readonly scratch = {
    velocity: new Vector3(),
    direction: new Vector3(),
    push: new Vector3(),
  };

  constructor(side: Side, weapons: readonly (Weapon | null)[]) {
    this.side = side;
    for (const weapon of weapons) {
      if (!weapon) continue;
      const observer = weapon.body
        .getCollisionObservable()
        .add((event) => this.onContact(weapon, event));
      if (observer) this.watching.push({ weapon, observer });
    }
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

  /**
   * The body this blade is entitled to find.
   *
   * Exposed so that a report can be turned back into the limb it was filed
   * against. `HitReport` carries a key rather than a body because it is a record
   * of a blow and not a handle on one -- the limb it names may since have been
   * cut off, and a record that kept the object alive would be a leak dressed up
   * as a convenience. `src/blood.ts` is the only caller.
   */
  get body(): Fighter | null {
    return this.target;
  }

  /** Simulation time, seconds since the run started. */
  get now(): number {
    return this.clock;
  }

  advance(dt: number): void {
    this.clock += dt;
  }

  dispose(): void {
    for (const watch of this.watching) {
      watch.weapon.body.getCollisionObservable().remove(watch.observer);
    }
    this.watching.length = 0;
  }

  private onContact(weapon: Weapon, event: IPhysicsCollisionEvent): void {
    if (event.type === PhysicsEventType.COLLISION_FINISHED) return;
    if (!this.target || !event.point) return;

    const limb = this.target.limbFor(event.collidedAgainst);
    if (!limb) {
      this.parried(weapon, event);
      return;
    }
    if (limb.severed) return;
    if (this.clock - limb.lastHitAt < CONFIG.combat.hitCooldown) return;

    const report = this.resolve(weapon, limb, event);
    limb.lastHitAt = this.clock;
    this.lastHit = report;
    this.log.unshift(report);
    if (this.log.length > 24) this.log.length = 24;
  }

/**
 * A blow that found the other fighter's guard instead of the other fighter.
 *
   * It costs nothing and it is not a wound, so it is filed with zero damage and
   * a limb named for the thing it hit. What it buys is that a block is visible:
   * before this, a blade stopped dead by a shield and a blade that missed
   * entirely produced exactly the same readout, which is nothing.
   *
   * Rate-limited on the same clock as a real hit, because two blades resting
   * against each other generate a contact every step and would otherwise fill
   * the log with a single parry twenty-four times over.
   */
  private parried(weapon: Weapon, event: IPhysicsCollisionEvent): void {
    const stopped = this.target?.parriedBy(event.collidedAgainst);
    if (!stopped || !event.point) return;
    if (this.clock - this.lastParryAt < CONFIG.combat.hitCooldown) return;
    this.lastParryAt = this.clock;

    const point = event.point as Vector3;
    const velocity = this.scratch.velocity.copyFrom(weapon.velocityAt(point));
    const report: HitReport = {
      by: this.side,
      weapon: weapon.kind,
      limb: PARRY_LABEL[stopped.kind],
      key: `block:${stopped.kind}`,
      kind: "weak",
      speed: velocity.length(),
      edgeAlignment: 0,
      solverImpulse: event.impulse,
      damage: 0,
      severed: false,
      at: this.clock,
      point: point.clone(),
      velocity: velocity.clone(),
      edge: weapon.edgeDirection().clone(),
    };
    this.lastHit = report;
    this.log.unshift(report);
    if (this.log.length > 24) this.log.length = 24;
  }

  private resolve(weapon: Weapon, limb: Limb, event: IPhysicsCollisionEvent): HitReport {
    const C = CONFIG.combat;
    const point = event.point as Vector3;

    const velocity = this.scratch.velocity.copyFrom(weapon.velocityAt(point));
    const speed = velocity.length();

    const base = {
      by: this.side,
      limb: limb.label,
      key: limb.key,
      weapon: weapon.kind,
      solverImpulse: event.impulse,
      speed,
      at: this.clock,
      point: point.clone(),
      velocity: velocity.clone(),
      edge: weapon.edgeDirection().clone(),
    };

    // The weapon's own floor, asked of the table rather than assumed to be the
    // blade's. This early-out exists to skip a divide and three dot products for
    // a contact too slow to be worth anything, and that is all it is allowed to
    // be: for most of a year it was `speed < C.minCutSpeed`, which meant a club
    // below 3.0 m/s never reached `scoreHit` and `minCrushSpeed` was a setting
    // that worked only in its unit test.
    if (speed < biteFloor(weapon.kind)) {
      return { ...base, kind: "weak", edgeAlignment: 0, damage: 0, severed: false };
    }

    const direction = this.scratch.direction.copyFrom(velocity).scaleInPlace(1 / speed);
    // Signed for the damage model, absolute for the readout. A sword cuts on
    // both sides of its edge axis and does not care; an axe's -X is the poll,
    // and `scoring.ts` is what knows the difference. The report keeps the
    // magnitude because the HUD draws a bar with it.
    const alongEdge = Vector3.Dot(direction, weapon.edgeDirection());
    const edgeAlignment = Math.abs(alongEdge);

    const score = scoreHit(
      {
        speed,
        edgeAlignment: alongEdge,
        bladeAlignment: Math.abs(Vector3.Dot(direction, weapon.bladeDirection())),
        nearTip: Vector3.Distance(point, weapon.tipPosition()) < C.thrustTipZone,
      },
      weapon.kind,
    );
    const { kind, quality, damage } = score;

    limb.health -= damage;

    // The blade shoves what it strikes whether or not it bites. A flat slap
    // transfers the most push and the least damage, which is the trade the
    // player is being taught.
    const shove = this.scratch.push
      .copyFrom(direction)
      .scaleInPlace(speed * 0.11 * (1.35 - quality * 0.7));
    limb.part.body.applyImpulse(shove, point);

    const severed = severs(score, limb.health, weapon.kind);
    if (severed) this.target?.sever(limb, direction);

    return { ...base, kind, edgeAlignment, damage, severed };
  }
}
