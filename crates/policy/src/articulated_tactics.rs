//! A region-targeted strike, planned from the policy observation alone.
//!
//! The planner deliberately predicts a *commanded* sweep rather than claiming
//! to reproduce the actuator. The observation does not publish joint scalars or
//! shoulder width, and reconstructing either from a hand would be a second,
//! subtly different actuator. A candidate translates the observed weapon by
//! the commanded hand displacement, then asks the same fixed-point swept
//! geometry the contact phase asks whether that capsule can cross the named
//! region. Execution remains feedback-controlled: measure closes until the
//! real hilt-to-region range fits the observed arm plus blade.
//!
//! **The planner this header describes now lives in `embodied_tactics.rs`**, with
//! its constants, its threat assessment and its four command builders. What is
//! left here is the three articulated policies that drive it and the source-41
//! schedule, which session 05 deletes with the model they belong to; until then
//! they reach back across for the pieces they still need.

use crate::embodied_tactics::{
    can_cover, evade_intent, CHAMBER_TICKS, COMMIT_TICKS, STRIKE_CHAMBER_REACH,
    STRIKE_COMMIT_REACH,
};
use crate::{
    neutral_articulated_command, ArmRoles, ArticulatedPolicy, PlanScoring, StrikeDiagnostics,
    StrikePlanner, TacticalIntentV1, EIGHTH_TURN, ROBUST_STRIKE_HEIGHT, ROBUST_STRIKE_TICKS,
};
use fx::{Fx, Vec2};
use sim::{
    ArmTarget, ArticulatedCommandV1, ArticulatedObservation, CombatHeight, EntityId, Intent,
    LimbSlot,
};

pub const TACTICAL_POLICY_CODE: u32 = 5;
pub const OPENINGS_POLICY_CODE: u32 = 6;

/// The source-41 schedule, with its bearing derived only from the declared
/// spawn offset. Lab supplies its bounded corpus values; the Arena preset uses
/// the frozen ordinal-3144 row. Neither route reads perception noise.
pub fn robust_strike_schedule_command(
    obs: &ArticulatedObservation, target: EntityId, limb: LimbSlot,
    declared_offset: Vec2, height: CombatHeight, tick: u32,
    chamber_ticks: u32, strike_reach: Fx, mirrored: bool,
) -> ArticulatedCommandV1 {
    let offset = if mirrored { Vec2::new(declared_offset.x, -declared_offset.y) }
        else { declared_offset };
    let bearing = (-offset).angle();
    let (chamber, strike) = if mirrored {
        (bearing + EIGHTH_TURN, bearing - EIGHTH_TURN)
    } else {
        (bearing - EIGHTH_TURN, bearing + EIGHTH_TURN)
    };
    let mut command = neutral_articulated_command(obs);
    if tick >= chamber_ticks + COMMIT_TICKS { return command; }
    command.intent = Intent::Attack(target);
    command.arms[limb as usize] = ArmTarget {
        bearing: if tick < chamber_ticks { chamber } else { strike },
        height,
        reach: if tick < chamber_ticks { STRIKE_CHAMBER_REACH } else { strike_reach },
        effort: Fx::ONE,
    };
    command
}

#[derive(Clone, Copy, Debug)]
pub struct TacticalArticulatedPolicy {
    planner: StrikePlanner,
    controlled: Option<ControlledRobustStrike>,
}

#[derive(Clone, Copy, Debug)]
struct ControlledRobustStrike {
    target: EntityId,
    tick: u32,
}

impl Default for TacticalArticulatedPolicy {
    fn default() -> Self { Self { planner: StrikePlanner::default(), controlled: None } }
}

impl TacticalArticulatedPolicy {
    pub fn controlled_robust_strike(target: EntityId) -> Self {
        Self { planner: StrikePlanner::default(),
            controlled: Some(ControlledRobustStrike { target, tick: 0 }) }
    }
    pub fn planner(&self) -> &StrikePlanner { &self.planner }
    pub fn diagnostics(&self) -> StrikeDiagnostics { self.planner.diagnostics() }

