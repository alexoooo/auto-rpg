# Embodied combat -- overview

**Status:** active. Sessions [01](embodied-01-world-module-split.md),
[02](embodied-02-phase-schedule-and-seams.md), [03](embodied-03-embodied-model-scaffold.md)
[04](embodied-04-terrain-and-elevation.md),
[05](embodied-05-torso-relative-command.md),
[06](embodied-06-stance.md) and [08](embodied-08-command-composition.md) are
complete; [07](embodied-07-elbow-and-forearm.md) has landed its arm-length
constraint, its derived elbow and its commanded swing plane, and owes the forearm
collider. The two refactor
sessions moved no pin, so the gate on the mechanics sessions is discharged, and the
third model is in the tree with no behaviour of its own.

The target is the *Die by the Sword* control model, simplified only where the
simplification does not cost depth, delivered inside the AI-focused auto-battle
package this repository already is: a body whose joints constrain what it can do,
legs and torso under automatic control, arms driven relative to the torso with the
elbow derived rather than commanded, momentum that must be spent to be reversed, and
terrain elevation from which walls and obstacles fall out instead of being a separate
tile kind.

## Why this is a third combat model and not a v3 repository

`CombatModel::Legacy` and `CombatModel::Articulated` already coexist in one `World`
with separate phase schedules, separate state columns, and separate hash-domain
blocks. That is a worked example of replacing the entire body model without
discarding the one before it, and it is the whole argument for evolving:

- the expensive part is already built and already three-dimensional. The swept
  segment/segment contact solver, the impulse and energy law, regional anatomy with
  severance, and the fixed-point determinism apparatus survive every item on this
  list untouched. `ArticulatedPose::body` is a `Vec3` today and the pose row already
  publishes body XYZ; the z is pinned to the floor by convention, not by the solver;
- the command boundary is already the one this needs. Policies submit typed commands,
  both arms are already independent, and replays already record submitted commands
  rather than policy behaviour;
- **the third variant is what keeps the golden registry still.** Every mechanics
  session below lands inside `Embodied`, whose fixtures are new, so the pins that
  guard `Legacy` and `Articulated` cannot move by construction. That property is the
  reason to pay for a variant instead of editing the articulated actuator in place.

What does *not* survive contact with this list is the shape of one file. That is what
sessions 01 and 02 were for, and no implementation session may begin before both are
green. Both are.

## Refactoring is the schedule, not a preamble

Sessions 03 through 09 each add a joint, a column, or a phase to code that was, until
sessions 01 and 02 ran, reached through a single `crates/sim/src/world.rs`. Measured
on 2026-08-17 that file was **20,470 lines, of which 12,541 were `#[cfg(test)]`
modules** -- so roughly 7.9k lines of production `World` and twelve and a half
thousand lines of tests for it, in one file, with the tests for the actuator sitting
several thousand lines away from the actuator. It is now a `world/` module tree whose
largest member is `contact_phase.rs` at 5.9k lines, most of that its own tests.

**The obvious second and third targets turned out not to be targets, and measuring
first is the reason this plan has two refactor sessions instead of four.**
`combat/contact.rs` reads as 9,045 lines and is 2,659 lines of production code;
`combat/resolution.rs` reads as 5,623 and is 1,982. Both are ordinary. Only
`world.rs` is genuinely oversized, and splitting the other two would have been a week
of hash risk spent on files that were never the problem.

The two sessions are therefore narrow and both are provable rather than argued:

| session | subject | proof that nothing changed |
|---|---|---|
| [01](embodied-01-world-module-split.md) | `world.rs` becomes a `world/` module tree -- **done, nothing moved** | every pin in the golden registry, byte for byte, plus the `#[cfg(test)]` phase trace and an unchanged test count of 1156 |
| [02](embodied-02-phase-schedule-and-seams.md) | the phase schedule becomes data; limb geometry gets one owner -- **done, nothing moved** | the same, plus a trace read off the table rather than written beside the call |

Session 01 costs nothing in visibility churn, and the reason is a Rust rule worth
stating up front because it decides the whole shape of the split: **a private field is
visible to the defining module and all of its descendants.** Moving `impl World`
blocks into `world/movement.rs`, `world/contact_phase.rs` and siblings, with
`struct World` staying in `world/mod.rs`, keeps every one of the ~90 private columns
private and reachable. No field becomes `pub(crate)`, so no new access is granted to
the rest of the crate and the diff is a move.

