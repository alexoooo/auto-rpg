# Arena 05 -- the hands on the body

**Status:** complete (2026-08-20). Blocks 06.

This is the session `docs/architecture/browser-runtime.md` has been describing in the
negative: *"driving a body from this page is what they are eventually for, and it needs an
input path that exists in no layer."* It builds that layer, and it builds it out of the
pieces that already exist rather than inventing a channel.

## The design, in one paragraph

`crates/policy/src/composition.rs` already merges a human hand and a policy hand into one
command **before** submission, refuses overlapping or missing authority by name at
construction, and has a test proving the result replays with neither party in the room.
`crates/web` already has a validated 61-byte inward command buffer nobody calls. So a
human side is a `ComposedController` in the arena's ordinary policy slot, with a host-fed
source claiming navigation and one arm and the configured policy claiming the other.
`ComposedController` satisfies `Policy` (`composition.rs:181`), which is exactly
what `Arena::policies` holds (`crates/web/src/lib.rs:2303`), so the slot accepts it as-is.

**Navigation authority is not permission to infer navigation from the weapon.** This
session stages `W`/`S` as forward/back, `A`/`D` as sidestep and `Q`/`E` as body turn.
Session 06 stages the primary arm from relative mouse motion. The two meet in the same
whole command only because atomic submission requires it; neither mapping reads the
other's input. This is the control contract the original draft violated when one pointer
both selected `body_yaw` and moved the hand.

**And that is not sufficient on its own, which is the correction this session exists
around.** See the next section before writing any of it.

## The throttle, which has to go first

`advance_arena` asks a policy **only for the bodies in `pending_decisions()`**:

```rust
// crates/web/src/lib.rs:3903-3945
due.clear();
due.extend_from_slice(self.world.pending_decisions());
for &id in &due {
    let obs = self.world.observe(id);
    let side = if live.heroes.contains(&id) { Faction::Heroes } else { Faction::Monsters };
    let command = live.policies[side.index()].decide(&obs);
    let _ = self.world.submit(id, command);
}
```

`pending_decisions` is gated on `next_decision[i] <= tick`
(`crates/sim/src/world/navigation.rs:39`), and `World::submit` pushes
`next_decision[i]` forward by `Stats::decision_period()`
(`crates/sim/src/world/mod.rs:1809`), which reaches **30 ticks** at intellect 0
(`crates/sim/src/rules.rs:1071`). **A `ComposedController` in that slot is therefore
consulted twice a second, and a key press waits up to half a second.** The preregistered
two-tick latency is unreachable by construction, not by tuning.

The every-tick submission is a property of `drive_hero`, and it comes from *where it is
called* rather than from anything inside it: the dungeon branch excludes the driven body
from the pending loop and calls it unconditionally afterwards
(`crates/web/src/lib.rs:3436-3483`). `advance_arena` now has the matching call.

So the first change in this session is the seam, not the composition:

```rust
// crates/web/src/lib.rs, inside advance_arena's tick loop
let driven: [Option<EntityId>; 2] = live.driven_ids();   // human sides only, else None
due.clear();
due.extend_from_slice(self.world.pending_decisions());
for &id in &due {
    if driven.contains(&Some(id)) { continue; }   // answered below, every tick
    // ... unchanged
}
// Every tick, outside the gate, exactly as the dungeon branch drives its hero.
for (side, id) in driven.iter().enumerate().filter_map(|(s, id)| id.map(|i| (s, i))) {
    let obs = self.world.observe(id);
    let command = live.policies[side].decide(&obs);
    let _ = self.world.submit(id, command);
}
```

**An all-policy arena keeps the old path exactly**, which is what lets
`a_live_fight_matches_the_traced_fight` go on passing:
`a_fight_with_no_human_side_takes_the_pending_loop_unchanged` asserts that `driven` is
`[None, None]` and the loop is untouched, and it is the test that stops this change from
quietly re-timing every AI fight in the browser.

**That is why this session does not otherwise copy `drive_hero`**: the call site is worth
copying, the bit-masked in-place overwrite is not.

## What `drive_hero` does and why it is not the model

