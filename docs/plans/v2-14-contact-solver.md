# v2-14 — resolve continuous contact in deterministic time groups

**Goal:** add a bounded conservative-advancement solver for weapon, shield, and
temporary body contacts, including sequential re-sweeps and an energy ledger.

**Depends on:** `v2-13`.

**Golden expectation:** legacy hashes remain byte-identical; no articulated pin yet.

## Solver contract

Implement `crates/sim/src/combat/contact.rs` and `resolution.rs` behind the
articulated branch. Start with brute-force pairs in ascending full entity identity and
limb order; no spatial index is authorized yet.

```rust
pub const MAX_CONTACT_GROUPS_PER_TICK: u8 = 8;
pub struct ContactKey { /* two full identities, limb slots, kind */ }
pub struct ContactFact { pub toi: TimeOfImpact, /* point, normal, velocities */ }
pub struct EnergyLedger { pub before: Fx, pub after: Fx, pub dissipated: Fx }
pub struct ContactSolverState { pub cap_hits: u32 }
```

For each tick:

1. find the minimum exact fixed-point time of impact over remaining sweeps;
2. collect every fact with that exact `TimeOfImpact` into one simultaneous group;
3. resolve the group from one immutable pre-group state in full identity, limb-slot,
   then contact-kind order, accumulating impulses before applying them;
4. advance to the group time, apply impulses symmetrically, and recompute all
   remaining sweeps from the new state;
5. suppress a persistent zero-time pair only while separation speed is non-negative;
6. repeat up to eight groups.

On cap exhaustion, involved shapes remain at the last safe pose, their unconsumed
actuator displacement is discarded for that tick, and hashed `contact_cap_hits`
increments. No unchecked tail sweep passes through a surface.

Relative velocity decomposes into axial thrust, transverse cut, and sub-threshold
pressure. Restitution/friction/material coefficients are fixed-point `[0,1]` values
from immutable specs. Every clamp records removed energy; `after <= before` exactly.
A stationary edge does not cut, an opponent may run onto a braced point, and no
`Swing::Strike` or privileged hit window enters this path.

## Tests and verification

```text
one_sweep_recomputes_after_two_sequential_contacts
a_true_simultaneous_group_uses_one_pre_group_state
contact_results_survive_entity_and_limb_index_permutations
persistent_zero_time_contacts_do_not_livelock
cap_exhaustion_stops_at_the_last_safe_pose
armorless_contact_never_creates_energy
a_stationary_edge_does_not_cut
running_onto_a_braced_point_can_injure
transverse_motion_cuts_and_axial_motion_thrusts
a_body_facing_shield_blocks_only_its_surface
a_low_shield_does_not_cover_a_high_contact
```

Add a native/wasm corpus digest covering facts, groups, impulses, ledger, empty ticks,
and cap exhaustion. Use the same input corpus on eight native threads.

```powershell
cargo test
cargo run --release -p lab -- verify --seeds 200
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
git diff --check
```
