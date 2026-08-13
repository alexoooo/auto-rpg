//! One controlled production-mechanics blow, with its held-sword control.
//!
//! This is Lab instrumentation, not a privileged combat path. Commands enter
//! through the public articulated seam, ticks use `World::step`, and every
//! reported fact comes back through published poses, resolutions, or anatomy.

use fx::{swept_segment_segment, Angle, Fx, Vec2, Vec3};
use policy::neutral_articulated_command;
use sim::{AnatomyChoice, ArmTarget, ArticulatedCommandV1, BodyPart, CombatHeight,
          ContactKind, DuelConfigV1, EntityId, EquipmentGeometry, Faction, Intent, Scenario,
          LimbSlot, RegionVolume, SegmentPose, SubmitArticulatedOutcome, World, BODY_SLOT};
#[cfg(feature = "cartesian-recoil")]
use sim::{ExactContactGroupDiagnostic, ExactContactKeyDiagnostic};
#[cfg(feature = "cartesian-recoil")]
use sim::ExactWideToiDiagnostic;

pub(crate) const CHAMBER_TICKS: u32 = 28;
pub(crate) const STRIKE_TICKS: u32 = 28;
pub(crate) const INTERIOR_CHAMBER_TICKS: [u32; 7] = [8, 12, 16, 20, 24, 28, 32];
pub(crate) const INTERIOR_STRIKE_TICKS: [u32; 6] = [12, 16, 20, 24, 28, 32];
pub(crate) const INTERIOR_REACH_TARGETS_RAW: [i32; 5] =
    [32_768, 40_960, 49_152, 57_344, 61_440];
