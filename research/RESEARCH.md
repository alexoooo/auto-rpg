# AI research record

## September 2026 restart: what survives in the game

This record concerns the flattened golem game, not the deleted Warrior training project.
All numerical fight results in this directory name the headless bout harness. Browser review is
qualitative and is not mixed into its measurement columns.

| Policies | Current mechanism | What a next experiment can change |
| --- | --- | --- |
| Duelist | First procedural executor and tactics | Baseline and counter-opponent; retain unchanged |
| Fencer | Reactive second executor | Tactical thresholds and option selection |
| Planner | Fencer options selected by a fitted discrete model and finite-horizon search | Refit outcomes/transitions under current physics; compare with the original model |
| Champion | Build-class parameter tables over planner/fencer behavior | Retune against a wider, current league; test specialization versus generalization |
| Form, Skirmisher, Guardian, Brawler | Distinct directors over the third executor | Preserve distinct tactical rules while tuning parameters; subsequently learn directors |
| Tactician | Third-executor options selected by a fitted model including reach classes | Recalibrate, then test richer state and terminal-outcome objectives |
| Driver, Reaper, Miser | Pilots over the fourth executor; Miser is a previously optimized Reaper parameter table | Learn continuous tactical decisions, timing and targeting rather than only retuning fixed rules |

There is no deployed neural policy in the current picker. Feature and pilot interfaces survive,
but their existence is not evidence of a trained contender. The duel-model table header dates its
fit to September 6 and the style-model table to September 7, before the September 18 physical
changes. Their historical win rates and parameter-search gains need new measurement.

The fourth executor exposes nine continuous tactical axes and three gates at a nominal 12 Hz
plus event-triggered asks. Every executor still produces the same legal `Intent` a person uses.
This is a practical neural-policy starting point; direct 240 Hz control of every Intent field is
a separate, more demanding experiment, not a requirement to start learning.

## Measurement repairs made before the league

- The legacy bout-side `retreatTime` field is initialized but not accumulated by the surviving
  runner. Research measures commanded backwards time at the Mind-to-Intent boundary instead.
- The recorder is sampled without legacy option labels, so its option-labelled `attackAttempts`
  remain zero. Research counts rising thrust edges from each hand and natural channel instead.
  A real-Havok test demonstrated the original zero-counter problem before the replacement passed.
- The same fresh-Havok job matched across repeated serial runs and isolated workers. A candidate
  carrying exactly its parent's parameters also matched its parent's complete recorded result.
- Ratings are withheld until an entire balanced round finishes. No guessed values are shipped.

The behavior definitions and their limitations are in `README.md`; the raw per-bout records
retain enough information to inspect build, opponent, side and overtime separately.

## Questions the new results must answer

1. Which current policies lead overall, and which are useful counters despite a lower rating?
2. Does a lead survive different bodies, arena sides, and independent seeds?
3. Which build families fight to a natural decision, and which mostly reach the overtime drain?
4. Do the planners still outperform simple directors after their training environment changed?
5. Can modest parameter search improve several distinct styles without changing the body?

The completed four-round baseline answers the first four questions below. Parameter search and
independent confirmation answer the fifth; training gains alone are not promoted improvements.

## Completed baseline: September 21, 2026

The initial twelve-policy league completed 12,672 bouts in 80.6 minutes with eight workers and
no failed jobs. Every policy has 2,112 appearances, including both sides and every named build.
The exact fingerprint, protocol and machine/runtime dependencies accompany the published reports.
After promotion, `results/original-roster.json` preserves this initial roster and
`results/baseline.json` describes the expanded one.

- Duelist leads at 1535, followed by Champion 1528, Planner 1524, Miser 1520 and Tactician 1516.
  Their rating deviations are about 11 points; the close ordering is not a decisive separation.
  Driver is substantially behind at 1432. Newer executor generations are not automatically stronger.
- The fitted planners remain competitive despite their old training data. This justifies a
  controlled refit experiment, not deleting them or assuming their models are already obsolete.
- Build-specific rankings differ. In default-versus-default mirrors, Champion scores 72.7% and
  Planner 67.0% (88 bouts each), versus Duelist's 58.5%. The JSON's per-build aggregates also
  include cross-build matches, so they answer a different question from those mirror-only figures.
- Duelist scores 48.4% against Tactician over 192 bouts: its highest overall rating does not imply
  winning every matchup. This small reversal is a counter hypothesis, not a confirmed exploit.
- Arena-left scores 47.53% overall versus right's 52.47%. Balanced side swaps are necessary;
  diagnosing the asymmetry is a separate experiment, with no physics changes in this delivery.
