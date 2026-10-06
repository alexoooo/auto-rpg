# Bounded strike stability

The optional planted strike executor freezes locomotion for a committed punch cycle and admits
preparation only from measured loaded feet, a centre of mass inside their support polygon, low
centre speed and no other fixed support. Losing this base withdraws the stroke. Recovery can
cancel all paths immediately and does not wait for a successful return.

## Readiness settings

`STRIKE_SUPPORT` contains engineering controller gates, independent of body strength. Upward support uses a
normal projection of at least 0.9, and a flat sole permits 15 mm of corner-height variation,
as in the supported-root qualification. Centre speed is at most 0.35 m/s, the existing Combat
settling threshold; continuous readiness is 50 ms, the shared stroke preparation hold.
Physical qualification determines whether these settings can be promoted. No force-improvement
percentage is part of stability admission.

## Qualification

`research/punch-stability.mjs` retains every configured hand and task in
[punch-stability.json.gz](punch-stability.json.gz). It uses the Node unpinned Warrior stand
for standing impacts and ordinary Node Arena Duel for fallen/recovering targets, on
`rapier-coordinate`, symmetric actuation, 120 Hz, empty hands and balance 0 on both sides.
Paths request 5 m/s, 0.12 s strokes, elbow extension 0.5 and torso rotation 0.2 rad.

| Standing hand / family, 8 s | Verified returns | Failed cycles | Falls |
| --- | ---: | ---: | ---: |
| Left / straight | 7 | 0 | 0 |
| Left / cross | 5 | 0 | 0 |
| Right / straight | 6 | 0 | 0 |
| Right / cross | 6 | 0 | 0 |

Each standing cell supplies at least three complete independently measured hand impacts.
The straight strokes remain weak; stability acceptance says nothing about human force parity.
Fixed-obstruction, miss, cancellation and fresh-world replay tests cover the common cycle.

| Arena ground hand / opponent, 45 s | Driven low contacts | Verified returns | Failed cycles | Attacker falls |
| --- | ---: | ---: | ---: | ---: |
| Left / stationary | 0 | 10 | 0 | 1 |
| Left / recovering | 3 | 6 | 0 | 0 |
| Right / stationary | 5 | 8 | 0 | 0 |
| Right / recovering | 2 | 7 | 1 | 1 |

The combined candidate is rejected. Brawler and Scrapper retain their qualified settings.
The shared cycle passes the retained four Arena ground gates, including standing return and
fresh-world replay. Closed fists are requested for preparation, stroke and withdrawal, then
opened when the verified return finishes; no collider mass, body strength or damage rule changes.

A three-second fold instead of two seconds does not solve ground qualification: the stationary
left hand still falls and produces no driven low contact, while stationary-right low contacts
drop to two. Waiting for quiet support before reversing the fold also leaves failures. Neither
experiment is promoted. A conservative final-foot sweep rejects a previously successful close
approach; simply vetoing that approach produces stalls or repeated fallback misses. Safe close
routes and measured whole-body withdrawal remain open controller work.

## Apparatus surfaces

The compliant apparatus reads `BuiltSegment.rigid.shapes`: the body's live collision envelope,
including the applied fist pose. Capsule support retains the endpoint-and-radius calculation.
Box, sphere and hull support use the foremost world point of their physical shape. The finite
rectangular pad admits that point only within its face. This simple normal-force apparatus does
not model general edge contact, shear, distributed sole pressure or a human force plate's padding.
Those assumptions are held fixed for comparisons and do not alter Arena collisions or damage.

A physically closed-hand test places the face between the open and closed envelopes and reads
zero load; substituting the static open shape makes it fail. A separate weightless boxed-foot
fixture checks actual surface compression against independently measured pad momentum. Its
1/6 N s pulse permits 1e-7 N s of Rapier float32 velocity rounding. These tests validate the meter
and shape selection, not human kicking performance.
