# Eight-hour continuation — September 21, 2026

Ongoing goal, explicitly authorized by the user. The additional local-compute allowance is
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
