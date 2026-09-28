# Foundation audit: the four slices

2026-09-28. The read-only audit behind `2026-09-28-foundation-audit.md`: four subagent reports on `src/` (body model, actuation, locomotion, control stack), condensed. Citations name a file and construct. Treat any claim here as a lead to check against the code, since the code can move after this date.

## Audit: body model (subagent report, 2026-09-28, condensed)

### Assembly pipeline

1. `namedBuild` (`roster.ts`) returns a `GolemSetup`: plain data holding `human?`, `family?`, the locomotion, torso and head ids, primary and secondary `{chain, terminal}`, and `attributes`.
2. `golemSetupRefusal` checks the setup.
3. `units.golem.build` calls `new Golem`. `UnitKind` has only one value: `golem`.
4. The `Golem` constructor:
   - resolves the stats twice: `resolveAttributes` for what the body is, and `builtAttributes` for what its modules are built at. For a human, size is multiplied by `WORKSHOP_FIT_SCALE` 0.9415;
   - resolves the modules. For a human, `golemLocomotion`, `golemTorso` and `golemHead` swap in `workshopBody(model)`;
   - builds the arms through `golemEffectorPlan` and `workshopAnatomicalChain` with `fitTerminal`;
   - mounts in order: animated base, legs, torso, head, effectors;
   - passes each module a `ModuleBuild` context `{attributes, human, tone, layers, socket}`;
   - has each module apply `withTurning`, `withMovement`, `withRecovery`, `withWeight` and `withSize` to its own table.
   - `boxPart` and `capsulePart` create the bodies, so Havok derives the inertia. `joint` makes a 6DoF constraint and `JointActuator` drives it.
   - Health is `part.health * GOLEM_ASSEMBLY.healthScale * toughness`.
5. About 12 overlapping words for a body:
   - family, module id, definition, bench option;
   - chain plus terminal, and the fitted terminal;
   - setup, build (`NamedBuild` and `ModuleBuild`), model, unit;
   - table or tuning, preset, `FAMILY_SETUP`;
   - the `resolveAttributes` / `builtAttributes` pair.
6. Being a human is signalled three ways: `setup.family`, the module id `locomotion.human`, and `setup.human`. The code branches on `setup.human` or `ctx.human`.
7. There are two human definitions per slot. The registry's `humanBiped`, `humanTorso` and `humanHead` are the retired legacy human (14 kg pelvis, 0.40/0.39 m legs). Only `workshopBody(model)`, which is not registered, fights.
   - So bench and picker readings of "human legs" describe a body that no fight builds.

### Where each number comes from

Key: **a** cited measurement, **b** tuned by a documented sweep, **c** inherited from another family, **d** unexplained constant.

### Stone golem

- Masses: **a/b**. Density 1300 through `bodyKg`; arms through `kg` at 0.162 of solid stone.
- Leg torques `onBody(900/500/220)` and `targetRate` 11.5: **b**.
- `linearDamping` 0.7 and `angularDamping` 3: **c**, the Warrior arm's.

### Skeleton

- It spreads stone everywhere.
- Legs 450/250/110: **b**, half of stone.
- Arm torques, rates and limits: **c**, stone's.

### Human

**a (cited):**
- Rig lengths from `assets/humanoid/workshop-*.json`, times the fit.
- Segment masses: de Leva times `WORKSHOP_BODY_KG`. The 79 kg is the owner's choice; the Rogue's comes from a voxel ratio.
- `twistMax` 0.87.
- `HUMAN_ARM_DRIVE.velocityLimit` 24.

**b (swept):**
- Waist `twistRate` 8.
- Arm `RATES`, doubled with a table.
- Pronation 25.

