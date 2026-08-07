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
crates/lab      headless experiment CLI
crates/web      the browser boundary: a hand-rolled wasm ABI, no wasm-bindgen
web/            the page: vanilla HTML, CSS and JS, classic script, no build step
tools/          sine table generator, dev server, the wasm/native equality check
docs/plans/     working plans, one file per landable session
```

Dependency direction is strictly `fx <- sim <- policy <- {lab, web}`. `sim` depends
on `fx` **and nothing else** — no engine, no window, no threads, no clock, no I/O.
If you find yourself wanting to add one, the answer is a new crate that reads
snapshots.

Sizes worth knowing before you go looking: `crates/sim/src/world.rs` (~7.2k lines),
`crates/web/src/lib.rs` (~7.4k) and `web/main.js` (~11k) are the three big files.
`web/main.js` is organised by banner comments (`// ---- the floor`, `// ---- draw`,
`// ---- hud`, …); grep for those to navigate rather than reading top to bottom.

## Commands

```bash
cargo test                                        # whole workspace, a couple of seconds
cargo test -p sim                                 # or -p fx / -p policy / -p web / -p lab

cargo run --release -p lab -- hash                # the canonical fingerprint
cargo run --release -p lab -- verify  --seeds 200 # run, re-run, replay -- all three must agree
cargo run --release -p lab -- bench   --seeds 2000
cargo run --release -p lab -- bench   --carved    # the floor plan the game actually ships
cargo run --release -p lab -- duel    --seeds 400
cargo run --release -p lab -- evolve  --gens 30 --pop 24 --seeds 8 --policy duelist

rustup target add wasm32-unknown-unknown          # once
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js                   # wasm must equal native

node tools/serve.js                               # builds the wasm, serves the page
node tools/serve.js --no-build --port 9000
```

Notes that will otherwise cost you a build:

- **`-p web`, never a bare workspace build, for the wasm target.** `lab` uses
  `std::thread::scope` and does not compile to `wasm32-unknown-unknown`.
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

Given the same `Scenario`, seed and sequence of submitted commands, `World` produces
byte-identical state on every target, in every profile, on every thread. Concretely:

- **No floating point reaches simulation state.** `Fx::to_f32` is a one-way door, for
  rendering and printing. A value that crosses back in voids the contract.
- **No transcendental functions.** `sin`/`cos` come from the committed table in
  `crates/fx/src/sin_table.rs`; `atan2` is a fixed-point polynomial.
- **Arithmetic saturates**, never wraps and never panics — one behaviour in all
  profiles. `[profile.release] overflow-checks = true` is the tripwire for code that
  forgets.
- **No RNG state in the world.** `Rng::from_stream(seed, tick, entity)` only. A draw
  depends on *what* is being decided, never on visitation order.
- **Fixed iteration order, index tie-breaks.** Ascending entity index, everywhere.
- **Deaths resolve after all attacks**, so simultaneous kills are symmetric.
- **No external dependencies, anywhere** — not in the crates, not in `web/`, not in
  `tools/`. A generator that "improves" in a point release invalidates every recorded
  run in the repository. `fx`, `sim` and `policy` are `#![forbid(unsafe_code)]`;
  `web` is `#![deny(...)]` only because `#[no_mangle]` trips the lint, and it still
  contains zero `unsafe {}` blocks.

Policies are explicitly *not* covered — a neural policy is allowed to be unportable,
which is why replays record actions rather than seeds.

## Golden hashes: decide before you edit, not after

Almost every change to `crates/sim` or `crates/policy` is gated by a pinned hash.
**State up front which ones you expect to move.** A moved hash is normally a bug
rather than a number to re-record, and the codebase's own comments treat "this hash
did not move" as the proof that a change was scoped correctly.

| Hash | Pinned in | Re-record with |
|---|---|---|
| `LAB_HASH` | `crates/web/src/lib.rs`, `tools/wasm_check.js` | **not re-pinnable** — see below |
| `GOLDEN_STATE_HASH` | `crates/sim/tests/determinism.rs` | `cargo test -p sim --test determinism -- --nocapture golden` |
| `ROOM_HASH`, `BATTLE_HASH`, `SWAP_HASH`, `BOW_HASH` | `crates/web/src/lib.rs` **and** `tools/wasm_check.js` | `cargo test -p web -- --ignored --nocapture print_the_golden_hashes` |

Each browser golden is pinned **twice**, so re-recording one is a two-file edit. That
pairing is deliberate: it is how you tell "the sim's behaviour changed" (both fail)
from "the two targets genuinely disagree" (only `wasm_check.js` fails, which is a
real portability bug — read the failure message, it walks you through the bisect).

`LAB_HASH` names its own scenario and policy, so `print_the_golden_hashes` omits it
on purpose. A change that moves it is a change to the simulation, and the answer is
to find the change, not to write down the new number.

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

## The frame ABI is a handshake across four files

The wasm boundary is a packed `f32` buffer that JavaScript reads out of linear
memory. Adding a column or a header float is **not** a one-line change:

1. `crates/web/src/lib.rs` — `HEADER_LEN`, `UNIT_STRIDE`, `write_frame`, and bump
   `FRAME_LAYOUT_VERSION`.
2. `web/main.js` — the mirrored `HEADER_LEN` / `UNIT_STRIDE` / `FRAME_LAYOUT_VERSION`
   constants and `readUnit`. The page compares its version against the module's at
   boot and refuses to draw a layout it does not understand.
3. `tools/wasm_check.js` — the same constants again, asserted.
4. The doc comment at the top of `crates/web/src/lib.rs` that draws the layout.

**Columns are append-only.** The client keys on positions, so a reshuffle repaints
the game while every test still passes. Same rule for `ActionKind::code` and for
`FEATURE_LAYOUT_VERSION` in `crates/sim/src/obs.rs`, which the policy feature vector
is frozen against.

A row's position is not an identity: `write_frame` skips dead units, so rows shift.
Anything keyed to a body must use the `entity_index` **and** `entity_generation`
columns — an index alone reads as a dead creature coming back to life when its slot
is reused.

## House style

This codebase has an unusually strong and unusually consistent voice. Match it.

- **Comments carry the argument, not the mechanics.** The interesting ones say why a
  thing is the shape it is, what was tried and rejected, and what would break if it
  changed. `crates/sim/src/rules.rs`, `crates/fx/src/fixed.rs` and the module headers
  are the models. A restatement of the code below it is noise.
- **A wrong comment is worse than no comment**, because it is what somebody reaches
  for first. If you move a column, a constant or a threshold, grep for every place
  that writes the number down in prose and fix those too.
- **Record the corrections.** Where a measurement contradicted an intuition, the
  repository says so in place — the README does it, DESIGN.md does it, `duelist.rs`
  does it. Do not quietly delete a wrong-but-instructive note; supersede it.
- **Numbers get their provenance.** A constant that came out of a sweep says which
  sweep, and ideally which test would catch it drifting.
- **Rust and JavaScript sources are ASCII.** `--` for a dash, never `—`. Markdown
  files use real em dashes and `&mdash;` appears in `index.html`. Do not mix the two
  conventions.
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
