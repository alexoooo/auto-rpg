# Eight-hour continuation — September 21, 2026

**Completed at the user's validated-roster success condition**, using 5 hours 55 minutes of
the eight-hour allowance. Paired and Needle are independently confirmed, browser-reviewed and
available with dated ratings. This does not claim that every research method succeeded.
For the consolidated interpretation of the learned-policy failures and next-experiment rules,
see [LEARNING-LESSONS.md](LEARNING-LESSONS.md). The sections below retain the chronological record.

The ongoing goal was explicitly authorized by the user. The additional local-compute allowance is
28,800 seconds, separately metered in `research/runs/wave3-budget/budget.json`. The pilot ledger
is unchanged. No cloud spending, physics tuning or automatic promotions.

## First full-bout screen

Node/Havok, selection split, 150-second cap, eight side-swapped matchup pairs per policy.
All 144 bouts reached verdicts. This took 536.965 seconds of the additional allowance.

| Policy | Match score |
| --- | ---: |
| Duelist control | 11/16 |
| Driver control | 7/16 |
| Punisher | 6/16 |
| Interceptor | 8/16 |
| Feinter | 7/16 |
| Coordinator prototype | 8/16 |
| Rush | 7/16 |
| Turtle | 5/16 |
| Circle | 1/16 |

Raw evidence: `research/runs/wave3-baselines/evaluation.json`. Eight pairs are a small selection
sample, not a precise strength estimate. None of these prototypes warrants promotion on this
evidence. Preserve specialists for possible niche tests, but do not spend the whole budget on
these unchanged rules. The original coordinator is not the new independent off-hand controller.

## Implementation and experiment sequence

- Version 2 observations: 112 public features, retaining the original 48 as an exact prefix.
  Archived version-1 networks still execute with their original inputs.
- Explicit potential-reward PPO ablation, with absorbing-terminal correction and discount tests.
  Full-bout training is the default; reward modes have distinct output directories.
- Independent off-hand controller and observation-driven within-bout strategy adaptation.
- Terminal-aware experimental exchange model; original production tables remain unchanged.
- Multi-seed, cross-build evaluation and matched-pair uncertainty reporting.
- Adaptive training population over observation-conditioned strategy mixtures, with past winners
  entering the opponent pool. Its training novelty archive is not promotion evidence.

Next decisions depend on full-bout learner evaluation, independent dynamics calibration,
terminal-model coverage and teacher search-budget curves. No new candidate has been promoted.

## Initial full-episode PPO comparison

Both runs used seed 11, Driver-based residual control, 112 features, one simulator, 150-second
episodes and approximately 592 trainer seconds. Shaped reward collected 79,125 decisions over
165 episode starts; terminal-only collected 80,305 decisions. In 32 matched selection bouts,
shaped scored 8/32 and terminal-only 12/32. Neither is promotion evidence; the small difference
does not establish a reliable advantage for terminal-only training. Raw runs are
`wave3-learning-a`, `wave3-learning-b`, `wave3-residual-eval` and `wave3-terminal-eval`.

Four-worker feasibility (`wave3-parallel-check`): 21,264 decisions, 1,770.35 simulated seconds,
52.04 trainer seconds, inference error 5.22e-8. This used the pilot surface, so its throughput is
not a controlled hardware-only comparison with the residual runs. Workers remain isolated worlds.

Browser review used Chrome. The recorded physical-mesh viewer loaded a 7.33-second paired-policy
replay, advanced at quarter speed, paused and scrubbed to 4.67 seconds. In the isolated arena,
Paired on a two-blade body fought Adaptive on the default body and won, ending at approximately
62% versus 0% vitality. No browser errors were observed. This is a runtime check, not a fair
strength comparison (the bodies differed), and the approximately 1 fps capture cannot judge
animation smoothness. The review tab and owned server were closed; the user's server was retained.

After the initial runs, new experiment directories also retain `source-snapshot.json`, preserving
exact source text alongside fingerprints even while implementation continues. Earlier directories
have fingerprints and artifacts but do not contain this new source bundle.

## Paired specialist: independent confirmation

