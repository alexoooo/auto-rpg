# Smart134 -- split the tunnelling metric, then re-decide arm slew

**Status:** landed 2026-08-15. Stages 1 and 2 are complete; the arm bearing pair is
`2_184`/`364` and every gate is green. It is the first Smart session since 128 whose
purpose was to make a blow land rather than to name a word.

**What shipped, and the one number that matters:** the windmill control went from
3.0% of duels decided by a body to **96.5%**, clearing the mechanical gate's "fewer
than 10% reach the clock" criterion that no configuration had ever met. Severances
went 31 to 471. The controlled Arena preset's cut energy went 35 to **508** against
the 133 it was first recorded at. `ARTICULATED_STREAM_DIGEST` moved once, paired and
predicted, from `0xdbbd86fedd61c4c7` to `0x2fac296932b97439`; **no other registered
pin moved, and none was re-recorded to accommodate the change.**

**What did not ship:** a repair to the composed script. Both candidate repairs turned
out to be coupled to the learned model -- phase length through `CYCLE_TICKS`'s clock
feature, chamber reach through the `Posture` action head -- so there is no zero-cost
fix and it belongs in a plan of its own. The full dose-response sweep is recorded in
the [tactical policy record](../performance/smart-ai-tactical-policy.md). The Arena
default moved from `composed` to `attack-moves` so a first look does not open on the
one script measured to be worst at landing a blow.

**The collateral, and how it was handled.** Doubling the pair broke 20 default tests
and ~29 feature-gated ones, all of the same kind: research fixtures that drove a live
world at whatever the production rate happened to be, captured a configuration, and
froze numbers from it. They were repaired by **pinning the fixtures to
`CAPTURED_ARM_RATES = (1_092, 182)`**, not by re-recording -- a fixture that silently
re-aims when an unrelated tuning constant moves was never frozen, which is the actual
defect. Every pin was proved load-bearing by setting it to the new pair and watching
exactly the expected set go red. Two registered digests had gone **inert** rather than
moved -- `exact_trajectory_state_digest()` returning `0` and `lifted_receipts()`
returning `None`, because the swing now lands 7 ticks early and dissipates 985 where
the frozen row is 278 -- and pinning restored both to their existing values exactly.

**Goal this serves.** Two articulated units fighting in `#/arena` where attacks
connect -- physical blade against physical body, where *what* gets hit follows from
geometry rather than from a named plan. Everything below is scoped to the first
thing standing between here and that.

## The question

Session 04's actuator calibration is the only measured lever that moved wounding
blows in the right direction, and it is parked. Its table, at 3,600 cases per
candidate:

| arm bearing max speed | wounding rows | tunnelling |
|---:|---:|---:|
| `1,092` (production) | 6 | 64 |
| `2,184` (2x) | 860 | 68 |
| `4,368` (4x) | 1,134 | 140 |
| `8,736` (8x) | 1,348 | 404 |

The decision was `revise`: "Arm slew is a real lever -- the 2x candidate turns 6
wounding rows into 860 -- but this table does not authorize changing the production
pair. The striker or its sweep attribution must first explain the wrong-region
contacts."

**That explanation is this session, and the metric is where it starts.** In
`crates/lab/src/strike_corpus.rs`, `tunnelling` is

```rust
self.tunnelling += u32::from(row.first_contact_tick.is_some() && row.first_cross_tick.is_none());
```

and `first_cross_tick` is set only by `crosses(previous, requested, target.regions[intended as usize])`
-- the *one* region the plan named. So a blade that sweeps through the torso when the
plan said head records no crossing, and every contact it makes is counted as
tunnelling. The calibration record says as much in prose -- "It includes a collision
with the wrong body region and is deliberately conservative" -- and then reads the
combined number as one regression against one bar.

Two different facts are being added together:

- **wrong region.** The blade hit a body, and the contact was attributed to a region
  other than the one the plan named. This is a striker-attribution result. For a
  region-targeted striker it is a miss; for a swordfight it is what hitting something
  looks like.
- **unexplained.** The contact was attributed to the intended region, yet the lab's
  own swept test against that region's volume says the blade never crossed it. That
  is the solver and the corpus's crossing test disagreeing about the same tick, and
  it is a real defect wherever it appears -- production slew included, where 64 of
  them already sit.

The session asks: **of the tunnelling rows at each candidate, how many are wrong
region and how many are unexplained?**

## Why this is cheap and sound

