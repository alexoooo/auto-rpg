//! The embodied script: close, guard, circle, unwind, and take the ground.
//!
//! **It was a sibling of `articulated_script.rs` and deliberately not a mode of
//! it**, for the reason the plan gave and the compiler could not: the two files
//! read the same struct field in different frames. `ArmTarget::bearing` and
//! `move_dir` were *world* quantities in that file and are *torso-relative* ones
//! here -- the retired `CombatModel::command_frame` was where that difference
//! lived, and with one model left there is one frame: `+x` is forward, `+y` is
//! body-left, and a zero bearing holds the arm directly ahead at every yaw. A single file with a frame flag would have made "which frame is this
//! bearing" a runtime question in the one place where getting it wrong produces
//! a fighter that swings at the map's north instead of at its opponent, and
//! nothing would refuse the command. Session 05 deleted the articulated script
//! rather than merging it, so the flag was never needed -- but the argument is
//! kept, because it is the argument against reintroducing one the day a second
//! frame arrives.
//!
//! The frame is not only a hazard, it is a simplification, and both show up
//! below. A guard arc centred on the body is `bearing.clamp(-arc, arc)` here and
//! needs no yaw at all; a step that brings the feet back under the shoulders is
//! `(1, 0)`; and "the same tactical situation at a different yaw" is the *same
//! command*, which is what `the_same_situation_at_two_yaws_produces_one_command`
//! measures and is exactly what a bearing copied from the older file would
//! break.
//!
//! # What it can express
//!
//! Four things, because those four are session 09's acceptance criteria and each
//! one has a test that fails if its term is deleted:
//!
//! * **Close and strike.** Out of measure it walks in; inside it, a four-phase
//!   cycle guards, chambers, commits and recovers.
//! * **Hold a guard while circling.** The guard arm holds one pose in the torso
//!   frame while the feet move laterally, which is a thing only a body-frame
//!   command can say without re-deriving the pose every time the body turns.
//! * **Step to unwind a saturated twist.** [`ObservedStance::twist_fraction`] at
//!   the limit means the torso cannot turn any further until the feet move, and
//!   translating lets the hips chase the achieved torso at twice the planted
//!   rate. So a wound body steps, and it steps *forward* rather than paying that
//!   ground cost sideways or backward.
//! * **Use elevation.** [`GroundSense`] is the term, and it is switchable off
//!   because the next session measures this policy against itself with it
//!   disabled on a sculpted corpus. **The term exists to be measured, not
//!   asserted** -- nothing here claims the high ground wins, and a measurement
//!   that comes back flat is a result rather than a bug.
//!
//! # Memoryless except for one row, and the row is the elevation term
//!
//! Everything but [`GroundSense`] is a pure function of one observation: the
//! phase is `tick % 120`, the heights are two clocks, and every mode is a
//! deadbanded read of a published column. That is the property
//! [`scripted_command`] exists to expose -- a test that wants to know
//! what the script says at tick 137 should not have to build a policy and drive
//! a world -- and it is why the modes are separated by *deadbands* rather than
//! by hysteresis: a deadband needs no memory, makes "neither" a real state, and
//! cannot chatter.
//!
//! The elevation term is the exception and it has to be, for a reason that was
//! measured rather than assumed. See [`GroundSense`].
//!
//! # What this file does not do
//!
//! It does not tune. The phase lengths, the guard arc and the approach speed are
//! the articulated script's, copied rather than imported because session 10
//! deletes the file they came from; the deadbands are bounded from both sides by
//! tests against the fixture they will be measured on. Nothing here was chosen
//! by running a corpus, because there is no embodied corpus yet -- this policy
//! is what makes one possible, and a policy tuned against a corpus that does not
//! exist would be measuring its own tuning.

use crate::{ArmRoles, Policy};
use fx::{Angle, Fx, Vec2};
use sim::{
    ArmTarget, CommandCoreV1, Observation, BodyPart, CombatHeight,
    CommandV1, GripRequest, Intent, ObservedOpponent, ReleaseRequest, ARM_MIN_REACH_RAW,
};

/// Ticks in one phase of the cycle.
///
/// **The articulated script's number, copied and not imported.** Thirty ticks is
/// what `PHASE_TICKS` was through every articulated measurement in the
/// repository, and a first embodied corpus that ran on a different tempo could
/// not be read beside the articulated gate that measured the same contact
/// solver. It is a copy because the file it came from was going to be deleted,
/// and a `pub use` of a constant that was about to be removed would have made
/// this policy's tempo a casualty of that deletion rather than a decision.
/// **Session 05 deleted it and this number did not move**, which is the copy
/// doing exactly the job it was made for.
pub const SCRIPT_PHASE_TICKS: u32 = 30;

/// Ticks in the full cycle: guard, chamber, commit, recover.
///
/// **Four phases and not twelve.** The twelve-phase table is a transcription of
/// a reference document, and reproducing it was that file's whole job. This one
/// owes nothing to that document: what a body needs in order to be *driven* is a
/// windup, a commit and a place to stand between them, and every phase beyond
/// those is a decision the observation should be making instead of the clock.
pub const SCRIPT_CYCLE_TICKS: u32 = SCRIPT_PHASE_TICKS * 4;

/// Ticks a commanded height holds before its clock steps it.
pub const SCRIPT_HEIGHT_TICKS: u32 = 90;

/// How far ahead of the striking height's clock the guard's clock runs.
///
/// **Half a step, and the reason is a measurement this file inherits rather than
/// one it made.** With both bodies reading one tick and one clock the
/// articulated corpus's joint distribution of (attacker height, guard height)
/// came back **100.00% diagonal, every off-diagonal cell exactly zero** -- a HIGH
/// guard met a HIGH swing and never met anything else, on every trial, by
/// construction. **The counts are written out here because the constant that
/// carried them is gone**: `articulated_script.rs`'s `GUARD_LEAD_TICKS` held
/// them until session 05 deleted the file, and the corpus that produced them is
/// not re-runnable on this tree. The composed corpus measured
/// `[[9382, 9375, 0], [0, 10934, 10913], [10930, 0, 10939]]`, with the same
/// three cells exactly zero on both controls. A whole-step offset
/// relabels rather than mixes, since equal periods make the index difference
/// constant; a half is the smallest offset that is not a whole multiple of the
/// period. Six of the nine cells become reachable and three remain unreachable,
/// which is the honest ceiling of the fix and not a claim to have closed it.
///
/// **This clock is a control and not a recommendation.** It was the best that
/// could be done by a file with no embodied corpus to tune against, and it has
/// been superseded: [`crate::GuardRead`] answers the guard height from the
/// observed incoming weapon, and **no tick there can produce a height no blade
/// produced** -- the narrow claim, because that guard does read `obs.tick`, to
/// decide when its arm has had long enough to arrive. Here the tick *is* the
/// answer. This policy is frozen as
/// the measurement's control, so the clock stays exactly as it is -- a reader
/// who finds it first should not have to discover `guard.rs` to learn
/// that it is the baseline rather than the design.
const GUARD_LEAD_TICKS: u32 = SCRIPT_HEIGHT_TICKS / 2;

/// An eighth of a turn: the chamber and commit offsets, and the guard arc.
const EIGHTH_TURN: Angle = Angle::from_raw(8_192);

/// How far the guard may leave the body's own centre line, either way.
///
/// The same eighth the articulated script uses and the same argument, which the
/// torso frame makes shorter: the plate's normal comes off the carrying arm's
/// bearing, so this arc is exactly how far the plate may turn away from the
/// direction the body faces, a quarter would put it edge-on to a frontal attack,
/// and past a quarter it would face behind the body. Here the arc is centred on
/// zero because zero *is* the body's facing.
const GUARD_ARC: Angle = EIGHTH_TURN;

const HEIGHTS: [CombatHeight; 3] = [CombatHeight::LOW, CombatHeight::MID, CombatHeight::HIGH];

/// The reach a hand carrying something holds a guard at.
///
/// Three quarters is clear of both ends of `[ARM_MIN_REACH_RAW, 1]`, so a shoved
/// hand is chased back rather than clamped, and full extension would be a joint
/// limit and a straight arm rather than a guard.
const GUARD_REACH: Fx = Fx::from_ratio(3, 4);

