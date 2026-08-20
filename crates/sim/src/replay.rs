use crate::command::{Objective, Order, SubmittedCommand};
use crate::entity::{EntityId, Faction};
use crate::scenario::Scenario;
use crate::world::World;

/// One decision, as it was made.
///
/// There were two of these types and a `CommandRecord` beside this one carried
/// the legacy grammar. Nothing could write it once that grammar and `submit`
/// went, and it is gone with the vector that held it.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct SubmittedCommandRecord {
    pub tick: u32,
    pub entity: EntityId,
    pub command: SubmittedCommand,
}

/// One standing order, as the player gave it.
///
/// Orders are an input just as much as agent decisions are, and a replay that
/// records only half the inputs reproduces only half the run.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct OrderRecord {
    pub tick: u32,
    pub faction: Faction,
    pub order: Order,
}

/// One objective, as whoever was driving set it.
///
/// Here for the same reason [`OrderRecord`] is: an objective is an input, it
/// changes where every agent of that faction walks, and a replay that recorded
/// only half the inputs would reproduce only half the run.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct ObjectiveRecord {
    pub tick: u32,
    pub faction: Faction,
    pub objective: Objective,
}

/// A complete, replayable run.
///
/// # Why this records commands and not observations
///
/// The obvious design is to log the seed and re-run the policies. That works
/// right up until a policy is a neural network, and then it stops: a matrix
/// multiply reduced by a wasm SIMD kernel and one reduced by native AVX can
/// differ in the last bit, an `argmax` flips on a near-tie, and the replay
/// diverges from the run it claims to reproduce.
///
/// Recording the *decisions* sidesteps that entirely. Playback never runs
/// inference at all -- it feeds the sim exactly the commands the sim was fed the
/// first time. So the portability requirement lands only on [`World`], which is
/// pure fixed-point integer arithmetic and genuinely is bit-identical
/// everywhere. The policy is free to be as unportable as it likes.
///
/// The cost is size: one record per agent per decision rather than one seed.
/// At 30 agents deciding every 10 ticks that is ~180 records/second, or a few
/// hundred KB for a long fight before any compression. Cheap for what it buys.
#[derive(Clone, Debug)]
pub struct Replay {
    pub seed: u64,
    pub scenario: Scenario,
    /// [`Scenario::fingerprint`] at record time, so playback can detect that
    /// the scenario has been edited underneath it.
    pub scenario_fingerprint: u64,
    /// How many ticks the original run lasted. Playback stops here even if the
    /// last decisions came earlier.
    pub ticks: u32,
    /// Versioned submitted commands. There were two vectors here and a rule
    /// that exactly one of them was active for a persisted replay, selected by
    /// the scenario's combat model; the legacy one is gone, so what was a rule
    /// something had to enforce is now a fact about the only vector there is.
    pub submitted_entries: Vec<SubmittedCommandRecord>,
    /// Player orders, in the order they were issued.
    pub orders: Vec<OrderRecord>,
    /// Objectives, likewise. A separate list rather than a variant on
    /// `orders`, because the two are set independently and interleaving them
    /// would make the replay's playback order depend on the recorder's.
    pub objectives: Vec<ObjectiveRecord>,
}

impl Replay {
    pub fn new(scenario: &Scenario, seed: u64) -> Replay {
        Replay {
            seed,
            scenario: scenario.clone(),
            scenario_fingerprint: scenario.fingerprint(),
            ticks: 0,
            submitted_entries: Vec::new(),
            orders: Vec::new(),
            objectives: Vec::new(),
        }
    }

    pub fn record_submitted(&mut self, tick: u32, entity: EntityId, command: SubmittedCommand) {
        self.submitted_entries.push(SubmittedCommandRecord { tick, entity, command });
    }

    pub fn record_order(&mut self, tick: u32, faction: Faction, order: Order) {
        self.orders.push(OrderRecord {
            tick,
            faction,
            order,
        });
    }

    pub fn record_objective(&mut self, tick: u32, faction: Faction, objective: Objective) {
        self.objectives.push(ObjectiveRecord {
            tick,
            faction,
            objective,
        });
    }

