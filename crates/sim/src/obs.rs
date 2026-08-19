use crate::anatomy::BodyPart;
use crate::combat::geometry::{RegionVolume, SegmentPose};
use crate::combat::spec::EquipmentSpecId;
use crate::entity::EntityId;
use crate::rules::MAX_CONTACTS;
use fx::{Angle, Fx, Vec3};

// ---------------------------------------------------- the articulated boundary
//
// One subject's articulated picture: its own joints exactly, and up to six
// opponents as limbs and volumes rather than as a radius and a blade angle.
// It rides inside [`Observation`] rather than replacing it, because the legacy
// contact block is a live contract with two shipped policies behind it, and a
// second observation type handed round beside the first is two boundaries to
// keep honest instead of one.
//
// **Every position in these structs is world space.** That is the rule
// [`crate::ArticulatedPose`] set for published ground truth and the reason it
// set it applies here unchanged: authoritative arm and shield poses are
// body-origin-relative because the actuator works in a frame the body carries,
// the conversion belongs in exactly one place, and adding an origin twice was a
// real defect class in the contact phase. The *feature vector* is the relative
// view, and it is relative to one origin for the whole block; see
// [`Observation::write_features`].

/// How many opponents one articulated observation carries.
///
/// The same six as [`MAX_CONTACTS`], written as the alias rather than as a
/// second literal -- `rules.rs` owns the number, and two sixes that agree by
/// coincidence are two sixes that can stop agreeing. Note this is a *fixed*
/// capacity and not [`crate::Stats::tracked_contacts`]: the legacy block
/// narrows what a dim character can hold in mind, and the articulated block
/// does not, because its width is a wasm row stride before it is a percept.
pub const MAX_ARTICULATED_OPPONENTS: usize = MAX_CONTACTS;

/// A shield face as an observer reads it.
///
/// Presence sits *inside* the struct rather than in an `Option`, which is the
/// opposite of what [`crate::ArticulatedPose`] does with the same geometry, and
/// both are right: a pose is Rust talking to Rust, while this row crosses the
/// wasm wall at a fixed stride and a fixed row cannot be absent -- only blank.
///
/// [`ShieldPose::thickness`] is deliberately not carried. Thickness is a
/// collision-response term -- it offsets the face the solver builds by half
/// itself -- and what a defender reads off an enemy shield is the plane it
/// covers: a centre, a normal, and two extents. A fourth extent nobody can act
/// on would widen the ABI for nothing.
///
/// [`ShieldPose::thickness`]: crate::ShieldPose::thickness
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct ObservedShield {
    pub present: bool,
    /// The face centre, world space.
    pub centre: Vec3,
    /// Unit outward normal. Frame-independent, so it is carried untouched.
    pub normal: Vec3,
    pub half_width: Fx,
    pub half_height: Fx,
}

impl ObservedShield {
    /// No shield. Every extent zero, so a consumer that forgets to test
    /// `present` draws a degenerate face rather than a plausible wrong one.
    pub const BLANK: ObservedShield = ObservedShield {
        present: false,
        centre: Vec3::ZERO,
        normal: Vec3::ZERO,
        half_width: Fx::ZERO,
        half_height: Fx::ZERO,
    };
}

