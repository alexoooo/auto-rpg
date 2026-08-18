//! Fixtures shared by more than one `world` module's tests.
//!
//! A fixture lands here only when tests in two different modules need it. One
//! module's fixture stays in that module, so this file does not become the place
//! test setup goes to be forgotten.

use super::*;
#[cfg(feature = "cartesian-recoil")]
use super::hash::hash_exact_owners;

pub(super) fn duel_world() -> World {
    World::new(&Scenario::duel(), 1)
}

pub(super) fn articulated_command() -> ArticulatedCommandV1 {
    let arm = ArmTarget {
        bearing: Angle::QUARTER,
        height: crate::CombatHeight::MID,
        reach: Fx::ONE,
        effort: Fx::HALF,
    };
    ArticulatedCommandV1 {
        move_dir: Vec2::ZERO,
        body_yaw: Angle::QUARTER,
        intent: Intent::Hold,
        arms: [arm; 2],
        grips: [GripRequest::Keep; 2],
        releases: [ReleaseRequest::Keep; 2],
    }
}

pub(super) fn both_scenario() -> Scenario {
    let mut scenario = Scenario::articulated_duel();
    let mut both = crate::club();
    both.id = 4;
    both.binding = crate::GripBinding::Both;
    scenario.combat_specs.as_mut().unwrap().equipment.push(both);
    scenario.units[1].articulated.as_mut().unwrap().equipment = [Some(4), None];
    scenario.units[1].loadout = Loadout::single(ActionKind::Club);
    scenario
}

#[cfg(feature = "cartesian-recoil")]
pub(super) fn exact_owner_rows_hash(world: &World) -> u64 {
    let mut h = Hash64::new();
    hash_exact_owners(&mut h, &world.exact_owners);
    h.finish()
}

#[cfg(feature = "cartesian-recoil")]
pub(super) fn exact_affine_is_zero(row: ExactAffine3) -> bool {
    row.at_group == [ExactPosition::default(); 3]
        && row.momentum == [ExactMomentum::default(); 3]
        && row.group_time_raw == 0
}

#[cfg(feature = "cartesian-recoil")]
pub(super) struct Smart60Entry {
    pub(super) world: World,
    pub(super) limb: usize,
    pub(super) target: ArmTarget,
}

#[cfg(feature = "cartesian-recoil")]
pub(super) fn smart_60_entry(reflected: bool) -> Smart60Entry {
    let centre = Vec2::from_ints(12, 8);
    let offset = Vec2::new(Fx::from_int(-2),
        if reflected { Fx::ONE } else { -Fx::ONE });
    let mut config = crate::DuelConfigV1::shipped();
    config.fighters[0].spawn = centre + offset;
    config.fighters[1].spawn = centre;
    config.fighters[1].anatomy = crate::AnatomyChoice::Fighter;
    if reflected { for fighter in &mut config.fighters { fighter.hands.swap(0, 1); } }
    let limb = if reflected { LimbSlot::LeftArm as usize }
        else { LimbSlot::RightArm as usize };
    config.fighters[0].hands[limb].as_mut().expect("the declared sword").geometry =
        EquipmentGeometry::Segment { length: Fx::from_int(2),
                                     radius: Fx::from_ratio(1, 25) };
    config.max_ticks = 49;
    let scenario = Scenario::duel_from(&config).expect("the Smart60 duel is legal");
    let mut world = World::new(&scenario, 0);
    let attacker = world.id_of(0); let defender = world.id_of(1);
    let declared = (-offset).angle();
    let eighth = Angle::QUARTER.raw() / 2;
    let chamber = Angle::from_raw(if reflected {
        declared.raw().wrapping_add(eighth)
    } else { declared.raw().wrapping_sub(eighth) });
    let follow = Angle::from_raw(if reflected {
        declared.raw().wrapping_sub(eighth)
    } else { declared.raw().wrapping_add(eighth) });
    // Smart41 removed perception from the bearing source only. The frozen
    // corpus still derives its target height from this one tick-zero
    // observation, so retain that input byte for byte here.
    let shown = world.observe_articulated(attacker);
    let foe = shown.opponents().first().expect("the target is observed");
    let legs = foe.regions[BodyPart::Legs as usize];
    let local_height = (legs.lower.z + legs.upper.z) / Fx::from_int(2)
        - foe.body_position.z;
    let height = crate::CombatHeight::try_from_raw(
        (local_height / shown.standing_height).clamp(Fx::ZERO, Fx::ONE).raw())
        .expect("the observed legs centre is a legal height");
    let make = |world: &World, bearing| {
        let mut command = world.neutral_articulated(0);
        command.intent = Intent::Attack(defender);
        command.arms[limb] = ArmTarget { bearing, height, reach: Fx::from_raw(32_768),
                                         effort: Fx::ONE };
        command
    };
    for tick in 0..33 {
        let command = make(&world, if tick < 16 { chamber } else { follow });
        let held = world.neutral_articulated(1);
        assert!(matches!(world.submit_articulated_v1(attacker, command),
                         SubmitArticulatedOutcome::Stored { rejection: None, .. }));
        assert!(matches!(world.submit_articulated_v1(defender, held),
                         SubmitArticulatedOutcome::Stored { rejection: None, .. }));
        world.step_with_arm_rates(CAPTURED_ARM_RATES.0, CAPTURED_ARM_RATES.1);
    }
    let target = make(&world, follow).arms[limb];
    Smart60Entry { world, limb, target }
}

