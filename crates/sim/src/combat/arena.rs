//! A duel described at runtime, beside the duel that is pinned.
//!
//! **Why a second constructor and not a parameter on the first.** The combat
//! spec-table digest `0x78e5b57ae0c6bbd6` and the `articulated-duel-v1`
//! fingerprint `0x068d05fcada1027b` both hash [`CombatSpecTableV1::fixtures`]
//! through `write_combat_specs`, and the golden registry's warning about that
//! table is blunt: a shield dimension moves four pins at once. But `fixtures()`
//! is a **function that builds a fresh `Vec` on every call** from five row
//! constructors -- not a registry, not a `static`, and nothing can register into
//! it. So a second constructor beside it is invisible to both digests, provided
//! the shared machinery underneath is not touched.
//!
//! The complete invariant this module lives under, and the reason it is written
//! here rather than in a plan that will be deleted:
//!
//! > Do not edit `fighter_anatomy`, `brute_anatomy`, `sword`, `shield`, `club`,
//! > `fixtures`, `articulated_duel`, `COMBAT_SPEC_SCHEMA_V1`, `write_anatomy`,
//! > `write_equipment`, `write_unit`, `write_combat_specs`, `write_surface`,
//! > `write_armor`, `ScenarioByteSink`, `scenario_v1_fields_into` or
//! > `action_definition_bytes`.
//!
//! Every knob here is already a field of a shipped type -- shield half-width and
//! half-height are [`EquipmentGeometry::Shield`], weapon length and radius are
//! [`EquipmentGeometry::Segment`], mass and balance are [`EquipmentSpec`] -- so
//! no writer changes, no record width changes, and nothing the digests read has
//! moved. `the_shipped_fixture_digest_is_unmoved_by_a_runtime_table` is what
//! says the invariant held rather than merely asserting it: it builds several
//! configurations and then recomputes both pinned numbers.

use crate::combat::spec::{
    brute_anatomy, club, fighter_anatomy, shield, sword, validate_construction, AnatomySpecId,
    ArticulatedUnitSpecV1, BodyAnatomySpec, CombatSpecError, CombatSpecTableV1, EquipmentGeometry,
    EquipmentSpec, EquipmentSpecId, GripBinding, COMBAT_SPEC_SCHEMA_V1,
};
use crate::dungeon::Dungeon;
use crate::entity::{Body, Faction};
use crate::scenario::{CombatModel, Scenario, UnitSpec};
use crate::{ActionKind, LimbSlot, Loadout, Role};
use fx::{Fx, Vec2};

/// Which shipped body a configured fighter wears.
///
/// A choice between the two shipped anatomy rows rather than a free
/// [`BodyAnatomySpec`], because an anatomy is not a dimension a picker gets to
/// move: `integrity_maxima`, `blood_max` and the five regional capsules are a
/// calibration, and a dropdown that could type one in would be inventing a body
/// nobody measured. The row is *cloned* and only its `id` is rewritten, so
/// `fighter_anatomy` and `brute_anatomy` stay exactly where the digests left
/// them.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum AnatomyChoice {
    Fighter,
    Brute,
}

impl AnatomyChoice {
    /// The shipped row, renumbered to `id`.
    fn row(self, id: AnatomySpecId) -> BodyAnatomySpec {
        let mut row = match self {
            AnatomyChoice::Fighter => fighter_anatomy(),
            AnatomyChoice::Brute => brute_anatomy(),
        };
        row.id = id;
        row
    }

    /// The legacy body that wears this anatomy.
    ///
    /// A scenario still needs a [`Body`] for its stat sheet, its radius and its
    /// mass, and the two shipped anatomies were cut from the two shipped bodies.
    /// Letting the two be chosen separately would allow a Skitterer's stat sheet
    /// on a Brute's frame, which is a fighter nobody has measured and which
    /// `dungeon_scenario` refuses in the other direction for the same reason.
    pub fn body(self) -> Body {
        match self {
            AnatomyChoice::Fighter => Body::Fighter,
            AnatomyChoice::Brute => Body::Brute,
        }
    }
}

/// One item in one hand: everything a picker may move about a piece of
/// equipment, and nothing else.
///
/// **The surface is deliberately absent.** `restitution`, `friction`,
/// `edge_factor` and `point_factor` are a measured material rather than a
/// dimension, so they come off the shipped row for the same [`ActionKind`] every
/// time -- see [`HandItemV1::shipped`]. A picker that could type in an edge
/// factor could make a club cut.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct HandItemV1 {
    pub action: ActionKind,
    pub mass: Fx,
    pub balance: Fx,
    pub geometry: EquipmentGeometry,
}

impl HandItemV1 {
    /// The shipped row for `action` as a hand item, or `None` for an action with
    /// no equipment row to copy.
    ///
    /// This is the starting point every configured item is an edit *of*: taking
    /// the four movable values off `sword()`, `shield()` or `club()` means a
    /// caller who changes one dimension has not silently agreed to a mass, a
    /// balance and a radius of somebody's choosing.
    pub fn shipped(action: ActionKind) -> Option<HandItemV1> {
        shipped_row(action).map(|row| HandItemV1 {
            action: row.action,
            mass: row.mass,
            balance: row.balance,
            geometry: row.geometry,
        })
    }
}

