//! The browser boundary.
//!
//! One `cdylib`, a hundred and thirty-six `extern "C"` functions, and a handful of
//! packed buffers that JavaScript reads straight out of linear memory -- the
//! `f32` frame, the `u8` tiles, fog and furniture beside it, the `u32` dungeon
//! objects at [`dungeon_object_ptr`], and the articulated publications beginning at [`pose_ptr`] and ending at
//! [`embodied_stance_ptr`]. No
//! `wasm-bindgen`, no `js-sys`, nothing generated. The workspace's
//! no-dependency rule (`DESIGN.md`) is what keeps every recorded run in the
//! repository valid across time, and it is not worth suspending for an ABI that
//! is integers in and integers out.
//!
//! **There is not one `unsafe {}` block in this crate.** The crate lint is
//! `deny` rather than `forbid` for a mechanical reason: `#[no_mangle]` is
//! itself something the `unsafe_code` lint fires on, and `forbid` cannot be
//! overridden by the `#[allow]` every export therefore needs -- under `forbid`
//! the crate does not compile at all. The property worth having survives
//! intact, because nothing here dereferences anything: [`frame_ptr`] produces
//! an address and hands it over, and the reading happens on the JavaScript side
//! of the wall, where it is bounds-checked by the engine.
//!
//! # Driving it
//!
//! ```text
//!     init(seed);                  // one hero on a generated floor
//!     set_control(CONTROL_FEET);   // take the hero's feet
//!     set_input(...);              // and drive them, every tick
//!     spawn_monster(kind, SLOT_EMPTY, SLOT_EMPTY);         // something to fight, placed on this side
//!     step(n);                     // n ticks of think-and-move
//!     swap_in_hero(kind, SLOT_EMPTY, SLOT_EMPTY);          // a replacement, once yours has fallen
//!     frame_ptr(), frame_len();    // what to draw
//! ```
//!
//! Every export is total: called before [`init`], each one answers with a zero
//! instead of trapping. That is worth more here than it looks. A panic on
//! `wasm32-unknown-unknown` lowers to an `unreachable` trap, and a trapped
//! instance is **poisoned** -- linear memory may be halfway through a mutation
//! and a `RefCell` may be left borrowed, so every later call can trap too.
//! There is no recovering; the client's only move is to stop the loop and say
//! so. The cheapest way never to debug that is never to panic.
//!
//! # The frame buffer
//!
//! A fixed `[f32; FRAME_MAX]` in a `thread_local!`, published by whichever
//! export last changed something. Its address is a static in linear memory and
//! never moves, which removes one of the two hazards of a hand-rolled ABI
//! outright -- a `Vec` that reallocates can grow the memory, and growing the
//! memory detaches every typed array JavaScript is holding.
//!
//! ```text
//!     header  [arena_x, arena_y, order_kind, order_x, order_y,
//!              last_decision_tick, unit_count, shot_count, event_count,
//!              monsters_left, portal_x, portal_y, portal_state, depth,
//!              events_dropped]
//!     unit    [x, y, facing_raw, radius, hp, max_hp, faction, kind, intent,
//!              entity_index, entity_generation,
//!              limb_angle_raw, limb_reach, limb_spin,
//!              action_length, action_arc_raw,
//!              hit_flash, block_flash, parry_flash,
//!              limb_swing, limb_swing_left, limb_line_raw,
//!              action_kind, action_role, slot, slot0_action, slot1_action,
//!              sight_range, visible, vx, vy, stride, swing_span]
//!     ...     unit_count of them
//!     shot    [x, y, heading_raw, faction]
//!     ...     shot_count of them
//!     event   [kind, x, y, amount, actor_index, other_index, aux0, aux1]
//!     ...     event_count of them
//! ```
//!
//! That diagram was stale for four sessions: it stopped the header at nine
//! entries, and it still named the two shield columns from before a character
//! had one limb. It is written out in full here because the alternative -- a
//! sketch that has to be checked against [`UNIT_STRIDE`]'s own prose -- is how
//! it went stale in the first place.
//!
//! Three sections, each one starting where the last stopped, and they are in
//! that order for one reason: only the *base* of a section moves as the counts
//! change, so every row's internal offsets stay where the page expects them.
//!
//! Columns are **append-only**. The client keys on positions, so a reshuffle
//! repaints the game while every test still passes.
//!
//! The last two columns are the unit's [`EntityId`], and they are in the buffer
//! for one reason: **a row's position is not an identity**. `write_frame` skips
//! units that have died, so when one of three monsters falls, every row after it
//! shifts up by one. A client that keyed anything on the row index -- "this body
//! just lost health", "this body was here last frame and is gone now" -- would
//! attribute the blow and the corpse to the wrong monster. Both halves are
//! needed, not just the index: a dead unit's slot is handed to the next spawn,
//! so an index on its own reads as the same creature coming back to life. Both
//! are small integers and exact in an `f32`.
//!
//! `facing` ships as [`Angle::raw`](fx::Angle::raw) and the client turns it into
//! radians (`raw / 65536 * 2pi`), so no trigonometry crosses the boundary and
//! the one float conversion in the whole stack ([`Fx::to_f32`]) stays where it
//! belongs: on the way out, to be drawn, never on the way back in.
//!
//! Two quantities are deliberately *not* in the buffer. [`tick`] and
//! [`state_hash_lo`]/[`state_hash_hi`] are integers that do not survive an
//! `f32` -- a tick count past 2^24 loses its low bits, and a 64-bit hash loses
//! most of itself -- so they are exports of their own. `last_decision_tick` is
//! in the buffer anyway because the client only ever compares it against the
//! previous frame's value to flash a "it just thought" pulse, and 2^24 ticks is
//! 77 hours of play.

#![deny(unsafe_code)]

use std::cell::{Cell, RefCell};

use fx::{Angle, Fx, Rng, Vec2};
use learn_core::{Checkpoint, CheckpointError, Model};
use policy::{
    CommandAuthority, ComposedController, PartialCommandSource,
    Policy, PolicyKind, RunConfig,
};
use sim::{
    ArmTarget, Observation, PayloadError, Cardinal,
    CombatHeight, CommandReject, CommandV1, EntityId,
    Event, Faction, Intent, Objective, Order, Scenario,
    Body, Stats, Swing, Torch, UnitSpec, Loadout, Strike, UnitView, World, LimbSlot,
};

/// Floats before the first unit: `[arena_x, arena_y, order_kind, order_x,
/// order_y, last_decision_tick, unit_count, shot_count, event_count,
/// monsters_left, portal_x, portal_y, portal_state, depth, events_dropped]`.
///
/// `9..=13` are the run: how much opposition is left, whether there is a
/// way out yet and where, and which floor this is. `monsters_left` is nominally
/// derivable from the unit rows and is here anyway, because the rows are capped
/// at [`MAX_UNITS`] and the two must not be able to disagree about whether the
/// level is clear -- that disagreement would be a portal that opens while
/// something is still alive.
///
/// `portal_x, portal_y` are `0, 0` while `portal_state` is [`PORTAL_NONE`],
/// which is the whole of the fight: nothing marks the way out until the last
/// thing on the floor is dead. Read the state, not the point.
///
/// `14` is `events_dropped`: how many rows the [`MAX_EVENTS`] cap ate this
/// frame. **It exists so that "the cap is generous" can be checked from the
/// console instead of believed**, which is the same reason `floorBakes` existed
/// on the retired Canvas page -- a bound nobody can observe is a bound nobody
/// maintains.
/// Written on every [`Sim::write_frame`] and therefore never stale; there is
/// deliberately no `max_events()` export, so this is the page's only way to
/// learn that the feed was truncated.
pub const HEADER_LEN: usize = 15;

/// Floats per unit.
///
/// Columns `0..=10` are frozen: `[x, y, facing_raw, radius, hp, max_hp,
/// faction, kind, intent, entity_index, entity_generation]`. Everything the
/// swordplay needs was **appended**, for the same reason `kind_code` is spelled
/// out rather than derived -- the client keys on positions, and a reshuffle
/// repaints the game while every test still passes.
///
/// `11..=15` are the limb and what is in it: `[limb_angle_raw, limb_reach,
/// limb_spin, action_length, action_arc_raw]`.
///
/// The two columns that used to hold a second hand are **gone rather than
/// retired in place**, and that is a deliberate break with the append-only rule
/// above. A character has one limb now; carrying `shield_angle` and
/// `shield_reach` forever as permanent zeroes would be two dead floats per unit
/// per frame and a standing invitation to draw a shield nobody is holding.
/// [`FRAME_LAYOUT_VERSION`] replaces the rule with something that catches the
/// failure the rule existed to prevent: the page asserts the version at load and
/// refuses to draw against a layout it does not understand, which fails loudly
/// instead of painting a health bar out of a guard arc.
///
/// `16..=18` are `[hit_flash, block_flash, parry_flash]`, each `0..=1`. These
/// are **presentation counters owned by [`Sim`]**, fed from the event slice
/// `World::step` returns, and deliberately not simulation state. Before them
/// the client inferred a hit from health falling between frames and needed an
/// epsilon to tell a blow from regeneration -- which could not see a blocked
/// blow at all, because a blocked blow is most of the drama and almost none of
/// the damage.
///
/// `19..=21` are the attack: `[limb_swing, limb_swing_left, limb_line_raw]`.
/// The phase codes match [`sim::Swing::discriminant`] -- `0` guard, `1` windup,
/// `2` strike, `3` recover, `4` **swap**.
///
/// `22..=26` are the loadout: `[action_kind, action_role, slot, slot0_action,
/// slot1_action]`, where an empty slot is `255`. The page needs all five: the
/// kind to name what is in hand, the role to know whether to draw a blade or an
/// arc, and the two slot columns to show a loadout the player can edit without
/// the page keeping its own copy of what the sim thinks.
///
/// These are in the frame for the same reason the flashes are, and it is the
/// stronger case of the two. A windup is the moment the whole combat model
/// turns on, and it is *invisible* in the columns that were already here: the
/// blade is drawn back and moving slowly, which looks exactly like a blade
/// being repositioned. A page that cannot draw the difference is a page where
/// every attack appears out of nowhere, and the player has no way to learn a
/// tell the AI is being scored on reading.
///
/// `27` is `sight_range`, in world units, from [`sim::Stats::sight_range`].
/// **It is here to kill the last mirrored formula in the page.** The retired
/// Canvas page used to write `(60 + 6 * perception) / 10` by hand, which is the
/// exact species of copy the registry post-mortem in `loadRegistry` is about --
/// and it is now worse than it was, because a stat can be changed live and a
/// body can be swapped underneath it, so the number the page draws a vision ring
/// from has to be the number the observation code actually used.
///
/// `28` is `visible`: `1` if the player can see this body, `0` if not.
/// **Hero-centric, and that is the point** -- it answers what the *player* can
/// see, not what each body perceives for itself. A monster's own contact list is
/// a different question with a different answer, and it never crosses this
/// boundary. With no hero standing there is no point of view at all, so every
/// row reports visible: a fog of war with nobody to be fogged from is just a
/// blank screen.
///
/// `29..=30` are `vx, vy`, world units per tick, straight off
/// [`sim::UnitView::velocity`]. Signed and small -- a Fighter's `move_speed` is
/// about 0.048 -- and **not** recoverable by differencing `x, y` across frames,
/// because a frame is up to eight ticks and sometimes none.
///
/// `31` is `stride`: the walk cycle's phase, `0 <= stride < 1`, integrated by
/// [`Sim`] over each body's own speed. See [`STRIDE_PER_RADIUS`] for the one
/// constant in it. Presentation, not state, and **it wraps** -- a client that
/// lerps it naively runs the legs backwards through a whole cycle on the frame
/// it passes 1.
///
/// `32` is `swing_span`: how many ticks the *current* phase started with, so
/// `swing_left / swing_span` is an honest fraction. Without it there is no way
/// to draw a windup as a windup, because `swing_left = 4` means "nearly done"
/// for a Brute's 33-tick windup and "just started" for a Punch's 5. Zero at
/// guard, where `swing_left` means nothing.
pub const UNIT_STRIDE: usize = 33;
pub const UNIT_X: usize = 0;
pub const UNIT_Y: usize = 1;
pub const UNIT_FACING_RAW: usize = 2;
pub const UNIT_RADIUS: usize = 3;
pub const UNIT_HP: usize = 4;
pub const UNIT_MAX_HP: usize = 5;
pub const UNIT_FACTION: usize = 6;
pub const UNIT_KIND: usize = 7;
pub const UNIT_INTENT: usize = 8;
pub const UNIT_ENTITY_INDEX: usize = 9;
pub const UNIT_ENTITY_GENERATION: usize = 10;
pub const UNIT_LIMB_ANGLE_RAW: usize = 11;
pub const UNIT_LIMB_REACH: usize = 12;
pub const UNIT_LIMB_SPIN: usize = 13;
pub const UNIT_ACTION_LENGTH: usize = 14;
pub const UNIT_ACTION_ARC_RAW: usize = 15;
pub const UNIT_HIT_FLASH: usize = 16;
pub const UNIT_BLOCK_FLASH: usize = 17;
pub const UNIT_PARRY_FLASH: usize = 18;
pub const UNIT_LIMB_SWING: usize = 19;
pub const UNIT_LIMB_SWING_LEFT: usize = 20;
pub const UNIT_LIMB_LINE_RAW: usize = 21;
pub const UNIT_ACTION_KIND: usize = 22;
pub const UNIT_ACTION_ROLE: usize = 23;
pub const UNIT_SLOT: usize = 24;
pub const UNIT_SLOT0_ACTION: usize = 25;
pub const UNIT_SLOT1_ACTION: usize = 26;
pub const UNIT_SIGHT_RANGE: usize = 27;
pub const UNIT_VISIBLE: usize = 28;
pub const UNIT_VX: usize = 29;
pub const UNIT_VY: usize = 30;
pub const UNIT_STRIDE_PHASE: usize = 31;
pub const UNIT_SWING_SPAN: usize = 32;

/// Floats per arrow, in a block that follows the units: `[x, y, heading_raw,
/// faction]`.
///
/// Four and no more. The speed is absent because a streak is presentation and
/// the page may choose its own length; the archer is absent because nothing on
/// screen keys on who loosed a shot, and by the time one lands that fighter may
/// be dead -- carrying the handle would be inviting a lookup that returns
/// nothing.
///
/// Arrows are **not** units and are deliberately not squeezed into
/// [`UNIT_STRIDE`]. They have no health, no loadout, no limb and no phase, so
/// they would be twenty-three dead floats each, and the health bars and reach
/// rings the unit loop draws would all have to learn to skip them.
pub const SHOT_STRIDE: usize = 4;
pub const SHOT_X: usize = 0;
pub const SHOT_Y: usize = 1;
pub const SHOT_HEADING_RAW: usize = 2;
pub const SHOT_FACTION: usize = 3;

/// Most arrows the frame will carry. Matches [`sim::MAX_SHOTS`], asserted in
/// `the_frame_is_bounded_by_what_the_world_can_hold`.
pub const MAX_SHOTS: usize = sim::MAX_SHOTS;

/// Floats per event, in a third block that follows the arrows: `[kind, x, y,
/// amount, actor_index, other_index, aux0, aux1]`.
///
/// These are **things that happened**, not things that are. Every other row in
/// the frame describes state a renderer can read again next frame; an event is
/// gone the moment it is consumed, and the page turns it into a floater or a
/// callout it then ages on its own wall clock.
///
/// `actor_index` is [`EntityId::index`] alone, deliberately without the
/// generation. A row is consumed inside the frame it arrives in, and what the
/// page keys a floating number on is the *position* it happened at -- so the
/// index is a hint for grouping rows that share an actor and nothing more. It
/// is emphatically not an identity, and the unit row's two-column handle stays
/// the only thing that is.
///
/// `other_index` is the second party on the same terms, or [`SLOT_EMPTY`] for
/// none: the attacker behind a blow, the killer behind a death, `b` of a
/// parried pair, the shover behind a shove.
///
/// `aux0, aux1` are read according to `kind` and are tabulated in exactly one
/// place, which is the table below. Nothing else in this crate or in the page
/// may write down a second copy of it.
///
/// | kind | `x, y` | `amount` | `actor` | `other` | `aux0` | `aux1` |
/// |---|---|---|---|---|---|---|
/// | [`EVENT_DAMAGE`] | impact point | health lost | target | source | target mass | target radius |
/// | [`EVENT_BLOCK`] | the rim it landed on | absorbed | defender | attacker | defender mass | 0 |
/// | [`EVENT_PARRY`] | where the blades crossed | 0 | `a` | `b` | 0 | 0 |
/// | [`EVENT_DECLARE`] | swinger's position | action code | swinger | 255 | 0 | 0 |
/// | [`EVENT_DEATH`] | where it fell | 0 | the dead | killer | mass | body kind |
/// | [`EVENT_LOOSE`] | the nock | 0 | archer | 255 | line, in turns | 0 |
/// | [`EVENT_PHASE`] | the body | 0 | unit | 255 | phase from | phase to |
/// | [`EVENT_STEP`] | the foot | speed, units/tick | unit | 255 | mass | 0 |
/// | [`EVENT_SHOVE`] | the body | impulse magnitude | the shoved | the shover, or 255 | mass | 0 |
/// | [`EVENT_PORTAL`] | the portal | 0 | 255 | 255 | 0 | 0 |
/// | [`EVENT_DESCEND`] | the portal | the new depth | 255 | 255 | 0 | 0 |
pub const EVENT_STRIDE: usize = 8;
pub const EVENT_KIND: usize = 0;
pub const EVENT_X: usize = 1;
pub const EVENT_Y: usize = 2;
pub const EVENT_AMOUNT: usize = 3;
pub const EVENT_ACTOR_INDEX: usize = 4;
pub const EVENT_OTHER_INDEX: usize = 5;
pub const EVENT_AUX0: usize = 6;
pub const EVENT_AUX1: usize = 7;

/// Most events one frame will carry.
///
/// The client caps itself at eight ticks of catch-up per animation frame
/// (`MAX_CATCHUP_TICKS`, as the retired Canvas page named it), and that used to
/// mean "a blow or two and the odd declaration". It no longer does: phase
/// changes, footfalls and shoves are events now, and every one of them is per
/// body per tick rather than per exchange.
///
/// **Measured, and the crowd turned out not to be the variable.** Sweeping a
/// generated level plus 4, 8, 16, 32 and 63 extra Brutes, over 1,200 ticks each
/// and reading the busiest eight-tick window while the hero was still standing:
///
/// | extra Brutes | busiest 8-tick frame | rows dropped |
/// |---|---|---|
/// | 4 | 58 | 0 |
/// | 8 | 60 | 0 |
/// | 16 | 64 | 0 |
/// | 32 | 72 | 0 |
/// | 63 | 71 | 0 |
///
/// The rate is **flat in the crowd size** -- about 5.7 rows a tick either way --
/// because nine rows in ten are [`EVENT_SHOVE`] out of `World::apply_recoil`,
/// which fires for a body whose blade momentum moved more than its traction can
/// hold, and that is a property of who is *swinging* rather than of who is in
/// the room. A crowd of Brutes that cannot reach anything is quiet.
///
/// `the_frame_is_bounded_by_what_the_world_can_hold` runs the same room longer
/// and reads **79**. That is the number to hold this against, and 128 against 79
/// is the tightest margin of the three section caps -- deliberately so rather
/// than luckily: the plan for this session estimated "near eighty" from first
/// principles before any of this was written, and the measurement landed on it.
/// Re-measure rather than re-argue; that test prints the number, and `frame[14]`
/// asks the same question of real play from the console.
///
/// Overflow drops the tail -- see [`Sim::advance`] for why that is the right
/// end to drop -- and now says so out loud in `frame[14]`, so a page can tell
/// "the cap held" from "the cap held because nothing happened".
///
/// 128 rows of [`EVENT_STRIDE`] floats is 4 KB of linear memory, once, forever.
pub const MAX_EVENTS: usize = 128;

/// A blow that took health off. `amount` is the health lost, `x, y` the impact
/// point (`Event::Damage.at`).
pub const EVENT_DAMAGE: u32 = 0;
/// A blow a guard ate. `amount` is what was absorbed, `x, y` the rim it landed
/// on.
pub const EVENT_BLOCK: u32 = 1;
/// Two blades crossed. `amount` is `0`; `actor_index` is the lower-indexed of
/// the pair, which is the one `Event::Parry` names first.
pub const EVENT_PARRY: u32 = 2;
/// A unit began an attack. `amount` is the [`sim::ActionKind::code`] it began,
/// `x, y` the swinger's own position. See [`Sim::note_bodies`].
///
/// **Kept even though [`EVENT_PHASE`] subsumes it**, and deliberately. It
/// carries the action code rather than a phase pair, it applies the
/// `Guard | Recover -> Windup | Strike` rule that is *not* every transition,
/// and `pushCallout` in the page consumes it today.
pub const EVENT_DECLARE: u32 = 3;
/// A body left the world. `x, y` is where it last stood, which is the body's
/// own centre rather than the blade contact point a lethal [`EVENT_DAMAGE`]
/// reports.
pub const EVENT_DEATH: u32 = 4;
/// An arrow left a bow. `aux0` is the line it was thrown along **in turns**,
/// `0..1`, and not the raw binary angle the unit rows carry: a raw angle is a
/// `u16` and does not fit an [`Fx`] as an integer, so it crosses as the
/// fraction of a turn it already is. The page multiplies by `2pi`.
pub const EVENT_LOOSE: u32 = 5;
/// A limb changed phase. `aux0` is the phase it left and `aux1` the phase it
/// entered, both [`sim::Swing::discriminant`].
pub const EVENT_PHASE: u32 = 6;
/// A foot landed. `amount` is the body's speed in world units per tick, which
/// is what decides how heavy the footfall sounds. See [`STRIDE_PER_RADIUS`].
pub const EVENT_STEP: u32 = 7;
/// A body was moved by something other than its own feet. `amount` is the
/// magnitude of the velocity it gained; `other` is whoever did it, or `255` for
/// a fighter's own recoil.
///
/// **By far the highest-rate row in the feed, and a consumer has to know it.**
/// Measured at about 5.7 a tick and nine rows in ten of everything the frame
/// carries -- almost all of them from `World::apply_recoil`, which bills a
/// fighter for its own swing on most ticks of most swings. A blow landing is
/// rare and large; a recoil is constant and small. Anything reacting to this
/// wants a magnitude threshold, and `amount` is there so it can have one.
pub const EVENT_SHOVE: u32 = 8;
/// The way out opened. Carries no actor -- it is a fact about the level.
pub const EVENT_PORTAL: u32 = 9;
/// The run moved to the next floor. `amount` is the new depth.
pub const EVENT_DESCEND: u32 = 10;

/// One past the last event code, so a bound can be asserted rather than
/// written down twice. Codes are **append-only**, on the standing rule the
/// `FURNITURE_*` codes state: a page that has never heard of a kind skips the
/// row rather than guessing at it, which is what lets an older page run against
/// a newer module and draw nothing wrong.
pub const EVENT_KINDS: u32 = 11;

/// Bumped whenever the frame changes shape or meaning.
///
/// The page reads this before it reads anything else and refuses to draw a
/// layout it was not written against. That is a weaker promise than the
/// append-only convention it replaced and a much more useful one: append-only
/// forbids the edit, this one makes the edit safe.
pub const FRAME_LAYOUT_VERSION: u32 = 7;

/// Value in a loadout column meaning "this slot is empty". Matches
/// [`sim::Loadout::EMPTY`], and is not a valid action code.
pub const SLOT_EMPTY: u32 = 255;

/// Ticks a hit, block or parry stays lit in the frame.
const FLASH_TICKS: u8 = 12;

/// How long a body's stride is, as a multiple of its own radius.
///
/// The whole of the walk cycle's clock: each tick a live body adds
/// `speed / (radius * this)` to its `stride` column, and every time that passes
/// 1 a foot lands and an [`EVENT_STEP`] row is emitted. Proportional to radius
/// because a Brute's stride is longer than a Skitterer's *because a Brute is
/// bigger*, which is the one thing about a walk cycle nobody has to be told.
///
/// **1.3 is chosen for cadence, and here is the arithmetic.** A Fighter is
/// radius 0.45 and tops out near 0.048 world units a tick, so its stride is
/// 0.585 units and a foot lands every ~12 ticks -- a fifth of a second, which
/// is a brisk walk rather than a scurry. A Skitterer is radius 0.30, so its
/// stride is 0.39 units, and it walks at its *own* 0.0597: a foot lands every
/// ~6.5 ticks, so the small thing visibly takes about twice as many, shorter
/// steps. Below about 1.2 the legs blur; above about 1.5 a Brute appears to
/// glide. The range was read off `Body::radius` and `move_speed` rather than
/// swept, because there is nothing here to optimise -- it is a look.
///
/// **The Skitterer's number used to be written down as ~8**, which is 0.39
/// divided by the *Fighter's* speed and therefore a body's stride against
/// somebody else's legs. It is recorded here rather than quietly corrected
/// because it is the exact mistake this constant invites: the stride is per
/// body and so is the speed that spends it.
///
/// Three tests catch it drifting:
/// `a_fighter_takes_a_step_about_every_twelve_ticks` below pins the measured
/// cadence, `a_skitterer_takes_about_twice_as_many_steps_as_a_fighter` pins the
/// arithmetic above for the body the comment got wrong, and
/// `tools/wasm_check.js`'s stride check pins the property that survives any
/// retune -- the column advances while a body walks and holds while it stands.
///
/// [`Fx`] and not `f32`, and that is not a stylistic preference: `Sim` contains
/// no float arithmetic at all today, and the frame's one float conversion
/// belongs on the way out. See `AGENTS.md`, "The one rule everything else
/// serves".
const STRIDE_PER_RADIUS: Fx = Fx::from_ratio(13, 10);

/// Bit in [`control`] that hands the feet to the player.
pub const CONTROL_FEET: u32 = 1;
/// Bit in [`control`] that hands an arm to the player.
///
/// Renamed from `CONTROL_LIMB` when there was one limb and it was not always a
/// sword. There are two arms now and the name kept: which of them the pointer
/// steers is [`CONTROL_SLOT`]'s, and the arm this bit does not name stays with
/// the policy.
pub const CONTROL_LIMB: u32 = 2;
/// Bit in [`control`] that moves the pointer to the player's **other hand**.
///
/// **The meaning moved with the model and the name did not, which is worth
/// stating here rather than leaving to a reader.** It used to hand *action
/// selection* over -- which of a loadout's two slots the fighter put in hand --
/// and that was separate from [`CONTROL_LIMB`] because choosing what to hold and
/// choosing when to swing are different decisions. An embodied body holds both
/// items at once and there is no swap to choose, so what the bit buys now is
/// which of the two arms [`set_input`]'s bearing drives.
///
/// It stays a bit of its own for the same reason it became one: it is still
/// separable, and `the_three_control_bits_are_independent` is still what checks
/// that taking one does not drag another in.
pub const CONTROL_SLOT: u32 = 4;

/// Ceiling on units in one frame. The room holds exactly one and a skirmish
/// holds a dozen; the number exists so the buffer can be a fixed array rather
/// than a `Vec`, and 64 rows cost 8.4 KB of linear memory once, forever.
pub const MAX_UNITS: usize = 64;

/// Length of the frame buffer. [`frame_len`] reports how much of it is live.
pub const FRAME_MAX: usize =
    HEADER_LEN + MAX_UNITS * UNIT_STRIDE + MAX_SHOTS * SHOT_STRIDE + MAX_EVENTS * EVENT_STRIDE;

/// Length of the tile buffer.
///
/// Sized for a 96x64 grid rather than the 68x45 a level actually is -- 3,060
/// tiles against 6,144 -- so that the extent can move without the ABI moving
/// with it. It already has once: the headroom was banked for halving the tile
/// size later, and doubling the level spent half of it instead. What is left is
/// slack rather than a second doubling, and a halved tile no longer fits.
/// Six kilobytes of linear memory, once, forever.
pub const MAP_MAX: usize = 96 * 64;

// ------------------------------------------------------------- the furniture
//
// Things that stand *on* the floor plan and cannot be read out of it: doorways
// and torches. One buffer for both rather than one per kind, because every one
// of them is the same shape -- a small fixed record at a tile -- and a page that
// has to bind three exports per piece of scenery will stop adding scenery.
// `world-07` is that promise being kept: a torch is a *record kind* here and not
// a third pair of exports.

/// One furniture record, in bytes: `[kind, tx, ty, state]`.
///
/// **The record format, stated here because it is an ABI:**
///
/// | byte | meaning |
/// |---|---|
/// | 0 | kind: [`FURNITURE_DOOR`] or [`FURNITURE_TORCH`]. `0` is "nothing" and is never emitted, so a buffer that was never written holds no furniture rather than a field of doors at the origin. |
/// | 1 | `tx`, the tile column |
/// | 2 | `ty`, the tile row |
/// | 3 | state, read according to the kind. For a door: `1` open, `0` shut. For a torch: [`TORCH_FACE_POS_X`] or [`TORCH_FACE_POS_Y`]. |
///
/// **One record per *tile*, not per doorway.** A doorway is up to `CORRIDOR`
/// tiles that open together, and the page's bake is a loop over tiles -- so a
/// per-doorway record would be unpacked back into tiles at the only place it is
/// read. What the page loses is the grouping, and it does not need it: the ends
/// of a run are the door tiles with solid rock beside them, which is a question
/// the tile buffer already answers.
///
/// `tx` and `ty` are one byte each, which is a claim about [`MAP_MAX`] rather
/// than about this: a level is 96x64 at the outside, and a level wide enough to
/// overflow a `u8` column would have to have restated that sizing argument
/// first. The const assertion below is what makes that a check instead of a
/// hope.
///
/// **Append-only, exactly like the `PORTAL_*` codes and for the same reason:** a
/// page built against an older module must not be able to read a *new* meaning
/// out of an old number. A new kind takes the next free byte value; an existing
/// kind's state byte gains a bit rather than changing what a bit means.
pub const FURNITURE_STRIDE: usize = 4;
pub const FURNITURE_KIND: usize = 0;
pub const FURNITURE_TX: usize = 1;
pub const FURNITURE_TY: usize = 2;
pub const FURNITURE_STATE: usize = 3;

/// Records the furniture buffer holds.
///
/// A fixed array for the reason [`MAP_MAX`] is: a `Vec` that reallocates grows
/// linear memory, and growing it detaches every typed array the page holds.
/// Two kilobytes of linear memory, once, forever.
///
/// 512 against a **measured** worst case of 157 records over 600 generated
/// levels -- a mean of 50 door tiles and 45 torches, worst 70 torches -- so
/// better than three times the headroom, and `world-07` spent about half of the
/// order of magnitude this note used to promise it. The measurement is
/// `a_level_of_torches_fits_the_page_buffer` in `crates/sim/src/dungeon.rs`,
/// which is where the two counts are produced and therefore the only place they
/// can be checked instead of remembered. [`write_furniture`] stops at the
/// ceiling rather than growing past it, so overflowing this is scenery that goes
/// missing and never a write out of bounds.
pub const FURNITURE_MAX: usize = 512;

/// A doorway tile. State byte: `1` open, `0` shut.
pub const FURNITURE_DOOR: u8 = 1;

/// A torch on a wall face. State byte: which face, [`TORCH_FACE_POS_X`] or
/// [`TORCH_FACE_POS_Y`].
pub const FURNITURE_TORCH: u8 = 2;

/// The two faces a torch can be mounted on, as the state byte reports them.
///
/// **An explicit mapping and never `Cardinal as u8`, and this is a trap rather
/// than a preference.** [`sim::Cardinal`] is declared `NegX, PosX, NegY, PosY`
/// in *percept* order -- the order the legacy observation's `wall_clearance`
/// column always reported -- so the obvious cast gives `PosX = 1` and `PosY = 3`, two values
/// that mean nothing to a page and that would silently change if a fifth
/// direction were ever added or the percept order were reshuffled. The enum has
/// no discriminants and no `as u8` mapping of its own precisely so that a wire
/// format has to say what it means.
///
/// Only these two are emitted on the legacy furniture channel. Full-cardinal
/// torch yaw is carried by `DUNGEON_OBJECT_V1`, whose word has room to say it.
pub const TORCH_FACE_POS_X: u8 = 0;
pub const TORCH_FACE_POS_Y: u8 = 1;

// ------------------------------------------------------- the dungeon objects

/// `DUNGEON_OBJECT_V1`: one live world object in twelve `u32` words.
pub const DUNGEON_OBJECT_LAYOUT_VERSION: u32 = 1;
pub const DUNGEON_OBJECT_STRIDE: usize = 12;
pub const DUNGEON_OBJECT_KIND: usize = 0;
pub const DUNGEON_OBJECT_IDENTITY: usize = 1;
pub const DUNGEON_OBJECT_STATE_FLAGS: usize = 2;
pub const DUNGEON_OBJECT_X_RAW: usize = 3;
pub const DUNGEON_OBJECT_Y_RAW: usize = 4;
pub const DUNGEON_OBJECT_YAW_RAW: usize = 5;
pub const DUNGEON_OBJECT_HALF_X_RAW: usize = 6;
pub const DUNGEON_OBJECT_HALF_Y_RAW: usize = 7;
pub const DUNGEON_OBJECT_HP_RAW: usize = 8;
pub const DUNGEON_OBJECT_MAX_HP_RAW: usize = 9;
pub const DUNGEON_OBJECT_PROGRESS_RAW: usize = 10;
pub const DUNGEON_OBJECT_MATERIAL_CODE: usize = 11;
pub const DUNGEON_OBJECT_DOOR: u32 = sim::DungeonObjectKind::Door as u32;
pub const DUNGEON_OBJECT_TORCH: u32 = sim::DungeonObjectKind::Torch as u32;
pub const DUNGEON_OBJECT_BARREL: u32 = sim::DungeonObjectKind::Barrel as u32;
pub const DUNGEON_OBJECT_POTTERY: u32 = sim::DungeonObjectKind::Pottery as u32;
pub const DUNGEON_OBJECT_WEB: u32 = sim::DungeonObjectKind::Web as u32;
pub const DUNGEON_OBJECT_WATER: u32 = sim::DungeonObjectKind::Water as u32;
/// 512 rows against 197: the measured legacy-furniture worst case is 157
/// door/torch rows over 600 generated levels, and prop generation has a hard
/// 40-row ceiling. The extra headroom keeps a larger future dressing set from
/// turning the drop counter into an ordinary shipped state.
pub const MAX_DUNGEON_OBJECTS: usize = 512;
const DUNGEON_OBJECT_DOOR_ID_BASE: u32 = 0x1000_0000;
const DUNGEON_OBJECT_TORCH_ID_BASE: u32 = 0x2000_0000;
const DUNGEON_OBJECT_PROP_ID_BASE: u32 = 0x3000_0000;

/// The state byte for a torch's face. Total over [`sim::Cardinal`] because a
/// match must be. The negative cases are not written by [`write_furniture`];
/// their arms keep this helper total because it lives inside a `cdylib`.
const fn torch_face(face: Cardinal) -> u8 {
    match face {
        Cardinal::PosX | Cardinal::NegX => TORCH_FACE_POS_X,
        Cardinal::PosY | Cardinal::NegY => TORCH_FACE_POS_Y,
    }
}

/// A tile coordinate has to fit in the record's one byte. Checked rather than
/// assumed, because the failure is silent: a column past 255 would wrap and put
/// a door on the wrong side of the room.
const _: () = assert!(
    sim::DUNGEON_COLS as usize <= 256 && sim::DUNGEON_ROWS as usize <= 256,
    "a furniture record holds tx and ty in one byte each",
);

/// Tile size in thousandths of a world unit, reported by
/// [`map_tile_size_milli`].
///
/// An export rather than a number the page also knows, because it is the last
/// place the client would otherwise hardcode "one tile is one world unit" -- and
/// a client that has that wrong draws a level at the wrong scale while every
/// test still passes.
pub const TILE_MILLI: u32 = 1000;

/// How close the hero has to be to the way out to take it.
///
/// Measured from body edge to portal edge, so a Brute takes it from further out
/// than a Skitterer does -- which is right: what matters is touching it.
const PORTAL_RADIUS: Fx = Fx::from_ratio(9, 10);

/// Portal states, as the frame reports them.
const PORTAL_NONE: u32 = 0;
/// **Retired: never emitted.** Nothing marks the way out while monsters live,
/// so a portal is either not there yet ([`PORTAL_NONE`]) or open
/// ([`PORTAL_OPEN`]) -- see [`Sim::open_the_way_out`].
///
/// What this used to say, and it was not a fallback either: *"visible while
/// shut is the design decision -- seeing where the exit is from the moment you
/// arrive is what turns 'kill things' into 'fight your way there'."* That is
/// still a true description of what a visible-but-shut exit buys, and it is
/// what has been given up. **The user asked for the other trade**: the exit is
/// earned rather than pointed at, and it appears where the last thing died, so
/// the room you fought through is the room that answers.
///
/// The code stays at `1` rather than being reused or renumbered. The wire codes
/// in this crate are append-only by convention, and a page built against an
/// older module must not be able to read a *new* meaning out of an old number.
#[allow(dead_code)]
const PORTAL_SHUT: u32 = 1;
const PORTAL_OPEN: u32 = 2;

/// Closest a newcomer may be placed to the hero, and the floor the arc sweep
/// in [`Sim::spawn_point`] accepts against. Far enough that you watch it come.
///
/// Still the common case for a *monster*. For a replacement character this and
/// the three constants below are the **fallback** band only -- the first swap
/// of a run, and the first swap after a descent. Every other swap lands where
/// the last character fell; see [`Sim::entry_point`].
const SPAWN_NEAR: Fx = Fx::from_int(6);

/// Furthest a newcomer may be placed from the hero.
///
/// Nine, and the number is measured rather than picked: a Fighter sees
/// `6.0 + 0.6 * perception 6 = 9.6` units, so a monster placed at the far end of
/// this band is inside sight but only just, and the hero notices it on its
/// *next* decision -- up to twelve ticks away. That delay is the intellect stat,
/// which is the thing this page exists to make visible.
///
/// The ceiling matters more than it looks. Beyond sight, a monster carries no
/// standing order (`Order::Hold` is what a faction nobody commands has), so
/// `UtilityPolicy` falls through to its open-ground drift and the two may simply
/// never meet. A spawn button that sometimes produces no fight reads as broken.
const SPAWN_FAR: Fx = Fx::from_int(9);

/// Bearings tried before giving up, and the step between them. `65536 / 16` is
/// exact, so the sweep closes the circle instead of drifting off it.
///
/// Read by [`Sim::spawn_point`] on every monster and by [`Sim::entry_point`]
/// only on the swaps that have no fall site to go back to.
const SPAWN_ARCS: u16 = 16;
const SPAWN_ARC_STEP: u16 = 4096;

/// Domain tag for the spawn RNG stream.
///
/// `World::observe` already draws from `Rng::from_stream` keyed on the tick and
/// an entity, so the top bit is set here to keep perception noise and spawn
/// placement out of each other's sequences. No entity index reaches `1 << 63`,
/// so the tag cannot collide.
const SPAWN_STREAM: u64 = 1 << 63;

// ------------------------------------------------ articulated poses and events
//
// Two more fixed buffers beside the frame, and they are `u32` rather than `f32`
// for a reason the legacy frame does not have: an articulated row carries `u64`
// energy ledgers and raw fixed-point words, and neither survives a float. The
// contract they mirror is `docs/reference/articulated-abi.md`; the word rules
// are the reference's, restated once here because a reader of this file has to
// know them to read the two tables below.
//
// * Unsigned values cross directly.
// * An [`Fx`] or any other signed value crosses as its two's-complement raw
//   `i32` bits reinterpreted as a `u32` -- **not** widened, because a sign
//   extension would make `-1` and `0xffffffff` two different words for one
//   value.
// * An [`Angle`] raw and a time-of-impact raw are widened.
// * A boolean is zero or one.
// * An identity is always two words, index then generation, for exactly the
//   reason the frame's unit row carries both: a slot is handed to the next
//   spawn, so an index alone reads as the same creature coming back.
//
// **These arrays are authoritative-host views and must not cross to the
// renderer unfiltered.** Every export below says so again; see
// [`pose_ptr`] for the whole of that argument.

/// Version of the pose row layout. Bumped when a column moves; columns are
/// append-only, exactly as the frame's are.
pub const POSE_LAYOUT_VERSION: u32 = 1;

/// Rows the pose buffer holds.
///
/// Written as the authoritative [`sim::MAX_ENTITIES`] and never as
/// a second literal 64. They are the same number by construction -- the sim
/// cannot have more articulated bodies than the contact solver reserves for --
/// and the day one of them moves, a second literal here would be the bug rather
/// than the mismatch that reports it.
pub const MAX_POSES: usize = sim::MAX_ENTITIES;

/// Words in one pose row. See the column constants below for the layout.
pub const POSE_STRIDE: usize = 66;

pub const POSE_ENTITY_INDEX: usize = 0;
pub const POSE_ENTITY_GENERATION: usize = 1;
pub const POSE_BODY_X: usize = 2;
pub const POSE_BODY_Y: usize = 3;
pub const POSE_BODY_Z: usize = 4;
pub const POSE_BODY_YAW_RAW: usize = 5;
pub const POSE_BODY_VX: usize = 6;
pub const POSE_BODY_VY: usize = 7;
pub const POSE_BODY_VZ: usize = 8;
pub const POSE_LEFT_HAND_X: usize = 9;
pub const POSE_LEFT_HAND_Y: usize = 10;
pub const POSE_LEFT_HAND_Z: usize = 11;
pub const POSE_LEFT_HAND_VX: usize = 12;
pub const POSE_LEFT_HAND_VY: usize = 13;
pub const POSE_LEFT_HAND_VZ: usize = 14;
pub const POSE_LEFT_FATIGUE: usize = 15;
pub const POSE_LEFT_TARGET_X: usize = 16;
pub const POSE_LEFT_TARGET_Y: usize = 17;
pub const POSE_LEFT_TARGET_Z: usize = 18;
pub const POSE_RIGHT_HAND_X: usize = 19;
pub const POSE_RIGHT_HAND_Y: usize = 20;
pub const POSE_RIGHT_HAND_Z: usize = 21;
pub const POSE_RIGHT_HAND_VX: usize = 22;
pub const POSE_RIGHT_HAND_VY: usize = 23;
pub const POSE_RIGHT_HAND_VZ: usize = 24;
pub const POSE_RIGHT_FATIGUE: usize = 25;
pub const POSE_RIGHT_TARGET_X: usize = 26;
pub const POSE_RIGHT_TARGET_Y: usize = 27;
pub const POSE_RIGHT_TARGET_Z: usize = 28;
pub const POSE_LEFT_WEAPON_HILT_X: usize = 29;
pub const POSE_LEFT_WEAPON_HILT_Y: usize = 30;
pub const POSE_LEFT_WEAPON_HILT_Z: usize = 31;
pub const POSE_LEFT_WEAPON_TIP_X: usize = 32;
pub const POSE_LEFT_WEAPON_TIP_Y: usize = 33;
pub const POSE_LEFT_WEAPON_TIP_Z: usize = 34;
pub const POSE_RIGHT_WEAPON_HILT_X: usize = 35;
pub const POSE_RIGHT_WEAPON_HILT_Y: usize = 36;
pub const POSE_RIGHT_WEAPON_HILT_Z: usize = 37;
pub const POSE_RIGHT_WEAPON_TIP_X: usize = 38;
pub const POSE_RIGHT_WEAPON_TIP_Y: usize = 39;
pub const POSE_RIGHT_WEAPON_TIP_Z: usize = 40;
pub const POSE_SHIELD_CENTER_X: usize = 41;
pub const POSE_SHIELD_CENTER_Y: usize = 42;
pub const POSE_SHIELD_CENTER_Z: usize = 43;
pub const POSE_SHIELD_NORMAL_X: usize = 44;
pub const POSE_SHIELD_NORMAL_Y: usize = 45;
pub const POSE_SHIELD_NORMAL_Z: usize = 46;
pub const POSE_SHIELD_HALF_WIDTH: usize = 47;
pub const POSE_SHIELD_HALF_HEIGHT: usize = 48;
/// First of [`sim::AnatomyRegion::COUNT`] integrity fractions, in `BodyPart`
/// order. The five are contiguous, so the region's own discriminant indexes
/// them and there is no per-region constant to keep in step with the enum.
pub const POSE_INTEGRITY_FIRST: usize = 49;
/// First of the five wound fractions, in the same order.
pub const POSE_WOUND_FIRST: usize = 54;
pub const POSE_BLOOD_FRACTION: usize = 59;
pub const POSE_SHOCK: usize = 60;
/// Bit `part as u8` per severed region.
pub const POSE_SEVERED_MASK: usize = 61;
/// Left weapon bit 0, right weapon bit 1, shield bit 2 -- the mask
/// [`sim::Pose::equipment_mask`] reads off its own geometry, so a
/// set bit and a zeroed hilt/tip pair cannot disagree.
pub const POSE_EQUIPMENT_MASK: usize = 62;
/// The stored command's intent, in the frozen wire ordinals the submitted
/// command payload already froze: Hold `0`, Attack `1`, Flee `2`.
pub const POSE_INTENT: usize = 63;
pub const POSE_LEFT_HINT: usize = 64;
pub const POSE_RIGHT_HINT: usize = 65;

// ------------------------------------------------------------ region capsules
//
// The volumes the contact phase sweeps, published beside the pose rows rather
// than rebuilt from an anatomy row on the far side of the wall.
//
// **Seven of them and not five, since the elbow.** The section is keyed by swept
// volume rather than by anatomy region: rows 0..5 are the five `BodyPart`s in
// their own discriminant order and rows 5 and 6 are the two forearms, absent on
// a body whose arms are one link. The forearms were appended rather than
// interleaved beside each arm precisely so that the five leading indices did not
// move -- `client/src/arena/geometry.ts` reads regions 2 and 3 as the arms
// positionally. `crates/lab/src/strong_strike.rs` swapped the same two indices
// to mirror a fight and is the reason this was written down; session 05 deleted
// that file, and the positional read in the client is what is left depending on
// it.
//
// **A third section and not five more pose columns.** Folding them in would move
// [`POSE_LAYOUT_VERSION`] for a body of data that is constant across most of a
// fight -- a torso and a head do not move relative to their own origin -- and
// would make every pose row 62% wider to carry it every tick.
//
// **The alternative that is rejected on the record: publish the anatomy once and
// port [`sim::body_region_volumes`] to TypeScript.** It is the cheap one, and it
// is exactly the mirror `crates/lab/src/trace.rs` refuses in its module header:
// a viewer that rebuilt a shoulder from an anatomy row would be a second answer
// to a question the simulation has already answered. The function is not
// trivial, either -- the head is a *degenerate* capsule whose extent comes from
// `radius` while `AnatomyRegionSpec::half_height` is dead for that region -- so
// a copy would be right on the day it was written and wrong the first time the
// anatomy changed, with nothing in the repository able to notice.
//
// The row is [`sim::RegionVolume`] word for word: lower point, upper point,
// radius, present. Nothing is derived here, which is the pose row's rule and
// this section's whole reason to exist.

/// Version of the region row layout. Its own number rather than a second
/// reading of [`POSE_LAYOUT_VERSION`]: this section adds no pose column and a
/// pose column moving says nothing about these eight words.
///
/// **Moved 1 -> 2 by the forearm collider**, and the move is what distinguishes
/// that session's `ARTICULATED_STREAM_DIGEST` re-record from the values-only
/// ones in its registry row: [`REGIONS_PER_BODY`] went from five to seven, so
/// the region section of every tick is a different length and everything after
/// it moves with it. A reader holding version 1 would index row `n * 5` and get
/// somebody else's torso.
pub const REGION_LAYOUT_VERSION: u32 = 2;

/// Rows one body publishes, one per swept volume.
///
/// Written as the sim's own count and never as a second literal, exactly as
/// [`MAX_POSES`] is written as `sim::MAX_ENTITIES`. An eighth volume
/// would then widen this section rather than silently truncating it.
///
/// **`sim::BODY_VOLUME_COUNT` and no longer `sim::AnatomyRegion::COUNT`, and the
/// two are now different numbers.** This section publishes what the contact
/// phase *sweeps*; the pose block's per-region arrays publish what anatomy
/// *has*. They were one number by coincidence until an arm became two capsules.
/// See the assertion in `emit_abi.rs` that states the relation between them.
pub const REGIONS_PER_BODY: usize = sim::BODY_VOLUME_COUNT;

/// Rows the region buffer holds: [`REGIONS_PER_BODY`] for each of the
/// [`MAX_POSES`] bodies the pose buffer holds.
///
/// **The two capacities are one capacity**, because the sections are read
/// together: region row `n` belongs to pose row `n / REGIONS_PER_BODY`, and a
/// region buffer that could fill before the pose buffer did would publish a
/// half body.
pub const MAX_REGIONS: usize = MAX_POSES * REGIONS_PER_BODY;

/// Words in one region row.
pub const REGION_STRIDE: usize = 8;

pub const REGION_LOWER_X: usize = 0;
pub const REGION_LOWER_Y: usize = 1;
pub const REGION_LOWER_Z: usize = 2;
pub const REGION_UPPER_X: usize = 3;
pub const REGION_UPPER_Y: usize = 4;
pub const REGION_UPPER_Z: usize = 5;
pub const REGION_RADIUS: usize = 6;
/// Whether this region exists at all: zero or one, on the word rules above.
///
/// **The eighth word, and it is here because presence cannot be inferred from
/// the seven in front of it.** A severed limb stops existing, and a reader that
/// read absence off a zero-length capsule would drop the *head* -- which is a
/// sphere, whose two endpoints coincide, on every body, on every tick. That is
/// not a corner case this column defends against; it is the ordinary case.
///
/// It is a per-region word rather than a per-body mask for two reasons. The row
/// is then [`sim::RegionVolume`] exactly, all four fields of it, with no field
/// of the struct the host decided to encode its own way; and every column list
/// in this ABI is `0..STRIDE`, which a mask word hanging off the end of five
/// rows would break -- see `generated_presentation_offsets_cover_every_packed_column`.
///
/// The third candidate was to publish nothing and let a reader derive it from
/// [`POSE_SEVERED_MASK`], which is where the sim's `present` argument comes from
/// today. **Rejected, and on this session's own argument**: that is a
/// re-derivation on the reader's side, and the day presence stops being exactly
/// "not severed" the two answers part company silently, with a viewer drawing a
/// capsule the contact phase does not sweep. The whole point of publishing these
/// volumes is that the host does not compute them twice.
pub const REGION_PRESENT: usize = 7;

// ------------------------------------------------ articulated projectiles

/// Version of the articulated-projectile row layout. This is a separate
/// publication from the legacy frame's four-word shot rows: those are a 2D
/// presentation of the Legacy model, while these are the authoritative 3D
/// arrows owned by the articulated runtime.
pub const ARTICULATED_PROJECTILE_LAYOUT_VERSION: u32 = 1;

/// The articulated runtime uses the simulation's shot cap for its isolated
/// projectile store. Written through the already-authoritative web constant so
/// a capacity change cannot leave two browser limits behind.
pub const MAX_ARTICULATED_PROJECTILES: usize = MAX_SHOTS;

/// Words in one live articulated projectile row.
pub const ARTICULATED_PROJECTILE_STRIDE: usize = 12;

pub const ARTICULATED_PROJECTILE_SLOT: usize = 0;
pub const ARTICULATED_PROJECTILE_GENERATION: usize = 1;
pub const ARTICULATED_PROJECTILE_OWNER_INDEX: usize = 2;
pub const ARTICULATED_PROJECTILE_OWNER_GENERATION: usize = 3;
pub const ARTICULATED_PROJECTILE_POSITION_X: usize = 4;
pub const ARTICULATED_PROJECTILE_POSITION_Y: usize = 5;
pub const ARTICULATED_PROJECTILE_POSITION_Z: usize = 6;
pub const ARTICULATED_PROJECTILE_VELOCITY_X: usize = 7;
pub const ARTICULATED_PROJECTILE_VELOCITY_Y: usize = 8;
pub const ARTICULATED_PROJECTILE_VELOCITY_Z: usize = 9;
pub const ARTICULATED_PROJECTILE_RADIUS: usize = 10;
pub const ARTICULATED_PROJECTILE_REMAINING_RANGE: usize = 11;

// -------------------------------------------------------- the embodied stance
//
// What the legs are doing. A fifth publication and not six more pose columns,
// on the region section's argument exactly: a pose row is written for every
// articulated body and a stance existed only under the embodied model, so
// folding these in would have widened every row of every fight to carry words
// most of them did not have -- and it would still move [`POSE_LAYOUT_VERSION`],
// which is a version about pose columns and has nothing to say about hips. One
// model is left and every body in it has legs, which retires the first half of
// that argument and not the second.
//
// The row is [`sim::StanceView`] word for word, and the host derives none of it.
// `twist_raw` in particular is the sim's own derived word: `StanceState` refuses
// to *store* a twist because a stored copy is a second thing that can disagree
// with the two angles it is a function of, and a reader that subtracted
// `EMBODIED_STANCE_HIP_YAW_RAW` from `POSE_BODY_YAW_RAW` itself would be exactly
// the second copy that rule exists to prevent -- it would also miss the clamp
// that bounds the twist, which lives on the torso's target and not on either
// angle.

/// Version of the stance row layout. Its own number rather than a second
/// reading of [`POSE_LAYOUT_VERSION`], for [`REGION_LAYOUT_VERSION`]'s reason:
/// this section adds no pose column, and a pose column moving says nothing about
/// these six words.
pub const EMBODIED_STANCE_LAYOUT_VERSION: u32 = 1;

/// Rows the stance buffer holds: one for every body the pose buffer can hold.
///
/// Written as [`MAX_POSES`] and never as a second literal 64, exactly as that
/// constant is written as `sim::MAX_ENTITIES`. A body with legs is a
/// body that also publishes a pose, so a stance cap that could fill first would
/// drop the legs of a body whose torso crossed -- which is the half-a-body
/// failure [`MAX_REGIONS`] is written this way to refuse.
pub const MAX_EMBODIED_STANCE: usize = MAX_POSES;

/// Words in one stance row.
pub const EMBODIED_STANCE_STRIDE: usize = 6;

pub const EMBODIED_STANCE_ENTITY_INDEX: usize = 0;
pub const EMBODIED_STANCE_ENTITY_GENERATION: usize = 1;
/// The hip bearing in world space -- which way the feet point, which is not
/// which way the torso faces. Widened from the raw binary turn on the word rules
/// above.
pub const EMBODIED_STANCE_HIP_YAW_RAW: usize = 2;
/// Pelvis height as a **fraction of standing height**, not a world-space z: what
/// a renderer wants is how far the body has sunk relative to its own size, and
/// the size is already in the anatomy it holds.
pub const EMBODIED_STANCE_PELVIS_RAW: usize = 3;
/// Signed hip-to-torso twist in raw angle units, two's complement rather than
/// widened -- it is a signed delta and not an [`Angle`].
pub const EMBODIED_STANCE_TWIST_RAW: usize = 4;
/// Ticks remaining in a forced step; zero when the body is settled.
pub const EMBODIED_STANCE_STEP_LEFT: usize = 5;

/// Version of the combat-event row layout.
pub const COMBAT_EVENT_LAYOUT_VERSION: u32 = 1;

/// Rows the combat-event buffer holds, across every tick of one `step` call.
///
/// **2048 because the provisional 256 and then 1024 were measured and
/// rejected.** The reference's `abi-high-water` corpus -- world seed
/// `0x4152504741424931`, an open 24x16 room, 64 bodies as 32 Fighter/Brute
/// pairs three halves of a unit apart, one submitted command each at tick zero
/// and none after, and exactly one `step(8)` -- accumulated **446 rows** across
/// that single eight-tick batch when the ABI was written. At 256 the host
/// published the canonical 256 and counted 190 dropped, which is a truncated
/// stream on a fixture the reference calls mandatory. The reference's rule for
/// a rejected capacity is the next power of two at least twice the measured
/// maximum: 446 doubles to 892 and rounds up to 1024.
///
/// The same corpus then accumulated **556 rows**, because v2-17 checkpoint B
/// stopped the contact projector charging every trial for its own inverse-map
/// drift and more of each proposed impulse survives the energy check. Nothing
/// was dropped at 1024 -- but the acceptance rule is headroom, not survival,
/// and 556 doubles to 1,112. So the capacity is 2048 and the byte budget below
/// moved with it, at a cost of 128 KiB of static linear memory.
///
/// **It reads 354 today** (2026-08-10), and the direction is the surprise:
/// checkpoint B's centre-of-mass sampling was expected to raise the event rate
/// and lowered it by a third. A row is published per contact *resolution*, and
/// a blade that carries its own swing into the impulse separates the pair it
/// hit -- so the same clinch spends fewer ticks re-resolving the same key. The
/// capacity stays 2048 rather than dropping back to 1024: the acceptance rule
/// sizes a capacity against the busiest measurement anyone has taken, and 556
/// is still that measurement on a fixture one mechanics change away.
///
/// Re-measured by `the_high_water_corpus_fills_at_most_half_the_event_buffer`,
/// which is what fails if a change doubles event production -- the failure this
/// number exists to turn into a test rather than a silently cut feed. It has
/// now caught both of the two ways it said it could: a capacity that shrank and
/// a fight that got busier.
pub const MAX_COMBAT_EVENTS: usize = 2048;

/// Words in one combat-event row.
///
/// Thirty-two rather than twenty-five because **no host mirror may narrow a
/// `u64` resolution channel**: the group energy ledger and the four damage
/// channels are `u64` in the solver, so each crosses as a low/high pair. A
/// truncated ledger is a silently wrong number that no assertion downstream
/// could distinguish from a small one.
pub const COMBAT_EVENT_STRIDE: usize = 32;

pub const COMBAT_EVENT_TICK: usize = 0;
pub const COMBAT_EVENT_TOI_RAW: usize = 1;
pub const COMBAT_EVENT_GROUP_ORDINAL: usize = 2;
pub const COMBAT_EVENT_A_INDEX: usize = 3;
pub const COMBAT_EVENT_A_GENERATION: usize = 4;
pub const COMBAT_EVENT_B_INDEX: usize = 5;
pub const COMBAT_EVENT_B_GENERATION: usize = 6;
pub const COMBAT_EVENT_A_SLOT: usize = 7;
pub const COMBAT_EVENT_B_SLOT: usize = 8;
pub const COMBAT_EVENT_KIND: usize = 9;
pub const COMBAT_EVENT_POINT_X: usize = 10;
pub const COMBAT_EVENT_POINT_Y: usize = 11;
pub const COMBAT_EVENT_POINT_Z: usize = 12;
pub const COMBAT_EVENT_NORMAL_X: usize = 13;
pub const COMBAT_EVENT_NORMAL_Y: usize = 14;
pub const COMBAT_EVENT_NORMAL_Z: usize = 15;
pub const COMBAT_EVENT_ENERGY_BEFORE_LO: usize = 16;
pub const COMBAT_EVENT_ENERGY_BEFORE_HI: usize = 17;
pub const COMBAT_EVENT_ENERGY_AFTER_LO: usize = 18;
pub const COMBAT_EVENT_ENERGY_AFTER_HI: usize = 19;
pub const COMBAT_EVENT_ENERGY_DISSIPATED_LO: usize = 20;
pub const COMBAT_EVENT_ENERGY_DISSIPATED_HI: usize = 21;
pub const COMBAT_EVENT_CUT_LO: usize = 22;
pub const COMBAT_EVENT_CUT_HI: usize = 23;
pub const COMBAT_EVENT_THRUST_LO: usize = 24;
pub const COMBAT_EVENT_THRUST_HI: usize = 25;
pub const COMBAT_EVENT_PRESSURE_LO: usize = 26;
pub const COMBAT_EVENT_PRESSURE_HI: usize = 27;
pub const COMBAT_EVENT_DEFLECTED_LO: usize = 28;
pub const COMBAT_EVENT_DEFLECTED_HI: usize = 29;
/// The `BodyPart` this fact names, or [`COMBAT_EVENT_NO_BODY_PART`].
pub const COMBAT_EVENT_BODY_PART: usize = 30;
pub const COMBAT_EVENT_SEVERED: usize = 31;

/// What [`COMBAT_EVENT_BODY_PART`] holds when the fact names no anatomy at all
/// -- weapon against weapon and weapon against shield.
///
/// `u32::MAX` rather than the sim's own `0xff`, because the column is a word:
/// widening the sentinel would leave `255` looking like a plausible region
/// index to a reader that had lost track of the width.
pub const COMBAT_EVENT_NO_BODY_PART: u32 = u32::MAX;

/// The five static arrays cost this much linear memory, once, forever.
///
/// Written out as the arithmetic rather than as `289_280` so that a stride or a
/// capacity moving is a failed assertion here and not a stale comment: the
/// reference charges v2-16 and v2-ui-06 exactly these bytes, and the
/// [`EMBODIED_COMMAND_BYTES`] scratch belongs to v2-11 and is not charged
/// again -- it was the articulated scratch of the same shape until the
/// articulated submission was deleted, and the sixty-one bytes it costs are as
/// uncharged as the fifty-seven were.
///
/// It was 49,664 while [`MAX_COMBAT_EVENTS`] was the provisional 256, and
/// 147,968 while it was 1024. The measurements that rejected each of those are
/// written out there; what they cost is written out here, because 98 KB and
/// then 128 KB more linear memory is the price of those decisions and a budget
/// that quietly followed the constant would hide it.
///
/// **v2-ui-06 added the third term and it is the cheapest of the three:** 10,240
/// bytes, 3.7% on top of the 279,040 the two v2-16 arrays cost, for the five
/// swept capsules per body that `[Geometry]` mode is. Eight words a region and
/// not seven, because presence is published rather than inferred -- see
/// [`REGION_PRESENT`], which is what the eighth word buys and what the extra
/// 1,280 bytes of it cost.
///
/// **The forearm collider grew that third term by two rows a body**, 10,240 to
/// 14,336, because [`REGIONS_PER_BODY`] is the swept-volume count and a jointed
/// arm is two capsules. It is charged on every body including the single-link
/// ones whose last two rows are always absent, for the reason the stance section
/// gives below: a fixed array is charged once, and one that appeared when an
/// embodied world was installed would grow linear memory on that call and detach
/// every typed array the page holds.
///
/// **The stance section is the fifth term and the cheapest of the five:** 1,536
/// bytes, half a percent on top of the 290,816 the four before it cost, for the
/// six words a pair of legs is. It is charged whether or not the installed world
/// has any, which is what a fixed array buys and a lazily allocated one would
/// give away -- a buffer that appeared when an embodied world was installed
/// would grow linear memory on that call and detach every typed array the page
/// is holding.
///
/// **What this budget charges is the five published arrays and nothing else,
/// which is worth stating because it is not the whole of the crate's static
/// footprint.** [`Sim::anatomy`] is another fixed array -- roughly 15 KB inside
/// the `SIM` thread-local, one `BodyAnatomySpec` slot per [`MAX_POSES`] -- and
/// it is deliberately absent from this number: this one exists so a stride or a
/// capacity moving fails an assertion, and the anatomy table is neither. It is
/// under a page and did not move any measured page count.
const _: () = assert!(
    MAX_POSES * POSE_STRIDE * 4
        + MAX_COMBAT_EVENTS * COMBAT_EVENT_STRIDE * 4
        + MAX_REGIONS * REGION_STRIDE * 4
        + MAX_ARTICULATED_PROJECTILES * ARTICULATED_PROJECTILE_STRIDE * 4
        + MAX_EMBODIED_STANCE * EMBODIED_STANCE_STRIDE * 4 == 296_448,
    "the articulated publication budget is 16,896 pose bytes plus 262,144 event bytes \
     plus 14,336 region bytes plus 1,536 projectile bytes plus 1,536 stance bytes",
);

// ---------------------------------------------------------- the arena config
//
// A duel described from the browser: two anatomies, two policies, two spawns and
// four hand items with their dimensions. Roughly forty scalars with cross-field
// validity -- bindings against each other, ids against each other, actions
// against the loadout -- which is why it is a staging buffer and not a sequence
// of setter calls. A setter sequence has partially-written intermediate states
// and no single point at which the whole thing can be judged and refused, and
// this configuration has to be judged whole or not at all: [`Scenario::duel_from`]
// answers one error for the pair.
//
// **This used to contradict the route section, and the argument outlived it.**
// `route_push` was three scalar exports beside this one, justified by "a second
// buffer would be a second detachable view for no gain", and both claims were
// true at once. What separated the cases was never cost: a waypoint is **two
// scalars with no cross-field rule**, so there was nothing a buffer could judge
// that a setter could not; a duel configuration is **forty with seven**, so
// there is nothing a setter can judge at all. The rule the two shared is one
// buffer per thing that must be judged whole, and neither "buffers are cheap"
// nor "buffers are expensive". The route exports are gone -- see the standing
// order section -- and the rule is worth keeping without them.
//
// The pattern is [`EMBODIED_COMMAND`]'s exactly, down to the guard bytes: a
// fixed array that never moves and never grows linear memory, a `u16` layout
// version in bytes `0..2`, and one consumer that copies all of it into a local
// before it reads any of it.
//
// ```text
//     header    [0..2] layout version, [2] fighter count, [3] reserved,
//               [4..8] max_ticks
//     fighter   [0] anatomy, [1] policy, [2] control, [3] reserved,
//               [4..8] spawn x, [8..12] spawn y, then two hand blocks
//     hand      [0] item, [1] two-handed grip (right hand only), then mass,
//               balance and three dimension words
// ```
//
// Every dimension is an `i32` raw 16.16 and every multi-byte field is
// little-endian, which is [`submit_embodied`]'s grammar and not a second one.

/// Bytes `0..2` of [`ARENA_CONFIG`], and its sole layout field.
///
/// `3` since arena-02: layout `2` required byte `2` of every fighter block to be
/// zero, and that byte now carries [`ARENA_CONTROL_POLICY`] or
/// [`ARENA_CONTROL_HUMAN`]. A byte that stops being reserved is a layout change,
/// not a free bit, because a version-2 writer's promise about it no longer
/// holds -- and the promise was real rather than notional: layout `2` refused a
/// nonzero byte `2` with [`ARENA_NONCANONICAL`], so a version-2 buffer carrying
/// a `1` there was a refusal and would now be a human side.
///
/// `2` was combat-arms-01's, for the same reason one layout down: layout `1`
/// required every hand block's byte `1` to be zero, and that byte now carries
/// the two-handed grip on the right hand.
pub const ARENA_CONFIG_LAYOUT_VERSION: u16 = 3;

/// An item code, the two-handed grip byte, and five 16.16 words: mass, balance,
/// and three dimensions.
///
/// Three dimension words rather than two because a shield is the widest shape in
/// the table -- `half_width`, `half_height`, `thickness` -- and a fixed stride is
/// what makes the block addressable. A segment spends two of the three and the
/// third must be zero; see [`ARENA_NONCANONICAL`].
pub const ARENA_HAND_BYTES: usize = 22;

/// Anatomy, policy, control, one reserved byte, two spawn words, and two hand
/// blocks.
pub const ARENA_FIGHTER_BYTES: usize = 56;

/// The header plus one fighter block per side.
pub const ARENA_CONFIG_BYTES: usize = ARENA_HEADER_BYTES + 2 * ARENA_FIGHTER_BYTES;

const ARENA_HEADER_LAYOUT: usize = 0;
/// How many fighters the buffer describes. Must be `2`; see
/// [`ARENA_WRONG_FIGHTER_COUNT`] for why a wrong count is its own refusal rather
/// than an unknown layout.
const ARENA_HEADER_FIGHTERS: usize = 2;
const ARENA_HEADER_RESERVED: usize = 3;
const ARENA_HEADER_MAX_TICKS: usize = 4;
const ARENA_HEADER_BYTES: usize = 8;

const ARENA_FIGHTER_ANATOMY: usize = 0;
const ARENA_FIGHTER_POLICY: usize = 1;
/// Who fills this side's navigation and primary arm: [`ARENA_CONTROL_POLICY`]
/// or [`ARENA_CONTROL_HUMAN`].
///
/// **The first of the two bytes [`ARENA_FIGHTER_RESERVED`] used to hold**, and
/// spending it is what took the layout from `2` to `3`. It is deliberately the
/// *low* one rather than the spare: the block reads anatomy, policy, control,
/// which is the order a reader picks them in, and the reserved byte stays where
/// a reader stops caring.
const ARENA_FIGHTER_CONTROL: usize = 2;
/// One byte, still reserved, and still doing both of the jobs the two did:
/// the alignment -- without it `spawn x` would start at an odd offset inside the
/// block -- and the room a policy or anatomy registry past 256 entries would
/// grow into, which is cheaper to reserve now than to version later.
const ARENA_FIGHTER_RESERVED: usize = 3;
const ARENA_FIGHTER_SPAWN_X: usize = 4;
const ARENA_FIGHTER_SPAWN_Y: usize = 8;
const ARENA_FIGHTER_HANDS: usize = 12;

const ARENA_HAND_ITEM: usize = 0;
/// `1` to grip this hand's item with both hands, else `0`.
///
/// Only the **right** hand's byte may be `1`, and only over an item: the right
/// arm owns a `Both` grip (`canonical_grip_pair`'s rule), so a marker on the
/// left block or on an empty hand describes nothing and is refused as
/// noncanonical, exactly as any other value above `1` is. Reserved-zero under
/// layout `1`, which is why claiming it was a layout version bump.
const ARENA_HAND_TWO_HANDED: usize = 1;
const ARENA_HAND_MASS: usize = 2;
const ARENA_HAND_BALANCE: usize = 6;
/// Segment length, or a shield's half-width.
const ARENA_HAND_DIMENSION_0: usize = 10;
/// Segment radius, or a shield's half-height.
const ARENA_HAND_DIMENSION_1: usize = 14;
/// A shield's thickness. Zero for a segment.
const ARENA_HAND_DIMENSION_2: usize = 18;

/// [`ARENA_FIGHTER_CONTROL`]: this side is decided entirely by its policy byte.
///
/// **Zero because that is what every layout-2 configuration meant.** The byte
/// was reserved-zero, so the one value a version-2 writer could legally put
/// there is the one value that has to keep meaning what it meant, or the bump
/// would be a reinterpretation dressed as an extension.
pub const ARENA_CONTROL_POLICY: u8 = 0;
/// [`ARENA_FIGHTER_CONTROL`]: this side's navigation and primary arm come from
/// the host.
///
/// Its policy byte still builds the mind that drives the off hand, which is why
/// there is one byte here and not a second policy slot: a human side needs a
/// policy either way, and two fields that must agree are two fields that can
/// disagree.
///
/// Arena-05 builds the host input path. The configuration carried the choice
/// one session before anything could act on it, and the now-retired
/// [`ARENA_CONTROL_UNAVAILABLE`] refusal kept that intermediate build honest.
pub const ARENA_CONTROL_HUMAN: u8 = 1;

/// What [`ARENA_HAND_ITEM`] holds for an empty hand.
///
/// [`SLOT_EMPTY`] narrowed to a byte, and deliberately the same number the
/// loadout exports already use for "a slot nothing is in": the host owns one
/// vocabulary for absence and not two. Every other value is an
/// [`sim::ActionKind::code`].
pub const ARENA_HAND_EMPTY: u8 = SLOT_EMPTY as u8;

/// Hand index `0` is [`sim::LimbSlot::LeftArm`] and `1` is `RightArm`, which is
/// what [`sim::DuelFighterV1::hands`] indexes by and what its `binding` is set
/// from. Pinned by `left_and_right_limb_slots_have_stable_discriminants`.
const ARENA_HANDS: usize = 2;

/// What [`ARENA_HEADER_FIGHTERS`] must hold. Fighter `0` fights for
/// [`Faction::Heroes`] and fighter `1` for `Monsters`, which
/// [`sim::DuelConfigV1::fighters`] fixes rather than chooses.
const ARENA_FIGHTERS: usize = 2;

// **The `controlled_robust_strike` preset was deleted in v2-ui-08, and this note
// is what is left of it.** `controlled_robust_strike_bytes` wrote an exact
// 120-byte configuration, `install_arena` compared the whole buffer against it,
// and an exact match swapped fighter A's policy for
// `TacticalArticulatedPolicy::controlled_robust_strike` -- a frozen
// ordinal-3144 schedule from the paused smart-ai topic. Three tests pinned it:
// the buffer's own bytes, that one nearby byte did not activate it, and an
// exact energy ledger on the attributed Legs event at tick 45 of 53.
//
// It went for two reasons and not one. The schedule wrote **world** bearings --
// `robust_strike_schedule_command` derived them from a declared spawn offset --
// and this arena reads a bearing from the torso; the same numbers are a
// different swing, so the pinned ledger would have
// had to be re-recorded to say anything, and a re-recorded pin proves nothing
// about the session that moved it. And the preset lived in
// `crates/policy/src/articulated_tactics.rs`, **which has since been deleted
// with the articulated policies**, so the second reason has finished happening:
// keeping the preset would have meant keeping a world-frame command builder
// alive inside a torso-frame policy for one call site the page could not reach
// except by writing 120 exact bytes.
//
// **What was lost, named rather than glossed.** The ledger assertion was this
// module's only pin on a *specific* published combat event -- one blow, one
// tick, six energy words -- and nothing replaces it byte for byte. What still
// holds the arena's publication path is
// `a_scripted_arena_fight_in_wasm_matches_the_same_fight_in_lab`, which compares
// the whole fight against `lab`'s loop rather than one row of it, and
// `ARTICULATED_STREAM_DIGEST`, which folds every published buffer for
// `STREAM_DIGEST_TICKS`. Both are wider and neither is exact about one blow.
// A session that wants that assertion back should write it against an embodied
// fixture and record the ledger from that fixture, not from this one.

// The arithmetic, asserted rather than commented, so that moving one offset is a
// failed build here instead of a wrong sentence three files away. The three
// shapes the reference states are 1+1+1+1+4+4+2*22 = 56 and 8 + 2*56 = 120.
//
// **The control byte is pinned from both sides and not just placed**, because
// "byte 2" is now a claim two mirrors and a document repeat: it must sit
// immediately after the policy byte and immediately before the byte that is
// still reserved. Either half alone would let it slide one place and keep the
// block 56 bytes wide.
const _: () = assert!(
    ARENA_FIGHTER_POLICY + 1 == ARENA_FIGHTER_CONTROL
        && ARENA_FIGHTER_CONTROL + 1 == ARENA_FIGHTER_RESERVED
        && ARENA_FIGHTER_RESERVED + 1 == ARENA_FIGHTER_SPAWN_X,
    "a fighter block is anatomy, policy, control and one reserved byte before its spawn",
);
const _: () = assert!(
    ARENA_HAND_DIMENSION_2 + 4 == ARENA_HAND_BYTES,
    "a hand block is an item code, a reserved byte and five 16.16 words",
);
const _: () = assert!(
    ARENA_FIGHTER_HANDS + ARENA_HANDS * ARENA_HAND_BYTES == ARENA_FIGHTER_BYTES,
    "a fighter block is four header bytes, two spawn words and two hand blocks",
);
const _: () = assert!(
    ARENA_HEADER_MAX_TICKS + 4 == ARENA_HEADER_BYTES,
    "the header is a layout version, a count, a reserved byte and max_ticks",
);
const _: () = assert!(
    ARENA_CONFIG_BYTES == 120,
    "the arena configuration buffer is 120 bytes",
);

// ------------------------------------------------- why the arena refused you
//
// [`arena_start`] packs its answer with [`submit_result`], so a refusal is a
// reason byte, a fighter byte and a hand byte beside an outcome of zero.
//
// **Every refusal has its own number.** One opaque zero would make the studio
// say "invalid" for a typo, for an impossibility and for a session that has not
// landed yet, and a reader cannot tell those apart from the outside -- which is
// the difference between a picker somebody can use and a picker somebody
// abandons. The mapping over [`sim::CombatSpecError`] is written as an
// exhaustive `match` for the same reason the pose row's is: a variant appended
// to that enum has to be thought about here rather than collapsing into
// whichever arm was convenient.
//
// **Fourteen of these are reachable from a control and the rest are not, and
// the split is not the one v2-ui-05 predicted.** This sentence read "thirteen"
// over a list of twelve until arena-02 counted it, which is the defect the list
// below exists to prevent and which the heading had quietly acquired anyway:
// count from the list, never from the sentence. The plan named `Fraction`,
// `Maximum`, `IdOrder`, `MissingReference`, `LoadoutMismatch`,
// `TooManyAnatomies` and `TooManyEquipment` as slider-reachable. They are not,
// and `Scenario::duel_from`'s own doc comment says why in as many words:
// `binding` comes from the hand index and the `Loadout` comes from the carrying
// slots, so "`LoadoutMismatch` is unreachable from any knob here"; ids are
// numbered `1..N` ascending by construction; the surfaces and the anatomy
// maxima are copied off the shipped rows a picker cannot touch; and the table
// holds at most two anatomies and four equipment rows against caps of 64 and
// 128. v2-ui-04 made them unreachable on purpose. They keep distinct codes
// anyway, because the alternative is a host that maps five refusals onto one
// number on the argument that they cannot happen -- and the day one does, the
// page says "invalid" and nobody can find out which.
//
// Reachable today: unknown layout, wrong fighter count, noncanonical bytes,
// unknown anatomy, unknown item, unknown policy, a refused construction,
// `Dimension`, `GripConflict`, `NoEquipment`, `UnknownAction`, the Bow's one
// canonical grip, and arena-02's two control refusals -- an unknown control
// byte and a human side this build has no input path for. Fourteen.
//
// **Two of these are retired rather than merely unreachable, and the difference
// matters.** The seven spec errors above are refusals `crates/sim` can still
// answer and this parser can no longer provoke -- a widened control brings them
// back without a byte moving. `ARENA_POLICY_UNAVAILABLE` (7) and
// `ARENA_NO_CHECKPOINT` (26) are not like that: v2-ui-08 moved the arena onto
// `PolicyKind`, whose `build` returns a policy and never an `Option`,
// and whose registry has no `learned` entry for a checkpoint to be missing
// *for*. There is no control to widen and no asset to fetch. They have no
// producer and no path back to one.
//
// **The numbers stay put anyway, and are refused by their numbers.** This is the
// codec's rule for a retired schema (`crates/sim/src/codec.rs`, the paragraph
// above `ARTICULATED_COMMAND_SCHEMA_RESERVED`): a wire value that once meant
// something is not recycled, because a host still holding it must be told it is
// wrong rather than quietly given a different meaning. Renumbering 27 down into
// 26 would make every already-shipped page that maps 26 to "load a checkpoint"
// silently correct about the byte and wrong about the fight.
// `the_arena_configuration_buffer_is_the_documented_layout` walks the reason set
// and is what says the two are still declared, still distinct and still
// unproduced.

/// Nothing was wrong. Paired with an outcome of `1`.
pub const ARENA_OK: u8 = 0;
/// Bytes `0..2` are not [`ARENA_CONFIG_LAYOUT_VERSION`], or the header's
/// reserved byte is not zero. Folded together exactly as [`submit_embodied`]
/// folds them: both mean the writer and the reader disagree about the buffer,
/// and the attempted version is still sitting in the buffer for a diagnostic to
/// read.
pub const ARENA_UNKNOWN_LAYOUT: u8 = 1;
/// Byte `2` is not `2`.
///
/// Its own refusal rather than an unknown layout, because the two point
/// somewhere different: a wrong version means "rebuild the page", and a wrong
/// count means "this build fights duels". `MAX_POSES` is 64 and nothing below
/// the studio assumes two, so widening this is additive -- which is exactly why
/// the count is a field and not a constant nobody wrote down.
pub const ARENA_WRONG_FIGHTER_COUNT: u8 = 2;
/// A reserved byte, a dimension word this item's geometry does not have, or a
/// two-handed grip byte that describes nothing -- on the left hand, on an empty
/// hand, or above `1` -- is not zero.
///
/// `submit_embodied`'s rule, applied to the wider buffer: noncanonical
/// ignored payloads are rejected. An ignored word is a place for a
/// misunderstanding to live -- a caller that believed a sword had a thickness
/// would be right about the bytes and wrong about the fight -- and the studio
/// writes all 120 bytes from its own model anyway, so zeroing what it is not
/// using costs it nothing.
pub const ARENA_NONCANONICAL: u8 = 3;
/// A fighter's anatomy byte is neither `0` (Fighter) nor `1` (Brute).
pub const ARENA_UNKNOWN_ANATOMY: u8 = 4;
/// A hand's item byte is neither [`ARENA_HAND_EMPTY`] nor an
/// [`sim::ActionKind::code`]. Distinct from [`ARENA_UNKNOWN_ACTION`], which is
/// an action that exists and has no equipment row.
pub const ARENA_UNKNOWN_ITEM: u8 = 5;
/// A fighter's policy byte is not an [`policy::PolicyKind::code`].
///
/// **The one policy refusal with a producer since v2-ui-08**, and the reason it
/// is worth saying so is that the other two below used to share the work. A
/// stale saved code -- `4` meant `learned` on the articulated registry and means
/// `tactical-fixed-guard` on this one, and `5` and `6` meant `tactical` and
/// `openings` and mean nothing -- arrives here and is named.
pub const ARENA_UNKNOWN_POLICY: u8 = 6;
/// **Retired in v2-ui-08. The number is reserved and nothing produces it.**
///
/// It meant "the policy is one this build cannot construct", with the code in
/// the slot byte so the refusal named it. That sentence needed a registry with
/// an entry the boundary could not build, and there is no longer one:
/// [`policy::PolicyKind::build`] returns a policy rather than an
/// `Option`, on the argument written out on the enum itself -- nothing in that
/// registry is fifteen kilobytes of weights.
///
/// **Retired and not deleted, and the difference is the wire.** These bytes
/// cross a worker boundary and outlive a build in whatever a page saved. A
/// number that once meant something is refused by that number rather than
/// recycled -- `crates/sim/src/codec.rs` states the rule for a retired command
/// schema and this is the same rule. Renumbering [`ARENA_BOW_GRIP`] down into
/// this slot would leave every shipped page that maps `7` to "rebuild" correct
/// about the byte and wrong about the fight.
pub const ARENA_POLICY_UNAVAILABLE: u8 = 7;
/// The sim refused to build the world even though the specification validated.
///
/// The reachable case is placement: `World::try_new` checks every unit's contact
/// envelope against the arena, so a spawn dragged through the wall, or a blade
/// long enough to reach out of the room from where it stands, lands here. The
/// error is not carried through [`Sim::try_on`], which answers `Option` because
/// the legacy path has no use for the reason.
pub const ARENA_CONSTRUCTION_REFUSED: u8 = 8;
/// The world was built and would not reserve its contact vectors.
///
/// It cannot happen at [`MAX_UNITS`] -- the entity limit is the same number --
/// so what is left is an out-of-memory module. Refused rather than installed
/// anyway, on [`install_articulated`]'s argument: a world whose next contact
/// could grow linear memory would detach every typed array the page holds.
pub const ARENA_RESERVATION_REFUSED: u8 = 9;
/// `ScenarioFingerprintError::NameTooLong`. Unreachable: the name is the fixed
/// `configured-duel-v1`. Its own code because `try_fingerprint` can answer it
/// and a host that folded it into a spec error would be reporting a fiction.
pub const ARENA_NAME_TOO_LONG: u8 = 10;

// One code per `CombatSpecError`, in declaration order, so that appending a
// variant there is a non-exhaustive `match` here rather than a silent remap.
pub const ARENA_MISSING_TABLE: u8 = 11;
pub const ARENA_UNEXPECTED_TABLE: u8 = 12;
pub const ARENA_UNIT_PRESENCE: u8 = 13;
pub const ARENA_TOO_MANY_ANATOMIES: u8 = 14;
pub const ARENA_TOO_MANY_EQUIPMENT: u8 = 15;
pub const ARENA_ID_ORDER: u8 = 16;
pub const ARENA_UNKNOWN_SCHEMA: u8 = 17;
/// A length, a radius, a mass or a balance outside the scale. The one spec error
/// a dimension control reaches directly, and the busiest of these in practice.
pub const ARENA_DIMENSION: u8 = 18;
pub const ARENA_FRACTION: u8 = 19;
pub const ARENA_MAXIMUM: u8 = 20;
pub const ARENA_MISSING_REFERENCE: u8 = 21;
pub const ARENA_LOADOUT_MISMATCH: u8 = 22;
/// Two plates on one body, or a two-handed binding against a plate.
/// `validate_bindings` classifies by geometry rather than by action, so this
/// cannot be evaded by calling the second plate something else.
pub const ARENA_GRIP_CONFLICT: u8 = 23;
/// Both of a fighter's hands are empty.
pub const ARENA_NO_EQUIPMENT: u8 = 24;
/// An action with no shipped equipment row -- a knife, a fist, a run or the
/// shortsword -- and so no measured surface to copy. Four of the eight actions
/// land here; Bow owns a runtime row without changing the hashed fixture table.
pub const ARENA_UNKNOWN_ACTION: u8 = 25;

/// **Retired in v2-ui-08, in the same session that produced it. The number is
/// reserved and nothing produces it.**
///
/// It meant "a fighter asked for `learned` and no checkpoint is installed", with
/// the policy code in the slot byte. It was worth its own number beside
/// [`ARENA_POLICY_UNAVAILABLE`] because a studio could act on it -- the answer
/// was [`load_checkpoint`] and not a rebuild. What removed it is that
/// [`policy::PolicyKind`] has no `learned` entry for a fighter to ask
/// for: a trained fighter is a kind plus a checkpoint, an arena policy byte has
/// nowhere to put one, and session 09 deferred the widening that would earn the
/// code. The checkpoint machinery itself is untouched -- [`load_checkpoint`]
/// still validates and installs, and [`learned_inference_digest`] is still taken
/// over what it installed, which is the pinned portability claim `AGENTS.md`
/// calls the digest's fifth owner. What no longer exists is a fighter built out
/// of it.
///
/// Reserved rather than deleted, on the argument beside `7`.
pub const ARENA_NO_CHECKPOINT: u8 = 26;
/// A Bow was not the sole item in the right hand under a two-handed grip.
///
/// Appended rather than inserted beside ARENA_NO_EQUIPMENT, because these
/// bytes cross a worker boundary and the already-shipped refusal meanings do
/// not move when the sim inserts a more precise enum variant.
pub const ARENA_BOW_GRIP: u8 = 27;

/// A fighter's control byte is neither [`ARENA_CONTROL_POLICY`] nor
/// [`ARENA_CONTROL_HUMAN`].
///
/// Distinct from [`ARENA_NONCANONICAL`], which is what byte `2` answered while
/// it was reserved, and the two say different things to a reader: noncanonical
/// means "this field has no meaning and you wrote in it", unknown control means
/// "this field has a meaning and yours is not one of them". A layout-2 page
/// bumped to layout 3 without learning the byte writes a zero and gets a fight;
/// a layout-4 page writing a control this build has not heard of gets named.
pub const ARENA_UNKNOWN_CONTROL: u8 = 28;
/// A human side was configured before this build had an arena input path.
///
/// **Retired by arena-05 rather than renumbered.** The code stays spent, on the
/// rule [`ARENA_POLICY_UNAVAILABLE`] and [`ARENA_NO_CHECKPOINT`] already
/// established: a URL or a saved configuration can carry a refusal code, so
/// renumbering one down into a gap makes an old artifact say something new.
///
/// **It is the point of arena-02 and not a leftover.** The configuration learns
/// who drives a side one session before `advance_arena` can consult it, and the
/// alternative to refusing was a control that took "you" and ran the policy --
/// which is the shape two consecutive reviews of this repository found ten
/// instances of. It names the fighter it is about, so a split-screen picker can
/// point at the column that has to change.
pub const ARENA_CONTROL_UNAVAILABLE: u8 = 29;
/// A staged arena command names no human-controlled side.
///
/// The detail byte distinguishes an unknown faction (`1`), a valid side whose
/// configuration says policy (`2`), and no installed arena (`3`). One reason
/// is enough because each asks the caller to correct the target or lifetime,
/// while the detail tells it which one was wrong.
pub const ARENA_INPUT_REFUSED: u8 = 30;
pub const ARENA_INPUT_UNKNOWN_FACTION: u8 = 1;
pub const ARENA_INPUT_POLICY_CONTROLLED: u8 = 2;
pub const ARENA_INPUT_NO_ARENA: u8 = 3;

/// Every reason byte declared above, in one array, so that the claim "every
/// refusal has its own number" is a failed build rather than a failing test.
///
/// The exhaustive `match` in [`arena_spec_refusal`] forces a variant appended to
/// [`sim::CombatSpecError`] to be given an arm; it has nothing whatever to say
/// about what that arm *returns*, and a second refusal declared with a number
/// already in use is the other way the mapping stops being injective. This
/// covers that half at compile time; `the_arena_configuration_buffer_is_the_documented_layout`
/// covers the half that needs the enum walked.
///
/// **The array is hand-maintained, and that is a fails-open shape the doc
/// comment above used to claim it had closed.** A refusal declared beside the
/// others and left off this list compiles, is compared with nothing, and the
/// assert below goes on passing about the twenty-eight it does know -- so the
/// array's guarantee has always been "every code *in this array* is distinct"
/// rather than "every declared code is". Nothing in the language closes the
/// gap: there is no reflection over a module's consts.
///
/// What narrows it is [`reasons_are_dense`] beside the distinctness assert.
/// This list is `0..31` exactly -- ascending, no gaps -- so a code appended
/// above the last one and left out of it makes the *next* appended code collide
/// rather than slipping past forever, and an insertion into a gap is a failed
/// build immediately. **It does not catch the first omission**, and saying so
/// here is cheaper than the next reader deducing it: what catches that is
/// adding the row in the edit that adds the code, which arena-02 did for `28`
/// and `29` and verified by giving one of them `27` on purpose and watching the
/// build fail.
const ARENA_REASONS: [u8; 31] = [
    ARENA_OK, ARENA_UNKNOWN_LAYOUT, ARENA_WRONG_FIGHTER_COUNT, ARENA_NONCANONICAL,
    ARENA_UNKNOWN_ANATOMY, ARENA_UNKNOWN_ITEM, ARENA_UNKNOWN_POLICY, ARENA_POLICY_UNAVAILABLE,
    ARENA_CONSTRUCTION_REFUSED, ARENA_RESERVATION_REFUSED, ARENA_NAME_TOO_LONG,
    ARENA_MISSING_TABLE, ARENA_UNEXPECTED_TABLE, ARENA_UNIT_PRESENCE, ARENA_TOO_MANY_ANATOMIES,
    ARENA_TOO_MANY_EQUIPMENT, ARENA_ID_ORDER, ARENA_UNKNOWN_SCHEMA, ARENA_DIMENSION,
    ARENA_FRACTION, ARENA_MAXIMUM, ARENA_MISSING_REFERENCE, ARENA_LOADOUT_MISMATCH,
    ARENA_GRIP_CONFLICT, ARENA_NO_EQUIPMENT, ARENA_UNKNOWN_ACTION, ARENA_NO_CHECKPOINT,
    ARENA_BOW_GRIP, ARENA_UNKNOWN_CONTROL, ARENA_CONTROL_UNAVAILABLE, ARENA_INPUT_REFUSED,
];

/// Pairwise, because thirty is small and a sort needs an allocation no `const`
/// context has.
const fn reasons_are_distinct(reasons: &[u8]) -> bool {
    let mut i = 0;
    while i < reasons.len() {
        let mut j = i + 1;
        while j < reasons.len() {
            if reasons[i] == reasons[j] {
                return false;
            }
            j += 1;
        }
        i += 1;
    }
    true
}

const _: () = assert!(
    reasons_are_distinct(&ARENA_REASONS),
    "two arena refusals were declared with the same reason byte",
);

/// Whether [`ARENA_REASONS`] is `0..len` in ascending order.
///
/// **Distinctness is the property the array was written for and density is the
/// property that makes an omission expensive**, which is a different claim and
/// worth its own function. The numbering has been append-only since v2-ui-05
/// and two of the codes are retired rather than deleted precisely so that it
/// stays that way; asserting it means a code appended above the end and left
/// out of the array leaves a hole the *next* appended code falls into, instead
/// of an unchecked number nobody trips over.
const fn reasons_are_dense(reasons: &[u8]) -> bool {
    let mut i = 0;
    while i < reasons.len() {
        if reasons[i] as usize != i {
            return false;
        }
        i += 1;
    }
    true
}

const _: () = assert!(
    reasons_are_dense(&ARENA_REASONS),
    "the arena reason bytes are not 0..N in order: one was inserted into a gap or skipped one",
);

/// What the fighter or hand byte of a refusal holds when the refusal is about
/// the configuration as a whole. [`SLOT_EMPTY`] narrowed, exactly as
/// [`ARENA_HAND_EMPTY`] is.
pub const ARENA_WHOLE_CONFIG: u8 = SLOT_EMPTY as u8;

/// What [`policy_kind`] answers on a world the legacy registry does not
/// describe, which today means a configured duel. See that export.
pub const POLICY_KIND_UNKNOWN: u32 = u32::MAX;

/// What [`arena_policy`] answers on a world that is not an arena.
///
/// A sentinel and not a zero, because `0` is `neutral` and an ordinary answer.
/// The same shape [`POLICY_KIND_UNKNOWN`] takes, and for the same reason.
pub const ARENA_NO_POLICY: u32 = u32::MAX;

/// What [`arena_control`] answers on a world that is not an arena.
///
/// [`ARENA_NO_POLICY`]'s shape and its reason, which applies here twice as
/// hard: `0` is [`ARENA_CONTROL_POLICY`], the answer for every side of every
/// fight this build can install, so a zero for "there is no fight" would be
/// indistinguishable from the commonest real answer there is.
pub const ARENA_NO_CONTROL: u32 = u32::MAX;

// ------------------------------------------------------ the loaded checkpoint
//
// A trained network is a *fighter*, and v2-ui-08 delivers it the way a fighter
// should be delivered: fetched, not compiled in. `checkpoints/v2-probe.ckpt` is
// 15,580 bytes beside an 8 MB trace, the studio should be able to put a
// different one in the ring without a Rust rebuild, and a 15 KB artifact
// embedded in the wasm would be one more thing that can only change by
// rebuilding the thing that reads it.
//
// So the bytes arrive through a staging buffer on [`EMBODIED_COMMAND`]'s and
// [`ARENA_CONFIG`]'s pattern -- a fixed array that never moves and never grows
// linear memory -- and [`load_checkpoint`] judges the whole of it at once. The
// difference from those two is that a checkpoint is not a fixed width, so the
// length is an argument rather than a constant, and the buffer is a *capacity*
// rather than a size.
//
// **It is not on `Sim`, and that is a decision rather than an oversight.**
// `Sim::anatomy` and `Sim::arena` both carry "written wherever `world` is",
// because a stale one describes a world that no longer exists. An installed
// checkpoint describes no world at all: it is a host asset, like the action
// table or the sine table, and it survives `init`, `descend` and `arena_start`
// exactly as a fetched file survives a page navigating within a session.
//
// **Nothing in this build makes a fighter out of it, and that is v2-ui-08's
// doing rather than an oversight.** What used to be per-world was the learned
// articulated policy in [`Arena::policies`]; the arena's policy byte is
// an [`PolicyKind::code`] now and that registry has no `learned` entry,
// for the reason written on the enum -- a trained fighter is a kind plus fifteen
// kilobytes of weights and an integer has nowhere to put them. The buffer, the
// validation and the digest all stay, because [`learned_inference_digest_lo`] is
// taken over the *installed* model and is a pinned two-target portability claim;
// what is missing is a policy, not a consumer.

/// How many bytes of checkpoint [`CHECKPOINT`] will hold.
///
/// The shipped artifact is 15,580 bytes and only one field of it is variable:
/// [`ModelShape::CURRENT`] fixes 3,858 weights, so everything but the training
/// seed list is a constant 15,532 bytes. The rule this repository already uses
/// for a rejected capacity -- the next power of two at least twice the largest
/// measured -- doubles that to 31,160 and rounds to 32,768, which leaves room
/// for about two thousand recorded seeds or for a network half again as wide.
///
/// A caller with a longer file is refused by name ([`CHECKPOINT_TOO_LONG`])
/// rather than truncated, because a truncated checkpoint is a `Digest` failure
/// forty microseconds later and the reader would be looking for corruption
/// nobody caused.
pub const CHECKPOINT_CAPACITY: usize = 32_768;

/// SHA-256, so 32.
pub const CHECKPOINT_DIGEST_BYTES: usize = 32;

// Why [`load_checkpoint`] refused, in [`ARENA_REASONS`]' spirit and with the
// same rule: every refusal has its own number. A checkpoint is the one input to
// this module that a *user* chose from a file picker, so "that file is not this
// build's network" and "that file is corrupt" are the two sentences a studio
// most needs to be able to tell apart -- and `CheckpointError` already draws
// every distinction worth drawing. This is that enum, flattened into bytes.

/// It loaded. Paired with an outcome of `1`.
pub const CHECKPOINT_OK: u8 = 0;
/// More bytes than [`CHECKPOINT_CAPACITY`]. The only refusal that is about this
/// module rather than about the file; every one below is a
/// [`CheckpointError`].
pub const CHECKPOINT_TOO_LONG: u8 = 1;
/// The bytes ran out mid-field. A half-written file, or a fetch that reported a
/// length it did not deliver.
pub const CHECKPOINT_TRUNCATED: u8 = 2;
/// Not a checkpoint at all: a renamed trace, an HTML error page, a 404 body.
pub const CHECKPOINT_BAD_MAGIC: u8 = 3;
/// A framing version this build cannot parse. The detail carries it.
pub const CHECKPOINT_UNKNOWN_FORMAT: u8 = 4;
/// Trained against a different feature slice. Parses perfectly and is still
/// void -- the network would read the wrong number out of every slot and go on
/// producing confident argmaxes.
pub const CHECKPOINT_FEATURE_LAYOUT: u8 = 5;
/// Emits a different action table. The same sentence from the output end.
pub const CHECKPOINT_ACTION_LAYOUT: u8 = 6;
/// A different [`ModelShape`].
pub const CHECKPOINT_SHAPE: u8 = 7;
/// The right shape declared, and a different number of weights behind it.
pub const CHECKPOINT_WEIGHT_COUNT: u8 = 8;
/// The recorded SHA-256 is not the digest of the bytes in front of it.
pub const CHECKPOINT_DIGEST_MISMATCH: u8 = 9;
/// A weight that is not finite; the detail is its index. Refused at load rather
/// than at use, because a NaN weight crashes nothing: it propagates into every
/// logit, every comparison against it is false, and the argmax then answers
/// index zero on every head forever.
pub const CHECKPOINT_NOT_FINITE: u8 = 10;
/// A `sigma` or a `training_return` that is not finite. Nothing reads either, so
/// this cannot make the policy misbehave -- it breaks the checkpoint's own
/// round-trip claim, because a NaN is not equal to itself.
pub const CHECKPOINT_NOT_FINITE_RECORD: u8 = 11;
/// Bytes after the digest; the detail is how many, saturating.
pub const CHECKPOINT_TRAILING_BYTES: u8 = 12;

/// Every reason byte above, so that "each refusal has its own number" is a
/// failed build rather than a failing test. [`ARENA_REASONS`]' discipline, and
/// paired with an exhaustive `match` in [`checkpoint_refusal`] the same way.
const CHECKPOINT_REASONS: [u8; 13] = [
    CHECKPOINT_OK, CHECKPOINT_TOO_LONG, CHECKPOINT_TRUNCATED, CHECKPOINT_BAD_MAGIC,
    CHECKPOINT_UNKNOWN_FORMAT, CHECKPOINT_FEATURE_LAYOUT, CHECKPOINT_ACTION_LAYOUT,
    CHECKPOINT_SHAPE, CHECKPOINT_WEIGHT_COUNT, CHECKPOINT_DIGEST_MISMATCH,
    CHECKPOINT_NOT_FINITE, CHECKPOINT_NOT_FINITE_RECORD, CHECKPOINT_TRAILING_BYTES,
];

const _: () = assert!(
    reasons_are_distinct(&CHECKPOINT_REASONS),
    "two checkpoint refusals were declared with the same reason byte",
);

/// What [`load_checkpoint`]'s detail field holds when the refusal has no number
/// attached to it.
///
/// `0xffff` and not `0`, because zero is a perfectly good weight index and a
/// perfectly good framing version.
pub const CHECKPOINT_NO_DETAIL: u16 = u16::MAX;

// **`SUBMITTED_COMMAND_BYTES` and the `SUBMITTED_COMMAND` scratch stood here and
// are gone with the grammar they staged.** The constant was
// `4 + ARTICULATED_PAYLOAD_BYTES`, the scratch was a fixed array of that width,
// and `submitted_command_ptr`, `submitted_command_len`,
// `submitted_command_layout_version` and `submit_articulated` were the four
// exports over it. There is one command grammar left, and a second staging
// buffer with no export that can act on it is precisely the control this
// repository has paid for ten times in two reviews: a page could fill it, call
// nothing, and be told nothing. [`EMBODIED_COMMAND`] is the one that survives,
// and [`EMBODIED_COMMAND_BYTES`] carries the note about why the two widths were
// separate constants while there were two.

thread_local! {
    static SIM: RefCell<Option<Sim>> = const { RefCell::new(None) };
    static FRAME: RefCell<[f32; FRAME_MAX]> = const { RefCell::new([0.0; FRAME_MAX]) };
    /// The duel the page is describing, judged whole by [`arena_start`]. See the
    /// section above for why this is a buffer where a route is three scalars.
    static ARENA_CONFIG: RefCell<[u8; ARENA_CONFIG_BYTES]> =
        const { RefCell::new([0; ARENA_CONFIG_BYTES]) };
    /// Where a fetched checkpoint lands before [`load_checkpoint`] judges it.
    /// A fixed array for the third time and for the third time the same reason;
    /// see the section above for why it is a capacity rather than a size.
    static CHECKPOINT: RefCell<[u8; CHECKPOINT_CAPACITY]> =
        const { RefCell::new([0; CHECKPOINT_CAPACITY]) };
    /// The network a `learned` fighter is built from, or `None` before anything
    /// has been loaded.
    ///
    /// The [`Model`] and not the whole [`Checkpoint`]: the training record is
    /// provenance a *reader* wants and the network is the only part a fight
    /// uses, and holding the seed list would be holding a `Vec` for the life of
    /// the module to print nothing. What a reader gets instead is
    /// [`checkpoint_digest_ptr`], which is the name the record is quoted under
    /// anyway.
    static CHECKPOINT_MODEL: RefCell<Option<Model>> = const { RefCell::new(None) };
    /// The installed checkpoint's SHA-256, or thirty-two zeroes.
    ///
    /// **This is what makes a live fight and a recorded one comparable on
    /// identical terms**, which is the whole reason it is published: `lab
    /// trace`'s header carries the same digest, so a reader watching an arena
    /// can say whether it is watching the fighter the trace was recorded from
    /// or a different one. Raw bytes rather than hex, because the hex is a
    /// rendering and the client already has to render everything else.
    static CHECKPOINT_DIGEST: RefCell<[u8; CHECKPOINT_DIGEST_BYTES]> =
        const { RefCell::new([0; CHECKPOINT_DIGEST_BYTES]) };
    /// The floor plan, one byte a tile. A fixed array beside `FRAME` and for
    /// the same reason: a `Vec` that reallocates grows linear memory, and
    /// growing it detaches every typed array the page is holding.
    ///
    /// `u8` and not `f32` because a tile is a small integer; the page reads it
    /// with a `Uint8Array` at no cost, and 3060 bytes cross instead of 12 KB.
    static MAP: RefCell<[u8; MAP_MAX]> = const { RefCell::new([0; MAP_MAX]) };
    static MAP_SHAPE: Cell<(u32, u32, u32)> = const { Cell::new((0, 0, 0)) };
    /// What the player has seen of the floor plan: `0` never, `1` earlier,
    /// `2` now. A fixed array beside `MAP` and for the same reason, and indexed
    /// exactly as `MAP` is so the page can read the two together.
    ///
    /// Presentation, exactly as [`Flash`] is: derived from simulation state,
    /// never fed back into it, and absent from `state_hash`. A world driven
    /// headlessly by the lab computes none of this.
    static VIS: RefCell<[u8; MAP_MAX]> = const { RefCell::new([0; MAP_MAX]) };
    /// What stands on the floor plan and cannot be read out of it: a doorway
    /// today. `FURNITURE_STRIDE` bytes a record; see [`FURNITURE_STRIDE`] for
    /// the format and [`write_furniture`] for what fills it.
    ///
    /// A fixed array beside `MAP` and `VIS` and for the third time the same
    /// reason: a `Vec` that reallocates grows linear memory, and growing it
    /// detaches every typed array the page is holding.
    ///
    /// **Structurally apart from the frame**, which is what makes this a
    /// buffer that can be added without touching the ABI the page checks at
    /// boot: `FRAME_MAX` is composed of `HEADER_LEN` and the three strides and
    /// of nothing else, exactly as `MAP` and `VIS` already are, so neither
    /// `HEADER_LEN` nor `FRAME_LAYOUT_VERSION` can move because of anything in
    /// here.
    static FURNITURE: RefCell<[u8; FURNITURE_MAX * FURNITURE_STRIDE]> =
        const { RefCell::new([0; FURNITURE_MAX * FURNITURE_STRIDE]) };
    /// How many *records* of `FURNITURE` are live -- not how many bytes, which
    /// is this times [`FURNITURE_STRIDE`]. A count and a stride rather than a
    /// byte length, so the page reads the buffer the way it reads the frame's
    /// unit rows and never has to hardcode the width of a record.
    static FURNITURE_LEN: Cell<u32> = const { Cell::new(0) };
    static DUNGEON_OBJECTS: RefCell<[u32; MAX_DUNGEON_OBJECTS * DUNGEON_OBJECT_STRIDE]> =
        const { RefCell::new([0; MAX_DUNGEON_OBJECTS * DUNGEON_OBJECT_STRIDE]) };
    static DUNGEON_OBJECT_LEN: Cell<u32> = const { Cell::new(0) };
    static DUNGEON_OBJECTS_DROPPED: Cell<u32> = const { Cell::new(0) };
    /// Starts at the header length rather than zero so a client that renders
    /// before it calls `init` reads a well-formed empty frame instead of a
    /// zero-length one.
    static FRAME_LEN: Cell<u32> = const { Cell::new(HEADER_LEN as u32) };
    /// One row per live articulated body, [`POSE_STRIDE`] words each. A fixed
    /// array beside `FRAME` and for the fourth time the same reason: a `Vec`
    /// that reallocates grows linear memory, and growing it detaches every
    /// typed array the page is holding.
    ///
    /// Rewritten wholesale by [`publish`] from end-of-call state, so unlike the
    /// frame it has no header and no stale-prefix hazard -- [`POSE_LEN`] is the
    /// only thing that says how much of it is live.
    static POSES: RefCell<[u32; MAX_POSES * POSE_STRIDE]> =
        const { RefCell::new([0; MAX_POSES * POSE_STRIDE]) };
    /// How many *rows* of `POSES` are live, not how many words.
    static POSE_LEN: Cell<u32> = const { Cell::new(0) };
    /// Rows the last publication could not fit, saturating. Per publication and
    /// not cumulative: it answers "how much of this picture am I not being
    /// shown", which is a question about the buffer in hand.
    static POSES_DROPPED: Cell<u32> = const { Cell::new(0) };
    /// The five swept capsules of each live articulated body,
    /// [`REGION_STRIDE`] words each and [`REGIONS_PER_BODY`] rows a body, in
    /// the same order `POSES` is written in. A fixed array for the fifth time
    /// the same reason.
    ///
    /// **The row carries no identity, and the section is read against
    /// `POSE_LEN` instead.** Two words of index and generation repeated five
    /// times a body would be a second answer to a question the pose row beside
    /// it already answers; what a reader checks instead is
    /// `region_len == REGIONS_PER_BODY * pose_len`, which is the one thing that
    /// could go wrong and is a single comparison. See [`write_region_buffer`].
    static REGIONS: RefCell<[u32; MAX_REGIONS * REGION_STRIDE]> =
        const { RefCell::new([0; MAX_REGIONS * REGION_STRIDE]) };
    /// How many *rows* of `REGIONS` are live -- regions, not bodies.
    static REGION_LEN: Cell<u32> = const { Cell::new(0) };
    /// Rows the last publication could not fit, saturating, on `POSES_DROPPED`'s
    /// terms exactly.
    static REGIONS_DROPPED: Cell<u32> = const { Cell::new(0) };
    /// Every live articulated arrow, in stable slot order. The row carries its
    /// own slot generation because a reaped slot may be handed to a later arrow
    /// while a recorder still holds the earlier frame.
    static ARTICULATED_PROJECTILES:
        RefCell<[u32; MAX_ARTICULATED_PROJECTILES * ARTICULATED_PROJECTILE_STRIDE]> =
        const { RefCell::new(
            [0; MAX_ARTICULATED_PROJECTILES * ARTICULATED_PROJECTILE_STRIDE]
        ) };
    /// How many live rows of `ARTICULATED_PROJECTILES` are published.
    static ARTICULATED_PROJECTILE_LEN: Cell<u32> = const { Cell::new(0) };
    /// Rows the cap ate during the last publication, saturating.
    static ARTICULATED_PROJECTILES_DROPPED: Cell<u32> = const { Cell::new(0) };
    /// One row per live embodied body, [`EMBODIED_STANCE_STRIDE`] words each, in
    /// the same slot order `POSES` is written in. A fixed array for the sixth
    /// time and for the sixth time the same reason.
    ///
    /// **A zero-length section is an ordinary answer, not the failure case.**
    /// It was the *usual* answer while models without legs existed: such a world
    /// published nothing here on every tick of every fight. Only one model is
    /// left and it has legs, so the length word now reads zero when there is no
    /// world rather than when there are no legs -- which is still a different
    /// fact from publishing no section at all, and the length word is still what
    /// carries the difference.
    static EMBODIED_STANCES: RefCell<[u32; MAX_EMBODIED_STANCE * EMBODIED_STANCE_STRIDE]> =
        const { RefCell::new([0; MAX_EMBODIED_STANCE * EMBODIED_STANCE_STRIDE]) };
    /// How many *rows* of `EMBODIED_STANCES` are live, not how many words.
    static EMBODIED_STANCE_LEN: Cell<u32> = const { Cell::new(0) };
    /// Rows the last publication could not fit, saturating, on
    /// `POSES_DROPPED`'s terms exactly.
    static EMBODIED_STANCES_DROPPED: Cell<u32> = const { Cell::new(0) };
    /// Every contact resolution of every tick in the last host call, in
    /// `(tick, toi, group ordinal, key)` order. Fixed for the same reason
    /// `POSES` is.
    static COMBAT_EVENTS: RefCell<[u32; MAX_COMBAT_EVENTS * COMBAT_EVENT_STRIDE]> =
        const { RefCell::new([0; MAX_COMBAT_EVENTS * COMBAT_EVENT_STRIDE]) };
    /// How many *rows* of `COMBAT_EVENTS` are live.
    static COMBAT_EVENT_LEN: Cell<u32> = const { Cell::new(0) };
    /// Rows the cap ate during the last host call, saturating.
    static COMBAT_EVENTS_DROPPED: Cell<u32> = const { Cell::new(0) };
}

/// `thread_local!` and `RefCell` are sound here because the target is
/// single-threaded: there is one instance per wasm module and one module per
/// page. Natively they give each `#[test]` thread its own module for free.
/// How lit a body's hit, block and parry markers are, in ticks remaining.
#[derive(Clone, Copy, Default)]
struct Flash {
    hit: u8,
    block: u8,
    parry: u8,
}

/// One row of the frame's third section, before it is flattened into `f32`s.
///
/// Held in the sim's own types and converted on the way out, exactly as a unit
/// row is: [`Fx::to_f32`] is the one float conversion in the stack and it stays
/// where it belongs.
#[derive(Clone, Copy)]
struct FrameEvent {
    /// One of the `EVENT_*` codes, all of which are below [`EVENT_KINDS`].
    kind: u32,
    at: Vec2,
    /// Health lost, health absorbed, an action code, a speed, a depth -- read
    /// according to `kind`, which is why there is only one of these. The table
    /// on [`EVENT_STRIDE`] is the authority and the only copy of it.
    amount: Fx,
    /// [`EntityId::index`] of the unit the row is *about*: the target of a
    /// blow, the defender of a block, the first-named of a parried pair, the
    /// swinger of a declaration.
    actor: u32,
    /// The second party, or [`SLOT_EMPTY`] where there is none. A hint for
    /// grouping on exactly the terms `actor` is, and no more an identity.
    other: u32,
    /// Kind-specific. See the table on [`EVENT_STRIDE`].
    aux0: Fx,
    /// Kind-specific. See the table on [`EVENT_STRIDE`].
    aux1: Fx,
}

/// What [`Sim`] remembers about one body between ticks, indexed by
/// [`EntityId::index`].
///
/// **One table rather than four parallel ones**, because every field here is
/// answering the same question -- what did this body look like at the end of
/// the last tick -- and four `Vec`s keyed on the same index would need four
/// resize guards and four `clear()`s in [`Sim::descend`] that could drift apart.
///
/// Presentation, exactly as [`Flash`] is: derived from simulation state, never
/// fed back into it, absent from `World::state_hash`, and computed by nothing
/// the lab runs.
///
/// **Generation-aware, and it has to be.** `reap_dead` hands a dead body's slot
/// straight back to the free list, so the next spawn can be standing in it on
/// the following tick -- and the three fields that are *differenced* rather than
/// overwritten would then be differenced against the previous occupant.
/// [`Sim::note_bodies`] would read `was = Windup, now = Guard` and push an
/// [`EVENT_PHASE`] describing a transition **between two different creatures**,
/// which is exactly the "dead creature coming back to life" shape `AGENTS.md`
/// warns an index-keyed reader about, and the newcomer's legs would start at an
/// arbitrary offset into somebody else's walk cycle. [`Sim::refresh_traces`]
/// resets `swing`, `span` and `stride` whenever the generation in a slot
/// changes, which is the whole of the fix.
///
/// It closes a sibling case that predates this table: the same stale phase could
/// **suppress** a declaration, because a slot left mid-`Windup` reads as already
/// swinging when the next body's own windup arrives. That was argued as
/// tolerable back when the phase memory was a bare `swings` vector; it was never
/// a separate bug and it needs no separate fix, because it is the same
/// comparison across the same boundary.
///
/// The generation kept here is a **staleness test and nothing else** -- it is
/// never read back out into a row, which is what keeps this table presentation
/// in the sense above. [`Sim::descend`] still clears the whole table, because a
/// floor change invalidates the four refreshed fields too.
#[derive(Clone, Copy)]
struct Trace {
    /// Which occupant of this slot the three differenced fields below belong
    /// to. [`EntityId::NONE`]'s generation for a slot that has never held a
    /// body, so the first body to stand in one is a change like any other.
    generation: u32,
    /// The swing phase as of the end of the last tick. Differencing this is the
    /// whole of the declare and phase feeds.
    swing: Swing,
    /// `swing_left` on the tick `swing` last changed, which is the phase's full
    /// length: the transition sets the counter and the new phase does not spend
    /// a tick of it until the next one. Better than the nominal length, because
    /// a punished recovery really is longer.
    span: u16,
    /// The walk cycle's phase, `0 <= stride < 1`. See [`STRIDE_PER_RADIUS`].
    stride: Fx,
    /// Where the body stood, how big it is, what it weighs and what it is --
    /// the four things the event rows need about a body that `World::view` may
    /// already be refusing to answer for. `reap_dead` recycles a lethal blow's
    /// slot before `step` returns, so the row a renderer most wants to draw is
    /// exactly the one it cannot look anything up for.
    ///
    /// Refreshed by [`Sim::refresh_traces`] at the top of each tick, so these
    /// four are as of *this* tick while `swing`, `span` and `stride` are as of
    /// the last one. The split is deliberate: a death row wants where the body
    /// was standing when it was struck, and a declare row wants two settled
    /// phases to compare.
    at: Vec2,
    radius: Fx,
    mass: Fx,
    kind: Body,
}

impl Default for Trace {
    fn default() -> Trace {
        Trace {
            generation: EntityId::NONE.generation,
            swing: Swing::Guard,
            span: 0,
            stride: Fx::ZERO,
            at: Vec2::ZERO,
            radius: Fx::ZERO,
            mass: Fx::ZERO,
            kind: Body::Fighter,
        }
    }
}

/// One body's trace, or a resting default for a slot that has never held one.
///
/// A free function and not a method, because every caller inside
/// [`Sim::advance`]'s drain holds `&mut self.world` for the length of the loop
/// -- so it has to be a borrow of the `traces` field alone and not of `self`.
fn trace_at(traces: &[Trace], entity: EntityId) -> Trace {
    traces
        .get(entity.index as usize)
        .copied()
        .unwrap_or_default()
}

/// An entity as an event row's `actor` or `other` column, or [`SLOT_EMPTY`] for
/// "nobody".
///
/// `EntityId::NONE` is `u32::MAX`, which is neither a slot the page can look up
/// nor the `255` it reads as absent. Overloading `255` is safe on exactly the
/// argument `ID_INDEX_SPAN` made on the retired Canvas page: slots are recycled
/// through a free list, so a live index never climbs past the number of bodies
/// standing at once, which [`MAX_UNITS`] caps at 64.
const fn actor_index(id: EntityId) -> u32 {
    if id.is_none() {
        SLOT_EMPTY
    } else {
        id.index
    }
}

/// How many authoritative ticks one staged host command may cover.
///
/// One makes a dropped display frame stop a body mid-stride; sixty lets a
/// hidden page keep walking for a second. Six is one tenth of a second at the
/// fixed simulation rate, long enough for one missed frame and short enough to
/// expire before an ordinary reaction.
const CONTROL_INPUT_MAX_HOLD_TICKS: u32 = 6;

/// Exact durable submitted-command rows accepted during the most recent arena
/// tick. A configured duel has two bodies, so more than two stored submissions
/// is an invariant failure rather than a reason to grow an outward buffer.
const ARENA_ACCEPTED_COMMAND_LAYOUT_VERSION: u32 = 1;
const ARENA_ACCEPTED_COMMAND_STRIDE: usize = 13 + sim::EMBODIED_PAYLOAD_BYTES;
const ARENA_ACCEPTED_COMMAND_CAPACITY: usize = 2;
const ARENA_ACCEPTED_COMMAND_BYTES: usize =
    ARENA_ACCEPTED_COMMAND_STRIDE * ARENA_ACCEPTED_COMMAND_CAPACITY;

thread_local! {
    static ARENA_ACCEPTED_COMMANDS: RefCell<[u8; ARENA_ACCEPTED_COMMAND_BYTES]> =
        const { RefCell::new([0; ARENA_ACCEPTED_COMMAND_BYTES]) };
    static ARENA_ACCEPTED_COMMAND_LEN: Cell<u32> = const { Cell::new(0) };
    static ARENA_ACCEPTED_COMMANDS_DROPPED: Cell<u32> = const { Cell::new(0) };
    /// Codec-V2 zero-tick identity for the installed duel. Built before any
    /// outward view exists and immutable until the next `arena_start`.
    static ARENA_REPLAY_BASELINE: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
}

#[derive(Clone, Copy)]
struct StagedArenaInput {
    tick: u32,
    command: Option<CommandV1>,
}

impl StagedArenaInput {
    const EMPTY: StagedArenaInput = StagedArenaInput { tick: 0, command: None };
}

thread_local! {
    /// Host-owned input, deliberately beside rather than inside authoritative
    /// world state. `arena_stage_input` replaces one row atomically and a
    /// `HostSource` reads it only while its tick stamp remains live.
    static ARENA_INPUT: RefCell<[StagedArenaInput; 2]> =
        const { RefCell::new([StagedArenaInput::EMPTY; 2]) };
}

#[cfg(test)]
thread_local! {
    /// The commands the arena actually submitted, not the commands its
    /// controllers merely returned. Tests replay this seam so a skipped
    /// every-tick submission cannot hide behind an unchanged controller.
    static ARENA_SUBMISSIONS: RefCell<Vec<(u32, EntityId, CommandV1)>> =
        const { RefCell::new(Vec::new()) };
}

fn clear_arena_submissions() {
    ARENA_ACCEPTED_COMMAND_LEN.with(|len| len.set(0));
}

fn record_arena_submission(tick: u32, id: EntityId, outcome: sim::SubmitOutcome) {
    if let sim::SubmitOutcome::Stored { command, .. } = outcome {
        let row = ARENA_ACCEPTED_COMMAND_LEN.with(Cell::get) as usize;
        if row < ARENA_ACCEPTED_COMMAND_CAPACITY {
            ARENA_ACCEPTED_COMMANDS.with(|bytes| {
                let mut bytes = bytes.borrow_mut();
                let at = row * ARENA_ACCEPTED_COMMAND_STRIDE;
                bytes[at..at + 4].copy_from_slice(&tick.to_le_bytes());
                bytes[at + 4..at + 8].copy_from_slice(&id.index.to_le_bytes());
                bytes[at + 8..at + 12].copy_from_slice(&id.generation.to_le_bytes());
                bytes[at + 12] = 2;
                bytes[at + 13..at + ARENA_ACCEPTED_COMMAND_STRIDE]
                    .copy_from_slice(&command.payload_bytes());
            });
            ARENA_ACCEPTED_COMMAND_LEN.with(|len| len.set((row + 1) as u32));
        } else {
            ARENA_ACCEPTED_COMMANDS_DROPPED.with(|dropped| {
                dropped.set(dropped.get().saturating_add(1));
            });
        }
        #[cfg(test)]
        ARENA_SUBMISSIONS.with(|rows| rows.borrow_mut().push((tick, id, command)));
    }
}

struct HostSource {
    side: usize,
    authority: CommandAuthority,
}

impl HostSource {
    fn new(side: usize, arm: LimbSlot) -> HostSource {
        let mut arms = [false; 2];
        arms[arm as usize] = true;
        HostSource {
            side,
            authority: CommandAuthority { navigation: true, arms },
        }
    }
}

impl PartialCommandSource for HostSource {
    fn authority(&self) -> CommandAuthority { self.authority }

    fn contribute(&mut self, obs: &Observation, into: &mut CommandV1) {
        let staged = ARENA_INPUT.with(|inputs| inputs.borrow()[self.side]);
        let Some(command) = staged.command else { return };
        let Some(age) = obs.tick.checked_sub(staged.tick) else { return };
        if age >= CONTROL_INPUT_MAX_HOLD_TICKS { return; }
        into.core.move_dir = command.core.move_dir;
        into.core.body_yaw = command.core.body_yaw;
        into.core.intent = command.core.intent;
        for slot in 0..2 {
            if self.authority.arms[slot] {
                into.core.arms[slot] = command.core.arms[slot];
                into.core.grips[slot] = command.core.grips[slot];
                into.core.releases[slot] = command.core.releases[slot];
                into.swing_plane[slot] = command.swing_plane[slot];
            }
        }
    }
}

struct CadencedEmbodiedSource {
    inner: Box<dyn Policy>,
    authority: CommandAuthority,
    cached: Option<CommandV1>,
    next_decision: u32,
    period: u32,
}

impl CadencedEmbodiedSource {
    fn new(
        inner: Box<dyn Policy>,
        authority: CommandAuthority,
        period: u32,
    ) -> CadencedEmbodiedSource {
        CadencedEmbodiedSource {
            inner,
            authority,
            cached: None,
            next_decision: 0,
            period: period.max(1),
        }
    }
}

impl PartialCommandSource for CadencedEmbodiedSource {
    fn authority(&self) -> CommandAuthority { self.authority }

    fn contribute(&mut self, obs: &Observation, into: &mut CommandV1) {
        if self.cached.is_none() || obs.tick >= self.next_decision {
            self.cached = Some(self.inner.decide(obs));
            self.next_decision = obs.tick.saturating_add(self.period);
        }
        let Some(command) = self.cached else { return };
        for slot in 0..2 {
            if self.authority.arms[slot] {
                into.core.arms[slot] = command.core.arms[slot];
                into.core.grips[slot] = command.core.grips[slot];
                into.core.releases[slot] = command.core.releases[slot];
                into.swing_plane[slot] = command.swing_plane[slot];
            }
        }
    }

    fn reset(&mut self) {
        self.inner.reset();
        self.cached = None;
        self.next_decision = 0;
    }
}

/// A configured duel, running.
///
/// Installed by [`arena_start`] and by nothing else. That is what makes
/// [`Sim::advance`]'s second branch unreachable from every world installed
/// *before* it -- and it says nothing at all about a world installed after it,
/// which is a second obligation and belongs to whoever assigns [`Sim::world`].
/// This comment claimed both until v2-ui-05's review found that [`Sim::descend`]
/// paid neither: it replaced the world and left the duel standing, so a freshly
/// generated floor was driven through [`Sim::advance_arena`] against a roster
/// that no longer existed and stopped dead on the old configuration's tick
/// limit. [`Sim::descend`] carries the line that closes it, and the argument
/// for clearing rather than refusing.
struct Arena {
    /// One embodied policy per faction, indexed by [`Faction::index`].
    ///
    /// **Two instances and not one driven twice**, which is the whole point:
    /// `policy::run` takes a single `impl Policy` and installs
    /// it on both sides, which is right for a control and useless for an arena.
    /// The shape ported here is `lab`'s `measure_embodied_matchup`.
    ///
    /// **The same type [`Sim::policies`] holds since v2-ui-08.** They were two
    /// registries over two traits until this session moved `duel_from` onto
    /// `CombatModel::Embodied`; the two fields stay separate because an arena
    /// is driven by [`Sim::advance_arena`] over a captured roster and a dungeon
    /// by [`Sim::advance`], not because the vocabularies differ.
    policies: [Box<dyn Policy>; 2],
    kinds: [PolicyKind; 2],
    /// Who drives each side, as [`ARENA_CONTROL_POLICY`] or
    /// [`ARENA_CONTROL_HUMAN`], indexed by [`Faction::index`].
    ///
    /// **Held here and nowhere below**, which is the whole placement decision.
    /// A control byte is a fact about the host, not about the fight: it is not
    /// in [`sim::DuelConfigV1`], it never reaches `Scenario::duel_from`, and
    /// `the_arena_fingerprint_does_not_change_when_a_side_is_handed_to_a_human`
    /// is what says so. If it reached the fingerprint, the human fight and the
    /// AI fight at one seed would stop being the same fixture and the
    /// comparison the whole arena topic exists to make would be impossible.
    ///
    /// Read back beside [`arena_policy`] so a recorder labels the fight with
    /// what it is actually running rather than what the caller requested.
    controls: [u8; 2],
    /// The installed bodies' authoritative decision cadence, retained after a
    /// death so metadata never depends on the live roster.
    decision_periods: [u32; 2],
    /// The fixed body identity for each human side; policy sides are `None`.
    driven: [Option<EntityId>; 2],
    /// The Heroes' identities, captured once at install.
    ///
    /// **Routing is on the alive set and not on the observation**, because
    /// [`sim::Observation`] has no faction column -- it is subject
    /// scoped by design, and adding the column back so a driver could match on
    /// it would publish a fact no fighter perceives. `lab` routes the same way
    /// for the same reason.
    ///
    /// Captured once rather than per tick because an arena's roster is fixed:
    /// `duel_from` builds exactly two units and `spawn_monster` refuses an
    /// articulated world outright, so nothing can walk in after this is taken.
    heroes: Vec<EntityId>,
    /// [`Scenario::try_fingerprint`] of the configuration this was built from.
    ///
    /// Held rather than recomputed because the `Scenario` is dropped once the
    /// world is built, and because it is what a recorded fight is *named by*: a
    /// trace that does not carry the fingerprint of the configuration it came
    /// from is a fight nobody can reproduce.
    fingerprint: u64,
    /// The tick the fight stops at, from the configuration.
    ///
    /// Enforced in [`Sim::advance_arena`] rather than left to the caller, so
    /// that a recorder can ask for three thousand six hundred ticks in one call
    /// and get exactly the fight `lab` measures for the same configuration and
    /// seed -- which is the whole claim of
    /// `a_scripted_arena_fight_in_wasm_matches_the_same_fight_in_lab`.
    max_ticks: u32,
}

struct Sim {
    world: World,
    /// One policy per faction, indexed by [`Faction::index`]. Boxed because the
    /// page can swap either of them mid-fight, which is the whole point of the
    /// behaviour panel: watching the same room go differently is much more
    /// convincing than reading that it would.
    policies: [Box<dyn Policy>; 2],
    kinds: [PolicyKind; 2],
    /// The configured duel this world is, or `None` for every world that is not
    /// one -- which is every world any export but [`arena_start`] installs.
    ///
    /// **This field is the branch condition in [`Sim::advance`]**, and it is
    /// deliberately narrower than the combat model. See that function.
    ///
    /// **Written wherever `world` is**, exactly as [`Sim::anatomy`] is and for a
    /// sharper reason: a stale anatomy row costs a body its capsules, and a
    /// stale duel drives the *wrong loop* over the wrong roster. [`Sim::try_on`]
    /// and [`install_boundary_fixture`] build a whole replacement `Sim` and are
    /// clean by construction; [`Sim::descend`] mutates in place and is the one
    /// place that owes the line explicitly.
    arena: Option<Arena>,
    /// Everything the frame draws, captured once. Iterating these and asking
    /// [`World::view`] beats [`World::snapshot`], which allocates a fresh `Vec`
    /// per call -- sixty allocations a second, each one a chance to grow linear
    /// memory and detach the client's typed array.
    units: Vec<EntityId>,
    /// The immutable anatomy each spawn slot was constructed with, indexed by
    /// [`EntityId::index`]. All `None` on a world with no articulated columns.
    ///
    /// `Option` per slot rather than a packed list, so the index *is* the slot.
    /// A `None` here is a unit with no articulated row, and that is the same
    /// slot [`World::pose`] answers `None` for -- the two agree by
    /// construction rather than by luck.
    ///
    /// **A fixed array and not a `Vec`, and that is a measurement rather than a
    /// preference.** A `Vec` sized to the roster is one more heap allocation on
    /// a path that holds two whole worlds at once -- every `init_*_test` fixture
    /// resets by building the replacement before dropping the installed one --
    /// and adding one moved the peak: `the_browser_contact_warmup_does_not_grow_wasm_memory`
    /// settled at 221 pages after one warm round and, with the `Vec`, stepped to
    /// 245 on round eleven, past the nine that fixture warms. A fixed
    /// [`MAX_POSES`]-wide array reserved with the rest of the struct settles it
    /// back at 221 and needs no round bumped, which is the discipline `route`,
    /// `events` and `combat_events` are each allocated at their ceiling for.
    ///
    /// **A mirror, and it exists because there is no way to ask.**
    /// [`sim::body_region_volumes`] takes a `&BodyAnatomySpec` and `World`
    /// resolves its own privately, so a host that publishes the swept capsules
    /// has to hold the same rows the world was built from.
    /// `crates/lab/src/trace.rs` keeps exactly this table for exactly this
    /// reason, and the slot assumption is the same one: `World::try_new` spawns
    /// `scenario.units` in order and no export walks an articulated body into a
    /// world afterwards -- `spawn_monster` refuses one by design -- so the
    /// roster of an articulated world is fixed at construction and a slot
    /// indexes the unit that spawned into it.
    ///
    /// Resolved once per install rather than looked up per publication: the
    /// table is a binary search per body per tick otherwise, inside the one
    /// function that runs after every mutating export.
    ///
    /// **Written wherever `world` is**, and there are three such places:
    /// [`Sim::try_on`], [`Sim::descend`] and [`install_boundary_fixture`], which
    /// swaps a duel in behind a `Sim` built on a generated floor and is
    /// [`init_embodied_test`]'s whole body. (The test helper
    /// `embodied_test_world` is a fourth, and it copies the third.)
    ///
    /// A stale one cannot draw a wrong body: it costs that body its five region
    /// rows, which breaks `region_len == REGIONS_PER_BODY * pose_len` and is
    /// what `the_region_section_covers_every_published_pose` reads. It does
    /// **not** leave the rest of the section where it was -- see
    /// [`write_region_buffer`], which carries one cursor -- so the length
    /// comparison is the reader's protection rather than a nicety.
    anatomy: [Option<sim::BodyAnatomySpec>; MAX_POSES],
    /// Scratch for the decision loop. Held across calls so the loop allocates
    /// once for the life of the page rather than once a frame.
    due: Vec<EntityId>,
    /// The tick the *hero* last answered a decision on, recorded here rather
    /// than in `sim` because it is a presentation detail: it is what lets the
    /// page *show* intellect as reaction speed.
    ///
    /// Hero-only, and that qualifier is load-bearing rather than tidy. The page
    /// reads this twice: once to flash a ring when the character thinks, and
    /// once to decide whether an order has been *acted on* yet. A Skitterer
    /// re-plans every eight ticks, so counting monsters here would light the
    /// ring for somebody else's thinking and would tell the player their order
    /// had landed before the character had so much as looked at it.
    last_decision_tick: u32,
    /// How many times a body has been walked into the room -- monsters and
    /// replacement characters alike, from one counter, so that a spawn and a
    /// swap on the same tick cannot be rolled from the same stream. Keys the
    /// placement RNG, and lives here rather than in [`World`] on purpose: it is
    /// input bookkeeping, not simulation state, so `World::state_hash` never
    /// sees it and a scripted run that never spawns cannot be perturbed by it.
    ///
    /// **Runs on across a descent** rather than resetting with the level, so a
    /// spawn on floor two cannot roll the same point a spawn on floor one did
    /// at the same tick -- the tick resets and this does not.
    spawns: u32,

    /// Which floor this is. Zero is the one `init` opens.
    ///
    /// Seeds the layout alongside the world seed, so descending is a new level
    /// rather than the same one again, and it is what the difficulty curve in
    /// [`Scenario::dungeon`] reads.
    depth: u32,
    /// Bumped every time the floor plan changes, and **only** then: by [`init`],
    /// by [`Sim::descend`], and by a door opening inside [`Sim::advance`].
    ///
    /// That is the whole point of it: [`publish`] runs on every export, and a
    /// revision that moved when a slider moved would tell the page to re-bake a
    /// level that had not changed. The page re-reads the tile buffer exactly
    /// when this number does.
    ///
    /// The third of those is new and is the interesting one: **the floor plan
    /// can now change without the level changing.** A door that opens turns rock
    /// into floor in the middle of a run, so "the plan is fixed for the life of
    /// a level" -- which the first two cases quietly assumed -- is no longer
    /// true, and anything keyed to this has to be keyed to it rather than to the
    /// depth.
    map_revision: u32,
    /// Where the way out stands, once it stands anywhere. `None` until the
    /// level is clear -- **nothing marks the exit while monsters live** -- and
    /// then the spot the last one died, pulled onto standing room by
    /// [`Sim::open_the_way_out`].
    ///
    /// Here and not on [`World`], because the sim has no concept of a level, a
    /// depth or a run: what walking into it *means* is a rule about a game, and
    /// putting it below this line would put progression inside the fight
    /// simulator the lab drives headlessly.
    ///
    /// Once set it stays set. A monster walked in afterwards from the enemy
    /// panel does not shut the way out again: the level *was* cleared, and a
    /// door that closes because the sandbox button was pressed is a rule nobody
    /// asked for.
    portal: Option<Vec2>,
    /// The generator's own exit room -- the room furthest from the start along
    /// the floor, copied off the scenario that built this level.
    ///
    /// The fallback [`Sim::open_the_way_out`] falls back *to*, and the reason
    /// `Level::portal` is still generated at all. It answers the two cases the
    /// last kill cannot: a level that was already clear when it opened (which is
    /// every test fixture that drops the roster), and a monster that left the
    /// world by something other than a blow -- none today, and this is what
    /// makes that a fact about the code rather than a hope.
    exit_room: Option<Vec2>,
    /// Where the hero was killed, for [`Sim::entry_point`]. Cleared by
    /// [`Sim::descend`] -- a new floor is not somewhere you fell.
    ///
    /// Derived from an event, never read by the sim, never hashed: the same
    /// standing as every other field in this half of the struct.
    last_hero_fall: Option<Vec2>,
    /// Where the most recent monster was killed, for the way out. Same standing
    /// as [`Sim::last_hero_fall`], and cleared in the same place.
    last_kill: Option<Vec2>,
    /// Whether the hero has been clear of the way out since it opened.
    ///
    /// The way out now appears where the last thing died, which is usually
    /// inside the reach of whoever killed it -- so without this the level ends
    /// on the tick it is cleared, and the player never sees the room they just
    /// won. Set the first tick the hero stands outside the portal's radius;
    /// required by [`Sim::hero_is_leaving`], and cleared both by
    /// [`Sim::descend`] and by the portal opening.
    portal_armed: bool,

    /// How many articulated rows this world's contact vectors are reserved for.
    /// Zero on a Legacy world, which has no contact state to reserve and for
    /// which `World::try_reserve_contact_slots` is an exact no-op.
    ///
    /// **A record of the reservation, because the reservation is not readable
    /// back.** The only thing on `World` that could report it is capacity, and
    /// `try_reserve_contact_slots` says in as many words that capacity is not
    /// authoritative state and must not be inspected as if it were. So the host
    /// writes down what it asked for on the call that answered `Ok`, and
    /// nothing else may write this: a world installed without that answer is
    /// not installed at all (see [`install_boundary_fixture`]), which is what keeps
    /// this a fact rather than a hopeful copy.
    ///
    /// It lives on `Sim` and not in a `thread_local!` for the reason every other
    /// field here does: it describes *this* world and dies with it, so a plain
    /// [`init`] cannot leave a stale 64 behind for a Legacy room.
    contact_high_water: u32,

    /// Tiles the player has seen at any point on this floor. Cleared by
    /// [`Sim::descend`] and by a fresh [`init`], never otherwise -- this is the
    /// "remembered" half of the fog, and forgetting it mid-floor would be a
    /// level that un-explores itself.
    ///
    /// Sized once to [`MAP_MAX`] where this struct is built and only ever
    /// written in place, the same discipline [`Sim::events`] keeps: nothing here
    /// may reallocate, because an allocation that grows linear memory detaches
    /// every typed array the page is holding.
    seen: Vec<u8>,
    /// The hero tile the visible set was last computed for, and the map revision
    /// it was computed against.
    ///
    /// **The cache key, and it is exact rather than approximate.** A
    /// tile-granular answer can only change when the observer crosses a tile
    /// boundary, so recomputing on that boundary is not a sampling shortcut --
    /// it is the complete set of moments the answer differs.
    vis_at: Option<(i32, i32, u32)>,
    /// Bumped whenever the contents of `VIS` change. The page re-reads and
    /// re-bakes exactly when this moves; see [`Sim::map_revision`] for the same
    /// pattern.
    vis_revision: u32,
    /// Bumped whenever the contents of `FURNITURE` change: a new floor, and the
    /// tick a door opens. Its own number rather than a second reading of
    /// [`Sim::map_revision`], which today moves at exactly the same two moments
    /// -- because the two buffers answer different questions and the torches
    /// below are furniture that the floor plan has nothing to say about.
    furniture_revision: u32,
    /// This floor's torches, copied off the scenario that built it.
    ///
    /// **Here and not on [`World`]**, exactly as [`Sim::portal`] is and for a
    /// stronger version of the same reason: the portal at least crosses into
    /// `Scenario::fingerprint`, and a torch reaches neither the fingerprint nor
    /// the sim. Nothing below the boundary has ever been told they exist, which
    /// is what makes "a decoration cannot move a hash" structural.
    ///
    /// Read only by [`write_furniture`]. A `Vec` allocated once per floor: it is
    /// replaced wholesale by [`Sim::descend`] and never pushed to, so it cannot
    /// grow linear memory under a live typed array the way an in-tick push
    /// could.
    torches: Vec<Torch>,

    // ---- manual control
    /// Which halves of the hero the player has taken: see [`CONTROL_FEET`] and
    /// [`CONTROL_LIMB`]. Independent bits on purpose -- steering a swordsman
    /// and steering a sword are different skills, and being able to hand over
    /// one without the other is most of what makes the page teach anything.
    control: u32,
    input_move: Vec2,
    /// Signed held turn request in [-1, 1]. Integrated here at the fixed
    /// simulation cadence; JavaScript never owns a second floating heading.
    input_turn: Fx,
    input_aim: Angle,
    input_reach: Fx,
    /// The attack button. A *button*, not a bearing: the pointer says where to
    /// cut and this says when.
    input_strike: Strike,
    /// While held, the pointer steers the shield hand instead of the sword.
    input_slot: u8,
    /// The policy's most recent opinion about the hero.
    ///
    /// Under manual control the host submits every tick, but it only *asks* the
    /// policy on the hero's own decision beat, and overwrites the controlled
    /// fields of this. So the AI-driven half keeps its intellect cadence
    /// exactly, and the player's half is not throttled by a stat that is
    /// modelling somebody else's reaction time.
    cached: CommandV1,
    /// The host's own decision clock for the hero.
    ///
    /// Necessary and easy to miss: `World::submit` pushes
    /// `next_decision` out by
    /// a full period, so a hero submitted to on *every* tick never satisfies
    /// `next_decision <= tick` again and silently drops out of
    /// `pending_decisions` for as long as control is held. Without a clock here
    /// the policy would stop being consulted at all, and the HUD's "it just
    /// thought" ring would freeze on the tick control was taken.
    hero_next_decision: u32,

    /// Hit, block and parry markers, indexed by entity index. Presentation
    /// only; never hashed, never read by the sim.
    flashes: Vec<Flash>,

    /// Everything worth announcing that happened during the last [`advance`],
    /// in the order it happened. Presentation only, like `flashes`, and cleared
    /// per *call* rather than per tick -- see [`Sim::advance`].
    ///
    /// [`advance`]: Sim::advance
    events: Vec<FrameEvent>,

    /// How many rows the [`MAX_EVENTS`] cap ate during the last [`advance`].
    ///
    /// Published as `frame[14]` so the claim "the cap is generous" is a thing
    /// the console can check rather than a thing a comment asserts. Reset in
    /// the same three places `events` is cleared, which is one more place than
    /// anybody expects: the top of `advance`, `advance`'s descend early return,
    /// and [`Sim::descend`] itself.
    ///
    /// [`advance`]: Sim::advance
    events_dropped: u32,

    /// Every contact resolution of every tick in the last [`advance`], already
    /// packed into published rows.
    ///
    /// **Packed on the way in rather than at publication, because the evidence
    /// does not survive the next tick.** `World::contact_resolutions` retains
    /// the last solved tick only and the top of the following tick wipes it, so
    /// a call that stepped eight ticks has seven ticks' worth of contacts that
    /// exist nowhere else by the time [`publish`] runs.
    ///
    /// Cleared per *call* rather than per tick, exactly as `events` above is
    /// and on exactly the same argument: one animation frame is up to eight
    /// ticks of catch-up and all eight ticks' blows happened.
    ///
    /// [`advance`]: Sim::advance
    combat_events: Vec<[u32; COMBAT_EVENT_STRIDE]>,

    /// How many rows the [`MAX_COMBAT_EVENTS`] cap ate during the last
    /// [`advance`]. Reset in the same three places `combat_events` is cleared.
    ///
    /// [`advance`]: Sim::advance
    combat_events_dropped: u32,

    /// What each body looked like at the end of the last tick, indexed by
    /// entity index like `flashes`.
    ///
    /// The whole of the derived half of the feed. There is no sim event for "an
    /// attack began" or "a foot landed" and there does not need to be one,
    /// because the phase and the velocity are already in the frame -- but the
    /// *transition* is not, and it is the transition the page wants. Kept on
    /// this side because a Punch's windup is five ticks (`action.rs`) and at
    /// 60 Hz that can begin and end entirely between two
    /// `requestAnimationFrame` callbacks: JavaScript differencing successive
    /// frames would simply never see it.
    traces: Vec<Trace>,

    /// What the next press of the enemy panel's spawn button walks into the
    /// room. A *template*, not a live unit: the page edits it freely and
    /// nothing in the world changes until it is used.
    ///
    /// A Skitterer with its own kit, which is what the `S` hotkey has always
    /// sent, so the button starts where the page already was.
    spawn_spec: UnitSpec,

    /// **What the next character walks in as.** The hero's other half of
    /// [`Sim::spawn_spec`], and the reason a stat sheet survives a death.
    ///
    /// Every write through the Hero rail lands here as well as on the body
    /// standing in the room, so the sheet the player built is the sheet the
    /// replacement arrives wearing. Without it a respawn read
    /// `Body::base_stats()` and every attribute the player had moved went back
    /// to the archetype's default -- which reads as the game throwing away the
    /// only thing on that panel it asked you to think about, and is worse the
    /// more the panel is worth using.
    ///
    /// It is also what makes the rail *editable while dead*. There is no hero
    /// to write to then, and a rail greyed out at exactly the moment the player
    /// has a decision to make about the next one is a panel that is missing when
    /// it is needed. `stats` here is a plan; `World::stats` is a fact; the two
    /// agree while there is a body to agree about.
    ///
    /// **`spawn` is unread**, as it is in `spawn_spec` -- where a replacement
    /// lands is [`Sim::entry_point`]'s decision, and a stored point would go
    /// stale the moment anything moved.
    hero_spec: UnitSpec,
}

/// The generated floor, at `depth`, carrying `hero`.
///
/// **A pass-through now, and it is kept for the name rather than the work.**
/// This function existed because `Scenario::dungeon` built a Legacy floor and
/// the browser had to re-dress it: rename it for the model, attach the fixture
/// spec table, and give every unit an anatomy row. Embodied session 10 moved all
/// of that into `Scenario::dungeon` itself, where the generated floor and the
/// spawn path can no longer dress a body two different ways. What is left here
/// is one call, and the two callers keep reading as they did.
fn dungeon_scenario(seed: u64, depth: u32, hero: UnitSpec) -> Scenario {
    Scenario::dungeon(seed, depth, hero)
}

/// The anatomy and equipment rows one unit needs before a world with
/// articulated columns will take it.
///
/// **Split out of [`dungeon_scenario`] because a spawn needs the same mapping.**
/// `World::try_spawn` refuses a `UnitSpec` with no articulated row outright on
/// such a world -- `CombatSpecError::UnitPresence` -- so [`Sim::walk_in`] and
/// [`Sim::swap_in_hero`] answered `0` to every press of the enemy panel and
/// every replacement character from the moment `init` stopped opening a Legacy
/// room. Two copies of the mapping would be two places for the pairing of an
/// anatomy row with the equipment rows that fit it to drift.
///
/// **It is total and it overwrites the loadout, which is the same decision
/// [`dungeon_scenario`] documents and not a new one.** `CombatSpecTableV1::fixtures`
/// carries one sword, one shield and one club, and an articulated unit's loadout
/// must name the equipment it is given slot for slot -- so a Skitterer's `Knife`
/// and a Rogue's `Punch` cannot cross, and neither can a bow. A partial mapping
/// that kept some hand-edited loadouts and rewrote others would be a spawn that
/// succeeds or fails depending on which slider was last touched.
///
/// **A Skitterer therefore walks in wearing the fighter's frame and holding a
/// sword.** The table has two anatomies against four bodies in the roster, and
/// that is the whole of what has been measured; inventing a third for the
/// creature that has none would be inventing combat geometry. It is what the
/// generated roster has done since the first articulated room existed, so this
/// changes where the mapping is written down rather than what it says.
fn equip_articulated(unit: &mut UnitSpec) {
    // Two anatomies in the table against four bodies in the roster: the
    // brute's frame for a Brute and the fighter's for everything else.
    // Nothing finer is measured, and guessing a third would be inventing a
    // spec.
    let anatomy = if matches!(unit.kind, Body::Brute) { 2 } else { 1 };
    // **The anatomy decides first and the request second**, which is a
    // correction rather than the order `dungeon_scenario` used to carry. It
    // asked about the guard first, which was invisible while the only body
    // walking in behind one was `init`'s Fighter -- a generated Brute's default
    // loadout is a club and a fist. The enemy panel can ask for anything, and a
    // Brute holding the fighter frame's sword and shield is a construction
    // `World::try_spawn` refuses outright under the exact law:
    // `exact_lattice_for_unit` has no lattice for that mass against that
    // equipment, so the spawn button answered `0` under one feature and not the
    // other. The brute frame takes the club the table carries a row for it.
    //
    // A body that already walks in behind a guard keeps the pair -- which is the
    // hero, and is why `init`'s Fighter crosses unchanged.
    let (equipment, loadout) = if anatomy == 2 {
        ([Some(3), None], Loadout::single(sim::ActionKind::Club))
    } else if unit.loadout.secondary == Some(sim::ActionKind::Shield) {
        (
            [Some(1), Some(2)],
            Loadout::pair(sim::ActionKind::Sword, sim::ActionKind::Shield),
        )
    } else {
        ([Some(1), None], Loadout::single(sim::ActionKind::Sword))
    };
    unit.loadout = loadout;
    unit.combat_spec = Some(sim::UnitSpecV1 { anatomy, equipment });
}

/// The anatomy row each of a scenario's spawn slots carries, resolved against
/// that scenario's own spec table.
///
/// All `None` for a scenario with no combat spec table, whose bodies publish no
/// poses. See [`Sim::anatomy`] for why the host keeps this at all,
/// why it is indexed by spawn slot, and why it is [`MAX_POSES`] wide rather than
/// roster-sized.
///
/// A slot past `MAX_POSES` gets no row and needs none: the pose buffer holds
/// exactly that many, so a body the pose section cannot publish is one the
/// region section must not publish either.
fn scenario_anatomy(scenario: &Scenario) -> [Option<sim::BodyAnatomySpec>; MAX_POSES] {
    let table = scenario.combat_specs.as_ref();
    core::array::from_fn(|slot| {
        // Every step is a `?`, and none of them is an `expect`: a unit with no
        // articulated row, or one naming a row the table does not carry, is a
        // construction `World::try_new` has already had its say about. Whatever
        // it decided, this is reachable from `pub extern "C"` and a trap there
        // poisons the instance for the life of the page.
        table?.anatomy(scenario.units.get(slot)?.combat_spec?.anatomy).cloned()
    })
}

/// The command a hero holds before its policy has been asked anything.
///
/// `Command::HOLD`'s embodied replacement, and a function rather than a constant
/// because the neutral embodied command names the yaw the body is already
/// holding. There is no body here, so it names the blank observation's zero --
/// which is harmless and never read: [`Sim::drive_hero`] refreshes it on the
/// first tick it is consulted, because `hero_next_decision` opens at zero.
fn resting_command() -> CommandV1 {
    policy::neutral_command(&Observation::BLANK)
}

impl Sim {
    /// The floor a fresh [`init`] opens, with nothing reserved yet.
    ///
    /// **Embodied, through the same [`dungeon_scenario`] call [`init`] makes.**
    /// The seed, the floor plan and the hero are what they always were and the
    /// model word is what moved; see [`starting_hero`] for the one that walks in.
    ///
    /// `init` does not call this. It goes through [`install_articulated`], which
    /// is the only path that reserves the contact vectors before the world is
    /// reachable and installs nothing at all when it cannot -- so what is left
    /// here is the base a fixture builds before swapping its own world in behind
    /// it.
    ///
    /// **Panics on a construction the sim refuses**, through [`Sim::on`] and on
    /// that function's argument: `dungeon_scenario` and the shipped fixture
    /// table between them cannot produce one.
    fn new(seed: u64) -> Sim {
        Sim::on(
            &dungeon_scenario(seed, 0, starting_hero()),
            seed,
        )
    }

    /// The page's sim, opened on a given scenario.
    ///
    /// Split out of [`Sim::new`] so that a caller who wants a *particular*
    /// level can have one -- which in practice means the tests, most of which
    /// are about the boundary rather than about the level and would rather not
    /// have a generated level's monsters walking into them.
    ///
    /// **Panics on a construction the sim refuses**, exactly as `World::new`
    /// always has and by calling it, and it is reachable from [`init`]. That is
    /// not an oversight and it is not safe by accident: every scenario that
    /// reaches here is one this module built, and the only constructions the sim
    /// refuses are articulated ones -- a missing spec table, an unresolvable
    /// equipment reference, a loadout that names something its row does not
    /// carry, a geometry envelope. [`dungeon_scenario`] cannot produce any of
    /// those, and the shipped fixtures do not either.
    ///
    /// [`Sim::try_on`] is the form for a caller that can be handed a scenario it
    /// did not build, which today means [`install_articulated`]. Prefer it when
    /// in doubt: a trap behind a `pub extern "C"` boundary poisons the instance
    /// for the life of the page.
    fn on(scenario: &Scenario, seed: u64) -> Sim {
        Sim::try_on(scenario, seed).expect("invalid combat construction")
    }

    /// [`Sim::on`], with the refusal handed back rather than raised.
    ///
    /// The shape `World::try_new` already has, mirrored one layer up for the
    /// same reason it exists down there: an articulated scenario can be refused
    /// for a missing spec table, an unresolvable equipment reference or a
    /// geometry envelope, and the host's only correct answer to any of those is
    /// to install nothing at all.
    fn try_on(scenario: &Scenario, seed: u64) -> Option<Sim> {
        let hero_spec = scenario
            .units
            .iter()
            .copied()
            .find(|unit| unit.faction == Faction::Heroes)
            // A level with no hero in it is not a scenario this module can be
            // pointed at, but the fallback is a Fighter rather than a panic:
            // `init` is `pub extern "C"` and a trap there poisons the instance
            // for the life of the page.
            .unwrap_or(UnitSpec {
                kind: Body::Fighter,
                faction: Faction::Heroes,
                stats: Body::Fighter.base_stats(),
                loadout: Body::Fighter.default_loadout(),
                combat_spec: None,
                spawn: Vec2::ZERO,
            });
        let world = Sim::try_open(scenario, seed)?;
        let mut units = Vec::with_capacity(scenario.units.len());
        for faction in [Faction::Heroes, Faction::Monsters] {
            units.extend_from_slice(&world.alive_ids(faction));
        }
        // **Both sides open on the fighter, and the paragraph this replaced is
        // kept below because it was true when it was written and stopped being
        // true rather than because it was wrong.**
        //
        // It read: the legacy seam had two minds to contrast -- a naive baseline
        // whose footwork never looked at what was in its hand, against one that
        // dispatched per role -- and watching the same room go differently when
        // the dropdown moved was the page's whole subject; `PolicyKind`
        // is not that registry, it holds one mind, one copy of that mind with a
        // single term switched off, and a control that stands there. That was an
        // accurate description of a three-entry registry, and the conclusion it
        // drew -- open both sides on the one mind, because the alternative is an
        // empty room with an explanation -- followed from it.
        //
        // The registry now holds a fighter that aims at a named region and
        // guards against a blade it reads, the script that fighter was built to
        // beat, and that fighter with its guard read switched off. **The
        // asymmetry the old paragraph says was missing is exactly what
        // `tactical` against `scripted` now is**, and it is the comparison this
        // whole topic was built to make visible.
        //
        // Opening on `tactical` on *both* sides rather than on that contrast is
        // deliberate: this route is the dungeon, not the arena, and a reader who
        // came here to watch a fight should see the shipped fighter on both
        // sides of it. `#/arena` is the route whose whole subject is the matchup,
        // it opens on the contrast, and both sides here are still a
        // [`set_policy`] press away.
        let kinds = [PolicyKind::Tactical, PolicyKind::Tactical];
        let mut sim = Sim {
            world,
            policies: [kinds[0].build(), kinds[1].build()],
            kinds,
            // Filled by [`arena_start`] after this returns, and by nothing else.
            arena: None,
            units,
            anatomy: scenario_anatomy(scenario),
            due: Vec::with_capacity(scenario.units.len()),
            last_decision_tick: 0,
            spawns: 0,
            depth: 0,
            map_revision: 0,
            // **Not `scenario.portal`.** Nothing marks the way out until the
            // level is clear; the generator's exit room is kept one field down
            // as the fallback and nothing else.
            portal: None,
            exit_room: scenario.portal,
            last_hero_fall: None,
            last_kill: None,
            portal_armed: false,
            // Zero and not `MAX_UNITS`: nothing has been reserved *yet*, and
            // this field records the call that answered `Ok` rather than the
            // model. Three places can honestly write anything else --
            // `init`, the two `init_*_test` fixtures and `Sim::descend` --
            // and each of them does it while the world it reserved against is
            // still a local.
            contact_high_water: 0,
            // The fog's memory, sized to the tile buffer it is indexed against
            // rather than to this level's extent. Every `Sim` is built through
            // here, so this is the one place it can be sized -- and a `seen`
            // shorter than the buffer would make `refresh_vis` an out-of-bounds
            // index inside `publish`, which is the poisoned-instance failure the
            // crate docs open with.
            seen: vec![0; MAP_MAX],
            // `None` rather than the hero's tile, so the first `publish` after a
            // level opens computes the disc instead of trusting a key that was
            // guessed before anything was placed.
            vis_at: None,
            vis_revision: 0,
            furniture_revision: 0,
            // Off the scenario, which is the only thing that has ever known: a
            // generated one carries the generator's list and a hand-built
            // fixture carries none, and neither needs a case here.
            torches: scenario.torches.clone(),
            control: 0,
            input_move: Vec2::ZERO,
            input_turn: Fx::ZERO,
            input_aim: Angle::ZERO,
            input_reach: Fx::ZERO,
            input_strike: Strike::None,
            input_slot: 0,
            cached: resting_command(),
            hero_next_decision: 0,
            flashes: Vec::new(),
            // Allocated once, at its ceiling, so no frame's event feed can grow
            // linear memory and detach the typed array the client is about to
            // read the frame through.
            events: Vec::with_capacity(MAX_EVENTS),
            events_dropped: 0,
            // At its ceiling too, and here the argument is not merely the
            // typed-array one: `client/test/wasm-memory.test.mjs` drives
            // `step(64)` against a live view and requires
            // `memory.buffer.byteLength` not to move, so a per-tick push that
            // grew this vector is a failing test rather than a latent risk.
            combat_events: Vec::with_capacity(MAX_COMBAT_EVENTS),
            combat_events_dropped: 0,
            traces: Vec::new(),
            spawn_spec: UnitSpec {
                kind: Body::Skitterer,
                faction: Faction::Monsters,
                stats: Body::Skitterer.base_stats(),
                loadout: Body::Skitterer.default_loadout(),
                combat_spec: None,
                // Overwritten at every spawn. The page chooses *what* and the
                // module chooses *where*, because a position invented in
                // JavaScript is a float walking into simulation state.
                spawn: Vec2::ZERO,
            },
            // **The same value the level was built from**, so the sheet a
            // replacement inherits and the fighter standing in the room are the
            // same fighter on tick zero. A second literal here is how those two
            // drift apart on the first edit to either.
            hero_spec,
        };
        // **A level can be clear before it has been fought.** Every fixture that
        // drops the roster opens on an empty floor, and there is then no falling
        // edge from one monster to none for [`Sim::advance`] to catch -- so the
        // rule is stated once, here and per tick, as "clear means open" rather
        // than as a transition.
        sim.open_the_way_out();
        Some(sim)
    }

    /// Builds the world a scenario describes, with both objective channels
    /// switched on.
    ///
    /// **Both channels are switched on and neither is read at all**, which is
    /// stated here rather than quietly repaired. This used to add that
    /// `Objective::Order` and `Objective::Hunt` build a flow field per faction
    /// whose only readers were `nav_dir` and `nav_distance` on the legacy
    /// `Observation`, and that deleting the field belonged to a later session.
    /// That session has happened: `World::refresh_nav` and its readers are gone,
    /// so setting an objective now writes two words that reach `state_hash` and
    /// nothing else. They are left switched on because turning them off is a
    /// change to *world construction* on a path a fixture may still open, and
    /// because the input is the half worth keeping -- see the standing order
    /// section for the exports that went when the readers did, and
    /// `World::set_order` for what giving the channel a reader again would
    /// take.
    ///
    /// One function rather than two copies, because [`Sim::new`] and
    /// [`Sim::descend`] have to agree about this and a level that quietly
    /// opened without an objective would be a level where nothing moves.
    fn open(scenario: &Scenario, seed: u64) -> World {
        Sim::try_open(scenario, seed).expect("invalid combat construction")
    }

    /// [`Sim::open`], with a refused construction handed back. See
    /// [`Sim::try_on`] for why the fallible form exists at all.
    fn try_open(scenario: &Scenario, seed: u64) -> Option<World> {
        let mut world = World::try_new(scenario, seed).ok()?;
        world.set_objective(Faction::Heroes, Objective::Order);
        world.set_objective(Faction::Monsters, Objective::Hunt);
        Some(world)
    }

    /// Puts the way out where the last thing died, once there is nothing left
    /// to fight.
    ///
    /// Called at every level open and once per tick from [`Sim::advance`]. It
    /// is a *state* rather than an edge -- "clear and no portal yet" rather than
    /// "the count just reached zero" -- because a level can be clear the moment
    /// it opens, and an edge detector would never fire on one that was.
    ///
    /// Counted off [`World::alive_count`] rather than off the frame's unit
    /// rows, which are capped at [`MAX_UNITS`]: the authority on "is the level
    /// clear" must not be a number that saturates.
    fn open_the_way_out(&mut self) {
        if self.portal.is_some() || self.world.alive_count(Faction::Monsters) > 0 {
            return;
        }
        // The last kill, and the generator's exit room behind it. `last_kill` is
        // where the *blow* landed rather than where the body's centre was --
        // within a body radius of it, which is what "the same place" means to
        // anybody watching.
        let Some(at) = self.last_kill.or(self.exit_room) else {
            // A scenario with no exit room and nothing killed on it: the lab's
            // skirmishes, and the fixtures built on them. They had no way out
            // before and they have none now.
            return;
        };
        // `nearest_walkable` against the widest body in the roster, so the
        // portal is never half inside masonry and never somewhere a Brute could
        // not walk onto -- the same guarantee the generator's own placements are
        // held to.
        self.portal = Some(self.world.nearest_walkable(at, Body::Brute.radius()));
        // And disarmed, because the hero is very likely standing in it: it
        // opened where the hero's own last blow landed. See [`Sim::portal_armed`].
        self.portal_armed = false;
    }

    /// Whether there is a way out, and whether the page should draw it.
    ///
    /// Two states, not three. [`PORTAL_SHUT`] is retired -- see its own comment
    /// for the decision that retired it -- so a portal that exists is a portal
    /// that is open.
    fn portal_state(&self) -> u32 {
        match self.portal {
            None => PORTAL_NONE,
            Some(_) => PORTAL_OPEN,
        }
    }

    /// Whether the hero's body overlaps the way out. Geometry only: it says
    /// nothing about whether stepping there should *do* anything, which is
    /// [`Sim::hero_is_leaving`]'s question and needs the arming flag as well.
    fn hero_touches_way_out(&self) -> bool {
        let (Some(portal), Some(hero)) = (self.portal, self.hero()) else {
            return false;
        };
        self.world
            .view(hero)
            .is_some_and(|v| v.position.distance(portal) <= PORTAL_RADIUS + v.radius)
    }

    /// Whether the way out will take the hero: a way out, the hero standing in
    /// it, and the hero having stood clear of it at some point since it opened.
    fn hero_is_leaving(&self) -> bool {
        self.portal_state() == PORTAL_OPEN && self.portal_armed && self.hero_touches_way_out()
    }

    /// Builds the next floor down and moves the run onto it.
    ///
    /// The hero persists and its health does not: `World::spawn` sets `hp` to
    /// `max_hp` and refills the regeneration budget, so arriving whole costs no
    /// code here at all. What it does cost is every piece of presentation state
    /// keyed to bodies that no longer exist -- flashes, the trace table, the
    /// event feed and its drop count -- and dropping those is the whole of the
    /// rest of this function.
    ///
    /// **[`EVENT_DESCEND`] is pushed from here rather than from
    /// [`Sim::advance`]**, and that is not tidiness. `advance` clears the feed
    /// *before* it calls this, so a row pushed on the way in is a row that gets
    /// cleared; and `self.depth += 1` -- which is the number the row carries --
    /// happens on the first line of this function. Both facts point at the same
    /// place, and the export that calls `descend` directly gets the row for
    /// free.
    fn descend(&mut self) {
        // The way out, read before it is forgotten. Everything below replaces
        // this level with the next one, and the row pushed at the bottom is
        // about the doorway that was just walked through rather than about
        // wherever the new floor happens to put one.
        let left_by = self.portal.unwrap_or(Vec2::ZERO);
        self.depth += 1;
        // **The live sheet wins over the stored one.** The player may have moved
        // a slider since the last spawn, and the character that walks down the
        // stairs should be the character that was standing there. Same argument
        // `hero_spec` exists for one level up.
        if let Some(hero) = self.hero() {
            if let Some(stats) = self.world.stats(hero) {
                self.hero_spec.stats = stats;
            }
            if let Some(loadout) = self.world.loadout(hero) {
                self.hero_spec.loadout = loadout;
            }
            if let Some(view) = self.world.view(hero) {
                self.hero_spec.kind = view.kind;
            }
        }

        // **Through the model-aware builder, not `Scenario::dungeon` directly.**
        // A run opened by [`init`] is standing on an embodied
        // floor and its hero carries an articulated row, and a plain
        // `Scenario::dungeon` would hand that row to a Legacy scenario --
        // which `World::new` refuses by panicking, one call inside a
        // `pub extern "C"` export. On a Legacy run this is the same scenario it
        // always was, byte for byte.
        let scenario = dungeon_scenario(self.world.seed(), self.depth, self.hero_spec);
        let mut world = Sim::open(&scenario, self.world.seed());
        // The new floor's contact vectors, reserved **while the world is still a
        // local** -- the same ordering [`init`] keeps, and for the
        // same reason: a reservation that happened after the world was reachable
        // would put the growth exactly where it must not be, on the first call
        // that adds a body. Zero on Legacy, where the reservation is an exact
        // no-op over contact state that does not exist and a 64 here would be a
        // lie.
        //
        // **This is the one place a refusal does not install nothing**, and the
        // difference is that there is nothing to fall back to: `init`
        // can hand the page an empty module and say so, while a descent has
        // already left the level behind and a hero standing in a portal with
        // nowhere to go is a page that retries forever. So the floor is
        // installed and `contact_high_water` reads zero, which is the honest
        // report. Reachable only on `ContactCapacityError::Allocation` -- 64 is
        // `MAX_ENTITIES`, so the entity limit cannot refuse -- which
        // is an out-of-memory module.
        self.contact_high_water = {
            {
                match world.try_reserve_contact_slots(MAX_UNITS) {
                    Ok(()) => MAX_UNITS as u32,
                    Err(_) => 0,
                }
            }
        };
        self.world = world;
        // Beside the world it describes, and on the line after it, because the
        // two are one fact: a floor's slots and the anatomies that spawned into
        // them. A descent that replaced the first and not the second would
        // publish last floor's capsules against this floor's bodies.
        self.anatomy = scenario_anatomy(&scenario);
        // **And the duel goes with the world it was a duel in.** Same
        // obligation as the line above, unpaid until v2-ui-05's review, and
        // worse when unpaid: [`Arena::heroes`] holds ids from a roster that no
        // longer exists and [`Arena::max_ticks`] is the old configuration's
        // limit, so a duel left standing here would drive a freshly generated
        // dungeon floor through [`Sim::advance_arena`] -- routing each
        // decision by whether its id happens to appear in a list drawn from a
        // world that no longer exists, and stopping the floor dead on the old
        // fight's tick limit, while `arena_fingerprint` went on naming the old
        // duel and `set_policy` went on refusing the legacy codes that are the
        // true answer here. A page with no error on it and a level that had
        // stopped.
        //
        // **Converted rather than refused**, and the choice is written down
        // because it is arguable: an arena is two fighters in a bare box with
        // no portal, so arriving here at all is a caller that has confused its
        // pages. Refusing needs a channel [`descend`] does not have -- it
        // answers the new depth, and there is no depth that means "no" -- and
        // it would leave this hole open anyway for the next place that
        // assigns `world`. The rule that keeps working is the field's own.
        self.arena = None;
        // A new floor's lights. Replaced rather than cleared and refilled, so
        // there is no window in which the furniture buffer could be written from
        // last floor's torches and this floor's doors.
        self.torches = scenario.torches.clone();
        self.units.clear();
        for faction in [Faction::Heroes, Faction::Monsters] {
            self.units.extend_from_slice(&self.world.alive_ids(faction));
        }
        // A new floor has no way out yet and nowhere anybody fell: both are
        // facts about the level that was just left. `exit_room` is the only one
        // that crosses, and it crosses as the *new* level's fallback.
        self.portal = None;
        self.exit_room = scenario.portal;
        self.last_hero_fall = None;
        self.last_kill = None;
        self.portal_armed = false;
        // And the same rule the constructor states: clear means open. A
        // generated floor always has somebody on it, so this is the fixture
        // case rather than the ordinary one -- but stating it in one place and
        // not two is what keeps the two from drifting.
        //
        // **Recorded, not fixed: this call is outside `advance`'s portal edge
        // test, so a floor that arrives already clear opens its way out with no
        // [`EVENT_PORTAL`] row behind it.** Unreachable in play for the reason
        // just given, which is why it is left alone rather than papered over
        // with a second edge test that could disagree with the first. It stops
        // being free the moment something keys off that edge -- `v2-09` retains
        // the post-gate sound contract -- and at that point the answer is to move
        // the edge test into `open_the_way_out` itself so there is one of it.
        self.open_the_way_out();
        self.flashes.clear();
        self.traces.clear();
        self.events.clear();
        self.events_dropped = 0;
        // The contact feed goes with them, and for a sharper version of the
        // same reason: an event row carries both halves of two identities, and
        // the new floor hands those slots to new bodies. Publishing last
        // level's contacts against this one would attribute a severed arm to
        // whoever walked into the vacated index.
        self.combat_events.clear();
        self.combat_events_dropped = 0;
        // The one row that survives the clearing, because it is about the
        // clearing. Pushed after it for that reason and not before.
        push_event(
            &mut self.events,
            &mut self.events_dropped,
            FrameEvent {
                kind: EVENT_DESCEND,
                at: left_by,
                amount: Fx::from_int(self.depth as i32),
                actor: SLOT_EMPTY,
                other: SLOT_EMPTY,
                aux0: Fx::ZERO,
                aux1: Fx::ZERO,
            },
        );
        self.last_decision_tick = 0;
        self.hero_next_decision = 0;
        self.cached = resting_command();
        self.map_revision = self.map_revision.wrapping_add(1);
        // And the fog, which is the floor plan's other half and forgotten with
        // it. `VIS` itself is left alone: `refresh_vis` runs before the next
        // frame is written and `Dungeon::visible_tiles` clears what it is given,
        // so the buffer is overwritten wholesale rather than needing a wipe here.
        self.seen.fill(0);
        self.vis_at = None;
        self.vis_revision = self.vis_revision.wrapping_add(1);
        write_map(&self.world);
        // And the furniture, which is a different set of doorways on a different
        // floor plan and would otherwise be last level's doors drawn over this
        // level's rock.
        self.furniture_revision = self.furniture_revision.wrapping_add(1);
        write_furniture(&self.world, &self.torches);
    }

    /// The standing hero, if there is one.
    fn hero(&self) -> Option<EntityId> {
        self.units
            .iter()
            .copied()
            .find(|&id| self.world.view(id).is_some_and(|v| v.faction == Faction::Heroes))
    }

    fn flash(&mut self, entity: EntityId, pick: impl Fn(&mut Flash) -> &mut u8) {
        let index = entity.index as usize;
        if index >= self.flashes.len() {
            self.flashes.resize(index + 1, Flash::default());
        }
        *pick(&mut self.flashes[index]) = FLASH_TICKS;
    }

    fn flash_of(&self, entity: EntityId) -> Flash {
        self.flashes
            .get(entity.index as usize)
            .copied()
            .unwrap_or_default()
    }

    /// What this body looked like at the end of the last tick, or a resting
    /// default for one that has not had a tick yet. Shaped exactly like
    /// [`Sim::flash_of`] and total for the same reason: a body that walked in
    /// this frame has no row here and must not be a panic.
    fn trace_of(&self, entity: EntityId) -> Trace {
        self.traces
            .get(entity.index as usize)
            .copied()
            .unwrap_or_default()
    }

    /// Sets the policy for one faction, building a fresh instance of it.
    ///
    /// **No genome crosses, because an embodied policy has none.** The legacy
    /// registry answered a `PolicySpec` of named knobs and this one answers a
    /// kind; the five exports that read and wrote those knobs were deleted
    /// rather than made to answer zero, because an export that always answers
    /// zero is a control the page can still draw.
    ///
    /// A fresh instance and not a reset of the standing one:
    /// [`policy::ScriptedPolicy`] carries the ground it has walked over,
    /// and a side that had just been *changed* should not inherit it.
    fn set_policy(&mut self, faction: Faction, kind: PolicyKind) {
        let side = faction.index();
        self.kinds[side] = kind;
        self.policies[side] = kind.build();
    }

    /// `frames` ticks of the full loop.
    ///
    /// **Its own loop rather than the crate's**, which was true of the deleted
    /// `policy::run` and of the deleted `policy::run_articulated` and is true of
    /// `policy::run`: they gate on
    /// `World::outcome()`, which reports `HeroesWin` from tick zero when there is
    /// nothing left to fight, so any of them would return before the hero took a
    /// step.
    ///
    /// The answering half is not optional either. `expire_unanswered_decisions`
    /// advances an agent's decision clock even when nothing answered it, so a
    /// loop that only called `world.step()` would leave the hero executing its
    /// tick-zero command forever -- which under a `Goto` means walking straight
    /// through the destination and into the far wall.
    ///
    /// # The grammar
    ///
    /// **Embodied, and porting the loop was the whole of the work.** Switching
    /// which model [`init`] opens is one word in [`Sim::new`]; leaving this loop
    /// on `World::observe` and `World::submit` beside it would have been a room
    /// where nothing moved at all, because `World::submit` returns without
    /// storing anything on a world that is not Legacy. Silently -- there is no
    /// refusal to read and no counter to publish, so the symptom would have been
    /// a floor of monsters standing still and no error anywhere.
    ///
    /// **What the port loses is the legacy event feed, and that is the model
    /// rather than a regression to repair here.** The embodied arm of
    /// `World::step` emits exactly one `Event` variant, `Event::Death`; damage,
    /// blocks and parries are carried by contact resolution rows instead, which
    /// this loop already harvests into the combat-event publication. So the
    /// flashes and the `EVENT_DAMAGE`, `EVENT_BLOCK` and `EVENT_PARRY` rows go
    /// quiet, and the page's evidence that a blow landed becomes the channel
    /// that says where it landed, on which body part, and how the energy split.
    ///
    /// **A click is a fact about the world that no fighter can perceive.**
    /// `Order::Goto` still reaches `World::set_order` and still fingerprints,
    /// and an `Observation` has no order column -- so nothing acts on
    /// one under this grammar. Click-to-move is owed an observation column by
    /// whoever wants it back; the playable channel today is [`set_control`] and
    /// [`set_input`], which this loop answers every tick.
    ///
    /// # The second branch
    ///
    /// A configured duel runs [`Sim::advance_arena`] instead, and the branch is
    /// the first line. **The condition is the arena and not the combat model,
    /// which was narrower than v2-ui-05 asked for and is now the only shape
    /// available**: with the floor embodied, a model test would divert every
    /// world this module installs into a loop that has no route, no portal and
    /// no descent in it. What separates the two is that a duel is a fight on a
    /// clock between a fixed roster and a floor is a game, which is exactly what
    /// the field it branches on records.
    fn advance(&mut self, frames: u32) {
        if self.arena.is_some() {
            self.advance_arena(frames);
            return;
        }
        // Taken out and put back so the borrow checker can see that the scratch
        // buffer and the world are disjoint. It is the same allocation each
        // time round, which is the whole point of keeping it in the struct.
        let mut due = std::mem::take(&mut self.due);
        // **Cleared per call, not per tick.** One animation frame can be up to
        // eight ticks of catch-up, and all eight ticks' worth of blows happened
        // -- a page that only ever saw the last tick's would drop seven eighths
        // of the damage numbers on any frame the browser was late for, which is
        // exactly the frame a fight is most interesting on.
        let mut events = std::mem::take(&mut self.events);
        events.clear();
        // Counted alongside the feed rather than on `self`, because the drain
        // below holds `&self.world` for the whole of its loop and a field
        // increment inside it would not borrow-check. Written back with the
        // feed at every exit.
        let mut dropped = 0u32;
        // The contact feed, taken out and cleared on exactly the terms above.
        // It cannot be filled at publication like the pose rows are:
        // `World::contact_resolutions` retains the last solved tick only, so
        // every tick of a catch-up burst but the last has already been wiped by
        // the time `publish` runs.
        let mut combat_events = std::mem::take(&mut self.combat_events);
        combat_events.clear();
        let mut combat_dropped = 0u32;
        for _ in 0..frames {
            for flash in &mut self.flashes {
                flash.hit = flash.hit.saturating_sub(1);
                flash.block = flash.block.saturating_sub(1);
                flash.parry = flash.parry.saturating_sub(1);
            }

            // **Taken before the step, and unconditionally.** `World::reap_dead`
            // runs inside `World::step` and recycles a lethal blow's slot before
            // the event slice comes back, so by the time the drain below reads
            // an `Event::Damage`'s `target` there is no `view` left to ask which
            // side it was on -- for exactly the blow that matters here. This
            // handle is the answer instead: everything in `self.units` is a Hero
            // or a Monster, so "the target was not this" is "the target was a
            // monster".
            let hero_before = self.hero();
            // And the floor plan, for the same reason: `Dungeon::open_door` is
            // the only mutator there is and it re-digests in the same call, so
            // differencing this across the step is exactly "did a door open".
            // Cheaper and narrower than an event, and it cannot be forgotten by
            // a future rule that changes the grid some other way.
            let plan_before = self.world.dungeon().fingerprint();
            // The tick number every contact resolved below is stamped with, and
            // it has to be read *before* the step: `World::step` increments the
            // counter on its way out, and a contact's time of impact is a
            // fraction of the tick that was integrated rather than of the one
            // that has not started yet.
            let solving_tick = self.world.tick();
            let driven = if self.control != 0 { hero_before } else { None };
            due.clear();
            due.extend_from_slice(self.world.pending_decisions());
            for &id in &due {
                if Some(id) == driven {
                    continue; // answered below, every tick, from live input
                }
                // **The side is looked up rather than read off the
                // observation.** An `Observation` is subject scoped
                // and carries no faction column by design.
                // [`Sim::advance_arena`] routes on a roster captured at install
                // because a duel's roster is fixed; a floor's is not -- the
                // enemy panel walks bodies in and a replacement walks one back --
                // so this asks the world, which is the only thing that knows.
                //
                // A handle `pending_decisions` named and `view` cannot resolve
                // is skipped rather than assigned a side: guessing a faction for
                // a body that is not there would run somebody else's policy.
                let Some(faction) = self.world.view(id).map(|view| view.faction) else {
                    continue;
                };
                // There is no `observe_embodied`, and the absence is the point:
                // an embodied body produces an `Observation` exactly
                // as an articulated one did. The observation was never per model
                // -- the columns it reads were owned by a predicate both models
                // answered true -- which is why deleting the second one took
                // nothing out of this line.
                let obs = self.world.observe(id);
                let command = self.policies[faction.index()].decide(&obs);
                // The outcome is discarded here where the runner counts it, on
                // [`Sim::advance_arena`]'s argument exactly: a refusal stores the
                // neutral command atomically, so the fight carries on either
                // way, and the page's channel for "the world refused something"
                // is [`submit_embodied`]'s packed word rather than a counter
                // nobody publishes.
                //
                // **The rule that used to sit here is gone because it became
                // structural.** A hero under `Order::Hold` with nothing alive to
                // fight had its `move_dir` zeroed, so that mouse control could be
                // the playable default without the policy wandering off. The
                // embodied script cannot wander: with nobody in the observation
                // there is no opponent to close on, and what it answers is
                // `neutral_command`.
                let _ = self.world.submit(id, command);
                if faction == Faction::Heroes {
                    self.last_decision_tick = self.world.tick();
                }
            }
            if let Some(hero) = driven {
                self.drive_hero(hero);
            }

            // The events the old loop discarded. There is something worth
            // seeing in them now.
            let mut marks: [(EntityId, u8); 8] = [(EntityId::NONE, 0); 8];
            let mut count = 0;
            // Collected rather than written straight through, on the same
            // argument the `marks` array above is: the last of each within the
            // tick wins, which is the one the player watched.
            let mut fell_at: Option<Vec2> = None;
            let mut killed_at: Option<Vec2> = None;
            // Before the step, so that a row about a body the step is about to
            // remove still has a weight, a size and a place to report. See
            // [`Trace`].
            self.refresh_traces();
            let traces = &self.traces;
            for event in self.world.step() {
                let pair = match *event {
                    Event::Damage {
                        source,
                        target,
                        amount,
                        at,
                        // Read on the `Death` arm below instead, off the trace
                        // table, because that is the only arm an embodied tick
                        // can reach.
                        lethal: _,
                    } => {
                        let body = trace_at(traces, target);
                        // The numbers, kept rather than reduced to a flash. The
                        // flash counters below say *that* something landed; a
                        // damage row says how much and exactly where, which is
                        // the difference between a body glowing red and a number
                        // floating off it.
                        push_event(
                            &mut events,
                            &mut dropped,
                            FrameEvent {
                                kind: EVENT_DAMAGE,
                                at,
                                amount,
                                actor: target.index,
                                other: actor_index(source),
                                // **The body's numbers, not the blade's.** What
                                // rings when something is hit is the thing that
                                // was hit; the swing's own geometry is a
                                // different question and would be a different
                                // field. See `EVENT_STRIDE`'s table.
                                aux0: body.mass,
                                aux1: body.radius,
                            },
                        );
                        [(target, 0u8), (EntityId::NONE, 0)]
                    }
                    Event::Block {
                        attacker,
                        defender,
                        absorbed,
                        at,
                    } => {
                        push_event(
                            &mut events,
                            &mut dropped,
                            FrameEvent {
                                kind: EVENT_BLOCK,
                                at,
                                amount: absorbed,
                                actor: defender.index,
                                other: actor_index(attacker),
                                aux0: trace_at(traces, defender).mass,
                                aux1: Fx::ZERO,
                            },
                        );
                        [(defender, 1), (EntityId::NONE, 0)]
                    }
                    Event::Parry { a, b, at } => {
                        // One row for the pair, not two: a parry is one thing
                        // that happened between two fighters, and `Event::Parry`
                        // already reports it once with `a` below `b`. Two rows
                        // would put two sparks on one crossing.
                        push_event(
                            &mut events,
                            &mut dropped,
                            FrameEvent {
                                kind: EVENT_PARRY,
                                at,
                                amount: Fx::ZERO,
                                actor: a.index,
                                other: actor_index(b),
                                aux0: Fx::ZERO,
                                aux1: Fx::ZERO,
                            },
                        );
                        [(a, 2), (b, 2)]
                    }
                    // The three that carry no flash, and did not used to carry
                    // anything at all. A death removes a body and a loose *adds
                    // an arrow*, so neither needs a one-frame glow to be seen --
                    // but both are *moments*, and a moment is the one thing a
                    // page differencing state cannot recover. A shove is the
                    // third: the magnitude is genuinely not derivable from
                    // outside, which is the whole reason `Event::Shove` exists.
                    Event::Death { entity, killer } => {
                        let body = trace_at(traces, entity);
                        // **The two things a run is shaped by, taken off this
                        // arm rather than off `Event::Damage`.** Where a
                        // replacement comes back in and where the way out opens
                        // used to be read from a lethal damage row, and that arm
                        // is unreachable under the model this module opens: the
                        // embodied tick emits exactly one `Event` variant and
                        // this is it. Left there, a run on this floor would have
                        // no `last_kill` and no `last_hero_fall` at all, so every
                        // way out would fall back to the generator's exit room
                        // and every replacement to the fallback band -- silently,
                        // because both fallbacks are legitimate answers to a
                        // different question.
                        //
                        // The comment that stood here said `Event::Death` was the
                        // wrong place because it carries no position. It carries
                        // none, and the trace table beside it does: `body.at` is
                        // the body's own centre as of the tick before the step
                        // that removed it, which is a *better* answer than the
                        // blade contact point the damage row carried -- up to a
                        // reach away from where the body actually fell.
                        if Some(entity) == hero_before {
                            fell_at = Some(body.at);
                        } else {
                            killed_at = Some(body.at);
                        }
                        push_event(
                            &mut events,
                            &mut dropped,
                            FrameEvent {
                                kind: EVENT_DEATH,
                                // The body's own centre, from the trace. The
                                // lethal `Damage` beside this row carries the
                                // *blade contact point*, which is up to a reach
                                // away from where the body actually fell.
                                at: body.at,
                                amount: Fx::ZERO,
                                actor: entity.index,
                                other: actor_index(killer),
                                aux0: body.mass,
                                aux1: Fx::from_int(kind_code(body.kind) as i32),
                            },
                        );
                        continue;
                    }
                    Event::Loose { source, at, line } => {
                        push_event(
                            &mut events,
                            &mut dropped,
                            FrameEvent {
                                kind: EVENT_LOOSE,
                                at,
                                amount: Fx::ZERO,
                                actor: actor_index(source),
                                other: SLOT_EMPTY,
                                // In turns, `0..1`. A raw binary angle is a
                                // `u16` and `Fx::from_int` saturates at 32768,
                                // so the raw value crosses as the fraction of a
                                // turn it already is -- which is exact, because
                                // `raw / 65536` is what 16.16 represents.
                                aux0: Fx::from_ratio(i32::from(line.raw()), 65_536),
                                aux1: Fx::ZERO,
                            },
                        );
                        continue;
                    }
                    Event::Shove {
                        entity,
                        shover,
                        impulse,
                        at,
                    } => {
                        push_event(
                            &mut events,
                            &mut dropped,
                            FrameEvent {
                                kind: EVENT_SHOVE,
                                at,
                                // The magnitude, because a direction is already
                                // recoverable: the page has `vx, vy` on the row
                                // and the impact point on this one. What it
                                // cannot have is how much of the body's motion
                                // was done *to* it.
                                amount: impulse.length(),
                                actor: entity.index,
                                other: actor_index(shover),
                                aux0: trace_at(traces, entity).mass,
                                aux1: Fx::ZERO,
                            },
                        );
                        continue;
                    }
                };
                for mark in pair {
                    if !mark.0.is_none() && count < marks.len() {
                        marks[count] = mark;
                        count += 1;
                    }
                }
            }
            // Inside the tick loop and immediately after the step, because this
            // slice is wiped at the top of the next one. `contact_resolutions`
            // already hands them over sorted by `(group_ordinal, ContactKey)`
            // and ordinals are handed out in increasing time of impact, so
            // appending in world order is the documented
            // `(tick, toi, ordinal, key)` total order rather than a second
            // opinion about it -- `the_documented_event_order_holds_over_a_tick_with_several_groups`
            // is what makes that a check instead of an assumption.
            for row in self.world.contact_resolutions() {
                push_combat_event(
                    &mut combat_events,
                    &mut combat_dropped,
                    combat_event_row(solving_tick, row),
                );
            }
            for &(entity, slot) in &marks[..count] {
                match slot {
                    0 => self.flash(entity, |f| &mut f.hit),
                    1 => self.flash(entity, |f| &mut f.block),
                    _ => self.flash(entity, |f| &mut f.parry),
                }
            }
            if let Some(at) = fell_at {
                self.last_hero_fall = Some(at);
            }
            if let Some(at) = killed_at {
                self.last_kill = Some(at);
            }

            // A doorway that somebody just walked through. Per tick and not per
            // animation frame, on the same argument the way-out test below
            // makes: a catch-up burst is up to eight ticks, and the page must
            // not spend seven of them drawing masonry in a hole.
            //
            // The fog follows for free and deliberately has no line of its own:
            // [`Sim::refresh_vis`] is keyed on `(tile, map_revision)`, so moving
            // the revision is what makes the next [`publish`] recompute the
            // visible set and move `vis_revision` in turn. What must *not*
            // happen here is [`Sim::descend`]'s `seen.fill(0)` -- a door opening
            // is not a new floor, and forgetting the level because somebody
            // opened a door would un-explore it.
            //
            // The furniture does need a line of its own, and it is the whole
            // reason that buffer exists: an opened door is `OPEN` in the grid
            // and indistinguishable from the floor it was cut into, so the tile
            // buffer above has just *lost* the fact that a doorway is there.
            // What moved is only a state byte -- the record's tile and kind are
            // fixed for the level's life -- but the page re-reads the buffer
            // wholesale on a revision, exactly as it does the tiles.
            if self.world.dungeon().fingerprint() != plan_before {
                self.map_revision = self.map_revision.wrapping_add(1);
                write_map(&self.world);
                self.furniture_revision = self.furniture_revision.wrapping_add(1);
                write_furniture(&self.world, &self.torches);
            }

            // After the tick, so the phases being compared are both settled
            // ones. See [`Sim::note_bodies`].
            self.note_bodies(&mut events, &mut dropped);

            // The way out, which the tick above may have just earned. Per tick
            // and not per animation frame, for the same reason everything else
            // in this block is: a catch-up burst is up to eight ticks, and the
            // portal has to open on the tick of the kill rather than at the end
            // of whichever burst contained it.
            //
            // Differenced across the call rather than announced from inside it,
            // on exactly the argument the floor plan's fingerprint above makes:
            // `open_the_way_out` is a *state* rule ("clear and no portal yet")
            // and not an edge, so the edge has to be taken here, where the two
            // sides of it are both in hand.
            let portal_before = self.portal_state();
            self.open_the_way_out();
            if self.portal_state() != portal_before {
                push_event(
                    &mut events,
                    &mut dropped,
                    FrameEvent {
                        kind: EVENT_PORTAL,
                        at: self.portal.unwrap_or(Vec2::ZERO),
                        amount: Fx::ZERO,
                        // A fact about the level and not about a body, so there
                        // is nobody to name. The page's visibility gate reads
                        // `255` as "nobody knows", which passes -- correctly: a
                        // way out opening is not something the fog should hide.
                        actor: SLOT_EMPTY,
                        other: SLOT_EMPTY,
                        aux0: Fx::ZERO,
                        aux1: Fx::ZERO,
                    },
                );
            }

            // And the arming, which is what stops the level ending on the tick
            // it was cleared. The portal opens where the last blow landed, so
            // the hero is standing in it on that tick and every tick until it
            // walks away; this is the moment it walked away. See
            // [`Sim::portal_armed`] for why that is worth a flag.
            //
            // **A fallen hero does not arm it.** It is not clear of the way out;
            // it is not anywhere. Arming on behalf of a body that no longer
            // exists would hand the next one an instant descent whenever the
            // last one fell inside the portal -- and the portal opens at a kill,
            // so that is exactly where a fight tends to be.
            if self.hero().is_some() && !self.hero_touches_way_out() {
                self.portal_armed = true;
            }

            // **And out of the loop entirely if the run just moved on.** Not
            // "carry on in the new world": the flash counters, the trace table
            // and the event feed collected above are all keyed to bodies that
            // no longer exist, so letting the rest of a catch-up burst run on a
            // fresh level would print the old level's damage numbers over the
            // new one. The next `step` picks it up.
            if self.hero_is_leaving() {
                events.clear();
                dropped = 0;
                // **Cleared here too, and the argument is the feed's own, only
                // stronger.** A contact row names two full identities, and
                // `descend` is about to build a level that hands those slots to
                // new bodies -- so a row that survived this return would be
                // published against a world where it names somebody else. The
                // rows are also about to be cleared again inside `descend`;
                // both clearings are kept because this one is what the *early
                // return* owes and that one is what a direct `descend()` export
                // call owes, and neither can be inferred from the other.
                combat_events.clear();
                combat_dropped = 0;
                self.due = due;
                self.events = events;
                self.events_dropped = dropped;
                self.combat_events = combat_events;
                self.combat_events_dropped = combat_dropped;
                // Which pushes the one row that outlives the clearing. See
                // [`Sim::descend`] for why it is pushed from in there.
                self.descend();
                return;
            }
        }
        self.due = due;
        self.events = events;
        self.events_dropped = dropped;
        self.combat_events = combat_events;
        self.combat_events_dropped = combat_dropped;
    }

    /// `frames` ticks of the arena's loop: observe, decide per side, submit,
    /// step, harvest.
    ///
    /// **A port of `lab`'s `measure_embodied_matchup` and not of
    /// `policy::run`**, because the second one takes a single
    /// `impl Policy` and installs it on both sides. That is exactly
    /// right for a control condition and useless for an arena, whose whole
    /// subject is watching two different fighters meet.
    ///
    /// Four things differ from the loop above and all four follow from what an
    /// arena *is* rather than from taste. **Until v2-ui-08 the first of them was
    /// the model**: this loop submitted `CommandCoreV1` and the loop above
    /// submitted `CommandV1`, over two policy registries and two
    /// vocabularies. `Scenario::duel_from` has built the surviving model since,
    /// so both loops speak one grammar and what is left below is about roster,
    /// stopping and publication.
    ///
    /// **The observation is still the articulated one**, which is not a
    /// leftover: `Policy::decide` takes an `Observation` too,
    /// and it did under the deleted seam as well. A body's *view* did not change
    /// when its command frame did.
    ///
    /// **The legacy event feed is cleared and never filled.** The articulated
    /// arm of `World::step` emits exactly one `Event` variant, `Event::Death`,
    /// and damage under this model is carried by contact resolution rows rather
    /// than by the event feed -- so `flashes`, `traces` and `note_bodies` have
    /// nothing to say here. Cleared rather than left alone because the feed is a
    /// per-call contract: a reader that saw the previous world's damage numbers
    /// against this one would be reading rows about bodies that no longer exist.
    ///
    /// **There is no route, no portal, no descent and no door.** An arena is a
    /// bare `24x16` room with two fighters in it. Every one of those rules is
    /// about a *game*, and a duel is not one.
    ///
    /// **The stopping conditions are the runner's**, so that the same
    /// configuration and seed produce the same fight here as in `lab`: a
    /// recorder may ask for the whole fight in one call and the tail past the
    /// decision costs nothing and changes nothing.
    fn advance_arena(&mut self, frames: u32) {
        // The same borrow dance the loop above does, and for the same reason:
        // the drain below holds `&mut self.world` for the length of its loop, so
        // the scratch has to be a local. Written back at the single exit.
        let mut due = std::mem::take(&mut self.due);
        // Cleared and not filled. See the doc comment: no articulated tick
        // produces a blow, a block, a parry or a shot.
        let mut events = std::mem::take(&mut self.events);
        events.clear();
        let mut combat_events = std::mem::take(&mut self.combat_events);
        combat_events.clear();
        let mut combat_dropped = 0u32;
        // Taken out for the length of the loop, exactly as the scratch is: the
        // decision below holds `&mut self.world` and `&mut arena.policies` at
        // once, and those are two fields of one struct.
        let mut arena = self.arena.take();
        for _ in 0..frames {
            let Some(live) = arena.as_mut() else { break };
            // The runner's gate, character for character. A settled fight stops
            // being stepped rather than being stepped through: `World::outcome`
            // is live under this model -- `reap_dead_bodies` clears `alive`
            // and pushes the death -- and the tick limit is the configuration's.
            if self.world.outcome().is_some() || self.world.tick() >= live.max_ticks {
                break;
            }
            // Read before the step, because a contact's time of impact is a
            // fraction of the tick that was integrated and `World::step`
            // increments the counter on its way out. The same reasoning, and the
            // same line, as the loop above.
            let solving_tick = self.world.tick();
            clear_arena_submissions();
            let driven = live.driven;
            due.clear();
            due.extend_from_slice(self.world.pending_decisions());
            for &id in &due {
                if driven.contains(&Some(id)) {
                    continue;
                }
                let obs = self.world.observe(id);
                // Routed on the alive set captured at install, because an
                // articulated observation has no faction column by design. See
                // [`Arena::heroes`].
                let side = if live.heroes.contains(&id) {
                    Faction::Heroes
                } else {
                    Faction::Monsters
                };
                let command = live.policies[side.index()].decide(&obs);
                // Only a stored outcome crosses the receipt publication below.
                // A refusal may keep the fight moving under its prior command,
                // but it is not evidence that this candidate became authority.
                let outcome = self.world.submit(id, command);
                record_arena_submission(solving_tick, id, outcome);
                if side == Faction::Heroes {
                    self.last_decision_tick = self.world.tick();
                }
            }
            // Human identities bypass the body's reaction gate exactly as the
            // dungeon hero does. The composed controller still asks its policy
            // half only on that body's cached cadence; only host input is read
            // every tick.
            for (side, id) in driven.iter().enumerate() {
                let Some(id) = *id else { continue };
                if !self.world.is_alive(id) { continue; }
                let obs = self.world.observe(id);
                let command = live.policies[side].decide(&obs);
                let outcome = self.world.submit(id, command);
                record_arena_submission(solving_tick, id, outcome);
            }
            // The slice is dropped immediately: nothing in it is published under
            // this model, and the harvest below needs the world back.
            let _ = self.world.step();
            // Inside the tick loop and immediately after the step, because
            // `World::contact_resolutions` retains the last solved tick only and
            // the top of the next tick wipes it. Identical to the loop above,
            // and identical on purpose -- this is the one thing the two loops
            // genuinely share, and a helper extracted out of the legacy path to
            // hold it would be a change to the function four goldens come out of.
            for row in self.world.contact_resolutions() {
                push_combat_event(
                    &mut combat_events,
                    &mut combat_dropped,
                    combat_event_row(solving_tick, row),
                );
            }
        }
        self.arena = arena;
        self.due = due;
        self.events = events;
        self.events_dropped = 0;
        self.combat_events = combat_events;
        self.combat_events_dropped = combat_dropped;
    }

    /// Writes each live body's place, size and weight into the trace table.
    ///
    /// **Called before `World::step`**, so that a row about a body the step is
    /// about to remove still has all three. `reap_dead` runs inside `step` and
    /// hands a lethal blow's slot straight back to the free list, so by the
    /// time the event slice comes back `World::view` answers `None` for exactly
    /// the body an [`EVENT_DEATH`] row is about.
    ///
    /// Also the only place the table is sized **and the only place a slot is
    /// invalidated**, which is why it is the pass that runs first:
    /// [`Sim::note_bodies`] walks the same list afterwards and can therefore
    /// index rather than grow, and can difference against a row it already
    /// knows belongs to the body it is holding.
    fn refresh_traces(&mut self) {
        for i in 0..self.units.len() {
            let id = self.units[i];
            let Some(view) = self.world.view(id) else {
                continue;
            };
            let slot = id.index as usize;
            if slot >= self.traces.len() {
                self.traces.resize(slot + 1, Trace::default());
            }
            let trace = &mut self.traces[slot];
            // **The generation first**, because a slot is recycled the instant
            // its occupant dies and the body standing in it now may not be the
            // one the phase, the phase length and the walk cycle were recorded
            // for. Differencing across that boundary is what pushes an
            // `EVENT_PHASE` about a transition between two creatures; see
            // [`Trace`] for that and for the declaration it can swallow.
            //
            // Reset through `Trace::default()` and not field by field, so a
            // field added to the differenced half cannot be forgotten here.
            // The four written below are overwritten unconditionally on the
            // very next lines, so there is no window in which they are stale.
            if trace.generation != id.generation {
                *trace = Trace {
                    generation: id.generation,
                    ..Trace::default()
                };
            }
            trace.at = view.position;
            trace.radius = view.radius;
            trace.mass = view.mass;
            trace.kind = view.kind;
        }
    }

    /// Everything the page has to be *told* about a body, because it happened
    /// between two frames.
    ///
    /// Three feeds off one pass over the roster, and they are one function
    /// because they are one argument. A Punch has a five-tick windup
    /// (`action.rs`), so at 60 Hz an attack can begin and end entirely between
    /// two `requestAnimationFrame` callbacks; a body walking at 0.048 units a
    /// tick puts a foot down every dozen; and a page differencing frame columns
    /// sees neither. The module sees every tick by construction, which is the
    /// whole reason any of this is derived on this side of the boundary rather
    /// than in the sim.
    ///
    /// **[`EVENT_DECLARE`]** is the mockup's *"current action"* bubble: the
    /// popup that tells you which action an enemy has just committed to.
    /// `Guard | Recover -> Windup | Strike` is the transition, and the second
    /// half of each side is load-bearing. `Recover` because a fighter that
    /// chains two cuts passes through recovery and not through guard, so
    /// watching only for `Guard ->` would announce the first blow of a flurry
    /// and none of the rest. `-> Strike` because a zero-windup action has no
    /// telegraph phase at all and would otherwise never be announced.
    ///
    /// **[`EVENT_PHASE`]** is the same comparison with the rule taken off:
    /// every change, in both directions, with the pair of discriminants rather
    /// than an action code. It does not retire `EVENT_DECLARE` and is not meant
    /// to -- see that constant.
    ///
    /// **[`EVENT_STEP`]** is the stride clock wrapping. The accumulator is
    /// driven by *speed* and not by time, which is what makes a body that is
    /// shoved, walled or simply stopped have its legs stop with it for free.
    /// See [`STRIDE_PER_RADIUS`].
    fn note_bodies(&mut self, events: &mut Vec<FrameEvent>, dropped: &mut u32) {
        for i in 0..self.units.len() {
            let id = self.units[i];
            // A dead handle simply has no phase to compare. Its slot keeps
            // whatever it last held until somebody else is handed the slot, at
            // which point `refresh_traces` clears it on the generation. This
            // used to say a stale `Strike` "could at worst suppress one
            // announcement, never invent one", and the second half of that was
            // wrong: `EVENT_PHASE` announces every transition in both
            // directions, so a stale phase invents one as readily as it eats
            // one. See [`Trace`].
            let Some(view) = self.world.view(id) else {
                continue;
            };
            let slot = id.index as usize;
            // Sized by `refresh_traces`, which walked this same list one step
            // ago. A `let else` rather than a second resize guard, so there is
            // exactly one place that can grow this table.
            let Some(trace) = self.traces.get_mut(slot) else {
                continue;
            };

            let was = trace.swing;
            let now = view.limb.swing;
            trace.swing = now;
            if was != now {
                // The counter as the transition left it, which is the phase's
                // real length: whatever set `swing_left` did so on this tick,
                // and the new phase does not spend any of it until the next
                // one. Better than the nominal length from `action.rs`, because
                // a punished recovery genuinely is longer than the nominal one.
                trace.span = view.limb.swing_left;
            }

            // The stride clock. Bounded to one wrap a tick: a knockback can put
            // more than a whole stride into one tick, and a body cannot take
            // two steps in sixteen milliseconds -- so the honest ceiling is one
            // footfall, and clamping is what keeps the wrap below a `while`
            // loop that a saturated speed could sit in.
            let step = (view.radius * STRIDE_PER_RADIUS).max(Fx::EPSILON);
            let speed = view.velocity.length();
            let stride = trace.stride + (speed / step).min(Fx::ONE);
            let landed = stride >= Fx::ONE;
            trace.stride = if landed { stride - Fx::ONE } else { stride };

            let began = matches!(was, Swing::Guard | Swing::Recover)
                && matches!(now, Swing::Windup | Swing::Strike);
            let mass = trace.mass;
            if began {
                push_event(
                    events,
                    dropped,
                    FrameEvent {
                        kind: EVENT_DECLARE,
                        at: view.position,
                        // The action code, not the phase: what the bubble names
                        // is the thing being swung, and the page already has a
                        // name and an icon per code from the registry.
                        amount: Fx::from_int(view.action.code() as i32),
                        actor: id.index,
                        other: SLOT_EMPTY,
                        aux0: Fx::ZERO,
                        aux1: Fx::ZERO,
                    },
                );
            }
            if was != now {
                push_event(
                    events,
                    dropped,
                    FrameEvent {
                        kind: EVENT_PHASE,
                        at: view.position,
                        amount: Fx::ZERO,
                        actor: id.index,
                        other: SLOT_EMPTY,
                        aux0: Fx::from_int(was.discriminant() as i32),
                        aux1: Fx::from_int(now.discriminant() as i32),
                    },
                );
            }
            if landed {
                push_event(
                    events,
                    dropped,
                    FrameEvent {
                        kind: EVENT_STEP,
                        at: view.position,
                        // How fast the foot was going, which is what decides
                        // how heavy the footfall sounds.
                        amount: speed,
                        actor: id.index,
                        other: SLOT_EMPTY,
                        aux0: mass,
                        aux1: Fx::ZERO,
                    },
                );
            }
        }
    }

    /// Submits the hero's command for this tick, blending the policy's opinion
    /// with whatever the player is holding.
    ///
    /// **The control surface is the one that was here before and no wider.**
    /// [`set_input`] takes a movement pair, a held turn, a pointer bearing, an
    /// extension, a slot and an attack button; every one of them is still read
    /// here and nothing has been added. **A mouse-driven arm -- a hand that goes
    /// where the pointer is in three dimensions, with a height and an elbow
    /// plane of its own -- is not this session's job**, and the fields this
    /// translation leaves alone are exactly where one would land: the combat
    /// height is `MID` at every bearing, the swing plane stays the policy's, and
    /// so does the arm the pointer is not steering.
    ///
    /// # What the grammar moved
    ///
    /// **The body yaw rides in the command, and a held turn had to become a
    /// *lead* rather than a step.** It used to be written straight onto the body
    /// by `World::face_legacy`, which refuses an embodied world;
    /// `CommandCoreV1::body_yaw` is a request, chased by the actuator at
    /// the body's own turn authority. The first translation asked for the body's
    /// own yaw plus 512 raw -- the exact number `face_legacy` used to write --
    /// and it was measured at 8,577 raw in 240 ticks, an eighth of the rate the
    /// same key bought before the grammar changed, because a target one tick
    /// ahead of the body is a target the integrator *converges on* instead of
    /// chasing. What a held key means is "keep turning", so the request is a
    /// standing offset ahead of wherever the body has got to; the actuator then
    /// spends its whole turn authority for as long as the key is down.
    ///
    /// **An eighth of a turn, and it is the release that picks the number.** The
    /// lead is also the overshoot: let go and the body is still travelling, and
    /// the request stops where the body is rather than where it was going, so
    /// what it costs is one deceleration. Wider buys nothing -- the authority is
    /// already saturated -- and narrower reintroduces the convergence the lead
    /// exists to avoid. Scaled by the held magnitude rather than by its sign, so
    /// an analogue stick still steers proportionally: half deflection is half
    /// the error and therefore a slower turn.
    ///
    /// **The movement pair needs no rotation at all.** An embodied command's
    /// walk vector is read in the body frame, `+x` forward and `+y`
    /// body-left, and `World::world_move_dir` performs exactly the mix the three
    /// lines that used to be here performed by hand. The two now agree by
    /// construction rather than by both having been written correctly.
    ///
    /// **The three attack values collapse to one.** `Strike::Widdershins` and
    /// `Strike::Sunwise` named which way a legacy blade swung through its arc; an
    /// embodied arm has no swing-side verb, because where the blade goes *is* the
    /// bearing it is handed. The distinction is recorded here as inert rather
    /// than dropped from [`set_input`], whose argument list is a wire contract.
    fn drive_hero(&mut self, hero: EntityId) {
        let obs = self.world.observe(hero);
        if self.world.tick() >= self.hero_next_decision {
            self.cached = self.policies[Faction::Heroes.index()].decide(&obs);
            // The decision clock off the body's own sheet, which is where the
            // legacy observation carried it. An `Observation` has no
            // such column and should not grow one -- it publishes what a fighter
            // perceives, and its own reaction time is not perception -- so the
            // host asks the world instead. A body that has just fallen answers
            // `None` and takes the one-tick floor, which only decides when the
            // next dead handle is asked and never what it is asked for.
            let period = self.world.stats(hero).map_or(1, |stats| stats.decision_period()).max(1);
            self.hero_next_decision = self.world.tick() + u32::from(period);
            self.last_decision_tick = self.world.tick();
        }

        let mut command = self.cached;
        // The yaw the arm bearings below are measured from. Without the feet it
        // is the yaw the body is holding; with them it is the yaw being asked
        // for, so that a turn and a cut issued on the same tick describe one
        // intention rather than two half a turn apart.
        let mut facing = obs.body_yaw;
        if self.control & CONTROL_FEET != 0 {
            // An eighth of a turn at full deflection. See the note above.
            const PLAYER_TURN_LEAD_RAW: i32 = 8_192;
            let lead = (self.input_turn * PLAYER_TURN_LEAD_RAW).round_int();
            facing = obs.body_yaw + Angle::from_raw(lead as u16);
            command.core.body_yaw = facing;
            command.core.move_dir = self.input_move;
        }
        if self.control & CONTROL_LIMB != 0 {
            // **Which arm the pointer steers, and this is where `CONTROL_SLOT`
            // had to change meaning rather than be dropped.** It used to name
            // the loadout slot a legacy fighter put *in hand*, and an embodied
            // body holds both at once -- there is no swap gate to open and
            // nothing for the old reading to do. What survives is the sentence
            // the input field's own doc has always carried: while it is held,
            // the pointer steers the shield hand instead of the sword.
            let arm = if self.control & CONTROL_SLOT != 0 {
                usize::from(self.input_slot).min(1)
            } else {
                0
            };
            let striking = !matches!(self.input_strike, Strike::None);
            command.core.arms[arm] = ArmTarget {
                // Torso-relative, which is the whole of the frame difference on
                // this column: the pointer is a world bearing, and zero here
                // means "straight ahead" at every yaw.
                bearing: self.input_aim - facing,
                // `MID` at every bearing. This historical dungeon controller
                // receives only the old two-dimensional pointer bearing; the
                // arena does not pass through `drive_hero` and stages its full
                // three-dimensional target through `HostSource` instead.
                height: CombatHeight::MID,
                // The pointer is the line and the button is the cut, exactly as
                // before. A strike drives the hand out to full extension because
                // that is what a cut is; a guard extends as far as the player is
                // bracing it.
                reach: if striking { Fx::ONE } else { self.input_reach },
                // **Both efforts are the script's own numbers**, taken rather
                // than invented: `ScriptedPolicy` guards at a half and
                // commits at one, and a player's arm answering to a different
                // pair would be a hand that behaves unlike every other hand in
                // the room.
                effort: if striking { Fx::ONE } else { Fx::HALF },
            };
        }
        // Nothing about this reaches past the agent boundary: it is an
        // observation in and a command out, same as any policy, and the sim
        // still cannot tell which of them wrote it. The outcome is discarded on
        // the loop above's argument -- a refusal stores the neutral command
        // atomically and the page reads refusals through `submit_embodied`.
        let _ = self.world.submit(hero, command);
    }

    /// Walks one monster into the running room. Answers how many monsters are
    /// now alive, which is zero only when nothing arrived.
    fn spawn_monster(&mut self, kind: Body, loadout: Loadout) -> u32 {
        self.walk_in(UnitSpec {
            kind,
            faction: Faction::Monsters,
            stats: kind.base_stats(),
            loadout,
            combat_spec: None,
            // Rolled inside `walk_in`, not here. See [`Sim::spawn_point`].
            spawn: Vec2::ZERO,
        })
    }

    /// The body of a spawn, from a fully described [`UnitSpec`].
    ///
    /// Shared by the `S` hotkey's `spawn_monster` and the enemy panel's
    /// [`spawn_from_template`], which differ only in where the spec came from --
    /// a body's own defaults in one case and the page's edited template in the
    /// other. Sharing it is what keeps the placement roll a single sequence: two
    /// copies of this would be two copies of the prune-then-refuse-then-roll
    /// order, and getting that order wrong is invisible until a recorded run
    /// stops replaying.
    fn walk_in(&mut self, mut spec: UnitSpec) -> u32 {
        // Dead handles first. `write_frame` merely *skips* an id that no longer
        // resolves, so without this the roster grows for the life of the page
        // and a long session of spawning and killing reaches the ceiling on
        // ghosts. Disjoint fields, so the borrow checker sees through it.
        let world = &self.world;
        self.units.retain(|&id| world.is_alive(id));
        if self.units.len() >= MAX_UNITS {
            // Refusing beats spawning something the frame has no room for,
            // which would be a monster the player cannot see hitting a hero
            // they can.
            return 0;
        }

        let mut rng = self.placement_rng();
        spec.spawn = self.spawn_point(spec.kind, &mut rng);
        // Whatever the caller asked for, a newcomer through this door is on the
        // other side. The enemy panel is an *enemy* panel.
        spec.faction = Faction::Monsters;
        // And dressed for the world it is walking into. See
        // [`equip_articulated`]: a spec with no articulated row is refused
        // outright on a world that has the columns, so without this line every
        // press of the spawn button answered `0` from the moment `init` stopped
        // opening a Legacy room.
        //
        // Matched on the model rather than asked of it, because the predicate
        // that would answer is `pub(crate)` to the sim. The match is exhaustive,
        // so the session that deletes a variant is told about this line by the
        // compiler.
        equip_articulated(&mut spec);
        // **`try_spawn`, never `spawn`.** `World::spawn` turns a refused
        // construction into a panic, and a panic behind a `pub extern "C"` is a
        // trap that poisons the instance for the life of the page -- the next
        // export re-enters a `RefCell` that is still borrowed and traps again,
        // so the page dies on the frame after the one that went wrong rather
        // than on the call that did.
        //
        // Which is not hypothetical, and the shape of it has changed rather
        // than gone away. Every spec built on this side used to carry
        // `combat_spec: None`, so on a world with articulated columns *the whole
        // path* was refused (`CombatSpecError::UnitPresence`) rather than only
        // its sixty-fifth row. The line above is what fixed that; what is left
        // for `try_spawn` to refuse is a 65th row
        // (`ContactCapacityError::EntityLimit`) and a spawn point whose contact
        // envelope will not fit inside the arena. Both come back through the
        // same `Err`, which is why this is a `try_spawn` and not a model test:
        // the reason a world would not take a body is the world's to give, and
        // the host's only job is to answer `0` and leave everything exactly as
        // it was.
        let Ok(id) = self.world.try_spawn(&spec) else { return 0 };
        // The step that is easy to miss: a spawned entity thinks, moves and
        // fights whether or not it is in this vector. It is simply invisible
        // until it is.
        self.units.push(id);
        self.remember_anatomy(id);
        self.world.alive_count(Faction::Monsters) as u32
    }

    /// Copies one body's anatomy row into [`Sim::anatomy`], where the region
    /// writer will find it.
    ///
    /// **Every path that spawns has to call this, and the reason it is a named
    /// method rather than three inline lines is that forgetting it is silent.**
    /// `scenario_anatomy` fills the table from the *scenario's* units, so a body
    /// that walks in afterwards has no row -- and `write_region_buffer` answers
    /// that by dropping the body's capsules and incrementing a counter nobody
    /// watches. Its pose and stance rows publish normally, so the body is drawn,
    /// moves, fights, and simply cannot be hit by anything reading the region
    /// section. Measured before the fix: three spawns took the pose count from 7
    /// to 10 while `region_len` stayed at 49 and `regions_dropped` went 0, 7,
    /// 14, 21.
    fn remember_anatomy(&mut self, id: EntityId) {
        let slot = id.index as usize;
        if slot < MAX_POSES {
            self.anatomy[slot] = self.world.body_anatomy(id).cloned();
        }
    }

    /// Walks a replacement character into the room. Answers `1` if one arrived
    /// and `0` if the room would not take it.
    ///
    /// Refused while a character is still standing, and that is the contract
    /// rather than a missing feature. An [`Order`] belongs to a *faction*, not
    /// to a body -- the one input channel this page has would be shared by two
    /// characters, and a click would send both of them. Per-unit orders are the
    /// next thing this project owes itself; until then, one at a time.
    ///
    /// **The stat sheet comes out of [`Sim::hero_spec`], not out of
    /// `Body::base_stats`.** A player who has spent the Hero rail deciding what
    /// kind of fighter they want is not asking for that to be forgotten by the
    /// thing that killed it; see the field for the whole of that argument. A
    /// *body* change still resets the sheet, because this writes the plan
    /// through `UnitSpec::set_body` and a Rogue wearing a Fighter's numbers is a
    /// different claim than "keep my attributes".
    fn swap_in_hero(&mut self, kind: Body, loadout: Loadout) -> u32 {
        let world = &self.world;
        self.units.retain(|&id| world.is_alive(id));
        if self.world.alive_count(Faction::Heroes) > 0 || self.units.len() >= MAX_UNITS {
            return 0;
        }

        // The caller's body and kit are the *request*, and they become the plan
        // -- so `1` and `2` walking a Rogue in do not leave the rail describing
        // the Fighter that fell. Only the stat sheet is inherited, and only when
        // the body it was written for is the body arriving.
        //
        // Prepared on a copy and committed below, once there is a body wearing
        // it. `1` answered `0` because the room would not take the request is
        // not the player having asked for a Rogue; the rail should still read
        // the fighter that is coming back.
        let mut plan = self.hero_spec;
        if plan.kind != kind {
            plan.set_body(kind);
        }
        plan.loadout = loadout;

        let mut rng = self.placement_rng();
        let spawn = self.entry_point(kind, &mut rng);
        let mut arriving = UnitSpec {
            kind,
            faction: Faction::Heroes,
            stats: plan.stats,
            loadout,
            combat_spec: None,
            spawn,
        };
        // Dressed for the floor, exactly as [`Sim::walk_in`] dresses a monster
        // and for the same reason -- and it is why a character asked for with a
        // bow arrives holding a sword. See [`equip_articulated`] for why the
        // mapping is total.
        equip_articulated(&mut arriving);
        // `try_spawn` rather than `World::spawn`, for the whole of the argument
        // [`Sim::walk_in`] makes: a refused construction there is a panic, and a
        // panic behind this boundary is a trap that poisons the page.
        let Ok(id) = self.world.try_spawn(&arriving) else {
            return 0;
        };
        // **The plan takes the kit that walked in, not the kit that was asked
        // for**, so the rail reads back the fighter standing in the room. The
        // other half of that agreement used to be `set_hero_loadout`, which is
        // gone: `World::set_loadout` refuses an embodied world, so the kit is
        // decided at the door and nowhere else.
        plan.loadout = arriving.loadout;
        plan.combat_spec = arriving.combat_spec;
        self.hero_spec = plan;
        self.units.push(id);
        self.remember_anatomy(id);

        // **The standing order is not reset here any more, because there is
        // nothing left that could have set it.** It used to be: the order is the
        // faction's, so a newcomer inherited wherever the last one was walking
        // when it was killed -- nine times in ten, into the thing that killed it.
        // Every export that could write one is gone with the observation column
        // that would have let a body perceive it, so `Order::Hold` is the only
        // value this faction ever holds and writing it again would rebuild a flow
        // field nobody reads.
        //
        // This character has not thought yet, and the page flashes a ring every
        // time the number below changes. Left as it was, the newcomer would
        // arrive taking credit for the dead one's last decision.
        self.last_decision_tick = 0;
        // And it has not stood clear of the way out either, whatever the last
        // one had done. It arrives where the last one fell, which on a cleared
        // level is within a body length of where the way out opened -- so
        // inheriting the flag would descend the run on the tick the replacement
        // button was pressed. Same rule as [`Sim::open_the_way_out`]'s: whoever
        // finds themselves standing in it has to step out first.
        self.portal_armed = false;
        1
    }

    /// The stream a newcomer's position is rolled from.
    ///
    /// Keyed on both the tick and a counter. The tick alone would put two
    /// presses inside one animation frame on the same pixel; the counter alone
    /// would make *when* you pressed irrelevant. The counter is bumped before
    /// the roll and on every answered press, so a refused press does not leave
    /// the next one standing where the refused one would have. `wrapping_add`
    /// because `overflow-checks` is on in release as well as debug, and a panic
    /// on wasm32 poisons the instance for good.
    fn placement_rng(&mut self) -> Rng {
        let roll = self.spawns;
        self.spawns = self.spawns.wrapping_add(1);
        Rng::from_stream(
            self.world.seed(),
            u64::from(self.world.tick()),
            u64::from(roll) | SPAWN_STREAM,
        )
    }

    /// Somewhere on a ring around the hero, on ground a body can stand on.
    ///
    /// One bearing and one reach are rolled, and the bearing is then swept in
    /// sixteenths of a turn until a candidate is far enough from the hero *and*
    /// out of the masonry. Sweeping rather than re-rolling is what makes this
    /// terminate honestly, and rejection-sampling the whole level would do most
    /// of its work in exactly the situation that matters least -- with the hero
    /// in a corridor, most of the floor is the wrong distance away.
    ///
    /// The walkability test is not the clamp with extra steps. Clamping into
    /// the arena box was the whole of "somewhere legal" while the level *was* a
    /// box; on a floor plan the middle of the level is usually solid rock, and
    /// a spawn that only clamped would walk monsters into walls.
    fn spawn_point(&self, kind: Body, rng: &mut Rng) -> Vec2 {
        let arena = self.world.arena();
        let radius = kind.radius();
        let lo = Vec2::new(radius, radius);
        let hi = Vec2::new(arena.x - radius, arena.y - radius);
        let hero = self.hero_position();

        let start = rng.angle();
        let reach = rng.range(SPAWN_NEAR, SPAWN_FAR);
        for step in 0..SPAWN_ARCS {
            let bearing = start + Angle::from_raw(step.wrapping_mul(SPAWN_ARC_STEP));
            let point = (hero + Vec2::from_angle(bearing) * reach).clamp_box(lo, hi);
            if point.distance(hero) >= SPAWN_NEAR && self.world.is_walkable(point, radius) {
                return point;
            }
        }

        // Every bearing landed in rock, which on a carved level takes only a
        // hero standing in a corridor -- so it is the ordinary case rather than
        // the exotic one, and the fallback has to be *good* rather than merely
        // total.
        //
        // The same sixteen bearings again, each pulled to the nearest floor.
        // Ranked by two keys: a candidate the hero is already on top of loses
        // to any candidate it is not, and among the rest the one nearest the
        // reach that was rolled wins. Ties keep the earlier bearing, so the
        // answer stays a function of the roll.
        //
        // What this replaces is "the far corner of the arena", which was a fine
        // answer while the level was a box and is a terrible one now: it put a
        // monster forty units and two rooms away, which reads as the spawn
        // button doing nothing at all.
        let mut best: Option<(bool, Fx, Vec2)> = None;
        for step in 0..SPAWN_ARCS {
            let bearing = start + Angle::from_raw(step.wrapping_mul(SPAWN_ARC_STEP));
            let ideal = (hero + Vec2::from_angle(bearing) * reach).clamp_box(lo, hi);
            let point = self.world.nearest_walkable(ideal, radius);
            let range = point.distance(hero);
            let crowded = range < SPAWN_NEAR;
            let off = (range - reach).abs();
            match best {
                Some((seen_crowded, seen_off, _))
                    if (seen_crowded, seen_off) <= (crowded, off) => {}
                _ => best = Some((crowded, off, point)),
            }
        }

        // Two monsters can still be placed on the same spot, here or above.
        // `World::separate` unsticks exactly-coincident bodies from their index
        // pair without an RNG -- that degenerate case is what it was written
        // for -- so this needs no code of its own.
        best.map_or(hero, |(_, _, point)| point)
    }

    /// Where a replacement character comes in: **the spot the last one fell.**
    ///
    /// You walk back into the fight you just lost. That is the whole of the
    /// rule and the whole of what was asked for -- not the clearest standing
    /// room near the fall, not a safe corner of the same room, the fall itself,
    /// pulled only as far as the masonry forces.
    ///
    /// **What that costs, stated rather than deleted.** This function used to
    /// sweep sixteen bearings around the middle of the level and keep the
    /// candidate furthest from the nearest living monster, and the argument for
    /// it was: *"furthest, not merely far enough -- a replacement arriving
    /// inside somebody's reach is dead before it has taken a decision, and a
    /// swap button that hands you a corpse is worse than no swap button."* That
    /// has not been refuted. A replacement now arrives inside the reach of
    /// whatever killed the last one, and can be hit before it has taken its
    /// first decision. **The user's call**, and the intended feel: a death costs
    /// you the character and not the ground, and the mob that took the last one
    /// is still standing there waiting.
    ///
    /// The old sweep survives below as the fallback, for the swaps that have no
    /// fall to go back to -- the first of a run, and the first after a descent.
    /// With nothing hostile in the room every candidate is equally clear, the
    /// strict comparison never fires, and the answer is the middle of the floor
    /// -- or, on a carved level, the nearest standing room to it.
    fn entry_point(&self, kind: Body, rng: &mut Rng) -> Vec2 {
        let radius = kind.radius();
        if let Some(fall) = self.last_hero_fall {
            // Where the *blow* landed rather than where the body's centre was,
            // which is what `Event::Damage` carries and is within a body radius
            // of the corpse -- "the same place" at the resolution anybody
            // watching can tell apart. `nearest_walkable` because a blow can
            // land against a wall from the reach of something standing clear of
            // it, and that point is not somewhere a body fits.
            return self.world.nearest_walkable(fall, radius);
        }

        let arena = self.world.arena();
        let lo = Vec2::new(radius, radius);
        let hi = Vec2::new(arena.x - radius, arena.y - radius);
        // **Not the middle of the arena.** On a floor plan the geometric centre
        // is usually solid rock, and seeding a sweep from a point nobody can
        // stand on gives every candidate the same answer.
        let centre = self
            .world
            .nearest_walkable((arena * Fx::HALF).clamp_box(lo, hi), radius);

        let start = rng.angle();
        let reach = rng.range(SPAWN_NEAR, SPAWN_FAR);
        let mut best = centre;
        let mut clearest = self.clearance(centre);
        for step in 0..SPAWN_ARCS {
            let bearing = start + Angle::from_raw(step.wrapping_mul(SPAWN_ARC_STEP));
            let point = (centre + Vec2::from_angle(bearing) * reach).clamp_box(lo, hi);
            // Walkable before it is scored. A candidate in the masonry can be
            // gloriously far from every monster and is not somewhere anybody
            // can arrive.
            if !self.world.is_walkable(point, radius) {
                continue;
            }
            let clearance = self.clearance(point);
            // Strictly greater, so the first bearing of the sweep wins a tie and
            // the answer stays a function of the roll rather than of how many
            // candidates happened to clamp onto the same wall.
            if clearance > clearest {
                best = point;
                clearest = clearance;
            }
        }
        best
    }

    /// How far `point` is from the nearest living monster, or [`Fx::MAX`] when
    /// there is none. A sentinel only -- nothing is ever computed from it.
    ///
    /// Read by [`Sim::entry_point`]'s fallback sweep and by nothing else. Left
    /// as a function rather than inlined into it: it is the whole of what
    /// "clear" meant there, and a reader who wants to know why the fallback
    /// lands where it does should find that spelled out and named.
    fn clearance(&self, point: Vec2) -> Fx {
        let mut nearest = Fx::MAX;
        for &id in &self.units {
            if let Some(view) = self.world.view(id) {
                if view.faction == Faction::Monsters {
                    nearest = nearest.min(point.distance(view.position));
                }
            }
        }
        nearest
    }

    /// Where to place a newcomer relative to. Falls back to the middle of the
    /// arena, because the button keeps working after the hero has fallen and
    /// there is then nothing left to place anything relative to.
    fn hero_position(&self) -> Vec2 {
        for &id in &self.units {
            if let Some(view) = self.world.view(id) {
                if view.faction == Faction::Heroes {
                    return view.position;
                }
            }
        }
        self.world.arena() * Fx::HALF
    }

    /// Refreshes what the player can see of the floor plan, if the hero has
    /// crossed a tile since the last time.
    ///
    /// Called from [`publish`] rather than from [`Sim::advance`], because it
    /// depends on where the hero *is* and not on how many ticks were run: an
    /// export that moves the hero without stepping (there are none today, and
    /// [`swap_in_hero`] is one tomorrow) must still leave the fog describing the
    /// world the frame does.
    ///
    /// Costs nothing on the common frame: the hero is usually in the tile it was
    /// in last frame, and the whole function is one comparison.
    ///
    /// **Read-only against [`World`].** Nothing computed here is fed back in and
    /// nothing here is hashed, which is the same standing this crate's `flashes`
    /// have and the reason a level's fog cannot move a golden hash.
    fn refresh_vis(&mut self) {
        let Some(hero) = self.hero() else { return };
        let Some(view) = self.world.view(hero) else {
            return;
        };
        let (tx, ty) = sim::Dungeon::tile_of(view.position);
        let key = (tx, ty, self.map_revision);
        if self.vis_at == Some(key) {
            return;
        }
        self.vis_at = Some(key);

        VIS.with(|vis| {
            let mut vis = vis.borrow_mut();
            self.world
                .dungeon()
                .visible_tiles(view.position, view.stats.sight_range(), &mut vis[..]);
            // Fold this frame's disc into the floor's memory, then publish the
            // two together as one byte a tile: `2` beats `1` beats `0`.
            //
            // `seen` is indexed through `get_mut` rather than with `[cell]`. It
            // is sized to the same ceiling this buffer is and cannot be short --
            // but the cost of being wrong about that is a panic inside `publish`,
            // and a trapped instance is poisoned for the life of the page.
            for (cell, slot) in vis.iter_mut().enumerate() {
                let Some(seen) = self.seen.get_mut(cell) else {
                    break;
                };
                if *slot == 1 {
                    *seen = 1;
                    *slot = 2;
                } else if *seen == 1 {
                    *slot = 1;
                }
            }
        });
        self.vis_revision = self.vis_revision.wrapping_add(1);
    }

    /// Fills `frame` and returns how much of it is live.
    fn write_frame(&self, frame: &mut [f32; FRAME_MAX]) -> usize {
        // The player's order is a hero order; there is nobody else to command.
        let order = self.world.order(Faction::Heroes);
        // A focus names a body and not a place, so `Order::point` answers
        // `Vec2::ZERO` for it -- correctly, and it must stay that way: the
        // payload is an [`EntityId`] and there is no point in it to hand back.
        // Left alone the page would draw its destination marker at the origin.
        // What it wants to draw is where that body is *now*, and the world is
        // the only thing that can answer. The same two header slots carry it,
        // so this is a better value and not a layout change -- which is what
        // let it land without moving [`FRAME_LAYOUT_VERSION`] or the hardcoded
        // `HEADER_LEN` in `tools/wasm_check.js` -- and, while it shipped, on the
        // retired Canvas page.
        //
        // **The `Focus` arm is now unreachable and is kept because the match
        // is total over [`Order`].** Nothing left in this module writes an
        // order at all -- see the standing order section -- so this reads
        // `Order::Hold` on every frame of every world, and the two point slots
        // it feeds are the origin. The arm goes when the variant does.
        let point = match order {
            Order::Focus(id) => self.world.view(id).map_or(Vec2::ZERO, |v| v.position),
            _ => order.point(),
        };
        let arena = self.world.arena();
        frame[0] = arena.x.to_f32();
        frame[1] = arena.y.to_f32();
        frame[2] = order.discriminant() as f32;
        frame[3] = point.x.to_f32();
        frame[4] = point.y.to_f32();
        frame[5] = self.last_decision_tick as f32;
        // The run. `9..=13`, appended after the three section counts so every
        // row offset downstream is unchanged; see the module docs on why the
        // columns are append-only.
        frame[9] = self.world.alive_count(Faction::Monsters) as f32;
        let portal = self.portal.unwrap_or(Vec2::ZERO);
        frame[10] = portal.x.to_f32();
        frame[11] = portal.y.to_f32();
        frame[12] = self.portal_state() as f32;
        frame[13] = self.depth as f32;
        // **Unconditionally, on every call.** `FRAME` is a persistent
        // `thread_local!` and a slot left unwritten holds the previous frame's
        // value, so a header float that is only written when it is interesting
        // is a header float that lies for the rest of the session.
        frame[14] = self.events_dropped as f32;

        // Hoisted out of the row loop: the hero's position and sight are the
        // same for every row, and `Dungeon::sees` is a DDA.
        let eye = self.hero().and_then(|h| self.world.view(h));

        let mut count = 0;
        for &id in &self.units {
            if count == MAX_UNITS {
                break;
            }
            // A dead unit simply stops being drawn. `view` returning `None` for
            // a stale handle is what makes that a skip rather than a panic.
            let view = match self.world.view(id) {
                Some(view) => view,
                None => continue,
            };
            // Whether the *player* can see this body. The hero's own row is
            // unconditionally `1`: `sees(p, p)` is true anyway, but stating it
            // means a reader does not have to check.
            let visible = match &eye {
                None => true,
                Some(eye) => {
                    view.id == eye.id
                        || (view.position.distance(eye.position) <= eye.stats.sight_range()
                            && self.world.dungeon().sees(eye.position, view.position))
                }
            };
            let trace = self.trace_of(id);
            // **Which way the body is pointing, and it is not `UnitView::facing`
            // on a body with joints.** `facing` is written by the legacy
            // movement phase and by `face_legacy`, and neither runs under a
            // model with articulated columns -- so it holds whatever the spawn
            // set it to for the life of the body. The renderer turns the whole
            // figure by this column (`client/src/render/figure.ts`), so left
            // alone every fighter on the floor is drawn facing east forever
            // while the fight goes on underneath it.
            //
            // Read off the pose rather than added to `UnitView`, because the
            // pose is where a jointed body's yaw *is*: `Pose::body_yaw`
            // is the same word `POSE_BODY_YAW_RAW` publishes, so the frame and
            // the pose section cannot disagree about which way somebody is
            // facing. It costs a second `pose` per body per publish,
            // which `write_pose_buffer` already pays once; the alternative is a
            // cheap yaw accessor on `World`, and that is a `crates/sim` change.
            let yaw = self
                .world
                .pose(id)
                .map_or(view.facing, |pose| pose.body_yaw);
            write_unit(
                &mut frame[HEADER_LEN + count * UNIT_STRIDE..],
                &view,
                yaw,
                self.flash_of(id),
                visible,
                trace.stride,
                trace.span,
            );
            count += 1;
        }
        frame[6] = count as f32;

        // Arrows, in a block of their own after the units. After rather than
        // interleaved because the unit block is variable length and every unit
        // row's internal offsets have to stay where the page expects them --
        // only the base of this section moves.
        // **Always empty, and the length word is written anyway.** The legacy
        // shot columns went with their model in embodied session 10 and an
        // articulated arrow publishes on `ARTICULATED_PROJECTILE` instead. The
        // section stays because removing it moves `FRAME_LAYOUT_VERSION` across
        // five files; what it costs is one word a frame, and what it buys is that
        // the block after it does not move.
        let shots = 0usize;
        frame[7] = shots as f32;

        // Events, in a third block after the arrows, and after them for exactly
        // the argument the arrows make against being interleaved: only the base
        // of a trailing section moves as the counts change. Last of the three
        // because it is the newest and the one most likely to grow again.
        let base = HEADER_LEN + count * UNIT_STRIDE + shots * SHOT_STRIDE;
        let events = self.events.len().min(MAX_EVENTS);
        for (i, event) in self.events[..events].iter().enumerate() {
            let row = &mut frame[base + i * EVENT_STRIDE..];
            row[EVENT_KIND] = event.kind as f32;
            row[EVENT_X] = event.at.x.to_f32();
            row[EVENT_Y] = event.at.y.to_f32();
            row[EVENT_AMOUNT] = event.amount.to_f32();
            row[EVENT_ACTOR_INDEX] = event.actor as f32;
            row[EVENT_OTHER_INDEX] = event.other as f32;
            row[EVENT_AUX0] = event.aux0.to_f32();
            row[EVENT_AUX1] = event.aux1.to_f32();
        }
        frame[8] = events as f32;

        base + events * EVENT_STRIDE
    }
}

/// Copies a world's floor plan into the tile buffer.
///
/// Called only where the floor plan can have changed -- [`init`],
/// [`Sim::descend`], and the tick a door opens -- and deliberately **not** from
/// [`publish`], which runs on every export. Rewriting 3060 bytes on every slider
/// drag would be harmless and would make [`map_revision`] meaningless, and the
/// revision is the whole mechanism by which the page knows when to re-bake a
/// level.
///
/// A shut `DOOR` lands here as `1`, because this writes
/// `u8::from(dungeon.solid(..))` and a shut door is solid. That is right for
/// what the page does with this buffer today -- rock is rock -- and it is what
/// makes the doorway list a separate export rather than a third tile value here.
fn write_map(world: &World) {
    let dungeon = world.dungeon();
    let cols = dungeon.cols() as u32;
    let rows = dungeon.rows() as u32;
    let len = (cols as usize * rows as usize).min(MAP_MAX);
    MAP.with(|map| {
        let mut map = map.borrow_mut();
        for cell in 0..len {
            let tx = (cell % cols as usize) as i32;
            let ty = (cell / cols as usize) as i32;
            map[cell] = u8::from(dungeon.solid(tx, ty));
        }
    });
    // Reported together, so the page can never read a length that belongs to
    // one level and a width that belongs to another.
    MAP_SHAPE.with(|shape| shape.set((cols, rows, len as u32)));
}

/// Copies a world's furniture into the furniture buffer, one record a tile.
///
/// Called from the same three places [`write_map`] is and on the same terms --
/// [`init`], [`Sim::descend`], and the tick a door opens -- and never from
/// [`publish`]. See [`FURNITURE_STRIDE`] for the record format.
///
/// **The doorways are read off the world and the torches are not, and the split
/// is the honest one.** [`World::doorways`] is the list the sim already keeps,
/// in the order [`sim::Dungeon::doorways`] found them; a torch is something the
/// sim has never been told about, so it arrives from the level that carved it by
/// way of [`Sim::torches`]. Both orderings are fixed for the level's life, so a
/// record's index here is stable across every call -- which is what lets the
/// page treat this as "the same furniture, one byte changed" rather than as a
/// fresh list to diff.
///
/// **Doors first, then torches, and never interleaved.** A door's state byte
/// changes mid-level and a torch's never does, so writing the mutable kind first
/// keeps every record that can move at a fixed index whatever happens to the
/// list behind it.
///
/// Stops at [`FURNITURE_MAX`] rather than growing past it: scenery that goes
/// missing off the end of a fixed array is a level that draws slightly wrong,
/// and there is better than three times the headroom before it can happen.
fn write_furniture(world: &World, torches: &[Torch]) {
    let cols = u32::from(world.dungeon().cols());
    let mut count = 0usize;
    FURNITURE.with(|buf| {
        let mut buf = buf.borrow_mut();
        for (door, open) in world.doorways() {
            for &cell in door.cells() {
                if count == FURNITURE_MAX {
                    return;
                }
                let at = count * FURNITURE_STRIDE;
                buf[at + FURNITURE_KIND] = FURNITURE_DOOR;
                // `cell` is a row-major tile index, so this is the inverse of
                // the `ty * cols + tx` the grid is addressed by everywhere else.
                // Both bytes fit by the const assertion beside `FURNITURE_MAX`.
                buf[at + FURNITURE_TX] = (cell % cols) as u8;
                buf[at + FURNITURE_TY] = (cell / cols) as u8;
                buf[at + FURNITURE_STATE] = u8::from(open);
                count += 1;
            }
        }
        for torch in torches {
            // The legacy byte ABI has only the two camera-facing codes it
            // shipped with. Full-cardinal mounts cross on DUNGEON_OBJECT_V1;
            // omitting the two unrepresentable rows preserves the old meaning
            // instead of lying that a -x lamp is mounted on +x.
            if matches!(torch.face, Cardinal::NegX | Cardinal::NegY) {
                continue;
            }
            if count == FURNITURE_MAX {
                return;
            }
            let at = count * FURNITURE_STRIDE;
            buf[at + FURNITURE_KIND] = FURNITURE_TORCH;
            // Already tile coordinates rather than a cell index, so no divide --
            // and they fit in a byte by the same const assertion, which is a
            // claim about `DUNGEON_COLS` and covers both kinds at once.
            buf[at + FURNITURE_TX] = torch.tx as u8;
            buf[at + FURNITURE_TY] = torch.ty as u8;
            buf[at + FURNITURE_STATE] = torch_face(torch.face);
            count += 1;
        }
    });
    FURNITURE_LEN.with(|len| len.set(count as u32));
}

fn dungeon_object_row(view: sim::DungeonObjectView, identity: u32) -> [u32; DUNGEON_OBJECT_STRIDE] {
    [view.kind as u32, identity, view.state_flags,
        view.position.x.raw() as u32, view.position.y.raw() as u32,
        u32::from(view.yaw.raw()), view.half_extents.x.raw() as u32,
        view.half_extents.y.raw() as u32, view.hp.raw() as u32,
        view.max_hp.raw() as u32, view.progress.raw() as u32, view.material_code]
}

const fn torch_yaw(face: Cardinal) -> Angle {
    Angle::from_raw(match face {
        Cardinal::PosX => 0, Cardinal::PosY => 16_384,
        Cardinal::NegX => 32_768, Cardinal::NegY => 49_152,
    })
}

/// Writes doors, then torches, then authoritative props in stable identity order.
fn write_dungeon_objects(world: &World, torches: &[Torch]) {
    let total = world.door_objects().len() + torches.len() + world.dungeon_objects().len();
    let mut count = 0usize;
    DUNGEON_OBJECTS.with(|rows| {
        let mut rows = rows.borrow_mut();
        let mut push = |row: [u32; DUNGEON_OBJECT_STRIDE]| {
            if count < MAX_DUNGEON_OBJECTS {
                let at = count * DUNGEON_OBJECT_STRIDE;
                rows[at..at + DUNGEON_OBJECT_STRIDE].copy_from_slice(&row);
                count += 1;
            }
        };
        for view in world.door_objects() {
            push(dungeon_object_row(view, DUNGEON_OBJECT_DOOR_ID_BASE | view.identity));
        }
        for (index, torch) in torches.iter().enumerate() {
            let view = sim::DungeonObjectView {
                kind: sim::DungeonObjectKind::Torch, identity: index as u32, state_flags: 0,
                position: Vec2::new(Fx::from_int(i32::from(torch.tx)) + Fx::HALF,
                    Fx::from_int(i32::from(torch.ty)) + Fx::HALF),
                yaw: torch_yaw(torch.face),
                half_extents: Vec2::new(Fx::from_ratio(1, 8), Fx::from_ratio(1, 8)),
                hp: Fx::ZERO, max_hp: Fx::ZERO, progress: Fx::ZERO, material_code: 6,
            };
            push(dungeon_object_row(view, DUNGEON_OBJECT_TORCH_ID_BASE | index as u32));
        }
        for view in world.dungeon_objects() {
            push(dungeon_object_row(view, DUNGEON_OBJECT_PROP_ID_BASE | view.identity));
        }
    });
    DUNGEON_OBJECT_LEN.with(|len| len.set(count as u32));
    DUNGEON_OBJECTS_DROPPED.with(|dropped| dropped.set(total.saturating_sub(count) as u32));
}

/// Appends a row unless the frame is already carrying [`MAX_EVENTS`] of them,
/// counting what it turned away.
///
/// **Overflow drops the tail, on purpose.** The alternative -- a ring that
/// keeps the newest -- would drop the *first* blows of a busy tick, and those
/// are the ones the eye follows. Losing the hundred and twenty-ninth floating
/// number in one animation frame is not something a player can notice; losing
/// the one that started the exchange is.
///
/// `dropped` is a counter and not a flag because "the cap was hit" and "the cap
/// was hit forty times" are different facts about how badly it is sized, and
/// the second one is the one worth reading off `frame[14]`. Passed in rather
/// than incremented on `Sim`, because the busiest caller holds `&mut self.world`
/// across its whole loop.
fn push_event(events: &mut Vec<FrameEvent>, dropped: &mut u32, event: FrameEvent) {
    if events.len() < MAX_EVENTS {
        events.push(event);
    } else {
        *dropped = dropped.saturating_add(1);
    }
}

fn write_unit(
    row: &mut [f32],
    view: &UnitView,
    yaw: Angle,
    flash: Flash,
    visible: bool,
    stride: Fx,
    swing_span: u16,
) {
    row[UNIT_X] = view.position.x.to_f32();
    row[UNIT_Y] = view.position.y.to_f32();
    // The binary angle, not radians: the client multiplies by 2pi/65536 and
    // does its own trigonometry, so no transcendental function ever runs on
    // this side of the boundary.
    row[UNIT_FACING_RAW] = f32::from(yaw.raw());
    row[UNIT_RADIUS] = view.radius.to_f32();
    row[UNIT_HP] = view.hp.to_f32();
    row[UNIT_MAX_HP] = view.max_hp.to_f32();
    row[UNIT_FACTION] = view.faction.index() as f32;
    row[UNIT_KIND] = kind_code(view.kind) as f32;
    row[UNIT_INTENT] = intent_code(view.intent) as f32;
    // The identity, so the client can tell "this body lost health" from "the
    // row above it died and everything shifted up". See the crate docs.
    row[UNIT_ENTITY_INDEX] = view.id.index as f32;
    row[UNIT_ENTITY_GENERATION] = view.id.generation as f32;

    // The limb. Bearings ship as raw binary angles like `facing`, so the one
    // float conversion in the stack stays on the way out.
    let limb = view.limb;
    row[UNIT_LIMB_ANGLE_RAW] = f32::from(limb.angle.raw());
    row[UNIT_LIMB_REACH] = limb.reach.to_f32();
    row[UNIT_LIMB_SPIN] = limb.spin.to_f32();
    row[UNIT_ACTION_LENGTH] = view.spec.length.to_f32();
    row[UNIT_ACTION_ARC_RAW] = f32::from(view.spec.arc);

    row[UNIT_HIT_FLASH] = flash_level(flash.hit);
    row[UNIT_BLOCK_FLASH] = flash_level(flash.block);
    row[UNIT_PARRY_FLASH] = flash_level(flash.parry);

    // The attack, so the page can draw a telegraph rather than a blow that
    // arrives out of nowhere. `line` is where the cut is aimed, which during a
    // windup is nowhere near where the blade is pointing -- that gap is the
    // read, and it is the one thing worth drawing.
    row[UNIT_LIMB_SWING] = limb.swing.discriminant() as f32;
    row[UNIT_LIMB_SWING_LEFT] = f32::from(limb.swing_left);
    row[UNIT_LIMB_LINE_RAW] = f32::from(limb.line.raw());

    // The loadout. What is in hand, what kind of thing it is, and what the
    // fighter is carrying -- so the page can draw a blade or an arc from the
    // role rather than guessing from the numbers, and show a loadout without
    // keeping its own copy of one.
    row[UNIT_ACTION_KIND] = view.action.code() as f32;
    row[UNIT_ACTION_ROLE] = view.action.role().discriminant() as f32;
    row[UNIT_SLOT] = view.slot as f32;
    row[UNIT_SLOT0_ACTION] = slot_code(view.loadout.slot(0));
    row[UNIT_SLOT1_ACTION] = slot_code(view.loadout.slot(1));

    // How far this body can see, in world units, straight from the stat sheet
    // the observation code reads. The page drew a vision ring from its own copy
    // of `(60 + 6 * perception) / 10` until this column existed, which was the
    // last mirrored sim formula on the retired Canvas page -- and the one with
    // the shortest remaining life, because the hero's perception is a live dial
    // now.
    row[UNIT_SIGHT_RANGE] = view.stats.sight_range().to_f32();

    // Whether the player can see this body: `1` yes, `0` no.
    //
    // **Hero-centric, and that is the point** -- it drives what the *player*
    // sees, not what each body perceives for itself. A monster's own contact
    // list is a different question with a different answer, and it never
    // crosses this boundary.
    //
    // With no hero standing there is no point of view, so everything reports
    // visible: a fog of war with nobody to be fogged from is just a blank
    // screen. Through `u8` because `f32::from(bool)` does not exist, and the
    // house precedent for the conversion is `write_map`.
    row[UNIT_VISIBLE] = f32::from(u8::from(visible));

    // Velocity, straight off the view. **Not derivable on the page** -- a frame
    // is up to eight ticks and often none, so differencing `x, y` across frames
    // measures the browser's scheduler as much as the body's feet.
    row[UNIT_VX] = view.velocity.x.to_f32();
    row[UNIT_VY] = view.velocity.y.to_f32();

    // The walk cycle's phase and the current attack phase's length: two
    // presentation clocks that the sim's own numbers drive, so that a leg and a
    // telegraph are drawn from what happened rather than from a wall clock. See
    // `STRIDE_PER_RADIUS` and `UNIT_STRIDE`'s own prose.
    row[UNIT_STRIDE_PHASE] = stride.to_f32();
    row[UNIT_SWING_SPAN] = f32::from(swing_span);
}

/// An action code, or [`SLOT_EMPTY`] for a slot nothing is in.
fn slot_code(slot: Option<sim::ActionKind>) -> f32 {
    match slot {
        Some(kind) => kind.code() as f32,
        None => SLOT_EMPTY as f32,
    }
}

/// Ticks remaining as a `0..=1` brightness.
fn flash_level(ticks: u8) -> f32 {
    f32::from(ticks) / f32::from(FLASH_TICKS)
}

/// Which faction an integer names. Total, like everything on this boundary:
/// anything but `0` is the monsters.
const fn faction_from_code(code: u32) -> Faction {
    match code {
        0 => Faction::Heroes,
        _ => Faction::Monsters,
    }
}

/// Archetype as a small integer, matching the encoding `Body` hashes with.
/// Spelled out rather than derived because the client keys its sprites and
/// colours on these numbers: a silent reshuffle would repaint the game.
const fn kind_code(kind: Body) -> u32 {
    match kind {
        Body::Fighter => 0,
        Body::Rogue => 1,
        Body::Brute => 2,
        Body::Skitterer => 3,
    }
}

/// The inverse of [`kind_code`], for the one integer the client sends inward.
///
/// Total, like everything else on this boundary: an unrecognised code is a
/// Skitterer rather than a panic, because the alternative is a typo in the page
/// poisoning the module for the rest of the session.
const fn kind_from_code(code: u32) -> Body {
    match code {
        0 => Body::Fighter,
        1 => Body::Rogue,
        2 => Body::Brute,
        _ => Body::Skitterer,
    }
}

/// Which archetype a replacement character is: `0` a Fighter, `1` a Rogue.
///
/// Separate from [`kind_from_code`] because the two hero builds are the only
/// sensible answers here and the default has to be one of them. Falling through
/// to a Skitterer would put a monster archetype on the player's side of the
/// room -- a hero the HUD describes with a monster's stat block, which is a much
/// more confusing failure than the typo that caused it.
/// A loadout from two action codes, falling back to the body's own defaults.
///
/// Total, like every other inward mapping on this boundary. An unrecognised or
/// not-yet-playable primary means "whatever this body would have brought", so a
/// page that sends nonsense gets a fighter rather than a panic; `SLOT_EMPTY` in
/// the second slot is the one *deliberate* way to ask for a fighter that cannot
/// change its mind.
fn loadout_from_codes(body: Body, primary: u32, secondary: u32) -> Loadout {
    let playable = |code: u32| {
        sim::ActionKind::from_code(code).filter(|kind| kind.is_playable())
    };
    match playable(primary) {
        Some(first) => Loadout {
            primary: first,
            secondary: playable(secondary),
        },
        None => body.default_loadout(),
    }
}

/// Which body a replacement character takes.
///
/// **All four are legal now**, where this used to admit only a Fighter and a
/// Rogue. A body carries no weapon any more, so "monster archetype" stopped
/// being a property of the body and became a property of the loadout -- and a
/// Skitterer with a sword and a shield is a perfectly good thing to be, and an
/// interesting one to play.
///
/// Unrecognised codes fall back to a Fighter rather than to
/// [`kind_from_code`]'s Skitterer: this is the character the player is about to
/// be handed, and the durable one is the kinder default for a page that has
/// asked for something that does not exist.
const fn hero_from_code(code: u32) -> Body {
    match code {
        1 => Body::Rogue,
        2 => Body::Brute,
        3 => Body::Skitterer,
        _ => Body::Fighter,
    }
}

/// What a unit is trying to do, in the encoding the replay codec writes an
/// intent tag in. This used to say "the same encoding `Command` hashes with",
/// and that hash is gone with the legacy command column; the three numbers are
/// unchanged because the codec still writes them, so the ABI word is the ABI
/// word it always was.
const fn intent_code(intent: Intent) -> u32 {
    match intent {
        Intent::Hold => 0,
        Intent::Attack(_) => 1,
        Intent::Flee => 2,
    }
}

// -------------------------------------------- packing poses and combat events
//
// Free functions rather than methods, and that is the point of them: [`publish`]
// and the scripted [`articulated_stream_digest`] both go through exactly these,
// so the digest fingerprints the bytes the page reads rather than a second
// encoder's opinion of them. A digest computed by a parallel writer proves that
// two encoders agree and says nothing at all about the buffer.

/// One [`Fx`] -- or any other signed fixed-point value -- as a published word.
///
/// `as u32` and never `as i64 as u32`: the reference's rule is the two's
/// complement bits reinterpreted, so `-1` is `0xffffffff` and the reader
/// recovers it with a single `| 0` on the far side.
const fn fx_word(value: Fx) -> u32 {
    value.raw() as u32
}

/// A `Vec3` as its three published words.
fn vec3_words(value: fx::Vec3) -> [u32; 3] {
    [fx_word(value.x), fx_word(value.y), fx_word(value.z)]
}

/// One `u64` resolution channel as its low and high words.
///
/// **The whole reason the event stride is 32 and not 25.** Every energy channel
/// the contact solver produces is a `u64`, and a host that narrowed one to a
/// `u32` would publish a wrong number that no reader could tell from a small
/// one -- there is no sentinel and no range check that would catch it.
const fn u64_words(value: u64) -> [u32; 2] {
    [value as u32, (value >> 32) as u32]
}

/// One published pose row, straight off the sim's own published pose.
///
/// Nothing is derived here. [`sim::Pose`] was shaped to be exactly
/// this row -- its positions are already world space and its masks are already
/// read off its own geometry -- so re-deriving any of it on this side would be
/// a second answer to a question the sim has already answered once.
fn pose_row(pose: &sim::Pose) -> [u32; POSE_STRIDE] {
    let mut row = [0u32; POSE_STRIDE];
    row[POSE_ENTITY_INDEX] = pose.id.index;
    row[POSE_ENTITY_GENERATION] = pose.id.generation;
    row[POSE_BODY_X..=POSE_BODY_Z].copy_from_slice(&vec3_words(pose.body));
    row[POSE_BODY_YAW_RAW] = u32::from(pose.body_yaw.raw());
    row[POSE_BODY_VX..=POSE_BODY_VZ].copy_from_slice(&vec3_words(pose.body_velocity));

    // The two arms, in `LimbSlot` order, at the two bases the table gives them.
    // Left is 9 and right is 19; the ten words in between are the same ten in
    // the same order, which is why this is a loop and not two copies.
    for (limb, base) in [(0usize, POSE_LEFT_HAND_X), (1, POSE_RIGHT_HAND_X)] {
        let arm = pose.arms[limb];
        row[base..base + 3].copy_from_slice(&vec3_words(arm.hand));
        // Relative to the body origin, which is the column the actuator
        // integrates. See `PosedArm::velocity`: the absolute hand velocity is
        // the body velocity plus this, and publishing the sum would throw away
        // the only term a reader cannot recover.
        row[base + 3..base + 6].copy_from_slice(&vec3_words(arm.velocity));
        row[base + 6] = fx_word(arm.fatigue);
        row[base + 7..base + 10].copy_from_slice(&vec3_words(arm.target_hand));
    }

    // An absent weapon writes zero geometry rather than a sentinel, because
    // there is already a presence bit for it two rows down and a second way to
    // say "nothing here" is a second thing to disagree about. A two-handed item
    // fills the right slot only, which is the sim's ownership rule and not a
    // choice made here.
    for (limb, base) in [(0usize, POSE_LEFT_WEAPON_HILT_X), (1, POSE_RIGHT_WEAPON_HILT_X)] {
        let Some(weapon) = pose.weapons[limb] else { continue };
        row[base..base + 3].copy_from_slice(&vec3_words(weapon.hilt));
        row[base + 3..base + 6].copy_from_slice(&vec3_words(weapon.tip));
    }
    if let Some(shield) = pose.shield {
        row[POSE_SHIELD_CENTER_X..=POSE_SHIELD_CENTER_Z]
            .copy_from_slice(&vec3_words(shield.centre));
        row[POSE_SHIELD_NORMAL_X..=POSE_SHIELD_NORMAL_Z]
            .copy_from_slice(&vec3_words(shield.normal));
        row[POSE_SHIELD_HALF_WIDTH] = fx_word(shield.half_width);
        row[POSE_SHIELD_HALF_HEIGHT] = fx_word(shield.half_height);
        // `thickness` is deliberately not published. It is a collision depth
        // the shield face carries for the contact phase; a renderer draws the
        // face, and adding the column later is an append rather than a move.
    }

    for part in 0..sim::AnatomyRegion::COUNT {
        row[POSE_INTEGRITY_FIRST + part] = fx_word(pose.integrity_fraction[part]);
        row[POSE_WOUND_FIRST + part] = fx_word(pose.wound_fraction[part]);
    }
    row[POSE_BLOOD_FRACTION] = fx_word(pose.blood_fraction);
    row[POSE_SHOCK] = fx_word(pose.shock);
    row[POSE_SEVERED_MASK] = u32::from(pose.severed_mask);
    row[POSE_EQUIPMENT_MASK] = u32::from(pose.equipment_mask);
    row[POSE_INTENT] = intent_code(pose.intent);
    row[POSE_LEFT_HINT] = pose.hints[0] as u32;
    row[POSE_RIGHT_HINT] = pose.hints[1] as u32;
    row
}

/// One published region row, straight off [`sim::body_region_volumes`]' output.
///
/// All four fields of [`sim::RegionVolume`] and nothing else. `present` is a
/// published word rather than something the reader works out -- see
/// [`REGION_PRESENT`], where the head is the case that settles it.
fn region_row(volume: &sim::RegionVolume) -> [u32; REGION_STRIDE] {
    let mut row = [0u32; REGION_STRIDE];
    row[REGION_LOWER_X..=REGION_LOWER_Z].copy_from_slice(&vec3_words(volume.lower));
    row[REGION_UPPER_X..=REGION_UPPER_Z].copy_from_slice(&vec3_words(volume.upper));
    row[REGION_RADIUS] = fx_word(volume.radius);
    row[REGION_PRESENT] = u32::from(volume.present);
    row
}

/// One live arrow, copied without deriving presentation geometry. Slot plus
/// generation is the projectile identity; owner is a full entity identity for
/// the same reuse reason; every remaining field is the simulation's own fixed-
/// point state.
fn articulated_projectile_row(
    projectile: &sim::ProjectileView,
) -> [u32; ARTICULATED_PROJECTILE_STRIDE] {
    let mut row = [0u32; ARTICULATED_PROJECTILE_STRIDE];
    row[ARTICULATED_PROJECTILE_SLOT] = projectile.slot;
    row[ARTICULATED_PROJECTILE_GENERATION] = projectile.generation;
    row[ARTICULATED_PROJECTILE_OWNER_INDEX] = projectile.owner.index;
    row[ARTICULATED_PROJECTILE_OWNER_GENERATION] = projectile.owner.generation;
    row[ARTICULATED_PROJECTILE_POSITION_X..=ARTICULATED_PROJECTILE_POSITION_Z]
        .copy_from_slice(&vec3_words(projectile.position));
    row[ARTICULATED_PROJECTILE_VELOCITY_X..=ARTICULATED_PROJECTILE_VELOCITY_Z]
        .copy_from_slice(&vec3_words(projectile.velocity));
    row[ARTICULATED_PROJECTILE_RADIUS] = fx_word(projectile.radius);
    row[ARTICULATED_PROJECTILE_REMAINING_RANGE] = fx_word(projectile.remaining_range);
    row
}

/// One embodied body's legs, copied and not computed.
///
/// The twist is the sim's own derived word rather than a subtraction repeated
/// here. `StanceState` deliberately does not *store* a twist, because a stored
/// copy is a second thing that can disagree with the two angles it is a function
/// of; a host that recomputed it from the hip and body yaws would be the first
/// consumer to make that second copy, and it would be the copy that has never
/// heard of the clamp bounding it.
fn embodied_stance_row(stance: &sim::StanceView) -> [u32; EMBODIED_STANCE_STRIDE] {
    let mut row = [0u32; EMBODIED_STANCE_STRIDE];
    row[EMBODIED_STANCE_ENTITY_INDEX] = stance.id.index;
    row[EMBODIED_STANCE_ENTITY_GENERATION] = stance.id.generation;
    row[EMBODIED_STANCE_HIP_YAW_RAW] = u32::from(stance.hip_yaw.raw());
    row[EMBODIED_STANCE_PELVIS_RAW] = fx_word(stance.pelvis);
    // Reinterpreted and not widened: this one is a signed delta rather than an
    // `Angle`, so a sign extension would make a quarter turn to the right and
    // `0xffff_c000` two different words for one twist.
    row[EMBODIED_STANCE_TWIST_RAW] = stance.twist_raw as u32;
    row[EMBODIED_STANCE_STEP_LEFT] = u32::from(stance.step_left);
    row
}

/// One published combat-event row.
///
/// `tick` is the tick that was *integrated*, not the counter after `World::step`
/// returned: the time of impact beside it is a fraction of that tick, so the
/// pair would name two different moments otherwise.
fn combat_event_row(tick: u32, row: &sim::ContactResolution) -> [u32; COMBAT_EVENT_STRIDE] {
    let fact = row.fact;
    let mut out = [0u32; COMBAT_EVENT_STRIDE];
    out[COMBAT_EVENT_TICK] = tick;
    // Reinterpreted rather than widened, and the two are the same word here: a
    // `TimeOfImpact` is clamped into `[0,1]` at construction, so its raw is
    // never negative and there is no sign to extend. Written this way so it
    // reads like every other raw fixed-point column rather than like a special
    // case.
    out[COMBAT_EVENT_TOI_RAW] = fact.toi.get().raw() as u32;
    out[COMBAT_EVENT_GROUP_ORDINAL] = u32::from(row.group_ordinal);
    out[COMBAT_EVENT_A_INDEX] = fact.key.a.index;
    out[COMBAT_EVENT_A_GENERATION] = fact.key.a.generation;
    out[COMBAT_EVENT_B_INDEX] = fact.key.b.index;
    out[COMBAT_EVENT_B_GENERATION] = fact.key.b.generation;
    // Carried as the sim's own bytes, `sim::BODY_SLOT` and all: a host that
    // remapped "the body itself" onto some other number would be inventing a
    // second vocabulary for a value the solver already keys its facts on.
    out[COMBAT_EVENT_A_SLOT] = u32::from(fact.key.a_slot);
    out[COMBAT_EVENT_B_SLOT] = u32::from(fact.key.b_slot);
    out[COMBAT_EVENT_KIND] = fact.key.kind as u32;
    out[COMBAT_EVENT_POINT_X..=COMBAT_EVENT_POINT_Z].copy_from_slice(&vec3_words(fact.point));
    out[COMBAT_EVENT_NORMAL_X..=COMBAT_EVENT_NORMAL_Z].copy_from_slice(&vec3_words(fact.normal));
    out[COMBAT_EVENT_ENERGY_BEFORE_LO..=COMBAT_EVENT_ENERGY_BEFORE_HI]
        .copy_from_slice(&u64_words(row.energy.before_raw));
    out[COMBAT_EVENT_ENERGY_AFTER_LO..=COMBAT_EVENT_ENERGY_AFTER_HI]
        .copy_from_slice(&u64_words(row.energy.after_raw));
    out[COMBAT_EVENT_ENERGY_DISSIPATED_LO..=COMBAT_EVENT_ENERGY_DISSIPATED_HI]
        .copy_from_slice(&u64_words(row.energy.dissipated_raw));
    out[COMBAT_EVENT_CUT_LO..=COMBAT_EVENT_CUT_HI].copy_from_slice(&u64_words(row.cut_raw));
    out[COMBAT_EVENT_THRUST_LO..=COMBAT_EVENT_THRUST_HI]
        .copy_from_slice(&u64_words(row.thrust_raw));
    // **The published pressure column is `crush + pressure`, not `pressure`.**
    // combat-arms-05 split a fourth channel out of what used to be the whole
    // non-cut, non-thrust remainder, and the event layout has three channel
    // words rather than four. Publishing only `pressure_raw` would break the
    // one invariant every consumer of these words relies on -- `client/src/
    // fight/trace.ts::share` sums the three to recover the allocated share, and
    // both the 2D ring and the arena's contact sphere are sized from it -- so a
    // crushing blow would draw *smaller* than it is while reporting a cut and a
    // thrust of zero, which is to say it would look like nothing happened. That
    // is the opposite of what giving a club a wounding channel was for.
    //
    // The cost of keeping the sum exact is that the browser cannot yet tell a
    // crushing blow from an inert graze. Splitting it is a layout change --
    // append `crush` at words 32/33, which keeps this prefix byte-identical the
    // way v2-ui-06 did -- and it moves `ARTICULATED_STREAM_DIGEST` plus five
    // mirrors, so it is its own session rather than a rider on this one.
    out[COMBAT_EVENT_PRESSURE_LO..=COMBAT_EVENT_PRESSURE_HI]
        .copy_from_slice(&u64_words(row.crush_raw + row.pressure_raw));
    out[COMBAT_EVENT_DEFLECTED_LO..=COMBAT_EVENT_DEFLECTED_HI]
        .copy_from_slice(&u64_words(row.deflected_raw));
    // **The published word is the body part, so the volume is mapped and not
    // copied.** The fact carries the swept volume the solver chose, which is
    // seven-valued; this column has always been a `BodyPart` and its sentinel
    // sits outside the five. Publishing the raw volume would have put a `5` or a
    // `6` in a column every reader indexes into a five-element name table -- and
    // `sim::volume_region` answering `None` is exactly the "no anatomy here"
    // case the sentinel already means, so the two arms collapse into one.
    out[COMBAT_EVENT_BODY_PART] = match sim::volume_region(fact.volume as usize) {
        Some(part) => part as u32,
        None => COMBAT_EVENT_NO_BODY_PART,
    };
    out[COMBAT_EVENT_SEVERED] = u32::from(row.severed);
    out
}

/// Appends one canonical row to a fixed publication buffer, or counts it as
/// dropped.
///
/// **The prefix is retained and the tail is counted**, for both buffers and for
/// one reason: a reader holding the first `n` rows is holding the first `n` rows
/// the producer meant, in the order it meant them, and the drop count says how
/// much of the picture it is not being shown. Retaining a *suffix* -- "keep the
/// most recent" -- would have made the row a reader already had disappear from
/// under it, and no priority class reorders this for the same reason.
///
/// Saturating, because a drop count that wrapped would report zero drops at the
/// exact moment there were four billion.
fn push_published_row(out: &mut [u32], rows: &mut u32, dropped: &mut u32, row: &[u32]) {
    let at = *rows as usize * row.len();
    if at + row.len() > out.len() {
        *dropped = dropped.saturating_add(1);
        return;
    }
    out[at..at + row.len()].copy_from_slice(row);
    *rows += 1;
}

/// [`push_published_row`]'s rule, applied to the accumulator rather than the
/// buffer.
///
/// The cap has to be enforced here as well as at publication, and not because
/// the two could disagree: a `Vec` pushed past the capacity it was reserved for
/// reallocates, and a reallocation inside a tick grows linear memory and
/// detaches every typed array the page is holding. That is the failure
/// `client/test/wasm-memory.test.mjs` exists to catch.
fn push_combat_event(
    events: &mut Vec<[u32; COMBAT_EVENT_STRIDE]>,
    dropped: &mut u32,
    row: [u32; COMBAT_EVENT_STRIDE],
) {
    if events.len() >= MAX_COMBAT_EVENTS {
        *dropped = dropped.saturating_add(1);
        return;
    }
    events.push(row);
}

/// Fills a pose buffer from end-of-call state and answers `(rows, dropped)`.
///
/// **Ground truth and not a publishable snapshot.** Every row here is the
/// authoritative pose of a body the reader may not be able to see; the
/// visibility filtering is the worker's job. See [`pose_ptr`].
fn write_pose_buffer(sim: &Sim, out: &mut [u32; MAX_POSES * POSE_STRIDE]) -> (u32, u32) {
    let mut rows = 0u32;
    let mut dropped = 0u32;
    for pose in sim.world.poses() {
        push_published_row(out, &mut rows, &mut dropped, &pose_row(&pose));
    }
    (rows, dropped)
}

/// The swept volumes of one published body, from the one function that builds
/// them.
///
/// **Every argument is either the pose's own or the anatomy the world was
/// constructed with, and nothing here computes geometry.** The origin, the yaw,
/// the two hands and now the two elbows come off the pose; `present` is the
/// severed mask read the way `World` reads it when it builds its own colliders;
/// and the shapes come back from `sim::jointed_body_region_volumes`, the
/// function the contact phase sweeps.
///
/// **`present` is five bits and the answer is seven volumes**, which is the
/// region/volume distinction in miniature and is the one place this file used to
/// get it wrong. The mask was built as `[bool; REGIONS_PER_BODY]` -- correct
/// exactly while that constant was the region count. It is a *severance* mask,
/// `POSE_SEVERED_MASK` has one bit per `BodyPart`, and there is no state in
/// which a forearm is severed and its arm is not, so widening it would have been
/// inventing two bits nothing publishes.
///
/// **The hands and elbows go in body-relative and come out world space.**
/// `jointed_body_region_volumes` adds the origin itself, which is the single
/// conversion the whole contact module is arranged around; the pose row
/// publishes both in world space, so the subtraction here undoes that one
/// conversion rather than inventing a second frame. The elbow is `None` for a
/// single-link body and the last two rows then come back absent, which is why
/// this is one call and not a branch on the combat model.
///
/// A separate function from the buffer writer so a hand-built pose can be put
/// through the *publication's* path rather than through a second spelling of
/// it -- which is what `a_severed_region_is_published_absent` and
/// `the_head_capsule_is_published_degenerate_and_present` need, since neither
/// case is reachable by asking a live world nicely.
fn pose_region_volumes(
    pose: &sim::Pose,
    anatomy: &sim::BodyAnatomySpec,
) -> [sim::RegionVolume; REGIONS_PER_BODY] {
    let present: [bool; sim::AnatomyRegion::COUNT] =
        core::array::from_fn(|part| pose.severed_mask & (1 << part) == 0);
    let hands = [pose.arms[0].hand - pose.body, pose.arms[1].hand - pose.body];
    let elbows = [pose.arms[0].elbow.map(|joint| joint - pose.body),
                  pose.arms[1].elbow.map(|joint| joint - pose.body)];
    sim::jointed_body_region_volumes(pose.body, anatomy, pose.body_yaw, hands, present, elbows)
}

/// Fills the region buffer from the same bodies [`write_pose_buffer`] walks,
/// and answers `(rows, dropped)`.
///
/// **The capsules the contact phase sweeps, through
/// [`pose_region_volumes`].** The host computes no geometry -- that is the
/// entire point of the section, and a second derivation here would be the
/// mirror `trace.rs` refuses.
///
/// A body whose anatomy this host does not hold is skipped. It cannot happen --
/// see [`Sim::anatomy`] -- and if it did, **the rows after it would shift**:
/// there is one cursor, so the section would still be dense and every later
/// body's five rows would land five rows early. That is exactly why the count is
/// the contract. The skip costs five rows against `REGIONS_PER_BODY * pose_len`,
/// so a reader that compares the two lengths before it indexes refuses the whole
/// section instead of confidently drawing somebody else's arm, and
/// `the_region_section_covers_every_published_pose` is what asserts the two
/// lengths agree on every world this module can install.
fn write_region_buffer(sim: &Sim, out: &mut [u32; MAX_REGIONS * REGION_STRIDE]) -> (u32, u32) {
    let mut rows = 0u32;
    let mut dropped = 0u32;
    for pose in sim.world.poses() {
        let Some(anatomy) = sim.anatomy.get(pose.id.index as usize).and_then(Option::as_ref)
        else {
            dropped = dropped.saturating_add(REGIONS_PER_BODY as u32);
            continue;
        };
        for volume in &pose_region_volumes(&pose, anatomy) {
            push_published_row(out, &mut rows, &mut dropped, &region_row(volume));
        }
    }
    (rows, dropped)
}

/// Fills the isolated articulated-projectile buffer from the runtime's stable
/// slot-order iterator and answers `(rows, dropped)`.
fn write_articulated_projectile_buffer(
    sim: &Sim,
    out: &mut [u32; MAX_ARTICULATED_PROJECTILES * ARTICULATED_PROJECTILE_STRIDE],
) -> (u32, u32) {
    let mut rows = 0u32;
    let mut dropped = 0u32;
    for projectile in sim.world.projectiles() {
        push_published_row(
            out,
            &mut rows,
            &mut dropped,
            &articulated_projectile_row(&projectile),
        );
    }
    (rows, dropped)
}

/// Fills the stance buffer from every live embodied body, in the slot order
/// [`write_pose_buffer`] walks, and answers `(rows, dropped)`.
///
/// **It never asked which combat model was installed, and that was the point.**
/// `World::stances` answered nothing at all for a model with no legs, so such a
/// world wrote its zero rows through the same code an embodied one writes its
/// roster through. A host that had branched on a `has_stance` predicate first
/// would have had two paths where the sim has one, and the second path is the
/// one nothing ever ran. The predicate is gone with the models that made it
/// answer twice; the shape of this function is the part worth keeping, because
/// it is what made the deletion cost nothing here.
fn write_embodied_stance_buffer(
    sim: &Sim,
    out: &mut [u32; MAX_EMBODIED_STANCE * EMBODIED_STANCE_STRIDE],
) -> (u32, u32) {
    let mut rows = 0u32;
    let mut dropped = 0u32;
    for stance in sim.world.stances() {
        push_published_row(out, &mut rows, &mut dropped, &embodied_stance_row(&stance));
    }
    (rows, dropped)
}

/// Copies the accumulated contact rows into the event buffer and answers
/// `(rows, dropped)`.
///
/// The overflow arm cannot fire -- the accumulator is capped at the same
/// [`MAX_COMBAT_EVENTS`] this buffer holds -- and is here anyway, because the
/// two caps are stated in two places and a reader of either one is entitled to
/// see the same rule.
fn write_combat_event_buffer(
    sim: &Sim,
    out: &mut [u32; MAX_COMBAT_EVENTS * COMBAT_EVENT_STRIDE],
) -> (u32, u32) {
    let mut rows = 0u32;
    let mut dropped = sim.combat_events_dropped;
    for row in &sim.combat_events {
        push_published_row(out, &mut rows, &mut dropped, row);
    }
    (rows, dropped)
}

/// Rebuilds the frame from current state. Called by every export that changes
/// something, so [`frame_ptr`] and [`frame_len`] are pure reads -- they cannot
/// allocate, so they cannot grow linear memory, so they cannot detach the view
/// the client is about to read through.
///
/// **A mutable borrow, for [`Sim::refresh_vis`]'s sake**, where writing the frame
/// alone needed only a shared one. Nothing reentrant follows from that: no
/// export holds a borrow of `SIM` across its call to this, `refresh_vis` borrows
/// `VIS` and `write_frame` borrows `FRAME`, and neither of them reaches back for
/// `SIM`.
fn publish() {
    let len = SIM.with(|sim| match sim.borrow_mut().as_mut() {
        Some(sim) => {
            // Before the frame and not after: the row's `visible` column and the
            // tile buffer's fog are the same question asked twice, and a frame
            // written first would answer it against the previous hero tile.
            sim.refresh_vis();
            // The pose rows are filled from **end-of-call** state, which is why
            // they belong here rather than in `advance`: this is the one
            // function that runs after every mutating export, so a spawn, a
            // swap or a submitted command that moved a hand is in the buffer
            // without each of those exports having to remember to say so.
            let (pose_rows, poses_dropped) =
                POSES.with(|poses| write_pose_buffer(sim, &mut poses.borrow_mut()));
            POSE_LEN.with(|n| n.set(pose_rows));
            POSES_DROPPED.with(|n| n.set(poses_dropped));
            // Beside the pose rows and from the same walk of the same bodies,
            // so region row `n` belongs to pose row `n / REGIONS_PER_BODY`.
            // Two publications of one end-of-call state, written in one place.
            let (region_rows, regions_dropped) =
                REGIONS.with(|regions| write_region_buffer(sim, &mut regions.borrow_mut()));
            REGION_LEN.with(|n| n.set(region_rows));
            REGIONS_DROPPED.with(|n| n.set(regions_dropped));
            let (projectile_rows, projectiles_dropped) = ARTICULATED_PROJECTILES.with(
                |projectiles| write_articulated_projectile_buffer(sim, &mut projectiles.borrow_mut()),
            );
            ARTICULATED_PROJECTILE_LEN.with(|n| n.set(projectile_rows));
            ARTICULATED_PROJECTILES_DROPPED.with(|n| n.set(projectiles_dropped));
            // Unconditionally, on every world this module can install. The two
            // lines below write a zero length for the two models with no legs,
            // which is the answer a reader is owed -- "this world publishes no
            // stances" is a fact, and leaving the previous world's count behind
            // would be a lie about a roster that no longer exists.
            let (stance_rows, stances_dropped) = EMBODIED_STANCES
                .with(|stances| write_embodied_stance_buffer(sim, &mut stances.borrow_mut()));
            EMBODIED_STANCE_LEN.with(|n| n.set(stance_rows));
            EMBODIED_STANCES_DROPPED.with(|n| n.set(stances_dropped));
            let (event_rows, events_dropped) = COMBAT_EVENTS
                .with(|events| write_combat_event_buffer(sim, &mut events.borrow_mut()));
            COMBAT_EVENT_LEN.with(|n| n.set(event_rows));
            COMBAT_EVENTS_DROPPED.with(|n| n.set(events_dropped));
            write_dungeon_objects(&sim.world, &sim.torches);
            FRAME.with(|frame| sim.write_frame(&mut frame.borrow_mut()))
        }
        // **This arm used to write no header at all**, on the argument that
        // `FRAME` is zero-initialised and `SIM` never goes back to `None` once
        // an `init` has filled it -- so every header float held either a written
        // value or a zero that was never anything else. The note ended by saying
        // that a future export which could clear `SIM` has to zero the header
        // here, and there are now two of them -- [`init_embodied_test`] and
        // [`init`], both of which refuse to install a
        // world whose
        // construction or whose contact reservation the sim would not answer
        // `Ok` to. A header left over from the last live sim would then report
        // that sim's unit count, depth and feed truncation over a world that is
        // not there.
        None => {
            FRAME.with(|frame| frame.borrow_mut()[..HEADER_LEN].fill(0.0));
            // The same treatment, and then some. Zeroing the two lengths is
            // what the header zeroing is: nothing past a published length is
            // readable, so a stale row behind a zero length is exactly as dead
            // as a stale unit row behind `frame_len`. The rows are wiped as
            // well anyway, which the frame's are not, because a pose row is
            // *ground truth about an identity* -- a reader that held a stale
            // length would be handed the previous world's bodies, and 279,040
            // bytes on an arm that only runs when no world is installed is not
            // a cost worth trading that against. It was 49,664 while
            // `MAX_COMBAT_EVENTS` was the provisional 256, and the trade comes
            // out the same way at nearly six times the size: this arm runs once
            // per refused install and never inside a frame. It comes out the
            // same way a fourth time at 292,352, for the region, projectile and
            // stance rows below -- which are ground truth about an identity in the sharper sense of
            // the two, since a capsule is where a body's head *is* and a hip yaw
            // is which way it is about to be able to go.
            POSES.with(|poses| poses.borrow_mut().fill(0));
            POSE_LEN.with(|n| n.set(0));
            POSES_DROPPED.with(|n| n.set(0));
            REGIONS.with(|regions| regions.borrow_mut().fill(0));
            REGION_LEN.with(|n| n.set(0));
            REGIONS_DROPPED.with(|n| n.set(0));
            ARTICULATED_PROJECTILES.with(|projectiles| projectiles.borrow_mut().fill(0));
            ARTICULATED_PROJECTILE_LEN.with(|n| n.set(0));
            ARTICULATED_PROJECTILES_DROPPED.with(|n| n.set(0));
            EMBODIED_STANCES.with(|stances| stances.borrow_mut().fill(0));
            EMBODIED_STANCE_LEN.with(|n| n.set(0));
            EMBODIED_STANCES_DROPPED.with(|n| n.set(0));
            COMBAT_EVENTS.with(|events| events.borrow_mut().fill(0));
            COMBAT_EVENT_LEN.with(|n| n.set(0));
            COMBAT_EVENTS_DROPPED.with(|n| n.set(0));
            DUNGEON_OBJECTS.with(|objects| objects.borrow_mut().fill(0));
            DUNGEON_OBJECT_LEN.with(|n| n.set(0));
            DUNGEON_OBJECTS_DROPPED.with(|n| n.set(0));
            HEADER_LEN
        }
    });
    FRAME_LEN.with(|n| n.set(len as u32));
}

fn with_sim<R>(default: R, f: impl FnOnce(&mut Sim) -> R) -> R {
    SIM.with(|sim| match sim.borrow_mut().as_mut() {
        Some(sim) => f(sim),
        None => default,
    })
}

// ------------------------------------------------------------------ exports
//
// `#[allow(unsafe_code)]` on each of these, and nowhere else. See the crate
// docs: the attribute is what the lint fires on, not anything in the body.

/// Opens a generated floor with one hero standing on it. Safe to call again to
/// start over.
///
/// **Embodied, and this is the one export that says so.** There used to be three
/// entry points on this floor plan -- `init` under Legacy, `init_articulated` and
/// `init_embodied` -- because an export's name was the whole of what a page
/// selected a model with, and a page that had to pass an integer to choose one
/// could pass a wrong integer. With one model left there is nothing to select,
/// so the argument that made them three is what collapses them back to one.
///
/// **Fails closed on every refusal.** A scenario the sim will not build, and a
/// contact reservation it will not make, both install *no world at all* rather
/// than a world whose next spawn could move the page's typed arrays out from
/// under it -- and rather than leaving the previous world standing behind a call
/// that said it started over. Neither is a panic: a trap behind
/// `pub extern "C"` poisons the instance for the life of the page.
///
/// **This is a warm-up path, and a caller's no-growth proof has to warm it.**
/// The reservation is 64 rows of contact vectors, so the first `init` on a fresh
/// module grows linear memory once. That is the growth being bought: every later
/// spawn, step and contact on this world is free of it.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn init(seed: u32) {
    let seed = u64::from(seed);
    install_articulated(
        &dungeon_scenario(seed, 0, starting_hero()),
        seed,
    );
}

// ------------------------------------------------------- the standing order
//
// **`set_goto`, `set_focus`, `clear_order`, the three route exports and the two
// focus readers were deleted here, and the reason is a missing column rather
// than a change of taste.**
//
// `World::set_order` is not model-gated: it accepts an embodied world and
// reaches `World::state_hash`. It also rebuilt the faction's flow field until
// that field was deleted -- for exactly the reason below, arrived at from the
// other end. The field's only readers were `nav_dir` and `nav_distance` on the
// *legacy* `Observation`, and the order itself is copied into that same struct.
// An `Observation` -- which is the whole of what an embodied body
// perceives -- has no order column and no nav column. So on this floor a click
// moved the state hash, drew a destination pip in the frame header, rebuilt a
// field nobody read, and changed nothing whatsoever about where anybody walked.
//
// That is the exact shape of refusal this repository has already paid for ten
// times in two reviews: a control that accepts an input it cannot act on and
// says nothing. It is worse here than in any of those cases, because the input
// *does* reach the fingerprint -- the order is invisible to the fight's logic
// and visible to its identity, which `order_is_the_callers` called the worst
// pair of properties an input can have while refusing it for an arena. The same
// sentence now describes every world this module installs.
//
// The queue was worse again. `Sim::follow_route` popped a leg on arrival or on
// `ROUTE_STALL`, and with nobody walking, arrival never comes: a dragged path
// would have advanced one waypoint every ninety ticks while the body stood
// still, which reads as a bug in the router rather than as a channel that is
// not connected.
//
// **The alternative was to keep them and give `Observation` a nav
// column.** That is a new mechanic and a new feature block on a frozen vector,
// which is not something a session retiring two models gets to add. Direct
// control is the channel that survives: [`set_control`] and [`set_input`] are
// answered every tick by `Sim::drive_hero`.
//
// **What is left behind for the step that has the page open**: header slots
// 2, 3 and 4 still carry an order kind and an order point, and they now report
// `Order::Hold` at the origin forever, because nothing left in this module ever
// writes anything else. Removing them is a `FRAME_LAYOUT_VERSION` move and
// belongs with the mirrors, not here.

/// Deterministic two-body command-boundary fixture: the same two bodies on the
/// same open floor the corpus measures, with no room around them.
///
/// **`init_articulated_test` stood beside this one and is gone, and the
/// measurement that kept it alive is worth carrying across because it was
/// nearly repeated as a refusal.** That export opened
/// `Scenario::articulated_duel`, and the argument against reseating it was that
/// the boundary clinch -- `CLINCH_YAW`, `CLINCH_WALK`, `CLINCH_SWEEP` and the
/// `CLINCH_CAP_TICK` that `client/test/wasm-memory.test.mjs` mirrors -- is a
/// hand-written byte table of **world-frame** bearings, which the surviving
/// grammar reads relative to the torso. That much is true and still measures: the identical table on this
/// duel resolves **zero** contacts in 400 ticks. What was wrong was the
/// conclusion drawn from it. The translation that was tried held the arms
/// still, which is the drive's own *control* condition -- `CLINCH_SWEEP`'s
/// comment says in as many words that the swept drive is what reaches the cap
/// and the still one never does -- so it measured the control and read the
/// result as the model's.
///
/// Translated properly it is three changes and not one, which is the other half
/// of why the first attempt failed: the walk becomes torso-forward at the same
/// magnitude, the arm bearings become offsets from the torso, and the sweep
/// widens from an eighth-turn to a quarter -- the eighth reaches ordinal 2 of 8
/// on this duel and never caps. So driven, this fixture makes first contact on
/// tick 90 and spends every group ordinal on tick **109**, on each of the three
/// seeds the browser fixture warms. `CLINCH_CAP_TICK` records it and
/// `the_boundary_clinch_reaches_the_contact_group_cap` is what fails if it
/// moves.
///
/// **The pinned command digest is taken over this fixture.**
/// `ARTICULATED_COMMAND_HASH` is a paired golden -- Rust and
/// `tools/wasm_check.js` both write the number down, so a one-sided move is
/// target disagreement rather than a fixture that drifted -- and the browser can
/// only pin a world an export will open for it.
///
/// It shares [`install_boundary_fixture`] rather than reaching for
/// [`install_articulated`], and the difference is not cosmetic: that one goes
/// through [`Sim::try_open`], which sets both factions' objectives, and
/// objectives are hashed state. Building the pinned world down a second path
/// would have moved the digest by a route that has nothing to do with the model.
///
/// **Reserves the contact vectors for the frame's own ceiling before the world
/// is reachable.** See the body for why the reservation is here and not left to
/// the first spawn, and for what a refused reservation does.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn init_embodied_test(seed: u32) {
    install_boundary_fixture(&Scenario::embodied_duel(), seed);
}

/// The body the boundary fixture is built through, kept as its own function
/// because [`init`] must not be able to reach it: this one installs a duel and
/// no floor plan.
fn install_boundary_fixture(scenario: &Scenario, seed: u32) {
    let mut fresh = Sim::new(u64::from(seed));
    fresh.world = World::new(scenario, u64::from(seed));
    // **Both sides on the control policy, and this line keeps a browser-mirrored
    // constant from becoming a policy pin.** [`Sim::advance`] answers every
    // pending decision by submitting the faction's policy command, and [`init`]'s
    // dungeon opens on `Tactical` on both sides -- a fighter that aims. On the
    // articulated fixture this module used to install, that loop was inert by
    // accident: `World::submit` refuses a world of the other grammar,
    // so every policy command it produced was discarded and whatever the *host*
    // had submitted survived the tick. It is not refused here.
    //
    // The consequence is not that the drive stops working -- measured, the
    // boundary clinch caps on tick 132 against `Tactical` and on tick **109**
    // against the control. It is that `CLINCH_CAP_TICK` would become a function
    // of the shipped policy, mirrored into `client/test/wasm-memory.test.mjs`,
    // so a session tuning `PolicyKind::Tactical` would move a browser
    // constant in two files for a reason nothing in either of them names. Every
    // move that constant has ever recorded is a solver change or a drive change;
    // this line is what keeps that true.
    //
    // `Neutral` and not "no policy": there is no such kind, and the honest
    // reading of this fixture is that the bodies in it have a mind which stands
    // still, rather than that it has been switched off. It is still a decision
    // answered on the ordinary clock, so `expire_unanswered_decisions` behaves
    // here exactly as it does on a floor.
    fresh.set_policy(Faction::Heroes, PolicyKind::Neutral);
    fresh.set_policy(Faction::Monsters, PolicyKind::Neutral);
    // The world's anatomy rows, replaced along with the world. This fixture
    // swaps a duel in behind a `Sim` built on a generated floor, so the table it
    // inherited is that floor's roster rather than this duel's -- and a region
    // section written against it would publish the wrong capsules. Every place
    // that assigns `world` owes this line; see [`Sim::anatomy`].
    fresh.anatomy = scenario_anatomy(scenario);
    // Here, while `fresh` is still a local: one line further down the world is
    // reachable through `SIM`, and the `publish` below hands the page a frame
    // pointer it is entitled to keep a typed array over. A contact vector that
    // grew after that moment would grow linear memory and detach every view the
    // page holds -- which is the same argument `route`, `events` and `seen` are
    // each allocated at their ceiling for, and the reason the contact solver
    // reserves against a high water at all.
    //
    // `MAX_UNITS`, not the two rows the duel actually carries. The ceiling is
    // what the frame can ever publish, so reserving for it is the only figure
    // that makes *every* later spawn free; reserving for the roster would leave
    // the growth exactly where it must not be, on the call that adds a body.
    // 64 is also `MAX_ENTITIES`, so this can never be the request
    // that is refused for being too large.
    let reserved = fresh.world.try_reserve_contact_slots(MAX_UNITS).is_ok();
    if reserved {
        fresh.contact_high_water = MAX_UNITS as u32;
    }
    // **A refused reservation installs no world at all.** It cannot happen at
    // 64 -- the entity limit is the same number, so the only error left is
    // `Allocation`, an out-of-memory module -- but "cannot happen" is not a
    // reason to hand the page a world whose next spawn may move its views out
    // from under it, and it is certainly not a reason to keep the *previous*
    // world alive behind a call that says it started over. Not a panic either:
    // a trap behind `pub extern "C"` poisons the instance for the life of the
    // page. The refusal is visible instead -- `contact_high_water()` reads 0 and
    // the frame publishes a zeroed header -- which is a thing a caller can test
    // for.
    SIM.with(|sim| *sim.borrow_mut() = if reserved { Some(fresh) } else { None });
    publish();
}

/// The hero [`init`] walks in with.
///
/// A plain Fighter, which is what the sandbox room has always opened with; the
/// level decides where it stands, and every later floor carries whatever it has
/// become. `combat_spec: None` here and filled in by [`equip_articulated`] on
/// the way through [`dungeon_scenario`], because which anatomy row a Fighter
/// takes is a fact about the table the floor is built against rather than about
/// the character.
fn starting_hero() -> UnitSpec {
    UnitSpec {
        kind: Body::Fighter,
        faction: Faction::Heroes,
        stats: Body::Fighter.base_stats(),
        loadout: Body::Fighter.default_loadout(),
        combat_spec: None,
        spawn: Vec2::ZERO,
    }
}

/// Builds, reserves and installs, or installs nothing.
///
/// **It installs any model with articulated columns, and the name is a wart
/// rather than a restriction.** The reservation, the map and the furniture are
/// all questions about a three-dimensional world rather than about which of them
/// it is. `Articulated` is simply the first model that had one; renaming the
/// vocabulary the older models left behind is the step of this session that
/// touches every crate at once, and it is not this file's.
///
/// Split out of [`init`] so the fail-closed arm is reachable from a test: the
/// shipped fixture is valid at 64 slots by construction -- the entity limit is
/// the same number -- so the only way to see this refuse is to hand it a
/// scenario the sim rejects, which no export can do.
fn install_articulated(scenario: &Scenario, seed: u64) {
    let installed = Sim::try_on(scenario, seed).and_then(|mut fresh| {
        // Here, while `fresh` is still a local, for the whole of the argument
        // [`install_boundary_fixture`] makes: one line further down the world is
        // reachable through `SIM` and the page is entitled to keep a typed
        // array over what `publish` hands it, and a contact vector that grew
        // after that moment would detach every one of them.
        fresh.world.try_reserve_contact_slots(MAX_UNITS).ok()?;
        fresh.contact_high_water = MAX_UNITS as u32;
        // The floor plan and the furniture, exactly as `init` writes them --
        // unlike the boundary fixture's two-body duel this *is* a room, and
        // a page that opened it would otherwise draw the last level's masonry.
        // Written only on the success path: a buffer describing a world that
        // was not installed is worse than a stale one, because the frame beside
        // it publishes a zeroed header and the two would disagree.
        write_map(&fresh.world);
        write_furniture(&fresh.world, &fresh.torches);
        Some(fresh)
    });
    SIM.with(|sim| *sim.borrow_mut() = installed);
    publish();
}

/// How many articulated rows the running world's contact vectors are reserved
/// for, or `0` before the first `init` and on any Legacy world.
///
/// Nothing on the page calls this. It exists so the browser's no-growth proof
/// can tell a reserved world from an unreserved one instead of assuming the
/// reservation happened, which is the one thing that test cannot otherwise see:
/// a `Vec`'s capacity is invisible from JavaScript, and wasm linear memory
/// standing still is equally consistent with "reserved once, up front" and with
/// "nothing has grown it *yet*". This is the difference between those two.
///
/// It reports what the call that opened this world reserved -- one of [`init`],
/// [`init_embodied_test`] or [`Sim::descend`] -- rather
/// than what the world holds, because the world deliberately does not publish
/// the second: contact capacity is not authoritative state and
/// `try_reserve_contact_slots` forbids reading it back as if it were.
///
/// The two can disagree in exactly one case, and it is worth naming rather than
/// pretending otherwise. Both `init` exports install no world at all when the
/// reservation refuses, so for them a nonzero reading and a reserved world are
/// the same fact. `Sim::descend` has nowhere to fall back to and installs
/// the floor anyway, reporting `0`; so a zero on an Articulated world means
/// "this floor's vectors are not reserved", which is precisely the thing a
/// no-growth proof needs to be able to see.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn contact_high_water() -> u32 {
    with_sim(0, |sim| sim.contact_high_water)
}

/// How many ticks of the running world have spent every contact group ordinal,
/// or `0` before the first `init` and on any Legacy world.
///
/// Nothing on the page calls this either, and it is here for the same reason the
/// reservation above is: the browser's no-growth proof has to be able to say it
/// *reached* the cap path rather than hoping its drive still does. The cap tick
/// is the one shape whose scratch use is maximal -- every ordinal spent, the
/// entity closure walked to a fixed point, the last-safe pose restored on every
/// frozen row -- so it is the tick a per-tick allocation would hide in, and a
/// drive that quietly stopped clinching would otherwise keep passing while
/// covering none of it.
///
/// Unlike the reservation, this *is* authoritative state: it is the global
/// `cap_hits` the ArticulatedV1 digest writes after the actuator rows. Reading
/// it is a copy of one `u32` and mutates nothing.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn contact_cap_hits() -> u32 {
    with_sim(0, |sim| sim.world.contact_cap_hits())
}

/// Walks one monster into the running room. Answers how many monsters are now
/// alive, or `0` if nothing arrived -- there is no world yet, or the frame is
/// already carrying [`MAX_UNITS`] bodies.
///
/// `kind_code` is the same small integer the frame's `kind` column uses
/// (`2` a Brute, `3` a Skitterer); anything unrecognised is a Skitterer. The
/// caller chooses *what*, and deliberately not *where*: a position invented in
/// JavaScript would be a float walking into simulation state through the front
/// door, and the same page would then produce a different fight on every
/// machine. The point is rolled on this side from the world's own seed.
///
/// Nothing else has to be done to start the fight. `UtilityPolicy` engages the
/// moment an enemy is visible, and it does so in preference to the player's
/// standing order -- so the character breaks off whatever walk it was on and
/// turns to meet this. That is the thesis of the project, not a bug in the
/// order channel.
///
/// The newcomer does not decide until the tick *after* this one, because
/// `World::refresh_pending` runs at the end of a step. On screen that reads as
/// the thing pausing in the doorway, which is the correct impression.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn spawn_monster(kind_code: u32, primary: u32, secondary: u32) -> u32 {
    let body = kind_from_code(kind_code);
    let loadout = loadout_from_codes(body, primary, secondary);
    let standing = with_sim(0, |sim| {
    // **An installed arena refuses this, and the reason is the arena's whole
    // claim.** `arena_fingerprint` is an identity for the fight, published so a
    // page can say which configuration produced a recording and so
    // `a_scripted_arena_fight_in_wasm_matches_the_same_fight_in_lab` can compare
    // two runs of the same one. Anything that changes the world without moving
    // that word makes the identity a lie -- and this one does: it answers a
    // count, the state hash moves, and the fingerprint does not.
    //
    // It became reachable in the session that made spawning work again on a
    // world with articulated columns. Before that it failed for an unrelated
    // reason -- `try_spawn` refused every spec built here -- so the arena was
    // protected by a bug rather than by a rule, which is why the rule is written
    // here now.
        if sim.arena.is_some() {
            return 0;
        }
        sim.spawn_monster(body, loadout)
    });
    publish();
    standing
}

/// Walks a replacement character into the room. Answers `1` if one arrived and
/// `0` if not -- there is no world, a character is still standing, or the frame
/// is already carrying [`MAX_UNITS`] bodies.
///
/// `kind_code` is `0` for a Fighter and `1` for a Rogue; anything else is a
/// Fighter. Which is worth choosing rather than defaulting: a Rogue thinks every
/// ten ticks instead of twelve and sees 14.4 units instead of 9.6, but falls
/// over at 8 health instead of 12. The same policy runs both, and watching the
/// same room go differently is the clearest demonstration this page has that
/// stats are wired into the AI rather than into a damage number.
///
/// The room is left exactly as it was found: the monsters that killed the last
/// character are still standing, still where they were, and still remember what
/// they were doing. This is a replacement, not a restart -- [`init`] is the
/// restart, and the page keeps both because they answer different questions.
///
/// The newcomer arrives under no order at all, and does not decide until the
/// tick after this one. See [`Sim::swap_in_hero`].
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn swap_in_hero(kind_code: u32, primary: u32, secondary: u32) -> u32 {
    let body = hero_from_code(kind_code);
    let loadout = loadout_from_codes(body, primary, secondary);
    let arrived = with_sim(0, |sim| sim.swap_in_hero(body, loadout));
    publish();
    arrived
}

/// Advances `frames` ticks and republishes the frame.
///
/// The caller owns the pacing, and must clamp it: this runs exactly as many
/// ticks as it is asked for, so a client that hands over an unbounded catch-up
/// count after a long tab-switch will block for as long as that takes. Capping
/// the number here instead would make the sim's history depend on how the
/// browser scheduled its frames, which is the one thing a deterministic sim
/// must never do.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn step(frames: u32) {
    with_sim((), |sim| sim.advance(frames));
    publish();
}

/// Address of the frame buffer in linear memory.
///
/// Stable for the life of the module, because the buffer is a fixed array. The
/// client should re-read it every frame regardless -- the discipline is what
/// keeps the page correct if this ever becomes a `Vec`.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn frame_ptr() -> u32 {
    // A pointer is produced and immediately turned into a number. It is never
    // dereferenced on this side, which is why this crate has no `unsafe {}` in
    // it. On wasm32 a `usize` is 32 bits, so nothing is lost.
    FRAME.with(|frame| frame.borrow().as_ptr() as usize as u32)
}

/// How many `f32`s of the buffer are live: `HEADER_LEN + UNIT_STRIDE *
/// unit_count`.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn frame_len() -> u32 {
    FRAME_LEN.with(Cell::get)
}

/// Ticks simulated since [`init`].
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn tick() -> u32 {
    SIM.with(|sim| sim.borrow().as_ref().map_or(0, |sim| sim.world.tick()))
}

/// Low half of `World::state_hash`. Split because a `u64` has no C ABI worth
/// relying on across this boundary and an `f32` slot would lose most of it.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn state_hash_lo() -> u32 {
    state_hash() as u32
}

/// High half of `World::state_hash`.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn state_hash_hi() -> u32 {
    (state_hash() >> 32) as u32
}

#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn state_digest_lo() -> u32 { state_digest().value as u32 }

#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn state_digest_hi() -> u32 { (state_digest().value >> 32) as u32 }

#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn state_digest_domain() -> u32 { state_digest().domain as u32 }

#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn state_digest_schema() -> u32 { state_digest().schema as u32 }

#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn combat_geometry_digest_lo() -> u32 { fx::combat_geometry_digest() as u32 }

#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn combat_geometry_digest_hi() -> u32 { (fx::combat_geometry_digest() >> 32) as u32 }

// -------------------------------------------- the behavioral contact corpus
//
// Four exports that touch no world and no frame. They exist so
// `tools/wasm_check.js` can rebuild all 3,548 bytes of the contact solver's
// behavioral proof in JavaScript and compare them against what this target
// produces -- see `docs/reference/contact-solver.md`, "Behavioral corpus V2".
// A digest alone would say only *that* the two disagree; a byte accessor says
// which field, which is the difference between a bug report and a bisect.
//
// A byte at a time rather than a pointer and a length, because the corpus is
// the one buffer in this crate that is not a fixed array: building it allocates,
// and an allocation can grow linear memory and detach every typed array the
// caller is holding. Handing back integers cannot.

thread_local! {
    /// Built once, on first touch. `sim::contact_behavior_corpus` runs the whole
    /// collector and resolver over all seven cases, and the check below reads it
    /// 3,548 times -- recomputing per byte would run the solver 3,548 times.
    ///
    /// An error answers an empty corpus rather than trapping: the length export
    /// then reads zero, which is a failed assertion on the far side with the
    /// pinned number in the message, and a wasm trap is not.
    static CONTACT_BEHAVIOR_CORPUS: Vec<u8> =
        sim::contact_behavior_corpus().unwrap_or_default();
}

/// How many bytes [`contact_behavior_corpus_byte`] will answer. Pinned at 3,548
/// by the reference and by the native fixture in `crates/sim`.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn contact_behavior_corpus_len() -> u32 {
    CONTACT_BEHAVIOR_CORPUS.with(|corpus| corpus.len() as u32)
}

/// One byte of the corpus, widened. Answers **256** -- a value no byte can take,
/// so the caller need not treat any in-range byte as a sentinel -- when `index`
/// is past the end.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn contact_behavior_corpus_byte(index: u32) -> u32 {
    CONTACT_BEHAVIOR_CORPUS.with(|corpus| {
        corpus.get(index as usize).map_or(256, |&byte| u32::from(byte))
    })
}

/// Low half of FNV-1a-64 over the corpus bytes, split for the same reason
/// [`state_hash_lo`] is.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn contact_behavior_digest_lo() -> u32 { contact_behavior_digest() as u32 }

/// High half of [`contact_behavior_digest_lo`]'s digest.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn contact_behavior_digest_hi() -> u32 { (contact_behavior_digest() >> 32) as u32 }

fn contact_behavior_digest() -> u64 {
    CONTACT_BEHAVIOR_CORPUS.with(|corpus| {
        let mut hash = fx::Hash64::new();
        hash.write_bytes(corpus);
        hash.finish()
    })
}

// **The articulated submission stood here: four exports, and they are gone.**
// `submitted_command_ptr`, `submitted_command_len`,
// `submitted_command_layout_version` and `submit_articulated` staged one
// `ARTICULATED_COMMAND_V1` into a fixed scratch and handed it to
// `World::submit_articulated_v1`. There is one grammar left, so the four
// exports below are the whole of what a page may submit -- and the *absence*
// of these four is checked rather than assumed: `tools/wasm_check.js` keeps a
// list of removed names and asserts the module does not answer to them, which
// is the only form of "this channel is gone" a list of present names cannot
// state.
//
// **What went with them is a refusal, and that is the honest accounting.**
// `submit_articulated` answered `WRONG_MODEL` when an embodied world was
// handed articulated bytes, and both targets drove that direction. The page
// cannot make the mistake any more, so the guard has nothing left to guard;
// the module refusing to export the name is what replaces it.

// --------------------------------------------------- the embodied submission
//
// The twin of the four exports above, on a buffer, a layout version and a
// width of its own. Everything else is shared on purpose: the argument order,
// the packed answer and every reason byte in it, so a host that has learned one
// of these two exports has learned both.

/// The embodied submitted-command scratch: the same four-byte envelope --
/// layout version, the command kind, one reserved zero -- over a payload of its
/// own width.
///
/// **Derived from [`sim::EMBODIED_PAYLOAD_BYTES`] where
/// the deleted `SUBMITTED_COMMAND_BYTES` was derived from
/// `ARTICULATED_PAYLOAD_BYTES`, and the two widths being equal was never a
/// reason to read one constant twice.**
/// `ARTICULATED_COMMAND_HASH`, `EXACT_TRAJECTORY_STATE_DIGEST` and
/// `LIFTED_COULOMB_SOLVER_DIGEST` are all taken over the articulated width, and
/// all three have already moved together, twice, because a session appended a
/// field to that payload. **They are now 61 and 57**: the swing plane appended
/// four bytes here and none of those three moved, which is what the two
/// constants were separated for.
pub const EMBODIED_COMMAND_BYTES: usize = 4 + sim::EMBODIED_PAYLOAD_BYTES;

thread_local! {
    /// **It was a second fixed array rather than a second reader of the
    /// articulated scratch**, for [`EMBODIED_COMMAND_BYTES`]' reason: one buffer
    /// would have to be as wide as whichever payload grew last, and the whole
    /// point of the second width was that the two could grow apart. That is what
    /// made the articulated one deletable without touching this one.
    static EMBODIED_COMMAND: RefCell<[u8; EMBODIED_COMMAND_BYTES]> =
        const { RefCell::new([0; EMBODIED_COMMAND_BYTES]) };
}

/// Fixed versioned input buffer for one embodied submitted command.
///
/// Stable for the life of the module: a fixed array never moves and never grows
/// linear memory,
/// so a view the host keeps over it is never detached by anything in here.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn embodied_command_ptr() -> u32 {
    EMBODIED_COMMAND.with(|buffer| buffer.borrow().as_ptr() as usize as u32)
}

#[allow(unsafe_code)]
#[no_mangle]
pub const extern "C" fn embodied_command_len() -> u32 { EMBODIED_COMMAND_BYTES as u32 }

/// `2`, and the coincidence it used to warn about is worth keeping now that
/// only one side of it is left.
///
/// `submitted_command_layout_version` published the articulated envelope's own
/// `2` beside this one, **for an unrelated reason**: that one reached layout 2
/// when a release verb widened its payload to 53, and this one reached layout 2
/// when a swing plane widened its own to 57. Two histories on the same number,
/// over payloads four bytes apart. This line recorded the opposite coincidence
/// -- `1` against `2` -- before that, which is the same warning from the other
/// side, and it is why a host must never read either number off the other.
#[allow(unsafe_code)]
#[no_mangle]
pub const extern "C" fn embodied_command_layout_version() -> u32 {
    sim::EMBODIED_COMMAND_LAYOUT_VERSION as u32
}

/// The actuator's physical minimum desired reach, as signed 16.16 raw units.
///
/// A host clamps the virtual hand to this value before it encodes a command.
/// Publishing the simulator's owner keeps that clamp from becoming a second
/// typed quarter on the other side of the boundary. This is a scalar
/// capability and changes neither the command width nor its layout version.
#[allow(unsafe_code)]
#[no_mangle]
pub const extern "C" fn arm_min_reach_raw() -> u32 {
    sim::ARM_MIN_REACH_RAW as u32
}

#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn submit_embodied(entity_index: u32, entity_generation: u32) -> u32 {
    use sim::{CommandV1, SubmitOutcome};
    let bytes = EMBODIED_COMMAND.with(|buffer| *buffer.borrow());
    let layout = u16::from_le_bytes([bytes[0], bytes[1]]);
    // Kind `2` where the articulated envelope demands `1`. The byte is
    // `SubmittedCommand`'s frozen wire discriminant, so a payload that says it
    // is articulated is malformed here rather than quietly accepted under a
    // second name -- which is the whole reason the tag is in the envelope.
    if layout != sim::EMBODIED_COMMAND_LAYOUT_VERSION || bytes[2] != 2 || bytes[3] != 0 {
        return submit_result(0, 1, 0, 0);
    }
    let payload: &[u8; sim::EMBODIED_PAYLOAD_BYTES] =
        bytes[4..EMBODIED_COMMAND_BYTES].try_into().unwrap();
    let id = EntityId::new(entity_index, entity_generation);
    with_sim(submit_result(0, 3, 0, 0), |sim| {
        // **A model check stood here, ahead of the structural one, and it went
        // with the second model.** Its ordering was the whole of it: a module
        // that could not act on an embodied command at all owed that answer even
        // when the command it was handed was also malformed, so a boundary that
        // read the bytes first would have answered `1` and named the payload for
        // what was a model mismatch. The ordering is written down rather than
        // deleted because it is what a *third* model would have to decide again.
        // The reason byte is not reused either: `2` still means "wrong model" in
        // the packed word, and the `WrongModel` arm below still answers it for a
        // rejection `sim` can still spell.
        if sim.world.view(id).is_none() {
            return submit_result(0, 3, 0, 0);
        }
        if CommandV1::validate_payload_structure(payload).is_err() {
            return submit_result(0, 1, 0, 0);
        }
        let command = match CommandV1::from_payload_bytes(payload) {
            Ok(command) => command,
            Err(PayloadError::OutOfRange(field)) => {
                return match sim.world.submit_fallback(
                    id,
                    field,
                ) {
                    SubmitOutcome::Stored { .. } => submit_result(2, 4, field as u8, 0),
                    SubmitOutcome::NotStored(CommandReject::WrongModel) => submit_result(0, 2, 0, 0),
                    _ => submit_result(0, 3, 0, 0),
                };
            }
            Err(_) => return submit_result(0, 1, 0, 0),
        };
        match sim.world.submit(id, command) {
            SubmitOutcome::Stored { rejection: None, .. } => submit_result(1, 0, 0, 0),
            SubmitOutcome::Stored {
                rejection: Some(CommandReject::OutOfRange(field)), ..
            } => submit_result(2, 4, field as u8, 0),
            SubmitOutcome::Stored {
                rejection: Some(CommandReject::MissingEquipment { arm, slot }), ..
            } => submit_result(2, 5, arm as u8, slot),
            SubmitOutcome::NotStored(CommandReject::WrongModel) => submit_result(0, 2, 0, 0),
            SubmitOutcome::NotStored(CommandReject::StaleEntity) => submit_result(0, 3, 0, 0),
            _ => submit_result(0, 1, 0, 0),
        }
    })
}

const fn submit_result(outcome: u8, reason: u8, detail: u8, slot: u8) -> u32 {
    outcome as u32 | ((reason as u32) << 8) | ((detail as u32) << 16) | ((slot as u32) << 24)
}

// ------------------------------------------------------------ the checkpoint
//
// The bytes of a trained network, staged and judged. The buffer, the capacity
// and the refusal codes are up beside `ARENA_CONFIG`'s; what is here is the
// load, the read-backs, and the cross-target digest that keeps the two hosts
// honest about what those bytes mean.

/// Address of the checkpoint staging buffer in linear memory.
///
/// Stable for the life of the module, because the buffer is a fixed array --
/// [`embodied_command_ptr`]'s property and for its reason. The host obtains a
/// fresh view, writes the checkpoint's bytes, drops the view, and only then
/// calls [`load_checkpoint`] with the length it wrote.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn checkpoint_ptr() -> u32 {
    CHECKPOINT.with(|buffer| buffer.borrow().as_ptr() as usize as u32)
}

/// How many bytes [`checkpoint_ptr`] addresses.
///
/// A **capacity** and not a length, which is the one place this buffer's ABI
/// differs from [`arena_config_len`]'s: those two describe a fixed-width record
/// and every byte of them is meaningful, while a checkpoint is as long as its
/// seed list. The name follows [`pose_capacity`] rather than `arena_config_len`
/// for exactly that reason.
#[allow(unsafe_code)]
#[no_mangle]
pub const extern "C" fn checkpoint_capacity() -> u32 { CHECKPOINT_CAPACITY as u32 }

/// Whether a network is installed: `1` after a successful [`load_checkpoint`],
/// `0` before the first one.
///
/// **It was the picker's gate and is not any more.** A studio read it to decide
/// whether the `learned` entry in its policy dropdown was selectable, which was
/// the difference between an option a reader can be told about and one that
/// answers [`ARENA_NO_CHECKPOINT`] when they pick it. v2-ui-08 moved the arena
/// onto [`PolicyKind`], which has no `learned` entry, so there is no
/// dropdown row for this to grey out.
///
/// What it still answers is whether [`learned_inference_digest_lo`] is reporting
/// on a network or on nothing -- that digest is `0` with no model installed, and
/// `AGENTS.md` names `Checkpoint::from_bytes` as the pin's fifth owner precisely
/// because the digest is taken over the checkpoint that was *installed*. A
/// caller reading the digest without this is reading a zero it cannot interpret.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn checkpoint_installed() -> u32 {
    CHECKPOINT_MODEL.with(|model| u32::from(model.borrow().is_some()))
}

/// Address of the installed checkpoint's SHA-256, thirty-two bytes, or of
/// thirty-two zeroes before anything has loaded.
///
/// Stable for the life of the module, like every pointer in this ABI. See
/// [`CHECKPOINT_DIGEST`] for why a host wants it.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn checkpoint_digest_ptr() -> u32 {
    CHECKPOINT_DIGEST.with(|digest| digest.borrow().as_ptr() as usize as u32)
}

#[allow(unsafe_code)]
#[no_mangle]
pub const extern "C" fn checkpoint_digest_len() -> u32 { CHECKPOINT_DIGEST_BYTES as u32 }

/// Decodes the first `len` bytes of [`checkpoint_ptr`] and installs the network
/// they carry, answering a packed word.
///
/// ```text
/// bits  0..7   outcome: not installed 0, installed 1
/// bits  8..15  reason: CHECKPOINT_OK 0, and one code per refusal above
/// bits 16..31  detail: the weight index for CHECKPOINT_NOT_FINITE, the framing
///                  version for CHECKPOINT_UNKNOWN_FORMAT, the extra byte count
///                  for CHECKPOINT_TRAILING_BYTES, otherwise CHECKPOINT_NO_DETAIL
/// ```
///
/// **The detail is sixteen bits and not two bytes**, which is where this word
/// parts company with [`submit_result`]'s grammar. That one carries a fighter
/// and a hand, both of which are small; this one carries a weight index, and
/// [`ModelShape::CURRENT`] has 3,858 of them. Splitting an index across two
/// fields that mean different things elsewhere would be worse than saying so.
///
/// # It installs nothing on any failure
///
/// The previous network stays installed and its digest stays published, which
/// is [`arena_start`]'s rule for the same reason: a page that could not load a
/// second fighter is still able to run the first. **And it never traps** -- a
/// panic behind `pub extern "C"` poisons the wasm instance for the life of the
/// page, so a corrupt fetch would cost a reload rather than a message.
/// [`Checkpoint::from_bytes`] is total by construction and the only arithmetic
/// here is a bounds check.
///
/// A caller that wants to know whether the file it just fetched is the one the
/// trace was recorded against compares [`checkpoint_digest_ptr`] afterwards; the
/// bytes are the same SHA-256 `lab trace` writes into its header.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn load_checkpoint(len: u32) -> u32 {
    if len as usize > CHECKPOINT_CAPACITY {
        return checkpoint_result(0, CHECKPOINT_TOO_LONG, CHECKPOINT_NO_DETAIL);
    }
    // Decoded straight out of the staging buffer under one borrow. Unlike
    // `ARENA_CONFIG` this is not copied into a local first: 32 KiB on the stack
    // is a stack this module has no reason to want, and `from_bytes` is a pure
    // reader that cannot call back into anything holding the same `RefCell`.
    let decoded = CHECKPOINT.with(|buffer| Checkpoint::from_bytes(&buffer.borrow()[..len as usize]));
    let checkpoint = match decoded {
        Ok(checkpoint) => checkpoint,
        Err(error) => {
            let (reason, detail) = checkpoint_refusal(&error);
            return checkpoint_result(0, reason, detail);
        }
    };
    // The file's own last thirty-two bytes, and reading them back is not
    // trusting the file: `from_bytes` refuses unless they are the SHA-256 of
    // everything in front of them, so by this line the recorded digest and the
    // computed one are the same bytes. Copied out rather than recomputed
    // because `Checkpoint::to_bytes` would allocate a second 15 KB of the file
    // to hash a number that is already sitting there.
    //
    // `rchunks_exact` rather than `len - 32`, and the difference is the whole of
    // what "it never traps" costs here: a subtraction is a proof obligation
    // about a `u32` a caller chose, one call inside a `pub extern "C"` export
    // away from a poisoned instance, and a reader would have to redo it. A file
    // this short cannot reach this line -- `from_bytes` answered `Ok` -- and the
    // arm that cannot be taken publishes thirty-two zeroes, which is the value
    // that already means "nothing is named" rather than a stale name.
    let mut digest = [0u8; CHECKPOINT_DIGEST_BYTES];
    CHECKPOINT.with(|buffer| {
        let bytes = buffer.borrow();
        if let Some(tail) = bytes[..len as usize].rchunks_exact(CHECKPOINT_DIGEST_BYTES).next() {
            digest.copy_from_slice(tail);
        }
    });
    CHECKPOINT_DIGEST.with(|slot| *slot.borrow_mut() = digest);
    CHECKPOINT_MODEL.with(|slot| *slot.borrow_mut() = Some(checkpoint.model));
    checkpoint_result(1, CHECKPOINT_OK, CHECKPOINT_NO_DETAIL)
}

/// `LEARNED_INFERENCE_DIGEST`, low half: FNV-1a-64 over the logits the installed
/// network produces on `learn_core`'s fixed observation corpus, or `0` when
/// nothing is installed.
///
/// **This is the session's actual result.** `Model::forward` argues that a
/// frozen checkpoint's argmax is reproducible on any host and records that the
/// claim was untested "because this repository has no second host to check it
/// on". This module is the second host, and this number is what holds the two to
/// the same logits -- logits and not argmaxes, so that a divergence which has
/// not yet crossed a decision boundary is caught before it becomes a different
/// fight.
///
/// Pinned in this file as `LEARNED_INFERENCE_DIGEST` and again in
/// `tools/wasm_check.js`, on the rule the registry states for every browser
/// golden: duplicated so that a one-sided failure diagnoses target disagreement
/// rather than a behaviour change. The corpus, the byte order and the
/// `-C target-cpu=native` caveat are on [`learn_core::digest`].
///
/// Not cached, unlike [`articulated_stream_digest_lo`], and for the reason that
/// one is: this allocates nothing, so a second call cannot grow linear memory,
/// and the answer legitimately changes when a different checkpoint is loaded.
/// **That is a measurement and not a reading of the source** --
/// `the_cross_target_digest_allocates_nothing` in
/// `crates/learn/tests/allocation.rs` puts it through the counting
/// `#[global_allocator]` this repository keeps one `unsafe` block for, because
/// the function builds sixty-four whole `Observation`s and "they are
/// `Copy` so they land on the stack" is exactly the kind of claim that stops
/// being true quietly.
/// Reading both halves therefore walks the corpus twice, and the cost of that is
/// measured rather than assumed: **84.3 to 85.8 microseconds a call** in wasm
/// under Node -- 1,317 to 1,341 nanoseconds a forward pass -- best of nine
/// across six processes pinned to logical CPU 0 at high priority, each run
/// ending with the baseline repeated as a control, which came back within 4% of
/// its own best in all six.
///
/// **Three measurements of this line disagree and the range is the honest
/// answer.** It first read 75.4-78.5 microseconds without a trailing control;
/// an adversarial re-measurement on the same machine read 91.4-102.0 and its
/// controls were worse than its bests in every run; the numbers above are a
/// third pass. What separates them is the warm-up: a long one drifts, and its
/// trailing control here read 115-125 microseconds against a best of 85.4, so
/// the best of that run is a reading of the first few seconds and not of the
/// function. Take **roughly 1.3 microseconds a forward pass, plus or minus a
/// couple of hundred nanoseconds**, and do not read a 10% difference in this
/// number as a change in the code.
///
/// The conclusion is unmoved and never depended on the third digit: against the
/// ~100 microseconds a contact-bound tick costs, and at one learned decision per
/// tick, inference is about 1% of a tick. A diagnostic a page may call without
/// thinking about it, which is what sized the corpus at sixty-four cases.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn learned_inference_digest_lo() -> u32 { learned_inference_digest() as u32 }

/// High half of [`learned_inference_digest_lo`].
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn learned_inference_digest_hi() -> u32 {
    (learned_inference_digest() >> 32) as u32
}

fn learned_inference_digest() -> u64 {
    CHECKPOINT_MODEL.with(|model| {
        model
            .borrow()
            .as_ref()
            .map_or(0, learn_core::learned_inference_digest)
    })
}

/// Packs [`load_checkpoint`]'s answer. See that export for the field order.
const fn checkpoint_result(outcome: u8, reason: u8, detail: u16) -> u32 {
    outcome as u32 | ((reason as u32) << 8) | ((detail as u32) << 16)
}

/// Which refusal a [`CheckpointError`] is, and the number that goes with it.
///
/// Exhaustive rather than `_ =>`, on [`arena_spec_refusal`]'s argument exactly:
/// a variant appended to `CheckpointError` is a failed build here and has to be
/// given a code and a sentence, rather than collapsing into whichever arm was
/// convenient.
fn checkpoint_refusal(error: &CheckpointError) -> (u8, u16) {
    match error {
        CheckpointError::Truncated { .. } => (CHECKPOINT_TRUNCATED, CHECKPOINT_NO_DETAIL),
        CheckpointError::BadMagic => (CHECKPOINT_BAD_MAGIC, CHECKPOINT_NO_DETAIL),
        // The version is the whole content of the diagnostic here -- "this build
        // writes 1 and that file says 3" is a sentence a reader can act on --
        // so it is the one refusal whose detail is the file's own claim rather
        // than a position in it.
        CheckpointError::UnknownFormat(version) => {
            (CHECKPOINT_UNKNOWN_FORMAT, saturating_detail(*version as usize))
        }
        CheckpointError::FeatureLayout { found, .. } => {
            (CHECKPOINT_FEATURE_LAYOUT, saturating_detail(*found as usize))
        }
        CheckpointError::ActionLayout { found, .. } => {
            (CHECKPOINT_ACTION_LAYOUT, saturating_detail(*found as usize))
        }
        CheckpointError::Shape { .. } => (CHECKPOINT_SHAPE, CHECKPOINT_NO_DETAIL),
        CheckpointError::WeightCount { found, .. } => {
            (CHECKPOINT_WEIGHT_COUNT, saturating_detail(*found))
        }
        CheckpointError::Digest { .. } => (CHECKPOINT_DIGEST_MISMATCH, CHECKPOINT_NO_DETAIL),
        CheckpointError::NotFinite { at } => (CHECKPOINT_NOT_FINITE, saturating_detail(*at)),
        CheckpointError::NotFiniteRecord { .. } => {
            (CHECKPOINT_NOT_FINITE_RECORD, CHECKPOINT_NO_DETAIL)
        }
        CheckpointError::TrailingBytes { extra } => {
            (CHECKPOINT_TRAILING_BYTES, saturating_detail(*extra))
        }
    }
}

/// A count or an index narrowed to the detail field, saturating one below
/// [`CHECKPOINT_NO_DETAIL`] so that "very large" and "no detail" stay different
/// answers.
fn saturating_detail(value: usize) -> u16 {
    value.min(CHECKPOINT_NO_DETAIL as usize - 1) as u16
}

// ----------------------------------------------------------------- the arena
//
// One configured duel, built from [`ARENA_CONFIG`] and run by
// [`Sim::advance_arena`]. The buffer's layout and the refusal codes are up
// beside `EMBODIED_COMMAND`'s; what is here is the parse, the install, and the
// four reads a page needs afterwards.

/// Address of the arena configuration buffer in linear memory.
///
/// Stable for the life of the module, because the buffer is a fixed array --
/// [`embodied_command_ptr`]'s property and for its reason. The host obtains a
/// fresh view, writes all [`arena_config_len`] bytes, drops the view, and only
/// then calls [`arena_start`].
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn arena_config_ptr() -> u32 {
    ARENA_CONFIG.with(|buffer| buffer.borrow().as_ptr() as usize as u32)
}

#[allow(unsafe_code)]
#[no_mangle]
pub const extern "C" fn arena_config_len() -> u32 { ARENA_CONFIG_BYTES as u32 }

#[allow(unsafe_code)]
#[no_mangle]
pub const extern "C" fn arena_config_layout_version() -> u32 {
    ARENA_CONFIG_LAYOUT_VERSION as u32
}

/// Builds the configured duel at `seed`, installs it, and answers a packed word.
///
/// ```text
/// bits  0..7   outcome: not started 0, started 1
/// bits  8..15  reason: ARENA_OK 0, and one code per refusal above
/// bits 16..23  the fighter the refusal is about, or ARENA_WHOLE_CONFIG
/// bits 24..31  the hand the refusal is about; the policy code for an
///                  unavailable policy; otherwise ARENA_WHOLE_CONFIG
/// ```
///
/// # Validation order is normative
///
/// [`submit_embodied`]'s contract in the same words, because the first
/// failure chooses the diagnostic and a page that shows one message must be able
/// to predict which:
///
/// 1. the layout version and the header's reserved byte;
/// 2. the fighter count;
/// 3. each fighter in index order -- its reserved byte, its control byte, its
///    anatomy, its policy code, whether that policy can be built, then hand
///    `0` and hand `1`;
/// 4. whether this build can honour each control byte, in fighter index order.
///    A step of its own rather than part of step 3, because it is the only one
///    that is a fact about the *build* rather than about the buffer -- and it
///    is the step arena-05 deletes whole;
/// 5. `Scenario::duel_from`, which is where every [`sim::CombatSpecError`] a
///    control can reach comes from;
/// 6. the scenario fingerprint;
/// 7. the world construction;
/// 8. the contact reservation.
///
/// # It installs nothing on any failure
///
/// Every refusal above returns before `SIM` is touched, and the world is built
/// as a local and reserved while it is still a local -- [`install_articulated`]'s
/// pattern exactly. Two hard reasons, neither of them tidiness:
///
/// `Scenario::fingerprint` **panics** on an invalid construction, so
/// `try_fingerprint` is mandatory rather than preferable. And a trap behind
/// `pub extern "C"` poisons the wasm instance for the life of the page -- linear
/// memory may be halfway through a mutation and a `RefCell` may be left borrowed
/// -- so a bad slider value would cost a reload rather than a message.
///
/// A refusal also leaves the *previous* world standing and does not republish.
/// That is the difference from [`init`], which is a call that says
/// "start over" and therefore owes an empty room when it cannot; this one says
/// "start this fight", and a page that could not is still watching the last one.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn arena_start(seed: u32) -> u32 {
    // Copied whole into a local before a single byte is read, on
    // [`submit_embodied`]'s argument: the caller has dropped its view by now
    // and nothing below may depend on the buffer still holding what it did.
    let bytes = ARENA_CONFIG.with(|buffer| *buffer.borrow());
    match install_arena(&bytes, u64::from(seed)) {
        Ok(()) => submit_result(1, ARENA_OK, ARENA_WHOLE_CONFIG, ARENA_WHOLE_CONFIG),
        Err(refusal) => refusal.packed(),
    }
}

/// Low half of the installed configuration's [`Scenario::try_fingerprint`], or
/// `0` when no arena is installed.
///
/// Split in two halves for the reason [`state_hash_lo`] is: a `u64` has no
/// crossing of its own in this ABI.
///
/// **This is what a recorded fight is named by.** A trace that does not carry
/// the fingerprint of the configuration it came from is a fight nobody can
/// reproduce -- and the number is a function of the configuration and of nothing
/// else, which `the_arena_fingerprint_is_stable_for_a_configuration` in
/// `crates/sim` is what says. It can never be the `articulated-duel-v1` pin: a
/// runtime scenario is named `configured-duel-v1`, deliberately, so that the two
/// cannot be confused even when every other byte agrees.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn arena_fingerprint_lo() -> u32 { arena_fingerprint() as u32 }

/// High half of [`arena_fingerprint_lo`].
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn arena_fingerprint_hi() -> u32 { (arena_fingerprint() >> 32) as u32 }

fn arena_fingerprint() -> u64 {
    with_sim(0, |sim| sim.arena.as_ref().map_or(0, |arena| arena.fingerprint))
}

/// Which policy a side is running, as an [`PolicyKind::code`], or
/// [`ARENA_NO_POLICY`] when this world is not an arena.
///
/// `0` is `neutral` and a perfectly ordinary answer, so absence needs a value no
/// code can take rather than a zero -- the same reason [`POLICY_KIND_UNKNOWN`]
/// is `u32::MAX`.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn arena_policy(faction_code: u32) -> u32 {
    with_sim(ARENA_NO_POLICY, |sim| match sim.arena.as_ref() {
        Some(arena) => arena.kinds[faction_from_code(faction_code).index()].code(),
        None => ARENA_NO_POLICY,
    })
}

/// Who is driving a side -- [`ARENA_CONTROL_POLICY`] or [`ARENA_CONTROL_HUMAN`]
/// -- or [`ARENA_NO_CONTROL`] when this world is not an arena.
///
/// **A read-back and not a report.** [`arena_start`] is the only thing that
/// installs a duel and the control byte it took is the byte that fight is
/// running, so a recorder that labels a recording with what it *sent* is
/// labelling it with an intention. `arena_policy` next door has been the
/// recorder's read-back since v2-ui-05 for that reason and this is the same
/// check on the byte beside it.
///
/// A human-controlled side answers [`ARENA_CONTROL_HUMAN`] and a policy side
/// answers [`ARENA_CONTROL_POLICY`]. Keeping the read-back beside
/// [`arena_policy`] lets a recorder label the fight that was installed rather
/// than the request it meant to install.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn arena_control(faction_code: u32) -> u32 {
    with_sim(ARENA_NO_CONTROL, |sim| match sim.arena.as_ref() {
        Some(arena) => u32::from(arena.controls[faction_from_code(faction_code).index()]),
        None => ARENA_NO_CONTROL,
    })
}

/// The installed body's authoritative decision cadence in ticks, or `0` when
/// this world is not an arena.
///
/// This is retained on [`Arena`] rather than re-read from the live world so the
/// metadata remains a fact about the installed fixture after either body dies.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn arena_decision_period(faction_code: u32) -> u32 {
    with_sim(0, |sim| match sim.arena.as_ref() {
        Some(arena) => arena.decision_periods[faction_from_code(faction_code).index()],
        None => 0,
    })
}

/// The whole of [`arena_start`] except the packing, so that every exit is a
/// `?` and no path can install half a world.
fn install_arena(bytes: &[u8; ARENA_CONFIG_BYTES], seed: u64) -> Result<(), ArenaRefusal> {
    let layout = u16::from_le_bytes([bytes[ARENA_HEADER_LAYOUT], bytes[ARENA_HEADER_LAYOUT + 1]]);
    if layout != ARENA_CONFIG_LAYOUT_VERSION || bytes[ARENA_HEADER_RESERVED] != 0 {
        return Err(ArenaRefusal::whole(ARENA_UNKNOWN_LAYOUT));
    }
    if usize::from(bytes[ARENA_HEADER_FIGHTERS]) != ARENA_FIGHTERS {
        return Err(ArenaRefusal::whole(ARENA_WRONG_FIGHTER_COUNT));
    }
    // Unbounded on purpose. `max_ticks` is a `u32` field of every scenario in
    // the repository and nothing here is entitled to an opinion about how long a
    // fight may be; it reaches the fingerprint, so a host that quietly clamped
    // it would hand back a configuration that is not the one it was given.
    let max_ticks =
        u32::from_le_bytes(bytes[ARENA_HEADER_MAX_TICKS..][..4].try_into().unwrap());

    let (fighter_a, kind_a, policy_a, control_a) = parse_arena_fighter(bytes, 0)?;
    let (fighter_b, kind_b, policy_b, control_b) = parse_arena_fighter(bytes, 1)?;
    let primary = [primary_arm_of(&fighter_a), primary_arm_of(&fighter_b)];
    // **The control bytes stop here.** `DuelConfigV1` has no room for one and
    // must not grow one: it is what `Scenario::duel_from` reads and what
    // `arena_fingerprint_*` is taken over, so a control byte inside it would
    // make the same loadout at the same seed two different fixtures depending
    // on who was holding the keyboard.
    let config = sim::DuelConfigV1 { fighters: [fighter_a, fighter_b], max_ticks };

    let scenario = Scenario::duel_from(&config).map_err(arena_spec_refusal)?;
    // `try_fingerprint` and not `fingerprint`, even though `duel_from` has
    // already validated everything it checks. The panicking form is one call
    // inside a `pub extern "C"` export away from a poisoned instance, and "the
    // validator upstream agrees with the validator downstream" is worth having
    // as a property rather than as an assumption.
    let fingerprint = scenario.try_fingerprint().map_err(arena_fingerprint_refusal)?;

    // Everything from here is on a local, and `SIM` is written on the last line.
    let mut fresh =
        Sim::try_on(&scenario, seed).ok_or(ArenaRefusal::whole(ARENA_CONSTRUCTION_REFUSED))?;
    // Here, while `fresh` is still a local, for [`install_articulated`]'s whole
    // argument: one line further down the world is reachable through `SIM` and
    // the page is entitled to keep a typed array over what `publish` hands it,
    // and a contact vector that grew after that moment would detach every one.
    fresh
        .world
        .try_reserve_contact_slots(MAX_UNITS)
        .map_err(|_| ArenaRefusal::whole(ARENA_RESERVATION_REFUSED))?;
    fresh.contact_high_water = MAX_UNITS as u32;

    // The orders the lab's runner sets, and inert here exactly as deliberately:
    // an articulated observation has no order column, so no articulated policy
    // can read one. They are still world inputs and they still reach
    // `World::state_hash`, so a driver that skipped them would fingerprint a
    // different world from the one `lab` fingerprints for the same seed --
    // which is the whole claim of
    // `a_scripted_arena_fight_in_wasm_matches_the_same_fight_in_lab`.
    let orders = RunConfig::default().orders;
    fresh.world.set_order(Faction::Heroes, orders[0]);
    fresh.world.set_order(Faction::Monsters, orders[1]);
    // And the objectives back off, for the same reason from the other end.
    // [`Sim::try_open`] sets `Order` and `Hunt` because a page's floor is a
    // dungeon a hero walks a nav field across; a duel is two bodies six units
    // apart in an open box, and the objectives are hashed. The lab leaves them
    // at the default, so this does too.
    fresh.world.set_objective(Faction::Heroes, Objective::None);
    fresh.world.set_objective(Faction::Monsters, Objective::None);

    // A complete durable identity with no elapsed tick and no command rows.
    // The browser later joins only accepted rows and the terminal tick onto
    // this envelope; it never reconstructs a Scenario in TypeScript.
    let mut baseline = sim::Replay::new(&scenario, seed);
    baseline.record_order(0, Faction::Heroes, orders[0]);
    baseline.record_order(0, Faction::Monsters, orders[1]);
    baseline.record_objective(0, Faction::Heroes, Objective::None);
    baseline.record_objective(0, Faction::Monsters, Objective::None);
    baseline.finish(0);
    let baseline = sim::ReplayEnvelope::from_replay(baseline).encode()
        .map_err(|_| ArenaRefusal::whole(ARENA_CONSTRUCTION_REFUSED))?;

    let heroes = fresh.world.alive_ids(Faction::Heroes);
    let monsters = fresh.world.alive_ids(Faction::Monsters);
    let ids = [
        heroes.first().copied().ok_or(ArenaRefusal::whole(ARENA_CONSTRUCTION_REFUSED))?,
        monsters.first().copied().ok_or(ArenaRefusal::whole(ARENA_CONSTRUCTION_REFUSED))?,
    ];
    let periods = ids.map(|id| {
        u32::from(fresh.world.stats(id).map_or(1, |stats| stats.decision_period()).max(1))
    });
    // Composition belongs after the world: its policy half must inherit the
    // exact reaction period of the body that was actually constructed, not a
    // second derivation from a browser anatomy code.
    let policies = [
        arena_controller(policy_a, control_a, 0, primary[0], periods[0])?,
        arena_controller(policy_b, control_b, 1, primary[1], periods[1])?,
    ];
    let controls = [control_a, control_b];
    let driven = core::array::from_fn(|side| {
        (controls[side] == ARENA_CONTROL_HUMAN).then_some(ids[side])
    });
    ARENA_INPUT.with(|inputs| *inputs.borrow_mut() = [StagedArenaInput::EMPTY; 2]);
    clear_arena_submissions();
    ARENA_ACCEPTED_COMMANDS_DROPPED.with(|dropped| dropped.set(0));
    ARENA_REPLAY_BASELINE.with(|bytes| *bytes.borrow_mut() = baseline);
    #[cfg(test)]
    ARENA_SUBMISSIONS.with(|rows| rows.borrow_mut().clear());
    fresh.arena = Some(Arena {
        policies,
        kinds: [kind_a, kind_b],
        controls,
        decision_periods: periods,
        driven,
        heroes,
        fingerprint,
        max_ticks,
    });
    // The floor plan and the furniture, on the success path only -- and a duel
    // has no furniture at all, so this is the buffer being *emptied* rather than
    // filled. A page that opened an arena over a dungeon would otherwise draw
    // the last level's doorways across an open box.
    write_map(&fresh.world);
    write_furniture(&fresh.world, &fresh.torches);
    SIM.with(|sim| *sim.borrow_mut() = Some(fresh));
    publish();
    Ok(())
}

fn primary_arm_of(fighter: &sim::DuelFighterV1) -> LimbSlot {
    let strikes = |slot: usize| fighter.hands[slot].as_ref()
        .is_some_and(|item| !matches!(item.action, sim::ActionKind::Shield));
    if strikes(LimbSlot::LeftArm as usize) && !strikes(LimbSlot::RightArm as usize) {
        LimbSlot::LeftArm
    } else {
        LimbSlot::RightArm
    }
}

/// Codec-exact submitted-command rows stored during the most recent arena
/// tick. `len` is rows; each row is tick, full entity identity, kind byte 2,
/// and the 57-byte embodied payload.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn arena_accepted_command_ptr() -> u32 {
    ARENA_ACCEPTED_COMMANDS.with(|rows| rows.borrow().as_ptr() as usize as u32)
}

#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn arena_accepted_command_len() -> u32 {
    ARENA_ACCEPTED_COMMAND_LEN.with(Cell::get)
}

#[allow(unsafe_code)]
#[no_mangle]
pub const extern "C" fn arena_accepted_command_stride() -> u32 {
    ARENA_ACCEPTED_COMMAND_STRIDE as u32
}

#[allow(unsafe_code)]
#[no_mangle]
pub const extern "C" fn arena_accepted_command_capacity() -> u32 {
    ARENA_ACCEPTED_COMMAND_CAPACITY as u32
}

#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn arena_accepted_commands_dropped() -> u32 {
    ARENA_ACCEPTED_COMMANDS_DROPPED.with(Cell::get)
}

#[allow(unsafe_code)]
#[no_mangle]
pub const extern "C" fn arena_accepted_command_layout_version() -> u32 {
    ARENA_ACCEPTED_COMMAND_LAYOUT_VERSION
}

/// The zero-tick durable ReplayEnvelope for the installed arena.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn arena_replay_baseline_ptr() -> u32 {
    ARENA_REPLAY_BASELINE.with(|bytes| bytes.borrow().as_ptr() as usize as u32)
}

#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn arena_replay_baseline_len() -> u32 {
    ARENA_REPLAY_BASELINE.with(|bytes| bytes.borrow().len() as u32)
}

/// Copies the 61-byte embodied-command scratch into one side's staged input.
///
/// Nothing is submitted and no world state changes here. The whole envelope is
/// copied and validated atomically, then only a human-controlled side receives
/// it with the world's current tick stamp. The composed host source reads its
/// navigation fields; session 06 supplies the primary-arm fields it already
/// owns. Unknown faction and policy-controlled-side refusals share
/// [`ARENA_INPUT_REFUSED`] but carry distinct detail bytes.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn arena_stage_input(faction_code: u32) -> u32 {
    let bytes = EMBODIED_COMMAND.with(|buffer| *buffer.borrow());
    let layout = u16::from_le_bytes([bytes[0], bytes[1]]);
    if layout != sim::EMBODIED_COMMAND_LAYOUT_VERSION || bytes[2] != 2 || bytes[3] != 0 {
        return submit_result(0, 1, 0, 0);
    }
    let payload: &[u8; sim::EMBODIED_PAYLOAD_BYTES] =
        bytes[4..EMBODIED_COMMAND_BYTES].try_into().unwrap();
    if CommandV1::validate_payload_structure(payload).is_err() {
        return submit_result(0, 1, 0, 0);
    }
    let command = match CommandV1::from_payload_bytes(payload) {
        Ok(command) => command,
        Err(PayloadError::OutOfRange(field)) => {
            return submit_result(0, 4, field as u8, 0);
        }
        Err(_) => return submit_result(0, 1, 0, 0),
    };
    let side = match faction_code {
        0 => Faction::Heroes.index(),
        1 => Faction::Monsters.index(),
        _ => return submit_result(0, ARENA_INPUT_REFUSED, ARENA_INPUT_UNKNOWN_FACTION, 0),
    };
    with_sim(
        submit_result(0, ARENA_INPUT_REFUSED, ARENA_INPUT_NO_ARENA, side as u8),
        |sim| {
            let Some(arena) = sim.arena.as_ref() else {
                return submit_result(0, ARENA_INPUT_REFUSED, ARENA_INPUT_NO_ARENA, side as u8);
            };
            if arena.controls[side] != ARENA_CONTROL_HUMAN {
                return submit_result(
                    0, ARENA_INPUT_REFUSED, ARENA_INPUT_POLICY_CONTROLLED, side as u8,
                );
            }
            let staged = StagedArenaInput { tick: sim.world.tick(), command: Some(command) };
            ARENA_INPUT.with(|inputs| inputs.borrow_mut()[side] = staged);
            submit_result(1, ARENA_OK, 0, side as u8)
        },
    )
}

fn other_arm(arm: LimbSlot) -> LimbSlot {
    match arm {
        LimbSlot::LeftArm => LimbSlot::RightArm,
        LimbSlot::RightArm => LimbSlot::LeftArm,
    }
}

fn arena_controller(
    policy: Box<dyn Policy>,
    control: u8,
    side: usize,
    primary: LimbSlot,
    period: u32,
) -> Result<Box<dyn Policy>, ArenaRefusal> {
    if control == ARENA_CONTROL_POLICY {
        return Ok(policy);
    }
    let sources: Vec<Box<dyn PartialCommandSource>> = vec![
        Box::new(HostSource::new(side, primary)),
        Box::new(CadencedEmbodiedSource::new(
            policy,
            CommandAuthority::arm(other_arm(primary)),
            period,
        )),
    ];
    ComposedController::new(sources)
        .map(|controller| Box::new(controller) as Box<dyn Policy>)
        // The two authorities above are disjoint and total by construction.
        // Still return through the export's existing total refusal rather than
        // letting a future edit poison the wasm instance with an `expect` trap.
        .map_err(|_| ArenaRefusal::whole(ARENA_CONSTRUCTION_REFUSED))
}

/// One fighter block: its description, its policy code, an instance of it, and
/// the control byte that says who drives it.
///
/// **The control byte comes back rather than being consumed here**, because it
/// is the one field of the block that is not a fact about the fight. Everything
/// else this returns feeds `Scenario::duel_from`; this rides beside them to
/// [`Arena::controls`] and reaches no simulation state at all.
fn parse_arena_fighter(
    bytes: &[u8; ARENA_CONFIG_BYTES],
    index: usize,
) -> Result<(sim::DuelFighterV1, PolicyKind, Box<dyn Policy>, u8), ArenaRefusal> {
    let base = ARENA_HEADER_BYTES + index * ARENA_FIGHTER_BYTES;
    let at = |offset: usize| i32::from_le_bytes(bytes[base + offset..][..4].try_into().unwrap());

    if bytes[base + ARENA_FIGHTER_RESERVED] != 0 {
        return Err(ArenaRefusal::fighter(ARENA_NONCANONICAL, index));
    }
    // Byte `2`, which was the other half of that reserved pair until layout 3.
    //
    // **Read here and judged in [`arena_control_available`], which is a split
    // rather than a scattering.** This function turns bytes into meaning; the
    // question of whether *this build* can honour a meaning it understood is a
    // fact about the build, and it changes in arena-05 while nothing here does.
    // Keeping the two apart is also what lets
    // `the_arena_fingerprint_does_not_change_when_a_side_is_handed_to_a_human`
    // build a human configuration at all: it needs the parse of a control this
    // build refuses to run.
    let control = match bytes[base + ARENA_FIGHTER_CONTROL] {
        ARENA_CONTROL_POLICY => ARENA_CONTROL_POLICY,
        ARENA_CONTROL_HUMAN => ARENA_CONTROL_HUMAN,
        _ => return Err(ArenaRefusal::fighter(ARENA_UNKNOWN_CONTROL, index)),
    };
    let anatomy = match bytes[base + ARENA_FIGHTER_ANATOMY] {
        0 => sim::AnatomyChoice::Fighter,
        1 => sim::AnatomyChoice::Brute,
        _ => return Err(ArenaRefusal::fighter(ARENA_UNKNOWN_ANATOMY, index)),
    };
    let code = u32::from(bytes[base + ARENA_FIGHTER_POLICY]);
    let kind = PolicyKind::from_code(code)
        .ok_or(ArenaRefusal::fighter(ARENA_UNKNOWN_POLICY, index))?;
    // **Every code this parser accepts now builds**, which is the whole of what
    // v2-ui-08 did to this line. `PolicyKind::build` returns a policy
    // rather than an `Option` -- its own comment argues why, and the argument is
    // that nothing in that registry is a checkpoint -- so the two refusals that
    // used to live between here and a running fight, `ARENA_POLICY_UNAVAILABLE`
    // and `ARENA_NO_CHECKPOINT`, have no producer left. They keep their numbers
    // and are retired by name where they are declared. What survives is
    // `ARENA_UNKNOWN_POLICY` above: a byte outside the registry is still a
    // refusal that names the offending code, which is the one thing a page
    // sending a stale saved code needs to be told.
    let mut policy = kind.build();
    // `Policy::reset`'s contract, honoured even though it is a no-op on
    // an instance built one line above. It is what stops "fresh" from quietly
    // coming to mean "whatever a stateful successor happens to construct itself
    // with" -- and `ScriptedPolicy` already carries `GroundSense`, a row
    // of per-run memory, so this is not hypothetical here the way it was on the
    // articulated side. `lab`'s matchup loop resets two policies it has just
    // built for exactly that reason.
    policy.reset();

    let mut hands = [None, None];
    let mut two_handed = false;
    for hand in 0..ARENA_HANDS {
        let (item, both) = parse_arena_hand(bytes, index, hand)?;
        hands[hand] = item;
        two_handed |= both;
    }
    let fighter = sim::DuelFighterV1 {
        anatomy,
        hands,
        two_handed,
        spawn: Vec2::new(
            Fx::from_raw(at(ARENA_FIGHTER_SPAWN_X)),
            Fx::from_raw(at(ARENA_FIGHTER_SPAWN_Y)),
        ),
    };
    Ok((fighter, kind, policy, control))
}

/// One hand block -- the item, or `None` for an empty hand, and whether it is
/// gripped by both hands.
///
/// **The geometry *kind* is derived from the action rather than carried**, which
/// is what makes the block twenty-two bytes instead of twenty-three: a shield is
/// a plate and everything else with a row is a segment. So the "sword shaped
/// like a plate" that `crates/sim`'s own tests build by hand is not expressible
/// from here, and does not need to be -- there is no control that would produce
/// one. What it must not become is a way *round* a rule: `validate_bindings`
/// classifies by geometry and never by action precisely so that a second plate
/// called something else is still a grip conflict, and that stays true whether
/// or not this parser can describe one.
fn parse_arena_hand(
    bytes: &[u8; ARENA_CONFIG_BYTES],
    index: usize,
    hand: usize,
) -> Result<(Option<sim::HandItemV1>, bool), ArenaRefusal> {
    let base = ARENA_HEADER_BYTES + index * ARENA_FIGHTER_BYTES
        + ARENA_FIGHTER_HANDS + hand * ARENA_HAND_BYTES;
    let word = |offset: usize| {
        Fx::from_raw(i32::from_le_bytes(bytes[base + offset..][..4].try_into().unwrap()))
    };
    // The one byte with a rule per hand: `1` marks a two-handed grip, the
    // right hand is the only one that may carry it (the right arm owns a `Both`
    // grip), and everything else is noncanonical exactly as it was when the
    // whole byte was reserved.
    let two_handed = match (hand, bytes[base + ARENA_HAND_TWO_HANDED]) {
        (_, 0) => false,
        (hand, 1) if hand == sim::LimbSlot::RightArm as usize => true,
        _ => return Err(ArenaRefusal::hand(ARENA_NONCANONICAL, index, hand)),
    };
    let code = bytes[base + ARENA_HAND_ITEM];
    let (mass, balance) = (word(ARENA_HAND_MASS), word(ARENA_HAND_BALANCE));
    let dimensions =
        [word(ARENA_HAND_DIMENSION_0), word(ARENA_HAND_DIMENSION_1), word(ARENA_HAND_DIMENSION_2)];
    if code == ARENA_HAND_EMPTY {
        // Every word an empty hand does not have -- including a grip marker,
        // which would be both hands gripping nothing. An empty hand whose
        // leftover dimensions still read a sword's is a buffer somebody changed
        // a dropdown on and did not finish writing, and it is much cheaper to
        // say so here than to have a reader wonder later which of the two the
        // fight used.
        if two_handed || mass != Fx::ZERO || balance != Fx::ZERO
            || dimensions.iter().any(|&v| v != Fx::ZERO)
        {
            return Err(ArenaRefusal::hand(ARENA_NONCANONICAL, index, hand));
        }
        return Ok((None, false));
    }
    let action = sim::ActionKind::from_code(u32::from(code))
        .ok_or(ArenaRefusal::hand(ARENA_UNKNOWN_ITEM, index, hand))?;
    let geometry = if matches!(action, sim::ActionKind::Shield) {
        sim::EquipmentGeometry::Shield {
            half_width: dimensions[0],
            half_height: dimensions[1],
            thickness: dimensions[2],
        }
    } else {
        if dimensions[2] != Fx::ZERO {
            return Err(ArenaRefusal::hand(ARENA_NONCANONICAL, index, hand));
        }
        sim::EquipmentGeometry::Segment { length: dimensions[0], radius: dimensions[1] }
    };
    Ok((Some(sim::HandItemV1 { action, mass, balance, geometry }), two_handed))
}

/// Which refusal a spec error is.
///
/// Exhaustive rather than `_ =>`, so that a variant appended to
/// [`sim::CombatSpecError`] is a failed build here and has to be given a number
/// and a sentence. Seven of these cannot be reached from the configuration
/// buffer today; the section above says which and why they keep codes anyway.
fn arena_spec_refusal(error: sim::CombatSpecError) -> ArenaRefusal {
    ArenaRefusal::whole(match error {
        sim::CombatSpecError::MissingTable => ARENA_MISSING_TABLE,
        sim::CombatSpecError::UnexpectedTable => ARENA_UNEXPECTED_TABLE,
        sim::CombatSpecError::UnitPresence => ARENA_UNIT_PRESENCE,
        sim::CombatSpecError::TooManyAnatomies => ARENA_TOO_MANY_ANATOMIES,
        sim::CombatSpecError::TooManyEquipment => ARENA_TOO_MANY_EQUIPMENT,
        sim::CombatSpecError::IdOrder => ARENA_ID_ORDER,
        sim::CombatSpecError::UnknownSchema => ARENA_UNKNOWN_SCHEMA,
        sim::CombatSpecError::Dimension => ARENA_DIMENSION,
        sim::CombatSpecError::Fraction => ARENA_FRACTION,
        sim::CombatSpecError::Maximum => ARENA_MAXIMUM,
        sim::CombatSpecError::MissingReference => ARENA_MISSING_REFERENCE,
        sim::CombatSpecError::LoadoutMismatch => ARENA_LOADOUT_MISMATCH,
        sim::CombatSpecError::GripConflict => ARENA_GRIP_CONFLICT,
        sim::CombatSpecError::NoEquipment => ARENA_NO_EQUIPMENT,
        sim::CombatSpecError::BowGrip => ARENA_BOW_GRIP,
        sim::CombatSpecError::UnknownAction => ARENA_UNKNOWN_ACTION,
    })
}

fn arena_fingerprint_refusal(error: sim::ScenarioFingerprintError) -> ArenaRefusal {
    match error {
        sim::ScenarioFingerprintError::InvalidCombatSpecs(error) => arena_spec_refusal(error),
        sim::ScenarioFingerprintError::NameTooLong { .. } => {
            ArenaRefusal::whole(ARENA_NAME_TOO_LONG)
        }
    }
}

/// Why [`arena_start`] refused, and what it was about.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
struct ArenaRefusal {
    reason: u8,
    fighter: u8,
    slot: u8,
}

impl ArenaRefusal {
    const fn whole(reason: u8) -> ArenaRefusal {
        ArenaRefusal { reason, fighter: ARENA_WHOLE_CONFIG, slot: ARENA_WHOLE_CONFIG }
    }

    const fn fighter(reason: u8, fighter: usize) -> ArenaRefusal {
        ArenaRefusal { reason, fighter: fighter as u8, slot: ARENA_WHOLE_CONFIG }
    }

    const fn hand(reason: u8, fighter: usize, hand: usize) -> ArenaRefusal {
        ArenaRefusal { reason, fighter: fighter as u8, slot: hand as u8 }
    }

    const fn packed(self) -> u32 {
        submit_result(0, self.reason, self.fighter, self.slot)
    }
}

/// Address of the pose buffer. Stable for the life of the module, exactly as
/// [`frame_ptr`] is and for the same reason: it is a fixed array in linear
/// memory and nothing here ever reallocates it.
///
/// **This is an authoritative-host view and must not cross to the renderer
/// unfiltered.** Every row is ground truth about a body -- its exact position,
/// what it is holding, which regions are severed -- with no perception noise and
/// no visibility filtering, for bodies the viewer may have no way of seeing.
/// Handing this array on as a snapshot would publish the position of everything
/// on the floor to anybody who opened a debugger, which is precisely the leak
/// the legacy frame's `visible` column and the worker's snapshot filter exist to
/// close. The trusted worker retains the subject and the currently visible
/// identities in canonical order, filters events whose geometry would reveal an
/// absent identity, and writes a snapshot; that filtering lands in v2-17 and
/// this pointer stays inside the worker until it does.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn pose_ptr() -> u32 {
    POSES.with(|poses| poses.borrow().as_ptr() as usize as u32)
}

/// How many pose rows are live. Rows, not words: multiply by
/// [`pose_stride`].
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn pose_len() -> u32 {
    POSE_LEN.with(|n| n.get())
}

#[allow(unsafe_code)]
#[no_mangle]
pub const extern "C" fn pose_stride() -> u32 { POSE_STRIDE as u32 }

#[allow(unsafe_code)]
#[no_mangle]
pub const extern "C" fn pose_capacity() -> u32 { MAX_POSES as u32 }

/// Rows the last publication could not fit, saturating.
///
/// Zero in every reachable case: the cap is `MAX_ENTITIES` and the
/// sim cannot hold more articulated bodies than that. It is published anyway
/// because the prefix rule is only meaningful if a reader can tell it fired,
/// and because a future producer -- a newer module against an older page -- is
/// exactly the case the defensive prefix exists for.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn poses_dropped() -> u32 {
    POSES_DROPPED.with(|n| n.get())
}

#[allow(unsafe_code)]
#[no_mangle]
pub const extern "C" fn pose_layout_version() -> u32 { POSE_LAYOUT_VERSION }

/// Address of the region buffer. Stable for the life of the module, on
/// [`pose_ptr`]'s terms exactly.
///
/// **Authoritative and unfiltered, exactly as [`pose_ptr`] is**, and the leak it
/// would be is the same one told more precisely: a capsule is where a body's
/// head and each of its limbs are standing, for bodies the viewer may have no
/// way of seeing. The worker filters this beside the pose rows it belongs to.
///
/// The section is read against `pose_len`: region row `n` describes pose row
/// `n / REGIONS_PER_BODY`, and the row carries no identity because the pose row
/// it belongs to already does. A reader checks
/// `region_len == REGIONS_PER_BODY * pose_len` before it indexes, which is the
/// one thing that can be wrong and is a single comparison -- the same shape as
/// the boot handshake refusing a frame layout it does not understand.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn region_ptr() -> u32 {
    REGIONS.with(|regions| regions.borrow().as_ptr() as usize as u32)
}

/// How many region rows are live. Rows, not words, and not bodies: this is
/// [`REGIONS_PER_BODY`] times the pose count.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn region_len() -> u32 {
    REGION_LEN.with(|n| n.get())
}

#[allow(unsafe_code)]
#[no_mangle]
pub const extern "C" fn region_stride() -> u32 { REGION_STRIDE as u32 }

#[allow(unsafe_code)]
#[no_mangle]
pub const extern "C" fn region_capacity() -> u32 { MAX_REGIONS as u32 }

/// Rows the last publication could not fit, saturating.
///
/// Zero in every reachable case, exactly as [`poses_dropped`] is and for the
/// same reason -- the capacity is the sim's own cap times the sim's own region
/// count -- with one addition this counter has and that one does not: a body
/// whose anatomy the host does not hold costs five rows here. That cannot
/// happen either, and this is what would say so: the writer carries one cursor,
/// so a skipped body shifts every later body's rows five early, and this count
/// is what makes `region_len` disagree with `REGIONS_PER_BODY * pose_len` so a
/// reader refuses the section rather than indexing a shifted one.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn regions_dropped() -> u32 {
    REGIONS_DROPPED.with(|n| n.get())
}

#[allow(unsafe_code)]
#[no_mangle]
pub const extern "C" fn region_layout_version() -> u32 { REGION_LAYOUT_VERSION }

/// Address of the live articulated-projectile buffer. Stable for the life of
/// the module and authoritative/unfiltered on [`pose_ptr`]'s terms.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn articulated_projectile_ptr() -> u32 {
    ARTICULATED_PROJECTILES.with(|projectiles| projectiles.borrow().as_ptr() as usize as u32)
}

/// How many live articulated-projectile rows are published.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn articulated_projectile_len() -> u32 {
    ARTICULATED_PROJECTILE_LEN.with(|n| n.get())
}

#[allow(unsafe_code)]
#[no_mangle]
pub const extern "C" fn articulated_projectile_stride() -> u32 {
    ARTICULATED_PROJECTILE_STRIDE as u32
}

#[allow(unsafe_code)]
#[no_mangle]
pub const extern "C" fn articulated_projectile_capacity() -> u32 {
    MAX_ARTICULATED_PROJECTILES as u32
}

#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn articulated_projectiles_dropped() -> u32 {
    ARTICULATED_PROJECTILES_DROPPED.with(|n| n.get())
}

#[allow(unsafe_code)]
#[no_mangle]
pub const extern "C" fn articulated_projectile_layout_version() -> u32 {
    ARTICULATED_PROJECTILE_LAYOUT_VERSION
}

/// Address of the stance buffer. Stable for the life of the module, on
/// [`pose_ptr`]'s terms exactly.
///
/// **Authoritative and unfiltered, exactly as [`pose_ptr`] is.** A hip bearing
/// is the feet and pelvis facing achieved by the stance actuator; forward,
/// reverse and strafe remain independent translation requests. A forced step is
/// how long the body cannot change its stance mind for. Both are published for
/// bodies the viewer may have no way of seeing, so the worker filters this
/// beside the pose rows it belongs to.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn embodied_stance_ptr() -> u32 {
    EMBODIED_STANCES.with(|stances| stances.borrow().as_ptr() as usize as u32)
}

/// How many stance rows are live. Rows, not words.
///
/// **Zero is the answer for every world but an embodied one, and it is an
/// answer rather than a silence.** A reader that treated a zero-length section
/// as a missing one could not tell an Articulated fight from a module too old to
/// have this publication at all -- which is exactly the distinction the boot
/// handshake's layout version exists to make, and this length is what makes it
/// per tick.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn embodied_stance_len() -> u32 {
    EMBODIED_STANCE_LEN.with(|n| n.get())
}

#[allow(unsafe_code)]
#[no_mangle]
pub const extern "C" fn embodied_stance_stride() -> u32 { EMBODIED_STANCE_STRIDE as u32 }

#[allow(unsafe_code)]
#[no_mangle]
pub const extern "C" fn embodied_stance_capacity() -> u32 { MAX_EMBODIED_STANCE as u32 }

/// Rows the last publication could not fit, saturating.
///
/// Zero in every reachable case, exactly as [`poses_dropped`] is and by the same
/// arithmetic -- the capacity is the pose capacity, which is the sim's own cap on
/// bodies, and a body has one stance. Published anyway for the reason that
/// counter gives: the prefix rule means nothing if a reader cannot tell that it
/// fired.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn embodied_stances_dropped() -> u32 {
    EMBODIED_STANCES_DROPPED.with(|n| n.get())
}

#[allow(unsafe_code)]
#[no_mangle]
pub const extern "C" fn embodied_stance_layout_version() -> u32 {
    EMBODIED_STANCE_LAYOUT_VERSION
}

/// Address of the combat-event buffer. Stable for the life of the module.
///
/// **Authoritative and unfiltered, exactly as [`pose_ptr`] is**, and with one
/// extra edge: a contact row names both parties by full identity and carries
/// the world-space point the blow landed at, so a row about two bodies the
/// viewer cannot see discloses both of them and where they are standing. The
/// worker filters this before anything downstream sees it.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn combat_event_ptr() -> u32 {
    COMBAT_EVENTS.with(|events| events.borrow().as_ptr() as usize as u32)
}

/// How many combat-event rows are live, across every tick of the last `step`.
///
/// **The feed is cleared per `step`, not per publication**, which is the legacy
/// event feed's rule exactly and has the same consequence: an export that
/// changes something without stepping -- a click, a spawn, a slider -- rebuilds
/// the frame and republishes these same rows unchanged. A consumer that
/// accumulates from them (a damage ledger, one impact sound per row) must key on
/// the host call that stepped rather than on the publication, or it double
/// counts every contact the player clicks through. `step(0)` clears them, which
/// is the same rule read from the other end.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn combat_event_len() -> u32 {
    COMBAT_EVENT_LEN.with(|n| n.get())
}

#[allow(unsafe_code)]
#[no_mangle]
pub const extern "C" fn combat_event_stride() -> u32 { COMBAT_EVENT_STRIDE as u32 }

#[allow(unsafe_code)]
#[no_mangle]
pub const extern "C" fn combat_event_capacity() -> u32 { MAX_COMBAT_EVENTS as u32 }

/// Rows the cap ate during the last host call, saturating.
///
/// Unlike [`poses_dropped`] this one is genuinely reachable: a busy tick can
/// produce thousands of resolutions, and a `step(8)` accumulates all eight
/// ticks' worth. The canonical prefix is kept and the tail is counted here; no
/// priority class and no lethal event reorders it.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn combat_events_dropped() -> u32 {
    COMBAT_EVENTS_DROPPED.with(|n| n.get())
}

#[allow(unsafe_code)]
#[no_mangle]
pub const extern "C" fn combat_event_layout_version() -> u32 { COMBAT_EVENT_LAYOUT_VERSION }

/// Low half of the articulated stream digest. See [`articulated_stream_digest`],
/// including why this belongs in a caller's warm-up rather than in its frame
/// loop.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn articulated_stream_digest_lo() -> u32 {
    articulated_stream_digest() as u32
}

/// High half of the articulated stream digest.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn articulated_stream_digest_hi() -> u32 {
    (articulated_stream_digest() >> 32) as u32
}

#[cfg(feature = "cartesian-recoil")]
thread_local! {
    /// This diagnostic builds three worlds and replays fifty-six prefixes. It
    /// therefore belongs in warm-up, and exactly one computation per module is
    /// part of the browser contract rather than an optimization detail.
    static EXACT_TRAJECTORY_STATE_DIGEST_VALUE: Cell<Option<u64>> = const { Cell::new(None) };
    #[cfg(test)]
    static EXACT_TRAJECTORY_STATE_DIGEST_COMPUTES: Cell<u32> = const { Cell::new(0) };
    static LIFTED_COULOMB_SOLVER_DIGEST_VALUE: Cell<Option<u64>> = const { Cell::new(None) };
    #[cfg(test)]
    static LIFTED_COULOMB_SOLVER_DIGEST_COMPUTES: Cell<u32> = const { Cell::new(0) };
}

#[cfg(feature = "cartesian-recoil")]
fn exact_trajectory_state_digest() -> u64 {
    EXACT_TRAJECTORY_STATE_DIGEST_VALUE.with(|slot| match slot.get() {
        Some(value) => value,
        None => {
            #[cfg(test)]
            EXACT_TRAJECTORY_STATE_DIGEST_COMPUTES.with(|count| count.set(count.get() + 1));
            let value = sim::exact_trajectory_state_digest();
            slot.set(Some(value));
            value
        }
    })
}

/// Low half of the feature-only exact trajectory portability digest.
#[cfg(feature = "cartesian-recoil")]
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn exact_trajectory_state_digest_lo() -> u32 {
    exact_trajectory_state_digest() as u32
}

/// High half of [`exact_trajectory_state_digest_lo`].
#[cfg(feature = "cartesian-recoil")]
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn exact_trajectory_state_digest_hi() -> u32 {
    (exact_trajectory_state_digest() >> 32) as u32
}

#[cfg(feature = "cartesian-recoil")]
fn lifted_coulomb_solver_digest() -> u64 {
    LIFTED_COULOMB_SOLVER_DIGEST_VALUE.with(|slot| match slot.get() {
        Some(value) => value,
        None => {
            #[cfg(test)]
            LIFTED_COULOMB_SOLVER_DIGEST_COMPUTES.with(|count| count.set(count.get() + 1));
            let value = sim::lifted_coulomb_solver_digest();
            slot.set(Some(value)); value
        }
    })
}

/// Low half of the feature-only lifted Coulomb solver digest.
#[cfg(feature = "cartesian-recoil")]
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn lifted_coulomb_solver_digest_lo() -> u32 {
    lifted_coulomb_solver_digest() as u32
}

/// High half of [`lifted_coulomb_solver_digest_lo`].
#[cfg(feature = "cartesian-recoil")]
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn lifted_coulomb_solver_digest_hi() -> u32 {
    (lifted_coulomb_solver_digest() >> 32) as u32
}

// ---------------------------------------------------------------- behaviour
//
// The whole reason a policy is choosable at runtime: "stats are wired into the
// AI, not into a damage number" is a claim the page can only make convincingly
// by letting you change the AI and watch the same room go differently.
//
// **The knobs are gone and the choice is not.** A legacy policy was a kind plus
// a genome, and five exports read and wrote the genes as thousandths so that no
// float crossed the wall inward. An embodied policy is a kind and nothing else,
// so what is left here is the dropdown -- which is the half that was doing the
// convincing.

/// Chooses a faction's policy: `0` heroes, anything else monsters. The policy
/// code is [`policy::PolicyKind::code`]. Answers `1` if it took, `0` if
/// the code was unknown or there is no world yet.
///
/// **The codes are a different registry from the one this export used to take**,
/// and they had to be: the legacy registry and today's [`policy::PolicyKind`]
/// never shared a code space, deliberately, because the same integer named
/// different things on each seam. A page holding a saved `2` now selects `scripted-level` where it once
/// selected `idle`, and there is no compatibility shim because there is no
/// legacy world left for one to mean anything on.
///
/// Nothing is carried across the change: an embodied policy has no genome to
/// preserve or reset, which is why the five knob exports that stood beside this
/// one were deleted rather than made to answer zero.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn set_policy(faction_code: u32, policy_code: u32) -> u32 {
    let kind = match PolicyKind::from_code(policy_code) {
        Some(kind) => kind,
        None => return 0,
    };
    let took = with_sim(0, |sim| {
        // **An arena refuses this, and answers `0` because `0` is true.**
        // [`Sim::advance_arena`] drives [`Arena::policies`] and never consults
        // `sim.policies`, so a call that reported success would leave a page
        // showing a dropdown that had done nothing.
        //
        // **The reason is no longer that the two are different registries.**
        // Until v2-ui-08 an arena's fighters ran `ArticulatedPolicyKind` and
        // this export took `PolicyKind`, and answering `1` would have
        // installed a code from one vocabulary into a slot read by the other.
        // Both are `PolicyKind` now and the refusal stands anyway, for
        // the narrower reason it always also had: an arena's pair is written
        // once, by [`arena_start`], as half of a 120-byte configuration whose
        // fingerprint names the fight. A dropdown that swapped one side mid-run
        // would leave [`arena_policy`] and [`arena_fingerprint_lo`] describing a
        // fight that is not being fought. The page changes an arena's policy the
        // way it changes its swords: by writing a configuration and calling
        // [`arena_start`] again.
        if sim.arena.is_some() {
            return 0;
        }
        sim.set_policy(faction_from_code(faction_code), kind);
        1
    });
    publish();
    took
}

/// Which policy a faction is running, as a [`policy::PolicyKind::code`],
/// or [`POLICY_KIND_UNKNOWN`] on a world this vocabulary does not describe.
///
/// **An arena answers that it does not know, and kept doing so after v2-ui-08
/// made the two registries one.** The original reason was a collision: an arena
/// ran `ArticulatedPolicyKind`, where `2` is `windmill`, and this export is
/// documented as returning `PolicyKind`, where `2` is `scripted-level`.
/// That reason is gone. What is left is that this export is the read half of
/// [`set_policy`], which an arena refuses -- so a page that got a code back here
/// would reasonably write one back there and be told `0`. [`arena_policy`] is
/// the arena's own read, it takes a faction, and it answers the same registry.
/// A second export answering the same question is only worth having while the
/// two can disagree about what a page may *do* with the answer.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn policy_kind(faction_code: u32) -> u32 {
    // The no-world default stays `0`, which is what it has always been and what
    // the page has always read before its first `init`. Widening the sentinel to
    // cover that case as well would be a second, unrelated ABI change.
    with_sim(0, |sim| {
        if sim.arena.is_some() {
            return POLICY_KIND_UNKNOWN;
        }
        sim.kinds[faction_from_code(faction_code).index()].code()
    })
}

/// The label at `index` on a faction's policy, as an address in linear memory.
///
/// **Rebased rather than deleted, and the list it indexes is one entry long.**
/// These two used to name a legacy policy's genes, one label per slider, and the
/// five exports that read and wrote those genes are gone -- `PolicyKind`
/// carries no genome, and an export answering a constant zero is a control the
/// page can still draw. What a policy here does have is a name, so index `0` is
/// [`policy::PolicyKind::name`] and every index past it is empty, which
/// is exactly how a caller discovered it had run off the gene list.
///
/// **Keyed by faction and not by policy code**, which is a real limitation and
/// not an oversight: a page can read back what a side is running but cannot
/// enumerate the registry to build a dropdown without selecting each entry in
/// turn. Enumerating it is a different export with a different first argument,
/// and adding one is an ABI change that belongs with the session that has the
/// page open.
///
/// Two exports rather than a list of names mirrored into the page, because a
/// mirror rots: rename a policy in Rust and the page keeps confidently labelling
/// the old one. The same pattern as [`frame_ptr`] -- an address is produced and
/// handed over, and the reading happens on the JavaScript side of the wall
/// where the engine bounds-checks it.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn policy_label_ptr(faction_code: u32, index: u32) -> u32 {
    with_sim(0, |sim| {
        policy_label(sim, faction_code, index).as_ptr() as usize as u32
    })
}

/// Length in bytes of the label at `index`. Zero for an index past the end,
/// which is how a caller discovers it has run off the list.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn policy_label_len(faction_code: u32, index: u32) -> u32 {
    with_sim(0, |sim| policy_label(sim, faction_code, index).len() as u32)
}

/// The one label a faction's policy has, or the empty string past it.
///
/// Shared by the pointer and the length so the two cannot disagree about where
/// the list ends -- which is the failure a caller reading `ptr` against a stale
/// `len` would see as a name with somebody else's bytes on the end of it.
fn policy_label(sim: &Sim, faction_code: u32, index: u32) -> &'static str {
    if index != 0 {
        return "";
    }
    sim.kinds[faction_from_code(faction_code).index()].name()
}

// ------------------------------------------------------------------ control

/// Hands halves of the hero to the player: [`CONTROL_FEET`] and
/// [`CONTROL_LIMB`], or'd together. `0` gives it all back.
///
/// This does not step outside the agent boundary. The host still answers with
/// an `Command` and the sim still cannot tell what produced it; what changes is
/// only *who is asked*. It does relax `DESIGN.md`'s "the player never issues a
/// per-tick command", and knowingly: an order is a command to a character, and
/// this is a character.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn set_control(mask: u32) {
    with_sim((), |sim| {
        // **Three bits, and nothing is normalised into anything else.**
        //
        // This used to fold `LIMB` into `LIMB | SLOT`, on the argument that a
        // player who could swing but not choose would watch the AI put a shield
        // in their hand mid-cut. **That argument has lost its subject twice
        // over**: the fold went because it cost the page (below), and the choice
        // it was folding went with the swap gate -- an embodied body holds both
        // items at once, so `SLOT` names which hand the pointer drives rather
        // than which item is up. See its constant.
        //
        // What the fold actually cost was the page. Eight combinations existed
        // and only five were reachable, so a row of three switches had two that
        // silently turned into a neighbour when pressed -- which is why the page
        // gave up and shipped five exclusive presets instead. Three independent
        // switches for three independent bits is the honest shape, and the
        // module is where "independent" has to be true for the page to be able
        // to say it.
        sim.control = mask & (CONTROL_FEET | CONTROL_LIMB | CONTROL_SLOT);
        // Re-ask the policy on the next tick rather than carrying an opinion
        // formed before the player took over.
        sim.hero_next_decision = sim.world.tick();
    });
    publish();
}

/// Which halves of the hero the player currently holds.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn control() -> u32 {
    with_sim(0, |sim| sim.control)
}

/// The player's live input, read on every tick that [`control`] is non-zero.
///
/// Movement arrives as thousandths of local forward and left axes. **The host
/// no longer rotates them and the sim does**: an embodied command is read in the
/// body frame, so `(1, 0)` is forward at every yaw and `World::world_move_dir`
/// performs the rotation that used to be three lines here. `turn_milli` is the
/// signed held Q/E request in `-1000..=1000`; it is clamped and becomes a
/// standing yaw *lead* rather than a per-tick step, so the page still owns no
/// duplicate floating heading -- see [`Sim::drive_hero`] for the measurement
/// that picked the lead. Aim is a raw binary angle (`0..65535`, the same
/// encoding the frame reports facings in), extension is thousandths.
///
/// **`slot` names which hand the pointer steers**, and that is a changed meaning
/// rather than a changed name. It used to name the loadout slot the player
/// wanted *in hand*, honoured only when the limb was at guard, so that the human
/// got no better deal than the AI on a swap that cost real ticks. An embodied
/// body holds both hands at once and there is no swap gate to open; what is left
/// for the bit to mean is the sentence [`Sim::input_slot`] has always carried --
/// while [`CONTROL_SLOT`] is held, the pointer steers the shield hand instead of
/// the sword. Clamped into the two hands a body has.
///
/// **`strike` is the attack button, and its three non-zero values now mean one
/// thing between them.** `0` is released, `1` was a cut from whichever side is
/// nearer, `2` counter-clockwise and `3` clockwise. An embodied arm has no
/// swing-side verb -- where the blade goes *is* the bearing it is handed -- so
/// the distinction is inert. It is left in the argument list rather than removed
/// because the list is a wire contract, and it is recorded here rather than
/// silently dropped because a control that accepts an input it cannot act on and
/// says nothing is the failure this repository has already paid for ten times.
///
/// Releasing still matters, for a different reason from the one it used to. It
/// is no longer an edge the sim re-arms on: it is a level, and while it is held
/// the arm is asked for full extension at full effort. A page that never sends
/// `0` is a page whose fighter never stops lunging.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn set_input(
    move_x_milli: i32,
    move_y_milli: i32,
    aim_raw: u32,
    reach_milli: i32,
    slot: u32,
    strike: u32,
    turn_milli: i32,
) {
    with_sim((), |sim| {
        sim.input_move = Vec2::new(
            Fx::from_ratio(move_x_milli, 1000),
            Fx::from_ratio(move_y_milli, 1000),
        )
        .clamp_length(Fx::ONE);
        sim.input_turn = Fx::from_ratio(turn_milli, 1000).clamp(-Fx::ONE, Fx::ONE);
        sim.input_aim = Angle::from_raw(aim_raw as u16);
        sim.input_reach = Fx::from_ratio(reach_milli, 1000).clamp(Fx::ZERO, Fx::ONE);
        // Clamped into the two slots a loadout has. An out-of-range request is
        // refused by the sim anyway, but clamping here keeps the stored input
        // something the HUD can read back without special cases.
        sim.input_slot = slot.min(1) as u8;
        // Anything unrecognised reads as "not attacking". The boundary is
        // hand-rolled, so every value that can cross it has to mean something.
        sim.input_strike = match strike {
            1 => Strike::Nearest,
            2 => Strike::Widdershins,
            3 => Strike::Sunwise,
            _ => Strike::None,
        };
    });
}

// ------------------------------------------------------- the registry, read-only
//
// Everything the page needs to build its own menus, so that it stops mirroring
// tables it cannot keep current. The mirror it replaces claimed a Warrior span
// of 2000 against a derived 1880 and computed torque from a model that had been
// deleted -- wrong on screen, and impossible to notice from the page.

/// Frame layout the page must be written against. See [`FRAME_LAYOUT_VERSION`].
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn frame_layout_version() -> u32 {
    FRAME_LAYOUT_VERSION
}

/// Floats per unit row. Paired with [`header_len`] so the page can walk the
/// frame without a hardcoded stride.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn unit_stride() -> u32 {
    UNIT_STRIDE as u32
}

/// Floats per arrow row, in the block that follows the units. Paired with
/// [`header_len`] and [`unit_stride`] for the same reason: three numbers the
/// page must agree with, and none of them hardcoded on its side.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn shot_stride() -> u32 {
    SHOT_STRIDE as u32
}

/// Floats per event row, in the block that follows the arrows. The fifth and
/// last of the numbers the boot handshake compares.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn event_stride() -> u32 {
    EVENT_STRIDE as u32
}

/// Floats before the first unit row.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn header_len() -> u32 {
    HEADER_LEN as u32
}

// ------------------------------------------------------------ the floor plan
//
// A buffer of its own rather than a section of the frame, because a floor plan
// changes once a level and a frame changes sixty times a second. Read it when
// [`map_revision`] moves and not otherwise.

/// Address of the tile buffer. One byte a tile, row-major, `0` open.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn map_ptr() -> u32 {
    MAP.with(|map| map.borrow().as_ptr() as u32)
}

/// How much of the tile buffer is live: `map_cols() * map_rows()`.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn map_len() -> u32 {
    MAP_SHAPE.with(|shape| shape.get().2)
}

#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn map_cols() -> u32 {
    MAP_SHAPE.with(|shape| shape.get().0)
}

#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn map_rows() -> u32 {
    MAP_SHAPE.with(|shape| shape.get().1)
}

/// Bumped whenever the tiles change, and only then. The page re-reads the
/// buffer exactly when this number moves; see [`Sim::map_revision`].
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn map_revision() -> u32 {
    with_sim(0, |sim| sim.map_revision)
}

/// A tile's size in thousandths of a world unit.
///
/// One export, and it buys the last place the page would otherwise hardcode
/// "one tile is one world unit" -- a client with that wrong draws the level at
/// the wrong scale while every test still passes.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn map_tile_size_milli() -> u32 {
    TILE_MILLI
}

// --------------------------------------------------------- what has been seen
//
// The fog of war, on a third buffer beside the tiles and read on the same terms:
// when [`vis_revision`] moves and not otherwise. Presentation throughout --
// derived from the world, never fed back into it, and absent from `state_hash`,
// which is why nothing in this section can move a golden hash.

/// Address of the visibility buffer. One byte a tile, indexed exactly as the
/// tile buffer is: `0` never seen, `1` seen earlier on this floor, `2` in
/// sight now.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn vis_ptr() -> u32 {
    VIS.with(|vis| vis.borrow().as_ptr() as u32)
}

/// How much of it is live. Always equal to [`map_len`]; separate so the page can
/// assert that rather than assume it.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn vis_len() -> u32 {
    map_len()
}

/// Bumped whenever the contents change -- which is when the hero crosses a
/// tile, and on a new level. The page re-bakes its fog paths exactly then.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn vis_revision() -> u32 {
    with_sim(0, |sim| sim.vis_revision)
}

// ------------------------------------------------------------- the furniture
//
// What stands on the floor plan and cannot be read out of it, on a fourth buffer
// beside the tiles and the fog and read on the same terms: when
// [`furniture_revision`] moves and not otherwise. Doorways and torches, on one
// buffer with a kind code, which is what the promise `world-06` made here meant.
//
// Presentation, like the fog, and for a sharper reason than the fog's. A doorway
// is a *projection* of `World::doorways`, which is simulation state that is
// hashed where it lives; a torch is not a projection of anything below the
// boundary, because nothing below the boundary has been told torches exist.
// Nothing here is fed back either way, so nothing here can move a golden hash.

/// Address of the furniture buffer. [`furniture_stride`] bytes a record,
/// `[kind, tx, ty, state]`; see `FURNITURE_STRIDE` for the format.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn furniture_ptr() -> u32 {
    FURNITURE.with(|f| f.borrow().as_ptr() as u32)
}

/// How many **records** are live -- not bytes, which is this times
/// [`furniture_stride`].
///
/// A count and a stride rather than a byte length, matching the frame's three
/// section counts: the page then reads this buffer the way it already reads unit
/// rows, and the width of a record is never a number it keeps its own copy of.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn furniture_len() -> u32 {
    FURNITURE_LEN.with(|len| len.get())
}

/// Bytes in one record. Exported for the same reason
/// [`map_tile_size_milli`] is: it is the last place the page would otherwise
/// hardcode a number that belongs to the module, and a client with it wrong
/// reads garbage while every test on this side still passes.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn furniture_stride() -> u32 {
    FURNITURE_STRIDE as u32
}

/// Bumped whenever the contents change -- a new floor, and the tick a door
/// opens. The page re-reads and re-bakes exactly then.
///
/// Separate from [`map_revision`] although the two still move together on every
/// path that exists today, because they are answers to different questions: the
/// torches are furniture the floor plan has nothing to say about, and a level
/// whose lights moved without its tiles moving would be invisible to the other
/// number.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn furniture_revision() -> u32 {
    with_sim(0, |sim| sim.furniture_revision)
}

// ------------------------------------------------------- the dungeon objects

#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn dungeon_object_ptr() -> u32 {
    DUNGEON_OBJECTS.with(|rows| rows.borrow().as_ptr() as u32)
}

#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn dungeon_object_len() -> u32 {
    DUNGEON_OBJECT_LEN.with(Cell::get)
}

#[allow(unsafe_code)]
#[no_mangle]
pub const extern "C" fn dungeon_object_stride() -> u32 { DUNGEON_OBJECT_STRIDE as u32 }

#[allow(unsafe_code)]
#[no_mangle]
pub const extern "C" fn dungeon_object_capacity() -> u32 { MAX_DUNGEON_OBJECTS as u32 }

#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn dungeon_objects_dropped() -> u32 {
    DUNGEON_OBJECTS_DROPPED.with(Cell::get)
}

#[allow(unsafe_code)]
#[no_mangle]
pub const extern "C" fn dungeon_object_layout_version() -> u32 {
    DUNGEON_OBJECT_LAYOUT_VERSION
}

/// Forces the next level and answers the new depth.
///
/// A door for the page and for `wasm_check.js`, which needs to drive a level
/// change without simulating a full clear first. The ordinary way down is to
/// kill everything and walk into the way out.
///
/// **Called on a configured duel it converts rather than refuses**, and what it
/// converts to is an ordinary generated floor with the floor loop, the floor
/// policies and no arena: `arena_policy` goes back to [`ARENA_NO_POLICY`],
/// `arena_fingerprint_*` back to `0`, [`policy_kind`] back to naming an
/// [`policy::PolicyKind`] and [`set_policy`] back to taking one. See
/// [`Sim::descend`] for why that is the answer and not a refusal.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn descend() -> u32 {
    let depth = with_sim(0, |sim| {
        sim.descend();
        sim.depth
    });
    publish();
    depth
}

/// How many actions the sim will actually run. Indices `0..action_count` are
/// what a menu should offer; the codes themselves come from [`action_code`].
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn action_count() -> u32 {
    sim::ActionKind::PLAYABLE.len() as u32
}

/// The [`sim::ActionKind`] code at menu position `index`.
///
/// Two levels of indirection on purpose: the registry is append-only and holds
/// rows the sim has no rule for yet, so "the fifth playable action" and "action
/// code 5" are different questions and the page only ever wants the first.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn action_code(index: u32) -> u32 {
    match sim::ActionKind::PLAYABLE.get(index as usize) {
        Some(kind) => kind.code(),
        None => SLOT_EMPTY,
    }
}

/// Address of an action's name in linear memory, as UTF-8 bytes. Same ptr/len
/// pattern as [`policy_label_ptr`], and for the same reason.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn action_name_ptr(code: u32) -> u32 {
    match sim::ActionKind::from_code(code) {
        Some(kind) => kind.name().as_ptr() as usize as u32,
        None => 0,
    }
}

/// Length in bytes of an action's name; `0` for a code that names nothing.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn action_name_len(code: u32) -> u32 {
    match sim::ActionKind::from_code(code) {
        Some(kind) => kind.name().len() as u32,
        None => 0,
    }
}

/// An action's [`sim::Role`] discriminant: `0` strike, `1` guard, `2` move,
/// `3` shoot. What the page draws from.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn action_role(code: u32) -> u32 {
    match sim::ActionKind::from_code(code) {
        Some(kind) => kind.role().discriminant() as u32,
        None => 0,
    }
}

/// One of an action's numbers, by index: `0` ready, `1` windup, `2` recovery,
/// `3` length in thousandths, `4` guard arc in raw angle units, `5` footspeed
/// multiplier in thousandths.
///
/// One export with a selector rather than five, because these are a *table* and
/// the page shows them as one -- and because five near-identical exports is five
/// places to forget a `from_code` guard.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn action_stat(code: u32, stat: u32) -> i32 {
    let Some(kind) = sim::ActionKind::from_code(code) else {
        return 0;
    };
    let spec = kind.spec();
    match stat {
        0 => i32::from(spec.ready),
        1 => i32::from(spec.windup),
        2 => i32::from(spec.recovery),
        3 => milli_of(spec.length),
        4 => i32::from(spec.arc),
        5 => milli_of(spec.move_bonus),
        _ => 0,
    }
}

/// How many bodies there are.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn body_count() -> u32 {
    sim::Body::ALL.len() as u32
}

/// Address of a body's name in linear memory, as UTF-8 bytes.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn body_name_ptr(code: u32) -> u32 {
    kind_from_code(code).name().as_ptr() as usize as u32
}

/// Length in bytes of a body's name.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn body_name_len(code: u32) -> u32 {
    kind_from_code(code).name().len() as u32
}

/// One of a body's attributes, by index: `0` power, `1` agility, `2` intellect,
/// `3` perception, `4` vitality. `5` and `6` are radius and mass in thousandths,
/// and `7` is sight range in thousandths.
///
/// `7` is not an attribute but a *consequence* of one, and it is here for the
/// panel that describes a body nobody has spawned yet -- there is no unit row to
/// read a `sight_range` column off until one exists. The page used to derive it
/// from `perception` with a hand-copied `(60 + 6 * p) / 10`, which is the same
/// mistake, in the same file, that the whole registry exists to have stopped
/// making. Anything already on the floor gets its sight from its own frame row.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn body_stat(code: u32, stat: u32) -> i32 {
    let body = kind_from_code(code);
    let stats = body.base_stats();
    match stat {
        0 => i32::from(stats.power),
        1 => i32::from(stats.agility),
        2 => i32::from(stats.intellect),
        3 => i32::from(stats.perception),
        4 => i32::from(stats.vitality),
        5 => milli_of(body.radius()),
        6 => milli_of(body.mass()),
        7 => milli_of(stats.sight_range()),
        _ => 0,
    }
}

// ------------------------------------------------------------------ the loadout

/// What the hero has in loadout slot `slot`, or [`SLOT_EMPTY`] for a slot that
/// is empty or does not exist.
///
/// Falls back to [`Sim::hero_spec`] with nobody standing, exactly as
/// [`hero_body`] and [`hero_stat`] do and for the same reason: the kit the next
/// character walks in with is a thing the player is choosing right then, and a
/// rail that went blank the moment it mattered would be a rail with a hole in
/// it.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn hero_loadout(slot: u32) -> u32 {
    with_sim(SLOT_EMPTY, |sim| {
        let loadout = match sim.hero().and_then(|hero| sim.world.loadout(hero)) {
            Some(live) => live,
            None => sim.hero_spec.loadout,
        };
        match loadout.slot(slot as usize) {
            Some(kind) => kind.code(),
            None => SLOT_EMPTY,
        }
    })
}

/// Which slot the hero currently has in hand.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn hero_slot() -> u32 {
    with_sim(0, |sim| {
        sim.hero()
            .and_then(|hero| sim.world.held(hero))
            .map_or(0, |(slot, _)| u32::from(slot))
    })
}

// ------------------------------------------------------ the hero, live
//
// The Hero rail edits a character that is standing in the room, mid-fight, and
// every one of these follows `set_control`'s discipline: the page sends a
// request and then **reads the value back**, because the module normalises and
// clamps and a panel that trusted its own request would drift out of step with
// the fighter it claims to describe.
//
// The clamping is not optional and it is not the page's job. An `i32` parameter
// arrives through JavaScript's `ToInt32`, which **wraps**: a slider that emitted
// 4294967296 would arrive here as 0 and a page-side clamp would never have seen
// it.

/// Ceiling on a hand-edited attribute.
///
/// Twenty, against a roster whose highest number is fourteen -- so the panel has
/// real headroom above every archetype and the extremes are still somewhere the
/// sim has been reasoned about. `Stats` is five `u8`s and the sim clamps every
/// consequence it derives (`decision_period` at intellect 19, `agility_multiplier`
/// proved safe across the whole `u8` range by `no_blade_can_outrun_the_smallest_body`),
/// so this is a *design* ceiling rather than a safety one: a fighter thinking on
/// every tick and seeing eighteen units is already past anything the roster
/// poses as a problem.
pub const MAX_ATTRIBUTE: i32 = 20;

/// One attribute out of a stat sheet, by the same selector [`body_stat`] takes:
/// `0` power, `1` agility, `2` intellect, `3` perception, `4` vitality.
fn stat_of(stats: Stats, stat: u32) -> i32 {
    match stat {
        0 => i32::from(stats.power),
        1 => i32::from(stats.agility),
        2 => i32::from(stats.intellect),
        3 => i32::from(stats.perception),
        4 => i32::from(stats.vitality),
        _ => 0,
    }
}

/// Writes one attribute of a stat sheet by selector, clamped into
/// `0..=MAX_ATTRIBUTE`. Answers `false` for a selector that names nothing, so a
/// caller can tell "refused" from "clamped".
fn set_stat_of(stats: &mut Stats, stat: u32, value: i32) -> bool {
    let value = value.clamp(0, MAX_ATTRIBUTE) as u8;
    match stat {
        0 => stats.power = value,
        1 => stats.agility = value,
        2 => stats.intellect = value,
        3 => stats.perception = value,
        4 => stats.vitality = value,
        _ => return false,
    }
    true
}

/// One of the hero's attributes, by the selector [`body_stat`] uses.
///
/// The *live* number while there is a character standing, not the body's
/// baseline: once the page can move a dial mid-fight the two stop agreeing, and
/// a panel reading the baseline would go on describing a character that no
/// longer exists.
///
/// **And the plan when there is not** -- [`Sim::hero_spec`], the sheet the next
/// character walks in wearing. That answer is not a consolation prize for a
/// missing hero, it is the thing the panel is for at that moment: the player is
/// deciding what to send in next, and a rail reading zero across the board
/// would be describing nobody at all.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn hero_stat(stat: u32) -> i32 {
    with_sim(0, |sim| {
        match sim.hero().and_then(|hero| sim.world.stats(hero)) {
            Some(stats) => stat_of(stats, stat),
            None => stat_of(sim.hero_spec.stats, stat),
        }
    })
}

/// Moves one of the hero's attributes. Answers `1` if it took.
///
/// Clamped into `0..=MAX_ATTRIBUTE` here rather than refused, so a slider
/// dragged past its end pins instead of stopping responding -- and read back
/// with [`hero_stat`] rather than assumed, which is the only way the page can
/// see the clamp happen.
///
/// Health keeps its **fraction** across the write, not its absolute value; see
/// [`World::set_stats`], where that decision lives and is argued.
///
/// **Two places, one call.** The write lands on the body in the room *and* on
/// [`Sim::hero_spec`], so an attribute is a decision about this character and
/// about the next one at the same time. Splitting those into two exports was
/// the alternative and it is the worse one: the page would have to remember to
/// call both, and the failure mode of forgetting is silent -- a sheet that
/// works all fight and evaporates on the respawn.
///
/// It therefore takes with no hero standing, where it used to refuse. What it
/// still refuses is a selector that names nothing, so a caller can tell
/// "unknown attribute" from "clamped".
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn set_hero_stat(stat: u32, value: i32) -> u32 {
    let took = with_sim(0, |sim| {
        // Refused on an arena, on [`spawn_monster`]'s argument exactly: this
        // reaches `World::set_stats`, which is one of the few setters not gated
        // on the command grammar, so it edits a configured fighter while
        // `arena_fingerprint` keeps saying which fighter it was.
        if sim.arena.is_some() {
            return 0;
        }
        let mut plan = sim.hero_spec.stats;
        if !set_stat_of(&mut plan, stat, value) {
            return 0;
        }
        sim.hero_spec.stats = plan;
        // On the living body too, when there is one. `set_stats` is what keeps
        // the health *fraction* across a change in the bar's size, so this is
        // deliberately not a copy of the plan onto the entity.
        let Some(hero) = sim.hero() else { return 1 };
        let Some(mut stats) = sim.world.stats(hero) else {
            return 1;
        };
        set_stat_of(&mut stats, stat, value);
        sim.world.set_stats(hero, stats);
        1
    });
    publish();
    took
}

/// Which body the hero is wearing, as the same small integer the frame's `kind`
/// column carries -- the one standing in the room, or the one the next
/// character walks in as when there is nobody there.
///
/// [`SLOT_EMPTY`] only when there is **no world at all**, which is the state a
/// page is in while it is still building its own DOM. It used to also mean "the
/// character has fallen", and the page used it as its aliveness test; the frame
/// already answers that question and answers it better, because it is the same
/// row the renderer is drawing from.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn hero_body() -> u32 {
    with_sim(SLOT_EMPTY, |sim| {
        match sim.hero().and_then(|hero| sim.world.view(hero)) {
            Some(view) => kind_code(view.kind),
            None => kind_code(sim.hero_spec.kind),
        }
    })
}

// **The Hero rail's body and kit rows are gone, and the reason is one line of
// `crates/sim` each.** `World::set_body` and `World::set_loadout` both refuse a
// world that is not Legacy: an articulated body's anatomy row, equipment rows,
// contact envelope and exact lattice are all resolved at *construction*, and
// rewriting the body underneath them is not something the sim has ever offered.
// So `set_hero_body` and `set_hero_loadout` could only have answered `0`
// forever, which is the shape of refusal this repository has already paid for
// ten times: a control that accepts an input it cannot act on and says nothing.
//
// The getters stay. [`hero_body`] and [`hero_loadout`] read what is standing in
// the room -- or, with nobody standing, the plan the next character walks in
// with -- and that plan is now written at the door by [`Sim::swap_in_hero`]
// rather than by the rail. Changing a character therefore means walking a new
// one in, which is what a respawn always was.

// ------------------------------------------------- the enemy spawn template
//
// What the next press of the spawn button walks into the room. A template and
// not a live unit: the Enemy rail describes something that does not exist yet,
// so editing it changes nothing until it is used -- which is the difference the
// decision record draws between the two rails.

/// Which body the spawn template is built on, as a [`kind_code`].
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn spawn_template_body() -> u32 {
    with_sim(kind_code(Body::Skitterer), |sim| {
        kind_code(sim.spawn_spec.kind)
    })
}

/// Rebuilds the spawn template on a different body. Answers `1` if it took.
///
/// Through [`UnitSpec::set_body`], so the stat sheet **and** the loadout reset
/// together. A bare `kind` write is a half-change -- the first test that tried
/// it put a Fighter's sword in a Skitterer's hand and then asserted things about
/// "a Skitterer's knife" -- and a panel that let you pick Brute and kept the
/// previous body's stats would be lying in five rows at once.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn set_spawn_template_body(code: u32) -> u32 {
    with_sim(0, |sim| {
        sim.spawn_spec.set_body(kind_from_code(code));
        1
    })
}

/// One of the spawn template's attributes, by the selector [`body_stat`] uses.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn spawn_template_stat(stat: u32) -> i32 {
    with_sim(0, |sim| stat_of(sim.spawn_spec.stats, stat))
}

/// Moves one of the spawn template's attributes, clamped into
/// `0..=MAX_ATTRIBUTE`. Answers `1` if it took.
///
/// Read back with [`spawn_template_stat`], for the same reason [`set_hero_stat`]
/// is: the clamp is on this side and invisible from the page otherwise.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn set_spawn_template_stat(stat: u32, value: i32) -> u32 {
    with_sim(0, |sim| {
        u32::from(set_stat_of(&mut sim.spawn_spec.stats, stat, value))
    })
}

/// What the spawn template carries in slot `slot`, or [`SLOT_EMPTY`].
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn spawn_template_slot(slot: u32) -> u32 {
    with_sim(SLOT_EMPTY, |sim| {
        match sim.spawn_spec.loadout.slot(slot as usize) {
            Some(kind) => kind.code(),
            None => SLOT_EMPTY,
        }
    })
}

/// Rewrites one of the spawn template's loadout slots. [`SLOT_EMPTY`] empties
/// slot 1; slot 0 cannot be emptied, because a fighter holding nothing has no
/// rule to run and `Loadout::set` already refuses it. Answers `1` if it took.
///
/// No guard-phase check to make, because there is no limb: nothing is holding
/// this yet. What the template asks for is also not the last word -- a spawn on
/// a floor with articulated columns is re-equipped at the door by
/// [`equip_articulated`], and that mapping is total.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn set_spawn_template_slot(slot: u32, action_code: u32) -> u32 {
    with_sim(0, |sim| {
        let action = if action_code == SLOT_EMPTY {
            None
        } else {
            match sim::ActionKind::from_code(action_code) {
                // A row the sim has no rule for is refused rather than handed
                // over: `PLAYABLE` is what a menu offers and this is the wall
                // behind that.
                Some(kind) if kind.is_playable() => Some(kind),
                _ => return 0,
            }
        };
        u32::from(sim.spawn_spec.loadout.set(slot as usize, action))
    })
}

/// Walks the spawn template into the running room. Answers how many monsters
/// are now alive, or `0` if nothing arrived -- the same contract
/// [`spawn_monster`] has.
///
/// The template says *what* and the module still says *where*: this reuses
/// `Sim::spawn_point` and the placement stream unchanged, because a position
/// invented in JavaScript is a float walking into simulation state through the
/// front door, and the same page would then produce a different fight on every
/// machine.
///
/// [`spawn_monster`] stays beside this rather than being folded into it. The
/// `S` and `B` hotkeys still use it, and they deliberately do **not** read the
/// template: a hotkey that quietly meant something different after you touched
/// a panel would be a worse surprise than two spawn paths.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn spawn_from_template() -> u32 {
    let standing = with_sim(0, |sim| {
        let spec = sim.spawn_spec;
        sim.walk_in(spec)
    });
    publish();
    standing
}

// ------------------------------------------------------------------ internals

/// An [`Fx`] as thousandths, rounded and saturated into an `i32`. The inward
/// counterpart of `Fx::from_ratio(milli, 1000)`.
fn milli_of(value: Fx) -> i32 {
    (value * Fx::from_int(1000)).round_int()
}

fn state_hash() -> u64 {
    SIM.with(|sim| {
        sim.borrow()
            .as_ref()
            .map_or(0, |sim| sim.world.state_hash())
    })
}

fn state_digest() -> sim::StateDigest {
    SIM.with(|sim| {
        sim.borrow().as_ref().map_or(
            sim::StateDigest { domain: sim::HashDomain::LegacyV1, schema: 1, value: 0 },
            |sim| sim.world.state_digest(),
        )
    })
}

/// Seed of the scripted articulated stream. Part of the fixture, not a sample.
const STREAM_DIGEST_SEED: u64 = 1;

/// Publications the scripted stream digests, one tick each.
///
/// Twenty, and the shape is measured rather than hoped for: ticks 0, 1, 2 and 4
/// resolve nothing at all, tick 3 resolves two rows in one publication, and
/// every tick from 5 on resolves one. So the script carries the empty ticks the
/// reference requires the digest to include, a tick with more than one row, and
/// a long tail of contact -- and `empty_ticks_enter_both_stream_digests` is
/// what fails if any of that stops being true.
const STREAM_DIGEST_TICKS: u32 = 20;

/// The two bodies the scripted stream drives, two units apart.
///
/// [`Scenario::embodied_duel`] with the spawns pulled together and swapped,
/// and nothing else touched. The shipped duel stands its fighter and its brute
/// ten units apart and would spend the whole script closing.
///
/// **It was `Scenario::articulated_duel` and the two spawn edits are unchanged
/// across the move**, which is what makes the digest's move readable as one
/// cause. Both scenarios were the same fighter, the same brute, the same open
/// `24x16` floor and the same spec table -- `embodied_duel` was built *from*
/// `articulated_duel`, overwriting the name and the model word, until session 05
/// inlined the one into the other -- so the only difference the stream could see
/// was the model.
///
/// **The fighter stands east of the brute, which is the point of the swap.**
/// Every body spawns facing east, and both the body yaw and the arm bearings
/// are *driven* rather than set -- the shipped clinch fixture takes 78 ticks to
/// first contact, most of it turning around. So the script asks for no rotation
/// at all: the brute's club already points east, the fighter walks west onto
/// it, and the contact is geometry rather than patience.
///
/// Two units, measured, and **measured against the articulated model**. Three
/// halves had the club inside the fighter on tick zero, which cost the script
/// the empty ticks it exists to carry; five halves never touched inside a script
/// worth digesting. The embodied reseat spent part of that margin without being
/// asked to: the fixture resolves a row on tick zero now, as well as on 3
/// through 6, so the *opening* tick is no longer one of the empty ones. Fifteen
/// of the twenty still are -- 1, 2 and everything from 7 -- and
/// `empty_ticks_enter_both_stream_digests` still earns its claim on them. Moving
/// the spawns to recover the opening would be a second cause for a pin that
/// moved for one, so it is recorded here rather than done.
fn stream_digest_scenario() -> Scenario {
    let mut scenario = Scenario::embodied_duel();
    scenario.name = "embodied-stream-v1".to_string();
    scenario.units[0].spawn = Vec2::from_ints(9, 6);
    scenario.units[1].spawn = Vec2::from_ints(7, 6);
    scenario
}

/// The command each body is given, once, on tick zero.
///
/// One submission and no later ones, exactly as the reference's high-water
/// fixture does it: a stored command is driven toward until something replaces
/// it, so a script that resubmitted every tick would be measuring the submission
/// path rather than the stream.
///
/// It still builds an [`sim::CommandCoreV1`] and the caller wraps it in
/// [`sim::CommandV1::new`], which is the neutral swing plane on both
/// arms. That is the right constructor here and not a shortcut: this function
/// has no plane to give, and an adapter forced to invent one would be inventing
/// state. The plane that is *not* neutral lives in the command fixture that
/// pins `ARTICULATED_COMMAND_HASH`, where two different nonzero planes are what
/// catch a boundary reading one offset twice.
///
/// `move_dir` is a full unit along the bearing, which is the fastest a body may
/// ask to walk -- `validate_move` refuses a magnitude *above* one, and an axis
/// vector's magnitude is exactly one, so no rounding is being relied on here.
fn stream_digest_command(
    bearing: Angle,
    walk: Vec2,
    target: EntityId,
) -> sim::CommandCoreV1 {
    let arm = sim::ArmTarget {
        bearing,
        height: sim::CombatHeight::MID,
        reach: Fx::ONE,
        effort: Fx::ONE,
    };
    sim::CommandCoreV1 {
        move_dir: walk,
        body_yaw: bearing,
        intent: Intent::Attack(target),
        arms: [arm; 2],
        grips: [sim::GripRequest::Keep; 2],
        // `Keep`, and it has to stay `Keep`: this fixture drives
        // `ARTICULATED_STREAM_DIGEST`, whose whole claim is that it reads
        // published words rather than submitted ones. A `Loose` here would not
        // move that number today -- nothing publishes the verb until step 5 --
        // and relying on that is how a fixture quietly stops testing what it
        // was built for.
        releases: [sim::ReleaseRequest::Keep; 2],
    }
}

/// FNV-1a-64 over the published pose, combat-event, region, projectile and
/// stance stream of a scripted articulated fight.
///
/// **The portable claim v2-16 makes.** `selftest_hash` proves a *run* is the
/// same everywhere; this proves the bytes the page reads out of it are, which
/// is a different property and the one a hand-rolled ABI can get wrong on its
/// own. State-hash equality is not a substitute: two targets can agree about
/// every world column and still disagree about a word offset, a sign extension
/// or a narrowed `u64`.
///
/// It goes through [`write_pose_buffer`], [`write_combat_event_buffer`],
/// [`write_region_buffer`], [`write_articulated_projectile_buffer`] and
/// [`write_embodied_stance_buffer`] -- the same five functions [`publish`] calls
/// -- rather than a second encoder. A digest built by a parallel writer would
/// prove that two encoders agree and would say nothing about what crosses the
/// wall.
///
/// **This is now the whole of the crate's cross-target claim, and the sentence
/// it inherits is worth keeping in front of a reader.** `selftest_hash` used to
/// stand beside it and carried the argument in its plainest form: it ran exactly
/// what `lab hash` ran -- `skirmish(1234, 4, 6)`, seed 99, the baseline utility
/// policy -- and if the number differed between a native build and a wasm build,
/// then "the same inputs produce the same run, everywhere" was false and
/// something in the stack was not as portable as it said it was. It ran a legacy
/// skirmish through the legacy runner, so it went with the model. What is left
/// here pins the bytes that cross the wall rather than the state a fight
/// reached, and the *fight* half of that pair now lives outside this crate, in
/// `lab`'s `EMBODIED_CORPUS_DIGEST`.
///
/// Independent of [`init`] and of anything the player has done: it builds its
/// own `Sim`, drives it, and throws it away
/// without touching `SIM`, `FRAME`, `POSES`, `REGIONS`,
/// `ARTICULATED_PROJECTILES`, `EMBODIED_STANCES` or `COMBAT_EVENTS`. It
/// leaves `MAP`,
/// `MAP_SHAPE` and `FURNITURE` alone too, and that one is a property of the
/// *fixture* rather than of this function: `Sim::advance` rewrites both on a
/// door opening and on a descent, and the scripted duel is an open 24x16 room
/// with no doorway, no exit room and nobody dying inside twenty ticks. A future
/// fixture with a door in it would have to say how it avoids that.
///
/// **It allocates, and it must therefore be called during warm-up.** Building a
/// `Sim` costs a fog buffer, an event feed and a reserved contact vector, and on
/// `wasm32-unknown-unknown` a heap that grows grows linear memory -- which
/// detaches every typed array the page is holding. This is exactly the shape
/// [`contact_behavior_digest_lo`]'s corpus has and it takes the same answer:
/// the value is computed once per module, on first touch, and cached below.
/// Warm it beside the corpus and it can never move the heap again.
///
/// One tick per publication, so `poses_dropped` and `combat_events_dropped`
/// have exactly one meaning in the stream.
pub fn articulated_stream_digest() -> u64 {
    ARTICULATED_STREAM_DIGEST_VALUE.with(|digest| *digest)
}

thread_local! {
    /// Computed once, on first touch, for the reason
    /// [`articulated_stream_digest`] gives: it is the only allocating export in
    /// the pose/event set, and a second call that grew the heap would detach
    /// the page's views long after warm-up.
    static ARTICULATED_STREAM_DIGEST_VALUE: u64 = compute_articulated_stream_digest();
}

/// One tick's publication, as [`drive_stream_digest_script`] hands it over.
///
/// A struct and not seven positional arguments, on `TraceRun`'s argument in
/// `crates/lab`: three word slices and three counts in a row is a signature two
/// transpositions away from digesting the region rows as the pose rows, and
/// nothing in the type system would notice.
struct StreamPublication<'a> {
    tick: u32,
    poses: &'a [u32],
    poses_dropped: u32,
    events: &'a [u32],
    events_dropped: u32,
    regions: &'a [u32],
    regions_dropped: u32,
    projectiles: &'a [u32],
    projectiles_dropped: u32,
    stances: &'a [u32],
    stances_dropped: u32,
}

fn compute_articulated_stream_digest() -> u64 {
    let mut hash = fx::Hash64::new();
    hash.write_bytes(b"ARPG-STREAM-V1");
    drive_stream_digest_script(|published| {
        // The three lengths are derived from the slices rather than passed
        // alongside them, so the count in the digest and the words after it
        // cannot disagree about how many rows there are.
        hash.write_u32(published.tick);
        hash.write_u32((published.poses.len() / POSE_STRIDE) as u32);
        hash.write_u32(published.poses_dropped);
        for &word in published.poses {
            hash.write_u32(word);
        }
        hash.write_u32((published.events.len() / COMBAT_EVENT_STRIDE) as u32);
        hash.write_u32(published.events_dropped);
        for &word in published.events {
            hash.write_u32(word);
        }
        // **Appended after the events rather than beside the poses, which is
        // where the section itself belongs.** The digest's byte order is
        // append-only for the reason its columns and its codes are: a stream
        // that reordered would move this number by the same amount an extension
        // does, and the two would be indistinguishable afterwards. Written this
        // way, the pose-and-event prefix of every tick is byte-identical to
        // what v2-16 pinned and the whole of the move is the tail -- which is
        // exactly the claim "a third published section moved it" makes.
        hash.write_u32((published.regions.len() / REGION_STRIDE) as u32);
        hash.write_u32(published.regions_dropped);
        for &word in published.regions {
            hash.write_u32(word);
        }
        // The projectile section is the fourth append-only tail. Even an empty
        // tick carries its row count and drop count, so adding the publication
        // is visible in the portability digest without disturbing the prior
        // pose/event/region prefix.
        hash.write_u32((published.projectiles.len() / ARTICULATED_PROJECTILE_STRIDE) as u32);
        hash.write_u32(published.projectiles_dropped);
        for &word in published.projectiles {
            hash.write_u32(word);
        }
        // The stance section is the fifth append-only tail, and it is the one
        // whose *emptiness* is the contract. This fixture is Articulated, so no
        // tick of it carries a stance row: what the section contributes is a
        // zero length and a zero drop count, twenty times, and their presence is
        // the whole of the move. A section that vanished when it had nothing to
        // say would be indistinguishable here from a section nobody added, which
        // is the same argument the empty *tick* is carried on.
        hash.write_u32((published.stances.len() / EMBODIED_STANCE_STRIDE) as u32);
        hash.write_u32(published.stances_dropped);
        for &word in published.stances {
            hash.write_u32(word);
        }
    });
    hash.finish()
}

/// Runs the scripted articulated stream, handing `feed` one
/// [`StreamPublication`] per tick.
///
/// The script and the digest are separated so that a test can ask what the
/// script *contains* -- an empty tick, a tick with several contact groups --
/// without rebuilding the drive beside it. Two copies of a fixture is how a
/// fixture and the claim about it drift apart.
fn drive_stream_digest_script(mut feed: impl FnMut(StreamPublication)) {
    let scenario = stream_digest_scenario();
    let Some(mut sim) = Sim::try_on(&scenario, STREAM_DIGEST_SEED) else {
        // Unreachable -- the fixture is the shipped duel with two spawns moved
        // -- and it feeds nothing rather than trapping anyway, because this is
        // reachable from a `pub extern "C"` export and a trap poisons the
        // instance. An empty stream fails its pin loudly on the far side.
        return;
    };
    // **The policies are named here rather than defaulted, because this fixture
    // drives a pinned digest and a room default moved it once already.** That is
    // not a hypothetical: the session that opened `#/game` on
    // `PolicyKind::Tactical` changed one line in [`Sim::try_on`] and
    // `ARTICULATED_STREAM_DIGEST` moved, from `0x96e4e51de0c00d62` to
    // `0xfb1d4456a7ef82d1` -- a two-target, four-copy portability witness
    // reached by a dropdown's opening value, which it is not supposed to be
    // reachable by at all. **The failure reads as a portability failure**, and
    // that is the expensive part: it names the target boundary and says nothing
    // at all about the product decision that caused it.
    //
    // Which mind a reader meets on `#/game` is a product decision and it may
    // move again. This digest is not one -- it is the witness that wasm and
    // native publish the same words out of the same fight -- so it borrows
    // nothing from the room. **This is not a preference for the old default
    // either:** the number was recorded over a fight driven by `Scripted` on
    // both sides, and naming that here is the whole difference between a fixture
    // and a default that happened to agree with one. The two looked identical
    // until the day they did not.
    //
    // `assert_documented_event_order` builds this same scenario a second time
    // and has to say the same thing for the same reason; the two are separate
    // because that test opens its batch mid-script rather than reading every
    // tick.
    sim.set_policy(Faction::Heroes, PolicyKind::Scripted);
    sim.set_policy(Faction::Monsters, PolicyKind::Scripted);
    // Reserved up front so the run's own contact vectors do not grow under it.
    // This costs one allocation burst before any pointer is handed out, which
    // is the same discipline `init` keeps.
    if sim.world.try_reserve_contact_slots(scenario.units.len()).is_err() {
        return;
    }
    let fighter = EntityId::new(0, 0);
    let brute = EntityId::new(1, 0);
    // **Both bearings are zero, and that is the fixture's whole trick.** Every
    // body spawns facing east and both the body yaw and the arm bearings are
    // driven, not set -- a half turn is the better part of a hundred ticks. So
    // the script asks for no rotation at all and gets its contact out of the
    // geometry instead: the brute stands still with its club pointing east and
    // the fighter walks west onto it.
    //
    // **The zero means something else than it did, and the byte did not move.**
    // The embodied grammar reads `move_dir` and every arm bearing relative to
    // the torso where the retired articulated one read them absolutely, so
    // `Angle::ZERO` was world east here and is now straight ahead, and `west` is
    // a torso-relative axis rather than a compass point.
    // The script asks for no rotation either way and still gets its contact out
    // of the placement, but it is not the same fight -- which is one of the four
    // routes the `ARTICULATED_STREAM_DIGEST` re-record names, and the reason a
    // reader diffing these two lines across the move would conclude wrongly that
    // nothing changed.
    let west = Vec2::new(-Fx::ONE, Fx::ZERO);
    sim.world.submit(
        fighter,
        sim::CommandV1::new(stream_digest_command(Angle::ZERO, west, brute)),
    );
    sim.world.submit(
        brute,
        sim::CommandV1::new(stream_digest_command(Angle::ZERO, Vec2::ZERO, fighter)),
    );

    // The five published buffers, built once and reused across the script
    // rather than allocated per tick: this runs on `wasm32-unknown-unknown`,
    // where a heap that grows detaches whatever the page is holding, and
    // 292,352 bytes of stack is the cheaper of the two. That was 49,664 while
    // `MAX_COMBAT_EVENTS` was the provisional 256 and 147,968 while it was
    // 1024, and 279,040 before v2-ui-06 added the region rows -- so the frame
    // has grown by 5.8x and the trade is worth restating rather than assuming:
    // the default shadow stack is 1 MiB, this frame is a little over a quarter
    // of it, and it is the whole depth below an export rather than one level of
    // a recursion. **This is the constant to watch if the capacity is raised
    // again** -- the next doubling of the event buffer puts one frame past half
    // the stack, and a shadow-stack overflow on wasm32 is a silent corruption
    // rather than a trap.
    let mut poses = [0u32; MAX_POSES * POSE_STRIDE];
    let mut events = [0u32; MAX_COMBAT_EVENTS * COMBAT_EVENT_STRIDE];
    let mut regions = [0u32; MAX_REGIONS * REGION_STRIDE];
    let mut projectiles =
        [0u32; MAX_ARTICULATED_PROJECTILES * ARTICULATED_PROJECTILE_STRIDE];
    let mut stances = [0u32; MAX_EMBODIED_STANCE * EMBODIED_STANCE_STRIDE];
    for _ in 0..STREAM_DIGEST_TICKS {
        // Read before the step, so the number fed here is the tick that was
        // integrated -- the same tick the event rows below are stamped with,
        // and the same one their times of impact are fractions of.
        let tick = sim.world.tick();
        sim.advance(1);
        let (pose_rows, poses_dropped) = write_pose_buffer(&sim, &mut poses);
        let (event_rows, events_dropped) = write_combat_event_buffer(&sim, &mut events);
        let (region_rows, regions_dropped) = write_region_buffer(&sim, &mut regions);
        let (projectile_rows, projectiles_dropped) =
            write_articulated_projectile_buffer(&sim, &mut projectiles);
        // Driven through the publication's own writer rather than short-circuited
        // to an empty slice, and the argument for that is **stronger** now than
        // when it was written. It used to read "even though this fixture is
        // Articulated and the writer is known to answer `(0, 0)`": a script that
        // hard-coded the emptiness would have proved that this file believes the
        // section is empty, where running the writer proved the section is. The
        // fixture is embodied and the writer answers two real rows, so what the
        // call now proves is not emptiness but the rows themselves -- the same
        // six words per body `publish` hands the page, produced by the same
        // function rather than by a second one that agrees with it today.
        let (stance_rows, stances_dropped) =
            write_embodied_stance_buffer(&sim, &mut stances);
        feed(StreamPublication {
            tick,
            poses: &poses[..pose_rows as usize * POSE_STRIDE],
            poses_dropped,
            events: &events[..event_rows as usize * COMBAT_EVENT_STRIDE],
            events_dropped,
            regions: &regions[..region_rows as usize * REGION_STRIDE],
            regions_dropped,
            projectiles:
                &projectiles[..projectile_rows as usize * ARTICULATED_PROJECTILE_STRIDE],
            projectiles_dropped,
            stances: &stances[..stance_rows as usize * EMBODIED_STANCE_STRIDE],
            stances_dropped,
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The tile vocabulary, which nothing above the test module needs: the crate
    /// reads a floor plan and never writes one. [`init_carved`] is the
    /// exception, and it is the only reason these names are in scope at all.
    use sim::{Dungeon, DUNGEON_COLS, DUNGEON_ROWS, OPEN, WALL};

    // **`articulated_test_world` stood here and is gone with the grammar it
    // built.** It installed `Scenario::articulated_duel` without publishing, so
    // that `submit_embodied`'s "wrong model lost precedence" ladder had a world
    // to be refused from. Every world this module can install answers the same
    // grammar now, so that ladder has no subject rather than a missing fixture
    // -- see `an_articulated_module_refuses_submit_embodied_by_name`'s note
    // where it stood. [`embodied_test_world`] is the survivor and is what the
    // submission tests build against.

    /// A duel written into [`ARENA_CONFIG`] the way the studio writes it.
    ///
    /// The mirror of [`install_arena`]'s parse, and deliberately a separate
    /// piece of code rather than a shared encoder: a buffer built by the reader
    /// it is handed to agrees with itself by construction and says nothing about
    /// the layout. This one is written against the offset constants, which is
    /// what a page has.
    fn write_arena_config(config: &sim::DuelConfigV1, policies: [PolicyKind; 2]) {
        ARENA_CONFIG.with(|buffer| {
            let mut bytes = buffer.borrow_mut();
            bytes.fill(0);
            bytes[ARENA_HEADER_LAYOUT..][..2]
                .copy_from_slice(&ARENA_CONFIG_LAYOUT_VERSION.to_le_bytes());
            bytes[ARENA_HEADER_FIGHTERS] = ARENA_FIGHTERS as u8;
            bytes[ARENA_HEADER_MAX_TICKS..][..4].copy_from_slice(&config.max_ticks.to_le_bytes());
            for (index, fighter) in config.fighters.iter().enumerate() {
                let base = ARENA_HEADER_BYTES + index * ARENA_FIGHTER_BYTES;
                bytes[base + ARENA_FIGHTER_ANATOMY] = match fighter.anatomy {
                    sim::AnatomyChoice::Fighter => 0,
                    sim::AnatomyChoice::Brute => 1,
                };
                bytes[base + ARENA_FIGHTER_POLICY] = policies[index].code() as u8;
                bytes[base + ARENA_FIGHTER_SPAWN_X..][..4]
                    .copy_from_slice(&fighter.spawn.x.raw().to_le_bytes());
                bytes[base + ARENA_FIGHTER_SPAWN_Y..][..4]
                    .copy_from_slice(&fighter.spawn.y.raw().to_le_bytes());
                for (hand, item) in fighter.hands.iter().enumerate() {
                    let at = base + ARENA_FIGHTER_HANDS + hand * ARENA_HAND_BYTES;
                    let Some(item) = item else {
                        bytes[at + ARENA_HAND_ITEM] = ARENA_HAND_EMPTY;
                        continue;
                    };
                    if hand == sim::LimbSlot::RightArm as usize && fighter.two_handed {
                        bytes[at + ARENA_HAND_TWO_HANDED] = 1;
                    }
                    bytes[at + ARENA_HAND_ITEM] = item.action.code() as u8;
                    bytes[at + ARENA_HAND_MASS..][..4]
                        .copy_from_slice(&item.mass.raw().to_le_bytes());
                    bytes[at + ARENA_HAND_BALANCE..][..4]
                        .copy_from_slice(&item.balance.raw().to_le_bytes());
                    let dimensions = match item.geometry {
                        sim::EquipmentGeometry::Segment { length, radius } => {
                            [length, radius, Fx::ZERO]
                        }
                        sim::EquipmentGeometry::Shield {
                            half_width,
                            half_height,
                            thickness,
                        } => [half_width, half_height, thickness],
                    };
                    for (word, value) in dimensions.iter().enumerate() {
                        bytes[at + ARENA_HAND_DIMENSION_0 + word * 4..][..4]
                            .copy_from_slice(&value.raw().to_le_bytes());
                    }
                }
            }
        });
    }

    /// One byte of [`ARENA_CONFIG`], for the refusal cases.
    fn poke_arena_config(offset: usize, value: u8) {
        ARENA_CONFIG.with(|buffer| buffer.borrow_mut()[offset] = value);
    }

    /// The offset of one hand's block.
    fn arena_hand_at(fighter: usize, hand: usize) -> usize {
        ARENA_HEADER_BYTES + fighter * ARENA_FIGHTER_BYTES
            + ARENA_FIGHTER_HANDS + hand * ARENA_HAND_BYTES
    }

    /// `lab`'s `measure_articulated_matchup`, reduced to the fight: the runner's
    /// orders, one policy per side, routed on the alive set, and the same two
    /// stopping gates.
    ///
    /// Written out here rather than called into `lab`, which `web` does not
    /// depend on and must not. That is what makes it evidence: two independent
    /// spellings of one loop agreeing on a state hash is a claim about the loop,
    /// where one spelling calling the other would be a claim about nothing.
    fn the_lab_loop(
        scenario: &Scenario,
        seed: u64,
        kinds: [PolicyKind; 2],
    ) -> (u64, Option<sim::Outcome>, u32) {
        the_lab_loop_with(scenario, seed, [kinds[0].build(), kinds[1].build()])
    }

    /// [`the_lab_loop`] over two policies the caller built.
    ///
    /// **It was split out for the one kind `ArticulatedPolicyKind::build` could
    /// not make**, and that kind is gone: `PolicyKind::build` is total,
    /// so `the_lab_loop` above is now the whole of it. The split survives
    /// because a caller *outside* the registry -- a checkpoint, a wrapper, a
    /// policy assembled for one assertion -- is still a thing a test may want to
    /// drive through the identical loop, and a helper that only took two codes
    /// would push such a caller into writing a third copy of it.
    fn the_lab_loop_with(
        scenario: &Scenario,
        seed: u64,
        mut policies: [Box<dyn Policy>; 2],
    ) -> (u64, Option<sim::Outcome>, u32) {
        let mut world = World::new(scenario, seed);
        let orders = RunConfig::default().orders;
        world.set_order(Faction::Heroes, orders[0]);
        world.set_order(Faction::Monsters, orders[1]);
        policies[0].reset();
        policies[1].reset();
        let heroes = world.alive_ids(Faction::Heroes);
        let mut due: Vec<EntityId> = Vec::new();
        while world.outcome().is_none() && world.tick() < scenario.max_ticks {
            due.clear();
            due.extend_from_slice(world.pending_decisions());
            for &id in &due {
                let obs = world.observe(id);
                let side = usize::from(!heroes.contains(&id));
                let command = policies[side].decide(&obs);
                let _ = world.submit(id, command);
            }
            let _ = world.step();
        }
        (world.state_hash(), world.outcome(), world.tick())
    }

    /// What the installed arena world reached: state hash, outcome, tick.
    fn arena_state() -> (u64, Option<sim::Outcome>, u32) {
        with_sim((0u64, None, 0u32), |sim| {
            (sim.world.state_hash(), sim.world.outcome(), sim.world.tick())
        })
    }

    /// The high-water corpus's tick-zero command, staged into the one scratch
    /// this boundary still owns.
    ///
    /// **The arm bearings are torso-relative and the body yaws are not**, which
    /// is the whole of what porting this corpus off the articulated grammar
    /// took: `World::world_arm_target` adds the body's own yaw back on, an arm
    /// bearing being measured from the torso, so the westward half of each pair
    /// asked for a full turn away from its opponent when it kept `Angle::HALF`
    /// in both fields. `body_yaw` was a world angle under both frames and still
    /// is one.
    fn write_high_water_command(
        yaw: Angle,
        height: sim::CombatHeight,
        target: EntityId,
    ) -> sim::CommandV1 {
        let arm = sim::ArmTarget {
            bearing: Angle::ZERO,
            height,
            reach: Fx::ONE,
            effort: Fx::ONE,
        };
        sim::CommandV1::new(sim::CommandCoreV1 {
            move_dir: Vec2::ZERO,
            body_yaw: yaw,
            intent: Intent::Attack(target),
            arms: [arm; 2],
            grips: [sim::GripRequest::Keep; 2],
            releases: [sim::ReleaseRequest::Keep; 2],
        })
    }

    /// The next [`sim::CombatSpecError`] in declaration order, or `None` at the
    /// end of the enum.
    ///
    /// **A chain and not an array, and the difference is the whole of what the
    /// injectivity assertion below is worth.** A hand-written array of variants
    /// is not coupled to the enum: a sixteenth variant mapped in
    /// `arena_spec_refusal` to a code already in use would compile -- the
    /// exhaustive `match` there forces an arm to exist and has no opinion about
    /// what it returns -- and the test would go on asserting distinctness over
    /// the fifteen it had been told about and passing green. That is exactly the
    /// hole v2-ui-05's review found. The `match` here is exhaustive too, so the
    /// new variant cannot be *absent*: it is a failed build until somebody wires
    /// it into the chain, and once wired the walk carries it into the
    /// distinctness check and trips the count beside it.
    ///
    /// What it still cannot catch is a variant deliberately wired as a second
    /// terminator, which orphans it from a walk that starts at the head. That is
    /// a miswiring rather than an omission, and this sentence is the only guard
    /// against it -- the alternative, enumerating a foreign enum from outside its
    /// crate, is not a thing Rust can do.
    fn next_spec_error(error: sim::CombatSpecError) -> Option<sim::CombatSpecError> {
        use sim::CombatSpecError as E;
        Some(match error {
            E::MissingTable => E::UnexpectedTable,
            E::UnexpectedTable => E::UnitPresence,
            E::UnitPresence => E::TooManyAnatomies,
            E::TooManyAnatomies => E::TooManyEquipment,
            E::TooManyEquipment => E::IdOrder,
            E::IdOrder => E::UnknownSchema,
            E::UnknownSchema => E::Dimension,
            E::Dimension => E::Fraction,
            E::Fraction => E::Maximum,
            E::Maximum => E::MissingReference,
            E::MissingReference => E::LoadoutMismatch,
            E::LoadoutMismatch => E::GripConflict,
            E::GripConflict => E::NoEquipment,
            E::NoEquipment => E::BowGrip,
            E::BowGrip => E::UnknownAction,
            // The tail, and the one arm a new variant edits: it becomes
            // `E::UnknownAction => E::<new>` and the new variant becomes this.
            E::UnknownAction => return None,
        })
    }

    /// Every `CombatSpecError`, walked rather than listed. See
    /// [`next_spec_error`].
    fn every_spec_error() -> Vec<sim::CombatSpecError> {
        let mut walked = vec![sim::CombatSpecError::MissingTable];
        while let Some(next) = next_spec_error(walked[walked.len() - 1]) {
            assert!(!walked.contains(&next), "the spec-error chain loops at {next:?}");
            walked.push(next);
        }
        walked
    }

    #[test]
    fn the_arena_configuration_buffer_is_the_documented_layout() {
        // The offsets, read the way a page reads them. `const _` already
        // asserts the arithmetic closes; this asserts the numbers the reference
        // writes down are the numbers a caller would compute.
        assert_ne!(arena_config_ptr(), 0);
        assert_eq!(arena_config_len(), 120);
        // `3` since arena-02 claimed the fighter block's byte 2 for the control
        // byte; layout 2 promised that byte was zero, and refused it otherwise
        // with `ARENA_NONCANONICAL`, which is what made the promise real.
        assert_eq!(arena_config_layout_version(), 3);
        // The fighter block's four header bytes, in the order the reference
        // writes them. Asserted as literals here and as an ordering `const _`
        // beside the offsets: the numbers a page computes, and the arithmetic
        // that stops one of them sliding.
        assert_eq!(
            [
                ARENA_FIGHTER_ANATOMY, ARENA_FIGHTER_POLICY, ARENA_FIGHTER_CONTROL,
                ARENA_FIGHTER_RESERVED,
            ],
            [0, 1, 2, 3],
        );
        assert_eq!(ARENA_HEADER_BYTES, 8);
        assert_eq!(ARENA_FIGHTER_BYTES, 56);
        assert_eq!(ARENA_HAND_BYTES, 22);
        assert_eq!(arena_hand_at(0, 0), 20);
        assert_eq!(arena_hand_at(0, 1), 42);
        assert_eq!(arena_hand_at(1, 0), 76);
        assert_eq!(arena_hand_at(1, 1), 98);
        assert_eq!(arena_hand_at(1, 1) + ARENA_HAND_BYTES, ARENA_CONFIG_BYTES);
        // Hand index 0 is the left arm and 1 is the right, which is what the
        // builder sets `binding` from. Pinned in `crates/sim` and restated here
        // because this buffer is the only place the two numbers meet.
        assert_eq!(sim::LimbSlot::LeftArm as usize, 0);
        assert_eq!(sim::LimbSlot::RightArm as usize, 1);
        // Every refusal is its own number, including the ones no control can
        // reach: the whole point of the table is that the studio never has to
        // say "invalid".
        //
        // **Two halves, and neither is the count.** The declared bytes are
        // checked pairwise at compile time beside `ARENA_REASONS`, so a second
        // refusal given a number already in use never links. What is left is a
        // `CombatSpecError` variant mapped onto a code some *other* variant
        // already answers, and the only way to see that is to have every variant
        // in hand -- which is why the list below is walked out of an exhaustive
        // `match` rather than written down. See [`next_spec_error`].
        let spec_errors = every_spec_error();
        // The fifteen that are not a spec error stay written out: they answer
        // to no enum, so a list of them is a list of them, and their
        // distinctness is the compile-time half.
        let mut codes = vec![
            ARENA_OK, ARENA_UNKNOWN_LAYOUT, ARENA_WRONG_FIGHTER_COUNT, ARENA_NONCANONICAL,
            ARENA_UNKNOWN_ANATOMY, ARENA_UNKNOWN_ITEM, ARENA_UNKNOWN_POLICY,
            ARENA_POLICY_UNAVAILABLE, ARENA_CONSTRUCTION_REFUSED, ARENA_RESERVATION_REFUSED,
            ARENA_NAME_TOO_LONG, ARENA_NO_CHECKPOINT, ARENA_UNKNOWN_CONTROL,
            ARENA_CONTROL_UNAVAILABLE, ARENA_INPUT_REFUSED,
        ];
        codes.extend(spec_errors.iter().map(|&error| arena_spec_refusal(error).reason));
        let distinct = codes.iter().copied().collect::<std::collections::BTreeSet<_>>();
        assert_eq!(distinct.len(), codes.len(), "two refusals share a reason code");
        assert_eq!(codes.len(), ARENA_REASONS.len(), "a refusal is missing from ARENA_REASONS");
        // **This is the line that covers a new refusal, and arena-02 found it
        // covers it only because the list above was widened by hand.** The
        // compile-time assert beside `ARENA_REASONS` compares that array with
        // itself, so a code declared and never listed is distinct from nothing
        // and missing from no count. What that array is *for* is this
        // comparison: every code a reader can name, gathered two independent
        // ways -- the enum walk and the written list -- against the array's own
        // length. Adding `28` and `29` to the array and not to this list is a
        // failure here; adding them here and not to the array is the same
        // failure from the other side.
        for reason in &codes {
            assert!(
                ARENA_REASONS.contains(reason),
                "reason {reason} is declared and is not in ARENA_REASONS, so nothing has                  ever checked it for distinctness",
            );
        }
        // Not the guard -- the two lines above are -- but the tripwire that says
        // a variant arrived, now that a variant cannot arrive without the walk
        // finding it. Whoever bumps it owes the reference's reason table a row.
        assert_eq!(spec_errors.len(), 16, "a CombatSpecError variant was added");
    }

    #[test]
    fn an_unknown_control_byte_is_refused_by_name() {
        // **Bounded from both sides, which is what the two accepted values are
        // worth having a test for at all.** `0` and `1` install fights, and `2`
        // -- the first byte past the pair -- is where
        // "unknown" starts. A test that only drove `2` would pass just as
        // happily if the parser accepted every byte below it.
        let mut config = sim::DuelConfigV1::shipped();
        config.max_ticks = 60;
        let kinds = [PolicyKind::Scripted, PolicyKind::Tactical];

        write_arena_config(&config, kinds);
        poke_arena_config(ARENA_HEADER_BYTES + ARENA_FIGHTER_CONTROL, ARENA_CONTROL_POLICY);
        assert_eq!(arena_start(3) & 0xff, 1, "the policy control byte was refused");
        assert_eq!(arena_control(0), u32::from(ARENA_CONTROL_POLICY));
        assert_eq!(arena_control(1), u32::from(ARENA_CONTROL_POLICY));
        let expected_periods = with_sim([0; 2], |sim| {
            [Faction::Heroes, Faction::Monsters].map(|faction| {
                let id = sim.world.alive_ids(faction)[0];
                u32::from(sim.world.stats(id).expect("the arena body has stats").decision_period())
            })
        });
        assert_eq!(
            [arena_decision_period(0), arena_decision_period(1)],
            expected_periods,
            "the arena cadence is not the installed bodies' cadence",
        );
        assert!(expected_periods.iter().all(|&period| period > 0));

        write_arena_config(&config, kinds);
        poke_arena_config(ARENA_HEADER_BYTES + ARENA_FIGHTER_CONTROL, ARENA_CONTROL_HUMAN);
        assert_eq!(arena_start(3) & 0xff, 1, "the human control byte was refused");
        assert_eq!(arena_control(0), u32::from(ARENA_CONTROL_HUMAN));

        // Every byte that is neither, on both sides, so the boundary is the
        // pair and not the two values the test happened to pick.
        for byte in 2u8..=255 {
            for index in 0..ARENA_FIGHTERS {
                write_arena_config(&config, kinds);
                poke_arena_config(
                    ARENA_HEADER_BYTES + index * ARENA_FIGHTER_BYTES + ARENA_FIGHTER_CONTROL,
                    byte,
                );
                assert_eq!(
                    arena_start(3),
                    ArenaRefusal::fighter(ARENA_UNKNOWN_CONTROL, index).packed(),
                    "control byte {byte} on fighter {index} was not refused by name",
                );
            }
        }

        // And the reserved byte beside it still answers the *other* refusal,
        // which is the half of the layout bump that is easy to lose: byte 3 did
        // not stop being reserved and must not have quietly joined the control
        // field.
        write_arena_config(&config, kinds);
        poke_arena_config(ARENA_HEADER_BYTES + ARENA_FIGHTER_RESERVED, 1);
        assert_eq!(arena_start(3), ArenaRefusal::fighter(ARENA_NONCANONICAL, 0).packed());
    }

    #[test]
    fn a_side_that_is_not_human_refuses_a_staged_frame_by_name() {
        let mut config = sim::DuelConfigV1::shipped();
        config.max_ticks = 60;
        write_arena_config(&config, [PolicyKind::Scripted, PolicyKind::Tactical]);
        assert_eq!(arena_start(7) & 0xff, 1);
        write_embodied(policy::neutral_command(&Observation::BLANK));

        let policy = arena_stage_input(0);
        let unknown = arena_stage_input(2);
        assert_eq!((policy >> 8) as u8, ARENA_INPUT_REFUSED);
        assert_eq!((policy >> 16) as u8, ARENA_INPUT_POLICY_CONTROLLED);
        assert_eq!((unknown >> 8) as u8, ARENA_INPUT_REFUSED);
        assert_eq!((unknown >> 16) as u8, ARENA_INPUT_UNKNOWN_FACTION);
        assert_ne!(policy, unknown, "two different staging targets share one refusal");
    }

    #[test]
    fn a_human_side_is_submitted_on_every_tick_rather_than_on_its_decision_period() {
        let mut config = sim::DuelConfigV1::shipped();
        config.max_ticks = 30;
        write_arena_config(&config, [PolicyKind::Scripted, PolicyKind::Tactical]);
        poke_arena_config(ARENA_HEADER_BYTES + ARENA_FIGHTER_CONTROL, ARENA_CONTROL_HUMAN);
        assert_eq!(arena_start(11) & 0xff, 1);
        let (hero, period, command) = with_sim(None, |sim| {
            let hero = sim.arena.as_ref()?.driven[0]?;
            let obs = sim.world.observe(hero);
            Some((hero, u32::from(sim.world.stats(hero)?.decision_period()),
                policy::neutral_command(&obs)))
        }).expect("the human hero was installed");
        assert!(period > 1, "the fixture cannot distinguish every tick from cadence");
        write_embodied(command);
        assert_eq!(arena_stage_input(0) & 0xff, 1);
        step(8);

        let ticks = ARENA_SUBMISSIONS.with(|rows| rows.borrow().iter()
            .filter_map(|&(tick, id, _)| (id == hero).then_some(tick)).collect::<Vec<_>>());
        assert_eq!(ticks, (0..8).collect::<Vec<_>>());
    }

    #[test]
    fn forward_input_without_turn_holds_heading_and_does_not_swerve() {
        let mut config = sim::DuelConfigV1::shipped();
        config.max_ticks = 120;
        config.fighters[0].spawn = Vec2::new(Fx::from_int(4), Fx::from_int(8));
        config.fighters[1].spawn = Vec2::new(Fx::from_int(20), Fx::from_int(8));
        write_arena_config(&config, [PolicyKind::Tactical, PolicyKind::Neutral]);
        poke_arena_config(ARENA_HEADER_BYTES + ARENA_FIGHTER_CONTROL, ARENA_CONTROL_HUMAN);
        assert_eq!(arena_start(41) & 0xff, 1);
        let (hero, start) = with_sim(None, |sim| {
            let hero = sim.arena.as_ref()?.driven[0]?;
            Some((hero, sim.world.observe(hero)))
        }).expect("the human hero was installed");
        let heading = start.body_yaw;

        for _ in 0..120 {
            let obs = with_sim(Observation::BLANK, |sim| sim.world.observe(hero));
            let mut command = policy::neutral_command(&obs);
            command.core.move_dir = Vec2::new(Fx::ONE, Fx::ZERO);
            command.core.body_yaw = heading;
            write_embodied(command);
            assert_eq!(arena_stage_input(0) & 0xff, 1);
            step(1);
        }

        let end = with_sim(Observation::BLANK, |sim| sim.world.observe(hero));
        let delta = Vec2::new(
            end.body_position.x - start.body_position.x,
            end.body_position.y - start.body_position.y,
        );
        let along = delta.x * heading.cos() + delta.y * heading.sin();
        let across = -delta.x * heading.sin() + delta.y * heading.cos();
        assert_eq!(end.body_yaw, heading, "the policy-owned off hand turned the torso");
        assert!(along > Fx::ZERO, "held forward input did not move the body forward");
        assert_eq!(across, Fx::ZERO, "held forward input acquired cross-track drift");
    }

    #[test]
    fn a_human_driven_arena_fight_replays_from_its_recorded_commands() {
        let mut config = sim::DuelConfigV1::shipped();
        config.max_ticks = 20;
        write_arena_config(&config, [PolicyKind::Scripted, PolicyKind::Tactical]);
        poke_arena_config(ARENA_HEADER_BYTES + ARENA_FIGHTER_CONTROL, ARENA_CONTROL_HUMAN);
        let seed = 19;
        assert_eq!(arena_start(seed) & 0xff, 1);
        for tick_index in 0..12 {
            let obs = with_sim(Observation::BLANK, |sim| {
                let hero = sim.arena.as_ref().and_then(|arena| arena.driven[0])
                    .unwrap_or(EntityId::NONE);
                sim.world.observe(hero)
            });
            let mut command = policy::neutral_command(&obs);
            command.core.move_dir = if tick_index % 2 == 0 {
                Vec2::new(Fx::ONE, Fx::ZERO)
            } else {
                Vec2::ZERO
            };
            command.core.arms[LimbSlot::RightArm as usize] = ArmTarget {
                bearing: Angle::from_raw(0x3456),
                height: CombatHeight::HIGH,
                reach: Fx::from_raw(49_152),
                effort: Fx::ONE,
            };
            command.swing_plane[LimbSlot::RightArm as usize] = Angle::from_raw(0x89ab);
            write_embodied(command);
            assert_eq!(arena_stage_input(0) & 0xff, 1);
            step(1);
        }
        let (live_hash, live_tick) = with_sim((0, 0), |sim| {
            (sim.world.state_hash(), sim.world.tick())
        });
        let rows = ARENA_SUBMISSIONS.with(|rows| rows.borrow().clone());
        assert!(rows.iter().any(|&(_, id, _)| id != EntityId::NONE));
        assert!(rows.iter().any(|&(_, _, command)| {
            let arm = command.core.arms[LimbSlot::RightArm as usize];
            arm.height == CombatHeight::HIGH
                && arm.reach == Fx::from_raw(49_152)
                && command.swing_plane[LimbSlot::RightArm as usize] == Angle::from_raw(0x89ab)
        }), "the staged primary arm did not reach the replay stream");

        let scenario = Scenario::duel_from(&config).expect("the replay duel builds");
        let mut replay = sim::Replay::new(&scenario, u64::from(seed));
        let orders = RunConfig::default().orders;
        replay.record_order(0, Faction::Heroes, orders[0]);
        replay.record_order(0, Faction::Monsters, orders[1]);
        replay.record_objective(0, Faction::Heroes, Objective::None);
        replay.record_objective(0, Faction::Monsters, Objective::None);
        for (tick, id, command) in rows {
            replay.record_submitted(tick, id, sim::SubmittedCommand::Embodied(command));
        }
        replay.finish(live_tick);
        assert_eq!(replay.play().state_hash(), live_hash);
    }

    #[test]
    fn accepted_arena_rows_and_the_zero_tick_baseline_replay_the_live_tick() {
        let mut config = sim::DuelConfigV1::shipped();
        config.max_ticks = 20;
        write_arena_config(&config, [PolicyKind::Scripted, PolicyKind::Tactical]);
        poke_arena_config(ARENA_HEADER_BYTES + ARENA_FIGHTER_CONTROL, ARENA_CONTROL_HUMAN);
        assert_eq!(arena_start(23) & 0xff, 1);
        let baseline = ARENA_REPLAY_BASELINE.with(|bytes| bytes.borrow().clone());
        let mut envelope = sim::ReplayEnvelope::decode(&baseline).expect("zero-tick baseline");
        assert_eq!(envelope.tick_limit, 0);
        assert!(envelope.replay.submitted_entries.is_empty());
        assert_eq!(envelope.replay.orders.len(), 2);
        assert_eq!(envelope.replay.objectives.len(), 2);

        let hero = with_sim(EntityId::NONE, |sim| sim.arena.as_ref().and_then(|a| a.driven[0])
            .unwrap_or(EntityId::NONE));
        let obs = with_sim(Observation::BLANK, |sim| sim.world.observe(hero));
        write_embodied(policy::neutral_command(&obs));
        assert_eq!(arena_stage_input(0) & 0xff, 1);
        step(1);
        let count = arena_accepted_command_len() as usize;
        assert!((1..=2).contains(&count));
        let bytes = ARENA_ACCEPTED_COMMANDS.with(|rows| rows.borrow()[..count * ARENA_ACCEPTED_COMMAND_STRIDE].to_vec());
        let mut records = Vec::new();
        for row in bytes.chunks_exact(ARENA_ACCEPTED_COMMAND_STRIDE) {
            assert_eq!(row[12], 2);
            let payload: &[u8; sim::EMBODIED_PAYLOAD_BYTES] = row[13..].try_into().unwrap();
            records.push(sim::SubmittedCommandRecord {
                tick: u32::from_le_bytes(row[0..4].try_into().unwrap()),
                entity: EntityId::new(u32::from_le_bytes(row[4..8].try_into().unwrap()),
                    u32::from_le_bytes(row[8..12].try_into().unwrap())),
                command: sim::SubmittedCommand::Embodied(CommandV1::from_payload_bytes(payload).unwrap()),
            });
        }
        assert!(records.iter().any(|row| row.entity == hero));
        envelope.tick_limit = 1;
        envelope.replay.ticks = 1;
        envelope.replay.submitted_entries = records;
        let replayed = envelope.play().unwrap().state_digest();
        let live = state_digest();
        assert_eq!((replayed.domain, replayed.schema, replayed.value),
            (live.domain, live.schema, live.value));
        assert_eq!(arena_accepted_commands_dropped(), 0);
    }

    #[test]
    fn the_input_hold_is_bounded_from_both_sides() {
        assert!(CONTROL_INPUT_MAX_HOLD_TICKS > 1, "one missed frame drops input immediately");
        assert!(CONTROL_INPUT_MAX_HOLD_TICKS < 60, "a hidden page can drive for a second");
    }

    #[test]
    fn a_held_input_expires_to_neutral_rather_than_to_its_last_value() {
        let mut obs = Observation::BLANK;
        obs.tick = 10;
        let mut held = policy::neutral_command(&obs);
        held.core.move_dir = Vec2::new(Fx::ONE, Fx::ZERO);
        held.core.arms[LimbSlot::RightArm as usize] = ArmTarget {
            bearing: Angle::from_raw(0x3456),
            height: CombatHeight::HIGH,
            reach: Fx::from_raw(49_152),
            effort: Fx::ONE,
        };
        held.swing_plane[LimbSlot::RightArm as usize] = Angle::from_raw(0x89ab);
        ARENA_INPUT.with(|inputs| inputs.borrow_mut()[0] =
            StagedArenaInput { tick: 10, command: Some(held) });
        let mut source = HostSource::new(0, LimbSlot::RightArm);

        let mut live = policy::neutral_command(&obs);
        source.contribute(&obs, &mut live);
        assert_eq!(live.core.move_dir, held.core.move_dir);
        assert_eq!(live.core.arms[1], held.core.arms[1]);
        assert_eq!(live.swing_plane[1], held.swing_plane[1]);
        obs.tick = 10 + CONTROL_INPUT_MAX_HOLD_TICKS - 1;
        let mut last_live = policy::neutral_command(&obs);
        source.contribute(&obs, &mut last_live);
        assert_eq!(last_live.core.move_dir, held.core.move_dir);
        assert_eq!(last_live.core.arms[1], held.core.arms[1]);
        assert_eq!(last_live.swing_plane[1], held.swing_plane[1]);
        obs.tick += 1;
        let mut expired = policy::neutral_command(&obs);
        source.contribute(&obs, &mut expired);
        assert_eq!(expired.core.move_dir, Vec2::ZERO);
        assert_eq!(expired.core.arms[1], policy::neutral_command(&obs).core.arms[1]);
        assert_eq!(expired.swing_plane[1], Angle::ZERO);
    }

    #[test]
    fn a_host_source_copies_only_its_primary_arm() {
        let obs = Observation::BLANK;
        let mut staged = policy::neutral_command(&obs);
        staged.core.arms[0] = ArmTarget {
            bearing: Angle::from_raw(0x1111),
            height: CombatHeight::LOW,
            reach: Fx::HALF,
            effort: Fx::HALF,
        };
        staged.core.arms[1] = ArmTarget {
            bearing: Angle::from_raw(0x3456),
            height: CombatHeight::HIGH,
            reach: Fx::from_raw(49_152),
            effort: Fx::ONE,
        };
        staged.core.grips[1] = sim::GripRequest::Release;
        staged.core.releases[1] = sim::ReleaseRequest::Loose;
        staged.swing_plane = [Angle::from_raw(0x2222), Angle::from_raw(0x89ab)];
        ARENA_INPUT.with(|inputs| inputs.borrow_mut()[0] =
            StagedArenaInput { tick: 0, command: Some(staged) });

        let mut composed = policy::neutral_command(&obs);
        let policy_off_hand = ArmTarget {
            bearing: Angle::from_raw(0x7777),
            height: CombatHeight::MID,
            reach: Fx::from_raw(40_000),
            effort: Fx::HALF,
        };
        composed.core.arms[0] = policy_off_hand;
        composed.swing_plane[0] = Angle::from_raw(0x6666);
        HostSource::new(0, LimbSlot::RightArm).contribute(&obs, &mut composed);

        assert_eq!(composed.core.arms[1], staged.core.arms[1]);
        assert_eq!(composed.core.grips[1], staged.core.grips[1]);
        assert_eq!(composed.core.releases[1], staged.core.releases[1]);
        assert_eq!(composed.swing_plane[1], staged.swing_plane[1]);
        assert_eq!(composed.core.arms[0], policy_off_hand,
            "the host overwrote the policy-owned off hand");
        assert_eq!(composed.swing_plane[0], Angle::from_raw(0x6666),
            "the host overwrote the off-hand plane");
    }

    #[test]
    fn the_primary_arm_is_the_only_strike_hand_else_right() {
        let sword = sim::HandItemV1::shipped(sim::ActionKind::Sword).unwrap();
        let shield = sim::HandItemV1::shipped(sim::ActionKind::Shield).unwrap();
        let mut fighter = sim::DuelConfigV1::shipped().fighters[0];
        fighter.hands = [None, Some(sword)];
        assert_eq!(primary_arm_of(&fighter), LimbSlot::RightArm);
        fighter.hands = [Some(sword), None];
        assert_eq!(primary_arm_of(&fighter), LimbSlot::LeftArm);
        fighter.hands = [Some(sword), Some(shield)];
        assert_eq!(primary_arm_of(&fighter), LimbSlot::LeftArm);
        fighter.hands = [Some(shield), Some(sword)];
        assert_eq!(primary_arm_of(&fighter), LimbSlot::RightArm);
        fighter.hands = [Some(sword), Some(sword)];
        assert_eq!(primary_arm_of(&fighter), LimbSlot::RightArm);
        fighter.hands = [Some(shield), None];
        assert_eq!(primary_arm_of(&fighter), LimbSlot::RightArm);
    }

    #[test]
    fn a_cadenced_source_asks_its_policy_on_exactly_the_ticks_the_runner_would() {
        use std::cell::RefCell;
        use std::rc::Rc;
        struct CountingPolicy(Rc<RefCell<Vec<u32>>>);
        impl Policy for CountingPolicy {
            fn decide(&mut self, obs: &Observation) -> CommandV1 {
                self.0.borrow_mut().push(obs.tick);
                policy::neutral_command(obs)
            }
        }
        let calls = Rc::new(RefCell::new(Vec::new()));
        let mut source = CadencedEmbodiedSource::new(
            Box::new(CountingPolicy(Rc::clone(&calls))),
            CommandAuthority::arm(LimbSlot::LeftArm), 3,
        );
        for tick in 0..10 {
            let mut obs = Observation::BLANK;
            obs.tick = tick;
            let mut command = policy::neutral_command(&obs);
            source.contribute(&obs, &mut command);
        }
        assert_eq!(&*calls.borrow(), &[0, 3, 6, 9]);
    }

    #[test]
    fn the_off_hand_keeps_the_swing_plane_its_policy_asked_for() {
        struct PlanePolicy;
        impl Policy for PlanePolicy {
            fn decide(&mut self, obs: &Observation) -> CommandV1 {
                let mut command = policy::neutral_command(obs);
                command.swing_plane = [Angle::QUARTER, Angle::HALF];
                command
            }
        }
        let mut source = CadencedEmbodiedSource::new(
            Box::new(PlanePolicy), CommandAuthority::arm(LimbSlot::LeftArm), 4,
        );
        let mut command = policy::neutral_command(&Observation::BLANK);
        source.contribute(&Observation::BLANK, &mut command);
        assert_eq!(command.swing_plane[0], Angle::QUARTER);
        assert_eq!(command.swing_plane[1], Angle::ZERO);
    }

    #[test]
    fn a_layout_two_configuration_is_refused_rather_than_read_as_layout_three() {
        // A version-2 buffer is a buffer whose byte 2 of each fighter block
        // means "reserved, and I promise it is zero". Reading one under layout
        // 3's rules would be harmless *today* -- a zero is
        // `ARENA_CONTROL_POLICY` -- and that is precisely the trap: it would
        // work until the day a writer that never heard of the control byte put
        // something else there, and then a stale page would silently hand a
        // body to a keyboard that is not attached.
        let mut config = sim::DuelConfigV1::shipped();
        config.max_ticks = 60;
        let kinds = [PolicyKind::Scripted, PolicyKind::Tactical];

        for version in [0u16, 1, 2, 4, u16::MAX] {
            write_arena_config(&config, kinds);
            ARENA_CONFIG.with(|buffer| {
                buffer.borrow_mut()[ARENA_HEADER_LAYOUT..][..2]
                    .copy_from_slice(&version.to_le_bytes());
            });
            assert_eq!(
                arena_start(3),
                ArenaRefusal::whole(ARENA_UNKNOWN_LAYOUT).packed(),
                "layout {version} was read rather than refused",
            );
        }

        // Bounded from the other side by the version that is not refused, so
        // that "everything is refused" cannot pass for this.
        write_arena_config(&config, kinds);
        assert_eq!(arena_start(3) & 0xff, 1, "layout 3 was refused");
        assert_eq!(arena_config_layout_version(), u32::from(ARENA_CONFIG_LAYOUT_VERSION));
    }

    #[test]
    fn the_arena_fingerprint_does_not_change_when_a_side_is_handed_to_a_human() {
        // **The claim the whole arena topic rests on.** `arena_fingerprint_*`
        // names the fight, so if the control byte reached `Scenario` the human
        // fight and the AI fight at one seed would be two different fixtures
        // and "can I do better than `tactical`?" would stop being answerable.
        //
        // Written through `arena_start`, because the control path now exists:
        // comparing parse-only scenarios would miss an install-time leak and
        // could pass while no human fight had ever been constructed.
        let mut config = sim::DuelConfigV1::shipped();
        config.max_ticks = 60;
        let kinds = [PolicyKind::Scripted, PolicyKind::Tactical];

        let fingerprint_of = |controls: [u8; 2]| -> (u64, [u8; 2]) {
            write_arena_config(&config, kinds);
            for (index, &control) in controls.iter().enumerate() {
                poke_arena_config(
                    ARENA_HEADER_BYTES + index * ARENA_FIGHTER_BYTES + ARENA_FIGHTER_CONTROL,
                    control,
                );
            }
            assert_eq!(arena_start(31) & 0xff, 1, "the control pair was not installable");
            (arena_fingerprint(), [arena_control(0) as u8, arena_control(1) as u8])
        };

        let (both_policy, policy_controls) =
            fingerprint_of([ARENA_CONTROL_POLICY, ARENA_CONTROL_POLICY]);
        let (a_human, a_controls) = fingerprint_of([ARENA_CONTROL_HUMAN, ARENA_CONTROL_POLICY]);
        let (b_human, b_controls) = fingerprint_of([ARENA_CONTROL_POLICY, ARENA_CONTROL_HUMAN]);
        let (both_human, both_controls) =
            fingerprint_of([ARENA_CONTROL_HUMAN, ARENA_CONTROL_HUMAN]);

        // **The setup is asserted before the property is**, because the way
        // this test goes green while broken is by building one configuration
        // four times: four equal fingerprints over four identical buffers is
        // not evidence of anything.
        assert_eq!(
            [policy_controls, a_controls, b_controls, both_controls],
            [
                [ARENA_CONTROL_POLICY, ARENA_CONTROL_POLICY],
                [ARENA_CONTROL_HUMAN, ARENA_CONTROL_POLICY],
                [ARENA_CONTROL_POLICY, ARENA_CONTROL_HUMAN],
                [ARENA_CONTROL_HUMAN, ARENA_CONTROL_HUMAN],
            ],
            "the four configurations are not four different configurations",
        );
        assert_eq!(
            [a_human, b_human, both_human],
            [both_policy; 3],
            "the control byte reached Scenario::fingerprint",
        );
        assert_ne!(both_policy, 0, "the fingerprint is a zero the comparison cannot fail on");

        // The other side of the bound: a field that *is* supposed to reach the
        // fingerprint still does, so "nothing reaches it" cannot pass for this.
        let mut gripped = config;
        gripped.fighters[1].two_handed = true;
        let other = Scenario::duel_from(&gripped)
            .expect("the gripped duel builds")
            .try_fingerprint()
            .expect("the gripped duel names itself");
        assert_ne!(other, both_policy, "the grip stopped reaching the fingerprint");
    }

    #[test]
    fn a_two_handed_config_round_trips_through_the_arena_buffer() {
        // Write, read back, and compare the typed value rather than the bytes:
        // the parser is the marker's one consumer, so the claim worth having is
        // that what it hands `duel_from` is the configuration that was staged.
        let mut config = sim::DuelConfigV1::shipped();
        config.fighters[1].two_handed = true;
        let kinds = [PolicyKind::Scripted, PolicyKind::Tactical];
        write_arena_config(&config, kinds);
        let fighters = ARENA_CONFIG.with(|buffer| {
            let bytes = *buffer.borrow();
            [
                parse_arena_fighter(&bytes, 0).expect("fighter 0 parses").0,
                parse_arena_fighter(&bytes, 1).expect("fighter 1 parses").0,
            ]
        });
        assert_eq!(fighters, config.fighters);
        assert!(fighters[1].two_handed && !fighters[0].two_handed,
            "the marker landed on the wrong side");

        // And the whole path takes it: the fight installs, its fingerprint is
        // the grip's own, and it is a different fight from the one-handed club
        // on the same seed. The mirror drives the left arm instead of the
        // windmill script, so the **articulated** digest has to move; the
        // legacy `hash()` deliberately is not asserted, because two fighters
        // still walking toward each other are legacy-identical and the arms
        // live in the articulated block.
        config.max_ticks = 120;
        write_arena_config(&config, kinds);
        assert_eq!(arena_start(3) & 0xff, 1, "a two-handed club was refused");
        step(120);
        let gripped = (state_digest().value, arena_fingerprint());
        let mut single = config;
        single.fighters[1].two_handed = false;
        write_arena_config(&single, kinds);
        assert_eq!(arena_start(3) & 0xff, 1);
        step(120);
        assert_ne!(arena_fingerprint(), gripped.1, "the grip did not reach the fingerprint");
        assert_ne!(state_digest().value, gripped.0, "the grip changed nothing about the fight");

        // A second item beside the grip is a named refusal rather than a byte
        // error: the marker itself is canonical, the *pair* is the conflict,
        // and `validate_bindings` is the rule that says so.
        let mut conflicted = config;
        conflicted.fighters[1].hands[0] =
            Some(sim::HandItemV1::shipped(sim::ActionKind::Shield).expect("a shipped shield"));
        write_arena_config(&conflicted, kinds);
        assert_eq!(arena_start(3), ArenaRefusal::whole(ARENA_GRIP_CONFLICT).packed());
    }

    #[test]
    fn a_fight_with_no_human_side_takes_the_pending_loop_unchanged() {
        let mut config = sim::DuelConfigV1::shipped();
        config.max_ticks = 90;
        let kinds = [PolicyKind::Scripted, PolicyKind::Tactical];
        write_arena_config(&config, kinds);
        assert_eq!(arena_start(37) & 0xff, 1);
        assert_eq!(arena_control(0), u32::from(ARENA_CONTROL_POLICY));
        assert_eq!(arena_control(1), u32::from(ARENA_CONTROL_POLICY));
        step(config.max_ticks);
        let scenario = Scenario::duel_from(&config).expect("the control duel builds");
        assert_eq!(arena_state(), the_lab_loop(&scenario, 37, kinds));
    }

    #[test]
    fn a_scripted_arena_fight_in_wasm_matches_the_same_fight_in_lab() {
        // **The test that says the ported loop is the loop.** Same
        // configuration, same seed, same two policies -- one fight driven
        // through the wasm ABI from the configuration buffer, the other driven
        // by a hand-written copy of `lab`'s matchup loop, and the two compared
        // on the state hash, the outcome and the tick they stopped at. Without
        // it the whole live path is unverified: every export below could answer
        // plausibly while the fight inside was somebody else's.
        let mut config = sim::DuelConfigV1::shipped();
        // Long enough to reach contact and short enough to be a unit test. The
        // shipped fixture does not kill inside sixty seconds, so both runs stop
        // on the tick limit and the *limit* is what has to agree as well.
        config.max_ticks = 300;
        let kinds = [PolicyKind::Scripted, PolicyKind::Tactical];
        write_arena_config(&config, kinds);
        assert_eq!(
            arena_start(3),
            submit_result(1, ARENA_OK, ARENA_WHOLE_CONFIG, ARENA_WHOLE_CONFIG),
            "the shipped configuration was refused"
        );
        // One call for the whole fight, which is what a recorder does. The
        // overshoot is deliberate: the arena stops itself on the configuration's
        // tick limit, so asking for ten times the fight has to produce the fight.
        step(3_600);

        let scenario = Scenario::duel_from(&config).expect("the shipped pair");
        assert_eq!(arena_fingerprint(), scenario.fingerprint(), "the arena is not this configuration");
        assert_eq!(
            arena_state(),
            the_lab_loop(&scenario, 3, kinds),
            "the arena's fight is not the lab's fight"
        );
        // And it was a fight rather than three hundred quiet ticks. **The two
        // laws have split here twice and this is the second time.** The exact
        // law briefly ended the articulated fixture on a body at 229 once the
        // plate's normal began following the arm that carries it; the crush
        // channel took it back to the clock the same day, because crushing costs
        // integrity and opens no bleeding wound, so both bodies absorb more
        // before either falls. v2-ui-08 split them again by making the fight
        // embodied: the default law runs the configured clock out and the exact
        // one decides on a body at 244.
        //
        // Pinned from both sides rather than relaxed to `<= max_ticks`. A bound
        // that accepted either would accept a fixture that had stopped fighting
        // as readily as one that had got faster, and the *reason* to pin a
        // stopping tick at all is that it is the cheapest witness that the two
        // laws are two laws. The equality against `the_lab_loop` above is the
        // load-bearing one and has not moved on either law through any of it.
        assert!(arena_state().2 > 32, "the arena went quiet almost immediately");
        #[cfg(not(feature = "cartesian-recoil"))]
        assert_eq!(arena_state().2, config.max_ticks,
                   "the arena fight no longer runs its configured clock");
        #[cfg(feature = "cartesian-recoil")]
        assert_eq!(arena_state().2, 244,
                   "the exact law's decision tick moved");
        // One row per **live** articulated body, which is what `pose_len` means.
        // The default fight reaches the clock with both standing; the exact one
        // ends on a body, and one row is what that looks like from here.
        #[cfg(not(feature = "cartesian-recoil"))]
        assert_eq!(pose_len(), 2, "an arena publishes one pose row per fighter");
        #[cfg(feature = "cartesian-recoil")]
        assert_eq!(pose_len(), 1, "the exact law's decided fight left two bodies standing");
        assert!(combat_event_len() > 0, "three hundred ticks resolved no contact");
    }

    #[test]
    fn each_side_may_run_a_different_policy() {
        // The thing `policy::run` cannot do: it takes a single
        // `impl Policy` and installs it on both sides, which is right
        // for a control condition and useless for an arena. Its articulated twin
        // had the same shape and the same limitation, and is gone.
        //
        // Three pairings on one configuration and one seed. The asymmetric pair
        // and its mirror are what carry the claim: if the two sides shared an
        // instance, or if routing read anything but the alive set, those two
        // runs would be the same fight.
        let mut config = sim::DuelConfigV1::shipped();
        config.max_ticks = 200;
        let mut hashes = Vec::new();
        for kinds in [
            [PolicyKind::Scripted, PolicyKind::Scripted],
            [PolicyKind::Scripted, PolicyKind::Neutral],
            [PolicyKind::Neutral, PolicyKind::Scripted],
        ] {
            write_arena_config(&config, kinds);
            assert_eq!(arena_start(3) & 0xff, 1, "{kinds:?} was refused");
            assert_eq!(arena_policy(0), kinds[0].code());
            assert_eq!(arena_policy(1), kinds[1].code());
            step(config.max_ticks);
            hashes.push(hash());
        }
        assert_ne!(hashes[0], hashes[1], "the monsters' policy changed nothing");
        assert_ne!(hashes[0], hashes[2], "the heroes' policy changed nothing");
        assert_ne!(
            hashes[1], hashes[2],
            "the same two policies swapped between the sides produced the same fight"
        );
        // And the embodied registry says it does not know, rather than naming a
        // kind nothing here consults.
        assert_eq!(policy_kind(0), POLICY_KIND_UNKNOWN);
        assert_eq!(policy_kind(1), POLICY_KIND_UNKNOWN);
        assert_eq!(set_policy(0, PolicyKind::Neutral.code()), 0,
                   "an arena took an embodied policy");
        assert_eq!(arena_policy(0), PolicyKind::Neutral.code());
    }

    #[test]
    fn an_installed_arena_refuses_the_exports_that_would_rewrite_its_fight() {
        // **`arena_fingerprint` is an identity for the fight, and an identity is
        // only worth publishing if nothing can change the fight behind it.** The
        // page shows it, a recording carries it, and
        // `the_arena_fingerprint_is_stable_for_a_configuration` compares two
        // runs by it -- so an export that edits the world without moving the
        // word does not produce a wrong number, it produces a *true* number
        // attached to a different fight, which is worse because nothing looks
        // wrong.
        //
        // Both of these were protected by an unrelated bug until this session.
        // Every spec the host built carried no articulated row, so `try_spawn`
        // refused the whole path on any world with articulated columns; fixing
        // that so the spawn button worked again on the embodied floor is what
        // made this reachable. A rule that only held because something else was
        // broken is not a rule, so it is written down here.
        let mut config = sim::DuelConfigV1::shipped();
        config.max_ticks = 300;
        write_arena_config(&config, [PolicyKind::Scripted; 2]);
        assert_eq!(
            arena_start(3),
            submit_result(1, ARENA_OK, ARENA_WHOLE_CONFIG, ARENA_WHOLE_CONFIG),
            "the shipped configuration was refused",
        );
        step(30);

        let before = (state_digest().value, arena_fingerprint());
        assert_eq!(spawn_monster(Body::Skitterer as u32, 0, 0), 0, "the arena took a spawn");
        assert_eq!(set_hero_stat(0, 9), 0, "the arena took a stat edit");
        assert_eq!(set_policy(0, 0), 0, "the arena took a policy");
        assert_eq!(
            (state_digest().value, arena_fingerprint()),
            before,
            "a refused export still moved the world",
        );

        // And the refusals are refusals rather than silence: the same three
        // calls on the floor `init` opens are taken. Without this half the test
        // would pass on exports that answered `0` to everybody.
        init(1);
        assert!(spawn_monster(Body::Skitterer as u32, 0, 0) > 0, "the floor refused a spawn");
        assert_eq!(set_hero_stat(0, 9), 1, "the floor refused a stat edit");
        assert_eq!(set_policy(0, 0), 1, "the floor refused a policy");
    }

    #[test]
    fn arena_start_refuses_and_installs_nothing() {
        // A live fight to refuse *over*, so that "installs nothing" is a claim
        // about a world that is standing there rather than about `None`.
        let mut config = sim::DuelConfigV1::shipped();
        config.max_ticks = 120;
        let kinds = [PolicyKind::Scripted, PolicyKind::Tactical];
        write_arena_config(&config, kinds);
        assert_eq!(arena_start(3) & 0xff, 1);
        step(40);
        let standing = (hash(), arena_fingerprint(), tick(), arena_policy(0), arena_policy(1));

        let sword = sim::HandItemV1::shipped(sim::ActionKind::Sword).expect("a shipped sword");
        let shield = sim::HandItemV1::shipped(sim::ActionKind::Shield).expect("a shipped shield");
        // Every refusal a control can reach, one at a time. The reservation
        // refusal is deliberately absent: it needs an out-of-memory module and
        // cannot be provoked at `MAX_UNITS`, where the entity limit is the same
        // number -- exactly as `init_articulated`'s cannot. The seven spec
        // errors `Scenario::duel_from` makes structurally unreachable are absent
        // for the same kind of reason and are covered by
        // `the_arena_configuration_buffer_is_the_documented_layout`, which
        // asserts the mapping over the whole enum instead.

        // 1. An unknown layout, from both of its two causes. `1` is the retired
        // version whose hand byte was reserved-zero -- refused rather than
        // grandfathered, because this build would read its promise differently.
        write_arena_config(&config, kinds);
        poke_arena_config(ARENA_HEADER_LAYOUT, 1);
        assert_eq!(arena_start(9), ArenaRefusal::whole(ARENA_UNKNOWN_LAYOUT).packed());
        write_arena_config(&config, kinds);
        poke_arena_config(ARENA_HEADER_RESERVED, 1);
        assert_eq!(arena_start(9), ArenaRefusal::whole(ARENA_UNKNOWN_LAYOUT).packed());

        // 2. A fighter count this build does not fight.
        write_arena_config(&config, kinds);
        poke_arena_config(ARENA_HEADER_FIGHTERS, 3);
        assert_eq!(arena_start(9), ArenaRefusal::whole(ARENA_WRONG_FIGHTER_COUNT).packed());

        // 3. Noncanonical bytes, in each of the four places one can be. The
        // fighter block's reserved byte is `3` alone since layout 3; byte `2`
        // beside it is the control byte and answers `ARENA_UNKNOWN_CONTROL`,
        // which case 9 below covers and which is the difference the bump made.
        write_arena_config(&config, kinds);
        poke_arena_config(ARENA_HEADER_BYTES + ARENA_FIGHTER_RESERVED, 1);
        assert_eq!(arena_start(9), ArenaRefusal::fighter(ARENA_NONCANONICAL, 0).packed());
        // A two-handed marker where it describes nothing: on the left hand,
        // and above `1` on the right. `1` on the Brute's full right hand is
        // deliberately absent here -- that byte is now the legal two-handed
        // grip, and `a_two_handed_config_round_trips_through_the_arena_buffer`
        // is the test that says so.
        write_arena_config(&config, kinds);
        poke_arena_config(arena_hand_at(0, 0) + ARENA_HAND_TWO_HANDED, 1);
        assert_eq!(arena_start(9), ArenaRefusal::hand(ARENA_NONCANONICAL, 0, 0).packed());
        write_arena_config(&config, kinds);
        poke_arena_config(arena_hand_at(1, 1) + ARENA_HAND_TWO_HANDED, 2);
        assert_eq!(arena_start(9), ArenaRefusal::hand(ARENA_NONCANONICAL, 1, 1).packed());
        // And on an empty right hand: both hands gripping nothing.
        let club = sim::HandItemV1::shipped(sim::ActionKind::Club).expect("a shipped club");
        let mut left_handed_club = config;
        left_handed_club.fighters[1].hands = [Some(club), None];
        write_arena_config(&left_handed_club, kinds);
        poke_arena_config(arena_hand_at(1, 1) + ARENA_HAND_TWO_HANDED, 1);
        assert_eq!(arena_start(9), ArenaRefusal::hand(ARENA_NONCANONICAL, 1, 1).packed());
        write_arena_config(&config, kinds);
        // The Brute's empty left hand, with a dimension left behind in it.
        poke_arena_config(arena_hand_at(1, 0) + ARENA_HAND_DIMENSION_0, 1);
        assert_eq!(arena_start(9), ArenaRefusal::hand(ARENA_NONCANONICAL, 1, 0).packed());
        write_arena_config(&config, kinds);
        // A segment with a thickness, which is a shield's word and not a
        // sword's.
        poke_arena_config(arena_hand_at(0, 1) + ARENA_HAND_DIMENSION_2, 1);
        assert_eq!(arena_start(9), ArenaRefusal::hand(ARENA_NONCANONICAL, 0, 1).packed());

        // 4. An anatomy nobody has measured.
        write_arena_config(&config, kinds);
        poke_arena_config(ARENA_HEADER_BYTES + ARENA_FIGHTER_ANATOMY, 7);
        assert_eq!(arena_start(9), ArenaRefusal::fighter(ARENA_UNKNOWN_ANATOMY, 0).packed());

        // 5. An item code that is not an action at all.
        write_arena_config(&config, kinds);
        poke_arena_config(arena_hand_at(0, 0) + ARENA_HAND_ITEM, 42);
        assert_eq!(arena_start(9), ArenaRefusal::hand(ARENA_UNKNOWN_ITEM, 0, 0).packed());

        // 6. A policy code that is not a policy.
        write_arena_config(&config, kinds);
        poke_arena_config(ARENA_HEADER_BYTES + ARENA_FIGHTER_BYTES + ARENA_FIGHTER_POLICY, 9);
        assert_eq!(arena_start(9), ArenaRefusal::fighter(ARENA_UNKNOWN_POLICY, 1).packed());

        // 7. **Was the `learned` code with no network behind it, and there is no
        // seventh case.** `ARENA_NO_CHECKPOINT` was produced here; v2-ui-08 put
        // the arena on `PolicyKind`, which has no `learned` entry, and
        // retired the code. `the_retired_policy_reasons_are_reserved_and_unproduced`
        // is what replaced this case, and it is a wider claim than this one was:
        // it drives every byte a page can put in the slot and asserts that
        // neither retired number comes back from any of them.

        // 8. A placement the world will not build: the fighter dragged out
        // through the wall of a 24x16 room.
        let mut off_the_floor = config;
        off_the_floor.fighters[0].spawn = Vec2::from_ints(500, 6);
        write_arena_config(&off_the_floor, kinds);
        assert_eq!(arena_start(9), ArenaRefusal::whole(ARENA_CONSTRUCTION_REFUSED).packed());

        // 9. A dimension off the end of the scale.
        let mut nine_unit_blade = config;
        nine_unit_blade.fighters[0].hands[1] = Some(sim::HandItemV1 {
            geometry: sim::EquipmentGeometry::Segment {
                length: Fx::from_int(9),
                radius: Fx::from_ratio(1, 25),
            },
            ..sword
        });
        write_arena_config(&nine_unit_blade, kinds);
        assert_eq!(arena_start(9), ArenaRefusal::whole(ARENA_DIMENSION).packed());

        // 10. Two plates on one body.
        let mut two_shields = config;
        two_shields.fighters[0].hands = [Some(shield), Some(shield)];
        write_arena_config(&two_shields, kinds);
        assert_eq!(arena_start(9), ArenaRefusal::whole(ARENA_GRIP_CONFLICT).packed());

        // 11. Both dropdowns reading "empty", which is the refusal `duel_from`
        // grew a variant for rather than answering `LoadoutMismatch` to a person.
        let mut empty_handed = config;
        empty_handed.fighters[1].hands = [None, None];
        write_arena_config(&empty_handed, kinds);
        assert_eq!(arena_start(9), ArenaRefusal::whole(ARENA_NO_EQUIPMENT).packed());

        // 12. A Bow in the right hand without its canonical two-handed marker.
        // The action is valid; its grip is the named refusal.
        let mut a_bow = config;
        a_bow.fighters[0].hands[1] =
            Some(sim::HandItemV1 { action: sim::ActionKind::Bow, ..sword });
        write_arena_config(&a_bow, kinds);
        assert_eq!(arena_start(9), ArenaRefusal::whole(ARENA_BOW_GRIP).packed());

        // 13. An action with no shipped or runtime equipment row and therefore
        // no measured surface. Distinct from case 5: this is an item that exists.
        let mut a_knife = config;
        a_knife.fighters[0].hands[1] =
            Some(sim::HandItemV1 { action: sim::ActionKind::Knife, ..sword });
        write_arena_config(&a_knife, kinds);
        assert_eq!(arena_start(9), ArenaRefusal::whole(ARENA_UNKNOWN_ACTION).packed());

        // 14. A control byte that is neither of the two this build knows. `2` is
        // the first one past the pair, which is the value a layout-4 page would
        // write and the value a saved layout-3 configuration cannot hold.
        write_arena_config(&config, kinds);
        poke_arena_config(ARENA_HEADER_BYTES + ARENA_FIGHTER_CONTROL, 2);
        assert_eq!(arena_start(9), ArenaRefusal::fighter(ARENA_UNKNOWN_CONTROL, 0).packed());
        write_arena_config(&config, kinds);
        poke_arena_config(ARENA_HEADER_BYTES + ARENA_FIGHTER_BYTES + ARENA_FIGHTER_CONTROL, 255);
        assert_eq!(arena_start(9), ArenaRefusal::fighter(ARENA_UNKNOWN_CONTROL, 1).packed());

        // The refused calls later, the fight
        // that was running is still running: not one of them touched `SIM`,
        // republished a frame, or moved a tick.
        //
        // **This sentence read "seventeen refused calls covering thirteen
        // reasons" and both halves were wrong**, which arena-02 found by
        // counting the call sites instead of trusting them: there were eighteen
        // and twelve. A number in prose beside the code it describes goes stale
        // in exactly this direction, and the fix is to count it at the moment
        // you need it -- which is the same instruction `AGENTS.md` gives about
        // the rustfmt divergence count.
        assert_eq!(
            (hash(), arena_fingerprint(), tick(), arena_policy(0), arena_policy(1)),
            standing,
            "a refused configuration disturbed the world that was installed"
        );
        // And the instance is still usable, in both senses: it steps, and it
        // takes a new configuration.
        step(40);
        assert_eq!(tick(), standing.2 + 40);
        write_arena_config(&config, [PolicyKind::Neutral; 2]);
        assert_eq!(arena_start(11) & 0xff, 1, "the instance stopped accepting fights");
        assert_eq!(arena_policy(0), PolicyKind::Neutral.code());
        assert_eq!(tick(), 0);
    }

    #[test]
    fn the_retired_policy_reasons_are_reserved_and_unproduced() {
        // **The replacement for `the_learned_code_is_refused_by_name`**, which
        // v2-ui-05 wrote and v2-ui-08 removed the subject of. That test held
        // code `4`: `ArticulatedPolicyKind::from_code` knew it, `name` said
        // "learned", `build` answered `None`, and `arena_start` refused it by
        // name with `ARENA_NO_CHECKPOINT` until a network was loaded. The arena
        // reads `PolicyKind` now, whose `build` is total and which has
        // no `learned` entry, so both `ARENA_POLICY_UNAVAILABLE` and
        // `ARENA_NO_CHECKPOINT` lost their producers in one move.
        //
        // The numbers stay declared and reserved, on the codec's retired-schema
        // rule. What has to be checked is therefore two different things, and a
        // test that checked only the first would be the shape `AGENTS.md` calls
        // a green guard asserting nothing.
        //
        // **One: the numbers are still there and still distinct.**
        assert_eq!(ARENA_POLICY_UNAVAILABLE, 7);
        assert_eq!(ARENA_NO_CHECKPOINT, 26);
        assert!(ARENA_REASONS.contains(&ARENA_POLICY_UNAVAILABLE));
        assert!(ARENA_REASONS.contains(&ARENA_NO_CHECKPOINT));
        assert!(reasons_are_distinct(&ARENA_REASONS));

        // **Two: nothing produces them.** Every one of the 256 values a page can
        // write into a policy slot, on both sides, with a network installed and
        // without -- because "no checkpoint" was a refusal about an *absent*
        // asset and the honest way to say it is gone is to look for it in the
        // state where it used to fire. A registered code installs and its own
        // code is read back; anything else is `ARENA_UNKNOWN_POLICY`, which is
        // the one policy refusal that still has a producer.
        let config = sim::DuelConfigV1::shipped();
        let registered: Vec<u32> =
            PolicyKind::ALL.iter().map(|kind| kind.code()).collect();
        assert_eq!(registered, vec![0, 1, 2, 3, 4], "the embodied registry is no longer 0..5");
        for loaded in [false, true] {
            if loaded {
                assert_eq!(load_checkpoint(stage_shipped_checkpoint()) & 0xff, 1);
            } else {
                assert_eq!(checkpoint_installed(), 0, "this thread already loaded a network");
            }
            for side in 0..2 {
                for byte in 0..=255u32 {
                    write_arena_config(&config, [PolicyKind::Scripted; 2]);
                    poke_arena_config(
                        ARENA_HEADER_BYTES + side * ARENA_FIGHTER_BYTES + ARENA_FIGHTER_POLICY,
                        byte as u8,
                    );
                    let packed = arena_start(3);
                    let reason = ((packed >> 8) & 0xff) as u8;
                    assert_ne!(reason, ARENA_POLICY_UNAVAILABLE,
                        "policy byte {byte} on side {side} produced a retired reason");
                    assert_ne!(reason, ARENA_NO_CHECKPOINT,
                        "policy byte {byte} on side {side} produced a retired reason");
                    if registered.contains(&byte) {
                        assert_eq!(packed & 0xff, 1, "registered code {byte} was refused");
                        assert_eq!(arena_policy(side as u32), byte,
                            "code {byte} installed and read back as something else");
                    } else {
                        assert_eq!(packed, ArenaRefusal::fighter(ARENA_UNKNOWN_POLICY, side).packed(),
                            "unregistered code {byte} was not named");
                    }
                }
            }
        }

        // And the codes that moved meaning rather than disappearing, spelled out
        // because a page can have saved one. `4` was `learned` on the old
        // registry and is `tactical-fixed-guard` on this one -- it installs, and
        // it installs *something else*, which is worth an assertion because a
        // silent reinterpretation is the failure a reserved number exists to
        // prevent and this one is the case where reserving was not available.
        // `5` and `6` were `tactical` and `openings` and are now refused.
        assert_eq!(PolicyKind::from_code(4), Some(PolicyKind::TacticalFixedGuard));
        assert_eq!(PolicyKind::from_code(5), None);
        assert_eq!(PolicyKind::from_code(6), None);
    }

    #[test]
    fn a_live_tactical_fight_needs_no_checkpoint_fetch() {
        assert_eq!(checkpoint_installed(), 0);
        let config = sim::DuelConfigV1::shipped();
        write_arena_config(&config, [
            PolicyKind::Tactical,
            PolicyKind::Neutral,
        ]);
        assert_eq!(arena_start(23) & 0xff, 1);
        assert_eq!(arena_policy(0), PolicyKind::Tactical.code());
    }

    /// The shipped artifact, the one `lab learn-probe evaluate` scores and the
    /// one `lab trace --policy learned` records against.
    ///
    /// `include_bytes!` inside `#[cfg(test)]` and nowhere else, which is the
    /// whole delivery decision in one line: a checkpoint is a fighter, so the
    /// studio fetches it and the module never carries one. What the native
    /// tests need is the *same bytes* the wasm check reads off disk, and a
    /// fifteen-kilobyte constant in a test binary costs the shipped artifact
    /// nothing.
    #[cfg(test)]
    const SHIPPED_CHECKPOINT: &[u8] = include_bytes!("../../../checkpoints/v2-probe.ckpt");

    /// Writes [`SHIPPED_CHECKPOINT`] into the staging buffer and answers its
    /// length, the way a host does after a fetch.
    fn stage_shipped_checkpoint() -> u32 {
        stage_checkpoint(SHIPPED_CHECKPOINT)
    }

    fn stage_checkpoint(bytes: &[u8]) -> u32 {
        CHECKPOINT.with(|buffer| {
            let mut staged = buffer.borrow_mut();
            staged.fill(0);
            staged[..bytes.len()].copy_from_slice(bytes);
        });
        bytes.len() as u32
    }

    #[test]
    fn the_shipped_checkpoint_loads_and_names_itself() {
        // The delivery path end to end: bytes into the staging buffer, one call
        // to judge them, and a network installed. And the thing that makes a
        // live fight comparable with a recorded one -- the published digest is
        // the file's own SHA-256, which is the number `lab trace` writes into
        // its header and `learn-probe evaluate` prints.
        assert_eq!(checkpoint_installed(), 0);
        assert_ne!(checkpoint_ptr(), 0, "the staging buffer is at address zero");
        assert_eq!(checkpoint_capacity(), CHECKPOINT_CAPACITY as u32);
        assert_eq!(checkpoint_digest_len(), 32);
        assert!(
            SHIPPED_CHECKPOINT.len() <= CHECKPOINT_CAPACITY,
            "the shipped checkpoint is {} bytes and the buffer holds {CHECKPOINT_CAPACITY}",
            SHIPPED_CHECKPOINT.len(),
        );
        // Nothing loaded is thirty-two zeroes rather than a stale name.
        assert_eq!(read_checkpoint_digest(), [0u8; CHECKPOINT_DIGEST_BYTES]);

        let len = stage_shipped_checkpoint();
        assert_eq!(
            load_checkpoint(len),
            checkpoint_result(1, CHECKPOINT_OK, CHECKPOINT_NO_DETAIL),
            "the shipped checkpoint was refused",
        );
        assert_eq!(checkpoint_installed(), 1);
        let recorded = &SHIPPED_CHECKPOINT[SHIPPED_CHECKPOINT.len() - CHECKPOINT_DIGEST_BYTES..];
        assert_eq!(&read_checkpoint_digest()[..], recorded, "the published name is not the file's");
        // And it is a name and not a zero-fill: a corrupt loader that published
        // whatever was in the buffer would pass the line above on a file of
        // zeroes.
        assert!(recorded.iter().any(|&b| b != 0));
    }

    fn read_checkpoint_digest() -> [u8; CHECKPOINT_DIGEST_BYTES] {
        CHECKPOINT_DIGEST.with(|digest| *digest.borrow())
    }

    #[test]
    fn a_corrupt_checkpoint_is_refused_and_installs_nothing() {
        // **Every `CheckpointError` variant, and the instance still usable
        // afterwards.** The second half is the one that matters: a trap behind
        // `pub extern "C"` poisons the wasm instance for the life of the page,
        // so a mistyped URL that returned an HTML error page has to be a message
        // rather than a reload. Nothing here may panic and nothing here may
        // replace the network that is already installed.
        assert_eq!(load_checkpoint(stage_shipped_checkpoint()) & 0xff, 1);
        let installed = read_checkpoint_digest();
        let good = SHIPPED_CHECKPOINT.to_vec();

        let refuse = |bytes: &[u8], reason: u8, detail: u16| {
            let len = stage_checkpoint(bytes);
            assert_eq!(
                load_checkpoint(len),
                checkpoint_result(0, reason, detail),
                "reason {reason} was not the answer",
            );
            assert_eq!(checkpoint_installed(), 1, "a refusal uninstalled the network");
            assert_eq!(read_checkpoint_digest(), installed, "a refusal renamed the network");
        };

        // 1. Longer than the buffer. The one refusal that is about this module
        // rather than about the file, and the only one that never reads a byte.
        let oversized = vec![0u8; CHECKPOINT_CAPACITY + 1];
        assert_eq!(
            load_checkpoint(oversized.len() as u32),
            checkpoint_result(0, CHECKPOINT_TOO_LONG, CHECKPOINT_NO_DETAIL),
        );
        assert_eq!(checkpoint_installed(), 1);

        // 2. Truncated, in each of the places the reader can run out.
        for cut in [0, 4, 24, good.len() - 33, good.len() - 1] {
            let len = stage_checkpoint(&good[..cut]);
            let packed = load_checkpoint(len);
            assert_eq!(packed & 0xff, 0, "a checkpoint cut to {cut} bytes loaded");
            let reason = ((packed >> 8) & 0xff) as u8;
            assert!(
                reason == CHECKPOINT_TRUNCATED || reason == CHECKPOINT_BAD_MAGIC,
                "a checkpoint cut to {cut} bytes answered reason {reason}",
            );
            assert_eq!(checkpoint_installed(), 1);
        }

        // 3. Not a checkpoint at all: the renamed trace, the 404 body.
        let mut bad = good.clone();
        bad[0] = b'<';
        refuse(&bad, CHECKPOINT_BAD_MAGIC, CHECKPOINT_NO_DETAIL);

        // 4-6. The three adjacent version words, which must not be
        // interchangeable: a framing bump means this reader cannot parse the
        // file, and a layout bump means it parsed perfectly and the weights are
        // still void. Each detail carries what the file claimed.
        let mut bad = good.clone();
        bad[8..12].copy_from_slice(&99u32.to_le_bytes());
        refuse(&bad, CHECKPOINT_UNKNOWN_FORMAT, 99);
        let mut bad = good.clone();
        bad[12..16].copy_from_slice(&7u32.to_le_bytes());
        refuse(&bad, CHECKPOINT_FEATURE_LAYOUT, 7);
        let mut bad = good.clone();
        bad[16..20].copy_from_slice(&9u32.to_le_bytes());
        refuse(&bad, CHECKPOINT_ACTION_LAYOUT, 9);

        // 7. A different `ModelShape`.
        let mut bad = good.clone();
        bad[20..24].copy_from_slice(&7u32.to_le_bytes());
        refuse(&bad, CHECKPOINT_SHAPE, CHECKPOINT_NO_DETAIL);

        // 8. The right shape declared and a different number of weights behind
        // it, self-consistently digested. Distinct from case 7 on purpose:
        // reporting a shape the file never claimed sends a reader looking for a
        // retraining bill they do not owe.
        let full = learn_core::ModelShape::CURRENT.weight_count();
        let weights_at = good.len() - CHECKPOINT_DIGEST_BYTES - full * 4;
        let mut bad = good[..weights_at - 4].to_vec();
        bad.extend_from_slice(&((full - 1) as u32).to_le_bytes());
        bad.extend_from_slice(&good[weights_at..weights_at + (full - 1) * 4]);
        bad.extend_from_slice(&learn_core::sha256(&bad));
        refuse(&bad, CHECKPOINT_WEIGHT_COUNT, (full - 1) as u16);

        // 9. One flipped bit in the middle: parseable, correctly shaped, and not
        // the file that was written.
        let mut bad = good.clone();
        bad[good.len() / 2] ^= 0x01;
        refuse(&bad, CHECKPOINT_DIGEST_MISMATCH, CHECKPOINT_NO_DETAIL);

        // 10-11. The two not-finite refusals, both re-digested so the files are
        // internally consistent. A NaN weight is the case the digest cannot
        // catch and the one that would otherwise turn the fighter into "always
        // head index zero" with nothing anywhere reporting it.
        let mut checkpoint =
            Checkpoint::from_bytes(&good).expect("the shipped checkpoint is loadable");
        checkpoint.model.weights_mut()[1_000] = f32::NAN;
        refuse(&checkpoint.to_bytes(), CHECKPOINT_NOT_FINITE, 1_000);
        let mut checkpoint =
            Checkpoint::from_bytes(&good).expect("the shipped checkpoint is loadable");
        checkpoint.training.sigma = f32::NAN;
        refuse(&checkpoint.to_bytes(), CHECKPOINT_NOT_FINITE_RECORD, CHECKPOINT_NO_DETAIL);

        // 12. Two files concatenated, or a rewrite that did not truncate.
        let mut bad = good.clone();
        bad.extend_from_slice(&[0u8; 5]);
        refuse(&bad, CHECKPOINT_TRAILING_BYTES, 5);

        // Every refusal has its own number, and the mapping over the enum is
        // injective. The compile-time half is the `const _` beside
        // `CHECKPOINT_REASONS`; this is the half that needs the variants in
        // hand, and the list is written out because `CheckpointError` is a
        // foreign enum this crate cannot walk. The `match` in
        // `checkpoint_refusal` is exhaustive, so a new variant is a failed build
        // there -- and then this count is what says somebody thought about it
        // here too.
        assert_eq!(CHECKPOINT_REASONS.len(), 13, "a checkpoint refusal was added or removed");

        // And the instance is still usable after twenty refused calls, in both
        // senses: it takes the good file again, and it runs a fight with it.
        //
        // **The fight is no longer the network's**, because no arena code names
        // one since v2-ui-08. What the pairing still says is the thing it was
        // written for: twenty refused loads did not leave the module unable to
        // install a checkpoint or to open a duel. The digest below is what says
        // the network that was installed is the right one.
        assert_eq!(load_checkpoint(stage_shipped_checkpoint()) & 0xff, 1);
        assert_eq!(read_checkpoint_digest(), installed);
        assert_ne!(learned_inference_digest_lo(), 0,
                   "the reinstalled network is not being read");
        let mut config = sim::DuelConfigV1::shipped();
        config.max_ticks = 40;
        write_arena_config(&config, [PolicyKind::Scripted, PolicyKind::Tactical]);
        assert_eq!(arena_start(3) & 0xff, 1, "the instance stopped taking fights");
        step(config.max_ticks);
        assert_eq!(tick(), config.max_ticks);
    }

    // **`a_learned_fight_in_wasm_matches_the_same_fight_in_lab` went with the
    // arena's `learned` code in v2-ui-08, and this is what it said.** It drove
    // 3,600 ticks through the `pub extern "C"` ABI with a checkpoint on the
    // Fighter, drove the same fight again through a hand-written copy of `lab`'s
    // matchup loop, and required the state hash, the outcome and the stopping
    // tick to agree -- which is a much stronger statement than
    // `LEARNED_INFERENCE_DIGEST` makes, because every command changes the
    // observation the next one is made from, so one divergent logit moves the
    // hash and keeps it moved. Its second half swapped the network for a script
    // and required a different fight, so "the network is consulted at all" was
    // measured rather than assumed.
    //
    // Its subject is gone: an arena policy byte is an `PolicyKind::code`
    // and that registry has no `learned` entry, for the reason written on the
    // enum. **What is lost, and what is not.**
    // `a_scripted_arena_fight_in_wasm_matches_the_same_fight_in_lab` still holds
    // the two spellings of the loop against each other over a full fight, so the
    // *loop* is as covered as it was. `LEARNED_INFERENCE_DIGEST` still pins the
    // network across the two targets over its sixty-four-case corpus, and is
    // still taken over the checkpoint this module installed. What no longer has
    // a test here is compounding learned decisions through this ABI -- and the
    // reason that is a boundary rather than a hole is that nothing through this
    // ABI can produce them. `crates/learn`'s own rollouts are where a learned
    // fight is driven now.

    #[test]
    fn native_and_wasm_learned_inference_digests_match() {
        // The native half of the pin. The other half is in `tools/wasm_check.js`
        // and reads the same number out of `web.wasm`, which is the whole of
        // what this session set out to check: `model.rs`'s portability argument
        // had no second host to be tested on, and now it has one.
        //
        // Duplicated rather than shared, on the rule the golden registry states
        // for every browser pin -- a one-sided failure diagnoses target
        // disagreement, and a failure on both sides is a behaviour change.
        assert_eq!(
            learned_inference_digest_lo(),
            0,
            "a digest was published before a network was installed",
        );
        assert_eq!(learned_inference_digest_hi(), 0);

        assert_eq!(load_checkpoint(stage_shipped_checkpoint()) & 0xff, 1);
        let measured =
            u64::from(learned_inference_digest_lo()) | (u64::from(learned_inference_digest_hi()) << 32);
        assert_eq!(
            measured, LEARNED_INFERENCE_DIGEST,
            "LEARNED_INFERENCE_DIGEST moved: {measured:#018x}",
        );

        // Self-contained, exactly as `articulated_stream_digest_lo` is: a worker
        // may ask for this mid-fight, and a diagnostic that stepped the
        // installed world would break the thing it was diagnosing.
        init(4);
        step(12);
        let undisturbed = || (tick(), hash(), frame_len(), pose_len());
        let before = undisturbed();
        learned_inference_digest_lo();
        learned_inference_digest_hi();
        assert_eq!(undisturbed(), before, "the inference digest disturbed the installed sim");
    }

    #[test]
    fn the_shipped_corpus_produces_only_finite_logits() {
        // The half of the cross-target argument that `learn_core::portable_bits`
        // rests on. A NaN logit's payload bits are unspecified in WebAssembly,
        // so that function folds every NaN onto one constant -- and the fold is
        // only guaranteed not to have moved `LEARNED_INFERENCE_DIGEST` if the
        // shipped checkpoint never reaches it. Every one of the 1,152 words is
        // checked here rather than argued from the clamp on the features,
        // because "the weights are small" is a property of *this* file and the
        // export accepts any file a person picks.
        let model = Checkpoint::from_bytes(SHIPPED_CHECKPOINT)
            .expect("the shipped checkpoint is loadable")
            .model;
        let mut features = [0.0f32; learn_core::LEARN_FEATURE_COUNT];
        let mut hidden = [0.0f32; learn_core::HIDDEN_UNITS];
        let mut logits = [0.0f32; learn_core::LEARN_ACTION_LOGITS];
        let mut memory = learn_core::FeatureMemory::EMPTY;
        let mut words = 0;
        for index in 0..learn_core::LEARNED_INFERENCE_CASES {
            let obs = learn_core::learned_inference_case(index);
            memory = learn_core::write_features(&obs, memory, &mut features);
            model.forward(&features, &mut hidden, &mut logits);
            for (head, logit) in logits.iter().enumerate() {
                assert!(logit.is_finite(), "case {index} logit {head} is {logit}");
                words += 1;
            }
        }
        assert_eq!(
            words,
            learn_core::LEARNED_INFERENCE_CASES * learn_core::LEARN_ACTION_LOGITS,
        );
    }

    #[test]
    #[ignore]
    fn print_the_learned_inference_digest() {
        // Written out again rather than shared with the test above, on the
        // reason the other two printers in this module give: a printer that
        // called the assertion's helper could only ever print the number the
        // assertion already agreed with.
        assert_eq!(load_checkpoint(stage_shipped_checkpoint()) & 0xff, 1);
        let checkpoint =
            Checkpoint::from_bytes(SHIPPED_CHECKPOINT).expect("the shipped checkpoint is loadable");
        println!(
            "LEARNED_INFERENCE_DIGEST: {:#018x}",
            learn_core::learned_inference_digest(&checkpoint.model),
        );
        println!("checkpoint:               {}", checkpoint.digest());
        println!("checkpoint bytes:         {}", SHIPPED_CHECKPOINT.len());
        println!(
            "corpus:                   {} cases, {} logits each",
            learn_core::LEARNED_INFERENCE_CASES,
            learn_core::LEARN_ACTION_LOGITS,
        );
    }

    #[test]
    fn descending_out_of_an_arena_returns_an_ordinary_floor() {
        // **`Sim::descend` mutates in place, so every field it does not reassign
        // survives into the next floor.** That is right for `spawns` and wrong
        // for the duel, and until v2-ui-05's review it left `Sim::arena`
        // standing: a freshly generated eight-body floor was then driven by
        // `Sim::advance_arena` against a roster from a world that no longer
        // existed and stopped dead on the previous configuration's tick limit,
        // with `arena_fingerprint` still naming the old duel and `set_policy`
        // still refusing the legacy codes that are the true answer here. Nothing
        // anywhere reported it; the page was a hung level.
        let mut config = sim::DuelConfigV1::shipped();
        config.max_ticks = 300;
        let kinds = [PolicyKind::Scripted, PolicyKind::Tactical];
        write_arena_config(&config, kinds);
        assert_eq!(arena_start(3) & 0xff, 1, "the shipped configuration was refused");
        step(50);
        assert_eq!(arena_policy(0), kinds[0].code(), "the fight to descend out of is not running");
        assert_eq!(descend(), 1, "the run did not move down a floor");

        // Every export that can say the duel is gone says so.
        assert_eq!(arena_policy(0), ARENA_NO_POLICY, "the floor below is still an arena");
        assert_eq!(arena_policy(1), ARENA_NO_POLICY);
        assert_eq!(arena_fingerprint(), 0, "a generated floor is named by a duel's configuration");
        assert_ne!(policy_kind(0), POLICY_KIND_UNKNOWN, "an ordinary floor cannot name its policy");
        assert_eq!(set_policy(0, PolicyKind::Neutral.code()), 1,
                   "an ordinary floor refused an embodied policy");
        assert_eq!(policy_kind(0), PolicyKind::Neutral.code());

        // And it is a level that runs rather than one that has stopped. 300 is
        // where the tick used to stick, because `advance_arena`'s gate was still
        // reading the previous configuration's limit.
        step(600);
        assert_eq!(tick(), 600, "the floor stopped at the previous fight's tick limit");
        step(600);
        assert_eq!(tick(), 1_200);
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn exact_wasm_check_fights_match_the_same_native_configuration() {
        // `tools/wasm_check.js` stages deliberately round, legal equipment
        // dimensions rather than `DuelConfigV1::shipped()`'s table. Comparing
        // its fight with the shipped native fixture once made 278 look like a
        // wasm move from 164; those were different configurations. Pin the
        // words first, then the stopping ticks, so that mistake cannot recur.
        let mut config = sim::DuelConfigV1::shipped();
        config.max_ticks = 300;
        {
            let shield = config.fighters[0].hands[0].as_mut().expect("the hero shield");
            shield.mass = Fx::from_raw(32_768);
            shield.balance = Fx::from_raw(32_768);
            shield.geometry = sim::EquipmentGeometry::Shield {
                half_width: Fx::from_raw(16_384),
                half_height: Fx::from_raw(32_768),
                thickness: Fx::from_raw(3_277),
            };
            let sword = config.fighters[0].hands[1].as_mut().expect("the hero sword");
            sword.mass = Fx::from_raw(81_920);
            sword.balance = Fx::from_raw(32_768);
            sword.geometry = sim::EquipmentGeometry::Segment {
                length: Fx::from_raw(65_536), radius: Fx::from_raw(2_621),
            };
            let club = config.fighters[1].hands[1].as_mut().expect("the brute club");
            club.mass = Fx::from_raw(131_072);
            club.balance = Fx::from_raw(32_768);
            club.geometry = sim::EquipmentGeometry::Segment {
                length: Fx::from_raw(81_920), radius: Fx::from_raw(3_277),
            };
        }

        let scripted = [PolicyKind::Scripted, PolicyKind::Tactical];
        write_arena_config(&config, scripted);
        let hand_words = ARENA_CONFIG.with(|buffer| {
            let bytes = buffer.borrow();
            core::array::from_fn(|row| {
                let at = arena_hand_at(row / 2, row % 2);
                let word = |offset| i32::from_le_bytes(
                    bytes[at + offset..at + offset + 4].try_into().expect("one arena word"));
                [bytes[at + ARENA_HAND_ITEM] as i32,
                 word(ARENA_HAND_MASS), word(ARENA_HAND_BALANCE),
                 word(ARENA_HAND_DIMENSION_0), word(ARENA_HAND_DIMENSION_0 + 4),
                 word(ARENA_HAND_DIMENSION_0 + 8)]
            })
        });
        assert_eq!(hand_words, [
            [4, 32_768, 32_768, 16_384, 32_768, 3_277],
            [2, 81_920, 32_768, 65_536, 2_621, 0],
            [255, 0, 0, 0, 0, 0],
            [3, 131_072, 32_768, 81_920, 3_277, 0],
        ], "the native twin no longer stages wasm_check's equipment words");
        assert_eq!(arena_start(3) & 0xff, 1, "the scripted fixture was refused");
        step(3_600);
        // **The corrected stance reaches the configured limit, not the former
        // exact-law decision on tick 263.** This fixture reaches the changed law
        // before contact: on tick 25 the scripted fighter has achieved yaw 91
        // while translating, and the retired movement-derived hip target is 94
        // after the fixed-point angle round trip. The wasm side pins the same
        // limit against the same staged words.
        assert_eq!(tick(), 300, "the exact scripted fixture's stopping tick moved");

        // **The second fixture was `learned` against `windmill` and is now
        // `tactical` against `tactical-fixed-guard`.** The point of a second one
        // is unchanged -- two staged fights over one set of equipment words, so
        // a stopping tick that moved for a *policy* reason is told apart from one
        // that moved for a geometry reason -- and the pair it uses had to change
        // because no arena policy code names a network any more. It is also the
        // pair `tools/wasm_check.js` finds byte-identical under this law. After
        // the stance-authority correction both reach the configured bound; the
        // exact-law pair still agrees byte for byte there.
        assert_eq!(load_checkpoint(stage_shipped_checkpoint()) & 0xff, 1);
        write_arena_config(&config,
            [PolicyKind::Tactical, PolicyKind::TacticalFixedGuard]);
        assert_eq!(arena_start(3) & 0xff, 1, "the second fixture was refused");
        step(3_600);
        assert_eq!(tick(), 300, "the exact tactical fixture's stopping tick moved");
    }

    // **`an_installed_arena_refuses_every_order_export` went with the exports it
    // named.** It drove one duel four times, disturbing each run with `set_goto`,
    // `set_focus`, `clear_order` and `route_push`, and required all four to leave
    // the state hash exactly where the clean run left it -- because an arena's
    // fingerprint is `Scenario::try_fingerprint` of the *configuration*, and an
    // input that moves the fight without moving the name makes a recording
    // nobody can reproduce. That argument is not gone; its subject is. The one
    // channel left that could still do it is `set_policy`, and
    // `each_side_may_run_a_different_policy` is where an arena refusing it is
    // checked.

    // **`articulated_wasm_scratch_is_fixed_and_submission_is_atomic` stood here
    // and went with the export it drove.** It was `submit_articulated`'s
    // refusal ladder -- wrong model, then stale subject, then malformed, then
    // out-of-range, then missing equipment, each rung asserting that a refused
    // command left `World::state_digest` exactly where it found it. The ladder
    // is not lost: `the_embodied_wasm_scratch_is_its_own_buffer_and_submission_is_atomic`
    // runs the same rungs against the export that survives, which is why that
    // one was written as this one's twin rather than as a second reader of it.
    // What is lost is the *pair*, and that is the honest accounting -- there is
    // one grammar now, so a page can no longer offer the wrong one.

    /// `ARTICULATED_COMMAND_HASH`: one hand-written wire buffer, stored through
    /// the boundary, read back as `World::state_digest`.
    ///
    /// **Split out of `articulated_wasm_scratch_is_fixed_and_submission_is_atomic`
    /// when the pin moved to the embodied duel, because the two halves stopped
    /// sharing an export.** That test was about `submit_articulated`'s refusal
    /// *ordering* and has since gone with it; this is about the bytes a
    /// **browser** can stage into the grammar the game runs, which means
    /// [`init_embodied_test`] and [`submit_embodied`]. The split is why this
    /// pin's fixture survived that deletion untouched.
    ///
    /// **`init_embodied_test` and not `embodied_test_world`**, even though the
    /// two build the same world: this number is a *paired* golden, and
    /// `tools/wasm_check.js` can only reach a world an export opens for it. A pin
    /// whose fixture the far side cannot build is a pin with one owner.
    ///
    /// **The buffer is written out rather than encoded, and that is the point of
    /// it.** `tools/wasm_check.js` stages the same sixty-one bytes from a copy it
    /// keeps itself; a fixture assembled by calling `payload_bytes` would agree
    /// with a drifting encoder by construction, which is the failure mode that
    /// file records for the contact corpus.
    #[test]
    fn the_embodied_command_fixture_is_stored_and_pinned_across_both_targets() {
        init_embodied_test(1);
        // **Sixty-one bytes where the articulated twin was fifty-seven, and the
        // envelope's kind byte is `0x02` rather than `0x01`.** The fifty-three
        // shared payload bytes below are the same ones `crates/sim/src/command.rs`
        // spells out, byte for byte, because `write_payload` is one function and
        // the fork is about width; the four appended are the two swing planes.
        //
        // Three asymmetric pairs and no accident among them. The trailing
        // release verbs are `0x00,0x01` -- the left arm keeps, the right looses
        // -- which catches a writer filling both arms from one. The two planes
        // are `0x4567` and `0x89ab`: **different, and neither of them zero**,
        // for `EMBODIED_FIXTURE_PLANE`'s reason in `crates/sim/src/codec.rs`. A
        // pair that was equal, or that was the neutral plane `CommandV1::new`
        // answers, would round-trip just as happily through a boundary that
        // truncated the buffer back to the articulated width or read one offset
        // twice.
        let fixture: [u8; 61] = [
            0x02,0x00,0x02,0x00, 0x01,0x00,0x00,0x00, 0xfe,0xff,0xff,0xff,
            0x34,0x12,0x01, 0x44,0x33,0x22,0x11, 0x88,0x77,0x66,0x55,
            0x45,0x23, 0x00,0x40,0x00,0x00, 0x03,0x00,0x00,0x00,
            0x04,0x00,0x00,0x00, 0x56,0x34, 0x00,0xc0,0x00,0x00,
            0x05,0x00,0x00,0x00, 0x06,0x00,0x00,0x00, 0x02,0x01,0x01,0x00,
            0x00,0x01, 0x67,0x45, 0xab,0x89,
        ];
        EMBODIED_COMMAND.with(|buffer| *buffer.borrow_mut() = fixture);
        assert_eq!(submit_embodied(0, 0), 1);
        let fixture_digest = SIM.with(|sim| sim.borrow().as_ref().unwrap().world.state_digest().value);
        // Moved by v2-15, and by exactly one thing: ArticulatedV1 hashing now
        // writes one 61-byte anatomy row per allocated slot after the global
        // `cap_hits:u32`. This fixture is unstepped, so every row is the
        // construction row -- regional maxima, no wound, no severance, full
        // blood, no shock, `EntityId::NONE` -- and the move was predicted from
        // that before it was measured. Moved once before, by v2-14C appending
        // `cap_hits` itself, from `0x584d711e492950e7` to `0x010411d521a376d7`.
        //
        // **Moved again by v2-20, and this fixture being unstepped is exactly
        // why.** `initialize_pose` calls `derive_shield_pose` at
        // spawn, the ArticulatedV1 digest writes the plate's `half_width`,
        // `half_height` and `thickness` per slot, and two of those three are
        // what that session edited. So this is a *construction* move: nothing
        // about how the world steps changed, only what the Fighter is
        // holding when the world is built. Previously `0x6e61_a92e_c96a_c3a6`.
        //
        // **Moved again by articulated-bow step 1, and this one is a layout
        // move where the three before it were construction or values moves.**
        // The payload gained one `ReleaseRequest` byte per arm, 51 to 53, and
        // `World::state_digest` writes `payload_bytes()` for every stored
        // command -- so this fixture's single stored command puts two more
        // bytes into the stream. Both verbs are `Keep` here, which is precisely
        // what makes it a layout move rather than a values one: the two bytes
        // are zero and the number moves anyway, because their presence is the
        // change. Predicted off this fixture in writing before the gate ran.
        // Previously `0xd1da_6a40_df04_80b2`.
        //
        // **Moved once more when the authoritative articulated-projectile
        // store was appended to `World::state_digest`.** Even this unstepped
        // fixture now writes the store's allocated-slot count after the
        // release-state rows. It is zero, but the four bytes are present, so
        // this is another grammar move rather than a projectile-values move.
        // Previously `0x28dc_a7e7_57a1_ba3f` (default) and
        // `0x8d92_c50f_3a16_ebce` (exact).
        //
        // **Moved again by the session that deleted the legacy columns, and
        // this one is a *subtraction* where the five before it were additions.**
        // `state_digest_value` folds `legacy_core_hash` before it writes a
        // byte of its own, and that function lost `hp`, `max_hp`, the submitted
        // `command` word and the whole nine-column projectile block -- so this
        // reading could not have stayed still, and the plan that owned the
        // session listed this pin among the ones that must not move. It was
        // wrong for a reason worth writing down where the next reader is
        // standing: **this is a `World::state_digest` pin, not a published-bytes
        // pin, and every state-digest pin folds `legacy_core_hash`.** There are
        // five of them. `ARTICULATED_STREAM_DIGEST` above is the published-bytes
        // one, and it did not move.
        //
        // **Moved a seventh time when its fixture was reseated onto the embodied
        // model, and this one is neither an append nor a subtraction: it is the
        // fixture.** The probe is [`init_embodied_test`]'s
        // `Scenario::embodied_duel` where it was `init_articulated_test`'s
        // `Scenario::articulated_duel`, and the bytes go in through
        // [`submit_embodied`] instead of [`submit_articulated`]. Four routes
        // reach the number and all four were predicted from the fixture before
        // the run:
        //
        // 1. `state_digest_value` writes the model byte and the payload
        //    tag, and both go `1 -> 2` for Embodied.
        // 2. `World::state_digest` writes `payload_bytes()` for every stored
        //    command, and the embodied payload is 57 bytes where the articulated
        //    one is 53 -- the two swing planes, which this fixture makes
        //    different and nonzero rather than neutral.
        // 3. The embodied state stream carries a tail the articulated one has
        //    no columns for: `ground_z`, the stance rows and the elbow planes.
        // 4. The probe is still unstepped, so every body row is its construction
        //    row -- but an embodied body is constructed with legs and jointed
        //    arms, so the construction is a different one.
        //
        // Previously `0x30cc_bd6f_c089_1853` (default) and
        // `0xfb22_a48c_eb8b_8132` (exact). Native MSVC measured both values
        // below before either wasm mirror was edited, and a fresh wasm artifact
        // of each configuration then answered the same numbers -- which is what
        // makes this a re-record rather than target disagreement. The move
        // before it was the legacy-column subtraction, from
        // `0x7194_bc63_6096_a0ff` (default) and `0x3128_2286_fc15_7e8e` (exact).
        #[cfg(not(feature = "cartesian-recoil"))]
        assert_eq!(fixture_digest, 0xbe7d_c38c_780c_4403);
        #[cfg(feature = "cartesian-recoil")]
        // Moved with its default-law twin above, and by the same reseat.
        assert_eq!(fixture_digest, 0x8ba5_f039_b1a7_6712,
            "the unregistered exact-law command witness moved");
    }

    #[test]
    fn the_articulated_boundary_reserves_the_frame_ceiling_before_it_publishes() {
        init_embodied_test(1);
        assert_eq!(
            contact_high_water(),
            MAX_UNITS as u32,
            "the fixture published a world whose contact vectors it had not reserved",
        );
        // **The half that made this a reading of *this* world rather than a
        // sticky flag has lost its subject.** It opened a Legacy room, which
        // owns no contact state at all, and required the export to answer zero
        // rather than the ceiling the last articulated world was given. `init`
        // opens a world with contact columns now, so there is no world this
        // module installs that can honestly answer zero -- except a refused
        // install, which `init_fails_closed_and_installs_nothing` is where the
        // export is read against.
        init(1);
        assert_eq!(contact_high_water(), MAX_UNITS as u32,
            "the floor `init` opens published a world it had not reserved for");
    }

    /// A body walked in from the boundary is dressed for the world it walks
    /// into, and the room stops taking them at the frame's own ceiling.
    ///
    /// **This used to be `an_articulated_world_refuses_a_boundary_spawn_instead_of_trapping`,
    /// and the refusal it pinned was a defect rather than a contract.** Every
    /// spec this crate built carried `combat_spec: None`, so a world with
    /// articulated columns refused the whole path -- `CombatSpecError::UnitPresence`
    /// -- and the enemy panel answered `0` to every press. That was invisible
    /// while `init` opened a Legacy room and would have been the first thing a
    /// player noticed the moment it stopped. [`equip_articulated`] is the repair
    /// and this is where it is checked.
    ///
    /// What survives from the old test is the *shape*: a refusal is a `0` and
    /// never a panic, because `World::spawn` turns a refused construction into
    /// one and a panic behind `pub extern "C"` poisons the instance for the life
    /// of the page. The row count is still driven past [`MAX_UNITS`] to reach it.
    #[test]
    fn a_boundary_spawn_is_dressed_for_the_world_it_walks_into() {
        init_quiet(1);
        assert!(spawn_monster(SKITTERER, SLOT_EMPTY, SLOT_EMPTY) > 0,
            "the enemy panel could not walk a body onto an embodied floor");
        // Dressed, and the pose section is what says so: a body with no anatomy
        // row publishes none, so a pose per body is the whole claim.
        assert_eq!(pose_len(), 2, "the newcomer arrived without an anatomy");
        assert_eq!(poses_dropped(), 0);
        assert!(spawn_from_template() > 0, "the template door refused an embodied floor");
        assert_eq!(pose_len(), 3);

        // And the ceiling, which is where a refusal still lives. The frame holds
        // `MAX_UNITS` rows and the world reserves for exactly that many, so the
        // room stops taking bodies rather than trapping on the one past the end.
        let mut refused = false;
        for _ in 0..MAX_UNITS + 1 {
            if spawn_monster(SKITTERER, SLOT_EMPTY, SLOT_EMPTY) == 0 {
                refused = true;
                break;
            }
        }
        assert!(refused, "the room took more bodies than the frame can publish");
        let before = SIM.with(|sim| sim.borrow().as_ref().unwrap().world.state_digest().value);
        assert_eq!(spawn_monster(SKITTERER, SLOT_EMPTY, SLOT_EMPTY), 0);
        assert_eq!(spawn_from_template(), 0, "the enemy panel walked past the ceiling");
        // Refused one step earlier than the other two -- the hero is still
        // standing -- so this records the answer rather than the reason.
        assert_eq!(swap_in_hero(0, SLOT_EMPTY, SLOT_EMPTY), 0, "a replacement arrived anyway");
        let after = SIM.with(|sim| sim.borrow().as_ref().unwrap().world.state_digest().value);
        assert_eq!(after, before, "a refused spawn mutated the world");
        assert_eq!(
            contact_high_water(),
            MAX_UNITS as u32,
            "a refused spawn moved the reservation",
        );
    }

    // ------------------------------------------------- the boundary clinch
    //
    // The drive `client/test/wasm-memory.test.mjs` uses to reach the contact
    // group cap, pinned here in the crate that owns the exports it calls.
    //
    // **Written as bytes on both sides on purpose.** The JavaScript builds the
    // same sixty-one from the same documented offsets; if the two agreed only
    // because one of them called `payload_bytes`, the browser fixture would be
    // proving that `sim` agrees with itself. The constants below are the duel's
    // own geometry and nothing else -- see each one.
    //
    // **It was an articulated drive on `init_articulated_test` and is an
    // embodied one on [`init_embodied_test`], and the translation is two
    // fields.** The embodied grammar reads the walk vector in the body frame and
    // measures an arm bearing from the torso, so `CLINCH_WALK`'s per-row world
    // vector becomes one torso-forward magnitude for both rows and the arm
    // bearings become offsets from zero. `body_yaw` is unchanged: a torso
    // measured relative to itself would say nothing, so it was a world angle
    // under both frames.

    /// Tick-zero bearing from each duel row to the other, as
    /// `Angle::raw`. The duel spawns at `(7,6)` and `(17,10)`, so
    /// these are `atan2(4,10)` and its opposite, and they are constants rather
    /// than a readback because the drive never re-aims: a fixture that steered
    /// from published positions would need `atan2` on the JavaScript side, and
    /// the trajectory below is chaotic enough that a last-ulp disagreement
    /// there could land the two targets on different ticks.
    const CLINCH_YAW: [u16; 2] = [0x0f74, 0x8f74];

    /// Straight ahead, at thirty-one thirty-seconds of full magnitude.
    ///
    /// **One number where the articulated drive needed a vector per row**, and
    /// that is the whole of what the torso frame buys a caller: `W` is `(1, 0)`
    /// at every yaw, so a page steering a body no longer has to know which way
    /// it faces. It was `[[58_976, 23_506], [-58_976, -23_506]]` -- the same
    /// magnitude resolved along each row's own `CLINCH_YAW`.
    ///
    /// Not thirty-two thirty-seconds: `Vec2::from_angle` is a sin-table
    /// lookup whose length can exceed one by a raw unit, and `validate_move`
    /// refuses `x^2+y^2 > 65_536^2` outright -- which stores a *neutral*
    /// command instead, and two bodies standing still is a fixture that walks
    /// its whole budget and reports nothing. An axis vector cannot round over,
    /// but the margin is kept so the two drives stay comparable.
    const CLINCH_WALK: i32 = 63_488;

    /// The weapon arm sweeps a raw quarter-turn either side of the torso, four
    /// ticks a phase, cycling centre/left/centre/right. The sweep is what makes
    /// the clinch reach the cap, and the control was measured on both models:
    /// this same drive with the arms held still touches from tick 89 and never
    /// spends more than four of the eight ordinals, out to four hundred ticks.
    ///
    /// **That control is also the measurement an earlier reseat mistook for the
    /// model's answer**, and it is recorded here because the mistake is cheap to
    /// repeat: a torso-frame translation that holds the arms at bearing zero is
    /// this control and not this drive, and it correctly never caps.
    ///
    /// **A raw eighth-turn until the port onto the embodied duel, where it does
    /// not cap through the boundary.** The amplitude is not free and the band
    /// was measured rather than guessed: through `step`, on all three warmed
    /// seeds, `12_288` and `16_384` and `24_576` all exhaust the ordinal on tick
    /// 109, `20_480` reaches ordinal 2 and never caps, and `8_192` -- the
    /// articulated value -- reaches ordinal 2 and never caps either. This sits
    /// in the middle of the lower working band and is a nameable angle rather
    /// than a number found by search.
    const CLINCH_SWEEP: i32 = 16_384;
    const CLINCH_PHASE_TICKS: u32 = 4;

    /// The tick this drive first exhausts the ordinal, measured, on every seed
    /// the browser fixture warms (`0`, `1`, `u32::MAX`) -- the duel draws no
    /// randomness, so the seed reaches the floor plan and not the fight.
    /// Pinned rather than bounded so that a solver change which merely *moves*
    /// the cap is a failure here, with a number to re-measure, instead of
    /// silently making the browser fixture cover less than it says.
    ///
    /// **Smart134 moved it from 89 to 85 by doubling the arm bearing rates**,
    /// and the interesting half is that the gap closed rather than the number
    /// falling. First contact used to land at 78 and the cap eleven ticks later
    /// at 89; both then landed on 85 together. A faster arm brings all 32 pairs
    /// onto the same tick instead of letting them stagger in, so the ordinal is
    /// exhausted by the first contact rather than by an accumulating clinch --
    /// which is still exactly what this fixture exists to reach, by a shorter
    /// road. The later *first* contact is not a slower fight: the drive's phase
    /// clock is unchanged, and an arm that finishes its reach sooner also
    /// withdraws sooner.
    ///
    /// **Moved from 85 to 88 on 2026-08-16, and by a drive change rather than a
    /// solver change.** Freeing the shield normal to follow its arm made that
    /// fixture's two-arm sweep spin the plate's facing, which stopped it capping
    /// at all; the sweep became the weapon arm's alone, for the reason
    /// `clinch_payload` gives, and the ordinal was exhausted three ticks later.
    ///
    /// **Moved from 88 to 109 by the port onto the embodied duel**, which is a
    /// re-measurement rather than a re-record: it is a different fight. The gap
    /// between first contact and the cap re-opened from nothing to nineteen
    /// ticks -- 90 and 109 -- and `CLINCH_SWEEP` doubled to reach it at all.
    ///
    /// **The first tick of this drive is not this drive's**, and that is the
    /// half of the port that cost the most to find. [`Sim::advance`] answers
    /// every entity in `World::pending_decisions` with its faction's policy
    /// command before it steps, and every body is pending on tick zero -- so
    /// whatever the host submitted for tick zero is overwritten by the policy's.
    /// On the articulated fixture that loop was inert, because
    /// `World::submit` refuses a world of the other grammar and the
    /// outcome is discarded; here it stores. The consequence is not one lost
    /// tick, it is a *phase*: first contact moves 89 to 90 and the swept pairs
    /// stop arriving together, which is why the same bytes that cap on tick 119
    /// against a bare `World` reach ordinal 2 and never cap through `step`. The
    /// number below and `CLINCH_SWEEP`'s band are both measured through `step`,
    /// which is the only path a browser has.
    ///
    /// Nothing here is a bound: the drive holds two bodies alive to the cap on
    /// all three seeds, and `CLINCH_BUDGET` on the JavaScript side is the same
    /// number as the loop bound below.
    #[cfg(not(feature = "cartesian-recoil"))]
    const CLINCH_CAP_TICK: u32 = 109;

    fn clinch_payload(row: usize, tick: u32) -> [u8; EMBODIED_COMMAND_BYTES] {
        let offset = match (tick / CLINCH_PHASE_TICKS) % 4 {
            0 | 2 => 0,
            1 => CLINCH_SWEEP,
            _ => -CLINCH_SWEEP,
        };
        // Both release verbs stay zero with the rest of the tail: `Keep`. This
        // drive is a clinch, and nothing in it is drawn. Both swing planes stay
        // zero too, which is the neutral pair `CommandV1::new` answers:
        // this fixture is about the contact solver, and a plane it did not
        // choose would be a second input to a measurement with one.
        let mut bytes = [0u8; EMBODIED_COMMAND_BYTES];
        bytes[0..2].copy_from_slice(&sim::EMBODIED_COMMAND_LAYOUT_VERSION.to_le_bytes());
        bytes[2] = 2;
        bytes[4..8].copy_from_slice(&CLINCH_WALK.to_le_bytes());
        bytes[8..12].copy_from_slice(&0i32.to_le_bytes());
        bytes[12..14].copy_from_slice(&CLINCH_YAW[row].to_le_bytes());
        // Intent, target and both grips stay zero: `Hold`, nobody, `Keep`. The
        // The compatibility solver reads none of the three -- what it sees is
        // where the colliders are -- and leaving them zero keeps its frozen
        // fixture independent of targeting. Exact-law feature tests use an
        // ordinary Attack command: their actuator trajectory is authoritative,
        // so Hold would be a different mechanical input rather than a neutral
        // spelling of the same drive.
        #[cfg(feature = "cartesian-recoil")]
        {
            bytes[14] = 1;
            bytes[15..19].copy_from_slice(&((1 - row) as u32).to_le_bytes());
        }
        for arm in [23usize, 37] {
            // **The sweep is the weapon arm's; the guard arm holds the torso
            // bearing.** It swept both until 2026-08-16, when
            // `World::derive_shield_pose` began taking the plate's normal from
            // the arm that carries it. Before that the guard's bearing moved the
            // plate's position and not its facing, so sweeping it was a
            // *position* input to a collider fixture; after it, that drive also
            // spun the plate's facing by an eighth turn every four ticks -- a
            // shield waved like a fan, which is not an input anybody chose.
            //
            // Measured, and the measurement is a model-specific one that no
            // longer bites: swept both ways the *articulated* drive never
            // exhausted the ordinal at all, out to 2048 ticks, because a plate
            // whose normal turns every phase stopped the 32 pairs landing
            // together. The embodied drive caps either way -- on tick 98 with
            // the guard swept as well. The guard is still held steady, because
            // the reason was never that the alternative failed to cap: this
            // fixture exists to saturate the contact group cap and is
            // deliberately independent of targeting, and holding the guard
            // steady keeps it measuring the solver rather than the guard.
            //
            // Zero rather than `CLINCH_YAW[row]`, and that is the frame rather
            // than a neutral value: `World::world_arm_target` adds the body's
            // own yaw back on, an arm bearing being measured from the torso, so
            // a bearing of the body yaw here would ask for twice it -- the
            // identical mistake the world's own neutral command records having
            // made in the other direction.
            let arm_bearing = if arm == 23 { 0 } else { offset as u16 };
            bytes[arm..arm + 2].copy_from_slice(&arm_bearing.to_le_bytes());
            bytes[arm + 2..arm + 6].copy_from_slice(&Fx::HALF.raw().to_le_bytes());
            bytes[arm + 6..arm + 10].copy_from_slice(&Fx::ONE.raw().to_le_bytes());
            bytes[arm + 10..arm + 14].copy_from_slice(&Fx::ONE.raw().to_le_bytes());
        }
        bytes
    }

    #[cfg(not(feature = "cartesian-recoil"))]
    #[test]
    fn the_boundary_clinch_reaches_the_contact_group_cap() {
        init_embodied_test(1);
        assert_eq!(contact_cap_hits(), 0, "a fresh world arrived already capped");
        // Comfortably past 109 and still bounded: an unbounded loop on a drive
        // that stopped clinching would hang the suite instead of failing it.
        // The same number as `CLINCH_BUDGET` in
        // `client/test/wasm-memory.test.mjs`, which drives the identical bytes.
        let mut fired = None;
        for tick in 0..160 {
            for row in 0..2 {
                EMBODIED_COMMAND.with(|buffer| *buffer.borrow_mut() = clinch_payload(row, tick));
                assert_eq!(
                    submit_embodied(row as u32, 0),
                    1,
                    "tick {tick}: the boundary refused row {row}'s clinch command",
                );
            }
            step(1);
            if contact_cap_hits() != 0 {
                fired = Some(tick);
                break;
            }
        }
        assert_eq!(fired, Some(CLINCH_CAP_TICK), "the clinch no longer caps where it did");
        // Once, not once per group: the counter is `saturating_add(1)` on the
        // tick, and a per-group increment would read 8 here.
        assert_eq!(contact_cap_hits(), 1);
        // Nobody died on the way. Said out loud because the drive would still
        // reach a cap with one body left standing over the other's slot -- and
        // that would be a different tick shape than the one the browser fixture
        // claims to warm. Asked of the world rather than of `Sim::units`: that
        // roster is the generated floor [`init_embodied_test`] builds before it
        // replaces the world, and it answers seven here.
        let standing = SIM.with(|sim| {
            let borrowed = sim.borrow();
            let world = &borrowed.as_ref().unwrap().world;
            (0..2).filter(|&row| world.view(EntityId::new(row, 0)).is_some()).count()
        });
        assert_eq!(standing, 2, "the clinch killed somebody before it capped");
        // And a Legacy room owns no solver at all, so the export is a reading of
        // *this* world rather than a sticky counter, exactly as the reservation
        // beside it is.
        init(1);
        assert_eq!(contact_cap_hits(), 0, "a Legacy world claimed a contact cap");
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn an_ordinary_exact_attack_stays_below_the_legacy_group_cap() {
        let rows = clinch_event_rows(128);
        assert!(rows.iter().flatten().next().is_some(), "the exact attack never made contact");
        assert_eq!(contact_cap_hits(), 0, "the exact attack unexpectedly reached the legacy cap");
    }

    // ---------------------------------------------- published poses and events

    /// The live pose rows, as rows rather than as a run of words.
    fn published_poses() -> Vec<[u32; POSE_STRIDE]> {
        POSES.with(|poses| {
            let words = poses.borrow();
            (0..pose_len() as usize)
                .map(|row| {
                    let mut out = [0u32; POSE_STRIDE];
                    out.copy_from_slice(&words[row * POSE_STRIDE..(row + 1) * POSE_STRIDE]);
                    out
                })
                .collect()
        })
    }

    /// The live combat-event rows, likewise.
    fn published_events() -> Vec<[u32; COMBAT_EVENT_STRIDE]> {
        COMBAT_EVENTS.with(|events| {
            let words = events.borrow();
            (0..combat_event_len() as usize)
                .map(|row| {
                    let mut out = [0u32; COMBAT_EVENT_STRIDE];
                    out.copy_from_slice(
                        &words[row * COMBAT_EVENT_STRIDE..(row + 1) * COMBAT_EVENT_STRIDE],
                    );
                    out
                })
                .collect()
        })
    }

    /// The documented total order key of one published event row.
    ///
    /// The tail is `ContactKey`'s own field order -- `a`, `a_slot`, `b`,
    /// `b_slot`, `kind` -- and not the row's word order, which puts the two
    /// slots together and the kind after them. `kind` is last and is here even
    /// though it cannot currently break a tie: the two slots' shapes determine
    /// it, so two rows agreeing on everything before it agree on it too. A key
    /// that dropped it would still sort every fixture correctly and would stop
    /// being the documented key, which is the thing this test claims to check.
    fn event_order_key(
        row: &[u32; COMBAT_EVENT_STRIDE],
    ) -> (u32, u32, u32, u32, u32, u32, u32, u32, u32, u32) {
        (
            row[COMBAT_EVENT_TICK],
            row[COMBAT_EVENT_TOI_RAW],
            row[COMBAT_EVENT_GROUP_ORDINAL],
            row[COMBAT_EVENT_A_INDEX],
            row[COMBAT_EVENT_A_GENERATION],
            row[COMBAT_EVENT_A_SLOT],
            row[COMBAT_EVENT_B_INDEX],
            row[COMBAT_EVENT_B_GENERATION],
            row[COMBAT_EVENT_B_SLOT],
            row[COMBAT_EVENT_KIND],
        )
    }

    /// Runs the boundary clinch through the real exports and keeps every event
    /// row every publication produced.
    ///
    /// The clinch is the drive this crate already owns for reaching the contact
    /// solver hard, so the event tests use it rather than inventing a second
    /// fight to argue about. One tick per `step`, so a row's publication and
    /// its tick are the same thing.
    fn clinch_event_rows(ticks: u32) -> Vec<Vec<[u32; COMBAT_EVENT_STRIDE]>> {
        init_embodied_test(1);
        let mut collected = Vec::new();
        for tick in 0..ticks {
            for row in 0..2 {
                EMBODIED_COMMAND.with(|buffer| *buffer.borrow_mut() = clinch_payload(row, tick));
                submit_embodied(row as u32, 0);
            }
            step(1);
            collected.push(published_events());
        }
        collected
    }

    /// The live stance rows, as rows rather than as a run of words.
    fn published_stances() -> Vec<[u32; EMBODIED_STANCE_STRIDE]> {
        EMBODIED_STANCES.with(|stances| {
            let words = stances.borrow();
            (0..embodied_stance_len() as usize)
                .map(|row| {
                    let mut out = [0u32; EMBODIED_STANCE_STRIDE];
                    out.copy_from_slice(
                        &words[row * EMBODIED_STANCE_STRIDE..(row + 1) * EMBODIED_STANCE_STRIDE],
                    );
                    out
                })
                .collect()
        })
    }

    /// The embodied control fixture, installed the way a floor is: built,
    /// reserved, published, or nothing at all.
    ///
    /// [`init`] opens an embodied *floor* and this opens the embodied *duel*,
    /// which is the same split `init` and [`init_embodied_test`] have: a
    /// fixture with two bodies and no floor is what a publication assertion
    /// wants, and a generated room is not.
    /// It goes through `install_articulated` rather than assigning `SIM` the way
    /// `embodied_test_world` further down does, and the difference is the whole
    /// point here: that one is about the *submission* path and never publishes,
    /// so the rows it leaves behind would be the previous world's.
    fn published_embodied_world() {
        install_articulated(&Scenario::embodied_duel(), 1);
        assert!(
            with_sim(false, |_| true),
            "the embodied fixture did not install, so nothing below is measuring it",
        );
    }

    /// The live region rows, as rows rather than as a run of words.
    fn published_regions() -> Vec<[u32; REGION_STRIDE]> {
        REGIONS.with(|regions| {
            let words = regions.borrow();
            (0..region_len() as usize)
                .map(|row| {
                    let mut out = [0u32; REGION_STRIDE];
                    out.copy_from_slice(&words[row * REGION_STRIDE..(row + 1) * REGION_STRIDE]);
                    out
                })
                .collect()
        })
    }

    #[test]
    fn an_articulated_projectile_row_preserves_both_stable_identities_and_signed_words() {
        let projectile = sim::ProjectileView {
            slot: 4,
            generation: 7,
            owner: EntityId::new(9, 3),
            position: fx::Vec3::new(Fx::from_int(-2), Fx::HALF, Fx::ONE),
            velocity: fx::Vec3::new(Fx::from_int(3), Fx::ZERO, -Fx::HALF),
            radius: Fx::from_ratio(1, 50),
            remaining_range: Fx::from_int(12),
        };
        assert_eq!(articulated_projectile_row(&projectile), [
            4, 7, 9, 3,
            Fx::from_int(-2).raw() as u32, Fx::HALF.raw() as u32, Fx::ONE.raw() as u32,
            Fx::from_int(3).raw() as u32, 0, (-Fx::HALF).raw() as u32,
            Fx::from_ratio(1, 50).raw() as u32, Fx::from_int(12).raw() as u32,
        ]);
    }

    #[test]
    fn a_configured_bow_publishes_its_live_arrow_with_the_archers_full_identity() {
        let mut config = sim::DuelConfigV1::shipped();
        config.max_ticks = 1_200;
        config.fighters[0].hands = [
            None,
            Some(sim::HandItemV1::shipped(sim::ActionKind::Bow)
                .expect("the configured duel has a runtime Bow row")),
        ];
        config.fighters[0].two_handed = true;
        write_arena_config(
            &config,
            [PolicyKind::Scripted, PolicyKind::Neutral],
        );
        assert_eq!(arena_start(3) & 0xff, 1, "the canonical Bow grip was refused");
        let owner = POSES.with(|poses| {
            let words = poses.borrow();
            [words[POSE_ENTITY_INDEX], words[POSE_ENTITY_GENERATION]]
        });

        let arm = sim::ArmTarget {
            bearing: Angle::ZERO,
            height: sim::CombatHeight::MID,
            reach: Fx::ZERO,
            effort: Fx::ZERO,
        };
        // **Through the embodied envelope since v2-ui-08**, because
        // `Scenario::duel_from` moved onto the embodied model and an arena world
        // answered `WrongModel` to an articulated payload from that day on. The
        // bearing is `Angle::ZERO` under both frames here only because `reach`
        // is zero and
        // the arm is not being aimed: what this edge is about is the release
        // verb, which `CommandV1` carries through unchanged.
        write_embodied(sim::CommandV1::new(sim::CommandCoreV1 {
            move_dir: Vec2::ZERO,
            body_yaw: Angle::ZERO,
            intent: Intent::Hold,
            arms: [arm; 2],
            grips: [sim::GripRequest::Keep; 2],
            releases: [sim::ReleaseRequest::Keep, sim::ReleaseRequest::Loose],
        }));
        assert_eq!(submit_embodied(owner[0], owner[1]), 1,
            "the explicit right-arm Loose command was refused");
        // The arena policy normally submits the next command before stepping
        // and would overwrite this test's edge. Step the authoritative world
        // once, then call the same publisher every exported mutation calls.
        with_sim((), |sim| { let _ = sim.world.step(); });
        publish();

        assert_eq!(articulated_projectile_len(), 1,
            "the explicit Loose edge was not published as one live arrow");
        let row = ARTICULATED_PROJECTILES.with(|rows| {
            let words = rows.borrow();
            let mut row = [0u32; ARTICULATED_PROJECTILE_STRIDE];
            row.copy_from_slice(&words[..ARTICULATED_PROJECTILE_STRIDE]);
            row
        });
        assert_eq!(
            [row[ARTICULATED_PROJECTILE_OWNER_INDEX],
             row[ARTICULATED_PROJECTILE_OWNER_GENERATION]],
            owner,
            "the arrow lost the full identity of the archer that loosed it",
        );
        assert_eq!(articulated_projectiles_dropped(), 0);
        assert!(articulated_projectile_len() <= articulated_projectile_capacity());
        assert!(row[ARTICULATED_PROJECTILE_RADIUS] != 0);
        assert!(row[ARTICULATED_PROJECTILE_REMAINING_RANGE] != 0);
    }

    /// A scenario's anatomy per spawn slot, resolved the way
    /// `crates/lab/src/trace.rs` resolves it and **deliberately not** through
    /// [`scenario_anatomy`].
    ///
    /// The point of the region tests is that the published words are one call
    /// into `sim::body_region_volumes`; a fixture that took its anatomy from
    /// the host's own table would be asking the host whether it agrees with
    /// itself.
    fn scenario_anatomy_independently(scenario: &Scenario) -> Vec<sim::BodyAnatomySpec> {
        let table = scenario
            .combat_specs
            .as_ref()
            .expect("an articulated scenario carries a combat spec table");
        scenario
            .units
            .iter()
            .map(|unit| {
                let row = unit.combat_spec.expect("an articulated unit carries a spec row");
                table.anatomy(row.anatomy).expect("a validated anatomy reference").clone()
            })
            .collect()
    }

    /// Asserts the published region section is exactly
    /// `sim::body_region_volumes`' answer for every body standing right now.
    ///
    /// Word by word against the raw fixed point, and never against
    /// [`region_row`] -- these are 16.16 integers copied out of one call, so
    /// "close enough" is not a thing this comparison could mean.
    fn published_regions_are_the_swept_capsules(scenario: &Scenario, at: &str) {
        let anatomy = scenario_anatomy_independently(scenario);
        let identity: Vec<(sim::Body, Faction)> =
            scenario.units.iter().map(|unit| (unit.kind, unit.faction)).collect();
        let rows = published_regions();
        SIM.with(|sim| {
            let borrowed = sim.borrow();
            let world = &borrowed.as_ref().expect("a world is installed").world;
            let poses: Vec<sim::Pose> = world.poses().collect();
            assert_eq!(
                rows.len(),
                poses.len() * REGIONS_PER_BODY,
                "{at}: the region section is not five rows per published body",
            );
            for (body, pose) in poses.iter().enumerate() {
                // **The slot assumption, checked rather than believed**, which
                // is what `crates/lab/src/trace.rs` does per row and for the
                // same reason: `anatomy[index]` is the unit that spawned into
                // that slot only because `World::try_new` spawns
                // `scenario.units` in order and nothing walks an articulated
                // body in afterwards. Neither the length comparison above nor
                // the words below could tell a correct slot map from a permuted
                // one -- both bodies are real bodies with real capsules -- so a
                // fixture that hung the Brute's anatomy off the Fighter would
                // pass everything else in this file.
                if let (Some(&(kind, faction)), Some(view)) =
                    (identity.get(pose.id.index as usize), world.view(pose.id))
                {
                    assert!(
                        view.kind == kind && view.faction == faction,
                        "{at}: slot {} holds a {:?} of {:?}, not the {kind:?} of {faction:?} \
                         that scenario.units[{}] describes",
                        pose.id.index, view.kind, view.faction, pose.id.index,
                    );
                }
                // The severed mask is `BodyPart`-wide and the answer is
                // volume-wide; see `pose_region_volumes`, which this is the
                // independent second spelling of.
                let present: [bool; sim::AnatomyRegion::COUNT] =
                    core::array::from_fn(|part| pose.severed_mask & (1 << part) == 0);
                let hands = [pose.arms[0].hand - pose.body, pose.arms[1].hand - pose.body];
                let elbows = [pose.arms[0].elbow.map(|joint| joint - pose.body),
                              pose.arms[1].elbow.map(|joint| joint - pose.body)];
                let expected = sim::jointed_body_region_volumes(
                    pose.body,
                    &anatomy[pose.id.index as usize],
                    pose.body_yaw,
                    hands,
                    present,
                    elbows,
                );
                for part in 0..REGIONS_PER_BODY {
                    let row = rows[body * REGIONS_PER_BODY + part];
                    let volume = expected[part];
                    let where_ = format!("{at}: body {} region {part}", pose.id.index);
                    assert_eq!(
                        [row[REGION_LOWER_X], row[REGION_LOWER_Y], row[REGION_LOWER_Z]],
                        [
                            volume.lower.x.raw() as u32,
                            volume.lower.y.raw() as u32,
                            volume.lower.z.raw() as u32,
                        ],
                        "{where_}: lower point",
                    );
                    assert_eq!(
                        [row[REGION_UPPER_X], row[REGION_UPPER_Y], row[REGION_UPPER_Z]],
                        [
                            volume.upper.x.raw() as u32,
                            volume.upper.y.raw() as u32,
                            volume.upper.z.raw() as u32,
                        ],
                        "{where_}: upper point",
                    );
                    assert_eq!(row[REGION_RADIUS], volume.radius.raw() as u32, "{where_}: radius");
                    assert_eq!(
                        row[REGION_PRESENT],
                        u32::from(volume.present),
                        "{where_}: presence",
                    );
                }
            }
        });
    }

    #[test]
    fn the_published_capsules_are_the_swept_capsules() {
        // **Both ways a fight can start in this module**, because the two build
        // their spec tables from different places and the section has to be the
        // same call either way: the shipped `CombatSpecTableV1::fixtures()`
        // behind [`init_embodied_test`], and the runtime table
        // `Scenario::duel_from` assembles out of a studio's configuration
        // behind `arena_start`. A host that hung the wrong anatomy off a slot
        // would draw a Brute's shoulders on a Fighter and every other column
        // would still look right.

        // Way one: the shipped duel, driven through the documented clinch so
        // the arms are somewhere the actuator put them rather than at their
        // spawn pose. An arm capsule runs shoulder to *hand*, so a fixture that
        // never moved a hand would check the three rigid regions and nothing
        // else.
        let duel = Scenario::embodied_duel();
        init_embodied_test(1);
        published_regions_are_the_swept_capsules(&duel, "the duel at rest");
        for tick in 0..48u32 {
            for row in 0..2 {
                EMBODIED_COMMAND.with(|buffer| *buffer.borrow_mut() = clinch_payload(row, tick));
                submit_embodied(row as u32, 0);
                // Every mutating export publishes, so a submitted command that
                // moved a target hand is in the buffer before the step -- which
                // is the pose section's rule and holds here for free because
                // the two are written by one function.
                published_regions_are_the_swept_capsules(&duel, "the duel mid-command");
            }
            step(1);
            published_regions_are_the_swept_capsules(&duel, "the duel mid-clinch");
        }

        // Way two: a configured duel, whose anatomy rows are built at runtime.
        let mut config = sim::DuelConfigV1::shipped();
        config.max_ticks = 240;
        let kinds = [PolicyKind::Scripted, PolicyKind::Tactical];
        write_arena_config(&config, kinds);
        assert_eq!(arena_start(3) & 0xff, 1, "the configured duel refused to start");
        let arena = Scenario::duel_from(&config).expect("the shipped configuration builds");
        published_regions_are_the_swept_capsules(&arena, "the arena at rest");
        for _ in 0..48 {
            step(1);
            published_regions_are_the_swept_capsules(&arena, "the arena mid-fight");
        }

        // And the third way the words are produced: `articulated_stream_digest`
        // drives its own `Sim` through `write_region_buffer` rather than
        // through `publish`, and the pin is only worth anything if the two
        // agree. Same world, both writers, byte for byte.
        let mut direct = [0u32; MAX_REGIONS * REGION_STRIDE];
        let (rows, dropped) = SIM.with(|sim| {
            let borrowed = sim.borrow();
            write_region_buffer(borrowed.as_ref().expect("a world is installed"), &mut direct)
        });
        assert_eq!((rows, dropped), (region_len(), regions_dropped()));
        assert_eq!(
            direct[..rows as usize * REGION_STRIDE],
            REGIONS.with(|regions| regions.borrow()[..rows as usize * REGION_STRIDE].to_vec())[..],
            "the digest's writer and the publication disagree about the same world",
        );
    }

    #[test]
    fn the_region_section_covers_every_published_pose() {
        // The relationship the section is read by, since a region row carries
        // no identity of its own: region row `n` describes pose row
        // `n / REGIONS_PER_BODY`, and the only way that can be wrong is a count
        // that does not line up. One comparison, on every world this module can
        // install.
        for open in [init as extern "C" fn(u32), init_embodied_test] {
            open(1);
            assert!(pose_len() > 0, "an articulated world published no poses to cover");
            assert_eq!(
                region_len(),
                REGIONS_PER_BODY as u32 * pose_len(),
                "the region section does not cover every published pose",
            );
            assert_eq!(regions_dropped(), 0, "a body's anatomy was missing from the host");
            step(8);
            assert_eq!(region_len(), REGIONS_PER_BODY as u32 * pose_len());
            assert_eq!(regions_dropped(), 0);
        }

        // And across a descent, which is the one path that replaces the world
        // in place rather than installing a fresh `Sim` -- so it is the path
        // where the host's anatomy table could be left describing last floor's
        // roster. A stale table costs every body its five rows and shows up
        // here rather than as a capsule drawn in the wrong place.
        init(1);
        for floor in 0..4 {
            descend();
            assert_eq!(
                region_len(),
                REGIONS_PER_BODY as u32 * pose_len(),
                "floor {floor} lost its region rows",
            );
            assert_eq!(regions_dropped(), 0, "floor {floor} published a body with no anatomy");
            step(8);
            assert_eq!(region_len(), REGIONS_PER_BODY as u32 * pose_len());
        }

        // **And across the two paths that add a body to a floor already open**,
        // which is where this invariant was actually broken. The host's anatomy
        // table is built from the *scenario's* units, so a body arriving through
        // `try_spawn` had no row in it; `write_region_buffer` answered by
        // dropping that body's capsules and counting it. Nothing else showed the
        // loss -- the pose and stance sections published the newcomer normally,
        // so it was drawn, it moved, it fought, and it could not be hit by
        // anything reading the region section. Measured before the fix: three
        // spawns took `pose_len` 7 -> 10 while `region_len` stayed at 49 and
        // `regions_dropped` climbed 0, 7, 14, 21.
        init(1);
        for spawn in 0..3 {
            let before = pose_len();
            assert!(spawn_monster(Body::Skitterer as u32, 0, 0) > 0, "spawn {spawn} refused");
            step(1);
            assert_eq!(pose_len(), before + 1, "spawn {spawn} published no pose");
            assert_eq!(
                region_len(),
                REGIONS_PER_BODY as u32 * pose_len(),
                "spawn {spawn} was drawn without capsules to hit",
            );
            assert_eq!(regions_dropped(), 0, "spawn {spawn} had no anatomy on the host");
        }
    }

    /// Every swept volume gets a published row, on both kinds of body.
    ///
    /// **The length relation is the section's whole reader contract and it had
    /// to survive the widening**: region row `n` belongs to pose row
    /// `n / REGIONS_PER_BODY` and carries no identity of its own, so
    /// `region_len == REGIONS_PER_BODY * pose_len` is the only thing standing
    /// between a reader and somebody else's torso. `the_region_section_covers_
    /// every_published_pose` checks it across every world this module installs;
    /// this one checks that the multiplier is the *volume* count, and that the
    /// two extra rows are the forearms rather than padding.
    ///
    /// **Both models used to be driven here and one is left.** An articulated
    /// body published its last two rows absent and an embodied one publishes
    /// them present, and the pair was the argument that `REGIONS_PER_BODY` is a
    /// property of the *wire* rather than of the model. Only the present half is
    /// reachable now; the absent half survives as the `Option` below, which is
    /// still what a body with no elbow would publish and is still checked
    /// against the pose rather than assumed away.
    #[cfg(not(feature = "cartesian-recoil"))]
    #[test]
    fn the_published_region_section_covers_every_volume() {
        // Not a second literal seven: the relation, so that an eighth volume or
        // a sixth region fails here rather than silently re-shaping the wire.
        assert_eq!(REGIONS_PER_BODY, sim::BODY_VOLUME_COUNT);
        assert_eq!(REGIONS_PER_BODY, sim::AnatomyRegion::COUNT + 2);

        for (scenario, jointed) in [(Scenario::embodied_duel(), true)] {
            install_articulated(&scenario, 1);
            step(8);
            let rows = published_regions();
            assert!(pose_len() > 0, "a duel published no poses to cover");
            assert_eq!(region_len(), REGIONS_PER_BODY as u32 * pose_len());
            assert_eq!(rows.len(), REGIONS_PER_BODY * pose_len() as usize);

            let poses: Vec<sim::Pose> = SIM.with(|sim| {
                let borrowed = sim.borrow();
                borrowed.as_ref().expect("a world").world.poses().collect()
            });
            let raw = |value: Fx| value.raw() as u32;
            for (body, pose) in poses.iter().enumerate() {
                for limb in 0..2 {
                    let arm = rows[body * REGIONS_PER_BODY
                                   + sim::AnatomyRegion::LeftArm as usize + limb];
                    let fore = rows[body * REGIONS_PER_BODY + sim::forearm_volume(limb)];
                    assert_eq!(fore[REGION_PRESENT], u32::from(jointed),
                        "body {body} limb {limb} published the wrong forearm presence");
                    let Some(elbow) = pose.arms[limb].elbow else {
                        assert!(!jointed, "a jointed body published no elbow");
                        continue;
                    };
                    // The forearm's `lower` **is** the published elbow, to the
                    // raw unit, and the upper arm's `upper` is the same point.
                    // That identity is what let `client/src/arena/scene.ts` stop
                    // inventing a joint: the page reads the capsule the solver
                    // swept rather than solving a triangle of its own.
                    assert_eq!([fore[REGION_LOWER_X], fore[REGION_LOWER_Y], fore[REGION_LOWER_Z]],
                               [raw(elbow.x), raw(elbow.y), raw(elbow.z)],
                               "body {body} limb {limb}: the forearm does not start at the elbow");
                    assert_eq!([arm[REGION_UPPER_X], arm[REGION_UPPER_Y], arm[REGION_UPPER_Z]],
                               [raw(elbow.x), raw(elbow.y), raw(elbow.z)],
                               "body {body} limb {limb}: the upper arm does not end at the elbow");
                    let hand = pose.arms[limb].hand;
                    assert_eq!([fore[REGION_UPPER_X], fore[REGION_UPPER_Y], fore[REGION_UPPER_Z]],
                               [raw(hand.x), raw(hand.y), raw(hand.z)],
                               "body {body} limb {limb}: the forearm does not reach the hand");
                    assert_eq!(fore[REGION_RADIUS], arm[REGION_RADIUS]);
                }
            }
        }
    }

    #[test]
    fn a_module_with_no_world_publishes_a_zero_length_stance_section_and_not_no_section() {
        // The distinction the whole publication turns on: "nothing, and I am
        // telling you so" is a different answer from "this module has never
        // heard of stances". A reader that could not tell them apart would have
        // no way to know whether an empty section meant an empty world or a wasm
        // artifact built before the section existed.
        //
        // **It was `an_articulated_module_publishes_a_zero_length_stance_section_and_not_no_section`
        // and it has lost the world it asked, not the question.** Only the
        // embodied model had legs, so a legless world published an empty section
        // -- and there is no legless world left to install. The
        // remaining producer of an empty section is the arm of [`publish`]
        // written for exactly this: a refused install leaves no `Sim` at all,
        // and that arm zeroes every length and wipes every row rather than
        // letting the previous world's stances stand behind a stale count. That
        // is the harder case of the two, because a stale row behind a live
        // length is a body the page would draw.
        init(7);
        step(8);
        assert!(!published_stances().is_empty(), "the floor published no stance to lose");
        let mut broken = dungeon_scenario(7, 0, starting_hero());
        broken.units[1].combat_spec = None;
        install_articulated(&broken, 7);
        assert!(with_sim(true, |_| false), "the broken fixture installed a world after all");
        assert!(published_stances().is_empty(), "a module with no world published a stance row");
        assert_eq!((embodied_stance_len(), embodied_stances_dropped()), (0, 0));
        step(8);
        assert_eq!((embodied_stance_len(), embodied_stances_dropped()), (0, 0));

        // The section itself, which is what a zero length is *of*: a buffer at a
        // real address of its own, a stride, a capacity and a version, all
        // answering while the length says zero. These are the four an empty
        // publication and an absent one differ by.
        assert_ne!(embodied_stance_ptr(), 0, "the stance buffer is at address zero");
        assert_ne!(embodied_stance_ptr(), pose_ptr(), "two buffers share an address");
        assert_ne!(embodied_stance_ptr(), region_ptr(), "two buffers share an address");
        assert_ne!(embodied_stance_ptr(), articulated_projectile_ptr(),
            "two buffers share an address");
        assert_eq!(embodied_stance_ptr() % 4, 0, "the stance buffer is not u32-aligned");
        assert_eq!(
            (embodied_stance_layout_version(), embodied_stance_stride(),
             embodied_stance_capacity()),
            (1, 6, 64),
        );

        // **The scripted half of this test is gone and its claim is stronger for
        // it.** It drove `drive_stream_digest_script` and required every one of
        // the twenty ticks to feed an empty stance slice and a zero drop count,
        // because that zero-length tail was what moved `ARTICULATED_STREAM_DIGEST`
        // when the section landed. The script is embodied now: it feeds two real
        // rows a tick, so the section is load-bearing in the digest by value
        // rather than by presence, and
        // `the_region_and_stance_sections_both_reach_the_stream_digest` measures
        // that with its `fold(false)` against `fold(true)`. A section that
        // reaches the digest with rows in it is the harder case to lose
        // silently, so nothing is owed here.
    }

    #[test]
    fn an_embodied_bodys_stance_row_round_trips() {
        published_embodied_world();
        let rows = published_stances();
        assert!(rows.len() >= 2, "the embodied fixture published {} stances", rows.len());
        assert_eq!(embodied_stances_dropped(), 0, "a two-body duel overflowed a 64-row buffer");
        // One stance per published pose, which is what makes this model's
        // sections readable together. It is *not* a general law -- an articulated
        // world publishes poses and no stances at all -- so it is asserted here,
        // on the model that has both, rather than stated as an invariant of the
        // ABI.
        assert_eq!(embodied_stance_len(), pose_len(), "a published body lost its legs");

        SIM.with(|sim| {
            let borrowed = sim.borrow();
            let world = &borrowed.as_ref().unwrap().world;
            for row in &rows {
                // Both halves resolve, which is what makes the pair an identity:
                // an index alone would answer just as happily for the body that
                // took the slot next.
                let id = EntityId::new(
                    row[EMBODIED_STANCE_ENTITY_INDEX],
                    row[EMBODIED_STANCE_ENTITY_GENERATION],
                );
                let stance = world
                    .stance(id)
                    .expect("a published row named a body the world does not have");
                assert_eq!(*row, embodied_stance_row(&stance));
                assert_eq!(
                    world.stance(EntityId::new(id.index, id.generation + 1)),
                    None,
                    "a bare index would have resolved",
                );
                // The row against the world's own words, column by column, so a
                // transposed pair inside `embodied_stance_row` cannot agree with
                // itself the way the assertion above would let it.
                assert_eq!(row[EMBODIED_STANCE_HIP_YAW_RAW], u32::from(stance.hip_yaw.raw()));
                assert_eq!(row[EMBODIED_STANCE_PELVIS_RAW], stance.pelvis.raw() as u32);
                assert_eq!(row[EMBODIED_STANCE_TWIST_RAW], stance.twist_raw as u32);
                assert_eq!(row[EMBODIED_STANCE_STEP_LEFT], u32::from(stance.step_left));
            }
            assert_eq!(world.stances().count(), rows.len(), "a live body published no stance");
        });

        // A commanded turn moves the legs, and without it the round trip above
        // is satisfied by a buffer written once at spawn and never touched
        // again. **Two bodies standing still is not enough to show that**, and
        // measuring it is what found that out: this fixture submits no command
        // of its own, so 120 unstepped-into ticks leave both stances exactly as
        // `StanceState::squared` built them and the section is bit-identical
        // across the whole fight. The order below is `embodied_fixture`'s
        // quarter turn, which the hips chase and the torso twists against.
        let settled = published_stances();
        write_embodied(embodied_fixture());
        assert_eq!(submit_embodied(0, 0), 1, "the embodied fixture refused its own command");
        step(120);
        let turned = published_stances();
        assert_eq!(embodied_stance_len(), pose_len(), "a step lost a body its legs");
        assert_ne!(settled, turned, "a quarter-turn order moved nobody's hips");
    }

    /// Both appended sections are load-bearing in `ARTICULATED_STREAM_DIGEST`:
    /// suppress either and the number changes.
    ///
    /// **This was `the_region_section_is_the_whole_of_the_forearm_digest_move`,
    /// and the half it is named for died with the articulated fixture.** It held
    /// `BEFORE_THE_FOREARM = 0xc6482a30f399d2cb` -- the digest of *this* script
    /// with the region section suppressed, measured on `b453ca1`, the commit
    /// before the forearm collider -- and required the suppression to reproduce
    /// it, which is what earned the claim that the forearm move was a layout move
    /// and not a values one: every pose, event, projectile and stance word of all
    /// twenty ticks was byte-identical either side of it.
    ///
    /// Reseating `stream_digest_scenario` onto `Scenario::embodied_duel` made
    /// that number uncomputable. The script is a different fight -- rows on ticks
    /// 0 and 3 through 6 where the articulated one resolved nothing before tick
    /// 3 and kept resolving well past 6, two real stance rows a tick where it had
    /// none, and both forearms present where they were absent -- so no
    /// suppression of the current stream can reproduce a stream the current
    /// fixture does not run.
    ///
    /// **This is precisely the fate this test recorded for the one it
    /// superseded**, and the symmetry is the point rather than a coincidence.
    /// `the_stance_section_extends_the_digest_without_disturbing_its_prefix`
    /// compared a stance-suppressed fold against `0x3b0d5c93d5560dd9`, the digest
    /// registered the day before the stance section existed; the forearm widened
    /// the region section, changed the prefix, and left that equality
    /// unrepairable by re-measurement. Its own doc comment had reserved exactly
    /// that outcome for "changed the prefix". The prefix has now been changed
    /// again, by the fixture rather than by a section, and a witness taken over a
    /// fixture dies when the fixture is reseated. **Neither number is re-recorded
    /// against the new fight**: a constant re-measured on a different script
    /// would look like the same evidence and would be evidence of nothing.
    ///
    /// What survives needs no constant and is the half that still bites: drop
    /// either appended section from the fold and the digest moves. The stance
    /// half is *stronger* than it was, because the script now feeds two real rows
    /// a tick where it used to feed a zero length -- presence was the whole of
    /// what the old fixture could show.
    #[cfg(not(feature = "cartesian-recoil"))]
    #[test]
    fn the_region_and_stance_sections_both_reach_the_stream_digest() {
        // Everything but the region section, in the stream's own order.
        let fold = |stances: bool| {
            let mut digest = fx::Hash64::new();
            digest.write_bytes(b"ARPG-STREAM-V1");
            drive_stream_digest_script(|published| {
                digest.write_u32(published.tick);
                digest.write_u32((published.poses.len() / POSE_STRIDE) as u32);
                digest.write_u32(published.poses_dropped);
                for &word in published.poses {
                    digest.write_u32(word);
                }
                digest.write_u32((published.events.len() / COMBAT_EVENT_STRIDE) as u32);
                digest.write_u32(published.events_dropped);
                for &word in published.events {
                    digest.write_u32(word);
                }
                // And here the region section is simply not written, which is
                // the whole of the difference this session made.
                digest.write_u32(
                    (published.projectiles.len() / ARTICULATED_PROJECTILE_STRIDE) as u32,
                );
                digest.write_u32(published.projectiles_dropped);
                for &word in published.projectiles {
                    digest.write_u32(word);
                }
                if stances {
                    digest.write_u32(
                        (published.stances.len() / EMBODIED_STANCE_STRIDE) as u32,
                    );
                    digest.write_u32(published.stances_dropped);
                    for &word in published.stances {
                        digest.write_u32(word);
                    }
                }
            });
            digest.finish()
        };

        assert_ne!(
            articulated_stream_digest(),
            fold(true),
            "the region section went on the wire and the portability digest did not notice",
        );
        // The stance claim the superseded test carried, without its constant:
        // dropping the fifth section still changes the number -- and on this
        // fixture it is dropping two rows a tick rather than a zero length.
        assert_ne!(
            fold(false),
            fold(true),
            "a fifth section went on the wire and the portability digest did not notice",
        );
    }

    #[cfg(not(feature = "cartesian-recoil"))]
    #[test]
    fn a_severed_region_is_published_absent() {
        // A live severance, not a hand-built mask: the whole claim is that the
        // `present` word follows the world, and a fixture that set the bit
        // itself would only be checking that `u32::from(bool)` works.
        //
        // The shipped duel needs longer than a test wants to take an arm off,
        // so the anatomy is made of paper -- every regional maximum a
        // 256th -- and the documented clinch then severs one at tick 85. The
        // *geometry* is untouched, which is what this test is about; only the
        // integrity budget moved.
        let mut scenario = Scenario::embodied_duel();
        for row in scenario
            .combat_specs
            .as_mut()
            .expect("the duel carries a combat spec table")
            .anatomies
            .iter_mut()
        {
            row.integrity_maxima = core::array::from_fn(|_| Fx::from_ratio(1, 256));
        }
        install_articulated(&scenario, 1);

        let mut severed = None;
        for tick in 0..200u32 {
            for row in 0..2 {
                EMBODIED_COMMAND.with(|buffer| *buffer.borrow_mut() = clinch_payload(row, tick));
                submit_embodied(row as u32, 0);
            }
            step(1);
            let masks: Vec<u32> =
                published_poses().iter().map(|row| row[POSE_SEVERED_MASK]).collect();
            if let Some(body) = masks.iter().position(|&mask| mask != 0) {
                severed = Some((body, masks[body]));
                break;
            }
        }
        let (body, mask) = severed.expect("the paper clinch took 200 ticks without severing a limb");

        // The published capsules are still exactly what the sweep would build,
        // severance and all -- so `present` is the sim's own answer rather than
        // a rule this host applies to the geometry after the fact.
        published_regions_are_the_swept_capsules(&scenario, "after a severance");

        // **The mask is `BodyPart`-wide and the section is volume-wide**, so the
        // comparison runs over the five region rows only. The two after them are
        // the forearms, and they are read separately below rather than folded
        // in, because "absent" means two different things in the two halves: a
        // severed *region* is a fact about the body, and a forearm row's
        // presence is a fact about whether the arm has an elbow at all.
        let rows = published_regions();
        let mut absent = 0;
        for part in 0..sim::AnatomyRegion::COUNT {
            let row = rows[body * REGIONS_PER_BODY + part];
            let gone = mask & (1 << part) != 0;
            assert_eq!(
                row[REGION_PRESENT],
                u32::from(!gone),
                "region {part} of body {body} is published {} against a severed mask of {mask:#b}",
                row[REGION_PRESENT],
            );
            absent += u32::from(gone);
        }
        assert!(absent > 0, "the mask said something was severed and every region was present");
        // **This required `0` on every forearm row while the fixture was the
        // articulated duel, whose arms are one link, and that reading said
        // nothing about severance at all.** An embodied arm is jointed, so the
        // forearm rows carry a real presence column and the claim worth making
        // is that it *follows its own arm's severance*: a severed arm takes its
        // forearm with it, and a body that lost a leg keeps both. A loop
        // requiring `1` everywhere would be satisfied by an encoder that had
        // stopped consulting the mask, which is the failure this whole test
        // exists to catch, one row further out.
        for limb in 0..2 {
            let gone = mask & (1 << (sim::AnatomyRegion::LeftArm as usize + limb)) != 0;
            let fore = rows[body * REGIONS_PER_BODY + sim::forearm_volume(limb)];
            assert_eq!(fore[REGION_PRESENT], u32::from(!gone),
                "limb {limb}'s forearm does not follow its arm under mask {mask:#b}");
            for other in 0..rows.len() / REGIONS_PER_BODY {
                if other == body { continue; }
                assert_eq!(
                    rows[other * REGIONS_PER_BODY + sim::forearm_volume(limb)][REGION_PRESENT],
                    1,
                    "an untouched body lost limb {limb}'s forearm",
                );
            }
        }

        // Every other body still has all five, which is what makes the column a
        // fact about a region rather than about the fight.
        for other in 0..rows.len() / REGIONS_PER_BODY {
            if other == body {
                continue;
            }
            for part in 0..sim::AnatomyRegion::COUNT {
                assert_eq!(
                    rows[other * REGIONS_PER_BODY + part][REGION_PRESENT],
                    1,
                    "an untouched body lost region {part}",
                );
            }
        }
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn exact_region_encoder_makes_only_a_pose_masks_severed_region_absent() {
        // Exact-law same-tick severance is exercised by
        // `a_severance_leaves_the_tick_it_happened_in` at the World boundary;
        // this host test owns the independent ABI claim and must not depend on
        // the legacy clinch's damage schedule. Feed a nontrivial authoritative
        // pose mask through the production region encoder and prove that only
        // its named bits disappear.
        let anatomy = scenario_anatomy_independently(&Scenario::embodied_duel());
        let mut pose = every_pose_column_filled();
        pose.severed_mask = 1 << sim::AnatomyRegion::LeftArm as u8;
        let rows = pose_region_volumes(&pose, &anatomy[0]).map(|volume| region_row(&volume));
        for (part, row) in rows.iter().enumerate() {
            assert_eq!(row[REGION_PRESENT], u32::from(part != sim::AnatomyRegion::LeftArm as usize));
        }
    }

    #[test]
    fn the_head_capsule_is_published_degenerate_and_present() {
        // **The case a reader inferring absence from geometry gets wrong**, and
        // it is not a corner case: `body_region_volumes` builds the head as a
        // degenerate capsule whose two endpoints coincide and whose extent is
        // its `radius` alone -- `AnatomyRegionSpec::half_height` is dead for
        // that region. So a head is a zero-length segment on every body, on
        // every tick, and "lower == upper means nothing is here" would delete
        // it from every fight this module can run.
        init_embodied_test(1);
        step(4);
        let rows = published_regions();
        assert!(!rows.is_empty(), "the duel published no regions to read a head off");
        let mut heads = 0;
        for body in 0..rows.len() / REGIONS_PER_BODY {
            let head = rows[body * REGIONS_PER_BODY + sim::AnatomyRegion::Head as usize];
            assert_eq!(
                [head[REGION_LOWER_X], head[REGION_LOWER_Y], head[REGION_LOWER_Z]],
                [head[REGION_UPPER_X], head[REGION_UPPER_Y], head[REGION_UPPER_Z]],
                "body {body}: the head is not the degenerate capsule the sweep builds",
            );
            assert_eq!(head[REGION_PRESENT], 1, "body {body}: a coincident head read as absent");
            assert_ne!(head[REGION_RADIUS], 0, "body {body}: the head has no extent at all");
            heads += 1;
        }
        assert!(heads >= 2, "only {heads} bodies published a head");

        // And the same claim through the packing path with the mask flipped, so
        // that "present" is carrying information rather than being a constant
        // one. The hand-built pose is `every_pose_column_filled`'s, whose
        // severed mask has three regions gone and whose head is not one of
        // them: a degenerate capsule that *is* absent and a degenerate capsule
        // that is present publish the same seven words and differ only in the
        // eighth, which is the whole argument for the eighth existing.
        let anatomy = scenario_anatomy_independently(&Scenario::embodied_duel());
        let pose = every_pose_column_filled();
        let volumes = pose_region_volumes(&pose, &anatomy[0]);
        let head = region_row(&volumes[sim::AnatomyRegion::Head as usize]);
        assert_eq!(
            [head[REGION_LOWER_X], head[REGION_LOWER_Y], head[REGION_LOWER_Z]],
            [head[REGION_UPPER_X], head[REGION_UPPER_Y], head[REGION_UPPER_Z]],
        );
        assert_eq!(pose.severed_mask & 1, 0, "the fixture's head is severed and it should not be");
        assert_eq!(head[REGION_PRESENT], 1);
        // The five region rows follow the mask bit by bit; the two forearm rows
        // follow the *elbow*, and this hand-built pose publishes none -- see
        // `PosedArm::elbow`, which `every_pose_column_filled` leaves `None`.
        for part in 0..sim::AnatomyRegion::COUNT {
            let row = region_row(&volumes[part]);
            assert_eq!(row[REGION_PRESENT], u32::from(pose.severed_mask & (1 << part) == 0));
        }
        for limb in 0..2 {
            assert_eq!(region_row(&volumes[sim::forearm_volume(limb)])[REGION_PRESENT], 0,
                "an elbowless pose published a forearm");
        }

        // The same head, severed, is seven identical words and a zero.
        let mut headless = pose;
        headless.severed_mask |= 1;
        let gone = region_row(&pose_region_volumes(&headless, &anatomy[0])[sim::AnatomyRegion::Head as usize]);
        assert_eq!(gone[..REGION_PRESENT], head[..REGION_PRESENT],
            "severance moved the geometry as well as the flag");
        assert_eq!(gone[REGION_PRESENT], 0);
    }

    #[test]
    fn pose_rows_use_full_identity_and_canonical_order() {
        init(1);
        let rows = published_poses();
        assert!(rows.len() >= 2, "the room published {} bodies", rows.len());
        assert_eq!(poses_dropped(), 0, "the room overflowed a buffer sized to the sim's own cap");

        // Ascending *full* identity and strictly so, which is stronger than
        // ascending index: a slot holds at most one live body, so a repeat here
        // would mean two rows about one body.
        let identity: Vec<(u32, u32)> = rows
            .iter()
            .map(|row| (row[POSE_ENTITY_INDEX], row[POSE_ENTITY_GENERATION]))
            .collect();
        let mut canonical = identity.clone();
        canonical.sort_unstable();
        canonical.dedup();
        assert_eq!(identity, canonical, "pose rows are not ascending full identity");

        SIM.with(|sim| {
            let borrowed = sim.borrow();
            let world = &borrowed.as_ref().unwrap().world;
            // Both halves resolve, which is what makes the pair an identity: an
            // index alone would resolve just as happily against the body that
            // took the slot next.
            for row in &rows {
                let id = EntityId::new(row[POSE_ENTITY_INDEX], row[POSE_ENTITY_GENERATION]);
                let pose = world
                    .pose(id)
                    .expect("a published row named a body the world does not have");
                assert_eq!(*row, pose_row(&pose));
                assert_eq!(
                    world.pose(EntityId::new(id.index, id.generation + 1)),
                    None,
                    "a bare index would have resolved",
                );
            }
            // And nobody is missing: the row count is the live articulated body
            // count and not some subset that happened to be interesting.
            assert_eq!(world.poses().count(), rows.len());
        });
    }

    /// One pose whose every published column holds a value no other column
    /// holds.
    ///
    /// Hand-built rather than lifted off a live body, for the same reason
    /// `crates/sim`'s `every_column_filled` is: a real pose publishes a great
    /// many equal words -- every Z is the floor, a fresh anatomy's five
    /// integrity fractions are all one, an empty grip is six zeros -- and two
    /// equal words cannot show that they were swapped. Nothing here has to be a
    /// pose the actuator could reach. The fixture's only job is to make a
    /// transposition visible, which is exactly the failure the surviving checks
    /// on this row cannot see.
    fn every_pose_column_filled() -> sim::Pose {
        // Ten apart, so no component of one point can equal a component of
        // another and no swap between two points survives.
        fn scalar(n: i32) -> Fx {
            Fx::from_ratio(n, 1024)
        }
        fn point(n: i32) -> fx::Vec3 {
            fx::Vec3::new(scalar(n), scalar(n + 1), scalar(n + 2))
        }
        sim::Pose {
            id: EntityId::new(41, 7),
            body: point(1),
            body_yaw: Angle::from_raw(20_001),
            body_velocity: point(11),
            arms: [
                sim::PosedArm {
                    hand: point(21),
                    // No elbow on either arm of this hand-built row, and it is
                    // the right answer rather than a placeholder: nothing in the
                    // pose *section* publishes an elbow -- it reaches the wire
                    // through the region rows, as the forearm's `lower` -- so a
                    // fixture for the pose row has no column to fill.
                    elbow: None,
                    velocity: point(31),
                    fatigue: scalar(200),
                    target_hand: point(41),
                },
                sim::PosedArm {
                    hand: point(51),
                    elbow: None,
                    velocity: point(61),
                    fatigue: scalar(201),
                    target_hand: point(71),
                },
            ],
            weapons: [
                Some(sim::SegmentPose { hilt: point(81), tip: point(91), radius: scalar(202) }),
                Some(sim::SegmentPose { hilt: point(101), tip: point(111), radius: scalar(203) }),
            ],
            shield: Some(sim::ShieldPose {
                centre: point(121),
                normal: point(131),
                half_width: scalar(204),
                half_height: scalar(205),
                // Published by nothing, which is the point of naming it: a row
                // that grew a thickness column would fail the coverage check
                // below rather than appearing as one more word nobody reads.
                thickness: scalar(206),
            }),
            integrity_fraction: core::array::from_fn(|part| scalar(210 + part as i32)),
            wound_fraction: core::array::from_fn(|part| scalar(220 + part as i32)),
            blood_fraction: scalar(230),
            shock: scalar(231),
            severed_mask: 0b1_0110,
            equipment_mask: 0b101,
            intent: Intent::Flee,
            hints: [sim::AnimationHint::Contact, sim::AnimationHint::Recoiling],
        }
    }

    #[test]
    fn every_pose_column_lands_on_its_documented_word() {
        // The 66 columns of `articulated-abi.md`'s pose table, one assertion
        // each, against the field that table names for the word.
        //
        // **What had no pin before this.** `emit_abi`'s set-equality against
        // `0..POSE_STRIDE` catches a gap and a duplicate and cannot catch a
        // transposition -- swapping two column names leaves the set intact.
        // `tools/wasm_check.js` spot-checks eight of the sixty-six.
        // `ARTICULATED_STREAM_DIGEST` is derived from this encoder, so it
        // detects drift and cannot detect a layout that was wrong on the day it
        // was pinned, which is the exact failure mode `wasm_check.js` writes
        // down for the contact corpus.
        //
        // **Values here, perturbations in the feature test, and the difference
        // is the divisor.** `every_articulated_feature_lands_on_its_documented_index`
        // nudges a field and asks which columns moved, because writing expected
        // *values* there would need a second copy of every divisor and would
        // then agree with the writer by construction. A pose column has no
        // divisor: the reference's word rule is "the raw bits, reinterpreted",
        // so the expected value costs one `as u32` and claims more -- it fails a
        // column that landed in the right place with the wrong encoding as well
        // as one that landed in the wrong place.
        let pose = every_pose_column_filled();
        let row = pose_row(&pose);
        let word = |value: Fx| value.raw() as u32;
        let arm = |limb: usize| pose.arms[limb];
        let weapon = |limb: usize| pose.weapons[limb].expect("the fixture fills both grips");
        let shield = pose.shield.expect("the fixture carries a shield");
        let columns: [(&str, usize, u32); POSE_STRIDE] = [
            ("entity index", POSE_ENTITY_INDEX, pose.id.index),
            ("entity generation", POSE_ENTITY_GENERATION, pose.id.generation),
            ("body x", POSE_BODY_X, word(pose.body.x)),
            ("body y", POSE_BODY_Y, word(pose.body.y)),
            ("body z", POSE_BODY_Z, word(pose.body.z)),
            // Widened rather than reinterpreted: an `Angle` raw is a `u16` and
            // has no sign to extend.
            ("body yaw raw", POSE_BODY_YAW_RAW, u32::from(pose.body_yaw.raw())),
            ("body vx", POSE_BODY_VX, word(pose.body_velocity.x)),
            ("body vy", POSE_BODY_VY, word(pose.body_velocity.y)),
            ("body vz", POSE_BODY_VZ, word(pose.body_velocity.z)),
            ("left hand x", POSE_LEFT_HAND_X, word(arm(0).hand.x)),
            ("left hand y", POSE_LEFT_HAND_Y, word(arm(0).hand.y)),
            ("left hand z", POSE_LEFT_HAND_Z, word(arm(0).hand.z)),
            ("left hand vx", POSE_LEFT_HAND_VX, word(arm(0).velocity.x)),
            ("left hand vy", POSE_LEFT_HAND_VY, word(arm(0).velocity.y)),
            ("left hand vz", POSE_LEFT_HAND_VZ, word(arm(0).velocity.z)),
            ("left fatigue", POSE_LEFT_FATIGUE, word(arm(0).fatigue)),
            ("left target x", POSE_LEFT_TARGET_X, word(arm(0).target_hand.x)),
            ("left target y", POSE_LEFT_TARGET_Y, word(arm(0).target_hand.y)),
            ("left target z", POSE_LEFT_TARGET_Z, word(arm(0).target_hand.z)),
            ("right hand x", POSE_RIGHT_HAND_X, word(arm(1).hand.x)),
            ("right hand y", POSE_RIGHT_HAND_Y, word(arm(1).hand.y)),
            ("right hand z", POSE_RIGHT_HAND_Z, word(arm(1).hand.z)),
            ("right hand vx", POSE_RIGHT_HAND_VX, word(arm(1).velocity.x)),
            ("right hand vy", POSE_RIGHT_HAND_VY, word(arm(1).velocity.y)),
            ("right hand vz", POSE_RIGHT_HAND_VZ, word(arm(1).velocity.z)),
            ("right fatigue", POSE_RIGHT_FATIGUE, word(arm(1).fatigue)),
            ("right target x", POSE_RIGHT_TARGET_X, word(arm(1).target_hand.x)),
            ("right target y", POSE_RIGHT_TARGET_Y, word(arm(1).target_hand.y)),
            ("right target z", POSE_RIGHT_TARGET_Z, word(arm(1).target_hand.z)),
            ("left hilt x", POSE_LEFT_WEAPON_HILT_X, word(weapon(0).hilt.x)),
            ("left hilt y", POSE_LEFT_WEAPON_HILT_Y, word(weapon(0).hilt.y)),
            ("left hilt z", POSE_LEFT_WEAPON_HILT_Z, word(weapon(0).hilt.z)),
            ("left tip x", POSE_LEFT_WEAPON_TIP_X, word(weapon(0).tip.x)),
            ("left tip y", POSE_LEFT_WEAPON_TIP_Y, word(weapon(0).tip.y)),
            ("left tip z", POSE_LEFT_WEAPON_TIP_Z, word(weapon(0).tip.z)),
            ("right hilt x", POSE_RIGHT_WEAPON_HILT_X, word(weapon(1).hilt.x)),
            ("right hilt y", POSE_RIGHT_WEAPON_HILT_Y, word(weapon(1).hilt.y)),
            ("right hilt z", POSE_RIGHT_WEAPON_HILT_Z, word(weapon(1).hilt.z)),
            ("right tip x", POSE_RIGHT_WEAPON_TIP_X, word(weapon(1).tip.x)),
            ("right tip y", POSE_RIGHT_WEAPON_TIP_Y, word(weapon(1).tip.y)),
            ("right tip z", POSE_RIGHT_WEAPON_TIP_Z, word(weapon(1).tip.z)),
            ("shield centre x", POSE_SHIELD_CENTER_X, word(shield.centre.x)),
            ("shield centre y", POSE_SHIELD_CENTER_Y, word(shield.centre.y)),
            ("shield centre z", POSE_SHIELD_CENTER_Z, word(shield.centre.z)),
            ("shield normal x", POSE_SHIELD_NORMAL_X, word(shield.normal.x)),
            ("shield normal y", POSE_SHIELD_NORMAL_Y, word(shield.normal.y)),
            ("shield normal z", POSE_SHIELD_NORMAL_Z, word(shield.normal.z)),
            ("shield half width", POSE_SHIELD_HALF_WIDTH, word(shield.half_width)),
            ("shield half height", POSE_SHIELD_HALF_HEIGHT, word(shield.half_height)),
            ("integrity 0", POSE_INTEGRITY_FIRST, word(pose.integrity_fraction[0])),
            ("integrity 1", POSE_INTEGRITY_FIRST + 1, word(pose.integrity_fraction[1])),
            ("integrity 2", POSE_INTEGRITY_FIRST + 2, word(pose.integrity_fraction[2])),
            ("integrity 3", POSE_INTEGRITY_FIRST + 3, word(pose.integrity_fraction[3])),
            ("integrity 4", POSE_INTEGRITY_FIRST + 4, word(pose.integrity_fraction[4])),
            ("wound 0", POSE_WOUND_FIRST, word(pose.wound_fraction[0])),
            ("wound 1", POSE_WOUND_FIRST + 1, word(pose.wound_fraction[1])),
            ("wound 2", POSE_WOUND_FIRST + 2, word(pose.wound_fraction[2])),
            ("wound 3", POSE_WOUND_FIRST + 3, word(pose.wound_fraction[3])),
            ("wound 4", POSE_WOUND_FIRST + 4, word(pose.wound_fraction[4])),
            ("blood fraction", POSE_BLOOD_FRACTION, word(pose.blood_fraction)),
            ("shock", POSE_SHOCK, word(pose.shock)),
            ("severed mask", POSE_SEVERED_MASK, u32::from(pose.severed_mask)),
            ("equipment mask", POSE_EQUIPMENT_MASK, u32::from(pose.equipment_mask)),
            // Frozen wire ordinals -- Hold 0, Attack 1, Flee 2 -- and not the
            // enum's declaration order by luck.
            ("intent", POSE_INTENT, 2),
            ("left hint", POSE_LEFT_HINT, sim::AnimationHint::Contact as u32),
            ("right hint", POSE_RIGHT_HINT, sim::AnimationHint::Recoiling as u32),
        ];

        for &(named, at, value) in &columns {
            assert_eq!(row[at], value, "pose word {at} does not hold {named}");
        }
        // The list is every word once, so a column appended to the row without
        // a line above fails here rather than going unchecked forever.
        let mut indices: Vec<usize> = columns.iter().map(|&(_, at, _)| at).collect();
        indices.sort_unstable();
        assert_eq!(indices, (0..POSE_STRIDE).collect::<Vec<usize>>(), "the table is not all 66 words");
        // And the fixture is what makes the claim a transposition claim: two
        // columns holding one value would swap undetected.
        let mut values: Vec<u32> = columns.iter().map(|&(_, _, value)| value).collect();
        values.sort_unstable();
        values.dedup();
        assert_eq!(values.len(), POSE_STRIDE, "two columns share a value, so a swap between them passes");
    }

    #[test]
    fn every_combat_event_column_lands_on_its_documented_word() {
        // The pose test's claim for the other row: all 32 columns of the
        // reference's event table against the `ContactResolution` field it
        // names.
        //
        // Driven off the clinch rather than a hand-built row, and that is a
        // constraint rather than a preference: `ContactFact`, `ContactKey`,
        // `EnergyLedger` and `TimeOfImpact` are not part of `sim`'s public
        // surface, so a synthetic resolution would mean widening the crate's
        // API for a test. The cost is that a live row repeats values -- a quiet
        // channel is zero in several places at once -- so a swap between two
        // zero columns survives this where it would not survive the pose test's
        // fixture. It is worth having anyway: without it, sixteen of these
        // columns have no per-column pin at all.
        init_embodied_test(1);
        let mut checked = 0usize;
        let (mut saw_named_region, mut saw_absent_region) = (false, false);
        for phase in 0..128 {
            for row in 0..2 {
                EMBODIED_COMMAND.with(|buffer| *buffer.borrow_mut() = clinch_payload(row, phase));
                submit_embodied(row as u32, 0);
            }
            let at = tick();
            step(1);
            let rows = published_events();
            if rows.is_empty() {
                continue;
            }
            SIM.with(|sim| {
                let borrowed = sim.borrow();
                let world = &borrowed.as_ref().unwrap().world;
                let solved = world.contact_resolutions();
                assert_eq!(solved.len(), rows.len(), "a solved row went unpublished");
                for (resolution, row) in solved.iter().zip(&rows) {
                    let fact = resolution.fact;
                    let word = |value: Fx| value.raw() as u32;
                    let lo = |value: u64| value as u32;
                    let hi = |value: u64| (value >> 32) as u32;
                    saw_named_region |= sim::volume_region(fact.volume as usize).is_some();
                    saw_absent_region |= sim::volume_region(fact.volume as usize).is_none();
                    let columns: [(&str, usize, u32); COMBAT_EVENT_STRIDE] = [
                        // The tick that was *integrated*, read before the step:
                        // the time of impact beside it is a fraction of that
                        // tick and not of the one the counter holds after.
                        ("tick", COMBAT_EVENT_TICK, at),
                        ("toi raw", COMBAT_EVENT_TOI_RAW, fact.toi.get().raw() as u32),
                        ("group ordinal", COMBAT_EVENT_GROUP_ORDINAL, u32::from(resolution.group_ordinal)),
                        ("a index", COMBAT_EVENT_A_INDEX, fact.key.a.index),
                        ("a generation", COMBAT_EVENT_A_GENERATION, fact.key.a.generation),
                        ("b index", COMBAT_EVENT_B_INDEX, fact.key.b.index),
                        ("b generation", COMBAT_EVENT_B_GENERATION, fact.key.b.generation),
                        ("a slot", COMBAT_EVENT_A_SLOT, u32::from(fact.key.a_slot)),
                        ("b slot", COMBAT_EVENT_B_SLOT, u32::from(fact.key.b_slot)),
                        ("kind", COMBAT_EVENT_KIND, fact.key.kind as u32),
                        ("point x", COMBAT_EVENT_POINT_X, word(fact.point.x)),
                        ("point y", COMBAT_EVENT_POINT_Y, word(fact.point.y)),
                        ("point z", COMBAT_EVENT_POINT_Z, word(fact.point.z)),
                        ("normal x", COMBAT_EVENT_NORMAL_X, word(fact.normal.x)),
                        ("normal y", COMBAT_EVENT_NORMAL_Y, word(fact.normal.y)),
                        ("normal z", COMBAT_EVENT_NORMAL_Z, word(fact.normal.z)),
                        ("energy before lo", COMBAT_EVENT_ENERGY_BEFORE_LO, lo(resolution.energy.before_raw)),
                        ("energy before hi", COMBAT_EVENT_ENERGY_BEFORE_HI, hi(resolution.energy.before_raw)),
                        ("energy after lo", COMBAT_EVENT_ENERGY_AFTER_LO, lo(resolution.energy.after_raw)),
                        ("energy after hi", COMBAT_EVENT_ENERGY_AFTER_HI, hi(resolution.energy.after_raw)),
                        ("dissipated lo", COMBAT_EVENT_ENERGY_DISSIPATED_LO, lo(resolution.energy.dissipated_raw)),
                        ("dissipated hi", COMBAT_EVENT_ENERGY_DISSIPATED_HI, hi(resolution.energy.dissipated_raw)),
                        ("cut lo", COMBAT_EVENT_CUT_LO, lo(resolution.cut_raw)),
                        ("cut hi", COMBAT_EVENT_CUT_HI, hi(resolution.cut_raw)),
                        ("thrust lo", COMBAT_EVENT_THRUST_LO, lo(resolution.thrust_raw)),
                        ("thrust hi", COMBAT_EVENT_THRUST_HI, hi(resolution.thrust_raw)),
                        // **Both blunt channels, and the audit says so rather
                        // than reading the residual alone.** The publisher sums
                        // `crush` into this column deliberately -- see the
                        // argument beside the write -- so that the share a
                        // reader recovers by adding the three channels is the
                        // share that was allocated, and a crushing blow draws at
                        // its real size instead of looking like an inert graze.
                        // Asserting `pressure_raw` on its own passes only while
                        // `crush_raw` is zero, which is every default-law fixture
                        // and *not* the exact-law one: that is how this column
                        // came to disagree with its writer and stay green.
                        ("pressure lo", COMBAT_EVENT_PRESSURE_LO,
                         lo(resolution.crush_raw + resolution.pressure_raw)),
                        ("pressure hi", COMBAT_EVENT_PRESSURE_HI,
                         hi(resolution.crush_raw + resolution.pressure_raw)),
                        ("deflected lo", COMBAT_EVENT_DEFLECTED_LO, lo(resolution.deflected_raw)),
                        ("deflected hi", COMBAT_EVENT_DEFLECTED_HI, hi(resolution.deflected_raw)),
                        // The one column the host translates rather than
                        // copies, and it now translates twice over: a swept
                        // volume becomes its `BodyPart` through
                        // `sim::volume_region`, and a fact with no body becomes
                        // `u32::MAX` so a reader that lost the width cannot read
                        // the sentinel as a region index.
                        ("body part", COMBAT_EVENT_BODY_PART,
                         match sim::volume_region(fact.volume as usize) {
                             Some(part) => part as u32,
                             None => COMBAT_EVENT_NO_BODY_PART,
                         }),
                        ("severed", COMBAT_EVENT_SEVERED, u32::from(resolution.severed)),
                    ];
                    for &(named, index, value) in &columns {
                        assert_eq!(row[index], value, "event word {index} does not hold {named}");
                    }
                    let mut indices: Vec<usize> = columns.iter().map(|&(_, at, _)| at).collect();
                    indices.sort_unstable();
                    assert_eq!(
                        indices,
                        (0..COMBAT_EVENT_STRIDE).collect::<Vec<usize>>(),
                        "the table is not all 32 words",
                    );
                    checked += 1;
                }
            });
        }
        assert!(checked > 0, "the clinch published no contact row to check a column against");
        assert!(saw_named_region, "no row named an anatomy region, so that branch is unchecked");
        assert!(saw_absent_region, "no row published the absent-region sentinel");
    }

    // **`a_legacy_room_publishes_no_pose_or_event_rows` is deleted with its
    // subject.** It opened `init`'s room under Legacy and required the pose and
    // combat-event sections to publish nothing at all -- a real claim while the
    // page booted into a world with no joints, and one with no world left to
    // make it about. What replaced it is the opposite reading, in
    // `wasm_exports_match_layout_stride_capacity_and_drop_fields`: every floor
    // this module opens publishes a pose per body, and the section a legless
    // world still answers zero for keeps its own test in
    // `an_articulated_module_publishes_a_zero_length_stance_section_and_not_no_section`.

    #[test]
    fn pose_and_event_overflow_drop_only_the_canonical_tail() {
        // Driven through the writers directly, because neither cap is reachable
        // from a world: `MAX_POSES` *is* `MAX_ENTITIES`, so a sim
        // that overflowed the pose buffer would have broken its own limit
        // first. The rule is defensive against a malformed or future-version
        // producer, so the producer here is a synthetic one.
        let mut poses = [0u32; MAX_POSES * POSE_STRIDE];
        let (mut rows, mut dropped) = (0u32, 0u32);
        for row in 0..MAX_POSES as u32 + 6 {
            let mut synthetic = [row; POSE_STRIDE];
            synthetic[POSE_ENTITY_INDEX] = row;
            push_published_row(&mut poses, &mut rows, &mut dropped, &synthetic);
        }
        assert_eq!((rows, dropped), (MAX_POSES as u32, 6));
        for row in 0..MAX_POSES {
            assert_eq!(
                poses[row * POSE_STRIDE + POSE_ENTITY_INDEX],
                row as u32,
                "the retained rows are not the canonical prefix in order",
            );
        }

        let mut events = [0u32; MAX_COMBAT_EVENTS * COMBAT_EVENT_STRIDE];
        let (mut rows, mut dropped) = (0u32, 0u32);
        for row in 0..MAX_COMBAT_EVENTS as u32 + 44 {
            let mut synthetic = [0u32; COMBAT_EVENT_STRIDE];
            synthetic[COMBAT_EVENT_TICK] = row;
            push_published_row(&mut events, &mut rows, &mut dropped, &synthetic);
        }
        assert_eq!((rows, dropped), (MAX_COMBAT_EVENTS as u32, 44));
        for row in 0..MAX_COMBAT_EVENTS {
            assert_eq!(events[row * COMBAT_EVENT_STRIDE + COMBAT_EVENT_TICK], row as u32);
        }

        // And the accumulator's own copy of the rule, which is the one that has
        // teeth: a push past the reserved capacity reallocates, and a
        // reallocation inside a tick detaches every view the page holds.
        let mut accumulated = Vec::with_capacity(MAX_COMBAT_EVENTS);
        let reserved = accumulated.capacity();
        let mut dropped = 0u32;
        for row in 0..MAX_COMBAT_EVENTS as u32 + 44 {
            let mut synthetic = [0u32; COMBAT_EVENT_STRIDE];
            synthetic[COMBAT_EVENT_TICK] = row;
            push_combat_event(&mut accumulated, &mut dropped, synthetic);
        }
        assert_eq!((accumulated.len(), dropped), (MAX_COMBAT_EVENTS, 44));
        assert_eq!(accumulated.capacity(), reserved, "the accumulator reallocated under the cap");
        assert_eq!(accumulated[0][COMBAT_EVENT_TICK], 0, "the tail won over the prefix");

        // Saturating rather than wrapping: a drop count that wrapped would read
        // zero at the exact moment it mattered most. A zero-length buffer is the
        // shortest way to say "there is no room for this row".
        let mut nowhere: [u32; 0] = [];
        let (mut rows, mut dropped) = (0u32, u32::MAX);
        push_published_row(&mut nowhere, &mut rows, &mut dropped, &[0u32; COMBAT_EVENT_STRIDE]);
        assert_eq!((rows, dropped), (0, u32::MAX));
        let mut accumulated = vec![[0u32; COMBAT_EVENT_STRIDE]; MAX_COMBAT_EVENTS];
        let mut dropped = u32::MAX;
        push_combat_event(&mut accumulated, &mut dropped, [0u32; COMBAT_EVENT_STRIDE]);
        assert_eq!(dropped, u32::MAX);
    }

    #[test]
    fn both_limb_slots_and_regions_round_trip() {
        let publications = clinch_event_rows(128);
        let rows: Vec<[u32; COMBAT_EVENT_STRIDE]> =
            publications.into_iter().flatten().collect();
        assert!(!rows.is_empty(), "the clinch published no contact at all");

        let slots: std::collections::BTreeSet<u32> = rows
            .iter()
            .flat_map(|row| [row[COMBAT_EVENT_A_SLOT], row[COMBAT_EVENT_B_SLOT]])
            .collect();
        // The duel is a shield in the left grip, a sword in the right and a club
        // in the other body's right, so all three of the vocabulary's values are
        // reachable -- and `BODY_SLOT` is carried across as the sim's own `0xff`
        // rather than remapped, which is the half a second vocabulary would
        // break.
        assert!(slots.contains(&0), "no contact named the left grip; saw {slots:?}");
        assert!(slots.contains(&1), "no contact named the right grip; saw {slots:?}");
        assert!(
            slots.contains(&u32::from(sim::BODY_SLOT)),
            "no contact named a body; saw {slots:?}",
        );

        let regions: std::collections::BTreeSet<u32> =
            rows.iter().map(|row| row[COMBAT_EVENT_BODY_PART]).collect();
        assert!(
            regions.contains(&COMBAT_EVENT_NO_BODY_PART),
            "no weapon-on-weapon or weapon-on-shield fact published the absent sentinel",
        );
        assert!(
            regions.iter().any(|&part| (part as usize) < sim::AnatomyRegion::COUNT),
            "no fact published an anatomy region; saw {regions:?}",
        );
        // The sentinel is `u32::MAX` and not the sim's widened `0xff`, so a
        // reader that lost track of the width cannot mistake it for the fifth
        // region -- or for any region a later anatomy might add.
        assert!(!regions.contains(&u32::from(sim::NO_VOLUME)));
        // And no swept-volume index reaches this column either: a forearm is
        // published as its arm, so `5` and `6` are values the wire never carries
        // here even though the region section is seven rows wide.
        assert!(regions.iter().all(|&part|
            (part as usize) < sim::AnatomyRegion::COUNT || part == COMBAT_EVENT_NO_BODY_PART),
            "a swept volume index reached the body-part column; saw {regions:?}");
    }

    #[test]
    fn target_hands_round_trip() {
        init(1);
        SIM.with(|sim| {
            let borrowed = sim.borrow();
            let world = &borrowed.as_ref().unwrap().world;
            for row in published_poses() {
                let id = EntityId::new(row[POSE_ENTITY_INDEX], row[POSE_ENTITY_GENERATION]);
                let pose = world.pose(id).expect("a live body");
                for (limb, base) in [(0usize, POSE_LEFT_TARGET_X), (1, POSE_RIGHT_TARGET_X)] {
                    assert_eq!(
                        row[base..base + 3],
                        vec3_words(pose.arms[limb].target_hand),
                        "the actuator target the row publishes is not the one it chases",
                    );
                }
                // **Not zero, on a body that has never had a command accepted.**
                // The sim substitutes the neutral command the arm driver is
                // actually converging on, so a zero here would be a reach line
                // drawn to the map origin -- which is exactly the bug the
                // substitution exists to prevent.
                assert_ne!(
                    row[POSE_RIGHT_TARGET_X..POSE_RIGHT_TARGET_X + 3],
                    [0, 0, 0],
                    "an uncommanded arm published a target at the world origin",
                );
            }
        });

    }

    #[test]
    fn contact_group_ordinals_restart_and_advance_within_each_tick() {
        // Ordinals restart at zero every tick and count sequential groups
        // within it, which is the whole reason the column exists: two groups
        // solved at the same raw time of impact are still ordered.
        //
        // **Both builds since 2026-08-15, and the merge is the finding.** This
        // used to be the compatibility half of a pair, beside a feature-only
        // `exact_attack_single_group_ordinals_restart_at_zero` that asserted
        // every exact ordinal was zero -- true only because the exact drive had
        // never produced two groups in one tick. Smart134's doubled arm bearing
        // rates gave it one, on publication 86, ordinals `[0, 1]`; the weaker
        // assertion went red and the stronger one below passes unchanged. So
        // the two are one test rather than a test and a re-recorded version of
        // it, and `saw_several` is now earned on both paths instead of being
        // the reason one of them was excused from it.
        //
        // **And un-merged again on 2026-08-16, which is a recorded loss rather
        // than a tidy-up.** Freeing the shield normal to follow its arm removed
        // the exact law's two-group tick from this drive, and it is the *normal*
        // that removed it and not the drive: the original both-arm sweep fails
        // this assertion under the exact law too, measured, and widening the
        // window to 384 publications does not recover it. So the ordering
        // invariants below are asserted on both laws and `saw_several` is
        // claimed only where it is still earned. **The exact build has no
        // multi-group coverage from this fixture until somebody finds a drive
        // that produces one** -- that is an open gap, not a solved problem, and
        // it belongs to the opt-in feature rather than to the shipped default.
        let publications = clinch_event_rows(128);
        let mut saw_several = false;
        for rows in &publications {
            let ordinals: Vec<u32> =
                rows.iter().map(|row| row[COMBAT_EVENT_GROUP_ORDINAL]).collect();
            if ordinals.is_empty() {
                continue;
            }
            assert_eq!(ordinals[0], 0, "a tick's first group was not ordinal zero");
            assert!(
                ordinals.windows(2).all(|pair| pair[0] <= pair[1]),
                "group ordinals are not ascending within a tick: {ordinals:?}",
            );
            saw_several |= ordinals.last() != ordinals.first();
        }
        #[cfg(not(feature = "cartesian-recoil"))]
        assert!(saw_several, "no publication carried more than one contact group");
        #[cfg(feature = "cartesian-recoil")]
        let _ = saw_several;
    }

    fn assert_documented_event_order(require_multi_group: bool) {
        let publications = clinch_event_rows(128);
        let mut multi_group = 0;
        for rows in &publications {
            let keys: Vec<_> = rows.iter().map(event_order_key).collect();
            let mut sorted = keys.clone();
            sorted.sort_unstable();
            assert_eq!(
                keys, sorted,
                "the published rows are not in (tick, toi, ordinal, key) order",
            );
            // Strictly increasing, not merely sorted: two identical keys would
            // be one contact published twice.
            assert!(keys.windows(2).all(|pair| pair[0] != pair[1]), "a contact was published twice");
            if rows
                .iter()
                .any(|row| row[COMBAT_EVENT_GROUP_ORDINAL] != rows[0][COMBAT_EVENT_GROUP_ORDINAL])
            {
                multi_group += 1;
            }
        }
        if require_multi_group {
            assert!(multi_group > 0,
                "the fixture never produced two contact groups in one tick, so it proves nothing");
        }
        // Compatibility also proves the across-tick half a per-tick check
        // cannot see.
        //
        // **The two advances were 6 and 8 and the batch started at tick 6, until
        // the scripted fixture was reseated onto the embodied model.** That is a
        // moved *fixture coordinate* and not a weakened claim: the drive is the
        // same script, and what changed is when it makes contact. It used to
        // resolve nothing until tick 3 and then carry a row on nearly every tick
        // to twenty, so a batch opened at tick 6 spanned several. The embodied
        // fight is shorter -- rows on ticks 0 and 3 through 6 and nothing after
        // -- so a batch opened at 6 holds exactly one row and the across-tick
        // half would have been asserting nothing. Opened at 3 it holds four,
        // over four ticks, which is the property this half is for. The shape is
        // measured by `print_the_articulated_stream_digest` and the numbers
        // below are read off it rather than guessed.
        #[cfg(not(feature = "cartesian-recoil"))]
        let scenario = stream_digest_scenario();
        #[cfg(not(feature = "cartesian-recoil"))]
        let mut sim = Sim::try_on(&scenario, STREAM_DIGEST_SEED).expect("the scripted fixture");
        // Named rather than inherited, for the reason `drive_stream_digest_script`
        // gives at length: the room opens on `Tactical` and the *fixture* is
        // scripted. Here it buys the tick coordinates below rather than a pin --
        // the batch starting at 3 and spanning four ticks is a fact about this
        // script, and a mind reading the room instead of the script would move
        // both numbers without moving anything this test is about.
        #[cfg(not(feature = "cartesian-recoil"))]
        sim.set_policy(Faction::Heroes, PolicyKind::Scripted);
        #[cfg(not(feature = "cartesian-recoil"))]
        sim.set_policy(Faction::Monsters, PolicyKind::Scripted);
        #[cfg(not(feature = "cartesian-recoil"))]
        let east = EntityId::new(0, 0);
        #[cfg(not(feature = "cartesian-recoil"))]
        let west = EntityId::new(1, 0);
        #[cfg(not(feature = "cartesian-recoil"))]
        sim.world.submit(
            east,
            sim::CommandV1::new(
                stream_digest_command(Angle::ZERO, Vec2::new(-Fx::ONE, Fx::ZERO), west),
            ),
        );
        #[cfg(not(feature = "cartesian-recoil"))]
        sim.world.submit(
            west,
            sim::CommandV1::new(stream_digest_command(Angle::ZERO, Vec2::ZERO, east)),
        );
        #[cfg(not(feature = "cartesian-recoil"))]
        sim.advance(3);
        #[cfg(not(feature = "cartesian-recoil"))]
        sim.advance(4);
        #[cfg(not(feature = "cartesian-recoil"))]
        let rows = sim.combat_events.clone();
        // Bounded lifted resolution deliberately refuses some coupled contact
        // sets the compatibility ray accepted. Reuse the ordinary exact attack
        // above rather than making event ordering depend on that response-law
        // distinction; this is the same predeclared drive whose nonempty result
        // `an_ordinary_exact_attack_stays_below_the_legacy_group_cap` asserts.
        #[cfg(feature = "cartesian-recoil")]
        let rows: Vec<_> = publications.iter().flatten().copied().collect();
        assert!(rows.len() > 1, "the order fixture accumulated {} rows", rows.len());
        let ticks: Vec<u32> = rows.iter().map(|row| row[COMBAT_EVENT_TICK]).collect();
        assert!(ticks.windows(2).all(|pair| pair[0] <= pair[1]), "ticks are out of order");
        #[cfg(not(feature = "cartesian-recoil"))]
        assert_ne!(ticks.first(), ticks.last(), "the batch never crossed a tick boundary");
        #[cfg(not(feature = "cartesian-recoil"))]
        assert_eq!(*ticks.first().unwrap(), 3, "the batch did not start at the first tick of the call");
        let keys: Vec<_> = rows.iter().map(event_order_key).collect();
        let mut sorted = keys.clone();
        sorted.sort_unstable();
        assert_eq!(keys, sorted, "the event rows are not in the documented order");
    }

    #[cfg(not(feature = "cartesian-recoil"))]
    #[test]
    fn the_documented_event_order_holds_over_a_tick_with_several_groups() {
        assert_documented_event_order(true);
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn exact_event_order_is_canonical_for_an_ordinary_attack() {
        assert_documented_event_order(false);
    }

    #[test]
    fn no_energy_channel_narrows_to_a_u32() {
        // Above `u32::MAX` on purpose. A host that published `raw as u32` would
        // pass every test built from a fight -- no shipped fixture has reached
        // four billion raw energy units -- and would be silently wrong the first
        // day one did.
        let wide = 0x0001_2345_6789_abcdu64;
        assert_eq!(u64_words(wide), [0x6789_abcd, 0x0001_2345]);
        let [lo, hi] = u64_words(wide);
        assert_eq!(u64::from(lo) | (u64::from(hi) << 32), wide, "a wide channel did not survive");
        assert_eq!(u64_words(u64::MAX), [u32::MAX; 2]);
        assert_eq!(u64_words(u64::from(u32::MAX) + 1), [0, 1], "the carry into the high word is lost");

        // And the seven pairs are wired to seven different fields, read back off
        // the solver's own rows rather than off a second call to the encoder.
        init_embodied_test(1);
        let mut published = Vec::new();
        for phase in 0..128 {
            for row in 0..2 {
                EMBODIED_COMMAND.with(|buffer| *buffer.borrow_mut() = clinch_payload(row, phase));
                submit_embodied(row as u32, 0);
            }
            let at = tick();
            step(1);
            let rows = published_events();
            if rows.is_empty() {
                continue;
            }
            published = SIM.with(|sim| {
                let borrowed = sim.borrow();
                let world = &borrowed.as_ref().unwrap().world;
                world
                    .contact_resolutions()
                    .iter()
                    .zip(&rows)
                    .map(|(solved, row)| {
                        let channel = |lo: usize| {
                            u64::from(row[lo]) | (u64::from(row[lo + 1]) << 32)
                        };
                        assert_eq!(row[COMBAT_EVENT_TICK], at, "the row named the wrong tick");
                        assert_eq!(channel(COMBAT_EVENT_ENERGY_BEFORE_LO), solved.energy.before_raw);
                        assert_eq!(channel(COMBAT_EVENT_ENERGY_AFTER_LO), solved.energy.after_raw);
                        assert_eq!(
                            channel(COMBAT_EVENT_ENERGY_DISSIPATED_LO),
                            solved.energy.dissipated_raw,
                        );
                        assert_eq!(channel(COMBAT_EVENT_CUT_LO), solved.cut_raw);
                        assert_eq!(channel(COMBAT_EVENT_THRUST_LO), solved.thrust_raw);
                        // **`crush + pressure`, which is what `combat_event_row`
                        // publishes and what `articulated-abi.md` documents this
                        // column to be.** It read `solved.pressure_raw` alone
                        // until the drive above was ported onto the embodied
                        // duel, and passed -- because the articulated clinch it
                        // used to run never produced a crushing component on the
                        // tick this loop stops at, so the two spellings were the
                        // same number. That is the shape `AGENTS.md` calls the
                        // worst defect this repository produces: a green
                        // assertion about something the code does not do,
                        // invisible until a fixture moved underneath it. The
                        // embodied brute's club lands crush, and it caught it.
                        assert_eq!(
                            channel(COMBAT_EVENT_PRESSURE_LO),
                            solved.crush_raw + solved.pressure_raw,
                            "the pressure column is not the crush-and-pressure sum",
                        );
                        assert_eq!(channel(COMBAT_EVENT_DEFLECTED_LO), solved.deflected_raw);
                        assert_eq!(row[COMBAT_EVENT_SEVERED], u32::from(solved.severed));
                        solved.energy.before_raw
                    })
                    .collect()
            });
            if !published.is_empty() {
                break;
            }
        }
        assert!(!published.is_empty(), "the clinch never resolved a group to read a ledger off");
    }

    #[test]
    fn empty_ticks_enter_both_stream_digests() {
        let mut shape = Vec::new();
        drive_stream_digest_script(|published| {
            shape.push((
                published.tick,
                published.poses.len() / POSE_STRIDE,
                published.events.len() / COMBAT_EVENT_STRIDE,
            ));
        });
        assert_eq!(shape.len(), STREAM_DIGEST_TICKS as usize);
        assert!(
            shape.iter().any(|&(_, _, events)| events == 0),
            "the script has no empty tick, so it cannot show that one enters the digest",
        );
        assert!(
            shape.iter().any(|&(_, _, events)| events > 0),
            "the script never resolved a contact, so it fingerprints an empty stream",
        );
        assert!(shape.iter().all(|&(_, poses, _)| poses > 0), "a body stopped publishing a pose");

        // The claim itself: a digest that skipped the ticks with nothing in them
        // is a *different* number, so the empty ones are carried rather than
        // merely tolerated. Without this the stream could lose every quiet tick
        // and still match its pin.
        let mut skipped = fx::Hash64::new();
        skipped.write_bytes(b"ARPG-STREAM-V1");
        drive_stream_digest_script(|published| {
            if published.events.is_empty() {
                return;
            }
            skipped.write_u32(published.tick);
            skipped.write_u32((published.poses.len() / POSE_STRIDE) as u32);
            skipped.write_u32(published.poses_dropped);
            for &word in published.poses {
                skipped.write_u32(word);
            }
            skipped.write_u32((published.events.len() / COMBAT_EVENT_STRIDE) as u32);
            skipped.write_u32(published.events_dropped);
            for &word in published.events {
                skipped.write_u32(word);
            }
            skipped.write_u32((published.regions.len() / REGION_STRIDE) as u32);
            skipped.write_u32(published.regions_dropped);
            for &word in published.regions {
                skipped.write_u32(word);
            }
        });
        assert_ne!(
            skipped.finish(),
            articulated_stream_digest(),
            "dropping every empty tick left the digest unchanged",
        );
    }

    #[test]
    fn native_and_wasm_pose_event_stream_digests_match() {
        // The native half. The wasm half calls `articulated_stream_digest_lo`
        // and `_hi` against the built module and compares the same constant;
        // a one-sided failure is target disagreement rather than a moved
        // fixture, which is why both sides pin the number rather than one side
        // asking the other.
        #[cfg(not(feature = "cartesian-recoil"))]
        {
            assert_eq!(articulated_stream_digest(), ARTICULATED_STREAM_DIGEST);
            assert_eq!(articulated_stream_digest_lo(), ARTICULATED_STREAM_DIGEST as u32);
            assert_eq!(articulated_stream_digest_hi(), (ARTICULATED_STREAM_DIGEST >> 32) as u32);
        }
        #[cfg(feature = "cartesian-recoil")]
        {
            let first = compute_articulated_stream_digest();
            let second = compute_articulated_stream_digest();
            assert_eq!(first, second, "the exact-law stream is not repeatable natively");
            assert_ne!(first, ARTICULATED_STREAM_DIGEST,
                "the exact-law stream accidentally reused the legacy witness");
        }

        // Self-contained, which is the property `selftest_hash` used to carry
        // beside it: the page may be mid-fight when the worker asks for this,
        // and a digest that stepped the installed world would be a diagnostic
        // that broke the thing it was diagnosing.
        init(4);
        step(12);
        let before = (tick(), state_hash(), frame_len(), pose_len(), combat_event_len());
        articulated_stream_digest();
        assert_eq!(
            (tick(), state_hash(), frame_len(), pose_len(), combat_event_len()),
            before,
            "the stream digest disturbed the installed sim",
        );
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn exact_trajectory_state_digest_is_paired_cached_and_self_contained() {
        EXACT_TRAJECTORY_STATE_DIGEST_VALUE.with(|slot| slot.set(None));
        EXACT_TRAJECTORY_STATE_DIGEST_COMPUTES.with(|count| count.set(0));
        init(4);
        step(12);
        let before = (tick(), state_hash(), frame_len(), pose_len(), combat_event_len());
        let measured = u64::from(exact_trajectory_state_digest_lo())
            | (u64::from(exact_trajectory_state_digest_hi()) << 32);
        assert_eq!(measured, EXACT_TRAJECTORY_STATE_DIGEST,
            "EXACT_TRAJECTORY_STATE_DIGEST moved: {measured:#018x}");
        assert_eq!(exact_trajectory_state_digest_lo(), measured as u32);
        assert_eq!(exact_trajectory_state_digest_hi(), (measured >> 32) as u32);
        EXACT_TRAJECTORY_STATE_DIGEST_COMPUTES.with(|count| assert_eq!(count.get(), 1,
            "the split and repeated reads recomputed the exact trajectory fixture"));
        assert_eq!((tick(), state_hash(), frame_len(), pose_len(), combat_event_len()), before,
            "the exact trajectory diagnostic disturbed the installed sim");
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn lifted_coulomb_solver_digest_is_paired_cached_and_self_contained() {
        LIFTED_COULOMB_SOLVER_DIGEST_VALUE.with(|slot| slot.set(None));
        LIFTED_COULOMB_SOLVER_DIGEST_COMPUTES.with(|count| count.set(0));
        init(4); step(12);
        let before = (tick(), state_hash(), frame_len(), pose_len(), combat_event_len());
        let measured = u64::from(lifted_coulomb_solver_digest_lo())
            | (u64::from(lifted_coulomb_solver_digest_hi()) << 32);
        assert_eq!(measured, LIFTED_COULOMB_SOLVER_DIGEST,
            "LIFTED_COULOMB_SOLVER_DIGEST moved: {measured:#018x}");
        assert_eq!(measured, sim::lifted_coulomb_solver_digest());
        assert_eq!(lifted_coulomb_solver_digest_lo(), measured as u32);
        assert_eq!(lifted_coulomb_solver_digest_hi(), (measured >> 32) as u32);
        LIFTED_COULOMB_SOLVER_DIGEST_COMPUTES.with(|count| assert_eq!(count.get(), 1,
            "the split and repeated reads recomputed the lifted solver fixture"));
        assert_eq!((tick(), state_hash(), frame_len(), pose_len(), combat_event_len()), before,
            "the lifted solver diagnostic disturbed the installed sim");
    }

    #[test]
    fn wasm_exports_match_layout_stride_capacity_and_drop_fields() {
        // **The twelve numbers are transcribed from the reference, not read off
        // the crate.** `assert_eq!(pose_stride(), POSE_STRIDE)` compares an
        // export against the constant it returns and cannot fail; it looks like
        // a pin and is a tautology. `tools/wasm_check.js` -- which carries this
        // exact name so a one-sided failure diagnoses target disagreement
        // rather than a moved fixture -- writes the literals out of
        // `articulated-abi.md`, and this half has to do the same or the pair is
        // one check and a decoration. A stride edited in the constant *and* the
        // export still fails here.
        assert_eq!(pose_layout_version(), 1, "POSE_LAYOUT_VERSION");
        assert_eq!(pose_stride(), 66, "POSE_STRIDE");
        assert_eq!(pose_capacity(), 64, "MAX_POSES");
        assert_eq!(combat_event_layout_version(), 1, "COMBAT_EVENT_LAYOUT_VERSION");
        assert_eq!(combat_event_stride(), 32, "COMBAT_EVENT_STRIDE");
        assert_eq!(combat_event_capacity(), 2048, "MAX_COMBAT_EVENTS");
        assert_eq!(region_layout_version(), 2, "REGION_LAYOUT_VERSION");
        assert_eq!(region_stride(), 8, "REGION_STRIDE");
        assert_eq!(region_capacity(), 448, "MAX_REGIONS");
        assert_eq!(articulated_projectile_layout_version(), 1,
            "ARTICULATED_PROJECTILE_LAYOUT_VERSION");
        assert_eq!(articulated_projectile_stride(), 12,
            "ARTICULATED_PROJECTILE_STRIDE");
        assert_eq!(articulated_projectile_capacity(), 32,
            "MAX_ARTICULATED_PROJECTILES");
        assert_eq!(embodied_stance_layout_version(), 1, "EMBODIED_STANCE_LAYOUT_VERSION");
        assert_eq!(embodied_stance_stride(), 6, "EMBODIED_STANCE_STRIDE");
        assert_eq!(embodied_stance_capacity(), 64, "MAX_EMBODIED_STANCE");
        // The two relationships worth asserting rather than transcribing: the
        // pose cap *is* the sim's articulated cap, so a sim that grew its own
        // limit fails here instead of quietly publishing a truncated roster,
        // and the region cap is that cap times the sim's own **swept volume**
        // count, so an eighth volume cannot leave the section publishing seven.
        // It read `AnatomyRegion::COUNT` while a body was five capsules; a
        // jointed arm is two, and the two numbers parted company there.
        assert_eq!(pose_capacity(), sim::MAX_ENTITIES as u32);
        assert_eq!(
            region_capacity(),
            pose_capacity() * sim::BODY_VOLUME_COUNT as u32,
            "the region buffer cannot hold one row per swept volume for every pose row",
        );
        assert_eq!(articulated_projectile_capacity(), sim::MAX_SHOTS as u32,
            "the projectile buffer is narrower than the authoritative store");
        assert_eq!(embodied_stance_capacity(), pose_capacity(),
            "a body could publish a torso with nowhere to put its legs");

        // **The "a world with no articulated columns publishes nothing" half of
        // this test is gone with its subject.** It drove `init` and required all
        // five sections to answer `(0, 0)`, and the drop halves were the point:
        // a count left over from the last articulated run would tell the page it
        // was missing bodies it was never owed. There is no such world left to
        // open -- every world this module installs publishes all five -- and the
        // only producer of an empty section that is left is the arm of `publish`
        // that runs when no world is installed at all, which keeps its own test
        // in
        // `a_module_with_no_world_publishes_a_zero_length_stance_section_and_not_no_section`.
        init(1);
        assert_ne!(pose_ptr(), 0);
        assert_ne!(combat_event_ptr(), 0);
        assert_ne!(region_ptr(), 0);
        assert_ne!(articulated_projectile_ptr(), 0);
        assert_ne!(pose_ptr(), combat_event_ptr(), "the two buffers share an address");
        assert_ne!(pose_ptr(), region_ptr(), "the pose and region buffers share an address");
        assert_ne!(combat_event_ptr(), region_ptr(), "two buffers share an address");
        assert_ne!(pose_ptr(), articulated_projectile_ptr(),
            "the pose and projectile buffers share an address");
        assert_ne!(combat_event_ptr(), articulated_projectile_ptr(),
            "the event and projectile buffers share an address");
        assert_ne!(region_ptr(), articulated_projectile_ptr(),
            "the region and projectile buffers share an address");
        assert!(pose_len() > 0, "the articulated room published no bodies");
        assert!(pose_len() <= pose_capacity());
        assert_eq!(poses_dropped(), 0, "the room overflowed a buffer sized to the sim's own cap");
        assert_eq!(combat_event_len(), 0, "nobody has stepped and the feed is not empty");
        assert_eq!(combat_events_dropped(), 0, "nobody has stepped and the feed dropped a row");

        // A pointer that moved between calls would mean the buffer is not a
        // fixed array, which is the one property a typed array over it depends
        // on.
        let (poses, events, regions, projectiles) =
            (pose_ptr(), combat_event_ptr(), region_ptr(), articulated_projectile_ptr());
        step(8);
        assert_eq!(
            (pose_ptr(), combat_event_ptr(), region_ptr(), articulated_projectile_ptr()),
            (poses, events, regions, projectiles),
        );
        assert!(combat_event_len() <= combat_event_capacity());
        assert!(region_len() <= region_capacity());
        assert_eq!(poses_dropped(), 0, "a two-body room overflowed a 64-row pose buffer");
        assert_eq!(combat_events_dropped(), 0, "a two-body room overflowed a 2048-row feed");
        assert_eq!(regions_dropped(), 0, "a room dropped a region row");
        assert_eq!(articulated_projectiles_dropped(), 0, "a room dropped a projectile row");
    }

    /// [`init`]'s floor is the generated floor with everybody equipped.
    ///
    /// **The claim survived the model that it was written about.** It used to be
    /// "the articulated room is `init`'s room", drawn when there were two `init`
    /// exports and the question was whether the second had quietly become a
    /// different level. There is one now, and the question it answers is the same
    /// one from the other side: `dungeon_scenario` is a *dresser*, not a
    /// generator, so the floor plan, the roster, the spawns and the sheets are
    /// `Scenario::dungeon`'s and only the kit and the model word are its own.
    #[test]
    fn inits_floor_is_the_generated_floor_with_everybody_equipped() {
        let plain = Scenario::dungeon(3, 0, starting_hero());
        // Byte-identical under the Legacy model, which is what makes the
        // sentence above checkable rather than merely plausible: the builder
        // adds nothing until it is asked for a model that needs it.
        let room = dungeon_scenario(3, 0, starting_hero());
        assert_eq!(room.dungeon, plain.dungeon, "the embodied floor is a different floor plan");
        assert_eq!(room.portal, plain.portal);
        assert_eq!(room.torches, plain.torches);
        assert_eq!(room.units.len(), plain.units.len());
        for (dressed, bare) in room.units.iter().zip(&plain.units) {
            assert_eq!(
                (dressed.kind, dressed.faction, dressed.spawn, dressed.stats),
                (bare.kind, bare.faction, bare.spawn, bare.stats),
                "a body moved, changed shape or changed sheet",
            );
            assert!(dressed.combat_spec.is_some(), "a dressed scenario carried a bare unit");
        }
        // The hero crosses untouched: a Fighter's sword and shield are rows 1
        // and 2 of the shipped table, so nothing about it had to be re-equipped.
        assert_eq!(room.units[0].loadout, plain.units[0].loadout);
        assert_eq!(
            room.units[0].combat_spec,
            Some(sim::UnitSpecV1 { anatomy: 1, equipment: [Some(1), Some(2)] }),
        );
        // And the whole thing builds, which is the claim `init` rests on.
        assert!(World::try_new(&room, 3).is_ok(), "the floor does not construct");
    }

    #[test]
    fn init_fails_closed_and_installs_nothing() {
        init(7);
        step(4);
        assert_ne!(state_hash(), 0, "the previous world was never installed");

        let mut broken =
            dungeon_scenario(7, 0, starting_hero());
        // A unit with no articulated row is the refusal `validate_construction`
        // owes. It has to be built by hand: everything the export itself can
        // build is valid by construction, and a fail-closed arm nothing can
        // reach is a fail-closed arm nobody has checked.
        broken.units[1].combat_spec = None;
        assert!(World::try_new(&broken, 7).is_err(), "the broken fixture stopped being broken");

        install_articulated(&broken, 7);
        assert_eq!(contact_high_water(), 0, "a refused construction reported a reservation");
        assert_eq!(pose_len(), 0);
        assert_eq!(poses_dropped(), 0);
        assert_eq!(combat_event_len(), 0);
        assert_eq!(combat_events_dropped(), 0);
        assert_eq!(region_len(), 0);
        assert_eq!(regions_dropped(), 0);
        assert_eq!(tick(), 0);
        assert_eq!(state_hash(), 0, "the previous world survived a call that said it started over");
        assert_eq!(frame_len(), HEADER_LEN as u32);
        FRAME.with(|frame| {
            assert!(
                frame.borrow()[..HEADER_LEN].iter().all(|&value| value == 0.0),
                "the header still reports the world that is not there",
            );
        });
        // And every export stays total across the refusal, which is the reason
        // it is a refusal and not a panic.
        step(4);
        assert_eq!(pose_len(), 0);
        assert_eq!(tick(), 0);

        // **The same refusal over a world that had published rows, and the four
        // buffers read rather than their four lengths.** The block above refuses
        // over whatever the previous test left installed, so on its own it can be
        // a claim about arrays that were already zero -- and the `fill(0)`s in
        // `publish`'s `None` arm are four lines no test could then tell had been
        // deleted. These rows are ground truth about an identity: a stale one is
        // the previous world's body, its capsules included, sitting in linear
        // memory behind a zero length.
        init(7);
        step(4);
        assert!(
            pose_len() > 0 && region_len() > 0,
            "the room published nothing for the refusal to wipe",
        );
        install_articulated(&broken, 7);
        assert_eq!(
            (pose_len(), region_len(), combat_event_len(), articulated_projectile_len()),
            (0, 0, 0, 0),
        );
        for (name, zeroed) in [
            ("pose", POSES.with(|rows| rows.borrow().iter().all(|&word| word == 0))),
            ("region", REGIONS.with(|rows| rows.borrow().iter().all(|&word| word == 0))),
            ("combat-event", COMBAT_EVENTS.with(|rows| rows.borrow().iter().all(|&word| word == 0))),
            ("projectile", ARTICULATED_PROJECTILES.with(
                |rows| rows.borrow().iter().all(|&word| word == 0))),
        ] {
            assert!(zeroed, "a refused install left the previous world's {name} rows in memory");
        }
    }

    #[test]
    fn an_embodied_run_can_descend_without_trapping() {
        // `Sim::descend` rebuilds the floor from `hero_spec`, and a dressed hero
        // carries a row that a bare `Scenario::dungeon` refuses -- by panicking,
        // one call inside a `pub extern "C"` export. This is that path.
        init(2);
        assert_eq!(contact_high_water(), MAX_UNITS as u32);
        let before = pose_len();
        assert!(before >= 2);
        descend();
        assert_eq!(depth(), 1);
        assert_eq!(
            contact_high_water(),
            MAX_UNITS as u32,
            "the new floor's contact vectors were left unreserved",
        );
        assert!(pose_len() >= 2, "the new floor published no articulated bodies");
        assert_eq!(combat_event_len(), 0, "last floor's contacts crossed the descent");
        assert_eq!(embodied_stance_len(), pose_len(), "the new floor arrived without legs");
        step(4);
        assert_eq!(tick(), 4);
    }

    /// What the reference's `abi-high-water` corpus accumulates in one
    /// `step(8)`, measured on 2026-08-10 and recorded rather than computed.
    ///
    /// **This is the number that rejected `MAX_COMBAT_EVENTS = 256`.** At 256
    /// the same run published the canonical 256 rows and counted 190 dropped,
    /// which was 446 produced and a stream cut in half on the one corpus the
    /// reference calls mandatory. The capacity moved to 1024 -- the next power
    /// of two at least twice 446 -- and the reference's byte budget moved with
    /// it.
    ///
    /// **Then it rejected 1024 as well**, and by the route the test below names
    /// as the other half of its job: the fight got busier. v2-17 checkpoint B
    /// stopped the contact projector re-deriving an unmoved hand through the
    /// joint's inexact inverse map, so the drift that had been inflating every
    /// trial's energy stopped holding the alpha search under the alpha the
    /// physics allows, and the same 64 bodies produced 556 rows in the same
    /// batch. **Not recovered rejections:** this corpus refuses no tick and
    /// refused none before, which the `#[ignore]`d printer now says out loud;
    /// the extra rows are contact that used to be discarded as an energy gain
    /// it never was. 556 doubles to 1,112, so the capacity is 2,048.
    ///
    /// **And then the same checkpoint moved it back down to 354**, which is the
    /// one direction nothing predicted. Sampling a held segment's velocity at
    /// the blade's centre of mass rather than in the hand raises the impulse a
    /// swing proposes, and a pair that is pushed apart harder stops re-resolving
    /// the same key tick after tick: 64 bodies in a permanent clinch publish
    /// *fewer* rows, not more. The capacity is left at 2,048 -- 556 is still the
    /// busiest this corpus has ever been measured, and sizing to the newest
    /// number rather than the largest one is how a capacity gets re-rejected by
    /// the next change.
    ///
    /// **v2-20 moved it down, 354 to 346, then Smart51 moved it to 301.** The
    /// latter's reflection-safe hand and sweep geometry reach this same corpus:
    /// now 36% of the face area it was, and a plate that catches fewer swings
    /// publishes fewer `WeaponShield` rows without handing all of them back as
    /// `WeaponBody` -- a blade that misses a smaller shield can also miss the
    /// body behind it. Eight rows in 354 is 2.3%, which is the right order for
    /// a geometry change that leaves 64 bodies in exactly the same places. The
    /// capacity stays 2,048 for the reason above: 556 is still the busiest this
    /// corpus has been.
    ///
    /// **Smart134 moved it down again, 301 to 249, doubling the arm bearing
    /// rates.** Down is the direction the 354 move already explained and for the
    /// same mechanism: a faster arm proposes a larger impulse, pairs that are
    /// pushed apart harder stop re-resolving the same key on consecutive ticks,
    /// and 64 bodies in a permanent clinch publish fewer rows rather than more.
    /// Worth stating because the intuition runs the other way -- "faster arms,
    /// busier fight, more rows" is what a reader predicts here, and this corpus
    /// has now contradicted it twice. The capacity is still 2,048 against 556.
    /// **And the port off the articulated model moved it back up, 249 to 344.**
    /// Up is the direction the two moves above make a reader expect to be wrong,
    /// so it is worth saying what is different: this is not the same fight
    /// measured again, it is the same *arrangement* fought under the surviving
    /// grammar. Three things reach it. The bodies have jointed arms, so there
    /// are seven swept volumes a side rather than five and two more of them can
    /// meet. An arm bearing is torso-relative, so the westward half of each pair
    /// now asks for `Angle::ZERO` -- along its own torso -- where it used to ask
    /// for `Angle::HALF` in world space, and both halves reach across the gap
    /// instead of one of them reaching away. And [`Sim::advance`] answers each
    /// body's tick-zero decision with its policy command before the step, which
    /// on the articulated fixture was refused and discarded and here is not, so
    /// the corpus is one tick of neutral and then the commanded pose.
    ///
    /// **The stance-authority correction moved it again, 344 to 371.** The row
    /// grammar, capacity and fixture are unchanged. Translating bodies used to
    /// chase movement direction with their hips; they now chase achieved torso
    /// yaw, so the same stored commands produce different stance and collider
    /// trajectories after the policy-owned first tick. This is a values move in
    /// the contact stream, not an ABI move. Re-measured beside it: the default
    /// boundary clinch still exhausts the ordinal on tick 109, and the exact
    /// high-water arm still first publishes on tick 113 with two rows and no
    /// refusal. 371 doubles to 742, still comfortably inside the 2,048 the
    /// capacity was sized to against the all-time busiest 556.
    ///
    /// Provenance is the whole of its meaning: **this fixture, this seed, this
    /// batch.** Seed `0x4152504741424931`, an open 24x16 room, 64 bodies as 32
    /// Fighter/Brute pairs, one command each at tick zero and none after, one
    /// `step(8)`. A second seed is a different fixture and not a second sample,
    /// and eight `step(1)`s measure the busiest tick rather than what one host
    /// call accumulates -- which is the thing being sized, because the feed is
    /// cleared per call.
    const HIGH_WATER_EVENT_ROWS: u32 = 371;

    /// And the pose half, which sits exactly on its capacity by construction:
    /// 64 bodies is `MAX_ENTITIES` and `MAX_POSES` is the same
    /// number, so a drop here would mean the cap or the identity ordering is
    /// wrong rather than that the corpus is busy.
    const HIGH_WATER_POSE_ROWS: u32 = 64;

    #[test]
    fn the_high_water_corpus_fills_at_most_half_the_event_buffer() {
        // Written out rather than shared with the printer above, on the
        // argument `print_the_golden_hashes` makes: a gate whose fixture is
        // built by the thing that prints its number can be re-pinned to its own
        // drift. Both copies are `docs/reference/articulated-abi.md`,
        // "Combat-event rows", read literally.
        let mut scenario = Scenario::embodied_duel();
        scenario.name = "abi-high-water".to_string();
        let (fighter, brute) = (scenario.units[0], scenario.units[1]);
        scenario.units.clear();
        #[cfg(not(feature = "cartesian-recoil"))]
        for i in 0..32 {
            let at = Vec2::from_ints(4 + i / 4, 2 + (i % 4) * 3);
            scenario.units.push(UnitSpec { spawn: at, ..fighter });
            scenario.units.push(UnitSpec {
                spawn: Vec2::new(at.x + Fx::ONE + Fx::HALF, at.y),
                ..brute
            });
        }
        // The compatibility high-water drive intentionally begins with 32
        // simultaneous close pairs. Bounded lifted resolution refuses that
        // coupled set by name, so it cannot measure the exact publication
        // buffer. Keep the same 64-body reservation surface, but give its exact
        // row producer the already-predeclared ordinary attack used by the
        // feature event tests: one shipped duel and 62 same-faction spectators
        // parked outside its lane. Same-faction equipment is not a contact pair;
        // this makes any published event belong to the declared duel rather than
        // to a search through spectator placements.
        #[cfg(feature = "cartesian-recoil")]
        {
            scenario.units.push(fighter);
            scenario.units.push(brute);
            for i in 0..62 {
                scenario.units.push(UnitSpec {
                    spawn: Vec2::from_ints(1 + i % 5, 1 + i / 5),
                    ..fighter
                });
            }
        }
        // 64 is `MAX_ENTITIES` exactly. The corpus sits on the cap
        // deliberately, so a construction refused here is a finding about the
        // cap and not a reason to measure 62 bodies instead.
        assert_eq!(scenario.units.len(), sim::MAX_ENTITIES);
        install_articulated(&scenario, 0x4152_5047_4142_4931);
        assert_eq!(
            contact_high_water(),
            MAX_UNITS as u32,
            "the corpus did not install, so nothing below measures it",
        );

        #[cfg(not(feature = "cartesian-recoil"))]
        for i in 0..32u32 {
            let height = [
                sim::CombatHeight::LOW,
                sim::CombatHeight::MID,
                sim::CombatHeight::HIGH,
            ][(i % 3) as usize];
            for (subject, yaw, target) in
                [(2 * i, Angle::ZERO, 2 * i + 1), (2 * i + 1, Angle::HALF, 2 * i)]
            {
                write_embodied(write_high_water_command(
                    yaw,
                    height,
                    EntityId::new(target, 0),
                ));
                // Through the 61-byte scratch and the export, not through
                // `World::submit`: a measurement that skipped the
                // boundary would not be measuring what the page produces.
                assert_eq!(
                    submit_embodied(subject, 0),
                    1,
                    "the boundary refused body {subject}'s tick-zero command",
                );
            }
        }
        #[cfg(feature = "cartesian-recoil")]
        for row in 0..2 {
            EMBODIED_COMMAND.with(|buffer| *buffer.borrow_mut() = clinch_payload(row, 0));
            assert_eq!(submit_embodied(row as u32, 0), 1,
                "the boundary refused exact body {row}'s tick-zero command");
        }
        // One call. Eight publications would clear the feed seven times and
        // measure the busiest tick instead of the batch.
        #[cfg(not(feature = "cartesian-recoil"))]
        step(8);
        #[cfg(feature = "cartesian-recoil")]
        step(128);

        #[cfg(not(feature = "cartesian-recoil"))]
        assert_eq!(combat_event_len(), HIGH_WATER_EVENT_ROWS, "the corpus's event high water moved");
        #[cfg(feature = "cartesian-recoil")]
        {
            let (refused, rejection, exact) = SIM.with(|sim| {
                let borrow = sim.borrow();
                let world = &borrow.as_ref().unwrap().world;
                (world.contact_solver_rejections(),
                 world.first_contact_rejection(), world.first_exact_contact_rejection())
            });
            // Event ticks are the zero-based solving tick, so this is the
            // first of the rows the world's 128 steps left in one feed.
            //
            // **Re-measured `(85, 1)` -> `(113, 2)` by the port off the deleted
            // articulated model**, and by the same three routes the default
            // arm's `HIGH_WATER_EVENT_ROWS` moved along: jointed arms give each
            // body seven swept volumes rather than five, an arm bearing is
            // torso-relative so both halves of each pair reach across the gap
            // instead of one of them reaching away, and `Sim::advance` answers
            // the tick-zero decision with a policy command that this grammar
            // stores where the other refused it. Bounded lifted resolution still
            // refuses nothing here, which is the assertion below and the reason
            // this arm exists at all.
            assert_eq!((published_events()[0][COMBAT_EVENT_TICK] + 1, combat_event_len()), (113, 2),
                "the exact corpus's resolved publications moved");
            assert_eq!((refused, rejection, exact), (0, None, None),
                "the exact high-water corpus refused a contact");
            assert_eq!(contact_high_water(), sim::MAX_ENTITIES as u32);
        }
        assert_eq!(combat_events_dropped(), 0, "the corpus is truncating again");
        // The acceptance rule itself, as a relationship rather than as two
        // literals: a capacity that stopped being at least twice the measured
        // maximum is the failure this whole fixture exists to catch, whether it
        // was the capacity that shrank or the fight that got busier.
        assert!(
            HIGH_WATER_EVENT_ROWS as usize * 2 <= MAX_COMBAT_EVENTS,
            "{HIGH_WATER_EVENT_ROWS} rows is past half of {MAX_COMBAT_EVENTS}",
        );

        // And the pose half, which has no headroom by design and must therefore
        // land exactly on the cap with nothing lost.
        assert_eq!(pose_len(), HIGH_WATER_POSE_ROWS);
        assert_eq!(pose_len(), pose_capacity(), "the corpus stopped sitting on the pose cap");
        assert_eq!(poses_dropped(), 0, "a pose row was dropped at exactly the pose capacity");

        // The region half sits on its cap for the same reason and by the same
        // construction -- `MAX_REGIONS` is `MAX_POSES` times the sim's own
        // region count -- which makes 64 bodies **the only fixture in the
        // repository that reaches the region buffer's last row.** A drop here
        // would mean the two capacities had stopped being one capacity, which
        // is the arithmetic the whole no-identity section rests on: five rows a
        // body, in pose order, or a reader cannot tell whose arm it is holding.
        assert_eq!(region_len(), HIGH_WATER_POSE_ROWS * REGIONS_PER_BODY as u32);
        assert_eq!(region_len(), region_capacity(), "the corpus stopped sitting on the region cap");
        assert_eq!(regions_dropped(), 0, "a region row was dropped at exactly the region capacity");
    }

    /// Prints what the reference's `abi-high-water` corpus fills the three
    /// articulated buffers with, for accepting or rejecting a capacity.
    ///
    /// `#[ignore]` because it asserts nothing, exactly as
    /// [`print_the_golden_hashes`] does and for the same reason -- and, as
    /// there, the script is **written out again** rather than shared with
    /// `the_high_water_corpus_fills_at_most_half_the_event_buffer` below. That is
    /// the point: a printer that called into the asserting test's fixture would
    /// print whatever that fixture ran, so a fixture that had quietly drifted
    /// from the reference would be re-pinned to its drift. Two copies of one
    /// literal specification is the cost of the number below not being able to
    /// justify itself.
    ///
    ///     cargo test -p web -- --ignored --nocapture print_articulated_buffer_high_water_marks
    ///
    /// The fixture is `docs/reference/articulated-abi.md`, "Combat-event rows",
    /// verbatim: seed `0x4152504741424931`, an open 24x16 room, 64 bodies -- 32
    /// Fighter/Brute pairs three halves of a unit apart -- one command each at
    /// tick zero and none after, and exactly one `step(8)`. The batch is the
    /// measurement: the feed is cleared per host *call*, so eight `step(1)`s
    /// would measure the busiest tick rather than what one animation frame of
    /// catch-up accumulates.
    #[test]
    #[ignore]
    fn print_articulated_buffer_high_water_marks() {
        let mut scenario = Scenario::embodied_duel();
        scenario.name = "abi-high-water".to_string();
        // The v2-12 fixture rows, taken off the shipped duel rather than
        // respelled: stats, loadout and the anatomy/equipment references are
        // what "the v2-12 fixtures" names, and a second spelling of them here
        // would be a second thing to keep in step with that table.
        let (fighter, brute) = (scenario.units[0], scenario.units[1]);
        scenario.units.clear();
        for i in 0..32 {
            let at = Vec2::from_ints(4 + i / 4, 2 + (i % 4) * 3);
            scenario.units.push(UnitSpec { spawn: at, ..fighter });
            scenario.units.push(UnitSpec {
                spawn: Vec2::new(at.x + Fx::ONE + Fx::HALF, at.y),
                ..brute
            });
        }
        install_articulated(&scenario, 0x4152_5047_4142_4931);

        let mut refused = 0;
        for i in 0..32u32 {
            let height = [
                sim::CombatHeight::LOW,
                sim::CombatHeight::MID,
                sim::CombatHeight::HIGH,
            ][(i % 3) as usize];
            for (subject, yaw, target) in
                [(2 * i, Angle::ZERO, 2 * i + 1), (2 * i + 1, Angle::HALF, 2 * i)]
            {
                write_embodied(write_high_water_command(
                    yaw,
                    height,
                    EntityId::new(target, 0),
                ));
                if submit_embodied(subject, 0) != 1 {
                    refused += 1;
                }
            }
        }
        step(8);

        println!("bodies:               {}", scenario.units.len());
        println!("commands refused:     {refused}");
        println!("ticks refused:        {}", SIM.with(|sim|
            sim.borrow().as_ref().map_or(0, |sim| sim.world.contact_solver_rejections())));
        println!("first refusal:        {:?}", SIM.with(|sim|
            sim.borrow().as_ref().and_then(|sim| sim.world.first_contact_rejection())));
        println!("combat_event_len:     {}", combat_event_len());
        println!("combat_events_dropped:{}", combat_events_dropped());
        println!("combat_event_capacity:{}", combat_event_capacity());
        println!("pose_len:             {}", pose_len());
        println!("poses_dropped:        {}", poses_dropped());
        println!("pose_capacity:        {}", pose_capacity());
        println!("region_len:           {}", region_len());
        println!("regions_dropped:      {}", regions_dropped());
        println!("region_capacity:      {}", region_capacity());
    }

    /// The scripted pose, region, projectile and combat-event stream, as one number.
    ///
    /// The script: [`Scenario::embodied_duel`] at seed 1 with the fighter
    /// moved to `(9,6)` and the brute to `(7,6)`, one attack command each on
    /// tick zero and none after -- the fighter walking due west at full
    /// magnitude, the brute standing still, both asking for the bearing they
    /// already have. Twenty ticks, one publication per tick, digested through
    /// [`write_pose_buffer`], [`write_combat_event_buffer`],
    /// [`write_region_buffer`], [`write_articulated_projectile_buffer`] and
    /// [`write_embodied_stance_buffer`]. Measured shape, read off
    /// `print_the_articulated_stream_digest` rather than inferred: every tick
    /// carries two pose rows, fourteen region rows, two stance rows and no
    /// projectile rows, and still digests the projectile length and drop words;
    /// the default build resolves one contact row on ticks 0, 3, 4, 5 and 6 and
    /// none on the other fifteen, and the `cartesian-recoil` build carries one
    /// more, on tick 7.
    ///
    /// Not a fight golden. It pins the *bytes the page reads*, which is a
    /// different property from a run hash's and one a hand-rolled ABI can get
    /// wrong on its own -- a moved word offset, a sign extension, a narrowed
    /// `u64`. Any change to the row layouts moves it and is expected to; a
    /// change to the simulation moves it *and* a fight golden, which is the pair
    /// worth reading together. **There is no fight golden on this side any
    /// more** -- the four browser run hashes went with the legacy fixtures that
    /// produced them -- so the other half of that pair is `lab`'s
    /// `EMBODIED_CORPUS_DIGEST`.
    ///
    /// Moved twice, both times by v2-17 checkpoint B and both times with no
    /// layout change: the simulation did. First from `0x4372a94d89fc9155`, when
    /// `ContactProjector` stopped re-deriving an unmoved hand through the
    /// joint's inexact inverse map -- the drift that was inflating every trial's
    /// energy, and with it holding the alpha search below the alpha the physics
    /// allows -- which showed up as tick 5 resolving two rows where it used to
    /// resolve one.
    ///
    /// Then from `0x27b2aa50bb4e7a67`, when a held segment's one point velocity
    /// moved from the hand to the blade's centre of mass. **The row shape is
    /// identical across this second move** -- the same ticks carry the same
    /// counts, 3 and 5 with two rows and the rest with one -- so every byte that
    /// changed is a value rather than a row, which is exactly the signature a
    /// simulation move with no layout change should leave.
    ///
    /// Moved a third time by v2-20, from `0x6f879c13430adfc1`, and this one is
    /// two things at once rather than the usual one. The plate's
    /// `half_width` and `half_height` are published *directly* in the pose row
    /// -- `POSE_SHIELD_HALF_WIDTH` and `POSE_SHIELD_HALF_HEIGHT` are copied off
    /// `spec::shield()` through `derive_shield_pose` -- so tick zero's bytes
    /// move before anything has happened; and the same smaller plate then
    /// changes what the twenty-tick clinch resolves, so the event half moves
    /// too. **Still not a layout change**: the stride, the word offsets and the
    /// row counts per tick are all where they were, which
    /// `the_pose_row_is_the_documented_layout_word_for_word` and the shape
    /// printer beside this constant are what say so.
    ///
    /// **Moved a fourth time by v2-ui-06, from `0x54c0762b3dfb7a05`, and this
    /// one is the layout change the three above were not.** A third section
    /// went on the wire -- the five swept region capsules per body -- and the
    /// digest's rule is every published word of every publication, so it moved
    /// by construction and was predicted in writing before the run. The move is
    /// an *extension* and can be read as one: the region length, drop count and
    /// words are appended after the event words, so the pose-and-event prefix of
    /// every one of the twenty ticks is byte-identical to what v2-16 pinned, and
    /// the shape printer reports the same counts it always did -- ticks 0, 1, 2
    /// and 4 with no contact, 3 and 5 with two rows, the rest with one, and now
    /// ten region rows on every tick. Nothing in `crates/sim` changed and no
    /// fight golden moved with it, which is the signature of a layout move and
    /// the opposite of the three before it.
    ///
    /// **Moved again by the articulated-arrow session, from
    /// `0x2fac296932b97439` to `0x3b0d5c93d5560dd9`.** The fourth
    /// publication appends projectile length, drop count and live row words
    /// after the region section. This fixture carries no Bow, so those are two
    /// zero words per tick and the move still proves their presence. The
    /// mechanics landed beside the publication also changed the event prefix:
    /// ticks 3 and 5 now carry one row each rather than two. The move is
    /// therefore both append-only publication and reached simulation values,
    /// not a claim that the old pose/event/region prefix stayed byte-identical.
    ///
    /// **Moved again by `EMBODIED_STANCE_V1`, from `0x3b0d5c93d5560dd9`, and
    /// this one is an extension and nothing else.** A fifth section went on the
    /// wire and the digest's rule is every published word of every publication,
    /// so a section reaches it whether or not the fixture has a row for it. This
    /// fixture had none at the time -- it was `Scenario::articulated_duel` and
    /// only the embodied model had legs -- so the new tail was a zero length
    /// and a zero drop count on each of the twenty ticks, and **their presence
    /// was the change**. The shape printer below reports the same counts it did
    /// before: two poses and ten regions every tick, one event row on ticks 3
    /// and 5, none on 0, 1, 2 and 4, and now zero stances throughout.
    ///
    /// The prefix claim for that move was measured by
    /// `the_stance_section_extends_the_digest_without_disturbing_its_prefix`,
    /// which the forearm collider superseded, and its successor
    /// `the_region_section_is_the_whole_of_the_forearm_digest_move` died the same
    /// way in turn; see
    /// [`the_region_and_stance_sections_both_reach_the_stream_digest`], which is
    /// what both became, for why neither equality can be computed any more.
    /// Nothing in `crates/sim`
    /// changed for the stance move and no other pin moved -- `selftest_hash`,
    /// `ROOM_HASH`, `BATTLE_HASH`, `BOW_HASH`, `SWAP_HASH`,
    /// `ARTICULATED_COMMAND_HASH`, `CONTACT_BEHAVIOR_DIGEST`,
    /// `COMBAT_GEOMETRY_HASH` and `LEARNED_INFERENCE_DIGEST` all answer what
    /// they answered -- which is the signature of a layout move and the same
    /// shape v2-ui-06's was. Native MSVC measured `0x686ecf8a2f5dd479` and the
    /// exact build's `0xde453a669e770512` before either wasm owner was edited,
    /// and a fresh wasm artifact then answered both.
    ///
    /// **Moved again by the forearm collider, from `0x686ecf8a2f5dd479`, and
    /// this one is a *layout* move rather than an extension or a values move.**
    /// A body presents seven swept volumes instead of five, so
    /// [`REGIONS_PER_BODY`] is 7, the region section of every tick is fourteen
    /// rows instead of ten, and everything after it in that tick's stream moves
    /// with it. [`REGION_LAYOUT_VERSION`] moves 1 -> 2 alongside, which is what
    /// distinguishes this from the two values-only moves in this pin's registry
    /// row: a reader holding version 1 would index row `n * 5`.
    ///
    /// **The fixture's fight did not change**, which is the claim that has to be
    /// earned rather than asserted, and
    /// `the_region_section_is_the_whole_of_the_forearm_digest_move` earned it:
    /// suppress the region section and the number was `0xc6482a30f399d2cb`, the
    /// same suppression measured on `b453ca1`, so every pose, event, projectile
    /// and stance word of all twenty ticks was byte-identical. The shape printer
    /// reported the same counts with a wider region section: two poses every
    /// tick, one event row on ticks 3 and 5, none on 0, 1, 2 and 4, and fourteen
    /// regions instead of ten. That fixture was `Scenario::articulated_duel`, so
    /// its arms were one link and its two appended volumes were absent on every
    /// row -- their *presence in the stream* was the move, exactly as the stance
    /// section's zero-length tail had been.
    /// Native MSVC measured `0x2a34c9104bdf18b9` and the exact build's
    /// `0x9e9442671b790fb2` before either wasm owner was edited, and a fresh
    /// wasm artifact then answered both.
    ///
    /// **Moved a ninth time when the script was reseated onto
    /// `Scenario::embodied_duel`, and it is a *values* move -- the fifth of that
    /// kind, against three layout moves and two extensions.** No stride, word
    /// offset, section order, count grammar or ABI version changed, and none may:
    /// [`REGIONS_PER_BODY`] is 7 and [`REGION_LAYOUT_VERSION`] is 2 on both sides
    /// of the move, because an earlier forearm-collider session did that. What
    /// changed is what the fixture *computes*, by four routes predicted from the
    /// fixture before the run:
    ///
    /// 1. The stance section goes from a zero length on every tick to two real
    ///    rows -- the pin's first move where that section carries a value rather
    ///    than announcing its presence.
    /// 2. Both forearm rows go from absent to present. `World::arm_elbows`
    ///    early-returns `[None; 2]` without jointed arms, so the two volumes the
    ///    forearm collider added were published empty on every row of every tick
    ///    of the old script.
    /// 3. `ground_z` and the elbow planes reach the pose words.
    /// 4. **The fight itself is different**, because `Angle::ZERO` was world
    ///    east under the articulated frame and is straight ahead in this one. The
    ///    default build's contact ticks go from 3 and 5 to 0, 3, 4, 5 and 6.
    ///
    /// Nothing in `crates/policy` can reach this pin -- `stream_digest_command`
    /// is one hand-written command per body,
    /// submitted once on tick zero, and it never calls a script. `ARTICULATED_COMMAND_HASH`
    /// moved beside it, for its own fixture's own reseat rather than for this
    /// one; `CONTACT_BEHAVIOR_DIGEST`, `COMBAT_GEOMETRY_HASH`,
    /// `LEARNED_INFERENCE_DIGEST` and both exact-law digests answer what they
    /// answered. **The stance-authority correction moved it again, values only,
    /// from `0x96e4e51de0c00d62` default and `0x4bf34984d56d2795`
    /// exact.** Body-relative movement no longer becomes a second hip-yaw
    /// request through a lossy fixed-point angle round trip. Native MSVC
    /// measured the value below and exact `0x8c8a5e4350230df6`; fresh wasm
    /// artifacts then answered the same pair. No layout or ABI version moved.
    const ARTICULATED_STREAM_DIGEST: u64 = 0x63bf_8b26_809d_43c4;

    /// The north-wall stored-command lifecycle, paired with the feature-only
    /// wasm exports and registered in `docs/reference/hashes.md`.
    ///
    /// **Moved 2026-08-16 by the release verb, from `0x83051e8c6b4ef20f`.** Both
    /// exact digests are *stored-command* fixtures: `exact_diagnostics.rs`
    /// writes `ARTICULATED_PAYLOAD_BYTES` as a `u16` into the stream and then
    /// the payload bytes themselves, and it folds in `state_digest()` values
    /// that moved for the same reason. Three routes, one cause. Predicted in
    /// writing before the gate; the plan that owned the session predicted only
    /// `ARTICULATED_COMMAND_HASH` and was wrong about these two. **Moved again
    /// by the authoritative articulated-projectile store**, which appends an
    /// allocated-slot count and every retained slot's lifecycle and physical
    /// fields to each folded `state_digest()`. Previously
    /// `0x88e6ea929b8d4305`.
    ///
    /// **Moved again by the deletion of the legacy columns**, and through the
    /// same route as the sentence above: `exact_diagnostics.rs` folds
    /// `state_digest()` values into this stream, `state_digest_value`
    /// folds `legacy_core_hash` into each of those, and that function lost
    /// `hp`, `max_hp`, the submitted `command` word and the nine-column
    /// projectile block. The two sessions before this one each found out the
    /// hard way that a plan naming only `ARTICULATED_COMMAND_HASH` is naming a
    /// third of the affected set; the durable statement is that **every pin
    /// taken over `World::state_digest` folds `legacy_core_hash`**, and this is
    /// one of the five. Native measured first, both wasm artifacts agreed after.
    /// Previously `0x4b07e93ccdc137ea`.
    ///
    /// **Moved again when the fixture was ported off the deleted articulated
    /// model, and this is the one move here that is not a bug.** The exact laws
    /// live in the contact solver, which the embodied body uses unchanged, so
    /// the property this pin protects outlived the model that happened to
    /// exercise it: the digest grammar, the solver bounds and every named class
    /// are the same words in the same order. Four independent routes reach the
    /// number -- the prefix's model byte and payload tag both go `1 -> 2`, the
    /// state stream gains its `ground_z`, stance and elbow-plane tail, every arm
    /// bearing is now torso-relative, and the arm the fixture drives is clamped
    /// by `reachable_extent` where the articulated one was not. Previously
    /// `0x13fa3ac347aeab12`. Native MSVC measured first; the exact wasm artifact
    /// agreed.
    #[cfg(feature = "cartesian-recoil")]
    const EXACT_TRAJECTORY_STATE_DIGEST: u64 = 0x5add_1f2c_a295_e79b;

    /// The terminal source-41 lifted Coulomb solver corpus, paired with the
    /// feature-only wasm exports and registered in `docs/reference/hashes.md`.
    ///
    /// Moved 2026-08-16 with its sibling above and for the same reason, from
    /// `0x83cd7bb2b73aeb9e`; its `command_receipt` writes the same width word
    /// and the same payload. **Moved again by the appended authoritative
    /// articulated-projectile store** in every folded state digest, from
    /// `0x8dc443385973a5c8`. **Moved again with its sibling above** when the
    /// legacy columns left `legacy_core_hash`, which every folded
    /// `state_digest()` carries; from `0x4cbafe3e0f71e14f`, native measured
    /// first and both wasm artifacts agreeing after.
    ///
    /// **Moved again with its sibling above by the port off the deleted
    /// articulated model**, through the same four routes, and with one more of
    /// its own: an embodied arm cannot hold the pose the source-41 schedule
    /// commands, so the corpus closed its range to exactly three quarters along
    /// the same bearing and its blow lands on the torso rather than the leg the
    /// defender's new forearm now shields. The eighteen cases, their order, the
    /// bounds `16/42/8/96` and the ordinal are unchanged. Previously
    /// `0x30e1b4031f01ecc8`.
    #[cfg(feature = "cartesian-recoil")]
    const LIFTED_COULOMB_SOLVER_DIGEST: u64 = 0x1f9a_fcf8_1ba7_4700;

    /// FNV-1a-64 over the logits `checkpoints/v2-probe.ckpt` produces on
    /// `learn_core`'s fixed observation corpus, prefix `ARPG-LEARNED-V1`.
    ///
    /// **Created by v2-ui-08, and it is what that session was for.**
    /// `Model::forward` chose a rectified linear over `tanh` on portability
    /// grounds -- no libm call in the forward pass, IEEE-754 `f32` multiply and
    /// add which every target mandates, a summation order fixed by the loop, no
    /// FMA contraction in the profile, ties to the lowest index -- and then
    /// recorded that it was "only a *claim* about hosts other than this one,
    /// because this repository has no second host to check it on". wasm32 is the
    /// second host. This number holds the two to the same **logits** rather than
    /// to the same five argmaxes, because five bytes would agree right up to the
    /// moment a divergence crossed a decision boundary, and that is the moment
    /// it stops being catchable early.
    ///
    /// **Owned by whoever changes `ModelShape`, the feature layout, the action
    /// layout or the forward pass**, and by nobody else. A move without one of
    /// those four is not a re-record: it is a portability failure, and the
    /// fallback v2-ui-08 named in advance is to quantise inference to `Fx` --
    /// which changes behaviour and would have to be re-scored against a held-out
    /// mean of **88.922** before the quantised model could be called the same
    /// fighter. The number is written out rather than cited, because
    /// `checkpoints/*.log` is in `.gitignore`: a clean clone has the `.ckpt` and
    /// no table, and `cargo run --release -p lab -- learn-probe evaluate` is how
    /// to see one again. The corpus cannot move underneath it:
    /// it is synthetic, drawn from `fx::Rng`, and no simulation output reaches
    /// it.
    ///
    /// **Taken over the network `load_checkpoint` installed, not over an
    /// `include_bytes!` one**, which is deliberate and widens the list above by
    /// one: the pin exercises the staging buffer and the decoder as well as the
    /// forward pass, so an edit to `Checkpoint::from_bytes` that changed a
    /// weight by a bit would move this number without touching any of the four.
    /// That is the correct behaviour and it is not in the four-owner sentence,
    /// so predict it.
    ///
    /// **The caveat is part of the pin.** This holds for the repository's
    /// baseline targets -- MSVC x86-64 with no `target-cpu`, `target-feature` or
    /// fast-math anywhere in the profile, and the wasm MVP -- because neither
    /// has an FMA instruction, which is what closes contraction. Building native
    /// with `-C target-cpu=native` on a host that has FMA re-opens it: a fused
    /// multiply-add rounds once where `Model::forward`'s loop rounds twice.
    /// **That build is outside the guarantee**, and it is a real hole rather
    /// than a footnote -- nothing in the repository would notice until this
    /// number failed.
    const LEARNED_INFERENCE_DIGEST: u64 = 0xbdba_8d64_d340_ce32;

    #[test]
    #[ignore]
    fn print_the_articulated_stream_digest() {
        println!("ARTICULATED_STREAM_DIGEST: {:#018x}", articulated_stream_digest());
        let mut shape = Vec::new();
        drive_stream_digest_script(|published| {
            shape.push((
                published.tick,
                published.poses.len() / POSE_STRIDE,
                published.poses_dropped,
                published.events.len() / COMBAT_EVENT_STRIDE,
                published.events_dropped,
                published.regions.len() / REGION_STRIDE,
                published.regions_dropped,
                published.projectiles.len() / ARTICULATED_PROJECTILE_STRIDE,
                published.projectiles_dropped,
                published.stances.len() / EMBODIED_STANCE_STRIDE,
                published.stances_dropped,
            ));
        });
        for row in shape {
            println!(
                "tick {} poses {} dropped {} events {} dropped {} regions {} dropped {} projectiles {} dropped {} stances {} dropped {}",
                row.0, row.1, row.2, row.3, row.4, row.5, row.6, row.7, row.8, row.9, row.10,
            );
        }
    }

    // **The five browser goldens and the scripts behind them are gone with the
    // model they measured.** `LAB_HASH` was `lab hash`'s own legacy skirmish;
    // `ROOM_HASH`, `BATTLE_HASH`, `SWAP_HASH` and `BOW_HASH` each drove `init`
    // under Legacy, and three of the four through a channel -- the standing
    // order, the legacy loadout setter -- that no longer exists. Their values
    // and the reasons each one moved are recorded in
    // `docs/reference/hashes.md`, which is where a reader looking for what a
    // browser golden was should go; re-pinning them against the embodied floor
    // is a *new* measurement and belongs to a session that can say what it is
    // for, not to the session that deleted their fixtures.
    //
    // What survives on this side is `ARTICULATED_STREAM_DIGEST` -- the bytes
    // that cross the wall -- and `EMBODIED_CORPUS_DIGEST` in `lab`, which is
    // the fight half of the same pair. See `articulated_stream_digest`.
    fn hash() -> u64 {
        (u64::from(state_hash_hi()) << 32) | u64::from(state_hash_lo())
    }

    /// The live frame, read the way the client reads it minus the pointer --
    /// natively a `usize` is 64 bits, so `frame_ptr` is only meaningful in wasm.
    fn frame() -> Vec<f32> {
        let len = frame_len() as usize;
        FRAME.with(|frame| frame.borrow()[..len].to_vec())
    }

    /// The live frame split into unit rows.
    fn rows() -> Vec<Vec<f32>> {
        let frame = frame();
        let count = frame[6] as usize;
        (0..count)
            .map(|i| frame[HEADER_LEN + i * UNIT_STRIDE..][..UNIT_STRIDE].to_vec())
            .collect()
    }

    /// The live frame's third section, split into event rows. Read from the
    /// base the two counts before it put it at, exactly as the page reads it.
    fn events() -> Vec<Vec<f32>> {
        let frame = frame();
        let base = HEADER_LEN + frame[6] as usize * UNIT_STRIDE + frame[7] as usize * SHOT_STRIDE;
        (0..frame[8] as usize)
            .map(|i| frame[base + i * EVENT_STRIDE..][..EVENT_STRIDE].to_vec())
            .collect()
    }

    /// How long the frame says it is, computed from its own three counts. The
    /// number `frame_len()` has to agree with.
    fn frame_span() -> usize {
        let frame = frame();
        HEADER_LEN
            + frame[6] as usize * UNIT_STRIDE
            + frame[7] as usize * SHOT_STRIDE
            + frame[8] as usize * EVENT_STRIDE
    }

    /// Searched for by faction rather than taken from row zero. Once the hero
    /// can die and the rows above a corpse can shift up, "row 0 is the hero" is
    /// an assumption a test has no business making.
    fn hero_row() -> Option<Vec<f32>> {
        rows().into_iter().find(|row| row[6] == 0.0)
    }

    fn monsters() -> Vec<Vec<f32>> {
        rows().into_iter().filter(|row| row[6] == 1.0).collect()
    }

    fn hero() -> (f32, f32) {
        let row = hero_row().expect("the hero is gone");
        (row[0], row[1])
    }

    fn distance(a: &[f32], b: &[f32]) -> f32 {
        ((a[0] - b[0]).powi(2) + (a[1] - b[1]).powi(2)).sqrt()
    }

    /// How many handles the roster is holding, live or not. Reaching into the
    /// private field is the only way to see the prune working: a stale handle is
    /// invisible from the frame precisely because `write_frame` skips it.
    fn roster_len() -> usize {
        SIM.with(|sim| sim.borrow().as_ref().map_or(0, |sim| sim.units.len()))
    }

    fn distance_from_hero(x: f32, y: f32) -> f32 {
        let (hx, hy) = hero();
        ((hx - x).powi(2) + (hy - y).powi(2)).sqrt()
    }

    /// The live part of the tile buffer, copied out the way the page reads it.
    fn map_bytes() -> Vec<u8> {
        let len = map_len() as usize;
        MAP.with(|map| map.borrow()[..len].to_vec())
    }

    /// The live part of the visibility buffer, read through [`vis_len`] rather
    /// than through [`map_len`] -- which are the same number, and asserting that
    /// is one of the things the fog tests are for.
    fn vis_bytes() -> Vec<u8> {
        let len = vis_len() as usize;
        VIS.with(|vis| vis.borrow()[..len].to_vec())
    }

    /// The live part of the furniture buffer, split into records the way the
    /// page reads it: `furniture_len()` rows of `furniture_stride()` bytes.
    fn furniture() -> Vec<Vec<u8>> {
        let stride = furniture_stride() as usize;
        let count = furniture_len() as usize;
        FURNITURE.with(|f| {
            let f = f.borrow();
            (0..count).map(|i| f[i * stride..][..stride].to_vec()).collect()
        })
    }

    /// The furniture records of one kind. The page's own first move on this
    /// buffer -- `readFurniture` splits it by kind byte -- so the tests below
    /// ask the same question the client does.
    fn furniture_of(kind: u8) -> Vec<Vec<u8>> {
        furniture().into_iter().filter(|r| r[0] == kind).collect()
    }

    fn dungeon_objects() -> Vec<[u32; DUNGEON_OBJECT_STRIDE]> {
        let count = dungeon_object_len() as usize;
        DUNGEON_OBJECTS.with(|objects| {
            let objects = objects.borrow();
            (0..count).map(|row| {
                let at = row * DUNGEON_OBJECT_STRIDE;
                objects[at..at + DUNGEON_OBJECT_STRIDE].try_into().unwrap()
            }).collect()
        })
    }

    /// The visibility byte of the tile a world point falls in. Named for what it
    /// reads rather than after `Sim::vis_at`, which is the cache key and a
    /// different thing entirely.
    fn fog_at(x: f32, y: f32) -> u8 {
        let cols = map_cols() as usize;
        let cell = y as usize * cols + x as usize;
        vis_bytes().get(cell).copied().unwrap_or(0)
    }

    /// The level, as the frame reports it.
    fn arena() -> (f32, f32) {
        let f = frame();
        (f[0], f[1])
    }

    /// Where the way out is, and whether it is open.
    fn portal() -> (f32, f32, u32) {
        let f = frame();
        (f[10], f[11], f[12] as u32)
    }

    fn depth() -> u32 {
        frame()[13] as u32
    }

    fn monsters_left() -> u32 {
        frame()[9] as u32
    }

    /// Whether a body of this radius could stand at this point.
    ///
    /// **Rounded rather than truncated on the way back into `Fx`**, and that is
    /// not fussiness. `Dungeon::nearest_clear` answers a corner by pushing a
    /// body to *exactly* its own radius off each face, `is_clear` is a strict
    /// inequality, and `as i32` truncates toward zero -- so a portal placed
    /// perfectly against a corner comes back through the page's `f32` a
    /// thousandth of a unit further into the rock than it is, and the helper
    /// reports the sim's own placement as illegal. Rounding is the honest
    /// round-trip; truncation is a systematic drift toward the origin.
    fn walkable(x: f32, y: f32, radius: f32) -> bool {
        SIM.with(|sim| {
            sim.borrow().as_ref().is_some_and(|sim| {
                sim.world.is_walkable(
                    Vec2::new(
                        Fx::from_ratio((x * 1000.0).round() as i32, 1000),
                        Fx::from_ratio((y * 1000.0).round() as i32, 1000),
                    ),
                    Fx::from_ratio((radius * 1000.0).round() as i32, 1000),
                )
            })
        })
    }

    /// Opens the page's sim on the generated level with **nothing hostile
    /// standing in it**.
    ///
    /// Most of what this module does is not about the level: the frame layout,
    /// where a spawn lands, who holds the feet, whether a click is walked to.
    /// A generated level's monsters hunt the hero by design, which is noise in
    /// every one of those and would make them flaky rather than wrong. The
    /// floor plan is kept, because that half the tests genuinely do have to be
    /// honest about; only the roster is dropped.
    fn init_quiet(seed: u32) {
        install_floor(seed, |scenario| {
            scenario.units.retain(|u| u.faction == Faction::Heroes);
        });
    }

    /// [`init`]'s own floor, edited before it is installed.
    ///
    /// **Through `dungeon_scenario` and `install_articulated`, which is what
    /// `init` itself calls**, so a fixture cannot quietly be a different world
    /// from the one the page opens: same model, same dressing, same contact
    /// reservation, same fail-closed install. Three fixtures below want a roster
    /// the generator will not produce, and the roster is the only thing any of
    /// them touches.
    fn install_floor(seed: u32, edit: impl FnOnce(&mut Scenario)) {
        let mut scenario =
            dungeon_scenario(u64::from(seed), 0, starting_hero());
        edit(&mut scenario);
        install_articulated(&scenario, u64::from(seed));
    }

    /// The generated floor plan with **nobody standing on it at all**, hero
    /// included.
    ///
    /// The one state a swap is answered in that no death produced, which makes
    /// it the only honest fixture for [`Sim::entry_point`]'s fallback: a level
    /// where nobody has fallen because nobody was ever there. `Sim::on` already
    /// handles a scenario with no hero in it -- it keeps a plain Fighter as the
    /// sheet the next one arrives wearing -- so this needs no code on that side.
    fn init_deserted(seed: u32) {
        install_floor(seed, |scenario| scenario.units.clear());
    }

    /// [`init_quiet`]'s floor with the hero standing **on** the generator's exit
    /// room, which is where a cleared level puts its way out.
    ///
    /// **The fixture that replaces a kill, and it is a substitution worth
    /// stating.** The portal rules are about a hero standing inside an open way
    /// out: it must not swallow whoever opened it, and it must take that body
    /// once it has stepped clear and come back. Both used to be set up by
    /// killing the last monster, because the way out opens where the last thing
    /// died -- and an embodied hero cannot reliably finish a monster inside a
    /// test's budget. `lab embodied` decides 7.8% of its 3,600-tick duels by a
    /// body at all, and the fixture here is a Fighter against one Skitterer.
    ///
    /// A level that is clear from tick zero puts a hero in its own way out for
    /// free, which is the same state without the fight. What it cannot set up is
    /// the way out opening *at the kill*, and no fixture here can -- see the
    /// note where that test used to be.
    fn init_on_the_way_out(seed: u32) {
        install_floor(seed, |scenario| {
            scenario.units.retain(|u| u.faction == Faction::Heroes);
            let portal = scenario.portal.expect("the generated floor has no exit room");
            scenario.units[0].spawn = portal;
        });
    }

    /// The generator's exit room, out of the sim rather than off the frame --
    /// the frame carries the *portal*, and the whole point of this session is
    /// that the two are no longer the same point.
    fn exit_room() -> (f32, f32) {
        SIM.with(|sim| {
            let at = sim
                .borrow()
                .as_ref()
                .and_then(|sim| sim.exit_room)
                .expect("this level has no exit room");
            (at.x.to_f32(), at.y.to_f32())
        })
    }

    /// Steers the hero to a world point with the controls the page still has.
    ///
    /// **The replacement for `set_goto` in every fixture that used a click only
    /// to get a body somewhere.** There is no click any more -- see the standing
    /// order section for why -- so a test that needs the hero over there has to
    /// drive it there, which is what a player does. It takes the feet, turns
    /// toward the target at the held-turn rate and pushes forward, re-aiming
    /// every tick because the movement vector is read in the body frame and a
    /// body that has turned is no longer pointed where it was.
    ///
    /// Hands the feet back before returning, so a caller that wants to watch the
    /// policy take over does not have to remember to. Answers whether it
    /// arrived, so a caller can assert rather than assume -- a fixture that
    /// silently failed to walk anywhere is the green test this repository keeps
    /// finding.
    fn walk_to(tx: f32, ty: f32, tolerance: f32, budget: u32) -> bool {
        use std::f32::consts::TAU;
        set_control(CONTROL_FEET);
        // The floor the walk started on. A leg that walks into an open way out
        // ends there rather than carrying on across a level that no longer
        // exists -- and the tick counter has just gone back to zero, which is
        // the thing a caller is usually about to read.
        let floor = depth();
        let mut arrived = false;
        for _ in 0..budget {
            if depth() != floor {
                break;
            }
            let (hx, hy) = hero();
            if ((hx - tx).powi(2) + (hy - ty).powi(2)).sqrt() <= tolerance {
                arrived = true;
                break;
            }
            // The body's own heading, off the frame, in turns; and the bearing
            // it would have to hold to be walking at the target.
            let Some(row) = hero_row() else { break };
            let facing = row[UNIT_FACING_RAW] / 65_536.0;
            let want = (ty - hy).atan2(tx - hx) / TAU;
            // Signed shortest way round, in turns, as a rate request. Full
            // deflection until the last few degrees, which is the same shape a
            // player's key press has: it is held or it is not.
            let mut delta = want - facing;
            while delta > 0.5 { delta -= 1.0; }
            while delta < -0.5 { delta += 1.0; }
            let turn = if delta.abs() < 0.004 {
                0
            } else if delta > 0.0 {
                1_000
            } else {
                -1_000
            };
            set_input(1_000, 0, 0, 0, 0, 0, turn);
            step(1);
        }
        set_input(0, 0, 0, 0, 0, 0, 0);
        set_control(0);
        arrived
    }

    /// A point a body of this radius can stand on, `reach` or so from the hero.
    ///
    /// Tests that want somewhere to walk to need a destination the floor plan
    /// actually offers; on a carved level a hardcoded pair of coordinates is a
    /// coin flip. Sweeps bearings around the hero and takes the first that
    /// clears, falling back to the hero's own feet.
    fn walkable_near_hero(reach: f32, radius: f32) -> (f32, f32) {
        let (hx, hy) = hero();
        for step in 0..32 {
            let angle = step as f32 * std::f32::consts::TAU / 32.0;
            let (x, y) = (hx + reach * angle.cos(), hy + reach * angle.sin());
            if walkable(x, y, radius) {
                return (x, y);
            }
        }
        (hx, hy)
    }

    /// The boundary's half of the contact proof. `crates/sim` already compares
    /// the production corpus against a hand-built literal; this pins what
    /// crosses the ABI, so a wasm-side failure in `tools/wasm_check.js` with
    /// this test green diagnoses the *target*, not the solver -- the same
    /// pairing the five run hashes use.
    #[test]
    fn the_contact_behavior_corpus_crosses_the_boundary_byte_by_byte() {
        assert_eq!(contact_behavior_corpus_len(), 3_548);
        let bytes: Vec<u8> = (0..contact_behavior_corpus_len())
            .map(|index| u8::try_from(contact_behavior_corpus_byte(index)).unwrap())
            .collect();
        assert_eq!(&bytes[..24], b"ARPG-CONTACT-BEHAVIOR-V2");
        // Hashed off the accessor rather than off the buffer, so the two exports
        // cannot agree with the reference while disagreeing with each other.
        let mut hash = fx::Hash64::new();
        hash.write_bytes(&bytes);
        // Moved by v2-15, and by exactly one byte: case 6's body is now five
        // regional volumes rather than one anonymous capsule, so its fact names
        // the region it chose. The five volumes are the same coincident point
        // the capsule was, so the geometry is unchanged and only the region
        // byte moved -- `0xff` to Head's zero. Previously
        // `0xfe6ce41ec023c1e5`.
        assert_eq!(hash.finish(), 0x587b_0259_e877_105a);
        assert_eq!(contact_behavior_digest_lo(), 0xe877_105a);
        assert_eq!(contact_behavior_digest_hi(), 0x587b_0259);
        // 256 and not 0: the corpus is full of zero bytes, so zero cannot say
        // "past the end" and a byte value cannot be a sentinel.
        assert_eq!(contact_behavior_corpus_byte(3_548), 256);
        assert_eq!(contact_behavior_corpus_byte(u32::MAX), 256);
    }

    #[test]
    fn an_untouched_module_answers_every_export_instead_of_trapping() {
        // On a thread of its own, because a module that has never been
        // initialised is exactly what a fresh thread's `thread_local!` gives --
        // and because `cargo test -- --test-threads=1` would otherwise hand
        // this test whatever the previous one left behind.
        std::thread::spawn(|| {
            assert_eq!(tick(), 0);
            assert_eq!(hash(), 0);
            assert_eq!(frame_len(), HEADER_LEN as u32);
            assert_ne!(frame_ptr(), 0);
            // None of these have a world to work on; none of them may complain.
            set_control(CONTROL_FEET | CONTROL_LIMB);
            set_input(1_000, 0, 0, 500, 0, 1, 0);
            // Zero, and that is the honest answer rather than a dropped
            // request: the mask lives on the `Sim`, so with no world there is
            // nowhere to put it and nothing for it to hold. What matters here is
            // that both calls return instead of trapping.
            assert_eq!(control(), 0, "a module with no world is holding a control mask");
            // The fog. Its buffer is a `thread_local!` static like the tiles', so
            // its address is answerable before there is anything to be fogged;
            // the two lengths are not, and both have to say zero rather than
            // hand the page a slice over a level that does not exist.
            assert_ne!(vis_ptr(), 0);
            assert_eq!(vis_len(), 0, "a module with no world reported a fogged level");
            assert_eq!(vis_len(), map_len(), "vis_len and map_len disagree at rest");
            assert_eq!(vis_revision(), 0);
            step(10);
            assert_eq!(
                spawn_monster(3, SLOT_EMPTY, SLOT_EMPTY),
                0,
                "spawned into a world that is not there"
            );
            assert_eq!(
                swap_in_hero(0, SLOT_EMPTY, SLOT_EMPTY),
                0,
                "swapped a character into a world that is not there"
            );
            // The panels' exports, which are the ones a page calls while it is
            // still building its own DOM -- before `init`, in other words.
            assert_eq!(hero_stat(0), 0);
            assert_eq!(set_hero_stat(0, 12), 0, "dressed a hero that is not there");
            assert_eq!(hero_body(), SLOT_EMPTY);
            assert_eq!(hero_loadout(0), SLOT_EMPTY);
            assert_eq!(spawn_template_body(), 3, "the template opens on a Skitterer");
            assert_eq!(set_spawn_template_body(0), 0);
            assert_eq!(spawn_template_stat(0), 0);
            assert_eq!(set_spawn_template_stat(0, 9), 0);
            assert_eq!(spawn_template_slot(0), SLOT_EMPTY);
            assert_eq!(set_spawn_template_slot(0, 2), 0);
            assert_eq!(spawn_from_template(), 0, "spawned into a world that is not there");
            assert_eq!(tick(), 0);
            assert_eq!(frame_len(), HEADER_LEN as u32);
        })
        .join()
        .expect("an export panicked with no world to work on");
    }

    #[test]
    fn the_tick_rate_does_not_depend_on_how_the_caller_batches_its_frames() {
        // The client calls `step` with whatever the display's refresh rate left
        // in its accumulator. That must not be able to change the run.
        init(7);
        set_control(CONTROL_FEET);
        set_input(1_000, 0, 0, 500, 0, 1, 250);
        step(300);
        let batched = (tick(), hash());

        init(7);
        set_control(CONTROL_FEET);
        set_input(1_000, 0, 0, 500, 0, 1, 250);
        for _ in 0..300 {
            step(1);
        }
        assert_eq!(
            (tick(), hash()),
            batched,
            "300 single steps and one step of 300 produced different runs"
        );
    }

    #[test]
    fn the_frame_header_and_the_unit_row_land_where_the_layout_says() {
        init_quiet(1);
        let start = hero();
        // Driven rather than ordered. The header still carries an order kind and
        // an order point and they are now always `Hold` at the origin, which is
        // asserted below as the constant it has become rather than quietly
        // skipped -- a column that has stopped meaning anything is exactly the
        // kind of thing a layout test should be the one to say so about.
        set_control(CONTROL_FEET);
        set_input(1_000, 0, 0, 0, 0, 0, 0);
        step(60);

        let frame = frame();
        // Against the frame's own three counts rather than against a literal.
        // **This used to read `HEADER_LEN + UNIT_STRIDE`, and the premise under
        // it was that an empty level produces no events.** That premise was
        // true while an event meant a blow; it stopped being true the moment a
        // footfall became one, and a walking hero puts `EVENT_STEP` rows in
        // this frame every dozen ticks. What the assertion is really for -- the
        // header and the first unit row landing where the layout says -- is
        // unaffected, so it is the arithmetic that moves and not the claim.
        assert_eq!(frame.len(), frame_span());
        assert_eq!(frame_len() as usize, frame.len());
        assert_eq!(frame[0], f32::from(DUNGEON_COLS), "arena_x");
        assert_eq!(frame[1], f32::from(DUNGEON_ROWS), "arena_y");
        assert_eq!(frame[2], 0.0, "order_kind: Hold is discriminant 0, and now the only one");
        assert_eq!(frame[3], 0.0, "order_x: Hold has no point");
        assert_eq!(frame[4], 0.0, "order_y");
        assert!(
            frame[5] > 0.0 && frame[5] <= tick() as f32,
            "last_decision_tick is {}, at tick {}",
            frame[5],
            tick()
        );
        assert_eq!(frame[6], 1.0, "unit_count");
        assert_eq!(frame[7], 0.0, "shot_count");
        // And the stronger form of what the literal above was claiming: on an
        // emptied level with one body walking, a footfall is the *only* thing
        // that can have happened. A row of any other kind here means something
        // is announcing itself that nothing in this fixture did.
        assert!(frame[8] > 0.0, "sixty ticks of walking produced no footfall");
        for row in events() {
            assert_eq!(
                row[0], EVENT_STEP as f32,
                "nobody has hit anybody in an empty level, so this row should not exist"
            );
            assert_eq!(row[4], frame[HEADER_LEN + 9], "the footfall is not the hero's");
        }
        // The run block, appended after the three section counts.
        assert_eq!(frame[9], 0.0, "monsters_left: this level was emptied");
        assert_eq!(frame[12], PORTAL_OPEN as f32, "portal_state: nothing left");
        assert_eq!(frame[13], 0.0, "depth: the first floor");
        assert_eq!(frame[14], 0.0, "events_dropped: one body cannot fill the feed");

        let unit = &frame[HEADER_LEN..];
        assert!(
            (unit[0], unit[1]) != start,
            "x, y: the hero never set off from {start:?}"
        );
        // The Fighter's stats, as a check that the row is not shifted by one:
        // a wedge drawn from `hp` instead of `facing_raw` is a bug you notice
        // only by looking at the screen.
        assert!(
            (0.0..=65535.0).contains(&unit[2]),
            "facing_raw {} is not a binary angle",
            unit[2]
        );
        assert!((unit[3] - 0.45).abs() < 0.001, "radius {}", unit[3]);
        assert_eq!(unit[4], 12.0, "hp: 4 + vitality 8");
        assert_eq!(unit[5], 12.0, "max_hp");
        assert_eq!(unit[6], 0.0, "faction: Heroes");
        assert_eq!(unit[7], 0.0, "kind: Fighter");
        assert_eq!(unit[8], 0.0, "intent: Hold");
        // The identity columns. The room's hero is the first entity ever
        // spawned into a fresh world, so it holds slot 0 at generation 0.
        assert_eq!(unit[9], 0.0, "entity_index");
        assert_eq!(unit[10], 0.0, "entity_generation");

        // The limb. Bearings are binary angles like `facing_raw`; extensions
        // and flashes are fractions.
        assert!(
            (0.0..=65535.0).contains(&unit[11]),
            "column 11 is {} which is not a binary angle",
            unit[11]
        );
        for slot in [12usize, 16, 17, 18] {
            assert!(
                (0.0..=1.0).contains(&unit[slot]),
                "column {slot} is {}, outside 0..=1",
                unit[slot]
            );
        }
        assert!((unit[14] - 0.95).abs() < 0.001, "action_length {}", unit[14]);
        // The guard arc of **what is in hand**, not of the body. A Fighter walks
        // in holding a sword, and a sword covers nothing -- the 61.9 degrees
        // this used to assert belonged to a shield that every character carried
        // for free, which is the misfiling the whole split exists to undo.
        assert_eq!(unit[15], 0.0, "a sword is not a guard");
        // Alone in a room, the hero has nothing to swing at and nothing has hit
        // it, so both the blade and every marker are at rest.
        assert_eq!(unit[13], 0.0, "limb_spin");
        assert_eq!((unit[16], unit[17], unit[18]), (0.0, 0.0, 0.0), "flashes");

        // The loadout, which is the half of the row this layout gained. A
        // Fighter walks in with a sword up and a shield stowed.
        assert_eq!(unit[19], 0.0, "limb_swing: at guard, alone in a room");
        assert_eq!(unit[22], sim::ActionKind::Sword.code() as f32, "action_kind");
        assert_eq!(unit[23], 0.0, "action_role: a sword strikes");
        assert_eq!(unit[24], 0.0, "slot: the primary is up");
        assert_eq!(unit[25], sim::ActionKind::Sword.code() as f32, "slot0");
        assert_eq!(unit[26], sim::ActionKind::Shield.code() as f32, "slot1");

        // How far it can see, in world units, from the stat sheet rather than
        // from a formula copied into the page: `6.0 + 0.6 * perception 6`.
        assert!(
            (unit[27] - 9.6).abs() < 0.001,
            "sight_range {}, not the Fighter's 9.6",
            unit[27]
        );
        // And the same number for a body nobody has spawned, which is what the
        // roster preview reads. Thousandths, like every other scalar `body_stat`
        // answers with.
        assert_eq!(body_stat(0, 7), 9_600, "the Fighter's sight, in thousandths");
        assert_eq!(body_stat(2, 7), 7_800, "the Brute's: 6.0 + 0.6 * 3");
        assert_eq!(body_stat(0, 99), 0, "an unknown selector named something");

        // The last column, and the newest: whether the *player* can see this
        // body. Alone in a room, the one body there is the point of view, so the
        // only answer this can have is `1`.
        assert_eq!(unit[28], 1.0, "visible: the hero cannot see itself");

        // And the handshake that makes relaying this out safe at all. All five
        // numbers, because the page compares all five and stops on any one of
        // them disagreeing.
        assert_eq!(frame_layout_version(), FRAME_LAYOUT_VERSION);
        assert_eq!(unit_stride(), UNIT_STRIDE as u32);
        assert_eq!(shot_stride(), SHOT_STRIDE as u32);
        assert_eq!(event_stride(), EVENT_STRIDE as u32);
        assert_eq!(header_len(), HEADER_LEN as u32);
    }

    #[test]
    fn a_faction_can_be_handed_a_different_mind_mid_fight() {
        init_quiet(1);
        // **Both sides open on the fighter**, which is what this used to assert
        // of `scripted` and is asserted for the same reason: it is one line in
        // `Sim::try_on` away from quietly reverting, and the registry it is
        // drawn from now holds a fighter, the script that fighter was built to
        // beat, and two variations. See that function for why the dungeon opens
        // on the shipped fighter on both sides and `#/arena` opens on the
        // contrast between them.
        //
        // **The line is worth guarding in this direction more than it was in the
        // last one.** A revert to `scripted` on both sides would still open a
        // room where two bodies fight, so nothing above would go red and every
        // screenshot would still look like a fight -- it would just be the
        // control fighting itself. That is precisely the failure this file is
        // built to make loud rather than plausible.
        assert_eq!(policy_kind(0), PolicyKind::Tactical.code());
        assert_eq!(policy_kind(1), PolicyKind::Tactical.code());

        assert_eq!(set_policy(0, PolicyKind::Neutral.code()), 1);
        assert_eq!(policy_kind(0), PolicyKind::Neutral.code());
        assert_eq!(policy_kind(1), PolicyKind::Tactical.code(), "both sides moved");

        // An unknown code changes nothing rather than trapping.
        assert_eq!(set_policy(0, 999), 0);
        assert_eq!(policy_kind(0), PolicyKind::Neutral.code());
    }

    #[test]
    fn changing_a_policy_changes_the_fight() {
        // The claim the panel is there to make. Same seed, same room, same
        // monster -- only the mind is different, and the run must differ.
        let script = |kind: PolicyKind| -> u64 {
            init_quiet(3);
            set_policy(0, kind.code());
            spawn_monster(2, SLOT_EMPTY, SLOT_EMPTY);
            step(600);
            hash()
        };
        assert_ne!(
            script(PolicyKind::Neutral),
            script(PolicyKind::Scripted),
            "swapping the hero's mind produced an identical run"
        );
    }

    #[test]
    fn taking_control_of_the_feet_moves_the_hero_where_the_player_says() {
        init_quiet(1);
        let start = hero();
        set_control(CONTROL_FEET);
        assert_eq!(control(), CONTROL_FEET);
        // **Local forward, at full speed, for a second.** The pair is read in
        // the body frame now -- `+x` is forward and `+y` is body-left -- so this
        // is the same request the three lines of hand-written rotation used to
        // build, and the body walks along the heading it is holding. Every body
        // spawns facing east, so forward is east.
        set_input(1000, 0, 0, 0, 0, 0, 0);
        step(60);
        let (x, y) = hero();
        assert!(x > start.0 + 1.0, "walked to ({x}, {y}) from {start:?}");
        assert!((y - start.1).abs() < 0.2, "local forward leaked sideways");

        // Handing it back leaves the character thinking rather than stuck: the
        // policy has to start being consulted again within one decision period.
        // **Read off `last_decision_tick` rather than off a walk**, because
        // there is nothing left that can tell a policy where to go -- an
        // embodied body with nobody in sight holds station, and a fixture that
        // asserted it walked would be asserting something no policy in the
        // registry does.
        set_control(0);
        assert_eq!(control(), 0);
        let handed_back = tick();
        step(200);
        assert!(
            frame()[5] > handed_back as f32,
            "the hero never got its feet back: last decision at {}, handed back at {handed_back}",
            frame()[5],
        );
    }

    /// A held turn is a rate, and the body spends its whole turn authority on it
    /// for as long as the key is down.
    ///
    /// **This used to pin an exact quarter turn in exactly 32 ticks**, because
    /// `face_legacy` wrote 512 raw straight onto the body and the cadence had no
    /// remainder for the cardinal headings the controls teach first. There is no
    /// such number any more: the yaw is a request and the actuator answers it at
    /// the body's own authority, so what is pinned here is the shape -- it turns
    /// while held, it stops when released, it reverses, and forward is forward
    /// along whatever heading the turn left behind. See `Sim::drive_hero` for the
    /// measurement that picked the lead.
    #[test]
    fn held_tank_turn_rotates_a_stationary_hero_until_release() {
        init_quiet(1);
        let start = hero();
        set_control(CONTROL_FEET);
        set_input(0, 0, 0, 0, 0, 0, 1000);
        step(32);
        let unit = &frame()[HEADER_LEN..];
        assert_eq!((unit[0], unit[1]), start, "turning translated the hero");
        let turned = unit[2];
        // **Bounded both ways against the number the legacy control delivered.**
        // 512 raw a tick written straight onto the body made 32 ticks an exact
        // quarter -- 16,384 -- and that is what the lead has to be worth if the
        // control is to feel like the control it replaces. Measured at 16,107,
        // which is 1.7% short of the quarter and is the actuator accelerating
        // out of a standstill. A band open at either end would be satisfied by
        // the converged 512-lead translation this replaced, which turned 8,577
        // raw in 240 ticks.
        assert!(
            (turned - 16_384.0).abs() < 1_024.0,
            "32 ticks of held E turned {turned} raw, not the quarter the legacy cadence gave"
        );

        // Released, it settles rather than carrying on: the request stops where
        // the body is, so what is left to spend is one deceleration.
        set_input(0, 0, 0, 0, 0, 0, 0);
        step(60);
        let settled = frame()[HEADER_LEN + 2];
        println!("settled at {settled} raw after release");
        step(120);
        assert_eq!(frame()[HEADER_LEN + 2], settled,
            "the heading was still moving two seconds after the key came up");

        // Held Q is the same thing the other way round.
        set_input(0, 0, 0, 0, 0, 0, -1000);
        step(32);
        let reversed = frame()[HEADER_LEN + 2];
        assert!(reversed < settled, "held Q did not reverse the turn: {settled} -> {reversed}");
        set_input(0, 0, 0, 0, 0, 0, 0);
        step(60);

        // And forward is forward *along the heading the turn left*, which is the
        // whole claim the body frame makes: `move_dir` is read in the torso's
        // own axes and the world rotation is the sim's.
        let heading = frame()[HEADER_LEN + 2] / 65_536.0 * std::f32::consts::TAU;
        let before = hero();
        set_input(1000, 0, 0, 0, 0, 0, 0);
        step(60);
        let after = hero();
        let (dx, dy) = (after.0 - before.0, after.1 - before.1);
        let along = dx * heading.cos() + dy * heading.sin();
        let across = -dx * heading.sin() + dy * heading.cos();
        assert!(along > 1.0, "forward moved {along} along the heading");
        assert!(across.abs() < 0.3, "forward leaked {across} across the heading");
    }

    /// Where the hero is *asking* arm `limb` to put its hand, as an offset from
    /// the body origin in the plane.
    ///
    /// **Off the pose publication rather than off the frame's `limb_angle_raw`.**
    /// That column belongs to the legacy limb and is inert on a body with
    /// joints; what an embodied arm is asked for lands in `POSE_*_TARGET_*`,
    /// which `target_hands_round_trip` pins as the actuator's own target -- so
    /// it is exactly what a command wrote, with no chasing in between.
    ///
    /// An offset and not a bearing, deliberately: the target is built from the
    /// *shoulder* and published against the body origin, so a bearing taken here
    /// carries the shoulder's lateral offset with it and would need a tolerance
    /// wide enough to be worth nothing. A sign is a sign.
    fn hero_arm_target(limb: usize) -> (f32, f32) {
        let hero = hero_row().expect("the hero is gone");
        let row = published_poses()
            .into_iter()
            .find(|row| row[POSE_ENTITY_INDEX] as f32 == hero[UNIT_ENTITY_INDEX])
            .expect("the hero published no pose row");
        let fx = |word: u32| Fx::from_raw(word as i32).to_f32();
        let base = if limb == 0 { POSE_LEFT_TARGET_X } else { POSE_RIGHT_TARGET_X };
        (fx(row[base]) - fx(row[POSE_BODY_X]), fx(row[base + 1]) - fx(row[POSE_BODY_Y]))
    }

    #[test]
    fn taking_control_of_the_sword_points_it_where_the_player_says() {
        init_quiet(1);
        set_control(CONTROL_LIMB);
        // Guard due north -- a quarter turn -- braced halfway out, attacking
        // nothing. Every body spawns facing east, so this is a quarter off the
        // centre line and the hand should end up on the `+y` side of the body.
        set_input(0, 0, 16_384, 500, 0, 0, 0);
        step(120);
        let (_, north) = hero_arm_target(0);
        assert!(north > 0.0, "the hand is {north} off the body in y, not north of it");

        // **The button is *when*, and what it moves is the reach and the
        // effort.** A cut drives the hand out to full extension where a guard
        // extends only as far as the player is bracing it; the pointer still
        // says where. There is no windup phase to watch for -- an embodied arm
        // has no phase machine, which is the whole difference between this
        // grammar and the one that needed `limb_swing`.
        set_input(0, 0, 16_384, 500, 0, 1, 0);
        step(120);
        let (sx, sy) = hero_arm_target(0);
        let striking = (sx * sx + sy * sy).sqrt();
        set_input(0, 0, 16_384, 500, 0, 0, 0);
        step(120);
        let (gx, gy) = hero_arm_target(0);
        let guarding = (gx * gx + gy * gy).sqrt();
        assert!(
            striking > guarding + 0.05,
            "the button did not extend the arm: guarding {guarding}, striking {striking}"
        );

        // The pointer moves and the hand follows it round. **Against the north
        // reading rather than against zero**, because the target is built from
        // the shoulder and published against the body origin: half a body width
        // of that offset is in every number this helper answers, and a threshold
        // that ignored it would be a threshold picked to pass.
        set_input(0, 0, 49_152, 500, 0, 0, 0);
        step(120);
        let (_, south) = hero_arm_target(0);
        assert!(
            south < north - 0.4,
            "the pointer went from north to south and the hand went {north} -> {south}"
        );

        // And the half `CONTROL_SLOT` still buys. It used to name which item the
        // fighter put *in hand*; an embodied body holds both at once, so what it
        // names now is which of the two hands the pointer is steering -- which is
        // the sentence `Sim::input_slot`'s own doc has always carried.
        //
        // Taken explicitly, because the limb does not imply it: the three bits
        // are three bits. Asserting that `CONTROL_LIMB` alone left the other
        // choices with the AI is `the_three_control_bits_are_independent`'s job.
        assert_eq!(control(), CONTROL_LIMB, "the limb bit dragged another one in with it");
        let (_, off_before) = hero_arm_target(1);
        set_control(CONTROL_LIMB | CONTROL_SLOT);
        set_input(0, 0, 16_384, 1000, 1, 0, 0);
        step(120);
        let (_, off_after) = hero_arm_target(1);
        assert!(
            off_after > off_before + 0.3,
            "the off hand ignored the pointer: {off_before} -> {off_after}"
        );
    }

    #[test]
    fn the_three_control_bits_are_independent() {
        // Feet under the player, sword under the policy, and the other way
        // round. This is the whole shape of the feature: they are different
        // skills and any of them can be handed over alone.
        init_quiet(1);
        spawn_monster(2, SLOT_EMPTY, SLOT_EMPTY);
        set_control(CONTROL_FEET);
        set_input(1000, 0, 0, 0, 0, 0, 0);
        step(120);
        let arm_before = hero_arm_target(0);
        step(60);
        let arm_after = hero_arm_target(0);

        init_quiet(1);
        spawn_monster(2, SLOT_EMPTY, SLOT_EMPTY);
        set_control(CONTROL_LIMB);
        set_input(0, 0, 16_384, 500, 0, 0, 0);
        let stood = hero();
        step(120);
        let feet_under_ai = frame();

        assert_ne!(
            arm_before, arm_after,
            "the policy stopped driving the arm when only the feet were taken"
        );
        assert_ne!(
            hero(), stood,
            "the policy stopped driving the feet when only the limb was taken"
        );
        assert!(feet_under_ai.len() >= HEADER_LEN + UNIT_STRIDE);

        // **All eight combinations, read back exactly as asked for.** The page
        // draws three switches over these bits, so a mask that quietly gained a
        // bit on the way in is a switch that lights itself: `set_control` used
        // to fold `LIMB` into `LIMB | SLOT` and the page had to give up on
        // switches entirely because of it.
        init_quiet(1);
        for mask in 0..8 {
            set_control(mask);
            assert_eq!(control(), mask, "mask {mask} did not survive the round trip");
        }
        // And nothing outside the three is remembered, rather than being stored
        // and handed back as a control the page has no switch for.
        set_control(u32::MAX);
        assert_eq!(control(), CONTROL_FEET | CONTROL_LIMB | CONTROL_SLOT);
        set_control(0);
        assert_eq!(control(), 0);
    }

    /// Opens the page's sim on a floor plan this module carved itself.
    ///
    /// The only place here that writes tiles, and it is shared rather than
    /// copied. [`init_walled`] wants exactly one tile of rock between two named
    /// points, which the generator has no way to be told. A second hand-rolled
    /// `Scenario` literal beside it would be two places for "how this module
    /// builds a level" to drift apart -- which is worth keeping the seam for
    /// even at one caller, because the seam is what the *dressing* lives on.
    ///
    /// `portal: None`, deliberately, for every caller. A level with nothing
    /// hostile left in it reads as an open way out, and a hero that happened to
    /// be standing in one would end the run in the middle of the test.
    fn init_carved(cols: u16, rows: u16, tiles: Vec<u8>, mut units: Vec<UnitSpec>) {
        // Dressed like every other body on every floor this module opens.
        //
        // **There was no model parameter here and there deliberately was not
        // one; session 05 then deleted the field the argument was about.** A
        // world of any other model was completely inert under this host --
        // `Sim::advance` submits through `World::submit`, which
        // refused anything that was not embodied, so nobody would think, move or
        // fight on one and a fixture that opened one would have been a floor
        // plan with statues. Kept because it is the answer a second model would
        // have to earn again before this helper grew that parameter.
        for unit in &mut units {
            equip_articulated(unit);
        }
        let scenario = Scenario {
            name: "carved".to_string(),
            combat_specs: Some(sim::CombatSpecTableV1::fixtures()),
            dungeon: Dungeon::from_tiles(cols, rows, tiles),
            units,
            portal: None,
            torches: Vec::new(),
            max_ticks: 60 * 60,
        };
        install_articulated(&scenario, 1);
    }

    /// A body of this archetype, on its own default sheet, standing at a point
    /// given in tenths of a world unit.
    ///
    /// Tenths rather than a float pair, because a spawn point is simulation
    /// state: `Fx::from_ratio` is exact for a tenth and a fixture that wrote
    /// `4.5` would be the one float in this module's inputs.
    fn spec_at(kind: Body, faction: Faction, x_tenths: i32, y_tenths: i32) -> UnitSpec {
        UnitSpec {
            kind,
            faction,
            stats: kind.base_stats(),
            loadout: kind.default_loadout(),
            combat_spec: None,
            spawn: Vec2::new(Fx::from_ratio(x_tenths, 10), Fx::from_ratio(y_tenths, 10)),
        }
    }

    /// The walled level's extent and the three bodies standing in it, so
    /// [`init_walled`] and the test that reads it cannot disagree about which
    /// point is which. All three in whole tenths, and the two monsters exactly
    /// [`WALLED_RANGE`] tenths from the hero.
    const WALLED_COLS: u16 = 16;
    const WALLED_ROWS: u16 = 12;
    const WALLED_HERO: (i32, i32) = (45, 55);
    /// Behind one tile of rock: due south, across the solid row at `ty` 7.
    const WALLED_BLIND: (i32, i32) = (45, 95);
    /// Down an open corridor: due east, nothing between.
    const WALLED_OPEN: (i32, i32) = (85, 55);
    const WALLED_RANGE: f32 = 4.0;

    /// Opens the page's sim on the reported bug as a fixture: a hero, a monster
    /// behind exactly one tile of rock, and a second monster the same distance
    /// away down an open corridor.
    ///
    /// **The distances are equal on purpose.** A test where the unseen monster is
    /// merely further off would pass against a `visible` column that had never
    /// heard of masonry, which is the bug this whole change set exists to fix.
    ///
    /// The southern chamber has no way into it, so nothing walks out of position
    /// -- but the test reads the frame the fixture publishes and does not step at
    /// all, so the monster down the corridor cannot either.
    fn init_walled() {
        let cols = WALLED_COLS as usize;
        let mut tiles = vec![WALL; cols * WALLED_ROWS as usize];
        // The hero's room, `ty` 2..=6.
        for ty in 2..=6 {
            for tx in 2..=6 {
                tiles[ty * cols + tx] = OPEN;
            }
        }
        // The corridor east out of it, three tiles tall so a body of any radius
        // in the roster has rock to spare either side -- see `CORRIDOR` in
        // `Dungeon`, which is the same argument.
        for ty in 4..=6 {
            for tx in 7..=12 {
                tiles[ty * cols + tx] = OPEN;
            }
        }
        // The southern chamber, `ty` 8..=10. Row 7 is left solid, and it is the
        // one tile of rock the whole fixture is about.
        for ty in 8..=10 {
            for tx in 2..=6 {
                tiles[ty * cols + tx] = OPEN;
            }
        }

        init_carved(
            WALLED_COLS,
            WALLED_ROWS,
            tiles,
            vec![
                spec_at(Body::Fighter, Faction::Heroes, WALLED_HERO.0, WALLED_HERO.1),
                spec_at(
                    Body::Skitterer,
                    Faction::Monsters,
                    WALLED_BLIND.0,
                    WALLED_BLIND.1,
                ),
                spec_at(
                    Body::Skitterer,
                    Faction::Monsters,
                    WALLED_OPEN.0,
                    WALLED_OPEN.1,
                ),
            ],
        );
    }

    /// The row standing at a `(tenths, tenths)` point from the constants above.
    fn row_at(point: (i32, i32)) -> Vec<f32> {
        let (x, y) = (point.0 as f32 / 10.0, point.1 as f32 / 10.0);
        rows()
            .into_iter()
            .find(|row| (row[0] - x).abs() < 0.01 && (row[1] - y).abs() < 0.01)
            .unwrap_or_else(|| panic!("nobody is standing at ({x}, {y})"))
    }

    // ------------------------------------------------------------- the descent

    #[test]
    fn a_level_opens_carved_with_the_opposition_already_in_it() {
        init(1);
        assert_eq!(arena(), (f32::from(DUNGEON_COLS), f32::from(DUNGEON_ROWS)));
        assert_eq!(depth(), 0, "the first floor is depth zero");
        assert!(monsters_left() >= 3, "an empty dungeon is not a dungeon");
        assert_eq!(monsters_left() as usize, monsters().len());

        // Everybody the level placed can stand where it was placed.
        let hero = hero_row().expect("no hero");
        assert!(walkable(hero[0], hero[1], hero[3]));
        for monster in monsters() {
            assert!(walkable(monster[0], monster[1], monster[3]));
        }

        // And the map crossed with it.
        assert_eq!(map_cols(), u32::from(DUNGEON_COLS));
        assert_eq!(map_rows(), u32::from(DUNGEON_ROWS));
        assert_eq!(map_len(), map_cols() * map_rows());
        assert_eq!(map_tile_size_milli(), 1000);
    }

    #[test]
    fn nothing_marks_the_way_out_while_monsters_live() {
        // The reverse of what this file used to assert, and the user's call:
        // the exit is earned rather than pointed at. `PORTAL_SHUT` is retired
        // -- there is no "visible but shut" state left to be in.
        init(1);
        assert!(monsters_left() > 0, "an empty dungeon is not a dungeon");
        let (px, py, state) = portal();
        assert_eq!(state, PORTAL_NONE, "the way out was marked before it was won");
        assert_eq!((px, py), (0.0, 0.0), "a portal-less frame carries no point");

        // And it does not open by being walked over, either. The generator's
        // exit room is where the fallback would put one, so walking there is
        // the strongest form of this claim the page can make.
        let before = depth();
        let (ex, ey) = exit_room();
        walk_to(ex, ey, 1.0, 2_400);
        assert_eq!(depth(), before, "the hero descended through a way out that was not there");
        assert_eq!(portal().2, PORTAL_NONE, "standing on it opened it");
    }

    #[test]
    fn a_level_that_is_already_clear_opens_its_way_out_at_once() {
        // The fixture case, and the one an edge detector would miss: there is
        // no falling edge from one monster to none on a level that never had
        // one. With nothing killed on it the fallback answers -- the
        // generator's own exit room.
        init_quiet(1);
        assert_eq!(monsters_left(), 0);
        assert_eq!(portal().2, PORTAL_OPEN, "nothing left and no way out");
        let (px, py) = (portal().0, portal().1);
        assert!(walkable(px, py, 0.7), "the way out is in the rock");
        let (ex, ey) = exit_room();
        assert!(
            (px - ex).abs() < 1.5 && (py - ey).abs() < 1.5,
            "({px}, {py}) is not the generator's exit room ({ex}, {ey})",
        );
    }

    // **`the_way_out_opens_where_the_last_one_died` has no fixture left.** The
    // rule is still there and still runs -- `Sim::last_kill` is written from the
    // `Event::Death` arm of `Sim::advance`, and `Sim::open_the_way_out` prefers
    // it over the generator's exit room -- but reaching it from this boundary
    // means one hero finishing one monster, and an embodied fight decides on a
    // body 7.8% of the time inside 3,600 ticks. A fixture that needed twenty
    // thousand ticks and the right seed would be measuring the seed.
    //
    // What is still covered: the fallback, by
    // `a_level_that_is_already_clear_opens_its_way_out_at_once`; the position
    // itself, by `a_replacement_lands_where_the_last_one_fell`, which reads the
    // same `Event::Death` trace position through `Sim::last_hero_fall` and gets
    // there because twelve brutes can finish one Fighter. What is not: that a
    // *monster*'s fall site becomes the portal.

    #[test]
    fn the_exit_does_not_swallow_whoever_opened_it() {
        // The bug this rule has to pre-empt: the way out appears at the hero's
        // feet, so without an arming flag the level ends on the tick it is
        // cleared and the player never sees the room they just won.
        //
        // **The seed is a fixture and has moved twice**, and the assertion below
        // is what picks it: this test only proves anything if the kill lands
        // close enough that the way out opens *inside* the hero, and where a
        // skitterer falls is a fact about the floor plan it was chased across.
        // Seed 1 was retired at world-05 for clearing at 1.40 against a reach of
        // 1.35; doors moved the chase again and it now clears at 0.62, while
        // seed 11 spawns its skitterer behind a shut door and never clears at
        // all. Both times a fixture stopped setting the trap up, and neither
        // time did a rule change.
        init_on_the_way_out(1);
        assert_eq!(portal().2, PORTAL_OPEN, "a clear level marked no way out");
        let (px, py, _) = portal();
        let reach = PORTAL_RADIUS.to_f32() + hero_row().expect("no hero")[3];
        println!("the exit opened {} from the hero, reach {reach}", distance_from_hero(px, py));
        assert!(
            distance_from_hero(px, py) <= reach,
            "the way out did not open inside the hero, so this proves nothing",
        );

        // Standing in it, doing nothing, for two seconds.
        let before = depth();
        set_policy(0, PolicyKind::Neutral.code());
        step(120);
        assert_eq!(depth(), before, "the exit took the hero that opened it");
        assert_eq!(portal().2, PORTAL_OPEN, "and the way out went with it");

        // Walk off it, and back on.
        let (ax, ay) = walkable_near_hero(3.0, 0.45);
        assert!(walk_to(ax, ay, 0.6, 1_800), "the hero never stepped clear of the exit");
        assert_eq!(depth(), before, "left the level by walking away from the exit");
        walk_to(px, py, 0.4, 1_800);
        assert_eq!(depth(), before + 1, "the way out would not take the hero back");
    }

    #[test]
    fn walking_into_an_open_way_out_builds_the_next_floor() {
        init_on_the_way_out(1);
        let before_map = map_revision();
        let before_hero = hero_row().expect("no hero");
        let (px, py, _) = portal();

        // Clear of it first, because a hero that opened the way out is standing
        // in it and has not "arrived" at anything. See `Sim::portal_armed`.
        let (ax, ay) = walkable_near_hero(3.0, 0.45);
        assert!(walk_to(ax, ay, 0.6, 1_800), "the hero never stepped clear of the exit");
        walk_to(px, py, 0.4, 1_800);

        assert_eq!(depth(), 1, "never descended; stopped at {:?}", hero());
        assert_eq!(tick(), 0, "the new floor did not start at tick zero");
        assert_ne!(map_revision(), before_map, "the floor plan did not change");
        assert!(monsters_left() >= 3, "the next floor is empty");

        // The character persists and arrives whole. Health first, because it is
        // the one that costs no code -- `World::spawn` refills it -- and would
        // therefore be the one to break silently.
        let after = hero_row().expect("the hero did not come down the stairs");
        assert_eq!(after[7], before_hero[7], "kind");
        assert_eq!(after[5], before_hero[5], "max_hp: the stat sheet came too");
        assert_eq!(after[4], after[5], "arrived wounded");
        assert!(walkable(after[0], after[1], after[3]));
    }

    #[test]
    fn the_map_only_changes_when_the_level_does() {
        init(1);
        let revision = map_revision();
        let tiles = map_bytes();

        // A tick, an input and a slider all leave it alone. `publish` runs on
        // every one of them, which is exactly the mistake this guards.
        step(120);
        set_input(1_000, 0, 0, 0, 0, 0, 0);
        set_hero_stat(0, 9);
        assert_eq!(map_revision(), revision, "the floor plan moved under a slider");
        assert_eq!(map_bytes(), tiles);

        assert_eq!(descend(), 1);
        assert_ne!(map_revision(), revision, "a new floor kept the old plan");
        assert_ne!(map_bytes(), tiles, "a new floor kept the old tiles");
        assert_eq!(map_len() as usize, map_bytes().len());
    }

    #[test]
    fn the_map_describes_the_level_the_frame_draws() {
        init(1);
        let (cols, rows) = (map_cols() as usize, map_rows() as usize);
        let tiles = map_bytes();
        for row in std::iter::once(hero_row().expect("no hero")).chain(monsters()) {
            let (tx, ty) = (row[0] as usize, row[1] as usize);
            assert_eq!(
                tiles[ty * cols + tx],
                0,
                "a body is standing on a tile the map calls solid: ({}, {})",
                row[0],
                row[1]
            );
        }
        assert!(rows > 0 && tiles.iter().any(|&t| t != 0), "nothing was carved");
    }

    // ----------------------------------------------------------------- the fog

    #[test]
    fn the_visibility_column_is_the_heros_eyes() {
        init_walled();
        let hero = hero_row().expect("no hero");
        let blind = row_at(WALLED_BLIND);
        let open = row_at(WALLED_OPEN);

        // The fixture's whole claim, asserted rather than trusted: the two
        // monsters are the same distance off, so the only thing that can
        // separate their answers is the masonry between.
        assert!(
            (distance(&hero, &blind) - WALLED_RANGE).abs() < 0.01
                && (distance(&hero, &open) - WALLED_RANGE).abs() < 0.01,
            "the two monsters are not equidistant: {} and {}",
            distance(&hero, &blind),
            distance(&hero, &open)
        );
        // And both are well inside sight, so a range test on its own would answer
        // `1` twice -- which is exactly the bug this column exists to fix.
        assert!(
            hero[27] > WALLED_RANGE,
            "a Fighter's {} units of sight no longer reaches {WALLED_RANGE}",
            hero[27]
        );

        assert_eq!(hero[28], 1.0, "the hero cannot see itself");
        assert_eq!(open[28], 1.0, "a monster down an open corridor is invisible");
        assert_eq!(blind[28], 0.0, "the player sees through one tile of rock");

        // And with nobody to be fogged from, every row reports visible. A
        // generated level for this half rather than the carved one: it needs
        // monsters that can reach the character, which a fixture built out of
        // sealed chambers deliberately does not have.
        init_quiet(FATAL_SEED);
        assert!(kill_the_hero(), "twelve brutes could not kill one fighter");
        let standing = rows();
        assert!(!standing.is_empty(), "the killers all died too");
        for row in standing {
            assert_eq!(
                row[28], 1.0,
                "a body at ({}, {}) was fogged with no point of view to fog it from",
                row[0], row[1]
            );
        }
    }

    #[test]
    fn the_fog_remembers_a_room_after_leaving_it() {
        init_quiet(1);
        // Separate exports for the same number, so the page can assert this
        // rather than assume it -- which is what this line is.
        assert_eq!(vis_len(), map_len(), "the fog and the tiles disagree in length");
        assert_eq!(vis_bytes().len(), map_bytes().len());

        let (hx, hy) = hero();
        assert_eq!(fog_at(hx, hy), 2, "the hero is standing in the dark");
        let before = vis_bytes();
        assert!(
            before.contains(&0),
            "a 68x45 level opened with nothing left hidden from 9.6 units of sight"
        );
        assert!(
            !before.contains(&1),
            "a level arrived already carrying somebody else's memory of it"
        );
        let lit: Vec<usize> = before
            .iter()
            .enumerate()
            .filter(|&(_, &v)| v == 2)
            .map(|(cell, _)| cell)
            .collect();

        // Then walk out of the starting room.
        let (tx, ty) = walkable_near_hero(9.0, 0.45);
        walk_to(tx, ty, 0.6, 1_200);
        assert_eq!(depth(), 0, "the walk found the way out and changed floor");
        assert!(
            distance_from_hero(hx, hy) > 4.0,
            "never went anywhere: {:?}",
            hero()
        );

        let after = vis_bytes();
        // **Nothing once seen ever goes back to unseen.** That is the whole of
        // the remembered half of the fog, and it is the one assertion here that
        // does not depend on the shape of one generated floor plan.
        for &cell in &lit {
            assert_ne!(after[cell], 0, "tile {cell} was seen and then forgotten");
        }
        assert!(
            lit.iter().any(|&cell| after[cell] == 1),
            "walked {} units and left none of the starting room behind as dim",
            distance_from_hero(hx, hy)
        );
        assert!(after.contains(&2), "the hero went blind on the way");
    }

    #[test]
    fn descending_forgets_the_floor() {
        init_quiet(1);
        // Walk first, so there is a floor's worth of memory to forget. Without
        // this the assertion below would hold against a `descend` that cleared
        // nothing at all, because a level nobody has explored has no dim tiles
        // either.
        let (hx, hy) = hero();
        let (tx, ty) = walkable_near_hero(9.0, 0.45);
        walk_to(tx, ty, 0.6, 1_200);
        assert_eq!(depth(), 0, "the walk found the way out and changed floor");
        assert!(
            distance_from_hero(hx, hy) > 4.0,
            "never went anywhere: {:?}",
            hero()
        );
        let dim = vis_bytes().iter().filter(|&&v| v == 1).count();
        assert!(dim > 0, "the hero left nowhere behind to be forgotten");

        let revision = vis_revision();
        assert_eq!(descend(), 1, "never descended");

        let after = vis_bytes();
        assert_eq!(
            after.iter().filter(|&&v| v == 1).count(),
            0,
            "floor 2 arrived pre-explored, carrying {dim} tiles of floor 1's memory"
        );
        assert!(after.contains(&2), "floor 2 arrived blind");
        assert_ne!(vis_revision(), revision, "a new floor kept the old fog revision");
        assert_eq!(vis_len(), map_len(), "the new floor's two buffers disagree");
    }

    #[test]
    fn the_visible_set_is_recomputed_only_when_the_hero_crosses_a_tile() {
        // The cache key is the hero's *tile*, and it is exact rather than
        // approximate: a tile-granular answer can only change on a tile boundary.
        // What that buys is the whole cost argument -- some 450 raycasts a
        // recompute, paid a few times a second at a run instead of once per
        // `publish`, which is once per export call.
        init_quiet(1);
        assert_eq!(vis_len(), map_len());

        // **The control policy is what "stationary" means now.** With nobody in
        // its observation the embodied script walks the way it is facing --
        // deliberately, because the shipped duel spawns two bodies further apart
        // than either can see and a policy that waited to be seen would never
        // fight anybody. So a fixture that wants a body that does not move asks
        // for the control condition by name.
        set_policy(0, PolicyKind::Neutral.code());
        let standing = hero();
        let revision = vis_revision();
        let bytes = vis_bytes();
        step(120);
        assert_eq!(hero(), standing, "the stationary fixture moved after all");
        assert_eq!(
            vis_revision(),
            revision,
            "two seconds of `step` rebuilt the fog under a hero that had not moved"
        );
        assert_eq!(vis_bytes(), bytes, "the fog changed without saying so");

        // And a tile crossing is exactly when it does move.
        let (tx, ty) = walkable_near_hero(4.0, 0.45);
        walk_to(tx, ty, 0.6, 900);
        assert!(
            distance_from_hero(standing.0, standing.1) > 1.0,
            "never walked anywhere: {:?}",
            hero()
        );
        assert_ne!(
            vis_revision(),
            revision,
            "the hero changed tile and the fog did not notice"
        );
    }

    // ----------------------------------------------------------- the furniture

    #[test]
    fn dungeon_object_v1_preserves_every_word_and_identity_domain() {
        let view = sim::DungeonObjectView {
            kind: sim::DungeonObjectKind::Barrel,
            identity: 7,
            state_flags: 3,
            position: Vec2::new(Fx::from_raw(-11), Fx::from_raw(12)),
            yaw: Angle::from_raw(13),
            half_extents: Vec2::new(Fx::from_raw(14), Fx::from_raw(15)),
            hp: Fx::from_raw(16), max_hp: Fx::from_raw(17),
            progress: Fx::from_raw(18), material_code: 19,
        };
        assert_eq!(dungeon_object_row(view, DUNGEON_OBJECT_PROP_ID_BASE | view.identity), [
            3, 0x3000_0007, 3, (-11i32) as u32, 12, 13, 14, 15, 16, 17, 18, 19,
        ]);
        assert_eq!(dungeon_object_layout_version(), 1);
        assert_eq!(dungeon_object_stride(), 12);
        assert_eq!(dungeon_object_capacity(), 512);
    }

    /// The dungeon-object section is doors, then torches, then props, each in
    /// its own identity domain.
    ///
    /// **The prop third of it is empty on this floor, and that is `crates/sim`'s
    /// decision rather than this host's.** `generate_dungeon_props` builds
    /// barrels, pottery, webs and water behind a `dressed` flag that is `false`,
    /// and its own comment carries the argument: breaking a prop died with the
    /// legacy blade, while prop collision and web-and-water slowing both still
    /// work for any body, so dressing the floor today would stand unbreakable
    /// furniture on it. **This paragraph said the gate was a match on
    /// `CombatModel::Legacy`, and it was wrong** -- the model dropped out of that
    /// decision when the legacy one was deleted and the flag stayed behind. So
    /// the whole prop layer is absent from the browser game until the flag is
    /// revisited, and this test says so in place rather than quietly asserting
    /// two thirds of its own name.
    #[test]
    fn a_generated_floor_publishes_doors_then_torches_then_props() {
        init(1);
        let rows = dungeon_objects();
        assert!(!rows.is_empty(), "a generated floor published no dungeon objects");
        assert_eq!(dungeon_objects_dropped(), 0, "the shipped floor exceeded its object ABI");
        let kinds: Vec<u32> = rows.iter().map(|row| row[DUNGEON_OBJECT_KIND]).collect();
        let first_torch = kinds.iter().position(|&kind| kind == DUNGEON_OBJECT_TORCH).unwrap();
        assert!(kinds[..first_torch].iter().all(|&kind| kind == DUNGEON_OBJECT_DOOR));
        assert!(kinds[first_torch..].iter().all(|&kind| kind == DUNGEON_OBJECT_TORCH));
        assert!(rows[..first_torch].iter().all(|row| row[DUNGEON_OBJECT_IDENTITY] >> 28 == 1));
        assert!(rows[first_torch..].iter().all(|row| row[DUNGEON_OBJECT_IDENTITY] >> 28 == 2));
        assert!(
            !kinds.iter().any(|&kind| kind >= DUNGEON_OBJECT_BARREL),
            "a prop reached the page on a floor `crates/sim` does not dress",
        );
    }

    #[test]
    fn every_doorway_reaches_the_page_as_one_record_a_tile() {
        init(1);
        let stride = furniture_stride() as usize;
        assert_eq!(stride, FURNITURE_STRIDE, "the stride export disagrees with the constant");
        assert!(
            furniture().len() <= FURNITURE_MAX,
            "{} records in a {FURNITURE_MAX}-record buffer",
            furniture().len()
        );
        for record in furniture() {
            assert!(
                record[0] == FURNITURE_DOOR || record[0] == FURNITURE_TORCH,
                "an unknown furniture kind {} reached the page",
                record[0]
            );
        }
        let records = furniture_of(FURNITURE_DOOR);
        assert!(
            !records.is_empty(),
            "a generated level published no doorways at all"
        );

        let (cols, rows) = (map_cols() as usize, map_rows() as usize);
        let tiles = map_bytes();
        for record in &records {
            let (tx, ty) = (record[1] as usize, record[2] as usize);
            assert!(tx < cols && ty < rows, "a doorway at ({tx}, {ty}) is off the level");
            assert_eq!(record[3], 0, "a level opened with a door already open");
            // The pairing that makes the two buffers one picture: a shut door is
            // solid, so the tile buffer calls it rock and the page draws a block
            // -- in the door's own tone, because this record says it is a door.
            assert_eq!(
                tiles[ty * cols + tx],
                1,
                "the tile buffer calls the doorway at ({tx}, {ty}) floor while it is shut"
            );
        }

        // And the count is the doorways' own, not a number this file invented:
        // ~17 doorways of 3 tiles each is what `world-06` measured over 240
        // levels. The bound is loose on purpose -- what is being checked is that
        // the buffer holds a level's worth of doorways and not one, or all of
        // them run together into a single record.
        assert!(
            records.len() >= 12,
            "a 68x45 level published only {} door tiles",
            records.len()
        );
    }

    // **`a_door_that_opens_flips_its_record_rather_than_losing_it` has no world
    // left to run on, and the reason is a `crates/sim` gap this session found
    // rather than made.** `World::press_doors` reads `self.command[i].move_dir`
    // -- the *legacy* command column -- and nothing writes that column on a
    // world with articulated columns: `World::submit` refuses one outright and
    // `submit` stores into `command_core` instead. So on the
    // floor `init` opens, no body can lean on a door, `Dungeon::open_door` is
    // unreachable from this host, and the branch in `Sim::advance` that bumps
    // the map and furniture revisions when the plan changes is dead code.
    //
    // A Legacy fixture is not the way out either: `Sim::advance` submits every
    // command through `submit`, which refuses a Legacy world, so
    // nobody on one would move at all.
    //
    // What is lost with it: that an opened door flips its furniture record's
    // state byte rather than losing the record, and that both revisions move
    // when it does. `a_level_with_no_doorway_publishes_no_furniture` and
    // `every_doorway_reaches_the_page_as_one_record_a_tile` still cover the shut
    // half. Whoever gives an embodied body a way to press a door owes this test
    // back.

    #[test]
    fn the_furniture_crosses_once_a_level_and_not_once_a_frame() {
        init(1);
        let revision = furniture_revision();
        let records = furniture();

        // A tick, an input and a slider all leave it alone -- `publish` runs on
        // every one of them, which is the mistake this guards.
        step(120);
        set_input(1_000, 0, 0, 0, 0, 0, 0);
        set_hero_stat(0, 9);
        assert_eq!(furniture_revision(), revision, "the furniture moved under a slider");
        assert_eq!(furniture(), records);

        // And a new floor is exactly when it does move. A different floor plan is
        // a different set of doorways, and the buffer that is still holding the
        // last floor's would draw them over this one's rock.
        assert_eq!(descend(), 1);
        assert_ne!(furniture_revision(), revision, "a new floor kept the old furniture");
        assert!(!furniture().is_empty(), "floor 2 published no doorways");
    }

    #[test]
    fn a_level_with_no_doorway_publishes_no_furniture() {
        // The empty case, and it is not hypothetical: `Dungeon::open` is every
        // duel the lab runs, and `init_walled` is a fixture in this file. A
        // length that was only ever written when there was something to write
        // would leave the last level's records live.
        init(1);
        assert!(!furniture().is_empty(), "the generated level has doorways");
        init_walled();
        assert_eq!(furniture_len(), 0, "a carved level with no doors published some");
    }

    #[test]
    fn legacy_furniture_keeps_only_the_two_torch_faces_it_can_name() {
        // `world-06` promised the next piece of scenery would be a *kind* here
        // and not a third pair of exports. This is that, asserted from the
        // page's side: one buffer, two kind codes, one stride. Full-cardinal
        // mounts now belong to DUNGEON_OBJECT_V1; this compatibility buffer
        // keeps only the two meanings its state byte has always named.
        init(1);
        let torches = furniture_of(FURNITURE_TORCH);
        let doors = furniture_of(FURNITURE_DOOR);
        assert!(!torches.is_empty(), "a generated level published no torches");
        assert_eq!(
            torches.len() + doors.len(),
            furniture().len(),
            "a record that is neither a doorway nor a torch reached the page"
        );

        // Doors first, then torches, so the records that can change state
        // mid-level keep fixed indices. See `write_furniture`.
        let records = furniture();
        let first_torch = records.iter().position(|r| r[0] == FURNITURE_TORCH).unwrap();
        assert!(
            records[first_torch..].iter().all(|r| r[0] == FURNITURE_TORCH),
            "the two kinds are interleaved"
        );

        let (cols, rows) = (map_cols() as usize, map_rows() as usize);
        let tiles = map_bytes();
        for record in &torches {
            let (tx, ty) = (record[1] as usize, record[2] as usize);
            assert!(tx < cols && ty < rows, "a torch at ({tx}, {ty}) is off the level");
            // The pairing that makes the picture: the tile it hangs on is solid
            // in the tile buffer, so the page has a block to nail it to, and the
            // tile its face looks at is floor, so `wallBlock` emitted that face.
            assert_eq!(tiles[ty * cols + tx], 1, "the torch at ({tx}, {ty}) is on floor");
            let (dx, dy) = match record[3] {
                TORCH_FACE_POS_X => (1, 0),
                TORCH_FACE_POS_Y => (0, 1),
                other => panic!("a torch reached the page facing {other}"),
            };
            assert_eq!(
                tiles[(ty + dy) * cols + tx + dx],
                0,
                "the torch at ({tx}, {ty}) faces rock, so it has no wall face to hang on"
            );
        }
    }

    #[test]
    fn a_level_with_no_torches_publishes_none() {
        // The fixtures, and every duel the lab runs: a hand-built scenario
        // carries no torch list, so nothing here invents one. The failure this
        // guards is the last generated level's lights drawn over a fixture --
        // the same one `a_level_with_no_doorway_publishes_no_furniture` guards
        // for the other kind, and it is a separate test because the two lists
        // arrive by different routes.
        init(1);
        assert!(
            !furniture_of(FURNITURE_TORCH).is_empty(),
            "the generated level has torches"
        );
        init_walled();
        assert!(
            furniture_of(FURNITURE_TORCH).is_empty(),
            "a hand-built level published torches"
        );
    }

    #[test]
    fn a_torch_never_moves_once_the_level_is_open() {
        // A door's state byte changes and a torch's cannot: there is nothing in
        // the game that lights, carries or puts out a torch, which is stated in
        // `world-07` as explicitly not in the session. So the records must be
        // identical across a door opening -- the one event that rewrites this
        // buffer mid-level -- and that is what lets the page treat a torch's
        // baked geometry as good for the life of the floor.
        init(1);
        let before = furniture_of(FURNITURE_TORCH);
        step(600);
        assert_eq!(furniture_of(FURNITURE_TORCH), before, "the torches moved");
        assert_eq!(descend(), 1);
        assert!(
            !furniture_of(FURNITURE_TORCH).is_empty(),
            "floor 2 published no torches"
        );
        assert_ne!(
            furniture_of(FURNITURE_TORCH),
            before,
            "a new floor kept the last one's torches"
        );
    }

    #[test]
    fn a_spawn_never_lands_in_the_masonry() {
        for seed in 1..6u32 {
            init(seed);
            for press in 0..40 {
                if spawn_monster(SKITTERER, SLOT_EMPTY, SLOT_EMPTY) == 0 {
                    break;
                }
                let monster = monsters().last().expect("nothing arrived").clone();
                assert!(
                    walkable(monster[0], monster[1], monster[3]),
                    "seed {seed} press {press}: landed in the rock at ({}, {})",
                    monster[0],
                    monster[1]
                );
                step(3);
            }
        }
    }

    #[test]
    fn the_frame_is_bounded_by_what_the_world_can_hold() {
        // `write_frame` indexes past the units, then past the arrows, then past
        // the events, so the ceiling and the array length have to agree exactly
        // across all three blocks. A section added to the buffer and forgotten
        // here is an out-of-bounds index in the one function the page cannot
        // survive panicking in.
        assert_eq!(
            FRAME_MAX,
            HEADER_LEN
                + MAX_UNITS * UNIT_STRIDE
                + MAX_SHOTS * SHOT_STRIDE
                + MAX_EVENTS * EVENT_STRIDE
        );
        // The frame cannot be asked for more arrows than the world can hold.
        assert_eq!(MAX_SHOTS, sim::MAX_SHOTS);

        // And the event block cannot be overrun by the busiest room this page
        // can open. Sixty-three monsters around one hero for a thousand ticks is
        // well past anything a player produces, and `push_event` has to hold the
        // ceiling through all of it.
        //
        // **`init` and not `init_quiet`, and the difference is the whole value
        // of the number this prints.** A quiet level's Brutes converge, kill the
        // hero and then have nothing to swing at -- and a room where nothing is
        // swinging is a room with almost no events in it, which measured 28 and
        // meant nothing. A generated level keeps a roster that fights, and the
        // same sweep then reads 72. See [`MAX_EVENTS`] for the table.
        init(1);
        for _ in 0..MAX_UNITS {
            spawn_monster(BRUTE, SLOT_EMPTY, SLOT_EMPTY);
        }
        let mut busiest = 0;
        for _ in 0..125 {
            // Eight at a time, which is the client's own catch-up ceiling and
            // therefore the most events one published frame can be asked for.
            step(8);
            busiest = busiest.max(frame()[8] as usize);
            assert!(frame_len() as usize <= FRAME_MAX, "the frame overran itself");
            assert_eq!(frame_len() as usize, frame_span(), "the counts disagree");
            // The other half, and the one that would catch an undersized cap
            // rather than merely an overrun one: `busiest <= MAX_EVENTS` is
            // true by construction because `push_event` enforces it, so it is
            // the *drop count* that says whether the ceiling was ever reached.
            assert_eq!(frame()[14], 0.0, "the feed was truncated in a room of brutes");
        }
        println!("busiest frame carried {busiest} events of {MAX_EVENTS}");
        assert!(busiest > 0, "a room full of brutes produced no events at all");
        assert!(busiest <= MAX_EVENTS);
    }

    // ------------------------------------------------------------- spawning

    const BRUTE: u32 = 2;
    const SKITTERER: u32 = 3;

    #[test]
    fn a_monster_walks_in_and_takes_the_next_row_of_the_frame() {
        init_quiet(1);
        assert_eq!(frame()[6], 1.0, "the room did not open with one hero");

        assert_eq!(spawn_monster(SKITTERER, SLOT_EMPTY, SLOT_EMPTY), 1, "nothing arrived");
        let live = frame();
        assert_eq!(live[6], 2.0, "unit_count");
        assert_eq!(live.len(), HEADER_LEN + 2 * UNIT_STRIDE);
        assert_eq!(live[8], 0.0, "a spawn is not an event");
        assert_eq!(frame_len() as usize, live.len());

        let monster = &monsters()[0];
        assert_eq!(monster[6], 1.0, "faction: Monsters");
        assert_eq!(monster[7], 3.0, "kind: Skitterer");
        assert_eq!(monster[4], monster[5], "arrived already wounded");
        assert!((monster[3] - 0.30).abs() < 0.001, "radius {}", monster[3]);
        // A fresh slot, so a fresh index -- and a generation of zero, which is
        // what tells the client this is not a reused handle.
        assert_eq!(monster[9], 1.0, "entity_index");
        assert_eq!(monster[10], 0.0, "entity_generation");

        assert_eq!(spawn_monster(BRUTE, SLOT_EMPTY, SLOT_EMPTY), 2, "the second one did not arrive");
        assert_eq!(frame()[6], 3.0);
        assert_eq!(monsters()[1][7], 2.0, "kind: Brute");
    }

    #[test]
    fn an_unrecognised_kind_code_is_a_skitterer_rather_than_a_trap() {
        init_quiet(1);
        assert_eq!(spawn_monster(9_999, SLOT_EMPTY, SLOT_EMPTY), 1);
        assert_eq!(monsters()[0][7], 3.0, "kind: Skitterer");
    }

    #[test]
    fn a_newcomer_lands_a_walk_away_and_inside_the_wall() {
        // Swept rather than spot-checked, because the interesting case is the
        // one the arc sweep exists for: a hero pinned in a corner, where most
        // bearings put the ring outside the room entirely.
        let corners = [(0, 0), (24_000, 0), (0, 16_000), (24_000, 16_000)];
        for seed in 1..12u32 {
            for (i, &(cx, cy)) in corners.iter().enumerate() {
                init_quiet(seed);
                // Driven at the corner rather than ordered to it. It does not
                // have to *arrive*: what the sweep is being pinned against is a
                // hero pressed as far into a corner as the floor plan allows,
                // and the walls do the rest.
                walk_to(cx as f32 / 1000.0, cy as f32 / 1000.0, 0.5, 200 + i as u32 * 7);
                let hero = hero_row().expect("the hero is gone");

                for kind in [BRUTE, SKITTERER] {
                    assert!(spawn_monster(kind, SLOT_EMPTY, SLOT_EMPTY) > 0);
                    let monster = monsters().last().expect("nothing arrived").clone();
                    let d = distance(&monster, &hero);
                    let radius = monster[3];

                    assert!(
                        d >= 6.0 - 0.001,
                        "seed {seed} corner {i}: landed {d} from the hero, on top of it",
                    );
                    // The upper bound is the ring plus one, not the ring: the
                    // clamp pins a body to *its own* reachable box, and a Brute's
                    // box is 0.25 tighter than a Fighter's on every side, so a
                    // hero standing against a wall can be pushed marginally
                    // further from a newcomer than the roll asked for.
                    assert!(
                        d <= 10.0,
                        "seed {seed} corner {i}: landed {d} away, out of the band",
                    );
                    assert!(
                        monster[0] >= radius - 0.001
                            && monster[0] <= arena().0 - radius + 0.001
                            && monster[1] >= radius - 0.001
                            && monster[1] <= arena().1 - radius + 0.001,
                        "seed {seed} corner {i}: landed outside the level at \
                         ({}, {}) with radius {radius}",
                        monster[0],
                        monster[1],
                    );
                    // And the stronger claim, which the arena box stopped
                    // being able to make once the level had masonry in it.
                    assert!(
                        walkable(monster[0], monster[1], radius),
                        "seed {seed} corner {i}: landed in the rock at ({}, {})",
                        monster[0],
                        monster[1],
                    );
                }
            }
        }
    }

    #[test]
    fn two_presses_on_one_tick_are_two_different_monsters() {
        // The counter's whole job. Keyed on the tick alone, both of these would
        // be rolled from the same stream and land on the same pixel -- and two
        // presses inside one animation frame is not a contrived case, it is what
        // a double click is.
        init_quiet(1);
        spawn_monster(SKITTERER, SLOT_EMPTY, SLOT_EMPTY);
        spawn_monster(SKITTERER, SLOT_EMPTY, SLOT_EMPTY);
        let monsters = monsters();
        assert_eq!(monsters.len(), 2);
        assert!(
            distance(&monsters[0], &monsters[1]) > 0.001,
            "both landed at ({}, {})",
            monsters[0][0],
            monsters[0][1],
        );
    }

    #[test]
    fn the_same_presses_at_the_same_ticks_produce_the_same_room() {
        fn script() -> (u32, u64, Vec<f32>) {
            init_quiet(3);
            step(37);
            spawn_monster(SKITTERER, SLOT_EMPTY, SLOT_EMPTY);
            step(120);
            spawn_monster(BRUTE, SLOT_EMPTY, SLOT_EMPTY);
            step(300);
            (tick(), hash(), frame())
        }
        assert_eq!(script(), script(), "the same run diverged from itself");

        // And *when* the button was pressed is part of the run, not incidental.
        init_quiet(3);
        step(38);
        spawn_monster(SKITTERER, SLOT_EMPTY, SLOT_EMPTY);
        step(119);
        spawn_monster(BRUTE, SLOT_EMPTY, SLOT_EMPTY);
        step(300);
        assert_ne!(hash(), script().1, "the tick a monster arrives on is free");
    }

    #[test]
    fn a_spawn_moves_the_world_and_the_scripted_walk_still_does_not() {
        // The additivity check, in one test. A spawn *must* change the state
        // hash -- a new body is new state -- and a run that never spawns must be
        // untouched by the fact that spawning now exists.
        //
        // **Against itself rather than against a pinned number.** `ROOM_HASH`
        // was the constant here, and it was a Legacy fixture driven through the
        // order channel; both are gone. What it was buying is the *comparison*,
        // and a script run twice buys the same one without a number anybody has
        // to re-record -- which is also what makes this test able to say
        // "spawning perturbed a run that never spawned" rather than "some hash
        // moved".
        let walk = || {
            init(1);
            step(600);
            hash()
        };
        let clean = walk();
        assert_ne!(clean, 0, "the walk left the world untouched");

        spawn_monster(SKITTERER, SLOT_EMPTY, SLOT_EMPTY);
        assert_ne!(hash(), clean, "a new body left the world unchanged");

        // Run again from scratch. This is the half that would catch a spawn
        // counter that had been put in `World` instead of beside it.
        assert_eq!(walk(), clean, "spawning perturbed a run that never spawned");
    }

    #[test]
    fn the_hero_and_a_newcomer_close_and_trade_blows() {
        // The test that would have caught the trap in `spawn_monster`: an entity
        // that is never pushed onto `Sim::units` still thinks, moves and fights,
        // so the only way to see the mistake is to look at the frame rather than
        // at the world -- which is exactly what the player does.
        init_quiet(1);
        spawn_monster(SKITTERER, SLOT_EMPTY, SLOT_EMPTY);
        let start = monsters()[0].clone();

        let mut closest = f32::MAX;
        let mut wounded = false;
        let mut contacts = 0u32;
        // **One tick at a time, and the gap tracked rather than sampled.** A
        // thirty-tick stride is fifteen body lengths of an embodied approach, so
        // a pass that closes and separates between two samples reads as a pass
        // that never closed -- which is exactly what the exact-law build looked
        // like from here before the gap was measured instead of tested.
        for _ in 0..3_600 {
            step(1);
            // Rows, not words: `combat_event_len` is already a row count.
            contacts += combat_event_len();
            if let (Some(hero), Some(monster)) = (hero_row(), monsters().first()) {
                closest = closest.min(distance(&hero, monster));
                if monster[4] < monster[5] || hero[4] < hero[5] {
                    wounded = true;
                }
            }
        }

        assert!(closest < 2.0, "the two never got within reach: closest was {closest}");
        // **The blade is legible in the *contact* publication, not in the unit
        // row.** `limb_reach` and `limb_spin` are the legacy limb's columns and
        // are inert on a body with joints; what a page draws a blow from now is
        // the combat-event section, and a fight that produced none of those rows
        // is a fight that never happened whatever the two bodies were doing.
        assert!(contacts > 0, "the two closed and nothing ever touched");
        assert!(wounded, "the two traded contacts and neither took a scratch");
        println!(
            "skitterer entered at ({}, {}), closest {closest}, {contacts} contacts, hero {} at tick {}",
            start[0],
            start[1],
            hero_row().map_or_else(|| "fallen".to_string(), |row| format!("on {} hp", row[4])),
            tick(),
        );
        // **What is deliberately not asserted is who wins, or that anybody
        // does.** An embodied duel between the two shipped anatomies is decided
        // by a body 7.8% of the time inside 3,600 ticks under the default law,
        // and the exact law is a different fight again -- it finishes this one,
        // with the Fighter losing. Requiring either outcome would be pinning the
        // seed and the feature flag. What this test is for is that a body walked
        // in from the boundary *fights*, which is the trap in `spawn_monster` it
        // was written against: an entity missing from `Sim::units` thinks, moves
        // and fights while being invisible in the frame.
    }

    /// The seeds a fixture opens on when what it needs from the room is a
    /// **death** under the explicit death rig below.
    ///
    /// **They were all `1`, and `1` stopped killing when the dungeon default
    /// moved.** The old sweep below was tactical against tactical and is kept as
    /// history; death is a semantic prerequisite for these host tests, not a
    /// balance claim about whichever policy the page happens to open on. The rig
    /// now names Neutral Heroes and Scripted Monsters before it spawns anybody,
    /// so a registry default or tactical mechanics change cannot silently turn
    /// every replacement test into a fight-balance test.
    ///
    /// Historical tactical/tactical sweep, measured rather than hunted by hand:
    /// seeds 1 through 24, twelve
    /// Brutes, eighteen thousand ticks: nine reach a death and fifteen do not.
    /// Then those nine again one tick at a time, which is the tick each
    /// character fell on:
    ///
    /// ```text
    /// seed    2     3     5     7     9    10    15    16    24
    /// fell 11517 12985 16635 13778 11403 16782  7221  3512 17667
    /// ```
    ///
    /// The four below were retained across the isolation so the replacement
    /// placement sweep still crosses the same four floor plans. Re-measured
    /// under Neutral/Scripted with twelve Brutes and the same 18,000-tick bound,
    /// in fastest-first order: seed 15 falls at 2,970, seed 2 at 3,210, seed 9
    /// at 4,260 and seed 16 at 13,680. Cost is a correctness argument here:
    /// three fixtures run a fall one tick at a time. Four is also the width
    /// `a_replacement_lands_where_the_last_one_fell` needs, because where a body
    /// falls is a fact about the floor plan it was chased across.
    ///
    /// The policy assignments happen after any warmup and before the attackers
    /// spawn, so a warmup can no longer turn the prerequisite into another
    /// matchup.
    const FATAL_SEEDS: [u32; 4] = [15, 2, 9, 16];

    /// The one of [`FATAL_SEEDS`] a fixture takes when it needs a single death
    /// and does not care which floor it happens on.
    const FATAL_SEED: u32 = FATAL_SEEDS[0];

    /// The seed the two fixtures that **edit the sheet before the death** open
    /// on.
    ///
    /// **This used to differ from [`FATAL_SEED`] and no longer may.** A tactical
    /// Fighter reads perception and intellect, so editing the sheet changed the
    /// old death fight and needed a separately swept seed. The explicit rig puts
    /// Neutral on the Hero side: the sheet remains the state under test, but it
    /// cannot tune the prerequisite that removes the body wearing it. Keeping a
    /// second value would preserve a distinction the fixture deliberately
    /// removed.
    ///
    /// The retired tactical/tactical sweep needed seed 8: it was the only seed
    /// among 1 through 24 that killed under both sheet edits. That result is
    /// historical provenance for why this constant once existed, not a second
    /// current death coordinate.
    const SHEETED_FATAL_SEED: u32 = FATAL_SEED;

    /// Installs the one matchup every death-dependent host fixture owns and
    /// spawns its attackers.
    ///
    /// Neutral against Scripted is deliberately asymmetric. The subject does
    /// not defend, while the attackers exercise the real embodied command path;
    /// a test cannot pass because twelve inert bodies happened to overlap. Both
    /// assignments are asserted through the exports the page uses, so deleting
    /// either line fails before a long loop can hide which default leaked in.
    fn arm_death_rig() {
        assert_eq!(set_policy(0, PolicyKind::Neutral.code()), 1,
            "the death rig could not make the Hero neutral");
        assert_eq!(set_policy(1, PolicyKind::Scripted.code()), 1,
            "the death rig could not give the Monsters their script");
        assert_eq!(policy_kind(0), PolicyKind::Neutral.code(),
            "the death rig inherited the Hero default");
        assert_eq!(policy_kind(1), PolicyKind::Scripted.code(),
            "the death rig inherited the Monster default");
        for _ in 0..12 {
            spawn_monster(BRUTE, SLOT_EMPTY, SLOT_EMPTY);
        }
    }

    /// Kills whoever is standing on the hero's side, and answers whether it
    /// worked. Twelve brutes is not subtle, and it should not be.
    ///
    /// Twelve and 18,000 remain measured inputs rather than a widened escape
    /// hatch. All four [`FATAL_SEEDS`] die under the explicit rig at ticks 2,970,
    /// 3,210, 4,260 and 13,680 with a thirty-tick sampler; the slowest still has
    /// 4,320 ticks of margin. The bound did not move when the policy dependency
    /// was removed.
    fn kill_the_hero() -> bool {
        arm_death_rig();
        for _ in 0..300 {
            step(60);
            if hero_row().is_none() {
                return true;
            }
        }
        false
    }

    /// **The sheet outlives the body.** An attribute is the one thing on the
    /// Hero rail the player has to think about, and it used to be thrown away by
    /// whatever killed them: `swap_in_hero` built its replacement out of
    /// `Body::base_stats()`, so every dial went back to the archetype default.
    #[test]
    fn a_stat_sheet_outlives_the_character_wearing_it() {
        // The alias is asserted in its declaration: sheet edits are the subject
        // here, while the Neutral Hero keeps them out of the death prerequisite.
        init_quiet(SHEETED_FATAL_SEED);
        assert_eq!(set_hero_stat(3, 14), 1, "perception would not move");
        assert_eq!(set_hero_stat(2, 17), 1, "intellect would not move");
        assert_eq!(hero_stat(3), 14);

        assert!(kill_the_hero(), "twelve brutes could not kill one fighter");

        // Dead, and the rail is still describing something real: the sheet the
        // next character walks in wearing, which is what the player is choosing
        // between at exactly this moment.
        assert_eq!(hero_stat(3), 14, "the sheet died with the character");
        assert_eq!(hero_stat(2), 17);
        assert_eq!(hero_body(), FIGHTER, "the body died with the character");
        // And still editable, which is the other half of the point. There is
        // nobody to write to, so this is the plan alone.
        assert_eq!(set_hero_stat(0, 11), 1, "the rail went read-only with the corpse");
        assert_eq!(hero_stat(0), 11);

        assert_eq!(swap_in_hero(FIGHTER, SLOT_EMPTY, SLOT_EMPTY), 1, "nobody arrived");
        assert_eq!(hero_stat(3), 14, "the replacement did not inherit the sheet");
        assert_eq!(hero_stat(2), 17);
        assert_eq!(hero_stat(0), 11, "an edit made while dead was thrown away");
        // The live entity, not just the plan: the two have to agree once there
        // is a body to agree about, or the rail is describing a fighter that is
        // not the one in the room.
        let hero = with_sim(None, |sim| sim.hero()).expect("no hero after a swap");
        let stats = with_sim(None, |sim| sim.world.stats(hero)).expect("a hero with no stats");
        assert_eq!(i32::from(stats.perception), 14);
        assert_eq!(i32::from(stats.vitality), stat_of(stats, 4));
    }

    /// The one thing that *does* reset the sheet, and deliberately: a Rogue
    /// wearing a Fighter's numbers is a different request from "keep my
    /// attributes", and `UnitSpec::set_body` is where that is decided.
    ///
    /// **Asked at the door rather than from the rail.** `set_hero_body` was the
    /// export that made this claim, and it is gone -- `World::set_body` refuses
    /// an embodied world, so a body change is a body that walks in. The rule it
    /// was testing is the same rule and it is still `Sim::swap_in_hero`'s.
    #[test]
    fn changing_the_body_rebuilds_the_sheet_it_is_a_sheet_for() {
        // The same isolated death coordinate as the sibling sheet test.
        init_quiet(SHEETED_FATAL_SEED);
        set_hero_stat(3, 14);
        assert!(kill_the_hero(), "twelve brutes could not kill one fighter");

        assert_eq!(swap_in_hero(ROGUE, SLOT_EMPTY, SLOT_EMPTY), 1, "the room refused a Rogue");
        assert_eq!(hero_body(), ROGUE);
        assert_eq!(
            hero_stat(3),
            i32::from(Body::Rogue.base_stats().perception),
            "a Rogue walked in wearing a Fighter's perception"
        );
        // **And its kit is the floor's rather than the archetype's.** A Rogue's
        // own `Shortsword` has no equipment row in `CombatSpecTableV1::fixtures`,
        // so `equip_articulated` puts a sword in its hand on the way through the
        // door; see that function for why the mapping is total.
        assert_eq!(hero_loadout(0), sim::ActionKind::Sword.code(), "and the floor's kit");
    }

    #[test]
    fn enough_monsters_kill_the_hero_and_the_frame_still_has_something_to_draw() {
        // The page has to say something when the character falls, so the state
        // it says it about needs to be reachable. The assertion is that death is
        // representable, not that any particular fight is balanced.
        init_quiet(FATAL_SEED);
        let fell = kill_the_hero();
        println!("the hero fell at tick {}", tick());
        assert!(fell, "twelve brutes could not kill one fighter");
        assert!(hero_row().is_none());
        assert!(frame()[6] > 0.0, "nothing left to draw");
        // Every remaining row is a monster, and the frame is still well formed.
        // Through `frame_span` rather than the units alone: the last step that
        // killed the character produced the blow that did it, and that blow is
        // now a row in the third section.
        assert_eq!(frame().len(), frame_span());
        assert_eq!(frame()[6], monsters().len() as f32);
    }

    #[test]
    fn the_room_stops_taking_monsters_when_the_frame_is_full() {
        init_quiet(1);
        let mut refused = 0;
        for _ in 0..100 {
            if spawn_monster(SKITTERER, SLOT_EMPTY, SLOT_EMPTY) == 0 {
                refused += 1;
            }
        }
        assert_eq!(
            frame()[6],
            MAX_UNITS as f32,
            "the frame is holding more or fewer than its ceiling"
        );
        // One hero plus MAX_UNITS - 1 monsters fills it; the rest bounce.
        assert_eq!(refused, 100 - (MAX_UNITS - 1));
        assert!(frame_len() as usize <= FRAME_MAX);
    }

    /// A handle that no longer resolves is swept out of the roster by the next
    /// spawn, rather than holding a place in a frame that has room for 64.
    ///
    /// **The corpse is the hero's now, and the swap is which body dies.** This
    /// used to spawn one Skitterer and let the Fighter finish it, which an
    /// embodied fight will not do inside a test budget -- see
    /// `kill_the_hero`'s note. Twelve brutes killing the Fighter leaves exactly
    /// the same thing behind: one entry in `Sim::units` that `World::view`
    /// answers `None` for, and a `walk_in` that must drop it before it pushes.
    /// Without the prune the roster only grows, so a long session of spawning
    /// and dying hits the ceiling on handles that resolve to nothing -- a full
    /// room with a handful of bodies in it.
    #[test]
    fn dead_monsters_stop_holding_a_place_in_the_roster() {
        init_quiet(FATAL_SEED);
        assert_eq!(roster_len(), 1);
        assert!(kill_the_hero(), "twelve brutes could not kill one fighter");
        assert!(hero_row().is_none(), "the hero survived its own funeral");
        // Twelve brutes and one dead Fighter: thirteen handles, twelve of which
        // resolve. The dead one is still in the list, which is what the next
        // line has to be able to see.
        assert_eq!(roster_len(), 13, "the dead handle went somewhere on its own");

        assert!(spawn_monster(SKITTERER, SLOT_EMPTY, SLOT_EMPTY) > 0);
        assert_eq!(
            roster_len(),
            13,
            "the corpse was not swept up before the spawn"
        );
        assert_eq!(frame()[6], 13.0, "the frame is drawing a body that is not there");
    }

    // ------------------------------------------------------------ swapping in

    const FIGHTER: u32 = 0;
    const ROGUE: u32 = 1;

    /// Six brutes and however long it takes. Answers the tick the character
    /// fell on, which is the state every test below starts from.
    fn fall_to_brutes() -> u32 {
        arm_death_rig();
        // Twelve and eighteen thousand ticks: see [`kill_the_hero`] for the
        // measurement that moved both.
        for _ in 0..600 {
            step(30);
            if hero_row().is_none() {
                return tick();
            }
        }
        panic!("twelve brutes could not kill one fighter");
    }

    /// The same, one tick at a time, answering the last place the hero was seen
    /// standing.
    ///
    /// A separate fixture rather than a widened [`fall_to_brutes`], because the
    /// step size is the whole of the difference and it is load-bearing here:
    /// thirty ticks of a brute leaning on a body is a couple of body lengths,
    /// and *where* it died is exactly what the caller is checking.
    fn fall_to_brutes_watching() -> (f32, f32) {
        arm_death_rig();
        let mut last = hero();
        // Twelve and eighteen thousand for [`kill_the_hero`]'s reason, measured
        // the same way.
        for _ in 0..18_000 {
            step(1);
            match hero_row() {
                Some(row) => last = (row[0], row[1]),
                None => return last,
            }
        }
        panic!("twelve brutes could not kill one fighter");
    }

    #[test]
    fn a_replacement_walks_into_the_room_the_last_one_died_in() {
        init_quiet(FATAL_SEED);
        let fallen = hero_row().expect("the room did not open with a hero");
        let at = fall_to_brutes();
        let standing = monsters().len();
        assert!(standing > 0, "nothing survived to be swapped in against");

        assert_eq!(swap_in_hero(FIGHTER, SLOT_EMPTY, SLOT_EMPTY), 1, "nobody arrived");
        let hero = hero_row().expect("the frame has no hero in it");
        assert_eq!(hero[6], 0.0, "faction: Heroes");
        assert_eq!(hero[7], 0.0, "kind: Fighter");
        assert_eq!(hero[4], 12.0, "hp: 4 + vitality 8");
        assert_eq!(hero[4], hero[5], "arrived already wounded");

        // The point of a swap rather than a restart: the room is exactly as it
        // was left, monsters and all, and the clock never went back to zero.
        assert_eq!(monsters().len(), standing, "the swap emptied the room");
        assert_eq!(tick(), at, "the swap moved the clock");
        assert_eq!(frame()[6], standing as f32 + 1.0, "unit_count");

        // A different body, and the identity columns have to say so. A slot
        // freed by a death is handed straight back out, so the index alone can
        // repeat -- it is the generation beside it that makes this readable as
        // a new character rather than the old one getting up.
        assert_ne!(
            (hero[9], hero[10]),
            (fallen[9], fallen[10]),
            "the replacement is wearing the dead character's handle"
        );
    }

    #[test]
    fn the_room_refuses_a_replacement_while_a_character_is_still_standing() {
        // Not a missing feature: one order channel, one character. Two heroes
        // would share the player's clicks, which is a worse thing to discover
        // mid-fight than a button that declines.
        init_quiet(1);
        assert_eq!(swap_in_hero(ROGUE, SLOT_EMPTY, SLOT_EMPTY), 0, "two characters, one order channel");
        assert_eq!(frame()[6], 1.0, "unit_count");
        assert_eq!(hero_row().expect("the hero is gone")[7], 0.0, "kind");

        // Still refused with the room full of enemies, which is exactly when a
        // player would press it hardest.
        spawn_monster(BRUTE, SLOT_EMPTY, SLOT_EMPTY);
        step(120);
        assert_eq!(swap_in_hero(FIGHTER, SLOT_EMPTY, SLOT_EMPTY), 0);
        assert_eq!(frame()[6], 2.0, "unit_count");
    }

    #[test]
    fn a_replacement_can_be_a_different_build_entirely() {
        // The reason this takes an archetype rather than just bringing the
        // fighter back. Same room, same monsters, same policy -- and a
        // character that thinks faster, sees further and dies sooner.
        init_quiet(FATAL_SEED);
        fall_to_brutes();
        assert_eq!(swap_in_hero(ROGUE, SLOT_EMPTY, SLOT_EMPTY), 1, "nobody arrived");

        let hero = hero_row().expect("the frame has no hero in it");
        assert_eq!(hero[7], 1.0, "kind: Rogue");
        // **The health bar is the anatomy's, not the sheet's.** `4 + vitality`
        // is the legacy rule and `World::max_health_of` routes a body with an
        // anatomy row through `anatomy::max_health` instead -- so a Rogue and a
        // Fighter, which take the same fixture frame, carry the same maximum. It
        // is the *fraction* the page draws, and that still means what it meant.
        assert_eq!(hero[5], 12.0, "max_hp: the fixture fighter anatomy's");
        assert_eq!(hero[4], hero[5], "the replacement arrived wounded");
        assert!((hero[3] - 0.35).abs() < 0.001, "radius {}", hero[3]);
    }

    #[test]
    fn an_unrecognised_hero_code_is_a_warrior_rather_than_a_monster() {
        // `kind_from_code` would answer Skitterer here, which would put a
        // monster archetype on the player's side of the room. Falling through
        // to a hero build instead is the whole reason the two decoders are
        // separate functions.
        init_quiet(FATAL_SEED);
        fall_to_brutes();
        assert_eq!(swap_in_hero(9_999, SLOT_EMPTY, SLOT_EMPTY), 1);
        assert_eq!(hero_row().expect("nobody arrived")[7], 0.0, "kind: Fighter");
        assert_eq!(monsters().iter().filter(|m| m[6] == 0.0).count(), 0);
    }

    #[test]
    fn a_replacement_takes_no_credit_for_the_last_ones_thinking() {
        // **This used to be `a_replacement_arrives_under_no_order_at_all`**, and
        // the order half of it went with the channel: an order belonged to the
        // faction, so it outlived the body it was given to, and a newcomer that
        // inherited one set off for wherever the last one was headed when it was
        // killed. Nothing can write an order any more, so `Hold` is the only
        // value the column ever holds and the claim has no way to fail.
        //
        // The decision clock is the half that survives, and it is the half that
        // is about this host rather than about the sim: `last_decision_tick` is
        // what the page flashes a ring off, and a replacement that arrived
        // holding the dead one's number would take credit for a decision it did
        // not make.
        init_quiet(FATAL_SEED);
        step(60);
        fall_to_brutes();

        assert_eq!(swap_in_hero(FIGHTER, SLOT_EMPTY, SLOT_EMPTY), 1);
        assert_eq!(
            frame()[5],
            0.0,
            "last_decision_tick: the newcomer took credit for a decision it \
             did not make"
        );

        // And it does start thinking, so the page's ring is not stuck at zero.
        step(30);
        assert!(frame()[5] > 0.0, "the replacement never took a decision");
    }

    #[test]
    fn a_replacement_lands_where_the_last_one_fell() {
        // **The reverse of what this file used to assert.** It used to demand
        // the replacement land *clear* of every monster -- more than a brute's
        // 0.70 + 0.45 + 0.9 = 2.05 of reach from the nearest one -- on the
        // argument that a swap button which hands you a corpse is worse than no
        // swap button. That argument still holds and has been overruled: you
        // come back where you fell, which is by construction inside the mob
        // that put you there. See `Sim::entry_point`.
        // **Four floor plans rather than eight, and the cost is why.** Where a
        // body falls is a fact about the floor plan it was chased across, so
        // this has always been a sweep; a fall now costs up to eighteen thousand
        // ticks of twelve brutes rather than a couple of thousand of six, and
        // eight seeds put half a minute into `cargo test -p web` on their own.
        // Four still crosses four different plans, which is what the sweep is
        // for.
        //
        // **They were 1 through 4 and two of those four no longer produce a
        // death at all**, which would have left this sweep asserting nothing on
        // half its plans -- see [`FATAL_SEEDS`] for the measurement that picked
        // these. Four *hunted* seeds is a narrower claim than four consecutive
        // ones and it is the honest one: the fixture needs a fall to have
        // somewhere to come back to.
        let mut furthest = 0.0f32;
        for seed in FATAL_SEEDS {
            init_quiet(seed);
            let fall = fall_to_brutes_watching();
            assert_eq!(swap_in_hero(FIGHTER, SLOT_EMPTY, SLOT_EMPTY), 1, "seed {seed}: nobody arrived");

            let hero = hero_row().expect("the frame has no hero in it");
            let radius = hero[3];
            let drift = ((hero[0] - fall.0).powi(2) + (hero[1] - fall.1).powi(2)).sqrt();
            furthest = furthest.max(drift);
            assert!(
                drift <= 1.5,
                "seed {seed}: fell at {fall:?} and came back {drift} away, at ({}, {})",
                hero[0],
                hero[1],
            );
            // And still somewhere a body of that width fits. The fall site is a
            // contact point on the dead body's rim, so it can be closer to a
            // wall than anything can stand -- which is the whole of what
            // `nearest_walkable` is there for.
            assert!(
                walkable(hero[0], hero[1], radius),
                "seed {seed}: arrived in the rock at ({}, {})",
                hero[0],
                hero[1],
            );
            assert!(
                hero[0] >= radius - 0.001
                    && hero[0] <= arena().0 - radius + 0.001
                    && hero[1] >= radius - 0.001
                    && hero[1] <= arena().1 - radius + 0.001,
                "seed {seed}: arrived outside the level at ({}, {})",
                hero[0],
                hero[1],
            );
        }
        println!(
            "furthest a replacement drifted off the fall across {} seeds: {furthest}",
            FATAL_SEEDS.len(),
        );
    }

    #[test]
    fn a_replacement_with_nobody_to_follow_takes_the_middle_of_the_floor() {
        // The fallback, which is the first swap of a run and the first after a
        // descent: nobody has fallen on this floor, so the old sweep runs and
        // the answer is the clearest standing room near the centre.
        //
        // A level with nobody standing at all is how that state is reached
        // without a death -- a death is the one thing that would record a fall.
        init_deserted(1);
        assert!(hero_row().is_none(), "a deserted level came with a hero in it");
        assert_eq!(swap_in_hero(FIGHTER, SLOT_EMPTY, SLOT_EMPTY), 1, "nobody arrived");

        let hero = hero_row().expect("the frame has no hero in it");
        assert!(walkable(hero[0], hero[1], hero[3]), "the sweep landed in the rock");
        let (ax, ay) = arena();
        let off = ((hero[0] - ax / 2.0).powi(2) + (hero[1] - ay / 2.0).powi(2)).sqrt();
        println!("the fallback landed {off} from the middle of a {ax} by {ay} floor");
        assert!(
            off <= SPAWN_FAR.to_f32() + 1.0,
            "the fallback sweep no longer works off the centre: ({}, {})",
            hero[0],
            hero[1],
        );
    }

    // **`the_frame_carries_arrows` is deleted with the channel that armed it.**
    // It put a bow in the hero's hand through `set_hero_loadout` and watched the
    // frame's `shot` section fill; both halves are legacy. `World::shots` is the
    // legacy projectile store, an embodied arrow lives in the articulated
    // projectile publication instead, and there is no bow equipment row in
    // `CombatSpecTableV1::fixtures` for a hand on this floor to hold. The claim
    // that an arrow reaches the page survives in
    // `a_configured_bow_publishes_its_live_arrow_with_the_archers_full_identity`,
    // which drives the arena's own configured bow.

    #[test]
    fn a_swap_consumes_a_placement_roll() {
        // Only one can be answered at a time, so the counter's effect here is
        // invisible from the outside -- except that a swap has to *consume* a
        // roll, or a monster spawned on the same tick afterwards would be
        // placed exactly where one spawned before the swap would have been.
        init_quiet(FATAL_SEED);
        fall_to_brutes();
        swap_in_hero(FIGHTER, SLOT_EMPTY, SLOT_EMPTY);
        let after_swap = monsters().len();
        spawn_monster(SKITTERER, SLOT_EMPTY, SLOT_EMPTY);
        let with = monsters()[after_swap].clone();

        init_quiet(FATAL_SEED);
        fall_to_brutes();
        spawn_monster(SKITTERER, SLOT_EMPTY, SLOT_EMPTY);
        let without = monsters()[after_swap].clone();

        assert!(
            distance(&with, &without) > 0.001,
            "the swap did not consume a roll: both landed at ({}, {})",
            with[0],
            with[1],
        );
    }

    // ---------------------------------------------------------- the event feed

    #[test]
    fn catching_up_eight_ticks_reports_eight_ticks_of_events() {
        // The property the buffer is cleared per *call* for. A tab that was
        // behind hands `step` up to `MAX_CATCHUP_TICKS` at once, and all eight
        // of those ticks happened -- a feed cleared per tick would report the
        // last one and silently drop seven eighths of the fight's damage
        // numbers on exactly the frames the browser was late for.
        // **Seed 4 rather than seed 1.** A Fighter with twelve health against
        // four Brutes is over in about a second, so the whole of this fixture's
        // event traffic lives in a narrow band and *which* band is a fact about
        // the floor plan. Seed 1 produces seven events in twelve hundred ticks
        // on the level as it now carves; seed 4 produces fifty-one. Neither is a
        // rule that changed -- the search below is what makes the choice safe,
        // and the seed is only there to give it something to find.
        fn brawl(warmup: u32) {
            init_quiet(4);
            for _ in 0..4 {
                spawn_monster(BRUTE, SLOT_EMPTY, SLOT_EMPTY);
            }
            step(warmup);
        }
        /// Nine ticks one at a time, each tick's feed kept separately.
        fn one_at_a_time(warmup: u32) -> Vec<Vec<Vec<f32>>> {
            brawl(warmup);
            (0..9)
                .map(|_| {
                    step(1);
                    events()
                })
                .collect()
        }

        // Land on eight ticks that are busy on **more than one of them** -- most
        // eights are not, because a brute announces a cut about twice a second
        // and lands one less often than that, and a window with everything on
        // its last tick would pass whether the buffer were cleared per call or
        // per tick. Searched rather than guessed, and deterministic either way:
        // the warmup that is found is replayed below, so the two runs are the
        // same run.
        let busy = |per_tick: &[Vec<Vec<f32>>]| {
            per_tick[..8].iter().filter(|t| !t.is_empty()).count()
        };
        //
        // A tick at a time rather than eight at a time. Stepping the search by
        // the window width samples one starting tick in eight, which is fine
        // while a brawl is busy for seconds and useless once it is busy for a
        // dozen ticks -- the band that satisfies this on the level as it now
        // carves is six ticks wide, and a stride of eight walked straight over
        // it. Overlapping windows cost a few more replays and read every start.
        let mut warmup = 60;
        let mut per_tick = one_at_a_time(warmup);
        while busy(&per_tick) < 2 && warmup < 1_200 {
            warmup += 1;
            per_tick = one_at_a_time(warmup);
        }
        let singly: Vec<Vec<f32>> = per_tick[..8].concat();
        println!(
            "ticks {warmup}..{}: {} events over {} busy ticks",
            warmup + 8,
            singly.len(),
            busy(&per_tick)
        );
        assert!(
            busy(&per_tick) >= 2,
            "found no eight ticks of a four-brute brawl busy on more than one \
             of them, so this test would pass without the buffer being cleared \
             per call at all"
        );
        assert!(
            singly.len() <= MAX_EVENTS,
            "{} events in eight ticks is past the ceiling, so this is measuring \
             the overflow rule rather than the clearing rule",
            singly.len()
        );

        brawl(warmup);
        step(8);
        assert_eq!(
            events(),
            singly,
            "one step of eight reported something other than eight steps of one"
        );

        // And the other half of the contract: the feed is emptied at the start
        // of the *next* call rather than accumulating for the life of the page.
        step(1);
        assert_eq!(
            events(),
            per_tick[8],
            "the ninth tick reported the eight before it as well"
        );
    }

    /// One scripted run's whole event feed, tick by tick.
    ///
    /// Built to reach every derived kind the model still produces, because the
    /// derived ones are exactly the ones no golden hash can see:
    /// `World::state_hash` does not walk `World::events`, and nothing hashes the
    /// frame at all.
    ///
    /// **Four of the eight kinds it used to reach are gone with the legacy tick,
    /// and one with the fight.** `EVENT_DAMAGE`, `EVENT_DECLARE`, `EVENT_PHASE`
    /// and `EVENT_SHOVE` come off `Event::Damage`, `Event::Shove` and the legacy
    /// limb's swing phases; the embodied arm of `World::step` emits exactly one
    /// variant, `Event::Death`, and a body with joints never leaves `Swing::Guard`.
    /// `EVENT_PORTAL` is the one the *fight* took: the edge only exists on a
    /// level that is cleared by a kill, and an embodied hero does not reliably
    /// finish a monster -- see `init_on_the_way_out`. What is left is the walk,
    /// the death and the descent, which is still three kinds from three
    /// different derivations.
    fn scripted_feed() -> Vec<Vec<Vec<f32>>> {
        let mut feed = Vec::new();
        let pump = |ticks: u32, done: fn() -> bool, feed: &mut Vec<Vec<Vec<f32>>>| {
            for _ in 0..ticks {
                step(1);
                feed.push(events());
                if done() {
                    return true;
                }
            }
            false
        };

        // A death first, and it is the hero's: twelve brutes will finish a
        // Fighter and a Fighter will not finish one Skitterer. See
        // `kill_the_hero`.
        init_quiet(FATAL_SEED);
        arm_death_rig();
        assert!(
            pump(18_000, || hero_row().is_none(), &mut feed),
            "twelve brutes could not kill one fighter, so this feed has no death in it"
        );
        assert_eq!(swap_in_hero(FIGHTER, SLOT_EMPTY, SLOT_EMPTY), 1, "nobody came back");
        pump(60, || false, &mut feed);

        // Then a walk, for the footfalls. **Driven, and the feed is collected
        // around the driving rather than through it**: `walk_to` steps a tick at
        // a time like `pump` does, so the rows those ticks produce would be
        // lost. What this fixture needs from the walk is an `EVENT_STEP`, and a
        // footfall needs only that somebody walked.
        let (ax, ay) = walkable_near_hero(3.0, 0.45);
        walk_to(ax, ay, 0.6, 900);
        pump(60, || false, &mut feed);

        // And the descent, taken through the export rather than by walking into
        // a way out. The level is not clear -- twelve brutes are standing on it
        // -- so there is nothing to walk into, and the row this is here for is
        // pushed by `Sim::descend` itself either way.
        assert_eq!(descend(), 1, "the run would not move down a floor");
        // Recorded here and not by the next `pump`, because the feed is cleared
        // per *call*: `Sim::advance` empties it at the top, so a row pushed by an
        // export that is not `step` is only ever in the frame that export
        // published. That is the same per-call contract the eight-tick catch-up
        // test is about, seen from the other end.
        feed.push(events());
        pump(60, || false, &mut feed);
        feed
    }

    #[test]
    fn one_script_run_twice_reports_the_same_events_including_the_derived_ones() {
        let a = scripted_feed();
        let b = scripted_feed();
        assert_eq!(a.len(), b.len(), "the two runs were different lengths");
        for (i, (x, y)) in a.iter().zip(&b).enumerate() {
            assert_eq!(x, y, "the two runs' feeds diverged at tick {i}");
        }

        // And that the fixture actually reached each kind, so the comparison
        // above is not two identical lists of nothing. **Three rather than
        // eight, and the five that went are named in `scripted_feed`'s own
        // note** -- four of them because the model emits no such event and one
        // because no fixture here can clear a level by killing.
        let flat: Vec<&Vec<f32>> = a.iter().flatten().collect();
        let counts = |kind: u32| flat.iter().filter(|r| r[0] == kind as f32).count();
        for (kind, name) in [
            (EVENT_DEATH, "death"),
            (EVENT_STEP, "step"),
            (EVENT_DESCEND, "descend"),
        ] {
            assert!(counts(kind) > 0, "the script produced no {name} row");
        }
        for (kind, name) in [
            (EVENT_DAMAGE, "damage"),
            (EVENT_DECLARE, "declare"),
            (EVENT_PHASE, "phase"),
            (EVENT_SHOVE, "shove"),
            (EVENT_BLOCK, "block"),
            (EVENT_PARRY, "parry"),
            (EVENT_LOOSE, "loose"),
        ] {
            assert_eq!(counts(kind), 0,
                "a {name} row reached the feed, so this model does emit one after all");
        }
        println!(
            "{} rows over {} ticks: {} step, {} death, {} descend",
            flat.len(),
            a.len(),
            counts(EVENT_STEP),
            counts(EVENT_DEATH),
            counts(EVENT_DESCEND),
        );

        // Every row is well formed, which is the half a comparison of two
        // identical runs cannot check: a column written from the wrong field
        // is wrong identically in both.
        for row in &flat {
            assert!(row[0] < EVENT_KINDS as f32, "event kind {}", row[0]);
            assert!(
                row[4] < MAX_UNITS as f32 || row[4] == SLOT_EMPTY as f32,
                "actor {} is neither a slot nor `nobody`",
                row[4]
            );
            assert!(
                row[5] < MAX_UNITS as f32 || row[5] == SLOT_EMPTY as f32,
                "other {} is neither a slot nor `nobody`",
                row[5]
            );
        }
        // A death row's weight and body kind come from the trace table, which
        // is the whole reason that table exists -- `World::view` answers
        // `None` for a body `reap_dead` has already recycled.
        let death = flat
            .iter()
            .find(|r| r[0] == EVENT_DEATH as f32)
            .expect("checked above");
        assert!(death[6] > 0.0, "a death row weighs nothing");
        assert_eq!(death[7], 0.0, "the thing that died was the fighter");
        // And the descend row carries the floor it arrived on.
        let descend = flat
            .iter()
            .find(|r| r[0] == EVENT_DESCEND as f32)
            .expect("checked above");
        assert_eq!(descend[3], 1.0, "descend row: the new depth");
    }

    #[test]
    fn a_fighter_takes_a_step_about_every_twelve_ticks() {
        // `STRIDE_PER_RADIUS`'s provenance, as an assertion rather than as a
        // claim in a comment. A Fighter is radius 0.45 and walks at about 0.048
        // world units a tick, so at 1.3 its stride is 0.585 units and a foot
        // lands every twelve or so. The band is wide because the number is a
        // *look* and not an optimum -- what is being guarded is the order of
        // magnitude, which is what decides whether the legs blur or the body
        // appears to glide.
        init_quiet(1);
        // **Driven forward rather than ordered anywhere**, which is a better
        // fixture for this than the walk it replaces: the constant is about a
        // body at speed, and a held input has no approach and no arrival in it.
        set_control(CONTROL_FEET);
        set_input(1_000, 0, 0, 0, 0, 0, 0);

        // Gaps between consecutive footfalls, and only the ones taken at
        // something near top speed: the strides out of a standing start and
        // the ones into a destination are both slower, and neither is what the
        // constant is about.
        // Six units at roughly 0.048 a tick is about 130 ticks of walking, so
        // the window is 200 and the rest of it is the body standing at the
        // destination -- which the second half of this test then uses.
        let mut gaps: Vec<u32> = Vec::new();
        let mut since = 0u32;
        let mut walking = 0u32;
        for _ in 0..200 {
            step(1);
            since += 1;
            let row = hero_row().expect("the hero is gone");
            let speed = (row[29] * row[29] + row[30] * row[30]).sqrt();
            if speed > 0.04 {
                walking += 1;
            }
            if events().iter().any(|r| r[0] == EVENT_STEP as f32) {
                if speed > 0.04 {
                    gaps.push(since);
                }
                since = 0;
            }
        }
        assert!(walking > 70, "the hero only walked {walking} ticks of 200");
        assert!(gaps.len() >= 5, "only {} footfalls at speed", gaps.len());
        let mean = gaps.iter().sum::<u32>() as f32 / gaps.len() as f32;
        println!("{} footfalls at speed, mean gap {mean:.1} ticks", gaps.len());
        assert!(
            (9.0..=16.0).contains(&mean),
            "a Fighter's footfall period is {mean:.1} ticks, which is outside \
             the band STRIDE_PER_RADIUS was chosen for"
        );

        // And the other half of the claim, which is the one that survives any
        // retune of the constant: a body that has stopped does not take steps.
        // The feet go back to the control condition rather than to the script,
        // which walks the way it is facing when it can see nobody.
        set_input(0, 0, 0, 0, 0, 0, 0);
        set_control(0);
        set_policy(0, PolicyKind::Neutral.code());
        step(120);
        let stride = hero_row().expect("the hero is gone")[31];
        step(60);
        assert_eq!(
            hero_row().expect("the hero is gone")[31],
            stride,
            "a standing body's stride kept turning over"
        );
    }

    #[test]
    fn a_skitterer_takes_about_twice_as_many_steps_as_a_fighter() {
        // The other half of [`STRIDE_PER_RADIUS`]'s provenance, and the half
        // that was written down wrong: the comment claimed ~8 ticks for a
        // Skitterer, which is its 0.39 stride divided by the *Fighter's* speed.
        // A body spends its own stride with its own legs.
        //
        // Arithmetic and not a run, deliberately. The claim being pinned is a
        // ratio of two registry numbers, and the measured cadence -- which the
        // test above takes for the Fighter -- comes out a little longer than
        // this for both bodies, because a body walking a route is under its
        // settle speed for the ends of every leg. Measuring the Skitterer as
        // well would cost a scripted floor to make one walk anywhere and would
        // pin the routing as much as the constant.
        let ticks = |kind: Body| {
            let stride = kind.radius() * STRIDE_PER_RADIUS;
            (stride / kind.base_stats().move_speed()).to_f32()
        };
        let fighter = ticks(Body::Fighter);
        let skitterer = ticks(Body::Skitterer);
        println!("nominal footfall period: fighter {fighter:.2}, skitterer {skitterer:.2}");
        assert!(
            (6.0..=7.0).contains(&skitterer),
            "a Skitterer's footfall period is {skitterer:.2} ticks, not the ~6.5 \
             STRIDE_PER_RADIUS writes down"
        );
        assert!(
            skitterer < fighter,
            "the small body does not take more steps than the big one, which is \
             the whole reason the stride is proportional to radius"
        );
    }

    #[test]
    fn a_recycled_slot_does_not_report_a_phase_change_between_two_bodies() {
        init_quiet(1);
        step(1);

        // The state a recycled slot leaves behind, **forged rather than
        // staged**: getting a monster to die mid-`Windup` and the next spawn to
        // land on its index takes a scripted floor, and the one line of it that
        // matters is this one -- a trace holding the previous occupant's phase,
        // phase length and walk cycle under the previous occupant's generation.
        let hero = with_sim(EntityId::NONE, |sim| {
            let hero = sim.hero().expect("the room did not open with a hero");
            let trace = &mut sim.traces[hero.index as usize];
            trace.generation = hero.generation.wrapping_sub(1);
            trace.swing = Swing::Windup;
            trace.span = 40;
            trace.stride = Fx::from_ratio(7, 10);
            hero
        });

        step(1);
        // The row the bug produces is `Windup -> something`, which no body that
        // has been standing at guard can emit. Asked of `aux0` and not merely
        // of the kind, so a hero that legitimately *entered* a windup on this
        // tick -- `Guard -> Windup`, `aux0` at guard -- does not fail it.
        let windup = Swing::Windup.discriminant() as f32;
        assert!(
            !events()
                .iter()
                .any(|r| r[0] == EVENT_PHASE as f32 && r[6] == windup),
            "a slot whose generation changed reported the last body's phase"
        );

        let trace = with_sim(Trace::default(), |sim| sim.traces[hero.index as usize]);
        assert_eq!(trace.generation, hero.generation, "the generation is stale");
        assert_eq!(trace.span, 0, "the last body's phase length survived");
        assert!(
            trace.stride < Fx::from_ratio(1, 2),
            "the newcomer inherited a walk phase of {}",
            trace.stride.to_f32()
        );
    }

    // ------------------------------------------------------ the live hero

    #[test]
    fn set_hero_stat_clamps_out_of_range_input() {
        init_quiet(1);
        // Read live rather than from the body table: once a dial can move
        // mid-fight the two stop agreeing, and this is the one that is true.
        assert_eq!(hero_stat(3), 6, "the Fighter's perception");

        assert_eq!(set_hero_stat(3, 14), 1);
        assert_eq!(hero_stat(3), 14, "the dial did not move");
        // And the frame agrees, which is the half the page draws a vision ring
        // from: `6.0 + 0.6 * perception 14`.
        let hero = hero_row().expect("the hero is gone");
        assert!((hero[27] - 14.4).abs() < 0.001, "sight_range {}", hero[27]);

        // Past both ends. An `i32` arrives through JavaScript's ToInt32, which
        // **wraps** rather than saturating, so a slider that got its arithmetic
        // wrong is not a hypothetical -- and the clamp has to be on this side,
        // because a page-side one would never see the value that wrapped.
        assert_eq!(set_hero_stat(3, 9_999), 1);
        assert_eq!(hero_stat(3), MAX_ATTRIBUTE, "not clamped high");
        assert_eq!(set_hero_stat(3, -9_999), 1);
        assert_eq!(hero_stat(3), 0, "not clamped low");
        assert_eq!(set_hero_stat(3, i32::MAX), 1);
        assert_eq!(hero_stat(3), MAX_ATTRIBUTE);
        assert_eq!(set_hero_stat(3, i32::MIN), 1);
        assert_eq!(hero_stat(3), 0, "i32::MIN wrapped instead of clamping");

        // A selector that names nothing is refused rather than quietly writing
        // power, which is the failure a page with an off-by-one row index would
        // otherwise never notice.
        assert_eq!(set_hero_stat(99, 5), 0);
        assert_eq!(hero_stat(99), 0);
        assert_eq!(hero_stat(0), 6, "an unknown selector wrote somewhere");

        // Vitality is the one that moves the bar's length, and the *fraction*
        // survives it -- see `World::set_stats`, where that is argued.
        // **Vitality no longer moves the bar, and that is the model rather than
        // a regression here.** `World::max_health_of` answers `anatomy::max_health`
        // for a body with an anatomy row, so the sheet decides reaction time,
        // reach and speed and the frame decides how much punishment the frame
        // takes. The sheet write still has to *take*, which is what this checks.
        assert_eq!(set_hero_stat(4, 8), 1);
        let before = hero_row().expect("the hero is gone");
        assert_eq!((before[4], before[5]), (12.0, 12.0));
        assert_eq!(set_hero_stat(4, 16), 1);
        assert_eq!(hero_stat(4), 16, "vitality would not move");
        let after = hero_row().expect("the hero is gone");
        assert_eq!(after[5], 12.0, "max_hp followed the sheet rather than the anatomy");
        assert_eq!(after[4], after[5], "a full bar did not stay full");
    }

    // -------------------------------------------------- the spawn template

    #[test]
    fn spawn_from_template_uses_the_template_body_and_loadout() {
        init_quiet(1);
        // Where the panel opens: what `S` has always sent.
        assert_eq!(spawn_template_body(), SKITTERER);
        assert_eq!(spawn_template_stat(1), 9, "the Skitterer's agility");
        assert_eq!(spawn_template_slot(0), sim::ActionKind::Knife.code());

        // A different body takes its stat sheet *and* its kit with it. That is
        // the whole reason this goes through `UnitSpec::set_body`: a bare `kind`
        // write is a half-change, and a panel offering "Brute" while quietly
        // keeping a Skitterer's stats is lying in five rows at once.
        assert_eq!(set_spawn_template_body(BRUTE), 1);
        assert_eq!(spawn_template_body(), BRUTE);
        assert_eq!(spawn_template_stat(0), 12, "the Brute's power");
        assert_eq!(spawn_template_slot(0), sim::ActionKind::Club.code());
        assert_eq!(spawn_template_slot(1), sim::ActionKind::Punch.code());

        // Then edit it away from the body's defaults. Two attributes that are
        // visible in the frame, so the assertions below are about what arrives
        // rather than about what was asked for.
        assert_eq!(set_spawn_template_stat(4, 5), 1, "vitality");
        assert_eq!(set_spawn_template_stat(3, 10), 1, "perception");
        assert_eq!(set_spawn_template_stat(3, 9_999), 1);
        assert_eq!(spawn_template_stat(3), MAX_ATTRIBUTE, "not clamped");
        assert_eq!(set_spawn_template_stat(3, 10), 1);
        assert_eq!(set_spawn_template_stat(99, 5), 0, "an unknown selector took");

        assert_eq!(set_spawn_template_slot(0, sim::ActionKind::Bow.code()), 1);
        assert_eq!(set_spawn_template_slot(1, sim::ActionKind::Shield.code()), 1);
        // Slot 0 cannot be emptied -- a fighter holding nothing has no rule to
        // run, and `Loadout::set` already refuses it.
        assert_eq!(set_spawn_template_slot(0, SLOT_EMPTY), 0);
        assert_eq!(spawn_template_slot(0), sim::ActionKind::Bow.code());
        // A code the sim has no rule for is refused rather than handed over.
        assert_eq!(set_spawn_template_slot(1, 9_999), 0);

        assert_eq!(spawn_from_template(), 1, "nothing arrived");
        let monster = monsters()[0].clone();
        assert_eq!(monster[6], 1.0, "faction: Monsters");
        assert_eq!(monster[7], 2.0, "kind: Brute");
        // The brute's *anatomy*, which is what a health bar measures now. See
        // `set_hero_stat_clamps_out_of_range_input` for the rule.
        assert_eq!(monster[5], 18.0, "max_hp: the fixture brute anatomy's");
        assert!((monster[27] - 12.0).abs() < 0.001, "sight_range {}", monster[27]);
        // **The sheet crosses whole and the kit does not**, which is
        // [`equip_articulated`] rather than a leak: the shipped table is one
        // sword, one shield and one club, and the brute frame has a row for the
        // club. So the bow and shield the panel asked for arrive as the club its
        // anatomy can hold, and the template itself is untouched -- which the
        // two lines after these check.
        assert_eq!(monster[25], sim::ActionKind::Club.code() as f32, "slot0: the floor's kit");
        assert_eq!(monster[26], SLOT_EMPTY as f32, "slot1: a fist is not an item");
        assert_eq!(spawn_template_slot(0), sim::ActionKind::Bow.code(),
                   "the floor's kit was written back over the template");
        assert_eq!(spawn_template_slot(1), sim::ActionKind::Shield.code());
        // Placed by the module, not by the caller: on the same ring every other
        // newcomer lands on.
        let d = distance(&monster, &hero_row().expect("the hero is gone"));
        assert!((6.0 - 0.001..=10.0).contains(&d), "landed {d} from the hero");

        // The template is a template: using it does not consume it, and the
        // hotkey path beside it never reads it.
        assert_eq!(spawn_template_body(), BRUTE, "the spawn consumed the template");
        assert_eq!(spawn_monster(SKITTERER, SLOT_EMPTY, SLOT_EMPTY), 2);
        let plain = monsters()[1].clone();
        assert_eq!(plain[7], 3.0, "kind: Skitterer");
        assert_eq!(
            plain[5], 12.0,
            "max_hp: the fighter anatomy a Skitterer is dressed in -- the template \
             leaked into the hotkey"
        );
        // The hotkey's own Skitterer, dressed by the same total mapping: a knife
        // has no equipment row either, so it arrives with the sword every body
        // on the fighter frame arrives with.
        assert_eq!(plain[25], sim::ActionKind::Sword.code() as f32, "slot0");
    }

    #[test]
    fn the_template_survives_a_body_change_as_a_whole_body() {
        // The half of `UnitSpec::set_body` that is easy to get wrong from the
        // page's side: an edited attribute is *not* meant to survive picking a
        // different body, because the sheet it belonged to is gone.
        init_quiet(1);
        assert_eq!(set_spawn_template_stat(0, MAX_ATTRIBUTE), 1);
        assert_eq!(spawn_template_stat(0), MAX_ATTRIBUTE);
        assert_eq!(set_spawn_template_body(ROGUE), 1);
        assert_eq!(spawn_template_stat(0), 4, "the Rogue's power, not the edit");
        assert_eq!(spawn_template_slot(0), sim::ActionKind::Shortsword.code());
    }

    // -------------------------------------------------- the embodied submission

    fn embodied_test_world() {
        let mut fresh = Sim::new(1);
        let scenario = Scenario::embodied_duel();
        fresh.world = World::new(&scenario, 1);
        // Beside the world, exactly as `install_boundary_fixture` does it.
        fresh.anatomy = scenario_anatomy(&scenario);
        SIM.with(|sim| *sim.borrow_mut() = Some(fresh));
    }

    /// **`write_submitted`'s twin, and it wrote its own envelope rather than
    /// calling that one**: the layout version and the kind byte were the two
    /// fields the two grammars disagreed about, so a shared writer would have
    /// made every assertion below a test of one envelope written twice. That
    /// duplication is what let the articulated writer be deleted whole.
    fn write_embodied(command: sim::CommandV1) {
        EMBODIED_COMMAND.with(|buffer| {
            let mut bytes = buffer.borrow_mut();
            bytes.fill(0);
            bytes[0..2].copy_from_slice(&sim::EMBODIED_COMMAND_LAYOUT_VERSION.to_le_bytes());
            bytes[2] = 2;
            bytes[4..EMBODIED_COMMAND_BYTES].copy_from_slice(&command.payload_bytes());
        });
    }

    fn embodied_fixture() -> sim::CommandV1 {
        let arm = sim::ArmTarget {
            bearing: Angle::QUARTER,
            height: sim::CombatHeight::MID,
            reach: Fx::HALF,
            effort: Fx::ONE,
        };
        let mut command = sim::CommandV1::new(sim::CommandCoreV1 {
            move_dir: Vec2::ZERO,
            body_yaw: Angle::QUARTER,
            intent: Intent::Hold,
            arms: [arm; 2],
            grips: [sim::GripRequest::Keep; 2],
            releases: [sim::ReleaseRequest::Keep; 2],
        });
        // The two arms get different, non-neutral planes. `new` answers the
        // neutral pair, so a fixture that took it would stage four zero bytes
        // and every assertion driven from it would pass on a boundary that
        // truncated the payload back to the articulated width.
        command.swing_plane = [Angle::from_raw(0x4567), Angle::from_raw(0x89ab)];
        command
    }

    #[test]
    fn the_arm_minimum_reach_capability_is_the_actuators_owner() {
        assert_eq!(arm_min_reach_raw(), sim::ARM_MIN_REACH_RAW as u32);
        assert_eq!(arm_min_reach_raw(), 16_384,
            "the exported capability stopped being the shipped physical quarter");
    }

    fn digest() -> u64 {
        SIM.with(|sim| sim.borrow().as_ref().unwrap().world.state_digest().value)
    }

    // **`an_articulated_module_refuses_submit_embodied_by_name` stood here and
    // has lost its subject rather than its fixture.** It built an articulated
    // world without publishing, offered [`submit_embodied`] a well-formed
    // embodied command and required `2 << 8` -- refused *by name* -- and then
    // corrupted the intent tag and required the same answer again, because that
    // second rung is the only input that separates this boundary's own model
    // check from `World::submit`'s: a boundary that checked the
    // bytes first would answer `1` and name the payload for what is a model
    // mismatch.
    //
    // **The check it guarded has since gone as well, and the ordering argument
    // is what outlived both.** That argument is recorded where the check stood,
    // in [`submit_embodied`], because it is the thing a third model would have
    // to decide again: name the model before reading the bytes, or a mismatch
    // gets reported as a malformed payload. What is gone is any world that could
    // reach it -- every scenario this module can install answers one grammar --
    // so this was a refusal the page can no longer provoke rather than a guard
    // that stopped being run, and it is the same shape as the `WRONG_MODEL`
    // assertion `tools/wasm_check.js` lost when `submit_articulated` went.

    /// The whole of the submission ladder, now that there is one submission.
    ///
    /// **It was written as `articulated_wasm_scratch_is_fixed_and_submission_is_atomic`'s
    /// twin and is what that test left behind**: its own buffer, its own layout
    /// version, a command that stores, every refusal in precedence order, and
    /// the raw-range fallback that stores a neutral command in its place. It was
    /// deliberately a second copy rather than a shared helper, and that is why
    /// deleting the articulated half cost none of these rungs.
    #[test]
    fn the_embodied_wasm_scratch_is_its_own_buffer_and_submission_is_atomic() {
        assert_ne!(embodied_command_ptr(), 0);
        // 61 and 2 as literals rather than as the constants the exports read:
        // these are the boundary numbers a JavaScript caller reads, and a test
        // that computes them the way the export does asserts nothing. Both moved
        // with the swing plane -- the four bytes it appended, and the layout
        // version that announces them -- while the articulated envelope beside
        // it stayed at 57, which was the whole of what the forked payload
        // bought. That envelope is gone and its width is not: `sim` still
        // declares `ARTICULATED_PAYLOAD_BYTES` as 53, three pinned digests are
        // taken over it, and `EMBODIED_PAYLOAD_BYTES` is 57 because the two were
        // separated rather than shared.
        assert_eq!(embodied_command_len(), 61);
        assert_eq!(embodied_command_layout_version(), 2);

        let command = embodied_fixture();
        embodied_test_world();
        write_embodied(command);
        assert_eq!(submit_embodied(0, 9), 3 << 8, "stale subject lost precedence");
        let before = digest();
        assert_eq!(submit_embodied(0, 0), 1);
        assert_ne!(digest(), before, "a stored embodied command left the digest where it was");

        // An envelope this export does not answer for: the articulated kind
        // byte, in a buffer that is otherwise a perfectly good command.
        write_embodied(command);
        EMBODIED_COMMAND.with(|buffer| buffer.borrow_mut()[2] = 1);
        let before = digest();
        assert_eq!(submit_embodied(0, 0), 1 << 8, "an articulated envelope was accepted");
        assert_eq!(before, digest(), "a rejected envelope mutated the world");

        // Left reach out of range: refused as bytes, so the fallback stores a
        // neutral command and names the field it refused.
        write_embodied(command);
        EMBODIED_COMMAND.with(|buffer| {
            buffer.borrow_mut()[4 + 25..4 + 29]
                .copy_from_slice(&(Fx::ONE.raw() + 1).to_le_bytes());
        });
        assert_eq!(submit_embodied(0, 0), 2 | (4 << 8) | (4 << 16));

        let mut missing = command;
        missing.core.grips[0] = sim::GripRequest::EquipSlot(7);
        write_embodied(missing);
        assert_eq!(submit_embodied(0, 0), 2 | (5 << 8) | (7 << 24));
    }
}
