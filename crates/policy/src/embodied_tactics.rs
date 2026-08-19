//! The strike planner, driving a body whose arms are read from its own torso.
//!
//! **A shared planner and a forked assembly**, which looks like it contradicts
//! the decision `embodied_script.rs` records in its own header -- that the
//! embodied script is a *sibling* of the articulated one and deliberately not a
//! mode of it -- and does not.
//!
//! That argument was about a file whose every output is a bearing. There, a
//! frame flag would make "which frame is this" a runtime question in the one
//! place the wrong answer is invisible: nothing refuses a command that swings at
//! the map's north instead of at an opponent. [`StrikePlanner`] outputs no
//! bearing at all. It reads `ObservedOpponent::regions` -- five swept volumes in
//! world space -- and `weapons` as world-space segment poses, translates the
//! observed weapon by a candidate hand displacement, and asks
//! `fx::swept_segment_segment` whether that capsule crosses a named `BodyPart`.
//! Every quantity in that computation is a world quantity measured off the
//! observation, and the observation is the *same type* on both seams:
//! [`crate::EmbodiedPolicy::decide`] and [`crate::ArticulatedPolicy::decide`]
//! both take `&ArticulatedObservation`. Nothing in the planning knows or cares
//! which model published it.
//!
//! What is frame-bound is the command assembly downstream of the plan -- the
//! functions that write `ArmTarget::bearing` and `move_dir` as *world*
//! quantities because that is what `CombatModel::command_frame` says
//! `CommandFrame::World` means. So the frame enters this file exactly once, in
//! [`into_torso_frame`], where it is four lines and can be tested directly.
//!
//! The swing plane is left neutral on both arms, deliberately and not by
//! omission: the neutral plane puts the elbow below the shoulder-to-hand line
//! and the forearm under the blade rather than leading it into the target, which
//! is the reading `embodied_script.rs` already argued for the weapon arm. The
//! guard arm's plane is a *decision* rather than a default and belongs to the
//! session that makes it.
//!
//! **It is still owed, and the session that gave this policy a guard did not
//! pay it.** [`crate::GuardRead`] decides the guard arm's bearing, height and
//! reach; it leaves the plane at zero on purpose, because the measurement that
//! session ran is the read guard against the *same* guard with the read
//! switched off, and a plane folded in on one arm of that comparison and not
//! the other would have made the difference two things.
//!
//! **The planner and its four command builders now live in this file.** They
//! were written in `articulated_tactics.rs`, which session 05 deletes, and this
//! is the only caller left. Nothing above changes: the builders still write
//! world quantities, [`into_torso_frame`] is still the one place the frame
//! enters, and the move was a move rather than a rewrite -- which is what the
//! planner's own tests, carried across unedited, are here to say.

use crate::{neutral_articulated_command, ArmRoles, EmbodiedPolicy, Footwork, GuardRead, EIGHTH_TURN};
use fx::{closest_points_on_segments, swept_segment_segment, Angle, Fx, Vec2, Vec3};
use sim::{
    ArmTarget, ArticulatedCommandV1, ArticulatedObservation, BodyPart, CombatHeight,
    EmbodiedCommandV1, EntityId, Intent, LimbSlot, ObservedOpponent, RegionVolume, SegmentPose,
};

/// The registry code. Append-only after `scripted-level`.
pub const TACTICAL_EMBODIED_POLICY_CODE: u32 = 3;

/// Rotates a world vector into the frame of a body holding `yaw`.
///
/// **The exact inverse of `World::world_move_dir`'s torso branch**, written as
/// the inverse rather than derived again, so that the two cannot drift apart by
/// one sign. A command that survives a round trip through both is the property
/// `a_world_vector_survives_the_round_trip` asserts.
///
/// Public because that test lives in `crates/policy/tests/embodied_tactics.rs`
/// and the round trip is not observable from [`TacticalEmbodiedPolicy::decide`]:
/// by the time a command leaves `decide` the world quantity it was rotated from
/// is gone, and a test that re-derived it would be testing its own arithmetic.
pub fn into_torso(v: Vec2, yaw: Angle) -> Vec2 {
    let (cos, sin) = (yaw.cos(), yaw.sin());
    Vec2::new(v.x * cos + v.y * sin, -v.x * sin + v.y * cos)
}

/// Reads a world-frame articulated command as the embodied command that asks for
/// the same thing.
///
/// **Measured from `obs.body_yaw`, and not from the yaw the command requests.**
/// This is the sign the adapter exists to get right, and the tempting answer is
/// the wrong one. `World::world_arm_target` adds `self.body_yaw[i].angle` -- the
/// yaw the body *is holding at submission* -- and `World::world_move_dir` mixes
/// with the same field. `ArticulatedObservation::body_yaw` is built from that
/// field, so subtracting it is the exact inverse of what the world will re-add,
/// and the round trip is an identity. Subtracting the *commanded* yaw is not:
/// `ArticulatedCommandV1::body_yaw` is a request the actuator chases at a
/// bounded rate, so on any tick that asks for a turn the body does not arrive
/// there, and every arm bearing lands short by the whole turn angle -- including
/// the guard arm the planner never touched.
///
/// `body_yaw` itself is copied through untouched, because it is the one column
/// that is absolute under both frames: it is what the actuator chases, not
/// something read relative to where the chase has got to.
pub fn into_torso_frame(
    obs: &ArticulatedObservation,
    world: ArticulatedCommandV1,
) -> EmbodiedCommandV1 {
    let facing = obs.body_yaw;
    let mut out = world;
    out.move_dir = into_torso(world.move_dir, facing);
    for arm in 0..2 {
        out.arms[arm].bearing = world.arms[arm].bearing - facing;
    }
    EmbodiedCommandV1::new(out)
}

/// The registry code for the fixed-guard control. Append-only after `tactical`.
pub const FIXED_GUARD_EMBODIED_POLICY_CODE: u32 = 4;

