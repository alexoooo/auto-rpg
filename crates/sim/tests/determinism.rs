//! The guarantee this whole project is built around.
//!
//! If any of these fail, the browser build and the experiment lab are no
//! longer running the same game, and every recorded run we own is suspect.
//!
//! The policy used here is deliberately trivial and defined inline: these
//! tests pin the *simulation*, not the behaviour crate.
//!
//! **Everything here was written twice.** The file opened with a legacy half --
//! a `greedy` policy over the legacy `Observation`, `Scenario::skirmish` and
//! `Scenario::duel`, and `GOLDEN_STATE_HASH` over the first of those -- and an
//! embodied half beneath it. Session 10 deleted the model the first half drove.
//! It did not delete the first half's *claims*: outbound-channel order, seed
//! sensitivity, thread independence, that the fixture is a fight rather than two
//! statues, and a pinned state hash owned by `crates/sim` itself were all ported
//! onto embodied fixtures first, in the commit before the deletion, precisely so
//! that this one could be a deletion rather than a loss.
//!
//! One claim was **not** ported and is not replaced:
//! `player_orders_change_the_outcome_without_breaking_determinism`. An embodied
//! body cannot perceive a standing order -- `ArticulatedObservation` has no order
//! column and no navigation column -- so the property is not true of the
//! surviving model rather than merely untested. The argument is below, where the
//! ported tests are.

use fx::{Fx, Vec2};
use sim::{Event, Faction, Replay, Scenario, World};


/// The embodied model is subject to the same contract as the other two, and the
/// cheapest way to say so is to run it through the same three questions: does a
/// run repeat, does its replay reproduce it, and does it reproduce at every
/// intermediate tick rather than only at the end.
///
/// It lives here rather than beside the model because this file is where the
/// determinism contract is asserted, and a third model that is *not* asserted
/// here would be a third model nobody had checked.
///
/// **It answers more than three questions now**, and the section halfway down
/// says why: the legacy half of this file asserts several properties of the
/// *simulator* that were only ever written against the model it is about to
/// lose, so they are asserted here too -- outbound-channel order, seed
/// sensitivity, thread independence, that the fixture is a fight at all, and a
/// pinned state hash of its own.
mod embodied {
    use super::*;
    use sim::{
        ArmTarget, ArticulatedCommandV1, CombatHeight, ContactResolution, EmbodiedCommandV1,
        EntityId, GripRequest, Intent, ReleaseRequest, SubmittedCommand,
    };
    use fx::Angle;

    const TICKS: u32 = 300;

    /// Varies with the tick and the slot so the fight is not a pair of statues,
    /// and is a pure function of both so two runs cannot diverge by accident.
    fn scripted(tick: u32, slot: usize) -> ArticulatedCommandV1 {
        let phase = tick.wrapping_mul(1_013).wrapping_add(slot as u32 * 17);
        let arm = |k: u32| ArmTarget {
            bearing: Angle::from_raw(phase.wrapping_mul(7).wrapping_add(k * 4_099) as u16),
            height: CombatHeight::try_from_raw((phase.wrapping_add(k) % 65_537) as i32).unwrap(),
            reach: Fx::from_raw((phase.wrapping_mul(5).wrapping_add(k) % 65_537) as i32),
            effort: Fx::ONE,
        };
        ArticulatedCommandV1 {
            move_dir: Vec2::new(
                Fx::from_raw((phase % 46_341) as i32 - 23_170),
                Fx::from_raw((phase.wrapping_mul(3) % 46_341) as i32 - 23_170),
            ),
            body_yaw: Angle::from_raw(phase.wrapping_mul(11) as u16),
            intent: Intent::Hold,
            arms: [arm(0), arm(1)],
            grips: [GripRequest::Keep; 2],
            releases: [ReleaseRequest::Keep; 2],
        }
    }

    fn drive(record: Option<&mut Replay>) -> (World, Vec<u64>) {
        drive_on(&Scenario::embodied_duel(), record)
    }

    fn drive_on(scenario: &Scenario, record: Option<&mut Replay>) -> (World, Vec<u64>) {
        let mut world = World::new(scenario, 31);
        let ids: Vec<_> = world
            .alive_ids(Faction::Heroes)
            .into_iter()
            .chain(world.alive_ids(Faction::Monsters))
            .collect();
        let mut replay = record;
        let mut digests = Vec::with_capacity(TICKS as usize);
        for tick in 0..TICKS {
            for (slot, id) in ids.iter().enumerate() {
                let mut command = EmbodiedCommandV1::new(scripted(tick, slot));
                // The embodied-only field, driven like everything else here: a
                // script that left it neutral would replay a column the live
                // run never moved, which is a replay claim about nothing.
                let phase = tick.wrapping_mul(1_013).wrapping_add(slot as u32 * 17);
                command.swing_plane = [
                    Angle::from_raw(phase.wrapping_mul(13) as u16),
                    Angle::from_raw(phase.wrapping_mul(29).wrapping_add(7_919) as u16),
                ];
                if let Some(replay) = replay.as_deref_mut() {
                    replay.record_submitted(tick, *id, SubmittedCommand::Embodied(command));
                }
                world.submit_embodied_v1(*id, command);
            }
            world.step();
            digests.push(world.state_digest().value);
        }
        (world, digests)
    }

