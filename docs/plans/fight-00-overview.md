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

Two smaller measured facts the sessions below act on:

- **The one term that was supposed to be clever measured negative.** `--high-ground`
  returns 759 seeking wins against 839 level over 1,600 trials, a margin of -5.00
  percentage points, doubly witnessed across both side assignments. It is still switched
  on in the shipped script. [The corpus record](../performance/embodied-corpus-and-high-ground.md#the-result)
  owns that result.
- **No observation carries a wall, a floor plan or a navigation channel.** Fine for a
  duel on an open fixture; a real limit in a dungeon room with props, and named here so
  that no session below is surprised by it. [Navigation and visibility](../design/navigation-visibility.md)
  owns what it would take to give that channel a reader.

## The ordering trap, which is the whole of the plan's shape

`crates/policy/src/articulated_tactics.rs` is 1,803 lines of region-targeted strike
planner. It translates the observed weapon by the commanded hand displacement and then
asks **the same fixed-point swept geometry the contact phase asks** whether that capsule
can cross a named `BodyPart`. It is the only code in this repository that aims.

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
| [03](fight-03-the-guard-that-watches.md) | the guard reads the incoming weapon instead of a clock | 02 |
| [04](fight-04-the-fight-that-ends.md) | footwork and measure; the preregistered acceptance corpus; the ground term retired | 03 |
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

| quantity | baseline (the script) | acceptance |
|---|---:|---:|
| trials decided by a body | 8.2% | **at least 50%** |
| median fight length | 3600 ticks | **under 1800 ticks** |
| subject wins against the script | -- | **at least 60%** |
| guard diagonal | 52.06% | **at least 70%** |

A session that misses a row records `revise` with the matched evidence and **does not
weaken the threshold, enlarge the policy or promote the fighter after seeing the
result.** That is the discipline the retired hierarchical-ai plan set was written under
and it is worth keeping.

The fifth acceptance is not a number: session 07 puts the fighter in front of the owner
at a foreground browser, and only the owner's judgement closes the topic. A green corpus
is evidence, not acceptance.

## Constants introduced

Named here so that a later session cannot quietly invent a second spelling. Every value
is a placeholder until the session that owns it produces a sweep, and the repository rule
that a constant carries its provenance -- **and a test that bounds it from both sides** --
applies to all of them.

```text
TACTICAL_EMBODIED_POLICY_CODE     3    the new registry entry, append-only after scripted-level
GUARD_READ_DEADBAND_RAW                how far an observed weapon must move to change the guard height
GUARD_COMMIT_TICKS                     how long a read guard holds before it may be re-read
MEASURE_MARGIN_RAW                     the standoff the feet hold outside strike measure
COMMIT_MIN_OPENING_RAW                 the smallest opening the planner will spend a commit on
```

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
