# Version 1 scenario and state hash domains

**Purpose:** Define typed scenario and state digests without changing the legacy state-hash byte stream.
**Status:** current
**Canonical source:** [`Scenario::try_fingerprint`](../../crates/sim/src/scenario.rs), [`World::state_digest`](../../crates/sim/src/world/hash.rs), and this byte grammar.
**Update when:** Scenario identity, an authoritative state field, hash schema, or digest comparison rules change.

<!-- DOC_CONTRACT: hash-domains-v1 -->
## Primitive and typed comparison

Every value uses the existing 64-bit FNV-1a `Hash64`; multi-byte integers enter it
little-endian. A state digest is the tuple `(domain, schema, value)`. Domain codes are
LegacyV1 `0`, ArticulatedV1 `1` and EmbodiedV1 `2`; all three begin at schema `1`.
Comparison checks domain first, schema second, and compares values only when both
match. A bare `u64` is never a cross-domain comparison API.

**`HashDomain` keeps all three variants after both model deletions, and a reader who
assumes a deleted model frees its discriminant will write a replay another build
refuses.** A domain code is a *wire* discriminant: it is a byte in a replay envelope
header, and a file carrying `0` or `1` still exists somewhere. Both retired codes are
still decoded by the header reader -- so a decoder can say *which* retired grammar a
file claims -- and refused one step later by the envelope's schema tuple, which accepts
`(3, EmbodiedV1, 1)` and nothing else. Refusing a retired value **by that value** is
the whole obligation it carries; renumbering it would turn "this is an articulated
replay and there is no articulated world to play it into" into "this file is
corrupt", which is a different sentence and a wrong one.

Their live uses are that decode-rejection path and two frozen grammar words in
`crates/sim/src/exact_diagnostics.rs`, which write the domain into a digest stream and
must go on mapping the same variant to the same number. This is the same pattern as
`SCENARIO_IDENTITY_WORD = 3` and `SCENARIO_MODEL_TAG = 2`, which are constants for the
same reason: a wire value outlives the thing it named.

## ScenarioV1 fingerprint

`Scenario::fingerprint` hashes these bytes in exact order:

1. ASCII `ARPG-SCENARIO` with no terminator;
2. the scenario identity word `u16`, `SCENARIO_IDENTITY_WORD = 3`;
3. name length `u16`, then UTF-8 name bytes;
4. dungeon columns `u16`, rows `u16`, tile count `u32`, then every row-major tile
   byte;
5. `max_ticks u32`;
6. portal presence `u8`, then raw x/y `i32` only when present;
7. unit count `u32`, then each unit in vector order using the unit record below;
8. the scenario-owned combat-spec block, unconditionally.