/// One side of a configured duel.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct DuelFighterV1 {
    pub anatomy: AnatomyChoice,
    /// What is in each hand: index 0 is [`LimbSlot::LeftArm`] and index 1 is
    /// [`LimbSlot::RightArm`].
    ///
    /// **This index is what the row's `binding` is set from**, and that is the
    /// whole mechanism that makes "a sword in the left hand" expressible at all
    /// -- `resolved_equipment` places an item by its `GripBinding` and never by
    /// its carrying-slot index, and the shipped `sword()` binds `Right`.
    pub hands: [Option<HandItemV1>; 2],
    /// The right hand's item is gripped by both hands: its row binds
    /// [`GripBinding::Both`] instead of `Right`.
    ///
    /// A flag beside the array rather than a third value of the hand index,
    /// because a two-handed grip is not a hand -- it is one item occupying two
    /// hands. The rule for what the second arm is doing is the actuator's
    /// standing one: **the left arm is the mirror**, driven by
    /// `mirror_two_handed` from the right arm's committed state, and it is not
    /// independently commandable -- a submitted left-arm target on a two-handed
    /// fighter is encoded and hashed but never actuated, exactly as
    /// `docs/reference/articulated-command-v1.md` specifies.
    ///
    /// Every refusal it can need already exists and is reached rather than
    /// restated: a plate cannot bind `Both` (`validate_equipment`), and `Both`
    /// beside a second carried item is a grip conflict (`validate_bindings`).
    /// The one rule [`Scenario::duel_from`] adds itself is that the flag with an
    /// empty right hand is a grip conflict too, because no validator ever sees a
    /// binding that has no row to sit on.
    pub two_handed: bool,
    /// Where this fighter stands.
    ///
    /// **The one field here with no bound of its own.** Every dimension above
    /// runs through `validate_equipment`; a spawn runs through nothing until
    /// [`crate::World::try_new`] checks it against the contact envelope. See
    /// [`Scenario::duel_from`] for which gate owns what, and why a caller must
    /// open the result with `try_new`.
    pub spawn: Vec2,
}

/// A duel, described.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct DuelConfigV1 {
    /// Index 0 fights for [`Faction::Heroes`] and index 1 for
    /// [`Faction::Monsters`]. Fixed rather than chosen, because the faction is
    /// what decides the spawn bearing and what every runner in the repository
    /// reads a win rate off; a configuration that could put both fighters on one
    /// side would be a fight with no loser.
    pub fighters: [DuelFighterV1; 2],
    pub max_ticks: u32,
}

impl DuelConfigV1 {
    /// The configuration whose table is [`CombatSpecTableV1::fixtures`] row for
    /// row: a Fighter with the shield in its left hand and the sword in its
    /// right, against a Brute with the club in its right.
    ///
    /// **What [`Scenario::duel_from`] makes of it is still not the pinned
    /// fixture, and that is the point.** It builds the same table, the same unit
    /// rows and the same placement under a different scenario name, so
    /// [`Scenario::fingerprint`] answers a different number and a fight recorded
    /// against it is not offered as the pin by accident.
    /// `the_shipped_arrangement_is_expressible` is what says the rows agree and
    /// `a_configured_duel_is_never_the_pinned_fixture` is what says the
    /// identities do not.
    ///
    /// **That separation is a convention and not an invariant.** The name is the
    /// *only* byte that differs -- `the_shipped_arrangement_is_expressible`
    /// proves it by comparing the whole `Scenario` -- and [`Scenario::name`] is
    /// a `pub String`, so writing `"articulated-duel-v1"` into it reproduces
    /// `0x068d05fcada1027b` exactly, which the second half of
    /// `a_configured_duel_is_never_the_pinned_fixture` asserts rather than
    /// leaves to be discovered. The constructor names a configured duel; nothing
    /// afterwards defends the name. Making it defensible would mean a private
    /// field and a constructor on a type that every scenario in this repository
    /// builds as a struct literal, which is a much larger change than the
    /// mistake it would prevent.
    ///
    /// It exists so that a caller changing one dimension is changing one thing.
    ///
    /// [`Scenario::name`]: Scenario
    pub fn shipped() -> DuelConfigV1 {
        let item = |action| HandItemV1::shipped(action).expect("a shipped action");
        DuelConfigV1 {
            fighters: [
                DuelFighterV1 {
                    anatomy: AnatomyChoice::Fighter,
                    hands: [
                        Some(item(ActionKind::Shield)),
                        Some(item(ActionKind::Sword)),
                    ],
                    two_handed: false,
                    spawn: Vec2::from_ints(7, 6),
                },
                DuelFighterV1 {
                    anatomy: AnatomyChoice::Brute,
                    hands: [None, Some(item(ActionKind::Club))],
                    two_handed: false,
                    spawn: Vec2::from_ints(17, 10),
                },
            ],
            max_ticks: 60 * 60,
        }
    }
}

