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

## The tunnelling column is two facts, and Smart134 separates them

**Superseding note, 2026-08-15.** The `revise` above is unchanged and its condition is
now being discharged rather than waived. The `tunnelling` column counts a contact with
no crossing of the *intended* region, so it sums two unlike things: a blade that hit a
body region other than the one the plan named, and a contact the corpus's own swept
test cannot account for at all. Only the second is a defect -- the first is what
hitting something looks like when where you hit follows from geometry rather than from
a plan. Reading the sum as one bar is what parked the lever, and 64 of those rows were
already present at the production pair, so the column was never purely a property of
the candidate.

`ContactFact::region` already records the region each contact was attributed to, and
`BodyPart` is a re-export of `AnatomyRegion`, so the two index spaces are one. The
calibration table therefore gains `wrong_region` and `unexplained` beside `tunnelling`
at no measurement cost. The two counters and the rows that pin their exhaustiveness
live with the rest of the harness in
[`strike_corpus.rs`](../../crates/lab/src/strike_corpus.rs); Smart134 predeclares the
acceptance rule before the numbers are read, because this repository has already been
caught choosing a rule after seeing its output.

### The split, measured 2026-08-15

Same command, same 3,600 cases per candidate, on current default code:

| maximum speed | crossings | contacts | wounded rows | tunnelling | wrong region | unexplained | maximum closure energy |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1,092 | 3,536 | 2,772 | 12 | 6 | 2 | 4 | 19,665 |
| 2,184 | 3,456 | 2,662 | 928 | 20 | 8 | 12 | 17,406 |
| 4,368 | 3,328 | 2,682 | 1,086 | 86 | 24 | 62 | 7,072 |
| 8,736 | 2,952 | 2,642 | 1,240 | 326 | 32 | 294 | 27,453 |

**Two things in this table are corrections and one is the answer.**

*The 2026-08-11 table above no longer reproduces.* Nothing was rerun between then and
now, so the drift is four months of committed sim work reaching a corpus nobody
re-measured. The direction is favourable and it is large: tunnelling at the production
pair fell from 64 rows to 6, and wounded rows rose from 6 to 12. The lever itself is
undiminished -- the 2x candidate still takes wounded rows from 12 to 928. **A parked
decision kept being quoted against numbers that had stopped being true**, which is the
cost of parking one.

*The hypothesis that motivated the split was wrong, and the predeclared rule is what
makes that a result.* The expectation was that the tunnelling rise would prove to be
wrong-region contacts -- benign for a swordfight. It is not. `unexplained` is the
larger bucket at every candidate and it is the one that scales: 4, 12, 62, 294, while
wrong region moves only 2, 8, 24, 32. Wrong-region contacts are close to flat; contacts
the corpus's own swept test cannot account for are what grow with blade speed.

### And `unexplained` is this harness, not the sim

Settled by re-running the **same primitive** (`fx::swept_segment_segment`) against the
**solver's own collider inputs**, snapshotted right after `build_contact_colliders`
and before the driver advances them in place. **372 of 372 unexplained rows, across
all four candidates, are crossings under those inputs.** Not one is a contact without
a sweep. The two wrong inputs, isolated at the 8,736 candidate's 294 rows:

| crossing test | rows rescued |
|---|---:|
| this harness today: observed region snapshot x observed post-step blade | 0 |
| de-noised region snapshot x observed post-step blade | 142 |
| observed region x the solver's blade previous/requested | 22 |
| de-noised region x the solver's blade | 290 |
| the solver's own call, asked of any of the five regions | **294 / 294** |

Both errors are needed and neither alone suffices:

1. **The observed region is perception-noised.** `ObservedOpponent::regions` is built at
   the *measured* origin, so this harness sweeps against a body that is not there --
   displaced by 79,997 to 96,348 raw, which is 1.22 to 1.47 world units, far larger
   than any region radius. This error is flat across candidates.
2. **The post-step blade is the contact-committed pose, not the requested one.**
   `commit_contact_row`/`commit_arm` write the solved endpoint back onto the arm, and
   the observation is taken after that, so the harness sweeps a *shorter* arc than the
   blade asked for. Worst endpoint gap per candidate: 1,483, 5,018, 17,964, 51,309 raw.

**The second one is the growth mechanism.** The noise is constant while the clamp's
bite grows about 35x with arm slew, which is exactly the 4, 12, 62, 294 curve. The
static-region asymmetry is real but second-order: making the test swept rescues 38
rows against de-noising's 142, and in the worked case the intended region's
`previous_lower` equalled its `requested_lower` exactly.

`wrong_region` is likewise ordinary: 66 of 66 rows cross some region under the sim's
own inputs and 56 of 66 cross exactly the region the fact names, and every pair is
physically adjacent -- aimed torso struck left arm, aimed legs struck torso.

**So the tunnelling column never contained a defect at all.** Every row in it is either
a benign neighbouring-region hit or a false positive of this harness, at every
candidate. The session-04 block rested entirely on the measurement, and it is
discharged.

Repairing the harness properly needs the sim to publish the tick's swept contact
geometry beside `contact_resolutions()` -- `RegionVolume` is a snapshot with no
previous/requested pair, and no published channel carries the blade's *requested*
pose at all. Whoever writes that accessor must snapshot immediately after
`build_contact_colliders`, because `solve_contact_tick_with` advances
`contact.colliders` in place and a naive accessor hands back the advanced rows.