Selection on two-blade and fist bodies scored 25/32 against Duelist's matched 15/32.
The untouched dual-confirmation pool then used Champion, Tactician and Miser, cross-build
pairings, four seeds and both sides: 96 bouts per policy, no truncated bouts. Paired scored
61.5/96 (64.1%) versus Duelist's 40.5/96 (42.2%). The matched side-pair bootstrap improvement
was +21.875 percentage points, with a 95% interval of +12.5 to +31.77 points (48 pairs).
This supports a dual-weapon specialist, not a universal upgrade. Raw evidence is in
`wave3-paired-confirm`; production admission still requires representative browser review and
a completed fresh cross-build rating league. No learner has earned admission yet.

Representative Chrome review completed on the isolated review origin: Paired versus Duelist,
both twin blades (Paired left, win, 15% vitality); Champion versus Paired, both fists (Paired
right, win, 21% vitality); and default sword/plate Paired versus Fencer (left win, 37% vitality).
No browser errors were observed. These are illustrative runtime checks, not additional statistical
confirmation. The capture was approximately 1 fps; smooth animation quality is not established.
The exact proposal and review notes are in `results/paired-proposal.json`. Owned server and tab
were closed. Original user server processes were retained.

Research overhead finding: repeated source fingerprinting took roughly 770 ms because each branch
reparsed all TypeScript dependencies. Caching import parsing by exact source text reduced warm
checks to about 50 ms. Every call still rereads all dependency contents and resolves imports;
the hash is unchanged. Tests include a same-length runtime-import change after warming the cache.
The already-running teacher process uses its original implementation; subsequent jobs benefit.

## Teacher branch-budget campaign

`wave3-teachers` completed all 39 comparisons: 13 replay-derived scenarios across default,
twin-blade, mace and fist bodies, each searched with 4, 16 and 64 alternatives plus baseline.
Four branches improved 9/13 scenarios (mean utility gain 0.0842); 16 improved 13/13 (0.2007);
64 improved 13/13 (0.2632). These are deterministic two-second, known-opponent utility comparisons,
not independent win rates or calibrated confidence. Larger candidate sets share the smaller
sets' proposals by seed, so their monotonic improvement is not itself a statistical discovery.
The question for the next experiment is whether receding-horizon execution wins full fights.

The teacher was interrupted after checkpointing 26 queries and resumed under the identical
source fingerprint with faster fingerprint parsing. The cumulative ledger retained its charged
time; no budget was reset. Query wall times therefore span both implementations and should not
be interpreted as a controlled branch-count throughput benchmark.

Paired's confirmation behavior proxy (`attackRate`, rising thrust-command edges per second)
was 1.185 versus Duelist's 0.632 on twin blades and 1.027 versus 0.646 on fists. Retreat fractions
remained similar (0.285 versus 0.299; 0.311 versus 0.320). These are command proxies, not counts
of physical damaging strikes. The corresponding build-specific scores were 89.6% versus 68.8%
on twin blades and 38.5% versus 15.6% on fists; neither implies strength against every opponent.

## Operational failure retained

The first larger Duelist-residual PPO attempt was interrupted by Windows `EPERM` while atomically
replacing the shared budget checkpoint. No model was exported, so its subsequent evaluation
correctly failed rather than inventing a result. The queued second run was stopped for repair.
The recorded cumulative budget was retained, and process inspection found no surviving owned
training workers. Atomic checkpoint writes now retry transient EPERM/EACCES/EBUSY locks for at
most 980 ms, preserve the previous destination until replacement succeeds, and still report
permanent errors. Retry, exhaustion and non-lock error cases are tested. Training must be rerun;
this was an infrastructure failure, not evidence about PPO strength.

## First admission and full-fight teacher result

Paired completed the fresh 5,040-bout, 15-policy, 12-build league without failures. Its 672 bouts
gave a 56.47% match score and Glicko-2 rating **1567**, deviation 20. This is a provisional
one-round rating, not evidence that it is distinguishable from Champion's 1569. The normal
picker now offers **Golem paired (dual specialist)** with the evaluation date. Original policies
remain. The full admission record is `results/paired-admission.json`; earlier four-round evidence is
still preserved under `research/results/`.

Chrome review of the normal, non-preview arena confirmed the published label, score, date and
provisional note. A twin-blade fight against Duelist completed with Paired winning at 59% vitality
and no browser errors. The owned review tab and Vite server were stopped again.

