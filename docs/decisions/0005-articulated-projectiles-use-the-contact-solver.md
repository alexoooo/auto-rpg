# 0005: Articulated projectiles use the contact solver

**Status:** accepted  
**Date:** 2026-08-16

## Context

The legacy arrow is a two-dimensional shot against body circles. It cannot name an
articulated anatomy region, and its parallel `shot_*` columns are part of
`legacy_core_hash()`. Extending those columns would move every legacy golden,
including `LAB_HASH`, whose registry rule forbids re-recording.

The articulated bow therefore needs a separate three-dimensional projectile store.
The remaining choice is how a projectile that reaches a regional capsule causes a
wound. It could call a second projectile-only damage function, or it could enter the
existing generalized contact solver as a fourth contact kind.

The second damage function would keep the exact solver's three-kind grammar unchanged,
but would need a second account of kinetic energy, restitution, impulse, armor transfer,
simultaneous wounds, severance, and source credit. Those are the exact invariants the
contact solver already owns. A distinct rule would make an arrow and a point-first
weapon disagree because they arrived through different code, not because their
geometry or material differed.

## Decision

Articulated arrows enter the ordinary and `cartesian-recoil` contact drivers as an
explicit `Projectile` collider and motor. `ContactKind::ProjectileBody` is appended as
discriminant `3`; the existing three discriminants do not move. A projectile is not a
degenerate body and is not represented by a fabricated `ContactResolution`. The exact
sweep may reuse the certified point-versus-capsule arithmetic by treating the point as
a zero-length segment internally, but the motor identity and emitted contact kind stay
`Projectile` and `ProjectileBody` throughout.

Projectile solver identities occupy the 32 `EntityId` indices immediately below
`EntityId::NONE`. Body allocation is bounded to 64 slots, so the namespaces cannot
alias. Slot generation is part of the identity and changes on reuse. The stored owner
is separate: it is used for credit and events, and a projectile continues after its
owner dies.

One rising `ReleaseRequest::Loose` edge on the right arm spawns an arrow only when one
Bow item is bound to both grips. Spawn and lifetime are fixed as follows:

- origin: the authoritative right-hand point in world space;
- direction: the normalized body-relative right-hand vector;
- speed: `rules::shot_speed(Arm::resolve(Bow, stats, body_radius))`;
- mass: the Bow action's mass;
- radius: `1/50` world unit;
- range: the archer's sight range at release;
- capacity: `rules::MAX_SHOTS` (32).

Power is not a second projectile column or a post-contact multiplier. It already
enters `Arm::resolve` and therefore launch speed; after release, the shared solver owns
energy from mass and relative velocity on the same terms as other articulated contact.

Masonry and the shield plane clip the requested travel before regional contact is
collected. The earliest clip wins. An unclipped projectile is swept against the five
published `RegionVolume` capsules, so a head hit and a leg hit name and damage different
regions. A hit, wall, shield, exhausted range, or capacity refusal reaps the arrow; a
level-held Loose request does not spawn another one.

The store is hashed only inside the append-only articulated state block, after the
release latches. It never enters `legacy_core_hash()`. Publication is a separate
append-only 12-word row keyed by projectile slot and generation; it does not widen the
legacy frame shot row.

## Consequences

Both contact laws now have a fourth explicit kind and must reject unsupported or
non-canonical Projectile pairings by name. Their exact fixture digests may move only
when a fixture reaches the new kind. All three-kind telemetry arrays and browser name
lists widen to four without renumbering their prefix.

The articulated state digest changes when a release latch or projectile state changes,
while `BOW_HASH`, `LAB_HASH`, `ROOM_HASH`, `BATTLE_HASH`, `SWAP_HASH`,
`GOLDEN_STATE_HASH`, the combat-spec digest, and the `articulated-duel-v1` fingerprint
remain byte-identical. A move in any of those legacy/isolation pins is a defect, not a
re-record.

Shield contact currently spends the arrow before the body solver rather than adding a
fifth `ProjectileShield` kind. That is deliberate: the shield is an occluding plane for
this feature, while all energy that reaches anatomy uses the one solver law above. A
future reflected or penetrating shield projectile would require its own decision and
kind rather than silently changing this ordering.
