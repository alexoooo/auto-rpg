//! Exact fixed-point geometry for articulated combat.
//!
//! The public values are deliberately small. All comparison arithmetic stays
//! in raw integer space so saturation and fixed-point rounding cannot choose a
//! different contact or closest pair on another target.

use crate::{mul_div, Fx, Hash64, Vec3, FRAC_BITS, ONE_RAW};

const POINT_LIMIT_RAW: i128 = 256 * ONE_RAW as i128;
const SHAPE_LIMIT_RAW: i128 = 8 * ONE_RAW as i128;
const RECTANGLE_EDGE_LIMIT_RAW: i128 = 16 * ONE_RAW as i128;
const EFFECTIVE_CAPSULE_RADIUS_LIMIT_RAW: i128 = 16 * ONE_RAW as i128;
const DISPLACEMENT_LIMIT_RAW: i128 = 4 * ONE_RAW as i128;
const SWEEP_ADVANCES: usize = 96;

fn reflected_lerp(a: Vec3, b: Vec3, t: Fx) -> Vec3 {
    Vec3::new(a.x + mul_div(b.x - a.x, t, Fx::ONE),
              a.y + mul_div(b.y - a.y, t, Fx::ONE),
              a.z + mul_div(b.z - a.z, t, Fx::ONE))
}

#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Debug)]
pub struct TimeOfImpact(Fx);

impl TimeOfImpact {
    pub const ZERO: Self = Self(Fx::ZERO);
    pub const ONE: Self = Self(Fx::ONE);

    #[inline]
    pub const fn new_clamped(value: Fx) -> Self {
        Self(value.clamp(Fx::ZERO, Fx::ONE))
    }