## Session order

| session | result | depends on |
|---|---|---|
| [01](embodied-01-world-module-split.md) | **done.** `world.rs` split by phase; tests travelled with their code | none |
| [02](embodied-02-phase-schedule-and-seams.md) | **done.** declarative phase schedule, limb-geometry seam, model-extension seam | 01 |
| [03](embodied-03-embodied-model-scaffold.md) | **done.** `CombatModel::Embodied`, `EmbodiedCommandV1`, own hash domain, no new behaviour | 02 |
| [04](embodied-04-terrain-and-elevation.md) | **done.** sculpted terrain column, body z as a terrain sample, walls from slope | 03 |
| [05](embodied-05-torso-relative-command.md) | **done.** arm bearing and movement become torso-relative | 03 |
| [06](embodied-06-stance.md) | **done.** pelvis height, hip yaw distinct from torso yaw, twist budget that forces a step, `EMBODIED_STANCE_V1` published | 04 and 05 |
| [07](embodied-07-elbow-and-forearm.md) | **done.** arm-length constraint, derived elbow, commanded swing plane, forearm as a swept collider; `ARTICULATED_STREAM_DIGEST` moved once, by layout | 06 |
| [08](embodied-08-command-composition.md) | **done.** one hand human, the other hand AI, merged before submission | 05 |
| [09](embodied-09-observation-and-policy.md) | embodied observation block, scripted policy, learning boundary | 07 and 08 |
| [10](embodied-10-retire-the-older-models.md) | `Legacy` and `Articulated` deleted; `Embodied` is the only model | 09 |

Sessions 04 and 05 are independent of each other. Everything from 06 onward is
serial, because stance changes where a shoulder is and the elbow hangs off the
shoulder.

**Session 10 exists because the owner decided on 2026-08-17 that both older models
go**, and the ordering is the whole of the decision. Deleting them today would take
the only policies that can drive a fight and the only fixtures that measure one, at
the exact moment sessions 07 and 09 need something to check themselves against --
there is no `embodied_script.rs` yet, and Embodied has no corpus. After 09 there is
one, and the deletion becomes a subtraction rather than a leap.

## Constants introduced

Named here so a later session cannot quietly invent a second spelling. Every value is
a placeholder until the session that owns it produces a sweep; the rule that a
constant carries its provenance applies to all of them.

```text
MAX_EMBODIED_ENTITIES          64      matching MAX_ARTICULATED_ENTITIES
EMBODIED_COMMAND_LAYOUT_VERSION 2      1 was the fifty-three shared bytes
ELBOW_PLANE_MAX_SPEED_RAW              equal to ARM_BEARING_MAX_SPEED_RAW
BODY_VOLUME_COUNT              7       swept volumes over five anatomy regions
TERRAIN_HEIGHT_RAW_UNIT                one raw 16.16 world unit per height step
TERRAIN_STEP_UP_RAW                    the rise a walking body may enter
TERRAIN_MAX_SLOPE_RAW                  rise per unit run above which a tile is wall
PELVIS_HEIGHT_RAW                      standing pelvis z, fraction of standing height
STANCE_TWIST_LIMIT_RAW                 hip-to-torso yaw budget before a step is forced
STANCE_STEP_COST_TURNS_RAW             yaw the hips recover per forced step
ELBOW_MIN_INCLUDED_ANGLE_RAW           the joint's own stop
UPPER_ARM_FRACTION_RAW                 share of arm_length above the elbow
```

## Hash expectations

