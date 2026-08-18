//! One articulated body's ground truth, shaped for whoever draws it.
//!
//! This module owns no state and decides nothing. It exists so that the one
//! thing a presentation layer needs from `sim` -- "where is this body, right
//! now, in world coordinates" -- is a single struct with a single reading,
//! rather than a dozen columns each of which is private for a good reason.
//!
//! **Everything positional in here is world space.** Authoritative state is not:
//! [`ArmState::hand`](crate::ArmState::hand) and
//! [`ShieldPose::centre`](crate::ShieldPose::centre) are body-origin-relative,
//! because the actuator works in a frame the body carries with it and the
//! contact phase adds the origin exactly once, on purpose -- adding it twice
//! was a real defect class there. The consumer of a pose row has no body origin
//! and no reason to acquire one; it is a renderer holding a camera. So the
//! conversion happens here, once, and the frame is stated on every field that
//! could be read either way.
//!
//! Velocities are the deliberate exception and they say so where they are
//! declared. A velocity is not a point, the relative column is the one the
//! model actually integrates, and the sum that makes it absolute is written
//! down beside it.

use crate::anatomy::BodyPart;
use crate::combat::actuator::ShieldPose;
use crate::combat::geometry::SegmentPose;
use crate::command::Intent;
use crate::entity::EntityId;
use fx::{Angle, Fx, Vec3};

/// What one arm is doing, for an animation system that has no access to the
/// joint state and should not grow one.
///
/// The codes are frozen and append-only: they cross the wasm wall as a word in
/// the pose row, so a renumbering is a silent mis-animation on the far side
/// rather than a compile error. Add at the end or not at all.
#[repr(u8)]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum AnimationHint {
    /// Nothing is moving and nothing is being held ready.
    Idle = 0,
    /// At least one joint is still chasing its commanded target.
    Chasing = 1,
    /// Every joint has arrived and the grip holds a shield.
    ///
    /// This is deliberately **categorical rather than an effort threshold.**
    /// "Braced" naturally wants to mean "holding the shield up hard", which
    /// would need a number -- some effort or fatigue above which the pose reads
    /// as braced -- and this repository does not accept a threshold without a
    /// sweep behind it. A settled shield arm is a fact the state already
    /// carries and nobody has to defend. What would change this: v2-17 measures
    /// an effort term, at which point `Braced` can be split by it, and the
    /// append-only rule above says the split arrives as a new code rather than
    /// as a new meaning for this one.
    Braced = 2,
    /// The last solved tick keyed a contact naming this arm, and the arm came
    /// through it where the actuator left it.
    Contact = 3,
    /// The last solved tick keyed a contact that moved this arm: the commit
    /// wrote a joint pose the actuator did not ask for.
    Recoiling = 4,
    /// The arm is gone. Outranks everything else, because a severed arm has no
    /// pose to be idle or busy in.
    Severed = 5,
}

/// One arm of a published pose.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct PosedArm {
    /// The hand, in world space.
    pub hand: Vec3,
    /// The hand's velocity **relative to the body origin**, in world units per
    /// tick -- the column the actuator integrates, unconverted. The absolute
    /// velocity is [`ArticulatedPose::body_velocity`] plus this, which is the
    /// same sum the contact entry clamp forms; publishing the sum instead would
    /// throw away the only term a consumer cannot recover, since a body's own
    /// motion is already a separate field and the arm's is not.
    pub velocity: Vec3,
    /// Accumulated actuator fatigue, `[0,1]`.
    pub fatigue: Fx,
    /// Where the actuator is trying to put the hand, in world space.
    ///
    /// Derived from the stored articulated command through the same
    /// `hand_position` the integrator drives toward, so the two agree by
    /// construction. A slot that has never had a command accepted answers the
    /// neutral command the arm driver substitutes, which is the target it is
    /// genuinely chasing rather than a zero standing in for "none". On a
    /// two-handed grip the left arm chases nothing of its own -- it is mirrored
    /// off the right every tick -- so its target is the mirror of the right's.
    pub target_hand: Vec3,
}

/// Everything needed to draw one articulated body at the end of a tick.
///
/// Ground truth and not a perception: this is the authoritative state, with no
/// noise and no visibility filtering. That is exactly why it must not reach a
/// renderer unfiltered -- the host boundary owes it the same identity filtering
/// the worker protocol already applies to the legacy frame.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct ArticulatedPose {
    pub id: EntityId,
    /// The body origin, world space.
    ///
    /// **Z is the floor, and the floor now has a height.** This used to read
    /// "the model gives a body no vertical degree of freedom", and the
    /// correction is narrower than it looks: a body still has none *of its own*
    /// -- there is no jump, no crouch and no ballistic motion -- but the floor
    /// under it is a per-tile plateau, so `z` is a function of position rather
    /// than the constant zero. That restriction is what keeps the third axis out
    /// of the momentum solver, and it is why elevation cost this row no ABI
    /// change: words 2..4 have published body XYZ since the layout was frozen.
    pub body: Vec3,
    pub body_yaw: Angle,
    /// World units per tick, Z always zero. See [`PosedArm::velocity`].
    pub body_velocity: Vec3,
    /// Index 0 is [`LimbSlot::LeftArm`](crate::LimbSlot::LeftArm), 1 is
    /// [`LimbSlot::RightArm`](crate::LimbSlot::RightArm) -- the discriminant
    /// order the immutable spec bytes froze.
    pub arms: [PosedArm; 2],
    /// The held segment in each grip, world space, indexed like `arms`.
    ///
    /// A two-handed item fills the **right** slot only and leaves the left
    /// `None`, which is the ownership the contact phase already uses: one item
    /// is one collider, owned by `RightArm`. Drawing it from both hands would
    /// put a second sword in the fight, and the left arm's mirrored bearing
    /// would point it the wrong way.
    pub weapons: [Option<SegmentPose>; 2],
    /// The shield face, with `centre` already in world space. The remaining
    /// fields -- normal, extents, thickness -- are frame-independent and are
    /// carried through untouched.
    pub shield: Option<ShieldPose>,
    /// Structural integrity remaining, per region, in [`BodyPart`] order.
    pub integrity_fraction: [Fx; BodyPart::COUNT],
    /// Open wound carried, per region, over the same regional maximum.
    pub wound_fraction: [Fx; BodyPart::COUNT],
    pub blood_fraction: Fx,
    pub shock: Fx,
    /// Bit `part as u8` set for each severed region.
    pub severed_mask: u8,
    /// Left weapon bit 0, right weapon bit 1, shield bit 2.
    ///
    /// Every bit is the presence of the geometry in the same row, tested with
    /// the same predicate -- so a set bit and a `None` cannot disagree. In
    /// particular a two-handed item clears bit 0 along with `weapons[0]`.
    pub equipment_mask: u8,
    /// The stored command's intent, or [`Intent::Hold`] for a slot that has
    /// never had one accepted -- the same fallback the tick itself uses.
    pub intent: Intent,
    pub hints: [AnimationHint; 2],
}
