# v2-ui — the battle management studio

**Goal:** one browser application. A main screen offering **[New Game]** and
**[Battle Arena]**, where two loadouts are chosen, a fight is run, and it is watched
from five viewpoints at once.

**Depends on:** `v2-16` (the pose and combat-event ABI), `v2-20` (the guard height the
arena exists to let a reader see), and the `/fight.html` viewer this replaces.

**Golden expectation:** sessions 01–04 move no pin. Session 06 moves
`ARTICULATED_STREAM_DIGEST` and says so in advance. Sessions 05 and 07 predict no move
but are the ones that would.

## Why

Three pages that share no code — not a router, not a layout, not even an
`element<T>(id)` helper. `web/index.html` is the legacy playable Canvas game.
`web/v2.html` is the Babylon greybox diagnostic and the only page in
`rollupOptions.input`, so it is the only one that can ship. `web/fight.html` is a trace
viewer [`AGENTS.md`](../../../AGENTS.md) marks development-only and expects to be
deleted by whichever session lands the real pose channel. This is that session, and it
inherits the obligation.

```text
+-- Battle Arena ------------------------------------------------------------+
| Fighter A [Fighter v] [Sword v]/[Shield v] [composed v]   seed [3]  [Fight] |
| Fighter B [Brute   v] [Club  v]/[empty  v] [windmill v]                     |
+---------------+--------------------------------+---------------------------+
| first-person A|                                | top-down (plan)           |
|               |   3/4 view                     |                           |
+---------------+   [Texture] [Geometry]         +---------------------------+
| first-person B|                                | side (elevation)          |
+---------------+--------------------------------+---------------------------+
| [Play] -1 +1  <contact  wound>   tick 0/3600   speed 1x   span --o-- azim   |
+----------------------------------------------------------------------------+
       one Babylon canvas, three viewports          two 2D canvases
```

## The finding that set the order

