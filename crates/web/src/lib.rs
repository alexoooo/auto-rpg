//! The browser boundary.
//!
//! One `cdylib`, twenty-five `extern "C"` functions, and a single packed `f32`
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
//!     spawn_monster(kind);         // something to fight, placed on this side
//!     step(n);                     // n ticks of think-and-move
//!     swap_in_hero(kind);          // a replacement, once yours has fallen
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
//!     unit    [x, y, facing_raw, radius, hp, max_hp, faction, kind, intent,
//!              entity_index, entity_generation,
//!              sword_angle_raw, sword_reach, sword_spin,
//!              shield_angle_raw, shield_reach, weapon_length, shield_arc_raw,
//!              hit_flash, block_flash, parry_flash]
//!     ...     unit_count of them
//! ```
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
    Action, EntityId, Event, Faction, HandCommand, Intent, Order, Scenario, UnitKind, UnitSpec,
    UnitView, World, Strike, SHIELD, SWORD,
};

/// Floats before the first unit: `[arena_x, arena_y, order_kind, order_x,
/// order_y, last_decision_tick, unit_count]`.
pub const HEADER_LEN: usize = 7;

/// Floats per unit.
///
/// Columns `0..=10` are frozen: `[x, y, facing_raw, radius, hp, max_hp,
/// faction, kind, intent, entity_index, entity_generation]`. Everything the
/// swordplay needs was **appended**, for the same reason `kind_code` is spelled
/// out rather than derived -- the client keys on positions, and a reshuffle
/// repaints the game while every test still passes.
///
/// `11..=17` are the hands and the weapon: `[sword_angle_raw, sword_reach,
/// sword_spin, shield_angle_raw, shield_reach, weapon_length, shield_arc_raw]`.
///
/// `18..=20` are `[hit_flash, block_flash, parry_flash]`, each `0..=1`. These
/// are **presentation counters owned by [`Sim`]**, fed from the event slice
/// `World::step` returns, and deliberately not simulation state. Before them
/// the client inferred a hit from health falling between frames and needed an
/// epsilon to tell a blow from regeneration -- which could not see a blocked
/// blow at all, because a blocked blow is most of the drama and almost none of
/// the damage.
///
/// `21..=23` are the attack: `[sword_swing, sword_swing_left, sword_line_raw]`.
/// The phase codes match [`sim::Swing::discriminant`] -- `0` guard, `1` windup,
/// `2` strike, `3` recover.
///
/// These are in the frame for the same reason the flashes are, and it is the
/// stronger case of the two. A windup is the moment the whole combat model
/// turns on, and it is *invisible* in the columns that were already here: the
/// blade is drawn back and moving slowly, which looks exactly like a blade
/// being repositioned. A page that cannot draw the difference is a page where
/// every attack appears out of nowhere, and the player has no way to learn a
/// tell the AI is being scored on reading.
pub const UNIT_STRIDE: usize = 24;

/// Ticks a hit, block or parry stays lit in the frame.
const FLASH_TICKS: u8 = 12;

/// Bit in [`control`] that hands the feet to the player.
pub const CONTROL_FEET: u32 = 1;
/// Bit in [`control`] that hands the sword hand to the player.
pub const CONTROL_SWORD: u32 = 2;

/// Ceiling on units in one frame. The room holds exactly one and a skirmish
/// holds a dozen; the number exists so the buffer can be a fixed array rather
/// than a `Vec`, and 64 rows cost 2.3 KB of linear memory once, forever.
pub const MAX_UNITS: usize = 64;

/// Length of the frame buffer. [`frame_len`] reports how much of it is live.
pub const FRAME_MAX: usize = HEADER_LEN + MAX_UNITS * UNIT_STRIDE;

/// Closest a newcomer may be placed to the hero, and the floor the arc sweep
/// in [`Sim::spawn_point`] accepts against. Far enough that you watch it come.
const SPAWN_NEAR: Fx = Fx::from_int(6);

