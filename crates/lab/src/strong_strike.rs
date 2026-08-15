//! One controlled production-mechanics blow, with its held-sword control.
//!
//! This is Lab instrumentation, not a privileged combat path. Commands enter
//! through the public articulated seam, ticks use `World::step`, and every
//! reported fact comes back through published poses, resolutions, or anatomy.

use fx::{swept_segment_segment, Angle, Fx, Vec2, Vec3};
#[cfg(feature = "cartesian-recoil")]
use fx::Hash64;
use policy::{neutral_articulated_command, robust_strike_schedule_command};
use sim::{AnatomyChoice, ArmTarget, ArticulatedCommandV1, BodyPart, CombatHeight,
          ContactKind, DuelConfigV1, EntityId, EquipmentGeometry, Faction, Intent, Scenario,
          LimbSlot, RegionVolume, SegmentPose, SubmitArticulatedOutcome, World, BODY_SLOT};
#[cfg(feature = "cartesian-recoil")]
use sim::{ExactContactGroupDiagnostic, ExactContactKeyDiagnostic};
#[cfg(feature = "cartesian-recoil")]
use sim::ExactWideToiDiagnostic;
#[cfg(feature = "cartesian-recoil")]
use sim::ExactCompatibilitySweepDiagnostic;

#[cfg(feature = "cartesian-recoil")]
pub(crate) fn source_41_policy_command_receipt(strike_delta: i32, reach_delta: i32,
                                                mirrored: bool) -> u64 {
    let case = StrongCase { seed: 0, mirrored, target_anatomy: AnatomyChoice::Brute,
                            approach_offset: Vec2::new(Fx::from_raw(-163_840), Fx::from_raw(-65_536)) };
    let ticks = (56i32 + strike_delta) as u32;
    let scenario = scenario_for_ticks_with(case, ticks, MirrorGrammar::AnatomicalHandSwap);
    let mut world = World::new(&scenario, 0);
    let attacker = world.alive_ids(Faction::Heroes)[0];
    let defender = world.alive_ids(Faction::Monsters)[0];
    let limb = attacking_limb(case, MirrorGrammar::AnatomicalHandSwap);
    let shown = world.observe_articulated(attacker);
    let foe = shown.opponents().first().expect("source-41 target");
    let region = foe.regions[BodyPart::Legs as usize];
    let local_height = (region.lower.z + region.upper.z) / Fx::from_int(2) - foe.body_position.z;
    let height = CombatHeight::try_from_raw(
        (local_height / shown.standing_height).clamp(Fx::ZERO, Fx::ONE).raw())
        .expect("source-41 height");
    let mut records = Vec::new();
    for tick in 0..ticks {
        for id in world.pending_decisions().to_vec() {
            let obs = world.observe_articulated(id);
            let command = if id == attacker {
                robust_strike_schedule_command(&obs, defender, limb,
                    case.approach_offset, height, tick, CHAMBER_TICKS,
                    Fx::from_raw(61_440 + reach_delta), mirrored)
            } else { neutral_articulated_command(&obs) };
            match world.submit_articulated_v1(id, command) {
                SubmitArticulatedOutcome::Stored { command, rejection: None } => {
                    records.push((tick, id, command));
                }
                _ => panic!("source-41 policy command was not stored"),
            }
        }
        world.step();
        if world.contact_resolutions().iter().any(|row|
            attributed_sword_body(row, attacker, defender, limb)) { break; }
    }
    source_41_receipt(scenario.fingerprint(), &records)
}

#[cfg(feature = "cartesian-recoil")]
fn source_41_receipt(fingerprint: u64,
                     records: &[(u32, EntityId, ArticulatedCommandV1)]) -> u64 {
    let mut hash = Hash64::new();
    hash.write_bytes(b"ARPG-LIFTED-COMMANDS-V1"); hash.write_u16(1);
    hash.write_u64(fingerprint); hash.write_u32(records.len() as u32);
    for &(tick, id, command) in records {
        hash.write_u32(tick); hash.write_u32(id.index); hash.write_u32(id.generation);
        hash.write_u16(sim::SUBMITTED_COMMAND_LAYOUT_VERSION); hash.write_u8(1); hash.write_u8(0);
        hash.write_u16(sim::ARTICULATED_PAYLOAD_BYTES as u16);
        hash.write_bytes(&command.payload_bytes());
    }
    hash.finish()
}

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
            && held.pressure_raw == 0
            && held.integrity_before_raw == held.integrity_after_raw
            && held.wound_before_raw == held.wound_after_raw
            && held.blood_before_raw == held.blood_after_raw,
        legal_runs: strong.refusals == 0 && strong.solver_rejections == 0
            && strong.cap_hits == 0 && strong.max_energy_excess_raw == 0
            && held.refusals == 0 && held.solver_rejections == 0
            && held.cap_hits == 0 && held.max_energy_excess_raw == 0,
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

