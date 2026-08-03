//! The browser boundary.
//!
//! One `cdylib`, eleven `extern "C"` functions, and a single packed `f32`
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
//!     step(n);                     // n ticks of think-and-move
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
//!              last_decision_tick, unit_count]
//!     unit    [x, y, facing_raw, radius, hp, max_hp, faction, kind, intent]
//!     ...     unit_count of them
//! ```
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

use fx::{Fx, Vec2};
use policy::{Policy, RunConfig, UtilityPolicy};
use sim::{EntityId, Faction, Intent, Order, Scenario, UnitKind, UnitView, World};

/// Floats before the first unit: `[arena_x, arena_y, order_kind, order_x,
/// order_y, last_decision_tick, unit_count]`.
pub const HEADER_LEN: usize = 7;

/// Floats per unit: `[x, y, facing_raw, radius, hp, max_hp, faction, kind,
/// intent]`.
pub const UNIT_STRIDE: usize = 9;

/// Ceiling on units in one frame. The room holds exactly one and a skirmish
/// holds a dozen; the number exists so the buffer can be a fixed array rather
/// than a `Vec`, and 64 rows cost 2.3 KB of linear memory once, forever.
pub const MAX_UNITS: usize = 64;

/// Length of the frame buffer. [`frame_len`] reports how much of it is live.
pub const FRAME_MAX: usize = HEADER_LEN + MAX_UNITS * UNIT_STRIDE;

thread_local! {
    static SIM: RefCell<Option<Sim>> = const { RefCell::new(None) };
    static FRAME: RefCell<[f32; FRAME_MAX]> = const { RefCell::new([0.0; FRAME_MAX]) };
    /// Starts at the header length rather than zero so a client that renders
    /// before it calls `init` reads a well-formed empty frame instead of a
    /// zero-length one.
    static FRAME_LEN: Cell<u32> = const { Cell::new(HEADER_LEN as u32) };
}

/// `thread_local!` and `RefCell` are sound here because the target is
/// single-threaded: there is one instance per wasm module and one module per
/// page. Natively they give each `#[test]` thread its own module for free.
struct Sim {
    world: World,
    policy: UtilityPolicy,
    /// Everything the frame draws, captured once. Iterating these and asking
    /// [`World::view`] beats [`World::snapshot`], which allocates a fresh `Vec`
    /// per call -- sixty allocations a second, each one a chance to grow linear
    /// memory and detach the client's typed array.
    units: Vec<EntityId>,
    /// Scratch for the decision loop. Held across calls so the loop allocates
    /// once for the life of the page rather than once a frame.
    due: Vec<EntityId>,
    /// The tick some unit last answered a decision on, recorded here rather
    /// than in `sim` because it is a presentation detail: it is what lets the
    /// page *show* intellect as reaction speed.
    last_decision_tick: u32,
}

impl Sim {
    fn new(seed: u64) -> Sim {
        let scenario = Scenario::room();
        let world = World::new(&scenario, seed);
        let mut units = Vec::with_capacity(scenario.units.len());
        for faction in [Faction::Heroes, Faction::Monsters] {
            units.extend_from_slice(&world.alive_ids(faction));
        }
        Sim {
            world,
            policy: UtilityPolicy::baseline(),
            units,
            due: Vec::with_capacity(scenario.units.len()),
            last_decision_tick: 0,
        }
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
    /// tick-zero action forever -- which under a `Goto` means walking straight
    /// through the destination and into the far wall.
    fn advance(&mut self, frames: u32) {
        // Taken out and put back so the borrow checker can see that the scratch
        // buffer and the world are disjoint. It is the same allocation each
        // time round, which is the whole point of keeping it in the struct.
        let mut due = std::mem::take(&mut self.due);
        for _ in 0..frames {
            due.clear();
            due.extend_from_slice(self.world.pending_decisions());
            for &id in &due {
                let action = self.policy.decide(&self.world.observe(id));
                self.world.submit(id, action);
                self.last_decision_tick = self.world.tick();
            }
            self.world.step();
        }
        self.due = due;
    }

    /// Fills `frame` and returns how much of it is live.
    fn write_frame(&self, frame: &mut [f32; FRAME_MAX]) -> usize {
        // The player's order is a hero order; there is nobody else to command.
        let order = self.world.order(Faction::Heroes);
        let point = order.point();
        let arena = self.world.arena();
        frame[0] = arena.x.to_f32();
        frame[1] = arena.y.to_f32();
        frame[2] = order.discriminant() as f32;
        frame[3] = point.x.to_f32();
        frame[4] = point.y.to_f32();
        frame[5] = self.last_decision_tick as f32;

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
            write_unit(&mut frame[HEADER_LEN + count * UNIT_STRIDE..], &view);
            count += 1;
        }
        frame[6] = count as f32;
        HEADER_LEN + count * UNIT_STRIDE
    }
}