The first full-fight privileged reference (`wave3-reference-full`) used Duelist residual control,
Champion as the opponent, default bodies, seed 55, 16 branches, a two-second horizon and half-second
executed prefixes. Its matched ordinary Duelist control lost at 29.633 seconds. Search won at
3.617 seconds with 92.86% vitality, after eight replans. This is one illustrative, known-opponent
fight, not a general strength estimate. Four predefined seed/body replications are now running.

Before the next learner batch, zero residual control was corrected to preserve the baseline's
acting-hand metadata, and the trainer now installs the tested owned-child exit guard. Reference
runs accept explicit seed/body/opponent/baseline settings, reject changed resume configurations,
and preserve their last valid checkpoint when a search deadline expires. New runs retain new
source snapshots rather than modifying the earlier evidence. The complete suite passes 638 tests.

## Predefined reference replications and imitation data

The source-frozen `wave3-reference-r3-*` replication used seeds 55/56 on default bodies and
57/58 on twin blades, always against Champion. All four ordinary Duelist controls lost; all four
privileged references won. Seed 55 reproduces the initial case, so only the other three are new
cases. This small set does not establish a broad win rate or a fair-information policy.

| Seed / body | Control loss time | Search win time | Search remaining vitality | Search wall time |
| --- | ---: | ---: | ---: | ---: |
| 55 / default | 29.633 s | 3.617 s | 92.86% | 63.208 s |
| 56 / default | 60.133 s | 2.733 s | 76.57% | 43.728 s |
| 57 / twin blades | 18.183 s | 3.867 s | 96.11% | 64.867 s |
| 58 / twin blades | 12.683 s | 7.383 s | 90.13% | 165.083 s |

`research/teacher-dataset.mjs` extracts 209 executed observation/action examples, pairing each
action with its **preceding** observation, including the held decisions between replans. It checks
source and replay digests, rejects partial fights, and deduplicates identical replays. Null actions
become zero residuals only when the reference's named baseline exactly equals the control baseline;
they are not converted this way for pilot control or student continuations. A real-Havok substep
trace regression verifies the named zero-residual equivalence. The dataset retains source/outcome
provenance and also exports a constant-mean residual model as an imitation control. Neither that
control nor a distilled student has yet demonstrated held-out strength. The privileged teacher
can use information unavailable to a student, and its finite-search choices are not ground truth.

## Learning decision after the first stronger-baseline seed

The first source-frozen Duelist-residual PPO seed (`wave3-duelist-r3-11`) trained for 892 seconds,
with four environments, 390,820 decisions and 3,052 updates. Export parity error was 1.41e-7.
Its 32 held-out selection bouts scored **34.4%**, versus the matched ordinary Duelist's **57.8%**.
The paired score difference was -23.4 percentage points (95% bootstrap interval -42.2 to -4.7).
There were no truncated bouts. This is a negative result, not an admission candidate.

The largest deficits were whip (25% versus 62.5%) and ram-blade (12.5% versus 75%), neither
of which appears in the training pool. Default tied the control at 50%; maul scored 50% versus
43.75%. These small subgroups diagnose where to investigate, not established specialist wins.
The next comparisons are a second seed, NEAT, fixed-topology evolution, lower-exploration PPO,
pilot/direct PPO, and imitation against its constant-mean control. Training wins do not substitute
for any of these held-out outcomes.

**Teacher/student holdout rule:** Champion supplied the successful reference trajectories, so it
is training data for their students. Champion must not count toward an independent student
confirmation claim. Reserve Tactician and Miser for that claim, with fresh seeds and matched
controls; keep any Champion result explicitly exploratory. Broader reference searches used as
future imitation data must likewise not consume these reserved opponents unnoticed.

The second matched PPO seed completed 402,184 decisions and 3,140 updates, then scored 59.4%
in all 32 selection bouts against the control's 57.8%. Its +1.6-point difference has a wide
interval (-21.9 to +23.4 points), so this is **not evidence of improvement**. The per-build
scores were default 62.5%, maul 75%, whip 37.5%, ram-blade 62.5%. The maul result is a possible
specialist hypothesis for fresh confirmation, not a confirmed counter. Both seeds show why
one successful training run or one favorable subgroup is insufficient.

NEAT's ten-minute residual trial completed five generations, 79,727 decisions and 181 episode
starts, with 1.56e-6 export parity error. Its 32 selection bouts scored 43.75%, versus Duelist's
57.81%, with no truncations. The paired difference was -14.1 points (interval -34.4 to +10.9).
No tested body outperformed the control. This configuration has not earned more of the same
training or publication; it does not establish a limit on NEAT with other representations or
larger budgets. Checkpoints remain available.

