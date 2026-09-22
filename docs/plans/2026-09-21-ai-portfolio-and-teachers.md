# AI portfolio and slow teachers

Approved direction: broad portfolio, local-first staged resources, separate fair and privileged
reference tiers, Python training, and the existing legal Intent boundary. No motor/physics changes.

## Milestones

1. **Combat laboratory.** Share the existing bout loop through a stepping API; measure real-Havok
   throughput and bridge overhead; record replay-derived problems and prove branch reconstruction.
2. **Portfolio pilots.** Compare bespoke tactical rules, fitted planners, PPO, NEAT, fixed-topology
   evolution, direct continuous Intent and residual control. Keep observations/action surfaces and
   budgets comparable. Preserve a behavior archive and narrow counters, not just a single winner.
3. **Teachers and students.** Begin with expensive fresh-prefix replay and CEM action-sequence
   comparisons. Keep exact privileged search separate from observation-only approximate planning.
   Retain alternatives/uncertainty, distill fast students, then query student-visited states.
4. **Robust diverse league.** Independent seeds/opponents/builds, multiple training seeds, dynamic
   exploiters, full-bout confirmation, browser review and conditional promotion. Preserve historical
   dated ratings through code changes.

## Resource and acceptance gates

On 2026-09-21 the user authorized continuation as an ongoing goal with **eight additional hours
of local compute**. Campaign commands use `--budget campaign-2026-09-21` and a separate cumulative
ledger at `research/runs/wave3-budget/budget.json`; the pilot ledger remains intact. Individual
jobs are capped at one hour for checkpointing. No cloud spend or physics changes are authorized.
Continue across failed experiments and milestones until that budget is exhausted, a consequential
user decision is required, or independently validated and browser-reviewed stronger, diverse
policies have been delivered. Preserve the user's server and clean up all owned processes.

- First smoke commands: at most ten minutes apiece and one hour cumulatively. Longer learning or
  cloud/GPU work requires a new measured resource decision; the old eight-hour run is not renewed.
- First compare reproducibility, finite/legal actions, action timing, feature/export parity and
  inference latency. Do not mistake a working trainer for a strong trained policy.
- Strength claims require paired held-out outcomes and uncertainty. Diversity requires behavior
  measurements plus visible differences. Oracle labels are finite-search judgments, not truth.
- Retain original policies and physics as controls. Browser candidates are isolated until reviewed.
- Own and clean up every process started; never stop the user's existing development session.

## Implementation handoff

The bounded lab and commands are documented in [research/lab/README.md](../../research/lab/README.md).
That document explicitly distinguishes implemented pilot mechanisms from remaining long-running
campaigns: calibrated fair planning, full-fight oracle performance evidence, independently coordinated
two-hand strokes, adaptive exploiter leagues and statistically supported promotions are not
claimed complete merely because their prerequisite APIs exist.

Record actual smoke results and the next recommended budget in
[research/lab/RESULTS.md](../../research/lab/RESULTS.md). Do not automatically spend the remaining
pilot allowance when it would not answer a new feasibility question.

## Additional campaign: execution status

The eight-hour campaign reached the user's validated-roster success condition after **5 hours
55 minutes of research compute**. Both new specialists are admitted and production-browser-reviewed;
664 tests, type checking and the build pass. Owned processes are stopped and the user's server
is preserved. Remaining research hypotheses below are not claims of completed successful training.
The campaign is recorded in
[CAMPAIGN.md](../../research/lab/CAMPAIGN.md), with compact measured evidence in
[campaign.json](../../research/lab/results/campaign.json). Implementation is not a strength result.

