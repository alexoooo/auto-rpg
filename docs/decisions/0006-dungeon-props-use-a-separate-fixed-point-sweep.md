# ADR 0006: dungeon props use a separate fixed-point sweep

**Purpose:** Record why physical dungeon dressing is authoritative without becoming a combat-contact kind.
**Status:** current
**Canonical source:** The object rules live in [`world/props.rs`](../../crates/sim/src/world/props.rs) and their state in [`world/mod.rs`](../../crates/sim/src/world/mod.rs); the browser mirror is [Dungeon object ABI](../reference/dungeon-object-abi.md).
**Update when:** Object kinds, placement, collision, slow fractions, durability, impact ordering, tombstones, or publication layout changes.

**ADR status:** accepted

## Context

Barrels, pottery, webs, and water must affect play. Drawing them from a room asset
alone would let presentation decide collision and movement, violating the simulation
boundary. Sending them through the articulated contact solver is wrong in the other
direction: generated dungeon play uses the legacy two-dimensional body and weapon
model, while contact kinds describe articulated owner-to-owner mechanics.

## Decision

The shipped generated dungeon derives a bounded object store from the level seed and
cached tile fingerprint without consuming the generator RNG stream. Placement is
row-major and admits a candidate only when its complete 3x3 neighbourhood is open and
it is clear of spawns. Blocking dressing therefore always leaves a route around it.
Flat and articulated fixtures allocate no rows.

Barrels and pottery are fixed-point circles that block bodies and have durability 3
and 1. Webs do not block, slow movement to 65 percent, and have durability 2. Water
does not block, slows to 80 percent, and is indestructible. Overlapping slow zones use
the smaller multiplier. Weapon and legacy-arrow sweeps collect prop impacts from the
tick-start state and apply them in `(time of impact, prop identity, attacker identity)`
order. This is a separate energy account using the legacy action mass, relative speed,
and power multiplier; `ContactKind` does not widen.

A destroyed prop becomes an inert tombstone until the next level. Its identity and
row remain published and hashed. That makes destruction replayable and prevents a
renderer from mistaking compaction for an unrelated object changing identity.

The browser receives a separate twelve-u32 `DUNGEON_OBJECT_V1` row. Neither the
legacy frame nor the four-byte compatibility furniture buffer changes version or
stride.

## Consequences

Generated-dungeon state hashes intentionally include object placement and mutable
durability. Empty flat worlds skip the block entirely, preserving the legacy lab and
articulated isolation boundary. Asset meshes, animation, particles, sound, and debris
remain presentation; they consume object rows and never write transforms back.