    /// Marks how long the run lasted. Call once, when the run ends.
    pub fn finish(&mut self, ticks: u32) {
        self.ticks = ticks;
    }

    pub fn is_intact(&self) -> bool {
        self.scenario.fingerprint() == self.scenario_fingerprint
    }

    pub fn len(&self) -> usize {
        self.submitted_entries.len()
    }

    pub fn is_empty(&self) -> bool {
        self.submitted_entries.is_empty()
    }

    /// Re-runs the recorded decisions and returns the final world.
    ///
    /// No policy is consulted, so this is exact by construction as long as the
    /// sim itself is deterministic.
    pub fn play(&self) -> World {
        self.play_until(self.ticks)
    }

    pub fn play_until(&self, ticks: u32) -> World {
        self.play_until_with_arm_rates(
            ticks,
            crate::combat::actuator::ARM_BEARING_MAX_SPEED_RAW,
            crate::combat::actuator::ARM_BEARING_ACCEL_RAW,
        )
    }

    /// Playback for a fixture that froze words about one arm configuration.
    ///
    /// A replay reproduces a *recorded* run, so it has to be driven at the rate
    /// that run was driven at. The live half of such a fixture pins its rates
    /// through [`World::step_with_arm_rates`]; without the matching seam here
    /// the live and replayed halves would disagree the moment somebody tuned
    /// the actuator, and the fixture would report that as a replay divergence
    /// rather than as the actuator change it is.
    ///
    /// **Private, and with nothing past it any more.** *Nothing outside this
    /// crate records a run at anything but the production pair* was this
    /// comment's claim until 2026-08-15, when Lab froze strike fixtures that
    /// recorded a run and replayed it as their own check; an
    /// `ArmCalibration`-typed seam was opened here so pinning their live half
    /// alone could not make an actuator change arrive as "live and replay
    /// disagree", which is the one sentence a live-versus-replay comparison
    /// must never be able to say by accident. Those fixtures were deleted with
    /// the articulated model, so the claim is true again and the seam went with
    /// them. What did not change is why the rates travel as a named pair:
    /// `exact_diagnostics` and this file's own exact tests still record and
    /// replay at `exact_diagnostics::CAPTURED_ARM_RATES`, and a caller that
    /// names two loose integers instead has two chances to name a pair no live
    /// half used.
    pub(crate) fn play_until_with_arm_rates(
        &self, ticks: u32, bearing_max_speed_raw: i32, bearing_accel_raw: i32,
    ) -> World {
        let mut world = World::new(&self.scenario, self.seed);
        let mut next_submitted = 0;
        let mut next_order = 0;
        let mut next_objective = 0;

        loop {
            // Orders are applied before the tick check so that a replay stopped
            // at tick T still ends with the orders that were in force at T.
            while next_order < self.orders.len() && self.orders[next_order].tick <= world.tick() {
                let record = self.orders[next_order];
                world.set_order(record.faction, record.order);
                next_order += 1;
            }
            // And the objectives on the same rule, after the orders: an
            // `Objective::Order` routes toward whatever the standing order is,
            // so applying it first would route toward the previous one for a
            // tick.
            while next_objective < self.objectives.len()
                && self.objectives[next_objective].tick <= world.tick()
            {
                let record = self.objectives[next_objective];
                world.set_objective(record.faction, record.objective);
                next_objective += 1;
            }
            if world.tick() >= ticks {
                break;
            }
            // **The model guard that opened this loop is gone and the drain is
            // not.** It read `has_articulated_columns`, which answered `true`
            // for every model that could reach here and `false` only for the
            // Legacy scenarios that had no submitted stream at all; deleting the
            // predicate must not delete the loop, because this is where a replay
            // feeds the recorded commands back to the sim.
            while next_submitted < self.submitted_entries.len()
                && self.submitted_entries[next_submitted].tick <= world.tick()
            {
                let entry = self.submitted_entries[next_submitted];
                match entry.command {
                    SubmittedCommand::Embodied(command) => {
                        let _ = world.submit_embodied_v1(entry.entity, command);
                    }
                }
                next_submitted += 1;
            }
            world.step_with_arm_rates(bearing_max_speed_raw, bearing_accel_raw);
        }

        world
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        ArmTarget, CombatHeight, EmbodiedCommandV1, GripRequest, ReleaseRequest, Scenario,
        SubmitEmbodiedOutcome,
    };
    use fx::{Angle, Fx, Vec2};

