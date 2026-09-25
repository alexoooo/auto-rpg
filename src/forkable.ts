/**
 * The one interface a stateful piece of a world implements to be forked (skill ceiling session 02,
 * `docs/plans/2026-09-25-skill-ceiling-02-fork.md`).
 *
 * **Who implements it.** A class needs nothing: the fork walks its fields (`src/fork/graph.ts`),
 * so a field added to `Combat` or to a `Golem` is captured the day it is added. What the walk
 * cannot reach is a closure's `let` and the private objects a closure holds, and nearly every
 * module, carrier and mind in this tree is a closure. Each of those returns its state from
 * `captureState` and takes it back in `restoreState`. The fork calls both generically and never
 * asks what the piece is.
 *
 * **The contract, which the walker relies on.**
 * - `captureState` returns a fresh plain record of the piece's live values -- its lets, and the
 *   objects it mutates in place -- and reads nothing it does not return. It must not change the
 *   piece: the original world is captured mid-bout and must go on bit-identical.
 * - The fork calls the *fork's* `captureState` first, to find the objects it will write into in
 *   place, then writes, then calls `restoreState` with a record of the same shape whose objects are
 *   already written. `restoreState` assigns its lets from the record; an object it holds in a
 *   `const` has already been written in place and may be left alone.
 * - Every `let`, and every object a closure piece holds privately, is in its record, or its
 *   declaration line carries a `fork: derived`, `fork: config`, `fork: presentation` or `fork: instrument` comment
 *   saying why it need not be. `tests/harness/closure-audit.mjs` reads each live closure's scopes
 *   through the inspector; `tests/fork.test.mjs` runs it over builds that between them use every
 *   registered module, and refuses a name that is neither.
 *
 * The names are `captureState`/`restoreState` rather than `capture`/`restore` because `StepStart`
 * already has a `capture` that does something else, and a walker that dispatched on the plain name
 * would have run it.
 */
export interface Forkable {
  captureState(): Record<string, unknown>;
  restoreState(state: Record<string, unknown>): void;
  /**
   * For a piece that builds part of itself lazily -- the champion builds its planner off the first
   * view it is handed. Called on the fork's piece before its `captureState`, with the captured
   * record's primitive values only (objects are not paired yet), so that it can build whatever the
   * original had built and the fork then has something to write into.
   */
  prepareState?(state: Record<string, unknown>): void;
}

/**
 * A body that can lose parts. Severing disposes constraints, re-layers shapes and changes motion
 * types, none of which a field write can undo or redo, so the fork replays the events themselves
 * on the fresh body before any state is written.
 */
export interface Topological {
  captureTopology(): unknown;
  restoreTopology(topology: unknown): void;
}

export function isTopological(value: unknown): value is Topological {
  return typeof value === "object" && value !== null
    && typeof (value as Topological).captureTopology === "function"
    && typeof (value as Topological).restoreTopology === "function";
}