/// The shipped equipment row an action takes its surface and its defaults from,
/// or `None`.
///
/// Three rows and eight actions, so the mapping is partial on purpose; see
/// [`CombatSpecError::UnknownAction`] for why the missing five are refused
/// rather than approximated.
fn shipped_row(action: ActionKind) -> Option<EquipmentSpec> {
    match action {
        ActionKind::Sword => Some(sword()),
        ActionKind::Shield => Some(shield()),
        ActionKind::Club => Some(club()),
        _ => None,
    }
}

/// Which hand fills each carrying slot: `[carrying slot] -> hand index`.
///
/// **A guard never takes slot zero while the fighter is also carrying something
/// that can answer a blow.** Slot zero is [`Loadout::primary`], which is what a
/// fighter walks in holding (`spawn_validated` sets `slot = 0`) and what
/// `action_of` reads; ordering the slots by hand instead would give every
/// sword-and-board fighter a plate as its in-hand action and would make the
/// shipped fixture's own arrangement -- `Loadout::pair(Sword, Shield)`, carried
/// `[sword, shield]` -- unreachable from a picker. Otherwise the left hand comes
/// first, so the rule is total and reads the same on a fighter carrying two
/// blades as on one carrying two guards.
fn carrying_order(hands: &[Option<HandItemV1>; 2]) -> [Option<usize>; 2] {
    match (hands[0], hands[1]) {
        (Some(left), Some(right)) if is_guard(left.action) && !is_guard(right.action) => {
            [Some(1), Some(0)]
        }
        (Some(_), Some(_)) => [Some(0), Some(1)],
        (Some(_), None) => [Some(0), None],
        (None, Some(_)) => [Some(1), None],
        (None, None) => [None, None],
    }
}

fn is_guard(action: ActionKind) -> bool {
    matches!(action.spec().role, Role::Guard)
}

