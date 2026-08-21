//! Fixtures shared by more than one `world` module's tests.
//!
//! A fixture lands here only when tests in two different modules need it. One
//! module's fixture stays in that module, so this file does not become the place
//! test setup goes to be forgotten.

use super::*;
#[cfg(feature = "cartesian-recoil")]
use super::hash::hash_exact_owners;

pub(super) fn duel_world() -> World {
    World::new(&Scenario::embodied_duel(), 1)
}

pub(super) fn command_core() -> CommandCoreV1 {
    let arm = ArmTarget {
        bearing: Angle::QUARTER,
        height: crate::CombatHeight::MID,
        reach: Fx::ONE,
        effort: Fx::HALF,
    };
    CommandCoreV1 {
        move_dir: Vec2::ZERO,
        body_yaw: Angle::QUARTER,
        intent: Intent::Hold,
        arms: [arm; 2],
        grips: [GripRequest::Keep; 2],
        releases: [ReleaseRequest::Keep; 2],
    }
}

/// The same six fields, wrapped for the surviving submission path.
///
/// `CommandCoreV1` is still the *inner* command type, so
/// `command_core` stays and this is a wrapper rather than a replacement:
/// a test that wants to talk about the payload wants the inner value, and a test
/// that wants to submit wants this. `CommandV1::new` supplies the
/// neutral swing plane, which is the plane the elbow hung in before the field
/// existed -- so a fixture with no opinion about the plane gets the old default
/// rather than a number somebody chose.
///
/// **The bearing is unchanged and is now read in the torso frame.**
/// `Angle::QUARTER` meant "world north" and now means "a quarter turn left of
/// the torso", which lands on world north only for a body holding
/// `Angle::ZERO` -- true of every body at spawn, and of every body these
/// fixtures never turn. A caller that turns its body first and still wants north
/// has to take the yaw off itself.
pub(super) fn embodied_command() -> crate::CommandV1 {
    crate::CommandV1::new(command_core())
}

