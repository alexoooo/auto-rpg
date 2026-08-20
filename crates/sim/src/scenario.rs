use crate::dungeon::{Dungeon, Torch};
use crate::combat::spec::{combat_specs_into, UnitSpecV1, CombatSpecTableV1};
use crate::entity::{Body, Faction};
use crate::loadout::Loadout;
use crate::rules::Stats;
use fx::{Hash64, Rng, Vec2};

/// One unit's starting condition. Spawn positions are explicit, never rolled
/// at world-construction time: a [`Scenario`] is a complete, inspectable
/// description of a starting state, so [`World::new`] is a pure function of it.
///
/// [`World::new`]: crate::World::new
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct UnitSpec {
    pub kind: Body,
    pub faction: Faction,
    pub stats: Stats,
    /// What this unit brings to the fight, and which of it starts in hand
    /// (always the primary). A body no longer implies a weapon, so this is the
    /// other half of what used to be a single `kind`.
    pub loadout: Loadout,
    pub combat_spec: Option<UnitSpecV1>,
    pub spawn: Vec2,
}

/// The identity word [`Scenario::try_fingerprint`] writes to say which body
/// model a scenario is.
///
/// **A wire value rather than a discriminant, and frozen.** It was
/// `CombatModel::Embodied`'s `identity_word()` until the enum was deleted, and
/// it is `3` rather than `2` because the retired articulated model held `2` and
/// the retired legacy model held `1` -- two numbering schemes over the same
/// enum, which is exactly why the word was never `self as u16`. Four registry
/// rows fold it, `embodied-duel-v1`'s `0x1a1e8e74eecd55d5` among them, so
/// renumbering it to "match" [`SCENARIO_MODEL_TAG`] below would silently
/// re-record every pinned corpus that names an embodied fixture.
///
/// `codec.rs` recomputes the same fingerprint from the decoded bytes and reads
/// this same constant to do it. That is the whole reason it is a constant and
/// not two literals: the two copies disagreed once already, for the length of
/// one session, and an embodied replay decoded to a fingerprint its own
/// scenario did not have.
pub(crate) const SCENARIO_IDENTITY_WORD: u16 = 3;

/// The model tag [`scenario_v1_fields_into`] writes as the first byte of the
/// ScenarioV1 record, **which is also the replay record's model tag** because
/// `codec.rs` uses that function as its scenario-record writer.
///
/// A wire value rather than a discriminant, on [`SCENARIO_IDENTITY_WORD`]'s
/// terms and frozen for the same reason: it was `CombatModel::Embodied as u8`
/// while the enum existed, `#[repr(u8)]` pinned it at `2`, and every replay
/// anybody has kept carries that byte. `0` was Legacy and `1` was Articulated;
/// both are retired rather than reusable, and `codec.rs` goes on refusing them
/// by number -- see `RETIRED_ARTICULATED_MODEL_TAG` there.
pub(crate) const SCENARIO_MODEL_TAG: u8 = 2;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum ScenarioFingerprintError {
    NameTooLong { bytes: usize },
    InvalidCombatSpecs(crate::CombatSpecError),
}

/// The byte-level seam shared by ScenarioV1 identity and persistence.
///
/// This is deliberately smaller than `std::io::Write`: the sim has no I/O, and
/// the only two consumers are a fixed hash and an already-sized codec buffer.
pub(crate) trait ScenarioByteSink {
    fn write_bytes(&mut self, bytes: &[u8]);

    fn write_u8(&mut self, value: u8) {
        self.write_bytes(&[value]);
    }

    fn write_u16(&mut self, value: u16) {
        self.write_bytes(&value.to_le_bytes());
    }

    fn write_u32(&mut self, value: u32) {
        self.write_bytes(&value.to_le_bytes());
    }

    fn write_i32(&mut self, value: i32) {
        self.write_bytes(&value.to_le_bytes());
    }
}

impl ScenarioByteSink for Hash64 {
    fn write_bytes(&mut self, bytes: &[u8]) {
        Hash64::write_bytes(self, bytes);
    }
}

impl UnitSpec {
    /// Swaps in a different body, taking its stat sheet and its default loadout
    /// with it.
    ///
    /// Exists because `spec.kind = other` is a **half-change** now, and a quiet
    /// one. A body carries no weapon any more, so a bare assignment leaves the
    /// new body holding whatever the old one brought -- which is a legal thing
    /// to want and a terrible thing to get by accident. The first test that
    /// tried it put a Fighter's sword in a Skitterer's hand and then asserted
    /// things about "a Skitterer's knife".
    ///
    /// Override `stats` or `loadout` afterwards when that is the point.
    pub fn set_body(&mut self, body: Body) {
        self.kind = body;
        self.stats = body.base_stats();
        self.loadout = body.default_loadout();
    }
}

/// A generated level, in tiles and therefore in world units.
///
/// Twice the area of the 48x32 it was, holding the same 3:2 shape -- 3,060 tiles
/// against 1,536, which is 1.99x rather than a round two because the shape was
/// worth more than the round number. Eight times the 24x16 sandbox room, and at
/// eleven world units of camera height about four screens across and three down.
///
/// The old comment's second clause is the one under pressure here: crossing a
/// level is now more of the game than it was, which is what the extra doors and
/// the clustered opposition are for. If a floor starts to feel like walking,
/// that is the number to take back rather than the room count.
///
/// Fits `crates/web`'s `MAP_MAX` (96x64) with room to spare, so the tile buffer
/// and the ABI are untouched.
pub const DUNGEON_COLS: u16 = 68;
pub const DUNGEON_ROWS: u16 = 45;

/// How much opposition a level carries: this many, plus one per floor, up to a
/// cap.
///
/// The base doubled with the area, so twice the floor is not half the density.
/// The cap came down in exchange, so the top of the curve did not run away with
/// it: six on floor zero, ten from floor four on, and the last four floors of
/// that climb are the difference between an opening room and a deep one rather
/// than between a level and a swarm.
const MONSTERS_BASE: usize = 6;
const MONSTERS_PER_DEPTH_CAP: usize = 4;

/// RNG domain tag for who stands in the level, kept apart from the tag the
/// floor plan uses so that tuning one cannot move the other.
const ROSTER_STREAM: u64 = 1 << 61;

