# Rate falls: why the brawler falls more at t120

2026-09-25. Follows `2026-09-25-rate-tempo.md`, section 6. That section found the knockdown excess at
t120 and did not measure its cause: "It points at supported locomotion or the push response under a
stiff contact at 120, which is the ideal-step effect again, but on the feet. That has not been
measured."

**The question.** At t120 the brawler falls 1.5x as often as at s240 and spends twice as long on the
ground. Is this only the brawler? What causes it? Is it a step-size dependence in our code?

**Answer.**

- **Only the brawler, and only in some pairings.** Clustered by pairing, the excess is not
  significant (+1.61 ± 4.04 knockdowns a bout). It is concentrated in the brawler's mirror and in
  brawler~duelist. Every other mind's falls do not move.
- **It is not a step-size dependence in our code.** The stability ledger had one such dependence:
  a held push was added after the righting instead of against it. That is fixed in `fcaaaac`. The fix
  did not change the fall counts beyond noise.
- **Whether u120 cures it is unresolved.** At t120 the solver's ideal step is held at 1/240. At
  u120 it is 1/120, and the excess is gone at u120 in both the research sets and the bench. In
  close contact at t120, the brawler's centre of mass sits 34 mm further from the other body,
  relative to its soles, than at s240. It spends 3x as long within 20 mm of the edge of its own base.
  Whether the body falls then depends on the ledger's rule that a body whose centre of mass is past
  its base falls to any touch.
- **The owner decides the design-around** (section 7). The fall does not come from the feet
  catching the other body's legs, from a foot being off the ground, or from the gait alone.

**Rates.**

| name | solver step | Havok ideal step |
|---|---|---|
| s240 | 1/240 | 1/240 |
| t120 | 1/120 | 1/240 (`CONFIG.world.solverTuningHz`) |
| u120 | 1/120 | 1/120 |

- Control runs at 240 in all three.
- The shipped servo and the settled contact reading are used throughout.
- The rate was set by a preload (`.review/falls/hz.mjs`, not committed) before any harness module
  read `CONFIG`.
- **The research sets** are `research/stat-sweep.mjs --stat weight --levels 1 --pairs 96`:
  - seed 20260923, `PROBE_MINDS` (brawler, champion, duelist, miser);
  - stone default golems, supported locomotion, 150 s cap;
  - 192 bouts a set, bout-identical to the tempo study's sets.
- **Two probes rode along with them.** Both are in `.review/falls/probe.mjs`, not committed. A fall
  log wraps each port's `advance` and records:
  - every edge into `fallen`, with the ledger's inputs on that substep;
  - a 0.5 s ring of the base geometry before it.

  The other probe sums time inside and outside the base.
- **Knockdowns** are counted as `research/worker.mjs` counts them: every edge into `fallen`, a fall
  while rising included. They are charged to the side that fell. "Time down" is fallen plus rising.
- **Clustered intervals** take the 10 unordered mind pairings as clusters and use t on 9 df, or on
  3 df when only the 4 brawler pairings count. They are ± 95 %.

## 1. The effect

**Harness:** the Node research runner, 192 bouts a set.

| | s240 | t120 | u120 |
|---|---:|---:|---:|
| brawler knockdowns/min | 2.26 | 3.47 | 1.91 |
| brawler time down | 5.8 % | 12.9 % | 5.2 % |
| brawler, last rise p50 | about 1.0 s | about 1.0 s | about 1.0 s |
| others' knockdowns/min | 0.86-1.16 | 0.43-1.25 | 0.90-1.30 |

**Harness:** the same.

| paired, per bout | t120 − s240 | u120 − s240 |
|---|---:|---:|
| brawler knockdowns, bouts as units | +1.10 ± 0.74 | −0.02 ± 0.98 |
| brawler knockdowns, clustered by its 4 pairings | +1.61 ± 4.04 | |
| non-brawler knockdowns | −0.01 ± 0.27 | |
| all knockdowns, clustered by 10 pairings | +0.64 ± 1.20 | |

**Harness:** the same. Brawler knockdowns/min by pairing.

| pairing | s240 | t120 |
|---|---:|---:|
| brawler~brawler | 1.17 | 5.23 |
| brawler~duelist | 1.88 | 5.09 |
| brawler~champion | 4.97 | 3.75 |
| brawler~miser | 2.99 | 0.58 |

