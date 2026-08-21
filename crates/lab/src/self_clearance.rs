//! Observational reachability audit for the frozen arm/contact fixtures.
//!
//! The audit deliberately changes no collision rule. It drives a baseline and
//! five counterfactual clones with identical submitted commands, changing one
//! raw rate by one unit only in the clone, and reports the first state-digest
//! divergence. The owner-clearance row is the first preconstraint pair selected
//! by production; it is neither fed back into the world nor folded into a hash.

#![cfg_attr(not(feature = "cartesian-recoil"), allow(dead_code, unused_imports))]

use policy::{Policy, PolicyKind};
use sim::{ArmRateProfile, CommandV1, EntityId, Faction, Scenario, SubmitOutcome, World};

#[cfg(test)]
const RATE_NAMES: [&str; 5] = [
    "bearing-max", "bearing-accel", "linear-max", "linear-accel", "elbow-plane-max",
];

#[derive(Clone, Debug, PartialEq, Eq)]
struct Row {
    name: &'static str,
    overlap: Option<(u32, EntityId, usize, usize)>,
    rates: [Option<u32>; 5],
}

fn changed(current: ArmRateProfile, at: usize) -> ArmRateProfile {
    match at {
        0 => ArmRateProfile { bearing_max_speed_raw: current.bearing_max_speed_raw + 1, ..current },
        1 => ArmRateProfile { bearing_accel_raw: current.bearing_accel_raw + 1, ..current },
        2 => ArmRateProfile { linear_max_speed_raw: current.linear_max_speed_raw + 1, ..current },
        3 => ArmRateProfile { linear_accel_raw: current.linear_accel_raw + 1, ..current },
        _ => ArmRateProfile { elbow_plane_max_speed_raw: current.elbow_plane_max_speed_raw + 1, ..current },
    }
}

fn first_forbidden_crossing(world: &World) -> Option<(EntityId, usize, usize)> {
    for faction in [Faction::Heroes, Faction::Monsters] {
        for id in world.alive_ids(faction) {
            let Some(row) = world.self_collision_attempt(id) else { continue };
            let (a, b) = row.volume_codes();
            return Some((id, a, b));
        }
    }
    None
}

fn audit_with(
    name: &'static str, scenario: &Scenario, seed: u64, ticks: u32,
    mut command_at: impl FnMut(u32, &World, EntityId) -> CommandV1,
) -> Row {
    let mut worlds: Vec<World> = (0..6).map(|_| World::new(scenario, seed)).collect();
    let mut overlap = None;
    let mut rates = [None; 5];

    for tick in 0..ticks {
        let due = worlds[0].pending_decisions().to_vec();
        for id in due {
            let command = command_at(tick, &worlds[0], id);
            assert!(matches!(worlds[0].submit(id, command), SubmitOutcome::Stored { .. }),
                    "{name} baseline command was not stored");
            for at in 0..5 {
                if rates[at].is_none() {
                    assert!(matches!(worlds[at + 1].submit(id, command), SubmitOutcome::Stored { .. }),
                            "{name} counterfactual command was not stored");
                }
            }
        }
        worlds[0].step_with_arm_rate_profile(ArmRateProfile::CURRENT);
        for at in 0..5 {
            if rates[at].is_none() {
                worlds[at + 1].step_with_arm_rate_profile(changed(ArmRateProfile::CURRENT, at));
                if worlds[at + 1].state_digest().compare(worlds[0].state_digest()) != Ok(true) {
                    rates[at] = Some(tick + 1);
                }
            }
        }
        if overlap.is_none() {
            overlap = first_forbidden_crossing(&worlds[0]).map(|(id, a, b)| (tick + 1, id, a, b));
        }
        // Both registered policy corpus and golden fight stop on outcome. The
        // audit must not acquire reachability from ticks their pins never run.
        if worlds[0].outcome().is_some()
            || overlap.is_some() && rates.iter().all(Option::is_some)
        { break }
    }
    Row { name, overlap, rates }
}

