/**
 * **The Strike drill's cases**: one strike skill thrown once, at a still body (`still`, and from
 * starts drawn at random, moving or still, `sampled`), at one lying (`stomping`, and from starts
 * drawn at random, `stomping-sampled`), a club's blow at one's head (`bonk`), at one
 * carried past on a rail (`moving`), at one walked to from farther (`walk`), at a drill opponent stepping in and out (`stepping`), guarding
 * (`guarding`) or punching back (`punching`), or in a fight's moment (`fight`, and over the fights
 * a strike's profile is measured in, `fights`). The rungs at a target ask how well the body throws
 * the strike; the fights ask what the strike brings where it is used, another question, and a
 * profile is that one's answer alone. The striker is the
 * subject's mind as given, holding what its subject names (`StrikeSubject.held`), its side led by
 * the drill Commander (`DrillCommanderConfig`): it stands, walks the striker into its action's
 * window, and orders the one action at one mark with one limb, a hand or a foot, once; the mind
 * carries the order out. A subject is asked a condition only where its mind offers its skill with
 * that limb at that mark on that body (`caseFaults`): a rung lists every mark and limb a strike is
 * asked at, and each strike's cases are its own of them. The target is a Warrior with empty hands, or each body the rung names (the rungs a table cell reads: each of the game's foes, `FOES`), under the rung's opponent (`DRILL_OPPONENTS`:
 * a mind, led on a rhythm by a beats Commander where it keeps one; `drill-stand` stands with its arms lowered and throws nothing, and a target guards only where the guard is what the rung reads: `guarding`), set the condition's gap ahead and offset across, the two on
 * the stage's own axis as a bout's spawns are (`LEVELS`), so the Arena's camera sees them side on.
 * Nothing ends a trial but its reader: the action's end and a short settle after it, the striker's
 * patience run out before its action was admitted, or the protocol's seconds. A trial is a bout
 * world, so the Arena plays it as it was scored, for as long as it was played (`Row.played`).
 *
 * In a fight's moment the striker is the subject's mind fighting a foe's by itself, as a bout does,
 * until it begins its `moment`th action aimed at a body; the drill orders its own in that one's place
 * from that step, walking into its window and asking the first step it is ready, as at a moving
 * target (a foe fighting is never settled in a window), and the foe fights on. Up to that step the bout is
 * the subject's own bout against that foe: the Commander orders nothing.
 */
import type { MindConfig } from "../../minds/catalog/config.ts";
import type { Approach, DrillCommanderConfig } from "../../minds/command/drill.ts";
import { randomStream } from "../../core/math/random.ts";
import { describeMind } from "../../minds/catalog/catalog.ts";
import { presetFitsModel } from "../../minds/catalog/controller.ts";
import { kitOf, kitOffers, type KitEntry } from "../../skills/framework/menu.ts";
import type { BodySpec } from "../../core/bodies/spec/body.ts";
import type { BodyModel } from "../../core/bodies/models.ts";
import { modelHolding, modelSpec } from "../../core/bodies/models.ts";
import { EMPTY_LOADOUT, loadoutFaults, loadoutKey, type Loadout } from "../../core/bodies/items/held.ts";
import { deepFreeze } from "../../core/state.ts";
import { sideAttributes, type BoutTiming, type Cases, type Json, type Subject } from "../evaluation.ts";
import { effectorOf, handOf, readStrike, type Hand, type Limb, type Mark, type StrikeReading } from "./read.ts";
import type { Rail } from "../../game/arena/rail.ts";
import { createDrillOpponents, opposed } from "../drill-opponents.ts";
import { type GameContext, mindFaults as contextMindFaults } from "../../game/arena/context.ts";
import { SIDES } from "../../core/bodies/bilateral.ts";
import { between } from "../twin.ts";

/**
 * A subject's value: a mind given whole, the skill it drills (its executor's kind, as an order
 * names it, `Orders.skill`), and what its striker holds in each hand, empty hands where it names nothing.
 */
export type StrikeSubject = { readonly mind: MindConfig; readonly skill: string; readonly held?: Loadout };