    #[test]
    fn an_embodied_run_repeats_itself_exactly() {
        let (left, left_digests) = drive(None);
        let (right, right_digests) = drive(None);
        assert_eq!(left_digests, right_digests);
        assert_eq!(left.state_digest().value, right.state_digest().value);
        // Not a pair of statues: a run whose digest never moved would satisfy
        // every assertion above without simulating anything.
        assert!(left_digests.windows(2).any(|pair| pair[0] != pair[1]));
    }

    #[test]
    fn an_embodied_replay_reproduces_its_run_at_every_intermediate_tick() {
        let scenario = Scenario::embodied_duel();
        let mut replay = Replay::new(&scenario, 31);
        let (live, digests) = drive(Some(&mut replay));
        replay.finish(TICKS);

        assert_eq!(replay.play().state_digest().value, live.state_digest().value);
        for tick in 1..=TICKS {
            assert_eq!(
                replay.play_until(tick).state_digest().value,
                digests[tick as usize - 1],
                "an embodied replay diverged at tick {tick}",
            );
        }
    }

    /// **The first fixture with a floor that is not flat, through the whole
    /// run/re-run/replay claim.**
    ///
    /// Session 04 gave every tile a height and every body a `ground_z` sampled
    /// from it, and until this fixture existed nothing in the repository had a
    /// non-zero one: `Dungeon::digest` short-circuits on `sculpted`, so the
    /// height vector was outside every golden hash and outside every replay.
    /// That is what made adding elevation free, and it is also what left the
    /// column unmeasured. A height that reached the state hash on the live run
    /// and not on the replayed one would have been invisible until a fight was
    /// driven up a hill.
    ///
    /// The script is the flat fixture's, unchanged, so the difference between
    /// this test and its sibling is the floor and nothing else.
    #[test]
    fn an_embodied_replay_reproduces_a_run_on_a_sculpted_floor() {
        let scenario = Scenario::embodied_slope();
        let mut replay = Replay::new(&scenario, 31);
        let (live, digests) = drive_on(&scenario, Some(&mut replay));
        replay.finish(TICKS);

        assert_eq!(replay.play().state_digest().value, live.state_digest().value);
        for tick in 1..=TICKS {
            assert_eq!(
                replay.play_until(tick).state_digest().value,
                digests[tick as usize - 1],
                "a sculpted embodied replay diverged at tick {tick}",
            );
        }
        // And it is a different fight from the flat one, which is the assertion
        // that stops this from passing on a hill nobody walked on: two runs of
        // the same script over the same seed, differing only in the floor.
        let (flat, _) = drive(None);
        assert_ne!(live.state_digest().value, flat.state_digest().value,
                   "the hill changed nothing, so the floor is not reaching the state");
    }

    /// A body on the hill stands above a body on the floor, and the height it
    /// stands at is the tile's own.
    ///
    /// The pair matters. "Somebody's `z` moved" would pass on a body that had
    /// wandered onto a terrace by accident; "the `z` is the floor under it" is
    /// what says the sample is the terrain rather than a number of its own.
    #[test]
    fn a_body_on_the_hill_stands_on_the_hill() {
        let scenario = Scenario::embodied_slope();
        let mut world = World::new(&scenario, 31);
        let id = world.alive_ids(Faction::Heroes)[0];
        // Walked, not teleported: the body has to reach the terrace through the
        // movement phase, which is the only thing that resamples `ground_z`.
        let mut highest = Fx::ZERO;
        for tick in 0..TICKS {
            let mut command = EmbodiedCommandV1::new(scripted(tick, 0));
            // Straight across the hill, in the body frame, at full authority.
            // Everything else the script does is left alone.
            command.articulated.move_dir = Vec2::new(Fx::ONE, Fx::ZERO);
            command.articulated.body_yaw = Angle::ZERO;
            world.submit_embodied_v1(id, command);
            world.step();
            let pose = world.articulated_pose(id).expect("a live hero has a pose");
            // **Every tick, not just the last.** The body walks over the hill
            // and off the far side, so a final reading would be a reading from
            // the floor again -- which is exactly the shape of test that would
            // have passed while the sample was broken.
            assert_eq!(
                pose.body.z,
                scenario.dungeon.height_at(fx::Vec2::new(pose.body.x, pose.body.y)),
                "at tick {tick} the body's z is not the floor under it",
            );
            highest = highest.max(pose.body.z);
        }
        assert!(highest > Fx::ZERO, "the body never left the floor");
    }

