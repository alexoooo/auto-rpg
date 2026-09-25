# Rate and control clock: the 0.35 s severs at 120 Hz physics and 60 Hz control

2026-09-25. Follow-up to `2026-09-25-physics-rate-2.md`, sections 5 and 7. **The question:** at
120 Hz physics (ideal step 1/240) with a mind deciding at 60 Hz, 27 of 192 bouts ended inside
3 s, 24 of them at exactly 0.35 s. What causes it, and what is the fix?

**Answer.** It is not a control-clock defect, and it is not on main.

- **It was one event, counted 24 times.** All 24 bouts are the brawler~miser pairing, every one
  of them, on both sides and every seed. The first 0.73 s of a bout does not depend on the seeds,
  and the arena is mirror-exact, so every bout of one pairing plays the same opening. At r120/c60
  that opening's first cut severed the miser's shin. The set held 10 openings, not 192.
- **It needs the exact servo discretisation, which is not on main.** It needs neither the
  halved physics rate nor anything in the host's hold. The exact filter at 240 Hz physics with
  60 Hz control cuts the same shin (16.6 m/s, 185 J). On main at 120/c60, no bout ends before
  0.5 s. The brawler~miser bouts there run 3.2 to 71 s.
- **The host's hold is an exact zero-order hold.** A bout with the host deciding at 60 Hz is
  bit-identical to one deciding at 120 Hz through a mind that asks the real one every second call
  and repeats its intent in between. That includes the severing cut when the exact filter is on.
- **The hypothesised double count exists in the code but reaches nothing.** The host handed a
  decision's whole interval (`dt * every`) to `apply` as well as to the mind. `apply` runs once
  per substep, so anything it integrated would have counted the interval on the decided substep
  and again on each held one. `Golem.applyIntent` does not read its duration (`void dt`), and
  every per-substep integration takes the substep `dt` in `afterLocomotion`. The fix splits the
  two durations. It changes no bout: all 192 rows of every rerun set are identical to the rows
  before it.
- **The paired intervals ignore this clustering.** Clustered by mind pairing, none of the c60
  differences in either study is significant. That includes the -0.75 real blows/s at t120/c60
  on main.

Every figure is Node and headless, and each names its harness. Rates were set by a preload
(`.review/rc/hz.mjs`, not committed) that writes `CONFIG.world.physicsHz`, `solverTuningHz` and
`controlHz` before any harness module reads them. Worker threads inherit it. Names follow the
earlier analysis:

| name | physics step | ideal step | servo and command filter |
|---|---|---|---|
| **s240** | 1/240 | 1/240 | shipped (explicit Euler) |
| **t120** | 1/120 | 1/240 | shipped |
| **r120**, **r240** | 1/120, 1/240 | 1/240 | exact discretisation (`SERVO_TUNING`, branch `physics-rate-servo-tuning` only) |

`/cN` is the control clock, a decision every `physicsHz / N` substeps.

## 1. Where `dt` goes on the control path

`stepControlledPair` in `src/control-host.ts`, on a substep due a decision, called
`driver.step(dt * every)`. `GolemDriver.step` in `src/golem/golem-control.ts` passed that one
number to the mind and to `apply`:

```ts
step(dt: number): void {
  if (!this.active || !this.canStep()) return;
  this.apply(dt, this.mind.decide(this.view, dt));
}
```

The mind should be told the interval, because that is how long its decision stands. `apply`
should not be, because it runs on every substep: the held substeps call `hold(dt)` with the plain
substep. So on the decided substep, `apply` was told the whole interval, and on each held substep
after it, one substep more. Anything that integrated over `apply`'s `dt` would have counted
`every` substeps on the first, then one on each held one: `2 * every - 1` substeps of time for
every `every` substeps of physics.

What `apply` does with it, traced:

- `GolemControlEndpoint.driverFor` wraps it. It records the intent, notifies the observer, then
  calls `Golem.applyIntent(dt, intent)`. Neither of the first two takes a duration.
- `Golem.applyIntent` narrows the intent onto its five modules and ends in `void dt`.
- Every module's `command` is a level write with no duration. The arm core stores `wanted`
  (`buildArmCore` in `src/golem/effectors/chains/arm-core.ts`). The wrist stores `wantedRoll` and
  `wantedBend`. The head stores `wantedPitch`, and starts a lunge on the thrust *edge* against
  `thrustHeld`, so re-applying a held thrust does not re-trigger it. The torso and locomotion
  modules store their commands the same way. The carrier request is staged again each substep,
  which it has to be because `beginControlStep` clears it.
