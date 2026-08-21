# Learning status

**Purpose:** State exactly what policy optimization ships today, what the trained network is allowed to touch, and which components still do not exist.
**Status:** current
**Canonical source:** [`crates/learn-core/src/model.rs`](../../crates/learn-core/src/model.rs), [`crates/learn/src/probe.rs`](../../crates/learn/src/probe.rs), [`crates/policy/src/lib.rs`](../../crates/policy/src/lib.rs), and [`crates/lab/src/main.rs`](../../crates/lab/src/main.rs)
**Update when:** A learned policy, model artifact, inference runtime, training backend, genome surface, or evolution method changes.

**This document opened with "No learned policy currently ships" until 2026-08-11, and
by then four of that sentence's clauses had been false since `v2-19` and a fifth since
`v2-ui-08`.** It is recorded rather than deleted because the boundary the old sentence
was protecting is the same one this page still exists to state -- what moved is which
side of it the code sits on, not where the line is.

## What ships

A trained network drives a fighter, natively and in the browser. Two frozen
artifacts ship, and their roles are deliberately different:

| | V1 probe | Tactical V2 roster policy |
|---|---|---|
| network | 41 x 64 x 18, 3,858 `f32` weights | 59 x 64 x 26, 5,530 `f32` weights |
| artifact | `checkpoints/v2-probe.ckpt`, 15,580 bytes | `checkpoints/learned-roster-v2.ckpt`, 22,264 bytes |
| format | `Checkpoint`, the installed staging-buffer model | `CheckpointV2`, with the full-roster mask `0b11111` |
| host | `lab trace --policy learned` and the V1 wasm staging ABI | `lab trace --policy learned-roster` and Arena-local policy code `5` |
| score | historical only; the corpus it was trained against is gone | passed every five-opponent promotion row; [measured record](../performance/learned-roster-policy.md) |

Both use the ReLU forward pass and versioned feature/action layouts in
[`crates/learn-core`](../../crates/learn-core/src/model.rs). Training stays in
[`crates/learn`](../../crates/learn/src/probe.rs), outside the browser dependency
graph. The browser compiles the one promoted Tactical V2 artifact into `web.wasm`;
it does not fetch or train that model at runtime. The older V1 staging buffer remains
an independent ABI for the exact file a caller installs.

**The score row used to read "88.922 mean return over 400 held-out seeds, 95% CI
`[86.287, 91.962]`, 30 kills, against the scripted windmill's 84.606", and every part
of that is now history.** It was measured on the *articulated* duel against the
articulated windmill, and session 05 deleted the model, both its fixtures and two of
the five conditions the comparison ranked. `crates/learn`'s corpus is `embodied-duel-v1`
now and its non-learned conditions are a zeroed network, the scripted body, the strike
planner and that planner with a fixed guard — so there is no windmill to beat and no
number here that a reader can check.

**The V1 checkpoint itself is unaffected and still ships.** `ModelShape`, both layout
versions and the forward pass are untouched, `checkpoints/v2-probe.ckpt` decodes, and
`LEARNED_INFERENCE_DIGEST` is unmoved at `0xbdba8d64d340ce32`. What is missing is a
*score* for it on the corpus that exists, and producing one is a measurement session
rather than a deletion session's business — the weights were fitted against a fighter
that no longer exists, so the honest expectation is that the number is worse and the
useful work is retraining rather than re-scoring.

Get today's figure with
`cargo run --release -p lab -- learn-probe evaluate --checkpoint checkpoints/v2-probe.ckpt`.
The training and evaluation logs under `checkpoints/` are gitignored, so the command is
the citation and the `.ckpt` is the only tracked artifact.
[The v2 learning probe record](../performance/v2-learning-probe.md) holds the last full
table and is marked historical for the same reason this row is.

**No gradient is computed anywhere.** The optimizer is an evolution strategy over the
whole weight vector: it samples, scores through the ordinary rollout harness, keeps
elites and mutates. There is no autodiff path, no backward pass and no tensor library,
which is why the whole thing is a few hundred lines with zero external dependencies.