- **The excess is the brawler's.** No other mind's falls move.
- **Across its pairings it is not one effect.** Two pairings rise 3-4x and two fall. With the
  pairing as the unit it is not significant. The unclustered interval treats 96 bouts as
  independent when there are 4 pairings, and it overstates the evidence about 5x.
- **Time down doubles because the falls do, not because rising got slower.** The last rise takes
  the same time at every rate. A fall while rising follows a fall at every rate: 0.78-0.96 per
  episode.

## 2. What fells it

Every knockdown has a reason on its edge. Only the ledger reason ("stability threshold was
exceeded") changes with the rate. So the ledger falls were split by where the centre of mass stood
against the standing base on the substep the body fell.

**Harness:** the Node research runner with the fall log.

| brawler | s240 | t120 | u120 |
|---|---:|---:|---:|
| ledger falls | 32 | 101 | 40 |
| with the centre of mass outside the base | 25 | 72 | 25 |
| with it inside | 7 | 29 | 15 |
| ledger falls/min | 0.87 | 2.00 | 1.08 |
| share of standing time outside the base | 0.65 % | 0.98 % | 0.24 % |
| falls after a leg was severed | 26 | 4 | 11 |

- **Outside the base the fall line is zero.** `tippingLineMps` returns 0 when `baseReachM` is 0,
  so any touch fells the body. That rule is deliberate, and the doc of `baseReachM` gives the
  argument. At t120, 50 of the 72 outside falls were triggered by a blow landing while the centre of
  mass was outside.
- **Falls follow time spent outside the base.** Over the 12 cells (4 pairings × 3 rates), the
  share of standing time outside the base against ledger falls/min gives Spearman 0.84 and Pearson
  0.75. That share is itself noisy by pairing, clustered by the brawler's 4 pairings:
  - t120 − s240: +0.10 ± 2.42 points;
  - t120 − u120: +0.88 ± 1.19 points.
- **What being outside looks like, at t120:**
  - 61 of the 72 outside falls happen while the body moves, at a median 1.67 m/s;
  - the centre of mass is about 220 mm ahead of the soles along the direction of travel, and about
    280 mm from the soles' midpoint (44 mm while inside);
  - the soles are about 440 mm apart, as when inside;
  - the higher sole is 100-200 mm up, so the body is mid-stride;
  - nothing slides;
  - the carrier accelerates harder while the centre of mass is outside: a mean of about 12 m/s²,
    against 7.4 inside.

## 3. The held push: a step-size dependence, fixed, and not the cause

`nextLean` in `src/supported-locomotion-state.ts` integrated a held force wrongly. `readContact`
files three kinds of event every substep for as long as the contact lasts:

- the driver's push (`pairDriving`);
- the driven body's outrun;
- a press.

`nextLean` treated them like blows. It decayed the prior lean and then added the substep's impulse
on top. The lean read at the end of each substep therefore carried one substep of a held push that
the righting had not yet acted on. The residue is F·dt/m, so it doubles at 120. A force the body
holds indefinitely read a nonzero lean, and a force just past the line crossed it one substep
early.

`fcaaaac` marks those three events `sustained`. `nextLean` now adds a held force to the prior lean
before the decay, so the righting acts on it in the same substep. Blows are applied as before, and a
substep with no held force is bit-identical. Two tests cover it:

- `a_held_force_leans_a_body_by_how_long_it_is_held_not_by_the_step_it_is_filed_at` in
  `tests/supported-locomotion-state.test.mjs`:
  - a held 0.9·D reads 0 at 1/240, 1/120 and 1/60;
  - a held 1.5·D for 0.1 s builds 0.5·D·0.1 at every step;
  - the control is the same force filed as blows, which reads 0.9·D·dt;
  - reverting the fix turns it red.
- The "walked into" test in `tests/contact-press.test.mjs` asserted a nonzero ledger on the walker.
  It passed only on that residue. It now asserts that the walker's push is filed as held and never
  as a blow. Dropping `sustained` from the `pairDriving` branch turns it red.

**Harness:** the Node research runner. "e" is with the fix.

| | s240 | t120 | u120 |
|---|---:|---:|---:|
| brawler knockdowns/min, before | 2.26 | 3.47 | 1.91 |
| brawler knockdowns/min, with the fix | 2.62 | 4.25 | 1.80 |

- **At s240, 8 of the 10 pairings are bit-identical.**
- **The change is not significant at either rate:** +0.19 ± 0.23 knockdowns a bout at s240, and
  +0.45 ± 0.62 at t120.
- **At t120, inside falls went from 29 to 22 and outside falls from 72 to 76.**
- **The fix is right and the cause is elsewhere.** The residue fed the inside falls. The excess is
  in the outside falls.

## 4. The lead from the rate-tests study: feet with nothing under them

`2026-09-25-rate-tests.md` left two foot-contact residuals at t120:

- a walk with 10 of 959 substeps in flight, against 7 of 1919 at 240;
- a strafe with 42 of 959 substeps with no foot down, against 0 at 240.

A body with no foot down has no base, and the brawler circles.

- **This is not the route to the falls.** A body with no sole down falls through the ledger's
  grace path, which has its own reason. The brawler has about zero such falls at every rate, and the
  added falls all come through the ledger reason.
- **Its base is not missing when it falls.** In the ring before an outside fall, both soles are
  listed, about 440 mm apart, one of them in stride.
- **The gait alone does not reproduce the excess.** **Harness:** the Node headless arena, one stone
  default golem on a scripted course for 60 s, standing time only:

  | course | s240 | t120 | u120 |
  |---|---:|---:|---:|
  | walk, back, strafe, turn; nobody near | 0 % | 0 % | 0 % |
  | walk into an idle golem and back off | 0.10 % | 0.11 % | 0 % |
  | press in leaning, back off guarding, repeat | 1.90 % | 1.67 % | 1.42 % |

  The last row puts the centre of mass outside the base, with a worst excursion of 128-169 mm. It
  does so at every rate, and least at t120. The gait's reversals take the centre of mass outside the
  base, but not more at 120.

## 5. Where the rate enters: close contact

**Harness:** the Node bout runner. Brawler (left) against a golem that never acts (`idleMind`),
stone default golems, supported locomotion, 8 bouts of 60 s. Seeds are 20260923 + 17i, one bout
each. Only the brawler's standing substeps while the other body is up are tallied. "Close" is a
carrier gap under 0.95 m. A negative "toward" means the soles stand toward the other body from the
centre of mass.

| brawler, other body up | s240 | t120 | u120 |
|---|---:|---:|---:|
| knockdowns while the other body was up | 0 | 14 | 0 |
| knockdowns while it was down | 6 | 8 | 4 |
| share of standing time outside the base | 0.28 % | 0.92 % | 0.16 % |
| close: mean margin inside the base | 144 mm | 133 mm | 146 mm |
| close: time within 20 mm of the edge | 0.72 % | 2.14 % | 0.11 % |
| close: centre of mass toward the other body, from the soles' midpoint | −2.8 mm | −33.5 mm | −9.4 mm |
| far: time within 20 mm of the edge | 0.54 % | 1.63 % | 1.31 % |
| far: centre of mass toward the other body | +1.2 mm | −3.5 mm | +34.4 mm |
| substeps with a leg touching the other body, inside / outside the base | 4.6 % / 0 % | 4.6 % / 0 % | 3.2 % / 42 % |

- **The bench reproduces the excess** without anything hitting back: 14 falls against 0 while the
  other body stands.
- **At t120 the brawler falls in two ways,** read from the fall log's ledger inputs:
  - **Pushing.** It is standing nearly still (under 0.15 m/s), with its centre of mass inside its
    base but within a few millimetres of the rear edge. Its fall line is 0.003-0.04 m/s, and the
    reaction to its own push (`pairDriving`, 0.1-0.3 N·s over 0.25 s) creeps its lean across that
    line.
  - **Backing off.** It is moving at about 1.6 m/s, its centre of mass is already outside the base,
    and a touch fells it.

  Both begin with the centre of mass at or past the rear edge.
- **In close contact at t120 the centre of mass sits back from the soles.** It is 34 mm further from
  the other body than at s240, and within 20 mm of the edge 3x as long. Nothing else in the table
  moves that far. At u120, close contact looks like s240.
- **The legs are not caught on the other body.** At t120 no substep outside the base has a leg
  touching the other body, and inside the base legs touch it as often as at s240. At u120, legs
  touch in 42 % of the rare substeps outside the base, and it does not fall.

**What this points at.** t120 and u120 differ only in Havok's ideal step. With it held at 1/240
while the step is 1/120, the contact response is sized for the wrong step. `2026-09-25-rate-tempo.md`
section 2 measured this on the blade: a response too stiff at t120 and too soft at u120. Here the
contact is the brawler's trunk and arms pressed against the other body. The brawler's centre of mass
is a sum over its dynamic parts. Its soles follow the carrier and its feet's own drives. The likely
mechanism is this:

1. a stiffer response pushes the upper body back over the rear edge while the feet stay put;
2. the ledger's zero-reach rule turns that geometry into a fall on the next touch, or on the
   reaction to its own push.

Which part carries the shift was not isolated.

## 6. The carried base, as a design-around probe

The standing hull is both soles' corners, planted or not, plus ground contacts. As a probe, the
standing branch of `readTipping` was made to judge a standing body on its carried hull
(`standingHull`) instead, the way a rising body is judged. It was run under an environment flag and
reverted. It is not in any commit.

**Harness:** the Node research runner. "f" is the fix plus the carried base.

| | s240 | t120 | u120 |
|---|---:|---:|---:|
| brawler knockdowns/min | 1.23 | 1.90 | 1.39 |
| brawler time down | 4.1 % | 7.8 % | 5.5 % |
| brawler falls while standing, per min | 0.69 | 0.63 | 0.65 |
| brawler ledger falls while standing (all inside the base) | 25 | 27 | 25 |
| brawler falls while rising | 20 | 61 | 32 |
| others' knockdowns/min | 0.18-0.38 | 0.25-0.33 | 0.17-1.07 |

- **Falls from standing become equal across the rates.** The outside-the-base route is closed.
- **It is a balance change, not a rate fix.** Every mind falls far less at every rate: the
  brawler's s240 rate goes from 2.62 to 1.23 a minute, and the others' from about 0.87 to 0.18-0.38.
- **What remains at t120 is falls while rising, in a few bout-sides.**
  - 42 of the 61 are in brawler~brawler;
  - one bout has 17 on each side, 13 of them aborted rises ("deadline");
  - without the carried base the same pairing held 46 of 70.
  - The paired difference is +0.55 ± 0.65 a bout for the brawler, +0.96 ± 3.12 clustered.

## 7. Verdict and design-arounds

**Cause.** The brawler falls more at t120 because, in close contact, its centre of mass rides back
to or past the rear edge of its own soles. There the stability ledger's fall line is near zero or
zero, and the next blow or its own push fells it. The shift happens with Havok's ideal step held at
1/240 while the step is 1/120, and not at s240 or u120. The one step-size dependence in our own
ledger was real and is fixed, but it was not the cause.

**Design-arounds, for the owner:**

1. **Tune the solver at the rate it steps (u120).** This removes the excess. But
   `2026-09-25-physics-rate-2.md` chose to hold the ideal step because u120 softens every joint and
   foot: walk slip rises from 99 to 567 mm/s. So this means u120 plus a retune of the legs and arms,
   which that study's r120 set began.
2. **Retune the contact at t120.** The contact response for bodies pressed together, and the
   leg servo on the branch `physics-rate-servo-tuning`, are the remit of the parallel servo study.
   The bench in section 5 is the check: the "close: centre of mass toward the other body" row
   should read near s240's −3 mm.
3. **Judge a standing body on its carried base.** Section 6 shows this makes standing falls
   rate-independent. It also cuts every mind's falls by half or more at 240, so it is a balance
   decision and not a fix.
4. **Leave it.** Clustered by pairing, the excess is not significant, and it comes from half the
   brawler's pairings.

**Left open.**

- Which dynamic part moves the brawler's centre of mass back in close contact at t120. The next
  instrument is per-part contact impulse against the other body, by rate.
- Falls while rising in brawler mirrors at t120: repeated aborted rises in a few bouts.
- Why brawler~champion and brawler~miser fall less at t120. At n = 24 bouts a pairing, this may be
  noise.

**Harnesses and scripts.**

- Nothing under `.review/falls/` is committed:
  - the preload (`hz.mjs`) and the probe (`probe.mjs`);
  - the set runners (`set.sh`, `chain*.sh`);
  - the analysis scripts (`stats.cjs`, `trigger.cjs`, `inside.cjs`, `motion.cjs`, `refalls.cjs` and
    others);
  - the three benches: `walkbench.mjs` for the headless-arena course, and `brawlbench.mjs` for the
    brawler against the idle golem.
- Run sets are under `research/runs/falls-*` and the fall logs under `.review/falls/out/`. Sets
  `d` are the baseline, `e` the held-force fix and `f` the carried-base probe.
