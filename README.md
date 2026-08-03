# auto-rpg

A top-down auto-battler where you give rough directions and your character
fights for itself — and where character stats are wired into the AI rather than
into damage numbers. Levelling intellect literally makes your character think
more often; levelling perception literally widens and sharpens what it sees.

Two frontends over one simulation: a browser game, and a headless lab that runs
the identical simulation as fast as the machine allows.

## Status

Milestone 2: playable. The headless sim came first on purpose — the simulation,
the agent boundary, determinism and the experiment harness are the parts that
would have been shaped wrongly by a renderer arriving early.

There is now a browser build: an empty room, one character, and you click where
you want it to go. Nothing in the page does the walking. The click becomes a
standing `Order::Goto` in the sim's player-input channel, and the character's own
utility AI works out how to get there, when to brake, and that a click inside a
wall means "as close as a body can stand". You are giving directions to something
that decides for itself, which is the whole game.

And the number matches. `web.wasm` and the native lab produce the *same 64-bit
state hash* for the same run — `0xb148b5338bc049f6` — so the fixed-point
simulation really is bit-identical across MSVC x86-64 and wasm32, rather than
merely designed to be.

![The room, mid-walk](web/media/screenshot.jpg)

The destination marker stays dim until the character actually acts on the click.
That gap is up to twelve ticks, and it is not input lag — it is the intellect
stat, which is the same number the HUD is showing you.

## Layout

```
crates/fx       deterministic math: 16.16 fixed point, vectors, angles, PCG32
crates/sim      the game: world, tick, observations, actions, replay
crates/policy   agent policies + the run harness
crates/lab      headless experiment CLI
crates/web      the browser boundary: a hand-rolled wasm ABI, no wasm-bindgen
web/            the page you click on: vanilla HTML, CSS and JS, no build step
tools/          the sine table generator, a dev server, the wasm/native check
docs/plans/     working plans, updated in place as sessions complete
```

Nothing in the workspace has an external dependency. Parallelism is
`std::thread::scope`, argument parsing is forty lines, and the sine table is
committed as source. That is not minimalism for its own sake: this project's
central claim is that a run is reproducible forever, and every dependency is
something that can change behaviour underneath that claim.

## Getting started

To play it:

```
rustup target add wasm32-unknown-unknown          # once
node tools/serve.js                               # builds the wasm, serves the page
```

Then open the printed URL. Click to send the character somewhere; right-click or
`Esc` to make it hold its ground; `F` to withdraw the order entirely and watch it
decide for itself. A server is needed because a `file://` page cannot instantiate
wasm — that is the only reason.

To work on it:

```
cargo test                                        # 111 tests, under a second
cargo run --release -p lab -- bench   --seeds 2000
cargo run --release -p lab -- verify  --seeds 200
cargo run --release -p lab -- hash
cargo run --release -p lab -- evolve  --gens 30 --pop 24 --seeds 8
node --test tools/wasm_check.js                   # wasm must equal native
```

`verify` is the interesting one: it runs a batch of fights, re-runs each of
them, replays each of them, and requires all three to agree bit for bit.

`wasm_check` is the other one. It instantiates the wasm module under Node and
asserts two hashes against numbers recorded from a native build — one from a
canned 4v6 fight, one from a scripted click-and-walk. If either moves, the claim
this whole architecture is built to support has stopped being true, and the
failure message says so rather than making you work it out.

Measured on a 20-thread desktop:

```
200 runs verified: identical on re-run and exact on replay

running 2000 rollouts of 4v6 across 20 threads
fitness  n=2000   mean=60.4570  min=2.8316  p25=8.4250  med=11.9616  p75=132.2336  max=151.6629
outcomes 821 wins, 1115 losses, 64 draws, 0 mutual (41% win rate, 921 ticks avg)
throughput 5404 rollouts/s, 4979831 ticks/s, 2816563 decisions/s (0.37s wall)
```

Five million simulated ticks per second, and every one of them reproducible.

## The three decisions everything else follows from

**The sim has no engine in it.** `crates/sim` depends on `crates/fx` and
nothing else — no Bevy, no window, no threads, no clock, no I/O. A renderer will
be a separate crate that reads snapshots. This costs a little glue and buys:
tests that run in microseconds, ten thousand rollouts as one `chunks_mut`,
renderer swappable (or absent) forever, and engine version churn that never
reaches gameplay code.

**No floating point in the simulation.** IEEE-754 makes `+ - * /` and `sqrt`
bit-exact everywhere, but `sin`/`cos`/`exp`/`powf` are libm implementations and
the libm in a wasm binary is not the one in your platform's C library. One ULP
is enough to diverge a fight. So the sim is 16.16 fixed point with a committed
sine table, and it is bit-identical on every target by construction.

**Replays record actions, not seeds.** The obvious design logs the seed and
re-runs the policies. That works until a policy is a neural network, and then a
wasm SIMD matmul and a native AVX matmul disagree in the last bit, an `argmax`
flips, and the replay diverges from the run it claims to reproduce. Recording
decisions means playback never runs inference at all — so the portability
requirement lands only on the sim, which genuinely is portable, and the policy
is free to be as unportable as it likes.

## The agent boundary

```rust
loop {
    for id in world.pending_decisions() {   // whose decision clock is due
        let obs = world.observe(id);        // what they can perceive
        world.submit(id, policy(obs));      // what they chose to do
    }
    world.step();                           // advance one tick
}
```

`Observation` in, `Action` out. A hand-authored utility AI, a neural policy, a
recorded log and a human all enter through the same door, and the sim cannot
tell them apart. The player's "rough directions" are just another field on the
observation — a standing `Order` per faction that agents interpret with whatever
wits they have.

## Stats drive the AI, not the network

| Stat | Effect |
|------|--------|
| intellect | ticks between decisions (20 → 1, so 3/second up to 60/second) |
| perception | sight range, positional noise, how many contacts fit in an observation |
| agility | movement speed, attack cadence |
| power | damage |
| vitality | health |

One trained policy will serve every character build. A dim character is not
running a worse network — it is running the same network on a blurrier picture,
less often. That is legible on a character sheet, cheap to balance (these are
knobs, not retraining runs), and it gives the lab an obvious axis to sweep.

## Where this goes next

1. ~~A renderer over the sim, then the wasm build.~~ Done — `crates/web` and
   `web/`, about two hundred lines of Rust and one page, no dependencies either
   side.
2. ~~`lab hash` from wasm; the number must match native.~~ Done, and it does.
   `node --test tools/wasm_check.js`.
3. A tiny fixed-size MLP behind the same `Policy` trait, trained by the
   evolution loop that already exists. The feature vector it will be frozen
   against is already there and already versioned.
4. Per-unit orders. An order is currently per-faction, which is exactly right
   for one hero and obviously wrong for a party.
5. Spatial partitioning, when a scenario needs hundreds of entities rather than
   dozens. Not before.

See [DESIGN.md](DESIGN.md) for the rules that keep the determinism guarantee
true.
