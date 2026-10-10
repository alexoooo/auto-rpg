# What caps today's walk

The question: why does `stance-walk` hold no more than about 0.5 m/s, when a person walks near
1.4 m/s? Is the cap in the body or in the controller, and which part of either? All figures come
from the Node stand, Rapier, at 120 Hz, using `research/locomotion-run.mjs`. That harness drives
the Lab's Run on the Script preset's mind, and a fall ends a run. Runs last 20 s on a straight line
of each direction (on ground that reaches past their end), or 30 s on the 6 m square and the 4 m
circle. The body faces +z throughout: the
lines `forward`, `right`, `back` and `left` are walked facing +z, and so is the square.

**The answer:** the controller caps the walk, not the body. No single gait setting lifts the cap
either. Once the body moves faster than its plan, each landing falls short of where its capture
point needs it. The body then speeds up step by step until one swing fails. Session 04 (walking
without the pause, with adaptive step timing) is what goes after the binding limit, so it comes
before the run.

## Baseline

**The walk as the game plays it**, capped by the body's envelope (`Body.envelope`). Whatever pace
is asked, the Warrior walks at 0.5 m/s and the Rogue at 0.4 m/s:

| Body | Direction | Mean along the line, m/s | Falls up to 2 m/s asked |
|---|---|---|---|
| Warrior | forward | 0.44 | none |
| Warrior | right | 0.45 | none |
| Warrior | back | 0.37 | none |
| Rogue | forward | 0.33 | none |
| Rogue | right | 0.36 | none |
| Rogue | back | 0.32 | none |

