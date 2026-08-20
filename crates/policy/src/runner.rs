use crate::Policy;
use fx::{Fx, Vec2};
use sim::{
    CommandReject, EntityId, Event, Faction, Order, Outcome, Replay, Scenario,
    SubmitOutcome, SubmittedCommand, World,
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
    /// Submissions the world did not take as offered.
    ///
    /// A range failure or a grip against equipment that is not there stores the
    /// **neutral** command instead of the one the policy offered, and a stale
    /// identity or a scenario of the other grammar stores nothing at all --
    /// though of those last two only the grammar refusal is reachable from this
    /// harness, because every handle it submits came out of
    /// [`World::pending_decisions`] on the same tick. Both are counted here,
    /// because both mean the run that happened
    /// is not the run the policy asked for, and a harness that swallowed the
    /// difference would leave a policy bug looking like a policy that does not
    /// work very well.
    ///
    /// **It was zero by construction under the legacy `run`**, whose entry was
    /// infallible and silently ignored a stale handle, and that is why this is a
    /// counter beside a reason rather than a `Result` on the loop: a run where
    /// every single command was thrown away and a run by a policy that is not
    /// very good are the same run from the outside.
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

/// **Two sibling loops stood here and both are gone.**
///
/// The legacy loop this file was written around was called `run` -- the name the
/// surviving loop below has since reclaimed, which is worth saying once so a
/// reader of this paragraph does not read it as being about the function it sits
/// on. It was eleven lines and drove the legacy policy trait over the legacy
/// observation. `run_articulated` was this function with three substitutions: a different observation, a different
/// submission entry and a different command variant in the replay. They were
/// siblings rather than branches inside one loop on purpose, and the argument
/// survives them because it is what says the next model gets its own loop: a
/// `match` on the combat model inside the hot decision loop would put every one
/// of those differences behind one branch on the thing that must not move.
///
/// Three claims went with the legacy one. Reproducibility from a seed and exact
/// replay are asserted for the surviving model in
/// `crates/sim/tests/determinism.rs`, which is the better home for them anyway
/// -- they are properties of the simulator, not of a runner. The third, that a
/// policy instance can be reused across rollouts without one leaking into the
/// next, was unasserted for a long time and is not any more:
/// `an_embodied_policy_instance_can_be_reused_without_leaking_between_runs`
/// drives a policy that *tires* as it decides, because a policy whose `decide`
/// is a pure function of its argument answers identically whether or not the
/// runner cleared it -- which is how deleting the `policy.reset()` line below
/// once kept every test in this crate green.
///
/// The legacy loop also took `doing_something_beats_doing_nothing`, the
/// control-condition claim that a policy which acts beats one that does not. The
/// embodied corpus reports win rates and could carry that claim; it does not
/// carry it today.

/// Drives an embodied scenario to a conclusion. **The loop**, singular, since
/// session 05.
///
/// **The difference that mattered between it and its deleted twins was never
/// visible to the type checker, and that is why the assertion below is shaped
/// the way it is.** [`World::submit`] compiled against any world and
/// answered [`CommandReject::WrongModel`] when the scenario's grammar disagreed
/// -- the refusal was a runtime value, not a compile error. So a harness wired
/// to the wrong entry built, ran its whole clock, refused every submission and
/// exited zero, with a recording of two bodies standing still. Nothing about
/// that shape looks broken from the outside, which is why
/// `an_embodied_run_stores_every_command_it_decides` asserts a *stored* command
/// per decision rather than the absence of a rejection: zero rejections is a
/// claim a loop that submitted nothing also satisfies.
///
/// **One grammar is left, so no scenario can disagree with this entry any
/// more.** The assertion stays as it is: what it rules out is a loop that
/// stopped submitting, and that needs no second grammar to happen.
///
/// **What gets recorded is what the world *stored*, not what the policy
/// offered.** [`SubmitOutcome::Stored`] may carry a command that is not
/// the one it was handed -- a range failure or a grip against equipment that is
/// not there stores the neutral command atomically and reports the reason
/// alongside it. The v2 contract is that replays persist final submitted
/// commands, and [`Replay::play`] feeds them straight back through this same
/// entry, so recording the *offered* command would re-run the same rejection at
/// playback and, the day validation changes by a raw unit, reproduce a different
/// fight from the one it claims to. Record the stored command and playback is
/// exact whatever validation later decides;
/// `a_refused_submission_is_recorded_as_what_the_world_stored` reads what was
/// written down rather than resting on replay equality, which would pass either
/// way.
///
/// **The event counters stay at zero.** The articulated arm of [`World::step`]
/// -- which is the arm this model shares -- emits exactly one [`Event`] variant,
/// [`Event::Death`]. Blows, blocks, parries and shots were legacy
/// swing-resolution events; damage here travels as contact resolution rows. The
/// arms below are spelled out anyway rather than collapsed into a wildcard, on
/// the argument the deleted loops' were: the next variant has to be thought
/// about here.
///
/// **The outcome gate is live, and it is not a dressed-up `for tick in
/// 0..max_ticks`.** Bodies do die -- `reap_dead_bodies` clears `alive` and
/// pushes the death -- so [`World::outcome`] is reachable, and
/// `an_embodied_run_stops_on_a_death_and_not_only_on_the_clock` proves it by
/// thinning an anatomy until the reaper fires rather than by waiting for the
/// game to be balanced. The second gate carries the shipped fixture, which is
/// why [`World::timeout`] scoring on points matters here rather than being the
/// rare case.
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

    // Set and recorded exactly as the two deleted loops did, and inert for
    // exactly the same reason: an embodied body perceives no order, and a replay
    // that recorded only the inputs somebody currently reads would stop
    // reproducing its run the day one of them grows a standing order.
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
            let command = policy.decide(&world.observe(id));
            decisions += 1;
            let (stored, rejection) = match world.submit(id, command) {
                SubmitOutcome::Stored { command, rejection } => (Some(command), rejection),
                // The same two reasons the articulated arm can carry, and the
                // same one of them is reachable from here: `pending_decisions`
                // is rebuilt from the alive set and nothing between it and the
                // submission kills anybody, so `StaleEntity` cannot arrive and
                // `WrongModel` is what an articulated fixture answers.
                SubmitOutcome::NotStored(reason) => (None, Some(reason)),
            };
            if let Some(reason) = rejection {
                rejected += 1;
                first_rejection.get_or_insert(reason);
            }
            if let (Some(replay), Some(stored)) = (replay.as_mut(), stored) {
                replay.record_submitted(world.tick(), id, SubmittedCommand::Embodied(stored));
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
        into_torso_frame, neutral_world_command, neutral_command,
        NeutralPolicy, ScriptedPolicy,
    };
    use sim::{Observation, CommandField, CommandV1, Intent};

    /// The shipped embodied fixture with the two bodies moved inside each
    /// other's sight.
    ///
    /// `Scenario::embodied_duel` spawns them 10.8 units apart and the Fighter's
    /// sight range is 9.6, so at the shipped placement neither observation ever
    /// contains an opponent -- and no policy on this seam has a standing order
    /// to walk along while it searches, because the observation deliberately has
    /// no order column. Every test below is about the seam and not about search,
    /// so they start in contact range.
    fn duel_in_sight() -> Scenario {
        let mut scenario = Scenario::embodied_duel();
        scenario.units[0].spawn = Vec2::from_ints(10, 8);
        scenario.units[1].spawn = Vec2::from_ints(14, 8);
        scenario
    }

    /// Walks at the nearest opponent and swings at it with both arms.
    ///
    /// A bad fighter and not trying to be a good one: it is the smallest thing
    /// that makes a fight actually *finish*, which is what these tests need out
    /// of it, and every column it reads comes out of the observation it was
    /// handed.
    ///
    /// **It builds a world-frame command and converts once**, through
    /// [`into_torso_frame`], rather than writing torso-relative bearings by
    /// hand. An embodied arm bearing is measured from the torso, so a fixture
    /// that wrote `delta.angle()` straight into `arms[i].bearing` would swing at
    /// the opponent plus the body's own yaw -- and would still compile, still
    /// submit legally and still produce a fight, which is exactly the shape this
    /// session's `cargo check` rule warns about. One conversion, in the one
    /// place the sign lives.
    fn advance_and_strike(obs: &Observation) -> CommandV1 {
        let mut command = neutral_world_command(obs);
        let Some(nearest) = obs.opponents().first() else {
            return into_torso_frame(obs, command);
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
        into_torso_frame(obs, command)
    }

    /// Keeps every observation it was shown and every command it answered with,
    /// and tires over the run it is answering.
    ///
    /// **The tiring is what makes `reset` observable, and it is here because
    /// nothing else in this file could see it.** A policy whose `decide` is a
    /// pure function of its argument answers identically whether or not the
    /// runner cleared it, so every fixture being pure left the harness's
    /// `policy.reset()` covered by nothing: deleting the line kept all 102
    /// policy tests green, including the one named for the property. So this
    /// policy carries state that accumulates across decisions *and* changes what
    /// it answers with, and the leak becomes a different state hash rather than
    /// an invisible one.
    #[derive(Default)]
    struct Recorder {
        seen: Vec<Observation>,
        issued: Vec<CommandV1>,
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

    impl Policy for Recorder {
        fn decide(&mut self, obs: &Observation) -> CommandV1 {
            let mut command = advance_and_strike(obs);
            for arm in command.core.arms.iter_mut() {
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
    fn an_embodied_policy_has_no_world_parameter() {
        // The *type-level* half of this claim belongs to the `compile_fail`
        // doctest on `Policy`, which is the only thing that can show no
        // policy can reach the world. What a unit test can show is the
        // consequence: decisions are a function of the observation sequence
        // alone. So drive one policy through the runner, prove it was shown
        // exactly what `World::observe` answers at each decision
        // point, and then reproduce every command from that recording with no
        // world in the room at all.
        let scenario = duel_in_sight();
        let config = RunConfig {
            max_ticks: Some(180),
            ..RunConfig::default()
        };

        let mut recorder = Recorder::default();
        let result = run(&scenario, 31, &mut recorder, &config);
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
        let mut expected: Vec<Observation> = Vec::new();
        let mut next = 0usize;
        while world.outcome().is_none() && world.tick() < 180 {
            for id in world.pending_decisions().to_vec() {
                expected.push(world.observe(id));
                let _ = world.submit(id, recorder.issued[next]);
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
        let replayed: Vec<CommandV1> =
            recorder.seen.iter().map(|obs| offline.decide(obs)).collect();
        assert_eq!(
            replayed.iter().map(|c| c.payload_bytes()).collect::<Vec<_>>(),
            recorder.issued.iter().map(|c| c.payload_bytes()).collect::<Vec<_>>(),
        );
    }

    #[test]
    fn an_embodied_run_is_reproducible() {
        let scenario = duel_in_sight();
        let config = RunConfig::default();
        let a = run(&scenario, 17, Recorder::default(), &config);
        let b = run(&scenario, 17, Recorder::default(), &config);
        assert_eq!(a.state_hash, b.state_hash);
        assert_eq!(a.ticks, b.ticks);
        assert_eq!(a.outcome, b.outcome);
    }

    #[test]
    fn a_recorded_embodied_run_replays_exactly() {
        let scenario = duel_in_sight();
        let config = RunConfig {
            record: true,
            ..RunConfig::default()
        };
        let result = run(&scenario, 21, Recorder::default(), &config);
        let replay = result.replay.as_ref().expect("recording was requested");
        assert!(!replay.submitted_entries.is_empty(), "the recorder wrote nothing");
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
            seen: Vec<Observation>,
        }
        impl Policy for Overreacher {
            fn decide(&mut self, obs: &Observation) -> CommandV1 {
                self.seen.push(*obs);
                let mut command = advance_and_strike(obs);
                command.core.arms[0].reach = Fx::from_raw(Fx::ONE.raw() + 1);
                command
            }
        }

        let scenario = duel_in_sight();
        let config = RunConfig {
            max_ticks: Some(60),
            record: true,
            ..RunConfig::default()
        };
        let honest = run(&scenario, 44, Recorder::default(), &config);
        let mut policy = Overreacher::default();
        let result = run(&scenario, 44, &mut policy, &config);

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
            // Irrefutable since session 05 left one variant, and deliberately
            // written as a pattern rather than a field access: appending a
            // second grammar breaks this line, which is where somebody has to
            // decide what an embodied harness does when it meets one. The
            // `panic!` that stood here said the same thing at run time and could
            // no longer fire.
            let SubmittedCommand::Embodied(recorded) = record.command;
            // Note what this deliberately does *not* rest on. Replay equality
            // would pass either way today: playback runs the same validator, so
            // recording the offered command would have it refused a second time
            // and substituted again. The contract is that a replay persists
            // final *submitted* commands, and the only way to check that is to
            // read what was written down.
            //
            // **`neutral_command` and not `neutral_world_command`,
            // and the difference is one column.** The world substitutes an arm
            // bearing of `Angle::ZERO`, because an embodied bearing is measured
            // from the torso and zero is "straight ahead" there; the articulated
            // neutral writes the body's yaw, which in this frame would mean a
            // whole turn off the centre line.
            assert_eq!(recorded.payload_bytes(), neutral_command(shown).payload_bytes());
            assert!(recorded.core.arms[0].reach <= Fx::ONE);
        }
        let played = replay.play();
        assert_eq!(played.state_hash(), result.state_hash);
    }

    // **`a_wrong_model_submission_is_counted_and_never_recorded` stood here and
    // was deleted rather than reseated in session 05, on its own instruction.**
    // It covered the other rejection shape -- `NotStored`, where nothing is
    // stored at all, so there is nothing for a replay to carry and a harness
    // that recorded a row would hand playback a submission the run never made.
    // Reaching that arm took a scenario of the *other* grammar, and there is no
    // second grammar left: `StaleEntity` is the arm's only other reason and is
    // unreachable from this loop, because `World::pending_decisions` is rebuilt
    // from the alive set and nothing between it and `submit` kills
    // anybody. So the test did not become untested, it became vacuous, and a
    // reseat onto the surviving fixture would have been a green assertion about
    // a refusal no world can now produce -- the exact shape `AGENTS.md` calls
    // the worst defect this repository makes.
    //
    // What replaces it is structural: the harness can no longer be pointed at a
    // world that refuses it. What is *not* replaced is the `NotStored` arm's
    // own behaviour, which `run` still spells out rather than
    // collapsing into a wildcard, for the reason the event counters are spelled
    // out above -- the next reason that arm can carry has to be thought about
    // here.

    #[test]
    fn an_embodied_run_stops_on_a_death_and_not_only_on_the_clock() {
        // The loop gates on `World::outcome`, and that gate is only worth
        // having if the world can reach one. It can: contact wounds an anatomy,
        // `settle_anatomy` bleeds it, `reap_dead_bodies` clears `alive`,
        // and the outcome falls out of the alive counts. Without this the loop
        // would be a `for tick in 0..max_ticks` wearing a `while`.
        //
        // **The monster is made of paper on purpose.** Shrinking the anatomy
        // until the reaper fires is the honest way to test the loop; waiting for
        // the game to be balanced is not, and a fixture that ended on its own
        // for reasons of its own would stop being a test about the reaper the
        // next time the damage model moved.
        let mut scenario = duel_in_sight();
        let table = scenario.combat_specs.as_mut().expect("the embodied fixture has specs");
        let brute = table.anatomies.iter_mut().find(|row| row.id == 2).expect("the brute anatomy");
        brute.integrity_maxima = [Fx::from_ratio(1, 32); 5];
        brute.blood_max = Fx::from_ratio(1, 32);

        let config = RunConfig::default();
        let result = run(&scenario, 9, Recorder::default(), &config);
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
    fn an_embodied_run_that_outlives_the_clock_is_scored_on_points() {
        // `World::timeout` compares health fractions, and `health_fraction`
        // routes through the anatomy -- so the second gate is a real answer
        // rather than a shrug. The cap is deliberately before the first natural
        // body decision, so reaching it proves this was the clock's answer
        // rather than a coincident outcome, and the number is bounded from both
        // sides rather than shaved. From above: with the cap removed this
        // fixture ends on tick 1,468 at seed 9 in the default build, measured
        // 2026-08-19 by deleting the `config.max_ticks` line and watching this
        // assertion report it. Past that the outcome stops being `Decision` and
        // this is no longer a test about the clock. From below: the health
        // comparison is deciding a tie until the two fractions have separated,
        // which the third assertion states rather than assumes.
        //
        // Only the default build, deliberately -- `crates/policy` has no
        // `cartesian-recoil` feature of its own and is not in the exact-law
        // command, so there is no second number to bracket here.
        let scenario = duel_in_sight();
        let config = RunConfig {
            max_ticks: Some(90),
            ..RunConfig::default()
        };
        let result = run(&scenario, 9, Recorder::default(), &config);
        assert_eq!(result.ticks, 90);
        assert!(
            matches!(result.outcome, Outcome::Decision(_)),
            "the clock was not what ended this run: {:?}", result.outcome
        );
        assert_ne!(result.hero_health, result.monster_health, "the points are a tie");
    }

    #[test]
    fn an_embodied_policy_instance_can_be_reused_without_leaking_between_runs() {
        // `Recorder` tires as it decides, so the third run is only the first
        // run again if `run` cleared the instance it was handed.
        // Without that, the fatigue two runs deep is saturated where a fresh
        // instance's is zero, the commands differ from the first decision, and
        // both assertions below fail rather than passing on a policy that could
        // not tell the difference.
        let scenario = duel_in_sight();
        let config = RunConfig::default();
        let mut policy = Recorder::default();
        let first = run(&scenario, 5, &mut policy, &config);
        let _ = run(&scenario, 6, &mut policy, &config);
        let again = run(&scenario, 5, &mut policy, &config);
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
    fn a_boxed_embodied_policy_is_driveable() {
        // The trait has to stay object-safe -- it is used as
        // `dyn Policy` by `PolicyKind::build`, and a seam that
        // quietly was not would only be discovered by whoever first reached for
        // the box.
        let scenario = duel_in_sight();
        let config = RunConfig {
            max_ticks: Some(30),
            ..RunConfig::default()
        };
        let boxed: Box<dyn Policy> = Box::new(NeutralPolicy);
        let result = run(&scenario, 12, boxed, &config);
        assert_eq!(result.rejected, 0);
        assert_eq!(result.ticks, 30);
    }

    /// **The run has to have happened**, and on this seam that is a separate
    /// claim from "it finished".
    ///
    /// [`World::submit`] compiles against any world and answers
    /// `NotStored(WrongModel)` when the scenario disagrees. A loop wired to the
    /// wrong entry therefore runs its clock out and exits clean, having stored
    /// nothing -- so `rejected == 0` is satisfied by a loop that submitted
    /// nothing, and `ticks == 240` by a loop that decided nothing. Neither is
    /// evidence on its own and both were the shape this session had to be able
    /// to catch.
    ///
    /// What cannot be faked by an empty run is the last pair: a stored command
    /// written down for every decision, and a state hash that is not the
    /// control condition's. `NeutralPolicy` is a body standing still, so
    /// a `run` that stored nothing would land on exactly its hash.
    #[test]
    fn an_embodied_run_stores_every_command_it_decides() {
        let scenario = Scenario::embodied_duel();
        let config = RunConfig {
            max_ticks: Some(240),
            record: true,
            ..RunConfig::default()
        };
        let result = run(&scenario, 19, ScriptedPolicy::default(), &config);

        assert_eq!(result.ticks, 240, "the run did not last the clock it was given");
        assert_eq!(result.rejected, 0);
        assert_eq!(result.first_rejection, None);
        assert!(result.decisions > 0, "nobody was ever asked to decide");

        // Every decision reached the world's command vector, and reached it
        // under the embodied tag: an `Articulated` record here would be a replay
        // that plays back through the other entry and is refused by model.
        let replay = result.replay.as_ref().expect("recording was requested");
        assert_eq!(replay.submitted_entries.len(), result.decisions as usize);
        for record in &replay.submitted_entries {
            assert!(
                matches!(record.command, SubmittedCommand::Embodied(_)),
                "an embodied run recorded a command under the wrong grammar",
            );
        }

        let idle = run(&scenario, 19, NeutralPolicy, &config);
        assert_ne!(
            result.state_hash, idle.state_hash,
            "the scripted run reached the state two bodies standing still reach",
        );
    }
}
