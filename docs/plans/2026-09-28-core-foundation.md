# The core foundation

2026-09-28.

This plan builds a clean, physically based core beside today's game, starting with the human. The case for it, and the audit behind it, are in [the foundation audit](../analysis/2026-09-28-foundation-audit.md); its companion notes list what exists.

The owner's decisions, 2026-09-28:
1. The core is built **beside** the old one, in `src/core/`.
2. Locomotion is **force-bounded stepping**.
3. Stone and skeleton stay **playable on the old path** until they are ported.
4. The Warrior, Rogue and reptile plan is **paused and salvaged**, not thrown away.

## Rules for the core

- **`src/core/` imports nothing from `src/golem/`, `src/config.ts` or the old minds.** A test enforces it.
  - It may import engine glue that holds no body knowledge: `src/physics.ts`, and whatever of `src/body-inertia.ts`, `src/golem/effective-mass.ts`, `src/tipping.ts` and `src/fork/` it needs.
  - Each is moved or re-exported through `src/core/` when it is taken, so the boundary stays checkable.
- **Every number in a spec says where it came from:** a citation, a derivation from other spec values, or a documented sweep with its table. A test reads the provenance of every numeric leaf.
  - A spec never spreads another family's spec. Families share code, not values.
- **Tuning is immutable.** An experiment passes an override in, and nothing mutates a global.
- **One world step** owns physics, control, combat and the clock. The page, the harness and the research runners all call it.
- **Solver conditioning is separate from anatomy.** An inertia floor or a damping term that exists for the solver is named as solver conditioning, measured, and kept out of the body's numbers.
- **The old path is not extended.** It is fixed only when it blocks play.

## What we salvage from the paused plan

| From | Becomes |
|---|---|
| x1 as a typical adult: each human's stature and de Leva segment masses (5c38ea0c) | the human spec's segment table |
| `docs/analysis/2026-09-27-human-strike-reference.md` | the acceptance targets: typical and elite fist, club and cut speeds, effective masses and energies, trunk and joint rates |
| The strike search and re-reader (`research/strike-optimizer.mjs`, `strike-eval.mjs`, and `research/human-strikes.mjs` with 44 searched strikes on `wip/s2-step6-human-ranges`) | the instrument that checks the new human's arm against those targets, ported to the core's world |
| Joint give in the effective mass (20830082) | kept as is; the contact physics the core scores with |
| The human attribute rows (size x0.9–1.18, weight x0.85–1.25, arm speed), with their tables | the human spec's attribute bounds; the range mechanism is reworked for specs |
| The muscle-mass derivation (Janssen 2000; checked against Miller 1993 and Kumar 2001) | the muscle model's input, in place of the fitted shares; stage 1 replaced Janssen's split with Abe 2003's (reference section 9.1) |
| "The fist outruns an elite hook; the club is right" | the force-velocity acceptance test |
| The whole-shove bout table (4350cb8e) | locomotion v2's acceptance test: reading a shove whole must not multiply falls, because the body steps |
| Sessions 3 (damage unit) and 4 (one HP pool with overflow) | stage 5's design, recalibrated on the new human's strikes |
| Session 5, the reptile | the first body built entirely on the core (stage 7) |

## Stages

Each stage lands as commits behind tests. Measurements name their harness. Where a stage touches a fight on the old path, it gets a bout on either side of the change.

### Stage 0: freeze and clear (old path, small)

- Delete what has no reader. Each item is checked by grep before it goes:
  - `AnchorDrive`;
  - the dead scheduler seam in `supported-locomotion-production.ts`;
  - the unread `CONFIG` sections (axe, bow, buckler, rigView and the dead `CONFIG.body` strengths);
  - the stale `defaultMatchup` and the retired-policy tests.
- Label the registry and bench "human" modules as the legacy human, so no reading taken from them is mistaken for the Warrior or the Rogue.
- Fix stale docs:
  - AGENTS.md's `fallenTone`;
  - the 240 Hz comments that describe today's rate;
  - AGENTS.md gains a section on `src/core/` and its rules.

**What landed (2026-09-28).**
- `docs/` was cleared to this plan's working set; `docs/plans/README.md` says which commit holds each deleted document.
- Deleted: `AnchorDrive` and its `ANCHOR_DRIVE` table (`slewTowards`, which six modules use, moved to `src/golem/slew.ts`); the scheduler seam; `CONFIG.rigView`, `CONFIG.buckler` and every unread `CONFIG.body` field.
- `defaultMatchup`, which only tests read and whose comment claimed the page opened on it, became `tests/fixtures/matchup.mjs`.
- The legacy human's modules are labelled "legacy".
- The comments that stated 240 Hz as today's rate now say 120 Hz, and AGENTS.md has its `GROUNDED_TONE` sentence and its core section.

**Left on purpose.**
- `CONFIG.axe` and `CONFIG.bow` are still read, as fixtures, by `tests/scoring.test.mjs` and `tests/minds.test.mjs`.
- The retired-policy ids in `tests/bout.test.mjs` are opaque strings to reducers that read no registry.
- Two behaviours were found and not changed, because stage 0 changes no behaviour:
  - `PhysicalSupportedLocomotionPort` falls back to a `1 / 240` s step whenever it holds no commit: before its first, and for a step after `clear()`, which drops it;
  - `BENCH_READOUT.stuckWindowSteps` is 24 steps, which was 0.1 s at 240 Hz and is 0.2 s now.

### Stage 1: the body spec and the human spec

**`src/core/spec/`: the types.**
- Segments: shape, dimensions, mass and inertia, each from the spec.
- Joints: axes, limits, and parent and child frames.
- Muscles, per joint degree of freedom: peak isometric torque. The maximum velocity, the curve and the
  eccentric ceiling join in stage 2, with their sources.
- Contact surfaces and damageable parts, with their properties.
- Every number carries its provenance.

**`src/core/human/`: the Warrior and Rogue specs.**
- Geometry from the rig (`assets/humanoid/workshop-*.json`) and the stature, and masses from de Leva.
- Segment shapes are sized from segment volume and density wherever the rig gives no dimension. The unexplained boxes and radii go.
- Muscle mass per region from the model's sex and mass (Abe 2003: its women's and men's shares come from the same
  people, where Janssen 2000's upper body mixes the arms with the trunk).
- Peak joint torques are young men's measured torques scaled by the model's regional muscle; the women's
  columns are the Rogue's check, never an input. Joint ranges are measured ranges, shifted by each
  joint's angle in the rig's pose. Sources, tables and stated assumptions: reference section 9.

**The builder.** `buildBody(spec, world)` makes Havok bodies and joints from a spec and nothing else. Attributes act on the spec, once, before the build.

**Stand.** A Node stand builds a spec and holds it posed against gravity with its joints motored,
pinned at the pelvis (`tests/core-stand.test.mjs`). Standing on its own feet is stage 4's; see
"standing on the feet" below.

**Tests.**
- Masses sum to the model's mass.
- Every leaf has provenance.
- The two models differ where their sources differ.
- No import crosses the boundary.
- The built body's inertia is anatomical, or its solver floor is named and measured.

**Found while building (2026-09-28): Havok's 6-DoF limits** (Node stand, two rods, velocity motor
into the limit for 1 s, range -0.2 to 0.6 rad; `tests/core-build.test.mjs` pins these figures).
- A joint's first freedom, the constraint's X, stops exactly at both ends.
- In a joint with three freedoms, the second passes its ends by about 0.01-0.02 rad, and turning
  it drags the third about 0.22 rad; the third stops short, at 0.55 and -0.15.
- A motor far above its load (1000 N m on a 1 kg rod) drives through a limit, by 0.05 rad on X.
  Held against its limit, a one-freedom joint's locked axes then give too: its whole turn read
  0.64 rad at 300 N m and 1.46 rad at 1000, against 0.60 and 0.65 about its free axis.

So a ball joint's range is only as exact as the freedom on X. Stage 1's human joints put the
freedom whose range matters most first, and stage 2 reads the ranges again with muscle-sized
motors.

**Found while building (2026-09-28): Havok's inertia unit.** `buildBody` gave Havok kg m2 where it
takes kg m2 per kilogram (H49), so every segment turned as if its inertia were its mass times the
spec's: the Warrior's 0.48 kg hand spun 2.1 times too fast and his trunk far too slowly. A test
that reads the inertia back could not see it. The builder now divides by the mass, and each
segment of both humans answers an angular impulse within 0.4 % of its spec (Node stand, 120 Hz).

**Found while building (2026-09-28): standing on the feet** (Node stand, 120 Hz, each human on
the ground, every freedom braked by a zero-velocity motor).
- The Rogue stands. The Warrior topples backward within about 2 s, at his weaker peaks and at
  10^5 N m alike. A servo toward the reference pose (velocity -angle/tau, tau 0.02-0.2 s, capped
  by the peak in the direction pushed) topples him too.