**c (stone's):**
- Leg torques 900/500/220, pre-density, and `shoveImpulseNs` 200.
- Waist lean 600, twist 360, `leanRate`, and a 0.30×0.14 ball.
- Neck pitch 100 and yaw 10.
- Leg limits, `footFriction`, gait, `targetRate`, `motorDamping`, damping, knockdown, rise, most of the carrier.
- Health for legs, core and head, and `healthScale` 0.024.

**d (unexplained):**
- About 20 geometry constants, identical for the Warrior and the Rogue: pelvis box, foot box, `hipInset`, limb radii, core width and depth, head box.
- `socketFront` 0.02086795...
- `NECK_SHARE` 1/7.5 and `FIST_SHARE` 1/3.
- Carrier `maxSpeedMps` 2.6.
- `leanMax` 0.35 and the Rogue's neck yaw ±1.45.
- Shoulder torques 100/100/65, elbow 75 and wrist 20/25 (about twice the reference for wrist flexion).
- `ARM_LIMITS`, carried from the legacy Warrior.
- Arm damping, arm health 100/70, armour 0.35/0.5.

### Values crossing between families

- The human spreads stone: `HUMAN_BIPED` spreads `LOCOMOTION_BIPED`, `HUMAN_TORSO` spreads `TORSO_PLAIN`, `HUMAN_WAIST` spreads `TORSO_WAIST`, and `HUMAN_HEAD` spreads `HEAD_NECK`.
- Weapons: the workshop sword spreads `TERMINAL_BLADE`, and the fist spreads `TERMINAL_FIST`.
- The legacy arm leaks into the workshop arm:
  - `HUMAN_MOUNT` and `PALM_GRIP` still set tip offsets and the mount;
  - `LEGACY_ARM_GEOMETRY` is the arm's fallback, and `solveArm` has an identity branch for it (0.585);
  - `swingInertia` 0.8 is the legacy 5.9 kg arm's, rescaled.
- Shared by every family: `GOLEM_ASSEMBLY.healthScale` and `vitalityTotal`, `KNOCKDOWN` and `BIPED_RISE`.
- The other way round, stone's back and strafe speed ratios come from `CONFIG.fighter`, a human's numbers.
- Human branches in shared code:
  - `build.ts`: `golemLocomotion`, `golemTorso`, `golemHead`, `randomGolemSetup`, the refusal (the Rogue's bow and the terminal lists), `builtAttributes` and `golemEffectorPlan`;
  - `arm.ts`: the `ctx.human` ternaries, and a Rogue-only IK reseed;
  - elsewhere: the Rogue neck in `body.ts`, the `bow.ts` fallback, `golem.ts` appearance and `dressWorkshopFighter`, `setup.ts`, the dungeon and the bench.

### Attributes are applied in many places

- Each builder composes its own `with*` chain.
- The human arm does all of it by hand in `arm.ts`: rates times armSpeed times s^-1; torques times weight times s³; masses times weight times s³; the inertia floor times s⁵.
- Armour lives only in `Golem.armourOf`, and toughness only in the limb setup.
- Weight scales arm torques but not legs, waist or neck.
- A human at x1 is never the table: it is built at 0.9415, so every `withSize` fires. The inherited leg torques are really 751/417/184 N m and the waist 500/300.
- The `ArmDrive` doc says torque scale is "weight alone", but `arm.ts` returns weight times s³.
- A workshop module's `definition.massKg` is its pre-fit mass, about 1.2 times what it is built at. `golemUpperMassKg` corrects for this; direct readers (the bench picker, `GolemEffectorOption.massKg`) do not.
- The inertia floor is per kilogram (H49), so it should scale as s², but it is scaled as `inertia`, s⁵.

### Surprises

- The `onBody` comment says the human pins stone torques "since their masses did not move", which is stale since de Leva on 2026-09-27.
- The Warrior and Rogue share every strength table; only lengths and masses differ.
- The `human.armour` checkbox is cosmetic.
- Arm segment inertias sit on the solver floor: per kg about 0.011, against an anatomical 0.0008 for the forearm axis. So pronation and the hand are about 10 times too heavy to turn (not checked in the solver).
- `LOCOMOTION_BIPED.hipHeight` is read by nothing.
- The waist "ball" (the abdomen, 12.9 kg) is welded to the core, not jointed to the pelvis.
- The shoulder constraint is free (±π). Limits live only in IK (`ARM_LIMITS`), so a limp arm has no shoulder stops.

## Audit: actuation and hand-set numbers (subagent report, 2026-09-28)

### Motors

There are three kinds.

1. **`JointActuator` and `JointServo`** (`src/golem/joint-servo.ts`).
   - A Havok VELOCITY motor, with a maximum force of `maxForce * tone.scale`.
   - `track` computes `v = (target - previous)/dt + servoGain(response)*(aim - measured)`: a P controller with velocity feed-forward and no integral. The velocity constraint brakes.
   - Response: 10/s by default (`POSITION_RESPONSE`: waist, neck, human arm), and 40/s on the stone arm (`CHAIN_REACH.jointResponse`) and the wrist (a literal 40).
   - `servoLead` and `servoGain` emulate 240 Hz tuning at 120 Hz (`solverTuningHz`).
   - Used by the stone arm (yaw, pitch, elbow), the wrist, the human `anatomicalChain` (3 bodies × 3 axes, velocity clamped to ±24/size rad/s), the waist and the neck.
2. **Native Havok POSITION motors with joint damping** (`motorDamping` 6).
   - Used by the legs (biped, multileg, wheel), the pitch-chain hinge and the bench waist.
   - They take no `MotorTone`; the legs have their own `fallenTorqueScale`.
3. **`AnchorDrive`** (`anchor-drive.ts`): nothing constructs it anywhere in `src/`.

Shaping a move:
- Human arm rate: `RATES[i] × armSpeed × size^-1 × taskSpeed`.
- Stone arm: `anchorRate` 5 m/s × armSpeed × taskSpeed × an acquire ramp.
- IK: `twoBone` on stone, `solveArm` on the human (at 60 Hz).

### From a table value to a motor's maximum force

| joint | table | multipliers |
|---|---|---|
| human arm | `TORQUES` [[100,100,65],[25,75,0],[20,25,0]] | weight × size³ × taskForce × tone |
| human waist | twist 360, lean 600 | size³ × tone |
| human neck | pitch 100, yaw 10 | size³ × tone |
| human legs | 900/500/220 | size³ × 0.08 while fallen |
| stone arm | `CHAIN_REACH` 720/1200/720 | weight × size³ × taskForce × tone |
| stone wrist | 60 | size³ × min(inertia lift, 4) × taskForce × tone |
| stone legs | `onBody(900/500/220)` (× 3.086) | size³ × 0.08 while fallen |

- A human's size includes the fit 0.9415, so at x1 its size³ is 0.834.
- `taskForce` is the mind's 0..1 dial.
- Tone is 1 standing, 0.55 grounded, and ramps up while rising.

There is no force–velocity, power, activation, torque–angle, or fatigue model. Only one human number is cited to physiology: `velocityLimit` 24 (elbow extension, 22 ± 5.6 rad/s).

### Inventory

**Categories:**
- P: physical, with a cited source.
- S: set by a documented sweep.
- C: compensates for another defect.
- U: unexplained.

| # | name (file, construct) | value | what it does or compensates for | table | cat |
|---|---|---|---|---|---|
| 1 | keyframed pelvis, `VirtualLocomotionCarrier` | structural | dynamic balance failed at 240 Hz, so the body is carried | history | C |
| 2 | `CONFIG.combat.shoveReadFractions` | 0.56 / 0.62 | knockdown rates kept on the old lines | yes | C |
| 3 | `TIPPING.STAGGER_FRACTION` | 0.12 / 0.28 | "a recorded fallback, not physics" | no | C |
| 4 | `SUPPORT_GRACE_S`, `FALLEN_DWELL_S`, `RISING_DURATION_S`, `RISE_POSTURE_DEADLINE` | 0.35, 0.35, 0.45, 2 | bridges clinches; "a stated choice" | partial | C/U |
| 5 | `constructPostureIsSupported` | up-dot 0.72, 0.08 m, 0.04 m | the standing test | no | U |
| 6 | `cut/chop/crushJoulesPerDamage`, `cutFloorJ`, `crushFloorJ` | 197.96 / 147.45 / 1134.99; 33.86 / 77.19 | fitted to the retired Warrior, then ×1.783 edge, ×3.786 blunt, ÷0.56² | yes | C |
| 7 | `HUMAN_BIPED` hip/knee/ankle, `shoveImpulseNs` | 900/500/220; 200 | stone's pre-density values | no | U |
| 8 | `HUMAN_WAIST` twist / lean | 360 / 600 | twist is 2.5–5.5× a trunk's, because the pelvis does not turn; lean is stone's | twist | C |
| 9 | `TORQUES` pronation | 25 | 2× a man's, "the forearm cannot hold roll" otherwise | yes | C |
| 10 | `TORQUES` shoulder / elbow / wrist | 100,100,65 / 75 / 20,25 | human-ish | no | U |
| 11 | `HEAD_NECK.pitchTorque` | 100 | AGENTS.md: no table | no | U |
| 12 | `CHAIN_REACH` yaw / shoulder / elbow | 720/1200/720 | AGENTS.md: no table | no | U |
| 13 | `withWeight` on arm torques | × weight | strength follows density | bench | C |
| 14 | `SHIPPED_MASS_SCALE`, `STONE_BODY_DENSITY`, `onBody` / `bodyNs` | 0.162; 1300; ×3.086 | a mass rescale carried through every torque and impulse | yes | C |
| 15 | `GROUNDED_TONE` | 0.55 | a grounded body swings weakly (owner's call) | yes | S |
| 16 | `fallenTorqueScale` | 0.08 | leg motors would hold a ragdoll up | yes | S/C |
| 17 | `jointHoldSeconds` | 0.015 | joint give; real contact times are 11–27 ms | yes | P/S |
| 18 | body damping: stone 0.7/3, weapons 0.5/2, human arm 0.1/0.2 × frequency | — | drag "copied rather than re-derived" | no | C |
| 19 | `motorDamping` | 6 | "only set vs unset matters" | yes | S |
| 20 | `jointInertiaFloor` 0.3, `HUMAN_ARM_DRIVE.inertiaFloor` 0.015 | — | solver conditioning that changes limb dynamics | brief | C |
| 21 | `CHAIN_WRIST` `gripInertiaRatio` / `carryRatio` / `liftCeiling` | 0.5 / 0.4 / 4 | inertia cast on the weld plus a torque lift | yes | C |
| 22 | `servoLead` / `servoGain` / `solverTuningHz` | 240 | 240 Hz tuning emulated at 120 Hz | yes | C |
| 23 | `POSITION_RESPONSE` 10, `jointResponse` 40, the wrist's 40, arm `response` 10 | — | servo stiffness | short | S |
| 24 | human arm `RATES` | [6,6,8,8,10,10,8] | stand in for muscle speed | yes | S |
| 25 | `HUMAN_WAIST.twistRate` | 8 | a typical trunk's turn speed | yes | S |
| 26 | `acquireSeconds` | 0.2 | stops the opening blade clash | yes | C |
| 27 | `CONTACT_PRESS.GRIP` | 0.55 | "the carrier is not a foot and has no friction" | cited | C |
| 28 | `pairDriveNs`, `pushCapN` | — | authored trunk-on-trunk push | doc | C |
| 29 | `SUPPORTED_CARRIER_V1` root gains | accel 18, gain 42, damping 11, rise accel 48 | root drive authority | no | U |
| 30 | `GOLEM_RUIN.healthScale` | 0.024 | bout-length calibration | yes | S |
| 31 | `drawFraction`; `edgeExponent`; the slap threshold | 0.3; 2; 0.25 | cut credit and hit class | first only | S/U |
| 32 | part `armour` 0.35/0.5; `ARMOUR_CAP` 0.9 | — | damage fractions | cap only | U |
| 33 | `severKick` | 3.4 | an authored impulse on sever | ? | U |
| 34 | `impossibleSpeed` | 40 m/s | guard against flung contacts | yes | C |
| 35 | `humanoidDuelist` `strafe *= .25`, `pointerY + .35`; roll `-outboard*0.35` | — | mind-level, uncommented | no | U |
| 36 | `CONFIG.body` strengths (`jointStiffness` 34, ...) | — | retired-Warrior leftovers; only `deadJointStrength` and `vitalWeight` are read | — | dead |

Genuinely physical:
- `effective-mass.ts`;
- `tipping.ts`, apart from the stagger fraction;
- kinetic energy as the damage basis;
- `SIZE_LAW_POWER`.

`ACTION_TUNING` is harmless envelopes and gravity. `GOLEM_TACTICS` is authored choreography for the mind.

## Audit: locomotion (subagent report, 2026-09-28, condensed)

### What holds a body up and moves it

- A carrier holds every body up, not its legs: `VirtualLocomotionCarrier` in `supported-locomotion-runtime.ts`.
  - It has no physics body: a point with yaw and velocity. `propose` integrates a request under speed, acceleration and yaw limits. `commit` keeps `y` fixed.
- The root is ANIMATED. `driveAnimatedRoot` sets the carrier's velocity every substep; below root-up 0.995 it switches to a bounded `setTargetTransform`.
- The legs are dynamic capsules on open-loop position motors. The `biped.ts` header says: "Nothing in this file is trying to balance."
  - Why, per the `locomotion.ts` header: dynamic-root balance was tried at 240 Hz and both humanoid bodies fell at rest.
- Support is geometric, not a Havok contact: a sole within `stepHeightM` 0.18 m of a registered floor plane.
- The game is always "supported". `UNIT_REGISTRY` has only `golem`, so the legacy mode is dead in play. The harness defaults to legacy, hence H61.

### Gait, speed and turning

- The gait is a phase oscillator, not foot placement.
  - `stride += bipedFootSpeed * strideCadence * dt`, reading the carrier's committed move.
  - `bipedPose` writes sinusoidal hip swing (`strideSwing` 0.60), a knee half-wave and a level sole.
  - Joint targets are slewed at `targetRate` 11.5 rad/s.
  - Stance foot placement sits behind `CHANNEL_FLAGS.stance`, which is off. The step target sits behind `CHANNEL_FLAGS.step`, also off.
  - Nothing reads where a foot actually lands.
- The carrier alone limits speed: the unit disc, then the ellipse (ahead, back, strafe), then an isotropic acceleration clamp and yaw limits.
- The human carrier is stone's with `maxSpeedMps` 2.6. It inherits stone's back 1.9, strafe 2.4, acceleration 9 and yaw 3.0 / 11. A full reversal takes about 0.5 s; a 180° turn about 1.3 s.
- The ground is flat and fixed at build (`groundY`, `standingPelvisY`, y=0 plane, walls at ±13 m).

### Falls

- Falls come from a ledger rule, not physics: `stepSupportedLocomotionState` moves between `supported`, `staggered`, `fallen` and `rising`.
  - Blows enter as `contactImpulseNs` with `atY`; the ledger adds `J·lever/M` and decays it at `rockingDecayMps2`.
  - The fall line is `tippingLineMps` (`src/tipping.ts`, rigid-block energy over the live centre of mass and the sole hull). Stagger is `STAGGER_FRACTION` 0.12/0.28 of it, "a recorded fallback, not physics".
- A body also falls when support is missing for more than 0.35 s, when `lifted` by `ContactPress`, or on posture loss (up-dot < 0.72, or root or stack heights).
- When fallen:
  - the root turns DYNAMIC (`releaseRoot`);
  - leg motors drop to `fallenTorqueScale` 0.08 and upper-body `MotorTone` to `GROUNDED_TONE` 0.55;
  - the body ragdolls, and the ledger's lean does not set which way it falls.
- The rise is automatic and keyframed (`RisingActuator`, `bipedRisePlan`, about 1.4 s). The mind has no say.
- Shoves between bodies go through `resolveCarrierPair`: footprint discs become carrier slide (GRIP 0.55) plus ledger events.
  - A blow to a keyframed trunk moves nothing physically.
  - The dungeon uses a second resolver, `resolveGroupMoves`, with no pair push.

### Coupling

- `HUMAN_BIPED = {...LOCOMOTION_BIPED}` keeps stone's pre-density torques 900/500/220, swept on a 54.9 kg stone leg; the human leg is 15.5 kg.
- The human also inherits, unswept: `strideCadence`, `strideSwing`, `targetRate`, `footFriction`, `motorDamping`, crouch and height rates, stance, `fallenTorqueScale`, the knockdown values, and the carrier ratios.
- `SKELETON_BIPED` is also a spread, at half the stone torques.
- `CONTACT_PRESS.GRIP` equals `LOCOMOTION_BIPED.footFriction`, one constant for every body.
- The root adapter and drive code are copy-pasted in `biped.ts`, `multileg.ts` and `wheel.ts`.
- The human and the workshop models share the module id `locomotion.human`.
- No human walk-slip test was found (not exhaustive).

### What run, dash, roll, jump and evade need

- **Run:** more than a raised speed ceiling. The single cadence and `hipSwingMax` 0.5 give no flight phase and no gait change, and `targetRate` sits near a slip cliff.
- **Dash:** needs to bypass the acceleration and unit-disc clamps. The dungeon's dodge is only a steering bias.
- **Roll and jump:** blocked because the carrier is horizontal-only, the ground is fixed, "support" means soles near the floor, the 0.35 s grace turns a jump into a fall, and the posture predicate reads a roll as a fall.

### Surprises

- "staggered" does nothing mechanically.
- The wheel may strafe in a bout: its module clamps the request, but the port receives it unclamped (not verified).
- AGENTS.md is stale on `fallenTone`, which `GROUNDED_TONE` replaced.
- Many comments still say 240 Hz.
- A dead scheduler seam (`ActionSpec`, `LocomotionSchedulerPort`) marks itself as dead.
- The ledger holds up a body whose centre of mass is past its feet: the skeleton walks with its centre of mass up to 0.54 m past its stance.

### Keep

- The `Intent`/`BodyCommand` seam, and `Orders` bending only movement.
- The pure state machine shape, and recovery without the mind.
- Tipping geometry as a readout or predictor.
- `atY` blow filing.
- The staged rise, recovery rings and `KnockdownSettle`.
- Pair and group footprint resolution (H71, H72).
- Limb ruin feeding `hobble`.
- The size laws.
- The `LocomotionEvidence` instrument, and H37.

## Audit: control stack and fight rules (subagent report, 2026-09-28, condensed)

### One control step

`stepControlledPair` in `control-host.ts` runs at 120 Hz. In order:

1. Observe: `Golem.describe` builds the `FighterView`.
2. `GolemDriver.step` (`golem-control.ts`):
   - the commander gives `Orders`;
   - a `CommandMind` returns a `BodyCommand`; any other mind returns an `Intent`;
   - `OrderFollower.obey` rewrites forward, strafe and turn;
   - `intentToCommand` turns an `Intent` into a `BodyCommand`.
3. `Golem.applyCommand`:
   - `hobble` then locomotion `request`;
   - torso and head `command`;
   - each effector `commandEffector` or `chain.command(aim)`.
4. `resolvePhysicalSupportedPair`.
5. `afterLocomotion`: the gait, torso, head and effectors step.
   - The arm goes from `HandIntent` through spans, point, orientation and IK (`solveArm` at a hard-coded 1/60 s), then rate-limited angles (`RATES`), then servo velocity targets under `TORQUES` and `velocityLimit` 24.
6. The Havok substep, then `Combat.onContact`, `scoreHit`, damage, sever and `queueStabilityEvent`.
7. Each render frame: `combat.advance(dt)` and `advanceFight`.

### What the body should do is written seven ways

- `Intent`: a mouse-shaped `HandIntent` (`pointerX`/`pointerY`, `reach`, `roll`, `wristBend`, `thrust`, `guard`).
- `BodyCommand`: its channels are gated by the mutable global `CHANNEL_FLAGS`, off by default and read at build time.
- `Orders`, plus a second order system in the dungeon (`dungeon/commands.ts`).
- The `ACTION_TUNING` primitives and `policies.ts`.
- The tactics `STROKE_SHAPES` and spans.
- Each chain's IK and servo targets.
- Four blank commands that disagree on reach: `freshIntent` (neutral reach), `freshBodyCommand` (0), the tactics blank (0), and `NEUTRAL` (from `CONFIG.arm`).

### Minds

- Six: `golem-duelist` (`golemTactics`, 2k lines), `skeleton-duelist` (a rename of it), `humanoid-duelist` (`golemTactics` plus an adapter), `humanoid-archer` (a `CommandMind` whose `decide` is a dummy), `golem-walker` and `idle`.
- One real brain drives every family. It couples to a body by capability, reading the published `reachable` spans, which is a good seam.
- `BodyView.unit` is always "golem".
- Family leaks:
  - `humanoidDuelist` scales strafe and offsets `pointerY`;
  - `Golem` has human-only appearance code, and infers a style from terminal-id strings;
  - `anatomicalChain` has a Rogue branch;
  - the dungeon checks `policy.name === "humanoid-archer"`.

### Fight rules

- A contact goes through, in order:
  - the refusals, then a spent stroke;
  - `parriedBy`;
  - `damageTargetFor`;
  - `impossibleSpeed`;
  - `hitCooldown`;
  - `strokeClaim`;
  - `resolve`.
- Closing speed is |v_arrival·n|, from the striker's step-start velocity. The struck part's own motion is not subtracted.
- The effective mass is physical (operational-space, with joint give), and restitution is 0.
  - Energy is ½μv² and impulse is (1+e)μv.
- `scoreHit` prices the energy through `BITE` per striker (`floorJ`, `joulesPerDamage`, `severQuality`) and `damageSpeedExponent`. Armour applies after scoring.
- The rules apply no shove impulse themselves: impulse times `shoveReadFraction` goes to the ledger.
- A sever takes the whole module, with `severKick`. Death is a fatal part severed or vitality at 0. `Ending` is only `"exhausted" | "time"`, so a fatal sever reads as exhausted.
- Rule constants live in five places: `CONFIG.combat` (mutable, and the default even in the "pure" `scoring.ts`), `BITE`, the part tables and `GOLEM_ASSEMBLY`, attributes, and the Warrior-era `VITAL_WEIGHT` (which throws on an unknown key).

### Clock and determinism

- Both run at 120 Hz. The page advances combat by the clamped render delta, so it is not reproducible.
- The harness has its own loop at a fixed 1/60, and the dungeon (`dungeon/run.ts`) is a third loop.
- State lives mostly in closures, plus mutable globals: `GOLEM_TACTICS`, `STROKE_INERTIA`, `CHANNEL_FLAGS` and `CONFIG`.
- The fork (`src/fork/*`): a graph walk, `Forkable` capture and restore, and a native Havok getter/setter round trip. Contact manifolds and warm starts are not captured unless `{heap: true}` is taken.

### Structural problems

- One god class, `Golem` (1523 lines), serves every family. `units.ts` keeps Warrior-era fields.
- `mind.ts`, the base-types file, imports the concrete policies, and `combat.ts` imports from `golem/`.
- Three loops. The dungeon installs a fake `CommandMind` and rewrites locomotion in `composeIntent`, bypassing orders and the hold, so the host puppets the body.
- God files:
  - `tactics.ts`: about 800 lines of the mutable `GOLEM_TACTICS` plus sweep prose, and a bare `STROKE_INERTIA` 3.9876...;
  - `config.ts` (1950 lines): Warrior sections, some read by nothing (axe, bow, buckler, rigView);
  - `golem/config.ts`: 5.5k lines;
  - `bout.ts`: pure rules mixed with URL parsing and pause.
- Two threat selectors: `watch` and `selectThreat`.
- `actionStrokeRoll` uses the frozen table's Warrior arm envelope, not the chain's published one.
- Stale code:
  - `defaultMatchup` uses "warrior";
  - `bout.test` uses retired policies;
  - the bout runner writes `intentObserver` on `Golem`, which has no such field;
  - comments still say 240 Hz and "HumanoidControlEndpoint".

### Top 10

1. One body class and one unit tag, with family behaviour done by `if`.
2. Three divergent bout loops, so there is no single world-step authority.
3. Seven command representations, with a mouse-shaped core.
4. One brain, with no seam between layers.
5. Mutable global tuning that harnesses move.
6. Rule constants in five places, with no swappable rulebook.
7. Inverted dependencies.
8. Warrior fossils that still carry weight.
9. The page clock is not deterministic.
10. Incomplete outcomes: no fatal ending, and a shove fraction nobody explains.

