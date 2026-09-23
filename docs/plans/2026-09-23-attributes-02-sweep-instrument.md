# Attributes 02 -- the sweep instrument

One command that answers, for any stat, "what does this multiplier do to a fight". Every stat
session after this one runs it, so it is built and proven once, here, against the null control.

## What lands

1. **`research/stat-sweep.mjs`**, a CLI.

   ```
   node research/stat-sweep.mjs --stat movement --levels 0.75,0.9,1,1.1,1.25,1.5 \
     --pairs 192 --workers 24 --dir research/runs/stat-movement
   ```

   - **Jobs.** A level, a seed pair and a mind pair.
     - The default mind pairs are the overkill probe's set: `golem-champion`, `golem-miser`,
       `golem-brawler` and `golem-duelist`, each against each.
     - Both sides are on `defaultGolemSetup()`. `--build <named>` takes the build from
       `NAMED_BUILDS`.
     - The **modified** side carries `attributes: { [stat]: level }` and the other side carries
       none.
     - Each block runs twice, with the modified side on the left and then on the right and the
       same seeds, so side bias cancels within the block.
     - Every job passes `locomotionMode: "supported"` and a fresh Havok, and uses the research
       `PROTOCOL` cap.
   - **Execution.** Through `runJobs` in `research/runner.mjs`: worker lanes, one bout at a time
     per worker, resumable from `results.jsonl`. Never `Promise.all` over bouts, because one realm
     runs one Havok arena at a time.
   - **Row.** `research/worker.mjs` row gains `vitality: [left, right]`, read from the live bout at
     its end, as `research/lab/environment.mjs` already reads it. It also gains the knockdown
     count and time spent down per side, if session 06 or 07 needs them; otherwise leave that for
     then. Adding a field to the row changes nothing for existing league runs; confirm that
     `research/report.mjs` ignores unknown fields.
2. **The report**, per level:
   - the modified side's **win rate**, with draws as 1/2, and a 95 % bootstrap interval
     (`bootstrap` in `research/search.mjs`);
   - the **paired bar margin**: the modified side's final vitality minus the other's, averaged
     over a block's two bouts so side cancels. Report its mean, its interval, and **Cohen's d**
     computed as the mean over the standard deviation of the block margins. This is new code, and
     it is the criterion the memory `paired-effect-size-criterion` names;
   - bout length, damage dealt and taken per bout, and endings;
   - the same figures split by mind pair, because minds are non-transitive and a pooled number
     can hide a stat that helps one style and hurts another.

   The output is a markdown table and a JSON file. The markdown names its harness in the header:
   "Node harness, research runner, supported locomotion".

## Proving the instrument

- **Null control.** Before any stat is live, run level 1 only, at n = 384. Win rate within its
  interval of 50 %, d within noise of 0. Record the spread: it is the noise floor every later
  table is read against.
- **A known effect.** Before any stat is live the instrument cannot move a stat. Instead, run one
  job pair where the "modified" side is a named build with a large known edge, for example
  `wheel` against the default. The report must show that edge, which proves the columns are wired
  to the right side. A detector nobody has seen find something proves nothing (memory
  `a-test-that-passes-on-empty-needs-a-control`).
- **Side accounting.** Swap which side is marked modified in one block by hand. The win rate must
  mirror.

## Tests

`tests/stat-sweep.test.mjs`, on fabricated rows with no bouts:
- the block pairing;
- the side-cancelled margin;
- Cohen's d against a hand-computed value;
- the win-rate arithmetic with draws;
- refusal of a stat id that is not in `ATTRIBUTE_IDS`.

Mutation-check the side accounting: flip the sign of the right-side margin, and a test must go red.

## Gate

`npm test`, `npm run check`, `npm run build`, and the line-ending check. The null and known-edge
tables go into `docs/analysis/2026-09-23-attribute-measurements.md`, created by this session.

## Done when

The null row reads about 50 % with d close to 0, the known edge reads as an edge, and the command
is ready for session 03.
