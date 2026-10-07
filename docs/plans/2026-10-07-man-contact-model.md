# Man: contact anatomy, tested before it is built on

## Outcome and owner decisions

Standing up and punching have been hard. One suspected cause is the body's contact layout: the
Warrior's hand is a capsule, its foot a box fitted to a boot, and it has no toe joint. This plan
answers whether a fitted palm, a barefoot sole and a passive toe make the support postures and
transfers that defeat the Warrior physically possible on the game's solver. It answers the
question with cheap diagnostics first (phase A), builds the anatomy in the core only if they come
out positive (phase B), and ends with a measured comparison of the built body. It does not build a
fighter, a controller or screens for the new body; that is a separate plan, written from this
plan's result (see [After this plan](#after-this-plan)).

Kept from the owner's earlier decisions:

- Man keeps the Warrior's stature, mass, limb lengths, muscle limits, hand mass properties and
  surface stiffness. Hand and foot contact geometry are replaced, and the existing de Leva foot
  mass is divided between the main foot and the toes.
- A hand is one rigid body in every pose. There are no active fingers, no active toes, no mobile
  arch and no new damage model. Balance assistance is 0 everywhere.
- Existing models, controller presets and game defaults stay as they are. Man is not offered
  in the Arena, Crypt or Lab by this plan.

Left open, and put to the owner at gate B: whether Man stays a separate model or its contact
geometry becomes the human family's correction (the Warrior's baseline moves, every bout's
fingerprint changes and a new lock is taken).

## The evidence this plan starts from

The records show anatomy matters in specific places:

- The [posture audit](../reference/postures.md) finds `kneel on toes, knees light` unbalanced
  and `half kneel, hands` with no witness. Its contacts are box corners (`ball` is the box's two
  bottom front corners, a line) and the hand capsule's two ends. The roadmap names "the knees
  leaving a kneel on the toes (the ankle, and a foot with no toe joint)" among the four
  lift-offs the Warrior cannot hold.
- The [recovery-support study](../analysis/2026-10-05-recovery-support.md) records that the
  capsule hand's geometric endpoint candidates differ from the engine's manifold points, as a
  lead, not an established cause.

And they show control is a larger cause:

- The whole-body tracker (`control/whole-body.ts`, which describes itself as experimental) fails
  installed holds that independent joint feedback passes ([posture hold](../reference/posture-hold.md)).
- The offline native-rollout controller reproduces every selected next step and still fails the
  all-fours to half-kneel transfer (`nativeRolloutFollowups` in the study above).
- The Warrior with the reference riser already rises empty handed in all four development
  directions in 25 to 29 s ([recovery cycle](../reference/recovery-cycle.md)), and its standing
  straight/cross blows qualify.

So the anatomy question is narrow and measurable without a new controller: does it turn rows and
transfers that fail into ones that hold, under the instruments that already exist?

## Phase A: diagnostics

Phase A changes no runtime behavior. It adds a geometry artifact, research variants and one task
option. Each chunk is green and committed on its own.

### A0. Contact geometry artifact and anatomy record

- Add `scripts/core/man-envelope.mjs`, beside `scripts/core/workshop-envelope.mjs` and reusing
  `scripts/core/glb.mjs`'s `readGlb` and `weightedVertices`. Read the workshop-fighter GLB's
  `base__skin` and `bare__feet` meshes, never `boots__*`. Transform authored points through the
  fit scale and body-frame rule the human spec already uses (`src/core/human/workshop.ts`).