/// How far out the blade chambers before it commits.
///
/// The same three quarters as [`GUARD_REACH`] and a separate constant because it
/// is a separate claim with a separate reason it cannot move: `Posture::Chamber`
/// in `learn-core`'s action table is *defined* as three quarters out. Raising it
/// there either moves `LEARNED_INFERENCE_DIGEST` and owes the probe checkpoint a
/// re-score, or collapses `Chamber` and `Commit` into one `(reach, effort)` pair
/// the model cannot tell apart. Two names is what stops somebody tuning this one
/// and getting that.
const CHAMBER_REACH: Fx = Fx::from_ratio(3, 4);

/// Where an arm rests when nothing is asking anything of it.
///
/// **The joint's own floor, read from `sim` rather than written down as a
/// quarter.** `ARM_MIN_REACH_RAW` is exported, it is exactly 16,384, and reading
/// it means the resting collider is as short as this anatomy can make it by
/// construction. That matters more than tidiness: `body_region_volumes` builds
/// an arm from the shoulder to the hand, so extending an *empty* hand lengthens a
/// torso-grade interceptor out of the shoulder and into the line -- 1.49x on the
/// articulated roster, measured -- which is not a guard, it is a target.
const REST_REACH: Fx = Fx::from_raw(ARM_MIN_REACH_RAW);

/// The magnitude of a closing step.
///
/// **Fifteen sixteenths and not one.** [`Vec2::with_length`] normalises by
/// dividing and then multiplying, so a unit answer can land a raw tick over the
/// magnitude `World::submit` validates -- and a refused command is
/// not a slow fighter, it is the *neutral* command stored in place of the one
/// the policy asked for. The whole run silently becomes a different run.
/// `the_script_never_submits_a_command_the_world_refuses` is what keeps this
/// honest.
const APPROACH_SPEED: Fx = Fx::from_ratio(15, 16);

/// The magnitude of a lateral step around an opponent. A half, because circling
/// is a way of staying at measure rather than a way of getting anywhere, and the
/// risk that bounds [`APPROACH_SPEED`] is entirely at the top of the range.
const CIRCLE_SPEED: Fx = Fx::HALF;

/// How fast a body closes once it has taken ground worth holding. Half.
///
/// **It is a half rather than zero, and that end is the load-bearing one.** A
/// body that stopped outright when it had climbed would deadlock against another
/// body doing the same thing: two fighters admiring the view until the tick
/// limit, which is a corpus that measures nothing. Slowing is the whole of what
/// "I have the ground and do not need to hurry" can safely mean when both sides
/// are running the same script.
const HELD_GROUND_SPEED: Fx = Fx::HALF;

/// The twist fraction at or past which the body puts a foot down.
///
/// Seven eighths, and both ends are decisions. **Below about a half** an
/// ordinary guard change would step, so footwork would stop being a choice and
/// become a tax on aiming -- which is the same bound
/// `STANCE_TWIST_LIMIT_RAW` is chosen against one layer down. **At one** the
/// step would only ever begin after the torso had already stopped turning, so
/// the policy would be reacting to a constraint instead of spending it.
/// `the_unwind_threshold_is_bounded_from_both_sides` asserts both.
const UNWIND_TWIST: Fx = Fx::from_ratio(7, 8);

/// The opponent twist fraction at which their guard counts as unable to follow.
///
/// Three quarters: far enough that the read is about a body genuinely wound up
/// rather than one merely turning, and short enough that the opening is taken
/// while it is still open -- a body at exactly one has already been forced to
/// step, and the step is what closes the window.
const OPENING_TWIST: Fx = Fx::from_ratio(3, 4);

/// The reach headroom at or below which an arm counts as locked out.
///
/// A thirty-second of `arm_length`: about two centimetres on a Fighter, which is
/// the smallest gap that is not a truncation. Zero exactly would be a threshold
/// no arm reaches, because `reachable_extent`'s reach comes back through a
/// truncating division and the headroom is measured against the *asked*
/// horizontal.
const LOCKED_OUT_HEADROOM: Fx = Fx::from_ratio(1, 32);

/// One height step of the floor: an eighth of a world unit.
///
/// **A copy with its provenance written down, because the original is not
/// reachable.** `TERRAIN_HEIGHT_RAW_UNIT` is `ONE_RAW / 8` in `sim`'s dungeon
/// module and is not re-exported, which is the same wall the stance divisors sit
/// behind. `the_ground_deadbands_are_bounded_by_the_fixture_they_measure` bounds
/// it against `Scenario::embodied_slope`'s actual floor rather than against a
/// second copy of the number: a step must be small enough that the sculpted
/// fixture's riser clears it and large enough not to be zero.
const HEIGHT_STEP: Fx = Fx::from_ratio(1, 8);

/// One terrace of the sculpted fixture: two height steps, a quarter of a unit.
///
/// This is the *smallest* elevation difference the corpus can present, which is
/// what makes it the right threshold for "I am standing higher than I started":
/// anything larger would need two terraces and the hill only has three.
const TERRACE: Fx = Fx::from_ratio(1, 4);

/// Which way the lateral column leans when nothing has chosen for it.
///
/// Body-left. The sign has to come from somewhere, both sides are symmetric on a
/// radial hill and against a mirrored fixture, and the cost of the wrong guess is
/// one flip of [`GroundSense::drift`].
const DEFAULT_CIRCLE_SIDE: i32 = 1;

/// Whether the elevation term is on.
///
/// **A parameter and not a global, because the measurement runs this policy
/// against itself with the term disabled**, and two builds of one library that
/// differ by a `static` cannot be run against each other in one process at all.
///
/// The comparison is *not* bracketed, which is the protocol this repository uses
/// for a number that moves two to three times run to run. A win rate over a fixed
/// seed set does not move: it is a pure function of the two policies and the
/// fixture. What it is repeated over is the mirror and the side swap, and those
/// cancel the arena and the anatomy rather than noise.
///
/// It is a struct with one field rather than a `bool` argument so that the day a
/// second term needs the same treatment, the call sites do not change shape and
/// nobody has to remember which of two positional booleans is which.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct ScriptConfig {
    /// Whether the body reads the floor it is standing on at all. With this
    /// `false` the policy never so much as *stores* an elevation, which is what
    /// makes the control a policy that cannot see the ground rather than one
    /// that sees it and declines to act.
    pub high_ground: bool,
}

impl ScriptConfig {
    /// The shipped script: it reads the floor.
    pub const SEEKING: ScriptConfig = ScriptConfig { high_ground: true };

    /// The control: every floor is level. On a flat fixture this is byte for
    /// byte the same policy, which `the_two_configurations_agree_on_flat_ground`
    /// asserts -- so a difference measured on a sculpted corpus is the term and
    /// cannot be anything else.
    pub const LEVEL: ScriptConfig = ScriptConfig { high_ground: false };
}

impl Default for ScriptConfig {
    fn default() -> ScriptConfig {
        ScriptConfig::SEEKING
    }
}

/// The one row of memory this policy keeps: what the floor has done under it.
///
/// **The elevation term reads the body's own floor and never an opponent's, and
/// that is a correction rather than a simplification.** The obvious design is
/// `foe.body_position.z - obs.body_position.z`, and it does not work here:
/// `observed_opponent` displaces a perceived body *rigidly* by its measurer's
/// perception noise, and that displacement has a z term. The duel fixture's
/// Fighter carries `perception` 6 and the Brute 3, which are 0.9 and 1.2 world
/// units of noise -- against `Scenario::embodied_slope`, whose entire relief from
/// the flat to the summit is 0.75. A per-tick reading of the difference of two
/// floors is therefore a reading of the noise, and filtering it would need a
/// deadband wider than the hill. The subject's own `body_position.z` is exact,
/// on the same rule that makes every other proprioceptive column exact, and the
/// two things this term wants both fall out of it.
///
/// So the memory is three numbers:
///
/// * `start` -- the floor the body was standing on at its first decision after a
///   reset. `climb` is measured from it, and it is what makes "I have taken
///   ground" a question the body can answer about itself.
/// * `best` -- the highest floor it has stood on since. A *loss* is measured from
///   here rather than from the previous decision, which is what stops the drift
///   flipping on every tick of a descent: each flip costs a fresh height step of
///   loss, so a body walking downhill turns once and then commits to the new
///   side until the new side also starts costing it height.
/// * `drift` -- which way the lateral column leans, and **zero until the floor
///   has actually taken a step away from this body.** That is what makes the
///   whole term provably inert on flat ground: a floor that never falls never
///   sets a drift, a climb that never happens never steps a height, and the two
///   configurations emit identical bytes.
///
/// It is a hill climb with one bit of state and no terrain query, which is all
/// the observation can support: there is no height field in an observation and
/// there should not be one -- a fighter does not read a contour map, it notices
/// that the ground went out from under it.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
pub struct GroundSense {
    /// Whether any floor has been seen yet. A field and not `start == 0`,
    /// because zero is the floor of every flat fixture in the repository.
    pub seen: bool,
    /// The floor at the first decision after a reset.
    pub start: Fx,
    /// The highest floor stood on since, and the mark a loss is measured from.
    pub best: Fx,
    /// `+1` body-left, `-1` body-right, `0` until the ground has cost this body
    /// a height step.
    pub drift: i32,
}

