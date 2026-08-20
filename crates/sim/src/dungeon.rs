//! The floor plan: which ground a body may stand on.
//!
//! Until this module existed the level was a single `Vec2` and the whole of its
//! geometry was one `clamp_box`. That is a rectangle, and a rectangle has
//! exactly one interesting property -- you cannot leave it. A dungeon needs the
//! other one: there are places inside it you cannot get to without walking
//! round something.
//!
//! # Why a grid
//!
//! Because every question the sim asks of a level is cheap on a grid and
//! expensive on anything else. "Is this body overlapping masonry" is nine byte
//! reads at any body radius in the roster; "how far to the wall in +x" is a walk
//! along a row; "which way to the stairs" is a breadth-first search over
//! integers. A polygon soup answers the first question in time proportional to
//! the level and cannot answer the third at all without a navmesh, which is a
//! second representation to keep in step with the first.
//!
//! # Why one world unit per tile
//!
//! It is the smallest tile that a corridor can be built from without the
//! corridor width becoming a fraction, and it makes [`Dungeon::tile_of`] a
//! `floor` rather than a divide. See the corridor-width table in
//! [`generate`](crate::dungeon) -- the roster's widest body is a Brute at 0.70,
//! so the tile size has to divide 3.0 evenly for a three-wide corridor to be
//! exactly three tiles.
//!
//! # Why bytes and not bits
//!
//! A bitset saves 2.7 KB on a 68x45 level and costs a shift and a mask in the
//! innermost read of the collision pass. It also forecloses on tile *kinds*,
//! which is a thing this will want -- solidity is a predicate on the byte here
//! rather than the byte itself, precisely so that adding "water" or "rubble"
//! later is a new predicate and not a new representation.

use fx::{mul_div, Fx, Hash64, Rng, Vec2, ONE_RAW};

/// An open tile. Anything else is solid; see [`Dungeon::solid`].
pub const OPEN: u8 = 0;
/// Plain masonry.
pub const WALL: u8 = 1;

/// A doorway, shut.
///
/// **Solid, and it needs no code to become solid**: [`Dungeon::solid`] answers
/// `tile != OPEN`, so a shut door is already masonry to the collision resolver,
/// to [`Dungeon::raycast`], to [`Dungeon::sees`] and to
/// [`Dungeon::visible_tiles`]. That is the whole reason this is a tile value and
/// not a table of rectangles beside the grid, and it is what makes this session
/// affordable.
///
/// It differs from [`WALL`] in exactly two places: routing may plan through it
/// for a body that can open one ([`Dungeon::passable_for_routing`]), and it can
/// be turned into [`OPEN`] ([`Dungeon::open_door`]). Everything else in this
/// file treats the two identically and must keep doing so.
pub const DOOR: u8 = 2;

// ------------------------------------------------------------------ elevation

/// One height step, in raw 16.16 world units: an eighth of a world unit.
///
/// **A world unit is a metre.** That is a measurement off the shipped roster
/// rather than a convention adopted here -- `fighter_anatomy` stands 9/5 of a
/// unit with its shoulders at 7/5 and a hand 1/10 across, `brute_anatomy`
/// stands 2, and a corridor is three tiles. Every number below is read off that
/// scale, which is why they are anthropometric rather than round.
///
/// **The session plan said a body was about one world unit tall; it is 1.8**,
/// and the correction is recorded rather than quietly applied because it moves
/// both constants: at a body of 1.0 a knee-high step would be a quarter of a
/// unit and everything here would be half what it is.
///
/// Bounded above by the stair. The shallowest thing anybody builds out of
/// height steps is a staircase, and a riser a 1.8-unit body climbs without
/// thinking about it is about 0.18. A quantum coarser than one riser cannot
/// express a stair at all, and terrain that goes straight from flat to
/// unclimbable is a wall generator with extra steps.
///
/// Bounded below by the hand. A rise under 0.1 -- the shipped hand radius, and
/// about the shortest length this game draws -- is invisible on screen while
/// still being able to turn a route around, which is the worst failure this
/// system has available: a body refusing to walk somewhere for a reason the
/// player cannot see.
///
/// `one_height_step_is_between_a_hand_and_a_stair_riser` holds both ends.
pub const TERRAIN_HEIGHT_RAW_UNIT: i32 = ONE_RAW / 8;

/// The rise a walking body may enter: three height steps, 3/8 of a world unit.
///
/// Bounded below by the staircase. A stair on this grid has a tread of a whole
/// tile and a riser of one or two [`TERRAIN_HEIGHT_RAW_UNIT`], so a step-up
/// under two units would make an ordinary flight of stairs a cliff -- and
/// stairs are the first thing anybody builds with a height field. It would also
/// leave the height unit doing no work: with a step-up of one unit every rise
/// the grid can express is either level or impassable, and there is no such
/// thing as gentle ground.
///
/// Bounded above by the knee. A body 1.8 units tall carries its knee a shade
/// over half a unit up, and the knee is exactly the height a person steps onto
/// without putting a hand down. Half a unit or more is a climb, and a ledge a
/// walking body strolls up is the one thing this session must not produce.
///
/// **A whole number of height steps, and that is not tidiness.** Every rise the
/// grid can express is a multiple of the unit, so a threshold falling between
/// two of them names a boundary that does not exist: 0.45 and 0.375 admit and
/// refuse exactly the same set of rises, and only one of them says so.
///
/// `the_step_up_admits_a_stair_and_refuses_a_knee_high_ledge` holds both ends
/// and the multiple.
pub const TERRAIN_STEP_UP_RAW: i32 = 3 * TERRAIN_HEIGHT_RAW_UNIT;

/// The four axis directions, in the order the legacy observation's
/// `wall_clearance` column had
/// always reported them.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Cardinal {
    NegX,
    PosX,
    NegY,
    PosY,
}

impl Cardinal {
    /// In percept order, so `Cardinal::ALL.map(...)` fills `wall_clearance`
    /// directly and the two orders cannot drift apart.
    pub const ALL: [Cardinal; 4] = [
        Cardinal::NegX,
        Cardinal::PosX,
        Cardinal::NegY,
        Cardinal::PosY,
    ];

    pub const fn step(self) -> (i32, i32) {
        match self {
            Cardinal::NegX => (-1, 0),
            Cardinal::PosX => (1, 0),
            Cardinal::NegY => (0, -1),
            Cardinal::PosY => (0, 1),
        }
    }
}

/// Which ground exists, and where.
///
/// There are exactly two constructors that can produce tiles
/// ([`Dungeon::from_tiles`] and [`Dungeon::from_tiles_and_heights`]) and
/// exactly one mutator ([`Dungeon::open_door`]), which is what lets
/// [`Dungeon::fingerprint`] be a cached field instead of a walk over the grid.
/// It said "exactly one constructor" until elevation landed; the count is the
/// incidental part and "every path in is one of a short list that digests
/// before it returns" is the property.
///
/// That claim used to read "no mutator at all". Doors made it false, and the
/// honest repair was to say what the property actually rests on rather than to
/// delete it: what the cached digest needs is not immutability but that no
/// caller can ever observe it disagreeing with the tiles. [`Dungeon::open_door`]
/// keeps that by re-digesting inside the same call, so there is still no window
/// to invalidate and still nothing to remember to invalidate it in.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct Dungeon {
    cols: u16,
    rows: u16,
    /// Row-major, `cols * rows` of them.
    tiles: Vec<u8>,
    /// Row-major beside `tiles`, one signed count of
    /// [`TERRAIN_HEIGHT_RAW_UNIT`] per tile.
    ///
    /// `i16` rather than `Fx`, and the choice is the whole exactness argument:
    /// a floor is a step function, so a height is a *count*, and two tiles are
    /// level exactly when their counts are equal. Stored as `Fx` the same
    /// question would be an equality between two numbers that arithmetic is
    /// allowed to have rounded. The range is +-32767 steps -- +-4096 world
    /// units, three orders past anything a level holds -- and, more to the
    /// point, `step * TERRAIN_HEIGHT_RAW_UNIT` stays inside an `i32`, so
    /// [`Dungeon::height_at`] cannot saturate for any value that fits the field.
    heights: Vec<i16>,
    digest: u64,
    /// Whether any tile is solid.
    ///
    /// Not a convenience. It is the short-circuit that makes every pre-existing
    /// scenario provably unchanged rather than argued to be: a `Dungeon::open`
    /// is not carved, the interior collision pass is skipped outright, and what
    /// remains is the arena clamp that was there before, instruction for
    /// instruction.
    carved: bool,
    /// Whether any tile is off the flat.
    ///
    /// [`Dungeon::carved`]'s twin, and it exists for exactly the reason
    /// `carved` gives above. Every shipped scenario is flat, so this is false,
    /// so the digest never reaches [`Dungeon::heights`] and every routing and
    /// sight predicate below runs the code it ran before elevation existed.
    ///
    /// Set from whether any height is non-zero and never from the caller's
    /// intent. That is what makes "a dungeon built with heights that are all
    /// zero is a flat dungeon" a fact about the constructor rather than a
    /// convention somebody has to keep -- and it is what stops a driver from
    /// moving a golden hash by asking for elevation and then not using any.
    sculpted: bool,
}

impl Dungeon {
    /// A level with no masonry in it: the flat rectangle every scenario had
    /// before floor plans existed.
    pub fn open(cols: u16, rows: u16) -> Dungeon {
        Dungeon::from_tiles(cols, rows, vec![OPEN; cols as usize * rows as usize])
    }

    /// The one constructor that can produce tiles.
    ///
    /// Total: a `tiles` of the wrong length is padded with masonry or truncated
    /// rather than refused. This crate is driven from a `cdylib` where a panic
    /// poisons the whole instance, so "impossible" arguments get an answer.
    pub fn from_tiles(cols: u16, rows: u16, mut tiles: Vec<u8>) -> Dungeon {
        let want = cols as usize * rows as usize;
        tiles.resize(want, WALL);

        Dungeon {
            cols,
            rows,
            carved: tiles.iter().any(|&t| t != OPEN),
            sculpted: false,
            digest: Dungeon::digest(cols, rows, &tiles, &[], false),
            heights: vec![0; want],
            tiles,
        }
    }

    /// The one constructor that can produce elevation, and the only way to set
    /// `sculpted`.
    ///
    /// Total in both vectors, for [`Dungeon::from_tiles`]' reason: this crate
    /// is driven from a `cdylib` where a panic poisons the whole instance. A
    /// short `heights` is padded with **zeros** rather than with the masonry
    /// `tiles` is padded with, because the two vectors answer different
    /// questions -- `tiles` says whether there is floor and a missing answer
    /// there must be the safe one, while `heights` only says how high, and the
    /// safe answer to a missing height is the floor everything else is on.
    ///
    /// `sculpted` comes from the heights and not from the caller. A dungeon
    /// asked for with heights that are all zero **is** flat: it digests as one
    /// and it routes as one, which is
    /// `a_sculpted_dungeon_of_all_zero_heights_digests_as_a_flat_one`.
    pub fn from_tiles_and_heights(
        cols: u16,
        rows: u16,
        mut tiles: Vec<u8>,
        mut heights: Vec<i16>,
    ) -> Dungeon {
        let want = cols as usize * rows as usize;
        tiles.resize(want, WALL);
        heights.resize(want, 0);
        let sculpted = heights.iter().any(|&step| step != 0);

        Dungeon {
            cols,
            rows,
            carved: tiles.iter().any(|&t| t != OPEN),
            sculpted,
            digest: Dungeon::digest(cols, rows, &tiles, &heights, sculpted),
            heights,
            tiles,
        }
    }

    /// The fingerprint, and the one place it is computed.
    ///
    /// Three callers -- both constructors and [`Dungeon::open_door`] -- where
    /// there used to be two copies of the same writes under a comment saying
    /// "a digest computed two ways is two digests". A third copy is the point
    /// at which that comment stops being enough on its own.
    ///
    /// **The guard is the whole hash argument of this session.** A flat dungeon
    /// writes the shape and the tiles and stops, byte for byte what it wrote
    /// before heights existed, so `ROOM_HASH`, `BATTLE_HASH`, `SWAP_HASH`,
    /// `BOW_HASH`, `LAB_HASH` and `GOLDEN_STATE_HASH` cannot be reached from
    /// here. If one of them moves, the guard is wrong and the session stops
    /// rather than re-records.
    ///
    /// `write_u16(step as u16)` rather than a `write_i16` that [`Hash64`] does
    /// not have: those are the same two's-complement bytes, written the way
    /// `Hash64::write_i32` already writes a signed value through `write_u32`,
    /// and growing `fx` for one caller is a wider change than the line it saves.
    fn digest(cols: u16, rows: u16, tiles: &[u8], heights: &[i16], sculpted: bool) -> u64 {
        let mut h = Hash64::new();
        h.write_u16(cols);
        h.write_u16(rows);
        h.write_bytes(tiles);
        if sculpted {
            for step in heights {
                h.write_u16(*step as u16);
            }
        }
        h.finish()
    }

    pub const fn cols(&self) -> u16 {
        self.cols
    }

    pub const fn rows(&self) -> u16 {
        self.rows
    }

    /// The playable extent, `(0,0)..extent`. The one source of truth for how
    /// big the level is; `Scenario::arena` is this and nothing else.
    pub fn extent(&self) -> Vec2 {
        Vec2::from_ints(self.cols as i32, self.rows as i32)
    }

    pub const fn carved(&self) -> bool {
        self.carved
    }

    /// Whether any tile is off the flat. See the field for why this is the
    /// short-circuit rather than a convenience.
    pub const fn sculpted(&self) -> bool {
        self.sculpted
    }

    /// Fingerprint of the whole grid. See [`Dungeon`] for why this is a field.
    pub const fn fingerprint(&self) -> u64 {
        self.digest
    }

    /// Whether a body may not stand in this tile.
    ///
    /// **Out of range is solid**, and that single decision is what removes the
    /// boundary as a special case from every caller in this file: the clearance
    /// walk terminates because it runs into the edge, the ray terminates for
    /// the same reason, and the collision resolver treats the outer wall as
    /// masonry like any other. The arena clamp still runs in `World::settle`,
    /// but it is a belt over braces rather than the only thing holding the
    /// level in.
    pub fn solid(&self, tx: i32, ty: i32) -> bool {
        if tx < 0 || ty < 0 || tx >= self.cols as i32 || ty >= self.rows as i32 {
            return true;
        }
        self.tiles[ty as usize * self.cols as usize + tx as usize] != OPEN
    }

    /// The byte at a tile.
    ///
    /// **Out of range is [`WALL`] and not [`OPEN`]**, which is the same
    /// convention [`Dungeon::solid`] states at length and for the same reason:
    /// the one caller that reads the byte rather than the predicate is
    /// [`Dungeon::passable_for_routing`], and answering `OPEN` off the edge of
    /// the grid would let a search walk out of the world.
    pub fn tile(&self, tx: i32, ty: i32) -> u8 {
        if tx < 0 || ty < 0 || tx >= self.cols as i32 || ty >= self.rows as i32 {
            return WALL;
        }
        self.tiles[ty as usize * self.cols as usize + tx as usize]
    }

    /// The canonical row-major grid used by scenario identity and persistence.
    pub(crate) fn tiles(&self) -> &[u8] {
        &self.tiles
    }

    /// Whether a route may be planned through this tile.
    ///
    /// The one predicate that does **not** agree with [`Dungeon::solid`], and
    /// the disagreement is the feature: a Fighter's route field runs through a
    /// shut door because it can open one, and a Skitterer's stops at it. Sight
    /// is not parameterised this way and must not be -- being able to open a
    /// door is not being able to see through it.
    pub fn passable_for_routing(&self, tx: i32, ty: i32, opens_doors: bool) -> bool {
        match self.tile(tx, ty) {
            OPEN => true,
            DOOR => opens_doors,
            _ => false,
        }
    }

    /// [`Dungeon::passable_for_routing`], asked about a **step** rather than
    /// about a tile.
    ///
    /// The tile form keeps its exact signature, because being able to work a
    /// door is a property of the tile and the door is what every caller of it
    /// is asking about. Whether a body may *get there* is a different question
    /// with a different arity, and this is where the two are combined;
    /// [`Dungeon::distances_for`] is its one caller.
    ///
    /// The door rule is asked first and the rise second, so a shut door on a
    /// plateau is refused for being shut. That ordering is not observable in
    /// the answer and is worth fixing anyway: it is the order the two rules
    /// would have to be read in to explain a refusal to anybody.
    pub fn passable_for_routing_between(
        &self,
        from: (i32, i32),
        to: (i32, i32),
        opens_doors: bool,
    ) -> bool {
        if !self.passable_for_routing(to.0, to.1, opens_doors) {
            return false;
        }
        if !self.sculpted {
            return true;
        }
        self.rise_is_enterable(from, to)
    }

    /// Whether a body standing on `from` may step onto `to`. On a flat dungeon
    /// this is exactly `!self.solid(to)`, which is why every existing caller is
    /// inert.
    ///
    /// **Directional, and that is the interesting part.** A rise greater than
    /// [`TERRAIN_STEP_UP_RAW`] is impassable uphill and passable downhill, which
    /// is what makes a ledge a one-way drop and a cliff a wall from below. One
    /// rule produces both, where a "ledge" tile kind beside a "cliff" tile kind
    /// would be two things somebody has to keep agreeing.
    ///
    /// A [`WALL`] stays impassable whatever the heights say. Masonry is not
    /// merely a very tall floor -- you cannot stand on top of it -- and a rule
    /// that let a body climb a wall by making it short enough would give the
    /// floor plan two ways of saying no and no way of telling them apart.
    ///
    /// `from` is not required to be adjacent to `to` and is not required to be
    /// open. Nothing in the rule needs either, every caller supplies a
    /// neighbour, and adding a check would put a branch in the collision
    /// resolver's inner loop to reject an input it cannot produce.
    pub fn passable_between(&self, from: (i32, i32), to: (i32, i32)) -> bool {
        if !self.sculpted {
            return !self.solid(to.0, to.1);
        }
        if self.solid(to.0, to.1) {
            return false;
        }
        self.rise_is_enterable(from, to)
    }

    /// Whether the rise from one tile to another is one a walking body may
    /// enter. Says nothing about what is *on* either tile; the two public
    /// predicates above each bring their own idea of what counts as floor.
    ///
    /// Integer arithmetic throughout and no `Fx` in sight. Both heights are
    /// counts, so their difference is a count, and the comparison is exact
    /// rather than exact-looking: a rise of one step and a rise the threshold
    /// names can never be within a rounding of each other.
    fn rise_is_enterable(&self, from: (i32, i32), to: (i32, i32)) -> bool {
        let rise = self.height_step(to.0, to.1) as i32 - self.height_step(from.0, from.1) as i32;
        // At most 65535 steps of 8192 raw, which is an eighth of `i32`.
        rise * TERRAIN_HEIGHT_RAW_UNIT <= TERRAIN_STEP_UP_RAW
    }

