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

use crate::{neutral_articulated_command, ArmRoles, ArticulatedPolicy};
use fx::{closest_points_on_segments, swept_segment_segment, Angle, Fx, Vec2, Vec3};
use sim::{
    ArmTarget, ArticulatedCommandV1, ArticulatedObservation, BodyPart, CombatHeight, EntityId,
    Intent, LimbSlot, ObservedOpponent, RegionVolume, SegmentPose,
};

const CHAMBER_TICKS: u32 = 28;
const COMMIT_TICKS: u32 = 28;
const RECOVER_TICKS: u32 = 24;
const EIGHTH_TURN: Angle = Angle::from_raw(8_192);
const APPROACH_SPEED: Fx = Fx::from_ratio(15, 16);
const WITHDRAW_SPEED: Fx = Fx::HALF;
const MEASURE_MARGIN: Fx = Fx::from_ratio(1, 10);
const MEASURE_MIN_FRACTION: Fx = Fx::from_ratio(3, 5);
const GUARD_REACH: Fx = Fx::from_ratio(3, 4);
const STRIKE_CHAMBER_REACH: Fx = Fx::ONE;
const STRIKE_COMMIT_REACH: Fx = Fx::from_raw(61_440);
const THREAT_LOOKAHEAD_TICKS: u32 = 32;
// The production actuator's published base linear maximum. A guard estimate
// must price the distance from its observed pose rather than grant every hand
// the same twenty-two-tick teleport.
const GUARD_LINEAR_SPEED: Fx = Fx::from_raw(1_638);
const RECOVERY_MIN_STEP: Fx = Fx::from_ratio(1, 500);

pub const TACTICAL_POLICY_CODE: u32 = 5;
pub const OPENINGS_POLICY_CODE: u32 = 6;
pub const TACTICAL_PHASE_COUNT: usize = 5;
pub const TACTICAL_INTENT_COUNT: usize = 8;
pub const ROBUST_STRIKE_TICKS: u32 = CHAMBER_TICKS + COMMIT_TICKS;
pub const ROBUST_STRIKE_HEIGHT: CombatHeight =
    CombatHeight::try_from_raw(16_384).expect("the Brute Legs centre is one quarter of Fighter height");

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

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum TacticalPhase { Seek, Measure, Chamber, Commit, Recover }

