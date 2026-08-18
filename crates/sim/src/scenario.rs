use crate::dungeon::{Dungeon, Torch};
use crate::combat::spec::{combat_specs_into, ArticulatedUnitSpecV1, CombatSpecTableV1};
use crate::entity::{Body, Faction};
use crate::loadout::Loadout;
use crate::rules::Stats;
use fx::{Fx, Hash64, Rng, Vec2};

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
    pub articulated: Option<ArticulatedUnitSpecV1>,
    pub spawn: Vec2,
}

/// Which mechanics grammar interprets a scenario's immutable inputs.
#[repr(u8)]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum CombatModel {
    Legacy = 0,
    Articulated = 1,
    /// The *Die by the Sword* body: an articulated one whose arms are driven
    /// relative to the torso, whose hips constrain the torso, and whose floor
    /// has a height. It starts as an exact copy of [`CombatModel::Articulated`]
    /// so that every later mechanic lands as a measurable difference from a
    /// control rather than as a new fight nobody can compare.
    Embodied = 2,
}

/// Which submitted-command grammar a model accepts.
///
/// Kept distinct from `CombatModel` because the guards that ask this question
/// are asking about the *command surface* and not about the body: `set_loadout`
/// refuses an articulated world for the same reason `submit` does, and neither
/// is asking whether contact runs.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(crate) enum CommandGrammar {
    /// `Command`, `Loadout`, `set_body`, `face_legacy`.
    Legacy,
    /// `ArticulatedCommandV1`.
    Articulated,
    /// `EmbodiedCommandV1`. A separate payload from the articulated one, and
    /// separate on purpose: three pinned digests read `ARTICULATED_PAYLOAD_BYTES`
    /// and have moved together twice, so a stance model that widened *that*
    /// payload would re-record all three plus their wasm mirrors.
    Embodied,
}

impl CombatModel {
    /// Whether this model owns the articulated pose columns: body yaw, arms,
    /// grips, shield pose, the three authority factors, anatomy, and the
    /// contact runtime.
    ///
    /// A model answering `false` leaves those columns empty, so every read of
    /// them is guarded by this rather than by a `== Articulated` that a third
    /// variant would have to be pattern-matched into one site at a time.
    pub(crate) const fn has_articulated_columns(self) -> bool {
        match self {
            CombatModel::Legacy => false,
            CombatModel::Articulated | CombatModel::Embodied => true,
        }
    }

    /// Whether this model resolves contact through the swept XYZ solver.
    ///
    /// Separate from [`CombatModel::has_articulated_columns`] even though the
    /// two agree today, because they are different questions. Flattening them
    /// is how a model that has a pose but no contact phase would start indexing
    /// a `ContactRuntime` that is `None`.
    pub(crate) const fn uses_contact_solver(self) -> bool {
        match self {
            CombatModel::Legacy => false,
            CombatModel::Articulated | CombatModel::Embodied => true,
        }
    }

    /// The word `Scenario::try_fingerprint` writes to say which model a
    /// scenario is.
    ///
    /// One function rather than two copies of a `match`, because the replay
    /// codec recomputes the same fingerprint from the decoded bytes and the two
    /// have to agree exactly. They did not, for the length of one session: the
    /// codec's copy answered `2` for every non-legacy model, so an embodied
    /// replay decoded to a fingerprint its own scenario did not have.
    ///
    /// **Not `self as u16`.** The wire discriminants are 0/1/2 and these words
    /// are 1/2/3; they are two numbering schemes over the same enum and
    /// collapsing them would silently renumber a frozen identity.
    pub(crate) const fn identity_word(self) -> u16 {
        match self {
            CombatModel::Legacy => 1,
            CombatModel::Articulated => 2,
            CombatModel::Embodied => 3,
        }
    }

    /// Whether this model's torso is turned by its hips rather than freely.
    ///
    /// Separate from [`CombatModel::command_frame`] even though the two agree
    /// today, and for the reason the pair above already gives: they are
    /// different questions. A model could read a torso-relative bearing without
    /// having legs to constrain it, and flattening the two is how such a model
    /// would start indexing a stance column it never allocated.
    pub(crate) const fn has_stance(self) -> bool {
        match self {
            CombatModel::Legacy | CombatModel::Articulated => false,
            CombatModel::Embodied => true,
        }
    }