`crates/web/src/lib.rs:4199-4261`, the dungeon route's human path: cache the policy's whole
command, refresh it on the body's `decision_period`, then overwrite `body_yaw` and
`move_dir` under `CONTROL_FEET` and one `ArmTarget` under `CONTROL_LIMB`, and submit every
tick. It expresses with three bit-masks and an in-place overwrite exactly what
`CommandAuthority` expresses with a construction-time refusal. Bit-masking has no answer to
"both sources wrote the left arm" and no answer to "nobody wrote navigation";
`ComposedController::new` returns `ArmClaimedTwice(LeftArm)` and `NavigationUnclaimed`,
each with an English sentence a test can assert.

**One thing `drive_hero` gets right is kept**: the policy is asked on the body's own
`decision_period` and the human on every tick. Once the throttle above is removed, the
composed controller is asked every tick and so is everything inside it -- and a scripted
policy asked thirty times as often is a *behaviour* change, not a performance one, because
those policies read `obs.tick` and count commit windows.

**`PolicySource` cannot be used here, and the reason is now its absence rather than a
trait bound.** It was generic over `ArticulatedPolicy`, and the embodied topic deleted it
together with that trait. What stands in its place is a tombstone at
`crates/policy/src/composition.rs:191-207`, and the tombstone **pre-rejects reseating it
onto the surviving `Policy` trait** rather than merely recording the removal: *"a source
that returns a `CommandV1` and then has most of it thrown away is a policy driven for one
arm's worth of its answer."* So there is nothing to import and nothing to ask
`crates/policy` to put back, and the off-hand wrapper is one this session writes, for two
independent reasons, and either alone would be enough:

```rust
// crates/web/src/lib.rs -- host-side, deliberately not in crates/policy.
//
// **Where this lives is an argument and not an accident.** The cadence is the
// host's decision about *when to ask*, not the policy's about *what to decide*,
// and this topic promised `crates/policy` would not be edited. A wrapper here
// keeps that promise and keeps the pin argument simple: nothing `lab` or `sim`
// folds can reach a type the browser crate defines.
struct CadencedEmbodiedSource {
    inner: Box<dyn Policy>,
    authority: CommandAuthority,
    /// The last whole command the policy produced, re-read on the ticks between
    /// its decisions. `drive_hero` caches for this reason and it is the reason.
    cached: Option<CommandV1>,
    next_decision: u32,
}
```

**It copies the off arm's `swing_plane` rather than zeroing it**, and that is the one place
it must *not* follow the adapter it is otherwise modelled on. What `PolicySource` did
survives as `GuardTheOffHand`, the documented four-line replacement at
`crates/policy/tests/composition.rs:75-110` -- *"this was `policy::PolicySource`, and it is
four lines here instead"* -- and it writes `into.swing_plane[slot] = Angle::ZERO;` at
`crates/policy/tests/composition.rs:106`. Its comment says why: the plane is the one field
`CommandAuthority` does not divide, so the arm's owner has to claim it explicitly, and the
articulated command that adapter narrowed had no plane to give. A `CommandV1` has the
field and an embodied off hand fills it, so zeroing here would silently flatten the off
hand's elbow. `the_off_hand_keeps_the_swing_plane_its_policy_asked_for` is what says so,
and it fails against a wrapper that copied `GuardTheOffHand` line for line.

## The composition, assembled at `arena_start`

Authority is a property of the **configuration**, not of the frame, which is what lets
`ComposedController::new` do its job once instead of per tick.

```rust
// crates/web/src/lib.rs, inside arena_start's construction of `Arena::policies`
let policy = kind.build();
let controller: Box<dyn Policy> = match control {
    ARENA_CONTROL_POLICY => policy,
    ARENA_CONTROL_HUMAN => {
        // Which arm the hand at the keyboard owns is decided here, from the
        // loadout, and then never changes. `ArmRoles::of` answers "which hand is
        // the weapon" per observation and *can* change mid-fight when an arm
        // comes off -- which is exactly why it is not consulted here. Authority
        // that moved during a fight would be a `ComposedController` that has to
        // be rebuilt mid-tick, and a player whose sword hand was severed keeping
        // authority over a stump is the honest behaviour: the arm is theirs and
        // it does nothing.
        let human_arm = primary_arm_of(&fighter);   // the strike hand, else RightArm
        let off_arm = other(human_arm);
        ComposedController::new(vec![
            Box::new(HostSource::new(faction, CommandAuthority {
                navigation: true,
                arms: authority_for(human_arm),
            })),
            Box::new(CadencedEmbodiedSource::new(policy, CommandAuthority::arm(off_arm))),
        ])
        // **An assert, not a refusal, and the distinction is the point.** The two
        // authorities above are disjoint and total by construction -- navigation
        // once, each arm exactly once -- so `new` cannot fail here for any
        // configuration this page can produce. A refusal code with no reachable
        // producer is what `ARENA_POLICY_UNAVAILABLE` and `ARENA_NO_CHECKPOINT`
        // were retired for. The sentence still travels, in the panic message, and
        // it is the same shape `crates/policy/tests/composition.rs:119` uses.
        //
        // If a later control mode makes it reachable -- two humans, or an arm
        // handed over mid-fight -- that is the session that adds the code.
        .expect("navigation and both arms claimed exactly once")
    }
    _ => return submit_result(0, ARENA_UNKNOWN_CONTROL, 0, faction as u8),
};
```

