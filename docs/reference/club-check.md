# The club check: Scrapper against Classic with clubs

Whether the fighter that strikes on the shared strike cycle (Scrapper, `SCRAPPER`) holds its
own against the fighter that strikes by recipe (Classic) when both hold the wooden club. Recipe
blows retire only if it does.

**Harness:** Node Arena Duel, rapier-coordinate (`rapier/adapter-9/...coordinate-limits`), 120 Hz,
symmetric actuation; the arena-combat protocol (`COMBAT_PROTOCOL`): 60 s cap, recovery continuing,
balance 0 as every character's is. Code at `fee400ec`.

**Design:** each humanoid model meets itself, club in the right hand on both sides, 192 mirrored
held-out pairs a model (`combatPairs`), 384 bouts a cell, 1152 in all. Run with
`research/club-check.mjs --jobs`, `research/arena-combat-run.mjs --workers 8` (1347 s), reported
with `research/club-check.mjs --report`. Raw rows: `club-check.json.gz`.

**Bar:** pooled score at least .50 with its Wilson lower bound at least .45; no model's lower bound
under .40; the paired driven-damage-rate difference not below zero by more than 1.96 standard
errors. A side split over 10 points makes the run invalid.

| cell | bouts | score | Wilson 95 % | as left | as right | damage-rate diff (SE) | d bar margin | falls cand/opp |
|---|---|---|---|---|---|---|---|---|
| workshop-fighter | 384 | 0.094 | 0.060-0.143 | 0.089 | 0.099 | -0.0286 (0.0021) | -1.72 | 169/270 |
| workshop-rogue | 384 | 0.042 | 0.021-0.080 | 0.078 | 0.005 | -0.0000 (0.0000) | -2.15 | 188/275 |
| crypt-skeleton | 384 | 0.142 | 0.100-0.198 | 0.143 | 0.141 | -0.0168 (0.0012) | -1.69 | 234/238 |
| pooled | 1152 | 0.092 | 0.071-0.119 | 0.103 | 0.082 | -0.0152 (0.0009) | -1.65 | 591/783 |

Endings, Scrapper's wins/losses/draws:

| cell | time | severed | fatal |
|---|---|---|---|
| workshop-fighter | 36/193/0 | 0/97/0 | 0/58/0 |
| workshop-rogue | 15/226/2 | 0/34/0 | 0/107/0 |
| crypt-skeleton | 45/194/19 | 0/21/0 | 0/105/0 |
| pooled | 96/613/21 | 0/152/0 | 0/270/0 |

**Verdict: FAIL** on every term. Scrapper wins no bout by a wound; its wins are all on the clock.
The Rogue's paired driven-damage difference is zero in every pair, so it says nothing there.
Scrapper falls less than Classic (591 against 783), so the loss is in the striking, not in
staying up.
