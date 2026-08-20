// `FightSource` -- the one interface the arena is written against.
//
// This is a rename of what already exists rather than a speculative
// abstraction. `trace.ts` already defines `Trace`/`Frame`/`Pose`/`Contact` and
// the views already consume them; what this file adds is the seam between "a
// fight" and "the JSON file a fight happened to be recorded into", so a later
// session can replace the feed without touching a panel.
//
// Two adapters, and both exist:
//
// | adapter                 | drives                                        |
// |-------------------------|-----------------------------------------------|
// | `TraceFightSource`      | `loadTrace(url)` over an 8-9 MB JSON          |
// | `StreamingFightSource`  | chunks of pose/event/region/projectile rows,  |
// |                         | adopted as the worker produces them           |
//
// Three places the two cannot agree, recorded here so the arena is built
// knowing about them rather than discovering them:
//
//   - **Region capsules.** The trace has them because `crates/lab/src/trace.rs`
//     calls `sim::body_region_volumes` -- the same function the contact phase
//     sweeps -- so a viewer cannot answer a geometry question the simulation has
//     already answered. `POSE_STRIDE = 66` carries no capsules.
//   - **Contact velocity and impulse.** `Contact` carries `velocityA/B` and
//     `impulseA/B`; the 32-word combat-event row carries neither, so
//     `closureSpeed()` has no live equivalent.
//   - **Shield thickness.** Deliberately absent from the pose row and needed by
//     `shieldCorners()`. It rides in the per-fight body header.

import { at, loadTrace, type Frame, type Trace } from "./trace.js";

/**
 * Everything about a fight that is not one of its frames.
 *
 * `schema` is deliberately excluded: it identifies the *file format* a trace
 * was written in, and a live recording has no such thing. A source that had to
 * invent one would be claiming a contract it does not participate in.
 */
export type FightHeader = Omit<Trace, "frames" | "schema" | "outcome"> & {
  /**
   * `null` while the fight is still being produced.
   *
   * A streamed fight has no outcome until it stops, and the two dishonest
   * options are both worse than a null: a default string makes the readout
   * claim a result that has not happened, and omitting the field makes every
   * reader's `header.outcome` read `undefined` and print it.
   *
   * **`sim` was checked for a word before this was invented, and it has none.**
   * `World::outcome` answers `Option<Outcome>` and `None` is the undecided
   * fight -- an absence rather than a sixth variant beside `Draw` -- so `null`
   * here is that `Option` and not a new vocabulary. The studio renders the
   * absence as a sentence; `Outcome`'s own five names stay what they are.
   */
  readonly outcome: string | null;
};

/** One recorded instant: the poses, the contacts resolved into it, and health. */
export type FightFrame = Frame;

export interface FightSource {
  readonly header: FightHeader;
  frameCount(): number;
  /**
   * The recorded frame at `index`.
   *
   * **An index into the recording, not a tick.** They coincide for a recording
   * that kept every tick -- which both current producers do -- and the frame's
   * own `t` is the authority either way. Out of range throws, because a viewer
   * that clamps draws a frame the reader did not ask for and says nothing.
   */
  frameAt(index: number): FightFrame;
}

/** A `FightSource` over the JSON `lab trace` writes. */
export class TraceFightSource implements FightSource {
  readonly header: FightHeader;
  readonly #frames: readonly FightFrame[];

  constructor(trace: Trace) {
    // `schema` is dropped from the object and not only from the type. A
    // `StreamingFightSource` builds its header field by field and has no
    // `schema` to put in it, so a trace-backed header that still carried one at
    // runtime would make the two adapters structurally different behind an
    // `Omit` that says they are not -- and the first thing to notice would be
    // whatever iterates a header rather than reading a named field off it.
    const { frames, schema: _fileFormat, ...header } = trace;
    this.header = header;
    this.#frames = frames;
  }

  frameCount(): number {
    return this.#frames.length;
  }

  frameAt(index: number): FightFrame {
    return at(this.#frames, index);
  }
}

/**
 * Fetch and adapt one recorded fight.
 *
 * `loadTrace`'s hard schema refusal is kept on purpose: `TRACE_SCHEMA` is a
 * two-file contract with `crates/lab/src/trace.rs`, and the error it produces --
 * the one naming the exact `lab trace` command to re-run -- is the most useful
 * message on the page when a fixture goes stale.
 *
 * The signal is not optional. This call is the single longest-lived thing the
 * arena starts, and a caller that had to remember to pass one would eventually
 * be a caller that forgot.
 */
export async function loadTraceSource(url: string, signal: AbortSignal): Promise<TraceFightSource> {
  return new TraceFightSource(await loadTrace(url, signal));
}