fn scheduled_attacker_command(
    obs: &sim::ArticulatedObservation, defender: EntityId, limb: LimbSlot,
    case: StrongCase, height: CombatHeight, schedule_tick: u32, chamber_ticks: u32,
    strike_reach: Fx, strike_effort: Fx, chamber: Angle, follow: Angle,
    bearing_source: ScheduleBearingSource,
) -> ArticulatedCommandV1 {
    if bearing_source == ScheduleBearingSource::DeclaredSpawnOffset {
        robust_strike_schedule_command(obs, defender, limb, case.approach_offset,
            height, schedule_tick, chamber_ticks, strike_reach, case.mirrored)
    } else if schedule_tick < chamber_ticks {
        command(obs, defender, limb, chamber, height, Fx::ONE, Fx::ONE)
    } else {
        command(obs, defender, limb, follow, height, strike_reach, strike_effort)
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

#[cfg(feature = "cartesian-recoil")]
pub(crate) fn measure_noise_free_case_schedule(
    case: StrongCase, strike_ticks: u32, strike_reach: Fx,
) -> StrikeMeasurement {
    measure_case_schedule_with(case, Fx::ONE, CHAMBER_TICKS, strike_ticks, strike_reach,
        MirrorGrammar::AnatomicalHandSwap, ScheduleBearingSource::DeclaredSpawnOffset)
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

    for schedule_tick in 0..chamber_ticks {
        for id in world.pending_decisions().to_vec() {
            let obs = world.observe_articulated(id);
            let submitted = if id == attacker {
                scheduled_attacker_command(&obs, defender, limb, case, height, schedule_tick,
                    chamber_ticks, strike_reach, strike_effort, chamber, follow, bearing_source)
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

    'strike: for strike_tick in 0..strike_ticks {
        let attacker_before = world.observe_articulated(attacker);
        let defender_before = world.articulated_pose(defender).expect("live defender pose");
        for id in world.pending_decisions().to_vec() {
            let obs = world.observe_articulated(id);
            let submitted = if id == attacker {
                scheduled_attacker_command(&obs, defender, limb, case, height,
                    chamber_ticks + strike_tick, chamber_ticks, strike_reach, strike_effort,
                    chamber, follow, bearing_source)
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
            break 'strike;
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

#[cfg(feature = "cartesian-recoil")]
const ORDINAL_31_FINGERPRINT: u64 = 3_796_840_901_852_190_123;
#[cfg(feature = "cartesian-recoil")]
const ORDINAL_31_FIRST_SUBMITTED_EFFORT_TICK: u32 = 36;
#[cfg(feature = "cartesian-recoil")]
pub(crate) const ORDINAL_31_WORKER_NAME: &str = "smart130-ordinal31-provenance";
#[cfg(feature = "cartesian-recoil")]
pub(crate) const ORDINAL_31_STACK_BYTES: usize = 16 * 1024 * 1024;

#[cfg(feature = "cartesian-recoil")]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum ProvenanceArm { ReferenceBefore, Held, ReferenceAfter }

#[cfg(feature = "cartesian-recoil")]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum ProvenanceBoundary {
    SolverDelta { tick: u32 },
    TerminalBeforeSolverDelta { arm: ProvenanceArm, tick: u32 },
}

#[cfg(feature = "cartesian-recoil")]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum ProvenanceMutation {
    None,
    #[cfg(test)] SuppressOneSolverRejection,
    #[cfg(test)] RemoveReplaySubmission,
    #[cfg(test)] ReorderReplaySubmission,
    #[cfg(test)] PassEarlierTerminal,
    #[cfg(test)] CorruptTickLocalGroup,
}

#[cfg(feature = "cartesian-recoil")]
#[derive(Clone, PartialEq, Eq, Debug)]
struct ProvenanceCommand {
    entity: EntityId,
    requested: ArticulatedCommandV1,
    stored: ArticulatedCommandV1,
}

#[cfg(feature = "cartesian-recoil")]
#[derive(Clone, Debug)]
struct ProvenanceSnapshot {
    digest: sim::StateDigest,
    solver_rejections: u32,
    cap_hits: u32,
    resolutions: Vec<sim::ContactResolution>,
    first_rejection: Option<sim::ResolutionError>,
    first_exact_rejection: Option<sim::ExactContactRejectionDiagnostic>,
    scan_pair_rejection: Option<sim::ExactScanPairRejectionDiagnostic>,
    groups: Vec<sim::ExactContactGroupDiagnostic>,
    external_energy: Vec<sim::ExactExternalEnergyRow>,
    attacker_observation: sim::ArticulatedObservation,
    defender_observation: sim::ArticulatedObservation,
    attacker_pose: sim::ArticulatedPose,
    defender_pose: sim::ArticulatedPose,
}

#[cfg(feature = "cartesian-recoil")]
impl ProvenanceSnapshot {
    fn equals(&self, other: &Self) -> bool {
        self.digest.compare(other.digest) == Ok(true)
            && self.solver_rejections == other.solver_rejections
            && self.cap_hits == other.cap_hits
            && self.resolutions == other.resolutions
            && self.first_rejection == other.first_rejection
            && self.first_exact_rejection == other.first_exact_rejection
            && self.scan_pair_rejection == other.scan_pair_rejection
            && self.groups == other.groups
            && self.external_energy == other.external_energy
            && self.attacker_observation == other.attacker_observation
            && self.defender_observation == other.defender_observation
            && self.attacker_pose == other.attacker_pose
            && self.defender_pose == other.defender_pose
    }
}

#[cfg(feature = "cartesian-recoil")]
#[derive(Clone, Debug)]
struct ProvenanceTick {
    tick_before: u32, tick_after: u32,
    pending: Vec<EntityId>, commands: Vec<ProvenanceCommand>,
    state_before: sim::StateDigest, state_after: sim::StateDigest,
    contact: bool, terminal: bool,
    solver_before: u32, solver_after: u32, solver_delta: u32,
    cap_before: u32, cap_after: u32,
    resolutions: Vec<sim::ContactResolution>,
    first_rejection: Option<sim::ResolutionError>,
    first_exact_rejection: Option<sim::ExactContactRejectionDiagnostic>,
    scan_pair_rejection: Option<sim::ExactScanPairRejectionDiagnostic>,
    groups: Vec<sim::ExactContactGroupDiagnostic>,
    external_energy: Vec<sim::ExactExternalEnergyRow>,
    tick_energy_excess_raw: u64, cumulative_energy_excess_raw: u64,
    attacker_observation: sim::ArticulatedObservation,
    defender_observation: sim::ArticulatedObservation,
    attacker_pose: sim::ArticulatedPose,
    defender_pose: sim::ArticulatedPose,
}

#[cfg(feature = "cartesian-recoil")]
impl ProvenanceTick {
    fn equals(&self, other: &Self) -> bool {
        self.tick_before == other.tick_before && self.tick_after == other.tick_after
            && self.pending == other.pending && self.commands == other.commands
            && self.state_before.compare(other.state_before) == Ok(true)
            && self.state_after.compare(other.state_after) == Ok(true)
            && self.contact == other.contact && self.terminal == other.terminal
            && self.solver_before == other.solver_before
            && self.solver_after == other.solver_after && self.solver_delta == other.solver_delta
            && self.cap_before == other.cap_before && self.cap_after == other.cap_after
            && self.resolutions == other.resolutions && self.first_rejection == other.first_rejection
            && self.first_exact_rejection == other.first_exact_rejection
            && self.scan_pair_rejection == other.scan_pair_rejection
            && self.groups == other.groups && self.external_energy == other.external_energy
            && self.tick_energy_excess_raw == other.tick_energy_excess_raw
            && self.cumulative_energy_excess_raw == other.cumulative_energy_excess_raw
            && self.attacker_observation == other.attacker_observation
            && self.defender_observation == other.defender_observation
            && self.attacker_pose == other.attacker_pose
            && self.defender_pose == other.defender_pose
    }
}

#[cfg(feature = "cartesian-recoil")]
#[derive(Clone, Debug)]
struct ProvenanceRun {
    arm: ProvenanceArm, rows: Vec<ProvenanceTick>, solver_rejections: u32,
    contact_tick: Option<u32>, terminal_tick: u32, refusals: u32, cap_hits: u32,
    max_energy_excess_raw: u64,
}

#[cfg(feature = "cartesian-recoil")]
#[derive(Clone, Debug)]
struct Ordinal31Provenance {
    case: StrongCase, fingerprint: u64,
    reference_before: ProvenanceRun, held: ProvenanceRun, reference_after: ProvenanceRun,
    first_command_difference: u32, first_state_difference: Option<u32>,
    boundary: ProvenanceBoundary,
}

#[cfg(feature = "cartesian-recoil")]
fn ordinal_31_case() -> StrongCase {
    StrongCase { seed: 0, mirrored: true, target_anatomy: AnatomyChoice::Brute,
        approach_offset: Vec2::new(Fx::from_raw(-163_840), Fx::ZERO) }
}

#[cfg(feature = "cartesian-recoil")]
fn provenance_snapshot(world: &World, attacker: EntityId, defender: EntityId)
    -> ProvenanceSnapshot
{
    ProvenanceSnapshot {
        digest: world.state_digest(), solver_rejections: world.contact_solver_rejections(),
        cap_hits: world.contact_cap_hits(), resolutions: world.contact_resolutions().to_vec(),
        first_rejection: world.first_contact_rejection(),
        first_exact_rejection: world.first_exact_contact_rejection(),
        scan_pair_rejection: world.exact_scan_pair_rejection(),
        groups: world.exact_contact_group_diagnostics().to_vec(),
        external_energy: world.exact_external_energy().to_vec(),
        attacker_observation: world.observe_articulated(attacker),
        defender_observation: world.observe_articulated(defender),
        attacker_pose: world.articulated_pose(attacker).expect("ordinal 31 attacker pose"),
        defender_pose: world.articulated_pose(defender).expect("ordinal 31 defender pose"),
    }
}

#[cfg(feature = "cartesian-recoil")]
fn provenance_schedule_context(world: &World, case: StrongCase)
    -> (EntityId, EntityId, LimbSlot, CombatHeight, Angle, Angle)
{
    let attacker = world.alive_ids(Faction::Heroes)[0];
    let defender = world.alive_ids(Faction::Monsters)[0];
    let limb = attacking_limb(case, MirrorGrammar::SpatialRightHand);
    let shown = world.observe_articulated(attacker);
    let foe = shown.opponents().first().expect("ordinal 31 target observation");
    let bearing = Vec2::new(foe.body_position.x - shown.body_position.x,
                            foe.body_position.y - shown.body_position.y).angle();
    let region = foe.regions[BodyPart::Legs as usize];
    let local_height = (region.lower.z + region.upper.z) / Fx::from_int(2)
        - foe.body_position.z;
    let height = CombatHeight::try_from_raw(
        (local_height / shown.standing_height).clamp(Fx::ZERO, Fx::ONE).raw())
        .expect("ordinal 31 command height");
    let (chamber, follow) = schedule_bearings(bearing, case.mirrored);
    (attacker, defender, limb, height, chamber, follow)
}

#[cfg(feature = "cartesian-recoil")]
fn run_provenance_arm(arm: ProvenanceArm, effort: Fx, mutation: ProvenanceMutation)
    -> Result<ProvenanceRun, String>
{
    let case = ordinal_31_case();
    let scenario = scenario_for_ticks_with(case, CHAMBER_TICKS + STRIKE_TICKS,
                                             MirrorGrammar::SpatialRightHand);
    if scenario.fingerprint() != ORDINAL_31_FINGERPRINT {
        return Err(format!("ordinal 31 fingerprint drifted: {}", scenario.fingerprint()));
    }
    let mut worlds = [World::new(&scenario, case.seed), World::new(&scenario, case.seed)];
    let contexts = [provenance_schedule_context(&worlds[0], case),
                    provenance_schedule_context(&worlds[1], case)];
    if contexts[0] != contexts[1] { return Err("ordinal 31 setup diverged".into()); }
    let (attacker, defender, limb, height, chamber, follow) = contexts[0];
    let mut replay = sim::Replay::new(&scenario, case.seed);
    let mut expected_replay = Vec::new();
    let mut rows = Vec::with_capacity((CHAMBER_TICKS + STRIKE_TICKS) as usize);
    let mut cumulative_energy_excess_raw = 0;
    let mut contact_tick = None;
    let mut corrupted_group = false;
    for schedule_tick in 0..CHAMBER_TICKS + STRIKE_TICKS {
        let pending = worlds[0].pending_decisions().to_vec();
        if pending != worlds[1].pending_decisions() {
            return Err(format!("pending lists diverged at tick {schedule_tick}"));
        }
        let state_before = worlds[0].state_digest();
        if state_before.compare(worlds[1].state_digest()) != Ok(true) {
            return Err(format!("live and rerun state diverged before tick {schedule_tick}"));
        }
        let solver_before = worlds[0].contact_solver_rejections();
        let cap_before = worlds[0].contact_cap_hits();
        let mut commands = Vec::with_capacity(pending.len());
        for &id in &pending {
            let requested: Vec<_> = worlds.iter().map(|world| {
                let obs = world.observe_articulated(id);
                if id == attacker {
                    scheduled_attacker_command(&obs, defender, limb, case, height, schedule_tick,
                        CHAMBER_TICKS, Fx::ONE, effort, chamber, follow,
                        ScheduleBearingSource::ObservedOpponent)
                } else { neutral_articulated_command(&obs) }
            }).collect();
            if requested[0] != requested[1] {
                return Err(format!("requested commands diverged at tick {schedule_tick}"));
            }
            let mut stored = [None, None];
            for at in 0..2 {
                stored[at] = match worlds[at].submit_articulated_v1(id, requested[at]) {
                    SubmitArticulatedOutcome::Stored { command, rejection: None } => Some(command),
                    other => return Err(format!("submission refused at tick {schedule_tick}: {other:?}")),
                };
            }
            if stored[0] != stored[1] || stored[0] != Some(requested[0]) {
                return Err(format!("stored commands diverged at tick {schedule_tick}"));
            }
            let stored = stored[0].expect("checked stored command");
            #[cfg(test)]
            let remove = mutation == ProvenanceMutation::RemoveReplaySubmission
                && schedule_tick == 0 && id == attacker;
            #[cfg(not(test))]
            let remove = false;
            expected_replay.push((schedule_tick, id, stored));
            if !remove {
                replay.record_submitted(schedule_tick, id, sim::SubmittedCommand::Articulated(stored));
            }
            commands.push(ProvenanceCommand { entity: id, requested: requested[0], stored });
        }
        #[cfg(test)]
        if mutation == ProvenanceMutation::ReorderReplaySubmission && schedule_tick == 0
            && replay.submitted_entries.len() >= 2
        {
            replay.submitted_entries.swap(0, 1);
        }
        let replay_intact = replay.submitted_entries.len() == expected_replay.len()
            && replay.submitted_entries.iter().zip(&expected_replay).all(|(actual, expected)| {
                actual.tick == expected.0 && actual.entity == expected.1
                    && actual.command == sim::SubmittedCommand::Articulated(expected.2)
            });
        if !replay_intact {
            return Err(format!("replay submission receipt missing or reordered at tick {schedule_tick}"));
        }
        let tick_before = worlds[0].tick();
        let _ = worlds[0].step(); let _ = worlds[1].step();
        let tick_after = worlds[0].tick();
        let live = provenance_snapshot(&worlds[0], attacker, defender);
        let mut rerun = provenance_snapshot(&worlds[1], attacker, defender);
        #[cfg(test)]
        if mutation == ProvenanceMutation::CorruptTickLocalGroup && !corrupted_group
            && !rerun.groups.is_empty()
        {
            rerun.groups[0].tick = rerun.groups[0].tick.saturating_add(1);
            corrupted_group = true;
        }
        if !live.equals(&rerun) {
            return Err(format!("live and rerun snapshots diverged at tick {tick_after}"));
        }
        replay.finish(tick_after);
        let played_world = replay.play_until(tick_after);
        let played = provenance_snapshot(&played_world, attacker, defender);
        if !live.equals(&played) {
            return Err(format!("live and replay snapshots diverged at tick {tick_after}"));
        }
        // Smart128's arm measurement begins contact attribution with the strike phase;
        // chamber contacts are setup evidence, not the measured terminal.
        let contact = schedule_tick >= CHAMBER_TICKS && live.resolutions.iter().any(|row|
            attributed_sword_body(row, attacker, defender, limb));
        if contact { contact_tick = Some(tick_after); }
        let tick_energy_excess_raw = live.resolutions.iter().map(|row|
            row.energy.after_raw.saturating_sub(row.energy.before_raw)).max().unwrap_or(0);
        if schedule_tick >= CHAMBER_TICKS {
            cumulative_energy_excess_raw = cumulative_energy_excess_raw.max(tick_energy_excess_raw);
        }
        let terminal = contact || tick_after == CHAMBER_TICKS + STRIKE_TICKS;
        rows.push(ProvenanceTick {
            tick_before, tick_after, pending: pending.clone(), commands,
            state_before, state_after: live.digest, contact, terminal,
            solver_before, solver_after: live.solver_rejections,
            solver_delta: live.solver_rejections.saturating_sub(solver_before),
            cap_before, cap_after: live.cap_hits, resolutions: live.resolutions.clone(),
            first_rejection: live.first_rejection,
            first_exact_rejection: live.first_exact_rejection,
            scan_pair_rejection: live.scan_pair_rejection,
            groups: live.groups.clone(), external_energy: live.external_energy.clone(),
            tick_energy_excess_raw, cumulative_energy_excess_raw,
            attacker_observation: live.attacker_observation,
            defender_observation: live.defender_observation,
            attacker_pose: live.attacker_pose, defender_pose: live.defender_pose,
        });
        if terminal { break; }
    }
    #[cfg(test)]
    if mutation == ProvenanceMutation::CorruptTickLocalGroup && !corrupted_group {
        return Err("tick-local group mutation found no group".into());
    }
    replay.finish(worlds[0].tick());
    let final_played = replay.play();
    if !provenance_snapshot(&worlds[0], attacker, defender)
        .equals(&provenance_snapshot(&final_played, attacker, defender))
    {
        return Err("final live and replay snapshots diverged".into());
    }
    Ok(ProvenanceRun { arm, rows, solver_rejections: worlds[0].contact_solver_rejections(),
        contact_tick, terminal_tick: worlds[0].tick(), refusals: 0,
        cap_hits: worlds[0].contact_cap_hits(), max_energy_excess_raw: cumulative_energy_excess_raw })
}

#[cfg(feature = "cartesian-recoil")]
fn only_effort_differs(reference: &ProvenanceTick, held: &ProvenanceTick) -> bool {
    if reference.pending != held.pending || reference.commands.len() != held.commands.len() {
        return false;
    }
    let limb = LimbSlot::RightArm as usize;
    let mut saw = false;
    for (left, right) in reference.commands.iter().zip(&held.commands) {
        if left.entity != right.entity { return false; }
        for (a, b) in [(left.requested, right.requested), (left.stored, right.stored)] {
            if a == b { continue; }
            if a.arms[limb].effort != Fx::ONE
                || b.arms[limb].effort != Fx::ZERO { return false; }
            let mut restored = b; restored.arms[limb].effort = a.arms[limb].effort;
            if restored != a { return false; }
            saw = true;
        }
    }
    saw
}

#[cfg(feature = "cartesian-recoil")]
fn compare_provenance(reference: &ProvenanceRun, held: &ProvenanceRun,
    mutation: ProvenanceMutation) -> Result<(u32, Option<u32>, ProvenanceBoundary), String>
{
    let first_command_difference = reference.rows.iter().zip(&held.rows)
        .find(|(left, right)| left.commands != right.commands)
        .map(|(left, _)| left.tick_before).ok_or("commands never differed")?;
    let command_row = reference.rows.iter().zip(&held.rows)
        .find(|(left, _)| left.tick_before == first_command_difference)
        .ok_or("missing first command row")?;
    if first_command_difference != ORDINAL_31_FIRST_SUBMITTED_EFFORT_TICK
        || !only_effort_differs(command_row.0, command_row.1)
    {
        return Err(format!("first submitted command difference was not effort-only at tick {ORDINAL_31_FIRST_SUBMITTED_EFFORT_TICK}: actual_tick={first_command_difference} reference={:?} held={:?}",
            command_row.0.commands, command_row.1.commands));
    }
    let first_state_difference = reference.rows.iter().zip(&held.rows)
        .find(|(left, right)| left.state_after.compare(right.state_after) != Ok(true))
        .map(|(left, _)| left.tick_after);
    let evidence = reference.rows.iter().zip(&held.rows).map(|(left, right)|
        (left.tick_after, left.solver_delta, right.solver_delta,
         left.solver_after, right.solver_after, left.terminal, right.terminal)).collect();
    let boundary = select_provenance_boundary(mutate_boundary_evidence(evidence, mutation))?;
    Ok((first_command_difference, first_state_difference, boundary))
}

#[cfg(feature = "cartesian-recoil")]
fn mutate_boundary_evidence(mut rows: Vec<(u32, u32, u32, u32, u32, bool, bool)>,
    mutation: ProvenanceMutation) -> Vec<(u32, u32, u32, u32, u32, bool, bool)>
{
    #[cfg(test)]
    if mutation == ProvenanceMutation::SuppressOneSolverRejection {
        if let Some(at) = rows.iter().position(|row| row.1 != row.2 || row.3 != row.4) {
            let suppress_reference = rows[at].1 > rows[at].2 || rows[at].3 > rows[at].4;
            if suppress_reference {
                rows[at].1 = rows[at].1.saturating_sub(1);
                for row in &mut rows[at..] { row.3 = row.3.saturating_sub(1); }
            } else {
                rows[at].2 = rows[at].2.saturating_sub(1);
                for row in &mut rows[at..] { row.4 = row.4.saturating_sub(1); }
            }
        }
    }
    #[cfg(test)]
    if mutation == ProvenanceMutation::PassEarlierTerminal {
        if let Some(row) = rows.iter_mut().find(|row| row.5 || row.6) {
            row.5 = false; row.6 = false;
        }
    }
    rows
}

#[cfg(feature = "cartesian-recoil")]
fn select_provenance_boundary(rows: impl IntoIterator<
    Item = (u32, u32, u32, u32, u32, bool, bool)>) -> Result<ProvenanceBoundary, String>
{
    for (tick, reference_delta, held_delta, reference_after, held_after,
         reference_terminal, held_terminal) in rows {
        let different = reference_delta != held_delta || reference_after != held_after;
        if different {
            return Ok(ProvenanceBoundary::SolverDelta { tick });
        }
        if reference_terminal || held_terminal {
            return Ok(ProvenanceBoundary::TerminalBeforeSolverDelta {
                arm: if reference_terminal { ProvenanceArm::ReferenceBefore }
                     else { ProvenanceArm::Held }, tick,
            });
        }
    }
    Err("no solver delta or earlier terminal boundary".into())
}

#[cfg(feature = "cartesian-recoil")]
fn build_ordinal_31_provenance(mutation: ProvenanceMutation)
    -> Result<Ordinal31Provenance, String>
{
    let reference_before = run_provenance_arm(ProvenanceArm::ReferenceBefore, Fx::ONE, mutation)?;
    let held = run_provenance_arm(ProvenanceArm::Held, Fx::ZERO, mutation)?;
    let reference_after = run_provenance_arm(ProvenanceArm::ReferenceAfter, Fx::ONE, mutation)?;
    let expected = |run: &ProvenanceRun, solver, contact, terminal|
        run.solver_rejections == solver && run.contact_tick == contact && run.terminal_tick == terminal
        && run.refusals == 0 && run.cap_hits == 0 && run.max_energy_excess_raw == 0
        && run.rows.iter().all(|row| row.tick_energy_excess_raw == 0);
    if !expected(&reference_before, 7, Some(47), 47)
        || !expected(&held, 6, None, 56)
        || !expected(&reference_after, 7, Some(47), 47)
    {
        return Err(format!("ordinal 31 aggregate guard failed: reference-before={:?} held={:?} reference-after={:?}",
            (reference_before.solver_rejections, reference_before.contact_tick,
             reference_before.terminal_tick, reference_before.refusals, reference_before.cap_hits,
             reference_before.max_energy_excess_raw),
            (held.solver_rejections, held.contact_tick, held.terminal_tick, held.refusals,
             held.cap_hits, held.max_energy_excess_raw),
            (reference_after.solver_rejections, reference_after.contact_tick,
             reference_after.terminal_tick, reference_after.refusals, reference_after.cap_hits,
             reference_after.max_energy_excess_raw)));
    }
    if reference_before.rows.len() != reference_after.rows.len()
        || reference_before.rows.iter().zip(&reference_after.rows).any(|(a, b)|
            !a.equals(b))
    {
        return Err("ordinal 31 reference brackets drifted".into());
    }
    let expected_pending = [EntityId::new(0, 0), EntityId::new(1, 0)];
    for run in [&reference_before, &held, &reference_after] {
        if run.rows.iter().filter(|row| (28..36).contains(&row.tick_before))
            .any(|row| row.commands.iter().any(|command| command.entity == expected_pending[0]))
        {
            return Err("ordinal 31 attacker unexpectedly submitted on ticks 28..35".into());
        }
        let tick_36 = run.rows.iter().find(|row| row.tick_before == 36)
            .ok_or("ordinal 31 is missing tick 36")?;
        if tick_36.pending != expected_pending {
            return Err(format!("ordinal 31 tick 36 pending order drifted: {:?}", tick_36.pending));
        }
    }
    let (first_command_difference, first_state_difference, boundary) =
        compare_provenance(&reference_before, &held, mutation)?;
    Ok(Ordinal31Provenance { case: ordinal_31_case(), fingerprint: ORDINAL_31_FINGERPRINT,
        reference_before, held, reference_after, first_command_difference,
        first_state_difference, boundary })
}

#[cfg(feature = "cartesian-recoil")]
fn hex_payload(command: ArticulatedCommandV1) -> String {
    let mut out = String::with_capacity(sim::ARTICULATED_PAYLOAD_BYTES * 2);
    for byte in command.payload_bytes() { use core::fmt::Write; write!(out, "{byte:02x}").unwrap(); }
    out
}

#[cfg(feature = "cartesian-recoil")]
fn provenance_arm_name(arm: ProvenanceArm) -> &'static str {
    match arm { ProvenanceArm::ReferenceBefore => "reference_before",
        ProvenanceArm::Held => "held", ProvenanceArm::ReferenceAfter => "reference_after" }
}

#[cfg(feature = "cartesian-recoil")]
fn provenance_boundary_kind(boundary: ProvenanceBoundary) -> &'static str {
    match boundary { ProvenanceBoundary::SolverDelta { .. } =>
        "first_solver_delta_or_cumulative_count_delta",
        ProvenanceBoundary::TerminalBeforeSolverDelta { .. } =>
            "terminal-boundary-before-solver-divergence" }
}

#[cfg(feature = "cartesian-recoil")]
fn contact_kind_name(kind: ContactKind) -> &'static str {
    match kind { ContactKind::WeaponWeapon => "weapon_weapon",
        ContactKind::WeaponShield => "weapon_shield", ContactKind::WeaponBody => "weapon_body" }
}

#[cfg(feature = "cartesian-recoil")]
fn resolution_error_name(error: sim::ResolutionError) -> &'static str {
    use sim::ResolutionError::*;
    match error { ColliderIndex => "collider_index", EnergyNumerator => "energy_numerator",
        ResolutionCount => "resolution_count", Mass => "mass", Projector => "projector",
        DuplicateIdentity => "duplicate_identity", ExactScan => "exact_scan",
        ExactUnsupportedSweep => "exact_unsupported_sweep",
        ExactResponsePending => "exact_response_pending",
        ExactLifecyclePending => "exact_lifecycle_pending",
        ExactEnergyEnvelope => "exact_energy_envelope", ExactSolver => "exact_solver" }
}

#[cfg(feature = "cartesian-recoil")]
fn reject_phase_name(phase: sim::ExactContactRejectPhase) -> &'static str {
    use sim::ExactContactRejectPhase::*;
    match phase { BuildTrajectories => "build_trajectories", Preflight => "preflight",
        Scan => "scan", Recompute => "recompute", Closure => "closure",
        SolveGroup => "solve_group", ApplyGroup => "apply_group", Lifecycle => "lifecycle",
        Finish => "finish", StageCommit => "stage_commit" }
}

#[cfg(feature = "cartesian-recoil")]
fn entity_text(id: EntityId) -> String { format!("{}:{}", id.index, id.generation) }

#[cfg(feature = "cartesian-recoil")]
fn vec3_text(value: Vec3) -> String {
    format!("{}:{}:{}", value.x.raw(), value.y.raw(), value.z.raw())
}

#[cfg(feature = "cartesian-recoil")]
fn hash_domain_name(value: sim::HashDomain) -> &'static str {
    match value { sim::HashDomain::LegacyV1 => "legacy_v1",
        sim::HashDomain::ArticulatedV1 => "articulated_v1" }
}