**Uncapped** (`--stance '{"gait":{}}'`: an experiment's tuning, so there is no envelope). The
table gives the fastest pace asked with no fall in 20 s, and the mean pace then, in m/s:

| Body | Forward | Right | Back | Left |
|---|---|---|---|---|
| Warrior | 1.2 (0.81) | 0.5 (0.45) | 0.7 (0.57) | 0.6 (0.56) |
| Rogue | 1.2 (0.66) | 0.5 (0.45) | none | 0.5 (0.46) |

- **Forward**, both bodies fall within 5 s asked 1.4 m/s or more. The pace walked lags the one
  asked (0.81 m/s asked 1.2): the walk speeds up at 1 m/s² and the steps fall short.
- **Back**, the Warrior falls after 18 s at 0.8 m/s and within 5 s at 1.0 m/s or more; the Rogue
  falls at every pace, after 14 s at 0.5 m/s.
- **Sideways**, both fall within 8 s at 0.6 to 0.7 m/s, and within 4 s at 1.0 m/s or more.
- **The circle** (radius 4 m), with no envelope to slow the bends, holds 1.0 m/s asked for 30 s
  on both bodies (0.71 and 0.64 m/s mean), near the straight line's 1.2: turning costs little.

**The gait at 0.5 m/s, Warrior, forward:**
- the steps are short and quick: 0.27 m between touchdowns, 2.6 a second;
- both feet are down 35 % of the time;
- the stance's own phases are single support 78 %, weight shift 20 %, and standing 2 %.

A person at 1.4 m/s takes steps of about 0.7 m at about 2 a second. The gait's step time is
fixed (0.3 s swing and 0.08 s transfer, `STANCE_GAIT`), so its step length is the pace times
0.38 s: 0.53 m at 1.4 m/s. That is within the longest step (0.8 of the leg, about 0.68 m on the
Warrior), and the longest step is never reached in the fast runs below.

**Wind** on the square and the circle, capped and uncapped, gusts 1 a second, three seeds. The
Warrior weighs 775 N and the Rogue 565 N.

| Gust | Warrior, capped | Rogue, capped |
|---|---|---|
| 50 N (6 % / 9 % of weight) | square and circle held at 0.5 m/s | square held at 0.4; circle held at 0.4 |
| 100 N (13 % / 18 %) | square: 1 seed of 3 falls, at 27 s; circle: 1 of 3, at 18 to 29 s | falls on most seeds within 1.5 to 4 s, even at 0.3 m/s |

The wind sliders' range (0 to 200 N) covers the gusts that matter: everything from held to
toppled lies within it.

## The body is not the cap

The same runs, with the muscles made three times stronger or three times faster
(`--physique`, `Physique.strength` and `.speed`), and both together:

| Warrior, uncapped | Forward | Right | Back | Left |
|---|---|---|---|---|
| as built | 1.2 | 0.5 | 0.7 | 0.6 |
| strength x3 | 1.2 | 0.5 | 0.6 | 0.6 |
| speed x3 | 1.4 | 0.5 | 0.5 | 0.5 |
| both x3 | 1.2 | 0.5 | 0.7 | 0.6 |

As built, at 1.0 m/s forward:
- the hip channels are at full activation in 30 % of control steps, and the ankles' in 36 %;
- the swinging hip's flexion and the ankle's dorsiflexion (43 N m against plantarflexion's 152) are
  the channels that sit there.

Three times stronger, no leg channel is at full activation at the paces it holds (0.00 to 0.01 of
steps up to 1.2 m/s). It still falls at 1.4 m/s, a little later (6.7 s against 4.8 s). So the
muscles are busy, but they are not the limit, and there is no body change to put to the owner.

## No single setting is the cap

Each line strips or moves one limit by a research override (`StanceTuning`), Warrior, uncapped.
The cells are the fastest pace held:

| Override | Forward | Right | Back | Left |
|---|---|---|---|---|
| none | 1.2 | 0.5 | 0.7 | 0.6 |
| swing 0.2 s | 0.6 | none | none | 0.5 |
| swing 0.4 s | 1.4 | 0.6 | 0.7 | 0.7 |
| swing 0.5 s | 1.2 | 0.6 | 0.6 | 0.6 |
| acceleration 3 m/s² | 1.0 | 0.5 | 0.7 | 0.6 |
| acceleration 10 m/s² | 1.0 | 0.5 | 0.7 | 0.6 |
| longest step 1.0 of the leg | 1.2 | 0.7 | 0.7 | 0.7 |
| no transfer (a step lifts as the last lands) | 1.0 | 0.7 | 0.7 | 0.7 |
| transfer 0.15 s | 1.0 | none | 0.6 | 0.5 |
| no catch step (`recovery: null`) | 1.2 | 0.5 | 0.7 | 0.6 |
| no knee-bend or ankle limit on the height | 0.6 | 0.5 | 0.6 | 0.6 |
| lift 0.1 m | 1.2 | 0.5 | 0.6 | 0.5 |
| width 0.1 / 0.3 m | 1.0 / 1.2 | 0.5 / 0.5 | 0.6 / 0.6 | 0.6 / 0.6 |
| pelvis turn constant 0.3 s / 0.6 s | 0.7 / none | 0.5 / none | 0.5 / none | 0.5 / none |
| swing constant 0.05 s | 1.2 | 0.8 | 0.8 | 1.0 |
| track 0.1 / 0.4 s | 1.0 / 1.2 | 0.6 / 0.5 | 0.6 / 0.6 | 0.6 / 0.5 |
| support inset 0.3 / 0.7 | 1.0 / 1.2 | 0.6 / 0.5 | 0.8 / 0.7 | 0.7 / 0.6 |
| sole margin 0 | none | none | none | none |
| no heel-off | 1.2 | 0.5 | 0.8 | 0.6 |
| swing torques clipped alone (`boundedSwing: false`) | 1.0 | 0.5 | 0.6 | 0.6 |

The weight shift's wait for the capture point is stripped by "no transfer": only a walk's first
step waits for it, and steady steps already hand the weight over on a timer (`transferStep`).

No setting reaches 1.4 m/s held every way. Forward reads 0.6 to 1.4 asked; sideways and back
0.5 to 1.0, where a stiffer swing (its constant 0.05 s) helps most and nothing else moves them
more than 0.2.

## How it fails

These are traces of single runs, Warrior, uncapped.

- **Backward at 1.0 m/s** (it falls at 5.3 s). The body's speed rises from 1.0 m/s at 3.4 s to
  1.2 m/s at 4.1 s, 1.5 m/s at 4.6 s and 2.0 m/s at 5.1 s. At each landing the capture point is
  0.05 to 0.4 m past the landed foot. The planner re-aims each landing from the measured capture
  point, but the landing it asks is still inside the capture point, and later steps fall further
  inside. Twice the swinging foot is carried up to 0.4 m (its lift is 0.05 m) and lands under the
  body instead of behind it. In the last step the capture point is a metre out, and the body falls
  with both feet behind it.
- **Strafing right at 1.0 m/s** (it falls at 3.1 s). The body runs ahead of both feet until both
  soles are to its left. The right foot, which must step out next, carries the weight and cannot
  lift: the step's double support ends on its timer, and the foot is dragged through its "swing"
  while the soles' shortfall grows from 100 to 2100 N.
- **Strength x3, backward at 1.0 m/s**: the same runaway, landings 0.2 to 0.4 m inside the
  capture point, a fall at 4.5 s.

The soles cannot give the wrench the stance asks (`StanceReading.shortfall` over 1 N):
- in 48 % of control steps at 0.5 m/s forward, and 76 % at 1.4 m/s;
- in 60 to 80 % sideways.

On one foot, the plan's pendulum and the pelvis held upright ask for more than one sole can give.
A slower pelvis turn (0.6 s) holds nothing at all.

## What this sets

- **Session 04 comes first.** The limit is how the walk places and times its steps against a
  capture point that runs ahead of the plan:
  - a landing must catch the capture point, and its time must adapt when it cannot (Khadiv
    2016), rather than a fixed 0.3 s swing re-aimed only in place;
  - the cadence and the step must grow with the pace;
  - sideways, the foot that steps next must not be the one the capture point is past.
- **The swing must reach its landing.** The foot carried 0.4 m high and short in the backward
  trace is a swing that does not track its target. The new skill's fast test and its harness
  readings should show where a swing lands against where it was sent.
- **The run (session 05) waits** until a walk holds near 1.4 m/s. A flight phase built on a stance
  whose landings cannot catch the body would fail the same way, sooner.
- **No body change goes to the owner** from this session.