    /// The domain is part of the answer. An embodied digest compared against an
    /// articulated one is a grammar mismatch, not two numbers that differ.
    #[test]
    fn an_embodied_digest_reports_its_own_domain() {
        let (world, _) = drive(None);
        assert_eq!(world.state_digest().domain, sim::HashDomain::EmbodiedV1);
        assert_eq!(world.state_digest().schema, 1);
    }

    // ---------------------------------------------------------------------
    // **The properties the legacy half of this file asserts, on the model that
    // outlives it.**
    //
    // Everything above this line is a claim about reproduction: the same script
    // twice, and its replay. The legacy half asserts four more things that are
    // properties of the *simulator* rather than of the model they happen to be
    // written against -- event order, seed sensitivity, thread independence, and
    // that the fixture is a fight at all -- and it carries `GOLDEN_STATE_HASH`,
    // which is what makes a fight checkable from inside `crates/sim` with the
    // lab absent. They are ported here before that half
    // is deleted, because a property nobody ported is a property nobody is
    // checking, and nothing goes red on the day it stops being true.
    //
    // **One of the legacy properties did not survive the port, and its absence
    // is a finding rather than an omission.**
    // `player_orders_change_the_outcome_without_breaking_determinism` cannot be
    // written for this model. An order reaches a legacy agent through
    // `Observation::order`, and the embodied percept is
    // `ArticulatedObservation`, which has no order column and no nav column.
    //
    // **The next sentence used to say that the one phase reading `World::orders`
    // at all is `refresh_nav`, in the epilogue every model shares, whose
    // distance field is read only by `World::nav_step` and thence by
    // `World::observe` -- a legacy-grammar read an embodied driver never takes.
    // That is superseded: there is no such phase.** The chain it describes was
    // dead at both ends, so the session after this one deleted the flow field
    // outright, along with `refresh_nav`, the `nav` columns and the epilogue
    // row. Nothing whatever reads `World::orders` now. The measurement below is
    // unaffected -- it was already measuring a channel with no reader, and
    // removing the writer that fed no reader cannot change what it found.
    // Setting an order on an embodied world *does* move its digest,
    // because the orders array is hashed as an input -- and that is the whole of
    // what it does. Measured over 300 ticks of the script above under `Hold`,
    // `Advance`, `Regroup` and `Goto`, with and without `Objective::Order`,
    // every body finished at the same position to the raw unit, with the same
    // per-region integrity, the same open wounds and the same health -- while
    // all six of those runs' digests differed. A test built on the digest alone
    // would pass, and would be asserting an input word while claiming to assert
    // an outcome, which is exactly the green-test failure this repository's
    // house style exists to refuse. So the property dies with the model, and the
    // day somebody gives an embodied body an order column is the day it can come
    // back.

    /// The tick bound of the fights below.
    ///
    /// A parameter of the loop and **not** an edited `Scenario::max_ticks`, for
    /// `EMBODIED_CORPUS_TICKS`'s reason: `max_ticks` is inside
    /// `Scenario::fingerprint`, so shortening the scenario would produce a
    /// fixture that is not `embodied-slope-v1` and the pin below would be naming
    /// something else. 600 is that constant's number too, and it is generous
    /// here: the flat fixture resolves on tick 369 and the sculpted one on 322,
    /// so the bound is a ceiling that a working simulator never reaches rather
    /// than a length these runs are cut to.
    const FIGHT_TICKS: u32 = 600;

    /// Half the swing, in raw angle units, and the period it reverses on.
    ///
    /// 6,144 of a 65,536-unit turn is 33.75 degrees either side of the torso
    /// line. Both numbers came out of a sweep over periods 4..32 and half-swings
    /// 6,144..16,384 at both `CombatHeight::MID` and `HIGH` on both fixtures,
    /// and this cell was taken for one measured reason: **of the cells where
    /// both fixtures resolve, it is the one that puts the most contact behind
    /// its kill on the worse of the two** -- 293 contact resolutions on the flat
    /// fixture and 242 on the sculpted one, against 113 for the next best cell
    /// and fewer than twenty for several of them. A script that reached a kill
    /// through one lucky blow would satisfy every assertion below while
    /// exercising almost none of the contact phase.
    ///
    /// A wider swing is not a better one: past about 45 degrees the arm spends
    /// the swing turning rather than in front of the body, and the sweep's
    /// 16,384-unit cells fall as low as three resolutions in 600 ticks.
    const SWING_RAW: i32 = 6_144;
    const SWING_PERIOD: u32 = 6;