- Every integration that uses a duration runs in `Golem.afterLocomotion(dt)` with the substep:
  `stepToward` and the anchor ramp in the arm core, `slewTowards` in the wrist and the head, each
  `JointServo.track`, the head's lunge phase clock, the gait and `endSubstep`.

**So the double count was real in the contract and dead in behaviour.** It is fixed anyway,
because the next thing to integrate inside `apply`, such as a command filter moved up from a
module, would have inherited it silently.

## 2. The trace

Node bout runner, `golem-brawler` (left) against `golem-miser`, seeds 2158207037/3265167439,
supported locomotion. It shows the brawler's first blade contact on the miser's right leg. The
peak tip is the brawler's primary blade tip, the finite difference of `effectorView().tip` per
substep, from 0.10 to 0.334 s.

| setting | code | first leg contact | speed | energy | kind, damage | peak tip before it |
|---|---|---|---:|---:|---|---:|
| s240 | main | thigh, 0.333 s | 8.84 m/s | 8.65 J | weak, 0 | 16.18 m/s |
| s240/c60 | main | thigh, 0.333 s | 8.85 | 0.11 | weak, 0 | 18.09 |
| t120 | main | thigh, 0.317 s | 7.97 | 1.78 | weak, 0 | 18.93 |
| t120/c60 | main | thigh, 0.333 s | 7.40 | 3.45 | weak, 0 | 18.11 |
| r240 | servo branch | thigh, 0.333 s | 9.31 | 8.60 | weak, 0 | 18.54 |
| **r240/c60** | servo branch | **shin, 0.333 s** | **16.61** | **184.8** | cut, 2.16 | 16.77 |
| r120 | servo branch | thigh, 0.333 s | 10.73 | 7.66 | weak, 0 | 18.62 |
| **r120/c60** | servo branch | **shin, 0.333 s** | **19.49** | **309.6** | cut, 3.67, **severed** | 16.37 |

What it shows:

- **It is the same swing every time.** The blade peaks between 16.2 and 18.9 m/s in all eight
  settings. The severing one, r120/c60, is second slowest. What changes is where the swing meets
  the leg. It either meets the thigh with the slow inner blade, or the shin with the fast outer
  blade, and that turns on millimetres.
- **The halved rate is not needed.** r240/c60 cuts the same shin. It does not sever there: 2.16
  damage at 16.6 m/s, against 3.67 at 19.5.
- **Held commands are not needed either, in the sense the earlier analysis meant.** Replacing the
  host's hold with a mind-side zero-order hold (the host decides every substep at 120 Hz, and a
  wrapper asks the real mind on every second call, telling it two substeps, and repeats its
  intent in between) gives a trace bit-identical to r120/c60. That covers 0.4 s: 151 lines of
  per-substep arm state, decisions and hits, the sever included. The same holds on main, where
  t120/c120 with that wrapper is bit-identical to t120/c60. What the sever needs is **a 60 Hz
  decision stream through the exact filter**, and at n = 1 even that is one draw and not a rule.
- The trace script is `.review/rc/trace2.mjs` (not committed). The servo-branch rows applied
  `git diff main physics-rate-servo-tuning` to a scratch tree with `SERVO_EXACT=1 FILTER_EXACT=1`.

## 3. Why one opening became 24 bouts

The same brawler~miser pairing, t120/c60 on main, run with three seed pairs (2158207037/3265167439,
1/2, 987654321/123456789). Every per-substep arm reading and every decision is identical until the
brawler's decision at 0.733 s, and the arm traces first differ at 0.742 s. Nothing seeded reaches
a decision before then. Both bodies are built symmetric, 2.6 m apart, so swapping sides changes
nothing either.

`research/stat-sweep.mjs` plays each pairing 24 times: 12 blocks, each played on both sides. In
the r120/c60 set, all 24 brawler~miser bouts end at 0.350 s, with the brawler dealing 3.67
damage and the miser none. Every other study set's count of early endings moves in ones and
twos. This one moved by a whole pairing:

