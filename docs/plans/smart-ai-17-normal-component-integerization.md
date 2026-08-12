# Smart AI 17 -- mirror-invariant normal-component integerization

**Status:** test-only representability decision. Session 16 found restitution gaps at
all 16 exact sliding-boundary directions because componentwise toward-zero normal
rounding jumped from q -2 to at least +2.

For each scalar normal magnitude, compute each exact component product in checked
`i128`. Every nonintegral component contributes floor/ceil words; enumerate at most
eight combinations in canonical XYZ bit order. Symmetry classes share their rounding
bit. Constructing for `-n` must yield exact negatives of `n` candidates after canonical
map-back, and coordinate permutation must permute the candidate set rather than change
it. No lexicographic handed tie may select between mirrored physical answers.

At each of session 16's 16 exact tangent boundary angles, evaluate both neighboring
scalar normal magnitudes and every component candidate through the actual retained
`ContactProjector`. Recompute the physical normal component and Coulomb boundary for
each candidate. Accept only absolute normal residual at most one and widened energy no
greater than initial; score residual, then widened energy, then a mirror-invariant
rounding-class word. The bound is 16 angles * 2 magnitudes * 8 combinations = 256
actual projections. If no candidate passes, close `revise` and reconsider the response
model rather than widening tolerance.

All work is under `#[cfg(test)]`; no authority or pin moves.

The pure candidate set is opposition-closed and coordinate-permutation invariant: the
retained normal has four floor/ceil candidates at each magnitude, and every candidate
for `n` has its exact negative for `-n`. The actual retained corpus evaluates all
`16 * 2 * 4 = 128` candidates under the initial widened-energy ceiling. None reaches
absolute normal residual one. Normal-component integerization therefore does not
recover session 16's gaps and closes `revise` for this response parameterization.

This result also exposes the next model seam rather than authorizing more rounding:
an integerized normal vector can have tangent leakage. The physical cone must bound
the affine combined tangent `B + direction*rho`, not a zero-offset radial vector as
this diagnostic did. A successor would need a checked convex integer interval for
that affine cone, boundary neighbors, final applied-impulse decomposition, and
mirror-invariant tie rejection. Until that model is specified, no further solver or
authority work is justified.