- Styles are already measurably distinct: Tactician commands retreat 78.0% of the time and about
  0.46 attack edges/s; Miser retreats 15.8% and commands 1.06 edges/s; Brawler 14.8% and 1.01/s.
  These are command descriptors, not achieved movement or measures of entertainment.

Mirror-build outcomes identify the largest non-engagement/finishing questions. Each row contains
528 bouts across all policy pairs and four seed rounds. Overtime uses the game's normal drain;
it is not an extra research tiebreak.

| Mirror build | Mean seconds | Entered overtime | Draws |
| --- | ---: | ---: | ---: |
| Two blades | 18.1 | 3.2% | 0.0% |
| Default | 26.3 | 8.5% | 0.2% |
| Mace | 23.9 | 3.8% | 0.4% |
| Fists | 62.5 | 63.6% | 0.0% |
| Ram-capped | 114.9 | 99.4% | 41.1% |
| Whip | 82.6 | 90.9% | 1.3% |
| Pitch-blade | 68.8 | 65.7% | 5.1% |

The first follow-up should audit legal attack opportunity, chosen action, actual contact and
damage on these weaker build families. A high overtime fraction alone cannot separate poor
policy timing, incapable geometry, defensive balance and a measurement problem. Preserve the
current simulator and compare policies before proposing changes to any of those boundaries.

## Initial parameter-search outcome

All 24 generations completed: 384 parameter candidates and 26,112 training bouts. Separate
selection used 1,728 bouts, then froze one finalist per style. Neither training nor selection
used wheel, multileg, plated or pitch-blade. Confirmation used 2,592 bouts: 432 per finalist or
parent, paired into 216 side-swap blocks for each candidate-parent comparison.

| Finalist | Match-score gain over parent | Paired 95% interval | Decision |
| --- | ---: | ---: | --- |
| Form, generation 4 / candidate 5 | +11.34 percentage points | +5.32 to +17.36 | Passes statistical and visual gates |
| Guardian, generation 4 / candidate 4 | +5.90 points | +0.58 to +11.46 | Passes, but marginal evidence |
| Skirmisher, generation 2 / candidate 7 | -7.06 points | -12.73 to -1.39 | Reject; original retained |

The JSON IDs use zero-based generation numbers. Form also improves against the five unseen
opponents (+13.54 points, interval +5.83 to +21.25) and four reserved builds (+16.32, +5.90 to
+27.08). Guardian's unseen-opponent gain is only +0.21 points (-7.50 to +7.71); its reserved-build
gain is +7.64 (-1.39 to +17.36). Do not describe Guardian as a demonstrated generalization gain.
These are exploratory per-comparison intervals, not a familywise-corrected claim across all
three finalists; replicate the marginal Guardian result before making stronger claims.

The retained variants differ on attack frequency, retreat and range occupancy on identical
confirmation jobs. Guardian issues about 0.47 more attack edges/s and commands retreat about
17.2 percentage points less than Form. Browser review covered default mirrors versus Fencer
with candidates on both sides, plated Form versus Brawler, wheeled Guardian versus Tactician,
and the two candidates against each other. Both engaged and exchanged damaging attacks;
neither review supports a claim of universal superiority. Remote capture was approximately
1 fps, so animation smoothness was not assessed. Exact observations are retained with the
parameter hashes in the published experiment's browser review.

### Integration and reproducibility audit

Visual review found the body registry's second allowlist excluding researched policies. The
fix admits validated researched names on the golem surface through the actual picker and
factory; a regression test also checks rejection of a foreign surface. Since `units.ts` is
fingerprinted, the finalists were transferred unchanged to a new validation directory, without
copying any bout results or rerunning selection. All 2,592 confirmation records reproduced
exactly under the final code. These are repeated executions of the same jobs, not extra
independent evidence, and they are not pooled. All 12,672 baseline records also reproduced
exactly under the new fingerprint. The original compute usage was carried forward rather than
resetting the budget.

That repeat also exposed bootstrap sampling's dependence on worker completion order. Paired
blocks are now sorted by stable identity before seeded resampling. The heterogeneous-block
regression was observed failing with the sort removed and passing after restoration. The
intervals above use the corrected, order-independent calculation; promotion eligibility did
not change. Training-history intervals retain the original diagnostic output; they are not
promotion evidence. Physics, motor limits and all original policy parameters remain unchanged.

The next search should emphasize generalization and style coverage, not merely more generations
on the same small training batch. Skirmisher's negative confirmation is a concrete warning:
larger training gains can still select a worse policy. The model-refit, quality-diversity and
learned-director experiments below remain the next research phase.