| set (study sets from `2026-09-25-physics-rate-2.md`) | bouts < 3 s | < 0.5 s | brawler~miser bout lengths |
|---|---:|---:|---|
| s240 | 3 | 0 | 5.9 to 44.2 s |
| s240/c60 | 4 | 0 | 1.0 to 54.9 s |
| t120 | 1 | 0 | 4.3 to 84.1 s |
| r120 | 8 | 0 | 0.9 to 45.4 s |
| r120/c60 | 27 | **24** | **0.35 s, all 24** |
| t120/c60 on main (this study) | 5 | 0 | 3.2 to 71.4 s |

Without that one pairing, r120/c60 is indistinguishable from r120. Paired by bout id over the
other 168 bouts:

- Δ ln(seconds) +0.022 ± 0.152;
- Δ damage/s -0.006 ± 0.205;
- Δ real blows/s +0.19 ± 0.36.

The 0.35 s p10 and the +0.85 damage/s in section 4 of the earlier analysis were this one opening.

**The intervals in that analysis, and the unclustered ones below, assume 192 independent bouts.**
The opening shows they are not. Every bout of a pairing shares up to 0.7 s of history, and when
that history decides the bout, it counts once per bout. The right-hand column below clusters by
unordered mind pairing: 10 clusters, with a t interval on 9 degrees of freedom. It is what a
conclusion at this n should be read against.

## 4. Bouts, before and after the fix

`research/stat-sweep.mjs --stat weight --levels 1 --pairs 96 --workers 6`, run seed 20260923:
PROBE_MINDS (champion, miser, brawler, duelist), stone default golems, supported locomotion, 150 s
cap, side-split. That is 192 bouts per set, on the same job list in every set, so bout *i* in
one set is paired with bout *i* in another. Node bout runner, in worker lanes. "Before" is main at
f580bc4. "After" is the fix commit. Each set is paired against the same-physics full-rate control.
"Rows = before" compares whole result rows with the same set before the fix. A row holds the
winner, seconds, per-side damage, hits, blocks, severs, descriptors and engagement.

| set | bouts < 3 s | < 0.5 s | median s | p10 s | damage/s | rows = before | vs control: Δ ln(seconds) | Δ damage/s | Δ real blows/s | clustered ±: ln s, damage/s, blows/s |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 120/c120 control, before | 1 | 0 | 21.82 | 9.43 | 0.555 | | | | | |
| 120/c120, after | 1 | 0 | 21.82 | 9.43 | 0.555 | 192/192 | 0 | 0 | 0 | |
| 120/c60, before | 5 | 0 | 20.32 | 7.25 | 0.572 | | -0.110 ± 0.154 | +0.181 ± 0.215 | -0.752 ± 0.359 | ±0.179, ±0.296, ±1.037 |
| 120/c60, after | 5 | 0 | 20.32 | 7.25 | 0.572 | 192/192 | -0.110 ± 0.154 | +0.181 ± 0.215 | -0.752 ± 0.359 | ±0.179, ±0.296, ±1.037 |
| 240/c240 control, before | 3 | 0 | 14.95 | 6.67 | 0.786 | | | | | |
| 240/c120, before (study set) | 5 | 0 | 15.52 | 6.27 | 0.755 | | -0.000 ± 0.136 | +0.020 ± 0.244 | -0.114 ± 0.339 | ±0.187, ±0.259, ±0.401 |
| 240/c120, after | 5 | 0 | 15.52 | 6.27 | 0.755 | 192/192 | -0.000 ± 0.136 | +0.020 ± 0.244 | -0.114 ± 0.339 | ±0.187, ±0.259, ±0.401 |
| 240/c60, before | 4 | 0 | 17.55 | 7.03 | 0.732 | | +0.083 ± 0.132 | -0.153 ± 0.210 | -0.149 ± 0.346 | ±0.129, ±0.310, ±0.248 |
| 240/c60, after | 4 | 0 | 17.55 | 7.03 | 0.732 | 192/192 | +0.083 ± 0.132 | -0.153 ± 0.210 | -0.149 ± 0.346 | ±0.129, ±0.310, ±0.248 |
| *context: r120/c60 vs r120 (study, servo branch)* | 27 | 24 | 20.28 | 0.35 | 0.570 | | -0.395 ± 0.213 | +1.132 ± 0.468 | -1.179 ± 0.612 | ±0.938, ±2.518, ±3.036 |

