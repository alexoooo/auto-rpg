//! Where an arm is: shoulder, hand, and the inverse that puts a struck hand
//! back into joint space.
//!
//! One owner for a question that used to have three. `hand_position` lived in
//! `actuator.rs`, its inverse beside it, and the arm's *collision volume* was
//! built independently in `geometry.rs` as a capsule from `shoulder` to the
//! hand. The two agreed by inspection rather than by construction, which is a
//! thing that stops being true quietly. [`arm_polyline`] is now the single
//! answer both consume.
//!
//! # The reach hole, and where it is closed
//!
//! **[`hand_position`] places the hand at `physical_reach` in the horizontal
//! plane and then *overwrites* `hand.z` with `standing_height * height`.** Height
//! and reach are independent axes, so the actual shoulder-to-hand distance is
//! `sqrt(physical_reach^2 + dz^2)`, which exceeds `arm_length` whenever the arm
//! is both extended and raised or lowered. The reachable set is a cylinder shell
//! rather than a sphere, and nothing in the model bounds the limb by its own
//! length.
//!
//! That is a mechanics hole and not a drawing problem: a high guard at full
//! extension is a pose no arm could hold, and a policy that asks for one gets
//! it.
//!
//! **It is closed at the command boundary and deliberately not here.**
//! [`reachable_extent`] clamps a commanded `(height, reach)` onto the annulus
//! the two links can actually span, and `World::world_arm_target` applies it to
//! every torso-frame target before integration -- which is every body the
//! surviving model builds. This paragraph named
//! `an_articulated_arm_target_is_still_unclamped` as the guard that the *other*
//! model stayed open; that model and that test are gone together, and the
//! clamp's own tests are below.
//!
//! The arithmetic in this module stays unclamped even so, and for two reasons
//! worth keeping: bounding the pose here as well as the target would move every
//! pinned corpus, because `hand_position` is on the publication path for every
//! body; and clamping a *result* leaves the actuator converging forever on a
//! pose it cannot reach and sitting at the limit with a permanent error, where
//! clamping the target makes it chase something it can hold and stop.
//! `World::reachable_arm_target` carries that second argument in full.

use crate::{BodyAnatomySpec, CombatHeight};
use fx::{mul_div, Angle, Fx, Vec2, Vec3};

use super::actuator::ARM_MIN_REACH_RAW;

/// Share of `arm_length` above the elbow. A half.
///
/// The two links being equal makes the naive inner bound `|upper - fore|` zero --
/// a hand that could touch its own shoulder -- which is exactly why the real
/// inner bound comes from [`ELBOW_MIN_INCLUDED_ANGLE_RAW`] rather than from the
/// link lengths. Saying so is more honest than choosing an asymmetry in order to
/// manufacture a bound the joint already provides.
pub(crate) const UPPER_ARM_FRACTION_RAW: i32 = 32_768;

/// The elbow's own stop: the smallest included angle between the two links.
///
/// Forty degrees, which is about where a human elbow meets its own bicep.
/// Bounded from **both** sides by `an_elbow_stop_is_a_fold_and_not_a_hinge`: at
/// zero the arm could fold flat and the hand could reach its own shoulder, and
/// past a right angle a fighter could not bring a guard in close enough to hold
/// one.
pub(crate) const ELBOW_MIN_INCLUDED_ANGLE_RAW: u16 = 7_282;

/// Furthest a commanded hand bearing may travel from the achieved torso facing.
///
/// Three eighths of a turn (135 degrees) leaves one eighth-turn of useful rear
/// reach on either side, but removes the directly-behind half-turn which lets a
/// mouse circle pull the weapon through its owner. This is an anatomy law, not
/// browser feel tuning: every command source reaches the same projection.
pub(crate) const ARM_REAR_SWEEP_LIMIT_RAW: i32 = 24_576;

/// An arm as two links and the stop between them.
///
/// A value rather than three loose numbers, because the pair of bounds it
/// produces has to be the same pair everywhere -- the target clamp before
/// integration and the inverse a struck hand comes back through both read it,
/// and the two agreeing by construction is the point.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(crate) struct Elbow {
    pub upper: Fx,
    pub fore: Fx,
}

impl Elbow {
    pub(crate) fn of(anatomy: &BodyAnatomySpec) -> Elbow {
        let upper = anatomy.arm_length * Fx::from_raw(UPPER_ARM_FRACTION_RAW);
        Elbow { upper, fore: anatomy.arm_length - upper }
    }

    /// How far the hand may sit from the shoulder: `[inner, outer]`.
    ///
    /// The outer bound is the arm laid straight. The inner one is the law of
    /// cosines at the joint's own stop -- `u^2 + f^2 - 2uf cos(theta)` -- and it
    /// is a *fold*, not a hinge: an elbow at forty degrees still holds the hand
    /// a third of an arm's length away from the shoulder.
    pub(crate) fn reach_bounds(self) -> (Fx, Fx) {
        let outer = self.upper + self.fore;
        let theta = Angle::from_raw(ELBOW_MIN_INCLUDED_ANGLE_RAW);
        let squares = self.upper * self.upper + self.fore * self.fore;
        let cross = (self.upper * self.fore) * Fx::TWO;
        let inner_squared = squares - cross * theta.cos();
        (inner_squared.max(Fx::ZERO).sqrt().min(outer), outer)
    }
}

