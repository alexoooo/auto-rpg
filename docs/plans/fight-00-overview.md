# The embodied fight -- overview

**Status:** live roadmap. This is the topic the repository is currently working on, and
it is the successor to `v2-00-overview.md`, which was retired once every implementation
session it indexed had landed.

The goal, in the owner's words on 2026-08-18: **a reasonably played AI fight in the
browser under the embodied system, and no legacy cruft left around it.** Those are one
topic and not two, because the cruft is in the way of the fight -- the only code in this
repository that can aim a blade at a body is typed to the model that is being deleted,
and deleting it in the wrong order throws it away.

## The measurement this plan starts from

The plumbing is done and is not what is missing. The dungeon route opens embodied on
both sides, stance is published and the client consumes it, one hand composes with the
other, and `lab verify` holds run/re-run/replay agreement over 250 seeds.

What is missing is that the embodied AI does not fight. Measured on 2026-08-18,
`cargo run --release -p lab -- embodied --seeds 200 --mirrored`:

```text
outcomes  31 fighter kills, 2 brute kills, 0 mutual, 367 on points, 0 drawn
clock     33/400 decided by a body (8.2%), 367 reached tick 3600 (91.8%)
fights    3522.6449 ticks mean, 3600.0000 median
health    fighter ends on 0.8687 mean, brute on 0.6021 mean
contacts  816852 resolutions, 6366 cap hits
guard     attack x guard [[7537, 7002, 0], [0, 7222, 6873], [6643, 0, 7523]],
          diagonal 52.06% of 42800 commanded pairs
blows     332 severances, worst tick took 16.3432 health
seed 0    3600 ticks, Decision(Heroes), 2757 contacts
```

At 60 Hz the median duel is **sixty seconds of continuous contact with no result**.
Seed 0 makes 2,757 contacts and is still decided on points. The Brute sheds 40% of its
health per minute, so the expected time to a body is about two and a half minutes.
Watched in a browser that is two mannequins vibrating at each other.

The cause is not a tuning deficit, and `embodied_script.rs` says so in its own header:
*"the phase is `tick % 120`, the heights are two clocks."* The guard height is literally

```rust
// crates/policy/src/embodied_script.rs, in the height pair
HEIGHTS[(((obs.tick + GUARD_LEAD_TICKS) / EMBODIED_HEIGHT_TICKS) % 3) as usize]
```

-- **it never looks at the incoming blow.** The 52.06% diagonal is the arithmetic of two
clocks half a step apart, not a fighter reading a swing. And the file is honest about
why: it says outright that it does not tune, because there was no embodied corpus to
tune against on the day it was written. It existed to make the corpus possible. It did
that, the corpus now exists, and this topic is what the corpus was for.

Three smaller measured facts the sessions below act on -- the third arrived with
session 03 and was not here when the first two were written:

