# auto-rpg

A top-down auto-battler where you give rough directions and your character
fights for itself — and where character stats are wired into the AI rather than
into damage numbers. Levelling intellect literally makes your character think
more often; levelling perception literally widens and sharpens what it sees.

Two frontends over one simulation: a browser game, and a headless lab that runs
the identical simulation as fast as the machine allows.

## Status

Milestone 1: headless. No renderer yet, on purpose — the simulation, the agent
boundary, determinism and the experiment harness come first, and a renderer is
the easiest of the five to add afterwards.

## Layout

```
crates/fx       deterministic math: 16.16 fixed point, vectors, angles, PCG32
crates/sim      the game: world, tick, observations, actions, replay
crates/policy   agent policies + the run harness
crates/lab      headless experiment CLI
tools/          the sine table generator
```

Nothing in the workspace has an external dependency. Parallelism is
`std::thread::scope`, argument parsing is forty lines, and the sine table is
committed as source. That is not minimalism for its own sake: this project's
central claim is that a run is reproducible forever, and every dependency is
something that can change behaviour underneath that claim.

## Getting started

```
cargo test                                        # 79 tests, under a second
cargo run --release -p lab -- bench   --seeds 2000
cargo run --release -p lab -- verify  --seeds 200
cargo run --release -p lab -- hash
cargo run --release -p lab -- evolve  --gens 30 --pop 24 --seeds 8
```

`verify` is the interesting one: it runs a batch of fights, re-runs each of
them, replays each of them, and requires all three to agree bit for bit.

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

1. A renderer crate over `World::snapshot()`, then the wasm build.
2. `cargo run -p lab -- hash` from wasm; the number must match native.
3. A tiny fixed-size MLP behind the same `Policy` trait, trained by the
   evolution loop that already exists.
4. Spatial partitioning, when a scenario needs hundreds of entities rather than
   dozens. Not before.

See [DESIGN.md](DESIGN.md) for the rules that keep the determinism guarantee
true.
