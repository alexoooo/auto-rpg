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
const HELD_OUT_SEEDS: core::ops::Range<u64> = 900_000..900_100;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
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

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
struct TacticalRow {
    scenario_fingerprint: u64,
    seed: u64,
    mirrored: bool,
    intended_region: Option<BodyPart>,
    intended_hand: Option<LimbSlot>,
    first_cross_tick: Option<u32>,
    first_contact_tick: Option<u32>,
    peak_tip_speed_raw: i32,
    peak_normal_closing_raw: i32,
    peak_energy_before_raw: u64,
    peak_dissipated_raw: u64,
    cut_raw: u64,
    thrust_raw: u64,
    pressure_raw: u64,
    integrity_loss_raw: i32,
    wound_gain_raw: i32,
    unattributed_anatomy_changes: u32,
    decision_tick: Option<u32>,
    outcome: Option<Outcome>,
    refusals: u32,
    solver_rejections: u32,
    max_energy_excess_raw: u64,
    waterfall: Waterfall,
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
    belongs_to_fields(row.fact.key.kind, row.fact.region, row.fact.key.a,
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

fn tactical_valid(row: &TacticalRow) -> bool {
    row.refusals == 0 && row.solver_rejections == 0 && row.max_energy_excess_raw == 0
        && row.unattributed_anatomy_changes == 0
        && (row.first_contact_tick.is_none() || row.first_cross_tick.is_some())
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
    let mut first_contact_tick = None;
    let mut peak_tip_speed_raw = 0;
    let mut peak_normal_closing_raw = 0;
    let mut peak_energy_before_raw = 0;
    let mut peak_dissipated_raw = 0;
    let mut cut_raw = 0u64;
    let mut thrust_raw = 0u64;
    let mut pressure_raw = 0u64;
    let mut integrity_loss_raw = 0;
    let mut wound_gain_raw = 0;
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
                if crosses(previous, current, region) && first_cross_tick.is_none() {
                    first_cross_tick = Some(world.tick()); waterfall.crossings += 1;
                }
            }
        }
        previous_weapon = after;

