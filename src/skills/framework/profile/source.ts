/**
 * **Where a reading comes from.** Everything an Option Mind reads to price a fight says it in this
 * one shape (`Source`), so a listing can say of each body what is its own, what is borrowed and
 * from how far off, what a person wrote in by hand, and what is not priced at all.
 */
import { deepFreeze } from "../../../core/state.ts";
import { asWritten } from "./numbers.ts";

/** One number in which the rows a reading takes differ from the body it is asked about. */
export interface Gap {
  /** Which number, with its unit: `stature, m`, `mass, kg`, or what a segment holds (`mass held at hand.right, kg`). */
  readonly number: string;
  /** Its value on the rows that were read. */
  readonly measured: number;
  /** Its value on the body asked about. */
  readonly asked: number;
  /** How far apart the two are, counted in the spans rows are compared over (`STRUCK_SPANS`, `HELD_SPANS`). */
  readonly spans: number;
}

/**
 * What found a reading's rows for a body: the body's numbers (the rows nearest it), the name of
 * its model, or a rule in the code that picks rows whatever the body is (a foe with no strike
 * measured is read throwing the strikes of the body that faces it).
 */
export type FoundBy = "numbers" | "name" | "rule";

/**
 * **One of the two bodies of a reading, and whose rows were read for it.** A reading has the body
 * whose skill it is, and often a target the skill is done to. For each, the rows are either that
 * body's own or borrowed from another.
 */
export interface Side {
  /** Whether the rows are this body's own: measured on it, as it is and holding what it holds. */
  readonly own: boolean;
  /** The body the rows were measured on: its model's name, or its numbers where the rows record no name. */
  readonly of: string;
  /** What found those rows for this body. */
  readonly by: FoundBy;
  /** Each number in which the rows differ from this body. None where the rows are its own. */
  readonly gaps: readonly Gap[];
}

/** One setting that differs between how a reading's rows were measured and how they are read now. */
export interface Change {
  /** What differs, with its unit: `the world's rate, Hz`. */
  readonly what: string;
  /** How it was when the rows were measured. */
  readonly measured: number | string | null;
  /** How it is now. */
  readonly asked: number | string | null;
}

/**
 * **Where a reading comes from.**
 *
 * - `measured`: rows that were played and recorded. It says whose rows they are for the body
 *   whose skill it is (`body`) and for the body the skill is done to (`target`, null for a skill
 *   with none), whether the rows are a table that had to be measured for these two bodies
 *   together (`pairing`), and what has changed since they were measured (`stale`). A stale
 *   reading is still read: stale is a degree, not a fault.
 * - `hand`: nothing measured reads here, so numbers a person wrote stand in. `entries` names them
 *   in the registry of numbers set by hand (`handSet`), and `why` says why nothing measured reads.
 * - `none`: nothing reads here and nothing stands in. The Mind does not price it, and `why` says why.
 * - `given`: nothing needs measuring. The answer is so by what is asked: a hold lasts as long as
 *   it is held, and a walk throws no blow. `why` says what makes it so.
 */
export type Source =
  | { readonly kind: "measured"; readonly body: Side; readonly target: Side | null; readonly pairing: boolean; readonly stale: readonly Change[] }
  | { readonly kind: "hand"; readonly entries: readonly string[]; readonly why: string }
  | { readonly kind: "none"; readonly why: string }
  | { readonly kind: "given"; readonly why: string };

/** One thing a Mind reads, and where that reading comes from: a row of a listing. */
export interface Read {
  /** What is read, in words: a strike's name, `the foe's fighting, in bouts`. */
  readonly what: string;
  readonly source: Source;
}

/** The gap in `number` between `measured` and `asked`, counted in `span`s; null where the two are the same. */
export const gapIn = (number: string, measured: number, asked: number, span: number): Gap | null =>
  measured === asked ? null : { number, measured, asked, spans: Math.abs(measured - asked) / span };