**Nothing can drive an articulated body in wasm today, and no new export alone fixes
it.** [`crates/sim/src/world.rs:1803`](../../../crates/sim/src/world.rs#L1803):

```rust
pub fn submit(&mut self, id: EntityId, command: Command) {
    if self.combat_model != crate::CombatModel::Legacy {
        return;
    }
```

`Sim::advance` ([`crates/web/src/lib.rs:2165`](../../../crates/web/src/lib.rs#L2165))
runs `observe -> decide -> submit` with **legacy** policies, so on an articulated world
every command it produces is silently discarded. `PolicyKind::from_code`
([`crates/policy/src/lib.rs:296`](../../../crates/policy/src/lib.rs#L296)) confirms the
shape: codes `0..3` are `Utility|Duelist|Idle|Random`, all legacy. The articulated
exports that do exist — `submit_articulated`, `pose_ptr`, `combat_event_ptr` — are an
input channel for a JavaScript driver plus an output channel, with **no decision loop
between them**. `init_articulated` opens a room whose bodies chase their tick-zero
command forever.

So the expensive part of a live arena is not the ABI. It is putting the two-policy
articulated loop — `measure_articulated_matchup`
([`crates/lab/src/main.rs:823`](../../../crates/lab/src/main.rs#L823); note that
`policy::run_articulated` takes *one* policy and puts it on both sides, which an arena
cannot use) — inside `Sim::advance`. And `Sim::advance` is where `ROOM_HASH`,
`BATTLE_HASH`, `SWAP_HASH` and `BOW_HASH` are produced.

**Therefore every panel a reader can see is built first, against trace files, and all
hash risk is deferred to the back half.** Sessions 01–03 touch no Rust. At the end of
03 the studio is visually complete and fed by `lab trace` output; 04–07 replace the
feed without touching the views.

## The seam

The UI is written once against a `FightSource` interface. This is a rename of what
already exists rather than a speculative abstraction:
[`client/src/fight/trace.ts`](../../../client/src/fight/trace.ts) already defines
`Trace`/`Frame`/`Pose`/`Contact`, and `view.ts` and `chart.ts` already consume them.

| adapter | lands | drives |
|---|---|---|
| `TraceFightSource` | 01 | `loadTrace(url)` over an 8–9 MB JSON |
| `LiveFightSource` | 07 | transferred pose/event buffers from the worker |

Three places the two adapters cannot agree, each with a price:

- **Region capsules.** The trace has them because
  [`crates/lab/src/trace.rs`](../../../crates/lab/src/trace.rs) calls
  `sim::body_region_volumes` — the same function the contact phase sweeps — precisely so
  a viewer cannot answer a geometry question the simulation has already answered.
  `POSE_STRIDE = 66` carries no capsules. Closing this is session 06 and it moves a pin.
- **Contact velocity and impulse.** `Contact` carries `velocityA/B` and `impulseA/B`;
  the 32-word combat-event row carries point, normal, energies and channels but neither.
  So `closureSpeed()` has no live equivalent — either the readout degrades on live
  fights, or the event row grows and moves `COMBAT_EVENT_LAYOUT_VERSION` with it.
- **Shield thickness.** Deliberately absent from the pose row; `shieldCorners()` needs
  it. It rides in the per-fight body header, which the arena config already knows.

## The learned policy plays

An earlier draft of this series concluded it should stay offline, on the strength of
[`AGENTS.md`](../../../AGENTS.md)'s rule that `crates/learn` must stay unreachable from
`web`. That was reading the rule without reading the code under it, and it produced an
absurd answer: the best fighter in the repository would be the one thing a player could
never face.

The rule's premise is that `learn` may use floating point because *nothing it computes
reaches authoritative state*, and that premise holds here by construction.
`LearnedActionV1`'s own doc comment calls it *"the type that must not reach the world"*;
what crosses into `sim` is **five head indices** from an argmax. No float reaches
authoritative state.

And the portability question `v2-19` was worried about was already engineered away:
[`model.rs:968`](../../../crates/learn/src/model.rs#L968) chose ReLU over `tanh`
explicitly *"because portability rather than accuracy"*, with no libm call, a fixed
summation order, deterministic lowest-index tie-breaking, and no fast-math in the
profile — then recorded that the claim was untested *"because this repository has no
second host to check it on."*

**wasm32 is that second host.** So this is not a risk to route around; it is a standing
claim finally getting a target to be checked on. [`v2-ui-08`](v2-ui-08-learned-in-the-browser.md)
splits an inference-only `learn-core`, lands policy code 4, and creates
`LEARNED_INFERENCE_DIGEST` to hold both targets to the same logits. `v2-ui-05` reserves
code 4 and refuses it in the meantime, so 08 is purely additive.

## The sessions

| | session | Rust | predicted pin movement |
|---|---|---|---|
| 01 | [the studio shell](v2-ui-01-studio-shell.md) | none | none |
| 02 | [the arena scene](v2-ui-02-arena-scene.md) | none | none |
| 03 | [`[Texture]`](v2-ui-03-texture-proxy.md) | none | none |
| 04 | [a configurable duel](v2-ui-04-configurable-duel.md) | `sim`, `lab` | none, and proved by test |
| 05 | [the articulated driver](v2-ui-05-articulated-driver.md) | `web` | none — but four legacy goldens are produced here |
| 06 | [the region publication](v2-ui-06-region-publication.md) | `web` | **`ARTICULATED_STREAM_DIGEST`** |
| 07 | [the recording channel](v2-ui-07-recording-channel.md) | `web` | none |
| 08 | [the learned fighter in the browser](v2-ui-08-learned-in-the-browser.md) | `learn`, `web` | none moves; **`LEARNED_INFERENCE_DIGEST` is created** |

Session 08 depends only on 05, not on 06 or 07, so it can be pulled forward if watching
the learned fighter play matters more than watching any fight at all.

## Measured input, and what it does not yet say

**A fight costs about 2.75 core-seconds native.** Derived from
[`checkpoints/train.log`](../../../checkpoints/train.log): 32 candidates × 12 trials =
384 fights of up to 3600 ticks per generation, at 52.7 s wall on 20 threads. That is
roughly 1300 ticks/s, and it includes MLP inference on one side.

At an assumed 2× wasm penalty that is ~650 ticks/s — **about eleven times faster than
the 60 Hz it plays back at** — so a whole fight records in about five seconds and
playback can start immediately while the recorder runs ahead.

**This is an extrapolation and session 05 must measure it before session 07 designs
around it.** The specific thing that could invalidate it: `publish()` rebuilds the whole
legacy frame *and* both articulated buffers on every call
([`crates/web/src/lib.rs:3880`](../../../crates/web/src/lib.rs#L3880)), and a recording
loop calls `step(1)` 3,600 times. If that dominates, session 05 owes an
`arena_record_step(ticks)` that fills the articulated buffers and skips the frame.

## Deliberately not in scope

- **v2-18's authored rigs.** Session 03 builds a proxy from primitives against v2-18's
  node contract so the real rigs are a swap, not a rewrite. Blender is not installed
  here and the asset pipeline is a body of work on its own.
- **More than two fighters.** `MAX_POSES` is 64 and nothing below the UI assumes two,
  but the picker, the layout and the first-person column all do. Widening is additive.
- **Player control.** The arena is a spectator. A human driving one of the two bodies is
  what the first-person views are eventually *for*, and it needs an input path that does
  not exist.
- **`ARTICULATED_HASH`.** Planned by `v2-17` and deliberately still absent. No session
  here may create it.
