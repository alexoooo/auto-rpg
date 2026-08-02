use core::fmt;
use core::ops::{Add, AddAssign, Div, DivAssign, Mul, MulAssign, Neg, Sub, SubAssign};

/// Number of fractional bits in [`Fx`].
pub const FRAC_BITS: u32 = 16;

/// Raw representation of `1.0`.
pub const ONE_RAW: i32 = 1 << FRAC_BITS;

/// A 16.16 signed fixed-point number.
///
/// Range is roughly `-32768.0 ..= 32767.99998`, resolution `1/65536`. All
/// arithmetic saturates rather than wrapping -- see the crate docs for why.
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Default)]
pub struct Fx(i32);

const fn sat(v: i64) -> i32 {
    if v > i32::MAX as i64 {
        i32::MAX
    } else if v < i32::MIN as i64 {
        i32::MIN
    } else {
        v as i32
    }
}

impl Fx {
    pub const ZERO: Fx = Fx(0);
    pub const ONE: Fx = Fx(ONE_RAW);
    pub const HALF: Fx = Fx(ONE_RAW / 2);
    pub const TWO: Fx = Fx(ONE_RAW * 2);
    /// Smallest representable positive value (`1/65536`).
    pub const EPSILON: Fx = Fx(1);
    pub const MIN: Fx = Fx(i32::MIN);
    pub const MAX: Fx = Fx(i32::MAX);

    /// Wraps a raw 16.16 value. Prefer [`Fx::from_int`] / [`Fx::from_ratio`].
    #[inline]
    pub const fn from_raw(raw: i32) -> Fx {
        Fx(raw)
    }

    /// The underlying 16.16 bit pattern. Use this for hashing and
    /// serialisation, never for arithmetic.
    #[inline]
    pub const fn raw(self) -> i32 {
        self.0
    }

    /// Exact conversion from an integer, saturating outside `+/-32768`.
    #[inline]
    pub const fn from_int(i: i32) -> Fx {
        Fx(sat((i as i64) << FRAC_BITS))
    }

    /// `num / den` evaluated at compile time where possible.
    ///
    /// This is the idiomatic way to write a literal: `Fx::from_ratio(15, 10)`
    /// is `1.5`. Truncates toward zero, like integer division.
    #[inline]
    pub const fn from_ratio(num: i32, den: i32) -> Fx {
        Fx(sat(((num as i64) << FRAC_BITS) / den as i64))
    }

    /// Truncates toward negative infinity.
    #[inline]
    pub const fn floor_int(self) -> i32 {
        self.0 >> FRAC_BITS
    }

    /// Rounds half away from negative infinity (i.e. `floor(x + 0.5)`).
    #[inline]
    pub const fn round_int(self) -> i32 {
        ((self.0 as i64 + (ONE_RAW as i64 / 2)) >> FRAC_BITS) as i32
    }

    #[inline]
    pub const fn is_zero(self) -> bool {
        self.0 == 0
    }

    #[inline]
    pub const fn is_positive(self) -> bool {
        self.0 > 0
    }

    #[inline]
    pub const fn abs(self) -> Fx {
        if self.0 == i32::MIN {
            Fx::MAX
        } else if self.0 < 0 {
            Fx(-self.0)
        } else {
            self
        }
    }

    #[inline]
    pub const fn signum(self) -> Fx {
        if self.0 > 0 {
            Fx::ONE
        } else if self.0 < 0 {
            Fx(-ONE_RAW)
        } else {
            Fx::ZERO
        }
    }

    #[inline]
    pub const fn min(self, other: Fx) -> Fx {
        if self.0 <= other.0 {
            self
        } else {
            other
        }
    }

    #[inline]
    pub const fn max(self, other: Fx) -> Fx {
        if self.0 >= other.0 {
            self
        } else {
            other
        }
    }

    #[inline]
    pub const fn clamp(self, lo: Fx, hi: Fx) -> Fx {
        self.max(lo).min(hi)
    }

    /// Exact fixed-point square root by integer bit-search. Negative inputs
    /// return zero rather than panicking -- the sim must be total.
    #[inline]
    pub fn sqrt(self) -> Fx {
        if self.0 <= 0 {
            return Fx::ZERO;
        }
        Fx(isqrt64((self.0 as u64) << FRAC_BITS) as i32)
    }

    /// Linear interpolation; `t` is clamped to `0..=1`.
    #[inline]
    pub fn lerp(a: Fx, b: Fx, t: Fx) -> Fx {
        let t = t.clamp(Fx::ZERO, Fx::ONE);
        a + (b - a) * t
    }

    /// **Presentation only.** The single float conversion in the whole stack;
    /// the result must never influence simulation state.
    #[inline]
    pub fn to_f32(self) -> f32 {
        self.0 as f32 / ONE_RAW as f32
    }
}

/// Integer square root, floor semantics, no floats involved.
///
/// Classic restoring bit-by-bit algorithm: exact for the full `u64` range and
/// identical on every target.
pub fn isqrt64(n: u64) -> u64 {
    if n == 0 {
        return 0;
    }
    let mut x = n;
    let mut c: u64 = 0;
    let mut d: u64 = 1u64 << 62;
    while d > x {
        d >>= 2;
    }
    while d != 0 {
        if x >= c + d {
            x -= c + d;
            c = (c >> 1) + d;
        } else {
            c >>= 1;
        }
        d >>= 2;
    }
    c
}

impl Add for Fx {
    type Output = Fx;
    #[inline]
    fn add(self, rhs: Fx) -> Fx {
        Fx(self.0.saturating_add(rhs.0))
    }
}

impl Sub for Fx {
    type Output = Fx;
    #[inline]
    fn sub(self, rhs: Fx) -> Fx {
        Fx(self.0.saturating_sub(rhs.0))
    }
}

