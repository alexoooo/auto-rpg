# Smart AI 21 -- explicit Cartesian post-contact velocity

**Status:** checkpoint B gated prototype closes `revise`; default authority unchanged. Session 20 proved that
the retained contact's post-impact velocity and whole-tick endpoint displacement are
different words. This session designs the missing state, but does not add it to
production until its energy, reset, and anatomy gates are complete.

## State and meaning

Append one mode and one vector to each authoritative arm:

```rust
pub struct ArmState {
    // existing fields remain in their existing order
    pub post_contact_com_velocity: Vec3,
    pub post_contact_active: bool,
}
```

`linear_velocity` keeps its published and hashed meaning: `hand - previous_hand`, the
whole-tick endpoint displacement. `post_contact_com_velocity` is the body-relative
equipment centre-of-mass velocity immediately after the last contact group;
it is meaningful only while `post_contact_active`. This separates the two quantities
the retained TOI makes impossible to store in one field.

Construction, slot reuse, severance, release, and any grip transaction that changes the
held equipment clear the mode and vector. A two-handed item is right-owned: contact
writes the right state, mirrors the Cartesian result once, and clears both states when
either arm releases or is severed. Hash the mode followed by the three vector words in
the existing per-arm block, including inactive zeroes; mutation tests must change the
hash for the mode and for every component.

## Commit and next tick

At nonzero TOI the contact driver already advances collider endpoints through the
remaining fraction. Commit therefore takes the authoritative hand from the final
mutated collider hilt/decoded shield centre, not from `entry.hand + v_post`:

```text
previous_hand = tick_entry.hand
hand = cartesian_hand_clamp(final_collider_hand)
linear_velocity = hand - previous_hand
post_contact_com_velocity = solved_equipment_COM_velocity
                          - solved_body_velocity
post_contact_active = true
```

Only a held row whose own accumulator/direct response changed activates or replaces
this state. A bystander row translated solely by its body delta does not acquire
recoil. Body-only later groups preserve an already-active arm; a later direct group
replaces it with that group's final body-relative equipment-COM velocity, in canonical
group order.

The retained control pins TOI `55704`, remaining `9832`, pre equipment-COM velocity
`(332,6338,0)`, post equipment-COM velocity `(93,1757,0)`, and whole-tick COM
displacement `(295,5650,0)`. The held segment's fixed `velocity_offset` is
`(197,3768,0)`: the stored relative COM velocity is therefore `(2,-1,0)`, while the
derived hand velocity is `stored_com_velocity - velocity_offset = (-195,-3769,0)`.
A shield's zero-offset row is the control. Subtracting the old offset before storage
would make the next scalar bearing change inject or remove COM momentum.

On the next actuator tick, scalar bearing/height/reach remains the motor target. When
the mode is active, chase the new forward hand target componentwise from the actual
Cartesian hand. First derive the inertial free hand velocity from the newly sampled
offset: `free_hand_velocity = post_contact_com_velocity - next_velocity_offset`.
Thus an offset change alone preserves the equipment COM velocity exactly. Motor
acceleration then changes the relative COM velocity, with speed and acceleration
bounded after effort, authority, fatigue, power, and agility scaling. An exact crossing
lands on the target with zero relative COM velocity and clears the mode. Otherwise the
new hand is passed through the same Cartesian envelope used by
trial/commit, `linear_velocity` records its displacement, and the resulting velocity
remains active. An envelope collision is dissipative: remove the rejected component,
never reflect it, and include the widened numerator loss in the contact/motor energy
diagnostic. Scalar motor acceleration retains its existing fatigue bill; the candidate
must define an explicit checked motor impulse/work from effort, authority, fatigue,
equipment inertia, and the velocity change, then prove Cartesian kinetic energy does
not rise above that supplied work. A component chase or arbitrary decay without that
ledger is not authority.

The energy comparison remains at the equipment centre of mass. It uses
`body + post_contact_com_velocity`; the changing offset is already cancelled by the
derived free-hand velocity and must not be added a second time. `mass*|hand|^2` is not
an admissible substitute. Two-handed equipment contributes only its right-owned row.

Clearing is never silent. Exact target equality with zero velocity is ordinary motor
completion. Severance, a contact cap, release/grip replacement, slot reuse, wall or
envelope rejection classifies the removed widened kinetic numerator as named external
dissipation in diagnostics before clearing the state; no branch may merely zero it.

