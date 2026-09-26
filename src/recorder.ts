import type { CombatReportEvent } from "./combat.ts";
import type { FighterView, Intent } from "./mind.ts";
import { attackOpportunity, engagementRecord, EngagementTracker, type EngagementRecord } from "./engagement.ts";
import { HANDS, type HandName, type Striker } from "./hands.ts";
import type { Side } from "./physics.ts";
import type { ControlEndpoint } from "./control-host.ts";

export const ENGAGEMENT_INSTRUMENT_VERSION = 3;

export interface RecorderSample {
  readonly view: FighterView;
  readonly dt: number;
  readonly clock: number;
}

export interface BodyNeutralControlEvent {
  readonly version: 3;
  readonly side: Side;
  readonly sequence: number;
  readonly surface: string;
  readonly kind: "combat" | "control";
  readonly payload: Readonly<Record<string, unknown>>;
}

type IntentEdge = Parameters<typeof recordIntentAttack>[3];
type SampleEdge = Parameters<typeof recordBehaviourSample>[3];

const opposite = (side: Side): Side => side === "left" ? "right" : "left";

/** One label-free behaviour record for each body in one bout. */
export class BoutRecorder {
  readonly records: Readonly<Record<Side, BehaviourRecord>>;
  readonly engagement: Readonly<Record<Side, BehaviourRecord["engagement"]>>;
  readonly controlEvents: BodyNeutralControlEvent[] = [];
  private readonly intentEdges: Record<Side, IntentEdge> = { left: {}, right: {} };
  private readonly pendingIntents: Record<Side, Intent | null> = { left: null, right: null };
  private readonly pendingViews: Record<Side, FighterView | null> = { left: null, right: null };
  private readonly samples: Record<Side, SampleEdge> = { left: {}, right: {} };
  private contactSequence = 0;
  private readonly controlSequence: Record<Side, number> = { left: 0, right: 0 };

  constructor() {
    const records = { left: behaviourRecord(), right: behaviourRecord() };
    this.records = Object.freeze(records);
    this.engagement = Object.freeze({
      left: records.left.engagement,
      right: records.right.engagement,
    });
  }

  sample(side: Side, { view, dt, clock }: RecorderSample): void {
    if (view.clock !== clock) {
      throw new Error(`recorder sample clock ${clock} disagrees with published view clock ${view.clock}`);
    }
    recordBehaviourSample(this.records[side], view, dt, this.samples[side]);
    const intent = this.pendingIntents[side];
    const observedView = this.pendingViews[side];
    this.pendingIntents[side] = null;
    this.pendingViews[side] = null;
    if (intent && observedView) recordIntentAttack(this.records[side], observedView, intent, this.intentEdges[side]);
  }

  intent(side: Side, view: FighterView, intent: Intent): void {
    if (this.pendingIntents[side]) throw new Error(`recorder received two ${side} intents before one sample`);
    this.pendingViews[side] = view;
    this.pendingIntents[side] = intent;
  }

  combat(striker: Side, event: CombatReportEvent): void {
    const contactId = `${striker}:${this.contactSequence}`;
    this.contactSequence += 1;
    if (event.hand === null) {
      this.controlEvents.push(Object.freeze({
        version: 3, side: striker, sequence: this.controlSequence[striker],
        surface: "construct-v3", kind: "combat",
        payload: Object.freeze({ effectorId: event.effectorId, weapon: event.report.weapon,
          damage: event.report.damage, blocked: event.blocked, at: event.report.at,
          projectile: event.report.projectile ?? null }),
      }));
      this.controlSequence[striker] += 1;
      return;
    }
    const factual = {
      hand: event.hand,
      weapon: event.report.weapon,
      damage: event.report.damage,
      at: event.report.at,
      contactId,
    };
    recordCombatEvent(this.records[striker], { ...factual, blocked: false });
    // Two ways to be blocked, one booking. `blocked` is a contact that found a guard and did
    // nothing -- a Warrior's shield, and since 2026-09-06 a golem's plate. `guarded` is a
    // contact that found something the other body was *holding*: it wounds what it hit and is
    // still a parry, and the defender is credited for it exactly the same way, on the same
    // de-duplication. The striker's own row above books the contact and its damage either way.
    if (event.blocked || event.guarded) {
      recordCombatEvent(this.records[opposite(striker)], { ...factual, damage: 0, blocked: true, defending: true });
    }
  }

  /** Command surfaces publish their own body-neutral payload; the bout recorder only orders it. */
  control(side: Side, surface: string, payload: Readonly<Record<string, unknown>>): void {
    this.controlEvents.push(Object.freeze({
      version: 3, side, sequence: this.controlSequence[side], surface, kind: "control",
      payload: Object.freeze({ ...payload }),
    }));
    this.controlSequence[side] += 1;
  }
}

type RecordedBody = { readonly control: ControlEndpoint };

/** Attach the command seam once, independent of which loop owns the bodies. */
export function wireBoutRecorder(recorder: BoutRecorder, left: RecordedBody, right: RecordedBody): void {
  left.control.recording?.attach(recorder, "left");
  right.control.recording?.attach(recorder, "right");
}

/** One combat callback that records first and then preserves an optional harness observer. */
export function combatRecorder(recorder: BoutRecorder, striker: Side,
  observer?: (event: CombatReportEvent) => void): (event: CombatReportEvent) => void {
  return (event) => { recorder.combat(striker, event); observer?.(event); };
}

/** Sample both published views at the common 240 Hz control boundary. */
export function sampleBoutRecorder(recorder: BoutRecorder, left: RecordedBody, right: RecordedBody,
  dt: number, clock: number): void {
  void recorder;
  left.control.recording?.sample(dt, clock);
  right.control.recording?.sample(dt, clock);
}

