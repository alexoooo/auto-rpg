# Learning status

**Purpose:** State exactly what policy optimization ships today, what the trained network is allowed to touch, and which components still do not exist.
**Status:** current
**Canonical source:** [`crates/learn-core/src/model.rs`](../../crates/learn-core/src/model.rs), [`crates/learn/src/probe.rs`](../../crates/learn/src/probe.rs), [`crates/policy/src/lib.rs`](../../crates/policy/src/lib.rs), and [`crates/lab/src/evolve.rs`](../../crates/lab/src/evolve.rs)
**Update when:** A learned policy, model artifact, inference runtime, training backend, genome surface, or evolution method changes.

**This document opened with "No learned policy currently ships" until 2026-08-11, and
by then four of that sentence's clauses had been false since `v2-19` and a fifth since
`v2-ui-08`.** It is recorded rather than deleted because the boundary the old sentence
was protecting is the same one this page still exists to state -- what moved is which
side of it the code sits on, not where the line is.

## What ships

A trained network drives a fighter, natively and in the browser.

| | |
|---|---|
| the network | 41 x 64 x 18, one hidden layer, ReLU, 3,858 `f32` weights |
| the artifact | `checkpoints/v2-probe.ckpt`, 15,580 bytes, committed |
| inference | [`crates/learn-core`](../../crates/learn-core/src/model.rs) -- the compact feature slice, the forward pass, the action table, the checkpoint codec |
| training | [`crates/learn`](../../crates/learn/src/probe.rs) -- a `(mu + lambda)` population optimizer, six elites of a population, Gaussian mutation at sigma 0.08 |
| hosts | native `lab learn-probe` and `lab trace --policy learned`; `web.wasm`, since `learn-core` is [`crates/web`](../../crates/web/Cargo.toml)'s dependency |
| the score | 88.922 mean return over 400 held-out seeds, 95% CI `[86.287, 91.962]`, 30 kills, against the scripted windmill's 84.606 |

Reproduce the score with
`cargo run --release -p lab -- learn-probe evaluate --checkpoint checkpoints/v2-probe.ckpt`.
The training and evaluation logs under `checkpoints/` are gitignored, so the command is
the citation and the `.ckpt` is the only tracked artifact.

**No gradient is computed anywhere.** The optimizer is an evolution strategy over the
whole weight vector: it samples, scores through the ordinary rollout harness, keeps
elites and mutates. There is no autodiff path, no backward pass and no tensor library,
which is why the whole thing is a few hundred lines with zero external dependencies.

## The boundary, which did not move

The premise that lets these two crates use floating point is that **nothing they
compute reaches authoritative state**, and it is enforced three ways rather than
promised:

- **A type fence.** `learn_core::LearnedActionV1` is a different type from
  `sim::ArticulatedCommandV1`, and `World::submit_articulated_v1` cannot be handed one.
  What crosses from the float side to the integer side is **five head indices**, chosen
  by an argmax, which then index a fixed table of `Fx` constants.
- **A direction fence.** `the_learned_policy_is_unreachable_from_sim` in
  `crates/learn-core/tests/direction.rs` asks Cargo for the resolved graph and asserts
  that `fx`, `sim` and `policy` reach neither crate, that `web` reaches `learn-core`,
  and that `web` does not reach `learn`.
- **A cross-target pin.** `LEARNED_INFERENCE_DIGEST` (`0xbdba8d64d340ce32`) is FNV-1a-64
  over the logit words the shipped checkpoint produces on a fixed 64-case corpus. It is
  duplicated in `crates/web/src/lib.rs` and `tools/wasm_check.js`, and native and wasm
  agree on it. Its registry row in [`hashes.md`](../reference/hashes.md#golden-registry)
  names the `-C target-cpu=native` hole that bounds it.

`crates/policy` deliberately did **not** gain the dependency.
`ArticulatedPolicyKind::Learned` is code 4 in the registry and its `build()` still
answers `None`, because a trained fighter is a kind *plus fifteen kilobytes of weights*
and an integer registry has nowhere to put them. The dispatch lives in `crates/web`'s
`build_articulated_policy`, beside the buffer holding the weights, and a fighter that
asks for code 4 with nothing loaded is refused by name with `ARENA_NO_CHECKPOINT`. The
ABI for fetching and installing one is in
[`articulated-abi.md`](../reference/articulated-abi.md#the-checkpoint-staging-buffer).

## The hand-written policies, unchanged

`PolicyKind` still exposes Utility, Duelist, Idle and Random on the legacy seam, and
they are still authored algorithms with named fixed-point weights. `PolicySpec` maps
each named weight to a gene in `0..=1`, `MAX_GENOME_LEN` bounds the flat genome, and the
browser uses the same metadata for its sliders. The two registries share no code space:
the trained network is on the *articulated* seam and no legacy code names it.

`Observation::write_features` remains the versioned fixed-width legacy vector. The
network does not read it -- `learn_core::write_features` writes a separate 41-column
slice off `ArticulatedObservation`, and the layouts are versioned separately.

## What `lab evolve` does, and why it is not this

The Lab CLI's `evolve` runs a deterministic `(mu + lambda)` search over the *named
weights of an existing hand-authored policy*. A population begins with the hand-tuned
baseline, evaluates candidates through the ordinary native run harness, retains elites,
and mutates only genes the selected policy reads. Every candidate in a generation sees
the same seed set, seeds change between generations, and the winner is re-scored on a
fixed held-out range. Parallel evaluation writes scores back in population-index order;
tests require the same genome across thread counts.

**It is a different thing from `learn-probe` and the distinction is the point of this
page.** `evolve` changes constants consumed by code somebody wrote; it does not change
the observation-to-command function. `learn-probe` optimizes the function itself. They
share the rollout, fitness, selection and holdout shape, which is exactly the reuse the
older version of this document predicted.

## Still absent

None of the following exists, and each is a deliberate deferral rather than an
oversight:

- **Browser training.** It needs threads and minutes; `std::thread::scope` and the wall
  clock live in `crates/learn`, which is why the split put them on the far side of a
  crate boundary from anything a browser loads.
- **No GPU evaluator, and no Python training pipeline.** The workspace has no external
  dependency at all and `tools/check_deps.js` audits every member for one.
- **A checkpoint picker beyond the shipped file.** The staging buffer takes any
  checkpoint a caller fetches, so this is client work rather than module work.
- **More than one network in a duel.** The installed checkpoint is one network, not a
  per-fighter handle; a slot array is additive later in the two reserved bytes of each
  fighter block.
- **No learned state inside the simulation.** This one is not deferred; it is refused,
  and the three fences above are what refuse it.
