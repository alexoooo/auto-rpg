# Reference: arena control evidence V1

**Purpose:** Define the exact browser evidence container for accepted Human arena commands and its replay validation.
**Status:** current
**Canonical source:** [`controlEvidence`](../../client/src/fight/live.ts) and [`run`](../../crates/lab/src/control_evidence.rs)
**Update when:** The evidence header, command row, replay baseline, bounds, digest grammar, or analyzer changes.

The replay bytes inside it remain owned by [`ReplayEnvelope`](../../crates/sim/src/codec.rs).

## Purpose

`ARPGCTL1` proves which embodied commands the authoritative arena accepted. It is not an
input-event log and does not claim that a mouse event became the command JavaScript meant
to send. The evidence begins with a canonical zero-tick replay envelope, appends the exact
stored command rows published by the wasm host, and names the final typed state digest.
`lab control-evidence` must replay those rows to that digest before a control measurement
may cite the file.

<!-- DOC_CONTRACT: arena-control-evidence-v1 -->
## Container

All integers are little-endian. The fixed header is 48 bytes.

| offset | type | meaning |
|---:|---|---|
| 0 | `u8[8]` | ASCII `ARPGCTL1` |
| 8 | `u16` | embodied command schema, currently 3 |
| 10 | `u8` | stored command kind, 2 |
| 11 | `u8` | zero |
| 12 | `u16` | accepted row stride, 70 |
| 14 | `u16` | command payload bytes, 57 |
| 16 | `u16` | command payload layout, 2 |
| 18 | `u16` | zero |
| 20 | `u32` | replay baseline byte length |
| 24 | `u32` | authoritative final tick |
| 28 | `u32` | accepted row count |
| 32 | `u8` | controlled faction, 0 Heroes or 1 Monsters |
| 33 | `u8` | flags; bit 0 records visual truncation in a container assembled elsewhere |
| 34 | `u8` | final state hash domain |
| 35 | `u8` | zero |
| 36 | `u16` | final state hash schema |
| 38 | `u16` | zero |
| 40 | `u32` | final state digest low word |
| 44 | `u32` | final state digest high word |

The baseline immediately follows the header. It is a codec-produced `ReplayEnvelope` at
tick zero with no commands, the installed arena scenario and seed, default standing orders
for both factions, and `Objective::None` for both. Accepted rows follow it:

```text
u32 tick | u32 entity index | u32 generation | u8 kind=2 | payload[57]
```

Rows are ordered by tick, carry a generation-qualified identity, and number at most two per
tick. The whole file is capped at 16 MiB and 262,144 rows. A dropped receipt makes evidence
unavailable. The current browser recorder shares its retained chunks with the visual cap;
if that cap skips an already-stepped receipt it increments the command-drop count and offers
no `ARPGCTL1` file. Byte 33 preserves the container grammar, but the shipped producer cannot
currently emit analyzable truncated evidence without independent receipt retention.

## Analysis

```text
cargo run --release -p lab -- control-evidence --in fight.arpgctl
cargo run --release -p lab -- control-evidence --in fight.arpgctl --full-out full.replay --thinned-out thinned.replay
```

The first command requires the full reconstructed replay to reach the recorded typed state
digest. Both commands also keep only controlled-faction rows on ticks divisible by that
body's authoritative decision period, retain the same horizon, and report that counterfactual
separately; the second command persists both canonical replay envelopes. Thinning is an
analysis, never a repair: malformed, incomplete, dropped or digest-inconsistent evidence is
refused before either result is printed.
