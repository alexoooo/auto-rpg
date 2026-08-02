use crate::angle::Angle;
use crate::fixed::Fx;
use crate::vec2::Vec2;

const PCG_MULT: u64 = 6_364_136_223_846_793_005;
const GOLDEN: u64 = 0x9E37_79B9_7F4A_7C15;

/// PCG32 (XSH-RR), seeded through SplitMix64.
///
/// Chosen over anything from the ecosystem for one reason: the algorithm is
/// twelve lines of integer arithmetic that will produce the same stream in ten
/// years and on any target. A dependency that "improves" its generator in a
/// point release would invalidate every recorded run we own.
///
/// State is threaded explicitly -- there is no thread-local or global RNG
/// anywhere in this project, by design.
#[derive(Clone, PartialEq, Eq, Hash, Debug)]
pub struct Rng {
    state: u64,
    inc: u64,
}

#[inline]
fn splitmix64(x: &mut u64) -> u64 {
    *x = x.wrapping_add(GOLDEN);
    let mut z = *x;
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    z ^ (z >> 31)
}

impl Rng {
    pub fn new(seed: u64) -> Rng {
        let mut sm = seed;
        let init = splitmix64(&mut sm);
        let stream = splitmix64(&mut sm);
        let mut rng = Rng {
            state: 0,
            inc: (stream << 1) | 1, // must be odd
        };
        rng.next_u32();
        rng.state = rng.state.wrapping_add(init);
        rng.next_u32();
        rng
    }

    /// A stream derived from a seed plus two coordinates.
    ///
    /// This is how the sim gets per-entity, per-tick randomness (observation
    /// noise, tie-breaks) without any shared mutable RNG: the value depends
    /// only on *what* is being decided, never on the order in which entities
    /// happen to be visited. Iteration order can then change freely without
    /// changing results.
    pub fn from_stream(seed: u64, a: u64, b: u64) -> Rng {
        let mut mixed =
            seed ^ a.wrapping_mul(GOLDEN) ^ b.wrapping_mul(0xBF58_476D_1CE4_E5B9).rotate_left(32);
        Rng::new(splitmix64(&mut mixed))
    }

    #[inline]
    pub fn next_u32(&mut self) -> u32 {
        let old = self.state;
        self.state = old.wrapping_mul(PCG_MULT).wrapping_add(self.inc);
        let xorshifted = (((old >> 18) ^ old) >> 27) as u32;
        let rot = (old >> 59) as u32;
        xorshifted.rotate_right(rot)
    }

    #[inline]
    pub fn next_u64(&mut self) -> u64 {
        ((self.next_u32() as u64) << 32) | self.next_u32() as u64
    }

    /// Uniform in `0..n`, unbiased by rejection. `n == 0` yields `0`.
    pub fn below(&mut self, n: u32) -> u32 {
        if n <= 1 {
            return 0;
        }
        // Rejection threshold: discard the first `2^32 mod n` values so the
        // remaining range is an exact multiple of n.
        let threshold = (u32::MAX - n + 1) % n;
        loop {
            let r = self.next_u32();
            if r >= threshold {
                return r % n;
            }
        }
    }

    /// Uniform in `lo..=hi`.
    pub fn range_i32(&mut self, lo: i32, hi: i32) -> i32 {
        if hi <= lo {
            return lo;
        }
        lo + self.below((hi - lo + 1) as u32) as i32
    }

    /// Uniform in `[0, 1)`.
    #[inline]
    pub fn unit(&mut self) -> Fx {
        Fx::from_raw((self.next_u32() >> 16) as i32)
    }

    /// Uniform in `[-1, 1)`.
    #[inline]
    pub fn signed_unit(&mut self) -> Fx {
        Fx::from_raw((self.next_u32() >> 15) as i32 - crate::fixed::ONE_RAW)
    }

    /// Uniform in `[lo, hi)`.
    #[inline]
    pub fn range(&mut self, lo: Fx, hi: Fx) -> Fx {
        lo + (hi - lo) * self.unit()
    }