/**
 * A bout recipe's `loadouts` for the striker holding what `subject` names, the target empty-handed;
 * none for a subject that names nothing, so an empty-handed subject's world names no loadouts.
 */
export const loadoutsOf = (subject: StrikeSubject) => subject.held === undefined ? {} : { loadouts: { left: subject.held, right: EMPTY_LOADOUT } };

/**
 * The striker's side of a bout recipe: the subject's mind as given, led by the drill Commander
 * ordering `skill` with `effector` (`hand.right`, `foot.left`) at `mark`, standing `after` s first
 * and walking it to its action's window no faster than `pace` (ordering it, with `walking`, the
 * first step it is ready), or, at a `moment`, ordering nothing until the mind begins that many
 * actions; with `approach`, moving so first (`Approach`); with `letGo`, ordering a stand that long after it began.
 */
export function striker({ mind, skill }: StrikeSubject, effector: string, mark: Mark,
  { after = STILL.settled, pace, walking, approach, letGo, moment }: { readonly after?: number; readonly pace?: number; readonly walking?: boolean; readonly approach?: Approach;
    readonly letGo?: number; readonly moment?: number } = {},
): { readonly mind: MindConfig; readonly commander: DrillCommanderConfig } {
  const commander: DrillCommanderConfig = { kind: "drill", skill, limb: effector, region: { kind: "mark", mark }, after, ...(pace === undefined ? {} : { pace }),
    ...(walking ? { walking: true } : {}), ...(approach === undefined ? {} : { approach }), ...(letGo === undefined ? {} : { letGo }), ...(moment === undefined ? {} : { moment }) };
  return deepFreeze({ mind, commander });
}

/** A recipe's `minds` and `commanders` for `drilled` striking (`striker`) on the left and `foe` on the right. */

/**
 * Rung 0, a still target: the strikers' bodies; how far ahead the target's centre stands at the
 * start, m, and
 * how far to the side of the striking hand (`toward`), so each hand is tried on the line ahead and
 * in front of its own shoulder alike; the mark and the hand; how long the striker stands in guard
 * before it asks, the most speed it walks at to bring the target into its action's window, m/s, how long after that it may wait to be admitted, the longest a trial plays,
 * how long it runs on once the action has ended, for a fall it brings about, and how long it waits
 * for the limb back at its guard after that (`Ending.recover`), s. A trial is judged
 * by the bar a person's punch sets, scaled to the striker's body (`barOf`, `read.ts`). A change here is a new protocol.
 */
const STILL = deepFreeze({
  models: ["man", "woman"] as BodyModel[],
  gaps: [6, 7, 8, 9, 10, 11, 12, 13].map((tenths) => tenths / 10),
  across: [0, .2],
  toward: "hand",
  marks: ["high", "middle"] as Mark[],
  hands: [...SIDES] as Hand[],
  settled: .5, pace: 1, patience: 8, seconds: 11, settle: .5, recover: 2,
});

/**
 * **Who is struck** at the rungs a table cell reads (still, walk, bonk, stomping): every foe the
 * game puts a striker against, the Warrior, the Rogue (the Arena's) and the Skeleton (the Crypt's),
 * each with empty hands (`atEveryFoe`).
 */
const FOES: readonly BodyModel[] = Object.freeze(["man", "woman", "skeleton"]);

/** `rung` at each of the game's foes (`FOES`), its trials otherwise the same. */
const atEveryFoe = <P extends object>(rung: P): P & { readonly targets: readonly BodyModel[] } => deepFreeze({ ...rung, targets: FOES });

/** A small held-swing observation: physical travel and guard settling through and after executor ownership. */
const SWING_MOTION = deepFreeze({ ...STILL, models: ["man"] as BodyModel[], gaps: [1.2], across: [0],
  marks: ["middle"] as Mark[], hands: ["right"] as Hand[], motion: true as const, settle: 2 });

