# Man: fitted contacts, passive toes and shared control

## Outcome and owner decisions

Add an opt-in **Man** physical model that stands, moves, recovers using its palms and punches
in the Lab and Arena. Its anatomy is independently constructed; its controller is selectable
independently of the model and uses the shared fighter parts.

The owner chose a usable fighter as the first completed version, rather than an anatomy-only
prototype. Keep Warrior's baseline stature, mass, limb lengths, muscle limits, hand mass
properties and surface stiffness. Replace hand and foot contact geometry, and partition the
existing foot mass between the main foot and toes. Record the wider anatomical audit without
recalibrating the rest of the body in this implementation. Show physical geometry in both
World and Tactical views. Existing models, controller presets and game defaults stay as they
are; Man defaults to empty hands, Contact control and zero balance assistance.

Active fingers, active toes, a mobile arch, a new damage model, new character skins, kicks and
ground fighting are outside this first version. A hand remains one rigid body in every pose.
The existing single-hand club is supported and measured separately from unarmed qualification.

## Fit with the core cleanup

The [core cleanup](2026-10-07-core-cleanup.md) owns the shared controller, attack and combatant
organization. Reviewed at `1d17bd8e`: its runtime work through chunk 20 is settled, and chunk
21's presets harness, spec-defined guards and controller document reconciliation have landed.
Remaining preset figures are not runtime prerequisites for Man. Re-read subsequent runtime
changes and take a fixed
baseline before implementation; a later correction invalidates comparisons against the old one.

- Consume the landed contracts directly: `effectorStrike(def)` and
  `combatSkills(body, driving, settings)` (chunk 15), `enlist` and `armedWith` (chunk 17),
  `Controller.fields` and per-side settings (chunk 18), `approachToRef`/`turnToRef`, shared club
  inertia and down cached at look (chunk 20). Do not implement the superseded proposals in the
  cleanup plan: there is no `strike-defs.ts`, universal impact tuning or shared reptile readiness.
- `src/core/man/` owns anatomical input and construction only. There is no `ManBody` runtime,
  Man-specific physics loop, copied fighter, separate equipment implementation or second
  screen-side combatant builder.
- Keep `PhysicalBody`, `buildBody`, `hostedBody`, `World.step`, the actuator enforcement and
  the shared equipment lifecycle. Core policies receive measurements and granted commands,
  with no engine handles added to their interface.
- Extend the **path fighter** with a selectable motion implementation. It composes shared
  targeting, order following, guard/cover, locomotion planning and the effector strike. Do not
  restore `arena-fighter` or Point control, retire Classic, or add another mind kind for Man.
- `CONTROLLERS` remains the owner of `fits(spec, config)`, `faults(config)`, presets, fields and
  creation. `faults` validates settings without a body; `fits` checks the selected motion and
  sub-minds against anatomy through exported predicates. Keep `commandable`'s existing box-foot
  contract for reference control; do not widen it to admit Man into a motor that cannot drive it.
  Screens, links and construction use the registry; none infer compatibility from `model === man`.
- Body-specific names and contact roles live in anatomical data. New movement and recovery
  code reads effectors, support groups, the body tree and `BodySpec.marks`; it contains no
  private copies of humanoid segment-name lists or box/capsule assumptions.
- Add only contracts with readers in these chunks. Avoid a general plugin framework, another
  controller registry, flags that choose a skill stack, or speculative anatomy abstractions.

The [control foundation](2026-10-04-control-foundation.md) remains the contract for independent
policies, motion objectives and tasks. Contact control is one optional implementation of those
contracts, not a prerequisite imposed on every policy.

### Landed integration points

- `core/combatant.ts`'s `enlist(world, enlistment)` takes an already armed `spec`, explicit
  `mind`, `out`, `name`, `orders`, senses and rules, with optional solids, balance, percent and
  contact identity. Arena and Crypt use it. Preserve their pre-build checks and hook order:
  hand poses, mind, reading. `items/held.ts` owns `HELD`, `heldItem` and
  `armedWith(spec, hand, held)`; Arena surface overrides are applied before arming.
- Lab remains `buildBody` plus `labActor`, driven by a scenario script, without an injury pool
  or combatant senses. Extend its existing actor with the shared motion/skill composition it
  needs; do not route it through `enlist` or start a second fighter over the scripted body.