impl GroundSense {
    /// One decision's worth of floor.
    ///
    /// Rising or level ground teaches nothing that needs correcting -- the body
    /// is already going the right way -- so the only rule is the one for losing
    /// height, and it fires once per [`HEIGHT_STEP`] lost rather than once per
    /// decision spent losing it.
    pub fn observe(&mut self, floor: Fx) {
        if !self.seen {
            self.seen = true;
            self.start = floor;
            self.best = floor;
            return;
        }
        if floor > self.best {
            self.best = floor;
            return;
        }
        if self.best - floor >= HEIGHT_STEP {
            self.drift = if self.drift == 0 { DEFAULT_CIRCLE_SIDE } else { -self.drift };
            // The loss is spent: the next flip has to be paid for with a fresh
            // step of ground, not with the same one read twice.
            self.best = floor;
        }
    }

    /// How far this body is above the floor it started on. Zero before the first
    /// observation, which is what a control that never observes anything reports
    /// forever.
    pub fn climb(&self, floor: Fx) -> Fx {
        if self.seen { floor - self.start } else { Fx::ZERO }
    }
}

/// Which quarter of the cycle a tick falls in.
///
/// Public because a measurement of this script cannot attribute a command
/// without it, on exactly the argument [`ArmRoles`] is public for: the phase is a
/// fact about the script, and a lab that re-derived it from `tick % 120` would be
/// a second copy of the rule below, free to drift from it.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum ScriptPhase {
    /// Blade and guard up, feet circling. The phase that holds a guard.
    Guard,
    /// The blade goes to the far side of the line, because a cut has to start
    /// somewhere the target is not in order to arrive somewhere it is at speed.
    Chamber,
    /// Through the line at full reach and full effort.
    Commit,
    /// Slack. An arm at zero effort sheds fatigue, and a script with no rest in
    /// it is a script that measures fatigue rather than swordplay.
    Recover,
}

impl ScriptPhase {
    pub fn of(tick: u32) -> ScriptPhase {
        match (tick % SCRIPT_CYCLE_TICKS) / SCRIPT_PHASE_TICKS {
            0 => ScriptPhase::Guard,
            1 => ScriptPhase::Chamber,
            2 => ScriptPhase::Commit,
            _ => ScriptPhase::Recover,
        }
    }

    fn attacking(self) -> bool {
        matches!(self, ScriptPhase::Chamber | ScriptPhase::Commit)
    }
}

/// A command that asks for nothing: what a blank observation answers.
///
/// **The arm bearing is `Angle::ZERO` and not the body's yaw**, which is the one
/// place this differs from [`crate::neutral_world_command`] and the whole
/// difference is the frame. An embodied arm bearing is measured from the torso,
/// so zero means "directly ahead"; the body's own yaw, read as a torso-relative
/// offset, would mean "an entire yaw off the centre line". Nothing observable moves
/// either way, because a zero-effort arm does not chase its target at all -- but
/// a neutral command that only happens to be harmless is not a neutral command.
pub fn neutral_command(obs: &Observation) -> CommandV1 {
    let arm = ArmTarget {
        bearing: Angle::ZERO,
        height: CombatHeight::MID,
        reach: Fx::ZERO,
        effort: Fx::ZERO,
    };
    CommandV1::new(CommandCoreV1 {
        move_dir: Vec2::ZERO,
        body_yaw: obs.body_yaw,
        intent: Intent::Hold,
        arms: [arm; 2],
        grips: [GripRequest::Keep; 2],
        releases: [ReleaseRequest::Keep; 2],
    })
}

/// The script's command for one observation, with the elevation term on and no
/// ground remembered.
///
/// Exposed as a function beside the policy for the reason the deleted
/// `scripted_articulated_command` was: a test that wants to know what the
/// script says at tick 137 should not have to build a policy and drive a world to
/// find out. Everything except the elevation term is a pure function of the
/// observation, so on a flat fixture this *is* the whole policy.
pub fn scripted_command(obs: &Observation) -> CommandV1 {
    scripted_command_with(obs, ScriptConfig::SEEKING, &mut GroundSense::default())
}