    /// The floor of a tile, as its signed count of [`TERRAIN_HEIGHT_RAW_UNIT`].
    ///
    /// **Off the grid is zero, and it never matters.** Out of range is solid to
    /// [`Dungeon::solid`], so every caller that could reach a tile out there has
    /// already refused it on that ground; answering zero keeps this total
    /// without adding a second out-of-range convention to remember beside the
    /// one [`Dungeon::tile`] states at length.
    fn height_step(&self, tx: i32, ty: i32) -> i16 {
        if tx < 0 || ty < 0 || tx >= self.cols as i32 || ty >= self.rows as i32 {
            return 0;
        }
        self.heights[ty as usize * self.cols as usize + tx as usize]
    }

    /// The floor of a tile, in world units. [`Dungeon::height_at`] by tile
    /// rather than by point, for the sight walk, which has the tile already.
    fn floor_of(&self, tx: i32, ty: i32) -> Fx {
        Fx::from_raw(self.height_step(tx, ty) as i32 * TERRAIN_HEIGHT_RAW_UNIT)
    }

    /// The floor height under `p`, in world units.
    ///
    /// **Each tile is one flat plateau: there is no interpolation across a tile
    /// and no slope within one.** That is the Doom sector model, and it is
    /// chosen over a smoothed heightfield for two reasons worth writing down.
    ///
    /// Interpolation is where a fixed-point terrain sampler grows a rounding
    /// argument nobody wants to have: every sample becomes a divide, every
    /// divide truncates, and "these two bodies are standing on the same floor"
    /// stops being decidable at all. Here it is an equality between two `i16`s.
    ///
    /// And a step function is what makes "the wall is a tall tile" true by
    /// construction rather than by threshold. Masonry and a cliff are the same
    /// object seen from below, so nothing has to keep the two definitions in
    /// step -- which is the failure mode a heightfield beside a tile grid has,
    /// and it shows up as a body walking through a wall that was drawn.
    ///
    /// Exact by the arithmetic rather than by luck: an `i16` count times
    /// [`TERRAIN_HEIGHT_RAW_UNIT`] is at most 268 million, an eighth of `i32`'s
    /// range, so the multiply cannot saturate and `Fx` carries the answer whole.
    pub fn height_at(&self, p: Vec2) -> Fx {
        if !self.sculpted {
            return Fx::ZERO;
        }
        let (tx, ty) = Dungeon::tile_of(p);
        self.floor_of(tx, ty)
    }

    /// The tile a point falls in. Floors, so a point exactly on a boundary
    /// belongs to the tile it is the low edge of.
    pub fn tile_of(p: Vec2) -> (i32, i32) {
        (p.x.floor_int(), p.y.floor_int())
    }

    /// The middle of a tile: where a placement lands and where a nav step aims.
    pub fn tile_centre(tx: i32, ty: i32) -> Vec2 {
        Vec2::new(
            Fx::from_int(tx) + Fx::HALF,
            Fx::from_int(ty) + Fx::HALF,
        )
    }

    /// How many tiles are open. Says what it means: a shut [`DOOR`] is not one.
    pub fn open_count(&self) -> usize {
        self.tiles.iter().filter(|&&t| t == OPEN).count()
    }

    /// How many tiles somebody who can work a door could stand on: [`OPEN`] and
    /// [`DOOR`] together.
    ///
    /// The count the generator's connectivity check wants, because that search
    /// walks *through* doors. Comparing a door-inclusive walk against
    /// [`Dungeon::open_count`] would report every room behind a door as
    /// stranded floor and repair a level that was never broken.
    pub fn floor_count(&self) -> usize {
        self.tiles.iter().filter(|&&t| t == OPEN || t == DOOR).count()
    }

    /// Turns a doorway into floor.
    ///
    /// [`Dungeon`]'s own docs said "no mutator at all, which is what lets
    /// [`Dungeon::fingerprint`] be a cached field instead of a walk over the
    /// grid: a digest that cannot go stale needs no invalidation." That is now
    /// one mutator, and the property is kept the same way rather than
    /// abandoned: this re-digests in the same call, so there is still no window
    /// in which the field is wrong.
    ///
    /// Writes in place rather than rebuilding through [`Dungeon::from_tiles`],
    /// which would allocate. `World`'s contact runtime reserves its scratch once
    /// against the allocated-slot high water for the same reason: allocation
    /// inside a tick is a thing this crate avoids.
    ///
    /// `carved` is deliberately **not** recomputed. A level that had a door in
    /// it has masonry by construction, so on anything the generator produces the
    /// answer would not move -- and on a hand-built fixture that is all floor
    /// but for one door it would move from `true` to `false`, turning off the
    /// short-circuit in [`Dungeon::sees`] and [`Dungeon::clearance`] halfway
    /// through a level. A flag that says "this level has geometry worth
    /// consulting" must not stop saying it because somebody opened a door.
    ///
    /// `sculpted` is not recomputed either, and there is nothing to recompute:
    /// this writes tiles and never heights, so the flag it would recompute is
    /// the flag it already holds. It is passed to the digest for that reason
    /// rather than re-derived.
    ///
    /// Total: a cell off the grid, or one that is not a door, is ignored.
    pub fn open_door(&mut self, cells: &[u32]) {
        for &cell in cells {
            if let Some(slot) = self.tiles.get_mut(cell as usize) {
                if *slot == DOOR {
                    *slot = OPEN;
                }
            }
        }
        // Exactly `from_tiles`' digest, in the same order, because a digest
        // computed two ways is two digests -- which is now held by calling the
        // same function rather than by writing the same lines twice.
        self.digest = Dungeon::digest(self.cols, self.rows, &self.tiles, &self.heights, self.sculpted);
    }

    /// The shut doorways in this grid, grouped into the runs that open together.
    ///
    /// **Derived, not carried**, and it is the one grouping rule there is:
    /// [`Dungeon::generate`] fills [`Level::doors`] with this and `World::new`
    /// asks its own floor plan the same question, so the two cannot come apart
    /// the way a list threaded through three types could.
    ///
    /// Only meaningful while the doors are shut, which is the only moment it is
    /// asked: an *open* door is [`OPEN`] and indistinguishable from floor, which
    /// is precisely why anything that wants to keep drawing a doorway has to
    /// hold on to the answer rather than re-ask for it.
    ///
    /// A run is straight -- east as far as it can go, otherwise south, longest
    /// wins and a tie goes east. That is the shape [`Dungeon::generate`] places,
    /// a corridor's worth of one side of a room's ring, and the cap at
    /// `CORRIDOR` is what lets [`Door`] be a fixed array.
    pub fn doorways(&self) -> Vec<Door> {
        let (cols, rows) = (self.cols as i32, self.rows as i32);
        let mut claimed = vec![false; self.tiles.len()];
        let mut out = Vec::new();
        for ty in 0..rows {
            for tx in 0..cols {
                let cell = (ty * cols + tx) as usize;
                if self.tiles[cell] != DOOR || claimed[cell] {
                    continue;
                }
                let run = |dx: i32, dy: i32| {
                    let mut n = 0;
                    while n < CORRIDOR {
                        match self.cell(tx + dx * n, ty + dy * n) {
                            Some(c) if self.tiles[c as usize] == DOOR && !claimed[c as usize] => {
                                n += 1
                            }
                            _ => break,
                        }
                    }
                    n
                };
                let (east, south) = (run(1, 0), run(0, 1));
                let (dx, dy, len) = if south > east {
                    (0, 1, south)
                } else {
                    (1, 0, east)
                };
                let mut door = Door {
                    cells: [0; CORRIDOR as usize],
                    len: len as u8,
                };
                for n in 0..len {
                    let c = (ty + dy * n) * cols + (tx + dx * n);
                    door.cells[n as usize] = c as u32;
                    claimed[c as usize] = true;
                }
                out.push(door);
            }
        }
        out
    }

    /// The flat index of a tile, or `None` if it is off the grid.
    pub fn cell(&self, tx: i32, ty: i32) -> Option<u32> {
        if tx < 0 || ty < 0 || tx >= self.cols as i32 || ty >= self.rows as i32 {
            return None;
        }
        Some(ty as u32 * self.cols as u32 + tx as u32)
    }

    pub fn cell_of(&self, p: Vec2) -> Option<u32> {
        let (tx, ty) = Dungeon::tile_of(p);
        self.cell(tx, ty)
    }

    pub fn tile_at(&self, cell: u32) -> (i32, i32) {
        let cols = self.cols.max(1) as u32;
        ((cell % cols) as i32, (cell / cols) as i32)
    }

    /// Where a search toward `p` should actually be grown from: `p`'s own tile
    /// if it is open, otherwise the nearest open one.
    ///
    /// The fallback is what makes a click on a wall useful instead of merely
    /// refused -- the character walks as close as the floor plan allows, which
    /// is what the click meant. `None` only if the level has no open tile at
    /// all.
    pub fn goal_cell(&self, p: Vec2) -> Option<u32> {
        let (tx, ty) = Dungeon::tile_of(p);
        if let Some(cell) = self.cell(tx, ty) {
            if !self.solid(tx, ty) {
                return Some(cell);
            }
        }
        // Ties on the lowest index, so two callers asking about the same point
        // get the same answer.
        let mut best: Option<(Fx, u32)> = None;
        for ty in 0..self.rows as i32 {
            for tx in 0..self.cols as i32 {
                if self.solid(tx, ty) {
                    continue;
                }
                let d = (Dungeon::tile_centre(tx, ty) - p).length();
                match best {
                    Some((seen, _)) if seen <= d => {}
                    _ => best = Some((d, ty as u32 * self.cols as u32 + tx as u32)),
                }
            }
        }
        best.map(|(_, cell)| cell)
    }

    /// Whether a body of this radius standing here overlaps no masonry.
    ///
    /// The tile span is `floor(p - r) ..= floor(p + r)` on each axis. At the
    /// roster's widest radius (a Brute's 0.70) that span is 1.40 world units,
    /// so it is at most three columns by three rows -- nine reads, whatever the
    /// body.
    ///
    /// On a sculpted dungeon the reads are the same nine and the predicate is
    /// [`Dungeon::passable_between`] instead of [`Dungeon::solid`]: a cliff is
    /// masonry to the body standing under it, and it is *not* masonry to the
    /// same body standing on top of it, so the question has to carry where the
    /// body is. The flat arm below is what it was, taken by a branch on
    /// `sculpted` rather than arrived at by arguing that the two agree.
    pub fn is_clear(&self, p: Vec2, radius: Fx) -> bool {
        let lo_x = (p.x - radius).floor_int();
        let hi_x = (p.x + radius).floor_int();
        let lo_y = (p.y - radius).floor_int();
        let hi_y = (p.y + radius).floor_int();
        if !self.sculpted {
            for ty in lo_y..=hi_y {
                for tx in lo_x..=hi_x {
                    if self.solid(tx, ty) && overlaps(p, radius, tx, ty) {
                        return false;
                    }
                }
            }
            return true;
        }
        // The body's own tile is in this span and is trivially enterable from
        // itself -- a rise of zero -- so the plateau a body is standing on
        // never reports the body as buried in it.
        let here = Dungeon::tile_of(p);
        for ty in lo_y..=hi_y {
            for tx in lo_x..=hi_x {
                if !self.passable_between(here, (tx, ty)) && overlaps(p, radius, tx, ty) {
                    return false;
                }
            }
        }
        true
    }

    /// Multi-source breadth-first search over open tiles, for a body that
    /// cannot work a door.
    ///
    /// [`Dungeon::distances_for`] with `opens_doors` false, which is
    /// bit-for-bit the search this was before doors existed: a shut [`DOOR`] is
    /// solid, and `passable_for_routing(.., false)` is exactly `!solid`.
    pub fn distances(&self, seeds: &[u32], dist: &mut Vec<u16>, queue: &mut Vec<u32>) {
        self.distances_for(seeds, false, dist, queue)
    }

    /// Multi-source breadth-first search over the tiles this body may route
    /// through, writing tile distances into `dist` and using `queue` as its
    /// frontier.
    ///
    /// Both buffers belong to the caller. That is not tidiness: this crate is
    /// compiled to wasm and driven from a page holding typed-array views into
    /// linear memory, an allocation can grow that memory, and growing it
    /// *detaches every view the page holds*. A search that allocates is a search
    /// that can blank the screen. A `Vec` with a read head rather than a
    /// `VecDeque` for the same reason.
    ///
    /// Deterministic by construction: the caller supplies seeds in a canonical
    /// order, neighbours are visited in [`Cardinal::ALL`] order, and the first
    /// visit claims a cell. Two dungeons with the same tiles and the same seeds
    /// get the same field however they were arrived at.
    ///
    /// **Four neighbours, not eight.** Eight at unit cost is simply wrong -- a
    /// diagonal is 1.414 -- and correcting it needs a weighted queue, which is a
    /// different algorithm for a gain the straight-line shortcut in the route
    /// reader already delivered wherever it mattered. **That reader is gone** --
    /// `World::nav_step` went with the flow field, and with it the last caller
    /// outside this module's own tests. The search is kept because the floor
    /// plan is what owns the question and because restoring an order channel
    /// restores its first consumer; see
    /// `docs/design/navigation-visibility.md`.
    pub fn distances_for(
        &self,
        seeds: &[u32],
        opens_doors: bool,
        dist: &mut Vec<u16>,
        queue: &mut Vec<u32>,
    ) {
        let (cols, rows) = (self.cols as i32, self.rows as i32);
        dist.clear();
        queue.clear();
        if seeds.is_empty() {
            // No goal, no field. An empty `dist` is what every reader takes as
            // "there is nowhere to go", and it costs nothing to carry.
            return;
        }
        dist.resize(cols as usize * rows as usize, u16::MAX);
        for &cell in seeds {
            if let Some(slot) = dist.get_mut(cell as usize) {
                if *slot == u16::MAX {
                    *slot = 0;
                    queue.push(cell);
                }
            }
        }

        let mut head = 0;
        if !self.sculpted {
            while head < queue.len() {
                let cell = queue[head] as i32;
                head += 1;
                let step = dist[cell as usize].saturating_add(1);
                let (tx, ty) = (cell % cols, cell / cols);
                for dir in Cardinal::ALL {
                    let (dx, dy) = dir.step();
                    let (nx, ny) = (tx + dx, ty + dy);
                    if !self.passable_for_routing(nx, ny, opens_doors) {
                        continue;
                    }
                    let next = (ny * cols + nx) as usize;
                    if dist[next] != u16::MAX {
                        continue;
                    }
                    dist[next] = step;
                    queue.push(next as u32);
                }
            }
            return;
        }

        // The same search with a directional edge test, written out rather than
        // folded into the walk above so that a flat level -- which is every
        // shipped one, and the only kind `ROOM_HASH` has ever routed over --
        // runs the loop it ran before elevation existed.
        //
        // **The field this produces is one-way and the reader must not assume
        // otherwise.** A drop off a ledge is an edge in one direction only, so
        // "distance from the goal" is not "distance to the goal" any more, and
        // the seeds have to be the thing you want to reach. Every caller
        // already seeds from the goal, which is why this lands as a change of
        // rule and not a change of shape.
        while head < queue.len() {
            let cell = queue[head] as i32;
            head += 1;
            let step = dist[cell as usize].saturating_add(1);
            let (tx, ty) = (cell % cols, cell / cols);
            for dir in Cardinal::ALL {
                let (dx, dy) = dir.step();
                let (nx, ny) = (tx + dx, ty + dy);
                if !self.passable_for_routing_between((tx, ty), (nx, ny), opens_doors) {
                    continue;
                }
                let next = (ny * cols + nx) as usize;
                if dist[next] != u16::MAX {
                    continue;
                }
                dist[next] = step;
                queue.push(next as u32);
            }
        }
    }

    /// Pushes a circle out of one solid tile. Returns the corrected centre and
    /// the unit direction it moved, or `None` if that tile is not in the way.
    ///
    /// **The one implementation of "a body may not be inside masonry".** The
    /// collision resolver calls it, and so does [`Dungeon::nearest_clear`], so
    /// that "where a body can stand" and "where a body gets pushed to" cannot
    /// come apart -- which they did while the policy layer kept its own copy of
    /// the rule as a clamp box.
    ///
    /// # Why closest-point-on-the-box
    ///
    /// The two obvious alternatives are worse in ways that show. *Minimum
    /// penetration axis* has to pick x or y, and picking has to break ties --
    /// which makes behaviour at a corner depend on an axis order, and a rule
    /// with an axis order in it behaves differently in a mirrored match.
    /// *Per-axis sweep* gives a cardinal push at an exposed convex corner where
    /// the honest answer is diagonal. Closest-point has neither problem, and on
    /// a flat face it degenerates to exactly the cardinal push the arena clamp
    /// makes -- which is what lets a body slide *along* a wall.
    ///
    /// # What elevation changes, and what it does not
    ///
    /// Two `solid` tests become [`Dungeon::passable_between`] asked from the
    /// body's own tile, and the geometry between them is untouched -- a cliff
    /// presents the same box face masonry does, so there is nothing new to
    /// intersect. The internal-edge cull has to move with them or a body
    /// sliding along a run of cliff is shoved out of every seam it passes,
    /// which is the identical stutter the cull was written for and would be
    /// twice as confusing for having a documented fix ten lines above it.
    pub fn push_out(&self, p: Vec2, radius: Fx, tx: i32, ty: i32) -> Option<(Vec2, Vec2)> {
        if !self.sculpted {
            if !self.solid(tx, ty) {
                return None;
            }
        } else if self.passable_between(Dungeon::tile_of(p), (tx, ty)) {
            return None;
        }
        let lo = Vec2::from_ints(tx, ty);
        let hi = Vec2::from_ints(tx + 1, ty + 1);
        let closest = Vec2::new(p.x.clamp(lo.x, hi.x), p.y.clamp(lo.y, hi.y));
        let d = p - closest;

        if d.is_zero() {
            return self.eject(p, radius, tx, ty);
        }
        let dist = d.length();
        if dist >= radius {
            return None;
        }

        // Which side of the tile the contact is on. `0` means the centre is
        // level with the tile on that axis, so the contact is a face rather
        // than a corner.
        let sx = (p.x < lo.x) as i32 * -1 + (p.x > hi.x) as i32;
        let sy = (p.y < lo.y) as i32 * -1 + (p.y > hi.y) as i32;
        // **The internal-edge cull, and it is load-bearing.** Two adjacent
        // solid tiles share a face down their seam, and that seam is not a
        // surface -- it is the inside of a wall. Without this, a body sliding
        // along a run of masonry is shoved out of every seam it passes, which
        // reads as a stutter at walking speed and as being flung sideways at
        // any other. A face whose neighbour is solid is buried; a corner is
        // buried when either tile sharing its edges is solid, because then one
        // of those presents the face and the face case has already handled it.
        let buried = if !self.sculpted {
            match (sx, sy) {
                (0, _) => self.solid(tx, ty + sy),
                (_, 0) => self.solid(tx + sx, ty),
                _ => self.solid(tx + sx, ty) || self.solid(tx, ty + sy),
            }
        } else {
            let here = Dungeon::tile_of(p);
            match (sx, sy) {
                (0, _) => !self.passable_between(here, (tx, ty + sy)),
                (_, 0) => !self.passable_between(here, (tx + sx, ty)),
                _ => {
                    !self.passable_between(here, (tx + sx, ty))
                        || !self.passable_between(here, (tx, ty + sy))
                }
            }
        };
        if buried {
            return None;
        }

        let n = d.normalize();
        Some((p + n * (radius - dist), n))
    }

