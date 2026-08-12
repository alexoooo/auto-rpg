# Smart articulated combat -- handoff and roadmap

**Status:** mechanics blocked at an exact trajectory boundary; one live
implementation plan remains.

This topic began with an Arena fight in which learned and tactical fighters moved but
rarely produced useful attacks. The UI truth problem was repaired and intentional
region-crossing commands were demonstrated, but the moving tactical gate still
produced no body decisions. Training, browser promotion, the final v2 gate, and
`ARTICULATED_HASH` were therefore not authorized.

The subsequent work established that this is not just a policy-quality problem. The
current integer articulated contact response loses the exact relationship among
impulse, projected owner motion, TOI endpoint motion, friction, and damage. Thirty-four
session plans were used as a research ledger while that failure was narrowed. They
have now been retired: durable measurements live in the
[articulated contact research record](../performance/v2-articulated-contact-research.md),
the current runtime contract remains in the
[contact solver reference](../reference/contact-solver.md), and design consequences
live in [combat design](../design/combat.md).

## What is done

- The Arena identifies the fight being viewed separately from the next configured
  fight, so stale playback is not mistaken for current policy output.
- The tactical controller can name and cross a body region, and the learning command
  contract exists, but the behavioral competence gate failed. No checkpoint was
  trained or promoted.
- Contact ownership, finalization, allocation, anatomy `after_group`, TOI endpoint
  mapping, and several feature-gated recoil seams were made directly testable.
- Exact measurements rejected local-mass alpha tuning, imported normal brackets,
  static/sliding claims for the frozen ray, black-box Jacobian fitting, and an affine
  integer Cartesian projector.
- A test-only lifted coordinate carrying signed momentum and position-integration
  remainders passes scalar, one-/two-held owner, and bounded XYZ arithmetic gates.
  It preserves exact impulse words, interval composition, complete rational energy
  cross terms, sign mirror, planar X/Y permutation, and held-relative Z.
- The first attempted World adapter was rejected before it could create a second
  authority. With mass `196_608` and momentum `262_144`, tick-one position `1`
  carries remainder `4_294_967_296`; after another half tick the lifted trajectory
  exposes position `2`, while the existing integer endpoint sweep from `1 -> 2`
  still exposes `1`. The feature test
  `lifted_toi_position_can_cross_before_the_integer_endpoint_sweep` pins this exact
  endpoint/TOI mismatch. No lifted World row or commit state landed.
- All of this remains behind tests or the disabled `cartesian-recoil` feature. No
  production authority, default state/hash layout, ABI, Lab calibration, or golden
  re-record was authorized.

## What remains

The arithmetic proof is not yet a simulation lifecycle, and it cannot be grafted onto
the current integer endpoint sweep. The successor must preserve the independently
rotating motor paths of bodies, segment hilts/tips, and shield corners while adding
one exact owner/held response translation. One evaluator must serve contact scan,
recomputation, and commit; otherwise the exact ledger becomes an invisible second
simulation while gameplay still uses rounded state. The first authoritative World
field must land together with canonical hashing, replay, and native/wasm proof.

After that lifecycle passes, a separate bounded solver must establish a real
multi-contact normal plus circular-Coulomb response over the lifted state. Only then
may the project rerun the retained strike, find a robust mirrored ordinary-command
fixture, calibrate the tactical corpus, reconsider learning, and finally reopen
`v2-18`.

## Next-session order

1. Implement [Smart AI 36 -- exact lifted trajectories](smart-ai-36-exact-lifted-trajectories.md).
   Keep it feature/test-only. It must use one exact geometry evaluator in scan,
   recomputation, and commit, and stop rather than reconstruct a remainder from
   published integer endpoints.
2. If it passes, write one bounded lifted-state normal/Coulomb solver plan. Candidate
   selection may use response mechanics only; damage is evidence after selection.
3. Require a robust mirrored ordinary-command strike before any Lab calibration. The
   previous 7,560-case sweep found 312 eligible individuals and zero eligible mirror
   pairs.
4. Rerun matched tactical/control evidence, then the 95/100 held-out competence gate.
5. Train/promote only after the mechanics and competence gates pass. Reopen the final
   v2 articulated gate and `v2-18` last.

## Hard constraints

- Do not resume an inverse-projector local fit or widen a failed search after seeing
  its output.
- Do not equate post-impact generalized velocity with whole-tick displacement at a
  nonzero TOI.
- Do not select mechanics by wound/damage outcome.
- Do not claim full XYZ symmetry while the body/common Z floor constraint exists;
  only held-relative Z is supported.
- Do not enable `cartesian-recoil`, change default hash grammar, or re-record pins
  inside the lifecycle checkpoint.
- Do not create `ARTICULATED_HASH` until native direct run, native replay, wasm replay,
  and visible review pass the revised mechanical gate.

## Pin budget

Smart36 moves no existing pin and adds at most one feature-only diagnostic digest,
after native/wasm agreement. Eventual promotion is a separate decision. It is
expected to change the
articulated authoritative state hash grammar and may move
`ARTICULATED_COMMAND_HASH`/`ARTICULATED_STREAM_DIGEST`; it must not move legacy hashes,
the public frame/pose/region/event layouts, the replay command codec,
`CONTACT_BEHAVIOR_DIGEST` unless the generic resolver changes, or
`LEARNED_INFERENCE_DIGEST`.

## Handoff verification

The current bounded checkpoint is owned by these commands:

```powershell
cargo test -p sim --features cartesian-recoil lifted_ -- --nocapture
cargo test -p sim
cargo test -p sim --features cartesian-recoil
node tools/check_docs.js
git diff --check
```

Because `crates/sim` changed, the final integration handoff also rebuilds `-p web` for
`wasm32-unknown-unknown` and runs `node --test tools/wasm_check.js`. No Lab or held-out
run is meaningful before Smart36 and the later response solver pass.
