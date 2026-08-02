use crate::fixed::Fx;
use crate::sin_table::SIN_TABLE;
use core::fmt;
use core::ops::{Add, Neg, Sub};

/// A binary angle: the full turn is exactly `65536` units, so angles wrap for
/// free and never accumulate representation error.
///
/// `0` is the `+x` axis and the sense is counter-clockwise with `+y` up.
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Default)]
pub struct Angle(u16);

/// Angle units in a full turn.
pub const FULL_TURN: u32 = 1 << 16;

/// `round(v / 64)`, rounding halves away from zero so the result is an odd
/// function of `v`.
#[inline]
const fn round_shift_6(v: i32) -> i32 {
    if v >= 0 {
        (v + 32) >> 6
    } else {
        -((-v + 32) >> 6)
    }
}

impl Angle {
    pub const ZERO: Angle = Angle(0);
    pub const QUARTER: Angle = Angle(16_384);
    pub const HALF: Angle = Angle(32_768);
    pub const THREE_QUARTER: Angle = Angle(49_152);

    #[inline]
    pub const fn from_raw(raw: u16) -> Angle {
        Angle(raw)
    }

    #[inline]
    pub const fn raw(self) -> u16 {
        self.0
    }

    #[inline]
    pub const fn from_degrees(deg: i32) -> Angle {
        Angle(((deg as i64 * FULL_TURN as i64 / 360) & 0xFFFF) as u16)
    }

    /// Rounded to the nearest degree, in `0..360`.
    #[inline]
    pub const fn to_degrees(self) -> i32 {
        ((self.0 as i64 * 360 + (FULL_TURN as i64 / 2)) / FULL_TURN as i64) as i32 % 360
    }

    /// Sine, via table lookup with linear interpolation over the low 6 bits.
    ///
    /// The interpolation error of a 1024-point table is about `h^2/8 = 4.7e-6`,
    /// which is below the resolution of [`Fx`] itself.
    ///
    /// The weighted sum is rounded half-away-from-zero rather than shifted.
    /// That is not a style choice: an arithmetic shift rounds toward negative
    /// infinity, which would make `sin(-a)` differ from `-sin(a)` by one raw
    /// unit for most angles. Sign-magnitude rounding makes the identity exact,
    /// and exact symmetries are what keep mirrored scenarios from diverging.
    #[inline]
    pub fn sin(self) -> Fx {
        let i = (self.0 >> 6) as usize;
        let frac = (self.0 & 63) as i32;
        let a = SIN_TABLE[i];
        let b = SIN_TABLE[(i + 1) & 1023];
        Fx::from_raw(round_shift_6(a * (64 - frac) + b * frac))
    }

    #[inline]
    pub fn cos(self) -> Fx {
        (self + Angle::QUARTER).sin()
    }

    /// Shortest signed difference `self - other`, in `-32768..=32767` units.
    #[inline]
    pub fn delta(self, other: Angle) -> i32 {
        (self.0.wrapping_sub(other.0)) as i16 as i32
    }
}

impl Add for Angle {
    type Output = Angle;
    #[inline]
    fn add(self, rhs: Angle) -> Angle {
        Angle(self.0.wrapping_add(rhs.0))
    }
}

impl Sub for Angle {
    type Output = Angle;
    #[inline]
    fn sub(self, rhs: Angle) -> Angle {
        Angle(self.0.wrapping_sub(rhs.0))
    }
}

impl Neg for Angle {
    type Output = Angle;
    #[inline]
    fn neg(self) -> Angle {
        Angle(self.0.wrapping_neg())
    }
}

impl fmt::Debug for Angle {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}deg", self.to_degrees())
    }
}

// atan(z) ~= (pi/4)z - z(z-1)(0.2447 + 0.0663z)  for z in [0, 1]
//
// Rajan's approximation. Max error is about 0.0015 rad (0.09 degrees), which
// is fine for aiming and bearing features, and unlike a libm atan2 it is
// identical on every target. Constants are pre-scaled from radians into angle
// units (1 rad = 65536/2pi = 10430.378 units).
const C_PI_4: Fx = Fx::from_int(8192); // pi/4 in angle units
const C0: Fx = Fx::from_ratio(25_523, 10); // 0.2447 * 10430.378
const C1: Fx = Fx::from_ratio(6_915, 10); // 0.0663 * 10430.378

/// `atan(z)` in angle units for `z` in `[0, 1]`; result is `0..=8192`.
fn atan_unit(z: Fx) -> i32 {
    let t = z * (z - Fx::ONE); // <= 0 over the domain
    let poly = C0 + C1 * z;
    (C_PI_4 * z - t * poly).round_int()
}

