# How hard a human hits

2026-09-27. The owner's brief:

- A typical human at default attributes should strike like a typical adult.
- A human at maximum attributes and size should strike like an elite one.
- If the game is far from that, something is missing.

The question arose because a Warrior club hit booked 18 J. A strong real club hit is 100 J or more.

## Instruments

- **`research/strike-optimizer.mjs`** searches for the strongest strike a body can deliver.
  - It uses cross-entropy search over a scripted command (`research/strike-eval.mjs`): a guard, a
    chamber and a strike. Each is a pose of the trunk and the striking hand, plus a step, and the
    search also sets the start distance.
  - It drives the body through its `Intent` only.
  - The target is an idle unarmed Warrior.
  - Each strike is scored exactly as Combat scores it, on the best unblocked contact of the striking
    hand.
  - Settings: 48 candidates a generation, 14 generations, one Havok arena per worker.
  - `--patches` searches a candidate body without editing the source.
- **Harness.** Every figure here is the Node/Havok bout runner at 120 Hz with supported
  locomotion (`STRIKE_HARNESS`), except the free-air swing bench, which is noted where used.

## What was found

Four mechanisms, each measured in isolation. Energies are the best contact's.

### 1. Scoring bills a fraction of what arrives

`contactReading: "arrival"` reads a contact's velocity as the step began. It then multiplies that
velocity by `arrivalReadFractions`: 0.56 for blades and 0.62 for club and fist. Energy goes as v²,
so every blow is billed 31–38 % of the energy that arrived.

The fractions were chosen to keep a bout as long as it was under the older `"settled"` reading.
That reading was the solver's answer to a speculative contact, and `"arrival"` replaced it as the
physical one. The fraction is therefore a fight-length calibration standing in for physics.

Because it scales the velocity before v², moving it into the joules-per-damage prices changes
nothing except the speed thresholds. Those are the cut floor, the thrust floor and
`impossibleSpeed`, which already reads the whole speed.

| body, default attributes | punch | club | sword |
|---|---|---|---|
| today, billed | 30 J | 72 J | 40 J |
| today, arrival read whole | 79 J | 188 J | 126 J |

### 2. The human turns its trunk like a stone golem

- `HUMAN_WAIST` spreads `TORSO_WAIST`, so it takes stone's `twistRate` of 4 rad/s. That rate was
  chosen so that a golem's twist *arrives* within a stroke, and never measured for power.
- `HUMAN_TORSO.twistMax` is 0.65 rad.
- `humanoidDuelist` then multiplies every twist by 0.35. That factor came in with f79238e9 and has
  no written rationale. Against stone's `trunkSweep` of 0.75, it leaves a human stroke ±0.17 rad of
  body turn.

A real swing turns the shoulders at about 12–15 rad/s, through roughly 60–90° against the stance.

Free-air swing bench: the club driven from a high chamber to a low cross, peak head speed.

| arm rates | twist rate / range / torque | club head |
|---|---|---|
| ×1 | none | 6.2 m/s |
| ×1 | 4 / 0.65 / ×1 (today) | 9.8 m/s |
| ×1 | 12 / 0.9 / ×1 | 13.2 m/s |
| ×1 | 12 / 1.2 / ×1 | 17.5 m/s |
| ×1 | 12 / 1.2 / ×1.5 | 23.0 m/s |

In the strike search (arrival read whole), twist rate 12 rad/s and range ±1.0 rad move the best
punch from 79 J to 220 J. The club and sword barely move, for the reason in finding 4.

### 3. The body is not a typical adult

Measured on the built bodies: collider top and summed part mass, fists included.

| size | Warrior | Rogue |
|---|---|---|
| ×0.8 | 1.57 m, 55 kg | 1.46 m, 55 kg |
| ×1.0 | 1.97 m, 107 kg | 1.82 m, 107 kg |
| ×1.1 | 2.16 m, 143 kg | 2.00 m, 143 kg |

- **Default size is a heavyweight.** A typical adult man is about 1.76 m and 78 kg.
- **Every part mass is a constant, whatever the model.** So the Rogue weighs exactly what the
  Warrior does.
- **The mass is distributed wrongly** against de Leva's segment fractions:
  - the trunk (pelvis 14, waist 5.35, core 37) is 53 % of the body, against about 44 %;
  - the hand is 1.1 kg plus a 0.35 kg fist, against about 0.6 kg.
- **The size row was never set for humans.** Its ×1.1 ceiling is the stone biped's foot slip. The
  human arms alone would allow ×1.25.
- **Weight reaches ×2**, which doubles a human's density. Its range was set by golem chains
  ringing.

Strike search, arrival read whole, realistic trunk (twist rate 12, range 1.0):

