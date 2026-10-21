# Turning at movement startup

`TurnStartup` (`turnStartup`, `src/core/mind/config.ts`) optionally bounds heading speed to `limit`
rad/s for the first `seconds` of each continuous asked walk; both must be finite and positive.
Locomotion takes the least of this, any whole-walk ceiling and the body's envelope, never raising
the envelope. Elapsed walk time is capped at the interval and kept in saved leg state; standing,
placing feet, recovery, resumption and a zero-speed request reset it. Omitted, locomotion is
unchanged. It answers the startup-turn falls in [combat-locomotion.md](combat-locomotion.md).

## Physical schedule probes

`combat-turn-startup-probes.json`: twelve half-turns, Node core stand (unpinned), rapier-coordinate,
120 Hz, Warrior fists, GUARD, balance 0; speeds 0.18/0.25/0.50 m/s, both directions, asked and
whole-walk ceiling 4 rad/s, startup ceiling 2 rad/s; 3 s of walking after the turn, then 2 s
stopped. The stand gives the whole-walk ceiling explicitly so a delayed request cannot jump when
startup ends.

- 0.30 s interval: the 0.50 m/s left turn falls (first down at 3.7583 s).
- 0.60 s interval: all six cells hold, with actual 4 rad/s later in the walk.

The calibration holds for this body, engine and assist, not as a body envelope.

## Arena admission

`combat-turn-startup-admission.json`: per profile, four 45 s low bouts and a 30 s self-play bout;
interval 0.60 s, startup ceiling 2 rad/s; Node Arena Duel, rapier-coordinate, 120 Hz, Warrior
fists, balance 0/0, continuing recovery. Both profiles (Scrapper, and the adaptive/full-elbow
candidate, each with startup tuning) give identical low rows:

| Hand / target | First lowering (s) | Driven low blows | Quiet low steps | Standing return after a low blow |
|---|---:|---:|---:|---|
| right / stationary fallen | 25.508 | 10 | 1176 | yes |
| right / recovering | 16.458 | 0 | 0 | no |
| left / stationary fallen | 11.708 | 1 | 1121 | yes |
| left / recovering | 9.558 | 0 | 455 | no |

No attacker falls, touches the floor with head or trunk, or uses assistance, but neither
recovering target takes a driven low blow: both profiles fail admission and Scrapper is unchanged.
Self-play: 0.246/0.431 driven HP and 6/15 trunk blows (Scrapper), 0.386/0.476 and 7/11 (adaptive),
no falls.