- `models.ts` owns `{mind, held}` defaults. Register Man there with Contact and empty hands.
  `matchup.ts` currently prefers Classic when choosing a control without a valid preset; make
  that fallback choose a fitting preset of the model's declared default mind kind through
  `PRESETS`. Existing Arena defaults remain Classic, including the staged-rise choice distinct
  from `RECIPE_FIGHTER`.
- `fields.ts` owns the `down` field (`subs`); `controllers.ts` owns `PATH_FIELDS`.
  `matchup.ts`'s `settled`, `linkedSettings`, `readMinds` and `settingsSearch` already apply and
  serialize edits. Extend them, rather than adding a Contact settings parser or `recovery=` key.
  Add a motion field whose reader normalizes omission to `reference`; the generic `choice`
  reader would otherwise expose `undefined` for every old preset.
- Edited settings need the body's compatibility check too: pass the selected model to
  `settled` and use `modelSupportsMind` after config faults are checked. `linkedSettings` and
  Arena's settings panel use that result, retaining the entered values and fault while
  `readMinds` falls back to the fitting preset. Add the same registry `fits` check to
  `createMind`; Duel's early check remains. A preset that fits does not prove every edit fits.
- `control/approach.ts` supplies compatible point/frame approach calculations. Reuse it where
  its law applies; preserve each caller's response rate and goals. `recoveryReady` remains the
  humanoid gate; the reptile keeps its tail/height-aware gate. Every host reads down at look,
  before act and physics; Contact recovery reads that cached host value too.
- `research/controller-presets.mjs` and `combatCell` in `research/combat-records.mjs` supply
  the paired Arena evaluation path. Reuse them for comparative reports; the presets figures
  are still pending and are not evidence that Contact or Man works.
- `Marks.guards` names the segments that cover. Arena's trusted `ContactTarget.guard` label
  comes from that list, and `contactResponse` uses the flag to distinguish a block from a
  target hit. Declare Man's hands/forearms there; every convex hand piece keeps its segment's
  identity and guard flag. Lab object/dummy contacts retain their ordinary target identity.
  Do not recreate the removed segment-name regex or infer blocking from a collider's shape.

## Physical and control contracts

### Contact geometry and poses

In `src/core/spec/body.ts`, split primitive convex shapes from `ShapeSpec` and add a compound
whose parts are an ordered, non-nested list of primitive convex shapes. Keep item shape arrays
and their existing frame restrictions: `ItemShape` excludes boxes from `ConvexShapeSpec`,
not from the compound union. One shared shape-parts reader supplies the builder,
rigid geometry, geometric queries, compliant apparatus and renderers. Flattening retains the
segment owner for every part; held-item colliders retain their own owners.

Keep `SegmentSpec.handPoses` in the same reference frame. Man's seven pieces are the palm,
the proximal/middle/distal finger bundles and the three thumb pieces. Bake open, fist and grip
from the existing hand geometry and posed bones. Use a fitted planar palmar face for support;
the fitted grip leaves a channel for the existing club haft. The piece count and ordering are
identical across poses. No independent finger joints or inferred collider mass are introduced.

Extend `build/hand-poses.ts` and the engine shape-replacement contract to preflight and replace
all hand pieces atomically. Every replacement must be clear and the hand unloaded before any
collider changes. Preserve handles, filtering, collider ownership, mass properties, velocities,
attachment state and pending requests. Keep the old single-collider path's call order. Make
the retained held-hand envelope an explicit segment declaration for the existing humanoids;
Man uses its declared fitted grip instead of inheriting that legacy exception.

Add a sourced grip frame to the physical hand description. `human/grip.ts` reads it for Man;
its existing capsule-derived construction remains the fallback for existing models. Holding
capability is geometric and shares the same capture rules for compound and separate equipment.
Pose selection alone never grants an attachment or a damage/strength bonus.

Add named support patches to the spec, with their segment, limb group, reference-frame outline
and normal. A group can contain several segments, as one foot contains its main sole and toe
pad. Hands, feet and knee support are bound through anatomical data. An adapter supplies
equivalent descriptions for the existing Warrior geometry when Contact control is selected.
Candidate geometry is distinct from actual loaded manifold points; nearby vertices are not
evidence of contact. Do not treat a capsule's side manifold as a broad planar palm.

### Passive freedoms and complete dynamics