/// Whether the guard arm reads the incoming blade.
///
/// **A parameter and not a global**, on `EmbodiedScriptConfig`'s argument
/// exactly: the measurement runs this policy against itself with the term
/// disabled, and two builds of one library that differ by a `static` cannot be
/// run against each other in one process at all. It is a struct with one field
/// rather than a bare `bool` for that file's second reason -- the day a second
/// term needs the same treatment the call sites do not change shape, and nobody
/// has to remember which of two positional booleans is which.
///
/// The comparison is not bracketed. A win rate over a fixed seed set is a pure
/// function of the two policies and the fixture; what the repetitions cancel is
/// the arena and the anatomy, not noise.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct TacticalConfig {
    /// With this `false` the guard arm still holds a guard -- same arm, same
    /// reach, same effort -- permanently on the body's own centre line. The
    /// control is deliberately *a guard that does not read* rather than *no
    /// guard*, so the measured difference is the read and cannot be "one policy
    /// has an arm up and the other does not".
    pub read_guard: bool,
}

impl TacticalConfig {
    /// The shipped policy: it reads the blade.
    pub const READING: TacticalConfig = TacticalConfig { read_guard: true };

    /// The control: a guard on the centre line, whatever is coming.
    pub const FIXED_GUARD: TacticalConfig = TacticalConfig { read_guard: false };
}

impl Default for TacticalConfig {
    fn default() -> TacticalConfig { TacticalConfig::READING }
}

/// The strike planner behind the embodied seam, with a guard that watches.
///
/// **What it does not know is hips.** The planner was written against
/// articulated bodies with no stance; an embodied body has a torso the hips
/// constrain and a twist budget that forces a step. It will therefore ask for
/// turns the stance phase clamps, and a clamped turn is a plan arriving late.
/// That is expected rather than a defect of this adapter, and it is *measured*
/// rather than guessed -- `docs/performance/embodied-tactical-policy.md` records
/// the corpus this policy scored on its first outing, so a session that tunes
/// against it is tuning against a number and not a memory.
///
/// **The guard is written after the frame conversion and not before it**, which
/// is the one ordering decision this type makes. [`GuardRead`] answers in the
/// torso frame -- zero bearing is the body's own facing, which is the whole
/// simplification that frame buys -- so converting its answer a second time
/// would subtract the yaw twice and point the plate a whole facing off the line
/// it was aimed at.
#[derive(Clone, Copy, Debug)]
pub struct TacticalEmbodiedPolicy {
    planner: StrikePlanner,
    guard: GuardRead,
}

/// **A hand-written `Default` and not a derive**, which is the same trap
/// [`GuardRead::reset`] documents one file over. `StrikePlanner::default()` is
/// the *articulated* footwork row, deliberately, so that every pinned
/// articulated measurement keeps the planner it was taken with -- and a derived
/// `Default` here would have silently handed the embodied policy that row, in
/// the twenty-odd tests that construct it that way and nowhere a reader would
/// look. It is `new(TacticalConfig::default())` and nothing else.
impl Default for TacticalEmbodiedPolicy {
    fn default() -> TacticalEmbodiedPolicy {
        TacticalEmbodiedPolicy::new(TacticalConfig::default())
    }
}

impl TacticalEmbodiedPolicy {
    pub fn new(config: TacticalConfig) -> TacticalEmbodiedPolicy {
        TacticalEmbodiedPolicy::with_footwork(config, Footwork::EMBODIED)
    }

    /// The same policy with its planner's feet told a row of somebody's
    /// choosing, which is how every sweep table in
    /// `docs/performance/embodied-tactical-policy.md` is produced.
    ///
    /// **This exists because the alternative was a rebuild per row**, and a
    /// measurement nobody can re-run from a shipped command is a measurement
    /// that will be quoted long after it stopped being true. Session 04 swept
    /// four constants by editing [`Footwork::EMBODIED`] and rebuilding, and the
    /// review that followed could not reproduce a single one of its tables
    /// without doing the same. `lab embodied --footwork` reaches this.
    ///
    /// It is not a default worth taking: [`Footwork::EMBODIED`] is the shipped
    /// row and [`TacticalEmbodiedPolicy::new`] is what the registry builds.
    pub fn with_footwork(
        config: TacticalConfig,
        footwork: Footwork,
    ) -> TacticalEmbodiedPolicy {
        TacticalEmbodiedPolicy {
            planner: StrikePlanner::footwork(footwork),
            guard: GuardRead::new(config.read_guard),
        }
    }

    pub fn planner(&self) -> &StrikePlanner { &self.planner }

    /// What the guard has decided. Public so a test can say *which* rule moved
    /// an arm rather than only that one did.
    pub fn guard(&self) -> &GuardRead { &self.guard }

    pub fn config(&self) -> TacticalConfig {
        TacticalConfig { read_guard: self.guard.reads() }
    }
}

impl EmbodiedPolicy for TacticalEmbodiedPolicy {
    fn decide(&mut self, obs: &ArticulatedObservation) -> EmbodiedCommandV1 {
        let mut command = into_torso_frame(obs, self.planner.decide(obs));
        if let Some(guard) = self.guard.decide(obs, &self.planner) {
            command.articulated.arms[guard.arm] = guard.target;
        }
        command
    }

    /// The planner's fight and the guard's memory both go; the guard's
    /// *configuration* stays, on `StrikePlanner::reset`'s precedent. A reset
    /// that restored `Default` wholesale would demote every seed after the first
    /// to a policy nobody selected, and here that policy would be the subject
    /// standing in for the control.
    fn reset(&mut self) {
        self.planner.reset();
        self.guard.reset();
    }
}

// ------------------------------------------------------------- the strike planner
//
// Everything below arrived from `articulated_tactics.rs` in session 05, byte for
// byte. Some of it is `pub(crate)` rather than private only because the three
// articulated policies that also drive it have not been deleted yet; when they
// go, so does the wider visibility.

pub(crate) const CHAMBER_TICKS: u32 = 28;
pub(crate) const COMMIT_TICKS: u32 = 28;
const RECOVER_TICKS: u32 = 24;
const APPROACH_SPEED: Fx = Fx::from_ratio(15, 16);
const WITHDRAW_SPEED: Fx = Fx::HALF;
// The two measure numbers used to be `const`s here. They are configuration now
// and live on [`Footwork`], because this planner drives two seams and only one
// of them was retuned; `Footwork::ARTICULATED` is the articulated seam's own
// pair, unchanged, and `StrikePlanner::default()` still carries it.
const GUARD_REACH: Fx = Fx::from_ratio(3, 4);
pub(crate) const STRIKE_CHAMBER_REACH: Fx = Fx::ONE;
pub(crate) const STRIKE_COMMIT_REACH: Fx = Fx::from_raw(61_440);
const THREAT_LOOKAHEAD_TICKS: u32 = 32;
// The production actuator's published base linear maximum. A guard estimate
// must price the distance from its observed pose rather than grant every hand
// the same twenty-two-tick teleport.
const GUARD_LINEAR_SPEED: Fx = Fx::from_raw(1_638);
const RECOVERY_MIN_STEP: Fx = Fx::from_ratio(1, 500);

