# Smart articulated combat -- handoff and roadmap

**Status:** exact feature mechanics through Smart120 and Smart127's ordinary
body-wall lifecycle witness are committed and verified. Smart122/123 digest
registration remains next; generalized Tactical competence also remains below gate.

This topic began with an Arena fight in which learned and tactical fighters moved but
rarely produced useful attacks. The UI truth problem was repaired and intentional
region-crossing commands were demonstrated, but the moving tactical gate still
produced no body decisions. Training, browser promotion, the final v2 gate, and
`ARTICULATED_HASH` were therefore not authorized.

The subsequent work established that this is not just a policy-quality problem. The
integer articulated contact response lost the exact relationship among impulse,
projected owner motion, TOI endpoint motion, friction, and damage. The research was
then carried into a feature-gated exact mechanics implementation through Smart120.
Durable measurements live in the
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
  mapping, and feature-gated recoil seams are directly testable.
- Exact measurements rejected local-mass alpha tuning, imported normal brackets,
  static/sliding claims for the frozen ray, black-box Jacobian fitting, and an affine
  integer Cartesian projector.
- A lifted coordinate carrying signed momentum and position-integration remainders
  passes scalar, one-/two-held owner, and bounded XYZ arithmetic gates.
  It preserves exact impulse words, interval composition, complete rational energy
  cross terms, sign mirror, planar X/Y permutation, and held-relative Z.
- Smart36--120 retain exact trajectory evaluation, wide segment geometry, certified
  group membership, response provenance, quotient normalization, and heap-retained
  solver scratch through scan, recomputation, and commit. The recorded feature-native
  and wasm digests agree at `0xa6835666303601d2`; two fresh wasm instances run the
  digest twice without second-call growth, and the measured active stack chain is
  422,384 bytes.
- Smart117 retains the named `Robust Strike (controlled)` Arena preset. Two visible
  runs reproduced its qualifying contact and wound. It is a fixed demonstration,
  not a generalized Tactical default.
- Smart115 measured generalized Tactical at `21/100` strict zero-refusal body
  decisions and `55/100` outcome-only. Smart125's attempted recertification regressed
  the unchanged outcome corpus to `49/100` and was fully reverted.
- All exact mechanics remain behind the disabled `cartesian-recoil` feature. No
  default authority, `ARTICULATED_HASH`, training promotion, or v2-18 rig work is
  authorized. These retained results are now committed behind the disabled feature.

## What remains

Smart121's frozen east-wall replay produced the accepted strike, both exact remainder
classes, the ordinary release, and equality across two live runs and replay, but no
defender-body `WALL` row. Smart127 preserved that failure, classified the response as
west/north, added the missing body-lane accounting at the real clip, and translated
the unchanged command stream to the response-aligned north wall. The successor now
has the body `WALL` row at tick 45 and the release at tick 54 with live/live/replay
equality through tick 56.

That closes the lifecycle witness, not the authority topic. Smart122's exact-
trajectory digest and Smart123's lifted-Coulomb digest remain unmeasured and
unregistered; Smart124 remains after them. After authority closure, rerun the
ordinary Tactical evidence before reconsidering learning or `v2-18`.

## Next-session order

1. Execute [Smart122](smart-ai-122-register-exact-trajectory-digest.md),
   [Smart123](smart-ai-123-register-lifted-coulomb-digest.md), and
   [Smart124](smart-ai-124-close-exact-contact-authority.md) in order.
2. Preserve the ordinary defender-body `WALL` witness and its focused mutation proof
   while registering both feature digests.
3. Rerun matched Tactical/control evidence, then the 95/100 held-out competence gate.
   The retained baseline is `21/100` strict and `55/100` outcome-only.
4. Train/promote only after the mechanics and competence gates pass. Reopen the final
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
  before authority closure.
- Do not create `ARTICULATED_HASH` until native direct run, native replay, wasm replay,
  and visible review pass the revised mechanical gate.

## Pin budget

The retained feature work moves no default legacy golden. The expected
`ARTICULATED_STREAM_DIGEST` feature-mechanics movement is paired across Rust and wasm;
the exact-trajectory and lifted-Coulomb digests remain deliberately unregistered.
Eventual promotion is a separate decision. It is expected to change the
articulated authoritative state hash grammar and may move
`ARTICULATED_COMMAND_HASH`/`ARTICULATED_STREAM_DIGEST`; it must not move legacy hashes,
the public frame/pose/region/event layouts, the replay command codec,
`CONTACT_BEHAVIOR_DIGEST` unless the generic resolver changes, or
`LEARNED_INFERENCE_DIGEST`.

## Handoff verification

The committed feature chain is rechecked with:

```powershell
cargo test
cargo test --workspace --features cartesian-recoil
node tools/check_docs.js
git diff --check
```

Because `crates/sim` changed, the final integration handoff also rebuilds `-p web` for
`wasm32-unknown-unknown` both with and without `cartesian-recoil`, and runs the matching
native/wasm equality checks. Digest registration and another held-out policy run are
not authorized before Smart122--124 closure.
