# Articulated bow -- overview

**Status:** **step 1 of five landed 2026-08-16; steps 2-5 not started.** The largest of
the requested features, and the only one that is a **new subsystem** rather than an
extension. Sequenced after [combat arms](combat-arms-00-overview.md), which is complete.

[Step 1](articulated-bow-01-release-verb.md) put a per-arm `ReleaseRequest::{Keep,
Loose}` in `ArticulatedCommandV1`, took the payload 51 -> 53 bytes and the layout
version 1 -> 2, and moved **three registered digests across four recorded values**
(`ARTICULATED_COMMAND_HASH` carries a different one under each law) -- every one
predicted in writing before the gate, and none of them a legacy pin. **Nothing consumes
the verb yet**, which is the deliverable:
a layout change and a new mechanic in one commit would leave nobody able to tell which
moved a number.

A two-handed bow that shoots arrows which fly, and that hits a head differently from a
leg.

## What already exists, and why it cannot be reused

**The legacy bow is complete.** `ActionKind::Bow` drives `Role::Shoot`; the release is
detected on the exact `Windup -> Strike` edge in `crates/sim/src/world.rs` and spawns
into parallel projectile arrays; `resolve_shots` sweeps each arrow's segment against
hostile circles, resolves masonry first via `Dungeon::raycast`, applies
`rules::blow_damage`, respects `block_leak` exactly as a blade does, and reaps on hit,
range or wall. `an_arrow_cannot_tunnel_through_a_body` pins the sweep. Arrows already
cross the frame ABI as four floats per row and **are already rendered** on the legacy
Canvas page and on `#/game`.

**None of it works for the articulated model.** The store is `Vec2` -- there is no `z`
at all -- and it collides against a body *circle*. An articulated body is five swept
region capsules plus a shield plane; an arrow that cannot tell a head from a leg
defeats the entire point of the model. And `resolve_shots` is called **only** from the
Legacy arm of the step; the articulated arm never runs it.

**The articulated model has no ranged notion whatsoever.** `ArticulatedCommandV1` is
`{move_dir, body_yaw, intent, arms, grips}` with no release verb, and its 51-byte
payload is fully packed with non-canonical padding refused, so there is no spare bit.
**Step 1 has since answered this**: the payload is 53 bytes at layout version 2 and
carries a `ReleaseRequest` per arm, which nothing consumes yet.
`ContactKind` is exactly `{WeaponWeapon, WeaponShield, WeaponBody}`. `#/arena` renders
no projectiles at all, because it draws the articulated pose, region and event
publications rather than the frame.

## The hazard that shapes the whole design

`World::state_hash` writes the projectile block **unconditionally** -- the slot count
first, then every slot's liveness, position, velocity, range, mass, power, faction and
owner -- and the articulated `state_digest` embeds `legacy_core_hash()` wholesale.

**So touching the shot record layout moves `BOW_HASH`, `LAB_HASH`, `ROOM_HASH`,
`BATTLE_HASH`, `SWAP_HASH` and `GOLDEN_STATE_HASH` at once.** `LAB_HASH`'s registry
rule is *"Not re-pinnable. It names its scenario and policy; investigate a move."*

The safe shape is a **separate articulated projectile store, hashed only in the
articulated block** -- appended where `cap_hits` and the per-slot anatomy rows were
appended, which is invisible to `legacy_core_hash` by construction. Design to that from
the first commit; it is not something to retrofit.

Equally: add `Bow` to `shipped_row` in `crates/sim/src/combat/arena.rs` and **not** to
`CombatSpecTableV1::fixtures()`. `shipped_row` builds a fresh runtime table and is
deliberately invisible to both digests; `fixtures()` is in two hashed streams, and
adding a row there moves four pins together.

## Staging

Each step lands green on its own. Write a session file per step as it is reached; do
not write all five up front, because steps 3 and 4 have a decision in them that step 2's
measurements should inform.

| step | contents | pins predicted |
|---|---|---|
| 1 | **done.** A release verb in `ArticulatedCommandV1`; payload 51 -> 53, layout version 1 -> 2; both hand-written fixtures rewritten at 57 bytes and the command reference with them. See [step 1](articulated-bow-01-release-verb.md) | `ARTICULATED_COMMAND_HASH`, **and both feature-only exact digests** -- this row predicted one pin and there were three |
| 2 | a `Bow` shipped row, drawing on the `Both` grip path from combat-arms 01 -- the bow is two-handedness's natural second consumer | none registered |
| 3 | a 3D projectile store with its own integration, swept against `RegionVolume`s and the shield plane, hashed in the articulated block only | `ARTICULATED_COMMAND_HASH` (append) |
| 4 | damage: a fourth `ContactKind` through the exact solver, **or** its own energy accounting outside it | decided in step 4; both exact digests are written against the current three kinds |
| 5 | publication and arena rendering, appended after the event words so the existing prefix stays byte-identical | `ARTICULATED_STREAM_DIGEST` (a layout move, by extension) |

**Step 4 is the real design decision** and must be written down before it is coded. A
fourth `ContactKind` buys the exact solver's energy ledger, impulse law and both
registered feature digests -- and owes amendments to every one of them. Separate
accounting keeps the solver untouched and owes an argument for why an arrow's energy is
allowed to be computed by different rules than a blade's. Neither is obviously right.

## What must not move, at any step

`BOW_HASH`, `LAB_HASH`, `ROOM_HASH`, `BATTLE_HASH`, `SWAP_HASH`, `GOLDEN_STATE_HASH`,
the combat spec-table digest and the `articulated-duel-v1` fingerprint. **Any of them
moving is a failure of the isolation above, not a number to re-record.** Say so in the
commit message, and check them explicitly rather than trusting the suite to notice.

## Verification

The standard gate, plus one thing it does not cover:

```powershell
cargo test
cargo test --workspace --features cartesian-recoil
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
node tools/check_docs.js
git diff --check
```

`tools/wasm_check.js`'s "an arrow flies the way native recorded it" drives the
**legacy** path only, and its own comment explains that it exists because no other
golden exercises `Vec2::length`, `segment_circle`'s i64 dot products or the saturating
multiply in `tangential_speed`. An articulated projectile path has the same property
for its own arithmetic and **deserves its own paired native/wasm check** on exactly
that argument. Add it in step 3, not at the end.
