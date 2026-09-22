# Learned-policy lessons — September 21, 2026

This consolidates the interpretation of the completed campaign. The chronological evidence and
run identities are in [CAMPAIGN.md](CAMPAIGN.md); compact measurements are in
[results/campaign.json](results/campaign.json). Measurements below use the real Node/Havok
bout harness, not browser fights or a Python physics approximation.

## What “failed” means

Distinguish demonstrated degradation, inconclusive improvement, failed independent confirmation,
and infrastructure failure. They do not imply the same next experiment. No learned candidate
earned admission; this is not evidence that PPO, NEAT or learned control cannot work here.

The 5h55m campaign was not 5h55m spent training a single learner. It deliberately spread compute
across methods, training, reference search and substantial evaluation. The larger PPO
runs received about 15 minutes each; NEAT and fixed-topology evolution about 10 minutes and five
generations each. These are initial configurations, not converged algorithm comparisons.
Direct-Intent PPO received only a feasibility pilot, not a substantive campaign establishing
its strength. Report per-method budgets and samples, not just the whole campaign's duration.

## PPO: seed sensitivity and transfer, not a diagnosed single cause

Residual control adjusts an existing Duelist's commands; tactical pilot control selects commands
through the existing executor. The following candidates used the same 32-bout general-selection
suite. Scores count wins as 1, draws as 0.5 and losses as 0; they are not direct win rates against
Duelist, but comparisons against Duelist on matched fixtures.

| Candidate | Score | Interpretation |
| --- | ---: | --- |
| Duelist control | 57.81% | Matched baseline |
| Duelist-residual PPO, seed 11 | 34.38% | Difference -23.4 points, 95% paired interval -42.2 to -4.7: degradation |
| Duelist-residual PPO, seed 22 | 59.38% | Difference +1.6 points, interval -21.9 to +23.4: inconclusive |
| Tactical pilot PPO, mean execution | 37.50% | No demonstrated upgrade |
| Tactical pilot PPO, sampled execution | 46.88% | Sampling did not establish an upgrade |
| Residual PPO seed 22, sampled execution | 53.13% | Did not rescue the candidate |

The two larger residual runs collected about 391,000 and 402,000 decisions. Seed 11's largest
deficits were on whip and ram/blade, absent from its training pool. Seed 22's favorable maul
selection result did not transfer to 96 fresh confirmation bouts: 23.96% versus control 27.08%.
One good seed or selected body subgroup is not enough to establish a specialist.

**Hypothesis, not established cause:** exploration may disrupt the baseline's coordination.
`directIntent` in `src/golem/lab-policy.ts` bounds continuous residual offsets, but attack/guard
channels can override baseline booleans when the action magnitude reaches 0.5. “Residual” does
not mean every exploratory change is harmless. Test lower noise and a restricted aim/reach-only
residual with baseline timing/gates retained before attributing the outcome to this mechanism.
Those are proposed ablations, not completed causal diagnoses.

The Driver-based reward-shaping comparison also did not establish a solution: shaped PPO scored
25% and terminal-only 37.5% in selection. This small comparison does not prove shaping is generally
harmful. Likewise, mean-versus-sampled comparisons do not rule out every execution mismatch.

## Distillation: fitting demonstrations is not learning to fight

The initial student had 209 observation/action examples from four short winning reference fights
against Champion. These are correlated samples from four trajectories, not 209 independent combat
situations. The teacher also searches with privileged information unavailable to the fast student.
Limited coverage and an information mismatch are plausible transfer problems, not isolated causes.

The initial student's general-selection score was 43.75%. Longer fitting reduced training MSE
from 0.0762 to 0.01586 while its score fell to 37.5%. Better imitation loss did not imply better
held-out fighting. Constant-mean and time-only controls also failed to demonstrate superiority;
do not assume a successful opening requires a useful state-dependent learned policy.

The longer-fit model nevertheless produced a promising dual-weapon selection result. A frozen
blade/fist-scoped candidate then received 128 independent confirmation bouts against Tactician
and Miser, excluding its teacher's opponent:

| Scope | Student | Duelist control |
| --- | ---: | ---: |
| Twin blades | 84.375% | 68.75% |
| Fists | 25% | 25% |
| Combined | 54.6875% | 46.875% |

The combined gain was +7.8125 points, interval 0 to +16.40625. It failed the predeclared gate of
at least +10 points and a strictly positive lower bound. The blade-only subgroup is the strongest
learning lead, but was identified from this failed aggregate confirmation. Freeze a new hypothesis
and use genuinely new confirmation; do not relabel these same results as independent success.
Teacher training opponents remain training opponents for every derived student.

## DAgger: recovery with very little new information

Three rounds of teacher queries at student-visited states recovered general-selection performance
to 56.25%, versus control 57.81%. There were only eight distinct queried states; seven had
finite-horizon teacher improvements. The 562 weighted/retention rows are not 562 new teacher
decisions. The result supports investigating broader corrective coverage, not claiming superiority
or that DAgger was exhaustively tested. Count unique queried states and trajectories separately
from duplicated training weights.

## Evolution and learned planning

NEAT scored 43.75% and fixed-topology neural evolution 46.88% in general selection. Their paired
intervals included zero improvement, and neither configuration earned promotion. Five generations
do not establish an algorithmic ceiling. The adaptive mixture scored 62.5%, but its interval also
included zero; its selected maul hypothesis failed fresh confirmation (30.21% versus 27.08%).

The nearest-neighbor dynamics model failed to beat persistence twice. Broader validation over
16 independent episodes gave equal-episode RMSE 0.08975 versus persistence 0.08557. That baseline
predicts unchanged observations. The evidence does not justify trusting this model for long-horizon
planning; change the predictive representation/model and validate again before extending search.

## Rules for the next learning campaign

- Keep measured outcomes separate from plausible causes. We have not systematically established
  which movement/timing defects explain each rejected learner; do not invent visual diagnoses.
- Preserve zero-residual equivalence and Python/TypeScript export parity. Tested parity passed,
  so failed strength is not simply explained by an unverified browser export. These checks still
  do not rule out every modeling or training defect.
- Keep operational failures separate: the interrupted EPERM checkpoint run exported no model
  and provides no PPO-strength evidence. It was repaired and subsequent runs were evaluated.
- Favor a frozen blade-only student and broader corrective teacher coverage as concrete leads.
  For PPO, test the control-interface hypotheses rather than assuming more unchanged training
  will fix transfer. Compare against unchanged controls, across seeds, before broadening scope.
- Report independent bouts, build/opponent coverage and unique teacher queries alongside training
  decisions, optimizer updates and wall time. Weighted rows and correlated time steps are not
  independent evidence.
- Keep the existing promotion gates. Neither impressive teacher wins, better training loss,
  illustrative browser wins nor post-hoc subgroups replace fresh full-bout confirmation.

The reference's labels remain finite-search judgments, not optimal ground truth. The campaign
supports better-targeted learning experiments, not abandoning learning or declaring any method
solved. This document records lessons and proposed tests; it authorizes no additional computation.
