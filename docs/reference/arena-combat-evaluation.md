# Arena combat evaluation

How autonomous Arena bouts are scored against named opponents, and the readings behind the body
targeting `BODY_OPENINGS` gives the Scrapper (`SCRAPPER`, `src/core/mind/config.ts`). The
evaluator is `research/arena-combat.mjs`; the runner `research/arena-combat-run.mjs`; the league
`research/arena-combat-league.mjs`.

## The protocol

Bouts run through `Duel` and `World.step` on the gameplay engine (`rapier-coordinate`) at 120 Hz:
unarmed Warriors, symmetric sourced muscles, zero balance, unchanged injury rules, and continuing
bouts with each policy's own recovery. Every row stores the engine revision and the full recipe.
The measurement choices are fixed before any controller tuning:

| Choice | Value | Purpose |
|---|---:|---|
| Driven contact closing speed | at least 1 m/s | Exclude slow contact pressure |
| Hand motion relative to own COM along the contact normal | at least 0.5 m/s toward the other surface | Exclude tangential motion, retraction and body translation without a stroke |
| Pressure-only episode | at least 2 s | Report prolonged touching without a driven blow |
| Startup exclusion for blow accounting | 2 s | Exclude initial settling |
| Low-target diagnostic | opposing head below 0.8 m, or opposing body down | Identify contacts against grounded or rising opponents |
| Competitive cap | 60 s | Fixed exposure |

- **Driven credit** needs the command host to have an active `swing` for the colliding hand while
  it is not down. The evaluator samples the point's velocity before the physics step, subtracts
  its own centre of mass's, and tests the signed normal component, for each side of the core's
  symmetric blow. Hand and forearm interceptions are blocks; all other damage is incidental, and
  every wound received is recorded. Damage is actual hit points taken by wound records. The
  classification is evaluation data, never hit authority: it measures commanded closing contacts,
  not muscle work or aim.
- **Exposure** includes host and recovery phases, falls and returns upright, time down, hand
  pressure, longest continuous pressure, pressure-only episodes, driven and block contacts, driven
  damage each way, incidental damage and total wounds. Self-contact and fixed-world contact are
  not opponent pressure.
- **Conditions** (`combatPairs`) vary starting gap, sense delay and ordinary facing orders with
  different release times; mirrors exchange policy sides and the ordered side. Development and
  held-out sets come from separate fixed generators, checked for complete recipe and order
  uniqueness and split separation. Repeating a deterministic bout adds no evidence.
- **Ratings**: each mirrored pair is one unit. A rating reports win score (draw 0.5), a Wilson
  interval on the pair count, and relative Elo `400 log10(score / (1 - score))` against that named
  opponent; a perfect score has no finite Elo, only its score interval. Injury wins and wins at
  the cap are counted apart: a small health lead at the cap does not show stronger striking.

## Measurement

```powershell
node research/arena-combat-run.mjs --candidate point --opponent classic --pairs 8 --split development --workers 2
node research/arena-combat-run.mjs --candidate scrapper --opponent brawler --pairs 100 --split heldout --workers 2 --output research/runs/scrapper.json --resume
node research/arena-combat-league.mjs research/runs/scrapper.json --output research/runs/league.json
```

The runner uses worker threads, one sequential physics loop each, and writes a version-2
checkpoint (the frozen job manifest, source fingerprint, successful rows and failed-trial history)
through a temporary file and rename. The source fingerprint is checked around every trial, and a
change refuses continuation. `--resume` validates source, manifest and job metadata and runs only
missing trials; a failed simulation is retried, never scored, and a lost worker leaves its job
pending. The league separates source-fingerprint seasons and policy, body, loadout, assist, rule
and engine strata, counts identical deterministic mirrors once, refuses a partly duplicated pair,
and publishes per-opponent paired win score, Wilson interval, pairwise Elo, endings and driven
damage rates with the mean and standard error of paired damage-rate differences. It never pools
unlike opponents into one Elo.

Every table below is the Node Arena Duel, `rapier-coordinate`, 120 Hz, Warrior fists, balance
0/0, continuing recovery.

## Corrected gameplay baseline

Six 30 s diagnostic probes, not rating samples. Counts and damage exclude the first 2 s; pressure
covers the whole bout.