`ARENA_CONTROL_UNAVAILABLE` (29) is **retired from `arena_start`**, not renumbered: the
code stays spent for the reason `ARENA_POLICY_UNAVAILABLE` and `ARENA_NO_CHECKPOINT`
are already spent. Review corrected the earlier blanket "no new refusal" claim:
staging has two actionable target failures which did not exist in session 02, so reason
30, `ARENA_INPUT_REFUSED`, is appended. Its named detail bytes are `1` for an unknown
faction, `2` for a valid policy-controlled side, and `3` for no installed arena.
Faction decoding is strict -- only `0` and `1` reach a side -- rather than reusing the
older helper whose contract maps every nonzero value to Monsters. `ARENA_REASONS`, the
client refusal table, and the structural Rust/client mirror therefore all widen by one.

**Nothing but four bytes crosses this boundary.** `submit_result(outcome, reason, detail,
slot)` (`crates/web/src/lib.rs:6427`) packs four `u8`s into a `u32`, and `install_arena`
returns `Result<(), ArenaRefusal>` where `ArenaRefusal` is `{ reason, fighter, slot }`
(`:7230`). The client renders every sentence itself from its mirrored `ARENA_REFUSALS`
table. So a plan that says a refusal "carries the message verbatim" is describing a
channel that does not exist -- if a future refusal needs to distinguish six causes, the
free `detail` byte carries the discriminant and the client mirrors six sentences.

## Staging a frame of input

One new export. It writes no world state and steps nothing.

```rust
/// Copies the 61-byte [`EMBODIED_COMMAND`] buffer into one side's staged input.
///
/// **A whole command, of which only the authorised fields are read.** The host
/// writes neutral values into the fields it does not own, and validation stays
/// atomic -- which is the property `composition.rs`'s header refuses to give up
/// in its first paragraph. A narrower export taking eight integers was the
/// alternative and it loses twice: it would need a second envelope, a second
/// layout version and a second set of range refusals, all of which this buffer
/// already has and already tests.
///
/// Returns `submit_result`'s packed word. Refuses an unknown layout, a wrong
/// kind byte, an out-of-range field, and a faction that is not human-controlled
/// -- the last one by name, because "this side is driven by a policy" is a
/// sentence a caller can act on.
#[no_mangle]
pub extern "C" fn arena_stage_input(faction_code: u32) -> u32 { ... }
```

The staged frame carries a **tick stamp**, and `HostSource::contribute` re-uses it for at
most `CONTROL_INPUT_MAX_HOLD_TICKS`:

```rust
/// How long a staged frame is re-used when the page misses one.
///
/// **Bounded from both sides.** At 1 a single dropped display frame stops the
/// body dead mid-stride, which reads as input loss rather than as a dropped
/// frame. At 60 a player who tabs away keeps walking for a second after they
/// stop looking. Six is a tenth of a second: longer than any single missed frame
/// at 60 Hz and shorter than a reaction.
///
/// `the_input_hold_is_bounded_from_both_sides` asserts both ends, and
/// `a_held_input_expires_to_neutral_rather_than_to_its_last_value` asserts what
/// happens after -- it decays to the neutral command, not to whatever was last
/// pressed, because a body that keeps swinging because the tab lost focus is
/// the worse of the two failures.
const CONTROL_INPUT_MAX_HOLD_TICKS: u32 = 6;
```

