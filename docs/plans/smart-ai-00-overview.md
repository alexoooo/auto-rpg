# Smart articulated combat -- overview

**Status:** closed `revise`. Intentional region crossings landed, but the tactical
moving-fight gate produced no body decisions; sessions 08 and 09 therefore did not
train, promote, or create `ARTICULATED_HASH`.

The arena currently makes two different failures look like one. A plain `#/arena`
silently loads `/fight.json`, so its controls can describe the *next* fight while the
screen shows an older recording. Independently, the policies really are unskilled:
`composed` is a twelve-phase clock script and the learned policy independently chooses
five coarse controls. Neither can form the intent “cross this opponent region with my
weapon at useful speed.”

This plan fixes the display truth first, builds measurable striking competence second,
and only then spends another training budget. It is a v2 successor, not permission to
hide the failed gate or to start roster/content work.

## Session order

| session | lands | depends on |
|---|---|---|
| [01](smart-ai-01-arena-truth.md) | arena distinguishes the loaded fight from the next selection | none |
| [02](smart-ai-02-competence-corpus.md) | stationary-target corpus and the missing self-geometry observation | 01 |
| [03](smart-ai-03-strike-planner.md) | deterministic region-targeted strike planner | 02 |
| [04](smart-ai-04-actuator-calibration.md) | measured arm-speed calibration, or a recorded rejection of that hypothesis | 03 |
| [05](smart-ai-05-contact-energy.md) | contact-energy rule calibrated from clean strikes, if still required | 04 pass/revise evidence |
| [06](smart-ai-06-tactical-policy.md) | seek/measure/strike/guard/evade/recover policy in Lab and arena | 03 and the mechanical sessions that changed constants |
| [07](smart-ai-07-learning-contract.md) | tactical-intent learning layout behind the native probe | 06 |
| [08](smart-ai-08-train-and-promote.md) | held-out evaluation and conditional browser promotion | 07 |
| [09](smart-ai-09-v2-gate.md) | revised v2 mechanical gate and `v2-18` handoff | 06; 08 only for the learned row |
| [10](smart-ai-10-matched-tactical-mechanics.md) | matched strong-tip/tactical energy trace and one mechanics-or-controller successor decision | 06 `revise` |
| [11](smart-ai-11-effective-contact-response.md) | generalized effective-mass/restitution response, or a measured rejection of every candidate | 10 mechanics diagnosis |
| [12](smart-ai-12-directional-contact-response.md) | bounded directional response-matrix prototype for projected restitution and friction | 11 `revise` |
| [13](smart-ai-13-bounded-nonlinear-contact-response.md) | bounded actual-projector normal solve after the linear response rejection | 12 `revise` |
| [14](smart-ai-14-friction-checkpoint.md) | canonical two-tangent and physical Coulomb-cone contract | 13 normal prototype |
| [15](smart-ai-15-bounded-sliding-friction.md) | bounded actual-projector static/sliding circular-cone solve | 13; 14 `revise` |
| [16](smart-ai-16-exact-sliding-prerequisites.md) | exact cone boundary, verified normal bracket, and fixed projection cache | 15 `Cycle` |
| [17](smart-ai-17-normal-component-integerization.md) | mirror-invariant component rounding against the retained exact-boundary gaps | 16 `NoConvergence` |
| [18](smart-ai-18-generalized-joint-contact-response.md) | forward-only generalized body/arm coordinate response | 17 `revise` |
| [19](smart-ai-19-interior-contact-fixture.md) | bounded ordinary-command search for an interior mirrored contact fixture | 18 retained strike at joint boundary |
| [20](smart-ai-20-cartesian-contact-response.md) | explicit Cartesian collision authority and deterministic scalar-control reconciliation | 18 and 19 `revise` |
| [21](smart-ai-21-post-contact-velocity.md) | explicit post-contact velocity distinct from whole-tick hand displacement | 20 TOI state-shape `revise` |
| [22](smart-ai-22-equipment-com-recoil-work.md) | widened equipment-centre motor work and recoil permission boundary | 21 energy-law `revise` |
| [23](smart-ai-23-recoil-fatigue-ledger.md) | derive COM acceleration from existing authority and share the fatigue residue fold | 22 accounting `revise` |
| [24](smart-ai-24-feature-gated-recoil-lifecycle.md) | feature-gated direct-contact commit and next-tick COM recoil lifecycle | 23 arithmetic `revise` |

Sessions 04 and 05 are decision sessions. A rejected hypothesis lands its measurements
and leaves the constants unchanged; it does not re-record goldens to make a theory look
successful. Session 06 may proceed when the corpus has a mechanically credible strike,
even if session 05 records that no contact-rule change is needed.