    fn choose(&self, obs: &ArticulatedObservation) -> TacticalIntentV1 {
        if let Some(threat) = self.planner.context().threat {
            let crossing = self.planner.threat_crossing
                .expect("a threat carries its predicted crossing");
            if can_cover(obs, threat, crossing) {
                TacticalIntentV1::Guard
            } else {
                evade_intent(obs, crossing)
            }
        } else if self.planner.context().opponent_recovering {
            TacticalIntentV1::StrikeWeaponArm
        } else {
            TacticalIntentV1::StrikeBest
        }
    }
}

impl ArticulatedPolicy for TacticalArticulatedPolicy {
    fn decide(&mut self, obs: &ArticulatedObservation) -> ArticulatedCommandV1 {
        if let Some(controlled) = &mut self.controlled {
            controlled.tick = obs.tick.min(ROBUST_STRIKE_TICKS);
            let command = robust_strike_schedule_command(obs, controlled.target,
                LimbSlot::RightArm, Vec2::new(Fx::from_raw(-163_840), Fx::from_raw(-65_536)),
                ROBUST_STRIKE_HEIGHT, controlled.tick, CHAMBER_TICKS,
                STRIKE_COMMIT_REACH, false);
            return command;
        }
        self.planner.observe(obs);
        let threat = self.planner.context().threat;
        let intent = self.choose(obs);
        let mut command = self.planner.decide_with_intent(obs, intent);
        if intent == TacticalIntentV1::Guard {
            if let Some(threat) = threat {
                command.arms[ArmRoles::of(obs).guard].height = threat.crossing_height;
            }
        }
        command
    }

    fn reset(&mut self) {
        self.planner.reset();
        if let Some(controlled) = &mut self.controlled { controlled.tick = 0; }
    }
}

/// A striker that aims where the guard is not.
///
/// Written for the Brute, and named for what it does rather than for who carries
/// it: nothing here reads an anatomy. It differs from
/// [`TacticalArticulatedPolicy`] in exactly two places, and both are answers to
/// measurements rather than preferences.
///
/// **It scores candidates by plate coverage first.** The tactical planner ranks
/// by nearest region centre and never reads `foe.shield`, while the plate
/// accounts for 22.28% of all resolutions on the two-handed corpus. Blocking is
/// purely geometric -- there is no block roll and no shield stat, only "was the
/// plate in the swept path" -- so a quarter-by-quarter plate leaves a different
/// hole at every guard height, and the hole is a thing a policy can aim at.
///
/// **It takes the whole body on a withdrawal, not the weapon arm.** Tactical
/// answers `opponent_recovering` with [`TacticalIntentV1::StrikeWeaponArm`],
/// which restricts the candidates to the two arm regions. During a withdrawal
/// the guard is out of position and the torso and head are reachable, so
/// narrowing to an arm spends the best opening in the fight on the smallest
/// target on the body.
///
/// Its footwork, phases, threat assessment and guard are the planner's unchanged.
/// This is a scoring policy, not a second controller, and the diff being two
/// decisions wide is what makes the corpus difference attributable to them.
#[derive(Clone, Copy, Debug)]
pub struct OpeningsArticulatedPolicy {
    planner: StrikePlanner,
}

impl Default for OpeningsArticulatedPolicy {
    fn default() -> Self {
        Self { planner: StrikePlanner::scoring(PlanScoring::UncoveredRegion) }
    }
}

impl OpeningsArticulatedPolicy {
    pub fn planner(&self) -> &StrikePlanner { &self.planner }
    pub fn diagnostics(&self) -> StrikeDiagnostics { self.planner.diagnostics() }

