# What we have, and a foundation to build on

2026-09-28.

The owner asked for this after a session that kept running into surprises. The last of them: the human legs were driven by stone golem torques.

It comes from a read-only audit of `src/` (56.6k lines, 175 files) in four parts:
- the body model;
- actuation and every hand-set fudge factor;
- locomotion and falling;
- the control stack and fight rules.

The claims that carry the argument were checked against the code. Where a claim is "not verified", it says so.

It is written for the decision it asks for: how to get from here to a clean, physically based core, with human fighting as the reference that every other body is balanced against.

## 1. In one paragraph

Today a fighter is one class, `Golem`, for every kind of body: stone, skeleton and human.

- **How it stands.** A bodiless "carrier" point moves it across a flat floor, and its pelvis is keyframed onto that point. The legs are driven open-loop, as animation with collision, and hold nothing up.
- **How it falls.** A ledger adds up the impulses of blows and compares the total with a tipping line. When the line is crossed, the body is made a ragdoll, and later a keyframed get-up plays.
- **How its arms move.** Arms are driven by velocity motors under flat torque ceilings. How fast they move is set by hand-written rate caps, not by muscle.
- **Where its numbers come from.** Much of each body is another body's table with a few values changed. The human is stone with human lengths, masses and arms.
- **How it is controlled.** One 2,000-line tactics brain fights for every family.
- **How it is scored.** Hits are priced in joules. The prices were fitted to a sword that no longer exists, then rescaled twice.

A lot of this was the right call when it was made. Several parts are sound and worth keeping (section 3). But the whole does not add up to a physically based human, and it cannot be grown into one without a foundation that says, in one place, what a body *is*.

## 2. What the audit found

### A. A body is a copy of another body, with edits

- **The human copies stone's tables and overrides some of them.** The copies are `HUMAN_BIPED = { ...LOCOMOTION_BIPED, ... }`, `HUMAN_TORSO = { ...TORSO_PLAIN }`, `HUMAN_WAIST = { ...TORSO_WAIST }` and `HUMAN_HEAD = { ...HEAD_NECK }`.
  - Whatever is not overridden is stone's, and nothing in the code says which values a human owns.
