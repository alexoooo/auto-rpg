import type { CombatReportEvent } from "./combat.ts";
import type { FighterView, Intent } from "./mind.ts";
import {
  behaviourRecord,
  recordBehaviourSample,
  recordCombatEvent,
  recordIntentAttack,
  type BehaviourRecord,
} from "./options.ts";
import type { Side } from "./physics.ts";
import type { Combatant } from "./units.ts";

export const ENGAGEMENT_INSTRUMENT_VERSION = 1;

export interface RecorderSample {
  readonly view: FighterView;
  readonly dt: number;
  readonly clock: number;
}

type IntentEdge = Parameters<typeof recordIntentAttack>[3];
type SampleEdge = Parameters<typeof recordBehaviourSample>[4];

const opposite = (side: Side): Side => side === "left" ? "right" : "left";

/** One label-free behaviour record for each body in one bout. */
export class BoutRecorder {
  readonly records: Readonly<Record<Side, BehaviourRecord>>;
  readonly engagement: Readonly<Record<Side, BehaviourRecord["engagement"]>>;
  private readonly intentEdges: Record<Side, IntentEdge> = { left: {}, right: {} };
  private readonly pendingIntents: Record<Side, Intent | null> = { left: null, right: null };
  private readonly pendingViews: Record<Side, FighterView | null> = { left: null, right: null };
  private readonly samples: Record<Side, SampleEdge> = { left: {}, right: {} };
  private contactSequence = 0;

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
    recordBehaviourSample(this.records[side], view, null, dt, this.samples[side]);
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
    const factual = {
      hand: event.hand,
      weapon: event.report.weapon,
      damage: event.report.damage,
      at: event.report.at,
      contactId,
    };
    recordCombatEvent(this.records[striker], { ...factual, blocked: false });
    if (event.blocked) {
      recordCombatEvent(this.records[opposite(striker)], { ...factual, damage: 0, blocked: true, defending: true });
    }
  }
}

type RecordedBody = Pick<Combatant, "intentObserver" | "view">;

/** Attach the command seam once, independent of which loop owns the bodies. */
export function wireBoutRecorder(recorder: BoutRecorder, left: RecordedBody, right: RecordedBody): void {
  left.intentObserver = (view, intent) => recorder.intent("left", view, intent);
  right.intentObserver = (view, intent) => recorder.intent("right", view, intent);
}

/** One combat callback that records first and then preserves an optional harness observer. */
export function combatRecorder(recorder: BoutRecorder, striker: Side,
  observer?: (event: CombatReportEvent) => void): (event: CombatReportEvent) => void {
  return (event) => { recorder.combat(striker, event); observer?.(event); };
}

/** Sample both published views at the common 240 Hz control boundary. */
export function sampleBoutRecorder(recorder: BoutRecorder, left: RecordedBody, right: RecordedBody,
  dt: number, clock: number): void {
  recorder.sample("left", { view: left.view, dt, clock });
  recorder.sample("right", { view: right.view, dt, clock });
}