/// Deterministic `atan2`. Returns the bearing of `(x, y)` from the `+x` axis.
///
/// `atan2(0, 0)` is [`Angle::ZERO`] rather than an error -- the sim must be
/// total, and callers that care about the degenerate case check the length.
pub fn atan2(y: Fx, x: Fx) -> Angle {
    let xr = x.raw() as i64;
    let yr = y.raw() as i64;
    if xr == 0 && yr == 0 {
        return Angle::ZERO;
    }

    let ax = xr.abs();
    let ay = yr.abs();

    // Fold into the first octant so the polynomial only ever sees z in [0, 1].
    let first_quadrant = if ax >= ay {
        atan_unit(Fx::from_raw(((ay << 16) / ax) as i32))
    } else {
        16_384 - atan_unit(Fx::from_raw(((ax << 16) / ay) as i32))
    };

    let units = match (xr >= 0, yr >= 0) {
        (true, true) => first_quadrant,
        (true, false) => -first_quadrant,
        (false, true) => 32_768 - first_quadrant,
        (false, false) => first_quadrant - 32_768,
    };
    Angle((units & 0xFFFF) as u16)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cardinal_directions_are_exact() {
        assert_eq!(Angle::ZERO.sin(), Fx::ZERO);
        assert_eq!(Angle::ZERO.cos(), Fx::ONE);
        assert_eq!(Angle::QUARTER.sin(), Fx::ONE);
        assert_eq!(Angle::QUARTER.cos(), Fx::ZERO);
        assert_eq!(Angle::HALF.sin(), Fx::ZERO);
        assert_eq!(Angle::HALF.cos(), -Fx::ONE);
        assert_eq!(Angle::THREE_QUARTER.sin(), -Fx::ONE);
    }

    #[test]
    fn pythagorean_identity_holds_everywhere() {
        // sin^2 + cos^2 == 1 within table + interpolation error.
        let tolerance = Fx::from_ratio(1, 500);
        let mut a: u32 = 0;
        while a < 65536 {
            let ang = Angle::from_raw(a as u16);
            let s = ang.sin();
            let c = ang.cos();
            let err = (s * s + c * c - Fx::ONE).abs();
            assert!(err < tolerance, "angle {a}: err {err}");
            a += 37; // coprime-ish stride, covers the table unevenly on purpose
        }
    }

    #[test]
    fn sin_is_odd_and_cos_is_even() {
        for a in [1u16, 137, 4096, 20000, 45000, 65535] {
            let ang = Angle::from_raw(a);
            assert_eq!((-ang).sin(), -ang.sin(), "sin(-{a})");
            assert_eq!((-ang).cos(), ang.cos(), "cos(-{a})");
        }
    }

    #[test]
    fn atan2_recovers_the_angle_it_was_given() {
        // Round-trip: angle -> unit vector -> atan2 -> angle.
        let mut a: u32 = 0;
        while a < 65536 {
            let ang = Angle::from_raw(a as u16);
            let back = atan2(ang.sin(), ang.cos());
            let err = back.delta(ang).abs();
            // 0.09 deg of approximation error is ~16 angle units; allow 40 to
            // absorb the sine table's own error in the input vector.
            assert!(err <= 40, "angle {a} round-tripped to {back:?} (err {err})");
            a += 101;
        }
    }

    #[test]
    fn atan2_quadrants() {
        let one = Fx::ONE;
        let zero = Fx::ZERO;
        assert_eq!(atan2(zero, one), Angle::ZERO);
        assert_eq!(atan2(one, zero), Angle::QUARTER);
        assert_eq!(atan2(zero, -one), Angle::HALF);
        assert_eq!(atan2(-one, zero), Angle::THREE_QUARTER);
        assert_eq!(atan2(zero, zero), Angle::ZERO);
        // 45 degrees each way
        assert!((atan2(one, one).delta(Angle::from_degrees(45))).abs() <= 40);
        assert!((atan2(one, -one).delta(Angle::from_degrees(135))).abs() <= 40);
        assert!((atan2(-one, -one).delta(Angle::from_degrees(225))).abs() <= 40);
        assert!((atan2(-one, one).delta(Angle::from_degrees(315))).abs() <= 40);
    }

    #[test]
    fn degrees_round_trip() {
        for d in [0, 45, 90, 180, 270, 359] {
            assert_eq!(Angle::from_degrees(d).to_degrees(), d);
        }
    }
}