#[cfg(feature = "cartesian-recoil")]
fn animation_hint_name(value: sim::AnimationHint) -> &'static str {
    match value { sim::AnimationHint::Idle => "idle", sim::AnimationHint::Chasing => "chasing",
        sim::AnimationHint::Braced => "braced", sim::AnimationHint::Contact => "contact",
        sim::AnimationHint::Recoiling => "recoiling", sim::AnimationHint::Severed => "severed" }
}

#[cfg(feature = "cartesian-recoil")]
fn write_exact_rejection(out: &mut String, label: &str,
    value: Option<sim::ExactContactRejectionDiagnostic>)
{
    use core::fmt::Write;
    match value {
        None => writeln!(out, "{label}=none").unwrap(),
        Some(row) => {
            let key = row.key.map(|(a, a_slot, b, b_slot, kind)| format!("{}:{}:{}:{}:{}",
                entity_text(a), a_slot, entity_text(b), b_slot, contact_kind_name(kind)))
                .unwrap_or_else(|| "none".into());
            writeln!(out, "{label} tick={} phase={} cause={} key={}", row.tick,
                reject_phase_name(row.phase), resolution_error_name(row.cause), key).unwrap();
        }
    }
}

#[cfg(feature = "cartesian-recoil")]
fn write_observation(out: &mut String, label: &str, row: sim::ArticulatedObservation) {
    use core::fmt::Write;
    writeln!(out, "observation label={label} tick={} subject={} capabilities={} body={} yaw_raw={} body_velocity={} blood_raw={} shock_raw={} severed_mask={} opponent_count={}",
        row.tick, entity_text(row.subject), row.capabilities, vec3_text(row.body_position),
        row.body_yaw.raw(), vec3_text(row.body_velocity), row.blood_fraction.raw(),
        row.shock.raw(), row.severed_mask, row.opponent_count).unwrap();
    for (at, arm) in row.arms.into_iter().enumerate() {
        writeln!(out, "observation.arm label={label} index={at} hand={} target={} velocity={} fatigue_raw={} integrity_raw={} severed={} equipment={}",
            vec3_text(arm.hand), vec3_text(arm.target_hand), vec3_text(arm.velocity),
            arm.fatigue.raw(), arm.integrity_fraction.raw(), arm.severed,
            arm.equipment.map(|v| v.to_string()).unwrap_or_else(|| "none".into())).unwrap();
    }
    for at in 0..BodyPart::COUNT {
        writeln!(out, "observation.anatomy label={label} region={at} integrity_raw={} wound_raw={}",
            row.integrity_fraction[at].raw(), row.wound_fraction[at].raw()).unwrap();
    }
}

