# Vanguard development panel

The committed-aim candidate wins six of six development bouts against Options, Puncher and
Counter-puncher. This does not establish the requested win rate across opponents and equipment:
each opponent has only two cases, on one body and stage. The candidate loses both direct bouts
to the original Vanguard.

## What is used

The candidate is Vanguard with `commitAim: true` and its punch's `settle: 0.2`. The other kit
settings are the original Vanguard's. A punch follows one segment-local aim through its stroke,
then frees its hand to the continuous guard during recovery. The registered default retains the
original kit; the record carries both configurations whole.

## Measurement

[The paired record](../../assets/evaluations/tournament/2026-10-22-2a879fe0-bcf65967.jsonl)
names source commit `2a879fe0`, every recipe and each bout's pose digest. Harness: Node Arena Duel,
vendored `rapier-coordinate`, 120 Hz, matched Warrior bodies, empty hands, Balance 0/0, open stage,
4 m starting gap, each fighter on each side. Falls continue to injury or the ordinary 120 s cap.

| Opponent | Candidate wins | Injury / time-limit wins | Original Vanguard wins |
| --- | ---: | ---: | ---: |
| Counter-puncher | 2/2 | 2 / 0 | 2/2 |
| Options | 2/2 | 1 / 1 | 0/2 |
| Puncher | 2/2 | 2 / 0 | 1/2 |
| Original Vanguard, direct comparison | 0/2 | 0 / 0 | 2/2 |

All 14 bouts are valid; none draws. On the shared three-member panel the candidate's win share
is 1 and the original's is 0.5. The paired report is unsettled with three opponent pairs. These
are development conditions, with no held-out confirmation, other bodies, obstacle court or
equipment represented. The direct losses show that the gain depends on the matchup.

## Tried and not kept

Raw development rows, full recipes and source archives are kept under
`research/runs/vanguard/`; their environments distinguish implementations with the same config.

| Candidate | Finding |
| --- | --- |
| Two-punch combination | Splits Options; does not solve the matchup. |
| Delegating the spare hand before the second punch | Loses both full Options bouts. |
| Longer trunk lead | Weakens the 20 s exchange screen; no full bout follows. |
| Committed aim alone | Splits full Options bouts despite leading both at 20 s. |
| Alternating hands or aiming only at the head | Weakens one side of the 20 s exchange screen. |
| Committed aim with active return guard, 0.08 s preparation | Splits full Options bouts. |
| Preparation of 0, 0.08, 0.2 or 0.35 s, with active return guard | The 0.2 s candidate leads both 20 s exchanges by the largest margins and advances to the paired panel. |

A short exchange is a development filter, not a win counted toward qualification.