/// A fully specified match setup.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct Scenario {
    pub name: String,
    pub combat_specs: Option<CombatSpecTableV1>,
    /// Which ground exists. The playable area is `(0,0)..dungeon.extent()`, and
    /// on a [`Dungeon::open`] floor plan that is the whole rectangle -- which is
    /// what every scenario here but a generated one uses.
    pub dungeon: Dungeon,
    pub units: Vec<UnitSpec>,
    /// Where the way out stands, if this scenario has one.
    ///
    /// Carried but never acted on: the sim has no concept of a level, a depth
    /// or a run, and giving it one would put progression inside the fight
    /// simulator the lab drives headlessly. The generator is the only thing
    /// that knows which room is furthest from the start, so this is where that
    /// knowledge is written down; deciding what walking into it *means* belongs
    /// to whoever is driving. It reaches [`Scenario::fingerprint`] and
    /// deliberately never reaches `World::state_hash`.
    pub portal: Option<Vec2>,
    /// The torches, if this scenario was carved by the generator.
    ///
    /// Carried for exactly one reason: the page cannot tell a room wall from a
    /// corridor wall without redoing the generator's work, and the generator is
    /// the only thing that has ever known. Nothing below this line reads it --
    /// [`crate::World`] is never handed one -- so it is the *only* field here
    /// that reaches neither the sim nor [`Scenario::fingerprint`].
    ///
    /// **Deliberately out of the fingerprint, and the contrast with `portal` one
    /// field up is the whole argument.** A scenario whose way out has moved is a
    /// different scenario, because a driver acts on the way out and a replay
    /// played against a moved one would be walking somewhere else. A torch is
    /// paint: two scenarios that differ only in where the light is are the same
    /// fight, and a replay of one plays the other tick for tick. Putting it in
    /// the digest would make a decoration able to invalidate a replay -- and, in
    /// this repository, able to move a golden hash.
    pub torches: Vec<Torch>,
    /// Runs longer than this are declared a draw. Part of the scenario rather
    /// than the runner so a replay reproduces the same cutoff.
    pub max_ticks: u32,
}

/// The anatomy and equipment rows one body needs before a world with articulated
/// columns will take it.
///
/// **Two anatomies in the table against four bodies in the roster**: the brute's
/// frame for a Brute and the fighter's for everything else. Nothing finer is
/// measured, and guessing a third would be inventing a spec.
///
/// **The anatomy decides first and the request second**, which is a correction
/// rather than the obvious order. Asking about the guard first is invisible while
/// the only body walking in behind one is a Fighter, and wrong as soon as
/// anything else can: a Brute holding the fighter frame's sword and shield is a
/// construction `World::try_spawn` refuses outright under the exact law, because
/// `exact_lattice_for_unit` has no lattice for that mass against that equipment.
/// It made a browser spawn button answer `0` under one feature and not the other.
///
/// It lives here rather than in `crates/web` because two callers need it -- the
/// generated floor below and the browser's spawn path -- and a body dressed two
/// different ways is a body one of them cannot build.
pub fn equip_fixture_body(unit: &mut UnitSpec) {
    let anatomy = if matches!(unit.kind, Body::Brute) { 2 } else { 1 };
    let (equipment, loadout) = if anatomy == 2 {
        ([Some(3), None], crate::Loadout::single(crate::ActionKind::Club))
    } else if unit.loadout.secondary == Some(crate::ActionKind::Shield) {
        (
            [Some(1), Some(2)],
            crate::Loadout::pair(crate::ActionKind::Sword, crate::ActionKind::Shield),
        )
    } else {
        ([Some(1), None], crate::Loadout::single(crate::ActionKind::Sword))
    };
    unit.loadout = loadout;
    unit.combat_spec = Some(UnitSpecV1 { anatomy, equipment });
}

impl Scenario {
    /// The playable extent.
    ///
    /// A method and not a field, because a field beside `dungeon` is exactly the
    /// half-change [`UnitSpec::set_body`] exists to warn about: two places that
    /// can disagree about how big the room is, and nothing that notices when
    /// they do.
    pub fn arena(&self) -> Vec2 {
        self.dungeon.extent()
    }

    /// A generated dungeon, one level deep.
    ///
    /// Eight times the area of [`Scenario::room`] and carved into rooms and
    /// corridors, with the opposition already standing in it and a way out at
    /// the far end. `depth` is the level number: it seeds the layout alongside
    /// `seed`, so descending is a new floor plan rather than the same one
    /// again, and it is what the difficulty below reads.
    ///
    /// `hero` arrives whole -- body, stats and loadout -- because the point of
    /// a descent is that the character persists across it. Only its faction and
    /// its spawn are overwritten.
    ///
    /// `max_ticks` is unbounded for the reason [`Scenario::room`] gives: this
    /// is somewhere a player stands around in, not a fight on a clock. Nothing
    /// the lab iterates should be pointed at it.
    pub fn dungeon(seed: u64, depth: u32, hero: UnitSpec) -> Scenario {
        let count = MONSTERS_BASE + (depth as usize).min(MONSTERS_PER_DEPTH_CAP);
        let level = Dungeon::generate(
            DUNGEON_COLS,
            DUNGEON_ROWS,
            seed,
            depth,
            count,
            // The widest body in the roster, whatever is actually placed: the
            // guarantee worth having is "anything can stand here".
            Body::Brute.radius(),
        );

        // A stream of its own, so tuning the roster cannot move the floor plan
        // and re-carving the floor plan cannot move the roster.
        let mut rng = Rng::from_stream(seed, depth as u64, ROSTER_STREAM);
        let mut units = Vec::with_capacity(1 + level.monsters.len());
        let mut hero = hero;
        hero.faction = Faction::Heroes;
        hero.spawn = level.hero;
        units.push(hero);

        for at in &level.monsters {
            // Sixths rather than a branch on depth, so the draw happens either
            // way and the stream position does not depend on how deep you are.
            // The first floor is all Skitterers -- fast, fragile, and the right
            // thing to learn the controls against.
            let brutes = match depth {
                0 => 0,
                1 | 2 => 1,
                _ => 2,
            };
            let kind = if rng.chance(brutes, 6) {
                Body::Brute
            } else {
                Body::Skitterer
            };
            units.push(UnitSpec {
                kind,
                faction: Faction::Monsters,
                stats: kind.base_stats(),
                loadout: kind.default_loadout(),
                combat_spec: None,
                spawn: *at,
            });
        }

        for unit in &mut units {
            equip_fixture_body(unit);
        }

        Scenario {
            // **The model is in the name because it is in the fingerprint.**
            // `crates/web` used to rename this floor when it re-dressed it for a
            // model, and re-dressing is now this function's job, so the name is
            // too.
            name: format!("embodied-dungeon-{depth}"),
            combat_specs: Some(CombatSpecTableV1::fixtures()),
            dungeon: level.dungeon,
            portal: Some(level.portal),
            torches: level.torches,
            units,
            max_ticks: u32::MAX,
        }
    }

