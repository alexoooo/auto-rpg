// A mind small enough to evolve: one affine map from the pilot's columns to the command surface.
// Shared by `evolve-policy.mjs` and `clone-duel.mjs`, so a genome is rated by the same code that
// trained it rather than by a second implementation that merely agrees today.
//
// ## Why a linear map is the right first shape here, and not an act of minimalism
//
// CR measured `golem-driver`'s whole output over 145,124 asks and found **five effective degrees
// of freedom**: five of the nine axes are literally constant, a sixth moves by 0.013, and what
// varies is `strafe` continuously, `lean` over three values, `advance` over three, and three rare
// bits. A constant axis is a bias term. A three-valued axis is a threshold or two. That is a
// function a linear map can very nearly hold, and the shipped actor spends 87,308 weights on it.
//
// **The reason the size matters is that gradient-free search scales badly with parameter count**,
// which is the honest caveat the plan states against CT. `(1+lambda)` on 87,308 weights is not a
// search, it is a random walk. On `(71 + 1) * 12 = 864` it is a search, and on a selected column
// set it is a small one.
//
// The decode is `commandFromAction`'s, exactly: an axis is its range's midpoint plus its half-width
// times a value clipped to -1..+1, and a gate is its output thresholded **at zero**, which is where
// `meanAction` puts it. A compact mind that decoded differently would be a different mind wearing
// the same numbers.

import { COMMAND_AXES, COMMAND_GATES, COMMAND_RANGES, freshCommand } from "../src/golem/tactics-v4.ts";
import {
  pilotFeatureCount, pilotFeatureNames, pilotFeatures, pilotTrace,
} from "../src/golem/pilot.ts";

export const COMPACT_KIND = "compact";

/** The nine centres and half-widths, in head order, so the decode is a multiply and an add. */
const CENTRE = Float64Array.from(COMMAND_AXES, (name) => {
  const [low, high] = COMMAND_RANGES[name];
  return (low + high) / 2;
});
const HALF = Float64Array.from(COMMAND_AXES, (name) => {
  const [low, high] = COMMAND_RANGES[name];
  return (high - low) / 2;
});
export const COMPACT_OUTPUTS = COMMAND_AXES.length + COMMAND_GATES.length;

/**
 * The column sets a genome may be built over.
 *
 * `all` is every column the pilot publishes -- 71, so 864 numbers. `core` is the nineteen a reading
 * of `driver.ts` says its five rules actually consult -- the gap and its rate, who is longer,
 * whether their point is committing, the cooldowns, the circle side -- and comes to 240. It is a
 * **hypothesis about which columns matter**, written down so that a run over it is a test of that
 * hypothesis rather than a silent narrowing.
 */
export const CORE_COLUMNS = Object.freeze([
  // Where the bodies are, which is what every range rule in `driver.ts` reads.
  "gap", "gapRate", "near", "hold", "myReach", "theirReach", "longer", "inside", "headfirst",
  // What they are doing, which is what rules one and two answer.
  "theirTipSpeed", "theirs:commit", "theirs:recover", "sinceTheirCommit",
  // What I can do, which is what gates a stroke at all.
  "mine:free", "cooldown", "armed",
  // The two clocks the hidden state runs on. `circleSide` is the sign of the strafe the hidden
  // `circling` flag gates; `sinceMyStroke` and `clock` are the closest the columns come to the
  // patience timer, which is why they are here and why they will not be enough.
  "circleSide", "sinceMyStroke", "clock",
]);

/** The indices a named column set picks out, refusing a name the pilot does not publish. */
export function columnsOf(which, features) {
  const published = pilotFeatureNames(features);
  const width = published.length;
  if (which === "all") return Array.from({ length: width }, (_, i) => i);
  const names = which === "core" ? CORE_COLUMNS : which.split(",").map((n) => n.trim());
  return names.map((name) => {
    const at = published.indexOf(name);
    // Refused rather than dropped: a genome quietly built over fifteen columns because one was
    // misspelled would train, rate and ship, and the missing column would never be looked for.
    if (at === -1) throw new Error(`"${name}" is not a pilot column`);
    if (at >= width) throw new Error(`"${name}" is column ${at}, past this feature version's ${width}`);
    return at;
  });
}

