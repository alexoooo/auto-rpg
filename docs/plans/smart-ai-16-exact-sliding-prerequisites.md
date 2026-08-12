# Smart AI 16 -- exact sliding prerequisites

**Status:** test-only prerequisites. Session 15's coupled direction iteration returned
`Cycle` after 540 actual projections. Do not retry angle iteration or edit authority
until the three independent primitives below pass.

## Exact representable boundary

For a normalized world tangent direction and fixed physical Coulomb limit, scale every
signed component with checked `i128` multiplication and division by 65,536 toward zero.
Binary-search the greatest nonnegative radial word whose reconstructed world impulse
square is within the limit square. Assert that `rho` is valid and `rho+1` is invalid
unless `rho==i32::MAX`. This is the boundary word; coordinate boxes are not evidence.

## Verified normal bracket

Given a bounded candidate evaluator, require a negative lower residual and nonnegative
upper residual, sampled nondecreasing response, binary lower-bound termination, and
explicit neighbor validation. Reject `Gap` if neither boundary neighbor is within one
raw target unit and `Reversal` if a sampled response decreases. Do not return the first
plausible word without checking both neighbors.

## Fixed cache and counter

Use a fixed 64-entry canonical insertion-order cache for test candidates. Cache hits do
not spend the global projection counter. A unique miss beyond capacity returns
`Capacity`; a miss beyond the configured projection budget returns `Budget`. No heap
growth or unbounded retry is permitted.

All helpers remain under `#[cfg(test)]` in `crates/sim/src/world.rs`. Test-only work
moves no pin. Verification:

Checkpoint evidence: the 3-4-5 signed direction at limit 1,406 selects exact radial
word 1,406 and represented vector `(843,-1124,0)`; `rho+1` is outside by widened
component square, and negating the direction negates the result byte-exactly. Zero
limit returns `(0,ZERO)` and an X direction at `i32::MAX` returns the maximum word.
The normal fixtures distinguish exact root 7, a `-2/+2` restitution `Gap`, sampled
`Reversal`, and invalid `Bounds`. The fixed cache counts two unique pure misses once,
names `Budget` before a third, names `Capacity` on its 65th unique key, and an actual
World projector key repeated twice spends exactly one projection. These prerequisites
are green but do not authorize resuming the angle solver yet: caching full projector
errors/energy and allocation proof remain owed by the integrating successor.

The neighbor-angle KKT prerequisite is also green. Ordered neighbors use wrapping u16
adjacency, both alignment words must be positive, and signed cross must be zero or
change sign. A unique smaller unsigned cross error wins; equal endpoint errors return
`AmbiguousMirrorTie` rather than choosing a handed side. Mirroring reverses endpoint
order and negates angle/cross while mapping the selected physical answer exactly.
Seam, mirror, unbracketed least-bad, and ambiguous-tie mutations were run and reverted.

The first integration attempt replaces the loose radial word with the exact physical
boundary and replaces the unverified binary loop with the neighbor-validating normal
bracket. A gap no longer aborts the whole solve: the retained fixture checks the 16
canonical neighboring angles raw 60,173 through 60,188 under the existing visited
bound. Every one has adjacent normal words 5,623/5,624 outside the one-raw target;
the first is `-2/+3`, the last `-2/+2`. The bounded corpus therefore returns
`NoConvergence` after exactly 608 projections. No candidate reaches KKT or energy
selection. Full-result/energy cache integration, neighbor-angle KKT, and uncached
final validation remain unexercised and owed; this is `revise`, not a successful
integrated solver.

Passing the helper's exact returned vector into projection, rather than rebuilding it
with asymmetric `Fx` multiplication, proves those are real fixed-point restitution
gaps rather than the discarded-vector seam. The final sampled vector at angle 60,188
is raw `(-1223,42,-689)`. Sliding cannot move to an interior radius to hide the gap:
an interior impulse is not a boundary sliding solution. Further representability work
needs explicit component floor/ceil integerization with mirror invariance, not a wider
residual tolerance.

```powershell
cargo test -p sim sliding_prerequisite -- --nocapture
cargo test -p sim friction_ -- --nocapture
node tools/check_docs.js
git diff --check
```