Two implementation corrections are load-bearing. `HostSource` claims the primary arm
but leaves it at `ComposedController`'s observation-relative neutral value until session
06; copying the host buffer's zero placeholder would invent a world target. And the
composition is assembled only after the fresh `World` exists, so
`CadencedEmbodiedSource` receives the constructed body's exact `decision_period` rather
than a second anatomy-derived estimate.

## The drive stops running ahead, without becoming refresh-rate physics

Today's spectator drive produces as fast as it can. A controlled fight cannot: **the worker
must not simulate tick N+1 before it has the input selected for tick N.** That is the
whole reason session 01 came first.

The first draft got the next sentence wrong. It said one simulation tick per input frame,
then made an input frame in `requestAnimationFrame`. That makes wall-clock combat depend
on the monitor: 144 ticks per second at 144 Hz, 30 at 30 Hz. The controlled drive instead
uses the same fixed-time argument as the arena playhead at `client/src/arena/arena.ts:1036`:

```ts
// client/src/arena/controlled-clock.ts -- pure scheduling, no DOM and no wasm.
// TICKS_PER_SECOND comes from protocol/messages.ts; there is no second 60.
advance(nowMs: number): number {
  if (this.paused) return 0;
  this.tickCarry += Math.min(nowMs - this.lastMs, MAX_ELAPSED_MS)
      * TICKS_PER_SECOND / 1_000;
  const due = Math.floor(this.tickCarry);
  this.tickCarry -= due;
  return due;
}
```

The rAF samples the current keys and host arm target for presentation. The clock answers
how many authoritative ticks elapsed. At 120 or 144 Hz some frames owe no tick; at 30 Hz
a frame normally owes two. The studio sends one request with `ticksDue: 1`, waits for its
acknowledgement, samples the next yaw/command, and recursively drains the remaining
backlog. The worker retains bounded batch support as a defensive transport contract and
still calls `step(1)`, captures and posts separately for every tick because
`combat_event_len` clears per host call. **No tick is coalesced and no simulation step is
tied one-for-one to a display frame.** While one request is in flight elapsed time remains
queued transactionally; the exact stepped-count acknowledgement commits it.

```ts
// client/src/runtime/arena-recorder.ts -- the controlled path beside the spectator path.
onArenaInput(message) {
  wasm.writeEmbodiedCommand(message.bytes);
  const staged = wasm.stageInput(message.faction);
  if (!staged) return refuse(staged);
  let steppedTicks = 0;
  for (let tick = 0; tick < message.ticksDue; tick += 1) {
    const before = wasm.tick();
    wasm.step();
    if (wasm.tick() === before) break;
    steppedTicks += 1;
    await postChunk(captureOneFrame()); // one publication and backpressure per tick
  }
  postInputAck(message.requestId, steppedTicks);
}
```

**Blur, `visibilitychange` to hidden, pointer-lock loss and pause are stops, not long
frames.** Each clears every held key and the primary-button level, stages one neutral
navigation frame, resets the accumulator and waits for a fresh user gesture. Returning to
the tab cannot spend the hidden interval as a catch-up burst, and losing pointer lock
cannot leave a body walking or a cut powered.

**Controlled chunks use a fixed credit window with backpressure and never coalesce**, and that is
the one place this path must differ from `FixedBufferPool`. Coalescing -- dropping a
publication when no buffer is free -- is correct for a 60 Hz spectator view and is silent
data loss for a fight somebody is in: the dropped tick is a tick of *their* fight.
`ARENA_CONTROLLED_CHUNK_CREDITS` is 3. Controlled chunks are newly allocated exact copies
with at most three unacknowledged until the main thread returns a lightweight
`arenaChunkAck`; the separate
batch `arenaInputAck` commits clock time only after every tick was posted. Running out
means the display is behind, which is precisely when the fight should wait for the player.
Reusable returned buffers remain a performance optimization rather than a shipped claim.

The message re-entrancy this depends on already works and is worth knowing rather than
discovering: `yieldToMessages` is `setTimeout(resolve, 0)` -- a **macrotask**, and
`sim-worker-host.ts:266-269` says explicitly why a microtask would not do -- so a queued
message is dispatched into a re-entrant `handle()` while the outer one is suspended.
`arenaCancel` already relies on it in production.

## The stance the HUD needs comes across here, not in 07

