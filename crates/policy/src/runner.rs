use crate::Policy;
use fx::{Fx, Vec2};
use sim::{EntityId, Event, Faction, Order, Outcome, Replay, Scenario, World};

/// How to drive a run.
#[derive(Clone, Debug)]
pub struct RunConfig {
    /// Overrides [`Scenario::max_ticks`] when set.
    pub max_ticks: Option<u32>,
    /// Record every decision. Off by default: recording costs an allocation
    /// per decision, which matters when the lab is doing thousands of runs and
    /// throwing all of them away.
    pub record: bool,
    /// Standing orders, `[heroes, monsters]`.
    pub orders: [Order; 2],
}

impl Default for RunConfig {
    fn default() -> Self {
        RunConfig {
            max_ticks: None,
            record: false,
            // Both sides are ordered to advance. This is not decoration: with
            // no standing order a sensible policy correctly stands still, and
            // a lab full of stalemates measures nothing. The player's order
            // channel is part of the game, so experiments exercise it.
            orders: [Order::Advance(Vec2::X), Order::Advance(-Vec2::X)],
        }
    }
}

/// What a run produced. Everything a fitness function might want, computed
/// once, so the lab never has to keep a `World` alive after the fact.
#[derive(Clone, Debug)]
pub struct RunResult {
    pub outcome: Outcome,
    pub ticks: u32,
    pub state_hash: u64,
    /// Surviving health as a fraction of what the side started with.
    pub hero_health: Fx,
    pub monster_health: Fx,
    pub hero_damage: Fx,
    pub monster_damage: Fx,
    pub decisions: u64,
    /// Blows that landed, blows a shield stopped, and blade-on-blade crossings.
    ///
    /// Tallied from the event slice `World::step` returns, which this loop
    /// discarded before there was anything interesting in it. They are what
    /// makes a claim about *swordsmanship* measurable rather than a claim about
    /// who happened to win: two policies can post identical win rates and get
    /// there by completely different means.
    pub blows: u32,
    pub blocks: u32,
    pub parries: u32,
    /// Arrows loosed. The **denominator** of an accuracy figure and not a
    /// success count: whether one arrived is already in `blows`.
    pub shots: u32,
    pub replay: Option<Replay>,
}

impl RunResult {
    pub fn heroes_won(&self) -> bool {
        self.outcome.winner() == Some(Faction::Heroes)
    }
}