    /// A command that closes and cuts, which [`scripted`] deliberately does not.
    ///
    /// **`scripted` never reaches the contact phase, and that is measured
    /// rather than suspected**: 300 ticks of it produces exactly zero contact
    /// resolutions on all four embodied fixtures. It drives every column of the
    /// grammar to a pseudo-random value, which is precisely what a *replay*
    /// claim wants and is not a fight -- so every assertion in this module above
    /// this line is an assertion about locomotion, the actuator and the codec,
    /// and until this script existed nothing in `crates/sim` had ever driven an
    /// embodied body into a blow.
    ///
    /// Both directions here are read in the torso frame -- that is what
    /// `CombatModel::Embodied` means by `CommandFrame::Torso` -- so forward is
    /// `(1, 0)` at every yaw and the arms swing about the body's own line.
    /// `heading` therefore only has to reach `body_yaw`, which is world space
    /// under both frames.
    fn closing(tick: u32, heading: Vec2) -> EmbodiedCommandV1 {
        let side = if (tick / SWING_PERIOD) % 2 == 0 { SWING_RAW } else { -SWING_RAW };
        let arm = ArmTarget {
            bearing: Angle::from_raw(side as u16),
            // High rather than mid, and the sweep is what chose it: at this
            // period a mid-height swing produces *more* contact and no kill --
            // 918 resolutions in 900 ticks with both bodies still standing --
            // which is a fight of glancing blows rather than a fight.
            height: CombatHeight::HIGH,
            reach: Fx::ONE,
            effort: Fx::ONE,
        };
        EmbodiedCommandV1::new(ArticulatedCommandV1 {
            move_dir: Vec2::new(Fx::ONE, Fx::ZERO),
            body_yaw: heading.angle(),
            // `Intent` is a statement about who is being fought for the renderer
            // and the fitness function to read; it does not cause damage, so
            // naming a target here would change nothing the contact phase does.
            intent: Intent::Hold,
            arms: [arm, arm],
            grips: [GripRequest::Keep; 2],
            releases: [ReleaseRequest::Keep; 2],
        })
    }

    /// Where a body's heading comes from, and the **only** difference between
    /// the two fights below.
    #[derive(Clone, Copy, PartialEq, Eq, Debug)]
    enum Aim {
        /// Ground truth, read off the world. Nothing this script reads is
        /// seed-dependent, which is what makes the pinned digest below a number
        /// about the simulator rather than about the noise stream.
        Truth,
        /// Through `World::observe_articulated`, which is where perception noise
        /// enters and is the only seed-dependent input the embodied model has.
        ///
        /// It needs a fallback and the fallback is the point: the two spawns are
        /// 10.77 units apart and the fixture's sight range is 9.6, so neither
        /// body can see the other on tick 0 and a script that waited would be
        /// two statues. Out of sight it walks at the middle of the arena --
        /// which is what the legacy fixture policy at the top of this file does,
        /// and for the same reason it gives.
        Perceived,
    }

    /// A closing fight, kept with the two per-tick channels no digest can see.
    struct Fight {
        world: World,
        /// Every tick's event slice, in order.
        events: Vec<Vec<Event>>,
        /// Every tick's contact rows, in order.
        contacts: Vec<Vec<ContactResolution>>,
    }

    impl Fight {
        fn rows(&self) -> usize {
            self.contacts.iter().map(Vec::len).sum()
        }

        /// Where each body ended and what was left of it.
        ///
        /// This, and not the digest, is what "a different fight" means. See
        /// [`a_different_seed_produces_a_different_embodied_fight`] for why the
        /// distinction is load-bearing rather than fussy.
        fn bodies(&self) -> Vec<i32> {
            let mut out: Vec<i32> = self
                .world
                .articulated_poses()
                .flat_map(|pose| [pose.body.x.raw(), pose.body.y.raw(), pose.body.z.raw()])
                .collect();
            for faction in [Faction::Heroes, Faction::Monsters] {
                out.push(self.world.health_fraction(faction).raw());
                out.push(self.world.alive_count(faction) as i32);
            }
            out
        }
    }

    /// The heading `id` walks and faces this tick, or `None` for a body with
    /// nothing to walk at.
    fn heading(world: &World, id: EntityId, live: &[EntityId], slot: usize, aim: Aim)
        -> Option<Vec2>
    {
        match aim {
            Aim::Truth => {
                let me = world.view(id)?.position;
                // The other body. An embodied fixture is a duel, so "the other"
                // is unambiguous and a nearest-of search would be the same
                // answer through more code.
                let (_, &other) = live.iter().enumerate().find(|(at, _)| *at != slot)?;
                Some(world.view(other)?.position - me)
            }
            Aim::Perceived => {
                let obs = world.observe_articulated(id);
                let me = Vec2::new(obs.body_position.x, obs.body_position.y);
                if obs.opponent_count == 0 {
                    let arena = world.arena();
                    return Some(Vec2::new(arena.x / 2, arena.y / 2) - me);
                }
                // Nearest first, and already blurred by
                // `Stats::perception_noise` -- which is the entire mechanism
                // this arm exists to put under the seed.
                let seen = obs.opponents[0].body_position;
                Some(Vec2::new(seen.x - me.x, seen.y - me.y))
            }
        }
    }