    // **`playback_uses_only_the_model_selected_command_vector` is gone with the
    // second grammar it needed.** It put a record whose grammar the scenario's
    // model does not accept into a replay and asserted that playback skipped it
    // rather than coerced it. Keeping that subject through this step would have
    // meant reseating it the other way round -- an *articulated* record inside
    // an embodied replay -- which is a fixture building the retired grammar,
    // the one thing this step exists to stop doing. And it cannot be written at
    // all once `SubmittedCommand::Articulated` and `submit_articulated_v1`
    // follow the model out: with one grammar there is no record a world can
    // refuse, so the property is not untested but vacuous. The drain in
    // `play_until` it was written against is production code and outlives it,
    // with nothing left to select between. What survives of the claim -- that
    // playback feeds the sim the recorded commands and nothing beside them --
    // is `embodied_replays_reproduce_every_pose` below, over 180 ticks. Both
    // halves of that sentence have now happened: the variant and the submission
    // path went with the model, and the drain in `play_until` stayed.

    /// The shared six fields every fixture below drives, with the neutral swing
    /// plane supplied at the submission by [`EmbodiedCommandV1::new`].
    ///
    /// Kept in the inner grammar rather than the outer one because every caller
    /// edits a field of it before submitting, and none of them has an opinion
    /// about the plane: the neutral plane is the one the elbow hung in before
    /// the field existed, so the wrapper asks for exactly what these fixtures
    /// asked for when they were articulated.
    fn command() -> crate::ArticulatedCommandV1 {
        let arm = ArmTarget {
            bearing: Angle::ZERO,
            height: CombatHeight::MID,
            reach: Fx::ZERO,
            effort: Fx::ZERO,
        };
        crate::ArticulatedCommandV1 {
            move_dir: Vec2::ZERO,
            body_yaw: Angle::ZERO,
            intent: crate::Intent::Hold,
            arms: [arm; 2],
            grips: [GripRequest::Keep; 2],
            releases: [ReleaseRequest::Keep; 2],
        }
    }

    #[test]
    fn rejected_commands_record_only_the_final_safe_command() {
        let scenario = Scenario::embodied_duel();
        let mut world = World::new(&scenario, 1);
        let mut replay = Replay::new(&scenario, 1);
        let mut invalid = command();
        invalid.arms[0].reach = Fx::from_raw(Fx::ONE.raw() + 1);
        let requested = EmbodiedCommandV1::new(invalid);
        let returned = if let SubmitEmbodiedOutcome::Stored { command: stored, rejection: Some(_) } =
            world.submit_embodied_v1(EntityId::new(0, 0), requested)
        {
            assert_ne!(stored, requested);
            replay.record_submitted(0, EntityId::new(0, 0), SubmittedCommand::Embodied(stored));
            stored
        } else {
            panic!("invalid live request did not return its fallback");
        };
        if let SubmitEmbodiedOutcome::Stored { command: stored, .. } =
            world.submit_embodied_v1(EntityId::new(9, 0), EmbodiedCommandV1::new(command()))
        {
            replay.record_submitted(0, EntityId::new(9, 0), SubmittedCommand::Embodied(stored));
        }
        assert_eq!(replay.submitted_entries.len(), 1);
        assert_eq!(replay.submitted_entries[0].command, SubmittedCommand::Embodied(returned));
        assert_eq!(returned.articulated.body_yaw, Angle::ZERO);
        assert_eq!(returned.articulated.grips, [GripRequest::Keep; 2]);
        // The substitute parks the elbow where it was rather than swinging it to
        // a plane nobody asked for, which is the embodied half of the same
        // atomicity the six shared fields get.
        assert_eq!(returned.swing_plane, [Angle::ZERO; 2]);
        world.step();
        replay.finish(1);
        let played = replay.play();
        let fighter = EntityId::new(0, 0);
        assert_eq!(played.articulated_pose_test_view(fighter), world.articulated_pose_test_view(fighter));
        assert_eq!(played.state_digest().value, world.state_digest().value);
    }