The Tactical V2 contract preserves the 41 V1 features and 18 V1 logits as prefixes.
Its appended inputs describe opponent regions, the controller's threat assessment,
and its tactical phase; its appended eight-way head chooses a `TacticalIntentV1`
that `StrikePlanner` executes to the fixed-point motor boundary. `CheckpointV2`
validates those layouts and the recorded opponent mask independently. Promotion did
not change the V1 artifact or `LEARNED_INFERENCE_DIGEST`; it added the separate
`LEARNED_TACTICAL_INFERENCE_DIGEST` instead.

## The boundary, which did not move

The premise that lets these two crates use floating point is that **nothing they
compute reaches authoritative state**, and it is enforced three ways rather than
promised:

- **A type fence.** `learn_core::LearnedActionV1` is a different type from the
  submitted command, and the world's submission cannot be handed one.
  What crosses from the float side to the integer side is **five head indices**, chosen
  by an argmax, which then index a fixed table of `Fx` constants. Tactical V2 crosses
  the same boundary as a fixed tactical-intent index; `StrikePlanner`, on the integer
  side, turns that intent into the submitted command.
- **A direction fence.** `the_learned_policy_is_unreachable_from_sim` in
  `crates/learn-core/tests/direction.rs` asks Cargo for the resolved graph and asserts
  that `fx`, `sim` and `policy` reach neither crate, that `web` reaches `learn-core`,
  and that `web` does not reach `learn`. **It is the whole of that enforcement** -- the
  compiler was never doing it -- and it reads `cargo tree` rather than the manifests
  because reading them as text is how it failed. It matched `path = "../` byte-exactly
  and let three ordinary spellings straight past: `{path="../learn"}`,
  `path = "../learn/"`, and `learn.workspace = true`. A hand-rolled parser of somebody
  else's format has that shape of hazard by construction.
**The standing instruction that goes with the arrow, recorded here because it used to
live in `AGENTS.md` and the enforcement is not the same thing as the rule:** *if a
second host for `crates/learn` ever appears, check first that it is not `web`.* It was
discharged once, for `learn-core`, by the session that split the crates -- the check was
made and the answer is the amendment above. It **stands unchanged for `learn`**, whose
only host is `lab`, through `lab learn-probe` and `lab trace --policy learned`.

