import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { PhysicsEventType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import type { IBasePhysicsCollisionEvent, IPhysicsCollisionEvent } from
  "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import type { Observable } from "@babylonjs/core/Misc/observable.js";

import type { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody.js";

import { CONFIG } from "./config.ts";
import type { Side } from "./physics.ts";
import type { WeaponKind } from "./weapon.ts";
import type { Limb } from "./fighter.ts";
import type { Combatant } from "./units.ts";
import type { HandName } from "./hands.ts";
import { biteFloor, evaluateProjectileImpact, scoreHit, severs,
  type HitKind, type Striker } from "./scoring.ts";

export type { HitKind };

/**
 * A non-solving sensor over a real striker.
 *
 * Havok trigger events identify the two bodies but deliberately carry no contact manifold.
 * The owner therefore supplies the best physical point it can derive from its live source and
 * the body it overlapped. Velocity, edge and spent state remain on the ordinary `Striking`
 * object, so a sensor can report a fist without becoming a second imaginary weapon.
 */
export interface NonSolvingStrikeTrigger {
  readonly body: PhysicsBody;
  readonly events: Observable<IBasePhysicsCollisionEvent>;
  contactPoint(collidedAgainst: PhysicsBody): Vector3;
}

/**
 * What this file needs from a thing that can hurt somebody.
 *
 * It used to need a `Weapon`, which is a class with a mesh tree, a compound
 * shape, a mount and a builder per kind -- and of all that, six members are ever
 * read here. An **arrow** can answer all six and is none of the rest of it: no
 * hand holds one, no `mountRotation` places one, and there is no row for it in
 * any of the tables `Weapon`'s constructor switches on.
 *
 * So the dependency is stated as what it is. `Weapon` satisfies this without a
 * line of change, because it already had all six; `Arrow` satisfies it because
 * this is the list it was written against. Nothing else moves.
 *
 * Two of the six are answered differently by an arrow and it is worth saying
 * which. `edgeDirection` is the shaft's +X and means nothing -- an arrow has no
 * edge, and `scoring.ts` never asks about one, because its bite is `how: "point"`
 * rather than `how: "edge"`. `tipPosition` is the head, and `nearTip` is
 * likewise never asked. They are here because the report keeps them: a blow that
 * scored nothing is unarguable until you can see where it was and which way it
 * was facing.
 */
export interface Striking {
  readonly kind: Striker;
  /** Stable physical source; construct modules never impersonate a humanoid hand. */
  readonly effectorId: string;
  readonly hand: HandName | null;
  /** Blueprint-owned multiplier; legacy effectors omit it and therefore remain exactly 1. */
  readonly damageScale?: number;
  /** Authored zero-wound contact transfer, expressed as target velocity change. */
  readonly authoredSpecificImpulseMps?: number;
  /** Immutable physical facts shared with the live projectile body. */
  readonly projectileImpact?: Readonly<{
    readonly massKg: number;
    readonly lengthM: number;
    readonly radiusM: number;
    readonly penetrationEfficiency: number;
  }>;
  /** Stable pool slot; `shotSerial` changes at every launch of that slot. */
  readonly projectilePoolIndex?: number;
  readonly shotSerial?: number | null;
  readonly body: PhysicsBody;
  /** Supported bodies may replace a solving striker contact with this sensor-only path. */
  readonly nonSolvingTrigger?: NonSolvingStrikeTrigger;
  /** Compound owners must prove the contact belongs to this semantic module leaf. */
  allowsSourceContact?(point: Vector3): boolean;
  /** Stateful effectors may accept at most one contact per target and action instance. */
  claimContact?(body: PhysicsBody): boolean;
  /** Mounted effectors name owner and inactive contacts instead of disappearing them. */
  refusalForContact?(body: PhysicsBody): CombatRefusalEvent["reason"] | null;
  /**
   * Whether this has stopped being a weapon: dropped, or already spent.
   *
   * **Debris does not score**, and that is one rule with two instances rather
   * than a special case for arrows. A weapon that has been cut out of a hand and
   * an arrow that has already hit somebody are the same thing -- an object lying
   * in the arena that used to be dangerous -- and both are re-layered onto
   * `DEBRIS` to say so. What was missing is that the *scoring* seam never asked.
   *
   * It cost real numbers. An arrow that has struck goes on generating contacts
   * against the limb it is resting on, one every `hitCooldown`, and a limb that
   * is moving drags it past `minArrowSpeed` often enough to be billed: over 12
   * bouts, 62 of the archer's "hits" averaged **2.9 damage** where a clean arrow
   * is worth 55, because most of them were the same handful of spent shafts
   * being scored eleven times a second. The speed floor was doing most of the
   * work and it was never going to do all of it -- a floor filters the typical
   * case and this is a tail.
   */
  readonly spent: boolean;
  /** Projectiles may restrict scoring to the body that raised their first contact. */
  allowsContact?(body: PhysicsBody): boolean;
  velocityAt(world: Vector3): Vector3;
  edgeDirection(): Vector3;
  bladeDirection(): Vector3;
  tipPosition(): Vector3;
  /** Optional pre-solver projectile pose paired with the cached arrival velocity. */
  impactBladeDirection?(): Vector3;
  impactTipPosition?(): Vector3;
}

export interface ProjectileImpactEvidence {
  readonly identity: Readonly<{
    readonly owner: Side;
    readonly effectorId: string;
    readonly poolIndex: number;
    readonly shotSerial: number;
  }>;
  readonly massKg: number;
  readonly arrivalSpeedMps: number;
  readonly signedShaftAlignment: number;
  readonly contactedZone: "head" | "shaft" | "tail" | "other";
  readonly usableEnergyJ: number;
  readonly penetrationEfficiency: number;
  readonly uncappedDamage: number;
  readonly preArmourDamage: number;
  readonly postArmourDamage: number;
}

export interface HitReport {
  /**
   * Which side landed it. A bout that ends has to be able to say who won and
   * how, and the report of the blow that ended it is the only place that knows.
   */
  by: Side;
  /**
   * What landed it.
   *
   * A `Striker` rather than a `WeaponKind`, because a side can now be hit by
   * something nobody is holding.
   */
  weapon: Striker;
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
  /** Damage on the combat-value scale before and after target armour. */
  preArmourDamage: number;
  postArmourDamage: number;
  /** Present only for a physical projectile contact. */
  projectile?: ProjectileImpactEvidence;
  stabilityShove?: Readonly<{ readonly kind: "specific-impulse"; readonly specificImpulseMps: number }>;
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

export interface CombatReportEvent {
  readonly report: HitReport;
  readonly effectorId: string;
  readonly hand: HandName | null;
  readonly blocked: boolean;
}

export interface CombatRefusalEvent {
  readonly reason: "owner-contact" | "inactive-action" | "module-attribution";
  readonly effectorId: string;
  readonly at: number;
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
  bow: "Stave",
  shield: "Shield",
  buckler: "Buckler",
  club: "Club",
  empty: "Hand",
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
   *
   * **It is still bound once, in the constructor, and a bow did not change
   * that.** The master plan expected an arrow to need `watch`/`unwatch` per
   * shot, on the reasoning that a projectile is a body appearing mid-bout. It is
   * not: `Quiver` builds every arrow with the fighter and parks it, so the list
   * this walks is complete before the first step. That was chosen against the
   * alternative on a measurement -- 24 arrows parked STATIC on membership mask 0
   * cost **-0.0015 ms/frame**, which is below the bench's own noise -- and what
   * it buys is that an observable is never touched at 240 Hz and no arrow can
   * outlive the observer watching it. `Fighter.strikers` is what hands them over.
   */
  private readonly watching: { weapon: Striking; remove: () => void }[] = [];
  private target: Combatant | null = null;
  private clock = 0;
  /**
   * Each physical effector gets one parry cadence. A blade resting on a guard still cannot fill
   * the log, but a distinct gauntlet that genuinely joins the same bind is not erased by the
   * sword's earlier callback in that solver step.
   */
  private readonly lastParryAt = new Map<string, number>();
  /** One serial is one scoring opportunity; a recycled slot receives a new serial. */
  private readonly projectileHits = new Set<string>();
  /** False from the verdict edge onward; observers stay installed until dispose. */
  private active = true;
  private readonly onReport?: (event: CombatReportEvent) => void;
  private readonly onRefusal?: (event: CombatRefusalEvent) => void;

  /** The most recent meaningful contact, for the readout. */
  lastHit: HitReport | null = null;
  /** The most recent damaging body contact, for the bout's final blow. */
  lastWound: HitReport | null = null;
  /** Everything that has landed this run, newest first. */
  readonly log: HitReport[] = [];

  private readonly scratch = {
    velocity: new Vector3(),
    direction: new Vector3(),
    push: new Vector3(),
  };

  constructor(side: Side, weapons: readonly (Striking | null)[], onReport?: (event: CombatReportEvent) => void,
    onRefusal?: (event: CombatRefusalEvent) => void) {
    this.side = side;
    this.onReport = onReport;
    this.onRefusal = onRefusal;
    try {
      for (const weapon of weapons) {
        if (!weapon) continue;
        const trigger = weapon.nonSolvingTrigger;
        if (trigger) {
          const observer = trigger.events.add((event) => this.onTrigger(weapon, trigger, event));
          if (observer) this.watching.push({ weapon, remove: () => trigger.events.remove(observer) });
          continue;
        }
        const observable = weapon.body.getCollisionObservable();
        const observer = observable.add((event) => this.onContact(weapon, event));
        if (observer) this.watching.push({ weapon, remove: () => observable.remove(observer) });
      }
    } catch (error) {
      for (const watch of this.watching) watch.remove();
      this.watching.length = 0;
      throw error;
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
  attach(target: Combatant): void {
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
  get body(): Combatant | null {
    return this.target;
  }

  /** Simulation time, seconds since the run started. */
  get now(): number {
    return this.clock;
  }

  advance(dt: number): void {
    this.clock += dt;
  }

  /** Stop accepting contacts without mutating an observable during its callback. */
  stop(): void {
    this.active = false;
  }

  dispose(): void {
    for (const watch of this.watching) watch.remove();
    this.watching.length = 0;
  }

  private onTrigger(weapon: Striking, trigger: NonSolvingStrikeTrigger,
    event: IBasePhysicsCollisionEvent): void {
    if (event.type === PhysicsEventType.TRIGGER_EXITED) return;
    const collidedAgainst = event.collider === trigger.body ? event.collidedAgainst
      : event.collidedAgainst === trigger.body ? event.collider : null;
    if (!collidedAgainst) return;
    const point = trigger.contactPoint(collidedAgainst);
    // A trigger has no solver manifold by construction. `resolve` still applies the ordinary
    // authored shove from the real fist's material-point velocity; the diagnostic impulse is
    // truthfully zero rather than borrowed from an unrelated anatomy contact.
    this.onContact(weapon, {
      collider: trigger.body,
      colliderIndex: event.collider === trigger.body ? event.colliderIndex : event.collidedAgainstIndex,
      collidedAgainst,
      collidedAgainstIndex: event.collider === trigger.body ? event.collidedAgainstIndex : event.colliderIndex,
      type: PhysicsEventType.COLLISION_STARTED,
      point,
      distance: 0,
      impulse: 0,
      normal: null,
    });
  }

  private onContact(weapon: Striking, event: IPhysicsCollisionEvent): void {
    if (!this.active) return;
    if (event.type === PhysicsEventType.COLLISION_FINISHED) return;
    const refusal = weapon.refusalForContact?.(event.collidedAgainst) ?? null;
    if (refusal !== null) {
      this.onRefusal?.({ reason: refusal, effectorId: weapon.effectorId, at: this.clock });
      return;
    }
    // Debris does not score, and does not parry either. See `Striking.spent`.
    if (weapon.spent) return;
    if (weapon.allowsContact && !weapon.allowsContact(event.collidedAgainst)) return;
    if (!this.target || !event.point) return;
    if (weapon.allowsSourceContact && !weapon.allowsSourceContact(event.point as Vector3)) {
      this.onRefusal?.({ reason: "module-attribution", effectorId: weapon.effectorId, at: this.clock });
      return;
    }
    if (weapon.claimContact && !weapon.claimContact(event.collidedAgainst)) {
      this.onRefusal?.({ reason: "module-attribution", effectorId: weapon.effectorId, at: this.clock });
      return;
    }

    // A bare hand and forearm are both limbs and a guard. Physical interposition
    // decides which one this is: when an attached empty arm is the thing found,
    // it blocks for zero damage before the same body can be filed as a wound.
    if (this.target.parriedBy(event.collidedAgainst, event.point as Vector3)?.kind === "empty") {
      this.parried(weapon, event);
      return;
    }
    const limb = this.target.damageTargetFor?.(event.collidedAgainst, event.point as Vector3) ??
      this.target.limbFor(event.collidedAgainst);
    if (!limb) {
      this.parried(weapon, event);
      return;
    }
    if (limb.severed) return;
    const projectileKey = weapon.projectileImpact ? this.projectileIdentityKey(weapon) : null;
    if (projectileKey !== null ? this.projectileHits.has(projectileKey)
      : this.clock - limb.lastHitAt < CONFIG.combat.hitCooldown) return;
    if (projectileKey !== null) this.projectileHits.add(projectileKey);

    const report = this.resolve(weapon, limb, event);
    if (projectileKey === null) limb.lastHitAt = this.clock;
    this.lastHit = report;
    if (report.damage > 0) this.lastWound = report;
    this.onReport?.({ report, effectorId: weapon.effectorId, hand: weapon.hand, blocked: false });
    this.log.unshift(report);
    if (this.log.length > 24) this.log.length = 24;
  }

  private projectileIdentityKey(weapon: Striking): string {
    if (!Number.isSafeInteger(weapon.projectilePoolIndex) ||
        !Number.isSafeInteger(weapon.shotSerial) || (weapon.shotSerial as number) < 0) {
      throw new Error(`projectile "${weapon.effectorId}" contacted without a live pool identity`);
    }
    return `${this.side}:${weapon.effectorId}:${weapon.projectilePoolIndex}:${weapon.shotSerial}`;
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
  private parried(weapon: Striking, event: IPhysicsCollisionEvent): void {
    const stopped = this.target?.parriedBy(event.collidedAgainst, event.point as Vector3);
    if (!stopped || !event.point) return;
    const prior = this.lastParryAt.get(weapon.effectorId) ?? -999;
    if (this.clock - prior < CONFIG.combat.hitCooldown) return;
    this.lastParryAt.set(weapon.effectorId, this.clock);

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
      preArmourDamage: 0,
      postArmourDamage: 0,
      severed: false,
      at: this.clock,
      point: point.clone(),
      velocity: velocity.clone(),
      edge: weapon.edgeDirection().clone(),
    };
    this.lastHit = report;
    this.onReport?.({ report, effectorId: weapon.effectorId, hand: weapon.hand, blocked: true });
    this.log.unshift(report);
    if (this.log.length > 24) this.log.length = 24;
  }

  private resolve(weapon: Striking, limb: Limb, event: IPhysicsCollisionEvent): HitReport {
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
    if (!weapon.projectileImpact && speed < biteFloor(weapon.kind) && weapon.kind !== "empty") {
      return { ...base, kind: "weak", edgeAlignment: 0, damage: 0,
        preArmourDamage: 0, postArmourDamage: 0, severed: false };
    }

    // A stationary contact has no direction and therefore a zero shove. This
    // branch matters for the fist: its sub-floor contacts deliberately continue
    // into `scoreHit` and the impulse path as zero-damage slaps.
    const direction = this.scratch.direction
      .copyFrom(velocity)
      .scaleInPlace(speed > 0 ? 1 / speed : 0);
    // Signed for the damage model, absolute for the readout. A sword cuts on
    // both sides of its edge axis and does not care; an axe's -X is the poll,
    // and `scoring.ts` is what knows the difference. The report keeps the
    // magnitude because the HUD draws a bar with it.
    const alongEdge = Vector3.Dot(direction, weapon.edgeDirection());
    const edgeAlignment = Math.abs(alongEdge);

    let projectile: ProjectileImpactEvidence | undefined;
    const impactAxis = (weapon.impactBladeDirection?.() ?? weapon.bladeDirection()).clone().normalize();
    const shaftAlignment = Vector3.Dot(direction, impactAxis);
    const score = weapon.projectileImpact
      ? (() => {
        const profile = weapon.projectileImpact as NonNullable<Striking["projectileImpact"]>;
        // Zone geometry and the manifold sample must describe the same arrival pose. Havok can
        // rotate a thin shaft during resolution before this observer reads the node; using its
        // live head with the cached arrival axis classified the mirrored point-first Warden bolt
        // as a shaft hit. Projectiles therefore pair the cached head and axis with the manifold.
        const head = (weapon.impactTipPosition?.() ?? weapon.tipPosition()).clone();
        const axis = impactAxis;
        const nock = head.subtract(axis.scale(profile.lengthM));
        // The reported world contact is the physical evidence. Projecting it onto the shaft
        // made the classifier's radial refusal unreachable, laundering a broad/off-axis
        // manifold into a head, shaft or tail contact by construction.
        const zone = classifyProjectileContactZone(nock, head, point, profile.radiusM);
        // Both vectors are unit axes, but Havok/float32 pose recovery can put their dot a few
        // ulps beyond +/-1. Clamp only this derived cosine at the physics boundary; the pure
        // scorer still refuses an authored out-of-range input.
        const physicalAlignment = Math.max(-1, Math.min(1, shaftAlignment));
        const evaluation = evaluateProjectileImpact({ massKg: profile.massKg, speedMps: speed,
          signedShaftAlignment: physicalAlignment, contactedHead: zone === "head",
          penetrationEfficiency: profile.penetrationEfficiency });
        projectile = {
          identity: Object.freeze({ owner: this.side, effectorId: weapon.effectorId,
            poolIndex: weapon.projectilePoolIndex as number, shotSerial: weapon.shotSerial as number }),
          massKg: profile.massKg, arrivalSpeedMps: speed,
          signedShaftAlignment: physicalAlignment, contactedZone: zone,
          usableEnergyJ: evaluation.usableEnergyJ,
          penetrationEfficiency: profile.penetrationEfficiency,
          uncappedDamage: evaluation.uncappedDamage,
          preArmourDamage: evaluation.score.damage,
          postArmourDamage: 0,
        };
        return evaluation.score;
      })()
      : scoreHit(
        {
          speed,
          edgeAlignment: alongEdge,
          bladeAlignment: Math.abs(shaftAlignment),
          nearTip: Vector3.Distance(point, weapon.tipPosition()) < C.thrustTipZone,
        },
        weapon.kind,
      );
    const { kind, quality } = score;
    const rawDamage = weapon.projectileImpact ? score.damage : score.damage * (weapon.damageScale ?? 1);
    const damage = this.target?.applyDamage?.(limb, rawDamage) ?? rawDamage;
    if (projectile) projectile = Object.freeze({ ...projectile, postArmourDamage: damage });
    if (!this.target?.applyDamage) limb.health -= damage;

    // The blade shoves what it strikes whether or not it bites. A flat slap
    // transfers the most push and the least damage, which is the trade the
    // player is being taught.
    let stabilityShove: HitReport["stabilityShove"];
    if (weapon.authoredSpecificImpulseMps !== undefined) {
      const specificImpulseMps = weapon.authoredSpecificImpulseMps;
      const massKg = limb.part.body.getMassProperties().mass ?? 1;
      const shove = this.scratch.push.copyFrom(direction).scaleInPlace(specificImpulseMps * massKg);
      limb.part.body.applyImpulse(shove, point);
      this.target?.queueStabilityEvent?.({ kind: "specific-impulse", specificImpulseMps });
      stabilityShove = Object.freeze({ kind: "specific-impulse", specificImpulseMps });
    } else {
      const shove = this.scratch.push
        .copyFrom(direction)
        .scaleInPlace(speed * 0.11 * (1.35 - quality * 0.7));
      limb.part.body.applyImpulse(shove, point);
      // This authored transfer, not Havok's solver reaction impulse, is the stability input.
      // Collision callbacks may queue it but cannot change support state or motion type here.
      this.target?.queueStabilityEvent?.({ horizontalShoveNs: [shove.x, shove.z] });
    }

    const severed = severs({ ...score, damage }, limb.health, weapon.kind);
    if (severed) this.target?.sever(limb, direction);

    return { ...base, kind, edgeAlignment, damage, preArmourDamage: rawDamage,
      postArmourDamage: damage, severed, ...(projectile ? { projectile } : {}),
      ...(stabilityShove ? { stabilityShove } : {}) };
  }
}

export function classifyProjectileContactZone(nock: Vector3, head: Vector3, point: Vector3,
  radiusM: number): "head" | "shaft" | "tail" | "other" {
  if (![nock.x, nock.y, nock.z, head.x, head.y, head.z, point.x, point.y, point.z, radiusM]
    .every(Number.isFinite) || radiusM <= 0) {
    throw new Error("projectile contact zone contains invalid geometry");
  }
  const nockToHead = head.subtract(nock);
  const shaftLengthM = nockToHead.length();
  if (shaftLengthM <= 0) throw new Error("projectile contact zone requires a positive shaft length");
  const axis = nockToHead.scale(1 / shaftLengthM);
  const fromNock = point.subtract(nock);
  const axialM = Vector3.Dot(fromNock, axis);
  const radialM = fromNock.subtract(axis.scale(axialM)).length();
  const endZoneM = Math.max(radiusM * 3, shaftLengthM * 0.12);
  if (radialM > radiusM * 3 || axialM < -endZoneM || axialM > shaftLengthM + endZoneM) return "other";
  if (Math.abs(axialM - shaftLengthM) <= endZoneM) return "head";
  if (Math.abs(axialM) <= endZoneM) return "tail";
  return "shaft";
}
