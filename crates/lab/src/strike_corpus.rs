//! Stationary-target evidence for articulated strikes.
//!
//! This is instrumentation, not another combat path. The world receives only
//! ordinary versioned commands; the intended region and the commit window stay
//! here, where they can attribute a sweep without entering authority or replay.

use crate::args::Args;
use fx::{swept_segment_segment, Fx, Vec2};
use policy::{
    neutral_articulated_command, ArticulatedPolicy, NeutralArticulatedPolicy,
    StrikerArticulatedPolicy, TacticalArticulatedPolicy,
};
use sim::{
    AnatomyChoice, ArmCalibration, ArticulatedCommandV1, ArticulatedObservation, BodyPart, ContactKind,
    DuelConfigV1, EntityId, Faction, Scenario, SegmentPose, SubmitArticulatedOutcome, World,
};
use std::collections::BTreeMap;

const CASE_TICKS: u32 = 1_800;
/// The bearing ladder, held at absolute values so the table stays comparable
/// with the one session 04 recorded.
///
/// **Row 1 is production as of 2026-08-15, not row 0.** The ladder was written
/// when `1_092`/`182` was the shipped pair and read as "production, then 2x, 4x,
/// 8x"; the slew move made row 0 a halved control and row 1 the shipped pair.
/// Re-centring it would have bought a tidier reading and thrown away the only
/// thing the table is for, which is comparison against the measurement that
/// parked the lever. `the_ladder_still_contains_the_production_pair` is what
/// stops the two drifting apart silently -- it fails the day production leaves
/// the ladder, which is the day somebody has to decide what this table means
/// rather than discovering later that its "production" row was not.
const ACTUATOR_CANDIDATES: [ArmCalibration; 4] = [
    ArmCalibration { bearing_max_speed_raw: 1_092, bearing_accel_raw: 182 },
    ArmCalibration { bearing_max_speed_raw: 2_184, bearing_accel_raw: 364 },
    ArmCalibration { bearing_max_speed_raw: 4_368, bearing_accel_raw: 728 },
    ArmCalibration { bearing_max_speed_raw: 8_736, bearing_accel_raw: 1_456 },
];
const APPROACH_OFFSETS: [Vec2; 9] = [
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
pub(crate) struct StrikeDecision {
    pub command: ArticulatedCommandV1,
    /// `Some` names the plan locked by the policy. `committed` says whether
    /// this tick belongs to its commit sweep; keeping the two separate lets a
    /// chamber name its target without being counted as a strike.
    pub intended_region: Option<BodyPart>,
    /// The equipped limb whose locked plan owns the measured sweep. A corpus
    /// must not infer this from whichever published segment happens to come
    /// first: that changes the attribution as soon as a rig carries two.
    pub intended_hand: Option<sim::LimbSlot>,
    pub committed: bool,
}

/// The Lab-only attribution seam session 03's striker plugs into. It is not a
/// simulation input and deliberately is not `ArticulatedPolicyKind`.
pub(crate) trait StrikeCorpusPolicy {
    fn reset(&mut self) {}
    fn decide(&mut self, obs: &ArticulatedObservation) -> StrikeDecision;
}

#[derive(Default)]
struct NeutralCorpusPolicy(NeutralArticulatedPolicy);

impl StrikeCorpusPolicy for NeutralCorpusPolicy {
    fn decide(&mut self, obs: &ArticulatedObservation) -> StrikeDecision {
        StrikeDecision {
            command: self.0.decide(obs),
            intended_region: None,
            intended_hand: None,
            committed: false,
        }
    }
}

#[derive(Default)]
struct StrikerCorpusPolicy(StrikerArticulatedPolicy);

impl StrikeCorpusPolicy for StrikerCorpusPolicy {
    fn reset(&mut self) { self.0.reset(); }

    fn decide(&mut self, obs: &ArticulatedObservation) -> StrikeDecision {
        let command = self.0.decide(obs);
        let diagnostics = self.0.diagnostics();
        StrikeDecision {
            command,
            intended_region: diagnostics.context.plan.map(|plan| plan.region),
            intended_hand: diagnostics.context.plan.map(|plan| plan.hand),
            committed: diagnostics.committed,
        }
    }
}

#[derive(Default)]
struct TacticalCorpusPolicy(TacticalArticulatedPolicy);

impl StrikeCorpusPolicy for TacticalCorpusPolicy {
    fn reset(&mut self) { self.0.reset(); }

    fn decide(&mut self, obs: &ArticulatedObservation) -> StrikeDecision {
        let command = self.0.decide(obs);
        let diagnostics = self.0.diagnostics();
        StrikeDecision {
            command,
            intended_region: diagnostics.context.plan.map(|plan| plan.region),
            intended_hand: diagnostics.context.plan.map(|plan| plan.hand),
            committed: diagnostics.committed,
        }
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(crate) struct StrikeRow {
    pub seed: u64,
    pub mirrored: bool,
    pub intended_region: BodyPart,
    pub first_cross_tick: Option<u32>,
    pub first_contact_tick: Option<u32>,
    /// The region the first attacker contact was attributed to, which is not
    /// always the one the plan named. `Some` exactly when `first_contact_tick`
    /// is: every contact carries a region, so the two buckets in
    /// [`CalibrationSummary`] are exhaustive over the rows that missed.
    pub first_contact_region: Option<u8>,
    /// Whether the blade's own sweep crossed **any** of the defender's five
    /// regions on the tick of first contact. `Some` exactly when
    /// `first_contact_tick` is.
    ///
    /// The sharpest form of "the solver and this corpus disagree", because it
    /// leaves both the plan and the attribution out of it and asks only whether
    /// the blade was ever inside the body the solver says it hit.
    ///
    /// **Any of the five, and not the one the fact names**, which looks like the
    /// weaker question and is the correct one. `ContactFact::region` is chosen
    /// by `segment_body_at_pose`: at the contact instant it takes the region
    /// *nearest* the blade, not the region whose swept capsule the scan
    /// actually crossed. Those differ routinely -- an arm hanging beside the
    /// torso the blade swept through is nearer to the blow than the torso is --
    /// so asking about the named region would count the sim's own attribution
    /// rule as a defect. Measured on 2026-08-15 over the four-candidate ladder
    /// at 12 seeds: naming the fact's region reports 382 disagreements and
    /// asking about any region reports 0.
    pub first_contact_crossed: Option<bool>,
    pub blade_travel_raw: i32,
    pub closure_energy: u64,
    pub wound_energy: u64,
    pub decided_tick: Option<u32>,
    pub refusals: u32,
    pub solver_rejections: u32,
}

fn region_name(part: BodyPart) -> &'static str {
    match part {
        BodyPart::Head => "head",
        BodyPart::Torso => "torso",
        BodyPart::Legs => "legs",
        BodyPart::LeftArm => "left_arm",
        BodyPart::RightArm => "right_arm",
    }
}

fn option(value: Option<u32>) -> String {
    value.map(|n| n.to_string()).unwrap_or_default()
}

fn print_row(row: StrikeRow) {
    println!(
        "{},{},{},{},{},{},{},{},{},{},{}",
        row.seed,
        row.mirrored,
        region_name(row.intended_region),
        option(row.first_cross_tick),
        option(row.first_contact_tick),
        row.blade_travel_raw,
        row.closure_energy,
        row.wound_energy,
        option(row.decided_tick),
        row.refusals,
        row.solver_rejections,
    );
}

fn scenario_for(target: AnatomyChoice, offset: Vec2, mirrored: bool) -> Scenario {
    let mut config = DuelConfigV1::shipped();
    let centre = Vec2::from_ints(12, 8);
    let offset = if mirrored { Vec2::new(offset.x, -offset.y) } else { offset };
    config.fighters[0].spawn = centre + offset;
    config.fighters[1].spawn = centre;
    config.fighters[1].anatomy = target;
    config.max_ticks = CASE_TICKS;
    Scenario::duel_from(&config).expect("the fixed strike corpus cases are legal duels")
}

fn corpus_cases(include_mirror: bool) -> impl Iterator<Item = (bool, AnatomyChoice, Vec2)> {
    (0..if include_mirror { 2 } else { 1 }).flat_map(|orientation| {
        [AnatomyChoice::Fighter, AnatomyChoice::Brute].into_iter().flat_map(move |target| {
            APPROACH_OFFSETS.into_iter().map(move |offset| (orientation == 1, target, offset))
        })
    })
}

/// Did this tick's blade sweep cross this tick's sweep of one named region?
///
/// Every argument is the geometry the contact phase was handed, and both had
/// to be replaced to make the question answerable. The region used to come
/// from `ObservedOpponent::regions`, which is built at the *measured* origin
/// and so is displaced by up to 1.47 world units of perception noise, and it
/// was passed as one static volume for both ends of the tick. The blade used
/// to come from an observation taken after `World::step`, which is the blade
/// the contact commit clamped back to its own solution -- a shorter arc than
/// the one the solver judged, by 1,807 raw on the fixture `strong_strike`
/// pins, against a leg radius of 19,660. Sweeping that arc answers "no" about
/// ticks the solver resolved as hits, which is exactly what the `unexplained`
/// counter below was counting.
///
/// The region is a parameter and not the intended one, so this can be asked
/// about whichever of the five a caller means -- the region a contact fact
/// names, or the one a plan aimed at. Those are different questions and the
/// summary keeps them apart.
fn crosses(previous: SegmentPose, requested: SegmentPose,
           region: (sim::RegionVolume, sim::RegionVolume)) -> bool {
    let (before, after) = region;
    before.present && after.present && swept_segment_segment(
        previous.hilt,
        previous.tip,
        requested.hilt,
        requested.tip,
        previous.radius.max(requested.radius),
        before.lower,
        before.upper,
        after.lower,
        after.upper,
        before.radius.max(after.radius),
    ).is_some()
}

fn tip_travel(previous: SegmentPose, requested: SegmentPose) -> i32 {
    (requested.tip - previous.tip).length().raw().max(0)
}

fn planned_weapon(
    obs: &ArticulatedObservation,
    hand: Option<sim::LimbSlot>,
) -> Option<SegmentPose> {
    hand.and_then(|limb| obs.weapons[limb as usize])
}

fn attacker_contact(
    row: &sim::ContactResolution,
    attacker: EntityId,
    hand: Option<sim::LimbSlot>,
) -> bool {
    let Some(slot) = hand.map(|limb| limb as u8) else { return false };
    row.fact.key.kind == ContactKind::WeaponBody
        && ((row.fact.key.a == attacker && row.fact.key.a_slot == slot)
            || (row.fact.key.b == attacker && row.fact.key.b_slot == slot))
}

pub(crate) fn measure_case(
    scenario: &Scenario,
    seed: u64,
    mirrored: bool,
    policy: &mut dyn StrikeCorpusPolicy,
) -> StrikeRow {
    measure_case_at(scenario, seed, mirrored, policy, None, false)
}

fn measure_case_at(
    scenario: &Scenario,
    seed: u64,
    mirrored: bool,
    policy: &mut dyn StrikeCorpusPolicy,
    calibration: Option<ArmCalibration>,
    single_sweep: bool,
) -> StrikeRow {
    let mut world = World::new(scenario, seed);
    let attacker = world.alive_ids(Faction::Heroes)[0];
    let defender = world.alive_ids(Faction::Monsters)[0];
    policy.reset();

    let mut intended = BodyPart::Torso;
    let mut intended_hand = None;
    let mut committed = false;
    let mut first_cross_tick = None;
    let mut first_contact_tick = None;
    let mut first_contact_region = None;
    let mut first_contact_crossed = None;
    let mut blade_travel_raw = 0i32;
    let mut closure_energy = 0u64;
    let mut wound_energy = 0u64;
    let mut refusals = 0u32;
    let mut saw_commit = false;
    let mut completed_sweep = false;

    while world.outcome().is_none() && world.tick() < scenario.max_ticks {
        let before = world.observe_articulated(attacker);
        for id in world.pending_decisions().to_vec() {
            let obs = world.observe_articulated(id);
            let decision = if id == attacker {
                policy.decide(&obs)
            } else {
                StrikeDecision {
                    command: neutral_articulated_command(&obs),
                    intended_region: None,
                    intended_hand: None,
                    committed: false,
                }
            };
            if id == attacker {
                if let Some(region) = decision.intended_region {
                    intended = region;
                }
                if let Some(hand) = decision.intended_hand {
                    intended_hand = Some(hand);
                }
                completed_sweep |= saw_commit && committed && !decision.committed;
                committed = decision.committed;
                saw_commit |= committed;
            }
            match world.submit_articulated_v1(id, decision.command) {
                SubmitArticulatedOutcome::Stored { rejection, .. } => {
                    refusals += u32::from(rejection.is_some());
                }
                SubmitArticulatedOutcome::NotStored(_) => refusals += 1,
            }
        }

        if single_sweep && completed_sweep { break; }

        let previous_weapon = planned_weapon(&before, intended_hand);
        let _ = match calibration {
            Some(pair) => world.step_with_arm_calibration(pair),
            None => world.step(),
        };
        let after = world.observe_articulated(attacker);
        let requested_weapon = planned_weapon(&after, intended_hand);
        // The sweep, not the two observations either side of it. Travel below
        // is what the arm did and so is read from the poses; a crossing is what
        // the solver was asked, and only the solver's own rows can answer it
        // without disagreeing with its answer.
        let swept_blade = intended_hand.and_then(|hand| world.swept_weapon(attacker, hand));
        let swept_body = world.swept_regions(defender);
        if committed {
            if let (Some(previous), Some(requested)) = (previous_weapon, requested_weapon) {
                blade_travel_raw = blade_travel_raw.saturating_add(tip_travel(previous, requested));
            }
            if let (Some((previous, requested)), Some(regions)) = (swept_blade, swept_body) {
                if first_cross_tick.is_none()
                    && crosses(previous, requested, regions[intended as usize]) {
                    first_cross_tick = Some(world.tick());
                }
            }
            for resolution in world.contact_resolutions().iter()
                .filter(|row| attacker_contact(row, attacker, intended_hand)) {
                // Captured before the insert, so it is the region of the row that
                // *is* the first contact rather than of whichever row happens to
                // be last on that tick.
                if first_contact_tick.is_none() {
                    first_contact_region = Some(resolution.fact.region);
                    first_contact_crossed = Some(match (swept_blade, swept_body) {
                        (Some((previous, requested)), Some(regions)) => regions.iter()
                            .any(|&region| crosses(previous, requested, region)),
                        _ => false,
                    });
                }
                first_contact_tick.get_or_insert(world.tick());
                closure_energy = closure_energy.max(resolution.energy.before_raw);
                wound_energy = wound_energy.max(resolution.cut_raw.saturating_add(resolution.thrust_raw));
            }
        }
    }

    StrikeRow {
        seed,
        mirrored,
        intended_region: intended,
        first_cross_tick,
        first_contact_tick,
        first_contact_region,
        first_contact_crossed,
        blade_travel_raw,
        closure_energy,
        wound_energy,
        decided_tick: world.outcome().map(|_| world.tick()),
        refusals,
        solver_rejections: world.contact_solver_rejections(),
    }
}

#[derive(Clone, Copy, Default)]
struct CalibrationSummary {
    cases: u32,
    crossings: u32,
    contacts: u32,
    /// A contact with no crossing of the region the plan named. **It is two
    /// unlike facts added together**, which is why the next two fields exist:
    /// session 04 read the sum as one regression and parked the only arm-slew
    /// lever that ever moved wounding rows.
    tunnelling: u32,
    /// The blade hit a body, and the contact was attributed to some region other
    /// than the intended one. That is a striker-attribution result, and in a
    /// swordfight it is what hitting something looks like -- not a defect.
    wrong_region: u32,
    /// The contact was attributed to the intended region, and the swept test
    /// above still says the blade never crossed it.
    ///
    /// **This line used to call itself "the bucket that is a real defect", and
    /// twice now it has not been one.** It was first read that way while
    /// `crosses` held the region still and took the blade from an observation.
    /// Repairing both took the ladder's four rows from `4, 12, 62, 294` to
    /// `28, 16, 10, 12`: 372 rows to 66, and, far more to the point, **it took
    /// the growth out**. The whole reason this counter was ever alarming was
    /// that it scaled 70x across the slew ladder while `wrong_region` stayed
    /// flat, and the thing that scaled was the clamp, which grows with slew
    /// because a faster blade is pulled further back off its own request.
    ///
    /// What is left does not scale and is not a defect either: `segment_body_at_pose`
    /// names the region *nearest* the blow at the contact instant, so a blade
    /// that swept the torso can be attributed to the arm beside it, and a plan
    /// that named that arm then reads as a contact on the intended region with
    /// no crossing of it. The residue is that mismatch and nothing else --
    /// `contact_uncrossed` below is what actually detects a defect, and it is
    /// zero at every candidate.
    ///
    /// Kept, rather than redefined, because the three counters are exhaustive
    /// over `tunnelling` by construction and that arithmetic is what makes the
    /// split decide anything.
    unexplained: u32,
    /// A contact the swept test cannot explain by **any** region of the body it
    /// landed on. This is the bucket that is a real defect.
    ///
    /// It is not a subset of the three above and does not participate in their
    /// arithmetic: they all ask about a region some *name* picked, and this one
    /// asks only whether the blade was inside the body at all. That is the
    /// question that survives both the plan and the sim's proximity-based
    /// attribution, which is why it is the one to read against arm speed.
    contact_uncrossed: u32,
    refusals: u32,
    solver_rejections: u32,
    max_closure_energy: u64,
    wounds: u32,
    minimum_wounding_travel: Option<i32>,
}

impl CalibrationSummary {
    fn add(&mut self, row: StrikeRow) {
        self.cases += 1;
        self.crossings += u32::from(row.first_cross_tick.is_some());
        self.contacts += u32::from(row.first_contact_tick.is_some());
        debug_assert_eq!(
            row.first_contact_tick.is_some(), row.first_contact_region.is_some(),
            "every contact carries a region, so the split is exhaustive",
        );
        debug_assert_eq!(
            row.first_contact_tick.is_some(), row.first_contact_crossed.is_some(),
            "every contact was asked whether the blade was inside the body at all",
        );
        let missed_intended = row.first_contact_tick.is_some() && row.first_cross_tick.is_none();
        let intended = row.intended_region as u8;
        self.tunnelling += u32::from(missed_intended);
        self.wrong_region += u32::from(missed_intended
            && row.first_contact_region.is_some()
            && row.first_contact_region != Some(intended));
        self.unexplained += u32::from(missed_intended
            && row.first_contact_region == Some(intended));
        self.contact_uncrossed += u32::from(row.first_contact_crossed == Some(false));
        self.refusals += row.refusals;
        self.solver_rejections += row.solver_rejections;
        self.max_closure_energy = self.max_closure_energy.max(row.closure_energy);
        if row.wound_energy > 0 {
            self.wounds += 1;
            self.minimum_wounding_travel = Some(self.minimum_wounding_travel
                .map_or(row.blade_travel_raw, |old| old.min(row.blade_travel_raw)));
        }
    }
}

fn calibrate_actuator(seeds: u64, mirrored: bool) {
    println!("max_speed_raw,accel_raw,cases,crossings,contacts,median_blade_travel_raw,min_wounding_travel_raw,wounds,refusals,solver_rejections,tunnelling,wrong_region,unexplained,contact_uncrossed,max_closure_energy");
    for candidate in ACTUATOR_CANDIDATES {
        let mut summary = CalibrationSummary::default();
        let mut travel = Vec::new();
        for seed in 0..seeds {
            for (reflected, target, offset) in corpus_cases(mirrored) {
                let scenario = scenario_for(target, offset, reflected);
                let mut first_control = StrikerCorpusPolicy::default();
                let control_before = measure_case_at(
                    &scenario, seed, reflected, &mut first_control, None, true,
                );
                let mut subject = StrikerCorpusPolicy::default();
                let row = measure_case_at(
                    &scenario, seed, reflected, &mut subject, Some(candidate), true,
                );
                let mut second_control = StrikerCorpusPolicy::default();
                let control_after = measure_case_at(
                    &scenario, seed, reflected, &mut second_control, None, true,
                );
                assert_eq!(control_before, control_after, "the bracket controls drifted");
                travel.push(row.blade_travel_raw);
                summary.add(row);
            }
        }
        travel.sort_unstable();
        let median = travel.get(travel.len() / 2).copied().unwrap_or(0);
        println!(
            "{},{},{},{},{},{},{},{},{},{},{},{},{},{},{}",
            candidate.bearing_max_speed_raw, candidate.bearing_accel_raw,
            summary.cases, summary.crossings, summary.contacts, median,
            summary.minimum_wounding_travel.map(|n| n.to_string()).unwrap_or_default(),
            summary.wounds, summary.refusals, summary.solver_rejections,
            summary.tunnelling, summary.wrong_region, summary.unexplained,
            summary.contact_uncrossed, summary.max_closure_energy,
        );
    }
}

#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
struct OfflineContactKey(u32, u32, u8, u32, u32, u8, u8);

#[derive(Clone, Copy)]
struct ContactAllocationRow {
    episode: u32,
    tick: u32,
    fact_count: u32,
    closure_energy: u64,
    allocated_energy: u64,
    floor_charges: u32,
    wound_energy: u64,
}

#[derive(Clone, Copy, Default)]
struct ContactInterpretations {
    closure_energy: u64,
    allocated_energy: u64,
    current_wound: u64,
    group_wound: u64,
    episode_wound: u64,
    current_charges: u32,
    group_charges: u32,
    episode_charges: u32,
}

fn offline_key(row: &sim::ContactResolution) -> OfflineContactKey {
    let key = row.fact.key;
    OfflineContactKey(
        key.a.index, key.a.generation, key.a_slot,
        key.b.index, key.b.generation, key.b_slot, key.kind as u8,
    )
}

fn measure_contact_energy_case(
    scenario: &Scenario, seed: u64, print_ledger: bool,
) -> ContactInterpretations {
    let mut world = World::new(scenario, seed);
    let attacker = world.alive_ids(Faction::Heroes)[0];
    let mut policy = StrikerCorpusPolicy::default();
    let mut committed = false;
    let mut intended_hand = None;
    let mut saw_commit = false;
    let mut completed_sweep = false;
    let mut facts = Vec::new();

    while world.outcome().is_none() && world.tick() < scenario.max_ticks {
        for id in world.pending_decisions().to_vec() {
            let obs = world.observe_articulated(id);
            let decision = if id == attacker { policy.decide(&obs) } else {
                StrikeDecision { command: neutral_articulated_command(&obs),
                                 intended_region: None, intended_hand: None,
                                 committed: false }
            };
            if id == attacker {
                if let Some(hand) = decision.intended_hand {
                    intended_hand = Some(hand);
                }
                completed_sweep |= saw_commit && committed && !decision.committed;
                committed = decision.committed;
                saw_commit |= committed;
            }
            assert!(matches!(
                world.submit_articulated_v1(id, decision.command),
                SubmitArticulatedOutcome::Stored { rejection: None, .. }
            ));
        }
        let _ = world.step();
        if committed {
            for row in world.contact_resolutions().iter()
                .filter(|row| attacker_contact(row, attacker, intended_hand)) {
                // The allocated share is all four columns, and the wounding
                // part of it is all three that reach `incoming` -- crush
                // included, or a club reads as having converted nothing.
                facts.push((world.tick(), row.group_ordinal, offline_key(row),
                            row.energy.before_raw,
                            row.cut_raw + row.thrust_raw + row.crush_raw + row.pressure_raw,
                            row.cut_raw + row.thrust_raw + row.crush_raw));
            }
        }
        if completed_sweep { break; }
    }

    let floor = sim::CONTACT_ENERGY_FLOOR;
    let mut answer = ContactInterpretations::default();
    let mut groups: BTreeMap<(u32, u8), (u64, u64, u32)> = BTreeMap::new();
    let mut episodes: BTreeMap<OfflineContactKey, Vec<(u32, u64)>> = BTreeMap::new();
    for &(tick, group, key, closure, allocated, current) in &facts {
        answer.closure_energy = answer.closure_energy.max(closure);
        answer.allocated_energy += allocated;
        answer.current_wound += current;
        answer.current_charges += 1;
        let entry = groups.entry((tick, group)).or_default();
        entry.0 = entry.0.max(closure);
        entry.1 += allocated;
        entry.2 += 1;
        let runs = episodes.entry(key).or_default();
        match runs.last_mut() {
            Some((last_tick, energy)) if tick <= *last_tick + 1 => {
                *last_tick = tick;
                *energy += allocated;
            }
            _ => runs.push((tick, allocated)),
        }
    }
    if print_ledger {
        println!("episode,tick,fact_count,closure_energy,allocated_energy,floor_charges,wound_energy");
        let mut active: BTreeMap<OfflineContactKey, (u32, u32)> = BTreeMap::new();
        let mut next_episode = 0u32;
        for &(tick, group, key, closure, allocated, current) in &facts {
            let episode = match active.get(&key).copied() {
                Some((last_tick, episode)) if tick <= last_tick + 1 => episode,
                _ => { let value = next_episode; next_episode += 1; value }
            };
            active.insert(key, (tick, episode));
            let row = ContactAllocationRow {
                episode, tick, fact_count: groups[&(tick, group)].2,
                closure_energy: closure, allocated_energy: allocated,
                floor_charges: 1, wound_energy: current,
            };
            println!("{},{},{},{},{},{},{}", row.episode, row.tick, row.fact_count,
                     row.closure_energy, row.allocated_energy, row.floor_charges,
                     row.wound_energy);
        }
    }
    for &(_, allocated, _) in groups.values() {
        answer.group_wound += allocated.saturating_sub(floor);
        answer.group_charges += 1;
    }
    for runs in episodes.values() {
        for &(_, energy) in runs {
            answer.episode_wound += energy.saturating_sub(floor);
            answer.episode_charges += 1;
        }
    }
    answer
}

fn contact_energy_ledger(seeds: u64, mirrored: bool) {
    let mut totals = ContactInterpretations::default();
    let mut cases = 0u32;
    for seed in 0..seeds {
        for (reflected, target, offset) in corpus_cases(mirrored) {
            let scenario = scenario_for(target, offset, reflected);
            let row = measure_contact_energy_case(&scenario, seed, cases == 0);
            cases += 1;
            totals.closure_energy = totals.closure_energy.max(row.closure_energy);
            totals.allocated_energy += row.allocated_energy;
            totals.current_wound += row.current_wound;
            totals.group_wound += row.group_wound;
            totals.episode_wound += row.episode_wound;
            totals.current_charges += row.current_charges;
            totals.group_charges += row.group_charges;
            totals.episode_charges += row.episode_charges;
        }
    }
    println!("interpretation,cases,max_closure_energy,allocated_energy,floor_charges,wound_energy");
    for (name, charges, wounds) in [
        ("per_fact_tick", totals.current_charges, totals.current_wound),
        ("per_contact_group", totals.group_charges, totals.group_wound),
        ("per_continuous_episode", totals.episode_charges, totals.episode_wound),
    ] {
        println!("{name},{cases},{},{},{charges},{wounds}",
                 totals.closure_energy, totals.allocated_energy);
    }
}

pub(crate) fn strike_corpus(args: &Args) {
    let seeds = args.u32("seeds", 100) as u64;
    let mirrored = args.flag("mirrored");
    if args.flag("calibrate-actuator") {
        calibrate_actuator(seeds, mirrored);
        return;
    }
    if args.flag("contact-energy-ledger") {
        contact_energy_ledger(seeds, mirrored);
        return;
    }
    let policy_name = args.choice(
        "policy", "neutral", &[
            ("neutral", "neutral"),
            ("striker", "striker"),
            ("tactical", "tactical"),
        ],
    );
    println!("seed,mirrored,intended_region,first_cross_tick,first_contact_tick,blade_travel_raw,closure_energy,wound_energy,decided_tick,refusals,solver_rejections");
    for seed in 0..seeds {
        for (reflected, target, offset) in corpus_cases(mirrored) {
            let scenario = scenario_for(target, offset, reflected);
            let mut policy: Box<dyn StrikeCorpusPolicy> = match policy_name {
                "neutral" => Box::new(NeutralCorpusPolicy::default()),
                "striker" => Box::new(StrikerCorpusPolicy::default()),
                "tactical" => Box::new(TacticalCorpusPolicy::default()),
                _ => unreachable!(),
            };
            print_row(measure_case(&scenario, seed, reflected, policy.as_mut()));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use fx::Vec3;

    fn segment(from: Vec3, to: Vec3) -> SegmentPose {
        SegmentPose { hilt: from, tip: to, radius: Fx::from_ratio(1, 20) }
    }

    fn volume(at: Vec3) -> sim::RegionVolume {
        sim::RegionVolume {
            lower: at,
            upper: at,
            radius: Fx::from_ratio(1, 5),
            present: true,
        }
    }

    /// A region that does not move across the tick, for the cases that are
    /// about the blade rather than about the body.
    fn still(at: Vec3) -> (sim::RegionVolume, sim::RegionVolume) {
        (volume(at), volume(at))
    }

    #[test]
    fn a_cross_is_the_named_region_and_not_merely_any_contact() {
        let previous = segment(Vec3::new(Fx::from_int(-2), Fx::ZERO, Fx::ONE), Vec3::new(Fx::from_int(-1), Fx::ZERO, Fx::ONE));
        let requested = segment(Vec3::new(Fx::ONE, Fx::ZERO, Fx::ONE), Vec3::new(Fx::from_int(2), Fx::ZERO, Fx::ONE));
        let named = still(Vec3::new(Fx::ZERO, Fx::ZERO, Fx::ONE));
        let contacted_elsewhere = still(Vec3::new(Fx::ZERO, Fx::from_int(2), Fx::ONE));
        assert!(crosses(previous, requested, named));
        assert!(!crosses(previous, requested, contacted_elsewhere));
    }

    #[test]
    fn a_region_that_moves_into_the_blade_is_crossed_and_a_static_copy_of_it_is_not() {
        // The half of the sweep the old signature could not express: one
        // `RegionVolume` was passed for both ends of the tick, so a body that
        // stepped into a stationary blade read as a body that never moved. Both
        // rows below hold the blade still, so the only thing separating them is
        // the region's own motion.
        let blade = segment(Vec3::new(Fx::ZERO, Fx::ZERO, Fx::ONE),
                            Vec3::new(Fx::ONE, Fx::ZERO, Fx::ONE));
        let away = volume(Vec3::new(Fx::from_ratio(1, 2), Fx::from_int(2), Fx::ONE));
        let onto = volume(Vec3::new(Fx::from_ratio(1, 2), Fx::ZERO, Fx::ONE));
        assert!(crosses(blade, blade, (away, onto)));
        assert!(!crosses(blade, blade, (away, away)));
    }

    #[test]
    fn an_absent_region_is_never_crossed_at_either_end_of_the_tick() {
        // A severed arm has no volume to sweep. Checking only one end would let
        // a limb taken off mid-tick still be hittable on the other.
        let blade = segment(Vec3::new(Fx::from_int(-2), Fx::ZERO, Fx::ONE),
                            Vec3::new(Fx::from_int(2), Fx::ZERO, Fx::ONE));
        let present = volume(Vec3::new(Fx::ZERO, Fx::ZERO, Fx::ONE));
        let absent = sim::RegionVolume { present: false, ..present };
        assert!(crosses(blade, blade, (present, present)));
        assert!(!crosses(blade, blade, (absent, present)));
        assert!(!crosses(blade, blade, (present, absent)));
    }

    #[test]
    fn a_two_weapon_fighter_measures_the_hand_its_plan_locked() {
        let left = segment(
            Vec3::new(Fx::from_int(-3), Fx::ZERO, Fx::ONE),
            Vec3::new(Fx::from_int(-2), Fx::ZERO, Fx::ONE),
        );
        let right = segment(
            Vec3::new(Fx::from_int(2), Fx::ZERO, Fx::ONE),
            Vec3::new(Fx::from_int(3), Fx::ZERO, Fx::ONE),
        );
        let obs = ArticulatedObservation {
            weapons: [Some(left), Some(right)],
            ..ArticulatedObservation::BLANK
        };

        assert_eq!(planned_weapon(&obs, Some(sim::LimbSlot::RightArm)), Some(right));
        assert_ne!(
            planned_weapon(&obs, Some(sim::LimbSlot::RightArm)),
            obs.weapons.into_iter().flatten().next(),
            "the fixture does not distinguish a locked hand from the first segment",
        );
    }

    /// A row that touched nothing, to be adjusted per case. Written out rather
    /// than derived: `StrikeRow` has no `Default` on purpose, because a zeroed
    /// strike row is not a measurement of anything.
    fn quiet_row(intended: BodyPart) -> StrikeRow {
        StrikeRow {
            seed: 0,
            mirrored: false,
            intended_region: intended,
            first_cross_tick: None,
            first_contact_tick: None,
            first_contact_region: None,
            first_contact_crossed: None,
            blade_travel_raw: 0,
            closure_energy: 0,
            wound_energy: 0,
            decided_tick: None,
            refusals: 0,
            solver_rejections: 0,
        }
    }

    #[test]
    fn the_ladder_still_contains_the_production_pair() {
        // The table reads as a sweep *around* what ships. Once production is not
        // on the ladder at all, every row is a candidate and the reader has no
        // control column -- so this fails rather than letting the table go on
        // quietly describing a fight nobody runs.
        let production = ArmCalibration {
            bearing_max_speed_raw: sim::ARM_BEARING_MAX_SPEED_RAW,
            bearing_accel_raw: sim::ARM_BEARING_ACCEL_RAW,
        };
        let at = ACTUATOR_CANDIDATES.iter().position(|&row| row == production);
        assert_eq!(
            at, Some(1),
            "production is {production:?}; the ladder is {ACTUATOR_CANDIDATES:?}. \
             If the pair moved on purpose, move this index and say so in the \
             calibration record; do not delete the assertion.",
        );
    }

    #[test]
    fn the_intended_region_and_the_struck_region_share_one_index_space() {
        // `BodyPart` is a re-export of `AnatomyRegion`, so `intended as u8` and
        // `ContactFact::region` name the same five values. The whole
        // wrong-region/unexplained split rests on that. Reordering either enum
        // would otherwise turn both counters into noise silently, which is the
        // one failure this measurement could not survive.
        assert_eq!(BodyPart::COUNT, 5);
        for (index, part) in BodyPart::ALL.into_iter().enumerate() {
            assert_eq!(part as u8, index as u8);
        }
        assert_eq!(
            (BodyPart::Head as u8, BodyPart::Torso as u8, BodyPart::LeftArm as u8,
             BodyPart::RightArm as u8, BodyPart::Legs as u8),
            (0, 1, 2, 3, 4),
        );
    }

    #[test]
    fn every_tunnelling_row_is_either_wrong_region_or_unexplained() {
        let mut summary = CalibrationSummary::default();
        // Crossed the head and hit the head: not tunnelling at all.
        summary.add(StrikeRow {
            first_cross_tick: Some(4), first_contact_tick: Some(4),
            first_contact_region: Some(BodyPart::Head as u8),
            first_contact_crossed: Some(true),
            ..quiet_row(BodyPart::Head)
        });
        // Hit the torso while aiming at the head. A miss for a region-targeted
        // striker; a landed blow for a swordfight. **Two of these against one
        // unexplained row, deliberately**: with one of each, a split that put
        // every row in both buckets still reads 1/1 and the sum still reads 2,
        // so a symmetric fixture is satisfied by the bug it exists to catch.
        summary.add(StrikeRow {
            first_contact_tick: Some(5),
            first_contact_region: Some(BodyPart::Torso as u8),
            first_contact_crossed: Some(true),
            ..quiet_row(BodyPart::Head)
        });
        summary.add(StrikeRow {
            first_contact_tick: Some(5),
            first_contact_region: Some(BodyPart::Legs as u8),
            first_contact_crossed: Some(true),
            ..quiet_row(BodyPart::Head)
        });
        // Hit the head it aimed at, and the swept test saw no crossing of any
        // region -- so this row is the one that is both `unexplained` and, on the
        // question that does not go through a name, a genuine disagreement.
        summary.add(StrikeRow {
            first_contact_tick: Some(6),
            first_contact_region: Some(BodyPart::Head as u8),
            first_contact_crossed: Some(false),
            ..quiet_row(BodyPart::Head)
        });
        // Touched nothing, and so contributes to none of the three.
        summary.add(quiet_row(BodyPart::Head));

        assert_eq!(summary.cases, 5);
        assert_eq!(summary.contacts, 4);
        assert_eq!(summary.tunnelling, 3);
        assert_eq!(summary.wrong_region, 2);
        assert_eq!(summary.unexplained, 1);
        assert_eq!(summary.contact_uncrossed, 1);
        assert_eq!(
            summary.wrong_region + summary.unexplained, summary.tunnelling,
            "the split has to account for every tunnelling row exactly once or it decides nothing",
        );
    }

    #[test]
    fn a_contact_the_blade_entered_no_region_for_is_counted_however_the_regions_are_named() {
        // The hole the three named buckets cannot see. Both rows are wrong-region
        // blows, so `unexplained` excuses both, and only one of them has an
        // excuse: the other says the solver resolved a contact against a body the
        // blade's own sweep was never inside. That is the defect, and no counter
        // built on a region name can find it.
        let mut summary = CalibrationSummary::default();
        summary.add(StrikeRow {
            first_contact_tick: Some(5),
            first_contact_region: Some(BodyPart::Torso as u8),
            first_contact_crossed: Some(true),
            ..quiet_row(BodyPart::Head)
        });
        summary.add(StrikeRow {
            first_contact_tick: Some(5),
            first_contact_region: Some(BodyPart::Torso as u8),
            first_contact_crossed: Some(false),
            ..quiet_row(BodyPart::Head)
        });
        assert_eq!((summary.wrong_region, summary.unexplained), (2, 0));
        assert_eq!(summary.contact_uncrossed, 1,
                   "a blow is only excused if the blade was inside the body");
    }

    #[test]
    fn a_contact_on_the_intended_region_without_a_crossing_is_unexplained() {
        // The case the single counter hid, and the split still has to keep it
        // out of the wrong-region bucket -- which is where a plan-shaped reading
        // would put anything it could not otherwise account for.
        let mut summary = CalibrationSummary::default();
        summary.add(StrikeRow {
            first_contact_tick: Some(7),
            first_contact_region: Some(BodyPart::Legs as u8),
            first_contact_crossed: Some(true),
            ..quiet_row(BodyPart::Legs)
        });
        assert_eq!((summary.tunnelling, summary.unexplained, summary.wrong_region), (1, 1, 0));
    }

    #[test]
    fn mirrored_strike_rows_differ_only_in_handed_coordinates() {
        // Off the mirror axis. Using the centre row here would let a mirror
        // implementation that did nothing satisfy the comparison.
        let scenario = scenario_for(AnatomyChoice::Fighter, APPROACH_OFFSETS[0], false);
        let mirror = scenario_for(AnatomyChoice::Fighter, APPROACH_OFFSETS[0], true);
        let mut first = NeutralCorpusPolicy::default();
        let mut second = NeutralCorpusPolicy::default();
        let canonical = measure_case(&scenario, 3, false, &mut first);
        let reflected = measure_case(&mirror, 3, true, &mut second);
        assert_eq!(StrikeRow { mirrored: true, ..canonical }, reflected);
    }

    #[test]
    fn the_corpus_is_nine_offsets_by_two_targets_by_two_mirrors() {
        let cases: Vec<_> = corpus_cases(true).collect();
        assert_eq!(cases.len(), 9 * 2 * 2);
        for mirrored in [false, true] {
            for target in [AnatomyChoice::Fighter, AnatomyChoice::Brute] {
                assert_eq!(
                    cases.iter().filter(|&&(m, anatomy, _)| m == mirrored && anatomy == target).count(),
                    APPROACH_OFFSETS.len(),
                );
            }
        }
    }

    #[test]
    fn the_stationary_control_never_invents_a_committed_strike() {
        let scenario = scenario_for(AnatomyChoice::Brute, APPROACH_OFFSETS[4], false);
        let mut policy = NeutralCorpusPolicy::default();
        let row = measure_case(&scenario, 5, false, &mut policy);
        assert_eq!(row.first_cross_tick, None);
        assert_eq!(row.first_contact_tick, None);
        assert_eq!(row.blade_travel_raw, 0);
        assert_eq!((row.closure_energy, row.wound_energy), (0, 0));
        assert_eq!(row.refusals, 0);
    }

    #[test]
    fn the_old_and_candidate_actuators_are_distinguished_by_the_strike_corpus() {
        // **Row 0, not row 1.** This compared production against row 1 until
        // Smart134 made row 1 *be* production, at which point it was comparing a
        // configuration with itself and `assert_ne!` said so -- which is the
        // right failure and the reason the ladder now carries
        // `the_ladder_still_contains_the_production_pair` beside it. Row 0 is
        // the pair that shipped before the move, so the question the name asks
        // is unchanged: can this corpus tell one actuator from another at all?
        // If it cannot, every row of the calibration table is unfalsifiable.
        let scenario = scenario_for(AnatomyChoice::Fighter, APPROACH_OFFSETS[4], false);
        let mut old = StrikerCorpusPolicy::default();
        let control = measure_case_at(&scenario, 0, false, &mut old, None, true);
        let mut selected = StrikerCorpusPolicy::default();
        let slower = measure_case_at(
            &scenario, 0, false, &mut selected, Some(ACTUATOR_CANDIDATES[0]), true,
        );
        assert_ne!(
            (control.blade_travel_raw, control.closure_energy, control.wound_energy),
            (slower.blade_travel_raw, slower.closure_energy, slower.wound_energy),
        );
    }
}
