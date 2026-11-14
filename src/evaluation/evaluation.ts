/**
 * **What an evaluation is**: conditions, the world of a case for its subjects, and what is read of
 * it in its task's units; the runner (`run.ts`) combines the readings. One definition serves Node,
 * its workers and a page.
 */
import type { Refused } from "../core/refusal.ts";
import type { DuelRecipe, OrdersEntry } from "../game/arena/duel.ts";
import type { EngineName } from "../core/physics/engines.ts";

import type { BuiltBout } from "./bout.ts";
import type { BuiltCrypt, CryptCase } from "./crypt.ts";
import type { BuiltFall, FallCase } from "./fall.ts";
import type { BuiltLone, LoneCase } from "./lone.ts";
import type { BuiltTechnique, TechniqueCase } from "./technique.ts";
import type { BuiltBody } from "../core/bodies/build/build-body.ts";
import type { AttributeOverrides } from "../core/bodies/character-attributes.ts";
import { characterSkills, modelHolding, type BodyModel } from "../core/bodies/models.ts";
import { withVariations, type BodySpec, type SkillChoices } from "../core/bodies/spec/body.ts";
import type { Loadout } from "../core/bodies/items/held.ts";
import type { MindConfig } from "../minds/catalog/config.ts";
import type { Minded } from "../minds/seat/create-mind.ts";
import type { ArenaSeat as Side } from "../game/arena/seat.ts";

/** Plain finite JSON: what survives a key, a cached row, a URL and `postMessage`. */
export type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };

/** What is evaluated: `id` stable and readable; `value` what a case's world is built from. */
export interface Subject {
  readonly id: string;
  readonly label: string;
  /** Named body calibration, where the case's admission reads it; absent for an independent configuration. */
  readonly models?: readonly string[];
  /** The attributes its bodies take (`MindPreset.character`); absent for none. */
  readonly character?: AttributeOverrides;
  /**
   * The variations its bodies' characters hold in place of their own of the same skills
   * (`skill/variation`, `withVariations`), as its name chooses them (`variedSubjects`); absent for none.
   */
  readonly variations?: SkillChoices;
  readonly value: Json;
}

/** **A seated subject's character** (`Subject`), a preset's alike: the attributes its bodies take and the variations they hold. */
export type Seat = Pick<Subject, "character" | "variations">;

/** The body of `model` for `seat`, carrying `loadout`: its character taking the seat's attributes and holding its variations (`modelHolding`). */
export const seatBody = (model: BodyModel, loadout: Loadout, seat?: Seat): BodySpec =>
  modelHolding(model, loadout, seat?.character, characterSkills(model, seat?.variations));

/** A mind's config as the plain data it is: what a subject's value holds of it. */
export const mindJson = (config: MindConfig): Json => config as unknown as Json;

/** A subject's value as the mind's config it holds. What is wrong with it is the case's to find (`mindFaults`). */
export const mindOf = (value: Json | undefined): MindConfig => value as unknown as MindConfig;

/** A mind as a subject: its id, the label shown, its config whole (or a subject's value given whole), and a preset's named calibration, character and variations. */
export function mindSubject(id: string, label: string, mind: MindConfig | Json, preset: Pick<Subject, "models" | "character" | "variations"> = {}): Subject {
  const given = mind as Json, wrapped = given as { readonly mind?: Json; readonly models?: readonly string[]; readonly character?: AttributeOverrides; readonly variations?: SkillChoices } | null;
  const value = wrapped && typeof wrapped === "object" && !Array.isArray(wrapped) && wrapped.mind !== undefined ? wrapped.mind : given;
  const models = preset.models ?? (value !== given ? wrapped?.models : undefined);
  const character = preset.character ?? (value !== given ? wrapped?.character : undefined);
  const variations = preset.variations ?? (value !== given ? wrapped?.variations : undefined);
  return { id, label, value, ...(models === undefined ? {} : { models }), ...(character === undefined ? {} : { character }),
    ...(variations === undefined ? {} : { variations }) };
}

