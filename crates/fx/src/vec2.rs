use crate::angle::{atan2, Angle};
use crate::fixed::{isqrt64, Fx};
use core::fmt;
use core::ops::{Add, AddAssign, Mul, Neg, Sub, SubAssign};

/// A 2D vector in fixed-point world units. `+y` is up.
#[derive(Clone, Copy, PartialEq, Eq, Hash, Default)]
pub struct Vec2 {
    pub x: Fx,
    pub y: Fx,
}

impl Vec2 {
    pub const ZERO: Vec2 = Vec2 {
        x: Fx::ZERO,
        y: Fx::ZERO,
    };
    pub const X: Vec2 = Vec2 {
        x: Fx::ONE,
        y: Fx::ZERO,
    };
    pub const Y: Vec2 = Vec2 {
        x: Fx::ZERO,
        y: Fx::ONE,
    };

    #[inline]
    pub const fn new(x: Fx, y: Fx) -> Vec2 {
        Vec2 { x, y }
    }

    #[inline]
    pub const fn from_ints(x: i32, y: i32) -> Vec2 {
        Vec2 {
            x: Fx::from_int(x),
            y: Fx::from_int(y),
        }
    }

    #[inline]
    pub fn from_angle(a: Angle) -> Vec2 {
        Vec2 {
            x: a.cos(),
            y: a.sin(),
        }
    }

    /// Exact length. Computed entirely in `i64`/`u64` so there is no
    /// intermediate saturation: `sqrt(raw_x^2 + raw_y^2)` is already the raw
    /// form of the answer.
    #[inline]
    pub fn length(self) -> Fx {
        let x = self.x.raw() as i64;
        let y = self.y.raw() as i64;
        let sq = (x * x) as u64 + (y * y) as u64;
        let r = isqrt64(sq);
        Fx::from_raw(if r > i32::MAX as u64 {
            i32::MAX
        } else {
            r as i32
        })
    }

    /// Squared length. Saturates for vectors longer than ~181 units, so
    /// prefer [`Vec2::length`] unless you know the magnitudes are small.
    #[inline]
    pub fn length_sq(self) -> Fx {
        self.x * self.x + self.y * self.y
    }

    #[inline]
    pub fn dot(self, other: Vec2) -> Fx {
        self.x * other.x + self.y * other.y
    }

    /// 2D cross product (the z component of the 3D cross product).
    #[inline]
    pub fn cross(self, other: Vec2) -> Fx {
        self.x * other.y - self.y * other.x
    }

    #[inline]
    pub fn distance(self, other: Vec2) -> Fx {
        (other - self).length()
    }

    #[inline]
    pub fn is_zero(self) -> bool {
        self.x.is_zero() && self.y.is_zero()
    }

    /// Unit vector, or [`Vec2::ZERO`] if the input is zero.
    #[inline]
    pub fn normalize(self) -> Vec2 {
        let len = self.length();
        if len.is_zero() {
            return Vec2::ZERO;
        }
        Vec2 {
            x: self.x / len,
            y: self.y / len,
        }
    }

    /// Rescales to exactly `len`; zero vectors stay zero.
    #[inline]
    pub fn with_length(self, len: Fx) -> Vec2 {
        self.normalize() * len
    }

    #[inline]
    pub fn clamp_length(self, max: Fx) -> Vec2 {
        let len = self.length();
        if len > max {
            self.with_length(max)
        } else {
            self
        }
    }

    /// Rotated 90 degrees counter-clockwise.
    #[inline]
    pub fn perp(self) -> Vec2 {
        Vec2 {
            x: -self.y,
            y: self.x,
        }
    }

    #[inline]
    pub fn rotate(self, a: Angle) -> Vec2 {
        let (s, c) = (a.sin(), a.cos());
        Vec2 {
            x: self.x * c - self.y * s,
            y: self.x * s + self.y * c,
        }
    }

    /// Bearing from the `+x` axis; zero vectors give [`Angle::ZERO`].
    #[inline]
    pub fn angle(self) -> Angle {
        atan2(self.y, self.x)
    }

    #[inline]
    pub fn lerp(a: Vec2, b: Vec2, t: Fx) -> Vec2 {
        Vec2 {
            x: Fx::lerp(a.x, b.x, t),
            y: Fx::lerp(a.y, b.y, t),
        }
    }

    #[inline]
    pub fn clamp_box(self, min: Vec2, max: Vec2) -> Vec2 {
        Vec2 {
            x: self.x.clamp(min.x, max.x),
            y: self.y.clamp(min.y, max.y),
        }
    }
}

