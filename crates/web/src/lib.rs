//! The browser boundary.
//!
//! One `cdylib`, sixty-seven `extern "C"` functions, and a single packed `f32`
//! buffer that JavaScript reads straight out of linear memory. No
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
//!     init(seed);                  // one hero, one empty room
//!     set_goto(x_milli, y_milli);  // a click, in thousandths of a world unit
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
//!              last_decision_tick, unit_count, shot_count, event_count]
//!     unit    [x, y, facing_raw, radius, hp, max_hp, faction, kind, intent,
//!              entity_index, entity_generation,
//!              sword_angle_raw, limb_reach, limb_spin,
//!              shield_angle_raw, shield_reach, action_length, shield_arc_raw,
//!              hit_flash, block_flash, parry_flash, ..., sight_range,
//!              visible]
//!     ...     unit_count of them
//!     shot    [x, y, heading_raw, faction]
//!     ...     shot_count of them
//!     event   [kind, x, y, amount, actor_index]
//!     ...     event_count of them
//! ```
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
use policy::{Policy, PolicyKind, RunConfig, MAX_GENOME_LEN};
use sim::{
    Command, EntityId, Event, Faction, LimbCommand, Intent, Objective, Order, Scenario, Body,
    Stats, Swing, UnitSpec, Loadout, Strike, UnitView, World,
};

/// Floats before the first unit: `[arena_x, arena_y, order_kind, order_x,
/// order_y, last_decision_tick, unit_count, shot_count, event_count,
/// monsters_left, portal_x, portal_y, portal_state, depth]`.
///
/// The last five are the run: how much opposition is left, where the way out
/// is and whether it is open, and which floor this is. `monsters_left` is
/// nominally derivable from the unit rows and is here anyway, because the rows
/// are capped at [`MAX_UNITS`] and the two must not be able to disagree about
/// whether the level is clear -- that disagreement would be a portal that opens
/// while something is still alive.
pub const HEADER_LEN: usize = 14;

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
/// **It is here to kill the last mirrored formula in the page.** `main.js` used
/// to write `(60 + 6 * perception) / 10` by hand, which is the exact species of
/// copy the registry post-mortem in `loadRegistry` is about -- and it is now
/// worse than it was, because a stat can be changed live and a body can be
/// swapped underneath it, so the number the page draws a vision ring from has
/// to be the number the observation code actually used.
///
/// `28` is `visible`: `1` if the player can see this body, `0` if not.
/// **Hero-centric, and that is the point** -- it answers what the *player* can
/// see, not what each body perceives for itself. A monster's own contact list is
/// a different question with a different answer, and it never crosses this
/// boundary. With no hero standing there is no point of view at all, so every
/// row reports visible: a fog of war with nobody to be fogged from is just a
/// blank screen.
pub const UNIT_STRIDE: usize = 29;

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

/// Most arrows the frame will carry. Matches [`sim::MAX_SHOTS`], asserted in
/// `the_frame_is_bounded_by_what_the_world_can_hold`.
pub const MAX_SHOTS: usize = sim::MAX_SHOTS;

/// Floats per event, in a third block that follows the arrows: `[kind, x, y,
/// amount, actor_index]`.
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
pub const EVENT_STRIDE: usize = 5;

/// Most events one frame will carry.
///
/// The client caps itself at eight ticks of catch-up per animation frame
/// (`MAX_CATCHUP_TICKS` in `main.js`), and a tick in a crowded room produces a
/// blow or two and the odd declaration, so thirty-two is generous rather than
/// tight. Overflow drops the tail -- see [`Sim::advance`] for why that is the
/// right end to drop.
pub const MAX_EVENTS: usize = 32;

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
/// `x, y` the swinger's own position. See [`Sim::note_declares`].
pub const EVENT_DECLARE: u32 = 3;

/// Bumped whenever the frame changes shape or meaning.
///
/// The page reads this before it reads anything else and refuses to draw a
/// layout it was not written against. That is a weaker promise than the
/// append-only convention it replaced and a much more useful one: append-only
/// forbids the edit, this one makes the edit safe.
pub const FRAME_LAYOUT_VERSION: u32 = 6;

/// Value in a loadout column meaning "this slot is empty". Matches
/// [`sim::Loadout::EMPTY`], and is not a valid action code.
pub const SLOT_EMPTY: u32 = 255;

/// Ticks a hit, block or parry stays lit in the frame.
const FLASH_TICKS: u8 = 12;

/// Bit in [`control`] that hands the feet to the player.
pub const CONTROL_FEET: u32 = 1;
/// Bit in [`control`] that hands the limb to the player.
///
/// Renamed from `CONTROL_LIMB`: there is one limb and it is not always a sword.
pub const CONTROL_LIMB: u32 = 2;
/// Bit in [`control`] that hands **action selection** to the player.
///
/// Separate from [`CONTROL_LIMB`] because choosing what to hold and choosing
/// when to swing are different decisions, and being able to take one without the
/// other is most of what this page teaches. **Genuinely separate**: taking the
/// swing used to imply taking the choice, and no longer does -- see
/// [`set_control`] for what that fold cost and why it went.
pub const CONTROL_SLOT: u32 = 4;

/// Ceiling on units in one frame. The room holds exactly one and a skirmish
/// holds a dozen; the number exists so the buffer can be a fixed array rather
/// than a `Vec`, and 64 rows cost 2.3 KB of linear memory once, forever.
pub const MAX_UNITS: usize = 64;

/// Length of the frame buffer. [`frame_len`] reports how much of it is live.
pub const FRAME_MAX: usize =
    HEADER_LEN + MAX_UNITS * UNIT_STRIDE + MAX_SHOTS * SHOT_STRIDE + MAX_EVENTS * EVENT_STRIDE;

/// Length of the tile buffer.
///
/// Sized for a 96x64 grid rather than the 48x32 a level actually is, so that
/// halving the tile size later is a constant and not an ABI break. Six kilobytes
/// of linear memory, once, forever.
pub const MAP_MAX: usize = 96 * 64;

/// Tile size in thousandths of a world unit, reported by
/// [`map_tile_size_milli`].
///
/// An export rather than a number the page also knows, because it is the last
/// place the client would otherwise hardcode "one tile is one world unit" -- and
/// a client that has that wrong draws a level at the wrong scale while every
/// test still passes.
const TILE_MILLI: u32 = 1000;

/// How close the hero has to be to the way out to take it.
///
/// Measured from body edge to portal edge, so a Brute takes it from further out
/// than a Skitterer does -- which is right: what matters is touching it.
const PORTAL_RADIUS: Fx = Fx::from_ratio(9, 10);

/// Portal states, as the frame reports them.
const PORTAL_NONE: u32 = 0;
/// Visible but shut. **Visible while shut is the design decision**, not a
/// fallback: seeing where the exit is from the moment you arrive is what turns
/// "kill things" into "fight your way there".
const PORTAL_SHUT: u32 = 1;
const PORTAL_OPEN: u32 = 2;

/// Most waypoints one dragged path may carry.
///
/// A drag is sampled about every 1.2 world units, so this is some 29 units of
/// path -- a little over half the level's diagonal, which is as much as anyone
/// draws in one gesture. The page drops the *middle* of an over-long drag
/// rather than the end: where a gesture starts and where it stops are the two
/// points the player meant, and the samples in between are the hand's.
const ROUTE_MAX: usize = 24;

/// How near a waypoint counts as reached.
///
/// Generous on purpose. The waypoints are dense samples of a finger-drawn
/// line, not surveyed marks -- making the character touch each one would turn
/// a smooth gesture into a series of stops, and every sample the player's hand
/// wobbled onto would become a visible dog-leg.
const ROUTE_ARRIVE: Fx = Fx::from_ratio(7, 10);

/// Ticks of no progress before a leg is abandoned.
///
/// The only thing standing between a waypoint sealed behind rock and a route
/// that never finishes. Without it the *last* leg is still correct -- the
/// policy holds, which is what an unreachable order should do -- but every
/// earlier leg would hang forever, and the player would see a character stop
/// halfway along a path it was still nominally following.
///
/// Deliberately longer than any decision period in the stat range, so a slow
/// thinker mid-thought is never mistaken for a stuck one.
const ROUTE_STALL: u32 = 90;

/// How far the hero must move to count as making progress.
const ROUTE_PROGRESS: Fx = Fx::from_ratio(5, 100);

/// Closest a newcomer may be placed to the hero, and the floor the arc sweep
/// in [`Sim::spawn_point`] accepts against. Far enough that you watch it come.
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
const SPAWN_ARCS: u16 = 16;
const SPAWN_ARC_STEP: u16 = 4096;

/// Domain tag for the spawn RNG stream.
///
/// `World::observe` already draws from `Rng::from_stream` keyed on the tick and
/// an entity, so the top bit is set here to keep perception noise and spawn
/// placement out of each other's sequences. No entity index reaches `1 << 63`,
/// so the tag cannot collide.
const SPAWN_STREAM: u64 = 1 << 63;

thread_local! {
    static SIM: RefCell<Option<Sim>> = const { RefCell::new(None) };
    static FRAME: RefCell<[f32; FRAME_MAX]> = const { RefCell::new([0.0; FRAME_MAX]) };
    /// The floor plan, one byte a tile. A fixed array beside `FRAME` and for
    /// the same reason: a `Vec` that reallocates grows linear memory, and
    /// growing it detaches every typed array the page is holding.
    ///
    /// `u8` and not `f32` because a tile is a small integer; the page reads it
    /// with a `Uint8Array` at no cost, and 1536 bytes cross instead of 6 KB.
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
    /// Starts at the header length rather than zero so a client that renders
    /// before it calls `init` reads a well-formed empty frame instead of a
    /// zero-length one.
    static FRAME_LEN: Cell<u32> = const { Cell::new(HEADER_LEN as u32) };
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
    /// One of [`EVENT_DAMAGE`], [`EVENT_BLOCK`], [`EVENT_PARRY`],
    /// [`EVENT_DECLARE`].
    kind: u32,
    at: Vec2,
    /// Health lost, health absorbed, or an action code -- read according to
    /// `kind`, which is why there is only one of these.
    amount: Fx,
    /// [`EntityId::index`] of the unit the row is *about*: the target of a
    /// blow, the defender of a block, the first-named of a parried pair, the
    /// swinger of a declaration.
    actor: u32,
}

struct Sim {
    world: World,
    /// One policy per faction, indexed by [`Faction::index`]. Boxed because the
    /// page can swap either of them mid-fight, which is the whole point of the
    /// behaviour panel: watching the same room go differently is much more
    /// convincing than reading that it would.
    policies: [Box<dyn Policy>; 2],
    kinds: [PolicyKind; 2],
    /// The genes each policy was built from, kept so a slider can move one knob
    /// without the page having to hold the other fifteen.
    genomes: [[Fx; MAX_GENOME_LEN]; 2],
    /// Everything the frame draws, captured once. Iterating these and asking
    /// [`World::view`] beats [`World::snapshot`], which allocates a fresh `Vec`
    /// per call -- sixty allocations a second, each one a chance to grow linear
    /// memory and detach the client's typed array.
    units: Vec<EntityId>,
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
    /// Bumped every time the floor plan changes, and **only** by [`init`] and
    /// [`Sim::descend`].
    ///
    /// That is the whole point of it: [`publish`] runs on every export, and a
    /// revision that moved when a slider moved would tell the page to re-bake a
    /// level that had not changed. The page re-reads the tile buffer exactly
    /// when this number does.
    map_revision: u32,
    /// Where the way out stands, copied off the scenario that built this level.
    ///
    /// Here and not on [`World`], because the sim has no concept of a level, a
    /// depth or a run: what walking into it *means* is a rule about a game, and
    /// putting it below this line would put progression inside the fight
    /// simulator the lab drives headlessly. `None` for a scenario with no way
    /// out, which is every scenario but a generated one.
    portal: Option<Vec2>,

    /// Tiles the player has seen at any point on this floor. Cleared by
    /// [`Sim::descend`] and by a fresh [`init`], never otherwise -- this is the
    /// "remembered" half of the fog, and forgetting it mid-floor would be a
    /// level that un-explores itself.
    ///
    /// Sized once to [`MAP_MAX`] where this struct is built and only ever
    /// written in place, the same discipline [`Sim::route`] keeps: nothing here
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

    /// The waypoints a dragged path still has to reach, `route[0]` being the leg
    /// currently expressed as the world's `Order::Goto`.
    ///
    /// Here for the same reason [`Sim::portal`] is: one standing order per
    /// faction is the sim's whole input channel and a route is a convenience
    /// over it, so a queue of destinations is a rule about a *game* rather than
    /// something the fight simulator has any business knowing about.
    ///
    /// A `Vec` that is only ever `clear()`ed and pushed within [`ROUTE_MAX`], so
    /// it allocates once and never again -- see the crate docs on the frame
    /// buffer for why an allocation that grows linear memory detaches every
    /// typed array the page is holding.
    route: Vec<Vec2>,
    /// Ticks the hero has spent not making progress along `route[0]`. See
    /// [`Sim::follow_route`] for what it is for.
    route_still: u32,
    /// Where the hero was when `route_still` was last reset.
    route_mark: Vec2,

    // ---- manual control
    /// Which halves of the hero the player has taken: see [`CONTROL_FEET`] and
    /// [`CONTROL_LIMB`]. Independent bits on purpose -- steering a swordsman
    /// and steering a sword are different skills, and being able to hand over
    /// one without the other is most of what makes the page teach anything.
    control: u32,
    input_move: Vec2,
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
    cached: Command,
    /// The host's own decision clock for the hero.
    ///
    /// Necessary and easy to miss: `World::submit` pushes `next_decision` out by
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

    /// Each entity's swing phase as of the end of the last tick, indexed by
    /// entity index like `flashes`.
    ///
    /// The whole of the `declare` feed. There is no sim event for "an attack
    /// began" and there does not need to be one, because the phase is already
    /// in the frame -- but the *transition* is not, and it is the transition
    /// the page wants. Kept on this side because a Punch's windup is five
    /// ticks (`action.rs`) and at 60 Hz that can begin and end entirely between
    /// two `requestAnimationFrame` callbacks: JavaScript differencing successive
    /// frames would simply never see it.
    swings: Vec<Swing>,

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

impl Sim {
    fn new(seed: u64) -> Sim {
        // The hero the first floor is entered with. A plain Fighter, which is
        // what the sandbox room always opened with; the level decides where it
        // stands, and every later floor carries whatever it has become.
        let hero_spec = UnitSpec {
            kind: Body::Fighter,
            faction: Faction::Heroes,
            stats: Body::Fighter.base_stats(),
            loadout: Body::Fighter.default_loadout(),
            spawn: Vec2::ZERO,
        };
        Sim::on(&Scenario::dungeon(seed, 0, hero_spec), seed)
    }

    /// The page's sim, opened on a given scenario.
    ///
    /// Split out of [`Sim::new`] so that a caller who wants a *particular*
    /// level can have one -- which in practice means the tests, most of which
    /// are about the boundary rather than about the level and would rather not
    /// have a generated level's monsters walking into them.
    fn on(scenario: &Scenario, seed: u64) -> Sim {
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
                spawn: Vec2::ZERO,
            });
        let world = Sim::open(scenario, seed);
        let mut units = Vec::with_capacity(scenario.units.len());
        for faction in [Faction::Heroes, Faction::Monsters] {
            units.extend_from_slice(&world.alive_ids(faction));
        }
        // **The hero thinks; the monsters flail.** The two sides do not open on
        // the same policy, and the asymmetry is the page's whole subject.
        //
        // [`PolicyKind::Utility`] is the naive baseline, and one of the things
        // it is naive about is the loadout: it never changes what is in its
        // hand, and its footwork does not look at what is in there either --
        // `engage` closes to `full_reach * spacing` and swings, whether that
        // hand holds a sword, a shield or nothing at all. Which is exactly right
        // for the thing a better fighter is measured against, and exactly wrong
        // for the character the player is dressing: put a guard in its hand from
        // the Hero rail and it charges, put legs in and it sprints at the enemy
        // barehanded, because nothing in that policy has an opinion about what a
        // guard is *for*.
        //
        // [`PolicyKind::Duelist`] is the one that dispatches to `policy::minds`
        // -- one mind per role, each with its own reading of the fight. That is
        // what makes the Action control worth having: the loadout you choose
        // changes how the character *moves*, not just what it swings.
        //
        // Both are still switchable from either rail, and the monsters stay
        // naive so that the difference is something you can watch rather than
        // something this comment asserts.
        let kinds = [PolicyKind::Duelist, PolicyKind::Utility];
        Sim {
            world,
            policies: [kinds[0].baseline(), kinds[1].baseline()],
            kinds,
            genomes: [
                kinds[0].spec().baseline_genome(),
                kinds[1].spec().baseline_genome(),
            ],
            units,
            due: Vec::with_capacity(scenario.units.len()),
            last_decision_tick: 0,
            spawns: 0,
            depth: 0,
            map_revision: 0,
            portal: scenario.portal,
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
            // Allocated once, at its ceiling, for the same reason `events`
            // below is: a push that grew linear memory would detach the typed
            // array the client reads the frame through, and a drag pushes.
            route: Vec::with_capacity(ROUTE_MAX),
            route_still: 0,
            route_mark: Vec2::ZERO,
            control: 0,
            input_move: Vec2::ZERO,
            input_aim: Angle::ZERO,
            input_reach: Fx::ZERO,
            input_strike: Strike::None,
            input_slot: 0,
            cached: Command::HOLD,
            hero_next_decision: 0,
            flashes: Vec::new(),
            // Allocated once, at its ceiling, so no frame's event feed can grow
            // linear memory and detach the typed array the client is about to
            // read the frame through.
            events: Vec::with_capacity(MAX_EVENTS),
            swings: Vec::new(),
            spawn_spec: UnitSpec {
                kind: Body::Skitterer,
                faction: Faction::Monsters,
                stats: Body::Skitterer.base_stats(),
                loadout: Body::Skitterer.default_loadout(),
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
        }
    }