- **The one term that was supposed to be clever measured negative.** `--high-ground`
  returns 759 seeking wins against 839 level over 1,600 trials, a margin of -5.00
  percentage points, doubly witnessed across both side assignments. It is still switched
  on in the shipped script. [The corpus record](../performance/embodied-corpus-and-high-ground.md#the-result)
  owns that result.
- **No observation carries a wall, a floor plan or a navigation channel.** Fine for a
  duel on an open fixture; a real limit in a dungeon room with props, and named here so
  that no session below is surprised by it. [Navigation and visibility](../design/navigation-visibility.md)
  owns what it would take to give that channel a reader.
- **No policy can tell an approaching body from a receding one**, which session 03
  measured while trying to build the gate its own rule 1 asked for. The velocity channel
  is published and unreadable at these fixtures' perception: the noise on
  `ObservedOpponent::body_velocity` is 2.3x to 3.0x the entire range of closing speed the
  Fighter and the Brute can produce between them, and the sign of a recomputed closing
  term agrees with ground truth 51.59% of the time.
  [The measurement](../performance/embodied-tactical-policy.md#nothing-published-can-tell-an-approach-from-a-retreat)
  and [what a readable channel would take](../design/navigation-visibility.md#the-velocity-channel-exists-and-cannot-be-read)
  are both written down. **Session 04 is the one this bears on** -- footwork and measure
  discipline are exactly the decisions that want a closing judgement -- and it must hold
  measure off range and stance rather than adding a perception channel, which this topic
  forbids.

## The ordering trap, which is the whole of the plan's shape

`crates/policy/src/articulated_tactics.rs` was 1,803 lines of region-targeted strike
planner when this was written and is 2,403 now, sessions 03 and 04 having added the
footwork parameterisation and its bounding tests. It translates the observed weapon by
the commanded hand displacement and then asks **the same fixed-point swept geometry the
contact phase asks** whether that capsule can cross a named `BodyPart`. It is the only
code in this repository that aims.

It is typed to `ArticulatedPolicy`, and the retired `embodied-10` plan -- the one this
topic supersedes -- listed it for deletion under the condition *"once `embodied_script.rs`
covers what they were driving."* **That condition is unmet and nothing checked it.** The
embodied registry holds three entries: stand still, the clock, and the clock with one
term switched off. None of them aims.

The browser makes the same point from the other side. `#/arena` already renders a
competently played fight -- it runs `TacticalArticulatedPolicy::controlled_robust_strike`
-- and the dungeon route renders the clock. The good policy and the good model are on
opposite sides of the deletion.

So: **the port comes before the subtraction.** Sessions 02 through 04 build an embodied
fighter that aims and guards; session 05 is the deletion, and it is cheap once nothing of
value is inside it. Reversing those two is the one mistake this plan exists to prevent.

## Session order

| session | lands | depends on |
|---|---|---|
| [01](fight-01-the-dead-columns-and-the-dead-code.md) | the state stream loses the columns no jointed body writes; thirty dead-code warnings go with them | none |
| [02](fight-02-the-blow-that-is-aimed.md) | **landed 2026-08-18** -- `EmbodiedPolicyKind::Tactical`, the strike planner ported to the torso frame; beats neutral, loses to the script, [measured](../performance/embodied-tactical-policy.md) | none; 01 is independent |
| [03](fight-03-the-guard-that-watches.md) | **landed 2026-08-18** -- the guard reads the incoming weapon instead of a clock; `EmbodiedPolicyKind::TacticalFixedGuard` is its control. Guard diagonal 69.68% against a preregistered 70%: recorded [`revise`](../performance/embodied-tactical-policy.md#session-03-the-guard-that-watches) | 02 |
| [04](fight-04-the-fight-that-ends.md) | **landed 2026-08-19** -- footwork and measure on `Footwork`, the ground term never ported, `lab embodied --footwork` so the sweeps are reproducible; **all four preregistered rows `revise`**, and two of them recorded as [not reachable by a policy](../performance/embodied-tactical-policy.md#the-finding-two-of-the-four-rows-are-not-reachable-by-a-policy) | 03 |
| [05](fight-05-the-articulated-model-is-deleted.md) | `CombatModel::Articulated` and everything typed to it | 04 |
| [06](fight-06-the-names.md) | `Articulated` drops out of every surviving name; `CommandGrammar` collapses | 05 |
| [07](fight-07-the-browser-and-the-close.md) | the studio opens on the new fighter; docs folded; this plan set deleted | 06 |

Sessions 01 and 02 are independent of each other and either may go first. Everything
from 03 onward is serial.

## The measurement design, and why no policy session may move a pin

**`EmbodiedPolicyKind::Scripted` is frozen from here on.** It stops being the shipped
fighter and becomes the control, and no session below edits it. Every improvement lands
as a *new* registry entry.

That is not bookkeeping, it is what makes the sessions checkable. `EMBODIED_CORPUS_DIGEST`
folds eight seeds of both embodied fixtures in both orientations under `Scripted`. If
`Scripted` never changes then **sessions 02, 03 and 04 must not move that pin**, and a
move is a failed session rather than a number to re-record -- which is exactly the
property [the registry row](../reference/hashes.md#golden-registry) already asks of a
session that only retires another model. It also means the control and the subject can be
raced on a command that already exists:

```powershell
cargo run --release -p lab -- embodied --seeds 400 --mirrored --hero-policy tactical --monster-policy scripted
cargo run --release -p lab -- embodied --seeds 400 --mirrored --hero-policy scripted --monster-policy tactical
```

Both assignments, pooled, cancel the anatomy exactly -- the Fighter carries a sword and a
plate and the Brute a club, and they are not equal fighters -- on
[the argument the high-ground measurement already made](../performance/embodied-corpus-and-high-ground.md#why-this-is-mirrored-and-swapped-and-not-bracketed).
`--mirrored` cancels the spawn. Nothing here is bracketed, because a win rate over a
fixed seed set is a pure function of the two policies and the fixture and has no variance
to appeal to.

## What "reasonably played" is, declared before it is measured

Preregistered here so that session 04 cannot choose its threshold after seeing the
result. Measured on `embodied-duel-v1`, 400 seeds, both orientations, both assignments:

| quantity | baseline (the script) | acceptance | session 04 measured |
|---|---:|---:|---:|
| trials decided by a body | 8.2% | **at least 50%** | 0.8% -- `revise` |
| median fight length | 3600 ticks | **under 1800 ticks** | 3600 -- `revise` |
| subject wins against the script | -- | **at least 60%** | 39.69% -- `revise` |
| guard diagonal | 52.06% | **at least 70%** -- session 03 measured 69.68% and recorded `revise` | 65.86% -- `revise` |

A session that misses a row records `revise` with the matched evidence and **does not
weaken the threshold, enlarge the policy or promote the fighter after seeing the
result.** Session 04 missed all four and did none of those things. The first row it
missed by a factor of 62 -- 0.8% against 50% -- and the second by a factor of 2, since
3,600 ticks is twice the 1,800 the row asks for; this entry read "the first two rows it
missed by a factor of eight", and eight is neither of those, it is the ratio of health
removal the record's own arithmetic section is about.
[The record](../performance/embodied-tactical-policy.md#the-finding-two-of-the-four-rows-are-not-reachable-by-a-policy)
carries the argument that says no policy on this fixture reaches those two rows --
**the frozen script itself removes 0.394 of a bar from the body that has to reach zero,
where half the trials ending needs a mean of at least 0.5.** That is the discipline the
retired hierarchical-ai plan set was written under and it is worth keeping.

The fifth acceptance is not a number: session 07 puts the fighter in front of the owner
at a foreground browser, and only the owner's judgement closes the topic. A green corpus
is evidence, not acceptance.

## Constants introduced

Named here so that a later session cannot quietly invent a second spelling. Every value
is a placeholder until the session that owns it produces a sweep, and the repository rule
that a constant carries its provenance -- **and a test that bounds it from both sides** --
applies to all of them.

```text
TACTICAL_EMBODIED_POLICY_CODE     3    landed 02; the registry entry, append-only after scripted-level
FIXED_GUARD_EMBODIED_POLICY_CODE  4    landed 03; the guard measurement's control
GUARD_READ_DEADBAND_RAW       3_277    landed 03; 0.05 of standing height, and two ticks of
                                       ARM_LINEAR_MAX_SPEED_RAW to within one raw unit
GUARD_COMMIT_TICKS               13    landed 03; the ticks `chase` needs to carry a hand one
                                       band. The placeholder here read 12 and was one short
GUARD_EFFORT                    1.0    landed 03; full, where the script's guard asks a half,
                                       because this one is asked to arrive inside the window
GUARD_ARC                     8_192    landed 03; an eighth turn, the same arc the script uses
REST_REACH        ARM_MIN_REACH_RAW    landed 03; where an *empty* guard hand sits, which is
                                       half of every body in the corpus
MEASURE_MARGIN_RAW           32_768    landed 04; a half, the standoff the feet hold outside
                                       strike measure. Configuration on `Footwork` rather than
                                       a `const`, because `StrikePlanner` drives two seams and
                                       only the embodied one was retuned
MEASURE_MIN_FRACTION_RAW     52_428    landed 04; four fifths, clear of both fixture bodies'
                                       own resting blades and inside the band the measure
                                       gate leaves a commit. It read 49_152 (three
                                       quarters) until a review found the sweep had been
                                       run on a ratio the session plan does not name
LUNGE_SPEED_RAW              32_768    landed 04; a half of `move_speed`, the feet crossing
                                       measure during the commit. **Not on this list before**,
                                       and it is the one change of the four that moved the
                                       diagnosis metric
UNWIND_TWIST_RAW             57_344    landed 04; seven eighths, `embodied_script.rs`'s own
                                       threshold copied for `embodied_guard.rs`'s reason
COMMIT_MIN_OPENING_RAW           --    **not landed.** Session 04 measured the lever it sits on
                                       pointing the wrong way and recorded that instead
```

`Footwork::ARTICULATED` carries the planner's own pre-session-04 numbers -- a standoff of
1/10, a floor of 3/5 and no lunge at all -- and is a frozen control rather than a default
worth improving: `#/arena` renders a fight driven by it, and every pinned articulated
measurement was taken with it. Session 04 proved the split by re-running the articulated
corpus at `44b05d4` and comparing bytes rather than by arguing from the type.

**Three of session 03's constants were not on this list and shipped with no bounding test at all**, which
is the rule above being broken rather than a gap in it. They are `embodied_guard.rs`'s
own spellings of three constants `embodied_script.rs` already had -- copied rather than
imported, deliberately, because the script is the frozen control and this policy's
constants must not become casualties of whatever happens to it -- and a copied constant
is still a constant introduced. All three were mutated in both directions on 2026-08-18
with nothing in the workspace failing; each now carries a two-sided test, named in
[session 03](fight-03-the-guard-that-watches.md#tests).

## Hash expectations

State these before editing; a moved hash is normally a bug.

**Sessions 02, 03, 04 and 07 move nothing.** Not one pin. Every one of them is additive
against a frozen control, and the argument is in the measurement-design section above.

**Session 01 moves two pins and owns both.** `EMBODIED_CORPUS_DIGEST` and
`EMBODIED_GOLDEN_DIGEST` are state-hash folds and the session rewrites the state hash.
Nothing else may move -- in particular `ARTICULATED_STREAM_DIGEST` is the *published* pose
bytes and has no legacy column in it, and the four scenario fingerprints are
`Scenario::fingerprint` and do not read world state at all. The claim that has to be
earned is that **the fight did not change**, and it is earned by fight identity: every
non-digest column of `lab embodied --seeds 400 --mirrored` must be byte-identical across
the change.

**Session 05 moves nothing, and this is the surprising one.** Deleting a combat model does
not move a pin computed on the model that survives, for the reason embodied session 10
already demonstrated when it deleted `Legacy` and `EMBODIED_CORPUS_DIGEST` agreed to the
byte. The `articulated-duel-v1` fingerprint is *deleted* with its fixture rather than
moved, and joins the retired table in the registry.

**Session 06 moves nothing, and if it moves anything it is reverted rather than
re-recorded.** A rename that changes a hash is a rename that changed a byte stream.

## What this topic does not do

- **It does not train anything.** No checkpoint, no population, no promotion. The learned
  policy is typed to the articulated seam and session 05 has to decide its fate; the
  decision is recorded there and is expected to be *retire the checkpoint, keep the
  crate*, because `learn-core` builds its own columns from named fields of the
  observation and is not the thing being deleted.
- **It does not add a perception channel.** No walls, no navigation, no orders. Session 04
  may want one and must not take it; that is a separate topic with its own measurement.
- **It does not touch presentation.** The visual work owed after the 2026-08-17 production
  pass is [its own live topic](concept-production-00-overview.md).

## Verification

Every session runs the repository checklist in `AGENTS.md`. In full, for a session that
touches `crates/`:

```powershell
cargo test
cargo test -p sim --features cartesian-recoil
cargo test -p lab --features cartesian-recoil
cargo run --release -p lab -- embodied --corpus-digest
cargo run --release -p lab -- verify --seeds 200
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
node tools/check_docs.js
node tools/check_deps.js
node --test "client/test/*.test.mjs"
```

`node --test "client/test/*.test.mjs"` is on that list because the 2026-08-17 verification pass
omitted it and it caught a real regression the moment it was run. Do not run `cargo fmt`.
