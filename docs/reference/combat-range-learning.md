# Working distance from observed misses

The admission screen of range learning: `spacingStep` (the `approach` tactic in
`src/core/mind/config.ts`) lowers the extra spacing `spacing` asks, in metres, after each clean
miss (`cleanMiss`, `src/core/mind/action-tactics.ts`). Verdict: not promoted; `SCRAPPER` keeps
`spacing: 0, spacingStep: 0`. The figures were read with `rangeLearning`
(`src/core/mind/range-learning.ts@352fbe24`), whose rule follows.

A correction needs an actually launched swing, no external hand contact in its episode, and a rise
in that hand's verified-return count; preparation failures, return timeouts and touches never move
it closer. The offset only falls toward zero, the original working-distance rule being its floor,
and a contact never raises it. An evaded target can shorten it too: touch alone does not tell a
miss's cause. Its state is plain saved tactical data; orders, recovery, resumption and low takeover
cancel a pending episode, a changed opponent restarts it, and low strokes do not train it. Omitted
or zero `spacingStep` keeps fixed spacing.

## Self-play development

`combat-range-selfplay.json`: seven 30 s bouts of one recipe, Node Arena Duel, rapier-coordinate,
120 Hz, Warrior fists, balance 0/0, continuing recovery; both sides body-targeting Scrapper with
extra spacing 0.10 m.

| Step (m) / option | Driven HP, left/right | Trunk blows, left/right | Final extra spacing, left/right |
|---|---:|---:|---:|
| fixed spacing | 0.072 / 0.009 | 1/0 | 0.10/0.10 |
| 0.02 | 0.113 / 0.373 | 1/6 | 0.02/0.04 |
| 0.05 | 0.398 / 0.174 | 10/5 | 0/0.05 |
| 0.10 | 0.251 / 0.283 | 10/7 | 0/0 |
| 0.05 + combinations | 0.279 / 0.313 | 5/7 | 0.05/0.05 |
| 0.10 + combinations | 0.478 / 0.073 | 13/3 | 0/0 |
| 0.10 + full elbow | 0.572 / 0.364 | 17/9 | 0/0 |

All stay up unassisted. The full-elbow cell delivers about 37 % more than unspaced Scrapper's
0.269/0.415 HP on the same recipe.

## Low-attack admission

`combat-range-low.json`: the 0.10 m step / full-elbow candidate in four 45 s controlled low bouts.
Three pass the low gates; the left-hand lying case lands two driven low blows and returns standing,
then falls, touches the floor with head or trunk, and fails a return.

## Active-opponent development

`combat-range-development.json`: 128 bouts, 60 s cap, eight mirrored recipes a cell (8–15 against
Point and Brawler, reused held-out 100–107 against Classic); all at the cap.

| Opponent | Profile | W/D/L | Driven HP/s | Received HP/s | Own falls |
|---|---|---:|---:|---:|---:|
| classic | fixed spacing | 15/0/1 | 0.003239 | 0.000091 | 5 |
| classic | adaptive + full elbow | 16/0/0 | 0.007799 | 0.001132 | 3 |
| point | fixed spacing | 15/1/0 | 0.005597 | 0.000053 | 0 |
| point | adaptive | 15/1/0 | 0.010363 | 0.000267 | 0 |
| point | adaptive + full elbow | 16/0/0 | 0.009132 | 0.000346 | 0 |
| brawler | fixed spacing | 16/0/0 | 0.018593 | 0.010031 | 0 |
| brawler | adaptive | 10/0/6 | 0.013684 | 0.012938 | 0 |
| brawler | adaptive + full elbow | 13/0/3 | 0.016086 | 0.011364 | 0 |

Adaptive range with full elbow doubles the Classic damage rate and cuts its own falls from five to
three, but both adaptive profiles lose more often to Brawler. Arm style per action followed:
[combat-arm-style.md](combat-arm-style.md).
