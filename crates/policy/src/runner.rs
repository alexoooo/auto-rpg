use crate::ArticulatedPolicy;
use fx::{Fx, Vec2};
use sim::{
    CommandReject, EntityId, Event, Faction, Order, Outcome, Replay, Scenario,
    SubmitArticulatedOutcome, SubmittedCommand, World,
};

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
    /// Submissions the world did not take as offered. Always zero for [`run`],
    /// which drives [`World::submit`] and has nothing to report: the legacy
    /// entry is infallible by construction and silently ignores a stale handle.
    ///
    /// [`run_articulated`]'s entry is not. A range failure or a grip against
    /// missing equipment stores the **neutral** command instead of the one the
    /// policy offered, and a stale identity or a Legacy scenario stores nothing
    /// at all -- though of those last two only the Legacy refusal is reachable
    /// from this harness, because every handle it submits came out of
    /// [`World::pending_decisions`] on the same tick. Both are counted here,
    /// because both mean the run that happened
    /// is not the run the policy asked for, and a harness that swallowed the
    /// difference would leave a policy bug looking like a policy that does not
    /// work very well.
    pub rejected: u32,
    /// Why the first rejection happened, or `None` if there were none.
    ///
    /// One reason rather than a vector: a rejection is a bug in whatever built
    /// the command, and the second thousand copies of `OutOfRange(LeftReach)`
    /// cost an allocation per run to tell nobody anything. The count above says
    /// how bad it is; this says what to go and look at.
    pub first_rejection: Option<CommandReject>,
    pub replay: Option<Replay>,
}

impl RunResult {
    pub fn heroes_won(&self) -> bool {
        self.outcome.winner() == Some(Faction::Heroes)
    }
}

/// **`run` -- the legacy loop this file was written around -- is gone.**
/// It was eleven lines and drove `Policy` over the legacy `Observation`, and
/// three claims went with it that nothing else in this crate now makes: that a
/// run is reproducible from its seed, that a recorded run replays exactly, and
/// that a policy instance can be reused across rollouts without one leaking into
/// the next. The first two are asserted for the surviving model in
/// `crates/sim/tests/determinism.rs`, which is the better home for them anyway
/// -- they are properties of the simulator, not of a runner. **The third is not
/// asserted anywhere**: `reset` is still on both surviving traits and nothing
/// checks that a caller who forgets it gets caught. That is a real gap and it is
/// written here rather than in a commit message.
///
/// It also took `doing_something_beats_doing_nothing`, the control-condition
/// claim that a policy which acts beats one that does not. The embodied corpus
/// reports win rates and could carry that claim; it does not carry it today.