The admission gate now requires an audited, policy-hash-matched training-provenance declaration
for learned candidates and refuses overlap between declared training opponents and confirmation
opponents. Tests cover teacher-opponent leakage. This is an audit guard, not an assertion that
the training history can be inferred from weights.

Fixed-topology neural evolution completed five generations, 85,360 decisions and 183 episode
starts, with 3.12e-7 export parity error. Its 32 selection bouts scored 46.88% versus 57.81%,
with no truncations (paired difference -10.9 points, interval -32.8 to +12.5). No tested body
outperformed Duelist. Like the NEAT configuration, this is not a promotion candidate.

The teacher extractor now additionally emits four time-only opening controls, one per reference
fight, in `wave3-reference-student-clock-data`. The 209 supervised labels and constant-mean
control retain their previous hashes. Clock controls use the existing network interpreter,
ignore non-clock observations for their offsets, and return to approximately zero residual after
the opening; their underlying Duelist remains reactive.
They are an explicit open-loop imitation ablation, not exact replay, online look-ahead, or a
strength claim. Their teacher opponent remains training data for confirmation purposes.

The adaptive population completed all six requested generations: 288 full training bouts and
four archived behavior cells. Its final mixture is awaiting fixed held-out evaluation; varying
generation opponents make its training scores unsuitable as a strength trend.

The first neural student (`wave3-reference-student-r4`) fitted the 209 labels for 1,000 updates
in 2.51 seconds (training MSE 0.0762, export parity error 7.66e-7). Its 32 held-out bouts scored
43.75% against Duelist's 57.81%, with no truncations. The paired difference was -14.1 points
(interval -31.25 to +3.125). The four reference wins have **not** transferred into a demonstrated
student advantage. Constant and clock-only controls, followed by student-visited teacher queries,
are the next comparisons; lower training MSE alone would not establish strength.

The constant-mean teacher control scored 37.5% in the same 32 bouts, versus 57.81% for Duelist
(difference -20.3 points, interval -39.1 to -1.6; no truncations). Simply averaging successful
search actions is not an improvement either.

Chrome review of the actual seed-55/default and seed-58/twin-blade reference pose recordings
covered mid-fight exchanges and both finishes, with orbiting, scrubbing and slow playback.
The first shows a close upper-body/head strike; the second ends with the orange opponent
physically broken apart while blue remains standing. No browser errors were reported.
`results/reference-review.json` records the replay identities and limitations. These diagnostic
frames do not establish smooth animation quality or fair-information strength. The owned review
tab and server were closed; the user's port-5180 server was preserved.

## Further negative results and resulting protocol changes

The four clock-only openings scored 56.25%, 46.88%, 50% and 31.25% in 32 selection bouts each,
against the matched 57.81% control. None demonstrated an advantage. The final population mixture
scored 62.5% (difference +4.7 points, interval -15.6 to +23.4), also insufficient. Its maul subgroup
scored 68.75% versus 43.75% for Duelist, making it a second predefined specialist hypothesis
alongside PPO seed 22. Fresh 96-bout maul confirmations are running against Champion, Tactician
and Miser across four opposing bodies, with a matched control. Subgroup selection is not confirmation.

The fair nearest-neighbor transition model trained on seed 8001 and was checked on separate seed
50001. Its 211 nonterminal validation transitions gave RMSE 0.08160 versus 0.07809 for persistence;
vitality RMSE was 0.02573 and ensemble spread 0.05819. It failed this first one-episode calibration
gate. These correlated one-step measurements do not establish trustworthy long-horizon planning.

The first compact pose search completed three generations within 600 seconds. Its initial
incumbent scored 87.5% versus the zero control's 12.5% on one eight-bout training permutation,
then 25% versus 62.5% on the next. Its final 32 selection bouts scored 40.63% versus 57.81%
(difference -17.2 points, interval -43.75 to +7.81), with no truncations. This is not an upgrade.
The next pose protocol crosses the complete 4-body by 4-opponent training matrix on both sides,
instead of extending the unstable small-suite search unchanged. The simpler search remains a
hypothesis, not a claim that constant offsets are universally useful.

