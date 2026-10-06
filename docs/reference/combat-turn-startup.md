# Turning at movement startup

`TurnStartup` optionally bounds heading speed during the first `seconds` of each
continuous requested walk. `limit` is rad/s; both values must be finite and
positive. The shared locomotion skill takes the minimum of this ceiling, any
whole-walk ceiling and the body's envelope. It never raises the envelope.

Completed requested-walk time is capped at the interval and lives in plain
saved leg state. Standing, placing feet and recovery/resumption reset it. A zero
speed request resets the interval; elapsed time alone does not establish real
physical support. Omitted startup tuning preserves the retained locomotion.

`combat-locomotion.md` records the unassisted Warrior's fast startup-turn failure
and successful turns after a short established walk. The new physical and Arena
admission records below gate use of this optional schedule.

## Physical schedule probes

`combat-turn-startup-probes.json` retains twelve whole half-turn probes with source
fingerprint. Node unpinned core stand, rapier-coordinate, 120 Hz, Warrior fists,
GUARD, balance 0. Speeds are 0.18, 0.25 and 0.50 m/s, both turn directions, requested
and whole-walk ceiling 4 rad/s. The optional initial ceiling is 2 rad/s. The body
continues walking for three seconds after the requested half-turn, then stops;
the complete observation lasts through two more seconds. The stand supplies the
whole-walk ceiling explicitly so a delayed request cannot jump when startup ends.

The 0.30 s interval fails the 0.50 m/s left-turn cell (first down at 3.7583 s).
The 0.60 s interval holds all six cells while allowing actual 4 rad/s later in the
walk. All twelve rows are retained, including the failure. The calibration holds
this body/engine/assist context; it is not a context-independent body envelope.

## Arena admission

`combat-turn-startup-admission.json` retains ten whole development fixtures:
four 45 s low bouts and a 30 s self-play bout for each of original Scrapper with
startup tuning, and the adaptive/full-elbow candidate with startup tuning. Both
use interval 0.60 s and initial ceiling 2 rad/s. Node Arena Duel,
rapier-coordinate, 120 Hz, Warrior fists, balance 0/0, continuing recovery.

| Profile | Hand / target | First lowering (s) | Driven low blows | Quiet low steps | Standing return after low blow |
|---|---|---:|---:|---:|---|
| reference | right / stationary fallen | 25.508 | 10 | 1176 | True |
| reference | right / recovering | 16.458 | 0 | 0 | False |
| reference | left / stationary fallen | 11.708 | 1 | 1121 | True |
| reference | left / recovering | 9.558 | 0 | 455 | False |
| adaptive | right / stationary fallen | 25.508 | 10 | 1176 | True |
| adaptive | right / recovering | 16.458 | 0 | 0 | False |
| adaptive | left / stationary fallen | 11.708 | 1 | 1121 | True |
| adaptive | left / recovering | 9.558 | 0 | 455 | False |

Every attacker remains upright, with no head/trunk floor contact or assistance,
but neither recovering-target fixture lands a driven low blow. The right-hand
stationary target is acquired late and the left-hand stationary target receives
only one driven low blow. Both profiles fail admission. The original selected
Scrapper remains unchanged.

Self-play has no falls or prolonged pressure episodes. Original-with-startup
delivers 0.246/0.431 driven HP and 6/15 trunk blows; adaptive/full-elbow-with-startup
delivers 0.386/0.476 HP and 7/11 trunk blows. These single-recipe diagnostics do not
establish competitive strength. Stand stability alone cannot promote a combat
schedule that loses low initiative. The optional schedule is available through
ordinary skill/mind configuration for further context-specific experiments.

Regression gates require actual established fast turning, both directions and
all three speeds, bounded input, a tighter whole-walk ceiling, reset on standing,
zero-speed requests, placement and resume, and fresh-world Arena replay during
startup. Time in saved leg state establishes the control schedule, not loaded
physical support.
