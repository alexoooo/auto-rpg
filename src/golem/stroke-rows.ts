import type { StrokeShape } from "./tactics.ts";

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

/**
 * The `StrokeShape` fields one live row drives, for a **per-side** override that cannot write the
 * table because the other fighter is reading it.
 *
 * **Seven of the eight rows share a name with the field they drive, and `cutRoll` does not.** `CUT`
 * exposes it as two getters, `roll` and `windRoll`, both onto the one table row -- an edge is
 * turned the same amount going back as coming forward. So `{ ...STROKE_SHAPES.sword, cutRoll: 0 }`
 * spreads a key nothing reads, and the stroke that comes out is the shipped stroke with a piece of
 * junk attached.
 *
 * That is not hypothetical. CI ran `cutRoll 0` over 1024 paired bouts and it came back 506-0-518,
 * which is the control's record to the bout, because the override reached nothing. A row that
 * silently measures the null hypothesis is worse than one that throws, and the shape of the failure
 * -- a perfect null on the one row whose name is not a field -- is what named it.
 *
 * Going through here rather than through the row name is what makes that unrepresentable: the
 * mapping is total over `LiveStrokeRow`, so a row added to the list without a field to drive is a
 * compile error rather than an arm that quietly reports 0.500.
 */
export const strokeOverrideFor = (
  row: LiveStrokeRow, value: number,
): Partial<StrokeShape> => (row === "cutRoll"
  ? { roll: value, windRoll: value }
  : { [row]: value });

/**
 * The same eight names again, under the name that matters to anything fitting a **per-mind** table.
 *
 * `LIVE_STROKE_ROWS` says these rows are read live *off the module global*. The corollary, which is
 * the half a fitter needs and which this file only ever stated in prose, is that they are therefore
 * **dead on a per-mind table**: `STROKE_SHAPES.sword` is getters onto `GOLEM_TACTICS`, so a style
 * that sets `strokeSeconds` in its own table has set a key that nothing on any executor reads. No
 * executor reads `T.chamberSwing`, `T.chamberLift`, `T.chamberReach`, `T.followSwing`,
 * `T.followLift`, `T.strokeSeconds`, `T.chamberSeconds` or `T.cutRoll` -- not v1, v2, v3 or v4.
 * v2 reads them off `shape`, and v3 and v4 off `COMMITTED_SHAPES` / `THRUST_SHAPES`, which froze
 * their values at module load.
 *
 * **This used to be guarded and is not any more.** `scripts/tune.mjs` carried an `INERT_ROWS` list
 * naming exactly these eight plus `guardReach`, and refused to spend genome on them; three doc
 * blocks in this directory still cite it (here at the top, and `tactics-v2.ts:316-319`). That
 * script went with the rest of `scripts/` when the prototype became the whole game, and the
 * knowledge went back to being a paragraph -- which is why, on 2026-09-19, a 24-dimension search
 * over `golem-reaper` was launched with four of these eight in it. A third of that space did
 * nothing, and the search would have reported a confident value for each.
 *
 * A dimension a searcher cannot move is worse than a null result about that knob. It is a
 * *fabricated* one: the elite mean lands somewhere, the number gets written down, and it reads
 * exactly like a finding. `cutRoll`'s 506-0-518 above is the same failure one level down.
 *
 * **Four rows are inert for a second, style-local reason and are deliberately not here**, because
 * this list is the universal one and a fitter for another style must still check its own: a
 * `golem-reaper` table's `standOffFraction` and `cutReachMetres` are read by `driver.ts` and by v2
 * and v3 but not by the reaper's own pilot, which replaced the stand-off with its throwing window
 * (see `REAPER_TABLE.openHold`); `commitLean` and `T.strafe` are read by v2 and v3 only. Naming
 * them here would promise a universality they do not have -- the mistake this file's `guardReach`
 * note already warns about in the opposite direction.
 */
export const TABLE_INERT_STROKE_ROWS = LIVE_STROKE_ROWS;

/**
 * Whether a per-mind tactics row is one nothing will read, so a fitter can refuse it up front.
 *
 * Deliberately a separate predicate from `isLiveStrokeRow` rather than an alias, even though they
 * answer with the same set: the two questions are asked by different callers for opposite reasons,
 * and a caller that reads `isLiveStrokeRow(row)` as "safe to put in my genome" has it exactly
 * backwards. The names are the documentation at the call site.
 */
export const isTableInertRow = (name: string): name is LiveStrokeRow => isLiveStrokeRow(name);
