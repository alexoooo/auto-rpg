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
pub(crate) const WIDE_RATIONAL_WORK_SLOTS: usize = 8;

#[derive(Clone, Copy, Debug)]
pub(crate) struct PositiveRationalCmpWork {
    words: [UnsignedWide4096; 10],
}

impl Default for PositiveRationalCmpWork {
    fn default() -> Self { Self { words: [UnsignedWide4096::ZERO; 10] } }
}

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

fn unsigned_add_into(a: &UnsignedWide4096, b: &UnsignedWide4096,
                     out: &mut UnsignedWide4096) -> bool {
    *out = UnsignedWide4096::ZERO;
    let count = a.used.max(b.used) as usize; let mut carry = 0u64;
    for at in 0..count {
        let word = a.limbs[at] as u64 + b.limbs[at] as u64 + carry;
        out.limbs[at] = word as u32; carry = word >> 32;
    }
    if carry != 0 {
        if count == LIMBS { return false; }
        out.limbs[count] = carry as u32; out.used = (count + 1) as u8;
    } else { out.used = count as u8; out.canonicalize(); }
    true
}

fn unsigned_sub_into(a: &UnsignedWide4096, b: &UnsignedWide4096,
                     out: &mut UnsignedWide4096) -> bool {
    if a < b { return false; }
    *out = UnsignedWide4096::ZERO; let mut borrow = 0u64;
    for at in 0..a.used as usize {
        let left = a.limbs[at] as u64; let right = b.limbs[at] as u64 + borrow;
        out.limbs[at] = left.wrapping_sub(right) as u32; borrow = (left < right) as u64;
    }
    if borrow != 0 { return false; }
    out.used = a.used; out.canonicalize(); true
}

fn unsigned_mul_into(a: &UnsignedWide4096, b: &UnsignedWide4096,
                     out: &mut UnsignedWide4096) -> bool {
    *out = UnsignedWide4096::ZERO;
    if a.is_zero() || b.is_zero() { return true; }
    if a.bit_len().checked_add(b.bit_len()).is_none_or(|bits| bits > BITS + 1) { return false; }
    for i in 0..a.used as usize {
        let mut carry = 0u64;
        for j in 0..b.used as usize {
            let at = i + j;
            if at >= LIMBS { if a.limbs[i] != 0 && b.limbs[j] != 0 { return false; } continue; }
            let word = a.limbs[i] as u64 * b.limbs[j] as u64
                + out.limbs[at] as u64 + carry;
            out.limbs[at] = word as u32; carry = word >> 32;
        }
        let at = i + b.used as usize;
        if carry != 0 { if at >= LIMBS || out.limbs[at] != 0 { return false; }
            out.limbs[at] = carry as u32; }
    }
    out.used = ((a.used as usize + b.used as usize).min(LIMBS)) as u8;
    out.canonicalize(); true
}

fn unsigned_shr_into(a: &UnsignedWide4096, shift: u32, out: &mut UnsignedWide4096) {
    *out = UnsignedWide4096::ZERO;
    if shift >= BITS || a.is_zero() { return; }
    let words = (shift / 32) as usize; let bits = shift % 32;
    if words >= a.used as usize { return; }
    for source in words..a.used as usize {
        let target = source - words; out.limbs[target] |= a.limbs[source] >> bits;
        if bits != 0 && source + 1 < a.used as usize {
            out.limbs[target] |= a.limbs[source + 1] << (32 - bits);
        }
    }
    out.used = (a.used as usize - words) as u8; out.canonicalize();
}

fn unsigned_shl_into(a: &UnsignedWide4096, shift: u32,
                     out: &mut UnsignedWide4096) -> bool {
    *out = UnsignedWide4096::ZERO;
    if a.is_zero() { return true; }
    if shift >= BITS || a.bit_len().checked_add(shift).is_none_or(|bits| bits > BITS) {
        return false;
    }
    let words = (shift / 32) as usize; let bits = shift % 32;
    for at in 0..a.used as usize {
        let target = at + words; out.limbs[target] |= a.limbs[at] << bits;
        if bits != 0 && target + 1 < LIMBS {
            out.limbs[target + 1] |= a.limbs[at] >> (32 - bits);
        }
    }
    out.used = ((a.bit_len() + shift + 31) / 32) as u8; out.canonicalize(); true
}