    /// Builds the world a scenario describes, with both objective channels
    /// switched on.
    ///
    /// **Routing is opt-in, and the page opts in.** `set_goto` is the whole of
    /// click-to-move, and with masonry in the level "walk toward that bearing"
    /// and "walk to that point" stopped being the same instruction. The sim
    /// owns the floor plan, so it is the only thing that can answer the second
    /// -- but it answers only when asked, which is what keeps every scenario
    /// the lab drives behaving exactly as it did.
    ///
    /// The monsters hunt, which is a creature that knows where you are. See
    /// `UtilityPolicy::march` for why that is a decision rather than an
    /// oversight.
    ///
    /// One function rather than two copies, because [`Sim::new`] and
    /// [`Sim::descend`] have to agree about this and a level that quietly
    /// opened without an objective would be a level where nothing moves.
    fn open(scenario: &Scenario, seed: u64) -> World {
        let mut world = World::new(scenario, seed);
        world.set_objective(Faction::Heroes, Objective::Order);
        world.set_objective(Faction::Monsters, Objective::Hunt);
        world
    }

    /// Whether the way out will take the hero: every monster down, and the hero
    /// standing on it.
    ///
    /// Counted off [`World::alive_count`] rather than off the frame's unit
    /// rows, which are capped at [`MAX_UNITS`]: the authority on "is the level
    /// clear" must not be a number that saturates.
    fn portal_state(&self) -> u32 {
        match self.portal {
            None => PORTAL_NONE,
            Some(_) if self.world.alive_count(Faction::Monsters) > 0 => PORTAL_SHUT,
            Some(_) => PORTAL_OPEN,
        }
    }

    /// Whether the hero is standing in an open way out.
    fn hero_is_leaving(&self) -> bool {
        if self.portal_state() != PORTAL_OPEN {
            return false;
        }
        let (Some(portal), Some(hero)) = (self.portal, self.hero()) else {
            return false;
        };
        self.world
            .view(hero)
            .is_some_and(|v| v.position.distance(portal) <= PORTAL_RADIUS + v.radius)
    }

    /// Makes `route[0]` the standing order.
    ///
    /// **This touches simulation state**, and that is worth saying out loud here
    /// because the queue itself does not: `World::set_order` rebuilds the
    /// faction's flow field, and an order is one of the things
    /// `World::state_hash` fingerprints. So a route call moves the hash, exactly
    /// as a click does. The five golden scripts are unaffected only because not
    /// one of them calls a route export -- do not add one to a golden script.
    fn begin_leg(&mut self) {
        if let Some(&next) = self.route.first() {
            self.world.set_order(Faction::Heroes, Order::Goto(next));
            self.route_still = 0;
            self.route_mark = self.hero_position();
        }
    }

    /// Forgets the queued path without touching the order.
    fn clear_route(&mut self) {
        self.route.clear();
        self.route_still = 0;
    }

    /// Walks the queued path one leg at a time.
    ///
    /// Called once per tick from [`Sim::advance`], beside
    /// [`Sim::hero_is_leaving`] and for the same reason: one animation frame is
    /// up to eight ticks, and a page-side arrival test would overshoot a
    /// waypoint by that much on every stutter.
    ///
    /// `Vec::remove(0)` is O(n) on a 24-element vector of `Vec2` -- some 200
    /// bytes memmoved, a few times a walk. A `VecDeque` would be the textbook
    /// answer and is the wrong one here: it would be a second allocation shape
    /// for no measurable gain, and this workspace has an explicit preference for
    /// a `Vec` with a read head over a `VecDeque` where it matters (see
    /// `Dungeon::distances`). If it ever does matter, add a read head; do not
    /// change the container.
    fn follow_route(&mut self) {
        if self.route.len() < 2 {
            // The last leg is left standing. `Order::Goto` at the final waypoint
            // is exactly what the player asked for, and what stops the character
            // there is the leash going slack as it closes -- a queue that popped
            // its last entry would leave the character holding an order it had no
            // reason to have finished with.
            //
            // That used to read "the policy's own arrival deadband is what stops
            // there", and the correction is worth keeping rather than quietly
            // swapping: there is no deadband any more, and with it went the idea
            // that arriving is an event somebody declares. It is a limit the
            // approach tends to, which is precisely why nothing down here has to
            // be told about it.
            return;
        }
        let Some(hero) = self.hero() else { return };
        let Some(view) = self.world.view(hero) else {
            return;
        };

        // **Measured against the point the router actually aims at, not the raw
        // click.** The sim pulls a destination out of the masonry per body before
        // it routes to it, so a waypoint the drag laid across a wall is satisfied
        // where a body of this width can really get -- and asking about the raw
        // point instead would hang on every leg the player's hand cut a corner
        // on.
        let target = self.world.nearest_walkable(self.route[0], view.radius);
        let arrived = view.position.distance(target) <= ROUTE_ARRIVE + view.radius;

        // And the guard for a leg that is not merely awkward but sealed: a region
        // the hero cannot reach at all. The nav field reports no route, the
        // policy holds, and nothing else would ever move this queue on.
        if view.position.distance(self.route_mark) > ROUTE_PROGRESS {
            self.route_mark = view.position;
            self.route_still = 0;
        } else {
            self.route_still = self.route_still.saturating_add(1);
        }

        if arrived || self.route_still >= ROUTE_STALL {
            self.route.remove(0);
            self.begin_leg();
        }
    }

    /// A focus order outlives its quarry by exactly one tick.
    ///
    /// Converted to a `Goto` at the hero's own feet rather than cleared, and the
    /// difference is the whole of the rule. [`Order::Hold`] is free will, which
    /// puts the character back on `UtilityPolicy`'s search behaviour -- in an
    /// empty room a slow drift toward the middle, measured under [`clear_order`]
    /// -- and that walks it off the ground it has just spent a fight winning.
    /// What the player asked for by naming that enemy was to be *there*, and a
    /// `Goto` on the spot is the same thing the page's stand-down expresses, for
    /// the same reason. Not auto-acquiring the next enemy either: choosing the
    /// next fight is the player's move, not the module's.
    ///
    /// **Per tick and not per frame**, beside [`Sim::follow_route`] and on its
    /// argument: one animation frame is up to eight ticks of catch-up, so a
    /// page-side death test would leave the hero steering at a corpse for that
    /// long -- visibly, and on exactly the frame a kill happened.
    ///
    /// The generation half of the handle earns its keep here. `World::is_alive`
    /// resolves both halves, so a quarry whose slot has already been handed to
    /// the next spawn still reads as dead; a check on the index alone would
    /// quietly transfer the lock to whatever walked in.
    fn expire_focus(&mut self) {
        let Order::Focus(id) = self.world.order(Faction::Heroes) else {
            return;
        };
        if self.world.is_alive(id) {
            return;
        }
        // [`Sim::hero_position`] falls back to the middle of the arena when
        // nobody is standing, which is not a destination anyone asked for. It
        // cannot become one: the only way back from a fallen hero is
        // [`Sim::swap_in_hero`], and that writes `Order::Hold` over whatever is
        // standing here before the newcomer takes a step.
        let here = self.hero_position();
        self.world.set_order(Faction::Heroes, Order::Goto(here));
    }

    /// Builds the next floor down and moves the run onto it.
    ///
    /// The hero persists and its health does not: `World::spawn` sets `hp` to
    /// `max_hp` and refills the regeneration budget, so arriving whole costs no
    /// code here at all. What it does cost is every piece of presentation state
    /// keyed to bodies that no longer exist -- flashes, swings, the event feed
    /// -- and dropping those is the whole of the rest of this function.
    fn descend(&mut self) {
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

        let scenario = Scenario::dungeon(self.world.seed(), self.depth, self.hero_spec);
        self.world = Sim::open(&scenario, self.world.seed());
        self.units.clear();
        for faction in [Faction::Heroes, Faction::Monsters] {
            self.units.extend_from_slice(&self.world.alive_ids(faction));
        }
        self.portal = scenario.portal;
        // The waypoints describe a floor plan that no longer exists. Nothing
        // else here would drop them: the queue is not keyed to a body, so unlike
        // the three lines below it would survive the level it was drawn on.
        self.clear_route();
        self.flashes.clear();
        self.swings.clear();
        self.events.clear();
        self.last_decision_tick = 0;
        self.hero_next_decision = 0;
        self.cached = Command::HOLD;
        self.map_revision = self.map_revision.wrapping_add(1);
        // And the fog, which is the floor plan's other half and forgotten with
        // it. `VIS` itself is left alone: `refresh_vis` runs before the next
        // frame is written and `Dungeon::visible_tiles` clears what it is given,
        // so the buffer is overwritten wholesale rather than needing a wipe here.
        self.seen.fill(0);
        self.vis_at = None;
        self.vis_revision = self.vis_revision.wrapping_add(1);
        write_map(&self.world);
    }

    /// The standing hero, if there is one.
    fn hero(&self) -> Option<EntityId> {
        self.units
            .iter()
            .copied()
            .find(|&id| self.world.view(id).is_some_and(|v| v.faction == Faction::Heroes))
    }