/// The subject's own legs and joints: what a body with hips knows about itself.
///
/// **Every number here is a fraction of a constant a policy cannot reach.**
/// `STANCE_TWIST_LIMIT_RAW`, `STANCE_STEP_TICKS` and `PELVIS_HEIGHT_RAW` are
/// `pub` in `crate::combat::actuator` and deliberately not re-exported from
/// `sim`, so nothing outside this crate can normalise a raw twist, a raw tick
/// count or a raw pelvis height for itself. Publishing the raw values would
/// therefore publish numbers no reader could interpret -- the divisor is the
/// half that carries the meaning, and it is the half that stays inside. That is
/// the same argument [`Contact::min_strike_range`] makes about deriving and
/// handing over rather than leaving to be reconstructed, taken to the case where
/// reconstruction is not merely wasteful but impossible.
///
/// Blank on a Legacy or Articulated world, exactly as an absent articulated body
/// fills its block with zeros. `present` is a field and not an identity, and
/// that is the one place this struct breaks the rule
/// [`ObservedOpponent::present`] sets: a body squared, level and standing still
/// has zero twist, zero hip offset and no step running, so "nothing to report"
/// and "nothing is happening" would be the same bytes.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct ObservedStance {
    /// Whether this body has legs at all.
    pub present: bool,
    /// **The hips, measured from the torso** -- where the feet point, in the
    /// frame an embodied command is given in, so a policy that reads this and
    /// then turns is talking about the zero it just read.
    ///
    /// It is the same scalar as [`ObservedStance::twist_fraction`] with the
    /// opposite sign, because one measures the hips from the torso and the other
    /// the torso from the hips. The fraction keeps `StanceState::twist`'s sign,
    /// which is what the stance publication and every document in the repository
    /// call the twist; the angle keeps the command frame's. **Neither is
    /// derivable from the other outside this crate**, which is why both are here:
    /// the conversion between an angle and a fraction of the budget is a
    /// multiplication by the budget, and the budget is the constant that stays
    /// in.
    pub hip_yaw: Angle,
    /// The twist as a signed fraction of the budget, `[-1, 1]`. One is wound to
    /// the limit and has to step before the torso can turn any further, which is
    /// the whole tactic the stance model exists to create.
    pub twist_fraction: Fx,
    /// Pelvis height as a fraction of the standing pelvis, `[0, 1]`. One is
    /// upright; below one is a body that has spent height on speed or on twist.
    pub pelvis_fraction: Fx,
    /// How much of a forced step is left to run, `[0, 1]`. Zero is settled.
    pub step_fraction: Fx,
    /// Each elbow relative to its own shoulder, as a fraction of `arm_length`,
    /// indexed like [`ArticulatedObservation::arms`].
    ///
    /// Relative to the *shoulder* and not to the body origin, which is the one
    /// place this crate's articulated block rule -- one frame for everything --
    /// is deliberately not followed. An elbow is not a targeting fact: nothing
    /// asks whether its elbow is near an opponent's head. What it answers is
    /// which way the arm is folded, and that is a question about the arm alone.
    /// The shoulder is not published anywhere, so the subtraction has to happen
    /// here or not at all; dividing by `arm_length` rather than by sight range
    /// follows for the same reason, and puts the column near a half by
    /// construction, since the elbow sits at the upper link's length.
    pub elbow: [Vec3; 2],
    /// How much of the annulus each arm has left before the reach clamp bites,
    /// as a fraction of `arm_length` in `[0, 1]`. See `combat::limb`'s
    /// `reach_headroom`.
    ///
    /// **The one non-obvious column and the point of the block.** An arm can be
    /// commanded to a pose it cannot hold, so a fighter that can see how much
    /// extension it has left can choose between stepping in and reaching
    /// further; one that sees only where its hand is cannot tell a comfortable
    /// guard from a locked-out one.
    pub reach_headroom: [Fx; 2],
}

impl ObservedStance {
    /// No legs: what a Legacy or Articulated world answers, and what a blank
    /// observation carries.
    pub const BLANK: ObservedStance = ObservedStance {
        present: false,
        hip_yaw: Angle::ZERO,
        twist_fraction: Fx::ZERO,
        pelvis_fraction: Fx::ZERO,
        step_fraction: Fx::ZERO,
        elbow: [Vec3::ZERO; 2],
        reach_headroom: [Fx::ZERO; 2],
    };
}

