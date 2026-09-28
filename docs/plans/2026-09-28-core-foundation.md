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
| The muscle-mass derivation (Janssen 2000; checked against Miller 1993 and Kumar 2001) | the muscle model's input, in place of the fitted shares |
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

### Stage 1: the body spec and the human spec

**`src/core/spec/`: the types.**
- Segments: shape, dimensions, mass and inertia, each from the spec.
- Joints: axes, limits, and parent and child frames.
- Muscles, per joint degree of freedom: peak isometric torque, maximum velocity and curve parameters.
- Contact surfaces and damageable parts, with their properties.
- Every number carries its provenance.

**`src/core/human/`: the Warrior and Rogue specs.**
- Geometry from the rig (`assets/humanoid/workshop-*.json`) and the stature, and masses from de Leva.
- Segment shapes are sized from segment volume and density wherever the rig gives no dimension. The unexplained boxes and radii go.
- Muscle mass per region from the model's sex and mass (Janssen 2000).
- The Warrior's peak joint torques come from cited adult-male data. Before this stage, the reference document gains hip, knee, ankle, trunk and neck rows.

**The builder.** `buildBody(spec, world)` makes Havok bodies and joints from a spec and nothing else. Attributes act on the spec, once, before the build.

**Stand.** A Node stand builds a spec and holds it posed against gravity with its joints motored.

**Tests.**
- Masses sum to the model's mass.
- Every leaf has provenance.
- The two models differ where their sources differ.
- No import crosses the boundary.
- The built body's inertia is anatomical, or its solver floor is named and measured.

### Stage 2: the muscle actuator

- **What a muscle does:**
  - torque ceiling = peak isometric torque × force–velocity(joint speed / vmax);
  - the Hill curve on the concentric side, and a stated eccentric ceiling;
  - activation is the controller's 0–1 command.
  - Torque–angle is added only if a measurement asks for it.
- **The Havok side:** a velocity motor whose maximum force is recomputed from the muscle every substep.
  - The speed is read once per substep (H50).
  - The stand tests the curve for stability at 120 Hz.
- **The human arm, trunk and neck move onto it.** No rate cap, `taskForce` dial or strength share remains where a muscle already bounds the move.
- **Acceptance** (Node stand and the ported strike search):
  - the typical Warrior's fist closes near 8 m/s and an elite build's near 9–11;
  - the club tip stays near the rod's 23.9 m/s;
  - the Rogue's ratios to the Warrior read against Miller's and Muggenthaler's figures, as a check, not a fit.

### Stage 3: one world, one body, one command

- **`src/core/world.ts`:** a fixed-step `World.step` owning physics, control and combat, with a deterministic clock. The harness is a thin caller.
- **One body class,** assembled from a spec. Per-family behaviour is a module the spec names.
- **The command** is goals:
  - hand targets in the body frame (position, orientation, speed);
  - trunk posture;
  - locomotion goals with gait verbs.

  The mind sees a view and returns goals. `Intent`'s mouse-shaped hand becomes the player's input adapter only.
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