    /// Lifts a centre that is *inside* masonry out through the shallowest face
    /// that leads somewhere.
    ///
    /// "That leads somewhere" and not merely "shallowest": ejecting through a
    /// face whose far side is also solid moves the point from one wall into the
    /// next. A point walled in on all four sides is left alone, which cannot
    /// happen on a generated level -- every placement is validated against the
    /// widest body in the roster -- and is not worth inventing a rule for.
    ///
    /// **Heights are deliberately not consulted here**, and that is a statement
    /// about what ejection is for rather than an omission: a body is never
    /// *inside* a plateau, it is standing on top of one. Only masonry can bury
    /// a centre, so only masonry can be ejected from, and the four faces this
    /// looks through are the four faces of a solid tile whatever the terrain
    /// around it does.
    fn eject(&self, p: Vec2, radius: Fx, tx: i32, ty: i32) -> Option<(Vec2, Vec2)> {
        let mut best: Option<(Fx, Vec2)> = None;
        for dir in Cardinal::ALL {
            let (dx, dy) = dir.step();
            if self.solid(tx + dx, ty + dy) {
                continue;
            }
            let depth = match dir {
                Cardinal::NegX => p.x - Fx::from_int(tx),
                Cardinal::PosX => Fx::from_int(tx + 1) - p.x,
                Cardinal::NegY => p.y - Fx::from_int(ty),
                Cardinal::PosY => Fx::from_int(ty + 1) - p.y,
            };
            // Ties keep the earlier cardinal, and `Cardinal::ALL` is a fixed
            // order, so a point dead in the middle of a tile always comes out
            // the same side.
            match best {
                Some((seen, _)) if seen <= depth => {}
                _ => best = Some((depth, Vec2::from_ints(dx, dy))),
            }
        }
        let (depth, n) = best?;
        Some((p + n * (depth + radius), n))
    }

    /// The nearest place a body of this radius can stand, or `p` itself if it
    /// already fits.
    ///
    /// **This is what a click on a wall means.** The answer has to be
    /// continuous rather than snapped to a tile, because the commonest case by
    /// far is a point a little too near a wall, and the honest answer there is
    /// "a body radius off the wall" -- not "the middle of the next tile", which
    /// would put a destination somewhere nobody clicked.
    ///
    /// So: push out of everything the circle overlaps, using the same rule the
    /// collision resolver uses, and only fall back to a scan of tile centres
    /// when the point is buried deeply enough that pushing does not resolve it.
    /// Falls back to `p` when nothing in the level fits the body at all.
    ///
    /// **This function needs no elevation branch of its own, and that is worth
    /// saying rather than leaving to be rediscovered.** Every question it asks
    /// is asked through [`Dungeon::is_clear`] and [`Dungeon::push_out`], both of
    /// which carry the `!self.sculpted` fast path and the directional rule
    /// already, so a `sculpted` test here would be a second copy of a decision
    /// that has been made twice below. The one `solid` call left is the
    /// fallback scan's, and it is right as it stands: the top of a plateau is
    /// somewhere a body can stand, and `is_clear` on that tile's centre is what
    /// decides whether it fits.
    pub fn nearest_clear(&self, p: Vec2, radius: Fx) -> Vec2 {
        if self.is_clear(p, radius) {
            return p;
        }
        // Three passes: a push out of one tile can bring the circle into range
        // of another, and a corner between two walls needs one pass per wall
        // plus one to confirm. Bounded rather than looped to convergence
        // because an unbounded loop over a concave pocket is how a placement
        // helper becomes a hang.
        let mut at = p;
        for _ in 0..3 {
            let lo_x = (at.x - radius).floor_int();
            let hi_x = (at.x + radius).floor_int();
            let lo_y = (at.y - radius).floor_int();
            let hi_y = (at.y + radius).floor_int();
            for ty in lo_y..=hi_y {
                for tx in lo_x..=hi_x {
                    if let Some((to, _)) = self.push_out(at, radius, tx, ty) {
                        at = to;
                    }
                }
            }
            if self.is_clear(at, radius) {
                return at;
            }
        }

        // Buried. Exhaustive rather than a spiral, because a spiral over
        // concave masonry can walk a long way to find something a scan finds
        // immediately, and nothing calls this in a tick. Ties resolve to the
        // lowest tile index, so two callers asking about the same point get the
        // same answer.
        let mut best: Option<(Fx, Vec2)> = None;
        for ty in 0..self.rows as i32 {
            for tx in 0..self.cols as i32 {
                if self.solid(tx, ty) {
                    continue;
                }
                let centre = Dungeon::tile_centre(tx, ty);
                if !self.is_clear(centre, radius) {
                    continue;
                }
                let d = (centre - p).length();
                match best {
                    Some((seen, _)) if seen <= d => {}
                    _ => best = Some((d, centre)),
                }
            }
        }
        best.map_or(p, |(_, at)| at)
    }

    /// Distance from `p` to the first solid face along a cardinal, or to the
    /// edge of the grid when there is nothing in the way.
    ///
    /// This is what the legacy observation's `wall_clearance` column reported. On a floor plan with
    /// nothing carved **and nothing sculpted** it is **bit-for-bit** the
    /// formula that field used before floor plans existed -- taken by the early
    /// return below rather than arrived at by the walk, so that it is a fact
    /// about the code and not a claim about arithmetic.
    ///
    /// The `sculpted` half of that guard is not decoration. A dungeon can have
    /// no masonry at all and still have a cliff in it, and reporting the arena
    /// edge there would tell a policy there was open ground where the floor
    /// stops.
    pub fn clearance(&self, p: Vec2, dir: Cardinal) -> Fx {
        if !self.sculpted && !self.carved {
            let extent = self.extent();
            return match dir {
                Cardinal::NegX => p.x,
                Cardinal::PosX => extent.x - p.x,
                Cardinal::NegY => p.y,
                Cardinal::PosY => extent.y - p.y,
            }
            .max(Fx::ZERO);
        }

        let (mut tx, mut ty) = Dungeon::tile_of(p);
        if self.solid(tx, ty) {
            return Fx::ZERO;
        }
        let (dx, dy) = dir.step();
        if !self.sculpted {
            loop {
                tx += dx;
                ty += dy;
                if !self.solid(tx, ty) {
                    continue;
                }
                // The face of that tile that is turned toward `p`.
                return match dir {
                    Cardinal::NegX => p.x - Fx::from_int(tx + 1),
                    Cardinal::PosX => Fx::from_int(tx) - p.x,
                    Cardinal::NegY => p.y - Fx::from_int(ty + 1),
                    Cardinal::PosY => Fx::from_int(ty) - p.y,
                }
                .max(Fx::ZERO);
            }
        }

        // **The rise is measured between neighbours and not from `p`'s own
        // floor**, which is the one way to get this wrong. A staircase climbing
        // away from the body is open ground it can walk up; measured against
        // where it is standing, the fourth stair would be reported as a wall
        // and the policy would be told a corridor was a dead end.
        loop {
            let (nx, ny) = (tx + dx, ty + dy);
            if !self.passable_between((tx, ty), (nx, ny)) {
                return match dir {
                    Cardinal::NegX => p.x - Fx::from_int(nx + 1),
                    Cardinal::PosX => Fx::from_int(nx) - p.x,
                    Cardinal::NegY => p.y - Fx::from_int(ny + 1),
                    Cardinal::PosY => Fx::from_int(ny) - p.y,
                }
                .max(Fx::ZERO);
            }
            tx = nx;
            ty = ny;
        }
    }

    /// Where along `from -> to` the segment first enters masonry, as a fraction
    /// in `0..=1`, or `None` if it never does.
    ///
    /// Amanatides-Woo: step to whichever axis boundary comes first, then test
    /// the tile stepped into. Every quantity is an `Fx` ratio and `Fx`'s
    /// division saturates, so a segment that barely moves on one axis reports
    /// "never crosses an x boundary" rather than overflowing into a crossing
    /// that is not there.
    ///
    /// # Height, on a sculpted dungeon
    ///
    /// Masonry blocks as it always did, and **a tile also blocks when its floor
    /// rises more than [`TERRAIN_STEP_UP_RAW`] above the line joining the two
    /// endpoints' floors**. A tall plateau then occludes exactly as masonry
    /// does, which is "walls and obstacles emerge from the elevation" made
    /// mechanical, and it is the *same* threshold
    /// [`Dungeon::passable_between`] uses: what a body cannot step onto, it
    /// cannot see over. One number, two consequences, and no second constant to
    /// keep in agreement with the first.
    ///
    /// Read the other way round, the line plus the threshold is an eye: the ray
    /// carries an eye one step-up above the interpolated floor, and a tile
    /// blocks when its floor exceeds that eye. The two readings are the same
    /// arithmetic; the first is the one that says why the number is that number.
    ///
    /// **One `mul_div` per step and no division at all.** `t` is already the
    /// fraction of the whole segment the walk has covered, so interpolating
    /// between the two floors is a scaling and never a ratio that has to be
    /// formed -- which matters because forming it is where a fixed-point
    /// sampler acquires the rounding argument the plateau model exists to
    /// avoid.
    ///
    /// What this does not do: the far endpoint's floor rides up with the
    /// plateau, so a ray *onto* the top of a cliff is not blocked by the cliff.
    /// For sight that is right -- you can see the top of a wall you cannot
    /// climb. For [`Dungeon::is_walk_clear`], which fires three of these, it is
    /// a hole, and the tile-by-tile [`Dungeon::passable_between`] in the
    /// collision resolver is what actually refuses the walk. Recorded here
    /// rather than papered over: closing it needs a walkability mode on this
    /// function, and this session did not need one.
    pub fn raycast(&self, from: Vec2, to: Vec2) -> Option<Fx> {
        let (mut tx, mut ty) = Dungeon::tile_of(from);
        if self.solid(tx, ty) {
            return Some(Fx::ZERO);
        }
        let d = to - from;
        if d.is_zero() {
            return None;
        }

        let step_x = d.x.signum().round_int();
        let step_y = d.y.signum().round_int();
        let (mut t_max_x, t_delta_x) = axis(from.x, d.x, tx, step_x);
        let (mut t_max_y, t_delta_y) = axis(from.y, d.y, ty, step_y);

        if !self.sculpted {
            loop {
                // Ties step in x. Arbitrary, and therefore something to state
                // rather than leave to the comparison operator: it is what makes
                // a shot through the exact corner of four tiles one answer
                // instead of two.
                let t = if t_max_x <= t_max_y {
                    tx += step_x;
                    let t = t_max_x;
                    t_max_x += t_delta_x;
                    t
                } else {
                    ty += step_y;
                    let t = t_max_y;
                    t_max_y += t_delta_y;
                    t
                };
                if t > Fx::ONE {
                    return None;
                }
                if self.solid(tx, ty) {
                    return Some(t);
                }
            }
        }

        // Both ends sampled once, outside the walk. The start tile needs no
        // test of its own: at `t` of zero the line is the start floor exactly,
        // and a tile never rises above itself.
        let from_floor = self.floor_of(tx, ty);
        let climb = self.height_at(to) - from_floor;
        let step_up = Fx::from_raw(TERRAIN_STEP_UP_RAW);
        loop {
            let t = if t_max_x <= t_max_y {
                tx += step_x;
                let t = t_max_x;
                t_max_x += t_delta_x;
                t
            } else {
                ty += step_y;
                let t = t_max_y;
                t_max_y += t_delta_y;
                t
            };
            if t > Fx::ONE {
                return None;
            }
            if self.solid(tx, ty) {
                return Some(t);
            }
            if self.floor_of(tx, ty) - (from_floor + mul_div(climb, t, Fx::ONE)) > step_up {
                return Some(t);
            }
        }
    }

    /// Whether a body of this radius can walk the straight line `from -> to`.
    ///
    /// Three rays -- the centreline and the two flanks at `±radius` -- rather
    /// than a swept capsule. A capsule against a grid is exact and fiddly; the
    /// flanks are the two lines a corner can actually catch, they cost the same
    /// as the centreline, and being *slightly* conservative is the right error
    /// to make: the worst case is a character walking round something it could
    /// have squeezed past.
    ///
    /// The `!self.sculpted` half of the guard below is what stops a level with
    /// no masonry and a cliff across it from answering "walk anywhere"; the
    /// three rays behind it read height through [`Dungeon::raycast`], which
    /// also records the one case they get wrong.
    pub fn is_walk_clear(&self, from: Vec2, to: Vec2, radius: Fx) -> bool {
        if !self.sculpted && !self.carved {
            return true;
        }
        let d = to - from;
        if d.is_zero() {
            return self.is_clear(from, radius);
        }
        let off = d.normalize().perp() * radius;
        self.raycast(from, to).is_none()
            && self.raycast(from + off, to + off).is_none()
            && self.raycast(from - off, to - off).is_none()
    }

    /// Whether one point can *see* another: nothing but open floor between them.
    ///
    /// **One ray down the line of centres, and deliberately permissive** -- the
    /// exact mirror of [`Dungeon::is_walk_clear`] just above, which fires three and
    /// is deliberately conservative. Two bodies can see each other through the
    /// corner where four tiles meet. That is the right error to make here for the
    /// same reason the other is right there: the cost of being wrong is a fighter
    /// that noticed something a moment early, and the cost of the opposite is a
    /// fighter that cannot see an enemy standing in a doorway.
    ///
    /// **The `carved` guard is load-bearing and not an optimisation.**
    /// [`Dungeon::raycast`] does not short-circuit -- on an open plan it walks
    /// every tile boundary to `t > 1` finding nothing -- so without this line every
    /// flat scenario would pay a DDA per entity pair per decision for an answer
    /// that is always `true`. It is also what makes the change bit-identical
    /// there, mechanically rather than by argument.
    ///
    /// **`sculpted` joins that guard rather than replacing it**, and it has to:
    /// a floor plan with no masonry in it can still have a cliff across the
    /// middle, and a `carved`-only guard would hand back `true` without looking.
    /// A flat dungeon still never walks a tile, which is the property the
    /// paragraph above is about.
    pub fn sees(&self, from: Vec2, to: Vec2) -> bool {
        (!self.sculpted && !self.carved) || self.raycast(from, to).is_none()
    }

    /// Marks every tile visible from `from` within `radius`, as `1` in `out`.
    ///
    /// `out` is cleared first and is indexed by cell exactly as the grid is; it is
    /// caller-owned so no search allocates -- see [`Dungeon::distances`] for the
    /// whole of that argument. Shorter than `cols * rows` is not an error; the
    /// scan is clipped to whatever was supplied.
    ///
    /// **Two passes, and the second is not a fudge.** An open tile is visible when
    /// its centre can be reached by a ray. A *solid* tile is visible when any of
    /// its four neighbours is an open tile that is -- which is the identical rule
    /// `rebuildLevelPaths` used on the retired Canvas page to decide which rock
    /// faces caught light. Deriving both edges from one rule is what makes the fog
    /// boundary and the lit-face boundary agree instead of disagreeing by a tile.
    /// Testing a wall tile's own centre would fail every time, because the centre
    /// of a solid tile is inside the masonry the ray is looking for.
    ///
    /// Reuses [`Dungeon::raycast`] rather than introducing shadowcasting. At a
    /// sight range of twelve that is about 450 tiles of some twelve steps each,
    /// and the caller recomputes only when the observer's *tile* changes -- which
    /// is exactly when a tile-granular answer can change.
    ///
    /// **Elevation reaches this only through [`Dungeon::raycast`], and it needs
    /// nothing of its own.** The `!self.sculpted` fast path is that ray's,
    /// taken once per tile, so a flat level pays what it paid. Both passes are
    /// already right on sculpted ground for reasons worth recording, because
    /// each looks like an omission: pass 1 asks the ray, which now stops at a
    /// cliff, so a plateau shadows the floor behind it; and pass 2 lights only
    /// *solid* faces because the top of a plateau is an open tile that pass 1
    /// has already lit or already refused. Adding a plateau to pass 2 would
    /// light the same cells twice under a rule that disagreed with the ray.
    pub fn visible_tiles(&self, from: Vec2, radius: Fx, out: &mut [u8]) {
        for slot in out.iter_mut() {
            *slot = 0;
        }
        let (ox, oy) = Dungeon::tile_of(from);
        let span = radius.floor_int().clamp(0, 64) + 1;

        // Pass 1: open tiles, by ray.
        for ty in (oy - span)..=(oy + span) {
            for tx in (ox - span)..=(ox + span) {
                let Some(cell) = self.cell(tx, ty) else { continue };
                if self.solid(tx, ty) {
                    continue;
                }
                let centre = Dungeon::tile_centre(tx, ty);
                if (centre - from).length() > radius {
                    continue;
                }
                if self.raycast(from, centre).is_none() {
                    if let Some(slot) = out.get_mut(cell as usize) {
                        *slot = 1;
                    }
                }
            }
        }

        // Pass 2: the rock faces bounding what pass 1 lit. One tile wider, so the
        // wall on the far rim of the disc is not left dark against lit floor.
        for ty in (oy - span - 1)..=(oy + span + 1) {
            for tx in (ox - span - 1)..=(ox + span + 1) {
                let Some(cell) = self.cell(tx, ty) else { continue };
                if !self.solid(tx, ty) {
                    continue;
                }
                // An *open* neighbour, and the openness test is not redundant.
                // Pass 2 reads `out` while writing it, so without it a lit rock
                // face lights the rock behind itself -- but only in `+x` and
                // `+y`, because those are the neighbours this scan has already
                // reached. A rule that leaks in two directions out of four is
                // worse than either answer: the fog boundary would be a tile
                // thick on the north and west of a room and two on the south
                // and east. Restricting the read to open cells is also what
                // makes the ordering hazard go away outright, since pass 1
                // wrote every open cell before pass 2 started and pass 2 writes
                // none of them.
                let lit = Cardinal::ALL.iter().any(|dir| {
                    let (dx, dy) = dir.step();
                    let (nx, ny) = (tx + dx, ty + dy);
                    !self.solid(nx, ny)
                        && self
                            .cell(nx, ny)
                            .and_then(|c| out.get(c as usize))
                            .is_some_and(|&v| v == 1)
                });
                if lit {
                    if let Some(slot) = out.get_mut(cell as usize) {
                        *slot = 1;
                    }
                }
            }
        }
    }
}