    /// Whether the hero's limb is idle enough to have what it is holding
    /// rewritten from outside. See [`set_hero_loadout`].
    fn hero_limb_at_guard(&self) -> bool {
        self.hero()
            .and_then(|hero| self.world.view(hero))
            .is_some_and(|view| view.limb.swing == sim::Swing::Guard)
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

    /// Sets the policy for one faction, rebuilding it from that faction's genes.
    fn set_policy(&mut self, faction: Faction, kind: PolicyKind) {
        let side = faction.index();
        self.kinds[side] = kind;
        self.genomes[side] = kind.spec().baseline_genome();
        self.policies[side] = kind.build(&self.genomes[side]);
    }

    /// Moves one knob and rebuilds. Rebuilding rather than mutating in place is
    /// what keeps this honest for policies that derive anything at
    /// construction, and it costs one allocation on a slider drag.
    fn set_gene(&mut self, faction: Faction, index: usize, gene: Fx) {
        let side = faction.index();
        if index >= self.kinds[side].spec().len() {
            return;
        }
        self.genomes[side][index] = gene.clamp(Fx::ZERO, Fx::ONE);
        self.policies[side] = self.kinds[side].build(&self.genomes[side]);
    }

    /// `frames` ticks of the full loop.
    ///
    /// Deliberately not [`policy::run`]: that loop gates on `World::outcome()`,
    /// which reports `HeroesWin` from tick zero when there is nothing left to
    /// fight, so it would return before the hero took a step.
    ///
    /// The answering half is not optional either. `expire_unanswered_decisions`
    /// advances an agent's decision clock even when nothing answered it, so a
    /// loop that only called `world.step()` would leave the hero executing its
    /// tick-zero command forever -- which under a `Goto` means walking straight
    /// through the destination and into the far wall.
    fn advance(&mut self, frames: u32) {
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
        for _ in 0..frames {
            for flash in &mut self.flashes {
                flash.hit = flash.hit.saturating_sub(1);
                flash.block = flash.block.saturating_sub(1);
                flash.parry = flash.parry.saturating_sub(1);
            }

            let driven = (self.control != 0).then(|| self.hero()).flatten();
            due.clear();
            due.extend_from_slice(self.world.pending_decisions());
            for &id in &due {
                if Some(id) == driven {
                    continue; // answered below, every tick, from live input
                }
                let obs = self.world.observe(id);
                let faction = obs.faction;
                let command = self.policies[faction.index()].decide(&obs);
                self.world.submit(id, command);
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
            for event in self.world.step() {
                let pair = match *event {
                    Event::Damage {
                        target,
                        amount,
                        at,
                        ..
                    } => {
                        // The numbers, kept rather than reduced to a flash. The
                        // flash counters below say *that* something landed; a
                        // damage row says how much and exactly where, which is
                        // the difference between a body glowing red and a number
                        // floating off it.
                        push_event(
                            &mut events,
                            FrameEvent {
                                kind: EVENT_DAMAGE,
                                at,
                                amount,
                                actor: target.index,
                            },
                        );
                        [(target, 0u8), (EntityId::NONE, 0)]
                    }
                    Event::Block {
                        defender,
                        absorbed,
                        at,
                        ..
                    } => {
                        push_event(
                            &mut events,
                            FrameEvent {
                                kind: EVENT_BLOCK,
                                at,
                                amount: absorbed,
                                actor: defender.index,
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
                            FrameEvent {
                                kind: EVENT_PARRY,
                                at,
                                amount: Fx::ZERO,
                                actor: a.index,
                            },
                        );
                        [(a, 2), (b, 2)]
                    }
                    // Both of these are already on screen without a flash. A
                    // death removes a body; a loose *adds an arrow*, at the
                    // nock, pointing where it is going -- which is a better
                    // announcement than a one-frame glow could be, and unlike
                    // `hit_flash` there is nothing here the frame cannot show.
                    Event::Death { .. } | Event::Loose { .. } => continue,
                };
                for mark in pair {
                    if !mark.0.is_none() && count < marks.len() {
                        marks[count] = mark;
                        count += 1;
                    }
                }
            }
            for &(entity, slot) in &marks[..count] {
                match slot {
                    0 => self.flash(entity, |f| &mut f.hit),
                    1 => self.flash(entity, |f| &mut f.block),
                    _ => self.flash(entity, |f| &mut f.parry),
                }
            }

            // After the tick, so the phases being compared are both settled
            // ones. See [`Sim::note_declares`].
            self.note_declares(&mut events);

            // Before the way-out test below, not after. A leg that finishes on
            // the same tick the hero steps onto the portal should still be the
            // level that was left -- and [`Sim::descend`] drops the queue anyway,
            // so ordering it the other way round would only lose the leg.
            self.follow_route();

            // And the lock, immediately after the queue and on the same
            // argument: a quarry can fall on any tick of a catch-up burst, so
            // the resolution this rule runs at is the resolution the player
            // watches it at. Before the way-out test below for the same reason
            // the queue is, too -- a kill that empties the level on the tick
            // the hero steps onto the portal is still this level's kill.
            //
            // The two cannot fight over the order in one tick, so the ordering
            // here is a matter of reading rather than of behaviour: a standing
            // `Order::Focus` means an empty queue, because [`set_focus`] drops
            // the path on the way in, and a queue with legs left in it means
            // the order is a `Goto`, which is the first thing `expire_focus`
            // returns on.
            self.expire_focus();

            // **And out of the loop entirely if the run just moved on.** Not
            // "carry on in the new world": the flash counters, the swing table
            // and the event feed collected above are all keyed to bodies that
            // no longer exist, so letting the rest of a catch-up burst run on a
            // fresh level would print the old level's damage numbers over the
            // new one. The next `step` picks it up.
            if self.hero_is_leaving() {
                events.clear();
                self.due = due;
                self.events = events;
                self.descend();
                return;
            }
        }
        self.due = due;
        self.events = events;
    }

    /// Emits a `declare` row for every unit that just began an attack.
    ///
    /// The mockup's *"current action"* bubble: the popup that tells you which
    /// action an enemy has just committed to. Derived here rather than in the
    /// page, and the reason is timing rather than tidiness. A Punch has a
    /// five-tick windup (`action.rs`), so at 60 Hz an attack can begin and end
    /// entirely between two `requestAnimationFrame` callbacks -- a page
    /// differencing the `limb_swing` column across successive frames would
    /// never see it happen. The module sees every tick by construction.
    ///
    /// `Guard | Recover -> Windup | Strike` is the transition, and the second
    /// half of each side is load-bearing. `Recover` because a fighter that
    /// chains two cuts passes through recovery and not through guard, so
    /// watching only for `Guard ->` would announce the first blow of a flurry
    /// and none of the rest. `-> Strike` because a zero-windup action has no
    /// telegraph phase at all and would otherwise never be announced.
    fn note_declares(&mut self, events: &mut Vec<FrameEvent>) {
        for i in 0..self.units.len() {
            let id = self.units[i];
            // A dead handle simply has no phase to compare. Its slot keeps
            // whatever it last held, which the next occupant overwrites on its
            // own first tick -- a stale `Strike` there could at worst *suppress*
            // one announcement, never invent one.
            let Some(view) = self.world.view(id) else {
                continue;
            };
            let slot = id.index as usize;
            if slot >= self.swings.len() {
                self.swings.resize(slot + 1, Swing::Guard);
            }
            let was = self.swings[slot];
            let now = view.limb.swing;
            self.swings[slot] = now;
            let began = matches!(was, Swing::Guard | Swing::Recover)
                && matches!(now, Swing::Windup | Swing::Strike);
            if began {
                push_event(
                    events,
                    FrameEvent {
                        kind: EVENT_DECLARE,
                        at: view.position,
                        // The action code, not the phase: what the bubble names
                        // is the thing being swung, and the page already has a
                        // name and an icon per code from the registry.
                        amount: Fx::from_int(view.action.code() as i32),
                        actor: id.index,
                    },
                );
            }
        }
    }

    /// Submits the hero's command for this tick, blending the policy's opinion
    /// with whatever the player is holding.
    fn drive_hero(&mut self, hero: EntityId) {
        if self.world.tick() >= self.hero_next_decision {
            let obs = self.world.observe(hero);
            self.cached = self.policies[Faction::Heroes.index()].decide(&obs);
            self.hero_next_decision = self.world.tick() + obs.decision_period.max(1) as u32;
            self.last_decision_tick = self.world.tick();
        }

        let mut command = self.cached;
        if self.control & CONTROL_FEET != 0 {
            command.move_dir = self.input_move;
        }
        if self.control & CONTROL_SLOT != 0 {
            command.slot = self.input_slot;
        }
        if self.control & CONTROL_LIMB != 0 {
            // What the limb command *means* follows what the limb is holding,
            // and the player does not get to choose which reading applies -- a
            // shield has no cut in it and a blade has no bracing.
            let guarding = self
                .world
                .held(hero)
                .is_some_and(|(_, action)| action.role().blocks());
            command.limb = if guarding {
                // A guard takes a bearing and how far it is braced.
                LimbCommand::new(self.input_aim, self.input_reach)
            } else {
                // The pointer is the line and the button is the cut. Note what
                // the player does *not* get to say: how far the blade extends,
                // or where it goes between phases. Those belong to the attack,
                // and handing them over is exactly how the blade became a stick
                // that dangled at full length forever.
                LimbCommand::attack(self.input_aim, self.input_strike)
            };
        }
        // Nothing about this reaches past the agent boundary: it is an
        // `Observation` in and an `Command` out, same as any policy, and the sim
        // still cannot tell which of them wrote it.
        self.world.submit(hero, command);
    }

    /// Walks one monster into the running room. Answers how many monsters are
    /// now alive, which is zero only when nothing arrived.
    fn spawn_monster(&mut self, kind: Body, loadout: Loadout) -> u32 {
        self.walk_in(UnitSpec {
            kind,
            faction: Faction::Monsters,
            stats: kind.base_stats(),
            loadout,
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
        let id = self.world.spawn(&spec);
        // The step that is easy to miss: a spawned entity thinks, moves and
        // fights whether or not it is in this vector. It is simply invisible
        // until it is.
        self.units.push(id);
        self.world.alive_count(Faction::Monsters) as u32
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
    /// *body* change still resets the sheet, because `set_hero_body` writes the
    /// plan through `UnitSpec::set_body` and a Rogue wearing a Fighter's
    /// numbers is a different claim than "keep my attributes".
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
        if self.hero_spec.kind != kind {
            self.hero_spec.set_body(kind);
        }
        self.hero_spec.loadout = loadout;

        let mut rng = self.placement_rng();
        let spawn = self.entry_point(kind, &mut rng);
        let id = self.world.spawn(&UnitSpec {
            kind,
            faction: Faction::Heroes,
            stats: self.hero_spec.stats,
            loadout,
            spawn,
        });
        self.units.push(id);

        // The dead character's standing order outlived it, for the same reason
        // the refusal above exists: the order is the faction's. Inheriting it
        // would have a newcomer set off for wherever the last one was walking
        // when it was killed -- which, nine times in ten, is into the thing that
        // killed it. `Hold` hands it back to its own judgement, and that is also
        // what the page's order panel then honestly reads.
        self.world.set_order(Faction::Heroes, Order::Hold);
        // And the dragged path with it, on the identical argument: the queue is
        // the faction's too, so it outlives the body it was drawn for, and the
        // newcomer would set off walking the rest of a path that ended where the
        // last one was killed.
        self.clear_route();
        // This character has not thought yet, and the page flashes a ring every
        // time the number below changes. Left as it was, the newcomer would
        // arrive taking credit for the dead one's last decision.
        self.last_decision_tick = 0;
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

    /// Where a replacement character comes in.
    ///
    /// Not the ring [`Sim::spawn_point`] uses, and the difference is the whole
    /// point: the last character died where the fight was, so anywhere measured
    /// from *it* is the middle of the mob. The same sixteen bearings are swept
    /// around the centre of the room instead, and the candidate standing
    /// furthest from the nearest monster wins.
    ///
    /// Furthest, not merely far enough: a replacement arriving inside somebody's
    /// reach is dead before it has taken a decision, and a swap button that
    /// hands you a corpse is worse than no swap button. It is a fair entry
    /// rather than a generous one -- it says nothing about which way the
    /// monsters walk next, and they will have noticed by the time it thinks.
    ///
    /// With nothing hostile in the room every candidate is equally clear, the
    /// strict comparison never fires, and the answer is the middle of the floor
    /// -- or, on a carved level, the nearest standing room to it.
    fn entry_point(&self, kind: Body, rng: &mut Rng) -> Vec2 {
        let arena = self.world.arena();
        let radius = kind.radius();
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
        // keeps [`FRAME_LAYOUT_VERSION`] at 6 and the hardcoded `HEADER_LEN` in
        // `tools/wasm_check.js` and `web/main.js` untouched.
        //
        // A handle that no longer resolves cannot actually reach the `ZERO`
        // branch through [`step`]: [`Sim::expire_focus`] runs inside the tick
        // loop and [`publish`] runs after it, so a dead quarry's order is
        // already a `Goto` by the time a frame is written. The fallback is
        // there because this function has to be total, and no body is the
        // honest answer to where a body is.
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
            write_unit(
                &mut frame[HEADER_LEN + count * UNIT_STRIDE..],
                &view,
                self.flash_of(id),
                visible,
            );
            count += 1;
        }
        frame[6] = count as f32;

        // Arrows, in a block of their own after the units. After rather than
        // interleaved because the unit block is variable length and every unit
        // row's internal offsets have to stay where the page expects them --
        // only the base of this section moves.
        let mut shots = 0;
        for shot in self.world.shots() {
            if shots == MAX_SHOTS {
                break;
            }
            let row = &mut frame[HEADER_LEN + count * UNIT_STRIDE + shots * SHOT_STRIDE..];
            row[0] = shot.position.x.to_f32();
            row[1] = shot.position.y.to_f32();
            // The binary angle raw, exactly as `limb_angle_raw` is carried: the
            // client owns the conversion and no transcendental runs in here.
            row[2] = shot.heading.raw() as f32;
            row[3] = shot.faction.index() as f32;
            shots += 1;
        }
        frame[7] = shots as f32;

        // Events, in a third block after the arrows, and after them for exactly
        // the argument the arrows make against being interleaved: only the base
        // of a trailing section moves as the counts change. Last of the three
        // because it is the newest and the one most likely to grow again.
        let base = HEADER_LEN + count * UNIT_STRIDE + shots * SHOT_STRIDE;
        let events = self.events.len().min(MAX_EVENTS);
        for (i, event) in self.events[..events].iter().enumerate() {
            let row = &mut frame[base + i * EVENT_STRIDE..];
            row[0] = event.kind as f32;
            row[1] = event.at.x.to_f32();
            row[2] = event.at.y.to_f32();
            row[3] = event.amount.to_f32();
            row[4] = event.actor as f32;
        }
        frame[8] = events as f32;

        base + events * EVENT_STRIDE
    }
}

/// Copies a world's floor plan into the tile buffer.
///
/// Called only where the floor plan can have changed -- [`init`] and
/// [`Sim::descend`] -- and deliberately **not** from [`publish`], which runs on
/// every export. Rewriting 1536 bytes on every slider drag would be harmless
/// and would make [`map_revision`] meaningless, and the revision is the whole
/// mechanism by which the page knows when to re-bake a level.
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

/// Appends a row unless the frame is already carrying [`MAX_EVENTS`] of them.
///
/// **Overflow drops the tail, on purpose.** The alternative -- a ring that
/// keeps the newest -- would drop the *first* blows of a busy tick, and those
/// are the ones the eye follows. Losing the thirty-third floating number in one
/// animation frame is not something a player can notice; losing the one that
/// started the exchange is.
fn push_event(events: &mut Vec<FrameEvent>, event: FrameEvent) {
    if events.len() < MAX_EVENTS {
        events.push(event);
    }
}

fn write_unit(row: &mut [f32], view: &UnitView, flash: Flash, visible: bool) {
    row[0] = view.position.x.to_f32();
    row[1] = view.position.y.to_f32();
    // The binary angle, not radians: the client multiplies by 2pi/65536 and
    // does its own trigonometry, so no transcendental function ever runs on
    // this side of the boundary.
    row[2] = f32::from(view.facing.raw());
    row[3] = view.radius.to_f32();
    row[4] = view.hp.to_f32();
    row[5] = view.max_hp.to_f32();
    row[6] = view.faction.index() as f32;
    row[7] = kind_code(view.kind) as f32;
    row[8] = intent_code(view.intent) as f32;
    // The identity, so the client can tell "this body lost health" from "the
    // row above it died and everything shifted up". See the crate docs.
    row[9] = view.id.index as f32;
    row[10] = view.id.generation as f32;

    // The limb. Bearings ship as raw binary angles like `facing`, so the one
    // float conversion in the stack stays on the way out.
    let limb = view.limb;
    row[11] = f32::from(limb.angle.raw());
    row[12] = limb.reach.to_f32();
    row[13] = limb.spin.to_f32();
    row[14] = view.spec.length.to_f32();
    row[15] = f32::from(view.spec.arc);

    row[16] = flash_level(flash.hit);
    row[17] = flash_level(flash.block);
    row[18] = flash_level(flash.parry);

    // The attack, so the page can draw a telegraph rather than a blow that
    // arrives out of nowhere. `line` is where the cut is aimed, which during a
    // windup is nowhere near where the blade is pointing -- that gap is the
    // read, and it is the one thing worth drawing.
    row[19] = limb.swing.discriminant() as f32;
    row[20] = f32::from(limb.swing_left);
    row[21] = f32::from(limb.line.raw());

    // The loadout. What is in hand, what kind of thing it is, and what the
    // fighter is carrying -- so the page can draw a blade or an arc from the
    // role rather than guessing from the numbers, and show a loadout without
    // keeping its own copy of one.
    row[22] = view.action.code() as f32;
    row[23] = view.action.role().discriminant() as f32;
    row[24] = view.slot as f32;
    row[25] = slot_code(view.loadout.slot(0));
    row[26] = slot_code(view.loadout.slot(1));

    // How far this body can see, in world units, straight from the stat sheet
    // the observation code reads. The page drew a vision ring from its own copy
    // of `(60 + 6 * perception) / 10` until this column existed, which was the
    // last mirrored sim formula in `main.js` -- and the one with the shortest
    // remaining life, because the hero's perception is a live dial now.
    row[27] = view.stats.sight_range().to_f32();

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
    row[28] = f32::from(u8::from(visible));
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

/// What a unit is trying to do, in the same encoding `Command` hashes with.
const fn intent_code(intent: Intent) -> u32 {
    match intent {
        Intent::Hold => 0,
        Intent::Attack(_) => 1,
        Intent::Flee => 2,
    }
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
            FRAME.with(|frame| sim.write_frame(&mut frame.borrow_mut()))
        }
        None => HEADER_LEN,
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

/// Opens an empty room with one hero. Safe to call again to start over.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn init(seed: u32) {
    SIM.with(|sim| {
        let fresh = Sim::new(u64::from(seed));
        // The floor plan crosses on its own buffer and only when it changes;
        // this is one of the two places it can have.
        write_map(&fresh.world);
        *sim.borrow_mut() = Some(fresh);
    });
    // A fresh `Sim` supplies an empty `seen`, a `vis_at` of `None` and a
    // `vis_revision` of zero by construction, so unlike `Sim::descend` there is
    // nothing to reset here -- but `VIS` is a `thread_local!` and survives this,
    // holding the last level of the last `init` on this thread. It needs no
    // explicit wipe either, and that is worth saying because it is not obvious:
    // `Dungeon::visible_tiles` clears the buffer it is handed, so the
    // `refresh_vis` inside the `publish` below overwrites it wholesale.
    publish();
}

/// A click, as thousandths of a world unit.
///
/// Integers, so that no float ever crosses into simulation state -- the rule
/// the whole determinism contract rests on. A thousandth of a unit is a
/// fifteen-hundredth of `LEASH_ROAM`, the ring an order is satisfied anywhere
/// inside, and about a twentieth of a pixel on the canvas this feeds, so the
/// truncation is not observable. This was measured against the arrival deadband
/// until there stopped being one; the ring is what replaced it, and it is the
/// wider of the two, so the margin only grew.
///
/// Total for any `i32`: JavaScript's `ToInt32` *wraps* rather than clamps, so a
/// wild coordinate can arrive here, and `Fx::from_ratio` saturates rather than
/// overflowing. The policy then clamps the destination into the box a body can
/// actually stand in, so even a nonsense point produces a sane walk.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn set_goto(x_milli: i32, y_milli: i32) {
    let dest = Vec2::new(Fx::from_ratio(x_milli, 1000), Fx::from_ratio(y_milli, 1000));
    with_sim((), |sim| {
        // A plain click cancels a dragged path. Deliberately not expressed as
        // "a one-point route": the page distinguishes a tap from a drag, and
        // the module should not have to guess which one it just received.
        sim.clear_route();
        sim.world.set_order(Faction::Heroes, Order::Goto(dest));
    });
    publish();
}

/// Names the enemy to fight. Answers `1` if the lock took and `0` if the handle
/// does not name a living monster.
///
/// **Both halves of the handle cross the wall, and that is not belt and
/// braces.** A dead unit's slot is handed to the next spawn, so an index on its
/// own would let a click on a corpse land on whatever walked in afterwards --
/// the same argument the module docs make for `entity_index` and
/// `entity_generation` being two columns rather than one. The frame publishes
/// both (`row[9]`, `row[10]`) precisely so the page can send them back.
///
/// Refused for anything that is not a live Monster. The hero is not a target,
/// and a stale handle is a click on something that has already fallen; both
/// should leave the standing order exactly as it was rather than quietly
/// becoming something else. That is why the refusal is a `0` and not a fall
/// through to [`clear_order`] -- a mis-aimed click is not a request to hand the
/// feet back, and a page that wanted that can say so itself.
///
/// **This touches simulation state**, exactly as [`set_goto`] and
/// [`Sim::begin_leg`] do: `World::set_order` rebuilds the faction's flow field,
/// and an order is one of the things `World::state_hash` fingerprints. The
/// golden scripts are unaffected only because not one of them calls this --
/// do not add one that does.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn set_focus(index: u32, generation: u32) -> u32 {
    let id = EntityId::new(index, generation);
    let taken = with_sim(0, |sim| {
        // One lookup answers both refusals, because `World::view` resolves the
        // *full* handle: a body that has fallen gives `None` here even when its
        // slot has already been reused, so "gone" and "not a monster" collapse
        // into a single comparison rather than a liveness test followed by a
        // faction test that could only disagree with it.
        if sim.world.view(id).map(|v| v.faction) != Some(Faction::Monsters) {
            return 0;
        }
        // A tap cancels a dragged path, exactly as [`set_goto`] says it does --
        // and here it has to, because a surviving queue would call
        // [`Sim::begin_leg`] on its next leg test and write a `Goto` straight
        // over the lock, taking the hero off the quarry a moment after the
        // player named it.
        sim.clear_route();
        sim.world.set_order(Faction::Heroes, Order::Focus(id));
        1
    });
    publish();
    taken
}

/// Withdraws the standing order and leaves the hero to its own judgement.
///
/// Not a stop button, and the page must not present it as one. `Order::Hold`
/// with nothing in sight puts the character back on `UtilityPolicy`'s search
/// behaviour, which in an empty room is a slow drift toward open ground -- the
/// middle. Measured: released 5.7 units out from centre, back within 0.3 of it
/// after 900 ticks. Stopping dead where it stands would be a different order
/// (`Goto` its own position) and a different design decision.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn clear_order() {
    with_sim((), |sim| {
        // Free will means no order *and* no path. A queue that survived this
        // would re-issue a `Goto` on the next leg test and quietly take the feet
        // back off the character this button just handed them to.
        sim.clear_route();
        sim.world.set_order(Faction::Heroes, Order::Hold);
    });
    publish();
}

// ------------------------------------------------------------------ the route
//
// A queue of destinations over the one standing order the sim carries, and it
// lives on this side of the wall for the same reason the portal rule does:
// `Order` is the player's whole input channel, and a route is a convenience over
// it rather than a second channel.
//
// **The leg test runs per tick, not per frame.** [`Sim::advance`] can be handed
// eight ticks of catch-up in one animation frame, so a page-side arrival test
// would overshoot a waypoint by that much, visibly, on every stutter. That, and
// not tidiness, is why the queue is not simply JavaScript state calling
// [`set_goto`] as each leg lands.
//
// Three scalar exports rather than a shared input buffer, in the style of
// [`set_goto`]: a drag sends at most [`ROUTE_MAX`] calls on release, and a second
// buffer would be a second detachable view for no gain.

/// Drops the queued path. Leaves the standing order exactly as it is -- this
/// is "forget the rest of the walk", not "stop".
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn route_clear() {
    with_sim((), |sim| sim.clear_route());
    publish();
}

/// Appends a waypoint to the queued path and answers how many legs are now
/// held, or `0` if there is no world.
///
/// The first push also becomes the standing order, so a route starts walking
/// the moment its first point lands rather than on some separate commit call.
///
/// Past [`ROUTE_MAX`] the waypoint is dropped and the count answered unchanged.
/// Refusing rather than rolling the oldest leg off the front: the front of the
/// queue is the leg being walked *now*, and a drag that ran long is not a
/// request to teleport the destination.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn route_push(x_milli: i32, y_milli: i32) -> u32 {
    let point = Vec2::new(Fx::from_ratio(x_milli, 1000), Fx::from_ratio(y_milli, 1000));
    let held = with_sim(0, |sim| {
        if sim.route.len() >= ROUTE_MAX {
            return sim.route.len() as u32;
        }
        sim.route.push(point);
        if sim.route.len() == 1 {
            sim.begin_leg();
        }
        sim.route.len() as u32
    });
    publish();
    held
}

/// Legs still to walk, including the one currently ordered. `0` once the path
/// is finished or was never set.
///
/// An export rather than a header slot, matching [`map_revision`], which the page
/// already reads once a frame in `loop`. It moves inside [`Sim::advance`], so a
/// page that read it before stepping would be a frame behind.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn route_len() -> u32 {
    with_sim(0, |sim| sim.route.len() as u32)
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
    let standing = with_sim(0, |sim| sim.spawn_monster(body, loadout));
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
/// over at 52 health instead of 84. The same policy runs both, and watching the
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

// ---------------------------------------------------------------- behaviour
//
// The whole reason a policy is choosable at runtime: "stats are wired into the
// AI, not into a damage number" is a claim the page can only make convincingly
// by letting you change the AI and watch the same room go differently.
//
// Weights cross as thousandths in both directions, for the same reason
// `set_goto` takes milli-integers -- no float has any business on the inward
// side of this wall.

/// Chooses a faction's policy: `0` heroes, anything else monsters. The policy
/// code is [`PolicyKind::code`]. Answers `1` if it took, `0` if the code was
/// unknown or there is no world yet.
///
/// Resets that faction's weights to the new policy's hand-tuned baseline,
/// because the alternative -- carrying gene 3 across from a policy where it
/// meant `commitment` to one where it means `caution` -- is a slider that
/// silently means something else after a dropdown change.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn set_policy(faction_code: u32, policy_code: u32) -> u32 {
    let kind = match PolicyKind::from_code(policy_code) {
        Some(kind) => kind,
        None => return 0,
    };
    let took = with_sim(0, |sim| {
        sim.set_policy(faction_from_code(faction_code), kind);
        1
    });
    publish();
    took
}