/** A measured source (`Source`) of these sides: no table of a pairing and nothing changed since, unless said. */
export const measuredFrom = (parts: { readonly body: Side; readonly target: Side | null; readonly pairing?: boolean; readonly stale?: readonly Change[] }): Source =>
  deepFreeze({ kind: "measured", body: parts.body, target: parts.target, pairing: parts.pairing ?? false, stale: parts.stale ?? [] });

/** `source` with `stale` added to what has changed since it was measured. A source that is not measured has nothing to go stale, and is given back as it is. */
export const staler = (source: Source, stale: readonly Change[]): Source =>
  source.kind !== "measured" || stale.length === 0 ? source : deepFreeze({ ...source, stale: [...source.stale, ...stale] });

/** `source` with its body's rows said to be found by `by`. A source that is not measured has no rows, and is given back as it is. */
export const foundBy = (source: Source, by: FoundBy): Source =>
  source.kind !== "measured" ? source : deepFreeze({ ...source, body: { ...source.body, by } });

/** A source by hand (`Source`): the registry `entries` that stand in, and `why` nothing measured reads. */
export const byHand = (entries: readonly string[], why: string): Source => deepFreeze({ kind: "hand", entries, why });

/** No source (`Source`): nothing reads here, and `why`. */
export const notPriced = (why: string): Source => deepFreeze({ kind: "none", why });

/** A given (`Source`): nothing needs measuring here, and `why`. */
export const given = (why: string): Source => deepFreeze({ kind: "given", why });

/**
 * **How good a source is**, best first. `given` needs no measuring. `own` is measured on the
 * very bodies asked about. `borrowed` is measured, with another body's rows on either side, or
 * this body's rows holding something else. `hand` is a number or a rule a person wrote. `none`
 * is not priced. How stale a measured source is does not change its standing.
 */
export const STANDINGS = ["given", "own", "borrowed", "hand", "none"] as const;
export type Standing = typeof STANDINGS[number];
/** Each standing in words, for a listing. */
export const STANDING_WORDS: Readonly<Record<Standing, string>> = Object.freeze({ given: "given", own: "its own", borrowed: "borrowed", hand: "by hand", none: "not priced" });

/** The standing of `source` (`STANDINGS`). A measured source is the body's own only where the rows of both its sides are. */
export const standingOf = (source: Source): Standing =>
  source.kind !== "measured" ? source.kind : source.body.own && (source.target?.own ?? true) ? "own" : "borrowed";

/** The weakest source among `reads` by standing (`STANDINGS`): the first of them where several are as weak, null of none. */
export function weakest(reads: readonly Read[]): Source | null {
  let worst: Source | null = null, rank = -1;
  for (const { source } of reads) {
    const at = STANDINGS.indexOf(standingOf(source));
    if (at > rank) { worst = source; rank = at; }
  }
  return worst;
}

/** A number as a readout words it: at the places a trial's numbers are written at (`asWritten`), so a stature computed from a build does not print sixteen digits. */
const worded = (value: number | string | null): string => typeof value === "number" ? String(asWritten(value)) : String(value);

/** One side in words: `its own rows, by name`, or `rows of man, by numbers, stature, m 1.8 read at 1.6`. */
function sideWords(side: Side): string {
  const gaps = side.gaps.map((gap) => `${gap.number} ${worded(gap.measured)} read at ${worded(gap.asked)}`);
  return [`${side.own ? "its own rows" : `rows of ${side.of}`}, by ${side.by}`, ...gaps].join(", ");
}

/** **`source` in words**, for a readout: where it came from, how far off, and how stale. */
export function sourceWords(source: Source): string {
  if (source.kind === "hand") return `by hand${source.entries.length ? ` (${source.entries.join(", ")})` : ""}, ${source.why}`;
  if (source.kind === "none") return `not priced, ${source.why}`;
  if (source.kind === "given") return `given, ${source.why}`;
  const stale = source.stale.map((change) => `${change.what} ${worded(change.measured)} read at ${worded(change.asked)}`);
  return [`measured${source.pairing ? " for the pairing" : ""}`, `its body ${sideWords(source.body)}`, ...source.target ? [`its target ${sideWords(source.target)}`] : [],
    ...stale.length ? [`stale: ${stale.join(", ")}`] : []].join("; ");
}