// ------------------------------------------------------------------ carving

/// How wide a corridor is, in tiles.
///
/// **Three, and the arithmetic is not close.** `Body::radius` across the roster
/// is Fighter 0.45, Rogue 0.35, Brute 0.70, Skitterer 0.30:
///
/// | Width | Brute fits | Brute passes a Fighter | Brute passes a Brute |
/// |-------|------------|------------------------|----------------------|
/// | 1.0   | **no**, it needs 1.40 | --          | --                   |
/// | 2.0   | yes, 0.30 a side | **no** -- it needs 1.15 of centre separation and has 0.60 of lateral room | **no** |
/// | 3.0   | yes, 0.80 a side | yes, 1.85 apart | yes, 1.60 apart     |
///
/// Two-wide corridors *plug*. A Brute walking one way and a Fighter walking the
/// other cannot get past each other, and with a route field pointing both at
/// the same goal that is a hard deadlock which reads as the AI being broken.
/// Three costs nothing but floor area, and there is plenty.
pub const CORRIDOR: i32 = 3;

/// Rooms are placed by rejection: this many tries, keeping at most this many.
///
/// Attempts scale with *area* rather than with room count: rejection sampling
/// on a fuller grid fails more often, and this is a budget of tries and not of
/// rooms. 160 on twice the floor is the same generosity 80 was on half of it.
const ROOM_ATTEMPTS: u32 = 160;
const MAX_ROOMS: usize = 18;
/// Tiles of masonry every room insists on keeping around itself. Two, so a
/// corridor always has rock to run through rather than merging its two rooms
/// into one blob.
const WALL_MARGIN: i32 = 2;
/// Extra corridors beyond the spanning tree, so a level is a loop rather than a
/// corridor with beads on it. Four rather than two, because the room count went
/// up with the floor and two extra edges over eighteen rooms is a longer chain
/// of beads rather than a loop.
const LOOPS: usize = 4;
const ROOM_W: (i32, i32) = (6, 10);
const ROOM_H: (i32, i32) = (5, 8);

/// RNG domain tag for the floor plan. Disjoint from the browser's spawn stream
/// (`1 << 63`), so walking a monster in never disturbs the layout and the
/// layout never disturbs a spawn.
const LAYOUT_STREAM: u64 = 1 << 62;

/// A doorway: up to `CORRIDOR` tiles that open together as one.
///
/// A fixed array rather than a `Vec`, so a level is not a hundred small
/// allocations -- this crate is compiled to wasm and driven from a page holding
/// typed-array views into linear memory, where an allocation that grows memory
/// detaches every one of them. `World`'s contact scratch is reserved once for
/// the same reason.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct Door {
    pub cells: [u32; CORRIDOR as usize],
    pub len: u8,
}

impl Door {
    /// The cells this doorway is actually made of. Clamped rather than trusted,
    /// because a `len` past the end of the array would be a panic in a crate
    /// driven from a `cdylib`.
    pub fn cells(&self) -> &[u32] {
        &self.cells[..(self.len as usize).min(CORRIDOR as usize)]
    }
}

/// A torch, on the face of a wall tile.
///
/// **The sim never reads one.** It is in the level rather than in the page
/// because the page cannot tell a room wall from a corridor wall without redoing
/// the generator's work, and a torch every four tiles along a room and none in
/// the tunnels is most of what makes a room feel like a room. Deliberately
/// absent from [`crate::Scenario::fingerprint`]: `portal` is there because a
/// driver acts on it, and this is paint.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct Torch {
    pub tx: u16,
    pub ty: u16,
    /// Which masonry face the bracket is physically mounted on. All four
    /// cardinals are valid: camera occlusion is presentation, not placement.
    pub face: Cardinal,
}

/// Wall tiles between torches along a room's ring, counted over the tiles a
/// torch could actually hang on.
///
/// Four. A room is 6-10 by 5-8, so its wall ring offers enough mounting tiles
/// for several pools without turning every block into a lamp -- enough
/// that a room is lit from several places at once, which is what makes the
/// overlap in `world-07` §3 the common case rather than a corner one.
const TORCH_EVERY: usize = 4;

/// A generated level: the floor plan, and the places on it that mean something.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct Level {
    pub dungeon: Dungeon,
    /// The centre of the first room: where the way in is.
    pub hero: Vec2,
    /// The centre of the room furthest from the hero **along the floor**, which
    /// is not the same as furthest in a straight line and is the one that makes
    /// the level worth crossing.
    pub portal: Vec2,
    /// Standing room for the opposition, never in the hero's own room.
    pub monsters: Vec<Vec2>,
    /// The rooms, in acceptance order. `rooms[0]` is the one the hero arrives
    /// in and the one the monster walk deliberately never enters.
    ///
    /// Published because two things outside the generator need it and were
    /// making do with proxies: door placement is defined against a room's ring,
    /// and the clustering tests were asserting "not in the first room" as a
    /// distance rather than as the fact it is.
    pub rooms: Vec<Rect>,
    /// The doorways, shut. Carried as a list as well as in the tiles because an
    /// *opened* door is indistinguishable from floor in the grid, and the page
    /// still wants to draw a frame there.
    ///
    /// Exactly `dungeon.doorways()` at the moment the level was carved -- the
    /// grouping rule lives there and only there. What this adds is a record that
    /// survives the opening.
    pub doors: Vec<Door>,
    /// The torches. See [`Torch`] -- **nothing in this crate reads them**, and
    /// the one thing they must never do is move the layout above them.
    pub torches: Vec<Torch>,
}

/// A room, in tiles: `x..x + w` by `y..y + h`.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
}

impl Rect {
    fn centre(self) -> (i32, i32) {
        (self.x + self.w / 2, self.y + self.h / 2)
    }

    fn grown(self, by: i32) -> Rect {
        Rect {
            x: self.x - by,
            y: self.y - by,
            w: self.w + 2 * by,
            h: self.h + 2 * by,
        }
    }

    fn intersects(self, other: Rect) -> bool {
        self.x < other.x + other.w
            && other.x < self.x + self.w
            && self.y < other.y + other.h
            && other.y < self.y + self.h
    }
}

impl Dungeon {
    /// Carves a level.
    ///
    /// A pure function of `(cols, rows, seed, depth, monsters, clearance)`: the
    /// RNG is created here, consumed here and thrown away, so what comes out is
    /// a plain value. That is the same shape [`crate::Scenario::skirmish`] has
    /// and it is what keeps `World::new` a pure function of a scenario rather
    /// than something that re-rolls the same numbers and hopes.
    ///
    /// `clearance` is the radius every placement is validated against. Pass the
    /// **widest** body in the roster regardless of what is actually being
    /// placed, so the guarantee is "anything can stand here" rather than "this
    /// particular thing could".
    pub fn generate(
        cols: u16,
        rows: u16,
        seed: u64,
        depth: u32,
        monsters: usize,
        clearance: Fx,
    ) -> Level {
        Dungeon::generate_within(cols, rows, seed, depth, monsters, clearance, true)
    }

    /// [`Dungeon::generate`], with the torch pass switchable.
    ///
    /// **The parameter exists for one test and it earns its keep.** The whole of
    /// `world-07`'s correctness rests on the torch pass drawing nothing from the
    /// RNG, and the only way to *assert* that rather than assert it in a comment
    /// is to generate the same seed with the pass and without it and compare
    /// everything else. `the_torch_pass_does_not_move_the_layout` is that test;
    /// nothing outside this file may pass `false`.
    ///
    /// The compiler holds the same property independently, which is why the
    /// parameter is cheap: [`place_torches`] takes no [`Rng`] and cannot be
    /// given one, so there is no expression inside it that could draw.
    fn generate_within(
        cols: u16,
        rows: u16,
        seed: u64,
        depth: u32,
        monsters: usize,
        clearance: Fx,
        torch_pass: bool,
    ) -> Level {
        let mut rng = Rng::from_stream(seed, depth as u64, LAYOUT_STREAM);
        let (c, r) = (cols as i32, rows as i32);
        let mut tiles = vec![WALL; (c as usize) * (r as usize)];

        // 1. Rooms, by rejection.
        //
        // All four numbers are drawn **unconditionally and in a fixed order**,
        // before anything can reject the candidate. Drawing them lazily would
        // make the stream position depend on how many earlier attempts happened
        // to fail, which is the kind of coupling that turns "the same seed" into
        // "the same seed, if nothing upstream changed".
        let mut rooms: Vec<Rect> = Vec::new();
        for _ in 0..ROOM_ATTEMPTS {
            let w = rng.range_i32(ROOM_W.0, ROOM_W.1);
            let h = rng.range_i32(ROOM_H.0, ROOM_H.1);
            let x = rng.range_i32(1, (c - w - 1).max(1));
            let y = rng.range_i32(1, (r - h - 1).max(1));
            if rooms.len() >= MAX_ROOMS {
                continue;
            }
            let room = Rect { x, y, w, h };
            if room.x + room.w >= c || room.y + room.h >= r {
                continue;
            }
            let padded = room.grown(WALL_MARGIN);
            if rooms.iter().any(|&o| padded.intersects(o.grown(WALL_MARGIN))) {
                continue;
            }
            rooms.push(room);
        }
        if rooms.is_empty() {
            // Unreachable at any size this is called with, and the alternative
            // to handling it is a panic three lines later -- inside a crate
            // driven from a `cdylib`, where a panic poisons the instance.
            rooms.push(Rect {
                x: 1,
                y: 1,
                w: (c - 2).clamp(1, ROOM_W.1),
                h: (r - 2).clamp(1, ROOM_H.1),
            });
        }

        for room in &rooms {
            for ty in room.y..room.y + room.h {
                for tx in room.x..room.x + room.w {
                    tiles[(ty * c + tx) as usize] = OPEN;
                }
            }
        }

        // 2. Corridors. Room `i` to room `i - 1` in acceptance order, which is a
        //    spanning tree by construction -- connectivity is guaranteed here,
        //    before any verification runs, rather than hoped for and checked.
        for i in 1..rooms.len() {
            let horizontal_first = rng.chance(1, 2);
            carve_corridor(
                &mut tiles,
                c,
                r,
                rooms[i - 1].centre(),
                rooms[i].centre(),
                horizontal_first,
            );
        }
        // Then a couple of extra edges, so the level is a loop rather than a
        // corridor with beads on it. Both ends and the bend are drawn
        // unconditionally, for the reason the room loop gives.
        for _ in 0..LOOPS {
            let i = rng.below(rooms.len() as u32) as usize;
            let j = rng.below(rooms.len() as u32) as usize;
            let horizontal_first = rng.chance(1, 2);
            if i != j {
                carve_corridor(
                    &mut tiles,
                    c,
                    r,
                    rooms[i].centre(),
                    rooms[j].centre(),
                    horizontal_first,
                );
            }
        }

        // 3. The border is masonry, always. `carve_block` already refuses it and
        //    every room is placed inside it, so this changes nothing today --
        //    which is exactly why it is cheap insurance against a future edit
        //    that opens the edge of the world.
        for tx in 0..c {
            tiles[tx as usize] = WALL;
            tiles[((r - 1) * c + tx) as usize] = WALL;
        }
        for ty in 0..r {
            tiles[(ty * c) as usize] = WALL;
            tiles[(ty * c + c - 1) as usize] = WALL;
        }

        // 4. Doorways: the ring one tile outside each room, in acceptance order.
        //    A maximal run of `OPEN` along one side of that ring is a doorway,
        //    and every tile of the run becomes `DOOR`. A tile an earlier room
        //    already claimed is left alone, so the lowest room index wins a
        //    shared run.
        //
        //    Three properties this buys, and each one is a bug it avoids:
        //
        //    - **A door is the full corridor width.** `CORRIDOR` is 3 because a
        //      two-wide passage plugs -- a Brute (radius 0.70) and a Fighter
        //      cannot pass in one. Narrowing a doorway to save a tile would
        //      reintroduce exactly that deadlock at the one place every route on
        //      the level converges. Nothing here carves, only relabels, so the
        //      width comes from the corridor that made the run.
        //    - **Doors sit outside the room, not in its wall.** The room rect
        //      stays whole, so nothing that reasons about a room's interior --
        //      the placements, the clustering walk -- has to learn about doors.
        //    - **A room with no corridor touching it gets no door**, and a room
        //      with four gets four, without either being a special case.
        //
        //    The ring is walked as four straight sides rather than as one cycle,
        //    which is the reading the plan for this left open: a run around a
        //    cycle can turn a corner, and a doorway that turns a corner is
        //    neither a thing a corridor makes nor a shape `Door`'s fixed array
        //    could hold. Each side is walked with the two corners beside it
        //    included, so a corridor arriving at the very edge of a room is
        //    measured as the three-wide run it is rather than clipped to the
        //    part of it that lies opposite the room.
        //
        //    Three runs are refused, and a refusal costs a door and never a
        //    route -- the tiles are left exactly as the corridors carved them.
        //    One longer than `CORRIDOR` is two corridors that have merged. One
        //    lying entirely in the corners is a corridor going *past* the room
        //    rather than into it. One that reaches past both corners is the same
        //    thing seen from the other end.
        for room in &rooms {
            // Origin, step and length of the four sides of the ring.
            let sides = [
                (room.x, room.y - 1, 1, 0, room.w),
                (room.x, room.y + room.h, 1, 0, room.w),
                (room.x - 1, room.y, 0, 1, room.h),
                (room.x + room.w, room.y, 0, 1, room.h),
            ];
            for (sx, sy, dx, dy, span) in sides {
                // Extended over the two corners. A corner shares no face with
                // the room, so sealing it is never what *seals* anything; what
                // covering it buys is a doorway the width of the corridor
                // instead of one with a notch of floor beside it.
                let (sx, sy, span) = (sx - dx, sy - dy, span + 2);
                // `tiles` is passed in rather than captured so the run below can
                // be measured and then written in the same loop.
                let open_at = |tiles: &[u8], k: i32| {
                    let (tx, ty) = (sx + dx * k, sy + dy * k);
                    tx >= 0
                        && ty >= 0
                        && tx < c
                        && ty < r
                        && tiles[(ty * c + tx) as usize] == OPEN
                };
                let mut k = 0;
                while k < span {
                    if !open_at(&tiles, k) {
                        k += 1;
                        continue;
                    }
                    let mut lo = k;
                    while open_at(&tiles, lo - 1) {
                        lo -= 1;
                    }
                    let mut hi = k;
                    while open_at(&tiles, hi + 1) {
                        hi += 1;
                    }
                    // `1 ..= span - 2` in these coordinates is the side proper:
                    // the tiles that share a face with the room, and therefore
                    // the only ones a body can enter through.
                    let touches_room = hi >= 1 && lo <= span - 2;
                    if lo >= 0 && hi < span && hi - lo < CORRIDOR && touches_room {
                        for j in lo..=hi {
                            let (tx, ty) = (sx + dx * j, sy + dy * j);
                            tiles[(ty * c + tx) as usize] = DOOR;
                        }
                    }
                    k = hi + 1;
                }
            }
        }

        let mut dungeon = Dungeon::from_tiles(cols, rows, tiles);

        // 5. Verify, and repair by filling. Cannot fire today -- step 2
        //    guarantees it -- and it is here so that a future generator edit
        //    that strands a room produces a smaller level rather than a level
        //    with somewhere the portal might be and nobody can reach.
        //
        //    **Through the doors, and this is the one way to get step 4 badly
        //    wrong.** A search that treats a shut door as masonry reaches no
        //    room behind one, the repair below fills every such room in, and a
        //    level comes out as a single room. `floor_count` rather than
        //    `open_count` for the other half of the same argument: a
        //    door-inclusive walk measured against a door-exclusive total never
        //    matches, and the repair would fire on a level that was never
        //    broken.
        let (mut dist, mut queue) = (Vec::new(), Vec::new());
        let start = rooms[0].centre();
        let seed_cell = dungeon.cell(start.0, start.1);
        dungeon.distances_for(seed_cell.as_slice(), true, &mut dist, &mut queue);
        if queue.len() != dungeon.floor_count() {
            let mut tiles = dungeon.tiles.clone();
            for (cell, &d) in dist.iter().enumerate() {
                if d == u16::MAX {
                    // A `DOOR` in a stranded pocket is filled in with the floor
                    // behind it, and that is the right answer rather than an
                    // oversight worth guarding against: a doorway onto nowhere
                    // is not a doorway.
                    tiles[cell] = WALL;
                }
            }
            dungeon = Dungeon::from_tiles(cols, rows, tiles);
            dungeon.distances_for(seed_cell.as_slice(), true, &mut dist, &mut queue);
        }
        debug_assert_eq!(queue.len(), dungeon.floor_count(), "stranded floor");

        // 6. Placements, taken off the room list rather than re-rolled against
        //    the grid, and every one of them validated.
        let place = |dungeon: &Dungeon, tx: i32, ty: i32| {
            dungeon.nearest_clear(Dungeon::tile_centre(tx, ty), clearance)
        };
        let hero = place(&dungeon, start.0, start.1);

        // The way out is the room furthest from the way in **along the floor**.
        // Straight-line distance would happily pick a room on the other side of
        // one wall; this picks the one that is actually a walk. Ties keep the
        // lowest room index.
        let mut exit = rooms[0];
        let mut furthest = 0u16;
        for &room in &rooms {
            let (tx, ty) = room.centre();
            let reach = dungeon
                .cell(tx, ty)
                .and_then(|cell| dist.get(cell as usize).copied())
                .unwrap_or(u16::MAX);
            if reach != u16::MAX && reach > furthest {
                furthest = reach;
                exit = room;
            }
        }
        let portal = place(&dungeon, exit.centre().0, exit.centre().1);

        // Clumped rather than spread: a room with three things in it is a fight, a
        // room with one is an errand, and a level wants some of each. The walk still
        // starts at room 1 and never enters room 0, so "you do not open the level in
        // a fight" stays a property of the room list rather than a distance test.
        let spread = rooms.len().saturating_sub(1).max(1);
        let mut placed = Vec::with_capacity(monsters);
        let mut at = 0usize;
        for _ in 0..monsters {
            // Drawn **unconditionally and before anything can branch on it**, for
            // the reason the room loop gives at the top of this function: a draw
            // that only sometimes happens makes the stream position depend on how
            // many earlier iterations took which arm.
            let stay = rng.chance(1, 2);
            if !stay {
                at += 1;
            }
            let room = rooms[if rooms.len() > 1 { 1 + at % spread } else { 0 }];
            let tx = rng.range_i32(room.x, room.x + room.w - 1);
            let ty = rng.range_i32(room.y, room.y + room.h - 1);
            placed.push(place(&dungeon, tx, ty));
        }

        // 7. Torches, and **the RNG is finished with**. `rng` is not passed to
        //    the call below and cannot be reached from inside it, which is what
        //    makes "a decoration cannot move a golden hash" a property of the
        //    signature rather than of this comment. It is last for the same
        //    reason: everything that draws is above it, so there is no ordering
        //    to get wrong.
        let doors = dungeon.doorways();
        let torches = if torch_pass {
            place_torches(&dungeon, &rooms, &doors)
        } else {
            Vec::new()
        };

        Level {
            doors,
            dungeon,
            hero,
            portal,
            monsters: placed,
            rooms,
            torches,
        }
    }
}

