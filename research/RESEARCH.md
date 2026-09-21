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

An incomplete first-round diagnostic already showed more overtime in ram-only, whip and
pitch-arm mirrors than in sword and mace mirrors. This is a hypothesis to verify against the
completed report, not a policy ranking or a reason to change the league rules mid-run.

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

The implementation's latest full test run passed 601 of 603 tests. Two pre-existing failures in
`golem-torso-head.test.mjs` concern a ram reaching its fixed post; both reproduced in an untouched
HEAD archive. They were not weakened or used to change physics for this AI task. Additional
research tests cover ratings, balance, resumability, worker failures, fingerprints, candidate
bounds, paired comparison, publication states, and promotion review.

Measured league and search findings will be recorded with the published artifacts in `results/`.