**The identity word occupies the slot a schema and a model byte used to share, and
that is a correction rather than a simplification.** The stream once wrote a `u16`
schema of `1` followed by a `u8` model code; it now writes one `u16` whose value is
`3`. The word is *not* the model's discriminant -- that is `2` -- and it is not
derived from it. Two numbering schemes over the same three models were offset by one
by an accident of ordering, and collapsing them is the specific defect the function
that used to answer this word existed to prevent; see [two numbering
schemes](embodied-command-v1.md#two-numbering-schemes-over-one-model-and-they-are-frozen-constants-now).
It is a frozen constant now because there is one model left to ask about, and a
constant cannot drift.

**The spec block is unconditional, and the guard that used to precede it was never
about a choice.** It asked whether the scenario had articulated columns; the only
model without them was Legacy, whose scenarios cannot be built. A table that is part
of a scenario's identity for every model that has one is part of it, full stop.

Torches do not enter identity. The codec nevertheless carries them so decoding a
Scenario is lossless.

The fingerprint unit record writes body `u8`, faction `u8`, five stat bytes, raw
spawn x/y `i32`, the primary item definition, secondary presence `u8`, then the
secondary definition when present. Item definition is the exact 26-byte layout in
[Replay codec V1](replay-codec-v1.md#integer-and-size-rules), including action code
and all nine `ActionSpec` fields. This is
one shared writer used by fingerprint and codec; duplicating field order is rejected
in review.

ScenarioV1 has no reserved extension selector or tail. The scenario-owned combat-spec
block is specified in
[`replay-codec-v2-combat-specs.md`](replay-codec-v2-combat-specs.md#scenario-extension-grammar).

The length prefixes make `("ab", "c")` and `("a", "bc")` distinct streams.

## The retired LegacyV1 digest

For a Legacy world the digest was the bare state hash:

```text
StateDigest { domain: LegacyV1, schema: 1, value: World::state_hash() }
```

No tag, schema, model, scenario fingerprint or empty block was added, and that is what
kept all six legacy state pins byte-identical. **All six are deleted and the domain
code is not**: `0` is still a value a replay header can carry and still a value the
tuple refuses by name.

`World::state_hash()` survives as the shared core writer, folded whole into the digest
below rather than answered on its own. Domain-aware replay and wasm code uses
`state_digest()`.

## The live state digest

The surviving digest answers domain `EmbodiedV1`, schema `1`. Its writer begins:

```text
ASCII "ARPG-STATE"        10 bytes
hash schema               u16 = 1
model tag                 u8 = 2      (STATE_DIGEST_MODEL_TAG, frozen)
submitted-command layout  u16 = 1
core digest                u64 = the unchanged World::state_hash() writer's result
stored-command slot count  u32
stored command slots       canonical bytes, each behind a presence byte and the
                           frozen payload tag 2 (STATE_DIGEST_PAYLOAD_TAG)
```

**One implementation wrote this stream for two models and still does.** An embodied
body is an articulated one plus a tail, and a second hundred-line byte grammar would
be a second place for a column to be forgotten. Exactly two bytes differed before that
tail and both were tags rather than state -- the model byte in the prefix and the
payload byte ahead of each stored command -- so both are frozen literals now instead of
parameters. **Every embodied-only column goes in the tail, after every byte the shared
grammar writes**, and that ordering was produced by a model guard that no longer
exists. It is not a free choice: the core digest is folded by every state-digest pin in
the repository, so a column woven into the prefix would move five pins at once, in the
same direction a real change moves them.

The nested core digest covers all pre-v2 authoritative columns without
duplicating their fragile byte writer. It is not a claim that a bare state hash and
this value are comparable: the prefix and the typed domain forbid that comparison.

The stored-command block's count is the allocated
entity-slot count and one command option is written per slot in ascending slot
order. Dead allocated slots retain their last command, just as the core
retains their other columns; reusing a slot clears it for the new generation.

The complete schema-1 suffix order is normative, and the session numbers beside each
block are kept because they are the record of what was added when:

1. v2-11 stored-command slots, including the count above, in the exact
   [command hash layout](articulated-command-v1.md#the-command-block-in-the-state-hash);
2. v2-12 the [codec-V2 combat-spec](replay-codec-v2-combat-specs.md#scenario-extension-grammar)
   presence/table/original-unit-binding bytes, then one resolved
   anatomy/equipment binding for every allocated slot;
3. v2-13 one [actuator-state row](articulated-actuators.md#hash-and-replay-order)
   for every allocated slot;
4. v2-14 [`ContactSolverState::cap_hits u32`](contact-solver.md#contract);
5. v2-15 one [anatomy-state row](anatomy-health.md#sole-health-and-death-query)
   for every allocated slot.

The single stored-command count delimits every later per-slot block; later blocks do
not write a second slot count. The exact row bytes are owned by the linked references.

**The list continues past this point and this document is not where it grew.** The
floor height, the stance and the elbow plane were each appended after block 5, behind
a model guard that is now gone, and the ordering they landed in is frozen by the pins
taken over it -- see [two columns, and where the split
fell](embodied-command-v1.md#two-columns-and-where-the-split-fell). **Schema 1 is
pinned**: `EMBODIED_GOLDEN_DIGEST` and `EMBODIED_CORPUS_DIGEST` are both taken over it,
so changing the order, meaning or coverage of any block now requires a hash-schema bump
or the explicit golden re-record path in the [registry](hashes.md#golden-registry).
`ARTICULATED_HASH`, which this section once said would do the pinning, was never
created and cannot be: it was reserved for a fight under a model that no longer exists.

The value `1` in the prefix is
`ARTICULATED_COMMAND_SCHEMA_RESERVED`; it declares the next block's grammar. It was
`SUBMITTED_COMMAND_LAYOUT_VERSION = 1` and is `2` since the release verb widened the
payload, and the two constants are asserted equal at compile time so a payload widening
cannot leave the declaration behind.

**A structural coverage test per block is the standing rule**, and it is what
`every_embodied_only_column_moves_its_own_digest_and_not_the_legacy_core` does for the
tail: start from a valid state, mutate one field, and prove the digest moves while the
nested core hash stands still. A collision in one test vector
is not accepted as evidence that a field may be omitted; use a second nonzero value.
Sweep every field of a block rather than one representative -- the test this one
replaced perturbed a single stance word and would have passed with the other four
missing from the stream.
