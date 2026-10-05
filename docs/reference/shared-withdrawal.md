# Withdrawal after a shared-item release

The shared point-strike reference withdraws a released hand to that hand frame's initial
anatomical reference position. The remaining arm keeps its measured captured posture. Both
objectives use the existing whole-body motion interface and bounded muscles. Release still
preserves the item's pose and velocity; collisions, joint limits, strength and assistance are
unchanged. The policy changes neither collision suppression nor the physical grip lifecycle.
The task records protocol 4 and `releaseReturn: reference-hand-position` when release is requested.

A detached hand must stop trying to hold the old grasp. A joint posture alone need not clear
the item: its objective competes with the weapon point and the remaining hand. The withdrawal
therefore includes an explicit hand-position objective with the strike's existing feedback
time and weight. Its target comes from the initial body geometry, with no added displacement,
force or tuning constant. It remains a reference-policy choice, not an equipment API rule.

## Focused physical regression

Harness: Node/core world, corrected-limit Rapier 0.21.0-auto-rpg.5 / adapter 6, directional
actuation, 120 Hz, ordinary ground, near-stop prediction enabled, no assistance. The skeleton
uses development seed 1, a shared club and right-hand release. Both trials watch ten seconds
beyond measured return; the moving target uses the existing delayed tracking and braking.
[The focused records](shared-withdrawal-focused.json) retain the outcomes, the drift trace,
released-hand contact totals and the posture-only comparison.

| Case | Captured posture retained on released arm | Hand-position withdrawal |
|---|---|---|
| Static miss | 27.183 mm final error; 1,026 released-hand contact steps | 0.2671 mm; no released-hand contacts |
| Tracked moving hit | 751.599 mm final error; four rejected solves; 9.523 mm peak grip gap | 0.2720 mm; no rejected solves; 0.0310 mm peak grip gap |

The static released-hand contacts sum to 33.6299 N s. The moving trial has 1,456 released-hand
contact steps summing to 96.6938 N s, plus 32 contacts against that forearm. These are summed
loads over sustained contact, not isolated impacts or damage. The late error grows while the
hand is pressing the club; initial return alone hides the defect.

Returning the released arm's joint goals to the reference pose without the hand-position
objective is insufficient: the static miss finishes at 45.895 mm. Disabling just the hand
objective makes the physical regression fail the unchanged 20 mm return gate. Both complete
withdrawal fixtures remain upright, retain continuous release, and satisfy the existing grip
gap and contact/miss gates. The task's cross-world replay fixture also passes.

This does not establish arbitrary collision-free release paths, disarming an opponent, loaded
recovery or integrated gameplay. All values are development measurements; the skeleton has
placeholder anatomy.

## Development comparison

Harness: Node core world, Rapier 0.21.0-auto-rpg.5 / adapter 6, 120 Hz, directional actuation,
ordinary ground, no assistance. Each profile uses all three bodies, development seeds 0 and 1,
keep-both and either-hand release, centre control and ten seconds of continued control.
Static rows include hits and misses; moving rows include tracked hits, fixed-aim hits and misses.
The unchanged return gate is 20 mm. [Full manifests and outcomes](shared-withdrawal.json)
retain all 270 rows under source hash
`3023847518a20a5a273ce4c20b6a82a2105abecdf83a53e91c15e1167a14d6dd`.

| Profile | Static successes | Moving successes |
|---|---:|---:|
| Reference parent-axis limits, stops off | 28/36 | 42/54 |
| Corrected limits, stops off | 32/36 | 48/54 |
| Corrected limits, stops on | 36/36 | 54/54 |

All remain upright and replay exactly. All human rows pass. Reference failures are skeleton
keep-both and left-release returns (maximum 63.407 mm); corrected stop-disabled failures are
skeleton keep-both returns (maximum 35.133 mm). Withdrawal does not repair the latter's limit
model. Relative to the matching corrected-profile [prior screen](joint-stop-tracking.json),
stop-disabled counts rise from 26/36 and 39/54, and stop-enabled counts from 34/36 and 51/54.
The reference profile is reported as a new measurement, without a matched before/after claim.
The corrected, stop-enabled result does not remove the separate bar and defense regressions.

Reproduce each suite with `CORE_ENGINE=rapier` or `rapier-coordinate` in the environment:

```powershell
node research/control-foundation.mjs --suite point-strike --split development --samples 2 --workers 3 --actuation directional --shared --centre-control --continue-seconds 10 --out research/runs/control-foundation/withdrawal-static
node research/control-foundation.mjs --suite moving-strike --split development --samples 2 --workers 3 --actuation directional --shared --centre-control --continue-seconds 10 --out research/runs/control-foundation/withdrawal-moving
```

Add `--joint-stops` for the corrected stop-enabled profile. Use distinct output directories.
Timings overlap other verification and are not capacity measurements. No held-out cases were used.

## Browser and regression checks

The built control-task page checks the two corrected, stop-enabled skeleton regressions above
and a reference-profile Rogue moving hit with left release. Initial and final views were
inspected; browser logs were empty. All three page replays and complete observation hashes and
outcomes match Node exactly ([records](shared-withdrawal-browser.json)). The full test run has
801 passes, zero failures and two existing TODOs; type checking and production build pass.
