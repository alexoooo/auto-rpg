/**
 * **What an evaluation is**: conditions, the world of a case for its subjects, and what is read of
 * it in its task's units; the runner (`run.ts`) combines the readings. One definition serves Node,
 * its workers and a page.
 */
import type { DuelRecipe, OrdersEntry } from "../arena/duel.ts";
import type { EngineName } from "../core/engine/engines.ts";
import type { Side } from "../core/spec/body.ts";
import type { BuiltBout } from "./bout.ts";

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
  readonly parts: readonly { readonly id: string; readonly value: Json }[];
  readonly value: Json;
}

/** What a case plays, as plain data: one builder each in `playCase`. */
export type CaseWorld = { readonly kind: "bout"; readonly engine: EngineName; readonly recipe: DuelRecipe; readonly tape: readonly OrdersEntry[] };

/** What a case's world gives its reader. */
export type BuiltCase = BuiltBout;

/** Reads a case as it plays: after each step, whether it is over, and what it came to. */
export interface Reader<R extends Json> {
  afterStep(): void;
  readonly ended: boolean;
  reading(): R;
}

/**
 * **A case module's protocol**: `arity` 0 (decision points), 1 (a battery) or 2 (a contest, the first
 * on the left); `play`, the protocol, in every case's key; `conditions`; the longest a case may last,
 * simulated s; the world of each case and its reader.
 */
export interface Cases<C extends Json = Json, R extends Json = Json> {
  readonly arity: 0 | 1 | 2;
  readonly play: Json;
  readonly conditions: readonly C[];
  readonly seconds: number;
  /** Why a subject's value cannot play `condition`; none unless given. */
  faults?(value: Json, condition: C): readonly string[];
  world(values: readonly Json[], condition: C, engine: EngineName): CaseWorld;
  read(built: BuiltCase, condition: C): Reader<R>;
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
export interface Evaluation<C extends Json = Json, R extends Json = Json> {
  readonly id: string;
  readonly title: string;
  readonly group: "fighters" | "skills" | "decisions";
  readonly question: string;
  readonly protocols: Readonly<Record<string, Cases<C, R>>>;
  readonly defaultProtocol: string;
  /** Whom a contest's subjects meet unless told: every pair, or a panel (`schedule.ts`). */
  readonly schedule: "all" | "versus";
  readonly analysis: Json;
  subjects(choice: SubjectChoice): readonly Subject[];
  readonly figures: readonly Figure<R>[];
  /** What the evaluation states of a complete table beside its figures: lines to print, and JSON to keep. */
  summary(table: Table<C, R>): { readonly lines: readonly string[]; readonly json: Json };
}
