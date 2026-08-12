# AGENTS.md

Working notes for anyone — human or agent — changing code in this repository.

Three documents, three jobs, and they do not repeat each other:

- **`README.md`** — what the game is and how to run it.
- **`DESIGN.md`** — *why* the rules are what they are. Short document, load-bearing
  content. Read "The determinism contract" before your first edit to `crates/fx`,
  `crates/sim` or `crates/policy`.
- **This file** — what to run, what not to break, and the traps that have already
  caught somebody.

## Layout

```
crates/fx       deterministic math: 16.16 fixed point, vectors, angles, PCG32
crates/sim      the game: world, tick, observations, actions, replay
crates/policy   agent policies (utility, duelist) + the run harness
crates/learn-core  frozen inference: compact features, a small MLP, the checkpoint codec
crates/learn    the learning probe: the population that trains one
crates/lab      headless experiment CLI
crates/web      the browser boundary: a hand-rolled wasm ABI, no wasm-bindgen
web/            the studio shell and the legacy Canvas page
client/         the TypeScript studio: hash router, v2 Worker protocol, arena
tools/          sine table generator, dev server, the wasm/native equality check
docs/plans/     working plans, one file per landable session
```

Dependency direction is strictly `fx <- sim <- policy <- {learn-core, lab, web}`.
`sim` depends on `fx` **and nothing else** — no engine, no window, no threads, no
clock, no I/O. If you find yourself wanting to add one, the answer is a new crate
that reads snapshots.

`learn-core` and `learn` are the two crates that may use floating point, because
v2-19 says so and because nothing they compute reaches authoritative state: what
leaves them is an `ArticulatedCommandV1` assembled from a fixed table of `Fx`
constants, chosen by an argmax. Neither carries a crates.io dependency, and
neither does anything else: `tools/check_deps.js` walks **every** workspace member
and refuses any registry or git source. It used to seed that walk from a five-name
list, which left `web` and `lab` unaudited — a registry crate added straight to
`crates/web/Cargo.toml` compiled into `web.wasm` and the audit said "passed".

**The two are one crate split in two, and the direction of the arrow is the whole
point.** This file used to say `learn` must stay unreachable from `web`. v2-ui-08
amended that rule rather than broke it, and the amendment carries its reason:

> `learn-core` is reachable from `web`; `learn` is not. The floating point in
> `learn-core` is upstream of an argmax, and what crosses into `sim` is five head
> indices. No float reaches authoritative state, which is the property the
> original rule was protecting. `LEARNED_INFERENCE_DIGEST` is what keeps that
> honest across targets.

So `learn-core` compiles to `wasm32-unknown-unknown`, `crates/web` depends on it,
and a trained checkpoint drives a fighter in the browser. `learn` uses
`std::thread::scope` and a wall clock, and **`lab` is still its one host** — through
`lab learn-probe` and `lab trace --policy learned`. The standing instruction *if a
second host ever appears, check first that it is not `web`* is discharged for
`learn-core` by
[`v2-ui-08`](docs/plans/v2-ui/v2-ui-08-learned-in-the-browser.md), which made the
check and recorded the answer, and stands unchanged for `learn`.
`the_learned_policy_is_unreachable_from_sim` in
`crates/learn-core/tests/direction.rs` is what checks the arrow rather than
promising it — and **it is the whole of the enforcement**, since the bullet below
records that the compiler was never doing it. It asks `cargo tree` for the
resolved graph. It read the manifests as text until a review got three ordinary
spellings past it (`{path="../learn"}`, `path = "../learn/"`, and
`learn.workspace = true`), which is the shape of hazard a hand-rolled parser of
somebody else's format always has.

Sizes worth knowing before you go looking: `crates/web/src/lib.rs` (~14.6k lines),
`crates/sim/src/world.rs` (~13.6k) and `web/main.js` (~13.1k) are the three big files.
`web/main.js` is organised by banner comments (`// ---- the floor`, `// ---- draw`,
`// ---- hud`, …); grep for those to navigate rather than reading top to bottom.

## Commands

