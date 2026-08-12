# Smart AI 08 -- train, evaluate, then promote

**Goal:** spend training time on tactical decisions and replace the browser’s shipped
learned checkpoint only if held-out behavior is materially better.

## Curriculum fixed before training

Add `v2-tactical` to `crates/lab/src/learn_probe.rs`, plus
`--curriculum tactical-v2` and `--mirrored` flags that reject every other spec by
name. Every generation uses fixed, mirrored training seeds split equally among
neutral, composed, windmill, and tactical opponents. Score in this order: decision without death, intended-region contact,
wound energy, successful defence, and time; cap each component so repeated grazing
cannot dominate one clean decision. Write the exact weights and seed lists to the log
before generation zero.

Run the budget-stopped v1 `v2-probe` through generation 120 first and record it as the
honest baseline. Then train v2:

```powershell
cargo run --release -p lab -- learn-probe train --spec v2-probe --gens 120 --out checkpoints/v2-probe-completed.ckpt
cargo run --release -p lab -- learn-probe train --spec v2-tactical --curriculum tactical-v2 --mirrored --out checkpoints/v2-tactical.ckpt
cargo run --release -p lab -- learn-probe evaluate --checkpoint checkpoints/v2-tactical.ckpt --seeds 400 --mirrored
```

The held-out seed set is disjoint and frozen before training. Report per opponent:
win/loss/tick-limit, decision tick, intended-region contact rate, wound energy,
guard/evade success, and refusals.

## Promotion rule

Promote only when all are true:

- at least 95 of 100 mirrored neutral fights decide before tick 1,800;
- zero command refusals and inference allocations after warmup;
- versus the three scripts, the paired 400-seed win-rate improvement over completed
  v1 is positive at the 95% Wilson interval and tick limits fall by at least 20 points;
- no anatomy/handedness cell falls more than 10 win-rate points below its aggregate;
- native and wasm produce the same new inference digest.

On failure, commit the evidence to `docs/performance/v2-learning-tactical.md`, leave
`checkpoints/v2-probe.ckpt` and browser code 4 untouched, and close `revise`.

On pass, atomically install the v2 checkpoint at `checkpoints/v2-probe.ckpt`, make
policy code 4 construct the v2 controller, update learning architecture/performance
docs, and re-record `LEARNED_INFERENCE_DIGEST` in
[`crates/web/src/lib.rs`](../../crates/web/src/lib.rs) and
[`tools/wasm_check.js`](../../tools/wasm_check.js). This move is expected for four
independent named reasons: feature layout, action layout, `ModelShape`, and installed
checkpoint. No simulation, stream, command, contact, spec, or legacy hash may move.

## Tests and verification

```rust
#[test]
fn the_promoted_checkpoint_names_layout_two_and_shape_59_64_26() {}
#[test]
fn the_held_out_seeds_are_absent_from_every_training_generation() {}
#[test]
fn native_and_wasm_hash_all_twenty_six_logits() {}
```

```powershell
cargo test -p learn-core
cargo test -p learn
cargo test -p lab
cargo test -p web
cargo run --release -p lab -- learn-probe evaluate --checkpoint checkpoints/v2-probe.ckpt --seeds 400 --mirrored
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
npm run check
npm run build
node tools/check_docs.js
git diff --check
```
