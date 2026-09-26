import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { PhysicsEventType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import type { IBasePhysicsCollisionEvent, IPhysicsCollisionEvent } from
  "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import type { Observable } from "@babylonjs/core/Misc/observable.js";

import type { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody.js";

import { CONFIG } from "./config.ts";
import { effectiveMassAt, type EffectiveMassOptions } from "./body-inertia.ts";
import { StepStart } from "./step-start.ts";
import type { Side } from "./physics.ts";
import type { WeaponKind } from "./hands.ts";
import type { Limb } from "./fighter.ts";
import type { Combatant } from "./units.ts";
import type { HandName } from "./hands.ts";
import { biteFloorJ, biteMechanism, contactImpulseNs, cutEnergyJ, evaluateProjectileImpact, scoreHit,
  severs, type HitKind, type Striker } from "./scoring.ts";

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
  /**
   * The body that strikes, and **the only source of the mass a blow arrives with**: `Combat` reads
   * the effective mass of this body's chain at the contact (`effectiveMassAt`), so the arm behind
   * the item counts, and so do its size and weight.
   *
   * Until physical contact session 05 each striker declared that mass instead (`impactMassKg`:
   * 1.30 kg for a blade, a ram's hand-authored "plate plus a hinge-mass of trunk"). A declared
   * number could say what the item weighed, never what was coupled behind it at that instant.
   */
  readonly body: PhysicsBody;
  /** Supported bodies may replace a solving striker contact with this sensor-only path. */
  readonly nonSolvingTrigger?: NonSolvingStrikeTrigger;
  /** Compound owners must prove the contact belongs to this semantic module leaf. */
  allowsSourceContact?(point: Vector3): boolean;
  /** Stateful effectors may accept at most one contact per target and action instance. */
  claimContact?(body: PhysicsBody): boolean;
  /**
   * Whether this striker bills a given part at most once per `strokeClaimSeconds`.
   *
   * Optional, and absent means the historical rule: every contact past `hitCooldown` is its own
   * blow. See that constant in `config.ts` for what the difference is worth and why the Warrior
   * is deliberately left on the old side of it.
   */
  readonly strokeClaim?: boolean;
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
   * is moving drags it past the then `minArrowSpeed` often enough to be billed: over 12
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
  /**
   * The point Havok's linear velocity belongs to, in world terms. Optional: an `"arrival"` reading
   * (`CONFIG.combat.contactReading`) needs it to place its cached angular velocity, and a striker
   * without it is read about its transform node's position instead.
   *
   * **This and the three answers below it are fixed in `body`.** An `"arrival"` reading carries each
   * back to the solver step's start through `body`'s own change of pose over the step
   * (`StepStart.pointAtStart` and `directionAtStart` in `src/step-start.ts`), which is exact for a
   * point or a direction that rides on `body` and wrong for one that does not. Every solid golem
   * striker is a `RigidStrike` and meets it; a projectile keeps its own arrival pose instead
   * (`impactTipPosition`, `impactBladeDirection`).
   */
  centreOfMass?(): Vector3;
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
  /** Present in multi-actor hosts, including on parries that have no limb key. */
  targetId?: string;
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
  /**
   * How fast the striker was arriving into the surface, m/s: its speed at the point projected on
   * the contact normal.
   *
   * Beside `speed` and never more than it, which is the whole of this session's argument: a rake
   * travels fast across a surface and arrives at nothing. `scoring.ts` scores from this one; the
   * readout keeps both so the difference is visible in the log rather than only in the damage.
   */
  closingSpeed: number;
  /**
   * The striker's effective mass at the contact along its normal, kilograms: the item and the share
   * of the chain behind it that the contact moves (`effectiveMassAt`). A projectile's is its own.
   */
  strikerMassKg: number;
  /** The struck part's effective mass at the same point along the same normal, kilograms. */
  partMassKg: number;
  /**
   * What arrived, joules: `impactEnergyJ` of the striker's mass, the part's, and the closing
   * speed. The number the damage was computed from, kept so a blow can be argued with.
   */
  energyJ: number;
  /** How squarely the edge was travelling into the cut, 0..1. */
  edgeAlignment: number;
  /**
   * How squarely the blade's own axis was driven into the contact, 0..1 -- the thrust's
   * counterpart to `edgeAlignment`.
   *
   * `scoreHit` books a thrust rather than a cut when this beats `edgeAlignment` *and* the
   * contact was made near the point. Both columns are carried because a commanded thrust that
   * booked as a cut has missed one of those two conditions and the report should say which:
   * without this the log showed a thrust-shaped stroke scoring `cut` and gave no way to tell
   * a mistimed edge from a contact made with the middle of the blade.
   */
  bladeAlignment: number;
  /**
   * Metres from the contact to the weapon's tip.
   *
   * The other half of the thrust test: `combat.thrustTipZone` is the distance inside which a
   * contact counts as made with the point. The distance rather than the boolean, because a
   * point that landed 0.35 m back and a blade caught at the hilt are different diagnoses and
   * only one of them is a near miss.
   */
  tipDistanceM: number;
  /** What the solver actually resolved, kept as a diagnostic. */
  solverImpulse: number;
  damage: number;
  /** Damage on the combat-value scale before and after target armour. */
  preArmourDamage: number;
  postArmourDamage: number;
  /** Present only for a physical projectile contact. */
  projectile?: ProjectileImpactEvidence;
  /**
   * The impulse this contact pushed the struck body with, N.s: `contactImpulseNs` of the two
   * effective masses at the closing speed, for a block as for a blow, and 0 for a contact with no
   * direction. It is what the struck body's stability ledger was handed.
   */
  transferNs: number;
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
  /**
   * Whether the thing struck was a part the other body has in a hand.
   *
   * A blow that lands on a held weapon is a parry that costs the weapon: it wounds what it hit,
   * so it is a real report with real damage and `blocked` is false, and it is also a block, so
   * the defender is credited with one. `src/recorder.ts` is where those two readings meet.
   * Absent is false, for every body that has no hands to speak of.
   */
  readonly guarded?: boolean;
}

export interface CombatRefusalEvent {
  readonly reason: "owner-contact" | "inactive-action" | "module-attribution"
    | "impossible-speed";
  readonly effectorId: string;
  readonly at: number;
}

/** A body's whole carried mass, kilograms, and `Infinity` for one nothing integrates. */
const bodyMassKg = (body: PhysicsBody): number => {
  const mass = body.getMassProperties().mass ?? 0;
  return mass > 0 ? mass : Infinity;
};

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
  whip: "Lash",
};