/** Why `variations` are no choice of the skills `offered` (each skill's variations, `Part.variations`), or null: each a `skill/variation` it offers, none twice. */
function variationsFault(variations: readonly string[], offered: Readonly<Record<string, readonly string[]>>): string | null {
  for (const [at, name] of variations.entries()) {
    const slash = name.indexOf("/"), skill = name.slice(0, slash), variation = name.slice(slash + 1);
    if (slash < 0) return `${name} is not skill/variation`;
    if (!Object.hasOwn(offered, skill)) return `no skill ${skill} has variations: ${Object.keys(offered).join(", ")}`;
    if (!offered[skill]!.includes(variation)) return `the ${skill} has no variation ${variation}: ${offered[skill]!.join(", ")}`;
    if (variations.indexOf(name) !== at) return `${name} twice`;
  }
  return null;
}

/**
 * **`evaluation` with its subjects' variations chosen by name**: a name ending in one or more
 * `+<skill>/<variation>` (`option/straight-punch+straight-punch/from-guard`) is each subject the
 * name before them gives, its bodies' characters holding those variations in place of their own of
 * the same skills (`Subject.variations`), its id the name's and its label saying so. A skill
 * `offered` lists no variation of is refused, as is a variation it does not offer.
 */
export function variedSubjects<E extends Pick<Evaluation, "subjects">>(evaluation: E, offered: () => Readonly<Record<string, readonly string[]>>): E {
  const subjects = evaluation.subjects;
  /** Each choice's name and the variations it ends with, none for a value given whole. */
  const split = (one: SubjectChoice[number]): { readonly one: SubjectChoice[number]; readonly variations: readonly string[] } => {
    if (typeof one !== "string" || !one.includes("+")) return { one, variations: [] };
    const [base, ...variations] = one.split("+"), fault = variationsFault(variations, offered());
    if (fault) throw new Error(`${one}: ${fault}`);
    return { one: base!, variations };
  };
  const varied = (subject: Subject, variations: readonly string[]): Subject => variations.length === 0 ? subject
    : { ...subject, id: `${subject.id}+${variations.join("+")}`, label: `${subject.label}, holding ${variations.join(", ")}`,
      variations: withVariations(subject.variations ?? [], variations) };
  return { ...evaluation, subjects: (choice: SubjectChoice) => {
    const named = choice.map(split);
    if (named.every(({ variations }) => variations.length === 0)) return subjects(choice);
    // Names resolved together, as an evaluation that reads its choice whole (a match's two minds) asks; one that gives a name several subjects (the tournament's entrants), each alone.
    const together = subjects(named.map(({ one }) => one));
    return together.length === named.length ? together.map((subject, at) => varied(subject, named[at]!.variations))
      : named.flatMap(({ one, variations }) => subjects([one]).map((subject) => varied(subject, variations)));
  } };
}

/**
 * A one-body case's `character` and `skills` for `seat` on `model` (`LoneCase`, `FallCase`): none
 * where it has no attributes or variations, so a case on the body's own character keeps its world.
 */
export function seatCharacter(model: BodyModel, seat: Seat | undefined): { readonly character?: AttributeOverrides; readonly skills?: SkillChoices } {
  const character = seat?.character, skills = characterSkills(model, seat?.variations);
  return { ...(character && Object.keys(character).length > 0 ? { character } : {}), ...(skills ? { skills } : {}) };
}

/**
 * A bout recipe's `attributes` and `skills` for each side's seat on its model (`Seat`): none where
 * neither side has attributes or variations, so a case on the bodies' own characters keeps its world.
 */
