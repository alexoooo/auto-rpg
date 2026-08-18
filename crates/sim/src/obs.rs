use crate::action::{ActionKind, Role};
use crate::anatomy::BodyPart;
use crate::combat::geometry::{RegionVolume, SegmentPose};
use crate::combat::spec::EquipmentSpecId;
use crate::command::Order;
use crate::entity::{EntityId, Faction};
use crate::hand::Hand;
use crate::rules::MAX_CONTACTS;
use fx::{Angle, Fx, Vec2, Vec3};

/// One perceived unit.
///
/// Everything here except `id` and the two size fields has already been
/// degraded by the observer's perception stat, so two characters looking at the
/// same enemy do not necessarily see it in the same place -- or see its blade
/// pointing the same way.
///
/// That last part is what makes `perception` a fighting stat rather than a
/// scouting one. Blocking and dodging are both bets on where a blade will be in
/// a few ticks, and the inputs to that bet are `limb_angle` and `limb_spin`.
/// A dim character does not merely block late; it blocks the wrong line.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
pub struct Contact {
    pub id: EntityId,
    /// Position relative to the observer, as perceived.
    pub offset: Vec2,
    /// `offset.length()`, precomputed because every policy wants it.
    pub distance: Fx,
    /// Perceived health, `0..=1`.
    pub hp_frac: Fx,
    /// Body size. Not degraded by perception -- how big something is stays
    /// legible even when where it is does not. Policies need it to work out
    /// their own reach.
    pub radius: Fx,
    /// Blade length beyond the body at full extension. Like `radius`, a fact
    /// about the object rather than about its state, so it arrives clean: you
    /// can see how long a sword is well before you can read where it is going.
    pub action_length: Fx,
    /// **Distance from this enemy's centre inside which its blade cannot reach
    /// the speed a blow requires** -- its dead zone, as judged from here.
    ///
    /// The single most valuable geometric fact about an opponent, and until now
    /// the one thing a fighter could not work out. Impact is `spin x arm`, so
    /// every weapon is harmless close in and worst at the tip; a `Contact` said
    /// how *long* an enemy's blade was but nothing about how fast it could be
    /// swung, so its dead zone was not derivable and a policy had to be told
    /// where to stand by a hand-set gene. That was the open question in
    /// `DESIGN.md`, and this is the answer to it.
    ///
    /// Perceived, and blurred by the **un-scaled** perception noise rather than
    /// the range-scaled figure everything around it uses. That is deliberate
    /// and it is the one asymmetry in this struct worth arguing about: every
    /// other field here is a *measurement*, and measurements genuinely get
    /// easier as you close. This is a judgement about a capability, and
    /// standing nose to nose with someone tells you nothing new about how hard
    /// they can swing.
    ///
    /// The error it produces is asymmetric in a way that is worth knowing
    /// about, because it is the whole of what perception buys in a duel. Guess
    /// *low* and the floor in a policy's own spacing rule protects you. Guess
    /// *high* and you stand off a weapon you could have crowded, which against
    /// a Brute is the difference between four points a blow and thirty. A dim
    /// fighter respects a big weapon's reach and dies to it; a sharp one knows
    /// the thing is at its worst up close.
    pub min_strike_range: Fx,
    /// **What one clean blow from this enemy costs, as a fraction of the
    /// observer's own maximum health.**
    ///
    /// The exchange rate, from the receiving side. `0.32` is what a Brute's axe
    /// takes off a Fighter; the same axe against a Skitterer is `0.74`, and a
    /// Skitterer's knife against that Fighter is `0.08`. Those are four-to-one
    /// differences in what an exchange is worth risking, and until this field
    /// existed a policy could not tell them apart at all -- `power`, `weight`
    /// and `max_hp` are all absolute, none of them is in the observation, and
    /// none of them should be. This is the relative figure they exist to
    /// produce.
    ///
    /// Peak rather than expected: the tip, at top spin, through no shield. What
    /// a blow actually costs depends on where on the arc it lands and what the
    /// defender does about it, and those are the fight. This is the number you
    /// can size up before it starts.
    ///
    /// May exceed `1`, which reads as "this can kill you outright from full
    /// health" and is worth being able to say. Blurred by the **un-scaled**
    /// noise, for the reason argued at [`Contact::min_strike_range`].
    pub threat: Fx,
    /// **What one clean blow from the observer costs this enemy, as a fraction
    /// of *its* maximum health.**
    ///
    /// [`Contact::threat`] mirrored. Together they are the exchange rate in
    /// both directions, and neither is much use alone: knowing you are two
    /// blows from death is only half of the decision, because the answer is
    /// completely different depending on whether the thing in front of you is
    /// five blows from death or one.
    ///
    /// Note this is a fact about the *pairing* and not about the enemy, exactly
    /// as [`Contact::offset`] is. The same Brute is `0.11` frail to a Fighter
    /// and `0.05` to a Skitterer.
    pub frailty: Fx,
    /// **How much ground one clean blow from this enemy costs the observer**,
    /// in the observer's own body radii.
    ///
    /// [`Contact::threat`] on the momentum side, and a genuinely different
    /// question rather than the same one rescaled. Damage is bounded by the
    /// muscle that throws the blow and knockback is bounded by nothing, so the
    /// two rank the roster differently: a Brute's axe is worth about four times
    /// a Skitterer's knife in damage and about thirty-five times as much in
    /// ground, and the archetype that most needs to know the second figure --
    /// the light one, which is the one that gets thrown -- is the one whose
    /// perception is usually good enough to read it.
    ///
    /// Stopping distance and not peak speed: what a fighter has to decide is
    /// whether it can afford to be somewhere else, and where it ends up is the
    /// answer to that. Blurred by the **un-scaled** perception noise, for the
    /// reason argued at [`Contact::min_strike_range`].
    pub knockback_taken: Fx,
    /// **How much ground one clean blow from the observer costs this enemy**, in
    /// *its* body radii. [`Contact::knockback_taken`] mirrored, exactly as
    /// [`Contact::frailty`] mirrors [`Contact::threat`].
    ///
    /// The number that decides whether shoving is worth anything against this
    /// opponent, and it is much more lopsided than the damage pair: against a
    /// Brute it is near zero for everybody, and against a Skitterer it is
    /// several body-widths for everybody. Weight is a defence that no stat buys
    /// and no skill answers, which is the point of having it.
    pub knockback_dealt: Fx,
    /// **What this enemy weighs, as a multiple of the observer's own weight.**
    /// Above one is heavier than you.
    ///
    /// The question a body-check is about, and the pair above cannot answer it.
    /// [`Contact::knockback_dealt`] says what a *blow* moves this enemy, and a
    /// blow is a weapon hitting a body -- so it is a fact about the observer's
    /// axe as much as about the enemy's weight. Walking into somebody is a body
    /// hitting a body, and `World::separate` splits that collision on the mass
    /// ratio and nothing else. A Skitterer and a Fighter with the same sword
    /// deal identical knockback and shoulder each other very differently.
    ///
    /// Not derivable from [`Contact::radius`] either, which is the visible proxy
    /// and the reason this field is perceived rather than exact: mass goes as
    /// `density * radius^2` and density is real -- a Brute is 15% denser than it
    /// looks and a Skitterer 20% lighter. Sizing somebody up is a judgement, and
    /// like [`Contact::min_strike_range`] it is one that standing closer does not
    /// improve, so it is blurred by the **un-scaled** noise.
    ///
    /// A ratio rather than an absolute weight for the same reason
    /// [`Contact::threat`] is a fraction of a health bar: the observer's own mass
    /// is not in the observation and should not be. What a fighter needs is not
    /// how much the other one weighs but whether it can move them.
    pub heft: Fx,
    /// Which way the body is heading, as perceived.
    /// Where this contact is going, world units per tick, blurred by
    /// perception like everything else about it.
    ///
    /// A *world-frame* velocity rather than a closing rate, because
    /// [`Observation::velocity`] is right there and the difference of the two is
    /// the closing rate -- while the reverse, recovering an absolute velocity
    /// from a closing one, is not possible at all. It is the raw quantity.
    ///
    /// This is what makes a moving enemy hittable. A cut takes its windup and
    /// its strike to arrive, an enemy at a walk covers most of a body in that
    /// time, and a fighter aiming at where its opponent *is* will keep cutting
    /// through the space behind it.
    pub velocity: Vec2,
    pub facing: Angle,
    /// Perceived bearing of the enemy's sword hand.
    pub limb_angle: Angle,
    /// Perceived angular velocity of that hand, raw angle units per tick.
    pub limb_reach: Fx,
    pub limb_spin: Fx,
    /// **What the enemy's sword hand is doing.** Arrives *exact*.
    ///
    /// Deliberately not blurred, and the asymmetry is the design. A blade
    /// hauled back over a shoulder is not a subtle cue -- anyone can see that a
    /// blow is coming. What separates fighters is knowing *when* it lands and
    /// *where*, and those two are blurred hard. A dim character is not blind to
    /// the attack; it is late and it guesses the line wrong, which is a much
    /// more interesting way to lose than not noticing.
    pub limb_swing: crate::hand::Swing,
    /// Perceived ticks left in that phase, and the single most valuable number
    /// in the observation.
    ///
    /// In [`Swing::Windup`] it is how long there is to answer -- to step off the
    /// line, get the shield across, or land something first. In
    /// [`Swing::Recover`] it is how long the enemy is helpless, which is the
    /// whole of a punish. Blurred in proportion to perception noise, so a dim
    /// character commits to its dodge at the wrong moment.
    ///
    /// [`Swing::Windup`]: crate::hand::Swing::Windup
    /// [`Swing::Recover`]: crate::hand::Swing::Recover
    pub limb_left: Fx,
    /// Perceived line the running attack is aimed along.
    ///
    /// Not the same as [`Contact::limb_angle`], and confusing the two is the
    /// mistake this field exists to prevent: during a windup the blade is
    /// *cocked away* from where it is going, so a defender that covers the
    /// blade covers the one bearing the cut is guaranteed not to arrive from.
    /// Reading the line off the pose is something a fighter genuinely can do, so
    /// the sim hands it over rather than making every policy reverse-engineer
    /// it -- blurred, because reading it well is the skill.
    pub limb_line: Angle,
    /// **What this enemy is holding.** Arrives *exact*, like [`Contact::limb_swing`]
    /// and for the same reason: a shield is a shield at a glance, and a club is
    /// obviously not a knife. What a dim fighter gets wrong is still *when* the
    /// blow lands and along which line, and both of those stay blurred.
    ///
    /// Deliberately **not** accompanied by what the enemy has stowed. You see
    /// what is in their hand and nothing else, which is what makes a loadout a
    /// real bluff: the fighter behind that guard might have a club or a punch
    /// waiting, and you find out when it comes out.
    pub action: ActionKind,
    /// Guard arc half-width of what it is holding, raw angle units. Zero unless
    /// that is a guard, which is exactly how a policy tells "it cannot be hit
    /// from there" from "it cannot block at all".
    pub action_arc: u16,
}

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

