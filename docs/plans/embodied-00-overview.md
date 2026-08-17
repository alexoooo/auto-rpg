# Embodied combat -- overview

**Status:** proposed. No session has started.

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
sessions 01 and 02 are for, and no implementation session may begin before both are
green.

## Refactoring is the schedule, not a preamble

Sessions 03 through 09 each add a joint, a column, or a phase to code that is
currently reached through `crates/sim/src/world.rs`. Measured on 2026-08-17 that file
is **20,470 lines, of which 12,541 are `#[cfg(test)]` modules** -- so roughly 7.9k
lines of production `World` and twelve and a half thousand lines of tests for it,
in one file, with the tests for the actuator sitting several thousand lines away from
the actuator.

**The obvious second and third targets turned out not to be targets, and measuring
first is the reason this plan has two refactor sessions instead of four.**
`combat/contact.rs` reads as 9,045 lines and is 2,659 lines of production code;
`combat/resolution.rs` reads as 5,623 and is 1,982. Both are ordinary. Only
`world.rs` is genuinely oversized, and splitting the other two would have been a week
of hash risk spent on files that were never the problem.

The two sessions are therefore narrow and both are provable rather than argued:

| session | subject | proof that nothing changed |
|---|---|---|
| [01](embodied-01-world-module-split.md) | `world.rs` becomes a `world/` module tree | every pin in the golden registry, byte for byte, plus the `#[cfg(test)]` phase trace |
| [02](embodied-02-phase-schedule-and-seams.md) | the phase schedule becomes data; limb geometry gets one owner | the same, plus a phase-trace equality test per model |

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
| [01](embodied-01-world-module-split.md) | `world.rs` split by phase; tests travel with their code | none |
| [02](embodied-02-phase-schedule-and-seams.md) | declarative phase schedule, limb-geometry seam, model-extension seam | 01 |
| [03](embodied-03-embodied-model-scaffold.md) | `CombatModel::Embodied`, `EmbodiedCommandV1`, own hash block, no new behaviour | 02 |
| [04](embodied-04-terrain-and-elevation.md) | sculpted terrain column, body z as a terrain sample, walls from slope | 03 |
| [05](embodied-05-torso-relative-command.md) | arm bearing and movement become torso-relative | 03 |
| [06](embodied-06-stance.md) | pelvis height, hip yaw distinct from torso yaw, twist budget that forces a step | 04 and 05 |
| [07](embodied-07-elbow-and-forearm.md) | two-link arm, derived elbow, forearm collider, a real arm-length constraint | 06 |
| [08](embodied-08-command-composition.md) | one hand human, the other hand AI, merged before submission | 05 |
| [09](embodied-09-observation-and-policy.md) | embodied observation block, scripted policy, learning boundary | 07 and 08 |

Sessions 04 and 05 are independent of each other. Everything from 06 onward is
serial, because stance changes where a shoulder is and the elbow hangs off the
shoulder.

## Constants introduced

Named here so a later session cannot quietly invent a second spelling. Every value is
a placeholder until the session that owns it produces a sweep; the rule that a
constant carries its provenance applies to all of them.

```text
MAX_EMBODIED_ENTITIES          64      matching MAX_ARTICULATED_ENTITIES
EMBODIED_COMMAND_LAYOUT_VERSION 1
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
than a hope.** `Scenario::fingerprint` does not write the combat model, so a new
enum variant is invisible to it. Every embodied mechanic is reachable only from a
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

**Session 09 owns the only feature-layout move.** Embodied columns append after the
articulated block, so the `legacy feature prefix` pin over indices `0..450` must not
move and is the guard that says so. `FEATURE_LAYOUT_VERSION` goes 12 to 13.
`LEARNED_INFERENCE_DIGEST` moves only if `LEARN_V2_FEATURE_COUNT` widens; the session
may keep the trained network on the existing slice and defer that, and if it does not
defer it, the move is owned rather than a portability failure and owes a re-score
against **88.922** on `learn-probe evaluate`'s 400 held-out seeds.

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
  what is worth choosing is the swing plane, and that is the field session 07 adds.
- **Splitting arms into upper and fore in the anatomy.** That would double the armor
  table and move `BodyPart::COUNT` and `ANATOMY_HASH_ROW_BYTES`. Session 07 keeps
  five regions and makes the arm *volume* a two-segment polyline, which the region
  tuple in [anatomy assignment](../reference/anatomy-health.md#region-volumes-and-assignment)
  already tolerates.
- **Retiring `Articulated`.** It stays as the control, the way the Canvas game stayed
  as the control for the GPU client. Deciding whether it ever goes is downstream of
  session 09 having something to compare.

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