/// Whether a torch can hang on this face of this tile.
///
/// Two conditions, and both are about the *picture* rather than about the level:
///
/// - The tile is [`WALL`] and not merely solid. A [`DOOR`] is solid too, and a
///   torch nailed to one is a torch hanging in mid-air the moment somebody opens
///   it -- which is a bug that appears half a minute into a level and never in a
///   generator test.
/// - The tile the face looks at is [`OPEN`]. This is the *same predicate* the
///   page's `wallBlock` uses to decide whether to emit that face at all
///   (`!solid(tx + 1, ty)` and `!solid(tx, ty + 1)`), so a torch that passes here
///   is a torch with a quad to sit on. It is also, on a room's ring, exactly
///   "open floor on the room's side of it".
///
/// Out of range answers [`WALL`] from [`Dungeon::tile`], so the border of the
/// level needs no case here either.
fn torch_mount(dungeon: &Dungeon, tx: i32, ty: i32, face: Cardinal) -> bool {
    if dungeon.tile(tx, ty) != WALL {
        return false;
    }
    let (dx, dy) = face.step();
    dungeon.tile(tx + dx, ty + dy) == OPEN
}

/// Hangs one torch, unless the tile already carries one. Answers whether it did.
///
/// One torch to a tile, which is what makes the two passes below composable: a
/// doorway's jamb is also on its room's ring, so the ring pass and the doorway
/// pass ask for the same tile perhaps a third of the time, and without this a
/// jamb would carry two lights in the same place.
fn hang_torch(
    dungeon: &Dungeon,
    taken: &mut [bool],
    torches: &mut Vec<Torch>,
    tx: i32,
    ty: i32,
    face: Cardinal,
) -> bool {
    let Some(cell) = dungeon.cell(tx, ty) else {
        return false;
    };
    if taken[cell as usize] || !torch_mount(dungeon, tx, ty, face) {
        return false;
    }
    taken[cell as usize] = true;
    torches.push(Torch {
        tx: tx as u16,
        ty: ty as u16,
        face,
    });
    true
}

/// Every torch on the level: a walk over geometry the generator has already
/// produced.
///
/// **No [`Rng`] and no way to reach one.** That is the whole of `world-07`'s
/// acceptance criterion -- a decoration that drew even one number would move the
/// stream position of every placement under it and re-record four browser
/// goldens to say that nothing had changed -- and it is held by this function
/// taking a finished [`Dungeon`] and nothing else.
///
/// All four inward room faces are walked. Earlier placement omitted two sides
/// for one fixed camera, which made a rotated, top-down, or first-person view
/// reveal lights with no fixtures. The physical mount is now independent of
/// how a view chooses to fade the wall in front of it.
///
/// Two passes, in this order:
///
/// 1. **The ring.** Every fourth mountable tile of the north ring and then the
///    west one, counted with a single counter that runs across both, so a room's
///    torches are evenly spaced around the corner rather than restarting at it.
/// 2. **The doorways.** A torch on each jamb of every doorway -- the tiles
///    orthogonally beside a door tile that are still masonry, which is the same
///    rule the page's `JAMB_SIDES` uses to decide where a *post* goes and needs
///    no run direction and no grouping. A doorway in a south or east wall gets
///    none, for the paragraph above.
fn place_torches(dungeon: &Dungeon, rooms: &[Rect], doors: &[Door]) -> Vec<Torch> {
    let cols = dungeon.cols() as i32;
    let mut taken = vec![false; dungeon.cols() as usize * dungeon.rows() as usize];
    let mut torches = Vec::new();

    for room in rooms {
        // Origin, step, length and inward face of the complete room ring.
        // Both start at the north-west corner and both are extended over it, so
        // the two walks meet at a tile rather than leaving a gap -- the corner
        // itself never qualifies, since the tile on either side of it is the
        // other ring's masonry rather than the room.
        let sides = [
            (room.x - 1, room.y - 1, 1, 0, room.w + 2, Cardinal::PosY),
            (room.x - 1, room.y - 1, 0, 1, room.h + 2, Cardinal::PosX),
            (room.x - 1, room.y + room.h, 1, 0, room.w + 2, Cardinal::NegY),
            (room.x + room.w, room.y - 1, 0, 1, room.h + 2, Cardinal::NegX),
        ];
        // One counter for the whole ring walk, and it counts *mountable* tiles
        // rather than tiles: a doorway or a corridor mouth in a wall is a gap
        // in the masonry and not a gap in the spacing, so counting raw tiles
        // would bunch the torches beside every hole.
        let mut step = 0usize;
        for (sx, sy, dx, dy, span, face) in sides {
            for k in 0..span {
                let (tx, ty) = (sx + dx * k, sy + dy * k);
                if !torch_mount(dungeon, tx, ty, face) {
                    continue;
                }
                step += 1;
                // The first, then every fourth. Anchored at the start of the
                // walk rather than at `0 % 4`, so a wall always opens with a
                // torch instead of sometimes opening with three dark tiles.
                if step % TORCH_EVERY != 1 {
                    continue;
                }
                hang_torch(dungeon, &mut taken, &mut torches, tx, ty, face);
            }
        }
    }

    for door in doors {
        for &cell in door.cells() {
            let (tx, ty) = ((cell as i32) % cols, (cell as i32) / cols);
            for (dx, dy) in [(-1, 0), (1, 0), (0, -1), (0, 1)] {
                let (nx, ny) = (tx + dx, ty + dy);
                // Faces tried in a fixed order and the first that takes wins.
                // At most one of them ever can: a jamb beside a doorway has the
                // door on one of these two faces and rock or floor on the other,
                // and the door is not `OPEN` while the level is being carved.
                for face in Cardinal::ALL {
                    if hang_torch(dungeon, &mut taken, &mut torches, nx, ny, face) {
                        break;
                    }
                }
            }
        }
    }

    // Every mount still names a real masonry/open boundary. Whether the camera
    // currently sees that face is presentation and cannot invalidate the row.
    debug_assert!(
        torches
            .iter()
            .all(|t| torch_mount(dungeon, i32::from(t.tx), i32::from(t.ty), t.face)),
        "a torch with no wall face to hang on"
    );
    torches
}

/// Opens the `CORRIDOR`-square block centred on a tile, clipped to the inside
/// of the border.
///
/// A block rather than a line, and that is what makes the *corner* of an L as
/// wide as its runs. A one-tile corner in a three-wide corridor is where a
/// Brute gets stuck, and it is invisible until you watch one try.
fn carve_block(tiles: &mut [u8], c: i32, r: i32, tx: i32, ty: i32) {
    let half = CORRIDOR / 2;
    for by in ty - half..=ty + half {
        for bx in tx - half..=tx + half {
            if bx < 1 || by < 1 || bx >= c - 1 || by >= r - 1 {
                continue;
            }
            tiles[(by * c + bx) as usize] = OPEN;
        }
    }
}

/// An L from `a` to `b`, one axis then the other.
fn carve_corridor(
    tiles: &mut [u8],
    c: i32,
    r: i32,
    a: (i32, i32),
    b: (i32, i32),
    horizontal_first: bool,
) {
    let (mut x, mut y) = a;
    carve_block(tiles, c, r, x, y);
    let (first, second) = if horizontal_first {
        ((b.0, a.1), b)
    } else {
        ((a.0, b.1), b)
    };
    for (tx, ty) in [first, second] {
        while x != tx {
            x += (tx - x).signum();
            carve_block(tiles, c, r, x, y);
        }
        while y != ty {
            y += (ty - y).signum();
            carve_block(tiles, c, r, x, y);
        }
    }
}

/// Whether the circle at `p` reaches into tile `(tx, ty)`.
///
/// Closest-point-on-the-box, which is the same test the collision resolver
/// makes and is here so the two cannot disagree about what "overlapping" means.
fn overlaps(p: Vec2, radius: Fx, tx: i32, ty: i32) -> bool {
    let closest = Vec2::new(
        p.x.clamp(Fx::from_int(tx), Fx::from_int(tx + 1)),
        p.y.clamp(Fx::from_int(ty), Fx::from_int(ty + 1)),
    );
    (p - closest).length() < radius
}

/// The DDA's per-axis setup: how far along the segment the first tile boundary
/// is, and how far apart the boundaries are after that. Both as fractions of
/// the whole segment.
///
/// A zero step means "this axis never crosses a boundary", reported as
/// [`Fx::MAX`] so the comparison in the walk always prefers the other axis.
fn axis(origin: Fx, delta: Fx, tile: i32, step: i32) -> (Fx, Fx) {
    if step == 0 {
        return (Fx::MAX, Fx::MAX);
    }
    let boundary = Fx::from_int(if step > 0 { tile + 1 } else { tile });
    let span = delta.abs();
    ((boundary - origin).abs() / span, Fx::ONE / span)
}