/// Everything an agent knows when it decides.
///
/// This is the *entire* input side of the agent boundary. If a policy needs
/// something that is not in here, it cannot have it -- which is the point:
/// the sim can hold a hundred fields of ground truth, and what leaks into a
/// decision is exactly what perception allows.
#[derive(Clone, Debug)]
pub struct Observation {
    pub tick: u32,
    pub me: EntityId,
    pub faction: Faction,
    /// Own position, known exactly. Proprioception is free.
    pub position: Vec2,
    /// Own velocity, world units per tick. Exact rather than perceived: a body
    /// knows what its own feet are doing.
    pub velocity: Vec2,
    pub hp_frac: Fx,
    /// `0` the hand is dead from a blow just landed, `1` free to strike.
    pub attack_ready: Fx,
    /// Own body size. With [`Contact::radius`] this is enough for a policy to
    /// compute exactly how close it must get to land a hit.
    pub radius: Fx,
    /// Own blade length beyond the two radii, at full extension.
    pub action_length: Fx,
    /// Distance from its own centre inside which its blade cannot reach the
    /// speed a blow requires, however hard it swings.
    ///
    /// Every weapon has one, because impact is `spin x arm`: crowd close enough
    /// and there is no arm left to build speed on. It is the reason hugging a
    /// Brute works, and the reason hugging with a *Skitterer* does not -- its
    /// own dead zone is only a third of a unit, but so is its whole sword.
    ///
    /// Derived rather than perceived: a fighter knows how hard it can swing.
    pub min_strike_range: Fx,
    /// Own limb, exactly. Proprioception is free: you always know where your
    /// own hand is and how fast it is travelling, however dim you are.
    pub limb: Hand,
    /// Half-width of the observer's own guard arc at full extension, raw angle
    /// units. Zero unless it is actually holding a guard, so a policy can work
    /// out what it is covering before it commits to covering it.
    pub action_arc: u16,
    /// **What is in hand right now.**
    pub held: ActionKind,
    /// Which loadout slot [`Observation::held`] came from.
    pub slot: u8,
    /// What the other slot holds, if there is one.
    ///
    /// Both this and `held` are in the observation because the loadout decision
    /// is a *comparison*: a fighter that could only see what it was holding
    /// could never work out whether putting it away was worth doing.
    pub stowed: Option<ActionKind>,
    /// What swapping to [`Observation::stowed`] would cost this body, in ticks,
    /// already resolved against its agility.
    ///
    /// Exact, because proprioception is free, and separate because it is not
    /// inferable from `stowed` alone -- it is `phase_ticks(ready, agility)`, and
    /// a fighter's own agility is not a percept either. This is the one number
    /// the whole loadout decision is priced in, which is why it is handed over
    /// rather than left to be reconstructed.
    pub swap_ticks: u16,
    pub sight_range: Fx,
    /// World units per tick.
    pub move_speed: Fx,
    /// How much of [`Observation::velocity`] this body can change in one tick.
    ///
    /// The other half of [`Observation::move_speed`], and the one that decides
    /// whether a plan is still cancellable. `v^2 / 2a` is the distance a body
    /// needs to stop, which is what a fighter has to hold in mind before it
    /// steps toward anything.
    pub traction: Fx,
    /// **How much ground this fighter's own hardest cut costs it**, in its own
    /// body radii. [`Contact::knockback_taken`] with the fighter's own swing on
    /// the other end of it.
    ///
    /// Swinging something moves you. That has been true since bodies got
    /// momentum, and until now a policy could only find out *afterwards*, by
    /// reading [`Observation::velocity`] and discovering it was somewhere it had
    /// not chosen to be. This is the same fact in advance, which is the only form
    /// of it a fighter can act on: the decision recoil belongs to is whether to
    /// throw the cut at all.
    ///
    /// Derived and exact -- a fighter knows what its own weapon does to it -- and
    /// genuinely not inferable from anything else here. Recoil goes as
    /// `weapon_mass / body_mass` and neither of those is a percept, nor should
    /// be; `action_length` and `radius` are the visible stand-ins and both lie.
    ///
    /// A ceiling rather than an expectation. Static friction holds the smooth
    /// middle of a swing outright, so a cut that runs its whole arc costs less
    /// than this, and a cut that is *blocked* -- where the blade reverses in one
    /// tick and the whole momentum change arrives together -- costs close to it.
    /// Reading it as "what this could cost me if it goes wrong" is the correct
    /// reading rather than a pessimistic one.
    pub recoil_drift: Fx,
    /// Ticks between this character's decisions -- its own reaction speed.
    ///
    /// Self-knowledge of the same class as [`Observation::position`]:
    /// proprioception is free. It is the one number that tells a policy how
    /// long it will be stuck with whatever it decides now, without which an
    /// agent cannot pace a final stride, because a stale command keeps running
    /// until the next decision tick.
    pub decision_period: u16,
    /// The player's standing order for this faction.
    ///
    /// A command, not a percept: it comes from the player rather than from the
    /// world, so unlike everything else here it is exact and untouched by
    /// perception noise.
    pub order: Order,

    enemy_slots: [Contact; MAX_CONTACTS],
    enemy_count: u8,
    ally_slots: [Contact; MAX_CONTACTS],
    ally_count: u8,

    /// Distance to the first solid face in `-x, +x, -y, +y`, or to the edge of
    /// the level when there is nothing in the way.
    ///
    /// The shape has not changed and the meaning has: on a level with masonry
    /// carved into it this stops at the nearest *wall*, not at the outer
    /// boundary. On a floor plan with nothing carved it is bit-for-bit the
    /// arena-edge distance it always was, which is what keeps every scenario
    /// that is not a dungeon behaving exactly as it did.
    pub wall_clearance: [Fx; 4],

    /// **Which way to walk to reach this faction's objective**, along ground a
    /// body of this size can actually cross. A unit heading, or [`Vec2::ZERO`]
    /// when there is no objective, when it cannot be reached from here, or when
    /// this body is already standing on it.
    ///
    /// Derived and handed over rather than left to be reconstructed, on exactly
    /// the argument [`Contact::min_strike_range`] makes: the floor plan is a
    /// fact about the world, the sim holds it exactly, and a policy made to
    /// rediscover it would be re-deriving in fixed point something the sim can
    /// answer for nothing. What stays a *decision* is whether to follow it.
    ///
    /// See [`crate::Objective`] for why this is silent unless somebody asked
    /// for it.
    pub nav_dir: Vec2,
    /// Ground to cover along that route, in world units. [`Fx::MAX`] when there
    /// is no route.
    ///
    /// Carried beside the heading because a heading alone cannot pace an
    /// arrival: the braking law that stops a character on its mark divides by a
    /// distance, and the straight-line distance is a lie the moment a wall is
    /// in the way -- it says "nearly there" to a character with a room to walk
    /// round.
    pub nav_distance: Fx,

    /// The articulated picture, or [`ArticulatedObservation::BLANK`] on a
    /// Legacy world.
    ///
    /// **Last, and it stays last.** Its feature block is appended at index
    /// [`LEGACY_FEATURE_COUNT`] and everything below that index is frozen
    /// against weights that do not exist yet but will; a field inserted above
    /// this one costs nothing, and a feature inserted above the block costs a
    /// training run. Keeping the struct order and the vector order the same is
    /// what makes that easy to see.
    ///
    /// Blank on a Legacy world rather than absent, so the vector has one width
    /// and one meaning whichever model a scenario picked.
    pub articulated: ArticulatedObservation,
}

/// Values per contact in the feature vector: direction (2), range, health,
/// size, action length, facing (2), limb direction (2), limb spin, limb reach,
/// dead zone, the exchange rate in both directions (2), velocity (2), the ground
/// a blow costs in both directions (2), what it weighs relative to the observer,
/// its guard arc, the role of what it is holding as a one-hot (4), then the
/// attack read -- swing phase one-hot (4), ticks left in it, and the attack
/// line (2).
///
/// The shield pair that used to sit here is gone with the second hand. What
/// replaced it is the *role* block, and that is a strictly better question to
/// ask: "where is their shield" only ever mattered as a proxy for "can they stop
/// this", and now that a fighter holds one thing at a time the honest answer is
/// a property of what they are holding.
///
/// Every angle enters as a `(cos, sin)` pair rather than as a number, and that
/// is not a rounding detail: a raw angle is discontinuous at the wrap, so a
/// blade at 359 degrees and one at 1 degree would look maximally different to
/// anything trying to learn from the slot. Two continuous components have no
/// seam to learn across.
///
/// The phase is a one-hot block and not a number for the same reason. The four
/// phases are not points on a scale -- a recovery is not "more" than a windup --
/// and encoding them as 0, 1/3, 2/3, 1 would ask a network to learn that the
/// most dangerous state and the most punishable one sit next to each other.
const FEATURES_PER_CONTACT: usize = 21 + Role::COUNT + crate::hand::Swing::COUNT + 3;

/// Own-state values: health, attack readiness, radius, action length, minimum
/// strike range, decision rate, guard arc, own velocity (2), traction against
/// top speed, what its own swing costs it in ground, then the limb as direction
/// (2), spin and reach, then its attack state -- phase one-hot (4), ticks left,
/// whether it is armed, and how braced it is -- and finally the loadout: the
/// held action as a one-hot, the stowed one as another, and what the swap
/// between them would cost.
///
/// The brace count is not derivable from anything else here. A guard's bearing
/// and spin say where it is and how fast, and neither says how long it has been
/// *there*, which is what decides whether it stops a blow or is merely near one.
///
/// Nor is the loadout block. A network with no representation for "the thing in
/// my hand can change" cannot learn to change it -- that is a missing *concept*
/// rather than a missing input, and it is the reason this layout revision is not
/// backward compatible with any weights trained against version 9.
const SELF_FEATURES: usize =
    11 + 4 + crate::hand::Swing::COUNT + 3 + 2 * ActionKind::COUNT + 1;

/// Width of indices `0..450`: everything the vector held before the articulated
/// block was appended, and the prefix that must stay byte-identical.
///
/// Named rather than left implicit because "the legacy prefix" is now a thing
/// tests have to talk about, and a test that writes `450` by hand is a test
/// that agrees with itself.
pub const LEGACY_FEATURE_COUNT: usize =
    SELF_FEATURES + Order::COUNT + 2 + (MAX_CONTACTS * FEATURES_PER_CONTACT) * 2 + 4 + 3;

/// Values per arm in the articulated self block: hand relative XYZ, target-hand
/// relative XYZ, velocity XYZ, fatigue, integrity fraction, severed.
const ARTICULATED_ARM_FEATURES: usize = 3 + 3 + 3 + 1 + 1 + 1;

/// Values per published shield face: present, relative centre XYZ, normal XYZ,
/// two half-extents. One shape, written twice -- once for the subject and once
/// per opponent -- so the two cannot drift apart.
const ARTICULATED_SHIELD_FEATURES: usize = 1 + 3 + 3 + 2;

/// Values per opponent capsule: relative lower XYZ, relative upper XYZ, radius.
///
/// The head does not use this: it is the degenerate volume whose two endpoints
/// coincide, so it writes one point and a radius and saves the six components
/// that would be an exact copy of the other three.
const ARTICULATED_VOLUME_FEATURES: usize = 3 + 3 + 1;

/// Values per opponent weapon: relative hilt XYZ, relative tip XYZ. No radius,
/// unlike a capsule -- a blade's thickness is not something a defender reads at
/// range, and the four regional radii already say how big the body is.
const ARTICULATED_WEAPON_FEATURES: usize = 3 + 3;

/// The subject's own block: present; eight capability bits; yaw cosine/sine;
/// body velocity XYZ; two arms; a shield; blood fraction and shock; then
/// integrity, wound and severed, five apiece in [`BodyPart`] order.
///
/// No weapon endpoints, and that is the reference's choice rather than an
/// omission: a fighter's own blade is derivable from its own hand and its own
/// equipment row, both of which are here, while an opponent's is not derivable
/// from anything -- which is why the opponent row carries twelve columns of it.
pub const ARTICULATED_SELF_FEATURES: usize = 1
    + 8
    + 2
    + 3
    + 2 * ARTICULATED_ARM_FEATURES
    + ARTICULATED_SHIELD_FEATURES
    + 2
    + 3 * BodyPart::COUNT;

/// One opponent row: present; relative body position and velocity XYZ; yaw
/// cosine/sine; the head point and radius; four capsules in [`BodyPart`] order;
/// both weapons; a shield; five severed bits; contact timing.
pub const ARTICULATED_OPPONENT_FEATURES: usize = 1
    + 3
    + 3
    + 2
    + (3 + 1)
    + 4 * ARTICULATED_VOLUME_FEATURES
    + 2 * ARTICULATED_WEAPON_FEATURES
    + ARTICULATED_SHIELD_FEATURES
    + BodyPart::COUNT
    + 1;