    fn choose(&self, obs: &ArticulatedObservation) -> TacticalIntentV1 {
        if let Some(threat) = self.planner.context().threat {
            let crossing = self.planner.threat_crossing
                .expect("a threat carries its predicted crossing");
            if can_cover(obs, threat, crossing) {
                TacticalIntentV1::Guard
            } else {
                evade_intent(obs, crossing)
            }
        } else {
            // `opponent_recovering` is deliberately *not* branched on. Tactical
            // narrows to the weapon arm here; this policy wants the same whole
            // body it always wants, and the withdrawal is already worth more to
            // it because a withdrawn guard is a plate that covers less -- which
            // its scoring reads directly rather than through a proxy intent.
            TacticalIntentV1::StrikeBest
        }
    }
}

impl ArticulatedPolicy for OpeningsArticulatedPolicy {
    fn decide(&mut self, obs: &ArticulatedObservation) -> ArticulatedCommandV1 {
        self.planner.observe(obs);
        let threat = self.planner.context().threat;
        let intent = self.choose(obs);
        let mut command = self.planner.decide_with_intent(obs, intent);
        if intent == TacticalIntentV1::Guard {
            if let Some(threat) = threat {
                command.arms[ArmRoles::of(obs).guard].height = threat.crossing_height;
            }
        }
        command
    }

    fn reset(&mut self) { self.planner.reset(); }
}

#[derive(Clone, Copy, Debug, Default)]
pub struct StrikerArticulatedPolicy {
    planner: StrikePlanner,
}

impl StrikerArticulatedPolicy {
    pub fn planner(&self) -> &StrikePlanner { &self.planner }
    pub fn diagnostics(&self) -> StrikeDiagnostics { self.planner.diagnostics() }
}

impl ArticulatedPolicy for StrikerArticulatedPolicy {
    fn decide(&mut self, obs: &ArticulatedObservation) -> ArticulatedCommandV1 {
        self.planner.decide(obs)
    }

    fn reset(&mut self) { self.planner.reset(); }
}

#[cfg(test)]
mod tests {
    // `close_duel`, `threat_pair` and `plated_at` are copies of the fixtures in
    // `embodied_tactics.rs`'s test module, which is where the planner's own
    // tests went in session 05. Two copies and not a shared one, because this
    // copy is deleted with this file: sharing would leave a `pub(crate)` test
    // helper behind for nobody.
    use super::*;
    use crate::embodied_tactics::{assess_threat, centre, weapon_is_withdrawing, PreviousOpponent};
    use crate::Footwork;
    use fx::Vec3;
    use sim::{BodyPart, CombatModel, DuelConfigV1, Faction, ObservedOpponent, Scenario,
              SegmentPose, SubmitArticulatedOutcome, World};

    fn close_duel() -> Scenario {
        let mut config = DuelConfigV1::shipped();
        config.fighters[0].spawn = Vec2::from_ints(10, 8);
        config.fighters[1].spawn = Vec2::from_ints(12, 8);
        let mut scenario = Scenario::duel_from(&config).unwrap();
        // ARTICULATED-FIXTURE-SHIM -- delete with the model.
        //
        // `duel_from` builds `CombatModel::Embodied` since v2-ui-08, and
        // `the_striker_submits_no_refused_commands` below submits world-frame
        // `ArticulatedCommandV1`s: without this line every one of them is
        // `NotStored(WrongModel)` and the test asserts nothing about a striker.
        // There is no embodied reseat to write, because the subject here **is**
        // the articulated model -- `StrikerArticulatedPolicy` implements
        // `ArticulatedPolicy` and this whole file goes when the enum does. The
        // agent that deletes `CombatModel::Articulated` deletes this file and
        // this line together; it must not flip the model to `Embodied` and keep
        // the test, because a striker that emits world bearings into a torso
        // frame is a different policy wearing the same name.
        scenario.combat_model = CombatModel::Articulated;
        scenario
    }