| Workstream | Current evidence / remaining gate |
| --- | --- |
| Common arena strength | Dated cross-build Glicko-2 ratings remain visible through code changes. |
| Laboratory correctness | Real-Havok stepping, exact-prefix replay, legal action adapters, old-network compatibility and Python/browser inference parity are tested. |
| Bespoke specialists | Both admitted after independent 96-bout confirmation and browser review. The final 5,760-bout, 16-policy league has zero failures: Needle leads at provisional 1671 (66.5% score), Paired is 1558 (55.6%), Duelist 1512 (51.1%). Needle's confirmation gain was +28.6 points, interval +19.8 to +38.5; Paired's was +21.9, interval +12.5 to +31.8. |
| Learning | Two stronger-baseline PPO seeds scored 34.4%/59.4%, NEAT 43.8%, and neural evolution 46.9%, against a matched 57.8% control. The PPO maul hypothesis failed 96-bout confirmation. Pilot PPO mean/sample scored 37.5%/46.9%; sampled residual seed 22 scored 53.1%. No learner earned promotion. Lower-noise residual and larger direct-control trials remain new hypotheses. |
| Expensive teachers | All 39 branch-budget queries completed. Four cases beat Champion where Duelist controls lost; four further Planner/Brawler cases also won, although two controls already won. Four actual reference recordings were browser-reviewed through their finishes. This is privileged, small-sample evidence, not universal strength. |
| Fair approximate planning | Both the one-episode calibration (RMSE 0.08160 versus persistence 0.07809) and broader 16-episode validation (0.08975 versus 0.08557) failed. Long-horizon planning remains unvalidated; a new model/representation is needed. |
| Distillation / DAgger | The 209-label student and general/clock controls did not beat Duelist. Three DAgger rounds recovered to 56.3%, not superiority. A scoped long-fit student scored 75% in dual selection but failed 128-bout independent confirmation: 54.7% versus 46.9%, gain interval 0 to +16.4 points. Its promising blade subgroup cannot rescue the failed aggregate gate. Champion remains excluded from student confirmation. |
| Adaptive population | Six generations and 288 training bouts retained four behavior cells. Final mixture scored 62.5% in selection, with an interval overlapping no improvement; its maul hypothesis failed 96-bout confirmation. |
| Visual review | Physical-pose slow playback and isolated arena previews reviewed. Paired, Needle and the rejected scoped student received representative reviews; captured frames do not establish smooth animation quality. Browser wins never override failed statistical confirmation. |

Next experimental decisions: evaluate learners before extending their budgets; test complete
reference fights rather than extrapolating branch utility; compare fair-model error to persistence;
and retain only independently confirmed, visibly distinct policies in the normal picker. Negative
results remain in the evidence record. This checklist is not a declaration that the agenda is done.

## Evidence-driven next wave

These are subsequent research hypotheses, not claims that the current campaign completed them.
The [consolidated learned-policy lessons](../../research/lab/LEARNING-LESSONS.md) distinguish
degradation from inconclusive results, explain the small training/data budgets, and separate
observed transfer failures from untested causal hypotheses. Use those constraints when designing
the next experiments; do not treat rejected candidates as verdicts on entire algorithms.

1. **Counters and robustness first.** Use the enlarged roster's matchup/build table to choose
   exploiters against Paired and Needle. Preserve their published versions as frozen opponents.
   Test capability loss, longer fights and build asymmetries; require fresh confirmation after
   selecting a counter. Keep successful narrow counters even if they do not lead the overall rating.
2. **Transfer the teacher where evidence supports it.** The blade-only student is promising but
   was identified from a failed aggregate confirmation. Freeze a new blade-only hypothesis,
   reserve genuinely new opponents/seeds, and compare it with constant/clock controls again.
   Broaden student-visited teacher queries before adding network capacity. Never count the
   teacher's training opponents as independent student confirmation.
3. **Repair the learner/control interface experimentally.** Compare lower-noise residual PPO
   with its unchanged baseline, evaluate both mean and sampled exports, and separately run a
   substantive direct-Intent trial. Record sample count and complete episodes, not just training
   time. A larger recurrent policy or GPU run should follow a demonstrated bottleneck, not precede it.
4. **Make slow search a stronger reference, not an oracle by name.** Extend full-fight replication
   to new opponents/builds; compare search budgets and fixed action/clock controls. Keep exact
   known-opponent prefix replay explicitly privileged. A fair counterpart needs an opponent model
   and a predictive representation that first beats persistence on held-out episodes; the current
   nearest-neighbor model failed that gate twice.
5. **Retain unusual behavior with evidence.** Balanced pose search, specialist rush/guard/circle
   rules and evolutionary populations remain available. Select from measured behavior regions,
   then independently confirm each retained specialist. Novel-looking commands or training wins
   alone do not establish useful diversity.

All follow-on runs retain the existing budget ledger, immutable policy identities, dated ratings,
full-bout outcomes and owned-process cleanup. New resources require explicit authorization;
unused allowance is not a reason to keep training after the user's success condition is met.