#[cfg(feature = "cartesian-recoil")]
pub(super) fn mapped_arm_words(plain: ArmState, mirror: ArmState) -> bool {
    plain.bearing.raw().wrapping_add(mirror.bearing.raw()) == 0
        && plain.height == mirror.height && plain.reach == mirror.reach
        && plain.hand.x == mirror.hand.x && plain.hand.y == -mirror.hand.y
        && plain.hand.z == mirror.hand.z
        && plain.previous_hand.x == mirror.previous_hand.x
        && plain.previous_hand.y == -mirror.previous_hand.y
        && plain.previous_hand.z == mirror.previous_hand.z
        && plain.linear_velocity.x == mirror.linear_velocity.x
        && plain.linear_velocity.y == -mirror.linear_velocity.y
        && plain.linear_velocity.z == mirror.linear_velocity.z
        && plain.post_contact_com_velocity.x == mirror.post_contact_com_velocity.x
        && plain.post_contact_com_velocity.y == -mirror.post_contact_com_velocity.y
        && plain.post_contact_com_velocity.z == mirror.post_contact_com_velocity.z
        && plain.post_contact_active == mirror.post_contact_active
        && plain.fatigue == mirror.fatigue && plain.work_residue == mirror.work_residue
}

/// A fighter and a brute a unit and a half apart -- inside each other's
/// weapons -- with every named body's regions scaled down to one raw unit
/// of integrity.
///
/// The scaling is the fixture's whole point and it is not a cheat. V2-14
/// dissipates a few thousand raw units of energy into a contact this size,
/// and a full two-unit region absorbs that without noticing; shrinking the
/// body is how a test asks about the wound rule rather than about how hard
/// the solver happens to hit. `docs/reference/articulated-mechanical-gate.md`
/// names the same trick for its severance case.
pub(super) fn fragile_scenario(fragile: &[usize]) -> Scenario {
    let mut scenario = Scenario::articulated_duel();
    scenario.units[0].spawn = Vec2::from_ints(10, 8);
    scenario.units[1].spawn = Vec2::new(Fx::from_ratio(23, 2), Fx::from_int(8));
    for &at in fragile {
        scenario.combat_specs.as_mut().unwrap().anatomies[at].integrity_maxima =
            [Fx::from_raw(1); BodyPart::COUNT];
    }
    scenario
}

/// Hold one slot's right-hand weapon straight out along its own facing.
///
/// Written onto the joint pose rather than driven there by commands. The
/// actuator would take some tens of ticks to extend an arm and would carry
/// fatigue and a hand velocity into the answer; what these tests are about
/// is the wound a contact makes, and the pose is the fixture, not the
/// question.
pub(super) fn brace_weapon(world: &mut World, i: usize) {
    let spec = world.anatomy_spec(i).cloned().expect("articulated anatomy");
    let yaw = world.body_yaw[i].angle;
    let hand = actuator::hand_position(&spec, yaw, 1, yaw, crate::CombatHeight::MID, Fx::ONE);
    world.arms[i][1].bearing = yaw;
    world.arms[i][1].reach = Fx::ONE;
    world.arms[i][1].hand = hand;
    world.arms[i][1].previous_hand = hand;
}

