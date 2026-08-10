# Version 2 — overview

**Status:** implementation roadmap. A session is authorized only when every
dependency named by its file is green and its own pass/fail thresholds are still
appropriate. Update that session before implementation if code has moved.

Version 2 proves three bets independently: a typed GPU presentation path, a
deterministic articulated two-body combat model, and a small learned-policy probe.
It preserves the current Canvas game as the control. It does not make scale,
search, browser training, hierarchical policy, or experiment-UI work a prerequisite
for answering whether the game is worth expanding.

The product slice is one representative room, one Fighter, one Brute, a sword,
shield, and club. Feet, navigation, and body collision remain planar. Arms,
weapons, shields, contacts, and anatomy use deterministic fixed-point XYZ.
Low/mid/high are policy vocabulary over continuous height, not physics bins.

## Non-negotiable decisions

| boundary | decision |
|---|---|
| Deterministic core | `fx`, `sim`, and deterministic `policy` code remain fixed-point and dependency-free apart from local deterministic crates and `std`. |
| Compatibility control | `Scenario::default()`, wasm `init`, the Canvas page, and every legacy hash remain byte-identical and runnable. |
| Commands | Legacy `Command` remains unchanged. Articulated worlds accept a distinct versioned `SubmittedCommand::Articulated` payload with explicit body yaw and two arm targets. |
| Hashing | Legacy hashing emits the existing byte stream exactly. Articulated hashing has a tagged schema and covers every authoritative articulated field. Cross-domain comparisons are rejected. |
| Replays | Replays persist final submitted commands in a versioned, bounds-checked envelope. Policies and learned inference are never replay dependencies. |
| Physics | No generic rigid-body engine enters authoritative state. Contact is an iterative, bounded, deterministic solver over purpose-built geometry. |
| Renderer | Babylon.js is a reversible presentation bet. It owns no authority and receives bounded complete snapshots from a worker. |
| Visibility | Authoritative current/seen/unknown visibility gates nodes, effects, sound, picking, shadows, and debug defaults. |
| Identity | Any persistent consumer keys bodies by entity index plus generation. Row position and index alone are never identity. |
| Learning | The v2 learning gate is one small native/reference learned policy compared with the scripted baseline. Catalogs, hierarchy, browser training, GPU evaluation, and a workbench are later decisions. |

## Tracks and gates

```text
Track 1: control and documentation
  01 baseline -> 02 dependency/toolchain -> 03..06 documentation gate

Track 2: visual proof
  07 worker -> 08 Babylon greybox -> 09 representative room -> VISUAL GATE

Track 3: mechanical proof
  10 replay/hash -> 11a command value/wire -> 12 geometry/specs
  -> 11b equipment-aware command validation -> 13 actuators
  -> 14 contact -> 15 anatomy -> 16 pose/event ABI
  -> 17 scripted two-body slice -> MECHANICAL GATE

Track 4: integration and learning proof
  18 representative combatants -> re-run visual/mechanical gates
  -> 19 small learning probe -> LEARNING GATE
```

Tracks 2 and 3 may proceed after Track 1. Neither depends on the other until
`v2-17`; a failed renderer may be replaced without discarding mechanics, and a
failed mechanic may be revised without an asset-production sunk cost.

**Gate state (2026-08-09):** the owner accepted the VISUAL GATE and authorized
Track 3. The ordered foreground performance capture still named by `v2-09` is
follow-up evidence, not a blocker for `v2-10` through `v2-16`; `v2-17` still requires
its own visible mechanical review.

**Progress (2026-08-09):** sessions `v2-01` through `v2-15` are complete and green.
`v2-14`'s three checkpoints all landed; an articulated tick now resolves contact,
commits impulses, settles against walls, and hashes its cap counter. `v2-15` replaced
the temporary body capsule with five regional volumes, added the wound/blood/shock
column and the sole articulated health query, and moved two mechanics pins it
predicted (`ARTICULATED_COMMAND_HASH`, `CONTACT_BEHAVIOR_DIGEST`); the legacy six are
untouched. One item is carried forward rather than done: the browser group-cap fixture
in `client/test/wasm-memory.test.mjs`, which is blocked on the articulated command
boundary that `v2-16` owns and not on the solver. `v2-16` is next.