/**
 * One contact, as the behaviour record files it.
 *
 * The behaviour record lived in `src/options.ts` beside the option layer until skill ceiling
 * session 06 retired that layer. The option-keyed half of it (time per option, transitions,
 * attempts per option, the longest occupancy) went with the layer: the recorder had always passed
 * no option, so those fields were zeros nobody read. What is left is what `research/` and the
 * tests read -- the range bins, contacts, blocks, damage and the engagement record.
 */
export interface CombatEvent {
  hand: HandName; weapon: Striker; damage: number; blocked: boolean;
  /** Optional only for old parity rows; factual evaluators always supply both. */
  at?: number; opportunityKey?: string; defending?: boolean; contactId?: string;
}
export interface BehaviourRecord {
  rangeBins: [number, number, number, number];
  contacts: Record<HandName, number>; contactsByKind: Partial<Record<Striker, number>>;
  blocks: number; crouchTime: number; trunkTwistSignChanges: number; damage: number; vitality: number; win: boolean; seconds: number;
  engagement: EngagementRecord;
  /** Private recorder state; durable reporters omit underscore-prefixed fields. */
  _engagement: EngagementTracker; _lastBlockAt: Record<string, number>; _blocksSeen: Set<string>;
}
/**
 * The durable record owned by `BoutRecorder` in both the page and bench loops.
 *
 * Its three writers remain separate because geometry samples, selected intent
 * and combat resolution arrive on three different seams. `BoutRecorder` owns
 * their ordering and side attribution; these functions own what each fact means.
 */
export function behaviourRecord(): BehaviourRecord {
  const engagement = engagementRecord();
  const record = { rangeBins: [0, 0, 0, 0], contacts: { primary: 0, secondary: 0 }, contactsByKind: {},
    blocks: 0, crouchTime: 0, trunkTwistSignChanges: 0, damage: 0, vitality: 1, win: false, seconds: 0,
    engagement } as unknown as BehaviourRecord;
  Object.defineProperties(record, {
    _engagement: { value: new EngagementTracker(engagement), enumerable: false },
    _lastBlockAt: { value: {}, enumerable: false },
    _blocksSeen: { value: new Set<string>(), enumerable: false },
  });
  return record;
}
export function recordCombatEvent(record: BehaviourRecord, event: CombatEvent): void {
  if (!event.defending) {
    record.contacts[event.hand] += 1; record.contactsByKind[event.weapon] = (record.contactsByKind[event.weapon] ?? 0) + 1;
    record.damage += event.damage;
  }
  if (event.blocked) {
    const key = `${event.hand}:${event.weapon}`; const previous = record._lastBlockAt[key] ?? -Infinity;
    const unseen = event.contactId === undefined || !record._blocksSeen.has(event.contactId);
    const separated = event.contactId !== undefined || event.at === undefined || event.at - previous >= 0.20;
    if (unseen && separated) {
      record.blocks += 1;
      if (event.contactId !== undefined) record._blocksSeen.add(event.contactId);
      if (event.at !== undefined) record._lastBlockAt[key] = event.at;
    }
  }
  if (event.at !== undefined) {
    const factualKey = event.weapon === "bite" ? "natural:bite"
      : `hand:${event.hand}:${event.weapon === "arrow" ? "bow" : event.weapon}`;
    record._engagement.contact(event.opportunityKey ?? factualKey, event.at, event.damage);
  }
}
export function recordIntentAttack(record: BehaviourRecord, view: FighterView, intent: Intent,
  previous: { thrust?: Record<HandName, boolean>; guard?: Record<HandName, boolean>; natural?: boolean }): void {
  previous.thrust ??= { primary: false, secondary: false };
  previous.guard ??= { primary: false, secondary: false };
  previous.natural ??= false;
  const opportunities = attackOpportunity(view).filter((row) => row.viable);
  for (const row of opportunities) {
    if (row.key.startsWith("natural:")) {
      // The natural channel, not `primary`. This read the primary hand's button
      // on a body that publishes no hands, which was the alias itself: the
      // exception lived here as a comment and in `Centipede.update` as a fact.
      if (intent.natural.thrust && !previous.natural) record._engagement.attack(row.key, view.clock);
      continue;
    }
    const [, handName] = row.key.split(":"); const hand = handName as HandName;
    const shot = row.striker === "bow" && previous.thrust[hand] && !intent[hand].thrust;
    const committed = row.striker !== "bow" && ((intent[hand].thrust && !previous.thrust[hand]) ||
      (previous.guard[hand] && !intent[hand].guard));
    if (shot || committed) record._engagement.attack(row.key, view.clock);
  }
  for (const hand of HANDS) { previous.thrust[hand] = intent[hand].thrust; previous.guard[hand] = intent[hand].guard; }
  previous.natural = intent.natural.thrust;
}
export function recordBehaviourSample(record: BehaviourRecord, view: FighterView, dt: number,
  previous: { twistSign?: number }): void {
  const bin = view.measure < 0.7 ? 0 : view.measure < 1.2 ? 1 : view.measure < 1.8 ? 2 : 3; record.rangeBins[bin] += dt;
  record._engagement.sample(view, dt);
  const sign = Math.sign(view.self.trunkTwist); if (previous.twistSign && sign && previous.twistSign !== sign) record.trunkTwistSignChanges += 1;
  if (sign) previous.twistSign = sign; record.crouchTime += view.self.crouch * dt; record.vitality = view.self.vitality; record.seconds += dt;
}
