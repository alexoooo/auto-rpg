# Smart AI matched tactical mechanics

**Purpose:** Preserve the parameterized strong-reference/tactical calibration and its validity stop.
**Status:** current
**Canonical source:** `crates/lab/src/tactical_mechanics.rs` and `crates/lab/src/strong_strike.rs`.
**Update when:** The strong reference, tactical controller, matched scenarios, or contact-to-anatomy waterfall changes.

**Measured:** 2026-08-12 under default mechanics; rerun 2026-08-14 under
`cartesian-recoil`, native MSVC x86-64 Windows release build.

## Method

```powershell
cargo run --release -p lab -- tactical-mechanics --quick
cargo run --release -p lab -- tactical-mechanics --calibration --write target/smart-ai-10-calibration.csv
```

The harness ran `strong reference -> tactical -> strong reference`; both reference
measurements were equal. Commands entered through `submit_articulated_v1`, and the
harness read policy diagnostics, observations, contact resolutions and outcomes.
`--quick` prints no pass decision.

The strong seam now accepts seed, mirror state, target anatomy, and the frozen nine
approach offsets. It derives the target bearing from the public articulated observation
and reverses its eighth-turn chamber/commit arc under a mirror. Calibration ran seeds
`0..25`, both mirrors, both shipped anatomies and all nine offsets: 900 bracketed cases.
The CSV is 81,392 bytes and 901 lines including its header, with SHA-256
`4244d6584a1f8cf4437104530bae0e19122b1ddf5e079c429e28fc1101aac7f4`.

## Quick result

The diagnostic centre-offset row now uses the same parameterized public-observation
reference as calibration. Both bracket references have tip movement raw `9,226` and
no contact. Tactical has the same peak tip movement, crosses its intended torso at tick
53, and has no contact. Refusals, solver rejections, energy excess, channels and anatomy
changes are zero. This remains diagnostic only and prints no gate decision.

## Decision

`invalid`, so the held-out set was not opened. Of 900 calibration cases, 519 failed at
least one predeclared validity rule. Reference brackets never drifted, but 308 rows had
no reference weapon/body fact and 207 had multiple weapon/body or competing facts;
only 385 therefore carried the required single uncontested reference fact. Tactical
contact appeared in 80 rows and six tactical rows failed their own crossing/refusal/
solver/energy-excess validity conjunction. The categories overlap, which is why their
counts must not be summed to reconstruct 519. Reference contact of any multiplicity
appeared in 592 rows.

This is a measurement failure before it is a mechanics comparison. Deriving aim from
the permitted noisy observation makes some fixed arcs miss, while several other arcs
produce more than the one fact the strict attribution grammar permits. The harness
refuses `--held-out` with exit status 2 until calibration validity is recorded; it did
not generate the requested held-out artifact. No controller or mechanics successor is
selected from these rows.

No registered hash moved and no authority change is authorized by this diagnostic.

## Interior contact fixture search

Session 19 reused the ordinary-command strong-strike seam to look for the interior
joint fixture the retained full-reach strike could not provide. The predeclared grid
was seed 0, seven chamber horizons, six commit horizons, five interior reach targets,
both target anatomies, all nine existing approach offsets, and both mirrors: 7,560
runs. Eligibility used only the public precontact subject observation, published
attribution/crossing facts, motion, and legality. Damage, channels, dissipation and
anatomy outcomes were neither read nor scored.

There were 2,608 contact rows, 2,338 rows inside the strict reach margin, 1,669 rows
with one sword/body fact and no competitor, and 312 rows satisfying the complete
individual eligibility conjunction. No adjacent unmirrored/mirrored pair satisfied
it. The first eligible individual -- chamber 8, commit 20, reach target 32,768, Brute,
offset raw `(-131072,0)` -- contacted unmirrored at tick 28 with inferred reach 32,765,
arm velocity `(141,1278,0)`, hilt movement 1,334 and tip movement 8,433. Its mirror's
tick-9 contact did not cross the observed region, and the unmirrored row missed under
the fixed `-1` commit-horizon probe. The `+1` probe retained the unmirrored contact;
both `-256/+256` reach probes retained it but did not repair the mirror crossing.

The result is `revise`: no robust mirrored interior fixture was selected, and none of
these rows authorizes a mechanics response change.

## Post-mechanics rerun contract

The Lab harness now records reference dissipation, cut, thrust, matching-region
integrity loss, observed crossing, and held-control validity alongside the tactical
waterfall. Smart128 required zero structural validity failures before the held-out
seed range could open. A visibly meaningful sword result required at least 95%
uniquely attributed crossings/contacts with nonzero dissipation and at least 90%
positive cut-or-thrust with matching regional integrity loss. Pressure was reported
but did not count as damage; open wound remained separate because thrust need not
create one. The paired held control had to remain entirely inert, and both
strong-reference brackets had to remain byte-identical.