export function sideCharacters(models: Readonly<Record<Side, BodyModel>>, seats: Readonly<Partial<Record<Side, Seat>>>): Pick<DuelRecipe, "attributes" | "skills"> {
  const left = seats.left?.character ?? {}, right = seats.right?.character ?? {};
  const skills = Object.fromEntries((["left", "right"] as const).flatMap((side) => {
    const held = characterSkills(models[side], seats[side]?.variations);
    return held ? [[side, held]] : [];
  }));
  return { ...(Object.keys(left).length + Object.keys(right).length === 0 ? {} : { attributes: { left, right } }),
    ...(Object.keys(skills).length === 0 ? {} : { skills }) };
}

/** A bout's native physics rate, Hz, and command delay, whole steps. */
export type BoutTiming = { readonly hz: number; readonly delay: number };

/** A recorded bout runs at a positive whole rate with at least one command-delay step. */
export const validBoutTiming = (value: unknown): value is BoutTiming => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const timing = value as Partial<BoutTiming>;
  return Number.isInteger(timing.hz) && timing.hz! > 0 && Number.isInteger(timing.delay) && timing.delay! >= 1;
};

/**
 * What a case plays, as plain data: one kind of world each (`WorldKind`, listed in `WORLD_BUILDERS`,
 * `worlds.ts`). A bout, a lone body and a Crypt run are bit-equal between JavaScript engines; a
 * fall and techniques in turn are not (`fall.ts`, `technique.ts`).
 */
export type CaseWorld = { readonly kind: "bout"; readonly engine: EngineName; readonly recipe: DuelRecipe; readonly tape: readonly OrdersEntry[]; readonly timing?: BoutTiming }
  | { readonly kind: "fall"; readonly engine: EngineName; readonly fall: FallCase }
  | { readonly kind: "crypt"; readonly engine: EngineName; readonly crypt: CryptCase }
  | { readonly kind: "lone"; readonly engine: EngineName; readonly lone: LoneCase }
  | { readonly kind: "technique"; readonly engine: EngineName; readonly technique: TechniqueCase };

/** What a case's world gives its reader: a bout's, a fall's, a Crypt run's, a lone body's or techniques in turn. */
export type BuiltCase = BuiltBout | BuiltFall | BuiltCrypt | BuiltLone | BuiltTechnique;

/**
 * **A kind of case world**: how a world of it is built, what it is handed once its reader is made
 * (a bout its tape), the bodies a case's digest traces (`traceOf`), the simulated seconds it has
 * played.
 * `playCase` steps every kind the same way.
 */
export interface WorldKind<W extends CaseWorld = CaseWorld, B extends { readonly world: { step(): void }; dispose(): void } = BuiltCase> {
  /** `world` built, at `hz` control steps a second where the kind takes a rate (a bout's), else at the world's own. */
  build(world: W, options?: { readonly hz?: number }): Promise<B | Refused>;
  start?(built: B, world: W): void;
  traced(built: B): readonly BuiltBody[];
  clock(built: B): number;
  /** The bodies under a mind the built world plays, where the kind lists them: what a learning environment finds its learner in. */
  hosted?(built: B): readonly Minded[];
  /** The built world as it stands, and the same world put back to a save of it, where the kind can (a bout's, `Duel.save`). */
  save?(built: B): unknown;
  load?(built: B, saved: unknown): void;
}

/** Reads a case as it plays: after each step, whether it is over, and what it came to. */
export interface Reader<R extends Json> {
  afterStep(): void;
  readonly ended: boolean;
  reading(): R;
}

/**
 * **A case module's protocol**: `arity` 0 (decision points), 1 (a battery) or 2 (a contest, the first
 * on the left); `play`, the protocol, in every case's key; `conditions`; the longest a case may last,
 * simulated s; the engine, where the protocol fixes one; the world of each case (built as `B`) and its reader.
 */
