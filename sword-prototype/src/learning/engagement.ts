import { isShooting, isStriking, type Striker } from "../hands.ts";
import type { FighterView } from "../mind.ts";
import { OPPORTUNITY_WINDOW_SECONDS, STALL_WINDOW_SECONDS } from "./tournament.ts";

export interface AttackOpportunity {
  readonly key: string;
  /**
   * Which effector this row belongs to, as a field rather than as a substring of
   * `key`.
   *
   * The key has carried it since the tracker was written -- `hand:${hand}:${weapon}`
   * -- and one caller was parsing it back out while a second dropped the hand
   * entirely. `tactical-teacher.ts`'s `rowEffector` split on `":"`;
   * `opportunitiesForAction` did not look at the hand at all and answered a list its
   * one caller took `[0]` of. Naming the field is what lets a caller ask for *the*
   * opportunity a decision names instead of the first one that happens to hold the
   * right weapon.
   */
  readonly effector: string;
  readonly striker: Striker | string;
  readonly viable: boolean;
  readonly rangeMargin: number;
  readonly facingError: number;
}

export interface EngagementRecord {
  viableOpportunities: number;
  attacksInWindow: number;
  damagingContactsInWindow: number;
  firstAttackSeconds: number | null;
  nearRangeStallSeconds: number;
  longestProgressDroughtSeconds: number;
  radialClosingMetres: number;
  tangentialTravelMetres: number;
  accumulatedBearingRadians: number;
  retreatOutsideReachSeconds: number;
}

interface NaturalAttackView { readonly reach: number; readonly ready: boolean; readonly active: boolean }
interface UnlikeBodyView {
  readonly naturalAttacks?: Readonly<Record<string, NaturalAttackView>>;
  readonly collisionRadius?: number;
}

const wrap = (angle: number): number => {
  let result = angle;
  while (result > Math.PI) result -= Math.PI * 2;
  while (result < -Math.PI) result += Math.PI * 2;
  return result;
};

const facingError = (view: FighterView): number => wrap(Math.atan2(
  view.opponent.ground.x - view.self.ground.x,
  view.opponent.ground.z - view.self.ground.z,
) - view.self.facing);

/** Published geometry only: hands/natural attacks, the factual measure and headings. */
export function attackOpportunity(view: FighterView): readonly AttackOpportunity[] {
  const error = facingError(view); const rows: AttackOpportunity[] = [];
  for (const [hand, capability] of Object.entries(view.self.hands)) {
    if (capability.lost || (!isStriking(capability.weapon) && !isShooting(capability.weapon))) continue;
    const shooting = isShooting(capability.weapon);
    const bodyMargin = Math.max(0, view.opponent.collisionRadius);
    const minimum = shooting ? view.self.collisionRadius + bodyMargin : 0;
    const maximum = shooting ? Number.POSITIVE_INFINITY : capability.reach + (capability.weapon === "empty" ? 0 : bodyMargin);
    const rangeMargin = Math.min(view.measure - minimum, maximum - view.measure);
    rows.push(Object.freeze({ key: `hand:${hand}:${capability.weapon}`, effector: hand, striker: capability.weapon,
      viable: rangeMargin >= 0 && Math.abs(error) <= (shooting ? 0.18 : 0.55), rangeMargin, facingError: error }));
  }
  const natural = (view.self as typeof view.self & UnlikeBodyView).naturalAttacks ?? {};
  for (const [name, capability] of Object.entries(natural)) {
    const rangeMargin = capability.reach + Math.max(0, view.opponent.collisionRadius) - view.measure;
    rows.push(Object.freeze({ key: `natural:${name}`, effector: "natural", striker: name,
      viable: capability.ready && rangeMargin >= 0 && Math.abs(error) <= 0.60, rangeMargin, facingError: error }));
  }
  return Object.freeze(rows);
}

export function engagementRecord(): EngagementRecord {
  return { viableOpportunities: 0, attacksInWindow: 0, damagingContactsInWindow: 0,
    firstAttackSeconds: null, nearRangeStallSeconds: 0, longestProgressDroughtSeconds: 0,
    radialClosingMetres: 0, tangentialTravelMetres: 0, accumulatedBearingRadians: 0,
    retreatOutsideReachSeconds: 0 };
}

interface OpenOpportunity { readonly key: string; readonly openedAt: number; attackedAt: number | null; contacted: boolean }

/**
 * The one opportunity a decision names -- an action *and* an effector -- or null.
 *
 * **It was `opportunitiesForAction(view, action)` and its one caller took `[0]`,
 * and that pair silently deleted damaging contacts.** The filter read the weapon
 * and never the hand, so on `warrior/empty+empty` every `punch` decision, whichever
 * fist it named, was attributed to whichever fist `attackOpportunity` enumerates
 * first: measured over a real 2,400-step bout, `hand:primary:empty` in **98 of 98**
 * samples where a punch was viable. A `punch|secondary` therefore set `attackedAt`
 * on the primary fist's opportunity; the contact then arrived keyed
 * `hand:secondary:empty`, whose `attackedAt` was still null, and
 * `EngagementTracker.contact` returned early. The window counts that feed NEAT-QD's
 * feasibility gate, DAgger's engagement floor and the frozen tournament row were
 * then a record of a hand that had not attacked. Measured on that bout at 0.10 s
 * persistence, the harness credited **2** damaging contacts where the named hand
 * landed **1**.
 *
 * The mechanism predates the stage that made it reachable -- `DaggerLabel` has
 * carried `effector` since stage C2b -- but until the look-ahead beam named a hand,
 * every producer of a `punch` on that body happened to name the same hand `[0]` did:
 * `chooseEffector` answers `primary` there.
 *
 * It answers one row or none rather than a list, because with the effector named
 * there is at most one -- a hand appears once in `attackOpportunity` and so does a
 * natural attack. A caller taking `[0]` of a list is the shape this defect had.
 *
 * The action/striker arm stays, because an effector alone does not say whether what
 * that hand holds can perform the action; `viable` stays, because an opportunity out
 * of range is not one.
 */
