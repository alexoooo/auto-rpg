//! The evolvable surface a policy exposes.
//!
//! Every hand-authored policy in this crate has a struct of named weights and
//! wants exactly three things from the outside world: evolution wants to
//! perturb them as a flat vector of genes in `0..=1`, the lab wants to print
//! them with their names, and the browser wants to put a labelled slider on
//! each one. [`PolicySpec`] is that shared surface, so a new policy declares its
//! knobs once and gets all three for free.
//!
//! Genes are `0..=1` rather than the weights themselves because a mutation
//! operator should not have to know that `caution` tops out at 0.6 while
//! `obedience` runs to 3. It perturbs a unit interval; the spec puts the value
//! back where it belongs.

use fx::Fx;

/// Upper bound on genes in any one policy.
///
/// Fixed rather than dynamic so the lab's genome stays a `Copy` array and its
/// evolution loop keeps allocating nothing at all.
pub const MAX_GENOME_LEN: usize = 24;

/// What a policy's weights are called, what range each lives in, and where a
/// hand-tuned one starts.
///
/// The three slices are parallel and must be the same length; [`PolicySpec::new`]
/// is the only constructor and it checks.
#[derive(Clone, Copy, Debug)]
pub struct PolicySpec {
    labels: &'static [&'static str],
    ranges: &'static [(Fx, Fx)],
    baseline: &'static [Fx],
}

impl PolicySpec {
    /// Panics if the three slices disagree, or if there are more knobs than
    /// [`MAX_GENOME_LEN`]. Both are programming errors in a `const` table that
    /// would otherwise surface as a silently truncated genome.
    pub const fn new(
        labels: &'static [&'static str],
        ranges: &'static [(Fx, Fx)],
        baseline: &'static [Fx],
    ) -> PolicySpec {
        assert!(labels.len() == ranges.len());
        assert!(labels.len() == baseline.len());
        assert!(labels.len() <= MAX_GENOME_LEN);
        PolicySpec {
            labels,
            ranges,
            baseline,
        }
    }

    #[inline]
    pub const fn len(&self) -> usize {
        self.labels.len()
    }

    #[inline]
    pub const fn is_empty(&self) -> bool {
        self.labels.is_empty()
    }

    #[inline]
    pub fn labels(&self) -> &'static [&'static str] {
        self.labels
    }

    #[inline]
    pub fn label(&self, i: usize) -> &'static str {
        self.labels.get(i).copied().unwrap_or("")
    }

    #[inline]
    pub fn range(&self, i: usize) -> (Fx, Fx) {
        self.ranges.get(i).copied().unwrap_or((Fx::ZERO, Fx::ONE))
    }

    /// Maps gene `i` onto its weight range.
    ///
    /// Genes outside `0..=1` clamp and missing genes take the middle of their
    /// range, so a mutation operator never has to care and a genome that is
    /// shorter than the spec is a partial specification rather than an error.
    pub fn value(&self, i: usize, genes: &[Fx]) -> Fx {
        let (lo, hi) = self.range(i);
        let t = genes
            .get(i)
            .copied()
            .unwrap_or(Fx::HALF)
            .clamp(Fx::ZERO, Fx::ONE);
        lo + (hi - lo) * t
    }

    /// The inverse of [`PolicySpec::value`], to within the last bit or two.
    pub fn gene(&self, i: usize, value: Fx) -> Fx {
        let (lo, hi) = self.range(i);
        ((value - lo) / (hi - lo)).clamp(Fx::ZERO, Fx::ONE)
    }

    /// The hand-tuned weights, expressed as genes. This is what evolution
    /// starts from and what the browser's "reset" button restores.
    pub fn baseline_genome(&self) -> [Fx; MAX_GENOME_LEN] {
        let mut genes = [Fx::HALF; MAX_GENOME_LEN];
        for (i, (gene, value)) in genes.iter_mut().zip(self.baseline).enumerate() {
            *gene = self.gene(i, *value);
        }
        genes
    }

    /// The hand-tuned weight for knob `i`.
    pub fn baseline_value(&self, i: usize) -> Fx {
        self.baseline.get(i).copied().unwrap_or(Fx::ZERO)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const LABELS: [&str; 3] = ["a", "b", "c"];
    const RANGES: [(Fx, Fx); 3] = [
        (Fx::ZERO, Fx::from_int(2)),
        (Fx::from_ratio(3, 10), Fx::ONE),
        (Fx::from_int(-1), Fx::ONE),
    ];
    const BASE: [Fx; 3] = [Fx::ONE, Fx::from_ratio(85, 100), Fx::ZERO];
    const SPEC: PolicySpec = PolicySpec::new(&LABELS, &RANGES, &BASE);

    #[test]
    fn genes_round_trip_through_their_ranges() {
        for (i, base) in BASE.iter().enumerate() {
            let gene = SPEC.gene(i, *base);
            let back = SPEC.value(i, &[gene, gene, gene]);
            assert!((back - *base).abs() < Fx::from_ratio(1, 1000), "knob {i}");
        }
    }

    #[test]
    fn genes_outside_the_unit_interval_clamp_to_the_range() {
        let wild = [Fx::from_int(-5); 3];
        assert_eq!(SPEC.value(0, &wild), Fx::ZERO);
        assert_eq!(SPEC.value(1, &wild), Fx::from_ratio(3, 10));
        let wild = [Fx::from_int(9); 3];
        assert_eq!(SPEC.value(0, &wild), Fx::from_int(2));
        assert_eq!(SPEC.value(1, &wild), Fx::ONE);
    }

    #[test]
    fn a_short_genome_takes_the_middle_of_what_is_missing() {
        assert_eq!(SPEC.value(0, &[Fx::ZERO]), Fx::ZERO);
        assert_eq!(SPEC.value(1, &[Fx::ZERO]), Fx::from_ratio(65, 100));
        assert_eq!(SPEC.value(2, &[]), Fx::ZERO);
    }

    #[test]
    fn the_baseline_genome_restores_the_baseline_weights() {
        let genes = SPEC.baseline_genome();
        for (i, base) in BASE.iter().enumerate() {
            let v = SPEC.value(i, &genes);
            assert!((v - *base).abs() < Fx::from_ratio(1, 1000), "knob {i}");
        }
    }
}
