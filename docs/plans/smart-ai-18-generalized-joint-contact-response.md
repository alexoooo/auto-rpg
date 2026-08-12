# Smart AI 18 -- generalized joint-coordinate contact response

**Status:** test-only checkpoint A closes `revise`. Sessions 11--17 established that black-box hand
velocity projection is nonlinear, and exact boundary/component enumeration still leaves
fixed-point restitution gaps. This successor models the coordinates World actually owns.

**Goal:** express one interior articulated contact in generalized coordinates: body
translation `(vx,vy)` and each contacted arm's bearing, height, and reach speeds. Freeze
a forward-only Jacobian from `hand_position`; trial response must never call
`inverse_hand`. Build generalized mass from body and every held equipment row, apply
contact impulse by `J^T`, and reconstruct point velocity by `J*qdot`.

## Checkpoint A -- retained joint measurement

In test-only `world.rs`, retain session 11's unique one-contact fixture and assert its
normal `(2256,65497,0)`, pre-response signed speed `q=-6346`, and energy 381. Identify
the source limb from the entry grip and test its authoritative limits. Active/min/max joint boundaries return named
`ActiveBoundary`; they are not silently linearized.

The frozen Jacobian has five columns. Body X/Y are exact unit columns. Bearing uses the
forward difference `hand_position(bearing+1)-hand_position(bearing)`; height uses
`CombatHeight(raw+1)`; reach uses `reach+Fx::from_raw(1)`. These are derivatives per
one raw coordinate word. The test pins only that the authoritative forward map
reconstructs the captured hand pose; it does not yet define or prove alpha-zero
identity for generalized speeds, collider rows, or committed world state. No inverse
mapping appears in the helper.

Measurement superseded the planned interior premise. An attribution audit found that
the first checkpoint-A test incorrectly searched for a grip whose equipment-table slot
equaled `ContactKey.a_slot`; the latter is the owning limb byte. The fact was always the
right-arm sword/body fact, but the test inspected the left shield arm. With the source
read correctly as `fact.key.a_slot`, the retained sword arm is at height raw 16,384 and
reach raw 65,536: LOW height is interior, while reach is exactly the full-reach
boundary. It therefore still returns the named `ActiveBoundary` rejection, for the
corrected reason. A synthetic point at MID height
and reach 32,768 reconstructs through the forward pose function, but its one-raw
height/reach differences quantize to zero. The earlier virtual-work, held-mass, and
local-nonlinearity tests were therefore removed rather than retained as misleading
green evidence. The local Jacobian remains an unproved approximation, not an exact
authoritative coordinate transform.

For a world impulse `P` on the held point, a future generalized impulse would be
`J^T P`. Checkpoint A does not yet prove its sign or scale. A reconstructed full
generalized mass `G`, its held-sword row (source equipment slot 0, limb slot 1, mass
raw 81,264), cross terms, segment-COM lever arms, and equality to authoritative
widened row energy all remain owed.

## Later checkpoints

Checkpoint B would solve `M*delta_q=J^T*P` with checked rational arithmetic, then use only
the forward Jacobian to evaluate normal response. Acceptance requires `q=-6346` to
reach flesh restitution within one raw unit and widened energy to fall from the exact
pre-response numerator. Checkpoint C adds two contacts, active-set joint bounds, and
friction only after the normal proof passes.

Checkpoint A therefore records **REVISE**. Checkpoint B is not authorized from it. A successor must first choose an
exact velocity-level kinematic authority or exact Cartesian contact coordinates and
define how those coordinates commit back to the hashed arm pose without `inverse_hand`.
Until then the retained boundary and nonlinearity make generalized scalar response a
diagnostic, not the solution.

All work remains under `#[cfg(test)]`. No authority, format, or pin moves. Commands:

```powershell
cargo test -p sim generalized_joint -- --nocapture
cargo test -p sim nonlinear_ -- --nocapture
node tools/check_docs.js
git diff --check
```
