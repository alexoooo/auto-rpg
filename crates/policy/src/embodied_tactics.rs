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

use crate::{EmbodiedPolicy, Footwork, GuardRead, StrikePlanner};
use fx::{Angle, Vec2};
use sim::{ArticulatedCommandV1, ArticulatedObservation, EmbodiedCommandV1};

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
