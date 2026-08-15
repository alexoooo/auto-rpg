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
const CALIBRATION_CASES: usize = 25 * 2 * 2 * strong_strike::APPROACH_OFFSETS.len();
const HELD_OUT_SEEDS: core::ops::Range<u64> = 900_000..900_100;

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
        reference.observed_crossing, HeldControlEvidence::from_measurement(held).is_inert(),
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
            let channels = row.cut_raw + row.thrust_raw + row.pressure_raw;
            waterfall.above_floor += u32::from(channels > 0);
            waterfall.cut_or_thrust += u32::from(row.cut_raw + row.thrust_raw > 0);
            matching_cut_or_thrust |= row.cut_raw + row.thrust_raw > 0;
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

const TACTICAL_MODES: [&str; 7] = [
    "quick", "calibration", "held-out", "strike-corpus",
    "anatomical-mirror-corpus", "noise-free-mirror-corpus", "mirror-trace-1536",
];

fn incompatible_mode_refusal(args: &Args) -> Option<String> {
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
        eprintln!("tactical-mechanics expects --quick, --calibration, --held-out, --strike-corpus, --anatomical-mirror-corpus, --noise-free-mirror-corpus, or --mirror-trace-1536");
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

#[derive(Clone, Copy)]
struct CalibrationRow {
    case: strong_strike::StrongCase,
    before: strong_strike::StrikeMeasurement,
    held: strong_strike::StrikeMeasurement,
    tactical: TacticalRow,
    structural: StructuralValidity,
    productivity: TacticalProductivity,
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

fn structurally_valid_case(case: strong_strike::StrongCase) -> bool {
    measure_matched_row(case).structural.passes()
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
    let mut csv = String::from(CALIBRATION_CSV_HEADER);
    let mut summaries = [CalibrationSummary::default(); 5];
    for case in corpus_cases(seeds.clone()) {
        let row = measure_matched_row(case);
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
        seeds.start, seeds.end, if held_out { 100 * 2 * 2 * strong_strike::APPROACH_OFFSETS.len() }
            else { CALIBRATION_CASES });
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
}