    /// Fingerprint, so a replay can refuse to play against a scenario that has
    /// been edited underneath it.
    pub fn fingerprint(&self) -> u64 {
        self.try_fingerprint()
            .expect("scenario construction and name must be valid")
    }

    /// The checked identity entry point used at persistence boundaries.
    pub fn try_fingerprint(&self) -> Result<u64, ScenarioFingerprintError> {
        crate::combat::spec::validate_construction(
            self.combat_specs.as_ref(),
            &self.units,
        ).map_err(ScenarioFingerprintError::InvalidCombatSpecs)?;
        let name_len = u16::try_from(self.name.len()).map_err(|_| {
            ScenarioFingerprintError::NameTooLong { bytes: self.name.len() }
        })?;
        let mut h = Hash64::new();
        h.write_bytes(b"ARPG-SCENARIO");
        // **The model *is* in the fingerprint**, contrary to what the embodied
        // plan asserted before this session measured it. It is written as a
        // frozen constant rather than read off the scenario because there is one
        // model left to ask about -- see [`SCENARIO_IDENTITY_WORD`], which
        // carries the argument for the number.
        h.write_u16(SCENARIO_IDENTITY_WORD);
        scenario_v1_fields_into(self, name_len, &mut h);
        // Unconditional now. The guard here was `has_articulated_columns`, and
        // it was never about a choice this fixture makes: the spec table is part
        // of a scenario's identity for every model that has one, and the only
        // model that did not was Legacy, whose scenarios cannot be built.
        combat_specs_into(self.combat_specs.as_ref(), &self.units, &mut h);
        Ok(h.finish())
    }

    /// The embodied control, and the fixture every other one here is built from.
    ///
    /// **Every field is inherited rather than chosen, and that is the whole of
    /// what this comment is for.** This body was `Scenario::articulated_duel`,
    /// which was itself written out rather than built from `Scenario::duel`
    /// after embodied session 10 deleted that Legacy constructor; `embodied_duel`
    /// then overwrote the name and the model word and changed nothing else. Both
    /// ancestors are gone and the arrangement is theirs: the `24x16` floor, the
    /// sixty-second clock, both bodies' kinds and stat sheets, both spawns and
    /// the fighter's default loadout are not free choices. Its fingerprint is
    /// `0x1a1e8e74eecd55d5` and that number is folded into
    /// `EMBODIED_CORPUS_DIGEST`, so the shape of this function is the shape of a
    /// pinned corpus, and a field edited here for looking tidier is a corpus no
    /// longer measuring the fight it was recorded against.
    ///
    /// `embodied_duel_v1_has_the_frozen_identity_and_placement` is what notices
    /// a slip. It writes the arrangement out itself rather than reading it back
    /// off this function, because a test that compares a fixture with itself is
    /// worse than no test.
    ///
    /// **The `embodied_` on this name and its three siblings survived session
    /// 06, which took that qualifier off everything else here.** It is not a
    /// model qualifier on a type: the `name` field two lines below is
    /// `"embodied-duel-v1"`, that string is folded into the fingerprint, and
    /// the fingerprint is pinned. The function name and the fixture identity
    /// are the same name, and a constructor that no longer spelled the fixture
    /// it builds would cost a reader the one link that is actually load-bearing
    /// here.
    pub fn embodied_duel() -> Scenario {
        Scenario {
            name: "embodied-duel-v1".to_string(),
            combat_specs: Some(CombatSpecTableV1::fixtures()),
            dungeon: Dungeon::open(24, 16),
            portal: None,
            torches: Vec::new(),
            max_ticks: 60 * 60,
            units: vec![
                UnitSpec {
                    kind: Body::Fighter,
                    faction: Faction::Heroes,
                    stats: Body::Fighter.base_stats(),
                    loadout: Body::Fighter.default_loadout(),
                    combat_spec: Some(UnitSpecV1 {
                        anatomy: 1,
                        equipment: [Some(1), Some(2)],
                    }),
                    spawn: Vec2::from_ints(7, 6),
                },
                UnitSpec {
                    kind: Body::Brute,
                    faction: Faction::Monsters,
                    stats: Body::Brute.base_stats(),
                    loadout: crate::Loadout::single(crate::ActionKind::Club),
                    combat_spec: Some(UnitSpecV1 {
                        anatomy: 2,
                        equipment: [Some(3), None],
                    }),
                    spawn: Vec2::from_ints(17, 10),
                },
            ],
        }
    }

    /// The embodied control with a hill in the middle of it.
    ///
    /// **The first sculpted scenario in the repository**, and it exists to make
    /// one measurement possible: a policy that seeks the high ground has to beat
    /// the same policy with that term switched off, on a corpus where there is
    /// high ground to seek. Session 04 gave the floor a height column and
    /// nothing has used it -- every shipped fixture is flat, `Dungeon::digest`
    /// short-circuits on `sculpted`, and that is exactly why no golden hash can
    /// see this fixture arrive.
    ///
    /// **Radial about the point the four spawn tiles are equidistant from, and
    /// that point is not the arena's centre.** The fighter stands at `(7, 6)`
    /// and the brute at `(17, 10)`, so their tile *centres* are `(7.5, 6.5)` and
    /// `(17.5, 10.5)` -- a pair symmetric about `(12.5, 8.5)` rather than about
    /// `(12, 8)`, because a tile is a unit square whose centre is half a tile
    /// past its index. Measuring from the arena's middle instead put one body
    /// two terraces up and the other on the flat, which the test below caught.
    ///
    /// Centred where it is, all four spawn tiles sit at `29` squared units from
    /// the top -- the two canonical ones and the two `lab` produces by
    /// reflecting `spawn.y` about `y = 8` for its second orientation. Neither
    /// body is nearer the hill in either arrangement, which is what makes a
    /// win rate here a fact about the policy rather than about the corner it
    /// started in.
    ///
    /// **Terraced in twos because three is the limit.** `TERRAIN_STEP_UP_RAW` is
    /// three height units, so every ring rises two from the one outside it:
    /// climbable from every direction with a unit of margin, and no ring is a
    /// ledge that can only be jumped down. The outermost ring ends at `25`, so
    /// the spawn tiles are outside it by four and the first tick is not a step
    /// onto a slope.
    pub fn embodied_slope() -> Scenario {
        let mut scenario = Scenario::embodied_duel();
        scenario.name = "embodied-slope-v1".to_string();
        let (cols, rows) = (scenario.dungeon.cols(), scenario.dungeon.rows());
        let heights = (0..rows as usize * cols as usize).map(|at| {
            // Integer tile indices against integer ring bounds, with no `Fx` in
            // sight. The half-tile the centre argument above turns on cancels on
            // both sides of the subtraction, so the arithmetic that decides a
            // terrace is exact and a boundary cannot fall a raw unit the wrong
            // way and put one tile of one ring on the wrong terrace --
            // asymmetrically, which is the one failure this fixture cannot have.
            let dx = (at % cols as usize) as i32 - 12;
            let dy = (at / cols as usize) as i32 - 8;
            match dx * dx + dy * dy {
                0..=3 => 6,
                4..=11 => 4,
                12..=24 => 2,
                _ => 0,
            }
        }).collect();
        let tiles = vec![crate::dungeon::OPEN; rows as usize * cols as usize];
        scenario.dungeon = Dungeon::from_tiles_and_heights(cols, rows, tiles, heights);
        scenario
    }