impl Add for Vec2 {
    type Output = Vec2;
    #[inline]
    fn add(self, rhs: Vec2) -> Vec2 {
        Vec2 {
            x: self.x + rhs.x,
            y: self.y + rhs.y,
        }
    }
}

impl Sub for Vec2 {
    type Output = Vec2;
    #[inline]
    fn sub(self, rhs: Vec2) -> Vec2 {
        Vec2 {
            x: self.x - rhs.x,
            y: self.y - rhs.y,
        }
    }
}

impl Neg for Vec2 {
    type Output = Vec2;
    #[inline]
    fn neg(self) -> Vec2 {
        Vec2 {
            x: -self.x,
            y: -self.y,
        }
    }
}

/// Scales a vector, **truncating toward zero** rather than flooring like
/// [`Fx`]'s own `Mul`.
///
/// The difference is one raw unit and it is the difference between a fair
/// mirror match and an unfair one. Flooring is not odd-symmetric --
/// `(-v) * s` and `-(v * s)` land a raw unit apart whenever there is a fraction
/// to drop -- so two fighters standing back to back and doing the identical
/// thing in opposite directions drift apart, by one unit per scaled vector per
/// tick, until one of them is measurably winning. It cost a mirrored exchange
/// 62.5671 against 62.5717 before it was tracked down.
///
/// Truncation is odd, so the mirror holds exactly. [`fx::mul_div`] makes the
/// same choice for the same reason, and `Hand::track` makes it a third time on
/// its angle integration.
///
/// [`fx::mul_div`]: crate::mul_div
impl Mul<Fx> for Vec2 {
    type Output = Vec2;
    #[inline]
    fn mul(self, rhs: Fx) -> Vec2 {
        Vec2 {
            x: crate::mul_div(self.x, rhs, Fx::ONE),
            y: crate::mul_div(self.y, rhs, Fx::ONE),
        }
    }
}

impl AddAssign for Vec2 {
    #[inline]
    fn add_assign(&mut self, rhs: Vec2) {
        *self = *self + rhs;
    }
}

impl SubAssign for Vec2 {
    #[inline]
    fn sub_assign(&mut self, rhs: Vec2) {
        *self = *self - rhs;
    }
}

impl fmt::Debug for Vec2 {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "({}, {})", self.x, self.y)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn length_is_exact_for_pythagorean_triples() {
        assert_eq!(Vec2::from_ints(3, 4).length(), Fx::from_int(5));
        assert_eq!(Vec2::from_ints(-3, -4).length(), Fx::from_int(5));
        assert_eq!(Vec2::from_ints(5, 12).length(), Fx::from_int(13));
        assert_eq!(Vec2::ZERO.length(), Fx::ZERO);
    }

    #[test]
    fn length_does_not_saturate_where_length_sq_would() {
        // 300^2 + 300^2 overflows a 16.16 intermediate, but length() works in
        // i64 and stays exact.
        let v = Vec2::from_ints(300, 400);
        assert_eq!(v.length(), Fx::from_int(500));
        assert_eq!(v.length_sq(), Fx::MAX, "length_sq is expected to saturate");
    }

    #[test]
    fn normalize_gives_unit_length() {
        for (x, y) in [(3, 4), (-7, 2), (1, 0), (0, -9), (11, 13)] {
            let n = Vec2::from_ints(x, y).normalize();
            let err = (n.length() - Fx::ONE).abs();
            assert!(
                err < Fx::from_ratio(1, 1000),
                "({x},{y}) -> {n:?} len {}",
                n.length()
            );
        }
        assert_eq!(Vec2::ZERO.normalize(), Vec2::ZERO);
    }

    #[test]
    fn angle_round_trips_through_from_angle() {
        for deg in [0, 30, 90, 137, 180, 270, 359] {
            let a = Angle::from_degrees(deg);
            let v = Vec2::from_angle(a);
            assert!(
                v.angle().delta(a).abs() <= 40,
                "{deg} deg -> {:?}",
                v.angle()
            );
        }
    }

    #[test]
    fn perp_is_orthogonal() {
        let v = Vec2::from_ints(3, 4);
        assert_eq!(v.dot(v.perp()), Fx::ZERO);
        assert_eq!(v.perp(), Vec2::from_ints(-4, 3));
    }

    #[test]
    fn clamp_length_shortens_but_never_lengthens() {
        let v = Vec2::from_ints(3, 4);
        assert_eq!(v.clamp_length(Fx::from_int(10)), v);
        let c = v.clamp_length(Fx::from_int(1));
        assert!((c.length() - Fx::ONE).abs() < Fx::from_ratio(1, 1000));
    }
}