    #[inline]
    pub const fn get(self) -> Fx {
        self.0
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct ClosestPoints {
    pub a: Vec3,
    pub b: Vec3,
    pub distance_sq: Fx,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct SegmentRectangleClosest {
    pub a: Vec3,
    pub b: Vec3,
    pub distance_sq: Fx,
    pub feature: u8,
    pub segment_parameter: TimeOfImpact,
    pub side_parameter: TimeOfImpact,
    pub up_parameter: TimeOfImpact,
}

#[derive(Clone, Copy)]
struct RectangleCandidate {
    closest: SegmentRectangleClosest,
    distance_raw_sq: i128,
}

#[derive(Clone, Copy)]
struct RawVec3 {
    x: i128,
    y: i128,
    z: i128,
}

impl RawVec3 {
    fn of(value: Vec3) -> Self {
        Self {
            x: value.x.raw() as i128,
            y: value.y.raw() as i128,
            z: value.z.raw() as i128,
        }
    }

    fn sub(self, rhs: Self) -> Self {
        Self { x: self.x - rhs.x, y: self.y - rhs.y, z: self.z - rhs.z }
    }

    fn dot(self, rhs: Self) -> i128 {
        // Each component is the difference of two i32 raw values. Three
        // products therefore need fewer than 67 bits and always fit exactly.
        self.x * rhs.x + self.y * rhs.y + self.z * rhs.z
    }
}

#[derive(Clone, Copy)]
struct Ratio {
    num: i128,
    den: i128,
}

impl Ratio {
    const ZERO: Self = Self { num: 0, den: 1 };
    const ONE: Self = Self { num: 1, den: 1 };

    fn new(num: i128, den: i128) -> Self {
        debug_assert!(den > 0);
        if num == 0 {
            return Self::ZERO;
        }
        let divisor = gcd(num.unsigned_abs(), den as u128) as i128;
        Self { num: num / divisor, den: den / divisor }
    }

    fn clamped(self) -> Self {
        if self.num <= 0 {
            Self::ZERO
        } else if self.num >= self.den {
            Self::ONE
        } else {
            self
        }
    }
}

#[derive(Clone, Copy)]
struct Candidate {
    a: Vec3,
    b: Vec3,
    distance_raw_sq: i128,
}

/// Closest pair between two inclusive segments.
pub fn closest_points_on_segments(a0: Vec3, a1: Vec3, b0: Vec3, b1: Vec3) -> ClosestPoints {
    let ar0 = RawVec3::of(a0);
    let ar1 = RawVec3::of(a1);
    let br0 = RawVec3::of(b0);
    let br1 = RawVec3::of(b1);
    let u = ar1.sub(ar0);
    let v = br1.sub(br0);
    let w = ar0.sub(br0);
    let aa = u.dot(u);
    let bb = u.dot(v);
    let cc = v.dot(v);
    let dd = u.dot(w);
    let ee = v.dot(w);

    let winner = if aa == 0 && cc == 0 {
        candidate(a0, b0)
    } else if aa == 0 {
        candidate(a0, point_at(b0, v, Ratio::new(ee, cc).clamped()))
    } else if cc == 0 {
        candidate(point_at(a0, u, Ratio::new(-dd, aa).clamped()), b0)
    } else {
        let den = aa.checked_mul(cc).and_then(|x| bb.checked_mul(bb).and_then(|y| x.checked_sub(y)));
        if den == Some(0) || den.is_none() {
            // An overflow can occur only far outside the construction bounds.
            // The endpoint projection path is total and remains exact for the
            // actual parallel/coincident case mandated by the contract.
            let candidates = [
                candidate(a0, point_at(b0, v, Ratio::new(ee, cc).clamped())),
                candidate(a1, point_at(b0, v, Ratio::new(ee.saturating_add(bb), cc).clamped())),
                candidate(point_at(a0, u, Ratio::new(-dd, aa).clamped()), b0),
                candidate(point_at(a0, u, Ratio::new(bb.saturating_sub(dd), aa).clamped()), b1),
            ];
            choose(candidates)
        } else {
            let den = den.unwrap();
            let s_num = bb.checked_mul(ee).and_then(|x| cc.checked_mul(dd).and_then(|y| x.checked_sub(y)));
            let t_num = aa.checked_mul(ee).and_then(|x| bb.checked_mul(dd).and_then(|y| x.checked_sub(y)));
            if let (Some(s_num), Some(t_num)) = (s_num, t_num) {
                let raw_s = Ratio::new(s_num, den);
                let raw_t = Ratio::new(t_num, den);
                let mut s = raw_s.clamped();
                let s_was_interior = s.num == raw_s.num && s.den == raw_s.den;
                let first_t = if s_was_interior {
                    // Substitution cancels the common `cc`: recomputing from
                    // the unclamped analytic S is exactly the analytic T.
                    raw_t
                } else {
                    linear_ratio(bb, s, ee, cc)
                };
                let mut t = first_t.clamped();
                let t_was_interior = t.num == first_t.num && t.den == first_t.den;
                s = if s_was_interior && t_was_interior {
                    raw_s
                } else {
                    linear_ratio(bb, t, -dd, aa)
                }.clamped();
                t = linear_ratio(bb, s, ee, cc).clamped();
                candidate(point_at(a0, u, s), point_at(b0, v, t))
            } else {
                // Same totality escape as the determinant overflow above.
                choose([
                    candidate(a0, point_at(b0, v, Ratio::new(ee, cc).clamped())),
                    candidate(a1, point_at(b0, v, Ratio::new(ee.saturating_add(bb), cc).clamped())),
                    candidate(point_at(a0, u, Ratio::new(-dd, aa).clamped()), b0),
                    candidate(point_at(a0, u, Ratio::new(bb.saturating_sub(dd), aa).clamped()), b1),
                ])
            }
        }
    };

    ClosestPoints {
        a: winner.a,
        b: winner.b,
        distance_sq: distance_sq_from_raw(winner.distance_raw_sq),
    }
}

fn gcd(mut a: u128, mut b: u128) -> u128 {
    while b != 0 {
        let remainder = a % b;
        a = b;
        b = remainder;
    }
    a
}

fn linear_ratio(coefficient: i128, ratio: Ratio, constant: i128, divisor: i128) -> Ratio {
    let numerator = coefficient.checked_mul(ratio.num)
        .and_then(|x| constant.checked_mul(ratio.den).and_then(|y| x.checked_add(y)));
    let denominator = divisor.checked_mul(ratio.den);
    match (numerator, denominator) {
        (Some(numerator), Some(denominator)) if denominator > 0 => Ratio::new(numerator, denominator),
        _ => Ratio::ZERO,
    }
}

fn point_at(origin: Vec3, delta: RawVec3, ratio: Ratio) -> Vec3 {
    Vec3::new(
        Fx::from_raw(raw_component(origin.x.raw(), delta.x, ratio)),
        Fx::from_raw(raw_component(origin.y.raw(), delta.y, ratio)),
        Fx::from_raw(raw_component(origin.z.raw(), delta.z, ratio)),
    )
}

fn raw_component(origin: i32, delta: i128, ratio: Ratio) -> i32 {
    let scaled = multiply_ratio(delta, ratio);
    let raw = origin as i128 + scaled;
    raw.clamp(i32::MIN as i128, i32::MAX as i128) as i32
}

/// `delta * numerator / denominator` with truncation toward zero and without
/// ever forming the potentially 160-bit product. The ratio is clamped, so a
/// binary quotient/remainder accumulator needs only `u128` remainders and a
/// small integer quotient.
fn multiply_ratio(delta: i128, ratio: Ratio) -> i128 {
    if delta == 0 || ratio.num == 0 {
        return 0;
    }
    debug_assert!(ratio.num > 0 && ratio.num <= ratio.den);
    let modulus = ratio.den as u128;
    let mut multiplier = delta.unsigned_abs();
    let mut part_quotient = 0u128;
    let mut part_remainder = ratio.num as u128;
    let mut quotient = 0u128;
    let mut remainder = 0u128;
    while multiplier != 0 {
        if multiplier & 1 != 0 {
            quotient += part_quotient;
            let sum = remainder + part_remainder;
            if sum >= modulus {
                quotient += 1;
                remainder = sum - modulus;
            } else {
                remainder = sum;
            }
        }
        multiplier >>= 1;
        if multiplier == 0 {
            break;
        }
        part_quotient *= 2;
        let doubled = part_remainder * 2;
        if doubled >= modulus {
            part_quotient += 1;
            part_remainder = doubled - modulus;
        } else {
            part_remainder = doubled;
        }
    }
    if delta < 0 { -(quotient as i128) } else { quotient as i128 }
}

fn candidate(a: Vec3, b: Vec3) -> Candidate {
    let d = RawVec3::of(a).sub(RawVec3::of(b));
    Candidate {
        a,
        b,
        distance_raw_sq: d.x * d.x + d.y * d.y + d.z * d.z,
    }
}

fn choose<const N: usize>(candidates: [Candidate; N]) -> Candidate {
    let mut winner = candidates[0];
    for candidate in candidates.into_iter().skip(1) {
        if candidate_key(candidate) < candidate_key(winner) {
            winner = candidate;
        }
    }
    winner
}

fn candidate_key(candidate: Candidate) -> (i128, i32, i32, i32, i32, i32, i32) {
    (
        candidate.distance_raw_sq,
        candidate.a.x.raw(), candidate.a.y.raw(), candidate.a.z.raw(),
        candidate.b.x.raw(), candidate.b.y.raw(), candidate.b.z.raw(),
    )
}

fn distance_sq_from_raw(raw_square: i128) -> Fx {
    let raw = raw_square >> FRAC_BITS;
    Fx::from_raw(raw.min(i32::MAX as i128) as i32)
}

/// Inclusive intersection fraction between a segment and an unnormalised plane.
pub fn segment_plane(a: Vec3, b: Vec3, plane_point: Vec3, plane_normal: Vec3) -> Option<TimeOfImpact> {
    let normal = RawVec3::of(plane_normal);
    if normal.x == 0 && normal.y == 0 && normal.z == 0 {
        return None;
    }
    let point = RawVec3::of(plane_point);
    let da = RawVec3::of(a).sub(point).dot(normal);
    let db = RawVec3::of(b).sub(point).dot(normal);
    if da == 0 {
        return Some(TimeOfImpact::ZERO);
    }
    if db == 0 {
        return Some(TimeOfImpact::ONE);
    }
    if (da < 0) == (db < 0) {
        return None;
    }
    let den = da - db;
    let raw = da.saturating_mul(ONE_RAW as i128) / den;
    Some(TimeOfImpact::new_clamped(Fx::from_raw(
        raw.clamp(0, ONE_RAW as i128) as i32,
    )))
}

pub fn swept_segment_sphere(
    a0: Vec3, a1: Vec3, a2: Vec3, a3: Vec3,
    c0: Vec3, c1: Vec3, radius: Fx,
) -> Option<TimeOfImpact> {
    swept_segment_sphere_audited(a0, a1, a2, a3, c0, c1, radius).0
}

fn swept_segment_sphere_audited(
    a0: Vec3, a1: Vec3, a2: Vec3, a3: Vec3,
    c0: Vec3, c1: Vec3, radius: Fx,
) -> (Option<TimeOfImpact>, usize, bool) {
    if !valid_sphere_sweep(a0, a1, a2, a3, c0, c1, radius) {
        return (Some(TimeOfImpact::ZERO), 0, false);
    }
    let centre_delta = c1 - c0;
    let speed = ((a2 - a0) - centre_delta).length()
        .max(((a3 - a1) - centre_delta).length());
    conservative_sweep_audited(speed, radius, |t| {
        let a = Vec3::lerp(a0, a2, t);
        let b = Vec3::lerp(a1, a3, t);
        let c = Vec3::lerp(c0, c1, t);
        let closest = closest_points_on_segments(a, b, c, c);
        closest.a.distance(closest.b)
    })
}

pub fn swept_segment_vertical_capsule(
    a0: Vec3, a1: Vec3, a2: Vec3, a3: Vec3,
    centre0: Vec3, centre1: Vec3, half_height: Fx, radius: Fx,
) -> Option<TimeOfImpact> {
    swept_segment_vertical_capsule_audited(
        a0, a1, a2, a3, centre0, centre1, half_height, radius,
    ).0
}

pub fn swept_segment_segment(
    a0: Vec3, a1: Vec3, a2: Vec3, a3: Vec3, radius_a: Fx,
    b0: Vec3, b1: Vec3, b2: Vec3, b3: Vec3, radius_b: Fx,
) -> Option<TimeOfImpact> {
    swept_segment_segment_audited(
        a0, a1, a2, a3, radius_a, b0, b1, b2, b3, radius_b,
    ).0
}

fn swept_segment_segment_audited(
    a0: Vec3, a1: Vec3, a2: Vec3, a3: Vec3, radius_a: Fx,
    b0: Vec3, b1: Vec3, b2: Vec3, b3: Vec3, radius_b: Fx,
) -> (Option<TimeOfImpact>, usize, bool) {
    if !valid_segment_segment_sweep(
        a0, a1, a2, a3, radius_a, b0, b1, b2, b3, radius_b,
    ) {
        return (Some(TimeOfImpact::ZERO), 0, false);
    }
    let ad0 = a2 - a0;
    let ad1 = a3 - a1;
    let bd0 = b2 - b0;
    let bd1 = b3 - b1;
    let speed = (ad0 - bd0).length()
        .max((ad0 - bd1).length())
        .max((ad1 - bd0).length())
        .max((ad1 - bd1).length());
    conservative_sweep_audited(speed, radius_a + radius_b, |t| {
        let closest = closest_points_on_segments(
            reflected_lerp(a0, a2, t), reflected_lerp(a1, a3, t),
            reflected_lerp(b0, b2, t), reflected_lerp(b1, b3, t),
        );
        closest.a.distance(closest.b)
    })
}

#[cfg(test)]
#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
struct SweepIterationDiagnostic {
    index: usize,
    entry_time_raw: i32,
    endpoints: [Vec3; 4],
    closest_branch: u8,
    closest_parameters: [[i128; 2]; 4],
    closest_a: Vec3,
    closest_b: Vec3,
    delta: Vec3,
    distance_sq_raw: i32,
    distance_raw: i32,
    radius_raw: i32,
    separation_raw: i32,
    speed_raw: i32,
    quotient: i64,
    remaining_raw: i32,
    advance_raw: i32,
    exit_time_raw: i32,
    decision: u8,
}

#[cfg(test)]
fn closest_points_test_diagnostic(a0: Vec3, a1: Vec3, b0: Vec3, b1: Vec3)
    -> (ClosestPoints, u8, [[i128; 2]; 4])
{
    let u = RawVec3::of(a1).sub(RawVec3::of(a0));
    let v = RawVec3::of(b1).sub(RawVec3::of(b0));
    let w = RawVec3::of(a0).sub(RawVec3::of(b0));
    let aa = u.dot(u); let bb = u.dot(v); let cc = v.dot(v);
    let dd = u.dot(w); let ee = v.dot(w);
    let den = aa * cc - bb * bb;
    let (branch, words) = if aa == 0 && cc == 0 {
        (1, [[0, 1]; 4])
    } else if aa == 0 {
        (2, [[0, 1], [ee, cc], [0, 1], [Ratio::new(ee, cc).clamped().num,
                                         Ratio::new(ee, cc).clamped().den]])
    } else if cc == 0 {
        (3, [[-dd, aa], [0, 1], [Ratio::new(-dd, aa).clamped().num,
                                  Ratio::new(-dd, aa).clamped().den], [0, 1]])
    } else {
        let raw_s = Ratio::new(bb * ee - cc * dd, den);
        let raw_t = Ratio::new(aa * ee - bb * dd, den);
        let s = raw_s.clamped();
        let first_t = if s.num == raw_s.num && s.den == raw_s.den { raw_t }
                      else { linear_ratio(bb, s, ee, cc) };
        let t = first_t.clamped();
        let final_s = if s.num == raw_s.num && s.den == raw_s.den
            && t.num == first_t.num && t.den == first_t.den { raw_s }
            else { linear_ratio(bb, t, -dd, aa) }.clamped();
        let final_t = linear_ratio(bb, final_s, ee, cc).clamped();
        (4, [[raw_s.num, raw_s.den], [raw_t.num, raw_t.den],
             [final_s.num, final_s.den], [final_t.num, final_t.den]])
    };
    (closest_points_on_segments(a0, a1, b0, b1), branch, words)
}

#[cfg(test)]
fn swept_segment_segment_iteration_trace(
    a0: Vec3, a1: Vec3, a2: Vec3, a3: Vec3, radius_a: Fx,
    b0: Vec3, b1: Vec3, b2: Vec3, b3: Vec3, radius_b: Fx,
) -> (Option<TimeOfImpact>, [Option<SweepIterationDiagnostic>; SWEEP_ADVANCES]) {
    let ad0 = a2 - a0; let ad1 = a3 - a1;
    let bd0 = b2 - b0; let bd1 = b3 - b1;
    let speed = (ad0 - bd0).length().max((ad0 - bd1).length())
        .max((ad1 - bd0).length()).max((ad1 - bd1).length());
    let radius = radius_a + radius_b;
    let mut rows = [None; SWEEP_ADVANCES];
    let mut time = Fx::ZERO;
    for index in 0..SWEEP_ADVANCES {
        let endpoints = [reflected_lerp(a0, a2, time), reflected_lerp(a1, a3, time),
                         reflected_lerp(b0, b2, time), reflected_lerp(b1, b3, time)];
        let (closest, closest_branch, closest_parameters) = closest_points_test_diagnostic(
            endpoints[0], endpoints[1], endpoints[2], endpoints[3]);
        let delta = closest.a - closest.b;
        let distance = closest.a.distance(closest.b);
        let separation = distance - radius;
        if separation <= Fx::ZERO {
            rows[index] = Some(SweepIterationDiagnostic { index,
                entry_time_raw: time.raw(), endpoints, closest_a: closest.a,
                closest_branch, closest_parameters,
                closest_b: closest.b, delta, distance_sq_raw: closest.distance_sq.raw(),
                distance_raw: distance.raw(), radius_raw: radius.raw(),
                separation_raw: separation.raw(), speed_raw: speed.raw(),
                exit_time_raw: time.raw(), decision: 1, ..Default::default() });
            return (Some(TimeOfImpact::new_clamped(time)), rows);
        }
        let quotient = ((separation.raw() as i64) << FRAC_BITS) / speed.raw() as i64;
        let remaining = Fx::ONE - time;
        let advance_raw = quotient.max(1).min(remaining.raw() as i64) as i32;
        let exit = time + Fx::from_raw(advance_raw);
        rows[index] = Some(SweepIterationDiagnostic { index,
            entry_time_raw: time.raw(), endpoints, closest_a: closest.a,
            closest_branch, closest_parameters,
            closest_b: closest.b, delta, distance_sq_raw: closest.distance_sq.raw(),
            distance_raw: distance.raw(), radius_raw: radius.raw(),
            separation_raw: separation.raw(), speed_raw: speed.raw(), quotient,
            remaining_raw: remaining.raw(), advance_raw, exit_time_raw: exit.raw(),
            decision: if exit == Fx::ONE { 2 } else { 0 } });
        time = exit;
        if time == Fx::ONE { return (None, rows); }
    }
    (Some(TimeOfImpact::new_clamped(time)), rows)
}

pub fn closest_points_segment_rectangle(
    segment0: Vec3,
    segment1: Vec3,
    rectangle: [Vec3; 4],
) -> SegmentRectangleClosest {
    if !valid_rectangle(rectangle) {
        return SegmentRectangleClosest {
            a: segment0,
            b: rectangle[0],
            distance_sq: segment0.distance_sq(rectangle[0]),
            feature: u8::MAX,
            segment_parameter: TimeOfImpact::ZERO,
            side_parameter: TimeOfImpact::ZERO,
            up_parameter: TimeOfImpact::ZERO,
        };
    }

    let side = RawVec3::of(rectangle[1]).sub(RawVec3::of(rectangle[0]));
    let up = RawVec3::of(rectangle[3]).sub(RawVec3::of(rectangle[0]));
    let normal = rectangle_normal(rectangle);
    let centre = midpoint(rectangle[0], rectangle[2]);
    let mut candidates = [rectangle_candidate(
        segment0, rectangle[0], 1, TimeOfImpact::ZERO,
        TimeOfImpact::ZERO, TimeOfImpact::ZERO,
    ); 7];

    // A strict crossing which lands within the finite face is the first
    // feature. A coplanar segment deliberately falls through to the closed
    // face/edge candidate set.
    if let Some(t) = segment_plane(segment0, segment1, centre, normal) {
        let normal_raw = RawVec3::of(normal);
        let da = RawVec3::of(segment0).sub(RawVec3::of(centre)).dot(normal_raw);
        let db = RawVec3::of(segment1).sub(RawVec3::of(centre)).dot(normal_raw);
        if !(da == 0 && db == 0 && segment0 != segment1) {
            let point = Vec3::lerp(segment0, segment1, t.get());
            if let Some((s, u)) = rectangle_parameters_inside(point, rectangle[0], side, up) {
                candidates[0] = rectangle_candidate(point, point, 0, t, s, u);
            }
        }
    }

    for (offset, endpoint) in [segment0, segment1].into_iter().enumerate() {
        let projected = endpoint - normal * (endpoint - centre).dot(normal);
        let (s, u, face_point) = clamped_rectangle_point(projected, rectangle[0], side, up);
        candidates[offset + 1] = rectangle_candidate(
            endpoint, face_point, (offset + 1) as u8,
            if offset == 0 { TimeOfImpact::ZERO } else { TimeOfImpact::ONE }, s, u,
        );
    }

    let edges = [
        (rectangle[0], rectangle[3], TimeOfImpact::ZERO, None),
        (rectangle[1], rectangle[2], TimeOfImpact::ONE, None),
        (rectangle[0], rectangle[1], TimeOfImpact::ZERO, Some(TimeOfImpact::ZERO)),
        (rectangle[3], rectangle[2], TimeOfImpact::ONE, Some(TimeOfImpact::ONE)),
    ];
    for (offset, (e0, e1, fixed, horizontal)) in edges.into_iter().enumerate() {
        let closest = closest_points_on_segments(segment0, segment1, e0, e1);
        let segment_t = segment_parameter(closest.a, segment0, segment1);
        let edge_t = segment_parameter(closest.b, e0, e1);
        let (s, u) = match horizontal {
            None => (fixed, edge_t),
            Some(up_fixed) => (edge_t, up_fixed),
        };
        candidates[offset + 3] = rectangle_candidate(
            closest.a, closest.b, (offset + 3) as u8, segment_t, s, u,
        );
    }

    let mut winner = candidates[0];
    for candidate in candidates.into_iter().skip(1) {
        if rectangle_candidate_key(candidate) < rectangle_candidate_key(winner) {
            winner = candidate;
        }
    }
    winner.closest
}

pub fn swept_segment_rectangle(
    a0: Vec3, a1: Vec3, a2: Vec3, a3: Vec3, radius: Fx,
    rectangle0: [Vec3; 4], rectangle1: [Vec3; 4],
) -> Option<TimeOfImpact> {
    swept_segment_rectangle_audited(a0, a1, a2, a3, radius, rectangle0, rectangle1).0
}

fn swept_segment_rectangle_audited(
    a0: Vec3, a1: Vec3, a2: Vec3, a3: Vec3, radius: Fx,
    rectangle0: [Vec3; 4], rectangle1: [Vec3; 4],
) -> (Option<TimeOfImpact>, usize, bool) {
    if !valid_segment_rectangle_sweep(a0, a1, a2, a3, radius, rectangle0, rectangle1) {
        return (Some(TimeOfImpact::ZERO), 0, false);
    }
    let endpoint_displacements = [a2 - a0, a3 - a1];
    let corner_displacements = [
        rectangle1[0] - rectangle0[0], rectangle1[1] - rectangle0[1],
        rectangle1[2] - rectangle0[2], rectangle1[3] - rectangle0[3],
    ];
    let mut speed = Fx::ZERO;
    for endpoint in endpoint_displacements {
        for corner in corner_displacements {
            speed = speed.max((endpoint - corner).length());
        }
    }
    conservative_sweep_audited(speed, radius, |t| {
        let rectangle = [
            Vec3::lerp(rectangle0[0], rectangle1[0], t),
            Vec3::lerp(rectangle0[1], rectangle1[1], t),
            Vec3::lerp(rectangle0[2], rectangle1[2], t),
            Vec3::lerp(rectangle0[3], rectangle1[3], t),
        ];
        let closest = closest_points_segment_rectangle(
            Vec3::lerp(a0, a2, t), Vec3::lerp(a1, a3, t), rectangle,
        );
        closest.a.distance(closest.b)
    })
}

fn rectangle_candidate(
    a: Vec3, b: Vec3, feature: u8, segment_parameter: TimeOfImpact,
    side_parameter: TimeOfImpact, up_parameter: TimeOfImpact,
) -> RectangleCandidate {
    RectangleCandidate {
        closest: SegmentRectangleClosest {
            a, b, distance_sq: distance_sq_from_raw(raw_distance_sq(a, b)), feature,
            segment_parameter, side_parameter, up_parameter,
        },
        distance_raw_sq: raw_distance_sq(a, b),
    }
}

fn rectangle_candidate_key(candidate: RectangleCandidate) -> (i128, u8, i32, i32, i32, i32, i32, i32) {
    let closest = candidate.closest;
    (
        candidate.distance_raw_sq, closest.feature,
        closest.a.x.raw(), closest.a.y.raw(), closest.a.z.raw(),
        closest.b.x.raw(), closest.b.y.raw(), closest.b.z.raw(),
    )
}

fn midpoint(a: Vec3, b: Vec3) -> Vec3 {
    Vec3::new(
        Fx::from_raw(((a.x.raw() as i64 + b.x.raw() as i64) / 2) as i32),
        Fx::from_raw(((a.y.raw() as i64 + b.y.raw() as i64) / 2) as i32),
        Fx::from_raw(((a.z.raw() as i64 + b.z.raw() as i64) / 2) as i32),
    )
}

fn rectangle_normal(rectangle: [Vec3; 4]) -> Vec3 {
    let side = RawVec3::of(rectangle[1]).sub(RawVec3::of(rectangle[0]));
    let up = RawVec3::of(rectangle[3]).sub(RawVec3::of(rectangle[0]));
    let cross = RawVec3 {
        x: side.y * up.z - side.z * up.y,
        y: side.z * up.x - side.x * up.z,
        z: side.x * up.y - side.y * up.x,
    };
    let square = (cross.x * cross.x + cross.y * cross.y + cross.z * cross.z) as u128;
    let length = isqrt128(square) as i128;
    if length == 0 {
        return Vec3::ZERO;
    }
    Vec3::new(
        Fx::from_raw(((cross.x * ONE_RAW as i128) / length).clamp(i32::MIN as i128, i32::MAX as i128) as i32),
        Fx::from_raw(((cross.y * ONE_RAW as i128) / length).clamp(i32::MIN as i128, i32::MAX as i128) as i32),
        Fx::from_raw(((cross.z * ONE_RAW as i128) / length).clamp(i32::MIN as i128, i32::MAX as i128) as i32),
    )
}

fn isqrt128(value: u128) -> u128 {
    let mut result = 0u128;
    let mut bit = 1u128 << 126;
    while bit > value {
        bit >>= 2;
    }
    let mut remainder = value;
    while bit != 0 {
        if remainder >= result + bit {
            remainder -= result + bit;
            result = (result >> 1) + bit;
        } else {
            result >>= 1;
        }
        bit >>= 2;
    }
    result
}

fn axis_parameter(point: Vec3, origin: Vec3, axis: RawVec3) -> Ratio {
    let delta = RawVec3::of(point).sub(RawVec3::of(origin));
    Ratio::new(delta.dot(axis), axis.dot(axis))
}

fn rectangle_parameters_inside(
    point: Vec3, origin: Vec3, side: RawVec3, up: RawVec3,
) -> Option<(TimeOfImpact, TimeOfImpact)> {
    let s = axis_parameter(point, origin, side);
    let u = axis_parameter(point, origin, up);
    if s.num < 0 || s.num > s.den || u.num < 0 || u.num > u.den {
        None
    } else {
        Some((ratio_toi(s), ratio_toi(u)))
    }
}

fn clamped_rectangle_point(
    projected: Vec3, origin: Vec3, side: RawVec3, up: RawVec3,
) -> (TimeOfImpact, TimeOfImpact, Vec3) {
    let s = axis_parameter(projected, origin, side).clamped();
    let first = point_at(origin, side, s);
    let u = axis_parameter(projected, origin, up).clamped();
    (ratio_toi(s), ratio_toi(u), point_at(first, up, u))
}

fn ratio_toi(ratio: Ratio) -> TimeOfImpact {
    let raw = multiply_ratio(ONE_RAW as i128, ratio.clamped()) as i32;
    TimeOfImpact::new_clamped(Fx::from_raw(raw))
}

fn segment_parameter(point: Vec3, start: Vec3, end: Vec3) -> TimeOfImpact {
    let axis = RawVec3::of(end).sub(RawVec3::of(start));
    if axis.dot(axis) == 0 {
        TimeOfImpact::ZERO
    } else {
        ratio_toi(axis_parameter(point, start, axis))
    }
}

fn swept_segment_vertical_capsule_audited(
    a0: Vec3, a1: Vec3, a2: Vec3, a3: Vec3,
    centre0: Vec3, centre1: Vec3, half_height: Fx, radius: Fx,
) -> (Option<TimeOfImpact>, usize, bool) {
    if !valid_capsule_sweep(a0, a1, a2, a3, centre0, centre1, half_height, radius) {
        return (Some(TimeOfImpact::ZERO), 0, false);
    }
    let centre_delta = centre1 - centre0;
    let speed = ((a2 - a0) - centre_delta).length()
        .max(((a3 - a1) - centre_delta).length());
    conservative_sweep_audited(speed, radius, |t| {
        let a = Vec3::lerp(a0, a2, t);
        let b = Vec3::lerp(a1, a3, t);
        let centre = Vec3::lerp(centre0, centre1, t);
        let low = Vec3::new(centre.x, centre.y, centre.z - half_height);
        let high = Vec3::new(centre.x, centre.y, centre.z + half_height);
        let closest = closest_points_on_segments(a, b, low, high);
        closest.a.distance(closest.b)
    })
}

/// Portable probe used by the native/thread/wasm equality gate.
///
/// This is not simulation state and no mechanic consumes it. Keeping the
/// writer beside the primitives prevents the wasm boundary from growing a
/// second implementation of the frozen corpus or its byte order.
#[doc(hidden)]
pub fn combat_geometry_digest() -> u64 {
    let mut hash = Hash64::new();
    hash.write_bytes(b"ARPG-GEOM3-V1");

    for (ordinal, closest) in frozen_closest_outputs().into_iter().enumerate() {
        hash.write_u8(ordinal as u8);
        write_closest(&mut hash, closest);
    }
    for (offset, toi) in frozen_toi_outputs().into_iter().enumerate() {
        hash.write_u8((offset + 4) as u8);
        write_toi(&mut hash, toi);
    }
    hash.finish()
}

/// Unpinned exhaustive totality corpus. Its value is compared between native
/// threads; unlike [`combat_geometry_digest`], it is not a semantic golden.
#[doc(hidden)]
pub fn combat_geometry_boundary_digest() -> u64 {
    let scalars = [Fx::MIN, -Fx::ONE, Fx::ZERO, Fx::EPSILON, Fx::ONE, Fx::MAX];
    let mut hash = Hash64::new();
    hash.write_bytes(b"ARPG-GEOM3-BOUNDARY-V1");
    let mut ordinal = 0u32;

    for argument in 0..4 {
        for component in 0..3 {
            for scalar in scalars {
                let mut args = [Vec3::ZERO; 4];
                args[argument] = one_hot(component, scalar);
                hash.write_u32(ordinal); ordinal += 1;
                write_closest(&mut hash, closest_points_on_segments(args[0], args[1], args[2], args[3]));
            }
        }
    }
    for argument in 0..4 {
        for component in 0..3 {
            for scalar in scalars {
                let mut args = [Vec3::ZERO; 4];
                args[argument] = one_hot(component, scalar);
                hash.write_u32(ordinal); ordinal += 1;
                write_toi(&mut hash, segment_plane(args[0], args[1], args[2], args[3]));
            }
        }
    }
    for argument in 0..6 {
        for component in 0..3 {
            for scalar in scalars {
                let mut args = [Vec3::ZERO; 6];
                args[argument] = one_hot(component, scalar);
                hash.write_u32(ordinal); ordinal += 1;
                write_toi(&mut hash, swept_segment_sphere(
                    args[0], args[1], args[2], args[3], args[4], args[5], Fx::ZERO,
                ));
            }
        }
    }
    for scalar in scalars {
        hash.write_u32(ordinal); ordinal += 1;
        write_toi(&mut hash, swept_segment_sphere(
            Vec3::ZERO, Vec3::ZERO, Vec3::ZERO, Vec3::ZERO,
            Vec3::ZERO, Vec3::ZERO, scalar,
        ));
    }
    for argument in 0..6 {
        for component in 0..3 {
            for scalar in scalars {
                let mut args = [Vec3::ZERO; 6];
                args[argument] = one_hot(component, scalar);
                hash.write_u32(ordinal); ordinal += 1;
                write_toi(&mut hash, swept_segment_vertical_capsule(
                    args[0], args[1], args[2], args[3], args[4], args[5],
                    Fx::ZERO, Fx::ZERO,
                ));
            }
        }
    }
    for field in 0..2 {
        for scalar in scalars {
            hash.write_u32(ordinal); ordinal += 1;
            let (half_height, radius) = if field == 0 {
                (scalar, Fx::ZERO)
            } else {
                (Fx::ZERO, scalar)
            };
            write_toi(&mut hash, swept_segment_vertical_capsule(
                Vec3::ZERO, Vec3::ZERO, Vec3::ZERO, Vec3::ZERO,
                Vec3::ZERO, Vec3::ZERO, half_height, radius,
            ));
        }
    }
    for argument in 0..8 {
        for component in 0..3 {
            for scalar in scalars {
                let mut args = [Vec3::ZERO; 8];
                args[argument] = one_hot(component, scalar);
                hash.write_u32(ordinal); ordinal += 1;
                write_toi(&mut hash, swept_segment_segment(
                    args[0], args[1], args[2], args[3], Fx::ZERO,
                    args[4], args[5], args[6], args[7], Fx::ZERO,
                ));
            }
        }
    }
    for field in 0..2 {
        for scalar in scalars {
            hash.write_u32(ordinal); ordinal += 1;
            let (radius_a, radius_b) = if field == 0 {
                (scalar, Fx::ZERO)
            } else {
                (Fx::ZERO, scalar)
            };
            write_toi(&mut hash, swept_segment_segment(
                Vec3::ZERO, Vec3::ZERO, Vec3::ZERO, Vec3::ZERO, radius_a,
                Vec3::ZERO, Vec3::ZERO, Vec3::ZERO, Vec3::ZERO, radius_b,
            ));
        }
    }
    for argument in 0..12 {
        for component in 0..3 {
            for scalar in scalars {
                let mut args = [Vec3::ZERO; 12];
                args[argument] = one_hot(component, scalar);
                hash.write_u32(ordinal); ordinal += 1;
                write_toi(&mut hash, swept_segment_rectangle(
                    args[0], args[1], args[2], args[3], Fx::ZERO,
                    [args[4], args[5], args[6], args[7]],
                    [args[8], args[9], args[10], args[11]],
                ));
            }
        }
    }
    for scalar in scalars {
        hash.write_u32(ordinal); ordinal += 1;
        write_toi(&mut hash, swept_segment_rectangle(
            Vec3::ZERO, Vec3::ZERO, Vec3::ZERO, Vec3::ZERO, scalar,
            [Vec3::ZERO; 4], [Vec3::ZERO; 4],
        ));
    }
    for bits in 0..8 {
        let corner = Vec3::from_ints(
            if bits & 1 == 0 { -256 } else { 256 },
            if bits & 2 == 0 { -256 } else { 256 },
            if bits & 4 == 0 { -256 } else { 256 },
        );
        hash.write_u32(ordinal); ordinal += 1;
        write_closest(&mut hash, closest_points_on_segments(corner, corner, corner, corner));
        hash.write_u32(ordinal); ordinal += 1;
        write_toi(&mut hash, swept_segment_sphere(
            corner, corner, corner, corner, corner, corner, Fx::ZERO,
        ));
        hash.write_u32(ordinal); ordinal += 1;
        write_toi(&mut hash, swept_segment_vertical_capsule(
            corner, corner, corner, corner, corner, corner, Fx::ZERO, Fx::ZERO,
        ));
    }
    for component in 0..3 {
        for scalar in [Fx::from_int(-4), Fx::from_int(4)] {
            let displacement = one_hot(component, scalar);
            let target = one_hot(component, Fx::from_int(2) * if scalar < Fx::ZERO { -Fx::ONE } else { Fx::ONE });
            hash.write_u32(ordinal); ordinal += 1;
            write_toi(&mut hash, swept_segment_sphere(
                Vec3::ZERO, Vec3::ZERO, displacement, displacement,
                target, target, Fx::HALF,
            ));
            hash.write_u32(ordinal); ordinal += 1;
            write_toi(&mut hash, swept_segment_vertical_capsule(
                Vec3::ZERO, Vec3::ZERO, displacement, displacement,
                target, target, Fx::ZERO, Fx::HALF,
            ));
        }
    }
    hash.finish()
}

fn one_hot(component: usize, value: Fx) -> Vec3 {
    match component {
        0 => Vec3::new(value, Fx::ZERO, Fx::ZERO),
        1 => Vec3::new(Fx::ZERO, value, Fx::ZERO),
        _ => Vec3::new(Fx::ZERO, Fx::ZERO, value),
    }
}

fn frozen_closest_outputs() -> [ClosestPoints; 4] {
    let p = Vec3::from_ints;
    [
        closest_points_on_segments(p(0, 0, 0), p(4, 0, 0), p(2, -2, 0), p(2, 2, 0)),
        closest_points_on_segments(p(0, 0, 0), p(4, 0, 0), p(0, 1, 0), p(4, 1, 0)),
        closest_points_on_segments(p(0, 0, 0), p(4, 0, 0), p(3, 0, 0), p(1, 0, 0)),
        closest_points_on_segments(p(3, 2, 0), p(3, 2, 0), p(0, 0, 0), p(4, 0, 0)),
    ]
}

fn frozen_toi_outputs() -> [Option<TimeOfImpact>; 6] {
    let p = Vec3::from_ints;
    [
        swept_segment_sphere(
            p(0, -1, 0), p(0, 1, 0), p(4, -1, 0), p(4, 1, 0),
            p(2, 0, 0), p(2, 0, 0), Fx::HALF,
        ),
        swept_segment_sphere(
            p(0, -1, 0), p(0, 1, 0), p(0, -1, 0), p(0, 1, 0),
            p(1, 0, 0), p(1, 0, 0), Fx::ONE,
        ),
        swept_segment_vertical_capsule(
            p(0, 0, 1), p(0, 0, 1), p(4, 0, 1), p(4, 0, 1),
            p(2, 0, 1), p(2, 0, 1), Fx::ONE, Fx::HALF,
        ),
        segment_plane(p(0, 0, -1), p(0, 0, 3), Vec3::ZERO, Vec3::Z),
        swept_segment_segment(
            p(0, 0, 0), p(0, 0, 0), p(2, 0, 0), p(2, 0, 0), Fx::ZERO,
            p(1, 0, 0), p(1, 0, 0), p(1, 0, 0), p(1, 0, 0), Fx::ZERO,
        ),
        swept_segment_rectangle(
            p(1, 0, 0), p(1, 0, 0), p(-1, 0, 0), p(-1, 0, 0), Fx::ZERO,
            [p(0, -1, -1), p(0, 1, -1), p(0, 1, 1), p(0, -1, 1)],
            [p(0, -1, -1), p(0, 1, -1), p(0, 1, 1), p(0, -1, 1)],
        ),
    ]
}

fn write_closest(hash: &mut Hash64, closest: ClosestPoints) {
    for value in [
        closest.a.x, closest.a.y, closest.a.z,
        closest.b.x, closest.b.y, closest.b.z,
        closest.distance_sq,
    ] {
        hash.write_i32(value.raw());
    }
}

fn write_toi(hash: &mut Hash64, toi: Option<TimeOfImpact>) {
    match toi {
        None => hash.write_u8(0),
        Some(toi) => {
            hash.write_u8(1);
            hash.write_i32(toi.get().raw());
        }
    }
}

fn conservative_sweep_audited(
    mut speed: Fx,
    radius: Fx,
    mut distance: impl FnMut(Fx) -> Fx,
) -> (Option<TimeOfImpact>, usize, bool) {
    let mut time = Fx::ZERO;
    let mut separation = distance(time) - radius;
    if separation <= Fx::ZERO {
        return (Some(TimeOfImpact::ZERO), 0, false);
    }
    if speed <= Fx::ZERO {
        return (None, 0, false);
    }
    // The argument is intentionally mutable only to make the proof obvious to
    // the optimizer: validation excludes a negative speed before this point.
    speed = speed.max(Fx::EPSILON);
    for advance_index in 0..SWEEP_ADVANCES {
        let quotient = ((separation.raw() as i64) << FRAC_BITS) / speed.raw() as i64;
        let remaining = Fx::ONE - time;
        let advance_raw = quotient.max(1).min(remaining.raw() as i64) as i32;
        time += Fx::from_raw(advance_raw);
        separation = distance(time) - radius;
        if separation <= Fx::ZERO {
            return (Some(TimeOfImpact::new_clamped(time)), advance_index + 1, false);
        }
        if time == Fx::ONE {
            return (None, advance_index + 1, false);
        }
    }
    (Some(TimeOfImpact::new_clamped(time)), SWEEP_ADVANCES, true)
}

fn valid_sphere_sweep(a0: Vec3, a1: Vec3, a2: Vec3, a3: Vec3, c0: Vec3, c1: Vec3, radius: Fx) -> bool {
    [a0, a1, a2, a3, c0, c1].into_iter().all(point_in_bounds)
        && shape_in_bounds(radius)
        && segment_in_bounds(a0, a1)
        && segment_in_bounds(a2, a3)
        && displacement_in_bounds(a0, a2)
        && displacement_in_bounds(a1, a3)
        && displacement_in_bounds(c0, c1)
}

fn valid_capsule_sweep(
    a0: Vec3, a1: Vec3, a2: Vec3, a3: Vec3,
    c0: Vec3, c1: Vec3, half_height: Fx, radius: Fx,
) -> bool {
    [a0, a1, a2, a3, c0, c1].into_iter().all(point_in_bounds)
        && effective_capsule_radius_in_bounds(radius)
        && segment_in_bounds(a0, a1)
        && segment_in_bounds(a2, a3)
        && displacement_in_bounds(a0, a2)
        && displacement_in_bounds(a1, a3)
        && displacement_in_bounds(c0, c1)
        && shape_in_bounds(half_height)
        && capsule_axis_in_bounds(c0, half_height)
        && capsule_axis_in_bounds(c1, half_height)
}

fn valid_segment_segment_sweep(
    a0: Vec3, a1: Vec3, a2: Vec3, a3: Vec3, radius_a: Fx,
    b0: Vec3, b1: Vec3, b2: Vec3, b3: Vec3, radius_b: Fx,
) -> bool {
    [a0, a1, a2, a3, b0, b1, b2, b3].into_iter().all(point_in_bounds)
        && shape_in_bounds(radius_a)
        && shape_in_bounds(radius_b)
        && [
            (a0, a1), (a2, a3), (b0, b1), (b2, b3),
        ].into_iter().all(|(a, b)| segment_in_bounds(a, b))
        && [
            (a0, a2), (a1, a3), (b0, b2), (b1, b3),
        ].into_iter().all(|(a, b)| displacement_in_bounds(a, b))
}

fn valid_segment_rectangle_sweep(
    a0: Vec3, a1: Vec3, a2: Vec3, a3: Vec3, radius: Fx,
    rectangle0: [Vec3; 4], rectangle1: [Vec3; 4],
) -> bool {
    [a0, a1, a2, a3].into_iter().all(point_in_bounds)
        && shape_in_bounds(radius)
        && segment_in_bounds(a0, a1)
        && segment_in_bounds(a2, a3)
        && displacement_in_bounds(a0, a2)
        && displacement_in_bounds(a1, a3)
        && valid_rectangle(rectangle0)
        && valid_rectangle(rectangle1)
        && (0..4).all(|index| displacement_in_bounds(rectangle0[index], rectangle1[index]))
        && raw_dot(
            rectangle0[1] - rectangle0[0], rectangle1[1] - rectangle1[0],
        ) > 0
        && raw_dot(
            rectangle0[3] - rectangle0[0], rectangle1[3] - rectangle1[0],
        ) > 0
}

fn valid_rectangle(rectangle: [Vec3; 4]) -> bool {
    if !rectangle.into_iter().all(point_in_bounds) {
        return false;
    }
    let side = rectangle[1] - rectangle[0];
    let up = rectangle[3] - rectangle[0];
    side != Vec3::ZERO
        && up != Vec3::ZERO
        && rectangle[0].z == rectangle[1].z
        && rectangle[2].z == rectangle[3].z
        && rectangle[2].z > rectangle[0].z
        && rectangle[2] - rectangle[3] == side
        && rectangle[2] - rectangle[1] == up
        && raw_dot(side, up) == 0
        && rectangle_edge_in_bounds(rectangle[0], rectangle[1])
        && rectangle_edge_in_bounds(rectangle[0], rectangle[3])
        && raw_cross_nonzero(side, up)
}

fn raw_dot(a: Vec3, b: Vec3) -> i128 {
    RawVec3::of(a).dot(RawVec3::of(b))
}

fn raw_cross_nonzero(a: Vec3, b: Vec3) -> bool {
    let a = RawVec3::of(a);
    let b = RawVec3::of(b);
    a.y * b.z - a.z * b.y != 0
        || a.z * b.x - a.x * b.z != 0
        || a.x * b.y - a.y * b.x != 0
}

fn point_in_bounds(point: Vec3) -> bool {
    [point.x, point.y, point.z].into_iter()
        .all(|v| (v.raw() as i128).abs() <= POINT_LIMIT_RAW)
}

fn shape_in_bounds(value: Fx) -> bool {
    value.raw() >= 0 && value.raw() as i128 <= SHAPE_LIMIT_RAW
}

fn effective_capsule_radius_in_bounds(value: Fx) -> bool {
    value.raw() >= 0 && value.raw() as i128 <= EFFECTIVE_CAPSULE_RADIUS_LIMIT_RAW
}

fn capsule_axis_in_bounds(centre: Vec3, half_height: Fx) -> bool {
    let z = centre.z.raw() as i128;
    let h = half_height.raw() as i128;
    z - h >= -POINT_LIMIT_RAW && z + h <= POINT_LIMIT_RAW
}

fn segment_in_bounds(a: Vec3, b: Vec3) -> bool {
    raw_distance_sq(a, b) <= SHAPE_LIMIT_RAW * SHAPE_LIMIT_RAW
}

fn rectangle_edge_in_bounds(a: Vec3, b: Vec3) -> bool {
    raw_distance_sq(a, b) <= RECTANGLE_EDGE_LIMIT_RAW * RECTANGLE_EDGE_LIMIT_RAW
}

fn displacement_in_bounds(a: Vec3, b: Vec3) -> bool {
    raw_distance_sq(a, b) <= DISPLACEMENT_LIMIT_RAW * DISPLACEMENT_LIMIT_RAW
}

fn raw_distance_sq(a: Vec3, b: Vec3) -> i128 {
    let d = RawVec3::of(a).sub(RawVec3::of(b));
    d.x * d.x + d.y * d.y + d.z * d.z
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tick_32_pair() -> ([Vec3; 8], Fx, Fx) {
        let point = |raw: [i32; 3]| Vec3::new(Fx::from_raw(raw[0]),
            Fx::from_raw(raw[1]), Fx::from_raw(raw[2]));
        ([[678151,451563,26213], [799703,500607,26213],
          [677638,452743,26213], [796458,508077,26213],
          [786432,524288,0], [786432,524288,52428],
          [786432,524288,0], [786432,524288,52428]].map(point),
         Fx::from_raw(2621), Fx::from_raw(19660))
    }

    fn reflect_tick_32(points: [Vec3; 8]) -> [Vec3; 8] {
        points.map(|point| Vec3::new(point.x,
            Fx::from_raw(1_048_576 - point.y.raw()), point.z))
    }

    fn sweep(points: [Vec3; 8], ar: Fx, br: Fx) -> TimeOfImpact {
        swept_segment_segment(points[0], points[1], points[2], points[3], ar,
            points[4], points[5], points[6], points[7], br).unwrap()
    }

    #[test]
    fn tick_32_reflected_segment_pair_returns_one_exact_toi() {
        let (plain, ar, br) = tick_32_pair();
        let mirror = reflect_tick_32(plain);
        assert_eq!((sweep(plain, ar, br).get().raw(), sweep(mirror, ar, br).get().raw()),
                   (38_127, 38_127));
        let plain_key = (0u32, 1u8, 1u32, u8::MAX, 2u8, 4u8);
        let mirror_key = (0u32, 0u8, 1u32, u8::MAX, 2u8, 4u8);
        let mapped_mirror_key = (mirror_key.0, 1 - mirror_key.1, mirror_key.2,
                                 mirror_key.3, mirror_key.4, mirror_key.5);
        assert_eq!(plain_key, mapped_mirror_key,
                   "mapping swaps the held slot 0->1 and preserves body/kind/region");
    }

    #[test]
    fn shared_origin_preserves_the_exact_tick_32_toi_reflection() {
        let (plain, ar, br) = tick_32_pair();
        let mirror = reflect_tick_32(plain);
        let relative = |points: [Vec3; 8]| {
            let origin = points[0]; points.map(|point| point - origin)
        };
        assert_eq!((sweep(relative(plain), ar, br).get().raw(),
                    sweep(relative(mirror), ar, br).get().raw()), (38_127, 38_127));
    }

    #[test]
    fn reflected_segment_sweep_iterations_match_word_for_word() {
        let (plain, ar, br) = tick_32_pair();
        let mirror = reflect_tick_32(plain);
        let traced = |p: [Vec3; 8]| swept_segment_segment_iteration_trace(
            p[0], p[1], p[2], p[3], ar, p[4], p[5], p[6], p[7], br);
        let (_, left) = traced(plain); let (_, right) = traced(mirror);
        assert_eq!(left[0].unwrap().entry_time_raw, 0);
        assert_eq!(left[1].unwrap().entry_time_raw, 37_379);
        for point in 0..4 {
            assert_eq!(left[0].unwrap().endpoints[point].y.raw()
                     + right[0].unwrap().endpoints[point].y.raw(), 1_048_576);
        }
        for (plain, mirror) in left.iter().flatten().zip(right.iter().flatten()) {
            assert_eq!(plain.entry_time_raw, mirror.entry_time_raw);
            assert_eq!(plain.exit_time_raw, mirror.exit_time_raw);
            assert_eq!(plain.distance_raw, mirror.distance_raw);
            assert_eq!(plain.distance_sq_raw, mirror.distance_sq_raw);
            assert_eq!(plain.separation_raw, mirror.separation_raw);
            assert_eq!(plain.decision, mirror.decision);
            for point in 0..4 {
                assert_eq!(plain.endpoints[point].x, mirror.endpoints[point].x);
                assert_eq!(plain.endpoints[point].y.raw()
                         + mirror.endpoints[point].y.raw(), 1_048_576);
                assert_eq!(plain.endpoints[point].z, mirror.endpoints[point].z);
            }
        }
    }

    #[test]
    fn reflected_lerp_is_exact_at_plus_minus_1180_times_37379() {
        let t = Fx::from_raw(37_379);
        let positive = reflected_lerp(Vec3::ZERO,
            Vec3::new(Fx::ZERO, Fx::from_raw(1_180), Fx::ZERO), t);
        let negative = reflected_lerp(Vec3::ZERO,
            Vec3::new(Fx::ZERO, Fx::from_raw(-1_180), Fx::ZERO), t);
        assert_eq!((positive.y.raw(), negative.y.raw()), (673, -673));
    }

    #[test]
    fn iteration_provenance_is_fixed_bounded_and_does_not_change_the_answer() {
        let (plain, ar, br) = tick_32_pair();
        let (answer, rows) = swept_segment_segment_iteration_trace(
            plain[0], plain[1], plain[2], plain[3], ar,
            plain[4], plain[5], plain[6], plain[7], br);
        assert_eq!(rows.len(), SWEEP_ADVANCES);
        let visited: Vec<_> = rows.iter().flatten().map(|row| row.index).collect();
        assert_eq!(visited, (0..visited.len()).collect::<Vec<_>>());
        assert_eq!(answer, Some(sweep(plain, ar, br)));
    }

    fn p(x: i32, y: i32, z: i32) -> Vec3 { Vec3::from_ints(x, y, z) }

    #[test]
    fn crossed_segments_choose_the_crossing() {
        let hit = closest_points_on_segments(p(0, 0, 0), p(4, 0, 0), p(2, -2, 0), p(2, 2, 0));
        assert_eq!(hit, ClosestPoints { a: p(2, 0, 0), b: p(2, 0, 0), distance_sq: Fx::ZERO });
    }

    #[test]
    fn parallel_and_coincident_segments_choose_the_documented_pair() {
        let parallel = closest_points_on_segments(p(0, 0, 0), p(4, 0, 0), p(0, 1, 0), p(4, 1, 0));
        assert_eq!(parallel, ClosestPoints { a: p(0, 0, 0), b: p(0, 1, 0), distance_sq: Fx::ONE });
        let coincident = closest_points_on_segments(p(0, 0, 0), p(4, 0, 0), p(3, 0, 0), p(1, 0, 0));
        assert_eq!(coincident.a, p(1, 0, 0));
        assert_eq!(coincident.b, p(1, 0, 0));
    }

    #[test]
    fn zero_length_segments_are_points() {
        let hit = closest_points_on_segments(p(3, 2, 0), p(3, 2, 0), p(0, 0, 0), p(4, 0, 0));
        assert_eq!(hit, ClosestPoints { a: p(3, 2, 0), b: p(3, 0, 0), distance_sq: Fx::from_int(4) });
        let both = closest_points_on_segments(p(1, 2, 3), p(1, 2, 3), p(4, 5, 6), p(4, 5, 6));
        assert_eq!((both.a, both.b), (p(1, 2, 3), p(4, 5, 6)));
    }

    #[test]
    fn closest_pair_ties_break_lexicographically() {
        let hit = closest_points_on_segments(p(4, 0, 0), p(0, 0, 0), p(4, 1, 0), p(0, 1, 0));
        assert_eq!((hit.a, hit.b), (p(0, 0, 0), p(0, 1, 0)));
    }

    #[test]
    fn segment_plane_handles_endpoints_coincidence_and_a_zero_normal() {
        assert_eq!(segment_plane(p(0, 0, -1), p(0, 0, 3), Vec3::ZERO, Vec3::Z), Some(TimeOfImpact::new_clamped(Fx::from_ratio(1, 4))));
        assert_eq!(segment_plane(Vec3::ZERO, p(0, 0, 1), Vec3::ZERO, Vec3::Z), Some(TimeOfImpact::ZERO));
        assert_eq!(segment_plane(p(0, 0, 1), Vec3::ZERO, Vec3::ZERO, Vec3::Z), Some(TimeOfImpact::ONE));
        assert_eq!(segment_plane(Vec3::ZERO, Vec3::ZERO, Vec3::ZERO, Vec3::ZERO), None);
        assert_eq!(segment_plane(p(0, 0, 1), p(0, 0, 2), Vec3::ZERO, Vec3::Z), None);
    }

    #[test]
    fn segment_plane_reversal_complements_the_time() {
        let a = Vec3::new(Fx::ZERO, Fx::ZERO, Fx::from_int(-2));
        let b = Vec3::new(Fx::ZERO, Fx::ZERO, Fx::from_int(5));
        let forward = segment_plane(a, b, Vec3::ZERO, Vec3::Z).unwrap().get();
        let reverse = segment_plane(b, a, Vec3::ZERO, Vec3::Z).unwrap().get();
        assert!((forward + reverse - Fx::ONE).abs() <= Fx::EPSILON);
    }

    #[test]
    fn a_swept_segment_cannot_tunnel_through_a_sphere_or_capsule() {
        let want = Fx::from_ratio(3, 8);
        let sphere = swept_segment_sphere(
            p(0, -1, 0), p(0, 1, 0), p(4, -1, 0), p(4, 1, 0),
            p(2, 0, 0), p(2, 0, 0), Fx::HALF,
        ).unwrap().get();
        assert!(sphere <= want && want - sphere <= Fx::EPSILON, "{sphere}");
        let capsule = swept_segment_vertical_capsule(
            p(0, 0, 1), p(0, 0, 1), p(4, 0, 1), p(4, 0, 1),
            p(2, 0, 1), p(2, 0, 1), Fx::ONE, Fx::HALF,
        ).unwrap().get();
        assert!(capsule <= want && want - capsule <= Fx::EPSILON, "{capsule}");
    }

    #[test]
    fn tangent_and_zero_length_sweeps_have_stable_answers() {
        assert_eq!(
            swept_segment_sphere(p(0, -1, 0), p(0, 1, 0), p(0, -1, 0), p(0, 1, 0), p(1, 0, 0), p(1, 0, 0), Fx::ONE),
            Some(TimeOfImpact::ZERO),
        );
        assert_eq!(
            swept_segment_sphere(p(0, 0, 0), p(0, 0, 0), p(4, 0, 0), p(4, 0, 0), p(2, 0, 0), p(2, 0, 0), Fx::HALF),
            Some(TimeOfImpact::new_clamped(Fx::from_ratio(3, 8))),
        );
    }

    #[test]
    fn stationary_separated_sweeps_have_no_contact() {
        assert_eq!(swept_segment_sphere(p(0, 0, 0), p(0, 1, 0), p(0, 0, 0), p(0, 1, 0), p(4, 0, 0), p(4, 0, 0), Fx::HALF), None);
        assert_eq!(swept_segment_vertical_capsule(p(0, 0, 0), p(0, 1, 0), p(0, 0, 0), p(0, 1, 0), p(4, 0, 0), p(4, 0, 0), Fx::ONE, Fx::HALF), None);
    }

    #[test]
    fn conservative_sweeps_finish_inside_the_iteration_cap() {
        let (_, advances, exhausted) = conservative_sweep_audited(
            Fx::EPSILON,
            Fx::ZERO,
            |_| Fx::from_int(256),
        );
        assert!(!exhausted);
        assert_eq!(advances, 1);
        assert_eq!(
            swept_segment_sphere(
                Vec3::ZERO, Vec3::ZERO,
                Vec3::new(Fx::EPSILON, Fx::ZERO, Fx::ZERO),
                Vec3::new(Fx::EPSILON, Fx::ZERO, Fx::ZERO),
                p(256, 0, 0), p(256, 0, 0), Fx::ZERO,
            ),
            None,
        );

        let scalars = [Fx::MIN, -Fx::ONE, Fx::ZERO, Fx::EPSILON, Fx::ONE, Fx::MAX];
        for argument in 0..6 {
            for component in 0..3 {
                for scalar in scalars {
                    let mut args = [Vec3::ZERO; 6];
                    args[argument] = one_hot(component, scalar);
                    assert!(!swept_segment_sphere_audited(
                        args[0], args[1], args[2], args[3], args[4], args[5], Fx::ZERO,
                    ).2);
                    assert!(!swept_segment_vertical_capsule_audited(
                        args[0], args[1], args[2], args[3], args[4], args[5],
                        Fx::ZERO, Fx::ZERO,
                    ).2);
                }
            }
        }
        for scalar in scalars {
            assert!(!swept_segment_sphere_audited(
                Vec3::ZERO, Vec3::ZERO, Vec3::ZERO, Vec3::ZERO,
                Vec3::ZERO, Vec3::ZERO, scalar,
            ).2);
            assert!(!swept_segment_vertical_capsule_audited(
                Vec3::ZERO, Vec3::ZERO, Vec3::ZERO, Vec3::ZERO,
                Vec3::ZERO, Vec3::ZERO, scalar, Fx::ZERO,
            ).2);
            assert!(!swept_segment_vertical_capsule_audited(
                Vec3::ZERO, Vec3::ZERO, Vec3::ZERO, Vec3::ZERO,
                Vec3::ZERO, Vec3::ZERO, Fx::ZERO, scalar,
            ).2);
        }
        for argument in 0..8 {
            for component in 0..3 {
                for scalar in scalars {
                    let mut args = [Vec3::ZERO; 8];
                    args[argument] = one_hot(component, scalar);
                    assert!(!swept_segment_segment_audited(
                        args[0], args[1], args[2], args[3], Fx::ZERO,
                        args[4], args[5], args[6], args[7], Fx::ZERO,
                    ).2);
                }
            }
        }
        for scalar in scalars {
            assert!(!swept_segment_segment_audited(
                Vec3::ZERO, Vec3::ZERO, Vec3::ZERO, Vec3::ZERO, scalar,
                Vec3::ZERO, Vec3::ZERO, Vec3::ZERO, Vec3::ZERO, Fx::ZERO,
            ).2);
            assert!(!swept_segment_segment_audited(
                Vec3::ZERO, Vec3::ZERO, Vec3::ZERO, Vec3::ZERO, Fx::ZERO,
                Vec3::ZERO, Vec3::ZERO, Vec3::ZERO, Vec3::ZERO, scalar,
            ).2);
        }
        let unit_rectangle = [p(0, -1, -1), p(0, 1, -1), p(0, 1, 1), p(0, -1, 1)];
        for argument in 0..4 {
            for component in 0..3 {
                for scalar in scalars {
                    let mut args = [Vec3::ZERO; 4];
                    args[argument] = one_hot(component, scalar);
                    assert!(!swept_segment_rectangle_audited(
                        args[0], args[1], args[2], args[3], Fx::ZERO,
                        unit_rectangle, unit_rectangle,
                    ).2);
                }
            }
        }
        for component in 0..3 {
            for scalar in [-Fx::ONE, Fx::EPSILON, Fx::ONE] {
                let translation = one_hot(component, scalar);
                let translated = unit_rectangle.map(|corner| corner + translation);
                assert!(!swept_segment_rectangle_audited(
                    Vec3::ZERO, Vec3::ZERO, Vec3::ZERO, Vec3::ZERO, Fx::ZERO,
                    unit_rectangle, translated,
                ).2);
            }
        }
        for bits in 0..8 {
            let corner = Vec3::from_ints(
                if bits & 1 == 0 { -256 } else { 256 },
                if bits & 2 == 0 { -256 } else { 256 },
                if bits & 4 == 0 { -256 } else { 256 },
            );
            assert!(!swept_segment_sphere_audited(
                corner, corner, corner, corner, corner, corner, Fx::ZERO,
            ).2);
            assert!(!swept_segment_vertical_capsule_audited(
                corner, corner, corner, corner, corner, corner, Fx::ZERO, Fx::ZERO,
            ).2);
        }
        for component in 0..3 {
            for scalar in [Fx::from_int(-4), Fx::from_int(4)] {
                let displacement = one_hot(component, scalar);
                let target = one_hot(component, Fx::from_int(2) * if scalar < Fx::ZERO { -Fx::ONE } else { Fx::ONE });
                assert!(!swept_segment_sphere_audited(
                    Vec3::ZERO, Vec3::ZERO, displacement, displacement,
                    target, target, Fx::HALF,
                ).2);
                assert!(!swept_segment_vertical_capsule_audited(
                    Vec3::ZERO, Vec3::ZERO, displacement, displacement,
                    target, target, Fx::ZERO, Fx::HALF,
                ).2);
                assert!(!swept_segment_segment_audited(
                    Vec3::ZERO, Vec3::ZERO, displacement, displacement, Fx::ZERO,
                    target, target, target, target, Fx::ZERO,
                ).2);
            }
        }
        assert!(!swept_segment_segment_audited(
            Vec3::ZERO, Vec3::ZERO, p(2, 0, 0), p(2, 0, 0), Fx::ZERO,
            p(1, 0, 0), p(1, 0, 0), p(1, 0, 0), p(1, 0, 0), Fx::ZERO,
        ).2);
        let rectangle = [p(0, -8, -8), p(0, 8, -8), p(0, 8, 8), p(0, -8, 8)];
        assert!(!swept_segment_rectangle_audited(
            p(1, 0, 0), p(1, 0, 0), p(-1, 0, 0), p(-1, 0, 0), Fx::ZERO,
            rectangle, rectangle,
        ).2);
    }

    #[test]
    fn out_of_contract_sweeps_fail_conservatively_to_zero() {
        let too_far = Vec3::from_ints(257, 0, 0);
        let too_negative = Vec3::from_ints(-257, 0, 0);
        assert_eq!(swept_segment_sphere(too_far, too_far, too_far, too_far, Vec3::ZERO, Vec3::ZERO, Fx::ONE), Some(TimeOfImpact::ZERO));
        assert_eq!(swept_segment_sphere(too_negative, too_negative, too_negative, too_negative, Vec3::ZERO, Vec3::ZERO, Fx::ONE), Some(TimeOfImpact::ZERO));
        assert_eq!(swept_segment_sphere(Vec3::ZERO, Vec3::ZERO, Vec3::ZERO, Vec3::ZERO, Vec3::ZERO, Vec3::ZERO, -Fx::EPSILON), Some(TimeOfImpact::ZERO));
        assert_eq!(swept_segment_sphere(Vec3::ZERO, Vec3::ZERO, Vec3::ZERO, Vec3::ZERO, Vec3::ZERO, Vec3::ZERO, Fx::from_int(9)), Some(TimeOfImpact::ZERO));
        assert_eq!(swept_segment_vertical_capsule(Vec3::ZERO, Vec3::ZERO, Vec3::ZERO, Vec3::ZERO, Vec3::ZERO, Vec3::ZERO, -Fx::EPSILON, Fx::ONE), Some(TimeOfImpact::ZERO));
        assert_eq!(swept_segment_vertical_capsule(Vec3::ZERO, Vec3::ZERO, Vec3::ZERO, Vec3::ZERO, Vec3::ZERO, Vec3::ZERO, Fx::from_int(9), Fx::ZERO), Some(TimeOfImpact::ZERO));
        assert_eq!(swept_segment_vertical_capsule(Vec3::ZERO, Vec3::ZERO, Vec3::ZERO, Vec3::ZERO, p(0, 0, 256), p(0, 0, 256), Fx::EPSILON, Fx::ZERO), Some(TimeOfImpact::ZERO));
        assert_eq!(swept_segment_sphere(Vec3::ZERO, Vec3::ZERO, p(5, 0, 0), p(5, 0, 0), Vec3::ZERO, Vec3::ZERO, Fx::ONE), Some(TimeOfImpact::ZERO));
        assert_eq!(swept_segment_sphere(Vec3::ZERO, Vec3::ZERO, Vec3::ZERO, Vec3::ZERO, Vec3::ZERO, p(5, 0, 0), Fx::ONE), Some(TimeOfImpact::ZERO));
        assert_eq!(swept_segment_sphere(Vec3::ZERO, p(9, 0, 0), Vec3::ZERO, p(9, 0, 0), Vec3::ZERO, Vec3::ZERO, Fx::ONE), Some(TimeOfImpact::ZERO));
    }

    #[test]
    fn rational_point_construction_does_not_overflow_before_dividing() {
        let ratio = Ratio::new(i128::MAX - 1, i128::MAX);
        assert_eq!(multiply_ratio(i32::MAX as i128, ratio), i32::MAX as i128 - 1);
        assert_eq!(multiply_ratio(i32::MIN as i128, ratio), i32::MIN as i128 + 1);
        let third = Ratio::new(1, 3);
        assert_eq!(multiply_ratio(10, third), 3);
        assert_eq!(multiply_ratio(-10, third), -3);
    }

    #[test]
    fn hand_built_geometry_outputs_have_the_documented_digest() {
        let expected_closest = [
            ClosestPoints { a: p(2, 0, 0), b: p(2, 0, 0), distance_sq: Fx::ZERO },
            ClosestPoints { a: p(0, 0, 0), b: p(0, 1, 0), distance_sq: Fx::ONE },
            ClosestPoints { a: p(1, 0, 0), b: p(1, 0, 0), distance_sq: Fx::ZERO },
            ClosestPoints { a: p(3, 2, 0), b: p(3, 0, 0), distance_sq: Fx::from_int(4) },
        ];
        let expected_toi = [
            Some(TimeOfImpact::new_clamped(Fx::from_ratio(3, 8))),
            Some(TimeOfImpact::ZERO),
            Some(TimeOfImpact::new_clamped(Fx::from_ratio(3, 8))),
            Some(TimeOfImpact::new_clamped(Fx::from_ratio(1, 4))),
            Some(TimeOfImpact::new_clamped(Fx::HALF)),
            Some(TimeOfImpact::new_clamped(Fx::HALF)),
        ];
        assert_eq!(frozen_closest_outputs(), expected_closest);
        assert_eq!(frozen_toi_outputs(), expected_toi);
        assert_eq!(combat_geometry_digest(), 0x9d15_3448_83cf_6e9c);
    }

    #[test]
    fn geometry_results_match_across_threads_native_and_wasm() {
        let expected = combat_geometry_digest();
        let boundary = combat_geometry_boundary_digest();
        std::thread::scope(|scope| {
            let handles: Vec<_> = (0..8)
                .map(|_| scope.spawn(|| (combat_geometry_digest(), combat_geometry_boundary_digest())))
                .collect();
            for handle in handles {
                assert_eq!(handle.join().unwrap(), (expected, boundary));
            }
        });
        // The release-wasm half calls this same exported writer through the
        // narrow `combat_geometry_digest_lo/hi` host probe.
        assert_eq!(expected, 0x9d15_3448_83cf_6e9c);
    }

    #[test]
    fn moving_segments_use_the_shared_conservative_advance() {
        let hit = swept_segment_segment(
            Vec3::ZERO, Vec3::ZERO, p(2, 0, 0), p(2, 0, 0), Fx::ZERO,
            p(1, 0, 0), p(1, 0, 0), p(1, 0, 0), p(1, 0, 0), Fx::ZERO,
        );
        assert_eq!(hit, Some(TimeOfImpact::new_clamped(Fx::HALF)));
        assert_eq!(swept_segment_segment(
            Vec3::ZERO, Vec3::ZERO, Vec3::ZERO, Vec3::ZERO, Fx::ZERO,
            p(1, 0, 0), p(1, 0, 0), p(1, 0, 0), p(1, 0, 0), Fx::ZERO,
        ), None);
    }

    #[test]
    fn maximum_weapon_and_body_radii_remain_an_accepted_capsule_sweep() {
        let result = swept_segment_vertical_capsule_audited(
            p(17, 0, 0), p(17, 0, 0), p(13, 0, 0), p(13, 0, 0),
            Vec3::ZERO, Vec3::ZERO, Fx::from_int(8), Fx::from_int(16),
        );
        assert_eq!(result.0, Some(TimeOfImpact::new_clamped(Fx::from_ratio(1, 4))));
        assert!(!result.2);
        assert_eq!(swept_segment_vertical_capsule(
            p(17, 0, 0), p(17, 0, 0), p(13, 0, 0), p(13, 0, 0),
            Vec3::ZERO, Vec3::ZERO, Fx::from_int(8), Fx::from_raw(16 * ONE_RAW + 1),
        ), Some(TimeOfImpact::ZERO));
    }

    #[test]
    fn a_moving_finite_rectangle_has_one_exact_feature_order() {
        let rectangle = [p(0, -1, -1), p(0, 1, -1), p(0, 1, 1), p(0, -1, 1)];
        let hit = swept_segment_rectangle(
            p(1, 0, 0), p(1, 0, 0), p(-1, 0, 0), p(-1, 0, 0), Fx::ZERO,
            rectangle, rectangle,
        );
        assert_eq!(hit, Some(TimeOfImpact::new_clamped(Fx::HALF)));
        let closest = closest_points_segment_rectangle(Vec3::ZERO, Vec3::ZERO, rectangle);
        assert_eq!(closest, SegmentRectangleClosest {
            a: Vec3::ZERO,
            b: Vec3::ZERO,
            distance_sq: Fx::ZERO,
            feature: 0,
            segment_parameter: TimeOfImpact::ZERO,
            side_parameter: TimeOfImpact::new_clamped(Fx::HALF),
            up_parameter: TimeOfImpact::new_clamped(Fx::HALF),
        });
    }

    #[test]
    fn segment_rectangle_closest_points_publish_all_frozen_fractions() {
        let rectangle = [p(0, -1, -1), p(0, 1, -1), p(0, 1, 1), p(0, -1, 1)];
        let endpoint = closest_points_segment_rectangle(p(1, 2, 0), p(2, 2, 0), rectangle);
        assert_eq!(endpoint.feature, 1);
        assert_eq!(endpoint.segment_parameter, TimeOfImpact::ZERO);
        assert_eq!(endpoint.side_parameter, TimeOfImpact::ONE);
        assert_eq!(endpoint.up_parameter, TimeOfImpact::new_clamped(Fx::HALF));

        // The bottom-left corner is shared by endpoint projection, left edge,
        // and bottom edge. Feature order, not candidate visitation accidents,
        // owns the tie.
        let tie = closest_points_segment_rectangle(p(1, -2, -2), p(2, -2, -2), rectangle);
        assert_eq!(tie.feature, 1);
        assert_eq!((tie.side_parameter, tie.up_parameter), (TimeOfImpact::ZERO, TimeOfImpact::ZERO));
    }

    #[test]
    fn malformed_rectangles_and_bounds_fail_conservatively() {
        let malformed = [Vec3::ZERO; 4];
        let closest = closest_points_segment_rectangle(p(1, 0, 0), p(2, 0, 0), malformed);
        assert_eq!(closest.feature, u8::MAX);
        assert_eq!((closest.a, closest.b), (p(1, 0, 0), Vec3::ZERO));
        assert_eq!(closest.segment_parameter, TimeOfImpact::ZERO);
        assert_eq!(swept_segment_rectangle(
            p(1, 0, 0), p(1, 0, 0), p(-1, 0, 0), p(-1, 0, 0), Fx::ZERO,
            malformed, malformed,
        ), Some(TimeOfImpact::ZERO));
        assert_eq!(swept_segment_segment(
            p(257, 0, 0), p(257, 0, 0), p(257, 0, 0), p(257, 0, 0), Fx::ZERO,
            Vec3::ZERO, Vec3::ZERO, Vec3::ZERO, Vec3::ZERO, Fx::ZERO,
        ), Some(TimeOfImpact::ZERO));
        assert_eq!(swept_segment_segment(
            Vec3::ZERO, Vec3::ZERO, Vec3::ZERO, Vec3::ZERO, -Fx::EPSILON,
            Vec3::ZERO, Vec3::ZERO, Vec3::ZERO, Vec3::ZERO, Fx::ZERO,
        ), Some(TimeOfImpact::ZERO));
    }

    #[test]
    fn rectangle_validation_uses_widened_orientation_and_endpoint_agreement() {
        let e = Fx::EPSILON;
        let tiny = [
            Vec3::ZERO,
            Vec3::new(Fx::ZERO, e, Fx::ZERO),
            Vec3::new(Fx::ZERO, e, e),
            Vec3::new(Fx::ZERO, Fx::ZERO, e),
        ];
        let tiny_closest = closest_points_segment_rectangle(Vec3::ZERO, Vec3::ZERO, tiny);
        assert_eq!(tiny_closest.feature, 0);
        assert_eq!((tiny_closest.a, tiny_closest.b), (Vec3::ZERO, Vec3::ZERO));
        assert_eq!(
            swept_segment_rectangle(
                Vec3::new(e, Fx::ZERO, Fx::ZERO), Vec3::new(e, Fx::ZERO, Fx::ZERO),
                Vec3::new(-e, Fx::ZERO, Fx::ZERO), Vec3::new(-e, Fx::ZERO, Fx::ZERO), Fx::ZERO,
                tiny, tiny,
            ),
            Some(TimeOfImpact::new_clamped(Fx::HALF)),
        );

        let maximum = [p(0, -8, -8), p(0, 8, -8), p(0, 8, 8), p(0, -8, 8)];
        assert_eq!(
            closest_points_segment_rectangle(Vec3::ZERO, Vec3::ZERO, maximum).feature,
            0,
        );

        let forward = [p(0, -1, -1), p(0, 1, -1), p(0, 1, 1), p(0, -1, 1)];
        let reversed = [p(0, 1, -1), p(0, -1, -1), p(0, -1, 1), p(0, 1, 1)];
        assert_eq!(
            swept_segment_rectangle(
                p(1, 0, 0), p(1, 0, 0), p(1, 0, 0), p(1, 0, 0), Fx::ZERO,
                forward, reversed,
            ),
            Some(TimeOfImpact::ZERO),
        );

        let flat = [p(0, -1, 0), p(0, 1, 0), p(0, 1, 0), p(0, -1, 0)];
        assert_eq!(closest_points_segment_rectangle(Vec3::ZERO, Vec3::ZERO, flat).feature, u8::MAX);
    }

    #[test]
    fn the_new_geometry_rows_extend_the_portable_digest() {
        let outputs = frozen_toi_outputs();
        assert_eq!(outputs[4], Some(TimeOfImpact::new_clamped(Fx::HALF)));
        assert_eq!(outputs[5], Some(TimeOfImpact::new_clamped(Fx::HALF)));
        assert_eq!(combat_geometry_digest(), 0x9d15_3448_83cf_6e9c);
    }
}
