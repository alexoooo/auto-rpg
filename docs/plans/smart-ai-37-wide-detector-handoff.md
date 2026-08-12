# Smart AI 37 -- wide detector handoff

**Status:** next-session handoff. Smart36 has implemented trajectory authority through
exact World construction, grouped response staging, and atomic precommit, but D4 is
not complete and the feature build is not ready for promotion or a visible-fight
claim. The immediate blocker is routing the new fixed-width exact geometry through
the production nonzero detector without narrowing an intermediate back to `i128`.

This file records the working-tree boundary on 2026-08-12. Read
[`smart-ai-36-exact-lifted-trajectories.md`](smart-ai-36-exact-lifted-trajectories.md)
for the full contract and the corrections that led here. Do not start Lab calibration,
training, tactical scoring, hash re-recording, or browser fight claims from this
checkpoint.

## What is implemented and green

- Smart36 checkpoint A's exact motor plus common/held response grammar, validation,
  breakpoint integration, grouped impulse application, floor reaction, and mutation
  tests.
- The zero-response compatibility detector remains byte-equal to the complete contact
  corpus through the one detector dispatcher.
- Exact `i128` segment/segment, segment/shield, and segment/body research predicates,
  certified advancement, atomic refusal, region ties, and 225-pair frozen oracle.
  These established the algorithm but cannot cover the fixed-lattice 92-bit shipped
  shield denominator in all later predicate products.
- Feature-gated `World` exact-owner state, fixed hash grammar, death/reuse handling,
  real equipment tags/masses, grip transitions, absolute-time kinematics, grouped
  impulse accumulation, two-group rescan evidence, exact finish/precommit, and atomic
  commit. Exact cap, wall, severance energy, and rational finalization are not done.
- A checked construction boundary computes the common lattice before World allocation
  or spawn mutation. Shipped pins are Fighter scale
  `1_283_938_665_662_054_400` with a 92-bit maximum endpoint denominator, and Brute
  scale `59_914_856_794` with a 69-bit maximum. Endpoint lattices through 96 bits are
  accepted; 97 bits return typed `ExactLatticeEnvelope` atomically.
- Fixed-lattice lifecycle continuity tests cover unequal release/reacquire, surviving
  held rows, newly zero held rows, `A -> B -> A`, and right-owned `Both`.
- `crates/sim/src/combat/wide.rs` contains the reviewed stack-only 4,096-bit arithmetic
  substrate and `WideRational4096`. It uses inline `[u32; 128]` limbs, no dependency,
  heap allocation, unsafe code, or host operation. Its exhaustive small oracle,
  carry, every-bit boundary, signed division, overflow, and digest tests are green.
- The wide frozen segment predicate uses `WidePoint`/`WideSegmentClosest`, subtracts a
  pair origin before products, passes the existing 225-pair oracle, and is invariant
  under an irreducible `1 / 2^92` common translation. Removing multiplication carry
  made its named wide test fail before restoration.

The most recent bounded verification reported by the agents was:

```powershell
# green at their respective checkpoints
cargo test -p sim --features cartesian-recoil exact_time_basis_bypasses_mapping
cargo test -p sim --features cartesian-recoil finalized_group_accumulates
cargo test -p sim --features cartesian-recoil seeded_exact_remainder
cargo test -p sim --features cartesian-recoil staged_finalized_strike
cargo test -p sim the_behavioral_contact_corpus_has_literal_outcomes

# current wide module/frozen helper boundary
cargo test -p sim combat::wide::tests
cargo test -p sim wide_segment_selection_is_invariant_to_common_origin_and_scale
git diff --check
```

The last wide-agent compile reached a clean default test-build boundary and
`git diff --check` was green. There has been no final full workspace or final feature
suite after the fixed-lattice and partial wide-detector edits. The wrap-up run of
`node tools/check_docs.js` is red with 21 stale source-line anchors: the new
`world.rs` and `resolution.rs` declarations shifted the existing documentation links.
That mechanical anchor repair is owed before this branch can be called green; the
checker did not report a missing document or an unrecorded authority claim.

## Incomplete code in the working tree

`crates/sim/src/combat/contact.rs` contains draft wide helpers for:

- wide point/radius/distance/L1/floor/publication;
- wide exact response velocity;
- segment and body-region evaluator adapters;
- one-raw relative speed bounds and safe steps;
- draft `wide_sweep_segments` and `wide_sweep_segment_body`.

They compile but are deliberately **not dispatched**. Production nonzero exact scan
and `exact_contact_at_pose` still use the older `i128` path. Do not describe the wide
detector as authoritative until routing and all controls below are green.

Before routing, fix `wide_sweep_segment_body`: exhausting all 96 advances for one
region currently falls through as no contact; it must return the named `Budget`
refusal. The wide frozen candidate selection also uses an inline
`[Option<WideSegmentClosest>; 5]`; it allocates no heap but remains stack-heavy. The
planned reusable `ExactWideScratch` has not landed.

Wide shield face/edge predicates have not been implemented. The old `i128` shield
research path remains, but it is not sufficient for arbitrary accepted 96-bit
lattices.

## Exact next implementation order

1. Fix the wide body-region budget result.
2. Route nonzero segment/segment and segment/body scan plus frozen-pose recomputation
   through the wide helpers without narrowing any projected point, distance, speed,
   or safe-step intermediate to `i128`.
3. Add and pass the real shipped 92-bit World scan/recompute test, subraw and budget
   atomic refusals, retained-capacity/scratch test, and a 4,096-bit overflow refusal.
   Mutate origin/scale cancellation and require the 92-bit test to fail.
4. Introduce reusable fixed wide scratch and measure native plus wasm stack use before
   adding shield arithmetic.
5. Implement homogeneous wide segment/shield face and edge predicates plus maintained
   rectangle validation; rerun every exact detector and zero-response corpus control.
6. Only after the wide detector is green, resume D4b lifecycle energy and D4c/D4d
   finalization/cap/wall work. Do not start the response solver or policy work first.

## D4 energy contract already decided

The read-only D4b audit fixed the next mechanics rule. Energy is over physical rows,
not over the active common mass as though it were a body. For owner common scale `S`,
common numerator `Pc`, held numerator `Ph`, and motor row velocity `U`, body and held
absolute velocity numerators include every motor/common/held cross term. `Both`
contributes one right-owned physical row.

Lifecycle, floor, wall, cap, death, and reuse produce signed external reconciliation
rows. They never fund contact loss, allocation, anatomy, or attacker credit. A pure
body-Z impulse rejected by the floor has zero allocatable damage. Exact accepted
contact loss stays rational until the legacy anatomy boundary, where it is converted
once with `floor(loss)`; do not subtract independently floored endpoint energies.
Positive loss with zero accepted physical weight refuses before mutation.

Cap semantics are also decided: roll back only the current uncommitted group impulse
to the last-safe snapshot. Preserve response committed by earlier groups; never zero
the whole response history.

## Verification and pin budget

The next session must begin with focused compilation because the current feature tree
has not had a final full run. Use an isolated or nonincremental target if MSVC reports
unresolved internal LLVM symbols; concurrent incremental links produced that cache
artifact repeatedly during this session.

After the wide routes are green, run:

```powershell
$env:CARGO_INCREMENTAL='0'
cargo test -p sim
cargo test -p sim --features cartesian-recoil
node tools/check_docs.js
git diff --check
```

Repair the 21 stale `world.rs`/`resolution.rs` line anchors reported by
`node tools/check_docs.js` before relying on that command. The 2026-08-12 wrap-up
state was: no Cargo or Rust compiler process, clean `git diff --check`, red docs
inventory solely for those shifted anchors.

Before final integration, rebuild `-p web` for `wasm32-unknown-unknown` with the same
feature set and run `node --test tools/wasm_check.js`.

Existing registered pin movement budget remains zero. No default hash, contact corpus,
ABI, replay codec, Lab calibration, learned digest, or `ARTICULATED_HASH` change is
authorized. The feature-only exact digest has not yet been registered as a durable
native/wasm pin despite earlier plan wording; register it only after the migrated
grammar and wide detector agree across targets.

## Working-tree ownership

The worktree is intentionally dirty with the Smart36 implementation. `AGENTS.md` also
contains the user's pre-existing development-server note; preserve it. No server was
started in this session, and all sub-agents and Cargo/Rust compiler work were stopped
before this handoff.
