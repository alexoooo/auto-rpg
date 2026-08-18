# Documentation map

**Purpose:** Route readers to the current documentation authority and define the target hierarchy used by the v2 documentation migration.
**Status:** current
**Canonical source:** this document
**Update when:** A document class, reader path, or standard document header changes.

The root documents remain the entry points while v2 splits long-lived authority by
concept. The [inventory](documentation-inventory.md) preserves the original
root-heading audit and records the durable destination or compatibility entry that
now supersedes each moved section.

## Read by role

- **Player:** [game status](../README.md#status), then [getting started](../README.md#getting-started).
- **Contributor:** [repository commands](../AGENTS.md#commands), the [crate dependency graph](architecture/overview.md#current-crate-graph), the canonical [determinism contract](reference/determinism.md#contract), the [hash domains](reference/hashes.md#hash-primitive-and-current-domains), then the [completion gate](../AGENTS.md#before-you-call-it-done).
- **Mechanics author:** [determinism](reference/determinism.md#contract), [simulation flow](architecture/simulation.md#one-tick-in-current-order), [combat rationale](design/combat.md#the-swing), and [commands](reference/commands.md#policy-output-command).
- **Renderer author:** [browser runtime](architecture/browser-runtime.md#current-flow), [worker protocol](reference/worker-protocol.md#messages-and-command-scheduling), [renderer snapshot copies](reference/renderer-contract.md#renderer-owned-snapshot-boundary), [dungeon object ABI](reference/dungeon-object-abi.md#dungeon-object-abi), [presentation identity](reference/renderer-contract.md#presentation-identity), [visibility presence](reference/renderer-contract.md#visibility-and-subsystem-presence), [interpolation](reference/renderer-contract.md#interpolation-timeline), [backend lifecycle](reference/renderer-contract.md#backend-selection-and-loss), the current room [manifest semantics](reference/room-asset-contract.md#manifest-semantics), [coordinates and origins](reference/room-asset-contract.md#coordinates-origins-and-sockets), [reproducibility](reference/room-asset-contract.md#reproducibility-and-hashes), [validation and budgets](reference/room-asset-contract.md#validation-and-budgets), [disclosure mapping](reference/room-asset-contract.md#authored-room-disclosure-mapping), [loader lifecycle](reference/room-asset-contract.md#loader-lifecycle-and-failure), and [presentation-only bounds](reference/room-asset-contract.md#presentation-only-bounds), [frame ABI](reference/frame-abi.md#current-layout), [presentation rationale](design/presentation.md#renderer-roles), the completed [greybox matrix](performance/v2-reference-matrix.md#measurement-record), and the [current room matrix with pending manual evidence](performance/v2-room-matrix.md#artifact-and-environment-record).
- **Policy researcher:** [policy boundary](architecture/policy.md#the-complete-policy-seam), [observation layout](reference/commands.md#policy-input-observation), [replay boundary](architecture/replay-hashing.md#current-replay-flow), the [failed articulated gate](performance/v2-articulated-gate.md#v2-articulated-mechanical-gate-evidence), and the [learning corpus](performance/v2-learning-probe.md#v2-learning-probe-held-out-corpus).

## Normative contract markers

Exact normative contracts in `docs/reference/` use a marker immediately before the
heading that owns the contract:

```markdown
<!-- DOC_CONTRACT: stable-unique-name -->
## Contract heading
```

`DOC_CONTRACT:` markers live only in `docs/reference/` and bind to the following
heading. Contextual links from other documents target that heading anchor, never the
marker text. This makes duplicate authority and orphaned contracts mechanical errors.

Current marked contracts are [determinism](reference/determinism.md#contract), the
[determinism boundary](reference/determinism.md#boundary-of-the-promise),
[policy observations](reference/commands.md#policy-input-observation), the
[submitted command](reference/commands.md#policy-output-command), the
[action/loadout registry](reference/commands.md#actions-and-loadouts),
[host standing inputs](reference/commands.md#host-standing-inputs), the
[hash domains](reference/hashes.md#hash-primitive-and-current-domains),
[replay integrity](reference/hashes.md#current-replay-integrity), the
[golden registry](reference/hashes.md#golden-registry), the
[frame layout](reference/frame-abi.md#current-layout), and
[frame compatibility](reference/frame-abi.md#compatibility-rules), the
[worker messages](reference/worker-protocol.md#messages-and-command-scheduling), the
[worker lifecycle](reference/worker-protocol.md#lifecycle-and-terminal-state), the
[snapshot pool](reference/worker-protocol.md#snapshot-layout-and-buffer-ownership),
[the arena recording transfer](reference/worker-protocol.md#the-recording-and-why-it-is-not-the-pooled-buffer), and
[worker visibility filtering](reference/worker-protocol.md#visibility-filtering), the
[renderer snapshot-copy boundary](reference/renderer-contract.md#renderer-owned-snapshot-boundary),
[presentation identity](reference/renderer-contract.md#presentation-identity),
[renderer visibility presence](reference/renderer-contract.md#visibility-and-subsystem-presence),
[interpolation timeline](reference/renderer-contract.md#interpolation-timeline), and
[renderer backend lifecycle](reference/renderer-contract.md#backend-selection-and-loss), and the current room
[manifest semantics](reference/room-asset-contract.md#manifest-semantics),
[coordinates and origins](reference/room-asset-contract.md#coordinates-origins-and-sockets),
[reproducibility and hashes](reference/room-asset-contract.md#reproducibility-and-hashes),
[validation and budgets](reference/room-asset-contract.md#validation-and-budgets),
[disclosure mapping](reference/room-asset-contract.md#authored-room-disclosure-mapping),
[loader lifecycle and failure](reference/room-asset-contract.md#loader-lifecycle-and-failure), and
[presentation-only bounds](reference/room-asset-contract.md#presentation-only-bounds), and the
[embodied submission contract](reference/embodied-command-v1.md#the-embodied-submission-contract)
and the [embodied actuator columns](reference/embodied-actuators.md#what-an-embodied-body-has-that-an-articulated-one-does-not).

## Target hierarchy

| Location | Sole job |
|---|---|
| `DESIGN.md` | Short principles/index and stable compatibility entry. |
| `docs/architecture/` | Current components, authority, ownership, and data flow. |
| `docs/design/` | Rationale organized by gameplay or presentation concept. |
| `docs/decisions/` | Numbered ADRs with status and consequences. |
| `docs/reference/` | Exact versioned layouts, hashes, commands, constants, and codecs. |
| `docs/performance/` | Dated methods, named hardware, measurements, and conclusions. |
| [docs/plans/](plans/) | Temporary forward work only; removed when its topic finishes. |

## Standard document header

Every document created under the target hierarchy begins immediately after its title
with this header. `Canonical source` names the document itself when it owns the
contract, or links to the authority when it is an index or historical record.

```markdown
**Purpose:** ...
**Status:** current | proposed | historical
**Canonical source:** ...
**Update when:** ...
```
