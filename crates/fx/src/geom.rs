//! Exact segment geometry.
//!
//! Three predicates, and everything the sim's swing resolution is built on:
//! where a blade comes closest to a body, whether it reached inside, and where
//! two blades cross.
//!
//! The governing rule here is that **the intermediate products do not fit in
//! [`Fx`]**. A dot product of two arena-scale vectors overflows a 16.16
//! intermediate long before the answer does, and [`Fx`]'s saturation is silent
//! by design -- `Vec2::length_sq` already documents that it saturates past ~181
//! units. Every product below therefore runs in raw `i64` space, where an
//! `i32 * i32` is exact by construction, and only the final ratio comes back
//! into [`Fx`]. That is also why these live here rather than as `Vec2` methods:
//! `Vec2::dot` is the convenient form and this is the correct one, and the two
//! should not be one function that is sometimes wrong.

use crate::fixed::{Fx, FRAC_BITS};
use crate::vec2::Vec2;

/// Where a segment came closest to a query point.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct SegmentHit {
    /// Position along the segment, clamped to `0..=1`. `0` is the base and `1`
    /// the tip, which for a blade is the difference between a hilt scuff and a
    /// full-speed tip strike.
    pub t: Fx,
    /// The closest point itself, in world space.
    pub point: Vec2,
    /// Distance from the query point to [`SegmentHit::point`].
    pub distance: Fx,
}

/// Exact `a . b` in raw space. Each product of two `i32`s is under `2^62`, and
/// the sum of two is saturated rather than allowed to reach `2^63`, so this is
/// total for *any* pair of vectors and not merely for arena-scale ones.
#[inline]
fn dot_raw(a: Vec2, b: Vec2) -> i64 {
    (a.x.raw() as i64 * b.x.raw() as i64).saturating_add(a.y.raw() as i64 * b.y.raw() as i64)
}

/// Exact 2D cross product in raw space, saturating for the same reason as
/// [`dot_raw`]. For real inputs the components are arena differences (raw under
/// `2^22`), so the products stay under `2^44` and there are eighteen bits of
/// margin; the saturation is insurance against a caller with a wilder vector.
#[inline]
fn cross_raw(a: Vec2, b: Vec2) -> i64 {
    (a.x.raw() as i64 * b.y.raw() as i64).saturating_sub(a.y.raw() as i64 * b.x.raw() as i64)
}

/// `0 <= num/den <= 1`, decided without dividing.
///
/// No division means no rounding, so a point exactly on an endpoint answers the
/// same way every time instead of landing one raw unit outside a clamped ratio.
#[inline]
fn in_unit(num: i64, den: i64) -> bool {
    if den > 0 {
        num >= 0 && num <= den
    } else {
        num <= 0 && num >= den
    }
}

/// `num / den` as an [`Fx`], staged so the numerator's shift cannot overflow.
///
/// `(num << 16) / den` needs `|num| < 2^47`. When either term is larger, both
/// are shifted down by the same power of four -- which leaves the ratio alone --
/// until it is not. In this codebase the loop is unreachable: it engages only
/// past a segment about 128 world units long, and the arena is 40x28 with a
/// longest blade of 1.45. It is here so the function is total for any caller
/// rather than only for the two that exist. Arithmetic right shift is exactly
/// specified on every target, so the guarded path is as deterministic as the
/// fast one.
fn ratio_fx(num: i64, den: i64) -> Fx {
    let (mut n, mut e) = (num, den);
    while n.unsigned_abs().max(e.unsigned_abs()) >= 1u64 << 46 {
        n >>= 2;
        e >>= 2;
    }
    if e == 0 {
        return Fx::ZERO;
    }
    let scaled = (n << FRAC_BITS) / e;
    Fx::from_raw(if scaled > i32::MAX as i64 {
        i32::MAX
    } else if scaled < i32::MIN as i64 {
        i32::MIN
    } else {
        scaled as i32
    })
}

