# AGENTS.md

What to run, what not to break, and the traps that have already caught somebody.

Three documents, three jobs:

- **[`README.md`](README.md)** — what the game is and how to run it.
- **[`DESIGN.md`](DESIGN.md)** — *why* the rules are what they are. Read
  "The determinism contract" before your first edit to `crates/fx`, `crates/sim`
  or `crates/policy`.
- **This file** — the operational contract. It links to the durable documents
  rather than restating them; where the two disagree, the linked document wins.

## Layout

```
crates/fx       deterministic math: 16.16 fixed point, vectors, angles, PCG32
crates/sim      the game: world, tick, observations, actions, replay
crates/policy   agent policies + the run harness
crates/learn-core  frozen inference: compact features, a small MLP, the checkpoint codec
crates/learn    the learning probe: the population that trains one
crates/lab      headless experiment CLI
crates/web      the browser boundary: a hand-rolled wasm ABI, no wasm-bindgen
web/            the studio shell and its assets
client/         the TypeScript studio: hash router, v2 Worker protocol, arena
tools/          sine table generator, the wasm/native equality check, repository gates
docs/plans/     working plans, one file per landable session
```

Dependency direction is strictly `fx <- sim <- policy <- {learn-core, lab, web}`.
`sim` depends on `fx` **and nothing else** — no engine, no window, no threads, no
clock, no I/O. If you want one, the answer is a new crate that reads snapshots.

`learn-core` and `learn` are the two crates that may use floating point, and
`learn-core` is reachable from `web` while `learn` is not.
[Architecture: learning](docs/architecture/learning.md) owns that split, the
reason it is safe, and the tests that enforce it rather than promise it.

Sizes worth knowing before you go looking, measured 2026-08-18:
`crates/web/src/lib.rs` (15.5k lines) is the one big single file, and
`crates/sim/src/world/` is a module tree whose largest member is
`contact_phase.rs` (6.1k).

## Commands

**The gate. Run all of it before you land anything that touches `crates/` or
`docs/`.** There is no CI, no clippy config and no lint step, so an omission here
is an omission everywhere, and this list has been incomplete twice.

**It is still not everything, and pretending otherwise is how it stayed
incomplete.** `cargo test` runs no Node file, and six of the seven
`tools/*.test.js` fixtures are below rather than here — including
`check_docs.test.js`, which guards the docs gate and is the same construct as the
`check_deps.test.js` warned about three notes down. Run the ones your change
touches.

```bash
cargo test                                        # whole workspace
cargo test -p sim -p lab --features cartesian-recoil   # the exact-law build, ~7 min
cargo build --release                             # must report ZERO warnings

cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js                   # wasm must equal native
cargo build --release --target wasm32-unknown-unknown -p web --features cartesian-recoil
ARPG_CARTESIAN_RECOIL=1 node --test tools/wasm_check.js

cargo run --release -p lab -- embodied --corpus-digest   # exits 1 on a moved pin
cargo run --release -p lab -- verify --seeds 200      # run, re-run, replay agree

node --test "client/test/*.test.mjs"              # the four client suites, 235 tests
npm run check:abi                                 # generated TypeScript vs its generator
node tools/check_docs.js                          # documentation links, anchors, authority
node tools/check_deps.js                          # no crate may reach a registry or git source
node --test tools/check_deps.test.js              # and the fixture guarding that audit
```

Four notes on the gate itself, each of which has cost time:

- **`wasm_check.js` tests the artifact as it was built**, and only builds one if
  it is missing. After touching `crates/`, rebuild before believing a pass. It
  reads `ARPG_CARTESIAN_RECOIL`; unset checks only the default artifact, which is
  half the surface and hides both feature-only exact digests.
- **The client suites are part of the gate.** They were on no list here until
  2026-08-18; the verification pass that shipped the `CombatModel::Legacy`
  deletion omitted them, and they caught a real regression the moment they were
  run. The bare directory form `node --test client/test/` fails on this platform
  — quote the glob.
- **`tools/check_deps.js` has a fixture and `cargo test` does not run it.** The
  session that widened the audited set edited the exact constant
  `tools/check_deps.test.js` covers and left it red at 13 pass, 2 fail, because
  neither command was on any list here.
- **`cargo test -p web --features cartesian-recoil` is known red** on
  `exact_region_encoder_makes_only_a_pose_masks_severed_region_absent`, verified
  at `2b2c544` on a clean worktree. It is not on the gate because it does not
  pass; whoever fixes it puts it on.

