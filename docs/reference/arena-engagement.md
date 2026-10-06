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
node research/arena-engagement-run.mjs reference docs/reference/arena-engagement-reference-fresh.json --held-out --fresh
node research/arena-engagement-run.mjs tracked docs/reference/arena-engagement-tracked-fresh.json --held-out --fresh
```

Two workers each execute a sequential queue. Compare rates using actual simulated time and
attempt counts, not raw totals from different durations. Development tuning is frozen before
reading held-out results. The first mirrored validation exposed blocked club returns and is
retained as a failed candidate. Those cases become regression fixtures. Fresh validation uses
unseen 1.6/2.8 m gaps, the mirrored side, and 1.5 s walking followed by 2.5 s standing. A candidate is not promoted unless useful contacts followed by returns
improve without increased falls or phase-timeout rate; stationary and lateral acceptance also
require at least three useful returns and no fighter fall in each ongoing case. An early
non-time victory with at least one useful return is recorded separately; static-collider tests
verify three-cycle repeatability for that loadout. An early victory is never reported as three
completed cycles. This is the explicit early-victory default used for the comparison.

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
window. These engineering settings are measured against the reference below.
`ENGAGEMENT.prediction` is `PLACED.seconds` (0.4 s) during placement and preparation, and the
remaining outbound duration during a swing, capped to `APPROACH.reach` displacement. Walking
uses the body's envelope far away and `APPROACH.pace` nearby, with `APPROACH.seconds` for
closing speed and the existing `STRAFE` backward share and facing threshold. Geometry and
release use measured pelvis facing, not just the requested heading.

Tracked settling requires stance phase `stand` with centre-of-mass speed below
`POINT_RETURN.slow` (0.2 m/s) for `POINT_RETURN.hold` (0.1 s), instead of the reference's fixed
`STAND` delay. Preparation retains the measured point-speed/proximity gate and checks the
current target window before release. These are controller acceptance inputs, not anatomical
values. No strength, assistance, inertia or engine settings change.

A new positive-impulse external hand contact initiates return. Self contacts and contact already
present at release do not trigger it. Miss, contact, cancellation, preparation timeout, return
timeout, target escape and recovery interruption are distinct finished-attempt reasons.
`response.completed` counts every finished attempt once, including failures; alternating hands
uses that count rather than outbound durations. `thrown` still counts only timed outbound
completion, while `returned` requires measured hand proximity and speed.

If an autonomous opponent crowds the return, tactics may ask for a backward walk while the
arm returns. Tracked return completion requires the measured hand gate and an upright body,
but permits the controlled gait; settling before the next attack still requires standing.
The reference return keeps its standing requirement. Without this separation, retreating fixes
clearance but cannot finish a return. Explicit movement orders retain priority as well.

The optional own-body hand feedback contains only point motion and external contact readings.
It is sampled from the previous solver step, carries no engine objects or opponent intentions,
and lives in replay state. A driver's release callback clears pending skills at sub-mind takeover,
not only when the body comes back. The independent policy/action route remains available.

## Placement-only candidate

The placement-only candidate adds hand-specific range and bounded prediction, preserves
explicit orders, and stores its decisions in replay state. The HUD reads its engagement phase
between strike phases. This candidate was not promoted.

| Opponent | Useful returns | Fighter falls | Phase timeouts | Simulated seconds |
| --- | ---: | ---: | ---: | ---: |
| stationary | 52 | 0 | 14 | 268.242 |
| lateral | 33 | 0 | 0 | 273.567 |
| advance | 10 | 1 | 2 | 320 |
| retreat | 25 | 0 | 0 | 320 |

Raw results: [arena-engagement-placement.json](arena-engagement-placement.json). The stationary
right hand improves, but the candidate does not pass the complete promotion gate. Contact-aware
return and per-attempt outcome handling are included in the accepted controller below.

## Contact response and failed validation

The first contact-response candidate improves development results
([raw cases](arena-engagement-contact.json)), but fails its mirrored validation:
[reference](arena-engagement-reference-held-out.json),
[candidate](arena-engagement-contact-held-out.json),
[comparison](arena-engagement-contact-comparison.json). Both advancing club cases have zero
useful returns: the opponent crowds the returning hand while the feet remain fixed. Aggregate
improvement does not pass this per-case gate. These cases become regression tests, and the
controller permits the backward return described above. The revised candidate is frozen before
running fresh mirrored gaps and walking cadence.

## Accepted controller

Point control defaults to `engagement: "tracked"`. `engagement: "reference"` retains the earlier
controller for experiments. Classic is unchanged. The default changes neither the body nor the
physics profile. All rates below use actual simulated exposure, including early verdicts.

| Split / controller | Attempts | Useful returns | Useful returns/s | Fighter falls | Phase timeouts | Timeouts/attempt | Simulated seconds |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Development / reference | 201 | 151 | 0.125846 | 2 | 46 | 0.228856 | 1199.875 |
| Development / tracked | 442 | 392 | 0.357871 | 0 | 2 | 0.004525 | 1095.367 |
| Fresh mirrored / reference | 195 | 155 | 0.133492 | 2 | 27 | 0.138462 | 1161.117 |
| Fresh mirrored / tracked | 462 | 413 | 0.398556 | 0 | 3 | 0.006494 | 1036.242 |

All 32 cases in each tracked split attempt and complete at least one useful return.
Stationary/lateral cases satisfy three useful returns without a fall, except the explicitly
separate early-victory category: two development club victories and three fresh mirrored club
victories. The static-collider regression requires at least three verified returns per selected
hand with incoming contacts, including the club. No early win is counted as three cycles.

Records: [development](arena-engagement-tracked.json),
[fresh reference](arena-engagement-reference-fresh.json),
[fresh tracked](arena-engagement-tracked-fresh.json),
[acceptance comparison](arena-engagement-comparison.json).
`engagementComparison` in `research/arena-engagement-score.mjs` checks matched cases, actual
exposure, per-case progress, return count or separately enabled early victory, falls and timeout
rates. The earlier baseline/placement records predate explicit verdict and outcome fields.

## Verification and limits

`tests/arena-engagement.test.mjs` covers new versus persistent/self contact, physical early
return, misses, cancellation, target escape, recovery interruption, missing opponents, explicit
orders, static cycles and crowded club returns. Fresh-world forks compare the whole bout state across moving engagement, pending contact and
a return while walking; moving engagement and walking-return forks also trace every segment.
Mutation controls that admit persistent contact or remove the target window fail their tests.
Existing arena tests also exercise repeated falls, measured standing, walking and resumed attacks
under the tracked default. The historical 19-case `arena-control-cycle.mjs` runner explicitly
selects the reference engagement profile to preserve reproduction of its published table.

These are scripted Warrior-versus-Rogue Node trials, not a win-rate or damage-quality study.
Three phase timeouts remain in fresh validation. Recovery still uses the same slow reference
sequence and retains its known failed club direction. Simultaneous attacks, separate/two-hand
items, stronger defense and general recovery across bodies remain open. The optional feedback
adapter and replaceable tactics preserve the independent AI observation/action interfaces.

Built-browser smoke check: the production Arena renders Warrior versus Rogue, alternating
Point control with empty hands against Classic, with the 60 s recovery allowance selected.
The visible clock advances from 0.8 to 10.2 s; the HUD shows approach, settle, retreat and return.
This checks integration and rendering, not the Node benchmark's physical acceptance figures.
The owned preview server is stopped after the check.