pub(super) fn both_scenario() -> Scenario {
    let mut scenario = Scenario::embodied_duel();
    let mut both = crate::club();
    both.id = 4;
    both.binding = crate::GripBinding::Both;
    scenario.combat_specs.as_mut().unwrap().equipment.push(both);
    scenario.units[1].combat_spec.as_mut().unwrap().equipment = [Some(4), None];
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
    let shown = world.observe(attacker);
    let foe = shown.opponents().first().expect("the target is observed");
    let legs = foe.regions[BodyPart::Legs as usize];
    let local_height = (legs.lower.z + legs.upper.z) / Fx::from_int(2)
        - foe.body_position.z;
    let height = crate::CombatHeight::try_from_raw(
        (local_height / shown.standing_height).clamp(Fx::ZERO, Fx::ONE).raw())
        .expect("the observed legs centre is a legal height");
    // **The bearings go in unrotated, and that is a measurement rather than an
    // oversight.** The torso frame reads `ArmTarget::bearing` as an offset
    // from the yaw the body holds at submission, so a world bearing normally has
    // to have that yaw taken off it -- but every command here is built on
    // `neutral_core`, which asks for the yaw the body already has, and
    // both bodies spawn at `Angle::ZERO`. Slot 0 therefore never turns, the two
    // frames name the same world bearing for the whole of the swing, and
    // subtracting a yaw of zero would have been ceremony. Give this fixture a
    // body that turns and the subtraction becomes real.
    let make = |world: &World, bearing| {
        let mut command = world.neutral_core(0);
        command.intent = Intent::Attack(defender);
        command.arms[limb] = ArmTarget { bearing, height, reach: Fx::from_raw(32_768),
                                         effort: Fx::ONE };
        command
    };
    for tick in 0..33 {
        let command = make(&world, if tick < 16 { chamber } else { follow });
        let held = world.neutral_core(1);
        assert!(matches!(
            world.submit(attacker, crate::CommandV1::new(command)),
            crate::SubmitOutcome::Stored { rejection: None, .. }));
        assert!(matches!(
            world.submit(defender, crate::CommandV1::new(held)),
            crate::SubmitOutcome::Stored { rejection: None, .. }));
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
    let mut scenario = Scenario::embodied_duel();
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
///
/// **Through `reachable_pose`, and it was `hand_position` at `Fx::ONE` until
/// 2026-08-21, which is a pose no embodied body can hold.** `reach` is
/// measured from the *body*, not the shoulder: at `CombatHeight::MID` this
/// anatomy's shoulder sits half a unit above the braced hand, so a fully
/// extended `Fx::ONE` put the hand 59,073 raw from a shoulder whose two links
/// span 49,152 -- twenty per cent past the arm's own reach. Nothing noticed
/// while the contact commit re-derived the pose from scalars; the exact
/// anatomical projection added this session *does* notice, and corrected the
/// impossible pose mid-contact, which made every fixture built on it a
/// fixture about a body that cannot exist.
///
/// `reachable_extent` is what production always applies between a commanded
/// extent and a realised hand, and `reachable_pose` closes the last raw unit
/// of it. Skipping both was the shortcut, and it predates the elbow.
pub(super) fn brace_weapon(world: &mut World, i: usize) {
    let spec = world.anatomy_spec(i).cloned().expect("articulated anatomy");
    let yaw = world.body_yaw[i].angle;
    let links = crate::combat::limb::Elbow::of(&spec);
    let (height, reach, hand) = crate::combat::limb::reachable_pose(
        &spec, yaw, 1, yaw, crate::CombatHeight::MID, Fx::ONE, links);
    world.arms[i][1].bearing = yaw;
    world.arms[i][1].height = height;
    world.arms[i][1].reach = reach;
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
    world.reap_dead_bodies();
}

/// The braced fighter, the closing brute, and the region the sword chose.
///
/// The closing body starts one braced-hand's worth of correction nearer than
/// its spawn, for the reason [`brace_weapon`] gives: the braced hand came back
/// 12,518 raw when it stopped posing past its own arm, and the blade came with
/// it. Closing the gap by exactly that distance restores the geometry at the
/// moment of impact and leaves the closing speed -- and so the energy this
/// fixture's wounds are made of -- untouched.
pub(super) fn braced_thrust(scenario: &Scenario) -> (World, u8) {
    let mut world = World::new(scenario, 1000);
    brace_weapon(&mut world, 0);
    world.pos[1].x = world.pos[1].x - Fx::from_raw(12_518);
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
/// Not `Scenario::embodied_duel()` unmodified: that fixture stands the
/// pair ten units apart and its spawns are pinned by
/// `embodied_duel_v1_has_the_frozen_identity_and_the_articulated_arrangement`,
/// so a contact fixture has to move them here.
pub(super) fn clinch_scenario() -> Scenario {
    let mut scenario = Scenario::embodied_duel();
    scenario.units[0].spawn = Vec2::from_ints(10, 8);
    scenario.units[1].spawn = Vec2::new(Fx::from_ratio(23, 2), Fx::from_int(8));
    scenario
}

pub(super) fn clinch_world() -> World {
    World::new(&clinch_scenario(), 1000)
}

/// Face `yaw` and reach along it.
///
/// **`yaw` is a world angle for the torso and no longer one for the arms**, and
/// the difference matters on the first few ticks. Read from the torso an
/// `ArmTarget::bearing` is an offset from the yaw the body is holding *at
/// submission* -- not the yaw the same command asks for -- so writing `yaw` into
/// both fields aimed the arm at twice it and swung the reaching hand away from
/// the opponent as the body turned. The bearing is `Angle::ZERO` instead, which
/// is "straight ahead of the torso": it agrees with `yaw` from the moment the
/// body has finished turning, and it is a request the arm can hold at every yaw
/// on the way there rather than one that unwinds itself.
///
/// The consequence for a caller that submits once and steps once: the arm points
/// along the body's *current* facing, not along `yaw`. Bodies spawn at
/// `Angle::ZERO`, so a caller wanting a westward reach has to let the yaw
/// arrive -- which is what `step_into_contact` re-submitting every tick does.
pub(super) fn reaching_command(yaw: Angle, reach: Fx) -> CommandCoreV1 {
    let arm = |reach| ArmTarget {
        bearing: Angle::ZERO, height: crate::CombatHeight::MID, reach, effort: Fx::ONE,
    };
    CommandCoreV1 {
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
            world.submit(world.id_of(i),
                crate::CommandV1::new(reaching_command(yaw, reach)));
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
/// *one* embodied configuration -- a normal of `(7_810, 65_069)`, a
/// closing quotient of `-5_539`, a time of impact of `30_514`. None of them
/// is about how fast an arm may slew; the slew rate only decides which tick
/// of the swing happens to touch, and therefore which configuration gets
/// frozen. Reading the production constants here made every one of those
/// words re-aim whenever somebody tuned the actuator, which is not a frozen
/// capture at all: doubling the pair on 2026-08-15 moved twelve of them at
/// once, and three of those read *each other's* captured words -- `64_982`
/// scales the proposal, which is where `4_921` came from, which is where
/// `(-332, -64)` came from -- so re-recording would have meant re-deriving a
/// consistent chain by hand rather than reading an output back. One link in
/// that chain, `bounded_sliding_friction_rejects_the_actual_articulated_cone`,
/// asserts a *property* of the triple rather than its value, and a hand-fitted
/// replacement triple is exactly the shape of edit that leaves such a test
/// green while it stops proving anything.
///
/// That chain re-recorded once more with the embodied reseat, and **not for
/// the reason the Smart60 words below moved -- one cause does not cover
/// both.** `directional_captured_strike` had to be re-placed and re-aimed:
/// the spacing went from `631/50` to `1256/100` and the target height from
/// `CombatHeight::LOW` to `61/128`. At `LOW`, `reachable_extent` folds this
/// anatomy back to `ARM_MIN_REACH_RAW` and leaves the hand under the
/// shoulder -- a commanded `(16_384, 65_536)` is held as `(24_532, 16_384)`
/// -- and a hand under the shoulder gives `normal.z = 4_405`, which
/// `CartesianResponseProjector` refuses outright. So the fixture itself
/// moved and the chain moved with it. The Smart60 words below moved with
/// their fixture standing exactly where it was.
///
/// One consequence of that reseat belongs here rather than only at the
/// capture, because it bounds what this fixture can ever assert again:
/// **a captured strike can no longer land on `reach == Fx::ONE`.** An
/// embodied arm is clamped onto its elbow's annulus before the actuator
/// integrates, so the captured arm now sits at `(31_231, 45_278)` and the
/// outer boundary is not a pose it can reach; `forward_joint_jacobian`
/// refuses `Fx::ONE` by name. A test that asserted that boundary *from a
/// capture* cannot be written that way again --
/// `generalized_joint_attributes_the_sword_limb_and_rejects_both_reach_boundaries`
/// asserts both ends on constructed neighbours instead, and keeps the
/// capture for the claim that the jacobian exists between them.
///
/// So the fixture pins the rates it was measured at. A future actuator
/// change moves nothing here, and every argument below stays about the
/// solver. What would still move these words is a change to the contact
/// solver, the joint map or the fixed-point arithmetic under them, which is
/// what they exist to catch.
///
/// `smart_60_entry` and `smart_60_probe` *above* read it for the same
/// reason and were repaired the same day: their tick-33 entry and tick-34
/// recoil words name one tick of one swing, so the doubled pair did not
/// disprove them, it aimed them at a different tick. That is still the
/// argument and it is the reason a wrong pair here is dangerous rather than
/// merely wrong: those pins would go on passing, about a configuration
/// nobody chose to freeze. Inert, not red.
///
/// Those words are now `(-19_151, 19_151)` and `436_667`. They read
/// `(-14_040, 14_040)` and `441_359` while this fixture was seated on
/// the retired articulated model, and **what moved them is `reachable_extent`,
/// not the frame.** An embodied arm may not be commanded past the annulus
/// its two links span, and this target is outside it: the commanded
/// `(bearing 13_013, height 14_563, reach 32_768)` is held as
/// `(13_013, 24_532, 16_384)`, so the tick-33 entry hand goes from
/// `(0.3492, -0.1130, 0.3999)` to `(0.1773, -0.1974, 0.6727)` -- shorter and
/// higher, which is what a clamp onto an annulus does -- and every word
/// downstream of that pose moved with it. The frame conversion is the
/// *identity* here: this attacker never leaves `Angle::ZERO`, so
/// `World::world_arm_target` hands back the bearing it was given and the arm
/// still holds `4_546` under both models. A reader who credits the torso
/// frame with the move will predict the wrong set of words next time.
///
/// Neither number was read back off a compiler. Both are still exact
/// reflections of their mirrors -- `-19_151` against `19_151`, and a
/// published hand that mirrors about the fixture's `y = 8`, since
/// `436_667 + 611_909 = 1_048_576`, which is `16.0` in raw units -- and that
/// oddness is asserted separately from the value, so a pasted number would
/// have to be a coincidence to survive.
///
/// `crates/sim/src/exact_diagnostics.rs` carries the only
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
            unit.combat_spec = scenario.units[0].combat_spec;
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
    let mut scenario = Scenario::embodied_duel();
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
    let mut scenario = Scenario::embodied_duel();
    scenario.dungeon = crate::dungeon::parse(&[
        "#########", // 0
        "#...#...#", // 1
        "#...+...#", // 2  the doorway, at (4, 2)
        "#...#...#", // 3
        "#########", // 4
    ]);
    scenario.units.truncate(1);
    scenario.units[0].set_body(body);
    // **Re-dressed after the body change, or construction refuses it.**
    // `UnitSpec::set_body` rewrites the stat sheet and the default loadout, and a
    // world with articulated columns checks the loadout against the equipment
    // *rows*: a Brute holding the fighter frame's sword and shield is a
    // `LoadoutMismatch`. This fixture built Legacy bodies until session 10 and
    // had nothing to keep in step.
    crate::scenario::equip_fixture_body(&mut scenario.units[0]);
    scenario.units[0].spawn = at_tile(2, 2);
    World::new(&scenario, 1)
}

/// Makes `i` lean in `dir`, through the column the door phase actually reads.
///
/// **`press_doors` used to read `World::command[i]`** -- the legacy command --
/// and nothing writes that column on a world with articulated columns, so from
/// the moment a body was jointed no door could be opened at all. These fixtures
/// wrote that column directly; they write the submitted one now, which is what
/// the phase reads through `World::world_move_dir`.
///
/// **`dir` is a world vector only because the yaw written below is zero.**
/// `world_move_dir` rotates a requested direction by the body's yaw, because
/// the vector arrives in the torso frame, so the two agree while `body_yaw` is
/// `Angle::ZERO` -- which this command asks for on every call, and which the
/// door fixtures never override. A fixture that turns a body and then leans
/// would get its lean turned with it.
pub(super) fn lean(w: &mut World, i: usize, dir: Vec2) {
    w.command_core[i] = Some(crate::CommandCoreV1 {
        move_dir: dir,
        body_yaw: fx::Angle::ZERO,
        intent: crate::Intent::Hold,
        arms: [crate::ArmTarget {
            bearing: fx::Angle::ZERO,
            height: crate::CombatHeight::MID,
            reach: Fx::ZERO,
            effort: Fx::ZERO,
        }; 2],
        grips: [crate::GripRequest::Keep; 2],
        releases: [crate::ReleaseRequest::Keep; 2],
    });
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
    let mut scenario = Scenario::embodied_duel();
    scenario.dungeon = crate::dungeon::parse(&[
        "#########", // 0
        "#...#...#", // 1
        "#...+...#", // 2
        "#...#...#", // 3
        "#########", // 4
    ]);
    scenario.units[0].spawn = at_tile(2, 2);
    scenario.units[1].set_body(body);
    // Re-dressed after the body change; see `door_world` for why.
    crate::scenario::equip_fixture_body(&mut scenario.units[1]);
    scenario.units[1].spawn = at_tile(6, 2);
    let mut w = World::new(&scenario, 1);
    w.set_objective(Faction::Monsters, Objective::Hunt);
    w
}