export function opportunityForAction(view: FighterView, action: string, effector: string): AttackOpportunity | null {
  return attackOpportunity(view).find((row) => row.viable && row.effector === effector &&
    (action === "shoot" ? row.striker === "bow"
      : action === "bite" ? row.key === "natural:bite" : action === "punch" ? row.striker === "empty"
        : action === "cut" ? row.striker !== "empty" && row.striker !== "bow"
          : action === "thrust" ? row.striker === "sword" : false)) ?? null;
}

export function opportunityKeyForContact(hand: string, striker: string): string {
  return striker === "bite" ? "natural:bite" : `hand:${hand}:${striker === "arrow" ? "bow" : striker}`;
}

/** One tracker belongs to one actor in one bout. Samples never turn one range episode into frame spam. */
export class EngagementTracker {
  readonly record: EngagementRecord;
  private readonly open = new Map<string, OpenOpportunity>();
  private previous: { x: number; z: number; opponentX: number; opponentZ: number; bearing: number; clock: number } | null = null;
  private progressDrought = 0;

  constructor(record: EngagementRecord = engagementRecord()) { this.record = record; }

  sample(view: FighterView, dt: number): void {
    const step = Math.max(0, dt); const viable = attackOpportunity(view).filter((row) => row.viable);
    const viableKeys = new Set(viable.map((row) => row.key));
    for (const row of viable) if (!this.open.has(row.key)) {
      this.open.set(row.key, { key: row.key, openedAt: view.clock, attackedAt: null, contacted: false });
      this.record.viableOpportunities += 1;
    }
    for (const [key, opportunity] of this.open) if (!viableKeys.has(key) &&
        (opportunity.attackedAt === null || view.clock - opportunity.attackedAt > OPPORTUNITY_WINDOW_SECONDS)) this.open.delete(key);

    const dx = view.opponent.ground.x - view.self.ground.x;
    const dz = view.opponent.ground.z - view.self.ground.z;
    const length = Math.hypot(dx, dz) || 1; const ux = dx / length; const uz = dz / length;
    if (this.previous) {
      const selfDx = view.self.ground.x - this.previous.x; const selfDz = view.self.ground.z - this.previous.z;
      const opponentDx = view.opponent.ground.x - this.previous.opponentX;
      const opponentDz = view.opponent.ground.z - this.previous.opponentZ;
      const relativeX = selfDx - opponentDx; const relativeZ = selfDz - opponentDz;
      const radial = relativeX * ux + relativeZ * uz;
      const tangential = relativeX * -uz + relativeZ * ux;
      this.record.radialClosingMetres += Math.max(0, radial);
      this.record.tangentialTravelMetres += Math.abs(tangential);
      const bearing = Math.atan2(dx, dz);
      this.record.accumulatedBearingRadians += Math.abs(wrap(bearing - this.previous.bearing));
      if (viable.length && radial <= 0.0005) this.progressDrought += step;
      else this.progressDrought = 0;
      if (this.progressDrought >= STALL_WINDOW_SECONDS) this.record.nearRangeStallSeconds += step;
      this.record.longestProgressDroughtSeconds = Math.max(this.record.longestProgressDroughtSeconds, this.progressDrought);
    }
    const capableReach = Math.max(0,
      ...Object.values(view.self.hands).filter((hand) => !hand.lost).map((hand) => isShooting(hand.weapon) ? Number.POSITIVE_INFINITY : hand.reach),
      ...Object.values((view.self as typeof view.self & UnlikeBodyView).naturalAttacks ?? {}).map((attack) => attack.reach));
    if (!viable.length && view.measure > capableReach + Math.max(0, view.opponent.collisionRadius)) {
      this.record.retreatOutsideReachSeconds += step;
    }
    this.previous = { x: view.self.ground.x, z: view.self.ground.z,
      opponentX: view.opponent.ground.x, opponentZ: view.opponent.ground.z,
      bearing: Math.atan2(dx, dz), clock: view.clock };
  }

  attack(key: string, at: number): void {
    const opportunity = this.open.get(key);
    if (!opportunity || opportunity.attackedAt !== null || at - opportunity.openedAt > OPPORTUNITY_WINDOW_SECONDS) return;
    opportunity.attackedAt = at; this.record.attacksInWindow += 1;
    if (this.record.firstAttackSeconds === null) this.record.firstAttackSeconds = at;
  }

  contact(key: string, at: number, damage: number): void {
    const opportunity = this.open.get(key);
    if (!opportunity || opportunity.attackedAt === null || opportunity.contacted || damage <= 0 ||
        at - opportunity.attackedAt > OPPORTUNITY_WINDOW_SECONDS) return;
    opportunity.contacted = true; this.record.damagingContactsInWindow += 1;
  }

  viableKeys(): readonly string[] { return Object.freeze([...this.open.keys()]); }

  reset(): void { this.open.clear(); this.previous = null; this.progressDrought = 0; Object.assign(this.record, engagementRecord()); }
}