/**
 * **Starts drawn at random**, the `sampled` rung: the still rung's trials on every striker's body,
 * each begun from a start drawn from a fixed stream (`seed`), so its trials are the same at every
 * play: by turns still, stepping in, backing off and sideways (`APPROACHES`), each hand alike, at
 * the middle mark; the target's gap ahead from `gaps` (stepping in, from `closer`) and its offset across from
 * `across`, m, each drawn evenly; and the approach's speed, m/s, and time, s, drawn evenly from
 * `speeds` and `times`. The striker stands, moves so (`Approach`), striking the first step it is
 * ready, then walks into its window and strikes the first step it is ready there: where it began
 * and how it moved then are what the trial records (`StrikeReading.foeAt`).
 */
const SAMPLED = deepFreeze({ ...STILL, models: ["man", "woman", "skeleton"] as BodyModel[],
  marks: ["middle"] as Mark[], trials: 96, seed: 1, gaps: [.6, 1.4], closer: [1.2, 2.2], across: [0, .2], speeds: [.3, 1], times: [.3, 1] });

/** **How a sampled start moves** (`SAMPLED`), degrees off the line to the target: still, stepping in, backing off, sideways to the right and to the left. */
const APPROACHES = Object.freeze([null, 0, 180, 90, -90] as const);

/**
 * Rung 5, struck from a walk: the still rung's target and striker set farther apart than the
 * striker's window, so it walks in, on the Warrior's body at the head and the middle mark; each trial played
 * twice, its `start` `settled` (the drill walks to the window's middle and asks once settled, as
 * the still rung does) and `walking` (it asks the first step it is ready, still walking). The two
 * are read alike from the first step the drill is ready (`StrikeReading.ready`).
 */
const WALK = deepFreeze({ ...STILL,
  models: ["man"] as BodyModel[],
  gaps: [16, 18, 20, 22, 24, 26, 28, 30].map((tenths) => tenths / 10),
  marks: ["high", "middle"] as Mark[],
  starts: ["settled", "walking"] as Start[],
});

/**
 * Rungs 2 to 4, a drill opponent: the still rung's trials on the Warrior's body, from the near half
 * of its gaps, at an opponent stepping in and out (`drill-step`), covering a threat with its hands
 * (`drill-guard`) or closing to punch on a rhythm (`drill-punch`).
 */
const OPPONENT = deepFreeze({ ...STILL, models: ["man"] as BodyModel[], gaps: [8, 10, 12].map((tenths) => tenths / 10), across: [0] });

/**
 * The target's mind (`opponentOf`), where a protocol names one: `drill-stand` where it does not,
 * standing with its arms lowered, so its marks are open and a failed trial is the striker's.
 */
const STANDING = "drill-stand";

const STEPPING = deepFreeze({ ...OPPONENT, opponent: "drill-step" });

/**
 * The bonk, a club's overhead blow at the head (`Bar.overhead`): the still rung's places on the
 * Warrior with the right hand at the high mark.
 */
const BONK = deepFreeze({ ...STILL, models: ["man"] as BodyModel[], marks: ["high"] as Mark[], hands: ["right"] as Hand[] });

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
 * **How a rung lays its target down**: limp, a body folds where it stands and comes to rest on its
 * back, its front or sitting on its heels as chance has it; shoved back at the bout's start at its
 * middle trunk, `speed` m/s of its whole mass, it goes over backward onto its back. A setting of
 * the fixture. The trial reads whether it lies by the drill's first moment (`Ending.laid`).
 */
const LAID = deepFreeze({ segment: "middleTrunk", speed: .5 });

/**
 * Stomping: the opponent rungs' trials thrown with each foot (`feet`), no hand, at the middle mark
 * of a target lying on its back: each of the game's foes (`FOES`) under the bare mind
 * with no network, which pulls no muscle, laid down (`laid`) and lying still before the striker,
 * standing `settled` s first, walks round to its side; longer than the others, for that walk and
 * the stomp's slow preparation.
 */
const STOMPING = deepFreeze({ ...OPPONENT, hands: [] as Hand[], feet: [...SIDES] as Hand[], targets: FOES,
  marks: ["middle"] as Mark[], opponent: "bare", settled: 2, patience: 12, seconds: 25, laid: LAID });

