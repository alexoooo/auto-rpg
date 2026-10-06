# Moving-opponent engagement

## Protocol

The harness is Node arena Duel, vendored Rapier gameplay profile, symmetric actuation, 120 Hz,
Warrior versus Rogue, zero balance on both sides, normal collision and damage. Each case lasts
at most 40 seconds, or until the ordinary Duel verdict. The opponent receives ordinary movement
orders: two seconds walking followed by two seconds standing. Lateral direction alternates each
walking interval. Walking speed is the body's existing ordered-walk envelope. No pose or velocity
is installed. The stationary opponent guards without attacking.

Development uses Warrior on the left at 1.2 and 2.4 m initial gaps, empty left/right/alternating
hands and right-hand club, against stationary, lateral, advancing and retreating opponents:
32 cases. Held-out evaluation exchanges sides, using the same 32 configurations. Neither side
starts facing the other; both begin in the ordinary arena construction pose.

The runner records attempts, distinct incoming contacts during swings, verified returns after
those contacts, total returns, phase timeouts, each body's falls, time outside the selected hand's
reach window, and time to first incoming contact. A contact is the first positive-impulse contact
with the opponent in a swing, preceded by no contact and positive point closing velocity relative
to the sensed opponent head. It does not establish damage quality. A useful return requires both
that independently measured contact and the controller's verified return in the same attempt.
Pressure already present at release does not count. Results retain failed cases and early verdicts.

```powershell
node research/arena-engagement-run.mjs reference docs/reference/arena-engagement-baseline.json
node research/arena-engagement-run.mjs tracked docs/reference/arena-engagement-tracked.json
node research/arena-engagement-run.mjs reference docs/reference/arena-engagement-reference-held-out.json --held-out
node research/arena-engagement-run.mjs tracked docs/reference/arena-engagement-tracked-held-out.json --held-out
```

Two workers each execute a sequential queue. Compare rates using actual simulated time and
attempt counts, not raw totals from different durations. Development tuning is frozen before
reading held-out results. A candidate is not promoted unless useful contacts followed by returns
improve without increased falls or phase-timeout rate; stationary and lateral acceptance also
require at least three useful returns and no fighter fall in each case.

## Reference development results

| Opponent | Attempts | Incoming contacts | Useful returns | Fighter falls | Phase timeouts | Simulated seconds |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| stationary | 50 | 29 | 22 | 0 | 38 | 277.475 |
| lateral | 52 | 49 | 45 | 0 | 4 | 282.4 |
| advance | 48 | 46 | 40 | 2 | 4 | 320 |
| retreat | 51 | 45 | 44 | 0 | 0 | 320 |

Raw per-case results: [arena-engagement-baseline.json](arena-engagement-baseline.json).
The reference produces repeated preparation/return timeouts against stationary guards; the
advancing opponent also causes club-fighter falls. These are development failures to retain.

## Tracked settings

`ENGAGEMENT.spacing` and `ENGAGEMENT.entry` are each half `APPROACH.reach` (0.125 m):
extra placement distance and the inner engagement band. The outer band is the existing strike
window. These are engineering candidates, measured against the reference before promotion.
Prediction uses the remaining `PLACED.seconds`, capped to `APPROACH.reach` displacement.
Walking uses `APPROACH.pace` and `APPROACH.seconds`, with the existing `STRAFE` backward
share and facing threshold.

## Placement-only candidate

The tracked engagement candidate is explicit (`engagement: "tracked"`); ordinary Point control
retains the reference until all promotion gates pass. It uses hand-specific range and bounded
prediction, preserves explicit orders, and stores its decisions in replay state. The HUD reads
its engagement phase between strike phases.

| Opponent | Useful returns | Fighter falls | Phase timeouts | Simulated seconds |
| --- | ---: | ---: | ---: | ---: |
| stationary | 52 | 0 | 14 | 268.242 |
| lateral | 33 | 0 | 0 | 273.567 |
| advance | 10 | 1 | 2 | 320 |
| retreat | 25 | 0 | 0 | 320 |

Raw results: [arena-engagement-placement.json](arena-engagement-placement.json). The stationary
right hand improves, but the candidate does not pass the complete promotion gate. Contact-aware
return and per-attempt outcome handling remain necessary.