/// An opponent's legs, as much of them as a look across the floor gives.
///
/// Narrower than [`ObservedStance`] by a long way, and the cut is where
/// proprioception stops. How far a pelvis has sunk and where an elbow is folded
/// are things a body knows about *itself*; what an opponent's silhouette says is
/// which way its feet point relative to its shoulders, and whether they are
/// moving.
///
/// **Exact, with no perception noise, and the argument is the one
/// [`ObservedOpponent::body_yaw`] already makes.** A body's bearing is its whole
/// silhouette, and the twist is the angle between two halves of that same
/// silhouette -- if a fighter can read where a body faces it can read that the
/// body is wound up, because being wound up is what a body *looks like*. Mid-step
/// is categorical for the reason [`ObservedOpponent::severed_mask`] is: feet
/// under you or feet moving is not a subtle cue. What a dim fighter gets wrong
/// stays what it always got wrong -- where the body is.
///
/// It is worth stating what that concedes, since the saturated twist is meant to
/// be an *opening*: reading it is free, so the opening is there for anybody who
/// looks. That is the right shape for a mechanic whose cost is paid by the body
/// that is wound up rather than by the one watching it, and the alternative
/// would have made an eighth draw in `observed_opponent`'s seven-draw stream,
/// which is an ABI and not a knob.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct ObservedOpponentStance {
    pub present: bool,
    /// Their twist as a signed fraction of the budget, `[-1, 1]`, signed like
    /// [`ObservedStance::twist_fraction`].
    pub twist_fraction: Fx,
    /// Whether their feet are committed. A flag and not a countdown: how many
    /// ticks a step has left to run is a fact about somebody else's actuator,
    /// and nothing in a silhouette says it.
    pub stepping: bool,
}

impl ObservedOpponentStance {
    pub const BLANK: ObservedOpponentStance = ObservedOpponentStance {
        present: false,
        twist_fraction: Fx::ZERO,
        stepping: false,
    };
}

/// One of the subject's own two arms, exactly.
///
/// Proprioception is free -- the same rule [`Observation::position`] states --
/// so nothing in here is blurred, however dim the body is. Perception noise
/// reaches opponents and nothing else.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct ObservedArm {
    /// The hand, world space.
    pub hand: Vec3,
    /// Where the actuator is trying to put the hand, world space.
    ///
    /// The same substitution [`crate::World::articulated_pose`] publishes: a
    /// slot that has never had a command accepted answers the neutral command
    /// the arm driver supplies, because that is the pose it is genuinely
    /// converging on. A zero here would say "chasing the map origin".
    pub target_hand: Vec3,
    /// The hand's velocity **relative to the body origin**, world units per
    /// tick.
    ///
    /// The one field in this struct that is not world space, matching
    /// [`PosedArm::velocity`] exactly -- and it has to match, because the two
    /// are the same column read twice and a consumer that added the body
    /// velocity to one and not the other would draw two different hands. The
    /// absolute velocity is [`ArticulatedObservation::body_velocity`] plus
    /// this; publishing the sum would throw away the only term a reader cannot
    /// recover.
    ///
    /// [`PosedArm::velocity`]: crate::PosedArm::velocity
    pub velocity: Vec3,
    /// Accumulated actuator fatigue, `[0,1]`.
    pub fatigue: Fx,
    /// This arm's regional integrity remaining, `[0,1]`.
    pub integrity_fraction: Fx,
    pub severed: bool,
    /// Which immutable equipment row this grip holds, or `None` for an empty
    /// hand. Categorical and exact: what is in a hand is legible at a glance,
    /// which is the argument [`Contact::action`] already makes.
    ///
    /// **A two-handed item appears in both arms**, which is the one place a
    /// published equipment fact does not follow the one-collider ownership
    /// rule. It is the truth of the grip -- both hands are on the haft, and
    /// both grip capability bits say so -- while
    /// [`ArticulatedObservation::LEFT_WEAPON`] and the drawn geometry answer
    /// the different question of which arm owns the collider.
    pub equipment: Option<EquipmentSpecId>,
}

impl ObservedArm {
    pub const BLANK: ObservedArm = ObservedArm {
        hand: Vec3::ZERO,
        target_hand: Vec3::ZERO,
        velocity: Vec3::ZERO,
        fatigue: Fx::ZERO,
        integrity_fraction: Fx::ZERO,
        severed: false,
        equipment: None,
    };
}

