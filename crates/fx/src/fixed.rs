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

    /// Truncates toward zero.
    ///
    /// Distinct from [`Fx::floor_int`], and the distinction is load-bearing
    /// wherever a value is integrated over time: this one is an *odd* function,
    /// so accumulating `+s` and `-s` produce exactly mirrored results, while
    /// `floor_int` biases every negative step by one raw unit. The sine table
    /// already pays for that property (see `round_shift_6`); the hand
    /// integrator in `sim` needs it for the same reason -- a mirror match must
    /// not drift.
    #[inline]
    pub const fn trunc_int(self) -> i32 {
        self.0 / ONE_RAW
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

/// `sqrt(a * b)`, with no intermediate that can saturate.
///
/// `a.raw() * b.raw()` is `a*b * 2^32`, so `isqrt64` of it is already
/// `sqrt(a*b) * 2^16` -- the raw form of the answer, with no shift at all. That
/// is the whole point: the naive `(a * b).sqrt()` saturates the moment the
/// product exceeds 32768, and it does so silently. The braking cap in the sim's
/// hand controller is `sqrt(2 * torque * |error|)`, whose product reaches
/// ~3.1e7, so the naive form would clamp it to a constant and every hand would
/// brake identically.
///
/// Non-positive inputs give zero, like [`Fx::sqrt`].
pub fn sqrt_product(a: Fx, b: Fx) -> Fx {
    if a.0 <= 0 || b.0 <= 0 {
        return Fx::ZERO;
    }
    // Both factors are positive `i32`, so the product is under 2^62.
    let r = isqrt64(a.0 as u64 * b.0 as u64);
    Fx(if r > i32::MAX as u64 {
        i32::MAX
    } else {
        r as i32
    })
}

/// `a * b / c`, with no intermediate that can saturate.
///
/// The workhorse of every impulse in the sim, because momentum exchange is
/// nothing but `a * b / c` -- an impulse scaled by an inverse mass, a velocity
/// split by a mass ratio, a spin divided by a moment of inertia. Written the
/// obvious way, `a * b` saturates at 32768 and takes the answer with it: a
/// weapon inertia of 10 and a spin of 4000 is not an unusual pair, and their
/// product is off the end of [`Fx`] by two orders of magnitude.
///
/// `a.raw() * b.raw()` is `a*b * 2^32`, so dividing by `c.raw()` -- which is
/// `c * 2^16` -- lands on `a*b/c * 2^16`, the raw form of the answer, with no
/// shift at all. Same trick as [`sqrt_product`], and for the same reason.
///
/// **Truncates toward zero**, unlike [`Fx`]'s `Mul`, which floors. That is
/// deliberate: truncation is odd-symmetric, so a mirrored pair of fighters
/// exchanging mirrored impulses gets mirrored answers instead of drifting apart
/// by a raw unit on whichever side happens to be negative. `Hand::track` makes
/// the same choice for the same reason.
///
/// `c == 0` saturates in the sign of the numerator rather than panicking; the
/// sim must be total. Callers that can divide by zero must guard.
pub fn mul_div(a: Fx, b: Fx, c: Fx) -> Fx {
    if c.0 == 0 {
        let negative = (a.0 < 0) != (b.0 < 0);
        return if negative { Fx::MIN } else { Fx::MAX };
    }
    // Both factors are `i32`, so the product is under `2^62` and exact.
    Fx(sat(a.0 as i64 * b.0 as i64 / c.0 as i64))
}

/// `1/2 * mass * speed^2` -- the kinetic energy a blow carries.
///
/// Staged through raw space in two steps because the naive form saturates
/// twice over. `speed` is signed for convenience and squared, so the sign is
/// discarded; a negative `mass` is meaningless and answers zero.
///
/// Extreme inputs saturate rather than wrap. A mass and a speed large enough to
/// reach that are already outside anything the roster can produce -- the sim's
/// own assertions are what catch a table that drifts there, not this function.
pub fn energy(mass: Fx, speed: Fx) -> Fx {
    let m = if mass.0 > 0 { mass.0 as i64 } else { return Fx::ZERO };
    let v = speed.0.unsigned_abs() as u64 as i64;
    // `v * v` is `v^2 * 2^32`; the shift brings it back to the raw form of
    // `v^2`. Exact: `v` is under `2^31`, so the product is under `2^62`.
    let vv = v.saturating_mul(v) >> FRAC_BITS;
    Fx(sat((m.saturating_mul(vv) >> FRAC_BITS) >> 1))
}

/// Speed, in world units per tick, of a point `radius` from a pivot spinning at
/// `spin` **raw angle units per tick**.
///
/// `speed = spin * (2*pi / 65536) * radius`, and the whole conversion is one
/// staged `u64` chain so nothing rounds twice: `2*pi ~= 411775 / 2^16`
/// (relative error 8e-7), which folds the angle-unit scale and the fixed-point
/// scale into a single multiply and a single shift.
///
/// Always non-negative -- the sign of a swing is the caller's business, because
/// only the caller knows which tangent the contact point is on.
pub fn tangential_speed(spin: Fx, radius: Fx) -> Fx {
    let s = spin.0.unsigned_abs() as u64;
    let r = if radius.0 > 0 { radius.0 as u64 } else { 0 };
    // `s * r` is `spin * radius * 2^32`; the shift brings it back to `2^16`,
    // and the multiply-then-shift applies `2*pi` without leaving raw space.
    let prod = s.saturating_mul(r) >> FRAC_BITS;
    Fx((prod.saturating_mul(411_775) >> 32).min(i32::MAX as u64) as i32)
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
    fn mul_div_survives_products_that_saturate_fx() {
        // The case the sim actually hits: a spin of 4000 against an inertia of
        // 10. Written as `(spin * restitution) / inertia` the first product is
        // fine, but `spin * inertia` -- which the obvious impulse form
        // produces -- is 40000 and clamps to 32767.99998.
        let spin = Fx::from_int(4000);
        let inertia = Fx::from_int(10);
        assert_eq!(spin * inertia, Fx::MAX, "premise: the naive form saturates");
        assert_eq!(mul_div(spin, inertia, Fx::from_int(100)), Fx::from_int(400));

        // Exactness on values that do fit, so it is a drop-in for `a * b / c`.
        let a = Fx::from_ratio(5, 2);
        let b = Fx::from_ratio(3, 4);
        assert_eq!(mul_div(a, b, Fx::from_int(3)), a * b / Fx::from_int(3));
    }

    #[test]
    fn mul_div_truncates_toward_zero_so_mirrored_impulses_mirror() {
        // The property `Mul` does not have. A mirrored pair of fighters must
        // get answers that are exact negations, or they drift apart by a raw
        // unit per tick on whichever side is turning negative.
        for n in [1, 3, 7, 11, 65_535, 65_537] {
            let a = Fx::from_raw(n);
            let plus = mul_div(a, Fx::from_ratio(1, 3), Fx::from_int(7));
            let minus = mul_div(-a, Fx::from_ratio(1, 3), Fx::from_int(7));
            assert_eq!(plus, -minus, "asymmetric at raw {n}");
        }
    }

    #[test]
    fn mul_div_is_total() {
        assert_eq!(mul_div(Fx::ONE, Fx::ONE, Fx::ZERO), Fx::MAX);
        assert_eq!(mul_div(-Fx::ONE, Fx::ONE, Fx::ZERO), Fx::MIN);
        assert_eq!(mul_div(-Fx::ONE, -Fx::ONE, Fx::ZERO), Fx::MAX);
        // Saturates rather than wrapping when the answer genuinely does not fit.
        assert_eq!(mul_div(Fx::MAX, Fx::MAX, Fx::EPSILON), Fx::MAX);
        assert_eq!(mul_div(Fx::MIN, Fx::MAX, Fx::EPSILON), Fx::MIN);
    }

    #[test]
    fn energy_is_half_m_v_squared() {
        // 1/2 * 4 * 3^2 = 18
        assert_eq!(energy(Fx::from_int(4), Fx::from_int(3)), Fx::from_int(18));
        // Sign of the speed is irrelevant -- a backswing carries the same energy.
        assert_eq!(
            energy(Fx::from_int(4), Fx::from_int(-3)),
            energy(Fx::from_int(4), Fx::from_int(3))
        );
        // Quadratic, which is the whole point of choosing it as the damage law.
        // On exactly representable speeds, so this pins the law and not the
        // rounding: a tenth is not a 16.16 number and squaring one loses a bit.
        let slow = energy(Fx::ONE, Fx::from_ratio(1, 4));
        let fast = energy(Fx::ONE, Fx::HALF);
        assert_eq!(fast, slow * Fx::from_int(4));

        // Blade-scale values keep real resolution rather than collapsing to
        // zero: this is the range every blow in the game is billed from.
        let blow = energy(Fx::from_ratio(33, 10), Fx::from_ratio(158, 1000));
        assert!(blow > Fx::ZERO && blow < Fx::ONE, "{blow}");

        assert_eq!(energy(Fx::ZERO, Fx::from_int(5)), Fx::ZERO);
        assert_eq!(energy(-Fx::ONE, Fx::from_int(5)), Fx::ZERO);
        let _ = energy(Fx::MAX, Fx::MAX);
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
    fn trunc_int_is_odd_where_floor_int_is_not() {
        // The whole reason `trunc_int` exists. `floor_int` biases every
        // negative value by one, so integrating a mirrored pair drifts.
        for raw in [1i32, 100, 65_535, 65_536, 70_000, 1_000_000] {
            let v = Fx::from_raw(raw);
            assert_eq!((-v).trunc_int(), -v.trunc_int(), "trunc_int(-{v})");
        }
        assert_eq!(Fx::from_ratio(-3, 2).trunc_int(), -1);
        assert_eq!(Fx::from_ratio(-3, 2).floor_int(), -2);
        assert_eq!(Fx::from_ratio(3, 2).trunc_int(), 1);
    }

    #[test]
    fn sqrt_product_survives_products_that_would_saturate() {
        // The hand controller's actual worst case: 2 * torque * |error| with
        // torque 472 and a half-turn of error.
        let a = Fx::from_int(2) * Fx::from_int(472);
        let b = Fx::from_int(32_767);
        assert_eq!((a * b), Fx::MAX, "the naive product is expected to saturate");
        let want = Fx::from_ratio(556_166, 100); // sqrt(944 * 32767) = 5561.66
        assert!(
            (sqrt_product(a, b) - want).abs() < Fx::ONE,
            "sqrt_product = {}",
            sqrt_product(a, b)
        );

        assert_eq!(sqrt_product(Fx::from_int(4), Fx::from_int(9)), Fx::from_int(6));
        assert_eq!(sqrt_product(Fx::ONE, Fx::ONE), Fx::ONE);
        assert_eq!(sqrt_product(Fx::from_int(-4), Fx::from_int(9)), Fx::ZERO);
        assert_eq!(sqrt_product(Fx::ZERO, Fx::MAX), Fx::ZERO);
        assert_eq!(sqrt_product(Fx::MAX, Fx::MAX), Fx::MAX);
    }

    #[test]
    fn tangential_speed_matches_the_hand_calculation() {
        // 2000 angle units/tick is 10.986 deg/tick = 0.19175 rad/tick, so at
        // radius 1 the tip covers 0.19175 world units per tick.
        let v = tangential_speed(Fx::from_int(2000), Fx::ONE);
        assert!(
            (v - Fx::from_ratio(19_175, 100_000)).abs() < Fx::from_ratio(1, 1000),
            "got {v}"
        );

        // Linear in both arguments, and blind to the sign of the spin.
        let half = tangential_speed(Fx::from_int(1000), Fx::ONE);
        assert!((v - half * Fx::TWO).abs() < Fx::from_ratio(1, 1000));
        assert_eq!(
            tangential_speed(Fx::from_int(-2000), Fx::ONE),
            tangential_speed(Fx::from_int(2000), Fx::ONE)
        );
        assert_eq!(
            tangential_speed(Fx::from_int(2000), Fx::from_int(2)),
            tangential_speed(Fx::from_int(4000), Fx::ONE)
        );

        assert_eq!(tangential_speed(Fx::ZERO, Fx::from_int(3)), Fx::ZERO);
        assert_eq!(tangential_speed(Fx::from_int(2000), -Fx::ONE), Fx::ZERO);
        // Total at the extremes rather than panicking or wrapping.
        let _ = tangential_speed(Fx::MAX, Fx::MAX);
        let _ = tangential_speed(Fx::MIN, Fx::MAX);
    }

    #[test]
    fn display_is_integer_only() {
        assert_eq!(format!("{}", Fx::from_ratio(1, 2)), "0.5000");
        assert_eq!(format!("{}", Fx::from_ratio(-1, 2)), "-0.5000");
        assert_eq!(format!("{}", Fx::from_int(42)), "42.0000");
    }
}
