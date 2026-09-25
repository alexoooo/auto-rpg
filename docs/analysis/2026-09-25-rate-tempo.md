# Rate tempo: why a 120 Hz fight runs long

2026-09-25. Follows `2026-09-25-physics-rate-2.md`. **Question:** at t120 (solver and control at
120 Hz, Havok's ideal step held at 1/240), a bout runs about 40 % longer and deals about 30 % less
damage per second than at s240. Do blows arrive slower, or does the game read the same blows
lower? Does a servo-gain pass at 120 close the gap, and at what cost in cover overshoot? If the
cause is the reading, is there a reading that does not depend on the rate?

**Answer:** it is the reading. Blades arrive just as fast at 120 and reach contact just as often,
but a contact is scored from the velocity the blade has **after** the solver step that found it,
and at 120 the solver takes more of it away. The same 9-13 m/s blow bites 59.3 % of the time at
240 and 41.7 % at 120. A servo-gain pass closes the length of the fight only by throwing the blade
harder, and at the gain that closes it (1.5) the wrist blade's cover overshoots by 345 mm against
188. Scoring from the velocity the blade carried **into** the step, times a fixed fraction, is
rate-invariant. With a fraction of 0.6, a t120 bout is as long as an s240 bout (paired Δ ln s
+0.043 ± 0.149), and so is an s240 bout under the same reading (−0.005 ± 0.104 against the
shipped build). The fix is in the tree as `CONFIG.combat.contactReading: "arrival"`, off by default
and bit-identical when off. Two differences at 120 do not come from the reading: the brawler falls
over 1.5-1.8x as often, and under the new reading the miser does worse at 120 than at 240.

## Setup

Unless a table says otherwise, **harness:** the Node research runner (`research/runner.mjs`),
`stat-sweep --stat weight --levels 1 --pairs 96`. That is 192 bouts per set, over the four
`PROBE_MINDS` (champion, duelist, brawler, miser). Both corners are stone default golems, with
supported locomotion, a 150 s cap and seed 20260923, on 16 worker lanes. Every set runs the same
192 bout ids. So a set is **paired** against another bout by bout. An interval is the 95 %
interval of the mean paired difference. Δ ln s is the paired difference in ln(bout seconds).

| name | solver step | Havok ideal step | servo gain | contact reading |
|---|---|---|---|---|
| s240 | 1/240 | 1/240 | 1 | settled (shipped) |
| t120 | 1/120 | 1/240 | 1 | settled |
| u120 | 1/120 | 1/120 | 1 | settled |
| t120gX | 1/120 | 1/240 | X (1.25, 1.5, 2) | settled |
| s240aK / t120aK | as s240 / t120 | | 1 | arrival, fraction K (0.60, 0.55) |

The gain is `SERVO_TUNING.gainScale`, which scales every `JointServo` (arm core, wrist, head,
torso). The rate, gain and reading were set by a preload (`.review/tempo/hz.mjs`, not committed).

**The contact log** is a second preload (`.review/tempo/probe.mjs`). It wraps `Combat.attach`,
`resolve` and `parried`, and writes one line per contact:

- what `Combat` scored (speed, closing speed, damage, and whether it bit);
- the event's `distance` and `impulse`;
- the striker's velocity cached by a read-only `onBeforePhysicsObservable` observer. This is
  `preClosing`: the closing speed the blade carried into the step.

It changes no outcome. The s240 set run with it is bout-for-bout identical to the previous study's
rate2-s240 (192 of 192), and t120 reproduces that study's t120.

## 1. The bout-level gap

**Harness:** the Node research runner, as in Setup. Rates are pooled over all bout seconds.
"Real blows" is the runner's count. **Paired vs s240:**

| set | median s | p10 / p90 s | damage/s | real blows/s | knockdowns/min | severs/bout | Δ ln s | Δ damage/s | Δ knockdowns/bout |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| s240 | 14.95 | 6.67 / 35.48 | 0.786 | 7.71 | 2.70 | 1.39 | — | — | — |
| t120 | 21.82 | 9.43 / 57.67 | 0.555 | 7.43 | 3.05 | 1.30 | +0.345 ± 0.137 | −0.408 ± 0.217 | +0.50 ± 0.42 |
| u120 | 9.68 | 3.35 / 21.67 | 1.176 | 10.23 | 2.92 | 1.31 | −0.483 ± 0.153 | +0.746 ± 0.297 | −0.25 ± 0.26 |

t120 runs e^0.345 = 1.41x as long as s240. u120 is the opposite: it runs 0.62x as long, and bloodier.
The only difference between t120 and u120 is Havok's ideal step, so the ideal step alone moves a
bout's length by a factor of 2.3. The arms do not account for that. This is the first sign that
the solver's answer to a contact matters more than the drive.

## 2. Blows arrive as fast and as often; they are read lower

**Harness:** the Node research runner with the contact log. These are blade contacts only. An
"attack" is a stroke the mind began. A "bite" is a real blow, one that reached the damage model
and did damage.

| set | attacks/s | blade contacts/s | contacts per attack | bites/s | bites per attack | damage per bite |
|---|---:|---:|---:|---:|---:|---:|
| s240 | 2.195 | 6.812 | 3.104 | 1.560 | 0.711 | 0.458 |
| t120 | 2.097 | 6.273 | 2.992 | 1.157 | 0.552 | 0.430 |
| u120 | 2.422 | — | — | 2.090 | 0.863 | 0.510 |

Strokes start at the same rate, and each reaches contact as often (3.10 against 2.99 contacts
per attack). What changes is how many contacts become blows: 0.711 bites per attack against
0.552. The real blade blows arrive at the same speed: mean `preClosing` is 8.90 m/s at s240 and
8.82 at t120. The fastest arrivals (13 m/s and up) are, if anything, more frequent at 120: 0.544
per bout second against 0.503.

**By arrival speed.** Each cell gives, per bout second, the contacts arriving in that band; the
share of them that bit; the mean read (scored closing speed over `preClosing`); and the damage
per contact.

| preClosing, m/s | s240 | t120 | u120 bit % / read |
|---|---|---|---|
| 4-6 | 0.644 /s, 39.1 %, read 0.538, 0.132 | 0.547 /s, 31.0 %, read 0.463, 0.099 | 48.8 % / 0.699 |
| 6-9 | 0.644 /s, 52.7 %, read 0.509, 0.230 | 0.524 /s, 40.6 %, read 0.451, 0.181 | 57.4 % / 0.634 |
| 9-13 | 0.506 /s, 59.3 %, read 0.478, 0.357 | 0.490 /s, 41.7 %, read 0.369, 0.194 | 64.4 % / 0.567 |
| 13+ | 0.503 /s, 66.4 %, read 0.432, 0.398 | 0.544 /s, 44.5 %, read 0.323, 0.283 | 66.6 % / 0.483 |

The same blow reads lower at t120 in every band, and the gap widens with speed. At 13 m/s and up,
t120 bites 44.5 % of the time against s240's 66.4 %. u120 reads higher than both.

**Why.** Havok's contacts are speculative. A contact event is raised for a pair that is still
apart: the median reported `distance` of a real blade blow is 35.5 mm at s240 and 61.7 mm at t120,
and the median `impulse` is 0. The event reaches `Combat` after the solver step, and `velocityAt`
reads the blade after the solver has answered the contact. How much speed that answer leaves
depends on the gap, measured against how far the blade travels in one step.

**Harness:** the Node research runner with the contact log. Blade contacts arriving at 4 m/s or
more are binned by dist / (preClosing × dt). Each cell gives the share of contacts in the bin and
their mean read. Bins that hold under 1 % of contacts at every rate are left out.

| dist / (v dt) | s240 | t120 | u120 |
|---|---|---|---|
| 0-0.25 | 3.4 %, 0.157 | 7.8 %, 0.126 | 4.0 %, 0.188 |
| 0.25-0.5 | 14.3 %, 0.167 | 18.6 %, 0.171 | 15.2 %, 0.213 |
| 0.5-0.75 | 19.9 %, 0.309 | 22.9 %, 0.223 | 21.2 %, 0.385 |
| 0.75-1 | 21.5 %, 0.554 | 21.3 %, 0.496 | 22.3 %, 0.643 |
| 1-1.5 | 21.7 %, 0.778 | 17.6 %, 0.766 | 22.8 %, 0.907 |
| 2+ | 12.9 %, 0.496 | 7.6 %, 0.430 | 8.5 %, 0.565 |

Two effects combine:

- **More contacts land where the read is lowest.** At 120 a step covers twice the distance, so
  more contacts are found within half a step of closing: 26.4 % at t120 against 17.7 % at s240.
- **Within a bin, the read depends on the ideal step.** At the same gap, t120 reads lower than
  s240 and u120 reads higher. Havok sizes its contact response for the ideal step. Held at 1/240
  while the real step is 1/120, the response is too stiff and removes more of the blade's speed.
  Set to 1/120 as well, it removes less than s240 does.

The reading therefore measures the solver as well as the blow. That is why the ideal step alone
moves a bout's length by a factor of 2.3.

## 3. The gain pass

**Harness:** the Node golem bench (`tests/harness/golem-bench.mjs`), one module on the stand. The
columns are s240, then t120 at gain 1, 1.25, 1.5 and 2. Stray is in mm, peak in m/s, parry
arrival in s and parry overshoot in mm.

| module | measure | s240 | t120 | ×1.25 | ×1.5 | ×2 |
|---|---|---:|---:|---:|---:|---:|
| wrist blade | stroke stray | 37.9 | 48.8 | 44 | 52 | 23.5 |
| | stroke peak | 18.14 | 18.7 | 18.45 | 20.71 | 23.86 |
| | parry arrival | 0.204 | 0.258 | 0.292 | 0.35 | 0.467 |
| | parry overshoot | 188 | 268 | 328 | 345 | 406 |
| wrist plate | stroke stray | 7.7 | 35.6 | 35.1 | 34.7 | 34.8 |
| | parry overshoot | 17 | 40 | 55 | 72 | 108 |
| wrist mace | parry overshoot | 43 | 54 | 105 | 136 | 141 |
| wrist fist | parry overshoot | 0 | 4 | 8 | 20 | 64 |
| reach blade | stroke stray | 13.7 | 20.3 | 18.9 | 17.5 | 16.2 |
| | parry overshoot | 0 | 0 | 0 | 13 | 63 |
| skeletal blade | stroke stray | 46.5 | 61.6 | 61.8 | 63.2 | 66.9 |
| | parry overshoot | 19 | 36 | 72 | 108 | 143 |
| skeletal maul | parry overshoot | 164 | 201 | 206 | 201 | 220 |
| wrist whip | peak tip | 19.6 | 12.5 | 12.6 | 17.8 | 21.5 |

The anatomical (human) blade and mace do not respond to the knob. Their arm is driven by
`HUMAN_ARM_DRIVE.response`, not by a `JointServo`, and their 120 Hz rows equal t120 at every gain.

Raising the gain makes every cover overshoot more, and it does not bring the parry arrival back.
The wrist blade arrives at 0.204 s at s240, 0.258 s at t120 and 0.467 s at ×2: the extra gain
makes it overshoot and come back.

**Harness:** the Node research runner, as in Setup. **Paired vs s240.** 13+ /s and the 9+ bite %
come from the contact log.

| set | median s | damage/s | Δ ln s | Δ damage/s | Δ real blows/s | Δ knockdowns/bout | 13+ m/s arrivals /s | bite % at 9+ m/s |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| t120 | 21.82 | 0.555 | +0.345 ± 0.137 | −0.408 ± 0.217 | −0.738 ± 0.321 | +0.50 ± 0.42 | 0.544 | 42-45 |
| t120g125 | 18.68 | 0.615 | +0.167 ± 0.146 | −0.231 ± 0.243 | −0.740 ± 0.374 | +0.35 ± 0.34 | 0.653 | 42-49 |
| t120g15 | 16.72 | 0.680 | +0.083 ± 0.150 | −0.086 ± 0.235 | −0.343 ± 0.395 | +0.43 ± 0.38 | 0.662 | 42-49 |
| t120g2 | 15.20 | 0.851 | −0.164 ± 0.174 | +0.585 ± 0.467 | −0.152 ± 0.394 | +0.28 ± 0.30 | 0.748 | 42-49 |

For reference, s240 has 0.503 arrivals per second at 13 m/s and up, and bites 59-66 % of what
arrives at 9 m/s or more.

At 1.5 the gap in length and damage per second closes to within the noise. It closes the wrong
way:

- The arm flings the blade harder: 13 m/s arrivals rise from 0.544 to 0.662 per second.
- The read stays where it was: a blow of 9 m/s or more still bites 42-49 % of the time at every gain.
- Real blows per second are still 0.343 ± 0.395 lower than at s240, although that interval
  includes zero.
- The price is the covers in the bench table: the wrist blade overshoots by 345 mm against 188, the
  plate by 72 against 17, the mace by 136 against 43, and the skeletal blade by 108 against 19.

At ×2 the length overshoots (Δ ln s −0.164 ± 0.174), and the lower tail is short: p10 is 4.27 s
against 6.67. **The gain pass is not recommended.**

## 4. A reading that does not depend on the rate

`CONFIG.combat.contactReading: "arrival"` (in `src/combat.ts`) makes `Combat` do two things:

- Before every solver step, on `onBeforePhysicsObservable`, it caches each solid striker's linear
  and angular velocity.
- At a contact, it scores the rigid-body velocity at the contact point from that cache: `v + w × r`,
  with `r` taken from the striker's centre of mass.

This is the velocity the blade brought to the step, so it does not depend on how the solver
answered the contact. It is multiplied by `arrivalReadFraction`. Projectiles already score a cached
free-flight velocity and are left alone. The impossible-speed refusal still reads `velocityAt`.

**Choosing the fraction.** All the logged s240 contacts were re-scored offline under an arrival
reading. The settled reading keeps about 0.58 of an arrival on average:

| fraction | bites vs settled | damage vs settled | shove vs settled |
|---|---:|---:|---:|
| 0.60 | 1.10x | 1.09x | 0.97x |
| 0.55 | 0.98x | 0.89x | — |

**Harness:** the Node research runner, as in Setup.

| set | median s | damage/s | blade bites/s | bites per attack | damage per bite | Δ ln s vs s240 | Δ damage/s vs s240 | winner agreement vs s240 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| s240 | 14.95 | 0.786 | 1.560 | 0.711 | 0.458 | — | — | — |
| t120 | 21.82 | 0.555 | 1.157 | 0.552 | 0.430 | +0.345 ± 0.137 | −0.408 ± 0.217 | 102/192 |
| s240a60 | 15.45 | 0.900 | 1.965 | 0.867 | 0.433 | −0.005 ± 0.104 | +0.371 ± 0.349 | 123/192 |
| t120a60 | 15.30 | 0.879 | 1.903 | 0.829 | 0.432 | +0.037 ± 0.140 | +0.874 ± 0.868 | 100/192 |
| s240a55 | 19.55 | 0.684 | 1.718 | 0.752 | 0.376 | +0.253 ± 0.111 | +0.042 ± 0.275 | 124/192 |
| t120a55 | 17.73 | 0.721 | 1.837 | 0.831 | 0.368 | +0.200 ± 0.144 | +0.516 ± 0.740 | 103/192 |

**Paired t120aK vs s240aK:**

| fraction | Δ ln s | Δ damage/s | Δ real blows/s | Δ knockdowns/bout |
|---|---:|---:|---:|---:|
| 0.60 | +0.043 ± 0.149 | +0.50 ± 0.99 | −0.21 ± 0.33 | +0.42 ± 0.43 |
| 0.55 | −0.053 ± 0.147 | +0.47 ± 0.84 | −0.21 ± 0.34 | +0.40 ± 0.55 |

What this shows:

- **The reading closes the length gap.** Under the same reading, 120 and 240 fights are the same
  length within ±0.15 in ln s, where the settled reading leaves +0.345. Per bite they are identical
  as well: 0.433 against 0.432 damage at 0.60, and 0.376 against 0.368 at 0.55.
- **Bites line up by arrival speed.** In the contact log, the share of contacts that bite in each
  band is the same at both rates: at 0.60, 99.7 % of 9-13 m/s arrivals bite at 240 and at 120.
- **The damage-per-second intervals are wide.** Under arrival they reach ±0.87, against ±0.22
  settled. The cause is a few very short bouts. t120a60 and t120a55 each have four bouts that end
  at 1.08 s, with per-bout rates up to 41.4 damage/s; the shortest in s240 and s240a60 are two
  bouts at 0.90 s, and in t120 one at 2.03 s. The centre does not move. Median per-bout damage/s is
  1.06 at s240a60 and 1.12 at t120a60, and pooled damage/s agrees to within 3 % (0.900 against
  0.879).
- **Winner agreement measures chaos, not balance.** Any two different builds agree on 99-124 of
  192 winners, including t120 against s240. So 123/192 for s240a60 is not a large change in its own
  right; the per-mind table in section 6 is where the balance is read.
- **Which fraction.** 0.60 keeps the shipped 240 fight's length (−0.005 ± 0.104) at 1.15x its pooled
  damage per second. 0.55 keeps its damage per second (+0.042 ± 0.275) and runs 1.29x as long.
  Neither reproduces the settled 240 build exactly, because the settled reading's noise is part of
  what the minds were tuned against.

**Bit-identity.** Under the default `"settled"`, `Combat` builds no cache and adds no observer, and
the scored velocity is the same `velocityAt` copy as before. Re-run with the final code
(set s240chk), all 192 bouts match tempo-s240 exactly, including winners, seconds and per-mind
scores.

**Cost.** Under `"arrival"`, each solid striker costs one linear and one angular read through the
plugin per substep, about 400 B by the figures in `AGENTS.md`. With the default reading the cost
is zero.

**Test.** `tests/contact-reading.test.mjs` strikes a real standing golem through `Combat` with a
hand-made contact. The blade carries (0, 0, 9) m/s and (4, 0, 0) rad/s into a pre-step
notification and leaves at (0, 0, 2). The test asserts that settled scores 2, and that arrival scores
the fraction times the 9.8 m/s closing speed, at fractions 1 and 0.6. The test was mutation-checked:
disabling the cache turns it red, and so does dropping `w × r`.

## 5. The wrist maul's parry

The previous study's single parry overshoot for the wrist maul was 62 mm at s240, 304 mm at r120
and 326 mm at r240. It is not a stable number.

- **Across and up.** A grid over the parry's `across` and `up` travel, at ×0.9, ×1 and ×1.1 each,
  showed that `across` changes nothing for the maul: its rows repeat exactly.
- **Cover time.** A second grid varies the cover time (0.55, 0.6 and 0.65 s) against `up` (×0.8 to
  ×1.2). That is 15 trials per configuration.
- **It never settles.** Arrival reads 3.90-3.98 s everywhere, s240 included, which is the end of
  the probe window: the maul never comes to rest on its mark.

**Harness:** the Node golem bench, `runParryBench` for `effector.wrist.maul`. Overshoot is in mm.

| config | min | q25 | median | q75 | max | mean | at the default cover (0.6 s, up ×1) |
|---|---:|---:|---:|---:|---:|---:|---:|
| s240 | 14 | 83 | 194 | 298 | 427 | 206 | 62 |
| t120 | 1 | 21 | 460 | 469 | 482 | 316 | 460 |
| t120g125 | 101 | 150 | 179 | 359 | 413 | 236 | 109 |
| t120g15 | 26 | 45 | 235 | 256 | 302 | 183 | 259 |
| t120g2 | 220 | 297 | 351 | 395 | 422 | 346 | 297 |

**The spread depends on the cover time more than on the rate.**

- At s240, the 0.55 s cover overshoots by 298-427 mm, the 0.6 s cover by 14-113 and the 0.65 s cover
  by 135-236.
- At t120 the modes are swapped: 452-482 mm for the 0.55 and 0.6 s covers, and 1-26 for 0.65 s.

The shipped figure of 62 is a draw from a bimodal distribution with a mean of 206. At t120 the
default cover happens to land in the high mode (460), and gain 1.5 brings the mean to 183, as low
as s240's. The maul is a chaotic cover that does not settle at any rate. It needs its own fix,
which the rate cannot provide: the parry probe should report arrival within the window, and the
maul's cover needs damping. A single trial of it should not be quoted again.

## 6. What the reading does not explain

**Harness:** the Node research runner, as in Setup. Score is 1 for a win and 0.5 for a draw, over
each mind's 96 sides. Intervals are paired over the same bout slots.

| mind | s240 | t120 | s240a60 | t120a60 | t120a60 − s240a60 | t120a60 − s240 | t120g15 − s240 |
|---|---:|---:|---:|---:|---:|---:|---:|
| champion | 58.3 | 64.6 | 57.3 | 64.6 | +7.3 ± 13.8 | +6.3 ± 14.2 | −4.2 ± 13.3 |
| duelist | 52.1 | 49.0 | 37.5 | 44.8 | +7.3 ± 13.4 | −7.3 ± 12.4 | −8.3 ± 10.7 |
| brawler | 49.0 | 55.2 | 49.0 | 62.5 | +13.5 ± 14.7 | +13.5 ± 14.7 | +16.7 ± 13.2 |
| miser | 40.6 | 31.3 | 56.3 | 28.1 | −28.1 ± 13.2 | −12.5 ± 13.4 | −4.2 ± 14.5 |

Shown with harness and configuration; knockdowns are counted on the side that fell.

| set | brawler knockdowns/min | brawler time down | others' knockdowns/min |
|---|---:|---:|---:|
| s240 | 2.26 | 5.8 % | 0.86-1.16 |
| t120 | 3.47 | 12.9 % | 0.43-1.25 |
| s240a60 | 2.09 | 5.1 % | 0.63-1.15 |
| t120a60 | 3.71 | 12.9 % | 0.28-0.65 |
| u120 | 1.91 | 5.2 % | 0.90-1.30 |

- **The knockdown excess at t120 belongs to the brawler, and the reading does not touch it.** The
  brawler falls 1.5-1.8x as often at t120 and spends 12.9 % of the bout on the ground against 5.1-5.8 %
  at 240, under either reading. At u120 it falls no more than at 240. The paired knockdown excess
  (+0.50 ± 0.42 a bout settled, +0.42 ± 0.43 under arrival) is this effect. It points at supported
  locomotion or the push response under a stiff contact at 120, which is the ideal-step effect again,
  but on the feet. That has not been measured.
- **Under arrival, the miser depends on the rate.** At s240a60 it gains 15.6 ± 13.1 on the shipped
  build (56.3 against 40.6). At t120a60 it loses 28.1 ± 13.2 against its own 240 set. The settled
  t120 drop was −9.4 ± 13.3, inside the noise. The cause is not identified. Its own knockdowns do
  not move (0.63 and 0.65 per minute).
- **u120 moves the same two minds the same way**: duelist −13.5 ± 13.5 and miser +17.7 ± 11.5
  against s240. The miser does well in every set where a larger share of contacts bite (u120,
  s240a60, s240a55), except t120 under arrival.

## Recommendation

1. **Do not close the tempo gap with the servo gain.** At the gain that closes it (×1.5), the
   covers of the wrist blade, plate and mace and of the skeletal blade overshoot 1.8x to 5.7x as far
   as at s240. The gain throws the blade harder rather than correcting the reading.
2. **If the physics rate goes to 120, switch the contact reading to `"arrival"` at 0.60 at the same
   time.** It is the only change measured here that makes a 120 fight the same length as a 240 fight
   under the same rules (Δ ln s +0.043 ± 0.149). It holds the shipped 240 fight's length
   (−0.005 ± 0.104) at 1.15x its pooled damage per second. It is a balance change in its own right,
   because it moves the duelist and the miser at 240 by about 15 points each, so it is the owner's
   decision. The code is landed with `"settled"` as the default, bit-identical to the build before it.
3. **Before 120 ships, measure the brawler's falls at t120** in the Node locomotion bench and the
   push path. It is the largest difference between the rates that the reading leaves in place.

## Open

- **The brawler's knockdowns at t120:** 3.5-3.7 a minute against 2.1-2.3 at 240, under either
  reading. Not attributed.
- **The miser at t120 under arrival:** −28.1 ± 13.2 against its own 240 set. Not attributed; 96
  sides a mind is a thin sample, so replicate it on fresh seeds first.
- **The damage-per-second intervals** under arrival are wide (±0.87 at t120a60), because of the
  heavy tail of fast bouts at 120. A 384-bout replicate would bound the rate.
- **The whip** still loses a third of its peak tip at t120 (12.5 m/s against 19.6), and gain 2
  restores it only by overdriving everything else. This is the previous study's section 6, and it
  is unchanged here.
- **The wrist maul's cover** does not settle at any rate (section 5).
- **Raw data** is in `research/runs/tempo-*` and `.review/tempo/out/contacts-*`, and the scripts in
  `.review/tempo/`. None of it is committed.