Everything else, day to day:

```bash
cargo test -p sim                                 # or -p fx / -p policy / -p web / -p lab
cargo run --release -p lab -- verify --seeds 200          # run, re-run, replay
cargo run --release -p lab -- verify --slope --seeds 50   # over a floor that is not flat
cargo run --release -p lab -- embodied --seeds 400 --mirrored          # the gate corpus
cargo run --release -p lab -- embodied --seeds 400 --mirrored --slope  # sculpted fixture
cargo run --release -p lab -- embodied --high-ground      # the elevation measurement
cargo run --release -p lab -- learn-probe train --spec v2-probe
node tools/validate_assets.js web/assets3d/room_slice.glb # room asset vs pinned hashes
npm run trace                                     # one fight to web/fight.json
npm run view                                      # Vite without the wasm build
npm run dev                                       # release wasm + Vite serves the studio
npm run build                                     # dist/index.html + dist/web.wasm
```

**Development servers stay attached to the command that launched them.** Run
`npm run dev` and `npm run view` in the foreground; no `Start-Process`, no
detached helper so an invoking command can return. On Windows a child survives
its parent, and a detached Vite server has already outlived both the CLI and the
IDE here. Whoever starts a server owns its cleanup: stop it and verify the port
has no listener. Leave one running only when asked, and report its PID and port.

**Do not run `cargo fmt`.** The tree is deliberately not rustfmt-clean — about
**4,700 hunks across ~70 files** on 2026-08-18, most of them hand-formatted for
readability. Running it produces an enormous unrelated diff. Match the
surrounding style by hand. Re-measure rather than quote this, with
`cargo fmt --all -- --check | grep -c "^Diff in"`: the entry read "222
divergences across 25 files" until it was checked, and then drifted by eighteen
hunks in a day. A number in prose goes stale silently, which is the argument for
measuring one at the moment you need it.

**`-p web`, never a bare workspace build, for the wasm target.** `-p lab` fails
because `Checkpoint::read` and `write_atomically` are
`#[cfg(not(target_family = "wasm"))]`. This entry gave the reason as "`lab` uses
`std::thread::scope`, which does not compile to `wasm32-unknown-unknown`" until
2026-08-11, when it was measured and found false: both that and
`std::time::Instant` compile for the target and trap at *runtime*, which
`cargo build --target wasm32-unknown-unknown -p learn` demonstrates by finishing.
The rule would be right even if nothing failed: a trainer's threads and clock are runtime traps behind `pub extern "C"`,
and the browser boundary is the only crate that should be compiled for a browser.

**The native reference target is MSVC x86-64 on Windows.** Every pinned hash was
recorded there. The host is a 32-thread desktop: `crates/lab` already fans out to
`available_parallelism()` and `cargo` defaults `-j` to 32, so the saving left is
batching one invocation per feature set, not adding thread flags.

**A line-ending setting can corrupt an asset, and it reads as a corrupt asset.**
`core.autocrlf=true` rewrites `web/assets3d/room_slice.json`'s trailing newline
and the sidecar hash fails. `.gitattributes` pins both asset JSONs to LF. Check
`git config --get core.autocrlf` before believing an asset is damaged, then run
`node tools/validate_assets.js`, which is the gate that names it.

The browser contract — routes, the dev/production pair, the Worker, the trace
schema and its version history — is
[architecture: browser runtime](docs/architecture/browser-runtime.md).

## The one rule everything else serves

