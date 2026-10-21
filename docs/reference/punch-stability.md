# Bounded strike stability

The support gates of the planted strike executor (`STRIKE_SUPPORT`,
`src/core/control/support-readiness.ts`) and their qualification. The executor freezes locomotion
for a committed punch and admits preparation only from measured loaded feet, the centre of mass
inside their support polygon, low centre speed and no other fixed support; losing that base
withdraws the stroke. Recovery cancels every path at once without waiting for a return. The
standing cycle qualifies; the combined Arena candidate is rejected.

## Readiness settings

`STRIKE_SUPPORT` holds engineering controller gates, independent of body strength:

| Gate | Value | From |
|---|---|---|
| upward support normal projection (`normal`) | at least 0.9 | the supported-root qualification |
| flat sole corner-height variation (`footGap`) | 15 mm | the supported-root qualification |
| centre speed (`slow`) | at most 0.35 m/s | the combat settling threshold |
| continuous readiness (`hold`) | 50 ms | the stroke preparation hold |

Physical qualification, not a force gain, decides their promotion.

## Qualification

`research/punch-stability.mjs`, all hands and tasks in [punch-stability.json.gz](punch-stability.json.gz):
Node Warrior stand (unpinned) for standing impacts, Node Arena Duel for fallen and recovering
targets; `rapier-coordinate`, symmetric actuation, 120 Hz, empty hands, balance 0 on both sides;
paths at 5 m/s, 0.12 s strokes, elbow extension 0.5, torso rotation 0.2 rad.

| Standing hand / family, 8 s | Verified returns | Failed cycles | Falls |
| --- | ---: | ---: | ---: |
| Left / straight | 7 | 0 | 0 |
| Left / cross | 5 | 0 | 0 |
| Right / straight | 6 | 0 | 0 |
| Right / cross | 6 | 0 | 0 |

Each standing cell gives at least three complete measured impacts; the straights stay weak.

| Arena ground hand / opponent, 45 s | Driven low contacts | Verified returns | Failed cycles | Attacker falls |
| --- | ---: | ---: | ---: | ---: |
| Left / stationary | 0 | 10 | 0 | 1 |
| Left / recovering | 3 | 6 | 0 | 0 |
| Right / stationary | 5 | 8 | 0 | 0 |
| Right / recovering | 2 | 7 | 1 | 1 |

The shared cycle passes the four retained Arena ground gates, standing return and fresh-world replay
included. Fists close for preparation, stroke and withdrawal and open when the verified return
finishes; no collider mass, strength or damage rule changes.

## Apparatus surfaces

The compliant apparatus reads `BuiltSegment.rigid.shapes`, the body's live collision envelope with
the applied fist pose. The qualification used foremost-point admission (its fingerprint records
that version); the current meter clips actual surfaces to the finite face as in
[trained-attack-force.md](trained-attack-force.md), a normal-force meter without shear, sole
pressure or calibrated padding. Arena collisions and damage do not use it.

A closed-hand test puts the face between the open and closed envelopes and reads zero load;
substituting the static open shape fails it. A weightless boxed-foot fixture checks surface
compression against measured pad momentum, allowing 1e-7 N s of float32 rounding on a 1/6 N s pulse.

## Tried and not kept

- A three-second fold instead of two: the stationary left hand still falls with no low contact,
  and stationary-right contacts drop to two.
- Waiting for quiet support before reversing the fold: failures remain.
- A conservative final-foot sweep rejects a close approach that worked; vetoing that approach
  stalls or repeats fallback misses.