    /// Whether this model's arms carry a commanded elbow plane.
    ///
    /// A third predicate that agrees with the two above on every member today,
    /// and a third one for their reason rather than in spite of it: this one is
    /// a question about the **command surface** -- the plane arrives in
    /// `EmbodiedCommandV1` and nowhere else -- while `has_stance` is about the
    /// legs. Answering the plane's question with the legs' predicate is how a
    /// future model with a commanded plane and no hips would start indexing a
    /// stance column it never allocated, or the reverse.
    pub(crate) const fn has_swing_plane(self) -> bool {
        match self {
            CombatModel::Legacy | CombatModel::Articulated => false,
            CombatModel::Embodied => true,
        }
    }

    /// Whether this model's arms are two links and present a forearm to the
    /// contact solver.
    ///
    /// The fourth predicate, agreeing with the three above on every member
    /// today, and split from them on the same principle: this one is a question
    /// about **geometry** -- how many capsules a body hands the sweep -- while
    /// `has_swing_plane` is about the command surface and `has_stance` is about
    /// the legs. They come apart in both directions. A model could command a
    /// plane and still collide as one capsule, which is exactly what this
    /// session's predecessor shipped for a day; and a model could split its arm
    /// at a fixed elbow with no plane to steer it, which is what a cheaper
    /// version of this session would have been.
    ///
    /// **Session 10 collapses all four**, when `Legacy` and `Articulated` go and
    /// the question stops having two answers. Until then, four predicates is the
    /// cost of being able to say which property a future model is opting into.
    pub(crate) const fn has_jointed_arms(self) -> bool {
        match self {
            CombatModel::Legacy | CombatModel::Articulated => false,
            CombatModel::Embodied => true,
        }
    }

    /// Which frame a submitted arm bearing and movement vector are measured in.
    ///
    /// This is the whole of what separates an embodied body from an articulated
    /// one in the arm driver and the movement phase, and it is a predicate
    /// rather than two `== Embodied` comparisons because it is one question
    /// asked in two places.
    pub(crate) const fn command_frame(self) -> CommandFrame {
        match self {
            CombatModel::Legacy | CombatModel::Articulated => CommandFrame::World,
            CombatModel::Embodied => CommandFrame::Torso,
        }
    }

    /// Which submitted-command grammar this model accepts.
    pub(crate) const fn command_grammar(self) -> CommandGrammar {
        match self {
            CombatModel::Legacy => CommandGrammar::Legacy,
            CombatModel::Articulated => CommandGrammar::Articulated,
            CombatModel::Embodied => CommandGrammar::Embodied,
        }
    }
}