/// Which policy a faction is running, as a [`PolicyKind::code`].
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn policy_kind(faction_code: u32) -> u32 {
    with_sim(0, |sim| {
        sim.kinds[faction_from_code(faction_code).index()].code()
    })
}

/// How many named knobs a faction's policy has. Zero is a legitimate answer --
/// `Idle` and `Random` have none -- and the page should render no sliders
/// rather than treat it as an error.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn policy_weight_count(faction_code: u32) -> u32 {
    with_sim(0, |sim| {
        sim.kinds[faction_from_code(faction_code).index()].spec().len() as u32
    })
}

/// Knob `index` as a gene, in thousandths of the `0..=1` interval. This is what
/// a slider's position is.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn policy_gene(faction_code: u32, index: u32) -> u32 {
    with_sim(0, |sim| {
        let side = faction_from_code(faction_code).index();
        if index as usize >= sim.kinds[side].spec().len() {
            return 0;
        }
        milli_of(sim.genomes[side][index as usize]).max(0) as u32
    })
}

/// Knob `index` as its actual weight, in thousandths. This is what a slider's
/// *label* says, and it is not the same number as [`policy_gene`]: a gene is a
/// position in a range, a weight is a value in it.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn policy_weight(faction_code: u32, index: u32) -> i32 {
    with_sim(0, |sim| {
        let side = faction_from_code(faction_code).index();
        let spec = sim.kinds[side].spec();
        if index as usize >= spec.len() {
            return 0;
        }
        milli_of(spec.value(index as usize, &sim.genomes[side]))
    })
}

/// Moves one knob, in thousandths of the `0..=1` gene interval, and rebuilds
/// that faction's policy. Answers `1` if it took.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn set_policy_gene(faction_code: u32, index: u32, milli: i32) -> u32 {
    let took = with_sim(0, |sim| {
        let faction = faction_from_code(faction_code);
        if index as usize >= sim.kinds[faction.index()].spec().len() {
            return 0;
        }
        sim.set_gene(faction, index as usize, Fx::from_ratio(milli, 1000));
        1
    });
    publish();
    took
}

/// Restores a faction's hand-tuned weights.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn reset_policy_genes(faction_code: u32) -> u32 {
    let took = with_sim(0, |sim| {
        let faction = faction_from_code(faction_code);
        sim.set_policy(faction, sim.kinds[faction.index()]);
        1
    });
    publish();
    took
}

/// Address of knob `index`'s name in linear memory, as UTF-8 bytes.
///
/// Two exports rather than a list of names mirrored into the page, because a
/// mirror rots: rename a gene in Rust and the page keeps confidently labelling
/// the old one. The same pattern as [`frame_ptr`] -- an address is produced and
/// handed over, and the reading happens on the JavaScript side of the wall
/// where the engine bounds-checks it.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn policy_label_ptr(faction_code: u32, index: u32) -> u32 {
    with_sim(0, |sim| {
        let spec = sim.kinds[faction_from_code(faction_code).index()].spec();
        spec.label(index as usize).as_ptr() as usize as u32
    })
}

