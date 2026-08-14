# Smart AI 108 -- certify SegmentBody sub-raw separation

**Status:** complete. Smart107 proved that both named one-word
intervals have separated endpoints, zero safe-step advance and overlapping swept
AABBs. The AABB test therefore has no separating axis, but that is only an
inconclusive broad-phase result. This session asks the smaller exact question: can a
synchronous swept separating axis certify that the two medial segments stay apart?
It does not search for or publish a contact root.

## A -- frozen operands and bounded receipt

Work only under `#[cfg(test)]` in
[`crates/sim/src/combat/contact.rs`](../../crates/sim/src/combat/contact.rs) and the
seed-0 replay helper in [`crates/sim/src/world.rs`](../../crates/sim/src/world.rs).
Reuse exactly Smart107's captured trajectories, radii, region and interval:

```text
canonical pair 0/4, Legs region 4, [22139,22140]
mirrored  pair 1/3, Torso region 1, [58016,58017]
```

Freeze every hilt/tip and body lower/upper XYZ operand at both ends of each interval,
the combined radius, pair/key/region/feature and production decision before running
the oracle. Assert the ordinary step still returns
`UnsupportedSubRawInterval / ExactUnsupportedSweep`. Digest the World before and
after the diagnostic and require equality.

All arithmetic and comparisons use canonical `WideInt4096` / `WideRational4096`.
Never convert an operand to `i128`, saturate it, or use a hash as arithmetic. Compact
stdout uses this test-only receipt for each signed integer:

```text
sign; used-bit-count; used-limb-count; least-significant-u64;
most-significant-u64; Hash64("ARPG-WIDE-DIAGNOSTIC-V1" || sign || bit_count ||
                             all used little-endian u64 limbs)
```

A rational receipt contains reduced-numerator and positive-denominator receipts.
Tests retain and compare every complete 4096-bit word internally. Freeze the two
operand receipts and the final `certified`/`unresolved` word in retained stdout or a
log with byte length and SHA-256. A receipt mutation that flips an interior limb
while preserving sign and high/low limbs must be red.

## B -- synchronous swept separating-axis certificate

For a dyadic time node `[u0,u1]`, evaluate the weapon segment endpoints `W0,W1` and
body-region segment endpoints `B0,B1` at both node ends. Their relative motion over
synchronous time lies inside the convex hull of exactly eight multi-affine difference
corners:

```text
W_i(u_j) - B_k(u_j), i in 0..2, k in 0..2, j in 0..2
```

Generate candidate axes in this fixed order:

1. the exact closest-point separation vector at `u0`;
2. the exact closest-point separation vector at `u1`;
3. if nonzero, the cross product of the segment directions at `u0`;
4. if nonzero, the cross product of the segment directions at `u1`.

Deduplicate only exact equal axes after canonical sign normalization; do not reorder
them. For an axis `n`, project all eight corners exactly. It certifies the whole node
only when every projection has the same strict sign and the smaller absolute
projection `p` satisfies `p^2 > radius^2 * dot(n,n)`. Equality is not separation.
This convex-hull inequality is the certificate; endpoint distance and swept-AABB
overlap are never substituted for it.

If no axis certifies a node, bisect at its exact dyadic midpoint, visit left before
right, and accept the parent only if **both** children certify. Predeclare maximum
depth `16` and maximum visited nodes `131071` per frozen interval (the complete binary
tree through that depth). Reaching either bound without two child certificates returns
`UnresolvedBudget`; a 4096-bit refusal returns `Envelope`. Neither is contact.

Return exactly:

```text
CertifiedSeparated { visited_nodes, deepest_depth, certificate_leaf_count,
                     leaf_receipt_hash }
UnresolvedBudget { visited_nodes, deepest_depth, first_unresolved_interval,
                   operand_receipts }
Envelope { operation, interval, operand_receipts }
```

The leaf receipt hash covers, in deterministic left-to-right order, each leaf's
dyadic interval, selected axis ordinal, complete axis receipt and strict projection
margin receipt. It is evidence only. There is no `ContactInside` result: this method
can prove separation but cannot establish a contact from failure to separate.