- In the reference pose his centre of mass is 1-2 mm ahead of his ankle axis (the Rogue's, 4 mm).
  Past about 7 degrees back, gravity's moment is more than both dorsiflexors' 43 N m hold.
- What tips him is the solver. A toy -- a 70 kg pole on a 1 kg foot box, hinged at the ankle, 1 cm
  forward of it -- falls forward with the hinge free, as it should. A zero-velocity motor of
  1000 N m on the hinge instead drives it backward 52 degrees in 1 s:

  | Toy variant | Hinge after 1 s (deg) |
  |---|---|
  | 1 kg foot | -51.6 |
  | 1 kg foot, 480 Hz / 1920 Hz sub-step | -28.4 / -6.2 |
  | 1 kg foot, its inertia x10 / x100 | -11.8 / -0.7 |
  | 10 kg foot / 10 kg foot, inertia x100 | -12.1 / -0.05 |

  So a motor across a large inertia ratio, on a body in ground contact, is not held by Havok's
  solver at 120 Hz. On the Warrior, feet at x100 inertia still drift 3.5 degrees in 5 s; with
  his ankles locked by their limits instead of braked, he stands.
- Consequences, for the owner: standing is a balance problem and belongs to stage 4, with
  position feedback on the body, not the joint. Stage 2's ankle must be read against this before
  its motor is trusted, and so, if the same ratio does the same there, must the wrist under a
  weapon. The measured ways out are
  a foot inertia floor (named, like any floor), a finer sub-step, or an ankle held through its
  limits; none is chosen here.

### Stage 2: the muscle actuator

- **What a muscle does:**
  - torque ceiling = peak isometric torque × force–velocity(joint speed / vmax);
  - the Hill curve on the concentric side, and a stated eccentric ceiling;
  - activation is the controller's 0–1 command.
  - Torque–angle is added only if a measurement asks for it.
  - `MuscleSpec` gains the unloaded speed, the curve's shape and the eccentric ceiling, each sourced.
- **The Havok side:** a velocity motor whose maximum force is recomputed from the muscle every substep.
  - The speed is read once per substep (H50).
  - The stand tests the curve for stability at 120 Hz.
- **The human arm, trunk and neck move onto it.** No rate cap, `taskForce` dial or strength share remains where a muscle already bounds the move.
- **Acceptance** (Node stand and the ported strike search):
  - the typical Warrior's fist closes near 8 m/s and an elite build's near 9–11;
  - the club tip stays near the rod's 23.9 m/s;
  - the Rogue's ratios to the Warrior read against Miller's and Muggenthaler's figures, as a check, not a fit.

**The stage 2 assumptions.** `src/core/human/speed.ts` cites these. They stand until a measurement
contradicts one; the eccentric ceiling is the owner's decision.

- **Measured curves.** Hip, knee and ankle dorsiflexion go through Anderson's two printed points
  (C4 at 75 % of isometric, C5 at 50 %), each sex its own. The elbow is fitted to Frey-Law's
  65° columns by least squares at Thelen's curvature of 0.25. Fitted freely, those columns barely
  pin the unloaded speed: curvatures from 0.05 to 0.8 fit about as well, with unloaded speeds from
  80 down to 11 rad/s. At 0.25 the fit is within 5 % of isometric from 120 °/s up, and 7-14 % high at
  60 °/s, where the paper's torque drops fast.
- **Borrowed curves.**
  - The shoulder, forearm and wrist take elbow flexion's curve.
  - Hip ab/adduction and rotation, the trunk and the neck take hip flexion's, a near-linear curve with
    an unloaded speed near 9 rad/s.
  - Plantar flexion and the foot take dorsiflexion's. Anderson's plantar flexion gives no valid curve.
  - A borrowed curve's rule string names the curve it takes.
- **Eccentric side.** Thelen's ceiling is 1.4 × isometric, with a slope ratio of 2, everywhere.
  It is a stimulated muscle's figure; voluntary lengthening reads nearer 1.2-1.3. **Owner,
  2026-09-28: keep 1.4** for fighters' braking and blocking.
- **Hip unloaded speed** is 6.5-9 rad/s. That may be too slow for sprinting: stage 4 reads it
  against running.

**Stage 2's findings** (Node stand unless named):

- **Havok's nodes lag its bodies.**
  - After a motor's or a limit's impulse, the nodes move behind the body's velocity for several
    steps. A body given 6.07 rad/s turned its node 4.03, then 5.83, 5.92, 5.98 rad/s.
  - Joint speed is therefore read from the bodies' angular velocities, and so is the lab's fist.
  - A driver reading the nodes pushed joints already at speed: a rod capped at 12 rad/s reached 17.6.
    With the velocity reading it peaks at 12.32.
- **The velocity motor.**
  - Saturated, it is exact.
  - With room to spare, it rings about its target: asked for 6 rad/s, a rod read 5.97, 8.62, 6.26,
    4.79, 5.76.
- **Rejected: a ceiling read implicitly at the step's end.** It ignores every other torque on the
  joint, and a muscle stretched by a steady load yielded four times too fast.
- **The rate.**
  - A pinned Warrior's scripted straight, on his sourced curves, peaks at these fist speeds. The
    muscle model converges.

    | rate | peak fist (m/s) |
    |---|---|
    | 120 Hz | 6.85 |
    | 240 Hz | 6.47 |
    | 480 Hz | 6.45 |
    | 960 Hz | 6.40 |

  - The angle servo that brakes a joint does not converge at 120 Hz. On the lab routine a Warrior's
    elbow opening at 34 rad/s, braked by his flexors at 105 N m, reversed to 22 rad/s in one step,
    and the fist read 12.2 m/s on each of the routine's three straights, on the Node stand and on the
    lab page alike. At 480 Hz the straights read 6.4, 6.4 and 7.5 m/s on the Node stand and 6.4 each
    on the page.
  - Self-collision is not the cause.
  - **Owner, 2026-09-28: the game stays at 120 Hz and the servo is fixed.** Two servos failed.
    - Asking for the goal's speed at once rang, as above.
    - Asking for a torque (the limb's inertia times a damped acceleration, plus gravity's moment)
      was steady on a chain of rods and chattered on the body: an explicit torque is stable only
      against the lightest segment it acts on, and the middle trunk between two driven trunk
      joints reversed at up to 12 rad/s every step.
  - `servoToward` (`src/core/control/servo.ts`, replaced 2026-09-29, below) asked the velocity
    motor for the speed a critically damped motion reaches one step later. It needs no inertia, and it holds a limb's weight by
    itself. On the lab routine (Node stand):

    | peak fist, m/s | 120 Hz | 480 Hz |
    |---|---|---|
    | Warrior | 6.73, 6.59, 6.57 | 6.47, 6.56, 6.52 |
    | Rogue | 5.03, 5.00, 5.04 | 5.02, 5.08, 5.07 |

  - Havok's velocity motor still adds about a third to each change it is asked for, so a servoed
    rod runs 3-4 % of its move ahead of the damped motion, at both rates.
  - A straight's elbow meets its extension stop at about 35 rad/s and bounces back at 6 rad/s at
    120 Hz and 2 at 480. That is the stop, after the fist's peak: recorded, not yet changed.
- **The servo's time constant** is 0.1 s. Late in each settle no joint reverses by more than
  0.005 rad/s a step, at 120 Hz and 480 Hz, and the guard is held within 0.026 rad from the first
  second: Havok's brake on slow bodies, below (`SERVO_SECONDS` in `src/core-lab/routine.ts`).
- **The lab page.** `/core-lab.html` shows a chosen human walking forward, throwing three straights,
  and walking back. Two scaffolds stand in until later stages: a carried pelvis until stage 4, and
  hand-set joint poses until stage 3.
- **The strike search** (`research/core-strike-search.mjs`: cross-entropy search over a chamber and
  timed pushes on the trunk and striking arm; Node core stand, pelvis carried still; the score is the
  fist's forward speed as it enters a head-sized sphere ahead).
  - **It found a fault in the driver before it found a strike.** Allowed to push the wrist, its best
    blow flicked the hand: the wrist went from rest to 23 rad/s in one step at 120 Hz, against 16 at
    480 Hz at the same moment. The curve was read at the speed a step begins with, and the fastest
    freedoms' muscle time constant (inertia beyond the joint times the unloaded speed, over the
    isometric peak times 1 + 1/curvature) is far shorter than a step: the Warrior's shoulder internal
    rotation 0.43 ms, ankle 0.56, wrist 0.64; the Rogue's 0.54-0.71. A step is 8.3 ms at 120 Hz. A
    light segment crossed its whole curve in one step at its isometric torque. The scripted straights
    did not show it; a search did, and so would a searched or learned mind in the game.
  - A rate table of the searched blows' peaks, recorded here before, is withdrawn: the evaluator's
    peak stops at contact, so a rate whose blow missed read a longer path than one whose blow hit.
    Rates are compared on the fist's path with no target.
  - **The fix** (`src/core/muscle/driver.ts` has the argument and the rejected alternatives): the
    motor's target is held to where the curve's tangent at the step's speed reaches zero
    (`forceVelocityReach`), which the convex shortening branch keeps under the curve, and a joint
    the muscles are braking is held to the reach from rest. On a forearm and hand driven flat out
    (Node stand), the hand at 120 Hz against 1920 Hz: 3.69 against 3.64 m/s at 0.025 s (4.71
    before); started 0.06 s late, 4.7 against 4.5 (5.3 before). The lab's straights at 120 Hz read within
    3.5 % of 1920 Hz for the Warrior; the Rogue's are within 3.2 % of 480 Hz and up to 8.5 % under
    1920 Hz, whose own straights are no steady reference (the driver's doc has the table). The game
    stays at 120 Hz.
  - **One blow is chaotic, so a search scores several** (`perturbed` in `research/core-strike.mjs`
    has the numbers). Random strikes read 1.9 % apart when every activation was scaled by 0.9999
    (0.7 % with self-contact off), and 11-12 % apart between 1920 Hz and 3840 Hz; 120 Hz is not
    biased on average (mean ratio 0.97-0.99 against 3840 Hz). Ten searches that took the best
    single run each read higher at 120 Hz than at 1920 Hz, by up to 95 %. A candidate's score is now
    its mean over four runs, each push moved within half a 120 Hz step and scaled within 2 %.
  - **Searched at 120 Hz on the fixed driver** (Node core stand; 96 candidates, 50 generations, the
    best read again as the mean of eight fresh trials), forward m/s at the target at 120 Hz, then
    1920 Hz (a miss reads 0):

    | | seed 1 | seed 2 | seed 3 |
    |---|---|---|---|
    | Warrior from the guard | 4.5, 0 | 10.2, 9.3 | 8.9, 7.0 |
    | Rogue from the guard | 6.6, 0 | 10.4, 8.8 | 6.1, 0 |
    | Warrior, free blow | 10.4, 1.1 | 12.6, 0 | |
    | Rogue, free blow | 9.2, 0 | 9.7, 0 | |

    Each blow is steady at 120 Hz across its trials, and most miss at 1920 Hz: a blow tuned at one
    rate follows another path at another. Seeds still disagree by a factor of two, every blow from
    the guard arrives 0.32-0.44 s after it starts (wound up, not a straight), and the Rogue matches
    the Warrior. Nothing here is read against the acceptance above yet.
  - **Where the rates part.** With no pushes at all, only the servo returning the arm from one
    searched chamber to the guard, 120 Hz and 1920 Hz differ. At 1920 Hz the elbow was flung to its
    stop at 9.7 rad/s. That was the driver bounding motors by the wrong muscles: it read the side
    from the change of speed asked, which a servo keeps small, so wherever a load outweighed the
    change the braking muscles' work went to the other side (1127 steps over the pulling side's
    ceiling at 1920 Hz, 1 at 120 Hz). It now reads the side from the torque the step needs, and the
    fling is gone (the driver's doc has the counts and the rules rejected).
    What remains is the servo meeting Havok's motor. With self-contact off (Node stand, the Rogue's
    return), 1920 Hz and 3840 Hz agree: the fist peaked at 2.52 and 2.48 m/s, and the two stayed
    within 0.4 m/s. At 120 Hz it peaked at 5.0 m/s. Havok's velocity motor misses each target by about as much as it was
    asked to change: RMS miss against RMS change asked, over the steps a motor had room, 0.119
    against 0.108 rad/s at 120 Hz, 0.028 against 0.024 at 480 Hz, 0.008 against 0.006 at 1920 Hz. At a
    fine rate that error comes and goes within a few milliseconds; at 120 Hz it lives at the servo's
    own time scale.
    Most of the miss is the ring the driver's doc describes, and the ring comes with the plugin
    telling Havok to expect exactly the step it is handed. Told to expect 1/240 s while stepping
    1/120 s, the rod's ring mostly goes, and the Rogue's return at 120 Hz follows 480 Hz's run: a
    peak of 3.3 m/s against 2.9, and within 0.05 m/s from 0.23 s on. But 480 Hz is not the converged motion either, and the setting changes more than the
    ring: told to expect 1/7680 s, the 1920 Hz run left 3840 Hz's. On random strikes (n=16 in each of
    four cells, self-contact off) it moved 120 Hz's peaks no closer to 3840 Hz's (0.81-0.94 of them,
    against 0.88-0.95 without it), for about a quarter more time a step (timed six runs at once). So it is not taken.
  - **The servo at 120 Hz (2026-09-29): computed torque** (`servo` in `src/core/control/servo.ts`
    has the argument, the numbers and what was rejected). Two faults, both counted in steps:
    - The servo asked each motor for its own freedom's change, but a freedom's angle is not the
      speed its motor drives: past a quarter turn of shoulder flexion, abduction's motor axis has
      turned past square to its angle's. The servo now asks for changes of the angles' rates and
      turns them into speeds through the joint (`turningToRef` in `src/core/build/joint-state.ts`).
    - Havok's velocity motor builds its impulse over several steps when what it turns carries
      other bodies, and does so by step, not by time. A saturated motor is exact from the first
      step. So the servo gives torques: the body's mass matrix and gravity's term over the joints'
      speeds (`bodyDynamics`, `src/core/build/dynamics.ts`, checked against Havok's own energy and
      power in `tests/core-dynamics.test.mjs`), solved around the pushed freedoms and around any
      the muscles cannot drive as asked, each given to the driver as a torque source.
  - On the Node stand, 120 Hz against 1920 Hz: the Rogue's return from a searched chamber, hand
    peak 2.36 against 2.28 m/s (the velocity servo, 3.71 against 2.02).
  - **The motion under way, and the fist at its knuckles** (H74). The first acceptance searches
    on this servo found blows of 11-14 m/s, and a replay split the fist's speed by joint. The fist
    was read at the hand's far end, its fingertip, 0.2 m from the wrist, so a turn of the wrist
    counted at more than twice a fist's lever; it is read at the knuckles now (`SegmentSpec.points`,
    the third metacarpal's head). And the servo left out the part of the motion that goes as the
    square of the speeds: a fast forearm flung the servoed hand about the wrist at up to 83 rad/s
    while the servo asked the wrist for next to nothing. The body's dynamics now give that term
    (`BodyDynamics.bias`, checked against Havok's joint accelerations on a free chain in
    `tests/core-dynamics.test.mjs`), and the servo solves with it; the wrist turned at 7.7 rad/s on
    the same blow. Havok has no gyroscopic torque, so the term leaves it out.
  - The lab's straights now agree across 120, 480 and 1920 Hz to 1.5 %, the Warrior's peaking at
    5.55-5.69 m/s and the Rogue's at 4.57-4.71 with the joints read as Havok's limits measure them
    (H76; 5.7-6.0 and 4.7-4.9, to 2.5 %, in the Euler reading before it). `src/core/muscle/driver.ts`
    has the table. The
    Rogue's "elbow-stop whip", recorded here as a rate effect after the peak, was the missing term.
  - **Havok brakes slow bodies.** A body whose centre moves under about 0.12 m/s loses speed at a
    steady 0.3 m/s^2, at every rate and mass, whatever the world's limits, the joints' friction, the
    body's damping or the motor. A servo stops where its pull no longer beats it: the guard's
    wrists 0.03 rad short at 0.1 s, a band that goes as the square of the time constant. Recorded
    as the engine's, not compensated.
  - **A servo's time constant needs ten steps.** At nine the Rogue's wrists ring about pronation at
    6-7 rad/s, at 120 Hz and 240 Hz alike, and at ten they hold; the reach is not the cause. At
    120 Hz that is 0.083 s, against the lab's 0.1. Why ten is open; stage 3's motor control keeps
    its time constants at ten steps or more.
  - The strike searches above ran on the velocity servo, which held every freedom not pushed. Their
    table is void (H63); the argument about scoring several runs stands. So are the first searches
    on the torque servo, which found the wrist's whip and read it at the fingertip.
  - **Self-contact.** On the lab's routine (Node stand, 120, 480 and 1920 Hz) the only segments
    that met were each upper arm and the middle trunk, about 0.08 s into every straight. The trunk
    was a box on its stretch's extents, and the arm met its front upper corner 7-13 mm deep while
    11-23 mm clear of the clothed surface it was measured from (120 Hz, self-contact off). A trunk
    segment is now the convex hull of that surface (`src/core/spec/hull.ts`,
    `assets/humanoid/workshop-*-trunk-hull.json`), at no cost a step that could be read (0.14-0.15
    ms either way). Nothing meets on the routine at 120 Hz now; at 1920 Hz the Rogue's arm touches
    the middle trunk from 0.33 s into each straight, after its peak at 0.17 s. On random strikes (n=16 each,
    Warrior and Rogue, guard and not, 120 Hz) 14-15 of 16 still meet themselves with either trunk:
    arms on the trunk's sides, a hand on the head or on the other hand. Those are a body's own
    contacts, which the straights' corner was not.
    The club waits for a held weapon in the core.
  - **The acceptance searches on the torque servo, and the joints' limits** (H76). Three seeds of
    the strike search each for the Warrior and the Rogue, from the guard and free (Node stand, 120
    Hz, then replayed at 480 and 1920 Hz), found mean fists of 6.8-9.5 m/s from the guard and
    9.4-11.9 free for the Warrior, 6.0-8.7 and 9.5-10.7 for the Rogue. A replay split by joint showed
    the blows breaking the arm's ranges by 0.5-1.7 rad about a quarter second in, with self-contact
    off too, and the free ones swinging the arm overhead. The core had read a joint of three
    freedoms as Euler angles, the measure Havok's position motors hold; its limits measure a swing
    and a halfway twist. The joints are read that way now (`anglesOf` in
    `src/core/build/joint-state.ts`), so ranges mean one thing to the solver, the readings and the
    search. That table is void (H63); the searches run again on the new reading.
  - **The acceptance searches on the swing-and-twist reading** (2026-09-29; `research/core-strike-search.mjs`,
    50 generations of 96, 4 trials a candidate, Node stand, pelvis carried still). The best blow's
    fist speed at the sphere, m/s: the search's mean over its trials, then the blow as written
    replayed at 120, 480 and 1920 Hz on the code of the stance's recovery commit (the replay at
    120 Hz matches the search's own first trial to 0.01, so nothing since changed the blow); "miss"
    is a fist that never reached the sphere. The time is the arrival after the blow starts, s.

    | | seed | search | 120 | 480 | 1920 | arrives |
    |---|---|---|---|---|---|---|
    | Warrior from the guard | 1 | 8.77 | 8.79 | 8.22 | 8.04 | 0.33 |
    | | 2 | 13.28 | 13.13 | miss | miss | 0.41 |
    | | 3 | 13.60 | 13.54 | 13.31 | 13.70 | 0.39 |
    | Warrior, free blow | 1 | 9.66 | 9.66 | 8.96 | miss | 0.17 |
    | | 2 | 11.29 | 11.38 | 10.22 | 10.08 | 0.16 |
    | | 3 | 10.44 | 10.40 | miss | miss | 0.17 |
    | Rogue from the guard | 1 | 5.85 | 5.86 | miss | miss | 0.28 |
    | | 2 | 7.27 | 7.17 | 7.13 | 7.04 | 0.39 |
    | | 3 | 4.94 | 4.96 | 4.72 | 4.69 | 0.28 |
    | Rogue, free blow | 1 | 8.43 | 8.41 | miss | miss | 0.16 |
    | | 2 | 9.60 | 9.67 | miss | miss | 0.15 |
    | | 3 | 8.57 | 8.57 | 7.93 | 7.85 | 0.15 |

    **Read against the acceptance, it is not met.** The Warrior's blows from the guard reach 13.3
    and 13.6 m/s on two seeds of three, past the elite's 9-11, and arrive 0.39-0.41 s after they
    start: wound up, not straights. Free, it throws 9.7-11.4, in the elite's band rather than near
    the typical 8. The Rogue's to the Warrior's, over the seeds' means, is 0.51 from the guard and
    0.85 free; the seeds disagree too much for that ratio to be read against Miller's and
    Muggenthaler's figures. Six of the twelve blows found at 120 Hz miss the sphere at a finer
    rate: tuned at one rate, a blow follows another path at another (the 120 Hz servo agrees with
    1920 Hz on the lab's straights to 1.5 %, but a searched blow rides the edge of what reaches
    the sphere). What the search should hold a straight to -- its time, its path -- is an owner's
    choice (stage 2's is on the morning list).
  - **The acceptance searches thrown standing, at 960 Hz** (2026-09-29, Havok; the same search, 40
    generations of 96, 4 trials a candidate, Node stand, on its own feet under the stance, as the
    club's unit was found: a standing blow converges from 960 Hz). The best blow's fist speed at the
    sphere, m/s: the search's mean, then the blow replayed on 8 trials at each rate; the arrival
    after the blow starts, s, at 1920 Hz.

    | | seed | search | 120 | 480 | 960 | 1920 | 3840 | arrives |
    |---|---|---|---|---|---|---|---|---|
    | Warrior from the guard | 1 | 8.99 | 5.06 | 8.92 | 8.99 | 9.00 | 8.98 | 0.34 |
    | | 2 | 8.95 | 6.96 | 8.71 | 8.97 | 9.05 | 9.07 | 0.36 |
    | | 3 | 5.18 | 5.31 | 5.19 | 5.18 | 5.17 | 5.16 | 0.31 |
    | Warrior, free blow | 1 | 8.67 | 8.36 | 8.66 | 8.67 | 8.67 | 8.67 | 0.16 |
    | | 2 | 9.45 | miss | 9.48 | 9.44 | 9.45 | 9.45 | 0.15 |
    | | 3 | 9.49 | 4.85 | 9.53 | 9.44 | 9.43 | 9.43 | 0.14 |
    | Rogue from the guard | 1 | 8.17 | 7.43 | 7.90 | 8.14 | 8.20 | 8.21 | 0.34 |
    | | 2 | 8.46 | 6.48 | 8.23 | 8.41 | 8.34 | 8.33 | 0.38 |
    | | 3 | 7.81 | 2.64 | 7.50 | 7.81 | 7.83 | 7.83 | 0.32 |
    | Rogue, free blow | 1 | 8.32 | 7.03 | 7.12 | 7.25 | 8.28 | 8.31 | 0.17 |
    | | 2 | 8.95 | 8.70 | 8.91 | 8.94 | 8.95 | 8.96 | 0.15 |
    | | 3 | 8.44 | miss | 8.37 | 8.41 | 8.42 | 8.41 | 0.16 |

    Standing, the blows converge: from 960 to 3840 Hz within 0.2 % on eleven of twelve (the Rogue's
    first free blow reads 7.25 at 960 Hz and 8.3 above it). At 120 Hz they read from none to 97 %
    of it. **Read against the acceptance:** the Warrior's best from the guard is 9.0 m/s and free
    9.4, at the elite's 9-11 lower edge and past the typical 8, with no wound-up 13 m/s blows now
    that the pelvis is not carried; the Rogue's best, 8.3 and 9.0, is 0.93-0.95 of the Warrior's,
    where the references have her slower by more. Seed 3 of the Warrior's guard (5.2) found a
    local best. These readings are Havok's; on Rapier (branch `core-rapier`) they are to be taken
    again.

### Stage 3: one world, one body, one command

- **`src/core/world.ts`:** a fixed-step `World.step` owning physics, control and combat, with a deterministic clock. The harness is a thin caller.
- **One body class,** assembled from a spec. Per-family behaviour is a module the spec names.
- **The command** is goals:
  - hand targets in the body frame (position, orientation, speed);
  - trunk posture;
  - locomotion goals with gait verbs.

  The mind sees a view and returns goals. `Intent`'s mouse-shaped hand becomes the player's input adapter only.
- **A person never commands muscles** (owner, 2026-09-28). The arrow keys or WASD choose which way to
  face and which way to attack, the attack is armed separately (as today), and the body's own mind
  turns that into goals.
- **Motor control** turns goals into muscle activation: IK plus servo, bounded by the muscles.

**What landed (2026-09-29).**
- **`World.step`** (`src/core/world.ts`, `tests/core-world.test.mjs`): the step hooks in the order
  added, one solver step (Havok's own, never Babylon's accumulator), then the after-step hooks. The
  clock is the count of steps. `advance` turns a frame's time into whole steps, carries the
  remainder and drops what it cannot take, so a page that falls behind runs slow. The world turns
  off the scene's own stepping. The muscle driver, the lab's routine and timeline, the core stand
  and the strike research run on it; the lab page makes a world on each load, at the chosen rate.
  Stepped whole or from uneven frames, the same steps give the same pose to the bit.
- **Motor control, hands first** (`src/core/control/motor.ts`, `kinematics.ts`,
  `tests/core-reach.test.mjs`):
  - **Goals.** A posture (angles by freedom) and, for each hand, a place for its knuckles in the
    body frame (the root's, so it moves with the pelvis) and a time to get there.
  - **Path.** The knuckles travel a straight, minimum-jerk path.
  - **Inverse kinematics.** Each step the path's point becomes the shoulder's and the elbow's
    angles: damped least squares, with the redundant swing drawn toward the posture's through
    the undamped null space, clamped to the joints' ranges, each pass's turn bounded. The trunk
    and the wrist are held at the posture's angles.
  - **Servo.** It follows those angles with rates and accelerations fed forward, differenced a
    step either side along the path.
  - **Measurements** (Warrior, lower trunk held, 0.2 m reaches over 0.4 s, Node stand, joints
    read as Havok's limits measure them, H76):
    - the knuckles keep within 8.3 mm of the path at 120 Hz and 1.5 mm at 1920 Hz;
    - they end 0.6-1.4 mm from the goal at both rates, the rates' ends 4.0-4.2 mm apart;
    - without the fed-forward acceleration they strayed 25-32 mm, and without the rates 110 mm
      (in the Euler reading, before H76).
    - A place out of reach leaves the arm stretched toward it (the Rogue, 0.3 m forward: 36 mm
      short at both rates).
  - **Precision and give** (H75). The kinematics had first gone through Babylon's float32
    rotation, which ruined the differenced Jacobian; they now match the body to 0.05 mm with
    gravity off. At 120 Hz, the elbow's hinge gives 0.7 deg under the forearm's weight, which is
    most of the 120 Hz goal's extra 2 mm.
  - **Not yet:** the hand's orientation and speed as goals; the trunk as a goal; the lab's
    straights as hand goals.
- **One body class, commanded and seen** (`src/core/body.ts`, `tests/core-body.test.mjs`).
  `createBody(built, world)` is every core body: its muscles under motor control. Whatever drives
  it -- a mind, the lab's routine, a test -- is handed its view each control step and returns a
  command, and nothing else reaches the joints.
  - **The command:** a posture by freedom, a place and a time for each hand's knuckles (a goal equal
    to the last keeps its path, so a mind may restate it every step), and pushes: freedoms driven
    flat out by their muscles, which the servo solves the rest around.
  - **The view:** the clock, every freedom's angle, each fist's knuckles in the world with their
    velocity, and the knuckles in the body frame, where hand goals are set.
  - **The lab's routine is a driver of it**, its guard, chamber and legs a posture and its strikes
    pushes. Moved, it gives the same world to the bit over 14 s of both humans (Node stand, 120 Hz).
    Its carried pelvis stays a scaffold outside the command until stage 4 stands the body up.
  - **Measured** (Warrior, lower trunk held, Node stand, 120 Hz): the posture held to 0.022 rad; a
    hand goal restated each step reached to 1.5 mm; the pushed elbow opened from the guard to
    0.08 rad from straight, the fist at 7.9 m/s; the released arm back on the posture to 0.006 rad;
    the view's two readings of the knuckles one point.

### Stage 4: locomotion v2, force-bounded stepping, for the human

- **The model.**
  - The centre of mass is driven by ground-reaction forces at the actual stance feet, inside the friction cone and within the legs' muscle capacity.
  - The pelvis and trunk follow, and the legs are placed by IK onto planned footholds.
- **Stepping.** Footholds come from the capture point. A push the stance cannot absorb produces a step. A fall is when no reachable step captures the body: the fall is physical, and its direction is the push's.
- **Gaits in the same model:**
  - stand, walk, run (with flight, a spring-mass stance), dash or lunge (a bounded burst), sidestep;
  - then roll, and getting up.
- **Assistance** is explicit, bounded and logged. The readout says how much of a move was assisted.
- **Acceptance** (Node stand):
  - it stands still without drifting;
  - walk and run speeds and a reversal time against human references;
  - under calibrated shoves, it steps and then falls past a stated impulse;
  - the whole-shove table from 4350cb8e, re-run, does not multiply falls.

**On Rapier the stance is the model above** (branch `core-rapier`, the last part of this stage).
The Havok stance that follows, down to the torque stance, is at commit eaa182e5; its figures are
Havok's.

**What landed (2026-09-29): the stance** (`src/core/control/stance.ts`, `tests/core-stance.test.mjs`).
- **It departs from the model above, on a measurement.** The legs are not driven by the forces the
  centre of mass needs. A torque source on an ankle rocks the foot on Havok's contact (10 N m lifts
  the Rogue's settled foot 1.1 mm and spins it at 0.25 rad/s). A computed torque rooted at the foot
  read that rocking as the body's turn and asked hundreds of newton metres to stop it; rooted at
  the pelvis, the hips spun the light pelvis between legs and trunk. Re-rooting the servo's
  dynamics at a pinned foot did match Havok's kinetic energy and gravity power, so the model was
  right and the loop was not; the patch is kept outside the tree.
- **The stance is kinematic.** It plans the centre of mass's way to its goal, critically damped,
  and asks the pelvis for the plan's velocity plus the error from it. Each stance leg's speeds for
  that pelvis motion, foot still, are its Jacobian undone by damped least squares. They go to the
  muscles as speeds at full activation, so Havok's solver finds the torques with the ground's push.
- **The two legs are a closed chain, and the solver leaves it soft**: after a step the Rogue's pelvis
  moved at 21.6 cm/s when asked for 1.1. The pelvis is also asked for twice the centre of mass's
  velocity error, the plan's less the body's (`STANCE_VELOCITY_GAIN`, from a sweep of 48 steps:
  12 fail with none, none at 2). With it, the earlier share of the drive by the weight a leg bears and
  the plan's speed limit are gone: neither changed a result.
- **The height is what the legs reach.** No higher than each leg reaches with its knee bent by
  0.2 rad (`STANCE_KNEE_BEND`; a straight knee is singular, and at its stop the Jacobian asked the
  Warrior's for 2 to 4 rad/s more); no lower than each reaches with its ankle 0.01 rad short of its
  dorsiflexion stop (`STANCE_ANKLE_SPARE`). Asked 5 cm under a stance 3 cm low, the Rogue's ankles met
  their stop and it toppled backward; held above it, each human stands some 5 cm under its reference
  height at the lowest. A lower stance needs the hip to hinge, or a larger ankle range.
- **Solver conditioning, named and measured:** a stance foot's rotational inertia is raised 100
  times while it stands. At its own inertia the solver stalls; the Warrior falls, and even at 480 Hz
  the Rogue stops 3.25 cm behind. The table is on `STANCE_FOOT_CONDITIONING`.
- **The held region:** the goal is held inside the soles' outline drawn halfway in
  (`SUPPORT_INSET` 0.5). Nearer the edges, the everters (20-27 N m) saturate and the far foot bears
  nothing; the sweep is on `SUPPORT_INSET`.
- **A step** (`StanceGoal.swing`: the foot, where its sole's middle lands, the swing's time and
  lift). The stance shifts its plan over the bearing sole, lifts the foot once the capture point
  (Pratt et al. 2006) is over that sole, and carries it on a minimum-jerk path with a lift, tracked
  at a 0.1 s constant, its turn held. In the swing the plan falls as an inverted pendulum about a
  pivot in the bearing sole, chosen by capture-point control (Englsberger et al. 2011) to bring the
  capture point to between the soles when the foot lands.
- **A step to catch a push** (`STANCE_RECOVERY`). Standing on both feet, once the measured capture
  point is 1 cm outside the region the soles hold, the foot away from it steps without a weight
  shift, to where the capture point will be when it lands -- running away from the bearing sole
  for the swing's 0.2 s -- and 15 % further, a sole's width out from the bearing foot at least. The
  step runs to its landing, and the stance holds the new feet; if the capture point is still out,
  it steps again. A goal that asks for its own step, or stands on one foot, takes none.
- **Measured** (Node stand, 120 Hz):
  - Both humans stand 3 cm low for 5 s within 0.9 mm of the soles' middle, drifting under 0.6 mm
    over the last 2 s.
  - The Rogue goes 2 and 3 cm across, 3 cm down and turns 0.2 rad, stopping 3.4 mm from the place.
  - A place 30 cm out each way is held at the outline's edge within 6 mm; the far foot slips once,
    6 mm, at -x.
  - Asked 10 cm down and 3 cm forward, each human stops about 6 cm above the height, its ankles
    inside their range, and stands; with no floor, each falls.
  - Each human steps each foot 15 and 25 cm forward, 15 cm back and 10 cm out, landing within
    15.3 mm of the asked place, and stands within 3.2 mm of its place; the bearing foot moves at most
    8.8 mm. Of the sweep's 48 steps, none fails; 30 cm forward and 25 back are marginal, and a 30 cm
    step from standing in 0.45 s cannot carry the capture point that far over one sole.
  - Shoved level at the middle trunk's centre of mass by 10 to 60 N s, sixteen ways, from 3 cm
    under the reference height: without steps the Rogue holds 47 of the 176 shoves, 19.4 N s on
    average over the ways (10 the least), and the Warrior 73, 27.5 (15); stepping, 114, 40.0 (30)
    and 168, 56.3 (35). Sideways is the weakest way: the far foot steps out with no weight shifted
    first. Many held shoves take two or more steps: a long step leaves a wide stance whose soles
    hold a thin band, and a foot slips at the engine's default friction (0.5, the lesser of the two
    touching; contact materials are stage 5's).
  - No human reference for these impulses is sourced yet, so the acceptance's "stated impulse" is
    the table on `STANCE_RECOVERY`, not a comparison.

**What landed (2026-09-29): walking** (`StanceGoal.walk`, `walkStep`, `STANCE_GAIT`).
- **A walk is a velocity asked of the stance.** Its steps alternate; each lands where the measured
  capture point says the next stance must be to carry the pace, the soles 20 cm apart across the
  heading, and the pace goes toward the one asked at 1 m/s^2. Asked for none, a walk still under
  way steps until its capture point is inside what the soles hold, then stands.
- **Two findings shaped it.** A step fixed to fall about its bearing sole's middle multiplies a
  landing's miss by exp(wT), about 3.7, each step: the steps widened until the feet could not
  reach, so each step now chooses its pivot within the sole. A foot carried at the turn it left
  the ground with drifted in yaw, step by step, to 50 degrees off; it now lands facing the heading.
  A foot rolling onto its toe's edge before it lifts was built, cost 30 held shoves and did not help
  the walk, and was taken out.
- **Measured** (Node stand, 120 Hz; each human, 12 s at 0.2-0.7 m/s five ways, 1 and 3 cm low):
  93 of 100 walks hold, every one up to 0.5 m/s; they go at about 0.84 of the speed asked. A
  reversal reaches 0.9 of the new pace in 1.07 s on average; 51 of 60 stopped walks settle. On
  this code 1 of the 48 steps fails (the Warrior's right foot 25 cm back, a marginal one), and the
  shove table reads as before but for the Warrior, who falls to 20 N s from behind.
- **Against the acceptance: not met.** A human's preferred walk is near 1.4 m/s; this one falls
  above 0.5. The limits found are the ankle's dorsiflexion range (a deeper crouch is worse) and the
  trailing foot's toe scuffing with its ankle at its stop: a faster walk needs a foot that rolls
  over its ball, an anatomy change. Running (flight) is not attempted. No human reference for the
  reversal time is sourced yet.
- **A known defect: some stopped walks sway.** 9 of 60 sway from foot to foot, 2-4 cm either way at
  about 0.12 m/s, and do not settle. The cause is the foot conditioning: a foot rocked onto its
  edge does turn, and at 100 times its inertia it turns as a flywheel. Lower factors settle more
  (19 still moving at 100, 4 at 30) but fail more steps and let a lean to the soles' edge set off
  falling recovery steps; Havok exposes no solver iterations to raise instead. The table and the
  choice are on `STANCE_FOOT_CONDITIONING`.
- **Also found:** with recovery steps off, a sideways kick of 0.3 m/s or more rocks the body
  harder each cycle until it falls, because a stance foot that lifts is still driven as if planted.
  Driving a lifted foot back onto the ground held 30 of 32 kicks against 12 of 24, but with
  recovery steps on it changed no shove cell and failed one or two more of the 48 steps, so it is
  not in.
- **Assistance:** none. Nothing but the legs' muscles holds the body up; the only non-anatomical
  term is the foot conditioning, named as solver conditioning.
- **The lab** (2026-09-29): the game's Lab (`?play=lab`, which `/core-lab.html` forwards to) opens on
  a scenario menu. The Stance scenario (`src/core-lab/stance-mode.ts`, `tests/core-lab.test.mjs`): W A S D or the arrows walk the chosen human at 0.2-0.5 m/s, Q and E
  turn it while it walks, and the panel shoves its chest 10-60 N s four ways. The readout is the
  stance's own. On the ground are the centre of mass, the capture point and the held place. The
  last 10 s can be scrubbed. The Routine scenario is stage 2's routine. In both, the panel's loadout
  (`src/core-lab/loadout.ts`) puts the wooden club in either hand or both, and shows or hides the
  model's boots and armour, which are its meshes alone. A hand holding the club closes on its haft
  (`CLUB_GRIP`, `src/core-lab/club-grip.ts`, fitted on the skin by `scripts/core-lab/haft-fit.mjs`
  and held to it by `tests/core-lab-grip.test.mjs`); the skin's fingers only, the core's grip is
  unchanged. With a club in each hand, each human stands, walks and stops in the Stance
  (`tests/core-lab-loadout.test.mjs`, Node stand, 120 Hz).
  The Run scenario (`run-scenario.ts`, `run-mode.ts`) sends the body round a track (`track.ts`),
  a 4 m circle or 6 m back and forth round 0.3 m half-turns, asking the stance for 0.5 m/s, its
  fastest held walk, and the Routine's 0.3 m/s into a half-turn. Each human holds 30 s on either
  track and goes 0.26-0.29 m/s along it (`tests/core-lab-run.test.mjs`, Node stand, 120 Hz); a
  straight walk asked 0.3 or 0.5 m/s goes the same 0.25-0.29 m/s, so the walk's own pace, not the
  track, sets the speed. On Rapier's stance a walk goes the pace asked, and by the same rule its
  fastest held walk is 0.4 m/s (the Rogue held four of five walks at 0.5); asked 0.5, the Rogue fell
  a quarter of the way round the circle. At 0.4 each human holds 70 s on either track at
  0.36-0.37 m/s, and the shuttle's half-turns take 39.6 cm of the test's 40.
- **The stance's envelope** (2026-09-30, `src/core/control/stance-envelope.ts`): a body carries
  what the stance was measured to hold with it (`CoreBody.envelope`), and the Run asks for the
  body's fastest walk instead of a lab number that held on one engine. The measurement is the
  gait battery, written to `assets/core/stance-envelope.json` by
  `research/core-stance-envelope.mjs --write` with the harness and rate it ran on;
  `tests/core-stance-envelope.test.mjs` fails when those are not the core's, so a change of engine
  or rate re-measures it, and walks each human at its figure again. The rule is the fastest speed
  at which every way held, and every slower one: on Rapier at 120 Hz the Warrior held 5,5,5,5,3 of
  five at 0.2, 0.3, 0.4, 0.5 and 0.7 m/s, so 0.5; the Rogue 5,5,5,4,0, so 0.4. Measured unarmed
  under the core's stance tuning; a body under another tuning carries none. Asked 0.5, the Warrior
  went 45.6 cm off the shuttle: the run sped up at a half-turn's end while its heading, lagging the
  track's, was still 0.9 rad short. The run now keeps a bend's pace `STEER.metres` past it as well
  as before it. The envelope also carries the fastest turn: the heading turned half round each way
  at 0.25, 0.5, 1, 2 and 4 rad/s while walking at the fastest walk (`turn` in
  `research/core-stance-trials.mjs`). The Warrior held 2,2,2,0,0 of two, so 1 rad/s; the Rogue
  2,2,2,2,0, so 2. The Run turns at the body's turn and slows for a bend only where that cannot
  carry its walk round: the Warrior takes the shuttle's 0.3 m half-turns at 0.3 m/s, the Rogue at
  its walk. Farthest off the shuttle over 30 and 70 s, 31.7 cm (Warrior) and 26.7-31.0 (Rogue); off
  the circle, 13.4-13.6 cm (Node stand, 120 Hz). The lab's `LAB_TURN_RATE` (the Stance's Q and E,
  and the shuttle's radius) stays a lab setting, held inside every body's envelope by the test.
  The Blow scenario (`blow-scenario.ts`; its card puts the club in the right hand) throws a
  stored blow (`blows.ts`: today the damage unit's) standing, as the strike search throws it
  (`blow.ts`), into a head mark, and reads the landing as the search reads it (`club-blow.ts`):
  closing speed, the masses met, energy and hit points; it pauses after the blow, and the transport
  plays it at 1, 1/4 or 1/10 speed. On the Node stand at 120 Hz it lands with the search's
  45.94 J to the digit (`tests/core-lab-blow.test.mjs`). The unit's blow lands glancing on
  Rapier, and its energy follows float noise that moves no step of its timing: 37.6 J on a 20 m
  ground and 27.6 J on the lab's 40 m ground, in the page.
- **Found in the lab:** a 30 N s shove from the rest stance holds (one catching step, each human),
  but after a walk and a stop the stance was the gait's 0.2 m width, and the same shove could fall.
  **Fixed (2026-09-30): a stopped walk settles.** Once a walk has stopped and its capture point is
  held, one more step, of the foot that did not take the last, sets the soles back at the width the
  body was built standing at (`settleStep`; the width is read from the built pose, no new number).
  The sweep's shove battery (sixteen ways, 10-60 N s by 5, Node stand, Rapier, 120 Hz):

  | | Rogue apart | held | mean | least | Warrior apart | held | mean | least |
  |---|---|---|---|---|---|---|---|---|
  | built, at rest | 337.7 mm | 117/176 | 41.6 | 35 | 396.3 mm | 172/176 | 58.8 | 55 |
  | after 3 s at 0.3 m/s, before | 199.4 mm | 95/176 | 34.7 | 25 | 199.6 mm | 139/176 | 48.1 | 30 |
  | after 3 s at 0.3 m/s, settled | 338.1 mm | 118/176 | 41.9 | 35 | 397.2 mm | 172/176 | 58.8 | 55 |

  The stand, edge, step, walk and gait batteries and the stance envelope read the same to the digit
  before and after; `tests/core-stance.test.mjs` holds the width and a sideways shove past what
  each held at 90 degrees before (Rogue 30 N s, first fall 30; Warrior 45 N s, first fall 40).
  Asked for a lower centre of mass (8-16 cm), the stance stands about 1 cm lower, and walking from
  there falls, so the page has no crouch. A sideways walk at 0.3 m/s reads 0.10 m/s on the Warrior.
  At 480 Hz, a shove after a sideways walk fell for both humans, where at 120 Hz it held
  (Node stand).
- **The lab's routine walks on the stance** (`src/core-lab/routine.ts`; the strike search keeps the
  carried pelvis). It sets its feet 0.3 m apart before the strikes, walks a second straight before
  each turn, and steers its walks back onto the line. At 120 Hz both humans stood 20 loops, each
  loop ending within 0.36 m of its start, with strike peaks of 5.44 (Warrior) and 4.66 m/s (Rogue)
  against 5.56 and 4.64 carried; at 480 Hz the Warrior fell in its first turn (Node stand).
- **Found (2026-09-29): a step does not converge with the rate.** The Warrior's step that sets its
  right foot 0.3 m across and 0.15 behind (the routine's `set`), from standing as built, in the
  swing's last 60 ms: at 120 Hz the bearing foot held (x -0.199 m throughout); at 480 Hz it slid
  4 cm toward the swinging foot, and at 1920 Hz 15 cm, lifting 1 cm, before the swinging foot came
  down, and the body then staggered at up to 1.4 m/s. The weight shift before the swing took 0.28 s
  at 120 Hz and 0.53 s at 480 and 1920 Hz. The swinging foot landed within 1 cm at every rate.
  Standing as built converges (`src/core-lab/blow.ts` has the table), so the strike searches
  throw from there. Every stance figure above was read at 120 Hz; the stance's constants are the
  game rate's until this is understood.
- **Not yet:** a crouch and turning on the spot; running, the
  dash, rolling and getting up.

**What landed (2026-09-29, on Rapier): the torque stance** (`src/core/control/stance.ts`,
`src/core/control/contact-wrench.ts`, `tests/core-stance.test.mjs`, `tests/core-contact-wrench.test.mjs`).
- **The legs are driven by torques, through the whole body's floating-base dynamics.** The stance
  plans the centre of mass as before and asks for accelerations: the centre of mass's, the pelvis's
  turn, and each bearing foot's (none). The root's six rows of the body's dynamics
  (`BodyDynamics.root`) say what wrench the ground must give; each stance leg's accelerations follow
  from the root's and its foot's through its Jacobian; the wrench is shared among the bearing soles
  by a small quadratic programme inside each sole's contact wrench cone -- no pull, the centre of
  pressure on the sole, friction, twist (Caron et al. 2015; `shareGroundWrench`) -- and where the
  soles cannot give it all, the root is asked for what they can give. The rest of the body is
  servoed around that root; each leg's torques are its inverse dynamics less the ground's wrench on
  its foot, given to the muscles as torque sources, none past a muscle's strength. This is the
  stage's model: the centre of mass driven by the ground's reaction at the actual feet, within
  friction and the legs' strength.
- **Every inertia is the body's own.** A foot is 0.005 kg m2 and nothing conditions it;
  `STANCE_FOOT_CONDITIONING` and `STANCE_VELOCITY_GAIN` are gone, and with them the sway of a
  stopped walk.
- **A centre of pressure is kept off the sole's edge** (`SOLE_MARGIN`, 0.1 of the sole's half-length
  and half-width): at the edge, a place 30 cm to the side slid the feet 19 and 23 cm.
- **A knee past straight is brought back first.** The knee hyperextends 2 to 5 degrees before its
  stop, and past straight the leg's Jacobian shortens the leg by extending the knee into the stop:
  a Rogue that caught a push stood 13 mm over its plan on such a knee. That knee is asked back
  toward `STANCE_KNEE_BEND` ahead of the foot's task, the leg's other freedoms taking the task
  (`fixedSolve`, a prioritized solve); 0.6 mm.
- **Measured** (Node core stand, Rapier, 120 Hz; each constant's sweep is on its doc comment):
  - Both humans stand 3 cm low for 5 s with the centre 0.0 mm off the soles' middle, 0.0 mm of
    drift over the last 2 s, the feet sliding 0.4-0.5 mm (Havok's stance: within 0.9 mm, drift under
    0.6).
  - A place 30 cm out each of four ways is held at the edge of what the soles hold, 0.0 mm off, the
    feet sliding at most 0.6 mm.
  - Each human's 8 steps land within 1.8 mm, and none fails.
  - Shoved level at the middle trunk's centre of mass by 10 to 90 N s, sixteen ways (272 shoves),
    from 3 cm under the reference height: stepping, the Rogue holds 128, 44.7 N s on average over
    the ways (35 the least), and the Warrior 217, 66.9 (45, from behind; 55 every other way);
    without steps, 76, 28.8 (20) and 129, 45.3 (30). Havok's stance over 10 to 60 N s held 40.0 (30)
    and 56.3 (35) stepping.
  - Walking at 0.2-0.7 m/s five ways for 8 s, then stopping: 19 and 21 of 25 walks hold, every one
    up to 0.4 m/s, going at 0.93-0.94 of the speed asked, and every held walk stops.
  - The lab (`tests/core-lab.test.mjs`): shoved from behind, 35 and 55 N s, the Rogue catches
    itself in 2 steps and the Warrior in 4.
  - The lab's routine (`src/core-lab/routine.ts`; a loop of 26 s: a 2 m walk, a set step, three
    straights, a turn, the walk back, a turn) was not held: run for 20 loops, at 120 Hz the
    Warrior fell in its second loop's first walk and the Rogue in its ninth loop's walk back; at
    480 Hz the Warrior in its sixth loop's walk back and the Rogue in its third loop's second strike.
    The straights peak at 5.64-5.72 m/s (Warrior) and 4.80-4.90 (Rogue) at 120 Hz, against 5.44 and
    4.66 on Havok's stance. Four causes are fixed (below), and both humans now hold 20 loops from
    every start.
- **A swinging leg is solved within its strength, all its freedoms at once** (`boundedLeastSquares`
  in `bear`). Clipped one at a time, a hip at its strength left the knee's torque asking for the
  thigh's motion it did not get: the Warrior's foot dragged a whole step 1 cm up, landed 18 cm
  short, and the walk ran away. The weight check that found it read each foot's ground force from
  Rapier's contacts: the "bearing" foot bore the body on its toe, its heel 9 cm up, the plan's centre
  of pressure at the sole's front margin, and the leg's torques flipped step by step.
- **A strike's pushes are planned.** The freedoms a strike drives at a set torque were taken at rest
  when the root's acceleration was chosen, and solved only after: the ground gave the whole body
  the arm's and trunk's momentum. `carry` now has them move as their torque moves them, linear in
  the root's acceleration, as the legs are.
- **A swinging foot turns at its path's rate.** Its place followed a minimum-jerk path with the
  path's speed and acceleration fed forward, but its turn was only pulled onto its path at the
  swing's constant, and the pull's damping held it back: a foot turning 60 degrees over a swing
  lagged the whole of it. Walking straight, nothing showed. In the routine's turns (1 rad/s) the feet
  landed 30 to 75 degrees off the heading, the pelvis turned the bearing inside hip onto its
  internal-rotation stop (48 degrees, the Rogue), and that foot's swings lifted 0.5 to 2 cm of the 5
  asked, dragged and landed short; on the walk back the right steps landed 9 to 30 cm short and the
  walk ran away to 0.9 m/s. A test steps each foot turned half a radian: it lands within 0.009 rad
  of the heading, and 0.224 off without the path's rate (the control).
- **The ground's share never comes back NaN** (`shareGroundWrench`). Its active set took a limit
  into the working set when the step moved toward it, the step's cosine with the limit's normal
  deciding whether the limit was independent of the working ones. At a degenerate corner the step
  fell to rounding (6e-9 N) and had rounding's direction, so a limit that was a combination of the
  working ones seemed to block; the next solve was singular, and all twelve leg torques came back
  NaN. A Rogue in its routine's fourteenth loop, striking, then flung its right foot at 6 m/s and
  fell. A limit now blocks only if its normal has a part outside the working limits' span, which
  is decided from the limits alone. Over 20000 random two-sole problems shaped like the stance's,
  none comes back NaN, against 34 before (the control); the stance battery reads as it did.
- **Measured** on the lab routine from seeded starts (`research/core-routine-battery.mjs`: a 3 N s
  push at 0.5 s in a direction the seed picks, up to 5 loops; Node core stand, Rapier), loops
  completed:

  | | Rogue, 120 Hz (24 runs) | Warrior, 120 Hz | Rogue, 480 Hz (12 runs) | Warrior, 480 Hz |
  |---|---|---|---|---|
  | legs clipped alone | 43 of 120 (2 through) | 33 (2) | 23 of 60 (2) | 36 (5) |
  | the swing bounded | 69 (8) | 100 (18) | 23 (2) | 54 (9) |
  | and the pushes planned | 84 (12) | 109 (20) | 56 (11) | 60 (12) |
  | and the swing's turn at its rate | 120 (24) | 120 (24) | 60 (12) | 60 (12) |

  Over 24 runs of 20 loops at 120 Hz the Rogue completed 466 of 480 (22 through: one fell in a
  turn in its 13th loop, one in the settle after the strikes in its 15th, each after the share came
  back NaN in that loop's second strike) and the
  Warrior all 480; with the share fixed, both complete all 480, and at 480 Hz, over 12 runs of 20
  loops, both all 240.
  The bound costs shoves: 117 and 202 held of 272, against 128 and 217 (`bear`'s note); with the
  turn's rate the Warrior holds 209.
- **It converges with the rate.** At 480 Hz (the same batteries, shoves 10-60 N s) both humans
  stand as still, their steps land within 1.9 mm, and the shoves held read 46.6 (35) and
  58.4 N s (55) against 44.7 (35) and 57.8 (45) at 120 Hz over the same range. On Havok a step
  did not converge with the rate (above).
- **Known:** with self-contact on, the Rogue shoved forward ends with its thighs pressed together at
  16 N and 2 mm over its plan; the stance does not model the thighs' contact.
- **Fixed (2026-09-30): the sideways catch.** Shoved straight to the side, the far foot stepped in
  beside the near one and then stepped in again, a centimetre or two each time, while the body
  fell off the near foot's outer edge (the Warrior at 60 N s: 15 steps, then down). Once the far
  foot's step would move it less than its sole's width, the near foot now steps out, the far one
  bearing the body, no further than the gait's longest step: the unloaded foot steps in and the
  other steps out, as people do (Maki and McIlroy 1997). Taken whenever it was within reach, the
  step out came where a short step of the far foot would have done, and the Warrior pushed from
  behind and to the side held 65 N s against 85. The shove battery to 90 N s (Node core stand,
  Rapier, 120 Hz), the impulse held before the first fall, by way from forward, clockwise:

  | | held of 272 | mean | least | the sixteen ways |
  |---|---|---|---|---|
  | Rogue, before | 117 | 41.6 | 35 | 40,45,40,35,35,40,50,45,35,50,50,40,35,40,45,40 |
  | Rogue, after | 118 | 41.9 | 35 | 40,45,40,35,35,40,50,45,35,50,50,40,40,40,45,40 |
  | Warrior, before | 209 | 70.0 | 55 | 65,75,65,55,55,70,85,90,85,80,85,70,55,55,65,65 |
  | Warrior, after | 213 | 71.3 | 55 | 65,75,65,55,65,70,85,90,85,80,85,70,65,55,65,65 |

  No way holds less. The other batteries read as before, and the routine battery (24 starts, 5
  loops) completes every loop. The forward diagonals to the side (67.5 and 292.5 degrees) still
  hold 55 on the Warrior, and the Rogue's right side 35: the next place to look.
- **Against the acceptance: not met.** Walks above 0.5 m/s mostly fall (a human's preferred walk is
  near 1.4); no human reference for the shoves or a reversal is sourced yet.

### Stage 5: the rulebook, the damage unit and the HP pool

- **The fight rules become one immutable rulebook** per mode: what counts as a cut, thrust, crush or clang, damage, severing, death and endings. `Ending` gains fatal and severed.
- **Session 3 of the paused plan.** The damage unit is set by the new human's strongest club hit, found by the strike search.
- **Session 4 of the paused plan.** One HP pool per body (Warrior 6, Rogue 4), with overflow walking the part graph.

**What landed (2026-09-29): the pool.**
- **The rulebook** (`src/core/rules/rulebook.ts`): one frozen object per mode, sourced like a spec.
  Overrides make a new one. It holds the sever margin today, and the arena and dungeon share it.
- **The wounds on the spec** (`BodySpec.wounds`, `src/core/human/wounds.ts`): hit points
  (Warrior 6, Rogue 4), the vital head, and the trunk that never comes off.
- **The part split** is the owner's, chosen 2026-09-29 (`owner-part-hp-split`): by cross-section,
  mass to the two-thirds. The Warrior's head holds 0.45, upper trunk 0.78, thigh 0.72, forearm
  0.17 and hand 0.09.
- **The pool** (`src/core/rules/pool.ts`, `tests/core-rules.test.mjs`):
  - a part absorbs what it has left;
  - an emptied part comes off to a clean blow, or to any blow past empty by half its full hit
    points, taking everything beyond it;
  - the excess walks the attached parts nearest first, parent before children;
  - endings: `severed` (head off), `exhausted` (pool spent), `fatal` (head emptied with hit points
    left). The first ending stands.
- **Recorded, not asked:** only the struck part can come off; overflow empties parts but never
  takes one off. A blow that spends the whole pool reads `exhausted`, not `fatal`.

**What landed (2026-09-29): the club, the masses a blow meets, and the damage unit.**
- **A held item is one rigid body with its segment** (`BodySpec.held`, `src/core/build/rigid.ts`):
  the composite's mass, centre and full inertia tensor, principal axes to Havok. A body holding
  nothing is bit-identical to before.
- **The wooden club** (`src/core/items/club.ts`): two cylinders of ash (678 kg/m3, the Wood
  Handbook), 1.163 kg, balanced 0.48 m from the butt. **The grip** (`src/core/human/grip.ts`,
  recorded not asked as `core-grip`): the haft across the knuckles, butt at the little finger's.
- **The mass a contact meets** (`src/core/build/contact-mass.ts`): 1 / (n' J M^-1 J' n), joints
  free and the body floating, checked against Havok's answer to an impulse to 1.5 %.
  `impactEnergy` (`src/core/rules/impact.ts`) is 1/2 mu v^2.
- **The club blow** (`research/core-club-strike.mjs`; the search takes `--weapon club`): the
  swell's first touch of a head-sized sphere, read within each step, its closing speed along the
  normal, the club's mass there and the head's from the striker's own guard, turned to face it.
- **Thrown standing** (`src/core-lab/blow.ts`, 2026-09-29; first `research/core-blow.mjs`): the strike searches drive the core
  body directly, on its own feet under the stance, from where it was built; the fist's too
  (`core-strike.mjs`). They had used the lab routine's carried pelvis, a kinematic body nothing
  could move, which is gone from the routine. It does not step into a stance first: that step does
  not converge with the rate (stage 4's finding).
- **The damage unit** (`unit` in the rulebook, `core-club-unit`): the best blow's energy at
  1920 Hz, **120.70 J per hit point**. Every mechanism keeps the old game's ratio to the club
  (`worth`, `owner-weapon-ratios`): an edge's joule is worth 5.73 blunt ones, an axe's 7.70, a
  point's 33.4. `blowDamage` prices a blow. The unit's own blow, replayed at 960 Hz, is worth 1 HP
  (`tests/core-rules.test.mjs`).
- **The table** (Node core stand, ground on; 4 trials a candidate, 40 generations of 96; the best
  blow of each search read again on 8 trials, the mean in joules, and its closing speed, m/s, at
  1920 Hz). Standing, a blow converges from 960 Hz: blows found at 480 Hz read 10-31 % lower from
  960 Hz up (and there spread up to 10 % between rates), while blows found at 960 Hz read the same
  from 960 to 3840 Hz within 0.5 %. So the searches that set the unit ran at 960 Hz.

  | stood | searched at | seed | search | 120 | 480 | 960 | 1920 | 3840 | closing |
  |---|---|---|---|---|---|---|---|---|---|
  | carried pelvis | 480 Hz | 1 | 109.3 | 89.5 | 109.1 | | 109.9 | | 11.8 |
  | | | 2 | 51.7 | 26.1 | 51.9 | | 50.3 | | 8.5 |
  | | | 3 | 104.1 | 8.3 | 103.4 | | 103.3 | | 13.1 |
  | on its feet | 480 Hz | 1 | 108.6 | miss | 109.0 | 75.7 | 75.0 | 75.3 | 11.5 |
  | | | 2 | 100.1 | 76.6 | 100.0 | 83.7 | 90.4 | 82.3 | 12.8 |
  | | | 3 | 113.3 | 66.5 | 112.5 | 90.1 | 90.7 | 93.9 | 12.8 |
  | on its feet | 960 Hz | 1 | 100.1 | 101.5 | 96.0 | 100.0 | 100.0 | 100.5 | 12.6 |
  | | | 2 | 121.3 | 19.2 | 120.1 | 120.8 | **120.7** | 121.2 | 12.2 |
  | | | 3 | 107.0 | 56.5 | 105.5 | 106.5 | 106.7 | 106.8 | 12.3 |

  (The carried pelvis's searches at 120 Hz read 30-81 J at 1920 Hz; their rows are in this
  document's history at cce3b403. The 960 and 3840 Hz columns of the rows found at 480 Hz were read in
  a later replay, 8 trials each.) The unit is the converged reading (recorded, not asked). Thrown standing, the blow
  meets 1.75 kg of club and arm at 12.2 m/s, overhead, the normal mostly down onto the crown;
  Muggenthaler's lay men swing a 1 kg, 0.65 m rod at 23.9 m/s at the tip, about 95 J. **At the
  game's 120 Hz the unit's blow mostly misses** (19.2 J over 8 trials), and the searched blows read
  from 20 % to 100 % of their converged energy there: the game's physics rate does not reproduce a
  standing blow. Three seeds found a best-of-three; a wider search may find a stronger blow, and
  would move the unit with its table.
- **Waiting:** which mechanism a contact is (cut, thrust, crush, clang) and the floors under which a
  blow only shoves come with the weapons that have edges and points.

### The engine: Rapier (2026-09-29, branch `core-rapier`)

The owner chose to try Rapier's SIMD build for the core (`owner-physics-engine`) on the bake-off's
report (`research/physics-bakeoff/REPORT.md`); the old path stays on Havok. The core's engine glue
is `src/core/engine/rapier.ts`: bodies with their nodes, the generic joint, fixed bodies, a ground,
and the solver's settings (`SOLVER`: 16 iterations of 2 PGS passes, one step, from the bake-off).

**What Rapier's joint does** (`research/core-rapier-probe.mjs`, Node, 120 and 960 Hz):
- its angle about axis k is 2 atan2(q_k, w), and a limit holds that angle to 0.0005 rad;
  `src/core/build/joint-state.ts` reads, turns and inverts it in closed form (the turning matrix,
  the rates, and a two-freedom joint's motion axes X - tan(b/2) Z and Y + tan(a/2) Z);
- a velocity motor drives the relative angular velocity along its axis as fixed in the parent,
  and a saturated one is exact (a torque source);
- a free body conserves its angular momentum (within 0.2 % over 1 s): Rapier applies the
  gyroscopic torque Havok left out, and `bodyDynamics` now carries w x I w;
- mass properties set on a body take effect at the next step unless recomputed at once.

**What converges at the game's rate.**
- The body's dynamics (`tests/core-dynamics.test.mjs`): kinetic energy within 0.13 % and gravity's
  power within 0.19 % at 960 Hz (Havok 0.73 and 0.24); the motion under way, M u' = -bias, within
  2.4 % at the median at 480 Hz. A step's change of speed carries a disturbance of Rapier's own
  that does not shrink with the step, so the same reading is 25 % off at 1920 Hz and 70 % at 3840.
- The servo (`tests/core-servo.test.mjs`): as on Havok, 0.020 and 0.0049 rad off the damped motion
  at 120 and 480 Hz; the Rogue's servoed arm moves alike at 120 and 960 Hz, its hand's paths 5 mm
  apart (Havok 8). A weak servo arrives within 0.0001 rad: Rapier has no brake on slow bodies.
- **A club blow.** Searched at 120 Hz on Rapier (30 generations of 64, seeds 1-3), the best blows
  read at 120 Hz against 3840: 76.5 against 75.6 J, 68.5 against 66.8, 89.4 against 81.5; Havok's
  unit blow read 19 J at 120 Hz against 120.7 at 1920. A blow found on Havok does not carry over:
  replayed on Rapier it goes another way (the shoulder's flexion reaches 3.02 rad).

**The damage unit on Rapier** (Node core stand, ground on; 4 trials a candidate, 40 generations of
96, searched at 120 Hz; the best blow of each search read again on 8 trials, the mean in joules):

  | seed | search | 120 | 480 | 960 | 1920 | 3840 | closing at 1920 |
  |---|---|---|---|---|---|---|---|
  | 1 | 102.5 | 102.5 | 80.6 | 67.6 | 73.6 | 68.3 | 11.6 |
  | 2 | 98.2 | 98.1 | 98.5 | 83.3 | 88.3 | 86.3 | 11.9 |
  | 3 | 105.6 | 104.5 | 88.0 | 83.7 | 83.3 | 78.7 | 10.4 |

With the search's full budget the blows found at 120 Hz read 10-30 % stronger there than from
960 Hz up, and 4-8 % apart between 960, 1920 and 3840 Hz: a search finds what the coarse step
gives, as it did on Havok at 480 Hz. The smaller searches above had stopped short of that. **The
unit is not re-set yet**: it is the converged reading of a blow searched at a converged rate, and
that search waits on the solver's settings (below), which move every blow. Until then the unit is
Havok's 120.70 J, and `tests/core-rules.test.mjs`'s replay of its blow reads 0.37 HP on Rapier
(0.41 on the torque stance, 0.34 once the stance planned a strike's pushes).

The solver's settings no longer decide it. The unit's blow replayed on the torque stance, J (Node
core stand, Rapier; the solver's iterations and PGS passes patched in for the reading):

| iterations, passes | 960 Hz | 1920 Hz | 3840 Hz |
|---|---|---|---|
| 16, 2 (the setting) | 41.25 | 43.29 | 41.36 |
| 32, 8 | 39.15 | | |
| 64, 8 | 37.34 | 40.10 | 40.45 |
| 128, 16 | 39.53 | 38.78 | 41.28 |

The readings scatter within 37-43 J, with no trend in the rate or the solver, against the 120.70 J
the blow read on Havok: this blow is Havok's, and the unit is re-set by searching on Rapier at the
setting, as it was set on Havok (three seeds at 960 Hz, the best read at 1920 Hz).

**Searched on Rapier at 960 Hz** (2026-09-30; 40 generations of 96, 4 trials a candidate, seeds
1-3; the best read again on 8 trials, J; Node core stand, the torque stance):

| seed | search | 120 | 480 | 960 | 1920 | 3840 | at 1920: closing, club, head, normal's up |
|---|---|---|---|---|---|---|---|
| 1 | 88.88 | 80.63 | 86.83 | 88.51 | 89.06 | 89.02 | 11.04 m/s, 1.55 kg, 28.4 kg, -0.92 |
| 2 | 38.60 | 0.89 | 35.96 | 38.45 | 37.38 | 26.56 | 7.97, 1.31, 12.2, -0.69 |
| 3 | 93.22 | 60.27 | 82.94 | 91.49 | 92.33 | 92.57 | 12.37, 1.36, 11.8, -0.69 |

Searched at 960 Hz the blows converge: 960, 1920 and 3840 Hz within 1 % for seeds 1 and 3. Seed 3
closes at the Havok unit's speed (12.37 against 12.23 m/s at 1920 Hz) and brings 92 J, not 121,
because of what the contact meets: it comes in at 45 degrees and meets 1.36 kg of club and 11.8 of
head, where the Havok blow came down (the normal's up -0.90) on 1.75 kg and 23.4 kg. Seed 1 comes
down as Havok's did, onto 28.4 kg of head, but closes at 11.0 m/s. So the club moves as fast on
Rapier; the energy differs with the line of the blow. Both searches were still climbing at their
last generation (1-2 J a generation), and three go on (`--from`, spread 0.2, 30 generations): from
seeds 1 and 3, and from the Havok unit's own search result.

**What does not hold, and why.**
- **A velocity motor under its ceiling holds only as far as the solver converges.** Rapier solves
  joints and contacts by iteration; a motor asked for a speed it has the strength to hold leaves a
  residue each step that does not shrink with the step. A 1 kg rod braked on a pin creeps 0.46
  degrees a second at 16 iterations of 2 passes; 1.74 at 4 iterations, 0.12 at 64; 0.85 with one
  pass, 0.03 with eight; whatever the ceiling or the motor model (the probe's brake). The whole
  human braked on a stand crept 4.5 degrees a second at 120 Hz; the stand now holds it with the
  servo, whose torque sources are exact (0.023 degrees at 10 s).
- **So the speed stance did not stand still** (the torque stance replaced it; stage 4). It asked
  the legs' motors for speeds, under their ceilings, through the closed chain the ground makes. Standing 3 cm low (Node stand, 120 Hz), the
  centre of mass stops 9-12 mm off the soles' middle and drifts 15 mm in 2 s, and the feet slide
  33-51 mm in 5 s. The foot moves 0.087 mm a step while its velocity accounts for 0.0007: the
  solver's correction of what it left unconverged moves the bodies within the step and takes the
  velocity back out. Joints part by 10 micrometres, and a pushed box on the ground does not slide
  at all, so neither the joints nor friction alone are the cause. The stance's drift, centre off /
  drift in the last 2 s / feet's travel, mm, and the cost a step, by the solver (foot conditioning
  100, both humans):

      iterations  passes   Warrior             Rogue               ms a step
      16          2        12.2 / 14.5 / 51    9.1 / 15.4 / 33     0.9
      16          8        4.1 / 4.7 / 12      4.1 / 3.8 / 13      1.2-1.4
      32          4        4.1 / 4.5 / 13      4.1 / 4.6 / 15      1.7-2.2
      32          8        1.5 / 2.2 / 5       1.4 / 2.1 / 6       2.0
      64          8        0.7 / 1.2 / 2.6     0.6 / 1.1 / 2.6     3.7-4.2

  Havok stood the same stance within 3 mm, with its feet conditioned for the same reason. The
  torque stance, driving the legs by torque sources, stands at 0.0 mm at 16 iterations of 2 passes,
  with the feet at their own inertia.
- **A limit pushes along its parent's axis, not along its angle's gradient**, so the other
  freedoms' turning carries a pressed angle past its stop: by up to 0.046 rad
  (`tests/core-joint-state.test.mjs`, a todo), and at 1000 N m a pressed first freedom dragged the
  other two to their own stops.
- **Rapier's JavaScript binding does not read a joint's impulses**, so the muscle driver chooses
  the pulling side by the change asked again (`src/core/muscle/driver.ts` has the defect; two
  muscle tests are todos). Its multibody joints, which would hold the joints exactly, cannot have
  their motors set after they are made, and the bake-off found them unusable in 0.21.

**Where the port stands**: the owner chose torque sources (2026-09-29: "go with (b), start with
the real inertia"), and the stance stands, steps, walks and catches shoves on them (stage 4's torque
stance). 1098 of 1102 tests pass; three are todos (the limit and the two muscle impulse tests), and
the one that fails is the unit's replay, which waits on a search at a converged rate (above).

### Stage 6: the human fights in the game

- **A mind** drives the core body through goals. First the existing duelist's decisions through an adapter, since it already aims by published reach; then minds layered as tactics, skills and motor goals.
- **The arena** can field the core Warrior and Rogue, and the page runs `World.step`.
- **The player** steers a core body through its mind, as stage 3 says: facing and attack direction,
  never a joint.
- **Parity check** against the old humans: bouts, eye gates, and the strike and locomotion references.

### Stage 7: port the rest, then the reptile

- **Stone and skeleton** each get a spec with their own numbers and reasons, and move onto the core. The old path is deleted when the last family has moved.
- **The reptile** (Session 5 of the paused plan) is built directly on the core.

## Stage 1's first commits

1. The boundary test and the empty `src/core/`, with its rules in AGENTS.md.
2. The spec types, with provenance, and the provenance test.
3. The human segment table from de Leva and the rig, for both models, with its tests.
4. The joint torque references added to `docs/analysis/2026-09-27-human-strike-reference.md`, then the muscle table.
5. `buildBody`, and a Node stand that holds the Warrior against gravity.