    fn threat_pair(step: Fx, lateral: Fx) -> (ArticulatedObservation, ArticulatedObservation) {
        let scenario = close_duel();
        let world = World::new(&scenario, 17);
        let attacker = world.alive_ids(Faction::Heroes)[0];
        let mut now = world.observe_articulated(attacker);
        let z = now.body_position.z + now.standing_height * Fx::HALF;
        let x = now.body_position.x + Fx::from_int(3);
        let segment = SegmentPose {
            hilt: Vec3::new(x, now.body_position.y + lateral - Fx::HALF, z),
            tip: Vec3::new(x, now.body_position.y + lateral + Fx::HALF, z),
            radius: Fx::from_ratio(1, 20),
        };
        now.tick = 11;
        now.opponents[0].body_position.y = now.body_position.y;
        now.opponents[0].weapons = [None, Some(segment)];
        let mut before = now;
        before.tick = 10;
        before.opponents[0].weapons[1] = Some(SegmentPose {
            hilt: segment.hilt + Vec3::new(step, Fx::ZERO, Fx::ZERO),
            tip: segment.tip + Vec3::new(step, Fx::ZERO, Fx::ZERO),
            radius: segment.radius,
        });
        (before, now)
    }

    #[test]
    fn robust_strike_preset_submits_twenty_eight_chamber_then_twenty_eight_strike_words() {
        let scenario = close_duel();
        let world = World::new(&scenario, 0);
        let attacker = world.alive_ids(Faction::Heroes)[0];
        let target = world.alive_ids(Faction::Monsters)[0];
        let obs = world.observe_articulated(attacker);
        let offset = Vec2::new(Fx::from_raw(-163_840), Fx::from_raw(-65_536));
        let chamber_bearing = (-offset).angle() - EIGHTH_TURN;
        let strike_bearing = (-offset).angle() + EIGHTH_TURN;
        let mut policy = TacticalArticulatedPolicy::controlled_robust_strike(target);

        for tick in 0..ROBUST_STRIKE_TICKS {
            let mut at = obs;
            at.tick = tick;
            let command = policy.decide(&at);
            assert_eq!(command.intent, Intent::Attack(target));
            assert_eq!(command.arms[LimbSlot::LeftArm as usize],
                       neutral_articulated_command(&obs).arms[LimbSlot::LeftArm as usize]);
            let arm = command.arms[LimbSlot::RightArm as usize];
            assert_eq!(arm.height, ROBUST_STRIKE_HEIGHT);
            assert_eq!(arm.effort.raw(), 65_536);
            assert_eq!(arm.bearing, if tick < 28 { chamber_bearing } else { strike_bearing });
            assert_eq!(arm.reach.raw(), if tick < 28 { 65_536 } else { 61_440 });
        }
        let mut after = obs;
        after.tick = ROBUST_STRIKE_TICKS;
        assert_eq!(policy.decide(&after), neutral_articulated_command(&after));
    }

    #[test]
    fn robust_strike_preset_targets_brute_legs_through_tactical_code_five() {
        assert_eq!(TACTICAL_POLICY_CODE, 5);
        assert_eq!(ROBUST_STRIKE_HEIGHT.raw(), 16_384);
        let scenario = close_duel();
        let world = World::new(&scenario, 0);
        let attacker = world.alive_ids(Faction::Heroes)[0];
        let target = world.alive_ids(Faction::Monsters)[0];
        let obs = world.observe_articulated(attacker);
        let mut policy = TacticalArticulatedPolicy::controlled_robust_strike(target);
        let command = policy.decide(&obs);
        assert_eq!(command.intent, Intent::Attack(target));
        assert_eq!(command.arms[LimbSlot::RightArm as usize].height,
                   CombatHeight::try_from_raw(16_384).unwrap());
    }