#[cfg(feature = "cartesian-recoil")]
fn write_pose(out: &mut String, label: &str, row: sim::ArticulatedPose) {
    use core::fmt::Write;
    writeln!(out, "pose label={label} id={} body={} yaw_raw={} body_velocity={} blood_raw={} shock_raw={} severed_mask={} equipment_mask={}",
        entity_text(row.id), vec3_text(row.body), row.body_yaw.raw(), vec3_text(row.body_velocity),
        row.blood_fraction.raw(), row.shock.raw(), row.severed_mask, row.equipment_mask).unwrap();
    for (at, arm) in row.arms.into_iter().enumerate() {
        writeln!(out, "pose.arm label={label} index={at} hand={} target={} velocity={} fatigue_raw={}",
            vec3_text(arm.hand), vec3_text(arm.target_hand), vec3_text(arm.velocity),
            arm.fatigue.raw()).unwrap();
    }
    for at in 0..BodyPart::COUNT {
        writeln!(out, "pose.anatomy label={label} region={at} integrity_raw={} wound_raw={}",
            row.integrity_fraction[at].raw(), row.wound_fraction[at].raw()).unwrap();
    }
    for (at, weapon) in row.weapons.into_iter().enumerate() {
        match weapon {
            None => writeln!(out, "pose.weapon label={label} index={at} value=none").unwrap(),
            Some(weapon) => writeln!(out,
                "pose.weapon label={label} index={at} hilt={} tip={} radius_raw={}",
                vec3_text(weapon.hilt), vec3_text(weapon.tip), weapon.radius.raw()).unwrap(),
        }
    }
    match row.shield {
        None => writeln!(out, "pose.shield label={label} value=none").unwrap(),
        Some(shield) => writeln!(out,
            "pose.shield label={label} centre={} normal={} half_width_raw={} half_height_raw={} thickness_raw={}",
            vec3_text(shield.centre), vec3_text(shield.normal), shield.half_width.raw(),
            shield.half_height.raw(), shield.thickness.raw()).unwrap(),
    }
    let intent = match row.intent { Intent::Hold => "hold".into(), Intent::Flee => "flee".into(),
        Intent::Attack(id) => format!("attack:{}", entity_text(id)) };
    writeln!(out, "pose.control label={label} intent={intent} hint_left={} hint_right={}",
        animation_hint_name(row.hints[0]), animation_hint_name(row.hints[1])).unwrap();
}

