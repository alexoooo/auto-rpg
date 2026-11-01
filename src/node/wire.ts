import type { At, ReportNow, SeatAsk } from "../core/mind/apart.ts";
import type { MirrorChannel } from "../core/mind/mirror.ts";
import type { MenuEntry } from "../core/skills/framework/menu.ts";

/**
 * **What crosses between the world's thread and a minds' thread**, in Node: each side's numbers in
 * memory both share (`SHARED_NUMBERS`), and in order, by message, a batch of asks one way and what
 * each seat's mind says the other. Two counters both threads share pace them (`POSTED`, `DONE`):
 * the world counts each batch it posts, the minds' thread each it has answered.
 */

/** Where in a minds' thread's counters the batches the world has posted are counted. */
export const POSTED = 0;
/** Where the batches the minds' thread has answered are counted. */
export const DONE = 1;

/** Numbers both threads share. */
export const SHARED_NUMBERS = (length: number): Float64Array => new Float64Array(new SharedArrayBuffer(8 * length));

/** What of its channel goes with an ask: the told entries since the last ask, and its numbers where they were made anew. */
export interface Carried {
  readonly seat: number;
  readonly ask: SeatAsk;
  readonly told?: readonly MirrorChannel["told"][number][];
  readonly inbound?: Float64Array;
  readonly outbound?: Float64Array;
}

/** **A batch** of asks to one minds' thread, its count; or the word to stop. */
export interface Batch { readonly seq: number; readonly asks: readonly Carried[]; readonly stop?: true }

/** What a seat's mind says as it crosses: its report but its kit and its gait, which cross only when they change, and its outbound numbers where made anew. */
export interface Said {
  readonly seat: number;
  readonly has: string;
  readonly observes: boolean;
  readonly report: Omit<ReportNow, "kit" | "gait"> | null;
  readonly kit?: ReportNow["kit"];
  readonly gait?: ReportNow["gait"];
  readonly menu?: readonly MenuEntry[] | null;
  readonly outbound?: Float64Array;
}

/** **A minds' thread's answer** to a batch: each seat it asked of, as its mind says it now; or the error that stopped it. */
export interface Reply { readonly seq: number; readonly said: readonly Said[]; readonly error?: string }

/** The clock of an ask, where it has one. */
export const atOf = (ask: SeatAsk): At | null => ask.kind === "dispose" ? null : ask.at;

/**
 * Wait until `control[index]` is past `was`: spinning up to `spin` ms first, then sleeping until
 * notified; a thread that does not answer in `timeout` ms is a defect.
 */
export function waitPast(control: Int32Array, index: number, was: number, { spin, timeout }: { readonly spin: number; readonly timeout: number }): void {
  if (Atomics.load(control, index) > was) return;
  const until = performance.now() + spin;
  while (performance.now() < until) if (Atomics.load(control, index) > was) return;
  const deadline = performance.now() + timeout;
  for (let now = Atomics.load(control, index); now <= was; now = Atomics.load(control, index)) {
    const left = deadline - performance.now();
    if (left <= 0 || Atomics.wait(control, index, now, left) === "timed-out" && Atomics.load(control, index) <= was) throw new Error(`a minds' thread did not answer in ${timeout} ms`);
  }
}