/// Drives an articulated scenario to a conclusion.
///
/// [`run`]'s twin, and deliberately a sibling rather than a branch inside it:
/// `run` is on the path of every pinned lab hash, and the two loops differ in
/// the observation they ask for, the entry they submit to, the command vector
/// they record into, and what a refusal means. A `match` on the combat model
/// inside `run` would put all four differences behind one branch on the hot
/// loop of the thing that must not move.
///
/// Three things differ from `run` beyond the obvious substitutions.
///
/// **What gets recorded is what the world *stored*, not what the policy
/// offered.** [`World::submit_articulated_v1`] answers
/// [`SubmitArticulatedOutcome::Stored`] with a command that may not be the one
/// it was handed: a range failure or a grip against equipment that is not there
/// stores the neutral command atomically and returns the reason alongside it.
/// The v2 contract is that replays persist final submitted commands, and
/// [`Replay::play`] feeds them straight back through this same entry -- so
/// recording the *offered* command would re-run the same rejection at playback
/// and, the day validation changes by a raw unit, reproduce a different fight
/// from the one it claims to. Record the stored command and playback is exact
/// whatever validation later decides.
///
/// **The event counters stay at zero.** The articulated arm of [`World::step`]
/// emits exactly one [`Event`] variant, [`Event::Death`]; blows, blocks,
/// parries and shots are legacy swing-resolution events and no articulated tick
/// produces them. Damage under this model is carried by contact resolution
/// rows, not by the event feed. The arms below are spelled out anyway, on the
/// same argument `run`'s are: the next variant has to be thought about here.
///
/// **The outcome gate is live, and the shipped fixture will not reach it.**
/// Articulated bodies do die -- `reap_dead_articulated` clears `alive` and
/// pushes the death -- so [`World::outcome`] is reachable and this is not a
/// dressed-up `for tick in 0..max_ticks`;
/// `an_articulated_run_stops_on_a_death_and_not_only_on_the_clock` proves it by
/// thinning an anatomy until the reaper fires. What no policy can do today is
/// reach it in `Scenario::articulated_duel`: measured at v2-16, sixty seconds
/// of continuous contact between the fixture's Fighter and Brute takes the
/// Brute from 1.000 health to 0.948 and leaves the Fighter untouched. That is a
/// damage model still being built, not a broken loop, and until it lands the
/// second gate carries every run -- which is why [`World::timeout`] scoring on
/// points matters here rather than being the rare case it is under `run`.
pub fn run_articulated(
    scenario: &Scenario,
    seed: u64,
    mut policy: impl ArticulatedPolicy,
    config: &RunConfig,
) -> RunResult {
    policy.reset();

    let mut world = World::new(scenario, seed);
    let limit = config.max_ticks.unwrap_or(scenario.max_ticks);
    let mut replay = config.record.then(|| Replay::new(scenario, seed));

    // Set and recorded exactly as `run` does, and inert exactly as deliberately:
    // an articulated observation has no order column, so no articulated policy
    // can read one and no articulated movement consults the nav field. It is
    // still a world input, and a replay that recorded only the inputs somebody
    // currently reads would silently stop reproducing its run on the day the
    // articulated model grows a standing order.
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
    let mut rejected = 0u32;
    let mut first_rejection: Option<CommandReject> = None;

    while world.outcome().is_none() && world.tick() < limit {
        due.clear();
        due.extend_from_slice(world.pending_decisions());
        for &id in &due {
            let command = policy.decide(&world.observe_articulated(id));
            // Counted where `run` counts it: a decision is one the policy made,
            // not one the world liked. `rejected` is the second number, and the
            // two together say how much of the run the policy actually drove.
            decisions += 1;
            let (stored, rejection) = match world.submit_articulated_v1(id, command) {
                SubmitArticulatedOutcome::Stored { command, rejection } => {
                    (Some(command), rejection)
                }
                // **Exactly one reason reaches this arm from here, and it is
                // `WrongModel`.** The other one it can carry is `StaleEntity`,
                // and no handle in `due` can be stale: `pending_decisions` is
                // rebuilt from the alive set, `observe_articulated` and
                // `submit_articulated_v1` kill nobody, and the only thing that
                // does -- `World::step` -- runs after this loop. The arm is
                // written for the outcome and not for the reason, so a future
                // caller that names the dead (a replay driver, say) lands here
                // correctly rather than needing a second shape.
                SubmitArticulatedOutcome::NotStored(reason) => (None, Some(reason)),
            };
            if let Some(reason) = rejection {
                rejected += 1;
                first_rejection.get_or_insert(reason);
            }
            // Nothing to persist when nothing was stored: the world's command
            // vector is unchanged, so a replay that carried a row here would
            // hand playback a submission the recorded run never made.
            if let (Some(replay), Some(stored)) = (replay.as_mut(), stored) {
                replay.record_submitted(
                    world.tick(),
                    id,
                    SubmittedCommand::Articulated(stored),
                );
            }
        }
        for event in world.step() {
            match event {
                Event::Damage { .. } => blows += 1,
                Event::Block { .. } => blocks += 1,
                Event::Parry { .. } => parries += 1,
                Event::Loose { .. } => shots += 1,
                Event::Death { .. } | Event::Shove { .. } => {}
            }
        }
    }

    let ticks = world.tick();
    if let Some(replay) = replay.as_mut() {
        replay.finish(ticks);
    }

    RunResult {
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
        rejected,
        first_rejection,
        replay,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        neutral_articulated_command, NeutralArticulatedPolicy,
    };
    use sim::{ArticulatedCommandV1, ArticulatedObservation, CommandField, Intent};

    // ------------------------------------------------------- articulated seam

    /// The shipped articulated fixture with the two bodies moved inside each
    /// other's sight.
    ///
    /// `Scenario::articulated_duel` spawns them 10.8 units apart and the
    /// Fighter's sight range is 9.6, so at the shipped placement neither
    /// observation ever contains an opponent -- and an articulated policy has
    /// no standing order to walk along while it searches, because the
    /// observation deliberately has no order column. Every test below is about
    /// the seam and not about search, so they start in contact range.
    fn duel_in_sight() -> Scenario {
        let mut scenario = Scenario::articulated_duel();
        scenario.units[0].spawn = Vec2::from_ints(10, 8);
        scenario.units[1].spawn = Vec2::from_ints(14, 8);
        scenario
    }

    /// Walks at the nearest opponent and swings at it with both arms.
    ///
    /// A bad fighter and not trying to be a good one: it is the smallest thing
    /// that makes an articulated fight actually *finish*, which is what these
    /// tests need out of it, and every column it reads comes out of the
    /// observation it was handed.
    fn advance_and_strike(obs: &ArticulatedObservation) -> ArticulatedCommandV1 {
        let mut command = neutral_articulated_command(obs);
        let Some(nearest) = obs.opponents().first() else {
            return command;
        };
        let delta = Vec2::new(
            nearest.body_position.x - obs.body_position.x,
            nearest.body_position.y - obs.body_position.y,
        );
        let bearing = delta.angle();
        // Fifteen sixteenths rather than one: `clamp_length` normalises by
        // dividing and then multiplying, so a unit answer can land a raw tick
        // over the magnitude the sim validates, and the runs below assert that
        // nothing was rejected.
        command.move_dir = delta.clamp_length(Fx::from_ratio(15, 16));
        command.body_yaw = bearing;
        command.intent = Intent::Attack(nearest.id);
        for arm in command.arms.iter_mut() {
            arm.bearing = bearing;
            arm.reach = Fx::ONE;
            arm.effort = Fx::ONE;
        }
        command
    }

    /// Keeps every observation it was shown and every command it answered with,
    /// and tires over the run it is answering.
    ///
    /// **The tiring is what makes `reset` observable, and it is here because
    /// nothing else in this file could see it.** A policy whose `decide` is a
    /// pure function of its argument answers identically whether or not the
    /// runner cleared it, so every fixture being pure left
    /// `run_articulated`'s `policy.reset()` covered by nothing: deleting the
    /// line kept all 102 policy tests green, including the one named for the
    /// property. So this policy carries state that accumulates across decisions
    /// *and* changes what it answers with, and the leak becomes a different
    /// state hash rather than an invisible one.
    #[derive(Default)]
    struct Recorder {
        seen: Vec<ArticulatedObservation>,
        issued: Vec<ArticulatedCommandV1>,
    }

    impl Recorder {
        /// Effort for the next decision: full at the start of a run, sagging by
        /// a thirty-second over the first sixteen and staying there.
        ///
        /// Saturating rather than cyclic, deliberately. A counter read modulo
        /// anything can land back on its starting value at a run boundary, and
        /// a missing `reset` would then be invisible again on exactly the seeds
        /// where the arithmetic lines up. Saturation makes "this instance has
        /// already answered a run" a state no amount of counting returns from.
        /// Small, because these tests are about the seam and not about the
        /// fight: it has to move the hash, not the outcome.
        fn effort(&self) -> Fx {
            Fx::ONE - Fx::from_ratio(self.issued.len().min(16) as i32, 512)
        }
    }

    impl ArticulatedPolicy for Recorder {
        fn decide(&mut self, obs: &ArticulatedObservation) -> ArticulatedCommandV1 {
            let mut command = advance_and_strike(obs);
            for arm in command.arms.iter_mut() {
                arm.effort = self.effort();
            }
            self.seen.push(*obs);
            self.issued.push(command);
            command
        }

        fn reset(&mut self) {
            self.seen.clear();
            self.issued.clear();
        }
    }

    #[test]
    fn an_articulated_policy_has_no_world_parameter() {
        // The *type-level* half of this claim belongs to the `compile_fail`
        // doctest on `ArticulatedPolicy`, which is the only thing that can show
        // no policy can reach the world. What a unit test can show is the
        // consequence: decisions are a function of the observation sequence
        // alone. So drive one policy through the runner, prove it was shown
        // exactly what `World::observe_articulated` answers at each decision
        // point, and then reproduce every command from that recording with no
        // world in the room at all.
        let scenario = duel_in_sight();
        let config = RunConfig {
            max_ticks: Some(180),
            ..RunConfig::default()
        };

        let mut recorder = Recorder::default();
        let result = run_articulated(&scenario, 31, &mut recorder, &config);
        assert!(!recorder.seen.is_empty(), "nobody was ever asked to decide");
        assert_eq!(result.rejected, 0, "the fixture policy submits legal commands");

        // What the world would have shown, computed independently of the
        // runner. Same loop, same order, and the commands fed back in are the
        // ones the policy issued, so the two worlds stay in step.
        let mut world = World::new(&scenario, 31);
        for (faction, order) in [
            (Faction::Heroes, config.orders[0]),
            (Faction::Monsters, config.orders[1]),
        ] {
            world.set_order(faction, order);
        }
        let mut expected: Vec<ArticulatedObservation> = Vec::new();
        let mut next = 0usize;
        while world.outcome().is_none() && world.tick() < 180 {
            for id in world.pending_decisions().to_vec() {
                expected.push(world.observe_articulated(id));
                let _ = world.submit_articulated_v1(id, recorder.issued[next]);
                next += 1;
            }
            world.step();
        }
        assert_eq!(recorder.seen, expected);
        assert_eq!(world.state_hash(), result.state_hash);

        // And now with no world: the same observations, in the same order, into
        // a fresh instance. If anything the policy answered had come from
        // somewhere other than its argument, this is where it would go missing.
        let mut offline = Recorder::default();
        let replayed: Vec<ArticulatedCommandV1> =
            recorder.seen.iter().map(|obs| offline.decide(obs)).collect();
        assert_eq!(replayed, recorder.issued);
    }

    #[test]
    fn an_articulated_run_is_reproducible() {
        let scenario = duel_in_sight();
        let config = RunConfig::default();
        let a = run_articulated(&scenario, 17, Recorder::default(), &config);
        let b = run_articulated(&scenario, 17, Recorder::default(), &config);
        assert_eq!(a.state_hash, b.state_hash);
        assert_eq!(a.ticks, b.ticks);
        assert_eq!(a.outcome, b.outcome);
    }

    #[test]
    fn a_recorded_articulated_run_replays_exactly() {
        let scenario = duel_in_sight();
        let config = RunConfig {
            record: true,
            ..RunConfig::default()
        };
        let result = run_articulated(&scenario, 21, Recorder::default(), &config);
        let replay = result.replay.as_ref().expect("recording was requested");
        assert!(!replay.entries.is_empty() || !replay.submitted_entries.is_empty());
        // The articulated seam writes the versioned vector and never the legacy
        // one, which is the half of "exactly one command vector is active" that
        // the recorder is responsible for.
        assert!(replay.entries.is_empty(), "the legacy vector must stay empty");
        let played = replay.play();
        assert_eq!(played.state_hash(), result.state_hash);
        assert_eq!(played.tick(), result.ticks);
    }

    #[test]
    fn a_refused_submission_is_recorded_as_what_the_world_stored() {
        // A policy that asks for an arm reach one raw unit past the maximum.
        // The world refuses the whole command atomically and stores the neutral
        // one instead, so that -- not the offered command -- is what a replay
        // has to carry.
        #[derive(Default)]
        struct Overreacher {
            seen: Vec<ArticulatedObservation>,
        }
        impl ArticulatedPolicy for Overreacher {
            fn decide(&mut self, obs: &ArticulatedObservation) -> ArticulatedCommandV1 {
                self.seen.push(*obs);
                let mut command = advance_and_strike(obs);
                command.arms[0].reach = Fx::from_raw(Fx::ONE.raw() + 1);
                command
            }
        }

        let scenario = duel_in_sight();
        let config = RunConfig {
            max_ticks: Some(60),
            record: true,
            ..RunConfig::default()
        };
        let honest = run_articulated(&scenario, 44, Recorder::default(), &config);
        let mut policy = Overreacher::default();
        let result = run_articulated(&scenario, 44, &mut policy, &config);

        assert_eq!(result.rejected, result.decisions as u32);
        assert!(result.rejected > 0);
        assert_eq!(
            result.first_rejection,
            Some(CommandReject::OutOfRange(CommandField::LeftReach))
        );
        // The counters are the point of the two fields: without them a run
        // where every single command was thrown away looks exactly like a run
        // by a policy that is not very good.
        assert_ne!(result.state_hash, honest.state_hash);

        let replay = result.replay.as_ref().expect("recording was requested");
        assert_eq!(replay.submitted_entries.len(), result.decisions as usize);
        assert_eq!(policy.seen.len(), result.decisions as usize);
        for (record, shown) in replay.submitted_entries.iter().zip(&policy.seen) {
            let SubmittedCommand::Articulated(recorded) = record.command else {
                panic!("an articulated run must record articulated commands");
            };
            // Note what this deliberately does *not* rest on. Replay equality
            // would pass either way today: playback runs the same validator, so
            // recording the offered command would have it refused a second time
            // and substituted again. The contract is that a replay persists
            // final *submitted* commands, and the only way to check that is to
            // read what was written down.
            assert_eq!(recorded, neutral_articulated_command(shown));
            assert!(recorded.arms[0].reach <= Fx::ONE);
        }
        let played = replay.play();
        assert_eq!(played.state_hash(), result.state_hash);
    }

    #[test]
    fn a_wrong_model_submission_is_counted_and_never_recorded() {
        // The other rejection shape: nothing is stored at all, so there is
        // nothing for a replay to carry, and a harness that recorded a row here
        // would hand playback a submission the run never made.
        //
        // **Named for the rejection it actually produces.** It was called
        // `a_stale_identity_is_counted_and_never_recorded`, which named a
        // rejection this test cannot reach and neither can the runner:
        // `World::pending_decisions` is rebuilt from the alive set and yields
        // only live handles, nothing between it and `submit_articulated_v1`
        // kills anybody -- only `World::step` does, and that is past the
        // decision loop -- so `NotStored(StaleEntity)` is unreachable from
        // `run_articulated` altogether. The `NotStored` arm is worth covering
        // regardless, because what is being checked is the arm's *behaviour*
        // and not which reason walked into it, and `WrongModel` is the reason
        // that is reachable. See the note on the arm itself.
        struct WrongModel;
        impl ArticulatedPolicy for WrongModel {
            fn decide(&mut self, obs: &ArticulatedObservation) -> ArticulatedCommandV1 {
                neutral_articulated_command(obs)
            }
        }

        // A Legacy scenario refuses every articulated submission by model, and
        // it is the only way this harness reaches the `NotStored` arm at all.
        let scenario = Scenario::duel();
        let config = RunConfig {
            max_ticks: Some(30),
            record: true,
            ..RunConfig::default()
        };
        let result = run_articulated(&scenario, 3, WrongModel, &config);
        assert!(result.decisions > 0);
        assert_eq!(result.rejected, result.decisions as u32);
        assert_eq!(result.first_rejection, Some(CommandReject::WrongModel));
        let replay = result.replay.as_ref().expect("recording was requested");
        assert!(replay.submitted_entries.is_empty());
    }

    #[test]
    fn an_articulated_run_stops_on_a_death_and_not_only_on_the_clock() {
        // The loop gates on `World::outcome`, and that gate is only worth
        // having if an articulated world can reach one. It can: contact wounds
        // an anatomy, `settle_anatomy` bleeds it, `reap_dead_articulated`
        // clears `alive`, and the outcome falls out of the alive counts exactly
        // as it does under the legacy model. Without this the loop would be a
        // `for tick in 0..max_ticks` wearing a `while`.
        //
        // **The monster is made of paper on purpose.** At the shipped anatomy
        // the v2-16 contact model is nowhere near lethal -- measured, sixty
        // seconds of continuous contact takes the Brute from 1.000 health to
        // 0.948 and leaves the Fighter untouched, so no policy can end this
        // fixture inside its hour of ticks. That is a property of a damage
        // model still being built and not of this loop, and the honest way to
        // test the loop is to shrink the anatomy until the reaper fires rather
        // than to wait for the game to be balanced.
        // `an_articulated_run_that_outlives_the_clock_is_scored_on_points`
        // covers the shipped fixture as it actually behaves today.
        //
        // **The last clause of that paragraph stopped being true on
        // 2026-08-15 and is kept because it is the measurement it was.**
        // Smart134's doubled arm bearing rates made the shipped anatomy
        // lethal: `duel_in_sight` at seed 9 now ends on tick 511 with the
        // Fighter winning in the default build, and on tick 125 with the
        // Fighter *dead* under `cartesian-recoil`. The paper monster stays --
        // shrinking the anatomy is still the way to make this test about the
        // reaper rather than about how hard the game happens to hit this
        // month, which is exactly what a fixture that ends on tick 511 for
        // reasons of its own would stop being.
        let mut scenario = duel_in_sight();
        let table = scenario.combat_specs.as_mut().expect("the articulated fixture has specs");
        let brute = table.anatomies.iter_mut().find(|row| row.id == 2).expect("the brute anatomy");
        brute.integrity_maxima = [Fx::from_ratio(1, 32); 5];
        brute.blood_max = Fx::from_ratio(1, 32);

        let config = RunConfig::default();
        let result = run_articulated(&scenario, 9, Recorder::default(), &config);
        assert_eq!(result.rejected, 0);
        assert!(
            result.ticks < scenario.max_ticks,
            "the fight ran the full {} ticks", scenario.max_ticks
        );
        assert_eq!(result.outcome, Outcome::HeroesWin);
        // And the legacy swordplay counters are honestly empty rather than
        // quietly broken: the articulated arm of `World::step` emits only
        // `Event::Death`, and damage travels as contact resolution rows.
        assert_eq!((result.blows, result.blocks, result.parries, result.shots), (0, 0, 0, 0));
    }

    #[test]
    fn an_articulated_run_that_outlives_the_clock_is_scored_on_points() {
        // `World::timeout` is model-agnostic -- it compares health fractions,
        // and `health_fraction` routes through the anatomy for an articulated
        // body -- so the second gate is a real answer rather than a shrug. It
        // is also the answer this bounded fixture gives today. The cap is
        // deliberately before the first natural body decision, so reaching it
        // proves this was the clock's answer rather than a coincident outcome.
        //
        // **90 and not 180, since 2026-08-15**, and the cap moved rather than
        // the claim. Smart134's doubled arm bearing rates gave this fixture a
        // natural body decision it did not have: under `cartesian-recoil` the
        // Fighter now *dies* on tick 125, so a 180-tick clock stopped being a
        // clock at all here and the two assertions below both failed -- which
        // is exactly the failure the sentence above predicted and wanted. The
        // fixture is unchanged; only the clock it outlives moved.
        //
        // The number is bounded from both sides by the assertions themselves,
        // which is the point of choosing it with room rather than shaving it.
        // From above by the earliest natural decision either build reaches:
        // 125 under `cartesian-recoil` and 511 in the default build, where the
        // Fighter wins instead. Past either one, `outcome` stops being
        // `Decision` and this is no longer a test about the clock. From below
        // by the health comparison: the two fractions have to have separated
        // by the cap or the third assertion is deciding a tie, and they
        // separate before tick 40 in both builds.
        let scenario = duel_in_sight();
        let config = RunConfig {
            max_ticks: Some(90),
            ..RunConfig::default()
        };
        let result = run_articulated(&scenario, 9, Recorder::default(), &config);
        assert_eq!(result.ticks, 90);
        assert_eq!(result.outcome, Outcome::Decision(Faction::Heroes));
        assert!(result.hero_health > result.monster_health);
    }

    #[test]
    fn an_articulated_policy_instance_can_be_reused_without_leaking_between_runs() {
        // `Recorder` tires as it decides, so the third run is only the first
        // run again if `run_articulated` cleared the instance it was handed.
        // Without that, the fatigue two runs deep is saturated where a fresh
        // instance's is zero, the commands differ from the first decision, and
        // both assertions below fail rather than passing on a policy that could
        // not tell the difference.
        let scenario = duel_in_sight();
        let config = RunConfig::default();
        let mut policy = Recorder::default();
        let first = run_articulated(&scenario, 5, &mut policy, &config);
        let _ = run_articulated(&scenario, 6, &mut policy, &config);
        let again = run_articulated(&scenario, 5, &mut policy, &config);
        assert_eq!(first.state_hash, again.state_hash);
        assert_eq!(first.ticks, again.ticks);
        // And the recording itself is one run's worth, which is the same claim
        // read off the policy rather than off the world: a recorder still
        // holding three runs of observations is a recorder the runner never
        // cleared.
        assert_eq!(policy.seen.len(), again.decisions as usize);
        assert_eq!(policy.issued.len(), again.decisions as usize);
    }

    #[test]
    fn a_boxed_articulated_policy_is_driveable() {
        // The trait has to stay object-safe -- `Policy` is used as `dyn Policy`
        // by `PolicyKind::build`, and a sibling that quietly was not would only
        // be discovered by whoever first reached for the box.
        let scenario = duel_in_sight();
        let config = RunConfig {
            max_ticks: Some(30),
            ..RunConfig::default()
        };
        let boxed: Box<dyn ArticulatedPolicy> = Box::new(NeutralArticulatedPolicy);
        let result = run_articulated(&scenario, 12, boxed, &config);
        assert_eq!(result.rejected, 0);
        assert_eq!(result.ticks, 30);
    }
}