The authoritative contract is
[docs/reference/determinism.md](docs/reference/determinism.md#contract). Read it
before editing `fx`, `sim`, or deterministic policy code. In working terms: do
not let floating point, stateful RNG, unstable iteration, unchecked arithmetic,
or host-layer dependencies cross into authoritative state. Treat a tempting
shortcut as a contract change, not a local detail.

`fx`, `sim`, `policy`, `learn-core` and `learn` are `#![forbid(unsafe_code)]`;
`web` is `#![deny(...)]` only because `#[no_mangle]` trips the lint, and contains
zero `unsafe {}` blocks. One test binary is the sole exception and
[architecture: learning](docs/architecture/learning.md) explains why it earns it.

Policies are outside the portability promise; the boundary is
[ADR 0002](docs/decisions/0002-record-commands-in-replays.md).

## The frame ABI is a handshake across five files

A layout change must update Rust, the wasm equality check, the generated worker
ABI, its snapshot parser, and the reference **together**. Follow the canonical
[frame ABI change rules](docs/reference/frame-abi.md#compatibility-rules) — that
document owns the list and the count. **A partial mirror update is not green even
if one side still draws.**

Count from the reference, never from this heading: the number has been four, six
and five as mirrors were added and retired. The same handshake applies separately
to each publication beside the frame — pose, region, articulated-projectile,
combat-event and embodied-stance — which are not sections of the frame and do not
move `FRAME_LAYOUT_VERSION`.

## Golden hashes: decide before you edit, not after

Almost every change to `crates/sim` or `crates/policy` is gated by a pinned hash.
**State up front which ones you expect to move.** A moved hash is normally a bug,
not a number to re-record. The canonical
[golden registry](docs/reference/hashes.md#golden-registry) names every pin, its
owner, and its permitted re-record path. Browser goldens are paired between Rust
and the wasm check so a one-sided failure diagnoses target disagreement — **a
one-sided move is a portability failure, not a value to choose.**

Two pins are not like the others. `LEARNED_INFERENCE_DIGEST` pins *agreement
between two targets* rather than a fixture: a move that `ModelShape`, the feature
layout, the action layout or the forward pass does not explain is a portability
failure — and the four-item owner list its own registry row warns about is
short: `Checkpoint::from_bytes` is the fifth owner, because the digest is taken
over the checkpoint that was *installed* rather than an embedded one.

**Two pins watch an embodied fight, not one.** `EMBODIED_CORPUS_DIGEST` folds a
32-cell corpus and needs `crates/policy` to produce its commands, so
`cargo test -p lab` is what runs it. `EMBODIED_GOLDEN_DIGEST` is a single state
hash driven by a script written inside `crates/sim`'s own suite, so
`cargo test -p sim` runs it and the simulator stays checkable with the lab
absent. Both take two values, selected by `cartesian-recoil`.

### The trap that keeps catching plans

Predict a hash move from the concrete fixture, script, serializer and digest
grammar that feed it — **not from the subsystem being edited**. Sessions have
repeatedly changed a mechanism a named fixture did not reach, while an
append-only state tail moved artifacts that looked unrelated. Trace the bytes
first, state the prediction, and treat every unpredicted move as isolation
failure until the exact input path proves otherwise.

The worked example, because it is the cheapest one to re-learn: **any pin taken
over `World::state_digest` folds the core state hash, and there are five of
them.** A plan that predicted two of those five moving was wrong about three,
including a pin whose own registry row calls it a command probe. The registry
records which.

A second regression surface for `crates/policy` changes meant to be
behaviour-neutral: the win rates from
`cargo run --release -p lab -- embodied --seeds 400 --mirrored`.

## House style

This codebase has an unusually strong and consistent voice. Match it.

- **Comments carry the argument, not the mechanics.** Say why a thing is the
  shape it is, what was tried and rejected, and what would break if it changed.
  `crates/sim/src/rules.rs` and `crates/fx/src/fixed.rs` are the models. A
  restatement of the code below it is noise.
- **A wrong comment is worse than no comment.** If you move a column, a constant
  or a threshold, grep for every place prose writes it down. The same goes for a
  `path#Lnnn` link — inserting one import breaks every anchor below it, and
  `check_docs.js` is what catches that.
- **Record the corrections.** Where a measurement contradicted an intuition, say
  so in place. Supersede a wrong-but-instructive note; do not quietly delete it.
- **Numbers get their provenance** — which sweep, and ideally which test would
  catch the constant drifting **in both directions**. A test that bounds a
  constant from one side is satisfied by a range wider than the decision: a
  field-of-view assertion of the form `FOV / 2 > 46` passed for anything from
  93° to 179°, and it looked like coverage.
- **Show the test failing, or you have not written one.** The worst defect this
  repository produces is a green test asserting something the code does not do,
  and it is invisible by construction. Break the line the test is about and watch
  it go red before you believe it. The two shapes it takes are a test whose setup
  already satisfies its assertion, and a test that reads the reporter rather than
  the thing reported.
- **Rust and JavaScript sources are ASCII**: `--` for a dash, never `—`. Markdown
  uses real em dashes; `web/index.html` writes `&mdash;`. Do not mix them.
- **Tests are named as sentences** — `a_replay_reproduces_the_run_it_recorded`.
  Most live in `#[cfg(test)] mod tests` beside the code; cross-cutting ones in
  `crates/*/tests/`.

## Plans

Implementation plans live in `docs/plans/`, split into an overview plus one file
per **session** — a chunk that lands green on its own and leaves the game
playable. Name them `<topic>-NN-<slug>.md` so they sort.

Each session file must be directly implementable: real code blocks, exact paths
with line anchors, exact test names, and the commands that verify it. The
overview states the session order, the constants introduced, and **which golden
hashes must not move versus the ones expected to**.

Plans are updated in place as sessions complete, and the whole set is deleted in
the commit that finishes the topic. Durable results from a closed session belong
in an architecture, design, reference or performance document — not in a plan and
not in this file.

The live roadmap is [the embodied fight](docs/plans/fight-00-overview.md). The
visual work owed after the 2026-08-17 production pass is
[its own topic](docs/plans/concept-production-00-overview.md).

## Gotchas that have already cost time

Each of these is compressed to the rule; the linked record carries the evidence.

**An architecture rule enforced by scanning source text fails open, and this
repository has done it three times.** A dependency test matched `path = "../`
byte-exactly and let three ordinary manifest spellings past it; a bundle
assertion grepped a chunk that could not fail once the entry became a router; an
import guard spelled the worker with a literal dot while the file used a hyphen.
All three passed while broken. **Ask a tool for the graph** where one exists —
`cargo tree`, `cargo metadata --no-deps`, `tools/chunk-graph.mjs` — and where
none does, extract the thing being judged rather than the line it sits on. **A
guard that passes is not evidence until you have made it fail on purpose.**

**A request a control cannot honour must be refused by name.** Two consecutive
reviews found ten instances of one bug between them: a flag, a slider or an
export accepted an input it could not act on and said nothing. All of them were
*nearly* right, which is the failure mode that survives review. Refuse, name the
offending input in the refusal, and **return the refusal rather than printing and
exiting**, so a test can assert the sentence. Where the caller cannot be told —
`descend` answers a depth, and no depth means "no" — convert rather than refuse,
and write down which you chose.

**Rendering performance cannot be measured from an automated browser tab.** A
Claude-in-Chrome tab is always `visibilityState: "hidden"`, which is a stop and
not a throttle, and it rasterises in software. A longer sampling window is not
the fix. Anything needing the rAF loop is **blocked rather than skipped** —
record it as owed to a person at a visible browser.

**Benchmark numbers drift within a run**, so best-of-N across runs is not a
comparison. Bracket `control → subject → control` on identical input inside one
round and quote the median of the per-round differences with its range.

Both measurement methods, the evidence behind them, and the CPU-pinning advice
that went stale with the machine it was measured on are in
[performance evidence](docs/performance/README.md).

**`policy::script_digest` answers a constant for every embodied fight** — its
loop keeps only articulated commands, so it counts zero records and finishes at
`0x89b684347e2caedd` for every policy and every matchup. `lab embodied` folds its
own stream instead. The repair is still owed;
[architecture: policy](docs/architecture/policy.md) carries it.

**Ordered movement is not implemented for the surviving combat model.** `Order`
is per-faction, is hashed and replayed, and no surviving observation carries it,
so a standing order is an input no body can perceive.
[Reference: commands](docs/reference/commands.md#host-standing-inputs-and-the-fact-that-nothing-perceives-them)
records the three pieces of work restoring it would take.

## Before you call it done

1. **Run the gate above in full** — `cargo test`, the exact-law build, the
   zero-warning release build, both wasm artifacts through
   `node --test tools/wasm_check.js`, the corpus digest, the client suites,
   `npm run check:abi`, `node tools/check_docs.js` and `node tools/check_deps.js`.
   Not a subset chosen by what you think you touched: the two regressions that
   shipped were both "this cannot have reached that".
2. **Any hash moved?** Confirm it was one you predicted, re-record it in **every**
   copy — native, wasm mirror, and the registry row — and say in the commit
   message which moved and why.
3. **Touched a constant, column or threshold that prose writes down?** Grep for
   the number and fix every copy, `docs/` included. If it was a frame ABI column
   or one of its mirrors, the layout version and all five files move together.
4. **Changed behaviour a plan in `docs/plans/` describes?** Update the plan in
   place.
5. **Documentation impact:** if the change alters a contract, workflow,
   architecture, rationale, measured claim, frame ABI or one of its mirrors,
   update its canonical document in the same change.
