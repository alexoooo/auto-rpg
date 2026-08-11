# v2-ui-08 — the learned fighter in the browser, and the second host the claim needs

**Goal:** let a trained checkpoint drive a fighter in the browser, and in doing so
verify a portability claim this repository has been carrying untested since `v2-19`.

**Depends on:** `v2-ui-05` (the policy codes, where 4 is already reserved). Independent
of `v2-ui-06` and `v2-ui-07`, so it can be pulled forward.

**Golden expectation:** no existing pin moves. **One new pin is created**:
`LEARNED_INFERENCE_DIGEST`, duplicated across native and wasm like every other browser
golden.

## Why this session exists

An earlier draft of this series concluded the learned policy should stay offline, on the
strength of `AGENTS.md`'s rule that `crates/learn` must stay unreachable from `web`.
That was reading the rule without reading the code under it, and it produced an absurd
answer: the best fighter in the repository — 88.9 held-out against the windmill's 84.6,
thirty kills to fifteen — would be the one thing a player could never face. An AI that
only runs inside a lab binary is not a game AI.

The rule's stated premise is that `learn` may use floating point because *nothing it
computes reaches authoritative state*. That premise is **preserved here, not broken**,
and the code was built that way on purpose:

- `LearnedActionV1` is a separate type from `ArticulatedCommandV1` and its doc comment
  says why in as many words — *"this is the type that must not reach the world"*.
  `World::submit_articulated_v1` cannot be handed one.
- What crosses from the float side to the integer side is **five small head indices**,
  produced by argmax. No float reaches the world.

## The claim, and why the browser is what tests it

