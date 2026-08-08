# 2026-08 combat-mechanics evidence

**Purpose:** Preserve the measured reversals, rejected mechanics, and matchup tables that explain current combat and policy tuning.
**Status:** historical
**Canonical source:** this migrated record and the current tests linked from [Combat design](../../design/combat.md)
**Update when:** A current claim below is remeasured, superseded, or promoted into a normative test.

**Date:** Migrated on 2026-08-08 from the accumulated pre-v2 design record; the
individual experiment dates were not recorded. **Hardware:** not recorded. The
repository's pinned native-hash reference is MSVC x86-64 Windows, but the old record
does not establish that every sweep ran on that machine. Treat percentages as
historical results, not portable performance budgets.

## Method and limits

The recorded sweeps used native release-mode `lab duel`/`lab evolve` runs and the
live-world tests named by the combat document. Tables name their seed count where it
survived in the record. Later investigations used the full sixteen-pair roster and,
where stated, two fixed opponents with the worse result selected. This migration did
not rerun an old revision merely to manufacture missing metadata.

The exact percentages belong to the revision on which they were measured. Current
acceptance lives in tests and current golden hashes. The evidence is retained because
the wrong answers and reversals explain why the current mechanics have separate
knobs; it must not be used to repin a moved hash.

## Removing free blocking and per-decision hysteresis

Taking away the simultaneous free shield moved the three sheet results from
33 / 91 / 99 percent to 14 / 73 / 88. More importantly, loadout hysteresis charged
per decision produced dull 14%, capable 73%, and sharp **46%**: the sharp fighter
reconsidered more often and spent the fight swapping. `REFERENCE_PERIOD` therefore
normalizes swap pressure as a rate over time.

This preserves the finding formerly under `DESIGN.md#what-this-cost-honestly`.

## Telegraph, commitment, evasion, and time pressure

- Reconsidering every cue cancelled live windups; one implementation won only one
  duel in ten. Evolution repeatedly pushed `resolve` to its ceiling.
- Before a guard needed time to settle, increasing `read_ahead` reduced wins from
  92% to 57%. After bracing made early movement valuable, evolution selected the
  top of the range. The old negative was correct for the old mechanic.
- Evasion once evolved to zero because a miss cost the attacker nothing. Whiff
  recovery and recovery exposure made a dodge buy an exchange.
- With weak time pressure, maximum evasion/flank won 99% over roughly seventy-second
  fights while erasing the intellect/perception gradient. Fitness prices time because
  this model expresses skill through exchanges.

These are the measured reversals formerly under
`DESIGN.md#what-measurement-said-including-where-it-disagreed`.

## The historical difficulty ladder

One `DuelistPolicy`, one Fighter body, and one naive Brute were swept over 240 seeds
per row, with no draws:

| `intellect` / `perception` | decisions | noise | win rate | health it finishes on |
|---|---:|---:|---:|---:|
| 0 / 0 | every 30 | 2.25 | 18% | 0.06 |
| 1 / 1 | every 24 | 1.90 | 35% | 0.08 |
| 1 / 2 | every 24 | 1.55 | 52% | 0.16 |
| 2 / 2 | every 18 | 1.55 | 86% | 0.32 |
| 3 / 3 | every 17 | 1.20 | 90% | 0.36 |
| 8 / 6 (stock Fighter) | every 12 | 0.90 | 100% | 0.56 |
| 12 / 10 | every 8 | 0.50 | 100% | 0.61 |
| 19 / 18 | every 1 | 0.00 | 100% | 0.65 |

Momentum narrowed the ladder; physical weapons widened surviving-health separation;
body impulses added a lower rung; re-evolution moved the middle without fixing top
saturation. The table measures one matchup, not a universal difficulty curve. The
five necessary conditions were a heavy weapon completing its own line, enough health
resolution, reachable bad stat sheets, termination instead of wandering draws, and
`Advance` behaving as a patrol.

This preserves `DESIGN.md#the-difficulty-range-which-is-what-all-of-it-is-for`.

## Recoil corrections and fair rounding

Differencing the full momentum vector charged centripetal reaction every tick. At a
quarter transfer it sustained 38% of a Rogue's top speed per tick and made 98% of
Rogue mirrors draw at full health. Applying only the surviving recoil term without a
traction threshold was also unstable: coefficients 0.25 / 0.12 / 0.08 / 0.04 / 0.02
gave 41 / 96 / 89 / 94 / 95 percent against the former 98. Static friction made a
smooth swing cost no displacement while retaining the shove of a suddenly stopped
weapon.

