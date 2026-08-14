# Smart AI 87 -- land retained exact segment geometry

**Status:** stopped and fully reverted. The fused geometry passed all five focused
tests, retained its measured small frames, and made the real feature stream complete
repeatably with native/wasm equality. Acceptance nevertheless stopped on an exact
resolution semantic refusal: `a_solved_group_grows_no_retained_scratch` fails with
`ExactScan` at `Recompute` for WeaponWeapon key `0:1/1:1`. After fully reverting
Smart87 geometry, the identical failure persists on the Smart86 baseline, proving it
is inherited rather than introduced by this rewrite. No geometry survives, no pin or
corpus ran, and Smart86 remains accepted only for its owner/runtime prerequisite.

## A -- reproduce only the measured fused state machine

Edit `crates/sim/src/combat/contact.rs`. Add the heap-backed `SegmentWorkState` to
feature/test `ExactWideScratch`, using the frozen storage and ownership from
Smart78--85:

```text
arithmetic rationals       8
persistent rationals      16 (slot 13 NEGATED_RHS, disjoint)
points                    10
vectors                    3
candidates                 5
one committed closest row
candidate_count/winner     u8
```

Retain each large arena in a pre-sized Vec initialized by
`ExactWideScratch::try_reserve`; include lengths/capacities in
`ContactCollectionScratch` tests. Replace only segment-segment exact geometry with a
caller-output method that runs:

```text
translate: borrowed helper 1040 / phase 0
solve plus retained interior candidate
fused endpoint projection and direct candidate commit, ordinal 1..=4
borrowed distance/A/B/feature selection
field-atomic origin restore, feature last
```

Use the actual accepted Smart85 fusion, not the superseded prediction: release driver
`16`, fused project `1568`, interior candidate `1040`, select `16`, maximum phase
`1568`. Do not restore the pre-fuse nested project/candidate chain `2624`. Preserve
arithmetic parenthesization, zero/parallel/degenerate branches, endpoint ordinals,
distance then A/B/feature tie order, exact refusal and translation restore. Exact-
contact borrows the committed row while its state borrow is live; no large closest
row crosses the old return ABI.

Rectangle/shield algorithms, wide AABB scratch, conservative advancement, tolerance,
bounds, candidate selection policy, response, public ABI, hash grammar and default
geometry are unchanged. Keep the old segment implementation as `#[cfg(test)]` oracle
until all acceptance gates finish.

## B -- exact equivalence, capacity and mutation proof

Re-run Smart85's `2/2` focused equivalence/capacity fixtures and expand them over the
Smart48 literal reflected pair, interior and four endpoint winners, parallel,
degenerate, translated/equal-tie rows, dirty reuse and every arithmetic-envelope
refusal. Compare all limbs of A/B/distance, feature, refusal and visitation order.

```rust
#[test] fn retained_segment_work_state_matches_every_old_word_and_refusal() {}
#[test] fn retained_segment_work_state_commits_only_a_complete_winner() {}
#[test] fn retained_segment_work_state_uses_declared_slots_without_growth() {}
#[test] fn exact_contact_borrows_the_retained_segment_winner_without_copy() {}
#[test] fn cloned_contact_scratch_rereserves_empty_segment_work() {}
```

The clone test is mandatory after Smart86's discovered hazard: clear every retained
segment Vec, clone the owning runtime/scratch, reserve at the already-declared high
water, evaluate twice, and require stable pointers/capacities. Mutation proof must
make named tests red for a by-value closest return, pre-fuse nested candidate call,
swapped u/v or endpoint ordinal, `Less|Equal`, early feature commit, aliased work, and
one omitted reserve/length initialization. Restore every mutation.

## C -- classify all 28 inherited feature reds

Capture the exact pre-Smart87 failure output and the independently listed test names
from:

```powershell
cargo test -p sim --features cartesian-recoil
cargo test -p sim --features cartesian-recoil -- --list
```

After geometry lands, account for every test by exact name in the Smart87 result:

1. **geometry-stack red now green** -- unchanged assertion, passes because the known
   segment path no longer traps;
2. **stale structural expectation** -- only an expected capacity/frame inventory
   changed; update it to the predeclared state and demonstrate a one-slot mutation;
3. **real semantic/refusal mismatch** -- stop and revert; do not change the oracle,
   tolerance, expected row, rejection, fixture or digest to make it green;
4. **unrelated pre-existing red** -- prove it is identical before/after by exact name
   and output; report it, but Smart87 cannot call the full feature gate green.

The acceptance target is zero feature failures. “Mostly geometry” is not a waiver.
Run default sim and whole-workspace tests as separate controls; any new default red or
registered-pin movement stops the session.