/// Run the tick's contact, anatomy, and reap phases with explicit body
/// velocities, exactly as `World::step` orders them.
///
/// The velocity is written onto the column the solver reads instead of
/// being coaxed out of a `move_dir`, for the same reason the pure fixtures
/// in `combat::resolution` do it: a stat-driven charge tests the actuator,
/// and would stop testing this the first time a stat moved.
pub(super) fn resolve_closing(world: &mut World, closing: &[(usize, Fx)]) {
    world.retain_contact_entry();
    world.record_contact_locomotion();
    for &(i, speed) in closing { world.vel[i] = Vec2::new(speed, Fx::ZERO); }
    world.resolve_contact();
    world.settle_anatomy();
    world.reap_dead_articulated();
}

/// The braced fighter, the closing brute, and the region the sword chose.
pub(super) fn braced_thrust(scenario: &Scenario) -> (World, u8) {
    let mut world = World::new(scenario, 1000);
    brace_weapon(&mut world, 0);
    resolve_closing(&mut world, &[(1, -Fx::ONE)]);
    let region = world.contact_resolutions().iter()
        .find(|row| row.fact.key.kind == ContactKind::WeaponBody)
        .expect("the braced fixture reached no body").fact.volume;
    (world, region)
}

/// Take one arm off a live articulated body, the way a group that emptied
/// its integrity does, and run the tick that acts on it.
///
/// The severance is written rather than landed, and the reason is a
/// measurement rather than convenience: with this roster two braced weapons
/// meet hand to hand, so a blow aimed at the arm that *holds* a weapon
/// reaches the guard arm across the body instead. Landing one would be a
/// fixture about aiming; that a real blow severs the region it names is
/// `a_wounding_contact_records_its_region_shock_and_source`'s job, and this
/// test is about what a missing arm can no longer do.
pub(super) fn sever_arm(world: &mut World, i: usize, part: BodyPart) {
    world.wounds[i].parts[part as usize].integrity = Fx::ZERO;
    world.wounds[i].parts[part as usize].severed = true;
    world.retain_contact_entry();
    world.record_contact_locomotion();
    world.resolve_contact();
    world.settle_anatomy();
}

/// A fighter and a brute a unit and a half apart -- inside each other's
/// weapons -- with the reaching commands that make them touch.
///
/// Not `Scenario::articulated_duel()` unmodified: that fixture stands the
/// pair ten units apart and its spawns are pinned by
/// `articulated_duel_v1_has_the_frozen_identity_and_placement`, so a
/// contact fixture has to move them here.
pub(super) fn clinch_scenario() -> Scenario {
    let mut scenario = Scenario::articulated_duel();
    scenario.units[0].spawn = Vec2::from_ints(10, 8);
    scenario.units[1].spawn = Vec2::new(Fx::from_ratio(23, 2), Fx::from_int(8));
    scenario
}

pub(super) fn clinch_world() -> World {
    World::new(&clinch_scenario(), 1000)
}

pub(super) fn reaching_command(yaw: Angle, reach: Fx) -> ArticulatedCommandV1 {
    let arm = |reach| ArmTarget {
        bearing: yaw, height: crate::CombatHeight::MID, reach, effort: Fx::ONE,
    };
    ArticulatedCommandV1 {
        move_dir: Vec2::ZERO, body_yaw: yaw, intent: Intent::Hold,
        arms: [arm(Fx::from_ratio(1, 4)), arm(reach)],
        grips: [GripRequest::Keep; 2],
        releases: [ReleaseRequest::Keep; 2],
    }
}

/// Drive the clinch until it has resolved something, and answer the tick it
/// took. Panics rather than returning, because every caller's assertions
/// are vacuous without a fact.
pub(super) fn step_into_contact(world: &mut World) -> u32 {
    for tick in 0..60 {
        // Resolved from the live columns rather than written as `(0,0)` and
        // `(1,0)`: this is also called after a slot has been reused, and a
        // stale handle is refused rather than obeyed, which would leave the
        // brute holding a neutral command and the fixture proving nothing.
        for i in 0..world.alive.len() {
            if !world.alive[i] { continue; }
            let yaw = if i == 0 { Angle::ZERO } else { Angle::HALF };
            let reach = if i == 0 { Fx::ONE } else { Fx::from_ratio(1, 4) };
            world.submit_articulated_v1(world.id_of(i), reaching_command(yaw, reach));
        }
        world.step();
        if !world.contact_resolutions().is_empty() { return tick; }
    }
    panic!("the clinch fixture never resolved a contact");
}

