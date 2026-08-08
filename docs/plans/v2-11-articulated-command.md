# v2-11 — freeze the articulated submitted-command seam

**Goal:** define the one value crossing articulated policy, world, replay, wasm, and
worker boundaries, including independent body yaw and fail-closed validation.

**Depends on:** `v2-10`. It does not depend on the visual/worker track.

**Golden expectation:** every legacy hash remains byte-identical. No articulated
golden is pinned yet.

## Rust contract

Leave `Command` and `Policy` unchanged. At `crates/sim/src/command.rs` add:

```rust
pub const SUBMITTED_COMMAND_LAYOUT_VERSION: u16 = 1;
pub struct CombatHeight(Fx); // bounded [0, 1], LOW/MID/HIGH are constants
pub enum LimbSlot { LeftArm, RightArm }
pub struct ArmTarget {
    pub bearing: Angle, pub height: CombatHeight,
    pub reach: Fx, pub effort: Fx,
}
pub enum GripRequest { Keep, Release, EquipSlot(u8) }
pub enum SubmittedCommand { Legacy(Command), Articulated(ArticulatedCommandV1) }
pub struct ArticulatedCommandV1 {
    pub move_dir: Vec2,
    pub body_yaw: Angle,
    pub intent: Intent,
    pub arms: [ArmTarget; 2],
    pub grips: [GripRequest; 2],
}
pub enum CommandReject { WrongModel, StaleEntity, InvalidGrip, MissingEquipment,
                         OutOfRange, UnknownLayout }
```

Record in `docs/reference/commands.md` that legacy `Policy` remains unchanged and a
separate subject-scoped `ArticulatedPolicy` will emit `ArticulatedCommandV1`. The
trait lands with its complete observation in `v2-16`; no temporary partial
observation type is introduced here. Direct scripts, human input, replay, and wasm
already wrap articulated values as `SubmittedCommand`. `World::submit` continues to
accept only legacy `Command`; `World::submit_articulated` validates and returns
`Result<(), CommandReject>`.

Invalid submitted variants never partially apply. The safe articulated fallback is
zero translation, current body yaw, `Intent::Hold`, tucked zero-effort arm targets,
and unchanged grips. Replays record rejection only as diagnostic metadata; the
accepted final fallback command is the authoritative record.

## Turning contract

Add target yaw without yet integrating pose. The future actuator uses shortest-turn
distance, clockwise for an exact half-turn, saturated angular acceleration and speed,
and no float conversion. Translation and angular effort are independent in the first
slice. Stagger, leg impairment, and grip loss have explicit neutral factors reserved
in the command reference; `v2-13`/`v2-15` fill them before use. Legacy commands retain
the current movement-derived facing behavior and cannot turn in place.

## Replay, hash, and client layout

Extend `REPLAY_CODEC_VERSION = 1` through its reserved articulated record tag and
fixed little-endian V1 field order; do not bump the envelope for a previously
reserved variant. Articulated commands enter only ArticulatedV1 hashing. Publish the
exact wasm action-buffer layout and discriminants from `crates/web/src/lib.rs` in
`docs/reference/submitted-command.md`; unknown layouts and incompatible
`CombatModel` values are rejected before mutation. `v2-17`, where the tracks first
join, generates the identical TypeScript worker message from these Rust constants.

## Tests and verification

```text
legacy_policy_and_command_public_shapes_remain_unchanged
articulated_commands_round_trip_in_documented_field_order
wrong_model_grip_equipment_and_layout_fail_closed
rejected_commands_record_only_the_final_safe_command
a_stationary_articulated_body_can_request_a_turn
the_exact_half_turn_uses_the_clockwise_tie
legacy_commands_still_cannot_turn_in_place
every_articulated_command_field_changes_its_domain_hash
replay_wasm_and_rust_command_layouts_are_equal
```

```powershell
cargo test
cargo run --release -p lab -- verify --seeds 200
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
git diff --check
```