    /// Two knolls flanking the line the two bodies close along.
    ///
    /// **The fixture that can actually ask whether elevation is worth seeking**,
    /// and it exists because [`Scenario::embodied_slope`] provably cannot. That
    /// one puts the hill on the midpoint, which is fair and is the wrong
    /// experiment: a hill between two closing bodies is not a choice, because
    /// closing *is* climbing. Measured on it, both sides spent 55% of the fight
    /// off the flat whether or not they were trying to, and a policy carrying an
    /// elevation term gained 0.0036 of mean floor -- half a percent of the
    /// hill's entire relief -- while paying the tactical price of seeking it.
    /// The number that came out was about the fixture.
    ///
    /// Here the high ground is **perpendicular to the approach**, so taking it
    /// is a detour with a cost and a payoff rather than something that happens
    /// on the way. The two centres sit on the perpendicular bisector of the two
    /// spawns, one either side, at `(10, 13)` and `(14, 3)`.
    ///
    /// **Fair in both orientations, and by a different argument in each.**
    /// Canonically the spawns are `(7, 6)` and `(17, 10)`, and every one of the
    /// four spawn-to-knoll distances is `58` squared units: neither body is
    /// nearer either summit, so seeking one is a pure detour. `lab` produces its
    /// second orientation by reflecting `spawn.y` about `y = 8`, giving `(7, 10)`
    /// and `(17, 6)`; there each body is `18` from one knoll and `98` from the
    /// other, which is not equidistant but *is* symmetric -- the two have the
    /// same near knoll and the same far one. A single knoll cannot have both
    /// properties: the only point equidistant from all four spawns is the
    /// midpoint, which is the fixture this one replaces.
    ///
    /// **Terraced on the Chebyshev distance and not the Euclidean one, which is
    /// the correction a first draft needed.** Rings cut from squared distance
    /// let two *adjacent* tiles skip a terrace -- `(14, 1)` is 4 squared units
    /// from its summit and `(14, 0)` is 9, so they landed two terraces apart and
    /// the riser between them was 4 height steps against a `TERRAIN_STEP_UP_RAW`
    /// of 3. A wall, in the middle of a hill built to be climbed, and the
    /// enterability sweep in the test below is what found it. Chebyshev distance
    /// changes by at most one between neighbours, so a terrace per unit is a
    /// riser of exactly two everywhere by construction rather than by checking.
    ///
    /// The knoll is therefore a square stepped pyramid rather than a cone. That
    /// is a shape chosen for a guarantee and not for looks, which is worth
    /// saying because a rounder one is available and is wrong.
    ///
    /// Each reaches two tiles, so the two 5-by-5 blocks are disjoint, every
    /// spawn is seven tiles from both summits, and neither is clipped by the
    /// arena's edge -- a clipped knoll would make the near one in the mirrored
    /// orientation a different shape from the other body's, which is exactly the
    /// asymmetry this fixture is built to avoid.
    pub fn embodied_knolls() -> Scenario {
        let mut scenario = Scenario::embodied_duel();
        scenario.name = "embodied-knolls-v1".to_string();
        let (cols, rows) = (scenario.dungeon.cols(), scenario.dungeon.rows());
        let heights = (0..rows as usize * cols as usize).map(|at| {
            let (tx, ty) = ((at % cols as usize) as i32, (at / cols as usize) as i32);
            // The nearer of the two, so the terraces of one cannot be read as a
            // second ring of the other. The two blocks are disjoint -- the test
            // below asserts it -- but taking the minimum makes that a property
            // of the arithmetic rather than of the constants happening to be far
            // enough apart.
            let near = [(10, 13), (14, 3)].into_iter()
                .map(|(cx, cy): (i32, i32)| (tx - cx).abs().max((ty - cy).abs()))
                .min()
                .expect("two knolls");
            match near {
                0 => 6,
                1 => 4,
                2 => 2,
                _ => 0,
            }
        }).collect();
        let tiles = vec![crate::dungeon::OPEN; rows as usize * cols as usize];
        scenario.dungeon = Dungeon::from_tiles_and_heights(cols, rows, tiles, heights);
        scenario
    }

    /// One body starts on a ledge and the other on the floor.
    ///
    /// **This is the fixture that asks whether elevation is worth *having*,
    /// which is a different question from whether a policy can go and get it**,
    /// and separating the two is the only way to read the high-ground
    /// measurement at all. `embodied_knolls` puts the high ground where seeking
    /// it costs something and measures a policy that seeks it. If that policy
    /// loses, two very different things could be true: the term is bad, or
    /// height confers nothing and no term could have paid for it. Neither
    /// fixture can tell them apart, because in both the policy chooses where to
    /// stand.
    ///
    /// Here nobody chooses. The arena is a plateau on one side and a floor on
    /// the other, and the two spawns sit one on each. Run the **same** policy on
    /// both bodies and the only difference between them is the ground, so a win
    /// rate split by which spawn a body started on is elevation's own effect
    /// with the policy divided out.
    ///
    /// The ledge runs down `x`, not `y`, because `lab` mirrors an orientation by
    /// reflecting `spawn.y`: a ledge across `y` would put both bodies on the
    /// same side of it in one of the two orientations. Across `x` the spawns
    /// stay on opposite sides of it in both, and swapping the two *spawns*
    /// -- which the measurement does -- is what puts each anatomy on each side.
    ///
    /// Terraced in twos for [`Scenario::embodied_knolls`]'s reason. It is a
    /// ramp and not a cliff on purpose: a body on the floor must be able to
    /// climb, or the measurement is about a wall rather than about height.
    pub fn embodied_ledge() -> Scenario {
        let mut scenario = Scenario::embodied_duel();
        scenario.name = "embodied-ledge-v1".to_string();
        let (cols, rows) = (scenario.dungeon.cols(), scenario.dungeon.rows());
        let heights = (0..rows as usize * cols as usize).map(|at| {
            match (at % cols as usize) as i32 {
                ..=8 => 6,
                9 => 4,
                10 => 2,
                _ => 0,
            }
        }).collect();
        let tiles = vec![crate::dungeon::OPEN; rows as usize * cols as usize];
        scenario.dungeon = Dungeon::from_tiles_and_heights(cols, rows, tiles, heights);
        scenario
    }

