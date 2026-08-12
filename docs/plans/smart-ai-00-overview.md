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

Sessions 04 and 05 are decision sessions. A rejected hypothesis lands its measurements
and leaves the constants unchanged; it does not re-record goldens to make a theory look
successful. Session 06 may proceed when the corpus has a mechanically credible strike,
even if session 05 records that no contact-rule change is needed.

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