/**
 * **Stomping from starts drawn at random**, the `stomping-sampled` rung: the stomping rung's trials
 * at a Warrior lying, each foot by turns, begun from starts drawn as the sampled rung's are, on
 * the Warrior's and the Rogue's bodies: the target's gap ahead and offset across, either side, drawn from `gaps`
 * (stepping in, from `closer`) and `across`, m. The striker walks round to the body lying and
 * strikes the first step it is ready, where its walk enters its window, unless it began still, when
 * it settles at its window's middle first: where in its window it began is what the trial records
 * (`StrikeReading.inWindow`).
 */
const STOMPING_SAMPLED = deepFreeze({ ...STOMPING, models: ["man", "woman"] as BodyModel[],
  targets: ["man"] as BodyModel[], trials: 80, seed: 1, gaps: [.8, 1.2], closer: [1.2, 1.8], across: [-.2, .2], speeds: [.3, 1], times: [.3, 1] });

/**
 * Rung 1, a moving target: the opponent rungs' trials at a pad on a rail (`Rail`, `src/game/arena/rail.ts`),
 * the Warrior's body held rigid as it was built under the bare mind, lifted `height` m and carried
 * in a line at each speed, m/s, toward the striker, away from it or across its front from its right
 * to its left. The trial's gap is where the pad is `settled` s in, the first moment the drill may
 * ask, moving; it set out from where that speed puts it then, and goes on `beyond` m past it, toward
 * the striker no nearer than `near` m centre to centre to where it stood, then holds still. The
 * drill asks the first step it is ready (`walking`): a moving target is never settled in a window.
 */
const MOVING = deepFreeze({ ...OPPONENT, opponent: "bare", directions: ["toward", "away", "across"] as Direction[], speeds: [.3, .6],
  height: .02, beyond: 1.5, near: .6 });

/** Which way a moving target goes: toward the striker, away from it, or across its front. */
type Direction = "toward" | "away" | "across";

/** How a walk-rung trial asks: once settled in its window's middle, or the first step it is ready, still walking. */
type Start = "settled" | "walking";

/**
 * A fight's moments: the strikers' bodies; the foe, Option Mind fighting with empty hands on the
 * Warrior's body; which of the striker's mind's actions the drill takes the place of, the
 * first asked being 1; the marks and the hands; the most speed the striker walks at to bring the foe
 * into its action's window, m/s; how long after the drill has the body it may wait
 * to be admitted, the longest a trial plays (the bout up to its moment included), and how long it
 * runs on once the action has ended, s.
 */
const FIGHT = deepFreeze({
  models: ["man"] as BodyModel[],
  foes: ["option"],
  moments: [1, 2, 3, 4],
  marks: ["high", "middle"] as Mark[],
  hands: [...SIDES] as Hand[],
  settled: 0, pace: 1, patience: 2, seconds: 30, settle: .5, recover: 2,
});

/** One trial's conditions, range last: the strip's columns (`Evaluation.outcome`). */
export type StillCondition = { readonly model: BodyModel; readonly mark: Mark } & Limb & {
  /** The target's body, where its rung names one: a Warrior's where it does not. */
  readonly target?: BodyModel;
  /** Which way and how fast the target moves on its rail, m/s, where its rung moves it. */
  readonly direction?: Direction; readonly speed?: number;
  readonly across: number; readonly gap: number; readonly start?: Start;
  /** How the striker first moves, where its rung draws it (`Approach`). */
  readonly approach?: Approach;
  /** Where the drill lets its strike go, s after it began; absent where it does not. */
  readonly letGo?: number };

type FightCondition = { readonly model: BodyModel; readonly foe: string; readonly mark: Mark } & Limb & { readonly moment: number;
  /** How far apart the two start, m, where its rung names it: the open stage's own where it does not. */
  readonly gap?: number };

export type StrikeCondition = StillCondition | FightCondition;

/** The effector a trial strikes with (`effectorOf`): `hand.right`, `foot.left`. */
export const limbOf = (condition: StrikeCondition): string => effectorOf(condition);