| attributes | punch | club |
|---|---|---|
| size 0.9, arm speed 0.5, weight 0.8 | 78 J (7.9 m/s, 2.8 kg) | 66 J (10.4 m/s, 1.3 kg) |
| default | 220 J (10.4 m/s, 4.3 kg) | 180 J (9.9 m/s, 4.1 kg) |
| size 1.1, arm speed 1.5, weight 2 | 349 J (8.5 m/s, **11.2 kg**) | 399 J (12.0 m/s, 6.2 kg) |

The masses in brackets are the striker's effective mass. At the top of the range the punch gets
its energy from a fist twice as dense as a human's, not from speed.

### 4. A straight arm bills the whole body

`effectiveMassAt` treats each joint on the chain as free and the rest of the body as a floating
base. A contact driven along a straightened arm therefore meets no joint that can turn to absorb
it, and bills up to the whole body's mass.

With human-like arm rates (×3, so 9–15 rad/s) the search's best club hit is 280 J at 6.5 m/s,
on an **18 kg** effective mass: an arm locked against the chest with the body behind it. That is a
shove billed as a blow.

A real punch's effective mass is about 1.5–5 kg (the reference table has the sources), because the
wrist and elbow give under load. Until the model has that compliance, maximum energy is the wrong
objective to search on, because the search finds the shove.

## What this means for the owner's numbers

- The 18 J club hit came from three things together:
  - it was the duelist's typical blow, not the body's best;
  - it was billed at 38 %;
  - the trunk was stone's.
- The body is not as weak as that suggested. What is wrong is:
  - its proportions and scale (finding 3);
  - its trunk (finding 2);
  - a scoring fraction that is a unit in disguise (finding 1);
  - a mass model that pays for pushing (finding 4).

## Against the reference

`2026-09-27-human-strike-reference.md` beside this file has the sourced values. The game's side
is the default Warrior, measured as above.

| quantity | real typical | real elite | Warrior today |
|---|---|---|---|
| straight punch, fist at impact | 8.0 m/s | 9.1 m/s (hook 11.2) | best 8.0 m/s (Node strike search) |
| punch effective mass | 2.9 kg | 2.9 kg, super-heavyweight 5.0 | 2.6 kg today; 11.2 kg at weight ×2 |
| fist kinetic energy (derived) | ~94 J | ~120 J, up to ~250 J | 79 J, arrival read whole |
| one-handed 1 kg rod, tip speed | 23.9 m/s (lay men) | no data | club head 9.8 m/s in free air |
| sword cut | 15–25 m/s, 60–130 J | same | tip 17 m/s free, contact ~8 m/s |
| upper-trunk turn rate in a swing | 10–11 rad/s | 13–16 rad/s | 4 rad/s, and ×0.35 in the duelist |
| upper-trunk turn in a swing | ~94° against the target line | ~104° | ±37° |
| elbow extension rate, punch | 22 rad/s | 41 rad/s | 4 rad/s command rate |
| wrist and hand in a stick or racket swing | 31 % of head speed (tennis serve) | same | wrist rate 4–5 rad/s |
| shoulder torque | 60–95 N m | ~88 N m | 65–100 N m |
| elbow flexion torque | 70–80 N m | ~93 N m | 75 N m |
| pronation torque | ~12 N m | no data | 25 N m |
| wrist torque | 7–25 N m | no data | 20–25 N m |
| trunk axial torque (seated or standing, no legs) | 65–145 N m | no data | 360 N m, legs included |
| whole arm mass | 4.95 % of body (3.96 kg at 80 kg) | same | 6.25 kg, 5.8 % of 107 kg |
| hand mass | 0.49 kg | same | 1.1 kg + 0.35 kg fist |
| trunk mass | 43.5 % (de Leva), 49.7 % (Dempster) | same | 52.5 % |
| stature and mass at default | ~1.76 m, ~78 kg | heavyweight 1.9–2.0 m, 100–120 kg | 1.97 m, 107 kg |

What that says:

- **The torques are human** (pronation twice), and so is the punch's effective mass at default.
  The best default punch is a typical untrained man's.
- **The speeds are not.** The arm's command rates are 5–10 times too slow, and the trunk turns at
  a third of a swing's rate through less than half its range. A one-handed club reaches 40 % of a
  lay man's rod speed.
- **A club blow gets its energy from mass instead of speed.** The best club contact was 4–5 kg of
  chain at about 10 m/s, where a real one is under a kilogram at over 20 m/s. The arm is also 58 %
  heavier than a human's, which slows it further under human torques.
- **Scale and mass are not tied to the model.** Elite versus typical is mostly effective mass, trunk
  use and hook speed. It is not density ×2, and not a 2.16 m body.