    pub fn count(&self, faction: Faction) -> usize {
        self.units.iter().filter(|u| u.faction == faction).count()
    }
}

/// Writes the complete ScenarioV1 identity payload after its domain and schema.
/// Torches are intentionally absent: they persist for presentation but do not
/// identify a fight. Keeping this as one writer is what makes codec drift a
/// compile-time integration problem instead of a pair of agreeing local tests.
pub(crate) fn scenario_v1_fields_into<S: ScenarioByteSink>(
    scenario: &Scenario,
    name_len: u16,
    sink: &mut S,
) {
    // **The model tag, and it is frozen.** See [`SCENARIO_MODEL_TAG`]: this
    // writer is also the replay encoder's scenario-record writer, so the byte
    // written here is simultaneously the replay record's model tag and is folded
    // into every pinned scenario fingerprint.
    sink.write_u8(SCENARIO_MODEL_TAG);
    sink.write_u16(name_len);
    sink.write_bytes(scenario.name.as_bytes());
    sink.write_u16(scenario.dungeon.cols());
    sink.write_u16(scenario.dungeon.rows());
    sink.write_u32(scenario.dungeon.tiles().len() as u32);
    sink.write_bytes(scenario.dungeon.tiles());
    sink.write_u32(scenario.max_ticks);
    match scenario.portal {
        None => sink.write_u8(0),
        Some(at) => {
            sink.write_u8(1);
            sink.write_i32(at.x.raw());
            sink.write_i32(at.y.raw());
        }
    }

    sink.write_u32(scenario.units.len() as u32);
    for unit in &scenario.units {
        sink.write_u8(match unit.kind {
            Body::Fighter => 0,
            Body::Rogue => 1,
            Body::Brute => 2,
            Body::Skitterer => 3,
        });
        sink.write_u8(unit.faction.index() as u8);
        sink.write_u8(unit.stats.power);
        sink.write_u8(unit.stats.agility);
        sink.write_u8(unit.stats.intellect);
        sink.write_u8(unit.stats.perception);
        sink.write_u8(unit.stats.vitality);
        sink.write_i32(unit.spawn.x.raw());
        sink.write_i32(unit.spawn.y.raw());
        sink.write_bytes(&action_definition_bytes(unit.loadout.primary));
        match unit.loadout.secondary {
            None => sink.write_u8(0),
            Some(action) => {
                sink.write_u8(1);
                sink.write_bytes(&action_definition_bytes(action));
            }
        }
    }
}

/// The one persisted item grammar, shared by ScenarioV1 identity and its codec.
pub(crate) fn action_definition_bytes(action: crate::ActionKind) -> [u8; 26] {
    action_spec_definition_bytes(action, action.spec())
}

fn action_spec_definition_bytes(
    action: crate::ActionKind,
    spec: crate::ActionSpec,
) -> [u8; 26] {
    let mut bytes = [0; 26];
    bytes[0] = action.code() as u8;
    bytes[1] = spec.role.discriminant() as u8;
    bytes[2..6].copy_from_slice(&spec.length.raw().to_le_bytes());
    bytes[6..10].copy_from_slice(&spec.mass.raw().to_le_bytes());
    bytes[10..14].copy_from_slice(&spec.balance.raw().to_le_bytes());
    bytes[14..16].copy_from_slice(&spec.arc.to_le_bytes());
    bytes[16..18].copy_from_slice(&spec.windup.to_le_bytes());
    bytes[18..20].copy_from_slice(&spec.recovery.to_le_bytes());
    bytes[20..22].copy_from_slice(&spec.ready.to_le_bytes());
    bytes[22..26].copy_from_slice(&spec.move_bonus.raw().to_le_bytes());
    bytes
}

#[cfg(test)]
mod tests {
    use super::*;
    use fx::Fx;

    #[test]
    fn scenario_v1_is_length_delimited_and_distinguishes_loadouts() {
        // **On `embodied-duel-v1` because both fixtures before it are gone.** It
        // was `Scenario::duel`, deleted with the legacy model, and then
        // `articulated_duel`, deleted with the articulated one; what this test
        // is about is the *grammar* -- that the name is length-delimited and
        // that a loadout reaches the stream -- and that is a property of the
        // sink, not of which fixture goes through it.
        let base = Scenario::embodied_duel();
        // Hand-pinned rather than compared only with another invocation: this
        // moves if the u16 name boundary disappears even though the name bytes
        // themselves remain in the stream. The value is the one
        // `embodied_duel_v1_has_the_frozen_identity_and_placement` pins, and
        // the duplication is deliberate: if the two disagree, one of them is
        // reading a fixture the other is not.
        assert_eq!(base.fingerprint(), 0x1a1e_8e74_eecd_55d5);

        // **A kit is two agreeing facts now, so the test changes both.** It used
        // to hand the fighter a Knife and then a Bow, which a Legacy scenario
        // accepted because nothing checked a loadout against anything. A world
        // with articulated columns ties every slot to an equipment row, and
        // `Scenario::fingerprint` runs that check before it hashes -- so a
        // loadout edited on its own is a scenario that refuses to have an
        // identity at all, which is a different claim from this one.
        let mut rearmed = base.clone();
        rearmed.units[0].loadout = crate::Loadout::single(crate::ActionKind::Club);
        rearmed.units[0].combat_spec = Some(UnitSpecV1 {
            anatomy: 1,
            equipment: [Some(3), None],
        });
        assert_ne!(base.fingerprint(), rearmed.fingerprint());

        // And dropping the off hand, which moves the secondary slot rather than
        // the primary one.
        let mut secondary = base.clone();
        secondary.units[0].loadout = crate::Loadout::single(crate::ActionKind::Sword);
        secondary.units[0].combat_spec = Some(UnitSpecV1 {
            anatomy: 1,
            equipment: [Some(1), None],
        });
        assert_ne!(base.fingerprint(), secondary.fingerprint());
        assert_ne!(rearmed.fingerprint(), secondary.fingerprint());
    }

    #[test]
    fn scenario_v1_rejects_a_name_that_cannot_fit_its_length_field() {
        let mut scenario = Scenario::embodied_duel();
        scenario.name = "x".repeat(u16::MAX as usize + 1);
        assert_eq!(
            scenario.try_fingerprint(),
            Err(ScenarioFingerprintError::NameTooLong { bytes: 65_536 })
        );
    }