### Published expanded league

The final league has 14 fighting policies, four complete rounds and 17,472 bouts with no failures.
Each policy has 2,496 appearances. Idle remains outside the rating pool. The two new entries are
`Golem form (tuned 1)` and `Golem guardian (tuned 1)`; all original policies remain available.

| Policy | Final Glicko-2 | League match score |
| --- | ---: | ---: |
| Form (tuned 1) | 1499 | 49.9% |
| Original Form | 1475 | 46.0% |
| Guardian (tuned 1) | 1500 | 50.7% |
| Original Guardian | 1508 | 51.2% |

Form's broader league result supports improvement over its parent. Guardian's does not: its
small confirmation gain did not translate into a higher rating in the expanded protocol, which
also includes cross-build assignments and the parent-style opponents excluded from confirmation.
It is retained under the stated confirmation/diversity/visual gates as an optional contender,
not a replacement for its parent or a claim of overall superiority. A future promotion gate
should explicitly require broader-league generalization before calling a variant an upgrade.

Duelist still leads at 1532, followed by Champion 1523 and Planner 1521. Rating deviations are
about 10 points, so close ranks should not be treated as decisive. Full results and immutable
candidate parameters are in `results/baseline.json`, `results/manifest.json` and
`results/experiment.json`; the last also retains the rejected Skirmisher result and browser review.
Recorded computation totals approximately 6.7 hours, including the complete source revalidation,
within the eight-hour allowance. Reused baseline records in the extended league were not rerun
again or counted as extra evidence.

## Experiment sequence after this delivery

### Recalibrate the learned models

Rebuild the missing collection and fitting tools around the current recorder and director hooks.
Collect exploratory legal options, log their actual durations and terminal outcomes, and hold
out both opponents and build families. Keep the original model as a frozen ablation. Audit
capability-loss transitions instead of assuming a body's reach and available actions never
change during a bout. Check model coverage and predictive error before evaluating its planner.

Gate: a paired outcome improvement on untouched bouts, without a worse non-engagement profile;
report prediction calibration as supporting evidence, not as a substitute for winning.

### Expand beyond a single optimized style

Build a quality-diversity archive indexed by attack cadence, retreat and range behavior. Seed it
with several existing styles. Keep both broad competitors and useful specialists identified by
the matchup matrix. Compare against an equal-bout-budget single-objective parameter search.

Gate: improved held-out performance within multiple behavior regions, with browser-visible
differences. Do not count numerical parameter distance as behavioral diversity.

### Learn tactical decisions and timing

First compare small option directors and fourth-executor pilots under the same bout budget.
Behavior cloning can initialize from the existing roster, with style conditioning so incompatible
choices are not averaged into an indecisive policy. Compare evolutionary optimization with
reinforcement learning from that initialization. Add recurrence only as an explicit test of
whether recent motion and opponent history improve prediction and decisions.

Gate: independent outcome gains, retained build generalization, finite/legal commands and a
measured browser inference budget. Record training bouts, wall time and inference latency for
every method. The first CPU search does not establish that neural training is either necessary
or infeasible.

### Train a league that resists counters

Mix current competitors, frozen past policies and deliberately trained exploiters. Select
opponents using measured weaknesses as well as overall strength. Test newly found counters on
unseen seeds before admitting them; a lucky training exploit is not a stable specialist.

Gate: improve average performance and the worst supported matchups, retaining a diverse roster.
Report cycles in the matchup matrix rather than forcing them into a transitive interpretation of
Glicko-2. Keep an untouched final test batch for each publication.

### More expensive methods remain available

Learned-model planning, population reinforcement learning, recurrent opponent adaptation and
direct legal-Intent control remain candidates. Exact Havok rollout planning first needs a proven
state-restoration facility; a clone of visible transforms does not restore solver history.
GPU/cloud work is a later resource decision, informed by measured CPU sample costs.

## Validation baseline

The implementation's latest full test run passed 605 of 607 tests. Two pre-existing failures in
`golem-torso-head.test.mjs` concern a ram reaching its fixed post; both reproduced in an untouched
HEAD archive. They were not weakened or used to change physics for this AI task. Additional
research tests cover ratings, balance, resumability, worker failures, fingerprints, candidate
bounds, paired comparison, publication states, and promotion review.

Type checking and the production build pass. The built arena and module bench both initialize
without console errors. Both arena selectors show the promoted names and their non-provisional
ratings, and a production fight between the variants advanced and dealt damage. Development
and preview servers started for verification were stopped.

Measured league and search findings will be recorded with the published artifacts in `results/`.