/// The arm slew ceiling and acceleration the captured strikes were taken at.
///
/// Frozen here rather than read from `actuator`, and that is the whole
/// point of the pair existing. The tests below assert exact raw words about
/// *one* articulated configuration -- a normal of `(2_256, 65_497)`, a
/// closing quotient of `-6_345`, a time of impact of `55_702`. None of them
/// is about how fast an arm may slew; the slew rate only decides which tick
/// of the swing happens to touch, and therefore which configuration gets
/// frozen. Reading the production constants here made every one of those
/// words re-aim whenever somebody tuned the actuator, which is not a frozen
/// capture at all: doubling the pair on 2026-08-15 moved twelve of them at
/// once, and three of those read *each other's* captured words -- `64_858`
/// scales the proposal, which is where `5_626` came from, which is where
/// `(99, -64)` came from -- so re-recording would have meant re-deriving a
/// consistent chain by hand rather than reading an output back. One link in
/// that chain, `bounded_sliding_friction_rejects_the_actual_articulated_cone`,
/// asserts a *property* of the triple rather than its value, and a hand-fitted
/// replacement triple is exactly the shape of edit that leaves such a test
/// green while it stops proving anything.
///
/// So the fixture pins the rates it was measured at. A future actuator
/// change moves nothing here, and every argument below stays about the
/// solver. What would still move these words is a change to the contact
/// solver, the joint map or the fixed-point arithmetic under them, which is
/// what they exist to catch.
///
/// `smart_60_entry` and `smart_60_probe` *above* read it for the same
/// reason and were repaired the same day: their tick-33 entry and tick-34
/// recoil words -- `(-14_040, 14_040)`, `441_359` -- name one tick of one
/// swing, so the doubled pair did not disprove them, it aimed them at a
/// different tick. `crates/sim/src/exact_diagnostics.rs` carries the only
/// other copy of this pair -- for the two exact digests and `replay`'s
/// south-wall transcript, which are outside this `#[cfg(test)]` module and
/// so cannot read this one.
pub(super) const CAPTURED_ARM_RATES: (i32, i32) = (1_092, 182);

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(super) enum CartesianReject { AmbiguousDirection, UnrepresentableBoundary, Overflow }

pub(super) fn cartesian_hand_clamp(
    anatomy: &BodyAnatomySpec, yaw: Angle, limb: usize, requested: Vec3,
) -> Result<Vec3, CartesianReject> {
    let shoulder = actuator::shoulder(anatomy, yaw, limb);
    let z = requested.z.clamp(Fx::ZERO, anatomy.standing_height);
    let difference = |a: Fx, b: Fx| -> Result<Fx, CartesianReject> {
        let raw = a.raw() as i64 - b.raw() as i64;
        if raw < i32::MIN as i64 || raw > i32::MAX as i64 {
            Err(CartesianReject::Overflow)
        } else { Ok(Fx::from_raw(raw as i32)) }
    };
    let planar = Vec2::new(difference(requested.x, shoulder.x)?,
                           difference(requested.y, shoulder.y)?);
    let distance = planar.length();
    let minimum = anatomy.arm_length * Fx::from_raw(actuator::ARM_MIN_REACH_RAW);
    let bounded = if distance > anatomy.arm_length {
        Vec2::from_angle(planar.angle()) * anatomy.arm_length
    } else if distance < minimum {
        if planar == Vec2::ZERO {
            return Err(CartesianReject::AmbiguousDirection);
        } else { Vec2::from_angle(planar.angle()) * minimum }
    } else { planar };
    let bounded_length = bounded.length();
    if bounded_length < minimum || bounded_length > anatomy.arm_length {
        // Choosing a component to nudge would introduce an X/Y and mirror
        // tie-break into authority. Boundary integerization remains owed.
        return Err(CartesianReject::UnrepresentableBoundary);
    }
    let sum = |a: Fx, b: Fx| -> Result<Fx, CartesianReject> {
        let raw = a.raw() as i64 + b.raw() as i64;
        if raw < i32::MIN as i64 || raw > i32::MAX as i64 {
            Err(CartesianReject::Overflow)
        } else { Ok(Fx::from_raw(raw as i32)) }
    };
    Ok(Vec3::new(sum(shoulder.x, bounded.x)?, sum(shoulder.y, bounded.y)?, z))
}