    #[test]
    fn embodied_replays_reproduce_every_pose() {
        let scenario = Scenario::embodied_duel();
        let fighter = EntityId::new(0, 0);
        let brute = EntityId::new(1, 0);
        let mut world = World::new(&scenario, 1);
        let mut replay = Replay::new(&scenario, 1);
        let mut stored_count = 0usize;
        for tick in 0..180 {
            if tick % 15 == 0 {
                let phase = (tick / 15) % 4;
                let mut next = command();
                next.body_yaw = [Angle::ZERO, Angle::QUARTER, Angle::HALF, Angle::from_raw(49_152)][phase as usize];
                next.arms[0] = ArmTarget {
                    bearing: [Angle::ZERO, Angle::QUARTER, Angle::HALF, Angle::from_raw(49_152)][phase as usize],
                    height: [CombatHeight::MID, CombatHeight::HIGH, CombatHeight::LOW, CombatHeight::HIGH][phase as usize],
                    reach: [Fx::from_raw(16_384), Fx::ONE, Fx::HALF, Fx::ONE][phase as usize],
                    effort: [Fx::ZERO, Fx::ONE, Fx::HALF, Fx::ONE][phase as usize],
                };
                next.arms[1] = ArmTarget {
                    bearing: [Angle::HALF, Angle::ZERO, Angle::QUARTER, Angle::HALF][phase as usize],
                    height: [CombatHeight::HIGH, CombatHeight::MID, CombatHeight::HIGH, CombatHeight::LOW][phase as usize],
                    reach: [Fx::ONE, Fx::from_raw(16_384), Fx::ONE, Fx::HALF][phase as usize],
                    effort: [Fx::ONE, Fx::HALF, Fx::ONE, Fx::ONE][phase as usize],
                };
                next.grips = match phase {
                    1 => [GripRequest::Release, GripRequest::Keep],
                    2 => [GripRequest::EquipSlot(1), GripRequest::Keep],
                    _ => [GripRequest::Keep; 2],
                };
                // The plane is driven too, and asymmetrically. A fixture that
                // left it neutral would replay a column the live run never
                // moved, which is a replay claim about nothing -- and the
                // elbow is the whole of what an embodied arm has that an
                // articulated one did not.
                let mut requested = EmbodiedCommandV1::new(next);
                requested.swing_plane = [
                    Angle::from_raw((tick as u32).wrapping_mul(331) as u16),
                    Angle::from_raw((tick as u32).wrapping_mul(733).wrapping_add(4_099) as u16),
                ];
                let stored = match world.submit_embodied_v1(fighter, requested) {
                    SubmitEmbodiedOutcome::Stored { command, rejection: None } => command,
                    outcome => panic!("live embodied command was not stored: {outcome:?}"),
                };
                replay.record_submitted(tick, fighter, SubmittedCommand::Embodied(stored));
                stored_count += 1;
            }
            world.step();
            replay.finish(tick + 1);
            let played = replay.play_until(tick + 1);
            assert_eq!(played.state_digest().value, world.state_digest().value, "digest diverged at tick {}", tick + 1);
            assert_eq!(played.articulated_pose_test_view(fighter), world.articulated_pose_test_view(fighter),
                "fighter pose diverged at tick {}", tick + 1);
            assert_eq!(played.articulated_pose_test_view(brute), world.articulated_pose_test_view(brute),
                "brute pose diverged at tick {}", tick + 1);
        }
        // Twelve submissions that the world *stored*, not twelve it refused.
        // `submit_embodied_v1` against a world of the wrong grammar answers
        // `NotStored(WrongModel)` without panicking, so a reseat that missed
        // this fixture would reproduce a hundred and eighty ticks of two
        // statues and report it as replay fidelity.
        assert_eq!(stored_count, 12);
        assert_eq!(replay.submitted_entries.len(), 12);
    }