fn unsigned_div_rem_into(
    value: &UnsignedWide4096, divisor: &UnsignedWide4096,
    quotient: &mut UnsignedWide4096, remainder: &mut UnsignedWide4096,
    aligned: &mut UnsignedWide4096, stage: &mut UnsignedWide4096,
) -> bool {
    if divisor.is_zero() { return false; }
    *quotient = UnsignedWide4096::ZERO; *remainder = UnsignedWide4096::ZERO;
    if value < divisor { *remainder = *value; return true; }
    *remainder = *value;
    let top = remainder.bit_len() - divisor.bit_len();
    for shift in (0..=top).rev() {
        if !unsigned_shl_into(divisor, shift, aligned) { return false; }
        if &*remainder >= aligned {
            if !unsigned_sub_into(remainder, aligned, stage) { return false; }
            core::mem::swap(remainder, stage);
            let at = (shift / 32) as usize;
            quotient.limbs[at] |= 1 << (shift % 32);
            quotient.used = quotient.used.max((at + 1) as u8);
        }
    }
    quotient.canonicalize(); true
}

fn signed_from_parts_into(negative: bool, magnitude: &UnsignedWide4096,
                          out: &mut SignedWide4096) {
    out.negative = negative && !magnitude.is_zero(); out.magnitude = *magnitude;
}

fn signed_neg_into(value: &SignedWide4096, out: &mut SignedWide4096) {
    signed_from_parts_into(!value.negative, &value.magnitude, out);
}

fn signed_add_into(a: &SignedWide4096, b: &SignedWide4096,
                   magnitude: &mut UnsignedWide4096, out: &mut SignedWide4096) -> bool {
    if a.negative == b.negative {
        if !unsigned_add_into(&a.magnitude, &b.magnitude, magnitude) { return false; }
        signed_from_parts_into(a.negative, magnitude, out); return true;
    }
    match a.magnitude.cmp(&b.magnitude) {
        Ordering::Less => { if !unsigned_sub_into(&b.magnitude, &a.magnitude, magnitude) { return false; }
            signed_from_parts_into(b.negative, magnitude, out); }
        Ordering::Equal => *out = SignedWide4096::ZERO,
        Ordering::Greater => { if !unsigned_sub_into(&a.magnitude, &b.magnitude, magnitude) { return false; }
            signed_from_parts_into(a.negative, magnitude, out); }
    }
    true
}

fn signed_mul_into(a: &SignedWide4096, b: &SignedWide4096,
                   magnitude: &mut UnsignedWide4096, out: &mut SignedWide4096) -> bool {
    if !unsigned_mul_into(&a.magnitude, &b.magnitude, magnitude) { return false; }
    signed_from_parts_into(a.negative != b.negative, magnitude, out); true
}

fn canonicalize_rational_slot(
    result: &mut [WideRational4096], scratch: &mut WideRational4096,
) -> bool {
    if result[0].denominator.is_zero() { return false; }
    if result[0].numerator.is_zero() {
        result[0].numerator.negative = false;
        result[0].numerator.magnitude = UnsignedWide4096::ZERO;
        result[0].denominator = UnsignedWide4096::ONE;
        return true;
    }
    let shift = result[0].numerator.trailing_zeros()
        .min(result[0].denominator.trailing_zeros());
    unsigned_shr_into(&result[0].numerator.magnitude, shift, &mut scratch.numerator.magnitude);
    scratch.numerator.negative = result[0].numerator.negative;
    unsigned_shr_into(&result[0].denominator, shift, &mut scratch.denominator);
    result[0].numerator = scratch.numerator;
    result[0].denominator = scratch.denominator;
    true
}