**Carried into `v2-17` from `v2-15`:** the contact model gives an equipment collider
one generalized point velocity -- body plus *hand* -- so a swing's tip speed is not
represented and a stat-driven fight dissipates less than the raw-144 energy floor into
any single blow. The scripted mechanical gate cannot assume emergent wounds without
either a tip-velocity term or a roster whose regional maxima are scaled to what the
solver actually delivers. See
[`anatomy-health.md`](../reference/anatomy-health.md#measured-limits-this-session-found).

## Session order and hash prediction

| session | independently green result | legacy hashes | articulated pin |
|---|---|---|---|
| `v2-01-pivot-baseline` | measured playable Canvas control | unchanged | absent |
| `v2-02-dependencies-toolchain` | enforceable dependency and exact tool policy | unchanged | absent |
| `v2-03-doc-inventory` | documentation map and migration inventory | unchanged | absent |
| `v2-04-current-architecture` | current architecture and data-flow authorities | unchanged | absent |
| `v2-05-doc-split` | concept-based design/decision/evidence split | unchanged | absent |
| `v2-06-doc-enforcement` | deduplicated authority plus link/retired-plan checks | unchanged | absent |
| `v2-07-worker-protocol` | bounded worker state machine with epochs and acks | unchanged | absent |
| `v2-08-gpu-greybox` | complete: keep Babylon under an owner-accepted measured exception; WebGPU p95 missed by 0.13 ms | unchanged | absent |
| `v2-09-room-visual-gate` | owner-accepted visual gate; ordered foreground performance capture remains follow-up evidence | unchanged | absent |
| `v2-10-replay-hash-domains` | complete scenario identity, codec, explicit hash domains | unchanged | absent |
| `v2-11-articulated-command` | validated two-arm/yaw submitted-command seam | unchanged | absent |
| `v2-12-combat-geometry` | inert fixed-point XYZ primitives and specs | unchanged | absent |
| `v2-13-arm-actuators` | complete persistent arms, shield, and turn-in-place control | unchanged | absent |
| `v2-14-contact-solver` | iterative time-of-impact groups and energy ledger | unchanged | absent |
| `v2-15-anatomy` | immutable anatomy/equipment plus mutable wound state | unchanged | absent |
| `v2-16-pose-event-abi` | bounded portable pose/event streams | unchanged | absent |
| `v2-17-scripted-mechanical-gate` | recorded debug-shape two-body fight | unchanged | pinned once |
| `v2-18-combatant-integration` | representative rigs/assets over frozen mechanics | unchanged | unchanged |
| `v2-19-learning-probe` | learned-vs-scripted evidence and expand/stop decision | unchanged | unchanged |

`v2-11` has one deliberate split dependency: its value, codec, range, and atomic
fallback seam lands before `v2-12`; its equipment-binding validation lands after
`v2-12` supplies scenario-owned immutable specs. Nothing accepts an incompletely
validated command between those halves -- the temporary path fails closed with
`MissingEquipment`. `v2-13` requires both halves green.

`LAB_HASH` is never re-pinned. `GOLDEN_STATE_HASH`, `ROOM_HASH`, `BATTLE_HASH`,
`SWAP_HASH`, and `BOW_HASH` are legacy fixtures and must not move in any v2
session. During mechanics development, structural field-coverage tests, exact
replay, and native/wasm equality replace a repeatedly moving golden. One
`ARTICULATED_HASH` is recorded only in `v2-17`, after command, geometry, contact,
and anatomy contracts have frozen.

## Versioned constants introduced

The owning session fixes values and generates client copies where applicable:

```text
WORKER_PROTOCOL_VERSION = 1             v2-07
WORKER_PROTOCOL_VERSION = 2             v2-17, articulated messages/snapshots; exact V1 sessions remain accepted
REPLAY_CODEC_VERSION = 1                v2-10
REPLAY_CODEC_VERSION = 2                v2-12, combat-spec extension; V1 Legacy remains readable
HASH_DOMAIN_LEGACY_V1                   v2-10 (no tag added to legacy byte stream)
HASH_DOMAIN_ARTICULATED_V1              v2-10
SUBMITTED_COMMAND_LAYOUT_VERSION = 1    v2-11
POSE_LAYOUT_VERSION = 1                 v2-16
COMBAT_EVENT_LAYOUT_VERSION = 1         v2-16
MAX_POSES = 64                          v2-16, host publication cap; not a sim spawn cap
MAX_COMBAT_EVENTS = 256                 v2-16, measured before the phase lands
```

Append-only layouts retain stable discriminants. Exact persisted field order lives
in `docs/reference/`, not duplicated in architecture or design prose.

## Authoritative boundaries

```rust
pub enum CombatModel {
    Legacy,
    Articulated,
}

pub enum SubmittedCommand {
    Legacy(Command),
    Articulated(ArticulatedCommandV1),
}

pub struct ArticulatedCommandV1 {
    pub move_dir: Vec2,
    pub body_yaw: Angle,
    pub intent: Intent,
    pub arms: [ArmTarget; 2],
    pub grips: [GripRequest; 2],
}
```

Legacy `Policy` remains `Observation -> Command`. A separate
`ArticulatedPolicy` receives a subject-scoped articulated observation and emits
`ArticulatedCommandV1`; the runner wraps either result as `SubmittedCommand`.
`World::submit` remains the legacy entry point and maps only to the legacy variant.
`World::submit_articulated_v1` validates the model, identity, grips, equipment, and
bounded targets before accepting a command. A wrong model or stale identity stores
nothing. A range or equipment failure for a live articulated subject atomically
stores the documented neutral articulated command and returns its stable rejection
reason.

Body yaw is independent of translation. It uses bounded angular acceleration and
speed, the shortest turn, and a clockwise tie for exactly half a turn. Stagger and
leg impairment reduce angular authority by named factors; translation and turning
do not share an arbitrary effort pool in the first slice. The legacy mapping remains
the current rule: non-zero movement determines facing and standing still does not
turn.

Contact resolution repeatedly finds the earliest time-of-impact group, resolves all
members from one pre-group state in stable identity/limb/kind order, recomputes the
remaining sweeps, and stops at a fixed per-tick iteration cap. Exhaustion advances no
unchecked contact through a surface and increments a hashed diagnostic residue.
Restitution, friction, deflection, armor, and clamps may remove energy and may never
create it.

## Browser and memory contract

The worker owns authoritative wasm. Commands carry `{version, epoch, sequence,
targetTick}`; acknowledgements report accepted/rejected/applied sequence and tick.
Reset creates a new epoch, invalidates queued old-epoch work, and rejects late
buffers. With all three transferable snapshot buffers checked out, the producer
coalesces to the newest complete snapshot and reports a drop counter; it never
blocks authoritative ticks or publishes a partial buffer.

The legacy page still holds direct wasm-memory views. Every new wasm-resident pool
therefore has a fixed capacity or warm-up proof. A stress test records memory pages
after warm-up and proves that spawn, reset, route, pose, contact, and event maxima do
not grow memory while a view is live.

Pose and combat-event streams have explicit capacities, ascending stable order,
tail-drop behavior, and drop counts. Native and wasm tests digest the entire stream,
including empty ticks and drop metadata, because the state hash cannot detect a
presentation-buffer divergence.

## Performance evidence

No machine-independent “60 fps” claim is accepted. `v2-08` records a named matrix:
Windows version, browser build/channel, CPU, GPU, driver, power mode, backend,
CSS/backing resolution, render scale, scene population, lights, effects, and worker
state. After a 30-second warm-up, sample 120 visible-foreground seconds and report
p50/p95/p99 frame time, frames over 16.67/33.33 ms, long tasks, draw calls, triangles,
and residency. Repeat the baseline last.

The visual gate targets p95 <= 16.67 ms on the named WebGPU reference machine and
p95 <= 33.33 ms on its forced-WebGL2 lower tier. These are slice-specific acceptance
targets, not universal hardware promises. If the reference matrix is unavailable,
the session updates the matrix before measurement; it does not reinterpret results.

`v2-08` closed by explicit owner waiver after each renderer was measured at least
once. The original sequence reached 2 of 4 ordered captures and WebGPU p95 was 16.80
ms, 0.13 ms above its target. The recorded decision is to proceed with Babylon under
that measured exception, not to claim the numerical threshold or omitted drift
control passed. `v2-09` must measure its representative room honestly against the
then-current gate rather than inheriting a fictional greybox pass.

## Explicit deferrals and removal paths

- Spatial indexing waits for measured candidate counts from the scripted and rigged
  slices. Until then, brute force is the correctness reference.
- Pooled world forks and live search wait for a concrete observation-only
  `BeliefState` design and a measured fork bottleneck. Perfect-information search is
  Lab-only if added earlier.
- COOP/COEP and `SharedArrayBuffer` wait for a used capability.
- Bulk room/combatant production, KTX2 conversion, audio, voice, campaign, roster,
  and procedural-floor expansion wait for the visual and mechanical gates.
- Browser training, multiple wasm hosts, GPU evaluation, skill catalogs,
  hierarchical/meta policy, and the Lab workbench wait for `v2-19` to show that a
  learned policy adds value.
- Large `World`/`web` module splits are incremental: extract only the ownership
  touched by a landed phase.

Each deferred bet needs a fresh plan with a measured baseline, pass threshold, and
removal path. It is not silently inherited as “v2 follow-up.”

## Common verification

Every Rust phase runs:

```powershell
cargo test
cargo run --release -p lab -- hash
cargo run --release -p lab -- verify --seeds 200
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
git diff --check
```

Frontend phases add `npm ci`, `npm run check`, and `npm run build`. Asset phases
add the exact Blender/validator commands named in their session. Do not run
`cargo fmt`.

## Expansion decision

The visual, mechanical, and learning gates each produce an explicit pass/replace/
stop record in their phase file. Version 2 is complete when `v2-19` records whether
learning earns another roadmap. Failure of learning does not invalidate a promising
scripted game; failure of the visual or mechanical gate stops content production
around that failed foundation.
