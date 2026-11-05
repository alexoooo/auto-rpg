/**
 * **A held decision**: made, kept in its caller's `state`, and made again only on a trigger:
 *
 * - an **event**: the cue it names (a focus, a body, an order) is not the one it was made on;
 * - **drift**: an input it was made from has moved past its tolerance since (`Drift`);
 * - **failure**: a cheap check, each ask, that the held answer still holds fails;
 * - its **deadline**: `rethink` s since it was made, the backstop, never the main trigger.
 *
 * Between triggers it costs its check. Its memory (`Held`) is plain data: when it was made, the
 * cue, and the inputs it was made from, flat. The chooser's period and cue (`selectSet`), a
 * table kept for its period, a ground plan kept until its target drifts and a fallen body's
 * footprint kept until its centre does are each such a hold.
 */
export interface Held {
  /** When it was made, s; -Infinity before it first is, or once it is let go. */
  made: number;
  cue: string;
  /** Each drift's inputs as they stood when it was made, one after another. */
  from: number[];
}

/** A hold with nothing made. */
export const unheld = (): Held => ({ made: -Infinity, cue: "", from: [] });

/** An input a held decision is made from: its numbers (a point's coordinates), and how far they may move together, a distance, before it is made again. */
export interface Drift {
  readonly at: readonly number[];
  readonly within: number;
}

/**
 * **Whether `held` still holds at `now`**: made, on `cue`, less than `rethink` s ago, with no input
 * of `drift` moved past its tolerance since, and `check` true. `drift` names the inputs in the
 * order they were held in (`hold`).
 */
export function stillHeld(held: Held, now: number, rethink: number, cue: string, drift: readonly Drift[], check: () => boolean): boolean {
  if (held.made === -Infinity || cue !== held.cue || now >= held.made + rethink) return false;
  let k = 0;
  for (const input of drift) {
    let squared = 0;
    for (const value of input.at) { const d = value - held.from[k++]!; squared += d * d; }
    if (squared > input.within * input.within) return false;
  }
  return check();
}

/** Hold what was made at `now` on `cue`, from the inputs of `drift`. */
export function hold(held: Held, now: number, cue: string, drift: readonly Drift[]): void {
  held.made = now; held.cue = cue; held.from.length = 0;
  for (const input of drift) for (const value of input.at) held.from.push(value);
}

/** Let `held` go: the next ask makes it afresh. */
export function letGo(held: Held): void {
  held.made = -Infinity; held.cue = ""; held.from.length = 0;
}