/** A moving rung's rail (`MOVING`): how its target moves, and from how far out it sets off. */
type Moving = { readonly directions: readonly Direction[]; readonly speeds: readonly number[]; readonly height: number; readonly beyond: number; readonly near: number };

/**
 * The rail that carries the target of a trial at `gap` and `across` moving `direction` at `speed`
 * (`MOVING`), and where its target sets out (x, z, m), the striker standing at -gap/2 facing +x.
 */
function railOf(moving: Moving, settled: number, direction: Direction, speed: number, gap: number, across: number): { readonly rail: Rail; readonly from: readonly [number, number] } {
  // Facing +x, the striker's right is toward -z: across its front from its right to its left is +z.
  const [dx, dz] = direction === "toward" ? [-1, 0] : direction === "away" ? [1, 0] : [0, 1];
  const lead = speed * settled, beyond = direction === "toward" ? Math.max(0, Math.min(moving.beyond, gap - moving.near)) : moving.beyond;
  const from = [gap / 2 - dx * lead, across - dz * lead] as const, length = lead + beyond;
  return { rail: { side: "right", path: { kind: "line", along: [dx * length, dz * length] }, speed, height: moving.height }, from };
}

/**
 * **A sampled rung's trials** (`SAMPLED`, `STOMPING_SAMPLED`): on each body, `trials` starts drawn
 * in turn from one stream, the same for every body, each drawn to the millimetre and the
 * hundredth; its limbs, its hands then its feet, by turns, and its marks and targets by turns of them.
 */
function sampledConditions(protocol: typeof SAMPLED & { readonly feet?: readonly Hand[]; readonly targets?: readonly BodyModel[] }): StillCondition[] {
  const conditions: StillCondition[] = [], within = ([low, high]: readonly number[], at: number) => low! + at * (high! - low!);
  const limbs: Limb[] = [...protocol.hands.map((hand) => ({ hand })), ...(protocol.feet ?? []).map((foot) => ({ foot }))];
  for (const model of protocol.models) {
    const stream = randomStream(protocol.seed);
    for (let k = 0; k < protocol.trials; k++) {
      const way = APPROACHES[k % APPROACHES.length]!, limb = limbs[k % limbs.length]!, turn = Math.floor(k / limbs.length), mark = protocol.marks[turn % protocol.marks.length]!;
      const target = protocol.targets?.[turn % protocol.targets.length];
      const gap = within(way === 0 ? protocol.closer : protocol.gaps, stream.next()), across = within(protocol.across, stream.next());
      const speed = within(protocol.speeds, stream.next()), seconds = within(protocol.times, stream.next());
      conditions.push({ model, mark, ...limb, ...(target === undefined ? {} : { target }), across: Math.round(across * 1000) / 1000, gap: Math.round(gap * 1000) / 1000,
        ...(way === null ? {} : { approach: { way, speed: Math.round(speed * 100) / 100, seconds: Math.round(seconds * 100) / 100 } }) });
    }
  }
  return conditions;
}

/** Every body a strike may be thrown by: the Warrior, the Rogue and the Skeleton. */
const STRIKERS: readonly BodyModel[] = Object.freeze(["man", "woman", "skeleton"]);

/** `rung` thrown by the strikers its own trials leave out (`STRIKERS`), its trials otherwise the same: its `-bodies` protocol. */
const onOtherBodies = <P extends { readonly models: readonly BodyModel[] }>(rung: P): P =>
  deepFreeze({ ...rung, models: STRIKERS.filter((model) => !rung.models.includes(model)) as BodyModel[] });

/**
 * **The fights a strike's profile is measured in**, the `fights` rung: a fight's moments (`FIGHT`)
 * on every striker's body, with each hand and each foot, in the fight begun from each of the
 * standard match's gaps on the open stage, m (`gaps`), at each of the mind's first `moments`
 * actions aimed at a body. A profile says what a strike brings where it is used, in a fight
 * against a foe that fights back, so these trials alone make it
 * (`research/skills/strikes/strike-profiles.mjs`); how well the body throws the strike is the
 * other rungs' question, and no answer to this one. The strike is thrown at each moment whichever
 * the mind chose there, so one it seldom chooses is measured as often as one it favours. A moment
 * a fight never came to, and a strike not begun at its moment (a stomp while the foe stands), is
 * no trial of it.
 */