/// Width of the appended articulated block: one self run, then six opponent
/// rows whether or not anybody is standing in them.
///
/// Fixed width rather than packed, for the reason the legacy contact slots are:
/// a vector whose width depended on how much the observer perceived would make
/// "how much do I perceive" a thing the network had to infer from the shape of
/// its own input instead of reading it off the zeros.
pub const ARTICULATED_FEATURE_COUNT: usize =
    ARTICULATED_SELF_FEATURES + MAX_ARTICULATED_OPPONENTS * ARTICULATED_OPPONENT_FEATURES;

/// Values per arm in the embodied self block: the elbow relative to its own
/// shoulder XYZ, and reach headroom.
const EMBODIED_ARM_FEATURES: usize = 3 + 1;

/// The subject's own embodied run: present; the hips relative to the torso as
/// cosine and sine; twist, pelvis and step as fractions; then two arms.
///
/// **The `present` column is the one thing this block has that the articulated
/// block does not, and it is not redundancy.** The articulated block's rule is
/// that a blank row is zeros and nothing else, which works there because no live
/// body writes an all-zero row -- a present body has a capability bit, a yaw
/// cosine, an integrity fraction. Here one can: a body squared, level and
/// standing still has zero twist, zero hip offset and no step running, so
/// "nothing to report" and "nothing is happening" would otherwise be the same
/// bytes.
///
/// The hips go in as a cosine and a sine for the same shape of reason and not
/// for the wrap-seam one the legacy block gives: the budget is a sixth of a turn
/// and nothing here goes near the seam, but `cos(0)` is one and an absent body's
/// column is zero, so the pair separates a squared body from no body at all in a
/// column that a raw angle would have collapsed.
pub const EMBODIED_SELF_FEATURES: usize = 1 + 2 + 3 + 2 * EMBODIED_ARM_FEATURES;

/// One opponent's embodied row: present, their twist fraction, and whether they
/// are mid-step.
///
/// Three columns against the self block's fourteen, and the cut is where
/// proprioception stops -- see [`ObservedOpponentStance`]. It carries its own
/// `present` for the reason [`EMBODIED_SELF_FEATURES`] does, and it has to be
/// its own rather than borrowed from the articulated row's: a reader of this
/// block cannot see index `450 + 64 + 68 * slot` from here.
pub const EMBODIED_OPPONENT_FEATURES: usize = 1 + 1 + 1;

/// Width of the appended embodied block: one self run, then six opponent rows
/// whether or not anybody is standing in them.
///
/// Fixed width for the reason [`ARTICULATED_FEATURE_COUNT`] is.
pub const EMBODIED_FEATURE_COUNT: usize =
    EMBODIED_SELF_FEATURES + MAX_ARTICULATED_OPPONENTS * EMBODIED_OPPONENT_FEATURES;

/// Width of the flattened feature vector produced by
/// [`Observation::write_features`].
pub const FEATURE_COUNT: usize =
    LEGACY_FEATURE_COUNT + ARTICULATED_FEATURE_COUNT + EMBODIED_FEATURE_COUNT;

/// Bumped whenever the layout of [`Observation::write_features`] changes shape
/// or meaning.
///
/// The layout is the contract a trained network is frozen against, so a change
/// here is a retraining bill. Recording the version is what lets a future
/// frozen network refuse to load against a vector it was not trained on,
/// instead of quietly reading the wrong number out of every slot.
///
/// Version 4 was the phased attack. A contact went from fifteen numbers to
/// twenty-two, because a defender that can see a blade's bearing and speed but
/// cannot see whether that blade is *committed* has no way to tell a feint from
/// a cut, or a recovery from a guard.
///
/// Version 5 adds one number to each contact and one to the self block, and
/// both are about where to stand. [`Contact::min_strike_range`] is the enemy's
/// dead zone, without which the strongest answer to a heavy weapon in the game
/// is not derivable from the observation at all; the self block gains how
/// braced the shield is, without which a network could not tell a guard that
/// has been planted on a line from one still travelling toward it, and those
/// two block very differently.
///
/// Version 6 adds two numbers to each contact, and they are the first entries
/// in the vector that are neither a measurement nor a state -- they are the
/// *stakes*. [`Contact::threat`] and [`Contact::frailty`] say what one clean
/// blow is worth in each direction, as a fraction of the bar it comes off.
/// Everything a policy could previously read was scale-free by construction
/// (positions, angles, health fractions), which was the right instinct and left
/// one hole: `power`, `weapon.weight` and `max_hp` are all absolute, all
/// correctly kept out of the observation, and between them they decide whether
/// a given exchange is a scratch or a third of the fight. A fighter that cannot
/// tell a Brute's axe from a Skitterer's knife except by its length is not
/// reading the fight, and no amount of perception was going to fix that.
///
/// Paid now, while there are still no weights: the same bill after a training
/// run is the training run.
/// Version 7 is momentum. Bodies carry velocity across ticks now, so where
/// something *is* stopped being the whole story about where it will be, and
/// three numbers per contact and three about the self exist to close that gap:
/// [`Observation::velocity`], [`Observation::traction`] and
/// [`Contact::velocity`].
///
/// The version bump is doing real work here rather than bookkeeping. Every
/// earlier layout described a world in which a body could stop dead on any
/// tick, so a policy trained against one has no representation for commitment
/// at all -- not a missing input, a missing *concept*. Its notion of "I can
/// step back if this goes wrong" is simply false in version 7, and it would
/// fail in a way that looks like bad tactics rather than like a stale contract.
///
/// Version 8 is the shove. Blows move bodies now, and two numbers per contact
/// say how far in each direction: [`Contact::knockback_taken`] and
/// [`Contact::knockback_dealt`].
///
/// They are not derivable from the pair already there. A network holding
/// [`Contact::threat`] knows what a blow *costs* and nothing about what it
/// *moves*, and the roster ranks those differently on purpose -- a Skitterer's
/// knife is the second-heaviest thing in the game for its speed and among the
/// least dangerous, so any policy inferring one from the other would be reading
/// a correlation that was deliberately broken. The pairing matters too: the same
/// axe moves a Brute a fifteenth of a body and a Skitterer four of them, which is
/// the difference between a shove being a tactic and being a waste of a swing.
///
/// Version 9 closes the two holes version 8 left on the momentum side, and both
/// are holes in the same place: a fighter could see what a *blow* moved and
/// nothing about what a *body* weighed or what its own swing cost it.
///
/// [`Observation::recoil_drift`] is the ground a fighter's own hardest cut costs
/// it. Recoil has moved bodies since version 7 and no policy could read it in
/// advance -- only afterwards, off [`Observation::velocity`], by which point the
/// decision it belonged to was two dozen ticks gone.
///
/// [`Contact::heft`] is what the other body weighs relative to yours. Walking
/// into somebody splits on the mass ratio and nothing else, and mass is
/// `density * radius^2` with density real and independent -- so `radius`, the
/// obvious stand-in, is wrong by a fifth in both directions across this roster.
/// Without it "charge the light one, do not shoulder the heavy one" is not a
/// decision the observation supports, which made a body-check something only the
/// sim knew about.
///
/// Version 11 is the floor plan, and it changes one field's *meaning* as well as
/// adding three. [`Observation::wall_clearance`] used to be four distances to the
/// arena edge; it is now four distances to the nearest masonry, which on a
/// dungeon is a different number about a different thing -- a policy trained
/// against version 10 would read "plenty of room" off a fighter standing in a
/// corridor. That alone would be a bump with no new slots at all.
///
/// The three new slots are [`Observation::nav_dir`] and
/// [`Observation::nav_distance`]. They exist because walls make "walk toward
/// that" and "walk to that" different questions for the first time, and the
/// second is not answerable from anything else in the vector: no amount of local
/// clearance tells a fighter which of two corridors leads to the room it wants.
/// Not a missing input, a missing *concept* -- the same argument version 9's
/// loadout block makes.
///
/// Version 12 is the articulated body, and it is the first bump that adds
/// nothing to indices `0..450`. The 472 new slots are appended whole
/// ([`ARTICULATED_FEATURE_COUNT`]) and a Legacy world fills every one of them
/// with zero, so a version-11 vector is a version-12 vector with the tail cut
/// off.
///
/// The bump is still real rather than bookkeeping, on the argument version 7
/// makes about missing *concepts*. Every earlier layout described an opponent
/// as a disc with a blade bearing, so the only spatial question a policy could
/// ask was how far away it was. An articulated fight is five volumes and two
/// blades per body, and "which region is exposed" is not a harder version of
/// "how far away is it" -- it is a question the old vector has no slot for at
/// all. A network trained on version 11 does not read version 12 badly; it
/// reads the first 450 columns exactly as before and cannot see the fight.
///
/// Paid now, while there are still no weights.
///
/// Version 13 is the embodied body, and it is the second bump that adds nothing
/// to indices `0..450` -- nor, this time, to `450..922`. The 32 new slots
/// ([`EMBODIED_FEATURE_COUNT`]) are appended whole after the articulated block
/// and never interleaved with it, so a version-12 vector is a version-13 vector
/// with the tail cut off, exactly as a version-11 one was a version-12 one.
///
/// **Appending is a cost decision here rather than the rule**, and it is the one
/// place in these sessions where the conservative shape wins the argument: the
/// shipped checkpoint is frozen against this layout, so renumbering a column it
/// reads buys a tidier vector at the price of a retrain and a re-score.
/// Everywhere else in the embodied work the answer is interleave and bump.
///
/// What the 32 carry is the legs and the joint the articulated body has no
/// concept of. A twist against a budget, a pelvis against its standing height, a
/// step running down, and per arm an elbow and how much extension is left before
/// the arm's own clamp takes over. The argument version 7 makes about missing
/// *concepts* applies to every one of them: an articulated fighter cannot ask
/// "is that body wound out to its limit" because an articulated body has no
/// limit to be wound to, and it cannot ask "can I reach further from here"
/// because an articulated arm has no bound to reach. A network trained on
/// version 12 reads the first 922 columns exactly as before and cannot see the
/// footwork.
///
/// **Each half of the block carries its own `present` column**, which is the one
/// structural difference from the articulated block. See
/// [`EMBODIED_SELF_FEATURES`] for why an all-zero row is not enough here when it
/// was enough there.
///
/// Paid now, while there are still no weights -- and the `legacy feature prefix`
/// pin is what says the price was zero for indices `0..450`.
pub const FEATURE_LAYOUT_VERSION: u32 = 13;

/// Speed, in world units per tick, that normalises to `1` in the feature
/// vector. Comfortably above any archetype's top speed, so it is the knockback
/// case that approaches the clamp rather than ordinary walking.
const SPEED_SCALE: Fx = Fx::from_ratio(25, 100);

/// Spin, in raw angle units per tick, that normalises to `1` in the feature
/// vector. Above the fastest weapon in the game, so the clamp is a guard rather
/// than a routine flattening of the signal.
const SPIN_SCALE: Fx = Fx::from_int(4000);

/// Ticks that normalise to `1`. One second, which comfortably covers the
/// longest phase in the game (a Brute's 44-tick recovery).
const TICK_SCALE: Fx = Fx::from_int(60);

/// A shield arc half-width as a fraction of a half turn, so it lands inside the
/// vector's `-1..=1` invariant like everything else.
#[inline]
fn arc_fraction(arc: u16) -> Fx {
    Fx::from_ratio(arc as i32, 32_768)
}

