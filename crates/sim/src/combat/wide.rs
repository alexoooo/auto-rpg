//! Fixed-capacity wide words for exact contact predicates.
//!
//! This is not an arbitrary-precision integer. Its 4,096-bit ceiling belongs to
//! the detector's reviewed expression envelope, and crossing that ceiling is a
//! named arithmetic refusal at the caller. The representation is inline, uses
//! no allocation, and performs the same limb operations on native and wasm.

#![allow(dead_code)]

use core::cmp::Ordering;

const LIMBS: usize = 128;
const BITS: u32 = (LIMBS * 32) as u32;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(crate) struct UnsignedWide4096 {
    limbs: [u32; LIMBS],
    used: u8,
}

impl Default for UnsignedWide4096 {
    fn default() -> Self { Self::ZERO }
}

impl UnsignedWide4096 {
    pub(crate) const ZERO: Self = Self { limbs: [0; LIMBS], used: 0 };
    pub(crate) const ONE: Self = {
        let mut limbs = [0; LIMBS]; limbs[0] = 1;
        Self { limbs, used: 1 }
    };

    pub(crate) fn from_u128(value: u128) -> Self {
        let mut out = Self::ZERO;
        for at in 0..4 { out.limbs[at] = (value >> (at * 32)) as u32; }
        out.canonicalize(); out
    }

    pub(crate) fn bit_len(&self) -> u32 {
        if self.used == 0 { 0 } else {
            let at = self.used as usize - 1;
            at as u32 * 32 + (32 - self.limbs[at].leading_zeros())
        }
    }

    pub(crate) fn trailing_zeros(&self) -> u32 {
        if self.used == 0 { BITS } else {
            for at in 0..self.used as usize {
                if self.limbs[at] != 0 {
                    return at as u32 * 32 + self.limbs[at].trailing_zeros();
                }
            }
            BITS
        }
    }

    pub(crate) fn is_zero(&self) -> bool { self.used == 0 }

    pub(crate) fn checked_add(self, other: Self) -> Option<Self> {
        let count = (self.used.max(other.used)) as usize;
        let mut out = Self::ZERO; let mut carry = 0u64;
        for at in 0..count {
            let word = self.limbs[at] as u64 + other.limbs[at] as u64 + carry;
            out.limbs[at] = word as u32; carry = word >> 32;
        }
        if carry != 0 {
            if count == LIMBS { return None; }
            out.limbs[count] = carry as u32; out.used = (count + 1) as u8;
        } else { out.used = count as u8; out.canonicalize(); }
        Some(out)
    }

    pub(crate) fn checked_sub(self, other: Self) -> Option<Self> {
        if self < other { return None; }
        let mut out = Self::ZERO; let mut borrow = 0u64;
        for at in 0..self.used as usize {
            let left = self.limbs[at] as u64;
            let right = other.limbs[at] as u64 + borrow;
            out.limbs[at] = left.wrapping_sub(right) as u32;
            borrow = (left < right) as u64;
        }
        debug_assert_eq!(borrow, 0);
        out.used = self.used; out.canonicalize(); Some(out)
    }

    pub(crate) fn checked_mul(self, other: Self) -> Option<Self> {
        if self.is_zero() || other.is_zero() { return Some(Self::ZERO); }
        if self.bit_len().checked_add(other.bit_len())? > BITS + 1 { return None; }
        let mut out = Self::ZERO;
        for i in 0..self.used as usize {
            let mut carry = 0u64;
            for j in 0..other.used as usize {
                let at = i + j;
                if at >= LIMBS {
                    if self.limbs[i] != 0 && other.limbs[j] != 0 { return None; }
                    continue;
                }
                let word = self.limbs[i] as u64 * other.limbs[j] as u64
                    + out.limbs[at] as u64 + carry;
                out.limbs[at] = word as u32; carry = word >> 32;
            }
            let at = i + other.used as usize;
            if carry != 0 {
                if at >= LIMBS { return None; }
                debug_assert_eq!(out.limbs[at], 0);
                out.limbs[at] = carry as u32;
            }
        }
        out.used = ((self.used as usize + other.used as usize).min(LIMBS)) as u8;
        out.canonicalize(); Some(out)
    }