    /// The contract's own fixture, and the only proof that contact's writes are
    /// *state* rather than a report beside it. A solver that moved a pose
    /// without going through the recorded command stream would reproduce here
    /// only by accident, and would diverge on the tick after the accident.
    ///
    /// Deliberately not `Scenario::embodied_duel()` as it ships: that fixture
    /// spawns `(7,6)` and `(17,10)`, ten units apart and touching nothing, and
    /// its fingerprint `0x1a1e8e74eecd55d5` is pinned so the spawns cannot be
    /// moved in place. The pair below starts a unit and a half apart, which is
    /// inside the brute's club.
    #[test]
    fn contact_modified_pose_survives_replay_at_every_tick() {
        let mut scenario = Scenario::embodied_duel();
        scenario.units[0].spawn = Vec2::from_ints(10, 8);
        scenario.units[1].spawn = Vec2::new(Fx::from_ratio(23, 2), Fx::from_int(8));
        let fighter = EntityId::new(0, 0);
        let brute = EntityId::new(1, 0);
        let mut world = World::new(&scenario, 1000);
        let mut replay = Replay::new(&scenario, 1000);

        // **Effort is one, and the contract's `0` in that column was wrong.**
        // A zero-effort arm has zero acceleration, so it holds its spawn pose
        // for the whole run: the fighter never leaves the tucked quarter-reach
        // it starts at, and its blade stops 0.0003 units outside the brute's
        // capsule -- measured, and the closest this fixture ever came to a
        // fact. The rest of the row is unchanged, and a reaching arm is what
        // the proof was always about: a swing that lands, is stopped, and has
        // to replay bit for bit from the recorded command rather than from the
        // pose the solver happened to leave.
        //
        // **Every bearing below is a torso offset**, which is the frame the
        // surviving command grammar is read in. The
        // articulated fixture this was reseated from wrote world bearings, and
        // the transform is `torso = world - body_yaw`: the fighter faces east
        // at yaw zero so its column is unchanged, and the brute faces west at
        // yaw `HALF` so its `HALF` becomes `ZERO`. Left as `HALF` it would have
        // aimed the brute's arms *away* from the fighter, which is a different
        // fixture reporting the same test name.
        let tucked = Fx::from_ratio(1, 4);
        let arm = |bearing: Angle, reach: Fx, effort: Fx| ArmTarget {
            bearing, height: CombatHeight::MID, reach, effort,
        };
        let held = |yaw: Angle, arms: [ArmTarget; 2]| EmbodiedCommandV1::new(
            crate::ArticulatedCommandV1 {
                move_dir: Vec2::ZERO, body_yaw: yaw, intent: crate::Intent::Hold,
                arms, grips: [GripRequest::Keep; 2], releases: [ReleaseRequest::Keep; 2],
            });
        let orders = [
            (fighter, held(Angle::ZERO, [
                arm(Angle::ZERO, tucked, Fx::ZERO), arm(Angle::ZERO, Fx::ONE, Fx::ONE)])),
            (brute, held(Angle::HALF, [
                arm(Angle::ZERO, tucked, Fx::ONE), arm(Angle::ZERO, tucked, Fx::ONE)])),
        ];

        let mut weapon_body_rows = 0usize;
        for tick in 0..60 {
            for (id, requested) in orders {
                let stored = match world.submit_embodied_v1(id, requested) {
                    SubmitEmbodiedOutcome::Stored { command, rejection: None } => command,
                    outcome => panic!("live embodied command was not stored: {outcome:?}"),
                };
                replay.record_submitted(tick, id, SubmittedCommand::Embodied(stored));
            }
            world.step();
            weapon_body_rows += world.contact_resolutions().iter()
                .filter(|row| row.fact.key.kind == crate::combat::contact::ContactKind::WeaponBody)
                .count();

            replay.finish(tick + 1);
            let played = replay.play_until(tick + 1);
            assert_eq!(played.state_digest().value, world.state_digest().value,
                "digest diverged at tick {}", tick + 1);
            assert_eq!(played.articulated_pose_test_view(fighter), world.articulated_pose_test_view(fighter),
                "fighter pose diverged at tick {}", tick + 1);
            assert_eq!(played.articulated_pose_test_view(brute), world.articulated_pose_test_view(brute),
                "brute pose diverged at tick {}", tick + 1);
            assert_eq!(played.contact_resolutions(), world.contact_resolutions(),
                "resolutions diverged at tick {}", tick + 1);
            assert_eq!(played.contact_cap_hits(), world.contact_cap_hits(),
                "the cap counter diverged at tick {}", tick + 1);
        }
        println!("weapon/body contact rows over 60 ticks: {weapon_body_rows}");
        assert!(weapon_body_rows > 0, "the fixture never produced a weapon/body contact");
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn ordinary_exact_trajectory_crosses_a_wall_and_replays_every_authoritative_word() {
        assert_ne!(crate::exact_trajectory_state_digest(), 0);
    }

    #[cfg(feature = "cartesian-recoil")]
    #[test]
    fn exact_trajectory_live_rerun_and_replay_match_every_tick_and_breakpoint() {
        use crate::RecoilExternalEnergy;

        // The arm rates this transcript was captured at, pinned for the reason
        // `exact_diagnostics::CAPTURED_ARM_RATES` gives: the refusal tick
        // asserted at the bottom is the tick a swing of *this* speed first
        // refuses on, so reading the production ceiling here would re-aim a
        // frozen tick number every time somebody tuned the actuator. Doubling
        // the pair on 2026-08-15 moved it to 65, which is the same swing
        // arriving early and not a solver change.
        let rates = crate::exact_diagnostics::CAPTURED_ARM_RATES;

        // This is the captured chamber-to-strike command geometry, translated
        // to the south wall. The 2026-08-12 run measured two contact groups,
        // both exact remainder classes and a later ordinary release. Its body
        // response was only 0.0291 raw units/tick, so even at the legal wall
        // coordinate it did not cross the integer endpoint and cannot honestly
        // claim checkpoint E's wall/cap half before Smart38 strengthens the
        // response law.
        let mut config = crate::DuelConfigV1::shipped();
        let wall_side = Fx::from_ratio(45, 100);
        config.fighters[0].spawn = Vec2::new(Fx::from_int(10), wall_side);
        config.fighters[0].hands[1].as_mut().unwrap().geometry =
            crate::EquipmentGeometry::Segment {
                length: Fx::from_int(2), radius: Fx::from_ratio(1, 25),
            };
        config.fighters[1].spawn = Vec2::new(Fx::from_ratio(631, 50), wall_side);
        config.fighters[1].anatomy = crate::AnatomyChoice::Fighter;
        config.max_ticks = 100;
        let scenario = Scenario::duel_from(&config).unwrap();
        let fighter = EntityId::new(0, 0);
        let brute = EntityId::new(1, 0);
        let arm = |bearing: Angle, reach: Fx, effort: Fx| ArmTarget {
            bearing, height: CombatHeight::MID, reach, effort,
        };
        let held = |yaw: Angle, arms: [ArmTarget; 2], grips| EmbodiedCommandV1::new(
            crate::ArticulatedCommandV1 {
                move_dir: Vec2::ZERO, body_yaw: yaw, intent: crate::Intent::Hold, arms, grips,
                releases: [ReleaseRequest::Keep; 2],
            });
        let tucked = Fx::from_ratio(1, 4);
        // Torso offsets, transformed from the world bearings this transcript was
        // recorded in by subtracting each body's own yaw: the fighter holds yaw
        // zero throughout so its column is unchanged, and the brute's `HALF` at
        // yaw `HALF` is `ZERO`. The tick-48 bearing change is what the transcript
        // is about and it survives the transform intact.
        let command_at = |tick, id| if id == fighter {
            held(Angle::ZERO, [
                arm(Angle::ZERO, tucked, Fx::ZERO),
                arm(if tick < 48 { Angle::from_raw(49_152) } else { Angle::ZERO },
                    Fx::ONE, Fx::ONE),
            ], if tick == 95 {
                [GripRequest::Keep, GripRequest::Release]
            } else {
                [GripRequest::Keep; 2]
            })
        } else {
            held(Angle::HALF, [
                arm(Angle::ZERO, tucked, Fx::ONE),
                arm(Angle::ZERO, tucked, Fx::ONE),
            ], [GripRequest::Keep; 2])
        };

        let mut first = World::new(&scenario, 1000);
        let mut second = World::new(&scenario, 1000);
        let mut replay = Replay::new(&scenario, 1000);
        let mut groups = 0usize;
        let mut momentum_remainder = false;
        let mut position_remainder = false;
        let mut release = false;
        let mut first_exact_rejection = None;
        for tick in 0..100 {
            for id in [fighter, brute] {
                let requested = command_at(tick, id);
                let stored = match first.submit_embodied_v1(id, requested) {
                    SubmitEmbodiedOutcome::Stored { command, .. } => command,
                    outcome => panic!("live embodied command was not stored: {outcome:?}"),
                };
                let rerun = match second.submit_embodied_v1(id, requested) {
                    SubmitEmbodiedOutcome::Stored { command, .. } => command,
                    outcome => panic!("rerun embodied command was not stored: {outcome:?}"),
                };
                assert_eq!(rerun, stored, "stored command diverged at tick {tick}");
                replay.record_submitted(tick, id, SubmittedCommand::Embodied(stored));
            }
            first.step_with_arm_rates(rates.0, rates.1);
            second.step_with_arm_rates(rates.0, rates.1);
            if first_exact_rejection.is_none() {
                first_exact_rejection = first.first_exact_contact_rejection();
            }
            assert_eq!(second.first_exact_contact_rejection(),
                       first.first_exact_contact_rejection(),
                       "live rejection provenance diverged at tick {}", tick + 1);
            groups += first.contact_resolutions().iter()
                .map(|row| row.group_ordinal).max().map_or(0, |last| last as usize + 1);
            for id in [fighter, brute] {
                let (has_momentum, has_position) = first
                    .exact_trajectory_remainder_view(id).unwrap();
                momentum_remainder |= has_momentum;
                position_remainder |= has_position;
            }
            for row in first.exact_external_energy() {
                release |= row.reason == RecoilExternalEnergy::RELEASE;
            }
            assert_eq!((second.state_digest().domain, second.state_digest().schema,
                        second.state_digest().value),
                       (first.state_digest().domain, first.state_digest().schema,
                        first.state_digest().value),
                "live digest diverged at tick {}", tick + 1);
            assert_eq!(second.contact_resolutions(), first.contact_resolutions(),
                "live resolutions diverged at tick {}", tick + 1);
            assert_eq!(second.exact_external_energy(), first.exact_external_energy(),
                "live external ledger diverged at tick {}", tick + 1);
            for id in [fighter, brute] {
                assert_eq!(second.articulated_pose_test_view(id), first.articulated_pose_test_view(id),
                    "live pose or grips diverged at tick {}", tick + 1);
                assert_eq!(second.anatomy_test_view(id), first.anatomy_test_view(id),
                    "live anatomy diverged at tick {}", tick + 1);
            }

            replay.finish(tick + 1);
            let played = replay.play_until_with_arm_rates(tick + 1, rates.0, rates.1);
            assert_eq!((played.state_digest().domain, played.state_digest().schema,
                        played.state_digest().value),
                       (first.state_digest().domain, first.state_digest().schema,
                        first.state_digest().value),
                "replay digest diverged at tick {}", tick + 1);
            assert_eq!(played.contact_resolutions(), first.contact_resolutions(),
                "replay resolutions diverged at tick {}", tick + 1);
            assert_eq!(played.exact_external_energy(), first.exact_external_energy(),
                "replay external ledger diverged at tick {}", tick + 1);
            assert_eq!(played.first_exact_contact_rejection(),
                       first.first_exact_contact_rejection(),
                       "replay rejection provenance diverged at tick {}", tick + 1);
            for id in [fighter, brute] {
                assert_eq!(played.articulated_pose_test_view(id), first.articulated_pose_test_view(id),
                    "replay pose or grips diverged at tick {}", tick + 1);
                assert_eq!(played.anatomy_test_view(id), first.anatomy_test_view(id),
                    "replay anatomy diverged at tick {}", tick + 1);
            }
        }
        assert!(groups >= 1, "the fixture crossed no accepted contact group");
        assert_eq!(first.first_contact_rejection(), Some(crate::ResolutionError::ExactSolver),
                   "the lifted energy refusal stopped being public and payloadless");
        let diagnostic = first.first_exact_contact_rejection()
            .expect("the exact refusal had no feature-only provenance");
        assert_eq!(diagnostic.cause, crate::ResolutionError::ExactSolver);
        assert_eq!(diagnostic.phase, crate::ExactContactRejectPhase::SolveGroup);
        // **80 after the reseat as well as before it, and it was re-measured
        // rather than carried over.** This transcript was articulated until
        // session 05 and moved to `submit_embodied_v1` whole. The fight is not
        // the same fight -- the final state digest is `0x83eb2c1a6ecf49bb`
        // where the articulated run's was `0x6dfca6fed7c9ae7b`, which it must
        // be, since `articulated_state_digest` writes the model word and the
        // body now has elbows, two more swept volumes and a stance row. What
        // did not move is the breakpoint: the same tick, the same
        // `SolveGroup` phase, the same right-arm-into-body key, and one
        // accepted contact group either side. The transform that kept the
        // geometry is written above `command_at`. If a future edit moves 80,
        // that is a claim about this swing at these rates and wants a sentence
        // here, not a wider assertion: a range would be satisfied by a fixture
        // that stopped refusing for a different reason.
        assert_eq!(diagnostic.tick, 80);
        assert_eq!(diagnostic.key, Some((fighter, crate::LimbSlot::RightArm as u8,
                                        brute, crate::combat::contact::BODY_SLOT,
                                        crate::ContactKind::WeaponBody)));
        assert_eq!(Some(diagnostic), first_exact_rejection,
                   "a later refusal replaced the first diagnostic");
        assert!(momentum_remainder, "the fixture produced no exact momentum remainder");
        assert!(position_remainder, "the fixture produced no exact position remainder");
        assert!(release, "the ordinary release cleared no retained response");
    }

    #[test]
    fn equal_tick_submissions_replay_in_insertion_order_without_chaining_grips() {
        let scenario = Scenario::embodied_duel();
        let fighter = EntityId::new(0, 0);
        let mut world = World::new(&scenario, 1);
        let mut replay = Replay::new(&scenario, 1);
        let mut release = command();
        release.grips = [GripRequest::Release; 2];
        let mut keep_right = command();
        keep_right.grips = [GripRequest::Keep, GripRequest::EquipSlot(0)];
        for requested in [release, keep_right] {
            let stored = match world.submit_embodied_v1(fighter, EmbodiedCommandV1::new(requested)) {
                SubmitEmbodiedOutcome::Stored { command, rejection: None } => command,
                outcome => panic!("same-tick request unexpectedly rejected: {outcome:?}"),
            };
            replay.record_submitted(0, fighter, SubmittedCommand::Embodied(stored));
        }
        assert_eq!(replay.submitted_entries.len(), 2);
        assert_eq!(replay.submitted_entries[0].command,
            SubmittedCommand::Embodied(EmbodiedCommandV1::new(release)));
        assert_eq!(replay.submitted_entries[1].command,
            SubmittedCommand::Embodied(EmbodiedCommandV1::new(keep_right)));
        world.step();
        replay.finish(1);
        let played = replay.play();
        let expected = [
            crate::GripState { equipment_slot: Some(1) },
            crate::GripState { equipment_slot: Some(0) },
        ];
        assert_eq!(world.articulated_pose_test_view(fighter).unwrap().grips, expected,
            "the first pending release leaked into second-submission validation");
        assert_eq!(played.articulated_pose_test_view(fighter), world.articulated_pose_test_view(fighter));
        assert_eq!(played.state_digest().value, world.state_digest().value);
    }
}
