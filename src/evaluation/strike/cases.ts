/**
 * **The Strike drill's cases**: one strike skill thrown once, at a still body (`still`), at one
 * walked to from farther (`walk`), at a drill opponent stepping in and out (`stepping`), guarding
 * (`guarding`) or punching back (`punching`), or in a fight's moment (`fight`). The striker is the subject's mind with its tactics a drill
 * (`DRILL_TACTICS`): it turns to the target, walks into its action's window, and asks
 * the one action at one mark with one limb, a hand or a foot, once, the first step its readiness
 * says ready. The target is a Warrior with empty hands, or the body the rung names, under the rung's opponent, a mind's configuration
 * (`DRILL_OPPONENT_MIND`'s presets; `drill-stand` stands in guard and throws nothing), set the condition's gap ahead and offset across, the two on
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
import { drilledBy } from "../../core/mind/catalog.ts";
import type { DrillTacticsConfig } from "../../core/mind/drill-tactics.ts";
import type { PartConfig } from "../../core/mind/parts.ts";
import { presetFitsModel } from "../../core/mind/controller.ts";
import type { BodyModel } from "../../core/models.ts";
import { modelHolding } from "../../core/models.ts";
import { deepFreeze } from "../../core/state.ts";
import { mindFaults } from "../../ui/mind-link.ts";
import { sideAttributes, type Cases, type Json, type Subject } from "../evaluation.ts";
import { effectorOf, handOf, readStrike, type Hand, type Limb, type Mark, type StrikeReading } from "./read.ts";

/** A subject's value: a mind given whole, and the name of the action it drills. */
export type StrikeSubject = { readonly mind: MindConfig; readonly action: string };

/**
 * The mind that drills `action` with `effector` (`hand.right`, `foot.left`) at `mark`: `mind` with a drill in its tactics' slot,
 * standing `after` s first and walking to its action's window no faster than `pace` (asking, with
 * `walking`, the first step it is ready), or, at a `moment`, fighting by its own tactics until they ask that
 * many actions; with `letGo`, letting its action go that long after it began.
 */
export function striker({ mind, action }: StrikeSubject, effector: string, mark: Mark,
  { after = STILL.settled, pace, walking, letGo, moment }: { readonly after?: number; readonly pace?: number; readonly walking?: boolean; readonly letGo?: number; readonly moment?: number } = {}): MindConfig {
  const tactics: DrillTacticsConfig = { kind: "drill", action, effector, mark, after, ...(pace === undefined ? {} : { pace }), ...(walking ? { walking: true } : {}),
    ...(letGo === undefined ? {} : { letGo }),
    ...(moment === undefined ? {} : { fight: ("tactics" in mind ? mind.tactics : null) as PartConfig, moment }) };
  const drilled = drilledBy(mind, tactics);
  if (!drilled) throw new Error(`no drill drives a ${mind.kind} mind`);
  return deepFreeze(drilled);
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
  settled: .5, pace: 1, patience: 8, seconds: 11, settle: .5,
});

/**
 * Rung 5, struck from a walk: the still rung's target and striker set farther apart than the
 * striker's window, so it walks in, on the Warrior's body at the middle mark; each trial played
 * twice, its `start` `settled` (the drill walks to the window's middle and asks once settled, as
 * the still rung does) and `walking` (it asks the first step it is ready, still walking). The two
 * are read alike from the first step the drill is ready (`StrikeReading.ready`).
 */
const WALK = deepFreeze({ ...STILL,
  models: ["workshop-fighter"] as BodyModel[],
  gaps: [16, 18, 20, 22, 24, 26, 28, 30].map((tenths) => tenths / 10),
  marks: ["middle"] as Mark[],
  starts: ["settled", "walking"] as Start[],
});

/**
 * Rungs 2 to 4, a drill opponent: the still rung's trials on the Warrior's body, from the near half
 * of its gaps, at an opponent stepping in and out (`drill-step`), covering a threat with its hands
 * (`drill-guard`) or closing to punch on a rhythm (`drill-punch`).
 */
