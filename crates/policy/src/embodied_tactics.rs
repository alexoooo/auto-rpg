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

use crate::{EmbodiedPolicy, StrikePlanner};
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

/// The strike planner behind the embodied seam.
///
/// **What it does not know is hips.** The planner was written against
/// articulated bodies with no stance; an embodied body has a torso the hips
/// constrain and a twist budget that forces a step. It will therefore ask for
/// turns the stance phase clamps, and a clamped turn is a plan arriving late.
/// That is expected rather than a defect of this adapter, and it is *measured*
/// rather than guessed -- `docs/performance/embodied-tactical-policy.md` records
/// the corpus this policy scored on its first outing, so a session that tunes
/// against it is tuning against a number and not a memory.
#[derive(Clone, Copy, Debug, Default)]
pub struct TacticalEmbodiedPolicy {
    planner: StrikePlanner,
}

impl TacticalEmbodiedPolicy {
    pub fn planner(&self) -> &StrikePlanner { &self.planner }
}

impl EmbodiedPolicy for TacticalEmbodiedPolicy {
    fn decide(&mut self, obs: &ArticulatedObservation) -> EmbodiedCommandV1 {
        into_torso_frame(obs, self.planner.decide(obs))
    }

    fn reset(&mut self) { self.planner.reset(); }
}