`embodied_stance_ptr`/`_len` (`crates/web/src/lib.rs:7412-7422`) publishes the twist,
pelvis and step fractions and **no client module reads it**. The twist fraction is what
says *"you are about to be forced to step"*. Keyboard turning and a weapon physically
carried by the shoulder make that something the player feels, so it belongs on their HUD,
and session 07 is where it is drawn.

**Getting it there is transport work and it lands in this session**, because this is the
session already widening the transport. It is not free: `ARENA_EXPORTS` and the
`ArenaExports` interface (`client/src/runtime/arena-recorder.ts:224-269`) name no stance
export, the recording formerly allocated six buffers with no stance among them, and
`RECORDING_INDEX_STRIDE` was **9** with no stance start or count. A seventh buffer and
two more index words move the chunk contract, which is exactly the kind of
change a documents-and-HUD session budgets no time for. Doing it here keeps session 07
honest about its own claim that nothing moves.

## The keyboard turns the body; the pointer does not

The mapping this session lands is the movement half; session 06 owns every mouse-to-arm
decision.

| input | field | frame |
|---|---|---|
| `W`/`S` | `move_dir.x` | torso: `+x` is forward at every yaw |
| `A`/`D` | `move_dir.y` | torso: `+y` is body-left; these are sidesteps, not turns |
| `Q`/`E` | `body_yaw` | latest published torso yaw plus or minus a bounded lead |
| relative pointer motion | **none in this session** | reserved exclusively for the primary arm in 06 |
| the opponent, while any body or arm input is live | `intent` | `Attack(id)`; `Hold` otherwise |

`Q`/`E` command a yaw target; they do not write angular speed into the simulator, because
no such command exists. Every freshly sampled authoritative tick starts from the latest
published Human torso yaw. A held key offsets that achieved heading by the provisional
`BODY_TURN_INPUT_LEAD_RAW = 8_192`, mirrored from Rust's measured standing
`PLAYER_TURN_LEAD_RAW`; with neither held, the target is the published yaw exactly. This
closed loop prevents a released turn target from continuing to steer W/A movement while
the torso catches up. Session 07 owns visible-browser calibration of the shared lead and
its feel; session 05 proves deterministic feedback and Q/E separation across refresh
schedules.

An embodied torso may only turn `STANCE_TWIST_LIMIT_RAW` -- a sixth of a turn -- away from
its hips before the legs are forced to move, and a forced step costs
`STANCE_STEP_MOVE_AUTHORITY_RAW` of movement authority for `STANCE_STEP_TICKS`. That
mechanic remains visible: turning the body carries the shoulder and eventually steps the
feet. What is removed is the hidden second author of that turn. A left-to-right weapon
gesture changes no navigation byte and no yaw byte.

This is the standard movement split: forward/back on `W`/`S`, strafe on `A`/`D`, body
turn on `Q`/`E`, and the weapon arm reserved for the mouse. The separation still matters:
the same mouse delta never steers both torso and sword.

## Replay, which is the acceptance

ADR 0002 records submitted decisions rather than re-running inference, and
`crates/policy/tests/composition.rs:125` already proves a composed fight replays. This
session earns the same claim through the browser crate's own path:

```rust
#[test]
fn a_human_driven_arena_fight_replays_from_its_recorded_commands() {
    // Drive `arena_start` + `arena_stage_input` + `step(1)` for 600 ticks from a
    // scripted input stream that is not a policy. Record every stored command.
    // Then build a fresh World from the same scenario and seed, submit the
    // recorded commands, and compare `state_digest`.
}
```

**A browser-side replay recorder is not in this session, and that is a scope decision
rather than an oversight.** It needs an export, a codec write path and somewhere to put
the bytes, and `docs/architecture/policy.md:501` already records that a recorder for
browser fights is owed. What this session owes is the *property*, and a Rust test carries
it.

## What this session must not change

- **`World::submit`'s validation, or its neutral substitute.** Atomic on purpose.
- **Any policy's decisions.** `CadencedEmbodiedSource` changes when a policy is asked and
  nothing about what it answers; `a_cadenced_source_asks_its_policy_on_exactly_the_ticks_the_runner_would`
  is what says so.
- **`Scenario::fingerprint`.** Session 02 already asserts the control byte does not reach
  it; this session must keep that true when the composition is built.
- **The spectator drive.** An unattended AI fight takes the session 01 path unchanged, and
  `a_live_fight_matches_the_traced_fight` still holds.