#[cfg(feature = "cartesian-recoil")]
fn scan_shape_name(value: sim::ExactScanShapeDiagnostic) -> &'static str {
    match value { sim::ExactScanShapeDiagnostic::Body => "body",
        sim::ExactScanShapeDiagnostic::Segment => "segment",
        sim::ExactScanShapeDiagnostic::Shield => "shield" }
}

#[cfg(feature = "cartesian-recoil")]
fn scan_branch_name(value: sim::ExactScanBranchDiagnostic) -> &'static str {
    match value { sim::ExactScanBranchDiagnostic::SweptAabb => "swept_aabb",
        sim::ExactScanBranchDiagnostic::SegmentSegment => "segment_segment",
        sim::ExactScanBranchDiagnostic::SegmentShield => "segment_shield",
        sim::ExactScanBranchDiagnostic::SegmentBody => "segment_body" }
}

#[cfg(feature = "cartesian-recoil")]
fn scan_reject_name(value: sim::ExactScanRejectDiagnostic) -> &'static str {
    match value { sim::ExactScanRejectDiagnostic::ArithmeticEnvelope => "arithmetic_envelope",
        sim::ExactScanRejectDiagnostic::Budget => "budget",
        sim::ExactScanRejectDiagnostic::CompatibilityIdentity => "compatibility_identity",
        sim::ExactScanRejectDiagnostic::Trajectory => "trajectory",
        sim::ExactScanRejectDiagnostic::UnsupportedExactSweep => "unsupported_exact_sweep" }
}

#[cfg(feature = "cartesian-recoil")]
fn ratio_text(value: Option<(i128, i128)>) -> String {
    value.map(|(n, d)| format!("{n}/{d}")).unwrap_or_else(|| "none".into())
}

