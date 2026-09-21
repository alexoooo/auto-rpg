# AI league and research

The league measures policies across bodies, using the game's real Havok bout runner. Ratings are
offline Glicko-2 measurements, not a difficulty promise for a particular selected body. Arena games
never alter them. `src/policy-ratings.json` is the small shipped artifact; `results/` holds published
evidence. Large resumable logs live in ignored `runs/` directories.

After confirmation, `publish` also saves the compact search history, frozen finalists,
confirmation intervals, any browser review, and recorded compute usage to `results/experiment.json`.

## Commands

From the repository root, with the lockfile's dependencies installed:

```powershell
node research/cli.mjs run --dir research/runs/current --hours 8
node research/cli.mjs summarize --dir research/runs/current
node research/cli.mjs evaluate --dir research/runs/current --hours 8
node research/cli.mjs search --dir research/runs/current --hours 8
node research/cli.mjs confirm --dir research/runs/current --hours 8
node research/cli.mjs publish --dir research/runs/current
node research/cli.mjs preview --dir research/runs/current
node research/cli.mjs promote --dir research/runs/current --hours 8
```

`run` evaluates, searches, and confirms; it publishes any complete baseline rounds. Promotion is
separate because confirmed candidates must first be watched in the browser. `--workers N` overrides
the default of half the logical CPUs, capped at eight. `--rounds 1` allows a smaller provisional
league. `--seed` fixes a different evaluation seed. Run directories are immutable experiments:
resuming uses their saved roster and protocol, not new command-line round/seed choices.

The eight-hour allowance is cumulative across computation commands in a directory. `run` reserves
three hours for evaluation, up to the sixth elapsed hour for search, and the remaining time for
confirmation; earlier finishes carry time forward. A later promotion uses remaining allowance.
Completed jobs are appended immediately. Interrupted jobs remain pending. A failed job is recorded
with its error, never counted as a draw and never silently dropped. Fix the cause and start a new
experiment if a failure prevents a complete round. Do not run two commands against one directory.

## What is measured

Harness: `tests/harness/bout-runner.mjs`, supported locomotion, a fresh wasm instance per bout,
150-second cap, normal startup, no settling or damage-based draw adjustment. The game's verdict
determines 1/0.5/0 points. Overtime remains the game's rule and is reported explicitly.

Twelve baseline minds play all 66 pairs on twelve same-build matchups and six adjacent roster
cross-build pairings. Each cross-build pairing exchanges policy-to-body assignment and arena side.
That is 48 games per policy pair, or 3,168 per round. Four independent seed rounds total 12,672.
Each policy sees each build and arena side equally often. Seeds follow policies when sides swap.

Glicko-2 starts at 1500 / RD 350 / volatility 0.06, with tau 0.5. A full round is one simultaneous
rating period. Publication excludes incomplete rounds, and ratings are provisional below four
rounds or above RD 100. Ratings depend on the opponent population; an added contender causes all
complete periods to be recomputed, including the new matchups. RD is a model-based uncertainty
estimate, not a guarantee against correlated physics outcomes or non-transitive matchups.

`summary.json` includes matchup, build and side breakdowns, wins/draws/losses, overtime counts,
mean duration, and behavior. A single rating cannot express counterstrategies.

- Attack rate counts rising `thrust` command edges per hand and natural channel per simulated
  second. It counts commanded attacks, not successful strokes or hits; paired hands can produce
  two edges. The legacy option-labelled `attackAttempts` counter is not populated by this harness.
- Retreat fraction measures commanded `forward < -0.1` time, not physical displacement.
- Range fractions are the existing recorder's four distance bins, normalized by simulation time.
- Block rate uses the recorder's deduplicated defensive contacts per second.
- Engagement measurements retain the recorder's opportunity, stall, movement and drought fields.

These definitions compare styles without reading their private option names. The physical control
test checks repeated/worker parity and separates an attacking fencer from Idle. It deliberately
does not equate command rate with lethality or use tip-speed peaks as fighting quality.

Runtime source dependencies are hashed after TypeScript removes type-only imports. The lockfile
and measurement worker are included. Presentation-only edits do not stale ratings. Published
candidate parameters are independently versioned; editing one invalidates that policy's rating.
Manifests also record the exact protocol, roster, runtime, dependencies and instrument version.

## First experiment

