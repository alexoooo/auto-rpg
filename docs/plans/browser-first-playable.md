# First playable: a room, a character, and a click

> **Working plan.** Each session below is a self-contained checkpoint: a fresh session
> reads the progress board, picks the first unchecked session, and has everything it
> needs. Update the board and the session's own status line as part of that session's
> work, so an interrupted run resumes cleanly.

## Progress board

| # | Session | Status |
|---|---------|--------|
| 0 | Prerequisites | ✅ done |
| 1 | `sim`: the `Goto` order | ✅ done |
| 2 | `policy`: walking to a point | ✅ done |
| 3 | `crates/web`: the wasm boundary | ✅ done |
| 4 | `web/`: the page you click on | ✅ done |
| 5 | Determinism check + docs | ✅ done |

**Complete.** Final sweep: 111 tests pass, `fmt` clean, clippy silent,
`lab verify --seeds 200` bit-exact, `node --test tools/wasm_check.js` 4/4.

Statuses: ⬜ not started · 🟨 in progress · ✅ done.

---

## Context

The repo is a complete headless sim (`fx` → `sim` → `policy` → `lab`, ~5.5k lines, zero
dependencies, 79 tests) with no way to *watch* it. `README.md:117` states the next
milestone plainly: "a renderer crate over `World::snapshot()`, then the wasm build",
followed by "`lab hash` from wasm; the number must match native". `DESIGN.md:116` calls
the renderer "the easiest piece and the one that would have shaped everything else if it
came first".

This plan builds the smallest slice that closes the loop end-to-end: **an empty room, one
hero, click a point, and the character's own AI walks there.** No enemies, no combat.

It is deliberately not a demo bolted onto the side. The click becomes a real order in the
sim's player-input channel; the navigation lives in `policy` where the lab can test and
evolve it; and the browser gets a hand-rolled, zero-dependency wasm boundary that respects
the project's no-dependency rule. What ships is a playable page **and** the wasm/native
determinism check the README asks for next — which is currently untested and is the
project's central claim.

### The gap this closes

`Order::Advance(Vec2)` carries a **direction**, not a destination
(`crates/sim/src/action.rs:79`) — a character ordered to advance walks forever. "Click
here and get there" needs a destination order, and needs the agent to know when it has
arrived. That is a real behaviour question (braking, wall avoidance, arrival), which is
why it belongs in `policy`, not in JavaScript.

### Two consequences of the existing architecture, accepted deliberately

- **An order is per-faction**, not per-unit (`crates/sim/src/world.rs:42`,
  `orders: [Order; 2]`). `Goto(point)` therefore means "the whole faction walks to this
  coordinate". Correct for one hero; a per-unit order channel is a later milestone.
- **`UtilityPolicy::decide` checks `enemies().is_empty()` first**
  (`crates/policy/src/utility.rs:306`), so click-to-move applies only while nothing is in
  sight. That is the auto-battler contract working as designed — the order is a rough
  direction the agent interprets, and a visible enemy outranks it — but it is a decision,
  not an accident. In an empty room it never comes up.

### Ground rules for every session

- `DESIGN.md` is binding: no float reaches sim state, arithmetic saturates, no RNG state
  in the world, no clock/threads/I/O in `sim`, no external dependencies in the workspace.
- `cargo test` stays green after every session. In particular `golden_hash`
  (`crates/sim/tests/determinism.rs:202`, pinning `0x2cf6_fb5e_0b7d_a331`) must pass
  **unchanged** — it is the check that this work was purely additive. Its only exposed
  surface is `Order::hash_into`; it is driven by an inline `greedy` policy
  (`determinism.rs:15`), so no `UtilityPolicy` change can reach it.
- Match the surrounding style: comments explain *why*, tests are named as sentences.

---

<!-- ============================== SESSION 0 ============================== -->
## Session 0 — Prerequisites

**Status:** ✅ done — `wasm32-unknown-unknown` installed; `cargo test` green;
`lab verify --seeds 50` reports 50/50 bit-exact.

1. `rustup target add wasm32-unknown-unknown` — only `x86_64-pc-windows-msvc` is currently
   installed. One-time, needs network.
2. Confirm the baseline is green before touching anything:
   `cargo test` and `cargo run --release -p lab -- verify --seeds 50`.

**Done when:** `rustup target list --installed` lists `wasm32-unknown-unknown` and the
existing test suite passes.

---

<!-- ============================== SESSION 1 ============================== -->
## Session 1 — `sim`: the `Goto` order