/// The nearest `(height, reach)` the arm can actually hold.
///
/// **Clamped in target space rather than in hand space, and that is the whole of
/// why this function exists.** The obvious spelling -- compute the hand, pull it
/// onto the annulus, invert back to a target -- does not work, because
/// `hand_position` and `inverse_hand` are inverses only on the poses
/// `hand_position` can *reach*: `reach` is floored at [`ARM_MIN_REACH_RAW`] and
/// `height` is a bounded fraction, so an inverted point outside those ranges
/// comes back as a different, longer arm. Measured, before this replaced it: a
/// clamp to `0.7500` produced a hand at `0.7666`.
///
/// Here the two axes are clamped in the order they constrain each other. The
/// vertical is fixed by `height` alone, so it goes first -- and it is bounded
/// not by the arm's length but by what is left after the *shortest* horizontal
/// the forward map can express, or the floor on `reach` would push a
/// fully-raised arm straight back outside. The horizontal then takes whatever
/// the annulus has left at that height.
pub(crate) fn reachable_extent(
    anatomy: &BodyAnatomySpec, height: CombatHeight, reach: Fx, elbow: Elbow,
) -> (CombatHeight, Fx) {
    let (inner, outer) = elbow.reach_bounds();
    let shortest = anatomy.arm_length * Fx::from_raw(ARM_MIN_REACH_RAW);
    // How far above or below the shoulder the hand may sit at all, given that
    // the forward map will always spend at least `shortest` on the horizontal.
    let vertical_budget = (outer * outer - shortest * shortest).max(Fx::ZERO).sqrt();

    let asked_z = anatomy.standing_height * Fx::from_raw(height.raw());
    let wanted_z = (anatomy.shoulder_height
        + (asked_z - anatomy.shoulder_height).clamp(-vertical_budget, vertical_budget))
        .clamp(Fx::ZERO, anatomy.standing_height);
    let held_height_raw = if anatomy.standing_height.is_positive() {
        (wanted_z / anatomy.standing_height).clamp(Fx::ZERO, Fx::ONE).raw()
    } else {
        0
    };
    let held_height = CombatHeight::try_from_raw(held_height_raw).expect("clamped into range");

    // **Measured from the height the forward map will actually produce, not from
    // the one asked for.** `height` is quantised on the way through, and for a
    // hand below the shoulder that quantisation makes `dz` *larger*, so a budget
    // computed before it leaves the arm a raw unit or two long. That was the
    // second wrong answer this function gave, and the reason it is written in
    // this order.
    let realised_z = anatomy.standing_height * Fx::from_raw(held_height.raw());
    let dz = realised_z - anatomy.shoulder_height;

    let widest = (outer * outer - dz * dz).max(Fx::ZERO).sqrt();
    let narrowest = (inner * inner - dz * dz).max(Fx::ZERO).sqrt().min(widest);
    let asked = anatomy.arm_length * reach.max(Fx::from_raw(ARM_MIN_REACH_RAW));
    let held = asked.clamp(narrowest, widest);

    let mut held_reach = if anatomy.arm_length.is_positive() {
        (held / anatomy.arm_length).clamp(Fx::from_raw(ARM_MIN_REACH_RAW), Fx::ONE)
    } else {
        Fx::ZERO
    };
    // `Fx` division truncates toward negative infinity, so the reach that comes
    // back is at or *below* the extent asked for. Against the outer bound that
    // is exactly right -- an arm rounding shorter cannot overreach. Against the
    // inner one it rounds the wrong way and lands a raw unit inside the fold, so
    // it is nudged back out. Bounded to two steps because the error is one
    // truncation, and asserted to stay bounded by the sweep that found it.
    for _ in 0..2 {
        if held_reach >= Fx::ONE { break; }
        if anatomy.arm_length * held_reach >= narrowest { break; }
        held_reach = Fx::from_raw(held_reach.raw() + 1);
    }
    (held_height, held_reach)
}

/// The representable forward pose inside the elbow annulus for one bearing.
///
/// [`reachable_extent`] closes the scalar height/reach law, but the sine table
/// can make the realised planar vector a few raw units longer or shorter than
/// that scalar extent. Collision, contact and elbow publication consume the
/// realised hand, so they share this final bounded raw-square closure rather
/// than each choosing a different one-raw boundary answer.
pub(crate) fn reachable_pose(
    anatomy: &BodyAnatomySpec, yaw: Angle, limb: usize, bearing: Angle,
    height: CombatHeight, reach: Fx, elbow: Elbow,
) -> (CombatHeight, Fx, Vec3) {
    let shoulder = shoulder(anatomy, yaw, limb);
    let (inner, outer) = elbow.reach_bounds();
    let (mut height, mut reach) = reachable_extent(anatomy, height, reach, elbow);
    let mut hand = hand_position(anatomy, yaw, limb, bearing, height, reach);
    for _ in 0..256 {
        let delta = hand - shoulder;
        let square = delta.x.raw() as i128 * delta.x.raw() as i128
            + delta.y.raw() as i128 * delta.y.raw() as i128
            + delta.z.raw() as i128 * delta.z.raw() as i128;
        let inner_square = inner.raw() as i128 * inner.raw() as i128;
        let outer_square = outer.raw() as i128 * outer.raw() as i128;
        if square >= inner_square && square <= outer_square
            && elbow_point(shoulder, hand, elbow, Angle::ZERO).is_some() { break }
        if square < inner_square && reach < Fx::ONE {
            reach = Fx::from_raw(reach.raw() + 1);
        } else if square > outer_square && reach.raw() > ARM_MIN_REACH_RAW {
            reach = Fx::from_raw(reach.raw() - 1);
        } else {
            let realised_z = anatomy.standing_height * Fx::from_raw(height.raw());
            let below = realised_z < shoulder.z;
            let step = if square > outer_square {
                if below { 1 } else { -1 }
            } else if below { -1 } else { 1 };
            let next = (height.raw() + step).clamp(0, Fx::ONE.raw());
            if next == height.raw() { break }
            height = CombatHeight::try_from_raw(next).expect("joint height nudge stayed in range");
        }
        hand = hand_position(anatomy, yaw, limb, bearing, height, reach);
    }
    (height, reach, hand)
}

/// The nearest world bearing inside the torso's rear sweep envelope.
///
/// `bearing` and `body_yaw` are both world angles. [`Angle::delta`] chooses the
/// shortest signed torso-relative route across the wrap seam; clamping that
/// signed value makes the two sides exact reflections and makes a second pass
/// idempotent.
pub(crate) fn rear_limited_bearing(body_yaw: Angle, bearing: Angle) -> Angle {
    let relative = bearing.delta(body_yaw)
        .clamp(-ARM_REAR_SWEEP_LIMIT_RAW, ARM_REAR_SWEEP_LIMIT_RAW);
    Angle::from_raw(body_yaw.raw().wrapping_add(relative as u16))
}