impl Scenario {
    /// A two-fighter articulated scenario built from a runtime description.
    ///
    /// **Named `duel_from` and not `arena_duel`.** [`Scenario::arena`] already
    /// means the playable extent, and a second sense of "arena" in the same
    /// `impl` block is exactly the collision the house style exists to prevent.
    ///
    /// # The id order, which is part of the fingerprint
    ///
    /// Ids must be strictly ascending (`strict_ids`), and two fighters holding
    /// "a sword" of different lengths are two *distinct* equipment rows -- one
    /// row cannot be shared with two sets of dimensions. So the table is
    /// numbered `1..N` in a fixed, documented order, and the order is stated
    /// here rather than left to fall out of the loops because it reaches
    /// [`Scenario::fingerprint`]: insertion-order-by-accident is a fingerprint
    /// that moves when somebody rearranges a `for`.
    ///
    /// 1. **Anatomy.** Fighter A is id 1 and fighter B is id 2, always, and the
    ///    rows are never deduplicated. Two fighters wearing the `Fighter` frame
    ///    get two byte-identical rows under two ids, which the table's own rules
    ///    permit ("definitions with identical fields but different IDs remain
    ///    distinct"). Sharing one row would save 195 bytes and would have to be
    ///    undone the moment [`AnatomyChoice`] grows a per-fighter dimension --
    ///    and undoing it would renumber the table under everything recorded
    ///    against it.
    /// 2. **Equipment.** Fighters in order A then B; within a fighter, its
    ///    carrying slots in order 0 then 1; each present item takes the next id.
    ///    Up to four rows.
    /// 3. **Carrying slots** are filled by [`carrying_order`]: a guard yields
    ///    slot zero to anything that is not a guard, and otherwise the left hand
    ///    goes first.
    ///
    /// Under that order the configuration in [`DuelConfigV1::shipped`] produces
    /// the fixtures table exactly -- sword 1, shield 2, club 3, bound Right,
    /// Left, Right -- which is the strongest available evidence that the runtime
    /// builder and the shipped rows are describing the same thing.
    ///
    /// # What is derived rather than chosen
    ///
    /// `binding` comes from the hand index -- `Right` becoming `Both` when the
    /// fighter is [`DuelFighterV1::two_handed`] -- and the [`Loadout`] comes
    /// from the carrying slots, so `item.action == loadout.slot(n)` holds by
    /// construction and [`CombatSpecError::LoadoutMismatch`] is unreachable
    /// from any knob here. The surface comes from the shipped row for the item's action. What
    /// a caller is left holding is the set of numbers that are genuinely
    /// dimensions.
    ///
    /// The scenario is named `configured-duel-v1` and not
    /// `articulated-duel-v1`, for the reason `dungeon_scenario` renames its
    /// floors: a scenario built at runtime is a different scenario and its
    /// fingerprint has to say so, or a recorded fight can be mistaken for the
    /// pin. The name is the whole of that distinction and `Scenario.name` is
    /// public, so it is a convention a caller can undo -- see
    /// [`DuelConfigV1::shipped`], which states the limit and points at the test
    /// that measures it.
    pub fn duel_from(config: &DuelConfigV1) -> Result<Scenario, CombatSpecError> {
        let mut anatomies = Vec::with_capacity(config.fighters.len());
        let mut equipment = Vec::with_capacity(2 * config.fighters.len());
        let mut units = Vec::with_capacity(config.fighters.len());
        let mut next_id: EquipmentSpecId = 1;

        for (index, fighter) in config.fighters.iter().enumerate() {
            let anatomy_id = index as AnatomySpecId + 1;
            anatomies.push(fighter.anatomy.row(anatomy_id));

            // A two-handed grip with nothing in the right hand is refused here
            // and not left to `validate_rows`, because no `Both` row is ever
            // written for it -- the flag would silently mean "one-handed", and
            // a configuration that runs as something other than what it says is
            // the exact failure the noncanonical-buffer rule exists to prevent.
            // `GripConflict` rather than a new variant: both hands were asked
            // to grip a slot that holds nothing, and the error set is mapped
            // onto wasm failure codes one crate away.
            if fighter.two_handed && fighter.hands[1].is_none() {
                return Err(CombatSpecError::GripConflict);
            }

            let order = carrying_order(&fighter.hands);
            let mut carried: [Option<EquipmentSpecId>; 2] = [None; 2];
            let mut actions: [Option<ActionKind>; 2] = [None; 2];
            for (slot, hand) in order.iter().enumerate() {
                let Some(hand) = *hand else { continue };
                let item = fighter.hands[hand].expect("a carrying slot names a full hand");
                let row = shipped_row(item.action).ok_or(CombatSpecError::UnknownAction)?;
                equipment.push(EquipmentSpec {
                    id: next_id,
                    schema: COMBAT_SPEC_SCHEMA_V1,
                    action: item.action,
                    mass: item.mass,
                    balance: item.balance,
                    geometry: item.geometry,
                    // `Both` is written even when the left hand is also full:
                    // `validate_bindings` is the rule that refuses that pair by
                    // name, and pre-empting it here would leave the refusal a
                    // dead branch nothing can reach from a configuration.
                    binding: if hand == LimbSlot::LeftArm as usize {
                        GripBinding::Left
                    } else if fighter.two_handed {
                        GripBinding::Both
                    } else {
                        GripBinding::Right
                    },
                    surface: row.surface,
                });
                carried[slot] = Some(next_id);
                actions[slot] = Some(item.action);
                next_id += 1;
            }

            // Both hands empty is refused by name rather than left to
            // `validate_rows`, which would answer `LoadoutMismatch`. The full
            // argument, including why an `Option<ActionKind>` primary is not the
            // fix, is on `CombatSpecError::NoEquipment`.
            let loadout = match (actions[0], actions[1]) {
                (None, _) => return Err(CombatSpecError::NoEquipment),
                (Some(primary), None) => Loadout::single(primary),
                (Some(primary), Some(secondary)) => Loadout::pair(primary, secondary),
            };

            let body = fighter.anatomy.body();
            units.push(UnitSpec {
                kind: body,
                faction: if index == 0 { Faction::Heroes } else { Faction::Monsters },
                stats: body.base_stats(),
                loadout,
                articulated: Some(ArticulatedUnitSpecV1 { anatomy: anatomy_id, equipment: carried }),
                spawn: fighter.spawn,
            });
        }

        let scenario = Scenario {
            name: "configured-duel-v1".to_string(),
            combat_model: CombatModel::Articulated,
            combat_specs: Some(CombatSpecTableV1 { anatomies, equipment }),
            // The same 24x16 rectangle every hand-placed duel in the repository
            // stands on. Not a knob: the extent is the one thing here that would
            // change what "six units apart" means, and a picker that moved the
            // floor would be moving the fight rather than the fighters.
            dungeon: Dungeon::open(24, 16),
            portal: None,
            torches: Vec::new(),
            units,
            max_ticks: config.max_ticks,
        };
        // **One of the two gates, and the other one owns `spawn`.** This call
        // checks the *table*: schema, id order, every anatomy and equipment
        // dimension, the bindings, and each loadout against the rows the unit
        // carries. It runs here rather than at the first `fingerprint()` so that
        // a bad dimension is a `Result` at the picker and never a panic three
        // calls later, and it is what answers `Dimension` and `GripConflict`
        // from a knob. `NoEquipment` and `UnknownAction` are answered by the
        // loop above, before a table exists to validate.
        //
        // It says nothing about where a fighter stands. `World::try_new` runs a
        // second gate, `check_contact_envelope`, which bounds the arena extent
        // and the spawn against `CONTACT_COORDINATE_LIMIT` (256) -- `fx` fails
        // an out-of-contract sweep *closed*, so one out-of-envelope row would
        // manufacture a contact with every hostile collider in the arena.
        // `DuelFighterV1::spawn` is the one public field with no bound of its
        // own, so a configuration this constructor accepts and fingerprints can
        // still be a world that refuses to open.
        //
        // **Open it with `World::try_new` and never `World::new`.** The
        // panicking constructor turns that refusal into
        // `invalid combat construction: Contact(GeometryEnvelope)`, which a
        // caller holding somebody else's typing cannot answer.
        // `an_out_of_envelope_spawn_is_refused_by_try_new_and_not_by_duel_from`
        // is what keeps this paragraph honest; `duel_from` does not call the
        // envelope check itself because doing so would need a
        // `CombatSpecError` variant for a contact failure, and the error set is
        // mapped onto wasm failure codes one crate away.
        validate_construction(
            scenario.combat_model,
            scenario.combat_specs.as_ref(),
            &scenario.units,
        )?;
        Ok(scenario)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn item(action: ActionKind) -> HandItemV1 {
        HandItemV1::shipped(action).expect("a shipped action")
    }

    fn segment(length: Fx) -> EquipmentGeometry {
        EquipmentGeometry::Segment { length, radius: Fx::from_ratio(1, 25) }
    }

    /// A fighter holding one thing in one hand, at the origin.
    fn holding(anatomy: AnatomyChoice, hands: [Option<HandItemV1>; 2]) -> DuelFighterV1 {
        DuelFighterV1 { anatomy, hands, two_handed: false, spawn: Vec2::from_ints(7, 6) }
    }

    fn duel(a: DuelFighterV1, b: DuelFighterV1) -> DuelConfigV1 {
        let mut b = b;
        b.spawn = Vec2::from_ints(17, 10);
        DuelConfigV1 { fighters: [a, b], max_ticks: 60 * 60 }
    }

    #[test]
    fn the_shipped_fixture_digest_is_unmoved_by_a_runtime_table() {
        // **The whole point of the session.** A runtime table is a second
        // constructor beside `fixtures()`, and the claim that it is invisible to
        // the two pins is only worth anything if it is checked *after* several
        // of them have been built -- a shared `static`, a lazily-initialised
        // registry or a row constructor that had been edited to take a
        // parameter would all fail here and nowhere else.
        let long = HandItemV1 { geometry: segment(Fx::from_ratio(7, 4)), ..item(ActionKind::Sword) };
        let heavy = HandItemV1 { mass: Fx::from_int(3), ..item(ActionKind::Club) };
        let wide = HandItemV1 {
            geometry: EquipmentGeometry::Shield {
                half_width: Fx::from_ratio(7, 20),
                half_height: Fx::from_ratio(1, 2),
                thickness: Fx::from_ratio(1, 20),
            },
            ..item(ActionKind::Shield)
        };
        let built = [
            DuelConfigV1::shipped(),
            duel(
                holding(AnatomyChoice::Brute, [Some(wide), Some(long)]),
                holding(AnatomyChoice::Brute, [None, Some(heavy)]),
            ),
            duel(
                holding(AnatomyChoice::Fighter, [Some(long), None]),
                holding(AnatomyChoice::Fighter, [Some(wide), Some(long)]),
            ),
        ];
        for config in &built {
            let scenario = Scenario::duel_from(config).expect("a legal configuration");
            // Fingerprinted rather than merely built, because the fingerprint is
            // what walks the shared writers the invariant names.
            scenario.fingerprint();
        }

        // Recomputed, not remembered. Both numbers come out of the same
        // functions the pins are asserted against elsewhere; asserting them here
        // too is what makes this test fail loudly if a later session edits a
        // shipped row and re-records only the assertion beside it.
        let table = CombatSpecTableV1::fixtures();
        let mut digest = fx::Hash64::new();
        table.rows_into(
            &[
                ArticulatedUnitSpecV1 { anatomy: 1, equipment: [Some(1), Some(2)] },
                ArticulatedUnitSpecV1 { anatomy: 2, equipment: [Some(3), None] },
            ],
            &mut digest,
        );
        let table_digest = digest.finish();
        let fixture = Scenario::articulated_duel().fingerprint();
        // Printed, so the session that has to say "unmoved" has a command that
        // says it rather than a test name that implies it:
        // `cargo test -p sim -- --nocapture the_shipped_fixture_digest`.
        println!("after {} runtime tables:", built.len());
        println!("  combat spec-table digest        {table_digest:#018x}");
        println!("  articulated-duel-v1 fingerprint {fixture:#018x}");
        assert_eq!(table_digest, 0x78e5_b57a_e0c6_bbd6, "the combat spec-table digest moved");
        assert_eq!(fixture, 0x068d_05fc_ada1_027b, "the articulated-duel-v1 fingerprint moved");
    }

    #[test]
    fn the_shipped_arrangement_is_expressible() {
        // A picker that cannot describe the fixture it sits beside would be a
        // picker whose fights are not comparable with the gate's.
        //
        // **Widened to the whole `Scenario`, because the comment here used to
        // claim more than the assertions did.** It said "everything except the
        // name" while comparing the spec table and a five-column tuple per unit,
        // which left `stats`, `dungeon`, `portal`, `torches`, `max_ticks` and
        // `combat_model` unchecked. All six were already equal -- the claim was
        // true and nothing was measuring it. The wide form is also what
        // `a_configured_duel_is_never_the_pinned_fixture` needs: substituting one
        // field and getting equality is the proof that the name is the *only*
        // differing byte, and that proof is what makes the "cannot be the pin"
        // guarantee a convention rather than an invariant.
        let scenario = Scenario::duel_from(&DuelConfigV1::shipped()).expect("the shipped pair");
        assert_eq!(scenario.combat_specs, Some(CombatSpecTableV1::fixtures()));
        let mut fixture = Scenario::articulated_duel();
        assert_ne!(scenario.name, fixture.name, "the two are told apart by the name");
        fixture.name = scenario.name.clone();
        assert_eq!(scenario, fixture, "a described duel differs from the fixture somewhere else");
    }

    #[test]
    fn a_configured_duel_is_never_the_pinned_fixture() {
        // The one difference the test above leaves, stated as an assertion --
        // and then the honest limit of it. `duel_from` names what it builds, and
        // a scenario carrying that name fingerprints to something that is not
        // the pin. But `Scenario.name` is a `pub String` and the name is the
        // whole of the difference, so two public field writes put the pin's own
        // number back. The second half is here so nobody reads the first half as
        // the stronger claim; the guarantee is a convention a caller can undo,
        // which is a thing to know before recording evidence against a name.
        let scenario = Scenario::duel_from(&DuelConfigV1::shipped()).expect("the shipped pair");
        assert_eq!(scenario.name, "configured-duel-v1");
        assert_ne!(scenario.fingerprint(), 0x068d_05fc_ada1_027b);

        let mut renamed = scenario.clone();
        renamed.name = "articulated-duel-v1".to_string();
        assert_eq!(
            renamed.fingerprint(),
            0x068d_05fc_ada1_027b,
            "the name is the whole distinction, and a caller can rewrite it"
        );

        // And it is a scenario a world will actually open, which construction
        // validity alone does not promise: `spawn` resolves every binding.
        // Through `try_new` because that is what the constructor's own comment
        // tells a caller to use.
        let world = crate::World::try_new(&scenario, 3).expect("a world the described duel opens");
        assert_eq!(world.alive_ids(Faction::Heroes).len(), 1);
        assert_eq!(world.alive_ids(Faction::Monsters).len(), 1);
    }

    #[test]
    fn an_out_of_envelope_spawn_is_refused_by_try_new_and_not_by_duel_from() {
        // The boundary between the two gates, as a measurement rather than a
        // paragraph. `spawn` is the one public field a picker moves that
        // `validate_construction` says nothing about, and the browser is about
        // to be handed this type -- so "a legal configuration can still be an
        // unopenable world" has to be written down somewhere that fails when it
        // stops being true.
        //
        // 300 is past `CONTACT_COORDINATE_LIMIT` (256, `crates/sim/src/world.rs`)
        // and well inside `Fx`'s range, so it is the spawn bound that answers and
        // not saturation.
        let mut config = DuelConfigV1::shipped();
        config.fighters[0].spawn = Vec2::from_ints(300, 6);
        let scenario = Scenario::duel_from(&config).expect("duel_from does not bound a spawn");
        // Fingerprinted too: the configuration is nameable and recordable right
        // up to the point where somebody tries to run it.
        scenario.fingerprint();
        assert_eq!(
            crate::World::try_new(&scenario, 3).err(),
            Some(crate::WorldBuildError::Contact(crate::ContactCapacityError::GeometryEnvelope)),
            "the envelope check is what owns a spawn"
        );
        // `World::new` is `try_new(..).expect(..)`, so the same scenario through
        // it is `invalid combat construction: Contact(GeometryEnvelope)` as a
        // panic. Not asserted here -- the assertion above is the same fact
        // without a backtrace in the test log -- but it is the reason the
        // constructor's comment tells a caller which one to use.
    }

    #[test]
    fn two_fighters_may_hold_differently_sized_swords() {
        // The strictly-ascending id rule, handled rather than worked around: one
        // row cannot carry two lengths, so two swords are two rows.
        let short = HandItemV1 { geometry: segment(Fx::from_ratio(3, 4)), ..item(ActionKind::Sword) };
        let long = HandItemV1 { geometry: segment(Fx::from_ratio(3, 2)), ..item(ActionKind::Sword) };
        let scenario = Scenario::duel_from(&duel(
            holding(AnatomyChoice::Fighter, [None, Some(short)]),
            holding(AnatomyChoice::Brute, [None, Some(long)]),
        ))
        .expect("two swords");
        let table = scenario.combat_specs.as_ref().expect("a table");
        assert_eq!(
            table.equipment.iter().map(|row| (row.id, row.action, row.binding, row.geometry))
                .collect::<Vec<_>>(),
            [
                (1, ActionKind::Sword, GripBinding::Right, segment(Fx::from_ratio(3, 4))),
                (2, ActionKind::Sword, GripBinding::Right, segment(Fx::from_ratio(3, 2))),
            ]
        );
        assert_eq!(table.anatomies.iter().map(|row| row.id).collect::<Vec<_>>(), [1, 2]);
        scenario.fingerprint();
    }

    #[test]
    fn a_sword_can_be_put_in_the_left_hand() {
        // `binding` picks the hand and the carrying-slot index does not, so the
        // shipped `sword()`'s `Right` is a default and not a property of swords.
        let scenario = Scenario::duel_from(&duel(
            holding(AnatomyChoice::Fighter, [Some(item(ActionKind::Sword)), None]),
            holding(AnatomyChoice::Brute, [None, Some(item(ActionKind::Club))]),
        ))
        .expect("a left-handed sword");
        let table = scenario.combat_specs.as_ref().expect("a table");
        assert_eq!(table.equipment[0].binding, GripBinding::Left);
        assert_eq!(
            crate::combat::spec::resolved_equipment(table, scenario.units[0].articulated.unwrap()),
            Ok([Some(1), None]),
            "the blade did not land on the left arm"
        );
    }

    #[test]
    fn a_shield_in_the_primary_slot_validates() {
        // The genuinely untested path this opens. Every existing construction is
        // `Loadout::pair(Sword, Shield)`, and `action_definition_bytes` writes
        // `spec.role.discriminant()`, so a `Role::Guard` primary is legal, in
        // the identity stream, and until now unexercised.
        let scenario = Scenario::duel_from(&duel(
            holding(AnatomyChoice::Fighter, [Some(item(ActionKind::Shield)), None]),
            holding(AnatomyChoice::Brute, [None, Some(item(ActionKind::Club))]),
        ))
        .expect("a fighter carrying only a guard");
        assert_eq!(scenario.units[0].loadout, Loadout::single(ActionKind::Shield));
        assert_eq!(scenario.units[0].loadout.primary.spec().role, Role::Guard);
        assert!(scenario.try_fingerprint().is_ok());
        crate::World::try_new(&scenario, 3).expect("a guard in slot zero opens a world");
    }

    #[test]
    fn a_guard_yields_the_primary_slot_to_a_blade() {
        // The half of `carrying_order` that is a decision rather than a
        // fallback, asserted in both hand orders so it is the role and not the
        // hand that decides.
        for hands in [
            [Some(item(ActionKind::Shield)), Some(item(ActionKind::Sword))],
            [Some(item(ActionKind::Sword)), Some(item(ActionKind::Shield))],
        ] {
            let scenario = Scenario::duel_from(&duel(
                holding(AnatomyChoice::Fighter, hands),
                holding(AnatomyChoice::Brute, [None, Some(item(ActionKind::Club))]),
            ))
            .expect("sword and board");
            assert_eq!(
                scenario.units[0].loadout,
                Loadout::pair(ActionKind::Sword, ActionKind::Shield)
            );
        }
    }

    #[test]
    fn the_arena_fingerprint_is_stable_for_a_configuration() {
        // A recorded fight names the configuration it came from, so the number
        // has to be a function of the configuration and of nothing else.
        let base = DuelConfigV1::shipped();
        let first = Scenario::duel_from(&base).expect("the shipped pair");
        let second = Scenario::duel_from(&base).expect("the shipped pair");
        assert_eq!(first.fingerprint(), second.fingerprint());

        let mut moved = base;
        moved.fighters[0].hands[1] = Some(HandItemV1 {
            geometry: segment(Fx::from_ratio(19, 20) + Fx::from_raw(1)),
            ..item(ActionKind::Sword)
        });
        assert_ne!(
            Scenario::duel_from(&moved).expect("a longer blade").fingerprint(),
            first.fingerprint(),
            "one raw unit of blade did not reach the fingerprint"
        );

        // The grip is part of the fight's identity too: the flag reaches the
        // row's binding byte, which `write_equipment` hashes.
        let mut gripped = base;
        gripped.fighters[1].two_handed = true;
        assert_ne!(
            Scenario::duel_from(&gripped).expect("a two-handed club").fingerprint(),
            first.fingerprint(),
            "the two-handed grip did not reach the fingerprint"
        );

        // And the order of the two fighters is part of it: the same two fighters
        // on opposite sides is a different fight, not the same one relabelled.
        let mut swapped = base;
        swapped.fighters.swap(0, 1);
        assert_ne!(
            Scenario::duel_from(&swapped).expect("the pair, swapped").fingerprint(),
            first.fingerprint()
        );
    }

    #[test]
    fn a_fighter_with_no_equipment_is_refused_by_name() {
        // The specific error and not any error: `Loadout::primary` is not an
        // `Option`, so `validate_rows` would call this a `LoadoutMismatch`,
        // which is true about the table and useless in front of a person who
        // set both dropdowns to "empty".
        let empty = duel(
            holding(AnatomyChoice::Fighter, [None, None]),
            holding(AnatomyChoice::Brute, [None, Some(item(ActionKind::Club))]),
        );
        assert_eq!(Scenario::duel_from(&empty), Err(CombatSpecError::NoEquipment));
        let empty_second = duel(
            holding(AnatomyChoice::Fighter, [None, Some(item(ActionKind::Sword))]),
            holding(AnatomyChoice::Brute, [None, None]),
        );
        assert_eq!(Scenario::duel_from(&empty_second), Err(CombatSpecError::NoEquipment));
    }

    #[test]
    fn an_action_with_no_shipped_row_is_refused_by_name() {
        // Five of the eight actions have no equipment row and therefore no
        // measured surface. Refused rather than approximated to whichever row
        // looks nearest.
        let bow = HandItemV1 {
            action: ActionKind::Bow,
            ..item(ActionKind::Sword)
        };
        let config = duel(
            holding(AnatomyChoice::Fighter, [None, Some(bow)]),
            holding(AnatomyChoice::Brute, [None, Some(item(ActionKind::Club))]),
        );
        assert_eq!(Scenario::duel_from(&config), Err(CombatSpecError::UnknownAction));
    }

    #[test]
    fn a_dimension_off_the_end_of_the_scale_is_refused() {
        // `validate_equipment` bounds every dimension at 8 and every mass in
        // `(0, 8]`, and a picker reaches all of them. One assertion per bound it
        // can cross, because they are separate branches that answer the same
        // variant and a single case would leave two of them untested.
        let with = |geometry, mass| {
            let blade = HandItemV1 { mass, geometry, ..item(ActionKind::Sword) };
            duel(
                holding(AnatomyChoice::Fighter, [None, Some(blade)]),
                holding(AnatomyChoice::Brute, [None, Some(item(ActionKind::Club))]),
            )
        };
        let sane = Fx::from_ratio(31, 25);
        assert_eq!(
            Scenario::duel_from(&with(segment(Fx::from_int(9)), sane)),
            Err(CombatSpecError::Dimension),
            "a nine-unit blade"
        );
        assert_eq!(
            Scenario::duel_from(&with(segment(Fx::from_int(-1)), sane)),
            Err(CombatSpecError::Dimension),
            "a blade of negative length"
        );
        assert_eq!(
            Scenario::duel_from(&with(segment(Fx::ONE), Fx::ZERO)),
            Err(CombatSpecError::Dimension),
            "a massless blade"
        );
        assert_eq!(
            Scenario::duel_from(&with(segment(Fx::ONE), Fx::from_int(9))),
            Err(CombatSpecError::Dimension),
            "a nine-unit mass"
        );
        assert!(Scenario::duel_from(&with(segment(Fx::from_int(8)), Fx::from_int(8))).is_ok());
    }

    #[test]
    fn a_two_handed_shield_is_refused_by_name() {
        // `validate_equipment`'s standing rule -- a plate cannot bind `Both` --
        // reached for the first time from a configuration rather than from a
        // hand-written spec row. Bounded from the other side by the club: the
        // same flag on a segment is a legal table.
        let mut config = duel(
            holding(AnatomyChoice::Fighter, [None, Some(item(ActionKind::Shield))]),
            holding(AnatomyChoice::Brute, [None, Some(item(ActionKind::Club))]),
        );
        config.fighters[0].two_handed = true;
        assert_eq!(Scenario::duel_from(&config), Err(CombatSpecError::GripConflict));

        config.fighters[0].hands[1] = Some(item(ActionKind::Club));
        let scenario = Scenario::duel_from(&config).expect("a two-handed club validates");
        assert_eq!(scenario.combat_specs.as_ref().expect("a table").equipment[0].binding,
            GripBinding::Both);
    }

    #[test]
    fn a_second_carried_item_beside_a_two_handed_grip_is_refused_by_name() {
        // `validate_bindings` refuses `Both` beside any second item, and
        // `duel_from` deliberately writes the conflicting pair rather than
        // pre-empting it -- this is the test that the refusal is reachable from
        // a configuration at all. Both sides bounded: dropping the second item
        // makes the same flag legal.
        let mut config = duel(
            holding(AnatomyChoice::Brute,
                [Some(item(ActionKind::Shield)), Some(item(ActionKind::Club))]),
            holding(AnatomyChoice::Brute, [None, Some(item(ActionKind::Club))]),
        );
        config.fighters[0].two_handed = true;
        assert_eq!(Scenario::duel_from(&config), Err(CombatSpecError::GripConflict));

        config.fighters[0].hands[0] = None;
        assert!(Scenario::duel_from(&config).is_ok(), "the grip alone was the conflict");
    }

    #[test]
    fn a_two_handed_grip_on_an_empty_right_hand_is_refused() {
        // The one refusal `duel_from` owns itself: no row is ever written for
        // this flag, so no validator downstream would see it and the flag would
        // silently mean "one-handed". The left hand holding something does not
        // rescue it -- the flag names the right hand specifically.
        let mut config = duel(
            holding(AnatomyChoice::Fighter, [Some(item(ActionKind::Sword)), None]),
            holding(AnatomyChoice::Brute, [None, Some(item(ActionKind::Club))]),
        );
        config.fighters[0].two_handed = true;
        assert_eq!(Scenario::duel_from(&config), Err(CombatSpecError::GripConflict));
    }

    #[test]
    fn two_shields_are_refused_as_a_grip_conflict() {
        // `validate_bindings` classifies by `EquipmentGeometry::Shield` and not
        // by `ActionKind::Shield`, so this refusal cannot be evaded by naming
        // the second plate something else -- which is exactly what a
        // scenario-local table makes possible and is why the rule is written
        // against the geometry.
        let plate = item(ActionKind::Shield);
        let config = duel(
            holding(AnatomyChoice::Fighter, [Some(plate), Some(plate)]),
            holding(AnatomyChoice::Brute, [None, Some(item(ActionKind::Club))]),
        );
        assert_eq!(Scenario::duel_from(&config), Err(CombatSpecError::GripConflict));

        let disguised = HandItemV1 { action: ActionKind::Sword, ..plate };
        let config = duel(
            holding(AnatomyChoice::Fighter, [Some(plate), Some(disguised)]),
            holding(AnatomyChoice::Brute, [None, Some(item(ActionKind::Club))]),
        );
        assert_eq!(Scenario::duel_from(&config), Err(CombatSpecError::GripConflict));
    }
}