impl Observation {
    /// An observation of an empty battlefield.
    ///
    /// Public, with [`Observation::set_enemies`] and
    /// [`Observation::set_allies`], so a policy can be unit-tested against a
    /// hand-built situation instead of one coaxed out of a live world. Getting
    /// an agent into the exact circumstance you want to assert about is
    /// otherwise surprisingly hard, and tests that give up and assert something
    /// weaker are how behaviour regressions slip through.
    pub fn blank(
        tick: u32,
        me: EntityId,
        faction: Faction,
        position: Vec2,
        order: Order,
    ) -> Observation {
        Observation {
            tick,
            me,
            faction,
            position,
            velocity: Vec2::ZERO,
            hp_frac: Fx::ONE,
            attack_ready: Fx::ONE,
            radius: Fx::ZERO,
            action_length: Fx::ZERO,
            min_strike_range: Fx::ZERO,
            limb: Hand::default(),
            held: ActionKind::Punch,
            slot: 0,
            stowed: None,
            swap_ticks: 0,
            action_arc: 0,
            sight_range: Fx::ONE,
            move_speed: Fx::ZERO,
            // Never zero, for the same reason `decision_period` is not: a
            // policy dividing by it to get a stopping distance would saturate
            // rather than fail.
            traction: Fx::ONE,
            recoil_drift: Fx::ZERO,
            // One, never zero. `Fx` division by zero saturates to `Fx::MAX`
            // rather than panicking, so a zero period would turn a policy's
            // "how far can I travel before my next thought" term into a
            // silently disabled brake with nothing failing anywhere.
            decision_period: 1,
            order,
            enemy_slots: [Contact::default(); MAX_CONTACTS],
            enemy_count: 0,
            ally_slots: [Contact::default(); MAX_CONTACTS],
            ally_count: 0,
            wall_clearance: [Fx::ZERO; 4],
            nav_dir: Vec2::ZERO,
            // "No route", which is what an observation of an empty battlefield
            // should say. Zero would read as "you have arrived".
            nav_distance: Fx::MAX,
            articulated: ArticulatedObservation::BLANK,
        }
    }

    /// Perceived enemies, nearest first.
    #[inline]
    pub fn enemies(&self) -> &[Contact] {
        &self.enemy_slots[..self.enemy_count as usize]
    }

    /// Perceived allies, nearest first. Does not include the observer.
    #[inline]
    pub fn allies(&self) -> &[Contact] {
        &self.ally_slots[..self.ally_count as usize]
    }

    #[inline]
    pub fn nearest_enemy(&self) -> Option<&Contact> {
        self.enemies().first()
    }

    /// The role of whatever is in hand: whether this fighter can currently cut,
    /// block, or neither.
    #[inline]
    pub fn role(&self) -> Role {
        self.held.role()
    }

    /// What is in loadout slot `i`, from this fighter's point of view.
    ///
    /// The observation carries the two slots as `held` and `stowed` rather than
    /// as an array, because which one is in hand is the fact that matters and a
    /// pair of parallel fields cannot get out of step. This puts the array shape
    /// back for the one caller that genuinely wants to iterate: a selector
    /// scoring every option has to be able to say "slot 1" in the command it
    /// produces, and `Command::slot` is an index.
    #[inline]
    pub fn loadout_slot(&self, i: u8) -> Option<ActionKind> {
        if i == self.slot {
            Some(self.held)
        } else if i < 2 {
            self.stowed
        } else {
            None
        }
    }

    /// Whether the limb could begin a swap this tick.
    ///
    /// A swap is honoured only from [`crate::Swing::Guard`], so asking mid-cut
    /// is refused rather than queued -- which is what stops a swap from being an
    /// escape hatch out of an attack that has already committed.
    #[inline]
    pub fn can_swap(&self) -> bool {
        self.stowed.is_some() && self.limb.swing == crate::hand::Swing::Guard
    }

    /// Whether a strike command would actually start a cut this tick.
    ///
    /// Both halves matter and a policy that checks only one is broken in a way
    /// that is hard to see from a fight: the hand must be back at guard *and*
    /// re-armed by a command that was not asking to attack. Asking to attack
    /// forever throws one attack; see [`crate::Hand::armed`].
    ///
    /// Three halves now, not two: a limb holding a guard has nothing to strike
    /// *with*, and a policy that skipped the role check would spend a fight
    /// asking a shield to attack and never notice.
    #[inline]
    pub fn can_strike(&self) -> bool {
        self.role().can_attack()
            && self.limb.swing == crate::hand::Swing::Guard
            && self.limb.armed
    }

    /// How far the observer's blade reaches from its own centre right now, at
    /// its current extension. What a policy needs to answer "can I hit that
    /// from here"; [`Observation::full_reach`] answers "could I ever".
    #[inline]
    pub fn reach_now(&self) -> Fx {
        self.radius + self.action_length * self.limb.reach
    }

    /// Reach from the observer's centre at full extension.
    #[inline]
    pub fn full_reach(&self) -> Fx {
        self.radius + self.action_length
    }

    /// Replaces the perceived enemies. Extra contacts beyond [`MAX_CONTACTS`]
    /// are dropped.
    pub fn set_enemies(&mut self, contacts: &[Contact]) {
        self.enemy_count = contacts.len().min(MAX_CONTACTS) as u8;
        self.enemy_slots[..self.enemy_count as usize]
            .copy_from_slice(&contacts[..self.enemy_count as usize]);
    }

    /// Replaces the perceived allies.
    pub fn set_allies(&mut self, contacts: &[Contact]) {
        self.ally_count = contacts.len().min(MAX_CONTACTS) as u8;
        self.ally_slots[..self.ally_count as usize]
            .copy_from_slice(&contacts[..self.ally_count as usize]);
    }

    /// Flattens into a fixed-layout feature vector for a neural policy.
    ///
    /// Nothing uses this yet -- the milestone-1 policy reads the struct
    /// directly. It exists now because the *layout* is the contract a trained
    /// network is frozen against, and it is much cheaper to get that boundary
    /// right before there are weights depending on it than after.
    ///
    /// Empty contact slots are zero-filled rather than omitted, so the vector
    /// is a constant width regardless of how much the observer perceives. A
    /// low-perception character's vector is mostly zeros, which is exactly the
    /// signal we want the network to condition on.
    ///
    /// All values are in roughly `-1..=1`. Returns [`FEATURE_COUNT`].
    pub fn write_features(&self, out: &mut [Fx]) -> usize {
        assert!(
            out.len() >= FEATURE_COUNT,
            "feature buffer too small: {} < {FEATURE_COUNT}",
            out.len()
        );
        out[..FEATURE_COUNT].fill(Fx::ZERO);

        let mut i = 0;
        out[i] = self.hp_frac;
        i += 1;
        out[i] = self.attack_ready;
        i += 1;
        out[i] = self.radius;
        i += 1;
        out[i] = self.action_length;
        i += 1;
        out[i] = self.min_strike_range;
        i += 1;
        // The decision *rate*, not the tick count: a period of 12 would blow
        // the -1..=1 invariant on its own, and "how often do I get to think"
        // is the quantity a network can act on anyway.
        out[i] = Fx::ONE / Fx::from_int(self.decision_period.max(1) as i32);
        i += 1;
        out[i] = arc_fraction(self.action_arc);
        i += 1;
        out[i] = (self.velocity.x / SPEED_SCALE).clamp(-Fx::ONE, Fx::ONE);
        out[i + 1] = (self.velocity.y / SPEED_SCALE).clamp(-Fx::ONE, Fx::ONE);
        i += 2;
        // Traction against top speed, which is the reciprocal of "ticks to get
        // going" and lands near 0.07. The absolute figure would be four decimal
        // places of nothing; the ratio is the quantity a policy acts on.
        out[i] = (self.traction / self.move_speed.max(Fx::EPSILON)).min(Fx::ONE);
        i += 1;
        // What a cut costs its owner in ground, on the same scale and clamped on
        // the same argument as the knockback pair in a contact slot: past a whole
        // body of drift the spacing question has already been decided.
        out[i] = self.recoil_drift.min(Fx::ONE);
        i += 1;

        let dir = Vec2::from_angle(self.limb.angle);
        out[i] = dir.x;
        out[i + 1] = dir.y;
        out[i + 2] = (self.limb.spin / SPIN_SCALE).clamp(-Fx::ONE, Fx::ONE);
        out[i + 3] = self.limb.reach;
        i += 4;

        // The character's own attack, exactly. `armed` is not introspection for
        // its own sake: it is the difference between a policy that fights and
        // one that throws a single cut and then stands holding the button down
        // forever, and nothing else in the vector implies it.
        out[i + self.limb.swing.discriminant()] = Fx::ONE;
        i += crate::hand::Swing::COUNT;
        out[i] = (Fx::from_int(self.limb.swing_left as i32) / TICK_SCALE).min(Fx::ONE);
        i += 1;
        out[i] = if self.limb.armed { Fx::ONE } else { Fx::ZERO };
        i += 1;
        out[i] = self.limb.brace_fraction();
        i += 1;

        // The loadout. Two one-hot blocks rather than two scalars, on the same
        // argument the phase block is one-hot for: actions are not points on a
        // scale, and a knife is not "less" than a club.
        out[i + self.held.code() as usize] = Fx::ONE;
        i += ActionKind::COUNT;
        // An empty second slot writes an all-zero block, which reads correctly
        // as "there is nothing to swap to" and needs no sentinel row.
        if let Some(stowed) = self.stowed {
            out[i + stowed.code() as usize] = Fx::ONE;
        }
        i += ActionKind::COUNT;
        out[i] = (Fx::from_int(self.swap_ticks as i32) / TICK_SCALE).min(Fx::ONE);
        i += 1;

        out[i + self.order.discriminant()] = Fx::ONE;
        i += Order::COUNT;

        // Where the order points, relative to here and measured in sight
        // ranges. `Advance` carries a heading, so it normalises; `Goto` carries
        // a world-space destination, and putting one of those in the vector
        // straight would break the -1..=1 invariant the moment the arena is
        // wider than a unit -- and would make the same order mean different
        // things at different positions.
        let pointing = match self.order {
            Order::Advance(dir) => dir.normalize(),
            Order::Goto(dest) => {
                let sight = self.sight_range.max(Fx::ONE);
                let to = (dest - self.position).clamp_length(sight);
                Vec2::new(to.x / sight, to.y / sight)
            }
            Order::Hold | Order::Regroup | Order::Focus(_) => Vec2::ZERO,
        };
        out[i] = pointing.x;
        out[i + 1] = pointing.y;
        i += 2;

        for group in [self.enemies(), self.allies()] {
            for slot in 0..MAX_CONTACTS {
                let base = i + slot * FEATURES_PER_CONTACT;
                if let Some(c) = group.get(slot) {
                    let unit = c.offset.normalize();
                    let range = (c.distance / self.sight_range).clamp(Fx::ZERO, Fx::ONE);
                    let facing = Vec2::from_angle(c.facing);
                    let limb = Vec2::from_angle(c.limb_angle);
                    out[base] = unit.x;
                    out[base + 1] = unit.y;
                    out[base + 2] = range;
                    out[base + 3] = c.hp_frac;
                    out[base + 4] = c.radius;
                    out[base + 5] = c.action_length;
                    out[base + 6] = facing.x;
                    out[base + 7] = facing.y;
                    out[base + 8] = limb.x;
                    out[base + 9] = limb.y;
                    out[base + 10] = (c.limb_spin / SPIN_SCALE).clamp(-Fx::ONE, Fx::ONE);
                    out[base + 11] = c.limb_reach;
                    // Where this enemy's blade stops being dangerous. A raw
                    // distance like `radius` and `action_length` beside it, and
                    // on the same scale, so the three can be compared.
                    out[base + 12] = c.min_strike_range;
                    // The stakes, both ways. Clamped at one because past that
                    // the distinction stops mattering -- a blow worth 1.4 bars
                    // and one worth 1.0 are both simply fatal -- and the
                    // vector's -1..=1 invariant is worth more than a difference
                    // nothing can act on.
                    out[base + 13] = c.threat.min(Fx::ONE);
                    out[base + 14] = c.frailty.min(Fx::ONE);
                    // Where it is going. On the same scale as the self block's
                    // velocity, so the two subtract into a closing rate without
                    // anything having to learn a conversion first.
                    out[base + 15] = (c.velocity.x / SPEED_SCALE).clamp(-Fx::ONE, Fx::ONE);
                    out[base + 16] = (c.velocity.y / SPEED_SCALE).clamp(-Fx::ONE, Fx::ONE);
                    // The ground a blow costs, both ways, in the body radii of
                    // whoever is losing it. Clamped at one on the same argument
                    // as the two above: past a whole body of ground the spacing
                    // question has already been settled, and the difference
                    // between losing two bodies and losing five is not one a
                    // policy can act on differently.
                    out[base + 17] = c.knockback_taken.min(Fx::ONE);
                    out[base + 18] = c.knockback_dealt.min(Fx::ONE);
                    // What it weighs, relative to the observer. A *ratio*, so it
                    // enters as one either side of a half: below 0.5 is lighter
                    // than you and above it heavier, and the widest pairing in
                    // the roster (a Skitterer sizing up a Brute, 5.6x) still
                    // lands inside the interval with room. Scaled rather than
                    // clamped because the difference between "twice my weight"
                    // and "five times it" is one a fighter acts on differently,
                    // unlike the ground figures above.
                    out[base + 19] = c.heft / (c.heft + Fx::ONE);
                    // How wide a guard it has up, if it has one at all. Zero for
                    // everything that is not a guard, which makes this and the
                    // role block below say the same thing two ways -- one as a
                    // magnitude the spacing logic can use, one as a category.
                    out[base + 20] = arc_fraction(c.action_arc);
                    // What kind of thing it is holding. The block that replaced
                    // "where is their shield": with one limb, whether an enemy
                    // can stop a cut at all is a fact about their *action*, and
                    // it is the first thing a fighter reads before choosing one.
                    out[base + 21 + c.action.role().discriminant()] = Fx::ONE;

                    // The attack read. The line is a separate pair from
                    // `limb` above on purpose: during a windup the blade is
                    // cocked away from where the cut is going, so the two point
                    // in different directions and collapsing them would hide
                    // the only thing worth knowing.
                    let phase = base + 21 + Role::COUNT;
                    out[phase + c.limb_swing.discriminant()] = Fx::ONE;
                    let read = phase + crate::hand::Swing::COUNT;
                    out[read] = (c.limb_left / TICK_SCALE).clamp(Fx::ZERO, Fx::ONE);
                    let line = Vec2::from_angle(c.limb_line);
                    out[read + 1] = line.x;
                    out[read + 2] = line.y;
                }
            }
            i += MAX_CONTACTS * FEATURES_PER_CONTACT;
        }

        for (slot, clearance) in self.wall_clearance.iter().enumerate() {
            out[i + slot] = (*clearance / self.sight_range).clamp(Fx::ZERO, Fx::ONE);
        }
        i += 4;

        // The route. A heading as its two components, for the reason every
        // other bearing in this vector is a pair: a single number has a seam at
        // the wrap and this one has none. The distance is scaled by sight and
        // clamped, which also handles the `Fx::MAX` that means "no route" --
        // saturating to 1, the furthest thing the vector can say.
        out[i] = self.nav_dir.x;
        out[i + 1] = self.nav_dir.y;
        out[i + 2] = (self.nav_distance / self.sight_range).clamp(Fx::ZERO, Fx::ONE);
        i += 3;

        debug_assert_eq!(i, LEGACY_FEATURE_COUNT, "the frozen prefix changed width");
        i = self.write_articulated_features(out, i);
        debug_assert_eq!(i, LEGACY_FEATURE_COUNT + ARTICULATED_FEATURE_COUNT,
                         "the articulated block changed width");
        i = self.write_embodied_features(out, i);

        debug_assert_eq!(i, FEATURE_COUNT);
        FEATURE_COUNT
    }