const OPPONENT = deepFreeze({ ...STILL, models: ["workshop-fighter"] as BodyModel[], gaps: [8, 10, 12].map((tenths) => tenths / 10), across: [0] });
/** The target's mind, a preset (`MINDS`), where a protocol names one: `drill-stand` where it does not. */
const STANDING = "drill-stand";
const STEPPING = deepFreeze({ ...OPPONENT, opponent: "drill-step" });
const GUARDING = deepFreeze({ ...OPPONENT, opponent: "drill-guard" });
const PUNCHING = deepFreeze({ ...OPPONENT, opponent: "drill-punch" });

/**
 * Letting go: the opponent rungs' trials at a target standing (`letgo`) and punching back
 * (`letgo-punched`), each strike let go at each point of its wind-up, s after it began (`letGo`;
 * at its first decision past each), where it is still before its point of no return: what letting
 * it go there costs, the time until the hand is back at its guard and what the striker loses
 * meanwhile (`StrikeReading.letGo`). A trial past its point of no return is not let go.
 */
const LETTING_GO = deepFreeze({ ...OPPONENT, letGo: [0, .05, .1, .15] });
const LETTING_GO_PUNCHED = deepFreeze({ ...PUNCHING, letGo: [0, .05, .1, .15] });

/**
 * Stomping: the opponent rungs' trials thrown with each foot (`feet`), no hand, at the middle mark
 * of a target lying on its back: a Warrior's or a Skeleton's body (`targets`) under the bare mind
 * with no network, which pulls no muscle, so it falls limp from where it stood and lies still
 * before the striker, standing `settled` s first, walks round to its side; longer than the
 * others, for that walk and the kick's slow preparation.
 */
const STOMPING = deepFreeze({ ...OPPONENT, hands: [] as Hand[], feet: ["left", "right"] as Hand[], targets: ["workshop-fighter", "crypt-skeleton"] as BodyModel[],
  marks: ["middle"] as Mark[], opponent: "bare", settled: 2, patience: 12, seconds: 25 });

/** How a walk-rung trial asks: once settled in its window's middle, or the first step it is ready, still walking. */
export type Start = "settled" | "walking";

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
  foes: ["classic", "counter", "duellist", "vanguard-warrior"],
  moments: [1, 2, 3, 4],
  marks: ["high", "middle"] as Mark[],
  hands: ["left", "right"] as Hand[],
  settled: 0, pace: 1, patience: 2, seconds: 30, settle: .5,
});

/** One trial's conditions, range last: the strip's columns (`Evaluation.outcome`). */
export type StillCondition = { readonly model: BodyModel; readonly mark: Mark } & Limb & {
  /** The target's body, where its rung names one: a Warrior's where it does not. */
  readonly target?: BodyModel;
  readonly across: number; readonly gap: number; readonly start?: Start;
  /** Where the drill lets its strike go, s after it began; absent where it does not. */
  readonly letGo?: number };
export type FightCondition = { readonly model: BodyModel; readonly foe: string; readonly mark: Mark; readonly hand: Hand; readonly moment: number };
export type StrikeCondition = StillCondition | FightCondition;

/** The effector a trial strikes with (`effectorOf`): `hand.right`, `foot.left`. */
export const limbOf = (condition: StrikeCondition): string => effectorOf(condition);

/** Why `value` is no subject, or what keeps its mind from `model` with empty hands (`mindFaults`). */
function faultsOf(value: Json, model: BodyModel, subject?: Subject): readonly string[] {
  const given = value as Partial<StrikeSubject> | null;
  if (!given || typeof given !== "object" || Array.isArray(given) || typeof given.action !== "string") return ["a subject is a mind and the action it drills"];
  const kind = (given.mind as { kind?: unknown } | undefined)?.kind;
  if (typeof kind !== "string" || !Object.hasOwn(CONTROLLERS, kind)) return [`no mind: a config names its kind (${Object.keys(CONTROLLERS).join(", ")})`];
  if (!presetFitsModel(subject ?? {}, model)) return [`named calibration allows ${subject?.models?.join(", ") || "no bodies"}; ${model} is unavailable`];
  if (!drilledBy(given.mind!, { kind: "drill" })) return [`no drill drives a ${kind} mind`];
  return mindFaults(striker(given as StrikeSubject, "hand.right", "high"), modelHolding(model, { left: "empty", right: "empty" }, subject?.character), { entry: [] }).map((fault) => `${model}: ${fault}`);
}