#[cfg(feature = "cartesian-recoil")]
fn write_scan_pair(out: &mut String, value: Option<sim::ExactScanPairRejectionDiagnostic>) {
    use core::fmt::Write;
    let Some(row) = value else { writeln!(out, "scan_pair=none").unwrap(); return; };
    writeln!(out, "scan_pair a_index={} b_index={} a_entity={} b_entity={} a_slot={} b_slot={} a_shape={} b_shape={} a_present={} b_present={} a_owner={} b_owner={} group_time_raw={} aabb_supported={} aabb_disjoint={} branch={} reject={}",
        row.a_index, row.b_index, entity_text(row.a_entity), entity_text(row.b_entity),
        row.a_slot, row.b_slot, scan_shape_name(row.a_shape), scan_shape_name(row.b_shape),
        row.a_present, row.b_present, row.a_owner, row.b_owner, row.group_time_raw,
        row.aabb_supported, row.aabb_disjoint.map(|v| v.to_string()).unwrap_or_else(|| "none".into()),
        scan_branch_name(row.branch), scan_reject_name(row.reject)).unwrap();
    match row.segment_body {
        None => writeln!(out, "scan_pair.segment_body=none").unwrap(),
        Some(detail) => {
            writeln!(out, "scan_pair.segment_body region={} visit={} time_raw={} speed={} closest_feature={} distance_sq={} radius={} radius_sq={} separation={} l1_delta={} safe_denominator={} safe_quotient={} floor_step={} applied_advance={} adjacent_time_raw={} adjacent_distance_sq={} adjacent_radius={} adjacent_radius_sq={} current_separated={} adjacent_separated={} interval_aabb_disjoint={}",
                detail.region, detail.visit, detail.time_raw, ratio_text(detail.speed),
                detail.closest_feature, ratio_text(detail.distance_sq), ratio_text(detail.radius),
                ratio_text(detail.radius_sq), ratio_text(detail.separation), ratio_text(detail.l1_delta),
                ratio_text(detail.safe_denominator), ratio_text(detail.safe_quotient), detail.floor_step,
                detail.applied_advance, detail.adjacent_time_raw, ratio_text(detail.adjacent_distance_sq),
                ratio_text(detail.adjacent_radius), ratio_text(detail.adjacent_radius_sq),
                detail.current_separated, detail.adjacent_separated,
                detail.interval_aabb_disjoint).unwrap();
            for at in 0..3 {
                writeln!(out, "scan_pair.segment_body.closest index={at} a={} b={}",
                    ratio_text(detail.closest_a[at]), ratio_text(detail.closest_b[at])).unwrap();
            }
        }
    }
}

#[cfg(feature = "cartesian-recoil")]
fn write_resolution(out: &mut String, at: usize, row: sim::ContactResolution) {
    use core::fmt::Write;
    writeln!(out, "resolution index={at} group_ordinal={} group_alpha_raw={} key={}:{}:{}:{}:{} toi_raw={} region={} point={} normal={} velocity_a={} velocity_b={} impulse_a={} impulse_b={} energy_before={} energy_after={} dissipated={} cut={} thrust={} pressure={} deflected={} severed={}",
        row.group_ordinal, row.group_alpha_raw, entity_text(row.fact.key.a), row.fact.key.a_slot,
        entity_text(row.fact.key.b), row.fact.key.b_slot, contact_kind_name(row.fact.key.kind),
        row.fact.toi.get().raw(), row.fact.region, vec3_text(row.fact.point), vec3_text(row.fact.normal),
        vec3_text(row.fact.velocity_a), vec3_text(row.fact.velocity_b), vec3_text(row.impulse.on_a),
        vec3_text(row.impulse.on_b), row.energy.before_raw, row.energy.after_raw,
        row.energy.dissipated_raw, row.cut_raw, row.thrust_raw, row.pressure_raw,
        row.deflected_raw, row.severed).unwrap();
}

#[cfg(feature = "cartesian-recoil")]
fn exact_key_text(value: sim::ExactContactKeyDiagnostic) -> String {
    format!("{}:{}:{}:{}:{}", entity_text(value.a), value.a_slot, entity_text(value.b),
        value.b_slot, contact_kind_name(value.kind))
}

#[cfg(feature = "cartesian-recoil")]
fn group_reject_name(value: sim::ExactSolveGroupRejectDetail) -> &'static str {
    use sim::ExactSolveGroupRejectDetail::*;
    match value { EmptyDriverSet => "empty_driver_set", LiftedIdentity => "lifted_identity",
        LiftedFactEnvelope => "lifted_fact_envelope", LiftedRowEnvelope => "lifted_row_envelope",
        LiftedCandidateEnvelope => "lifted_candidate_envelope",
        LiftedImpulseEnvelope => "lifted_impulse_envelope",
        LiftedArithmeticEnvelope => "lifted_arithmetic_envelope",
        LiftedNoRestitutionCandidate => "lifted_no_restitution_candidate",
        LiftedNoDissipativeCandidate => "lifted_no_dissipative_candidate" }
}

#[cfg(feature = "cartesian-recoil")]
fn wide_primitive_name(value: sim::ExactWidePrimitiveDiagnostic) -> &'static str {
    use sim::ExactWidePrimitiveDiagnostic::*;
    match value { CompatibilityFallback => "compatibility_fallback",
        SegmentSegment => "segment_segment", SegmentShield => "segment_shield",
        SegmentBodyRegion => "segment_body_region" }
}

#[cfg(feature = "cartesian-recoil")]
fn wide_comparison_name(value: sim::ExactWideComparisonDiagnostic) -> &'static str {
    match value {
        sim::ExactWideComparisonDiagnostic::DistanceLessThanOrEqualRadiusSquared =>
            "distance_lte_radius_squared",
        sim::ExactWideComparisonDiagnostic::EarliestTimeThenMedialThenRegion =>
            "earliest_time_then_medial_then_region",
    }
}

#[cfg(feature = "cartesian-recoil")]
fn compatibility_primitive_name(value: sim::ExactCompatibilityPrimitiveDiagnostic)
    -> &'static str
{
    match value { sim::ExactCompatibilityPrimitiveDiagnostic::SweptSegmentSegment =>
        "swept_segment_segment",
        sim::ExactCompatibilityPrimitiveDiagnostic::SweptSegmentRectangle =>
        "swept_segment_rectangle" }
}

#[cfg(feature = "cartesian-recoil")]
fn write_group(out: &mut String, at: usize, row: &sim::ExactContactGroupDiagnostic) {
    use core::fmt::Write;
    writeln!(out, "group index={at} tick={} ordinal={} selected_time_raw={} scan_candidates={} mapped_time_members={} recomputed_facts={} closure_entities={} closure_rows={} driver_contacts={} lifted_contacts={} output_rows={} reject={}",
        row.tick, row.group_ordinal, row.selected_time_raw, row.scan_candidates,
        row.mapped_time_members, row.recomputed_facts, row.closure_entities, row.closure_rows,
        row.driver_contacts, row.lifted_contacts, row.output_rows,
        row.reject.map(group_reject_name).unwrap_or("none")).unwrap();
    for slot in 0..16 {
        writeln!(out, "group.key group={at} slot={slot} mapped={} recomputed={}",
            row.mapped_member_keys[slot].map(exact_key_text).unwrap_or_else(|| "none".into()),
            row.recomputed_keys[slot].map(exact_key_text).unwrap_or_else(|| "none".into())).unwrap();
        match row.wide_toi[slot] {
            None => writeln!(out, "group.wide group={at} slot={slot} value=none").unwrap(),
            Some(wide) => {
                writeln!(out, "group.wide group={at} slot={slot} key={}:{}:{}:{}:{} region={} primitive={} interval_start={} interval_end={} visit_count={} accepted_root={} closest_feature={} comparison={}",
                    entity_text(wide.key.a), wide.key.a_slot, entity_text(wide.key.b),
                    wide.key.b_slot, contact_kind_name(wide.key.kind), wide.region,
                    wide_primitive_name(wide.primitive), wide.interval_start_raw,
                    wide.interval_end_raw, wide.visit_count, wide.accepted_root_raw,
                    wide.closest_feature, wide_comparison_name(wide.comparison)).unwrap();
                for visit in 0..8 { writeln!(out,
                    "group.wide.visit group={at} slot={slot} index={visit} time_raw={} safe_step_raw={}",
                    wide.visited_times_raw[visit], wide.safe_steps_raw[visit]).unwrap(); }
            }
        }
        match row.compatibility_sweep[slot] {
            None => writeln!(out, "group.compatibility group={at} slot={slot} value=none").unwrap(),
            Some(sweep) => {
                writeln!(out, "group.compatibility group={at} slot={slot} key={}:{}:{}:{}:{} region={} primitive={} point_count={} radius0={} radius1={} accepted_toi_raw={}",
                    entity_text(sweep.key.a), sweep.key.a_slot, entity_text(sweep.key.b),
                    sweep.key.b_slot, contact_kind_name(sweep.key.kind), sweep.region,
                    compatibility_primitive_name(sweep.primitive), sweep.point_count,
                    sweep.radii_raw[0], sweep.radii_raw[1], sweep.accepted_toi_raw).unwrap();
                for point in 0..12 { writeln!(out,
                    "group.compatibility.point group={at} slot={slot} index={point} x={} y={} z={}",
                    sweep.points_raw[point][0], sweep.points_raw[point][1],
                    sweep.points_raw[point][2]).unwrap(); }
            }
        }
    }
}