- **Values the human inherits from stone and never set for itself:**
  - leg torques of 900/500/220 N·m (stone's, from before stone took its own density; about 750/420/180 once built);
  - the waist's lean torque, and its twist torque (2.5–5.5× a real trunk's);
  - neck torques;
  - joint limits;
  - the gait constants, including `targetRate`;
  - foot friction and motor damping;
  - the knockdown and rise tables;
  - the carrier's back, strafe, acceleration and turn limits;
  - leg, core and head health;
  - body damping (the retired Warrior's).
- **About 20 geometry constants are unexplained**, and the Warrior and the Rogue share them: pelvis and foot boxes, limb radii, core width and depth, head box, and `socketFront = .0208679512143135`.
- **The Warrior and the Rogue share every torque table.** The model changes only their lengths and masses.
- **"Human" is signalled three ways:** `setup.family`, the module id `locomotion.human`, and `setup.human`. Shared builders branch on it: `build.ts`, `humanoid/arm.ts` (including a Rogue-only IK branch), `bow.ts`, `golem.ts` and the dungeon.
- **There are two human bodies.** The registry and bench's "human legs, torso, head" are the retired legacy human. Only `workshopBody(model)` fights. A bench reading of "the human legs" describes a body no fight builds.
- **About 12 words for one idea:** family, module, definition, bench option, chain, terminal, setup, build, model, unit, preset, and tuning or table.

### B. The body does not stand; it is carried

`src/golem/locomotion/biped.ts` says it outright: "Nothing in this file is trying to balance, and no motor ceiling in `LOCOMOTION_BIPED` is holding the golem up."

- **Why:** dynamic balance was tried at 240 Hz, and both humanoid bodies fell at rest (the `src/golem/locomotion.ts` header).
- **Speed, acceleration and turning are the carrier's alone.**
  - A human's top speed is 2.6 m/s, with stone's back, strafe and acceleration limits.
  - The ground is a flat plane fixed at build.
- **"Support" is geometric:** a sole within 0.18 m of the floor plane.
- **The gait is a sine oscillator.** Nothing places a foot, and nothing reads where one landed.
- **Falls are authored.**
  - A ledger of blow impulses is compared with a tipping line. Stagger is a fixed share of that line, "a recorded fallback, not physics".
  - A body also falls on a 0.35 s support grace, or when an up-dot drops below 0.72.
  - Then the body is released as a ragdoll, its motors are cut to 0.08 and 0.55, and a keyframed rise plays.
- **The ledger never takes a step.** That is why reading a shove whole (reverted in 4350cb8e) multiplied knockdowns: nothing lets a body step under a push.
- **"staggered" changes nothing mechanically.** It is a label.
- **Trunk contacts are authored.** Keyframed trunks report no contacts, so body-on-body push is a scripted disc resolver. The dungeon has a second resolver, with no push at all.
- **What blocks run, dash, roll and jump:**
  - the horizontal-only carrier;
  - the fixed ground;
  - the upright posture test;
  - "support" meaning soles near the floor;
  - the unit-disc request and isotropic acceleration clamp;
  - a gait with one cadence and no flight phase.

### C. There is no muscle

- **A joint's strength is a flat torque cap** up to a velocity clamp. How fast it moves is set by hand-written rate caps (`RATES`, `twistRate`, `anchorRate`).
- **Missing:** force–velocity (grep finds nothing), torque–angle, activation, power, and fatigue.
- **This is why the Warrior's punch closes at 12.9 m/s at x1**, faster than an elite hook (11.2) against a typical 8.0. The club, which never reaches the speeds where it would matter, reads right.
- **Strength is not a property of the body.**
  - The weight stat multiplies arm torques but not the legs, waist or neck.
  - Size scales everything by s³, which is sound.
  - The Rogue's strength existed only as fitted shares, on the parked branch.
- **Solver conditioning changes the dynamics:**
  - inertia floors, with the human arm's apparently about 10× anatomical on the forearm's roll axis and the hand (not verified in the solver);
  - inertia cast across the wrist weld, with a matching torque lift;
  - artificial body damping on every limb;
  - servo gains that emulate 240 Hz tuning at 120 Hz.

### D. Hand-set numbers that stand in for missing physics

The full inventory, 36 rows, is in `2026-09-28-foundation-audit-notes.md`. The ones that shape a fight:

| What | Value | What it stands in for |
|---|---|---|
| Carrier, keyframed pelvis, keyframed rise | structural | balance |
| `shoveReadFractions` | 0.56 / 0.62 | a body stepping under a push |
| Stagger fraction, support grace, dwell and rise times, posture thresholds | 0.12/0.28, 0.35 s, ... | falling and recovering physically |
| Wound prices (`cutJoulesPerDamage` etc.) | fitted, then ×1.783 / ×3.786, then ÷0.56² | a damage unit (Session 3 of the current plan) |
| Human leg, waist and neck torques | stone's | a human's strength |
| Pronation 2× a man's, waist twist 2.5–5.5× | 25, 360 N·m | a pelvis that turns, and a forearm model |
| Weight scales arm torque | ×weight | muscle mass |
| Body damping and joint damping | 0.7/3, 0.1/0.2, 6 | tissue |
| `GROUNDED_TONE`, `fallenTorqueScale` | 0.55, 0.08 | a body's actual state on the ground |

The genuinely physical parts:
- the operational-space effective mass with joint give (`effective-mass.ts`);
- the tipping geometry (`tipping.ts`);
- kinetic energy as the damage basis;
- the s³ torque law.

### E. Structure

- **One god class.** `Golem` (1,523 lines) is every body. `BodyView.unit` is always "golem", so family behaviour is `if`s in shared code.
- **Seven ways to say what a body should do:**
  - `Intent`, whose hand is mouse-shaped (`pointerX/Y`);
  - `BodyCommand`, whose richer channels are behind a mutable global, `CHANNEL_FLAGS`, off by default;
  - `Orders`, and a second order system in the dungeon;
  - action primitives;
  - tactics stroke shapes;
  - chain IK targets.

  There are also four "blank command" defaults, and they disagree.
- **One brain.** `skeleton-duelist` is a renamed `golem-duelist`, and `humanoid-duelist` is the same brain behind an adapter. The seam it uses to fit a body, published reach spans, is a good one.
- **Three simulation loops.** The page runs on the render delta, so it is not reproducible. The harness runs a fixed 1/60, and it is a copy. The dungeon bypasses the driver, orders and hold, and rewrites the mind's locomotion; the host puppets the body.
- **Tuning is mutable global state that harnesses move:** `GOLEM_TACTICS`, `STROKE_INERTIA`, `CHANNEL_FLAGS`, and `CONFIG.combat` as the default of the "pure" scoring. Meanwhile `ACTION_TUNING` is frozen on principle.
- **Fight rules live in five places:**
  - `CONFIG.combat`;
  - `BITE`;
  - the part tables and `GOLEM_ASSEMBLY`;
  - attributes;
  - the Warrior-era `VITAL_WEIGHT`.
- **Dependencies point the wrong way.** `mind.ts`, the base types, imports the concrete minds. `combat.ts` imports `golem/`.
- **Dead and stale code that still misleads:**
  - Warrior-era `CONFIG` sections that nothing reads;
  - `units.ts` fields;
  - `defaultMatchup` naming "warrior";
  - tests on retired minds;
  - a dead scheduler seam;
  - comments that say 240 Hz;
  - AGENTS.md's `fallenTone`.

## 3. What is sound and should be kept

- **The command seam as a rule:** a mind drives a body only through its command, and a person gives orders, not poses.
- **Capability-based aiming:** a mind reads a chain's published reach instead of knowing its shape.
- **The physics of contact:** operational-space effective mass with joint give, and energy and impulse from it.
- **The tipping geometry**, live from the body's centre of mass and its sole hull, as a readout and predictor.
- **Pure, testable state machines** for support and rising, and the rule that recovery never needs the mind.
- **The staged rise, recovery rings and occupancy, and pair and group footprint resolution** with give-way.
- **Fork and replay** (`src/fork/*`) and the closure audit.
- **The measurement culture:** benches, the Node harness, league and research runners, mutation-checked tests, and `docs/history.md`. These are what found every problem in this document.
- **Part data decides what is fatal**, not code.
- **The size laws**, with torque as s³ and mass as s³.

## 4. The foundation

### Principles

1. **A body is data that says where each number came from.**
   - A body is built from a *spec*: segments, joints, muscles, surfaces and parts.
   - Every number is either derived from physics, or cites a measurement or a documented sweep.
   - No spec spreads another family's spec. Families may share *code* (a muscle, a joint, a segment builder), never *values*.
2. **One body class, and families as data.**
   - Behaviour that differs by family is a module the spec names, not an `if` in shared code.
   - "Human" is one field.
3. **Muscle, not caps.**
   - A joint's torque is its muscles':
     - peak isometric torque from the muscle mass across the joint;
     - times a force–velocity curve (Hill);
     - later, times a torque–angle curve.
   - Speed limits emerge from the muscle. Solver conditioning is kept separate from anatomy and stated as such.
4. **Standing is physics, with honest assistance.** Balance, stepping, falling, running, dashing and rolling come from one locomotion model whose forces are bounded by what the legs and the ground can do (section 5).
5. **One world step.**
   - A single `World.step(dt)` owns physics, control, combat and the clock.
   - The page, the harness and the dungeon all call it. The page renders what it produced and never advances the rules by the render delta.
6. **Rules are one immutable rulebook per mode.**
   - Damage, severing, death, and what counts as a cut, thrust or clang.
   - Experiments pass an override in. Nothing mutates a global.
7. **Layers depend downward only:**
   - world and physics;
   - body (spec, build, muscle, sensors);
   - motor control (controllers that turn goals into muscle activation);
   - skills (strike, parry, step, lunge, roll);
   - tactics (a mind);
   - orders (a person).

   A mind sees a view and returns goals. It never sees a joint.

### The human spec (the reference body)

**Segments.**
- de Leva 1996, sex-specific, scaled to the model's stature and mass.
- The geometry comes from the rig. The unexplained boxes and radii are replaced by values derived from segment volume and density, or taken from the rig.

**Muscles.**
- Each joint degree of freedom gets:
  - a peak isometric torque from the muscle mass crossing it (torque ∝ muscle mass, for geometrically similar muscles);
  - a maximum shortening velocity;
  - the Hill curve.
- Muscle mass is body mass × sex-specific muscle fraction × regional share. Muscle is 38.4 % of a man's body mass and 30.6 % of a woman's, and a woman has 40 % less upper-body and 33 % less lower-body muscle (Janssen et al. 2000, J Appl Physiol 89:81).
  - On our two bodies that gives the Rogue about 0.55 of the Warrior's arm and 0.61 of his legs. The published strength ratios are 52 % and 66 % (Miller et al. 1993).
  - Those strength ratios check the model; they do not fit it.
- The Warrior's absolute torques come from cited adult-male isometric and isokinetic data. `docs/analysis/2026-09-27-human-strike-reference.md` needs hip, knee, ankle and trunk rows for this.

**Attributes act on the spec once, before build.**
- Size is geometric (s³ torque, as now).
- Weight is a body-composition choice: extra mass is part muscle and part not, so strength follows muscle mass, not total weight.
- Arm speed becomes a muscle property, the fibre-type share (vmax), not a rate cap.

**Checked against references by tests.** Fist and club closing speeds and effective mass, typical and elite. The strike search (`research/strike-optimizer.mjs`, `research/human-strikes.mjs`) already does this.

### Stone and skeleton on the same foundation

Each gets its own spec, with its own numbers and their reasons. A golem's "muscle" is a motor with a stated torque and speed curve: the same code as a human's, with different data.

Neither is reworked while the human is being built. They stay playable on the old path until they are ported.

## 5. Locomotion: what replaces the carrier

This is the largest single piece, and it decides how physical the game feels.

The old attempt, fully dynamic balance from joint torques, failed at 240 Hz, and doing that robustly is a research problem.

The standard answer in physics-based games is a **bounded centroidal model**:

- **The body's centre of mass is driven by forces that the feet could actually produce.**
  - Ground reaction inside the friction cone, limited by leg strength (muscle, above) and applied at the feet's actual contacts.
  - It replaces a velocity from a carrier point. The pelvis follows the centre of mass, and the legs are placed, not animated.
- **Foot placement from the capture point:** a step goes where it can stop or redirect the body.
  - A shove the stance cannot absorb produces a step. This is exactly what the reverted whole shove needed.
  - A body falls when no reachable step captures it. That replaces the ledger's line and fractions.
- **Gaits as states of the same model:**
  - walk;
  - run, with a flight phase (a spring-mass stance);
  - dash or lunge (a bounded burst from leg power);
  - sidestep;
  - roll (a manoeuvre with its own contact model);
  - get-up.

  Their speeds come out of leg strength and body mass, not from a carrier's table.
- **Honest assistance:** where the model needs help to stay stable, it is an explicit, bounded, logged force, not a hidden keyframe. The measurement can then say how much of a movement is assisted.

It is built for the human first, on a stand, beside the old carrier, until it matches or beats it on the existing evidence. The evidence is sole slip, joint lag, falls under a calibrated shove, and top and reversal speeds against human references.

## 6. The path, humans first

Each stage lands behind tests, with a bout either side where it touches a fight, as now.

| Stage | What | Leaves the old path |
|---|---|---|
| 0 | **Freeze and clear.** Stop adding features to the old core. Delete dead code and stale docs. Fix AGENTS.md. | untouched in behaviour |
| 1 | **Body spec plus the human spec.** One `BodySpec` type; the Warrior and Rogue specs from anthropometry; no spreads; each value's source in the spec and pinned by a test. The builder reads only the spec. | stone and skeleton unchanged |
| 2 | **Muscle actuator** (isometric torque from muscle mass; Hill force–velocity) on the human arm, trunk and neck. Retire the rate caps it replaces. Re-measure strikes against the references. | as 1 |
| 3 | **One world step and one body class**, with the command API cleaned to goals: hand targets, trunk, locomotion goals with gait verbs. `Intent` becomes the player's input adapter only. | the page, harness and dungeon move onto it |
| 4 | **Locomotion v2 for the human:** the centroidal model, capture-point stepping, falls that emerge, and walk, run, dash and sidestep, then roll. The carrier is retired for humans. | stone and skeleton keep the carrier |
| 5 | **The rulebook:** fight rules in one object. The damage unit (the current plan's Session 3) and the HP pool (Session 4) are built on it, from the new human's strikes. | |
| 6 | **Port stone and skeleton to specs.** Then the reptile, as the first morphology built entirely on the foundation. | the old path is deleted |

## 7. Decisions for the owner

1. **Rebuild in place or beside?**
   - Recommended: a new core beside the old one (`src/core/`), human-only at first, with the old path kept playable until parity, then deleted.
   - In place means every step fights the coupling described above.
2. **How far locomotion goes in stage 4.** The centroidal model above is what I recommend. Full torque-driven balance is possible later on the same foundation.
3. **Stone and skeleton during the rebuild:** kept playable on the old path (recommended), or frozen out of the arena until ported.
4. **The current plan's Sessions 3–6** (damage unit, HP pool, reptile, eye gates) pause until stages 2 and 5 give them a physical human to calibrate on.

## Appendix: what the audit could not confirm

- The human arm's inertia sits on the solver floor, about 10× anatomical on the forearm's roll axis and the hand: estimated from capsule formulas, not read from the solver.
- The inertia floor scales as s⁵, while a per-kilogram floor should go as s²: read from the code, not measured.
- A wheel can strafe in a bout, because the port receives the request unclamped: read from the code, not run.
- Which way a knocked-down body falls is up to the solver, not the ledger's lean: read from the code.