    #[test]
    fn scenario_v1_covers_every_action_spec_field() {
        let action = crate::ActionKind::Sword;
        let spec = action.spec();
        let fingerprint = |action, spec| action_spec_definition_bytes(action, spec);
        let expected = fingerprint(action, spec);
        assert_ne!(expected, fingerprint(crate::ActionKind::Club, spec));

        let mut changed = spec;
        changed.role = crate::Role::Guard;
        assert_ne!(expected, fingerprint(action, changed));
        let mut changed = spec;
        changed.length = changed.length + Fx::from_raw(1);
        assert_ne!(expected, fingerprint(action, changed));
        let mut changed = spec;
        changed.mass = changed.mass + Fx::from_raw(1);
        assert_ne!(expected, fingerprint(action, changed));
        let mut changed = spec;
        changed.balance = changed.balance + Fx::from_raw(1);
        assert_ne!(expected, fingerprint(action, changed));
        let mut changed = spec;
        changed.arc = changed.arc.wrapping_add(1);
        assert_ne!(expected, fingerprint(action, changed));
        let mut changed = spec;
        changed.windup = changed.windup.wrapping_add(1);
        assert_ne!(expected, fingerprint(action, changed));
        let mut changed = spec;
        changed.recovery = changed.recovery.wrapping_add(1);
        assert_ne!(expected, fingerprint(action, changed));
        let mut changed = spec;
        changed.ready = changed.ready.wrapping_add(1);
        assert_ne!(expected, fingerprint(action, changed));
        let mut changed = spec;
        changed.move_bonus = changed.move_bonus + Fx::from_raw(1);
        assert_ne!(expected, fingerprint(action, changed));
    }

    /// The embodied control's identity, and the arrangement that identity is
    /// taken over.
    ///
    /// **Written out rather than compared with a second fixture.** This asserted
    /// field-by-field equality with `Scenario::articulated_duel` while
    /// `embodied_duel` was built *from* that function and the two differed by
    /// the name bytes and the model word alone. With the articulated model gone
    /// there is no other fixture to differ from, and a test that compares a
    /// thing with itself is worse than no test -- so the arrangement is spelled
    /// out here instead: the `24x16` floor, the sixty-second clock, both
    /// spawns, both bodies' kinds and both anatomy and equipment rows.
    ///
    /// None of those is a free choice. `0x1a1e8e74eecd55d5` is folded into
    /// `EMBODIED_CORPUS_DIGEST`, so the shape of this fixture is the shape of a
    /// pinned corpus, and a field that slips here is a corpus no longer
    /// measuring the fight it was recorded against.
    ///
    /// The fingerprint is hand-pinned rather than recomputed because **the model
    /// is in it**: [`SCENARIO_IDENTITY_WORD`] is `3` and `Scenario::fingerprint`
    /// writes it before the name bytes. The embodied plan asserted the model was
    /// not in the fingerprint; measuring it is what found otherwise.
    #[test]
    fn embodied_duel_v1_has_the_frozen_identity_and_placement() {
        let scenario = Scenario::embodied_duel();
        assert_eq!(scenario.name, "embodied-duel-v1");
        assert_eq!((scenario.dungeon.cols(), scenario.dungeon.rows()), (24, 16));
        assert_eq!(scenario.max_ticks, 60 * 60);
        assert_eq!(scenario.combat_specs, Some(CombatSpecTableV1::fixtures()));
        assert_eq!(scenario.units.len(), 2);
        assert_eq!(scenario.units[0].kind, Body::Fighter);
        assert_eq!(scenario.units[0].spawn, Vec2::from_ints(7, 6));
        assert_eq!(scenario.units[0].combat_spec,
                   Some(UnitSpecV1 { anatomy: 1, equipment: [Some(1), Some(2)] }));
        assert_eq!(scenario.units[1].kind, Body::Brute);
        assert_eq!(scenario.units[1].spawn, Vec2::from_ints(17, 10));
        assert_eq!(scenario.units[1].combat_spec,
                   Some(UnitSpecV1 { anatomy: 2, equipment: [Some(3), None] }));
        // Worth pinning here precisely because the number *can* move: the
        // fingerprint covers the immutable spec table, so an edit to the shield
        // plate makes this a different fixture, and every corpus, replay
        // integrity check and evidence artifact that names `embodied-duel-v1` is
        // a claim about the version whose equipment it was recorded against. The
        // name is frozen and the number is not -- but moving it invalidates
        // recorded evidence rather than merely renumbering it.
        assert_eq!(scenario.fingerprint(), 0x1a1e_8e74_eecd_55d5);
    }

    /// The sculpted fixture is the embodied one with a hill in it, and the hill
    /// is fair, climbable and level where the bodies stand.
    ///
    /// **Four claims, and each of them is a way the fixture could have measured
    /// the wrong thing.** A hill off the midpoint would have measured which side
    /// a policy started on. A hill that is not symmetric under `y = 8` would
    /// have measured which orientation `lab` was running. A riser over
    /// `TERRAIN_STEP_UP_RAW` would have been a wall from below, so "seek the
    /// high ground" could have meant "walk into a cliff and stop". And a spawn
    /// on a slope would have started one body above the other.
    #[test]
    fn the_sculpted_fixture_is_a_fair_climbable_hill() {
        let slope = Scenario::embodied_slope();
        let flat = Scenario::embodied_duel();
        assert!(slope.dungeon.sculpted(), "the sculpted fixture is flat");
        assert!(!flat.dungeon.sculpted(), "the control stopped being flat");
        assert_eq!(slope.units, flat.units, "the hill moved a body");

        let (cols, rows) = (slope.dungeon.cols() as i32, slope.dungeon.rows() as i32);
        let at = |x: i32, y: i32| slope.dungeon.height_at(
            Vec2::new(Fx::from_int(x) + Fx::HALF, Fx::from_int(y) + Fx::HALF));

        // Symmetric about its own centre on both axes, which is what "radial"
        // has to mean once the ring test is integer arithmetic on tile indices.
        // Reflections that leave the grid are skipped rather than clamped: the
        // hill sits half a tile off the arena's middle by construction, so a
        // clamp would compare a tile with itself and assert nothing.
        for y in 0..rows {
            for x in 0..cols {
                if 24 - x < cols { assert_eq!(at(x, y), at(24 - x, y),
                    "tile ({x}, {y}) is not radial in x"); }
                if 16 - y < rows { assert_eq!(at(x, y), at(x, 16 - y),
                    "tile ({x}, {y}) is not radial in y"); }
            }
        }

        // Every orthogonal neighbour is enterable in both directions, which is
        // the property `TERRAIN_STEP_UP_RAW` bounds and the one a terrace of
        // twos was chosen to keep.
        for y in 0..rows {
            for x in 0..cols {
                for (dx, dy) in [(1, 0), (0, 1)] {
                    let (nx, ny) = (x + dx, y + dy);
                    if nx >= cols || ny >= rows { continue; }
                    assert!(slope.dungeon.passable_between((x, y), (nx, ny)),
                            "({x}, {y}) cannot step to ({nx}, {ny})");
                    assert!(slope.dungeon.passable_between((nx, ny), (x, y)),
                            "({nx}, {ny}) cannot step back to ({x}, {y})");
                }
            }
        }

        // Level where the two bodies stand, and level under the pair `lab`
        // produces by reflecting `spawn.y` about `y = 8` for its second
        // orientation. All four tiles are the same 29 squared units from the
        // top, so neither body is nearer the hill in either arrangement -- that
        // is the whole fairness claim and it is why the centre is where it is.
        let ground = |p: Vec2| slope.dungeon.height_at(p);
        for spawn in [Vec2::from_ints(7, 6), Vec2::from_ints(17, 10),
                      Vec2::from_ints(7, 10), Vec2::from_ints(17, 6)] {
            assert_eq!(ground(spawn), Fx::ZERO, "a body spawns on the slope at {spawn:?}");
        }
        for (x, y) in [(7, 6), (17, 10), (7, 10), (17, 6)] {
            assert_eq!((x - 12) * (x - 12) + (y - 8) * (y - 8), 29,
                       "spawn tile ({x}, {y}) is not the others' distance from the top");
        }
        // And there is a high ground to seek: the plateau is above the floor.
        assert!(at(12, 8) > Fx::ZERO, "the hill has no top");
        assert_eq!(at(12, 8), at(11, 7), "the plateau is not flat");

        // A different fixture with a different identity, differing from the
        // control by the name and the floor and nothing else.
        let mut renamed = flat.clone();
        renamed.name = slope.name.clone();
        renamed.dungeon = slope.dungeon.clone();
        assert_eq!(renamed, slope);
        assert_ne!(slope.fingerprint(), flat.fingerprint());
        assert_eq!(slope.fingerprint(), 0xf49d_e9a6_1f93_9163);
    }

