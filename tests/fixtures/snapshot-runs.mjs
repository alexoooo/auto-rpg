import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * The three snapshot file shapes, trimmed to everything except the weights.
 *
 * `tests/fixtures/snapshot-runs.json` beside this file was cut from three files a real run wrote:
 * a `train-ppo` checkpoint, a league pool member and a whole league state, all named in the
 * fixture's own `from` fields. Everything in it is verbatim off disk except that the float vectors
 * are rounded to five places and the weight arrays are gone, replaced by their lengths.
 *
 * **The weights are gone because a snapshot is 800 KB of them.** Eighty-seven thousand numbers is
 * what the surface costs -- `POLICY_LAYOUT` is 71 -> 256 -> 256 -> 12 -- and committing three of
 * those to make a reader assert on a key name would put two and a half megabytes of a gitignored
 * directory into git for no assertion that the numbers themselves buy. What a reader test needs
 * from a weight vector is its **length** and that every entry is finite, and `fill` below supplies
 * both from a seed. What it needs from the rest of the file is the exact key names, the exact
 * spellings (`normalisation` against `norm`), the column count and the real provenance scalars,
 * and those are the parts that came off disk unchanged.
 *
 * So this is a hand-maintained mirror of what two scripts write, with the same standing hazard
 * `tests/fixtures/intent.mjs` names about its own list: a script that changes its key names leaves
 * this green and the arena red. The guard against that is that `tournaments/` is gitignored and
 * therefore no test may read it, so re-cutting these fixtures is what a person does after changing
 * `roleToJson` in `scripts/league.mjs` or the checkpoint writer in `scripts/train-ppo.mjs`.
 */
export const SNAPSHOT_RUNS = JSON.parse(
  readFileSync(fileURLToPath(new URL("./snapshot-runs.json", import.meta.url)), "utf8"),
);

/**
 * A weight vector of the length a real one had, deterministic and small.
 *
 * A hash-step generator rather than `Math.random` because a fixture that differed between runs
 * would make any failure in a forward pass unreproducible, and small values rather than a constant
 * because a table of one repeated number gives every output unit the same activation and would
 * hide a transposed layer in a reader that had one.
 */
export function fill(count, seed) {
  const values = new Array(count);
  let state = (seed >>> 0) || 1;
  for (let i = 0; i < count; i += 1) {
    state = (Math.imul(state ^ (state >>> 15), 0x2545f491) + 0x9e3779b9) >>> 0;
    values[i] = Math.round((state / 0x100000000 - 0.5) * 2e4) / 1e5;
  }
  return values;
}

/** A `train-ppo` checkpoint, as a page would receive one from `/runs/`. */
export function checkpointJson(over = {}) {
  const { header, weightCount, valueWeightCount } = SNAPSHOT_RUNS.checkpoint;
  return {
    iteration: header.iteration,
    seed: header.seed,
    date: header.date,
    bouts: header.bouts,
    steps: header.steps,
    weights: fill(weightCount, 0x5eed01),
    valueWeights: fill(valueWeightCount, 0x5eed02),
    logSigma: header.logSigma,
    normalisation: header.normalisation,
    ...over,
  };
}

/** One member of a league pool, as `roleToJson` in `scripts/league.mjs` writes it. */
export function poolMemberJson(over = {}) {
  const { header, weightCount, valueWeightCount } = SNAPSHOT_RUNS.pool;
  return {
    weights: fill(weightCount, 0x5eed03),
    valueWeights: fill(valueWeightCount, 0x5eed04),
    logSigma: header.logSigma,
    norm: header.norm,
    seed: header.seed,
    history: header.history,
    bornAt: header.bornAt,
    ...over,
  };
}

/** A whole league state; only its `main` role is ever read. */
export function leagueJson(over = {}) {
  const { header, weightCount } = SNAPSHOT_RUNS.league;
  return {
    version: header.version,
    policy: header.policy,
    features: header.features,
    seed: header.seed,
    date: header.date,
    iteration: header.iteration,
    bouts: header.bouts,
    steps: header.steps,
    main: {
      weights: fill(weightCount, 0x5eed05),
      valueWeights: fill(SNAPSHOT_RUNS.checkpoint.valueWeightCount, 0x5eed06),
      logSigma: header.main.logSigma,
      norm: header.main.norm,
      seed: header.main.seed,
      history: header.main.history,
      bornAt: header.main.bornAt,
    },
    exploiters: [],
    pool: header.pool,
    taken: header.taken,
    ...over,
  };
}