- **`crates/policy` and `crates/sim`.** Not one line. If this session finds it needs one,
  that is a finding worth stopping for, not a small edit.

## Files

| file | change |
|---|---|
| `crates/web/src/lib.rs` | the `driven` seam in `advance_arena`; `HostSource`, `CadencedEmbodiedSource`, the staged-input slot, `arena_stage_input`, `arena_start`'s composition branch. **Re-anchor `browser-runtime.md:492-494` to `lib.rs:1850`, `:4712`, and `:5788` in the same change** |
| `client/src/protocol/messages.ts` | `ArenaInputMessage` and its V1 refusal sentence |
| `client/src/runtime/sim-worker-host.ts` | **the dispatch, and it is not optional.** `arenaStart` and `arenaCancel` are matched *above* the session guard at `:148-155`; anything else reaching an arena session is answered `alreadyInitialized`. `arenaInput` goes above that line or it is refused. `arenaStart` also awaits `recordArenaFight` to completion and clears `arenaRequestId` in a `finally` at `:289`, so a drive that steps inside the input handler restructures that lifetime |
| `client/src/runtime/arena-recorder.ts` | the controlled drive; the stance section below; `ARENA_EXPORTS` gains `arena_stage_input`, `embodied_command_ptr`, `embodied_command_len`, `embodied_command_layout_version`, `embodied_stance_ptr`, `embodied_stance_len` |
| `client/src/runtime/arena-client.ts` | `input()`, and the decode for the new kind |
| `client/src/runtime/arena-config.ts` | reason 30 and its three detail sentences; reason 29 remains retired |
| `client/src/arena/picker.ts` | Human preflight and the shared strike-hand rule |
| `client/src/arena/controlled-clock.ts` | new: the pure 60 Hz accumulator, one in-flight tick and stop/reset semantics; imports `TICKS_PER_SECOND` rather than spelling `60` |
| `client/src/arena/arena-input.ts` | new: keyboard body state and the 61-byte command encoder; the arm remains a neutral placeholder until 06 |
| `client/src/arena/arena.ts` | the controlled phase; rAF samples and drains one acknowledged tick at a time; blur/hidden/pause/pointer-lock loss clear it; follow defaults to the human side |
| `client/src/fight/source.ts` | live-only optional stance data without widening trace JSON |
| `client/src/fight/live.ts` | eleven-word index and full generational stance join |
| `client/test/worker-protocol.test.mjs` | clock, batching, credit ownership, stream layout, stance identity and refusal behavior |
| `client/test/studio-shell.test.mjs` | actual DOM input wiring, stops, pause and default Human follow |
| `client/test/arena-stream.test.mjs` | the spectator fixture's seventh stance buffer and the terminal malformed-V2 behavior |
| `tools/wasm_check.js` | native/wasm mirrors for staged input, refusal details and the stance publication |
| `web/index.html` | the honest session-05 Human-control label in the static shell contract |
| `docs/reference/embodied-command-v1.md` | the host-staged path beside the submitted one |
| `docs/reference/worker-protocol.md` | the input message and the controlled drive |
| `docs/architecture/policy.md` | composition reaching a host, and the browser recorder still owed |
| `docs/architecture/browser-runtime.md` | the sentence about an input path that exists in no layer stops being true; **rewrite it rather than deleting it**, because it is a good record of a constraint that was real |

## Tests

`crates/web`:
- `a_human_driven_arena_fight_replays_from_its_recorded_commands`
- `a_human_side_is_submitted_on_every_tick_rather_than_on_its_decision_period` -- the
  throttle, and the one this session turns on
- `a_fight_with_no_human_side_takes_the_pending_loop_unchanged`
- `a_side_that_is_not_human_refuses_a_staged_frame_by_name`
- `a_cadenced_source_asks_its_policy_on_exactly_the_ticks_the_runner_would`
- `the_off_hand_keeps_the_swing_plane_its_policy_asked_for`
- `the_input_hold_is_bounded_from_both_sides`
- `a_held_input_expires_to_neutral_rather_than_to_its_last_value`
- `forward_input_without_turn_holds_heading_and_does_not_swerve` -- 120 Human
  host-source ticks with tactical off hand retain the exact initial heading and zero
  cross-track displacement
- `the_arena_fingerprint_does_not_change_when_a_side_is_handed_to_a_human`

