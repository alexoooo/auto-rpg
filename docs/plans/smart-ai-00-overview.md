# Smart articulated combat -- handoff and roadmap

**Status:** exact feature mechanics through Smart120 and Smart127's ordinary
body-wall lifecycle witness are committed and verified. Smart122 registered the
trajectory transcript at `0x83051e8c6b4ef20f`, and Smart123 registered the
terminal source-41 solver corpus at `0x83cd7bb2b73aeb9e`. Their canonical authority
documentation is complete. Smart128's matched stationary calibration stopped with
688/900 structural failures. Smart129 found identical held/reference solver-positive
sets but unequal per-row rejection counts on nine mirrored rows. Generalized Tactical
competence remains below gate.

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
- Smart128's exact-mechanics calibration reproduced byte-identically across two
  bounded runs but stopped at `688/900` structural failures. Its held-out stationary
  range and the moving competence gate were not run; the durable counts and receipts
  are in [matched tactical mechanics](../performance/smart-ai-matched-tactical.md#exact-mechanics-rerun).
- Smart129's frozen offline query found `198` rows positive in both controlled arms,
  zero positive in only one arm, and nine mirrored rows with unequal positive counts.
  The decision is `controlled-arm-solver-asymmetry`, not a causal or tuning result;
  its receipts are in the [shared-solver diagnosis](../performance/smart-ai-matched-tactical.md#frozen-shared-solver-diagnosis).
- All exact mechanics remain behind the opt-in, non-default `cartesian-recoil`
  feature. No exact-path default authority, `ARTICULATED_HASH`, training promotion,
  or v2-18 rig work is authorized. These retained results are committed behind the
  opt-in feature.

## What remains

Smart121's frozen east-wall replay produced the accepted strike, both exact remainder
classes, the ordinary release, and equality across two live runs and replay, but no
defender-body `WALL` row. Smart127 preserved that failure, classified the response as
west/north, added the missing body-lane accounting at the real clip, and translated
the unchanged command stream to the response-aligned north wall. The successor now
has the body `WALL` row at tick 45 and the release at tick 54 with live/live/replay
equality through tick 56.

That closes the lifecycle witness. Smart122's exact-trajectory digest registers the
later wall/remainder/release transcript. Smart123 separately registers source-41's
eighteen mechanics cases at their first qualifying contact; extending those cases by
one tick is not its lifecycle grammar. The authority documents are now closed without
promoting the feature. The completed stationary matched Tactical/control calibration
stopped before held-out work: reference missing/crossing failures, held/reference
solver rejections and Tactical solver/attribution failures were all present.
The frozen shared-solver diagnosis found count asymmetry without naming its cause.
The next plan must begin at earliest canonical mismatch ordinal 31 and establish the
first held/reference provenance divergence before proposing any correction.

## Next-session order

1. Write a bounded arm-asymmetry provenance plan for Smart129's earliest canonical
   mismatch, ordinal 31. Do not tune against the calibration or choose a subset after
   measurement. The moving baseline remains `21/100` strict and `55/100`
   outcome-only; Smart125's attempted correction fell to `49/100` outcome-only and
   was reverted.
2. Preserve the ordinary defender-body `WALL` lifecycle witness separately from the
   terminal-at-first-contact source-41 solver corpus.
3. Open the unchanged 95/100 held-out competence gate only after a future matched
   calibration reaches zero structural failures and its frozen evidence justifies it.
4. Train/promote only after the competence gate passes. Reopen the final
   v2 articulated gate and `v2-18` last.

## Hard constraints

- Do not resume an inverse-projector local fit or widen a failed search after seeing
  its output.
- Do not equate post-impact generalized velocity with whole-tick displacement at a
  nonzero TOI.
- Do not select mechanics by wound/damage outcome.
- Do not claim full XYZ symmetry while the body/common Z floor constraint exists;
  only held-relative Z is supported.
- Do not enable `cartesian-recoil` by default, change default hash grammar, or
  re-record either exact pin without its registered owner path. Authority closure is
  not feature-promotion authority.
- Do not create `ARTICULATED_HASH` until native direct run, native replay, wasm replay,
  and visible review pass the revised mechanical gate.

## Pin budget

The retained feature work moves no default legacy golden. The expected
`ARTICULATED_STREAM_DIGEST` feature-mechanics movement is paired across Rust and wasm;
the exact-trajectory and lifted-Coulomb digests are registered at
`0x83051e8c6b4ef20f` and `0x83cd7bb2b73aeb9e` respectively.
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
native/wasm equality checks. Both digest registrations and their authority documents
are complete. Matched ordinary Tactical/control evidence is now frozen at its
structural stop. The next authorized work is diagnosis and planning, not tuning,
training, default promotion or the held-out gate by assumption.
