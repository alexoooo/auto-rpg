//! Matched strong-reference and tactical evidence.
//!
//! The strong row is the exact legal-command measurement in `strong_strike`.
//! The tactical row drives the same scenario through the ordinary policy seam.
//! This module owns comparison and reporting only; it owns neither controller.

use crate::{args::Args, strong_strike};
use fx::{swept_segment_segment, Fx};
use policy::{neutral_articulated_command, ArticulatedPolicy, TacticalArticulatedPolicy};
use sim::{
    AnatomyChoice, ArticulatedObservation, BodyPart, ContactKind, EntityId, Faction, LimbSlot, Outcome,
    SegmentPose, SubmitArticulatedOutcome, World,
};

const CALIBRATION_SEEDS: core::ops::Range<u64> = 0..25;
const CALIBRATION_CASES: usize = 900;
const HELD_OUT_SEEDS: core::ops::Range<u64> = 900_000..900_100;
const HELD_OUT_CASES: usize = 3_600;
// One worker owns all four runs in a matched cell. Four fixed shards match the
// existing evidence executor, while the large stacks keep a World off MSVC's
// 1 MiB main stack without making host core count part of the receipt.
const CALIBRATION_WORKERS: usize = 4;
const CALIBRATION_STACK_BYTES: usize = 16 * 1024 * 1024;