/// How much of the annulus the arm has left before [`reachable_extent`]'s clamp
/// bites, as a fraction of `arm_length` in `[0, 1]`.
///
/// **Headroom and not reach, and that is the point of publishing it.** After the
/// elbow, an arm can be commanded to a pose it cannot hold; a fighter that can
/// see how much extension is left can choose between stepping in and reaching
/// further, and one that sees only where its hand is cannot tell a comfortable
/// guard from a locked-out one. Zero means the arm is against its own outer
/// bound and [`reachable_extent`] is already taking the difference.
///
/// **Measured from the height the forward map will actually produce, and it
/// takes that height from [`reachable_extent`] rather than deriving it again.**
/// That is the second of the two wrong answers `reachable_extent`'s own doc
/// records having given, and the same trap is here twice over: the vertical
/// budget moves the height, and the round trip through `standing_height` moves
/// it again. A budget computed from the height that was *asked* for describes a
/// pose the arm is not in. Asking rather than re-deriving is what makes the two
/// agree by construction instead of by inspection -- the same argument
/// [`Elbow::reach_bounds`] is one function for.
///
/// The **asked** horizontal is what the remainder is measured against and not
/// the clamped one, and that is what makes zero mean zero: `reachable_extent`'s
/// reach comes back through a truncating division, so a hand sitting exactly on
/// the outer bound would otherwise report a raw unit of headroom it does not
/// have.
///
/// The inner bound is deliberately absent. An over-folded arm has plenty of
/// extension left and this column says so; what it cannot do is say how much
/// room there is to fold, which is not a question anything asks.
pub(crate) fn reach_headroom(
    anatomy: &BodyAnatomySpec, height: CombatHeight, reach: Fx, elbow: Elbow,
) -> Fx {
    if !anatomy.arm_length.is_positive() { return Fx::ZERO; }
    let (_, outer) = elbow.reach_bounds();
    let (held_height, _) = reachable_extent(anatomy, height, reach, elbow);
    let realised_z = anatomy.standing_height * Fx::from_raw(held_height.raw());
    let dz = realised_z - anatomy.shoulder_height;
    let widest = (outer * outer - dz * dz).max(Fx::ZERO).sqrt();
    let asked = anatomy.arm_length * reach.max(Fx::from_raw(ARM_MIN_REACH_RAW));
    ((widest - asked) / anatomy.arm_length).clamp(Fx::ZERO, Fx::ONE)
}

// **`reachable_hand` stood here and had no caller at all.** It pulled a hand
// outside the elbow's annulus back onto it along the shoulder-to-hand line, so
// that an impossible pose became the nearest possible one rather than a refusal.
// That is the right shape for the clamp and it is not where the clamp happens:
// the embodied arm driver applies [`reachable_extent`] to the commanded
// `(height, reach)` *before* integration, so a hand outside the annulus is never
// constructed to be pulled back. The clamp this crate ships works in joint
// space; a Cartesian one that never ran is a second answer waiting to disagree
// with the first.

/// The arm as a polyline, shoulder first, hand last.
///
/// One segment for a single-link arm and two for a jointed one. It exists as a
/// type rather than a tuple so that the session which added the elbow added a
/// point here and every consumer followed without an edit of its own -- which
/// is what happened.
pub(crate) struct ArmPolyline {
    points: [Vec3; 3],
    len: usize,
}

impl ArmPolyline {
    // **The three named ends have no production caller and are kept anyway.**
    // `segments` is what the collider builder reads, because "how many capsules
    // is an arm" must be asked exactly once; these three are how a test names an
    // end without re-deriving it from the same expression the code under test
    // used, which is the difference between an assertion and a restatement. They
    // were production readers until the forearm split the arm in two.
    /// The shoulder end.
    #[allow(dead_code)]
    pub(crate) fn shoulder(&self) -> Vec3 {
        self.points[0]
    }

    /// The hand end.
    #[allow(dead_code)]
    pub(crate) fn hand(&self) -> Vec3 {
        self.points[self.len - 1]
    }

    /// The elbow, for an arm that has one.
    #[allow(dead_code)]
    pub(crate) fn elbow(&self) -> Option<Vec3> {
        (self.len == 3).then(|| self.points[1])
    }

    /// The arm's segments, shoulder-first. One for a single-link arm, two for a
    /// jointed one -- which is what lets a collider builder ask for "the arm"
    /// and get whichever this body has.
    pub(crate) fn segments(&self) -> impl Iterator<Item = (Vec3, Vec3)> + '_ {
        (0..self.len - 1).map(move |at| (self.points[at], self.points[at + 1]))
    }
}

/// Where the elbow sits, given a hand the arm can actually reach.
///
/// The two-link inverse kinematics solution, and it is exact rather than
/// iterative: the elbow lies on the circle of radius `upper` about the shoulder
/// and radius `fore` about the hand, and the intersection of two circles is one
/// square root. `along` is how far down the shoulder-to-hand axis the elbow's
/// projection falls -- `(d^2 + upper^2 - fore^2) / 2d` -- and `out` is how far it
/// stands off that axis.
///
/// **The plane is commanded, and `Angle::ZERO` is the pose that used to be the
/// only one.** A human elbow at rest hangs below the line from shoulder to hand,
/// so the zero direction is the downward one made perpendicular to the axis;
/// when the axis is itself vertical there is no "below" to project and the zero
/// direction is forward, the only one that invents nothing the bearing did not
/// already say. `plane` rotates that direction about the shoulder-to-hand axis,
/// and it is the field the embodied payload used to owe.
///
/// **The rotation is the two-term form and deliberately not a full Rodrigues.**
/// `s` is already perpendicular to the axis by construction -- it is `-Z` with
/// its own projection removed -- so the `(1 - cos)` term of the general formula
/// multiplies a dot product that is zero. With `b = axis x s` the answer is
/// `s*out*cos(plane) + b*out*sin(plane)`, and writing the general form instead
/// would spend two more products to add a term that cannot contribute and would
/// not reproduce the old answer bit for bit at `plane == ZERO`.
///
/// That bit-for-bit claim is the whole reason the terms are ordered this way:
/// `cos(ZERO)` is exactly `Fx::ONE` and `out * Fx::ONE` is exactly `out`, so the
/// first term is character for character the expression that stood here;
/// `sin(ZERO)` is exactly zero and `mul_div(v, 0, d)` is exactly zero, so the
/// second vanishes rather than rounding away.
/// `a_zero_plane_reproduces_the_default_elbow` measures it instead of trusting
/// it.
///
/// Answers `None` when the hand is outside the annulus, because there is no
/// elbow that reaches it. Callers hold a hand [`reachable_extent`] has already
/// clamped, so `None` is a bug rather than a case -- but returning it beats
/// inventing a joint that does not close.
pub(crate) fn elbow_point(shoulder: Vec3, hand: Vec3, elbow: Elbow, plane: Angle)
    -> Option<Vec3>
{
    let offset = hand - shoulder;
    let distance = offset.length();
    if !distance.is_positive() { return None; }
    let (upper, fore) = (elbow.upper, elbow.fore);
    if distance > upper + fore { return None; }

    let numerator = distance * distance + upper * upper - fore * fore;
    let along = numerator / (distance * Fx::TWO);
    let out_squared = upper * upper - along * along;
    if !out_squared.is_positive() { return Some(shoulder + scaled(offset, along, distance)); }
    let out = out_squared.sqrt();

    let axis = scaled(offset, Fx::ONE, distance);
    // Down, made perpendicular to the axis: `-Z` minus its own projection.
    let vertical = Vec3::new(Fx::ZERO, Fx::ZERO, -Fx::ONE);
    let dot = axis.z * -Fx::ONE;
    let mut side = vertical - Vec3::new(axis.x * dot, axis.y * dot, axis.z * dot);
    let mut side_length = side.length();
    if !side_length.is_positive() {
        // The arm is straight up or straight down; "below the line" names
        // nothing. Forward, for the reason the header gives.
        //
        // **It falls through to the rotation rather than returning here.** The
        // axis is then `+/-Z` and the plane is a rotation in the horizontal
        // plane, which is as meaningful a choice as any other pose has -- an
        // arm held straight overhead can still point its elbow east or north.
        // Returning early would have made the one pose with no natural default
        // also the one pose a policy could not steer.
        side = Vec3::new(Fx::ONE, Fx::ZERO, Fx::ZERO);
        side_length = Fx::ONE;
    }
    // `b` has the same length as `s` up to fixed-point rounding, and is
    // re-measured rather than assumed equal: `axis` is a truncated unit vector,
    // so the cross product's length is `side_length` only approximately, and
    // dividing by the wrong one would put the rotated elbow off the link circle
    // by more than the two square roots already cost.
    let binormal = axis.cross(side);
    let binormal_length = binormal.length();
    let mut off = scaled(side, out * plane.cos(), side_length);
    if binormal_length.is_positive() {
        off = off + scaled(binormal, out * plane.sin(), binormal_length);
    }
    Some(shoulder + scaled(offset, along, distance) + off)
}

