/**
 * **The Strike drill's cases**: one strike skill thrown once, from where the striker stands, at a
 * still body. The striker is the subject's mind with its tactics a drill (`DRILL_TACTICS`): it
 * never walks, turns to the target, and asks the one action at one mark with one hand, once, the
 * first step its readiness says ready. The target is a Warrior with empty hands that stands in
 * guard and throws nothing (`STANDS`), set the condition's gap ahead and offset across, the two on
 * the stage's own axis as a bout's spawns are (`LEVELS`), so the Arena's camera sees them side on.
 * Nothing ends a trial but its reader: the action's end and a short settle after it, the striker's
 * patience run out before its action was admitted, or the protocol's seconds. A trial is a bout
 * world, so the Arena plays it as it was scored, for as long as it was played (`Row.played`).
 */
import { regionSegments } from "../../core/mind/action-aim.ts";
import { CONTROLLERS } from "../../core/mind/controllers.ts";
import type { MindConfig } from "../../core/mind/config.ts";
import type { DrillPhase, DrillTacticsConfig } from "../../core/mind/drill-tactics.ts";
import { presetFitsModel } from "../../core/mind/controller.ts";
import type { BodyModel } from "../../core/models.ts";
import { modelHolding } from "../../core/models.ts";
import { deepFreeze } from "../../core/state.ts";
import { mindFaults } from "../../ui/mind-link.ts";
import { STANDS } from "../blade/cases.ts";
import type { Cases, Json, Subject } from "../evaluation.ts";

export type Mark = DrillTacticsConfig["mark"];
export type Hand = "left" | "right";

/** A subject's value: a mind given whole, and the name of the action it drills. */
export type StrikeSubject = { readonly mind: MindConfig; readonly action: string };

/** The mind that drills `action` with `hand` at `mark`: `mind` with a drill in its tactics' slot. */
export function striker({ mind, action }: StrikeSubject, hand: Hand, mark: Mark): MindConfig {
  if (!("tactics" in mind)) throw new Error(`a ${mind.kind} mind has no tactics slot to drill its skills in`);
  const tactics: DrillTacticsConfig = { kind: "drill", action, effector: `hand.${hand}`, mark, after: STILL.settled };
  return deepFreeze({ ...mind, tactics } as MindConfig);
}

/**
 * Rung 0, a still target: the strikers' bodies; how far ahead the target's centre stands, m, and
 * how far to the striker's right; the mark and the hand; how long the striker stands in guard
 * before it asks, how long after that it may wait to be admitted, the longest a trial plays, and
 * how long it runs on once the action has ended, for a fall it brings about, s; and the slowest
 * blow that lands, m/s of closing speed: the punch competency's, the untrained fist less one SD
 * ([thresholds](../../../docs/reference/competencies.md#thresholds)). A change here is a new
 * protocol.
 */
const STILL = deepFreeze({
  models: ["workshop-fighter", "workshop-rogue"] as BodyModel[],
  gaps: [6, 7, 8, 9, 10, 11, 12, 13].map((tenths) => tenths / 10),
  across: [0, .2],
  marks: ["high", "middle"] as Mark[],
  hands: ["left", "right"] as Hand[],
  settled: .5, patience: 2, seconds: 5, settle: .5,
  blow: 6.8,
});

/** One trial's conditions, range last: the strip's columns (`Evaluation.outcome`). */
export type StrikeCondition = { readonly model: BodyModel; readonly mark: Mark; readonly hand: Hand; readonly across: number; readonly gap: number };

/** A blow of the striker's on the target: when, by which of its segments on which of the target's, and in the rules' units. */
export type StrikeContact = {
  readonly time: number; readonly by: string; readonly on: string; readonly closing: number; readonly energy: number; readonly damage: number;
};

/**
 * How a trial came out: `landed`, the hand on the mark while its action ran, at a blow's speed
 * (`blow`); `weak`, on the mark but slower; `elsewhere`, the hand on the target but not the mark; `missed`, committed and nothing of the hand's on the target;
 * `abandoned`, begun and ended before committing; `outside`, never in its window; `refused` or
 * `waiting`, never admitted for the reason its readiness gave; `fell`, the striker down at any
 * time of the trial.
 */
export type StrikeOutcome = "landed" | "weak" | "elsewhere" | "missed" | "abandoned" | "outside" | "refused" | "waiting" | "fell";

/** What a trial came to. */
export type StrikeReading = {
  readonly outcome: StrikeOutcome;
  /** The drill's last phase before its action, and the reason its readiness last gave. */
  readonly phase: DrillPhase;
  readonly reason: string;
  /** When the action began, committed, released and ended, s; null where it did not. */
  readonly began: number | null; readonly committed: number | null; readonly released: number | null; readonly ended: number | null;
  readonly ending: string | null;
  /** The hand's fastest touch on the mark while the action ran, by closing speed; null where none. */
  readonly hit: StrikeContact | null;
  /** Every blow of the striker's on the target. */
  readonly contacts: readonly StrikeContact[];
  readonly down: boolean;
  readonly seconds: number;
};