fn unsigned_to_u128_ref(value: &UnsignedWide4096) -> Option<u128> {
    if value.bit_len() > 128 { return None; }
    let mut out = 0u128;
    for at in (0..value.used as usize).rev() { out = (out << 32) | value.limbs[at] as u128; }
    Some(out)
}

fn multiply_rational_parts_into(
    left_num: &SignedWide4096, left_den: &UnsignedWide4096,
    right_num: &SignedWide4096, right_den: &UnsignedWide4096,
    work: &mut [WideRational4096; 7], out: &mut WideRational4096,
) -> bool {
    let cross_left = left_num.trailing_zeros().min(right_den.trailing_zeros());
    let cross_right = right_num.trailing_zeros().min(left_den.trailing_zeros());
    unsigned_shr_into(&left_num.magnitude, cross_left, &mut work[0].denominator);
    signed_from_parts_into(left_num.negative, &work[0].denominator, &mut work[0].numerator);
    unsigned_shr_into(right_den, cross_left, &mut work[1].denominator);
    unsigned_shr_into(&right_num.magnitude, cross_right, &mut work[2].denominator);
    signed_from_parts_into(right_num.negative, &work[2].denominator, &mut work[2].numerator);
    unsigned_shr_into(left_den, cross_right, &mut work[3].denominator);
    let (result, tail) = work.split_at_mut(1);
    let (inputs, output) = tail.split_at_mut(3);
    if !signed_mul_into(&result[0].numerator, &inputs[1].numerator,
                        &mut output[0].denominator, &mut output[0].numerator) { return false; }
    let (den_input, den_output) = output.split_at_mut(1);
    if !unsigned_mul_into(&inputs[2].denominator, &inputs[0].denominator,
                          &mut den_output[0].denominator) { return false; }
    result[0].numerator = den_input[0].numerator;
    result[0].denominator = den_output[0].denominator;
    if !canonicalize_rational_slot(result, &mut den_output[1]) { return false; }
    *out = result[0]; true
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

    pub(crate) fn checked_neg_into(
        &self, work: &mut [Self; WIDE_RATIONAL_WORK_SLOTS], out: &mut Self,
    ) -> bool {
        signed_neg_into(&self.numerator, &mut work[0].numerator);
        work[0].denominator = self.denominator;
        *out = work[0]; true
    }

    pub(crate) fn checked_add_divisible_into(
        &self, rhs: &Self, work: &mut [Self; WIDE_RATIONAL_WORK_SLOTS], out: &mut Self,
    ) -> bool {
        if self.denominator == rhs.denominator {
            let (stage, rest) = work.split_at_mut(1);
            if !signed_add_into(&self.numerator, &rhs.numerator,
                                &mut rest[0].denominator, &mut stage[0].numerator) { return false; }
            stage[0].denominator = self.denominator;
            if !canonicalize_rational_slot(stage, &mut rest[1]) { return false; }
            *out = stage[0]; return true;
        }
        macro_rules! try_divisible {
          ($large:expr, $small:expr, $left:expr, $right:expr) => {{
            let (large, small, left, right) = ($large, $small, $left, $right);
            let (q, tail) = work.split_at_mut(1); let (r, tail) = tail.split_at_mut(1);
            let (aligned, tail) = tail.split_at_mut(1); let (stage, tail) = tail.split_at_mut(1);
            if !unsigned_div_rem_into(large, small, &mut q[0].denominator,
                &mut r[0].denominator, &mut aligned[0].denominator,
                &mut stage[0].denominator) { return false; }
            if r[0].denominator.is_zero() {
                let (scale, remaining) = tail.split_at_mut(1);
                signed_from_parts_into(false, &q[0].denominator, &mut scale[0].numerator);
                let (product, _) = remaining.split_at_mut(1);
                if !signed_mul_into(right, &scale[0].numerator,
                    &mut aligned[0].denominator, &mut product[0].numerator) { return false; }
                if !signed_add_into(left, &product[0].numerator,
                    &mut stage[0].denominator, &mut q[0].numerator) { return false; }
                q[0].denominator = *large;
                if !canonicalize_rational_slot(q, &mut remaining[1]) { return false; }
                *out = q[0]; return true;
            }
          }};
        }
        try_divisible!(&self.denominator, &rhs.denominator, &self.numerator, &rhs.numerator);
        try_divisible!(&rhs.denominator, &self.denominator, &rhs.numerator, &self.numerator);
        let (left, tail) = work.split_at_mut(1); let (right, tail) = tail.split_at_mut(1);
        let (den, tail) = tail.split_at_mut(1); let (result, tail) = tail.split_at_mut(1);
        signed_from_parts_into(false, &rhs.denominator, &mut tail[0].numerator);
        if !signed_mul_into(&self.numerator, &tail[0].numerator,
                            &mut tail[1].denominator, &mut left[0].numerator) { return false; }
        signed_from_parts_into(false, &self.denominator, &mut tail[0].numerator);
        if !signed_mul_into(&rhs.numerator, &tail[0].numerator,
                            &mut tail[1].denominator, &mut right[0].numerator) { return false; }
        if !signed_add_into(&left[0].numerator, &right[0].numerator,
                            &mut tail[0].denominator, &mut result[0].numerator) { return false; }
        if !unsigned_mul_into(&self.denominator, &rhs.denominator, &mut den[0].denominator) {
            return false;
        }
        result[0].denominator = den[0].denominator;
        if !canonicalize_rational_slot(result, &mut tail[0]) { return false; }
        *out = result[0]; true
    }

    pub(crate) fn checked_mul_into(
        &self, rhs: &Self, work: &mut [Self; WIDE_RATIONAL_WORK_SLOTS], out: &mut Self,
    ) -> bool {
        let (mul, _) = work.split_at_mut(7);
        let Ok(mul) = <&mut [Self; 7]>::try_from(mul) else { return false };
        multiply_rational_parts_into(&self.numerator, &self.denominator,
            &rhs.numerator, &rhs.denominator, mul, out)
    }

    pub(crate) fn checked_div_into(
        &self, rhs: &Self, work: &mut [Self; WIDE_RATIONAL_WORK_SLOTS], out: &mut Self,
    ) -> bool {
        if rhs.numerator.is_zero() { return false; }
        let (mul, reciprocal) = work.split_at_mut(7);
        let Ok(mul) = <&mut [Self; 7]>::try_from(mul) else { return false };
        reciprocal[0].numerator.negative = rhs.numerator.negative;
        reciprocal[0].numerator.magnitude = rhs.denominator;
        reciprocal[0].denominator = rhs.numerator.magnitude;
        multiply_rational_parts_into(&self.numerator, &self.denominator,
            &reciprocal[0].numerator, &reciprocal[0].denominator, mul, out)
    }

    pub(crate) fn checked_cmp_into(
        &self, rhs: &Self, work: &mut [Self; WIDE_RATIONAL_WORK_SLOTS], out: &mut Ordering,
    ) -> bool {
        signed_from_parts_into(false, &rhs.denominator, &mut work[2].numerator);
        let (left, tail) = work.split_at_mut(1);
        if !signed_mul_into(&self.numerator, &tail[1].numerator,
                            &mut tail[2].denominator, &mut left[0].numerator) { return false; }
        signed_from_parts_into(false, &self.denominator, &mut tail[1].numerator);
        let (right, scale_and_scratch) = tail.split_at_mut(1);
        if !signed_mul_into(&rhs.numerator, &scale_and_scratch[0].numerator,
                            &mut scale_and_scratch[1].denominator,
                            &mut right[0].numerator) { return false; }
        *out = left[0].numerator.cmp(&tail[0].numerator); true
    }

    pub(crate) fn trunc_i128_into(
        &self, work: &mut [Self; WIDE_RATIONAL_WORK_SLOTS], out: &mut i128,
    ) -> bool {
        let (q, tail) = work.split_at_mut(1); let (r, tail) = tail.split_at_mut(1);
        let (aligned, stage) = tail.split_at_mut(1);
        if !unsigned_div_rem_into(&self.numerator.magnitude, &self.denominator,
            &mut q[0].denominator, &mut r[0].denominator,
            &mut aligned[0].denominator, &mut stage[0].denominator) { return false; }
        let Some(magnitude) = unsigned_to_u128_ref(&q[0].denominator) else { return false };
        let value = if self.numerator.negative {
            if magnitude == 1u128 << 127 { i128::MIN }
            else { let Ok(word) = i128::try_from(magnitude) else { return false };
                   let Some(word) = word.checked_neg() else { return false }; word }
        } else { let Ok(word) = i128::try_from(magnitude) else { return false }; word };
        *out = value; true
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

pub(crate) fn checked_cmp_positive_into(
    left: &WideRational4096, right: &WideRational4096,
    work: &mut PositiveRationalCmpWork, out: &mut Ordering,
) -> bool {
    if left.numerator.is_negative() || left.numerator.is_zero()
        || right.numerator.is_negative() || right.numerator.is_zero()
        || left.denominator.is_zero() || right.denominator.is_zero() {
        return false;
    }
    work.words[0] = left.numerator.abs(); work.words[1] = left.denominator;
    work.words[2] = right.numerator.abs(); work.words[3] = right.denominator;
    let mut inverted = false;
    for _ in 0..8192 {
        let [ln, ld, rn, rd, lq, lr, rq, rr, aligned, stage] = &mut work.words;
        if !unsigned_div_rem_into(ln, ld, lq, lr, aligned, stage) { return false; }
        if !unsigned_div_rem_into(rn, rd, rq, rr, aligned, stage) { return false; }
        if *lq != *rq {
            *out = if inverted { (*rq).cmp(&*lq) } else { (*lq).cmp(&*rq) };
            return true;
        }
        match (lr.is_zero(), rr.is_zero()) {
            (true, true) => { *out = Ordering::Equal; return true; }
            (true, false) => {
                *out = if inverted { Ordering::Greater } else { Ordering::Less };
                return true;
            }
            (false, true) => {
                *out = if inverted { Ordering::Less } else { Ordering::Greater };
                return true;
            }
            (false, false) => {
                *ln = *ld; *ld = *lr; *rn = *rd; *rd = *rr;
                inverted = !inverted;
            }
        }
    }
    false
}


#[cfg(test)]
#[inline(never)]
fn borrowed_neg_driver(a: &WideRational4096,
    work: &mut [WideRational4096; WIDE_RATIONAL_WORK_SLOTS], out: &mut WideRational4096) -> bool {
    a.checked_neg_into(work, out)
}
#[cfg(test)]
#[inline(never)]
fn borrowed_add_driver(a: &WideRational4096, b: &WideRational4096,
    work: &mut [WideRational4096; WIDE_RATIONAL_WORK_SLOTS], out: &mut WideRational4096) -> bool {
    a.checked_add_divisible_into(b, work, out)
}
#[cfg(test)]
#[inline(never)]
fn borrowed_mul_driver(a: &WideRational4096, b: &WideRational4096,
    work: &mut [WideRational4096; WIDE_RATIONAL_WORK_SLOTS], out: &mut WideRational4096) -> bool {
    a.checked_mul_into(b, work, out)
}
#[cfg(test)]
#[inline(never)]
fn borrowed_div_driver(a: &WideRational4096, b: &WideRational4096,
    work: &mut [WideRational4096; WIDE_RATIONAL_WORK_SLOTS], out: &mut WideRational4096) -> bool {
    a.checked_div_into(b, work, out)
}
#[cfg(test)]
#[inline(never)]
fn borrowed_cmp_driver(a: &WideRational4096, b: &WideRational4096,
    work: &mut [WideRational4096; WIDE_RATIONAL_WORK_SLOTS], out: &mut Ordering) -> bool {
    a.checked_cmp_into(b, work, out)
}
#[cfg(test)]
#[inline(never)]
fn borrowed_trunc_driver(a: &WideRational4096,
    work: &mut [WideRational4096; WIDE_RATIONAL_WORK_SLOTS], out: &mut i128) -> bool {
    a.trunc_i128_into(work, out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn positive_cmp(a: WideRational4096, b: WideRational4096) -> Ordering {
        let mut work = PositiveRationalCmpWork::default();
        let mut out = Ordering::Equal;
        assert!(checked_cmp_positive_into(&a, &b, &mut work, &mut out));
        out
    }

    #[test]
    fn positive_rational_compare_matches_cross_products_when_they_fit() {
        for an in 1..24 { for ad in 1..19 { for bn in 1..21 { for bd in 1..17 {
            let a = WideRational4096::new(an, ad).unwrap();
            let b = WideRational4096::new(bn, bd).unwrap();
            assert_eq!(positive_cmp(a, b), (an * bd).cmp(&(bn * ad)));
        } } } }
    }

    #[test]
    fn positive_rational_compare_orders_the_smart113_4201_bit_products() {
        let odd = |bit: u32| UnsignedWide4096::ONE.checked_shl(bit).unwrap()
            .checked_add(UnsignedWide4096::ONE).unwrap();
        let left = WideRational4096::from_words(
            SignedWide4096::from_parts(false, odd(2206)), odd(2150)).unwrap();
        let right = WideRational4096::from_words(
            SignedWide4096::from_parts(false, odd(2049)), odd(1993)).unwrap();
        assert_eq!((left.numerator.bit_len(), left.denominator.bit_len(),
                    right.numerator.bit_len(), right.denominator.bit_len()),
                   (2207, 2151, 2050, 1994));
        assert_eq!(left.checked_cmp(right), None,
                   "the generic cross-products must retain their 4096-bit refusal");
        assert_eq!(positive_cmp(left, right), Ordering::Greater);
    }

    #[test]
    fn positive_rational_compare_handles_integral_equal_and_inverted_steps() {
        assert_eq!(positive_cmp(WideRational4096::new(3, 2).unwrap(),
                                WideRational4096::new(4, 3).unwrap()), Ordering::Greater);
        assert_eq!(positive_cmp(WideRational4096::new(8, 4).unwrap(),
                                WideRational4096::new(2, 1).unwrap()), Ordering::Equal);
        assert_eq!(positive_cmp(WideRational4096::new(1, 3).unwrap(),
                                WideRational4096::new(1, 2).unwrap()), Ordering::Less);
    }

    #[test]
    fn positive_rational_compare_refuses_nonpositive_inputs_atomically() {
        let mut work = PositiveRationalCmpWork::default();
        let mut out = Ordering::Greater;
        assert!(!checked_cmp_positive_into(&WideRational4096::zero(),
            &WideRational4096::one(), &mut work, &mut out));
        assert_eq!(out, Ordering::Greater);
        assert!(!checked_cmp_positive_into(&WideRational4096::new(-1, 2).unwrap(),
            &WideRational4096::one(), &mut work, &mut out));
        assert_eq!(out, Ordering::Greater);
    }

    fn rational_matrix() -> [WideRational4096; 12] {
        let mut rows = [WideRational4096::zero(), WideRational4096::one(),
            WideRational4096::new(-1, 1).unwrap(), WideRational4096::new(3, 9).unwrap(),
            WideRational4096::new(-7, 3).unwrap(), WideRational4096::new(i128::MAX, 1).unwrap(),
            WideRational4096::new(i128::MIN, 1).unwrap(),
            WideRational4096::zero(), WideRational4096::zero(), WideRational4096::zero(),
            WideRational4096::zero(), WideRational4096::zero()];
        for (at, bit) in [31, 32, 33, 4094, 4095].into_iter().enumerate() {
            rows[7 + at] = WideRational4096::from_words(
                SignedWide4096::from_parts(false, UnsignedWide4096::ONE.checked_shl(bit).unwrap()),
                UnsignedWide4096::ONE).unwrap();
        }
        rows
    }

    #[test]
    fn borrowed_wide_rational_primitives_match_every_old_branch_and_refusal() {
        let rows = rational_matrix();
        for a in &rows { for b in &rows {
            let mut work = [WideRational4096::zero(); WIDE_RATIONAL_WORK_SLOTS];
            let mut output = WideRational4096::new(19, 7).unwrap();
            let old = (*a).checked_add_divisible(*b);
            let ok = borrowed_add_driver(a, b, &mut work, &mut output);
            assert_eq!((ok, ok.then_some(output)), (old.is_some(), old), "add {a:?} {b:?}");
            output = WideRational4096::new(19, 7).unwrap();
            let old = (*a).checked_mul(*b);
            let ok = borrowed_mul_driver(a, b, &mut work, &mut output);
            assert_eq!((ok, ok.then_some(output)), (old.is_some(), old), "mul {a:?} {b:?}");
            output = WideRational4096::new(19, 7).unwrap();
            let old = (*a).checked_div(*b);
            let ok = borrowed_div_driver(a, b, &mut work, &mut output);
            assert_eq!((ok, ok.then_some(output)), (old.is_some(), old), "div {a:?} {b:?}");
            let mut order = Ordering::Equal; let old = (*a).checked_cmp(*b);
            let ok = borrowed_cmp_driver(a, b, &mut work, &mut order);
            assert_eq!((ok, ok.then_some(order)), (old.is_some(), old), "cmp {a:?} {b:?}");
        } }
        for a in &rows {
            let mut work = [WideRational4096::zero(); WIDE_RATIONAL_WORK_SLOTS];
            let mut output = WideRational4096::new(19, 7).unwrap();
            assert!(borrowed_neg_driver(a, &mut work, &mut output));
            assert_eq!(Some(output), (*a).checked_neg());
            let mut integer = 17; let old = (*a).trunc_i128();
            let ok = borrowed_trunc_driver(a, &mut work, &mut integer);
            assert_eq!((ok, ok.then_some(integer)), (old.is_some(), old));
        }
    }

    #[test]
    fn borrowed_add_canonicalizes_zero_and_nonzero_in_every_branch() {
        let rows = [
            ((-7, 3), (7, 3), (0, 1)), ((1, 3), (1, 3), (2, 3)),
            ((1, 4), (1, 4), (1, 2)), ((-21, 9), (7, 3), (0, 1)),
            ((1, 9), (1, 3), (4, 9)), ((7, 3), (-21, 9), (0, 1)),
            ((1, 3), (1, 9), (4, 9)), ((1, 3), (1, 5), (8, 15)),
            ((-1, 3), (1, 5), (-2, 15)),
        ];
        for (left, right, expected) in rows {
            let a = WideRational4096::new(left.0, left.1).unwrap();
            let b = WideRational4096::new(right.0, right.1).unwrap();
            let mut work = [WideRational4096::zero(); WIDE_RATIONAL_WORK_SLOTS];
            let mut out = WideRational4096::new(19, 7).unwrap();
            assert!(a.checked_add_divisible_into(&b, &mut work, &mut out));
            assert_eq!(out, WideRational4096::new(expected.0, expected.1).unwrap(),
                       "{left:?} + {right:?}");
            assert_eq!(out, a.checked_add_divisible(b).unwrap());
        }
    }

    #[test]
    fn borrowed_add_matches_old_words_refusals_and_atomic_output() {
        let rows = rational_matrix();
        let dirty = WideRational4096::from_words(SignedWide4096::from_parts(false,
            UnsignedWide4096::ONE.checked_shl(4095).unwrap()), UnsignedWide4096::ONE).unwrap();
        let sentinel = WideRational4096::new(19, 7).unwrap();
        let mut work = [dirty; WIDE_RATIONAL_WORK_SLOTS];
        for a in &rows { for b in &rows {
            let old = (*a).checked_add_divisible(*b); let mut out = sentinel;
            let ok = a.checked_add_divisible_into(b, &mut work, &mut out);
            assert_eq!((ok, ok.then_some(out)), (old.is_some(), old), "{a:?} + {b:?}");
            if !ok { assert_eq!(out, sentinel); }
        }}
        let top = dirty; let mut out = sentinel;
        assert!(!top.checked_add_divisible_into(&top, &mut work, &mut out));
        assert_eq!(out, sentinel);
    }


    #[test]
    fn borrowed_wide_rational_outputs_are_atomic_on_every_failure() {
        let top = WideRational4096::from_words(SignedWide4096::from_parts(false,
            UnsignedWide4096::ONE.checked_shl(4095).unwrap()), UnsignedWide4096::ONE).unwrap();
        let zero = WideRational4096::zero(); let sentinel = WideRational4096::new(19, 7).unwrap();
        let mut work = [WideRational4096::zero(); WIDE_RATIONAL_WORK_SLOTS];
        let mut output = sentinel;
        assert!(!top.checked_mul_into(&top, &mut work, &mut output)); assert_eq!(output, sentinel);
        assert!(!top.checked_add_divisible_into(&top, &mut work, &mut output));
        assert_eq!(output, sentinel);
        assert!(!top.checked_div_into(&zero, &mut work, &mut output)); assert_eq!(output, sentinel);
    }

    #[test]
    fn borrowed_wide_rational_work_is_fixed_and_reusable_without_stale_words() {
        let mut work = [WideRational4096::zero(); WIDE_RATIONAL_WORK_SLOTS];
        let mut output = WideRational4096::zero();
        for _ in 0..3 {
            assert!(WideRational4096::new(7, 3).unwrap().checked_mul_into(
                &WideRational4096::new(-9, 14).unwrap(), &mut work, &mut output));
            assert_eq!(output, WideRational4096::new(7, 3).unwrap()
                .checked_mul(WideRational4096::new(-9, 14).unwrap()).unwrap());
        }
        assert_eq!(work.len(), WIDE_RATIONAL_WORK_SLOTS);
    }

    #[test]
    fn borrowed_division_keeps_reciprocal_in_slot_seven_without_aggregate_copies() {
        let a = WideRational4096::new(-35, 18).unwrap();
        let b = WideRational4096::new(-14, 15).unwrap();
        let mut work = [WideRational4096::from_words(SignedWide4096::from_parts(false,
            UnsignedWide4096::ONE.checked_shl(4095).unwrap()), UnsignedWide4096::ONE).unwrap();
            WIDE_RATIONAL_WORK_SLOTS];
        let sentinel = WideRational4096::new(19, 7).unwrap(); let mut output = sentinel;
        let old = a.checked_div(b).unwrap();
        assert!(a.checked_div_into(&b, &mut work, &mut output));
        assert_eq!(output, old);
        assert_eq!(work[7].numerator.negative, b.numerator.negative);
        assert_eq!(work[7].numerator.magnitude, b.denominator);
        assert_eq!(work[7].denominator, b.numerator.magnitude);
        output = sentinel;
        assert!(a.checked_div_into(&b, &mut work, &mut output));
        assert_eq!(output, old);
        let zero = WideRational4096::zero(); output = sentinel;
        assert!(!a.checked_div_into(&zero, &mut work, &mut output));
        assert_eq!(output, sentinel);
    }

    #[test]
    fn borrowed_wide_rational_primitives_allocate_nothing() {
        assert_eq!(core::mem::size_of::<[WideRational4096; WIDE_RATIONAL_WORK_SLOTS]>(),
                   core::mem::size_of::<WideRational4096>() * WIDE_RATIONAL_WORK_SLOTS);
    }

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