/// `v * (numerator / denominator)`, one truncation per axis.
///
/// Written out rather than spelled `v * (n / d)` because the second form
/// truncates the ratio first and then the product, which on a unit vector is the
/// difference between a point on a circle and a point a raw unit off it.
fn scaled(v: Vec3, numerator: Fx, denominator: Fx) -> Vec3 {
    Vec3::new(
        mul_div(v.x, numerator, denominator),
        mul_div(v.y, numerator, denominator),
        mul_div(v.z, numerator, denominator),
    )
}

/// The arm from `shoulder` through a solved `elbow` to `hand`, in the body
/// frame.
///
/// Takes the hand rather than deriving it, because its callers already hold the
/// authoritative hand: the actuator integrates towards a target and contact
/// moves the result, so a polyline that recomputed the hand from a command
/// would draw an arm the solver is not using.
///
/// **It takes the elbow for a stronger version of the same reason, and that is
/// why this is one constructor and not the two the elbow session planned.** The
/// plan called for `arm_polyline` beside a `jointed_arm_polyline` that solved
/// the joint itself, on the argument that a caller with no elbow to give should
/// not have to say so. Building the collider is what turned that argument round:
/// the contact phase needs the arm at *both* ends of a sweep, and the tick-entry
/// end is the elbow the body actually **had** when the tick began -- which is
/// not `elbow_point` of this tick's plane and last tick's hand, and is not
/// recoverable from anything the retention row would otherwise carry. So the
/// elbow is solved once, by `World::arm_elbows`, and retained; a constructor
/// that solved it again would be a second answer to a question whose whole
/// point is that it was asked earlier.
///
/// The `Option` is therefore not a model switch dressed as a parameter. It is
/// the retained slot's own shape -- either a solved elbow or a hand outside the
/// two links' annulus -- and `None` falls back to the single segment because a
/// collider builder needs a connected arm more than it needs a joint.
pub(crate) fn arm_polyline(
    anatomy: &BodyAnatomySpec, yaw: Angle, limb: usize, hand: Vec3, elbow: Option<Vec3>,
) -> ArmPolyline {
    let at = shoulder(anatomy, yaw, limb);
    match elbow {
        Some(joint) => ArmPolyline { points: [at, joint, hand], len: 3 },
        None => ArmPolyline { points: [at, hand, Vec3::ZERO], len: 2 },
    }
}

pub(crate) fn shoulder(anatomy: &BodyAnatomySpec, yaw: Angle, limb: usize) -> Vec3 {
    let side = if limb == 0 { anatomy.shoulder_half_width } else { -anatomy.shoulder_half_width };
    Vec3::new(-yaw.sin() * side, mul_div(yaw.cos(), side, Fx::ONE), anatomy.shoulder_height)
}

pub(crate) fn hand_position(
    anatomy: &BodyAnatomySpec,
    yaw: Angle,
    limb: usize,
    bearing: Angle,
    height: CombatHeight,
    reach: Fx,
) -> Vec3 {
    let shoulder = shoulder(anatomy, yaw, limb);
    let physical_reach = anatomy.arm_length * reach.max(Fx::from_raw(ARM_MIN_REACH_RAW));
    Vec3::new(
        shoulder.x + bearing.cos() * physical_reach,
        shoulder.y + mul_div(bearing.sin(), physical_reach, Fx::ONE),
        anatomy.standing_height * Fx::from_raw(height.raw()),
    )
}

