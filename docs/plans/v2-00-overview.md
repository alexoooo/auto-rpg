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

**Progress (2026-08-10):** sessions `v2-01` through `v2-15` are complete and green,
with nothing carried forward. `v2-14`'s three checkpoints all landed; an articulated
tick now resolves contact, commits impulses, settles against walls, and hashes its cap
counter. `v2-15` replaced the temporary body capsule with five regional volumes, added
the wound/blood/shock column and the sole articulated health query, and moved two
mechanics pins it predicted (`ARTICULATED_COMMAND_HASH`, `CONTACT_BEHAVIOR_DIGEST`);
the legacy six are untouched. The browser group-cap fixture that both of those sessions
carried forward is done: it was never blocked on `v2-16`, because `v2-11a`'s
`submit_articulated` already steers an articulated row, and the duel's two rows walked
into each other spend every group ordinal on tick 85. No hash moved for it. See
[`v2-14`'s closing note](v2-14-contact-solver.md#what-was-left-owed-and-what-it-cost).
`v2-16` is **complete**. The ground-truth pose accessor and the subject-scoped
observation plus its appended 472-feature block landed first, moving
`FEATURE_LAYOUT_VERSION` to 12 and `FEATURE_COUNT` to 922 with indices `0..450`
byte-identical. The host half followed -- the fixed pose and combat-event
buffers, their fifteen exports, `init_articulated`, and the portable stream digest,
which pinned as `ARTICULATED_STREAM_DIGEST = 0x4372a94d89fc9155` and agrees
between native and wasm -- `0x6f879c13430adfc1` since v2-17 checkpoint B moved the
simulation under it twice, first for the contact projector and then for the blade's
centre of mass. The policy seam landed beside them -- `ArticulatedPolicy`
beside `Policy`, `policy::run_articulated` beside `run`, and the workspace's first
`compile_fail` doctest, which is documentation rather than a gate on the stable
toolchain and says so in place. Nothing outside its own tests drives it yet. The
JavaScript half is in: `tools/wasm_check.js` whitelists all fifteen exports and adds
`wasm_exports_match_layout_stride_capacity_and_drop_fields` and
`native_and_wasm_pose_event_stream_digests_match` beside their `crates/web` twins, and
`client/test/wasm-memory.test.mjs` adds
`published_views_survive_articulated_stress_without_memory_growth`, which settles at
237 pages and holds. The generated TypeScript *consumer* is still v2-17's; the
generated constants are already emitted. No legacy hash moved, and the
`duel --seeds 400` win rate is unchanged at 59.5%.

**`v2-17` closed at checkpoint B (2026-08-10), without its pin.** It ran as five ordered
checkpoints rather than one commit, because its recorded fixtures must not be written
against a physics model that a later half of the same session changes — and that
structure is what made stopping cheap. A and B landed and are green; C, D and E were
never started and **`ARTICULATED_HASH` does not exist**, so nothing has to be unpinned.

The gate fails by roughly a factor of fifty: 99.0% of composed trials still reach the
tick limit against a reference wanting under ten percent, and the composed script is
2.5x *worse* than the windmill control it was required to beat. Checkpoint B's mechanics
change — sampling a held blade at its centre of mass rather than in the hand, via the
already-hashed `EquipmentSpec::balance` — is the only change on record that moves the
count of region-taking blows, 39 to 109, and it moved it in the right shape, with contact
opportunities falling 26% while blows tripled. It closed the energy gap from 59x to 35x
and left the gate failing anyway. The diagnosis is that a weapon-body contact closes at a
median 113 raw against legacy `IMPACT_THRESHOLD`'s 3,932, which is upstream of
`CONTACT_ENERGY_FLOOR`, of `WOUND_PER_ENERGY`, and of the roster's regional maxima — and
is why sweeping any one of them moves attrition without moving outcomes.

The complete measured result, six findings that outlive the session, and an open ledger
of eleven deferred items live in
[`v2-17`](v2-17-scripted-mechanical-gate.md#how-v2-17-closed-2026-08-10). The largest
unexamined lever named there is the arm's slew ceiling; the first recommended action is
to look at a fight, because three of this session's conclusions were refuted by later
measurement and nobody has yet seen this model run.

**That first action now has a tool (2026-08-10).** `lab trace` writes one fight as JSON
and `/fight.html` draws it — a plan and an elevation sharing a scale, and the two rates
the gate turns on plotted against their own thresholds. It is deliberately outside every
contract: no worker, no wasm, no ABI, and it is not one of the production build's inputs,
so it can neither ship nor pin anything. Checkpoint C remains the production path and
this is expected to be deleted by the session that lands it. `CONTACT_ENERGY_FLOOR`
became a `sim` export so the picture reads the line rather than copying it.

**`v2-20` is complete (2026-08-10), and it closed one of `v2-17`'s eleven deferred items
by taking the option that session did not expect.** The off arm has one live column back
— `off_hand` takes a `guard: CombatHeight` — and the plate it holds went from `7/20` by
`1/2` to a quarter each way, 36% of the face area, with mass, balance, thickness,
binding and surface deliberately unmoved so the attrition numbers stay attributable to
one variable. The deferred item read "either the shield grows, or the off arm auto-guards
on the threat, or high attacks beat a low guard"; the answer is the third, and the item's
premise was backwards. Derived from the fixtures rather than argued: at `half_height 1/2`
the plate covered four (guard, region) cells *outright* on a Fighter — the whole of the
legs at LOW, the whole of the head and both arms at HIGH — so it was too big, not too
small. At a quarter nothing is covered outright and the three settings best-answer three
different regions. The second option, a guard that reads the threat, is left standing on
purpose: it is the edge `v2-19` gives a *learned* policy, and is why this session blocks
that one.

**The lockstep audit is what makes that corpus believable, and it failed first.** Both
bodies read one tick and one height clock, so the measured joint distribution of
(attacker weapon height, defender guard height) came back **100.00% diagonal over 62,668
commanded pairs** — a guard never tested against any height but its own. Phasing the two
sides apart by a whole `HEIGHT_TICKS`, which is what the session file called for, was
measured not to fix it: it yields 0.00% diagonal, the same degeneracy relabelled. What
shipped is a uniform half-step lead of the guard clock over the weapon clock,
`GUARD_LEAD_TICKS = 45`, measuring 50.03% diagonal and needing no faction key — which
matters, because `ArticulatedObservation` deliberately has no faction column. **It mixes
partially and the session says so**: equal periods make the index difference constant,
so six of the nine cells are reachable and three are unreachable by construction — a LOW
attack never meets a HIGH guard, a MID a LOW, a HIGH a MID — measured at exactly zero on
all three scripts, and no offset closes them. A per-run phase offset belongs to the
evaluation harness rather than to a policy with no per-run memory, which is what `v2-19`
is carrying a phase-randomised control opponent for. Over 800
mirrored trials the weapon/shield share of resolutions fell 34.38% to 22.76% composed
and 9.13% to 4.87% on the windmill, and the Brute's mean end health fell 0.9424 to
0.9242 and 0.7325 to 0.7158. The plate is beatable and the fight is still not decisive:
**`v2-17`'s gate is not claimed and is not close**, because a smaller shield lets contact
through without touching the energy budget measured at 35x short.

Four articulated pins moved and all four were predicted from their fixtures before the
run: the combat spec-table digest, the `articulated-duel-v1` fingerprint — both newly
listed in the [golden registry](../reference/hashes.md#golden-registry), which had no row
for either — `ARTICULATED_COMMAND_HASH`, and `ARTICULATED_STREAM_DIGEST`. The legacy six
did not move, `CONTACT_BEHAVIOR_DIGEST` and `COMBAT_GEOMETRY_HASH` did not move, and
`duel --seeds 400` is unchanged at 59.5%.

**`v2-19` closed at `revise` (2026-08-11), and the LEARNING GATE is not claimed.**
`crates/learn` got its host: `lab learn-probe train|evaluate` and
`lab trace --policy learned --checkpoint PATH`, which is how a learned fight is
watched in `/fight.html`. `TRACE_SCHEMA` moved 2 -> 3 for it — the single `script`
field became `heroes`, `monsters` and `checkpoint`, mirrored in
`client/src/fight/trace.ts`. **No hash moved**, as predicted; nothing in this session
is reachable from a golden.

**The gate `v2-19` wrote down was replaced before it was run, and the replacement is
the session's first result.** A network with every weight at zero scores 76.844 held
out against the composed script's 59.871 — argmax over zeroed heads is the constant
"advance, LOW, chamber, LOW guard" — and the composed script loses 118 of 400 to a
mirror of itself. A 5% bar over it is a bar a constant clears five times over. What
ran instead is five conditions on the same 400 held-out trials (constant, composed,
attack-moves, windmill, learned), a bar of 5% over the **best non-learned** condition,
and a *paired* bootstrap interval on the per-trial difference.

The learned checkpoint is the best of the five on both boards and does not clear the
bar: **88.922 against the windmill's 84.606 frozen (+5.1%, CI [+0.998, +7.945], bar
+4.230) and 87.797 against 84.193 phase-randomised (+4.3%, CI [+0.095, +6.970], bar
+4.210)**. It never loses — 0 of 400, twice — doubles the settled kills to 30, and is
the only condition that moves the tick-limit rate the way `v2-17` needs, 96.2% to
92.5%. Safety is green on both boards (0 refused submissions, 0 solver refusals, 0
energy excess) and 400/400 recorded replays reproduce with no model loaded.

**The phase-randomised control did not fire, and saying it did would have been
inventing a finding out of a threshold.** The two boards read PASS and FAIL, which
invites "the edge is a clock reading" — but the paired difference of the differences
is **+0.712 with a 95% interval of [-4.209, +5.350]**, seven times wider than the
point estimate. The control is kept anyway; it cost one wrapper and it is what stopped
the wrong headline.

`revise` rather than `stop`, on four grounds, ordered by cost: **the training run was
budget-stopped at 52 of 120 generations** on a 45-minute wall-clock cap and finishing
it is free; the checkpoint is short of a bar rather than short of a result; it is a
**near-constant** — MID roughly eighty percent of the time where every script cycles
all three heights — which is the action/observation finding `v2-20` left an edge open
for; and all five conditions sit between 59.9 and 88.9 on a corpus where 92.5% to
99.8% of fights reach the clock, so **learning is being measured through a physics
that cannot end fights**. `revise` authorizes none of scale, search, catalogs,
hierarchy, browser training, GPU evaluation, or the Lab workbench.

**One of five anatomy regions is inert.** Zero head contacts in all ten rows, and it
means unreachable rather than unchosen: a Fighter's highest commandable blade axis is
z 1.35 against a Brute head admitting a sword only from z 1.61, and a Brute's club can
touch a Fighter's head but the torso capsule always has the earlier time of impact and
takes the row. A premise that prompted the check was wrong — a Fighter's head spans
1.50..1.90, not 1.60..1.80, because `body_region_volumes` builds the head as a
degenerate capsule and `AnatomyRegionSpec::half_height` is dead for that region. Not
fixed: a fourth height, a non-horizontal blade, or a region-targeting action head are
each their own session. The full corpus is in
[`docs/performance/v2-learning-probe.md`](../performance/v2-learning-probe.md) and the
decision in [`v2-19`](v2-19-learning-probe.md#how-v2-19-closed-2026-08-11-revise).

**Carried into `v2-17`, from `v2-15` and now sharpened by `v2-16`:** the contact model
gives an equipment collider one generalized point velocity -- body plus *hand* -- so a
swing's tip speed is not represented and a stat-driven fight dissipates less than the
raw-144 energy floor into any single blow. `v2-16`'s policy checkpoint measured what
that costs end to end: with an aggressive attacking articulated policy, **3600 ticks
of continuous contact (2300-4100 resolutions) takes the Brute from 1.000 health to
0.948 and leaves the Fighter untouched**, so no policy ends `articulated_duel` inside
its hour of ticks. Separately, `Scenario::articulated_duel` spawns its two bodies
**10.8 units apart against a 9.6 sight range**, so neither ever sees the other, and an
articulated policy has no standing order to search along because the observation has
no order column. The scripted mechanical gate therefore needs three things and not
one: a tip-velocity term or a roster whose regional maxima are scaled to what the
solver delivers, a fixture whose bodies start inside each other's sight, and a way for
a policy to close when nothing is visible. See
[`anatomy-health.md`](../reference/anatomy-health.md#measured-limits-this-session-found).

**Superseded (2026-08-10), by measurement rather than argument.** Two of those three
were wrong and the third was never a blocker; the prototypes and numbers are in
[`v2-17`](v2-17-scripted-mechanical-gate.md). A tip-velocity term leaves the maximum
blow *byte-identical* and dissipates **less** energy, because the budget is closure
energy over collider rows and never reads the fact's point velocity — a richer point
velocity only makes the bounded alpha search clamp harder. Rescaling the roster has a
one-factor-wide window between "never finishes" and "every fight is a 31-tick
decapitation", and never makes the Fighter take damage at all. And the sight range
needs nothing: the script's `toward` retains current yaw when nothing is visible, and
the faction-derived spawn yaws already point the two bodies at each other. What the
measurement did find is a unit mismatch -- `CONTACT_ENERGY_FLOOR` is the legacy
per-swing `ENERGY_FLOOR` spent as a per-fact-per-tick charge, against groups whose
median closure energy is 102 raw. That is not yet a decision: every number above was
taken under a test policy that holds a fixed arm target and never swings, so `v2-17`
lands the composed script first and re-measures before touching any mechanics.

**Two smaller readings from `v2-16` worth not rediscovering.** The `compile_fail`
doctest's pinned error code (`E0050`) is **not enforced on stable rustc** -- only on
nightly, where the code is checked; on stable it is parsed and ignored, so a
deliberately wrong code passes. What actually rules out a doctest passing for the
wrong reason is the compiling twin beside it that differs only by the `&World`
parameter, and the caveat is written out at the doctest in
`crates/policy/src/lib.rs`. And the combat-event feed is cleared **per `step`, not per
publication**, exactly as the legacy event feed always has been: a click or a spawn
between two steps rebuilds the frame and republishes the same rows, so a consumer that
accumulates from the feed must key on the call that stepped or it double counts.
`step(0)` clears the feed, which is the same rule from the other end.

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
| `v2-16-pose-event-abi` | complete: bounded portable pose/event streams, subject observation, policy seam | unchanged | `ARTICULATED_HASH` absent; `ARTICULATED_STREAM_DIGEST` and the legacy feature prefix added |
| `v2-17-scripted-mechanical-gate` | **closed at checkpoint B**: scripted policies and `lab articulated`, the projector fix, the blade's centre of mass, a static off arm. No fixtures, no evidence, no visible review | unchanged | **`ARTICULATED_HASH` still absent** — the gate did not pass, so nothing was pinned; `ARTICULATED_STREAM_DIGEST` moved twice |
| `v2-18-combatant-integration` | representative rigs/assets over frozen mechanics | unchanged | unchanged |
| `v2-19-learning-probe` | learned-vs-scripted evidence and expand/stop decision | unchanged | unchanged |
| `v2-20-guard-height-and-shield` | **complete**: one free column on the off arm (`guard: CombatHeight`), a plate at 36% of its face area, the coverage tables derived from the specs, and the lockstep broken — 100.00% diagonal measured, 50.03% and six of nine cells after a half-step guard lead | unchanged | four moved, all predicted: combat spec-table digest, `articulated-duel-v1` fingerprint, `ARTICULATED_COMMAND_HASH`, `ARTICULATED_STREAM_DIGEST`. `ARTICULATED_HASH` still absent |

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
MAX_COMBAT_EVENTS = 2048                v2-17B: 556 rows rejected 1024; the centre-of-mass change then took the high-water to 354 and the capacity was deliberately not resized down
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