**Status:** ✅ done — `FEATURE_COUNT` is 75, `FEATURE_LAYOUT_VERSION` is 2, `golden_hash`
passes unchanged. Two notes from implementation: `Vec2::clamp_box` already existed
(`crates/fx/src/vec2.rs:154`), so no `fx` change was needed; and `UtilityPolicy::march`
needed a four-line stub arm (`Goto` folded into the `=> Vec2::ZERO` branch) purely to keep
`policy` compiling, replaced wholesale by Session 2. The `Goto` feature slot divides by
`sight_range.max(ONE)` so a hand-built `Observation` with zero sight cannot saturate a
feature to `Fx::MAX`.

### `crates/sim/src/action.rs`

Append one variant, leaving discriminants 0..3 untouched:

```rust
pub enum Order {
    Hold,
    Advance(Vec2),   // a heading; push this way until told otherwise
    Regroup,
    Focus(EntityId),
    Goto(Vec2),      // a point in the arena; get there and stand there
}
```

- `discriminant()` → `Goto => 4`; `COUNT` → `5`.
- `direction()` keeps returning `ZERO` for `Goto` — a point is not a heading, and
  conflating them is the exact bug this variant exists to prevent. Add
  `pub const fn point(self) -> Vec2` for the `Advance`/`Goto` payload.
- **`hash_into` becomes an explicit match, not a call through an accessor.** A `Goto`
  destination has to reach the state hash or two different destinations are
  indistinguishable to `state_hash`, replay verification and the determinism tests. Route
  it through `point()` and hash stability silently depends on an accessor's incidental
  behaviour — the exact class of bug that invalidates every recorded run in the repo.
  Spell the layout at the call site so the compiler forces the next person to choose:

```rust
pub(crate) fn hash_into(self, h: &mut Hash64) {
    h.write_u8(self.discriminant() as u8);
    match self {
        Order::Hold | Order::Regroup => { h.write_i32(0); h.write_i32(0); }
        Order::Advance(v) | Order::Goto(v) => { h.write_i32(v.x.raw()); h.write_i32(v.y.raw()); }
        Order::Focus(id) => { h.write_i32(0); h.write_i32(0); id.hash_into(h); }
    }
}
```

Byte-identical for the four existing variants — which is what keeps `GOLDEN_STATE_HASH`
valid, since the golden run issues `Advance(±X)` (`determinism.rs:43`).

### `crates/sim/src/obs.rs`

Add `pub decision_period: u16` to `Observation`. Self-knowledge, the same class as
`position` and `move_speed` ("proprioception is free"); the policy needs it to pace its
final stride, because an action persists until the next decision tick.

**Default it to `1` in `blank` (line 80), never `0`.** `Fx` division by zero *saturates to
`Fx::MAX`* rather than panicking (`crates/fx/src/fixed.rs:220`), so a zero period would
make the braking term `min(MAX, 1) = 1` — braking silently disabled, no error anywhere.
Use `.max(1)` at the call site as well.

Feature encoding, in the same pass:

- Write the **rate**, `Fx::ONE / Fx::from_int(period as i32)` ∈ (0,1] — raw ticks (12)
  would blow the existing `assert!(v.abs() <= Fx::from_int(2))` at
  `crates/sim/src/world.rs:892`, and the rate is the more learnable quantity anyway.
- The order-direction slot (`obs.rs:171`) currently writes `direction()`, which is `(0,0)`
  for `Goto` — a permanent blind spot baked into a frozen contract. Since the layout is
  being revised anyway, make the slot mean "where the order points, relative and
  normalised": `Advance` → unit direction, `Goto` → `(dest - position).clamp_length(sight)
  / sight`. **Never** put a world-space absolute point in the feature vector; it breaks the
  `-1..=1` invariant documented at `obs.rs:151`.
- `FEATURE_COUNT` goes 73 → 75. Add `pub const FEATURE_LAYOUT_VERSION: u32 = 2;` beside it
  so a future frozen network can refuse to load against a shifted layout.

### `crates/sim/src/world.rs`

`obs.decision_period = stats.decision_period();` in `observe`, next to `obs.move_speed`
(line 183).

### `crates/sim/src/scenario.rs`

```rust
/// An empty room with a single hero. No opposition, no time limit: the sandbox
/// the browser build opens with, and the scenario the navigation tests use.
pub fn room() -> Scenario   // arena 24x16, one Warrior at (12, 8), max_ticks: u32::MAX
```

`max_ticks: u32::MAX` is safe — nothing multiplies it; `fingerprint` only hashes it. Do
**not** wire `room()` into anything `lab` iterates: `fitness.rs` and the runner assume two
populated sides.

No other sim changes. `World::outcome()` reports `HeroesWin` the instant no monsters are
alive (line 464); correct for a battle, irrelevant here — the browser loop never asks.

### Tests

New `#[cfg(test)] mod tests` in `action.rs` (the file has none today). `hash_into` is
`pub(crate)`, so these must be unit tests, not integration tests.