Nothing new has to be measured. Every contact already carries the region it struck:
`ContactFact` has `pub region: u8` beside its key, point and normal, and the lab
already reads those rows to fill `first_contact_tick`.

The one thing that could quietly make the split meaningless is the two region index
spaces disagreeing. They cannot: `crates/sim/src/anatomy.rs` re-exports
`AnatomyRegion` *as* `BodyPart`, so `intended as u8` and `fact.region` are the same
five-valued space (`Head = 0, Torso = 1, LeftArm = 2, RightArm = 3, Legs = 4`). A
test pins that rather than a comment claiming it, because it is exactly the
assumption whose silent drift would turn this whole measurement into noise.

## Pin budget

**Zero registered hashes move in stage 1.** The change is confined to
`crates/lab/src/strike_corpus.rs`, which no pin fingerprints: `LAB_HASH` names a
scenario and policy and lives in `crates/web/src/lib.rs` and `tools/wasm_check.js`.
`StrikeRow`, `CalibrationSummary`, `measure_case_at` and `calibrate_actuator` are all
private to that one file -- confirmed by grep, not assumed -- so nothing outside it
observes the new fields.

`print_row` is **not** touched. It emits the per-row CSV that the predeclared Smart39
`--strike-corpus` corpus reads, and a new column there would change bytes a corpus
compares. The new counters are emitted only by `calibrate_actuator`, whose CSV header
already changes with its own table.

Stage 2 moves a production constant and is separately gated; see below.

## Stage 1 -- the split

Add the struck region to the row, in `measure_case_at`, at the existing contact loop.
Capture it on the same resolution that first sets the tick, before the insert:

```rust
for resolution in world.contact_resolutions().iter()
    .filter(|row| attacker_contact(row, attacker, intended_hand)) {
    if first_contact_tick.is_none() {
        first_contact_region = Some(resolution.fact.region);
    }
    first_contact_tick.get_or_insert(world.tick());
    closure_energy = closure_energy.max(resolution.energy.before_raw);
    wound_energy = wound_energy.max(resolution.cut_raw.saturating_add(resolution.thrust_raw));
}
```

Carry it on `StrikeRow` as `pub first_contact_region: Option<u8>`, and split the
counter in `CalibrationSummary::add`. The three counters are exhaustive over the
tunnelling rows by construction, which is the property worth asserting:

```rust
let missed_intended = row.first_contact_tick.is_some() && row.first_cross_tick.is_none();
let struck = row.first_contact_region;
self.tunnelling += u32::from(missed_intended);
self.wrong_region += u32::from(missed_intended
    && struck.is_some_and(|region| region != row.intended_region as u8));
self.unexplained += u32::from(missed_intended
    && struck.is_some_and(|region| region == row.intended_region as u8));
```

Emit `wrong_region` and `unexplained` as two new columns beside `tunnelling` in
`calibrate_actuator`'s header and row.

### Tests

In `crates/lab/src/strike_corpus.rs`'s existing `mod tests`:

- `the_intended_region_and_the_struck_region_share_one_index_space` -- asserts
  `BodyPart::ALL[n] as u8 == n as u8` across all five and that `BodyPart::COUNT`
  equals `AnatomyRegion::COUNT`. This is the assumption the split rests on.
- `every_tunnelling_row_is_either_wrong_region_or_unexplained` -- builds
  `CalibrationSummary` over hand-made rows covering all four combinations of
  contact/crossing, and asserts `wrong_region + unexplained == tunnelling` and that a
  row with no contact contributes to none of the three.
- `a_contact_on_the_intended_region_without_a_crossing_is_unexplained` -- the one
  case that must not be allowed to hide inside `wrong_region`.

The mirror test at the bottom of the file already compares whole `StrikeRow` values
under reflection; the new field rides that assertion and should mirror unchanged,
since a head is a head in both mirrors. If it does not, stop -- that is a finding.

### Command

```powershell
cargo run --release -p lab -- strike-corpus --policy striker --seeds 100 --mirrored --calibrate-actuator
```

## Stage 1 result, measured 2026-08-15

The split ran. The full table and its two corrections live in the
[actuator calibration record](../performance/smart-ai-actuator-calibration.md); the
part that decides this plan is:

| maximum speed | wounded rows | tunnelling | wrong region | unexplained |
|---:|---:|---:|---:|---:|
| 1,092 | 12 | 6 | 2 | 4 |
| 2,184 | 928 | 20 | 8 | 12 |
| 4,368 | 1,086 | 86 | 24 | 62 |
| 8,736 | 1,240 | 326 | 32 | 294 |