    /// The two knolls are a detour, they are equal, and neither is clipped.
    ///
    /// **The claim that distinguishes this fixture from its predecessor is the
    /// first one.** `embodied_slope`'s hill is on the midpoint, so a body
    /// closing on its opponent climbs whether or not it is trying to; these sit
    /// off the approach, so the distance to a summit is a cost. That is asserted
    /// as "every point on the segment between the spawns is level", which is the
    /// property "off the approach" actually means.
    #[test]
    fn the_two_knolls_flank_the_approach_and_are_equal() {
        let knolls = Scenario::embodied_knolls();
        let flat = Scenario::embodied_duel();
        assert!(knolls.dungeon.sculpted());
        assert_eq!(knolls.units, flat.units, "a knoll moved a body");

        let (cols, rows) = (knolls.dungeon.cols() as i32, knolls.dungeon.rows() as i32);
        let at = |x: i32, y: i32| knolls.dungeon.height_at(
            Vec2::new(Fx::from_int(x) + Fx::HALF, Fx::from_int(y) + Fx::HALF));

        // **The approach is level, end to end.** Sampled at every sixteenth of
        // the segment rather than at its tiles, because a body walks through
        // points and a tile-wise walk could step over a raised tile the segment
        // passes through a corner of.
        let (a, b) = (Vec2::from_ints(7, 6), Vec2::from_ints(17, 10));
        for step in 0..=16 {
            let t = Fx::from_ratio(step, 16);
            let p = a + (b - a) * t;
            assert_eq!(knolls.dungeon.height_at(p), Fx::ZERO,
                       "the approach climbs at {p:?}, so seeking height is not a detour");
        }

        // Canonically every spawn is the same distance from every summit, so
        // neither body is nearer either one.
        for (sx, sy) in [(7, 6), (17, 10)] {
            for (cx, cy) in [(10, 13), (14, 3)] {
                assert_eq!((sx - cx) * (sx - cx) + (sy - cy) * (sy - cy), 58,
                           "spawn ({sx}, {sy}) is not 58 from knoll ({cx}, {cy})");
            }
        }
        // Mirrored, each body has one near knoll and one far one, and the two
        // have the same pair. Not equidistant -- no single point is equidistant
        // from all four spawns except the midpoint -- but symmetric, which is
        // what the measurement needs.
        let reach = |sx: i32, sy: i32| {
            let mut d: Vec<i32> = [(10, 13), (14, 3)].into_iter()
                .map(|(cx, cy)| (sx - cx) * (sx - cx) + (sy - cy) * (sy - cy)).collect();
            d.sort();
            d
        };
        assert_eq!(reach(7, 10), vec![18, 98]);
        assert_eq!(reach(17, 6), vec![18, 98]);

        // Both summits are the same height and both are unclipped: every tile
        // the ring test raises is inside the grid, so the near knoll in the
        // mirrored orientation is the same shape as the other body's.
        assert_eq!(at(10, 13), at(14, 3));
        assert!(at(10, 13) > Fx::ZERO, "the knolls have no top");
        let raised = |cx: i32, cy: i32| (0..rows).flat_map(move |y| (0..cols).map(move |x| (x, y)))
            .filter(move |&(x, y)| (x - cx).abs().max((y - cy).abs()) <= 2)
            .collect::<Vec<_>>();
        assert_eq!(raised(10, 13).len(), 25, "a knoll is clipped by the arena edge");
        assert_eq!(raised(14, 3).len(), 25, "a knoll is clipped by the arena edge");
        // And disjoint, so the minimum above is never choosing between two
        // terraces of comparable height.
        for tile in raised(10, 13) {
            assert!(!raised(14, 3).contains(&tile), "the two knolls overlap at {tile:?}");
        }

        // Climbable from every direction in both, and level where the bodies
        // stand under either orientation.
        for y in 0..rows {
            for x in 0..cols {
                for (dx, dy) in [(1, 0), (0, 1)] {
                    let (nx, ny) = (x + dx, y + dy);
                    if nx >= cols || ny >= rows { continue; }
                    assert!(knolls.dungeon.passable_between((x, y), (nx, ny))
                            && knolls.dungeon.passable_between((nx, ny), (x, y)),
                            "({x}, {y}) and ({nx}, {ny}) are not both enterable");
                }
            }
        }
        for spawn in [Vec2::from_ints(7, 6), Vec2::from_ints(17, 10),
                      Vec2::from_ints(7, 10), Vec2::from_ints(17, 6)] {
            assert_eq!(knolls.dungeon.height_at(spawn), Fx::ZERO,
                       "a body spawns on a knoll at {spawn:?}");
        }

        assert_ne!(knolls.fingerprint(), Scenario::embodied_slope().fingerprint());
        assert_eq!(knolls.fingerprint(), 0xb4ff_9f28_ca20_c6a4);
    }

