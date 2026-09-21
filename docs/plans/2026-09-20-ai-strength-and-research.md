# AI strength ratings and a stronger, more diverse roster

## Summary

Build a reproducible offline league, display measured ratings beside arena policy names, and run an initial CPU search for improved policy variants. Allow up to eight hours of local computation, with resumable runs.

The current roster contains 12 fighting policies plus Idle: scripted fighters, distinct tactical styles, table-based planners, and previously optimized parameters. Historical results predate the recent physics changes; none should be treated as current rankings. A smoke bout confirmed the headless harness works, taking 1.7 seconds for 20.4 simulated seconds, but this is not a throughput guarantee or strength assessment.

## Rating league and arena display

- Use **Glicko-2**, which adds uncertainty to an Elo-like rating. Initialize policies at rating 1500, deviation 350, volatility 0.06, with τ = 0.5. Update simultaneously after each complete scheduled round, never in worker-completion order. Ratings describe this game’s league, not human chess strength. Follow the [published specification](https://www.glicko.net/glicko/glicko2.html).
- Evaluate all 12 fighting policies. Keep Idle as a diagnostic control, outside the competitive rating pool; display `Idle — unrated`.
- Use the existing 12 named builds, equally weighted. Each policy pair plays every identical-build matchup, plus six cross-build pairs formed by pairing adjacent entries in the frozen roster. For cross-build matches, exchange both policy-to-build assignments and arena sides.
- One round uses independent seeded policy streams across all these conditions: 3,168 bouts. Target four rounds, subject to the time budget. Seeds follow each policy when sides swap.
- Reuse `runBout`, supported locomotion, and fresh Havok per bout. Preserve current arena startup behavior, use the existing 150-second probe cap, and score wins/draws/losses as 1/½/0. Do not introduce a harness-only damage tiebreak or draw-floor adjustment. Report overtime endings separately.
- Publish ratings alongside matchup results, per-build results, draw rates, side bias, bout counts, and uncertainty. Mark ratings provisional when fewer than four rounds are complete or rating deviation exceeds 100.
- In both arena selectors, show labels such as `Golem fencer — 1538` or `Golem fencer — 1538 (provisional)`. Preserve policy IDs and selection behavior. A compact adjacent explanation identifies the cross-build league, evaluation date, and selected policy’s uncertainty.
- Browser matches do not update ratings. Unevaluated policies show `unrated`; ratings whose evaluation fingerprint no longer matches show `needs evaluation`.

## Reproducible evaluation and first policy search

### Infrastructure and interfaces

- Add a standalone research CLI beside its methodology and research record; retain the existing npm commands.
- Define versioned evaluation manifests, bout-result records, candidate parameter artifacts, and a small browser rating artifact. Record exact builds, seeds, policy versions, simulation-source fingerprint, dependency versions, protocol, and instrument version.
- Support evaluate, summarize, search, and publish operations. Store completed bouts incrementally and resume only when fingerprints match. Failed bouts remain explicit failures and cannot silently become draws or disappear from a published round.
- Run isolated worker threads, one sequential bout at a time per worker. Default to half the available logical CPUs, capped at eight. Use a single eight-hour compute budget: up to three hours for baseline evaluation, three for search, and two for confirmation and publication. Unused time carries forward.
- Publish only complete balanced evaluation rounds. Partial work remains resumable. If the budget cannot complete one round, deliver the infrastructure and measured partial report without presenting partial scores as a completed league.

### Initial improvement experiment

- Preserve all existing policies as baselines. Search separate Form, Guardian, and Skirmisher variants so the experiment starts from different tactical rules.
- Use seeded cross-entropy parameter search: 16 candidates per generation, four elites, at most eight generations per style, with round-robin scheduling across styles.
- Tune six existing parameters: stand-off fraction, patience, strike bite, recovery duration, closing gain, and turning gain. Search within 75–125% of each parent value, intersected with existing legal ranges; retain zero-valued sentinels. Keep executor logic, stroke geometry, motor limits, and physics unchanged.
- Train against Duelist, Fencer, Planner, and Miser, using eight named builds. Reserve wheel, multileg, plated, and pitch-blade for build generalization checks. Use disjoint training, selection, and final-confirmation seeds.
- Rank candidates by equally weighted match score. Compare candidates and parents on identical jobs; advance the best candidate from each style to selection, then freeze finalists before final confirmation.
- Promote a variant only when the paired 95% bootstrap interval for its score improvement over its parent is above zero on final confirmation. Report results against unseen opponents and reserved builds separately.
- Measure style through attack rate, retreat-time fraction, range occupancy, and blocking rate. Require promoted variants to remain distinguishable from other promoted variants on at least one descriptor with a paired interval excluding zero.
- Add successful variants under new policy IDs and evaluate them against every existing policy before publishing their ratings. If no candidate passes, retain the existing roster and record the negative result; improvement is an experimental outcome, not a promised result.

## Next research phase

Maintain a research record beside the runner, containing current measurements, executable experiment commands, findings, and advancement gates.

1. **Re-establish the baseline.** Identify current leaders, counters, weak build families, stale planner behavior, startup asymmetry, and prolonged non-engagement. Separate observed defects from historical comments.
2. **Optimize multiple styles.** Complete the parameter-search experiment above. Extend successful work into a quality-diversity archive that retains strong policies with different measured behaviors. [MAP-Elites research](https://arxiv.org/abs/2007.05352) provides a suitable model for this approach.
3. **Rebuild learned planning evidence.** Collect exploratory transitions under current physics and refit the planner and tactician models. Compare against their frozen versions and simple scripted directors using unseen seeds and builds.
4. **Learn tactical decisions.** Compare small neural policies initialized from existing directors, evolutionary search, and reinforcement learning through the existing legal command interfaces. Measure sample cost and browser inference cost before selecting a larger training method.
5. **Train against a league.** Introduce frozen historical opponents and specialist exploiters rather than training solely against the latest champion. This follows the population approach demonstrated by [AlphaStar](https://deepmind.google/blog/alphastar-grandmaster-level-in-starcraft-ii-using-multi-agent-reinforcement-learning/). Keep matchup tables to expose counterstrategies hidden by aggregate ratings.

All methods remain available for subsequent experiments. The first delivery implements evaluation and parameter search; later stages are explicitly documented experiments, not unbounded training commitments.

## Verification and acceptance

- Test rating calculations against the published example; test draws, reversed outcomes, permutation independence within rating periods, and provisional handling.
- Test schedule balance, side/build swaps, seed ownership, resume equivalence, artifact invalidation, and explicit failed-bout handling.
- Verify behavioral measurements against deliberately passive and contrasting control fixtures; use time-normalized rates because improved fights may end sooner.
- Reproduce selected bouts with fresh Havok and compare serial versus worker execution.
- Check both arena selectors in the browser, including provisional, unrated, and stale states. Visually inspect representative candidate fights before promotion; statistical diversity alone does not establish interesting fighting.
- Run `npm test`, `npm run check`, and `npm run build`; verify both production pages and stop any development server started for checks.
- Commit each validated increment. No changes to combat rules, physics tuning, perception privileges, or the human/AI command boundary are included.

## Implementation outcome — September 21, 2026

Implemented the offline league, arena rating display, resumable CPU search, independent
confirmation and reviewed-policy publication. The expanded league covers 14 fighting policies
over 17,472 bouts. Tuned Form and Guardian are available; Skirmisher's candidate was rejected.
Guardian's broader league result is mixed, so it is retained as an alternative, not a replacement.
Computation used approximately 6.7 of the allowed eight hours.

See the [research record](../../research/RESEARCH.md) for measured findings, limitations and next
experiments, and the [runner documentation](../../research/README.md) for reproducible commands.
Type checking, build and production-page checks pass. The test suite passes 605/607, with two
pre-existing ram/post fixture failures reproduced independently and left unchanged.
