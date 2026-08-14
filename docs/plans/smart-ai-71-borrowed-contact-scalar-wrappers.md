# Smart AI 71 -- borrow contact scalar wrappers

**Status:** stopped and reverted after a measured disproof; no contact edit survives. Smart75 repaired the
canonical-zero/nonzero fast branches and passed word/refusal tests and the zero-frame
gate. The new frozen baseline is the `29968552`-byte Smart75 wasm lib-test artifact,
SHA-256 `6A53736B360F13BF76D7C28A95341A7929DB925CBB75E9E63F13652425702C5A`;
`contact::wide_vector_sub` remains frame `9328` at body offset `2196213`, and every
requested borrowed primitive remains frame `0`. The attempted baseline then stopped
because `wide_segment_segment_points_from_origin` is inlined and has no name; the plan
required a measurement it could not make, so no contact edit began. The corrected
four stable retained callers and frames are `wide_vector_sub=9328`,
`wide_segment_segment_points=153376`, `wide_response_velocity=7536`, and
`exact_contact_at_pose=107600`. Smart71 may resume against those exact before-values.
No scratch, behavior, pin or corpus has moved. The attempted smallest family change
put one local `[WideRational4096;8]` in `wide_vector_sub`, reused it across all three
axes, and called the borrowed subtraction. Its wasm frame grew from `9328` to `12432`,
a regression of `+3104`, rather than shrinking. The branch was fully reverted. Thus
the local eight-slot premise of this session is invalid; Smart76 must determine the
minimum subtraction work and compare a caller-retained seam before any scalar-family
migration resumes.

## A -- superseded scalar wrapper API and migration boundary

Edit `crates/sim/src/combat/contact.rs` only. Alongside the current by-value test
oracle, give each contact scalar wrapper a borrowed/caller-output form accepting an
eight-slot Smart69 work array:

```rust
fn wide_add_into(a: &WideRational4096, b: &WideRational4096,
    work: &mut [WideRational4096; 8], out: &mut WideRational4096)
    -> Result<(), ExactScanReject>;
fn wide_sub_into(/* same */) -> Result<(), ExactScanReject>;
fn wide_mul_into(/* same */) -> Result<(), ExactScanReject>;
fn wide_div_into(/* same */) -> Result<(), ExactScanReject>;
fn wide_cmp_into(a: &WideRational4096, b: &WideRational4096,
    work: &mut [WideRational4096; 8], out: &mut Ordering)
    -> Result<(), ExactScanReject>;
```

They call only Smart69's `_into` methods, map `false` to
`ArithmeticEnvelope`, and leave `out` unchanged on error. `wide_sub_into` uses
`checked_neg_into` followed by `checked_add_divisible_into` with disjoint work/output
slots; it must not call an old by-value wrapper.

Migrate scalar call sites by these exact families, keeping their existing local
results as caller outputs for now:

1. vector/point primitives: `wide_vector_sub`, `wide_vector_add`, `wide_cross`,
   `wide_dot`, `wide_point_at`, `wide_clamp_unit`, `wide_segment_candidate`,
   `wide_candidate_cmp`;
2. segment/rectangle primitives: `wide_segment_segment_points_from_origin`,
   `wide_rectangle_parameters`, `wide_segment_rectangle_points`;
3. publication/trajectory helpers: `wide_l1`, `wide_midpoint`,
   `wide_point_in_frame`, `wide_midpoint_in_frame`, `wide_response_velocity`,
   `wide_motor_coordinate`, `wide_response_coordinate`, `wide_evaluated_point`,
   `wide_held_relative_point`, and `make_wide_candidate`;
4. sweep/recompute helpers: `wide_affine_rectangle_is_maintained`,
   `wide_aabb_points_are_disjoint`, `wide_segment_body_at_time`, `wide_velocity`,
   `wide_relative_bound`, `wide_safe_step`, `wide_sweep_segments`,
   `wide_sweep_segment_shield`, `wide_sweep_segment_body`, and
   `exact_contact_at_pose`.

Pass a local eight-slot array down each family root rather than constructing one in
each scalar call. Do not add it to `ExactWideScratch` yet: Smart71 proves API/callsite
equivalence, not total-chain headroom. Delete production uses of the five old contact
wrappers only after all four families compile; retain old implementations solely
under `#[cfg(test)]` as oracle.

## B -- superseded behavior and mechanical mutation gates

```rust
#[test] fn borrowed_contact_scalars_match_every_old_word_and_refusal() {}
#[test] fn borrowed_contact_scalars_leave_outputs_unchanged_on_refusal() {}
#[test] fn every_exact_geometry_family_uses_one_reusable_scalar_work_array() {}
#[test] fn borrowed_contact_scalars_preserve_the_smart56_recompute_row() {}
```

The matrix covers zero, signs, equal/divisible/coprime denominators, limb boundaries,
comparison ties, divide by zero and adjacent envelope overflow. Compare complete
segment/segment, every body region, and shield face/edge results to the old path.
Mutate one family back to a by-value wrapper, reverse subtraction, and commit before
refusal; the frame, equality and atomicity tests respectively go red, then restore.

## C -- stopped frame result

Build the wasm lib-test artifact and run Smart69's parser on five `#[inline(never)]`
contact scalar drivers plus these four stable retained callers, one per migration
family:

```text
vector/point             wide_vector_sub                 9328
segment/rectangle        wide_segment_segment_points   153376
publication/trajectory  wide_response_velocity          7536
sweep/recompute          exact_contact_at_pose          107600
```

The values are from the frozen Smart75 artifact above. The inlined
`wide_segment_segment_points_from_origin` is deliberately not a measurement root;
its retained caller owns its cost. If optimization removes any corrected root, add a
`#[cfg(test)] #[inline(never)]` driver in `contact.rs` which calls that exact family,
build and record a fresh pre-conversion baseline artifact with the driver, then build
the converted artifact with the byte-identical driver. Never compare a new driver to
an absent frozen name or use artifact size as its baseline.

Record baseline/new frames and signed deltas. Acceptance requires every scalar driver
frame `0` and all four family roots strictly smaller than the exact values above;
total production headroom is not claimed. If any root grows/disappears without the
paired driver protocol, or a value/rejection changes, revert.

```powershell
cargo test -p sim borrowed_contact_scalars --features cartesian-recoil -- --nocapture
cargo test -p sim every_exact_geometry_family --features cartesian-recoil -- --nocapture
$env:CARGO_TARGET_DIR='target/smart71-wasm-tests'
cargo test -p sim --lib --target wasm32-unknown-unknown --features cartesian-recoil --no-run
$wasm=(Get-ChildItem 'target/smart71-wasm-tests/wasm32-unknown-unknown/debug/deps/sim-*.wasm' | Sort-Object LastWriteTimeUtc | Select-Object -Last 1)
$wasm.FullName; $wasm.Length; (Get-FileHash -Algorithm SHA256 $wasm).Hash
node tools/wasm_stack_frames.js $wasm 'wide_(add|sub|mul|div|cmp)_driver|wide_vector_sub|wide_segment_segment_points|wide_response_velocity|exact_contact_at_pose'
Remove-Item Env:CARGO_TARGET_DIR
node tools/check_docs.js
git diff --check
```

Do not execute this plan again. Its exact measured delta is
`wide_vector_sub 9328 -> 12432 (+3104)` for one local eight-slot array reused across
three axes. Smart76 replaces the workspace premise. No release feature digest, pin,
full suite or corpus ran.