The 120 rows have an ideal step of 1/240, so they are t120 in the earlier analysis's naming. The
240/c120 "before" is the earlier study's set. Main reproduces that study row for row at s240,
s240/c60 and t120, so it stands for main. 240/c240 was not rerun after the fix: at `every = 1`
the new call is the old one.

What the tables say:

- **The fix is bit-identical at every rate measured.** Each after set reproduces its before set
  row for row. So does 240/c120, against the earlier study's s240/c120. At `controlHz ===
  physicsHz` it is bit-identical by construction as well: `every` is 1, and `step(dt, dt)` is the
  old `step(dt)`. The main sets at s240, s240/c60 and t120 also reproduce the earlier study's
  rows exactly, so main is the study branch at those settings.
- **At 120 Hz physics, 60 Hz control no longer shows the artefact.** On main it ends 5 bouts
  inside 3 s against the control's 1, and none inside 0.5 s. With the pairing clustered, no
  column differs from 120/c120.
- **t120/c60 real blows/s: -0.75 ± 0.36 unclustered, and ±1.04 clustered.** Without
  brawler~miser it is -0.35 ± 0.35. Real blows are every contact that is not `weak`, slaps
  included. So this is not established. If it is wanted, it needs more pairings or more minds,
  not more seeds.

## 5. The fix

`InstalledDriver.step(dt, decisionSeconds?)` in `src/control-host.ts`. `stepControlledPair` calls
`driver.step(dt, dt * every)` on a due substep. `GolemDriver.step(dt, decisionSeconds = dt)` tells
the mind `decisionSeconds` and applies with `dt`. A driver with no `hold` is still stepped with
the substep alone, as before.

`tests/control-clock.test.mjs` pins it with two tests:

- **`a_decision_is_told_its_interval_and_each_substep_applies_one_substep`.** A stub pair on real
  `GolemControlEndpoint`s, at 120 Hz physics and 60 Hz control, over six substeps. The view is
  published on alternate substeps. The mind is asked three times, each time told two substeps.
  `apply` is called six times, each for one substep, and holds each decision for two.
- **`holding_a_command_is_a_zero_order_hold_of_the_mind`.** Node bout runner, 240 Hz physics,
  brawler against miser, 0.45 s through the opening cut. Every part of both golems is compared on
  every substep, between the host at every 2 and at every 4, and the same mind repeating itself
  at full rate. The two must be bit-identical. The full-rate run without the hold must differ, as
  a control that the window is long enough for the decisions to matter.

Mutated, one change at a time (`.review/rc/mutate.sh`):

| mutation | interval test | zero-order-hold test |
|---|---|---|
| the fix reverted (`driver.step(dt * every)`) | **red** | green, as it must be: `apply`'s duration is unread |
| the mind told the substep, not the interval | **red** | **red** |
| `hold` re-applies nothing | **red** | **red** |
| `beginSubstep` moved behind the decision in `Golem.observe` | green | green, even over 1.5 s |

The last row is a gap, not a pass. In this opening, a root velocity one substep old moves
nothing, so the per-substep placement of `beginSubstep` is not pinned by either test.

`tests/recorder.test.mjs`'s `every_driver_records_the_intent_immediately_after_deciding` pins the
decide-then-apply line as text. Its pattern now names `decisionSeconds`.

## 6. Left open

- **`GolemDriver.hold` with nothing held.** A driver installed on a substep that is not due (a
  takeover while `controlHz < physicsHz`) decides at once. It decides on a view that was not
  republished that substep, and it is told one substep rather than the time to the next decision.
  At the shipped `controlHz` every substep is due, so this cannot happen today.
- **The per-substep `beginSubstep`** is not pinned (section 5).
- **Seed-independent openings.** Every bout of a pairing plays the same first ~0.7 s, so any
  per-bout count of early events is a count of pairings. The earlier memo that every bout opens
  with a free blade clash is the same fact seen from the other side. Two ways out: cluster by
  pairing in every bout-set comparison, or make the seeds reach the opening (a seeded spawn
  jitter or settle). The second changes every recorded number and is the owner's call.
- **Whether 60 Hz control costs real blows at 120 Hz physics** (section 4) is not established
  either way.
- **The earlier recommendation against 60 Hz control on 120 Hz physics** rested on this artefact.
  On main, nothing in these sets supports it.