/// One perceived opponent, as limbs and volumes.
///
/// Everything geometric in here has been displaced by the observer's perception
/// noise, and displaced *rigidly*: the body position and velocity carry their
/// own error, and every region, weapon and shield keeps its exact local shape
/// and rides along on the same displacement. A per-point error would shear a
/// body into disconnected parts, which is not what bad eyesight does and is not
/// something a defender could learn to fight.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct ObservedOpponent {
    /// Full identity, exact. An unused row carries [`EntityId::NONE`], which is
    /// what [`ObservedOpponent::present`] reads: no hidden identity may enter a
    /// row nobody is standing in.
    pub id: EntityId,
    /// The body origin, world space, as measured. Z is the floor.
    pub body_position: Vec3,
    /// World units per tick, as measured.
    pub body_velocity: Vec3,
    /// Exact. A body's bearing is its whole silhouette; what a dim fighter gets
    /// wrong is where the body *is*, on the argument [`Contact::limb_swing`]
    /// already makes about the difference between seeing and reading.
    pub body_yaw: Angle,
    /// The five swept volumes in [`BodyPart`] order, world space. The head is
    /// the degenerate capsule with `lower == upper` -- the reference's "head
    /// sphere" -- rather than a second shape that could disagree with the one
    /// the contact phase sweeps.
    pub regions: [RegionVolume; BodyPart::COUNT],
    /// The held segment in each grip, world space, indexed like
    /// [`ArticulatedObservation::arms`]. A two-handed item fills the **right**
    /// slot only, which is the ownership the contact phase and the pose row
    /// both use: one item is one collider.
    pub weapons: [Option<SegmentPose>; 2],
    pub shield: ObservedShield,
    /// Bit `part as u8` per severed region. Categorical and exact: a missing
    /// arm is not a subtle cue.
    pub severed_mask: u8,
    /// **Ticks until this opponent arrives, saturating at one.**
    ///
    /// A one-tick imminence signal and not a countdown: the reference's
    /// `clamp(distance / closing_speed, 0, 1)` divides world units by world
    /// units per tick, so anything further away than one tick of closing reads
    /// exactly one, and the number only becomes informative inside the last
    /// stride. Zero is "already here". A receding or stationary pair is one.
    pub contact_timing: Fx,
    /// Their legs, or [`ObservedOpponentStance::BLANK`] on a model with none.
    pub stance: ObservedOpponentStance,
}

impl ObservedOpponent {
    /// An empty row: no identity, no geometry, and a timing of zero rather than
    /// the "nothing is closing" one, because a blank row must write blank
    /// features and the feature writer skips it entirely.
    pub const BLANK: ObservedOpponent = ObservedOpponent {
        id: EntityId::NONE,
        body_position: Vec3::ZERO,
        body_velocity: Vec3::ZERO,
        body_yaw: Angle::ZERO,
        regions: [RegionVolume {
            lower: Vec3::ZERO,
            upper: Vec3::ZERO,
            radius: Fx::ZERO,
            present: false,
        }; BodyPart::COUNT],
        weapons: [None; 2],
        shield: ObservedShield::BLANK,
        severed_mask: 0,
        contact_timing: Fx::ZERO,
        stance: ObservedOpponentStance::BLANK,
    };

    /// Whether anybody is standing in this row.
    ///
    /// Read off the identity rather than off a parallel flag, so a row cannot
    /// be present and anonymous or absent and named.
    #[inline]
    pub fn present(&self) -> bool {
        !self.id.is_none()
    }
}