#[cfg(feature = "cartesian-recoil")]
fn render_provenance(trace: &Ordinal31Provenance) -> String {
    use core::fmt::Write;
    let mut out = String::new();
    writeln!(out, "smart130-ordinal31-arm-provenance-v1").unwrap();
    writeln!(out, "descriptor ordinal=31 seed={} mirrored={} target=brute offset_x_raw={} offset_y_raw={}",
        trace.case.seed, trace.case.mirrored, trace.case.approach_offset.x.raw(),
        trace.case.approach_offset.y.raw()).unwrap();
    writeln!(out, "scenario_fingerprint={}", trace.fingerprint).unwrap();
    writeln!(out, "schedule chamber_ticks=28 strike_ticks=28 first_submitted_effort_tick=36 reach_raw=65536 reference_effort_raw=65536 held_effort_raw=0").unwrap();
    for run in [&trace.reference_before, &trace.held, &trace.reference_after] {
        let run_name = provenance_arm_name(run.arm);
        writeln!(out, "run={} solver_rejections={} contact_tick={} terminal_tick={} refusals={} cap_hits={} max_energy_excess_raw={}",
            run_name, run.solver_rejections, run.contact_tick.map(|v| v.to_string()).unwrap_or_else(|| "none".into()),
            run.terminal_tick, run.refusals, run.cap_hits, run.max_energy_excess_raw).unwrap();
        for row in &run.rows {
            writeln!(out, "tick run={} before={} after={} terminal={} contact={} solver_before={} solver_after={} solver_delta={} cap_before={} cap_after={} energy_excess_tick={} energy_excess_cumulative={}",
                run_name, row.tick_before, row.tick_after, row.terminal, row.contact,
                row.solver_before, row.solver_after, row.solver_delta, row.cap_before,
                row.cap_after, row.tick_energy_excess_raw, row.cumulative_energy_excess_raw).unwrap();
            write!(out, "pending count={}", row.pending.len()).unwrap();
            for id in &row.pending { write!(out, " entity={}", entity_text(*id)).unwrap(); }
            out.push('\n');
            for command in &row.commands {
                writeln!(out, "command entity={}:{} requested={} stored={} receipt=stored",
                    command.entity.index, command.entity.generation, hex_payload(command.requested),
                    hex_payload(command.stored)).unwrap();
            }
            writeln!(out, "state_before={}:{}:{} state_after={}:{}:{}",
                hash_domain_name(row.state_before.domain), row.state_before.schema, row.state_before.value,
                hash_domain_name(row.state_after.domain), row.state_after.schema, row.state_after.value).unwrap();
            writeln!(out, "resolution_count={}", row.resolutions.len()).unwrap();
            for (at, resolution) in row.resolutions.iter().copied().enumerate() {
                write_resolution(&mut out, at, resolution);
            }
            writeln!(out, "first_rejection={}", row.first_rejection
                .map(resolution_error_name).unwrap_or("none")).unwrap();
            write_exact_rejection(&mut out, "first_exact_rejection", row.first_exact_rejection);
            write_scan_pair(&mut out, row.scan_pair_rejection);
            writeln!(out, "group_count={}", row.groups.len()).unwrap();
            for (at, group) in row.groups.iter().enumerate() { write_group(&mut out, at, group); }
            writeln!(out, "external_energy_count={}", row.external_energy.len()).unwrap();
            for (at, energy) in row.external_energy.iter().enumerate() {
                writeln!(out, "external_energy index={at} entity={} lane={} reason={} signed_numerator={} denominator={}",
                    entity_text(energy.entity), energy.lane, energy.reason,
                    energy.signed_numerator, energy.denominator).unwrap();
            }
            write_observation(&mut out, "attacker", row.attacker_observation);
            write_observation(&mut out, "defender", row.defender_observation);
            write_pose(&mut out, "attacker", row.attacker_pose);
            write_pose(&mut out, "defender", row.defender_pose);
        }
    }
    writeln!(out, "first_command_difference_tick={}", trace.first_command_difference).unwrap();
    writeln!(out, "first_state_difference_tick={}", trace.first_state_difference
        .map(|v| v.to_string()).unwrap_or_else(|| "none".into())).unwrap();
    match trace.boundary {
        ProvenanceBoundary::SolverDelta { tick } =>
            writeln!(out, "boundary kind={} tick={tick}",
                provenance_boundary_kind(trace.boundary)).unwrap(),
        ProvenanceBoundary::TerminalBeforeSolverDelta { arm, tick } =>
            writeln!(out, "boundary kind={} arm={} tick={tick}",
                provenance_boundary_kind(trace.boundary), provenance_arm_name(arm)).unwrap(),
    }
    let boundary_tick = match trace.boundary { ProvenanceBoundary::SolverDelta { tick }
        | ProvenanceBoundary::TerminalBeforeSolverDelta { tick, .. } => tick };
    let reference = trace.reference_before.rows.iter().find(|row| row.tick_after == boundary_tick).unwrap();
    let held = trace.held.rows.iter().find(|row| row.tick_after == boundary_tick).unwrap();
    for (label, row) in [("reference", reference), ("held", held)] {
        writeln!(out, "boundary_arm label={label} solver_delta={} solver_after={} first_rejection={}",
            row.solver_delta, row.solver_after,
            row.first_rejection.map(resolution_error_name).unwrap_or("none")).unwrap();
        write_exact_rejection(&mut out, &format!("boundary.{label}.first_exact_rejection"),
                              row.first_exact_rejection);
        let mut diagnostic = String::new();
        write_scan_pair(&mut diagnostic, row.scan_pair_rejection);
        writeln!(diagnostic, "group_count={}", row.groups.len()).unwrap();
        for (at, group) in row.groups.iter().enumerate() { write_group(&mut diagnostic, at, group); }
        for line in diagnostic.lines() { writeln!(out, "boundary.{label}.{line}").unwrap(); }
    }
    assert!(out.is_ascii(), "Smart130 artifact grammar is ASCII");
    out
}

#[cfg(feature = "cartesian-recoil")]
pub(crate) fn ordinal_31_provenance_artifact() -> Result<String, String> {
    #[cfg(test)]
    { return Ok(render_provenance(cached_ordinal_31_trace())); }
    #[cfg(not(test))]
    build_ordinal_31_provenance(ProvenanceMutation::None).map(|trace| render_provenance(&trace))
}