/// The script, with the elevation term and its memory supplied by the caller.
///
/// The memory is a `&mut` parameter rather than a field of a policy so that the
/// free function keeps working: a caller that has no ground to remember passes a
/// fresh one and gets the flat-fixture answer, and a caller driving a fight
/// passes the same one every tick.
pub fn scripted_command_with(
    obs: &Observation,
    config: ScriptConfig,
    ground: &mut GroundSense,
) -> CommandV1 {
    // A stale identity, a corpse and a Legacy world all answer the blank
    // observation, so every policy has to survive one: nothing in sight, hold.
    if !obs.present() {
        return neutral_command(obs);
    }
    // Read the floor **only** when the term that uses it is on. The control does
    // not store an elevation it has decided not to act on: a policy that keeps a
    // number it never reads is one edit away from reading it.
    if config.high_ground {
        ground.observe(obs.body_position.z);
    }
    let climb = ground.climb(obs.body_position.z);

    let roles = ArmRoles::of(obs);
    let weapon = roles.weapon;
    let off = 1 - weapon;

    // **Every stance column is gated on `present`, and this is the whole of the
    // degradation onto a model without legs.** The block is zeros on a Legacy or
    // Articulated world, and two of those zeros are traps read straight: a
    // `reach_headroom` of zero means "locked out", so an ungated policy would
    // step in on every tick of every articulated fight, and a `twist_fraction` of
    // zero is the one value that means nothing is wrong. `present` is a field
    // rather than an identity for exactly this reason -- a squared, level,
    // standing body writes the same bytes as a body with no legs at all -- and
    // this is the line that spends it.
    let stance = obs.stance;
    let locked_out = stance.present && stance.reach_headroom[weapon] <= LOCKED_OUT_HEADROOM;
    let unwinding = stance.present && stance.twist_fraction.abs() >= UNWIND_TWIST;

    let foe = obs.opponents().first().copied();
    // The bearing to the opponent measured from the body's own facing, which is
    // the frame the command is given in. With nobody in sight it is zero --
    // straight ahead -- and that is the honest degenerate answer rather than an
    // invented one: `body_yaw + 0` is the yaw the body already holds.
    let toward = foe.map_or(Angle::ZERO, |f| relative_bearing(obs, &f));

    // **The cycle only engages inside measure, and that is a decision the first
    // draft of this file got wrong.** With the phase read straight off the clock,
    // a body six units out spent half of every cycle swinging a blade at nothing:
    // fatigue billed, the windup telegraphed, and no possible contact --
    // `a_body_out_of_measure_closes_and_one_in_measure_strikes` is what caught it.
    // Out of measure the body guards and walks, which is what "close, then
    // strike" has to mean if the two halves are to be different at all.
    let in_measure = foe.is_some_and(|f| planar_gap(obs, &f) <= strike_range(obs, &f, weapon));
    // A body whose feet are committed cannot answer, so the guard phase becomes a
    // chamber and the commit lands while they are still recovering. This is the
    // second of the two opponent-stance columns and it is a *timing* read where
    // the twist below is a *direction* read; neither is available without legs,
    // and both degrade to the plain clock when the block is blank.
    let foe_stepping = foe.is_some_and(|f| f.stance.present && f.stance.stepping);
    let phase = match ScriptPhase::of(obs.tick) {
        _ if !in_measure => ScriptPhase::Guard,
        ScriptPhase::Guard if foe_stepping => ScriptPhase::Chamber,
        other => other,
    };

    // Two clocks, half a step apart. See `GUARD_LEAD_TICKS` for the measurement
    // that made one clock unacceptable.
    let base = ((obs.tick / SCRIPT_HEIGHT_TICKS) % 3) as i32;
    let guard_height =
        HEIGHTS[(((obs.tick + GUARD_LEAD_TICKS) / SCRIPT_HEIGHT_TICKS) % 3) as usize];
    // **The elevation term's second half: strike down from ground you climbed
    // to.** A step and not a replacement, so the height clock still walks all
    // three settings and the corpus still sees more than one cell of the (attack,
    // guard) table -- the control differs from the subject by exactly this
    // addend. Clamped rather than wrapped: stepping up from HIGH must not become
    // LOW, which would be striking at the feet of somebody standing above you.
    let elevation_step = if !config.high_ground {
        0
    } else if climb > TERRACE {
        -1
    } else if climb < -TERRACE {
        1
    } else {
        0
    };
    let strike_height = HEIGHTS[(base + elevation_step).clamp(0, 2) as usize];

    // Even cycles cut one way, odd cycles the other, and the chamber is on the
    // far side of the line from the commit.
    let left_cut = (obs.tick / SCRIPT_CYCLE_TICKS) % 2 == 0;
    let chamber = if left_cut { toward - EIGHTH_TURN } else { toward + EIGHTH_TURN };
    let commit = if left_cut { toward + EIGHTH_TURN } else { toward - EIGHTH_TURN };

    // ------------------------------------------------------------------ feet
    //
    // A body that has climbed a terrace has ground worth holding and does not
    // need to hurry; every other body closes at the full rate. Two speeds and not
    // three, because "below where I started" is not a state that wants a
    // *different* answer from level ground -- it wants the same one, harder, and
    // there is nothing above full. See `HELD_GROUND_SPEED` for why the slow end
    // is a half rather than a stop.
    let approach = if config.high_ground && climb > TERRACE {
        HELD_GROUND_SPEED
    } else {
        APPROACH_SPEED
    };
    let side = circle_side(foe.as_ref(), ground, config);
    let mut move_dir = match (foe, phase) {
        // **Nothing in sight: walk the way you are facing.** Not "hold", and the
        // fixture is the argument: the duel spawns two bodies 10.8 units apart
        // with a sight range of 9.6 and yaws that already point them at each
        // other, so a policy that waited to be seen would never fight anybody. In
        // this frame that intention is `(1, 0)` and needs no bearing at all.
        (None, _) => forward(approach),
        // Out of measure: close.
        (Some(_), _) if !in_measure => forward(approach),
        // **In measure with the arm against its own outer bound: step in rather
        // than reach further.** This is the decision `reach_headroom` was
        // published for. An arm at zero headroom has no extension left, so asking
        // for more buys a clamp and nothing else; the distance has to come out of
        // the feet. With headroom to spare the feet circle and the arm extends
        // instead, which is the other half of the same choice and is made below,
        // at `commit_reach`.
        (Some(_), ScriptPhase::Guard) if locked_out => forward(approach),
        // In measure and comfortable: hold the guard and circle.
        (Some(_), ScriptPhase::Guard) | (Some(_), ScriptPhase::Recover) => {
            strafe(side, CIRCLE_SPEED)
        }
        // **The attack closes rather than plants, and that is a correction the
        // articulated corpus paid for.** `AttackFootwork::Planted` is how the
        // reference table's silence was first resolved, and it decided the whole
        // of checkpoint A: a body decays to a standstill in about fourteen ticks
        // with `move_dir` zero, and the arm term alone could not reach
        // `CONTACT_ENERGY_FLOOR`, so 800/800 trials reached the tick limit and
        // measured the resolution instead of the physics. This script owes that
        // document nothing, so it takes the reading that can bill damage.
        (Some(_), ScriptPhase::Chamber) | (Some(_), ScriptPhase::Commit) => forward(approach),
    };
    // **The unwind, applied last and over everything.** A torso at its twist
    // budget cannot turn any further until the hips come round, and translation
    // lets the hips chase the achieved torso at twice the standing rate --
    // so a wound body that wants to keep facing this way has to put a foot down.
    // Forward, because unwinding costs ground and this spends it toward the foe
    // rather than sideways or backward.
    //
    // The commanded yaw below is deliberately left asking for the full turn. The
    // stance phase clamps the target itself and re-arms the step for as long as
    // the demand persists, so backing the request off would end the step early
    // and leave the twist where it was.
    if unwinding {
        move_dir = forward(APPROACH_SPEED);
    }

    // ------------------------------------------------------------------ arms
    //
    // The guard first and the weapon second, so that on a body whose guard hand
    // and weapon hand are the same hand -- a Brute -- the weapon rule wins.
    let guard = ArmTarget {
        // Centred on zero because zero is the body's own facing. The world-frame
        // sibling needs a yaw, a delta and a wrap-free clamp to say this.
        bearing: clamp_arc(toward, GUARD_ARC),
        height: guard_height,
        reach: if obs.arms[off].equipment.is_some() { GUARD_REACH } else { REST_REACH },
        // Enough authority to recover from a shove and little enough that a
        // converged arm bills no work for standing still.
        effort: Fx::HALF,
    };
    // Asking for full extension that the arm cannot hold is asking for a clamp,
    // and the clamp costs a tick of chasing a pose that will not arrive. So the
    // commit extends when there is room to extend and holds station when there is
    // not -- the feet having already been sent forward instead, above.
    let commit_reach = if locked_out { GUARD_REACH } else { Fx::ONE };
    let strike = |bearing, reach| ArmTarget {
        bearing,
        height: strike_height,
        reach,
        effort: Fx::ONE,
    };
    let weapon_target = match phase {
        // **This arm is also the "no geometry out of nothing" rule**, and it does
        // not need a second branch to be one: `in_measure` is false whenever
        // nobody is visible, so the phase above is already `Guard` and the three
        // arms that aim at somebody are unreachable without somebody to aim at.
        // The blade stands where the guard stands, at the striking height.
        ScriptPhase::Guard => ArmTarget { height: strike_height, ..guard },
        ScriptPhase::Chamber => strike(chamber, CHAMBER_REACH),
        ScriptPhase::Commit => strike(commit, commit_reach),
        ScriptPhase::Recover => ArmTarget {
            bearing: toward,
            height: strike_height,
            reach: REST_REACH,
            effort: Fx::ZERO,
        },
    };

    let mut arms = [guard; 2];
    arms[weapon] = weapon_target;

    let intent = match (phase.attacking(), foe) {
        (true, Some(f)) => Intent::Attack(f.id),
        _ => Intent::Hold,
    };

    // --------------------------------------------------------- swing planes
    //
    // **The plane is used rather than left neutral, and each arm's is a claim
    // about a collider.** Since session 07 the forearm is a swept capsule, so
    // where the elbow hangs is where the forearm can intercept and be
    // intercepted.
    //
    // *The weapon arm keeps the neutral plane*, which is the elbow below the
    // shoulder-to-hand line. That is not an omission: a swing wants its own
    // forearm underneath the blade rather than leading it into the target, and
    // zero is exactly that pose.
    //
    // *The guard arm folds its elbow inward*, a quarter turn toward the body's
    // centre line, so the forearm lies across the line the guard is covering
    // instead of hanging under it. A forearm under the line covers nothing.
    //
    // The sign is the geometry's and not a preference: `elbow_point` builds its
    // zero from "down, made perpendicular to the arm's axis" and its quarter from
    // `axis x side`, which for an arm pointing ahead is the arm's own left. Limb
    // 0's shoulder sits at `+shoulder_half_width` -- body-left -- so inward for it
    // is a *negative* quarter, and limb 1 is the mirror.
    //
    // **Chosen on the model and not on a corpus**, on the same terms the
    // articulated off hand's reach was: there is no embodied corpus yet, this is
    // the session that makes one possible, and one constant in one function is
    // what it costs to change when there is.
    let mut swing_plane = [Angle::ZERO; 2];
    swing_plane[off] = inward_plane(off);

    CommandV1 {
        core: CommandCoreV1 {
            move_dir,
            // The one absolute column an embodied command still carries, and it
            // has to be: `drive_stance` compares this with the *hips*, which are
            // a world bearing, so a relative yaw here would have nothing to be
            // relative to. Written as "the yaw I hold plus the turn I want" so
            // that the same situation at another yaw asks for the same turn.
            body_yaw: obs.body_yaw + toward,
            intent,
            arms,
            grips: [GripRequest::Keep; 2],
            // Nothing in this file carries a bow, and an arm asking to loose
            // while holding a blade is asking for nothing.
            releases: [ReleaseRequest::Keep; 2],
        },
        swing_plane,
    }
}