fn write_unit(row: &mut [f32], view: &UnitView) {
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
}

/// Archetype as a small integer, matching the encoding `UnitKind` hashes with.
/// Spelled out rather than derived because the client keys its sprites and
/// colours on these numbers: a silent reshuffle would repaint the game.
const fn kind_code(kind: UnitKind) -> u32 {
    match kind {
        UnitKind::Warrior => 0,
        UnitKind::Scout => 1,
        UnitKind::Brute => 2,
        UnitKind::Skitterer => 3,
    }
}

/// What a unit is trying to do, in the same encoding `Action` hashes with.
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
fn publish() {
    let len = SIM.with(|sim| match sim.borrow().as_ref() {
        Some(sim) => FRAME.with(|frame| sim.write_frame(&mut frame.borrow_mut())),
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
    SIM.with(|sim| *sim.borrow_mut() = Some(Sim::new(u64::from(seed))));
    publish();
}

/// A click, as thousandths of a world unit.
///
/// Integers, so that no float ever crosses into simulation state -- the rule
/// the whole determinism contract rests on. A thousandth of a unit is 1/50 of
/// the arrival deadband and about a twentieth of a pixel on the canvas this
/// feeds, so the truncation is not observable.
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
        sim.world.set_order(Faction::Heroes, Order::Goto(dest));
    });
    publish();
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
        sim.world.set_order(Faction::Heroes, Order::Hold);
    });
    publish();
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

/// How many `f32`s of the buffer are live: `7 + 9 * unit_count`.
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
        &mut UtilityPolicy::baseline(),
        &RunConfig::default(),
    )
    .state_hash
}

#[cfg(test)]
mod tests {
    use super::*;

    /// What `cargo run --release -p lab -- hash` prints today. Recorded rather
    /// than computed, so this test fails if the sim's behaviour moves at all --
    /// which is the point of having it here as well as in `sim`.
    const LAB_HASH: u64 = 0xb148_b533_8bc0_49f6;

    /// What `init(1); set_goto(20_000, 12_000); step(600)` leaves behind.
    /// Recorded here natively; the same three calls against `web.wasm` under
    /// Node produce the same number, which is the first time this project's
    /// central claim has been checked across targets rather than asserted.
    const ROOM_HASH: u64 = 0x32a0_f552_486e_d898;

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

    fn hero() -> (f32, f32) {
        let frame = frame();
        (frame[HEADER_LEN], frame[HEADER_LEN + 1])
    }

    fn distance_from_hero(x: f32, y: f32) -> f32 {
        let (hx, hy) = hero();
        ((hx - x).powi(2) + (hy - y).powi(2)).sqrt()
    }