The rerun below stopped structurally. The held-out command still reruns the 900-case
structural calibration itself and exits 2 on any failure, so neither this failed
calibration nor a stale prior CSV can authorize the decision set.

## Exact-mechanics rerun

Smart128 ran from source commit
`7813de079e237f613ec59c4ef38aeee8b399742f` on native MSVC x86-64 Windows with
`cartesian-recoil`. Its fixed four-worker collector retained the same 900-case order
and the same four fresh Worlds per case. The two evidence commands differed only in
their output names:

```powershell
cargo run --release -p lab --features cartesian-recoil -- tactical-mechanics --calibration --write target/smart128-calibration-a.csv --summary-write target/smart128-calibration-a.log
cargo run --release -p lab --features cartesian-recoil -- tactical-mechanics --calibration --write target/smart128-calibration-b.csv --summary-write target/smart128-calibration-b.log
```

Both CSVs are byte-identical: 309,770 bytes, 901 lines, SHA-256
`6e892f830c915d86ab88980832dc9daf82921c44842f9cc6b2d41de88c813a8a`.
Both summaries are byte-identical: 3,407 bytes, 7 lines, SHA-256
`1a5c905437276800b4ce1d7866f836ee315ede0f726da9354cd9694cb0a15afe`.
Run A reached its complete artifacts about 40 minutes 51 seconds after invocation;
the orchestration path did not preserve its direct process exit. Run B exited zero in
1,593.3 seconds. Complete equal artifacts, rather than the unavailable A exit, are
the determinism receipt.

The earlier serial attempt at commit `a2ad795` used:

```powershell
cargo run --release -p lab --features cartesian-recoil -- tactical-mechanics --calibration --write target/smart128-calibration-a.csv --summary-write target/smart128-calibration-a.log
```

It reached its external timeout at 1,800.0 seconds with exit status 124 and produced
no final summary, CSV or retained log. It therefore supplied no Tactical or validity
counts. That was an operational process timeout, not a World tick-limit outcome. The
old 5--15 minute estimate is superseded: the completed bounded runs took 26 minutes
33.3 seconds and about 40 minutes 51 seconds. A future identical rerun should budget
at least 45 minutes per process while retaining the 3,600-second hard timeout.

### Frozen result

The summaries agreed on `invalid-stop-before-held-out`: 688 of 900 rows had at least
one structural failure. Brackets drifted in zero rows; ambiguity was also zero in
every split. Every submission-refusal, cap-hit and energy-excess count was zero for
held, reference and Tactical arms. The remaining exact structural counts were:

| split | cases | invalid | reference missing | reference uncrossed | held inertness invalid | held solver | reference solver | Tactical solver | Tactical unattributed | Tactical cross-order |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| total | 900 | 688 | 482 | 515 | 14 | 198 | 198 | 230 | 70 | 36 |
| canonical / Fighter | 225 | 188 | 130 | 155 | 3 | 25 | 25 | 53 | 21 | 11 |
| canonical / Brute | 225 | 173 | 130 | 130 | 0 | 50 | 50 | 62 | 14 | 7 |
| mirrored / Fighter | 225 | 173 | 119 | 124 | 5 | 75 | 75 | 53 | 21 | 11 |
| mirrored / Brute | 225 | 154 | 103 | 106 | 6 | 48 | 48 | 62 | 14 | 7 |

These are per-cause row counts, not disjoint partitions. Categories overlap within
and across the reference, held and Tactical arms and must not be summed to reconstruct
the 688-row invalid union.

The separately reported productivity sidecars were:

| split | reference meaningful | Tactical unique crossing/contact/dissipation | Tactical cut-or-thrust plus matching integrity |
|---|---:|---:|---:|
| total | 268 | 140 | 152 |
| canonical / Fighter | 62 | 30 | 34 |
| canonical / Brute | 50 | 40 | 42 |
| mirrored / Fighter | 74 | 30 | 34 |
| mirrored / Brute | 82 | 40 | 42 |

These numerators are not pass rates: the predeclared contract permits productivity
interpretation only after structural invalidity reaches zero. It did not, so no
productivity verdict or threshold comparison is valid. The failures also cross the
reference, held and Tactical arms, so this result does not select a policy retune or
a mechanics change.

The held-out stationary range and moving 100-fight competence gate were not run. No
registered hash moved, `ARTICULATED_HASH` remains absent, and neither feature
promotion nor training is authorized. The next work is a separately planned diagnosis
of the frozen missing/crossing, held/reference solver and Tactical attribution
failures; it is not tuning against these 900 rows.