| Policies (left/right) | Start gap (m) | Driven contacts L/R | Driven damage L/R (hp) | Pressure L/R (s) | Falls L/R |
|---|---:|---:|---:|---:|---:|
| point/point | 4 | 4/5 | 0.01233/0.03650 | 23.06/22.80 | 0/0 |
| point/point | 1.2 | 1/0 | 0.00639/0.00000 | 25.02/25.00 | 0/0 |
| point/point | 2.4 | 5/6 | 0.01542/0.02804 | 21.88/21.92 | 0/0 |
| point/classic | 4 | 5/6 | 0.02003/0.10453 | 17.34/16.63 | 0/0 |
| classic/point | 4 | 12/2 | 0.05678/0.00233 | 14.58/17.27 | 0/0 |
| classic/classic | 4 | 0/0 | 0.00000/0.00000 | 8.45/11.08 | 1/1 |

Point self-play spends 22-25 s touching, with few, weak driven blows. Classic lands faster
occasional blows in mixed bouts, but in self-play it falls and spends the rest recovering.
Corrected joint limits alone do not make combat: chamber space, reliable launch speed and recovery
under pressure come first.

## Body-targeting held-out evaluation

`BODY_OPENINGS` (`head: 0.3, upperTrunk: 0, middleTrunk: 0`) is the opening preference of this
held-out candidate, frozen at `75e239d2`: `{kind:'arena-fighter', hand:'alternate',
targeting:'openings', repertoire:'mixed', openings:{head:0.3, upperTrunk:0, middleTrunk:0}}`, with
no low-combat transition. The Scrapper (`SCRAPPER`) uses it with mixed strikes standing, as does
the Brawler (`BRAWLER`, `tests/fixtures/minds.mjs`). The comparison Combat is the linear opening
controller; Classic uses staged recovery and Point tracked engagement.

Each opponent meets 100 distinct held-out recipes and their mirrors (200 bouts): gap 1.2-6 m,
sense delay 0-12 steps, a seeded short initial facing order, 60 s cap. Recipes, configs, tapes and
the source fingerprint are [combat-body-heldout.json](combat-body-heldout.json); per-opponent
paired ratings [combat-body-heldout-ratings.json](combat-body-heldout-ratings.json). Six worker
queues took 1,680 s.

| Opponent | Wins / 200 | Paired score, 95% interval | Relative Elo, 95% interval | Candidate/opponent falls | Mean driven damage candidate/opponent, hp per 60 s |
| --- | ---: | --- | --- | ---: | ---: |
| Classic | 192 | 0.960 [0.902, 0.984] | +552 [+385, +719] | 39 / 44 | 0.514 / 0.091 |
| Point | 200 | 1.000 [0.963, 1.000] | unbounded; lower bound +566 | 0 / 0 | 1.004 / 0.040 |
| Linear Combat | 199 | 0.995 [0.954, 0.999] | +920 [+526, +1,313] | 1 / 2 | 0.931 / 0.344 |

All 591 wins come at the cap; none is a wound finish, so the preference buys target contact and a
health lead, not finishing power. It does not meet the proposed majority-before-cap finishing
gate, and the scope is Warrior empty hands only.

A 30 s Brawler self-play bout records 16/19 driven blows and 0.269/0.415 driven HP out, guard contacts included, both sides
standing, and a longest pressure-only interval of 0.467 s. Six 60 s held-out bouts (the first
mirrored recipe against each opponent) replay with records equal to the retained ones.

On the built page (`?play=arena&matchup=workshop-fighter,workshop-fighter&control=brawler&held=empty&balance=0&cap=60&measure=1`)
the DOM timing read 5,921 physics steps over 500 frames at a mean of 2.487 ms a step (p95 of frame
batch means 3.133 ms) and whole frames at 31.8/40.3 ms median/p95. The browser delivered frames
at about 1 Hz, 12 steps each, so this is no foreground 60 Hz budget or GPU cost.

## Spacing and punch-speed development

Eight development recipes against the Brawler, both assignments, frozen at `b4b3cccf`; rows and
fingerprint in `combat-spacing-development.json`. Every result is at the cap, and no profile lands
a low driven blow.