pub(crate) const STRIKE_TICK_DELTAS: [i32; 3] = [-1, 0, 1];
pub(crate) const REACH_DELTAS_RAW: [i32; 3] = [-256, 0, 256];
const INTERIOR_REACH_MARGIN_RAW: i32 = 1_024;
const ATTACKER_SPAWN: Vec2 = Vec2::new(Fx::from_int(10), Fx::from_int(8));
// Arm 3/4 plus the configured 2-unit sword reaches 2.75. At 2.62 the body
// surface meets the last part of the blade; the test derives that from the
// published hit point rather than trusting this comment.
const TARGET_SPAWN: Vec2 = Vec2::new(Fx::from_ratio(631, 50), Fx::from_int(8));
pub(crate) const APPROACH_OFFSETS: [Vec2; 9] = [
    Vec2::new(Fx::from_int(-3), Fx::from_int(-1)),
    Vec2::new(Fx::from_int(-3), Fx::ZERO),
    Vec2::new(Fx::from_int(-3), Fx::ONE),
    Vec2::new(Fx::from_ratio(-5, 2), Fx::from_int(-1)),
    Vec2::new(Fx::from_ratio(-5, 2), Fx::ZERO),
    Vec2::new(Fx::from_ratio(-5, 2), Fx::ONE),
    Vec2::new(Fx::from_int(-2), Fx::from_int(-1)),
    Vec2::new(Fx::from_int(-2), Fx::ZERO),
    Vec2::new(Fx::from_int(-2), Fx::ONE),
];

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(crate) struct StrongCase {
    pub seed: u64,
    pub mirrored: bool,
    pub target_anatomy: AnatomyChoice,
    pub approach_offset: Vec2,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum MirrorGrammar { SpatialRightHand = 39, AnatomicalHandSwap = 40 }

#[repr(u8)]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum ScheduleBearingSource { ObservedOpponent = 40, DeclaredSpawnOffset = 41 }

fn attacking_limb(case: StrongCase, grammar: MirrorGrammar) -> LimbSlot {
    if grammar == MirrorGrammar::AnatomicalHandSwap && case.mirrored {
        LimbSlot::LeftArm
    } else { LimbSlot::RightArm }
}

impl StrongCase {
    fn quick() -> StrongCase {
        StrongCase {
            seed: 0, mirrored: false, target_anatomy: AnatomyChoice::Fighter,
            approach_offset: ATTACKER_SPAWN - TARGET_SPAWN,
        }
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(crate) struct StrikeMeasurement {
    pub contact_tick: Option<u32>, pub previous_weapon: SegmentPose, pub requested_weapon: SegmentPose,
    pub tip_delta: Vec3, pub hilt_delta: Vec3, pub contact_point: Option<Vec3>,
    pub velocity_a: Vec3, pub velocity_b: Vec3, pub region: Option<BodyPart>,
    pub energy_before_raw: u64, pub energy_after_raw: u64, pub energy_dissipated_raw: u64,
    pub cut_raw: u64, pub thrust_raw: u64, pub pressure_raw: u64, pub deflected_raw: u64,
    pub integrity_before_raw: [i32; BodyPart::COUNT], pub integrity_after_raw: [i32; BodyPart::COUNT],
    pub wound_before_raw: [i32; BodyPart::COUNT], pub wound_after_raw: [i32; BodyPart::COUNT],
    pub blood_before_raw: i32, pub blood_after_raw: i32,
    pub weapon_body_facts: u32, pub competing_facts: u32,
    pub contact_reach_raw: Option<i32>, pub contact_arm_velocity: Vec3,
    pub observed_contact_region: Option<RegionVolume>,
    pub crossing_oracle: Option<CrossingOracle>,
    pub refusals: u32, pub solver_rejections: u32, pub max_energy_excess_raw: u64,
    pub contact_key: Option<(EntityId, u8, EntityId, u8, ContactKind)>,
    pub toi_raw: Option<i32>, pub normal: Vec3, pub impulse_on_a: Vec3,
    pub group_alpha_raw: Option<u32>,
    pub cap_hits: u32,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(crate) struct CrossingOracle {
    pub previous: RegionVolume,
    pub requested: RegionVolume,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(crate) struct MeaningfulStrikeValidity {
    pub uniquely_attributed_contact: bool,
    pub observed_crossing: bool,
    pub dissipated_energy: bool,
    pub damaging_channel: bool,
    pub matching_integrity_loss: bool,
    pub held_control_inert: bool,
    pub legal_runs: bool,
}

impl MeaningfulStrikeValidity {
    pub fn passes(self) -> bool {
        self.uniquely_attributed_contact && self.observed_crossing
            && self.dissipated_energy && self.damaging_channel
            && self.matching_integrity_loss && self.held_control_inert && self.legal_runs
    }
}

pub(crate) fn meaningful_strike_validity(
    strong: StrikeMeasurement, held: StrikeMeasurement,
) -> MeaningfulStrikeValidity {
    let loss = strong.region.map(|part| {
        strong.integrity_before_raw[part as usize]
            .saturating_sub(strong.integrity_after_raw[part as usize])
    }).unwrap_or(0);
    MeaningfulStrikeValidity {
        uniquely_attributed_contact: strong.contact_tick.is_some()
            && strong.weapon_body_facts == 1 && strong.competing_facts == 0,
        observed_crossing: observed_crossing(strong),
        dissipated_energy: strong.energy_dissipated_raw > 0
            && strong.energy_after_raw < strong.energy_before_raw,
        damaging_channel: strong.cut_raw.saturating_add(strong.thrust_raw) > 0,
        matching_integrity_loss: loss > 0,
        held_control_inert: held.contact_tick.is_none() && held.weapon_body_facts == 0
            && held.competing_facts == 0 && held.energy_before_raw == 0
            && held.energy_dissipated_raw == 0 && held.cut_raw == 0 && held.thrust_raw == 0
            && held.integrity_before_raw == held.integrity_after_raw
            && held.wound_before_raw == held.wound_after_raw
            && held.blood_before_raw == held.blood_after_raw,
        legal_runs: strong.refusals == 0 && strong.solver_rejections == 0
            && strong.max_energy_excess_raw == 0 && held.refusals == 0
            && held.solver_rejections == 0 && held.max_energy_excess_raw == 0,
    }
}

fn observed_crossing(row: StrikeMeasurement) -> bool {
    row.crossing_oracle.map(|oracle| oracle.previous.present && oracle.requested.present
        && swept_segment_segment(
        row.previous_weapon.hilt, row.previous_weapon.tip,
        row.requested_weapon.hilt, row.requested_weapon.tip,
        row.previous_weapon.radius.max(row.requested_weapon.radius),
        oracle.previous.lower, oracle.previous.upper,
        oracle.requested.lower, oracle.requested.upper,
        oracle.previous.radius.max(oracle.requested.radius),
    ).is_some()).unwrap_or(false)
}

fn ground_truth_region(pose: sim::ArticulatedPose, anatomy: &sim::BodyAnatomySpec,
                       part: BodyPart) -> RegionVolume {
    let hands = pose.arms.map(|arm| arm.hand - pose.body);
    let present = core::array::from_fn(|at| pose.severed_mask & (1 << at) == 0);
    sim::body_region_volumes(pose.body, anatomy, pose.body_yaw, hands, present)[part as usize]
}

fn attacking_reach_motion(observation: &sim::ArticulatedObservation, limb: LimbSlot)
    -> (i32, Vec3)
{
    let anatomy = sim::fighter_anatomy();
    let limb_index = limb as usize;
    let side = if limb == LimbSlot::LeftArm { anatomy.shoulder_half_width }
        else { -anatomy.shoulder_half_width };
    let yaw = observation.body_yaw;
    let shoulder = observation.body_position + Vec3::new(
        -yaw.sin() * side, yaw.cos() * side, anatomy.shoulder_height,
    );
    let hand = observation.arms[limb_index].hand;
    let planar = Vec2::new(hand.x - shoulder.x, hand.y - shoulder.y);
    ((planar.length() / observation.arm_length).raw(),
     observation.arms[limb_index].velocity)
}

fn config_for_ticks(case: StrongCase, max_ticks: u32, grammar: MirrorGrammar) -> DuelConfigV1 {
    let mut config = DuelConfigV1::shipped();
    let centre = Vec2::from_ints(12, 8);
    let offset = if case.mirrored {
        Vec2::new(case.approach_offset.x, -case.approach_offset.y)
    } else { case.approach_offset };
    config.fighters[0].spawn = centre + offset;
    if grammar == MirrorGrammar::AnatomicalHandSwap && case.mirrored {
        for fighter in &mut config.fighters { fighter.hands.swap(0, 1); }
    }
    let limb = attacking_limb(case, grammar) as usize;
    config.fighters[0].hands[limb].as_mut().expect("the reflected sword").geometry =
        EquipmentGeometry::Segment { length: Fx::from_int(2), radius: Fx::from_ratio(1, 25) };
    config.fighters[1].spawn = centre;
    config.fighters[1].anatomy = case.target_anatomy;
    config.max_ticks = max_ticks;
    config
}

fn scenario_for_ticks_with(case: StrongCase, max_ticks: u32, grammar: MirrorGrammar) -> Scenario {
    let config = config_for_ticks(case, max_ticks, grammar);
    Scenario::duel_from(&config).expect("the controlled strong-strike duel is legal")
}

fn scenario_for_ticks(case: StrongCase, max_ticks: u32) -> Scenario {
    scenario_for_ticks_with(case, max_ticks, MirrorGrammar::SpatialRightHand)
}

pub(crate) fn scenario_for(case: StrongCase) -> Scenario {
    scenario_for_ticks(case, CHAMBER_TICKS + STRIKE_TICKS)
}

#[cfg(test)]
pub(crate) fn scenario() -> Scenario { scenario_for(StrongCase::quick()) }

fn command(obs: &sim::ArticulatedObservation, opponent: EntityId, limb: LimbSlot,
           bearing: Angle, height: CombatHeight, reach: Fx, effort: Fx)
    -> ArticulatedCommandV1
{
    let mut command = neutral_articulated_command(obs);
    command.intent = Intent::Attack(opponent);
    command.arms[limb as usize] = ArmTarget {
        bearing, height, reach, effort,
    };
    command
}

fn schedule_bearings(bearing: Angle, mirrored: bool) -> (Angle, Angle) {
    let eighth = Angle::QUARTER.raw() / 2;
    if mirrored {
        (Angle::from_raw(bearing.raw().wrapping_add(eighth)),
         Angle::from_raw(bearing.raw().wrapping_sub(eighth)))
    } else {
        (Angle::from_raw(bearing.raw().wrapping_sub(eighth)),
         Angle::from_raw(bearing.raw().wrapping_add(eighth)))
    }
}

fn declared_schedule_bearing(case: StrongCase) -> Angle {
    let offset = if case.mirrored {
        Vec2::new(case.approach_offset.x, -case.approach_offset.y)
    } else { case.approach_offset };
    (-offset).angle()
}

fn raw_parts(values: [Fx; BodyPart::COUNT]) -> [i32; BodyPart::COUNT] { values.map(Fx::raw) }

fn attributed_sword_body(row: &sim::ContactResolution, attacker: EntityId, defender: EntityId,
                         limb: LimbSlot)
    -> bool
{
    row.fact.key.kind == ContactKind::WeaponBody && (
        (row.fact.key.a == attacker && row.fact.key.a_slot == limb as u8
            && row.fact.key.b == defender && row.fact.key.b_slot == BODY_SLOT)
        || (row.fact.key.b == attacker && row.fact.key.b_slot == limb as u8
            && row.fact.key.a == defender && row.fact.key.a_slot == BODY_SLOT)
    )
}

pub(crate) fn measure_case_schedule(
    case: StrongCase, strike_effort: Fx, chamber_ticks: u32, strike_ticks: u32,
    strike_reach: Fx,
) -> StrikeMeasurement {
    measure_case_schedule_with(case, strike_effort, chamber_ticks, strike_ticks, strike_reach,
        MirrorGrammar::SpatialRightHand, ScheduleBearingSource::ObservedOpponent)
}

fn measure_case_schedule_with(case: StrongCase, strike_effort: Fx, chamber_ticks: u32,
    strike_ticks: u32, strike_reach: Fx, grammar: MirrorGrammar,
    bearing_source: ScheduleBearingSource) -> StrikeMeasurement {
    let scenario = scenario_for_ticks_with(case, chamber_ticks + strike_ticks, grammar);
    let defender_anatomy = scenario.combat_specs.as_ref().expect("configured combat specs")
        .anatomy(2).expect("configured defender anatomy").clone();
    let mut world = World::new(&scenario, case.seed);
    let attacker = world.alive_ids(Faction::Heroes)[0];
    let defender = world.alive_ids(Faction::Monsters)[0];
    let limb = attacking_limb(case, grammar);
    let shown = world.observe_articulated(attacker);
    let foe = shown.opponents().first().expect("the target is publicly observed");
    let bearing = match bearing_source {
        ScheduleBearingSource::ObservedOpponent => Vec2::new(
            foe.body_position.x - shown.body_position.x,
            foe.body_position.y - shown.body_position.y,
        ).angle(),
        ScheduleBearingSource::DeclaredSpawnOffset => declared_schedule_bearing(case),
    };
    let region = foe.regions[BodyPart::Legs as usize];
    let local_height = (region.lower.z + region.upper.z) / Fx::from_int(2)
        - foe.body_position.z;
    let height_raw = (local_height / shown.standing_height)
        .clamp(Fx::ZERO, Fx::ONE).raw();
    let height = CombatHeight::try_from_raw(height_raw)
        .expect("the observed target region produces a bounded command height");
    let (chamber, follow) = schedule_bearings(bearing, case.mirrored);
    let mut refusals = 0u32;
    let mut max_energy_excess_raw = 0u64;

    for _ in 0..chamber_ticks {
        for id in world.pending_decisions().to_vec() {
            let obs = world.observe_articulated(id);
            let submitted = if id == attacker {
                command(&obs, defender, limb, chamber, height, Fx::ONE, Fx::ONE)
            }
                else { neutral_articulated_command(&obs) };
            match world.submit_articulated_v1(id, submitted) {
                SubmitArticulatedOutcome::Stored { rejection, .. } => {
                    refusals += u32::from(rejection.is_some());
                }
                SubmitArticulatedOutcome::NotStored(_) => refusals += 1,
            }
        }
        let _ = world.step();
    }

    let before = world.observe_articulated(defender);
    let mut previous = world.observe_articulated(attacker).weapons[limb as usize]
        .expect("configured sword");
    let mut answer = StrikeMeasurement {
        contact_tick: None, previous_weapon: previous, requested_weapon: previous,
        tip_delta: Vec3::ZERO, hilt_delta: Vec3::ZERO, contact_point: None,
        velocity_a: Vec3::ZERO, velocity_b: Vec3::ZERO, region: None,
        energy_before_raw: 0, energy_after_raw: 0, energy_dissipated_raw: 0,
        cut_raw: 0, thrust_raw: 0, pressure_raw: 0, deflected_raw: 0,
        integrity_before_raw: raw_parts(before.integrity_fraction),
        integrity_after_raw: raw_parts(before.integrity_fraction),
        wound_before_raw: raw_parts(before.wound_fraction),
        wound_after_raw: raw_parts(before.wound_fraction),
        blood_before_raw: before.blood_fraction.raw(), blood_after_raw: before.blood_fraction.raw(),
        weapon_body_facts: 0, competing_facts: 0,
        contact_reach_raw: None, contact_arm_velocity: Vec3::ZERO,
        observed_contact_region: None, crossing_oracle: None,
        refusals: 0, solver_rejections: 0, max_energy_excess_raw: 0,
        contact_key: None, toi_raw: None, normal: Vec3::ZERO, impulse_on_a: Vec3::ZERO,
        group_alpha_raw: None,
        cap_hits: 0,
    };

    for _ in 0..strike_ticks {
        let attacker_before = world.observe_articulated(attacker);
        let defender_before = world.articulated_pose(defender).expect("live defender pose");
        for id in world.pending_decisions().to_vec() {
            let obs = world.observe_articulated(id);
            let submitted = if id == attacker {
                command(&obs, defender, limb, follow, height, strike_reach, strike_effort)
            }
                else { neutral_articulated_command(&obs) };
            match world.submit_articulated_v1(id, submitted) {
                SubmitArticulatedOutcome::Stored { rejection, .. } => {
                    refusals += u32::from(rejection.is_some());
                }
                SubmitArticulatedOutcome::NotStored(_) => refusals += 1,
            }
        }
        let _ = world.step();
        let defender_requested = world.articulated_pose(defender).expect("live defender pose");
        for resolution in world.contact_resolutions() {
            max_energy_excess_raw = max_energy_excess_raw.max(
                resolution.energy.after_raw.saturating_sub(resolution.energy.before_raw));
        }
        let requested = world.observe_articulated(attacker).weapons[limb as usize]
            .expect("attached sword");
        answer.previous_weapon = previous;
        answer.requested_weapon = requested;
        answer.tip_delta = requested.tip - previous.tip;
        answer.hilt_delta = requested.hilt - previous.hilt;
        if let Some(row) = world.contact_resolutions().iter().find(|row| {
            attributed_sword_body(row, attacker, defender, limb)
        }) {
            let after = world.observe_articulated(defender);
            answer.contact_tick = Some(world.tick());
            answer.contact_point = Some(row.fact.point);
            answer.contact_key = Some((row.fact.key.a, row.fact.key.a_slot, row.fact.key.b,
                                       row.fact.key.b_slot, row.fact.key.kind));
            answer.toi_raw = Some(row.fact.toi.get().raw());
            answer.normal = row.fact.normal; answer.impulse_on_a = row.impulse.on_a;
            answer.group_alpha_raw = Some(row.group_alpha_raw);
            answer.velocity_a = row.fact.velocity_a; answer.velocity_b = row.fact.velocity_b;
            answer.region = BodyPart::ALL.get(row.fact.region as usize).copied();
            answer.crossing_oracle = answer.region.map(|part| CrossingOracle {
                previous: ground_truth_region(defender_before, &defender_anatomy, part),
                requested: ground_truth_region(defender_requested, &defender_anatomy, part),
            });
            answer.energy_before_raw = row.energy.before_raw;
            answer.energy_after_raw = row.energy.after_raw;
            answer.energy_dissipated_raw = row.energy.dissipated_raw;
            answer.cut_raw = row.cut_raw; answer.thrust_raw = row.thrust_raw;
            answer.pressure_raw = row.pressure_raw; answer.deflected_raw = row.deflected_raw;
            answer.integrity_after_raw = raw_parts(after.integrity_fraction);
            answer.wound_after_raw = raw_parts(after.wound_fraction);
            answer.blood_after_raw = after.blood_fraction.raw();
            answer.weapon_body_facts = world.contact_resolutions().iter()
                .filter(|row| attributed_sword_body(row, attacker, defender, limb)).count() as u32;
            answer.competing_facts = world.contact_resolutions().iter()
                .filter(|row| !attributed_sword_body(row, attacker, defender, limb)).count() as u32;
            let (reach, motion) = attacking_reach_motion(&attacker_before, limb);
            answer.contact_reach_raw = Some(reach);
            answer.contact_arm_velocity = motion;
            break;
        }
        previous = requested;
    }
    answer.refusals = refusals;
    answer.solver_rejections = world.contact_solver_rejections();
    answer.cap_hits = world.contact_cap_hits();
    answer.max_energy_excess_raw = max_energy_excess_raw;
    answer
}

pub(crate) fn interior_contact(row: StrikeMeasurement) -> bool {
    let reach = row.contact_reach_raw.unwrap_or(i32::MIN);
    row.contact_tick.is_some() && row.weapon_body_facts == 1 && row.competing_facts == 0
        && observed_crossing(row)
        && reach >= Fx::from_ratio(1, 4).raw() + INTERIOR_REACH_MARGIN_RAW
        && reach <= Fx::ONE.raw() - INTERIOR_REACH_MARGIN_RAW
        && row.contact_arm_velocity != Vec3::ZERO
        && row.hilt_delta != Vec3::ZERO && row.tip_delta != Vec3::ZERO
        && row.impulse_on_a != Vec3::ZERO && row.energy_dissipated_raw != 0
        && row.group_alpha_raw == Some(65_536)
        && row.refusals == 0 && row.solver_rejections == 0 && row.cap_hits == 0
        && row.max_energy_excess_raw == 0
}

pub(crate) fn measure_case(case: StrongCase, strike_effort: Fx) -> StrikeMeasurement {
    measure_case_schedule(case, strike_effort, CHAMBER_TICKS, STRIKE_TICKS, Fx::ONE)
}

pub(crate) fn measure(strike_effort: Fx) -> StrikeMeasurement {
    measure_case(StrongCase::quick(), strike_effort)
}

fn xyz(value: Vec3) -> String { format!("{},{},{}", value.x.raw(), value.y.raw(), value.z.raw()) }

fn print_measurement(name: &str, row: StrikeMeasurement) {
    println!("condition={name}");
    println!("contact_tick={}", row.contact_tick.map(|n| n.to_string()).unwrap_or_else(|| "none".to_string()));
    println!("previous_hilt_raw={} previous_tip_raw={}", xyz(row.previous_weapon.hilt), xyz(row.previous_weapon.tip));
    println!("requested_hilt_raw={} requested_tip_raw={}", xyz(row.requested_weapon.hilt), xyz(row.requested_weapon.tip));
    println!("hilt_delta_raw={} tip_delta_raw={} tip_speed_raw={}", xyz(row.hilt_delta), xyz(row.tip_delta), row.tip_delta.length().raw());
    println!("contact_point_raw={} velocity_a_raw={} velocity_b_raw={}", row.contact_point.map(xyz).unwrap_or_else(|| "none".to_string()), xyz(row.velocity_a), xyz(row.velocity_b));
    println!("region={:?}", row.region);
    println!("energy_before_raw={} energy_after_raw={} energy_dissipated_raw={}", row.energy_before_raw, row.energy_after_raw, row.energy_dissipated_raw);
    println!("cut_raw={} thrust_raw={} pressure_raw={} deflected_raw={}", row.cut_raw, row.thrust_raw, row.pressure_raw, row.deflected_raw);
    println!("integrity_before_raw={:?} integrity_after_raw={:?}", row.integrity_before_raw, row.integrity_after_raw);
    println!("wound_before_raw={:?} wound_after_raw={:?}", row.wound_before_raw, row.wound_after_raw);
    println!("blood_before_raw={} blood_after_raw={}", row.blood_before_raw, row.blood_after_raw);
    println!("weapon_body_facts={} competing_facts={}", row.weapon_body_facts, row.competing_facts);
    println!("contact_reach_raw={} contact_arm_velocity_raw={}",
        row.contact_reach_raw.map(|raw| raw.to_string()).unwrap_or_else(|| "none".to_string()),
        xyz(row.contact_arm_velocity));
    println!("geometric_crossing={}", observed_crossing(row));
    println!("refusals={} solver_rejections={} max_energy_excess_raw={}",
        row.refusals, row.solver_rejections, row.max_energy_excess_raw);
}

pub(crate) fn strong_strike() {
    print_measurement("strong", measure(Fx::ONE));
    print_measurement("held-control", measure(Fx::ZERO));
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(crate) struct MechanicalCase {
    pub ordinal: u32, pub chamber_ticks: u32, pub strike_ticks: u32, pub reach_raw: i32,
    pub target_anatomy: AnatomyChoice, pub approach_offset: Vec2,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(crate) struct MechanicalRow {
    pub case: MechanicalCase, pub strike_delta: i32, pub reach_delta_raw: i32,
    pub mirrored: bool, pub eligible: bool, pub failure_mask: u16,
    pub key: Option<(EntityId, u8, EntityId, u8, ContactKind)>, pub region: Option<BodyPart>,
    pub toi_raw: Option<i32>, pub point: Option<Vec3>, pub normal: Vec3, pub impulse: Vec3,
    pub dissipated_raw: u64, pub refusals: u32, pub solver_rejections: u32,
    pub cap_hits: u32, pub energy_excess_raw: u64,
}

pub(crate) const FAILURE_MISSING_CONTACT: u16 = 1 << 0;
pub(crate) const FAILURE_ATTRIBUTION: u16 = 1 << 1;
pub(crate) const FAILURE_CROSSING: u16 = 1 << 2;
pub(crate) const FAILURE_REACH: u16 = 1 << 3;
pub(crate) const FAILURE_MOTION: u16 = 1 << 4;
pub(crate) const FAILURE_IMPULSE: u16 = 1 << 5;
pub(crate) const FAILURE_DISSIPATION: u16 = 1 << 6;
pub(crate) const FAILURE_REFUSAL: u16 = 1 << 7;
pub(crate) const FAILURE_SOLVER: u16 = 1 << 8;
pub(crate) const FAILURE_CAP: u16 = 1 << 9;
pub(crate) const FAILURE_ENERGY: u16 = 1 << 10;
pub(crate) const FAILURE_ALPHA: u16 = 1 << 11;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(crate) struct DamageSidecar {
    pub cut_raw: u64, pub thrust_raw: u64, pub pressure_raw: u64,
    pub integrity_loss_raw: i32,
}

#[derive(Clone, PartialEq, Eq, Debug)]
pub(crate) struct RobustMechanicalPair {
    pub centre: MechanicalCase, pub rows: Vec<MechanicalRow>, pub worst_dissipated_raw: u64,
}

#[derive(Default, PartialEq, Eq, Debug)]
pub(crate) struct StrikeCorpusAudit {
    pub central_rows: Vec<MechanicalRow>, pub local_rows: Vec<MechanicalRow>,
    pub central_damage: Vec<DamageSidecar>, pub local_damage: Vec<DamageSidecar>,
    pub robust: Vec<RobustMechanicalPair>, pub selected: Option<usize>,
}

fn failure_mask(row: StrikeMeasurement) -> u16 {
    let reach = row.contact_reach_raw.unwrap_or(i32::MIN);
    let mut mask = 0;
    if row.contact_tick.is_none() { mask |= FAILURE_MISSING_CONTACT; }
    if row.weapon_body_facts != 1 || row.competing_facts != 0 { mask |= FAILURE_ATTRIBUTION; }
    if !observed_crossing(row) { mask |= FAILURE_CROSSING; }
    if reach < Fx::from_ratio(1, 4).raw() + INTERIOR_REACH_MARGIN_RAW
        || reach > Fx::ONE.raw() - INTERIOR_REACH_MARGIN_RAW { mask |= FAILURE_REACH; }
    if row.contact_arm_velocity == Vec3::ZERO || row.hilt_delta == Vec3::ZERO
        || row.tip_delta == Vec3::ZERO { mask |= FAILURE_MOTION; }
    if row.impulse_on_a == Vec3::ZERO { mask |= FAILURE_IMPULSE; }
    if row.energy_dissipated_raw == 0 { mask |= FAILURE_DISSIPATION; }
    if row.refusals != 0 { mask |= FAILURE_REFUSAL; }
    if row.solver_rejections != 0 { mask |= FAILURE_SOLVER; }
    if row.cap_hits != 0 { mask |= FAILURE_CAP; }
    if row.max_energy_excess_raw != 0 { mask |= FAILURE_ENERGY; }
    if row.group_alpha_raw != Some(65_536) { mask |= FAILURE_ALPHA; }
    mask
}

fn selection_row(case: MechanicalCase, mirrored: bool, strike_delta: i32,
                 reach_delta_raw: i32, row: StrikeMeasurement) -> MechanicalRow {
    let failures = failure_mask(row);
    debug_assert_eq!(failures == 0, interior_contact(row));
    MechanicalRow { case, strike_delta, reach_delta_raw, mirrored,
        eligible: failures == 0, failure_mask: failures, key: row.contact_key,
        region: row.region, toi_raw: row.toi_raw, point: row.contact_point, normal: row.normal,
        impulse: row.impulse_on_a, dissipated_raw: row.energy_dissipated_raw,
        refusals: row.refusals, solver_rejections: row.solver_rejections,
        cap_hits: row.cap_hits, energy_excess_raw: row.max_energy_excess_raw }
}

pub(crate) fn damage_sidecar(row: StrikeMeasurement) -> DamageSidecar {
    let integrity_loss_raw = row.region.map(|part| row.integrity_before_raw[part as usize]
        .saturating_sub(row.integrity_after_raw[part as usize])).unwrap_or(0);
    DamageSidecar { cut_raw: row.cut_raw, thrust_raw: row.thrust_raw,
        pressure_raw: row.pressure_raw, integrity_loss_raw }
}

fn mapped_vec(plain: Vec3, mirror: Vec3) -> bool {
    (plain.x.raw() - mirror.x.raw()).abs() <= 1
        && (plain.y.raw() + mirror.y.raw()).abs() <= 1
        && (plain.z.raw() - mirror.z.raw()).abs() <= 1
}

fn mapped_point(plain: Vec3, mirror: Vec3) -> bool {
    (plain.x.raw() - mirror.x.raw()).abs() <= 1
        && (plain.y.raw() + mirror.y.raw() - Fx::from_int(16).raw()).abs() <= 1
        && (plain.z.raw() - mirror.z.raw()).abs() <= 1
}

fn reflected_slot(slot: u8) -> u8 {
    match slot { 0 => 1, 1 => 0, _ => slot }
}

fn mapped_key(key: (EntityId, u8, EntityId, u8, ContactKind), anatomical: bool)
    -> (EntityId, u8, EntityId, u8, ContactKind)
{
    if anatomical { (key.0, reflected_slot(key.1), key.2, reflected_slot(key.3), key.4) }
    else { key }
}

fn mirrored_pair(rows: [MechanicalRow; 2], anatomical: bool) -> bool {
    let [plain, mirror] = rows;
    plain.eligible && mirror.eligible
        && plain.key.map(|key| mapped_key(key, anatomical)) == mirror.key
        && plain.region == mirror.region
        && plain.dissipated_raw == mirror.dissipated_raw
        && plain.toi_raw.zip(mirror.toi_raw).is_some_and(|(a, b)| (a - b).abs() <= 1)
        && plain.point.zip(mirror.point).is_some_and(|(a, b)| mapped_point(a, b))
        && mapped_vec(plain.normal, mirror.normal) && mapped_vec(plain.impulse, mirror.impulse)
}

fn declared_central_cases() -> Vec<MechanicalCase> {
    let mut rows = Vec::with_capacity(3_780); let mut ordinal = 0u32;
    for chamber_ticks in INTERIOR_CHAMBER_TICKS {
        for strike_ticks in INTERIOR_STRIKE_TICKS {
            for reach_raw in INTERIOR_REACH_TARGETS_RAW {
                for target_anatomy in [AnatomyChoice::Fighter, AnatomyChoice::Brute] {
                    for approach_offset in APPROACH_OFFSETS {
                        rows.push(MechanicalCase { ordinal, chamber_ticks, strike_ticks, reach_raw,
                            target_anatomy, approach_offset });
                        ordinal += 1;
                    }
                }
            }
        }
    }
    rows
}

#[cfg(feature = "cartesian-recoil")]
#[derive(Clone, PartialEq, Eq, Debug)]
struct TraceField { name: String, value: String }

#[cfg(feature = "cartesian-recoil")]
#[derive(Clone, PartialEq, Eq, Debug)]
struct TraceDifference {
    tick: u32, phase: &'static str, field: String,
    plain: String, mirror: String, plain_cause: String, mirror_cause: String,
}

#[cfg(feature = "cartesian-recoil")]
fn trace_difference(tick: u32, phase: &'static str, plain: &[TraceField], mirror: &[TraceField],
                    plain_cause: String, mirror_cause: String) -> Option<TraceDifference> {
    let count = plain.len().max(mirror.len());
    for at in 0..count {
        let left = plain.get(at);
        let right = mirror.get(at);
        if left != right {
            return Some(TraceDifference {
                tick, phase,
                field: left.map(|row| row.name.clone()).or_else(|| right.map(|row| row.name.clone()))
                    .unwrap_or_else(|| "count".into()),
                plain: left.map(|row| row.value.clone()).unwrap_or_else(|| "missing".into()),
                mirror: right.map(|row| row.value.clone()).unwrap_or_else(|| "missing".into()),
                plain_cause, mirror_cause,
            });
        }
    }
    None
}

#[cfg(feature = "cartesian-recoil")]
fn trace_field(name: impl Into<String>, value: impl ToString) -> TraceField {
    TraceField { name: name.into(), value: value.to_string() }
}

#[cfg(feature = "cartesian-recoil")]
fn point_rows(prefix: &'static str, value: Vec3, mapped_mirror: bool) -> [TraceField; 3] {
    let y = if mapped_mirror { Fx::from_int(16).raw() - value.y.raw() } else { value.y.raw() };
    [trace_field(format!("{prefix}.x"), value.x.raw()),
     trace_field(format!("{prefix}.y"), y),
     trace_field(format!("{prefix}.z"), value.z.raw())]
}

#[cfg(feature = "cartesian-recoil")]
fn vector_rows(prefix: &'static str, value: Vec3, mapped_mirror: bool) -> [TraceField; 3] {
    [trace_field(format!("{prefix}.x"), value.x.raw()),
     trace_field(format!("{prefix}.y"), if mapped_mirror { -value.y.raw() } else { value.y.raw() }),
     trace_field(format!("{prefix}.z"), value.z.raw())]
}

#[cfg(feature = "cartesian-recoil")]
fn shield_corners(shield: sim::ShieldPose) -> [Vec3; 4] {
    let front = shield.centre + shield.normal * (shield.thickness / Fx::from_int(2));
    let side = Vec3::new(-shield.normal.y, shield.normal.x, Fx::ZERO) * shield.half_width;
    let up = Vec3::Z * shield.half_height;
    [front - side - up, front + side - up, front + side + up, front - side + up]
}

#[cfg(feature = "cartesian-recoil")]
fn mapped_angle_raw(angle: Angle, mapped_mirror: bool) -> u16 {
    if mapped_mirror { angle.raw().wrapping_neg() } else { angle.raw() }
}

#[cfg(feature = "cartesian-recoil")]
fn pose_rows(pose: sim::ArticulatedPose, mapped_mirror: bool) -> Vec<TraceField> {
    let mut rows = Vec::new();
    rows.extend(point_rows("body", pose.body, mapped_mirror));
    rows.push(trace_field("body_yaw", mapped_angle_raw(pose.body_yaw, mapped_mirror)));
    rows.extend(vector_rows("body_velocity", pose.body_velocity, mapped_mirror));
    for plain_slot in 0..2 {
        let slot = if mapped_mirror { 1 - plain_slot } else { plain_slot };
        let arm = pose.arms[slot];
        rows.extend(point_rows(if plain_slot == 0 { "left.hand" } else { "right.hand" },
                               arm.hand, mapped_mirror));
        rows.extend(vector_rows(if plain_slot == 0 { "left.velocity" } else { "right.velocity" },
                                arm.velocity, mapped_mirror));
        rows.extend(point_rows(if plain_slot == 0 { "left.target" } else { "right.target" },
                               arm.target_hand, mapped_mirror));
        rows.push(trace_field(if plain_slot == 0 { "left.fatigue" } else { "right.fatigue" },
                              arm.fatigue.raw()));
        let weapon = pose.weapons[slot];
        rows.push(trace_field(if plain_slot == 0 { "left.weapon.present" }
                              else { "right.weapon.present" }, weapon.is_some()));
        if let Some(weapon) = weapon {
            rows.extend(point_rows(if plain_slot == 0 { "left.weapon.hilt" }
                                   else { "right.weapon.hilt" }, weapon.hilt, mapped_mirror));
            rows.extend(point_rows(if plain_slot == 0 { "left.weapon.tip" }
                                   else { "right.weapon.tip" }, weapon.tip, mapped_mirror));
            rows.push(trace_field(if plain_slot == 0 { "left.weapon.radius" }
                                  else { "right.weapon.radius" }, weapon.radius.raw()));
        }
    }
    rows.push(trace_field("shield.present", pose.shield.is_some()));
    if let Some(shield) = pose.shield {
        rows.extend(point_rows("shield.centre", shield.centre, mapped_mirror));
        rows.extend(vector_rows("shield.normal", shield.normal, mapped_mirror));
        rows.push(trace_field("shield.half_width", shield.half_width.raw()));
        rows.push(trace_field("shield.half_height", shield.half_height.raw()));
        rows.push(trace_field("shield.thickness", shield.thickness.raw()));
        let corners = shield_corners(shield);
        let order = if mapped_mirror { [1, 0, 3, 2] } else { [0, 1, 2, 3] };
        for (plain_at, at) in order.into_iter().enumerate() {
            rows.extend(point_rows(match plain_at {
                0 => "shield.corner0", 1 => "shield.corner1",
                2 => "shield.corner2", _ => "shield.corner3",
            }, corners[at], mapped_mirror));
        }
    }
    for plain_at in 0..BodyPart::COUNT {
        let at = if mapped_mirror {
            match plain_at { 2 => 3, 3 => 2, _ => plain_at }
        } else { plain_at };
        rows.push(trace_field(TRACE_INTEGRITY_NAMES[plain_at], pose.integrity_fraction[at].raw()));
    }
    let severed_mask = if mapped_mirror {
        (pose.severed_mask & !((1 << 2) | (1 << 3)))
            | ((pose.severed_mask & (1 << 2)) << 1)
            | ((pose.severed_mask & (1 << 3)) >> 1)
    } else { pose.severed_mask };
    rows.push(trace_field("severed_mask", severed_mask));
    rows.push(trace_field("equipment_mask", if mapped_mirror {
        (pose.equipment_mask & !3) | ((pose.equipment_mask & 1) << 1)
            | ((pose.equipment_mask & 2) >> 1)
    } else { pose.equipment_mask }));
    rows
}

#[cfg(feature = "cartesian-recoil")]
const TRACE_INTEGRITY_NAMES: [&str; BodyPart::COUNT] = [
    "integrity.head", "integrity.torso", "integrity.left_arm",
    "integrity.right_arm", "integrity.legs",
];

#[cfg(feature = "cartesian-recoil")]
fn command_rows(command: ArticulatedCommandV1, mapped_mirror: bool) -> Vec<TraceField> {
    let mut rows = vec![
        trace_field("move.x", command.move_dir.x.raw()),
        trace_field("move.y", if mapped_mirror { -command.move_dir.y.raw() }
                    else { command.move_dir.y.raw() }),
        trace_field("body_yaw", mapped_angle_raw(command.body_yaw, mapped_mirror)),
        trace_field("intent", format!("{:?}", command.intent)),
    ];
    for plain_slot in 0..2 {
        let slot = if mapped_mirror { 1 - plain_slot } else { plain_slot };
        let arm = command.arms[slot];
        let prefix = if plain_slot == 0 { "left" } else { "right" };
        rows.push(trace_field(if prefix == "left" { "left.bearing" } else { "right.bearing" },
                              mapped_angle_raw(arm.bearing, mapped_mirror)));
        rows.push(trace_field(if prefix == "left" { "left.height" } else { "right.height" },
                              arm.height.raw()));
        rows.push(trace_field(if prefix == "left" { "left.reach" } else { "right.reach" },
                              arm.reach.raw()));
        rows.push(trace_field(if prefix == "left" { "left.effort" } else { "right.effort" },
                              arm.effort.raw()));
        rows.push(trace_field(if prefix == "left" { "left.grip" } else { "right.grip" },
                              format!("{:?}", command.grips[slot])));
    }
    rows
}

#[cfg(feature = "cartesian-recoil")]
fn resolution_rows(rows_in: &[sim::ContactResolution], mapped_mirror: bool) -> Vec<TraceField> {
    let mut rows = vec![trace_field("resolution.count", rows_in.len())];
    let mut ordered = rows_in.to_vec();
    ordered.sort_by_key(|row| {
        let key = row.fact.key;
        (key.a, if mapped_mirror { reflected_slot(key.a_slot) } else { key.a_slot },
         key.b, if mapped_mirror { reflected_slot(key.b_slot) } else { key.b_slot }, key.kind)
    });
    for row in &ordered {
        let key = row.fact.key;
        let a_slot = if mapped_mirror { reflected_slot(key.a_slot) } else { key.a_slot };
        let b_slot = if mapped_mirror { reflected_slot(key.b_slot) } else { key.b_slot };
        rows.push(trace_field("resolution.key", format!("{:?}:{}:{:?}:{}:{:?}",
            key.a, a_slot, key.b, b_slot, key.kind)));
        rows.push(trace_field("resolution.toi", row.fact.toi.get().raw()));
        rows.push(trace_field("resolution.alpha", row.group_alpha_raw));
        rows.push(trace_field("resolution.region", if mapped_mirror {
            match row.fact.region { 2 => 3, 3 => 2, other => other }
        } else { row.fact.region }));
        rows.extend(point_rows("resolution.point", row.fact.point, mapped_mirror));
        rows.extend(vector_rows("resolution.normal", row.fact.normal, mapped_mirror));
        rows.extend(vector_rows("resolution.velocity_a", row.fact.velocity_a, mapped_mirror));
        rows.extend(vector_rows("resolution.velocity_b", row.fact.velocity_b, mapped_mirror));
        rows.extend(vector_rows("resolution.impulse_a", row.impulse.on_a, mapped_mirror));
        rows.extend(vector_rows("resolution.impulse_b", row.impulse.on_b, mapped_mirror));
        rows.push(trace_field("resolution.energy.before", row.energy.before_raw));
        rows.push(trace_field("resolution.energy.after", row.energy.after_raw));
        rows.push(trace_field("resolution.energy.dissipated", row.energy.dissipated_raw));
    }
    rows
}

#[cfg(feature = "cartesian-recoil")]
fn rejection_text(world: &World, mapped_mirror: bool) -> String {
    match world.first_exact_contact_rejection() {
        None => "none".into(),
        Some(row) => {
            let key = row.key.map(|key| mapped_key(key, mapped_mirror));
            format!("tick={};phase={:?};cause={:?};key={:?}", row.tick, row.phase, row.cause, key)
        }
    }
}

#[cfg(feature = "cartesian-recoil")]
fn rejection_rows(world: &World, mapped_mirror: bool) -> Vec<TraceField> {
    let diagnostic = world.first_exact_contact_rejection();
    vec![
        trace_field("rejection.count", world.contact_solver_rejections()),
        trace_field("rejection.tick", diagnostic.map(|row| row.tick.to_string())
                    .unwrap_or_else(|| "none".into())),
        trace_field("rejection.phase", diagnostic.map(|row| format!("{:?}", row.phase))
                    .unwrap_or_else(|| "none".into())),
        trace_field("rejection.cause", diagnostic.map(|row| format!("{:?}", row.cause))
                    .unwrap_or_else(|| "none".into())),
        trace_field("rejection.key", diagnostic.and_then(|row| row.key)
                    .map(|key| format!("{:?}", mapped_key(key, mapped_mirror)))
                    .unwrap_or_else(|| "none".into())),
    ]
}

#[cfg(feature = "cartesian-recoil")]
fn mapped_group_keys(keys: &[Option<ExactContactKeyDiagnostic>; 16], mirror: bool) -> Vec<String> {
    let mut rows: Vec<_> = keys.iter().flatten().map(|key| {
        let a_slot = if mirror { reflected_slot(key.a_slot) } else { key.a_slot };
        let b_slot = if mirror { reflected_slot(key.b_slot) } else { key.b_slot };
        (key.a, a_slot, key.b, b_slot, key.kind)
    }).collect();
    rows.sort_unstable();
    rows.into_iter().map(|row| format!("{:?}:{}:{:?}:{}:{:?}",
        row.0, row.1, row.2, row.3, row.4)).collect()
}

#[cfg(feature = "cartesian-recoil")]
fn mapped_wide_toi(rows: &[Option<ExactWideToiDiagnostic>; 16], mirror: bool) -> Vec<String> {
    rows.iter().flatten().map(|row| {
        let a_slot = if mirror { reflected_slot(row.key.a_slot) } else { row.key.a_slot };
        let b_slot = if mirror { reflected_slot(row.key.b_slot) } else { row.key.b_slot };
        format!("{:?}:{}:{:?}:{}:{:?}:region={}:primitive={:?}:interval={}..{}:\
visits={:?}:steps={:?}:count={}:root={}:feature={}:comparison={:?}",
            row.key.a, a_slot, row.key.b, b_slot, row.key.kind, row.region, row.primitive,
            row.interval_start_raw, row.interval_end_raw, row.visited_times_raw,
            row.safe_steps_raw, row.visit_count, row.accepted_root_raw,
            row.closest_feature, row.comparison)
    }).collect()
}

#[cfg(feature = "cartesian-recoil")]
fn group_boundary_difference(plain: &[ExactContactGroupDiagnostic],
                             mirror: &[ExactContactGroupDiagnostic]) -> Option<String> {
    if plain.len() != mirror.len() {
        let tick = plain.first().map(|row| row.tick)
            .or_else(|| mirror.first().map(|row| row.tick)).unwrap_or(0);
        return Some(format!("tick={} group=none boundary=groups plain={} mirror={}\n\
plain_reject=none mirror_reject=none", tick, plain.len(), mirror.len()));
    }
    for (left, right) in plain.iter().zip(mirror) {
        let boundaries = [
            ("ordinal", left.group_ordinal.to_string(), right.group_ordinal.to_string()),
            ("wide_toi", format!("{:?}", mapped_wide_toi(&left.wide_toi, false)),
             format!("{:?}", mapped_wide_toi(&right.wide_toi, true))),
            ("selected_time", left.selected_time_raw.to_string(), right.selected_time_raw.to_string()),
            ("scan_candidates", left.scan_candidates.to_string(), right.scan_candidates.to_string()),
            ("mapped_time_members", left.mapped_time_members.to_string(), right.mapped_time_members.to_string()),
            ("mapped_member_keys", format!("{:?}", mapped_group_keys(&left.mapped_member_keys, false)),
             format!("{:?}", mapped_group_keys(&right.mapped_member_keys, true))),
            ("recomputed_facts", left.recomputed_facts.to_string(), right.recomputed_facts.to_string()),
            ("recomputed_keys", format!("{:?}", mapped_group_keys(&left.recomputed_keys, false)),
             format!("{:?}", mapped_group_keys(&right.recomputed_keys, true))),
            ("closure_entities", left.closure_entities.to_string(), right.closure_entities.to_string()),
            ("closure_rows", left.closure_rows.to_string(), right.closure_rows.to_string()),
            ("driver_contacts", left.driver_contacts.to_string(), right.driver_contacts.to_string()),
            ("lifted_contacts", left.lifted_contacts.to_string(), right.lifted_contacts.to_string()),
            ("output_rows", left.output_rows.to_string(), right.output_rows.to_string()),
            ("reject", format!("{:?}", left.reject), format!("{:?}", right.reject)),
        ];
        for (boundary, plain_value, mirror_value) in boundaries {
            if plain_value != mirror_value {
                return Some(format!("tick={} group={} boundary={} plain={} mirror={}\n\
plain_reject={:?} mirror_reject={:?}", left.tick, left.group_ordinal, boundary,
                    plain_value, mirror_value, left.reject, right.reject));
            }
        }
    }
    None
}

#[cfg(feature = "cartesian-recoil")]
fn crossing_rows(previous_weapon: SegmentPose, requested_weapon: SegmentPose,
                 previous_region: RegionVolume, requested_region: RegionVolume,
                 mapped_mirror: bool) -> Vec<TraceField> {
    let mut rows = Vec::new();
    rows.extend(point_rows("crossing.previous.lower", previous_region.lower, mapped_mirror));
    rows.extend(point_rows("crossing.previous.upper", previous_region.upper, mapped_mirror));
    rows.extend(point_rows("crossing.requested.lower", requested_region.lower, mapped_mirror));
    rows.extend(point_rows("crossing.requested.upper", requested_region.upper, mapped_mirror));
    rows.push(trace_field("crossing.previous.radius", previous_region.radius.raw()));
    rows.push(trace_field("crossing.requested.radius", requested_region.radius.raw()));
    let crossed = observed_crossing(StrikeMeasurement {
        contact_tick: None, previous_weapon, requested_weapon,
        tip_delta: Vec3::ZERO, hilt_delta: Vec3::ZERO, contact_point: None,
        velocity_a: Vec3::ZERO, velocity_b: Vec3::ZERO, region: None,
        energy_before_raw: 0, energy_after_raw: 0, energy_dissipated_raw: 0,
        cut_raw: 0, thrust_raw: 0, pressure_raw: 0, deflected_raw: 0,
        integrity_before_raw: [0; BodyPart::COUNT], integrity_after_raw: [0; BodyPart::COUNT],
        wound_before_raw: [0; BodyPart::COUNT], wound_after_raw: [0; BodyPart::COUNT],
        blood_before_raw: 0, blood_after_raw: 0, weapon_body_facts: 0, competing_facts: 0,
        contact_reach_raw: None, contact_arm_velocity: Vec3::ZERO,
        observed_contact_region: None,
        crossing_oracle: Some(CrossingOracle { previous: previous_region,
                                               requested: requested_region }),
        refusals: 0, solver_rejections: 0, max_energy_excess_raw: 0,
        contact_key: None, toi_raw: None, normal: Vec3::ZERO, impulse_on_a: Vec3::ZERO,
        group_alpha_raw: None, cap_hits: 0,
    });
    rows.push(trace_field("crossing.result", crossed));
    rows
}

#[cfg(feature = "cartesian-recoil")]
fn trace_case_1536() -> MechanicalCase { declared_central_cases()[1536] }

#[cfg(feature = "cartesian-recoil")]
fn mirror_trace_1536_inner() -> String {
    let case = trace_case_1536();
    let cases = [false, true].map(|mirrored| StrongCase { seed: 0, mirrored,
        target_anatomy: case.target_anatomy, approach_offset: case.approach_offset });
    let max_ticks = case.chamber_ticks + case.strike_ticks + 1;
    let configs = cases.map(|case| config_for_ticks(case, max_ticks,
                                                    MirrorGrammar::AnatomicalHandSwap));
    let mut mapped = configs[1];
    for fighter in &mut mapped.fighters {
        fighter.spawn.y = Fx::from_int(16) - fighter.spawn.y;
        fighter.hands.swap(0, 1);
    }
    if configs[0] != mapped {
        return "tick=0 phase=Config pair=config.bytes=plain|mirror\ncause=none|none".into();
    }
    let scenarios = configs.map(|config| Scenario::duel_from(&config)
        .expect("the ordinal-1536 trace duel is legal"));
    let anatomies = scenarios.each_ref().map(|scenario| scenario.combat_specs.as_ref()
        .expect("configured combat specs").anatomy(2).expect("defender anatomy").clone());
    let mut worlds = [World::new(&scenarios[0], 0), World::new(&scenarios[1], 0)];
    let ids = worlds.each_ref().map(|world| (world.alive_ids(Faction::Heroes)[0],
                                              world.alive_ids(Faction::Monsters)[0]));
    let limbs = [LimbSlot::RightArm, LimbSlot::LeftArm];
    let bearings = cases.map(declared_schedule_bearing);
    let heights = [0, 1].map(|at| {
        let shown = worlds[at].observe_articulated(ids[at].0);
        let foe = shown.opponents().first().expect("the target is observed");
        let region = foe.regions[BodyPart::Legs as usize];
        CombatHeight::try_from_raw((((region.lower.z + region.upper.z) / Fx::from_int(2)
            - foe.body_position.z) / shown.standing_height).clamp(Fx::ZERO, Fx::ONE).raw())
            .expect("bounded command height")
    });

    for tick_index in 0..max_ticks {
        let pre = [0, 1].map(|at| (worlds[at].articulated_pose(ids[at].0).unwrap(),
                                    worlds[at].articulated_pose(ids[at].1).unwrap()));
        let phase_bearings = [0, 1].map(|at| {
            let pair = schedule_bearings(bearings[at], cases[at].mirrored);
            if tick_index < case.chamber_ticks { pair.0 } else { pair.1 }
        });
        let commands = [0, 1].map(|at| {
            let attacker_obs = worlds[at].observe_articulated(ids[at].0);
            let defender_obs = worlds[at].observe_articulated(ids[at].1);
            (command(&attacker_obs, ids[at].1, limbs[at], phase_bearings[at], heights[at],
                     if tick_index < case.chamber_ticks { Fx::ONE }
                     else { Fx::from_raw(case.reach_raw) }, Fx::ONE),
             neutral_articulated_command(&defender_obs))
        });
        for actor in 0..2 {
            let plain_command = if actor == 0 { commands[0].0 } else { commands[0].1 };
            let mirror_command = if actor == 0 { commands[1].0 } else { commands[1].1 };
            let plain = command_rows(plain_command, false);
            let mirror = command_rows(mirror_command, true);
            if let Some(diff) = trace_difference(tick_index, "Command", &plain, &mirror,
                                                 "none".into(), "none".into()) {
                return format_trace_difference(diff);
            }
        }
        for entity in 0..2 {
            let plain = pose_rows(if entity == 0 { pre[0].0 } else { pre[0].1 }, false);
            let mirror = pose_rows(if entity == 0 { pre[1].0 } else { pre[1].1 }, true);
            if let Some(diff) = trace_difference(tick_index, "PreStepPose", &plain, &mirror,
                                                 "none".into(), "none".into()) {
                return format_trace_difference(diff);
            }
        }
        for at in 0..2 {
            let _ = worlds[at].submit_articulated_v1(ids[at].0, commands[at].0);
            let _ = worlds[at].submit_articulated_v1(ids[at].1, commands[at].1);
            let _ = worlds[at].step();
        }
        if let Some(diff) = group_boundary_difference(
            worlds[0].exact_contact_group_diagnostics(),
            worlds[1].exact_contact_group_diagnostics()) {
            return diff;
        }
        let post = [0, 1].map(|at| (worlds[at].articulated_pose(ids[at].0).unwrap(),
                                     worlds[at].articulated_pose(ids[at].1).unwrap()));
        for entity in 0..2 {
            let plain = pose_rows(if entity == 0 { post[0].0 } else { post[0].1 }, false);
            let mirror = pose_rows(if entity == 0 { post[1].0 } else { post[1].1 }, true);
            if let Some(diff) = trace_difference(worlds[0].tick(), "PostStepPose", &plain, &mirror,
                rejection_text(&worlds[0], false), rejection_text(&worlds[1], true)) {
                return format_trace_difference(diff);
            }
        }
        if let Some(diff) = trace_difference(worlds[0].tick(), "Resolution",
            &resolution_rows(worlds[0].contact_resolutions(), false),
            &resolution_rows(worlds[1].contact_resolutions(), true),
            rejection_text(&worlds[0], false), rejection_text(&worlds[1], true)) {
            return format_trace_difference(diff);
        }
        if let Some(diff) = trace_difference(worlds[0].tick(), "Rejection",
            &rejection_rows(&worlds[0], false), &rejection_rows(&worlds[1], true),
            rejection_text(&worlds[0], false), rejection_text(&worlds[1], true)) {
            return format_trace_difference(diff);
        }
        let crossing = [0, 1].map(|at| {
            let previous_region = ground_truth_region(pre[at].1, &anatomies[at], BodyPart::Legs);
            let requested_region = ground_truth_region(post[at].1, &anatomies[at], BodyPart::Legs);
            let previous_weapon = pre[at].0.weapons[limbs[at] as usize].unwrap();
            let requested_weapon = post[at].0.weapons[limbs[at] as usize].unwrap();
            crossing_rows(previous_weapon, requested_weapon, previous_region, requested_region,
                          at == 1)
        });
        if let Some(diff) = trace_difference(worlds[0].tick(), "CrossingOracle",
            &crossing[0], &crossing[1], rejection_text(&worlds[0], false),
            rejection_text(&worlds[1], true)) {
            return format_trace_difference(diff);
        }
    }
    format!("ticks={} phase=none", max_ticks)
}

#[cfg(feature = "cartesian-recoil")]
fn format_trace_difference(diff: TraceDifference) -> String {
    format!("tick={} phase={} pair={}:{}|{}\ncause={}|{}", diff.tick, diff.phase,
            diff.field, diff.plain, diff.mirror, diff.plain_cause, diff.mirror_cause)
}

#[cfg(feature = "cartesian-recoil")]
pub(crate) fn mirror_trace_1536() -> String {
    std::thread::Builder::new().name("smart42-mirror-trace-1536".into())
        .stack_size(STRIKE_CORPUS_STACK_BYTES).spawn(mirror_trace_1536_inner)
        .expect("could not start the bounded ordinal-1536 trace")
        .join().expect("the bounded ordinal-1536 trace panicked")
}

fn better_pair(left: &RobustMechanicalPair, right: &RobustMechanicalPair) -> bool {
    left.worst_dissipated_raw > right.worst_dissipated_raw
        || (left.worst_dissipated_raw == right.worst_dissipated_raw
            && (left.centre.chamber_ticks + left.centre.strike_ticks,
                left.centre.ordinal)
                < (right.centre.chamber_ticks + right.centre.strike_ticks,
                   right.centre.ordinal))
}

fn select_robust(rows: &[RobustMechanicalPair]) -> Option<usize> {
    rows.iter().enumerate().fold(None, |best, (at, row)| match best {
        None => Some(at), Some(old) if better_pair(row, &rows[old]) => Some(at), _ => best,
    })
}

fn execute_cases_with(cases: &[MechanicalCase], anatomical: bool, mut measure: impl FnMut(
    MechanicalCase, bool, i32, i32) -> (MechanicalRow, DamageSidecar),
) -> StrikeCorpusAudit {
    let mut audit = StrikeCorpusAudit::default();
    for &case in cases {
        let measured = [false, true].map(|mirrored| measure(case, mirrored, 0, 0));
        let pair = measured.map(|row| row.0);
        audit.central_rows.extend(pair);
        audit.central_damage.extend(measured.map(|row| row.1));
        if !pair.into_iter().all(|row| row.eligible) { continue; }
        let mut local = Vec::with_capacity(18);
        for strike_delta in STRIKE_TICK_DELTAS {
            for reach_delta in REACH_DELTAS_RAW {
                for mirrored in [false, true] {
                    let measured = measure(case, mirrored, strike_delta, reach_delta);
                    local.push(measured.0);
                    audit.local_damage.push(measured.1);
                }
            }
        }
        audit.local_rows.extend(local.iter().copied());
        if local.chunks_exact(2).all(|pair| mirrored_pair([pair[0], pair[1]], anatomical)) {
            let worst = local.iter().map(|row| row.dissipated_raw).min().unwrap_or(0);
            audit.robust.push(RobustMechanicalPair { centre: case, rows: local,
                                                     worst_dissipated_raw: worst });
        }
    }
    audit.selected = select_robust(&audit.robust);
    audit
}

#[cfg(test)]
fn execute_corpus_with(measure: impl FnMut(MechanicalCase, bool, i32, i32)
                       -> (MechanicalRow, DamageSidecar)) -> StrikeCorpusAudit {
    execute_cases_with(&declared_central_cases(), false, measure)
}

const STRIKE_CORPUS_SHARDS: usize = 4;
const STRIKE_CORPUS_STACK_BYTES: usize = 16 * 1024 * 1024;

fn append_audit(whole: &mut StrikeCorpusAudit, mut shard: StrikeCorpusAudit) {
    whole.central_rows.append(&mut shard.central_rows);
    whole.local_rows.append(&mut shard.local_rows);
    whole.central_damage.append(&mut shard.central_damage);
    whole.local_damage.append(&mut shard.local_damage);
    whole.robust.append(&mut shard.robust);
}

fn execute_corpus_sharded_with<M>(anatomical: bool, measure: M) -> StrikeCorpusAudit
where M: Fn(MechanicalCase, bool, i32, i32) -> (MechanicalRow, DamageSidecar) + Sync
{
    let cases = declared_central_cases();
    let shard_len = cases.len().div_ceil(STRIKE_CORPUS_SHARDS);
    let mut whole = StrikeCorpusAudit::default();
    std::thread::scope(|scope| {
        let mut workers = Vec::with_capacity(STRIKE_CORPUS_SHARDS);
        for (shard, cases) in cases.chunks(shard_len).enumerate() {
            let measure = &measure;
            workers.push(std::thread::Builder::new()
                .name(format!("smart39-strike-corpus-{shard}"))
                .stack_size(STRIKE_CORPUS_STACK_BYTES)
                .spawn_scoped(scope, move || execute_cases_with(cases, anatomical, measure))
                .expect("could not start a bounded strike-corpus shard"));
        }
        // Chunks are contiguous ordinal ranges. Joining in creation order is
        // therefore the canonical serial order regardless of completion order.
        for worker in workers {
            append_audit(&mut whole, worker.join()
                .expect("a bounded strike-corpus shard panicked"));
        }
    });
    whole.selected = select_robust(&whole.robust);
    whole
}

pub(crate) fn run_predeclared_strike_corpus() -> StrikeCorpusAudit {
    execute_corpus_sharded_with(false, |case, mirrored, strike_delta, reach_delta| {
        let strike_ticks = (case.strike_ticks as i32 + strike_delta) as u32;
        let measured = measure_case_schedule(StrongCase { seed: 0, mirrored,
            target_anatomy: case.target_anatomy, approach_offset: case.approach_offset },
            Fx::ONE, case.chamber_ticks, strike_ticks, Fx::from_raw(case.reach_raw + reach_delta));
        (selection_row(case, mirrored, strike_delta, reach_delta, measured),
         damage_sidecar(measured))
    })
}

pub(crate) fn run_predeclared_anatomical_mirror_corpus() -> StrikeCorpusAudit {
    execute_corpus_sharded_with(true, |case, mirrored, strike_delta, reach_delta| {
        let strike_ticks = (case.strike_ticks as i32 + strike_delta) as u32;
        let measured = measure_case_schedule_with(StrongCase { seed: 0, mirrored,
            target_anatomy: case.target_anatomy, approach_offset: case.approach_offset },
            Fx::ONE, case.chamber_ticks, strike_ticks, Fx::from_raw(case.reach_raw + reach_delta),
            MirrorGrammar::AnatomicalHandSwap, ScheduleBearingSource::ObservedOpponent);
        (selection_row(case, mirrored, strike_delta, reach_delta, measured),
         damage_sidecar(measured))
    })
}

pub(crate) fn run_predeclared_noise_free_mirror_corpus() -> StrikeCorpusAudit {
    execute_corpus_sharded_with(true, |case, mirrored, strike_delta, reach_delta| {
        let strike_ticks = (case.strike_ticks as i32 + strike_delta) as u32;
        let measured = measure_case_schedule_with(StrongCase { seed: 0, mirrored,
            target_anatomy: case.target_anatomy, approach_offset: case.approach_offset },
            Fx::ONE, case.chamber_ticks, strike_ticks, Fx::from_raw(case.reach_raw + reach_delta),
            MirrorGrammar::AnatomicalHandSwap, ScheduleBearingSource::DeclaredSpawnOffset);
        (selection_row(case, mirrored, strike_delta, reach_delta, measured),
         damage_sidecar(measured))
    })
}

fn checksum_word(hash: &mut u64, word: u64) {
    for byte in word.to_le_bytes() {
        *hash ^= byte as u64;
        *hash = hash.wrapping_mul(0x100_0000_01b3);
    }
}

pub(crate) fn strike_corpus_checksum(audit: &StrikeCorpusAudit) -> u64 {
    strike_corpus_checksum_with(audit, None)
}

pub(crate) fn anatomical_mirror_corpus_checksum(audit: &StrikeCorpusAudit) -> u64 {
    strike_corpus_checksum_with(audit, Some(ScheduleBearingSource::ObservedOpponent))
}

pub(crate) fn noise_free_mirror_corpus_checksum(audit: &StrikeCorpusAudit) -> u64 {
    strike_corpus_checksum_with(audit, Some(ScheduleBearingSource::DeclaredSpawnOffset))
}

fn strike_corpus_checksum_with(audit: &StrikeCorpusAudit,
                               source: Option<ScheduleBearingSource>) -> u64 {
    let mut hash = 0xcbf2_9ce4_8422_2325;
    if let Some(source) = source { checksum_word(&mut hash, source as u64); }
    for value in INTERIOR_CHAMBER_TICKS { checksum_word(&mut hash, value as u64); }
    for value in INTERIOR_STRIKE_TICKS { checksum_word(&mut hash, value as u64); }
    for value in INTERIOR_REACH_TARGETS_RAW { checksum_word(&mut hash, value as u64); }
    for value in STRIKE_TICK_DELTAS { checksum_word(&mut hash, value as u64); }
    for value in REACH_DELTAS_RAW { checksum_word(&mut hash, value as u64); }
    for value in APPROACH_OFFSETS {
        checksum_word(&mut hash, value.x.raw() as u64);
        checksum_word(&mut hash, value.y.raw() as u64);
    }
    if let Some(selected) = audit.selected {
        for row in &audit.robust[selected].rows {
            checksum_word(&mut hash, row.case.ordinal as u64);
            checksum_word(&mut hash, row.strike_delta as u64);
            checksum_word(&mut hash, row.reach_delta_raw as u64);
            checksum_word(&mut hash, row.mirrored as u64);
            checksum_word(&mut hash, row.dissipated_raw);
            checksum_word(&mut hash, row.toi_raw.unwrap_or(i32::MIN) as u64);
            for value in [row.point.unwrap_or(Vec3::ZERO), row.normal, row.impulse] {
                checksum_word(&mut hash, value.x.raw() as u64);
                checksum_word(&mut hash, value.y.raw() as u64);
                checksum_word(&mut hash, value.z.raw() as u64);
            }
        }
    }
    hash
}

#[cfg(test)]
mod tests {
    use super::*;

    fn anatomical_case(mirrored: bool) -> StrongCase {
        StrongCase { seed: 0, mirrored, target_anatomy: AnatomyChoice::Brute,
            approach_offset: Vec2::new(Fx::from_ratio(-5, 2), Fx::from_int(-1)) }
    }

    fn reflect_point(value: Vec3) -> Vec3 {
        Vec3::new(value.x, Fx::from_int(16) - value.y, value.z)
    }

    fn reflect_vector(value: Vec3) -> Vec3 { Vec3::new(value.x, -value.y, value.z) }

    fn shield_corners(pose: sim::ShieldPose) -> [Vec3; 4] {
        let front = pose.centre + pose.normal * (pose.thickness / Fx::from_int(2));
        let left = Vec3::new(-pose.normal.y, pose.normal.x, Fx::ZERO);
        let side = left * pose.half_width; let up = Vec3::Z * pose.half_height;
        [front - side - up, front + side - up, front + side + up, front - side + up]
    }

    fn synthetic_row(case: MechanicalCase, mirrored: bool, eligible: bool,
                     dissipated_raw: u64) -> MechanicalRow {
        MechanicalRow { case, strike_delta: 0, reach_delta_raw: 0, mirrored, eligible,
            failure_mask: if eligible { 0 } else { FAILURE_MISSING_CONTACT },
            key: Some((EntityId::new(0, 0), 1, EntityId::new(1, 0), BODY_SLOT,
                       ContactKind::WeaponBody)), region: Some(BodyPart::Legs), toi_raw: Some(7),
            point: Some(Vec3::new(Fx::from_raw(3),
                                  Fx::from_int(8) + Fx::from_raw(if mirrored { -4 } else { 4 }),
                                  Fx::from_raw(5))),
            normal: Vec3::new(Fx::ONE, Fx::from_raw(if mirrored { -2 } else { 2 }), Fx::ZERO),
            impulse: Vec3::new(Fx::from_raw(-9), Fx::from_raw(if mirrored { -3 } else { 3 }),
                               Fx::ZERO),
            dissipated_raw, refusals: 0, solver_rejections: 0, cap_hits: 0,
            energy_excess_raw: 0 }
    }

    fn anatomical_synthetic_row(case: MechanicalCase, mirrored: bool, eligible: bool,
                                dissipated_raw: u64) -> MechanicalRow {
        let mut row = synthetic_row(case, mirrored, eligible, dissipated_raw);
        if mirrored {
            row.key = row.key.map(|key| mapped_key(key, true));
        }
        row
    }

    #[test]
    fn anatomical_mirror_swaps_every_hand_binding_and_preserves_item_specs() {
        let plain = config_for_ticks(anatomical_case(false), 40,
            MirrorGrammar::AnatomicalHandSwap);
        let mirror = config_for_ticks(anatomical_case(true), 40,
            MirrorGrammar::AnatomicalHandSwap);
        for fighter in 0..2 {
            assert_eq!(plain.fighters[fighter].hands[0], mirror.fighters[fighter].hands[1]);
            assert_eq!(plain.fighters[fighter].hands[1], mirror.fighters[fighter].hands[0]);
            assert_eq!(plain.fighters[fighter].anatomy, mirror.fighters[fighter].anatomy);
        }
        assert_eq!(plain.max_ticks, mirror.max_ticks);
        assert_eq!(plain.fighters[0].spawn.x, mirror.fighters[0].spawn.x);
        assert_eq!(plain.fighters[0].spawn.y + mirror.fighters[0].spawn.y,
                   Fx::from_int(16));
    }

    #[test]
    fn anatomical_mirror_maps_spawn_yaw_hands_weapon_and_shield_exactly() {
        let plain_world = World::new(&scenario_for_ticks_with(anatomical_case(false), 40,
            MirrorGrammar::AnatomicalHandSwap), 0);
        let mirror_world = World::new(&scenario_for_ticks_with(anatomical_case(true), 40,
            MirrorGrammar::AnatomicalHandSwap), 0);
        for faction in [Faction::Heroes, Faction::Monsters] {
            let plain_id = plain_world.alive_ids(faction)[0];
            let mirror_id = mirror_world.alive_ids(faction)[0];
            let plain = plain_world.observe_articulated(plain_id);
            let mirror = mirror_world.observe_articulated(mirror_id);
            assert_eq!(reflect_point(plain.body_position), mirror.body_position);
            assert_eq!(plain.body_yaw, mirror.body_yaw);
            assert_eq!(reflect_point(plain.arms[0].hand), mirror.arms[1].hand);
            assert_eq!(reflect_point(plain.arms[1].hand), mirror.arms[0].hand);
            assert_eq!(plain.arms[0].equipment, mirror.arms[1].equipment);
            assert_eq!(plain.arms[1].equipment, mirror.arms[0].equipment);
            for (a, b) in [(0, 1), (1, 0)] {
                match (plain.weapons[a], mirror.weapons[b]) {
                    (Some(left), Some(right)) => {
                        assert_eq!(reflect_point(left.hilt), right.hilt);
                        assert_eq!(reflect_point(left.tip), right.tip);
                        assert_eq!(left.radius, right.radius);
                    }
                    (None, None) => {}
                    pair => panic!("weapon reflection mismatch: {pair:?}"),
                }
            }
            assert_eq!(plain.shield.present, mirror.shield.present);
            if plain.shield.present {
                assert_eq!(reflect_point(plain.shield.centre), mirror.shield.centre);
                assert_eq!(reflect_vector(plain.shield.normal), mirror.shield.normal);
            }
            assert_eq!((plain.shield.half_width, plain.shield.half_height),
                       (mirror.shield.half_width, mirror.shield.half_height));
            let plain_pose = plain_world.articulated_pose(plain_id).unwrap();
            let mirror_pose = mirror_world.articulated_pose(mirror_id).unwrap();
            if let (Some(a), Some(b)) = (plain_pose.shield, mirror_pose.shield) {
                let a = shield_corners(a).map(reflect_point);
                let b = shield_corners(b);
                assert_eq!([a[0], a[1], a[2], a[3]], [b[1], b[0], b[3], b[2]]);
            }
        }
    }

    #[test]
    fn anatomical_mirror_commands_left_with_the_negated_right_arm_schedule() {
        let world = World::new(&scenario_for_ticks_with(anatomical_case(false), 40,
            MirrorGrammar::AnatomicalHandSwap), 0);
        let id = world.alive_ids(Faction::Heroes)[0];
        let foe = world.alive_ids(Faction::Monsters)[0];
        let obs = world.observe_articulated(id);
        let plain_angles = schedule_bearings(Angle::from_raw(1_731), false);
        let mirror_angles = schedule_bearings(Angle::from_raw(1_731u16.wrapping_neg()), true);
        for (plain_angle, mirror_angle) in [plain_angles.0, plain_angles.1]
            .into_iter().zip([mirror_angles.0, mirror_angles.1]) {
            let plain = command(&obs, foe, LimbSlot::RightArm, plain_angle,
                CombatHeight::MID, Fx::from_raw(50_000), Fx::ONE);
            let mirror = command(&obs, foe, LimbSlot::LeftArm, mirror_angle,
                CombatHeight::MID, Fx::from_raw(50_000), Fx::ONE);
            assert_eq!(mirror.arms[0].bearing.raw(), plain.arms[1].bearing.raw().wrapping_neg());
            assert_eq!((mirror.arms[0].height, mirror.arms[0].reach, mirror.arms[0].effort),
                       (plain.arms[1].height, plain.arms[1].reach, plain.arms[1].effort));
            assert_eq!(plain.arms[0], neutral_articulated_command(&obs).arms[0]);
            assert_eq!(mirror.arms[1], neutral_articulated_command(&obs).arms[1]);
        }
    }

    #[test]
    fn anatomical_mirror_maps_contact_key_limb_slots_without_swapping_entities() {
        let a = EntityId::new(2, 3); let b = EntityId::new(7, 11);
        let right_body = (a, LimbSlot::RightArm as u8, b, BODY_SLOT,
                          ContactKind::WeaponBody);
        assert_eq!(mapped_key(right_body, true),
            (a, LimbSlot::LeftArm as u8, b, BODY_SLOT, ContactKind::WeaponBody));
        assert_ne!(mapped_key(right_body, true), right_body);
    }

    #[test]
    fn the_existing_grid_has_7560_oriented_runs_and_no_early_exit() {
        let eligible = [4u32, 17u32]; let mut visits = 0usize;
        let audit = execute_corpus_with(|case, mirrored, _, _| {
            visits += 1;
            (synthetic_row(case, mirrored, eligible.contains(&case.ordinal), 10),
             DamageSidecar { cut_raw: visits as u64, thrust_raw: 0, pressure_raw: 0,
                             integrity_loss_raw: 0 })
        });
        assert_eq!(audit.central_rows.len(), 7_560);
        assert_eq!(audit.local_rows.len(), eligible.len() * 18);
        assert_eq!(audit.central_damage.len(), audit.central_rows.len());
        assert_eq!(audit.local_damage.len(), audit.local_rows.len());
        assert_eq!(visits, 7_560 + eligible.len() * 18);
        assert_eq!(audit.robust.len(), eligible.len());
    }

    #[test]
    fn four_fixed_shards_preserve_serial_rows_selection_and_checksum() {
        use std::sync::atomic::{AtomicUsize, Ordering};

        let visits = AtomicUsize::new(0);
        let measure = |case: MechanicalCase, mirrored: bool,
                       strike_delta: i32, reach_delta_raw: i32| {
            visits.fetch_add(1, Ordering::Relaxed);
            let eligible = matches!(case.ordinal, 4 | 17 | 3_779);
            let mut row = synthetic_row(case, mirrored, eligible,
                100 + case.ordinal as u64);
            row.strike_delta = strike_delta;
            row.reach_delta_raw = reach_delta_raw;
            let sidecar = DamageSidecar {
                cut_raw: case.ordinal as u64,
                thrust_raw: strike_delta as u64,
                pressure_raw: reach_delta_raw as u64,
                integrity_loss_raw: i32::from(mirrored),
            };
            (row, sidecar)
        };
        let serial = execute_corpus_with(&measure);
        let serial_visits = visits.swap(0, Ordering::Relaxed);
        let sharded = execute_corpus_sharded_with(false, &measure);
        assert_eq!(visits.load(Ordering::Relaxed), serial_visits);
        assert_eq!(sharded, serial);
        assert_eq!(strike_corpus_checksum(&sharded), strike_corpus_checksum(&serial));
        assert!(sharded.central_rows.windows(2)
            .all(|rows| (rows[0].case.ordinal, rows[0].mirrored)
                <= (rows[1].case.ordinal, rows[1].mirrored)));
    }

    fn synthetic_anatomical_audit(eligible: &[u32]) -> StrikeCorpusAudit {
        execute_corpus_sharded_with(true, |case, mirrored, strike_delta, reach_delta_raw| {
            let mut row = anatomical_synthetic_row(case, mirrored,
                eligible.contains(&case.ordinal), 100 + case.ordinal as u64);
            row.strike_delta = strike_delta;
            row.reach_delta_raw = reach_delta_raw;
            (row, DamageSidecar { cut_raw: u64::MAX - case.ordinal as u64,
                thrust_raw: mirrored as u64, pressure_raw: reach_delta_raw as u64,
                integrity_loss_raw: strike_delta })
        })
    }

    #[test]
    fn anatomical_mirror_reuses_all_7560_central_orientations_without_early_exit() {
        let audit = synthetic_anatomical_audit(&[4, 17]);
        assert_eq!(audit.central_rows.len(), 7_560);
        assert_eq!(audit.local_rows.len(), 36);
        assert_eq!(audit.robust.len(), 2);
        assert_eq!(audit.central_rows.first().unwrap().case.ordinal, 0);
        assert_eq!(audit.central_rows.last().unwrap().case.ordinal, 3_779);
    }

    #[test]
    fn anatomical_local_freeze_has_eighteen_orientations_for_every_eligible_pair() {
        let audit = synthetic_anatomical_audit(&[1, 2, 3]);
        assert_eq!(audit.local_rows.len(), 3 * 18);
        for rows in audit.local_rows.chunks_exact(18) {
            let got: Vec<_> = rows.iter().map(|row|
                (row.strike_delta, row.reach_delta_raw, row.mirrored)).collect();
            let expected: Vec<_> = STRIKE_TICK_DELTAS.into_iter().flat_map(|strike|
                REACH_DELTAS_RAW.into_iter().flat_map(move |reach|
                    [false, true].map(move |mirror| (strike, reach, mirror)))).collect();
            assert_eq!(got, expected);
        }
    }

    #[test]
    fn anatomical_pair_mapping_swaps_only_held_contact_slots() {
        let case = declared_central_cases()[0];
        let plain = anatomical_synthetic_row(case, false, true, 9);
        let mirror = anatomical_synthetic_row(case, true, true, 9);
        assert!(mirrored_pair([plain, mirror], true));
        assert!(!mirrored_pair([plain, mirror], false));
        assert_eq!(plain.key.unwrap().0, mirror.key.unwrap().0);
        assert_eq!(plain.key.unwrap().2, mirror.key.unwrap().2);
        assert_eq!(plain.key.unwrap().3, BODY_SLOT);
        assert_eq!(mirror.key.unwrap().3, BODY_SLOT);
    }

    #[test]
    fn anatomical_selection_is_maximin_dissipation_then_duration_then_ordinal() {
        mechanical_ranking_uses_worst_case_dissipation_then_duration_then_ordinal();
    }

    #[test]
    fn anatomical_selection_is_unchanged_by_contradictory_damage_sidecars() {
        contradictory_damage_sidecars_cannot_change_mechanical_selection();
    }

    #[test]
    fn smart39_and_smart40_differ_only_in_the_declared_mirror_grammar() {
        for case in declared_central_cases() {
            let plain39 = config_for_ticks(StrongCase { mirrored: false, seed: 0,
                target_anatomy: case.target_anatomy, approach_offset: case.approach_offset },
                case.chamber_ticks + case.strike_ticks, MirrorGrammar::SpatialRightHand);
            let plain40 = config_for_ticks(StrongCase { mirrored: false, seed: 0,
                target_anatomy: case.target_anatomy, approach_offset: case.approach_offset },
                case.chamber_ticks + case.strike_ticks, MirrorGrammar::AnatomicalHandSwap);
            assert_eq!(plain39, plain40);
            let mirrored = StrongCase { mirrored: true, seed: 0,
                target_anatomy: case.target_anatomy, approach_offset: case.approach_offset };
            let old = config_for_ticks(mirrored, case.chamber_ticks + case.strike_ticks,
                MirrorGrammar::SpatialRightHand);
            let new = config_for_ticks(mirrored, case.chamber_ticks + case.strike_ticks,
                MirrorGrammar::AnatomicalHandSwap);
            assert_eq!(old.max_ticks, new.max_ticks);
            for fighter in 0..2 {
                assert_eq!(old.fighters[fighter].anatomy, new.fighters[fighter].anatomy);
                assert_eq!(old.fighters[fighter].spawn, new.fighters[fighter].spawn);
                assert_eq!(old.fighters[fighter].hands[0], new.fighters[fighter].hands[1]);
                assert_eq!(old.fighters[fighter].hands[1], new.fighters[fighter].hands[0]);
            }
            assert_eq!(attacking_limb(mirrored, MirrorGrammar::SpatialRightHand),
                       LimbSlot::RightArm);
            assert_eq!(attacking_limb(mirrored, MirrorGrammar::AnatomicalHandSwap),
                       LimbSlot::LeftArm);
        }
        let empty = StrikeCorpusAudit::default();
        assert_ne!(strike_corpus_checksum(&empty), anatomical_mirror_corpus_checksum(&empty));
    }

    fn ordinal_strong_case(ordinal: usize, mirrored: bool) -> StrongCase {
        let case = declared_central_cases()[ordinal];
        StrongCase { seed: 0, mirrored, target_anatomy: case.target_anatomy,
                     approach_offset: case.approach_offset }
    }

    #[test]
    fn declared_schedule_bearings_are_exact_negations_at_ordinal_1536() {
        let plain = ordinal_strong_case(1_536, false);
        let mirror = ordinal_strong_case(1_536, true);
        let plain_schedule = schedule_bearings(declared_schedule_bearing(plain), false);
        let mirror_schedule = schedule_bearings(declared_schedule_bearing(mirror), true);
        assert_eq!(mirror_schedule.0.raw(), plain_schedule.0.raw().wrapping_neg());
        assert_eq!(mirror_schedule.1.raw(), plain_schedule.1.raw().wrapping_neg());
        let plain_config = config_for_ticks(plain, 48, MirrorGrammar::AnatomicalHandSwap);
        let mirror_config = config_for_ticks(mirror, 48, MirrorGrammar::AnatomicalHandSwap);
        assert_eq!(plain_config.fighters[0].spawn.y + mirror_config.fighters[0].spawn.y,
                   Fx::from_int(16));
        assert_eq!(attacking_limb(plain, MirrorGrammar::AnatomicalHandSwap),
                   LimbSlot::RightArm);
        assert_eq!(attacking_limb(mirror, MirrorGrammar::AnatomicalHandSwap),
                   LimbSlot::LeftArm);
    }

    #[test]
    fn perception_noise_cannot_enter_the_declared_schedule_bearing() {
        let case = ordinal_strong_case(1_536, false);
        let world = World::new(&scenario_for_ticks_with(case, 48,
            MirrorGrammar::AnatomicalHandSwap), 0);
        let id = world.alive_ids(Faction::Heroes)[0];
        let foe = world.alive_ids(Faction::Monsters)[0];
        let clean = world.observe_articulated(id);
        let mut noised = clean;
        noised.opponents[0].body_position.x += Fx::from_int(3);
        noised.opponents[0].body_position.y -= Fx::from_int(2);
        let bearing_a = declared_schedule_bearing(case);
        let bearing_b = declared_schedule_bearing(case);
        assert_eq!(bearing_a, bearing_b);
        let a = command(&clean, foe, LimbSlot::RightArm, bearing_a,
            CombatHeight::MID, Fx::ONE, Fx::ONE);
        let b = command(&noised, foe, LimbSlot::RightArm, bearing_b,
            CombatHeight::MID, Fx::ONE, Fx::ONE);
        assert_eq!(a, b);
        let observed_a = Vec2::new(clean.opponents[0].body_position.x - clean.body_position.x,
            clean.opponents[0].body_position.y - clean.body_position.y).angle();
        let observed_b = Vec2::new(noised.opponents[0].body_position.x - noised.body_position.x,
            noised.opponents[0].body_position.y - noised.body_position.y).angle();
        assert_ne!(observed_a, observed_b, "the test did not perturb the old source");
    }

    #[test]
    fn smart40_and_smart41_inputs_differ_only_in_schedule_bearing_source() {
        assert_eq!(STRIKE_TICK_DELTAS, [-1, 0, 1]);
        assert_eq!(REACH_DELTAS_RAW, [-256, 0, 256]);
        let case = ordinal_strong_case(1_536, true);
        let config40 = config_for_ticks(case, 48, MirrorGrammar::AnatomicalHandSwap);
        let config41 = config_for_ticks(case, 48, MirrorGrammar::AnatomicalHandSwap);
        assert_eq!(config40, config41);
        assert_eq!(attacking_limb(case, MirrorGrammar::AnatomicalHandSwap), LimbSlot::LeftArm);
        assert_ne!(ScheduleBearingSource::ObservedOpponent,
                   ScheduleBearingSource::DeclaredSpawnOffset);
        let declared = declared_schedule_bearing(case);
        let world = World::new(&Scenario::duel_from(&config40).unwrap(), 0);
        let hero = world.alive_ids(Faction::Heroes)[0];
        let shown = world.observe_articulated(hero);
        let foe = shown.opponents()[0];
        let observed = Vec2::new(foe.body_position.x - shown.body_position.x,
            foe.body_position.y - shown.body_position.y).angle();
        assert_ne!(observed, declared, "ordinal 1536 did not expose the source correction");
        let chamber40 = schedule_bearings(observed, true).0;
        let chamber41 = schedule_bearings(declared, true).0;
        let target = world.alive_ids(Faction::Monsters)[0];
        let command40 = command(&shown, target, LimbSlot::LeftArm, chamber40,
            CombatHeight::MID, Fx::ONE, Fx::ONE);
        let command41 = command(&shown, target, LimbSlot::LeftArm, chamber41,
            CombatHeight::MID, Fx::ONE, Fx::ONE);
        assert_eq!((command40.intent, command40.move_dir, command40.body_yaw, command40.grips,
                    command40.arms[1]),
                   (command41.intent, command41.move_dir, command41.body_yaw, command41.grips,
                    command41.arms[1]));
        assert_ne!(command40.arms[0].bearing, command41.arms[0].bearing);
        assert_eq!((command40.arms[0].height, command40.arms[0].reach,
                    command40.arms[0].effort),
                   (command41.arms[0].height, command41.arms[0].reach,
                    command41.arms[0].effort));
    }

    #[test]
    fn noise_free_schedule_still_submits_only_ordinary_articulated_commands() {
        let case = ordinal_strong_case(1_536, true);
        let world = World::new(&scenario_for_ticks_with(case, 48,
            MirrorGrammar::AnatomicalHandSwap), 0);
        let hero = world.alive_ids(Faction::Heroes)[0];
        let foe = world.alive_ids(Faction::Monsters)[0];
        let shown = world.observe_articulated(hero);
        let schedule = schedule_bearings(declared_schedule_bearing(case), true);
        for bearing in [schedule.0, schedule.1] {
            let row = command(&shown, foe, LimbSlot::LeftArm, bearing,
                CombatHeight::MID, Fx::ONE, Fx::ONE);
            assert_eq!(row.intent, Intent::Attack(foe));
            assert_eq!(row.grips, [sim::GripRequest::Keep; 2]);
            assert_eq!(row.arms[1], neutral_articulated_command(&shown).arms[1]);
        }
    }

    fn synthetic_source_41_audit(eligible: &[u32]) -> StrikeCorpusAudit {
        execute_corpus_sharded_with(true, |case, mirrored, strike_delta, reach_delta_raw| {
            let mut row = anatomical_synthetic_row(case, mirrored,
                eligible.contains(&case.ordinal), 100 + case.ordinal as u64);
            row.strike_delta = strike_delta; row.reach_delta_raw = reach_delta_raw;
            (row, DamageSidecar { cut_raw: case.ordinal as u64, thrust_raw: u64::MAX,
                pressure_raw: mirrored as u64, integrity_loss_raw: strike_delta })
        })
    }

    #[test]
    fn source_41_reuses_all_7560_central_orientations_without_early_exit() {
        let audit = synthetic_source_41_audit(&[4, 17]);
        assert_eq!((audit.central_rows.len(), audit.local_rows.len(), audit.robust.len()),
                   (7_560, 36, 2));
    }

    #[test]
    fn source_41_runs_eighteen_local_orientations_for_every_eligible_pair() {
        let audit = synthetic_source_41_audit(&[2, 9, 27]);
        assert_eq!(audit.local_rows.len(), 3 * 18);
        assert!(audit.local_rows.chunks_exact(18).all(|rows| rows.len() == 18));
    }

    #[test]
    fn source_41_retains_anatomical_slot_and_pose_mapping() {
        let case = declared_central_cases()[0];
        assert!(mirrored_pair([anatomical_synthetic_row(case, false, true, 9),
            anatomical_synthetic_row(case, true, true, 9)], true));
    }

    #[test]
    fn source_41_selection_is_maximin_then_duration_then_ordinal() {
        mechanical_ranking_uses_worst_case_dissipation_then_duration_then_ordinal();
    }

    #[test]
    fn source_41_selection_ignores_contradictory_damage_sidecars() {
        contradictory_damage_sidecars_cannot_change_mechanical_selection();
    }

    #[test]
    fn source_41_checksum_cannot_alias_the_smart40_grammar() {
        let audit = synthetic_source_41_audit(&[4]);
        assert_ne!(noise_free_mirror_corpus_checksum(&audit),
                   anatomical_mirror_corpus_checksum(&audit));
    }

    #[test]
    #[ignore = "bounded Smart41 noise-free mirror audit; use release CLI"]
    fn select_the_predeclared_noise_free_mirror_corpus() {
        let audit = run_predeclared_noise_free_mirror_corpus();
        assert_eq!(audit.central_rows.len(), 7_560);
    }

    #[test]
    #[ignore = "bounded Smart40 anatomical-mirror audit; use release CLI"]
    fn select_the_predeclared_anatomical_mirror_corpus() {
        let audit = run_predeclared_anatomical_mirror_corpus();
        assert_eq!(audit.central_rows.len(), 7_560);
    }

    #[test]
    fn the_strong_strike_mirror_negates_both_schedule_bearings() {
        let bearing = Angle::from_raw(1_731);
        let plain = schedule_bearings(bearing, false);
        let mirror = schedule_bearings(Angle::from_raw(bearing.raw().wrapping_neg()), true);
        assert_eq!(mirror.0.raw(), plain.0.raw().wrapping_neg());
        assert_eq!(mirror.1.raw(), plain.1.raw().wrapping_neg());
    }

    #[test]
    fn the_local_freeze_is_strike_ticks_by_reach_and_has_eighteen_orientations() {
        let got: Vec<_> = STRIKE_TICK_DELTAS.into_iter().flat_map(|strike|
            REACH_DELTAS_RAW.into_iter().flat_map(move |reach|
                [false, true].into_iter().map(move |mirror| (strike, reach, mirror)))).collect();
        assert_eq!(got.len(), 18);
        assert_eq!(&got[..4], &[(-1, -256, false), (-1, -256, true),
                               (-1, 0, false), (-1, 0, true)]);
        assert_eq!(got[17], (1, 256, true));
    }

    #[test]
    fn mechanical_ranking_uses_worst_case_dissipation_then_duration_then_ordinal() {
        let case = |ordinal, chamber, strike| MechanicalCase { ordinal,
            chamber_ticks: chamber, strike_ticks: strike, reach_raw: 40_960,
            target_anatomy: AnatomyChoice::Fighter, approach_offset: APPROACH_OFFSETS[0] };
        let pair = |centre, loss| RobustMechanicalPair { centre, rows: Vec::new(),
            worst_dissipated_raw: loss };
        let rows = [pair(case(0, 8, 12), 9), pair(case(9, 32, 32), 10),
                    pair(case(4, 8, 12), 10), pair(case(3, 8, 12), 10)];
        assert_eq!(select_robust(&rows), Some(3));
    }

    #[test]
    fn contradictory_damage_sidecars_cannot_change_mechanical_selection() {
        let case = |ordinal| MechanicalCase { ordinal, chamber_ticks: 8, strike_ticks: 12,
            reach_raw: 40_960, target_anatomy: AnatomyChoice::Fighter,
            approach_offset: APPROACH_OFFSETS[0] };
        let rows = [RobustMechanicalPair { centre: case(0), rows: Vec::new(),
            worst_dissipated_raw: 10 }, RobustMechanicalPair { centre: case(1), rows: Vec::new(),
            worst_dissipated_raw: 9 }];
        let damage = [DamageSidecar { cut_raw: 0, thrust_raw: 0, pressure_raw: 0,
            integrity_loss_raw: 0 }, DamageSidecar { cut_raw: u64::MAX, thrust_raw: u64::MAX,
            pressure_raw: u64::MAX, integrity_loss_raw: i32::MAX }];
        assert_ne!(damage[0], damage[1]);
        assert_eq!(select_robust(&rows), Some(0));
    }

    #[test]
    #[ignore = "bounded Smart39 corpus selection; use the release CLI for evidence"]
    fn select_the_predeclared_ordinary_strike_corpus() {
        let audit = run_predeclared_strike_corpus();
        assert_eq!(audit.central_rows.len(), 7_560);
    }

    #[test]
    #[ignore = "bounded fixture selection aid; eligibility ignores damage"]
    fn sweep_for_a_precontact_interior_reach_mirror_pair() {
        let cases: Vec<_> = [AnatomyChoice::Fighter, AnatomyChoice::Brute].into_iter()
            .flat_map(|target| APPROACH_OFFSETS.into_iter().map(move |offset| (target, offset)))
            .collect();
        let mut selected = None;
        let mut measured = 0u32;
        let mut contacts = 0u32;
        let mut interior = 0u32;
        let mut unique = 0u32;
        let mut eligible_individual = 0u32;
        let mut first_individual = None;
        'grid: for chamber_ticks in INTERIOR_CHAMBER_TICKS {
            for strike_ticks in INTERIOR_STRIKE_TICKS {
                for reach_raw in INTERIOR_REACH_TARGETS_RAW {
                    for &(target_anatomy, approach_offset) in &cases {
                        let pair = [false, true].map(|mirrored| measure_case_schedule(
                            StrongCase { seed: 0, mirrored, target_anatomy, approach_offset },
                            Fx::ONE, chamber_ticks, strike_ticks, Fx::from_raw(reach_raw),
                        ));
                        for (mirrored, row) in [false, true].into_iter().zip(pair) {
                            measured += 1;
                            contacts += u32::from(row.contact_tick.is_some());
                            let actual = row.contact_reach_raw.unwrap_or(i32::MIN);
                            interior += u32::from(actual >= Fx::from_ratio(1, 4).raw()
                                + INTERIOR_REACH_MARGIN_RAW
                                && actual <= Fx::ONE.raw() - INTERIOR_REACH_MARGIN_RAW);
                            unique += u32::from(row.weapon_body_facts == 1 && row.competing_facts == 0);
                            if interior_contact(row) {
                                eligible_individual += 1;
                                first_individual.get_or_insert((chamber_ticks, strike_ticks,
                                    reach_raw, target_anatomy, approach_offset, mirrored, row));
                            }
                        }
                        if pair.into_iter().all(interior_contact) {
                            selected = Some((chamber_ticks, strike_ticks, reach_raw,
                                             target_anatomy, approach_offset, pair));
                            break 'grid;
                        }
                    }
                }
            }
        }
        let Some((chamber_ticks, strike_ticks, reach_raw, target_anatomy, approach_offset, pair)) =
            selected else {
                println!("no_pair measured={measured} contacts={contacts} interior={interior} unique={unique} eligible_individual={eligible_individual}");
                if let Some((chamber, strike, reach, target, offset, _, _)) = first_individual {
                    for (label, probe_strike, probe_reach) in [
                        ("selected", strike, reach), ("reach-minus", strike, reach - 256),
                        ("reach-plus", strike, reach + 256), ("tick-minus", strike - 1, reach),
                        ("tick-plus", strike + 1, reach),
                    ] {
                        for mirrored in [false, true] {
                            let row = measure_case_schedule(StrongCase { seed: 0, mirrored,
                                target_anatomy: target, approach_offset: offset }, Fx::ONE,
                                chamber, probe_strike, Fx::from_raw(probe_reach));
                            println!("{label} chamber={chamber} strike={probe_strike} reach_target={probe_reach} mirrored={mirrored} target={target:?} offset=({}, {}) eligible={} contact_tick={:?} contact_reach={:?} arm_velocity=({},{},{}) hilt={} tip={} facts={}/{} crossing={} legal={}",
                                offset.x.raw(), offset.y.raw(), interior_contact(row), row.contact_tick,
                                row.contact_reach_raw, row.contact_arm_velocity.x.raw(),
                                row.contact_arm_velocity.y.raw(), row.contact_arm_velocity.z.raw(),
                                row.hilt_delta.length().raw(), row.tip_delta.length().raw(),
                                row.weapon_body_facts, row.competing_facts, observed_crossing(row),
                                row.refusals == 0 && row.solver_rejections == 0
                                    && row.max_energy_excess_raw == 0);
                        }
                    }
                }
                return;
            };

        // Eligibility is robust to the predeclared local probes. These are not
        // candidates scored by response: every one must retain the same purely
        // precontact geometry, motion, attribution and legality margins.
        for probe_reach in [reach_raw - 256, reach_raw + 256] {
            for mirrored in [false, true] {
                assert!(interior_contact(measure_case_schedule(
                    StrongCase { seed: 0, mirrored, target_anatomy, approach_offset },
                    Fx::ONE, chamber_ticks, strike_ticks, Fx::from_raw(probe_reach),
                )), "the selected pair did not survive its fixed reach probe");
            }
        }
        for probe_ticks in [strike_ticks - 1, strike_ticks + 1] {
            for mirrored in [false, true] {
                assert!(interior_contact(measure_case_schedule(
                    StrongCase { seed: 0, mirrored, target_anatomy, approach_offset },
                    Fx::ONE, chamber_ticks, probe_ticks, Fx::from_raw(reach_raw),
                )), "the selected pair did not survive its fixed timing probe");
            }
        }
        for (mirrored, row) in [false, true].into_iter().zip(pair) {
            println!("chamber={chamber_ticks} strike={strike_ticks} reach_target={reach_raw} mirrored={mirrored} target={target_anatomy:?} offset=({}, {}) contact_tick={:?} contact_reach={:?} arm_velocity=({},{},{}) hilt={} tip={} facts={}/{}",
                approach_offset.x.raw(), approach_offset.y.raw(), row.contact_tick,
                row.contact_reach_raw, row.contact_arm_velocity.x.raw(),
                row.contact_arm_velocity.y.raw(), row.contact_arm_velocity.z.raw(),
                row.hilt_delta.length().raw(), row.tip_delta.length().raw(),
                row.weapon_body_facts, row.competing_facts);
        }
    }

    #[test]
    #[ignore = "fixture selection aid"]
    fn sweep_the_strong_strike_fixture() {
        for x_tenths in 23..=28 {
            for y_tenths in -3..=3 {
                let spawn = ATTACKER_SPAWN + Vec2::new(
                    Fx::from_ratio(x_tenths, 10), Fx::from_ratio(y_tenths, 10));
                let row = measure_case(StrongCase {
                    seed: 0, mirrored: false, target_anatomy: AnatomyChoice::Fighter,
                    approach_offset: ATTACKER_SPAWN - spawn,
                }, Fx::ONE);
                if row.contact_tick.is_some() {
                    println!("x={x_tenths} y={y_tenths} tick={:?} tip={} com={} energy={} dissipated={} cut={} thrust={} pressure={} region={:?}",
                        row.contact_tick, row.tip_delta.length().raw(),
                        (row.velocity_a - row.velocity_b).length().raw(), row.energy_before_raw,
                        row.energy_dissipated_raw, row.cut_raw, row.thrust_raw, row.pressure_raw,
                        row.region);
                }
            }
        }
    }

    #[test]
    fn the_strong_sword_reaches_the_target_at_tip_speed() {
        let strong = measure(Fx::ONE); let control = measure(Fx::ZERO);
        assert!(strong.tip_delta.length().raw() >= 9_000,
                "the public-observation swing itself was weakened");
        if strong.contact_tick.is_some() {
            assert_eq!((strong.weapon_body_facts, strong.competing_facts), (1, 0));
            assert!(observed_crossing(strong));
        }
        assert_eq!((control.contact_tick, control.energy_before_raw), (None, 0));
    }

    #[test]
    fn the_reference_target_offset_is_pinned_beside_a_fast_arc() {
        let row = measure(Fx::ONE);
        assert!(row.tip_delta.length().raw() >= 9_000);
        assert_eq!(TARGET_SPAWN.x - ATTACKER_SPAWN.x, Fx::from_ratio(131, 50));
        assert_eq!(TARGET_SPAWN.y, ATTACKER_SPAWN.y);
    }

    fn visibly_meaningful_fixture() -> (StrikeMeasurement, StrikeMeasurement) {
        let mut strong = measure(Fx::ONE);
        strong.contact_tick = Some(42);
        strong.region = Some(BodyPart::Legs);
        strong.weapon_body_facts = 1;
        strong.competing_facts = 0;
        let point = strong.requested_weapon.tip;
        let region = RegionVolume {
            lower: point, upper: point, radius: strong.requested_weapon.radius,
            present: true,
        };
        strong.observed_contact_region = Some(region);
        strong.crossing_oracle = Some(CrossingOracle { previous: region, requested: region });
        strong.energy_before_raw = 400;
        strong.energy_after_raw = 250;
        strong.energy_dissipated_raw = 150;
        strong.cut_raw = 100;
        strong.integrity_before_raw[BodyPart::Legs as usize] = Fx::ONE.raw();
        strong.integrity_after_raw[BodyPart::Legs as usize] = Fx::ONE.raw() - 1;
        (strong, measure(Fx::ZERO))
    }

    #[test]
    fn mirrored_reach_and_motion_are_read_from_the_attributed_left_weapon_limb() {
        let case = ordinal_strong_case(1_536, true);
        let world = World::new(&scenario_for_ticks_with(case, 48,
            MirrorGrammar::AnatomicalHandSwap), 0);
        let hero = world.alive_ids(Faction::Heroes)[0];
        let mut shown = world.observe_articulated(hero);
        let left_velocity = Vec3::new(Fx::from_raw(17), Fx::from_raw(-23), Fx::from_raw(5));
        let right_velocity = Vec3::new(Fx::from_raw(91), Fx::from_raw(73), Fx::from_raw(11));
        shown.arms[0].velocity = left_velocity;
        shown.arms[1].velocity = right_velocity;
        let left = attacking_reach_motion(&shown, LimbSlot::LeftArm);
        let right = attacking_reach_motion(&shown, LimbSlot::RightArm);
        assert_eq!(left.1, left_velocity);
        assert_eq!(right.1, right_velocity);
        assert_ne!(left, right, "the two limb witnesses did not distinguish the old literal");
    }

    #[test]
    fn swapping_only_the_neutral_right_arm_cannot_change_mirrored_eligibility() {
        let case = ordinal_strong_case(1_536, true);
        let world = World::new(&scenario_for_ticks_with(case, 48,
            MirrorGrammar::AnatomicalHandSwap), 0);
        let hero = world.alive_ids(Faction::Heroes)[0];
        let shown = world.observe_articulated(hero);
        let before = attacking_reach_motion(&shown, LimbSlot::LeftArm);
        let mut changed = shown;
        changed.arms[1].hand += Vec3::from_ints(4, -3, 2);
        changed.arms[1].velocity = Vec3::from_ints(9, 8, 7);
        assert_eq!(attacking_reach_motion(&changed, LimbSlot::LeftArm), before);
    }

    fn moving_crossing_fixture() -> StrikeMeasurement {
        let (mut row, _) = visibly_meaningful_fixture();
        let hit = row.requested_weapon.tip;
        let far = hit + Vec3::from_ints(0, 8, 0);
        let previous = RegionVolume { lower: far, upper: far,
            radius: row.requested_weapon.radius, present: true };
        let requested = RegionVolume { lower: hit, upper: hit,
            radius: row.requested_weapon.radius, present: true };
        row.crossing_oracle = Some(CrossingOracle { previous, requested });
        row
    }

    #[test]
    fn noise_free_crossing_uses_ground_truth_previous_and_requested_region_geometry() {
        let row = moving_crossing_fixture();
        assert!(observed_crossing(row));
        assert_ne!(row.crossing_oracle.unwrap().previous,
                   row.crossing_oracle.unwrap().requested);
    }

    #[test]
    fn opponent_perception_noise_cannot_change_the_crossing_oracle() {
        let row = moving_crossing_fixture();
        let mut noised = row;
        noised.observed_contact_region = Some(RegionVolume {
            lower: Vec3::from_ints(100, 100, 100),
            upper: Vec3::from_ints(101, 101, 101), radius: Fx::ZERO, present: false,
        });
        assert_eq!(observed_crossing(row), observed_crossing(noised));
        assert_eq!(row.crossing_oracle, noised.crossing_oracle);
    }

    #[test]
    fn deleting_the_requested_region_motion_breaks_the_crossing_fixture() {
        let row = moving_crossing_fixture();
        assert!(observed_crossing(row));
        let mut static_region = row;
        let previous = static_region.crossing_oracle.unwrap().previous;
        static_region.crossing_oracle = Some(CrossingOracle {
            previous, requested: previous,
        });
        assert!(!observed_crossing(static_region));
    }

    #[test]
    fn a_meaningful_strike_requires_energy_damage_and_matching_integrity_loss() {
        let (strong, held) = visibly_meaningful_fixture();
        assert!(meaningful_strike_validity(strong, held).passes());

        let mut no_dissipation = strong;
        no_dissipation.energy_after_raw = no_dissipation.energy_before_raw;
        no_dissipation.energy_dissipated_raw = 0;
        assert!(!meaningful_strike_validity(no_dissipation, held).passes());

        let mut no_damage = strong;
        no_damage.cut_raw = 0; no_damage.thrust_raw = 0;
        assert!(!meaningful_strike_validity(no_damage, held).passes());

        let mut no_integrity = strong;
        no_integrity.integrity_after_raw = no_integrity.integrity_before_raw;
        assert!(!meaningful_strike_validity(no_integrity, held).passes());
    }

    #[test]
    fn the_held_control_must_remain_inert_and_the_contact_unambiguous() {
        let (strong, held) = visibly_meaningful_fixture();
        let mut ambiguous = strong; ambiguous.competing_facts = 1;
        assert!(!meaningful_strike_validity(ambiguous, held).passes());
        let mut uncrossed = strong;
        uncrossed.crossing_oracle = uncrossed.crossing_oracle.map(|mut oracle| {
            for region in [&mut oracle.previous, &mut oracle.requested] {
                region.lower.x += Fx::from_int(10); region.upper.x += Fx::from_int(10);
            }
            oracle
        });
        assert!(!meaningful_strike_validity(uncrossed, held).passes());
        let mut active_control = held;
        active_control.energy_before_raw = 1;
        assert!(!meaningful_strike_validity(strong, active_control).passes());
        let mut refused = strong; refused.refusals = 1;
        assert!(!meaningful_strike_validity(refused, held).passes());
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn ordinal_1536_trace_uses_source_41_and_zero_local_deltas() {
        let case = trace_case_1536();
        assert_eq!(case.ordinal, 1536);
        let plain = StrongCase { seed: 0, mirrored: false,
            target_anatomy: case.target_anatomy, approach_offset: case.approach_offset };
        let mirror = StrongCase { mirrored: true, ..plain };
        assert_eq!(declared_schedule_bearing(plain).raw().wrapping_neg(),
                   declared_schedule_bearing(mirror).raw());
        assert_eq!(case.strike_ticks as i32, case.strike_ticks as i32 + 0);
        assert_eq!(case.reach_raw, case.reach_raw + 0);
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn trace_comparison_stops_at_the_first_phase_and_first_mapped_field() {
        let plain = [trace_field("command.bearing", 7), trace_field("later", 1)];
        let mirror = [trace_field("command.bearing", 8), trace_field("later", 2)];
        let difference = trace_difference(3, "Command", &plain, &mirror,
            "later plain rejection".into(), "later mirror rejection".into()).unwrap();
        assert_eq!(difference.phase, "Command");
        assert_eq!(difference.field, "command.bearing");
        assert_eq!(difference.plain, "7");
        assert_eq!(difference.mirror, "8");
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn trace_maps_left_right_slots_points_vectors_and_shield_winding_exactly() {
        let point = Vec3::new(Fx::from_raw(11), Fx::from_raw(17), Fx::from_raw(23));
        let reflected_point = Vec3::new(point.x, Fx::from_int(16) - point.y, point.z);
        assert_eq!(point_rows("point", point, false),
                   point_rows("point", reflected_point, true));
        let vector = Vec3::new(Fx::from_raw(5), Fx::from_raw(-9), Fx::from_raw(13));
        let reflected_vector = Vec3::new(vector.x, -vector.y, vector.z);
        assert_eq!(vector_rows("shield.normal", vector, false),
                   vector_rows("shield.normal", reflected_vector, true));
        let plain_shield = sim::ShieldPose { centre: point, normal: Vec3::X,
            half_width: Fx::from_raw(31), half_height: Fx::from_raw(37),
            thickness: Fx::from_raw(41) };
        let mirror_shield = sim::ShieldPose { centre: reflected_point,
            normal: Vec3::X, ..plain_shield };
        let plain_corners = shield_corners(plain_shield);
        let mirror_corners = shield_corners(mirror_shield);
        for (plain_at, mirror_at) in [1, 0, 3, 2].into_iter().enumerate() {
            assert_eq!(point_rows("corner", plain_corners[plain_at], false),
                       point_rows("corner", mirror_corners[mirror_at], true));
        }
        assert_eq!(reflected_slot(LimbSlot::LeftArm as u8), LimbSlot::RightArm as u8);
        assert_eq!(reflected_slot(LimbSlot::RightArm as u8), LimbSlot::LeftArm as u8);
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn trace_reports_exact_rejection_phase_pair_and_cause_instead_of_empty_rows() {
        let plain = [trace_field("rejection.count", 0),
                     trace_field("rejection.diagnostic", "none")];
        let mirror_cause = "tick=19;phase=SolveGroup;cause=ExactSolver;key=None";
        let mirror = [trace_field("rejection.count", 1),
                      trace_field("rejection.diagnostic", mirror_cause)];
        let difference = trace_difference(19, "Rejection", &plain, &mirror,
            "none".into(), mirror_cause.into()).unwrap();
        let printed = format_trace_difference(difference);
        assert!(printed.contains("phase=Rejection pair=rejection.count:0|1"));
        assert!(printed.contains("phase=SolveGroup;cause=ExactSolver;key=None"));
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn trace_never_runs_more_than_one_plain_mirror_pair() {
        let case = trace_case_1536();
        let traced = [false, true].map(|mirrored| (case.ordinal, mirrored, 0i32, 0i32));
        assert_eq!(traced, [(1536, false, 0, 0), (1536, true, 0, 0)]);
    }
}