Across the sixteen duellist-versus-naive pairings, recoil changed little except
Brute-versus-Rogue, which moved 4% to 15%. It did not make reach pay: a tangential
shove carries a crowder around the attacker rather than opening distance.

Fixed-point vector scaling also had to truncate toward zero. Flooring is not odd
symmetric, so mirrored vectors differed by a raw unit and a mirrored exchange scored
62.5671 versus 62.5717. Removing that bias exposed a genuine Rogue-mirror stalemate:
58% draws near full health. The later squared damage law resolved it to 53% wins,
0% draws, and 0.08 surviving health over 2,372 ticks. The symmetry diagnosis was
right; the eventual resolving mechanism was unexpected.

This preserves `DESIGN.md#two-things-the-recoil-model-got-wrong-first-both-measured`,
`DESIGN.md#what-it-cost-and-what-it-did-not-buy`, and
`DESIGN.md#a-rounding-bug-was-deciding-mirror-matches`.

## The squared law, the two triangles, and reach

Keeping `GRAZE_FRACTION` fixed while moving from a linear to squared energy law
widened useful dead zones by roughly a third:

| body | dead zone, linear | dead zone, energy | tip |
|---|---:|---:|---:|
| Fighter | 0.46 | 0.58 | 1.40 |
| Rogue | 0.27 | 0.37 | 0.90 |
| Brute | 0.86 | 0.88 | 2.15 |
| Skitterer | 0.29 | 0.32 | 0.70 |

That made reach pay where knockback had not. It also exposed an older spacing error.
The policy added a dead-zone leg and a body-radius leg, while `segment_circle` bills
the hypotenuse. A Rogue crowding a Fighter strikes at 0.663, not 0.350. Correcting
both distances alone changed Rogue-versus-Fighter from 18% to 99% but made every
mirror time out untouched, because the genes had been tuned against the wrong sums.

The corrected construction used `Vec2::length` for each right triangle and then
clamped against bodies touching. The old sums bound in none of the sixteen pairings;
the contact floor bound in eleven and the hypotenuse in five. A second error had
therefore hidden beneath the first: a geometrically correct floor still cannot ask
bodies to stand inside contact.

This preserves `DESIGN.md#the-squared-law-is-what-finally-made-reach-pay`,
`DESIGN.md#a-phase-3-bug-that-only-became-expensive-here`, and
`DESIGN.md#the-wrong-triangle-and-a-second-one-underneath-it`.

## Four answers to weight

Lead prediction, recoil footing, body-check, and knockback-aware guarding were built.
Lead was removed after four independent runs returned 0.000, 0.000, 0.059, 0.000.
Recoil footing survived because the observed own-drift range ran opposite intuition:

| body | body mass | weapon mass | own drift, body radii |
|---|---:|---:|---:|
| Fighter | 1.00 | 1.24 | 0.197 |
| Rogue | 0.60 | 0.86 | 0.370 |
| Brute | 2.78 | 2.23 | **0.040** |
| Skitterer | 0.36 | 1.25 | **1.634** |

The body-check stance was selected 0.0% across 130,000 decisions and only 0.6% with
its gene at maximum. Its best possible score was 0.838 against ordinary trade at
1.4: bodies are already wider than the gap in which the weapon becomes useless.
The stance was removed, while the mass-ratio percept survived for other decisions.

Knockback-aware guard was behaviorally live but harmful. At anchor values
0.46 / 1.0 / 2.0 / 3.0, Guard occupied 0.0 / 9.4 / 14.7 / 17.5 percent of decisions,
while roster wins fell 69 / 56 / 54 / 54 percent and the dull rung fell
36 / 14 / 2 / 1 percent. It remains a knob evolution correctly refused, unlike the
body-check whose ceiling could not beat trade at any tuning.

The body-check work also revealed that `Trade` ignored whether the blade could reach
past a graze. Damping trade by `bite_range` was retained even though the stance that
revealed the error was not.

This preserves
`DESIGN.md#four-things-a-fighter-was-given-to-do-about-weight-of-which-two-survived`
and `DESIGN.md#a-fifth-change-nobody-asked-for-which-the-barge-exposed`.

## Damage resolution was traded away, not disproved

The impact scaling moved from 60 to 135 when free windmilling became a phased attack:
a windmill billed repeated contacts, while a measured attack pays windup, cut, and
recovery. It then returned to 60 for resolution. At 135, a Brute could take up to 57
from a Fighter with 84 health, making “half health” and “nearly untouched” one blow
apart. At 60, a duel had enough exchanges for a bad read to leave a visible dent
rather than decide a third of the fight.

