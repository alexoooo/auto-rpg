/**
 * **The Strike drill's cases**: one strike skill thrown once, at a still body (`still`), or in a
 * fight's moment (`fight`). The striker is the subject's mind with its tactics a drill
 * (`DRILL_TACTICS`): it turns to the target, at a still one walks into its action's window, and asks
 * the one action at one mark with one hand, once, the first step its readiness says ready. The target is a Warrior with empty hands that stands in
 * guard and throws nothing (`STANDS`), set the condition's gap ahead and offset across, the two on
 * the stage's own axis as a bout's spawns are (`LEVELS`), so the Arena's camera sees them side on.
 * Nothing ends a trial but its reader: the action's end and a short settle after it, the striker's
 * patience run out before its action was admitted, or the protocol's seconds. A trial is a bout
 * world, so the Arena plays it as it was scored, for as long as it was played (`Row.played`).
 *
 * In a fight's moment the striker is the subject's mind fighting a foe's by its own tactics, as a
 * bout does, until its tactics ask their `moment`th action; the drill asks its own in that one's
 * place from that step, walking into its window as at a still target (`DrillTacticsConfig.fight`), and the foe fights on. Up to that step the
 * bout is the subject's own bout against that foe.
 */
import { CONTROLLERS, MINDS } from "../../core/mind/controllers.ts";
import type { MindConfig } from "../../core/mind/config.ts";
import type { DrillTacticsConfig } from "../../core/mind/drill-tactics.ts";
import type { PartConfig } from "../../core/mind/parts.ts";
import { presetFitsModel } from "../../core/mind/controller.ts";
import type { BodyModel } from "../../core/models.ts";
import { modelHolding } from "../../core/models.ts";
import { deepFreeze } from "../../core/state.ts";
import { mindFaults } from "../../ui/mind-link.ts";
import { STANDS } from "../blade/cases.ts";
import type { Cases, Json, Subject } from "../evaluation.ts";
import { readStrike, type Hand, type Mark, type StrikeReading } from "./read.ts";

/** A subject's value: a mind given whole, and the name of the action it drills. */
export type StrikeSubject = { readonly mind: MindConfig; readonly action: string };

/**
 * The mind that drills `action` with `hand` at `mark`: `mind` with a drill in its tactics' slot,
 * standing `after` s first and walking to its action's window no faster than `pace`, or, at a `moment`, fighting by its own tactics until they ask that
 * many actions.
 */
export function striker({ mind, action }: StrikeSubject, hand: Hand, mark: Mark, { after = STILL.settled, pace, moment }: { readonly after?: number; readonly pace?: number; readonly moment?: number } = {}): MindConfig {
  if (!("tactics" in mind)) throw new Error(`a ${mind.kind} mind has no tactics slot to drill its skills in`);
  const tactics: DrillTacticsConfig = { kind: "drill", action, effector: `hand.${hand}`, mark, after, ...(pace === undefined ? {} : { pace }),
    ...(moment === undefined ? {} : { fight: mind.tactics as PartConfig, moment }) };
  return deepFreeze({ ...mind, tactics } as MindConfig);
}

/**
 * Rung 0, a still target: the strikers' bodies; how far ahead the target's centre stands at the
 * start, m, and
 * how far to the side of the striking hand (`toward`), so each hand is tried on the line ahead and
 * in front of its own shoulder alike; the mark and the hand; how long the striker stands in guard
 * before it asks, the most speed it walks at to bring the target into its action's window, m/s, how long after that it may wait to be admitted, the longest a trial plays, and
 * how long it runs on once the action has ended, for a fall it brings about, s. A trial is judged
 * by the bar a person's punch sets (`BAR`, `read.ts`). A change here is a new protocol.
 */
const STILL = deepFreeze({
  models: ["workshop-fighter", "workshop-rogue"] as BodyModel[],
  gaps: [6, 7, 8, 9, 10, 11, 12, 13].map((tenths) => tenths / 10),
  across: [0, .2],
  toward: "hand",
  marks: ["high", "middle"] as Mark[],
  hands: ["left", "right"] as Hand[],
  settled: .5, pace: 1, patience: 4, seconds: 7, settle: .5,
});