/// Which way to circle: the opening first, the ground second, the default last.
///
/// **The precedence is the argument.** An opponent wound to their limit cannot
/// follow you around to the side they are wound away from, and that window
/// closes the moment their feet move -- it lasts a step. The ground does not go
/// anywhere. So the tactical read takes the column when it has something to say
/// and the positional one keeps it the rest of the time, which also means the
/// elevation term owns the lateral column in every fight where nobody is wound
/// up rather than competing for it.
///
/// The sign: circling to my left carries me clockwise around an opponent facing
/// me, so *they* must turn clockwise -- negative -- to keep me in front of them.
/// A body already wound hard negative cannot, which is why the side is the
/// opposite of the sign of their twist.
fn circle_side(
    foe: Option<&ObservedOpponent>,
    ground: &GroundSense,
    config: ScriptConfig,
) -> i32 {
    let opening = foe
        .map(|f| f.stance)
        .filter(|s| s.present && s.twist_fraction.abs() >= OPENING_TWIST)
        .map(|s| if s.twist_fraction.is_positive() { -1 } else { 1 });
    let drift = (config.high_ground && ground.drift != 0).then_some(ground.drift);
    opening.or(drift).unwrap_or(DEFAULT_CIRCLE_SIDE)
}

/// The bearing to an opponent, measured from the body's own facing.
///
/// Z is the floor and a bearing has no vertical part; the arm's vertical is
/// `CombatHeight`. Two bodies at exactly one point answer "straight ahead",
/// which keeps the commanded yaw equal to the held one instead of asking for a
/// turn derived from a zero vector.
fn relative_bearing(obs: &Observation, foe: &ObservedOpponent) -> Angle {
    let delta = Vec2::new(
        foe.body_position.x - obs.body_position.x,
        foe.body_position.y - obs.body_position.y,
    );
    if delta.is_zero() { Angle::ZERO } else { delta.angle() - obs.body_yaw }
}

fn planar_gap(obs: &Observation, foe: &ObservedOpponent) -> Fx {
    Vec2::new(
        foe.body_position.x - obs.body_position.x,
        foe.body_position.y - obs.body_position.y,
    )
    .length()
}

/// How far apart two body origins can be with this weapon still touching that
/// body: the arm, plus what it is holding, plus the torso it has to reach.
///
/// Every term is a published column. The torso radius is the opponent's *local*
/// shape, which perception noise does not touch -- the noise displaces a
/// perceived body rigidly and leaves its dimensions alone -- so the only noisy
/// term in the comparison is the gap itself.
fn strike_range(obs: &Observation, foe: &ObservedOpponent, weapon: usize) -> Fx {
    let blade = obs.weapons[weapon].map_or(Fx::ZERO, |held| (held.tip - held.hilt).length());
    obs.arm_length + blade + foe.regions[BodyPart::Torso as usize].radius
}

/// `bearing`, held inside `arc` of the body's own facing.
///
/// **Clamped and never wrapped.** A threat directly behind arrives as a half turn
/// and is clamped to one end of the arc rather than folded back to a small offset
/// that would point the plate at nothing. A guard that wrapped would swing across
/// the chest to cover an attack coming from behind it, which is worse than not
/// covering it.
fn clamp_arc(bearing: Angle, arc: Angle) -> Angle {
    let limit = arc.raw() as i32;
    Angle::from_raw(bearing.delta(Angle::ZERO).clamp(-limit, limit) as u16)
}

/// A step along the body's own facing.
fn forward(speed: Fx) -> Vec2 {
    Vec2::new(Fx::ONE, Fx::ZERO).with_length(speed)
}

/// A step to body-left (`+1`) or body-right (`-1`).
fn strafe(side: i32, speed: Fx) -> Vec2 {
    Vec2::new(Fx::ZERO, Fx::from_int(side)).with_length(speed)
}

/// The plane that folds `limb`'s elbow toward the body's centre line.
fn inward_plane(limb: usize) -> Angle {
    if limb == 0 { Angle::ZERO - Angle::QUARTER } else { Angle::QUARTER }
}

/// The script, as a [`Policy`].
///
/// It holds the configuration and the one row of ground memory; everything else
/// is in the free function above. `reset` clears the memory and keeps the
/// configuration, on `StrikePlanner::reset`'s precedent and for its reason: a
/// corpus runner calls `reset` between seeds, so a reset that restored `Default`
/// wholesale would quietly demote every seed after the first to a policy nobody
/// selected -- and here that policy would be the *subject* standing in for the
/// control, which is the one substitution the measurement cannot survive.
#[derive(Clone, Copy, Debug, Default)]
pub struct ScriptedPolicy {
    config: ScriptConfig,
    ground: GroundSense,
}

impl ScriptedPolicy {
    pub fn new(config: ScriptConfig) -> ScriptedPolicy {
        ScriptedPolicy { config, ground: GroundSense::default() }
    }

    pub fn config(&self) -> ScriptConfig {
        self.config
    }

    /// What this body has learned about the floor. Public so a test can say
    /// *which* term moved a command rather than only that one did.
    pub fn ground(&self) -> GroundSense {
        self.ground
    }
}

impl Policy for ScriptedPolicy {
    fn decide(&mut self, obs: &Observation) -> CommandV1 {
        scripted_command_with(obs, self.config, &mut self.ground)
    }

    fn reset(&mut self) {
        self.ground = GroundSense::default();
    }
}

/// Stands there, arms slack, in the embodied frame. The control condition.
///
/// A separate type from the deleted `NeutralArticulatedPolicy` rather than an
/// adapter over it, for [`neutral_command`]'s reason: the neutral arm
/// bearing is not the same number in the two frames, and an adapter would have
/// had to convert one it cannot see the yaw for. The world frame went with the
/// articulated model in session 05, so the world substitutes *this* one now --
/// but the two *commands* are still both here and still differ in that one
/// column, because [`crate::neutral_world_command`] is the world-frame
/// base every composed command starts from before [`crate::into_torso_frame`].
/// The argument is therefore still live rather than only historical, and
/// `the_neutral_articulated_command_converts_to_the_neutral_embodied_command_exactly`
/// is what holds the one column to the one conversion.
#[derive(Clone, Copy, Debug, Default)]
pub struct NeutralPolicy;