    /// Runs a closing fight to its outcome or to [`FIGHT_TICKS`].
    ///
    /// Shaped like the legacy [`run`] above -- stop on an outcome, or on the
    /// bound -- so that the same two assertions can be made about it: that it
    /// resolves, and that the digest at the tick it resolved on is a fixed
    /// number.
    fn fight_on(scenario: &Scenario, seed: u64, aim: Aim) -> Fight {
        let mut world = World::new(scenario, seed);
        let mut events = Vec::new();
        let mut contacts = Vec::new();
        let mut live = Vec::new();
        while world.outcome().is_none() && world.tick() < FIGHT_TICKS {
            live.clear();
            live.extend(world.alive_ids(Faction::Heroes));
            live.extend(world.alive_ids(Faction::Monsters));
            let tick = world.tick();
            for slot in 0..live.len() {
                let id = live[slot];
                let Some(to) = heading(&world, id, &live, slot, aim) else { continue };
                world.submit_embodied_v1(id, closing(tick, to));
            }
            // `to_vec` before the contact rows are asked for, because both are
            // borrows of the world: the same reason `run_events` is a second
            // function rather than a fourth return from `run`.
            events.push(world.step().to_vec());
            contacts.push(world.contact_resolutions().to_vec());
        }
        Fight { world, events, contacts }
    }

    /// **The contact feed is this model's channel that no pin can see**, which
    /// is the claim `the_same_run_reports_the_same_events_in_the_same_order`
    /// makes about `World::events` on the legacy model.
    ///
    /// That claim does not port as it stands, because the feed does not. Every
    /// `Damage`, `Block`, `Parry` and `Shove` in the repository is pushed from
    /// `world/legacy.rs` and none of them survives the model; an embodied tick
    /// emits `Death` from `reap_dead_articulated` and `Loose` from the bow path,
    /// and `CombatSpecTableV1::fixtures()` has no bow in it. So an embodied
    /// event feed is empty until somebody dies, and a test that compared two of
    /// them would be comparing empty vectors -- green, and about nothing.
    ///
    /// `World::contact_resolutions` carries the argument instead, and carries it
    /// more sharply than the events ever did. `state_digest` writes exactly one
    /// contact byte, the global `cap_hits` count, so the group ordinal, the
    /// fact, the impulse, the energy ledger and the four channel words of every
    /// row are outside every pin in this repository -- including the one below.
    /// A row that arrived on the wrong tick, in the wrong order, or with an
    /// impulse that rounds differently on another thread is invisible to
    /// everything else in this file.
    ///
    /// The event feed is compared alongside it rather than instead of it: it is
    /// free, this fixture does reach one `Death`, and the day an embodied fight
    /// can loose an arrow the assertion is already here.
    #[test]
    fn an_embodied_fight_reports_the_same_contacts_and_events_in_the_same_order() {
        let scenario = Scenario::embodied_duel();
        let a = fight_on(&scenario, 31, Aim::Truth);
        let b = fight_on(&scenario, 31, Aim::Truth);
        assert_eq!(a.contacts.len(), b.contacts.len(), "the two fights were different lengths");
        assert_eq!(a.events.len(), b.events.len(), "the two event feeds were different lengths");
        for (tick, (x, y)) in a.contacts.iter().zip(&b.contacts).enumerate() {
            assert_eq!(x, y, "the contact feeds diverged at tick {tick}");
        }
        for (tick, (x, y)) in a.events.iter().zip(&b.events).enumerate() {
            assert_eq!(x, y, "the event feeds diverged at tick {tick}");
        }

        println!("{} contact rows over {} ticks", a.rows(), a.contacts.len());
        // Guards the comparison from going vacuous the way two empty feeds
        // would: the script above exists to make these two numbers non-zero,
        // and `scripted` leaves both at zero on every embodied fixture.
        assert!(a.rows() > 0, "a closing fight reached its end with no contact at all");
        assert!(
            a.events.iter().flatten().any(|e| matches!(e, Event::Death { .. })),
            "nobody died, so the one event an embodied tick can emit went untested"
        );

        // And across threads, which costs one scope and says something stronger:
        // a thread-local, a global RNG or a wall clock reaching the contact
        // solver would show up here and in no other test in this file.
        std::thread::scope(|scope| {
            let handles: Vec<_> = (0..8)
                .map(|_| {
                    let scenario = &scenario;
                    scope.spawn(move || {
                        let fight = fight_on(scenario, 31, Aim::Truth);
                        (fight.contacts, fight.events)
                    })
                })
                .collect();
            for handle in handles {
                let (contacts, events) = handle.join().unwrap();
                assert_eq!(contacts, a.contacts, "one thread saw a different fight");
                assert_eq!(events, a.events, "one thread saw different events");
            }
        });
    }