    /// The ledge is a ramp, it divides the two spawns, and it divides them in
    /// both orientations.
    ///
    /// The last claim is the one that would have been missed. `lab` mirrors by
    /// reflecting `spawn.y`, so a ledge running across `y` would put both bodies
    /// on the same side of it in one of the two orientations and the measurement
    /// would silently average "one high, one low" with "both high".
    #[test]
    fn the_ledge_divides_the_two_spawns_in_both_orientations() {
        let ledge = Scenario::embodied_ledge();
        assert!(ledge.dungeon.sculpted());
        assert_eq!(ledge.units, Scenario::embodied_duel().units, "the ledge moved a body");

        let high = ledge.dungeon.height_at(Vec2::from_ints(7, 6));
        assert!(high > Fx::ZERO, "the raised spawn is on the floor");
        for low in [Vec2::from_ints(17, 10), Vec2::from_ints(17, 6)] {
            assert_eq!(ledge.dungeon.height_at(low), Fx::ZERO, "{low:?} is not on the floor");
        }
        // Mirrored, the raised spawn is still raised and still the same height:
        // reflecting `y` cannot cross a ledge that runs down `x`.
        assert_eq!(ledge.dungeon.height_at(Vec2::from_ints(7, 10)), high);

        // A ramp and not a cliff: the body on the floor can climb it, or the
        // measurement is about a wall.
        let (cols, rows) = (ledge.dungeon.cols() as i32, ledge.dungeon.rows() as i32);
        for y in 0..rows {
            for x in 0..cols {
                for (dx, dy) in [(1, 0), (0, 1)] {
                    let (nx, ny) = (x + dx, y + dy);
                    if nx >= cols || ny >= rows { continue; }
                    assert!(ledge.dungeon.passable_between((x, y), (nx, ny))
                            && ledge.dungeon.passable_between((nx, ny), (x, y)),
                            "({x}, {y}) and ({nx}, {ny}) are not both enterable");
                }
            }
        }
        // Flat along `y`, which is what makes "which side of the ledge" the only
        // thing that separates the two spawns.
        for y in 1..rows {
            for x in 0..cols {
                assert_eq!(ledge.dungeon.height_at(
                               Vec2::new(Fx::from_int(x) + Fx::HALF, Fx::from_int(y) + Fx::HALF)),
                           ledge.dungeon.height_at(
                               Vec2::new(Fx::from_int(x) + Fx::HALF, Fx::HALF)),
                           "column {x} is not level along y");
            }
        }

        assert_eq!(ledge.fingerprint(), 0x1217_3f98_b7be_ab8d);
    }

    fn descending_hero() -> UnitSpec {
        UnitSpec {
            kind: Body::Rogue,
            faction: Faction::Heroes,
            stats: Body::Rogue.base_stats(),
            loadout: Body::Rogue.default_loadout(),
            combat_spec: None,
            spawn: Vec2::ZERO,
        }
    }

    #[test]
    fn a_dungeon_is_a_pure_function_of_its_seed_and_its_depth() {
        let h = descending_hero();
        assert_eq!(Scenario::dungeon(9, 2, h), Scenario::dungeon(9, 2, h));
        assert_ne!(Scenario::dungeon(9, 2, h), Scenario::dungeon(10, 2, h));
        assert_ne!(Scenario::dungeon(9, 2, h), Scenario::dungeon(9, 3, h));
        assert_eq!(
            Scenario::dungeon(9, 2, h).fingerprint(),
            Scenario::dungeon(9, 2, h).fingerprint()
        );
    }

    #[test]
    fn a_dungeon_carries_the_hero_it_was_handed() {
        // The whole point of a descent: the character persists, and only where
        // it stands is decided by the level.
        let mut hero = descending_hero();
        hero.stats.vitality = 7;
        let s = Scenario::dungeon(4, 1, hero);
        assert_eq!(s.count(Faction::Heroes), 1);
        let arrived = s.units[0];
        assert_eq!(arrived.kind, Body::Rogue);
        assert_eq!(arrived.stats, hero.stats);
        // **What the hero keeps is its body and its sheet. Its hands are the
        // table's.** `Scenario::dungeon` builds a world with articulated columns
        // now, and construction ties every loadout slot to an equipment *row*:
        // `validate_rows` refuses a body holding an action the spec table has no
        // item for. The shipped table has three items -- a sword, a shield and a
        // club -- so a descending Rogue carrying a Shortsword arrives with the
        // sword, because there is no Shortsword to give it.
        //
        // That is a real narrowing of "the character persists" and it is stated
        // rather than asserted away: the fix is a wider equipment table, not a
        // looser check. `crates/web` already did this mapping on its own side of
        // the wall before the sim took it over, so nothing regressed with the
        // move -- what changed is that the constraint is now visible here.
        assert_eq!(arrived.loadout.secondary, hero.loadout.secondary.map(|_| crate::ActionKind::Shield));
        assert!(arrived.combat_spec.is_some(), "a descending hero arrived undressed");
        assert_ne!(arrived.spawn, Vec2::ZERO, "left standing at the origin");
    }

    #[test]
    fn a_dungeon_stands_everybody_on_ground_they_fit_on() {
        for depth in 0..4 {
            let s = Scenario::dungeon(11, depth, descending_hero());
            assert_eq!(
                s.arena(),
                Vec2::from_ints(DUNGEON_COLS as i32, DUNGEON_ROWS as i32)
            );
            assert!(s.count(Faction::Monsters) >= MONSTERS_BASE);
            for u in &s.units {
                assert!(
                    s.dungeon.is_clear(u.spawn, Body::Brute.radius()),
                    "depth {depth}: {:?} at {:?} is in the wall",
                    u.kind,
                    u.spawn
                );
            }
            let portal = s.portal.expect("a dungeon has a way out");
            assert!(s.dungeon.is_clear(portal, Body::Brute.radius()));
        }
    }

    #[test]
    fn the_first_floor_is_all_skitterers_and_later_ones_are_not() {
        assert!(Scenario::dungeon(3, 0, descending_hero())
            .units
            .iter()
            .filter(|u| u.faction == Faction::Monsters)
            .all(|u| u.kind == Body::Skitterer));
        // Deeper down a Brute turns up eventually. Asked across seeds rather
        // than pinned to one, because which seed rolls the first Brute is not a
        // fact worth freezing.
        assert!((0..40u64).any(|seed| Scenario::dungeon(seed, 6, descending_hero())
            .units
            .iter()
            .any(|u| u.kind == Body::Brute)));
    }

}