impl TacticalPhase {
    pub const fn index(self) -> usize {
        match self {
            TacticalPhase::Seek => 0,
            TacticalPhase::Measure => 1,
            TacticalPhase::Chamber => 2,
            TacticalPhase::Commit => 3,
            TacticalPhase::Recover => 4,
        }
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum TacticalIntentV1 {
    Close,
    StrikeBest,
    StrikeWeaponArm,
    StrikeShieldArm,
    Guard,
    EvadeLeft,
    EvadeRight,
    Disengage,
}

impl TacticalIntentV1 {
    pub const fn index(self) -> usize {
        match self {
            TacticalIntentV1::Close => 0,
            TacticalIntentV1::StrikeBest => 1,
            TacticalIntentV1::StrikeWeaponArm => 2,
            TacticalIntentV1::StrikeShieldArm => 3,
            TacticalIntentV1::Guard => 4,
            TacticalIntentV1::EvadeLeft => 5,
            TacticalIntentV1::EvadeRight => 6,
            TacticalIntentV1::Disengage => 7,
        }
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct ThreatAssessmentV1 {
    pub opponent: EntityId,
    pub hand: LimbSlot,
    pub closing_speed: Fx,
    pub ticks_to_crossing: Fx,
    pub crossing_height: CombatHeight,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct StrikePlan {
    pub opponent: EntityId,
    pub region: BodyPart,
    pub hand: LimbSlot,
    pub chamber_bearing: Angle,
    pub commit_bearing: Angle,
    pub height: CombatHeight,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct TacticalContextV1 {
    pub phase: TacticalPhase,
    pub plan: Option<StrikePlan>,
    pub threat: Option<ThreatAssessmentV1>,
    pub opponent_recovering: bool,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct StrikeDiagnostics {
    pub context: TacticalContextV1,
    pub sampled_intent: Option<TacticalIntentV1>,
    pub committed: bool,
    pub guarded: bool,
    pub evaded: bool,
}

#[derive(Clone, Copy, Debug)]
struct PreviousOpponent {
    subject: EntityId,
    opponent: EntityId,
    tick: u32,
    weapons: [Option<SegmentPose>; 2],
    body_position: Vec3,
}

#[derive(Clone, Copy, Debug)]
pub struct StrikePlanner {
    phase: TacticalPhase,
    plan: Option<StrikePlan>,
    phase_started: u32,
    intent: Option<TacticalIntentV1>,
    previous: Option<PreviousOpponent>,
    observed_tick: Option<(EntityId, u32)>,
    threat: Option<ThreatAssessmentV1>,
    threat_crossing: Option<SegmentPose>,
    opponent_recovering: bool,
    scoring: PlanScoring,
}

impl Default for StrikePlanner {
    fn default() -> Self {
        Self {
            phase: TacticalPhase::Seek, plan: None, phase_started: 0, intent: None,
            previous: None, observed_tick: None, threat: None, threat_crossing: None,
            opponent_recovering: false, scoring: PlanScoring::NearestRegion,
        }
    }
}

impl StrikePlanner {
    /// The same planner ranking its candidates the other way.
    ///
    /// A constructor rather than a setter, because the scoring rule is not
    /// something a fight changes its mind about mid-way -- and `reset()` returns
    /// the planner to `Default`, which would silently drop a set one.
    pub fn scoring(scoring: PlanScoring) -> Self {
        Self { scoring, ..Self::default() }
    }

    pub fn phase(&self) -> TacticalPhase { self.phase }

    pub fn context(&self) -> TacticalContextV1 {
        TacticalContextV1 {
            phase: self.phase, plan: self.plan, threat: self.threat,
            opponent_recovering: self.opponent_recovering,
        }
    }

    /// An inference caller may sample only at a motor boundary. Once a strike
    /// chambers, its next two endpoints and its recovery cannot be contradicted
    /// by another logit on the following tick.
    pub fn can_sample_intent(&self) -> bool {
        matches!(self.phase, TacticalPhase::Seek | TacticalPhase::Measure) && self.plan.is_none()
    }

    pub fn diagnostics(&self) -> StrikeDiagnostics {
        StrikeDiagnostics {
            context: self.context(),
            sampled_intent: self.intent,
            committed: self.phase == TacticalPhase::Commit,
            guarded: self.intent == Some(TacticalIntentV1::Guard),
            evaded: matches!(self.intent,
                Some(TacticalIntentV1::EvadeLeft | TacticalIntentV1::EvadeRight)),
        }
    }

    /// Updates the controller's one-observation history and returns the context
    /// a tactical-intent caller should score. Repeating it for the same subject
    /// and tick is a no-op, so inference can inspect and then call
    /// [`StrikePlanner::decide_with_intent`] without manufacturing a zero-speed
    /// second sample.
    pub fn observe(&mut self, obs: &ArticulatedObservation) -> TacticalContextV1 {
        if self.observed_tick == Some((obs.subject, obs.tick)) {
            return self.context();
        }
        self.observed_tick = Some((obs.subject, obs.tick));
        self.threat = None;
        self.threat_crossing = None;
        self.opponent_recovering = false;
        let Some(foe) = obs.opponents().first() else {
            self.previous = None;
            return self.context();
        };
        if let Some(previous) = self.previous.filter(|row|
            row.subject == obs.subject && row.opponent == foe.id && row.tick < obs.tick)
        {
            let elapsed = Fx::from_int(obs.tick.saturating_sub(previous.tick) as i32);
            if let Some((threat, crossing)) = assess_threat(obs, foe, previous, elapsed) {
                self.threat = Some(threat);
                self.threat_crossing = Some(crossing);
            }
            self.opponent_recovering = self.threat.is_none()
                && weapon_is_withdrawing(foe, previous, elapsed);
        }
        self.previous = Some(PreviousOpponent {
            subject: obs.subject, opponent: foe.id, tick: obs.tick, weapons: foe.weapons,
            body_position: foe.body_position,
        });
        self.context()
    }

    /// Clears the fight and keeps the wiring.
    ///
    /// `scoring` survives because it is configuration and not state: a policy
    /// that ranked openings before a reset is the same policy afterwards, and
    /// `reset` is called between seeds by every corpus runner. Restoring
    /// `Default` wholesale would quietly demote the second seed onwards to
    /// nearest-region, which is a corpus measuring a policy nobody selected.
    /// `an_openings_planner_keeps_its_scoring_across_a_reset` holds it.
    pub fn reset(&mut self) { *self = Self { scoring: self.scoring, ..Self::default() }; }

    pub fn decide(&mut self, obs: &ArticulatedObservation) -> ArticulatedCommandV1 {
        self.decide_with_intent(obs, TacticalIntentV1::StrikeBest)
    }

    pub fn decide_with_intent(
        &mut self,
        obs: &ArticulatedObservation,
        requested: TacticalIntentV1,
    ) -> ArticulatedCommandV1 {
        self.observe(obs);
        if !obs.present() {
            self.reset();
            return neutral_articulated_command(obs);
        }
        if obs.opponents().is_empty() {
            self.phase = TacticalPhase::Seek;
            self.plan = None;
            self.intent = Some(TacticalIntentV1::Close);
            let mut command = neutral_articulated_command(obs);
            command.move_dir = Vec2::new(obs.body_yaw.cos(), obs.body_yaw.sin()) * APPROACH_SPEED;
            command.body_yaw = obs.body_yaw;
            return command;
        }
        if self.can_sample_intent() {
            self.intent = Some(requested);
        }
        let intent = self.intent.unwrap_or(requested);
        let foe = matching_opponent(obs, self.plan).unwrap_or(&obs.opponents()[0]);
        let toward = planar(foe.body_position - obs.body_position).angle();

        if self.phase == TacticalPhase::Seek {
            self.phase = TacticalPhase::Measure;
            self.phase_started = obs.tick;
        }
        if self.phase == TacticalPhase::Measure {
            if !matches!(intent, TacticalIntentV1::StrikeBest
                | TacticalIntentV1::StrikeWeaponArm | TacticalIntentV1::StrikeShieldArm)
            {
                return intent_command(obs, foe, intent);
            }
            if let Some(plan) = choose_plan(obs, foe, intent, self.scoring) {
                if in_measure(obs, foe, plan.hand) {
                    self.plan = Some(plan);
                    self.phase = TacticalPhase::Chamber;
                    self.phase_started = obs.tick;
                } else {
                    return measure_command(obs, foe, toward, plan.hand);
                }
            } else {
                return feet_command(obs, foe, toward, APPROACH_SPEED);
            }
        }

        let Some(plan) = self.plan else { return neutral_articulated_command(obs) };
        let elapsed = obs.tick.saturating_sub(self.phase_started);
        match self.phase {
            TacticalPhase::Chamber if elapsed >= CHAMBER_TICKS => {
                self.phase = TacticalPhase::Commit;
                self.phase_started = obs.tick;
            }
            TacticalPhase::Commit if elapsed >= COMMIT_TICKS => {
                self.phase = TacticalPhase::Recover;
                self.phase_started = obs.tick;
            }
            TacticalPhase::Recover if elapsed >= RECOVER_TICKS => {
                self.phase = TacticalPhase::Measure;
                self.phase_started = obs.tick;
                self.plan = None;
                self.intent = None;
                return neutral_articulated_command(obs);
            }
            _ => {}
        }

        strike_command(obs, foe, plan, self.phase)
    }
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

fn weapon_is_withdrawing(
    foe: &ObservedOpponent,
    previous: PreviousOpponent,
    elapsed: Fx,
) -> bool {
    for hand in 0..2 {
        if let (Some(before), Some(now)) = (previous.weapons[hand], foe.weapons[hand]) {
            let before_centre = (before.hilt + before.tip) * Fx::HALF;
            let now_centre = (now.hilt + now.tip) * Fx::HALF;
            let travel = now_centre.distance(before_centre) / elapsed;
            let before_reach = before_centre.distance(previous.body_position);
            let now_reach = now_centre.distance(foe.body_position);
            if travel >= RECOVERY_MIN_STEP && now_reach < before_reach {
                return true;
            }
        }
    }
    false
}

fn assess_threat(
    obs: &ArticulatedObservation,
    foe: &ObservedOpponent,
    previous: PreviousOpponent,
    elapsed: Fx,
) -> Option<(ThreatAssessmentV1, SegmentPose)> {
    let lower = obs.body_position + Vec3::new(
        Fx::ZERO, Fx::ZERO, obs.standing_height * Fx::from_ratio(1, 4),
    );
    let upper = obs.body_position + Vec3::new(
        Fx::ZERO, Fx::ZERO, obs.standing_height * Fx::from_ratio(3, 4),
    );
    let body_radius = obs.hand_radius * Fx::TWO;
    let mut best: Option<(u32, usize, ThreatAssessmentV1, SegmentPose)> = None;
    for hand in 0..2 {
        let (Some(before), Some(now)) = (previous.weapons[hand], foe.weapons[hand]) else {
            continue;
        };
        let per_tick = Fx::ONE / elapsed;
        let hilt_step = (now.hilt - before.hilt) * per_tick;
        let tip_step = (now.tip - before.tip) * per_tick;
        let closing_speed = hilt_step.length().max(tip_step.length());
        if !closing_speed.is_positive() { continue }
        for ticks in 1..=THREAT_LOOKAHEAD_TICKS {
            let dt = Fx::from_int(ticks as i32);
            let before_dt = Fx::from_int(ticks.saturating_sub(1) as i32);
            let from = SegmentPose {
                hilt: now.hilt + hilt_step * before_dt,
                tip: now.tip + tip_step * before_dt,
                radius: now.radius,
            };
            let projected = SegmentPose {
                hilt: now.hilt + hilt_step * dt,
                tip: now.tip + tip_step * dt,
                radius: now.radius,
            };
            if swept_segment_segment(
                from.hilt, from.tip, projected.hilt, projected.tip, now.radius,
                lower, upper, lower, upper, body_radius,
            ).is_none() {
                continue;
            }
            let centre_z = (projected.hilt.z + projected.tip.z) / Fx::TWO;
            let raw = ((centre_z - obs.body_position.z) / obs.standing_height)
                .clamp(Fx::ZERO, Fx::ONE).raw();
            let Some(crossing_height) = CombatHeight::try_from_raw(raw) else { continue };
            let assessment = ThreatAssessmentV1 {
                opponent: foe.id,
                hand: if hand == 0 { LimbSlot::LeftArm } else { LimbSlot::RightArm },
                closing_speed,
                ticks_to_crossing: dt,
                crossing_height,
            };
            let key = (ticks, hand, assessment, projected);
            if best.map(|old| (key.0, key.1) < (old.0, old.1)).unwrap_or(true) {
                best = Some(key);
            }
            break;
        }
    }
    best.map(|row| (row.2, row.3))
}

/// Where the guard's plate would sit if its arm bore `bearing` at
/// [`GUARD_REACH`], with its face centre at `target_z`.
///
/// **The body axis stands in for the shoulder**, exactly as [`predicted_segment`]
/// does and for the same stated reason: shoulder width is deliberately absent
/// from the observation. `World::derive_shield_pose` puts the plate's centre
/// *at the hand*, and the hand is the shoulder plus the reach vector, so this
/// prediction is wrong by exactly the shoulder's own offset from the body
/// origin -- a body-frame constant that **does not depend on `bearing` at all**,
/// because prediction and hand both rotate the same reach vector about points
/// that differ by that fixed offset.
///
/// That invariance is what makes freeing the guard bearing safe for this model
/// rather than merely untested. Before 2026-08-16 the guard was welded to body
/// yaw and this function was only ever asked about one bearing, so nothing
/// established that its error was bearing-independent;
/// `the_intercept_model_agrees_with_the_derived_plate_at_a_nonzero_guard_bearing`
/// is that missing guard.
fn predicted_plate_centre(
    obs: &ArticulatedObservation, bearing: Angle, target_z: Fx,
) -> Vec3 {
    Vec3::new(bearing.cos(), bearing.sin(), Fx::ZERO) * (obs.arm_length * GUARD_REACH)
        + Vec3::new(obs.body_position.x, obs.body_position.y, target_z)
}

fn can_cover(
    obs: &ArticulatedObservation,
    threat: ThreatAssessmentV1,
    crossing: SegmentPose,
) -> bool {
    let roles = ArmRoles::of(obs);
    if obs.arms[roles.guard].severed || !GUARD_LINEAR_SPEED.is_positive() {
        return false;
    }
    let foe = obs.opponents().iter().find(|row| row.id == threat.opponent);
    let Some(foe) = foe else { return false };
    let toward = planar(foe.body_position - obs.body_position).angle();
    let target_z = obs.body_position.z
        + obs.standing_height * Fx::from_raw(threat.crossing_height.raw());
    let (current, target) = if obs.shield.present {
        let current = SegmentPose {
            hilt: obs.shield.centre - Vec3::Z * obs.shield.half_height,
            tip: obs.shield.centre + Vec3::Z * obs.shield.half_height,
            radius: obs.shield.half_width,
        };
        let centre = predicted_plate_centre(obs, toward, target_z);
        (current, SegmentPose {
            hilt: centre - Vec3::Z * obs.shield.half_height,
            tip: centre + Vec3::Z * obs.shield.half_height,
            radius: obs.shield.half_width,
        })
    } else if let Some(current) = obs.weapons[roles.guard] {
        (current, predicted_segment(
            obs, roles.guard, current, toward, threat.crossing_height, GUARD_REACH,
        ))
    } else {
        return false;
    };

    let covers = closest_points_on_segments(
        target.hilt, target.tip, crossing.hilt, crossing.tip,
    ).distance_sq <= (target.radius + crossing.radius) * (target.radius + crossing.radius);
    let travel = current.hilt.distance(target.hilt).max(current.tip.distance(target.tip));
    covers && travel / GUARD_LINEAR_SPEED <= threat.ticks_to_crossing
}

fn evade_miss_distances(obs: &ArticulatedObservation, crossing: SegmentPose) -> (Fx, Fx) {
    let Some(foe) = obs.opponents().first() else { return (Fx::ZERO, Fx::ZERO) };
    let toward = planar(foe.body_position - obs.body_position);
    let side = Vec2::new(-toward.y, toward.x).normalize();
    let offset = Vec3::new(side.x, side.y, Fx::ZERO) * obs.arm_length;
    let lower = Vec3::Z * (obs.standing_height * Fx::from_ratio(1, 4));
    let upper = Vec3::Z * (obs.standing_height * Fx::from_ratio(3, 4));
    let distance = |at: Vec3| closest_points_on_segments(
        crossing.hilt, crossing.tip, at + lower, at + upper,
    ).distance_sq;
    (distance(obs.body_position + offset), distance(obs.body_position - offset))
}

fn evade_intent(obs: &ArticulatedObservation, crossing: SegmentPose) -> TacticalIntentV1 {
    let (left, right) = evade_miss_distances(obs, crossing);
    if left >= right { TacticalIntentV1::EvadeLeft } else { TacticalIntentV1::EvadeRight }
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

fn matching_opponent<'a>(
    obs: &'a ArticulatedObservation,
    plan: Option<StrikePlan>,
) -> Option<&'a ObservedOpponent> {
    let id = plan?.opponent;
    obs.opponents().iter().find(|foe| foe.id == id)
}

fn planar(v: Vec3) -> Vec2 { Vec2::new(v.x, v.y) }

fn centre(region: RegionVolume) -> Vec3 {
    Vec3::new(
        (region.lower.x + region.upper.x) / Fx::from_int(2),
        (region.lower.y + region.upper.y) / Fx::from_int(2),
        (region.lower.z + region.upper.z) / Fx::from_int(2),
    )
}

fn height_for(
    obs: &ArticulatedObservation,
    foe: &ObservedOpponent,
    region: RegionVolume,
) -> Option<CombatHeight> {
    if !obs.standing_height.is_positive() { return None }
    // Opponent body and region positions carry the same perception
    // translation. Their difference is the observed anatomical height; using
    // the region's absolute world z would turn vertical perception error into
    // a different requested limb height.
    let local = centre(region).z - foe.body_position.z;
    let raw = (local / obs.standing_height).clamp(Fx::ZERO, Fx::ONE).raw();
    CombatHeight::try_from_raw(raw)
}

fn predicted_segment(
    obs: &ArticulatedObservation,
    _hand: usize,
    current: SegmentPose,
    bearing: Angle,
    height: CombatHeight,
    reach: Fx,
) -> SegmentPose {
    // Shoulder width is intentionally absent from the observation, so the
    // auditable conservative prediction uses the body axis as its shoulder.
    // The real hand's lateral offset is small beside the region radii; measure
    // and the committed feedback path test the actual segment afterwards.
    let hilt = obs.body_position + Vec3::new(
        bearing.cos() * obs.arm_length * reach,
        bearing.sin() * obs.arm_length * reach,
        obs.standing_height * Fx::from_raw(height.raw()),
    );
    let length = current.tip.distance(current.hilt);
    SegmentPose {
        hilt,
        tip: hilt + Vec3::new(bearing.cos() * length, bearing.sin() * length, Fx::ZERO),
        // The shoulder axis approximation above omits the lateral shoulder
        // offset; one hand radius is the conservative envelope for that
        // omitted self geometry, and is observation data rather than a copied
        // anatomy constant.
        radius: current.radius + obs.hand_radius,
    }
}

fn candidate_crosses(
    obs: &ArticulatedObservation,
    hand: usize,
    weapon: SegmentPose,
    region: RegionVolume,
    chamber: Angle,
    commit: Angle,
    height: CombatHeight,
) -> bool {
    let (from, to) = predicted_strike(obs, hand, weapon, chamber, commit, height);
    swept_segment_segment(
        from.hilt, from.tip, to.hilt, to.tip, from.radius.max(to.radius),
        region.lower, region.upper, region.lower, region.upper, region.radius,
    ).is_some()
}

fn predicted_strike(
    obs: &ArticulatedObservation,
    hand: usize,
    weapon: SegmentPose,
    chamber: Angle,
    commit: Angle,
    height: CombatHeight,
) -> (SegmentPose, SegmentPose) {
    (
        predicted_segment(obs, hand, weapon, chamber, height, STRIKE_CHAMBER_REACH),
        predicted_segment(obs, hand, weapon, commit, height, STRIKE_COMMIT_REACH),
    )
}

fn arm_region(limb: usize) -> BodyPart {
    if limb == LimbSlot::LeftArm as usize { BodyPart::LeftArm } else { BodyPart::RightArm }
}

fn region_allowed(intent: TacticalIntentV1, foe: &ObservedOpponent, part: BodyPart) -> bool {
    match intent {
        TacticalIntentV1::StrikeWeaponArm => foe.weapons.iter().enumerate()
            .any(|(limb, weapon)| weapon.is_some() && part == arm_region(limb)),
        // The observation publishes one shield face but not a duplicate owner
        // column. A one-handed shield is therefore the equipped arm with no
        // segment; this is exact for the supported grip vocabulary, while a
        // body without a shield has no candidate for this intent.
        TacticalIntentV1::StrikeShieldArm => foe.shield.present && foe.weapons.iter().enumerate()
            .any(|(limb, weapon)| weapon.is_none() && part == arm_region(limb)),
        _ => true,
    }
}

fn strike_arcs(toward: Angle) -> [(Angle, Angle); 2] {
    [
        (toward - EIGHTH_TURN, toward + EIGHTH_TURN),
        (toward + EIGHTH_TURN, toward - EIGHTH_TURN),
    ]
}

/// How a planner ranks the candidate strikes it has already found.
///
/// A separate axis from [`TacticalIntentV1`], which decides *which regions are
/// allowed*: this decides which of the allowed ones is worth taking. Splitting
/// them is what lets a second policy change the choice without changing the
/// vocabulary the learned action layout is defined over -- the intents are a
/// scored head in `learn-core`, and adding one there is a re-score.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
pub enum PlanScoring {
    /// The nearest region centre wins. What the tactical policy has always done,
    /// and what every pinned tactical measurement was taken under.
    #[default]
    NearestRegion,
    /// The nearest region centre the opponent's plate does **not** already
    /// cover, falling back to the nearest covered one when the guard leaves no
    /// hole at all.
    ///
    /// A preference and not a filter, deliberately. A filter would make a body
    /// that is fully covered produce no plan at all, and `decide_with_intent`
    /// answers a missing plan by walking forward -- so a perfect guard would
    /// turn the attacker into a pacifist rather than into an attacker with a
    /// worse option.
    UncoveredRegion,
}

/// How much the plate is grown before asking whether it covers a candidate.
///
/// The shipped shield is a quarter by a quarter (`shield()` in
/// `crates/sim/src/combat/spec.rs`), so an eighth is half its half-width: a
/// candidate that clears the plate by less than half its own radius is treated
/// as covered, because the guard is a moving target and the observation of it is
/// perception-noised. Larger, and every region reads as covered on a body that is
/// merely facing you; smaller, and the margin does not survive one tick of guard
/// motion.
const SHIELD_COVER_MARGIN: Fx = Fx::from_ratio(1, 8);

/// The plate as a capsule the swept-segment test can take.
///
/// Exactly the shape [`can_cover`] builds from the same three published numbers,
/// and shared with it for that reason: two readings of one plate that disagreed
/// would let a policy dodge a guard it had just decided it could not beat.
///
/// **It reads the plate's centre and extents and deliberately not its normal**,
/// so the plate is modelled as a vertical capsule rather than the oriented
/// rectangle `segment_shield_candidate` actually sweeps. That was exact enough
/// to ignore while the normal was welded to body yaw and a policy facing its
/// opponent always saw the plate broadside. Since 2026-08-16 the normal follows
/// the carrying arm, so it is worth stating why the approximation survives:
/// `articulated_script::GUARD_ARC` bounds a scripted guard to an eighth turn off
/// its body, and this file's own `Guard` bears straight at the threat, so on
/// every policy in the tree the plate is at worst 45 degrees oblique and never
/// edge-on. A capsule of the plate's half-width is then an **over**-estimate of
/// what it covers, which makes `candidate_covered` conservative -- it may call a
/// region covered that a glancing blow would reach, and will not call one open
/// that the plate would stop. A future policy that swung its guard past a
/// quarter turn would break that and owes this function the real rectangle.
fn shield_capsule(shield: sim::ObservedShield, margin: Fx) -> SegmentPose {
    SegmentPose {
        hilt: shield.centre - Vec3::Z * shield.half_height,
        tip: shield.centre + Vec3::Z * shield.half_height,
        radius: shield.half_width + margin,
    }
}

/// Whether the plate stands in the way of the sweep this candidate would make.
///
/// The same swept test `candidate_crosses` uses against the region, against the
/// plate instead -- so "the shield gets there first" is answered by the geometry
/// that will actually answer it during the contact phase, rather than by an angle
/// heuristic that would drift from the solver.
fn candidate_covered(
    obs: &ArticulatedObservation,
    foe: &ObservedOpponent,
    hand: usize,
    weapon: SegmentPose,
    chamber: Angle,
    commit: Angle,
    height: CombatHeight,
) -> bool {
    if !foe.shield.present { return false }
    let plate = shield_capsule(foe.shield, SHIELD_COVER_MARGIN);
    let (from, to) = predicted_strike(obs, hand, weapon, chamber, commit, height);
    swept_segment_segment(
        from.hilt, from.tip, to.hilt, to.tip, from.radius.max(to.radius),
        plate.hilt, plate.tip, plate.hilt, plate.tip, plate.radius,
    ).is_some()
}

fn choose_plan(
    obs: &ArticulatedObservation,
    foe: &ObservedOpponent,
    intent: TacticalIntentV1,
    scoring: PlanScoring,
) -> Option<StrikePlan> {
    let toward = planar(foe.body_position - obs.body_position).angle();
    let bearings = strike_arcs(toward);
    let mut best: Option<(u8, i32, u8, u8, u16, StrikePlan)> = None;
    for part in BodyPart::ALL {
        let region = foe.regions[part as usize];
        if !region.present || !region_allowed(intent, foe, part) { continue }
        let Some(height) = height_for(obs, foe, region) else { continue };
        for hand in [LimbSlot::LeftArm, LimbSlot::RightArm] {
            let at = hand as usize;
            let Some(weapon) = obs.weapons[at] else { continue };
            for (chamber, commit) in bearings {
                if !candidate_crosses(obs, at, weapon, region, chamber, commit, height) { continue }
                // Leading the key rather than weighting the distance: a covered
                // candidate loses to every uncovered one however close it is,
                // and the old ordering decides among equals untouched. A weight
                // would need a rate to convert plate-crossings into world units
                // and there is no honest one.
                let covered = match scoring {
                    PlanScoring::NearestRegion => 0,
                    PlanScoring::UncoveredRegion => u8::from(
                        candidate_covered(obs, foe, at, weapon, chamber, commit, height)),
                };
                let score = centre(region).distance(obs.body_position).raw();
                let plan = StrikePlan {
                    opponent: foe.id, region: part, hand,
                    chamber_bearing: chamber, commit_bearing: commit, height,
                };
                let key = (covered, score, part as u8, hand as u8, commit.raw(), plan);
                if best.map(|old| (key.0, key.1, key.2, key.3, key.4)
                    < (old.0, old.1, old.2, old.3, old.4)).unwrap_or(true) {
                    best = Some(key);
                }
            }
        }
    }
    best.map(|row| row.5)
}

fn in_measure(obs: &ArticulatedObservation, foe: &ObservedOpponent, hand: LimbSlot) -> bool {
    let Some(weapon) = obs.weapons[hand as usize] else { return false };
    let blade = weapon.tip.distance(weapon.hilt);
    let distance = planar(foe.body_position - obs.body_position).length();
    let reach = obs.arm_length + blade;
    distance >= reach * MEASURE_MIN_FRACTION && distance <= reach + MEASURE_MARGIN
}

fn measure_command(
    obs: &ArticulatedObservation,
    foe: &ObservedOpponent,
    toward: Angle,
    hand: LimbSlot,
) -> ArticulatedCommandV1 {
    let Some(weapon) = obs.weapons[hand as usize] else {
        return feet_command(obs, foe, toward, APPROACH_SPEED);
    };
    let reach = obs.arm_length + weapon.tip.distance(weapon.hilt);
    let distance = planar(foe.body_position - obs.body_position).length();
    if distance < reach * MEASURE_MIN_FRACTION {
        feet_command(obs, foe, toward + Angle::HALF, WITHDRAW_SPEED)
    } else {
        feet_command(obs, foe, toward, APPROACH_SPEED)
    }
}

fn feet_command(
    obs: &ArticulatedObservation,
    foe: &ObservedOpponent,
    toward: Angle,
    speed: Fx,
) -> ArticulatedCommandV1 {
    let mut command = neutral_articulated_command(obs);
    command.move_dir = Vec2::new(toward.cos() * speed, toward.sin() * speed);
    command.body_yaw = toward;
    command.intent = Intent::Attack(foe.id);
    command
}

fn intent_command(
    obs: &ArticulatedObservation,
    foe: &ObservedOpponent,
    intent: TacticalIntentV1,
) -> ArticulatedCommandV1 {
    let toward = planar(foe.body_position - obs.body_position).angle();
    match intent {
        TacticalIntentV1::Close => feet_command(obs, foe, toward, APPROACH_SPEED),
        TacticalIntentV1::Disengage => feet_command(obs, foe, toward + Angle::HALF, WITHDRAW_SPEED),
        TacticalIntentV1::EvadeLeft => feet_command(obs, foe, toward + Angle::QUARTER, APPROACH_SPEED),
        TacticalIntentV1::EvadeRight => feet_command(obs, foe, toward - Angle::QUARTER, APPROACH_SPEED),
        TacticalIntentV1::Guard => {
            let mut command = neutral_articulated_command(obs);
            command.body_yaw = toward;
            let guard = ArmRoles::of(obs).guard;
            let height = obs.standing_height.is_positive()
                .then(|| CombatHeight::try_from_raw(
                    ((centre(foe.regions[BodyPart::Torso as usize]).z - obs.body_position.z)
                        / obs.standing_height).clamp(Fx::ZERO, Fx::ONE).raw(),
                ).unwrap_or(CombatHeight::MID))
                .unwrap_or(CombatHeight::MID);
            command.arms[guard] = ArmTarget {
                bearing: toward, height, reach: GUARD_REACH, effort: Fx::ONE,
            };
            command
        }
        _ => feet_command(obs, foe, toward, APPROACH_SPEED),
    }
}

fn strike_command(
    obs: &ArticulatedObservation,
    foe: &ObservedOpponent,
    plan: StrikePlan,
    phase: TacticalPhase,
) -> ArticulatedCommandV1 {
    let mut command = neutral_articulated_command(obs);
    let toward = planar(foe.body_position - obs.body_position).angle();
    command.body_yaw = toward;
    command.intent = Intent::Attack(plan.opponent);
    command.arms[plan.hand as usize] = match phase {
        TacticalPhase::Chamber => ArmTarget {
            bearing: plan.chamber_bearing, height: plan.height,
            reach: STRIKE_CHAMBER_REACH, effort: Fx::ONE,
        },
        TacticalPhase::Commit => ArmTarget {
            bearing: plan.commit_bearing, height: plan.height,
            reach: STRIKE_COMMIT_REACH, effort: Fx::ONE,
        },
        TacticalPhase::Recover => ArmTarget {
            bearing: toward, height: plan.height,
            reach: Fx::from_ratio(1, 4), effort: Fx::ZERO,
        },
        TacticalPhase::Seek | TacticalPhase::Measure => return command,
    };
    command
}

#[cfg(test)]
mod tests {
    use super::*;
    use sim::{DuelConfigV1, EquipmentGeometry, Faction, Scenario, SubmitArticulatedOutcome, World};

    fn close_duel() -> Scenario {
        let mut config = DuelConfigV1::shipped();
        config.fighters[0].spawn = Vec2::from_ints(10, 8);
        config.fighters[1].spawn = Vec2::from_ints(12, 8);
        Scenario::duel_from(&config).unwrap()
    }

    /// The guard the intercept model never had: its predicted plate position,
    /// checked against the plate `World::derive_shield_pose` actually produces,
    /// at a **non-zero** guard bearing.
    ///
    /// The claim is not that the prediction is exact -- it deliberately uses the
    /// body axis for the shoulder -- but that its error is the shoulder's fixed
    /// body-frame offset and is therefore **the same at every bearing**. That is
    /// what says freeing the guard bearing did not quietly make this model
    /// worse. Before the bearing was freed the guard was welded to body yaw and
    /// this function was only ever asked about one bearing, so nothing checked
    /// it.
    #[test]
    fn the_intercept_model_agrees_with_the_derived_plate_at_a_nonzero_guard_bearing() {
        let scenario = close_duel();
        let fighter = EntityId::new(0, 0);

        // The commanded reach is `GUARD_REACH`, matching what the prediction
        // assumes; a different reach would confound the offset under test.
        let error_at = |bearing: Angle| {
            let mut world = World::new(&scenario, 17);
            let mut command = neutral_articulated_command(&world.observe_articulated(fighter));
            command.arms[0] = ArmTarget {
                bearing, height: CombatHeight::MID, reach: GUARD_REACH, effort: Fx::ONE,
            };
            let _ = world.submit_articulated_v1(fighter, command);
            for _ in 0..400 { world.step(); }
            let obs = world.observe_articulated(fighter);
            assert!(obs.shield.present, "the fighter must be carrying the plate");
            let predicted = predicted_plate_centre(&obs, bearing, obs.shield.centre.z);
            obs.shield.centre - predicted
        };

        let straight = error_at(Angle::ZERO);
        let turned = error_at(GUARD_ARC_UNDER_TEST);

        // The error is a body-frame constant: same vector at both bearings.
        // An implementation that predicted from the wrong reach, or that let
        // the bearing leak into the shoulder term, would fail here.
        let drift = (turned - straight).length();
        assert!(drift <= Fx::from_ratio(1, 64),
            "the intercept model's error moved with the guard bearing: \
             straight {straight:?}, turned {turned:?}, drift {drift:?}");

        // And it is genuinely a shoulder-sized offset rather than zero, so the
        // assertion above cannot be satisfied by a prediction that happens to
        // be exact and therefore proves nothing about the omitted geometry.
        assert!(straight.length() > Fx::ZERO,
            "the prediction became exact; this test no longer bounds the omitted shoulder");
        assert!(straight.length() <= Fx::ONE,
            "the omitted shoulder offset is larger than a whole world unit");
    }

    /// A bearing inside the script's guard arc, written here rather than
    /// imported because `articulated_script::GUARD_ARC` is private to that
    /// module. An eighth turn is what it holds; this test only needs *a*
    /// non-zero bearing the guard can actually reach.
    const GUARD_ARC_UNDER_TEST: Angle = Angle::from_raw(8_192);

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

    fn drive_until_commit(planner: &mut StrikePlanner, world: &mut World, attacker: EntityId) -> StrikePlan {
        for _ in 0..600 {
            for id in world.pending_decisions().to_vec() {
                let obs = world.observe_articulated(id);
                let command = if id == attacker { planner.decide(&obs) } else { neutral_articulated_command(&obs) };
                let _ = world.submit_articulated_v1(id, command);
            }
            let _ = world.step();
            if planner.phase() == TacticalPhase::Commit { return planner.context().plan.unwrap() }
        }
        panic!("planner never committed")
    }

    #[test]
    fn a_stationary_target_is_crossed_by_the_region_the_plan_named() {
        let scenario = close_duel();
        let mut world = World::new(&scenario, 3);
        let attacker = world.alive_ids(Faction::Heroes)[0];
        let mut planner = StrikePlanner::default();
        let mut committed = None;
        for _ in 0..600 {
            for id in world.pending_decisions().to_vec() {
                let obs = world.observe_articulated(id);
                let command = if id == attacker {
                    let command = planner.decide(&obs);
                    if committed.is_none() {
                        if let Some(plan) = planner.context().plan {
                            let foe = *obs.opponents().iter()
                                .find(|row| row.id == plan.opponent).unwrap();
                            committed = Some((obs, plan, foe.regions[plan.region as usize]));
                        }
                    }
                    command
                } else { neutral_articulated_command(&obs) };
                let _ = world.submit_articulated_v1(id, command);
            }
            let _ = world.step();
            if planner.phase() == TacticalPhase::Commit { break }
        }
        let (obs, plan, region) = committed.expect("planner never committed a target geometry");
        assert_eq!(planner.context().plan, Some(plan));
        assert!(candidate_crosses(&obs, plan.hand as usize,
            obs.weapons[plan.hand as usize].unwrap(), region,
            plan.chamber_bearing, plan.commit_bearing, plan.height),
            "the committed plan no longer crosses its cached target geometry");
    }

    #[test]
    fn strike_height_is_the_opponent_region_local_height_under_perception_translation() {
        let mut config = DuelConfigV1::shipped();
        config.fighters[0].spawn = Vec2::new(Fx::from_raw(622_592), Fx::from_raw(458_752));
        config.fighters[1].spawn = Vec2::new(Fx::from_raw(786_432), Fx::from_raw(524_288));
        config.fighters[0].hands[LimbSlot::RightArm as usize].as_mut().unwrap().geometry =
            EquipmentGeometry::Segment {
                length: Fx::from_int(2), radius: Fx::from_ratio(1, 25),
            };
        config.max_ticks = 53;
        let scenario = Scenario::duel_from(&config).unwrap();
        let world = World::new(&scenario, 0);
        let attacker = world.alive_ids(Faction::Heroes)[0];
        let obs = world.observe_articulated(attacker);
        let foe = obs.opponents()[0];
        let region = foe.regions[BodyPart::Legs as usize];
        let region_centre = centre(region).z;

        assert_eq!((obs.standing_height.raw(), foe.body_position.z.raw(),
                    region.lower.z.raw(), region.upper.z.raw(), region_centre.raw()),
                   (117_964, -47_128, -47_128, 11_854, -17_637));
        assert_eq!((region_centre - foe.body_position.z).raw(), 29_491);
        assert_eq!(height_for(&obs, &foe, region).unwrap().raw(), 16_384);
        let old_absolute = (region_centre / obs.standing_height)
            .clamp(Fx::ZERO, Fx::ONE).raw();
        assert_eq!(old_absolute, 0,
            "the old absolute formula no longer discriminates this fixture");

        let translation = Vec3::new(Fx::from_int(3), -Fx::from_int(2), Fx::from_int(7));
        let mut translated_foe = foe;
        translated_foe.body_position += translation;
        let mut translated_region = region;
        translated_region.lower += translation;
        translated_region.upper += translation;
        assert_eq!(height_for(&obs, &translated_foe, translated_region),
                   height_for(&obs, &foe, region));
    }

    #[test]
    fn ordinal_3144_reach_words_drive_prediction_and_submission() {
        assert_eq!((CHAMBER_TICKS, COMMIT_TICKS), (28, 28));
        assert_eq!((STRIKE_CHAMBER_REACH.raw(), STRIKE_COMMIT_REACH.raw()),
                   (65_536, 61_440));
        let scenario = close_duel();
        let world = World::new(&scenario, 3);
        let attacker = world.alive_ids(Faction::Heroes)[0];
        let obs = world.observe_articulated(attacker);
        let foe = obs.opponents()[0];
        let hand = ArmRoles::of(&obs).weapon;
        let toward = planar(foe.body_position - obs.body_position).angle();
        let plan = StrikePlan { opponent: foe.id, region: BodyPart::Torso,
            hand: if hand == 0 { LimbSlot::LeftArm } else { LimbSlot::RightArm },
            chamber_bearing: toward - EIGHTH_TURN,
            commit_bearing: toward + EIGHTH_TURN, height: CombatHeight::MID };
        let weapon = obs.weapons[hand].expect("the selected hand carries the fixture sword");
        let chamber = strike_command(&obs, &foe, plan, TacticalPhase::Chamber);
        let commit = strike_command(&obs, &foe, plan, TacticalPhase::Commit);
        assert_eq!(chamber.arms[hand].reach.raw(), 65_536);
        assert_eq!(commit.arms[hand].reach.raw(), 61_440);
        let predicted_chamber = predicted_segment(&obs, hand, weapon,
            chamber.arms[hand].bearing, chamber.arms[hand].height, chamber.arms[hand].reach);
        let predicted_commit = predicted_segment(&obs, hand, weapon,
            commit.arms[hand].bearing, commit.arms[hand].height, commit.arms[hand].reach);
        let (direct_chamber, direct_commit) = predicted_strike(
            &obs, hand, weapon, plan.chamber_bearing, plan.commit_bearing, plan.height);
        assert_eq!((predicted_chamber, predicted_commit), (direct_chamber, direct_commit));
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
    fn ordinal_3144_keeps_guard_reach_independent_of_strike_reach() {
        let scenario = close_duel();
        let world = World::new(&scenario, 4);
        let id = world.alive_ids(Faction::Heroes)[0];
        let obs = world.observe_articulated(id);
        let foe = obs.opponents()[0];
        let command = intent_command(&obs, &foe, TacticalIntentV1::Guard);
        assert_eq!(command.arms[ArmRoles::of(&obs).guard].reach.raw(), 49_152);
        assert_ne!(GUARD_REACH, STRIKE_CHAMBER_REACH);
        assert_ne!(GUARD_REACH, STRIKE_COMMIT_REACH);
    }

    #[test]
    fn ordinal_3144_mirror_swaps_the_two_eighth_turn_endpoints() {
        let toward = Angle::from_raw(12_345);
        let plain = strike_arcs(toward);
        assert_eq!(plain, [
            (toward - EIGHTH_TURN, toward + EIGHTH_TURN),
            (toward + EIGHTH_TURN, toward - EIGHTH_TURN),
        ]);
        let reflected_toward = -toward;
        let reflected = strike_arcs(reflected_toward);
        assert_eq!(reflected,
                   [(-plain[0].1, -plain[0].0), (-plain[1].1, -plain[1].0)]);
        assert_eq!((STRIKE_CHAMBER_REACH.raw(), STRIKE_COMMIT_REACH.raw(),
                    CombatHeight::MID.raw(), Fx::ONE.raw()),
                   (65_536, 61_440, 32_768, 65_536));
    }

    #[test]
    fn ordinal_3144_phase_boundaries_keep_the_runtime_target() {
        let scenario = close_duel();
        let world = World::new(&scenario, 8);
        let attacker = world.alive_ids(Faction::Heroes)[0];
        let mut obs = world.observe_articulated(attacker);
        let foe = obs.opponents()[0];
        let toward = planar(foe.body_position - obs.body_position).angle();
        let hand = ArmRoles::of(&obs).weapon;
        let plan = StrikePlan { opponent: foe.id, region: BodyPart::Torso,
            hand: if hand == 0 { LimbSlot::LeftArm } else { LimbSlot::RightArm },
            chamber_bearing: toward - EIGHTH_TURN,
            commit_bearing: toward + EIGHTH_TURN, height: CombatHeight::MID };
        let mut planner = StrikePlanner { phase: TacticalPhase::Chamber, plan: Some(plan),
            phase_started: 0, intent: Some(TacticalIntentV1::StrikeBest),
            ..StrikePlanner::default() };
        obs.tick = 27;
        let chamber = planner.decide(&obs);
        assert_eq!((planner.phase(), chamber.intent, chamber.arms[hand].reach.raw()),
                   (TacticalPhase::Chamber, Intent::Attack(foe.id), 65_536));
        obs.tick = 28;
        let commit = planner.decide(&obs);
        assert_eq!((planner.phase(), commit.intent, commit.arms[hand].reach.raw()),
                   (TacticalPhase::Commit, Intent::Attack(foe.id), 61_440));
        obs.tick = 55;
        assert_eq!(planner.decide(&obs).arms[hand].reach.raw(), 61_440);
        obs.tick = 56;
        let recover = planner.decide(&obs);
        assert_eq!((planner.phase(), recover.intent),
                   (TacticalPhase::Recover, Intent::Attack(foe.id)));
    }

    #[test]
    fn ordinal_3144_keeps_the_generic_feet_fallback() {
        let scenario = close_duel();
        let world = World::new(&scenario, 9);
        let id = world.alive_ids(Faction::Heroes)[0];
        let mut obs = world.observe_articulated(id);
        let foe = obs.opponents()[0];
        obs.weapons = [None, None];
        let mut planner = StrikePlanner::default();
        let command = planner.decide(&obs);
        let toward = planar(foe.body_position - obs.body_position).angle();
        assert_eq!(command.intent, Intent::Attack(foe.id));
        assert_eq!(command.body_yaw, toward);
        assert_eq!(command.move_dir, Vec2::new(
            toward.cos() * APPROACH_SPEED, toward.sin() * APPROACH_SPEED));
        assert_eq!(planner.context().plan, None);
    }

    #[test]
    fn a_committed_attack_is_not_replanned_mid_swing() {
        let scenario = close_duel();
        let mut world = World::new(&scenario, 4);
        let attacker = world.alive_ids(Faction::Heroes)[0];
        let mut planner = StrikePlanner::default();
        let locked = drive_until_commit(&mut planner, &mut world, attacker);
        for tick in 0..10 {
            let mut obs = world.observe_articulated(attacker);
            obs.tick += tick;
            obs.opponents[0].regions[locked.region as usize].present = false;
            let _ = planner.decide(&obs);
            assert_eq!(planner.context().plan, Some(locked));
        }
    }

    #[test]
    fn an_incoming_sweep_is_guarded_when_coverage_arrives_first() {
        let (_, mut obs) = threat_pair(Fx::ONE, Fx::ZERO);
        let foe = obs.opponents[0];
        let toward = planar(foe.body_position - obs.body_position).angle();
        let centre = obs.body_position
            + Vec3::new(toward.cos(), toward.sin(), Fx::ZERO)
                * (obs.arm_length * GUARD_REACH)
            + Vec3::Z * (obs.standing_height * Fx::HALF);
        obs.shield.present = true;
        obs.shield.centre = centre;
        obs.shield.half_width = Fx::from_ratio(1, 2);
        obs.shield.half_height = Fx::from_ratio(1, 2);
        let crossing = SegmentPose {
            hilt: centre - Vec3::Y,
            tip: centre + Vec3::Y,
            radius: Fx::from_ratio(1, 20),
        };
        let threat = ThreatAssessmentV1 {
            opponent: foe.id, hand: LimbSlot::RightArm, closing_speed: Fx::ONE,
            ticks_to_crossing: Fx::ONE, crossing_height: CombatHeight::MID,
        };
        let target_lower = centre - Vec3::Z * obs.shield.half_height;
        let target_upper = centre + Vec3::Z * obs.shield.half_height;
        assert!(closest_points_on_segments(
            target_lower, target_upper, crossing.hilt, crossing.tip,
        ).distance_sq <= (obs.shield.half_width + crossing.radius)
            * (obs.shield.half_width + crossing.radius));
        assert!(can_cover(&obs, threat, crossing));

        obs.shield.centre -= Vec3::X * Fx::from_int(4);
        let travel = obs.shield.centre.distance(centre);
        assert!(travel / GUARD_LINEAR_SPEED > threat.ticks_to_crossing);
        assert!(!can_cover(&obs, threat, crossing));
    }

    #[test]
    fn threat_timing_names_the_first_predicted_crossing_tick() {
        let (before, now) = threat_pair(Fx::ONE, Fx::ZERO);
        let current = now.opponents[0].weapons[1].unwrap();
        let step = current.hilt - before.opponents[0].weapons[1].unwrap().hilt;
        let lower = now.body_position + Vec3::Z
            * (now.standing_height * Fx::from_ratio(1, 4));
        let upper = now.body_position + Vec3::Z
            * (now.standing_height * Fx::from_ratio(3, 4));
        let radius = now.hand_radius * Fx::TWO;
        let projected = |ticks: i32| SegmentPose {
            hilt: current.hilt + step * Fx::from_int(ticks),
            tip: current.tip + step * Fx::from_int(ticks),
            radius: current.radius,
        };
        let two = projected(2);
        let three = projected(3);
        assert!(swept_segment_segment(
            projected(1).hilt, projected(1).tip, two.hilt, two.tip, current.radius,
            lower, upper, lower, upper, radius,
        ).is_none());
        assert!(swept_segment_segment(
            two.hilt, two.tip, three.hilt, three.tip, current.radius,
            lower, upper, lower, upper, radius,
        ).is_some());
        let prior = PreviousOpponent {
            subject: before.subject, opponent: before.opponents[0].id, tick: before.tick,
            weapons: before.opponents[0].weapons,
            body_position: before.opponents[0].body_position,
        };
        let (threat, _) = assess_threat(&now, &now.opponents[0], prior, Fx::ONE)
            .expect("the independently crossed segment is a threat");
        assert_eq!(threat.ticks_to_crossing, Fx::from_int(3));
    }

    #[test]
    fn an_uncoverable_sweep_is_evaded_to_the_farther_side() {
        let (_, obs) = threat_pair(Fx::ONE, Fx::from_ratio(1, 4));
        let crossing = obs.opponents[0].weapons[1].unwrap();
        let toward = planar(obs.opponents[0].body_position - obs.body_position);
        let side = Vec2::new(-toward.y, toward.x).normalize();
        let offset = Vec3::new(side.x, side.y, Fx::ZERO) * obs.arm_length;
        let lower = Vec3::Z * (obs.standing_height * Fx::from_ratio(1, 4));
        let upper = Vec3::Z * (obs.standing_height * Fx::from_ratio(3, 4));
        let left = closest_points_on_segments(
            crossing.hilt, crossing.tip,
            obs.body_position + offset + lower, obs.body_position + offset + upper,
        ).distance_sq;
        let right = closest_points_on_segments(
            crossing.hilt, crossing.tip,
            obs.body_position - offset + lower, obs.body_position - offset + upper,
        ).distance_sq;
        assert!(right > left, "fixture does not make the right evade safer");
        assert_eq!(evade_intent(&obs, crossing), TacticalIntentV1::EvadeRight);

        let centred = SegmentPose {
            hilt: crossing.hilt - Vec3::Y * Fx::from_ratio(1, 4),
            tip: crossing.tip - Vec3::Y * Fx::from_ratio(1, 4),
            radius: crossing.radius,
        };
        let (left, right) = evade_miss_distances(&obs, centred);
        assert_eq!(left, right, "fixture does not exercise the left tie-break");
        assert_eq!(evade_intent(&obs, centred), TacticalIntentV1::EvadeLeft);
    }

    #[test]
    fn mirrored_threats_produce_mirrored_defences() {
        let (_, now_left) = threat_pair(Fx::ONE, Fx::from_ratio(1, 4));
        let (_, now_right) = threat_pair(Fx::ONE, Fx::from_ratio(-1, 4));
        let left = evade_intent(&now_left, now_left.opponents[0].weapons[1].unwrap());
        let right = evade_intent(&now_right, now_right.opponents[0].weapons[1].unwrap());
        let centre_y = |obs: &ArticulatedObservation|
            (obs.opponents[0].weapons[1].unwrap().hilt.y
                + obs.opponents[0].weapons[1].unwrap().tip.y) * Fx::HALF;
        assert!(centre_y(&now_left) > now_left.body_position.y);
        assert!(centre_y(&now_right) < now_right.body_position.y);
        assert!(matches!(left, TacticalIntentV1::EvadeLeft | TacticalIntentV1::EvadeRight));
        assert!(matches!(right, TacticalIntentV1::EvadeLeft | TacticalIntentV1::EvadeRight));
        assert_ne!(left, right, "the reflected threat chose the same world-side step");
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
    fn tactical_indices_are_stable_for_the_learning_boundary() {
        assert_eq!(TACTICAL_PHASE_COUNT, 5);
        assert_eq!(TACTICAL_INTENT_COUNT, 8);
        assert_eq!(TacticalPhase::Recover.index(), 4);
        assert_eq!(TacticalIntentV1::Disengage.index(), 7);
    }

    #[test]
    fn mirrored_observations_produce_mirrored_strikes() {
        let scenario = close_duel();
        let mut world = World::new(&scenario, 5);
        let attacker = world.alive_ids(Faction::Heroes)[0];
        let mut planner = StrikePlanner::default();
        let (obs, plan) = loop {
            let obs = world.observe_articulated(attacker);
            if let Some(plan) = choose_plan(&obs, &obs.opponents()[0], TacticalIntentV1::StrikeBest,
                PlanScoring::NearestRegion) {
                break (obs, plan);
            }
            for id in world.pending_decisions().to_vec() {
                let row = world.observe_articulated(id);
                let command = if id == attacker { planner.decide(&row) } else { neutral_articulated_command(&row) };
                let _ = world.submit_articulated_v1(id, command);
            }
            let _ = world.step();
            assert!(world.tick() < 300, "no reachable mirrored-plan fixture");
        };
        let mut mirrored = obs;
        let axis = Fx::from_int(16);
        mirrored.body_position.y = axis - mirrored.body_position.y;
        for arm in &mut mirrored.arms {
            arm.hand.y = axis - arm.hand.y;
            arm.target_hand.y = axis - arm.target_hand.y;
            arm.velocity.y = -arm.velocity.y;
        }
        for weapon in mirrored.weapons.iter_mut().flatten() {
            weapon.hilt.y = axis - weapon.hilt.y; weapon.tip.y = axis - weapon.tip.y;
        }
        for opponent in &mut mirrored.opponents[..mirrored.opponent_count as usize] {
            opponent.body_position.y = axis - opponent.body_position.y;
            opponent.body_velocity.y = -opponent.body_velocity.y;
            for region in &mut opponent.regions {
                region.lower.y = axis - region.lower.y;
                region.upper.y = axis - region.upper.y;
            }
        }
        let reflected = choose_plan(&mirrored, &mirrored.opponents()[0],
            TacticalIntentV1::StrikeBest, PlanScoring::NearestRegion).unwrap();
        assert_eq!((reflected.region, reflected.hand, reflected.height), (plan.region, plan.hand, plan.height));
        // The raw-bearing final tie break is deliberately global rather than
        // handed: on a line lying exactly on the mirror axis it may reverse
        // which endpoint is chamber and which is commit. The swept geometric
        // path is nevertheless the exact reflection and names the same body.
        assert_eq!(reflected.chamber_bearing, -plan.commit_bearing);
        assert_eq!(reflected.commit_bearing, -plan.chamber_bearing);
    }

    #[test]
    fn an_unreachable_head_is_rejected_before_a_command_is_submitted() {
        let scenario = close_duel();
        let world = World::new(&scenario, 6);
        let attacker = world.alive_ids(Faction::Heroes)[0];
        let mut obs = world.observe_articulated(attacker);
        for part in BodyPart::ALL { obs.opponents[0].regions[part as usize].present = part == BodyPart::Head; }
        obs.opponents[0].regions[BodyPart::Head as usize].lower.z = Fx::from_int(20);
        obs.opponents[0].regions[BodyPart::Head as usize].upper.z = Fx::from_int(20);
        assert!(choose_plan(&obs, &obs.opponents()[0], TacticalIntentV1::StrikeBest,
                PlanScoring::NearestRegion).is_none());
    }

    #[test]
    fn reset_forgets_the_previous_fight() {
        let mut planner = StrikePlanner::default();
        planner.phase = TacticalPhase::Commit;
        planner.intent = Some(TacticalIntentV1::StrikeBest);
        planner.reset();
        assert_eq!(planner.context(), TacticalContextV1 {
            phase: TacticalPhase::Seek, plan: None, threat: None, opponent_recovering: false,
        });
        assert!(planner.can_sample_intent());
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

    #[test]
    fn seek_advances_along_own_facing_without_hidden_opponent_state() {
        let scenario = close_duel();
        let world = World::new(&scenario, 29);
        let id = world.alive_ids(Faction::Heroes)[0];
        let mut obs = world.observe_articulated(id);
        obs.opponent_count = 0;
        obs.opponents = [ObservedOpponent::BLANK; sim::MAX_ARTICULATED_OPPONENTS];
        let mut planner = StrikePlanner::default();
        let command = planner.decide(&obs);
        assert_eq!(planner.phase(), TacticalPhase::Seek);
        assert_eq!(command.body_yaw, obs.body_yaw);
        assert_eq!(command.move_dir,
            Vec2::new(obs.body_yaw.cos(), obs.body_yaw.sin()) * APPROACH_SPEED);
        assert_eq!(command.intent, Intent::Hold);
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
    fn an_openings_planner_avoids_the_region_the_plate_already_covers() {
        // **The mechanical claim**, stated without hard-coding the fixture's
        // geometry: whatever the nearest-region rule would take, putting the
        // plate on it must make the openings rule take something else.
        //
        // Derived rather than asserted, because which region is nearest is a
        // fact about spawn positions and anatomy rows that a future fixture
        // tweak would silently invert -- and a test that then quietly compared
        // two identical answers would still pass.
        let (obs, bare) = plated_at(BodyPart::Torso);
        let mut bare = bare;
        bare.shield = sim::ObservedShield::BLANK;

        // With no plate the two rules must agree exactly: the difference below
        // is then the plate and not the rewrite.
        let nearest = choose_plan(&obs, &bare, TacticalIntentV1::StrikeBest,
            PlanScoring::NearestRegion).expect("a reachable region");
        assert_eq!(
            Some(nearest),
            choose_plan(&obs, &bare, TacticalIntentV1::StrikeBest, PlanScoring::UncoveredRegion),
            "the two scorings disagree on a body carrying no plate",
        );

        let (_, covered_foe) = plated_at(nearest.region);
        assert!(
            candidate_covered_anywhere(&obs, &covered_foe, nearest.region),
            "the fixture's plate does not cover {:?}, so this test proves nothing",
            nearest.region,
        );
        let openings = choose_plan(&obs, &covered_foe, TacticalIntentV1::StrikeBest,
            PlanScoring::UncoveredRegion).expect("a reachable region");
        assert_ne!(openings.region, nearest.region,
            "the openings scoring took the region the plate covers anyway");
        assert!(
            !candidate_covered_anywhere(&obs, &covered_foe, openings.region),
            "the openings scoring moved to {:?}, which the plate also covers",
            openings.region,
        );

        // And the nearest-region rule is unmoved by the very same plate, which
        // is what says this is a scoring change and not a geometry change.
        assert_eq!(
            choose_plan(&obs, &covered_foe, TacticalIntentV1::StrikeBest,
                PlanScoring::NearestRegion).map(|plan| plan.region),
            Some(nearest.region),
            "the plate moved what nearest-region chooses, so the control is not a control",
        );
    }

    /// Whether *any* candidate sweep at this region is covered, which is the
    /// question the fixture assertion above needs and `choose_plan` asks per
    /// candidate.
    fn candidate_covered_anywhere(
        obs: &ArticulatedObservation,
        foe: &ObservedOpponent,
        part: BodyPart,
    ) -> bool {
        let toward = planar(foe.body_position - obs.body_position).angle();
        let region = foe.regions[part as usize];
        let Some(height) = height_for(obs, foe, region) else { return false };
        for hand in [LimbSlot::LeftArm, LimbSlot::RightArm] {
            let at = hand as usize;
            let Some(weapon) = obs.weapons[at] else { continue };
            for (chamber, commit) in strike_arcs(toward) {
                if candidate_crosses(obs, at, weapon, region, chamber, commit, height)
                    && candidate_covered(obs, foe, at, weapon, chamber, commit, height)
                {
                    return true;
                }
            }
        }
        false
    }

    #[test]
    fn a_fully_covered_body_still_produces_a_plan_rather_than_a_pacifist() {
        // The reason the scoring is a preference and not a filter. A plate large
        // enough to cover everything must not turn the attacker into a body that
        // walks forward for ever -- `decide_with_intent` answers a missing plan
        // with footwork, so a filter would read as "the guard is so good the
        // attacker gave up", which is a bug wearing the costume of a tactic.
        let (obs, mut foe) = plated_at(BodyPart::Torso);
        foe.shield.half_width = Fx::from_int(4);
        foe.shield.half_height = Fx::from_int(4);
        let plan = choose_plan(&obs, &foe, TacticalIntentV1::StrikeBest,
            PlanScoring::UncoveredRegion);
        assert!(plan.is_some(), "a fully covered body produced no plan at all");
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
}
