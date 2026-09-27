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