    /// Approximately normal, mean 0, standard deviation `sigma`.
    ///
    /// Sum of four uniforms (Irwin-Hall) instead of Box-Muller, because
    /// Box-Muller needs `ln` and `sqrt` of arbitrary values -- exactly the
    /// transcendentals this project refuses to depend on.
    pub fn gaussian(&mut self, sigma: Fx) -> Fx {
        let mut acc = Fx::ZERO;
        for _ in 0..4 {
            acc += self.signed_unit();
        }
        // Var(sum of 4 uniforms on [-1,1]) = 4/3, so sd = 1.1547; divide it out.
        acc * Fx::from_ratio(866, 1000) * sigma
    }

    #[inline]
    pub fn angle(&mut self) -> Angle {
        Angle::from_raw(self.next_u32() as u16)
    }

    #[inline]
    pub fn unit_vec(&mut self) -> Vec2 {
        Vec2::from_angle(self.angle())
    }

    /// True with probability `num / den`.
    #[inline]
    pub fn chance(&mut self, num: u32, den: u32) -> bool {
        self.below(den) < num
    }

    /// Opaque state, for folding into a world hash.
    #[inline]
    pub fn fingerprint(&self) -> (u64, u64) {
        (self.state, self.inc)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn same_seed_same_stream() {
        let mut a = Rng::new(12345);
        let mut b = Rng::new(12345);
        for _ in 0..1000 {
            assert_eq!(a.next_u32(), b.next_u32());
        }
    }

    #[test]
    fn different_seeds_diverge() {
        let mut a = Rng::new(1);
        let mut b = Rng::new(2);
        let differs = (0..100).any(|_| a.next_u32() != b.next_u32());
        assert!(differs);
    }

    #[test]
    fn streams_are_order_independent() {
        // The point of from_stream: asking for entity 7's noise at tick 300
        // gives the same answer regardless of what else was drawn.
        let a = Rng::from_stream(99, 300, 7);
        let b = Rng::from_stream(99, 300, 7);
        assert_eq!(a, b);
        assert_ne!(Rng::from_stream(99, 300, 7), Rng::from_stream(99, 300, 8));
        assert_ne!(Rng::from_stream(99, 300, 7), Rng::from_stream(99, 301, 7));
        assert_ne!(Rng::from_stream(98, 300, 7), Rng::from_stream(99, 300, 7));
    }

    #[test]
    fn below_stays_in_range_and_is_roughly_uniform() {
        let mut rng = Rng::new(7);
        let mut buckets = [0u32; 6];
        for _ in 0..60_000 {
            let v = rng.below(6);
            assert!(v < 6);
            buckets[v as usize] += 1;
        }
        for (i, &c) in buckets.iter().enumerate() {
            assert!((9_000..11_000).contains(&c), "bucket {i} got {c}");
        }
        assert_eq!(rng.below(0), 0);
        assert_eq!(rng.below(1), 0);
    }

    #[test]
    fn unit_is_in_range() {
        let mut rng = Rng::new(3);
        for _ in 0..10_000 {
            let u = rng.unit();
            assert!(u >= Fx::ZERO && u < Fx::ONE, "{u}");
            let s = rng.signed_unit();
            assert!(s >= -Fx::ONE && s < Fx::ONE, "{s}");
        }
    }

    #[test]
    fn gaussian_has_the_requested_spread() {
        let mut rng = Rng::new(11);
        let sigma = Fx::from_int(2);
        let n = 20_000;
        let mut sum = Fx::ZERO;
        let mut sum_abs = Fx::ZERO;
        for _ in 0..n {
            let g = rng.gaussian(sigma);
            sum += g / n;
            sum_abs += g.abs() / n;
        }
        assert!(sum.abs() < Fx::from_ratio(1, 10), "mean drifted: {sum}");
        // E|X| for this distribution lands near 0.8 sigma.
        assert!(
            sum_abs > Fx::from_int(1) && sum_abs < Fx::from_int(2),
            "mean |x| = {sum_abs}"
        );
    }

    #[test]
    fn range_respects_bounds() {
        let mut rng = Rng::new(5);
        let lo = Fx::from_int(-3);
        let hi = Fx::from_int(7);
        for _ in 0..1000 {
            let v = rng.range(lo, hi);
            assert!(v >= lo && v < hi, "{v}");
        }
        for _ in 0..1000 {
            let v = rng.range_i32(-3, 7);
            assert!((-3..=7).contains(&v));
        }
    }
}