/// One hero, one ally, and seven enemies strung out to the east at 1.6
/// units, which is exactly clear of two touching brutes.
pub(super) fn crowded_scenario() -> Scenario {
    let mut scenario = fragile_scenario(&[]);
    let monster = scenario.units[1];
    scenario.units.truncate(1);
    scenario.units[0].spawn = Vec2::from_ints(4, 8);
    for step in 0..7 {
        let mut unit = monster;
        // The nearest enemy wears the fighter's articulated row -- a shield
        // and a sword rather than the brute's single club -- so a test that
        // strips its equipment has both kinds of geometry to remove. A
        // monster in a fighter's body is legal and validated: it is the row
        // unit 0 already carries.
        if step == 0 {
            unit.kind = scenario.units[0].kind;
            unit.articulated = scenario.units[0].articulated;
            // The loadout has to move with it: construction validates that
            // the two agree slot for slot.
            unit.loadout = scenario.units[0].loadout;
        }
        unit.spawn = Vec2::new(Fx::from_int(5) + Fx::from_ratio(16 * step, 10), Fx::from_int(8));
        scenario.units.push(unit);
    }
    // Nearer than every enemy, so a list that admitted allies would put it
    // first and could not fail quietly.
    let mut ally = scenario.units[0];
    ally.spawn = Vec2::new(Fx::from_ratio(45, 10), Fx::from_int(8));
    scenario.units.push(ally);
    scenario
}

/// A world with a floor plan carved into it and **one** body in it. `#` is
/// masonry; see [`crate::dungeon::parse`].
///
/// One body rather than a duel's two, because these tests are about a body
/// against the level and a spare Brute standing in a corridor is not a
/// neutral bystander -- it is a second collision rule running, and the
/// first version of this helper produced a hero wedged between a wall and a
/// monster that had no business being there. Tests that want an opponent
/// add one; every caller places its body by hand anyway.
pub(super) fn carved_world(rows: &[&str]) -> World {
    let mut scenario = Scenario::duel();
    scenario.dungeon = crate::dungeon::parse(rows);
    scenario.units.truncate(1);
    scenario.units[0].spawn = Vec2::new(Fx::from_ratio(15, 10), Fx::from_ratio(15, 10));
    World::new(&scenario, 1)
}

// ------------------------------------------------------------------ doors

/// Two chambers with one shut doorway between them, and `body` standing in
/// the western one. `+` is the door; see [`crate::dungeon::parse`].
///
/// Three tiles across each way, because a Brute is 1.40 wide and this
/// fixture has to hold one -- half the point of it is that a Brute can
/// reach a door and still not open it.
pub(super) fn door_world(body: Body) -> World {
    let mut scenario = Scenario::duel();
    scenario.dungeon = crate::dungeon::parse(&[
        "#########", // 0
        "#...#...#", // 1
        "#...+...#", // 2  the doorway, at (4, 2)
        "#...#...#", // 3
        "#########", // 4
    ]);
    scenario.units.truncate(1);
    scenario.units[0].set_body(body);
    scenario.units[0].spawn = at_tile(2, 2);
    World::new(&scenario, 1)
}

/// The centre of a tile, which is where these fixtures place things.
pub(super) fn at_tile(tx: i32, ty: i32) -> Vec2 {
    Dungeon::tile_centre(tx, ty)
}

/// Hard against the western jamb of `door_world`'s doorway, whatever the
/// body is: its edge a tenth of a unit off the face at x = 4.
pub(super) fn against_the_jamb(w: &World, i: usize) -> Vec2 {
    Vec2::new(
        Fx::from_int(4) - w.radius[i] - Fx::from_ratio(1, 10),
        Fx::from_ratio(25, 10),
    )
}

pub(super) const EAST: Vec2 = Vec2 {
    x: Fx::ONE,
    y: Fx::ZERO,
};

/// `door_world`, with a monster of `body` standing in the eastern chamber
/// and the Heroes' Fighter in the western one. The Monsters hunt.
pub(super) fn penned_world(body: Body) -> World {
    let mut scenario = Scenario::duel();
    scenario.dungeon = crate::dungeon::parse(&[
        "#########", // 0
        "#...#...#", // 1
        "#...+...#", // 2
        "#...#...#", // 3
        "#########", // 4
    ]);
    scenario.units[0].spawn = at_tile(2, 2);
    scenario.units[1].set_body(body);
    scenario.units[1].spawn = at_tile(6, 2);
    let mut w = World::new(&scenario, 1);
    w.set_objective(Faction::Monsters, Objective::Hunt);
    w
}