    /// The appended articulated block, 472 wide, starting at
    /// [`LEGACY_FEATURE_COUNT`]. Returns the cursor past it.
    ///
    /// **One frame for the whole block, and it is the subject's body
    /// position.** Every position in here -- the subject's own hands, its
    /// shield, every opponent's body, and every capsule, hilt, tip and shield
    /// centre those opponents carry -- is that point subtracted off, then
    /// divided by sight range. The alternative, a per-body frame that put an
    /// opponent's arm relative to its own torso, reads more natural and is
    /// useless: the question an articulated fighter asks is "is my blade near
    /// their head", and that is a subtraction of two features, which is only
    /// meaningful if the two share an origin. It is also why the divisor is
    /// shared. Normalising the subject's own arm by an arm length and the
    /// opponent's body by sight range would make the same displacement two
    /// different numbers depending on which slot it landed in.
    ///
    /// The cost of one shared divisor is that the subject's own geometry is
    /// small: an arm reaches about half a unit and the dimmest eye in the game
    /// sees six, so the self block lives in the middle tenth of the range. That
    /// is a scale a linear layer absorbs for free, and `Fx` has sixteen
    /// fractional bits, so a 0.03 feature still carries eleven bits of it.
    ///
    /// **Divisors.** Lengths use [`Observation::sight_range`], which is the
    /// divisor the legacy block already uses for contact range and wall
    /// clearance (`6.0 + 0.6 * perception` world units, `Stats::sight_range`) --
    /// and it is the right bound by construction, because an opponent further
    /// away than sight range is not in the observation. Radii and shield
    /// extents divide by it too, so "how wide is that torso" and "how far is it
    /// from my hand" are comparable without learning a conversion. Velocities
    /// use [`SPEED_SCALE`], the same 0.25 units per tick the legacy velocity
    /// pairs use, which matters more here than there: the absolute hand
    /// velocity is the body velocity plus the arm's, and that sum is only a sum
    /// if both terms are on one scale.
    ///
    /// Every quotient is clamped to `-1..=1`, which keeps the block inside the
    /// vector's invariant even when perception noise pushes a measured body
    /// past the sight range that admitted it.
    fn write_articulated_features(&self, out: &mut [Fx], from: usize) -> usize {
        let block = from;
        let art = &self.articulated;
        if !art.present() {
            // Nothing to write: `write_features` zero-filled the buffer and a
            // blank block is 472 zeros. The block is not free to a Legacy world
            // even so -- the zero fill is twice as wide and `Observation` is
            // 3228 bytes against 1196 -- and `lab bench` measures it; see
            // `docs/reference/articulated-abi.md`.
            return block + ARTICULATED_FEATURE_COUNT;
        }

        // Guarded the way the `Goto` heading above is guarded, and for the same
        // reason: a hand-built observation may carry a sight range of anything,
        // and dividing a world-space displacement by a fraction is how a
        // feature leaves the interval.
        let sight = self.sight_range.max(Fx::ONE);
        let origin = art.body_position;
        let span = |v: Fx| (v / sight).clamp(-Fx::ONE, Fx::ONE);
        let rate = |v: Fx| (v / SPEED_SCALE).clamp(-Fx::ONE, Fx::ONE);
        let flag = |b: bool| if b { Fx::ONE } else { Fx::ZERO };
        // A world-space point, moved into the subject's frame and scaled.
        let point = |out: &mut [Fx], at: usize, p: Vec3| {
            let d = p - origin;
            out[at] = span(d.x);
            out[at + 1] = span(d.y);
            out[at + 2] = span(d.z);
        };

        let mut i = block;
        out[i] = Fx::ONE;
        i += 1;
        // The capability mask, bit by bit in bit order. Eight scalars rather
        // than one packed number, on the argument the phase block is one-hot
        // for: a mask read as an integer asks a network to learn that 3 sits
        // between 2 and 4, and these bits are not on a scale at all.
        for bit in 0..8 {
            out[i + bit] = flag(art.capabilities & (1 << bit) != 0);
        }
        i += 8;
        out[i] = art.body_yaw.cos();
        out[i + 1] = art.body_yaw.sin();
        i += 2;
        out[i] = rate(art.body_velocity.x);
        out[i + 1] = rate(art.body_velocity.y);
        out[i + 2] = rate(art.body_velocity.z);
        i += 3;

        // Left arm then right, twelve apiece and identical in shape, so a
        // network learns one arm and applies it twice.
        for (limb, arm) in art.arms.iter().enumerate() {
            let base = i + limb * ARTICULATED_ARM_FEATURES;
            point(out, base, arm.hand);
            point(out, base + 3, arm.target_hand);
            // Body-relative already, so it is scaled and not re-based. Adding
            // the body velocity here would publish the absolute hand velocity
            // and lose the only term the vector does not otherwise carry.
            out[base + 6] = rate(arm.velocity.x);
            out[base + 7] = rate(arm.velocity.y);
            out[base + 8] = rate(arm.velocity.z);
            out[base + 9] = arm.fatigue;
            out[base + 10] = arm.integrity_fraction;
            out[base + 11] = flag(arm.severed);
        }
        i += 2 * ARTICULATED_ARM_FEATURES;

        if art.shield.present {
            out[i] = Fx::ONE;
            point(out, i + 1, art.shield.centre);
            // Frame-independent and already a unit vector: neither re-based nor
            // scaled, exactly as the pose row carries it.
            out[i + 4] = art.shield.normal.x;
            out[i + 5] = art.shield.normal.y;
            out[i + 6] = art.shield.normal.z;
            out[i + 7] = span(art.shield.half_width);
            out[i + 8] = span(art.shield.half_height);
        }
        i += ARTICULATED_SHIELD_FEATURES;

        // Every fraction below is clamped to `[0,1]` at its source in
        // `anatomy`, so none of them is re-clamped here.
        out[i] = art.blood_fraction;
        out[i + 1] = art.shock;
        i += 2;
        for part in 0..BodyPart::COUNT {
            out[i + part] = art.integrity_fraction[part];
            out[i + BodyPart::COUNT + part] = art.wound_fraction[part];
            out[i + 2 * BodyPart::COUNT + part] = flag(art.severed_mask & (1 << part) != 0);
        }
        i += 3 * BodyPart::COUNT;
        debug_assert_eq!(i, block + ARTICULATED_SELF_FEATURES);

        for slot in 0..MAX_ARTICULATED_OPPONENTS {
            let base = i + slot * ARTICULATED_OPPONENT_FEATURES;
            let foe = &art.opponents[slot];
            // An empty row is 68 zeros and nothing else. It must be: the row
            // is the only place a hidden identity could reach a policy, and
            // "blank" has to mean blank in the vector as well as in the struct.
            if !foe.present() {
                continue;
            }
            out[base] = Fx::ONE;
            point(out, base + 1, foe.body_position);
            out[base + 4] = rate(foe.body_velocity.x);
            out[base + 5] = rate(foe.body_velocity.y);
            out[base + 6] = rate(foe.body_velocity.z);
            out[base + 7] = foe.body_yaw.cos();
            out[base + 8] = foe.body_yaw.sin();

            // The head is the degenerate capsule, so it writes its single point
            // and its radius; the other four write both endpoints. An absent
            // region writes zeros rather than the capsule the actuator last
            // left there, because a severed arm's stale volume is a limb the
            // observer cannot see and a network would learn to swing at it.
            let head = base + 9;
            let capsules = head + 3 + 1;
            let region = &foe.regions[BodyPart::Head as usize];
            if region.present {
                point(out, head, region.lower);
                out[head + 3] = span(region.radius);
            }
            for (at, part) in
                [BodyPart::Torso, BodyPart::LeftArm, BodyPart::RightArm, BodyPart::Legs]
                    .iter()
                    .enumerate()
            {
                let region = &foe.regions[*part as usize];
                if !region.present {
                    continue;
                }
                let volume = capsules + at * ARTICULATED_VOLUME_FEATURES;
                point(out, volume, region.lower);
                point(out, volume + 3, region.upper);
                out[volume + 6] = span(region.radius);
            }

            let weapons = capsules + 4 * ARTICULATED_VOLUME_FEATURES;
            for limb in 0..2 {
                let Some(segment) = foe.weapons[limb] else { continue };
                let at = weapons + limb * ARTICULATED_WEAPON_FEATURES;
                point(out, at, segment.hilt);
                point(out, at + 3, segment.tip);
            }

            let shield = weapons + 2 * ARTICULATED_WEAPON_FEATURES;
            if foe.shield.present {
                out[shield] = Fx::ONE;
                point(out, shield + 1, foe.shield.centre);
                out[shield + 4] = foe.shield.normal.x;
                out[shield + 5] = foe.shield.normal.y;
                out[shield + 6] = foe.shield.normal.z;
                out[shield + 7] = span(foe.shield.half_width);
                out[shield + 8] = span(foe.shield.half_height);
            }

            let severed = shield + ARTICULATED_SHIELD_FEATURES;
            for part in 0..BodyPart::COUNT {
                out[severed + part] = flag(foe.severed_mask & (1 << part) != 0);
            }
            out[severed + BodyPart::COUNT] = foe.contact_timing;
            debug_assert_eq!(
                severed + BodyPart::COUNT + 1,
                base + ARTICULATED_OPPONENT_FEATURES
            );
        }
        i += MAX_ARTICULATED_OPPONENTS * ARTICULATED_OPPONENT_FEATURES;

        debug_assert_eq!(i, block + ARTICULATED_FEATURE_COUNT);
        i
    }