#[cfg(all(feature = "cartesian-recoil", test))]
fn cached_ordinal_31_trace() -> &'static Ordinal31Provenance {
    static TRACE: std::sync::OnceLock<Ordinal31Provenance> = std::sync::OnceLock::new();
    TRACE.get_or_init(|| build_ordinal_31_provenance(ProvenanceMutation::None)
        .expect("the frozen ordinal 31 trace must validate"))
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
    println!("refusals={} solver_rejections={} cap_hits={} max_energy_excess_raw={}",
        row.refusals, row.solver_rejections, row.cap_hits, row.max_energy_excess_raw);
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
fn mapped_compatibility_sweep(rows: &[Option<ExactCompatibilitySweepDiagnostic>; 16],
                              mirror: bool) -> Vec<String> {
    rows.iter().flatten().map(|row| {
        let a_slot = if mirror { reflected_slot(row.key.a_slot) } else { row.key.a_slot };
        let b_slot = if mirror { reflected_slot(row.key.b_slot) } else { row.key.b_slot };
        let mut points = row.points_raw;
        if mirror { for point in &mut points[..row.point_count as usize] {
            point[1] = Fx::from_int(16).raw() - point[1];
        } }
        format!("{:?}:{}:{:?}:{}:{:?}:region={}:primitive={:?}:points={:?}:radii={:?}:toi={}",
            row.key.a, a_slot, row.key.b, b_slot, row.key.kind, row.region, row.primitive,
            &points[..row.point_count as usize], row.radii_raw, row.accepted_toi_raw)
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
            ("compatibility_sweep", format!("{:?}", mapped_compatibility_sweep(
                 &left.compatibility_sweep, false)), format!("{:?}",
                 mapped_compatibility_sweep(&right.compatibility_sweep, true))),
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

    #[cfg(feature = "cartesian-recoil")]
    fn ordinal_31_trace() -> &'static Ordinal31Provenance {
        cached_ordinal_31_trace()
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn ordinal_31_is_the_frozen_first_solver_count_mismatch() {
        let case = ordinal_31_case();
        let ordinal = (((case.seed as usize * 2 + usize::from(case.mirrored)) * 2 + 1) *
            APPROACH_OFFSETS.len()) + APPROACH_OFFSETS.iter()
                .position(|offset| *offset == case.approach_offset).unwrap();
        assert_eq!(ordinal, 31, "the sole frozen descriptor moved in canonical enumeration");
        assert_eq!(case, StrongCase { seed: 0, mirrored: true,
            target_anatomy: AnatomyChoice::Brute,
            approach_offset: Vec2::new(Fx::from_raw(-163_840), Fx::ZERO) });
        let trace = ordinal_31_trace();
        assert_eq!(trace.fingerprint, ORDINAL_31_FINGERPRINT);
        assert_eq!((trace.reference_before.solver_rejections,
                    trace.held.solver_rejections,
                    trace.reference_after.solver_rejections), (7, 6, 7));
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn ordinal_31_first_command_difference_is_right_arm_effort_at_tick_36() {
        let trace = ordinal_31_trace();
        let reference = &trace.reference_before.rows;
        let held = &trace.held.rows;
        let rows = reference.iter().zip(held.iter())
            .find(|(reference, held)| reference.commands != held.commands).unwrap();
        assert_eq!(CHAMBER_TICKS, 28, "the requested schedule phase transition moved");
        for run in [&reference, &held] {
            assert!(run.iter().filter(|row| (28..36).contains(&row.tick_before))
                .all(|row| row.commands.iter().all(|command| command.entity.index != 0)),
                "the attacker submitted while it was not pending on ticks 28..35");
        }
        assert_eq!(rows.0.tick_before, ORDINAL_31_FIRST_SUBMITTED_EFFORT_TICK,
            "pending={:?} reference={:?} held={:?}",
            rows.0.pending, rows.0.commands, rows.1.commands);
        assert_eq!(rows.0.pending, [EntityId::new(0, 0), EntityId::new(1, 0)]);
        assert_eq!(rows.1.pending, rows.0.pending);
        assert!(only_effort_differs(rows.0, rows.1));
        assert!(reference.iter().zip(held.iter()).take(ORDINAL_31_FIRST_SUBMITTED_EFFORT_TICK as usize)
            .all(|(reference, held)| reference.commands == held.commands));
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn ordinal_31_live_rerun_and_replay_match_every_active_tick() {
        let trace = ordinal_31_trace();
        assert_eq!((trace.reference_before.rows.len(), trace.held.rows.len(),
                    trace.reference_after.rows.len()), (47, 56, 47));
        for run in [&trace.reference_before, &trace.held, &trace.reference_after] {
            assert_eq!(run.rows.first().map(|row| (row.tick_before, row.tick_after)), Some((0, 1)));
            assert_eq!(run.rows.last().map(|row| row.tick_after), Some(run.terminal_tick));
            assert!(run.rows.iter().enumerate().all(|(at, row)|
                row.tick_before == at as u32 && row.tick_after == at as u32 + 1));
        }
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn ordinal_31_reproduces_the_reference_held_reference_bracket() {
        let trace = ordinal_31_trace();
        assert_eq!((trace.reference_before.contact_tick, trace.reference_before.terminal_tick,
                    trace.reference_before.refusals, trace.reference_before.cap_hits,
                    trace.reference_before.max_energy_excess_raw), (Some(47), 47, 0, 0, 0));
        assert_eq!((trace.held.contact_tick, trace.held.terminal_tick, trace.held.refusals,
                    trace.held.cap_hits, trace.held.max_energy_excess_raw),
                   (None, 56, 0, 0, 0));
        assert_eq!((trace.reference_after.contact_tick, trace.reference_after.terminal_tick,
                    trace.reference_after.refusals, trace.reference_after.cap_hits,
                    trace.reference_after.max_energy_excess_raw), (Some(47), 47, 0, 0, 0));
        assert!(trace.reference_before.rows.iter().zip(&trace.reference_after.rows)
            .all(|(before, after)| before.equals(after)));
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn provenance_stops_at_the_first_solver_delta_or_earlier_terminal() {
        let measured_shape = vec![(45, 0, 0, 6, 6, false, false),
                                  (46, 1, 0, 7, 6, false, false),
                                  (47, 0, 0, 7, 6, true, false)];
        let actual = select_provenance_boundary(measured_shape).unwrap();
        assert_eq!(actual, ProvenanceBoundary::SolverDelta { tick: 46 });
        let cumulative_only = vec![(12, 0, 0, 5, 4, false, false)];
        assert_eq!(select_provenance_boundary(cumulative_only),
            Ok(ProvenanceBoundary::SolverDelta { tick: 12 }),
            "a cumulative-count mismatch is a solver boundary even when tick deltas match");
        let delta_only = vec![(13, 1, 0, 5, 5, false, false)];
        assert_eq!(select_provenance_boundary(delta_only),
            Ok(ProvenanceBoundary::SolverDelta { tick: 13 }),
            "a tick-delta mismatch is a solver boundary even when cumulative counts match");
        let solver_at_terminal = vec![(46, 0, 0, 6, 6, false, false),
                                      (47, 1, 0, 7, 6, true, false),
                                      (48, 0, 0, 7, 6, false, false)];
        assert_eq!(select_provenance_boundary(solver_at_terminal.clone()),
            Ok(ProvenanceBoundary::SolverDelta { tick: 47 }));
        let suppressed = mutate_boundary_evidence(solver_at_terminal,
            ProvenanceMutation::SuppressOneSolverRejection);
        assert_eq!(suppressed, [(46, 0, 0, 6, 6, false, false),
                                (47, 0, 0, 6, 6, true, false),
                                (48, 0, 0, 6, 6, false, false)],
            "the removed event must stay removed from every later cumulative count");
        assert_eq!(select_provenance_boundary(suppressed),
            Ok(ProvenanceBoundary::TerminalBeforeSolverDelta {
                arm: ProvenanceArm::ReferenceBefore, tick: 47 }),
            "suppressing one copied rejection event must change both delta and cumulative evidence");
        let terminal = vec![(46, 0, 0, 6, 6, false, false),
                            (47, 0, 0, 6, 6, true, false),
                            (48, 1, 0, 7, 6, false, false)];
        assert_eq!(select_provenance_boundary(terminal.clone()),
            Ok(ProvenanceBoundary::TerminalBeforeSolverDelta {
                arm: ProvenanceArm::ReferenceBefore, tick: 47 }));
        assert_eq!(provenance_boundary_kind(ProvenanceBoundary::TerminalBeforeSolverDelta {
            arm: ProvenanceArm::ReferenceBefore, tick: 47 }),
            "terminal-boundary-before-solver-divergence");
        assert_eq!(select_provenance_boundary(mutate_boundary_evidence(terminal,
                    ProvenanceMutation::PassEarlierTerminal)),
            Ok(ProvenanceBoundary::SolverDelta { tick: 48 }),
            "passing the earlier terminal must expose the forbidden later delta");
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn tick_local_exact_diagnostics_are_copied_before_the_next_step() {
        let error = run_provenance_arm(ProvenanceArm::ReferenceBefore, Fx::ONE,
                                       ProvenanceMutation::CorruptTickLocalGroup)
            .expect_err("altering one copied group must break live/rerun equality");
        assert!(error.contains("snapshots diverged"), "{error}");
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn provenance_refuses_a_missing_or_reordered_replay_submission() {
        for mutation in [ProvenanceMutation::RemoveReplaySubmission,
                         ProvenanceMutation::ReorderReplaySubmission] {
            let error = build_ordinal_31_provenance(mutation)
                .expect_err("a damaged replay receipt must be refused");
            assert!(error.contains("replay submission receipt missing or reordered"));
        }
    }
}