Make `DofSpec` distinguish a muscular freedom from a passive spring freedom. A passive
description contains sourced rest angle, rotational stiffness and damping in addition to
the ordinary axis, bind and limits. All freedoms remain in the body tree and physical dynamics.
Muscle/action channels contain only muscular freedoms and carry their physical-coordinate
index. Preserve existing channel order and arithmetic when that mapping is the identity.

Update `muscle/driver.ts`, `observation.ts`, `mind/direct.ts`, motion models and the coupled
tracking path together: joint observations include passive motion, action validation cannot
command passive freedoms, and torque columns map to the full physical coordinates. Do not
silently delete passive rows or assume channel index equals coordinate index. Passive loads
enter predictions once and are never also counted as commanded muscle effort.

Add an engine contract for a one-axis passive rotational spring. The vendored Rapier binding
already exposes ForceBased position springs; qualify and use that implicit solver path rather
than applying a stiff explicit torque from a mind. Springs remain active while muscles are
limp and are restored by physics snapshots. Their response and impulse are reported separately
from muscular effort; motor release must not disable them.

Initial MTP values are neutral rest angle, 25 N m/rad stiffness and 2 N m s/rad damping from
[Falisse et al.'s walking model](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0256311).
Use the [OpenSim Gait2392 declared coordinate interval](https://github.com/opensim-org/opensim-models/blob/master/Models/Gait2392_Simbody/gait2392_thelen2003muscle.osim)
of approximately -90 to +90 degrees as prototype stop bounds, not a measured physiological
range: that source's coordinate is not clamped. Record this choice explicitly. A sensitivity
sweep may replace these inputs only with a sourced before/after record; numerical stabilization
must not be disguised as anatomical damping, strength or added inertia.

### Motion, fighter composition and recovery

Extract the small command-body motion interface actually read by `body.ts` from `MotorControl`
in `control/motor.ts`: goals, control, root/effectors, physical point/path readings, the stance's
`read`/`reading`, standing goal, reset and explicit state. Add it in `control/command-motion.ts`;
do not require Contact to implement the reference stance's internal bearing/ownership methods.
The existing motor controller implements it without changing its reference calculations.
Add `control/contact-motor.ts`, implementing the same contract through the shared bounded
whole-body/contact tracking machinery, including passive coordinates and loads. One owner
combines posture, both hands, root motion and support demands into the final muscle command.
`createBody` accepts that motion choice with a reference default; its hosted lifecycle stays
shared. Keep the reference state shape and `look`/`act` order. Select `Body.envelope` with the
motion implementation: Contact reads its own model/loadout measurement or null while measuring,
never calls `stanceEnvelope(man)` or borrows a Warrior row merely to construct the body.

Add optional `PathFighterConfig.motion: reference | contact`; omission resolves to reference.
`resolvePath`, `pathFaults` and the registry handle it once. The Contact preset uses alternate
hands, linear standing blows, cover defense and contact recovery, with kicks, ground attacks
and combinations off. Contact configurations requesting those unimplemented skills are
refused through the shared compatibility path. Its ordinary motion/recovery selections travel
through `Controller.fields`, links and saves; numerical tuning remains research-only.
`contact-recovery` is a member of `SubMindConfig`, made by `subMind`/`subMindsOf`, and offered
by the existing `down` field. Let `down` take a declared options list, defaulting to today's
three choices; the path entry adds Contact recovery to its list. Its motion/support requirements
are checked by the path entry's `fits`; add it to the recipe fighter's down options only if
that pairing is actually supported.
Reference staged/support recovery is not implicitly valid on passive-toe anatomy.

Reuse the common locomotion goals and strike definitions. Contact support reading groups main
foot and toe contacts, uses actual loaded points, verifies unloading before swing and landing
before double-support handover, and exposes the stance readings existing tactics need. Derive
its pace and turn ceilings from its own qualification; do not read Warrior's reference-envelope
row as if it measured this controller. Solver rejection cancels the current transfer or stroke
and returns to acquisition/recovery; it never creates support or teleports a limb.

Add `mind/rise/contact-recovery.ts` as a reusable sub-mind, selected by plain config. Its route
is settle/roll, acquire open-palm and knee support, plant one foot, transfer weight, raise and
place the second foot, release palms, then verify standing. Existing roll/posture data can seed
the route, but loaded support, clearance, orientation and motion decide transitions. Deadlines
cause retries; elapsed pose time is never success. Recovery can begin without the support it
is trying to acquire and reads down through the host's existing rule. It owns commands only
while hosted, withdraws its pose/transfer work on end, and resumes the fighter through the
existing `Skills.release`/`Skill.resume` contract. Both reference and Contact keep their own
saved motor and recovery state; no controller, built body or callback enters that state.

Extend the owner of `recoveryReady` with a grouped-support entry point, retaining the old
entry point's behavior. Require both foot groups loaded, no other fixed support, COM within
actual bearing support and quiet motion continuously for the existing 0.5 s handover gate.
Readiness does not require both the toe and heel of every foot to contact simultaneously.

Contact uses `CombatExecution.physicalFists` and the combat skill's existing applied-pose
`prepared` check for bare hands; extend that path for compound envelopes and blocked-request
withdrawal. Held strikes retain grip, and the reference execution defaults stay unchanged.
Recovery requests open palms and waits for the applied pose before acquiring palm support.
A blocked request withdraws/retries through the ordinary cycle. Keep collider ownership,
surface stiffness,
injury pools and the existing impact-energy/damage rule; multiple convex pieces do not create
multiple priced blows for the same segment contact episode.

## Implementation chunks

Every chunk is independently green and committed. Existing configurations are pose
bit-identical; new-model/new-controller cases are intended additions. State reshaping is named
and checked separately, as in the cleanup lock. Update this plan as chunks land, and delete it
after the final chunk. Code and `SOURCES` cite reference records,
never this plan.

### 0. Calibration and behavior baseline

- Add `scripts/core/man-envelope.mjs` and `assets/humanoid/man-contact-geometry.json` for
  reproducible hand poses, barefoot main-foot/toe hulls, grip frames and support patches.
  Read skin/bare-foot vertices, not boots. Cut the foot at the rig's ball head and use its
  transverse hinge; transform authored points through the same fit scale and body-frame rule.
- Store measured solid volumes, centres and unit-mass tensors for the two foot pieces. Share
  their existing de Leva foot mass by volume and derive explicit mass properties. State the
  uniform-density approximation. Keep hand mass properties pose-independent for this version.
- Write `docs/reference/man-anatomy.md` with inputs, fitting rules, approximations, spring
  sources, calibration audit and raw measurements; add the necessary `SOURCES` entries.
- Tests: `tests/man-envelope.test.mjs` reproduces the artifact and checks handedness, palmar
  area, grip clearance and fitted-piece geometry. Capture a pinned runtime behavior lock,
  including the landed Crypt foe targeting, down timing and spec-defined guard labels;
  do not reuse a pre-cleanup lock.

### 1. Compound contact geometry and grip frames

- Change `spec/body.ts`, `build/rigid.ts`, `build/build-body.ts`, `build/hand-poses.ts` and
  `engine/engine.ts`/`rapier.ts` as specified above. Update shape consumers through the common
  primitive-parts reader, including `control/ground.ts`, planar-support queries, apparatus,
  `render/body-shapes.ts` and shape fixtures. Preserve old collider ordering.
- Tests: extend `core-hand-poses`, `core-engine`, `core-club` and hand-presentation tests;
  add `core-compound-shapes` for whole-envelope clearance rejection, atomicity, ownership,
  loaded deferral, attachment retention, geometry queries and fresh-world replay.

### 2. Passive joints and coordinate mapping

- Change the joint spec, builder, muscle driver, detached observations/actions and coupled
  dynamics/tracking together. Add `build/passive-joints.ts` for the spring law/reading owner;
  the engine owns its application and the builder owns its lifecycle.
- Tests: `core-passive-joints` and the existing dynamics, direct-policy and snapshot/fork
  suites. Cover a passive coordinate between active coordinates, active torque mapping,
  loaded spring response, both limits, damping, equal-and-opposite reaction, limp behavior,
  zero muscle effort on a passive freedom, and restored motion in a fresh world.
- Record spring qualification in `docs/reference/man-passive-toes.md` on the gameplay engine
  at 120 and 480 Hz, reading the faster run at the slower spacing. Measure energy storage,
  dissipation and response under load; the earlier free-joint API probe is feasibility only.

### 3. Man anatomy and physical presentation

- Add `man/figure.ts` and `man/spec.ts`. Reuse `spec/geometry.ts`'s shared mass/shape derivation
  and the existing human figure, landmarks, tables, joints, muscles, speed and wounds helpers;
  extract only additional derivation helpers that both constructors actually read.
  Construct Man from shared calibration inputs, never `...humanoidSpec(...)`. Add two toe
  segments and passive hinges, keep the remaining joint limits/muscles and total mass, and
  declare effectors, support groups, grip frames, marks including guards, wounds and down
  rule explicitly.
- Qualify `manSpec` and physical presentation directly through the existing `drawBody` path
  in the stand. Public model/display/default registration waits for chunk 5, when Contact can
  drive it. The delivered World and Tactical views show applied hand geometry and both foot
  segments, with no clothing or skin controls for Man.
- Tests: `core-man` checks whole spec/provenance, mass accounting, positive tensors, bind
  alignment and geometric nonadjacent clearance through direct/limp fixtures; expose no broken
  game default. Extend render tests for pose updates and independently moving toe geometry.

### 4. Shared Contact motion and recovery

- Add `control/command-motion.ts`, extract the command-body motion interface and implement
  `control/contact-motor.ts` and `control/contact-support.ts`; reuse the coupled dynamics,
  bounded tracking, effector paths and contact machinery. Add the Warrior support-description
  adapter for paired comparisons.
- Add contact recovery and grouped readiness through `control/recovery-ready.ts`,
  `mind/config.ts` and `mind/sub-minds.ts`. Add the motion selection to
  `mind/path-fighter.ts`/`config.ts`, compatibility in `controllers.ts` and `createMind`, and
  compose `pathTactics`, `driveBy` and `combatSkills(body, driving, settings)`.
  Preserve `effectorStrike(def)`'s cycle ownership; add physical-pose admission through the
  shared combat skill, not a Man strike executor. Keep attack path/execution tuning with its
  existing owners. The independent point-strike task and reptile bite remain as qualified.
- Tests: `core-contact-support`, `core-contact-motor` and `contact-recovery` exercise palm
  loading, toe-only support, loss of contact, weight transfer, failed landing, rejection,
  retries, cancellation, takeover/resume and saved state during every recovery stage.
  Extend `core-controllers`, `core-body`, `core-fork` and `core-step-cost` tests for omission
  resolving to reference, compatible recovery, active/passive mappings, envelope selection,
  cached down, ownership and construction rejection without model-name branches.
- Add `research/man-control.mjs` with worker queues over the ordinary Node stand and Arena
  Duel. Record timings, allocations, movement limits and all task results in
  `docs/reference/man-control.md` and its raw JSON. Use the existing Arena protocol/job runner
  and `combatCell` for mirrored comparative bouts, keeping body, control, loadout and balance
  strata distinct. Preallocate step work as needed; measure any shared optimization
  before/after and preserve the existing arithmetic and fingerprints.

### 5. Lab/Arena integration and qualification

- Add the Contact preset and fields through `CONTROLLERS`, `fields.ts`'s motion/down readers
  and register `man` through `models.ts`, including its Contact/empty defaults. Add its display
  in `render/models.ts`, dresser dispatch and appearance compatibility. Update `matchup.ts`'s
  default lookup and model-aware `settled`, plus `arena/main.ts`'s settings call sites.
  Arena uses `enlist` with the already armed spec; Lab keeps `labActor`. Both use `armedWith`;
  do not build a Man-only actor path.
  Keep current defaults and Crypt spawn choices unchanged. Unavailable model/controller
  combinations are refused consistently.
- In `lab/scenarios.ts`, `lab/loadout.ts`, `lab/actor.ts`, `lab/minds.ts`, `lab/main.ts`,
  `lab/lab-scenario.ts`, `lab/setup.ts` and `lab/hud/character-section.ts`, make Man
  available in Stance/Run with its selected motion and skills. Broaden the Lab's model type
  from `HumanoidModel` to the supported `BodyModel` subset without pretending Man is a
  workshop rig. Add one `motion` choice and a Contact `down` choice to the existing Lab
  address/readers; `mind=script|guard` remains the scenario's tactics wrapper. The actor's
  recipe skill maker stays the default; Contact uses the shared combat skill maker with
  resolved settings. Test scenario/model/motion/recovery compatibility before construction.
  Keep recipe Blow/Routine confined to the bodies and reference motion they qualify.
  Add `lab/contact-mode.ts` and `lab/contact-scenario.ts`
  (`scenario=contact`) for open/fist/grip requests on either hand, requested/applied readouts,
  palm support, toe flexion, shove/recovery and left/right punching. Use the same core tasks
  for page and research. Existing recipe Blow/Routine choices stay as they are.
- Extend `lab-scenarios`, `lab-actor`, `lab-loadout`, `arena-controls`, `arena-core` and
  model/render and fork/replay tests for Man, Contact on Warrior, either side, invalid pairings
  and controller settings. Manual Lab requests go through the checked pose port; the current
  task is the sole command owner. Pause freezes
  physical tasks, and replay restores applied geometry rather than a cosmetic fist timeline.
- Extend `core-combat-openings` and `punch-foundation` tests: a contact on any piece of a
  declared guard is a block, an intended unguarded segment/object is a target, and an unrelated
  body is incidental. Exercise the trusted Arena labeling and shared contact-response path.
- Extend `scripts/fingerprint.mjs` with explicitly named Man/Contact and Warrior/Contact
  standing, walking, recovery and punch cases plus a Man Arena replay. Select their motion
  through shared constructors; do not add Man to the old reference stand loop and assume it
  works. Retain every existing case name/configuration in the pinned lock.
- Verify the built application in a private preview: both views, both hand poses, passive
  toe movement, standing/walking, palm-assisted recovery, punches, club grip, model/controller
  switching and a replay. Check visibility/frame advancement. Stop the private server by PID.
- Update architecture, roadmap and README with delivered behavior and measured limitations.

## Qualification and landing gates

Use the pinned post-cleanup runtime gameplay engine revision, symmetric actuation and 120 Hz
for the primary comparison. Balance assistance is 0 on every side; strength, solver settings,
friction and damage are held constant. Keep every trial, including a failed or timed-out one.

- Unarmed recovery passes the existing four-direction cycle: a real fall from the prescribed
  1.5 N s/kg trunk shove, verified standing within 60 s, then one second walking over 0.15 m
  without reading down, followed by two seconds standing. Pass two successive falls in one
  world and measure additional directions/disturbances independently of the development set.
- Each left/right straight/cross standing cell supplies at least three measured impacts and
  verified returns in its 8 s window, with no failed cycles or attacker falls. Include misses,
  obstruction, interrupted preparation, support loss and immediate recovery cancellation.
- Measure club holding, striking and recovery separately and retain all results; successful
  unarmed qualification is not a claim that every club recovery direction works.
- Record Warrior/reference, Warrior/Contact and Man/Contact. Compare Man with a locked toe
  and with capsule-hand envelopes under otherwise identical inputs. Do not force an
  incompatible reference controller onto Man to fill a comparison cell, or attribute a
  combined body/controller improvement solely to anatomy.
- Qualify palm weight-bearing and heel-to-toe transfer independently of the get-up result.
  Measure actual contacts and toe angle: standing on the front face of a vertical rigid
  foot box cannot pass the intended contact route.
- Name harness, full engine revision, rate, loadout and assistance in every figure. Separate
  driven impact peaks from struck responses and exclude startup/after-contact motion.
  Record browser timing separately from Node behavior; verify the arena replay equivalence
  already required by the repository. Treat these finite fixtures as capability gates, not
  a population recovery success rate or proof of human force parity.

Before each landing:

```powershell
npm test
npm run check
npm run build
$env:CORE_ENGINE = "rapier-coordinate"
node scripts/fingerprint.mjs --compare <runtime-lock.json>
git diff --numstat
git diff --ignore-cr-at-eol --numstat
```

Restore the task's engine environment variable after the comparison. Take lock records from
fixed `git archive` snapshots as the cleanup prescribes; do not measure a moving working tree.
For new cases, retain a new baseline after their intended addition and continue comparing
every old case. Re-run dropped test counts on a quiet machine. Stage and commit only this
chunk's files, without pushing or taking another ongoing change into the commit.

Completion requires the usable unarmed fighter gates, deterministic state/fork checks and
visible built-browser verification. A collider demo alone is not completion. If a gate fails,
continue the controller/contact work with the failure retained; do not promote assistance,
raise anatomical strength, change a scoring rule or silently reduce the required task.
