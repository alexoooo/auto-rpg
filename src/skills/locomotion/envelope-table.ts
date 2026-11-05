import { heldBy } from "../../core/bodies/items/held.ts";
import type { SourceKey } from "../../core/bodies/sources.ts";
import { bodyKey, type BodySpec } from "../../core/bodies/spec/body.ts";
import { derive, sourced, type Quantity } from "../../core/bodies/spec/quantity.ts";
import type { StanceEnvelope } from "../../control/stance-envelope.ts";

/**
 * **The rule**: the fastest speed of a battery at which every one of its `trials` held, whatever a
 * slower speed did; 0 if none. `held` is how many held at each speed, null where the battery did
 * not play them all (it gave up on the speed at a trial that did not hold).
 */
function fastestEvery(speeds: readonly number[], trials: number, held: readonly (number | null)[]): number {
  let fastest = 0;
  for (let i = 0; i < speeds.length; i++) if (held[i] === trials) fastest = speeds[i]!;
  return fastest;
}

/** A body's readings in an envelope's asset: its one fastest walk where it measured no way by itself, or each way's trials (`wayHeld`, in the order of `ways`), and its turns. */
interface EnvelopeEntry {
  readonly walk?: number;
  /** How many walks each way walked at each speed, and how many of them held at each, null where not all were played. */
  readonly wayTrials?: number;
  readonly wayHeld?: readonly (readonly (number | null)[])[];
  readonly turns: readonly number[];
}

/**
 * An envelope's asset, as `research/skills/locomotion/stance/core-stance-envelope.mjs` writes it: its speeds and ways (degrees
 * to the right of forward), and each model's readings over every thing its right hand held, the
 * least of them, with each one's own where it measured them (`holds`).
 */
interface EnvelopeTable {
  readonly speeds: readonly number[];
  readonly ways: readonly number[];
  readonly models: Readonly<Record<string, EnvelopeEntry & { readonly holds?: Readonly<Record<string, EnvelopeEntry>> }>>;
}

/** The ways `StanceEnvelope.ways` names, by their degrees to the right of forward. */
const CARDINAL = { forward: 0, right: 90, back: 180, left: 270 } as const;

/**
 * The envelope of `spec`'s body (`bodyKey`) in `table`, the asset `source` names, with what its right
 * hand holds (`heldBy`) where the asset measured that apart, and over everything it measured held
 * where not: `what` walks, for an error.
 */
export function envelopeIn(table: EnvelopeTable, source: SourceKey, spec: BodySpec, what: string): StanceEnvelope {
  const key = bodyKey(spec), model = table.models[key];
  if (!model) throw new Error(`${what}'s envelope was not measured on ${key}`);
  const held = heldBy(spec, "right"), own = held === null ? undefined : model.holds?.[held];
  const entry = own ?? model, at = own ? `/models/${key}/holds/${held}` : `/models/${key}`;
  const { wayTrials, wayHeld } = entry, turnsRead = entry.turns.map((turn, i) => sourced(turn, "rad/s", source, `${at}/turns/${i}`));
  const speeds = table.speeds.map((speed, i) => sourced(speed, "m/s", source, `/speeds/${i}`));
  const trials = wayTrials === undefined ? null : sourced(wayTrials, "1", source, `${at}/wayTrials`);
  const heldWay = (degrees: number): readonly Quantity<number>[] => {
    const i = table.ways.indexOf(degrees);
    if (i < 0 || !wayHeld) throw new Error(`${what}'s envelope kept no walks ${degrees} degrees round`);
    return wayHeld[i]!.map((held, j) => held === null ? derive("1", "a speed the battery did not play through held none", [], () => 0)
      : sourced(held, "1", source, `${at}/wayHeld/${i}/${j}`));
  };
  const way = (degrees: number): Quantity<number> => {
    if (trials === null || !wayHeld) {
      if (entry.walk === undefined) throw new Error(`${what}'s envelope has neither each way's walks nor one fastest walk`);
      return sourced(entry.walk, "m/s", source, `${at}/walk`);
    }
    const held = heldWay(degrees);
    return derive("m/s", "the fastest speed at which every walk that way held (fastestEvery)", [trials, ...speeds, ...held],
      (n, ...values) => fastestEvery(values.slice(0, speeds.length), n, values.slice(speeds.length)));
  };
  return {
    ways: { forward: way(CARDINAL.forward), right: way(CARDINAL.right), back: way(CARDINAL.back), left: way(CARDINAL.left) },
    tried: trials === null || !wayHeld ? null : {
      speeds, trials,
      held: { forward: heldWay(CARDINAL.forward), right: heldWay(CARDINAL.right), back: heldWay(CARDINAL.back), left: heldWay(CARDINAL.left) },
    },
    turns: turnsRead.map((_, i) => ({
      speed: sourced(table.speeds[i]!, "m/s", source, `/speeds/${i}`),
      turn: derive("rad/s", "the least turn held at this speed or any slower one (fastestHeld)", turnsRead.slice(0, i + 1), (...held) => Math.min(...held)),
    })),
  };
}