/// Builds a floor plan from a picture. `#` is masonry, `+` is a shut doorway,
/// anything else is floor; rows read top to bottom, so the picture in the test
/// is the picture on the screen.
///
/// At module scope rather than inside `mod tests` because `crates/sim/src/world/`
/// builds its collision fixtures with it too, and a hand-written `Vec<u8>` in each
/// of them is a test whose *setup* has to be decoded before its assertion can be read.
#[cfg(test)]
pub(crate) fn parse(rows: &[&str]) -> Dungeon {
    let cols = rows.iter().map(|r| r.len()).max().unwrap_or(0);
    let mut tiles = Vec::with_capacity(cols * rows.len());
    for row in rows {
        for tx in 0..cols {
            let ch = row.as_bytes().get(tx).copied().unwrap_or(b'#');
            tiles.push(match ch {
                b'#' => WALL,
                b'+' => DOOR,
                _ => OPEN,
            });
        }
    }
    Dungeon::from_tiles(cols as u16, rows.len() as u16, tiles)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn at(x: i32, y: i32) -> Vec2 {
        Dungeon::tile_centre(x, y)
    }

    #[test]
    fn an_open_floor_plan_is_not_carved_and_the_outside_is_still_solid() {
        let d = Dungeon::open(24, 16);
        assert!(!d.carved());
        assert_eq!(d.extent(), Vec2::from_ints(24, 16));
        assert_eq!(d.open_count(), 24 * 16);
        for ty in 0..16 {
            for tx in 0..24 {
                assert!(!d.solid(tx, ty));
            }
        }
        assert!(d.solid(-1, 0));
        assert!(d.solid(24, 0));
        assert!(d.solid(0, -1));
        assert!(d.solid(0, 16));
    }

    #[test]
    fn a_wrong_length_tile_vector_is_padded_with_masonry_rather_than_refused() {
        let d = Dungeon::from_tiles(4, 4, vec![OPEN; 6]);
        assert!(!d.solid(1, 0));
        assert!(d.solid(3, 3));
        assert_eq!(Dungeon::from_tiles(2, 2, vec![OPEN; 99]).open_count(), 4);
    }

    #[test]
    fn the_digest_sees_the_tiles_and_the_shape() {
        let a = parse(&["....", ".##.", "...."]);
        assert_eq!(a.fingerprint(), parse(&["....", ".##.", "...."]).fingerprint());
        assert_ne!(a.fingerprint(), parse(&["....", ".#..", "...."]).fingerprint());
        // Same tiles, different shape: 12 open either way.
        assert_ne!(
            Dungeon::open(4, 3).fingerprint(),
            Dungeon::open(3, 4).fingerprint()
        );
    }

    #[test]
    fn clearance_on_an_open_floor_plan_is_the_arena_edge() {
        let d = Dungeon::open(24, 16);
        for p in [
            Vec2::from_ints(12, 8),
            Vec2::new(Fx::from_ratio(1, 10), Fx::from_ratio(157, 100)),
            Vec2::from_ints(0, 0),
            Vec2::from_ints(24, 16),
        ] {
            // The formula the legacy observation's `wall_clearance` carried before floor
            // plans existed, raw for raw.
            assert_eq!(d.clearance(p, Cardinal::NegX), p.x.max(Fx::ZERO));
            assert_eq!(
                d.clearance(p, Cardinal::PosX),
                (Fx::from_int(24) - p.x).max(Fx::ZERO)
            );
            assert_eq!(d.clearance(p, Cardinal::NegY), p.y.max(Fx::ZERO));
            assert_eq!(
                d.clearance(p, Cardinal::PosY),
                (Fx::from_int(16) - p.y).max(Fx::ZERO)
            );
        }
    }

    #[test]
    fn clearance_stops_at_masonry() {
        //  0123456
        let d = parse(&[
            "#######", // 0
            "#..#..#", // 1
            "#..#..#", // 2
            "#######", // 3
        ]);
        let p = at(1, 1); // (1.5, 1.5)
        // East: tile 3 is solid, its near face is x = 3.
        assert_eq!(d.clearance(p, Cardinal::PosX), Fx::from_ratio(15, 10));
        // West: tile 0 is solid, its near face is x = 1.
        assert_eq!(d.clearance(p, Cardinal::NegX), Fx::from_ratio(5, 10));
        assert_eq!(d.clearance(p, Cardinal::NegY), Fx::from_ratio(5, 10));
        assert_eq!(d.clearance(p, Cardinal::PosY), Fx::from_ratio(15, 10));
        // A point buried in rock has no room at all, in any direction.
        for dir in Cardinal::ALL {
            assert_eq!(d.clearance(at(0, 0), dir), Fx::ZERO);
        }
    }

    #[test]
    fn is_clear_measures_the_body_and_not_the_tile() {
        let d = parse(&["###", "#..", "###"]);
        let big = Fx::from_ratio(70, 100); // a Brute
        let small = Fx::from_ratio(30, 100); // a Skitterer
        let p = at(1, 1); // (1.5, 1.5); the walls are at x<1, y<1 and y>=2
        // A one-tile-tall gap: half a unit of room above and below centre.
        assert!(d.is_clear(p, small));
        assert!(!d.is_clear(p, big));
        // And nobody stands inside the masonry itself.
        assert!(!d.is_clear(at(0, 0), Fx::from_ratio(1, 100)));
    }

    #[test]
    fn nearest_clear_finds_ground_and_leaves_good_ground_alone() {
        let d = parse(&[
            "#####",
            "#...#",
            "#...#",
            "#...#",
            "#####",
        ]);
        let r = Fx::from_ratio(45, 100);
        let good = at(2, 2);
        assert_eq!(d.nearest_clear(good, r), good, "a fitting point is kept");

        let inside_rock = at(0, 0);
        let moved = d.nearest_clear(inside_rock, r);
        assert!(d.is_clear(moved, r));
        assert_eq!(moved, at(1, 1), "the nearest tile centre that fits");

        // Deterministic: the same question always gets the same answer.
        assert_eq!(moved, d.nearest_clear(inside_rock, r));
    }

    #[test]
    fn a_ray_stops_at_the_first_masonry_it_meets() {
        let d = parse(&[
            "#######",
            "#..#..#",
            "#..#..#",
            "#######",
        ]);
        // Straight east out of (1.5, 1.5): the wall column starts at x = 3.
        // Asserted as the point the fraction lands on rather than as the
        // fraction itself, and to a hundredth rather than to the raw: a divide
        // and a multiply both truncate toward negative infinity, so the ray
        // reports a hair *short* of the face it met. That is the right
        // direction to be wrong in -- the reported point is still open ground.
        let from = at(1, 1);
        let to = Vec2::new(Fx::from_int(6), Fx::from_ratio(15, 10));
        let t = d.raycast(from, to).expect("the wall is in the way");
        let landed = from + (to - from) * t;
        assert!(
            (landed.x - Fx::from_int(3)).abs() < Fx::from_ratio(1, 100),
            "landed at {landed:?}"
        );

        // Along the open corridor: nothing in the way.
        assert_eq!(d.raycast(at(1, 1), at(1, 2)), None);

        // A ray that starts in rock is already blocked.
        assert_eq!(d.raycast(at(0, 0), at(1, 1)), Some(Fx::ZERO));

        // A zero-length ray outside rock crosses nothing.
        assert_eq!(d.raycast(at(1, 1), at(1, 1)), None);
    }

    #[test]
    fn a_ray_that_leaves_the_grid_is_stopped_by_the_outside() {
        let d = parse(&["...", "...", "..."]);
        assert!(d.raycast(at(1, 1), Vec2::from_ints(9, 1)).is_some());
    }

    #[test]
    fn a_walk_is_clear_only_when_the_body_fits_the_whole_way() {
        //   0123456
        let d = parse(&[
            "#######", // 0
            "#.....#", // 1
            "###.###", // 2  a one-tile doorway at x = 3
            "#.....#", // 3
            "#######", // 4
        ]);
        let thin = Fx::from_ratio(30, 100);
        let fat = Fx::from_ratio(70, 100);
        let above = at(3, 1);
        let below = at(3, 3);
        assert!(d.is_walk_clear(above, below, thin), "a Skitterer fits");
        assert!(!d.is_walk_clear(above, below, fat), "a Brute does not");
        // And no body walks through the masonry beside the door.
        assert!(!d.is_walk_clear(at(1, 1), at(1, 3), thin));
    }

    // ------------------------------------------------------------------ sight

    #[test]
    fn sight_is_stopped_by_one_tile_of_rock() {
        //  0123456
        let d = parse(&[
            "#######", // 0
            "#..#..#", // 1  a pillar at x = 3
            "#.....#", // 2  and the corridor that goes round it
            "#######", // 3
        ]);
        // Straight through the pillar, both ways: one tile of rock is enough,
        // and it is enough whichever end the ray starts from.
        assert!(!d.sees(at(1, 1), at(4, 1)));
        assert!(!d.sees(at(4, 1), at(1, 1)));
        // The same two columns, one row down, where the floor is continuous.
        assert!(d.sees(at(1, 2), at(4, 2)));
        assert!(d.sees(at(4, 2), at(1, 2)));
        // An eye inside the masonry sees nothing at all -- `raycast` reports
        // `Some(ZERO)` for a ray that begins in rock -- and a body always sees
        // the place it is standing.
        assert!(!d.sees(at(3, 1), at(1, 2)));
        assert!(d.sees(at(1, 1), at(1, 1)));
    }

    #[test]
    fn a_shut_door_blocks_sight() {
        //  0123456
        let mut d = parse(&[
            "#######", // 0
            "#..+..#", // 1  a doorway at x = 3
            "#######", // 2
        ]);
        // The whole affordability argument for making a door a tile value,
        // asserted rather than assumed: `solid` is `tile != OPEN`, so a shut
        // door is masonry to every one of these without a line of new code.
        assert!(d.solid(3, 1), "a shut door is not solid");
        assert!(!d.sees(at(1, 1), at(5, 1)));
        assert!(!d.is_walk_clear(at(1, 1), at(5, 1), Fx::from_ratio(30, 100)));
        let (from, to) = (at(1, 1), at(5, 1));
        let t = d.raycast(from, to).expect("the door is in the way");
        let landed = from + (to - from) * t;
        assert!(
            (landed.x - Fx::from_int(3)).abs() < Fx::from_ratio(1, 100),
            "the ray stopped at {landed:?} rather than at the jamb"
        );
        assert_eq!(d.open_count(), 4, "a shut door is not open floor");
        assert_eq!(d.floor_count(), 5, "and it is floor a door-opener can use");

        // Routing is the one predicate that disagrees, and only for a body
        // that can work one.
        assert!(d.passable_for_routing(3, 1, true));
        assert!(!d.passable_for_routing(3, 1, false));
        assert!(!d.passable_for_routing(0, 0, true), "a wall is still a wall");
        assert!(
            !d.passable_for_routing(-1, 1, true),
            "and so is the outside of the world"
        );

        let before = d.fingerprint();
        d.open_door(&[d.cell(3, 1).unwrap()]);
        assert!(!d.solid(3, 1));
        assert!(d.sees(at(1, 1), at(5, 1)), "an opened door is floor");
        assert_ne!(d.fingerprint(), before, "the digest did not follow the tiles");
        assert_eq!(
            d.fingerprint(),
            parse(&["#######", "#.....#", "#######"]).fingerprint(),
            "an opened door must be indistinguishable from the floor it became"
        );
        // The short-circuit `sees` and `clearance` are guarded by must not turn
        // off halfway through a level.
        assert!(d.carved());
        // Total: opening what is not a door, and what is not on the grid, are
        // both no-ops rather than panics.
        let unchanged = d.fingerprint();
        d.open_door(&[d.cell(0, 0).unwrap(), 99_999]);
        assert_eq!(d.fingerprint(), unchanged);
    }

    #[test]
    fn sight_is_free_on_an_uncarved_plan() {
        // The `LAB_HASH` guard, at the bottom of the stack. The test is not
        // "nothing is in the way" -- it is that the *tiles are never consulted*,
        // so the pairs below deliberately include points well outside the
        // extent, which `solid` reports as masonry and which every other method
        // in this file treats as such.
        let d = Dungeon::open(24, 16);
        assert!(!d.carved());
        let points = [
            Vec2::from_ints(1, 1),
            Vec2::from_ints(12, 8),
            Vec2::from_ints(23, 15),
            Vec2::from_ints(-5, -5),
            Vec2::from_ints(30, 20),
            Vec2::new(Fx::from_ratio(157, 100), Fx::from_ratio(-1, 10)),
        ];
        for from in points {
            for to in points {
                assert!(d.sees(from, to), "{from:?} could not see {to:?}");
            }
        }
    }

    #[test]
    fn visible_tiles_lights_the_wall_it_stops_at() {
        //  0123456789
        let d = parse(&[
            "##########", // 0
            "##########", // 1  two tiles of rock all round, so that "the face"
            "##......##", // 2  and "behind the face" are different tiles
            "##......##", // 3
            "##......##", // 4
            "##......##", // 5
            "##########", // 6
            "##########", // 7
        ]);
        let mut out = vec![0u8; d.cols() as usize * d.rows() as usize];
        let lit = |out: &[u8], tx: i32, ty: i32| out[d.cell(tx, ty).unwrap() as usize] == 1;
        d.visible_tiles(at(4, 3), Fx::from_int(8), &mut out);

        // Every floor tile in the room: it is one room and nothing is in the way.
        for ty in 2..=5 {
            for tx in 2..=7 {
                assert!(lit(&out, tx, ty), "floor ({tx}, {ty}) is dark");
            }
        }
        // The four faces the room is bounded by, on all four sides -- the two
        // that this scan reaches *after* the floor beside them matter as much as
        // the two it reaches before.
        for ty in 2..=5 {
            assert!(lit(&out, 1, ty), "the west face at (1, {ty}) is dark");
            assert!(lit(&out, 8, ty), "the east face at (8, {ty}) is dark");
        }
        for tx in 2..=7 {
            assert!(lit(&out, tx, 1), "the north face at ({tx}, 1) is dark");
            assert!(lit(&out, tx, 6), "the south face at ({tx}, 6) is dark");
        }
        // And the rock behind each of those faces is not lit. This is the half
        // that fails if a lit face is allowed to count as a lit neighbour: the
        // light would bleed one further tile south and east and not north or
        // west, which is a fog boundary of two different thicknesses.
        for ty in 2..=5 {
            assert!(!lit(&out, 0, ty), "light leaked west to (0, {ty})");
            assert!(!lit(&out, 9, ty), "light leaked east to (9, {ty})");
        }
        for tx in 2..=7 {
            assert!(!lit(&out, tx, 0), "light leaked north to ({tx}, 0)");
            assert!(!lit(&out, tx, 7), "light leaked south to ({tx}, 7)");
        }
        // A corner touches no floor at all, so it stays dark even though both
        // faces meeting it are lit.
        assert!(!lit(&out, 1, 1), "a corner with no floor beside it is lit");
        assert!(!lit(&out, 8, 6));
    }

    #[test]
    fn visible_tiles_cannot_see_into_a_sealed_room() {
        //  01234567
        let d = parse(&[
            "########", // 0
            "#..#...#", // 1  two chambers, sealed from each other by column 3
            "#..#...#", // 2
            "#..#...#", // 3
            "########", // 4
        ]);
        let mut out = vec![0u8; d.cols() as usize * d.rows() as usize];
        // A radius that comfortably covers the whole level, so the only thing
        // that can keep the far chamber dark is the rock between them.
        d.visible_tiles(at(1, 1), Fx::from_int(12), &mut out);
        let lit = |tx: i32, ty: i32| out[d.cell(tx, ty).unwrap() as usize] == 1;

        for ty in 1..=3 {
            for tx in 1..=2 {
                assert!(lit(tx, ty), "the near chamber's ({tx}, {ty}) is dark");
            }
            // The dividing wall is the face the light stops at, so it is lit --
            // from this side only, which is the whole point of the pass.
            assert!(lit(3, ty), "the dividing wall at (3, {ty}) is dark");
            for tx in 4..=6 {
                assert!(!lit(tx, ty), "saw ({tx}, {ty}) through a sealed wall");
            }
        }
    }

    #[test]
    fn visible_tiles_clears_what_it_is_given() {
        let d = parse(&[
            "#######", // 0
            "#..#..#", // 1
            "#..#..#", // 2
            "#######", // 3
        ]);
        let cells = d.cols() as usize * d.rows() as usize;
        // Dirty, and dirty with something other than `1` as well, so that a
        // clear that only zeroed the cells it was about to write would show.
        let mut out = vec![9u8; cells];
        d.visible_tiles(at(1, 1), Fx::ZERO, &mut out);

        assert_eq!(out[d.cell(1, 1).unwrap() as usize], 1, "its own tile");
        // A radius of zero reaches no other tile centre, so every open cell but
        // that one is back to zero -- including the ones the previous contents
        // claimed.
        assert_eq!(out[d.cell(2, 1).unwrap() as usize], 0);
        assert_eq!(out[d.cell(4, 2).unwrap() as usize], 0);
        for (cell, &v) in out.iter().enumerate() {
            assert!(v <= 1, "cell {cell} still carries the old contents: {v}");
        }

        // And a buffer shorter than the grid is clipped rather than refused:
        // this crate is driven from a `cdylib`, where a panic is not an error
        // report but a dead instance.
        let mut short = vec![9u8; 3];
        d.visible_tiles(at(4, 2), Fx::from_int(4), &mut short);
        assert_eq!(short, vec![0, 0, 0]);
    }

    // -------------------------------------------------------------- elevation

    /// A floor plan from [`parse`], lifted by a second picture: `0`..`9` is
    /// that many height steps and anything else is level.
    ///
    /// Two pictures of one room rather than a `Vec<i16>` beside a `Vec<u8>`,
    /// for [`parse`]'s reason -- a fixture whose *setup* has to be decoded
    /// before its assertion can be read is a test nobody rereads.
    fn sculpt(tiles: &[&str], heights: &[&str]) -> Dungeon {
        let flat = parse(tiles);
        let (cols, rows) = (flat.cols() as usize, flat.rows() as usize);
        let mut steps = Vec::with_capacity(cols * rows);
        for ty in 0..rows {
            for tx in 0..cols {
                let ch = heights
                    .get(ty)
                    .and_then(|row| row.as_bytes().get(tx))
                    .copied()
                    .unwrap_or(b'.');
                steps.push(if ch.is_ascii_digit() { (ch - b'0') as i16 } else { 0 });
            }
        }
        Dungeon::from_tiles_and_heights(flat.cols(), flat.rows(), flat.tiles().to_vec(), steps)
    }

    /// The fixture the routing digest is recorded over: rooms, a pillar, a
    /// corridor and a shut door, small enough to walk exhaustively.
    const BATTERY: [&str; 6] = [
        "##########",
        "#....#...#",
        "#.##.+.#.#",
        "#.#..#.#.#",
        "#....#...#",
        "##########",
    ];

    /// Every planar query this file answers, over one dungeon, as one digest.
    ///
    /// Recorded before elevation existed and asserted after. A hand-rolled
    /// reimplementation of the old rules would be a second copy of the thing
    /// under test and would agree with a wrong edit made in both places; a
    /// number recorded from a build that predates the change cannot.
    fn routing_digest(d: &Dungeon) -> u64 {
        let mut h = Hash64::new();
        let (cols, rows) = (d.cols() as i32, d.rows() as i32);
        let radii = [Fx::from_ratio(30, 100), Fx::from_ratio(70, 100)];
        for ty in -1..=rows {
            for tx in -1..=cols {
                h.write_bool(d.solid(tx, ty));
                h.write_u8(d.tile(tx, ty));
                h.write_bool(d.passable_for_routing(tx, ty, false));
                h.write_bool(d.passable_for_routing(tx, ty, true));
            }
        }
        // Off-centre, because a rule that only ever sees a tile centre is a
        // rule half tested.
        let points: Vec<Vec2> = (0..rows)
            .step_by(7)
            .flat_map(|ty| {
                (0..cols).step_by(7).map(move |tx| {
                    Vec2::new(
                        Fx::from_int(tx) + Fx::from_ratio(37, 100),
                        Fx::from_int(ty) + Fx::from_ratio(61, 100),
                    )
                })
            })
            .collect();
        for &p in &points {
            for dir in Cardinal::ALL {
                h.write_i32(d.clearance(p, dir).raw());
            }
            let (tx, ty) = Dungeon::tile_of(p);
            for r in radii {
                h.write_bool(d.is_clear(p, r));
                let near = d.nearest_clear(p, r);
                h.write_i32(near.x.raw());
                h.write_i32(near.y.raw());
                for dir in Cardinal::ALL {
                    let (dx, dy) = dir.step();
                    match d.push_out(p, r, tx + dx, ty + dy) {
                        None => h.write_bool(false),
                        Some((to, n)) => {
                            h.write_bool(true);
                            h.write_i32(to.x.raw());
                            h.write_i32(to.y.raw());
                            h.write_i32(n.x.raw());
                            h.write_i32(n.y.raw());
                        }
                    }
                }
            }
        }
        for (i, &a) in points.iter().enumerate() {
            for &b in points.iter().skip(i) {
                h.write_bool(d.sees(a, b));
                match d.raycast(a, b) {
                    None => h.write_bool(false),
                    Some(t) => {
                        h.write_bool(true);
                        h.write_i32(t.raw());
                    }
                }
                for r in radii {
                    h.write_bool(d.is_walk_clear(a, b, r));
                }
            }
        }
        let (mut dist, mut queue) = (Vec::new(), Vec::new());
        let seeds: Vec<u32> = (0..cols * rows).step_by(97).map(|c| c as u32).collect();
        for opens in [false, true] {
            d.distances_for(&seeds, opens, &mut dist, &mut queue);
            for &v in dist.iter() {
                h.write_u16(v);
            }
        }
        let mut out = vec![0u8; (cols * rows) as usize];
        d.visible_tiles(points[points.len() / 2], Fx::from_int(12), &mut out);
        h.write_bytes(&out);
        h.finish()
    }

    #[test]
    fn one_height_step_is_between_a_hand_and_a_stair_riser() {
        // **Both ends, and neither is decoration.** A bound on one side is
        // satisfied by a range wider than the decision: `>= a hand` alone is
        // happy with a quantum half a body tall, and `<= a riser` alone is
        // happy with one nobody can see. This repository has shipped two
        // one-sided bounds and both looked like coverage.
        //
        // A world unit is a metre, read off the shipped roster:
        // `fighter_anatomy` stands 9/5 with a hand 1/10 across.
        let riser = Fx::from_ratio(18, 100).raw();
        let hand = Fx::from_ratio(1, 10).raw();
        assert!(
            TERRAIN_HEIGHT_RAW_UNIT <= riser,
            "a quantum coarser than a stair riser cannot express a stair at all"
        );
        assert!(
            TERRAIN_HEIGHT_RAW_UNIT >= hand,
            "a rise nobody can see must not be able to turn a route around"
        );
        // The exactness claim `Dungeon::height_at` makes, as arithmetic: the
        // tallest value the `i16` field can hold, times the unit, is nowhere
        // near saturating an `i32`.
        let tallest = i16::MAX as i32 * TERRAIN_HEIGHT_RAW_UNIT;
        assert!(tallest > 0 && tallest < i32::MAX / 4, "raw {tallest}");
    }

    #[test]
    fn the_step_up_admits_a_stair_and_refuses_a_knee_high_ledge() {
        // Below: two height steps, which is one tread of an ordinary flight. A
        // step-up under that makes a staircase a cliff, and one of a single
        // step leaves no rise that is neither level nor impassable -- the
        // height field would be a second wall grid.
        assert!(
            TERRAIN_STEP_UP_RAW >= 2 * TERRAIN_HEIGHT_RAW_UNIT,
            "a staircase must be ground rather than a cliff"
        );
        // Above: the knee of a 1.8-unit body, a shade over half a unit. At or
        // past that a body is climbing, and a ledge a walking body strolls up
        // is not a ledge.
        assert!(
            TERRAIN_STEP_UP_RAW < ONE_RAW / 2,
            "nothing above the knee may be entered at a walk"
        );
        // And it names a rise the grid can express. A threshold between two
        // representable rises admits and refuses exactly the set the multiple
        // below it does, while claiming to be somewhere else.
        assert_eq!(TERRAIN_STEP_UP_RAW % TERRAIN_HEIGHT_RAW_UNIT, 0);
    }

    #[test]
    fn a_flat_dungeon_fingerprints_exactly_as_it_did_before_heights_existed() {
        // **The load-bearing test of this session.** Every value below was
        // recorded by running this file's digest on a build that predated
        // `heights`, and is asserted rather than recomputed: a test that
        // re-derives its expectation from the code under test agrees with any
        // code at all.
        //
        // If one of these moves, the `sculpted` short-circuit is wrong and the
        // session stops rather than re-records -- `ROOM_HASH`, `BATTLE_HASH`,
        // `SWAP_HASH`, `BOW_HASH`, `LAB_HASH` and `GOLDEN_STATE_HASH` are all
        // downstream of this digest.
        assert_eq!(Dungeon::open(24, 16).fingerprint(), 0xacc3_5e42_5d5c_221d);
        assert_eq!(
            Dungeon::open(crate::DUNGEON_COLS, crate::DUNGEON_ROWS).fingerprint(),
            0x4752_15a4_2757_c084
        );
        assert_eq!(
            parse(&["#######", "#..#..#", "#..#..#", "#######"]).fingerprint(),
            0x0576_03a1_17d8_ff72
        );
        assert_eq!(
            parse(&["#######", "#..+..#", "#######"]).fingerprint(),
            0xe72a_7271_edc5_27a1
        );
        // The floor plan the game actually ships, at the extent it ships at.
        assert_eq!(level(0, 0).dungeon.fingerprint(), 0x081e_2419_b20d_9d47);
        assert_eq!(level(7, 3).dungeon.fingerprint(), 0x4dbf_15bc_d8ae_19e0);

        // And the one mutator, which re-digests in place. Opening every door on
        // a level has to land where it landed before too, or `open_door` and
        // the constructors have drifted apart -- which is the failure the
        // shared `Dungeon::digest` exists to make impossible and this asserts
        // rather than trusts.
        let mut l = level(11, 0);
        assert_eq!(l.dungeon.fingerprint(), 0xf19f_0766_3d8c_a952);
        let doors = l.doors.clone();
        for door in &doors {
            l.dungeon.open_door(door.cells());
        }
        assert_eq!(l.dungeon.fingerprint(), 0xe2f1_d408_c8a3_6c7c);
    }

    #[test]
    fn a_sculpted_dungeon_fingerprints_differently_from_the_same_tiles_flat() {
        let tiles = ["#####", "#...#", "#...#", "#####"];
        let flat = parse(&tiles);
        let hill = sculpt(&tiles, &[".....", ".....", ".1...", "....."]);
        assert!(!flat.sculpted());
        assert!(hill.sculpted());
        assert_ne!(flat.fingerprint(), hill.fingerprint());
        // The grids are byte-identical, so it is the heights the digest saw and
        // nothing else.
        assert_eq!(flat.tiles(), hill.tiles());

        // Every cell, and not a summary of them: a different height and the
        // same height somewhere else are both different levels.
        let higher = sculpt(&tiles, &[".....", ".....", ".2...", "....."]);
        let elsewhere = sculpt(&tiles, &[".....", ".....", "..1..", "....."]);
        assert_ne!(hill.fingerprint(), higher.fingerprint());
        assert_ne!(hill.fingerprint(), elsewhere.fingerprint());

        // A pit is not its own mirror image. `sculpt` cannot draw a negative
        // step, which is exactly why this one is built by hand: it is what
        // `write_u16(step as u16)` has to preserve.
        let mut steps = vec![0i16; 20];
        steps[2 * 5 + 1] = -1;
        let pit = Dungeon::from_tiles_and_heights(5, 4, flat.tiles().to_vec(), steps);
        assert!(pit.sculpted());
        assert_ne!(pit.fingerprint(), hill.fingerprint());
        assert_ne!(pit.fingerprint(), flat.fingerprint());
    }

    #[test]
    fn a_sculpted_dungeon_of_all_zero_heights_digests_as_a_flat_one() {
        // The property that stops a driver moving a golden hash by asking for
        // elevation it does not use: `sculpted` is read off the heights and
        // never off the caller's intent.
        let tiles = ["#####", "#.+.#", "#...#", "#####"];
        let flat = parse(&tiles);
        let asked = Dungeon::from_tiles_and_heights(5, 4, flat.tiles().to_vec(), vec![0i16; 20]);
        assert!(!asked.sculpted());
        assert_eq!(asked.fingerprint(), flat.fingerprint());
        assert_eq!(asked, flat, "and the same value, not merely the same digest");

        // A short `heights` is padded flat rather than refused, so a dungeon
        // that says nothing about height is the same dungeon too.
        let silent = Dungeon::from_tiles_and_heights(5, 4, flat.tiles().to_vec(), Vec::new());
        assert_eq!(silent, flat);

        // Including through the mutator, which is where two digest paths would
        // show up as a divergence that only appears half a minute into a level.
        let (mut a, mut b) = (asked, flat);
        let cell = a.cell(2, 1).unwrap();
        a.open_door(&[cell]);
        b.open_door(&[cell]);
        assert_eq!(a.fingerprint(), b.fingerprint());
        assert_eq!(a, b);
    }

    #[test]
    fn a_rise_above_the_step_up_is_impassable_uphill_and_passable_down() {
        // A staircase from x = 1 to x = 4, then a plateau four steps up, then a
        // long drop back to the floor. Nothing but the border is solid, so
        // every refusal below comes from the height alone.
        //
        //  x:  01234567
        let d = sculpt(
            &["########", "#......#", "########"],
            &["........", ".012370.", "........"],
        );
        let (low, one, three) = ((1, 1), (2, 1), (4, 1));
        let (cliff, far) = ((5, 1), (6, 1));

        // One step at a time is a staircase and a staircase is ground.
        assert!(d.passable_between(low, one));
        assert!(d.passable_between(one, (3, 1)));
        assert!(d.passable_between((3, 1), three));
        // Three steps at once is exactly the step-up, and it is admitted: the
        // constant names the rise a body **may** enter, not the first it may
        // not.
        assert!(d.passable_between(low, three));
        // Four is one over. A wall from below...
        assert!(!d.passable_between(three, cliff));
        assert!(!d.passable_between(low, cliff));
        assert!(!d.passable_between(far, cliff));
        // ...and a drop from above, which is the whole of "a ledge is one-way".
        assert!(d.passable_between(cliff, three));
        assert!(d.passable_between(cliff, far));
        assert!(d.passable_between(cliff, low));
        // Masonry is not a short cliff: it refuses in both directions however
        // the heights fall, and so does the outside of the world.
        assert!(!d.passable_between(low, (0, 1)));
        assert!(!d.passable_between(cliff, (7, 1)));
        assert!(!d.passable_between(low, (1, -1)));

        // The same rule reaches routing, which is what makes a cliff a boundary
        // of the level rather than a decoration on it. Seeded on the plateau
        // every tile is reachable, because you can jump down; seeded on the
        // floor the plateau and everything behind it is not.
        let (mut dist, mut queue) = (Vec::new(), Vec::new());
        d.distances(&[d.cell(5, 1).unwrap()], &mut dist, &mut queue);
        assert_ne!(dist[d.cell(1, 1).unwrap() as usize], u16::MAX);
        assert_ne!(dist[d.cell(6, 1).unwrap() as usize], u16::MAX);
        d.distances(&[d.cell(1, 1).unwrap()], &mut dist, &mut queue);
        assert_eq!(
            dist[d.cell(5, 1).unwrap() as usize],
            u16::MAX,
            "a cliff a body cannot climb is still on its route"
        );
        assert_eq!(dist[d.cell(6, 1).unwrap() as usize], u16::MAX);
    }

    #[test]
    fn a_tall_tile_blocks_sight_that_the_same_tile_flat_does_not() {
        //   0123456
        let tiles = ["#######", "#.....#", "#######"];
        let flat = parse(&tiles);
        let (eye, far) = (at(1, 1), at(5, 1));
        assert!(flat.sees(eye, far), "premise: flat, nothing is in the way");

        // Three steps is the step-up exactly: ground a body may walk onto is
        // ground it may see over, which is the same number saying both things.
        let ramp = sculpt(&tiles, &[".......", "...3...", "......."]);
        assert!(ramp.sees(eye, far), "a rise a body may step onto is not a wall");

        // Four steps is one over, and it occludes exactly as masonry does.
        let wall = sculpt(&tiles, &[".......", "...4...", "......."]);
        assert!(!wall.sees(eye, far));
        assert!(!wall.sees(far, eye), "and from the other side too");
        assert_eq!(
            wall.tiles(),
            flat.tiles(),
            "the grids are identical, so it is the height that stopped the ray"
        );
        // A walk across it is refused for the same reason.
        assert!(!wall.is_walk_clear(eye, far, Fx::from_ratio(30, 100)));

        // The ray stops at the cliff face rather than somewhere past it.
        let t = wall.raycast(eye, far).expect("the plateau is in the way");
        let landed = eye + (far - eye) * t;
        assert!(
            (landed.x - Fx::from_int(3)).abs() < Fx::from_ratio(1, 100),
            "the ray stopped at {landed:?} rather than at the face"
        );

        // A tile never occludes itself, and a body on the plateau sees the
        // floor below it: the line the ray carries joins the two floors, so it
        // rides up with the plateau you are standing on.
        assert!(wall.sees(at(3, 1), at(3, 1)));
        assert!(wall.sees(at(3, 1), far));
        assert!(wall.sees(far, at(3, 1)), "and the top of a cliff is visible from under it");

        // Fog agrees with sight, because it is the same ray: the tiles behind
        // the plateau are dark and the plateau itself is not.
        let mut out = vec![0u8; wall.cols() as usize * wall.rows() as usize];
        wall.visible_tiles(eye, Fx::from_int(8), &mut out);
        assert_eq!(out[wall.cell(3, 1).unwrap() as usize], 1);
        assert_eq!(out[wall.cell(4, 1).unwrap() as usize], 0);
        assert_eq!(out[wall.cell(5, 1).unwrap() as usize], 0);
    }

    #[test]
    fn a_floor_is_a_step_function_with_no_slope_inside_a_tile() {
        let d = sculpt(&["####", "#..#", "####"], &["....", ".02.", "...."]);
        let two = Fx::from_raw(2 * TERRAIN_HEIGHT_RAW_UNIT);
        let y = Fx::from_ratio(150, 100);
        // Every point of a tile reports that tile's plateau, the point a hair
        // inside its far edge included. There is nothing to interpolate, which
        // is the whole reason no sample here is a divide.
        for hundredths in [1, 50, 99] {
            let x = Fx::from_int(2) + Fx::from_ratio(hundredths, 100);
            assert_eq!(d.height_at(Vec2::new(x, y)), two);
        }
        assert_eq!(d.height_at(at(1, 1)), Fx::ZERO);
        // The discontinuity sits exactly where `tile_of` floors, so a point on
        // the boundary belongs to the tile it is the low edge of.
        assert_eq!(d.height_at(Vec2::new(Fx::from_int(2), y)), two);
        assert_eq!(
            d.height_at(Vec2::new(Fx::from_int(2) - Fx::EPSILON, y)),
            Fx::ZERO
        );
        // A flat dungeon answers zero without reading a cell -- including well
        // outside its own extent, which every other method here calls masonry.
        let open = Dungeon::open(4, 4);
        assert_eq!(open.height_at(at(2, 2)), Fx::ZERO);
        assert_eq!(open.height_at(Vec2::from_ints(-9, 40)), Fx::ZERO);
        assert_eq!(d.height_at(Vec2::from_ints(-9, 40)), Fx::ZERO);
    }

    #[test]
    fn a_cliff_is_masonry_from_below_and_a_ledge_from_above() {
        // Column 3 is four steps up. Nothing inside the border is solid, so
        // every refusal below is the height doing masonry's job.
        let d = sculpt(
            &["######", "#....#", "#....#", "######"],
            &["......", "...4..", "...4..", "......"],
        );
        let r = Fx::from_ratio(45, 100);
        let y = Fx::from_ratio(150, 100);
        let under = Vec2::new(Fx::from_ratio(280, 100), y);
        let atop = Vec2::new(Fx::from_ratio(320, 100), y);

        // A body beside the cliff overlaps it and does not fit...
        assert!(!d.is_clear(under, r));
        // ...and the same circle on top of it does, because from up there the
        // neighbour is a drop.
        assert!(d.is_clear(atop, r));

        // `clearance` reports the face as a wall from below and does not report
        // it at all from above: a ledge is not something to steer away from.
        assert_eq!(d.clearance(at(2, 1), Cardinal::PosX), Fx::from_ratio(50, 100));
        assert_eq!(d.clearance(at(3, 1), Cardinal::NegX), Fx::from_ratio(250, 100));

        // And the collision resolver pushes out of a cliff exactly as it pushes
        // out of a wall, along the face normal and by the overlap.
        let (to, n) = d.push_out(under, r, 3, 1).expect("a cliff must push like a wall");
        assert_eq!(n, Vec2::new(-Fx::ONE, Fx::ZERO));
        assert_eq!(to.y, y, "a face push is cardinal, so it slides along the cliff");
        // 2.80 pushed back to 3.00 - 0.45, to a hundredth rather than to the
        // raw: `normalize` and `length` both truncate, so the point lands a hair
        // inside where the algebra says. That is the safe direction and the
        // reason the flat tests measure this the same way.
        assert!(
            (to.x - Fx::from_ratio(255, 100)).abs() < Fx::from_ratio(1, 100),
            "pushed to {to:?}"
        );
        assert!(d.is_clear(to, r), "and the body fits where it was put");
        // From on top there is nothing to be pushed out of.
        assert_eq!(d.push_out(atop, r, 2, 1), None);
    }

    #[test]
    fn every_routing_query_on_a_flat_dungeon_answers_what_it_answered_before() {
        // `routing_digest` walks `solid`, `tile`, `passable_for_routing`,
        // `clearance`, `is_clear`, `nearest_clear`, `push_out`, `sees`,
        // `raycast`, `is_walk_clear`, `distances_for` and `visible_tiles` over
        // one dungeon. All three numbers were recorded on a build that predated
        // `heights`.
        assert_eq!(routing_digest(&Dungeon::open(24, 16)), 0xb743_4318_660c_18c9);
        assert_eq!(routing_digest(&level(3, 1).dungeon), 0x1807_cc4e_1208_8805);
        assert_eq!(routing_digest(&parse(&BATTERY)), 0x824e_e2ff_5d5f_ea0b);

        // And the two directional predicates degenerate, which is why every
        // existing caller of them is inert rather than merely unchanged.
        let d = level(3, 1).dungeon;
        for ty in -1..=d.rows() as i32 {
            for tx in -1..=d.cols() as i32 {
                for dir in Cardinal::ALL {
                    let (dx, dy) = dir.step();
                    let to = (tx + dx, ty + dy);
                    assert_eq!(d.passable_between((tx, ty), to), !d.solid(to.0, to.1));
                    for opens in [false, true] {
                        assert_eq!(
                            d.passable_for_routing_between((tx, ty), to, opens),
                            d.passable_for_routing(to.0, to.1, opens)
                        );
                    }
                }
            }
        }
        // Nothing generated is sculpted, and that is what makes every golden
        // unreachable from this session rather than merely unmoved by it.
        for seed in 0..8u64 {
            assert!(!level(seed, 1).dungeon.sculpted());
        }
    }

    // ------------------------------------------------------------ generation

    /// The roster's widest body. Every placement is validated against it, so
    /// every test here asks about it.
    const BRUTE: Fx = Fx::from_ratio(70, 100);

    /// Carved at the extent a level actually is, so the tests below -- and in
    /// particular [`every_placement_clears_the_widest_body`] -- ask about the
    /// shipped configuration rather than about a size nothing builds any more.
    fn level(seed: u64, depth: u32) -> Level {
        Dungeon::generate(crate::DUNGEON_COLS, crate::DUNGEON_ROWS, seed, depth, 6, BRUTE)
    }

    /// The four sides of a room's ring, as `(origin, step, length)`. The tiles
    /// that share a face with the room and are therefore the only ways into it.
    fn ring(room: Rect) -> [(i32, i32, i32, i32, i32); 4] {
        [
            (room.x, room.y - 1, 1, 0, room.w),
            (room.x, room.y + room.h, 1, 0, room.w),
            (room.x - 1, room.y, 0, 1, room.h),
            (room.x + room.w, room.y, 0, 1, room.h),
        ]
    }

    #[test]
    fn every_room_with_a_corridor_gets_a_doorway() {
        // Not every room, and the gap is the point rather than a shortfall. A
        // maximal run of floor in a room's ring is a doorway only if it is a
        // *corridor's* worth of floor: a run wider than `CORRIDOR` is two
        // corridors that have merged into a mouth, and a run lying entirely
        // beyond the side is a corridor going past the room rather than into
        // it. Both are left as floor, because a doorway that seals nothing is
        // worse than none.
        //
        // What is asserted is the implication in the direction that matters --
        // a room with a corridor-shaped entrance has a door in it -- plus a
        // floor on how often that happens, so a placement rule that quietly
        // stopped firing could not pass this by refusing everything.
        let mut with_a_door = 0;
        let mut rooms = 0;
        for seed in 0..40u64 {
            for depth in 0..2 {
                let l = level(seed, depth);
                let d = &l.dungeon;
                for &room in &l.rooms {
                    rooms += 1;
                    let mut door_here = false;
                    for (sx, sy, dx, dy, span) in ring(room) {
                        // Measured over the corners, exactly as the placement
                        // measures it.
                        let (sx, sy, span) = (sx - dx, sy - dy, span + 2);
                        let mut k = 0;
                        while k < span {
                            let open = |j: i32| d.tile(sx + dx * j, sy + dy * j) == OPEN;
                            let door = |j: i32| d.tile(sx + dx * j, sy + dy * j) == DOOR;
                            if door(k) {
                                door_here = true;
                            }
                            if !open(k) {
                                k += 1;
                                continue;
                            }
                            let (mut lo, mut hi) = (k, k);
                            while open(lo - 1) {
                                lo -= 1;
                            }
                            while open(hi + 1) {
                                hi += 1;
                            }
                            assert!(
                                lo < 0
                                    || hi >= span
                                    || hi - lo >= CORRIDOR
                                    || hi < 1
                                    || lo > span - 2,
                                "seed {seed} depth {depth}: a corridor-shaped run of \
                                 {} at ({}, {}) was left open",
                                hi - lo + 1,
                                sx + dx * lo,
                                sy + dy * lo
                            );
                            k = hi + 1;
                        }
                    }
                    with_a_door += usize::from(door_here);
                }
            }
        }
        // Measured at 79% of rooms over this sweep. Two thirds is a floor with
        // room under it, not the number itself.
        assert!(
            with_a_door * 3 > rooms * 2,
            "only {with_a_door} of {rooms} rooms got a doorway"
        );
    }

    #[test]
    fn a_doorway_is_the_full_corridor_width() {
        // `CORRIDOR` is 3 because a two-wide passage plugs -- a Brute and a
        // Fighter walking opposite ways cannot pass in one -- and a doorway is
        // the one place on a level where every route converges. A doorway
        // narrower than the corridor it sits in would also seal nothing, since
        // the tiles beside it would stay floor.
        for seed in 0..40u64 {
            for depth in 0..2 {
                let l = level(seed, depth);
                assert!(!l.doors.is_empty(), "seed {seed} depth {depth}: no doors");
                for door in &l.doors {
                    assert_eq!(
                        door.len as i32, CORRIDOR,
                        "seed {seed} depth {depth}: a doorway {} tiles wide",
                        door.len
                    );
                    assert_eq!(door.cells().len(), CORRIDOR as usize);
                    // Straight, contiguous, and every tile of it actually a
                    // door: the run is what opens together, so a gap in it
                    // would be a doorway that opens somewhere else too.
                    let step = door.cells()[1] as i64 - door.cells()[0] as i64;
                    assert!(step == 1 || step == l.dungeon.cols() as i64);
                    for (n, &cell) in door.cells().iter().enumerate() {
                        assert_eq!(cell as i64, door.cells()[0] as i64 + step * n as i64);
                        let (tx, ty) = l.dungeon.tile_at(cell);
                        assert_eq!(l.dungeon.tile(tx, ty), DOOR);
                    }
                }
                // And the grouping the level carries is the grouping its grid
                // holds -- one rule, asked twice.
                assert_eq!(l.doors, l.dungeon.doorways());
            }
        }
    }

    #[test]
    fn a_generated_level_is_connected_through_its_doors() {
        // **The trap this session is most likely to be got wrong by.** The
        // generator's own verify walks from room zero and fills in everything
        // it did not reach; run door-blind, it would strand every room behind a
        // door and the level would come out as one room.
        //
        // Both halves matter. The first is that a body which can open a door
        // reaches every tile. The second is that one which cannot does *not* --
        // if that never fired, the doors would be decoration and the first half
        // would be measuring nothing.
        let (mut dist, mut queue) = (Vec::new(), Vec::new());
        let mut penned = 0;
        for seed in 0..40u64 {
            for depth in 0..2 {
                let l = level(seed, depth);
                let d = &l.dungeon;
                let start = d.goal_cell(l.hero).expect("a level with no floor in it");
                d.distances_for(&[start], true, &mut dist, &mut queue);
                assert_eq!(
                    queue.len(),
                    d.floor_count(),
                    "seed {seed} depth {depth}: {} tiles stranded behind a doorway",
                    d.floor_count() - queue.len()
                );
                // And the way out is on the far side of the level, not merely
                // in the reachable part of it.
                assert_ne!(dist[d.goal_cell(l.portal).unwrap() as usize], u16::MAX);

                d.distances(&[start], &mut dist, &mut queue);
                penned += usize::from(queue.len() < d.open_count());
            }
        }
        assert_eq!(
            penned, 80,
            "a level with nothing behind a shut door has doors that do not shut anything"
        );
    }

    // ----------------------------------------------------------------- torches

    #[test]
    fn the_torch_pass_does_not_move_the_layout() {
        // **`world-07`'s whole acceptance criterion, and the only thing that
        // actually holds it.** A decoration that drew one number from the layout
        // stream would move every placement under it and re-record four browser
        // goldens to say that nothing had changed -- and the comment saying it
        // does not draw would still read exactly as it does now.
        //
        // The same seed, with the pass and with it stubbed out. Everything but
        // the torch list has to come out bit for bit identical, which includes
        // the tiles (so the rooms, the corridors, the doorways and the repair),
        // the hero, the way out, the monsters and the room list.
        for seed in 0..24u64 {
            for depth in 0..2 {
                let lit = Dungeon::generate_within(
                    crate::DUNGEON_COLS,
                    crate::DUNGEON_ROWS,
                    seed,
                    depth,
                    6,
                    BRUTE,
                    true,
                );
                let dark = Dungeon::generate_within(
                    crate::DUNGEON_COLS,
                    crate::DUNGEON_ROWS,
                    seed,
                    depth,
                    6,
                    BRUTE,
                    false,
                );
                assert!(dark.torches.is_empty(), "the stub placed torches");
                assert!(!lit.torches.is_empty(), "seed {seed} depth {depth}: no torches");
                assert_eq!(lit.dungeon, dark.dungeon, "seed {seed} depth {depth}: tiles");
                assert_eq!(lit.hero, dark.hero, "seed {seed} depth {depth}: hero");
                assert_eq!(lit.portal, dark.portal, "seed {seed} depth {depth}: portal");
                assert_eq!(lit.monsters, dark.monsters, "seed {seed} depth {depth}: monsters");
                assert_eq!(lit.rooms, dark.rooms, "seed {seed} depth {depth}: rooms");
                assert_eq!(lit.doors, dark.doors, "seed {seed} depth {depth}: doors");
            }
        }
    }

    #[test]
    fn every_torch_hangs_on_real_masonry_and_all_four_room_faces_are_used() {
        // The two ways a torch can be wrong, and neither shows up in a picture
        // as anything but a missing light. A torch on a `-x` or `-y` face is
        // behind its own block in every frame; a torch whose face looks at
        // something other than open floor has no quad to sit on, because the
        // page emits a side face exactly where `!solid(neighbour)`. The third
        // is a torch on a *doorway*, which hangs in mid-air the moment somebody
        // opens it.
        let mut seen = [false; 4];
        for seed in 0..24u64 {
            for depth in 0..2 {
                let l = level(seed, depth);
                for t in &l.torches {
                    let (tx, ty) = (i32::from(t.tx), i32::from(t.ty));
                    seen[Cardinal::ALL.iter().position(|&face| face == t.face).unwrap()] = true;
                    assert_eq!(
                        l.dungeon.tile(tx, ty),
                        WALL,
                        "seed {seed}: a torch at ({tx}, {ty}) is not on masonry"
                    );
                    let (dx, dy) = t.face.step();
                    assert_eq!(
                        l.dungeon.tile(tx + dx, ty + dy),
                        OPEN,
                        "seed {seed}: the torch at ({tx}, {ty}) faces something other than floor"
                    );
                }
            }
        }
        assert_eq!(seen, [true; 4], "torch placement still depends on one camera diagonal");
    }

    #[test]
    fn almost_every_room_is_lit_and_no_torch_is_in_a_tunnel() {
        // "In" a room means on one of the two rings a torch can hang on -- the
        // north and the west -- since those are the only two the camera sees the
        // room-facing side of. Every torch is on one of those or on a doorway's
        // jamb, and there is no third place: a torch in a corridor is a torch in
        // a corridor, and the whole reason this pass is in the generator rather
        // than in the page is that it can tell the difference.
        //
        // **Not *every* room, and the exception is real rather than a rounding
        // allowance.** A room whose north and west rings are both open floor --
        // two corridors running the length of them, which happens because
        // corridors are carved before the doorways are cut and nothing stops one
        // grazing a room -- has no masonry facing the camera to hang anything
        // on. That is a room the generator has half eaten, and the answer is to
        // leave it dark rather than to nail a torch to something the player
        // cannot see. Measured over 24 seeds of 13 rooms: 1 room in ~300.
        let (mut rooms, mut lit_rooms) = (0usize, 0usize);
        for seed in 0..24u64 {
            let l = level(seed, 0);
            for room in &l.rooms {
                rooms += 1;
                let lit = l.torches.iter().any(|t| {
                    let (tx, ty) = (i32::from(t.tx), i32::from(t.ty));
                    let north = ty == room.y - 1 && tx >= room.x - 1 && tx <= room.x + room.w;
                    let west = tx == room.x - 1 && ty >= room.y - 1 && ty <= room.y + room.h;
                    let south = ty == room.y + room.h && tx >= room.x - 1 && tx <= room.x + room.w;
                    let east = tx == room.x + room.w && ty >= room.y - 1 && ty <= room.y + room.h;
                    north || west || south || east
                });
                lit_rooms += usize::from(lit);
            }
        }
        assert!(
            lit_rooms * 100 >= rooms * 97,
            "only {lit_rooms} of {rooms} rooms have a torch on them"
        );

        // And nothing is in a tunnel: every torch is either on a room's ring or
        // on a jamb -- masonry orthogonally beside a doorway tile, which is
        // where the page puts its posts and can be one tile past the end of the
        // ring where a corridor arrives at the very corner of a room.
        for seed in 0..24u64 {
            let l = level(seed, 0);
            let cols = i32::from(l.dungeon.cols());
            'torch: for t in &l.torches {
                let (tx, ty) = (i32::from(t.tx), i32::from(t.ty));
                for room in &l.rooms {
                    let north = ty == room.y - 1 && tx >= room.x - 1 && tx <= room.x + room.w;
                    let west = tx == room.x - 1 && ty >= room.y - 1 && ty <= room.y + room.h;
                    let south = ty == room.y + room.h && tx >= room.x - 1 && tx <= room.x + room.w;
                    let east = tx == room.x + room.w && ty >= room.y - 1 && ty <= room.y + room.h;
                    if north || west || south || east {
                        continue 'torch;
                    }
                }
                for door in &l.doors {
                    for &cell in door.cells() {
                        let (dx, dy) = ((cell as i32) % cols, (cell as i32) / cols);
                        if (dx - tx).abs() + (dy - ty).abs() == 1 {
                            continue 'torch;
                        }
                    }
                }
                panic!("seed {seed}: a torch at ({tx}, {ty}) is out in the tunnels");
            }
        }
    }

    #[test]
    fn a_level_of_torches_fits_the_page_buffer() {
        // The number `crates/web`'s `FURNITURE_MAX` is sized against, measured
        // here rather than guessed there: torches and door tiles share one
        // buffer and a buffer that overflows drops furniture silently.
        let mut worst = 0usize;
        for seed in 0..60u64 {
            for depth in 0..3 {
                let l = level(seed, depth);
                let records = l.torches.len() + l.doors.iter().map(|d| d.cells().len()).sum::<usize>();
                worst = worst.max(records);
            }
        }
        assert!(
            worst < 400,
            "{worst} furniture records a level, against a 512-record buffer"
        );
    }

    #[test]
    fn generation_is_a_pure_function_of_its_seed_and_its_depth() {
        assert_eq!(level(7, 3), level(7, 3));
        assert_ne!(level(7, 3), level(8, 3));
        assert_ne!(
            level(7, 3),
            level(7, 4),
            "descending must change the floor plan, not only the label"
        );
    }

    #[test]
    fn every_open_tile_is_reachable_from_every_other() {
        // Through the doors, which is what "reachable" has meant since they
        // landed: a level is whole to a body that can open one. The half that
        // says it is *not* whole to a body that cannot is
        // [`a_generated_level_is_connected_through_its_doors`].
        let (mut dist, mut queue) = (Vec::new(), Vec::new());
        for seed in 0..60u64 {
            for depth in 0..4 {
                let level = level(seed, depth);
                let d = &level.dungeon;
                let first = (0..d.rows() as i32)
                    .flat_map(|ty| (0..d.cols() as i32).map(move |tx| (tx, ty)))
                    .find(|&(tx, ty)| !d.solid(tx, ty))
                    .expect("a level with no floor in it");
                d.distances_for(
                    &[d.cell(first.0, first.1).unwrap()],
                    true,
                    &mut dist,
                    &mut queue,
                );
                assert_eq!(
                    queue.len(),
                    d.floor_count(),
                    "seed {seed} depth {depth} stranded {} tiles",
                    d.floor_count() - queue.len()
                );
            }
        }
    }

    #[test]
    fn the_border_is_masonry() {
        for seed in 0..20u64 {
            let d = level(seed, 1).dungeon;
            for tx in 0..d.cols() as i32 {
                assert!(d.solid(tx, 0) && d.solid(tx, d.rows() as i32 - 1));
            }
            for ty in 0..d.rows() as i32 {
                assert!(d.solid(0, ty) && d.solid(d.cols() as i32 - 1, ty));
            }
        }
    }

    #[test]
    fn every_placement_clears_the_widest_body() {
        // **The test that catches a corridor one tile too narrow**, and the
        // most valuable one in this file. It asks about a Brute whatever is
        // actually placed, because the guarantee the generator makes is
        // "anything in the roster can stand here".
        for seed in 0..60u64 {
            for depth in 0..4 {
                let l = level(seed, depth);
                assert!(
                    l.dungeon.is_clear(l.hero, BRUTE),
                    "seed {seed} depth {depth}: the way in at {:?} is too tight",
                    l.hero
                );
                assert!(
                    l.dungeon.is_clear(l.portal, BRUTE),
                    "seed {seed} depth {depth}: the way out at {:?} is too tight",
                    l.portal
                );
                for at in &l.monsters {
                    assert!(
                        l.dungeon.is_clear(*at, BRUTE),
                        "seed {seed} depth {depth}: a monster at {at:?} is in the wall"
                    );
                }
            }
        }
    }

    #[test]
    fn a_brute_can_walk_from_the_way_in_to_the_way_out() {
        // Placements clearing is not the same claim as the level being
        // *passable*: a three-wide corridor with a one-tile corner passes the
        // placement test and traps a Brute at the bend, which is the mistake
        // `CORRIDOR` exists to avoid and the one nothing else here would catch.
        //
        // Asked over the cells a Brute can *stand* in rather than over the
        // route the plain search returns. The plain search is blind to width,
        // so it will happily run down the edge column of a three-wide corridor
        // -- a legitimate route for the body, which slides off the wall as it
        // goes, but not a polyline a Brute-sized circle fits along. Standing
        // room is the honest question, and the answer transfers: two adjacent
        // clear cells are a tile apart and a Brute is 1.4 across, so the two
        // discs overlap and their union already contains everything the body
        // sweeps between them.
        //
        // Asked with every door open, which is the level the corridors carved:
        // a shut door is masonry to `is_clear` and would make this a test of
        // where the doors are rather than of how wide the corners are. What
        // opening them cannot do is *widen* anything, so the question survives
        // intact.
        for seed in 0..40u64 {
            let mut l = level(seed, 2);
            for door in &l.doors {
                l.dungeon.open_door(door.cells());
            }
            let d = &l.dungeon;
            let (cols, rows) = (d.cols() as i32, d.rows() as i32);
            let roomy = |tx: i32, ty: i32| {
                tx >= 0
                    && ty >= 0
                    && tx < cols
                    && ty < rows
                    && d.is_clear(Dungeon::tile_centre(tx, ty), BRUTE)
            };

            let from = Dungeon::tile_of(l.hero);
            let to = Dungeon::tile_of(l.portal);
            assert!(roomy(from.0, from.1), "seed {seed}: no room at the way in");
            assert!(roomy(to.0, to.1), "seed {seed}: no room at the way out");

            let mut seen = vec![false; (cols * rows) as usize];
            let mut queue = vec![from];
            seen[(from.1 * cols + from.0) as usize] = true;
            let mut head = 0;
            while head < queue.len() {
                let (tx, ty) = queue[head];
                head += 1;
                for dir in Cardinal::ALL {
                    let (dx, dy) = dir.step();
                    let (nx, ny) = (tx + dx, ty + dy);
                    if !roomy(nx, ny) || seen[(ny * cols + nx) as usize] {
                        continue;
                    }
                    seen[(ny * cols + nx) as usize] = true;
                    queue.push((nx, ny));
                }
            }
            assert!(
                seen[(to.1 * cols + to.0) as usize],
                "seed {seed}: a Brute cannot reach the way out from the way in"
            );
        }
    }

    #[test]
    fn nothing_hostile_stands_in_the_room_you_arrive_in() {
        // A property of the room list rather than a distance test, which is
        // what makes it a guarantee instead of a tendency: monsters walk the
        // rooms from the second one.
        for seed in 0..40u64 {
            let l = level(seed, 3);
            for at in &l.monsters {
                assert!(
                    at.distance(l.hero) > Fx::from_int(4),
                    "seed {seed}: a monster at {at:?} opens the level in your face"
                );
            }
        }
    }

    #[test]
    fn monsters_come_in_clumps_and_never_in_the_first_room() {
        // Room zero is asked of the *room* now rather than of a distance.
        // `Level` publishes its room list since doors landed -- placement is
        // defined against a room's ring -- so the half that used to be a proxy
        // is the fact itself: no placement is inside `rooms[0]`.
        //
        // A clump is three placements mutually within a room's diagonal (rooms
        // are at most 10x8, so twelve units) *and* mutually walkable in a
        // straight line. That half stays a proxy, because which room a
        // placement came off is still not carried and the walk test is what
        // keeps three things strung along neighbouring rooms from reading as
        // one fight. The old one-per-room cycle could not produce this at any
        // seed.
        let mut clumped = 0;
        for seed in 0..200u64 {
            let l = level(seed, 3);
            let first = l.rooms[0];
            for at in &l.monsters {
                let (tx, ty) = Dungeon::tile_of(*at);
                assert!(
                    tx < first.x
                        || ty < first.y
                        || tx >= first.x + first.w
                        || ty >= first.y + first.h,
                    "seed {seed}: a monster at {at:?} opens the level in your face"
                );
            }
            let together = |a: Vec2, b: Vec2| {
                a.distance(b) <= Fx::from_int(12) && l.dungeon.is_walk_clear(a, b, BRUTE)
            };
            let m = &l.monsters;
            if (0..m.len()).any(|i| {
                (i + 1..m.len()).any(|j| {
                    (j + 1..m.len()).any(|k| {
                        together(m[i], m[j]) && together(m[j], m[k]) && together(m[i], m[k])
                    })
                })
            }) {
                clumped += 1;
            }
        }
        assert!(
            clumped > 0,
            "no seed in 200 put three things in one room: that is the cycle this replaced"
        );
    }

    #[test]
    fn the_way_out_is_a_walk_away_from_the_way_in() {
        // Not merely "somewhere else": the portal is the room furthest along
        // the floor, so a level is something you cross.
        let (mut dist, mut queue) = (Vec::new(), Vec::new());
        for seed in 0..40u64 {
            let l = level(seed, 1);
            let d = &l.dungeon;
            // Through the doors: the generator picks the exit room off a
            // door-opening walk, so measuring it with a door-blind one would be
            // asking a different question of the same answer.
            d.distances_for(
                &[d.goal_cell(l.hero).unwrap()],
                true,
                &mut dist,
                &mut queue,
            );
            let reach = dist[d.goal_cell(l.portal).unwrap() as usize];
            assert_ne!(reach, u16::MAX, "seed {seed}: the way out is unreachable");
            assert!(
                reach >= 12,
                "seed {seed}: the way out is {reach} tiles away, which is the same room"
            );
        }
    }

    #[test]
    fn a_level_carries_the_opposition_it_was_asked_for() {
        assert_eq!(Dungeon::generate(48, 32, 5, 0, 0, BRUTE).monsters.len(), 0);
        assert_eq!(Dungeon::generate(48, 32, 5, 0, 9, BRUTE).monsters.len(), 9);
    }

    #[test]
    fn an_uncarved_floor_plan_never_blocks_a_walk() {
        let d = Dungeon::open(24, 16);
        assert!(d.is_walk_clear(
            Vec2::from_ints(1, 1),
            Vec2::from_ints(23, 15),
            Fx::from_ratio(70, 100)
        ));
    }

    /// **Moved here from `world/navigation.rs` when the flow field was
    /// deleted.** It was written against `World`'s route rebuild and never
    /// needed one: every line of it is about [`Dungeon::distances`], which is
    /// the search, and this is that function's only caller.
    #[test]
    fn a_distance_field_reaches_every_open_tile_and_only_those() {
        let d = parse(&[
            "#######", //
            "#.....#",
            "#.###.#",
            "#.....#",
            "#######",
        ]);
        let mut dist = Vec::new();
        let mut queue = Vec::new();
        let seed = d.cell(1, 1).unwrap();
        d.distances(&[seed], &mut dist, &mut queue);

        let mut reached = 0;
        for ty in 0..d.rows() as i32 {
            for tx in 0..d.cols() as i32 {
                let at = dist[d.cell(tx, ty).unwrap() as usize];
                if d.solid(tx, ty) {
                    assert_eq!(at, u16::MAX, "masonry at ({tx}, {ty}) got a distance");
                } else {
                    assert_ne!(at, u16::MAX, "open ({tx}, {ty}) was never reached");
                    reached += 1;
                }
            }
        }
        assert_eq!(reached, d.open_count());
        assert_eq!(dist[seed as usize], 0);
        // Round the ring the long way or the short way, the far corner is five
        // tiles either side of the block.
        assert_eq!(dist[d.cell(5, 1).unwrap() as usize], 4);
        assert_eq!(dist[d.cell(1, 3).unwrap() as usize], 2);
    }
}