    #[test]
    fn the_selftest_hash_is_the_number_the_lab_prints_natively() {
        assert_eq!(
            selftest_hash(),
            LAB_HASH,
            "the selftest no longer runs what `lab hash` runs"
        );
        assert_eq!(selftest(), LAB_HASH, "the halves reassemble wrongly");
        assert_eq!(selftest_hash_lo(), 0x8bc0_49f6);
        assert_eq!(selftest_hash_hi(), 0xb148_b533);
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
            step(10);
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
        // the hero on its tick-zero action forever: it would set off in exactly
        // the right direction, never re-decide, and end up pinned in the far
        // corner at (23.55, 15.55) -- which reads as "it moved, so it works"
        // right up until you look at where it stopped.
        init(1);
        assert_eq!(hero(), (12.0, 8.0), "the room did not open where it should");

        set_goto(20_000, 12_000);
        step(200);

        let (x, y) = hero();
        println!("walked to ({x}, {y}) in {} ticks", tick());
        assert!(
            distance_from_hero(20.0, 12.0) <= 0.055,
            "stopped at ({x}, {y}), not at the click"
        );
        assert!(x < 21.0 && y < 13.0, "walked past the click to ({x}, {y})");
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
        init(1);
        set_goto(20_000, 12_000);
        step(60);

        let frame = frame();
        assert_eq!(frame.len(), HEADER_LEN + UNIT_STRIDE);
        assert_eq!(frame_len() as usize, frame.len());
        assert_eq!(frame[0], 24.0, "arena_x");
        assert_eq!(frame[1], 16.0, "arena_y");
        assert_eq!(frame[2], 4.0, "order_kind: Goto is discriminant 4");
        assert_eq!(frame[3], 20.0, "order_x");
        assert_eq!(frame[4], 12.0, "order_y");
        assert!(
            frame[5] > 0.0 && frame[5] <= tick() as f32,
            "last_decision_tick is {}, at tick {}",
            frame[5],
            tick()
        );
        assert_eq!(frame[6], 1.0, "unit_count");

        let unit = &frame[HEADER_LEN..];
        assert!(unit[0] > 12.0 && unit[1] > 8.0, "x, y: the hero set off");
        // The Warrior's stats, as a check that the row is not shifted by one:
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
        assert_eq!(unit[7], 0.0, "kind: Warrior");
        assert_eq!(unit[8], 0.0, "intent: Hold");
    }

    #[test]
    fn a_click_crosses_as_thousandths_and_arrives_as_a_world_point() {
        // Both values are exact in `Fx` and exact in `f32`, so an exact
        // comparison is honest here rather than a rounding accident: the point
        // is that 20500 means 20.5 and nothing is scaled twice on the way.
        init(1);
        set_goto(20_500, -3_250);
        let frame = frame();
        assert_eq!((frame[3], frame[4]), (20.5, -3.25));

        // A wrapped `i32` from JavaScript must saturate rather than overflow,
        // and the walk that follows must still be a walk.
        set_goto(i32::MIN, i32::MAX);
        step(60);
        let (x, y) = hero();
        assert!(
            x < 12.0 && y > 8.0,
            "gave up on a nonsense click: ({x}, {y})"
        );
    }

    #[test]
    fn clearing_the_order_hands_the_hero_back_to_its_own_judgement() {
        // Worth being exact about, because "clear the order" reads like "stop"
        // and it is not. Under `Order::Hold` with nothing in sight the policy
        // steers for open ground, which in an empty room is a slow drift back
        // to the middle. That is `UtilityPolicy`'s search behaviour working as
        // designed, not a stale order leaking through this boundary, and the
        // page has to present it as the character deciding for itself rather
        // than as a control that did not take.
        init(1);
        set_goto(20_000, 12_000);
        step(120);
        let (away_x, away_y) = hero();
        assert!(away_x > 14.0, "never got going: at ({away_x}, {away_y})");

        clear_order();
        assert_eq!(frame()[2], 0.0, "order_kind: Hold is discriminant 0");
        // Slow: `open_ground` is a third of a stride at baseline `wall_fear`,
        // and it tapers off as the pull it comes from shrinks.
        step(900);
        let (back_x, back_y) = hero();
        println!("released at ({away_x}, {away_y}), drifted to ({back_x}, {back_y})");
        assert!(
            back_x < away_x && back_y < away_y,
            "kept walking to a cancelled click: ({back_x}, {back_y})"
        );
        assert!(
            distance_from_hero(12.0, 8.0) < 1.0,
            "drifted somewhere other than the open middle: ({back_x}, {back_y})"
        );
    }

    #[test]
    fn a_frame_can_never_outgrow_its_buffer() {
        // `write_frame` indexes `HEADER_LEN + count * UNIT_STRIDE`, so the
        // ceiling and the array length have to agree exactly.
        assert_eq!(FRAME_MAX, HEADER_LEN + MAX_UNITS * UNIT_STRIDE);
        assert!(Scenario::room().units.len() <= MAX_UNITS);
        assert!(Scenario::skirmish(1234, 4, 6).units.len() <= MAX_UNITS);
    }
}