#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
struct Waterfall {
    commits: u32,
    crossings: u32,
    weapon_body_facts: u32,
    positive_closing: u32,
    dissipated_groups: u32,
    above_floor: u32,
    cut_or_thrust: u32,
    integrity_losses: u32,
    open_wounds: u32,
    body_decisions: u32,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
struct TacticalRow {
    scenario_fingerprint: u64,
    seed: u64,
    mirrored: bool,
    intended_region: Option<BodyPart>,
    intended_hand: Option<LimbSlot>,
    first_cross_tick: Option<u32>,
    first_contact_tick: Option<u32>,
    first_contact_cross_tick: Option<u32>,
    first_contact_region: Option<BodyPart>,
    first_contact_hand: Option<LimbSlot>,
    first_contact_attributed_facts: u32,
    first_contact_competing_facts: u32,
    first_contact_dissipated_raw: u64,
    first_contact_cut_or_thrust_raw: u64,
    first_contact_matching_integrity_loss_raw: i32,
    peak_tip_speed_raw: i32,
    peak_normal_closing_raw: i32,
    peak_energy_before_raw: u64,
    peak_dissipated_raw: u64,
    cut_raw: u64,
    thrust_raw: u64,
    pressure_raw: u64,
    integrity_loss_raw: [i32; BodyPart::COUNT],
    wound_gain_raw: [i32; BodyPart::COUNT],
    blood_loss_raw: i32,
    unattributed_anatomy_changes: u32,
    decision_tick: Option<u32>,
    outcome: Option<Outcome>,
    refusals: u32,
    solver_rejections: u32,
    cap_hits: u32,
    max_energy_excess_raw: u64,
    waterfall: Waterfall,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
struct RunLegality {
    refusals: u32,
    solver_rejections: u32,
    cap_hits: u32,
    max_energy_excess_raw: u64,
}

impl RunLegality {
    fn passes(self) -> bool {
        self.refusals == 0 && self.solver_rejections == 0 && self.cap_hits == 0
            && self.max_energy_excess_raw == 0
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
struct StructuralValidity {
    bracket_equal: bool,
    reference_unique: bool,
    reference_crossed: bool,
    held_inert: bool,
    held_legal: bool,
    reference_legal: bool,
    tactical_legal: bool,
}

impl StructuralValidity {
    fn passes(self) -> bool {
        self.bracket_equal && self.reference_unique && self.reference_crossed
            && self.held_inert && self.held_legal && self.reference_legal
            && self.tactical_legal
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
struct TacticalProductivity {
    unique_crossing_contact_with_dissipation: bool,
    cut_or_thrust_with_matching_integrity_loss: bool,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
struct FirstContactEvidence {
    tick: u32,
    cross_tick: Option<u32>,
    region: Option<BodyPart>,
    hand: Option<LimbSlot>,
    attributed_facts: u32,
    competing_facts: u32,
    dissipated_raw: u64,
    cut_or_thrust_raw: u64,
    matching_integrity_loss_raw: i32,
}

fn freeze_first_contact(
    frozen: &mut Option<FirstContactEvidence>, candidate: FirstContactEvidence,
) -> bool {
    if frozen.is_none() && candidate.attributed_facts > 0 {
        *frozen = Some(candidate); true
    } else { false }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
struct HeldControlEvidence {
    contact: bool, weapon_body_facts: u32, competing_facts: u32,
    energy_before_raw: u64, dissipated_raw: u64,
    cut_raw: u64, thrust_raw: u64, pressure_raw: u64,
    integrity_loss_raw: [i32; BodyPart::COUNT],
    wound_gain_raw: [i32; BodyPart::COUNT],
    blood_loss_raw: i32,
}

impl HeldControlEvidence {
    fn from_measurement(row: strong_strike::StrikeMeasurement) -> Self {
        Self { contact: row.contact_tick.is_some(), weapon_body_facts: row.weapon_body_facts,
            competing_facts: row.competing_facts, energy_before_raw: row.energy_before_raw,
            dissipated_raw: row.energy_dissipated_raw, cut_raw: row.cut_raw,
            thrust_raw: row.thrust_raw, pressure_raw: row.pressure_raw,
            integrity_loss_raw: core::array::from_fn(|at|
                row.integrity_before_raw[at] - row.integrity_after_raw[at]),
            wound_gain_raw: core::array::from_fn(|at|
                row.wound_after_raw[at] - row.wound_before_raw[at]),
            blood_loss_raw: row.blood_before_raw - row.blood_after_raw }
    }

    fn is_inert(self) -> bool {
        !self.contact && self.weapon_body_facts == 0 && self.competing_facts == 0
            && self.energy_before_raw == 0 && self.dissipated_raw == 0
            && self.cut_raw == 0 && self.thrust_raw == 0 && self.pressure_raw == 0
            && self.integrity_loss_raw == [0; BodyPart::COUNT]
            && self.wound_gain_raw == [0; BodyPart::COUNT] && self.blood_loss_raw == 0
    }
}

fn weapon(obs: &ArticulatedObservation, hand: Option<LimbSlot>) -> Option<SegmentPose> {
    hand.and_then(|slot| obs.weapons[slot as usize])
}

fn crosses(previous: SegmentPose, current: SegmentPose, region: sim::RegionVolume) -> bool {
    region.present && swept_segment_segment(
        previous.hilt, previous.tip, current.hilt, current.tip,
        previous.radius.max(current.radius), region.lower, region.upper,
        region.lower, region.upper, region.radius,
    ).is_some()
}

fn belongs_to(
    row: &sim::ContactResolution, attacker: EntityId, defender: EntityId,
    hand: LimbSlot, region: BodyPart,
) -> bool {
    // The volume becomes a region before the comparison, so a blow on a bent
    // forearm counts as the arm blow it is. `belongs_to_fields` takes the mapped
    // byte because its other caller builds one by hand from a `BodyPart`.
    belongs_to_fields(row.fact.key.kind,
        sim::volume_region(row.fact.volume as usize).map_or(sim::NO_VOLUME, |part| part as u8),
        row.fact.key.a,
        row.fact.key.a_slot, row.fact.key.b, row.fact.key.b_slot,
        attacker, defender, hand, region)
}

fn belongs_to_fields(
    kind: ContactKind, fact_region: u8, a: EntityId, a_slot: u8, b: EntityId, b_slot: u8,
    attacker: EntityId, defender: EntityId, hand: LimbSlot, region: BodyPart,
) -> bool {
    kind == ContactKind::WeaponBody && fact_region == region as u8
        && a == attacker && a_slot == hand as u8
        && b == defender && b_slot == sim::BODY_SLOT
}

fn strike_legality(row: strong_strike::StrikeMeasurement) -> RunLegality {
    RunLegality { refusals: row.refusals, solver_rejections: row.solver_rejections,
        cap_hits: row.cap_hits, max_energy_excess_raw: row.max_energy_excess_raw }
}

fn tactical_legality(row: &TacticalRow) -> RunLegality {
    RunLegality { refusals: row.refusals, solver_rejections: row.solver_rejections,
        cap_hits: row.cap_hits, max_energy_excess_raw: row.max_energy_excess_raw }
}

fn tactical_is_legal(row: &TacticalRow) -> bool {
    tactical_legality(row).passes() && row.unattributed_anatomy_changes == 0
        && match row.first_contact_tick {
            None => true,
            Some(contact) => row.first_contact_cross_tick.is_some_and(|cross| cross <= contact),
        }
}

fn structural_validity(
    before: strong_strike::StrikeMeasurement, held: strong_strike::StrikeMeasurement,
    tactical: &TacticalRow, after: strong_strike::StrikeMeasurement,
) -> StructuralValidity {
    let reference = strong_strike::meaningful_strike_validity(before, held);
    structural_from_fields(before == after, before.contact_tick.is_some()
            && before.weapon_body_facts == 1 && before.competing_facts == 0,
        reference.swept_crossing, HeldControlEvidence::from_measurement(held).is_inert(),
        strike_legality(held), strike_legality(before), tactical)
}

fn structural_from_fields(
    bracket_equal: bool, reference_unique: bool, reference_crossed: bool,
    held_inert: bool, held: RunLegality, reference: RunLegality, tactical: &TacticalRow,
) -> StructuralValidity {
    StructuralValidity { bracket_equal, reference_unique, reference_crossed, held_inert,
        held_legal: held.passes(), reference_legal: reference.passes(),
        tactical_legal: tactical_is_legal(tactical) }
}

fn productivity_passes_denominator(cases: u32, crossing: u32, damage: u32) -> bool {
    cases != 0 && crossing * 100 >= cases * 95 && damage * 100 >= cases * 90
}

fn tactical_productivity(row: &TacticalRow) -> TacticalProductivity {
    let crossing_precedes_contact = match row.first_contact_tick {
        Some(contact) => row.first_contact_cross_tick.is_some_and(|cross| cross <= contact),
        None => false,
    };
    TacticalProductivity {
        unique_crossing_contact_with_dissipation: crossing_precedes_contact
            && row.first_contact_attributed_facts == 1
            && row.first_contact_competing_facts == 0
            && row.first_contact_dissipated_raw > 0,
        cut_or_thrust_with_matching_integrity_loss:
            row.first_contact_cut_or_thrust_raw > 0
                && row.first_contact_matching_integrity_loss_raw > 0,
    }
}

fn normal_closing(row: &sim::ContactResolution) -> Fx {
    (-(row.fact.velocity_b - row.fact.velocity_a).dot(row.fact.normal)).max(Fx::ZERO)
}

fn measure_tactical(case: strong_strike::StrongCase) -> TacticalRow {
    let scenario = strong_strike::scenario_for(case);
    let fingerprint = scenario.fingerprint();
    let mut world = World::new(&scenario, case.seed);
    let attacker = world.alive_ids(Faction::Heroes)[0];
    let defender = world.alive_ids(Faction::Monsters)[0];
    let mut policy = TacticalArticulatedPolicy::default();
    let mut intended_region = None;
    let mut intended_hand = None;
    let mut was_committed = false;
    let mut previous_weapon = None;
    let mut first_cross_tick = None;
    let mut first_contact = None;
    let mut crossing_ticks = [None; BodyPart::COUNT * 2];
    let mut peak_tip_speed_raw = 0;
    let mut peak_normal_closing_raw = 0;
    let mut peak_energy_before_raw = 0;
    let mut peak_dissipated_raw = 0;
    let mut cut_raw = 0u64;
    let mut thrust_raw = 0u64;
    let mut pressure_raw = 0u64;
    let mut integrity_loss_raw = [0; BodyPart::COUNT];
    let mut wound_gain_raw = [0; BodyPart::COUNT];
    let mut blood_loss_raw = 0;
    let mut unattributed_anatomy_changes = 0;
    let mut refusals = 0;
    let mut max_energy_excess_raw = 0;
    let mut waterfall = Waterfall {
        commits: 0, crossings: 0, weapon_body_facts: 0, positive_closing: 0,
        dissipated_groups: 0, above_floor: 0, cut_or_thrust: 0,
        integrity_losses: 0, open_wounds: 0, body_decisions: 0,
    };

    while world.outcome().is_none() && world.tick() < scenario.max_ticks {
        let attacker_before = world.observe_articulated(attacker);
        let defender_before = world.observe_articulated(defender);
        for id in world.pending_decisions().to_vec() {
            let obs = world.observe_articulated(id);
            let command = if id == attacker {
                let command = policy.decide(&obs);
                let diagnostics = policy.diagnostics();
                intended_region = diagnostics.context.plan.map(|plan| plan.region).or(intended_region);
                intended_hand = diagnostics.context.plan.map(|plan| plan.hand).or(intended_hand);
                if diagnostics.committed && !was_committed { waterfall.commits += 1; }
                was_committed = diagnostics.committed;
                command
            } else {
                neutral_articulated_command(&obs)
            };
            match world.submit_articulated_v1(id, command) {
                SubmitArticulatedOutcome::Stored { rejection, .. } => refusals += u32::from(rejection.is_some()),
                SubmitArticulatedOutcome::NotStored(_) => refusals += 1,
            }
        }
        let before = weapon(&attacker_before, intended_hand);
        let _ = world.step();
        let attacker_after = world.observe_articulated(attacker);
        let defender_after = world.observe_articulated(defender);
        let after = weapon(&attacker_after, intended_hand);
        if was_committed {
            if let (Some(previous), Some(current), Some(region)) = (
                before.or(previous_weapon), after,
                intended_region.and_then(|part| attacker_before.opponents().first()
                    .map(|foe| foe.regions[part as usize])),
            ) {
                peak_tip_speed_raw = peak_tip_speed_raw.max((current.tip - previous.tip).length().raw());
                if crosses(previous, current, region) {
                    if first_cross_tick.is_none() { first_cross_tick = Some(world.tick()); }
                    if let (Some(hand), Some(part)) = (intended_hand, intended_region) {
                        let crossing = &mut crossing_ticks[
                            hand as usize * BodyPart::COUNT + part as usize];
                        if crossing.is_none() {
                            *crossing = Some(world.tick()); waterfall.crossings += 1;
                        }
                    }
                }
            }
        }
        previous_weapon = after;

        let mut matching_cut_or_thrust = false;
        let attributed_on_tick = match (intended_hand, intended_region) {
            (Some(hand), Some(region)) if was_committed => world.contact_resolutions().iter()
                .filter(|row| belongs_to(row, attacker, defender, hand, region)).count() as u32,
            _ => 0,
        };
        let mut contact_this_tick = None;
        if first_contact.is_none() && attributed_on_tick > 0 {
            let mut candidate = FirstContactEvidence { tick: world.tick(),
                region: intended_region, hand: intended_hand,
                attributed_facts: attributed_on_tick,
                competing_facts: world.contact_resolutions().len() as u32 - attributed_on_tick,
                ..FirstContactEvidence::default() };
            if let (Some(hand), Some(region)) = (intended_hand, intended_region) {
                candidate.cross_tick = crossing_ticks[
                    hand as usize * BodyPart::COUNT + region as usize];
                for row in world.contact_resolutions().iter()
                    .filter(|row| belongs_to(row, attacker, defender, hand, region)) {
                    candidate.dissipated_raw = candidate.dissipated_raw
                        .saturating_add(row.energy.dissipated_raw);
                    candidate.cut_or_thrust_raw = candidate.cut_or_thrust_raw
                        .saturating_add(row.cut_raw).saturating_add(row.thrust_raw);
                }
            }
            contact_this_tick = Some(candidate);
        }
        for row in world.contact_resolutions() {
            max_energy_excess_raw = max_energy_excess_raw.max(
                row.energy.after_raw.saturating_sub(row.energy.before_raw));
            let (Some(hand), Some(region)) = (intended_hand, intended_region) else { continue };
            if !was_committed || !belongs_to(row, attacker, defender, hand, region) { continue; }
            waterfall.weapon_body_facts += 1;
            let closing = normal_closing(row);
            peak_normal_closing_raw = peak_normal_closing_raw.max(closing.raw());
            waterfall.positive_closing += u32::from(closing.is_positive());
            peak_energy_before_raw = peak_energy_before_raw.max(row.energy.before_raw);
            peak_dissipated_raw = peak_dissipated_raw.max(row.energy.dissipated_raw);
            waterfall.dissipated_groups += u32::from(row.energy.dissipated_raw > 0);
            // ContactResolution does not publish the pre-floor allocated share.
            // A positive channel sum is the first observable post-floor stage.
            let channels = row.cut_raw + row.thrust_raw + row.crush_raw + row.pressure_raw;
            waterfall.above_floor += u32::from(channels > 0);
            // Crush joins the wounding count because it *is* one: it reaches
            // anatomy through the same `incoming` the other two do. Leaving it
            // out would report every club blow as having converted nothing.
            waterfall.cut_or_thrust +=
                u32::from(row.cut_raw + row.thrust_raw + row.crush_raw > 0);
            matching_cut_or_thrust |= row.cut_raw + row.thrust_raw + row.crush_raw > 0;
            cut_raw += row.cut_raw; thrust_raw += row.thrust_raw; pressure_raw += row.pressure_raw;
        }
        for part in BodyPart::ALL {
            let at = part as usize;
            let attributed = intended_region == Some(part) && matching_cut_or_thrust;
            let loss = (defender_before.integrity_fraction[at]
                - defender_after.integrity_fraction[at]).raw().max(0);
            let gain = (defender_after.wound_fraction[at]
                - defender_before.wound_fraction[at]).raw().max(0);
            integrity_loss_raw[at] += loss;
            wound_gain_raw[at] += gain;
            if loss > 0 {
                if attributed { waterfall.integrity_losses += 1; }
                else { unattributed_anatomy_changes += 1; }
            }
            if contact_this_tick.is_some_and(|contact| contact.region == Some(part)) {
                contact_this_tick.as_mut().unwrap().matching_integrity_loss_raw = loss;
            }
            if gain > 0 {
                if attributed { waterfall.open_wounds += 1; }
                else { unattributed_anatomy_changes += 1; }
            }
        }
        blood_loss_raw += (defender_before.blood_fraction
            - defender_after.blood_fraction).raw().max(0);
        if let Some(contact) = contact_this_tick {
            let _ = freeze_first_contact(&mut first_contact, contact);
        }
    }
    waterfall.body_decisions = u32::from(world.outcome().is_some() && world.tick() < scenario.max_ticks);
    let contact = first_contact.unwrap_or_default();
    TacticalRow {
        scenario_fingerprint: fingerprint, seed: case.seed, mirrored: case.mirrored, intended_region,
        intended_hand, first_cross_tick,
        first_contact_tick: first_contact.map(|_| contact.tick),
        first_contact_cross_tick: contact.cross_tick,
        first_contact_region: contact.region, first_contact_hand: contact.hand,
        peak_tip_speed_raw, first_contact_attributed_facts: contact.attributed_facts,
        first_contact_competing_facts: contact.competing_facts,
        first_contact_dissipated_raw: contact.dissipated_raw,
        first_contact_cut_or_thrust_raw: contact.cut_or_thrust_raw,
        first_contact_matching_integrity_loss_raw: contact.matching_integrity_loss_raw,
        peak_normal_closing_raw, peak_energy_before_raw, peak_dissipated_raw,
        cut_raw, thrust_raw, pressure_raw, integrity_loss_raw, wound_gain_raw, blood_loss_raw,
        unattributed_anatomy_changes,
        decision_tick: world.outcome().map(|_| world.tick()), outcome: world.outcome(),
        refusals, solver_rejections: world.contact_solver_rejections(),
        cap_hits: world.contact_cap_hits(),
        max_energy_excess_raw,
        waterfall,
    }
}

fn print_reference(name: &str, row: strong_strike::StrikeMeasurement) {
    println!("reference,{name},contact={},tip_speed_raw={},energy_before_raw={},dissipated_raw={},cut_raw={},thrust_raw={},pressure_raw={},integrity_delta_raw={:?},wound_delta_raw={:?}",
        row.contact_tick.is_some(), row.tip_delta.length().raw(),
        row.energy_before_raw, row.energy_dissipated_raw, row.cut_raw, row.thrust_raw,
        row.pressure_raw,
        core::array::from_fn::<_, { BodyPart::COUNT }, _>(|i| row.integrity_before_raw[i] - row.integrity_after_raw[i]),
        core::array::from_fn::<_, { BodyPart::COUNT }, _>(|i| row.wound_after_raw[i] - row.wound_before_raw[i]));
}

const TACTICAL_MODES: [&str; 11] = [
    "quick", "calibration", "held-out", "strike-corpus",
    "anatomical-mirror-corpus", "noise-free-mirror-corpus", "mirror-trace-1536",
    "ordinal-31-provenance", "ordinal-31-tick-46-scan",
    "ordinal-31-tick-46-pair-aabb",
    "ordinal-31-tick-46-segment-hilt-start-x",
];

fn ordinal_31_tick_46_segment_hilt_start_x_refusal(args: &Args) -> Option<String> {
    const MODE: &str = "ordinal-31-tick-46-segment-hilt-start-x";
    if args.positionals().len() != 1 || args.command() != "tactical-mechanics" {
        let offending = args.positionals().get(1).map(String::as_str).unwrap_or("positional input");
        return Some(format!("tactical-mechanics --{MODE} refuses {offending}"));
    }
    let flags = args.flags().iter().filter(|key| key.as_str() == MODE).count();
    if args.pairs().iter().any(|(key, _)| key == MODE) {
        return Some(format!("tactical-mechanics --{MODE} is a flag and accepts no value"));
    }
    if flags != 1 { return Some(format!("tactical-mechanics --{MODE} must be named exactly once")); }
    if let Some(key) = args.flags().iter().find(|key| key.as_str() != MODE) {
        if key == "write" { return Some(format!("tactical-mechanics --{MODE} --write requires PATH")); }
        return Some(format!("tactical-mechanics --{MODE} refuses --{key}"));
    }
    if let Some((key, _)) = args.pairs().iter().find(|(key, _)| key != "write") {
        return Some(format!("tactical-mechanics --{MODE} refuses --{key}"));
    }
    let writes: Vec<_> = args.pairs().iter().filter(|(key, _)| key == "write")
        .map(|(_, value)| value.as_str()).collect();
    if writes.len() != 1 || writes[0].is_empty() {
        return Some(format!("tactical-mechanics --{MODE} requires exactly one --write PATH"));
    }
    None
}

#[cfg(feature = "cartesian-recoil")]
fn write_ordinal_31_tick_46_segment_hilt_start_x(path: &str, bytes: &[u8])
    -> Result<(), String> {
    #[cfg(test)]
    { return write_ordinal_31_tick_46_segment_hilt_start_x_with(path, bytes, None); }
    #[cfg(not(test))]
    { write_ordinal_31_tick_46_segment_hilt_start_x_with(path, bytes) }
}

#[cfg(test)]
#[derive(Clone, Copy, PartialEq, Eq)]
enum PointXWriteFailure { Open, Write, Flush, DestinationAppeared, Rename }

#[cfg(feature = "cartesian-recoil")]
fn write_ordinal_31_tick_46_segment_hilt_start_x_with(path: &str, bytes: &[u8],
    #[cfg(test)] failure: Option<PointXWriteFailure>) -> Result<(), String> {
    use std::io::Write;
    const MODE: &str = "ordinal-31-tick-46-segment-hilt-start-x";
    let destination = std::path::Path::new(path);
    let temporary = std::path::PathBuf::from(format!("{path}.tmp"));
    if destination.exists() { return Err(format!("tactical-mechanics --{MODE} refuses existing destination {path}")); }
    if temporary.exists() { return Err(format!("tactical-mechanics --{MODE} refuses existing temporary {}", temporary.display())); }
    let mut created = false;
    let result = (|| -> std::io::Result<()> {
        #[cfg(test)] if failure == Some(PointXWriteFailure::Open) {
            return Err(std::io::Error::other("injected open failure")); }
        let mut file = std::fs::OpenOptions::new().write(true).create_new(true).open(&temporary)?;
        created = true;
        #[cfg(test)] if failure == Some(PointXWriteFailure::Write) {
            return Err(std::io::Error::other("injected write failure")); }
        file.write_all(bytes)?;
        #[cfg(test)] if failure == Some(PointXWriteFailure::Flush) {
            return Err(std::io::Error::other("injected flush failure")); }
        file.flush()?; drop(file);
        if destination.exists() { return Err(std::io::Error::new(
            std::io::ErrorKind::AlreadyExists, "destination appeared before publication")); }
        #[cfg(test)] if failure == Some(PointXWriteFailure::DestinationAppeared) {
            std::fs::write(destination, b"external-sentinel")?; }
        if destination.exists() { return Err(std::io::Error::new(
            std::io::ErrorKind::AlreadyExists, "destination appeared before publication")); }
        #[cfg(test)] if failure == Some(PointXWriteFailure::Rename) {
            return Err(std::io::Error::other("injected rename failure")); }
        std::fs::rename(&temporary, destination)
    })();
    if let Err(error) = result {
        if created { let _ = std::fs::remove_file(&temporary); }
        return Err(format!("tactical-mechanics --{MODE} could not publish {path}: {error}; no artifact was written"));
    }
    Ok(())
}

pub(crate) fn ordinal_31_tick_46_segment_hilt_start_x_requested(args: &Args) -> bool {
    args.flag("ordinal-31-tick-46-segment-hilt-start-x")
        || args.text("ordinal-31-tick-46-segment-hilt-start-x").is_some()
}

pub(crate) fn ordinal_31_tick_46_segment_hilt_start_x_mode(args: &Args) -> Result<(), String> {
    #[cfg(test)]
    { return ordinal_31_tick_46_segment_hilt_start_x_mode_with(args, None); }
    #[cfg(not(test))]
    { ordinal_31_tick_46_segment_hilt_start_x_mode_with(args) }
}

#[cfg(test)]
#[derive(Clone, Copy, PartialEq, Eq)]
enum PointXWorkerFailure { Start, Panic }

fn ordinal_31_tick_46_segment_hilt_start_x_mode_with(args: &Args,
    #[cfg(test)] worker_failure: Option<PointXWorkerFailure>) -> Result<(), String> {
    const MODE: &str = "ordinal-31-tick-46-segment-hilt-start-x";
    if let Some(refusal) = ordinal_31_tick_46_segment_hilt_start_x_refusal(args) { return Err(refusal); }
    #[cfg(not(feature = "cartesian-recoil"))]
    { return Err(format!("tactical-mechanics --{MODE} requires --features cartesian-recoil; no artifact was written")); }
    #[cfg(feature = "cartesian-recoil")]
    {
        let path = args.text("write").expect("validated write path");
        #[cfg(test)]
        if worker_failure == Some(PointXWorkerFailure::Start) {
            return Err(format!("tactical-mechanics --{MODE} worker start failed: injected; no artifact was written"));
        }
        let worker = std::thread::Builder::new()
            .name(strong_strike::SMART133_WORKER_NAME.into())
            .stack_size(strong_strike::SMART133_STACK_BYTES)
            .spawn(move || {
                #[cfg(test)]
                if worker_failure == Some(PointXWorkerFailure::Panic) { panic!("injected worker panic"); }
                strong_strike::ordinal_31_tick_46_segment_hilt_start_x_artifact()
            })
            .map_err(|error| format!("tactical-mechanics --{MODE} worker start failed: {error}; no artifact was written"))?;
        let artifact = match worker.join() {
            Ok(Ok(artifact)) => artifact,
            Ok(Err(error)) => return Err(format!("tactical-mechanics --{MODE} verification failed: {error}; no artifact was written")),
            Err(_) => return Err(format!("tactical-mechanics --{MODE} worker panicked; no artifact was written")),
        };
        write_ordinal_31_tick_46_segment_hilt_start_x(path, artifact.as_bytes())
    }
}

fn ordinal_31_tick_46_pair_aabb_refusal(args: &Args) -> Option<String> {
    const MODE: &str = "ordinal-31-tick-46-pair-aabb";
    if args.positionals().len() != 1 || args.command() != "tactical-mechanics" {
        let offending = args.positionals().get(1).map(String::as_str).unwrap_or("positional input");
        return Some(format!("tactical-mechanics --{MODE} refuses {offending}"));
    }
    let mode_flags = args.flags().iter().filter(|key| key.as_str() == MODE).count();
    let mode_pairs = args.pairs().iter().filter(|(key, _)| key == MODE).count();
    if mode_pairs != 0 {
        return Some(format!("tactical-mechanics --{MODE} is a flag and accepts no value"));
    }
    if mode_flags != 1 {
        return Some(format!("tactical-mechanics --{MODE} must be named exactly once"));
    }
    if let Some(key) = args.flags().iter().find(|key| key.as_str() != MODE) {
        if key == "write" { return Some(format!("tactical-mechanics --{MODE} --write requires PATH")); }
        return Some(format!("tactical-mechanics --{MODE} refuses --{key}"));
    }
    if let Some((key, _)) = args.pairs().iter().find(|(key, _)| key != "write") {
        return Some(format!("tactical-mechanics --{MODE} refuses --{key}"));
    }
    let writes: Vec<&str> = args.pairs().iter().filter(|(key, _)| key == "write")
        .map(|(_, value)| value.as_str()).collect();
    if writes.len() != 1 || writes[0].is_empty() {
        return Some(format!("tactical-mechanics --{MODE} requires exactly one --write PATH"));
    }
    None
}

#[cfg(feature = "cartesian-recoil")]
fn write_ordinal_31_tick_46_pair_aabb(path: &str, bytes: &[u8]) -> Result<(), String> {
    #[cfg(test)]
    { return write_ordinal_31_tick_46_pair_aabb_with(path, bytes, None); }
    #[cfg(not(test))]
    { write_ordinal_31_tick_46_pair_aabb_with(path, bytes) }
}

#[cfg(all(feature = "cartesian-recoil", test))]
#[derive(Clone, Copy, PartialEq, Eq)]
enum PairAabbWriteFailure { Open, Write, Flush, DestinationAppeared, Rename }

#[cfg(feature = "cartesian-recoil")]
fn write_ordinal_31_tick_46_pair_aabb_with(path: &str, bytes: &[u8],
    #[cfg(test)] failure: Option<PairAabbWriteFailure>) -> Result<(), String>
{
    use std::io::Write;
    const MODE: &str = "ordinal-31-tick-46-pair-aabb";
    let destination = std::path::Path::new(path);
    let temporary = std::path::PathBuf::from(format!("{path}.tmp"));
    if destination.exists() {
        return Err(format!("tactical-mechanics --{MODE} refuses existing destination {path}"));
    }
    if temporary.exists() {
        return Err(format!("tactical-mechanics --{MODE} refuses existing temporary {}",
            temporary.display()));
    }
    let mut created_temporary = false;
    let result = (|| -> std::io::Result<()> {
        #[cfg(test)]
        if failure == Some(PairAabbWriteFailure::Open) {
            return Err(std::io::Error::other("injected open failure"));
        }
        let mut file = std::fs::OpenOptions::new().write(true).create_new(true).open(&temporary)?;
        created_temporary = true;
        #[cfg(test)]
        if failure == Some(PairAabbWriteFailure::Write) {
            return Err(std::io::Error::other("injected write failure"));
        }
        file.write_all(bytes)?;
        #[cfg(test)]
        if failure == Some(PairAabbWriteFailure::Flush) {
            return Err(std::io::Error::other("injected flush failure"));
        }
        file.flush()?; drop(file);
        #[cfg(test)]
        if failure == Some(PairAabbWriteFailure::DestinationAppeared) {
            std::fs::write(destination, b"external-sentinel")?;
        }
        if destination.exists() {
            return Err(std::io::Error::new(std::io::ErrorKind::AlreadyExists,
                "destination appeared before publication"));
        }
        #[cfg(test)]
        if failure == Some(PairAabbWriteFailure::Rename) {
            return Err(std::io::Error::other("injected rename failure"));
        }
        std::fs::rename(&temporary, destination)
    })();
    if let Err(error) = result {
        if created_temporary { let _ = std::fs::remove_file(&temporary); }
        return Err(format!("tactical-mechanics --{MODE} could not publish {path}: {error}; no artifact was written"));
    }
    Ok(())
}

pub(crate) fn ordinal_31_tick_46_pair_aabb_requested(args: &Args) -> bool {
    args.flag("ordinal-31-tick-46-pair-aabb")
        || args.text("ordinal-31-tick-46-pair-aabb").is_some()
}

pub(crate) fn ordinal_31_tick_46_pair_aabb_mode(args: &Args) -> Result<(), String> {
    const MODE: &str = "ordinal-31-tick-46-pair-aabb";
    if let Some(refusal) = ordinal_31_tick_46_pair_aabb_refusal(args) { return Err(refusal); }
    #[cfg(not(feature = "cartesian-recoil"))]
    { return Err(format!("tactical-mechanics --{MODE} requires --features cartesian-recoil; no artifact was written")); }
    #[cfg(feature = "cartesian-recoil")]
    {
        let path = args.text("write").expect("validated write path");
        let worker = std::thread::Builder::new()
            .name(strong_strike::SMART132_WORKER_NAME.into())
            .stack_size(strong_strike::SMART132_STACK_BYTES)
            .spawn(strong_strike::ordinal_31_tick_46_pair_aabb_artifact)
            .map_err(|error| format!("tactical-mechanics --{MODE} worker start failed: {error}; no artifact was written"))?;
        let artifact = match worker.join() {
            Ok(Ok(artifact)) => artifact,
            Ok(Err(error)) => return Err(format!("tactical-mechanics --{MODE} verification failed: {error}; no artifact was written")),
            Err(_) => return Err(format!("tactical-mechanics --{MODE} worker panicked; no artifact was written")),
        };
        write_ordinal_31_tick_46_pair_aabb(path, artifact.as_bytes())
    }
}

fn ordinal_31_tick_46_scan_refusal(args: &Args) -> Option<String> {
    const MODE: &str = "ordinal-31-tick-46-scan";
    if args.positionals().len() != 1 || args.command() != "tactical-mechanics" {
        let offending = args.positionals().get(1).map(String::as_str).unwrap_or("positional input");
        return Some(format!("tactical-mechanics --{MODE} refuses {offending}"));
    }
    let mode_flags = args.flags().iter().filter(|key| key.as_str() == MODE).count();
    let mode_pairs = args.pairs().iter().filter(|(key, _)| key == MODE).count();
    if mode_pairs != 0 {
        return Some(format!("tactical-mechanics --{MODE} is a flag and accepts no value"));
    }
    if mode_flags != 1 {
        return Some(format!("tactical-mechanics --{MODE} must be named exactly once"));
    }
    if let Some(key) = args.flags().iter().find(|key| key.as_str() != MODE) {
        if key == "write" {
            return Some(format!("tactical-mechanics --{MODE} --write requires PATH"));
        }
        return Some(format!("tactical-mechanics --{MODE} refuses --{key}"));
    }
    if let Some((key, _)) = args.pairs().iter().find(|(key, _)| key != "write") {
        return Some(format!("tactical-mechanics --{MODE} refuses --{key}"));
    }
    let writes: Vec<&str> = args.pairs().iter().filter(|(key, _)| key == "write")
        .map(|(_, value)| value.as_str()).collect();
    if writes.len() != 1 || writes[0].is_empty() {
        return Some(format!("tactical-mechanics --{MODE} requires exactly one --write PATH"));
    }
    None
}

#[cfg(feature = "cartesian-recoil")]
fn write_ordinal_31_tick_46_scan(path: &str, bytes: &[u8]) -> Result<(), String> {
    #[cfg(test)]
    { return write_ordinal_31_tick_46_scan_with(path, bytes, None); }
    #[cfg(not(test))]
    { write_ordinal_31_tick_46_scan_with(path, bytes) }
}

#[cfg(all(feature = "cartesian-recoil", test))]
#[derive(Clone, Copy, PartialEq, Eq)]
enum ScanWriteFailure { Open, Write, Flush, Rename }

#[cfg(feature = "cartesian-recoil")]
fn write_ordinal_31_tick_46_scan_with(path: &str, bytes: &[u8],
    #[cfg(test)] failure: Option<ScanWriteFailure>) -> Result<(), String>
{
    use std::io::Write;
    const MODE: &str = "ordinal-31-tick-46-scan";
    let destination = std::path::Path::new(path);
    let temporary = std::path::PathBuf::from(format!("{path}.tmp"));
    if destination.exists() {
        return Err(format!("tactical-mechanics --{MODE} refuses existing destination {path}"));
    }
    if temporary.exists() {
        return Err(format!("tactical-mechanics --{MODE} refuses existing temporary {}",
            temporary.display()));
    }
    let mut created_temporary = false;
    let result = (|| -> std::io::Result<()> {
        #[cfg(test)]
        if failure == Some(ScanWriteFailure::Open) {
            return Err(std::io::Error::other("injected open failure"));
        }
        let mut file = std::fs::OpenOptions::new().write(true).create_new(true).open(&temporary)?;
        created_temporary = true;
        #[cfg(test)]
        if failure == Some(ScanWriteFailure::Write) {
            return Err(std::io::Error::other("injected write failure"));
        }
        file.write_all(bytes)?;
        #[cfg(test)]
        if failure == Some(ScanWriteFailure::Flush) {
            return Err(std::io::Error::other("injected flush failure"));
        }
        file.flush()?;
        drop(file);
        if destination.exists() {
            return Err(std::io::Error::new(std::io::ErrorKind::AlreadyExists,
                "destination appeared before publication"));
        }
        #[cfg(test)]
        if failure == Some(ScanWriteFailure::Rename) {
            return Err(std::io::Error::other("injected rename failure"));
        }
        std::fs::rename(&temporary, destination)
    })();
    if let Err(error) = result {
        if created_temporary { let _ = std::fs::remove_file(&temporary); }
        return Err(format!("tactical-mechanics --{MODE} could not publish {path}: {error}; no artifact was written"));
    }
    Ok(())
}

pub(crate) fn ordinal_31_tick_46_scan_requested(args: &Args) -> bool {
    args.flag("ordinal-31-tick-46-scan") || args.text("ordinal-31-tick-46-scan").is_some()
}

pub(crate) fn ordinal_31_tick_46_scan_mode(args: &Args) -> Result<(), String> {
    const MODE: &str = "ordinal-31-tick-46-scan";
    if let Some(refusal) = ordinal_31_tick_46_scan_refusal(args) {
        return Err(refusal);
    }
    #[cfg(not(feature = "cartesian-recoil"))]
    {
        return Err(format!("tactical-mechanics --{MODE} requires --features cartesian-recoil; no artifact was written"));
    }
    #[cfg(feature = "cartesian-recoil")]
    {
        let path = args.text("write").expect("validated write path");
        let worker = match std::thread::Builder::new()
            .name(strong_strike::SMART131_WORKER_NAME.into())
            .stack_size(strong_strike::SMART131_STACK_BYTES)
            .spawn(strong_strike::ordinal_31_tick_46_scan_artifact)
        {
            Ok(worker) => worker,
            Err(error) => {
                return Err(format!("tactical-mechanics --{MODE} worker start failed: {error}; no artifact was written"));
            }
        };
        let artifact = match worker.join() {
            Ok(Ok(artifact)) => artifact,
            Ok(Err(error)) => {
                return Err(format!("tactical-mechanics --{MODE} verification failed: {error}; no artifact was written"));
            }
            Err(_) => {
                return Err(format!("tactical-mechanics --{MODE} worker panicked; no artifact was written"));
            }
        };
        write_ordinal_31_tick_46_scan(path, artifact.as_bytes())
    }
}

fn ordinal_31_provenance_refusal(args: &Args) -> Option<String> {
    if args.positionals().len() != 1 || args.command() != "tactical-mechanics" {
        let offending = args.positionals().get(1).map(String::as_str).unwrap_or("positional input");
        return Some(format!("tactical-mechanics --ordinal-31-provenance refuses {offending}"));
    }
    let mode_flags = args.flags().iter().filter(|key| key.as_str() == "ordinal-31-provenance").count();
    let mode_pairs = args.pairs().iter().filter(|(key, _)| key == "ordinal-31-provenance").count();
    if mode_pairs != 0 {
        return Some("tactical-mechanics --ordinal-31-provenance is a flag and accepts no value".into());
    }
    if mode_flags != 1 {
        return Some("tactical-mechanics --ordinal-31-provenance must be named exactly once".into());
    }
    if let Some(key) = args.flags().iter().find(|key| key.as_str() != "ordinal-31-provenance") {
        if key == "write" {
            return Some("tactical-mechanics --ordinal-31-provenance --write requires PATH".into());
        }
        return Some(format!("tactical-mechanics --ordinal-31-provenance refuses --{key}"));
    }
    if let Some((key, _)) = args.pairs().iter().find(|(key, _)| key != "write") {
        return Some(format!("tactical-mechanics --ordinal-31-provenance refuses --{key}"));
    }
    let writes: Vec<&str> = args.pairs().iter().filter(|(key, _)| key == "write")
        .map(|(_, value)| value.as_str()).collect();
    if writes.len() != 1 || writes[0].is_empty() {
        return Some("tactical-mechanics --ordinal-31-provenance requires exactly one --write PATH".into());
    }
    None
}

#[cfg(feature = "cartesian-recoil")]
fn write_ordinal_31_provenance(path: &str, bytes: &[u8]) -> Result<(), String> {
    #[cfg(test)]
    { return write_ordinal_31_provenance_with(path, bytes, None); }
    #[cfg(not(test))]
    { write_ordinal_31_provenance_with(path, bytes) }
}

#[cfg(all(feature = "cartesian-recoil", test))]
#[derive(Clone, Copy, PartialEq, Eq)]
enum ProvenanceWriteFailure { Open, Write, Flush, Rename }

#[cfg(feature = "cartesian-recoil")]
fn write_ordinal_31_provenance_with(path: &str, bytes: &[u8],
    #[cfg(test)] failure: Option<ProvenanceWriteFailure>) -> Result<(), String>
{
    use std::io::Write;
    let destination = std::path::Path::new(path);
    let temporary = std::path::PathBuf::from(format!("{path}.tmp"));
    if destination.exists() {
        return Err(format!("tactical-mechanics --ordinal-31-provenance refuses existing destination {path}"));
    }
    if temporary.exists() {
        return Err(format!("tactical-mechanics --ordinal-31-provenance refuses existing temporary {}",
            temporary.display()));
    }
    let mut created_temporary = false;
    let result = (|| -> std::io::Result<()> {
        #[cfg(test)]
        if failure == Some(ProvenanceWriteFailure::Open) {
            return Err(std::io::Error::other("injected open failure"));
        }
        let mut file = std::fs::OpenOptions::new().write(true).create_new(true).open(&temporary)?;
        created_temporary = true;
        #[cfg(test)]
        if failure == Some(ProvenanceWriteFailure::Write) {
            return Err(std::io::Error::other("injected write failure"));
        }
        file.write_all(bytes)?;
        #[cfg(test)]
        if failure == Some(ProvenanceWriteFailure::Flush) {
            return Err(std::io::Error::other("injected flush failure"));
        }
        file.flush()?;
        drop(file);
        if destination.exists() {
            return Err(std::io::Error::new(std::io::ErrorKind::AlreadyExists,
                "destination appeared before publication"));
        }
        #[cfg(test)]
        if failure == Some(ProvenanceWriteFailure::Rename) {
            return Err(std::io::Error::other("injected rename failure"));
        }
        std::fs::rename(&temporary, destination)
    })();
    if let Err(error) = result {
        if created_temporary { let _ = std::fs::remove_file(&temporary); }
        return Err(format!("tactical-mechanics --ordinal-31-provenance could not publish {path}: {error}; no artifact was written"));
    }
    Ok(())
}

pub(crate) fn ordinal_31_provenance_requested(args: &Args) -> bool {
    args.flag("ordinal-31-provenance") || args.text("ordinal-31-provenance").is_some()
}

pub(crate) fn ordinal_31_provenance_mode(args: &Args) -> Result<(), String> {
    if let Some(refusal) = ordinal_31_provenance_refusal(args) {
        return Err(refusal);
    }
    #[cfg(not(feature = "cartesian-recoil"))]
    {
        return Err("tactical-mechanics --ordinal-31-provenance requires --features cartesian-recoil; no artifact was written".into());
    }
    #[cfg(feature = "cartesian-recoil")]
    {
        let path = args.text("write").expect("validated write path");
        let worker = match std::thread::Builder::new()
            .name(strong_strike::ORDINAL_31_WORKER_NAME.into())
            .stack_size(strong_strike::ORDINAL_31_STACK_BYTES)
            .spawn(strong_strike::ordinal_31_provenance_artifact)
        {
            Ok(worker) => worker,
            Err(error) => {
                return Err(format!("tactical-mechanics --ordinal-31-provenance worker start failed: {error}; no artifact was written"));
            }
        };
        let artifact = match worker.join() {
            Ok(Ok(artifact)) => artifact,
            Ok(Err(error)) => {
                return Err(format!("tactical-mechanics --ordinal-31-provenance verification failed: {error}; no artifact was written"));
            }
            Err(_) => {
                return Err("tactical-mechanics --ordinal-31-provenance worker panicked; no artifact was written".into());
            }
        };
        write_ordinal_31_provenance(path, artifact.as_bytes())?;
        Ok(())
    }
}

fn incompatible_mode_refusal(args: &Args) -> Option<String> {
    if args.flag("threads") || args.text("threads").is_some() {
        return Some("tactical-mechanics --threads is refused; worker count is fixed at 4"
            .to_string());
    }
    for key in ["write", "summary-write"] {
        if args.flag(key) {
            return Some(format!("tactical-mechanics --{key} requires PATH"));
        }
    }
    let selected: Vec<&str> = TACTICAL_MODES.into_iter()
        .filter(|mode| args.flag(mode)).collect();
    if selected.len() > 1 {
        return Some(format!("tactical-mechanics modes are incompatible: --{}",
            selected.join(" and --")));
    }
    if (["write", "summary-write"].into_iter()
        .any(|key| args.flag(key) || args.text(key).is_some()))
        && !args.flag("calibration") && !args.flag("held-out") {
        let key = if args.flag("write") || args.text("write").is_some() {
            "write"
        } else { "summary-write" };
        return Some(format!("tactical-mechanics --{key} requires --calibration or --held-out"));
    }
    None
}

pub(crate) fn tactical_mechanics(args: &Args) {
    if let Some(refusal) = incompatible_mode_refusal(args) {
        eprintln!("{refusal}");
        return;
    }
    let quick = strong_strike::StrongCase {
        seed: 0, mirrored: false, target_anatomy: AnatomyChoice::Fighter,
        approach_offset: strong_strike::APPROACH_OFFSETS[4],
    };
    if args.flag("mirror-trace-1536") {
        let override_named = ["seed", "ordinal", "tolerance", "strike-delta", "reach-delta"]
            .into_iter().any(|key| args.flag(key) || args.text(key).is_some());
        if args.flag("quick") || args.flag("calibration") || args.flag("held-out")
            || args.flag("strike-corpus") || args.flag("anatomical-mirror-corpus")
            || args.flag("noise-free-mirror-corpus") || args.text("write").is_some()
            || override_named {
            eprintln!("tactical-mechanics --mirror-trace-1536 accepts no other input");
            return;
        }
        #[cfg(feature = "cartesian-recoil")]
        println!("{}", strong_strike::mirror_trace_1536());
        #[cfg(not(feature = "cartesian-recoil"))]
        eprintln!("tactical-mechanics --mirror-trace-1536 requires --features cartesian-recoil");
        return;
    }
    if args.flag("strike-corpus") || args.flag("anatomical-mirror-corpus")
        || args.flag("noise-free-mirror-corpus") {
        let anatomical = args.flag("anatomical-mirror-corpus");
        let noise_free = args.flag("noise-free-mirror-corpus");
        if args.flag("quick") || args.flag("calibration") || args.flag("held-out")
            || args.text("write").is_some()
            || [args.flag("strike-corpus"), anatomical, noise_free]
                .into_iter().filter(|set| *set).count() != 1 {
            eprintln!("tactical-mechanics corpus audits accept exactly one mode and no input");
            return;
        }
        // The executor owns four named 16 MiB workers. The caller only merges
        // their retained rows, so MSVC's 1 MiB main stack never holds a World.
        let started = std::time::Instant::now();
        let audit = if noise_free { strong_strike::run_predeclared_noise_free_mirror_corpus() }
            else if anatomical { strong_strike::run_predeclared_anatomical_mirror_corpus() }
            else { strong_strike::run_predeclared_strike_corpus() };
        println!("kind,ordinal,chamber,strike,strike_delta,reach,reach_delta,target,offset_x,offset_y,mirrored,eligible,failure_mask,dissipated,refusals,solver_rejections,cap_hits,energy_excess");
        let print_row = |kind: &str, row: &strong_strike::MechanicalRow| {
            println!("{},{},{},{},{},{},{},{:?},{},{},{},{},{},{},{},{},{},{}", kind,
                row.case.ordinal, row.case.chamber_ticks, row.case.strike_ticks,
                row.strike_delta, row.case.reach_raw, row.reach_delta_raw,
                row.case.target_anatomy, row.case.approach_offset.x.raw(),
                row.case.approach_offset.y.raw(), row.mirrored, row.eligible,
                row.failure_mask, row.dissipated_raw, row.refusals,
                row.solver_rejections, row.cap_hits,
                row.energy_excess_raw);
        };
        for row in &audit.central_rows { print_row("central", row); }
        for row in &audit.local_rows { print_row("local", row); }
        let failures = [
            ("missing_contact", strong_strike::FAILURE_MISSING_CONTACT),
            ("attribution", strong_strike::FAILURE_ATTRIBUTION),
            ("crossing", strong_strike::FAILURE_CROSSING),
            ("reach", strong_strike::FAILURE_REACH),
            ("motion", strong_strike::FAILURE_MOTION),
            ("impulse", strong_strike::FAILURE_IMPULSE),
            ("dissipation", strong_strike::FAILURE_DISSIPATION),
            ("refusal", strong_strike::FAILURE_REFUSAL),
            ("solver", strong_strike::FAILURE_SOLVER),
            ("cap", strong_strike::FAILURE_CAP),
            ("energy", strong_strike::FAILURE_ENERGY),
            ("alpha", strong_strike::FAILURE_ALPHA),
        ];
        for (name, bit) in failures {
            println!("central_rejection,{},{}", name,
                audit.central_rows.iter().filter(|row| row.failure_mask & bit != 0).count());
        }
        println!("central_eligible,plain,{}", audit.central_rows.iter()
            .filter(|row| !row.mirrored && row.eligible).count());
        println!("central_eligible,mirror,{}", audit.central_rows.iter()
            .filter(|row| row.mirrored && row.eligible).count());
        for (at, pair) in audit.robust.iter().enumerate() {
            println!("robust ordinal={} worst_dissipated={} duration={} ranking_ordinal={} chamber={} strike={} reach={} target={:?} offset=({}, {})",
                pair.centre.ordinal, pair.worst_dissipated_raw,
                pair.centre.chamber_ticks + pair.centre.strike_ticks,
                pair.centre.ordinal, pair.centre.chamber_ticks, pair.centre.strike_ticks,
                pair.centre.reach_raw, pair.centre.target_anatomy,
                pair.centre.approach_offset.x.raw(), pair.centre.approach_offset.y.raw());
            if audit.selected == Some(at) {
                println!("selected ordinal={} chamber={} strike={} reach={} target={:?} offset=({}, {}) worst_dissipated={}",
                    pair.centre.ordinal, pair.centre.chamber_ticks, pair.centre.strike_ticks,
                    pair.centre.reach_raw, pair.centre.target_anatomy,
                    pair.centre.approach_offset.x.raw(), pair.centre.approach_offset.y.raw(),
                    pair.worst_dissipated_raw);
                for row in &pair.rows { print_row("selected-local", row); }
            }
        }
        let checksum = if noise_free { strong_strike::noise_free_mirror_corpus_checksum(&audit) }
            else if anatomical { strong_strike::anatomical_mirror_corpus_checksum(&audit) }
            else { strong_strike::strike_corpus_checksum(&audit) };
        println!("{} central_oriented={} local_oriented={} robust_pairs={} selected={:?} checksum={:016x} elapsed_ms={}",
            if noise_free { "noise-free-mirror-corpus source=41" }
                else if anatomical { "anatomical-mirror-corpus" } else { "strike-corpus" },
            audit.central_rows.len(), audit.local_rows.len(), audit.robust.len(), audit.selected,
            checksum, started.elapsed().as_millis());
        return;
    }
    if args.flag("calibration") || args.flag("held-out") {
        run_corpus(args);
        return;
    }
    if !args.flag("quick") {
        eprintln!("tactical-mechanics expects --quick, --calibration, --held-out, --strike-corpus, --anatomical-mirror-corpus, --noise-free-mirror-corpus, --mirror-trace-1536, or --ordinal-31-provenance --write PATH");
        return;
    }
    let before = strong_strike::measure_case(quick, Fx::ONE);
    let tactical = measure_tactical(quick);
    let after = strong_strike::measure_case(quick, Fx::ONE);
    assert_eq!(before, after, "the bracketed strong-strike controls drifted");
    println!("tactical-mechanics quick diagnostic -- no gate decision");
    print_reference("before", before);
    println!("tactical,{tactical:?}");
    print_reference("after", after);
}

fn corpus_cases(seeds: core::ops::Range<u64>) -> impl Iterator<Item = strong_strike::StrongCase> {
    seeds.flat_map(|seed| [false, true].into_iter().flat_map(move |mirrored| {
        [AnatomyChoice::Fighter, AnatomyChoice::Brute].into_iter().flat_map(move |target_anatomy| {
            strong_strike::APPROACH_OFFSETS.into_iter().map(move |approach_offset| {
                strong_strike::StrongCase { seed, mirrored, target_anatomy, approach_offset }
            })
        })
    }))
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
struct CalibrationRow {
    case: strong_strike::StrongCase,
    before: strong_strike::StrikeMeasurement,
    held: strong_strike::StrikeMeasurement,
    tactical: TacticalRow,
    structural: StructuralValidity,
    productivity: TacticalProductivity,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
struct IndexedCase {
    ordinal: usize,
    case: strong_strike::StrongCase,
}

#[derive(PartialEq, Eq, Debug)]
enum CalibrationCollectError {
    WorkerStart { shard: usize },
    WorkerPanic { shard: usize },
    InvalidDescriptor { expected_len: usize, actual_len: usize,
        at: usize, ordinal: Option<usize> },
}

impl core::fmt::Display for CalibrationCollectError {
    fn fmt(&self, out: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        match self {
            Self::WorkerStart { shard } => write!(out,
                "tactical-mechanics calibration shard={shard} could not start; no artifact was written"),
            Self::WorkerPanic { shard } => write!(out,
                "tactical-mechanics calibration shard={shard} panicked; no artifact was written"),
            Self::InvalidDescriptor { expected_len, actual_len, at, ordinal } => write!(out,
                "tactical-mechanics calibration shard=none descriptors invalid: expected_len={expected_len} actual_len={actual_len} at={at} ordinal={ordinal:?}; no artifact was written"),
        }
    }
}

fn indexed_cases(seeds: core::ops::Range<u64>) -> Vec<IndexedCase> {
    corpus_cases(seeds).enumerate().map(|(ordinal, case)| IndexedCase { ordinal, case }).collect()
}

fn validate_indexed_values<T>(cases: &[IndexedCase], rows: &[(usize, strong_strike::StrongCase, T)])
    -> Result<(), CalibrationCollectError>
{
    if rows.len() != cases.len() {
        return Err(CalibrationCollectError::InvalidDescriptor {
            expected_len: cases.len(), actual_len: rows.len(),
            at: cases.len().min(rows.len()), ordinal: rows.get(cases.len()).map(|row| row.0),
        });
    }
    for (at, (case, row)) in cases.iter().zip(rows).enumerate() {
        if case.ordinal != at || row.0 != at || row.1 != case.case {
            return Err(CalibrationCollectError::InvalidDescriptor {
                expected_len: cases.len(), actual_len: rows.len(), at,
                ordinal: Some(if case.ordinal != at { case.ordinal } else { row.0 }),
            });
        }
    }
    Ok(())
}

// A `collect_indexed_cases_with(cases, measure)` wrapper stood here, defaulting
// `expected_len` to `cases.len()`. Production never called it -- every shipped
// path knows the descriptor count it is owed and passes it, which is the whole
// reason the parameter exists -- so the default it supplied was the one case
// that cannot refuse a miscount. Its test callers pass `cases.len()` explicitly
// now, which says out loud that they are asserting on a plan they built.
fn collect_indexed_cases_with_expected<T, M>(cases: &[IndexedCase], expected_len: usize, measure: M)
    -> Result<Vec<T>, CalibrationCollectError>
where T: Send, M: Fn(IndexedCase) -> (strong_strike::StrongCase, T) + Sync
{
    if cases.len() != expected_len {
        return Err(CalibrationCollectError::InvalidDescriptor {
            expected_len, actual_len: cases.len(), at: cases.len().min(expected_len),
            ordinal: cases.get(expected_len).map(|case| case.ordinal),
        });
    }
    if cases.is_empty() { return Ok(Vec::new()); }
    for (at, case) in cases.iter().enumerate() {
        if case.ordinal != at {
            return Err(CalibrationCollectError::InvalidDescriptor {
                expected_len: cases.len(), actual_len: cases.len(), at,
                ordinal: Some(case.ordinal),
            });
        }
    }
    let shard_len = cases.len().div_ceil(CALIBRATION_WORKERS);
    let indexed = std::thread::scope(|scope| {
        let mut workers = Vec::with_capacity(CALIBRATION_WORKERS);
        for (shard, cases) in cases.chunks(shard_len).enumerate() {
            let measure = &measure;
            match std::thread::Builder::new()
                .name(format!("smart128-tactical-calibration-{shard}"))
                .stack_size(CALIBRATION_STACK_BYTES)
                .spawn_scoped(scope, move || cases.iter().copied()
                    .map(|case| {
                        let (returned_case, row) = measure(case);
                        (case.ordinal, returned_case, row)
                    }).collect::<Vec<_>>()) {
                Ok(worker) => workers.push((shard, worker)),
                Err(_) => {
                    for (_, worker) in workers { let _ = worker.join(); }
                    return Err(CalibrationCollectError::WorkerStart { shard });
                }
            }
        }
        let mut rows = Vec::with_capacity(cases.len());
        let mut first_panic = None;
        // Completion order is deliberately irrelevant. Creation order is the
        // descriptor order, and validation refuses drift instead of sorting it.
        for (shard, worker) in workers {
            match worker.join() {
                Ok(mut shard_rows) => rows.append(&mut shard_rows),
                Err(_) if first_panic.is_none() => {
                    first_panic = Some(CalibrationCollectError::WorkerPanic { shard });
                }
                Err(_) => {}
            }
        }
        match first_panic { Some(error) => Err(error), None => Ok(rows) }
    })?;
    validate_indexed_values(cases, &indexed)?;
    Ok(indexed.into_iter().map(|(_, _, row)| row).collect())
}

fn collect_matched_rows(seeds: core::ops::Range<u64>, expected_len: usize)
    -> Result<Vec<CalibrationRow>, CalibrationCollectError>
{
    let cases = indexed_cases(seeds);
    collect_indexed_cases_with_expected(&cases, expected_len, |case| {
        let row = measure_matched_row(case.case); (row.case, row)
    })
}

fn measure_matched_row(case: strong_strike::StrongCase) -> CalibrationRow {
    let before = strong_strike::measure_case(case, Fx::ONE);
    let held = strong_strike::measure_case(case, Fx::ZERO);
    let tactical = measure_tactical(case);
    let after = strong_strike::measure_case(case, Fx::ONE);
    CalibrationRow { case, before, held, tactical,
        structural: structural_validity(before, held, &tactical, after),
        productivity: tactical_productivity(&tactical) }
}

fn anatomy_name(value: AnatomyChoice) -> &'static str {
    match value { AnatomyChoice::Fighter => "fighter", AnatomyChoice::Brute => "brute" }
}

fn part_name(value: Option<BodyPart>) -> &'static str {
    match value { None => "none", Some(BodyPart::Head) => "head",
        Some(BodyPart::Torso) => "torso", Some(BodyPart::LeftArm) => "left_arm",
        Some(BodyPart::RightArm) => "right_arm", Some(BodyPart::Legs) => "legs" }
}

fn hand_name(value: Option<LimbSlot>) -> &'static str {
    match value { None => "none", Some(LimbSlot::LeftArm) => "left_arm",
        Some(LimbSlot::RightArm) => "right_arm" }
}

fn outcome_name(value: Option<Outcome>) -> &'static str {
    match value { None => "none", Some(Outcome::HeroesWin) => "heroes_win",
        Some(Outcome::MonstersWin) => "monsters_win",
        Some(Outcome::MutualDestruction) => "mutual_destruction",
        Some(Outcome::Decision(Faction::Heroes)) => "decision_heroes",
        Some(Outcome::Decision(Faction::Monsters)) => "decision_monsters",
        Some(Outcome::Draw) => "draw" }
}

const CALIBRATION_CSV_HEADER: &str = concat!(
    "fingerprint,seed,mirrored,target,offset_x_raw,offset_y_raw,",
    "bracket_equal,reference_unique,reference_crossed,held_inert,held_legal,reference_legal,tactical_legal,",
    "productive_unique_crossing_contact_dissipation,productive_cut_or_thrust_matching_integrity,",
    "reference_contact_tick,reference_region,reference_weapon_body_facts,reference_competing_facts,reference_tip_speed_raw,",
    "reference_energy_before_raw,reference_dissipated_raw,reference_cut_raw,reference_thrust_raw,reference_pressure_raw,",
    "reference_integrity_loss_head_raw,reference_integrity_loss_torso_raw,reference_integrity_loss_left_arm_raw,",
    "reference_integrity_loss_right_arm_raw,reference_integrity_loss_legs_raw,",
    "reference_wound_gain_head_raw,reference_wound_gain_torso_raw,reference_wound_gain_left_arm_raw,",
    "reference_wound_gain_right_arm_raw,reference_wound_gain_legs_raw,reference_blood_loss_raw,",
    "reference_refusals,reference_solver_rejections,reference_cap_hits,reference_energy_excess_raw,",
    "held_contact_tick,held_weapon_body_facts,held_competing_facts,held_energy_before_raw,held_dissipated_raw,",
    "held_cut_raw,held_thrust_raw,held_pressure_raw,held_integrity_loss_head_raw,held_integrity_loss_torso_raw,",
    "held_integrity_loss_left_arm_raw,held_integrity_loss_right_arm_raw,held_integrity_loss_legs_raw,",
    "held_wound_gain_head_raw,held_wound_gain_torso_raw,held_wound_gain_left_arm_raw,",
    "held_wound_gain_right_arm_raw,held_wound_gain_legs_raw,held_blood_loss_raw,",
    "held_refusals,held_solver_rejections,held_cap_hits,held_energy_excess_raw,",
    "tactical_intended_region,tactical_intended_hand,tactical_first_cross_tick,tactical_first_contact_tick,",
    "tactical_first_contact_cross_tick,tactical_first_contact_region,tactical_first_contact_hand,",
    "tactical_first_contact_attributed_facts,tactical_first_contact_competing_facts,",
    "tactical_first_contact_dissipated_raw,tactical_first_contact_cut_or_thrust_raw,",
    "tactical_first_contact_matching_integrity_loss_raw,tactical_peak_tip_speed_raw,",
    "tactical_peak_normal_closing_raw,tactical_peak_energy_before_raw,tactical_peak_dissipated_raw,",
    "tactical_cut_raw,tactical_thrust_raw,tactical_pressure_raw,",
    "tactical_integrity_loss_head_raw,tactical_integrity_loss_torso_raw,tactical_integrity_loss_left_arm_raw,",
    "tactical_integrity_loss_right_arm_raw,tactical_integrity_loss_legs_raw,",
    "tactical_wound_gain_head_raw,tactical_wound_gain_torso_raw,tactical_wound_gain_left_arm_raw,",
    "tactical_wound_gain_right_arm_raw,tactical_wound_gain_legs_raw,tactical_blood_loss_raw,",
    "tactical_unattributed_anatomy_changes,tactical_decision_tick,tactical_outcome,tactical_refusals,",
    "tactical_solver_rejections,tactical_cap_hits,tactical_energy_excess_raw,",
    "commits,crossings,weapon_body_facts,positive_closing,dissipated_groups,above_floor,cut_or_thrust,",
    "integrity_losses,open_wounds,body_decisions\n");

fn optional_u32(value: Option<u32>) -> String {
    value.map(|number| number.to_string()).unwrap_or_else(|| "none".to_string())
}

fn anatomy_delta_csv_fields(row: strong_strike::StrikeMeasurement) -> Vec<String> {
    let mut fields: Vec<String> = (0..BodyPart::COUNT).map(|at|
        (row.integrity_before_raw[at] - row.integrity_after_raw[at]).to_string()).collect();
    fields.extend((0..BodyPart::COUNT).map(|at|
        (row.wound_after_raw[at] - row.wound_before_raw[at]).to_string()));
    fields.push((row.blood_before_raw - row.blood_after_raw).to_string());
    fields
}

fn tactical_csv_fields(tactical: TacticalRow) -> Vec<String> {
    let mut fields = vec![
        part_name(tactical.intended_region).to_string(), hand_name(tactical.intended_hand).to_string(),
        optional_u32(tactical.first_cross_tick), optional_u32(tactical.first_contact_tick),
        optional_u32(tactical.first_contact_cross_tick),
        part_name(tactical.first_contact_region).to_string(),
        hand_name(tactical.first_contact_hand).to_string(),
        tactical.first_contact_attributed_facts.to_string(),
        tactical.first_contact_competing_facts.to_string(),
        tactical.first_contact_dissipated_raw.to_string(),
        tactical.first_contact_cut_or_thrust_raw.to_string(),
        tactical.first_contact_matching_integrity_loss_raw.to_string(),
        tactical.peak_tip_speed_raw.to_string(),
        tactical.peak_normal_closing_raw.to_string(), tactical.peak_energy_before_raw.to_string(),
        tactical.peak_dissipated_raw.to_string(), tactical.cut_raw.to_string(),
        tactical.thrust_raw.to_string(), tactical.pressure_raw.to_string(),
    ];
    fields.extend(tactical.integrity_loss_raw.into_iter().map(|value| value.to_string()));
    fields.extend(tactical.wound_gain_raw.into_iter().map(|value| value.to_string()));
    fields.extend([
        tactical.blood_loss_raw.to_string(), tactical.unattributed_anatomy_changes.to_string(),
        optional_u32(tactical.decision_tick), outcome_name(tactical.outcome).to_string(),
        tactical.refusals.to_string(), tactical.solver_rejections.to_string(),
        tactical.cap_hits.to_string(), tactical.max_energy_excess_raw.to_string(),
        tactical.waterfall.commits.to_string(), tactical.waterfall.crossings.to_string(),
        tactical.waterfall.weapon_body_facts.to_string(), tactical.waterfall.positive_closing.to_string(),
        tactical.waterfall.dissipated_groups.to_string(), tactical.waterfall.above_floor.to_string(),
        tactical.waterfall.cut_or_thrust.to_string(), tactical.waterfall.integrity_losses.to_string(),
        tactical.waterfall.open_wounds.to_string(), tactical.waterfall.body_decisions.to_string(),
    ]);
    fields
}

fn calibration_csv_row(row: &CalibrationRow) -> String {
    let tactical = row.tactical;
    let structural = row.structural;
    let productivity = row.productivity;
    let mut fields = vec![
        tactical.scenario_fingerprint.to_string(), row.case.seed.to_string(),
        row.case.mirrored.to_string(), anatomy_name(row.case.target_anatomy).to_string(),
        row.case.approach_offset.x.raw().to_string(), row.case.approach_offset.y.raw().to_string(),
        structural.bracket_equal.to_string(), structural.reference_unique.to_string(),
        structural.reference_crossed.to_string(), structural.held_inert.to_string(),
        structural.held_legal.to_string(), structural.reference_legal.to_string(),
        structural.tactical_legal.to_string(),
        productivity.unique_crossing_contact_with_dissipation.to_string(),
        productivity.cut_or_thrust_with_matching_integrity_loss.to_string(),
        optional_u32(row.before.contact_tick), part_name(row.before.region).to_string(),
        row.before.weapon_body_facts.to_string(),
        row.before.competing_facts.to_string(), row.before.tip_delta.length().raw().to_string(),
        row.before.energy_before_raw.to_string(), row.before.energy_dissipated_raw.to_string(),
        row.before.cut_raw.to_string(), row.before.thrust_raw.to_string(), row.before.pressure_raw.to_string(),
    ];
    fields.extend(anatomy_delta_csv_fields(row.before));
    fields.extend([
        row.before.refusals.to_string(), row.before.solver_rejections.to_string(),
        row.before.cap_hits.to_string(), row.before.max_energy_excess_raw.to_string(),
        optional_u32(row.held.contact_tick), row.held.weapon_body_facts.to_string(),
        row.held.competing_facts.to_string(), row.held.energy_before_raw.to_string(),
        row.held.energy_dissipated_raw.to_string(), row.held.cut_raw.to_string(),
        row.held.thrust_raw.to_string(), row.held.pressure_raw.to_string(),
    ]);
    fields.extend(anatomy_delta_csv_fields(row.held));
    fields.extend([
        row.held.refusals.to_string(), row.held.solver_rejections.to_string(),
        row.held.cap_hits.to_string(), row.held.max_energy_excess_raw.to_string(),
    ]);
    fields.extend(tactical_csv_fields(tactical));
    let mut answer = fields.join(",");
    answer.push('\n');
    answer
}

#[derive(Clone, Copy, Default)]
struct CalibrationSummary {
    cases: u32, structural_invalid: u32, bracket_drift: u32,
    reference_missing: u32, reference_ambiguous: u32, reference_uncrossed: u32,
    held_inertness_invalid: u32, held_refusal: u32, held_solver: u32, held_cap: u32,
    held_energy: u32, reference_refusal: u32, reference_solver: u32, reference_cap: u32,
    reference_energy: u32, tactical_refusal: u32, tactical_solver: u32, tactical_cap: u32,
    tactical_energy: u32, tactical_unattributed: u32, tactical_cross_order: u32,
    reference_meaningful: u32, tactical_cross_contact_dissipation: u32,
    tactical_damage_integrity: u32,
}

impl CalibrationSummary {
    fn observe(&mut self, row: &CalibrationRow) {
        let s = row.structural;
        self.cases += 1;
        self.structural_invalid += u32::from(!s.passes());
        self.bracket_drift += u32::from(!s.bracket_equal);
        self.reference_missing += u32::from(row.before.weapon_body_facts == 0);
        self.reference_ambiguous += u32::from(row.before.weapon_body_facts > 1
            || row.before.competing_facts > 0);
        self.reference_uncrossed += u32::from(!s.reference_crossed);
        self.held_inertness_invalid += u32::from(!s.held_inert);
        self.held_refusal += u32::from(row.held.refusals != 0);
        self.held_solver += u32::from(row.held.solver_rejections != 0);
        self.held_cap += u32::from(row.held.cap_hits != 0);
        self.held_energy += u32::from(row.held.max_energy_excess_raw != 0);
        self.reference_refusal += u32::from(row.before.refusals != 0);
        self.reference_solver += u32::from(row.before.solver_rejections != 0);
        self.reference_cap += u32::from(row.before.cap_hits != 0);
        self.reference_energy += u32::from(row.before.max_energy_excess_raw != 0);
        self.tactical_refusal += u32::from(row.tactical.refusals != 0);
        self.tactical_solver += u32::from(row.tactical.solver_rejections != 0);
        self.tactical_cap += u32::from(row.tactical.cap_hits != 0);
        self.tactical_energy += u32::from(row.tactical.max_energy_excess_raw != 0);
        self.tactical_unattributed += u32::from(row.tactical.unattributed_anatomy_changes != 0);
        self.tactical_cross_order += u32::from(match row.tactical.first_contact_tick {
            None => false,
            Some(contact) => !row.tactical.first_contact_cross_tick
                .is_some_and(|cross| cross <= contact),
        });
        self.reference_meaningful += u32::from(
            strong_strike::meaningful_strike_validity(row.before, row.held).passes());
        self.tactical_cross_contact_dissipation += u32::from(
            row.productivity.unique_crossing_contact_with_dissipation);
        self.tactical_damage_integrity += u32::from(
            row.productivity.cut_or_thrust_with_matching_integrity_loss);
    }
}

fn summary_line(label: &str, summary: CalibrationSummary) -> String {
    format!("group={label} cases={} structural_invalid={} bracket_drift={} reference_missing={} reference_ambiguous={} reference_uncrossed={} held_inertness_invalid={} held_illegal_submission={} held_illegal_solver={} held_illegal_cap={} held_illegal_energy={} reference_illegal_refusal={} reference_illegal_solver={} reference_illegal_cap={} reference_illegal_energy={} tactical_illegal_refusal={} tactical_illegal_solver={} tactical_illegal_cap={} tactical_illegal_energy={} tactical_illegal_unattributed={} tactical_illegal_cross_order={} reference_meaningful_strikes={} tactical_unique_crossing_contact_dissipation={} tactical_cut_or_thrust_matching_integrity={}\n",
        summary.cases, summary.structural_invalid, summary.bracket_drift,
        summary.reference_missing, summary.reference_ambiguous, summary.reference_uncrossed,
        summary.held_inertness_invalid, summary.held_refusal, summary.held_solver,
        summary.held_cap, summary.held_energy, summary.reference_refusal,
        summary.reference_solver, summary.reference_cap, summary.reference_energy,
        summary.tactical_refusal, summary.tactical_solver, summary.tactical_cap,
        summary.tactical_energy, summary.tactical_unattributed, summary.tactical_cross_order,
        summary.reference_meaningful, summary.tactical_cross_contact_dissipation,
        summary.tactical_damage_integrity)
}

fn write_summary(path: &str, summary: &str) -> std::io::Result<()> {
    std::fs::write(path, summary.as_bytes())
}

fn collect_then_render_with<C, R>(collect: C, render: R)
    -> Result<(), CalibrationCollectError>
where C: FnOnce() -> Result<Vec<CalibrationRow>, CalibrationCollectError>,
      R: FnOnce(Vec<CalibrationRow>)
{
    let rows = collect()?;
    render(rows);
    Ok(())
}

fn render_corpus(args: &Args, seeds: core::ops::Range<u64>, held_out: bool,
                 rows: Vec<CalibrationRow>) {
    let mut csv = String::from(CALIBRATION_CSV_HEADER);
    let mut summaries = [CalibrationSummary::default(); 5];
    for row in rows {
        let case = row.case;
        summaries[0].observe(&row);
        let split = 1 + usize::from(case.mirrored) * 2
            + usize::from(case.target_anatomy == AnatomyChoice::Brute);
        summaries[split].observe(&row);
        csv.push_str(&calibration_csv_row(&row));
    }
    if let Some(path) = args.text("write") {
        std::fs::write(path, csv.as_bytes()).unwrap_or_else(|error| panic!("could not write {path}: {error}"));
    }
    let mut summary = format!("tactical-mechanics calibration seeds={}..{} expected_cases={}\n",
        seeds.start, seeds.end, if held_out { HELD_OUT_CASES } else { CALIBRATION_CASES });
    summary.push_str(&summary_line("total", summaries[0]));
    summary.push_str(&summary_line("mirror=false,target=fighter", summaries[1]));
    summary.push_str(&summary_line("mirror=false,target=brute", summaries[2]));
    summary.push_str(&summary_line("mirror=true,target=fighter", summaries[3]));
    summary.push_str(&summary_line("mirror=true,target=brute", summaries[4]));
    summary.push_str(&format!("decision={}\n", if summaries[0].structural_invalid == 0 {
        if productivity_passes_denominator(summaries[0].cases,
            summaries[0].tactical_cross_contact_dissipation,
            summaries[0].tactical_damage_integrity) {
            "calibration-pass-plan-held-out"
        } else { "revise" }
    } else { "invalid-stop-before-held-out" }));
    print!("{summary}");
    if let Some(path) = args.text("summary-write") {
        write_summary(path, &summary)
            .unwrap_or_else(|error| panic!("could not write {path}: {error}"));
    }
}

fn run_corpus(args: &Args) {
    let held_out = args.flag("held-out");
    if held_out {
        let calibration = match collect_matched_rows(CALIBRATION_SEEDS, CALIBRATION_CASES) {
            Ok(rows) => rows,
            Err(error) => { eprintln!("{error}"); return; }
        };
        let calibration_invalid = calibration.iter()
            .filter(|row| !row.structural.passes()).count();
        if calibration_invalid != 0 {
            eprintln!("held-out refused: calibration has {calibration_invalid} structural validity failures");
            std::process::exit(2);
        }
    }
    let seeds = if held_out { HELD_OUT_SEEDS } else { CALIBRATION_SEEDS };
    let expected_len = if held_out { HELD_OUT_CASES } else { CALIBRATION_CASES };
    let collect_seeds = seeds.clone();
    if let Err(error) = collect_then_render_with(
        || collect_matched_rows(collect_seeds, expected_len),
        |rows| render_corpus(args, seeds, held_out, rows),
    ) {
        eprintln!("{error}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn legal() -> RunLegality {
        RunLegality { refusals: 0, solver_rejections: 0, cap_hits: 0,
            max_energy_excess_raw: 0 }
    }

    fn productive_tactical() -> TacticalRow {
        let mut integrity = [0; BodyPart::COUNT];
        integrity[BodyPart::Legs as usize] = 1;
        TacticalRow { intended_region: Some(BodyPart::Legs), intended_hand: Some(LimbSlot::RightArm),
            first_cross_tick: Some(1), first_contact_tick: Some(2),
            first_contact_cross_tick: Some(1), first_contact_region: Some(BodyPart::Legs),
            first_contact_hand: Some(LimbSlot::RightArm),
            first_contact_attributed_facts: 1, first_contact_competing_facts: 0,
            first_contact_dissipated_raw: 1, first_contact_cut_or_thrust_raw: 1,
            first_contact_matching_integrity_loss_raw: 1,
            peak_dissipated_raw: 1, cut_raw: 1, integrity_loss_raw: integrity,
            ..TacticalRow::default() }
    }

    #[test]
    fn matched_calibration_is_exactly_nine_hundred_ordered_cells() {
        let cases: Vec<_> = corpus_cases(CALIBRATION_SEEDS).collect();
        assert_eq!(cases.len(), CALIBRATION_CASES);
        assert_eq!(CALIBRATION_CASES,
            25 * 2 * 2 * strong_strike::APPROACH_OFFSETS.len());
        assert_eq!(HELD_OUT_CASES,
            100 * 2 * 2 * strong_strike::APPROACH_OFFSETS.len());
        let mut at = 0;
        for seed in 0..25 {
            for mirrored in [false, true] {
                for target_anatomy in [AnatomyChoice::Fighter, AnatomyChoice::Brute] {
                    for approach_offset in strong_strike::APPROACH_OFFSETS {
                        assert_eq!(cases[at], strong_strike::StrongCase {
                            seed, mirrored, target_anatomy, approach_offset });
                        at += 1;
                    }
                }
            }
        }
    }

    fn synthetic_indexed_cases(count: usize) -> Vec<IndexedCase> {
        corpus_cases(0..1).take(count).enumerate()
            .map(|(ordinal, case)| IndexedCase { ordinal, case }).collect()
    }

    #[test]
    fn four_fixed_calibration_workers_preserve_serial_order_after_reverse_completion() {
        use std::sync::{Condvar, Mutex};

        let cases = synthetic_indexed_cases(CALIBRATION_WORKERS);
        let turn = Mutex::new(0usize); let ready = Condvar::new();
        let completion = Mutex::new(Vec::new());
        let rows = collect_indexed_cases_with_expected(&cases, cases.len(), |case| {
            let name = std::thread::current().name().unwrap().to_string();
            let shard: usize = name.rsplit('-').next().unwrap().parse().unwrap();
            let wanted = CALIBRATION_WORKERS - 1 - shard;
            let mut at = turn.lock().unwrap();
            while *at != wanted { at = ready.wait(at).unwrap(); }
            completion.lock().unwrap().push(shard);
            *at += 1; ready.notify_all();
            (case.case, case.ordinal)
        }).unwrap();
        assert_eq!(completion.into_inner().unwrap(), vec![3, 2, 1, 0]);
        assert_eq!(rows, (0..CALIBRATION_WORKERS).collect::<Vec<_>>());
    }

    #[test]
    fn every_calibration_descriptor_is_measured_once_and_missing_rows_are_invalid() {
        use std::sync::atomic::{AtomicUsize, Ordering};

        let cases = synthetic_indexed_cases(8);
        let visits: Vec<_> = (0..cases.len()).map(|_| AtomicUsize::new(0)).collect();
        let rows = collect_indexed_cases_with_expected(&cases, cases.len(), |case| {
            visits[case.ordinal].fetch_add(1, Ordering::Relaxed);
            (case.case, case.ordinal)
        }).unwrap();
        assert_eq!(rows.len(), cases.len());
        assert!(visits.iter().all(|visits| visits.load(Ordering::Relaxed) == 1));
        let missing = vec![(0, cases[0].case, ()), (1, cases[1].case, ()),
            (3, cases[3].case, ())];
        assert!(matches!(validate_indexed_values(&cases[..4], &missing),
            Err(CalibrationCollectError::InvalidDescriptor { .. })));

        let attempted = AtomicUsize::new(0);
        let short = collect_indexed_cases_with_expected(&cases[..7], 8, |case| {
            attempted.fetch_add(1, Ordering::Relaxed); (case.case, case.ordinal)
        });
        assert!(matches!(short, Err(CalibrationCollectError::InvalidDescriptor { .. })));
        assert_eq!(attempted.load(Ordering::Relaxed), 0,
            "a wrong production descriptor count must fail before spawning");

        let displaced = collect_indexed_cases_with_expected(&cases, cases.len(), |case| {
            let returned = cases[(case.ordinal + 1) % cases.len()].case;
            (returned, case.ordinal)
        });
        assert!(matches!(displaced,
            Err(CalibrationCollectError::InvalidDescriptor { .. })));
        let duplicated = collect_indexed_cases_with_expected(&cases, cases.len(), |case| {
            (cases[0].case, case.ordinal)
        });
        assert!(matches!(duplicated,
            Err(CalibrationCollectError::InvalidDescriptor { .. })));
    }

    #[test]
    fn calibration_uses_four_named_sixteen_mebibyte_workers() {
        use std::collections::BTreeSet;
        use std::sync::Mutex;

        assert_eq!(CALIBRATION_WORKERS, 4);
        assert_eq!(CALIBRATION_STACK_BYTES, 16 * 1024 * 1024);
        let names = Mutex::new(BTreeSet::new());
        let cases = synthetic_indexed_cases(8);
        collect_indexed_cases_with_expected(&cases, cases.len(), |case| {
            names.lock().unwrap().insert(
                std::thread::current().name().unwrap().to_string());
            (case.case, ())
        }).unwrap();
        assert_eq!(names.into_inner().unwrap(), [
            "smart128-tactical-calibration-0".to_string(),
            "smart128-tactical-calibration-1".to_string(),
            "smart128-tactical-calibration-2".to_string(),
            "smart128-tactical-calibration-3".to_string(),
        ].into_iter().collect());
    }

    #[test]
    fn a_panicking_calibration_worker_is_a_named_error_before_reporting() {
        let cases = synthetic_indexed_cases(8);
        let result = collect_indexed_cases_with_expected(&cases, cases.len(), |case| {
            if case.ordinal == 4 { panic!("synthetic worker failure"); }
            (case.case, case.ordinal)
        });
        assert_eq!(result, Err(CalibrationCollectError::WorkerPanic { shard: 2 }));
    }

    #[test]
    fn a_failed_calibration_collection_writes_no_artifact() {
        use std::sync::atomic::{AtomicBool, Ordering};

        let csv_written = AtomicBool::new(false);
        let summary_written = AtomicBool::new(false);
        let result = collect_then_render_with(
            || Err(CalibrationCollectError::WorkerPanic { shard: 3 }),
            |_| {
                csv_written.store(true, Ordering::Relaxed);
                summary_written.store(true, Ordering::Relaxed);
            });
        assert_eq!(result, Err(CalibrationCollectError::WorkerPanic { shard: 3 }));
        assert!(!csv_written.load(Ordering::Relaxed));
        assert!(!summary_written.load(Ordering::Relaxed));
        for error in [
            CalibrationCollectError::WorkerStart { shard: 1 },
            CalibrationCollectError::WorkerPanic { shard: 2 },
            CalibrationCollectError::InvalidDescriptor { expected_len: 8,
                actual_len: 7, at: 7, ordinal: None },
        ] {
            let message = error.to_string();
            assert!(message.contains("shard="));
            assert!(message.contains("no artifact was written"));
        }
    }

    #[test]
    fn an_empty_calibration_plan_needs_no_worker() {
        let rows = collect_indexed_cases_with_expected::<usize, _>(&[], 0,
            |case| (case.case, case.ordinal)).unwrap();
        assert!(rows.is_empty());
    }

    #[test]
    fn a_dimension_covering_matched_subset_is_identical_serial_and_parallel() {
        let cases = [
            strong_strike::StrongCase { seed: 0, mirrored: false,
                target_anatomy: AnatomyChoice::Fighter,
                approach_offset: strong_strike::APPROACH_OFFSETS[0] },
            strong_strike::StrongCase { seed: 0, mirrored: false,
                target_anatomy: AnatomyChoice::Brute,
                approach_offset: strong_strike::APPROACH_OFFSETS[2] },
            strong_strike::StrongCase { seed: 1, mirrored: true,
                target_anatomy: AnatomyChoice::Fighter,
                approach_offset: strong_strike::APPROACH_OFFSETS[6] },
            strong_strike::StrongCase { seed: 1, mirrored: true,
                target_anatomy: AnatomyChoice::Brute,
                approach_offset: strong_strike::APPROACH_OFFSETS[8] },
        ];
        let indexed: Vec<_> = cases.into_iter().enumerate()
            .map(|(ordinal, case)| IndexedCase { ordinal, case }).collect();
        let serial: Vec<_> = cases.into_iter().map(measure_matched_row).collect();
        let parallel = collect_indexed_cases_with_expected(&indexed, indexed.len(),
            |case| { let row = measure_matched_row(case.case); (row.case, row) }).unwrap();
        assert_eq!(parallel, serial);
        assert_eq!(parallel.iter().map(calibration_csv_row).collect::<String>(),
            serial.iter().map(calibration_csv_row).collect::<String>());
    }

    #[test]
    fn structural_validity_rejects_each_refusal_cap_energy_and_attribution_failure() {
        let tactical = productive_tactical();
        let classify = |held, reference, tactical: &TacticalRow| structural_from_fields(
            true, true, true, true, held, reference, tactical);
        assert!(classify(legal(), legal(), &tactical).passes());
        for field in 0..4 {
            let mut bad = legal();
            match field { 0 => bad.refusals = 1, 1 => bad.solver_rejections = 1,
                2 => bad.cap_hits = 1, _ => bad.max_energy_excess_raw = 1 }
            assert!(!classify(bad, legal(), &tactical).passes());
            assert!(!classify(legal(), bad, &tactical).passes());
        }
        let mut bad = tactical;
        bad.unattributed_anatomy_changes = 1;
        assert!(!classify(legal(), legal(), &bad).passes());
        for field in 0..4 {
            let mut bad = tactical;
            match field { 0 => bad.refusals = 1, 1 => bad.solver_rejections = 1,
                2 => bad.cap_hits = 1, _ => bad.max_energy_excess_raw = 1 }
            assert!(!classify(legal(), legal(), &bad).passes());
        }
        assert!(!structural_from_fields(false, true, true, true, legal(), legal(), &tactical).passes());
        assert!(!structural_from_fields(true, false, true, true, legal(), legal(), &tactical).passes());
        assert!(!structural_from_fields(true, true, false, true, legal(), legal(), &tactical).passes());
        assert!(!structural_from_fields(true, true, true, false, legal(), legal(), &tactical).passes());
    }

    #[test]
    fn held_validity_reads_contact_energy_caps_and_anatomy_without_short_circuiting() {
        let inert = HeldControlEvidence::default();
        assert!(inert.is_inert());
        let mutations: [fn(&mut HeldControlEvidence); 11] = [
            |row| row.contact = true, |row| row.weapon_body_facts = 1,
            |row| row.competing_facts = 1, |row| row.energy_before_raw = 1,
            |row| row.dissipated_raw = 1, |row| row.cut_raw = 1,
            |row| row.thrust_raw = 1, |row| row.pressure_raw = 1,
            |row| row.integrity_loss_raw[BodyPart::Head as usize] = 1,
            |row| row.wound_gain_raw[BodyPart::Torso as usize] = 1,
            |row| row.blood_loss_raw = 1,
        ];
        for mutate in mutations {
            let mut bad = inert; mutate(&mut bad); assert!(!bad.is_inert());
        }
        let mut reversed = inert;
        reversed.integrity_loss_raw[BodyPart::Head as usize] = -1;
        assert!(!reversed.is_inert());
        let mut reversed = inert;
        reversed.wound_gain_raw[BodyPart::Torso as usize] = -1;
        assert!(!reversed.is_inert());
        let mut reversed = inert;
        reversed.blood_loss_raw = -1;
        assert!(!reversed.is_inert());
        for field in 0..4 {
            let mut bad = legal();
            match field { 0 => bad.refusals = 1, 1 => bad.solver_rejections = 1,
                2 => bad.cap_hits = 1, _ => bad.max_energy_excess_raw = 1 }
            assert!(!bad.passes());
        }
        let mut row = TacticalRow::default();
        row.integrity_loss_raw[BodyPart::Head as usize] = 7;
        row.wound_gain_raw[BodyPart::Torso as usize] = 8;
        row.unattributed_anatomy_changes = 2;
        row.blood_loss_raw = 9;
        let fields = tactical_csv_fields(row);
        assert!(fields.iter().any(|field| field == "7"));
        assert!(fields.iter().any(|field| field == "8"));
        assert!(fields.iter().any(|field| field == "2"));
        assert!(fields.iter().any(|field| field == "9"));
    }

    #[test]
    fn a_crossing_after_first_contact_is_structurally_illegal() {
        let mut tactical = productive_tactical();
        tactical.first_cross_tick = Some(1);
        tactical.first_contact_tick = Some(2);
        tactical.first_contact_cross_tick = Some(3);
        assert!(!structural_from_fields(true, true, true, true, legal(), legal(), &tactical)
            .tactical_legal);
        tactical.first_contact_cross_tick = Some(2);
        assert!(structural_from_fields(true, true, true, true, legal(), legal(), &tactical)
            .tactical_legal);
    }

    #[test]
    fn productivity_does_not_count_pressure_or_an_unmatched_integrity_loss() {
        let row = productive_tactical();
        let productive = tactical_productivity(&row);
        assert!(productive.unique_crossing_contact_with_dissipation);
        assert!(productive.cut_or_thrust_with_matching_integrity_loss);
        let mut bad = row; bad.first_contact_dissipated_raw = 0;
        assert!(!tactical_productivity(&bad).unique_crossing_contact_with_dissipation);
        let mut bad = row; bad.first_contact_competing_facts = 1;
        assert!(!tactical_productivity(&bad).unique_crossing_contact_with_dissipation);
        let mut pressure = row; pressure.first_contact_cut_or_thrust_raw = 0;
        pressure.cut_raw = 99; pressure.pressure_raw = 99;
        assert!(!tactical_productivity(&pressure).cut_or_thrust_with_matching_integrity_loss);
        let mut unmatched = row;
        unmatched.first_contact_matching_integrity_loss_raw = 0;
        unmatched.integrity_loss_raw[BodyPart::Head as usize] = 1;
        assert!(!tactical_productivity(&unmatched).cut_or_thrust_with_matching_integrity_loss);
    }

    #[test]
    fn later_contacts_cannot_rewrite_or_supply_first_contact_productivity() {
        let original = FirstContactEvidence { tick: 2, cross_tick: Some(1),
            region: Some(BodyPart::Legs), hand: Some(LimbSlot::RightArm),
            attributed_facts: 1, competing_facts: 0, dissipated_raw: 1,
            cut_or_thrust_raw: 1, matching_integrity_loss_raw: 1 };
        let later_candidate = FirstContactEvidence { tick: 9, cross_tick: Some(9),
            region: Some(BodyPart::Head), hand: Some(LimbSlot::LeftArm),
            attributed_facts: 1, competing_facts: 4, dissipated_raw: 999,
            cut_or_thrust_raw: 999, matching_integrity_loss_raw: 999 };
        let mut frozen = None;
        assert!(freeze_first_contact(&mut frozen, original));
        assert!(!freeze_first_contact(&mut frozen, later_candidate));
        assert_eq!(frozen, Some(original));

        let first = productive_tactical();
        let expected = tactical_productivity(&first);
        let mut later = first;
        later.intended_region = Some(BodyPart::Head);
        later.intended_hand = Some(LimbSlot::LeftArm);
        later.first_cross_tick = Some(9);
        later.peak_dissipated_raw = 999;
        later.cut_raw = 999;
        later.integrity_loss_raw[BodyPart::Head as usize] = 999;
        later.waterfall.weapon_body_facts = 9;
        assert_eq!(tactical_productivity(&later), expected);

        let mut failed_first = later;
        failed_first.first_contact_competing_facts = 1;
        failed_first.first_contact_dissipated_raw = 0;
        failed_first.first_contact_cut_or_thrust_raw = 0;
        failed_first.first_contact_matching_integrity_loss_raw = 0;
        let productivity = tactical_productivity(&failed_first);
        assert!(!productivity.unique_crossing_contact_with_dissipation);
        assert!(!productivity.cut_or_thrust_with_matching_integrity_loss);
    }

    #[test]
    fn productivity_keeps_all_nine_hundred_rows_in_its_denominator() {
        assert!(!productivity_passes_denominator(CALIBRATION_CASES as u32, 1, 1));
        assert!(productivity_passes_denominator(CALIBRATION_CASES as u32, 855, 810));
        assert!(!productivity_passes_denominator(CALIBRATION_CASES as u32, 854, 810));
        assert!(!productivity_passes_denominator(CALIBRATION_CASES as u32, 855, 809));
    }

    #[test]
    fn calibration_csv_has_a_fixed_header_order_and_final_newline() {
        assert!(CALIBRATION_CSV_HEADER.ends_with('\n'));
        let columns: Vec<_> = CALIBRATION_CSV_HEADER.trim_end().split(',').collect();
        assert_eq!(&columns[0..6], &["fingerprint", "seed", "mirrored", "target",
            "offset_x_raw", "offset_y_raw"]);
        assert_eq!(&columns[columns.len() - 10..], &["commits", "crossings",
            "weapon_body_facts", "positive_closing", "dissipated_groups", "above_floor",
            "cut_or_thrust", "integrity_losses", "open_wounds", "body_decisions"]);
        for name in ["tactical_integrity_loss_head_raw", "tactical_integrity_loss_torso_raw",
            "tactical_integrity_loss_left_arm_raw", "tactical_integrity_loss_right_arm_raw",
            "tactical_integrity_loss_legs_raw", "tactical_wound_gain_head_raw",
            "tactical_wound_gain_torso_raw", "tactical_wound_gain_left_arm_raw",
            "tactical_wound_gain_right_arm_raw", "tactical_wound_gain_legs_raw",
            "tactical_blood_loss_raw"] {
            assert!(columns.contains(&name));
        }
        let mut hash = 0xcbf29ce484222325u64;
        for byte in CALIBRATION_CSV_HEADER.bytes() {
            hash ^= byte as u64; hash = hash.wrapping_mul(0x100000001b3);
        }
        assert_eq!(hash, 0xc4107a3a0fb9ee79,
            "the complete fixed header, including order and spelling, moved");

        let case = strong_strike::StrongCase { seed: 0, mirrored: false,
            target_anatomy: AnatomyChoice::Fighter,
            approach_offset: strong_strike::APPROACH_OFFSETS[4] };
        let mut row = measure_matched_row(case);
        row.before.region = Some(BodyPart::Head);
        row.before.integrity_before_raw = [100; BodyPart::COUNT];
        row.before.integrity_after_raw = [99, 98, 97, 96, 95];
        row.before.wound_before_raw = [0; BodyPart::COUNT];
        row.before.wound_after_raw = [6, 7, 8, 9, 10];
        row.before.blood_before_raw = 100; row.before.blood_after_raw = 89;
        row.held.integrity_before_raw = [200; BodyPart::COUNT];
        row.held.integrity_after_raw = [188, 187, 186, 185, 184];
        row.held.wound_before_raw = [0; BodyPart::COUNT];
        row.held.wound_after_raw = [17, 18, 19, 20, 21];
        row.held.blood_before_raw = 200; row.held.blood_after_raw = 178;
        row.tactical.integrity_loss_raw = [23, 24, 25, 26, 27];
        row.tactical.wound_gain_raw = [28, 29, 30, 31, 32];
        row.tactical.blood_loss_raw = 33;
        row.tactical.unattributed_anatomy_changes = 34;
        row.tactical.first_contact_cross_tick = Some(35);
        row.tactical.first_contact_region = Some(BodyPart::Legs);
        row.tactical.first_contact_hand = Some(LimbSlot::RightArm);
        row.tactical.first_contact_dissipated_raw = 36;
        row.tactical.first_contact_cut_or_thrust_raw = 37;
        row.tactical.first_contact_matching_integrity_loss_raw = 38;
        let csv = calibration_csv_row(&row);
        assert!(csv.ends_with('\n'));
        assert_eq!(csv.bytes().filter(|byte| *byte == b'\n').count(), 1);
        let values: Vec<_> = csv.trim_end().split(',').collect();
        assert_eq!(columns.len(), values.len());
        for (name, expected) in [
            ("reference_region", "head"),
            ("reference_integrity_loss_head_raw", "1"),
            ("reference_integrity_loss_legs_raw", "5"),
            ("reference_wound_gain_head_raw", "6"),
            ("reference_wound_gain_legs_raw", "10"),
            ("reference_blood_loss_raw", "11"),
            ("held_integrity_loss_head_raw", "12"),
            ("held_integrity_loss_legs_raw", "16"),
            ("held_wound_gain_head_raw", "17"),
            ("held_wound_gain_legs_raw", "21"),
            ("held_blood_loss_raw", "22"),
            ("tactical_integrity_loss_head_raw", "23"),
            ("tactical_integrity_loss_legs_raw", "27"),
            ("tactical_wound_gain_head_raw", "28"),
            ("tactical_wound_gain_legs_raw", "32"),
            ("tactical_blood_loss_raw", "33"),
            ("tactical_unattributed_anatomy_changes", "34"),
            ("tactical_first_contact_cross_tick", "35"),
            ("tactical_first_contact_region", "legs"),
            ("tactical_first_contact_hand", "right_arm"),
            ("tactical_first_contact_dissipated_raw", "36"),
            ("tactical_first_contact_cut_or_thrust_raw", "37"),
            ("tactical_first_contact_matching_integrity_loss_raw", "38"),
        ] {
            let at = columns.iter().position(|column| *column == name).unwrap();
            assert_eq!(values[at], expected, "CSV field {name}");
        }
    }

    #[test]
    fn incompatible_tactical_mechanics_modes_are_refused_by_name() {
        let args = Args::parse(vec!["tactical-mechanics".to_string(),
            "--quick".to_string(), "--calibration".to_string()]);
        assert_eq!(incompatible_mode_refusal(&args).as_deref(), Some(
            "tactical-mechanics modes are incompatible: --quick and --calibration"));
        let args = Args::parse(vec!["tactical-mechanics".to_string(),
            "--quick".to_string(), "--write".to_string(), "out.csv".to_string()]);
        assert_eq!(incompatible_mode_refusal(&args).as_deref(), Some(
            "tactical-mechanics --write requires --calibration or --held-out"));
        let args = Args::parse(vec!["tactical-mechanics".to_string(),
            "--quick".to_string(), "--summary-write".to_string(), "summary.txt".to_string()]);
        assert_eq!(incompatible_mode_refusal(&args).as_deref(), Some(
            "tactical-mechanics --summary-write requires --calibration or --held-out"));
        let args = Args::parse(vec!["tactical-mechanics".to_string(),
            "--calibration".to_string(), "--write".to_string(), "rows.csv".to_string(),
            "--summary-write".to_string(), "summary.txt".to_string()]);
        assert_eq!(incompatible_mode_refusal(&args), None);
    }

    #[test]
    fn valueless_tactical_mechanics_output_options_are_refused_by_name() {
        let args = Args::parse(vec!["tactical-mechanics".to_string(),
            "--calibration".to_string(), "--write".to_string()]);
        assert_eq!(incompatible_mode_refusal(&args).as_deref(), Some(
            "tactical-mechanics --write requires PATH"));
        let args = Args::parse(vec!["tactical-mechanics".to_string(),
            "--held-out".to_string(), "--summary-write".to_string()]);
        assert_eq!(incompatible_mode_refusal(&args).as_deref(), Some(
            "tactical-mechanics --summary-write requires PATH"));
    }

    #[test]
    fn tactical_mechanics_refuses_a_threads_override_by_name() {
        for tail in [vec!["--threads".to_string()],
            vec!["--threads".to_string(), "8".to_string()]] {
            let mut tokens = vec!["tactical-mechanics".to_string(),
                "--calibration".to_string()];
            tokens.extend(tail);
            let args = Args::parse(tokens);
            assert_eq!(incompatible_mode_refusal(&args).as_deref(), Some(
                "tactical-mechanics --threads is refused; worker count is fixed at 4"));
        }
    }

    #[test]
    fn summary_write_preserves_the_printed_deterministic_bytes() {
        let mut summary = String::from("tactical-mechanics calibration seeds=0..25 expected_cases=900\n");
        summary.push_str(&summary_line("total", CalibrationSummary::default()));
        summary.push_str("decision=invalid-stop-before-held-out\n");
        let path = std::env::temp_dir().join(
            format!("smart128-summary-seam-{}.txt", std::process::id()));
        write_summary(path.to_str().unwrap(), &summary)
            .expect("write deterministic summary receipt");
        assert_eq!(std::fs::read_to_string(&path).unwrap(), summary);
        std::fs::remove_file(&path).expect("remove summary seam fixture");
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn ordinary_command_strike_and_eighteen_neighbours_pass_the_mirrored_gate() {
        let offset = fx::Vec2::new(Fx::from_raw(-163_840), Fx::from_raw(-65_536));
        let mut rows = 0;
        for strike_delta in strong_strike::STRIKE_TICK_DELTAS {
            for reach_delta in strong_strike::REACH_DELTAS_RAW {
                for mirrored in [false, true] {
                    let measured = strong_strike::measure_noise_free_case_schedule(
                        strong_strike::StrongCase { seed: 0, mirrored,
                            target_anatomy: AnatomyChoice::Brute, approach_offset: offset },
                        (28i32 + strike_delta) as u32,
                        Fx::from_raw(61_440 + reach_delta));
                    let oracle = measured.crossing_oracle
                        .expect("the selected contact must retain both region poses");
                    assert!(swept_segment_segment(
                        measured.previous_weapon.hilt, measured.previous_weapon.tip,
                        measured.requested_weapon.hilt, measured.requested_weapon.tip,
                        measured.previous_weapon.radius.max(measured.requested_weapon.radius),
                        oracle.previous.lower, oracle.previous.upper,
                        oracle.requested.lower, oracle.requested.upper,
                        oracle.previous.radius.max(oracle.requested.radius),
                    ).is_some(), "delta ({strike_delta},{reach_delta}) mirror={mirrored} did not cross");
                    assert_eq!((measured.weapon_body_facts, measured.competing_facts), (1, 0));
                    assert!(measured.contact_tick.is_some());
                    assert_eq!(measured.contact_key.map(|key| (key.0, key.1, key.2, key.3, key.4)),
                        Some((EntityId::new(0, 0), if mirrored { 0 } else { 1 },
                              EntityId::new(1, 0), sim::BODY_SLOT, ContactKind::WeaponBody)));
                    assert_eq!(measured.region, Some(BodyPart::Legs));
                    assert!(measured.toi_raw.is_some_and(|toi| toi > 0 && toi < Fx::ONE.raw()));
                    assert_ne!(measured.impulse_on_a, fx::Vec3::ZERO);
                    assert_eq!(measured.group_alpha_raw, Some(65_536));
                    assert_eq!(measured.energy_dissipated_raw, 278);
                    assert_eq!((measured.refusals, measured.solver_rejections,
                                measured.cap_hits, measured.max_energy_excess_raw),
                               (0, 0, 0, 0));
                    assert_eq!(strong_strike::source_41_policy_command_receipt(
                        strike_delta, reach_delta, mirrored),
                        sim::lifted_coulomb_command_receipt(strike_delta, reach_delta, mirrored),
                        "stored command receipt delta ({strike_delta},{reach_delta}) mirror={mirrored}");
                    rows += 1;
                }
            }
        }
        assert_eq!(rows, 18);
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn retained_strike_is_selected_by_mechanics_and_then_records_a_wound() {
        let measured = strong_strike::measure_noise_free_case_schedule(
            strong_strike::StrongCase { seed: 0, mirrored: false,
                target_anatomy: AnatomyChoice::Brute,
                approach_offset: fx::Vec2::new(Fx::from_raw(-163_840), Fx::from_raw(-65_536)) },
            28, Fx::from_raw(61_440));
        assert_eq!((measured.weapon_body_facts, measured.competing_facts,
                    measured.energy_dissipated_raw), (1, 0, 278));
        assert_ne!(measured.impulse_on_a, fx::Vec3::ZERO,
            "mechanics must select a response before damage is inspected");
        assert_eq!((measured.refusals, measured.solver_rejections,
                    measured.cap_hits, measured.max_energy_excess_raw), (0, 0, 0, 0));
        let damaged = measured.cut_raw > 0 || measured.thrust_raw > 0;
        let wounded = measured.integrity_after_raw != measured.integrity_before_raw
            || measured.wound_after_raw != measured.wound_before_raw
            || measured.blood_after_raw != measured.blood_before_raw;
        assert!(damaged && wounded,
            "the mechanically selected central strike recorded no wound");
    }

    #[test]
    fn attribution_requires_the_attacker_weapon_and_the_named_defender_body() {
        let attacker = EntityId::new(0, 0);
        let defender = EntityId::new(1, 0);
        let other = EntityId::new(2, 0);
        let belongs = |kind, fact_region, a, a_slot, b, b_slot| belongs_to_fields(
            kind, fact_region, a, a_slot, b, b_slot, attacker, defender,
            LimbSlot::RightArm, BodyPart::Torso,
        );
        assert!(belongs(ContactKind::WeaponBody, BodyPart::Torso as u8,
            attacker, LimbSlot::RightArm as u8, defender, sim::BODY_SLOT));
        assert!(!belongs(ContactKind::WeaponBody, BodyPart::Torso as u8,
            attacker, LimbSlot::RightArm as u8, other, sim::BODY_SLOT));
        assert!(!belongs(ContactKind::WeaponBody, BodyPart::Torso as u8,
            attacker, LimbSlot::RightArm as u8, defender, LimbSlot::LeftArm as u8));
        assert!(!belongs(ContactKind::WeaponBody, BodyPart::Torso as u8,
            defender, sim::BODY_SLOT, attacker, LimbSlot::RightArm as u8));
        assert!(!belongs(ContactKind::WeaponBody, BodyPart::Legs as u8,
            attacker, LimbSlot::RightArm as u8, defender, sim::BODY_SLOT));
        assert!(!belongs(ContactKind::WeaponShield, BodyPart::Torso as u8,
            attacker, LimbSlot::RightArm as u8, defender, sim::BODY_SLOT));
    }

    #[test]
    fn bracketed_reference_rows_are_byte_identical() {
        assert_eq!(strong_strike::measure(Fx::ONE), strong_strike::measure(Fx::ONE));
        assert_eq!(strong_strike::scenario().fingerprint(), strong_strike::scenario().fingerprint());
    }

    #[test]
    fn calibration_and_held_out_seed_ranges_are_disjoint() {
        assert!(CALIBRATION_SEEDS.end <= HELD_OUT_SEEDS.start);
    }

    #[test]
    fn matched_rows_share_fingerprint_seed_mirror_anatomy_and_offset() {
        let case = strong_strike::StrongCase { seed: 0, mirrored: false,
            target_anatomy: AnatomyChoice::Fighter, approach_offset: strong_strike::APPROACH_OFFSETS[4] };
        let row = measure_tactical(case);
        assert_eq!(row.scenario_fingerprint, strong_strike::scenario_for(case).fingerprint());
        assert_eq!((row.seed, row.mirrored), (0, false));
    }

    #[test]
    fn tactical_validity_rejects_unattributed_anatomy_changes() {
        let case = strong_strike::StrongCase { seed: 0, mirrored: false,
            target_anatomy: AnatomyChoice::Fighter,
            approach_offset: strong_strike::APPROACH_OFFSETS[4] };
        let mut row = measure_tactical(case);
        row.refusals = 0;
        row.solver_rejections = 0;
        row.max_energy_excess_raw = 0;
        row.first_contact_tick = None;
        row.first_cross_tick = None;
        row.unattributed_anatomy_changes = 0;
        assert!(tactical_is_legal(&row));
        row.unattributed_anatomy_changes = 1;
        assert!(!tactical_is_legal(&row));
    }

    #[test]
    fn one_resolution_is_attributed_only_to_its_intended_hand_region_and_sweep() {
        let row = measure_tactical(strong_strike::StrongCase { seed: 0, mirrored: false,
            target_anatomy: AnatomyChoice::Fighter, approach_offset: strong_strike::APPROACH_OFFSETS[4] });
        assert_eq!(row.refusals, 0);
        assert_eq!(row.solver_rejections, 0);
        assert!(row.waterfall.weapon_body_facts >= row.waterfall.cut_or_thrust);
        assert_eq!(row.unattributed_anatomy_changes, 0);
    }

    #[test]
    fn ordinal_31_provenance_refuses_every_measurement_override() {
        let valid = Args::parse(vec!["tactical-mechanics".into(),
            "--ordinal-31-provenance".into(), "--write".into(), "trace.txt".into()]);
        assert_eq!(ordinal_31_provenance_refusal(&valid), None);
        #[cfg(not(feature = "cartesian-recoil"))]
        assert_eq!(ordinal_31_provenance_mode(&valid),
            Err("tactical-mechanics --ordinal-31-provenance requires --features cartesian-recoil; no artifact was written".into()));

        for option in ["quick", "calibration", "held-out", "strike-corpus",
            "anatomical-mirror-corpus", "noise-free-mirror-corpus", "mirror-trace-1536",
            "seed", "seeds", "ordinal", "tolerance", "strike-delta", "reach-delta",
            "ticks", "chamber", "strike", "reach", "effort", "mirrored",
            "threads", "summary-write", "unknown"]
        {
            for tail in [vec![format!("--{option}")],
                         vec![format!("--{option}"), "1".into()]] {
                let mut tokens = vec!["tactical-mechanics".into(),
                    "--ordinal-31-provenance".into(), "--write".into(), "trace.txt".into()];
                tokens.extend(tail);
                let refusal = ordinal_31_provenance_refusal(&Args::parse(tokens))
                    .unwrap_or_else(|| panic!("--{option} was accepted"));
                assert!(refusal.contains(&format!("--{option}")), "{refusal}");
            }
        }
        for tokens in [
            vec!["tactical-mechanics", "--ordinal-31-provenance"],
            vec!["tactical-mechanics", "--ordinal-31-provenance", "--write"],
            vec!["tactical-mechanics", "--ordinal-31-provenance", "value", "--write", "trace.txt"],
            vec!["tactical-mechanics", "--ordinal-31-provenance", "--ordinal-31-provenance",
                 "--write", "trace.txt"],
            vec!["tactical-mechanics", "--ordinal-31-provenance", "--write", "a",
                 "--write", "b"],
            vec!["tactical-mechanics", "--ordinal-31-provenance", "--write", "trace.txt", "extra"],
        ] {
            let args = Args::parse(tokens.iter().map(|token| (*token).to_string()).collect());
            assert!(ordinal_31_provenance_refusal(&args).is_some(), "{tokens:?}");
        }
    }

    #[cfg(feature = "cartesian-recoil")]
    fn assert_boundary_diagnostic_grammar(artifact: &str, arm: &str) {
        let lines = artifact.lines().collect::<Vec<_>>();
        let scan_prefix = format!("boundary.{arm}.scan_pair");
        let scans = lines.iter().filter(|line| **line == format!("{scan_prefix}=none")
                || line.starts_with(&format!("{scan_prefix} ")))
            .copied().collect::<Vec<_>>();
        assert_eq!(scans.len(), 1, "{arm} must have exactly one labelled scan header");
        assert!(scans[0] == format!("{scan_prefix}=none")
            || scans[0].starts_with(&format!("{scan_prefix} a_index=")), "{}", scans[0]);

        let count_prefix = format!("boundary.{arm}.group_count=");
        let counts = lines.iter().filter_map(|line| line.strip_prefix(&count_prefix))
            .collect::<Vec<_>>();
        assert_eq!(counts.len(), 1, "{arm} must have exactly one labelled group count");
        let count = counts[0].parse::<usize>().expect("the group count must be an integer");
        let group_prefix = format!("boundary.{arm}.group index=");
        assert_eq!(lines.iter().filter(|line| line.starts_with(&group_prefix)).count(), count,
            "{arm} group count must equal its labelled group rows");

        let exact_prefix = format!("boundary.{arm}.first_exact_rejection");
        let exact = lines.iter().filter(|line| line.starts_with(&exact_prefix))
            .copied().collect::<Vec<_>>();
        assert_eq!(exact.len(), 1, "{arm} must have exactly one exact-first diagnostic");
        assert!(exact[0] == format!("{exact_prefix}=none")
            || exact[0].starts_with(&format!("{exact_prefix} tick=")), "{}", exact[0]);

        let generic_prefix = format!("boundary_arm label={arm} ");
        let generic = lines.iter().filter(|line| line.starts_with(&generic_prefix))
            .copied().collect::<Vec<_>>();
        assert_eq!(generic.len(), 1, "{arm} must have exactly one generic-first diagnostic");
        assert!(generic[0].contains(" first_rejection="), "{}", generic[0]);
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn ordinal_31_boundary_diagnostic_grammar_is_arm_labelled_and_counted() {
        let empty = "boundary_arm label=reference solver_delta=0 solver_after=0 first_rejection=none\n\
boundary.reference.first_exact_rejection=none\n\
boundary.reference.scan_pair=none\n\
boundary.reference.group_count=0\n";
        assert_boundary_diagnostic_grammar(empty, "reference");
        let populated = "boundary_arm label=held solver_delta=1 solver_after=2 first_rejection=arithmetic_envelope\n\
boundary.held.first_exact_rejection tick=4 phase=solve_group cause=arithmetic_envelope key=none\n\
boundary.held.scan_pair a_index=0\n\
boundary.held.scan_pair.segment_body=none\n\
boundary.held.group_count=1\n\
boundary.held.group index=0 tick=4\n";
        assert_boundary_diagnostic_grammar(populated, "held");
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn ordinal_31_provenance_artifact_is_byte_identical_and_atomic() {
        let artifact = strong_strike::ordinal_31_provenance_artifact()
            .expect("the frozen trace must render");
        let repeated = strong_strike::ordinal_31_provenance_artifact()
            .expect("the repeated frozen trace must render");
        assert_eq!(artifact.as_bytes(), repeated.as_bytes());
        assert!(artifact.starts_with("smart130-ordinal31-arm-provenance-v1\n"));
        assert!(artifact.ends_with('\n'));
        assert!(!artifact.contains('\r'));
        assert!(artifact.contains("state_before=articulated_v1:"));
        assert!(artifact.contains("hint_left=idle") || artifact.contains("hint_left=chasing")
            || artifact.contains("hint_left=braced") || artifact.contains("hint_left=contact")
            || artifact.contains("hint_left=recoiling") || artifact.contains("hint_left=severed"));
        assert_boundary_diagnostic_grammar(&artifact, "reference");
        assert_boundary_diagnostic_grammar(&artifact, "held");

        let stem = std::env::temp_dir().join(format!(
            "smart130-atomic-{}-{:?}", std::process::id(), std::thread::current().id()));
        let path = stem.to_string_lossy().into_owned();
        let temporary = format!("{path}.tmp");
        assert!(!std::path::Path::new(&path).exists());
        assert!(!std::path::Path::new(&temporary).exists());
        write_ordinal_31_provenance(&path, artifact.as_bytes()).expect("atomic publication");
        assert_eq!(std::fs::read(&path).unwrap(), artifact.as_bytes());
        assert!(!std::path::Path::new(&temporary).exists());
        let refusal = write_ordinal_31_provenance(&path, b"replacement")
            .expect_err("an existing final must not be replaced");
        assert!(refusal.contains("refuses existing destination"));
        assert_eq!(std::fs::read(&path).unwrap(), artifact.as_bytes());
        std::fs::remove_file(&path).unwrap();

        std::fs::write(&temporary, b"sentinel").unwrap();
        let refusal = write_ordinal_31_provenance(&path, artifact.as_bytes())
            .expect_err("an existing temporary must not be replaced");
        assert!(refusal.contains("refuses existing temporary"));
        assert!(!std::path::Path::new(&path).exists());
        assert_eq!(std::fs::read(&temporary).unwrap(), b"sentinel");
        std::fs::remove_file(&temporary).unwrap();

        for failure in [ProvenanceWriteFailure::Open, ProvenanceWriteFailure::Write,
                        ProvenanceWriteFailure::Flush, ProvenanceWriteFailure::Rename] {
            let refusal = write_ordinal_31_provenance_with(&path, artifact.as_bytes(), Some(failure))
                .expect_err("an injected publication failure must be refused");
            assert!(refusal.contains("no artifact was written"));
            assert!(!std::path::Path::new(&path).exists());
            assert!(!std::path::Path::new(&temporary).exists());
        }
    }

    #[test]
    fn ordinal_31_tick_46_scan_budget_refuses_every_measurement_override() {
        let valid = Args::parse(vec!["tactical-mechanics".into(),
            "--ordinal-31-tick-46-scan".into(), "--write".into(), "trace.txt".into()]);
        assert_eq!(ordinal_31_tick_46_scan_refusal(&valid), None);
        #[cfg(not(feature = "cartesian-recoil"))]
        assert_eq!(ordinal_31_tick_46_scan_mode(&valid),
            Err("tactical-mechanics --ordinal-31-tick-46-scan requires --features cartesian-recoil; no artifact was written".into()));

        for option in ["quick", "calibration", "held-out", "strike-corpus",
            "anatomical-mirror-corpus", "noise-free-mirror-corpus", "mirror-trace-1536",
            "ordinal-31-provenance", "seed", "seeds", "ordinal", "tolerance",
            "strike-delta", "reach-delta", "ticks", "horizon", "chamber", "strike",
            "reach", "effort", "mirrored", "threads", "summary-write", "unknown"]
        {
            for tail in [vec![format!("--{option}")],
                         vec![format!("--{option}"), "1".into()]] {
                let mut tokens = vec!["tactical-mechanics".into(),
                    "--ordinal-31-tick-46-scan".into(), "--write".into(), "trace.txt".into()];
                tokens.extend(tail);
                let refusal = ordinal_31_tick_46_scan_refusal(&Args::parse(tokens))
                    .unwrap_or_else(|| panic!("--{option} was accepted"));
                assert!(refusal.contains(&format!("--{option}")), "{refusal}");
            }
        }
        for tokens in [
            vec!["tactical-mechanics", "--ordinal-31-tick-46-scan"],
            vec!["tactical-mechanics", "--ordinal-31-tick-46-scan", "--write"],
            vec!["tactical-mechanics", "--ordinal-31-tick-46-scan", "value", "--write", "trace.txt"],
            vec!["tactical-mechanics", "--ordinal-31-tick-46-scan",
                 "--ordinal-31-tick-46-scan", "--write", "trace.txt"],
            vec!["tactical-mechanics", "--ordinal-31-tick-46-scan", "--write", "a",
                 "--write", "b"],
            vec!["tactical-mechanics", "--ordinal-31-tick-46-scan", "--write", "trace.txt", "extra"],
        ] {
            let args = Args::parse(tokens.iter().map(|token| (*token).to_string()).collect());
            assert!(ordinal_31_tick_46_scan_refusal(&args).is_some(), "{tokens:?}");
        }
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn ordinal_31_tick_46_scan_budget_artifact_is_byte_identical_and_atomic() {
        let artifact = strong_strike::ordinal_31_tick_46_scan_artifact()
            .expect("the frozen scan-budget trace must render");
        let repeated = strong_strike::ordinal_31_tick_46_scan_artifact()
            .expect("the repeated frozen scan-budget trace must render");
        assert_eq!(artifact.as_bytes(), repeated.as_bytes());
        assert!(artifact.starts_with("smart131-ordinal31-tick46-scan-budget-v1\n"));
        assert!(artifact.ends_with('\n'));
        assert!(!artifact.contains('\r'));
        assert!(artifact.is_ascii());

        let stem = std::env::temp_dir().join(format!(
            "smart131-atomic-{}-{:?}", std::process::id(), std::thread::current().id()));
        let path = stem.to_string_lossy().into_owned();
        let temporary = format!("{path}.tmp");
        assert!(!std::path::Path::new(&path).exists());
        assert!(!std::path::Path::new(&temporary).exists());
        write_ordinal_31_tick_46_scan(&path, artifact.as_bytes()).expect("atomic publication");
        assert_eq!(std::fs::read(&path).unwrap(), artifact.as_bytes());
        assert!(!std::path::Path::new(&temporary).exists());
        let refusal = write_ordinal_31_tick_46_scan(&path, b"replacement")
            .expect_err("an existing final must not be replaced");
        assert!(refusal.contains("refuses existing destination"));
        assert_eq!(std::fs::read(&path).unwrap(), artifact.as_bytes());
        std::fs::remove_file(&path).unwrap();

        std::fs::write(&temporary, b"sentinel").unwrap();
        let refusal = write_ordinal_31_tick_46_scan(&path, artifact.as_bytes())
            .expect_err("an existing temporary must not be replaced");
        assert!(refusal.contains("refuses existing temporary"));
        assert!(!std::path::Path::new(&path).exists());
        assert_eq!(std::fs::read(&temporary).unwrap(), b"sentinel");
        std::fs::remove_file(&temporary).unwrap();

        for failure in [ScanWriteFailure::Open, ScanWriteFailure::Write,
                        ScanWriteFailure::Flush, ScanWriteFailure::Rename] {
            let refusal = write_ordinal_31_tick_46_scan_with(
                &path, artifact.as_bytes(), Some(failure))
                .expect_err("an injected publication failure must be refused");
            assert!(refusal.contains("no artifact was written"));
            assert!(!std::path::Path::new(&path).exists());
            assert!(!std::path::Path::new(&temporary).exists());
        }
    }

    #[test]
    fn ordinal_31_tick_46_pair_aabb_refuses_every_measurement_override() {
        const MODE: &str = "ordinal-31-tick-46-pair-aabb";
        let valid = Args::parse(vec!["tactical-mechanics".into(), format!("--{MODE}"),
            "--write".into(), "trace.txt".into()]);
        assert_eq!(ordinal_31_tick_46_pair_aabb_refusal(&valid), None);
        #[cfg(not(feature = "cartesian-recoil"))]
        assert_eq!(ordinal_31_tick_46_pair_aabb_mode(&valid),
            Err(format!("tactical-mechanics --{MODE} requires --features cartesian-recoil; no artifact was written")));
        for option in ["quick", "calibration", "held-out", "strike-corpus",
            "anatomical-mirror-corpus", "noise-free-mirror-corpus", "mirror-trace-1536",
            "ordinal-31-provenance", "ordinal-31-tick-46-scan", "seed", "seeds", "ordinal",
            "target", "offset", "offset-x", "offset-y", "ticks", "horizon", "tick",
            "chamber", "strike", "reach", "effort", "mirrored", "threads",
            "summary-write", "unknown"]
        {
            for tail in [vec![format!("--{option}")], vec![format!("--{option}"), "1".into()]] {
                let mut tokens = vec!["tactical-mechanics".into(), format!("--{MODE}"),
                    "--write".into(), "trace.txt".into()];
                tokens.extend(tail);
                let refusal = ordinal_31_tick_46_pair_aabb_refusal(&Args::parse(tokens))
                    .unwrap_or_else(|| panic!("--{option} was accepted"));
                assert!(refusal.contains(&format!("--{option}")), "{refusal}");
            }
        }
        for tokens in [
            vec!["tactical-mechanics", "--ordinal-31-tick-46-pair-aabb"],
            vec!["tactical-mechanics", "--ordinal-31-tick-46-pair-aabb", "--write"],
            vec!["tactical-mechanics", "--ordinal-31-tick-46-pair-aabb", "value", "--write", "trace.txt"],
            vec!["tactical-mechanics", "--ordinal-31-tick-46-pair-aabb",
                 "--ordinal-31-tick-46-pair-aabb", "--write", "trace.txt"],
            vec!["tactical-mechanics", "--ordinal-31-tick-46-pair-aabb", "--write", "a", "--write", "b"],
            vec!["tactical-mechanics", "--ordinal-31-tick-46-pair-aabb", "--write", "trace.txt", "extra"],
        ] {
            let args = Args::parse(tokens.iter().map(|token| (*token).to_string()).collect());
            assert!(ordinal_31_tick_46_pair_aabb_refusal(&args).is_some(), "{tokens:?}");
        }
        #[cfg(feature = "cartesian-recoil")]
        {
            assert_eq!(strong_strike::SMART132_WORKER_NAME,
                       "smart132-ordinal31-tick46-pair-aabb");
            assert_eq!(strong_strike::SMART132_STACK_BYTES, 16 * 1024 * 1024);
        }
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn ordinal_31_tick_46_pair_aabb_artifact_is_byte_identical_and_atomic() {
        let artifact = strong_strike::ordinal_31_tick_46_pair_aabb_artifact()
            .expect("the frozen pair-AABB trace must render");
        let repeated = strong_strike::ordinal_31_tick_46_pair_aabb_artifact()
            .expect("the repeated pair-AABB trace must render");
        assert_eq!(artifact.as_bytes(), repeated.as_bytes());
        assert!(artifact.starts_with("smart132-ordinal31-tick46-pair-aabb-control-v1\n"));
        assert!(artifact.ends_with('\n') && artifact.is_ascii() && !artifact.contains('\r'));
        let lines: Vec<_> = artifact.lines().collect();
        let points = lines.iter().filter(|line| line.starts_with("point ")).count();
        let bounds = lines.iter().filter(|line| line.starts_with("bound ")).count();
        let gaps = lines.iter().filter(|line| line.starts_with("gap ")).count();
        assert_eq!(lines.len(), 21 + points + bounds + gaps);
        assert_eq!(lines.iter().filter(|line| line.starts_with("first_aabb_difference ")).count(), 1);

        let stem = std::env::temp_dir().join(format!(
            "smart132-atomic-{}-{:?}", std::process::id(), std::thread::current().id()));
        let path = stem.to_string_lossy().into_owned();
        let temporary = format!("{path}.tmp");
        assert!(!std::path::Path::new(&path).exists());
        assert!(!std::path::Path::new(&temporary).exists());
        write_ordinal_31_tick_46_pair_aabb(&path, artifact.as_bytes()).expect("atomic publication");
        assert_eq!(std::fs::read(&path).unwrap(), artifact.as_bytes());
        assert!(!std::path::Path::new(&temporary).exists());
        let refusal = write_ordinal_31_tick_46_pair_aabb(&path, b"replacement")
            .expect_err("an existing final must not be replaced");
        assert!(refusal.contains("refuses existing destination"));
        assert_eq!(std::fs::read(&path).unwrap(), artifact.as_bytes());
        std::fs::remove_file(&path).unwrap();

        std::fs::write(&temporary, b"external-temp").unwrap();
        let refusal = write_ordinal_31_tick_46_pair_aabb(&path, artifact.as_bytes())
            .expect_err("an existing temporary must not be replaced");
        assert!(refusal.contains("refuses existing temporary"));
        assert_eq!(std::fs::read(&temporary).unwrap(), b"external-temp");
        std::fs::remove_file(&temporary).unwrap();

        for failure in [PairAabbWriteFailure::Open, PairAabbWriteFailure::Write,
                        PairAabbWriteFailure::Flush, PairAabbWriteFailure::Rename] {
            let refusal = write_ordinal_31_tick_46_pair_aabb_with(
                &path, artifact.as_bytes(), Some(failure))
                .expect_err("an injected publication failure must be refused");
            assert!(refusal.contains("no artifact was written"));
            assert!(!std::path::Path::new(&path).exists());
            assert!(!std::path::Path::new(&temporary).exists());
        }
        let refusal = write_ordinal_31_tick_46_pair_aabb_with(
            &path, artifact.as_bytes(), Some(PairAabbWriteFailure::DestinationAppeared))
            .expect_err("a destination race must be refused");
        assert!(refusal.contains("no artifact was written"));
        assert_eq!(std::fs::read(&path).unwrap(), b"external-sentinel");
        assert!(!std::path::Path::new(&temporary).exists());
        std::fs::remove_file(&path).unwrap();
    }

    #[test]
    fn ordinal_31_tick_46_segment_hilt_start_x_refuses_every_measurement_override() {
        const MODE: &str = "ordinal-31-tick-46-segment-hilt-start-x";
        let valid = Args::parse(vec!["tactical-mechanics".into(), format!("--{MODE}"),
            "--write".into(), "trace.txt".into()]);
        assert_eq!(ordinal_31_tick_46_segment_hilt_start_x_refusal(&valid), None);
        for option in TACTICAL_MODES.into_iter().filter(|mode| *mode != MODE).chain([
            "seed", "seeds", "ordinal", "target", "offset", "offset-x", "offset-y",
            "ticks", "horizon", "tick", "chamber", "strike", "reach", "effort",
            "mirrored", "threads", "summary-write", "unknown"]) {
            for tail in [vec![format!("--{option}")], vec![format!("--{option}"), "1".into()]] {
                let mut tokens = vec!["tactical-mechanics".into(), format!("--{MODE}"),
                    "--write".into(), "trace.txt".into()]; tokens.extend(tail);
                let refusal = ordinal_31_tick_46_segment_hilt_start_x_refusal(&Args::parse(tokens))
                    .unwrap_or_else(|| panic!("--{option} was accepted"));
                assert!(refusal.contains(&format!("--{option}")));
            }
        }
        for tokens in [
            vec!["tactical-mechanics", "--ordinal-31-tick-46-segment-hilt-start-x"],
            vec!["tactical-mechanics", "--ordinal-31-tick-46-segment-hilt-start-x", "--write"],
            vec!["tactical-mechanics", "--ordinal-31-tick-46-segment-hilt-start-x", "value", "--write", "x"],
            vec!["tactical-mechanics", "--ordinal-31-tick-46-segment-hilt-start-x", "--write", "a", "--write", "b"],
        ] {
            assert!(ordinal_31_tick_46_segment_hilt_start_x_refusal(&Args::parse(
                tokens.into_iter().map(str::to_string).collect())).is_some());
        }
        #[cfg(feature = "cartesian-recoil")]
        assert_eq!((strong_strike::SMART133_WORKER_NAME, strong_strike::SMART133_STACK_BYTES),
                   ("smart133-ordinal31-tick46-segment-hilt-start-x", 16 * 1024 * 1024));
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn ordinal_31_tick_46_segment_hilt_start_x_artifact_is_byte_identical_and_atomic() {
        let artifact = strong_strike::ordinal_31_tick_46_segment_hilt_start_x_artifact().unwrap();
        let repeated = strong_strike::ordinal_31_tick_46_segment_hilt_start_x_artifact().unwrap();
        assert_eq!(artifact.as_bytes(), repeated.as_bytes());
        assert_eq!(artifact.lines().count(), 138);
        assert!(artifact.starts_with("smart133-ordinal31-tick46-segment-hilt-start-x-v1\n")
            && artifact.ends_with('\n') && artifact.is_ascii() && !artifact.contains('\r'));
        let stem = std::env::temp_dir().join(format!("smart133-atomic-{}-{:?}",
            std::process::id(), std::thread::current().id()));
        let path = stem.to_string_lossy().into_owned(); let temporary = format!("{path}.tmp");
        assert!(!std::path::Path::new(&path).exists() && !std::path::Path::new(&temporary).exists());
        write_ordinal_31_tick_46_segment_hilt_start_x(&path, artifact.as_bytes()).unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), artifact.as_bytes());
        assert!(!std::path::Path::new(&temporary).exists());
        assert!(write_ordinal_31_tick_46_segment_hilt_start_x(&path, b"replacement").is_err());
        assert_eq!(std::fs::read(&path).unwrap(), artifact.as_bytes());
        std::fs::remove_file(&path).unwrap();
        for failure in [PointXWriteFailure::Open, PointXWriteFailure::Write,
                        PointXWriteFailure::Flush, PointXWriteFailure::Rename] {
            assert!(write_ordinal_31_tick_46_segment_hilt_start_x_with(
                &path, artifact.as_bytes(), Some(failure)).is_err());
            assert!(!std::path::Path::new(&path).exists()
                && !std::path::Path::new(&temporary).exists());
        }
        assert!(write_ordinal_31_tick_46_segment_hilt_start_x_with(&path,
            artifact.as_bytes(), Some(PointXWriteFailure::DestinationAppeared)).is_err());
        assert_eq!(std::fs::read(&path).unwrap(), b"external-sentinel");
        assert!(!std::path::Path::new(&temporary).exists()); std::fs::remove_file(&path).unwrap();
        let args = Args::parse(vec!["tactical-mechanics".into(),
            "--ordinal-31-tick-46-segment-hilt-start-x".into(), "--write".into(), path.clone()]);
        for failure in [PointXWorkerFailure::Start, PointXWorkerFailure::Panic] {
            let error = ordinal_31_tick_46_segment_hilt_start_x_mode_with(&args, Some(failure))
                .expect_err("the injected worker failure must refuse publication");
            assert!(error.contains(if failure == PointXWorkerFailure::Start {
                "worker start failed" } else { "worker panicked" }));
            assert!(!std::path::Path::new(&path).exists()
                && !std::path::Path::new(&temporary).exists());
        }
    }
}
