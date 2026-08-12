# Smart AI actuator calibration

**Purpose:** Record the session-04 arm-slew experiment and its rejection.
**Status:** current
**Canonical source:** this record and the calibration harness in [`strike_corpus.rs`](../../crates/lab/src/strike_corpus.rs)
**Update when:** The striker, actuator rates, contact solver, corpus cases, or calibration interpretation changes.

Measured on 2026-08-11; production constants remained unchanged.

## Method

The striker ran the stationary-target corpus at nine approach offsets against both
anatomies, in both mirrors, for seeds 0 through 99: 3,600 cases per candidate. A case
ends on the first `Commit -> Recover` decision, so the row describes one planned sweep
rather than the sum of repeated attacks over a 1,800-tick fight. Each candidate run
was bracketed by the production pair on the identical scenario, seed and policy; the
two control rows were asserted byte-for-byte equal.

`tunnelling` below means a weapon/body contact during commit without a crossing of the
region the locked plan named. It includes a collision with the wrong body region and
is deliberately conservative: either interpretation is a regression for a
region-targeted striker. `minimum wounding travel` is the smallest committed blade
travel among rows whose contact channels carried nonzero cut or thrust energy; it is
measured from this corpus, not copied from a legacy threshold.

Run the table with:

```powershell
cargo run --release -p lab -- strike-corpus --policy striker --seeds 100 --mirrored --calibrate-actuator
```

## Result

| maximum speed | acceleration | crossings | contacts | contacts / crossings | median travel | minimum wounding travel | wounded rows | refusals | solver rejections | tunnelling | maximum closure energy |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1,092 | 182 | 3,474 | 2,844 | 81.87% | 93,012 | 55,369 | 6 | 0 | 0 | 64 | 20,059 |
| 2,184 | 364 | 3,368 | 2,732 | 81.12% | 128,267 | 40,979 | 860 | 0 | 0 | 68 | 41,800 |
| 4,368 | 728 | 3,272 | 2,736 | 83.62% | 165,232 | 43,812 | 1,134 | 0 | 0 | 140 | 58,638 |
| 8,736 | 1,456 | 2,828 | 2,684 | 94.91% | 168,808 | 71,888 | 1,348 | 0 | 0 | 404 | 28,076 |

The 2x pair is the smallest candidate that keeps crossings above 90%, converts at
least 80% of crossings to contacts, and carries median travel above the measured
minimum for a wound. It nevertheless increases tunnelling from 64 to 68 and more than
doubles the maximum closure-energy tail. The larger candidates worsen at least one of
those regressions and the 8x pair also falls below the crossing threshold.

The decision is therefore **revise**. Arm slew is a real lever -- the 2x candidate
turns 6 wounding rows into 860 -- but this table does not authorize changing the
production pair. The striker or its sweep attribution must first explain the wrong-
region contacts; re-recording `ARTICULATED_STREAM_DIGEST` would hide that failure.