**The hypothesis behind this session was wrong.** The expectation was that the
tunnelling rise would prove to be wrong-region contacts, benign for a swordfight. It
is the opposite: `unexplained` is the larger bucket everywhere and the one that
scales, while wrong-region contacts stay nearly flat. The predeclared rule is what
turns that into a result instead of an embarrassment, and by its own second branch
**stage 2 does not open on this evidence**.

The published 2026-08-11 table also no longer reproduces -- tunnelling at the
production pair has fallen from 64 rows to 6, and wounded rows have risen from 6 to 12
-- so the block had been quoted for months against numbers that had stopped being
true. The lever itself is undiminished: 12 wounded rows to 928.

The baseline the goal is actually measured against, from
`articulated --seeds 100 --mirrored` on current code:

| script | decided by a body | brute end health | severances |
|---|---:|---:|---:|
| composed | 2.0% | 0.9282 | 16 |
| composed + closing footwork | 4.5% | 0.8428 | 20 |
| windmill | 3.0% | 0.6940 | 31 |

**The scripted policy is worse at producing damage than a windmill**, which is the
same result Smart115 recorded as `21/100` competence, seen from the mechanics side.
The Fighter ends every variant between `0.97` and `0.999`: that asymmetry is not a
defect, it is the shipped sword-and-board loadout blocking a club, and 23.9% of all
resolutions are weapon/shield.

### Stage 1 closed: the block is discharged

`unexplained` is an artifact of this harness, settled by re-running the same swept
primitive against the solver's own collider inputs: **372 of 372 unexplained rows are
crossings**, at every candidate. The full isolation of the two wrong inputs -- a
perception-noised region and a post-contact-clamped blade, the second of which grows
about 35x with slew and is therefore the growth mechanism -- is in the
[calibration record](../performance/smart-ai-actuator-calibration.md). `wrong_region`
is equally ordinary: 66 of 66 cross a real region, 56 of 66 cross the one the fact
names, every pair physically adjacent.

The tunnelling column therefore never contained a defect. By the first branch of the
predeclared rule, **stage 2 opens**.

### Stage 2 measured, 2026-08-15

With the pair temporarily at `2_184`/`364`, `articulated --seeds 100 --mirrored`:

| script | decided 1x | decided 2x | brute end health | severances |
|---|---:|---:|---|---:|
| composed | 2.0% | 2.0% | 0.928 -> 0.727 | 16 -> 76 |
| composed + closing footwork | 4.5% | **14.5%** | 0.843 -> 0.499 | 20 -> 144 |
| windmill | 3.0% | **96.5%** | 0.694 -> 0.013 | 31 -> 471 |

**Windmill at 2x clears the gate's clock criterion**: 3.5% reach tick 3,600 against a
bar of "fewer than 10%" that no configuration has ever met. That criterion has been
treated as blocked on mechanics since the gate failed; on this evidence it was blocked
on one constant and a metric that could not see past its own harness.

**And it splits the problem in two.** The mechanics now convert arm speed into decided
fights -- for the control script. The twelve-phase composed script converts almost
none of the same increase, staying at 2.0% while its control goes to 96.5%. That is a
policy result, not a mechanics one, and it is the same `21/100` competence finding seen
from the other side. Diagnosing that gap is the immediate successor and it does not
gate the constant.

Two honest limits on this table before anyone reads it as a finished fight:

- **It is one-sided.** The Fighter ends every 2x variant above `0.959` and the Brute
  wins nothing at all -- 193 fighter kills to 0 at windmill. Sword-and-board against a
  club is doing what it should, but a 193-0 slaughter is not yet a duel, and a
  representative gate wants an exchange rather than an execution.
- **`strike_corpus.rs` hardcodes `1_092`/`182` as its first candidate row.** Moving
  production without re-centring or annotating that ladder leaves the calibration
  table quietly describing a "production" row that is no longer production.

### What stage 1 leaves open

`unexplained` means the contact was attributed to the intended region while this
corpus's swept test saw no crossing. Before that is called a sim defect it has to be
separated from a harness artifact, because `crosses` holds the defender's region
**stationary** within a tick -- it passes the region's `lower`/`upper` as both the
previous and the requested position -- while the solver sweeps it through
`RegionSweep`'s separate previous/requested pairs. A static test is strictly weaker
than a swept one and would fail more often exactly as blades get faster and bodies
recoil harder, which is the observed shape. Settling that is the immediate successor
and it gates stage 2 in both directions:

- harness artifact: repair the crossing test, re-run, and stage 2 opens on a table
  that means something;
- sim defect: stage 2 stays shut and the defect is the next repair, with Smart133's
  swept-AABB provenance becoming directly relevant rather than incidental.

## The decision rule, predeclared

Written down before the numbers are read, because the repository has already been
caught choosing a rule after seeing its output:

- **If the 64 -> 68 increase is wrong-region and `unexplained` does not rise** -- the
  2x candidate does not make the geometry worse; it makes the striker hit a body it
  was not aiming at more often, which is the swordfight this project is trying to
  produce. The session-04 block is discharged on its own terms and stage 2 opens.
- **If `unexplained` rises with slew** -- there is a genuine swept-geometry defect
  that scales with blade speed. Stage 2 does **not** open. The session's result is
  the defect's first bounded case, and the successor repairs `crosses`/the solver
  disagreement before any constant moves. This is the outcome that would justify the
  original block.
- **If `unexplained` is already large at production slew** -- the 64 baseline rows are
  a standing defect that the calibration has been reading as a property of the
  candidate. Report it as such; it is independent of arm speed and is fixed first.

No branch authorizes reading the wounding column as a reason to move the constant.
Wounds are the *goal*, which is exactly why they must not also be the *evidence*;
"Do not select mechanics by wound/damage outcome" stands.

## Stage 2 -- the constant, if and only if stage 1 discharges the block

`ARM_BEARING_MAX_SPEED_RAW = 1_092` and `ARM_BEARING_ACCEL_RAW = 182` in
`crates/sim/src/combat/actuator.rs` are the production pair, consumed at
`integrate_arm_unbilled` as `bearing_max = bearing_max_speed_raw * agility`.

Moving them is an authoritative articulated mechanics change and is expected to move
`ARTICULATED_STREAM_DIGEST` (paired Rust and wasm) and the articulated state grammar.
It must not move any legacy golden. **State the expected set in the commit message
before running the gate, not after reading it.**

Sequence, and it is deliberately not one commit:

1. Land stage 1. Read the table. Record it in
   `docs/performance/smart-ai-actuator-calibration.md` as a correction beneath the
   existing table rather than a replacement of it -- the old reading stays visible,
   superseded.
2. Only then move the pair to `2_184`/`364`, run the full workspace and wasm gates,
   and re-record the paired digest with its reason.
3. Re-run `articulated --seeds 400 --mirrored` and report the clock-limit rate
   against the recorded 99.0%. That number, not the wounding count, is whether a
   fight now ends.

## Stage 3 -- see it

`#/arena` already runs an articulated duel in its own Worker with scrubbing, pose,
region and combat-event channels. Once a blow lands in the corpus it should land on
screen, and the arena is the check that it does. `npm run dev`, open `/#/arena`, run
the selected fight, scrub to the first contact marker.

If the arena needs a preset for this, the named `Robust Strike (controlled)` preset
is the model to copy rather than a new mechanism.

## Blocked on

**Nothing in this repository compiles on the current host.** There is no MSVC linker:
`cargo test -p fx --no-run` fails with `linker link.exe not found`, no Visual Studio
or Build Tools install exists on any standard path, `wasm32-unknown-unknown` is not
an installed rustup target, and there is no `web.wasm` or `target/release` binary to
fall back on. Every command in this plan is unrunnable until:

```powershell
winget install --id Microsoft.VisualStudio.2022.BuildTools --override "--quiet --wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
rustup target add wasm32-unknown-unknown
```

Run cargo from PowerShell rather than a Git Bash shell: Git Bash's coreutils `link`
shadows MSVC's `link.exe` and fails with `link: extra operand`, which reads as a
toolchain bug and is not one.

## What this session does not do

It does not widen a contact budget, retune the response, change the contact solver,
open the held-out gate, train, promote the feature, create `ARTICULATED_HASH`, or
touch `v2-18`. [Smart133](smart-ai-133-ordinal-31-tick-46-segment-hilt-start-x.md)
keeps its frozen authority and its stop branches and is paused, not withdrawn; if the
unexplained bucket turns out to be nonempty, its swept-AABB provenance work becomes
directly relevant again rather than incidental.

## Verification

```powershell
cargo test -p lab
cargo test
node tools/check_docs.js
git diff --check
```

Stage 2 additionally rebuilds `-p web` for `wasm32-unknown-unknown` and runs
`node --test tools/wasm_check.js`, because `crates/sim` changed.