/** Why `value` is no subject, or what keeps its mind from `model` with empty hands (`mindFaults`). */
function faultsOf(value: Json, model: BodyModel, subject?: Subject): readonly string[] {
  const given = value as Partial<StrikeSubject> | null;
  if (!given || typeof given !== "object" || Array.isArray(given) || typeof given.action !== "string") return ["a subject is a mind and the action it drills"];
  const kind = (given.mind as { kind?: unknown } | undefined)?.kind;
  if (typeof kind !== "string" || !Object.hasOwn(CONTROLLERS, kind)) return [`no mind: a config names its kind (${Object.keys(CONTROLLERS).join(", ")})`];
  if (!presetFitsModel(subject ?? {}, model)) return [`named calibration allows ${subject?.models?.join(", ") || "no bodies"}; ${model} is unavailable`];
  if (!("tactics" in given.mind!)) return [`a ${kind} mind has no tactics slot to drill its skills in`];
  return mindFaults(striker(given as StrikeSubject, "right", "high"), modelHolding(model, { left: "empty", right: "empty" }), { entry: [] }).map((fault) => `${model}: ${fault}`);
}

function strikeCases(protocol: typeof STILL): Cases<StrikeCondition, StrikeReading> {
  const conditions: StrikeCondition[] = [];
  for (const model of protocol.models) for (const mark of protocol.marks) for (const hand of protocol.hands)
    for (const across of protocol.across) for (const gap of protocol.gaps) conditions.push({ model, mark, hand, across, gap });
  return {
    arity: 1,
    play: protocol as unknown as Json,
    conditions,
    seconds: protocol.seconds,
    faults: (value, { model }, subject) => faultsOf(value, model, subject),
    world: ([value], { model, gap, across, mark, hand }, engine) => ({
      kind: "bout", engine, tape: [],
      // A drill, not a fight: no attack is asked of either side, and nothing ends it but its reader.
      recipe: { left: model, right: "workshop-fighter", capSeconds: protocol.seconds + 1, recoverySeconds: null, entry: [], ends: [],
        // Along +x, as the open stage's spawns are: a body facing +x has its right toward -z.
        start: { left: { at: [-gap / 2, 0], heading: Math.PI / 2 }, right: { at: [gap / 2, -across], heading: -Math.PI / 2 } },
        minds: { left: striker(value as unknown as StrikeSubject, hand, mark), right: STANDS } },
    }),
    read({ world, duel }, { mark, hand }) {
      const left = duel.duelists.left, skills = left.minded.skills;
      if (!skills) throw new Error("the striker runs no skills");
      const marked = new Set(regionSegments(duel.duelists.right.built.spec, { kind: "mark", mark })), effector = `hand.${hand}`;
      const times = { began: null as number | null, committed: null as number | null, released: null as number | null, ended: null as number | null };
      let id: number | null = null, phase: DrillPhase = "lost", reason = "", down = false;
      return {
        afterStep() {
          const action = skills.report.actions[0];
          if (action && id === null) { id = action.id; times.began = world.time; }
          if (action && action.id === id) {
            if (action.phase === "commit" && times.committed === null) times.committed = world.time;
            if (action.phase === "release" && times.released === null) times.released = world.time;
          }
          if (id !== null && times.ended === null && !skills.report.actions.some((one) => one.id === id)) times.ended = world.time;
          if (id === null) {
            const engagement = skills.report.engagement;
            phase = (engagement?.phase ?? "lost") as DrillPhase;
            reason = engagement?.details?.find((detail) => detail.label === "readiness")?.value ?? "";
          }
          down ||= left.body.down;
        },
        get ended() {
          return world.time >= protocol.seconds || times.ended !== null && world.time >= times.ended + protocol.settle
            || id === null && world.time >= protocol.settled + protocol.patience;
        },
        reading() {
          const contacts = duel.blows.flatMap((blow) => {
            if (blow.kind !== "impact") return [];
            const by = blow.sides.find((side) => side.fighter === "left"), on = blow.sides.find((side) => side.fighter === "right");
            return by && on && on.item === null ? [{ time: blow.time, by: by.segment, on: on.segment, closing: blow.closing, energy: blow.energy, damage: on.damage }] : [];
          });
          const live = (contact: StrikeContact) => times.began !== null && contact.time >= times.began && contact.time <= (times.ended ?? world.time);
          const hand = contacts.filter((contact) => contact.by === effector && live(contact));
          const hit = hand.filter((contact) => marked.has(contact.on)).reduce<StrikeContact | null>((best, one) => best === null || one.closing > best.closing ? one : best, null);
          const ledger = id === null ? undefined : skills.report.ledger.find((record) => record.id === id);
          const outcome: StrikeOutcome = down ? "fell" : hit ? hit.closing >= protocol.blow ? "landed" : "weak" : hand.length ? "elsewhere" : times.committed !== null ? "missed"
            : id !== null ? "abandoned" : phase === "position" ? "outside" : phase === "waiting" ? "waiting" : "refused";
          return { outcome, phase, reason, ...times, ending: ledger?.ending.kind ?? null, hit, contacts, down, seconds: world.time };
        },
      };
    },
  };
}

/** Every protocol the Strike drill may be played on, by name: its rungs. */
export const STRIKE_CASES: Readonly<Record<string, Cases<StrikeCondition, StrikeReading>>> = Object.freeze({ still: strikeCases(STILL) });
