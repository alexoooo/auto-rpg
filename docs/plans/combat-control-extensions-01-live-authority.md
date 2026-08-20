# Combat control extensions 01 -- take the body, release the body

**Status:** future; ready after the arena topic closes.

A fight no longer chooses Human ownership only at construction. Either live side may be
taken over and returned to its configured policy without restarting the world, losing a
tick, retaining stale input or changing the arena fingerprint.

## Transition contract

Add `arena_set_control(faction_code, control_code) -> packed_result`. Faction accepts only
0/1 and control only Policy/Human. Unknown faction, unknown control, no arena, dead side
and unsupported two-Human ownership return distinct named details. Repeating the installed
mode is an idempotent success. `arena_control(faction)` becomes live readback.

A successful transition is effective at the next unstepped tick `T`:

- Policy -> Human clears the staged row, restarts the composed off-hand cache at `T`, and
  requires the first Human command for `T` before stepping.
- Human -> Policy clears every staged Human field and forces one whole-policy decision at
  `T`; it neither waits one `decision_period` nor inserts a neutral tick.

The worker protocol makes that boundary explicit. `arenaSetControl` carries faction,
requested control and, for Policy -> Human, the first 61-byte command for `T`. The worker
queues it on the active arena request. `recordArenaFight` yields to worker messages after
every captured tick, then drains the transition queue immediately before the next step.
It installs the new mode, stages or computes the complete `T` command, posts
`arenaControlAck { effectiveTick: T }` and an append-only
`arenaControlChanged { tick: T, faction, control }`, and only then steps `T`.

After takeover, the recorder uses the existing one-input-per-tick rendezvous. After
release, it resumes autonomous policy stepping. A transition received while an input or
chunk credit is outstanding stays ordered behind that exact credit/input and applies at
the next pre-step boundary; it cannot overtake a posted chunk. `arenaOpened.spectator` is
immutable opening provenance, not permission to input forever--`ArenaClient` gates input
from the live control readback/transition state.

Replace the arena's construction-only controller boxes with an `ArenaSideController` that
keeps the configured policy alive, owns cadence/cache/current mode and emits either the
ordinary whole policy command or Human navigation+primary-arm composition. The untouched
policy-only branch must remain byte-identical tick for tick.

Control is host provenance, not authoritative World state. Replay continues to record the
complete command accepted at each tick and runs no controller. Add a live-only transition
timeline to `StreamingFightSource`, appended by `arenaControlChanged` messages;
do not add it to the shared `FightHeader`. Trace JSON does not widen in this session.
Exporting the timeline later requires an explicit `TRACE_SCHEMA` bump.

The construction-only seams being replaced are
[`Arena`](../../crates/web/src/lib.rs#L2293),
[`arena_start`](../../crates/web/src/lib.rs#L6785),
[`arena_control`](../../crates/web/src/lib.rs#L6853) and
[`arena_controller`](../../crates/web/src/lib.rs#L7037). Input staging remains the single
existing [`arena_stage_input`](../../crates/web/src/lib.rs#L6989) command buffer path.

## Files

| file | change |
|---|---|
| `crates/web/src/lib.rs` | `ArenaSideController`, transition export, refusal details and readback |
| `tools/wasm_check.js` | export inventory and real policy/Human/policy transition |
| `client/src/runtime/arena-recorder.ts` | wasm adapter, transition queue and timeline rows |
| `client/src/protocol/messages.ts` | correlated transition request/ack and live metadata |
| `client/src/runtime/sim-worker-host.ts` | active-request transition routing |
| `client/src/runtime/arena-client.ts` | one in-flight transition and stale-response rejection |
| `client/src/arena/arena.ts` | Take over / Release controls without rebuilding the fight |
| `client/test/worker-protocol.test.mjs` | correlation, refusal, ordering and worker reuse |
| `client/test/wasm-memory.test.mjs` | real wasm transition/replay fixture |
| `client/test/studio-shell.test.mjs` | live UI ownership and lifecycle |
| `docs/architecture/policy.md` | live host-composition ownership |
| `docs/reference/worker-protocol.md` | transition grammar and terminal behavior |
| `docs/architecture/browser-runtime.md` | takeover/release UI lifecycle |

## Tests

Rust/web:

- `arena_set_control_refuses_unknown_faction_control_missing_arena_and_dead_side_by_name`
- `a_policy_side_can_be_taken_over_on_the_next_unstepped_tick`
- `release_clears_staged_input_and_policy_decides_the_release_tick`
- `repeating_the_installed_control_is_an_idempotent_transition`
- `the_off_hand_cache_cannot_leak_across_takeover_or_release`
- `a_transition_changes_no_arena_fingerprint`
- `a_transitioned_fight_replays_from_the_commands_actually_submitted`
- `a_policy_only_fight_keeps_the_existing_submission_schedule_and_bytes`

Client/wasm:

- `the_wasm_boundary_takes_over_releases_and_reads_back_each_transition`
- `control_transitions_are_correlated_to_the_live_arena_request`
- `a_stale_transition_ack_cannot_change_the_new_fight`
- `takeover_and_release_clear_buttons_cursor_baselines_and_staged_input`
- `the_live_source_labels_each_successful_control_interval`
- `a_transition_waiting_behind_chunk_credit_applies_to_the_next_unstepped_tick`
- `spectator_opening_provenance_does_not_block_input_after_takeover`

Mutation-check by omitting the forced release-tick policy decision, retaining staged Human
input, including control in the fingerprint and dropping the transition-tick command from
the replay. Each named test must fail.

## Hash expectations

**No pinned hash moves.** Shipped pins are policy-only or construction-time Human paths;
the untouched policy branch must remain identical. This is an additive wasm export and
worker message, not a command/frame ABI move. A policy-only digest or fingerprint move is
an isolation failure.

## Verification

Run the full repository gate, both wasm feature builds, then a visible-browser takeover ->
release -> takeover fight with the worker and port stopped afterward.