    #[test]
    fn recovery_is_attacked_instead_of_waiting_for_a_clock_phase() {
        let (_, mut now) = threat_pair(Fx::ONE, Fx::ZERO);
        let foe_body = now.opponents[0].body_position;
        let current = SegmentPose {
            hilt: foe_body + Vec3::new(-Fx::HALF, Fx::from_int(2), Fx::ONE),
            tip: foe_body + Vec3::new(Fx::HALF, Fx::from_int(2), Fx::ONE),
            radius: Fx::from_ratio(1, 20),
        };
        now.opponents[0].weapons[1] = Some(current);
        let outward = Vec3::Y;
        let mut before = now;
        before.tick -= 1;
        before.opponents[0].weapons[1] = Some(SegmentPose {
            hilt: current.hilt + outward * Fx::HALF,
            tip: current.tip + outward * Fx::HALF,
            radius: current.radius,
        });
        let before_centre = (before.opponents[0].weapons[1].unwrap().hilt
            + before.opponents[0].weapons[1].unwrap().tip) * Fx::HALF;
        let now_centre = (current.hilt + current.tip) * Fx::HALF;
        assert!(now_centre.distance(now.opponents[0].body_position)
            < before_centre.distance(before.opponents[0].body_position));
        let prior = PreviousOpponent {
            subject: before.subject, opponent: before.opponents[0].id, tick: before.tick,
            weapons: before.opponents[0].weapons,
            body_position: before.opponents[0].body_position,
        };
        assert!(weapon_is_withdrawing(&now.opponents[0], prior, Fx::ONE));
        assert!(assess_threat(&now, &now.opponents[0], prior, Fx::ONE).is_none());
        let mut policy = TacticalArticulatedPolicy::default();
        policy.planner.observe(&before);
        policy.planner.observe(&now);
        assert!(policy.planner.context().opponent_recovering);
        assert_eq!(policy.choose(&now), TacticalIntentV1::StrikeWeaponArm);
        let _ = policy.decide(&now);
        assert_eq!(policy.diagnostics().sampled_intent, Some(TacticalIntentV1::StrikeWeaponArm));
    }

    #[test]
    fn the_striker_submits_no_refused_commands() {
        let scenario = close_duel();
        let mut world = World::new(&scenario, 7);
        let mut policy = StrikerArticulatedPolicy::default();
        while world.outcome().is_none() && world.tick() < 600 {
            for id in world.pending_decisions().to_vec() {
                let obs = world.observe_articulated(id);
                let command = if id == world.alive_ids(Faction::Heroes)[0] {
                    policy.decide(&obs)
                } else { neutral_articulated_command(&obs) };
                assert!(matches!(world.submit_articulated_v1(id, command),
                                 SubmitArticulatedOutcome::Stored { rejection: None, .. }));
            }
            let _ = world.step();
        }
    }

    /// A body with a plate parked over one named region and nowhere near
    /// another, so "covered" and "uncovered" are facts about this fixture rather
    /// than about whichever way the fight happened to turn.
    ///
    /// The plate is placed **on** the region centre it is meant to cover, at the
    /// shipped quarter-by-quarter extents, so the sweep that reaches that region
    /// cannot avoid it.
    fn plated_at(part: BodyPart) -> (ArticulatedObservation, ObservedOpponent) {
        // Inside measure, unlike `close_duel`: at two tiles apart no candidate
        // crosses anything at all, so every plate question would be answered
        // vacuously. `zz`-free proof that this matters is the fixture assertion
        // in the test below, which fails loudly on a fixture nothing reaches.
        let mut config = DuelConfigV1::shipped();
        config.fighters[0].spawn = Vec2::from_ints(10, 8);
        config.fighters[1].spawn = Vec2::new(Fx::from_ratio(111, 10), Fx::from_int(8));
        let scenario = Scenario::duel_from(&config).unwrap();
        let world = World::new(&scenario, 5);
        let attacker = world.alive_ids(Faction::Heroes)[0];
        let obs = world.observe_articulated(attacker);
        let mut foe = obs.opponents()[0];
        foe.shield.present = true;
        foe.shield.centre = centre(foe.regions[part as usize]);
        foe.shield.normal = Vec3::X;
        foe.shield.half_width = Fx::from_ratio(1, 4);
        foe.shield.half_height = Fx::from_ratio(1, 4);
        (obs, foe)
    }