impl Policy for NeutralPolicy {
    fn decide(&mut self, obs: &Observation) -> CommandV1 {
        neutral_command(obs)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use fx::Vec3;
    use sim::{
        EntityId, ObservedOpponentStance, ObservedStance, RegionVolume, Scenario, SegmentPose,
    };

    const ARM: Fx = Fx::from_ratio(3, 4);
    const TORSO_RADIUS: Fx = Fx::from_ratio(2, 5);
    /// Comfortably inside `strike_range`, which is `ARM + blade + TORSO_RADIUS`
    /// and is 1.15 with no blade in the fixture's hand.
    const NEAR: Fx = Fx::ONE;
    /// Comfortably outside it.
    const FAR: Fx = Fx::from_int(6);

    /// A body facing `+x` at the origin with one opponent `gap` away along the
    /// bearing `at`, both standing on the floor `z`.
    ///
    /// Deliberately built from `BLANK` field by field rather than from a world:
    /// the point of a pure function is that a test can state the situation
    /// exactly, and a fixture driven through `World` would be asserting about the
    /// simulation as well.
    fn situation(gap: Fx, at: Angle, z: Fx) -> Observation {
        let mut obs = Observation::BLANK;
        obs.subject = EntityId::new(0, 0);
        obs.capabilities = Observation::RIGHT_WEAPON
            | Observation::RIGHT_GRIP
            | Observation::LEFT_GRIP
            | Observation::SHIELD;
        obs.body_position = Vec3::new(Fx::from_int(4), Fx::from_int(3), z);
        obs.body_yaw = Angle::ZERO;
        obs.arm_length = ARM;
        obs.standing_height = Fx::from_ratio(9, 5);
        obs.arms[0].equipment = Some(2);
        obs.arms[1].equipment = Some(1);
        obs.stance = ObservedStance {
            present: true,
            reach_headroom: [Fx::HALF; 2],
            pelvis_fraction: Fx::ONE,
            ..ObservedStance::BLANK
        };
        obs.opponent_count = 1;
        obs.opponents[0] = opponent(obs.body_position, gap, at, z);
        obs
    }

    fn opponent(from: Vec3, gap: Fx, at: Angle, z: Fx) -> ObservedOpponent {
        let mut foe = ObservedOpponent::BLANK;
        foe.id = EntityId::new(1, 0);
        foe.body_position =
            Vec3::new(from.x + at.cos() * gap, from.y + at.sin() * gap, z);
        foe.regions[BodyPart::Torso as usize] = RegionVolume {
            lower: foe.body_position,
            upper: foe.body_position,
            radius: TORSO_RADIUS,
            present: true,
        };
        foe.stance = ObservedOpponentStance { present: true, ..ObservedOpponentStance::BLANK };
        foe
    }

    fn at_tick(obs: &Observation, tick: u32) -> Observation {
        Observation { tick, ..*obs }
    }

    fn tick_of(phase: ScriptPhase) -> u32 {
        (0..SCRIPT_CYCLE_TICKS).find(|&t| ScriptPhase::of(t) == phase).expect("every phase")
    }

    /// The first tick that is in `phase` **and** whose height clock has selected
    /// `height`.
    ///
    /// The two clocks have different periods on purpose, so a test that wants a
    /// height with room to step either way has to search for a tick rather than
    /// assume one: the first commit of the fight lands on LOW, where a step down
    /// clamps and the elevation term would look inert. That is what
    /// `a_body_that_has_taken_a_terrace_strikes_one_notch_lower` asserted about
    /// before it was corrected, and the failure read as a broken term rather than
    /// as a badly chosen tick.
    fn tick_of_height(phase: ScriptPhase, height: CombatHeight) -> u32 {
        (0..SCRIPT_CYCLE_TICKS * SCRIPT_HEIGHT_TICKS)
            .find(|&t| {
                ScriptPhase::of(t) == phase
                    && HEIGHTS[((t / SCRIPT_HEIGHT_TICKS) % 3) as usize] == height
            })
            .expect("the two clocks are coprime enough to meet")
    }

    // ------------------------------------------------------ the four capabilities

    /// **1 of 4: close and strike.** Out of measure the feet go forward and
    /// nothing swings; inside it, the commit puts the blade through the line at
    /// full effort and declares the target.
    #[test]
    fn a_body_out_of_measure_closes_and_one_in_measure_strikes() {
        let weapon = 1;
        let far = at_tick(&situation(FAR, Angle::ZERO, Fx::ZERO), tick_of(ScriptPhase::Commit));
        let closing = scripted_command(&far);
        assert!(closing.core.move_dir.x.is_positive(), "a body out of measure stood still");
        assert_eq!(closing.core.move_dir.y, Fx::ZERO, "closing is not a strafe");

        let near = at_tick(&situation(NEAR, Angle::ZERO, Fx::ZERO), tick_of(ScriptPhase::Commit));
        let striking = scripted_command(&near);
        assert_eq!(striking.core.intent, Intent::Attack(EntityId::new(1, 0)));
        assert_eq!(striking.core.arms[weapon].effort, Fx::ONE);
        assert_eq!(striking.core.arms[weapon].reach, Fx::ONE);
        // And the blade is off the line, because a cut that starts on the line
        // has nowhere to accelerate from.
        assert_ne!(striking.core.arms[weapon].bearing, Angle::ZERO);

        // The far body is not merely walking: it is walking *and not swinging*,
        // which is the half of "close and strike" that a move column cannot show.
        assert_eq!(closing.core.intent, Intent::Hold);
        assert!(closing.core.arms[weapon].effort < Fx::ONE);
    }

    /// Nothing in sight walks the way the body faces, and this is not a detail:
    /// the duel spawns two bodies 10.8 units apart with a sight range of 9.6, so
    /// a policy that held until it saw somebody would produce a corpus of two
    /// fighters standing in opposite corners. It invents no *geometry* while it
    /// does so -- the blade guards rather than swinging at a bearing to nobody --
    /// which is the distinction the articulated script draws in the same place.
    #[test]
    fn nothing_in_sight_walks_the_way_the_body_faces() {
        let mut alone = situation(FAR, Angle::ZERO, Fx::ZERO);
        alone.opponent_count = 0;
        alone.tick = tick_of(ScriptPhase::Commit);

        let command = scripted_command(&alone);
        assert!(command.core.move_dir.x.is_positive());
        assert_eq!(command.core.move_dir.y, Fx::ZERO);
        assert_eq!(command.core.intent, Intent::Hold);
        assert!(command.core.arms[1].effort < Fx::ONE, "it swung at nobody");
        assert_eq!(
            command.core.body_yaw, alone.body_yaw,
            "a body with nobody to face asked for a turn",
        );
    }

    /// **2 of 4: hold a guard while circling.** The feet move laterally and the
    /// guard arm's target does not move at all -- for a whole phase, in the torso
    /// frame, which is the thing a world-frame command could not say without
    /// re-deriving the pose from the yaw on every tick.
    #[test]
    fn a_body_in_measure_holds_its_guard_while_it_circles() {
        let off = 0;
        let base = situation(NEAR, Angle::ZERO, Fx::ZERO);
        let guard = tick_of(ScriptPhase::Guard);
        let first = scripted_command(&at_tick(&base, guard));

        assert!(first.core.move_dir.y.abs().is_positive(), "the body did not circle");
        assert_eq!(first.core.move_dir.x, Fx::ZERO, "circling is not an approach");
        assert!(first.core.arms[off].effort.is_positive(), "the guard went slack");

        // Held, tick by tick, for the whole phase. The window is inside one block
        // of both height clocks on purpose: a guard that changed height here
        // would be the clock doing its job and not the guard failing to hold.
        for tick in guard..guard + SCRIPT_PHASE_TICKS {
            let command = scripted_command(&at_tick(&base, tick));
            assert_eq!(
                command.core.arms[off], first.core.arms[off],
                "the guard moved at tick {tick}",
            );
            assert_eq!(command.core.move_dir, first.core.move_dir);
        }
    }

    /// **3 of 4: step to unwind a saturated twist.** The paired observation
    /// differs in exactly one column, and the baseline is a phase whose movement
    /// is otherwise lateral: a wound body stops circling and puts a foot forward.
    /// Translation activates the faster hip rate, but achieved torso yaw remains
    /// the hip target; movement direction is not a second steering authority.
    #[test]
    fn a_body_wound_to_its_limit_steps_instead_of_circling() {
        let settled = at_tick(&situation(NEAR, Angle::ZERO, Fx::ZERO), tick_of(ScriptPhase::Guard));
        let mut wound = settled;
        wound.stance.twist_fraction = Fx::from_ratio(19, 20);

        let circling = scripted_command(&settled).core.move_dir;
        let stepping = scripted_command(&wound).core.move_dir;

        assert_eq!(circling.x, Fx::ZERO, "the settled body did not circle");
        assert!(stepping.x.is_positive(), "the wound body did not step");
        assert_eq!(stepping.y, Fx::ZERO, "an unwinding step is not a strafe");

        // The other sign too, because a body wound the other way has the same
        // problem and the same answer -- the step is not a turn.
        let mut other = settled;
        other.stance.twist_fraction = -Fx::from_ratio(19, 20);
        assert_eq!(scripted_command(&other).core.move_dir, stepping);

        // And the yaw request is left asking for the whole turn, because backing
        // it off is what would end the step early.
        assert_eq!(
            scripted_command(&wound).core.body_yaw,
            scripted_command(&settled).core.body_yaw,
        );
    }

    /// **4 of 4a: a body that has climbed strikes lower.** The strike height
    /// steps one notch down and the guard's clock is untouched, which is what
    /// makes this a term rather than a second script.
    #[test]
    fn a_body_that_has_taken_a_terrace_strikes_one_notch_lower() {
        let weapon = 1;
        // A commit whose height clock has selected MID, so a step down has
        // somewhere to go.
        let commit = tick_of_height(ScriptPhase::Commit, CombatHeight::MID);
        let flat = at_tick(&situation(NEAR, Angle::ZERO, Fx::ZERO), commit);
        let up = at_tick(&situation(NEAR, Angle::ZERO, Fx::HALF), commit);

        let mut ground = GroundSense::default();
        let level = scripted_command_with(&flat, ScriptConfig::SEEKING, &mut ground);
        // The same memory, now told the body is standing half a unit higher than
        // it started: two terraces up the sculpted hill.
        let climbed = scripted_command_with(&up, ScriptConfig::SEEKING, &mut ground);

        assert_eq!(level.core.arms[weapon].height, CombatHeight::MID);
        assert_eq!(climbed.core.arms[weapon].height, CombatHeight::LOW);
        assert_eq!(
            climbed.core.arms[0].height, level.core.arms[0].height,
            "the elevation term moved the guard clock",
        );
        // And it slows: the ground is taken, so there is nothing to hurry for.
        assert!(climbed.core.move_dir.x < level.core.move_dir.x);
    }

    /// **4 of 4b: losing ground turns the circle the other way.** The seek half
    /// of the same term, and the only elevation signal in it is the body's own
    /// exact floor.
    #[test]
    fn losing_a_height_step_turns_the_circle_the_other_way() {
        let guard = tick_of(ScriptPhase::Guard);
        let level = at_tick(&situation(NEAR, Angle::ZERO, Fx::ZERO), guard);
        let lower = at_tick(&situation(NEAR, Angle::ZERO, -Fx::from_ratio(1, 4)), guard);

        let mut ground = GroundSense::default();
        let before = scripted_command_with(&level, ScriptConfig::SEEKING, &mut ground);
        assert_eq!(ground.drift, 0, "flat ground set a drift");
        let after = scripted_command_with(&lower, ScriptConfig::SEEKING, &mut ground);
        assert_eq!(ground.drift, DEFAULT_CIRCLE_SIDE);
        // The first loss only *starts* the drift, which is already the default
        // side, so the turn is visible on the second loss.
        let lower_still = at_tick(&situation(NEAR, Angle::ZERO, -Fx::HALF), guard);
        let turned =
            scripted_command_with(&lower_still, ScriptConfig::SEEKING, &mut ground);
        assert_eq!(ground.drift, -DEFAULT_CIRCLE_SIDE);
        assert_eq!(before.core.move_dir, after.core.move_dir);
        assert_eq!(turned.core.move_dir.y, -after.core.move_dir.y);
        assert!(turned.core.move_dir.y.abs().is_positive());
    }

    /// The control does not read the floor at all, which is what makes a measured
    /// difference on a sculpted corpus attributable to the term and to nothing
    /// else. Driven over the same descent the test above turns on.
    #[test]
    fn the_level_configuration_cannot_see_elevation_at_all() {
        let guard = tick_of(ScriptPhase::Guard);
        let mut ground = GroundSense::default();
        let mut commands = Vec::new();
        for z in [Fx::ZERO, -Fx::from_ratio(1, 4), -Fx::HALF, Fx::HALF] {
            let obs = at_tick(&situation(NEAR, Angle::ZERO, z), guard);
            commands.push(
                scripted_command_with(&obs, ScriptConfig::LEVEL, &mut ground)
                    .payload_bytes(),
            );
        }
        assert_eq!(ground, GroundSense::default(), "the control remembered a floor");
        for command in &commands {
            assert_eq!(command, &commands[0], "the control's command moved with the floor");
        }
    }

    // ------------------------------------------------------ headroom and the plane

    /// The column the observation block was added for, in the decision it was
    /// added for: with extension left the arm reaches and the feet circle; with
    /// none, the arm holds station and the distance comes out of the feet.
    #[test]
    fn a_locked_out_arm_steps_in_where_a_comfortable_one_reaches() {
        let weapon = 1;
        let commit = tick_of(ScriptPhase::Commit);
        let guard = tick_of(ScriptPhase::Guard);
        let comfortable = situation(NEAR, Angle::ZERO, Fx::ZERO);
        let mut locked = comfortable;
        locked.stance.reach_headroom[weapon] = Fx::ZERO;

        // The arm: reach further when there is room to.
        assert_eq!(
            scripted_command(&at_tick(&comfortable, commit)).core.arms[weapon].reach,
            Fx::ONE,
        );
        assert_eq!(
            scripted_command(&at_tick(&locked, commit)).core.arms[weapon].reach,
            GUARD_REACH,
        );

        // The feet: step in when there is not.
        let circling = scripted_command(&at_tick(&comfortable, guard)).core.move_dir;
        let stepping = scripted_command(&at_tick(&locked, guard)).core.move_dir;
        assert_eq!(circling.x, Fx::ZERO);
        assert!(stepping.x.is_positive(), "a locked-out arm did not step in");
        assert_eq!(stepping.y, Fx::ZERO);
    }

    /// The plane is used, per arm, and the two arms disagree about it -- which is
    /// the whole content of "the weapon's forearm trails under the blade and the
    /// guard's lies across the line".
    #[test]
    fn the_guard_arm_folds_its_elbow_inward_and_the_weapon_arm_does_not() {
        let command = scripted_command(&situation(NEAR, Angle::ZERO, Fx::ZERO));
        assert_eq!(command.swing_plane[1], Angle::ZERO, "the weapon arm left the neutral plane");
        assert_eq!(command.swing_plane[0], Angle::ZERO - Angle::QUARTER);
        // And the sign follows the shoulder rather than being written down twice:
        // a body whose weapon is its left hand folds the other elbow the other
        // way.
        let mut left_handed = situation(NEAR, Angle::ZERO, Fx::ZERO);
        left_handed.capabilities = Observation::LEFT_WEAPON;
        left_handed.arms[1].severed = true;
        let mirrored = scripted_command(&left_handed);
        assert_eq!(mirrored.swing_plane[1], Angle::QUARTER);
        assert_eq!(mirrored.swing_plane[0], Angle::ZERO);
    }

    /// The opponent's other stance column, and it is a timing read: a body whose
    /// feet are committed cannot answer, so the guard phase becomes a chamber.
    #[test]
    fn an_opponent_mid_step_is_attacked_a_phase_early() {
        let settled = at_tick(&situation(NEAR, Angle::ZERO, Fx::ZERO), tick_of(ScriptPhase::Guard));
        let mut committed = settled;
        committed.opponents[0].stance.stepping = true;

        assert_eq!(scripted_command(&settled).core.intent, Intent::Hold);
        assert_eq!(
            scripted_command(&committed).core.intent,
            Intent::Attack(EntityId::new(1, 0)),
        );
    }

    /// The opponent's twist chooses the side, and the sign is the one the
    /// mechanism implies: a body wound counter-clockwise cannot follow you
    /// further counter-clockwise, so you go the other way round it.
    #[test]
    fn a_wound_opponent_is_circled_toward_the_side_they_cannot_follow() {
        let base = at_tick(&situation(NEAR, Angle::ZERO, Fx::ZERO), tick_of(ScriptPhase::Guard));
        let mut wound_positive = base;
        wound_positive.opponents[0].stance.twist_fraction = Fx::from_ratio(19, 20);
        let mut wound_negative = base;
        wound_negative.opponents[0].stance.twist_fraction = -Fx::from_ratio(19, 20);

        let positive = scripted_command(&wound_positive).core.move_dir;
        let negative = scripted_command(&wound_negative).core.move_dir;
        assert!(positive.y.raw() < 0, "a positively wound opponent was circled the wrong way");
        assert!(negative.y.raw() > 0);
        assert_eq!(positive.y, -negative.y);
    }

    // ------------------------------------------------------ frame, blanks, memory

    /// **The policy is torso-relative, and this is what that means.** The same
    /// tactical situation at another yaw is the *same* command in every relative
    /// column, and the one absolute column moves by exactly the rotation.
    ///
    /// The rotation is a quarter turn and the fixture is rotated by swapping and
    /// negating coordinates rather than by `Vec2::rotate`, because both of those
    /// are exact: `atan2` folds by quadrant, so a quarter turn shifts a bearing by
    /// exactly 16,384 units and the comparison can be an equality rather than a
    /// tolerance. A bearing copied from the deleted `articulated_script.rs`,
    /// whose bearings were world quantities, would have failed this on the first
    /// column it touched -- which is the whole of why the two files were never
    /// one file with a flag.
    #[test]
    fn the_same_situation_at_two_yaws_produces_one_command() {
        let mut straight = situation(NEAR, Angle::ZERO, Fx::ZERO);
        straight.tick = 137;
        let mut turned = straight;
        turned.body_yaw = straight.body_yaw + Angle::QUARTER;
        let origin = straight.body_position;
        let offset = straight.opponents[0].body_position;
        let rotated = Vec3::new(
            origin.x - (offset.y - origin.y),
            origin.y + (offset.x - origin.x),
            offset.z,
        );
        turned.opponents[0] = opponent(origin, Fx::ZERO, Angle::ZERO, offset.z);
        turned.opponents[0].body_position = rotated;
        turned.opponents[0].regions[BodyPart::Torso as usize].radius = TORSO_RADIUS;

        let a = scripted_command(&straight);
        let b = scripted_command(&turned);
        assert_eq!(a.core.move_dir, b.core.move_dir);
        assert_eq!(a.core.arms, b.core.arms);
        assert_eq!(a.swing_plane, b.swing_plane);
        assert_eq!(a.core.intent, b.core.intent);
        assert_eq!(
            b.core.body_yaw,
            a.core.body_yaw + Angle::QUARTER,
            "the one absolute column did not follow the rotation",
        );
    }

    /// A blank observation is what a Legacy world, a stale identity and a corpse
    /// all answer, and the whole embodied block is zeros there. **What it
    /// degrades to is named rather than merely survived**: hold, feet still, both
    /// arms slack at the neutral plane.
    #[test]
    fn a_blank_observation_holds_rather_than_panicking() {
        let command = scripted_command(&Observation::BLANK);
        assert_eq!(command.payload_bytes(),
                   neutral_command(&Observation::BLANK).payload_bytes());
        assert_eq!(command.core.move_dir, Vec2::ZERO);
        assert_eq!(command.core.intent, Intent::Hold);
    }

    /// A *present* body with no legs -- what an Articulated world publishes --
    /// must not read the blank block as news. Two of its zeros mean something
    /// alarming when read straight, so the claim is specific: the command is the
    /// one a settled, comfortable body would have produced.
    #[test]
    fn a_body_with_no_stance_block_is_driven_as_a_settled_one() {
        let legged = at_tick(&situation(NEAR, Angle::ZERO, Fx::ZERO), tick_of(ScriptPhase::Guard));
        let mut legless = legged;
        legless.stance = ObservedStance::BLANK;
        legless.opponents[0].stance = ObservedOpponentStance::BLANK;

        assert_eq!(
            scripted_command(&legless).payload_bytes(),
            scripted_command(&legged).payload_bytes(),
            "a body with no legs was driven as a locked-out or wound one",
        );
        // Specifically: it circles rather than stepping in on a zero headroom it
        // does not have.
        assert_eq!(scripted_command(&legless).core.move_dir.x, Fx::ZERO);
    }

    /// Determinism, and the shape of the memory. The same observation twice is
    /// the same command; and `reset` puts a policy that has driven a fight back
    /// where a fresh one starts.
    #[test]
    fn one_observation_gives_one_command_and_reset_clears_the_ground() {
        let obs = at_tick(&situation(NEAR, Angle::ZERO, Fx::ZERO), 41);
        let mut policy = ScriptedPolicy::default();
        assert_eq!(policy.decide(&obs).payload_bytes(), policy.decide(&obs).payload_bytes());

        // Walk it down a hill so the memory has something in it.
        for z in [Fx::ONE, Fx::HALF, Fx::ZERO, -Fx::HALF] {
            policy.decide(&at_tick(&situation(NEAR, Angle::ZERO, z), 41));
        }
        assert_ne!(policy.ground(), GroundSense::default(), "the descent taught it nothing");
        policy.reset();
        assert_eq!(policy.ground(), GroundSense::default());

        let mut fresh = ScriptedPolicy::default();
        assert_eq!(policy.decide(&obs).payload_bytes(), fresh.decide(&obs).payload_bytes());
    }

    /// The control keeps its configuration across a reset. A harness that had to
    /// re-supply it after every rollout is a harness that can silently fail to,
    /// and the failure would look like the term simply not working.
    #[test]
    fn a_reset_clears_the_memory_and_keeps_the_configuration() {
        let mut policy = ScriptedPolicy::new(ScriptConfig::LEVEL);
        policy.decide(&situation(NEAR, Angle::ZERO, Fx::ONE));
        policy.reset();
        assert_eq!(policy.config(), ScriptConfig::LEVEL);
    }

    // ------------------------------------------------------ constants and bounds

    /// Both ends, because a bound from one side is satisfied by a range wider
    /// than the decision. Below a half an ordinary guard change would step;
    /// at one the step could only begin after the torso had already stopped.
    #[test]
    fn the_unwind_threshold_is_bounded_from_both_sides() {
        assert!(UNWIND_TWIST > Fx::HALF, "an ordinary guard change would force a step");
        assert!(UNWIND_TWIST < Fx::ONE, "the step could only start after the turn had stopped");
        assert!(OPENING_TWIST > Fx::HALF, "a body merely turning would read as an opening");
        assert!(OPENING_TWIST < Fx::ONE, "the opening would only be read after it had closed");
    }

    /// The two ground deadbands are bounded by the fixture they will be measured
    /// on, rather than by a second copy of `TERRAIN_HEIGHT_RAW_UNIT` -- which is
    /// not re-exported from `sim` and so cannot be read here.
    #[test]
    fn the_ground_deadbands_are_bounded_by_the_fixture_they_measure() {
        let slope = Scenario::embodied_slope();
        let at = |x: i32, y: i32| {
            slope.dungeon.height_at(Vec2::new(
                Fx::from_int(x) + Fx::HALF,
                Fx::from_int(y) + Fx::HALF,
            ))
        };
        // The hill's own riser, read off the fixture: one terrace, between the
        // outermost ring and the flat outside it.
        let riser = at(12, 4) - at(12, 3);
        assert!(riser.is_positive(), "the sculpted fixture stopped being a hill");
        assert_eq!(TERRACE, riser, "a terrace is not what the fixture calls a terrace");
        assert!(HEIGHT_STEP.is_positive(), "a step of nothing fires on flat ground");
        assert!(HEIGHT_STEP <= riser, "no rise this fixture has could ever set a drift");
        // And the summit is worth climbing: two terraces above the flat, so a
        // body that takes it clears `TERRACE` and steps its strike height.
        assert!(at(12, 8) - at(12, 3) > TERRACE);
    }

    /// The cycle is four equal phases and every tick falls in exactly one of
    /// them, which is what makes a phase table a partition rather than a set of
    /// overlapping conditions.
    #[test]
    fn every_tick_of_the_cycle_falls_in_exactly_one_phase() {
        let mut seen = [0u32; 4];
        for tick in 0..SCRIPT_CYCLE_TICKS {
            seen[match ScriptPhase::of(tick) {
                ScriptPhase::Guard => 0,
                ScriptPhase::Chamber => 1,
                ScriptPhase::Commit => 2,
                ScriptPhase::Recover => 3,
            }] += 1;
        }
        assert_eq!(seen, [SCRIPT_PHASE_TICKS; 4]);
        assert_eq!(ScriptPhase::of(SCRIPT_CYCLE_TICKS), ScriptPhase::of(0));
    }

    /// Every move vector this script can produce is one the world will accept.
    /// The magnitude check is `x*x + y*y <= 1` in raw units, and
    /// `Vec2::with_length` normalises by dividing and then multiplying -- so a
    /// unit answer can land a raw tick over.
    #[test]
    fn no_step_this_script_takes_is_over_the_magnitude_limit() {
        for side in [-1, 1] {
            for speed in [APPROACH_SPEED, CIRCLE_SPEED, HELD_GROUND_SPEED] {
                for step in [forward(speed), strafe(side, speed)] {
                    let (x, y) = (i64::from(step.x.raw()), i64::from(step.y.raw()));
                    assert!(x * x + y * y <= 65_536 * 65_536, "{step:?} is over the limit");
                }
            }
        }
    }

    /// A held weapon lengthens the measure, which is the only reason
    /// `strike_range` reads the blade at all.
    #[test]
    fn a_blade_in_the_hand_lengthens_the_measure() {
        let mut obs = situation(NEAR, Angle::ZERO, Fx::ZERO);
        let bare = strike_range(&obs, &obs.opponents[0], 1);
        obs.weapons[1] = Some(SegmentPose {
            hilt: obs.body_position,
            tip: Vec3::new(obs.body_position.x + Fx::ONE, obs.body_position.y, obs.body_position.z),
            radius: Fx::from_ratio(1, 25),
        });
        assert_eq!(strike_range(&obs, &obs.opponents[0], 1), bare + Fx::ONE);
        assert_eq!(bare, ARM + TORSO_RADIUS);
    }
}
