# Vanguard development panel

The committed-aim punching kit wins 18 of 18 development bouts against the nine existing humanoid
minds. The supported-low preset wins eight of eight against its four-member panel. These results
do not establish the requested win rate across opponents and equipment. Widening the current
preset to the Skeleton exposes two losses against Options; it wins both on the Rogue. The
punching kit also loses both direct bouts to the original Vanguard.
The optional refreshed prediction wins 5/6 in its paired development cases, including one
Skeleton win, and remains below the required per-opponent result.

## What is used

The candidate is Vanguard with `commitAim: true` and its punch's `settle: 0.2`. The other kit
settings are the original Vanguard's. A punch follows one segment-local aim through its stroke,
then frees its hand to the continuous guard during recovery. The records carry both configurations
whole. They measure the punching kit; the current preset also includes low support and a low-only
punch.

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

## Expanded humanoid field

[The expanded record](../../assets/evaluations/tournament/2026-10-22-30c74f89-960fa8de.jsonl)
uses the same candidate, played source and conditions. It contains 18 unique bouts, including
the six candidate-panel bouts above; these are reused, not additional trials. It adds both sides
against six more humanoid opponents. All 18 are valid wins: 11 by injury and seven at the cap.

| Opponent | Wins | Injury / time-limit wins |
| --- | ---: | ---: |
| Classic | 2/2 | 0 / 2 |
| Behaviours | 2/2 | 2 / 0 |
| Duellist | 2/2 | 0 / 2 |
| Scrapper | 2/2 | 2 / 0 |
| Tempo | 2/2 | 2 / 0 |
| Joint feedback (`direct`) | 2/2 | 0 / 2 |

The Reptile is outside this humanoid field. The results do not test other bodies, equipment,
the obstacle court or held-out starting gaps.

## Supported low fighting

[The supported-low paired record](../../assets/evaluations/tournament/2026-10-22-e21b930e-4b217807.jsonl)
names source commit `e21b930e` and the current preset's complete configuration. It compares the
preset against the committed-aim punching kit under the same Node Arena Duel conditions above.
The Crawl and bite comparison uses the Warrior against the Reptile on its own body, both empty-handed.

| Opponent | Preset wins | Injury / time-limit wins | Punching kit wins |
| --- | ---: | ---: | ---: |
| Crawl and bite | 2/2 | 1 / 1 | 0/2 |
| Counter-puncher | 2/2 | 2 / 0 | 2/2 |
| Options | 2/2 | 1 / 1 | 2/2 |
| Scrapper | 2/2 | 2 / 0 | 2/2 |

All 16 bouts are valid. Each of the six humanoid bouts has the same complete pose digest for the
preset and the punching kit. Against the Reptile, the preset wins by injury at 21.425 s on the left
and at the cap on the right. Its ending bars are 0.999276 and 0.999529; the raw step readings record
zero Warrior falls in either bout. The four-pair panel report is unsettled. These are development
cases, with other bodies, stages, starts and equipment still outside this record.

## Refreshed point prediction

With `predictAim: true`, the punch projects its chosen point onto the sensed collider before
remembering it locally. Each control step predicts that point from the segment's current linear
and angular velocity, with a 0.12 s lead plus the sensed frame's age. The ordinary preset keeps
the previous aiming mode; the editor exposes the option separately.

The [Skeleton record](../../assets/evaluations/tournament/2026-10-22-8047251e-aa0c393a.jsonl)
and [Warrior record](../../assets/evaluations/tournament/2026-10-22-8047251e-dbfb3163.jsonl)
compare the option with the previous supported-low preset at source commit `8047251e`. Each
record carries the full configurations, recipes and pose digests. Harness and conditions are
the Node Arena Duel, `rapier-coordinate`, 120 Hz, matched bodies, empty hands, Balance 0/0,
open stage, 4 m gap, each side, continuing after falls to injury or 120 s.

| Body / opponent | Prediction wins | Injury / time-limit wins | Previous preset wins |
| --- | ---: | ---: | ---: |
| Skeleton / Options | 1/2 | 1 / 0 | 0/2 |
| Warrior / Options | 2/2 | 1 / 1 | 2/2 |
| Warrior / Counter-puncher | 2/2 | 2 / 0 | 2/2 |

All 12 bouts are valid, without draws. The prediction option wins 5/6 against the previous
preset's 4/6; both panel reports are unsettled. It wins the right-side Skeleton bout by injury
at 54.85 s, without falling in the raw development reading. Its left-side Skeleton health
deficit at the cap grows from 0.004665 to 0.078327. This is a useful option with a remaining
weak side, rather than qualification against Options. Other bodies, starts, levels and equipment
are outside these paired records.

## Tried and not kept

The current preset's additional normal-cap development bouts against Options use the same Node
Arena Duel, engine, rate, empty hands, Balance 0/0, open stage and 4 m gap. On the Rogue it wins
2/2 (one injury, one time limit); on the Skeleton it loses 2/2 at the time limit. Neither body
falls. Both Skeleton bouts lead at 30 s, so those short leads do not predict the full result.
These rows and complete recipes are retained in `research/runs/vanguard/bouts.jsonl`, played
source `sha256:867f9b0b750aab30dda66474101dcf6a836783de357420a9c3fb0ae7f73e3bee`.
On the obstacle court at 6 m, the same preset wins both Warrior bouts and splits the Skeleton
pair. These four bouts at the bell include fallen bodies; they do not establish controlled
recovery. The Rogue court pair is not scheduled after the Skeleton loss decides that screen.

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
| Routed downward strikes against the moving Reptile | No strike launches in the 20 s screen. |
| The downward strike's own approach and fold | It launches, but records no damaging hand contact in the screen. |
| Standard front kicks, or a smaller lift with proportionate chamber time | Both split the full Reptile bouts. |
| Faster kick preparation and recovery | Falls interrupt preparation before commitment. |
| Early low guard without approach, turning steps or a finite return | It stalls outside reach or cannot leave failed low support. |
| Alternating the current preset's hands on the Skeleton | Weakens one side of the 30 s screen against Options. |
| Closing the upright covering hand on the Skeleton | Loses both full Options bouts, one with a fall; exact source is archived in `research/runs/vanguard/rejected/closed-upright-guard.json`. |
| Aiming the current standing punch at the Skeleton's head | Loses both full Options bouts, one with a fall. |
| Point-controlled arm acceleration on the Skeleton | Weakens both 30 s exchanges; no full bout follows. |
| Closer standing range on the Skeleton | Splits full Options bouts, with a fall in the winning bout. |
| Contact-ranked head/body attacks with either hand | Loses both full Skeleton bouts, one with falls. |
| A reachable low kick against the Skeleton | Loses support before commitment on both sides; the initial trunk target is an invalid fixture outside the kick's height band. |
| Half the hip and chest turn | Weakens both short Skeleton exchanges. |
| Hooks or overhands using the existing path skill | Produce few target contacts and weaken both short Skeleton exchanges. |
| Waiting for the actual reachable chamber and a slow fist | Weakens both short Skeleton exchanges and reduces damaging body contacts and body-hit energy; exact rejected source is archived in `research/runs/vanguard/rejected/measured-chamber.json`. |

A short exchange is a development filter, not a win counted toward qualification.