pub const TACTICAL_PHASE_COUNT: usize = 5;
pub const TACTICAL_INTENT_COUNT: usize = 8;
pub const ROBUST_STRIKE_TICKS: u32 = CHAMBER_TICKS + COMMIT_TICKS;
pub const ROBUST_STRIKE_HEIGHT: CombatHeight =
    CombatHeight::try_from_raw(16_384).expect("the Brute Legs centre is one quarter of Fighter height");

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
pub(crate) struct PreviousOpponent {
    pub(crate) subject: EntityId,
    pub(crate) opponent: EntityId,
    pub(crate) tick: u32,
    pub(crate) weapons: [Option<SegmentPose>; 2],
    pub(crate) body_position: Vec3,
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
    pub(crate) threat_crossing: Option<SegmentPose>,
    opponent_recovering: bool,
    pub(crate) scoring: PlanScoring,
    pub(crate) footwork: Footwork,
}

impl Default for StrikePlanner {
    fn default() -> Self {
        Self {
            phase: TacticalPhase::Seek, plan: None, phase_started: 0, intent: None,
            previous: None, observed_tick: None, threat: None, threat_crossing: None,
            opponent_recovering: false, scoring: PlanScoring::NearestRegion,
            footwork: Footwork::ARTICULATED,
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

    /// The same planner with its feet told something else.
    ///
    /// A constructor rather than a setter, on [`StrikePlanner::scoring`]'s
    /// argument exactly, and configuration that survives
    /// [`StrikePlanner::reset`] for its reason: a corpus runner resets between
    /// seeds, and a reset that restored `Default` wholesale would quietly demote
    /// every seed after the first to the articulated row -- which is a corpus
    /// measuring a policy nobody selected.
    pub fn footwork(footwork: Footwork) -> Self {
        Self { footwork, ..Self::default() }
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
    /// `an_openings_planner_keeps_its_scoring_across_a_reset` holds it. The
    /// footwork row rides along for the same reason, held by
    /// `an_embodied_planner_keeps_its_footwork_across_a_reset`.
    pub fn reset(&mut self) {
        *self = Self { scoring: self.scoring, footwork: self.footwork, ..Self::default() };
    }

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
                if !in_measure(obs, foe, plan.hand, self.footwork) {
                    return measure_command(obs, foe, toward, plan.hand, self.footwork);
                }
                self.plan = Some(plan);
                self.phase = TacticalPhase::Chamber;
                self.phase_started = obs.tick;
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

        strike_command(obs, foe, plan, self.phase, self.footwork, unwinding(obs, self.footwork))
    }
}

/// Whether the torso has spent its twist budget and needs a foot down.
///
/// **Gated on `ObservedStance::present`, which is the whole of the degradation
/// onto a model without legs** -- `embodied_script.rs` spends the same line for
/// the same reason, and names the trap: a `twist_fraction` of zero is the one
/// value that means nothing is wrong, so an ungated read is indistinguishable
/// from a squared, standing body and would never fire. On an articulated world
/// the column is absent and this is always false, which is why
/// `Footwork::ARTICULATED` carries an unwind threshold it can never reach.
fn unwinding(obs: &ArticulatedObservation, footwork: Footwork) -> bool {
    obs.stance.present && obs.stance.twist_fraction.abs() >= footwork.unwind_twist
}

pub(crate) fn weapon_is_withdrawing(
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

pub(crate) fn assess_threat(
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

pub(crate) fn can_cover(
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

pub(crate) fn evade_intent(obs: &ArticulatedObservation, crossing: SegmentPose) -> TacticalIntentV1 {
    let (left, right) = evade_miss_distances(obs, crossing);
    if left >= right { TacticalIntentV1::EvadeLeft } else { TacticalIntentV1::EvadeRight }
}

fn matching_opponent<'a>(
    obs: &'a ArticulatedObservation,
    plan: Option<StrikePlan>,
) -> Option<&'a ObservedOpponent> {
    let id = plan?.opponent;
    obs.opponents().iter().find(|foe| foe.id == id)
}

fn planar(v: Vec3) -> Vec2 { Vec2::new(v.x, v.y) }

pub(crate) fn centre(region: RegionVolume) -> Vec3 {
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

fn in_measure(
    obs: &ArticulatedObservation,
    foe: &ObservedOpponent,
    hand: LimbSlot,
    footwork: Footwork,
) -> bool {
    let Some(weapon) = obs.weapons[hand as usize] else { return false };
    let blade = weapon.tip.distance(weapon.hilt);
    let distance = planar(foe.body_position - obs.body_position).length();
    let reach = obs.arm_length + blade;
    distance >= reach * footwork.min_fraction && distance <= reach + footwork.margin
}

fn measure_command(
    obs: &ArticulatedObservation,
    foe: &ObservedOpponent,
    toward: Angle,
    hand: LimbSlot,
    footwork: Footwork,
) -> ArticulatedCommandV1 {
    let Some(weapon) = obs.weapons[hand as usize] else {
        return feet_command(obs, foe, toward, APPROACH_SPEED);
    };
    let reach = obs.arm_length + weapon.tip.distance(weapon.hilt);
    let distance = planar(foe.body_position - obs.body_position).length();
    if distance < reach * footwork.min_fraction {
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
    footwork: Footwork,
    unwinding: bool,
) -> ArticulatedCommandV1 {
    let mut command = neutral_articulated_command(obs);
    let toward = planar(foe.body_position - obs.body_position).angle();
    command.body_yaw = toward;
    // **The twist budget, spent rather than waited out**, and what this line
    // buys is one branch of `World::drive_stance` and not the step.
    //
    // It writes a `move_dir`, so `translating` there becomes true, so the hips
    // turn at `STANCE_HIP_MOVING_SPEED_RAW` instead of
    // `STANCE_HIP_STANDING_SPEED_RAW` -- twice the rate. That is the whole of
    // the mechanical gain: a wound-up torso unwinds by having its hips catch
    // up, and a planted body's hips catch up at half speed. The body also
    // translates, which is a real cost and is why this is spent on the chamber
    // alone.
    //
    // **Two things it does not do**, both of which an earlier draft of this
    // comment claimed. It does not *arm* a step: `drive_stance` arms one from
    // `want != held` alone -- a turn the budget refused -- and a planner cannot
    // reach that flag from here. And it does not move `hip_target`: that is
    // `move_dir.angle()` while translating and `body_yaw` while planted, and the
    // vector written below is along `body_yaw`, so the hips are already
    // chasing exactly this angle. Direction is not what changes; rate is.
    //
    // `command.body_yaw` above is deliberately left asking for the whole turn.
    // `drive_stance` re-arms its step for as long as the request exceeds the
    // budget, so a planner that backed its own request off to something
    // reachable would end that step early and leave the twist where it was.
    if unwinding {
        command.move_dir = Vec2::new(obs.body_yaw.cos(), obs.body_yaw.sin()) * APPROACH_SPEED;
    }
    // **The lunge: the commit crosses measure and the recovery leaves it**, and
    // it is written after the unwind above rather than before it because a body
    // cannot step two ways in one tick. The commit and the recovery already have
    // a job for the feet, so the unwinding step is spent on the chamber alone --
    // the one phase of a strike with feet to spare. That is an ordering and not
    // a rule, and it is the reason there is no third branch here.
    //
    // This is the one thing on this file's list of session-04 changes that the
    // session plan did not enumerate, and it is the plan's own thesis sentence:
    // *"a fighter that holds measure, then crosses it once at speed, converts
    // 1,566 worthless facts into a handful of expensive ones."* Crossing measure
    // is something the feet do. Until this line the planner planted them for all
    // 80 ticks of chamber, commit and recovery, so its blade carried the arm's
    // sweep and nothing else -- and `embodied_script.rs` records the same
    // correction, made the same way and paid for by the articulated corpus:
    // "`AttackFootwork::Planted` ... a body decays to a standstill in about
    // fourteen ticks with `move_dir` zero, and the arm term alone could not
    // reach `CONTACT_ENERGY_FLOOR`".
    //
    // One speed and not two, spent forward and then taken back, because the
    // lunge and its recovery are one decision: a step that is worth making into
    // the exchange is worth unmaking out of it, and a second constant would be a
    // second sweep for a number the first one already fixes. The chamber is
    // deliberately *not* included -- it is the wind-up, the body is meant to be
    // still outside measure while it happens, and stepping through it would be
    // closing before the blade is loaded.
    match phase {
        TacticalPhase::Commit => {
            command.move_dir = Vec2::new(toward.cos(), toward.sin()) * footwork.lunge;
        }
        TacticalPhase::Recover => {
            let away = toward + Angle::HALF;
            command.move_dir = Vec2::new(away.cos(), away.sin()) * footwork.lunge;
        }
        _ => {}
    }
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
    use sim::{
        ARM_MIN_REACH_RAW, DuelConfigV1, EquipmentGeometry, Faction, Scenario,
        SubmitArticulatedOutcome, World,
    };

    /// Submits a command and insists the world took it.
    ///
    /// **`let _ = world.submit_articulated_v1(..)` is what these call sites used
    /// to be, and it is a refusal nobody hears.** Every fixture in this module
    /// is `Scenario::duel_from`, which is `CombatModel::Articulated` today; the
    /// day it becomes `Embodied` this entry answers
    /// `NotStored(CommandReject::WrongModel)` for every submission and the fight
    /// becomes two bodies standing still. Three of the four tests that drove a
    /// world through here **passed anyway** when that was measured on
    /// 2026-08-19 by flipping the fixture: the planner's phase machine runs off
    /// observations and a tick counter, so it still commits, and a test that
    /// checks the plan against a cached observation never asks whether anything
    /// moved. Only `the_intercept_model_agrees_with_the_derived_plate_at_a_
    /// nonzero_guard_bearing` went red, and it went red for a reason two steps
    /// downstream of the cause.
    ///
    /// So the outcome is matched and the stored command is compared against the
    /// offered one. What that buys is a failure that names the submission rather
    /// than an assertion about geometry four hundred ticks later.
    fn submit(world: &mut World, id: EntityId, command: ArticulatedCommandV1) {
        match world.submit_articulated_v1(id, command) {
            SubmitArticulatedOutcome::Stored { command: stored, rejection: None } => {
                assert_eq!(stored, command, "the world stored a command nobody offered");
            }
            SubmitArticulatedOutcome::Stored { rejection: Some(reject), .. } => {
                panic!("{id:?} had its command replaced by the neutral one: {reject:?}")
            }
            SubmitArticulatedOutcome::NotStored(reject) => {
                panic!("{id:?} could not submit at all: {reject:?}")
            }
        }
    }

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
            submit(&mut world, fighter, command);
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
                submit(world, id, command);
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
                submit(&mut world, id, command);
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
        let chamber = strike_command(&obs, &foe, plan, TacticalPhase::Chamber,
                                     Footwork::ARTICULATED, false);
        let commit = strike_command(&obs, &foe, plan, TacticalPhase::Commit,
                                    Footwork::ARTICULATED, false);
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
                submit(&mut world, id, command);
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

    // --------------------------------------- session 04: the feet, both-sided

    /// The two bodies `embodied-duel-v1` fields, each as the observation it has
    /// of itself and the move speed its own stats answer.
    ///
    /// Read off the fixture rather than written down, because every bound below
    /// is a claim about *these two anatomies*. A fixture edit that changed an
    /// arm or a blade would move the admitted band, and a test carrying its own
    /// copy of 1.70 and 2.30 would go on passing while the constants stopped
    /// meaning what their doc comments say.
    fn embodied_bodies() -> Vec<(ArticulatedObservation, Fx)> {
        let scenario = Scenario::embodied_duel();
        let world = World::new(&scenario, 0);
        let mut rows = Vec::new();
        for faction in [Faction::Heroes, Faction::Monsters] {
            let ids = world.alive_ids(faction);
            assert_eq!(ids.len(), 1, "the duel fixture fields one body a side");
            let unit = scenario.units.iter().find(|unit| unit.faction == faction)
                .expect("a side with a body on it has a unit spec");
            rows.push((world.observe_articulated(ids[0]), unit.stats.move_speed()));
        }
        rows
    }

    /// The weapon hand as the slot `in_measure` and `StrikePlan` speak in.
    /// `ArmRoles::of` answers an index into `arms`, and the two are the same
    /// number in two types.
    fn weapon_slot(obs: &ArticulatedObservation) -> LimbSlot {
        if ArmRoles::of(obs).weapon == 0 { LimbSlot::LeftArm } else { LimbSlot::RightArm }
    }

    fn blade_length(obs: &ArticulatedObservation) -> Fx {
        let hand = ArmRoles::of(obs).weapon;
        let blade = obs.weapons[hand].expect("both fixture bodies carry a weapon");
        blade.tip.distance(blade.hilt)
    }

    /// `arm_length + blade`: a body's own origin to a fully extended tip, which
    /// is what every number in [`Footwork`] is a fraction or an offset of.
    fn strike_reach(obs: &ArticulatedObservation) -> Fx {
        obs.arm_length + blade_length(obs)
    }

    /// The ground one commit's lunge covers, before acceleration is charged for.
    fn commit_ground(speed: Fx, footwork: Footwork) -> Fx {
        speed * Fx::from_int(COMMIT_TICKS as i32) * footwork.lunge
    }

    /// How wide the band `in_measure` admits is, from its two ends.
    fn measure_band(obs: &ArticulatedObservation, footwork: Footwork) -> Fx {
        strike_reach(obs) * (Fx::ONE - footwork.min_fraction) + footwork.margin
    }

    /// A foe standing exactly `distance` due east of the subject, and nothing
    /// else. `in_measure` reads one field of an opponent and this is it, so a
    /// blank body with a position is the whole of the input rather than a
    /// fixture whose spawn a later session could move.
    fn foe_at(obs: &ArticulatedObservation, distance: Fx) -> ObservedOpponent {
        let mut foe = ObservedOpponent::BLANK;
        foe.body_position = obs.body_position + Vec3::new(distance, Fx::ZERO, Fx::ZERO);
        assert_eq!(planar(foe.body_position - obs.body_position).length(), distance,
                   "the probe geometry is not exact, so a one-raw pin would be noise");
        foe
    }

    /// `MEASURE_MARGIN_RAW` and `LUNGE_SPEED_RAW` are bounded by the same two
    /// inequalities read from opposite ends, and this is the margin's end.
    ///
    /// **On this fixture the pair admits `[0.4113, 0.6391]` and nothing outside
    /// it.** The width is written down rather than left to be inferred from two
    /// inequalities, because a bound whose width nobody states is how a
    /// field-of-view assertion of `FOV / 2 > 46` came to pass for anything from
    /// 93 to 179 degrees and look like coverage. A half sits inside with room at
    /// both ends, and the quarter-steps either side of it are both outside --
    /// **by a different inequality each**, which is what makes the two bounds
    /// two bounds rather than one written twice.
    ///
    /// Neither end is the sweep. The sweep is in
    /// `docs/performance/embodied-tactical-policy.md` and it chose a half from
    /// inside this band; what this test holds is that the band still contains
    /// the shipped value after somebody edits an anatomy row.
    #[test]
    fn the_measure_margin_is_the_ground_one_commit_can_cross() {
        let footwork = Footwork::EMBODIED;
        for (obs, speed) in embodied_bodies() {
            // Above: a standoff further out than the ground one commit covers is
            // ground the body cannot cross while the arm sweeps, so the blade
            // arrives where the body is not.
            assert!(footwork.margin <= commit_ground(speed, footwork),
                    "a commit cannot cross the standoff it chambered from");
            // Below: the same arithmetic from the other side. A lunge that
            // carries the body further than the whole measure band is wide ends
            // the commit out the near side of it, which is the rub the standoff
            // exists to stop -- and the margin is one of the two terms in that
            // width, so it is the term that has to be large enough.
            assert!(commit_ground(speed, footwork) <= measure_band(&obs, footwork),
                    "one commit carries the body clean through the measure band");
        }

        // The width, stated by making both ends fail. The Brute is the slower
        // body and is what the upper end is about; the Fighter has the shorter
        // reach and the narrower band, and is what the lower end is about.
        let mut bodies = embodied_bodies();
        let (brute, brute_speed) = bodies.pop().expect("the monster side");
        let (fighter, fighter_speed) = bodies.pop().expect("the hero side");
        let wide = Footwork { margin: Fx::from_ratio(3, 4), ..footwork };
        assert!(wide.margin > commit_ground(brute_speed, wide),
                "three quarters is inside what the Brute's own commit can cross");
        assert!(commit_ground(brute_speed, wide) <= measure_band(&brute, wide),
                "three quarters fails the upper bound and nothing else");
        let narrow = Footwork { margin: Fx::from_ratio(1, 4), ..footwork };
        assert!(narrow.margin <= commit_ground(fighter_speed, narrow),
                "a quarter is well inside what the Fighter's commit can cross");
        assert!(commit_ground(fighter_speed, narrow) > measure_band(&fighter, narrow),
                "a quarter fails the lower bound and nothing else");

        // And the value itself, pinned through the function that consumes it
        // against a literal half rather than against the constant -- an
        // assertion that a body at `reach + MEASURE_MARGIN` is in measure is
        // true of every margin there is.
        let hand = weapon_slot(&fighter);
        let edge = strike_reach(&fighter) + Fx::HALF;
        assert!(in_measure(&fighter, &foe_at(&fighter, edge), hand, footwork),
                "a body at reach plus a half is outside the measure it commits from");
        let past = Fx::from_raw(edge.raw() + 1);
        assert!(!in_measure(&fighter, &foe_at(&fighter, past), hand, footwork),
                "the margin reaches one raw unit further than a half");
    }

    /// `MEASURE_MIN_FRACTION_RAW`, bounded below by the extension the actuator
    /// holds an idle arm at and above by the measure band a commit has to land
    /// in.
    ///
    /// **On this fixture the arm's own two extensions admit `(0.7228, 0.9724)`,
    /// and at the shipped margin and lunge the measure band cuts that to
    /// `(0.7228, 0.8521]`** -- so four fifths sits inside with room at both
    /// ends and seven eighths does not. Below the lower end a body holding its
    /// measure already has its own resting tip past its opponent's origin,
    /// which is the rub and is present before either body has decided anything.
    /// Above the upper end the band `in_measure` admits is narrower than the
    /// ground one commit covers, so the commit ends out the near side of it.
    ///
    /// The earlier draft of this comment named only the arm's pair and called
    /// the upper end "a measure its own committed extension can no longer reach
    /// out of". That end is real and it is 0.9724, and it is not the one that
    /// binds: nothing between 0.8521 and 0.9724 is reachable at the shipped
    /// margin and lunge, and the corpus row at seven eighths was outside the
    /// band the whole time it was being read as a worse point inside it.
    #[test]
    fn the_measure_floor_clears_a_resting_blade() {
        let footwork = Footwork::EMBODIED;
        let mut resting_worst = Fx::ZERO;
        let mut committed_worst = Fx::ONE;
        for (obs, _) in embodied_bodies() {
            let reach = strike_reach(&obs);
            // `neutral_articulated_command` asks for `reach: Fx::ZERO` and the
            // actuator clamps it up to `ARM_MIN_REACH_RAW`, so a body doing
            // nothing at all still holds its tip this far out.
            let resting = (obs.arm_length * Fx::from_raw(ARM_MIN_REACH_RAW)
                           + blade_length(&obs)) / reach;
            assert!(footwork.min_fraction > resting,
                    "the measure floor stands a body inside its own resting blade");
            // The other extension: what the commit phase actually asks for.
            let committed = (obs.arm_length * STRIKE_COMMIT_REACH
                             + blade_length(&obs)) / reach;
            assert!(footwork.min_fraction < committed,
                    "the feet give ground to a measure the commit cannot reach out of");
            if resting > resting_worst { resting_worst = resting; }
            if committed < committed_worst { committed_worst = committed; }
        }
        // The width, so the bound is honest rather than merely true: the
        // Brute's resting blade is the lower end and the Fighter's committed
        // one is the upper, and seven tenths -- the row below the shipped one
        // in the corpus's own sweep -- is outside.
        assert_eq!((resting_worst.raw(), committed_worst.raw()), (47_371, 63_728));
        assert!(Fx::from_ratio(7, 10) < resting_worst,
                "seven tenths would clear the Brute's resting blade after all");
        assert!(Fx::ONE > committed_worst,
                "a floor at full reach would still be inside what a commit reaches");

        // **And the ceiling that actually binds, which is not that one.** The
        // arm's own committed extension leaves the floor room up to 0.9724, and
        // the measure band leaves it far less: a floor that high makes
        // `reach * (1 - min_fraction) + margin` narrower than the ground one
        // commit covers, which is the second inequality
        // `the_lunge_is_bounded_by_the_two_ways_a_commit_wastes_itself` holds.
        // At the shipped margin and lunge that caps the floor at 0.8521, so
        // seven eighths -- a row the corpus swept and reported -- is outside the
        // band rather than merely worse in it, and the shipped four fifths sits
        // inside with room at both ends.
        let steep = Footwork { min_fraction: Fx::from_ratio(7, 8), ..footwork };
        let (fighter, fighter_speed) = embodied_bodies().remove(0);
        assert!(commit_ground(fighter_speed, steep) > measure_band(&fighter, steep),
                "a floor of seven eighths still leaves a band one commit fits inside");
        assert!(commit_ground(fighter_speed, footwork) <= measure_band(&fighter, footwork),
                "the shipped floor leaves no band for the commit to land in");

        // And the value, pinned through `in_measure` against a literal four
        // fifths. One raw unit inside the floor and the feet give ground; at
        // the floor itself they hold.
        let hand = weapon_slot(&fighter);
        let floor = strike_reach(&fighter) * Fx::from_ratio(4, 5);
        assert!(in_measure(&fighter, &foe_at(&fighter, floor), hand, footwork),
                "the floor is above four fifths of reach");
        let under = Fx::from_raw(floor.raw() - 1);
        assert!(!in_measure(&fighter, &foe_at(&fighter, under), hand, footwork),
                "the floor is below four fifths of reach");
    }

    /// `LUNGE_SPEED_RAW`, held by the two ways a commit wastes itself.
    ///
    /// **On this fixture the pair admits `[0.3911, 0.5590]` and nothing outside
    /// it.** It is the same two inequalities
    /// `the_measure_margin_is_the_ground_one_commit_can_cross` states, solved
    /// for the speed instead of the standoff: too slow and the commit never
    /// crosses the margin it chambered from, so the blade arrives where the body
    /// is not; too fast and one commit carries the body clean through the
    /// measure band and out the near side, which is the rub again with the feet
    /// doing the rubbing. A half sits inside, and the two ends of the swept
    /// curve -- zero and one -- are the two failures it sits between.
    ///
    /// Zero is the articulated row and is a real setting rather than a disabled
    /// one: it is what the planner did before this session, and what `#/arena`
    /// still runs.
    #[test]
    fn the_lunge_is_bounded_by_the_two_ways_a_commit_wastes_itself() {
        let footwork = Footwork::EMBODIED;
        for (obs, speed) in embodied_bodies() {
            assert!(commit_ground(speed, footwork) >= footwork.margin,
                    "the commit never crosses the standoff it chambered from");
            assert!(commit_ground(speed, footwork) <= measure_band(&obs, footwork),
                    "one commit walks the body through the whole measure band");
        }
        let mut bodies = embodied_bodies();
        let (brute, brute_speed) = bodies.pop().expect("the monster side");
        let (fighter, fighter_speed) = bodies.pop().expect("the hero side");
        let planted = Footwork { lunge: Fx::ZERO, ..footwork };
        assert!(commit_ground(brute_speed, planted) < planted.margin,
                "a planted commit crosses no ground, which is what it always did");
        let sprint = Footwork { lunge: Fx::ONE, ..footwork };
        assert!(commit_ground(fighter_speed, sprint) > measure_band(&fighter, sprint),
                "a commit at full speed no longer walks the Fighter through the band");
        assert!(commit_ground(brute_speed, sprint) > measure_band(&brute, sprint),
                "a commit at full speed no longer walks the Brute through the band");

        // And which phases spend it, pinned through `strike_command` against a
        // literal half. The foe is due east, so the commanded step is the lunge
        // itself on one axis and nothing on the other, and the three phases can
        // be read apart without an angle in the way.
        let foe = foe_at(&fighter, strike_reach(&fighter));
        let plan = StrikePlan { opponent: foe.id, region: BodyPart::Torso,
            hand: weapon_slot(&fighter),
            chamber_bearing: Angle::ZERO, commit_bearing: Angle::ZERO,
            height: CombatHeight::MID };
        let step = |phase| strike_command(&fighter, &foe, plan, phase, footwork, false).move_dir;
        assert_eq!(step(TacticalPhase::Commit), Vec2::new(Fx::HALF, Fx::ZERO),
                   "the commit does not cross measure at a half of move speed");
        assert_eq!(step(TacticalPhase::Recover), Vec2::new(-Fx::HALF, Fx::ZERO),
                   "the recovery does not leave measure at the speed it entered");
        // The chamber is deliberately outside it: that is the wind-up, and
        // stepping through it is closing before the blade is loaded.
        assert_eq!(step(TacticalPhase::Chamber), Vec2::ZERO,
                   "the chamber steps, so the body closes before the blade is loaded");
    }

    /// `UNWIND_TWIST_RAW`, and the one thing that makes it safe to carry on the
    /// articulated row as well.
    ///
    /// **The threshold admits `(0.5, 1.0)` and seven eighths sits inside it**,
    /// which is `embodied_script.rs`'s own argument for its own copy, unchanged:
    /// below about a half an ordinary guard change would step, so footwork would
    /// become a tax on aiming; at one the step would only begin after the torso
    /// had already stopped turning, so the policy would be reacting to the
    /// constraint rather than spending it.
    ///
    /// The second half is the gate. `ObservedStance::present` is false on a body
    /// with no legs, so `Footwork::ARTICULATED` can carry a threshold it never
    /// reaches -- and that is what leaves every pinned articulated measurement
    /// the planner it was taken with. An ungated read would be worse than
    /// useless, because a `twist_fraction` of zero is the one value that means
    /// nothing is wrong.
    #[test]
    fn the_unwind_threshold_is_the_scripts_and_never_fires_without_hips() {
        // **The band first and the pin after it, which is not cosmetic.** These
        // three lines shipped with the equality at the top, and an equality
        // against the constant makes every inequality below it unreachable by
        // any mutation of that constant: the test would already have failed.
        // Two of the three assertions were decoration, in a test the record
        // described as two-sided.
        assert!(Footwork::EMBODIED.unwind_twist > Fx::HALF,
                "an ordinary guard change would force a step");
        assert!(Footwork::EMBODIED.unwind_twist < Fx::ONE,
                "the step could only start after the turn had already stopped");
        assert_eq!(Footwork::EMBODIED.unwind_twist, Fx::from_ratio(7, 8));
        assert_eq!(Footwork::ARTICULATED.unwind_twist, Footwork::EMBODIED.unwind_twist,
                   "the articulated row must carry the same number it cannot reach");

        let (mut obs, _) = embodied_bodies().remove(0);
        assert!(obs.stance.present, "the embodied fixture publishes a stance");
        // Pinned against a literal seven eighths, and from both sides of it.
        obs.stance.twist_fraction = Fx::from_ratio(7, 8);
        assert!(unwinding(&obs, Footwork::EMBODIED), "the threshold is above seven eighths");
        obs.stance.twist_fraction = Fx::from_raw(Fx::from_ratio(7, 8).raw() - 1);
        assert!(!unwinding(&obs, Footwork::EMBODIED), "the threshold is below seven eighths");
        // Signed, because a torso wound the other way is just as stuck.
        obs.stance.twist_fraction = -Fx::from_ratio(7, 8);
        assert!(unwinding(&obs, Footwork::EMBODIED), "a torso wound the other way never steps");

        // The gate, which is what the articulated row rests on: fully wound, in
        // both directions, on a body with no legs, and it still does not fire.
        obs.stance.present = false;
        for wound in [Fx::ONE, -Fx::ONE] {
            obs.stance.twist_fraction = wound;
            assert!(!unwinding(&obs, Footwork::ARTICULATED),
                    "a body with no legs read a twist it does not have");
            assert!(!unwinding(&obs, Footwork::EMBODIED),
                    "a body with no legs read a twist it does not have");
        }
    }

    /// The whole opponent moved so that it stands `distance` from the subject
    /// on the line it is already on.
    ///
    /// Everything that carries a world position moves together -- the body
    /// origin, the five region volumes, both held segments and the plate --
    /// because `choose_plan` and `in_measure` read different ones of those and
    /// a foe whose regions had stayed behind its body would be a shape no world
    /// can produce. [`foe_at`] is the blank-row version and answers a different
    /// question: it probes `in_measure` alone, which reads one field.
    fn foe_moved_to(
        obs: &ArticulatedObservation,
        foe: &ObservedOpponent,
        distance: Fx,
    ) -> ObservedOpponent {
        let offset = planar(foe.body_position - obs.body_position);
        let toward = offset.angle();
        let target = Vec2::new(toward.cos(), toward.sin()) * distance;
        let delta = Vec3::new(target.x - offset.x, target.y - offset.y, Fx::ZERO);
        let mut moved = *foe;
        moved.body_position += delta;
        for region in moved.regions.iter_mut() {
            region.lower += delta;
            region.upper += delta;
        }
        for weapon in moved.weapons.iter_mut().flatten() {
            weapon.hilt += delta;
            weapon.tip += delta;
        }
        moved.shield.centre += delta;
        moved
    }

    /// **The planner spends its own footwork row on its own measure decision**,
    /// which is the one thing nothing else in this file was checking.
    ///
    /// `decide` asks [`in_measure`] whether to chamber and hands
    /// [`measure_command`] the answer when it will not, and both take a
    /// [`Footwork`]. Until this test, replacing `self.footwork` with
    /// `Footwork::ARTICULATED` at those two call sites left the whole workspace
    /// green -- 103 passed, 0 failed on the tree it was found in -- and moved
    /// the corpus hard: 726,226 weapon-on-body resolutions to 838,103, 162
    /// severances to 183, and six fights decided by a body to one. Half of
    /// session 04's tuning could be reverted with nothing going red, because the
    /// bounding tests call `in_measure` as a free function with a hand-built row
    /// and `an_embodied_planner_keeps_its_footwork_across_a_reset` reads the
    /// struct field. Both are "the reporter rather than the thing reported";
    /// this one closes the loop through `decide`.
    ///
    /// The probe is one distance at which the two shipped rows disagree, run
    /// through both. Seven tenths of a body's own reach is *below*
    /// [`Footwork::EMBODIED`]'s floor of four fifths and *above*
    /// [`Footwork::ARTICULATED`]'s of three fifths, so at that distance the
    /// embodied row gives ground and the articulated one chambers. Asserted in
    /// both directions, so a mutation at either call site is caught by one of
    /// the two halves.
    #[test]
    fn a_planner_measures_with_the_footwork_it_was_built_with() {
        // The close articulated duel and not `embodied_duel`, for one reason:
        // it is the fixture whose two bodies can see each other at spawn.
        // Nothing asserted below depends on the anatomy -- the probe distance
        // is built out of the subject's own reach -- and the stance column
        // being absent keeps this test about measure alone.
        let scenario = close_duel();
        let world = World::new(&scenario, 0);
        let hero = world.alive_ids(Faction::Heroes)[0];
        let mut obs = world.observe_articulated(hero);
        let reach = strike_reach(&obs);
        // Between the two floors and inside both margins: three fifths of reach
        // is the articulated floor and four fifths the embodied one.
        let probe = reach * Fx::from_ratio(7, 10);
        let standing = obs.opponents()[0];
        obs.opponents[0] = foe_moved_to(&obs, &standing, probe);
        let foe = obs.opponents()[0];
        let hand = weapon_slot(&obs);
        assert!(in_measure(&obs, &foe, hand, Footwork::ARTICULATED),
                "the probe distance is outside the articulated row's measure");
        assert!(!in_measure(&obs, &foe, hand, Footwork::EMBODIED),
                "the probe distance is inside the embodied row's measure");

        // The articulated row commits: it is in measure, so `decide` takes the
        // plan and enters the chamber.
        let mut articulated = StrikePlanner::footwork(Footwork::ARTICULATED);
        let chambering = articulated.decide(&obs);
        assert_eq!(articulated.phase(), TacticalPhase::Chamber,
                   "a planner on the articulated row did not chamber from its own measure");

        // The embodied row gives ground: it is inside the floor, so `decide`
        // returns `measure_command`'s withdrawal and never leaves Measure.
        let mut embodied = StrikePlanner::footwork(Footwork::EMBODIED);
        let withdrawing = embodied.decide(&obs);
        assert_eq!(embodied.phase(), TacticalPhase::Measure,
                   "a planner on the embodied row chambered from inside its own floor");
        let toward = planar(foe.body_position - obs.body_position).angle();
        let away = toward + Angle::HALF;
        assert_eq!(withdrawing.body_yaw, away,
                   "the embodied row did not turn the body away from the foe");
        assert_eq!(withdrawing.move_dir,
                   Vec2::new(away.cos() * WITHDRAW_SPEED, away.sin() * WITHDRAW_SPEED),
                   "the embodied row did not give ground at the withdraw speed");
        assert_ne!(withdrawing.move_dir, chambering.move_dir,
                   "the two footwork rows produced the same step from one observation");
    }

    /// **The unwinding read is spent**, which the predicate test could not say.
    ///
    /// `the_unwind_threshold_is_the_scripts_and_never_fires_without_hips` covers
    /// [`unwinding`] and stops there: `if false && unwinding {` inside
    /// [`strike_command`] left every crate that can reach `policy` green. A
    /// predicate nothing consumes is a reporter, and this asserts the
    /// consumption -- the chamber steps along the torso's own facing at
    /// `APPROACH_SPEED` when the torso has spent its twist, and does not when
    /// it has not.
    ///
    /// The chamber, because that is the only phase the step survives: the
    /// commit and the recovery overwrite `move_dir` with the lunge, and both
    /// halves of that ordering are asserted here too, so that writing the
    /// unwinding step below the lunge instead of above it fails rather than
    /// quietly changing the fight.
    #[test]
    fn a_spent_twist_puts_a_foot_down_during_the_chamber() {
        let (fighter, _) = embodied_bodies().remove(0);
        let foe = foe_at(&fighter, strike_reach(&fighter));
        let plan = StrikePlan { opponent: foe.id, region: BodyPart::Torso,
            hand: weapon_slot(&fighter),
            chamber_bearing: Angle::ZERO, commit_bearing: Angle::ZERO,
            height: CombatHeight::MID };
        let step = |phase, unwinding| {
            strike_command(&fighter, &foe, plan, phase, Footwork::EMBODIED, unwinding).move_dir
        };
        // Along the torso's own facing, which is the angle the hips have to
        // close -- not along the bearing to the foe, which is where the blade
        // goes.
        let facing = Vec2::new(fighter.body_yaw.cos(), fighter.body_yaw.sin()) * APPROACH_SPEED;
        assert_ne!(facing, Vec2::ZERO, "the probe cannot tell a step from no step");
        assert_eq!(step(TacticalPhase::Chamber, true), facing,
                   "a torso at its twist limit chambered without putting a foot down");
        assert_eq!(step(TacticalPhase::Chamber, false), Vec2::ZERO,
                   "an unwound torso stepped anyway, so the read decides nothing");

        // And the ordering: the commit and the recovery own the feet, so the
        // unwinding step is overwritten there rather than added to.
        let lunge = Vec2::new(Fx::HALF, Fx::ZERO);
        assert_eq!(step(TacticalPhase::Commit, true), lunge,
                   "the unwinding step survived into the commit and fought the lunge");
        assert_eq!(step(TacticalPhase::Recover, true), -lunge,
                   "the unwinding step survived into the recovery and fought the lunge");
    }
}