A longer 10,000-update imitation fit will distinguish incomplete fitting from transfer failure;
three rounds of student-visited teacher queries are also running. Separately, reference searches
against Planner and Brawler broaden the teacher test without consuming Tactician/Miser, which
remain reserved for Champion-derived student confirmation. These extra searches are not silently
added to the original student dataset.

## Confirmation and student-query outcomes

Both maul hypotheses failed their fresh confirmation. Across 96 full bouts each, Duelist scored
27.08%, PPO seed 22 scored 23.96% (paired difference -3.1 points, interval -13.5 to +7.3), and
the learned mixture scored 30.21% (+3.1 points, interval -5.2 to +11.5). None truncated. Neither
candidate earns publication; the favorable small selection subgroups did not establish a counter.

Longer imitation reduced training MSE from 0.0762 to 0.01586 in 10,000 updates (7.78 seconds),
but its 32-bout score was 37.5% versus 57.81% (difference -20.3 points, interval -43.75 to +1.56).
Improved training fit did not improve transfer.

The three-round DAgger campaign completed in 84.88 seconds, accumulated 562 weighted/retention
rows and queried eight distinct states; seven had finite-horizon teacher improvements. Its final
student scored 56.25% in 32 held-out bouts versus 57.81% (difference -1.6 points, interval -25 to
+21.9), with no truncations. This recovers much of the earlier student's deficit but does not
demonstrate superiority. It is evidence to investigate further, not a promoted policy.

## Broader reference replication and sampled PPO

Four additional predefined reference fights all finished with wins: Planner/default (seed 61,
5.85 seconds, 85.17% remaining vitality), Planner/twin blades (62, 5.23 seconds, 75.29%),
Brawler/default (63, 1.60 seconds, 99.09%) and Brawler/twin blades (64, 6.82 seconds, 91.42%).
Matched Duelist controls respectively won in 39.52 seconds, won in 5.42 seconds, lost in 27.42
seconds and drew in 16.38 seconds. The second case is not a demonstrated improvement: the
baseline already won quickly with slightly more vitality. These remain small-sample, known-opponent
privileged searches. Both Brawler pose recordings were browser-reviewed through their finishes;
the review tab/server were closed and the user's server retained.

PPO now exports both its deterministic mean policy and a seeded sampled policy carrying the
learned diagonal Gaussian deviations. Noise precedes clipping, exactly as in training; sampling
occurs only on the policy's decision clock and held actions remain unchanged between decisions.
Tests cover clipping order, legacy deterministic compatibility, invalid deviations and exact
physical replay. Evaluating both modes tests a training/execution mismatch hypothesis, not an
assumption that adding noise improves fighting. Pilot-control training is running next.

The 15-minute pilot PPO run completed 396,356 decisions and 3,096 updates, with mean-export
parity error 1.03e-7. Its deterministic policy scored 37.5% in 32 selection bouts, and its sampled
policy 46.875%, versus Duelist's 57.8125%. Paired differences were -20.3 points (interval -40.6
to 0) and -10.9 points (-35.9 to +14.1), respectively; neither truncated. Sampling does not
establish an upgrade here. Broader control-surface and lower-noise residual experiments remain.

The new `needle` head-thrust hypothesis scored 67.1875% in 32 general selection bouts versus
57.8125% for Duelist (difference +9.375 points, interval -6.25 to +28.125; zero truncations).
Default sword/shield scored 6/8 versus 4/8; ram/blade scored 7/8 versus 6/8. Maul and whip
matched Duelist exactly because those primary weapons use its unchanged fallback. These small
subgroups are hypotheses, not confirmed counters. Dual selection and independent confirmation
remain separate gates. Loader-only mutations proved the head-height assertion and PPO clipping
assertion fail against their respective defects, without changing watched source files.

Dual selection completed 32 bouts each, without truncations. Duelist scored 46.875%, needle
56.25%, the three-round DAgger student 46.875%, clock opening 0 scored 56.25%, and the
10,000-update student 71.875%. The long student's paired difference was +25 points (interval
+9.375 to +37.5); its twin-blade/fist scores were 62.5%/81.25% versus 43.75%/50% for Duelist.
This is a niche selection result, not independent confirmation. Its poor general-selection
performance rules out presenting it as a broad upgrade. The next frozen candidate limits its
learned residual to independent blade/fist hands and otherwise keeps the baseline.

