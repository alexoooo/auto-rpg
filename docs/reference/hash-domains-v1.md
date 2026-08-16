# Version 1 scenario and state hash domains

**Purpose:** Define typed scenario and state digests without changing the legacy state-hash byte stream.
**Status:** current
**Canonical source:** [`Scenario::try_fingerprint`](../../crates/sim/src/scenario.rs), [`World::state_digest`](../../crates/sim/src/world.rs), and this byte grammar.
**Update when:** Scenario identity, an authoritative state field, hash schema, or digest comparison rules change.

<!-- DOC_CONTRACT: hash-domains-v1 -->
## Primitive and typed comparison

Every value uses the existing 64-bit FNV-1a `Hash64`; multi-byte integers enter it
little-endian. A state digest is the tuple `(domain, schema, value)`. Domain codes are
LegacyV1 `0` and ArticulatedV1 `1`; both begin at schema `1`. Comparison checks domain
first, schema second, and compares values only when both match. A bare `u64` is never
a cross-domain comparison API.

## ScenarioV1 fingerprint

`Scenario::fingerprint` hashes these bytes in exact order:

1. ASCII `ARPG-SCENARIO` with no terminator;
2. schema `u16 = 1`;
3. combat-model `u8` (`0` Legacy, `1` Articulated);
4. name length `u16`, then UTF-8 name bytes;
5. dungeon columns `u16`, rows `u16`, tile count `u32`, then every row-major tile
   byte;
6. `max_ticks u32`;
7. portal presence `u8`, then raw x/y `i32` only when present;
8. unit count `u32`, then each unit in vector order using the unit record below.

Torches do not enter identity. The codec nevertheless carries them so decoding a
Scenario is lossless.

The fingerprint unit record writes body `u8`, faction `u8`, five stat bytes, raw
spawn x/y `i32`, the primary item definition, secondary presence `u8`, then the
secondary definition when present. Item definition is the exact 26-byte layout in
[Replay codec V1](replay-codec-v1.md#integer-and-size-rules), including action code
and all nine `ActionSpec` fields. This is
one shared writer used by fingerprint and codec; duplicating field order is rejected
in review.

ScenarioV1 has no reserved extension selector or tail. V2-12 introduces ScenarioV2
for articulated scenarios and writes the exact scenario-owned combat-spec block in
`replay-codec-v2-combat-specs.md`. Legacy ScenarioV1 fingerprints remain unchanged
after v2-10.

The length prefixes make `("ab", "c")` and `("a", "bc")` distinct streams. Every
existing scenario fingerprint intentionally changes on adoption of ScenarioV1;
legacy *state* goldens do not.

## LegacyV1 state digest

For `CombatModel::Legacy`:

```text
StateDigest { domain: LegacyV1, schema: 1, value: World::state_hash() }
```

`World::state_hash()` remains instruction-for-instruction the current FNV writer.
No tag, schema, model, scenario fingerprint, or empty articulated block is added.
This is what keeps all six legacy state pins byte-identical.

Calling `World::state_hash()` remains source-compatible, but documentation and new
generic tooling treat it as the LegacyV1 value only. Domain-aware replay and wasm
code uses `state_digest()`.

## ArticulatedV1 state digest

ArticulatedV1 is deliberately unpinned until v2-17. Its schema-1 writer begins:

```text
ASCII "ARPG-STATE"        10 bytes
hash schema               u16 = 1
combat model              u8 = 1
submitted-command layout  u16 = 1
legacy-core digest         u64 = the unchanged World::state_hash() writer's result
stored-command slot count  u32
stored command slots       session-owned canonical bytes
```

The nested legacy-core digest covers all pre-v2 authoritative columns without
duplicating their fragile byte writer. It is not a claim that LegacyV1 and
ArticulatedV1 values are comparable: the articulated prefix and typed domain forbid
that comparison.

The stored-command block is constructible as of v2-11: its count is the allocated
entity-slot count and one command option is written per slot in ascending slot
order. Dead allocated slots retain their last command, just as the legacy core
retains their other columns; reusing a slot clears it for the new generation.

The complete schema-1 suffix activation order is normative:

1. v2-11 stored-command slots, including the count above, in the exact
   [command hash layout](articulated-command-v1.md#articulated-state-hash-block);
2. v2-12 the [codec-V2 combat-spec](replay-codec-v2-combat-specs.md#scenario-extension-grammar)
   presence/table/original-unit-binding bytes, then one resolved
   anatomy/equipment binding for every allocated slot;
3. v2-13 one [actuator-state row](articulated-actuators.md#hash-and-replay-order)
   for every allocated slot;
4. v2-14 [`ContactSolverState::cap_hits u32`](contact-solver.md#contract);
5. v2-15 one [anatomy-state row](anatomy-health.md#sole-health-and-death-query)
   for every allocated slot.

The single stored-command count delimits every later per-slot block; later blocks do
not write a second slot count. The exact row bytes are owned by the linked phase
references. A phase updates this list before its state becomes constructible. Once
v2-17 pins schema 1, changing the order, meaning, or coverage requires a hash-schema
bump or the explicit golden re-record path.

The value `1` in the v2-10 prefix is
`ARTICULATED_COMMAND_SCHEMA_RESERVED`; it declares the next block's grammar but does
not make an articulated replay command schema acceptable early. V2-11 defined
`SUBMITTED_COMMAND_LAYOUT_VERSION = 1`, now `2` since the release verb widened the
payload, and asserts the constants are equal before it
turns that codec dispatch arm on.

Every phase adds a structural coverage test that starts from a valid state, mutates
one field through a test-only checked constructor, and proves the ArticulatedV1 value
moves while the LegacyV1 fixture remains unchanged. A collision in one test vector
is not accepted as evidence that a field may be omitted; use a second nonzero value.