    /// Guards everything above from becoming vacuous, which is what
    /// `a_run_actually_resolves_rather_than_timing_out` does for the legacy
    /// half.
    ///
    /// It is worth more here than it is there, because an embodied fixture does
    /// **not** resolve on its own: the corpus behind `EMBODIED_CORPUS_DIGEST`
    /// reaches its clock in over nine trials in ten, and `scripted` above runs
    /// 300 ticks without one contact resolution. Two bodies that never touch
    /// satisfy every reproduction claim in this module, so this is the one test
    /// that says the model can produce a fight at all rather than a pair of
    /// bodies moving.
    #[test]
    fn an_embodied_fight_actually_resolves_rather_than_timing_out() {
        let fight = fight_on(&Scenario::embodied_duel(), 31, Aim::Truth);
        assert!(
            fight.world.outcome().is_some(),
            "never resolved: {} ticks of a {FIGHT_TICKS} bound, {} heroes and {} monsters up",
            fight.world.tick(),
            fight.world.alive_count(Faction::Heroes),
            fight.world.alive_count(Faction::Monsters),
        );
        assert!(fight.world.tick() > 30, "resolved suspiciously fast");
        // Resolved *through the contact phase*, and not by a body walking into
        // something. Both halves are needed: an outcome with no contact behind
        // it would be a fight the contact solver never took part in.
        //
        // Bounded at zero rather than at the measured count on purpose, because
        // the count is not one number: this fight reaches its kill through 293
        // resolutions in the default build and through **8** under
        // `cartesian-recoil`, where an exchange carries far more of the body
        // with it. A threshold tight enough to be interesting in one build is a
        // false failure in the other, and the richness of the script is argued
        // where it belongs -- on `SWING_RAW`, from the sweep that chose it.
        assert!(fight.rows() > 0, "the kill came from somewhere other than the contact phase");
        println!("{} contact rows behind a kill on tick {}", fight.rows(), fight.world.tick());
    }

    /// Eight threads, one answer -- the cheap guard
    /// `results_do_not_depend_on_the_thread_that_computed_them` makes for the
    /// legacy model, on the model that outlives it.
    ///
    /// On the sculpted fixture rather than the flat one, because the terrain
    /// sample is the newest thing in the tick and the one most recently written:
    /// `ground_z` is read per body per movement phase, and a height that arrived
    /// from a shared buffer instead of from the floor would show up here first.
    #[test]
    fn an_embodied_result_does_not_depend_on_the_thread_that_computed_it() {
        let scenario = Scenario::embodied_slope();
        let expected = fight_on(&scenario, 31, Aim::Truth).world.state_digest().value;
        std::thread::scope(|scope| {
            let handles: Vec<_> = (0..8)
                .map(|_| {
                    let scenario = &scenario;
                    scope.spawn(move || {
                        fight_on(scenario, 31, Aim::Truth).world.state_digest().value
                    })
                })
                .collect();
            for handle in handles {
                assert_eq!(handle.join().unwrap(), expected);
            }
        });
    }

    /// **A determinism suite that only proved runs repeat would pass on a
    /// simulator that ignored its seed entirely**, which is why the legacy half
    /// asserts this and why it has to be ported rather than dropped.
    ///
    /// It cannot be ported as written, and the reason is worth recording rather
    /// than working around. `a_different_seed_produces_a_different_history`
    /// compares two state hashes, and `legacy_core_hash` writes `self.seed` as
    /// its **first word** -- so two runs under two seeds fingerprint differently
    /// whether or not the seed reached a single decision. That test is satisfied
    /// by the seed word alone; it has been green since it was written and would
    /// stay green on a simulator that dropped the seed on the floor immediately
    /// after hashing it. The same is true of `state_digest`, so repeating the
    /// shape here would repeat the defect.
    ///
    /// So compare the bodies instead: where they stood at the end and what was
    /// left of them. And drive them through `Aim::Perceived`, because perception
    /// noise is the *only* seed-dependent input the embodied model has -- a
    /// ground-truth script is blind to the seed by construction, and this
    /// assertion over one would be false rather than vacuous.
    ///
    /// The same seed twice is asserted alongside, so that a difference between
    /// two seeds cannot be read as noise in the harness.
    #[test]
    fn a_different_seed_produces_a_different_embodied_fight() {
        let scenario = Scenario::embodied_duel();
        let one = fight_on(&scenario, 1, Aim::Perceived).bodies();
        let two = fight_on(&scenario, 2, Aim::Perceived).bodies();
        let again = fight_on(&scenario, 1, Aim::Perceived).bodies();
        assert_eq!(one, again, "the same seed produced two different fights");
        assert_ne!(one, two, "the seed reached nothing: two seeds, one fight");
    }