/**
 * The share of its arrival velocity an `"arrival"` reading bills for a striker of `kind`: its row
 * of `CONFIG.combat.arrivalReadFractions`, or of `table` where a `Combat` took that table at
 * construction. Total over `Striker`: a kind added to the union without a case here is a compile
 * error, and a row that is not a fraction throws by name rather than billing nothing or double.
 */
export function arrivalReadFraction(kind: Striker,
  table: Readonly<Record<Striker, number>> = CONFIG.combat.arrivalReadFractions): number {
  switch (kind) {
    case "sword": case "axe": case "bow": case "shield": case "buckler": case "club": case "empty":
    case "whip": case "arrow": case "bite": case "ram": {
      const fraction = table[kind];
      if (!(fraction > 0 && fraction <= 1)) {
        throw new Error(`the arrival fraction for a ${kind} is ${fraction}, which is not in (0, 1]`);
      }
      return fraction;
    }
    default: {
      const unknown: never = kind;
      throw new Error(`no arrival fraction for a striker of kind ${String(unknown)}`);
    }
  }
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
  private targetResolver: ((body: PhysicsBody) => Combatant | null) | null = null;
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

  /**
   * When each striker last billed each part, for `Striking.strokeClaim`.
   *
   * Keyed by the striker and the part together, because the rule is one claim per striker per
   * part: a two-handed body sawing with both blades is two strokes, and one blade crossing two
   * parts is two blows. Kept here rather than on the `Limb` beside `lastHitAt` because a limb
   * is shared with the Warrior, which does not play by this rule and should not carry a map for
   * it; `lastParryAt` above is the same idiom for the same reason.
   */
  private readonly strokeClaims = new Map<string, number>();

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
    normal: new Vector3(),
    contactNormal: new Vector3(),
    rel: new Vector3(),
    centre: new Vector3(),
    edge: new Vector3(),
    blade: new Vector3(),
    tip: new Vector3(),
    point: new Vector3(),
  };

  /**
   * The state every body was in as the solver step began -- each solid striker's velocity, and the
   * pose of every body a reading walks -- for an `"arrival"` reading, and null under the default
   * `"settled"` one. See `CONFIG.combat.contactReading` and `src/step-start.ts`.
   */
  private readonly start: StepStart | null;
  /** `effectiveMassAt`'s options: the step's start under `"arrival"`, and nothing under `"settled"`. */
  private readonly massOptions: EffectiveMassOptions | undefined;
  /** `CONFIG.combat.arrivalReadFractions` as it stood when this was built. */
  private readonly arrivalFractions: Readonly<Record<Striker, number>>;

  constructor(side: Side, weapons: readonly (Striking | null)[], onReport?: (event: CombatReportEvent) => void,
    onRefusal?: (event: CombatRefusalEvent) => void) {
    this.side = side;
    this.onReport = onReport;
    this.onRefusal = onRefusal;
    this.arrivalFractions = { ...CONFIG.combat.arrivalReadFractions };
    if (CONFIG.combat.contactReading === "arrival") {
      for (const weapon of weapons) if (weapon) arrivalReadFraction(weapon.kind, this.arrivalFractions);
    }
    const first = weapons.find((weapon): weapon is Striking => weapon !== null);
    this.start = CONFIG.combat.contactReading === "arrival" && first
      ? new StepStart(first.body.transformNode.getScene()) : null;
    this.massOptions = this.start ? { pose: this.start.poseOf } : undefined;
    try {
      // Projectiles are left to their own `velocityAt`, which already returns a cached free-flight
      // velocity, and to their own cached arrival pose (`impactTipPosition`, `impactBladeDirection`).
      for (const weapon of weapons) if (weapon && !weapon.projectileImpact) this.start?.watchVelocity(weapon.body);
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
      this.start?.dispose();
      throw error;
    }
  }

  /**
   * The step's start for a striker whose contacts it reads -- a solid one under `"arrival"` -- and
   * null for every other. A projectile keeps its own arrival state.
   */
  private startFor(weapon: Striking): StepStart | null {
    return this.start?.velocityOf(weapon.body) ? this.start : null;
  }

  /**
   * The striker's velocity at a contact point, as `CONFIG.combat.contactReading` says to read it.
   *
   * `"settled"` is `velocityAt`: the body after the solver step that found the contact. `"arrival"`
   * is the rigid-body velocity at the same point from the linear and angular velocity sampled before
   * that step, about the centre of mass *where it was then*, scaled by its kind's `arrivalReadFraction`. The
   * point is Havok's, which is from before the step as well, so `r` is a lever the body had rather
   * than the distance it moved in one step.
   */
  private strikerVelocity(weapon: Striking, point: Vector3): Vector3 {
    const arrival = this.arrivalVelocity(weapon, point);
    return arrival
      ? arrival.scaleInPlace(arrivalReadFraction(weapon.kind, this.arrivalFractions))
      : this.scratch.velocity.copyFrom(weapon.velocityAt(point));
  }

  /**
   * The striker's whole velocity at `point` as the step began, unscaled, or null when this striker
   * is not read on arrival. Written into the velocity scratch.
   */
  private arrivalVelocity(weapon: Striking, point: Vector3): Vector3 | null {
    const start = this.startFor(weapon);
    const moving = start?.velocityOf(weapon.body);
    if (!start || !moving) return null;
    const centre = start.pointAtStart(weapon.body,
      weapon.centreOfMass?.() ?? weapon.body.transformNode.position, this.scratch.centre);
    const rel = this.scratch.rel.copyFrom(point).subtractInPlace(centre);
    Vector3.CrossToRef(moving.angular, rel, this.scratch.velocity);
    return this.scratch.velocity.addInPlace(moving.linear);
  }

  /**
   * The striker's edge, length and tip at the instant the contact describes: where they are now
   * under `"settled"`, and carried back to the step's start with the striker's own body under
   * `"arrival"`. Each answer of a `Striking` is fixed in its `body`, which is what makes the carry
   * exact. Each writes its own scratch, so the three never alias one another or the striker's.
   */
  private edgeOf(weapon: Striking): Vector3 {
    const start = this.startFor(weapon);
    return start ? start.directionAtStart(weapon.body, weapon.edgeDirection(), this.scratch.edge) : weapon.edgeDirection();
  }

  private bladeOf(weapon: Striking): Vector3 {
    const impact = weapon.impactBladeDirection?.();
    if (impact) return impact;
    const start = this.startFor(weapon);
    return start ? start.directionAtStart(weapon.body, weapon.bladeDirection(), this.scratch.blade) : weapon.bladeDirection();
  }

  private tipOf(weapon: Striking): Vector3 {
    const start = this.startFor(weapon);
    return start ? start.pointAtStart(weapon.body, weapon.tipPosition(), this.scratch.tip) : weapon.tipPosition();
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
    this.targetResolver = null;
    this.target = target;
    // Under `"arrival"`, the target's pose at each step's start: every part a struck limb's effective
    // mass walks is joined to one of these.
    if (this.start) {
      for (const limb of target.limbs) this.start.track(limb.part.body);
      for (const striker of target.strikers) this.start.track(striker.body);
    }
  }

  /** Multi-actor hosts resolve the struck body, independently of policy target selection. */
  attachResolver(resolve: (body: PhysicsBody) => Combatant | null): void {
    this.targetResolver = resolve;
    this.target = null;
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
    this.start?.dispose();
  }

  private onTrigger(weapon: Striking, trigger: NonSolvingStrikeTrigger,
    event: IBasePhysicsCollisionEvent): void {
    if (event.type === PhysicsEventType.TRIGGER_EXITED) return;
    const collidedAgainst = event.collider === trigger.body ? event.collidedAgainst
      : event.collidedAgainst === trigger.body ? event.collider : null;
    if (!collidedAgainst) return;
    // The owner derives the point from its live source, which is the pose the step *ended* in.
    // Under `"arrival"` every other quantity is read at the step's start, so the point goes back
    // there with the striker's own body, as Havok's manifold point already is.
    const live = trigger.contactPoint(collidedAgainst);
    const start = this.startFor(weapon);
    const point = start ? start.pointAtStart(weapon.body, live, this.scratch.point) : live;
    // A trigger has no solver manifold by construction. `resolve` still files the ordinary
    // transfer along the real fist's material-point velocity; the diagnostic impulse is
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
    if (this.targetResolver) this.target = this.targetResolver(event.collidedAgainst);
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

    // **A striker travelling this fast is the solver, not a blow, and it is refused by name.**
    // Checked here rather than in `resolve` so that a contact nobody is going to score never
    // spends a stroke claim below, and checked before the cooldown is stamped for the same
    // reason. `CONFIG.combat.impossibleSpeed` carries the measurement that places it and the
    // fixture that found it; the short version is that energy goes as the square of the speed,
    // so a 136 m/s excursion that the retired ramp threw away is now a killing blow. Projectiles
    // are exempt because a loosed arrow's speed is authored by the bow.
    //
    // The speed checked is the one the reading bills: under `"arrival"` the striker's whole speed
    // as the step began, before the fraction. Checking the settled speed there let a blade the
    // solver had flung to 220 m/s in the step before through, because the step that found the
    // contact had already slowed it, and billed it at the fraction of its fling.
    const arriving = (this.arrivalVelocity(weapon, event.point as Vector3)
      ?? weapon.velocityAt(event.point as Vector3)).length();
    if (!weapon.projectileImpact && arriving > CONFIG.combat.impossibleSpeed) {
      this.onRefusal?.({ reason: "impossible-speed", effectorId: weapon.effectorId, at: this.clock });
      return;
    }

    const projectileKey = weapon.projectileImpact ? this.projectileIdentityKey(weapon) : null;
    if (projectileKey !== null ? this.projectileHits.has(projectileKey)
      : this.clock - limb.lastHitAt < CONFIG.combat.hitCooldown) return;
    if (projectileKey !== null) this.projectileHits.add(projectileKey);

    // One claim per striker per part per stroke. Checked after the cooldown rather than before
    // it, so a contact the cooldown was going to drop never spends a claim.
    if (weapon.strokeClaim && projectileKey === null) {
      const claim = `${weapon.effectorId}\u0000${limb.key}`;
      if (this.clock - (this.strokeClaims.get(claim) ?? -999) < CONFIG.combat.strokeClaimSeconds) return;
      this.strokeClaims.set(claim, this.clock);
    }

    const report = this.resolve(weapon, limb, event);
    if (projectileKey === null) limb.lastHitAt = this.clock;
    this.lastHit = report;
    if (report.damage > 0) this.lastWound = report;
    this.onReport?.({ report, effectorId: weapon.effectorId, hand: weapon.hand, blocked: false,
      guarded: limb.guarding === true });
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
   *
   * **A striker that claims claims its blocks too**, on `strokeClaimSeconds` rather than
   * `hitCooldown`. A blade laid against a plate is one stroke stopped, and once the plate began
   * answering `parriedBy` on 2026-09-06 the cooldown's rate booked eleven blocks a second for
   * it: a fourteen-second bout of the default build booked 203 blocks in 227 contacts. The rule
   * is per *effector* here rather than per part, because what is being counted is a stroke that
   * did not get through, and it did not get through once however many surfaces it grazed.
   */
  private parried(weapon: Striking, event: IPhysicsCollisionEvent): void {
    const stopped = this.target?.parriedBy(event.collidedAgainst, event.point as Vector3);
    if (!stopped || !event.point) return;
    const prior = this.lastParryAt.get(weapon.effectorId) ?? -999;
    const window = weapon.strokeClaim ? CONFIG.combat.strokeClaimSeconds : CONFIG.combat.hitCooldown;
    if (this.clock - prior < window) return;
    this.lastParryAt.set(weapon.effectorId, this.clock);

    const point = event.point as Vector3;
    const velocity = this.strikerVelocity(weapon, point);
    // **A parry pushes the body behind the guard** (physical contact session 06): the same transfer
    // a blow makes, between the striker and whatever stopped it, each walked back to its own body.
    // A blade caught on a plate drives the plate's owner back by what the blade carried.
    const normal = this.contactNormal(velocity, event);
    const transferNs = normal ? this.transfer(this.strikerMassAt(weapon, point, normal),
      effectiveMassAt(event.collidedAgainst, point, normal, this.massOptions), this.closingSpeedAt(velocity, event),
      normal, velocity, event.collidedAgainst, weapon.body, point.y) : 0;
    const report: HitReport = {
      ...(this.target?.actorId ? { targetId: this.target.actorId } : {}),
      by: this.side,
      weapon: weapon.kind,
      limb: PARRY_LABEL[stopped.kind],
      key: `block:${stopped.kind}`,
      kind: "weak",
      speed: velocity.length(),
      // A block is not a wound and has no struck part, so the four scoring columns are zero
      // rather than invented. `isBlock` is what tells the readout and the log which it is.
      // `tipDistanceM` is not one of them: where on the blade the block landed is a fact about
      // the geometry, true whether or not anything was scored, and it is what says whether a
      // shield caught the point or the forte.
      closingSpeed: 0,
      strikerMassKg: 0,
      partMassKg: 0,
      energyJ: 0,
      edgeAlignment: 0,
      bladeAlignment: 0,
      tipDistanceM: Vector3.Distance(point, this.tipOf(weapon)),
      solverImpulse: event.impulse,
      transferNs,
      damage: 0,
      preArmourDamage: 0,
      postArmourDamage: 0,
      severed: false,
      at: this.clock,
      point: point.clone(),
      velocity: velocity.clone(),
      edge: this.edgeOf(weapon).clone(),
    };
    this.lastHit = report;
    this.onReport?.({ report, effectorId: weapon.effectorId, hand: weapon.hand, blocked: true });
    this.log.unshift(report);
    if (this.log.length > 24) this.log.length = 24;
  }

  /**
   * How fast the striker was arriving *into the surface* at the contact point, m/s.
   *
   * The striker's velocity at the point, projected on the contact normal. Only the normal
   * component of a collision is lost to deformation -- the tangential part is friction's
   * business -- so this is the speed that `impactEnergyJ` is entitled to square, and it is what
   * separates a square blow from a rake: measured over a golem-versus-golem bout, a contact's
   * normal speed is 46 % of its tip speed at the median and 93 % at the ninetieth percentile.
   *
   * **The struck part's own velocity is deliberately not subtracted, and that is a correction to
   * the session plan made by measuring.** The plan asked for the striker's velocity *less the
   * part's*, which is the right physics and unavailable here: a collision callback runs after
   * Havok has solved the contact, so the part has already been given most of the striker's
   * normal velocity by the time this is asked. Measured on the same bout, the relative normal
   * speed reads 1.56 m/s at the median against the striker's own 2.25, and on a keyframed
   * striker -- the armour bench's hammer, which cannot be slowed -- it collapses from 8.0 m/s to
   * 0.39, because there the part absorbs the whole of it. That is the solver's answer to the
   * contact and not the blow's arrival, which is the same objection this file's head raises
   * against scoring from `event.impulse`. What is lost by leaving it out is a body walking into
   * a cut, which pays as though it had stood still.
   *
   * **The magnitude of the projection, not the signed value**, and that is Havok's convention
   * rather than a choice. The plugin hands `contactOnA.normal` to one observer and
   * `contactOnB.normal` -- the same plane, the opposite way round -- to the other, so which side
   * of the manifold a `Combat` is standing on decides the sign and nothing about the blow does.
   *
   * A manifold with no usable normal falls back to the unprojected speed, which is the generous
   * reading: it is what the model scored before it learned to project. Havok populates the
   * normal for every collision event that is not `COLLISION_FINISHED`, so this is a guard and
   * not a path.
   */
  private closingSpeedAt(strikerVelocity: Vector3, event: IPhysicsCollisionEvent): number {
    const normal = event.normal;
    if (!normal) return strikerVelocity.length();
    const unit = this.scratch.normal.copyFrom(normal);
    const length = unit.length();
    if (!(length > 1e-6)) return strikerVelocity.length();
    return Math.abs(Vector3.Dot(strikerVelocity, unit)) / length;
  }

  /**
   * The unit direction both effective masses are read along: the manifold's normal, which is the
   * line `closingSpeedAt` squares the speed on, or the striker's own direction where the manifold
   * has none. Null for a contact with neither, which arrives with no energy to price.
   */
  private contactNormal(strikerVelocity: Vector3, event: IPhysicsCollisionEvent): Vector3 | null {
    const unit = this.scratch.contactNormal;
    const length = event.normal ? unit.copyFrom(event.normal).length() : 0;
    if (length > 1e-6) return unit.scaleInPlace(1 / length);
    const speed = strikerVelocity.length();
    return speed > 1e-6 ? unit.copyFrom(strikerVelocity).scaleInPlace(1 / speed) : null;
  }

  /** What arrives behind the striker at the contact: a projectile's own mass, or its chain's. */
  private strikerMassAt(weapon: Striking, point: Vector3, normal: Vector3): number {
    return weapon.projectileImpact ? weapon.projectileImpact.massKg
      : effectiveMassAt(weapon.body, point, normal, this.massOptions);
  }

  /**
   * File what a contact pushed the struck body with, and say how much, N.s (physical contact
   * session 06).
   *
   * The impulse of an inelastic contact between the two effective masses along the contact normal,
   * turned to point the way the striker was travelling, since Havok hands either side of the
   * manifold its own sign. Its horizontal part is the stability ledger's input and its vertical part
   * rides along for session 07.
   *
   * **Nothing is applied to a body here.** The solver has already resolved this contact by the time
   * a collision callback runs, and its own impulse is the physical push; the authored impulse this
   * replaced was added on top of it. What the ledger needs is the reading, not a second push.
   *
   * The struck part and the striker go with it, so the target can refuse a contact its contact press
   * is already reading (`Golem.queueStabilityEvent`, physical contact session 07), and so does the
   * height it landed at, which the ledger reads as a lever about the base (physical contact session
   * 08).
   *
   * **What is filed is the physical impulse, for every contact.** Physical contact session 08 first
   * filed seven times it (`BLOW_GAIN`), because with every blow read at the centre of mass's height
   * an x1 stone mirror all but never fell. Once a blow's height reached the ledger as its lever, the
   * stone mirror fell 0.49 [0.34, 0.66] times a body a bout with no gain at all (96 pairs, Node
   * research runner), and the gain went.
   */
  private transfer(strikerMassKg: number, struckMassKg: number, closingSpeed: number, normal: Vector3,
    velocity: Vector3, struck: PhysicsBody, striker: PhysicsBody, atY: number): number {
    if (!(closingSpeed > 0)) return 0;
    const impulseNs = contactImpulseNs(strikerMassKg, struckMassKg, closingSpeed);
    const along = this.scratch.push.copyFrom(normal);
    if (Vector3.Dot(along, velocity) < 0) along.scaleInPlace(-1);
    along.scaleInPlace(impulseNs);
    this.target?.queueStabilityEvent?.({ horizontalShoveNs: [along.x, along.z], verticalShoveNs: along.y, atY },
      struck, striker);
    return impulseNs;
  }

  private resolve(weapon: Striking, limb: Limb, event: IPhysicsCollisionEvent): HitReport {
    const C = CONFIG.combat;
    const point = event.point as Vector3;

    const velocity = this.strikerVelocity(weapon, point);
    const speed = velocity.length();
    // Both masses are effective masses at the contact, along one normal (physical contact session
    // 05): each side's chain, walked back to a trunk that floats with the rest of its body, so a
    // blow carries the arm behind the item and lands on the limb behind the part. One contact,
    // one model, and session 06's knockback reads the same pair.
    //
    // A body nothing integrates -- a static post, a wall, a bench stand -- reads `Infinity`, which
    // `impactEnergyJ` takes as immovable and answers with the striker's whole kinetic energy: the
    // right answer for hitting something that cannot move, and the ceiling on every other answer.
    const closingSpeed = this.closingSpeedAt(velocity, event);
    const normal = this.contactNormal(velocity, event);
    const partMassKg = normal ? effectiveMassAt(limb.part.body, point, normal, this.massOptions)
      : bodyMassKg(limb.part.body);
    const strikerMassKg = normal ? this.strikerMassAt(weapon, point, normal)
      : weapon.projectileImpact ? weapon.projectileImpact.massKg : bodyMassKg(weapon.body);
    // A stationary contact has no direction and therefore a zero shove. This
    // branch matters for the fist: its sub-floor contacts deliberately continue
    // into `scoreHit` and the impulse path as zero-damage slaps.
    //
    // Computed here rather than after the floor test, which is where it used to sit, because an
    // edge's floor can now be cleared by the slide as well as by the press and the amount of
    // credit the slide gets depends on how well the edge was aligned. The early-out cannot ask
    // that question without this answer. The three dot products it was placed below were the
    // thing the early-out existed to skip, so the skip is now smaller -- and correct.
    const direction = this.scratch.direction
      .copyFrom(velocity)
      .scaleInPlace(speed > 0 ? 1 / speed : 0);
    // Signed for the damage model, absolute for the readout. A sword cuts on
    // both sides of its edge axis and does not care; an axe's -X is the poll,
    // and `scoring.ts` is what knows the difference. The report keeps the
    // magnitude because the HUD draws a bar with it.
    const edge = this.edgeOf(weapon);
    const alongEdge = Vector3.Dot(direction, edge);
    const edgeAlignment = Math.abs(alongEdge);
    // Hoisted above the early-out for the same reason `alongEdge` was: these two describe the
    // contact, not the score, and a weak contact that is dropped without them cannot be told
    // apart from a square one afterwards. The cost is a normalize, a dot and a distance on the
    // path that skips scoring, which is what the log is worth.
    const impactAxis = this.bladeOf(weapon).clone().normalize();
    const shaftAlignment = Vector3.Dot(direction, impactAxis);
    const bladeAlignment = Math.abs(shaftAlignment);
    const tipDistanceM = Vector3.Distance(point, this.tipOf(weapon));
    const nearTip = tipDistanceM < C.thrustTipZone;
    // What the blow is actually charged at, which is `closingSpeed` alone unless `drawFraction`
    // is paying an aligned edge for its slide. One copy of that rule, in `scoring.ts`, because
    // this file and `scoreHit` have to agree on it or a dial set in one does nothing in the other.
    const energyJ = cutEnergyJ({
      closingSpeed,
      speed,
      strikerMassKg,
      partMassKg,
      edgeAlignment: alongEdge,
      bladeAlignment,
      nearTip,
    }, weapon.kind);

    const base = {
      ...(this.target?.actorId ? { targetId: this.target.actorId } : {}),
      by: this.side,
      limb: limb.label,
      key: limb.key,
      weapon: weapon.kind,
      solverImpulse: event.impulse,
      speed,
      closingSpeed,
      strikerMassKg,
      partMassKg,
      energyJ,
      bladeAlignment,
      tipDistanceM,
      at: this.clock,
      point: point.clone(),
      velocity: velocity.clone(),
      edge: this.edgeOf(weapon).clone(),
    };

    // The weapon's own floor, asked of the table rather than assumed to be the
    // blade's. This early-out exists to skip a divide and three dot products for
    // a contact too slight to be worth anything, and that is all it is allowed to
    // be: for most of a year it was `speed < C.minCutSpeed`, which meant a club
    // below 3.0 m/s never reached `scoreHit` and `minCrushSpeed` was a setting
    // that worked only in its unit test.
    //
    // Blunt is exempt, where it used to be the bare fist alone. A sub-floor blunt contact is a
    // **slap**: it scores nothing, and `scoreHit` is what files it as one, so it has to reach it;
    // the mechanism is what says which contacts those are rather than a list of kinds. (It used
    // to have to reach the shove as well; every contact is shoved just below, before it.) A
    // point's floor is against its *axial* energy, which is never more than this, so a contact
    // that fails here would have failed there too.
    // Every contact shoves what it strikes, whether or not it bites, and before the early-out below
    // for that reason: the momentum the contact moved, from the same pair of masses its energy is
    // priced on (physical contact session 06). A blade leaned on pushes by what it carries, as a
    // slap does, because the solver does not know which side of a blade arrived.
    const transferNs = normal ? this.transfer(strikerMassKg, partMassKg, closingSpeed, normal, velocity,
      event.collidedAgainst, weapon.body, point.y) : 0;
    if (!weapon.projectileImpact && energyJ < biteFloorJ(weapon.kind)
      && biteMechanism(weapon.kind) !== "blunt") {
      // The alignment is reported rather than zeroed. It used to be a hard zero because it had
      // genuinely not been computed yet at this point in the method; `drawFraction` moved the
      // edge dot products above this early-out, so zeroing now discards a number sitting in
      // scope and tells the HUD a brush was flat when it may have been square. Nothing keys off
      // the old zero -- `scripts/bout-runner.mjs` drops weak contacts by `kind`, which is what
      // its `alignments` column is about -- so this is strictly more of what happened.
      return { ...base, kind: "weak", edgeAlignment, damage: 0,
        preArmourDamage: 0, postArmourDamage: 0, severed: false, transferNs };
    }

    let projectile: ProjectileImpactEvidence | undefined;
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
          closingSpeed,
          strikerMassKg,
          partMassKg,
          edgeAlignment: alongEdge,
          bladeAlignment,
          nearTip,
          speed,
        },
        weapon.kind,
      );
    const { kind } = score;
    const rawDamage = weapon.projectileImpact ? score.damage : score.damage * (weapon.damageScale ?? 1);
    const damage = this.target?.applyDamage?.(limb, rawDamage, kind) ?? rawDamage;
    if (projectile) projectile = Object.freeze({ ...projectile, postArmourDamage: damage });
    if (!this.target?.applyDamage) limb.health -= damage;

    const severed = severs({ ...score, damage }, limb, weapon.kind);
    if (severed) this.target?.sever(limb, direction);

    return { ...base, kind, edgeAlignment, damage, preArmourDamage: rawDamage,
      postArmourDamage: damage, severed, transferNs, ...(projectile ? { projectile } : {}) };
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
