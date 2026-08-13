# Smart AI 37 -- wide detector handoff

**Status:** active implementation handoff. Smart36 has implemented trajectory authority
through exact World construction, grouped response staging, and atomic precommit, but
D4 is not complete and the feature build is not ready for promotion or a visible-fight
claim. Segment/segment, segment/body, and segment/shield now reach the fixed-width
detector without narrowing through the old `i128` pose evaluator. Pairs outside the
detector's historical primitive domain remain ignored under nonzero response. The
immediate blocker is the old `i128` advancement/finalization path.

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

The direct wide evaluator now composes motor, common, and held coordinates as
`WideRational4096`; a real World-built Fighter row proves the old evaluator overflows
on the shipped 92-bit lattice while the wide scan and frozen recomputation agree.
Wide homogeneous shield face plus four-edge selection, maintained affine-rectangle
validation, certified advancement, and a translated `1 / 2^92` shield control are
also green. `ExactWideScratch` retains the five segment and seven rectangle candidates,
and capacity reporting includes exact staging plus both wide buffers.

The 2026-08-12 feature-suite checkpoint after wide scan, recomputation, final pose
publication, zero-finish rebasing, and fixture-envelope repair is 549 passed, 8
failed, 1 ignored. No construction failure remains. The eight failures are now
contact/lifecycle expectations and downstream no-contact assertions; the exact
hash-row-width mirror is green without changing its golden. This is progress
evidence, not a promotion gate. Default hashes remain unauthorized to move.

## Incomplete code in the working tree

`crates/sim/src/combat/contact.rs` now contains routed wide helpers for:

- wide point/radius/distance/L1/floor/publication;
- wide exact response velocity;
- segment and body-region evaluator adapters;
- one-raw relative speed bounds and safe steps;
- draft `wide_sweep_segments` and `wide_sweep_segment_body`.

They are dispatched for nonzero segment/segment, segment/body, and segment/shield
pairs in both scan and `exact_contact_at_pose`. Budget exhaustion refuses by name,
and candidate storage is retained rather than placed in a large per-call stack array.

A full World row set also contains body/body, body/shield, and shield/shield pairs.
The compatibility detector has never emitted candidates for them: body separation is
a distinct World phase, and the other two combinations are not contact primitives.
The exact dispatcher now preserves that same pair domain instead of turning an
ignored pair into an atomic refusal merely because another pair produced response.

## Exact next implementation order

1. Repair the remaining feature fixtures inside the deliberate 96-bit construction
   envelope and distinguish stale no-contact expectations from lifecycle defects.
2. Measure native plus wasm stack use for the retained wide scratch. The storage is
   reusable now, but the repository still has no stack-measurement harness.
3. Rerun every exact detector and zero-response corpus control, then the full feature
   suite. The unfiltered shipped World scan, frozen recomputation, wide final pose
   publication, and detector-level 4,096-bit atomic refusal are now green.
4. Resume D4b lifecycle energy and D4c/D4d
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

The attempted direct D4 finalizer exposed one additional arithmetic requirement and
was rolled back rather than leaving feature combat unable to resolve. Per-owner
physical energy can include every motor/common/held cross term in checked `i128`,
but a multi-owner closure cannot combine absolute rationals by cross-multiplying
their independent 77--96-bit construction scales: the denominator product exceeds
`i128` on shipped World rows. That measurement amends the earlier `i128`-only energy
rule: compute per-owner before/after deltas first, stream them in entity order through
the existing fixed 4,096-bit scratch, then sign-check and floor the total once. The
word remains ephemeral -- no state, hash, replay, ABI, heap, GCD, or saturation --
and overflow is the named atomic `ExactEnergyEnvelope` refusal. The envelope gate is
42 worst-case 96-bit terms accepted and 43 refused, while 64 smaller terms remain
legal. Do not independently floor endpoints or restore the rolled-back absolute-energy
accumulator.

Cap semantics are also decided: roll back only the current uncommitted group impulse
to the last-safe snapshot. Preserve response committed by earlier groups; never zero
the whole response history.

Checkpoint E's ordinary-command replay proof is now partial rather than implied.
The captured 48-tick chamber-to-strike fixture, translated to the south wall, matched
two live runs and replay at every tick across digest, exact trajectory authority,
resolutions, anatomy, grips, and the exact external ledger. Before Smart38 it produced
two contact groups. The completed lifted law now accepts one group and names the later
energy-increasing selection `ExactSolver`; it does not choose a lower-ranked response
merely to keep the fixture green. The accepted group retains nonzero momentum and
position remainders and the stream still performs an ordinary later release. It
did not produce a wall or cap reconciliation: the measured body answer at the wall
was only 0.0291 raw units/tick, too small to move the integer endpoint through the
boundary. The separate wall proof still has to inject a finalized exact group for
that reason. Do not call checkpoint E complete until Smart38 supplies an ordinary
boundary-crossing response; do not weaken the gate or poison World state to claim it.

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

The original 21 stale `world.rs`/`resolution.rs` anchors were repaired mechanically.
Run `node tools/check_docs.js` again after every subsequent source insertion; this
session's detector and scratch additions moved several of the repaired declarations
again before the final pass.

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
