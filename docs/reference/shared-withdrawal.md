# Withdrawal after a shared-item release

After a shared-item release the [shared strike](shared-strike.md) withdraws the released hand to
its frame's initial anatomical reference position, while the other arm keeps its captured posture;
the task records protocol 4 and `releaseReturn: reference-hand-position`. With it and joint stops
on, every human and skeleton row passes.

A detached hand must stop holding the old grasp, and a joint posture alone does not clear the
item: it competes with the weapon point and the other hand. So the withdrawal adds a hand-position
objective with the strike's feedback time and weight, its target taken from the initial body
geometry with no added displacement, force or tuning constant. Release still keeps the item's pose
and velocity; collisions, limits, strength, assistance and the grip lifecycle are unchanged. It is
a reference-policy choice, not an equipment rule.

## Focused physical regression

Node core world, corrected-limit Rapier 0.21.0-auto-rpg.5 / adapter 6, directional actuation,
120 Hz, ordinary ground, near-stop prediction on, no assistance. Skeleton, seed 1, shared club,
right-hand release, 10 s watched past measured return; the moving target uses delayed tracking and
braking. [Focused records](shared-withdrawal-focused.json).

| Case | Captured posture kept on the released arm | Hand-position withdrawal |
|---|---|---|
| Static miss | 27.183 mm final error; 1,026 released-hand contact steps | 0.2671 mm; no released-hand contacts |
| Tracked moving hit | 751.599 mm final error; four rejected solves; 9.523 mm peak grip gap | 0.2720 mm; no rejected solves; 0.0310 mm peak grip gap |

The kept-posture rows press the club: 33.6299 N s summed static, 96.6938 N s over 1,456 steps
moving (summed loads, not impacts). Their error grows late, so an initial return hides it.

## Development comparison

Same harness, three bodies, seeds 0 and 1, keep-both and either release, centre control, 10 s
continued control; static rows hit and miss, moving rows tracked, fixed-aim and miss; return gate
20 mm. [Full manifests and outcomes](shared-withdrawal.json): 270 rows, source hash
`3023847518a20a5a273ce4c20b6a82a2105abecdf83a53e91c15e1167a14d6dd`.

| Profile | Static successes | Moving successes |
|---|---:|---:|
| Reference parent-axis limits, stops off | 28/36 | 42/54 |
| Corrected limits, stops off | 32/36 | 48/54 |
| Corrected limits, stops on | 36/36 | 54/54 |

All stay up and replay exactly; all human rows pass. Reference failures are skeleton keep-both and
left-release returns (up to 63.407 mm); corrected stop-off failures are skeleton keep-both returns
(up to 35.133 mm), a limit-model matter withdrawal does not touch. Against the matching corrected
[prior screen](joint-stop-tracking.json), stop-off counts rise from 26/36 and 39/54, stop-on from
34/36 and 51/54. The reference profile has no matched before.

[Three page replays](shared-withdrawal-browser.json) (the two stop-on skeleton cases and a
reference Rogue moving hit with left release) match Node's observation hashes and outcomes.

```powershell
node research/control-foundation.mjs --suite point-strike --split development --samples 2 --workers 3 --actuation directional --shared --centre-control --continue-seconds 10 --out research/runs/control-foundation/withdrawal-static
node research/control-foundation.mjs --suite moving-strike --split development --samples 2 --workers 3 --actuation directional --shared --centre-control --continue-seconds 10 --out research/runs/control-foundation/withdrawal-moving
```

Set `CORE_ENGINE=rapier` or `rapier-coordinate`; add `--joint-stops` for the stop-on profile, with
a distinct output directory.

## Tried and not kept

- Returning the released arm's joint goals to the reference pose without the hand objective: the
  static miss ends 45.895 mm out, failing the 20 mm gate.