Needle's twin-blade score was 75% versus 43.75%, but fists fell to 37.5% versus 50%.
The next frozen hypothesis is therefore restricted to genuinely pointed primary weapons with
an aiming envelope; fists are not part of its claimed scope. This adjustment precedes fresh
confirmation, and the old selection evidence is retained as the reason for it.

The broader fair-model campaign completed all 16 training and 16 independent validation episodes.
Equal-episode RMSE was 0.08975 versus persistence 0.08557; vitality RMSE was 0.01826. More varied
data did not repair this nearest-neighbor model's predictive deficit. Long-horizon planning is
not justified by these results. The entire per-episode breakdown is retained.

## Frozen specialist confirmation

The scoped student rechecked at 75% in dual selection, but its 128 fresh cross-build confirmation
bouts against Tactician/Miser scored 54.6875% versus Duelist's 46.875%. The paired difference
was +7.8125 points, interval 0 to +16.40625; no bouts truncated. It fails the predeclared
meaningful-improvement gate. Twin blades scored 84.375% versus 68.75% (difference +15.625 points,
interval +6.25 to +25), while fists matched the control at 25%. The subgroup finding does not
rescue the failed aggregate hypothesis. A narrower future candidate would require genuinely
new confirmation, not relabeling these bouts.

Chrome reviews of the scoped student's twin blades and fists both ended in wins against Duelist,
at 84% and 2% remaining vitality. Its default-body fallback lost to Fencer. Needle's default and
twin-blade reviews won against Duelist at 76% and 22% vitality. No browser errors occurred.
Review records retain the limitations; these unseeded UI fights are not strength measurements.
The owned tab and port-5199 server were closed; user PID 66500 was preserved.

The browser exposed a stale historical viability caption claiming blade mirrors cannot finish.
The caption now identifies that old evidence as a historical stalemate warning rather than an
impossibility claim. Random-build filters and all physics remain unchanged. This UI-only edit
did not change the running experiments' source identity.

Needle passed its frozen 96-bout confirmation on wheel, multileg, plated and pitchblade,
against Champion, Tactician and Miser, with four fresh seeds and both arena sides. It scored
77.0833% versus Duelist's 48.4375%; the matched difference was +28.6458 percentage points,
with a 95% pair-bootstrap interval of +19.7917 to +38.5417. No bouts truncated. Its point-only
scope was frozen before this test, and both evaluation manifests match the proposal's source
fingerprint. The complete 5,760-bout cross-build admission league is running; confirmation
alone does not yet register it in the arena. See `results/needle-proposal-r8.json`.

The confirmation breakdown is important: wheel scored 87.5% versus 47.92%, multileg 87.5%
versus 58.33%, plated 91.67% versus 45.83%, and pitch-blade 41.67% for both policies (the
unchanged fallback). Against Champion/Tactician/Miser, Needle scored 78.13%/71.88%/81.25%
versus 37.5%/57.81%/50%. These exploratory subgroup comparisons are not multiplicity-corrected
claims. Its mean attack-command edge rate was 0.851/s versus 0.459/s, and close-range time
fraction 0.232 versus 0.189; these are behavioral proxies, not damaging-hit counts.

The admission league was checkpointed and resumed with eight isolated workers after verifying
32 logical CPUs were available. Completed bout identities and the cumulative budget were retained;
changing worker count does not alter the frozen schedule. No user processes were stopped.

A warm Node inference check on a close-range, real published twin-blade view used 2,000 warmup
calls and ten batches of 1,000 decisions per controller. Mean decision times were 0.00188 ms
for Duelist, 0.00826 ms for Paired and 0.01019 ms for Needle, under concurrent league load.
This fixed-view microbenchmark establishes inexpensive command computation, not browser
end-to-end frame latency or a whole-fight performance guarantee.

The archived seed-22 PPO checkpoint was also evaluated with its learned Gaussian sampling,
after checking exact weight equality against the mean export. Sampled selection scored 53.125%
in 32 bouts, below both its deterministic 59.375% and Duelist's 57.8125%. This does not rescue
the PPO candidate. A deliberately mismatched checkpoint/export pair was rejected before output
creation. These comparisons do not imply that larger-budget or differently structured PPO cannot
work; they identify shortcomings of these particular small CPU experiments.

## Follow-on experiments, not unearned promotions