/// Length in bytes of knob `index`'s name. Zero for an index past the end,
/// which is how a caller discovers it has run off the list.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn policy_label_len(faction_code: u32, index: u32) -> u32 {
    with_sim(0, |sim| {
        let spec = sim.kinds[faction_from_code(faction_code).index()].spec();
        spec.label(index as usize).len() as u32
    })
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
        // in their hand mid-cut. That is a real thing to watch and it is not a
        // bug: it is a *mode*, and now that the hero's default mind has an
        // opinion about what to hold, it is an interesting one -- you throw the
        // cuts, it picks the weapon.
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
/// Movement arrives as thousandths of a unit vector, the aim as a raw binary
/// angle (`0..65535`, the same encoding the frame reports facings in, so the
/// page's `atan2` result never becomes a float on this side), extension as
/// thousandths, and `slot` as which loadout slot the player wants in hand.
///
/// `slot` is read only while [`CONTROL_SLOT`] is held, and it is a *request* on
/// exactly the same terms a policy's is: honoured when the limb is at guard and
/// the slot is one the hero actually carries, ignored otherwise. The player gets
/// no better deal than the AI here, which is what keeps the swap a real cost
/// rather than a thing the human can cheat.
///
/// `strike` is the attack button: `0` released, `1` cut from whichever side is
/// nearer, `2` counter-clockwise, `3` clockwise. It is a *button* and not a
/// bearing, which is the whole shape of the change that made the sword a phase
/// machine -- the pointer says where to cut and the button says when, and the
/// sim decides what the blade does in between.
///
/// Releasing matters as much as pressing, and a page that never sends `0` is
/// broken in a way that looks like the game ignoring it: an attack begins only
/// on a press that follows a release, so holding the button down throws exactly
/// one cut. That is deliberate; see [`sim::Hand::armed`].
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn set_input(
    move_x_milli: i32,
    move_y_milli: i32,
    aim_raw: u32,
    reach_milli: i32,
    slot: u32,
    strike: u32,
) {
    with_sim((), |sim| {
        sim.input_move = Vec2::new(
            Fx::from_ratio(move_x_milli, 1000),
            Fx::from_ratio(move_y_milli, 1000),
        )
        .clamp_length(Fx::ONE);
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

/// Forces the next level and answers the new depth.
///
/// A door for the page and for `wasm_check.js`, which needs to drive a level
/// change without simulating a full clear first. The ordinary way down is to
/// kill everything and walk into the way out.
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

/// Rewrites one of the hero's loadout slots. `action_code` of [`SLOT_EMPTY`]
/// empties slot 1; slot 0 cannot be emptied. Answers `1` if it took.
///
/// **Editing the slot that is in hand changes the thing in a fighter's hand on
/// the spot**, and is refused unless the limb is at guard. The alternative --
/// letting the page swap a blade mid-cut -- is the one way this panel could
/// produce a blow that visibly did not come from the weapon on screen.
///
/// The refusals are on the *live* write only. [`Sim::hero_spec`] takes the kit
/// whatever the limb happens to be doing, because a plan for the next character
/// cannot be mid-cut; and with nobody standing this writes the plan alone.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn set_hero_loadout(slot: u32, action_code: u32) -> u32 {
    let took = with_sim(0, |sim| {
        let action = if action_code == SLOT_EMPTY {
            None
        } else {
            match sim::ActionKind::from_code(action_code) {
                // A row the sim has no rule for is refused rather than handed
                // over: `PLAYABLE` is what a menu offers and this is the wall
                // that makes that more than a convention.
                Some(kind) if kind.is_playable() => Some(kind),
                _ => return 0,
            }
        };
        // The plan first, and unconditionally -- `Loadout::set` still refuses
        // to empty slot 0, which is the one rule that holds on both sides.
        let mut plan = sim.hero_spec.loadout;
        if !plan.set(slot as usize, action) {
            return 0;
        }
        sim.hero_spec.loadout = plan;

        let Some(hero) = sim.hero() else { return 1 };
        let Some(mut loadout) = sim.world.loadout(hero) else {
            return 1;
        };
        let held = sim.world.held(hero).map_or(0, |(s, _)| u32::from(s));
        if slot == held && !sim.hero_limb_at_guard() {
            return 0;
        }
        if !loadout.set(slot as usize, action) {
            return 0;
        }
        u32::from(sim.world.set_loadout(hero, loadout))
    });
    publish();
    took
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

/// Puts the hero in a different body. Answers `1` if it took.
///
/// **Not a respawn.** With a character standing this changes it in place: the
/// handle, the position, the order and the fraction of its health all survive,
/// and what moves is its size, its weight, its stat sheet and the kit that
/// comes with it. That is the whole point of the Hero rail's body row --
/// watching the same fight from inside a different body, without the room
/// resetting around you.
///
/// With nobody standing it writes [`Sim::hero_spec`] alone, and that is the
/// same call the player is making: *this* is the body I am sending in next.
/// Either way the plan moves, through [`UnitSpec::set_body`] rather than a bare
/// `kind` write, so the sheet and the kit follow the body -- a Rogue carrying a
/// Fighter's attributes is a half-change and a quiet one.
///
/// Decoded with [`kind_from_code`] rather than [`hero_from_code`], and
/// deliberately: this is the setter paired with [`hero_body`]'s [`kind_code`]
/// getter, so it has to be that function's exact inverse or
/// `set_hero_body(hero_body())` would not be a no-op. The two agree on every
/// code the getter can produce and differ only in what garbage falls through to.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn set_hero_body(code: u32) -> u32 {
    let took = with_sim(0, |sim| {
        let body = kind_from_code(code);
        sim.hero_spec.set_body(body);
        let Some(hero) = sim.hero() else { return 1 };
        // The live change can still be refused -- `World::set_body` is the
        // authority on that -- and when it is, the plan has moved and the body
        // has not. That is the honest split rather than a leak: the rail reads
        // both back, and the next character is the one the player asked for
        // even if this one could not become it.
        u32::from(sim.world.set_body(hero, body))
    });
    publish();
    took
}

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
/// Unlike [`set_hero_loadout`] there is no guard-phase check to make, because
/// there is no limb: nothing is holding this yet.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn set_spawn_template_slot(slot: u32, action_code: u32) -> u32 {
    with_sim(0, |sim| {
        let action = if action_code == SLOT_EMPTY {
            None
        } else {
            match sim::ActionKind::from_code(action_code) {
                // A row the sim has no rule for is refused rather than handed
                // over, exactly as `set_hero_loadout` refuses it: `PLAYABLE` is
                // what a menu offers and this is the wall behind that.
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

/// Low half of the selftest hash. See [`selftest_hash`].
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn selftest_hash_lo() -> u32 {
    selftest_hash() as u32
}

/// High half of the selftest hash. See [`selftest_hash`].
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn selftest_hash_hi() -> u32 {
    (selftest_hash() >> 32) as u32
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

/// The project's central claim, as one number.
///
/// Runs exactly what `cargo run -p lab -- hash` runs -- `skirmish(1234, 4, 6)`,
/// seed 99, the baseline utility policy, the default run config -- and returns
/// the state hash of the finished fight. If this number differs between a
/// native build and a wasm build, then "the same inputs produce the same run,
/// everywhere" is false and something in the stack is not as portable as it
/// says it is.
///
/// Independent of [`init`] and of anything the player has done: it builds its
/// own world, runs it to a conclusion and throws it away.
pub fn selftest_hash() -> u64 {
    policy::run(
        &Scenario::skirmish(1234, 4, 6),
        99,
        &mut PolicyKind::Utility.baseline(),
        &RunConfig::default(),
    )
    .state_hash
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The tile vocabulary, which nothing above the test module needs: the crate
    /// reads a floor plan and never writes one. `init_sealed` is the exception,
    /// and it is the only reason these three names are in scope at all.
    use sim::{Dungeon, OPEN, WALL};

    /// What `cargo run --release -p lab -- hash` prints today. Recorded rather
    /// than computed, so this test fails if the sim's behaviour moves at all --
    /// which is the point of having it here as well as in `sim`.
    const LAB_HASH: u64 = 0x00b4_8ceb_2108_1d1d;

    /// What `init(1); set_goto(20_000, 12_000); step(600)` leaves behind.
    /// Recorded here natively; the same three calls against `web.wasm` under
    /// Node produce the same number, which is the first time this project's
    /// central claim has been checked across targets rather than asserted.
    ///
    /// **All four of the numbers below moved when the hero's default mind moved
    /// to `Duelist`**, and that is the expected shape of that change rather
    /// than a reason to be suspicious of it: every one of these scripts drives
    /// the page's own hero, so a different policy is a different run from tick
    /// one. What did *not* move is `LAB_HASH`, which names its policy
    /// explicitly -- and that is the pair worth reading together, because a
    /// change that moved the lab's number too would have been a change to the
    /// simulation rather than to who is driving it.
    ///
    /// **This one then moved a second time, alone, when a click became a
    /// command** -- and it is the only one of the four that could have. It is
    /// the only script here that calls [`set_goto`], so it is the only one that
    /// reaches `ordered_feet`; the other three never set a destination, and a
    /// hero with no `Order::Goto` takes the same footsteps it always did. The
    /// plan for that change predicted no browser hash would move, having argued
    /// the gate from the *lab* scenarios, which issue `Advance` and never a
    /// `Goto`. That argument was sound for `LAB_HASH` and did not transfer here.
    /// Read the pair the same way as above: this number moving and `LAB_HASH`
    /// standing still is the shape of a change to who is driving.
    ///
    /// **And then a third time, alone again, when the click stopped being an
    /// override and became a leash** -- and the prediction was wrong a second
    /// time for exactly the reason it was wrong the first. That plan's golden
    /// section argued the gate the same way: no lab scenario issues a `Goto`, so
    /// `ordered_feet` is unreachable and no hash can move. Sound for `LAB_HASH`,
    /// which held; false here, and false for a reason written down eight lines
    /// above it -- the script on this constant *is* a `set_goto`, and it is the
    /// only golden anywhere in the project that is. The lesson is not about
    /// leashes. It is that "no golden reaches this code" is a claim about the
    /// four scripts documented in this module as much as about the lab's
    /// scenarios, and it has now been made twice without being checked against
    /// them. Check the scripts before predicting the hashes.
    const ROOM_HASH: u64 = 0xadae_95f2_b6b4_6499;

    /// What `init(1); spawn_monster(3, SLOT_EMPTY, SLOT_EMPTY); step(600)` leaves behind -- a whole
    /// skirmish, start to finish, driven the way the page drives it. Recorded
    /// from a native run, never computed here, and asserted against `web.wasm`
    /// under Node by `tools/wasm_check.js`.
    const BATTLE_HASH: u64 = 0x8fac_6bdd_30ef_bcac;

    /// What `init(1); spawn_monster(2, SLOT_EMPTY, SLOT_EMPTY) x3; step(1800); swap_in_hero(1, SLOT_EMPTY, SLOT_EMPTY);
    /// step(400)` leaves behind -- a fight, a death, a replacement, and the
    /// fight it walks into. Recorded from a native run and asserted against
    /// `web.wasm` under Node by `tools/wasm_check.js`.
    const SWAP_HASH: u64 = 0xf963_cdf8_faf3_331a;

    // `init(1); swap_in_hero(FIGHTER, Bow, Sword); spawn_monster(BRUTE); step(1200)`:
    // the only one of these that ever puts an arrow in the air, and therefore
    // the only one that pins the projectile arithmetic across targets.
    const BOW_HASH: u64 = 0xd67a_d1e4_eb4a_d18d;

    /// Prints the four browser goldens in hex, for re-pinning.
    ///
    /// `#[ignore]` because it asserts nothing; it exists so that a deliberate
    /// behaviour change is one command rather than four assertion failures read
    /// one at a time, each of which hides the next.
    ///
    ///     cargo test -p web -- --ignored --nocapture print_the_golden_hashes
    ///
    /// The four scripts are written out again rather than shared with the four
    /// `#[test]`s that assert them. That is the point: a printer that called into
    /// the assertions would print whatever the assertions ran, so a script that
    /// had quietly drifted would be re-pinned to its drift. These are the scripts
    /// as documented on the constants above, and if one of them stops matching
    /// its `#[test]` the number it prints will not fix that test -- which is the
    /// failure this shape is for.
    ///
    /// `LAB_HASH` is deliberately absent. It is not re-pinnable: it names its own
    /// scenario and policy, so a change that moves it is a change to the
    /// simulation and the answer is to find the change, not to write down the new
    /// number.
    #[test]
    #[ignore]
    fn print_the_golden_hashes() {
        init(1);
        set_goto(20_000, 12_000);
        step(600);
        println!("ROOM_HASH:   {:#018x}", hash());

        init(1);
        spawn_monster(SKITTERER, SLOT_EMPTY, SLOT_EMPTY);
        step(600);
        println!("BATTLE_HASH: {:#018x}", hash());

        init(1);
        for _ in 0..3 {
            spawn_monster(BRUTE, SLOT_EMPTY, SLOT_EMPTY);
        }
        step(1_800);
        swap_in_hero(ROGUE, SLOT_EMPTY, SLOT_EMPTY);
        step(400);
        println!("SWAP_HASH:   {:#018x}", hash());

        init(1);
        set_hero_loadout(0, sim::ActionKind::Bow.code());
        spawn_monster(BRUTE, SLOT_EMPTY, SLOT_EMPTY);
        step(1_200);
        println!("BOW_HASH:    {:#018x}", hash());
    }

    fn selftest() -> u64 {
        (u64::from(selftest_hash_hi()) << 32) | u64::from(selftest_hash_lo())
    }

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

    /// The identity columns of the first monster on the frame, as the pair the
    /// page sends back to [`set_focus`].
    ///
    /// Read off the frame rather than out of `World::alive_ids`, because the
    /// two columns being enough to name a body is precisely what the focus
    /// export is claiming -- a fixture that reached past them would be testing
    /// a path the page cannot take.
    fn monster_handle() -> (u32, u32) {
        let row = monsters()
            .into_iter()
            .next()
            .expect("nothing hostile is standing");
        (row[9] as u32, row[10] as u32)
    }

    /// The faction's standing order, out of the sim rather than off the frame.
    ///
    /// Reaching into the private field the way [`roster_len`] does, and for the
    /// same kind of reason: the frame flattens an order into a discriminant and
    /// a point, which is everything the page needs and not enough to say *which*
    /// body an `Order::Focus` named.
    fn hero_order() -> Order {
        SIM.with(|sim| {
            sim.borrow()
                .as_ref()
                .map_or(Order::Hold, |sim| sim.world.order(Faction::Heroes))
        })
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
    fn walkable(x: f32, y: f32, radius: f32) -> bool {
        SIM.with(|sim| {
            sim.borrow().as_ref().is_some_and(|sim| {
                sim.world.is_walkable(
                    Vec2::new(
                        Fx::from_ratio((x * 1000.0) as i32, 1000),
                        Fx::from_ratio((y * 1000.0) as i32, 1000),
                    ),
                    Fx::from_ratio((radius * 1000.0) as i32, 1000),
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
        let hero = UnitSpec {
            kind: Body::Fighter,
            faction: Faction::Heroes,
            stats: Body::Fighter.base_stats(),
            loadout: Body::Fighter.default_loadout(),
            spawn: Vec2::ZERO,
        };
        let mut scenario = Scenario::dungeon(u64::from(seed), 0, hero);
        scenario.units.retain(|u| u.faction == Faction::Heroes);
        SIM.with(|slot| {
            let sim = Sim::on(&scenario, u64::from(seed));
            write_map(&sim.world);
            *slot.borrow_mut() = Some(sim);
        });
        publish();
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

    #[test]
    fn the_selftest_hash_is_the_number_the_lab_prints_natively() {
        assert_eq!(
            selftest_hash(),
            LAB_HASH,
            "the selftest no longer runs what `lab hash` runs"
        );
        assert_eq!(selftest(), LAB_HASH, "the halves reassemble wrongly");
        assert_eq!(selftest_hash_lo(), 0x2108_1d1d);
        assert_eq!(selftest_hash_hi(), 0x00b4_8ceb);
    }

    #[test]
    fn a_scripted_walk_leaves_the_world_in_a_known_state() {
        // The other half of the wasm-versus-native comparison, and the more
        // interesting half: the selftest runs one canned fight, whereas this
        // runs the code path the player actually drives -- the order channel,
        // the decision loop and the arrival rule -- and pins the result.
        init(1);
        set_goto(20_000, 12_000);
        step(600);
        println!("room hash: 0x{:016x} after {} ticks", hash(), tick());
        assert_eq!(hash(), ROOM_HASH, "the room script no longer replays");
    }

    #[test]
    fn the_selftest_hash_does_not_depend_on_the_player() {
        // It builds its own world. If it ever started reading the module's
        // state, the wasm-versus-native comparison would be comparing two
        // different runs and would pass or fail for the wrong reason.
        init(1);
        set_goto(20_000, 12_000);
        step(120);
        assert_eq!(selftest_hash(), LAB_HASH);
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
            set_goto(1_000, 1_000);
            clear_order();
            // The route is a queue over that same order channel, so it has the
            // same obligation: a page that drags before it calls `init` gets
            // three answers, not a poisoned instance.
            route_clear();
            assert_eq!(
                route_push(1_000, 1_000),
                0,
                "queued a leg into a world that is not there"
            );
            assert_eq!(route_len(), 0, "a module with no world is holding a path");
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
            assert_eq!(set_hero_body(0), 0);
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
    fn stepping_walks_the_hero_to_the_click_rather_than_straight_past_it() {
        // The regression test for the trap in `step`. A loop that called
        // `world.step()` without answering the decisions it offers would leave
        // the hero on its tick-zero command forever: it would set off in exactly
        // the right direction, never re-decide, and end up pinned in the far
        // corner at the far wall -- which reads as "it moved, so it works"
        // right up until you look at where it stopped.
        //
        // Quiet, and the destination taken off the floor plan rather than
        // written down: a level is carved now, so a hardcoded pair of
        // coordinates is a coin flip on whether the click is even standable.
        //
        // **Six hundred ticks, and it used to be three hundred, because arrival
        // is a limit now rather than an event.** The order pulls on the feet
        // through a leash whose grip falls off as the square of the gap, and it
        // composes with a brake that is itself proportional to the gap, so the
        // commanded speed near the anchor falls as the *cube* of the distance
        // left: the walk is quick and then the last fraction of a unit is a
        // crawl. Three hundred ticks left the hero 0.2197 out and six hundred
        // leave it 0.1533, against a tolerance that has not moved.
        //
        // The tolerance has not moved because it was never the thing under test.
        // A `step` that does not answer its decisions does not stop a fifth of a
        // unit short of the click -- it sails through and pins the hero against
        // the far wall, several units out and in the wrong part of the room. The
        // assertion catches that as squarely as it ever did; it was the budget
        // that went stale, and a budget is a statement about how long a crawl
        // takes rather than about where the walk ends up.
        init_quiet(1);
        let start = hero();
        let (tx, ty) = walkable_near_hero(4.0, 0.45);
        assert_ne!((tx, ty), start, "the fixture found nowhere to walk to");

        set_goto((tx * 1000.0) as i32, (ty * 1000.0) as i32);
        step(600);

        let (x, y) = hero();
        println!("walked to ({x}, {y}) in {} ticks", tick());
        assert!(
            distance_from_hero(tx, ty) <= 0.2,
            "stopped at ({x}, {y}), not at the click ({tx}, {ty})"
        );
    }

    #[test]
    fn the_tick_rate_does_not_depend_on_how_the_caller_batches_its_frames() {
        // The client calls `step` with whatever the display's refresh rate left
        // in its accumulator. That must not be able to change the run.
        init(7);
        set_goto(4_500, 14_250);
        step(300);
        let batched = (tick(), hash());

        init(7);
        set_goto(4_500, 14_250);
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
        let (tx, ty) = walkable_near_hero(4.0, 0.45);
        set_goto((tx * 1000.0) as i32, (ty * 1000.0) as i32);
        step(60);

        let frame = frame();
        assert_eq!(frame.len(), HEADER_LEN + UNIT_STRIDE);
        assert_eq!(frame_len() as usize, frame.len());
        assert_eq!(frame[0], 48.0, "arena_x");
        assert_eq!(frame[1], 32.0, "arena_y");
        assert_eq!(frame[2], 4.0, "order_kind: Goto is discriminant 4");
        assert!((frame[3] - tx).abs() < 0.002, "order_x");
        assert!((frame[4] - ty).abs() < 0.002, "order_y");
        assert!(
            frame[5] > 0.0 && frame[5] <= tick() as f32,
            "last_decision_tick is {}, at tick {}",
            frame[5],
            tick()
        );
        assert_eq!(frame[6], 1.0, "unit_count");
        assert_eq!(frame[7], 0.0, "shot_count");
        assert_eq!(
            frame[8], 0.0,
            "event_count: nobody has hit anybody in an empty level"
        );
        // The run block, appended after the three section counts.
        assert_eq!(frame[9], 0.0, "monsters_left: this level was emptied");
        assert_eq!(frame[12], PORTAL_OPEN as f32, "portal_state: nothing left");
        assert_eq!(frame[13], 0.0, "depth: the first floor");

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
        assert_eq!(unit[4], 84.0, "hp: 20 + 8 * vitality 8");
        assert_eq!(unit[5], 84.0, "max_hp");
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
    fn a_fight_lights_the_flash_columns() {
        // The columns exist because the client used to infer a hit from health
        // falling between frames, which needs an epsilon to tell a blow from
        // regeneration and cannot see a blocked blow at all.
        // Three monsters and twice the running time, because attacks are
        // discrete now: a Fighter throws a cut roughly every fifty ticks rather
        // than landing one every nine, so a single duel can be over before a
        // blocked blow happens at all.
        init_quiet(1);
        spawn_monster(2, SLOT_EMPTY, SLOT_EMPTY);
        spawn_monster(2, SLOT_EMPTY, SLOT_EMPTY);
        spawn_monster(3, SLOT_EMPTY, SLOT_EMPTY);
        let mut seen = [false; 3];
        for _ in 0..2400 {
            step(1);
            let frame = frame();
            let count = frame[6] as usize;
            for u in 0..count {
                let row = &frame[HEADER_LEN + u * UNIT_STRIDE..];
                for (slot, seen) in seen.iter_mut().enumerate() {
                    if row[18 + slot] > 0.0 {
                        *seen = true;
                    }
                }
            }
        }
        assert!(seen[0], "nobody was ever hit");
        // The block column is not asserted here **yet**, and the reason is not
        // that it stopped working: nothing in a freshly initialised world holds
        // a guard. Every body walks in with its default primary and all four of
        // those are weapons, so there is no shield anywhere to light it. It
        // comes back the moment a loadout can be set across the boundary, in
        // `a_blocked_blow_lights_the_block_column`.
    }

    /// The block half of the test above, waiting on a way to hand the hero a
    /// guard from outside the sim.
    ///
    /// Kept as a failing-by-default reminder rather than folded away, because
    /// "blocks stopped being recorded" and "nobody is holding a shield" look
    /// identical from the frame buffer, and only one of them is fine.
    #[test]

    fn a_blocked_blow_lights_the_block_column() {
        init_quiet(1);
        // The naive baseline never changes what is in its hand, so a Fighter
        // under it fights the whole battle with the sword half of its loadout
        // and the shield half never leaves the bag. Blocking is a thing a
        // *policy* does now, so this asks for the policy that does it.
        set_policy(0, PolicyKind::Duelist.code());
        spawn_monster(2, SLOT_EMPTY, SLOT_EMPTY);
        spawn_monster(2, SLOT_EMPTY, SLOT_EMPTY);
        spawn_monster(2, SLOT_EMPTY, SLOT_EMPTY);
        let mut blocked = false;
        for _ in 0.. 6000 {
            step(1);
            let frame = frame();
            let count = frame[6] as usize;
            for u in 0..count {
                let row = &frame[HEADER_LEN + u * UNIT_STRIDE..];
                if row[19] > 0.0 {
                    blocked = true;
                }
            }
        }
        assert!(blocked, "nothing was ever blocked");
    }

    #[test]
    fn a_faction_can_be_handed_a_different_mind_mid_fight() {
        init_quiet(1);
        // The room does **not** open on one mind for both sides: the hero gets
        // the policy that has an opinion about what is in its hand, and the
        // monsters get the naive baseline it is measured against. Asserted
        // rather than assumed, because it is the difference the page exists to
        // show and it is one line in `Sim::new` away from quietly reverting.
        assert_eq!(policy_kind(0), PolicyKind::Duelist.code());
        assert_eq!(policy_kind(1), PolicyKind::Utility.code());

        assert_eq!(set_policy(0, PolicyKind::Utility.code()), 1);
        assert_eq!(policy_kind(0), PolicyKind::Utility.code());
        assert_eq!(policy_kind(1), PolicyKind::Utility.code(), "both sides moved");

        // An unknown code changes nothing rather than trapping.
        assert_eq!(set_policy(0, 999), 0);
        assert_eq!(policy_kind(0), PolicyKind::Utility.code());
    }

    #[test]
    fn the_behaviour_panel_can_read_and_move_every_knob() {
        init_quiet(1);
        set_policy(0, PolicyKind::Duelist.code());
        let count = policy_weight_count(0);
        assert_eq!(count as usize, policy::DUELIST_GENOME_LEN);

        for i in 0..count {
            assert!(policy_label_len(0, i) > 0, "knob {i} has no name");
            assert_ne!(policy_label_ptr(0, i), 0, "knob {i} has no name address");
            assert!(policy_gene(0, i) <= 1000, "knob {i} gene out of range");
        }
        // Past the end answers empty rather than trapping, which is how a
        // caller discovers where the list stops.
        assert_eq!(policy_label_len(0, count), 0);
        assert_eq!(policy_gene(0, count), 0);

        // Moving a knob changes the weight it names, and only that one.
        let before: Vec<i32> = (0..count).map(|i| policy_weight(0, i)).collect();
        assert_eq!(set_policy_gene(0, 0, 1000), 1);
        let after: Vec<i32> = (0..count).map(|i| policy_weight(0, i)).collect();
        assert_ne!(before[0], after[0], "the knob did not move");
        assert_eq!(before[1..], after[1..], "moving one knob moved another");

        assert_eq!(reset_policy_genes(0), 1);
        let restored: Vec<i32> = (0..count).map(|i| policy_weight(0, i)).collect();
        assert_eq!(before, restored, "reset did not restore the baseline");

        // A policy with no knobs reports none, and every accessor stays total.
        set_policy(1, PolicyKind::Idle.code());
        assert_eq!(policy_weight_count(1), 0);
        assert_eq!(policy_gene(1, 0), 0);
        assert_eq!(set_policy_gene(1, 0, 500), 0);
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
            script(PolicyKind::Utility),
            script(PolicyKind::Duelist),
            "swapping the hero's mind produced an identical run"
        );
    }

    #[test]
    fn taking_control_of_the_feet_moves_the_hero_where_the_player_says() {
        init_quiet(1);
        let start = hero();
        set_control(CONTROL_FEET);
        assert_eq!(control(), CONTROL_FEET);
        // Due west, at full speed, for a second.
        set_input(-1000, 0, 0, 0, 0, 0);
        step(60);
        let (x, y) = hero();
        assert!(x < start.0 - 1.0, "walked to ({x}, {y}) from {start:?}");
        assert!((y - start.1).abs() < 0.2, "drifted off the ordered line");

        // Handing it back leaves the character standing rather than stuck: the
        // policy has to start being consulted again within one decision period.
        set_control(0);
        assert_eq!(control(), 0);
        set_goto(20_000, 12_000);
        step(200);
        assert!(hero().0 > x + 1.0, "the hero never got its feet back");
    }

    #[test]
    fn taking_control_of_the_sword_points_it_where_the_player_says() {
        init_quiet(1);
        set_control(CONTROL_LIMB);
        // Guard due north, attacking nothing.
        set_input(0, 0, 16_384, 0, 0, 0);
        step(120);

        let unit = &frame()[HEADER_LEN..];
        let bearing = unit[11];
        assert!(
            (bearing - 16_384.0).abs() < 2_000.0,
            "sword ended up at {bearing}, not north"
        );
        assert_eq!(unit[19], 0.0, "chambered blade was not in guard");

        // The button throws a cut, and the page can see it coming: the phase
        // goes to windup before it goes to strike, and the two are distinct in
        // the frame. This is the whole of what the columns were added for.
        set_input(0, 0, 16_384, 0, 0, 1);
        let mut saw_windup = false;
        let mut saw_strike = false;
        for _ in 0..90 {
            step(1);
            match frame()[HEADER_LEN + 19] as i32 {
                1 => saw_windup = true,
                2 => {
                    saw_strike = true;
                    assert!(saw_windup, "the cut went live without announcing itself");
                }
                _ => {}
            }
        }
        assert!(saw_windup && saw_strike, "the button threw no attack");

        // Release the button and the blade goes back to guarding, on the bearing
        // the pointer is now naming.
        set_input(0, 0, 49_152, 1000, 0, 0);
        step(120);
        let unit = &frame()[HEADER_LEN..];
        assert_eq!(unit[19], 0.0, "the blade never came back to guard");
        assert!(
            (unit[11] - 49_152.0).abs() < 2_000.0,
            "the blade ended up at {}, not south",
            unit[11]
        );

        // And the half that is new: asking for the other slot changes what is in
        // the hand, through the same request channel a policy uses. There is no
        // "shield modifier" any more -- steering a guard is a matter of holding
        // one, and holding one costs the sword.
        //
        // Taken explicitly, because the limb no longer implies it: the three
        // bits are three bits. Asserting that `CONTROL_LIMB` alone left the
        // choice with the AI is `the_three_control_bits_are_independent`'s job.
        assert_eq!(control(), CONTROL_LIMB, "the limb bit dragged another one in with it");
        set_control(CONTROL_LIMB | CONTROL_SLOT);
        set_input(0, 0, 49_152, 1000, 1, 0);
        step(60);
        let unit = &frame()[HEADER_LEN..];
        assert_eq!(unit[24], 1.0, "the player's slot request was not honoured");
        assert_eq!(
            unit[22],
            sim::ActionKind::Shield.code() as f32,
            "the hero is not holding its shield"
        );
        assert_eq!(unit[23], 1.0, "a shield is a guard");
        // A guard reads the same command as a bearing and an extension, so the
        // reach the page has been sending all along now means something.
        assert!(unit[12] > 0.5, "the guard never came out: reach {}", unit[12]);
    }

    #[test]
    fn the_three_control_bits_are_independent() {
        // Feet under the player, sword under the policy, and the other way
        // round. This is the whole shape of the feature: they are different
        // skills and any of them can be handed over alone.
        init_quiet(1);
        spawn_monster(2, SLOT_EMPTY, SLOT_EMPTY);
        set_control(CONTROL_FEET);
        set_input(1000, 0, 0, 0, 0, 0);
        step(120);
        let sword_under_ai = frame()[HEADER_LEN + 12];

        init_quiet(1);
        spawn_monster(2, SLOT_EMPTY, SLOT_EMPTY);
        set_control(CONTROL_LIMB);
        set_input(1000, 0, 0, 0, 0, 0);
        step(120);
        let feet_under_ai = frame();

        assert!(
            sword_under_ai > 0.0,
            "the policy stopped driving the sword when only the feet were taken"
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

    #[test]
    fn a_click_crosses_as_thousandths_and_arrives_as_a_world_point() {
        // Both values are exact in `Fx` and exact in `f32`, so an exact
        // comparison is honest here rather than a rounding accident: the point
        // is that 20500 means 20.5 and nothing is scaled twice on the way.
        init_quiet(1);
        set_goto(20_500, -3_250);
        let click = frame();
        assert_eq!((click[3], click[4]), (20.5, -3.25));

        // A wrapped `i32` from JavaScript must saturate rather than overflow.
        //
        // **The frame is where that shows.** `ToInt32` wraps, so a value that
        // overflowed on the way in would come back not as a wild number but as
        // a perfectly plausible point in the middle of the level -- which is
        // the failure worth catching, because nothing downstream could tell it
        // from a click somebody meant.
        let (from_x, from_y) = hero();
        set_goto(i32::MIN, i32::MAX);
        let wild = frame();
        assert!(
            wild[3] < 0.0 && wild[4] > arena().1,
            "a wild click wrapped instead of saturating: ({}, {})",
            wild[3],
            wild[4]
        );

        // And the walk that follows must still be a walk to somewhere legal.
        // Not "toward that corner": the nearest floor to a corner of a carved
        // level can be most of a level away from it, so a heading assertion
        // here would be asserting the shape of one generated floor plan.
        step(300);
        let (x, y) = hero();
        assert!(
            (x, y) != (from_x, from_y),
            "gave up on a nonsense click at ({from_x}, {from_y})"
        );
        assert!(walkable(x, y, 0.45), "walked into the rock at ({x}, {y})");
    }

    #[test]
    fn clearing_the_order_hands_the_hero_back_to_its_own_judgement() {
        // Worth being exact about, because "clear the order" reads like "stop"
        // and it is not. Under `Order::Hold` with nothing in sight the policy
        // steers for open ground, which is a slow drift toward the middle of
        // whatever room it is standing in. That is `UtilityPolicy`'s search
        // behaviour working as designed, not a stale order leaking through this
        // boundary, and the page has to present it as the character deciding
        // for itself rather than as a control that did not take.
        //
        // Where it drifts *to* is a fact about the room it happens to be in, so
        // what is asserted is that it stops honouring the click -- it must not
        // still be closing on it -- rather than a destination this test would
        // be re-deriving the floor plan to predict.
        init_quiet(1);
        let (tx, ty) = walkable_near_hero(5.0, 0.45);
        set_goto((tx * 1000.0) as i32, (ty * 1000.0) as i32);
        step(200);
        let (away_x, away_y) = hero();
        let closed = distance_from_hero(tx, ty);
        assert!(closed < 1.0, "never got going: at ({away_x}, {away_y})");

        clear_order();
        assert_eq!(frame()[2], 0.0, "order_kind: Hold is discriminant 0");
        // Slow: `open_ground` is a third of a stride at baseline `wall_fear`,
        // and it tapers off as the pull it comes from shrinks.
        step(900);
        let (back_x, back_y) = hero();
        println!("released at ({away_x}, {away_y}), drifted to ({back_x}, {back_y})");
        assert!(
            distance_from_hero(tx, ty) > closed,
            "still closing on a cancelled click: ({back_x}, {back_y})"
        );
        assert!(
            walkable(back_x, back_y, 0.45),
            "drifted into the masonry at ({back_x}, {back_y})"
        );
    }

    // --------------------------------------------------------------- the route

    /// `count` points a body of this radius can stand on, 1.5 units apart along
    /// one bearing off the hero, for a route to walk in order.
    ///
    /// Taken off the floor plan rather than written down, for the reason
    /// [`walkable_near_hero`] gives. The 1.5 is not arbitrary: it is wider than
    /// [`ROUTE_ARRIVE`] plus a Fighter's radius, so no two legs are satisfied at
    /// once -- legs packed inside that band would drain the queue on
    /// the first tick, and a test that could not tell "walked the path" from
    /// "dropped the path" would pass either way.
    ///
    /// Empty when no bearing offers `count` of them, which every caller asserts
    /// on rather than quietly testing nothing.
    fn walkable_legs(count: usize, radius: f32) -> Vec<(f32, f32)> {
        let (hx, hy) = hero();
        for step in 0..32 {
            let angle = step as f32 * std::f32::consts::TAU / 32.0;
            let legs: Vec<(f32, f32)> = (1..=count)
                .map(|n| {
                    let reach = 1.5 * n as f32;
                    (hx + reach * angle.cos(), hy + reach * angle.sin())
                })
                .collect();
            if legs.iter().all(|&(x, y)| walkable(x, y, radius)) {
                return legs;
            }
        }
        Vec::new()
    }

    /// Which of `legs` the world is standing ordered to, if any.
    ///
    /// Read off the frame rather than out of `Sim::route`, because what the page
    /// draws a destination marker from is the frame -- and the order kind is
    /// checked first so that `Order::Hold`'s zero point cannot be mistaken for a
    /// waypoint somebody pushed.
    fn ordered_leg(legs: &[(f32, f32)]) -> Option<usize> {
        let f = frame();
        if f[2] != 4.0 {
            return None;
        }
        legs.iter()
            .position(|&(x, y)| (f[3] - x).abs() < 0.01 && (f[4] - y).abs() < 0.01)
    }

    /// The route's allocation, in waypoints.
    ///
    /// Reaching into the private field the way [`roster_len`] does, and for the
    /// same kind of reason: whether the buffer ever reallocated is invisible from
    /// everything the boundary reports.
    fn route_capacity() -> usize {
        SIM.with(|sim| sim.borrow().as_ref().map_or(0, |sim| sim.route.capacity()))
    }

    /// The hand-carved level's extent, the tile sealed off inside it, and a point
    /// in the room the hero can actually reach. Named so [`init_sealed`] and the
    /// test that drives it cannot disagree about which cell is which.
    const SEALED_COLS: u16 = 20;
    const SEALED_ROWS: u16 = 12;
    const SEALED_TILE: (usize, usize) = (16, 6);
    const SEALED_ROOM_POINT: (f32, f32) = (7.5, 7.5);

    /// Opens the page's sim on a floor plan this module carved itself.
    ///
    /// The only place here that writes tiles, and it is shared rather than
    /// copied. Two fixtures want a plan the generator cannot be asked for:
    /// [`init_sealed`] wants a region with no way into it, which the generator
    /// refuses because it checks connectivity, and [`init_walled`] wants exactly
    /// one tile of rock between two named points, which the generator has no way
    /// to be told. A third hand-rolled `Scenario` literal beside those two would
    /// be three places for "how this module builds a level" to drift apart.
    ///
    /// `portal: None`, deliberately, for every caller. A level with nothing
    /// hostile left in it reads as an open way out, and a hero that happened to
    /// be standing in one would end the run in the middle of the test.
    fn init_carved(cols: u16, rows: u16, tiles: Vec<u8>, units: Vec<UnitSpec>) {
        let scenario = Scenario {
            name: "carved".to_string(),
            dungeon: Dungeon::from_tiles(cols, rows, tiles),
            units,
            portal: None,
            max_ticks: 60 * 60,
        };
        SIM.with(|slot| {
            let sim = Sim::on(&scenario, 1);
            write_map(&sim.world);
            *slot.borrow_mut() = Some(sim);
        });
        publish();
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
            spawn: Vec2::new(Fx::from_ratio(x_tenths, 10), Fx::from_ratio(y_tenths, 10)),
        }
    }

    /// Opens the page's sim on a hand-carved level: one room with the hero
    /// standing in it, and one open tile sealed off behind masonry with no way
    /// into it at all.
    ///
    /// A sealed region is precisely what [`ROUTE_STALL`] exists for, so the test
    /// that proves the stall guard has to build one itself.
    fn init_sealed() {
        let cols = SEALED_COLS as usize;
        let mut tiles = vec![WALL; cols * SEALED_ROWS as usize];
        for ty in 2..=8 {
            for tx in 2..=8 {
                tiles[ty * cols + tx] = OPEN;
            }
        }
        // One open tile with four solid neighbours: reachable by nothing, and
        // still wide enough for a Fighter to stand in, so `nearest_walkable`
        // answers the cell itself rather than pulling the waypoint back out into
        // the room and making the leg satisfiable after all.
        tiles[SEALED_TILE.1 * cols + SEALED_TILE.0] = OPEN;

        init_carved(
            SEALED_COLS,
            SEALED_ROWS,
            tiles,
            vec![spec_at(Body::Fighter, Faction::Heroes, 45, 45)],
        );
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

    #[test]
    fn a_route_walks_its_legs_in_order() {
        init_quiet(1);
        let legs = walkable_legs(3, 0.45);
        assert_eq!(legs.len(), 3, "the fixture found no three-leg path off the hero");

        for (i, &(x, y)) in legs.iter().enumerate() {
            assert_eq!(
                route_push((x * 1000.0) as i32, (y * 1000.0) as i32),
                i as u32 + 1,
                "push {i} answered a count it was not holding"
            );
        }
        assert_eq!(route_len(), 3, "three waypoints did not make three legs");
        // No commit call. The first push is already the standing order, which is
        // what makes a drag start walking under the finger rather than on release.
        assert_eq!(
            ordered_leg(&legs),
            Some(0),
            "the first push did not become the order"
        );

        // Every distinct leg the world was ordered to, in the order it was
        // ordered to it. **One tick at a time, because that is the resolution the
        // leg test runs at**: stepping in batches could hide a leg that was
        // ordered and popped inside one batch, which is the very overshoot this
        // queue lives on this side of the boundary to prevent.
        let mut walked = Vec::new();
        if let Some(leg) = ordered_leg(&legs) {
            walked.push(leg);
        }
        for _ in 0..1_200 {
            step(1);
            if let Some(leg) = ordered_leg(&legs) {
                if walked.last() != Some(&leg) {
                    walked.push(leg);
                }
            }
        }

        assert_eq!(walked, vec![0, 1, 2], "the legs were not walked as pushed");
        assert_eq!(
            route_len(),
            1,
            "the last leg was popped rather than left standing"
        );
        let (x, y) = hero();
        assert!(
            distance_from_hero(legs[2].0, legs[2].1) <= 0.3,
            "stopped at ({x}, {y}), not on the last waypoint {:?}",
            legs[2]
        );
    }

    #[test]
    fn a_click_cancels_a_route() {
        // The most important of the four clear sites, and the reason `set_goto`
        // is not implemented in terms of `route_push`: a tap and a drag are
        // different gestures, the page already knows which one it saw, and the
        // module should not have to guess.
        init_quiet(1);
        let legs = walkable_legs(3, 0.45);
        assert_eq!(legs.len(), 3, "the fixture found no three-leg path off the hero");
        for &(x, y) in &legs {
            route_push((x * 1000.0) as i32, (y * 1000.0) as i32);
        }
        assert_eq!(route_len(), 3, "the fixture never got a path in place");

        let (tx, ty) = walkable_near_hero(4.0, 0.45);
        set_goto((tx * 1000.0) as i32, (ty * 1000.0) as i32);
        assert_eq!(
            route_len(),
            0,
            "the dragged path outlived the click that cancelled it"
        );
        let f = frame();
        assert_eq!(f[2], 4.0, "order_kind: a click is a Goto");
        assert!(
            (f[3] - tx).abs() < 0.01 && (f[4] - ty).abs() < 0.01,
            "the click did not become the standing order: ({}, {})",
            f[3],
            f[4]
        );

        // And nothing puts it back. A queue that had merely been *paused* would
        // re-order its next leg on the following tick and take the feet off the
        // click a moment after the player watched them arrive.
        step(120);
        assert_eq!(route_len(), 0, "a cancelled route came back");
        let f = frame();
        assert!(
            (f[3] - tx).abs() < 0.01 && (f[4] - ty).abs() < 0.01,
            "a leg was re-ordered over the click: ({}, {})",
            f[3],
            f[4]
        );
    }

    #[test]
    fn a_route_does_not_survive_a_descent() {
        // Two ends of one rule: a path must not outlive the floor it was drawn
        // on, nor the character that was walking it.
        init_quiet(1);
        let legs = walkable_legs(3, 0.45);
        assert_eq!(legs.len(), 3, "the fixture found no three-leg path off the hero");
        for &(x, y) in &legs {
            route_push((x * 1000.0) as i32, (y * 1000.0) as i32);
        }
        assert_eq!(descend(), 1, "never descended");
        assert_eq!(
            route_len(),
            0,
            "the next floor inherited waypoints describing a floor plan that is gone"
        );

        // The swap, and the reason it needs a line of its own: the queue belongs
        // to the *faction*, exactly as the order does, so it outlives the body it
        // was drawn for instead of going with the corpse.
        init_quiet(1);
        let legs = walkable_legs(3, 0.45);
        assert_eq!(legs.len(), 3, "the fixture found no three-leg path off the hero");
        for &(x, y) in &legs {
            route_push((x * 1000.0) as i32, (y * 1000.0) as i32);
        }
        fall_to_brutes();
        assert!(
            route_len() >= 1,
            "nothing was left for the swap to have to drop"
        );

        assert_eq!(
            swap_in_hero(FIGHTER, SLOT_EMPTY, SLOT_EMPTY),
            1,
            "nobody arrived"
        );
        assert_eq!(
            route_len(),
            0,
            "the newcomer inherited the path that ended where the last one died"
        );
        assert_eq!(
            frame()[2],
            0.0,
            "order_kind: Hold, with no leg re-ordered over it"
        );
    }

    // --------------------------------------------------------------- the lock
    //
    // `set_focus` and the rule that outlives it. The gesture these six tests
    // describe is one the page could not express at all before: every click was
    // a `Goto`, whatever it landed on.

    #[test]
    fn a_focus_names_the_monster_that_was_clicked() {
        // The page's whole path, end to end: it hit-tests a click against the
        // bodies it drew, reads the two identity columns off that row and sends
        // them straight back. Nothing in between is a row index -- which is what
        // `row[9]` and `row[10]` are in the frame for.
        init_quiet(1);
        spawn_monster(BRUTE, SLOT_EMPTY, SLOT_EMPTY);
        let (index, generation) = monster_handle();

        assert_eq!(set_focus(index, generation), 1, "the click was refused");
        assert_eq!(
            hero_order(),
            Order::Focus(EntityId::new(index, generation)),
            "the standing order does not name the body that was clicked"
        );
        assert_eq!(frame()[2], 3.0, "order_kind: Focus is discriminant 3");
    }

    #[test]
    fn a_focus_on_a_stale_handle_is_refused() {
        // Three ways to miss, one answer to all of them: `0`, and the standing
        // order exactly where it was. A refusal that fell through to anything
        // else would make a mis-aimed click quietly countermand the last good
        // one, which is worse than doing nothing.
        init_quiet(1);
        spawn_monster(BRUTE, SLOT_EMPTY, SLOT_EMPTY);
        let (index, generation) = monster_handle();
        let (tx, ty) = walkable_near_hero(4.0, 0.45);
        set_goto((tx * 1000.0) as i32, (ty * 1000.0) as i32);
        let standing = hero_order();
        assert!(
            matches!(standing, Order::Goto(_)),
            "the fixture never got an order in place to leave alone"
        );

        // The corpse, and the reason the generation crosses the wall at all:
        // this index is a perfectly good slot with a living body in it. An
        // export that looked only at the index would take the click -- so a tap
        // on something that fell a moment ago would silently become an order to
        // fight whatever walked into its place.
        assert_eq!(
            set_focus(index, generation.wrapping_add(1)),
            0,
            "a stale generation named the body now holding that slot"
        );
        assert_eq!(hero_order(), standing, "a refused click moved the order");

        // The hero's own handle. Not a target, and it has to be refused by the
        // same rule rather than by the page remembering not to send it: a hit
        // test against every drawn body will produce this exact pair the first
        // time the player clicks their own character.
        let hero = hero_row().expect("the room did not open with a hero");
        assert_eq!(
            set_focus(hero[9] as u32, hero[10] as u32),
            0,
            "the hero was accepted as its own quarry"
        );
        assert_eq!(hero_order(), standing, "a refused click moved the order");

        // And an index off the end of the world entirely, which is what a click
        // on a body that died between the frame being drawn and the mouse going
        // down eventually looks like.
        assert_eq!(set_focus(9_999, 0), 0, "a handle naming nothing was accepted");
        assert_eq!(hero_order(), standing, "a refused click moved the order");
    }

    #[test]
    fn a_focus_cancels_a_dragged_route() {
        // Same rule as `a_click_cancels_a_route`, and load-bearing rather than
        // tidy: a surviving queue would call `begin_leg` on its next leg test
        // and write a `Goto` straight over the lock, so the hero would break off
        // the quarry a moment after the player named it.
        init_quiet(1);
        let legs = walkable_legs(3, 0.45);
        assert_eq!(legs.len(), 3, "the fixture found no three-leg path off the hero");
        for &(x, y) in &legs {
            route_push((x * 1000.0) as i32, (y * 1000.0) as i32);
        }
        assert_eq!(route_len(), 3, "the fixture never got a path in place");

        spawn_monster(BRUTE, SLOT_EMPTY, SLOT_EMPTY);
        let (index, generation) = monster_handle();
        assert_eq!(set_focus(index, generation), 1, "the click was refused");
        assert_eq!(
            route_len(),
            0,
            "the dragged path outlived the lock that cancelled it"
        );
        assert_eq!(frame()[2], 3.0, "order_kind: Focus is discriminant 3");

        // And nothing puts it back. A queue that had merely been *paused* would
        // re-order its next leg on the following tick, and the hero would set
        // off walking the rest of a path drawn before the player saw the enemy.
        step(60);
        assert_eq!(route_len(), 0, "a cancelled route came back");
        assert_eq!(
            monsters().len(),
            1,
            "the quarry died inside the window, so the order below proves nothing"
        );
        assert_eq!(
            hero_order(),
            Order::Focus(EntityId::new(index, generation)),
            "a leg was re-ordered over the lock"
        );
    }

    #[test]
    fn a_dead_quarry_becomes_a_stand_down() {
        // The user's rule: when the named enemy falls, hold that ground.
        // Deliberately not `Order::Hold`, which is free will -- an empty room
        // drifts a released character back toward the middle (measured under
        // `clear_order`), walking it off the spot it just won -- and
        // deliberately not the next enemy, which would be the module picking the
        // player's fights.
        init_quiet(1);
        spawn_monster(SKITTERER, SLOT_EMPTY, SLOT_EMPTY);
        let (index, generation) = monster_handle();
        assert_eq!(set_focus(index, generation), 1, "the click was refused");

        // **One tick at a time**, so the tick this loop stops on is the tick the
        // quarry died on and the conversion has to have happened inside it. A
        // `step(600)` would pass just as happily against a rule that waited
        // until the end of the burst.
        let mut ticks = 0;
        while !monsters().is_empty() {
            step(1);
            ticks += 1;
            assert!(ticks < 3_000, "the fighter never killed one skitterer");
        }
        println!("the quarry fell on tick {}", tick());

        let (hx, hy) = hero();
        let at = match hero_order() {
            Order::Goto(at) => at,
            other => panic!("the lock outlived its quarry as {other:?}"),
        };
        // Exactly the hero's own feet, not near them. `expire_focus` reads the
        // position the same tick's `World::step` settled and nothing moves
        // between the two, so an approximate match here would be hiding a
        // conversion that happened a tick late.
        assert_eq!(
            (at.x.to_f32(), at.y.to_f32()),
            (hx, hy),
            "stood down somewhere other than where the fight ended"
        );
        assert_eq!(frame()[2], 4.0, "order_kind: a stand-down is a Goto");

        // And the property the *placement* is for, which the loop above cannot
        // see on its own: the rule lives inside `Sim::advance`'s per-tick loop,
        // so how the caller batches its frames cannot change the run. A version
        // that expired the lock once per `step` instead would leave the hero
        // steering at a corpse for the rest of every catch-up burst, and these
        // two runs would part company on the tick the skitterer fell.
        let single = {
            init_quiet(1);
            spawn_monster(SKITTERER, SLOT_EMPTY, SLOT_EMPTY);
            let (index, generation) = monster_handle();
            set_focus(index, generation);
            for _ in 0..1_600 {
                step(1);
            }
            (tick(), hash())
        };
        init_quiet(1);
        spawn_monster(SKITTERER, SLOT_EMPTY, SLOT_EMPTY);
        let (index, generation) = monster_handle();
        set_focus(index, generation);
        for _ in 0..200 {
            step(8);
        }
        assert_eq!(
            (tick(), hash()),
            single,
            "the quarry-death rule reads the caller's frame pacing"
        );
    }

    #[test]
    fn a_focus_publishes_the_quarrys_position() {
        // `Order::point` is `Vec2::ZERO` for a focus, correctly -- the payload
        // is a handle and there is no point in it. The header is given the
        // quarry's live position instead, so the page's existing destination
        // marker lands on the body with no page-side work at all.
        init_quiet(1);
        spawn_monster(BRUTE, SLOT_EMPTY, SLOT_EMPTY);
        let (index, generation) = monster_handle();
        assert_eq!(set_focus(index, generation), 1, "the click was refused");

        // **Sampled while the body moves, and that is the whole test.** A header
        // that had merely been wired to something non-zero once would pass a
        // single reading; what it must not be able to do is fall behind a quarry
        // that walks, which is every quarry.
        let mut travelled = 0.0;
        let mut last = {
            let f = frame();
            assert_eq!(f[2], 3.0, "order_kind: Focus is discriminant 3");
            (f[3], f[4])
        };
        for _ in 0..20 {
            step(30);
            let f = frame();
            let quarry = monsters()
                .into_iter()
                .next()
                .expect("the brute fell mid-test");
            assert_eq!(f[2], 3.0, "order_kind: the lock let go on its own");
            assert_eq!(
                (f[3], f[4]),
                (quarry[0], quarry[1]),
                "the header is pointing somewhere the quarry is not"
            );
            travelled += distance(&[f[3], f[4]], &[last.0, last.1]);
            last = (f[3], f[4]);
        }
        println!("the header followed the quarry {travelled:.2} units");
        assert!(
            travelled > 4.0,
            "the quarry only moved {travelled:.2} units, so a frozen header would have passed"
        );
    }

    #[test]
    fn a_focus_does_not_survive_a_descent() {
        // Two ends of one rule, mirroring `a_route_does_not_survive_a_descent`:
        // a lock must outlive neither the floor its quarry stood on nor the
        // character that was told to fight it.
        //
        // **A confirmation rather than a mechanism.** Nothing in `Sim::descend`
        // clears the order, and nothing needs to: it replaces the world wholesale
        // with `Sim::open`, and `World::new` starts both factions on
        // `Order::Hold`. A handle from the previous floor cannot even be
        // expressed on the next one. This test is here so that a later `descend`
        // which kept a world instead of building one cannot quietly leave a lock
        // standing that resolves against a stranger.
        init_quiet(1);
        spawn_monster(BRUTE, SLOT_EMPTY, SLOT_EMPTY);
        let (index, generation) = monster_handle();
        assert_eq!(set_focus(index, generation), 1, "the click was refused");
        assert_eq!(
            hero_order(),
            Order::Focus(EntityId::new(index, generation)),
            "the fixture never got a lock in place to lose"
        );

        assert_eq!(descend(), 1, "never descended");
        assert_eq!(
            hero_order(),
            Order::Hold,
            "the next floor inherited a lock on a body that stayed behind"
        );
        assert_eq!(frame()[2], 0.0, "order_kind: Hold");

        // The swap, and it needs a line of its own for the reason the route's
        // twin does: an order belongs to the *faction*, so it outlives the body
        // it was given to rather than going with the corpse. A newcomer that
        // inherited the lock would walk straight back into the thing that killed
        // the last one.
        init_quiet(1);
        spawn_monster(BRUTE, SLOT_EMPTY, SLOT_EMPTY);
        let (index, generation) = monster_handle();
        assert_eq!(set_focus(index, generation), 1, "the click was refused");
        fall_to_brutes();

        assert_eq!(
            swap_in_hero(FIGHTER, SLOT_EMPTY, SLOT_EMPTY),
            1,
            "nobody arrived"
        );
        assert_eq!(
            hero_order(),
            Order::Hold,
            "the newcomer inherited the lock the last one died holding"
        );
    }

    #[test]
    fn a_sealed_leg_is_abandoned_rather_than_hung_on() {
        // The stall guard, which is the only thing between a waypoint the drag
        // laid on unreachable ground and a route that never finishes. The *last*
        // leg needs no guard -- the policy holds, which is what an unreachable
        // order should do -- so the sealed waypoint is followed by a reachable
        // one, which is the case that would otherwise hang forever.
        init_sealed();
        let sealed = (
            SEALED_TILE.0 as i32 * 1000 + 500,
            SEALED_TILE.1 as i32 * 1000 + 500,
        );
        assert_eq!(route_push(sealed.0, sealed.1), 1, "the sealed leg refused");
        assert_eq!(
            route_push(
                (SEALED_ROOM_POINT.0 * 1000.0) as i32,
                (SEALED_ROOM_POINT.1 * 1000.0) as i32
            ),
            2,
            "the leg behind it refused"
        );

        // Nothing moves: there is no route into a sealed region, so the policy
        // holds and the hero stands where it was placed. That is the *correct*
        // behaviour for the order it is carrying, and it is exactly why nothing
        // but a clock could move this queue on.
        let (before_x, before_y) = hero();
        step(ROUTE_STALL - 1);
        assert!(
            distance_from_hero(before_x, before_y) < ROUTE_PROGRESS.to_f32(),
            "the hero found a way into a sealed cell: {:?}",
            hero()
        );
        assert_eq!(
            route_len(),
            2,
            "the sealed leg was abandoned before it had stalled"
        );

        step(1);
        assert_eq!(route_len(), 1, "the sealed leg hung the queue");
        let f = frame();
        assert!(
            (f[3] - SEALED_ROOM_POINT.0).abs() < 0.01
                && (f[4] - SEALED_ROOM_POINT.1).abs() < 0.01,
            "the leg behind it did not become the order: ({}, {})",
            f[3],
            f[4]
        );

        // And then the walk the sealed leg was holding up actually happens.
        step(600);
        assert!(
            distance_from_hero(SEALED_ROOM_POINT.0, SEALED_ROOM_POINT.1) <= 0.3,
            "never walked the leg the sealed one was blocking: {:?}",
            hero()
        );
    }

    #[test]
    fn route_push_refuses_past_the_cap() {
        // A drag is sampled by a page whose pointer events this module does not
        // control, so "more waypoints than `ROUTE_MAX`" is an ordinary input
        // rather than an abusive one. It answers the count it is holding either
        // way: this is a `cdylib`, and a panic here poisons the instance for the
        // life of the page.
        init_quiet(1);
        let (x, y) = walkable_near_hero(3.0, 0.45);
        let (mx, my) = ((x * 1000.0) as i32, (y * 1000.0) as i32);
        for i in 1..=ROUTE_MAX {
            assert_eq!(route_push(mx, my), i as u32, "push {i} miscounted");
        }
        for i in 0..8 {
            assert_eq!(
                route_push(mx, my),
                ROUTE_MAX as u32,
                "refused push {i} did not answer the count it kept"
            );
        }
        assert_eq!(route_len(), ROUTE_MAX as u32, "the cap did not hold");

        // **And the buffer never reallocated.** A `Vec` that grew linear memory
        // would detach every typed array the page is holding, which is the
        // failure this whole crate's buffers are arranged around -- and it is the
        // one consequence of a missing cap that no assertion above could see.
        assert_eq!(
            route_capacity(),
            ROUTE_MAX,
            "the route outgrew the one allocation it is allowed"
        );

        route_clear();
        assert_eq!(route_len(), 0, "route_clear left a path behind");
        // Not a stop button: the leg that was already ordered stays ordered, so
        // the character finishes the step it was taking instead of freezing.
        assert_eq!(frame()[2], 4.0, "route_clear withdrew the standing order too");
    }

    // ------------------------------------------------------------- the descent

    #[test]
    fn a_level_opens_carved_with_the_opposition_already_in_it() {
        init(1);
        assert_eq!(arena(), (48.0, 32.0));
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
        assert_eq!(map_cols(), 48);
        assert_eq!(map_rows(), 32);
        assert_eq!(map_len(), map_cols() * map_rows());
        assert_eq!(map_tile_size_milli(), 1000);
    }

    #[test]
    fn the_way_out_is_visible_from_the_start_and_shut_until_the_level_is() {
        init(1);
        let (px, py, state) = portal();
        assert_eq!(state, PORTAL_SHUT, "opened with monsters still standing");
        assert!(walkable(px, py, 0.7), "the way out is in the rock");

        // Walking into a shut one is not a door.
        let before = depth();
        set_goto((px * 1000.0) as i32, (py * 1000.0) as i32);
        step(1_200);
        assert_eq!(depth(), before, "a shut portal took the hero anyway");
    }

    #[test]
    fn clearing_the_level_opens_the_way_out() {
        init_quiet(1);
        assert_eq!(monsters_left(), 0);
        assert_eq!(portal().2, PORTAL_OPEN, "nothing left and still shut");
    }

    #[test]
    fn walking_into_an_open_way_out_builds_the_next_floor() {
        init_quiet(1);
        let before_map = map_revision();
        let before_hero = hero_row().expect("no hero");
        let (px, py, _) = portal();

        set_goto((px * 1000.0) as i32, (py * 1000.0) as i32);
        step(2_400);

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

        // A tick, a click and a slider all leave it alone. `publish` runs on
        // every one of them, which is exactly the mistake this guards.
        step(120);
        set_goto(1_000, 1_000);
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
        init_quiet(1);
        assert!(kill_the_hero(), "six brutes could not kill one fighter");
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
            "a 48x32 level opened with nothing left hidden from 9.6 units of sight"
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
        set_goto((tx * 1000.0) as i32, (ty * 1000.0) as i32);
        step(600);
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
        set_goto((tx * 1000.0) as i32, (ty * 1000.0) as i32);
        step(600);
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

        // A hero that genuinely does not move: the feet are the player's and the
        // player is pressing nothing. `clear_order` would not do -- with nothing
        // in sight the policy drifts toward open ground, so this would be a race
        // against the drift crossing a tile.
        set_control(CONTROL_FEET);
        set_input(0, 0, 0, 0, 0, 0);
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
        set_control(0);
        let (tx, ty) = walkable_near_hero(4.0, 0.45);
        set_goto((tx * 1000.0) as i32, (ty * 1000.0) as i32);
        step(240);
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
        assert!(Scenario::room().units.len() <= MAX_UNITS);
        assert!(Scenario::skirmish(1234, 4, 6).units.len() <= MAX_UNITS);
        // The frame cannot be asked for more arrows than the world can hold.
        assert_eq!(MAX_SHOTS, sim::MAX_SHOTS);

        // And the event block cannot be overrun by the busiest room this page
        // can open. Sixty-three monsters around one hero for a thousand ticks is
        // well past anything a player produces, and `push_event` has to hold the
        // ceiling through all of it.
        init_quiet(1);
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
                set_goto(cx, cy);
                step(200 + i as u32 * 7);
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
        // hash -- a new body is new state -- and the recorded script that never
        // spawns must be untouched by the fact that spawning now exists.
        init(1);
        set_goto(20_000, 12_000);
        step(600);
        assert_eq!(hash(), ROOM_HASH);

        spawn_monster(SKITTERER, SLOT_EMPTY, SLOT_EMPTY);
        assert_ne!(hash(), ROOM_HASH, "a new body left the world unchanged");

        // Run again from scratch. This is the half that would catch a spawn
        // counter that had been put in `World` instead of beside it.
        init(1);
        set_goto(20_000, 12_000);
        step(600);
        assert_eq!(
            hash(),
            ROOM_HASH,
            "spawning perturbed a run that never spawned"
        );
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

        let mut closed = false;
        let mut wounded = false;
        let mut swung = false;
        for _ in 0..120 {
            step(30);
            if let (Some(hero), Some(monster)) = (hero_row(), monsters().first()) {
                if distance(&hero, monster) < 2.0 {
                    closed = true;
                }
                if monster[4] < monster[5] {
                    wounded = true;
                }
                // The blade is out and moving: the fight is legible in the
                // frame, which is what the page draws from.
                if hero[12] > 0.0 && hero[13] != 0.0 {
                    swung = true;
                }
            }
            if monsters().is_empty() {
                break;
            }
        }

        assert!(closed, "the two never got within reach of each other");
        assert!(swung, "the hero never drew its sword in the frame");
        assert!(wounded, "the skitterer was killed without ever being seen hurt");
        let hero = hero_row().expect("the fighter lost to one skitterer");
        println!(
            "skitterer entered at ({}, {}), hero finished on {} hp at tick {}",
            start[0],
            start[1],
            hero[4],
            tick()
        );
        assert!(monsters().is_empty(), "the skitterer never died");
        // Note what is deliberately *not* asserted: that the hero got hurt. A
        // Fighter reaches 1.40 from its centre and a Skitterer 0.70, and under
        // geometric combat that gap is a real advantage rather than a rounding
        // one -- the Fighter now routinely wins this untouched. Requiring a
        // scratch would be pinning a balance accident from the old damage
        // model, which could not miss.
    }

    /// Kills whoever is standing on the hero's side, and answers whether it
    /// worked. Six brutes is not subtle, and it should not be.
    fn kill_the_hero() -> bool {
        for _ in 0..6 {
            spawn_monster(BRUTE, SLOT_EMPTY, SLOT_EMPTY);
        }
        for _ in 0..200 {
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
        init_quiet(1);
        assert_eq!(set_hero_stat(3, 14), 1, "perception would not move");
        assert_eq!(set_hero_stat(2, 17), 1, "intellect would not move");
        assert_eq!(hero_stat(3), 14);

        assert!(kill_the_hero(), "six brutes could not kill one fighter");

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
    /// attributes", and `UnitSpec::set_body` is where that is decided for both
    /// rails at once.
    #[test]
    fn changing_the_body_rebuilds_the_sheet_it_is_a_sheet_for() {
        init_quiet(1);
        set_hero_stat(3, 14);
        assert!(kill_the_hero(), "six brutes could not kill one fighter");

        assert_eq!(set_hero_body(ROGUE), 1, "the plan would not take a Rogue");
        assert_eq!(hero_body(), ROGUE);
        assert_eq!(
            hero_stat(3),
            i32::from(Body::Rogue.base_stats().perception),
            "a Rogue walked in wearing a Fighter's perception"
        );
        assert_eq!(hero_loadout(0), sim::ActionKind::Shortsword.code(), "and its own kit");
    }

    #[test]
    fn enough_monsters_kill_the_hero_and_the_frame_still_has_something_to_draw() {
        // The page has to say something when the character falls, so the state
        // it says it about needs to be reachable. The assertion is that death is
        // representable, not that any particular fight is balanced.
        init_quiet(1);
        let fell = kill_the_hero();
        println!("the hero fell at tick {}", tick());
        assert!(fell, "six brutes could not kill one fighter");
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

    #[test]
    fn dead_monsters_stop_holding_a_place_in_the_roster() {
        // Without the prune the roster only grows, so a long session of
        // spawning and killing hits the ceiling on handles that resolve to
        // nothing -- a full room with two bodies in it.
        init_quiet(1);
        spawn_monster(SKITTERER, SLOT_EMPTY, SLOT_EMPTY);
        assert_eq!(roster_len(), 2);

        for _ in 0..120 {
            step(30);
            if monsters().is_empty() {
                break;
            }
        }
        assert!(monsters().is_empty(), "the skitterer outlived the fight");
        assert_eq!(
            roster_len(),
            2,
            "the dead handle is still there, as expected"
        );

        spawn_monster(SKITTERER, SLOT_EMPTY, SLOT_EMPTY);
        assert_eq!(
            roster_len(),
            2,
            "the corpse was not swept up before the spawn"
        );
        assert_eq!(frame()[6], 2.0);
    }

    #[test]
    fn a_battle_replays() {
        // The cross-target claim, extended from a walk to a fight. This is the
        // number `tools/wasm_check.js` runs against `web.wasm`, and it exercises
        // arithmetic the walk never touches: `Rng::from_stream`, the committed
        // sine table by way of `Vec2::from_angle`, and `isqrt64` inside
        // `Vec2::distance`.
        init(1);
        spawn_monster(SKITTERER, SLOT_EMPTY, SLOT_EMPTY);
        step(600);
        println!("battle hash: 0x{:016x}", hash());
        assert_eq!(hash(), BATTLE_HASH, "the battle script no longer replays");
    }

    // ------------------------------------------------------------ swapping in

    const FIGHTER: u32 = 0;
    const ROGUE: u32 = 1;

    /// Six brutes and however long it takes. Answers the tick the character
    /// fell on, which is the state every test below starts from.
    fn fall_to_brutes() -> u32 {
        for _ in 0..6 {
            spawn_monster(BRUTE, SLOT_EMPTY, SLOT_EMPTY);
        }
        for _ in 0..300 {
            step(30);
            if hero_row().is_none() {
                return tick();
            }
        }
        panic!("six brutes could not kill one fighter");
    }

    #[test]
    fn a_replacement_walks_into_the_room_the_last_one_died_in() {
        init_quiet(1);
        let fallen = hero_row().expect("the room did not open with a hero");
        let at = fall_to_brutes();
        let standing = monsters().len();
        assert!(standing > 0, "nothing survived to be swapped in against");

        assert_eq!(swap_in_hero(FIGHTER, SLOT_EMPTY, SLOT_EMPTY), 1, "nobody arrived");
        let hero = hero_row().expect("the frame has no hero in it");
        assert_eq!(hero[6], 0.0, "faction: Heroes");
        assert_eq!(hero[7], 0.0, "kind: Fighter");
        assert_eq!(hero[4], 84.0, "hp: 20 + 8 * vitality 8");
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
        init_quiet(1);
        fall_to_brutes();
        assert_eq!(swap_in_hero(ROGUE, SLOT_EMPTY, SLOT_EMPTY), 1, "nobody arrived");

        let hero = hero_row().expect("the frame has no hero in it");
        assert_eq!(hero[7], 1.0, "kind: Rogue");
        assert_eq!(hero[5], 52.0, "max_hp: 20 + 8 * vitality 4");
        assert!((hero[3] - 0.35).abs() < 0.001, "radius {}", hero[3]);
    }

    #[test]
    fn an_unrecognised_hero_code_is_a_warrior_rather_than_a_monster() {
        // `kind_from_code` would answer Skitterer here, which would put a
        // monster archetype on the player's side of the room. Falling through
        // to a hero build instead is the whole reason the two decoders are
        // separate functions.
        init_quiet(1);
        fall_to_brutes();
        assert_eq!(swap_in_hero(9_999, SLOT_EMPTY, SLOT_EMPTY), 1);
        assert_eq!(hero_row().expect("nobody arrived")[7], 0.0, "kind: Fighter");
        assert_eq!(monsters().iter().filter(|m| m[6] == 0.0).count(), 0);
    }

    #[test]
    fn a_replacement_arrives_under_no_order_at_all() {
        // An order belongs to the faction, so it outlives the body it was given
        // to. Inheriting it would have the newcomer set off for wherever the
        // last one was headed when it was killed -- which is where the things
        // that killed it are standing.
        init_quiet(1);
        set_goto(23_000, 15_000);
        step(60);
        fall_to_brutes();
        assert_eq!(
            frame()[2],
            4.0,
            "the dead character's order should outlive it"
        );

        assert_eq!(swap_in_hero(FIGHTER, SLOT_EMPTY, SLOT_EMPTY), 1);
        assert_eq!(frame()[2], 0.0, "order_kind: Hold, not the dead one's Goto");
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
    fn a_replacement_lands_clear_of_the_monsters_and_inside_the_wall() {
        // The assertion that matters is the clearance one. A brute reaches
        // 0.70 + 0.45 + 0.9 = 2.05 between centres, so anything at or under
        // that arrives already inside somebody's swing -- a swap button that
        // hands the player a corpse.
        let mut tightest = f32::INFINITY;
        for seed in 1..9u32 {
            init_quiet(seed);
            fall_to_brutes();
            assert_eq!(swap_in_hero(FIGHTER, SLOT_EMPTY, SLOT_EMPTY), 1, "seed {seed}: nobody arrived");

            let hero = hero_row().expect("the frame has no hero in it");
            let radius = hero[3];
            assert!(
                hero[0] >= radius - 0.001
                    && hero[0] <= arena().0 - radius + 0.001
                    && hero[1] >= radius - 0.001
                    && hero[1] <= arena().1 - radius + 0.001,
                "seed {seed}: arrived outside the level at ({}, {})",
                hero[0],
                hero[1],
            );
            assert!(
                walkable(hero[0], hero[1], radius),
                "seed {seed}: arrived in the rock at ({}, {})",
                hero[0],
                hero[1],
            );

            for monster in monsters() {
                tightest = tightest.min(distance(&monster, &hero));
            }
        }
        println!("closest arrival across eight seeds: {tightest}");
        assert!(
            tightest > 2.05,
            "arrived {tightest} from a monster, inside its reach",
        );
    }

    #[test]
    fn a_swap_replays() {
        // The cross-target claim over the whole arc the page can now show: a
        // fight, a death, a replacement, and the fight the replacement walks
        // into. This is the number `tools/wasm_check.js` runs against
        // `web.wasm`.
        fn script() -> u64 {
            init(1);
            for _ in 0..3 {
                spawn_monster(BRUTE, SLOT_EMPTY, SLOT_EMPTY);
            }
            step(1_800);
            assert!(
                hero_row().is_none(),
                "three brutes no longer finish the fighter inside 1800 ticks"
            );
            assert_eq!(swap_in_hero(ROGUE, SLOT_EMPTY, SLOT_EMPTY), 1, "nobody arrived");
            step(400);
            hash()
        }
        let measured = script();
        println!("swap hash: 0x{measured:016x}");
        assert_eq!(measured, SWAP_HASH, "the swap script no longer replays");
        assert_eq!(script(), measured, "the same run diverged from itself");
    }

    /// **The only script here that puts an arrow in the air**, and worth its own
    /// number for exactly that reason.
    ///
    /// The other four never reach the projectile path, which is a good deal of
    /// arithmetic none of them exercise: `Vec2::length` on every tick of every
    /// flight (an `isqrt64`), `fx::segment_circle`'s `i64`-staged dot products,
    /// and `tangential_speed`'s saturating multiply at the release. Portable
    /// fixed-point is a claim about *code that runs*, and until this existed the
    /// cross-target suite made no claim about any of it.
    #[test]
    fn a_bow_replays() {
        fn script() -> u64 {
            init(1);
            // Through the loadout panel's own export rather than by spawning a
            // fresh archer: `swap_in_hero` refuses while a hero is alive, and
            // this is the path a player actually takes to pick up a bow.
            assert_eq!(
                set_hero_loadout(0, sim::ActionKind::Bow.code()),
                1,
                "the hero would not take a bow"
            );
            spawn_monster(BRUTE, SLOT_EMPTY, SLOT_EMPTY);
            step(1_200);
            hash()
        }
        let measured = script();
        println!("bow hash: 0x{measured:016x}");
        assert_eq!(measured, BOW_HASH, "the bow script no longer replays");
        assert_eq!(script(), measured, "the same run diverged from itself");
    }

    /// A page that cannot draw an arrow is a page on which a bow does nothing
    /// visible at all, so the frame carrying them is its own claim.
    #[test]
    fn the_frame_carries_arrows() {
        init_quiet(1);
        assert_eq!(
            set_hero_loadout(0, sim::ActionKind::Bow.code()),
            1,
            "the hero would not take a bow"
        );
        spawn_monster(BRUTE, SLOT_EMPTY, SLOT_EMPTY);

        let mut seen = 0usize;
        for _ in 0..1_200 {
            step(1);
            let live = frame();
            let units = live[6] as usize;
            let shots = live[7] as usize;
            assert_eq!(
                live.len(),
                HEADER_LEN
                    + units * UNIT_STRIDE
                    + shots * SHOT_STRIDE
                    + live[8] as usize * EVENT_STRIDE,
                "the frame's length disagrees with its own three counts"
            );
            for s in 0..shots {
                let row = &live[HEADER_LEN + units * UNIT_STRIDE + s * SHOT_STRIDE..];
                assert!(
                    row[0] >= 0.0 && row[0] <= live[0] && row[1] >= 0.0 && row[1] <= live[1],
                    "an arrow was drawn outside the arena at ({}, {})",
                    row[0],
                    row[1]
                );
                assert!(row[3] == 0.0 || row[3] == 1.0, "faction {}", row[3]);
            }
            seen = seen.max(shots);
        }
        assert!(seen > 0, "twenty seconds of archery reached the frame as nothing");
    }

    #[test]
    fn a_swap_consumes_a_placement_roll() {
        // Only one can be answered at a time, so the counter's effect here is
        // invisible from the outside -- except that a swap has to *consume* a
        // roll, or a monster spawned on the same tick afterwards would be
        // placed exactly where one spawned before the swap would have been.
        init_quiet(1);
        fall_to_brutes();
        swap_in_hero(FIGHTER, SLOT_EMPTY, SLOT_EMPTY);
        let after_swap = monsters().len();
        spawn_monster(SKITTERER, SLOT_EMPTY, SLOT_EMPTY);
        let with = monsters()[after_swap].clone();

        init_quiet(1);
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

    /// Only the `declare` rows of the live frame.
    fn declares() -> Vec<Vec<f32>> {
        events()
            .into_iter()
            .filter(|row| row[0] == EVENT_DECLARE as f32)
            .collect()
    }

    #[test]
    fn a_declare_row_is_emitted_once_per_windup() {
        init_quiet(1);
        set_control(CONTROL_LIMB);
        // Chambered due north, attacking nothing. A blade at guard has nothing
        // to announce, and announcing one anyway would put a permanent bubble
        // over every character in the room.
        set_input(0, 0, 16_384, 0, 0, 0);
        step(30);
        assert!(declares().is_empty(), "a blade at guard announced an attack");

        // One press, held. `Hand::armed` starts an attack only on a press that
        // follows a release, so everything below is a single cut from windup to
        // recovery -- which is exactly what "once per windup" has to mean.
        set_input(0, 0, 16_384, 0, 0, 1);
        let mut announced: Vec<Vec<f32>> = Vec::new();
        let mut phases = [false; 3];
        for _ in 0..90 {
            step(1);
            announced.extend(declares());
            match frame()[HEADER_LEN + 19] as i32 {
                1 => phases[0] = true,
                2 => phases[1] = true,
                3 => phases[2] = true,
                _ => {}
            }
        }
        assert_eq!(
            phases,
            [true, true, true],
            "the swing never ran end to end, so counting its declarations proves nothing"
        );
        assert_eq!(
            announced.len(),
            1,
            "one press produced {} declarations",
            announced.len()
        );

        let row = &announced[0];
        assert_eq!(row[3], sim::ActionKind::Sword.code() as f32, "the action code");
        assert_eq!(row[4], 0.0, "actor_index: the room's hero holds slot 0");
        // The swinger's own position, which is where the bubble goes.
        let hero = hero();
        assert!(
            (row[1] - hero.0).abs() < 1.0 && (row[2] - hero.1).abs() < 1.0,
            "declared at ({}, {}) with the hero at {hero:?}",
            row[1],
            row[2]
        );

        // Releasing and pressing again is a second attack, and a second row.
        set_input(0, 0, 16_384, 0, 0, 0);
        step(10);
        set_input(0, 0, 16_384, 0, 0, 1);
        let mut again = 0;
        for _ in 0..90 {
            step(1);
            again += declares().len();
        }
        assert_eq!(again, 1, "the second press produced {again} declarations");
    }

    #[test]
    fn catching_up_eight_ticks_reports_eight_ticks_of_events() {
        // The property the buffer is cleared per *call* for. A tab that was
        // behind hands `step` up to `MAX_CATCHUP_TICKS` at once, and all eight
        // of those ticks happened -- a feed cleared per tick would report the
        // last one and silently drop seven eighths of the fight's damage
        // numbers on exactly the frames the browser was late for.
        fn brawl(warmup: u32) {
            init_quiet(1);
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
        let mut warmup = 60;
        let mut per_tick = one_at_a_time(warmup);
        while busy(&per_tick) < 2 && warmup < 1_200 {
            warmup += 8;
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
        assert_eq!(set_hero_stat(4, 8), 1);
        let before = hero_row().expect("the hero is gone");
        assert_eq!((before[4], before[5]), (84.0, 84.0));
        assert_eq!(set_hero_stat(4, 16), 1);
        let after = hero_row().expect("the hero is gone");
        assert_eq!(after[5], 148.0, "max_hp: 20 + 8 * vitality 16");
        assert_eq!(after[4], after[5], "a full bar did not stay full");
    }

    #[test]
    fn the_hero_can_change_body_without_leaving_the_room() {
        init_quiet(1);
        assert_eq!(hero_body(), FIGHTER);
        let before = hero_row().expect("the room did not open with a hero");

        assert_eq!(set_hero_body(BRUTE), 1, "the body would not change");
        assert_eq!(hero_body(), BRUTE);
        let after = hero_row().expect("the hero is gone");
        assert_eq!(after[7], 2.0, "kind: Brute");
        assert!((after[3] - 0.70).abs() < 0.001, "radius {}", after[3]);
        assert_eq!(after[5], 132.0, "max_hp: 20 + 8 * vitality 14");
        // The kit came with the body, which is what makes this a body swap
        // rather than a stat sheet swap.
        assert_eq!(after[25], sim::ActionKind::Club.code() as f32, "slot0");
        assert_eq!(after[26], sim::ActionKind::Punch.code() as f32, "slot1");
        // **Not a respawn.** Same handle, same place, same clock -- the room
        // does not reset around a body change.
        assert_eq!((after[9], after[10]), (before[9], before[10]), "a new handle");
        assert_eq!(tick(), 0);
        assert_eq!(frame()[6], 1.0, "unit_count");

        // Total for garbage, like every other inward mapping here.
        assert_eq!(set_hero_body(9_999), 1);
        assert_eq!(hero_body(), SKITTERER, "kind_from_code's fallback");
        // And it is `hero_body`'s exact inverse, so reading and writing back is
        // a no-op rather than a quiet reshuffle.
        for body in [FIGHTER, ROGUE, BRUTE, SKITTERER] {
            assert_eq!(set_hero_body(body), 1);
            assert_eq!(hero_body(), body);
        }
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
        assert_eq!(monster[5], 60.0, "max_hp: 20 + 8 * vitality 5");
        assert!((monster[27] - 12.0).abs() < 0.001, "sight_range {}", monster[27]);
        assert_eq!(monster[25], sim::ActionKind::Bow.code() as f32, "slot0");
        assert_eq!(monster[26], sim::ActionKind::Shield.code() as f32, "slot1");
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
            plain[5], 36.0,
            "max_hp: 20 + 8 * vitality 2 -- the template leaked into the hotkey"
        );
        assert_eq!(plain[25], sim::ActionKind::Knife.code() as f32, "slot0");
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
}