/// Furthest a newcomer may be placed from the hero.
///
/// Nine, and the number is measured rather than picked: a Warrior sees
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
    spawns: u32,

    // ---- manual control
    /// Which halves of the hero the player has taken: see [`CONTROL_FEET`] and
    /// [`CONTROL_SWORD`]. Independent bits on purpose -- steering a swordsman
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
    input_shield: bool,
    /// The policy's most recent opinion about the hero.
    ///
    /// Under manual control the host submits every tick, but it only *asks* the
    /// policy on the hero's own decision beat, and overwrites the controlled
    /// fields of this. So the AI-driven half keeps its intellect cadence
    /// exactly, and the player's half is not throttled by a stat that is
    /// modelling somebody else's reaction time.
    cached: Action,
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
}

impl Sim {
    fn new(seed: u64) -> Sim {
        let scenario = Scenario::room();
        let world = World::new(&scenario, seed);
        let mut units = Vec::with_capacity(scenario.units.len());
        for faction in [Faction::Heroes, Faction::Monsters] {
            units.extend_from_slice(&world.alive_ids(faction));
        }
        let kinds = [PolicyKind::Utility, PolicyKind::Utility];
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
            control: 0,
            input_move: Vec2::ZERO,
            input_aim: Angle::ZERO,
            input_reach: Fx::ZERO,
            input_strike: Strike::None,
            input_shield: false,
            cached: Action::HOLD,
            hero_next_decision: 0,
            flashes: Vec::new(),
        }
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
    /// tick-zero action forever -- which under a `Goto` means walking straight
    /// through the destination and into the far wall.
    fn advance(&mut self, frames: u32) {
        // Taken out and put back so the borrow checker can see that the scratch
        // buffer and the world are disjoint. It is the same allocation each
        // time round, which is the whole point of keeping it in the struct.
        let mut due = std::mem::take(&mut self.due);
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
                let action = self.policies[faction.index()].decide(&obs);
                self.world.submit(id, action);
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
                    Event::Damage { target, .. } => [(target, 0u8), (EntityId::NONE, 0)],
                    Event::Block { defender, .. } => [(defender, 1), (EntityId::NONE, 0)],
                    Event::Parry { a, b, .. } => [(a, 2), (b, 2)],
                    Event::Death { .. } => continue,
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
        }
        self.due = due;
    }

    /// Submits the hero's action for this tick, blending the policy's opinion
    /// with whatever the player is holding.
    fn drive_hero(&mut self, hero: EntityId) {
        if self.world.tick() >= self.hero_next_decision {
            let obs = self.world.observe(hero);
            self.cached = self.policies[Faction::Heroes.index()].decide(&obs);
            self.hero_next_decision = self.world.tick() + obs.decision_period.max(1) as u32;
            self.last_decision_tick = self.world.tick();
        }

        let mut action = self.cached;
        if self.control & CONTROL_FEET != 0 {
            action.move_dir = self.input_move;
        }
        if self.control & CONTROL_SWORD != 0 {
            if self.input_shield {
                // The modifier steers the guard: a bearing and how far it is
                // braced, exactly as the shield has always worked.
                action.hands[SHIELD] = HandCommand::new(self.input_aim, self.input_reach);
            } else {
                // The pointer is the line and the button is the cut. Note what
                // the player does *not* get to say: how far the blade extends,
                // or where it goes between phases. Those belong to the attack,
                // and handing them over is exactly how the blade became a stick
                // that dangled at full length forever.
                action.hands[SWORD] = HandCommand::attack(self.input_aim, self.input_strike);
            }
        }
        // Nothing about this reaches past the agent boundary: it is an
        // `Observation` in and an `Action` out, same as any policy, and the sim
        // still cannot tell which of them wrote it.
        self.world.submit(hero, action);
    }

    /// Walks one monster into the running room. Answers how many monsters are
    /// now alive, which is zero only when nothing arrived.
    fn spawn_monster(&mut self, kind: UnitKind) -> u32 {
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
        let spawn = self.spawn_point(kind, &mut rng);
        let id = self.world.spawn(&UnitSpec {
            kind,
            faction: Faction::Monsters,
            stats: kind.base_stats(),
            spawn,
        });
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
    fn swap_in_hero(&mut self, kind: UnitKind) -> u32 {
        let world = &self.world;
        self.units.retain(|&id| world.is_alive(id));
        if self.world.alive_count(Faction::Heroes) > 0 || self.units.len() >= MAX_UNITS {
            return 0;
        }

        let mut rng = self.placement_rng();
        let spawn = self.entry_point(kind, &mut rng);
        let id = self.world.spawn(&UnitSpec {
            kind,
            faction: Faction::Heroes,
            stats: kind.base_stats(),
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

    /// Somewhere on a ring around the hero, inside the box a body can stand in.
    ///
    /// One bearing and one reach are rolled, and the bearing is then swept in
    /// sixteenths of a turn until the point survives being clamped into the
    /// arena. Sweeping rather than re-rolling is what makes this terminate
    /// honestly: `clamp_box` only ever *shortens*, so a candidate that needed no
    /// clamping is accepted on the first try and the loop is the wall case
    /// alone. Rejection-sampling the whole room would do most of its work in
    /// exactly the situation that matters least -- with the hero cornered, most
    /// of the arena is the wrong distance away.
    fn spawn_point(&self, kind: UnitKind, rng: &mut Rng) -> Vec2 {
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
            if point.distance(hero) >= SPAWN_NEAR {
                return point;
            }
        }

        // Every bearing was against a wall, which takes a hero pinned in a
        // corner of a room barely bigger than the ring. The far corner of the
        // reachable box is half an arena away from wherever it is standing.
        //
        // Two monsters can still be placed on the same spot, here or above.
        // `World::separate` unsticks exactly-coincident bodies from their index
        // pair without an RNG -- that degenerate case is what it was written
        // for -- so this needs no code of its own.
        Vec2::new(
            if hero.x * Fx::TWO < arena.x {
                hi.x
            } else {
                lo.x
            },
            if hero.y * Fx::TWO < arena.y {
                hi.y
            } else {
                lo.y
            },
        )
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
    /// -- exactly where [`init`] puts the first one.
    fn entry_point(&self, kind: UnitKind, rng: &mut Rng) -> Vec2 {
        let arena = self.world.arena();
        let radius = kind.radius();
        let lo = Vec2::new(radius, radius);
        let hi = Vec2::new(arena.x - radius, arena.y - radius);
        let centre = (arena * Fx::HALF).clamp_box(lo, hi);

        let start = rng.angle();
        let reach = rng.range(SPAWN_NEAR, SPAWN_FAR);
        let mut best = centre;
        let mut clearest = self.clearance(centre);
        for step in 0..SPAWN_ARCS {
            let bearing = start + Angle::from_raw(step.wrapping_mul(SPAWN_ARC_STEP));
            let point = (centre + Vec2::from_angle(bearing) * reach).clamp_box(lo, hi);
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
            write_unit(
                &mut frame[HEADER_LEN + count * UNIT_STRIDE..],
                &view,
                self.flash_of(id),
            );
            count += 1;
        }
        frame[6] = count as f32;
        HEADER_LEN + count * UNIT_STRIDE
    }
}

fn write_unit(row: &mut [f32], view: &UnitView, flash: Flash) {
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

    // The hands. Bearings ship as raw binary angles like `facing`, so the one
    // float conversion in the stack stays on the way out.
    let sword = view.hands[SWORD];
    let shield = view.hands[SHIELD];
    row[11] = f32::from(sword.angle.raw());
    row[12] = sword.reach.to_f32();
    row[13] = sword.spin.to_f32();
    row[14] = f32::from(shield.angle.raw());
    row[15] = shield.reach.to_f32();
    row[16] = view.weapon.length.to_f32();
    row[17] = f32::from(view.weapon.shield_arc);

    row[18] = flash_level(flash.hit);
    row[19] = flash_level(flash.block);
    row[20] = flash_level(flash.parry);

    // The attack, so the page can draw a telegraph rather than a blow that
    // arrives out of nowhere. `line` is where the cut is aimed, which during a
    // windup is nowhere near where the blade is pointing -- that gap is the
    // read, and it is the one thing worth drawing.
    row[21] = sword.swing.discriminant() as f32;
    row[22] = f32::from(sword.swing_left);
    row[23] = f32::from(sword.line.raw());
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

/// The inverse of [`kind_code`], for the one integer the client sends inward.
///
/// Total, like everything else on this boundary: an unrecognised code is a
/// Skitterer rather than a panic, because the alternative is a typo in the page
/// poisoning the module for the rest of the session.
const fn kind_from_code(code: u32) -> UnitKind {
    match code {
        0 => UnitKind::Warrior,
        1 => UnitKind::Scout,
        2 => UnitKind::Brute,
        _ => UnitKind::Skitterer,
    }
}

/// Which archetype a replacement character is: `0` a Warrior, `1` a Scout.
///
/// Separate from [`kind_from_code`] because the two hero builds are the only
/// sensible answers here and the default has to be one of them. Falling through
/// to a Skitterer would put a monster archetype on the player's side of the
/// room -- a hero the HUD describes with a monster's stat block, which is a much
/// more confusing failure than the typo that caused it.
const fn hero_from_code(code: u32) -> UnitKind {
    match code {
        1 => UnitKind::Scout,
        _ => UnitKind::Warrior,
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
pub extern "C" fn spawn_monster(kind_code: u32) -> u32 {
    let standing = with_sim(0, |sim| sim.spawn_monster(kind_from_code(kind_code)));
    publish();
    standing
}

/// Walks a replacement character into the room. Answers `1` if one arrived and
/// `0` if not -- there is no world, a character is still standing, or the frame
/// is already carrying [`MAX_UNITS`] bodies.
///
/// `kind_code` is `0` for a Warrior and `1` for a Scout; anything else is a
/// Warrior. Which is worth choosing rather than defaulting: a Scout thinks every
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
pub extern "C" fn swap_in_hero(kind_code: u32) -> u32 {
    let arrived = with_sim(0, |sim| sim.swap_in_hero(hero_from_code(kind_code)));
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
/// [`CONTROL_SWORD`], or'd together. `0` gives it all back.
///
/// This does not step outside the agent boundary. The host still answers with
/// an `Action` and the sim still cannot tell what produced it; what changes is
/// only *who is asked*. It does relax `DESIGN.md`'s "the player never issues a
/// per-tick command", and knowingly: an order is a command to a character, and
/// this is a character.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn set_control(mask: u32) {
    with_sim((), |sim| {
        sim.control = mask & (CONTROL_FEET | CONTROL_SWORD);
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
/// thousandths, and `shield` as a flag that points the aim at the shield hand
/// instead of the sword.
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
    shield: u32,
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
        sim.input_shield = shield != 0;
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

    /// What `cargo run --release -p lab -- hash` prints today. Recorded rather
    /// than computed, so this test fails if the sim's behaviour moves at all --
    /// which is the point of having it here as well as in `sim`.
    const LAB_HASH: u64 = 0x97d4_9e4d_685c_4dd0;

    /// What `init(1); set_goto(20_000, 12_000); step(600)` leaves behind.
    /// Recorded here natively; the same three calls against `web.wasm` under
    /// Node produce the same number, which is the first time this project's
    /// central claim has been checked across targets rather than asserted.
    const ROOM_HASH: u64 = 0xefb0_5af0_4d1c_e5f3;

    /// What `init(1); spawn_monster(3); step(600)` leaves behind -- a whole
    /// skirmish, start to finish, driven the way the page drives it. Recorded
    /// from a native run, never computed here, and asserted against `web.wasm`
    /// under Node by `tools/wasm_check.js`.
    const BATTLE_HASH: u64 = 0xee9c_dc86_4897_b793;

    /// What `init(1); spawn_monster(2) x3; step(1800); swap_in_hero(1);
    /// step(400)` leaves behind -- a fight, a death, a replacement, and the
    /// fight it walks into. Recorded from a native run and asserted against
    /// `web.wasm` under Node by `tools/wasm_check.js`.
    const SWAP_HASH: u64 = 0x35dc_a341_a6c2_6bb8;

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

    #[test]
    fn the_selftest_hash_is_the_number_the_lab_prints_natively() {
        assert_eq!(
            selftest_hash(),
            LAB_HASH,
            "the selftest no longer runs what `lab hash` runs"
        );
        assert_eq!(selftest(), LAB_HASH, "the halves reassemble wrongly");
        assert_eq!(selftest_hash_lo(), 0x685c_4dd0);
        assert_eq!(selftest_hash_hi(), 0x97d4_9e4d);
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
            step(10);
            assert_eq!(
                spawn_monster(3),
                0,
                "spawned into a world that is not there"
            );
            assert_eq!(
                swap_in_hero(0),
                0,
                "swapped a character into a world that is not there"
            );
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
        // The identity columns. The room's hero is the first entity ever
        // spawned into a fresh world, so it holds slot 0 at generation 0.
        assert_eq!(unit[9], 0.0, "entity_index");
        assert_eq!(unit[10], 0.0, "entity_generation");

        // The hands. Bearings are binary angles like `facing_raw`; extensions
        // and flashes are fractions.
        for slot in [11usize, 14] {
            assert!(
                (0.0..=65535.0).contains(&unit[slot]),
                "column {slot} is {} which is not a binary angle",
                unit[slot]
            );
        }
        for slot in [12usize, 15, 18, 19, 20] {
            assert!(
                (0.0..=1.0).contains(&unit[slot]),
                "column {slot} is {}, outside 0..=1",
                unit[slot]
            );
        }
        assert!((unit[16] - 0.95).abs() < 0.001, "weapon_length {}", unit[16]);
        assert_eq!(unit[17], 11264.0, "shield_arc_raw: a Warrior's +/- 61.9 deg");
        // Alone in a room, the hero has nothing to swing at and nothing has hit
        // it, so both the blade and every marker are at rest.
        assert_eq!(unit[13], 0.0, "sword_spin");
        assert_eq!((unit[18], unit[19], unit[20]), (0.0, 0.0, 0.0), "flashes");
    }

    #[test]
    fn a_fight_lights_the_flash_columns() {
        // The columns exist because the client used to infer a hit from health
        // falling between frames, which needs an epsilon to tell a blow from
        // regeneration and cannot see a blocked blow at all.
        // Three monsters and twice the running time, because attacks are
        // discrete now: a Warrior throws a cut roughly every fifty ticks rather
        // than landing one every nine, so a single duel can be over before a
        // blocked blow happens at all.
        init(1);
        spawn_monster(2);
        spawn_monster(2);
        spawn_monster(3);
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
        assert!(seen[1], "nothing was ever blocked");
    }

    #[test]
    fn a_faction_can_be_handed_a_different_mind_mid_fight() {
        init(1);
        assert_eq!(policy_kind(0), PolicyKind::Utility.code());
        assert_eq!(policy_kind(1), PolicyKind::Utility.code());

        assert_eq!(set_policy(0, PolicyKind::Duelist.code()), 1);
        assert_eq!(policy_kind(0), PolicyKind::Duelist.code());
        assert_eq!(policy_kind(1), PolicyKind::Utility.code(), "both sides moved");

        // An unknown code changes nothing rather than trapping.
        assert_eq!(set_policy(0, 999), 0);
        assert_eq!(policy_kind(0), PolicyKind::Duelist.code());
    }

    #[test]
    fn the_behaviour_panel_can_read_and_move_every_knob() {
        init(1);
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
            init(3);
            set_policy(0, kind.code());
            spawn_monster(2);
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
        init(1);
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
        init(1);
        set_control(CONTROL_SWORD);
        // Guard due north, attacking nothing.
        set_input(0, 0, 16_384, 0, 0, 0);
        step(120);

        let unit = &frame()[HEADER_LEN..];
        let bearing = unit[11];
        assert!(
            (bearing - 16_384.0).abs() < 2_000.0,
            "sword ended up at {bearing}, not north"
        );
        assert_eq!(unit[21], 0.0, "chambered blade was not in guard");

        // The button throws a cut, and the page can see it coming: the phase
        // goes to windup before it goes to strike, and the two are distinct in
        // the frame. This is the whole of what the columns were added for.
        set_input(0, 0, 16_384, 0, 0, 1);
        let mut saw_windup = false;
        let mut saw_strike = false;
        for _ in 0..90 {
            step(1);
            match frame()[HEADER_LEN + 21] as i32 {
                1 => saw_windup = true,
                2 => {
                    saw_strike = true;
                    assert!(saw_windup, "the cut went live without announcing itself");
                }
                _ => {}
            }
        }
        assert!(saw_windup && saw_strike, "the button threw no attack");

        // The modifier steers the other hand instead, and the sword goes back
        // to guarding because the pointer stopped asking it to attack.
        set_input(0, 0, 49_152, 1000, 1, 0);
        step(120);
        let unit = &frame()[HEADER_LEN..];
        assert!(
            (unit[14] - 49_152.0).abs() < 2_000.0,
            "shield ended up at {}, not south",
            unit[14]
        );
    }

    #[test]
    fn the_two_control_bits_are_independent() {
        // Feet under the player, sword under the policy, and the other way
        // round. This is the whole shape of the feature: they are different
        // skills and either can be handed over alone.
        init(1);
        spawn_monster(2);
        set_control(CONTROL_FEET);
        set_input(1000, 0, 0, 0, 0, 0);
        step(120);
        let sword_under_ai = frame()[HEADER_LEN + 12];

        init(1);
        spawn_monster(2);
        set_control(CONTROL_SWORD);
        set_input(1000, 0, 0, 0, 0, 0);
        step(120);
        let feet_under_ai = frame();

        assert!(
            sword_under_ai > 0.0,
            "the policy stopped driving the sword when only the feet were taken"
        );
        assert!(feet_under_ai.len() >= HEADER_LEN + UNIT_STRIDE);
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

    // ------------------------------------------------------------- spawning

    const BRUTE: u32 = 2;
    const SKITTERER: u32 = 3;

    #[test]
    fn a_monster_walks_in_and_takes_the_next_row_of_the_frame() {
        init(1);
        assert_eq!(frame()[6], 1.0, "the room did not open with one hero");

        assert_eq!(spawn_monster(SKITTERER), 1, "nothing arrived");
        let live = frame();
        assert_eq!(live[6], 2.0, "unit_count");
        assert_eq!(live.len(), HEADER_LEN + 2 * UNIT_STRIDE);
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

        assert_eq!(spawn_monster(BRUTE), 2, "the second one did not arrive");
        assert_eq!(frame()[6], 3.0);
        assert_eq!(monsters()[1][7], 2.0, "kind: Brute");
    }

    #[test]
    fn an_unrecognised_kind_code_is_a_skitterer_rather_than_a_trap() {
        init(1);
        assert_eq!(spawn_monster(9_999), 1);
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
                init(seed);
                set_goto(cx, cy);
                step(200 + i as u32 * 7);
                let hero = hero_row().expect("the hero is gone");

                for kind in [BRUTE, SKITTERER] {
                    assert!(spawn_monster(kind) > 0);
                    let monster = monsters().last().expect("nothing arrived").clone();
                    let d = distance(&monster, &hero);
                    let radius = monster[3];

                    assert!(
                        d >= 6.0 - 0.001,
                        "seed {seed} corner {i}: landed {d} from the hero, on top of it",
                    );
                    // The upper bound is the ring plus one, not the ring: the
                    // clamp pins a body to *its own* reachable box, and a Brute's
                    // box is 0.25 tighter than a Warrior's on every side, so a
                    // hero standing against a wall can be pushed marginally
                    // further from a newcomer than the roll asked for.
                    assert!(
                        d <= 10.0,
                        "seed {seed} corner {i}: landed {d} away, out of the band",
                    );
                    assert!(
                        monster[0] >= radius - 0.001
                            && monster[0] <= 24.0 - radius + 0.001
                            && monster[1] >= radius - 0.001
                            && monster[1] <= 16.0 - radius + 0.001,
                        "seed {seed} corner {i}: landed inside a wall at \
                         ({}, {}) with radius {radius}",
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
        init(1);
        spawn_monster(SKITTERER);
        spawn_monster(SKITTERER);
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
            init(3);
            step(37);
            spawn_monster(SKITTERER);
            step(120);
            spawn_monster(BRUTE);
            step(300);
            (tick(), hash(), frame())
        }
        assert_eq!(script(), script(), "the same run diverged from itself");

        // And *when* the button was pressed is part of the run, not incidental.
        init(3);
        step(38);
        spawn_monster(SKITTERER);
        step(119);
        spawn_monster(BRUTE);
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

        spawn_monster(SKITTERER);
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
        init(1);
        spawn_monster(SKITTERER);
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
        let hero = hero_row().expect("the warrior lost to one skitterer");
        println!(
            "skitterer entered at ({}, {}), hero finished on {} hp at tick {}",
            start[0],
            start[1],
            hero[4],
            tick()
        );
        assert!(monsters().is_empty(), "the skitterer never died");
        // Note what is deliberately *not* asserted: that the hero got hurt. A
        // Warrior reaches 1.40 from its centre and a Skitterer 0.70, and under
        // geometric combat that gap is a real advantage rather than a rounding
        // one -- the Warrior now routinely wins this untouched. Requiring a
        // scratch would be pinning a balance accident from the old damage
        // model, which could not miss.
    }

    #[test]
    fn enough_monsters_kill_the_hero_and_the_frame_still_has_something_to_draw() {
        // The page has to say something when the character falls, so the state
        // it says it about needs to be reachable. Six brutes is not subtle, and
        // it should not be: the assertion is that death is representable, not
        // that any particular fight is balanced.
        init(1);
        for _ in 0..6 {
            spawn_monster(BRUTE);
        }
        for _ in 0..200 {
            step(60);
            if hero_row().is_none() {
                break;
            }
        }

        println!("the hero fell at tick {}", tick());
        assert!(
            hero_row().is_none(),
            "six brutes could not kill one warrior"
        );
        assert!(frame()[6] > 0.0, "nothing left to draw");
        // Every remaining row is a monster, and the frame is still well formed.
        assert_eq!(frame().len(), HEADER_LEN + monsters().len() * UNIT_STRIDE);
    }

    #[test]
    fn the_room_stops_taking_monsters_when_the_frame_is_full() {
        init(1);
        let mut refused = 0;
        for _ in 0..100 {
            if spawn_monster(SKITTERER) == 0 {
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
        init(1);
        spawn_monster(SKITTERER);
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

        spawn_monster(SKITTERER);
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
        spawn_monster(SKITTERER);
        step(600);
        println!("battle hash: 0x{:016x}", hash());
        assert_eq!(hash(), BATTLE_HASH, "the battle script no longer replays");
    }

    // ------------------------------------------------------------ swapping in

    const WARRIOR: u32 = 0;
    const SCOUT: u32 = 1;

    /// Six brutes and however long it takes. Answers the tick the character
    /// fell on, which is the state every test below starts from.
    fn fall_to_brutes() -> u32 {
        for _ in 0..6 {
            spawn_monster(BRUTE);
        }
        for _ in 0..300 {
            step(30);
            if hero_row().is_none() {
                return tick();
            }
        }
        panic!("six brutes could not kill one warrior");
    }

    #[test]
    fn a_replacement_walks_into_the_room_the_last_one_died_in() {
        init(1);
        let fallen = hero_row().expect("the room did not open with a hero");
        let at = fall_to_brutes();
        let standing = monsters().len();
        assert!(standing > 0, "nothing survived to be swapped in against");

        assert_eq!(swap_in_hero(WARRIOR), 1, "nobody arrived");
        let hero = hero_row().expect("the frame has no hero in it");
        assert_eq!(hero[6], 0.0, "faction: Heroes");
        assert_eq!(hero[7], 0.0, "kind: Warrior");
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
        init(1);
        assert_eq!(swap_in_hero(SCOUT), 0, "two characters, one order channel");
        assert_eq!(frame()[6], 1.0, "unit_count");
        assert_eq!(hero_row().expect("the hero is gone")[7], 0.0, "kind");

        // Still refused with the room full of enemies, which is exactly when a
        // player would press it hardest.
        spawn_monster(BRUTE);
        step(120);
        assert_eq!(swap_in_hero(WARRIOR), 0);
        assert_eq!(frame()[6], 2.0, "unit_count");
    }

    #[test]
    fn a_replacement_can_be_a_different_build_entirely() {
        // The reason this takes an archetype rather than just bringing the
        // warrior back. Same room, same monsters, same policy -- and a
        // character that thinks faster, sees further and dies sooner.
        init(1);
        fall_to_brutes();
        assert_eq!(swap_in_hero(SCOUT), 1, "nobody arrived");

        let hero = hero_row().expect("the frame has no hero in it");
        assert_eq!(hero[7], 1.0, "kind: Scout");
        assert_eq!(hero[5], 52.0, "max_hp: 20 + 8 * vitality 4");
        assert!((hero[3] - 0.35).abs() < 0.001, "radius {}", hero[3]);
    }

    #[test]
    fn an_unrecognised_hero_code_is_a_warrior_rather_than_a_monster() {
        // `kind_from_code` would answer Skitterer here, which would put a
        // monster archetype on the player's side of the room. Falling through
        // to a hero build instead is the whole reason the two decoders are
        // separate functions.
        init(1);
        fall_to_brutes();
        assert_eq!(swap_in_hero(9_999), 1);
        assert_eq!(hero_row().expect("nobody arrived")[7], 0.0, "kind: Warrior");
        assert_eq!(monsters().iter().filter(|m| m[6] == 0.0).count(), 0);
    }

    #[test]
    fn a_replacement_arrives_under_no_order_at_all() {
        // An order belongs to the faction, so it outlives the body it was given
        // to. Inheriting it would have the newcomer set off for wherever the
        // last one was headed when it was killed -- which is where the things
        // that killed it are standing.
        init(1);
        set_goto(23_000, 15_000);
        step(60);
        fall_to_brutes();
        assert_eq!(
            frame()[2],
            4.0,
            "the dead character's order should outlive it"
        );

        assert_eq!(swap_in_hero(WARRIOR), 1);
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
            init(seed);
            fall_to_brutes();
            assert_eq!(swap_in_hero(WARRIOR), 1, "seed {seed}: nobody arrived");

            let hero = hero_row().expect("the frame has no hero in it");
            let radius = hero[3];
            assert!(
                hero[0] >= radius - 0.001
                    && hero[0] <= 24.0 - radius + 0.001
                    && hero[1] >= radius - 0.001
                    && hero[1] <= 16.0 - radius + 0.001,
                "seed {seed}: arrived inside a wall at ({}, {})",
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
                spawn_monster(BRUTE);
            }
            step(1_800);
            assert!(
                hero_row().is_none(),
                "three brutes no longer finish the warrior inside 1800 ticks"
            );
            assert_eq!(swap_in_hero(SCOUT), 1, "nobody arrived");
            step(400);
            hash()
        }
        let measured = script();
        println!("swap hash: 0x{measured:016x}");
        assert_eq!(measured, SWAP_HASH, "the swap script no longer replays");
        assert_eq!(script(), measured, "the same run diverged from itself");
    }

    #[test]
    fn a_swap_consumes_a_placement_roll() {
        // Only one can be answered at a time, so the counter's effect here is
        // invisible from the outside -- except that a swap has to *consume* a
        // roll, or a monster spawned on the same tick afterwards would be
        // placed exactly where one spawned before the swap would have been.
        init(1);
        fall_to_brutes();
        swap_in_hero(WARRIOR);
        let after_swap = monsters().len();
        spawn_monster(SKITTERER);
        let with = monsters()[after_swap].clone();

        init(1);
        fall_to_brutes();
        spawn_monster(SKITTERER);
        let without = monsters()[after_swap].clone();

        assert!(
            distance(&with, &without) > 0.001,
            "the swap did not consume a roll: both landed at ({}, {})",
            with[0],
            with[1],
        );
    }
}