Form, Guardian and Skirmisher retain their tactical rules. Cross-entropy search changes only six
parameters: `standOffFraction`, `patience`, `strikeBite`, `recoverSeconds`, `closeGain`, `turnGain`.
Bounds are 75–125% of the parent's values, with bite capped at one and zero sentinels retained.
No motor, physics, stroke-shape or shared executor constant changes.

Each generation evaluates sixteen candidates and the unchanged parent against Duelist, Fencer,
Planner and Miser on eight training builds, with both sides. Four elites update the sampling
distribution. Generation zero starts at each parent; one candidate always uses the current mean.
Up to eight generations run round-robin across styles. Incomplete generations are resumable and
produce no winner.

Each generation winner enters a separate selection batch on the same eight training builds.
The other four builds remain untouched until confirmation. The selected finalist per style is
frozen in `finalists.json` before final confirmation. Training, selection and confirmation use
disjoint seed namespaces. Final confirmation uses two seed repetitions, all twelve builds, and
all baseline opponents except the three parent styles; the five opponents not used during
training and four withheld builds receive separate reports.

Promotion requires a paired 95% bootstrap lower bound above zero for improvement over the parent.
Resampling uses side-swapped pairs as blocks, with 4,000 deterministic bootstrap draws. Behavioral
differences between eligible candidates use the same held-out jobs. Keep candidates in descending
improvement order only if each differs from every retained candidate on at least one descriptor
whose paired interval excludes zero. This exploratory diversity gate is not a multiple-testing
corrected scientific claim. Record negative results rather than weakening the gates.

`preview` generates an isolated copy of the arena page in the run directory and prints its local
URL. Start the normal development server to view it. It adds eligible candidates only to that
page's in-memory registry; the normal arena and published registry stay unchanged. Stop the
development server after review.

After watching representative fights, record `browser-review.json` in the run directory:

```json
{
  "fingerprint": "the manifest fingerprint",
  "candidates": [{
    "name": "the immutable candidate ID",
    "candidateHash": "digest(candidate) from research/schedule.mjs",
    "accepted": true,
    "reviewedAt": "ISO timestamp",
    "scenarios": ["default versus fencer, both sides", "a withheld build versus an unseen opponent"],
    "notes": "Observed fighting behavior and any limitations"
  }]
}
```

`promote` accepts only eligible, reviewed parameter artifacts. It extends the original league,
retains its baseline bouts, and evaluates new opponents/build assignments before registering new
picker policies and publishing ratings. Existing policy implementations remain available.

If an integration change invalidates a completed experiment's source fingerprint, keep its
finalists frozen and revalidate rather than silently relabelling old bout results:

```powershell
node research/revalidate.mjs research/runs/original research/runs/revalidated
node research/cli.mjs confirm --dir research/runs/revalidated --hours 8
node research/cli.mjs evaluate --dir research/runs/revalidated --hours 8
```

The target must be new. This transfers candidates and training provenance, not bout results;
confirmation and ratings run again. It also transfers the already-used compute allowance and
locks the source budget against further computation. Use `confirm` and `evaluate`, not `search`
or `run`, in this revalidation directory: the original search identity is intentionally retained.
Review and promote against the new fingerprint. Published experiment evidence identifies the
training origin separately from the final evaluation source.

## Next research agenda

1. Re-establish strength, counters, build weaknesses and side bias under current physics. Inspect
   overtime and engagement before treating passive survival as improved fighting.
2. Optimize a roster of styles. Extend successful parameter search into a quality-diversity
   archive, with measured movement/attack descriptors and independent promotion tests.
3. Recollect exploratory transitions and refit Planner/Tactician models. Their shipped tables
   predate the physics changes and their original training scripts were removed. Compare refits
   against the original tables and scripted directors on withheld opponents and builds.
4. Compare small learned tactical directors: imitation from existing policies, evolutionary
   optimization, and reinforcement learning. First report sample cost and browser inference
   latency. Retain the existing FighterView/Intent boundary and current reaction privileges.
5. Add frozen past opponents and specialist exploiters to training. Keep the full matchup matrix
   and a diverse archive; success against the latest champion alone is insufficient.

Advancement requires reproducible held-out improvements, credible behavior measurements, and
browser inspection. No cloud spending or GPU training is part of this first local CPU phase.

References: [Glicko-2 specification](https://www.glicko.net/glicko/glicko2.pdf),
[Multi-Emitter MAP-Elites](https://arxiv.org/abs/2007.05352),
[AlphaStar league training](https://deepmind.google/blog/alphastar-grandmaster-level-in-starcraft-ii-using-multi-agent-reinforcement-learning/).