    #[test]
    fn an_openings_planner_keeps_its_scoring_across_a_reset() {
        // `reset` is called between every seed by every corpus runner, and it
        // used to be `*self = Self::default()`. Restoring the default wholesale
        // would demote seed two onwards to nearest-region, so the corpus would
        // measure a policy nobody selected and the first seed would be the only
        // honest row in it.
        let mut planner = StrikePlanner::scoring(PlanScoring::UncoveredRegion);
        assert_eq!(planner.scoring, PlanScoring::UncoveredRegion);
        planner.reset();
        assert_eq!(planner.scoring, PlanScoring::UncoveredRegion,
            "reset dropped the scoring rule the policy was built with");

        // And the policy that owns one resets the same way.
        let mut policy = OpeningsArticulatedPolicy::default();
        assert_eq!(policy.planner.scoring, PlanScoring::UncoveredRegion);
        ArticulatedPolicy::reset(&mut policy);
        assert_eq!(policy.planner.scoring, PlanScoring::UncoveredRegion);

        // The tactical policy is untouched by all of this, which is what makes
        // its pinned measurements still its own.
        let mut tactical = TacticalArticulatedPolicy::default();
        assert_eq!(tactical.planner.scoring, PlanScoring::NearestRegion);
        ArticulatedPolicy::reset(&mut tactical);
        assert_eq!(tactical.planner.scoring, PlanScoring::NearestRegion);
    }

    #[test]
    fn the_tactical_policy_is_unchanged_by_the_openings_scoring() {
        // The control. `PlanScoring::NearestRegion` must be the identity on the
        // path every pinned tactical number was measured under, so a plate in
        // the way changes nothing about what tactical decides.
        let (obs, foe) = plated_at(BodyPart::Torso);
        let mut tactical = TacticalArticulatedPolicy::default();
        let mut planner = StrikePlanner::default();
        let mut scoped = obs;
        scoped.opponents[0] = foe;
        assert_eq!(tactical.decide(&scoped), planner.decide(&scoped));
    }

    /// The footwork row survives a reset, on
    /// `an_openings_planner_keeps_its_scoring_across_a_reset`'s reason exactly:
    /// a corpus runner resets between seeds, and a reset that restored `Default`
    /// wholesale would quietly demote every seed after the first to the
    /// articulated row -- a corpus measuring a policy nobody selected, with the
    /// first seed the only honest row in it.
    #[test]
    fn an_embodied_planner_keeps_its_footwork_across_a_reset() {
        let mut planner = StrikePlanner::footwork(Footwork::EMBODIED);
        assert_eq!(planner.footwork, Footwork::EMBODIED);
        planner.reset();
        assert_eq!(planner.footwork, Footwork::EMBODIED,
                   "reset dropped the footwork row the policy was built with");

        // And the two policies that own one, from both ends of the seam: the
        // embodied policy is built on the swept row, and the articulated one is
        // still on the row every pinned measurement was taken with.
        let mut embodied = crate::TacticalEmbodiedPolicy::default();
        assert_eq!(embodied.planner().footwork, Footwork::EMBODIED);
        crate::EmbodiedPolicy::reset(&mut embodied);
        assert_eq!(embodied.planner().footwork, Footwork::EMBODIED);

        let mut tactical = TacticalArticulatedPolicy::default();
        assert_eq!(tactical.planner.footwork, Footwork::ARTICULATED);
        ArticulatedPolicy::reset(&mut tactical);
        assert_eq!(tactical.planner.footwork, Footwork::ARTICULATED);
    }
}
