import type { Situation } from "./situation.ts";

/**
 * **What a path of a line has brought** (`Path`): what the Options along it bring, summed (each in
 * life, a share of a body's full life, and the metres walked as ordered), and the seconds they run
 * before the body holds (`seconds`).
 */
export interface Tally {
  readonly dealt: number;
  readonly taken: number;
  readonly orders: number;
  readonly seconds: number;
}

/** **One path of a line** (`Objective.worth`): what it has brought (`Tally`), and the state it ends in (`end`). */
export interface Path extends Tally {
  readonly end: Situation;
}

/**
 * **What carrying out the orders is worth**, life: a metre walked as ordered (`metre`), and how
 * much more than another's a foe's life is worth where the orders name it (`foe`, a share of it).
 */
export interface Obedience { readonly metre: number; readonly foe: number }

/** An obedience level's value (`OBEDIENCE`). */
export type ObedienceLevel = "own" | "steady" | "orders";

/**
 * **An objective**: what a path (`Path`) is worth to the body deciding at `now`, in life (the
 * verdict's unit), its orders carried out at `obedience`; a path is read at the call and not kept.
 * One interface, so the few terms (`fewTerms`) and a learned or non-combat value are each an
 * implementation of it; its memory, where it keeps one, is in `state`, plain data, which its
 * chooser keeps with its own. Where it has `weigh`, it says what life a path trades counts for by
 * when in the line it comes: `dealt` (the focus's) or `taken` (the body's own), traded evenly over
 * `span` s from `from` s into a line of `horizon` s, a share the chooser, which alone knows when,
 * multiplies that life by as it adds a line up, before the path is priced (`Path`); without it,
 * all counts as itself.
 */
export interface Objective {
  readonly name: string;
  readonly state?: object;
  weigh?(side: "dealt" | "taken", from: number, span: number, horizon: number): number;
  worth(path: Path, now: Situation, obedience: Obedience): number;
}