        let integrity_before = intended_region.map(|part| defender_before.integrity_fraction[part as usize]);
        let wound_before = intended_region.map(|part| defender_before.wound_fraction[part as usize]);
        let mut matching_cut_or_thrust = false;
        for row in world.contact_resolutions() {
            max_energy_excess_raw = max_energy_excess_raw.max(
                row.energy.after_raw.saturating_sub(row.energy.before_raw));
            let (Some(hand), Some(region)) = (intended_hand, intended_region) else { continue };
            if !was_committed || !belongs_to(row, attacker, defender, hand, region) { continue; }
            waterfall.weapon_body_facts += 1;
            first_contact_tick.get_or_insert(world.tick());
            let closing = normal_closing(row);
            peak_normal_closing_raw = peak_normal_closing_raw.max(closing.raw());
            waterfall.positive_closing += u32::from(closing.is_positive());
            peak_energy_before_raw = peak_energy_before_raw.max(row.energy.before_raw);
            peak_dissipated_raw = peak_dissipated_raw.max(row.energy.dissipated_raw);
            waterfall.dissipated_groups += u32::from(row.energy.dissipated_raw > 0);
            // ContactResolution does not publish the pre-floor allocated share.
            // A positive channel sum is the first observable post-floor stage.
            let channels = row.cut_raw + row.thrust_raw + row.pressure_raw;
            waterfall.above_floor += u32::from(channels > 0);
            waterfall.cut_or_thrust += u32::from(row.cut_raw + row.thrust_raw > 0);
            matching_cut_or_thrust |= row.cut_raw + row.thrust_raw > 0;
            cut_raw += row.cut_raw; thrust_raw += row.thrust_raw; pressure_raw += row.pressure_raw;
        }
        if let Some(part) = intended_region {
            let at = part as usize;
            if let Some(before) = integrity_before {
                let loss = (before - defender_after.integrity_fraction[at]).raw().max(0);
                if loss > 0 {
                    if matching_cut_or_thrust {
                        waterfall.integrity_losses += 1; integrity_loss_raw += loss;
                    } else {
                        unattributed_anatomy_changes += 1;
                    }
                }
            }
            if let Some(before) = wound_before {
                let gain = (defender_after.wound_fraction[at] - before).raw().max(0);
                if gain > 0 {
                    if matching_cut_or_thrust {
                        waterfall.open_wounds += 1; wound_gain_raw += gain;
                    } else {
                        unattributed_anatomy_changes += 1;
                    }
                }
            }
        }
    }
    waterfall.body_decisions = u32::from(world.outcome().is_some() && world.tick() < scenario.max_ticks);
    TacticalRow {
        scenario_fingerprint: fingerprint, seed: case.seed, mirrored: case.mirrored, intended_region,
        intended_hand, first_cross_tick, first_contact_tick, peak_tip_speed_raw,
        peak_normal_closing_raw, peak_energy_before_raw, peak_dissipated_raw,
        cut_raw, thrust_raw, pressure_raw, integrity_loss_raw, wound_gain_raw,
        unattributed_anatomy_changes,
        decision_tick: world.outcome().map(|_| world.tick()), outcome: world.outcome(),
        refusals, solver_rejections: world.contact_solver_rejections(),
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

pub(crate) fn tactical_mechanics(args: &Args) {
    let quick = strong_strike::StrongCase {
        seed: 0, mirrored: false, target_anatomy: AnatomyChoice::Fighter,
        approach_offset: strong_strike::APPROACH_OFFSETS[4],
    };
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
        eprintln!("tactical-mechanics expects --quick, --calibration, --held-out, --strike-corpus, --anatomical-mirror-corpus, or --noise-free-mirror-corpus");
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

fn structurally_valid_case(case: strong_strike::StrongCase) -> bool {
    let before = strong_strike::measure_case(case, Fx::ONE);
    let held = strong_strike::measure_case(case, Fx::ZERO);
    let tactical = measure_tactical(case);
    let after = strong_strike::measure_case(case, Fx::ONE);
    let reference = strong_strike::meaningful_strike_validity(before, held);
    let tactical_valid = tactical_valid(&tactical);
    before == after && reference.uniquely_attributed_contact
        && reference.observed_crossing && reference.held_control_inert
        && reference.legal_runs && tactical_valid
}

fn run_corpus(args: &Args) {
    let held_out = args.flag("held-out");
    if held_out {
        let calibration_invalid = corpus_cases(CALIBRATION_SEEDS)
            .filter(|case| !structurally_valid_case(*case)).count();
        if calibration_invalid != 0 {
            eprintln!("held-out refused: calibration has {calibration_invalid} structural validity failures");
            std::process::exit(2);
        }
    }
    let seeds = if held_out { HELD_OUT_SEEDS } else { CALIBRATION_SEEDS };
    let mut csv = String::from("fingerprint,seed,mirrored,target,offset_x_raw,offset_y_raw,reference_equal,reference_contact,reference_cross,reference_tip_speed_raw,reference_energy_raw,reference_dissipated_raw,reference_cut_raw,reference_thrust_raw,reference_integrity_loss_raw,held_control_inert,reference_legal,reference_refusals,reference_solver_rejections,reference_energy_excess_raw,meaningful_strike,tactical_cross,tactical_contact,tactical_tip_speed_raw,tactical_energy_raw,tactical_dissipated_raw,tactical_cut_raw,tactical_thrust_raw,tactical_integrity_loss_raw,refusals,solver_rejections,energy_excess_raw\n");
    let mut cases = 0u32;
    let mut invalid = 0u32;
    let mut reference_contacts = 0u32;
    let mut tactical_contacts = 0u32;
    let mut bracket_drift = 0u32;
    let mut reference_missing = 0u32;
    let mut reference_ambiguous = 0u32;
    let mut tactical_invalid = 0u32;
    let mut held_control_invalid = 0u32;
    let mut meaningful_strikes = 0u32;
    for case in corpus_cases(seeds.clone()) {
        let before = strong_strike::measure_case(case, Fx::ONE);
        let held = strong_strike::measure_case(case, Fx::ZERO);
        let tactical = measure_tactical(case);
        let after = strong_strike::measure_case(case, Fx::ONE);
        let equal = before == after;
        let strike_validity = strong_strike::meaningful_strike_validity(before, held);
        let reference_valid = strike_validity.uniquely_attributed_contact
            && strike_validity.observed_crossing && strike_validity.held_control_inert
            && strike_validity.legal_runs;
        let tactical_valid = tactical_valid(&tactical);
        let valid = equal && reference_valid && tactical_valid;
        invalid += u32::from(!valid);
        bracket_drift += u32::from(!equal);
        reference_missing += u32::from(before.weapon_body_facts == 0);
        reference_ambiguous += u32::from(before.weapon_body_facts > 1 || before.competing_facts > 0);
        tactical_invalid += u32::from(!tactical_valid);
        held_control_invalid += u32::from(!strike_validity.held_control_inert);
        meaningful_strikes += u32::from(strike_validity.passes());
        reference_contacts += u32::from(before.contact_tick.is_some());
        tactical_contacts += u32::from(tactical.first_contact_tick.is_some());
        cases += 1;
        let target = match case.target_anatomy { AnatomyChoice::Fighter => "fighter", AnatomyChoice::Brute => "brute" };
        let reference_integrity_loss = before.region.map(|part|
            before.integrity_before_raw[part as usize]
                .saturating_sub(before.integrity_after_raw[part as usize])).unwrap_or(0);
        csv.push_str(&format!("{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{}\n",
            tactical.scenario_fingerprint, case.seed, case.mirrored, target,
            case.approach_offset.x.raw(), case.approach_offset.y.raw(), equal,
            before.contact_tick.is_some(), strike_validity.observed_crossing,
            before.tip_delta.length().raw(), before.energy_before_raw,
            before.energy_dissipated_raw, before.cut_raw, before.thrust_raw,
            reference_integrity_loss, strike_validity.held_control_inert, strike_validity.legal_runs,
            before.refusals, before.solver_rejections, before.max_energy_excess_raw,
            strike_validity.passes(),
            tactical.first_cross_tick.is_some(), tactical.first_contact_tick.is_some(),
            tactical.peak_tip_speed_raw, tactical.peak_energy_before_raw,
            tactical.peak_dissipated_raw, tactical.cut_raw, tactical.thrust_raw,
            tactical.integrity_loss_raw, tactical.refusals,
            tactical.solver_rejections, tactical.max_energy_excess_raw));
    }
    if let Some(path) = args.text("write") {
        std::fs::write(path, csv.as_bytes()).unwrap_or_else(|error| panic!("could not write {path}: {error}"));
    }
    println!("tactical-mechanics calibration seeds={}..{} cases={} invalid={} bracket_drift={} reference_missing={} reference_ambiguous={} held_control_invalid={} tactical_invalid={} reference_contacts={} meaningful_strikes={} tactical_contacts={} decision={}",
        seeds.start, seeds.end, cases, invalid, bracket_drift, reference_missing,
        reference_ambiguous, held_control_invalid, tactical_invalid, reference_contacts,
        meaningful_strikes, tactical_contacts,
        if invalid == 0 { "valid-calibration" } else { "invalid-stop-before-held-out" });
}

#[cfg(test)]
mod tests {
    use super::*;

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
    fn matched_rows_share_scenario_seed_mirror_target_and_offset() {
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
        assert!(tactical_valid(&row));
        row.unattributed_anatomy_changes = 1;
        assert!(!tactical_valid(&row));
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
}