/** How many numbers a genome over `n` columns holds: a weight a column an output, plus a bias. */
export const compactSize = (n) => (n + 1) * COMPACT_OUTPUTS;

/**
 * The genome's arithmetic, over an already-filled feature row.
 *
 * Split from `compactPilot` so that the part with an index in it can be read against a genome
 * written by hand. The weight layout is **column-major over outputs** -- output `j` of column `k`
 * lives at `k * 12 + j` and the bias row is last -- and a transposed read of that would still
 * train, still rate, and be a different mind; there is no way to see it from a score.
 */
export function compactDecoder(genome, { columns, norm }) {
  const command = freshCommand();
  const n = columns.length;
  const weights = genome instanceof Float64Array ? genome : Float64Array.from(genome);

  return (raw) => {
    for (let j = 0; j < COMPACT_OUTPUTS; j += 1) {
      let sum = weights[n * COMPACT_OUTPUTS + j];
      for (let k = 0; k < n; k += 1) {
        const sd = norm.sd[k];
        // A column the dataset never saw move is dropped rather than divided by nothing: its
        // weight then does not matter, and the bias carries whatever that output should be.
        const x = sd < 1e-9 ? 0 : (raw[columns[k]] - norm.mean[k]) / sd;
        sum += weights[k * COMPACT_OUTPUTS + j] * (x < -5 ? -5 : x > 5 ? 5 : x);
      }
      if (j < COMMAND_AXES.length) {
        const a = sum < -1 ? -1 : sum > 1 ? 1 : sum;
        command[COMMAND_AXES[j]] = CENTRE[j] + HALF[j] * a;
      } else {
        // Threshold at zero, where `meanAction` puts it -- not at a half, which is where the
        // already-decoded action is read.
        command[COMMAND_GATES[j - COMMAND_AXES.length]] = sum > 0 ? 1 : 0;
      }
    }
    return command;
  };
}

/**
 * A pilot over a compact genome.
 *
 * `norm` is the mean and standard deviation of each selected column, carried with the genome
 * because a weight is only meaningful against the scaling it was fitted under -- a genome that
 * travelled without it would be a different mind on the next dataset.
 */
export function compactPilot(genome, { columns, norm, features }) {
  const raw = new Float64Array(pilotFeatureCount(features));
  const trace = features >= 2 ? pilotTrace() : null;
  const decode = compactDecoder(genome, { columns, norm });
  return (reading, view) => {
    pilotFeatures(reading, view, raw, trace);
    return decode(raw);
  };
}

/** A genome as it is written to disk, with everything needed to rebuild the mind that ran it. */
export function compactTable(genome, { columns, norm, features, note = "" }) {
  return {
    kind: COMPACT_KIND, features, columns: [...columns],
    names: columns.map((at) => pilotFeatureNames(features)[at]),
    norm: { mean: [...norm.mean], sd: [...norm.sd] },
    weights: Array.from(genome), note,
  };
}

/** The mind a written genome describes, refusing anything that is not one. */
export function compactFromTable(table) {
  if (table.kind !== COMPACT_KIND) {
    throw new Error(`that table is "${table.kind ?? "a policy"}", not a compact genome`);
  }
  const want = compactSize(table.columns.length);
  if (table.weights.length !== want) {
    throw new Error(`a genome over ${table.columns.length} columns wants ${want} numbers;`
      + ` this one holds ${table.weights.length}`);
  }
  return compactPilot(Float64Array.from(table.weights), {
    columns: table.columns, norm: table.norm, features: table.features,
  });
}
