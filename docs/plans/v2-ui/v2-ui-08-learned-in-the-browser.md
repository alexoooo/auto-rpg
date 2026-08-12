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

[`crates/learn-core/src/model.rs:971`](../../../crates/learn-core/src/model.rs#L971) (`crates/learn/src/model.rs:968` when this plan was written; the split moved it):

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

*As built: the two filesystem methods on `Checkpoint` moved with it and are*
*`#[cfg(not(target_family = "wasm"))]`, because `lab` calls them as inherent methods*
*and `crates/lab` was out of scope. See the closing note.*

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
would mean `Model::forward`'s portability claim is false, discovered by the first host able to test it
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

## What was built, 2026-08-11

### Decision: `pass`

`LEARNED_INFERENCE_DIGEST` is `0xbdba8d64d340ce32` and **native and wasm32 agree**, on
the first run. `model.rs`'s portability claim — carried since `v2-19` with the explicit
admission that "this repository has no second host to check it on" — is now checked, and
it holds. The `Fx`-quantisation fallback is not needed and was not built.

The digest was shown to be sensitive to what it pins rather than merely stable: of seven
mutations to `Model::forward`, identity activation, a dropped bias, reversed summation
order and `mul_add` contraction all move it, and the three that do not are semantically
identical or sub-ULP. All 41 feature columns and 3,855 of the 3,858 weights move it; the
three that do not are ReLU masking and move under any absolute nudge ≥ 1.0. That
`mul_add` moves it makes the `-C target-cpu=native` caveat above an empirical hazard
rather than a rhetorical one.

An adversarial review found eight defects, two of them serious, and both are fixed with
a test that was seen to fail on the unfixed code first:

- **A refused checkpoint grew linear memory by 4.26 MB** and detached every typed array
  the page held, while a *legitimate* checkpoint cost zero pages — a 62,645× amplification
  on the one input the ABI says a person chooses from a picker. See the struck entry under
  "Confirmed correct and left alone" below: the first review pass cleared this.
- **`the_learned_policy_is_unreachable_from_sim` was defeated by three ordinary manifest
  spellings.** That mattered because this session established that the compiler never
  enforced `web ↛ learn` at all, which made the test the entire fence.

Deferred, as the plan allows: training in the browser (it needs threads and minutes), and
a checkpoint picker beyond the shipped one.

**Owed to a human, not to a session.** The plan's by-hand check — run learned against the
composed script in the arena and watch it from the first-person view of the body it is
beating — could not be performed here. It needs `v2-ui-07` to wire the live path, and it
needs a visible browser tab: an automated tab on this machine receives no animation frames
at all, so nothing about the rendered result can be judged from one.

What follows is the evidence behind that decision.

### The result: `LEARNED_INFERENCE_DIGEST` is `0xbdba8d64d340ce32` on both targets

Native, MSVC x86-64, `cargo test -p web -- --ignored --nocapture print_the_learned_inference_digest`:

```text
LEARNED_INFERENCE_DIGEST: 0xbdba8d64d340ce32
checkpoint:               7a05fc8c76ad47858ac69f770d595fa556b1bfb81dbf7d62ced831e751e26b6c
checkpoint bytes:         15580
corpus:                   64 cases, 18 logits each
```

wasm32, `node --test tools/wasm_check.js`:

```text
learned digest 0xbdba8d64d340ce32  == native
```

**They agreed on the first run**, and so did the checkpoint's own SHA-256 read back
out of `checkpoint_digest_ptr`. `Model::forward`'s portability argument is no longer a
claim about hosts it has never met. The `Fx` quantisation fallback this file named in
advance was **not** implemented and was not needed; nothing was re-scored, because
nothing about the model changed.

The held-out score is unchanged, quoted from `checkpoints/evaluate.log` as this file
asks: **88.922** mean return, 95% CI `[86.287, 91.962]`, 30 kills, against the
windmill's 84.606. `lab learn-probe evaluate --checkpoint checkpoints/v2-probe.ckpt`
was re-run and reproduced every column of both tables exactly; only the wall-clock
inference line differs, at 3.41 microseconds a decision against the log's 3.01 and
4.58, which is what a timing line does.

### No existing pin moved

```text
LAB_HASH                  0xfe31370e141ef531   cargo run --release -p lab -- hash
ROOM_HASH                 0x98441a18db7a95ca   cargo test -p web -- --ignored --nocapture print_the_golden_hashes
BATTLE_HASH               0x9aafe4bd54560586   (same command)
SWAP_HASH                 0xf948f5486ee90191   (same command)
BOW_HASH                  0x4a1157735d305e9f   (same command)
combat spec-table digest  0x78e5b57ae0c6bbd6   cargo test -p sim -- --nocapture the_shipped_fixture_digest
articulated-duel-v1       0x068d05fcada1027b   (same command)
ARTICULATED_STREAM_DIGEST 0xf7d3a9c73aa59981   cargo test -p web -- --ignored --nocapture print_the_articulated_stream_digest
```

`ARTICULATED_COMMAND_HASH`, `COMBAT_GEOMETRY_HASH`, `CONTACT_BEHAVIOR_DIGEST`,
`GOLDEN_STATE_HASH`, the contact format corpus and the legacy feature prefix are
asserted by tests that pass. **No `ARTICULATED_HASH` was created.** The session is
additive by construction: nothing in `crates/fx`, `crates/sim` or `crates/lab`
changed, and the only edit to `crates/policy` is prose.

### The one number that did move, and it is not a pin

`published_views_survive_articulated_stress_without_memory_growth` settles at **242
pages**, up from 241. The 32,768-byte checkpoint staging buffer is half a page of
static data that happened to fall across a page boundary. The test asserts no growth
against a baseline it measures for itself, so it passes; the figure is a record. It
is corrected in [`articulated-abi.md`](../../reference/articulated-abi.md#ownership-visibility-and-memory)
and is **stale in a comment in `client/test/wasm-memory.test.mjs`**, which was outside
this session's file set.

### What a learned decision costs in wasm

v2-ui-05's measurement section says the `learned` policy is unmeasured and that this
session owes its own number. Half of it is paid: `learned_inference_digest_lo()` is 64
feature extractions and 64 forward passes and nothing else.

**The figure took three passes and the range is the result.** It was first recorded
here as 75.4–78.5 microseconds a call, best of nine across three pinned process runs —
and *without the trailing control `AGENTS.md` mandates*, which is the half that turns a
best-of-nine into evidence. An adversarial re-measurement on the same machine could not
get within 21% of it and read 91.4–102.0. A third pass, six processes pinned to logical
CPU 0 at high priority with the baseline repeated as a control at the end of each,
reads **84.3 to 85.8 microseconds a call — 1,317 to 1,341 nanoseconds a forward pass**,
with the trailing control inside 4% of its own best in all six.

What separates the three is the warm-up, and the control is what exposes it: a
long-warm-up run here reads a best of 85.4 and a trailing control of 115–125, so its
"best" describes the first few seconds of the process rather than the function. **Quote
roughly 1.3 microseconds a forward pass, plus or minus a couple of hundred nanoseconds,
and do not read a 10% move in this number as a change in the code.**

The conclusion never depended on the third digit and is unchanged: at one learned
decision per tick, against the ~100 microseconds a contact-bound tick costs, inference
is **about 1% of a tick**.

The native figure `lab learn-probe evaluate` prints — 3.01 and 4.58 microseconds a
decision over 116,021 and 116,413 decisions — is **not** comparable and should not be
read as wasm being faster: that one is wall-clock under twenty-way contention. What is
still owed is a whole learned *fight* through v2-ui-05's harness; `compose`, the
submission and the arm driver are outside the number above.

**How little that line means is now measured too.** The second review re-ran
`learn-probe evaluate` on a busy machine and it reproduced `evaluate.log` line for
line — both tables, both verdicts, both bootstrap intervals, 81,333 cap hits, 400/400
replays reproduced exactly — with exactly one number different: the same inference
line read **14.27** microseconds a decision against the log's 4.58, a 3.1x move with
nothing about the model changed. It is a wall clock divided by a decision count, and
it should not be quoted beside a pinned figure.

### Decisions this file left open

- **The checkpoint is one installed network, not a per-fighter handle.** This file
  says "the arena config buffer therefore carries a checkpoint *handle*". It does not,
  and the handle was dropped deliberately: it would have moved
  `ARENA_CONFIG_LAYOUT_VERSION`, which v2-ui-05 froze and v2-ui-07 is about to write a
  client against, and it would have bought exactly one thing — two *different*
  networks in one duel. The studio can still load any checkpoint it likes without a
  Rust rebuild, which is the property the section actually argues for. A slot array is
  additive later, in the two reserved bytes of each fighter block.
- **`checkpoint_capacity()` and not `checkpoint_len()`.** A checkpoint is not a fixed
  width, so the buffer is a capacity and the length is an argument; the name follows
  `pose_capacity` rather than `arena_config_len`.
- **`ARENA_NO_CHECKPOINT` (26) is a new refusal, replacing `ARENA_POLICY_UNAVAILABLE`
  (7) as the answer code 4 gets.** Both keep their numbers. "Fetch one" and "rebuild
  the module" are different instructions and a studio that could not tell them apart
  would show the wrong one; 7 joins the unreachable set with the seven spec errors, on
  the argument that section already makes.
- **Two exports beyond the four this file named:** `checkpoint_installed`, so a picker
  can grey the entry out rather than discovering the refusal by trying it, and
  `checkpoint_digest_ptr`/`_len`, which publishes the file's SHA-256 — the number
  `lab trace` writes into a recording's header. Without it "a live fight and a traced
  fight can be compared on identical terms" is not a thing a browser can do.
- **The digest is over an installed checkpoint rather than an embedded one.** The
  alternative was `include_bytes!`, which would have contradicted this file's own
  delivery decision to gain nothing: taking the digest over what `load_checkpoint`
  installed means the pin exercises the fetch, the staging buffer and the decoder as
  well as the forward pass.
- **The corpus is synthetic and lives in `learn-core`.** A digest over simulation
  output would move whenever the simulation moved, and the ownership rule this file
  asks for — a move means one of four changes, or a portability failure — would mean
  nothing. It is 64 cases drawn from `fx::Rng`, and two tests hold it to covering every
  branch in `write_features` and putting a nonzero number through all 41 columns.
- **`Checkpoint::read` and `write_atomically` are compiled out on wasm.** `std::fs`
  does compile for that target and answers `Unsupported`, so the `cfg` is not what
  makes the build work — it is what makes "no I/O on any path a browser can reach" a
  fact about the artifact rather than a promise about the callers. Everything else in
  `checkpoint.rs` moved unchanged, which is what keeps `crates/lab` source-identical.
- **`vite.config.ts` ships the one file.** `/checkpoints/v2-probe.ckpt` in development
  and `dist/checkpoints/` at build, with an `ARPGLRN1` magic check before the copy and
  a 404 for everything else under `checkpoints/` — the training logs are evidence a
  reader quotes and should not become addressable for sharing a directory.

### The handshake v2-ui-07 will wire

Written out in full in
[`articulated-abi.md`](../../reference/articulated-abi.md#the-checkpoint-staging-buffer),
because the client is not this session's to write. In short: fetch, refuse locally if
longer than `checkpoint_capacity()`, take a **fresh** view over `checkpoint_ptr()`,
write, drop the view, call `load_checkpoint(len)`, decode the packed word, and only
then send policy code 4. `load_checkpoint` is the **only allocating call in the set**,
so it belongs in the warm-up beside `init_articulated` and never mid-frame while a
typed array over the pose buffer is held.

None of the eight new exports has an entry in `sim.worker.ts`'s `requiredFunctions`,
for the reason v2-ui-05's closing note gives about its own seven and with the same
disclosure: the worker's adapter calls none of them, and v2-ui-07 is the session with
a caller. All eight **are** in `tools/wasm_check.js`'s `typeof` list, which is the half
that catches a rename.

### What ran

Re-run after the second adversarial review, which is the state that matters:

```text
cargo test                                                    all green
cargo build --release --target wasm32-unknown-unknown -p web  (before wasm_check)
node --test tools/wasm_check.js                               28 pass (27 before the review)
node --test tools/check_deps.test.js                          16 pass (13/2 before the review)
node --test client/test/wasm-memory.test.mjs                  3 pass, 242 pages
node tools/check_deps.js                                      pass
node tools/check_docs.js                                      1 problem, not this session's
cargo run --release -p lab -- hash                            0xfe31370e141ef531
cargo run --release -p lab -- learn-probe evaluate            88.922 held out, unchanged
npm run check                                                 pass
npm run build                                                 pass, dist/checkpoints/v2-probe.ckpt
```

**`node --test tools/check_deps.test.js` was not on this list the first time and that
is how it stayed red**, at 13 pass and 2 fail, across a session that edited the exact
constant its fixture covers. It is on the list now.

`check_docs`'s one remaining problem is `docs/architecture/browser-runtime.md:142`,
and it is another agent's uncommitted edit rather than this session's: the sentence it
objects to is an added line in `git diff` and is not in `HEAD`.

### What this file asked for and did not get

- **"By hand: run learned against the composed script in the arena, and watch it from
  the first-person view of the body it is beating."** Not done, and it is not doable
  yet rather than skipped. `#/arena` plays a recorded `lab trace` file and reads
  neither wasm nor the worker — v2-ui-05's closing note records that none of the seven
  configured-duel exports has a client caller and that **v2-ui-07 is the session that
  wires them**, and this session's eight are in the same position. What *can* be
  watched today is `lab trace --policy learned --checkpoint checkpoints/v2-probe.ckpt
  --seed 3` played through `#/arena`, which is the lab's fight rather than the
  browser's. The two are the same fight — that is what
  `a_learned_fight_in_wasm_matches_the_same_fight_in_lab` says — but the by-hand check
  as written needs a live source and belongs to the session that builds one.
- **A pinned learned-fight number in `tools/wasm_check.js`.** Deliberately absent, on
  v2-ui-05's argument in its own words: the number would be an articulated fight's
  state hash, which is `ARTICULATED_HASH` under another name — planned by v2-17,
  deliberately absent, and which no session here may create. What the wasm check does
  instead is the same set that session settled on: the module takes the code once a
  network is installed, runs the fight rather than standing still, fights the same
  fight twice from the same bytes, and does not fight the script's fight. The
  cross-target claim this session owes is `LEARNED_INFERENCE_DIGEST` and that **is**
  pinned on both sides.
- **`sim.worker.ts` entries for the eight new exports.** None, and disclosed here
  rather than left silent — which is the correction v2-ui-05's note made about its own
  seven. The worker's adapter calls none of them and a name in that list that nothing
  calls is a promise the list does not otherwise make. All eight are in
  `tools/wasm_check.js`'s `typeof` list.

### A load-bearing claim in `AGENTS.md` was false, and this session measured it

The rule this file amends rested on a sentence that is not true:

> `learn` ... must stay unreachable from `web` — it uses `std::thread::scope` and
> does not compile to `wasm32-unknown-unknown`

Measured on 2026-08-11, on this toolchain:

```text
cargo build --release --target wasm32-unknown-unknown -p learn   Finished
```

It **succeeds**, and `learn` is the crate that uses `std::thread::scope` and
`std::time::Instant`: both exist for that target and trap at *runtime*, and nothing
about them stops a build. That one command is the whole refutation.

**`-p lab` does not build on this tree, and an earlier version of this section and of
`AGENTS.md` claimed it did.** It fails, but not for the reason the old sentence gave —
`Checkpoint::read` and `write_atomically` are `#[cfg(not(target_family = "wasm"))]` and
`lab`'s three call sites of them are the entire failure, which is also why a bare
workspace build fails. It was checked during the session by temporarily removing this
session's own `cfg` gate, and that qualifier never made it into the sentence, so what
shipped was a second false measured claim sitting inside the correction of the first.
Corrected in `AGENTS.md` by an adversarial review. The neighbouring instruction —
*`-p web`, never a bare workspace build* — keeps its verdict and loses its old reason.

**The rule is right and its reason was wrong**, which is the more dangerous shape:
a session that trusted the compiler to enforce it would have been trusting nothing.
Corrected in `AGENTS.md`, `docs/architecture/overview.md` and both crate headers, and
what enforces the boundary now is the manifests plus
`the_learned_policy_is_unreachable_from_sim`, which reads them. A bare workspace wasm
build *does* fail today, but only because `Checkpoint::read` and `write_atomically`
are `#[cfg(not(target_family = "wasm"))]` and `lab` calls both — this session's own
gate, not threads.

### What a first adversarial pass found, and what it changed

Fifteen findings, none of them a live bug in an export and two of them worth more
than the prose they were about. Fixed here:

- **The comment this whole session exists to falsify was still in the present
  tense.** `Model::forward` went on saying *"It is still only a claim about hosts
  other than this one, because this repository has no second host to check it on"*
  while six places -- `digest.rs`, `learn-core`'s header, two in `crates/web`,
  `wasm_check.js`, `hashes.md`, `policy.md` -- quoted it as *history*. A reader
  following any of them found the claim intact. Rewritten with the caveat that
  bounds it.
- **A NaN logit's bits are not portable, and `NotFinite` does not cover it.** This
  file's ingredient table says "NaN cannot enter: `CheckpointError::NotFinite`
  refuses at load" -- true of a *weight* and not of a *logit*. Finite-but-enormous
  weights are accepted, they can overflow the first layer to an infinity, and
  `Inf + (-Inf)` in the second is a NaN whose payload bits **WebAssembly leaves
  unspecified**. Since `load_checkpoint` takes any file a person picks and the
  digest is a public diagnostic over whatever is installed, that is a real way to
  read a portability failure that is none. Closed by `learn_core::portable_bits`,
  which folds every NaN onto `f32::NAN`'s compile-time constant; infinities need
  no fold. **The pin did not move** -- `the_shipped_corpus_produces_only_finite_logits`
  checks all 1,152 words, so the fold is unreachable for the shipped fighter.
- **"Allocates nothing" was asserted three times and measured nowhere**, for a
  function whose whole safety story mid-frame is that claim. Now counted:
  `the_cross_target_digest_allocates_nothing` drives it through the same
  `#[global_allocator]` harness `frozen_inference_allocates_nothing_after_warmup`
  uses.
- **`CASE_TICKS = 57` said "coprime with the script's 360-tick cycle".**
  `gcd(57, 360)` is 3. The 64 phases are still distinct so the fixture is fine, but
  a *frozen* constant with a false derivation is one a future session re-derives
  and moves the pin with. Corrected in place.
- **The corpus header said the subject's wound fractions are left blank**; they are
  filled, as is its severed mask, and both draws consume `Rng` state -- so deleting
  "a field nothing reads" would reshuffle every case after it. Recorded as
  load-bearing.
- **"Every third case is disarmed" was wrong for the multiples of fifteen**, which
  carry a blade in the *off* hand and are the state the shipped roster never
  produces. The coverage test now counts all four blade states by name instead of
  by total.
- **`docs/architecture/overview.md`'s "Authority by layer" had no `learn-core`
  bullet at all** and still said `learn` "is the only crate permitted floating
  point" -- contradicting the mermaid diagram twelve lines above it in the same
  file, which this session had already updated.
- **The re-record rule cited a file a clean clone does not have.**
  `checkpoints/*.log` is in `.gitignore`; only `v2-probe.ckpt` is tracked. The
  88.922 is now written out with the command that reproduces it, in
  `hashes.md`, in `crates/web` and in `articulated-abi.md`; `vite.config.ts`'s
  allowlist argument was rewritten to be true of a clean clone as well as of a
  working tree.
- **`articulated-abi.md`'s `arena_start` bit table** still said bits 24..31 carry
  the policy code "for an unavailable policy" and did not mention reason 26 --
  which also carries it. A client decoding by that table would have read 255 where
  a 4 is. Corrected, with the instruction to branch on the reason and not the byte.
- **Two of the three new `wasm_check.js` tests depended on their predecessor** and
  were the only order-dependent tests in 2,300 lines. Each now loads the checkpoint
  itself; both verified green under `--test-name-pattern` alone.
- **A dead `#L968` link** into the deleted `crates/learn/src/model.rs`, in this
  file. Repointed.

Confirmed correct and left alone: no panic or trap path in any new export (`len`
is bounds-checked before every slice, `Reader::take` uses `checked_add`, ~~the two
`Vec::with_capacity` calls are capped~~, `rchunks_exact` replaced the one
subtraction, SHA-256 is `wrapping_add` throughout under `overflow-checks = true`);
no float reaching authoritative state; `thread_local` isolation in `crates/web` is
real even at `--test-threads=1`; `the_learned_policy_is_unreachable_from_sim` is
not vacuous; the digest tests are not vacuous.

**One entry on that list was wrong and it is struck rather than removed, because
the first pass caught a live defect and stopped one line short of it.** The two
`Vec::with_capacity` calls in `Checkpoint::from_bytes` *were* capped — at 4,096
seeds and `1 << 20` weights, which are numbers with no relationship to what a legal
file can carry. `ModelShape::CURRENT` fixes the weight count at 3,858 and the shape
check three lines earlier has already refused everything else, so the cap was 271×
the only value that can reach it. A 68-byte file claiming four billion weights
reserved 4 MiB, grew linear memory by 65 pages — 62,645× the file it was refusing —
and detached a `Float32Array` held over `pose_ptr()`, all while correctly answering
`Truncated` and installing nothing. That is the exact failure `AGENTS.md`'s
`#[global_allocator]` paragraph and this ABI's three fixed arrays exist to prevent,
reached from the one input the reference says a *person* chooses from a picker. The
caps are now `bytes.len() / 8` and `ModelShape::CURRENT.weight_count()`, and
`a_refused_checkpoint_does_not_grow_linear_memory` in `tools/wasm_check.js` measures
`memory.buffer.byteLength` across four overclaiming headers — it failed on the
unfixed artifact with the 65-page message above and passes on the fixed one. The
lesson worth keeping: *"the allocation is capped"* is not the property, *"the cap is
a bound the input can justify"* is, and the one allocating export in the set had no
linear-memory coverage at all until now.

Three more prose claims the second review refuted, all of them arguments this session
wrote for properties the code does not have:

- **`digest.rs` argued for an order-independence the digest does not have.**
  `learned_inference_case` is "a function of the index and not a walk, **so that a
  caller can digest the corpus in any order it likes**" — and twelve lines further down
  the same file deliberately chains a `FeatureMemory` from case to case, because two of
  the forty-one columns are rates. Measured on the shipped checkpoint: the ascending
  walk is `0xbdba8d64d340ce32`, reversed is `0x5004b7f19df2d8a6`, and one adjacent swap
  is a third number. The *case builder* is order-free and that is worth saying; the
  *digest* is not, and it has exactly one caller. Corrected in place, with the property
  that survives — a failing case can be rebuilt from its index alone.
- **The corpus header listed the arms' target-hand triples under "what is left
  blank"**, and `learned_inference_case` fills them. It is the one filled-but-unread
  field whose assignment consumes no `Rng` state, which makes it the *counterexample*
  to the paragraph directly above it teaching that these draws are load-bearing.
  Recorded as such, with the rule sharpened to "check the draw, not the assignment".
- **`articulated-abi.md`'s instruction to branch on the reason cited the wrong
  collision.** It justified the rule with "`4` is a perfectly good hand index and a
  perfectly good policy code" — but `ARENA_HANDS` is 2, so a hand byte is only ever
  `0`, `1` or `255`, and what a hand index actually collides with is policy code `0`
  (`neutral`) or `1` (`composed`). The instruction was right and its example was
  impossible.

### Found wrong outside this session's file set, and deliberately not fixed

- **`docs/architecture/learning.md` was the most wrong document in the tree**, and it
  was wrong before this session rather than because of it. Its opening paragraph
  read *"No learned policy currently ships. There is no neural-network
  implementation, model file, inference dependency, gradient/autodiff path, browser
  trainer, Python training pipeline, GPU evaluator, or learned state inside the
  simulation."* Four of those nine clauses were falsified by v2-19, which landed a
  41x64x18 network, `checkpoints/v2-probe.ckpt`, and a checkpoint codec; this session
  falsifies a fifth by putting the inference runtime inside `web.wasm`. Its own
  **Update when** line names exactly this change. `check_docs.js` could not see it,
  because the terms are permitted inside its `Proposed by v2` box.
  **Rewritten by the second review**, along with the `> Proposed by v2 -- not shipped`
  box, which is gone. That rewrite needed one edit outside this session's file set:
  `docs/architecture/learning.md` is now in `check_docs.js`'s `shippedTerms`, for
  `learned`/`learning`/`articulated` and deliberately not for `gpu`, `webgpu`, `mlp`
  or `neural-network` — none of which ships, and the page's "Still absent" section
  has to keep reading as absence. Without it a page whose entire job is to say what
  learning exists could only do it in sentences shaped like denials.
- **`client/test/wasm-memory.test.mjs`** writes 241 pages down in a comment beside a
  fixture that now settles at 242. Comment only; the assertion is against a baseline
  the test measures for itself, and it passes.
- **`docs/architecture/browser-runtime.md:142`** fails `check_docs`'s v2-term rule on a
  sentence that is another agent's uncommitted work. Its three `#L` anchors into
  `crates/web/src/lib.rs` *were* stale because of this session and were renumbered
  here — numbers only, no prose — ~~because `check_docs` gates them~~. **That reason
  is false and the five anchors it excused prove it.** `check_docs.js:376-383` only
  asserts `1 <= first <= last <= lineCount`; it never checks that an anchor lands on
  the thing it names, so a one-line shift is invisible to it. The five `#L` anchors
  in `docs/reference/frame-abi.md` were each left one line short by this session's
  own `use learn_core::{...}` import — the only diff hunk before line 139 and net +1
  — and every one of them landed on the last line of a doc comment instead of the
  `pub const` it named. Renumbering `browser-runtime.md` was right; the reason given
  for renumbering only it was not. Corrected by the second review, together with the
  frame-abi five.
- ~~**`crates/lab/Cargo.toml:13-15`**~~ said the `learn` edge exists so that "no
  learned weight crosses the wasm wall". That is precisely the rule this session
  amended, and it survived in the manifest of the crate that owns the edge.
  **Rewritten by the second review**: `learn` does compile to wasm32, a learned
  weight does cross the wall now through `learn-core`, and the rule that survives is
  about the *trainer* — threads and a wall clock behind `pub extern "C"` are runtime
  traps in a shipped artifact.
- ~~**`README.md:290-300`**~~'s layout block listed neither `crates/learn`
  (pre-existing) nor `crates/learn-core`, and `README.md:304-306` described learning
  code as free to use "audited exact dependencies", which is not true of
  `learn-core`: it ships inside `web.wasm` and `check_deps.js` holds it to workspace
  paths only. **Both fixed by the second review**, and the paragraph now states the
  stronger fact the audit actually enforces: no crate in the workspace has an
  external dependency and `Cargo.lock` holds seven local packages.
- ~~**`docs/plans/v2-ui/v2-ui-00-overview.md:114`**~~ linked the deleted
  `crates/learn/src/model.rs`, and calling it "outside this session's file set" was
  wrong about it: the file it pointed at is in this session's own
  `git diff HEAD --name-only`. It was the last dead `#L` link in the tree.
  **Repointed by the second review** at `crates/learn-core/src/model.rs#L971`, with a
  note saying the sentence it quotes is now written in the past tense at the new
  address. `docs/plans/v2-19-learning-probe.md:29` is not a link at all — it is a
  filename inside a fenced `text` block listing what that session added.
  `check_docs.js` exempts `docs/plans/` in any case, which is why this needed saying
  rather than why it did not.
- **Eight further `#L` anchors in the `v2-ui-0{0,4,5}` plan files** were stale by 300
  to 1,700 lines — `Sim::advance` at `#L2165` against `#L2933`, `publish()` at
  `#L3880` against `#L4836`, `measure_articulated_matchup` at `#L823` against `#L849`,
  `PolicyKind::from_code` at `#L296` against `#L307`, `SUBMITTED_COMMAND` at `#L938`
  against `#L1471`, and `dungeon_scenario` at `#L1503` against `#L2178`. All
  renumbered by the second review. **Still stale and reported rather than fixed**, in
  a file that belongs to another session in flight:
  `docs/plans/v2-ui/v2-ui-07-recording-channel.md:27` points at
  `crates/web/src/lib.rs#L4679` (a line inside `pack_combat_event`) and `:92` points
  at `client/src/protocol/messages.ts#L109` (`BufferReturnedMessage`). Whoever lands
  07 should check both against what the prose says they name.
- **`crates/sim`** carries five warnings on this tree: four dead-code (`collect_contacts`,
  `resolve_group`, `allocate_weighted`, `serialize_contact_corpus`) and one unused
  variable at `world.rs:13169`. None is this session's; nothing under `crates/sim` was
  touched.
- **`docs/design/progression.md`, `docs/design/navigation-visibility.md` and
  `docs/decisions/0003-renderer-outside-sim.md`** still carry the `#L` anchors into
  `crates/web/src/lib.rs` that v2-ui-05's review recorded as stale on arrival. They are
  further out now. `check_docs` does not gate them.

### Tests that carry the session

- `native_and_wasm_learned_inference_digests_match`, in `crates/web` and again in
  `tools/wasm_check.js`. **This is the session.**
- `a_learned_fight_in_wasm_matches_the_same_fight_in_lab` — the shipped configuration,
  seed 3, `learned` against `windmill`, driven through the ABI for 3,600 ticks and
  compared against a second hand-written spelling of `lab`'s matchup loop on the state
  hash, the outcome and the stopping tick. **The learned fighter kills the Brute at
  tick 3,339** and both spellings agree on it; the scripted pairing does not settle
  inside the limit at all. The outcome is deliberately *not* asserted — it is a claim
  about the simulation, which this session did not touch.

  **Said plainly because a reader will otherwise infer it wrong: this test lives in
  `crates/web/src/lib.rs`'s `#[cfg(test)]` module and is a *native* test. It never
  runs in wasm.** "in wasm" in its name means through the `pub extern "C"` ABI rather
  than on the wasm target — the file's own convention, and the reason the summary
  above is careful to say the two *spellings* agree. So "3,600 ticks, stronger than
  the digest" is a claim about compounding decisions and not about portability: **the
  entire cross-target evidence for a learned fight is `LEARNED_INFERENCE_DIGEST` over
  the 64-case corpus.** That is not a gap to close here — a pinned learned-fight state
  hash is `ARTICULATED_HASH` under another name, which no session may create — but it
  is the boundary of what this session proved.
- `a_corrupt_checkpoint_is_refused_and_installs_nothing` — every `CheckpointError`
  variant plus the too-long refusal, twenty refused calls, the standing network
  untouched by each, and a fight run afterwards. Four of them again in wasm, chosen for
  being the ones a fetch actually produces.
- `a_refused_checkpoint_does_not_grow_linear_memory` — added by the second review, in
  `tools/wasm_check.js` because `client/test/wasm-memory.test.mjs` belongs to another
  session. It reads `memory.buffer.byteLength` across the shipped file and four
  overclaiming headers and holds a `Float32Array` over `pose_ptr()` throughout. The
  page count is the assertion; the held view is what says why it matters.
- `the_learned_policy_is_unreachable_from_sim` — asks **Cargo** for the resolved graph
  from `fx`, `sim`, `policy` and `web` and asserts none of the first three reaches
  `learn-core`, `learn`, `lab` or `web`, then that `web` reaches `learn-core` and does
  **not** reach `learn`.

  **It walked the manifests as text until the second review, and three ordinary
  spellings went straight through it.** The parser matched byte-exact on ` = "../`, so
  `learn = {path="../learn"}`, `path = "../learn/"` and `learn.workspace = true`
  against a root `[workspace.dependencies]` each declared an edge `cargo metadata`
  resolved and the test did not see. All three were confirmed against `cargo metadata`
  and all three passed the old test. That matters out of proportion to the code,
  because this session's own conclusion is that **the compiler never enforced
  `web ↛ learn`** and moved the enforcement onto the manifests plus this test — so the
  test was the whole guarantee. The pairing with `browser.contains("learn-core")` does
  not mitigate it: that catches a manifest that stops parsing *wholesale*, and a single
  non-canonical line evades while it still passes. It is now `cargo tree --prefix
  depth --edges normal,build,dev --target all`, reached through the `CARGO` the harness
  sets. `cargo tree` and not `cargo metadata` because metadata is JSON and this crate
  has no parser for it and may not acquire one — the objection about a TOML library
  applies to a JSON one, but not to shelling out to cargo, which `check_deps.js`
  already does. Verified against all three bypasses and against the five spellings the
  text walk already caught, including `[dev-dependencies]`, `[target.'cfg(...)']` and a
  renamed `package = "learn"`.
- **`tools/check_deps.js` audited neither `crates/web` nor `crates/lab`**, and this
  session added a comment claiming it did. The BFS seeded only from a five-name
  `DETERMINISTIC` set, and neither `web` nor `lab` is in it or reachable from it, so
  `sha2 = "0.10.8"` added straight to `crates/web/Cargo.toml` compiled into `web.wasm`,
  shipped to a browser, and the audit printed "passed" — reproduced. Two further claims
  in the same comment were wrong: `learn-core` shipping to a browser is not "a stricter
  consequence than any the other four carry" (`fx`, `sim` and `policy` are all direct
  dependencies of `web` and all ship in `web.wasm`), and the `learn-core` membership is
  **inert** for the check it claimed to add, since removing it and re-running the same
  mutation still catches it transitively through `learn`. The walk now seeds from every
  package `cargo metadata --no-deps` reports, which is every workspace member and
  cannot be defeated by adding an eighth crate; the seven names remain as a *presence*
  assertion and nothing more. `every workspace member is audited and not only the core`
  in `tools/check_deps.test.js` is the fixture that would have caught it.
- **`node --test tools/check_deps.test.js` was red**, 13 pass and 2 fail, because this
  session edited `DETERMINISTIC` — the exact line the fixture covers — without running
  it. Green at 16, and `fixture()` now derives its workspace from one `MEMBERS` list so
  that adding an audited crate is a single edit.
- `the_learned_code_is_refused_by_name` — now both halves: refused with
  `ARENA_NO_CHECKPOINT` before a network is installed, taken after.
- `ArticulatedPolicyKind::Learned.build().is_none()` is **unchanged**, and
  `articulated_policy_codes_are_append_only_and_reserve_the_learned_one` still asserts
  it. The reason it stays is now written on the variant: `crates/policy` must not gain
  a float dependency, and more durably, a trained fighter is a kind plus fifteen
  kilobytes of weights that an integer registry has nowhere to put.