/// The point on segment `a..b` closest to `p`.
///
/// A degenerate (zero-length) segment answers with its own start, which is the
/// right answer and not a special case to guard at every call site -- a hand
/// tucked to zero reach is exactly that segment.
pub fn closest_point_on_segment(a: Vec2, b: Vec2, p: Vec2) -> SegmentHit {
    let d = b - a;
    let w = p - a;
    let dd = dot_raw(d, d);
    let wd = dot_raw(w, d);

    let t = if dd <= 0 || wd <= 0 {
        // Degenerate, or the foot of the perpendicular is before `a`.
        Fx::ZERO
    } else if wd >= dd {
        Fx::ONE
    } else {
        // `0 < wd < dd`, so the ratio is genuinely inside `(0, 1)` and the
        // clamping above has already absorbed both ends exactly.
        ratio_fx(wd, dd)
    };

    let point = a + d * t;
    SegmentHit {
        t,
        point,
        distance: (p - point).length(),
    }
}

/// Where segment `a..b` comes closest to the circle at `c`, if it reaches
/// inside at all.
///
/// This is a **closest-approach** test, not a swept one, and that is a
/// deliberate trade with an invariant attached: it is correct only while a
/// segment never moves further in one step than the circle is wide. The sim
/// enforces exactly that bound on blade tips (see `rules::agility_multiplier`),
/// which is what buys the right to skip a quadratic solve on every pair.
pub fn segment_circle(a: Vec2, b: Vec2, c: Vec2, r: Fx) -> Option<SegmentHit> {
    let hit = closest_point_on_segment(a, b, c);
    if hit.distance <= r {
        Some(hit)
    } else {
        None
    }
}

/// Most sub-steps [`swept_segment_circle`] will ever take.
///
/// A backstop and not a tuning knob. At the speeds the sim produces the count
/// derived below is one or two; reaching eight means a blade and a body are
/// closing at eight body-radii per tick, which nothing in the roster can do.
/// Capping rather than growing keeps the cost of the hot loop bounded and keeps
/// the function total -- an uncapped count derived from a saturated length
/// would be a thirty-two-thousand-iteration loop inside per-pair collision
/// resolution.
pub const SWEEP_SUBSTEPS_MAX: u32 = 8;

/// [`segment_circle`], but over a whole tick of motion rather than at one
/// instant.
///
/// The closest-approach test is correct only while nothing crosses a whole body
/// between two samples, and that invariant is expensive: it is what pins
/// `rules::agility_multiplier` to a ceiling of `2.00`, and it holds today with
/// about a tenth of a body-radius to spare *while ignoring body motion
/// entirely*. Once a blow can knock a body faster than it walks, the margin is
/// gone and blades start passing through people.
///
/// Rather than solve the quadratic -- correct, and the kind of fixed-point
/// derivation that fails once a year as an unreproducible desync -- this walks
/// the pair through `n` sub-steps and runs the existing exact predicate at each.
/// `n` comes from **relative** travel measured in radii of the body being
/// tested, so it adapts to the closing speed and is a pure integer function of
/// the inputs: exactly as deterministic as the single test it replaces, and
/// auditable by reading it.
///
/// The endpoints are used verbatim at `k == n` rather than interpolated, so a
/// pair that needs only one sub-step gives bit-identical results to a plain
/// [`segment_circle`] on the end state. That equivalence is what let this land
/// without moving a single hash.
///
/// Reports the **first** sub-step that connects, which is the earliest contact
/// and therefore the one that should bill the blow.
#[allow(clippy::too_many_arguments)]
pub fn swept_segment_circle(
    base0: Vec2,
    tip0: Vec2,
    base1: Vec2,
    tip1: Vec2,
    centre0: Vec2,
    centre1: Vec2,
    radius: Fx,
) -> Option<SegmentHit> {
    let drift = centre1 - centre0;
    // What the blade did *in the body's frame*. A blade and a body moving
    // together at any speed have not closed at all and need no sub-steps.
    let travel = ((base1 - base0) - drift)
        .length()
        .max(((tip1 - tip0) - drift).length());

    let steps = if radius.raw() <= 0 {
        1
    } else {
        // Ceiling of `travel / radius`: one sub-step per body-radius covered,
        // so no sub-step can step over the body it is testing against.
        let ratio = travel / radius;
        let ceiling = (ratio.raw() as i64 + (crate::fixed::ONE_RAW as i64 - 1)) >> FRAC_BITS;
        ceiling.clamp(1, SWEEP_SUBSTEPS_MAX as i64) as u32
    };

    for k in 1..=steps {
        let (a, b, c) = if k == steps {
            (base1, tip1, centre1)
        } else {
            let t = Fx::from_ratio(k as i32, steps as i32);
            (
                Vec2::lerp(base0, base1, t),
                Vec2::lerp(tip0, tip1, t),
                Vec2::lerp(centre0, centre1, t),
            )
        };
        if let Some(hit) = segment_circle(a, b, c, radius) {
            return Some(hit);
        }
    }
    None
}