`tools/wasm_check.js`: `arena_stage_input` must answer identically on both targets, and a
staged frame must move a pose word -- the same shape as the sweep that already asserts a
registered policy code installs, reads back and moves one.

`client/test/worker-protocol.test.mjs`:
- `an_arena_input_is_refused_at_v1_by_name`
- `the_controlled_drive_stalls_rather_than_dropping_a_tick_when_no_buffer_is_free`
- `a_missed_input_frame_holds_and_then_expires`
- `sixty_one_hundred_twenty_and_one_hundred_forty_four_hertz_each_advance_sixty_ticks_in_one_second`
- `a_hidden_interval_is_cleared_and_not_replayed_as_catch_up`
- `only_one_controlled_tick_is_in_flight`
- `the_client_body_turn_lead_mirrors_the_authoritative_rust_host_lead`
- `a_stance_is_joined_by_full_generational_identity`
- `an_unknown_arena_stream_layout_is_refused_before_a_chunk`

`client/test/studio-shell.test.mjs`:
- `key_down_reaches_the_simulation_within_two_ticks`
- `w_and_s_move_in_the_torsos_forward_axis`
- `a_and_d_strafe_while_q_and_e_turn_the_body`
- `released_turn_rebases_w_and_a_only_commands_on_the_latest_published_yaw`
- `mouse_motion_changes_no_navigation_or_body_yaw_byte`
- `blur_visibility_pause_and_pointer_lock_loss_clear_every_held_input`
- `space_pauses_a_fight_that_is_still_being_produced`
- `the_camera_follows_the_human_side_by_default`

## Acceptance

1. A side set to **you** is driven by the keyboard; its primary arm slot is reserved for
   session 06 and its off hand is driven by the policy its own byte names, on that
   policy's own cadence.
2. Key-down reaches the simulation within two ticks.
3. Display schedules at 60, 120 and 144 Hz each produce exactly sixty simulation ticks
   over one visible second; hidden time produces none and is not caught up.
4. Mouse motion alone changes neither `move_dir` nor `body_yaw`; `A`/`D` sidestep and
   `Q`/`E` turn by distinct tests.
5. A human-driven fight replays from its recorded commands to the same `state_digest`.
6. Every staged frame either takes effect or is refused by name.
7. The unattended AI fight is unchanged, and still matches `lab trace`.
8. Forward input without turn holds exact heading and zero cross-track displacement for
   120 ticks even while the tactical off hand is active.
9. After a lagging achieved turn is published, releasing `Q`/`E` and holding either
   forward or strafe submits that achieved yaw, never the stale commanded lead.

## Hash expectations

**The host-boundary implementation moved no pin.** The later direct-control diagnosis did
find a global simulator defect in the same session: `drive_stance` treated body-relative
movement as a second hip-yaw authority. Correcting hips to chase achieved torso yaw moves
three pin families, in both feature sets, while leaving every ABI/layout version and both
arena fingerprints unchanged:

- `ARTICULATED_STREAM_DIGEST`: `0x63bf8b26809d43c4` default,
  `0x8c8a5e4350230df6` exact;
- `EMBODIED_CORPUS_DIGEST`: `0xfa4ebbfbdde42fd1` default,
  `0x93384862586e6027` exact;
- `EMBODIED_GOLDEN_DIGEST`: `0x029fcc4140715db3` default,
  `0x5812adb7a1d6a354` exact.

The golden fixture first diverges on tick 1: achieved yaw 91 round-trips through the old
fixed-point movement vector as angle 94. That measured route, plus the W/S/A/D mutation
test, is why these are mechanics re-records rather than host composition leaking into an
unattended fight.

## Verification

The full gate. Both wasm artifacts, both feature sets.

```powershell
cargo test
cargo test -p sim -p lab --features cartesian-recoil
cargo build --release
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
cargo build --release --target wasm32-unknown-unknown -p web --features cartesian-recoil
$env:ARPG_CARTESIAN_RECOIL=1; node --test tools/wasm_check.js
cargo run --release -p lab -- embodied --corpus-digest
cargo run --release -p lab -- verify --seeds 200
node --test "client/test/*.test.mjs"
npm run check
npm run check:abi
node tools/check_docs.js
node tools/check_deps.js
node --test tools/check_deps.test.js
npm run dev        # foreground: take a side, walk/turn/sidestep, verify display Hz does not set fight speed, then stop it
```