impl Neg for Fx {
    type Output = Fx;
    #[inline]
    fn neg(self) -> Fx {
        Fx(self.0.saturating_neg())
    }
}

impl Mul for Fx {
    type Output = Fx;
    #[inline]
    fn mul(self, rhs: Fx) -> Fx {
        // The >> is an arithmetic shift, so this truncates toward negative
        // infinity. Deterministic, which is all we require.
        Fx(sat((self.0 as i64 * rhs.0 as i64) >> FRAC_BITS))
    }
}

impl Div for Fx {
    type Output = Fx;
    #[inline]
    fn div(self, rhs: Fx) -> Fx {
        if rhs.0 == 0 {
            // Total, not panicking: division by zero saturates in the
            // direction of the numerator. Callers that care must guard.
            return if self.0 >= 0 { Fx::MAX } else { Fx::MIN };
        }
        Fx(sat(((self.0 as i64) << FRAC_BITS) / rhs.0 as i64))
    }
}

impl Mul<i32> for Fx {
    type Output = Fx;
    #[inline]
    fn mul(self, rhs: i32) -> Fx {
        Fx(sat(self.0 as i64 * rhs as i64))
    }
}

impl Div<i32> for Fx {
    type Output = Fx;
    #[inline]
    fn div(self, rhs: i32) -> Fx {
        if rhs == 0 {
            return if self.0 >= 0 { Fx::MAX } else { Fx::MIN };
        }
        Fx(sat(self.0 as i64 / rhs as i64))
    }
}

impl AddAssign for Fx {
    #[inline]
    fn add_assign(&mut self, rhs: Fx) {
        *self = *self + rhs;
    }
}

impl SubAssign for Fx {
    #[inline]
    fn sub_assign(&mut self, rhs: Fx) {
        *self = *self - rhs;
    }
}

impl MulAssign for Fx {
    #[inline]
    fn mul_assign(&mut self, rhs: Fx) {
        *self = *self * rhs;
    }
}

impl DivAssign for Fx {
    #[inline]
    fn div_assign(&mut self, rhs: Fx) {
        *self = *self / rhs;
    }
}

impl core::iter::Sum for Fx {
    fn sum<I: Iterator<Item = Fx>>(iter: I) -> Fx {
        iter.fold(Fx::ZERO, |a, b| a + b)
    }
}

impl fmt::Display for Fx {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        // Integer-only formatting: no float round-trip, so what you read in a
        // log is exactly what the sim holds. Routed through `f.pad` so width
        // and alignment work -- the lab prints a lot of columns.
        let neg = self.0 < 0;
        let mag = (self.0 as i64).unsigned_abs();
        let int = mag >> FRAC_BITS;
        let frac = ((mag & (ONE_RAW as u64 - 1)) * 10_000) >> FRAC_BITS;
        let text = format!("{}{}.{:04}", if neg { "-" } else { "" }, int, frac);
        f.pad(&text)
    }
}

impl fmt::Debug for Fx {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{self}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn literals_round_trip() {
        assert_eq!(Fx::from_int(3).floor_int(), 3);
        assert_eq!(Fx::from_int(-3).floor_int(), -3);
        assert_eq!(Fx::from_ratio(3, 2), Fx::ONE + Fx::HALF);
        assert_eq!(Fx::from_ratio(-1, 2), -Fx::HALF);
    }

    #[test]
    fn arithmetic_is_exact_for_representable_values() {
        let a = Fx::from_ratio(5, 2); // 2.5
        let b = Fx::from_ratio(1, 4); // 0.25
        assert_eq!(a * b, Fx::from_ratio(5, 8));
        assert_eq!(a / b, Fx::from_int(10));
        assert_eq!(a + b, Fx::from_ratio(11, 4));
        assert_eq!(a - b, Fx::from_ratio(9, 4));
    }

    #[test]
    fn operators_saturate_instead_of_wrapping() {
        assert_eq!(Fx::MAX + Fx::ONE, Fx::MAX);
        assert_eq!(Fx::MIN - Fx::ONE, Fx::MIN);
        assert_eq!(Fx::MAX * Fx::from_int(2), Fx::MAX);
        assert_eq!(Fx::MIN * Fx::from_int(2), Fx::MIN);
        assert_eq!(Fx::ONE / Fx::ZERO, Fx::MAX);
        assert_eq!((-Fx::ONE) / Fx::ZERO, Fx::MIN);
    }

    #[test]
    fn isqrt_matches_perfect_squares() {
        for n in 0u64..2000 {
            assert_eq!(isqrt64(n * n), n, "isqrt({})", n * n);
            if n > 0 {
                assert_eq!(isqrt64(n * n - 1), n - 1, "isqrt({})", n * n - 1);
            }
        }
        assert_eq!(isqrt64(u64::MAX), 4_294_967_295);
    }

    #[test]
    fn sqrt_is_accurate() {
        for n in 1..=200i32 {
            let v = Fx::from_int(n);
            let r = v.sqrt();
            // r^2 should be within one epsilon-ish of the input.
            let err = (r * r - v).abs();
            assert!(err < Fx::from_ratio(1, 100), "sqrt({n}) = {r}, err {err}");
        }
        assert_eq!(Fx::from_int(144).sqrt(), Fx::from_int(12));
        assert_eq!(Fx::from_int(-4).sqrt(), Fx::ZERO);
    }

    #[test]
    fn display_is_integer_only() {
        assert_eq!(format!("{}", Fx::from_ratio(1, 2)), "0.5000");
        assert_eq!(format!("{}", Fx::from_ratio(-1, 2)), "-0.5000");
        assert_eq!(format!("{}", Fx::from_int(42)), "42.0000");
    }
}
