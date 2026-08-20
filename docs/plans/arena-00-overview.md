# The arena you can fight in -- overview

**Status:** in progress. Sessions 01 through 05 are complete; session 06 is next. The
topic opened after the embodied fight's session 07 closed and its plan files were deleted.

The goal, in the owner's words on 2026-08-19: **pick two units side by side with a 3D
view of each, press Fight, watch the fight happen rather than watch a recording of it,
and be able to take one of the two bodies over -- WASD, the mouse pointing the primary
attack, the swing steered by click-and-drag the way Die by the Sword steered one, the
camera following the body you are in and able to zoom into it. Basically I want to fight
in the arena, see how well it controls.**

That last sentence is the acceptance, and it is a person's judgement rather than a
corpus. Everything below exists to get a keyboard in front of that judgement as cheaply
as the repository's own rules allow.

A follow-up the same day, after review, named the verb the first cut mapping could not
express: the source material had an **extend** action beside the swing, and a
two-dimensional pointer names two degrees of freedom where the hand target has three, so
the third is a gesture of its own -- hold secondary, or a two-finger drag on touch --
carried by session 06. The bar it answers to is also the owner's: **smooth control from
the 3/4 view and from first person is the primary focus, one scheme meaning the same
thing in both.**

**"The mouse steers the sword" means the sword and not the body.** The first draft of
this plan made one pointer position set both `body_yaw` and the primary arm. That coupled
two decisions the source material kept separate: a lateral cut also turned the torso,
changed the arm's own reference frame and eventually forced a step. It could produce an
interesting fight, but not the independent, improvisational weapon hand the goal names.
This revision makes the separation an acceptance invariant: keyboard input owns
locomotion and body yaw; relative mouse motion owns the virtual weapon hand; camera
gestures own neither. Turning the body may physically carry the shoulder and weapon, but
moving the weapon may never submit a body turn.

## What already exists, measured before this plan was written

**This topic is mostly wiring, and saying so up front is what keeps it from being planned
as though it were invention.** Five facts, each checked in the tree at `b0fc80a` and
re-checked with every path, line and name in this plan set at `81bdf6f`:

- **The composition seam is built, tested, and proven replayable.**
  `crates/policy/src/composition.rs` opens with the sentence *"One hand human, one hand
  AI, merged **before** submission."* It carries
  `CommandAuthority { navigation, arms: [bool; 2] }`, a `PartialCommandSource` trait, and
  a `ComposedController` that **refuses overlapping or missing authority by name at
  construction** and satisfies `Policy`, which is exactly the type
  `Arena::policies` holds (`crates/web/src/lib.rs:2034`).
  `crates/policy/tests/composition.rs` proves the property this whole topic depends on --
  `a_replay_of_a_composed_fight_needs_neither_the_human_nor_the_policy` -- and its
  stand-in for browser input is a struct called `HandOnTheControls` claiming
  `{ navigation: true, arms: [false, true] }`. **Nothing in `crates/web` constructs one.**

  **One piece of that seam is not missing but deleted, and it is worth knowing before
  session 05 opens.** `PolicySource` -- the wrapper that turned a whole policy into a
  partial source -- went with the `ArticulatedPolicy` trait it was generic over.
  `composition.rs:191-207` is the tombstone, and it does more than record the deletion:
  it **pre-rejects reseating the wrapper onto the surviving `Policy` trait**, on the
  grounds that *"a source that returns a `CommandV1` and then has most of it thrown away
  is a policy driven for one arm's worth of its answer."* So the off-hand wrapper is one
  the browser crate writes rather than one it imports -- the same conclusion this plan
  reached when the obstacle was two disjoint traits, now reached for a stronger reason:
  there is nothing to import, and `crates/policy` has already argued in-tree against
  putting one back. What to copy is `GuardTheOffHand`, the documented four-line
  replacement at `crates/policy/tests/composition.rs:75-110`. **Copy its shape and not
  its plane**: it writes `swing_plane[slot] = Angle::ZERO`
  (`crates/policy/tests/composition.rs:106`) because the arm's owner has to claim the
  plane explicitly and the articulated command it stood in for had none to give -- and an
  embodied off hand **does** have one, so the wrapper copies it rather than zeroing it.