function stillCases(protocol: typeof STILL & { readonly starts?: readonly Start[]; readonly opponent?: string; readonly letGo?: readonly number[];
  readonly feet?: readonly Hand[]; readonly targets?: readonly BodyModel[] }): Cases<StrikeCondition, StrikeReading> {
  const conditions: StillCondition[] = [], limbs: Limb[] = [...protocol.hands.map((hand) => ({ hand })), ...(protocol.feet ?? []).map((foot) => ({ foot }))];
  for (const model of protocol.models) for (const mark of protocol.marks) for (const limb of limbs) for (const target of protocol.targets ?? [undefined])
    for (const across of protocol.across) for (const gap of protocol.gaps) for (const start of protocol.starts ?? [undefined]) for (const letGo of protocol.letGo ?? [undefined])
      conditions.push({ model, mark, ...limb, ...(target === undefined ? {} : { target }), across, gap, ...(start === undefined ? {} : { start }), ...(letGo === undefined ? {} : { letGo }) });
  return {
    arity: 1,
    play: protocol as unknown as Json,
    conditions,
    seconds: protocol.seconds,
    faults: (value, { model }, subject) => faultsOf(value, model, subject),
    world: ([value], condition, engine, [character]) => {
      const { model, gap, across, mark, target, start, letGo } = condition as StillCondition, hand = handOf(condition as StillCondition);
      return { kind: "bout", engine, tape: [],
      // A drill, not a fight: no attack is asked of either side, and nothing ends it but its reader.
      recipe: { left: model, right: target ?? "workshop-fighter", capSeconds: protocol.seconds + 1, recoverySeconds: null, entry: [], ends: [], ...sideAttributes({ left: character }),
        // Along +x, as the open stage's spawns are: a body facing +x has its right toward -z.
        start: { left: { at: [-gap / 2, 0], heading: Math.PI / 2 }, right: { at: [gap / 2, protocol.toward === "hand" && hand === "left" ? across : -across], heading: -Math.PI / 2 } },
        minds: { left: striker(value as unknown as StrikeSubject, effectorOf(condition as StillCondition), mark, { after: protocol.settled, pace: protocol.pace, walking: start === "walking", ...(letGo === undefined ? {} : { letGo }) }),
          right: MINDS[protocol.opponent ?? STANDING]!.config as MindConfig } } };
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
    world: ([value], condition, engine, [character]) => {
      const { model, foe, mark, hand, moment } = condition as FightCondition;
      // A fight on the open stage from its spawns, nothing ending it but the reader.
      return { kind: "bout", engine, tape: [],
        recipe: { left: model, right: "workshop-fighter", capSeconds: protocol.seconds + 1, recoverySeconds: null, entry: [], ends: [],
          ...sideAttributes({ left: character, right: MINDS[foe]!.character }),
          minds: { left: striker(value as unknown as StrikeSubject, `hand.${hand}`, mark, { after: 0, pace: protocol.pace, moment }), right: MINDS[foe]!.config as MindConfig } } };
    },
    read: (built, condition) => readStrike(built, condition, protocol),
  };
}

/** Every protocol the Strike drill may be played on, by name: its rungs. */
export const STRIKE_CASES: Readonly<Record<string, Cases<StrikeCondition, StrikeReading>>> = Object.freeze({ still: stillCases(STILL), walk: stillCases(WALK),
  stepping: stillCases(STEPPING), guarding: stillCases(GUARDING), punching: stillCases(PUNCHING), fight: fightCases(FIGHT),
  letgo: stillCases(LETTING_GO), "letgo-punched": stillCases(LETTING_GO_PUNCHED), stomping: stillCases(STOMPING) });