/// Whether a submitted bearing and movement vector are absolute or torso-relative.
///
/// The articulated contract is explicit that a bearing is absolute: *body yaw
/// moves the shoulders, it does not silently rewrite an absolute arm target.*
/// That was a deliberate choice and it has a cost the source material does not
/// pay -- **turning the body does not carry the sword**, so footwork and swing
/// are two independent subsystems that happen to share a shoulder.
///
/// `Torso` couples them. Turning the hips swings the weapon; reaching across
/// the body costs bearing travel the torso could have supplied for free; and a
/// body that must turn to bring its weapon round is a body whose stance can
/// constrain its attack. The two readings are not interchangeable and both are
/// useful: an absolute bearing is stable under yaw, a relative one is stable
/// under the body.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(crate) enum CommandFrame {
    /// Absolute world bearings, and a world-space movement vector.
    World,
    /// Measured from the torso: `+x` is forward, `+y` is body-left, and a zero
    /// bearing holds the arm directly ahead at every yaw.
    Torso,
}

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
    pub combat_model: CombatModel,
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

    /// A fixed, hand-placed one-on-one. No randomness at all -- this is the
    /// scenario tests use when they need to reason about exact positions.
    pub fn duel() -> Scenario {
        Scenario {
            name: "duel".to_string(),
            combat_model: CombatModel::Legacy,
            combat_specs: None,
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
                    articulated: None,
                    spawn: Vec2::from_ints(6, 8),
                },
                UnitSpec {
                    kind: Body::Brute,
                    faction: Faction::Monsters,
                    stats: Body::Brute.base_stats(),
                    loadout: Body::Brute.default_loadout(),
                    articulated: None,
                    spawn: Vec2::from_ints(18, 8),
                },
            ],
        }
    }

    /// A seeded one-on-one between two chosen archetypes.
    ///
    /// The pair is placed on a ring about the arena centre at a rolled bearing,
    /// diametrically opposite each other. That the *bearing* is what the seed
    /// changes is the whole point: with a fixed east-west placement every duel
    /// of the same matchup is the same fight, differing only in perception
    /// noise, so a win rate measured over a thousand seeds is really one sample
    /// repeated a thousand times. Rotating the engagement gives the approach,
    /// the walls and the swing geometry something to vary.
    ///
    /// [`Scenario::duel`] stays as it is -- fixed and hand-placed -- because
    /// tests that reason about exact positions need it to be.
    pub fn duel_of(hero: Body, villain: Body, seed: u64) -> Scenario {
        let dungeon = Dungeon::open(24, 16);
        let centre = dungeon.extent() * Fx::HALF;
        let mut rng = Rng::new(seed);
        let bearing = rng.angle();
        // Six units apart, which is inside the *shortest* sight range in the
        // game (a Brute's 7.8), so both fighters see each other on the first
        // tick. That is deliberate and it is what makes this a duel harness:
        // spawn them further apart and the pair spends the run failing to find
        // each other, because the standing order that would bring them together
        // points along a fixed axis while this placement is rotated. Search is
        // a real and unsolved problem, and measuring it by accident inside a
        // swordsmanship measurement is how you end up tuning combat to fix
        // navigation.
        let apart = Vec2::from_angle(bearing) * Fx::from_int(3);

        Scenario {
            name: format!("duel-{}-vs-{}", hero.name(), villain.name()),
            combat_model: CombatModel::Legacy,
            combat_specs: None,
            dungeon,
            portal: None,
            torches: Vec::new(),
            // Two and a half minutes, up from ninety seconds, for the same
            // reason `skirmish` needed it: a duel is roughly a dozen landed
            // blows a side now rather than three or four, so it takes about
            // twice as long. At the old limit the tail of slow fights was being
            // cut off mid-exchange, and because a disengaged fighter heals back
            // to full, those came back as *ties* -- 20% of the dim end of the
            // skill range was two fully-healed characters standing in opposite
            // corners with the clock stopped.
            max_ticks: 150 * 60,
            units: vec![
                UnitSpec {
                    kind: hero,
                    faction: Faction::Heroes,
                    stats: hero.base_stats(),
                    loadout: hero.default_loadout(),
                    articulated: None,
                    spawn: centre - apart,
                },
                UnitSpec {
                    kind: villain,
                    faction: Faction::Monsters,
                    stats: villain.base_stats(),
                    loadout: villain.default_loadout(),
                    articulated: None,
                    spawn: centre + apart,
                },
            ],
        }
    }

    /// An empty room with a single hero. No opposition, no time limit: the
    /// sandbox the browser build opens with, and the scenario the navigation
    /// tests use.
    ///
    /// `max_ticks` is effectively unbounded because there is no fight here to
    /// time out -- nothing multiplies it, and [`Scenario::fingerprint`] only
    /// hashes it. Nothing the lab iterates should be pointed at this: the
    /// fitness function and the runner both assume two populated sides.
    pub fn room() -> Scenario {
        Scenario {
            name: "room".to_string(),
            combat_model: CombatModel::Legacy,
            combat_specs: None,
            dungeon: Dungeon::open(24, 16),
            portal: None,
            torches: Vec::new(),
            max_ticks: u32::MAX,
            units: vec![UnitSpec {
                kind: Body::Fighter,
                faction: Faction::Heroes,
                stats: Body::Fighter.base_stats(),
                loadout: Body::Fighter.default_loadout(),
                articulated: None,
                spawn: Vec2::from_ints(12, 8),
            }],
        }
    }

    /// A seeded skirmish: heroes spawn in the left third, monsters in the
    /// right third, both jittered.
    ///
    /// The vertical band is deliberately narrower than the arena. Sight range
    /// is around 10 units and the arena is 28 tall, so spawning across the full
    /// height produces fights where the two sides walk straight past each other
    /// and time out. Search behaviour is a real design problem, but it is not
    /// this milestone's, and an experiment harness whose runs mostly end in
    /// "nobody found anybody" measures nothing.
    ///
    /// The RNG is consumed here and then discarded -- the scenario it produces
    /// is a plain value. Two runs of the same seed are identical because the
    /// *setup* is identical, not because the world re-rolls the same numbers.
    pub fn skirmish(seed: u64, heroes: u32, monsters: u32) -> Scenario {
        let dungeon = Dungeon::open(40, 28);
        let arena = dungeon.extent();
        let mut rng = Rng::new(seed);
        let mut units = Vec::with_capacity((heroes + monsters) as usize);

        for _ in 0..heroes {
            let kind = if rng.chance(1, 3) {
                Body::Rogue
            } else {
                Body::Fighter
            };
            units.push(UnitSpec {
                kind,
                faction: Faction::Heroes,
                stats: kind.base_stats(),
                loadout: kind.default_loadout(),
                articulated: None,
                spawn: Vec2::new(
                    rng.range(Fx::from_int(3), Fx::from_int(12)),
                    rng.range(Fx::from_int(8), arena.y - Fx::from_int(8)),
                ),
            });
        }

        for _ in 0..monsters {
            let kind = if rng.chance(1, 4) {
                Body::Brute
            } else {
                Body::Skitterer
            };
            units.push(UnitSpec {
                kind,
                faction: Faction::Monsters,
                stats: kind.base_stats(),
                loadout: kind.default_loadout(),
                articulated: None,
                spawn: Vec2::new(
                    rng.range(arena.x - Fx::from_int(12), arena.x - Fx::from_int(3)),
                    rng.range(Fx::from_int(8), arena.y - Fx::from_int(8)),
                ),
            });
        }

        Scenario {
            name: format!("skirmish-{heroes}v{monsters}"),
            combat_model: CombatModel::Legacy,
            combat_specs: None,
            dungeon,
            portal: None,
            torches: Vec::new(),
            units,
            // Two and a half minutes, up from ninety seconds. A phased attack is
            // a windup, a cut and a recovery where a windmill was a blow every
            // nine ticks, so a fight of this size takes about twice as long as
            // it used to and a fifth of them were timing out with both sides
            // still standing. A draw scores zero, teaches evolution nothing and
            // costs a full limit of compute -- it is the most expensive possible
            // way to learn nothing, and buying the extra time back is cheap.
            max_ticks: 150 * 60,
        }
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
                articulated: None,
                spawn: *at,
            });
        }

        Scenario {
            name: format!("dungeon-{depth}"),
            combat_model: CombatModel::Legacy,
            combat_specs: None,
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
            self.combat_model,
            self.combat_specs.as_ref(),
            &self.units,
        ).map_err(ScenarioFingerprintError::InvalidCombatSpecs)?;
        let name_len = u16::try_from(self.name.len()).map_err(|_| {
            ScenarioFingerprintError::NameTooLong { bytes: self.name.len() }
        })?;
        let mut h = Hash64::new();
        h.write_bytes(b"ARPG-SCENARIO");
        // **The model *is* in the fingerprint**, contrary to what the embodied
        // plan asserted before this session measured it. That does not make a
        // new variant move an old pin: every shipped fixture keeps the value it
        // wrote, and only a scenario that asks for `Embodied` writes the third
        // one. The word is the reason `embodied-duel-v1` differs from
        // `articulated-duel-v1` by more than its name bytes.
        h.write_u16(self.combat_model.identity_word());
        scenario_v1_fields_into(self, name_len, &mut h);
        if self.combat_model.has_articulated_columns() {
            combat_specs_into(self.combat_specs.as_ref(), &self.units, &mut h);
        }
        Ok(h.finish())
    }

    /// The only shipped articulated construction fixture before v2-18.
    pub fn articulated_duel() -> Scenario {
        let mut scenario = Scenario::duel();
        scenario.name = "articulated-duel-v1".to_string();
        scenario.combat_model = CombatModel::Articulated;
        scenario.combat_specs = Some(CombatSpecTableV1::fixtures());
        scenario.units[0].articulated = Some(ArticulatedUnitSpecV1 {
            anatomy: 1,
            equipment: [Some(1), Some(2)],
        });
        scenario.units[1].articulated = Some(ArticulatedUnitSpecV1 {
            anatomy: 2,
            equipment: [Some(3), None],
        });
        scenario.units[1].loadout = crate::Loadout::single(crate::ActionKind::Club);
        scenario.units[0].spawn = Vec2::from_ints(7, 6);
        scenario.units[1].spawn = Vec2::from_ints(17, 10);
        scenario
    }

    /// The embodied control: `articulated_duel` under a different name and a
    /// different model, and identical in every other field.
    ///
    /// Built *from* the articulated fixture rather than beside it, so the two
    /// cannot drift apart. That is the whole design of the embodied plan: every
    /// mechanic from session 04 onward is measured as a difference from this
    /// pair, and a difference is only readable if the control is the same fight.
    ///
    /// Its fingerprint is a new number and differs from `articulated-duel-v1`
    /// by exactly two things -- the name bytes and the model word -- which is
    /// worth stating because the plan that proposed this session claimed
    /// `Scenario::fingerprint` did not write the model. It does.
    pub fn embodied_duel() -> Scenario {
        let mut scenario = Scenario::articulated_duel();
        scenario.name = "embodied-duel-v1".to_string();
        scenario.combat_model = CombatModel::Embodied;
        scenario
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
    sink.write_u8(scenario.combat_model as u8);
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

    #[test]
    fn scenario_v1_is_length_delimited_and_distinguishes_loadouts() {
        let base = Scenario::duel();
        // Hand-pinned rather than compared only with another invocation: this
        // moves if the u16 name boundary disappears even though the name bytes
        // themselves remain in the stream.
        assert_eq!(base.fingerprint(), 0x74d9_3bea_e624_85b2);

        let mut rearmed = base.clone();
        rearmed.units[0].loadout = Loadout::single(crate::ActionKind::Knife);
        assert_ne!(base.fingerprint(), rearmed.fingerprint());

        let mut secondary = base.clone();
        secondary.units[0].loadout.secondary = Some(crate::ActionKind::Bow);
        assert_ne!(base.fingerprint(), secondary.fingerprint());
    }

    #[test]
    fn scenario_v1_rejects_a_name_that_cannot_fit_its_length_field() {
        let mut scenario = Scenario::duel();
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

    #[test]
    fn skirmish_is_a_pure_function_of_its_seed() {
        assert_eq!(Scenario::skirmish(42, 3, 5), Scenario::skirmish(42, 3, 5));
        assert_ne!(Scenario::skirmish(42, 3, 5), Scenario::skirmish(43, 3, 5));
        assert_eq!(
            Scenario::skirmish(42, 3, 5).fingerprint(),
            Scenario::skirmish(42, 3, 5).fingerprint()
        );
    }

    #[test]
    fn a_seeded_duel_rotates_the_engagement() {
        let a = Scenario::duel_of(Body::Rogue, Body::Brute, 1);
        let b = Scenario::duel_of(Body::Rogue, Body::Brute, 2);
        assert_ne!(
            a.units[0].spawn, b.units[0].spawn,
            "the seed must change the geometry, not only the noise"
        );
        assert_eq!(a, Scenario::duel_of(Body::Rogue, Body::Brute, 1));

        for s in [&a, &b] {
            assert_eq!(s.count(Faction::Heroes), 1);
            assert_eq!(s.count(Faction::Monsters), 1);
            for u in &s.units {
                assert!(u.spawn.x > Fx::ONE && u.spawn.x < s.arena().x - Fx::ONE);
                assert!(u.spawn.y > Fx::ONE && u.spawn.y < s.arena().y - Fx::ONE);
            }
            // Opposite each other, and inside the shortest sight range in the
            // game, so a duel starts as a duel rather than as a search.
            let gap = (s.units[0].spawn - s.units[1].spawn).length();
            assert!((gap - Fx::from_int(6)).abs() < Fx::ONE, "gap {gap}");
            let shortest = Body::ALL
                .iter()
                .map(|k| k.base_stats().sight_range())
                .fold(Fx::MAX, Fx::min);
            assert!(gap < shortest, "gap {gap} exceeds the shortest sight {shortest}");
        }
    }

    #[test]
    fn the_room_is_one_hero_alone_inside_the_arena() {
        let s = Scenario::room();
        assert_eq!(s.count(Faction::Heroes), 1);
        assert_eq!(s.count(Faction::Monsters), 0);
        let hero = s.units[0];
        assert!(hero.spawn.x > Fx::ZERO && hero.spawn.x < s.arena().x);
        assert!(hero.spawn.y > Fx::ZERO && hero.spawn.y < s.arena().y);
    }

    #[test]
    fn articulated_duel_v1_has_the_frozen_identity_and_placement() {
        let scenario = Scenario::articulated_duel();
        assert_eq!(scenario.name, "articulated-duel-v1");
        assert_eq!(scenario.units[0].spawn, Vec2::from_ints(7, 6));
        assert_eq!(scenario.units[1].spawn, Vec2::from_ints(17, 10));
        // Moved once, by v2-20 shrinking the shield row, and it is worth
        // pinning here precisely because it does move: the fingerprint covers
        // the immutable spec table, so an edit to the plate makes this a
        // different fixture, and every corpus, replay integrity check and
        // evidence artifact that names `articulated-duel-v1` is a claim about
        // the version whose equipment it was recorded against. The name is
        // frozen and the number is not. Previously `0x2a6c_c967_8c08_730d`.
        assert_eq!(scenario.fingerprint(), 0x068d_05fc_ada1_027b);
    }

    /// The embodied control's identity, pinned on the same terms.
    ///
    /// It differs from `articulated-duel-v1` by **two** things and it is worth
    /// naming both: the name bytes, and the model word `try_fingerprint` writes
    /// before them. The embodied plan asserted the model was not in the
    /// fingerprint; measuring it is what found otherwise, and
    /// `CombatModel::identity_word` is now the one place that word is written.
    ///
    /// Every other field is the articulated fixture's, because
    /// `Scenario::embodied_duel` is built *from* it. That is the whole point:
    /// sessions 04 onward measure a difference, and a difference needs a
    /// control that is otherwise the same fight.
    #[test]
    fn embodied_duel_v1_has_the_frozen_identity_and_the_articulated_arrangement() {
        let embodied = Scenario::embodied_duel();
        let articulated = Scenario::articulated_duel();
        assert_eq!(embodied.name, "embodied-duel-v1");
        assert_eq!(embodied.combat_model, CombatModel::Embodied);
        assert_eq!(embodied.units, articulated.units);
        assert_eq!(embodied.combat_specs, articulated.combat_specs);
        assert_eq!(embodied.max_ticks, articulated.max_ticks);
        assert_eq!(embodied.fingerprint(), 0x1a1e_8e74_eecd_55d5);
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
        assert_eq!(slope.combat_model, flat.combat_model);

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

    fn descending_hero() -> UnitSpec {
        UnitSpec {
            kind: Body::Rogue,
            faction: Faction::Heroes,
            stats: Body::Rogue.base_stats(),
            loadout: Body::Rogue.default_loadout(),
            articulated: None,
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
        assert_eq!(arrived.loadout, hero.loadout);
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

    #[test]
    fn skirmish_spawns_the_requested_units_inside_the_arena() {
        let s = Scenario::skirmish(7, 4, 9);
        assert_eq!(s.count(Faction::Heroes), 4);
        assert_eq!(s.count(Faction::Monsters), 9);
        for u in &s.units {
            assert!(
                u.spawn.x > Fx::ZERO && u.spawn.x < s.arena().x,
                "{:?}",
                u.spawn
            );
            assert!(
                u.spawn.y > Fx::ZERO && u.spawn.y < s.arena().y,
                "{:?}",
                u.spawn
            );
        }
        // Factions start apart, so a run begins with an approach phase.
        let hero_max_x = s
            .units
            .iter()
            .filter(|u| u.faction == Faction::Heroes)
            .map(|u| u.spawn.x)
            .max()
            .unwrap();
        let monster_min_x = s
            .units
            .iter()
            .filter(|u| u.faction == Faction::Monsters)
            .map(|u| u.spawn.x)
            .min()
            .unwrap();
        assert!(hero_max_x < monster_min_x);
    }
}