    pub(crate) fn checked_shl(self, shift: u32) -> Option<Self> {
        if self.is_zero() { return Some(self); }
        if shift >= BITS || self.bit_len().checked_add(shift)? > BITS { return None; }
        let words = (shift / 32) as usize; let bits = shift % 32;
        let mut out = Self::ZERO;
        for at in 0..self.used as usize {
            let target = at + words;
            out.limbs[target] |= self.limbs[at] << bits;
            if bits != 0 && target + 1 < LIMBS {
                out.limbs[target + 1] |= self.limbs[at] >> (32 - bits);
            }
        }
        out.used = ((self.bit_len() + shift + 31) / 32) as u8;
        out.canonicalize(); Some(out)
    }

    pub(crate) fn shr(self, shift: u32) -> Self {
        if shift >= BITS || self.is_zero() { return Self::ZERO; }
        let words = (shift / 32) as usize; let bits = shift % 32;
        if words >= self.used as usize { return Self::ZERO; }
        let mut out = Self::ZERO;
        for source in words..self.used as usize {
            let target = source - words;
            out.limbs[target] |= self.limbs[source] >> bits;
            if bits != 0 && source + 1 < self.used as usize {
                out.limbs[target] |= self.limbs[source + 1] << (32 - bits);
            }
        }
        out.used = (self.used as usize - words) as u8;
        out.canonicalize(); out
    }

    /// Division is bounded by the 4,096 possible alignment positions. It uses
    /// shifted subtraction so an intermediate remainder never needs bit 4,097.
    pub(crate) fn div_rem(self, divisor: Self) -> Option<(Self, Self)> {
        if divisor.is_zero() { return None; }
        if self < divisor { return Some((Self::ZERO, self)); }
        let mut quotient = Self::ZERO; let mut remainder = self;
        let top = remainder.bit_len() - divisor.bit_len();
        for shift in (0..=top).rev() {
            let aligned = divisor.checked_shl(shift)?;
            if remainder >= aligned {
                remainder = remainder.checked_sub(aligned)?;
                quotient.set_bit(shift);
            }
        }
        Some((quotient, remainder))
    }

    pub(crate) fn to_u128(self) -> Option<u128> {
        if self.bit_len() > 128 { return None; }
        let mut out = 0u128;
        for at in (0..self.used as usize).rev() { out = (out << 32) | self.limbs[at] as u128; }
        Some(out)
    }

    fn set_bit(&mut self, bit: u32) {
        let at = (bit / 32) as usize;
        self.limbs[at] |= 1 << (bit % 32);
        self.used = self.used.max((at + 1) as u8);
    }

    fn canonicalize(&mut self) {
        let mut used = LIMBS;
        while used != 0 && self.limbs[used - 1] == 0 { used -= 1; }
        self.used = used as u8;
    }
}

impl Ord for UnsignedWide4096 {
    fn cmp(&self, other: &Self) -> Ordering {
        match self.used.cmp(&other.used) {
            Ordering::Equal => {
                for at in (0..self.used as usize).rev() {
                    let order = self.limbs[at].cmp(&other.limbs[at]);
                    if order != Ordering::Equal { return order; }
                }
                Ordering::Equal
            }
            order => order,
        }
    }
}

impl PartialOrd for UnsignedWide4096 {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> { Some(self.cmp(other)) }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
pub(crate) struct SignedWide4096 {
    negative: bool,
    magnitude: UnsignedWide4096,
}

impl SignedWide4096 {
    pub(crate) const ZERO: Self = Self { negative: false, magnitude: UnsignedWide4096::ZERO };

    pub(crate) fn from_i128(value: i128) -> Self {
        Self::from_parts(value < 0, UnsignedWide4096::from_u128(value.unsigned_abs()))
    }

    pub(crate) fn is_zero(&self) -> bool { self.magnitude.is_zero() }
    pub(crate) fn is_negative(&self) -> bool { self.negative }
    pub(crate) fn bit_len(&self) -> u32 { self.magnitude.bit_len() }
    pub(crate) fn trailing_zeros(&self) -> u32 { self.magnitude.trailing_zeros() }
    pub(crate) fn abs(&self) -> UnsignedWide4096 { self.magnitude }

    pub(crate) fn checked_neg(self) -> Option<Self> {
        Some(Self::from_parts(!self.negative, self.magnitude))
    }