- **Cross-target pins.** `LEARNED_INFERENCE_DIGEST` (`0xbdba8d64d340ce32`)
  and the additive `LEARNED_TACTICAL_INFERENCE_DIGEST`
  (`0x6d06a0e332628298`) are FNV-1a-64 over logit words on fixed synthetic
  corpora. Rust and wasm publish both. Their registry rows in
  [`hashes.md`](../reference/hashes.md#golden-registry) name the
  `-C target-cpu=native` hole that bounds the portability claim.

`crates/policy` deliberately did **not** gain the dependency, and the reason outlived
the registry entry that used to demonstrate it. The articulated registry had a
`learned` code whose `build()` answered `None`, because a trained fighter is a kind
*plus fifteen kilobytes of weights* and an integer registry has nowhere to put them;
the dispatch lived in `crates/web`, beside the buffer holding the weights, and a
fighter asking for that code with nothing loaded was refused by name.

**`PolicyKind` still has no learned entry**, so `PolicyKind::build` remains total and
the dependency direction remains intact. The two hosts that own checkpoint bytes own
their learned selection too: Lab has its local learned variants, while `crates/web`
appends Arena-local code `5` for the exact compiled roster artifact after the five
`PolicyKind` codes. The V1 checkpoint staging buffer is untouched and
`LEARNED_INFERENCE_DIGEST` is still taken over whatever it installs; the browser ABI
and the compiled Tactical V2 digest exports are in
[`articulated-abi.md`](../reference/articulated-abi.md#the-checkpoint-staging-buffer).

**Neither crate carries a crates.io dependency, and neither does anything else.**
`tools/check_deps.js` walks **every** workspace member from `cargo metadata --no-deps`
and refuses any registry or git source. It seeded that walk from a hard-coded five-name
list until 2026-08, which left `web` and `lab` unaudited -- a registry crate added
straight to `crates/web/Cargo.toml` compiled into `web.wasm` and the audit reported
"passed". `tools/check_deps.test.js` is the fixture that guards the audit, and `cargo
test` does not run it: run both when you touch a manifest or the audited set.

## The one `unsafe` exception in the repository

`fx`, `sim`, `policy`, `learn-core` and `learn` are all `#![forbid(unsafe_code)]`.
**One test binary is the exception and it is the only one.**
`crates/learn/tests/allocation.rs` installs a counting `#[global_allocator]`, which
`std` requires to be an `unsafe impl`, because that is the only way to make
`frozen_inference_allocates_nothing_after_warmup` an actual measurement rather than an
assertion about the source.

It ships in nothing, every `unsafe fn` body writes its own block under
`#![deny(unsafe_op_in_unsafe_fn)]`, and the library it tests -- `learn-core`, since the
split -- is still `forbid`. **That split made the claim sharper rather than moving it:**
the code it counts now ships inside `web.wasm`, where an allocation on the decision path
grows linear memory and detaches every typed array the page holds. If a future session
decides the exception is not worth it, delete the file and the claim together -- keeping
the claim without the counter is the one outcome that would be worse than either.

## The hand-written policies, unchanged

`PolicyKind` still exposes Utility, Duelist, Idle and Random on the legacy seam, and
they are still authored algorithms with named fixed-point weights. `PolicySpec` maps
each named weight to a gene in `0..=1`, `MAX_GENOME_LEN` bounds the flat genome, and the
browser uses the same metadata for its sliders. The two registries share no code space:
the trained network is on the *articulated* seam and no legacy code names it.

`Observation::write_features` remains the versioned fixed-width legacy vector. The
network does not read it -- `learn_core::write_features` writes a separate 41-column
slice off `Observation`, and the layouts are versioned separately.

## What `lab evolve` did, and why it is not this

**Deleted by embodied session 10, with the policy it evolved.** It is described in the
past tense rather than removed from this page, because the distinction it drew is the
point of the page and outlives the command.

`evolve` ran a deterministic `(mu + lambda)` search over the *named weights of an
existing hand-authored policy*. A population began with the hand-tuned baseline,
evaluated candidates through the ordinary native run harness, retained elites, and
mutated only the genes the selected policy read. Every candidate in a generation saw the
same seed set, seeds changed between generations, and the winner was re-scored on a
fixed held-out range.

**It was a different thing from `learn-probe`, and that is what this page exists to
say.** `evolve` changed constants consumed by code somebody wrote; it did not change the
observation-to-command function. `learn-probe` optimizes the function itself.

It was deleted rather than ported because **the embodied script is not a genome.** Its
subject was `UtilityWeights` through `PolicySpec`, and `ScriptedPolicy` has no
named weights at all; porting the search would have meant inventing a subject for it.
That leaves this repository with no weight search at all, which is a real loss and is
recorded here rather than in a commit message: anyone who wants one back is writing it
against a policy that has parameters, not restoring this one.

## Still absent

None of the following exists, and each is a deliberate deferral rather than an
oversight:

- **Browser training.** It needs threads and minutes; `std::thread::scope` and the wall
  clock live in `crates/learn`, which is why the split put them on the far side of a
  crate boundary from anything a browser loads.
- **No GPU evaluator, and no Python training pipeline.** The workspace has no external
  dependency at all and `tools/check_deps.js` audits every member for one.
- **An arbitrary checkpoint picker.** The Arena offers the exact promoted roster
  artifact compiled into the module. The separate V1 staging buffer can accept a file,
  but the studio does not expose arbitrary Tactical V2 slots or artifacts.
- **No learned state inside the simulation.** This one is not deferred; it is refused,
  and the three fences above are what refuse it.