- `discriminants_are_append_only` — `Hold 0, Advance 1, Regroup 2, Focus 3, Goto 4,
  COUNT 5`.
- **`order_hash_layout_is_frozen`** — for each pre-existing variant, hash it via
  `hash_into` and compare against the intended byte sequence spelled out inline
  (`write_u8(disc)`, `write_i32(x)`, `write_i32(y)`, plus `id.hash_into` for `Focus`).
  Self-contained, no re-record ritual, and it fails loudly if anyone reorders the writes.
  **This is the test that actually protects `GOLDEN_STATE_HASH`.**
- `goto_hashes_its_destination` — `Goto(a) != Goto(b)`; `Goto(v) != Advance(v)`.
- `Scenario::room()` has one hero, no monsters, spawns inside the arena.
- `write_features` still fills exactly `FEATURE_COUNT` and every value stays within the
  documented range (existing assertion at `world.rs:886`).

**Done when:** `cargo test` is green **including `golden_hash` unchanged**, and
`cargo run -p lab -- verify --seeds 50` still reports bit-exact replays.

---

<!-- ============================== SESSION 2 ============================== -->
## Session 2 — `policy`: walking to a point

**Status:** ✅ done. The arm below shipped verbatim. Measured: every case arrives, **worst
per-tick backslide exactly 0 raw units in every case**, and the pre-change `march` raw
outputs are pinned and unchanged. Corner-to-corner takes 523 ticks against a 515-tick floor.
`lab bench --seeds 500` is byte-identical to the pristine tree, so fighting behaviour
provably did not move.

Three corrections found while implementing, kept here because they are the sort of thing
that reads as a bug later:

- **Arrival on an unreachable click is not symmetric.** `Fx::Mul` floors, which *lengthens*
  a step with negative components and *shortens* a positive one. Walking down-left the body
  overshoots and `clamp_to_arena` pins it exactly on `(0.45, 0.45)`; walking up-right it
  undershoots and settles 5 raw short (7.7e-5 units), then holds. Assert `distance < 0.001`,
  not a raw-exact position — pinning the rounding artefact would be pinning a coincidence.
- **The wall-sweep companion assertion in the original plan was wrong.** With
  `wall_clearance = [0.5, 39, 14, 14]`, `Advance(-X)` does not give `x ≈ 0` — it gives
  `(+0.287, −0.958)`, because `open_ground` is added *after* the sweep and contributes a
  full `wall_fear`-length +x push before renormalisation. The property actually worth
  asserting is `|y| > |x|` (it swept) and `x >= 0` (it stopped pushing into the wall).
- **"Converges to ~1e-4" is not universal.** It holds when the distance remaining at the
  last decision exceeds the deadband. For the `(1,8)` case the final full-stride decision
  leaves 0.0523 — just inside the 0.0537 band — so the hero legitimately stops 0.052 short.
  Invisible (≈2px on a 960px canvas), but the tests bound it at 0.055, not at 1e-4.

All of this is a new arm in `UtilityPolicy::march` (`crates/policy/src/utility.rs:243`),
the workspace's only exhaustive `match` on `Order`. The `Advance` / `Regroup` / `Hold` /
`Focus` paths must stay **byte-identical**.

### Why `Goto` cannot reuse the marching machinery

Both of `march`'s steering behaviours are load-bearing for advancing and actively wrong for
arriving:

- **The wall sweep** (line 257) exists to stop an advancing line grinding into a wall
  (`DESIGN.md:146`). Applied to a destination near an edge it walks *past* the click.
- **`open_ground`** (line 197) is a **search** heuristic for an agent with no destination.
  A `Goto` has a destination, so a wall-avoidance term is by construction fighting the
  player's explicit instruction. It must be dropped for `Goto`, not tapered:
  - Added before `clamp_length(ONE)`, it creates a **stable fixed point at
    `wall_fear × stride`**, because `clamp_length` only ever *shortens*: a short sum passes
    through untouched, so the bias never shrinks as the brake does. At baseline that parks
    the hero **0.193 units short of every click, anywhere in the arena** — not just near
    walls — and it never arrives.
  - A distance taper does not save it. At the top of the evolvable range
    (`wall_fear = 1.0`, `GENE_RANGES` at `utility.rs:45`) the bias reaches magnitude 1.0
    wherever `|clear[+x] − clear[−x]| ≥ sight_range` and exactly cancels the unit heading:
    the hero freezes mid-room, ~6.7 units from the target, far outside any sane taper band.

Dropping it needs no magic constant and is immune to evolved weights.

### The `Goto` arm