- **The command already has the vocabulary a drag needs, but that does not choose the
  mapping.**
  `ArmTarget { bearing, height, reach, effort }` per arm, plus `swing_plane: [Angle; 2]`
  -- an elbow plane about the shoulder-to-hand axis, per arm, with no structural check on
  it by design (`no_swing_plane_is_structurally_illegal`). A virtual hand gives bearing,
  height and reach; its path gives the cut; a drag projected perpendicular to the
  shoulder-to-hand axis gives a signed elbow plane; and effort decides how much
  acceleration the actuator may spend following that path. That is the whole command
  vocabulary a Die-by-the-Sword mapping needs and not one byte has to be invented. The
  client mapping still has to preserve those meanings rather than using one mouse speed
  twice.
- **The byte boundary exists and no client module touches it.** `embodied_command_ptr()`,
  `embodied_command_len()` -- 61, a four-byte envelope over the 57-byte payload --
  `embodied_command_layout_version()` (2) and
  `submit_embodied(entity_index, entity_generation)` at `crates/web/src/lib.rs:6033-6117`,
  already validating and already refusing by name. `grep -rn "embodied" client/src/`
  returns comments and a policy-name mirror, and no call.
- **A human already drives a body on the other route, badly.** `Sim::drive_hero` at
  `crates/web/src/lib.rs:3891` overwrites `body_yaw`, `move_dir` and one `ArmTarget` on
  top of a cached policy command. It is the shape of the thing rather than the thing: the
  combat **height is hard-wired to `MID` at every bearing**, the **swing plane stays the
  policy's**, `effort` is two constants borrowed from `ScriptedPolicy` -- a half
  guarding and a whole striking -- and `Strike::Widdershins`/`Sunwise` are inert because
  an embodied arm has no swing-side verb. `reach` is the only one of the four that is
  already host input, and only while guarding (`lib.rs:3948`). Those omissions are
  session 06's subject.