- Write `assets/humanoid/man-contact-geometry.json`, per side:
  - `palm`: the open hand's convex hull (wrist to fingertips, palmar face fitted planar) and its
    support patch (outline in the hand's frame, outward normal);
  - `fist`: the closed hand's convex hull from the posed finger bones, with the `knuckles` and
    `strike` points on its distal face;
  - `foot`: the barefoot main foot's convex hull, cut at the rig's `ball_*` bone head, and its
    sole patch;
  - `toes`: the toe hull distal to that cut and its toe-pad patch;
  - `mtp`: the hinge centre and transverse axis at the `ball_*` head;
  - `rigidFoot`: the hull of `foot` and `toes` together at the neutral toe angle;
  - each foot piece's solid volume, centre and unit-mass inertia tensor.
- The de Leva foot mass is divided between `foot` and `toes` by volume, a uniform-density
  approximation stated in the record. Hand mass properties stay those of the existing hand.
- Write `docs/reference/man-anatomy.md`: inputs, fitting rules, approximations, the toe spring's
  sources (below) and raw measurements. Add `SOURCES` entries (`src/core/sources.ts`) for the
  artifact and the two spring sources.
- Toe spring inputs, recorded as prototype values: neutral rest angle, 25 N m/rad stiffness and
  2 N m s/rad damping from [Falisse et al.](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0256311);
  stop bounds of about -90 to +90 degrees from the [OpenSim Gait2392 coordinate interval](https://github.com/opensim-org/opensim-models/blob/master/Models/Gait2392_Simbody/gait2392_thelen2003muscle.osim),
  which that model does not clamp, so the bounds are a prototype choice, not a measured range.
- Test: `tests/man-envelope.test.mjs` re-runs the script and compares the artifact, and checks
  handedness (left mirrors right), palm patch area against the hull's palmar face, convexity,
  and that `foot` and `toes` meet at the hinge without overlap beyond 1 mm.

As built: the artifact is at the authored size, like the trunk hulls, and a spec scales it by
`FIT_SCALE`. The hands are skinned through `scripts/lab/fist-probe.mjs`, which needed `FIST` to
move from `src/render/skin.ts` to `src/render/fist.ts`. The palm patch lies on the hull's
largest face within 45° of palmar, because the most palmar plane touches the hollow palm in only
0.7 cm². The hinge lies at the middle of the cut's height, because the rig's ball head is 9 mm
above the ground. The source keys are `man-contact-geometry`, `falisse-2022-toes` and
`opensim-gait2392-mtp`. `docs/reference/man-anatomy.md` holds the numbers.

### A1. Statics with fitted contacts and a passive toe

Extend the posture audit's statics (`research/core-posture-trials.mjs`, instrument A) with an
`--envelopes` axis beside `--variants`, in `research/core-posture.mjs`:

- `boot`: today's `contactsOf`, unchanged.
- `barefoot`: `envelopeSpec(spec, "barefoot")`, a research transform like `strippedSpec`, puts
  `rigidFoot` as each foot's shape and `palm` as each hand's shape; mass properties are not
  touched (a shape carries no mass, `SegmentSpec.shape`). `contactsOf` reads the sole patch's
  outline for `sole`, the toe-pad outline's front edge for `ball`, and the palm patch outline
  for `hand`.
- `toe`: as `barefoot`, with the toe pad posed about `mtp` by one more knob, the toe angle,
  within the prototype bounds. The toe is massless here and its mass stays in the foot (stated).
  Toe-pad forces act on the foot as rigidly attached, plus one equality row in the linear
  programme: the toe-pad forces' moment about the hinge axis equals the spring moment
  `stiffness * (angle - rest)`, with a free stop reaction of the right sign at a bound.
  `lowsOf` includes the posed toe hull.

Run every row of `ROWS` on all three envelopes, built variant, both frictions, the same seeds and
evaluation budget as the existing audit. Record `docs/reference/man-postures.md`: per row and
envelope, the verdict, least share, support margin and toe angle, and the witnesses as postures
under `research/runs/postures/`. Statics are one-sided: a held row is a witness, "none found"
is not "none".

Test: extend `tests/research-posture.test.mjs` with a fixture where `boot` is unbalanced and `toe` holds
(`kneel on toes, knees light`), and a mutation that drops the spring row and must change the
`toe` answer.

### A2. The toe joint on the game's solver

Add `research/man-toe-solver.mjs`, a fixture built directly through `rapierModule`
(`src/core/engine/rapier.ts`), outside the core:

- a leg body carrying half the Warrior's mass less one foot, on an ankle revolute held by a
  velocity motor capped at the ankle muscle's peak; the `foot` hull; the `toes` hull on an
  impulse revolute at `mtp` with the prototype limits and a ForceBased position motor
  (`configureMotorModel`, `configureMotorPosition`) at the A0 spring values; the ordinary ground.
- Load cases: flat stance; heel raised onto the toe pad with the load ramped from zero to full
  over 1 s and held 3 s; and the toe dorsiflexed near its bound as in a kneel on the toes.
- Configurations: 120 Hz with `SOLVER`'s iterations; 480 Hz, read at 120 Hz spacing; 120 Hz
  with four times the iterations; the toe locked by a fixed joint; and a single `rigidFoot` body.
- Readings: hinge separation, toe angle against the static prediction from the measured toe-pad
  moment, peak-to-peak toe angle over the last second, the fixture's total mechanical energy
  over the hold, and the spring's impulse.

Declared engineering acceptance at 120 Hz with the game's iterations: hinge separation at most
1 mm, steady toe angle within 0.05 rad of the static prediction, peak-to-peak at most 0.01 rad,
no rise in total energy over the hold beyond 1 % of the spring's stored energy, and the 480 Hz
run within the same tolerances. Record `docs/reference/man-passive-toes.md` with the full table,
including failures.

### A3. Engine holds and transfer with the fitted palm

The passive toe needs core support that phase B builds, so this chunk tests the palm and the
barefoot sole with a rigid toe, which need none: `hull` is an existing `ShapeSpec` kind and
`build/hand-poses.ts` swaps any shape.

- `src/core/tasks/posture-hold.ts` accepts an optional anatomy override (`spec`) and an optional
  starting placement; omitted, everything is as today, including the direct controller's
  measured traces. The task's environment identity includes the override.
- `research/native-posture-control.mjs` takes `--envelope boot|barefoot` and `--transfer`, which
  makes the archived all-fours to half-kneel transfer (`nativeRolloutFollowups`) a durable
  option: two seconds' hold, six seconds' smoothstep interpolation, ten seconds' hold.
- Starts for `barefoot` come from A1's witnesses for `fours`, `half kneel` and `squat`, placed
  with `placeLike`; `boot` keeps `assets/research/posture-holds.json`.
- Run, for both envelopes: the direct posture-hold suite
  (`research/control-foundation.mjs --suite posture-hold`), the native-rollout hold of each
  posture, and the native-rollout transfer. Read the loaded manifold points per hand and their
  spread, beside drift and effort.

Record the results in `docs/reference/man-postures.md`, naming harness, engine revision, rate,
loadout and assistance. Test: `tests/core-posture-hold.test.mjs` gains an override case, and the
existing cases' traces stay identical.

### Gate A

Continue to phase B if all of these hold:

1. A1: with `toe`, at least one route row that fails on `boot` holds (`kneel on toes, knees
   light` or `half kneel, hands`), and no row held on `boot` is lost.
2. A2: the passive toe meets its acceptance at 120 Hz. If only the locked toe or `rigidFoot`
   does, phase B builds Man without a toe joint and skips B2.
3. A3: `barefoot` holds the installed postures no worse than `boot` (drift and failures), and
   the palm carries load on more, wider-spread manifold points than the capsule. If the palm is
   no better, phase B keeps the capsule hand poses.

If gate 1 fails, stop. The anatomy is not the obstacle these instruments can see. Put the result
and the choice to the owner: stop the Man model, or build it for the punching geometry alone.

## Phase B: Man in the core

Phase B changes shared runtime. Before B1, capture a pinned runtime behavior lock with
`scripts/fingerprint.mjs` from a fixed `git archive` snapshot of the current commit, including
the landed Crypt foe targeting, down timing and spec-defined guard labels. Every chunk keeps
every existing case bit-identical.

Constraints carried into every chunk:

- `src/core/man/` owns anatomical input and construction only. There is no Man runtime,
  physics loop, fighter or equipment path. `PhysicalBody`, `buildBody`, `hostedBody` and
  `World.step` are kept as they are.
- Man is constructed from shared calibration inputs, never by spreading `humanoidSpec(...)`.
- `commandable`'s box-foot contract stays; Man is not commandable, and nothing forces the
  reference controller onto it.
- Body-specific names live in anatomical data. New code reads effectors, the body tree and
  `BodySpec.marks`, not private lists of segment names.

### B1. Hand envelopes

Only if gate A kept the palm. Put the `palm` hull as Man's `open` hand pose and `fist` as `fist`.
`grip` keeps the existing capsule grip envelope, so the qualified club holding and its grip
frame are unchanged. The hand stays one collider and the hand-pose swap is unchanged. Add the
grip channel and a multi-piece hand later, and only if punching or club work needs it.

Tests: extend `tests/core-hand-poses.test.mjs` for hull poses: unloaded swap, a blocked swap
deferred, mass properties and velocities unchanged, replay in a fresh world.

### B2. Passive joints and coordinate mapping

Only if gate A kept the passive toe.

- `src/core/spec/body.ts`: `DofSpec` becomes a union, a muscular freedom
  (`muscle: MuscleSpec`) or a passive one (`passive: { rest, stiffness, damping }`, each a
  sourced `Quantity`), sharing `positive`, `negative`, `axis`, `min`, `max` and `bind`. Export
  `isPassive(dof)`. The compiler lists every reader of `dof.spec.muscle` to update.
- `src/core/engine/engine.ts`: `EngineJoint.setSpring(k, rest, stiffness, damping)`;
  `rapier.ts` implements it with the ForceBased position motor at A2's qualified settings.
  `motorStepImpulse(k)` on a passive freedom reads the spring's impulse.
- `build/passive-joints.ts` owns the spring law and its reading; the builder sets springs once
  at construction. Springs stay active while muscles are limp, a motor release never touches
  them, and physics snapshots restore them.
- `muscle/driver.ts`, `observation.ts`, `mind/direct.ts`, `build/coupled-dynamics.ts` and the
  coupled tracking path change together. Muscle and action channels hold only muscular freedoms
  and carry their physical-coordinate index. Observations include passive motion. An action can
  never command a passive freedom. Torque columns map to the full physical coordinates. Spring
  loads enter predictions once and never count as muscle effort. Where the mapping is the
  identity (every existing body), channel order and arithmetic are unchanged.
- Tests: `tests/core-passive-joints.test.mjs` with a passive freedom between two active ones:
  torque mapping, loaded spring response, both limits, damping, equal and opposite reaction,
  limp behavior, zero muscle effort on the passive freedom, and restored motion in a fresh
  world. Extend the dynamics, direct-policy and snapshot/fork suites.

### B3. Man anatomy and presentation

- Add `src/core/man/figure.ts` and `src/core/man/spec.ts`. Reuse `spec/geometry.ts` and the
  existing human figure, landmarks, tables, joints, muscles, speed and wounds helpers; extract
  only a helper both constructors read. Add the two toe segments and their passive hinges (or
  the rigid foot, per gate A). Keep total mass. Declare effectors, marks including `guards`
  (hands and forearms), wounds and the down rule; toe contact never reads as down.
- Draw Man through the existing `drawBody` path (`src/render/body-shapes.ts`) on the stand:
  applied hand geometry and moving toe geometry. No model registration, skin or screen.
- Tests: `tests/core-man.test.mjs` checks the whole spec and its provenance
  (`specProvenanceFaults`), mass accounting, positive tensors, bind alignment, and geometric
  nonadjacent clearance under direct and limp fixtures. Extend the render tests for pose
  updates and an independently moving toe.

### B4. The anatomy comparison

Run A1's statics on Man as built, and A3's suite on four bodies: Warrior with the boot, Man,
Man with the toe locked, and Man with capsule hands. Add the installed holds of
`kneel on toes, knees light` and `half kneel, hands` from A1's witnesses, and a native-rollout
transfer from `kneel on toes` to `kneel on toes, knees light`. Same tasks, rate, solver,
strength, friction and zero assistance throughout. Keep every trial, including failures and
timeouts.

Record `docs/reference/man-contact.md`. Name harness, full engine revision, rate, loadout and
assistance in every figure. These are finite capability fixtures, not a recovery success rate.
Report each ablation separately; do not credit a difference to the toe that the palm made, or
the reverse.

Extend `scripts/fingerprint.mjs` with named Man stand cases (built, limp, held posture) and keep
every old case. Update `docs/architecture.md` and `docs/roadmap.md` with what was built and
measured. Put the end-state choice above to the owner. Then delete this plan.

## After this plan

If B4 shows postures or transfers that hold on Man and fail on the Warrior, the next plan builds
the controller that uses them: a selectable path-fighter motion, a contact recovery sub-mind
whose route B4 has shown to be feasible, grouped-support readiness, and the Lab and Arena
integration. The earlier draft of this plan (`docs/plans/2026-10-07-man-contact-model.md@42cd1e5a`)
holds the integration analysis for that work: `CONTROLLERS` compatibility, `models.ts` defaults,
`fields.ts` readers, `enlist`, `labActor`, guard labeling and the qualification gates.

## Landing each chunk

Phase A chunks that touch only research, scripts, assets and documents: run the chunk's tests,
`npm run check`, and, where `src/` changes (A0's `SOURCES`, A3's task option),
`node --test tests/core-boundary.test.mjs tests/exports.test.mjs tests/comments.test.mjs`.
Phase B chunks change shared runtime:

```powershell
npm test
npm run check
npm run build
node scripts/fingerprint.mjs --compare <runtime-lock.json>
git diff --numstat
git diff --ignore-cr-at-eol --numstat
```

The two numstats must be equal. Re-run a dropped test count on a quiet machine. Stage and commit
only the chunk's files. If a gate fails, keep the failure in its record. Do not raise strength,
add assistance, or reduce a task to turn it green.