    pub(crate) fn checked_add(self, other: Self) -> Option<Self> {
        if self.negative == other.negative {
            Some(Self::from_parts(self.negative,
                self.magnitude.checked_add(other.magnitude)?))
        } else {
            match self.magnitude.cmp(&other.magnitude) {
                Ordering::Less => Some(Self::from_parts(other.negative,
                    other.magnitude.checked_sub(self.magnitude)?)),
                Ordering::Equal => Some(Self::ZERO),
                Ordering::Greater => Some(Self::from_parts(self.negative,
                    self.magnitude.checked_sub(other.magnitude)?)),
            }
        }
    }

    pub(crate) fn checked_sub(self, other: Self) -> Option<Self> {
        self.checked_add(other.checked_neg()?)
    }

    pub(crate) fn checked_mul(self, other: Self) -> Option<Self> {
        Some(Self::from_parts(self.negative != other.negative,
                              self.magnitude.checked_mul(other.magnitude)?))
    }

    pub(crate) fn checked_shl(self, shift: u32) -> Option<Self> {
        Some(Self::from_parts(self.negative, self.magnitude.checked_shl(shift)?))
    }

    pub(crate) fn shr(self, shift: u32) -> Self {
        Self::from_parts(self.negative, self.magnitude.shr(shift))
    }

    /// Signed quotient and remainder both follow Rust's toward-zero rule.
    pub(crate) fn div_rem(self, divisor: Self) -> Option<(Self, Self)> {
        if divisor.is_zero() { return None; }
        let (quotient, remainder) = self.magnitude.div_rem(divisor.magnitude)?;
        Some((Self::from_parts(self.negative != divisor.negative, quotient),
              Self::from_parts(self.negative, remainder)))
    }

    pub(crate) fn to_i128(self) -> Option<i128> {
        let magnitude = self.magnitude.to_u128()?;
        if self.negative {
            if magnitude == 1u128 << 127 { Some(i128::MIN) }
            else { i128::try_from(magnitude).ok()?.checked_neg() }
        } else { i128::try_from(magnitude).ok() }
    }

    fn from_parts(negative: bool, magnitude: UnsignedWide4096) -> Self {
        Self { negative: negative && !magnitude.is_zero(), magnitude }
    }
}

impl Ord for SignedWide4096 {
    fn cmp(&self, other: &Self) -> Ordering {
        match (self.negative, other.negative) {
            (true, false) => Ordering::Less,
            (false, true) => Ordering::Greater,
            (false, false) => self.magnitude.cmp(&other.magnitude),
            (true, true) => other.magnitude.cmp(&self.magnitude),
        }
    }
}

impl PartialOrd for SignedWide4096 {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> { Some(self.cmp(other)) }
}

/// A fixed-envelope rational used while a contact predicate is being proved.
/// It removes shared powers of two -- the fixed-point scale -- but deliberately
/// does not run a general reduction algorithm.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(crate) struct WideRational4096 {
    pub(crate) numerator: SignedWide4096,
    pub(crate) denominator: UnsignedWide4096,
}

impl WideRational4096 {
    pub(crate) fn new(numerator: i128, denominator: i128) -> Option<Self> {
        if denominator <= 0 { return None; }
        Self::from_words(SignedWide4096::from_i128(numerator),
                         UnsignedWide4096::from_u128(denominator as u128))
    }

    pub(crate) fn zero() -> Self {
        Self { numerator: SignedWide4096::ZERO, denominator: UnsignedWide4096::ONE }
    }

    pub(crate) fn one() -> Self {
        Self { numerator: SignedWide4096::from_i128(1), denominator: UnsignedWide4096::ONE }
    }

    pub(crate) fn checked_neg(self) -> Option<Self> {
        Self::from_words(self.numerator.checked_neg()?, self.denominator)
    }

    pub(crate) fn checked_add(self, other: Self) -> Option<Self> {
        if self.denominator == other.denominator {
            return Self::from_words(self.numerator.checked_add(other.numerator)?, self.denominator);
        }
        let left = self.numerator.checked_mul(SignedWide4096::from_parts(
            false, other.denominator))?;
        let right = other.numerator.checked_mul(SignedWide4096::from_parts(
            false, self.denominator))?;
        Self::from_words(left.checked_add(right)?,
                         self.denominator.checked_mul(other.denominator)?)
    }

