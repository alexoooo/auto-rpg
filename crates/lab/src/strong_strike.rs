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
    pub refusals: u32, pub solver_rejections: u32, pub max_energy_excess_raw: u64,
    pub contact_key: Option<(EntityId, u8, EntityId, u8, ContactKind)>,
    pub toi_raw: Option<i32>, pub normal: Vec3, pub impulse_on_a: Vec3,
    pub group_alpha_raw: Option<u32>,
    pub cap_hits: u32,
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
    row.observed_contact_region.map(|region| region.present && swept_segment_segment(
        row.previous_weapon.hilt, row.previous_weapon.tip,
        row.requested_weapon.hilt, row.requested_weapon.tip,
        row.previous_weapon.radius.max(row.requested_weapon.radius),
        region.lower, region.upper, region.lower, region.upper, region.radius,
    ).is_some()).unwrap_or(false)
}

fn scenario_for_ticks(case: StrongCase, max_ticks: u32) -> Scenario {
    let mut config = DuelConfigV1::shipped();
    let centre = Vec2::from_ints(12, 8);
    let offset = if case.mirrored {
        Vec2::new(case.approach_offset.x, -case.approach_offset.y)
    } else { case.approach_offset };
    config.fighters[0].spawn = centre + offset;
    config.fighters[0].hands[1].as_mut().expect("the shipped sword").geometry =
        EquipmentGeometry::Segment { length: Fx::from_int(2), radius: Fx::from_ratio(1, 25) };
    config.fighters[1].spawn = centre;
    config.fighters[1].anatomy = case.target_anatomy;
    config.max_ticks = max_ticks;
    Scenario::duel_from(&config).expect("the controlled strong-strike duel is legal")
}

pub(crate) fn scenario_for(case: StrongCase) -> Scenario {
    scenario_for_ticks(case, CHAMBER_TICKS + STRIKE_TICKS)
}

#[cfg(test)]
pub(crate) fn scenario() -> Scenario { scenario_for(StrongCase::quick()) }

