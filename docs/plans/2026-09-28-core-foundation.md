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

**The stage 2 assumptions.** `src/core/human/speed.ts` cites these; each is an owner decision to confirm.

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
  It is a stimulated muscle's figure; voluntary lengthening reads nearer 1.2-1.3.
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
  - The owner decides between a finer physics rate and a stage 3 servo that brakes without
    overshoot. Until then the lab page offers 120 and 480 Hz.
- **The servo.** An angle servo's time constant is steady at 0.1 s, and chatters at up to 3.9 rad/s
  at 0.05 s (pinned Warrior, 120 Hz).
- **The lab page.** `/core-lab.html` shows a chosen human walking forward, throwing three straights,
  and walking back. Two scaffolds stand in until later stages: a carried pelvis until stage 4, and a
  hand-set angle servo until stage 3. The ported strike search, and with it the acceptance above, is
  still to run.

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