    /// Recorded on x86-64 Windows, rustc 1.97.1, over
    /// `Scenario::embodied_slope` (`0xf49de9a61f939163`) at seed 31, driven by
    /// [`closing`] through [`Aim::Truth`] to its outcome or [`FIGHT_TICKS`].
    ///
    /// **The embodied half of what `GOLDEN_STATE_HASH` is for**, and it exists
    /// for the same one-line reason: `crates/sim` must be checkable without the
    /// lab. `EMBODIED_CORPUS_DIGEST` folds a corpus, needs a policy crate to
    /// produce it and lives in `crates/lab`; this is one fight, one number, and
    /// `cargo test -p sim` is the whole of what runs it.
    ///
    /// The **sculpted** fixture and not the flat control, because a flat floor
    /// is invisible to a state hash by construction: `Dungeon::digest`
    /// short-circuits unless `sculpted`, which is exactly why adding elevation
    /// to the engine moved no golden hash in the repository. A pin taken on
    /// `embodied-duel-v1` could not see the height column at all, and this one
    /// folds a fight that climbs a terrace and fights on it.
    ///
    /// Re-record it -- if the change that moved it was a deliberate change to
    /// embodied mechanics, terrain or this script, and stated in writing
    /// first -- with
    ///
    /// ```text
    /// cargo test -p sim --test determinism -- --nocapture the_pinned_embodied_fight
    /// ```
    ///
    /// **Two values, selected by feature, and the second is not merely the
    /// first through a wider hash.** `cartesian-recoil` does write extra bytes
    /// into the stream -- `post_contact_hash_bytes` per arm per allocated slot
    /// -- but it also changes the fight: measured, this one resolves on tick 322
    /// as a `HeroesWin` through 242 contact resolutions by default, and on tick
    /// 183 as a `MonstersWin` through 8 of them under the feature. So the two
    /// numbers are two fights as well as two grammars, which is worth stating
    /// because `EMBODIED_CORPUS_DIGEST`'s row calls its own pair "the same
    /// fights" and, on this fixture at least, that is not what the feature does.
    ///
    /// The arrangement is `EMBODIED_CORPUS_DIGEST`'s and is deliberately not a
    /// `cfg` that skips the assertion: session 09 shipped one constant, measured
    /// only the default build, and left `--features cartesian-recoil` red from
    /// the day it was written -- which is worse than no pin at all, because a
    /// gate that is red for a reason nobody intended teaches the next reader to
    /// skip it.
    ///
    /// **Both values moved once, on the day the legacy columns were deleted,
    /// and the move is a grammar move rather than a fight move.**
    /// `World::articulated_state_digest` folds `legacy_core_hash` into every
    /// digest it produces, and that function lost `hp`, `max_hp`, the submitted
    /// `command` word and the whole nine-column projectile block, so every
    /// embodied digest in the repository moved by construction. What says the
    /// fight did not is that everything else this test prints is unchanged: the
    /// default build still resolves on tick 322 as a `HeroesWin` through 242
    /// contact resolutions and the feature build on tick 183 as a `MonstersWin`
    /// through 8, and `deleting_the_legacy_columns_left_the_wounds_where_they_were`
    /// below holds the per-region integrity and wound fractions recorded before
    /// the deletion without one of its numbers being edited. Previously
    /// `0x5527190dea6be0c2` by default and `0x81e51e499a5d01fd` under the
    /// feature.
    #[cfg(not(feature = "cartesian-recoil"))]
    const EMBODIED_GOLDEN_DIGEST: u64 = 0x49d4_12eb_6102_0365;

    /// The same fight under the wider hash stream; see above.
    #[cfg(feature = "cartesian-recoil")]
    const EMBODIED_GOLDEN_DIGEST: u64 = 0xc8a7_45fd_f389_7645;

