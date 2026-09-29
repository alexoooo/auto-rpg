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
  - The lab's straights now agree across 120, 480 and 1920 Hz to 2.5 %, the Warrior's peaking at
    5.7-6.0 m/s and the Rogue's at 4.7-4.9 (`src/core/muscle/driver.ts` has the table). The
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
  - **Measurements** (Warrior, lower trunk held, 0.2 m reaches over 0.4 s, Node stand):
    - the knuckles keep within 8.6 mm of the path at 120 Hz and 2.8 mm at 1920 Hz;
    - they end 2-4 mm from the goal at both rates, the rates' ends 4.4 mm apart;
    - without the fed-forward acceleration they stray 25-32 mm, and without the rates 110 mm.
    - A place out of reach leaves the arm stretched toward it (the Rogue, 0.3 m forward: 51 mm
      short at both rates).
  - **Precision and give** (H75). The kinematics had first gone through Babylon's float32
    rotation, which ruined the differenced Jacobian; they now match the body to 0.05 mm with
    gravity off. At 120 Hz, the elbow's hinge gives 0.7 deg under the forearm's weight, which is
    most of the 120 Hz goal's extra 2 mm.
  - **Not yet:** the hand's orientation and speed as goals; the trunk as a goal; the lab's
    straights as hand goals.

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

### Stage 5: the rulebook, the damage unit and the HP pool

- **The fight rules become one immutable rulebook** per mode: what counts as a cut, thrust, crush or clang, damage, severing, death and endings. `Ending` gains fatal and severed.
- **Session 3 of the paused plan.** The damage unit is set by the new human's strongest club hit, found by the strike search.
- **Session 4 of the paused plan.** One HP pool per body (Warrior 6, Rogue 4), with overflow walking the part graph.

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