/// Drives a scenario to a conclusion.
///
/// This is the only loop in the project that knows how to play the game, and
/// it is eleven lines long. Both the headless lab and (eventually) the browser
/// client run this same shape -- the client just renders between steps.
pub fn run(
    scenario: &Scenario,
    seed: u64,
    mut policy: impl Policy,
    config: &RunConfig,
) -> RunResult {
    policy.reset();

    let mut world = World::new(scenario, seed);
    let limit = config.max_ticks.unwrap_or(scenario.max_ticks);
    let mut replay = config.record.then(|| Replay::new(scenario, seed));

    for (faction, order) in [
        (Faction::Heroes, config.orders[0]),
        (Faction::Monsters, config.orders[1]),
    ] {
        world.set_order(faction, order);
        if let Some(replay) = replay.as_mut() {
            replay.record_order(0, faction, order);
        }
    }
    let mut due: Vec<EntityId> = Vec::new();
    let mut decisions = 0u64;
    let (mut blows, mut blocks, mut parries, mut shots) = (0u32, 0u32, 0u32, 0u32);

    while world.outcome().is_none() && world.tick() < limit {
        due.clear();
        due.extend_from_slice(world.pending_decisions());
        for &id in &due {
            let command = policy.decide(&world.observe(id));
            if let Some(replay) = replay.as_mut() {
                replay.record(world.tick(), id, command);
            }
            world.submit(id, command);
            decisions += 1;
        }
        for event in world.step() {
            match event {
                Event::Damage { .. } => blows += 1,
                Event::Block { .. } => blocks += 1,
                Event::Parry { .. } => parries += 1,
                // Counted as a shot thrown, not as a shot landed -- whether it
                // arrives comes back later as a `Damage` like anything else.
                Event::Loose { .. } => shots += 1,
                Event::Death { .. } => {}
            }
        }
    }

    let ticks = world.tick();
    if let Some(replay) = replay.as_mut() {
        replay.finish(ticks);
    }

    RunResult {
        // A fight that ran out of clock is scored on points rather than thrown
        // away; see `World::timeout`. `Outcome::Draw` still comes back for a
        // genuine tie, so "the two sides never found each other" stays visible.
        outcome: world.outcome().unwrap_or_else(|| world.timeout()),
        ticks,
        state_hash: world.state_hash(),
        hero_health: world.health_fraction(Faction::Heroes),
        monster_health: world.health_fraction(Faction::Monsters),
        hero_damage: world.damage_dealt(Faction::Heroes),
        monster_damage: world.damage_dealt(Faction::Monsters),
        decisions,
        blows,
        blocks,
        parries,
        shots,
        replay,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{IdlePolicy, TeamPolicy, UtilityPolicy};

    #[test]
    fn a_run_is_reproducible() {
        let scenario = Scenario::skirmish(3, 4, 5);
        let config = RunConfig::default();
        let a = run(&scenario, 17, &mut UtilityPolicy::baseline(), &config);
        let b = run(&scenario, 17, &mut UtilityPolicy::baseline(), &config);
        assert_eq!(a.state_hash, b.state_hash);
        assert_eq!(a.ticks, b.ticks);
        assert_eq!(a.outcome, b.outcome);
    }

    #[test]
    fn a_recorded_run_replays_exactly() {
        let scenario = Scenario::skirmish(8, 3, 4);
        let config = RunConfig {
            record: true,
            ..RunConfig::default()
        };
        let result = run(&scenario, 21, &mut UtilityPolicy::baseline(), &config);
        let replay = result.replay.as_ref().expect("recording was requested");
        assert!(!replay.is_empty());
        let played = replay.play();
        assert_eq!(played.state_hash(), result.state_hash);
        assert_eq!(played.tick(), result.ticks);
    }

    #[test]
    fn a_policy_instance_can_be_reused_without_leaking_between_runs() {
        // Policies hold per-entity memory; if `reset` were skipped, the second
        // run would start with opinions about entities from the first.
        let scenario = Scenario::skirmish(12, 4, 4);
        let config = RunConfig::default();
        let mut policy = UtilityPolicy::baseline();
        let first = run(&scenario, 5, &mut policy, &config);
        let _ = run(&Scenario::skirmish(99, 6, 2), 6, &mut policy, &config);
        let again = run(&scenario, 5, &mut policy, &config);
        assert_eq!(first.state_hash, again.state_hash);
    }

    #[test]
    fn doing_something_beats_doing_nothing() {
        // The floor test for the whole fitness pipeline: if a real policy does
        // not reliably beat a side that stands still and gets eaten, the
        // measurement is broken and every experiment above it is noise.
        let config = RunConfig::default();
        let mut wins = 0;
        let trials = 12;
        for seed in 0..trials {
            let mut team = TeamPolicy::new(UtilityPolicy::baseline(), IdlePolicy);
            let scenario = Scenario::skirmish(seed, 4, 4);
            if run(&scenario, seed, &mut team, &config).heroes_won() {
                wins += 1;
            }
        }
        // Should be 12/12. The bound is loose because losing here means the
        // heroes failed to *find* four stationary targets, which is a search
        // problem this milestone has not solved, not a fighting problem.
        assert!(
            wins * 4 >= trials * 3,
            "active heroes only won {wins}/{trials} against a side that does nothing"
        );
    }

    #[test]
    fn fights_reach_a_conclusion_instead_of_timing_out() {
        // Agents that cannot find each other produce a lab full of draws, and
        // a fitness function fed on draws cannot rank anything.
        let config = RunConfig::default();
        let mut resolved = 0;
        // Enough samples to actually measure a rate. The measured draw rate is
        // around 8% over 48 skirmishes, and a threshold of 20% needs more than a
        // handful of seeds to sit safely above that: at 24 trials an ordinary
        // unlucky slice lands five draws about one time in nine, which is a
        // flaky test rather than a failing game. Sixty is enough that the
        // threshold is measuring the game.
        let trials = 60;
        for seed in 0..trials {
            let scenario = Scenario::skirmish(seed + 100, 4, 6);
            let result = run(&scenario, seed, &mut UtilityPolicy::baseline(), &config);
            if result.outcome != Outcome::Draw {
                resolved += 1;
            }
        }
        assert!(
            resolved * 5 >= trials * 4,
            "only {resolved}/{trials} fights resolved; agents are failing to engage"
        );
    }
}
