# The path fighter's presets against Classic

How each preset of the path fighter (Combat, Brawler, Scrapper, Kicker) fares against the recipe
fighter's Classic, on the Warrior against itself, bare-handed and with the wooden club. These are
the README's figures; the run sets no bar.

**Harness:** Node Arena Duel, rapier-coordinate (`rapier/adapter-9/...coordinate-limits`), 120 Hz,
symmetric actuation; the arena-combat protocol (`COMBAT_PROTOCOL`): 60 s cap, recovery continuing,
balance 0 as every character's is. Code at `a144de7f`.

**Design:** `workshop-fighter` on both sides, both right hands empty or both holding the club, 192
mirrored held-out pairs a cell (`combatPairs`), 384 bouts a cell, 3072 in all. Run from a snapshot
with `research/controller-presets.mjs --jobs`, `research/arena-combat-run.mjs --workers 16`
(3604 s), reported with `research/controller-presets.mjs --report`. Raw rows:
`controller-presets.json.gz`. A side split over 10 points would make a cell invalid; none is.

| cell | bouts | score | Wilson 95 % | as left | as right | damage-rate diff (SE) | d bar margin | falls cand/opp |
|---|---|---|---|---|---|---|---|---|
| combat, empty | 384 | 0.984 | 0.955-0.995 | 0.974 | 0.995 | 0.0038 (0.0001) | 1.96 | 77/86 |
| combat, club | 384 | 0.240 | 0.185-0.305 | 0.245 | 0.234 | -0.0072 (0.0007) | -1.07 | 333/386 |
| brawler, empty | 384 | 0.971 | 0.937-0.987 | 0.964 | 0.979 | 0.0070 (0.0001) | 3.89 | 82/94 |
| brawler, club | 384 | 0.091 | 0.058-0.140 | 0.089 | 0.094 | -0.0288 (0.0021) | -1.70 | 212/269 |
| scrapper, empty | 384 | 0.971 | 0.937-0.987 | 0.964 | 0.979 | 0.0070 (0.0001) | 3.72 | 48/92 |
| scrapper, club | 384 | 0.094 | 0.060-0.143 | 0.089 | 0.099 | -0.0286 (0.0021) | -1.72 | 169/270 |
| kicker, empty | 384 | 0.984 | 0.955-0.995 | 0.984 | 0.984 | 0.0046 (0.0001) | 3.53 | 34/73 |
| kicker, club | 384 | 0.167 | 0.121-0.226 | 0.167 | 0.167 | -0.0260 (0.0021) | -1.64 | 142/266 |

Endings, the preset's wins/losses (no draws):

| cell | time | fatal | severed |
|---|---|---|---|
| combat, empty | 378/6 | 0/0 | 0/0 |
| combat, club | 92/251 | 0/27 | 0/14 |
| brawler, empty | 373/3 | 0/8 | 0/0 |
| brawler, club | 35/195 | 0/58 | 0/96 |
| scrapper, empty | 373/3 | 0/8 | 0/0 |
| scrapper, club | 36/193 | 0/58 | 0/97 |
| kicker, empty | 378/2 | 0/4 | 0/0 |
| kicker, club | 64/156 | 0/40 | 0/124 |

**Reading.** Bare-handed, every preset beats Classic, and every win is on the clock: no preset
ends a bout by a wound. With clubs, Classic beats every preset, often by a wound. Scrapper's club
cell is the club check's Warrior cell to the last figure (`club-check.md`): the same pairs, run
at `fee400ec` there and at `a144de7f` here.