    /// Add without paying twice for a denominator already present in the
    /// accumulator. This is intentionally only divisibility, not reduction:
    /// tick arithmetic does not run a GCD, and genuinely independent factors
    /// still consume the fixed envelope in their declared entity order.
    pub(crate) fn checked_add_divisible(self, other: Self) -> Option<Self> {
        if let Some((scale, remainder)) = self.denominator.div_rem(other.denominator) {
            if remainder.is_zero() {
                let right = other.numerator.checked_mul(
                    SignedWide4096::from_parts(false, scale))?;
                return Self::from_words(self.numerator.checked_add(right)?, self.denominator);
            }
        }
        if let Some((scale, remainder)) = other.denominator.div_rem(self.denominator) {
            if remainder.is_zero() {
                let left = self.numerator.checked_mul(
                    SignedWide4096::from_parts(false, scale))?;
                return Self::from_words(left.checked_add(other.numerator)?, other.denominator);
            }
        }
        self.checked_add(other)
    }


    pub(crate) fn checked_sub(self, other: Self) -> Option<Self> {
        self.checked_add(other.checked_neg()?)
    }

    pub(crate) fn checked_mul(self, other: Self) -> Option<Self> {
        let mut left_num = self.numerator;
        let mut right_num = other.numerator;
        let mut left_den = self.denominator;
        let mut right_den = other.denominator;
        let cross_left = left_num.trailing_zeros().min(right_den.trailing_zeros());
        let cross_right = right_num.trailing_zeros().min(left_den.trailing_zeros());
        left_num = left_num.shr(cross_left); right_den = right_den.shr(cross_left);
        right_num = right_num.shr(cross_right); left_den = left_den.shr(cross_right);
        Self::from_words(left_num.checked_mul(right_num)?, left_den.checked_mul(right_den)?)
    }

    pub(crate) fn checked_div(self, other: Self) -> Option<Self> {
        if other.numerator.is_zero() { return None; }
        let sign = other.numerator.negative;
        let reciprocal_num = SignedWide4096::from_parts(sign, other.denominator);
        let reciprocal_den = other.numerator.magnitude;
        self.checked_mul(Self::from_words(reciprocal_num, reciprocal_den)?)
    }

    pub(crate) fn checked_cmp(self, other: Self) -> Option<Ordering> {
        let left = self.numerator.checked_mul(SignedWide4096::from_parts(
            false, other.denominator))?;
        let right = other.numerator.checked_mul(SignedWide4096::from_parts(
            false, self.denominator))?;
        Some(left.cmp(&right))
    }

    pub(crate) fn trunc_i128(self) -> Option<i128> {
        let denominator = SignedWide4096::from_parts(false, self.denominator);
        self.numerator.div_rem(denominator)?.0.to_i128()
    }

    pub(crate) fn as_i128_pair(self) -> Option<(i128, i128)> {
        Some((self.numerator.to_i128()?, i128::try_from(self.denominator.to_u128()?).ok()?))
    }

