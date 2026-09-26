# Rate tests: which of the 30 reds at 120 Hz were the tests, and which are the body

2026-09-25. Follows `2026-09-25-physics-rate-2.md`, section 9, item 2 ("fix the tests pinned to
240").

**The question.** At 120 Hz physics, with Havok's ideal step held at 1/240, 30 of 978 tests fail.
Which of them fail because the test was written against 240, and which because a body really does
something different at 120?

**Answer.**

- **23 of the 30 were the tests (class a).** Each is now rate-honest. It passes at 240 and at 120,
  and it was mutated to show it still goes red when its subject is broken.
- **7 are real residuals at 120 (class b).** Their thresholds were not moved. Each is recorded below
  with its figures and what it protects.
- **Nothing fell into class c**, and no file under `src/` needed changing.
- At 120 Hz the suite now fails **7 of 978**, and at 240 Hz it passes **978 of 978**.

**How the figures were taken.** All are Node, headless, through the Node test runner. The rate was
set by the preload `.review/rate2/hz.mjs`, which is not committed. It was run with `PHYSICS_HZ=120`
or `240` and `TUNING_HZ=240`; `controlHz` stays at 240, so control runs every substep at both rates.

- The column **t120** is that configuration: ideal step held, shipped servo.
- The column **r120** adds the exact servo and filter discretisation from `ced5f67`. That commit
  lives on the branch `physics-rate-servo-tuning` and is not on main. It was cherry-picked
  temporarily for these readings and then reverted.

The previous analysis also counted 30 reds, but at r120. Its per-file list differs slightly from the
one below, which is t120.

## The table

"Mutation" names the break that turned the repaired test red, at 240 and at 120 unless stated.

### Class a: the test was pinned to 240

| File | Test | 240 | t120 before | What was done |
|---|---|---|---|---|
| `golem-arm-transients` | primary and secondary press/release settle at the tip (6, one per frame cadence) | tip residual 1.35-2.61 mm, ceiling 5 | red | The control step was a literal `1/240` while the solver stepped at 1/120, so `JointServo.track`'s feed-forward was doubled. It now steps at `1 / physicsHz`, and the sample window and sample floor are in seconds. After the fix, t120 reads 0.81-1.66 mm. Mutation: servo gain x8 turns 23 of 23 arm tests red at 120 and 22 of 23 at 240. |
| `golem-arm-coordination` | elbow tracks through 1 Hz reversals (5) | elbow 6.9 mm (lift 0, reach 0.5, 60 fps), ceiling 30; worst cadence 26.2 mm, ceiling 80 | red | The same literal `1/240`. After the fix, t120 reads 13.7 and 39.8 mm, which is twice the error at 240 but inside the ceiling, with a residual of 0. The previous analysis put these reds down to the servo residual. **That was wrong: the cause was the literal dt.** |
| `art-proof` | modeled assets preserve physical state (1) | walks | red: "fixture must actually walk" | Steps at `1 / physicsHz` (`b83235f`). |
| `golem-knockdown` | a fall-level blow while rising lies its whole course again; never-rest still rises at the cap (2) | lie 2.5042 s against cap 2.5, 1 substep past | 2.5167 s, 2 substeps past, over a 2-substep allowance by 2e-12 s | The allowance is `CAP_LATENCY = 3 * FIXED`. `KnockdownSettle` starts its clock the step after release and sums dt, so its latency is counted in substeps. Mutation: the cap moved 0.02 s later reads 2.525 s at 240 and 2.533 s at 120, both red. |
| `tactics-v4` | a whole stroke at swing one is v3's cut (1) | 143 frames = 0.596 s | 73 frames = 0.608 s, under the `> 100` frame floor | The floor is now `> 0.4 s` of exchange. |
| `tactics-v4` | the latch reads the abort gate at the stroke (1) | the third stroke reached recover 4 ms inside the 3.0 s window | still in commit at 3.0 s | A stroke in flight when the window closes is let finish. No new stroke can start meanwhile. Mutation: reading the abort gate every step gives "18 of 18 latched strokes aborted", red at both rates. |
| `lab` | direct commands remain legal ... bespoke policies use published observations (1) | `stabilityImpulseNs` 113.8 N s after 1 frame | 0 after 1 frame: the first 1/60 s frame holds one control step at 120, and the view has not published yet | Steps two frames first. That reads 113.8 at both rates. Mutation: the feature zeroed reads red at both. |
| `supported-locomotion-stability-physical` | real Havok brackets the stagger and fall lines (1) | pass | red: the test asserted `physicsHz === 240` and hard-coded the sub-step | Runs at `1 / physicsHz`, settles for 1/30 s, and asserts the engine's own sub-step against the configured rate. Mutation: a stale `1000/240` sub-step reads red at 120. |
| `golem-finishing` | a downed mind in reach strikes and guards from its live socket (1) | brawler thrust 0.18 at 0.4 m | brawler thrust 0: it walked in instead | The minds are rate-free: the 120 Hz fixture driven at dt 1/240 reads the same as at 1/120, and vice versa. 0.4 m sat on the brawler's close/strike edge (`gap > near + slack`), and the lying pose moves that edge: its shoulder lands 89 mm further round at 120. The edge is between 0.40 and 0.45 m at 240 and between 0.35 and 0.40 at 120. The test now drives at 0.3 m, where every mind thrusts, guards 1.0 of the time and aims 0.8+ above standing, at both rates. Mutation: a downed mind that never thrusts reads red at both. |
| `golem-locomotion` | physical corpus: a fallen biped rises clear of its neighbour (1) | 0.50 m apart: lay 0.644 m apart, retreated to 0.746 | lay 0.698 m apart: the ragdoll drifted clear by itself, so the retreat went untested | Now runs 0.20-0.60 m in 0.05 steps and needs at least 3 separations that leave the body down inside the 0.68 m. It got 5 of 9 at each rate. Where the shove leaves a ragdoll is chaotic in separation *and* rate: at 0.35 m and 120 Hz the body only staggers. Mutation: the rise never relocating (`findRecoveryTarget` returns its own spot) leaves the 0.30 m run on the floor at both rates. |
| `research-physical` | the worker counts knockdowns and time down (1) | seeds 44/45: 8 falls / 12.73 s; control x1 5 / 8.90 s | 44/45: 4 / 9.05 s at x0.5 **and** at x1 | The seed rule is now the fixture: the first pair from 44 on which x0.5 falls at least twice and more than x1 (44/45 at 240, 50/51 at 120: 4 / 5.78 against 2 / 3.77). It asserts an edge count (at most 2 per second down), the other corner at 0 and 0 s, and x1 down for less time. Mutation: counting every fallen frame gives 481 (240) and 559 (120) falls, red. |
| `research-physical` | the worker counts severs and real blows (1) | seeds 50/51: soft 1 sever, x1 none, hits/real `[[34,15],[23,17]]` | 50/51: soft 0 severs, `[[86,37],[65,35]]` | The same pattern: the first pair from 50 on which the soft corner alone loses one module and x1 none (50/51 at 240, 52/53 at 120). It asserts `0 < realBlows < hits` per corner and that the two corners' records differ. Mutations: `realBlows = hits` red; severs read from the other corner red. |
| `humanoid` | authored human policy closes and wounds (1) | seeds 44/79: 33 hits, damage 0.132 | 44/79: 26 hits, damage 0 | The first pair (a, a+35) from 44 that wounds past 0.05 (44 at 240, 48 at 120), with more than 5 hits in every bout tried, and failing if none of 8 wound. Damage by a from 42: 0, 0, .132, 0, .016, .085, .045, .015 at 240; .080, 0, 0, 0, .006, 0, .513, .056 at 120. Mutation: a mind that never closes gives 0 hits, red. |

Two caveats sit with this class:

- **`humanoid`: the damage clause was not reached by any mutation.** Setting `thrust` false changes
  nothing (the human duelist never thrusts), and freezing the cursor removes the hits first. The
  search also turns a claim about one seed into a claim about eight. At 240 only 2 of the 8 pairs
  from 42 wound past 0.05, so the claim was never a claim about every seed.
- **The two `golem-arm-*` files and `art-proof`, `humanoid` and `skeleton-dungeon` got the same
  literal fix in `b83235f`.** Only the reds are counted here.

### Class b: a real residual at 120, threshold not moved

| File | Test | What it protects | 240 | t120 | r120 | Limit |
|---|---|---|---|---|---|---|
| `golem-arena` | a severed effector becomes debris and the golem fights on | the surviving arm stays on its own anchor | peak stray 101.5 mm | 123.3 | 108.9 | 120 mm |
| `golem-bench` | rung 2 follows its command at a rate limit | a command crosses its span near the rate ceiling, and easing does not stall it | 0.2833 s (17 frames) | 0.3167 s (19) | 0.2667 s | 0.305 s (floor 0.105 + 0.20) |
| `golem-bench` | the whip's lash outruns the wrist | a lash is cracked, not carried | 19.62 m/s | 12.46 | 13.9 | 15 m/s |
| `golem-bench` | the stroke probe ... the shipped cut arrives after its own arc | the chosen cut is as fast as claimed | 13.38 m/s (miss 0.0898 m, stray 32.6 mm) | 11.49 (miss 0.0876, stray 45.2) | fails a different assertion ("nearest the mark before it crossed its bearing") | 13 m/s |
| `golem-bench` | a heavier arm timed as the mind times it swings no slower | an x2-weight mace stays on its anchor | stray 32.7 mm (heavy peak 19.84 m/s) | 79.0 (18.54) | 58 | 50 mm |
| `golem-locomotion` | a planted sole holds its ground within budget | the walk is not spent in the air | 7 of 1919 substeps unplanted (29 ms), slip 99 mm/s | 10 of 959 (83 ms), slip 151 | not measured | 1 % of substeps |
| `golem-locomotion` | a sole holds its ground sideways and in a spin | the strafe keeps a sole down | 0 of 1919 unplanted, slip 1.164 m/s | 42 of 959 (0.35 s), slip 1.017 | not measured | none unplanted (budget 1.399 m/s slip) |

**Readings on the class b rows:**

- The exact discretisation closes **rung 2 outright** and brings the **severed survivor** to within
  1.1 mm of its limit. It does not close the others.
- The **shipped mace**, whose stray is not asserted, reads 153 mm at 240 and 131 at 120, so it is
  the x2 weight that suffers at 120.
- The **walk** has more than three times as much time in flight at 120. The **strafe** goes from
  never leaving the ground to 0.35 s off it, although its slip is lower.
  - **The strafe row is resolved, and it was not a servo or a handover.** The ankle's roll axis
    was armed and never written, so a stance foot rolled with its abducted leg onto the edge that
    leads the travel, tripped on it and wedged the leg. How far that wedge deflects depends on
    the step: the stance foot's peak roll is 0.187 rad at 240 and 0.254 at 120, and at 120 that
    lifts the sole's centre 21.6 mm, past the 20 mm band. The swing foot lands on time. With the
    sole levelled (`bipedAnkleRoll` in `src/golem/locomotion/biped.ts`, which has the table), the
    strafe reads 0 of 959 at slip 1.303 m/s and 0 of 1919 at 1.338 (Node locomotion bench), and the
    paired mirror bouts do not move at either rate (Node research runner).
- A servo-gain pass at 120 is the parallel study's remit. Previous analysis, sections 2 and 6.

## What else was checked

- **Every literal `1/240` left in `tests/`.** None of them steps a solver, so none is a rate pin.
  Each remaining one is one of these:
  - a dt handed to a mind, an option, a recorder or a pure model with no scene behind it
    (`options`, `recorder`, `lab*`, `human-ownership`, `wave4-protocol`, `units`,
    `supported-root-drive`, `attributes`, `rigid-strike`, `forge-style`);
  - a comment.
- **`src/`.** No per-step literal was exposed. Every class-a red was the test's own clock, count or
  fixture.