/// What one articulated body knows when it decides.
///
/// The articulated twin of [`Observation`], and the same promise: if a policy
/// needs something that is not in here, it cannot have it. The difference is
/// what a decision is *about*. A legacy contact is a disc with a blade angle
/// and the question is where to stand; an articulated opponent is five volumes
/// and two blades and the question is which of them to put steel into.
///
/// Subject state is exact and opponent state is measured; see
/// [`ObservedOpponent`]. Every categorical fact on both sides -- identity,
/// equipment, severance, [`ArticulatedObservation::capabilities`] -- is exact,
/// because those are the facts a glance settles.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct ArticulatedObservation {
    pub tick: u32,
    /// The subject, or [`EntityId::NONE`] for a blank observation. See
    /// [`ArticulatedObservation::present`].
    pub subject: EntityId,
    /// What this body can currently do, as a bit mask. See the eight associated
    /// constants below for the bit order and the rule behind each one.
    pub capabilities: u32,
    /// The body origin, world space, exact. Z is the floor.
    pub body_position: Vec3,
    pub body_yaw: Angle,
    /// World units per tick, exact.
    pub body_velocity: Vec3,
    /// Index 0 is [`LimbSlot::LeftArm`](crate::LimbSlot::LeftArm), 1 is
    /// [`LimbSlot::RightArm`](crate::LimbSlot::RightArm) -- the discriminant
    /// order the immutable spec bytes froze.
    pub arms: [ObservedArm; 2],
    pub shield: ObservedShield,
    pub blood_fraction: Fx,
    pub shock: Fx,
    /// Structural integrity remaining, per region, in [`BodyPart`] order.
    pub integrity_fraction: [Fx; BodyPart::COUNT],
    /// Open wound carried, per region, over the same regional maximum.
    pub wound_fraction: [Fx; BodyPart::COUNT],
    /// Bit `part as u8` set for each severed region.
    pub severed_mask: u8,
    /// How many of [`ArticulatedObservation::opponents`] are filled, nearest
    /// first.
    pub opponent_count: u8,
    pub opponents: [ObservedOpponent; MAX_ARTICULATED_OPPONENTS],
    /// Immutable body dimensions needed to reason about reach. These are
    /// outward views of the subject's anatomy row; they are deliberately not
    /// columns in the legacy feature vector.
    pub standing_height: Fx,
    pub arm_length: Fx,
    pub hand_radius: Fx,
    /// The subject's held segments in world space. Indexed like [`Self::arms`]
    /// and following the same one-collider ownership rule as opponent weapons.
    pub weapons: [Option<SegmentPose>; 2],
    /// The subject's own legs and joints, or [`ObservedStance::BLANK`] on a
    /// model with none.
    ///
    /// **Last, and it stays last**, for the reason
    /// [`Observation::articulated`] is last: its feature block is appended
    /// after the articulated one and everything below is frozen against weights
    /// that do not exist yet but will. Keeping the struct order and the vector
    /// order the same is what makes that easy to see.
    pub stance: ObservedStance,
}

impl ArticulatedObservation {
    /// **The body can translate.** Set unless the legs are severed.
    ///
    /// Categorical, and the alternative was rejected rather than overlooked:
    /// `move_authority` is the number the actuator actually multiplies by, it
    /// is `integrity * (1 - shock)`, and a bit reading `move_authority > 0`
    /// would flip on and off as shock crossed one. The reference calls these
    /// bits noise-free, and a product of two continuous terms is not. What is
    /// lost is "my legs are ruined but attached", and that is not lost at all:
    /// the legs' integrity fraction is feature 53 and shock is feature 48, so a
    /// policy that wants the graded answer already has both terms.
    pub const MOVEMENT: u32 = 1 << 0;
    /// **The body can turn.** The same legs, and today the same bit value.
    ///
    /// `settle_anatomy` writes one legs factor into both `move_authority` and
    /// `turn_authority` -- "one factor, written twice", because translation and
    /// turning share the legs and the contract deliberately does not give them
    /// separate pools yet. Two bits rather than one because the reference
    /// reserves the split, and a mask that collapsed them would have to widen
    /// (and renumber every bit above it) on the day they diverge.
    pub const TURNING: u32 = 1 << 1;
    /// **The left grip holds something.** `GripState::equipment_slot.is_some()`.
    ///
    /// Occupancy rather than "the arm is intact", and the two are not a
    /// trade-off: `apply_articulated_grips` clears the grip of a severed arm
    /// every tick, so an occupied grip *entails* a present arm and this bit
    /// carries strictly more. Severance on its own is already published twice
    /// over ([`ObservedArm::severed`] and [`ArticulatedObservation::severed_mask`]),
    /// and a capability bit that restated it would be the only bit in the mask
    /// saying nothing new.
    pub const LEFT_GRIP: u32 = 1 << 2;
    /// **The right grip holds something.** See [`ArticulatedObservation::LEFT_GRIP`].
    pub const RIGHT_GRIP: u32 = 1 << 3;
    /// **A weapon swings from the left hand**: the left grip holds an item with
    /// segment geometry, under the pose row's ownership rule -- so a two-handed
    /// item clears this bit and sets the right one instead. Read off the drawn
    /// geometry rather than off the grip, so a set bit and a published weapon
    /// cannot disagree.
    pub const LEFT_WEAPON: u32 = 1 << 4;
    /// **A weapon swings from the right hand.** See
    /// [`ArticulatedObservation::LEFT_WEAPON`].
    pub const RIGHT_WEAPON: u32 = 1 << 5;
    /// **A shield is held**, in either hand. One bit and not two, because the
    /// shield pose the sim derives is one face however many grips are on it.
    pub const SHIELD: u32 = 1 << 6;
    /// **The held item binds both hands.** The fact that makes the off hand
    /// unavailable: on a two-handed grip the left arm is mirrored off the right
    /// every tick and has no command of its own, so a policy that issued one
    /// would be talking to nobody.
    pub const TWO_HANDED: u32 = 1 << 7;

