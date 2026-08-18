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
web/            the studio shell and its assets
client/         the TypeScript studio: hash router, v2 Worker protocol, arena
tools/          sine table generator, the wasm/native equality check, repository gates
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
`learn-core` by v2-ui-08, which made the check and recorded the answer in the
[`LEARNED_INFERENCE_DIGEST` row](docs/reference/hashes.md#golden-registry), and
stands unchanged for `learn`.
`the_learned_policy_is_unreachable_from_sim` in
`crates/learn-core/tests/direction.rs` is what checks the arrow rather than
promising it — and **it is the whole of the enforcement**, since the bullet below
records that the compiler was never doing it. It asks `cargo tree` for the
resolved graph. It read the manifests as text until a review got three ordinary
spellings past it (`{path="../learn"}`, `path = "../learn/"`, and
`learn.workspace = true`), which is the shape of hazard a hand-rolled parser of
somebody else's format always has.

Sizes worth knowing before you go looking: `crates/web/src/lib.rs` (~16.1k lines) is
now the one big single file. `crates/sim/src/world/` is a module tree rather than one
file — each sibling of `mod.rs` is named for the tick phase group it owns, and the
largest of them is `contact_phase.rs` (~5.9k). `web/main.js` was the other big one at
~13.1k until the Canvas page was retired; if a comment still points at it, that
comment is stale.

## Commands

```bash
cargo test                                        # whole workspace, a couple of seconds
cargo test -p sim                                 # or -p fx / -p policy / -p web / -p lab
                                                  # or -p learn-core / -p learn

cargo run --release -p lab -- verify --seeds 200          # run, re-run, replay -- all three must agree
cargo run --release -p lab -- verify --slope --seeds 50  # and over a floor that is not flat

cargo run --release -p lab -- embodied --seeds 400 --mirrored          # the gate corpus
cargo run --release -p lab -- embodied --seeds 400 --mirrored --slope  # on the sculpted fixture
cargo run --release -p lab -- embodied --corpus-digest   # EMBODIED_CORPUS_DIGEST, exits 1 on a move
cargo run --release -p lab -- embodied --high-ground     # the elevation measurement

# Feature-only exact mechanics use the same lab commands and harness:
cargo run --release -p lab --features cartesian-recoil -- tactical-mechanics --quick

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
node tools/check_deps.js                          # no crate may reach a registry or a git source
node --test tools/check_deps.test.js              # and the fixture that guards that audit
node tools/validate_assets.js web/assets3d/room_slice.glb   # the room asset against its pinned hashes

npm run dev                                       # builds release wasm, Vite serves the studio
```

**Development servers stay attached to the command that launched them.** Run
`npm run dev` and `npm run view` in the foreground; do not
use `Start-Process`, `start`, a detached process, or a background helper merely so
the invoking command can return. On Windows a child survives its parent unless a
launcher deliberately supplies stronger lifetime management, and a detached Vite
server has already outlived both Codex CLI and the IDE here. An agent that starts a
server owns its cleanup: stop it before finishing the task and verify that its port
no longer has a listener. Leave one running only when the user explicitly asks for
a persistent server, and report its PID and port.

The development and production contract is root-hosted `/` plus `/web.wasm`. The
studio shell `web/index.html` is the single `rollupOptions.input` and everything a
reader can reach is a hash route beneath it: `#/game` is the v2 worker diagnostic,
`#/arena` watches a fight. Its TypeScript module graph must run through Vite;
Vite is the only development server there is, since the dependency-free
`tools/serve.js` was written for the Canvas page and was retired with it.
`npm run build` emits the production pair as
`dist/index.html` and `dist/web.wasm`. Deep links are queries on a route rather than
on a page — `/#/game?stress=greybox&renderer=canvas`,
`/#/arena?trace=/fight-learned.json` — and every parameter each one accepts is the
one it accepted before.

**The Canvas game is gone.** `web/legacy.html` and its four classic scripts were
retired in the embodied-combat work: ~16.2k lines that no build included and no test
executed, whose only live cost was a standing obligation to mirror every ABI change
into a file that shipped nowhere. Comments and documents citing `web/main.js`,
`web/draw.js`, `web/rig.js` or `web/assets.js` as a source of truth are stale by
definition; several presentation constants in `client/src/render/` were derived from
it and say so in the past tense.

`#/arena` runs its own fight. It writes a configuration, a Worker of its own records
the duel in wasm, and the transferred pose, region, projectile and combat-event
buffers are what
the page scrubs; a recorded `lab trace` file still plays through the same seam when
one is named by `?trace=`. `npm run view` — Vite with no wasm build — is enough to
*open* the route, because the Worker is constructed lazily on the first **[Fight]**,
and is not enough to press it. This file used to promise that the page it grew out
of, the development-only `/fight.html` that v2-17 needed when its gate failed and its
last three explanations were refuted by measurement, would be deleted by the session
that lands the real pose channel. Both halves are paid: v2-ui-01 deleted the page and
v2-ui-07 landed the channel.

The trace is a two-file contract — `crates/lab/src/trace.rs` writes it and
`client/src/fight/trace.ts` refuses a schema it does not know, on purpose. Change
one and you change both, and bump `TRACE_SCHEMA` in both. It is at
`arpg-fight-trace-6`; v2-19 moved it from 2 by replacing the single `script` field
with `heroes`, `monsters` and `checkpoint`, because a learned fight is the first
one whose two bodies are driven by different things. The articulated-arrow session
moved it from 3 by adding each frame's live projectile rows.

It moved from 4 because a column changed meaning rather than because one was added,
which is the case its own doc comment reserves the bump for. `channels()` splits a
share four ways and both the trace row and the combat-event ABI carry three channel
words; `crates/web/src/lib.rs` summed `crush_raw + pressure_raw` into its pressure
word and said why, while `trace.rs` wrote `pressure_raw` alone under a comment
describing a three-way `channels()` that had already become four. The two agree now.
**The bug was invisible for the reason worth remembering: `crush_raw` is zero in
every default-law fixture**, so `cut + thrust + pressure == share` held everywhere
anybody looked. It fails on seed 3 of the shipped duel, where frame 460's first
contact splits 194 into crush 36 and pressure 157 and the recorded columns sum to
158 -- and `a_live_fight_matches_the_traced_fight` could not report it, because
`web/fight.json` is gitignored and every stale copy stopped at the schema guard
first. A gate that refuses the file before comparing it is not a passing gate.

It moved from 5 for the same *kind* of reason and not the same reason. `pose.regions`
went from five rows to seven when a jointed arm became two swept capsules, and until
it did, row `i` was named by `regionNames[i]`. It no longer is: the array is the
swept-volume list, `regionNames` is anatomy, and they agree on their first five
entries and nowhere after. A schema-5 file read by the current page would draw each
arm as one capsule and fail the live-versus-traced comparison inside a pose diff —
the confusing half of the failure the guard exists to make plain, which is the same
lesson the paragraph above records from the other end.

`trace` also takes fourteen keys that *describe* a duel instead of running the pinned
one — the two anatomies, the four hands, and the shield and weapon dimensions.
**Give none of them and the fixture runs byte for byte**, which is what makes a traced
run comparable with the gate that measured it; give any one and the scenario becomes
`configured-duel-v1` under its own fingerprint and the file stops being comparable.
The switch is the key list itself and not a builder that always runs, because
`DuelConfigV1::shipped()` reproduces the fixture's table and unit rows exactly — an
always-builder would have moved nothing but the scenario name, which is drift with a
single visible symptom in a header nobody reads twice. `lab`'s own `trace` help text
carries the rest, including the two ways of asking for nothing that exit 2.

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
- **`tools/check_deps.js` has a fixture and `cargo test` does not run it.** The session
  that added `learn-core` to the audited set edited the exact constant
  `tools/check_deps.test.js` covers, left it red at 13 pass and 2 fail, and did not find
  out until a review — because neither command was on any list in this file. Both are
  above now. Run them when you touch a manifest or the audited set.
- **A line-ending setting can corrupt an asset, and it reads as a corrupt asset.** On
  a second machine `#/game` stopped with `representative room asset failed during
  sidecar hash`. Nothing was wrong with the asset: that machine had
  `core.autocrlf=true`, `web/assets3d/room_slice.json` is ordinary JSON, and git
  rewrote its one trailing newline on checkout — 5,384 bytes to 5,385, and
  `b15c44c4…` to `a693f0d9…`. The GLB beside it was fine, because a NUL at offset 5
  makes git treat it as binary, so the failure lands on the *text* member of a set
  whose other members verify. `.gitattributes` now pins both asset JSONs to LF and
  says why. **Check `git config --get core.autocrlf` before believing an asset is
  damaged**, and run `validate_assets.js` above, which is the gate that names it.
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

Predict a hash move from the concrete fixture, script, command/state serializer, and
digest grammar that feed that hash -- not merely from the subsystem being edited.
Several combat sessions changed a mechanism that a named fixture did not reach, while
an append-only state tail moved research artifacts that appeared unrelated. Trace the
bytes first, state the prediction, and treat every unpredicted move as isolation
failure until the exact input path proves otherwise.

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

**The embodied model has exactly one pin and it is cheap on purpose.**
`EMBODIED_CORPUS_DIGEST` folds the state digests of eight seeds of both embodied
fixtures, both orientations, 600 ticks each, and `cargo test -p lab` runs it. It exists
because `bench`, `hash`, `duel` and `evolve` were Legacy-only and `articulated` drove
a model that has since been deleted — so it is what the session retiring those
measurements checked itself against. `verify` was on that list and was **converted
rather than cut**: run/re-run/replay agreement is a property of the codec, not of the
model it happened to be written against. Its
[registry row](docs/reference/hashes.md#golden-registry) says which moves it may
re-record and which it may not, and the argument that no *other* pin can see an
embodied fight is the same `Dungeon::digest` short circuit that made adding elevation
free: a flat dungeon never hashes a height.

## The frame ABI is a handshake across five files

The wasm frame is a mirrored contract, so a layout change must update Rust, the wasm
equality check, the generated worker ABI and its snapshot parser, and the reference
together. Follow the canonical
[frame ABI change rules](docs/reference/frame-abi.md#compatibility-rules) for exact
fields, versions, identity, and append-only constraints — that document owns the
list and is the one to count from. A partial mirror update is not green even if one
side still draws.

**This heading has now been "four", "six" and "five", and the drift is the lesson.**
`crates/web/src/lib.rs`, `web/main.js` and `tools/wasm_check.js` were the whole of it
until `crates/web/src/bin/emit_abi.rs` began generating
`client/src/protocol/abi.generated.ts` for `client/src/state/snapshot.ts` to read,
which made it six; retiring the Canvas page took `web/main.js` back out and made it
five. Count from the reference rather than from this heading — a number in prose goes
stale the moment a mirror is added or removed, and this one has twice.

The same handshake applies separately to each of the ABIs beside the frame — the
pose, region, articulated-projectile, combat-event and embodied-stance publications
in [`articulated-abi.md`](docs/reference/articulated-abi.md) — which are not sections
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
  sweep, and ideally which test would catch it drifting — **in both directions**. A
  test that bounds a constant from one side only is satisfied by a range wider than the
  decision and cannot defend it. v2-ui shipped two of those in one session: a
  field-of-view assertion of the form `FOV / 2 > 46` passed for anything from 93° to
  179°, and a camera-mount test was satisfied by every mount from 25° to 60° because
  nothing in it measured the thing that bounds the mount from above. Both looked like
  coverage.
- **Show the test failing, or you have not written one.** The worst defect this
  repository produces is a green test asserting something the code does not do, and it
  is invisible by construction: nothing goes red. Two shapes it takes, both found by
  review rather than by running anything. A test whose setup already satisfies its
  assertion — a memoisation check that awaits load #1 before starting #2 is satisfied
  by an ordinary early return, so `??=` can be replaced by `=` with both named tests
  still green. And a test that reads the reporter rather than the thing reported — a
  count that short-circuits to zero when a mode is off cannot detect the leak it exists
  for, and a library may already be doing what you are asserting your own call does
  (`AbstractMesh.dispose()` splices the mesh out of every shadow render list, so
  deleting the paired `removeShadowCaster` leaves everything green). Before believing a
  test, break the line it is about and watch it fail.
- **Rust and JavaScript sources are ASCII.** `--` for a dash, never `—`. Markdown
  files use real em dashes, and the hand-written page `web/index.html` writes
  `&mdash;`. Do not mix the two conventions.
- **Tests are named as sentences** — `no_blade_can_outrun_the_smallest_body`,
  `a_replay_reproduces_the_run_it_recorded`, `results_do_not_depend_on_the_thread_that_computed_them`.
  Most live in `#[cfg(test)] mod tests` next to the code; cross-cutting ones live in
  `crates/*/tests/`.

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

The live roadmap is [`docs/plans/v2-00-overview.md`](docs/plans/v2-00-overview.md).
Completed sessions are retired rather than kept as a progress ledger. The
articulated-bow and representative Fighter/Brute rig slices are complete; their
durable contracts now live in the command, projectile, ABI, contact, asset and
browser references. The exact-law target-parity closeout is complete too. The apparent
native 164 / wasm 278 split was a fixture mismatch: JavaScript staged round legal
weapon words while the first native comparison used `DuelConfigV1::shipped()`'s
different dimensions. A permanent exact native test now asserts all four staged hand
rows before driving the fights; identical configurations stop at 278 for
Composed/Windmill and 300 for Learned/Windmill on both targets. No registered hash
moved for that correction, and it creates neither `ARTICULATED_HASH` nor authority to
promote the exact law. Durable results from closed sessions belong in architecture,
design, reference, or performance docs.

## Gotchas that have already cost time

**Rendering performance cannot be measured from an automated browser tab.** A
Claude-in-Chrome tab is always `visibilityState: "hidden"`. This line used to say that
*throttles* `requestAnimationFrame`, and measured on 2026-08-11 it is worse than
throttling: it is a stop. A probe waiting on seven consecutive
`requestAnimationFrame` callbacks never resolved in forty-five seconds, and `#/arena`
playback sat on its starting tick throughout. So a longer sampling window is not the
fix, and a frame time that depends on the loop is **blocked rather than skipped** —
record it as owed to a person at a visible browser instead of estimating it. The tab
also rasterises in software, so it can time pure JS honestly and can measure nothing
the rasteriser or the compositor does. In Aug 2026 this produced four confident wrong
hypotheses in a row. Hand the user a console probe and read their numbers. When you
do:

- **Remove work, do not hide it.** `visibility: hidden` still rasterises every fill.
  No-op the primitive (`ctx.fill = () => {}`) or stop the rAF loop outright.
- **End every run with the baseline repeated as a control.**
- **Compare paired frames, not paired runs** — wrap `render` to draw each frame twice,
  once as shipped and once with the feature's inputs emptied, and difference them on
  the identical scene. The scene moves too much for run-versus-run to survive.
- A large `idle` beside a small `render` on the frame strip means the cost landed past
  the callback, in the rasteriser. That is the signal to switch to this method.

Only the things that need the loop are unreachable, which is worth knowing before you
give up on a page. `#/arena` scrubs synchronously out of its input handler, so every
panel, label, contact marker and control on it was checked from an automated tab; the
frame time is the one thing that was not. What is still owed to a person, and why, is
[the arena matrix](docs/performance/v2-arena-matrix.md).

**`lab bench` numbers swing 2–3× run to run** on a hybrid-core laptop, because a
single-threaded bench gets migrated onto an E-core. Pin to logical CPU 0 at high
priority, or a real regression is indistinguishable from noise.

**Pinning stops the migration. It does not stop the machine warming, and best-of-N
across two runs is not a comparison.** An unpinned process reads up to 15% *faster*
than a pinned one on a good run and about 1.8× *slower* on a migrated one, and the
migration moves every cell in that process at once — so the best of nine readings
inside a migrated process is still a migrated reading, and best-of-N cannot tell you
which kind of process you had. One review re-measured a control at 18,000–26,000
ticks/s and called it a refutation; it was reading exactly such a process, where every
control cell read high while every contact cell in the same run fell by a third.
Drift inside a run does the rest: driving one fight nine times in each of three pinned
processes, the control went from about 300 ms in rounds 1 and 2 to 370–500 ms from
round 3 onward, so a difference of two cells' *bests* takes one number from before the
drift and one from after and calls the gap a cost. **Bracket instead** — inside one
round drive `control → subject → control` on the identical input, and quote the median
of the per-round differences with its range. The two statistics disagreed by up to two
points on that data, and it is the unpaired one that cannot be defended, because its
two inputs sit on opposite sides of the drift. Then **quote the range across several
pinned processes rather than the best of them, and name the pass**: one quantity on
this machine has four published readings that fall into two clusters about 20% apart,
and any single best quoted from them would have hidden that. The worked example is
[what recording costs](docs/reference/articulated-abi.md#what-recording-costs).

**An architecture rule enforced by scanning source text fails open, and this
repository has done it three times.** A dependency test matched `path = "../`
byte-exactly and let three ordinary manifest spellings past it, while being the whole
of the enforcement that `web` must not reach `learn`; a bundle assertion read one
`<script src>` and
grepped that chunk, so from the day `studio.ts` became a router with no static imports
it was inspecting 3.5 KB that could not fail; and an import guard spelled the worker
`sim\.worker`, with a literal dot, while the module it existed to catch was named
`sim-worker.ts`. All three passed while broken. A passing text scan is evidence about
the text and not about the graph, so ask a tool for the graph where one exists —
`cargo tree` in `crates/learn-core/tests/direction.rs`, `cargo metadata --no-deps` in
`tools/check_deps.js`, the static-import closure walk in `tools/chunk-graph.mjs` — and
where none does, extract the thing being judged rather than the line it sits on.
**A guard that passes is not evidence until you have made it fail on purpose**, which
is how each of those three repairs was accepted.

**A request a control cannot honour must be refused by name.** Two consecutive
sessions' reviews found ten instances of one bug between them, and it was the same bug
every time: a flag, a slider or an export accepted an input it could not act on and
said nothing. `lab trace --a-weapon-length --seed 3` ran the *pinned fixture* and
printed the pin's own fingerprint under a header the operator read as their
configuration, because `Args::parse` demotes a valueless `--key` to a bare flag.
`--b-shield-half-width` aimed at a fighter carrying a club renamed the scenario and
changed nothing else. `set_goto` ten ticks into a configured duel produced a different
fight under an unmoved `arena_fingerprint`. None of them errored and all of them were
*nearly* right, which is the failure mode that survives review. Refuse, name the
offending input in the refusal, and **return the refusal rather than printing and
exiting** so a test can assert the sentence — a refusal path no test can name is how
the pair in `duel_config_from` shipped green.

Refusal is the default and not the only answer. `descend` carried the previous duel
onto a freshly generated floor, and it was fixed by *converting* rather than refusing —
deliberately, because refusing needs a channel that export does not have: it answers
the new depth, and there is no depth that means "no". Where the caller can be told,
tell it. Where it cannot, doing the right thing silently still beats doing the wrong
thing silently, and the choice gets written down either way.

**`policy::script_digest` answers a constant for every embodied fight.** Its loop keeps
only `SubmittedCommand::Articulated`, and its doc comment accounts for the arm it drops
as `Legacy`, which "cannot occur". `Embodied` occurs on every record of every embodied
run, so the digest counts zero records and finishes at `0x89b684347e2caedd` — the same
number for the script, for the control, and for a matchup running a different policy on
each side. `lab embodied` therefore folds its own stream under `ARPG-EMBODIED-SCRIPT-V1`
rather than calling it, and the repair to the shared function is still owed. It was
found only because three `crates/lab` tests were written against the number first and
all three went red; a `script` column that looks like a fingerprint and is a constant is
exactly the green-test failure this file's house style section warns about, and it
shipped in a report for the length of one session.

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