```rust
Order::Goto(dest) => {
    // wall_clearance is [-x,+x,-y,+y] un-noised ground truth (world.rs:191), so the
    // reachable box is exactly recoverable: World::clamp_to_arena (world.rs:592) pins
    // bodies to [radius, arena - radius], which makes a click within one body radius of
    // a wall unreachable. Without this the character presses into the wall and never
    // satisfies the arrival test.
    let wc = obs.wall_clearance;
    let lo = Vec2::new(obs.position.x - wc[0] + obs.radius,
                       obs.position.y - wc[2] + obs.radius);
    let hi = Vec2::new(obs.position.x + wc[1] - obs.radius,
                       obs.position.y + wc[3] - obs.radius);
    let to = dest.clamp_box(lo, hi) - obs.position;
    let distance = to.length();
    if distance <= obs.move_speed {
        return Action::HOLD;
    }
    // An action persists until the next decision, so pace the stride by how much
    // ground gets covered before the next thought. This is the intellect stat: a
    // dim character commits to a longer stride and creeps in; a sharp one lands it.
    let stride = obs.move_speed * (obs.decision_period.max(1) as i32);
    let brake = (distance / stride).min(Fx::ONE);
    return Action::moving((to.normalize() * brake).clamp_length(Fx::ONE));
}
```

Use `Fx: Mul<i32>` (`crates/fx/src/fixed.rs:230`) for the stride — exact here
(raw 3517 × 12 = 42204, no rounding). The trailing `clamp_length` is defensive:
`Vec2::normalize` truncates toward zero component-wise and can return marginally over 1,
and `decisions_never_exceed_unit_movement` (`utility.rs:571`) should hold unconditionally.

**Arrival deadband = `obs.move_speed`** — one tick of travel, 0.0537 units for a Warrior:

- It self-scales with agility instead of being a magic constant.
- 0.0537 units is 0.22% of arena width — about 2px on a 960px canvas, inside a body of
  radius 0.45 units (≈18px). Invisible.
- There is a hard floor below it: a direction component under raw 19 multiplies to **zero**
  displacement per tick, so a deadband near zero never terminates. `move_speed` leaves
  ~400× margin.
- Below one tick of travel `apply_movement` still updates `facing` from a `dir` that moves
  nothing (`world.rs:330`), so a tighter band leaves the character spinning in place.
  `Action::HOLD` short-circuits on `dir.is_zero()` and freezes the arrival facing.

Braking is load-bearing, not polish: without it the hero ping-pongs forever at an amplitude
of one tick of travel and never arrives. With it, the approach is monotone — measured
per-tick backslide of exactly zero — and it converges to ~1e-4 units.

A "give up when it cannot close" rule is the right third layer, and `UtilityPolicy` already
has the idiom for it (`last_target: Vec<EntityId>`, line 136, cleared by `reset()`).
Unnecessary for one hero in an empty room; defer it.

### Tests

**`crates/policy/src/utility.rs`**, extending the existing `mod tests` and reusing the
`situation()` fixture (line 341) that `obs.rs:74` exists to enable. **`situation()` must
set `decision_period`**, or every policy test silently runs on the `blank` default.

- `goto_brakes_instead_of_overshooting` — target 0.3 units away →
  `move_dir.length() * decision_period * move_speed <= 0.3 + eps`, and `> 0`.
- `goto_holds_inside_the_deadband` — target == position → `move_dir` is `ZERO`.
- `goto_runs_flat_out_when_far` — target 10 units away → `move_dir.length() ≈ 1`.
- `goto_ignores_the_wall_sweep` — `wall_clearance = [0.5, 39, 14, 14]`, target toward the
  near wall → `move_dir.x < 0`; **in the same fixture**, `Order::Advance(-Vec2::X)` must
  still sweep (`move_dir.x ≈ 0 && move_dir.y != 0`). One test, both properties.
- `march_behaviour_is_byte_identical` — pin the exact `move_dir.x.raw()`/`.y.raw()` that
  `Hold`, `Advance(X)` and `Regroup` produce for `situation()` today. Localised, and it
  fails at the line that broke rather than as a hash mismatch three crates away.
- `decision_period_reaches_the_policy` — `World::new(&Scenario::room(), 1)
  .observe(hero).decision_period == 12`.

**New `crates/policy/tests/goto.rs`** — the arrival battery, driving a **real `World`** over
`Scenario::room()`. Helper returns `(arrive_tick, final_pos, max_backslide, state_hash)`.