export interface Cases<C extends Json = Json, R extends Json = Json, B extends BuiltCase = BuiltBout> {
  readonly arity: 0 | 1 | 2;
  readonly play: Json;
  /** The one engine the protocol is played on; any the runner is given, unless named. */
  readonly engine?: EngineName;
  /** A bout protocol's native physics rate and command delay in steps, recorded in every world. */
  readonly timing?: BoutTiming;
  readonly conditions: readonly C[];
  readonly seconds: number;
  /**
   * The protocol of the same evaluation that is this one's training twin (`src/evaluation/twin.ts`),
   * where a table cell reads this one: research scores there, and this one's cases stay held out. In no key.
   */
  readonly twin?: string;
  /** Why a subject cannot play `condition`; its scheduling metadata is available where admission needs it. */
  faults?(value: Json, condition: C, subject?: Subject): readonly string[];
  /** `seats` each seated subject's character (`Seat`): the attributes its bodies take and the variations they hold. */
  world(values: readonly Json[], condition: C, engine: EngineName, seats: readonly Seat[]): CaseWorld | Refused;
  read(built: B, condition: C): Reader<R>;
}

/**
 * What a reading gives a subject, in its task's units: a rate of trials (true, false), a mean or a
 * median; null where the reading has none. A contest's subject is read from the side it played.
 */
export interface Figure<R extends Json = Json> {
  readonly name: string;
  readonly unit: string;
  readonly kind: "rate" | "mean" | "median";
  readonly better: "higher" | "lower";
  of(reading: R, side: Side): number | boolean | null;
}

/** The subjects asked for, in order: each a name a catalogue resolves, or a value given whole (a mind's JSON). */
export type SubjectChoice = readonly (string | { readonly id: string; readonly label: string; readonly value: Json; readonly models?: readonly string[]; readonly character?: AttributeOverrides; readonly variations?: SkillChoices })[];

/** A contest's reading carries the left's score (1, a half, 0) and margin. */
export type ContestReading = {
  readonly score: number;
  readonly margin: number;
};

/** The cases' rows, complete, in their definition's order, for a summary. */
export interface Table<C extends Json = Json, R extends Json = Json> {
  readonly subjects: readonly Subject[];
  readonly cases: readonly { readonly subjects: readonly string[]; readonly condition: C; readonly reading: R; readonly digest: string }[];
}

/**
 * **An evaluation's description**: what it asks, its protocols (the case modules'), its subjects,
 * figures and summary. `analysis` is in no key.
 */
export interface Evaluation<C extends Json = Json, R extends Json = Json, B extends BuiltCase = BuiltBout> {
  readonly id: string;
  readonly title: string;
  readonly group: "fighters" | "skills" | "decisions";
  readonly question: string;
  readonly protocols: Readonly<Record<string, Cases<C, R, B>>>;
  readonly defaultProtocol: string;
  /** Whether one command plays every protocol, each its own result, unless one is named; otherwise the default alone. */
  readonly every?: true;
  /** Whom a contest's subjects meet unless told: every pair, or a panel (`schedule.ts`). */
  readonly schedule: "all" | "versus";
  readonly analysis: Json;
  subjects(choice: SubjectChoice): readonly Subject[];
  readonly figures: readonly Figure<R>[];
  /**
   * A drill's: what a trial came to in a word, and whether it passed, as the Ratings strip shows
   * each trial and its reel plays the failures first.
   */
  outcome?(reading: R): { readonly label: string; readonly passed: boolean };
  /**
   * What a learning environment may weigh at a trial's end beside its reading's own numbers
   * (`research/case-learning-environment.mjs`): named terms, each from the reading and its condition,
   * null where the trial does not count.
   */
  readonly terms?: Readonly<Record<string, (reading: R, condition: C) => number | null>>;
  /**
   * What a learning environment may weigh as a trial plays: named percepts of its world, each read
   * after every step as a value a second, which the environment sums over the step's seconds.
   */
  readonly percepts?: Readonly<Record<string, (built: B, condition: C) => number>>;
  /** What the evaluation states of a complete table beside its figures: lines to print, and JSON to keep. */
  summary(table: Table<C, R>): { readonly lines: readonly string[]; readonly json: Json };
}