    /// The appended embodied block, 32 wide, starting past the articulated one.
    /// Returns the cursor past it.
    ///
    /// **No frame and no divisor, which is what separates it from the block
    /// above.** Nothing in here is a position in the world: every column is
    /// already a fraction of something -- of the twist budget, of the standing
    /// pelvis, of a step's duration, of `arm_length` -- and it is a fraction in
    /// the *observation* and not merely in the vector, because the constants
    /// those fractions divide by are `pub` in `crate::combat::actuator` and
    /// deliberately unreachable from outside `sim`. A policy holding a raw twist
    /// could not normalise it, so the struct publishes the ratio and this writer
    /// copies it. See [`ObservedStance`].
    ///
    /// The two `present` columns are read off the stance flags and not off the
    /// identities beside them, so each half of the block is self-describing:
    /// a reader that has only these 32 numbers can still tell a squared,
    /// standing body from no body at all.
    fn write_embodied_features(&self, out: &mut [Fx], from: usize) -> usize {
        let block = from;
        let art = &self.articulated;
        let flag = |b: bool| if b { Fx::ONE } else { Fx::ZERO };

        let mut i = block;
        let stance = &art.stance;
        if stance.present {
            out[i] = Fx::ONE;
            // The hips as a pair, on the argument `EMBODIED_SELF_FEATURES`
            // gives: `cos(0)` is one, so a squared body and an absent one differ
            // here rather than agreeing on zero.
            out[i + 1] = stance.hip_yaw.cos();
            out[i + 2] = stance.hip_yaw.sin();
            // Fractions at their source, so none of them is re-divided here.
            out[i + 3] = stance.twist_fraction;
            out[i + 4] = stance.pelvis_fraction;
            out[i + 5] = stance.step_fraction;
            for limb in 0..2 {
                let base = i + 6 + limb * EMBODIED_ARM_FEATURES;
                out[base] = stance.elbow[limb].x;
                out[base + 1] = stance.elbow[limb].y;
                out[base + 2] = stance.elbow[limb].z;
                out[base + 3] = stance.reach_headroom[limb];
            }
        }
        i += EMBODIED_SELF_FEATURES;
        debug_assert_eq!(i, block + EMBODIED_SELF_FEATURES);

        for slot in 0..MAX_ARTICULATED_OPPONENTS {
            let base = i + slot * EMBODIED_OPPONENT_FEATURES;
            let foe = &art.opponents[slot].stance;
            // An empty row is three zeros. `ObservedOpponent::BLANK` carries a
            // blank stance, so a row that is blank in the articulated block is
            // blank here too without this having to consult it.
            if !foe.present { continue; }
            out[base] = Fx::ONE;
            out[base + 1] = foe.twist_fraction;
            out[base + 2] = flag(foe.stepping);
        }
        i += MAX_ARTICULATED_OPPONENTS * EMBODIED_OPPONENT_FEATURES;

        debug_assert_eq!(i, block + EMBODIED_FEATURE_COUNT);
        i
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A displacement whose three components are all non-zero and all
    /// different, so a writer that transposed two of them fails.
    fn point(k: i32) -> Vec3 {
        Vec3::new(
            Fx::from_ratio(k, 10),
            Fx::from_ratio(k + 1, 10),
            Fx::from_ratio(k + 2, 10),
        )
    }

    /// The same, scaled to a velocity that survives division by
    /// [`SPEED_SCALE`] without hitting the clamp -- a saturated column cannot
    /// show that it moved, which is what the index test needs it to do.
    fn drift(k: i32) -> Vec3 {
        point(k) * Fx::from_ratio(1, 16)
    }

    /// Small enough that a velocity column nudged by it stays off the clamp.
    const NUDGE: Fx = Fx::from_ratio(1, 64);

    /// An observation whose articulated block cannot legally contain a zero.
    ///
    /// Every column is fed a value that survives its own divisor -- the
    /// smallest here is a tenth of a unit over a sight range of six, which is
    /// still eleven hundred raw units -- so "this feature is zero" and "the
    /// writer never touched this feature" become the same statement.
    fn every_column_filled() -> Observation {
        let origin = Vec3::from_ints(3, 4, 0);
        let yaw = Angle::from_degrees(30);
        let shield = |centre: Vec3| ObservedShield {
            present: true,
            centre,
            normal: Vec3::new(Fx::from_ratio(3, 5), Fx::from_ratio(4, 5), Fx::from_ratio(1, 2)),
            half_width: Fx::from_ratio(1, 2),
            half_height: Fx::from_ratio(3, 4),
        };
        let arm = |k: i32| ObservedArm {
            hand: origin + point(k),
            target_hand: origin + point(k + 3),
            velocity: drift(k + 6),
            fatigue: Fx::from_ratio(1, 3),
            integrity_fraction: Fx::from_ratio(2, 3),
            // True on both arms: the flag is a column like any other, and a
            // healthy fixture would leave two of the 472 unproven.
            severed: true,
            equipment: Some(1),
        };
        let foe = |slot: i32| ObservedOpponent {
            id: EntityId::new(slot as u32 + 1, 0),
            body_position: origin + point(slot * 9 + 1),
            body_velocity: drift(slot + 2),
            body_yaw: yaw,
            regions: core::array::from_fn(|part| RegionVolume {
                lower: origin + point(slot * 9 + part as i32 + 2),
                upper: origin + point(slot * 9 + part as i32 + 3),
                radius: Fx::from_ratio(part as i32 + 1, 10),
                present: true,
            }),
            weapons: core::array::from_fn(|limb| {
                Some(SegmentPose {
                    hilt: origin + point(slot * 9 + limb as i32 + 4),
                    tip: origin + point(slot * 9 + limb as i32 + 5),
                    radius: Fx::from_ratio(1, 20),
                })
            }),
            shield: shield(origin + point(slot * 9 + 6)),
            severed_mask: 0b1_1111,
            contact_timing: Fx::from_ratio(1, 2),
            stance: ObservedOpponentStance {
                present: true,
                twist_fraction: Fx::from_ratio(slot + 1, 8),
                // True on every row, for the reason both arms are severed
                // above: a flag is a column, and a fixture that leaves it clear
                // leaves the column unproven.
                stepping: true,
            },
        };

        let mut obs = Observation::blank(
            7,
            EntityId::new(0, 0),
            Faction::Heroes,
            Vec2::from_ints(3, 4),
            Order::Hold,
        );
        obs.sight_range = Fx::from_int(6);
        obs.articulated = ArticulatedObservation {
            tick: 7,
            subject: EntityId::new(0, 0),
            capabilities: 0xff,
            body_position: origin,
            body_yaw: yaw,
            body_velocity: drift(1),
            arms: [arm(1), arm(11)],
            shield: shield(origin + point(21)),
            blood_fraction: Fx::from_ratio(4, 5),
            shock: Fx::from_ratio(1, 4),
            integrity_fraction: core::array::from_fn(|p| Fx::from_ratio(p as i32 + 1, 8)),
            wound_fraction: core::array::from_fn(|p| Fx::from_ratio(p as i32 + 1, 9)),
            severed_mask: 0b1_1111,
            opponent_count: MAX_ARTICULATED_OPPONENTS as u8,
            opponents: core::array::from_fn(|slot| foe(slot as i32)),
            standing_height: Fx::from_int(2),
            arm_length: Fx::from_ratio(3, 4),
            hand_radius: Fx::from_ratio(1, 10),
            weapons: [
                Some(SegmentPose { hilt: origin + point(31), tip: origin + point(32), radius: Fx::from_ratio(1, 25) }),
                None,
            ],
            stance: ObservedStance {
                present: true,
                // Thirty degrees, so the cosine and the sine are both non-zero
                // and different -- a writer that transposed them would pass at
                // a multiple of a quarter turn.
                hip_yaw: Angle::from_degrees(30),
                twist_fraction: -Fx::from_ratio(1, 3),
                pelvis_fraction: Fx::from_ratio(9, 10),
                step_fraction: Fx::from_ratio(1, 2),
                // Already a fraction of `arm_length` in the observation, so
                // these are the values the writer copies rather than world
                // points it scales -- a triple outside `-1..=1` here would be a
                // fixture the producer cannot make.
                elbow: [point(1), point(4)],
                reach_headroom: [Fx::from_ratio(1, 5), Fx::from_ratio(2, 5)],
            },
        };
        obs
    }

    #[test]
    fn articulated_features_have_one_documented_width() {
        // The reference's rows, summed here from its own numbers rather than
        // from the crate's part constants. A test that adds up the same terms
        // the code adds up is a test that agrees with itself; these are the
        // widths written down in `docs/reference/articulated-abi.md`, read off
        // its index tables. Blood and shock share a row there and are two terms
        // here, which is the only place the two enumerations differ.
        let documented_self: usize = 1 + 8 + 2 + 3 + 12 + 12 + 9 + 1 + 1 + 5 + 5 + 5;
        let documented_opponent: usize = 1 + 3 + 3 + 2 + 4 + 7 + 7 + 7 + 7 + 6 + 6 + 9 + 5 + 1;
        assert_eq!((documented_self, documented_opponent), (64, 68));
        assert_eq!(ARTICULATED_SELF_FEATURES, documented_self);
        assert_eq!(ARTICULATED_OPPONENT_FEATURES, documented_opponent);
        assert_eq!(
            ARTICULATED_FEATURE_COUNT,
            documented_self + MAX_ARTICULATED_OPPONENTS * documented_opponent
        );
        assert_eq!(
            (LEGACY_FEATURE_COUNT, ARTICULATED_FEATURE_COUNT, EMBODIED_FEATURE_COUNT,
             FEATURE_COUNT),
            (450, 472, 32, 954)
        );
        assert_eq!(FEATURE_LAYOUT_VERSION, 13);

        // And the third number: what the writer actually reaches. Every column
        // of the block is fed something that cannot round to zero, so a slot
        // the walk skips shows up here, and a slot it double-books shows up in
        // the cursor assertions inside `write_articulated_features`.
        //
        // **Bounded to the articulated block** rather than running to the end of
        // the vector, which is what it did while the articulated block *was* the
        // end. An unbounded walk would report the embodied block's holes under
        // articulated column names, and `embodied_features_have_one_documented_
        // width` is what owns those 32.
        let obs = every_column_filled();
        let mut out = vec![Fx::ZERO; FEATURE_COUNT];
        assert_eq!(obs.write_features(&mut out), FEATURE_COUNT);
        let articulated = LEGACY_FEATURE_COUNT..LEGACY_FEATURE_COUNT + ARTICULATED_FEATURE_COUNT;
        for (k, v) in out[articulated].iter().enumerate() {
            let named = if k < ARTICULATED_SELF_FEATURES {
                format!("self {k}")
            } else {
                let row = k - ARTICULATED_SELF_FEATURES;
                format!(
                    "opponent {} column {}",
                    row / ARTICULATED_OPPONENT_FEATURES,
                    row % ARTICULATED_OPPONENT_FEATURES
                )
            };
            assert!(!v.is_zero(), "articulated feature {k} ({named}) was never written");
        }
    }

    #[test]
    fn embodied_features_have_one_documented_width() {
        // Summed from the rows rather than from the crate's part constants, on
        // the same terms as the articulated width above: present; the hips as
        // cosine and sine; twist, pelvis and step; then per arm an elbow XYZ and
        // reach headroom. The opponent row is present, twist, mid-step.
        let documented_self: usize = 1 + 2 + 3 + 4 + 4;
        let documented_opponent: usize = 1 + 1 + 1;
        assert_eq!((documented_self, documented_opponent), (14, 3));
        assert_eq!(EMBODIED_SELF_FEATURES, documented_self);
        assert_eq!(EMBODIED_OPPONENT_FEATURES, documented_opponent);
        assert_eq!(
            EMBODIED_FEATURE_COUNT,
            documented_self + MAX_ARTICULATED_OPPONENTS * documented_opponent
        );

        // And what the writer actually reaches, on the fixture that cannot
        // legally contain a zero anywhere in the block.
        let obs = every_column_filled();
        let mut out = vec![Fx::ZERO; FEATURE_COUNT];
        assert_eq!(obs.write_features(&mut out), FEATURE_COUNT);
        let block = LEGACY_FEATURE_COUNT + ARTICULATED_FEATURE_COUNT;
        for (k, v) in out[block..].iter().enumerate() {
            let named = if k < EMBODIED_SELF_FEATURES {
                format!("self {k}")
            } else {
                let row = k - EMBODIED_SELF_FEATURES;
                format!(
                    "opponent {} column {}",
                    row / EMBODIED_OPPONENT_FEATURES,
                    row % EMBODIED_OPPONENT_FEATURES
                )
            };
            assert!(!v.is_zero(), "embodied feature {k} ({named}) was never written");
        }

        // Every column of the block is inside `-1..=1`, which is tighter than
        // the `2` the two live-world range tests in `query.rs` hold the whole
        // vector to. It can be: nothing here is a raw world quantity that a
        // divisor merely approximates -- every column is a fraction of a
        // constant, so one outside the interval would be a divisor that is not
        // the bound it claims to be.
        for (k, v) in out[block..].iter().enumerate() {
            assert!(v.abs() <= Fx::ONE, "embodied feature {k} left the interval at {v:?}");
        }
    }

    /// A body with legs, and a body without, are the same 32 columns wide.
    ///
    /// The two halves are asserted separately because they answer to separate
    /// `present` flags, which is the whole of what distinguishes this block from
    /// the articulated one: a subject with no opponents in view still writes a
    /// full self run, and a Legacy world writes neither.
    #[test]
    fn an_embodied_observation_has_a_fixed_width_whatever_it_perceives() {
        let block = LEGACY_FEATURE_COUNT + ARTICULATED_FEATURE_COUNT;
        for perceived in 0..=MAX_ARTICULATED_OPPONENTS {
            let mut obs = every_column_filled();
            obs.articulated.opponent_count = perceived as u8;
            for slot in perceived..MAX_ARTICULATED_OPPONENTS {
                obs.articulated.opponents[slot] = ObservedOpponent::BLANK;
            }
            // Pre-dirtied past the end, so a writer that ran long clears the
            // guard and one that stopped short leaves nines inside the block.
            let mut out = vec![Fx::from_int(9); FEATURE_COUNT + 3];
            assert_eq!(obs.write_features(&mut out), FEATURE_COUNT,
                       "the width moved with {perceived} opponents perceived");
            assert_eq!(&out[FEATURE_COUNT..], &[Fx::from_int(9); 3],
                       "the writer ran past its width");

            let row = |slot: usize| {
                let base = block + EMBODIED_SELF_FEATURES + slot * EMBODIED_OPPONENT_FEATURES;
                &out[base..base + EMBODIED_OPPONENT_FEATURES]
            };
            for slot in 0..perceived {
                assert!(row(slot).iter().all(|v| !v.is_zero()),
                        "filled embodied row {slot} has a hole");
            }
            for slot in perceived..MAX_ARTICULATED_OPPONENTS {
                assert!(row(slot).iter().all(|v| v.is_zero()),
                        "unused embodied row {slot} carried a value");
            }
            // The self run is untouched by how much is perceived.
            assert_eq!(out[block], Fx::ONE, "the self present column moved");
            assert!(out[block..block + EMBODIED_SELF_FEATURES].iter().all(|v| !v.is_zero()),
                    "the self run has a hole at {perceived} opponents");
        }
    }

    /// A Legacy world writes the embodied block as blank, exactly as it writes
    /// the articulated one.
    ///
    /// The `present` columns are the load-bearing part: an all-zero row is what
    /// this asserts, and the two flags are why an all-zero row is unambiguous
    /// here at all.
    #[test]
    fn a_legacy_observation_writes_the_embodied_block_as_blank() {
        let obs = Observation::blank(
            0,
            EntityId::new(0, 0),
            Faction::Heroes,
            Vec2::ZERO,
            Order::Hold,
        );
        assert_eq!(obs.articulated.stance, ObservedStance::BLANK,
                   "a blank observation claimed a stance");
        let mut out = vec![Fx::from_int(9); FEATURE_COUNT + 3];
        assert_eq!(obs.write_features(&mut out), FEATURE_COUNT);
        let block = LEGACY_FEATURE_COUNT + ARTICULATED_FEATURE_COUNT;
        assert_eq!(
            out[block..FEATURE_COUNT].iter().filter(|v| v.is_zero()).count(),
            EMBODIED_FEATURE_COUNT,
            "a Legacy world wrote an embodied value"
        );
        assert_eq!(&out[FEATURE_COUNT..], &[Fx::from_int(9); 3], "the writer ran past its width");
    }

    /// The embodied block is appended after the articulated one and never
    /// interleaved with it: blanking the stance moves the last 32 columns and
    /// nothing else.
    ///
    /// This is the structural half of the `legacy feature prefix` pin's claim.
    /// The pin itself lives in `query.rs` and drives a whole scripted fight
    /// through a policy; this is the cheap statement of the same property,
    /// stated over both frozen blocks rather than only the first.
    #[test]
    fn the_legacy_feature_prefix_is_unmoved_by_the_embodied_block() {
        let filled = every_column_filled();
        let mut with = vec![Fx::ZERO; FEATURE_COUNT];
        filled.write_features(&mut with);

        let mut blanked = filled.clone();
        blanked.articulated.stance = ObservedStance::BLANK;
        for slot in 0..MAX_ARTICULATED_OPPONENTS {
            blanked.articulated.opponents[slot].stance = ObservedOpponentStance::BLANK;
        }
        let mut without = vec![Fx::ZERO; FEATURE_COUNT];
        blanked.write_features(&mut without);

        let frozen = LEGACY_FEATURE_COUNT + ARTICULATED_FEATURE_COUNT;
        assert_eq!(with[..frozen], without[..frozen],
                   "the embodied block reached a frozen column");
        // And it is not vacuous: the tail did move.
        assert_ne!(with[frozen..], without[frozen..],
                   "blanking the stance changed nothing, so the comparison above proves nothing");
        assert!(without[frozen..].iter().all(|v| v.is_zero()),
                "a blanked stance still wrote a column");
    }

    #[test]
    fn a_blank_articulated_block_writes_four_hundred_and_seventy_two_zeroes() {
        let obs = Observation::blank(
            0,
            EntityId::new(0, 0),
            Faction::Heroes,
            Vec2::ZERO,
            Order::Hold,
        );
        assert!(!obs.articulated.present(), "a blank observation claimed a subject");
        // Pre-dirtied, including three words past the end: a writer that
        // stopped short leaves nines inside the block, and one that ran long
        // clears the guard.
        let mut out = vec![Fx::from_int(9); FEATURE_COUNT + 3];
        assert_eq!(obs.write_features(&mut out), FEATURE_COUNT);
        // Bounded to the articulated block, which it did not have to be while
        // that block ran to the end of the vector.
        // `a_legacy_observation_writes_the_embodied_block_as_blank` makes the
        // same claim about the 32 after it.
        let articulated = LEGACY_FEATURE_COUNT..LEGACY_FEATURE_COUNT + ARTICULATED_FEATURE_COUNT;
        assert_eq!(
            out[articulated].iter().filter(|v| v.is_zero()).count(),
            ARTICULATED_FEATURE_COUNT,
            "a blank articulated block wrote a value"
        );
        assert_eq!(&out[FEATURE_COUNT..], &[Fx::from_int(9); 3], "the writer ran past its width");
    }

    #[test]
    fn an_unused_opponent_row_writes_sixty_eight_zeroes() {
        // The reference's "no hidden identity or geometry enters an unused
        // row", put through the writer rather than asserted on the constant.
        // A blank `ObservedOpponent` sitting in the struct proves nothing on
        // its own; what matters is that the 68 columns behind it stay zero
        // while the filled rows beside them do not.
        let mut obs = every_column_filled();
        obs.articulated.opponent_count = 2;
        for slot in 2..MAX_ARTICULATED_OPPONENTS {
            obs.articulated.opponents[slot] = ObservedOpponent::BLANK;
        }
        let mut out = vec![Fx::ZERO; FEATURE_COUNT];
        obs.write_features(&mut out);

        let row = |slot: usize| {
            let base = LEGACY_FEATURE_COUNT
                + ARTICULATED_SELF_FEATURES
                + slot * ARTICULATED_OPPONENT_FEATURES;
            &out[base..base + ARTICULATED_OPPONENT_FEATURES]
        };
        for slot in 0..2 {
            assert!(row(slot).iter().all(|v| !v.is_zero()), "filled row {slot} has a hole");
        }
        for slot in 2..MAX_ARTICULATED_OPPONENTS {
            assert!(row(slot).iter().all(|v| v.is_zero()), "unused row {slot} carried a value");
        }
        assert_eq!(obs.articulated.opponents().len(), 2);
        assert_eq!(ObservedOpponent::BLANK.id, EntityId::NONE, "blank is not the never-resolving handle");
    }

    /// One perturbation and the block offsets it is allowed to move.
    ///
    /// A perturbation rather than a list of expected values, because the
    /// question the index table answers is *which column moves when this field
    /// moves*, and that is the question a transposition gets wrong. Comparing
    /// values instead would need a second copy of every divisor in the test,
    /// which would then agree with the code by construction.
    struct Column {
        named: String,
        expect: core::ops::Range<usize>,
        nudge: Box<dyn Fn(&mut ArticulatedObservation)>,
    }

    fn column(
        named: &str,
        expect: core::ops::Range<usize>,
        nudge: impl Fn(&mut ArticulatedObservation) + 'static,
    ) -> Column {
        Column { named: named.to_string(), expect, nudge: Box::new(nudge) }
    }

    /// Every column of the block, one perturbation each, against the index
    /// table in `docs/reference/articulated-abi.md`.
    ///
    /// Each capability bit and each XYZ component gets its own row, so a
    /// swapped pair *inside* a documented row fails as loudly as a swapped row.
    /// The one field deliberately absent is `body_position`: it is the frame
    /// origin, so moving it moves every relative column at once and would say
    /// nothing about where any of them live.
    fn documented_columns() -> Vec<Column> {
        // Row three, because a stride error that is a multiple of the row width
        // still lands on row zero. The first and last rows are checked for the
        // stride itself at the end.
        const ROW: usize = 3;
        let base = ARTICULATED_SELF_FEATURES + ROW * ARTICULATED_OPPONENT_FEATURES;
        let at = |offset: usize, width: usize| base + offset..base + offset + width;

        let mut columns = vec![
            column("self present", 0..ARTICULATED_FEATURE_COUNT, |a| a.subject = EntityId::NONE),
            column("self yaw", 9..11, |a| a.body_yaw = Angle::from_degrees(200)),
            column("self velocity x", 11..12, |a| a.body_velocity.x += NUDGE),
            column("self velocity y", 12..13, |a| a.body_velocity.y += NUDGE),
            column("self velocity z", 13..14, |a| a.body_velocity.z += NUDGE),
            column("self shield present", 38..47, |a| a.shield.present = false),
            column("self shield centre x", 39..40, |a| a.shield.centre.x += Fx::ONE),
            column("self shield centre y", 40..41, |a| a.shield.centre.y += Fx::ONE),
            column("self shield centre z", 41..42, |a| a.shield.centre.z += Fx::ONE),
            column("self shield normal x", 42..43, |a| a.shield.normal.x = -a.shield.normal.x),
            column("self shield normal y", 43..44, |a| a.shield.normal.y = -a.shield.normal.y),
            column("self shield normal z", 44..45, |a| a.shield.normal.z = -a.shield.normal.z),
            column("self shield half width", 45..46, |a| a.shield.half_width = Fx::ZERO),
            column("self shield half height", 46..47, |a| a.shield.half_height = Fx::ZERO),
            column("self blood", 47..48, |a| a.blood_fraction = Fx::ZERO),
            column("self shock", 48..49, |a| a.shock = Fx::ZERO),
            column("foe present", at(0, ARTICULATED_OPPONENT_FEATURES), |a| a.opponents[ROW].id = EntityId::NONE),
            column("foe body x", at(1, 1), |a| a.opponents[ROW].body_position.x += Fx::ONE),
            column("foe body y", at(2, 1), |a| a.opponents[ROW].body_position.y += Fx::ONE),
            column("foe body z", at(3, 1), |a| a.opponents[ROW].body_position.z += Fx::ONE),
            column("foe velocity x", at(4, 1), |a| a.opponents[ROW].body_velocity.x += NUDGE),
            column("foe velocity y", at(5, 1), |a| a.opponents[ROW].body_velocity.y += NUDGE),
            column("foe velocity z", at(6, 1), |a| a.opponents[ROW].body_velocity.z += NUDGE),
            column("foe yaw", at(7, 2), |a| a.opponents[ROW].body_yaw = Angle::from_degrees(200)),
            column("foe head x", at(9, 1), |a| a.opponents[ROW].regions[0].lower.x += Fx::ONE),
            column("foe head y", at(10, 1), |a| a.opponents[ROW].regions[0].lower.y += Fx::ONE),
            column("foe head z", at(11, 1), |a| a.opponents[ROW].regions[0].lower.z += Fx::ONE),
            column("foe head radius", at(12, 1), |a| a.opponents[ROW].regions[0].radius = Fx::ZERO),
            column("foe head absent", at(9, 4), |a| a.opponents[ROW].regions[0].present = false),
            // The head writes `lower` and never `upper`, which is what makes it
            // the degenerate volume rather than a capsule with three wasted
            // columns. Nothing may move.
            column("foe head upper", at(0, 0), |a| a.opponents[ROW].regions[0].upper.x += Fx::ONE),
            column("foe left hilt x", at(41, 1), |a| a.opponents[ROW].weapons[0].as_mut().expect("a weapon").hilt.x += Fx::ONE),
            column("foe left tip x", at(44, 1), |a| a.opponents[ROW].weapons[0].as_mut().expect("a weapon").tip.x += Fx::ONE),
            column("foe left weapon absent", at(41, 6), |a| a.opponents[ROW].weapons[0] = None),
            column("foe right hilt x", at(47, 1), |a| a.opponents[ROW].weapons[1].as_mut().expect("a weapon").hilt.x += Fx::ONE),
            column("foe right tip x", at(50, 1), |a| a.opponents[ROW].weapons[1].as_mut().expect("a weapon").tip.x += Fx::ONE),
            column("foe right weapon absent", at(47, 6), |a| a.opponents[ROW].weapons[1] = None),
            column("foe shield present", at(53, 9), |a| a.opponents[ROW].shield.present = false),
            column("foe shield centre x", at(54, 1), |a| a.opponents[ROW].shield.centre.x += Fx::ONE),
            column("foe shield normal x", at(57, 1), |a| a.opponents[ROW].shield.normal.x = -a.opponents[ROW].shield.normal.x),
            column("foe shield half width", at(60, 1), |a| a.opponents[ROW].shield.half_width = Fx::ZERO),
            column("foe shield half height", at(61, 1), |a| a.opponents[ROW].shield.half_height = Fx::ZERO),
            column("foe timing", at(67, 1), |a| a.opponents[ROW].contact_timing = Fx::ZERO),
            // The stride, at both ends. A row width wrong by anything at all
            // puts the last row's last column somewhere other than 471.
            column("first row timing",
                   ARTICULATED_SELF_FEATURES + 67..ARTICULATED_SELF_FEATURES + 68,
                   |a| a.opponents[0].contact_timing = Fx::ZERO),
            column("last row timing",
                   ARTICULATED_FEATURE_COUNT - 1..ARTICULATED_FEATURE_COUNT,
                   |a| a.opponents[5].contact_timing = Fx::ZERO),
        ];

        // Clearing a capability bit is the only single-column perturbation
        // available: setting one would need a bit the fixture leaves clear, and
        // it sets all eight.
        for bit in 0..8usize {
            columns.push(column(&format!("capability bit {bit}"), 1 + bit..2 + bit,
                                move |a| a.capabilities &= !(1u32 << bit)));
        }
        for (limb, run) in [(0usize, 14usize), (1, 26)] {
            columns.push(column(&format!("arm {limb} hand x"), run..run + 1, move |a| a.arms[limb].hand.x += Fx::ONE));
            columns.push(column(&format!("arm {limb} hand y"), run + 1..run + 2, move |a| a.arms[limb].hand.y += Fx::ONE));
            columns.push(column(&format!("arm {limb} hand z"), run + 2..run + 3, move |a| a.arms[limb].hand.z += Fx::ONE));
            columns.push(column(&format!("arm {limb} target x"), run + 3..run + 4, move |a| a.arms[limb].target_hand.x += Fx::ONE));
            columns.push(column(&format!("arm {limb} target y"), run + 4..run + 5, move |a| a.arms[limb].target_hand.y += Fx::ONE));
            columns.push(column(&format!("arm {limb} target z"), run + 5..run + 6, move |a| a.arms[limb].target_hand.z += Fx::ONE));
            columns.push(column(&format!("arm {limb} velocity x"), run + 6..run + 7, move |a| a.arms[limb].velocity.x += NUDGE));
            columns.push(column(&format!("arm {limb} velocity y"), run + 7..run + 8, move |a| a.arms[limb].velocity.y += NUDGE));
            columns.push(column(&format!("arm {limb} velocity z"), run + 8..run + 9, move |a| a.arms[limb].velocity.z += NUDGE));
            columns.push(column(&format!("arm {limb} fatigue"), run + 9..run + 10, move |a| a.arms[limb].fatigue = Fx::ZERO));
            columns.push(column(&format!("arm {limb} integrity"), run + 10..run + 11, move |a| a.arms[limb].integrity_fraction = Fx::ZERO));
            columns.push(column(&format!("arm {limb} severed"), run + 11..run + 12, move |a| a.arms[limb].severed = false));
        }
        for part in 0..BodyPart::COUNT {
            columns.push(column(&format!("self integrity {part}"), 49 + part..50 + part,
                                move |a| a.integrity_fraction[part] = Fx::ZERO));
            columns.push(column(&format!("self wound {part}"), 54 + part..55 + part,
                                move |a| a.wound_fraction[part] = Fx::ZERO));
            columns.push(column(&format!("self severed {part}"), 59 + part..60 + part,
                                move |a| a.severed_mask &= !(1u8 << part)));
            columns.push(column(&format!("foe severed {part}"), at(62 + part, 1),
                                move |a| a.opponents[ROW].severed_mask &= !(1u8 << part)));
        }
        // Torso, both arms, legs: the four capsules, seven columns apiece, in
        // `BodyPart` order after the head.
        for (part, offset) in [(1usize, 13usize), (2, 20), (3, 27), (4, 34)] {
            columns.push(column(&format!("foe capsule {part} lower x"), at(offset, 1),
                                move |a| a.opponents[ROW].regions[part].lower.x += Fx::ONE));
            columns.push(column(&format!("foe capsule {part} upper x"), at(offset + 3, 1),
                                move |a| a.opponents[ROW].regions[part].upper.x += Fx::ONE));
            columns.push(column(&format!("foe capsule {part} radius"), at(offset + 6, 1),
                                move |a| a.opponents[ROW].regions[part].radius = Fx::ZERO));
            columns.push(column(&format!("foe capsule {part} absent"), at(offset, 7),
                                move |a| a.opponents[ROW].regions[part].present = false));
        }
        columns
    }

    #[test]
    fn articulated_lengths_divide_by_sight_and_velocities_by_speed_scale() {
        // The index test above deliberately says nothing about *values* -- it
        // asks which column moves, not what lands in it -- so the two divisors
        // would survive a rescale unnoticed. This pins them by their
        // definition rather than by copying the writer: a displacement of
        // exactly one sight range is exactly one, a velocity of exactly
        // `SPEED_SCALE` is exactly one, and both clamp rather than overflow.
        let mut obs = every_column_filled();
        obs.sight_range = Fx::from_int(6);
        let sight = obs.sight_range;
        let origin = obs.articulated.body_position;
        obs.articulated.arms[0].hand = origin + Vec3::new(sight, sight / 2, -sight * 2);
        obs.articulated.body_velocity = Vec3::new(SPEED_SCALE, SPEED_SCALE / 4, -SPEED_SCALE * 3);
        // A radius is a length and divides by the same thing, which is what
        // makes "how wide is that torso" comparable with "how far away is it".
        obs.articulated.opponents[0].regions[BodyPart::Head as usize].radius = sight / 4;

        let mut out = vec![Fx::ZERO; FEATURE_COUNT];
        obs.write_features(&mut out);
        let block = LEGACY_FEATURE_COUNT;
        assert_eq!(out[block + 14], Fx::ONE, "one sight range is not one");
        assert_eq!(out[block + 15], Fx::HALF, "half a sight range is not a half");
        assert_eq!(out[block + 16], -Fx::ONE, "two sight ranges did not clamp");
        assert_eq!(out[block + 11], Fx::ONE, "one SPEED_SCALE is not one");
        assert_eq!(out[block + 12], Fx::from_ratio(1, 4));
        assert_eq!(out[block + 13], -Fx::ONE, "three SPEED_SCALE did not clamp");
        assert_eq!(out[block + ARTICULATED_SELF_FEATURES + 12], Fx::from_ratio(1, 4),
                   "a radius is on a different scale from the point it belongs to");
    }

    #[test]
    fn every_articulated_feature_lands_on_its_documented_index() {
        // The layout is the contract a trained network will be frozen against,
        // and until a policy reads it nothing else in the suite would notice a
        // transposition -- no golden hash covers it, because an observation is
        // not authoritative state. So the index table is asserted directly:
        // perturb one field, and exactly the offsets the reference names move.
        let base = every_column_filled();
        let mut before = vec![Fx::ZERO; FEATURE_COUNT];
        base.write_features(&mut before);

        // **The range is the articulated block and no longer the tail of the
        // vector, and the narrowing is itself the assertion.** It ran to
        // `FEATURE_COUNT` while the articulated block *was* the tail; once the
        // embodied block was appended, every row of the table below would have
        // started failing on columns it says nothing about. Narrowed, an
        // articulated perturbation that reached an embodied column is caught
        // rather than absorbed -- the wider range would have quietly accepted
        // one as an extra moved offset in the list.
        let articulated = LEGACY_FEATURE_COUNT..LEGACY_FEATURE_COUNT + ARTICULATED_FEATURE_COUNT;
        let mut after = vec![Fx::ZERO; FEATURE_COUNT];
        for Column { named, expect, nudge } in documented_columns() {
            let mut obs = base.clone();
            nudge(&mut obs.articulated);
            obs.write_features(&mut after);
            let moved: Vec<usize> = articulated.clone()
                .filter(|&k| before[k] != after[k])
                .map(|k| k - LEGACY_FEATURE_COUNT)
                .collect();
            assert_eq!(moved, expect.clone().collect::<Vec<_>>(),
                       "{named} moved the wrong block offsets");
            assert!(before[..LEGACY_FEATURE_COUNT] == after[..LEGACY_FEATURE_COUNT],
                    "{named} reached the frozen prefix");
        }
    }

}
