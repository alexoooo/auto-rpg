import { type LiveStrokeRow, parseStrokeOverrides } from "./stroke-rows.ts";

/**
 * What a `?tactic=` link asks for: what to write, and what the boot note has to say about it.
 *
 * **This is separate from `main.ts` because nothing in `main.ts` can be tested.** The logic lived
 * inside `boot()`, which means the only way to find out whether a link applied, refused, or quietly
 * did nothing was to run a dev server and read a line of text off a page. A dial whose refusals are
 * only observable by eye is a dial that will eventually refuse silently, and the whole point of the
 * note is that a page running physics which is not the tree's physics must say so.
 *
 * The caller does the writing. This decides and explains; `main.ts` applies. That split is what
 * lets every branch below be asserted without a browser, a build or a scene.
 */
export interface StrokeLink {
  /** The rows to write, in the order the link named them. Empty whenever `note` is a refusal. */
  readonly apply: readonly { readonly row: LiveStrokeRow; readonly value: number }[];
  /** What the boot note should say, or the empty string when there was no link at all. */
  readonly note: string;
}

const NONE: readonly { row: LiveStrokeRow; value: number }[] = [];

/** `chamberReach 0.15, cutRoll 0`, for a note a person reads rather than a machine parses. */
const list = (rows: readonly { row: LiveStrokeRow; value: number }[]): string =>
  rows.map(({ row, value }) => `${row} ${value}`).join(", ");

/**
 * Read a `?tactic=` value against the table as it currently stands.
 *
 * `shipped` is asked for each row's current value rather than the module global being read here,
 * so a test can pose a table without touching the one the tree ships, and so the no-op branch
 * compares against what the page would actually have run.
 *
 * **One bad pair refuses the whole link.** A page running three of the four numbers somebody asked
 * for is a page that will be used to report a result nobody can reproduce, and a refusal that names
 * every reason is cheaper to act on than one that stops at the first.
 */
export const strokeLink = (
  raw: string | null, shipped: (row: LiveStrokeRow) => number,
): StrokeLink => {
  if (raw === null) return { apply: NONE, note: "" };

  const parsed = parseStrokeOverrides(raw);
  if (parsed.length === 0) {
    return { apply: NONE, note: "The tactic link was refused -- it named nothing." };
  }

  const refused = parsed.filter((p): p is { ok: false; why: string } => !p.ok);
  if (refused.length > 0) {
    return {
      apply: NONE,
      note: `The tactic link was refused and NOTHING was applied: ${
        refused.map((r) => r.why).join("; ")}. Running the shipped stroke.`,
    };
  }

  const asked = parsed.flatMap((p) => (p.ok ? [{ row: p.row, value: p.value }] : []));
  const changed = asked.filter(({ row, value }) => shipped(row) !== value);
  if (changed.length === 0) {
    return {
      apply: NONE,
      note: `The tactic link asked for the shipped stroke: ${list(asked)}.`
        + " Nothing was overridden.",
    };
  }
  return {
    apply: asked,
    note: `STROKE OVERRIDDEN: ${list(changed)}. This is not the stroke the tree ships.`
      + " It moves v2 minds (golem-fencer) only -- a v3 mind on a committed arc froze its shape"
      + " at load and will ignore this.",
  };
};