The next learning experiments should change a diagnosed constraint rather than merely extend
an unsuccessful run: lower-noise residual PPO to preserve baseline attack gates; substantive
direct-control training; balanced constant-pose search; and broader student-visited teacher
queries with explicitly weighted corrections. The implementations support these protocols,
but the expanded runs are not claimed as completed here. A blade-only student is a new hypothesis
after the failed blade/fist aggregate, and needs genuinely fresh confirmation opponents/seeds.

Fair planning needs a different predictive model or representation: both the one-episode and
16-episode calibration comparisons failed to beat persistence. Privileged fresh-prefix search
has encouraging actual-fight evidence and viewable physical recordings, but its labels remain
finite-search judgments against known opponents, not optimal ground truth. Distillation must
demonstrate transfer independently; spectacular teacher wins do not establish a strong student.

## Watch the reviewed slow-reference fights

With the existing dev server running, open these paths on its origin. The viewer plays recorded
physical poses with speed control, scrubbing and orbiting; it does not rerun the expensive search.
The local raw artifacts remain under `research/runs/` and are intentionally not checked into Git.

- Champion, default body, seed 55: `/research/lab/viewer.html?data=/research/runs/wave3-reference-poses-55/pose-replay.json`
- Champion, twin blades, seed 58: `/research/lab/viewer.html?data=/research/runs/wave3-reference-poses-58/pose-replay.json`
- Brawler, default body, seed 63: `/research/lab/viewer.html?data=/research/runs/wave3-reference-poses-63/pose-replay.json`
- Brawler, twin blades, seed 64: `/research/lab/viewer.html?data=/research/runs/wave3-reference-poses-64/pose-replay.json`

## Final expanded league

Needle completed admission: 5,760 bouts, 16 fighting policies, all 12 named builds, zero failures.
Every policy has 720 appearances. One balanced round was published at 2026-09-21T23:27:29Z;
ratings are provisional, with rating deviation approximately 19.3. Original policies remain.

| Policy | Glicko-2 | Match score | Wins / draws / losses |
| --- | ---: | ---: | --- |
| Needle | 1671 | 66.53% | 476 / 6 / 238 |
| Paired | 1558 | 55.56% | 394 / 12 / 314 |
| Champion | 1556 | 55.42% | 394 / 10 / 316 |
| Duelist | 1512 | 51.11% | 363 / 10 / 347 |

Needle scored above 50% against every other policy in this round, including 58.33% against
Paired and 68.75% against Duelist. These are finite-sample descriptive results, not a proof
against every seed or build. Its score on twin blades was 83.33%, while Paired scored 86.67%;
on fists they scored 36.67% and 50%. Needle is not a universal replacement for Paired.
Per-build league comparisons use different policy seeds and opponent pools; unlike confirmation,
they are not matched causal estimates of changing just one policy.

Behavior also differs conditionally. Across 28 common opponent/body cells per subject build,
Needle's attack-command edge rate minus Paired's was +0.478/s on default bodies (95% cell-bootstrap
interval +0.370 to +0.592), but -0.330/s on fists (-0.429 to -0.237). Twin blades were +0.139/s
(-0.001 to +0.264), not a clear difference. These exploratory comparisons average side-swapped
pairs within each cell; policy seeds differ. They measure command cadence, not damaging strikes.
The 24 direct head-to-head blocks did not show a clear aggregate cadence or retreat difference,
so diversity should be described through supported body-dependent behavior, not invented global
style separation.

The full new admission is in `results/admission.json`; Paired's original admission is preserved
byte-for-byte in `results/paired-admission.json`. Cumulative authorized research compute is
21,306.536 seconds: **5 hours 55 minutes 6.5 seconds**, leaving about 2 hours 5 minutes unused.
Code/test work and browser inspection are not training compute. No further training is needed
to spend that remainder once the requested validated-roster success condition is met.

Final production Chrome review verified both dated pickers and real completed fights: Paired
beat Needle on twin blades (60% remaining vitality), and Needle beat Champion on default bodies
(61%). The production bench also rendered and advanced correctly. No browser errors occurred;
approximately 1 fps capture does not establish animation smoothness. These UI fights are
qualitative checks, not additional strength samples. See `results/final-review.json`.

Post-publication verification passed all 664 tests, `npm run check` and `npm run build`. The
owned review tab and preview server were stopped; no owned research/training processes or budget
lock remain. The original user server PID 66500 still listens on port 5180. The final report
preserves rejected learners, successful teachers, unsupported hypotheses and next-wave gates.