fn audit_scripted(name: &'static str, scenario: &Scenario, seed: u64, ticks: u32) -> Row {
    let heroes_ids = World::new(scenario, seed).alive_ids(Faction::Heroes);
    let mut heroes = PolicyKind::Scripted.build();
    let mut monsters = PolicyKind::Scripted.build();
    heroes.reset(); monsters.reset();
    audit_with(name, scenario, seed, ticks, move |_, world, id| {
        if heroes_ids.contains(&id) { heroes.decide(&world.observe(id)) }
        else { monsters.decide(&world.observe(id)) }
    })
}

fn merge(name: &'static str, rows: impl IntoIterator<Item = Row>) -> Row {
    let mut out = Row { name, overlap: None, rates: [None; 5] };
    for row in rows {
        if out.overlap.is_none() { out.overlap = row.overlap; }
        for at in 0..5 {
            out.rates[at] = match (out.rates[at], row.rates[at]) {
                (Some(a), Some(b)) => Some(a.min(b)), (None, other) => other, (some, None) => some,
            };
        }
    }
    out
}

fn stream_publication_differs(a: &World, b: &World, ids: [EntityId; 2]) -> bool {
    let poses_a = ids.map(|id| a.pose(id));
    let poses_b = ids.map(|id| b.pose(id));
    let regions_a = ids.map(|id| a.swept_regions(id));
    let regions_b = ids.map(|id| b.swept_regions(id));
    let stances_a = ids.map(|id| a.stance(id));
    let stances_b = ids.map(|id| b.stance(id));
    let projectiles_a: Vec<_> = a.projectiles().collect();
    let projectiles_b: Vec<_> = b.projectiles().collect();
    poses_a != poses_b || regions_a != regions_b || stances_a != stances_b
        || a.contact_resolutions() != b.contact_resolutions()
        || projectiles_a != projectiles_b
}

#[cfg(not(feature = "cartesian-recoil"))]
pub(super) fn report() -> Result<(), &'static str> {
    Err("embodied --self-clearance-audit requires --features cartesian-recoil so both exact-law pins are observable")
}

