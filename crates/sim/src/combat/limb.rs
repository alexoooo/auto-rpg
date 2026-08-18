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
//! **It is closed for `CombatModel::Embodied` and deliberately open for
//! everyone else.** [`reachable_extent`] clamps a commanded `(height, reach)`
//! onto the annulus the two links can actually span, and the embodied arm driver
//! applies it before integration. The articulated arithmetic is untouched,
//! because closing it there would move every articulated corpus and the
//! comparison those corpora exist for -- and
//! `an_articulated_arm_target_is_still_unclamped` asserts that it stayed open.

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

/// The nearest hand the arm can actually hold, along the shoulder-to-hand line.
///
/// **This is the fix for the hole this module's header records.** A hand outside
/// the annulus is pulled onto it rather than refused, so a policy that asks for
/// an impossible pose gets the nearest possible one instead of a pose the arm
/// silently stretches to. Pulling along the existing direction is what keeps the
/// answer a *clamp*: the bearing the caller asked for survives, only the
/// extension changes.
pub(crate) fn reachable_hand(
    anatomy: &BodyAnatomySpec, yaw: Angle, limb: usize, hand: Vec3, elbow: Elbow,
) -> Vec3 {
    let shoulder = shoulder(anatomy, yaw, limb);
    let offset = hand - shoulder;
    let distance = offset.length();
    let (inner, outer) = elbow.reach_bounds();
    if distance >= inner && distance <= outer { return hand; }
    if distance == Fx::ZERO {
        // Exactly on the shoulder, where the offset carries no direction at all.
        // Ahead is the only answer that invents nothing: every other choice
        // would be picking a bearing the caller did not ask for.
        return shoulder + Vec3::new(inner, Fx::ZERO, Fx::ZERO);
    }
    let want = distance.clamp(inner, outer);
    // Scaled component-wise through `mul_div` rather than by a precomputed
    // ratio: one truncation per axis instead of one on the ratio and one on the
    // product, which is the difference between a hand on the annulus and a hand
    // a raw unit outside it.
    shoulder + Vec3::new(
        mul_div(offset.x, want, distance),
        mul_div(offset.y, want, distance),
        mul_div(offset.z, want, distance),
    )
}

/// The arm as a polyline, shoulder first, hand last.
///
/// One segment today. It exists as a type rather than a tuple so that the
/// session which adds an elbow adds a point here and every consumer follows
/// without an edit of its own.
pub(crate) struct ArmPolyline {
    points: [Vec3; 3],
    len: usize,
}

impl ArmPolyline {
    /// The shoulder end.
    pub(crate) fn shoulder(&self) -> Vec3 {
        self.points[0]
    }

    /// The hand end.
    pub(crate) fn hand(&self) -> Vec3 {
        self.points[self.len - 1]
    }

