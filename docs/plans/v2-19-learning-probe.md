# v2-19 — decide whether learning earns a larger roadmap

**Goal:** compare one small learned articulated policy with the frozen scripted
baseline using native offline training and held-out replayable evaluation.

**Depends on:** passed `v2-17`; use `v2-18` for presentation only after its pass.

**Golden expectation:** no hash moves. Training may be nondeterministic; recorded
submitted commands and replays remain deterministic.

## Minimal learning boundary

Add `crates/learn` depending on `sim` and `policy`, and add it only to native `lab`.
It may use floating point but no learned/model/optimizer type enters `Scenario`,
`World`, `SubmittedCommand`, replay, or hashing. Do not add `search`, browser learning
hosts, rollout workers, WebGPU training, a skill catalog, hierarchy, or workbench.

Implement one versioned two-layer MLP (`FEATURE_LAYOUT_VERSION` input, 64 hidden
units, discrete action logits) and adapt the existing bounded population optimizer.
The discrete action table is append-only and contains the exact scripted vocabulary
from `v2-17`; body yaw and arm targets are complete `ArticulatedCommandV1` builders,
not a second command ABI. Frozen checkpoints record model schema, feature/action
layouts, training seed set, optimizer settings, and SHA-256 digest. Inference uses
preallocated buffers and deterministic argmax for a fixed checkpoint on one host.

Add:

```text
crates/learn/src/model.rs
crates/learn/src/checkpoint.rs
crates/learn/src/probe.rs
crates/lab/src/learn_probe.rs
docs/performance/v2-learning-probe.md
```

`lab learn-probe train` writes checkpoints atomically. `lab learn-probe evaluate`
records every held-out run as the normal replay envelope plus checkpoint digest; a
replay never loads the checkpoint.

## Comparison and decision

Before training, freeze 400 mirrored held-out seeds unused by optimization. Compare
learned and scripted policies against the same frozen scripted opponents, sides,
loadouts, and tick limit. Report win/draw/loss, scalar return, tick-limit rate,
contacts by kind/height/region, defended contacts, self-created energy violations,
inference time, and bootstrap 95% confidence intervals.

Learning earns a follow-up roadmap only if held-out mean return improves by at least
5% with a confidence interval excluding zero, tick-limit rate worsens by no more than
2 percentage points, every `v2-17` safety invariant remains green, and recorded
replays reproduce exactly. Otherwise record whether to keep scripted control, revise
the action/observation design, or stop learning work. A training-curve improvement or
visual demo alone is not a pass.

## Tests and verification

```text
checkpoint_layout_and_digest_mismatches_fail_closed
frozen_inference_allocates_nothing_after_warmup
learned_output_uses_only_the_versioned_action_table
training_types_cannot_enter_authoritative_state
held_out_seeds_are_disjoint_from_training
recorded_learned_replays_do_not_load_the_model
a_failed_or_nan_evaluator_falls_back_to_the_scripted_policy
```

```powershell
cargo test
cargo run --release -p lab -- learn-probe train --spec v2-probe
cargo run --release -p lab -- learn-probe evaluate --spec v2-probe --seeds 400 --mirrored
cargo run --release -p lab -- verify --seeds 200
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
git diff --check
```

Append the evidence and final `expand`, `revise`, or `stop` decision to this file.
Only `expand` authorizes new plans for scale, search, catalogs/hierarchy, browser
training, GPU evaluation, or the Lab workbench.