#[cfg(feature = "cartesian-recoil")]
fn registered_rows() -> [Row; 6] {
    let corpus = merge("EMBODIED_CORPUS_DIGEST", super::embodied_corpus_arenas()
        .iter().flat_map(|scenario| (0..super::EMBODIED_CORPUS_SEEDS)
            .map(move |seed| audit_scripted("corpus-cell", scenario, seed,
                                            super::EMBODIED_CORPUS_TICKS))));
    let golden_scenario = Scenario::embodied_slope();
    let golden = audit_with("EMBODIED_GOLDEN_DIGEST", &golden_scenario, 31, 600,
        |tick, world, id| {
            let own = world.pose(id).expect("live golden body").body;
            let faction = if world.alive_ids(Faction::Heroes).contains(&id) {
                Faction::Monsters
            } else { Faction::Heroes };
            let opponent = world.alive_ids(faction)[0];
            let other = world.pose(opponent).expect("live golden opponent").body;
            sim::diagnostics::golden_closing_command(
                tick, fx::Vec2::new(other.x - own.x, other.y - own.y))
        });

    let (command_scenario, command_seed, command_id, command_input) = sim::diagnostics::command_probe();
    let mut command_world = World::new(&command_scenario, command_seed);
    assert!(matches!(command_world.submit(command_id, command_input), SubmitOutcome::Stored { .. }));
    let command = Row { name: "ARTICULATED_COMMAND_HASH",
        overlap: None,
        rates: [None; 5] };

    let stream_scenario = sim::diagnostics::stream_digest_scenario();
    let fighter = EntityId::new(0, 0);
    let brute = EntityId::new(1, 0);
    let mut worlds: Vec<World> = (0..6).map(|_| World::new(&stream_scenario, 1)).collect();
    for (id, stored) in sim::diagnostics::stream_digest_commands() {
        for world in &mut worlds { let _ = world.submit(id, stored); }
    }
    let mut stream = Row { name: "ARTICULATED_STREAM_DIGEST", overlap: None, rates: [None; 5] };
    for tick in 0..sim::diagnostics::STREAM_DIGEST_TICKS {
        worlds[0].step_with_arm_rate_profile(ArmRateProfile::CURRENT);
        for at in 0..5 {
            worlds[at + 1].step_with_arm_rate_profile(changed(ArmRateProfile::CURRENT, at));
            if stream.rates[at].is_none()
                && stream_publication_differs(&worlds[at + 1], &worlds[0], [fighter, brute])
            { stream.rates[at] = Some(tick + 1); }
        }
        if stream.overlap.is_none() {
            stream.overlap = first_forbidden_crossing(&worlds[0]).map(|(id, a, b)| (tick + 1, id, a, b));
        }
    }

    #[cfg(feature = "cartesian-recoil")]
    let exact_audit = sim::exact_trajectory_arm_rate_reach();
    #[cfg(not(feature = "cartesian-recoil"))]
    let exact_audit = (None, [None; 5]);
    #[cfg(feature = "cartesian-recoil")]
    let lifted_audit = sim::lifted_coulomb_arm_rate_reach();
    #[cfg(not(feature = "cartesian-recoil"))]
    let lifted_audit = (None, [None; 5]);
    #[cfg(feature = "cartesian-recoil")]
    let exact = Row { name: "EXACT_TRAJECTORY_STATE_DIGEST",
        overlap: exact_audit.overlap, rates: exact_audit.rates };
    #[cfg(not(feature = "cartesian-recoil"))]
    let exact = Row { name: "EXACT_TRAJECTORY_STATE_DIGEST",
        overlap: exact_audit.0, rates: exact_audit.1 };
    #[cfg(feature = "cartesian-recoil")]
    let lifted = Row { name: "LIFTED_COULOMB_SOLVER_DIGEST",
        overlap: lifted_audit.overlap, rates: lifted_audit.rates };
    #[cfg(not(feature = "cartesian-recoil"))]
    let lifted = Row { name: "LIFTED_COULOMB_SOLVER_DIGEST",
        overlap: lifted_audit.0, rates: lifted_audit.1 };

    [corpus, golden, command, stream, exact, lifted]
}