- **`#/arena` is a spectator by construction, and the architecture document already names
  what is missing.** From
  [browser runtime](../architecture/browser-runtime.md#the-arenas-two-dresses):
  *"nothing on the page drives a body... The two eye-height cameras are there anyway.
  They exist because the design target the off-arm decision was made against is
  first-person human control of a single hero rather than a spectator's camera... so
  driving a body from this page is what they are eventually for, and it needs an input
  path that exists in no layer."*

`DESIGN.md`'s agent boundary decided the shape of the answer before any of the above was
written: *"Human input deliberately uses that same submission boundary rather than a
privileged simulation channel."* This topic does not get to relitigate that.

## The four things that are actually missing

1. **The fight is produced before it is watched.** `arenaStart` drives the whole duel to
   completion inside the worker -- `step(1)` per tick, yielded every
   `RECORDING_CHUNK_TICKS` = 300 only so that cancel has a window -- and then transfers
   six `ArrayBuffer`s as one `fightRecording`. The page scrubs what is finished. **On the
   pairing the picker actually opens on that is 0.67 to 0.94 s of staring at a status
   line**: `arena-recorder.ts:104-116` measures 9,000 to 10,000 ticks a second for one
   pairing and then says outright that *"that rate is one pairing's, and it is not the one
   the picker opens on"* -- the slowest of the four runs at 3,816 to 5,349. The bigger win
   is still that **the transport stops assuming the fight is over**, which is the
   precondition for a hand being on it.
2. **Nothing carries a human's authority into an arena world.** `Sim::advance_arena` never
   consults `self.control`, `set_policy` deliberately answers `0` while an arena is
   installed, and `ARENA_EXPORTS` in `client/src/runtime/arena-recorder.ts:251` lists
   neither `set_control` nor `set_input` -- correctly, because those are the legacy
   vocabulary and the wrong ones to widen.
3. **The arena has no camera a person can move, and no view of the unit being picked.**
   Three `FreeCamera`s in fixed viewports, placed by a pure function per frame, no easing,
   no tracking, `attachControl` never called, no zoom -- the Span slider reframes all five
   panels together because it is a *framing* control, not a camera. And
   `client/src/arena/picker.ts` is a loadout validator with no Babylon import at all;
   there is no single-character preview anywhere in `client/src`.
4. **There is no control contract.** The dungeon route proves that keys can become a
   command, but it does not separate body and weapon authority, capture relative pointer
   motion, define what happens at a viewport edge, preserve a held guard while the camera
   moves, or say whether a 144 Hz display runs the simulation faster than a 60 Hz one.
   Those are not polish. They decide whether the player is puppeteering a weapon or
   dragging a cursor that happens to animate one.

## The ordering trap, which is the whole of the plan's shape

**A hand on the controls is untestable until the fight waits for it.** If the input path
lands before the drive is paced, every key press arrives at a fight that finished before
the first frame was drawn. So the drive comes first and the hands come fifth.

**Paced means the simulation's 60 Hz, not the display's refresh rate.** The first draft
said "one tick per input frame" and made the input frame in `requestAnimationFrame`.
Taken literally, that makes a 144 Hz monitor run the fight at 2.4x and a 30 Hz monitor at
half speed. Session 05 reuses the accumulator rule the arena playhead already has:
display frames sample input, but elapsed wall time schedules exactly
`TICKS_PER_SECOND = 60` simulation ticks. A 120/144 Hz display therefore has frames with
no step, a 30 Hz display may owe two steps carrying the same sampled state, and a hidden
or blurred page pauses and clears rather than accumulating a burst.

Two more, each with a named failure mode already on record here:

- **A control the config cannot carry must refuse by name, not shrug.** Session 02 puts a
  "who drives this side" choice on screen and session 05 is what makes it act. Between
  them the choice must come back as a named refusal -- `ARENA_CONTROL_UNAVAILABLE` -- for
  exactly the reason `ARENA_POLICY_UNAVAILABLE` already exists. Two consecutive reviews
  found ten instances of a control accepting an input it could not act on and saying
  nothing. This is the eleventh unless it is planned as a refusal.
- **`Scenario::fingerprint` must not learn who is driving.** Control is a host concern. If
  a control byte reaches `Scenario`, the human fight and the AI fight at the same seed
  stop being the same fixture, and the comparison this topic exists to make -- *can I do
  better than `tactical`?* -- becomes uncomparable. `duel_from(&DuelConfigV1)` reads
  anatomy, hands, spawn and `max_ticks`, and must keep reading exactly those.

## The throttle that has to be removed before a hand can be felt

**`advance_arena` asks a policy only for the bodies in `pending_decisions()`**
(`crates/web/src/lib.rs:3615-3626`), and `World::submit` pushes
`next_decision[i]` forward by `Stats::decision_period()`, which reaches **30 ticks** at
intellect 0 (`crates/sim/src/rules.rs:1071`). So a `ComposedController` dropped into the
arena's ordinary policy slot **is consulted twice a second**, and a player's key press
waits up to half a second for a slot it does not own.

This is the correction that matters most in the whole plan, and it was got wrong once
already: the every-tick submission is a property of **`drive_hero`**, which the dungeon
branch calls *outside* the pending loop (`lib.rs:3195-3199`, `:3962`) precisely so that
`next_decision` stays permanently ahead of `tick`. The arena has no such call. **Session
05 has to build one**, or the preregistered two-tick latency below is unreachable by
construction rather than by tuning.

Once it is built, the asymmetry the heading names comes with it: a human submits every
tick and a policy every `decision_period`, so a human hand feels sharper than a policy by
half a second of reaction time before any skill is involved.

The plan's position: **keep it, and write it down.** A hand at 60 Hz that only registers
every thirtieth tick is not a control scheme, it is a complaint. But session 07 records
the asymmetry beside its result, because "the human beat `tactical`" is not evidence about
aiming if the human decided thirty times as often. The honest control is the same recorded
input replayed against the same policy, which session 05's replay makes free.

## Session order

| session | lands | depends on |
|---|---|---|
| [01](arena-01-the-fight-you-watch-while-it-happens.md) | the worker streams the fight as it produces it; `#/arena` draws frame 0 before tick 3,600 exists; a fight in progress reports no outcome instead of inventing one | none |
| [02](arena-02-two-sides-side-by-side.md) | the split-screen selection screen, left A against right B; `control` per side carried through the config and refused by name until 05 | none; 01 is independent |
| [03](arena-03-a-body-you-can-look-at.md) | a 3D view of each side's unit on the selection screen, driven by that side's anatomy and hands | 02 |
| [04](arena-04-the-camera-that-follows.md) | the arena gets a camera a person owns: follow, orbit, and a zoom that closes to a face | 01 |
| [05](arena-05-the-hands-on-the-body.md) | the input path that exists in no layer: `ComposedController`, every-tick human submission on a fixed 60 Hz clock, independent keyboard body control, focus safety, and a replay that reproduces a human fight | 01, 02, 04 |
| [06](arena-06-the-blow-you-aim.md) | relative pointer motion owns a virtual weapon hand: a stable guard, primary-drag cuts, a secondary-drag extension that makes the thrust reachable in first person, explicit height/reach/elbow-plane mapping and effort with a nonzero moving floor | 05 |
| [07](arena-07-the-hand-is-yours.md) | the control lab: reticle and commanded-versus-achieved feedback, repeatable guards and named cuts against `neutral`, refresh-rate equivalence, and the owner's first tuning pass | 06 |
| [08](arena-08-the-feel-and-the-close.md) | the full fight against `tactical`, the owner's judgement at a foreground browser, the durable documents, and this plan set deleted | 07 |

Sessions 01 and 02 are independent and either may go first. 03 needs 02's per-side model;
04 needs 01's live source to have something to follow. Everything from 05 on is serial.

## Constants introduced

Named here so a later session cannot quietly invent a second spelling. **Every value is a
placeholder until the session that owns it produces a measurement, and the repository rule
that a constant carries its provenance -- and a test that bounds it from both sides --
applies to all of them.**

```text
ARENA_STREAM_CHUNK_TICKS        30   01; ticks per streamed chunk on the spectator drive.
                                     Bounded both ways: at 1 the fight pays a postMessage
                                     and seven allocations per tick; at 300 -- today's
                                     RECORDING_CHUNK_TICKS -- the first frame is five
                                     seconds of fight late at 1x
ARENA_STREAM_LEAD_TICKS         15   01; how far production must lead the displayed frame
                                     before playback starts or resumes. At 0 playback
                                     stalls at every chunk boundary; at a whole chunk it
                                     is the old wait in smaller units
ARENA_CONTROLLED_CHUNK_CREDITS   3   05; controlled chunks allowed in flight. Exact chunk
                                     copies are allocated per tick and retained by the
                                     recording; credits add lossless backpressure without
                                     claiming a reusable worker buffer pool
ARENA_FIGHTER_CONTROL            2   02; the config byte, taking the first of the two
                                     bytes ARENA_FIGHTER_RESERVED holds. A byte that stops
                                     being reserved is a layout change, not a free bit
ARENA_CONTROL_POLICY             0   02; this side is decided entirely by its policy byte
ARENA_CONTROL_HUMAN              1   02; this side's navigation and primary arm come from
                                     the host; its policy byte still drives the off hand
ARENA_UNKNOWN_CONTROL           28   02; the control byte is neither of those
ARENA_CONTROL_UNAVAILABLE       29   02; a human side was asked for and this build has no
                                     input path. Retired by 05, and it is a retirement
                                     rather than a renumbering -- the code stays spent
ARENA_INPUT_REFUSED             30   05; staging named an unknown faction, a policy side,
                                     or no installed arena. Detail bytes 1, 2 and 3 keep
                                     those three instructions distinct
CONTROL_INPUT_MAX_HOLD_TICKS     6   05; how long a staged input frame is re-used when the
                                     page misses a frame. At 1 one dropped frame stops the
                                     body dead; at 60 a tabbed-away player walks for a
                                     second after they stop looking
HUMAN_ARM_SLOT       strike/right   05; the configured strike hand, falling back to Right
                                     when neither hand strikes. Authority is fixed at
                                     construction and does not move after an amputation
BODY_TURN_INPUT_LEAD_RAW       8192  05/07; provisional absolute-yaw lead, mirrored from
                                     Rust's measured `PLAYER_TURN_LEAD_RAW`. Session 07
                                     measures and may replace the shared value in the
                                     control lab; released Q/E rebases to published yaw
HUMAN_ARM_RESTING_EFFORT        1/2  06; the existing held-guard effort and the floor for
                                     every moving human hand, not a value drag speed may
                                     lower toward zero
VIRTUAL_HAND_SENSITIVITY        --   06; arm lengths of virtual-hand travel per CSS pixel
                                     at the reference viewport; measured with pointer
                                     lock, so a screen edge is not part of the range
EXTEND_DRAG_SENSITIVITY         --   06; arm lengths of shoulder-to-hand distance per CSS
                                     pixel of secondary vertical travel -- the source
                                     material's extend verb. The screen plane's only depth
                                     is a height-coupled leak through the cameras' pitch,
                                     so this is the axis a thrust is aimed with
TOUCH_PINCH_SPREAD_RATIO        --   06; how much two-pointer spread change, relative to
                                     centroid travel, makes a two-finger touch gesture a
                                     pinch for the camera instead of an extension drag
SWING_DRAG_DEAD_ZONE_PX         --   06; below this a primary press places or holds a
                                     guard and does not add swing effort
SWING_DRAG_FULL_EFFORT_PX_S     --   06; the drag speed that maps the moving effort from
                                     the resting half to 1.0 -- never from zero
SWING_DRAG_FULL_REACH_ARM_LENGTHS 1  06; derived: the virtual hand's unit disc, with the
                                     physical minimum reach at its centre and full reach
                                     at its rim
ARENA_CLOSE_UP_RADIUS           --   04; the nearest the 3/4 camera may come to a body,
                                     bounded below by NEAR_PLANE and the head capsule
```

Seven are deliberately left `--`. Six are the control lab's feel constants; the seventh,
`ARENA_CLOSE_UP_RADIUS`, is session 04's camera bound, written there as a placeholder 0.9
and judged at the owner's browser in session 08. A placeholder number in this table is a
number somebody quotes.

## Hash expectations

State these before editing; a moved hash is normally a bug.

**No golden hash moves anywhere in this topic. Not one, in any session.** The argument is
structural rather than hopeful: nothing here edits `crates/fx`, `crates/sim`, or
`crates/policy`'s decision code. Sessions 01 through 04, 07 and 08 are TypeScript,
HTML and Markdown.
Session 05 adds a `PartialCommandSource` and its exports inside `crates/web`; session 06
adds one read-only export of the existing minimum arm reach. Both are host boundary work
and reach no pinned fixture: `EMBODIED_CORPUS_DIGEST` and `EMBODIED_GOLDEN_DIGEST` are
folded by `lab` and `sim` over fights with no host in them.

**A pin that moves is therefore a failed session and not a number to re-record**, and the
two likeliest ways to move one are worth naming in advance:

- **Touching `World::submit`'s validation or its neutral substitute** to make a
  partial command convenient. Composition happens *before* submission precisely so that
  validation can stay atomic; a half-command at that boundary is what `composition.rs`'s
  header refuses in its first paragraph.
- **Letting the control byte reach `Scenario`.** It changes `arena_fingerprint_*`, which
  is not in the golden registry but is what *names* the fight, and a moved fingerprint is
  a fight that can no longer be compared with `lab trace`'s.

## The handshakes this topic touches

Each is a set that moves together, in the frame-ABI sense, and a partial update is not
green even if one side still draws.

- **The arena config, layout 2 to 3** (session 02). **Seven places, and the count was
  five until it was checked** -- which is this repository's own recurring defect, so count
  from the list rather than from this sentence:
  1. the Rust layout constants, the decoder and `arena_config_layout_version()` in
     `crates/web/src/lib.rs`;
  2. `ARENA_REASONS`, the hand-maintained `[u8; 28]` at `crates/web/src/lib.rs:1531` whose
     only job is the distinctness assert at `:1560` -- **a new refusal code compiles
     without touching it and is then never checked for distinctness**, which is the
     fails-open shape the array's own doc comment claims to close;
  3. `client/src/runtime/arena-config.ts`'s encoder, decoder and `ARENA_REFUSALS`;
  4. `client/test/worker-protocol.test.mjs:1311`, which asserts the refusal count is
     **28** as a literal;
  5. `tools/wasm_check.js:2566`, which carries its own
     `const ARENA_CONFIG_LAYOUT_VERSION = 2`, writes it into the staged buffer at `:2643`
     and asserts the export answers it at `:2712`;
  6. `client/src/runtime/arena-recorder.ts:539`, the read-back check -- it compares
     `arena_policy(faction)` against the byte sent, and the control byte is read back the
     same way, which is a comparison somebody has to write. **`createArenaAdapter`'s
     `checkLayout()` at `:336-337` reads like a second place in the same file and is
     not one**: it *imports* `ARENA_CONFIG_LAYOUT_VERSION` from place 3, so it moves for
     free and needs no edit. It is the guard that throws when places 1 and 3 disagree,
     which is what makes a partial bump loud rather than silent;
  7. `docs/reference/articulated-abi.md:624` and `:677`, which write the layout version
     down in a table and beside the export.
- **The worker protocol's V2-only kinds** (sessions 01 and 05): every new kind is declared
  in `client/src/protocol/messages.ts`, decoded in `decodeClientMessage`, decoded again in
  `decodeArenaMessage` at the main-thread trust boundary, and **refused at V1 by name** in
  the shape `arenaStart` already uses -- *"needs protocol version 2; this session is
  legacy V1"* -- because "your session is a V1 session" and "your message is invalid" are
  different instructions.
- **`TRACE_SCHEMA`, at `arpg-fight-trace-6`, must not need to move.** Streaming is a
  transport below `FightSource`. A session that finds itself editing
  `crates/lab/src/trace.rs` and `client/src/fight/trace.ts` together has put the change in
  the wrong layer.
- **`ARENA_EXPORTS`** in `client/src/runtime/arena-recorder.ts:251` is the arena's declared
  wasm surface. Every export sessions 05 and 06 add is listed there, or it is not
  reachable. It lists pose, region, projectile and combat-event names and **no stance
  name**, which is why the twist fraction is not free to put on a HUD -- see session 05.
  Session 06 *adds* `arm_min_reach_raw` to it, and the export **does not exist yet** --
  `grep -rn arm_min_reach crates/web` is empty today, which is this plan and not a gap you
  have found. What exists is the constant it will publish, `sim::ARM_MIN_REACH_RAW =
  16_384` at `crates/sim/src/combat/actuator.rs:137`; session 06 states the export as its
  own new work. The virtual hand reads that capability rather than owning a second literal
  quarter.

- **Three gated `#L` source anchors sit above the lines these sessions edit.**
  `docs/architecture/browser-runtime.md:447-449` point at
  `crates/web/src/lib.rs#L1707` (`thread_local!`), `#L4404` (`Sim::write_frame`) and
  `#L5480` (`init`), and `tools/check_docs.js` checks each against a **plus or minus two
  line** window around the named symbol. Session 02 inserts layout and refusal constants
  at roughly 1240 and 1520; session 05 inserts a source, a wrapper and an export. **Every
  insertion above 1707 shifts all three past the window**, `node tools/check_docs.js` is
  in every session's verification block, and this is the exact rot the anchor gate was
  written to catch. Re-anchor them in the same change that moves them.

## What "controls well" is, declared before it is measured

Preregistered here so that sessions 06 and 07 cannot choose their success criteria after
feeling the result.

| quantity | today | acceptance | owned by |
|---|---|---:|---|
| time from **[Fight]** to the first drawn frame | the whole fight | **under 100 ms** | 01 |
| an AI-versus-AI arena fight, streamed | -- | **byte-identical** to today's recording, frame for frame | 01 |
| key-down to the first tick that carries it | -- | **at most 2 ticks** | 05 |
| elapsed time to simulated ticks at 60, 120 and 144 Hz display schedules | -- | **the same 60 ticks after one visible second**, with no hidden-tab catch-up | 05 |
| mouse motion with no body key held | -- | **changes no navigation or body-yaw command byte** | 05, 06 |
| camera orbit, zoom or view promotion with no arm motion | -- | **changes no staged arm target** | 04, 06 |
| deliberately parked high-left, high-right, centre, low-left and low-right guards | -- | **at least 4 of 5 distinct on the first attempt**, with no forced step from weapon input | 07 |
| five attempts in each named cut family | -- | **at least 4 of 5 desired-hand traces classify as named before contact is considered** | 07 |
| paired slow and fast cuts to one endpoint | -- | **ordered target speed and nondecreasing effort**, with achieved speed reported separately | 07 |
| a straight thrust from the tucked guard to full extension, first person, no footwork | -- | **reachable with the secondary gesture alone**, and the same gesture in the 3/4 view | 06, 07 |
| a human-driven fight replayed from its recorded commands | -- | **the same `state_digest`**, with neither the human nor the policy in the room | 05 |
| every policy and control the picker can send | -- | **takes effect, or comes back as a named refusal a test can assert** | 02, 05 |

**The row that closes the topic is not in that table.** Session 08 puts the owner at a
foreground browser with their hands on it, and only their answer to *"does it control
well?"* finishes this. A green suite is evidence that it runs, not evidence that it is
worth playing, and those are different claims -- the same distinction the embodied fight
drew between a green corpus and a fight worth watching. If the answer is no, the finding
is recorded with what specifically reads wrong, and the topic gains a session rather than
a lowered bar.

## What this topic does not do

- **It does not change a mechanic.** Not the actuator, not the contact solver, not the
  anatomy, not a spec row, not a policy's decisions. If the fight is unplayable without a
  mechanical change, that is a finding, recorded as one, and a different topic with a
  different measurement -- it would move every pin in the registry.
- **It does not call coupled mouse yaw "close enough."** If keyboard turning proves
  awkward, that is tuned as keyboard turning or offered as an explicit alternate mode.
  Mouse sword motion is never silently allowed to rotate the body, because then the
  player cannot tell which half of a cut they authored.
- **It does not add a perception channel.** No walls, no navigation, no orders. A human
  can see the screen; that is not an observation column and must not become one. Nothing
  here builds on `Order`, which reaches `state_hash` and no fighter's perception, and
  which
  [Commands](../reference/commands.md#host-standing-inputs-and-the-fact-that-nothing-perceives-them)
  already records as three pieces of owed work.
- **It does not touch presentation assets.** No GLB, no sidecar, no material, no LOD.
  Session 03 *views* the shipped combatants and changes none of them; the visual work is
  [its own live topic](concept-production-00-overview.md).
- **It does not widen past two fighters.** `MAX_POSES` is 64 and nothing below the panels
  assumes two, but the picker, the stage layout and both first-person viewports do, and
  that is the cheaper debt to leave standing.
- **It does not move the spawns or `max_ticks`.** Both reach `Scenario::fingerprint`.
- **It does not train anything.** There is still no `learned` entry in the arena's policy
  list and this topic does not add one: a checkpoint is 15 KB of weights and a policy byte
  has nowhere to put one.

## Where the roadmap links point

`AGENTS.md`, `README.md`, `DESIGN.md` and `docs/README.md` each name the live topic, and
the embodied fight's session 07 repoints all four *"at whatever the next live topic is"*.
That is this file. Whichever session lands first repoints them, and it must respect
`checkDurablePlanAuthority` in `tools/check_docs.js`: a paragraph in a durable document
whose only links are into `docs/plans/` fails unless it reads as explicitly future work,
so the sentence is written in the future tense or carries a durable link beside the plan
one.

## Verification

Every session runs the repository checklist in `AGENTS.md`. For a session that touches
only `client/` and `web/`:

```powershell
node --test "client/test/*.test.mjs"
npm run check
npm run check:abi
node tools/check_docs.js
node tools/check_deps.js
npm run dev        # foreground, stopped before the session ends
```

For a session that touches `crates/`, that list plus the full gate:

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
node --test tools/check_deps.test.js
```

`wasm_check.js` tests the artifact as it was built and only builds one if it is missing:
after touching `crates/`, rebuild before believing a pass. Do not run `cargo fmt`.