```bash
cargo test                                        # whole workspace, a couple of seconds
cargo test -p sim                                 # or -p fx / -p policy / -p web / -p lab
                                                  # or -p learn-core / -p learn

cargo run --release -p lab -- hash                # the canonical fingerprint
cargo run --release -p lab -- verify  --seeds 200 # run, re-run, replay -- all three must agree
cargo run --release -p lab -- bench   --seeds 2000
cargo run --release -p lab -- bench   --carved    # the floor plan the game actually ships
cargo run --release -p lab -- duel    --seeds 400
cargo run --release -p lab -- evolve  --gens 30 --pop 24 --seeds 8 --policy duelist

cargo run --release -p lab -- articulated --seeds 400 --mirrored  # the v2-17 gate corpus
cargo run --release -p lab -- articulated --seeds 400 --mirrored --policy windmill
cargo run --release -p lab -- articulated --seeds 400 --mirrored --attack-moves

cargo run --release -p lab -- learn-probe train --spec v2-probe
cargo run --release -p lab -- learn-probe evaluate --checkpoint checkpoints/v2-probe.ckpt

npm run trace                                     # one fight to web/fight.json
cargo run --release -p lab -- trace --policy learned \
    --checkpoint checkpoints/v2-probe.ckpt --seed 3   # and one learned fight
npm run view                                      # Vite without the wasm build
                                                  # then open /#/arena

rustup target add wasm32-unknown-unknown          # once
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js                   # wasm must equal native
node tools/check_docs.js                          # documentation links, anchors and authority

npm run dev                                       # builds release wasm, Vite serves the studio
node tools/serve.js                               # legacy Canvas page only
node tools/serve.js --no-build --port 9000        # legacy Canvas page only
```

The development and production contract is root-hosted `/` plus `/web.wasm`. The
studio shell `web/index.html` is the single `rollupOptions.input` and everything a
reader can reach is a hash route beneath it: `#/game` is the v2 worker diagnostic,
`#/arena` watches a fight. Its TypeScript module graph must run through Vite;
`tools/serve.js` has no bundler and cannot serve it, which is why that server answers
`/` with the legacy page instead. `npm run build` emits the production pair as
`dist/index.html` and `dist/web.wasm`. Deep links are queries on a route rather than
on a page — `/#/game?stress=greybox&renderer=canvas`,
`/#/arena?trace=/fight-learned.json` — and every parameter each one accepts is the
one it accepted before.

`web/legacy.html` is the playable Canvas game, moved from `index.html` byte for byte.
Four classic scripts sharing top-level `const`s are not a module graph, so it is not a
route, stays out of `rollupOptions.input` and ships in nothing; `tools/serve.js` and
the Vite dev server both hand it straight out of `web/`.

`#/arena` reads no wasm and no worker — it plays the JSON `lab trace` writes, which is
why `npm run view` is enough for it. This file used to promise that the page it grew
out of, the development-only `/fight.html` that v2-17 needed when its gate failed and
its last three explanations were refuted by measurement, would be deleted by the
session that lands the real pose channel. v2-ui-01 paid half of that early: the page
is gone. The channel is still owed, in v2-ui-07 — until it lands, a fight in the
browser is a file somebody recorded, not a simulation running.

The trace is a two-file contract — `crates/lab/src/trace.rs` writes it and
`client/src/fight/trace.ts` refuses a schema it does not know, on purpose. Change
one and you change both, and bump `TRACE_SCHEMA` in both. It is at
`arpg-fight-trace-3`; v2-19 moved it from 2 by replacing the single `script` field
with `heroes`, `monsters` and `checkpoint`, because a learned fight is the first
one whose two bodies are driven by different things.

Notes that will otherwise cost you a build:

- **`-p web`, never a bare workspace build, for the wasm target.** This line used to
  give the reason as "`lab` uses `std::thread::scope` and does not compile to
  `wasm32-unknown-unknown`", and **the reason was measured on 2026-08-11 and is
  false**: `std::thread::scope` and `std::time::Instant` both compile for that
  target and trap at *runtime*, which
  `cargo build --target wasm32-unknown-unknown -p learn` shows by finishing —
  `learn` is the crate that uses both. `-p lab` is the one that fails, and not for
  that reason either: `Checkpoint::read` and `write_atomically` are
  `#[cfg(not(target_family = "wasm"))]` and `lab`'s three call sites of them are
  the whole of the failure, which is also why a bare workspace build fails. It
  would be right to keep the instruction even if nothing failed at all. The rule is
  about what belongs in the artifact: a trainer's threads and clock are runtime
  traps behind `pub extern "C"`, and the browser boundary is the only crate that
  should be compiled for a browser.
- **`wasm_check.js` tests the artifact as it was built** and only builds it if it is
  missing. After touching `crates/`, rebuild before believing a pass.
- **The native reference target is MSVC x86-64 on Windows.** Every pinned hash in the
  repository was recorded there.
- **Do not run `cargo fmt`.** The tree is deliberately not rustfmt-clean — 222
  divergences across 25 files, most of them hand-formatted for readability. Running it
  produces an enormous unrelated diff. Match the surrounding style by hand.
- There is no clippy config, no CI, and no lint gate. `cargo test` and
  `node --test tools/wasm_check.js` are the gate.

## The one rule everything else serves

