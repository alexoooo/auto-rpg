# Learned roster policy

**Purpose:** Record the exact training artifact and held-out promotion table for the Tactical V2 learned roster policy.
**Status:** current
**Canonical source:** [`crates/lab/src/learn_probe.rs`](../../crates/lab/src/learn_probe.rs), [`crates/learn-core/src/model.rs`](../../crates/learn-core/src/model.rs), and `checkpoints/learned-roster-v2.ckpt`
**Update when:** The roster objective, Tactical V2 model, promoted checkpoint, evaluation corpus, or promotion threshold changes.

## Result

`checkpoints/learned-roster-v2.ckpt` passed every promotion row on 2026-08-20.
The weakest held-out result was Neutral at 277 wins from 400 fights
(69.25%, Wilson 95% interval `[64.6%, 73.6%]`), above both the 60% win threshold
and the 50% Wilson-lower threshold. Every row reported 100% safety under the
promotion predicate, 100% force coverage, zero solver refusals, and exact replay
for both sampled fights.

The literal outside-envelope rate is reported separately and is not the safety
predicate. A command outside the observed weapon envelope remains safe when it is
a full-effort attack or withdraws at least `7/8` speed. Conflating those two columns
would falsely fail the Neutral row's 74.6% outside rate and hide why the safety row
is 100%.

## Training and artifact

The retained run was:

```text
cargo run --release -p lab -- learn-probe train --spec v2-probe --action-layout tactical-v2 --opponent roster --gens 50 --pop 28 --elite 4 --seeds 5 --ticks 1800 --budget-seconds 600 --out target/learned-roster-keepout.ckpt
```

It completed in 442 seconds. The promoted file is:

| Property | Value |
|---|---:|
| path | `checkpoints/learned-roster-v2.ckpt` |
| size | 22,264 bytes |
| SHA-256 | `caca7e57de5ba843194d6c911dbb44cb85e4d4b1880825f074d398f924b61104` |
| opponent mask | `0b11111` -- all five `PolicyKind` rows |
| model | Tactical V2, 59 x 64 x 26, 5,530 `f32` weights |

The SHA above was re-measured over both the retained training output and its
byte-identical promoted copy. An earlier draft recorded
`01e1c344b74c8f586d2635fa0fad484fbcf801774e0e9c2a922e047558514887`;
that value names neither file and was a copied receipt, not artifact evidence.

The training run's aggregate return totals were not retained. They cannot be
reconstructed from the checkpoint and are not promotion evidence. This record
therefore quotes only the command, elapsed time, artifact identity, and held-out
figures that were captured.

## Held-out roster

The promoted artifact was evaluated with the disjoint 200-seed, 1,800-tick roster
command:

```text
cargo run --release -p lab -- learn-probe evaluate --checkpoint checkpoints/learned-roster-v2.ckpt --action-layout tactical-v2 --opponent roster --seeds 200 --ticks 1800
```

Each row is 400 fights: 200 seeds in both orientations. Wilson intervals are 95%.

| Opponent | Wins | Win rate | Wilson interval | Literal outside envelope | Safe | Full effort | Solver refusals | Replay |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| neutral | 277 / 400 | 69.25% | [64.6%, 73.6%] | 74.6% | 100% | 100% | 0 | 2 / 2 exact |
| scripted | 287 / 400 | 71.75% | [67.1%, 75.9%] | 41.8% | 100% | 100% | 0 | 2 / 2 exact |
| scripted-level | 287 / 400 | 71.75% | [67.1%, 75.9%] | 41.8% | 100% | 100% | 0 | 2 / 2 exact |
| tactical | 341 / 400 | 85.25% | [81.4%, 88.4%] | 58.7% | 100% | 100% | 0 | 2 / 2 exact |
| tactical-fixed-guard | 333 / 400 | 83.25% | [79.3%, 86.6%] | 58.4% | 100% | 100% | 0 | 2 / 2 exact |

The gate was conjunctive for every opponent: win rate at least 60%, Wilson lower
bound above 50%, safety at least 90%, full-effort coverage 100%, zero refusals,
and exact sampled replay. No row borrows margin from another. `scripted` and
`scripted-level` produced identical captured rows; that is an observation, not a
claim that their implementations are interchangeable.

These are the post-envelope results, rerun after the simulator began limiting a
commanded hand to 135 degrees from achieved torso facing. The promoted checkpoint
bytes did not change; the extra wins on four rows are the measured consequence of
removing directly-behind arm targets from every fighter, not a second training run.

## Portability receipt

The artifact's additive Tactical V2 inference digest is
`0x6d06a0e332628298`. Native Rust and wasm publish it over the same synthetic
logit corpus under `ARPG-LEARNED-TACTICAL-V2`. It does not replace or re-record
the V1 `LEARNED_INFERENCE_DIGEST`; the [golden registry](../reference/hashes.md#golden-registry)
owns both values and their change rules.
