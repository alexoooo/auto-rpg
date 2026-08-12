# Smart AI 20 -- Cartesian contact-response authority

**Status:** checkpoint B closes `revise`; test-only. The retained sword can meet
restitution and dissipate energy through an exact Cartesian trial, but its nonzero
time of impact proves the existing `ArmState` cannot preserve both endpoint displacement
and post-impact velocity. No production change is authorized.

Sessions 18 and 19 closed two escape routes. The retained sword is at LOW/full-reach
joint boundaries, and a 7,560-run ordinary-command sweep found no robust mirrored
interior fixture. This session therefore makes the proposed authority explicit rather
than asking an inexact inverse map to pretend that every impulse is a scalar arm pose.

## Existing redundant state

[`ArmState`](../../crates/sim/src/combat/actuator.rs#L37) stores two different views:

- `bearing`, `height`, `reach` and their rates are the command controller;
- `previous_hand`, `hand`, and `linear_velocity` are already hashed collision state.

The actuator currently makes the second view a derivation of the first in
[`integrate_arm_with_rates`](../../crates/sim/src/combat/actuator.rs#L188). Contact
then reverses that arrow during trial and commit: [`ContactProjector::project`](../../crates/sim/src/world.rs#L543)
calls the inexact inverse map, and [`commit_arm`](../../crates/sim/src/world.rs#L4895)
writes its answer back into both views. That bidirectional ownership is the defect.

The smallest candidate seam is:

1. scalar pose remains command/control state and is never reconstructed by contact;
2. Cartesian `previous_hand`, `hand`, and `linear_velocity` are collision authority;
3. a contact trial applies checked impulses directly to body and held Cartesian rows;
4. commit takes `hand` from the collider endpoint after the driver advances the
   post-impact velocity through the remaining fraction, keeps `previous_hand =
   entry.hand`, and writes their exact difference as the whole-tick `linear_velocity`;
5. the scalar pose requested by the actuator remains unchanged for that collision tick.

This is not permission to leave the two views divergent forever.

## Checkpoint A -- exact trial

Test-only [`cartesian_contact_trial`](../../crates/sim/src/world.rs#L9052) contains no
`inverse_hand` and no world write. It preserves the current planar-body constraint,
applies the body's solved translation to every held row, and applies each held row's
own impulse directly to its Cartesian velocity.

Two load-bearing tests pin the first facts:

- [`cartesian_contact_trial_is_an_exact_alpha_zero_identity`](../../crates/sim/src/world.rs#L9262)
  preserves every generalized row and closure energy `381` at zero impulse;
- [`cartesian_contact_trial_reaches_the_retained_sword_restitution_without_inverse_hand`](../../crates/sim/src/world.rs#L9237)
  finds `(impulse,q,energy,evaluations)=(65560,0,105,35)`, hence exact flesh
  restitution and dissipation `276` from the retained `381`.

This proves only an unclamped normal Cartesian response. It does not yet run a direct
Cartesian positional envelope, share allocation, cut/thrust/pressure, anatomy
mutation, commit, or the next tick. In particular, dissipation is not itself proof of
a reachable hand or a wound. Trial and final commit must eventually use the same
Cartesian clamp and reconstruct the selected generalized rows byte-for-byte.

The separate test-only channel calculation
`cartesian_retained_dissipation_reaches_the_existing_damage_channel_split` feeds the
`276` share through the existing sword/body split and pins `(cut,thrust,pressure) =
(132,0,144)`. It proves the cut channel is no longer starved; it does not bypass the
owed real-solver allocation and anatomy-threshold test.

## Checkpoint B -- deterministic reconciliation

Do not snap the hand to the scalar forward pose on the next tick. That is an unrecorded
teleport: preserving `previous_hand` makes it a large swept velocity, while replacing
`previous_hand` hides the displacement from collision and energy alike.

Two designs were compared. An explicit recoil bit/velocity is easy to name, but adds
hashed state and introduces a spring-like acceleration whose energy and fatigue law do
not exist today. The smaller design uses the residual already present in hashed state:
`R = hand - F(q,yaw)`. It does not decay or masquerade as velocity. On the next tick,
integrate scalar control normally, then transport the authoritative hand exactly:

```text
H_next_requested = H_entry + F(q_next, yaw_next) - F(q_entry, yaw_entry)
linear_velocity  = H_next - H_entry
```

`TickEntry` already retains the old arm scalars, hand, and yaw needed by this formula.
Thus scalar acceleration supplies only its existing forward-map displacement; contact's
Cartesian residual persists until another contact or an envelope clamp changes it.
There is no snap, inverse reconstruction, residual motor, new state field, or new
fatigue source. Store hands in the existing world-axis body-relative convention; body
translation remains outside the arm row, and yaw enters once through the forward delta.
Apply one direct Cartesian envelope to both trial and final state: height in the
anatomy's interval and checked planar shoulder distance in
`[arm_length * ARM_MIN_REACH, arm_length]`. The clamp must be an
identity for an interior hand and must reject, not choose an inverse orientation, at an
ambiguous, unrepresentable fixed-point, or overflowing boundary.

The resulting Cartesian displacement is the only `linear_velocity` published to
contact. Existing scalar acceleration continues to own fatigue; the residual adds no
motion on its own and therefore no work. No reset, snap, or zeroing may bypass the
sweep or widened kinetic numerator. A two-handed grip mirrors the authoritative
Cartesian row once, after the right-hand update.

Required tests:

```rust
#[test] fn cartesian_contact_commit_preserves_the_solved_hand_and_velocity() {}
#[test] fn cartesian_reconciliation_has_no_hidden_position_jump() {}
#[test] fn cartesian_envelope_is_identity_interior_and_shared_by_trial_and_commit() {}
#[test] fn cartesian_reconciliation_transports_a_yaw_delta_without_rotating_recoil_twice() {}
#[test] fn a_stationary_cartesian_residual_adds_no_velocity_or_fatigue() {}
#[test] fn cartesian_reconciliation_mirrors_without_a_handed_rounding_choice() {}
#[test] fn replay_reproduces_cartesian_reconciliation_across_the_next_tick() {}
```

Each must be mutation-tested by restoring the current inverse commit, snapping the
next hand, clearing `previous_hand`, applying yaw twice, or choosing a lexicographic
mirror.

Checkpoint-B tests prove the isolated prerequisites: the clamp is identity on an
interior non-unit arm, projects axis-aligned physical radii exactly, is idempotent,
and returns named `AmbiguousDirection`, `UnrepresentableBoundary`, or `Overflow`
instead of introducing a handed component nudge; transport preserves a stationary
residual and a yaw change applies the forward delta exactly once.

They also expose why this no-new-state lifecycle cannot be the authority. The retained
fact's time of impact is raw `55,704`, leaving `9,832 / 65,536` of the tick after
contact. A collider endpoint advances by

```text
d = toi * v_pre + (ONE - toi) * v_post
```

while the selected generalized trial row is `v_post`. Existing
`ArmState.linear_velocity` means the whole-tick endpoint displacement `d`. Copying
`v_post` into it teleports away the pre-contact part; keeping `d` discards post-impact
momentum on the next tick. A position residual cannot reconstruct the missing velocity.
The retained sword row pins pre velocity `(332,6338,0)`, post velocity
`(93,1757,0)`, and whole-tick displacement `(295,5650,0)`: these are observably
different fixed-point words, not a semantic distinction with identical storage.
Therefore selected trial rows cannot be byte-equal to committed rows under the current
state shape, and checkpoint B deliberately does not add a fake commit hook.

A successor must add separately hashed post-contact Cartesian velocity (and an explicit
mode/lifetime) or redefine the published/hashed `linear_velocity` semantics. This
closed session adds no field and changes no default lifecycle. The successor is a
larger authority and ABI decision with its own pin budget. Until it exists, the real
solver cannot honestly feed its allocation into `after_group`; the `(132,0,144)` test
remains arithmetic evidence rather than an anatomy result. Mirror, shield-cache, wall,
next-tick, replay, and actual anatomy gates remain owed rather than relaxed.

## Checkpoint C -- mechanics gate

Run the retained right-sword/body fact through the real solver and anatomy path. Pin
exactly one fact and no competitor, `abs(q-target)<=1`, widened numerator after no
greater than before, positive dissipation, and a nonzero cut or thrust channel that
crosses its anatomy threshold. The current retained row may fail the last condition;
if so, record `revise` and obtain a deliberately stronger fixture without selecting on
damage output. Add an actual mirrored fixture, a next-tick no-repeat/no-teleport check,
walls, severance, two-handed ownership, friction, simultaneous shared target, and
allocation-free warm projection before authority.

## Determinism and pin budget

All checkpoint-A code is under `#[cfg(test)]`; **no hash may move**. Before any
production edit, record the baseline. A successful authority change is expected to
move `CONTACT_BEHAVIOR_DIGEST` and may move `ARTICULATED_STREAM_DIGEST` because values,
not layouts, change. `LAB_HASH`, `ROOM_HASH`, every legacy browser golden,
`GOLDEN_STATE_HASH`, ABI layout versions, replay schemas, and learned inference digest
must remain fixed. Any additional move closes `revise`; do not re-record it by analogy.
No new field is proposed, but existing hashed hand words change meaning after contact;
native/wasm equality and replay must pass before either expected digest is re-recorded.

Commands:

```powershell
cargo test -p sim cartesian_ -- --nocapture
cargo test -p sim generalized_joint -- --nocapture
cargo test -p sim
cargo test -p sim --test determinism
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
node tools/check_docs.js
git diff --check
```