The authoritative contract is [docs/reference/determinism.md](docs/reference/determinism.md#contract).
Read it before editing `fx`, `sim`, or deterministic policy code. In working terms:
do not let floating point, stateful RNG, unstable iteration, unchecked arithmetic,
or host-layer dependencies cross into authoritative state. Treat a tempting shortcut
as a contract change, not a local implementation detail.

`fx`, `sim`, `policy`, `learn-core` and `learn` are `#![forbid(unsafe_code)]`; `web` is
`#![deny(...)]` only because `#[no_mangle]` trips the lint, and it still contains
zero `unsafe {}` blocks.

`learn-core` is the one crate on that list that ships inside `web.wasm` while using
floating point, which is why `LEARNED_INFERENCE_DIGEST` exists and why the registry
row records the `-C target-cpu=native` hole in it.

**One test binary is the exception, and it is the only one in the repository.**
`crates/learn/tests/allocation.rs` installs a counting `#[global_allocator]`, which
`std` requires to be an `unsafe impl`, because that is the only way to make
`frozen_inference_allocates_nothing_after_warmup` an actual measurement rather than
an assertion about the source. It ships in nothing, every `unsafe fn` body writes
its own block under `#![deny(unsafe_op_in_unsafe_fn)]`, and the library it tests —
`learn-core`, since v2-ui-08 split it out — is still `forbid`. That split made the
claim sharper rather than moving it: the code it counts now ships inside `web.wasm`,
where an allocation on the decision path grows linear memory and detaches every
typed array the page holds. If a future session decides the exception is not worth it, delete
the file and the claim together — keeping the claim without the counter is the one
outcome that would be worse than either.

Policies are outside the portability promise; the replay rationale and current
boundary are in [ADR 0002](docs/decisions/0002-record-commands-in-replays.md).

## Golden hashes: decide before you edit, not after

Almost every change to `crates/sim` or `crates/policy` is gated by a pinned hash.
**State up front which ones you expect to move.** A moved hash is normally a bug,
not a number to re-record. The canonical [golden registry](docs/reference/hashes.md#golden-registry)
names every pin, owner, and permitted re-record path. Browser goldens remain paired
between Rust and the wasm check so a one-sided failure diagnoses target disagreement.

**One pin is not like the others and reading it as one would waste a day.**
`LEARNED_INFERENCE_DIGEST` pins *agreement between two targets* rather than a
fixture or a contract: it is owned by whoever changes `ModelShape`, the feature
layout, the action layout or the forward pass, and a move that none of those four
explains is a **portability failure and not a number to re-record**. Its registry
row names the fallback, and the fallback changes behaviour and owes a re-score.

### The trap that keeps catching plans

Two structural facts keep most changes inert, and they are about **the lab only**:

- `Objective` defaults to `Objective::None`, so no lab scenario builds a nav field.
- No lab scenario issues an `Order::Goto` — the runner orders `Advance`.

They do **not** transfer to the browser goldens. `ROOM_HASH`'s script is
`init(1); set_goto(...); step(600)` — it is the only golden that issues an order, so
it is the only one that reaches `ordered_feet`, and **any change to what an
`Order::Goto` does moves it.** An argument of the form "no golden reaches this code"
is right about `LAB_HASH` and wrong about `ROOM_HASH`. This has caught at least two
separate changes; `lib.rs`'s doc comment on `ROOM_HASH` records the earlier one.

A second, independent regression surface for `crates/policy` changes meant to be
behaviour-neutral: `cargo run --release -p lab -- duel --seeds 400` win rates.

## The frame ABI is a handshake across six files

The wasm frame is a mirrored contract, so a layout change must update Rust, the
legacy page, the wasm equality check, the generated worker ABI and its snapshot
parser, and the reference together. Follow the canonical
[frame ABI change rules](docs/reference/frame-abi.md#compatibility-rules) for exact
fields, versions, identity, and append-only constraints — that document owns the
list and is the one to count from. A partial mirror update is not green even if one
side still draws.

**This heading said "four files" until v2-ui-06 and the number predated the v2
client split**: `crates/web/src/lib.rs`, `web/main.js` and `tools/wasm_check.js`
were the whole of it before `crates/web/src/bin/emit_abi.rs` began generating
`client/src/protocol/abi.generated.ts` for `client/src/state/snapshot.ts` to read.
The same handshake applies separately to each of the ABIs beside the frame — the
pose, region and combat-event publications in
[`articulated-abi.md`](docs/reference/articulated-abi.md) — which are not sections
of the frame and do not move `FRAME_LAYOUT_VERSION`.

## House style

This codebase has an unusually strong and unusually consistent voice. Match it.

- **Comments carry the argument, not the mechanics.** The interesting ones say why a
  thing is the shape it is, what was tried and rejected, and what would break if it
  changed. `crates/sim/src/rules.rs`, `crates/fx/src/fixed.rs` and the module headers
  are the models. A restatement of the code below it is noise.
- **A wrong comment is worse than no comment**, because it is what somebody reaches
  for first. If you move a column, a constant or a threshold, grep for every place
  that writes the number down in prose and fix those too. The same is true of a
  `path#Lnnn` link, and inserting one import at the top of a file breaks every one
  below it: `check_docs.js` checks that such an anchor still lands on the symbol,
  the registry pin, or the declaration it claims, so run it after moving code and
  not only after writing prose.
- **Record the corrections.** Where a measurement contradicted an intuition, the
  repository says so in place — the README does it, DESIGN.md does it, `duelist.rs`
  does it. Do not quietly delete a wrong-but-instructive note; supersede it.
- **Numbers get their provenance.** A constant that came out of a sweep says which
  sweep, and ideally which test would catch it drifting.
- **Rust and JavaScript sources are ASCII.** `--` for a dash, never `—`. Markdown
  files use real em dashes, and both hand-written pages — `web/index.html` and
  `web/legacy.html` — write `&mdash;`. Do not mix the two conventions.
- **Tests are named as sentences** — `no_blade_can_outrun_the_smallest_body`,
  `a_replay_reproduces_the_run_it_recorded`, `results_do_not_depend_on_the_thread_that_computed_them`.
  Most live in `#[cfg(test)] mod tests` next to the code; cross-cutting ones live in
  `crates/*/tests/`.
- **`web/main.js` is a classic script**, not a module: every top-level `function` is
  a reassignable global. That is load-bearing for the profiling method below.

## Plans

Implementation plans live in `docs/plans/` in the repo, not in a scratch file. Split
across as many files as they need: an overview plus one file per **session**, where a
session is a chunk that lands green on its own and leaves the game playable. Name
them `<topic>-NN-<slug>.md` so they sort (`iso-00-overview.md`, `art-03-events.md`).

Each session file must be directly implementable: real code blocks, exact file paths
with line anchors, exact test names, and the commands that verify it. The overview
states the session dependency order, the constants introduced, and — for this
repository especially — **which golden hashes must not move versus the one that is
expected to.**

Plans are updated in place as sessions complete, and the whole set is deleted in the
commit that finishes the topic (see `iso-*` in the history of `docs/plans`).

The live set is `v2-*`. **Start at [`docs/plans/v2-00-overview.md`](docs/plans/v2-00-overview.md)** —
its dated progress note says which session is in flight and which are done, so you do
not have to infer the state of the tree from the code or the log.

## Gotchas that have already cost time

**Rendering performance cannot be measured from an automated browser tab.** A
Claude-in-Chrome tab is always `visibilityState: "hidden"`, which throttles
`requestAnimationFrame` and rasterises in software — it can time pure JS honestly and
can measure nothing the rasteriser or compositor does. In Aug 2026 this produced four
confident wrong hypotheses in a row. Hand the user a console probe and read their
numbers. When you do:

- **Remove work, do not hide it.** `visibility: hidden` still rasterises every fill.
  No-op the primitive (`ctx.fill = () => {}`) or stop the rAF loop outright.
- **End every run with the baseline repeated as a control.**
- **Compare paired frames, not paired runs** — wrap `render` to draw each frame twice,
  once as shipped and once with the feature's inputs emptied, and difference them on
  the identical scene. The scene moves too much for run-versus-run to survive.
- A large `idle` beside a small `render` on the frame strip means the cost landed past
  the callback, in the rasteriser. That is the signal to switch to this method.

**`lab bench` numbers swing 2–3× run to run** on a hybrid-core laptop, because a
single-threaded bench gets migrated onto an E-core. Pin to logical CPU 0 at high
priority and take best-of-3, or a real regression is indistinguishable from noise.

**Overdraw is counted in pixels, not milliseconds.** Canvas2D commands are queued, so
a microbenchmark that loops a draw call times the rasteriser's back-pressure. The
worst bug the page has had — one translucent sight disc per body, 13.4× the screen in
alpha blending — was found by summing fill areas. See "Performance notes" in
DESIGN.md.

**`Order` is per-faction, not per-unit.** That is exactly right for one hero and
obviously wrong for a party, and it is why the page refuses to put a second character
in the room. The waypoint queue lives in `crates/web`, not in `sim`, for the same
reason: one standing order per faction is a contract.

## Before you call it done

1. `cargo test` — green.
2. Touched `crates/`? Rebuild the wasm, then `node --test tools/wasm_check.js`.
3. Any hash moved? Confirm it was one you predicted, re-record it in **both** places,
   and say in the commit message which ones moved and why.
4. Touched a constant, a column or a threshold that prose writes down? Grep for the
   number and fix every copy.
5. Changed behaviour a plan in `docs/plans/` describes? Update the plan in place.
6. Documentation impact: if the change alters a contract, workflow, architecture,
   rationale, measured claim, frame ABI, or one of its mirrors, update its canonical
   document in the same change. Run `node tools/check_docs.js` even when no code hash
   moved.