    /// The elbow, for an arm that has one.
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
/// **The plane is not commanded yet, and the default is a choice worth naming.**
/// A human elbow at rest hangs below the line from shoulder to hand, so the
/// off-axis direction is the downward one made perpendicular to the axis. When
/// the axis is itself vertical there is no "below" to project, and the fallback
/// is forward -- the only direction that invents nothing the bearing did not
/// already say. A commanded swing plane replaces this with a rotation about the
/// axis and is the one field the embodied payload still owes.
///
/// Answers `None` when the hand is outside the annulus, because there is no
/// elbow that reaches it. Callers hold a hand [`reachable_extent`] has already
/// clamped, so `None` is a bug rather than a case -- but returning it beats
/// inventing a joint that does not close.
pub(crate) fn elbow_point(shoulder: Vec3, hand: Vec3, elbow: Elbow) -> Option<Vec3> {
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
    let side_length = side.length();
    if !side_length.is_positive() {
        // The arm is straight up or straight down; "below the line" names
        // nothing. Forward, for the reason the header gives.
        side = Vec3::new(Fx::ONE, Fx::ZERO, Fx::ZERO);
        return Some(shoulder + scaled(offset, along, distance) + scaled(side, out, Fx::ONE));
    }
    Some(shoulder + scaled(offset, along, distance) + scaled(side, out, side_length))
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

/// The arm from `shoulder` to `hand`, in the body frame.
///
/// Takes the hand rather than deriving it, because its callers already hold the
/// authoritative hand: the actuator integrates towards a target and contact
/// moves the result, so a polyline that recomputed the hand from a command
/// would draw an arm the solver is not using.
pub(crate) fn arm_polyline(
    anatomy: &BodyAnatomySpec, yaw: Angle, limb: usize, hand: Vec3,
) -> ArmPolyline {
    let at = shoulder(anatomy, yaw, limb);
    ArmPolyline { points: [at, hand, Vec3::ZERO], len: 2 }
}

/// The same arm with its elbow in it.
///
/// A second constructor rather than an `Option` parameter on the first, because
/// the two answer different questions -- "where does this body's arm run" versus
/// "where does a *jointed* arm run" -- and a caller that has no elbow to give
/// should not have to say so.
pub(crate) fn jointed_arm_polyline(
    anatomy: &BodyAnatomySpec, yaw: Angle, limb: usize, hand: Vec3, elbow: Elbow,
) -> ArmPolyline {
    let at = shoulder(anatomy, yaw, limb);
    match elbow_point(at, hand, elbow) {
        Some(joint) => ArmPolyline { points: [at, joint, hand], len: 3 },
        // A hand the annulus cannot reach has no elbow. Falling back to the
        // single segment keeps the arm a connected thing rather than dropping
        // it, which is what a collider builder needs more than it needs a joint.
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
                        let arm = arm_polyline(&anatomy, yaw, limb, hand);
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
    /// than sampled, because the interesting failures are at its two ends.
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
                            let Some(joint) = elbow_point(at, hand, elbow) else {
                                panic!("no elbow at {d:?}, inside [{inner:?}, {outer:?}]")
                            };
                            // Four raw units, which is the same order of slack the
                            // annulus clamp measured and for the same reason: two
                            // square roots and a per-axis `mul_div` sit between
                            // the circles and this measurement.
                            let slack = Fx::from_raw(4);
                            let to_shoulder = (joint - at).length();
                            let to_hand = (joint - hand).length();
                            assert!((to_shoulder - elbow.upper).abs() <= slack,
                                    "elbow {to_shoulder:?} off the upper circle {:?}", elbow.upper);
                            assert!((to_hand - elbow.fore).abs() <= slack,
                                    "elbow {to_hand:?} off the forearm circle {:?}", elbow.fore);
                        }
                    }
                }
            }
        }
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
    fn a_jointed_arm_polyline_runs_shoulder_elbow_hand() {
        for anatomy in anatomies() {
            let elbow = Elbow::of(&anatomy);
            let (inner, outer) = elbow.reach_bounds();
            let yaw = Angle::from_raw(21_000);
            for limb in 0..2 {
                let at = shoulder(&anatomy, yaw, limb);
                let hand = at + Vec3::new((inner + outer) * Fx::HALF, Fx::ZERO, Fx::ZERO);
                let arm = jointed_arm_polyline(&anatomy, yaw, limb, hand, elbow);
                assert_eq!(arm.shoulder(), at);
                assert_eq!(arm.hand(), hand);
                let joint = arm.elbow().expect("a reachable hand has an elbow");
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
        assert_eq!(elbow_point(at, far, elbow), None);
        let arm = jointed_arm_polyline(&anatomy, yaw, 1, far, elbow);
        assert_eq!(arm.elbow(), None);
        assert_eq!(arm.segments().count(), 1);
        assert_eq!((arm.shoulder(), arm.hand()), (at, far));
    }

    /// The single-link polyline is unchanged, which is the guard: an articulated
    /// arm is still one capsule from shoulder to hand.
    #[test]
    fn an_articulated_arm_is_still_one_capsule_from_shoulder_to_hand() {
        for anatomy in anatomies() {
            let yaw = Angle::from_raw(30_000);
            for limb in 0..2 {
                let hand = hand_position(
                    &anatomy, yaw, limb, Angle::ZERO, CombatHeight::MID, Fx::HALF);
                let arm = arm_polyline(&anatomy, yaw, limb, hand);
                assert_eq!(arm.elbow(), None);
                assert_eq!(arm.segments().count(), 1);
            }
        }
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
