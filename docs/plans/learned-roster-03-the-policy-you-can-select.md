# Session 03 -- The policy you can select

**Status:** complete; native and wasm inference, refusal, picker, trace, and full repository gates passed.

## Outcome

The exact promoted tactical checkpoint is available to `lab trace` and as an append-only Arena policy choice. Missing, corrupt, wrong-layout, or wrong-digest bytes are refused by name; there is no fallback to a hand-written policy.

## Boundary

`policy::PolicyKind` cannot own a checkpoint because `policy` must not depend on `learn-core`. Native `lab` and `crates/web` each already sit above both dependencies, so they own a small selection envelope: ordinary codes delegate to `PolicyKind`; the appended learned code decodes the committed tactical checkpoint and constructs `LearnedTacticalPolicyV2`. Replay still records only stored `CommandV1` rows.

## Files

- `crates/learn-core/src/lib.rs` and a small built-in artifact owner -- decode the committed tactical bytes and expose a tactical inference digest.
- `crates/lab/src/main.rs` / trace selection -- accept `learned-roster` with the committed checkpoint.
- `crates/web/src/lib.rs` and `tools/wasm_check.js` -- append the Arena-local code, require exact tactical inference parity, and refuse bad artifacts.
- client policy picker/protocol tests only where the Arena's self-described policy vocabulary changes.
- `docs/architecture/learning.md`, `docs/architecture/policy.md`, `docs/reference/articulated-abi.md`, `docs/reference/hashes.md`, and the performance record.

## Required tests

- `the_learned_roster_policy_decodes_the_committed_tactical_checkpoint`
- `native_and_wasm_tactical_inference_have_the_same_digest`
- `the_arena_appends_learned_roster_without_renumbering_a_policy_kind`
- `a_bad_tactical_checkpoint_is_refused_and_never_falls_back`
- `a_learned_roster_fight_replays_without_loading_the_checkpoint`
- `the_default_arena_configuration_and_fingerprint_are_unchanged`

Every behavior test is mutation-proven before the full gate. Build/check exact wasm, then rebuild default wasm last.