## D -- release frames, real runtime and digest agreement

Build a fresh feature release web artifact in `target/smart87-feature-wasm`; record
absolute path, bytes and SHA-256. Parse the full real call chain with the repository
parser and `--show-prefix`:

```text
compute_articulated_stream_digest
World::step_with_arm_rates
solve_exact_contact_tick
exact_contact_at_pose
wide_sweep_segments / wide_segment_body_at_time
retained segment driver and every phase
advance_exact_into / apply_exact_group_into
ExactKinematics finish/apply
```

Smart86 controls must not regress: advance `<=1872`, apply `<=304`, finish/apply zero,
solve `<=480`, World step `<=96256`; retained geometry must be driver `<=16`, project
`<=1568`, candidate `<=1040`, select `<=16`, with no closest sret. Record the actual
active path rather than adding every named frame indiscriminately. Acceptance requires
the deepest reachable chain `<=983040`, at least 64 KiB below the approximately 1 MiB
shadow stack.

Run the actual exported articulated stream digest twice in one wasm instance and once
in a fresh instance. All calls must complete without OOB, agree at
`0x2d323ac56c901e88` (the already measured native feature witness), and show no memory
growth after first initialization. Run native feature twice and require the same
value. This remains an unpinned feature witness; a different value is a semantic
change and stops rather than authorizing a pin. Default native/wasm browser pins,
including geometry, contact behavior and articulated stream, must remain unchanged.

Only after exact equivalence, zero feature failures, default/workspace gates, measured
headroom, repeat runtime and native/wasm digest agreement are all green may Smart87
remain landed. Then stop and record evidence. Smart41's 7,560-case corpus is a later
session; Smart87 neither runs it nor updates a pin.

```powershell
cargo test -p sim retained_segment_work_state --features cartesian-recoil -- --nocapture
cargo test -p sim exact_contact_borrows_the_retained --features cartesian-recoil -- --nocapture
cargo test -p sim cloned_contact_scratch_rereserves --features cartesian-recoil -- --nocapture
cargo test -p sim --features cartesian-recoil
cargo test -p sim
$env:CARGO_TARGET_DIR='target/smart87-feature-wasm'
cargo build --release --target wasm32-unknown-unknown -p web --features cartesian-recoil
$wasm=Resolve-Path 'target/smart87-feature-wasm/wasm32-unknown-unknown/release/web.wasm'
$wasm.Path; (Get-Item $wasm).Length; (Get-FileHash -Algorithm SHA256 $wasm).Hash
node tools/wasm_stack_frames.js $wasm 'compute_articulated_stream_digest|step_with_arm_rates|solve_exact_contact_tick|exact_contact_at_pose|wide_sweep_segments|wide_segment_body_at_time|segment_work|advance_exact_into|apply_exact_group_into|ExactKinematics'
node tools/wasm_stack_frames.js --show-prefix $wasm 'exact_contact_at_pose|wide_sweep_segments|segment_work|advance_exact_into|apply_exact_group_into'
# Use a path-asserting temporary probe to call digest lo/hi twice, print memory pages,
# repeat in a fresh instance, then delete the probe; do not add a feature pin.
Remove-Item Env:CARGO_TARGET_DIR
cargo test
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
node tools/check_docs.js
node tools/check_deps.js
node --test tools/check_deps.test.js
git diff --check
```

## Stopped result

```text
C:\Users\ostro\IdeaProjects\auto-rpg\target\smart87-feature-wasm\wasm32-unknown-unknown\release\web.wasm
bytes 984621
sha256 8419C010257B6C036139B1E65E618EC5D029E1C46438BAD05CE06670CE56107E
```

The retained segment driver was `16`, fused project `1568`, interior candidate
`1040`, and select/comparator `16`. Smart86 controls remained World step `96384`,
solve `480`, advance `1872`, group apply `304`, exact finish/apply zero. The stream
digest completed twice in each of two fresh wasm instances at
`0x2d323ac56c901e88`, with pages `24 -> 74 -> 74`; native returned the same value.
Five focused geometry tests were green. No separate summed shadow-stack headroom was
recorded, so the runtime pass is not rewritten as a numeric headroom claim.

The named semantic blocker was:

```text
combat::resolution::tests::a_solved_group_grows_no_retained_scratch
ExactContactFailure {
  cause: ExactScan,
  phase: Recompute,
  key: WeaponWeapon entity 0 slot 1 / entity 1 slot 1,
}
```

It remains byte-for-byte after reverting the full geometry experiment. Smart87
therefore correctly stopped rather than changing the fixture/refusal. Smart88 owns a
diagnostic-only cause split; Smart87's measured geometry design remains available for
a later reapplication but no production geometry survived this checkpoint.