#[cfg(feature = "cartesian-recoil")]
pub(super) fn report() -> Result<(), &'static str> {
    println!("fixture                              forbidden crossing  bearing-max bearing-accel linear-max linear-accel plane-max");
    for row in registered_rows() {
        let overlap = row.overlap.map_or_else(|| "unreached".to_string(),
            |(tick, id, a, b)| format!("t{tick} {}:{} {a}/{b}", id.index, id.generation));
        let rate = |value: Option<u32>| value.map_or_else(|| "--".to_string(), |tick| tick.to_string());
        println!("{:<36} {:<19} {:>11} {:>13} {:>10} {:>12} {:>9}", row.name, overlap,
                 rate(row.rates[0]), rate(row.rates[1]), rate(row.rates[2]),
                 rate(row.rates[3]), rate(row.rates[4]));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_current_rate_profile_is_byte_identical_and_registered_inputs_are_shared() {
        let zero = Row { name: "ARTICULATED_COMMAND_HASH", overlap: None, rates: [None; 5] };
        assert_eq!(zero.name, "ARTICULATED_COMMAND_HASH");
        assert_eq!(zero.overlap, None);
        assert_eq!(zero.rates, [None; 5], "an unstepped pin cannot reach an actuator rate");

        let scenario = Scenario::embodied_duel();
        let mut ordinary = World::new(&scenario, 7);
        let mut diagnostic = ordinary.clone();
        ordinary.step();
        diagnostic.step_with_arm_rate_profile(ArmRateProfile::CURRENT);
        assert_eq!(ordinary.state_digest().compare(diagnostic.state_digest()), Ok(true),
                   "the diagnostic baseline changed the production step");

        let (scenario, seed, id, input) = sim::diagnostics::command_probe();
        assert_eq!(seed, 1);
        assert_eq!(id, EntityId::new(0, 0));
        assert_eq!(input.payload_bytes(), sim::diagnostics::COMMAND_PROBE_PAYLOAD);
        assert_eq!(scenario.name, "embodied-duel-v1");
        assert_eq!(sim::diagnostics::stream_digest_scenario().name, "embodied-stream-v1");
    }

    #[cfg(not(feature = "cartesian-recoil"))]
    #[test]
    fn the_default_audit_refuses_the_two_exact_rows_by_name() {
        assert_eq!(report(), Err("embodied --self-clearance-audit requires --features cartesian-recoil so both exact-law pins are observable"));
    }

    #[test]
    fn a_known_rate_perturbation_reaches_the_registered_stream_publication() {
        let scenario = sim::diagnostics::stream_digest_scenario();
        let mut baseline = World::new(&scenario, sim::diagnostics::STREAM_DIGEST_SEED);
        let mut changed_world = baseline.clone();
        for (id, command) in sim::diagnostics::stream_digest_commands() {
            assert!(matches!(baseline.submit(id, command), SubmitOutcome::Stored { .. }));
            assert!(matches!(changed_world.submit(id, command), SubmitOutcome::Stored { .. }));
        }
        baseline.step_with_arm_rate_profile(ArmRateProfile::CURRENT);
        changed_world.step_with_arm_rate_profile(ArmRateProfile {
            linear_accel_raw: ArmRateProfile::CURRENT.linear_accel_raw + 1,
            ..ArmRateProfile::CURRENT
        });
        assert!(stream_publication_differs(&baseline, &changed_world,
                    [EntityId::new(0, 0), EntityId::new(1, 0)]),
                "the registered five-dataset stream ignored linear acceleration");
        assert_eq!(first_forbidden_crossing(&baseline), None,
                   "the registered stream fabricated a crossing from its entry geometry");
    }

    #[test]
    fn every_arm_rate_has_an_independent_counterfactual() {
        let current = ArmRateProfile::CURRENT;
        for at in 0..RATE_NAMES.len() {
            let other = changed(current, at);
            let before = [current.bearing_max_speed_raw, current.bearing_accel_raw,
                current.linear_max_speed_raw, current.linear_accel_raw,
                current.elbow_plane_max_speed_raw];
            let after = [other.bearing_max_speed_raw, other.bearing_accel_raw,
                other.linear_max_speed_raw, other.linear_accel_raw,
                other.elbow_plane_max_speed_raw];
            assert_eq!(after[at], before[at] + 1, "{} was not changed", RATE_NAMES[at]);
            assert_eq!(after.iter().zip(before).filter(|(a, b)| **a != *b).count(), 1,
                       "{} changed another rate", RATE_NAMES[at]);
        }
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn the_self_clearance_audit_observes_every_registered_fixture_without_changing_it() {
        let rows = registered_rows();
        assert_eq!(rows.clone().map(|row| row.name), [
            "EMBODIED_CORPUS_DIGEST", "EMBODIED_GOLDEN_DIGEST",
            "ARTICULATED_COMMAND_HASH", "ARTICULATED_STREAM_DIGEST",
            "EXACT_TRAJECTORY_STATE_DIGEST", "LIFTED_COULOMB_SOLVER_DIGEST",
        ]);
        assert_eq!(rows.clone().map(|row| row.overlap), [
            Some((14, EntityId::new(1, 0), 2, 4)),
            Some((5, EntityId::new(0, 0), 8, 4)),
            None,
            Some((5, EntityId::new(1, 0), 5, 6)),
            Some((7, EntityId::new(0, 0), 8, 4)),
            Some((7, EntityId::new(0, 0), 8, 4)),
        ]);
        assert_eq!(rows.map(|row| row.rates), [
            [Some(3), Some(1), Some(3), Some(1), Some(1)],
            [Some(3), Some(1), Some(3), Some(1), None],
            [None; 5],
            [Some(3), Some(1), Some(3), Some(1), None],
            [None, None, None, Some(1), None],
            [None, None, None, Some(1), None],
        ]);
    }
}
