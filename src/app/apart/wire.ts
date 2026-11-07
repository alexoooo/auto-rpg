import type { At, ReportNow, SeatAsk } from "../../minds/seat/apart.ts";
import type { MirrorChannel, MirrorStatics } from "../../minds/seat/mirror.ts";
import type { BodySpec } from "../../core/bodies/spec/body.ts";
import type { MenuEntry } from "../../skills/framework/menu.ts";

/**
 * **What crosses between the world's thread and a minds' thread**: each side's numbers in memory
 * both share (`SHARED_NUMBERS`), and in order a batch of asks one way and what each seat's mind
 * says the other (by message in Node, `src/app/node/minds.ts`; in a reply box in the browser,
 * `src/app/browser/worker/minds.ts`). Two counters both threads share pace them (`POSTED`, `DONE`):
 * the world counts each batch it posts, the minds' thread each it has answered; a third
 * (`ANSWERED`) counts the step asks whose motor part it has carried out, so the world goes on with
 * a body's command while its mind still decides.
 */

/** Where in a minds' thread's counters the batches the world has posted are counted. */
export const POSTED = 0;
/** Where the batches the minds' thread has answered are counted. */
export const DONE = 1;
/** Where the step asks are counted whose motor part and answer the minds' thread has carried out (`Seat.answer`). */
export const ANSWERED = 2;

/** The counters a minds' thread and the world share. */
export const COUNTERS = 3;

/** Numbers both threads share. */
export const SHARED_NUMBERS = (length: number): Float64Array => new Float64Array(new SharedArrayBuffer(8 * length));

/**
 * A body's spec as it crosses: its number in the threads' table of specs. A spec is millions of
 * characters with its provenance, dear to copy, and a fight's bodies share a few: each crosses to
 * every thread once, the first time an ask names it (`Batch.specs`), and is named by its number after.
 */
export type SpecNumber = number;

/** What the world tells a mirror, as it crosses: a spec by its number. */
export type ToldCrossing = MirrorChannel["told"][number] extends infer T ? T extends { readonly spec: BodySpec } ? Omit<T, "spec"> & { readonly spec: SpecNumber } : T : never;

/** An ask as it crosses: a recipe's spec by its number. */
export type AskCrossing = Exclude<SeatAsk, { readonly kind: "make" }>
  | { readonly kind: "make"; readonly recipe: Omit<Extract<SeatAsk, { readonly kind: "make" }>["recipe"], "statics"> & { readonly statics: Omit<MirrorStatics, "spec"> & { readonly spec: SpecNumber } }; readonly at: At };

/** What of its channel goes with an ask: the specs the thread has not had, the told entries since the last ask, and its numbers where they were made anew. */
export interface Carried {
  readonly seat: number;
  readonly ask: AskCrossing;
  readonly told?: readonly ToldCrossing[];
  readonly inbound?: Float64Array;
  readonly outbound?: Float64Array;
}

/**
 * **A batch** of asks to one minds' thread, its count, and the specs it is sent, by their numbers,
 * before its asks; the word that the step's asks are all in, so its minds decide (`decide`); or the word to stop.
 */
export interface Batch { readonly seq: number; readonly asks: readonly Carried[]; readonly specs?: readonly (readonly [SpecNumber, BodySpec])[]; readonly decide?: true; readonly stop?: true }

/**
 * What a seat's mind says as it crosses: as it is made or answers, who has its body and its report
 * but its kit and its gait, which cross only when they change, and its engagement, which crosses
 * as it is made and where its step was asked with `shown`; its outbound numbers where made anew;
 * or the menu it was asked for.
 */
export type Said = {
  readonly seat: number;
  readonly has: string;
  readonly report: Omit<ReportNow, "kit" | "gait" | "engagement"> & { readonly engagement?: ReportNow["engagement"] } | null;
  readonly kit?: ReportNow["kit"];
  readonly gait?: ReportNow["gait"];
  readonly outbound?: Float64Array;
} | { readonly seat: number; readonly menu: readonly MenuEntry[] | null };

/** **A minds' thread's answer**: what a seat says with a step's answer, or a batch's, each seat it made and each menu it was asked for; or the error that stopped it. */
export interface Reply { readonly seq: number; readonly said: readonly Said[]; readonly error?: string }

/**
 * Wait until `control[index]` is past `was`: spinning up to `spin` ms first, then sleeping until
 * notified; a thread that does not answer in `timeout` ms is a defect.
 */
export function waitPast(control: Int32Array, index: number, was: number, { spin, timeout, drain }: { readonly spin: number; readonly timeout: number; readonly drain?: () => void }): void {
  if (Atomics.load(control, index) > was) return;
  const until = performance.now() + spin;
  while (performance.now() < until) { drain?.(); if (Atomics.load(control, index) > was) return; }
  const deadline = performance.now() + timeout;
  for (let now = Atomics.load(control, index); now <= was; now = Atomics.load(control, index)) {
    const left = deadline - performance.now();
    drain?.();
    if (Atomics.load(control, index) > was) return;
    if (left <= 0) throw new Error(`a minds' thread did not answer in ${timeout} ms`);
    Atomics.wait(control, index, now, drain ? Math.min(left, 5) : left);
  }
}