fn command(obs: &sim::ArticulatedObservation, opponent: EntityId, bearing: Angle,
           height: CombatHeight, reach: Fx, effort: Fx)
    -> ArticulatedCommandV1
{
    let mut command = neutral_articulated_command(obs);
    command.intent = Intent::Attack(opponent);
    command.arms[1] = ArmTarget {
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

fn raw_parts(values: [Fx; BodyPart::COUNT]) -> [i32; BodyPart::COUNT] { values.map(Fx::raw) }

fn attributed_sword_body(row: &sim::ContactResolution, attacker: EntityId, defender: EntityId)
    -> bool
{
    row.fact.key.kind == ContactKind::WeaponBody && (
        (row.fact.key.a == attacker && row.fact.key.a_slot == LimbSlot::RightArm as u8
            && row.fact.key.b == defender && row.fact.key.b_slot == BODY_SLOT)
        || (row.fact.key.b == attacker && row.fact.key.b_slot == LimbSlot::RightArm as u8
            && row.fact.key.a == defender && row.fact.key.a_slot == BODY_SLOT)
    )
}

pub(crate) fn measure_case_schedule(
    case: StrongCase, strike_effort: Fx, chamber_ticks: u32, strike_ticks: u32,
    strike_reach: Fx,
) -> StrikeMeasurement {
    let scenario = scenario_for_ticks(case, chamber_ticks + strike_ticks);
    let mut world = World::new(&scenario, case.seed);
    let attacker = world.alive_ids(Faction::Heroes)[0];
    let defender = world.alive_ids(Faction::Monsters)[0];
    let shown = world.observe_articulated(attacker);
    let foe = shown.opponents().first().expect("the target is publicly observed");
    let offset = Vec2::new(
        foe.body_position.x - shown.body_position.x,
        foe.body_position.y - shown.body_position.y,
    );
    let bearing = offset.angle();
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
                command(&obs, defender, chamber, height, Fx::ONE, Fx::ONE)
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
    let mut previous = world.observe_articulated(attacker).weapons[1].expect("configured sword");
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
        observed_contact_region: None,
        refusals: 0, solver_rejections: 0, max_energy_excess_raw: 0,
        contact_key: None, toi_raw: None, normal: Vec3::ZERO, impulse_on_a: Vec3::ZERO,
        group_alpha_raw: None,
        cap_hits: 0,
    };

    for _ in 0..strike_ticks {
        let attacker_before = world.observe_articulated(attacker);
        for id in world.pending_decisions().to_vec() {
            let obs = world.observe_articulated(id);
            let submitted = if id == attacker {
                command(&obs, defender, follow, height, strike_reach, strike_effort)
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
        for resolution in world.contact_resolutions() {
            max_energy_excess_raw = max_energy_excess_raw.max(
                resolution.energy.after_raw.saturating_sub(resolution.energy.before_raw));
        }
        let requested = world.observe_articulated(attacker).weapons[1].expect("attached sword");
        answer.previous_weapon = previous;
        answer.requested_weapon = requested;
        answer.tip_delta = requested.tip - previous.tip;
        answer.hilt_delta = requested.hilt - previous.hilt;
        if let Some(row) = world.contact_resolutions().iter().find(|row| {
            attributed_sword_body(row, attacker, defender)
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
            answer.observed_contact_region = answer.region.and_then(|part| {
                attacker_before.opponents().iter().find(|foe| foe.id == defender)
                    .map(|foe| foe.regions[part as usize])
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
                .filter(|row| attributed_sword_body(row, attacker, defender)).count() as u32;
            answer.competing_facts = world.contact_resolutions().iter()
                .filter(|row| !attributed_sword_body(row, attacker, defender)).count() as u32;
            let anatomy = sim::fighter_anatomy();
            let yaw = attacker_before.body_yaw;
            let side = -anatomy.shoulder_half_width;
            let shoulder = attacker_before.body_position + Vec3::new(
                -yaw.sin() * side, yaw.cos() * side, anatomy.shoulder_height,
            );
            let planar = Vec2::new(attacker_before.arms[1].hand.x - shoulder.x,
                                   attacker_before.arms[1].hand.y - shoulder.y);
            answer.contact_reach_raw = Some((planar.length() / attacker_before.arm_length).raw());
            answer.contact_arm_velocity = attacker_before.arms[1].velocity;
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

fn mirrored_pair(rows: [MechanicalRow; 2]) -> bool {
    let [plain, mirror] = rows;
    plain.eligible && mirror.eligible && plain.key == mirror.key && plain.region == mirror.region
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

fn execute_cases_with(cases: &[MechanicalCase], mut measure: impl FnMut(
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
        if local.chunks_exact(2).all(|pair| mirrored_pair([pair[0], pair[1]])) {
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
    execute_cases_with(&declared_central_cases(), measure)
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

fn execute_corpus_sharded_with<M>(measure: M) -> StrikeCorpusAudit
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
                .spawn_scoped(scope, move || execute_cases_with(cases, measure))
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
    execute_corpus_sharded_with(|case, mirrored, strike_delta, reach_delta| {
        let strike_ticks = (case.strike_ticks as i32 + strike_delta) as u32;
        let measured = measure_case_schedule(StrongCase { seed: 0, mirrored,
            target_anatomy: case.target_anatomy, approach_offset: case.approach_offset },
            Fx::ONE, case.chamber_ticks, strike_ticks, Fx::from_raw(case.reach_raw + reach_delta));
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
    let mut hash = 0xcbf2_9ce4_8422_2325;
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
        let sharded = execute_corpus_sharded_with(&measure);
        assert_eq!(visits.load(Ordering::Relaxed), serial_visits);
        assert_eq!(sharded, serial);
        assert_eq!(strike_corpus_checksum(&sharded), strike_corpus_checksum(&serial));
        assert!(sharded.central_rows.windows(2)
            .all(|rows| (rows[0].case.ordinal, rows[0].mirrored)
                <= (rows[1].case.ordinal, rows[1].mirrored)));
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
        strong.observed_contact_region = Some(RegionVolume {
            lower: point, upper: point, radius: strong.requested_weapon.radius,
            present: true,
        });
        strong.energy_before_raw = 400;
        strong.energy_after_raw = 250;
        strong.energy_dissipated_raw = 150;
        strong.cut_raw = 100;
        strong.integrity_before_raw[BodyPart::Legs as usize] = Fx::ONE.raw();
        strong.integrity_after_raw[BodyPart::Legs as usize] = Fx::ONE.raw() - 1;
        (strong, measure(Fx::ZERO))
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
        uncrossed.observed_contact_region = uncrossed.observed_contact_region.map(|mut region| {
            region.lower.x += Fx::from_int(10); region.upper.x += Fx::from_int(10); region
        });
        assert!(!meaningful_strike_validity(uncrossed, held).passes());
        let mut active_control = held;
        active_control.energy_before_raw = 1;
        assert!(!meaningful_strike_validity(strong, active_control).passes());
        let mut refused = strong; refused.refusals = 1;
        assert!(!meaningful_strike_validity(refused, held).passes());
    }
}
