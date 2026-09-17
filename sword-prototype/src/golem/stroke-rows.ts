/**
 * The rows of `GOLEM_TACTICS` that a sword's stroke reads *live*, and who actually sees a change.
 *
 * `STROKE_SHAPES.sword` is the frozen object `CUT` in `tactics.ts`, and its fields are getters onto
 * `GOLEM_TACTICS` rather than copies. That is what makes these eight rows special in two opposite
 * directions at once:
 *
 * - **`scripts/tune.mjs` cannot move them.** Its `INERT_ROWS` names them plus `guardReach`, because
 *   a fitted champion's override lands on the fencer's own copy of the table while the stroke keeps
 *   reading the module global. Spending genome on them would be spending it on nothing. The tuner
 *   is right to refuse, and the side effect is that these are the only numeric rows in the fencer's
 *   reach no automatic process re-reads -- `docs/design.md` under "the nine constants nothing
 *   re-reads" for what that has cost.
 * - **Anything else can move them, from anywhere, at any time.** Which is what makes the live read
 *   useful: setting a row on `GOLEM_TACTICS` after boot changes every sword stroke that has not
 *   already been snapshotted, with no rebuild. `scripts/stroke-sweep.mjs` is built on exactly that,
 *   and so is `?tactic=` in `src/main.ts`.
 *
 * **`guardReach` is deliberately not here.** It is in the tuner's `INERT_ROWS` for a second and
 * unrelated reason -- `guardByTheirs` is on, so nothing reads it -- and it is not a field of `CUT`.
 * Putting it in this list would promise a live read that does not exist.
 *
 * **And the snapshot caveat, which is the trap this file exists to name.** A getter only stays live
 * while nobody spreads it. `COMMITTED_SHAPES` in `tactics-v3.ts` is built as
 * `Object.freeze({ ...STROKE_SHAPES[kind], ...over })` at module load, and spreading a getter
 * materialises its value there and then. So a v3 mind on a committed arc runs the numbers that were
 * in the table when its module was imported, and a later override moves nothing it does. v2 minds
 * -- `golem-fencer`, which is the matchup the measurement record is written on -- read
 * `STROKE_SHAPES[me.weapon]` at stroke time and do see it. Anything offering an override has to say
 * which of the two the viewer is watching, because a dial that silently does nothing is worse than
 * no dial.
 */
export const LIVE_STROKE_ROWS = Object.freeze([
  "chamberSwing", "chamberLift", "chamberReach", "followSwing", "followLift",
  "strokeSeconds", "chamberSeconds", "cutRoll",
] as const);

export type LiveStrokeRow = (typeof LIVE_STROKE_ROWS)[number];

/** Whether a string names a row the sword's stroke reads live. Narrows, so callers need no cast. */
export const isLiveStrokeRow = (name: string): name is LiveStrokeRow =>
  (LIVE_STROKE_ROWS as readonly string[]).includes(name);

/**
 * One `name:value` pair from a `?tactic=` list, parsed and judged.
 *
 * A refusal carries the reason rather than a boolean, because every one of them has to reach the
 * boot note verbatim: a link that half-applies is a page running physics it does not admit to, and
 * this project has already paid for that lesson once with the matchup codec.
 */
export type StrokeOverride =
  | { ok: true; row: LiveStrokeRow; value: number }
  | { ok: false; why: string };

/**
 * Parse `chamberReach:-0.15,cutRoll:0` into overrides, refusing anything it cannot vouch for.
 *
 * Separate from `main.ts` and pure, so the refusals can be tested without booting a page. The
 * bounds are deliberately wide -- these are radians and seconds with no shared scale, and the
 * sweeps that motivate the dial run well outside any range a caller would guess -- so the only
 * value judgement made here is that a duration cannot be zero or negative. A stroke of zero
 * seconds is not a fast stroke, it is a division nobody meant to write.
 */
export const parseStrokeOverrides = (raw: string): StrokeOverride[] =>
  raw.split(",").filter((part) => part.trim() !== "").map((part): StrokeOverride => {
    const at = part.indexOf(":");
    if (at === -1) return { ok: false, why: `"${part}" is not name:value` };
    const row = part.slice(0, at).trim();
    const value = Number(part.slice(at + 1).trim());
    if (!isLiveStrokeRow(row)) {
      return { ok: false, why: `"${row}" is not one of ${LIVE_STROKE_ROWS.join(", ")}` };
    }
    if (!Number.isFinite(value)) return { ok: false, why: `"${row}" was given a non-number` };
    if ((row === "strokeSeconds" || row === "chamberSeconds") && value <= 0) {
      return { ok: false, why: `"${row}" is a duration and ${value} is not one` };
    }
    return { ok: true, row, value };
  });

/**
 * Set one live row on `GOLEM_TACTICS`, which the type says is `as const` and the runtime does not.
 *
 * **The cast lives here so that there is exactly one of it.** `GOLEM_TACTICS` is declared `as const`
 * because every reader of it should treat it as fixed -- it is the shipped table, and a mind that
 * writes to it is a bug. Two callers legitimately do write: `scripts/stroke-sweep.mjs`, which is
 * untyped and mutates a child process's own copy before importing anything that reads it, and
 * `?tactic=` in `src/main.ts`. Rather than let each of them reach through the type in its own way,
 * both go through this, where the reason is written down next to the cast.
 *
 * This is a boot-time and bench-time affordance. Calling it mid-bout would change the shape a
 * stroke is halfway through running, which nothing is written to survive.
 */
export const setLiveStrokeRow = (
  table: Record<LiveStrokeRow, number>, row: LiveStrokeRow, value: number,
): void => {
  (table as { [key in LiveStrokeRow]: number })[row] = value;
};