/// Where `p..pe` crosses `q..qe`, if it does.
///
/// Parallel and collinear pairs answer `None` on purpose. Two blades sliding
/// along each other are not a parry, and a collinear overlap has no single
/// crossing point to report -- treating it as one produces a parry every tick
/// for as long as the two stay lined up, which reads as a stuck fight.
///
/// Both containment tests run *before* any division, so a near-parallel pair is
/// rejected outright rather than producing a wild parameter that then clamps
/// into a plausible-looking wrong answer.
pub fn segment_segment(p: Vec2, pe: Vec2, q: Vec2, qe: Vec2) -> Option<Vec2> {
    let r = pe - p;
    let s = qe - q;
    let qp = q - p;

    let rxs = cross_raw(r, s);
    if rxs == 0 {
        return None;
    }

    let t_num = cross_raw(qp, s);
    let u_num = cross_raw(qp, r);
    if !in_unit(t_num, rxs) || !in_unit(u_num, rxs) {
        return None;
    }

    Some(p + r * ratio_fx(t_num, rxs))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn v(x: i32, y: i32) -> Vec2 {
        Vec2::from_ints(x, y)
    }

    fn close(a: Vec2, b: Vec2) -> bool {
        (a - b).length() < Fx::from_ratio(1, 1000)
    }

    #[test]
    fn the_closest_point_clamps_to_the_endpoints() {
        let (a, b) = (v(0, 0), v(10, 0));

        // Foot of the perpendicular lands inside the segment.
        let mid = closest_point_on_segment(a, b, v(4, 3));
        assert!(close(mid.point, v(4, 0)), "{:?}", mid.point);
        assert_eq!(mid.distance, Fx::from_int(3));
        assert!((mid.t - Fx::from_ratio(4, 10)).abs() < Fx::from_ratio(1, 1000));

        // Before the start and past the end both clamp, and `t` says so.
        let before = closest_point_on_segment(a, b, v(-5, 0));
        assert_eq!(before.t, Fx::ZERO);
        assert_eq!(before.point, a);
        assert_eq!(before.distance, Fx::from_int(5));

        let after = closest_point_on_segment(a, b, v(20, 0));
        assert_eq!(after.t, Fx::ONE);
        assert_eq!(after.point, b);
        assert_eq!(after.distance, Fx::from_int(10));
    }

    #[test]
    fn a_degenerate_segment_answers_with_its_own_point() {
        // A hand tucked to zero reach. Must not divide by zero, must not panic.
        let hit = closest_point_on_segment(v(3, 3), v(3, 3), v(3, 7));
        assert_eq!(hit.t, Fx::ZERO);
        assert_eq!(hit.point, v(3, 3));
        assert_eq!(hit.distance, Fx::from_int(4));
    }

    #[test]
    fn segment_circle_reports_only_what_it_reaches() {
        let (a, b) = (v(0, 0), v(10, 0));
        assert!(segment_circle(a, b, v(5, 2), Fx::from_int(3)).is_some());
        assert!(segment_circle(a, b, v(5, 2), Fx::ONE).is_none());

        // Exactly tangent counts as a hit: the boundary belongs to the circle,
        // so a blade grazing a body is a blow rather than a coin flip.
        let tangent = segment_circle(a, b, v(5, 2), Fx::from_int(2));
        assert!(tangent.is_some());
        assert!(close(tangent.unwrap().point, v(5, 0)));

        // Past the end of the segment the *endpoint* distance is what counts,
        // not the infinite line's.
        assert!(segment_circle(a, b, v(14, 0), Fx::from_int(3)).is_none());
        assert!(segment_circle(a, b, v(12, 0), Fx::from_int(3)).is_some());
    }

    /// The whole reason the swept form exists.
    #[test]
    fn a_blade_that_crosses_a_body_in_one_tick_still_lands() {
        let centre = v(5, 0);
        let r = Fx::from_ratio(5, 10);

        // A vertical blade that starts two units short of the body and ends two
        // units past it. Nothing was ever *at* the body on either sample.
        let (base0, tip0) = (v(3, -2), v(3, 2));
        let (base1, tip1) = (v(7, -2), v(7, 2));

        assert!(
            segment_circle(base1, tip1, centre, r).is_none(),
            "the un-swept test should miss this -- that is the bug"
        );
        let hit = swept_segment_circle(base0, tip0, base1, tip1, centre, centre, r);
        assert!(hit.is_some(), "the swept test missed a body it passed through");
        assert!(hit.unwrap().distance <= r);
    }

    /// The equivalence that let this land without moving a hash.
    #[test]
    fn a_single_substep_is_exactly_the_old_answer() {
        let centre = v(5, 2);
        let r = Fx::from_int(3);
        // Travel well under one radius, so the derived count is 1.
        let (base0, tip0) = (v(0, 0), v(10, 0));
        let base1 = base0 + Vec2::new(Fx::from_ratio(1, 100), Fx::ZERO);
        let tip1 = tip0 + Vec2::new(Fx::from_ratio(1, 100), Fx::ZERO);

        let swept = swept_segment_circle(base0, tip0, base1, tip1, centre, centre, r).unwrap();
        let plain = segment_circle(base1, tip1, centre, r).unwrap();
        assert_eq!(swept, plain);
    }

    #[test]
    fn a_body_carried_along_with_the_blade_never_closes() {
        // Both cross half the arena together. In the body's frame nothing moved,
        // so this must cost one sub-step and report exactly the end state.
        let shift = Vec2::from_ints(12, 5);
        let r = Fx::ONE;
        let (base0, tip0) = (v(0, 0), v(4, 0));
        let centre0 = v(2, 3);

        let swept = swept_segment_circle(
            base0,
            tip0,
            base0 + shift,
            tip0 + shift,
            centre0,
            centre0 + shift,
            r,
        );
        assert!(swept.is_none(), "a body three units off the blade was hit");

        // And the same pair with the body within reach does report, once.
        let near = v(2, 1);
        let hit = swept_segment_circle(base0, tip0, base0 + shift, tip0 + shift, near, near + shift, r);
        assert_eq!(hit, segment_circle(base0 + shift, tip0 + shift, near + shift, r));
    }

    #[test]
    fn a_sweep_reports_the_first_contact_and_not_the_last() {
        // A blade that passes clean through and ends on the far side. The hit
        // that bills damage should be the entry, so the blow is credited where
        // the blade actually met the body.
        let centre = v(5, 0);
        let r = Fx::from_int(1);
        let (base0, tip0) = (v(2, -3), v(2, 3));
        let (base1, tip1) = (v(8, -3), v(8, 3));

        let hit = swept_segment_circle(base0, tip0, base1, tip1, centre, centre, r).unwrap();
        // Entry side, so left of the centre rather than right of it.
        assert!(hit.point.x <= centre.x, "reported the exit: {:?}", hit.point);
    }

    #[test]
    fn the_substep_count_is_capped_however_wild_the_input() {
        // A saturated travel must not turn the loop into a thirty-thousand-step
        // walk. Correctness here is "it returns"; the cap is the contract.
        let big = Fx::MAX;
        let lo = Vec2::new(Fx::MIN, Fx::MIN);
        let hi = Vec2::new(big, big);
        let _ = swept_segment_circle(lo, hi, hi, lo, Vec2::ZERO, hi, Fx::EPSILON);
        let _ = swept_segment_circle(lo, lo, hi, hi, lo, hi, Fx::ZERO);
        let _ = swept_segment_circle(lo, hi, lo, hi, hi, lo, big);
    }

    #[test]
    fn crossed_segments_report_the_crossing() {
        let hit = segment_segment(v(0, 0), v(10, 0), v(5, -5), v(5, 5));
        assert!(close(hit.unwrap(), v(5, 0)), "{hit:?}");

        // A crossing of the infinite lines that lies outside one segment is
        // not a crossing.
        assert!(segment_segment(v(0, 0), v(10, 0), v(5, 3), v(5, 8)).is_none());
        assert!(segment_segment(v(0, 0), v(4, 0), v(5, -5), v(5, 5)).is_none());
    }

    #[test]
    fn parallel_and_collinear_segments_never_parry() {
        // Parallel, apart.
        assert!(segment_segment(v(0, 0), v(10, 0), v(0, 1), v(10, 1)).is_none());
        // Collinear and overlapping -- the case that would otherwise fire every
        // tick two blades stay lined up.
        assert!(segment_segment(v(0, 0), v(10, 0), v(4, 0), v(14, 0)).is_none());
        // Collinear and identical.
        assert!(segment_segment(v(0, 0), v(10, 0), v(0, 0), v(10, 0)).is_none());
        // Degenerate segments have no direction to cross with.
        assert!(segment_segment(v(3, 3), v(3, 3), v(0, 0), v(10, 0)).is_none());
    }

    #[test]
    fn touching_at_an_endpoint_counts() {
        // `in_unit` is inclusive at both ends, so a tip landing exactly on
        // another blade is a parry rather than a near miss.
        let hit = segment_segment(v(0, 0), v(5, 0), v(5, 0), v(5, 5));
        assert!(close(hit.unwrap(), v(5, 0)), "{hit:?}");
    }

    #[test]
    fn extreme_inputs_stay_total() {
        // Nothing in the arena looks like this. The point is that the functions
        // answer *something* rather than panicking under `overflow-checks`,
        // because a panic on wasm32 traps and poisons the module.
        let big = Fx::MAX;
        let lo = Vec2::new(Fx::MIN, Fx::MIN);
        let hi = Vec2::new(big, big);

        let hit = closest_point_on_segment(lo, hi, Vec2::new(big, Fx::MIN));
        assert!(hit.t >= Fx::ZERO && hit.t <= Fx::ONE);

        let _ = segment_circle(lo, hi, Vec2::ZERO, big);
        let _ = segment_segment(lo, hi, hi, lo);
        let _ = segment_segment(lo, Vec2::ZERO, Vec2::ZERO, hi);
        let _ = segment_segment(hi, lo, Vec2::new(Fx::MIN, big), Vec2::new(big, Fx::MIN));
    }

    #[test]
    fn results_are_mirror_symmetric() {
        // A mirrored duel must produce mirrored geometry, or two identical
        // fighters get different answers purely from which side they stand on.
        let hit = closest_point_on_segment(v(0, 0), v(10, 4), v(3, 9));
        let mirrored = closest_point_on_segment(v(0, 0), v(10, -4), v(3, -9));
        assert_eq!(hit.t, mirrored.t);
        assert_eq!(hit.distance, mirrored.distance);
        assert_eq!(hit.point.x, mirrored.point.x);
        assert_eq!(hit.point.y, -mirrored.point.y);
    }
}