    /// The wounds the legacy columns would have shadowed, recorded **before**
    /// they were deleted.
    ///
    /// Five pins moved in the session that deleted `hp`, `max_hp`,
    /// `World::command`, the projectile columns and `Replay::entries` from the
    /// state stream -- every pin taken over `World::state_digest`, because
    /// `articulated_state_digest` folds `legacy_core_hash` -- and a re-recorded
    /// hash proves nothing on its own: it is a new number agreeing with itself.
    /// This is the claim the re-record cannot carry: that the *fight* is where
    /// it was. Per-region integrity and wound fractions are exactly
    /// the quantities the deleted health columns shadowed, so if `hp` had been
    /// feeding anything, these are what would move.
    ///
    /// Recorded on x86-64 Windows, rustc 1.97.1, over `Scenario::embodied_duel`
    /// at seed 31 driven by [`closing`] through [`Aim::Perceived`] for 600
    /// ticks, on the commit before the deletion. Re-record only alongside a
    /// deliberate change to embodied mechanics, and never to make this test
    /// agree with a deletion.
    ///
    /// **Two constants, selected by feature, and the second was recorded the
    /// same way and for the same reason.** `cartesian-recoil` is a different
    /// contact solver, so this fixture resolves before tick 600 under it and
    /// only one body is left to read -- which made a single twenty-value
    /// constant fail the feature build from the day it was written, the exact
    /// shape of red gate `EMBODIED_CORPUS_DIGEST`'s row records session 09
    /// shipping. Both arrays were measured on the commit *before* the deletion,
    /// the feature one by injecting this test into a worktree at that commit,
    /// and both are unchanged after it. That makes the exact-law build a second
    /// independent witness that the fight did not move rather than a build with
    /// no witness at all.
    #[test]
    fn deleting_the_legacy_columns_left_the_wounds_where_they_were() {
        // Fighter integrity, Fighter wounds, Brute integrity, Brute wounds --
        // five regions each, in `BodyPart` order. The Brute's torso is down to
        // 44416/65536 and its left arm to 30688, which is what makes this a
        // fixture that could report a change rather than a pair of untouched
        // bodies.
        #[cfg(not(feature = "cartesian-recoil"))]
        const WOUNDS: [i32; 20] = [
            65536, 65536, 61504, 65536, 65536, 0, 0, 0, 0, 0,
            65536, 44416, 30688, 65536, 65536, 0, 6304, 34848, 0, 0,
        ];
        // The survivor's five regions and five wounds, under the other solver.
        // One body and not two: the loser is dead and off `alive_ids` by tick
        // 600, and a torso at 61600 with a wound of 96 is a body that was in a
        // fight rather than one that stood still.
        #[cfg(feature = "cartesian-recoil")]
        const WOUNDS: [i32; 10] = [65536, 61600, 65536, 65536, 65536, 0, 96, 0, 0, 0];
        let mut world = World::new(&Scenario::embodied_duel(), 31);
        let mut live = Vec::new();
        for _ in 0..600 {
            live.clear();
            live.extend(world.alive_ids(Faction::Heroes));
            live.extend(world.alive_ids(Faction::Monsters));
            let tick = world.tick();
            for slot in 0..live.len() {
                let id = live[slot];
                let Some(to) = heading(&world, id, &live, slot, Aim::Perceived) else { continue };
                world.submit_embodied_v1(id, closing(tick, to));
            }
            world.step();
        }
        let mut measured = Vec::new();
        for faction in [Faction::Heroes, Faction::Monsters] {
            for id in world.alive_ids(faction) {
                let obs = world.observe_articulated(id);
                measured.extend(obs.integrity_fraction.iter().map(|f| f.raw()));
                measured.extend(obs.wound_fraction.iter().map(|f| f.raw()));
            }
        }
        println!("wounds after 600 ticks: {measured:?}");
        assert_eq!(measured.len(), WOUNDS.len(), "the fixture stopped being two live bodies");
        assert_eq!(measured, WOUNDS.to_vec(), "the deleted columns were feeding the wounds");
    }

    #[test]
    fn the_pinned_embodied_fight_is_unchanged() {
        let fight = fight_on(&Scenario::embodied_slope(), 31, Aim::Truth);
        let digest = fight.world.state_digest();
        println!(
            "embodied golden digest: 0x{:016x} after {} ticks, {:?}, {} contact rows",
            digest.value,
            fight.world.tick(),
            fight.world.outcome(),
            fight.rows(),
        );
        if EMBODIED_GOLDEN_DIGEST == 0 {
            println!(
                "EMBODIED_GOLDEN_DIGEST is unset -- paste 0x{:016x} into \
                 crates/sim/tests/determinism.rs to lock it in.",
                digest.value,
            );
        } else {
            assert_eq!(
                digest.value, EMBODIED_GOLDEN_DIGEST,
                "the embodied fight changed; if intended, re-record EMBODIED_GOLDEN_DIGEST"
            );
        }
        // **A pin is a value in a domain, not a bare `u64`**, which is the half
        // of `legacy_state_hash_bytes_are_unchanged` that survives the model.
        // That test asserts the opposite of this one and is right to: on a
        // Legacy world `state_digest().value` *is* the legacy core hash, which
        // is what keeps every pre-v2 golden in this repository valid. On an
        // embodied world the two are different streams over the same state, and
        // the number above belongs to the embodied one. If they were ever equal,
        // this pin could be satisfied by a reading taken in the wrong grammar.
        assert_eq!(digest.domain, sim::HashDomain::EmbodiedV1);
        assert_eq!(digest.schema, 1);
        assert_ne!(
            fight.world.state_hash(),
            digest.value,
            "the embodied digest equals the legacy core hash: the domain prefix reached nothing"
        );
    }
}