    /// An observation of nothing: no subject, no opponents, no geometry.
    ///
    /// What a Legacy world, a stale identity and a corpse all answer, and what
    /// [`Observation::blank`] fills. The subject is [`EntityId::NONE`] rather
    /// than a zeroed handle because a zeroed handle names slot 0 generation 0 --
    /// a live fighter in every fixture in the repository -- and "blank" has to
    /// be a value no live body can take.
    pub const BLANK: ArticulatedObservation = ArticulatedObservation {
        tick: 0,
        subject: EntityId::NONE,
        capabilities: 0,
        body_position: Vec3::ZERO,
        body_yaw: Angle::ZERO,
        body_velocity: Vec3::ZERO,
        arms: [ObservedArm::BLANK; 2],
        shield: ObservedShield::BLANK,
        blood_fraction: Fx::ZERO,
        shock: Fx::ZERO,
        integrity_fraction: [Fx::ZERO; BodyPart::COUNT],
        wound_fraction: [Fx::ZERO; BodyPart::COUNT],
        severed_mask: 0,
        opponent_count: 0,
        opponents: [ObservedOpponent::BLANK; MAX_ARTICULATED_OPPONENTS],
        standing_height: Fx::ZERO,
        arm_length: Fx::ZERO,
        hand_radius: Fx::ZERO,
        weapons: [None; 2],
        stance: ObservedStance::BLANK,
    };

    /// Whether this observation describes a body at all.
    ///
    /// There is no `present` column: the identity is the flag, exactly as it is
    /// for [`ObservedOpponent`], so a present-but-anonymous observation cannot
    /// be constructed.
    #[inline]
    pub fn present(&self) -> bool {
        !self.subject.is_none()
    }

    /// The filled opponent rows, nearest first.
    #[inline]
    pub fn opponents(&self) -> &[ObservedOpponent] {
        &self.opponents[..self.opponent_count as usize]
    }

    /// Whether every bit in `mask` is set. `obs.can(ArticulatedObservation::SHIELD)`.
    #[inline]
    pub fn can(&self, mask: u32) -> bool {
        self.capabilities & mask == mask
    }
}

// **This file had a test module and it went with the feature vector.** Every
// test in it -- thirteen of them, roughly six hundred lines -- asserted a column
// index, a block width, or a zero fill in the 954-element vector
// `Observation::write_features` produced: that the articulated block was 472 wide,
// that an unused opponent row wrote sixty-eight zeroes, that each documented
// column landed on its documented index. There is no vector left for any of them
// to be about.
//
// What survives here is `ArticulatedObservation` and the `Observed*` rows, and
// they are exercised where they are produced rather than where they are declared:
// `crates/sim/src/world/query.rs` has the observation tests, and
// `crates/learn-core/src/digest.rs` owns the feature layout that actually ships.
