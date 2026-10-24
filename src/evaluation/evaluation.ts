/**
 * **What an evaluation is**: conditions, the world of a case for its subjects, and what is read of
 * it in its task's units; the runner (`run.ts`) combines the readings. One definition serves Node,
 * its workers and a page.
 */
import type { DuelRecipe, OrdersEntry } from "../arena/duel.ts";
import type { EngineName } from "../core/engine/engines.ts";
import type { Side } from "../core/spec/body.ts";
import type { BuiltBout } from "./bout.ts";
import type { BuiltCrypt, CryptCase } from "./crypt.ts";
import type { BuiltFall, FallCase } from "./fall.ts";
import type { BuiltLone, LoneCase } from "./lone.ts";
import type { BuiltBody } from "../core/build/build-body.ts";
import type { MindConfig } from "../core/mind/config.ts";

/** Plain finite JSON: what survives a key, a record, a URL and `postMessage`. */
export type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };

/**
 * What is evaluated: `id` stable and readable; `parts` by id (`mind:duellist`, `model:workshop-rogue`,
 * `right:sword`) with what each is (a mind's config, a body's spec, an item's), whose versions the
 * records keep; `value` what a case's world is built from.
 */
export interface Subject {
  readonly id: string;
  readonly label: string;
  /** Named body calibration, where the case's admission reads it; absent for an independent configuration. */
  readonly models?: readonly string[];
  readonly parts: readonly { readonly id: string; readonly value: Json }[];
  readonly value: Json;
}

/**
 * What a case plays, as plain data: one kind of world each (`WorldKind`, listed in `WORLD_BUILDERS`,
 * `worlds.ts`). A bout, a lone body and a Crypt run are bit-equal between JavaScript engines; a
 * fall is not (`fall.ts`).
 */
export type CaseWorld = { readonly kind: "bout"; readonly engine: EngineName; readonly recipe: DuelRecipe; readonly tape: readonly OrdersEntry[] }
  | { readonly kind: "fall"; readonly engine: EngineName; readonly fall: FallCase }
  | { readonly kind: "crypt"; readonly engine: EngineName; readonly crypt: CryptCase }
  | { readonly kind: "lone"; readonly engine: EngineName; readonly lone: LoneCase };

/** What a case's world gives its reader: a bout's, a fall's, a Crypt run's or a lone body's. */
export type BuiltCase = BuiltBout | BuiltFall | BuiltCrypt | BuiltLone;

/**
 * **A kind of case world**: how a world of it is built, what it is handed once its reader is made
 * (a bout its tape), the bodies a case's digest traces (`traceOf`), the simulated seconds it has
 * played, and the minds it plays and its other parts by kind (Commanders, end rules), whose code a case holds (`caseNames`).
 * `playCase` steps every kind the same way.
 */
export interface WorldKind<W extends CaseWorld = CaseWorld, B extends { readonly world: { step(): void }; dispose(): void } = BuiltCase> {
  build(world: W): Promise<B>;
  start?(built: B, world: W): void;
  traced(built: B): readonly BuiltBody[];
  clock(built: B): number;
  minds(world: W): readonly MindConfig[];
  parts?(world: W): readonly string[];
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
  readonly conditions: readonly C[];
  readonly seconds: number;
  /** Why a subject cannot play `condition`; its scheduling metadata is available where admission needs it. */
  faults?(value: Json, condition: C, subject?: Subject): readonly string[];
  world(values: readonly Json[], condition: C, engine: EngineName): CaseWorld;
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
export type SubjectChoice = readonly (string | { readonly id: string; readonly label: string; readonly value: Json })[];

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
  /** What the evaluation states of a complete table beside its figures: lines to print, and JSON to keep. */
  summary(table: Table<C, R>): { readonly lines: readonly string[]; readonly json: Json };
}