When damage became kinetic energy, `ENERGY_TO_DAMAGE` first shipped at 384. That
anchor held the Fighter's former best blow at 14.3, preserving the earlier exchange
resolution while the new law moved roster ratios around it.

The current 96 scale and `4 + vitality` health deliberately reverse part of that
choice. A Fighter is 12 health against a best blow around 3.6, roughly 0.30 of its
bar where 14.3 against 84 was about 0.17. Fights return to three or four clean
exchanges because a point of vitality is now one visible health point and a point of
power produces a readable fraction of damage. The former resolution argument was
**overruled, not refuted**: it correctly described the fixture, but the player could
not read the stat ladder it protected.

These values are historical design anchors from the migrated record, not current
acceptance constants. Current roster numbers belong to `rules` and its tests. This
preserves the damage-resolution correction formerly under
`DESIGN.md#rules-that-exist-for-termination-not-for-flavour`.

## The standoff sweep and its arithmetic correction

Opponent-relative minimum strike range replaced one global preferred distance. A
Skitterer has a narrow band in which it can reach a Brute without being reached;
a Fighter has no such band and must trade. The `standoff` gene spends distance
within geometry supplied by the observation rather than naming one absolute ring.

The gene shipped at 0.000 for two phases. Swept directly against a naive Brute over
240 duels, that apparent extreme was the best measured value:

| `standoff` | 0.000 | 0.200 | 0.400 | 0.600 | 0.800 | 1.000 |
|---|---:|---:|---:|---:|---:|---:|
| win rate | 98% | 87% | 72% | 40% | 25% | 17% |
| health won | 0.60 | 0.44 | 0.37 | 0.32 | 0.23 | 0.24 |

The result described a fighter standing in the wrong place. Both endpoints were
sums where the hit test billed a hypotenuse, putting the preferred band up to half a
body farther out. After correcting the geometry, four independent evolution runs
returned 0.23, 0.33, 0.38, and 0.49, and the policy shipped 0.25. An earlier claim
of four confirming zeroes came from passing `--seed` to a command that reads
`--master-seed`; those were one run reported four times. The sweep remains valid for
the old geometry and is retained precisely because the later diagnosis changed its
interpretation rather than its measurements.

This preserves the measured history of the answered “one `standoff` gene” question
formerly under `DESIGN.md#open-questions`.

## Cross-opponent and full-roster overfitting

Four genuinely independent runs evolved against a duellist Brute returned
`standoff` from 0.68 to 0.99, pinned `evasion` at its ceiling, and scored 100% with
0.76 surviving health. The same genomes won only 19% to 45% against the naive Brute.
The optimizer had found a counter to an opponent that reads and hesitates, not a
generally better fighter.

`lab evolve --cross` therefore plays the seed set against both fixed opponents and
returns the worse average. The minimum encodes “must clear both”; a mean would let a
rout of one opponent buy a collapse against the other. Both opponents remain fixed,
so this closes one overfitting hole and is not self-play.

The same error existed at the body level. One genome ships across the whole roster,
while a single duel scores only one pairing. `--arena roster` evaluates all sixteen
archetype pairings on every seed. With `--cross`, that is 32 times the rollouts of one
pairing. The cost was necessary: the geometry change that moved duellist Rogue versus
Fighter from 18% to 99% cost a Brute half its result against the same Fighter, and a
single-pair fitness cannot see that exchange.

This preserves the answered opponent-selection investigation formerly under
`DESIGN.md#open-questions` and the remaining reason self-play is still open.

## The post-correction matchup matrix

Sixteen duellist-versus-naive pairings used 240 seeds per cell. Rows are the
duellist body and columns the naive opponent:

| | vs Fighter | vs Rogue | vs Brute | vs Skitterer |
|---|---:|---:|---:|---:|
| Fighter | 92 -> **100** | 100 -> 99 | 100 -> **100** | 100 -> 100 |
| Rogue | **18 -> 50** | 63 -> **95** | 99 -> 76 | 100 -> 100 |
| Brute | 56 -> **82** | 10 -> 13 | 84 -> **92** | 100 -> 100 |
| Skitterer | 0 -> 0 | 0 -> 0 | 0 -> 0 | **19 -> 93** |

The mean moved 59% to 69%. All four mirrors resolved at 51%, 49%, 48%, and 49%,
with 12–14% surviving health and no draws. The regressions remain visible: positive
standoff helped most pairings and hurt Rogue-versus-Brute, while the Skitterer still
lost every non-mirror matchup.

This preserves `DESIGN.md#what-it-came-to` and the measured premise behind
`DESIGN.md#the-ladder-is-an-anti-objective-and-fitness-cannot-hold-both-ends`.