State these before editing, per the repository rule that a moved hash is normally a
bug. The [golden registry](../reference/hashes.md#golden-registry) is the authority
for what each pin is.

**Sessions 01 and 02 move nothing.** Not one pin, not one digest, not the phase
trace. A move is a failed refactor and is reverted rather than re-recorded; that is
the entire acceptance criterion for both.

**Sessions 03 through 08 move nothing either, and this is a design property rather
than a hope.** The argument this plan gave was wrong and session 03 corrected it in
place: `Scenario::fingerprint` **does** write the combat model, as a `u16` identity
word. It reaches the same conclusion by a better route -- every shipped fixture
keeps the word it already wrote, and a third variant adds a third value that only an
`Embodied` scenario can produce. Every embodied mechanic is reachable only from a
new `Embodied` scenario. `EmbodiedCommandV1` is a *separate* payload from the
articulated one specifically so that widening it in sessions 06 and 07 cannot reach
`ARTICULATED_COMMAND_HASH`, `EXACT_TRAJECTORY_STATE_DIGEST` or
`LIFTED_COULOMB_SOLVER_DIGEST` -- all three of which read
`ARTICULATED_PAYLOAD_BYTES` and have moved together twice before for exactly that
reason.

Two exceptions, both predicted here and budgeted to their session:

- **Session 04 moves nothing only if terrain is opt-in at the digest.** `Dungeon`
  gains a height column and a `sculpted: bool` beside the existing `carved: bool`,
  and `Dungeon::from_tiles` folds heights into its digest only when the column is
  non-flat. Every shipped scenario is flat, so `ROOM_HASH`, `BATTLE_HASH`,
  `SWAP_HASH`, `BOW_HASH`, `LAB_HASH` and `GOLDEN_STATE_HASH` are unreachable. If any
  of them moves, the short-circuit is wrong and the session stops. This mirrors what
  `carved` already does and is the reason terrain is cheap enough to land early.
- **Session 06 moves `ARTICULATED_STREAM_DIGEST` by extension, and only by
  extension.** Stance is published as a fifth append-only section rather than as new
  pose words, so `POSE_STRIDE`, `POSE_LAYOUT_VERSION` and `FRAME_LAYOUT_VERSION` all
  stay where they are and the pose-and-event-and-region prefix of all twenty ticks
  stays byte-identical. The articulated fixture has no embodied body, so its new tail
  is a zero length and a zero drop count -- present, and therefore a grammar change.
  This is the same shape of move v2-ui-06 made when the region section landed.
- **Session 07's forearm moves the same pin again, and by *layout* rather than by
  extension.** This paragraph said nothing about session 07 while the elbow was
  expected to be derived geometry only; a forearm the solver sweeps is a published
  volume, so `REGIONS_PER_BODY` goes 5 to 7, `MAX_REGIONS` 320 to 448 and the region
  section of every tick is rewritten in place with everything after it shifting.
  `REGION_LAYOUT_VERSION` goes 1 to 2 and is what says which kind of move it is. The
  claim that has to be earned is that the *fight* did not change, and it is earned by
  recomputing the digest with the region section suppressed and matching the value
  the same suppression gives on the commit before -- the same technique session 06
  used, pointed at a different section. Nothing else moves: `AnatomyRegion::COUNT`
  stays 5, so the pose block, the anatomy hash row and the observation are untouched.

**Session 09 owns the only feature-layout move.** Embodied columns append after the
articulated block, so the `legacy feature prefix` pin over indices `0..450` must not
move and is the guard that says so. `FEATURE_LAYOUT_VERSION` goes 12 to 13.
`LEARNED_INFERENCE_DIGEST` moves only if `LEARN_V2_FEATURE_COUNT` widens; the session
may keep the trained network on the existing slice and defer that, and if it does not
defer it, the move is owned rather than a portability failure and owes a re-score
against **88.922** on `learn-probe evaluate`'s 400 held-out seeds.

## Backwards compatibility is not a constraint here

**Stated by the owner on 2026-08-17: backwards compatibility is fine where it is free,
and is not to be paid for in development time at this stage of development.** Nothing
in this tree has a consumer outside it -- no saved replay, no serialized world, no
client built from a different commit -- so an append-only rule whose only beneficiary
is a reader that does not exist is a rule costing this plan sessions.

For the remainder of these sessions, then:

- **Widen a payload in place rather than appending to it.** `EMBODIED_PAYLOAD_BYTES`
  went 53 to 57 for [session 07](embodied-07-elbow-and-forearm.md)'s swing plane as a
  straight edit of the embodied layout, not a reserved-tail exercise. It also found
  the limit of what a forked width buys on its own: the replay codec read *both*
  schemas at `ARTICULATED_PAYLOAD_BYTES`, so widening one of them desynchronised the
  stream until that reader was taught to take its width from the declared schema.
- **Bump a layout version rather than designing around one.** The versions exist to be
  bumped, and every mirror of every one of them ships from this commit.
- **Renumber, reorder, and delete.** A discriminant, a column order, or a
  compatibility fallback kept only for an older shape of itself can go.

### The test is cost, and for one artefact the answer flips

The waiver is about development time, so the question at each seam is what honouring
compatibility costs against what breaking it costs -- not which of the two is more
principled. The trained checkpoint is the one place in this tree where breaking it is
the expensive side: it is frozen against the feature layout, so renumbering a column
it reads costs a retrain and a re-score against **88.922**.
[Session 09](embodied-09-observation-and-policy.md) therefore still appends its block
after the articulated one, and still keeps the `legacy feature prefix` pin as the
guard that says it did. That is the waiver being applied, not an exception to it.

### Three things look like compatibility and are not

**The golden registry is a determinism surface.** Its pins do not exist so that old
data still loads; they exist to catch a behaviour change nobody intended -- a
truncation reordered, a phase moved, an iteration that stopped being stable. The
repository rule survives the waiver whole: state which pins you expect to move, and
treat an unpredicted move as a bug until the exact byte path proves otherwise. All the
waiver changes is what happens once that argument is made and holds -- the move is
re-recorded rather than designed around. Session 06's `ARTICULATED_STREAM_DIGEST` is
the worked example: predicted here, argued from the digest grammar, measured against a
recomputation with the new section suppressed, then recorded. Session 07's forearm is
the second, and it is the harder case -- a section rewritten in place rather than
appended, so the suppression had to be measured on the *previous commit* in a
throwaway worktree before the number could be defended.

**The frame ABI's six-file handshake is a within-build agreement.** Writer and readers
are all built from this commit, so the rule keeps them agreeing with *each other*
rather than with last month. Bumping the version is cheap and is the intended escape
hatch; a reordering that leaves one of the six mirrors behind is still the bug that
repaints the game while producing valid numbers.

**A replay that no longer decodes is fine; one that decodes to something else is
not.** Old recordings are disposable. What is not disposable is the property that a
recording round-trips to the scenario it was taken from, and [session
03](embodied-03-embodied-model-scaffold.md) found exactly that break -- a second copy
of the combat-model match inside the replay codec, answering `2` for an embodied
fight. No waiver makes that acceptable, because it was never a compatibility bug.

## What is deliberately not in this plan

- **Knees.** With legs automatic and no jump or crouch, the depth of legs in the
  source material is stance and footwork, not knee angle. Session 06 models pelvis
  height, hip yaw and a twist budget; a knee is a renderer concern and stays one.
- **Jump, crouch and ballistic z.** Their absence is what makes elevation cheap:
  body z is a function of position rather than an integrated degree of freedom, so
  the momentum solver never learns about the third axis. Adding either later is a new
  plan, not a footnote in this one.
- **A commanded elbow.** The elbow is derived from hand and shoulder in session 07.
  Making it an independent input doubles the command surface for very little depth;
  what is worth choosing is the swing plane, and that is the field session 07 added.
- **Splitting arms into upper and fore in the anatomy.** That would double the armor
  table and move `BodyPart::COUNT` and `ANATOMY_HASH_ROW_BYTES`. Session 07 keeps
  five regions and makes the arm *volume* a two-segment polyline, which the region
  tuple in [anatomy assignment](../reference/anatomy-health.md#region-volumes-and-assignment)
  already tolerates.
- **Retiring `Articulated`.** This was an open question until 2026-08-17 and is now
  [session 10](embodied-10-retire-the-older-models.md): both older models go, and only
  the ordering was ever in doubt. Until then `Articulated` is the control, the way the
  Canvas game stayed the control for the GPU client.

## Verification

Every session runs the repository checklist in `AGENTS.md`. Beyond it:

```powershell
cargo test
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
node tools/check_docs.js
node tools/check_deps.js
```

Sessions 01 and 02 additionally run `cargo run --release -p lab -- verify --seeds 200`
and `cargo run --release -p lab -- duel --seeds 400`, and require both to answer what
they answered before the split -- the duel win rates being the second, independent
regression surface for changes claimed to be behaviour-neutral.