/// The inverse of [`hand_position`]: the joint pose that puts the hand where
/// contact left it, clamped to the joint's own limits.
///
/// Contact moves an absolute hand while the authoritative state is a joint
/// pose, so something has to run this direction -- and it cannot be exact. A
/// shoulder cannot reach past its arm and height is a bounded fraction of
/// standing height, so the pose that comes back may put the hand somewhere
/// else. That is why the caller must re-derive the hand from this answer rather
/// than keep the one it asked for, and why the contract makes the *clamped*
/// hand the state the energy check reads.
///
/// `fallback_bearing` is answered when the hand lands exactly on the shoulder
/// axis, where the horizontal vector is zero and carries no direction at all.
/// Reusing the current bearing there is the only choice that does not invent
/// one; the hand is on the axis either way, so nothing observable turns on it.
pub(crate) fn inverse_hand(
    anatomy: &BodyAnatomySpec,
    yaw: Angle,
    limb: usize,
    hand: Vec3,
    fallback_bearing: Angle,
) -> (Angle, CombatHeight, Fx) {
    let shoulder = shoulder(anatomy, yaw, limb);
    let planar = Vec2::new(hand.x - shoulder.x, hand.y - shoulder.y);
    let bearing = if planar.is_zero() { fallback_bearing } else { planar.angle() };
    let height = if anatomy.standing_height.is_positive() {
        (hand.z / anatomy.standing_height).clamp(Fx::ZERO, Fx::ONE)
    } else {
        Fx::ZERO
    };
    let reach = if anatomy.arm_length.is_positive() {
        planar.length() / anatomy.arm_length
    } else {
        Fx::ONE
    };
    (
        bearing,
        CombatHeight::try_from_raw(height.raw()).expect("height clamped into range"),
        reach.clamp(Fx::from_raw(ARM_MIN_REACH_RAW), Fx::ONE),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::combat::spec::{brute_anatomy, fighter_anatomy};

    /// The two shipped anatomies. Both, because they differ in every dimension
    /// this module reads and a claim that holds for one shape is not a claim.
    fn anatomies() -> [BodyAnatomySpec; 2] {
        [fighter_anatomy(), brute_anatomy()]
    }

    #[test]
    fn a_target_directly_behind_the_torso_projects_to_the_nearest_rear_boundary() {
        let yaw = Angle::from_raw(7_000);
        let behind = yaw + Angle::HALF;
        assert_eq!(
            rear_limited_bearing(yaw, behind).delta(yaw).abs(),
            ARM_REAR_SWEEP_LIMIT_RAW,
        );
    }

    #[test]
    fn bearings_24575_24576_and_24577_pin_both_sides_of_the_limit() {
        let yaw = Angle::from_raw(51_000);
        for sign in [-1, 1] {
            for distance in [24_575, 24_576, 24_577] {
                let asked = Angle::from_raw(yaw.raw().wrapping_add((sign * distance) as u16));
                let held = rear_limited_bearing(yaw, asked);
                assert_eq!(
                    held.delta(yaw),
                    sign * distance.min(ARM_REAR_SWEEP_LIMIT_RAW),
                    "side {sign} at {distance} raw units",
                );
                assert_eq!(rear_limited_bearing(yaw, held), held,
                    "the rear projection was not idempotent on side {sign}");
            }
        }
    }

    #[test]
    fn left_and_right_rear_envelopes_are_exact_reflections() {
        let yaw = Angle::from_raw(65_000);
        for distance in [0, 1, 8_192, 24_575, 24_576, 24_577, 32_767] {
            let left = rear_limited_bearing(
                yaw, Angle::from_raw(yaw.raw().wrapping_add(distance as u16)));
            let right = rear_limited_bearing(
                yaw, Angle::from_raw(yaw.raw().wrapping_sub(distance as u16)));
            assert_eq!(left.delta(yaw), -right.delta(yaw), "distance {distance}");
        }
    }

    #[test]
    fn a_target_on_or_ahead_of_the_rear_boundary_is_unchanged() {
        let yaw = Angle::from_raw(12_345);
        for relative in [-24_576, -16_384, -1, 0, 1, 16_384, 24_576] {
            let asked = Angle::from_raw(yaw.raw().wrapping_add(relative as u16));
            assert_eq!(rear_limited_bearing(yaw, asked), asked,
                "an in-envelope bearing {relative} raw units from the torso moved");
        }
    }

    #[test]
    fn an_arm_polyline_starts_at_the_shoulder_and_ends_at_the_hand() {
        for anatomy in anatomies() {
            for yaw_raw in [0u16, 1_000, 16_384, 40_000, 65_535] {
                let yaw = Angle::from_raw(yaw_raw);
                for limb in 0..2 {
                    for bearing_raw in [0u16, 8_192, 32_768, 55_000] {
                        let hand = hand_position(
                            &anatomy, yaw, limb, Angle::from_raw(bearing_raw),
                            CombatHeight::MID, Fx::from_ratio(3, 4),
                        );
                        let arm = arm_polyline(&anatomy, yaw, limb, hand, None);
                        assert_eq!(arm.shoulder(), shoulder(&anatomy, yaw, limb));
                        assert_eq!(arm.hand(), hand);
                    }
                }
            }
        }
    }

    /// The seam's whole claim, and the load-bearing test of this session: the
    /// arm rows `body_region_volumes` now builds from the polyline are bit
    /// identical to the expression it used to write by hand.
    ///
    /// The comparison is against `body_region_volumes`' *output*, not against
    /// `arm_polyline`'s inputs -- asserting that `arm.shoulder() == shoulder(..)`
    /// would restate `arm_polyline`'s body and pass whatever either did.
    /// Perturbing one raw unit of `shoulder_half_width` inside `arm_polyline`
    /// turns this red; the same perturbation leaves the tautological form green.
    #[test]
    fn an_arm_polyline_reproduces_the_region_volume_it_replaced() {
        use crate::combat::geometry::body_region_volumes;
        use crate::AnatomyRegion;

        for anatomy in anatomies() {
            for yaw_raw in [0u16, 7_777, 16_384, 49_152, 65_535] {
                let yaw = Angle::from_raw(yaw_raw);
                for bearing_raw in [0u16, 4_096, 21_845, 60_000] {
                    for height in [CombatHeight::LOW, CombatHeight::MID, CombatHeight::HIGH] {
                        for reach_num in [1, 2, 4] {
                            let reach = Fx::from_ratio(reach_num, 4);
                            let bearing = Angle::from_raw(bearing_raw);
                            let hands = [
                                hand_position(&anatomy, yaw, 0, bearing, height, reach),
                                hand_position(&anatomy, yaw, 1, bearing, height, reach),
                            ];
                            let origin = Vec3::new(Fx::from_int(3), Fx::from_int(-2), Fx::ZERO);
                            let volumes = body_region_volumes(
                                origin, &anatomy, yaw, hands, [true; AnatomyRegion::COUNT],
                            );
                            for (at, region) in anatomy.regions.iter().enumerate() {
                                let slot = match region.region {
                                    AnatomyRegion::LeftArm => 0,
                                    AnatomyRegion::RightArm => 1,
                                    _ => continue,
                                };
                                // The pre-split expression, written out here so
                                // this test does not depend on the code it checks.
                                let side = if slot == 0 {
                                    anatomy.shoulder_half_width
                                } else {
                                    -anatomy.shoulder_half_width
                                };
                                let expected_shoulder = origin + Vec3::new(
                                    -yaw.sin() * side,
                                    fx::mul_div(yaw.cos(), side, Fx::ONE),
                                    anatomy.shoulder_height,
                                );
                                assert_eq!(volumes[at].lower, expected_shoulder);
                                assert_eq!(volumes[at].upper, origin + hands[slot]);
                            }
                        }
                    }
                }
            }
        }
    }

    /// The elbow lies on **both** link circles, which is the whole of what a
    /// two-link solution has to mean. Swept over the reachable annulus rather
    /// than sampled, because the interesting failures are at its two ends -- and
    /// now across a sweep of commanded planes as well, because a rotation is
    /// exactly the operation that can take a correct answer off its circle.
    ///
    /// **The slack was re-measured and did not move**, which was not the
    /// expectation: the rotation adds an `Fx` product and a second per-axis
    /// `mul_div` between the circles and this measurement, and the obvious guess
    /// was that it would cost a raw unit or two. It costs none. Four is still the
    /// maximum across all six planes, and it is still exact from both sides --
    /// three fails and five would pass on an error that had grown. Widening it
    /// "because the rotation must cost something" would have been a range chosen
    /// to absorb the next regression rather than a measurement.
    #[test]
    fn the_elbow_lies_on_both_link_circles() {
        for anatomy in anatomies() {
            let elbow = Elbow::of(&anatomy);
            let (inner, outer) = elbow.reach_bounds();
            for yaw_raw in [0u16, 11_000, 32_768, 54_000] {
                let yaw = Angle::from_raw(yaw_raw);
                for limb in 0..2 {
                    let at = shoulder(&anatomy, yaw, limb);
                    for step in 0..=16 {
                        let d = inner + (outer - inner) * Fx::from_ratio(step, 16);
                        for bearing_raw in [0u16, 8_192, 32_768, 55_000] {
                            let bearing = Angle::from_raw(bearing_raw);
                            let hand = at + Vec3::new(
                                bearing.cos() * d, bearing.sin() * d, Fx::ZERO);
                            for plane_raw in [0u16, 5_000, 16_384, 32_768, 49_152, 60_000] {
                                let plane = Angle::from_raw(plane_raw);
                                let Some(joint) = elbow_point(at, hand, elbow, plane) else {
                                    panic!("no elbow at {d:?}, inside [{inner:?}, {outer:?}]")
                                };
                                // Four raw units, measured across this sweep --
                                // the same four the unrotated sweep measured. Two
                                // square roots, a plane product and a per-axis
                                // `mul_div` per term sit between the circles and
                                // this measurement, and the rotation adds nothing
                                // to what the square roots already cost.
                                let slack = Fx::from_raw(4);
                                let to_shoulder = (joint - at).length();
                                let to_hand = (joint - hand).length();
                                assert!((to_shoulder - elbow.upper).abs() <= slack,
                                        "elbow {to_shoulder:?} off the upper circle {:?} at plane {plane_raw}",
                                        elbow.upper);
                                assert!((to_hand - elbow.fore).abs() <= slack,
                                        "elbow {to_hand:?} off the forearm circle {:?} at plane {plane_raw}",
                                        elbow.fore);
                            }
                        }
                    }
                }
            }
        }
    }

    /// **`Angle::ZERO` reproduces the pre-plane answer bit for bit**, asserted
    /// against the expression that used to stand in `elbow_point` rather than
    /// against `elbow_point` itself -- a comparison of the function with itself
    /// would pass whatever the rotation did.
    ///
    /// This is the guard that keeps the plane a widening rather than a change:
    /// every pin taken over the shared primitives was recorded with the
    /// unrotated elbow, and `plane` arrives at zero everywhere nothing commands
    /// one.
    #[test]
    fn a_zero_plane_reproduces_the_default_elbow() {
        // The body of `elbow_point` as it stood before the plane, copied here so
        // this test does not depend on the code it checks.
        fn unrotated(shoulder: Vec3, hand: Vec3, elbow: Elbow) -> Option<Vec3> {
            let offset = hand - shoulder;
            let distance = offset.length();
            if !distance.is_positive() { return None; }
            let (upper, fore) = (elbow.upper, elbow.fore);
            if distance > upper + fore { return None; }
            let numerator = distance * distance + upper * upper - fore * fore;
            let along = numerator / (distance * Fx::TWO);
            let out_squared = upper * upper - along * along;
            if !out_squared.is_positive() {
                return Some(shoulder + scaled(offset, along, distance));
            }
            let out = out_squared.sqrt();
            let axis = scaled(offset, Fx::ONE, distance);
            let vertical = Vec3::new(Fx::ZERO, Fx::ZERO, -Fx::ONE);
            let dot = axis.z * -Fx::ONE;
            let mut side = vertical - Vec3::new(axis.x * dot, axis.y * dot, axis.z * dot);
            let side_length = side.length();
            if !side_length.is_positive() {
                side = Vec3::new(Fx::ONE, Fx::ZERO, Fx::ZERO);
                return Some(shoulder + scaled(offset, along, distance)
                            + scaled(side, out, Fx::ONE));
            }
            Some(shoulder + scaled(offset, along, distance) + scaled(side, out, side_length))
        }

        let mut vertical_arms = 0;
        for anatomy in anatomies() {
            let elbow = Elbow::of(&anatomy);
            let (inner, outer) = elbow.reach_bounds();
            let yaw = Angle::from_raw(11_000);
            for limb in 0..2 {
                let at = shoulder(&anatomy, yaw, limb);
                for step in 0..=16 {
                    let d = inner + (outer - inner) * Fx::from_ratio(step, 16);
                    // The vertical sweep is what reaches the degenerate branch,
                    // where the pre-plane code returned early: at `pitch` a
                    // quarter turn the axis is `+/-Z` and there is no "below".
                    for pitch_raw in [0u16, 8_192, 16_384, 32_768, 49_152] {
                        for bearing_raw in [0u16, 8_192, 32_768, 55_000] {
                            let (pitch, bearing) =
                                (Angle::from_raw(pitch_raw), Angle::from_raw(bearing_raw));
                            let flat = pitch.cos() * d;
                            let hand = at + Vec3::new(
                                bearing.cos() * flat, bearing.sin() * flat, pitch.sin() * d);
                            if (hand - at).length() > outer { continue; }
                            let expected = unrotated(at, hand, elbow);
                            assert_eq!(elbow_point(at, hand, elbow, Angle::ZERO), expected,
                                       "a zero plane moved the elbow at pitch {pitch_raw}, \
                                        bearing {bearing_raw}, distance {d:?}");
                            if pitch_raw == 16_384 || pitch_raw == 49_152 {
                                vertical_arms += 1;
                            }
                        }
                    }
                }
            }
        }
        // The degenerate branch is *reached*, so the claim above covers it. A
        // sweep that never produced a vertical arm would assert nothing about
        // the one case the pre-plane code spelled out separately.
        assert!(vertical_arms > 0, "the sweep never produced a vertical arm");
    }

    /// A commanded plane actually moves the elbow, and different planes move it
    /// to different places.
    ///
    /// The other half of `a_zero_plane_reproduces_the_default_elbow`: that test
    /// alone is satisfied completely by a `plane` parameter the body ignores.
    #[test]
    fn a_commanded_plane_swings_the_elbow_about_the_arm() {
        let anatomy = fighter_anatomy();
        let elbow = Elbow::of(&anatomy);
        let (inner, outer) = elbow.reach_bounds();
        let yaw = Angle::ZERO;
        let at = shoulder(&anatomy, yaw, 1);
        let hand = at + Vec3::new((inner + outer) * Fx::HALF, Fx::ZERO, Fx::ZERO);

        let down = elbow_point(at, hand, elbow, Angle::ZERO).expect("a reachable hand");
        let up = elbow_point(at, hand, elbow, Angle::HALF).expect("a reachable hand");
        let side = elbow_point(at, hand, elbow, Angle::QUARTER).expect("a reachable hand");
        assert!(down.z < hand.z, "the zero plane stopped hanging below the line");
        assert!(up.z > hand.z, "half a turn did not put the elbow above the line");
        assert_ne!(side, down);
        assert_ne!(side, up);
        // A quarter turn takes the elbow out of the vertical plane entirely,
        // which is the thing a sign error inside the rotation would not do.
        assert!((side.z - hand.z).abs() < (down.z - hand.z).abs(),
                "a quarter turn left the elbow as far below the line as the default");
        assert!((side.y - hand.y).abs() > (down.y - hand.y).abs(),
                "a quarter turn moved nothing sideways");
    }

    /// An elbow never folds past its stop, which is what makes the inner bound a
    /// fold rather than a hinge.
    #[test]
    fn an_elbow_never_folds_past_its_stop() {
        for anatomy in anatomies() {
            let elbow = Elbow::of(&anatomy);
            let (inner, outer) = elbow.reach_bounds();
            assert!(inner > Fx::ZERO, "the arm can fold flat onto its own shoulder");
            assert!(inner < outer, "the annulus is empty");
            // The stop is what produces the inner bound, so widening the stop
            // must widen it. Bounded from both sides by the decision.
            assert!(inner < outer * Fx::HALF, "an elbow that cannot bring a guard in close");
        }
    }

    #[test]
    fn an_elbow_stop_is_a_fold_and_not_a_hinge() {
        let full_turn = 65_536u32;
        let stop = u32::from(ELBOW_MIN_INCLUDED_ANGLE_RAW);
        assert!(stop > full_turn / 36, "a stop under ten degrees folds the arm flat");
        assert!(stop < full_turn / 4, "a stop at a right angle cannot hold a close guard");
    }

    /// A jointed polyline is still an arm: it starts at the shoulder, ends at
    /// the hand, and its two segments meet.
    #[test]
    fn a_jointed_arm_runs_shoulder_elbow_hand() {
        for anatomy in anatomies() {
            let elbow = Elbow::of(&anatomy);
            let (inner, outer) = elbow.reach_bounds();
            let yaw = Angle::from_raw(21_000);
            for limb in 0..2 {
                let at = shoulder(&anatomy, yaw, limb);
                let hand = at + Vec3::new((inner + outer) * Fx::HALF, Fx::ZERO, Fx::ZERO);
                let solved = elbow_point(at, hand, elbow, Angle::ZERO);
                let arm = arm_polyline(&anatomy, yaw, limb, hand, solved);
                assert_eq!(arm.shoulder(), at);
                assert_eq!(arm.hand(), hand);
                let joint = solved.expect("a reachable hand has an elbow");
                assert_eq!(arm.elbow(), Some(joint));
                let segments: Vec<_> = arm.segments().collect();
                assert_eq!(segments.len(), 2, "a jointed arm is two segments");
                assert_eq!(segments[0], (at, joint));
                assert_eq!(segments[1], (joint, hand));
            }
        }
    }

    /// An unreachable hand has no elbow, and the polyline falls back to one
    /// segment rather than dropping the arm. A collider builder needs a
    /// connected arm more than it needs a joint.
    #[test]
    fn an_unreachable_hand_leaves_the_arm_one_segment() {
        let anatomy = fighter_anatomy();
        let elbow = Elbow::of(&anatomy);
        let yaw = Angle::ZERO;
        let at = shoulder(&anatomy, yaw, 1);
        let far = at + Vec3::new(anatomy.arm_length * Fx::from_int(3), Fx::ZERO, Fx::ZERO);
        assert_eq!(elbow_point(at, far, elbow, Angle::ZERO), None);
        let arm = arm_polyline(&anatomy, yaw, 1, far, elbow_point(at, far, elbow, Angle::ZERO));
        assert_eq!(arm.elbow(), None);
        assert_eq!(arm.segments().count(), 1);
        assert_eq!((arm.shoulder(), arm.hand()), (at, far));
    }

    /// The single-link polyline is unchanged, which is the guard: an arm handed
    /// no elbow is still one capsule from shoulder to hand.
    ///
    /// **Renamed off the model that used to be its subject.** It read
    /// `an_articulated_arm_is_still_one_capsule_from_shoulder_to_hand` while
    /// there was a model whose arms had no joint; the `None` it passes is now
    /// the *other* caller's, and that caller has not gone anywhere.
    /// `body_region_volumes` gives no elbow at all -- it is what an observation's
    /// targeting view is built through -- and `elbow_point` answers `None` for
    /// any hand outside the two links' annulus, which is a state a jointed body
    /// reaches every time it over-reaches.
    ///
    /// It is not `an_unreachable_hand_leaves_the_arm_one_segment` twice over:
    /// that one derives its `None` from a hand it put out of range, so it
    /// measures `elbow_point`'s refusal as much as the polyline's fallback.
    /// This one hands `None` straight in at a hand the arm *can* reach, over
    /// both anatomies and both limbs, so the fallback is the only thing under
    /// test.
    #[test]
    fn an_arm_with_no_elbow_is_still_one_capsule_from_shoulder_to_hand() {
        for anatomy in anatomies() {
            let yaw = Angle::from_raw(30_000);
            for limb in 0..2 {
                let hand = hand_position(
                    &anatomy, yaw, limb, Angle::ZERO, CombatHeight::MID, Fx::HALF);
                let arm = arm_polyline(&anatomy, yaw, limb, hand, None);
                assert_eq!(arm.elbow(), None);
                assert_eq!(arm.segments().count(), 1);
            }
        }
    }

    /// Headroom is zero exactly where the annulus clamp bites, and positive
    /// everywhere it does not.
    ///
    /// **"Bites" is asked geometrically rather than restated.** The pose goes
    /// through `hand_position` at the height `reachable_extent` will actually
    /// hold, and the question is whether that hand is further from the shoulder
    /// than the two links can span -- a three-dimensional length against
    /// `outer`. `reach_headroom` answers the same question as
    /// `sqrt(outer^2 - dz^2)` against a horizontal, which is the same claim
    /// through different arithmetic: the two can disagree by a truncation and
    /// cannot disagree by a transposition or a missing clamp.
    ///
    /// The second claim is the trap: **the headroom is what is left before
    /// `reachable_extent`'s own bound**, so asking that function where the bound
    /// is -- by clamping a reach of one at the same height -- and subtracting
    /// the reach asked for has to give the same number back. `reachable_extent`
    /// measures its bound from the height it will actually hold, so a headroom
    /// measured from the height that was *asked* for disagrees with it by six
    /// raw units at height 6/16 on the Fighter, which is what this caught.
    ///
    /// **Idempotence under the height clamp was the first spelling and it is the
    /// wrong test**, recorded here because it looks stronger than it is:
    /// `reachable_extent` is not idempotent on the height. Its realised height
    /// truncates a raw unit below the vertical budget it was clamped into, so a
    /// second pass re-clamps it upward, and near the bottom of the range
    /// `d(widest)/d(dz)` is about four -- so two raw units of height become
    /// twenty of headroom. That is a property of the clamp and not of this
    /// function, and a test asserting it would have been asserting the wrong
    /// thing about the right code.
    ///
    /// Swept over the whole commanded range rather than sampled at the corners,
    /// because both ends are interesting: a fully lowered arm spends its whole
    /// length on the vertical and has no horizontal budget at all, and a fully
    /// extended one is on the outer bound at every height.
    #[test]
    fn reach_headroom_falls_to_zero_exactly_where_the_annulus_clamp_bites() {
        let mut spent = 0;
        let mut clear = 0;
        let mut moved = 0;
        let mut vertically_clamped = 0;
        for anatomy in anatomies() {
            let elbow = Elbow::of(&anatomy);
            let (_, outer) = elbow.reach_bounds();
            let yaw = Angle::from_raw(11_000);
            let bearing = Angle::from_raw(21_000);
            for limb in 0..2 {
                let at = shoulder(&anatomy, yaw, limb);
                for height_step in 0..=16 {
                    let height = CombatHeight::try_from_raw(Fx::from_ratio(height_step, 16).raw())
                        .expect("a height inside the unit interval");
                    for reach_step in 0..=16 {
                        let reach = Fx::from_ratio(reach_step, 16);
                        let (held_height, _) =
                            reachable_extent(&anatomy, height, reach, elbow);
                        if held_height != height { vertically_clamped += 1; }
                        let hand =
                            hand_position(&anatomy, yaw, limb, bearing, held_height, reach);
                        let headroom = reach_headroom(&anatomy, height, reach, elbow);
                        let named = format!(
                            "{:?}-arm {limb} at height {height_step}/16 reach {reach_step}/16",
                            anatomy.standing_height);
                        let span = (hand - at).length();
                        if span > outer { moved += 1; }
                        // One raw unit of slack on the bound, **measured rather
                        // than chosen**. Across this sweep exactly 61 of 1,156
                        // poses come within 24 raw units of `outer` -- sixty a
                        // unit outside it and one a unit inside -- and every one
                        // of them has zero headroom, while no pose with headroom
                        // left comes anywhere near. A three-dimensional
                        // `length()` and a `sqrt(outer^2 - dz^2)` are two
                        // truncating routes to the same boundary and one unit is
                        // the whole of their disagreement. Zero fails, on the
                        // Brute at height zero.
                        if span + Fx::from_raw(1) >= outer {
                            assert!(headroom.is_zero(),
                                    "{named}: the arm is out of annulus and headroom is {headroom:?}");
                            spent += 1;
                        } else {
                            assert!(headroom.is_positive(),
                                    "{named}: the arm is inside its annulus and headroom is zero");
                            // And the slack is bounded from above by the same
                            // measurement: a pose with headroom left is never
                            // within sixteen raw units of the bound, so a slack
                            // that had to grow would have to fail one of these
                            // rather than quietly absorb it.
                            assert!(span + Fx::from_raw(16) < outer,
                                    "{named}: headroom is positive {} raw units from the bound",
                                    outer.raw() - span.raw());
                            clear += 1;
                        }
                        // Where the bound is, asked of the function that owns
                        // it: a reach of one at this height comes back clamped
                        // to the widest the arm can hold.
                        let (_, widest) = reachable_extent(&anatomy, height, Fx::ONE, elbow);
                        let asked = reach.max(Fx::from_raw(ARM_MIN_REACH_RAW));
                        let left = (widest - asked).max(Fx::ZERO);
                        // Two raw units, measured across this sweep and exact
                        // from both sides: one fails, three would pass on an
                        // error that had grown. Two truncating divisions by
                        // `arm_length` separate the two answers and nothing
                        // else does.
                        assert!((headroom - left).abs() <= Fx::from_raw(2),
                                "{named}: headroom {headroom:?} against {left:?} left \
                                 before the clamp -- it read the height it was asked for");
                    }
                }
            }
        }
        // Both sides of the claim are reached, the clamp genuinely bites on some
        // of them, and so does the height clamp the second assertion is about. A
        // sweep that produced only one of the four would assert far less than it
        // reads as asserting.
        assert!(spent > 0 && clear > 0,
                "the sweep found {spent} spent and {clear} clear poses");
        assert!(moved > 0,
                "the sweep never asked for a pose the clamp actually shortens");
        assert!(vertically_clamped > 0,
                "the sweep never reached a height the vertical budget refuses");
    }

    /// The hole, still open in the raw forward map -- which is the guard rather
    /// than the complaint. `hand_position` is shared by both models and must stay
    /// exactly as it is; what closed the hole for an embodied body is the target
    /// clamp in front of it, not a change here.
    #[test]
    fn a_raised_arm_at_full_reach_is_longer_than_the_arm() {
        let anatomy = fighter_anatomy();
        let yaw = Angle::ZERO;
        let hand = hand_position(&anatomy, yaw, 1, Angle::ZERO, CombatHeight::HIGH, Fx::ONE);
        let offset = hand - shoulder(&anatomy, yaw, 1);
        assert!(offset.length() > anatomy.arm_length,
                "`hand_position` started clamping; the embodied clamp belongs in front of it");
    }
}