/**
 * A fight's moments: the strikers' bodies; the foes, the game's minds that fight with empty hands,
 * on the Warrior's body; which of the striker's tactics' actions the drill takes the place of, the
 * first asked being 1; the marks and the hands; the most speed the striker walks at to bring the foe
 * into its action's window, m/s; how long after the drill has the body it may wait
 * to be admitted, the longest a trial plays (the bout up to its moment included), and how long it
 * runs on once the action has ended, s.
 */
const FIGHT = deepFreeze({
  models: ["workshop-fighter", "workshop-rogue"] as BodyModel[],
  foes: ["classic", "counter", "scrapper", "duellist", "tempo", "options", "vanguard-warrior"],
  moments: [1, 2, 3, 4],
  marks: ["high", "middle"] as Mark[],
  hands: ["left", "right"] as Hand[],
  settled: 0, pace: 1, patience: 2, seconds: 30, settle: .5,
});

/** One trial's conditions, range last: the strip's columns (`Evaluation.outcome`). */
export type StillCondition = { readonly model: BodyModel; readonly mark: Mark; readonly hand: Hand; readonly across: number; readonly gap: number };
export type FightCondition = { readonly model: BodyModel; readonly foe: string; readonly mark: Mark; readonly hand: Hand; readonly moment: number };
export type StrikeCondition = StillCondition | FightCondition;

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

function stillCases(protocol: typeof STILL): Cases<StrikeCondition, StrikeReading> {
  const conditions: StillCondition[] = [];
  for (const model of protocol.models) for (const mark of protocol.marks) for (const hand of protocol.hands)
    for (const across of protocol.across) for (const gap of protocol.gaps) conditions.push({ model, mark, hand, across, gap });
  return {
    arity: 1,
    play: protocol as unknown as Json,
    conditions,
    seconds: protocol.seconds,
    faults: (value, { model }, subject) => faultsOf(value, model, subject),
    world: ([value], condition, engine) => {
      const { model, gap, across, mark, hand } = condition as StillCondition;
      return { kind: "bout", engine, tape: [],
      // A drill, not a fight: no attack is asked of either side, and nothing ends it but its reader.
      recipe: { left: model, right: "workshop-fighter", capSeconds: protocol.seconds + 1, recoverySeconds: null, entry: [], ends: [],
        // Along +x, as the open stage's spawns are: a body facing +x has its right toward -z.
        start: { left: { at: [-gap / 2, 0], heading: Math.PI / 2 }, right: { at: [gap / 2, protocol.toward === "hand" && hand === "left" ? across : -across], heading: -Math.PI / 2 } },
        minds: { left: striker(value as unknown as StrikeSubject, hand, mark, { pace: protocol.pace }), right: STANDS } } };
    },
    read: (built, condition) => readStrike(built, condition, protocol),
  };
}

function fightCases(protocol: typeof FIGHT): Cases<StrikeCondition, StrikeReading> {
  const conditions: FightCondition[] = [];
  for (const model of protocol.models) for (const foe of protocol.foes) for (const mark of protocol.marks) for (const hand of protocol.hands)
    for (const moment of protocol.moments) conditions.push({ model, foe, mark, hand, moment });
  return {
    arity: 1,
    play: protocol as unknown as Json,
    conditions,
    seconds: protocol.seconds,
    faults: (value, { model }, subject) => faultsOf(value, model, subject),
    world: ([value], condition, engine) => {
      const { model, foe, mark, hand, moment } = condition as FightCondition;
      // A fight on the open stage from its spawns, nothing ending it but the reader.
      return { kind: "bout", engine, tape: [],
        recipe: { left: model, right: "workshop-fighter", capSeconds: protocol.seconds + 1, recoverySeconds: null, entry: [], ends: [],
          minds: { left: striker(value as unknown as StrikeSubject, hand, mark, { after: 0, pace: protocol.pace, moment }), right: MINDS[foe]!.config as MindConfig } } };
    },
    read: (built, condition) => readStrike(built, condition, protocol),
  };
}

/** Every protocol the Strike drill may be played on, by name: its rungs. */
export const STRIKE_CASES: Readonly<Record<string, Cases<StrikeCondition, StrikeReading>>> = Object.freeze({ still: stillCases(STILL), fight: fightCases(FIGHT) });
