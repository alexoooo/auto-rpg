# The path fighter's presets against Classic

How each preset of the path fighter (Combat, Brawler, Scrapper, Kicker) fares against the recipe
fighter's Classic, on the Warrior against itself, bare-handed and with the wooden club. These are
the README's figures; the run sets no bar.

**Harness:** Node Arena Duel, rapier-coordinate (`rapier/adapter-9/...coordinate-limits`), 120 Hz,
symmetric actuation; the arena-combat protocol (`COMBAT_PROTOCOL`): 60 s cap, recovery continuing,
balance 0 as every character's is. Code at `83c3540c`: the bare hand strikes with its measured
fist hull.

**Design:** `workshop-fighter` on both sides, both right hands empty or both holding the club, 192
mirrored held-out pairs a cell (`combatPairs`), 384 bouts a cell, 3072 in all. Run from a snapshot
with `research/controller-presets.mjs --jobs`, `research/arena-combat-run.mjs --workers 16`
(4985 s), reported with `research/controller-presets.mjs --report`. Raw rows:
`controller-presets.json.gz`. A side split over 10 points would make a cell invalid; none is.

| cell | bouts | score | Wilson 95 % | as left | as right | damage-rate diff (SE) | d bar margin | falls cand/opp |
|---|---|---|---|---|---|---|---|---|
| combat, empty | 384 | 0.987 | 0.959-0.996 | 0.995 | 0.979 | 0.0070 (0.0001) | 3.18 | 86/98 |
| combat, club | 384 | 0.240 | 0.185-0.305 | 0.240 | 0.240 | -0.0064 (0.0008) | -0.91 | 352/397 |
| brawler, empty | 384 | 0.982 | 0.951-0.993 | 0.979 | 0.984 | 0.0152 (0.0003) | 3.78 | 82/88 |
| brawler, club | 384 | 0.117 | 0.079-0.170 | 0.115 | 0.120 | -0.0273 (0.0021) | -1.61 | 216/240 |
| scrapper, empty | 384 | 0.984 | 0.955-0.995 | 0.979 | 0.990 | 0.0153 (0.0003) | 3.77 | 37/92 |
| scrapper, club | 384 | 0.096 | 0.062-0.146 | 0.104 | 0.089 | -0.0272 (0.0021) | -1.71 | 145/247 |
| kicker, empty | 384 | 0.997 | 0.976-1.000 | 1.000 | 0.995 | 0.0106 (0.0002) | 3.50 | 44/95 |
| kicker, club | 384 | 0.102 | 0.066-0.152 | 0.083 | 0.120 | -0.0255 (0.0020) | -1.69 | 103/224 |

Endings, the preset's wins/losses (no draws):

| cell | time | fatal | severed |
|---|---|---|---|
| combat, empty | 379/4 | 0/1 | 0/0 |
| combat, club | 92/255 | 0/22 | 0/15 |
| brawler, empty | 377/1 | 0/6 | 0/0 |
| brawler, club | 45/180 | 0/61 | 0/98 |
| scrapper, empty | 378/0 | 0/6 | 0/0 |
| scrapper, club | 37/190 | 0/59 | 0/98 |
| kicker, empty | 383/1 | 0/0 | 0/0 |
| kicker, club | 39/158 | 0/50 | 0/137 |

**Reading.** Bare-handed, every preset beats Classic, and every win is on the clock: no preset
ends a bout by a wound. With clubs, Classic beats every preset, often by a wound. Against the
capsule hands' run at `a144de7f`, the bare-handed scores rise from 0.97-0.98 to 0.98-1.00 and
Brawler's and Scrapper's damage-rate margins double, from 0.0070 to 0.015; Kicker's club cell
falls from 0.167 to 0.102 and Brawler's rises from 0.091 to 0.117.
