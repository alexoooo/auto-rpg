# Why the target proposals lose the opening tie

2026-09-26. Harness: `research/effector-candidates.mjs`, Node/Havok bout runner and exact forks.
Human blade, mace and fists, expert in either corner, starting separations 1.1, 1.5 and 2.1 m.
The expert runs its usual pre-search shadow continuation for 0.75 s, then evaluates one c8/h1
decision with opponent reseeding disabled. The winner is played live for one second, with no
further search. All 18 winning predictions match the live pose hash and both vitality bars exactly.

The trace now records every evaluated candidate's full score terms and both final vitality bars.
Previously it kept only own vitality and the optional drill score, which could not explain a
normal bout's ranking. No objective, proposal order, tie-break or actuator changed.

In all 18 probes, the best target proposal scores zero and ties an earlier legacy proposal.
The expert chooses cut-mid in five blade probes, duelist in the remaining blade probe and all
mace/fist probes. None selects a task target. Target proposals cause no net damage in these
rollouts; the winning legacy plan also has a zero total. Some other candidates incur small
position costs. The existing strict-greater comparison keeps the earlier candidate on a tie.

This is a local explanation for non-selection, not a headroom result or proof that the expert
never uses targets. The 0.75 s prelude may change separation; a closer initial placement is not
proof of contact at the decision. Zero damage also cannot distinguish a miss from a guard
contact. The next diagnostic should record per-candidate contacts and blocks, then measure
motion and edge presentation in states where the target can actually connect. Changing the
tie-break merely to force target use would not establish a benefit.

Evidence: `research/results/2026-09-26-effector-candidate-probes.json`. Validation: 1086 tests,
check/build, all 18 exact live predictions, and two caught trace mutations (missing opponent
vitality and incorrect candidate totals). Effector remains off by default.

## Contact continuation

Trace-only recorder deltas now separate weapon contacts and blocks for each corner, measured
between the start and end of each candidate rollout. These are reported hand-weapon events,
not raw Havok contacts. Cumulative prelude contacts are subtracted. All 18 winners also match
live contact/block deltas exactly, and every prior score, choice and pose remains unchanged.

| Target family | Rollouts | With own reported contact | With opponent block | Own contacts / opponent blocks total |
|---|---:|---:|---:|---:|
| blade | 18 | 18 | 18 | 66 / 62 |
| mace | 18 | 17 | 17 | 78 / 57 |
| fist | 18 | 18 | 0 | 118 / 0 |

Both bars remain exactly 1 in all 54 target rollouts. Thus these are mostly not misses: every
blade target encounters a block, as do all but one mace target. Fists make reported contacts
without recorded blocks and still cause no wound. The counts do not identify why every
individual unblocked contact scores zero; that needs report-level speed, edge and armour data.

The initial placement sweep also converges during warmup: actual blade gaps at the decision
are 1.490-1.524 m, mace 1.354-1.391 m, fists 0.687-0.775 m. It did not create three distinct
engagement ranges. Further diagnostics should select the engagement state itself, then test
trajectory line, timing and edge presentation against these guards before another headroom run.
The existing tie-break and all defaults remain unchanged.

Evidence: `research/results/2026-09-26-effector-candidate-contacts.json`. Validation: 1086 tests,
check/build; exact playback of poses, bars and counters; two additional caught mutations
(cumulative counts instead of deltas, missing candidate contact trace).

## Per-hand report continuation

The optional trace now forwards each combat callback once and copies its scalar report, then
restores the original callbacks before returning a fork to its pool. This avoids the 24-entry
limit of `Combat.log`. Reports identify the hand, weapon, struck part, blocking/guarding,
closing speed, scored energy, alignments and damage before/after armour. All 18 winning report
sequences exactly match live playback; the earlier scores, counters and physical predictions
are unchanged.

The primary hand carries the target in all these first-decision plans. Across its 18 target
rollouts per weapon:

| Primary weapon | Contacts | Explicit blocks | Body contacts | Maximum body closing m/s | Maximum scored body energy J | Pre-armour damage |
|---|---:|---:|---:|---:|---:|---:|
| blade | 60 | 56 | 4 | 1.562 | 0.579 | 0 |
| mace | 54 | 45 | 9 | 1.698 | 1.829 | 0 |
| fist | 64 | 0 | 64 | 1.330 | 1.646 | 0 |

The remaining own-contact counts in the previous table belong to the off hand. Block reports
intentionally carry zero scoring energy and are excluded from the body maxima above. Body-contact
energy includes the current scoring law's draw contribution for edges. Every primary body contact
is below its existing floor: 10.62 J for the blade, 29.67 J for the mace/fist. Blade contacts are
`weak`; mace/fist body contacts are `slap`. These contacts produce zero damage before armour,
so armour is not what removed a wound. This is a finding about these plans and states, not a
reason to change a damage threshold or motor ceiling.

Next: screen the legal trajectory's timing and aim in the same warmed state, with per-hand body
energy and damage as the readings, then verify any promising plan in mirrored held-out states.

Evidence: `research/results/2026-09-26-effector-candidate-reports.json`; `reportColumns` describes
its compact report arrays. Validation: 1087 tests, check/build, exact report playback, and three
caught observer mutations (lost callback forwarding, lost restoration, wrong hand).