[`crates/learn/src/model.rs:968`](../../../crates/learn/src/model.rs#L968):

> **Rectified linear and not tanh, and the reason is portability rather than accuracy.**
> `tanh` is libm, and the libm compiled into one target is not the one in another [...]
> `f32` multiply and add are IEEE-754 exact everywhere, so with the summation order fixed
> by the loop below and no fast-math anywhere in the profile, a frozen checkpoint's
> argmax is reproducible on any host [...]
>
> It is still only a *claim* about hosts other than this one, **because this repository
> has no second host to check it on.**

`v2-19` engineered for this and then had to leave it unverified. wasm32 is the second
host. Every ingredient is already correct:

| requirement | status |
|---|---|
| no libm in the forward pass | ReLU is `if sum > 0.0 { sum } else { 0.0 }` — not a call |
| IEEE-754 `f32` mul/add | mandated by both targets |
| fixed summation order | the two loops in `forward`, one accumulator each |
| no FMA contraction | no `target-cpu`, `target-feature` or fast-math anywhere in the build; baseline x86-64 has no FMA instruction and neither does the wasm MVP |
| deterministic ties | lowest index wins, `>` and not `>=`, documented at `from_logits` |
| NaN cannot enter | `CheckpointError::NotFinite` refuses at load; a NaN logit would also lose deterministically |
| no threads on the inference path | `std::thread::scope` appears once in `crates/learn`, in `probe.rs`'s trainer |
| no external crates | `crates/learn/Cargo.toml` has none, so `check_deps.js` has no objection |

**One caveat that must go in the contract:** this holds for the repository's baseline
targets. Building native with `-C target-cpu=native` on a host with FMA re-opens
contraction and is outside the guarantee. Say so where the pin is recorded.

## The work

**Split `learn-core`.** A new crate holding `model.rs` and `checkpoint.rs` — inference,
feature extraction, action decoding, checkpoint decode. No threads, no I/O, no
`std::thread::scope`. `learn` keeps `probe.rs` and the trainer and depends on
`learn-core`; `lab` is unaffected; `web` gains a dependency on `learn-core` only.

Add `learn-core` to `DETERMINISTIC` in [`tools/check_deps.js`](../../../tools/check_deps.js)
so it inherits the workspace-paths-only audit.

**Policy code 4 stops being refused.** `v2-ui-05` reserved it precisely so this is
additive: `ArticulatedPolicyKind::Learned`, dispatching to
`learn_core::LearnedArticulatedPolicy`.

**Deliver the checkpoint.** `checkpoints/v2-probe.ckpt` is 15,580 bytes and committed.
Fetch it rather than embedding it in the wasm: a checkpoint is a fighter, the studio
should be able to load a different one without a Rust rebuild, and a 15 KB fetch beside
an 8 MB trace is nothing. The arena config buffer therefore carries a checkpoint
*handle*, and a separate staging buffer takes the bytes — `checkpoint_ptr` /
`checkpoint_len` / `load_checkpoint()`, refusing with the existing `CheckpointError`
variants rather than trapping.

The trace header already carries the checkpoint digest, so a live fight and a traced
fight can be compared on identical terms.

## The new pin

`LEARNED_INFERENCE_DIGEST` — FNV-1a-64, prefix `ARPG-LEARNED-V1`, over the **logit words**
produced by the shipped checkpoint against a fixed observation corpus. Logits and not
argmaxes, deliberately: argmaxes are five bytes and would hide a divergence that had not
yet crossed a decision boundary, which is exactly the divergence worth catching early.

Pinned in both `crates/web/src/lib.rs` and `tools/wasm_check.js`, following the rule the
registry already states: browser pins are duplicated so a one-sided failure diagnoses
target disagreement rather than a behaviour change. Registry row in
[`docs/reference/hashes.md`](../../reference/hashes.md), recording that it is owned by
whoever changes `ModelShape`, the feature layout, the action layout or the forward pass —
and that a move without one of those is a portability failure and not a re-record.

**If native and wasm disagree, that is the session's result and it is a good one.** It
would mean `model.rs:968`'s claim is false, discovered by the first host able to test it
rather than by a player. The fallback is real and should be named now rather than
improvised then: quantise inference to `Fx`, which the repository is already built
around. 3,858 weights, integer dot products, exactly reproducible everywhere by
construction. The cost is that quantisation changes behaviour, so the quantised model
must be re-scored on `learn-probe evaluate`'s 400 held-out seeds and compared against
88.922 before it is allowed to be called the same fighter.

## `AGENTS.md`

The dependency rule changes and the amendment must carry its reason, not just its
verdict:

> `learn-core` is reachable from `web`; `learn` is not. The floating point in
> `learn-core` is upstream of an argmax, and what crosses into `sim` is five head
> indices. No float reaches authoritative state, which is the property the original rule
> was protecting. `LEARNED_INFERENCE_DIGEST` is what keeps that honest across targets.

`AGENTS.md`'s standing instruction — *if a second host ever appears, check first that it
is not `web`* — is discharged by this file. The check was made and the answer is
recorded, which is what the instruction asked for.

## Verification

```powershell
cargo test
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
node tools/check_deps.js
node tools/check_docs.js
cargo run --release -p lab -- hash
cargo run --release -p lab -- learn-probe evaluate --checkpoint checkpoints/v2-probe.ckpt
```

- **`LEARNED_INFERENCE_DIGEST` agrees native and wasm.** This is the session.
- `a_learned_fight_in_wasm_matches_the_same_fight_in_lab` — same checkpoint, same seed,
  same config, same outcome and same state hash. Stronger than the digest because it
  runs 3,600 ticks of compounding decisions rather than one corpus.
- `a_corrupt_checkpoint_is_refused_and_installs_nothing` — every `CheckpointError`
  variant, with the instance still usable.
- `the_learned_policy_is_unreachable_from_sim` — `learn-core` may not appear in `sim`'s
  dependency graph. The direction of the arrow is the whole architecture.
- The held-out score is unchanged, because nothing about the model changed — quote it
  from `evaluate.log` rather than re-deriving it.

By hand: run learned against the composed script in the arena, and watch it from the
first-person view of the body it is beating.

## Decision

Record `pass`, `revise` or `stop`. State the digest and that both targets agree — or
that they do not, which is a finding worth more than the feature.

Deferred on a pass: training in the browser (it needs threads and minutes), and a
checkpoint picker beyond the shipped one.
