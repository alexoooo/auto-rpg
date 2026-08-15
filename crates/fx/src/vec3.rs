use crate::{isqrt64, Fx, FRAC_BITS};
use core::ops::{Add, AddAssign, Mul, Neg, Sub, SubAssign};

/// A fixed-point point or vector in the articulated world's XYZ frame.
#[derive(Clone, Copy, PartialEq, Eq, Hash, Default, Debug)]
pub struct Vec3 {
    pub x: Fx,
    pub y: Fx,
    pub z: Fx,
}

impl Vec3 {
    pub const ZERO: Self = Self::new(Fx::ZERO, Fx::ZERO, Fx::ZERO);
    pub const X: Self = Self::new(Fx::ONE, Fx::ZERO, Fx::ZERO);
    pub const Y: Self = Self::new(Fx::ZERO, Fx::ONE, Fx::ZERO);
    pub const Z: Self = Self::new(Fx::ZERO, Fx::ZERO, Fx::ONE);

    #[inline]
    pub const fn new(x: Fx, y: Fx, z: Fx) -> Self {
        Self { x, y, z }
    }

    #[inline]
    pub const fn from_ints(x: i32, y: i32, z: i32) -> Self {
        Self::new(Fx::from_int(x), Fx::from_int(y), Fx::from_int(z))
    }

    /// Dot product with one final fixed-point conversion. Products which
    /// cancel therefore do so before the public result can saturate.
    #[inline]
    pub fn dot(self, other: Self) -> Fx {
        from_wide_raw(
            self.x.raw() as i128 * other.x.raw() as i128
                + self.y.raw() as i128 * other.y.raw() as i128
                + self.z.raw() as i128 * other.z.raw() as i128,
        )
    }

    /// Cross product with each subtraction performed before the one public
    /// fixed-point conversion. This is the same cancellation guarantee as
    /// [`Vec3::dot`], and keeps face normals independent of expression order.
    #[inline]
    pub fn cross(self, other: Self) -> Self {
        Self::new(
            from_wide_raw(self.y.raw() as i128 * other.z.raw() as i128
                - self.z.raw() as i128 * other.y.raw() as i128),
            from_wide_raw(self.z.raw() as i128 * other.x.raw() as i128
                - self.x.raw() as i128 * other.z.raw() as i128),
            from_wide_raw(self.x.raw() as i128 * other.y.raw() as i128
                - self.y.raw() as i128 * other.x.raw() as i128),
        )
    }

    #[inline]
    pub fn length_sq(self) -> Fx {
        let x = self.x.raw() as i128;
        let y = self.y.raw() as i128;
        let z = self.z.raw() as i128;
        from_wide_raw(x * x + y * y + z * z)
    }

    /// Length keeps the sum widened until it can prove whether the returned
    /// `Fx` must saturate. This also keeps all arbitrary inputs total: three
    /// extreme components do not fit in the older two-dimensional `u64` sum.
    #[inline]
    pub fn length(self) -> Fx {
        let x = self.x.raw() as i128;
        let y = self.y.raw() as i128;
        let z = self.z.raw() as i128;
        let square = x * x + y * y + z * z;
        let max_square = i32::MAX as i128 * i32::MAX as i128;
        if square > max_square {
            Fx::MAX
        } else {
            Fx::from_raw(isqrt64(square as u64) as i32)
        }
    }

    #[inline]
    pub fn distance_sq(self, other: Self) -> Fx {
        let x = self.x.raw() as i128 - other.x.raw() as i128;
        let y = self.y.raw() as i128 - other.y.raw() as i128;
        let z = self.z.raw() as i128 - other.z.raw() as i128;
        from_wide_raw(x * x + y * y + z * z)
    }

    #[inline]
    pub fn distance(self, other: Self) -> Fx {
        let x = self.x.raw() as i128 - other.x.raw() as i128;
        let y = self.y.raw() as i128 - other.y.raw() as i128;
        let z = self.z.raw() as i128 - other.z.raw() as i128;
        let square = x * x + y * y + z * z;
        let max_square = i32::MAX as i128 * i32::MAX as i128;
        if square > max_square {
            Fx::MAX
        } else {
            Fx::from_raw(isqrt64(square as u64) as i32)
        }
    }

    #[inline]
    pub fn normalized_or_zero(self) -> Self {
        let length = self.length();
        if length == Fx::ZERO {
            Self::ZERO
        } else {
            Self::new(self.x / length, self.y / length, self.z / length)
        }
    }

    #[inline]
    pub fn lerp(a: Self, b: Self, t: Fx) -> Self {
        Self::new(
            Fx::lerp(a.x, b.x, t),
            Fx::lerp(a.y, b.y, t),
            Fx::lerp(a.z, b.z, t),
        )
    }
}

#[inline]
fn from_wide_raw(value: i128) -> Fx {
    let raw = value >> FRAC_BITS;
    Fx::from_raw(if raw > i32::MAX as i128 {
        i32::MAX
    } else if raw < i32::MIN as i128 {
        i32::MIN
    } else {
        raw as i32
    })
}