The test-only `CartesianVelocityState`/`cartesian_motor_step` now stores relative COM
velocity, derives the free hand by subtracting the new offset, and pins exact widened
work, zero-acceleration conservation, axis-permutation equivariance, inactive canonical
form, checked overflow, and no inactive teleport. The `cartesian-recoil` feature appends
zero-initialized state fields and their
fixed hash words so initialization and per-word mutation can compile in production
shape without changing the default build. No contact, motor, clearing, or publication
path reads those gated fields yet.

Promotion must enable the same `sim/cartesian-recoil` feature through `policy`, `lab`,
and `web`, or remove the gate once authority is complete. Native/wasm equality is only
meaningful when both targets compile the same state grammar; a mixed-feature comparison
is a configuration error, not a pin to re-record.

Checkpoint B stops here. A componentwise chase is not an energy law. The motor must
first define its checked supplied work at equipment-COM velocity
`body + post_contact_com_velocity`, while proving that offset-to-hand conversion
preserves that velocity exactly. Until that law exists, wiring the field into World
would permit arbitrary decay or added energy. Consequently the retained actual solver,
`after_group` anatomy, replay, mirror, wall, clear, and Lab gates remain deliberately
unrun; this is `revise`, not a partial authority hidden behind a feature.

## Gates before production

Red-demonstrate and then pass all of:

```rust
#[test] fn retained_commit_keeps_endpoint_displacement_and_post_velocity_distinct() {}
#[test] fn post_velocity_survives_one_tick_and_clears_on_exact_motor_capture() {}
#[test] fn recoil_deceleration_never_adds_unpaid_widened_energy() {}
#[test] fn cartesian_envelope_is_shared_by_trial_commit_and_motor() {}
#[test] fn right_owned_two_hand_velocity_mirrors_once() {}
#[test] fn shield_cache_follows_the_cartesian_hand() {}
#[test] fn walls_remove_the_rejected_post_velocity_component() {}
#[test] fn grip_change_release_severance_and_slot_reuse_clear_post_velocity() {}
#[test] fn post_velocity_mode_and_each_component_are_hashed() {}
#[test] fn replay_reproduces_contact_endpoint_and_the_following_motor_tick() {}
```

Then drive `directional_captured_strike` through the actual solver and
`ContactProjector::after_group`, not a manual channel call. Require exactly one
right-sword/body fact, no competitor, `(energy before,after,dissipated)=(381,105,276)`,
`abs(q)<=1`, `(cut,thrust,pressure)=(132,0,144)`, internal unarmored integrity/wound
delta `12672`, and published integrity/wound fractions `65536 -> 59200` and
`0 -> 6336` on the named region. Zeroing allocation, `after_group`, or the reporter
must fail separate assertions.

Only then run the response-independent session-19 unmirrored diagnostic through Lab:
seed 0, Brute, offset raw `(-131072,0)`, chamber 8, strike 20, reach 32768. Strong,
held, strong must be deterministic; the strong row must pass meaningful-strike
validity and the held row remain inert. It cannot authorize the mirrored gate because
session 19 already proved its mirror and timing-minus control invalid.

## Pin budget

Test-only checkpoint A moves no pin. Before production, record baselines. Appending
hashed arm state is expected to move `ARTICULATED_COMMAND_HASH` even on its unstepped
fixture because the newly hashed inactive mode/zero vector are bytes. The authority
change must move `CONTACT_BEHAVIOR_DIGEST`; it is expected to move
`ARTICULATED_STREAM_DIGEST` if that twenty-tick script reaches contact or publishes a
changed hand/event value. `ARTICULATED_HASH` remains absent.

`LAB_HASH`, `GOLDEN_STATE_HASH`, `ROOM_HASH`, `BATTLE_HASH`, `SWAP_HASH`, `BOW_HASH`,
`COMBAT_GEOMETRY_HASH`, all ABI layout versions, submitted-command/replay schemas,
feature-prefix pins, and `LEARNED_INFERENCE_DIGEST` must remain fixed. `ArmState` is not
wire ABI and must not silently append a pose word; if post velocity is later published,
that is a separate append-only pose ABI session. Any unbudgeted move closes `revise`.
Do not re-record any expected pin until every lifecycle, actual-anatomy, replay,
native/wasm, and Lab gate above passes.

Commands:

```powershell
cargo test -p sim post_contact -- --nocapture
cargo test -p sim --features cartesian-recoil every_actuator_field_changes_only_the_articulated_hash_domain
cargo test -p sim cartesian_ -- --nocapture
cargo test -p sim
cargo test -p sim --test determinism
cargo test -p lab
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
node tools/check_docs.js
git diff --check
```
