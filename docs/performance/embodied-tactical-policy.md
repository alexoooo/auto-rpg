# The tactical embodied policy

**Purpose:** Record what the strike planner scored the day it was first put behind the embodied seam, what reading the incoming blade did to it, and what tuning its feet did — so that no session in this topic tunes against a memory, and so that the one that deletes `articulated_tactics.rs` does not delete a measurement with it. Three sessions, in the order they landed; the sections are not merged, because each is the control the next is measured against.
**Status:** current
**Canonical source:** this record, [`crates/policy/src/embodied_tactics.rs`](../../crates/policy/src/embodied_tactics.rs), [`crates/policy/src/embodied_guard.rs`](../../crates/policy/src/embodied_guard.rs), [`crates/policy/src/embodied_footwork.rs`](../../crates/policy/src/embodied_footwork.rs), and [architecture: policy](../architecture/policy.md#the-embodied-registry-and-why-its-build-cannot-fail)
**Update when:** `TacticalEmbodiedPolicy`, `GuardRead`, `StrikePlanner`, `Footwork`, `embodied-duel-v1`, or the corpus shape changes.

# Session 02: the first outing

**Host:** MSVC x86-64, Windows 10, AMD Ryzen 9 3950X, 16 cores / 32 threads. **Date:** 2026-08-18.

Reproduce with:

```powershell
cargo run --release -p lab -- embodied --seeds 400 --mirrored --policy tactical
cargo run --release -p lab -- embodied --seeds 400 --mirrored --hero-policy tactical --monster-policy scripted
cargo run --release -p lab -- embodied --seeds 400 --mirrored --hero-policy scripted --monster-policy tactical
cargo run --release -p lab -- embodied --seeds 400 --mirrored --hero-policy tactical --monster-policy neutral
```

The four the session owed. Five controls were run beside them and are in the table
below, because without them none of the four can be read — see
[why the controls are not optional](#why-the-controls-are-not-optional).

```powershell
cargo run --release -p lab -- embodied --seeds 400 --mirrored --policy neutral
cargo run --release -p lab -- embodied --seeds 400 --mirrored --policy scripted
cargo run --release -p lab -- embodied --seeds 400 --mirrored --hero-policy neutral --monster-policy tactical
cargo run --release -p lab -- embodied --seeds 400 --mirrored --hero-policy scripted --monster-policy neutral
cargo run --release -p lab -- embodied --seeds 400 --mirrored --hero-policy neutral --monster-policy scripted
```

Every number here is a pure function of the fixture, the seeds and the two policies, so
nothing is bracketed or quoted as a range. The only wall-clock figures are the run times,
and they are reported for scale rather than as a measurement.

**The `tactical` rows in this first half are no longer reproducible, and that is not a
defect in them.** Session 03 gave registry code `3` a guard, so `--policy tactical` today
runs a different mind from the one measured here — and `tactical-fixed-guard` is not the
old one either, because the control holds a guard arm where session 02's policy left its
off hand at zero reach and zero effort. Nothing in the registry now reproduces the table
below; it is kept because it is the record of what the planner scored with no guard at
all, which is what the second half of this document is measured against.
[Session 03](#session-03-the-guard-that-watches) has its own commands and its own
numbers.

## The corpus

`embodied-duel-v1` — fingerprint `0x1a1e8e74eecd55d5` canonical and
`0x95b6b5f9bc80865d` mirrored across `y = 8` — 400 seeds in each orientation, 800 trials
per matchup, bounded at the fixture's own 3,600 ticks. A fight that reaches the clock is
scored on points, to whichever side is holding more of the health it started with
(`World::timeout`), so an untouched body that never swings still beats an attacker who
has taken a scratch.

The two sides are **not** the same body. "Fighter" is the hero and "brute" the monster,
and they carry different anatomies and different equipment. That asymmetry is why the
result for a policy is only meaningful **pooled across both sides**.

## Outcomes

Wins are counted from the raw `outcomes` and `sides` lines. `commands` read
`0 refused submissions` in every one of the nine runs.

| Heroes | Monsters | Fighter wins | Drawn | Brute wins | Ticks mean | Decided by a body |
|---|---|---|---|---|---|---|
| neutral | neutral | 0 | 800 | 0 | 3600.0000 | 0 (0.0%) |
| scripted | scripted | 704 | 0 | 96 | 3531.4937 | 62 (7.8%) |
| tactical | tactical | 723 | 0 | 77 | 3596.2987 | 2 (0.2%) |
| tactical | scripted | 692 | 1 | 107 | 3585.0262 | 10 (1.2%) |
| scripted | tactical | 765 | 0 | 35 | 3562.4824 | 41 (5.1%) |
| tactical | neutral | 768 | 31 | 1 | 3597.1612 | 1 (0.1%) |
| neutral | tactical | 91 | 622 | 87 | 3600.0000 | 0 (0.0%) |
| scripted | neutral | 786 | 0 | 14 | 3563.3624 | 29 (3.6%) |
| neutral | scripted | 266 | 88 | 446 | 3584.5412 | 8 (1.0%) |

Pooling each pair of asymmetric arms, which is what cancels the fighter/brute advantage:

| Matchup, pooled over 1,600 trials | Wins | Losses | Draws |
|---|---|---|---|
| **tactical vs neutral** | **855 (53.44%)** | 92 (5.75%) | 653 (40.81%) |
| tactical vs scripted | 727 (45.44%) | 872 (54.50%) | 1 (0.06%) |
| scripted vs neutral | 1232 (77.00%) | 280 (17.50%) | 88 (5.50%) |

## The one claim this session owed

**Tactical beats the neutral control, and by a wide margin.** On the command the plan
names — `--hero-policy tactical --monster-policy neutral` — it wins 768 of 800 trials
against a single loss and 31 draws. Pooled across both sides it wins 855 of 1,600 against
92, which is a 9.3:1 ratio. That is the floor the retired legacy seam asserted under the
name `doing_something_beats_doing_nothing`, and the embodied seam now clears it.

## The result nobody was allowed to tune away

**Tactical loses to the embodied script**, 727 to 872 pooled, which is 45.4% against
54.5%. No acceptance threshold was declared for this session and this is why: the planner
has never seen hips. It was written against articulated bodies with no stance, and an
embodied body has a torso the hips constrain and a twist budget that forces a step. It
asks for turns the stance phase clamps, and a clamped turn is a plan arriving late.

The measured shape of that is not a refusal. **`commands` read `0 refused submissions` in
every run**, so nothing about the clamping is visible at the submission boundary at all —
the world accepts the turn and simply does not deliver it. What it costs shows up in
decisiveness instead:

| | tactical vs tactical | scripted vs scripted |
|---|---|---|
| Fights decided by a body | 2 of 800 (0.2%) | 62 of 800 (7.8%) |
| Severances | 89 | 649 |
| Contact resolutions | 1,098,018 | 1,632,844 |
| Weapon/shield blocks | 73,926 (6.73%) | 210,574 (12.90%) |
| Mean ticks | 3596.2987 | 3531.4937 |
| Fighter / brute end health | 0.9697 / 0.8882 | 0.8706 / 0.6059 |

Tactical fights are longer, quieter and far less often finished by a body. It lands
one severance for every seven the script lands.

**It also swings in a narrower band.** The `guard` line reports commanded attack-height
by guard-height pairs in `CombatHeight` order `[low, mid, high]`:

```
tactical  attack x guard [[0, 43312, 0], [1, 37561, 0], [0, 0, 0]], diagonal 46.44% of 80874
scripted  attack x guard [[15029, 14104, 0], [0, 14578, 13806], [13514, 0, 15176]], diagonal 51.95% of 86207
```

The planner commands low and mid and never high, and it guards mid and effectively
nothing else; the script uses all three bands in both roles. Read that column with one
caveat: `height_index` counts only exact `LOW`/`MID`/`HIGH` matches and drops everything
between, so a policy that commands off-band heights is undercounted rather than
misplaced. The 80,874 against 86,207 total is consistent with a little of that.

## Why the controls are not optional

Two of the five change how the four required runs read.

**`--policy neutral` is 800 draws and 0 wins**, at 1.0000 mean health on both sides. So
the fixture has no intrinsic side bias when nobody acts, and every "fighter wins" number
above is produced by the policies rather than by the spawn.

**But the fixture does have a side bias once somebody swings**: two instances of the
*same* script give the fighter 704 of 800. That is the anatomy and the equipment, not the
mind, and it is exactly why a single asymmetric arm cannot be quoted as a policy's win
rate. `--hero-policy tactical --monster-policy scripted` alone reads 692–107 in
tactical's favour; the mirror arm reads 35–765 against it. Only the pool is about the
policies.

**A neutral body can win on points**, which reads as a bug and is not one.
`neutral` against `scripted` gives the standing fighter 266 wins, because `World::timeout`
scores on remaining health and a body that is merely standing there is still holding a
weapon: the attacker collects the damage of its own approach. It is worth knowing before
reading the 40.81% draw rate in the pooled tactical-versus-neutral row as failure — 622 of
those draws come from the arm where tactical drives the brute, and a draw there is
"neither body's health moved", not "tactical was beaten".

## What is not measured here

The sculpted fixture. Every run above is `embodied-duel-v1`; `--slope` was not run for
this policy, because the elevation term the slope corpus exists to measure belongs to
`ScriptedEmbodiedPolicy` and `StrikePlanner` has no such term to switch off. A tactical
number on the slope would be a number about the floor, and this record is about the
planner.

Wall clock, for scale only: each 800-trial run took 7.5 s to 14.3 s on the host above,
fanned out over `available_parallelism()`.

# Session 03: the guard that watches

**Host:** MSVC x86-64, Windows 10, AMD Ryzen 9 3950X, 16 cores / 32 threads. **Date:** 2026-08-18.

Everything above this heading is the policy as session 02 landed it: a strike planner
with **no guard at all**, its off hand left in the planner's neutral row at zero reach
and zero effort. This section measures the guard session 03 gave it — a read of the
nearest observed blade — against the same policy holding the same arm, at the same reach
and the same effort, permanently on its own centre line.

Reproduce with:

```powershell
cargo run --release -p lab -- embodied --seeds 400 --mirrored --hero-policy tactical --monster-policy tactical-fixed-guard
cargo run --release -p lab -- embodied --seeds 400 --mirrored --hero-policy tactical-fixed-guard --monster-policy tactical
cargo run --release -p lab -- embodied --seeds 400 --mirrored --policy tactical
cargo run --release -p lab -- embodied --seeds 400 --mirrored --policy tactical-fixed-guard
```

The first two are the assignments the session plan names. The last two are the symmetric
runs, and they are not optional: the pooled asymmetric number has a *control* on one side
of every counted pair, so it is a blend by construction and cannot be compared with the
script's symmetric 52.06% baseline. Both readings are below, and **both miss**, so
nothing here turns on which one is quoted.

## The four runs, verbatim

**Verbatim now, and it was not before.** The block that shipped here was trimmed: it
dropped both header lines, the `max energy excess` clause of `contacts`, the
`max weapon-body energy raw` clause of `blows`, the whole `seed 0` block and the wall
clock, and it wrapped the one-line `guard` row onto two. None of that changed a number,
and a heading that says verbatim has to be verbatim or the next reader cannot use the
block to tell whether a run reproduced. Re-run on 2026-08-18 against the repaired
session, and every counted column is identical to what the session recorded; only the
wall-clock lines differ, because they are the only quantity here that is not a pure
function of the fixture, the seeds and the two policies.

```text
400 seeds x 2 orientations = 800 trials of embodied-duel-v1 under the tactical embodied policy against the tactical embodied policy with the guard read off (control)
fixture   0x1a1e8e74eecd55d5 canonical, 0x95b6b5f9bc80865d mirrored across y=8.0000
outcomes  2 fighter kills, 2 brute kills, 0 mutual, 796 on points, 0 drawn
clock     4/800 decided by a body (0.5%), 796 reached tick 3600 (99.5%)
sides     fighter wins 359 canonical, 374 mirrored, difference 15 (3.75 percentage points)
fights    3589.8549 ticks mean, 3600.0000 median
health    fighter ends on 0.9703 mean, brute on 0.8859 mean
contacts  1380543 resolutions, 13908 cap hits, max energy excess raw 0 over 66 refused ticks (first EnergyNumerator)
blocked   253318 weapon/shield (18.35% of resolutions), 976203 weapon/body, 151022 weapon/weapon
guard     attack x guard [[0, 42056, 0], [8207, 28168, 274], [0, 0, 0]], diagonal 35.79% of 78705 commanded pairs
blows     96 severances, max weapon-body energy raw 29087, worst tick took 17.8840 health
commands  0 refused submissions
seed 0    EmbodiedV1/1 0x0695698b4008a76c  script 0x766b8fbbc3710b3f
          3600 ticks, Decision(Heroes), 2418 contacts
          12.99s wall

400 seeds x 2 orientations = 800 trials of embodied-duel-v1 under the tactical embodied policy with the guard read off (control) against the tactical embodied policy
fixture   0x1a1e8e74eecd55d5 canonical, 0x95b6b5f9bc80865d mirrored across y=8.0000
outcomes  5 fighter kills, 0 brute kills, 0 mutual, 795 on points, 0 drawn
clock     5/800 decided by a body (0.6%), 795 reached tick 3600 (99.4%)
sides     fighter wins 379 canonical, 375 mirrored, difference 4 (1.00 percentage points)
fights    3596.4024 ticks mean, 3600.0000 median
health    fighter ends on 0.9709 mean, brute on 0.8536 mean
contacts  1288559 resolutions, 9029 cap hits, max energy excess raw 0 over 48 refused ticks (first EnergyNumerator)
blocked   212021 weapon/shield (16.45% of resolutions), 930998 weapon/body, 145540 weapon/weapon
guard     attack x guard [[31561, 8973, 28], [6632, 30216, 68], [0, 0, 0]], diagonal 79.73% of 77478 commanded pairs
blows     128 severances, max weapon-body energy raw 71642, worst tick took 17.2073 health
commands  0 refused submissions
seed 0    EmbodiedV1/1 0x32cced910f0cdda7  script 0xbb9b0c0bfb0e778d
          3600 ticks, Decision(Heroes), 1050 contacts
          13.38s wall

400 seeds x 2 orientations = 800 trials of embodied-duel-v1 under the tactical embodied policy
fixture   0x1a1e8e74eecd55d5 canonical, 0x95b6b5f9bc80865d mirrored across y=8.0000
outcomes  4 fighter kills, 2 brute kills, 0 mutual, 794 on points, 0 drawn
clock     6/800 decided by a body (0.8%), 794 reached tick 3600 (99.2%)
sides     fighter wins 373 canonical, 383 mirrored, difference 10 (2.50 percentage points)
fights    3585.1224 ticks mean, 3600.0000 median
health    fighter ends on 0.9668 mean, brute on 0.8523 mean
contacts  1365578 resolutions, 13587 cap hits, max energy excess raw 0 over 65 refused ticks (first EnergyNumerator)
blocked   254672 weapon/shield (18.65% of resolutions), 970095 weapon/body, 140811 weapon/weapon
guard     attack x guard [[31316, 8838, 18], [14311, 22681, 328], [0, 0, 0]], diagonal 69.68% of 77492 commanded pairs
blows     133 severances, max weapon-body energy raw 45407, worst tick took 17.4797 health
commands  0 refused submissions
seed 0    EmbodiedV1/1 0x174695d5a44e7896  script 0x0d9c994c311b8d48
          3600 ticks, Decision(Monsters), 2118 contacts
          13.04s wall

400 seeds x 2 orientations = 800 trials of embodied-duel-v1 under the tactical embodied policy with the guard read off (control)
fixture   0x1a1e8e74eecd55d5 canonical, 0x95b6b5f9bc80865d mirrored across y=8.0000
outcomes  1 fighter kills, 1 brute kills, 0 mutual, 796 on points, 2 drawn
clock     2/800 decided by a body (0.2%), 798 reached tick 3600 (99.8%)
sides     fighter wins 366 canonical, 366 mirrored, difference 0 (0.00 percentage points)
fights    3595.1337 ticks mean, 3600.0000 median
health    fighter ends on 0.9721 mean, brute on 0.8846 mean
contacts  1268794 resolutions, 10087 cap hits, max energy excess raw 0 over 41 refused ticks (first EnergyNumerator)
blocked   216599 weapon/shield (17.07% of resolutions), 902159 weapon/body, 150036 weapon/weapon
guard     attack x guard [[0, 42369, 0], [1, 36704, 0], [0, 0, 0]], diagonal 46.42% of 79074 commanded pairs
blows     97 severances, max weapon-body energy raw 28952, worst tick took 13.8177 health
commands  0 refused submissions
seed 0    EmbodiedV1/1 0xca648597fd2aafc7  script 0x9118f30459b87114
          3600 ticks, Decision(Heroes), 1554 contacts
          13.27s wall
```

## The preregistered guard threshold: `revise`

| quantity | script baseline | fixed-guard control | read guard | acceptance |
|---|---:|---:|---:|---:|
| guard diagonal, symmetric | 52.06% | 46.42% | **69.68%** | at least 70% |
| guard diagonal, pooled asymmetric | — | — | **57.59%** | at least 70% |

**Missed, by 0.32 percentage points.** 69.68% of 77,492 commanded pairs is 53,997
diagonal; 70% would have been 54,244. The shortfall is **247 pairs out of 77,492**.

The threshold is not weakened, the policy is not enlarged, and no constant is retuned to
close it. Both constants this session owns were fixed on arithmetic off `sim`'s published
actuator rates **before** any corpus was run, and they stay where they are:
`GUARD_READ_DEADBAND_RAW = 3_277` and `GUARD_COMMIT_TICKS = 13`.

Pooling the two assignments gives 89,945 diagonal pairs of 156,183, which is 57.59% —
lower, and it has to be, because half of every pooled table's defenders are the control
sitting at MID. That arm of the comparison is the one the session plan names; it is
reported here because it was asked for, not because it is the number the threshold is
about.

**Two counting caveats bear on this number. Both are stated rather than leaned on, and
neither is offered as a reason the threshold was really met.**

**The instrument drops pairs.** `lab embodied`'s `height_index` counts a pair only when
*both* commanded heights are exactly `LOW`, `MID` or `HIGH`; anything between is dropped
and the table's total falls. The read guard commands exact bands by construction — that
is why `embodied_guard::band` exists at all — but the pairs where rules 2 and 3 stand the
guard aside leave `StrikePlan::height`, a continuous fraction, in the arm, and those are
dropped. The symmetric subject counted 77,492 pairs against the control's 79,074:
**1,582 fewer**, which is six times the 247-pair shortfall. So the miss is well inside
what the counter is throwing away, and that is a reason to distrust the instrument rather
than a reason to claim the number. It is recorded as a miss.

**And roughly half of every counted guard is a bare hand.** This one was missing from
the record entirely until a review of the landed session found it.
[`crates/lab/src/main.rs`](../../crates/lab/src/main.rs) fills the guard column from
`command.articulated.arms[1 - roles.weapon].height`, and `Scenario::articulated_duel`
gives the Brute `equipment: [Some(3), None]` — a club in the right hand and **nothing in
the left**. On that body the guard column is the commanded height of an empty hand, which
cannot block anything: there is no plate on it, and `REST_REACH` deliberately holds it in
at the joint's own floor rather than out in the line, because an extended empty arm is a
torso-grade interceptor and not a guard. So the diagonal is not "how often a plate met a
cut". It is *how often the two commanded heights agreed*, over a population in which
about half the defenders have no plate to command.

That cuts both ways and neither way rescues the number. It means the instrument is softer
than "guard diagonal" sounds, and it means the same softness is in the 52.06% script
baseline and in the 46.42% control, which is what keeps the three comparable. What it
rules out is reading 69.68% as a blocking rate. `an_empty_guard_hand_is_held_at_the_joints_own_floor`
is the test that now covers that branch at all; nothing did before.

## What the read bought, and what it cost

**It raised blocks and it did not win more fights.**

| pooled over 1,600 trials | read guard | fixed-guard control |
|---|---:|---:|
| wins | 779 (48.69%) | 821 (51.31%) |
| end health, mean of the two roles | 0.9120 | 0.9284 |
| weapon/shield resolutions, symmetric run | 254,672 (18.65%) | 216,599 (17.07%) |
| fights decided by a body, symmetric run | 6 of 800 | 2 of 800 |
| severances, symmetric run | 133 | 97 |

Reading the blade moves the plate into 38,073 more weapon/shield resolutions across the
symmetric pair — a real, one-and-a-half-point rise in the share of contact the plate
takes — and the fighter running it still finishes **42 wins behind** the control over
1,600 pooled trials and 1.6 points of health worse off. That is a wash, and on the wrong
side of it.

The most likely reading, stated as a hypothesis and not as a result: a guard arm at full
effort tracking a blade is an arm that is *moving*, and `bill_fatigue_with_com_delta`
bills on the change in speeds, while the control's arm is converged, idle at entry, and
recovering fatigue every tick. Nothing here measures that, and the corpus prints no
fatigue column; a session that wants the answer has to publish one or drive a probe. The
honest summary of this table is that **more blocking did not buy a better fight**, and
the retired high-ground term is the standing precedent for writing that down rather than
tuning until it agrees.

## Four departures from the session plan, and one correction to its rationale

None was found by running the corpus. **The count read "two" here, "three" in the plan
and "three" in the code, and the three lists were not the same list** — a review of the
landed session reconciled them at four and found the fourth. They are in
[`embodied_guard.rs`](../../crates/policy/src/embodied_guard.rs)'s header in full; the
short forms:

**1. `GUARD_COMMIT_TICKS` is 13 and not the plan's 12**, off `sim`'s two published
actuator rates.

**2. Rule 1 is a range gate, and two of the plan's three cases are not implemented.** The
plan asked for the read to be gated on "something is coming" — *receding, stationary, or
further away than a stride* — with `contact_timing` leaving its saturating one as the
test. Only the third case landed. The measurement that rules the other two out is in
[its own section below](#nothing-published-can-tell-an-approach-from-a-retreat).

**3. The guard arm is `1 - weapon` and not `ArmRoles::guard`**, which is the same arm
`embodied_script.rs` assembles a guard into and the same arm `lab embodied` reads.

**4. Rule 3 stands the guard aside for `TacticalPhase::Chamber` as well as
`TacticalPhase::Commit`.** The plan names the commit alone. **This one shipped
undocumented and untested**: dropping `Chamber` from the `matches!` left all thirteen of
the session's tests green. It is kept rather than reverted because every number above was
measured with it in place, and `a_chambered_cut_is_not_overwritten_by_a_guard` is now what
fails when it is dropped. **The chamber half was never separately measured** — no arm of
this comparison isolates it, and a session that wants to know what it is worth has to run
the guard with and without it.

**And one correction to the plan's rationale, which is not a departure: a blade's tip and
its hilt are at the same height, by construction.**
`combat::geometry::segment_pose` builds the tip as the hilt plus
`(cos, sin, ZERO) * length`. Measured 2026-08-18: with the height read changed from
`blade.tip.z` to `blade.hilt.z`, **the entire workspace test suite passed** — no test
anywhere could tell the two ends apart, because no fixture, equipment row or actuator in
this repository can pose a segment off the horizontal. "Read the tip and not the hilt" is
a real, testable claim about the *bearing* and the *range*, and an unfalsifiable one
about the height. `the_guard_reads_the_tip_and_not_the_hilt` now asserts all three, with
the third built on a hand-slanted segment and labelled as covering a shape no fight can
currently produce.

## Nothing published can tell an approach from a retreat

**This is a measured negative result about the observation channel, not about session
03**, and it will outlive this plan set. Session 04 is chartered to give the fighter
footwork and measure discipline, which are exactly the decisions that want a closing
judgement, so it is recorded here at length rather than left in a policy file's header.

Two columns look like they could answer "is this body coming at me", and neither can at
the shipped stats of `embodied-duel-v1`.

**`contact_timing` is a coin flip as a boolean.** `World::observe_articulated` blurs it by
`jitter[6] * noise / 8` on *both* branches of its formula — the saturating branch included
and deliberately so, because "nothing is closing" is a judgement like any other — and
`Rng::signed_unit` is symmetric over `[-1, 1)`. A genuinely saturated column therefore
reads strictly below one on about half of all ticks at **every** range. (This record named
the type `Pcg32::signed_unit`; there is no such symbol. The type is
[`Rng`](../../crates/fx/src/rng.rs), which is a PCG32 under a name that does not say so.)

**Recomputing the sim's own `closing` term does not rescue it**, which is the obvious next
idea. The formula at `World::observe_articulated` is
`(subject_velocity - opponent_velocity) . normalize(delta)`, and its sign is exactly the
judgement rule 1 wanted; the scalar blur above is applied afterwards and a policy that
recomputes the term never touches it. But the *velocity* it consumes is already blurred:
`ObservedOpponent::body_velocity` is the true velocity plus `jitter[3..5] * noise / 4`.
The magnitudes decide it:

| quantity | value |
|---|---:|
| `Stats::move_speed`, Fighter (agility 6) | 0.0537 world units per tick |
| `Stats::move_speed`, Brute (agility 2) | 0.0457 |
| whole achievable range of true closing speed | **±0.0994** |
| velocity error per axis, Fighter's eye (perception 6 → noise 0.9) | **±0.225** |
| velocity error per axis, Brute's eye (perception 3 → noise 1.2) | **±0.300** |

The noise is 2.3x to 3.0x the entire signal range. Measured rather than argued, over
9,689 decision ticks of twenty seeds of `embodied-duel-v1` driven by
`TacticalEmbodiedPolicy`, comparing the recomputed sign against `World::articulated_pose`
ground truth. **It is a landed test and not a one-off sweep** —
`no_published_column_separates_an_approach_from_a_retreat` in
[`crates/policy/tests/closing_channel.rs`](../../crates/policy/tests/closing_channel.rs)
drives the same twenty seeds on every `cargo test`, so this table is reproducible rather
than remembered, and it is bounded from both sides: the sign must be no better than a coin
flip *and* no worse, because a reliably wrong column would be readable inverted:

```text
agreement with the truth                                     51.59%
truly closing, read as closing                               55.50%
truly NOT closing (receding or stationary), read as closing  49.47%
inside the guard's own range gate                            51.29% / 49.39%
ticks whose |true closing| clears the 0.225 noise            1 of 9,689 (0.01%)
```

**And no deadband rescues it**, which was the specific hope. Sweeping a threshold on the
observed closing term:

| deadband | truly-closing admitted | truly-not-closing admitted |
|---|---:|---:|
| 0 | 55.50% | 49.47% |
| 0.1 | 32.11% | 26.66% |
| 0.225 | 9.84% | 5.78% |

There is no threshold that admits real approaches and rejects retreats, because the signal
never leaves the noise floor: above the noise the gate refuses nine approaches in ten, and
below it the gate is a coin flip. A rule-1 gate built on this would re-roll the guard's
band every `GUARD_COMMIT_TICKS` on a random draw, which is precisely the chatter
`GUARD_READ_DEADBAND_RAW` exists to prevent.

**The limit is these two bodies' eyes, not the engine.** `Stats::perception_noise` is
`(15 - perception) / 10`, so a body at perception 12 or better carries a velocity term
under the closing range and could make the judgement honestly. The Fighter is 6, the Brute
3, and the arithmetic is held from both sides by
`the_closing_judgement_rule_1_asks_for_is_under_the_noise_it_would_read` in
`embodied_guard.rs` — it asserts that the noise swamps the signal for both fixture eyes
*and* that it stops doing so at perception 12, so the claim cannot quietly become a claim
about the observation model.

What would have to change for a closing judgement to be implementable: a quieter velocity
term than a quarter of the positional noise, a longer baseline than one tick (a policy
integrating observed range over many ticks, which costs memory the deadband design was
chosen to avoid), or a published closing scalar that is not re-blurred on the way out.
**Session 04 must not add any of them** — [the overview](../plans/fight-00-overview.md)
forbids a new perception channel in this topic, and that is a separate topic with its own
measurement. [Navigation and visibility](../design/navigation-visibility.md) owns what
such a channel would take.

## What is not measured here either

The sculpted fixture, for the section above's reason, and **fatigue**, which the
paragraph above says is the first thing a session chasing this result should publish.

Wall clock, for scale only: on the 2026-08-18 re-run the four 800-trial runs took
12.99 s, 13.38 s, 13.04 s and 13.27 s on the host above, fanned out over
`available_parallelism()`. The session that first ran them recorded 13.0 s to 13.3 s.

# Session 04: the fight that ends, and does not

**Host:** MSVC x86-64, Windows 10, AMD Ryzen 9 3950X, 16 cores / 32 threads. **Date:** 2026-08-19.

This is the session carrying [the overview's preregistered
acceptance](../plans/fight-00-overview.md#what-reasonably-played-is-declared-before-it-is-measured).
**All four rows miss and all four are recorded `revise`.** Two of them miss by a
factor rather than by a margin, and the section that matters most here is
[the arithmetic that says why](#the-finding-two-of-the-four-rows-are-not-reachable-by-a-policy).

Everything above this heading is session 03's policy: a strike planner with a
guard that reads the incoming blade, and the *articulated* measure numbers it was
given in session 02 without ever being tuned for a body with hips. This section
measures what tuning the feet against `embodied-duel-v1` did.

**Read the section on [how the shipped point was chosen](#how-the-shipped-point-was-chosen-and-the-objective-that-was-got-wrong-once)
before any sweep table below.** The first version of this record swept on an
objective the session plan does not declare, and shipped a different point than
the plan's own words pick. The correction moved one constant.

Reproduce with:

```powershell
cargo run --release -p lab -- embodied --seeds 400 --mirrored --policy tactical
cargo run --release -p lab -- embodied --seeds 400 --mirrored --hero-policy tactical --monster-policy scripted
cargo run --release -p lab -- embodied --seeds 400 --mirrored --hero-policy scripted --monster-policy tactical
cargo run --release -p lab -- embodied --seeds 400 --mirrored --slope --policy tactical
cargo run --release -p lab -- embodied --corpus-digest
```

Every sweep row below is the first of those with one flag added:

```powershell
cargo run --release -p lab -- embodied --seeds 400 --mirrored --policy tactical --footwork margin,floor,lunge,unwind
```

**That flag did not exist while the sweeps were first run**, and its absence was
the defect that made this whole record unauditable: session 04 swept its four
constants by editing [`embodied_footwork.rs`](../../crates/policy/src/embodied_footwork.rs)
and rebuilding, so not one published table could be reproduced from any command
the repository ships. `--footwork` takes the four numbers as ratios or decimals,
in the order margin, floor, lunge, unwind; it reaches the two registry entries
that drive a `StrikePlanner`, and refuses a run by name when neither side has
one. Every table below was re-measured through it, and **every row of the four
tables session 04 published reproduced to the resolution**, which is what says
the flag spells the same numbers the constants do.

The `--slope` run is not part of the acceptance and is run anyway, on the session
plan's argument: a fighter tuned only on flat ground that falls apart on the
sculpted fixture was tuned to a fixture rather than to a game.

## What "before" means here, and how it was reproduced exactly

Session 03's landed policy is not reachable from a command line any more --
registry code `3` is this session's fighter. Every "before" number below is
`--footwork 1/10,3/5,0,2`: the articulated standoff and floor, no lunge, and an
unwind threshold above the clamped range of `ObservedStance::twist_fraction`, so
the read never fires. That reproduces session 03's symmetric run **to every
counted column** -- 970,095 weapon/body, 133 severances, 69.68% of 77,492
commanded pairs, 3585.1224 ticks mean -- which is what says the parameterisation
itself changed nothing and the "before" column is the policy it claims to be.

**Setting the embodied row byte-equal to `Footwork::ARTICULATED` does not do
that**, and an earlier draft of `embodied_footwork.rs`'s header said it did.
`Footwork::unwind_twist` is gated on `ObservedStance::present`, which is false on
a body with no legs and true on one with hips, so the articulated row *does* fire
on an embodied body: `--footwork 1/10,3/5,0,7/8` gives 974,691 weapon/body and
130 severances rather than 970,095 and 133. The claim is corrected in place
rather than deleted, because the shape of the error -- a control that is a
control on one model and not on the other -- is the thing worth remembering.

## The five runs, verbatim

```text
400 seeds x 2 orientations = 800 trials of embodied-duel-v1 under the tactical embodied policy
fixture   0x1a1e8e74eecd55d5 canonical, 0x95b6b5f9bc80865d mirrored across y=8.0000
outcomes  6 fighter kills, 0 brute kills, 0 mutual, 794 on points, 0 drawn
clock     6/800 decided by a body (0.8%), 794 reached tick 3600 (99.2%)
sides     fighter wins 383 canonical, 383 mirrored, difference 0 (0.00 percentage points)
fights    3591.5312 ticks mean, 3600.0000 median
health    fighter ends on 0.9651 mean, brute on 0.8033 mean
contacts  995750 resolutions, 8066 cap hits, max energy excess raw 0 over 49 refused ticks (first EnergyNumerator)
blocked   146354 weapon/shield (14.70% of resolutions), 726226 weapon/body, 123170 weapon/weapon
guard     attack x guard [[18355, 5725, 6], [25423, 41987, 124], [0, 0, 0]], diagonal 65.86% of 91620 commanded pairs
blows     162 severances, max weapon-body energy raw 64730, worst tick took 16.6786 health
commands  0 refused submissions
seed 0    EmbodiedV1/1 0x4fb797873837f513  script 0xafa422bbcea9b3d5
          3600 ticks, Decision(Heroes), 1402 contacts
          11.47s wall

400 seeds x 2 orientations = 800 trials of embodied-duel-v1 under the tactical embodied policy against the embodied script
fixture   0x1a1e8e74eecd55d5 canonical, 0x95b6b5f9bc80865d mirrored across y=8.0000
outcomes  11 fighter kills, 6 brute kills, 0 mutual, 783 on points, 0 drawn
clock     17/800 decided by a body (2.1%), 783 reached tick 3600 (97.9%)
sides     fighter wins 305 canonical, 309 mirrored, difference 4 (1.00 percentage points)
fights    3563.3662 ticks mean, 3600.0000 median
health    fighter ends on 0.8700 mean, brute on 0.7610 mean
contacts  1601184 resolutions, 15737 cap hits, max energy excess raw 0 over 91 refused ticks (first EnergyNumerator)
blocked   302801 weapon/shield (18.91% of resolutions), 1132148 weapon/body, 166235 weapon/weapon
guard     attack x guard [[14699, 15215, 10272], [14411, 17795, 7642], [4069, 9675, 1628]], diagonal 35.77% of 95406 commanded pairs
blows     432 severances, max weapon-body energy raw 56780, worst tick took 18.0000 health
commands  0 refused submissions
seed 0    EmbodiedV1/1 0x7fd35dc8a1a66569  script 0x15e80f4d47184a1a
          3600 ticks, Decision(Heroes), 1898 contacts
          13.17s wall

400 seeds x 2 orientations = 800 trials of embodied-duel-v1 under the embodied script against the tactical embodied policy
fixture   0x1a1e8e74eecd55d5 canonical, 0x95b6b5f9bc80865d mirrored across y=8.0000
outcomes  37 fighter kills, 0 brute kills, 0 mutual, 763 on points, 0 drawn
clock     37/800 decided by a body (4.6%), 763 reached tick 3600 (95.4%)
sides     fighter wins 387 canonical, 392 mirrored, difference 5 (1.25 percentage points)
fights    3557.9049 ticks mean, 3600.0000 median
health    fighter ends on 0.9538 mean, brute on 0.6609 mean
contacts  1571731 resolutions, 8751 cap hits, max energy excess raw 0 over 28 refused ticks (first EnergyNumerator)
blocked   87243 weapon/shield (5.55% of resolutions), 1305648 weapon/body, 178840 weapon/weapon
guard     attack x guard [[9396, 6054, 1233], [21340, 24161, 14353], [4136, 9679, 2611]], diagonal 38.91% of 92963 commanded pairs
blows     490 severances, max weapon-body energy raw 91212, worst tick took 17.9763 health
commands  0 refused submissions
seed 0    EmbodiedV1/1 0x7820788772d37dd7  script 0x7b39eaddea20f7cf
          3600 ticks, Decision(Heroes), 1963 contacts
          11.69s wall

400 seeds x 2 orientations = 800 trials of embodied-slope-v1 under the tactical embodied policy
fixture   0xf49de9a61f939163 canonical, 0x7f09908444ffa113 mirrored across y=8.0000
outcomes  8 fighter kills, 3 brute kills, 0 mutual, 789 on points, 0 drawn
clock     11/800 decided by a body (1.4%), 789 reached tick 3600 (98.6%)
sides     fighter wins 385 canonical, 385 mirrored, difference 0 (0.00 percentage points)
fights    3581.8162 ticks mean, 3600.0000 median
health    fighter ends on 0.9597 mean, brute on 0.7993 mean
contacts  984165 resolutions, 8236 cap hits, max energy excess raw 0 over 53 refused ticks (first EnergyNumerator)
blocked   149307 weapon/shield (15.17% of resolutions), 734896 weapon/body, 99962 weapon/weapon
guard     attack x guard [[17904, 5823, 5], [25371, 42078, 219], [0, 0, 0]], diagonal 65.63% of 91400 commanded pairs
blows     192 severances, max weapon-body energy raw 39697, worst tick took 17.7816 health
commands  0 refused submissions
seed 0    EmbodiedV1/1 0x558e6c27721221b5  script 0x78f3fbc828585fff
          3600 ticks, Decision(Monsters), 1355 contacts
          11.60s wall

corpus    8 seeds x 2 fixtures x 2 orientations = 32 trials, 600 ticks each, under the embodied script
fixture   0x1a1e8e74eecd55d5  embodied-duel-v1 canonical
fixture   0x95b6b5f9bc80865d  embodied-duel-v1 mirrored across y=8.0000
fixture   0xf49de9a61f939163  embodied-slope-v1 canonical
fixture   0x7f09908444ffa113  embodied-slope-v1 mirrored across y=8.0000
digest    0x00e08317d7a31c7c
pinned    0x00e08317d7a31c7c  agrees
          0.12s wall
```

## `weapon/body` per trial, before and after

The session plan named this and not the win rate as the number to watch, and
said what a success would look like: **an order of magnitude down while
severances hold or rise.**

| symmetric, 800 trials | before (session 03) | after (session 04) |
|---|---:|---:|
| weapon/body resolutions | 970,095 | **726,226** |
| weapon/body per trial | 1,212.6 | **907.8** (-25.1%) |
| severances | 133 | **162** (+21.8%) |
| health removed per trial, both roles | 0.1809 | **0.2316** |
| trials decided by a body | 6 (0.8%) | 6 (0.8%) |
| median ticks | 3600 | 3600 |

**Half of the plan's test is met and the half that decides is not.** The rub is
measurably thinner and severances are up by a fifth, and 25.1% is not an order of
magnitude, and the fights end at the same rate they did. Against the script the
same measurement is weaker still, because the script is doing half the rubbing:
pooled over both assignments, weapon/body per trial goes 1,687 to 1,524, a fall
of 9.7%.

## The four preregistered rows: `revise` on all four

| quantity | baseline | before | **after** | acceptance | shortfall |
|---|---:|---:|---:|---:|---|
| trials decided by a body | 8.2% | 0.8% | **0.8%** | at least 50% | 6 of 800 against 400 of 800 |
| median fight length | 3600 | 3600 | **3600** | under 1800 | the median did not move one tick |
| wins against the script, pooled | -- | 40.81% | **39.69%** | at least 60% | 20.31 points, and the change is 1.12 points *backwards* |
| guard diagonal, symmetric | 52.06% | 69.68% | **65.86%** | at least 70% | 4.14 points, and the change is 3.82 points backwards |

No threshold is weakened, no policy is enlarged, and no fighter is promoted. The
constants stay where the plan's own objective puts them; what moves is this
table.

**The win-rate row is the one that could have been chased and was not.** Every
row below is a full 1,600 pooled trials, both assignments, run through
`--footwork`:

| margin, floor, lunge, unwind | tactical wins, pooled | rate |
|---|---:|---:|
| 1/10, 3/5, 0, 7/8 *(`Footwork::ARTICULATED` on a body with hips)* | 654 / 1600 | **40.88%** |
| 1/10, 3/5, 0, unreachable *(session 03, no footwork change)* | 653 / 1600 | 40.81% |
| 1/2, 3/4, 0, 7/8 | 636 / 1600 | 39.75% |
| 1/2, 4/5, 1/4, 1 | 636 / 1600 | 39.75% |
| **1/2, 4/5, 1/2, 7/8** *(shipped)* | **635 / 1600** | **39.69%** |
| 1/2, 4/5, 1/2, 3/4 | 635 / 1600 | 39.69% |
| 1/2, 4/5, 1/4, 7/8 | 625 / 1600 | 39.06% |
| 1/2, 3/4, 1/2, 3/4 | 624 / 1600 | 39.00% |
| 1/2, 3/4, 1/2, 7/8 *(what session 04 first landed)* | 618 / 1600 | 38.63% |
| 1/2, 3/4, 1, 7/8 | 618 / 1600 | 38.63% |
| 1/2, 4/5, 1/2, 15/16 | 618 / 1600 | 38.63% |
| 1/2, 7/8, 1/2, 7/8 | 613 / 1600 | 38.31% |
| 1/2, 3/4, 1/2, 15/16 | 603 / 1600 | 37.69% |
| 1/2, 1, 1/2, 7/8 | 578 / 1600 | 36.13% |
| 0, 3/4, 1/2, 7/8 | 543 / 1600 | 33.94% |
| 0, 4/5, 1/2, 7/8 | 539 / 1600 | 33.69% |

**Nothing in that space reaches 60%, and the best row in it is
`Footwork::ARTICULATED` -- the planner's own pre-session-04 numbers, on a body
with hips.** The record said "the one where this session changed nothing" and
that was two claims, one of them false: the top row is *not* session 03's policy,
because `Footwork::unwind_twist` is reachable on a body with hips and session 03
had no such read at all. The two are 654 and 653 of 1,600, a difference of one
duel, and the session-03 row is the second-best in the space and not the best.
The configuration in the top row had been measured symmetrically and never raced.

The shipped row is 1.19 points below the ceiling. It is shipped anyway, and that
is a decision worth stating rather than burying: the constants are chosen on the
metric [the session plan declares](#how-the-shipped-point-was-chosen-and-the-objective-that-was-got-wrong-once),
which is weapon-on-body contact per trial and not the win rate, and the plan says
in as many words that the win rate is *not* the number to watch. **The cost is
recorded as the miss it is**, and a session that wants the 1.19 points back can
have them by reverting [`Footwork::EMBODIED`](../../crates/policy/src/embodied_footwork.rs)
to the articulated row, at 130 severances instead of 162, 974,691 weapon-on-body
resolutions instead of 726,226, and the fight no more decisive either way.

The guard diagonal moved too, and downward: session 03 recorded 69.68% and
`revise` at -0.32 points, and this session's feet take it to 65.86%. **Session
03's record stands untouched** -- it is the number that policy scored -- and this
row is the number the current one scores. The mechanism is visible in the guard
table's own totals rather than in the percentage, and the counts below are
**summed from the published tables** rather than back-computed from a rounded
percentage, which is how an earlier draft of this paragraph got two of them
wrong:

| | before | after |
|---|---:|---:|
| exact-band pairs counted | 77,492 | 91,620 |
| on the diagonal | 53,997 | 60,342 |
| off it | 23,495 | 31,278 |

Of the 14,128 pairs the standoff added, **6,345 land on the diagonal and 7,783
off it**. A body that holds its measure spends more of the fight in phases where
both arms carry a commanded band, and those extra pairs agree less often than the
ones it was counting before.

**The superseded numbers, since the mistake is the instructive part.** The
earlier draft of this paragraph described the point it shipped then, whose table
was `[[20418, 6650, 9], [22221, 36257, 103], [0, 0, 0]]`, and read off it a
diagonal of 56,671 and 5,492 new off-diagonal pairs. Summed from that table the
diagonal is 20,418 + 36,257 = **56,675** and the new off-diagonal pairs are
**5,488**. Both were back-computed from the rounded 66.16% rather than added up,
which is a four-pair error nobody could have caught by reading the sentence --
and it is the reason the counts above are summed.

## How the shipped point was chosen, and the objective that was got wrong once

**The first version of this record swept on a metric the session plan does not
name**, and it named the substitution in its own text: *"the objective is
severances per ten thousand weapon-on-body contact resolutions, which is the
session plan's own diagnosis metric"*. It is not. The plan's metric, verbatim:

> The number to watch is not the win rate, it is `weapon/body` per trial; if that
> falls by an order of magnitude while severances hold or rise, the fight has
> become a fight.

That is a conjunction on **two absolute quantities**, not a ratio. The difference
is not academic: a ratio of severances to contact can be raised by a fighter that
simply stops touching, which is precisely the failure the sentence's second
clause exists to exclude, and the floor sweep below shows that failure at its two
quietest rows. The two objectives disagree at exactly one of the four
coordinates, and the plan's own reading picks the other value there.

**The rule, stated before it is applied.** Among candidate rows whose severance
count is at least the before state's 133 -- that is the plan's "hold or rise" --
ship the one with the fewest weapon-on-body resolutions per trial. Two
constraints on what counts as a candidate, neither of them invented here:

1. **A value must lie inside its own derived band.** The four bounding tests in
   [`articulated_tactics.rs`](../../crates/policy/src/articulated_tactics.rs)
   enforce bands read off `sim`'s published actuator rates and the fixture's two
   anatomies, never off the corpus, and a shipped value outside one of them fails
   `cargo test -p policy`. The record already disqualified two swept margin rows
   on this ground; applying it consistently disqualifies more.
2. **A margin that does not survive doubling the seed set is a fact about the
   seed set.** The acceptance corpus is 400 seeds by declaration; 800 seeds is a
   control, not a second opinion, and it is used only to reject.

**The admissible set, in full.** The bands are coupled -- the same two
inequalities bound the margin, the lunge and the ceiling on the floor -- so they
have to be evaluated together rather than one table at a time. At the shipped
floor they admit `margin` in `[0.4113, 0.6391]`, `lunge` in `[0.3911, 0.5590]`,
`min_fraction` in `(0.7228, 0.8521]` and `unwind_twist` in `(0.5, 1.0)`. Of the
swept value sets that leaves **one margin (1/2), one lunge (1/2), two floors (3/4
and 4/5) and three unwinds (3/4, 7/8, 15/16)**: a complete six-point grid, and
all six were measured rather than sampled along a path.

| floor | unwind | weapon/body per trial | severances | pooled wins |
|---:|---:|---:|---:|---:|
| 3/4 | 3/4 | 962.0 | 172 | 39.00% |
| 3/4 | 7/8 | 941.5 | 219 | 38.63% |
| 3/4 | 15/16 | 955.2 | 182 | 37.69% |
| 4/5 | 3/4 | 926.1 | 151 | 39.69% |
| **4/5** | **7/8** | **907.8** | **162** | **39.69%** |
| 4/5 | 15/16 | 905.1 | 164 | 38.63% |

All six clear the severance proviso. The lowest weapon/body is `4/5, 15/16`; the
second lowest is `4/5, 7/8`, 0.29% behind it and two severances up.
**Doubling the corpus to 800 seeds reverses that pair**, which is the only reason
the second one ships:

| 800 seeds, 1,600 trials | weapon/body per trial | severances |
|---|---:|---:|
| 1/2, 3/4, 1/2, 7/8 | 951.3 | 396 |
| **1/2, 4/5, 1/2, 7/8** | **903.7** | **345** |
| 1/2, 4/5, 1/2, 15/16 | 908.1 | 339 |
| 1/2, 4/5, 1/2, 3/4 | 923.5 | 329 |

At 1,600 trials `4/5, 7/8` is lower on weapon/body *and* higher on severances
than `4/5, 15/16` -- it dominates it outright, where at 800 trials it was
dominated by it. The floor's move from 3/4 to 4/5, by contrast, holds at both
sizes and by a much larger margin: 941.5 to 907.8 at 800 trials and 951.3 to
903.7 at 1,600, with severances above the proviso at both. **So one constant
moves and three do not**: `MEASURE_MIN_FRACTION_RAW` goes from 49,152 to 52,428.

**Where a coordinate descent goes instead, and why that is not what shipped.**
Ignoring the derived bands and simply minimising weapon/body subject to
severances at or above 133 does not terminate at any interior point: from
`4/5, 7/8` it steps to lunge 1/4 (896.4 per trial, 148 severances), then to
unwind 1 (878.7, 145), and stops there because at the fourth round no single
coordinate move improves on it. Severances slide 162 -> 148 -> 145 for a 3.2%
reduction in rub -- the descent is walking down the constraint, not toward the
objective, and it ends on a lunge of 0.25 and an unwind of 1.0 that **both fail
their own bounding tests**, the first below `[0.3911, 0.5590]` and the second at
the closed end of `(0.5, 1.0)`. That is
what the derived bands are for, and it is why they are part of the rule rather
than a check applied afterwards. All of those rows were measured; they are not
argued.

## A third harness, measured on 2026-08-19, reaches the same verdict

**Session 05 did not set out to measure this and measured it anyway**, which is why it is
worth more than a fourth run of the same corpus would be. Deleting the articulated model
forced `crates/learn`'s return-discrimination corpus off the articulated duel and onto
`embodied-duel-v1`, and two of its three script baselines had no embodied equivalent. The
test could not be kept over a shrunken corpus without becoming a green assertion about
nothing, so it was **re-measured** on the three registry entries that are distinct fighters
on flat ground.

400 mirrored trials each, native MSVC x86-64:

| policy | mean return | s.e. | 95% CI | wins/losses |
|---|---:|---:|---|---|
| `scripted` | 87.023 | 1.867 | [83.374, 90.657] | 352/48 |
| `tactical` | 66.939 | 1.623 | [63.779, 70.202] | 304/96 |
| `tactical-fixed-guard` | 69.712 | 1.556 | [66.620, 72.797] | 316/84 |

```powershell
cargo test -p learn --release --test return_discrimination -- --ignored --nocapture
```

**The frozen script outscores the strike planner by twenty points on the planner's own
corpus.** Session 04 measured 39.69% wins against that script and recorded `revise`; this is
a different harness, a different metric and a different scoring function reaching the same
place. Two independent measurements agreeing is worth more than either alone, and neither
was built to flatter the other -- the return function was fitted for a learning probe long
before this topic opened, and it ranks the shipped fighter below the control it was built
to beat.

**And this return cannot see the guard read at all.** `tactical` and
`tactical-fixed-guard` separate by 2.773 against a threshold of 3.179 -- indistinguishable.
[The guard threshold section](#the-preregistered-guard-threshold-revise) records the read
buying a 65.86% diagonal, so the read is doing something the *diagonal* can see; what this
says is that whatever it buys does not reach the return. That is a bound on the guard's
value, not a refutation of it, and the two numbers are measuring different things: one asks
whether the plate goes where the blade is, the other asks whether the fight ends better.

**The two questions this corpus can no longer ask** are recorded here because they were
answerable before this session and are not now. The articulated windmill answered *are the
phases decoration?* and the closing-attack control answered a matched-aggression question.
Neither has an embodied equivalent, and building one would have been shipping a policy out
of a deletion session. If a later topic wants either answer it is building a new control
and measuring it, not re-running something.

## The finding: two of the four rows are not reachable by a policy

**This is recorded as a finding rather than as a shortfall, which is what
[the session plan](../plans/fight-04-the-fight-that-ends.md#what-this-session-may-not-change)
asks for when the acceptance cannot be met without a mechanic.** The mechanics it
would take are owned by [`crates/sim/src/rules.rs`](../../crates/sim/src/rules.rs)
and the contact phase, and every pin in
[the golden registry](../reference/hashes.md#golden-registry) would move with
them, which is the whole reason that work is a different topic.

A fight ends when **one** body reaches zero health, so the quantity that decides
it is not how much health leaves the fixture but how deep the deeper of the two
drains goes. The corpus publishes both roles' end health, so both are readable:

| policy pair, symmetric | fighter drained | brute drained | sum |
|---|---:|---:|---:|
| tactical (session 03) | 0.0332 | 0.1477 | 0.1809 |
| **tactical (session 04, shipped)** | **0.0349** | **0.1967** | **0.2316** |
| deepest single drain anywhere in these sweeps (`1/2, 3/4, 1/2, 7/8`) | 0.0373 | 0.2081 | 0.2454 |
| deepest *summed* drain anywhere in these sweeps (`1/2, 3/4, 15/16, 7/8`) | 0.0575 | 0.2065 | 0.2640 |
| the frozen script against itself | 0.1294 | 0.3941 | 0.5235 |

The last two rows are the whole of the correction below in one place: the deepest
sum and the deepest single drain are **different rows**, and it is the single
drain that ends a fight.

**The bound this supports, and the one it does not.** For at least half of all
trials to end with a body at zero, the mean of the deeper drain over all trials
must be at least **0.5**, because no single trial can contribute more than a
whole bar to that mean. That is a *necessary* condition and nothing more. The
shipped fighter's deeper drain is 0.1967, which is **2.54x short of it**; the
deepest row measured anywhere in these sweeps is 0.2081, **2.40x short**; and the
frozen script, the most decisive thing in the repository, is 0.3941 and **1.27x
short**. The median row is strictly stronger than the decided-by-a-body row -- it
wants half the trials decided *by tick 1,800* rather than at all -- so the same
bound applies to it a fortiori.

**The frozen script is the control this argument has to pass, and an earlier
version of it failed that control.** That version read the requirement off the
summed two-role figure as "on the order of 2.0 bars per 3,600-tick equivalent"
and quoted shortfalls of 8.2x, 7.6x and 3.8x. It was wrong twice over, and the
two errors do not cancel:

- It compared a rate for *a trial that kills* -- one whole bar in 1,800 ticks is
  two per 3,600 -- against a **mean over all trials**. A median under 1,800 needs
  only half the trials to kill, so the mean it should have been compared with is
  about a quarter of what it named. That inflated the requirement roughly
  fourfold.
- It summed the two roles, when only one of them has to reach zero. That inflated
  every measured value by about a quarter, in the other direction.

The requirement error dominates, so the shortfall came out about 3.2x too large:
8.2x where 2.54x is defensible. **But the summed figure is not merely imprecise,
it is unusable as a proxy, and the frozen script is what shows it.** The script's
summed removal is 0.5235, which *clears* the 0.5 a 50% decision rate needs -- and
the script decides **7.8%**. Read on the deeper drain instead it is 0.3941, below
0.5, and proxy and outcome agree. That is the whole reason the table above splits
the two roles rather than adding them. **The numbers above are the ones that
survive; the 8.2x, 7.6x and 3.8x are withdrawn.**

The gap between "0.3941 mean" and "7.8% decided" is the distribution, and this
record cannot close it: the corpus prints means and not a histogram, so the bound
is necessary and demonstrably far from sufficient. The claim that the previous
version made -- that "the 50% decided-by-a-body row is the same claim counted
differently" as the median row -- is also withdrawn: they are two rows, one
strictly stronger than the other, and neither is a restatement of a
health-removal rate.

So the gap is not a tuning gap and no arrangement of these four constants closes
it. Damage is kinetic energy and the terms in that product are the actuator's
rates, the anatomy's masses and the contact solver's floor. A policy chooses when
and where a blade goes; it cannot choose how fast an arm may be driven, and the
25.1% of rub this session removed bought 0.049 of a health bar on the body that
has to reach zero. **Meeting the first two acceptance rows is a mechanics topic
with its own measurement**, and it would move every pin in the registry -- which
is precisely why it is not this one.

What a session taking it on should measure first, in order: `CONTACT_ENERGY_FLOOR`
against the distribution of weapon-body energies the corpus already prints
(`max weapon-body energy raw 64730` against a floor of 144 says the tail is not
the problem, the body of the distribution is); `ARM_LINEAR_MAX_SPEED_RAW` and
`Stats::move_speed`, which are the two speeds the squared law consumes; and
fatigue, which session 03 already recorded as unpublished and which prices every
one of them. And a per-trial health histogram, without which the paragraph above
can only state a bound.

## The sweeps

Every row is a full `cargo run --release -p lab -- embodied --seeds 400 --mirrored
--policy tactical --footwork ...` -- 800 trials of `embodied-duel-v1`, both
orientations -- with one constant moved and the other three at the shipped row. A
coordinate sweep about the shipped point, and not a grid: the four value sets
below are **27 rows and 24 distinct runs**, because the shipped point appears
once in each of the four tables and is one run. Swept as a product they would be
2,016.

**All four bolded rows are that one run**, which is worth saying because four
bolded cells look like four measurements agreeing. They are one measurement
appearing four times. An earlier version of this record said "three of the four
peaks sit there by construction"; it was four of four, and a coordinate sweep
about a point is never evidence that the point is best -- **what these tables are
evidence about is the shape of each axis.**

Under the objective used here the centre does not even win outright on all four.
It is the lowest *admitted* row on the margin axis and on the floor axis. On the
lunge axis a quarter measures lower and is admitted by the proviso; it is
excluded by the derived band. On the unwind axis fifteen sixteenths measures
lower and is inside its band; it is rejected by the seed-set control. Both of
those are in [the decision section](#how-the-shipped-point-was-chosen-and-the-objective-that-was-got-wrong-once),
and neither is hidden behind a bolded cell.

The objective is **weapon-on-body resolutions per trial**, which is the number
the session plan names, with the severance count beside it because the plan's
proviso is that severances hold at or above the before state's 133. Rows that
fail the proviso are marked; rows outside their own derived band are marked
separately, because those two are different disqualifications.

**`MEASURE_MARGIN_RAW`**, at floor 4/5, lunge 1/2, unwind 7/8:

| margin | weapon/body per trial | severances | decided | note |
|---:|---:|---:|---:|---|
| 0 | 866.7 | 115 | 2 | fails the proviso; outside the band |
| 1/10 | 904.4 | 131 | 3 | fails the proviso; outside the band |
| 1/5 | 913.0 | 142 | 3 | outside the band |
| **1/2** | **907.8** | **162** | **6** | |
| 3/4 | 908.9 | 163 | 7 | outside the band |
| 1 | 910.1 | 161 | 6 | outside the band |

The two quietest rows are the two that fail the proviso, which is the whole
curve's shape in one line. Above a half the curve is flat because the gate stops
binding -- `choose_plan` produces no candidate from further out, so `in_measure`'s
upper bound is no longer what decides.

**`MEASURE_MIN_FRACTION_RAW`**, at margin 1/2, lunge 1/2, unwind 7/8:

| floor | weapon/body per trial | severances | decided | note |
|---:|---:|---:|---:|---|
| 1/2 | 1083.8 | 214 | 3 | outside the band |
| 3/5 | 1051.2 | 213 | 2 | outside the band |
| 7/10 | 992.2 | 191 | 8 | outside the band |
| 3/4 | 941.5 | 219 | 7 | |
| **4/5** | **907.8** | **162** | **6** | |
| 7/8 | 828.2 | 120 | 4 | fails the proviso; outside the band |
| 1 | 435.2 | 75 | 3 | fails the proviso; outside the band |

The last row is the whole session's argument in one line: a body held a full
reach out rubs 435 times a trial instead of 908, **and lands less than half the
blows.** Quieter is not more decisive, and the plan's severance proviso is what
says so.

**`LUNGE_SPEED_RAW`**, at margin 1/2, floor 4/5, unwind 7/8:

| lunge | weapon/body per trial | severances | decided | note |
|---:|---:|---:|---:|---|
| 0 | 1020.1 | 107 | 2 | fails the proviso; outside the band |
| 1/4 | 896.4 | 148 | 4 | outside the band |
| 3/8 | 927.1 | 154 | 5 | outside the band |
| **1/2** | **907.8** | **162** | **6** | |
| 5/8 | 908.6 | 170 | 1 | outside the band |
| 3/4 | 923.3 | 161 | 7 | outside the band |
| 15/16 | 917.4 | 166 | 6 | outside the band |
| 1 | 1062.1 | 191 | 6 | outside the band |

**This is the constant the session plan did not enumerate and the one that did
most of the work.** The two ends of the curve are the two failures a half sits
between: at zero the body plants and rubs, at one it walks through its opponent
and rubs again. A half is the only swept value inside the derived band at the
shipped floor, which is a narrow escape rather than a strong result and is
recorded as one.

**`UNWIND_TWIST_RAW`**, at margin 1/2, floor 4/5, lunge 1/2:

| unwind | weapon/body per trial | severances | decided | note |
|---:|---:|---:|---:|---|
| never fires | 906.6 | 162 | 10 | outside the band |
| 1/2 | 924.0 | 186 | 5 | outside the band |
| 3/4 | 926.1 | 151 | 6 | |
| **7/8** | **907.8** | **162** | **6** | |
| 15/16 | 905.1 | 164 | 7 | |
| 1 | 909.9 | 150 | 10 | outside the band |

**The whole admissible curve spans 905.1 to 926.1 -- two per cent** -- so this is
the least load-bearing of the four, and the record says so beside the value rather
than letting a reader infer strength from a bolded row. Fifteen sixteenths is the
row that measures lowest and does not ship; the seed-set control that rejects it
is in [the decision section](#how-the-shipped-point-was-chosen-and-the-objective-that-was-got-wrong-once).

**The three tables session 04 first published are superseded rather than wrong.**
They were swept about a floor of three quarters, and a coordinate sweep about a
point that is no longer shipped is a sweep about somebody else's point. Every one
of their rows re-measured identically through `--footwork`, so they are
reproducible if anybody wants them; the floor table above is unchanged from that
version, because it was already swept at the other three shipped values.

**A caution that applies to all four tables and is not offered as a reason to
distrust the choices.** The corpus is a pure function of the seeds, the fixture
and the two policies, so there is no variance to bracket -- and equally no claim
that a 20-severance gap is a 20-severance mechanism. The one place that
distinction bit is recorded above: a 0.29% gap between two unwind rows at 400
seeds changed sign at 800.

## The bounding tests, and what mutating them does

Each of the four carries a two-sided test in
[`articulated_tactics.rs`](../../crates/policy/src/articulated_tactics.rs), beside
the functions that consume the values. Each combines a **derived band** -- read
off `sim`'s published actuator floor, `Stats::move_speed` and the fixture's own
two anatomies, never off a copy of the constant -- with an **exact pin through
the consuming function**, written against literal fractions so that "a body at
`reach + MEASURE_MARGIN` is in measure" (true of every margin there is) cannot
pass for coverage.

The two measure constants and the lunge share one pair of inequalities, read from
different ends, which is why they are three constants and two bounds:

- *the commit must be able to cross the standoff it chambered from*:
  `margin <= COMMIT_TICKS * move_speed * lunge`, and
- *one commit must not carry the body clean through the measure band*:
  `COMMIT_TICKS * move_speed * lunge <= reach * (1 - min_fraction) + margin`.

At the shipped floor that admits `margin` in `[0.4113, 0.6391]` and `lunge` in
`[0.3911, 0.5590]`. The floor is bounded below by the extension the actuator holds
an *idle* arm at -- `ARM_MIN_REACH_RAW`, a quarter, which puts a resting tip at
0.7228 of the Brute's reach -- and above by the second inequality above, which at
the shipped margin and lunge caps it at 0.8521. **That upper end is not the one an
earlier version of this record named.** It named the arm's *committed* extension,
0.9724, and described the pair as "the two extensions the actuator will hold an
arm at": `STRIKE_COMMIT_REACH` is a constant in `articulated_tactics.rs` and not
an actuator limit, and 0.9724 does not bind. The unwind threshold is bounded by
the script's own argument, `(0.5, 1.0)`, plus the `ObservedStance::present` gate
that makes it safe to carry on the articulated row.

Every mutation below was run and every one fails. **The failing tests are listed
in full**, because an earlier version of this table named one test per mutation
and three of the four constants are held by three tests at once -- the
inequalities are coupled, so moving one term breaks the others' bands too:

| constant | mutated to | tests that failed, and the message each printed |
|---|---|---|
| `MEASURE_MARGIN_RAW` | 49_152 (3/4) | `the_measure_margin_is_the_ground_one_commit_can_cross`: *a commit cannot cross the standoff it chambered from*; `the_lunge_is_bounded_by_the_two_ways_a_commit_wastes_itself`: *the commit never crosses the standoff it chambered from*; `the_measure_floor_clears_a_resting_blade`: *a floor of seven eighths still leaves a band one commit fits inside* |
| `MEASURE_MARGIN_RAW` | 16_384 (1/4) | `the_measure_margin_is_the_ground_one_commit_can_cross`: *one commit carries the body clean through the measure band*; `the_lunge_is_bounded_by_the_two_ways_a_commit_wastes_itself`: *one commit walks the body through the whole measure band*; `the_measure_floor_clears_a_resting_blade`: *the shipped floor leaves no band for the commit to land in* |
| `MEASURE_MIN_FRACTION_RAW` | 57_344 (7/8) | `the_measure_floor_clears_a_resting_blade`: *the shipped floor leaves no band for the commit to land in*; `the_measure_margin_is_the_ground_one_commit_can_cross`: *one commit carries the body clean through the measure band*; `the_lunge_is_bounded_by_the_two_ways_a_commit_wastes_itself`: *one commit walks the body through the whole measure band* |
| `MEASURE_MIN_FRACTION_RAW` | 45_875 (7/10) | `the_measure_floor_clears_a_resting_blade`: *the measure floor stands a body inside its own resting blade*; `the_measure_margin_is_the_ground_one_commit_can_cross`: *a quarter fails the lower bound and nothing else* |
| `LUNGE_SPEED_RAW` | 65_536 (1) | `the_lunge_is_bounded_by_the_two_ways_a_commit_wastes_itself`: *one commit walks the body through the whole measure band*; `a_spent_twist_puts_a_foot_down_during_the_chamber`: *the unwinding step survived into the commit and fought the lunge*; and both measure tests |
| `LUNGE_SPEED_RAW` | 0 | `the_lunge_is_bounded_by_the_two_ways_a_commit_wastes_itself`: *the commit never crosses the standoff it chambered from*; `a_spent_twist_puts_a_foot_down_during_the_chamber`: *the unwinding step survived into the commit and fought the lunge*; and both measure tests |
| `UNWIND_TWIST_RAW` | 65_536 (1) | `the_unwind_threshold_is_the_scripts_and_never_fires_without_hips`: *the step could only start after the turn had already stopped* |
| `UNWIND_TWIST_RAW` | 32_768 (1/2) | same: *an ordinary guard change would force a step* |
| `UNWIND_TWIST_RAW` | 49_152 (3/4) | same: *assertion `left == right` failed, left 0.7500, right 0.8750* |

**The unwind test was one-sided and read as two-sided, and that is now fixed.**
It asserted `unwind_twist == 7/8` *before* the `> HALF` and `< ONE` inequalities,
so no mutation of the constant could ever reach them: the equality had already
failed. The band is now asserted first, and the two rows above show it working --
`1` is caught by the upper inequality and `1/2` by the lower, where both used to
be caught by the pin. The third row is the pin doing its own job on a value
*inside* the band, which is what makes the pair a bound rather than a change
detector.

**Two tests were added that have nothing to do with the constants**, because two
things this session landed had no behavioural cover at all:

- `a_planner_measures_with_the_footwork_it_was_built_with`. Replacing
  `self.footwork` with `Footwork::ARTICULATED` at the two calls in
  `StrikePlanner::decide_with_intent` left the whole workspace green -- 103
  passed, 0 failed on the tree it was found in -- and moved the corpus from
  726,226 weapon-on-body resolutions to 838,103, 162 severances to 183, and six
  fights decided by a body to one. Half of this session's tuning could be
  reverted with
  nothing going red, because the bounding tests call `in_measure` as a free
  function with a hand-built row and `an_embodied_planner_keeps_its_footwork_across_a_reset`
  reads the struct field -- both are the reporter and not the thing reported. The
  new test drives `decide` at a distance where the two shipped rows disagree and
  asserts both, so a mutation to either constant is caught by one of its halves.
  Proved: the `ARTICULATED` mutation fails it with *a planner on the embodied row
  chambered from inside its own floor*, `left: Chamber, right: Measure`; the
  `EMBODIED` mutation fails the other half with `left: Measure, right: Chamber`.
- `a_spent_twist_puts_a_foot_down_during_the_chamber`. `if unwinding {` ->
  `if false && unwinding {` in `strike_command` left every crate that can reach
  `policy` green: the existing test covers the `unwinding()` predicate and
  nothing asserted that anything consumes it. Proved: the mutation fails the new
  test with `left: (0.0000, 0.0000), right: (0.9375, 0.0000)`.

And one about the flag: `a_footwork_row_reaches_the_fight_and_is_refused_where_there_are_no_feet`
in [`crates/lab/src/main.rs`](../../crates/lab/src/main.rs) checks the row through
a command stream rather than through the parsed struct. Proved by making
`EmbodiedMatchup::build` ignore its own row, which fails it with *the footwork row
never reached the policy that was built*.

## `COMMIT_MIN_OPENING_RAW` is named by the overview and is not implemented

The constant is [named in the overview's own
list](../plans/fight-00-overview.md#constants-introduced) as *the smallest
opening the planner will spend a commit on*, on the argument that `choose_plan`
in [`articulated_tactics.rs`](../../crates/policy/src/articulated_tactics.rs)
takes the best candidate whatever its score, so a body commits into a covered
line as readily as an open one. **It is not in the landed tree**, and the reason
is that every measured lever pointing the same way cost more than it bought.

Waiting for a better opening is a way of committing less. Two swept rows are
exactly that in a different spelling, and both lose on the acceptance metric and
on the plan's diagnosis metric together: the floor at full reach takes the fight
from 908 weapon-on-body facts a trial to 435 and severances from 162 to 75 and
the pooled win rate against the script from 39.69% to 36.13%; a standoff of zero
takes the win rate to 33.69% and severances to 115. Nothing swept here reduced
contact and raised decisiveness at the same time.

A session that wants to rescue the idea has to change what one of the two words
means. "Opening" as a *plate clearance* -- `candidate_covered` already answers
that question with the contact solver's own swept geometry, and
`PlanScoring::UncoveredRegion` already orders on it -- is a different measurement
from "opening" as a depth. And "wait" as *circling* is a different measurement
from "wait" as holding ground. Both are open and neither was run.

## What the sculpted fixture said

The `--slope` run is not part of the acceptance and it is the cheapest way to
find out whether a fighter was tuned to a fixture. It was not:

| symmetric, 800 trials | flat | sculpted |
|---|---:|---:|
| weapon/body per trial | 907.8 | 918.6 |
| severances | 162 | 192 |
| severances per 10,000 weapon/body | 2.23 | 2.61 |
| trials decided by a body | 6 (0.8%) | 11 (1.4%) |
| guard diagonal | 65.86% | 65.63% |
| median ticks | 3600 | 3600 |

The fighter behaves the same way on a floor with a hill in it, and marginally
better: a fifth more severances at one per cent more contact, and nearly twice as
many fights decided. Nothing here is a cliff, which is the whole question the run
was asked.

**The elevation term is not in this policy and was never ported.** `--high-ground`
measured -5.00 percentage points doubly witnessed and
[the corpus record](embodied-corpus-and-high-ground.md#the-result) owns that
result; `ScriptedEmbodiedPolicy` keeps the term because it is the frozen control
and removing it would move `EMBODIED_CORPUS_DIGEST` for no gain. The one thing
this session owed on that item was making sure the new fighter did not inherit a
term that lost, and it did not: `StrikePlanner` has no ground sense of any kind
and the slope table above is what it scores without one.

## Pins

`EMBODIED_CORPUS_DIGEST` reads `0x00e08317d7a31c7c` and agrees with the registry.
Nothing else moved, and the claim that matters most is the one the
parameterisation could have broken silently: **`StrikePlanner` now takes its
measure numbers as configuration, and the articulated policy that `#/arena` runs
is byte-identical to what it was at `44b05d4`.** That was proven by re-running
the articulated corpus in a worktree at that commit and comparing bytes, not
argued from the type: ten full `lab trace --policy tactical` fights across five
seeds in both orientations (9 MB of poses, capsules and resolution rows each),
`strike-corpus --policy striker --seeds 8 --mirrored`, `tactical-mechanics
--quick`, and the frozen 900-cell `tactical-mechanics --calibration` corpus with
its CSV and summary. Every byte agreed, and the comparison was re-run after the
repairs above, which touched `articulated_tactics.rs` again.

## What is not measured here, still

Fatigue, which session 03 named as the first thing a session chasing its result
should publish and which this one also could not read. The *cause* of the guard
diagonal falling 3.82 points: the extra 14,128 counted pairs are consistent with
the standoff changing the phase mixture, and no arm of this comparison isolates
it. And the per-trial distribution of health removal, without which the
decisiveness bound above can only be stated as necessary.

Wall clock, for scale only: the four 800-trial runs took 11.47 s, 13.17 s,
11.69 s and 11.60 s, and the sweep runs 11 s to 14 s each, fanned out over
`available_parallelism()`.