    fn from_words(mut numerator: SignedWide4096, mut denominator: UnsignedWide4096)
        -> Option<Self>
    {
        if denominator.is_zero() { return None; }
        if numerator.is_zero() { return Some(Self::zero()); }
        let binary = numerator.trailing_zeros().min(denominator.trailing_zeros());
        numerator = numerator.shr(binary); denominator = denominator.shr(binary);
        Some(Self { numerator, denominator })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn signed_small_domain_matches_i32_arithmetic_and_toward_zero_division() {
        for a in -257i32..=257 { for b in -257i32..=257 {
            let wa = SignedWide4096::from_i128(a as i128);
            let wb = SignedWide4096::from_i128(b as i128);
            assert_eq!(wa.checked_add(wb).unwrap().to_i128(), Some((a + b) as i128));
            assert_eq!(wa.checked_sub(wb).unwrap().to_i128(), Some((a - b) as i128));
            assert_eq!(wa.checked_mul(wb).unwrap().to_i128(), Some(a as i128 * b as i128));
            assert_eq!(wa.cmp(&wb), a.cmp(&b));
            if b != 0 {
                let (q, r) = wa.div_rem(wb).unwrap();
                assert_eq!((q.to_i128(), r.to_i128()),
                           (Some((a / b) as i128), Some((a % b) as i128)));
            }
        } }
    }

    #[test]
    fn u128_edges_round_trip_and_multiply_without_losing_carry() {
        for value in [0, 1, u32::MAX as u128, 1u128 << 32, u64::MAX as u128,
                      1u128 << 127, u128::MAX] {
            assert_eq!(UnsignedWide4096::from_u128(value).to_u128(), Some(value));
        }
        let a = UnsignedWide4096::from_u128(u64::MAX as u128);
        let b = UnsignedWide4096::from_u128(u64::MAX as u128);
        assert_eq!(a.checked_mul(b).unwrap().to_u128(),
                   Some((u64::MAX as u128) * (u64::MAX as u128)));
        assert_eq!(SignedWide4096::from_i128(i128::MIN).to_i128(), Some(i128::MIN));
    }

    #[test]
    fn shifts_and_division_cover_every_limb_boundary() {
        for bit in 0..BITS {
            let word = UnsignedWide4096::ONE.checked_shl(bit).unwrap();
            assert_eq!((word.bit_len(), word.trailing_zeros()), (bit + 1, bit));
            assert_eq!(word.shr(bit), UnsignedWide4096::ONE);
            let divisor = UnsignedWide4096::from_u128((bit as u128 % 251) + 1);
            let (q, r) = word.div_rem(divisor).unwrap();
            assert_eq!(q.checked_mul(divisor).unwrap().checked_add(r).unwrap(), word);
            assert!(r < divisor);
        }
    }

    #[test]
    fn the_4095th_bit_is_accepted_and_the_4096th_shift_or_product_is_refused() {
        let top = UnsignedWide4096::ONE.checked_shl(4095).unwrap();
        assert_eq!(top.bit_len(), 4096);
        assert!(top.checked_shl(1).is_none());
        assert!(top.checked_add(top).is_none());
        assert_eq!(top.div_rem(top), Some((UnsignedWide4096::ONE, UnsignedWide4096::ZERO)));
        let half = UnsignedWide4096::ONE.checked_shl(2048).unwrap();
        assert!(half.checked_mul(half).is_none());
        assert_eq!(UnsignedWide4096::ONE.checked_shl(2047).unwrap()
                       .checked_mul(UnsignedWide4096::ONE.checked_shl(2048).unwrap()).unwrap(),
                   top);
    }

    #[test]
    fn zero_has_one_sign_and_division_by_zero_is_refused() {
        let negative_zero = SignedWide4096::from_parts(true, UnsignedWide4096::ZERO);
        assert_eq!(negative_zero, SignedWide4096::ZERO);
        assert_eq!(negative_zero.checked_neg(), Some(SignedWide4096::ZERO));
        assert!(SignedWide4096::from_i128(1).div_rem(SignedWide4096::ZERO).is_none());
    }

    #[test]
    fn fixed_rationals_match_an_i16_cross_product_oracle() {
        for an in -19i128..=19 { for ad in 1i128..=11 {
            for bn in -19i128..=19 { for bd in 1i128..=11 {
                let a = WideRational4096::new(an, ad).unwrap();
                let b = WideRational4096::new(bn, bd).unwrap();
                assert_eq!(a.checked_cmp(b).unwrap(), (an * bd).cmp(&(bn * ad)));
                let sum = a.checked_add(b).unwrap();
                let (sn, sd) = sum.as_i128_pair().unwrap();
                assert_eq!(sn * ad * bd, (an * bd + bn * ad) * sd);
                let product = a.checked_mul(b).unwrap();
                let (pn, pd) = product.as_i128_pair().unwrap();
                assert_eq!(pn * ad * bd, an * bn * pd);
                if bn != 0 {
                    let quotient = a.checked_div(b).unwrap();
                    let (qn, qd) = quotient.as_i128_pair().unwrap();
                    assert_eq!(qn * ad * bn, an * bd * qd);
                }
            } } }
        }
    }

    #[test]
    fn wide_operation_digest_is_platform_independent() {
        let mut digest = 0xcbf29ce484222325u64;
        for bit in 0..BITS {
            let a = UnsignedWide4096::ONE.checked_shl(bit).unwrap();
            let d = UnsignedWide4096::from_u128((bit as u128 % 65521) + 1);
            let (q, r) = a.div_rem(d).unwrap();
            for word in [a.bit_len() as u64, a.trailing_zeros() as u64,
                         q.limbs[0] as u64, r.limbs[0] as u64] {
                digest ^= word; digest = digest.wrapping_mul(0x100000001b3);
            }
        }
        assert_eq!(digest, 0x1aac329a0bc7ebba);
    }
}