Session 10 is the post-`revise` successor. It does not reopen sessions 08 or 09 by
existence: its matched held-out thresholds must first show whether the missing outcome
belongs to the controller or to one named mechanics link.

Session 11 follows the link session 10 actually exposed: the local two-collider
impulse omits held mass that the coupled projector accelerates, and the alpha search
then chooses the upper return-to-input-energy root. It compares restitution-preserving
generalized responses before authorizing one; it does not treat minimum energy as a
substitute for material restitution or combine the repair with an energy-floor tune.

Session 19 tests the premise session 18 could not inherit from the retained strike:
whether ordinary legal commands can produce a robust mirrored sword/body contact away
from every arm boundary. Its bounded 7,560-run search found 312 individually eligible
rows but zero eligible mirror pairs, so it closes `revise` and selects no response
fixture. This is evidence about fixture availability, not permission to tune contact
mechanics from the best-looking individual row.

Session 20 makes the redundancy session 18 exposed explicit: scalar arm pose remains
control state while the already-hashed Cartesian hand becomes collision authority.
Its first test-only trial reaches retained restitution and dissipates energy without
an inverse map; authority remains blocked on next-tick reconciliation, damage, mirror,
replay, and exact energy gates.

## Constants and append-only codes

The plan introduces these names; their numeric values are selected only where the
measuring session says so:

```rust
pub const TACTICAL_POLICY_CODE: u32 = 5;
pub const TACTICAL_PHASE_COUNT: usize = 5;
pub const TACTICAL_INTENT_COUNT: usize = 8;
pub const LEARN_V2_FEATURE_LAYOUT_VERSION: u32 = 2;
pub const LEARN_V2_FEATURE_COUNT: usize = 59; // 41 existing + 18 appended
pub const LEARN_V2_ACTION_LAYOUT_VERSION: u32 = 2;
pub const LEARN_V2_ACTION_LOGITS: usize = 26; // 18 existing + 8 intent logits
```

Policy code 5 is appended after `learned = 4`; no existing saved arena value changes
meaning. The learning layouts preserve the meanings and order of all v1 entries.

## Golden budget

- Sessions 01--03, 06, and 07 must not move any simulation, browser, or legacy hash.
  Policy output is deliberately outside the replay portability promise.
- Session 04 may move `ARTICULATED_STREAM_DIGEST` if actuator constants change. It
  cannot move `ARTICULATED_COMMAND_HASH`, `CONTACT_BEHAVIOR_DIGEST`, any legacy hash,
  either combat-spec digest/fingerprint, or `LEARNED_INFERENCE_DIGEST`.
- Session 05 moves no pin when the evidence closes it as unnecessary. Its authorized
  episode-state path expects exactly `ARTICULATED_COMMAND_HASH`,
  `CONTACT_BEHAVIOR_DIGEST`, and `ARTICULATED_STREAM_DIGEST` to move; no unpredicted
  pin is re-recorded.
- Session 08 owns the expected `LEARNED_INFERENCE_DIGEST` move because it changes the
  feature layout, action layout, `ModelShape`, and installed checkpoint. No simulation
  hash may move.
- Session 11 must move `CONTACT_BEHAVIOR_DIGEST` if it lands an authority repair and
  expects `ARTICULATED_STREAM_DIGEST` to move. Its plan names every pin that must stay
  fixed and requires native/wasm agreement before either permitted move is recorded.
- `ARTICULATED_HASH` remains absent until session 09 passes direct native, replay,
  wasm replay, and visible review. The six legacy hashes never move in this topic.

Every session that touches `crates/sim` or deterministic policy code begins from the
[determinism contract](../reference/determinism.md#contract). Fixed-point candidate
enumeration and explicit tie-breaking are required; no float, clock, unordered
iteration, or stateful host RNG enters authoritative state.

## Success definition

“Smart” is observable behavior, not a policy label. Against a stationary neutral
opponent, a sword fighter must deliberately enter measure, name a reachable body
region, cross that region during its committed strike, recover, and decide at least
95 of 100 mirrored held-out fights before tick 1,800. Against moving scripts it must
guard or evade an incoming weapon and attack during recovery rather than flailing on
a fixed clock. Session 09 freezes the final thresholds only after sessions 02--06
show which metrics distinguish those behaviors.

## Research successor

The next learning question is not another direct joint controller. The
[hierarchical combat learning plan](hierarchical-ai-00-overview.md) first measures a
fixed catalog of `(loadout, strategy)` options, including several strategies for one
loadout, and only trains a meta-policy if different options demonstrably lead in
different contexts. It keeps encounter-level loadout selection separate from
in-fight strategy switching and does not waive this plan's failed mechanical gate.