impl Add for Vec3 {
    type Output = Self;
    #[inline]
    fn add(self, rhs: Self) -> Self {
        Self::new(self.x + rhs.x, self.y + rhs.y, self.z + rhs.z)
    }
}

impl Sub for Vec3 {
    type Output = Self;
    #[inline]
    fn sub(self, rhs: Self) -> Self {
        Self::new(self.x - rhs.x, self.y - rhs.y, self.z - rhs.z)
    }
}

impl Neg for Vec3 {
    type Output = Self;
    #[inline]
    fn neg(self) -> Self {
        Self::new(-self.x, -self.y, -self.z)
    }
}

impl Mul<Fx> for Vec3 {
    type Output = Self;
    #[inline]
    fn mul(self, rhs: Fx) -> Self {
        Self::new(self.x * rhs, self.y * rhs, self.z * rhs)
    }
}

impl AddAssign for Vec3 {
    #[inline]
    fn add_assign(&mut self, rhs: Self) {
        *self = *self + rhs;
    }
}

impl SubAssign for Vec3 {
    #[inline]
    fn sub_assign(&mut self, rhs: Self) {
        *self = *self - rhs;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn vec3_arithmetic_saturates_in_every_direction() {
        let hi = Vec3::new(Fx::MAX, Fx::MAX, Fx::MAX);
        let lo = Vec3::new(Fx::MIN, Fx::MIN, Fx::MIN);
        assert_eq!(hi + Vec3::X, hi);
        assert_eq!(lo - Vec3::X, lo);
        assert_eq!(-lo, hi);
        assert_eq!(hi * Fx::from_int(2), hi);
        assert_eq!(lo * Fx::from_int(2), lo);
        let values = [Fx::MIN, Fx::MAX, Fx::ZERO, Fx::EPSILON];
        for x in values {
            for y in values {
                for z in values {
                    let vector = Vec3::new(x, y, z);
                    let _ = vector + hi;
                    let _ = vector - lo;
                    let _ = -vector;
                    let _ = vector * Fx::MAX;
                }
            }
        }
    }

    #[test]
    fn vec3_dot_and_length_square_stage_before_saturating() {
        let v = Vec3::new(Fx::MAX, Fx::MAX, Fx::ZERO);
        let mirrored = Vec3::new(Fx::MAX, Fx::MIN, Fx::ZERO);
        assert_eq!(v.length_sq(), Fx::MAX);
        assert!(v.dot(mirrored).abs() <= Fx::ONE);
        assert_eq!(Vec3::from_ints(2, 3, 6).length_sq(), Fx::from_int(49));
        assert_eq!(Vec3::from_ints(2, 3, 6).length(), Fx::from_int(7));
        let values = [Fx::MIN, Fx::MAX, Fx::ZERO, Fx::EPSILON];
        for x in values {
            for y in values {
                for z in values {
                    let vector = Vec3::new(x, y, z);
                    let _ = vector.dot(Vec3::new(z, x, y));
                    let _ = vector.length_sq();
                    let _ = vector.distance_sq(-vector);
                }
            }
        }
    }

    #[test]
    fn normalized_or_zero_is_zero_only_for_the_zero_vector() {
        assert_eq!(Vec3::ZERO.normalized_or_zero(), Vec3::ZERO);
        for vector in [
            Vec3::new(Fx::EPSILON, Fx::ZERO, Fx::ZERO),
            Vec3::from_ints(3, 4, 0),
            Vec3::from_ints(-2, 3, -6),
        ] {
            let normalized = vector.normalized_or_zero();
            assert_ne!(normalized, Vec3::ZERO, "{vector:?}");
            assert!((normalized.length() - Fx::ONE).abs() <= Fx::from_raw(3));
        }
        assert_ne!(
            Vec3::new(Fx::MIN, Fx::MAX, Fx::EPSILON).normalized_or_zero(),
            Vec3::ZERO,
        );
    }

    #[test]
    fn reachable_construction_bounds_do_not_saturate() {
        let corner = Vec3::from_ints(256, -256, 256);
        assert!(corner.length() > Fx::from_int(443));
        assert!(corner.length() < Fx::from_int(444));
        // Past the envelope, not at it. This vector was written here as the
        // maximum accepted displacement, which it is not: `displacement_in_bounds`
        // bounds the *magnitude* at four and this one is 6.93. Reading it as a
        // reachable bound is what let `sim` clamp velocity componentwise at four
        // and manufacture contacts across the arena. It stays, because a widened
        // `length_sq` must survive out-of-contract input too -- geometry is total
        // for arbitrary `Fx`, and only the envelope check may reject.
        let past_envelope = Vec3::from_ints(4, -4, 4);
        assert_eq!(past_envelope.length_sq(), Fx::from_int(48));
    }
}