const FIGHTS = deepFreeze({ ...FIGHT, models: [...STRIKERS], feet: [...SIDES] as Hand[], gaps: [3, 4, 5], moments: [1, 2, 3, 4, 5, 6, 7, 8] });

export function createStrikeCases(context: GameContext) {
  const { treeObeys, controllers: CONTROLLERS, minds: MINDS } = context.catalog;
  const mindFaults = contextMindFaults.bind(undefined, context);
  const { opponentOf } = createDrillOpponents(context);

  /** Why `value` is no subject, or what keeps its mind from `model` holding what it names (`mindFaults`). */
  function faultsOf(value: Json, model: BodyModel, subject?: Subject): readonly string[] {
    const given = value as Partial<StrikeSubject> | null;
    if (!given || typeof given !== "object" || Array.isArray(given) || typeof given.skill !== "string") return ["a subject is a mind and the skill it drills"];
    if (given.held !== undefined) {
      const faults = loadoutFaults(given.held);
      if (faults.length) return faults.map((fault) => `held: ${fault}`);
    }
    const kind = (given.mind as { kind?: unknown } | undefined)?.kind;
    if (typeof kind !== "string" || !Object.hasOwn(CONTROLLERS, kind)) return [`no mind: a config names its kind (${Object.keys(CONTROLLERS).join(", ")})`];
    if (!presetFitsModel(subject ?? {}, model)) return [`named calibration allows ${subject?.models?.join(", ") || "no bodies"}; ${model} is unavailable`];
    if (!treeObeys(given.mind!)) return [`a ${kind} mind carries out no orders, so no drill leads it`];
    const held = given.held ?? EMPTY_LOADOUT;
    return mindFaults(given.mind!, modelHolding(model, held, subject?.character), { entry: [] })
      .map((fault) => `${model}${given.held === undefined ? "" : ` holding ${loadoutKey(held)}`}: ${fault}`);
  }

  /** Each mind's kit on each body (`kitOn`), read once: null for a mind that describes nothing of what it builds. */
  const KITS = new WeakMap<MindConfig, WeakMap<BodySpec, readonly KitEntry[] | null>>();

  /** The kit `mind` has on a body of `spec` (`kitOf`), from what it says it builds there (`describeMind`); null where it says nothing. */
  function kitOn(mind: MindConfig, spec: BodySpec): readonly KitEntry[] | null {
    let bySpec = KITS.get(mind);
    if (!bySpec) KITS.set(mind, bySpec = new WeakMap());
    let kit = bySpec.get(spec);
    if (kit === undefined) {
      const described = describeMind(context.catalog, spec, mind);
      bySpec.set(spec, kit = described && kitOf(described.executors, described.actions.map(({ action }) => action)));
    }
    return kit;
  }

  /**
   * **Why `condition` is no case of the subject**: what keeps its mind from the condition's body
   * (`faultsOf`), or that its mind does not offer its skill with the condition's limb at its mark
   * there (`kitOffers`), so the drill's order would name no choice of its menu. A strike is asked
   * only where it is offered; a blow the Mind does not begin where it is offered is the trial's
   * to count (`strikeOffered`). A mind that describes nothing of what it builds is asked every condition.
   */
  function caseFaults(value: Json, condition: StrikeCondition, subject?: Subject): readonly string[] {
    const faults = faultsOf(value, condition.model, subject);
    if (faults.length) return faults;
    const { mind, skill, held } = value as unknown as StrikeSubject;
    const kit = kitOn(mind, modelHolding(condition.model, held ?? EMPTY_LOADOUT, subject?.character));
    return kit === null || kitOffers(kit, skill, limbOf(condition), { kind: "mark", mark: condition.mark }) ? []
      : [`${skill} is not offered with ${limbOf(condition)} at the ${condition.mark} mark`];
  }

  /**
   * **Whether `mind` strikes by `skill` on `model` holding `held`**: its kit there has the skill
   * with a limb at a region (`kitOn`). A mind that describes nothing of what it builds is taken to.
   */
  function strikesBy(mind: MindConfig, skill: string, model: BodyModel, held: Loadout): boolean {
    const kit = kitOn(mind, modelHolding(model, held));
    return kit === null || kit.some((entry) => entry.kind === skill && entry.limbs.length > 0 && entry.regions.length > 0);
  }

  function stillCases(protocol: typeof STILL & { readonly starts?: readonly Start[]; readonly opponent?: string; readonly letGo?: readonly number[];
    readonly feet?: readonly Hand[]; readonly targets?: readonly BodyModel[]; readonly laid?: typeof LAID; readonly motion?: true; readonly timing?: BoutTiming } & Partial<Moving>,
    drawn?: readonly StillCondition[]): Cases<StrikeCondition, StrikeReading> {
    const conditions: StillCondition[] = drawn ? [...drawn] : [], limbs: Limb[] = [...protocol.hands.map((hand) => ({ hand })), ...(protocol.feet ?? []).map((foot) => ({ foot }))];
    const moving: Moving | null = protocol.directions === undefined ? null : protocol as Moving;
    const motions = moving ? moving.directions.flatMap((direction) => moving.speeds.map((speed) => ({ direction, speed }))) : [undefined];
    if (!drawn) for (const model of protocol.models) for (const mark of protocol.marks) for (const limb of limbs) for (const target of protocol.targets ?? [undefined]) for (const motion of motions)
      for (const across of protocol.across) for (const gap of protocol.gaps) for (const start of protocol.starts ?? [undefined]) for (const letGo of protocol.letGo ?? [undefined])
        conditions.push({ model, mark, ...limb, ...(target === undefined ? {} : { target }), ...motion, across, gap, ...(start === undefined ? {} : { start }), ...(letGo === undefined ? {} : { letGo }) });
    return {
      arity: 1,
      play: protocol as unknown as Json,
      ...protocol.timing === undefined ? {} : { timing: protocol.timing },
      conditions,
      seconds: protocol.seconds,
      faults: (value, condition, subject) => [...caseFaults(value, condition, subject),
        ...protocol.motion && (value as unknown as StrikeSubject).held?.[handOf(condition)!] !== "club" ? ["swing motion observes the hand holding a club"] : []],
      world: ([value], condition, engine, [character]) => {
        const { model, gap, across, mark, target, start, approach, letGo, direction, speed } = condition as StillCondition, hand = handOf(condition as StillCondition);
        const side = protocol.toward === "hand" && hand === "left" ? across : -across;
        const carried = moving && direction !== undefined && speed !== undefined ? railOf(moving, protocol.settled, direction, speed, gap, side) : null;
        const leading = opposed(striker(value as unknown as StrikeSubject, effectorOf(condition), mark, { after: protocol.settled, pace: protocol.pace,
          walking: start === "walking" || carried !== null || approach !== undefined, ...(approach === undefined ? {} : { approach }), ...(letGo === undefined ? {} : { letGo }) }), opponentOf(protocol.opponent ?? STANDING)!);
        return { kind: "bout", engine, tape: [], ...protocol.timing === undefined ? {} : { timing: protocol.timing },
        // A drill, not a fight: no attack is asked of either side, and nothing ends it but its reader.
        recipe: { left: model, right: target ?? "man", capSeconds: protocol.seconds + 1, recoverySeconds: null, entry: [], ends: [], ...sideAttributes({ left: character }),
          ...(protocol.motion ? { balance: { left: 0, right: 0 } } : {}),
          ...loadoutsOf(value as unknown as StrikeSubject),
          // Along +x, as the open stage's spawns are: a body facing +x has its right toward -z.
          start: { left: { at: [-gap / 2, 0], heading: Math.PI / 2 }, right: { at: carried ? [...carried.from] : [gap / 2, side], heading: -Math.PI / 2 } },
          ...leading,
          ...(carried ? { rail: carried.rail } : {}),
          // Facing -x, its back is toward +x: 90 degrees from +z.
          ...(protocol.laid ? { shove: { side: "right", segment: protocol.laid.segment, degrees: 90, at: 0,
            impulse: protocol.laid.speed * modelSpec(target ?? "man").mass.value } } : {}) } };
      },
      read: (built, condition) => readStrike(built, condition, protocol),
    };
  }

  function fightCases(protocol: typeof FIGHT & { readonly feet?: readonly Hand[]; readonly gaps?: readonly number[] }): Cases<StrikeCondition, StrikeReading> {
    const conditions: FightCondition[] = [], limbs: Limb[] = [...protocol.hands.map((hand) => ({ hand })), ...(protocol.feet ?? []).map((foot) => ({ foot }))];
    for (const model of protocol.models) for (const foe of protocol.foes) for (const gap of protocol.gaps ?? [undefined]) for (const mark of protocol.marks) for (const limb of limbs)
      for (const moment of protocol.moments) conditions.push({ model, foe, mark, ...limb, moment, ...(gap === undefined ? {} : { gap }) });
    return {
      arity: 1,
      play: protocol as unknown as Json,
      conditions,
      seconds: protocol.seconds,
      faults: caseFaults,
      world: ([value], condition, engine, [character]) => {
        const { model, foe, mark, moment, gap } = condition as FightCondition;
        // A fight on the open stage from its spawns (its gap's, where the rung names one), nothing ending it but the reader.
        return { kind: "bout", engine, tape: [],
          recipe: { left: model, right: "man", capSeconds: protocol.seconds + 1, recoverySeconds: null, entry: [], ends: [],
            ...sideAttributes({ left: character, right: MINDS[foe]!.character }), ...loadoutsOf(value as unknown as StrikeSubject),
            ...opposed(striker(value as unknown as StrikeSubject, effectorOf(condition as FightCondition), mark, { after: 0, pace: protocol.pace, walking: true, moment }), opponentOf(foe)!),
            ...(gap === undefined ? {} : { gap }) } };
      },
      read: (built, condition) => readStrike(built, condition, protocol),
    };
  }

  /**
   * A rung a table cell reads, `name`, beside its training twin, `<name>-twin`: the rung's places
   * drawn halfway between its gaps and its offsets across (`between`), research's to tune on.
   */
  const twinned = (name: string, rung: Parameters<typeof stillCases>[0]): Record<string, Cases<StrikeCondition, StrikeReading>> =>
    ({ [name]: { ...stillCases(rung), twin: `${name}-twin` }, [`${name}-twin`]: stillCases(deepFreeze({ ...rung, gaps: between(rung.gaps), across: between(rung.across) })) });

  /** Every protocol the Strike drill may be played on, by name: its rungs. */
  const STRIKE_CASES: Readonly<Record<string, Cases<StrikeCondition, StrikeReading>>> = Object.freeze({ ...twinned("still", atEveryFoe(STILL)), sampled: stillCases(SAMPLED, sampledConditions(SAMPLED)),
    "swing-motion": stillCases(SWING_MOTION),
    moving: stillCases(MOVING), ...twinned("walk", atEveryFoe(WALK)), ...twinned("bonk", atEveryFoe(BONK)),
    stepping: stillCases(STEPPING), guarding: stillCases(GUARDING), punching: stillCases(PUNCHING), fight: fightCases(FIGHT), fights: fightCases(FIGHTS),
    letgo: stillCases(LETTING_GO), "letgo-punched": stillCases(LETTING_GO_PUNCHED), ...twinned("stomping", STOMPING),
    "stomping-sampled": stillCases(STOMPING_SAMPLED, sampledConditions(STOMPING_SAMPLED)),
    ...twinned("still-bodies", atEveryFoe(onOtherBodies(STILL))), ...twinned("walk-bodies", atEveryFoe(onOtherBodies(WALK))), "fight-bodies": fightCases(onOtherBodies(FIGHT)),
    ...twinned("stomping-bodies", onOtherBodies(STOMPING)) });

  return { faultsOf, strikesBy, STRIKE_CASES };
}