| Scrapper variant | Wins / 16 | Paired score, 95% interval | Pairwise Elo, 95% interval | Driven damage / received driven damage (HP) | Candidate/opponent falls |
|---|---:|---|---|---:|---:|
| Reference | 10 | 0.625 [0.306, 0.863] | +88.7 [-142.5, +319.9] | 12.368 / 12.401 | 0/0 |
| Requested contact speed 8 m/s | 8 | 0.500 [0.215, 0.785] | 0 [-224.8, +224.8] | 12.129 / 13.038 | 0/0 |
| Additional spacing 0.10 m | 14 | 0.875 [0.529, 0.978] | +338.0 [+20.3, +655.8] | 16.688 / 9.626 | 0/0 |
| Both changes | 13 | 0.813 [0.467, 0.955] | +254.7 [-23.1, +532.6] | 16.382 / 8.421 | 2/2 |

The 0.10 m spacing raises driven damage about 35 % over the reference, a paired advantage over the
Brawler of 0.007356 HP/s (standard error 0.002045). That more room improves extension is
plausible but not measured. No strength, speed, damage rule or assist changes. Eight pairs select
a candidate; they are not a held-out sample.

## Spacing candidate held-out evaluation

The +0.10 m candidate (5 m/s request, body targets, muscles and damage rules unchanged) against
100 fresh held-out pairs an opponent (indices 100-199, apart from the earlier 0-99), at
`b4b3cccf`: 600 trials in `combat-spacing-heldout.json`, ratings in `combat-spacing-rating.json`.

| Opponent | Wins / 200 | Paired score, 95% interval | Pairwise Elo, 95% interval | Driven / received driven HP per second | Candidate/opponent falls | Low driven blows |
|---|---:|---|---|---:|---:|---:|
| Classic | 185 | 0.925 [0.856,0.962] | +436 [+310,+563] | 0.003019 / 0.000047 | 61/184 | 150 |
| Point | 196 | 0.980 [0.930,0.994] | +676 [+449,+903] | 0.003333 / 0.000024 | 0/0 | 0 |
| Brawler | 185 | 0.925 [0.856,0.962] | +436 [+310,+563] | 0.019694 / 0.010044 | 4/5 | 3 |

Every outcome is at the cap. The candidate passes the proposed win-score and interval gate against
all three, with a paired damage-rate advantage over the Brawler of 0.009651 HP/s (standard error
0.000427); finishing power and fall safety are not met. The Classic stratum shows falls and
grounded exchanges the controlled low fixtures do not cover.

Four passive audits of Classic cases 101/right, 102/left, 105/right and 107/right
(`combat-fall-audit.json`) find falls beginning at 57.475, 36.308, 36.375 and 50.358 s: a low
wait and approach with a shank touching the foe's forearm, a low approach, a return from a
supported fold, and an ordinary escape with low combat inactive. No blow lands in the 0.20 s
before any of them, which does not establish an unforced cause. The snapshots replay exactly with
the optional features disabled.

## Matched combinations and low-mode development

96 bouts at `8ced3e48` in `combat-combination-development.json` (job manifest, rows, ratings), all
with the 0.10 m spacing and 60 s caps. Eight mirrored development recipes (indices 8-15) compare
optional combinations against the Brawler and Point; eight reused held-out-family recipes
(100-107) compare low mode on and off against Classic, as a development ablation.

| Opponent | Setting | Wins/draws/losses / 16 | Driven/received driven HP per second | Candidate/opponent falls | Low driven blows |
|---|---|---:|---:|---:|---:|
| Brawler | Ordinary single attacks | 16/0/0 | 0.018593 / 0.010031 | 0/0 | 0 |
| Brawler | Bounded combinations | 15/0/1 | 0.018858 / 0.010292 | 0/0 | 0 |
| Point | Ordinary single attacks | 15/1/0 | 0.005597 / 0.000053 | 0/0 | 0 |
| Point | Bounded combinations | 15/1/0 | 0.004678 / 0.000030 | 0/0 | 0 |
| Classic | Low mode enabled | 15/0/1 | 0.003239 / 0.000091 | 5/15 | 9 |
| Classic | Low mode disabled | 15/0/1 | 0.003012 / 0.000091 | 10/16 | 3 |

Every outcome is at the cap. Combinations change the Brawler damage advantage little and lower
outgoing damage against Point, so they stay optional. Low mode halves the candidate's falls and
adds low blows; its disabled variant still selects surfaces on low heads and bodies, so it is no
passive-wait control. The falls are not all the low policy's, and neither low-combat safety nor a
cause for each fall is shown.