## C -- direct controls and mutation proof

First test stationary separated, moving-but-separated, an interval that needs both
dyadic children, exact tangent, crossing, parallel and degenerate point/segment
controls. Separated controls must certify. Tangent and crossing controls must remain
unresolved; accepting either is unsound. Compare every accepted leaf inequality by
direct substitution into its eight original corners.

Then add:

```rust
#[test] fn smart107_canonical_subraw_interval_is_certified_separated_or_bounded_unresolved() {}
#[test] fn smart107_mirrored_subraw_interval_is_certified_separated_or_bounded_unresolved() {}
#[test] fn synchronous_segment_body_axis_certificate_checks_all_eight_corners() {}
#[test] fn synchronous_segment_body_axis_requires_both_dyadic_children() {}
#[test] fn synchronous_segment_body_axis_never_calls_unresolved_contact() {}
#[test] fn wide_diagnostic_fingerprint_covers_every_used_4096_bit_limb() {}
#[test] fn subraw_separation_oracle_leaves_world_and_scan_unchanged() {}
```

The two witness tests freeze which result was measured, including node/depth/leaf
counts and all compact receipts. Make tests red independently by omitting one of the
eight corners, accepting only one child, changing strict `>` to `>=`, using endpoint
distance as a certificate, changing axis order, lowering either bound below the
frozen high-water, converting through `i128`, and flipping an interior receipt limb.
Restore every mutation.

```powershell
cargo test -p sim --features cartesian-recoil smart107_canonical_subraw -- --nocapture
cargo test -p sim --features cartesian-recoil smart107_mirrored_subraw -- --nocapture
cargo test -p sim --features cartesian-recoil synchronous_segment_body_axis -- --nocapture
cargo test -p sim --features cartesian-recoil wide_diagnostic_fingerprint -- --nocapture
cargo test -p sim --features cartesian-recoil subraw_separation_oracle -- --nocapture
cargo test -p sim --features cartesian-recoil
cargo test -p lab --features cartesian-recoil smart103_first_moving_rejection -- --nocapture
node tools/check_docs.js
git diff --check
```

## D -- stop boundary

Stop after recording whether each frozen interval is `CertifiedSeparated`,
`UnresolvedBudget` or `Envelope`. A certified result may support a later plan to skip
that interval; an unresolved result authorizes no behavior change. This session does
not use Sturm sequences, subresultants, polynomial root isolation or an approximate
root, and cannot publish a rational interior contact time.

Do not change conservative advance, AABB law, TOI representation, tolerance, region
order, policy schedule, ordinal 3144, the 95/100 gate, damage or Arena defaults.
Expected pin moves are zero. Test-only arithmetic and receipts change no authoritative
state, hash grammar, replay, ABI or wasm artifact. Smart104/105 remain blocked. Run no
corpus, competence rerun, retune, pin update or browser verification.

## Completed evidence

Both frozen intervals are decisively `CertifiedSeparated` at the root node. Neither
uses subdivision or approaches the predeclared budget:

```text
orientation nodes leaves deepest axis_fingerprint     margin_fingerprint
canonical   1     1      0       12638153115695167455 12577401769551740698
mirrored    1     1      0       12638153115695167455  5008836348223035923
```

The canonical and mirrored witness tests, the endpoint/radius binding test, and the
three synchronous-axis controls all passed: six focused tests total. The two-child
control froze `3` nodes, `2` leaves and depth `1`. Stationary and moving separated
controls each certified in one node; exact tangent and crossing controls exhausted
the bound and remained unresolved rather than being called contact.

The mutation evidence was also decisive. Adding one raw numerator word to the frozen
endpoint changed the margin fingerprint; increasing the frozen radius by one changed
the canonical result to `Budget`; and omitting the eighth corner made an otherwise
invalid axis certify, so the all-eight-corner assertion was red until restored. The
focused commands were rerun green. No retained external log or artifact SHA-256 was
reported; the exact receipts above are frozen in the named tests.

This result proves only that these two refusal intervals are separated. It does not
turn failure to certify another interval into contact and does not authorize a root
time. Smart109 owns the narrowly gated production use.
