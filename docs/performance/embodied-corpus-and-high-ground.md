# Embodied corpus and the high-ground measurement

**Purpose:** Record the embodied corpus, its registered pin, and the measured result of the elevation term — including that the term lost.
**Status:** current
**Canonical source:** this record, [`crates/lab/src/main.rs`](../../crates/lab/src/main.rs#L1882), and the `EMBODIED_CORPUS_DIGEST` row in the [golden registry](../reference/hashes.md#golden-registry)
**Update when:** An embodied fixture, the embodied script, the corpus shape, the pin, or the high-ground result changes.

**Host:** MSVC x86-64, Windows 10, AMD Ryzen 9 3950X, 32 logical cores. **Date:** 2026-08-17.

Reproduce with:

```powershell
cargo run --release -p lab -- embodied --seeds 400 --mirrored
cargo run --release -p lab -- embodied --seeds 400 --mirrored --slope
cargo run --release -p lab -- embodied --corpus-digest
cargo run --release -p lab -- embodied --high-ground
cargo run --release -p lab -- verify --seeds 200
cargo run --release -p lab -- verify --slope --seeds 50
```

Every number below is a pure function of the fixtures, the seeds and the two policies.
Nothing here is a wall-clock measurement, so nothing here is bracketed or quoted as a
range — see [the measurement design](#why-this-is-mirrored-and-swapped-and-not-bracketed).

## The corpus

Two shipped fixtures, each in its canonical orientation and in the reflection across
`y = 8` that [`lab articulated`](../../crates/lab/src/main.rs#L1882) has always run for
its second orientation.

| fixture | canonical | mirrored |
|---|---|---|
| `embodied-duel-v1` | `0x1a1e8e74eecd55d5` | `0x95b6b5f9bc80865d` |
| `embodied-slope-v1` | `0xf49de9a61f939163` | `0x7f09908444ffa113` |

Both canonical fingerprints are registered. **The two mirrored ones are not pins and
must never be offered as one**: a mirror keeps the fixture's name and therefore not its
fingerprint, so a run of the reflection is a run of a different scenario.

`lab embodied --seeds 400 --mirrored`, 800 trials of `embodied-duel-v1` under
`EmbodiedPolicyKind::Scripted` on both sides:

```text
outcomes  59 fighter kills, 3 brute kills, 0 mutual, 738 on points, 0 drawn
clock     62/800 decided by a body (7.8%), 738 reached tick 3600 (92.2%)
sides     fighter wins 345 canonical, 359 mirrored, difference 14 (3.50 percentage points)
health    fighter ends on 0.8706 mean, brute on 0.6059 mean
contacts  1632844 resolutions, 12599 cap hits, max energy excess raw 0 over 46 refused ticks
blocked   210574 weapon/shield (12.90% of resolutions), 1251523 weapon/body, 170747 weapon/weapon
guard     diagonal 51.95% of 86207 commanded pairs
blows     649 severances, max weapon-body energy raw 52198, worst tick took 17.1826 health
seed 0    EmbodiedV1/1 0xe17f5d050882b8a2  script 0xa2ec48e47e37848f
```

The same command with `--slope`, 800 trials of `embodied-slope-v1`:

```text
outcomes  18 fighter kills, 6 brute kills, 0 mutual, 774 on points, 2 drawn
clock     24/800 decided by a body (3.0%), 776 reached tick 3600 (97.0%)
sides     fighter wins 358 canonical, 359 mirrored, difference 1 (0.25 percentage points)
health    fighter ends on 0.8988 mean, brute on 0.6923 mean
contacts  1501065 resolutions, 12451 cap hits, max energy excess raw 0 over 55 refused ticks
blocked   185415 weapon/shield (12.35% of resolutions), 1158808 weapon/body, 156842 weapon/weapon
guard     diagonal 35.60% of 88190 commanded pairs
blows     356 severances, max weapon-body energy raw 66363, worst tick took 18.7661 health
seed 0    EmbodiedV1/1 0xf1777c5a450984cf  script 0x87739bf67aa9a69d
```

**The sculpted fixture's `sides` line is the strongest evidence its hill is centred
fairly.** The flat fixture splits its Fighter wins 345/359 across the two orientations
— a 3.50 point gap that is a property of the arena and not of the policy, and the same
3.50 the articulated corpus reports. The hill *narrows* that to 358/359, one duel. A
hill placed anywhere else would have widened it.

Two of these columns are worth reading against
[the articulated gate corpus](v2-articulated-gate.md), and one comparison is not
available. Contacts, cap hits and severances are comparable in kind. The win rates are
not a controlled comparison of the two models: the corpus above changes the model *and*
the policy at once, since no embodied fixture can be driven by an articulated script.

## The registered pin

`EMBODIED_CORPUS_DIGEST = 0x00e08317d7a31c7c`, defined at
[`crates/lab/src/main.rs`](../../crates/lab/src/main.rs#L1577) and asserted by
`the_embodied_corpus_digest_is_the_pinned_one`.

```text
corpus    8 seeds x 2 fixtures x 2 orientations = 32 trials, 600 ticks each, under the embodied script
fixture   0x1a1e8e74eecd55d5  embodied-duel-v1 canonical
fixture   0x95b6b5f9bc80865d  embodied-duel-v1 mirrored across y=8.0000
fixture   0xf49de9a61f939163  embodied-slope-v1 canonical
fixture   0x7f09908444ffa113  embodied-slope-v1 mirrored across y=8.0000
digest    0x00e08317d7a31c7c
pinned    0x00e08317d7a31c7c  agrees
```

**It was `0x14882fb0e0f851e5` until 2026-08-18, and the four arena fingerprints
above are the reason that move is not a measurement change.** The session that
deleted the legacy columns took `hp`, `max_hp`, the submitted `command` word and
the nine-column legacy projectile block out of `legacy_core_hash`, which every
`World::state_digest` folds -- so the digest column of this report had to move
while nothing the report *measures* did. Both `lab embodied --seeds 400
--mirrored` runs below were re-captured after the deletion and every line of both
is byte-identical to the numbers on this page.

Its full ownership and re-record rule are in the
[golden registry](../reference/hashes.md#golden-registry). The short version is that it
exists so a later session that retires the legacy and articulated measurements has
something to be wrong against, and that a session which only *deletes another model*
may not re-record it.

`lab verify` is the other half of that debt, and it is a *conversion* rather than a
second mode -- **there is no `--embodied` flag and there never was**, though prose in
several documents grew one. `verify` has only ever
driven a Legacy skirmish, and run/re-run/replay agreement is a property of the replay
codec rather than of any body model, so the claim is now made over seeds under the
embodied one too — at
[`crates/lab/src/main.rs`](../../crates/lab/src/main.rs#L205). 200 seeds of
`embodied-duel-v1` and 50 of `embodied-slope-v1` are identical on re-run and exact on
replay, and the sculpted half is the only replay corpus in the repository whose floor
reaches a state hash at all.

## What the corpus says about fight quality

The rows above were recorded to register a pin and to price one term. Read for a different
question -- *is this a fight worth watching* -- they answer no, and the answer is load
bearing enough to state here rather than leave to be re-derived.

Re-measured on 2026-08-18 at 200 seeds by two orientations, which is half the corpus above
and agrees with it:

```text
clock     33/400 decided by a body (8.2%), 367 reached tick 3600 (91.8%)
fights    3522.6449 ticks mean, 3600.0000 median
contacts  816852 resolutions, of which 626361 weapon/body
blows     332 severances, max weapon-body energy raw 45760
health    fighter ends on 0.8687 mean, brute on 0.6021 mean
guard     diagonal 52.06% of 42800 commanded pairs
seed 0    3600 ticks, Decision(Heroes), 2757 contacts
```

**At 60 Hz the median duel is sixty seconds of continuous contact with no result**, and the
expected time to a body is about two and a half minutes.

The diagnostic column is `weapon/body`, not the win rate. 626,361 weapon-on-body facts over
400 trials is **1,566 per trial**, and between them they take about 0.40 of the Brute's
health -- a shade over a ten-thousandth of a health point each. The bodies are not failing
to reach each other. They are standing inside each other and rubbing. Damage is kinetic
energy, so a blade at nearly zero relative speed does nearly nothing however often it
touches, and the occasional real blow (`worst tick took 16.3432 health`) is drowned in
noise.

The `guard` row is the second half and is the one most likely to be misread. 52.06%
diagonal against a 33% floor looks like a defence that works. It is not: the guard height
is a clock, `HEIGHTS[((tick + GUARD_LEAD_TICKS) / HEIGHT_TICKS) % 3]`, which never reads
the incoming blow, and three of the nine cells in the table are structurally unreachable --
`GUARD_LEAD_TICKS` in `embodied_script.rs` carries that arithmetic and says so.

None of this contradicts the corpus's purpose. `embodied_script.rs` states in its own
header that it does not tune, because no embodied corpus existed to tune against when it
was written; it existed to make one possible. This section is the baseline that a policy
which actually plays gets measured against, and the forward work that does so is
[the embodied fight plan](../plans/fight-00-overview.md).

## The high-ground measurement

`lab embodied --high-ground`, at
[`crates/lab/src/main.rs`](../../crates/lab/src/main.rs#L1997). The subject is
`EmbodiedScriptConfig::SEEKING` and the control is
[`EmbodiedScriptConfig`](../../crates/policy/src/embodied_script.rs#L259)`::LEVEL`,
which is the same script with the elevation term switched off so completely that the
body never stores a floor height.

### Why this is mirrored and swapped, and not bracketed

A win rate over a fixed seed set is a pure function of the two policies and the
fixture. It is byte-reproducible, so running it in three pinned processes would print
the same number three times while implying a variance that does not exist. Bracketing
`control → subject → control` inside a round is the protocol for a wall-clock number
that swings two to three times run to run, and copying it onto a deterministic
measurement would make this look more careful and say less.

What a deterministic corpus does need is a control on every quantity it would otherwise
measure alongside the term, and there are two:

- **The mirror**, on the arena. The two policies sit at different spawns, so a single
  orientation measures the spawn. `embodied-slope-v1` is centred so that all four spawn
  tiles are the same 29 squared units from the summit, which is what makes the
  reflected half a control rather than a second sample — and the 358/359 split above is
  that property measured rather than assumed.
- **The side swap**, on the bodies. The Fighter carries a sword and a plate, the Brute
  a club, and they are not equal fighters. A single assignment would measure the
  anatomy as well as the term. Running both assignments and pooling the seeking side's
  wins cancels it *exactly*: if the term did nothing, both assignments would reproduce
  the both-seeking control and the two pooled counts would be equal by construction.

The third arm — the same corpus with the term on both sides — takes no part in the
comparison and is run anyway, because it is what says whether a gap of *n* duels is
large or small on this fixture.

### Attribution

The reading of the margin depends entirely on the claim that a difference on the hill
is the elevation term and can be nothing else. That claim is measured inside the same
command rather than asserted beside it:

```text
attribution  32/32 flat trials byte-identical with the term on and off
```

Sixteen seeds by two orientations of `embodied-duel-v1`, with the term on one side and
with it on both, compared on the state digest *and* on the submitted command stream. A
term that moved a command the world then clamped back would agree on the state and
still not be inert, so both are checked.

### The result

400 seeds by 2 orientations by 3 arms, 2,400 trials:

| arm | fighter wins | fighter kills | brute wins | brute kills |
|---|---:|---:|---:|---:|
| fighter seeks, brute level | 686 | 32 | 112 | 7 |
| brute seeks, fighter level | 727 | 60 | 73 | 4 |
| both seek (control) | 717 | 18 | 81 | 6 |

Pooled over the two asymmetric arms, 1,600 trials:

```text
term         seeking 759 wins, level 839 wins over 1600 trials, margin -80 (-5.00 percentage points)
verdict      the high-ground term loses 80 more duels than it wins
```

**The term lost.** The acceptance criterion — *a policy that seeks the high ground must
beat the same policy with that term disabled* — is not met, and the result is not close
to even: five percentage points against, on a deterministic corpus with no variance to
appeal to.

It is also doubly witnessed rather than carried by one arm. Read against the
both-seeking control, the side carrying the term loses ground in *both* assignments and
by almost the same amount: the Fighter falls 717 → 686 when it alone seeks, and the
Brute falls 81 → 73 when it alone seeks. The two deviations are 39 below and 41 above
the control's totals, which is the symmetry the pooling predicts.

### Which is wrong, the term or the criterion

The term. The same command measures where the two configurations actually stood:

```text
elevation    16 seeds x 2 orientations x 2 assignments, mean floor: seeking 0.2646, level 0.2610
             peak floor reached: seeking 0.7500, level 0.7500  (the summit is 0.7500)
             ticks spent off the flat: seeking 55.1%, level 54.6%
```

The seeking side does end up higher, in the right direction, on both statistics — and
by almost nothing. `0.0036` of mean floor height is **0.5% of the fixture's entire
relief**, and half a percentage point of time off the flat. Both configurations reach
the summit at some point across the sample, so the peak column does not discriminate at
all.

So this measurement did not test the criterion. It tested a policy that pays a tactical
price — walking somewhere other than at its opponent — and buys essentially no
elevation with it, which is a finding about
[`EmbodiedScriptConfig`](../../crates/policy/src/embodied_script.rs#L259)`::SEEKING`
rather than about whether height helps.

**The likeliest reason is the fixture, and it is visible in the same three lines.**
Both sides already spend about 55% of the fight off the flat. The hill is centred
between the two spawns — deliberately, so that neither body starts nearer it — which
means the summit sits exactly where two closing bodies meet. Closing *is* climbing on
this arena whether a policy meant it or not, so there is very little marginal elevation
left for a term to seek, and what the term can still do is perturb the approach.

That reading was testable, and it was tested rather than left as a likeliest reason.

## The second fixture: high ground that is a detour

`Scenario::embodied_knolls` puts two stepped knolls on the perpendicular bisector of
the two spawns, one either side of the line the bodies close along. Every spawn is the
same distance from both summits canonically, and in the mirrored orientation each body
has the same near knoll and the same far one — a single knoll cannot have both
properties, because the only point equidistant from all four spawns is the midpoint,
which is the fixture above.

The same command runs the same three arms on it:

```text
term         seeking 793 wins, level 807 wins over 1600 trials, margin -14 (-0.88 percentage points)
verdict      the high-ground term loses 14 more duels than it wins
sampling     split-half margins -2 and -12 over 200 seeds each -- both halves agree in sign
elevation    16 seeds x 2 orientations x 2 assignments, mean floor: seeking 0.0624, level 0.0577
             ticks spent off the flat: seeking 16.9%, level 16.3%
```

**Most of the five points was the fixture.** Moving the high ground off the approach
takes the margin from −80 to −14, which is the size of the artifact the first fixture
was measuring. What survives is a small, consistent loss — and the elevation diagnostic
says why it survives: even here the seeking side spends 16.9% of the fight off the flat
against the control's 16.3%. Six tenths of a point. **The term still barely goes uphill,
and now it is not the arena carrying it there.**

### Determinism buys exactness, not significance

The split-half line is new and it is the control the plan's own correction missed. That
correction — *this is deterministic, so do not bracket it* — is right about variance
between runs and answers the wrong objection. Nothing here varies between runs; what
varies is the **sample**. Four hundred seeds are four hundred fights drawn from the
space of all of them, and a margin whose two halves disagree in sign is a margin inside
its own sampling spread.

Both fixtures' halves agree in sign, so both margins are real as far as this corpus can
say. The −14 is close: its halves are −2 and −12, so a different four hundred seeds
could plausibly have printed a smaller number, and it should be read as *the term does
not pay for itself* rather than as a measured cost of fourteen duels.

## The third fixture: does height help at all?

Neither measurement above can answer that, and it took two fixtures to see why. Both
run a policy that *seeks* height against one that ignores it, so a loss is consistent
with two different worlds: one where the term is bad, and one where height is worth
nothing and no term could have paid for it. The diagnostic separates "did it go up"
from "did going up help" and says the seeking side barely goes up, which leaves the
second world entirely unmeasured.

`Scenario::embodied_ledge` takes the choice away. The arena is a terraced plateau on
one side and a floor on the other, one spawn on each, and **both bodies run the same
policy** — so the only difference between them is the ground under their feet. Wins are
counted by the spawn a body started on rather than by its faction, and the spawns are
exchanged as well as mirrored, so each anatomy fights from each side.

```text
advantage    400 seeds x 2 orientations x 2 spawn assignments = 1600 trials of embodied-ledge-v1
term         plateau 729 wins, floor 71 wins over 1600 trials, margin +658 (+41.12 points)
control      0x1a1e8e74eecd55d5 embodied-duel-v1 -- west 704 wins, east 96 wins, margin +608 (+38.00 points)
verdict      standing higher is worth +50 duels (+3.12 points) once the side of the room is taken off
sampling     plateau split-half +336 and +322, flat +304 and +304 -- both halves of the measurement agree in sign
```

**The raw number is +41 points and the answer is +3.** The ledge runs down `x`, so the
body on the plateau is also the body on the left — and the flat control says the body
on the left wins 38 points' worth of duels on ground with no height in it at all.
Without that control this record would have reported that elevation is worth forty-one
percentage points, wrong by more than an order of magnitude, in a table that looked
like a measurement.

So: **height helps, by a little.** Three points, consistently signed across both halves,
on a corpus where the body that has it did not have to walk anywhere to get it.

### The flat control found something else

A 38-point advantage to the western spawn on a *flat*, symmetric arena is not a small
oddity. The two spawns are `(7, 6)` and `(17, 10)`: seven tiles from the west wall and
seven from the east, six from one long wall and six from the other — a 180-degree
rotation about the arena's middle maps each onto the other. Nothing about the floor
plan prefers either.

What prefers the west one is the *facing*. Every body spawns at `Angle::ZERO`, which is
due east, and the fixture puts one body east of the other. The western fighter therefore
starts looking at its opponent and the eastern one starts looking away, and the eastern
one spends the opening of every fight turning around.

This is inherited from `Scenario::articulated_duel` and it is not new; what is new is
that anything measured it. `lab articulated` reports its sides across orientations,
which mirrors `y` and leaves the facing untouched, so its 285/299 split has never
isolated this. Two consequences, and only the second belongs to this record:

- Any embodied measurement that compares the two spawn *positions* must carry the flat
  control this one does. A raw position split on any fixture is a facing measurement
  with a small terrain term inside it.
- Whether the fixture should be corrected — spawning each body facing the other — is
  not this session's call. It would move `embodied-duel-v1`, `embodied-slope-v1`,
  `EMBODIED_CORPUS_DIGEST` and every embodied number in this document, and the
  articulated fixture shares the defect and its own pinned corpus.

## Where this leaves session 04's acceptance criterion

The criterion was *on a sculpted corpus, a policy that seeks the high ground must beat
the same policy with that term disabled*. It is **not met**, on either sculpted fixture.

But the criterion was a proxy for the question that mattered — was elevation worth
building? — and it is a poor one, because it fails identically whether height is
worthless or whether the policy is simply bad at seeking it. Measured directly, height
is worth about three points and `ScriptedEmbodiedPolicy`'s elevation term captures
essentially none of it. The mechanic is sound; the term is not.

What is deliberately **not** done here is tuning the term until the number comes out.
That would be fitting a policy to a corpus, one step removed, and the first thing lost
would be this record's ability to say anything.

## What would invalidate these numbers

- **Any edit to `Scenario::embodied_duel` or `Scenario::embodied_slope`.** Both are
  named here by fingerprint; a moved fingerprint means the corpus above is a corpus of
  something else. The hill's radius bands and its centre tile are the sensitive part —
  a hill moved off `(12, 8)` breaks the equidistance the mirror control depends on.
- **Any edit to `ScriptedEmbodiedPolicy` or `GroundSense`.** The subject and the
  control are one type with one flag, so a change to either reaches both arms and the
  whole comparison at once.
- **Any change to embodied mechanics in `crates/sim`** — stance, terrain sampling, the
  elbow, the contact solver. `EMBODIED_CORPUS_DIGEST` is the cheap detector for this
  and will move first.
- **A change to what `Outcome::winner` returns for `Outcome::Decision`.** 97% of these
  fights are decided on points, so the win counts above are overwhelmingly a statement
  about the scoring rule and not about kills. The kill columns are printed beside them
  for exactly that reason.
- A different host does **not** invalidate them. There is no wall clock in any figure
  above except the run times, and the simulation is fixed point throughout.

## A defect found while measuring, not fixed here

[`script_digest`](../../crates/policy/src/articulated_script.rs#L995) skips every
`SubmittedCommand::Embodied` record and says nothing. Its loop keeps only the
`Articulated` arm, and its doc comment accounts for the skipped case as `Legacy`, which
"cannot occur". `Embodied` occurs on every record of every embodied run, so the
function counts zero records and returns the empty-stream constant
`0x89b684347e2caedd` — the same number for the script, for the control, and for a
matchup running a different policy on each side.

It was found only because three tests in `crates/lab` were written against it and all
three failed on their first run. Until then the embodied corpus printed a `script`
column that looked like a fingerprint and was a constant.

The embodied corpus therefore digests its own stream under its own domain,
`ARPG-EMBODIED-SCRIPT-V1`, over `EmbodiedCommandV1::payload_bytes` and otherwise byte
for byte the same grammar. **The repair belongs in `crates/policy`** — teaching the
existing function its third arm — and was deliberately not taken in the session that
registered the pins above, whose whole job was to record numbers that hold still.
