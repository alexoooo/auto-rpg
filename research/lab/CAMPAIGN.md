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