| target (from centre 12,8) | expectation |
|---|---|
| (20,12) open ground | arrives ≤ 200 ticks, final distance ≤ 0.055 |
| (1,8) near wall | arrives; **`pos.y` never leaves 8.0** — the wall-sweep regression guard |
| (0.1,0.1) / (23.9,15.9) unreachable | arrives; final position exactly `(0.45,0.45)` / `(23.55,15.55)` in **raw** units |
| (0.45,0.45) reachable corner | arrives ≤ 400 |
| corner → opposite corner | arrives ≤ 800 (floor is 515 ticks for 27.6 units) |
| (12,8) already there | action is `HOLD`; `pos.x.raw()`/`pos.y.raw()` unchanged after 600 further ticks |
| 16 targets on a fixed grid | all arrive within `distance/move_speed × 1.4 + 60` |

Assertions worth more than "it arrived":

- **Monotone approach** — `d[t+1] <= d[t] + eps` every tick. This is the "braking works"
  test with teeth: the add-then-clamp bug shows up immediately as 0.054 of backslide.
- **Stillness after arrival** — raw-equality of position over 600 extra ticks.
- **Determinism** — run the battery twice, compare `state_hash`; then once more across 8
  threads, mirroring `determinism.rs:138`.
- **Cross-archetype** — repeat one case with Scout / Brute / Skitterer stats (strides
  0.657 / 0.822 / 0.477). A hard-coded stride constant instead of `decision_period` fails
  exactly here.

**Done when:** the battery passes, `cargo test` is green, `golden_hash` untouched. **The
game is now playable headlessly — that is the real milestone; the browser is only how you
see it.**

---

<!-- ============================== SESSION 3 ============================== -->
## Session 3 — `crates/web`: the wasm boundary

**Status:** ✅ done. `web.wasm` is **71.4 KB** with an **empty import list** — the open
question this session carried is answered: a no-`wasm-bindgen` module really does link with
zero imports on this toolchain. `FRAME_MAX = 583` floats (7 header + 9 × 64 units).
`selftest_hash` from wasm equals `lab hash` natively: **`0xb148b5338bc049f6`**, so Session 5's
central claim is already proven. `ROOM_HASH = 0x32a0f552486ed898` after
`init(1); set_goto(20_000, 12_000); step(600)`.

Four notes from implementation:

- **`clear_order()` is not a stop button, and Session 4 must not present it as one.**
  `march`'s `Hold` arm falls through to `Action::moving(open_ground(obs))`, so a released
  hero wanders back toward the middle of the arena — measured: released 5.7 units from
  centre, back within 0.3 after 900 ticks. That is the auto-battler contract working (no
  order means the character uses its own judgement), but a player who right-clicks expecting
  "stop" and gets a wanderer reads it as a bug. Session 4 binds right-click/Esc to a
  **stand-down** (`set_goto` at the hero's current position) and exposes `clear_order()`
  separately and explicitly as free will.
- The `thread_local!` block in this plan was incomplete: it needs a third entry,
  `FRAME_LEN: Cell<u32>`, initialised to `HEADER_LEN` rather than 0 so a client that renders
  before `init` reads a well-formed empty frame.
- The size estimate above (150–400 KB) was 2–5× high. No `opt-level = "z"` needed.
- `step` deliberately does **not** cap `frames` — capping in Rust would make history depend
  on browser frame scheduling. The clamp belongs in JS, where Session 4 already puts it.

New workspace member. `crates/web/Cargo.toml`: `crate-type = ["cdylib", "rlib"]` (the
`rlib` so `cargo test -p web` works natively), dependencies `fx`, `sim`, `policy` only.
Package name `web` → artifact `web.wasm`.

**No `wasm-bindgen`.** The zero-dependency rule (`DESIGN.md:112`) is what keeps recorded
runs valid across time, and this boundary is small enough to hand roll: a handful of
`extern "C"` functions passing `u32`/`i32`, plus one packed buffer JS reads out of linear
memory.

**`#![forbid(unsafe_code)]` is impossible here** — `#[no_mangle]` trips the
`no_mangle_with_unsafe_code` lint and `forbid` cannot be overridden, so the crate would not
compile. Use `#![deny(unsafe_code)]` plus `#[allow(unsafe_code)]` on each export. The
property actually worth having is preserved and is worth stating in the crate docs:
**zero `unsafe {}` blocks** — `Vec::as_ptr() as u32` produces a pointer and never
dereferences one, and the whole ABI is integers in and out.

| Export | Purpose |
|---|---|
| `init(seed: u32)` | `Scenario::room()` + `World` + `UtilityPolicy::baseline()` |
| `set_goto(x_milli: i32, y_milli: i32)` | Click → `Order::Goto`. Thousandths of a world unit **as integers**, so no float crosses into the sim (`DESIGN.md:15`). Truncation is 0.001 units — 50× below the arrival band |
| `clear_order()` | Back to `Order::Hold` |
| `step(frames: u32)` | See the trap below |
| `frame_ptr() -> u32`, `frame_len() -> u32` | Packed `f32` render buffer; `Fx::to_f32` is the sanctioned render-only escape hatch |
| `tick() -> u32`, `state_hash_lo/hi() -> u32` | Integers that do **not** survive an `f32` (tick past 2²⁴, the 64-bit hash), so they are separate exports rather than buffer slots |
| `selftest_hash_lo/hi() -> u32` | Session 5's native-vs-wasm check |

### The trap in `step`

`expire_unanswered_decisions` (`world.rs:290`) advances an agent's decision clock even when
nothing answered it. So a `step(frames)` that loops `world.step()` alone leaves the hero
**executing a stale action forever** — under `Goto` it walks straight past the destination
and never re-decides. Every tick must run the full loop:

```rust
for _ in 0..frames {
    due.clear();
    due.extend_from_slice(world.pending_decisions());
    for &id in &due {
        let action = policy.decide(&world.observe(id));
        world.submit(id, action);
    }
    world.step();
}
```

Do **not** reuse `policy::runner::run` — it gates on `world.outcome()`
(`crates/policy/src/runner.rs:83`), which is `Some(HeroesWin)` from tick 0 in an empty room.

### Frame buffer

Header `[arena_x, arena_y, order_kind, order_x, order_y, last_decision_tick, unit_count]`,
then 9 floats per unit `[x, y, facing_raw, radius, hp, max_hp, faction, kind, intent]`.
`facing` ships as `Angle::raw()`; JS converts (`raw / 65536 * 2π`), so no trigonometry
crosses the boundary. `last_decision_tick` is recorded by this crate's own loop on submit —
no `sim` change — and is what lets the page *show* intellect as reaction speed.

Two allocation decisions that matter:

- Build the frame from **`World::view(hero_id)`** (`world.rs:523`), not `snapshot()`:
  `snapshot()` allocates a fresh `Vec<UnitView>` per call, i.e. 60 allocations a second and
  a steady source of `memory.grow` events, each of which detaches every typed array JS
  holds.
- Store the buffer as a **fixed `[f32; FRAME_MAX]` inside a `const`-initialised
  `thread_local!`**, not a `Vec` — its address is a static in linear memory and never
  moves, which removes one of the two JS hazards outright:

```rust
thread_local! {
    static SIM:   RefCell<Option<Sim>>          = const { RefCell::new(None) };
    static FRAME: RefCell<[f32; FRAME_MAX]>     = const { RefCell::new([0.0; FRAME_MAX]) };
}
```

`thread_local!` + `RefCell` is sound here: the target is single-threaded.

### Build

```
cargo build --release --target wasm32-unknown-unknown -p web
# -> target/wasm32-unknown-unknown/release/web.wasm
```

`-p web`, not a bare workspace build: `lab` uses `std::thread::scope` and has no business
being compiled for wasm. `memory` is exported by LLD automatically.

`wasm32-unknown-unknown` already sets `panic_strategy = abort` — **do not add
`panic = "abort"` to `[profile.release]`**, which native builds share. A panic lowers to an
`unreachable` trap and **poisons the instance**: memory may be mid-mutation and a `RefCell`
may be left borrowed, so every later call can trap too. That is why the JS wraps calls in
`try/catch` and stops the loop (Session 4). Keep `overflow-checks = true`
(`Cargo.toml:16`) — it is exactly the tripwire `DESIGN.md` describes, now running on the
target that matters. Expect 150–400 KB; if that ever matters, scope `opt-level = "z"` and
`strip = true` via `[profile.release.package.web]`.

Verify the module's shape rather than assuming it (dependency-free, `tools/` precedent):

```bash
node -e 'const b=require("fs").readFileSync("target/wasm32-unknown-unknown/release/web.wasm");
const m=new WebAssembly.Module(b);
console.log("imports",WebAssembly.Module.imports(m));
console.log("exports",WebAssembly.Module.exports(m).map(e=>e.name));'
```

**Done when:** the artifact builds, its import list is known (empty or explicitly stubbed),
and host `cargo test` still passes with the new crate in the workspace.

---

<!-- ============================== SESSION 4 ============================== -->
## Session 4 — `web/`: the page you click on

**Status:** ✅ done. `web/index.html`, `web/main.js`, `web/style.css`, `tools/serve.js`, and
`web/media/{screenshot.jpg,walk.gif}`. Console on every load is one line —
`selftest hash 0xb148b5338bc049f6`, equal to native — and nothing else. Measured in the
browser: 3.21 units/s and 60.3 ticks/s over 2.5 s, so the HUD's stat claims are true and the
fixed timestep holds against the display's refresh rate. An unreachable click parks at
exactly `(23.55, 15.55)` = arena − radius and stays byte-identical for eight further seconds.
All ten directory-traversal probes (`../`, `%2e%2e%2f`, `..%2f`, `%2e%2e%5c`, `C:/`, `%00`,
malformed encodings) return 403.

Three corrections:

- **The HUD had no state for "stopped as close as a body can get"**, so after an unreachable
  click it read "walking there" forever. Fixed by watching the *body* — position unchanged
  for two decision periods — rather than re-deriving the policy's reachability clamp in JS.
  The rule stays in one place.
- The `frame()` snippet above returns the live view; the page keeps its identity check
  verbatim but copies to a plain array on the spot, because the same render pass then calls
  `tick()` and `state_hash_*()` and any wasm call can detach the view.
- The initial state reads "no order yet", not "free will" — the world starts on `Order::Hold`
  before the player has touched anything, and the two are the same order with different
  meanings.

**Verification caveat, recorded honestly.** The automation tab lives in a non-visible window,
so Chrome pauses rAF and throttles timers to 1 Hz. Three *real* clicks landed first and
mapped correctly through `getBoundingClientRect` including DPR ((772,417) → 20.02, 12.00);
the remaining checks used `MouseEvent`/`KeyboardEvent` dispatched at the canvas — same
handlers, same math — with the page's own `loop()` driven at ~60 Hz from an unthrottled
Worker using real `performance.now()` timestamps. Nothing inside `main.js` was stubbed. For
the same reason the GIF is encoded from the page's own canvas rather than captured, so its
256-colour palette bands the dark gradient; the page itself renders smoothly.

Vanilla HTML/CSS/JS. No build step, no npm. Files: `web/index.html`, `web/main.js`,
`web/style.css`.

- **Canvas** sized to the arena's aspect, DPR-aware, resizes with the window.
- **Fixed-timestep loop**: accumulate real time in `requestAnimationFrame`, call `step(n)`
  at exactly `TICKS_PER_SECOND = 60`, clamp the accumulated delta (~250 ms) and cap
  catch-up at ~8 ticks per frame, and reset the accumulator on `visibilitychange`. The
  sim's tick rate must not depend on the display's refresh rate — that is the whole point
  of a deterministic sim.
- **Click** → CSS px (`getBoundingClientRect` returns CSS pixels, *not* the DPR-scaled
  backing store) → world units → clamp to the arena rectangle → `Math.round` → milli-units
  → `set_goto`. JS→wasm `i32` params go through `ToInt32`, which **wraps** rather than
  clamps, so clamping before the call is mandatory. Right-click or `Esc` → `clear_order()`.
- The **policy** owns the reachability clamp (Session 2); JS clamps only to the arena
  rectangle and draws the marker at the raw click, so the hero visibly stops as close as it
  can get. Replicating collision rules in float JS would couple the renderer to sim rules
  for no benefit.
- **Render**: room floor + grid; destination marker (pulsing ring) drawn from the *sim's*
  order in the frame header, not from the raw click; the hero as a circle with a facing
  wedge; a faint pulse on the frame where `last_decision_tick` changes.
- **HUD**: tick, position, distance remaining, arrived/moving, and the stat-derived numbers
  — `intellect 8 → thinks every 12 ticks (0.20 s)`, `agility 6 → 3.2 units/s`. Dim the
  destination marker until the hero actually acts on it. The project's central claim,
  visible on the first screen, for a few lines of code.

### The JS rules that keep a hand-rolled ABI correct

```js
function frame() {
  const ptr = exports.frame_ptr(), len = exports.frame_len();
  if (view === null || view.buffer !== mem.buffer ||
      view.byteOffset !== ptr || view.length !== len) {
    view = new Float32Array(mem.buffer, ptr, len);
  }
  return view;
}
```

- **Never hold a typed array across a wasm call**, not one call, not one line. Any
  allocating call can trigger `memory.grow`, which detaches `mem.buffer` and silently
  zero-lengths every existing view.
- **Never cache `frame_ptr()` across a wasm call**, even though the fixed array makes it
  stable — the discipline is what keeps this correct if someone later switches it to a
  `Vec`.
- Keep the buffer `f32`: `[f32; N]` is 4-aligned, so `new Float32Array(buffer, ptr, len)`
  is always legal. A `u8` buffer would need an alignment proof or a copy.
- Wrap every export call in `try/catch`; on error, cancel the rAF loop and show an overlay.
  A trapped instance is poisoned — spinning at 60 Hz on a dead module is the worst failure
  mode available.
- Build the import object by enumerating `WebAssembly.Module.imports(module)` and stubbing
  whatever is there. Ten lines that turn a hard `LinkError` into a console warning.

### `tools/serve.js`

Dependency-free Node static server (`tools/gen_sin_table.js` is the precedent for a Node
dev tool here; `DESIGN.md`'s no-dependency rule is about the Rust workspace). Serves `web/`
and maps `/web.wasm` out of `target/wasm32-unknown-unknown/release/` — `target/` is
gitignored, so serving from there beats copying. Correct `application/wasm` MIME type,
no-cache headers. **Resolve every request path and reject anything outside the two
allowlisted roots** — a path-mapping server is a directory-traversal hazard even on
localhost. A `file://` page cannot instantiate wasm, so a server is required. Builds first
unless `--no-build`, giving a one-command `node tools/serve.js`.

**Done when:** `node tools/serve.js`, open the URL, and the character walks to your clicks —
including corners, unreachable clicks against a wall, and re-targeting mid-walk. Verify
with the Chrome MCP tools; capture a screenshot and a GIF of a walk, since the whole point
is motion.

---

<!-- ============================== SESSION 5 ============================== -->
## Session 5 — Determinism check + docs

**Status:** ✅ done.

**The claim holds.** `node --test tools/wasm_check.js`:

```
web.wasm: 73128 bytes, 0 imports
selftest hash  0xb148b5338bc049f6  == native
room-run hash  0x32a0f552486ed898  == native
```

Both numbers are recorded from native (`lab hash` for the first, `cargo test -p web` for the
second) and both match from wasm. The fixed-point sim is bit-identical between MSVC x86-64
and wasm32, across the canned 4v6 fight *and* the click-to-move path. That is the project's
central claim, checked across targets for the first time rather than asserted.

Two implementation notes: `const module = …` is a `SyntaxError` in CommonJS (`module` is a
wrapper parameter — bind the compiled module as something else), and the hash assertions use
`assert.ok(a === b, msg)` rather than `assert.equal` so Node does not append nineteen digits
of decimal-BigInt diff under a message that already prints both values in hex. Rust builds
are not byte-reproducible, so a rebuilt `web.wasm` has a different md5 with identical
behaviour — compare hashes, never artefacts.

1. **The check the README already promises** (`README.md:118`), and the project's central
   claim — currently untested. `selftest_hash_lo/hi()` runs exactly what `lab hash` runs:
   `policy::run(&Scenario::skirmish(scenario, 4, 6), seed, UtilityPolicy::baseline(),
   &RunConfig::default())` (`crates/lab/src/main.rs:213`). No new `lab` code needed.
2. **`tools/wasm_check.js`** — dependency-free, using Node's built-in `node:test`.
   Instantiates `web.wasm` with the auto-stubbed import object, runs a fixed script
   (`init(1)`, `set_goto(20_000, 12_000)`, `step(600)`), and asserts both the selftest hash
   and the room-run hash against constants recorded from native. That single assertion
   proves the fixed-point sim is bit-identical between MSVC x86-64 and wasm, which is worth
   more than the entire browser build. Print it in the page console too.
3. **`README.md`**: Status (the browser build exists), run instructions in Getting started,
   tick off items 1 and 2 of "Where this goes next".
4. **`DESIGN.md`**: `Order::Goto` and the arrival rule beside the wall sweep in "Rules that
   exist for termination, not for flavour"; the feature-layout revision and
   `FEATURE_LAYOUT_VERSION`; a line noting that orders are commands rather than percepts,
   so they are exact by definition and not degraded by `perception` — which is what lets
   the policy compute `dest - position` exactly; drop "No renderer yet" from the deliberate
   non-choices.
5. Final sweep: `cargo test`, `cargo run --release -p lab -- verify --seeds 200`, mark the
   progress board complete.

**Done when:** wasm and native hashes match and the docs describe the project as it now is.

---

## Notes and risks

- **The feature-layout revision is the one real conflict with `DESIGN.md`.** Line 66: *"the
  layout is the contract a trained network gets frozen against, and changing it later means
  retraining."* This changes it twice (`Order::COUNT` 4→5, plus `decision_period`), 73 → 75.
  Permitted today because no weights exist, but it is exactly the cost that document was
  written to make visible: do it in one deliberate change, update `DESIGN.md` in the same
  commit, and add `FEATURE_LAYOUT_VERSION`.
- **Response latency is a feature, not lag.** The click lands as a standing order and the
  character acts at its next decision tick — up to 12 ticks (0.2 s) for a Warrior. That
  *is* the intellect stat. The HUD says so and the marker stays dim until the hero acts, so
  it reads as characterisation rather than an unresponsive control.
- **Scope held deliberately tight.** No enemies, no obstacles, no pathfinding around
  geometry (there is none), no per-unit orders, no stall detection, no replay UI. Each is a
  clean next step on top of this.
