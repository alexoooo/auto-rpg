# Smart AI matched tactical mechanics

**Purpose:** Preserve the parameterized strong-reference/tactical calibration and its validity stop.
**Status:** current
**Canonical source:** `crates/lab/src/tactical_mechanics.rs` and `crates/lab/src/strong_strike.rs`.
**Update when:** The strong reference, tactical controller, matched scenarios, or contact-to-anatomy waterfall changes.

**Measured:** 2026-08-12, native MSVC x86-64 release build.

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
waterfall. The next calibration must have zero structural validity failures before the
held-out seed range can be opened. A visibly meaningful sword result requires at least
95% uniquely attributed crossings/contacts with nonzero dissipation and at least 90%
positive cut-or-thrust with matching regional integrity loss. Pressure is reported but
does not count as damage; open wound remains separate because thrust need not create
one. The paired held control must remain entirely inert, and both strong-reference
brackets must remain byte-identical.
The held-out command reruns the 900-case structural calibration itself and exits 2 on
any failure, so a stale prior CSV cannot authorize the decision set.
