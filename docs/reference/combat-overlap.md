# Independent strike and return

The admission screen of overlapping strikes: `ArenaFighterConfig.overlap`
(`src/core/mind/config.ts@352fbe24`; a path-strike executor's `overlap` in `FighterConfig`) lets one
opposite-hand follow-up start while the first hand returns. It needs `combinations`, alternate hands
and opening selection, and is granted only standing, once external hand contact has cleared and
the hand's root-relative velocity points toward its captured guard; the policy also checks a fresh
unblocked opening, distance, alignment, quiet centre motion and footing. Verdict: no gain; the
executors keep `overlap: false`.

Each hand of `combatSkills` is a strike of its own (`effectorStrike`, `state.hands`), the first
keeping its captured goal, velocity, motion sequence, clock and elbow preference while the other
runs chamber, swing and return; one locomotion owner, one trunk objective, one body command. The
figures below were read with the first hand's return held in a saved copy (`state.returning`,
`src/core/skills/strikes/combat.ts@a9b7724a`). Each hand earns its return only by the actual distance,
speed and upright checks; a deadline counts a failure; one follow-up, never a third strike.

## Physical stand

Node core stand (unpinned), Warrior empty hands, rapier-coordinate, 120 Hz, balance 0; fixed front
face over both fists at 1.63 m, ±0.10 m, 0.60 m ahead (removed for misses); 10 s with 2 s startup.
Full rows: [the admission record](combat-overlap-admission.json.gz).

| Leading hand | Case | Left/right swing contacts | Left/right verified returns | Steps with both hand goals |
| --- | --- | --- | --- | --- |
| Right | Hit | 3 / 7 | 6 / 6 | 230 |
| Left | Hit | 7 / 5 | 6 / 6 | 254 |
| Right | Miss | 0 / 0 | 6 / 6 | 307 |
| Left | Miss | 0 / 0 | 5 / 5 | 259 |

All rows stay up with no failure or assistance; contact closing speeds exceed 4 m/s. The second
fist sometimes misses the fixed target.

## Matched development comparison

Node Arena Duel, Warrior fists, rapier-coordinate, 120 Hz, balance 0/0, continuing recovery, 60 s
cap. Both candidates are Scrapper with 0.10 m extra spacing and combinations; only `overlap`
differs. Four mirrored recipes per opponent (16–19), 48 bouts, all at the cap.
[The development record](combat-overlap-development.json.gz) holds recipes, rows and ratings.

| Opponent | Serial W/D/L | Overlap W/D/L | Serial / overlap driven HP/s | Serial / overlap received HP/s | Serial / overlap own falls |
| --- | --- | --- | --- | --- | --- |
| Classic | 7/0/1 | 7/0/1 | 0.002330 / 0.002850 | 0.000020 / 0.000021 | 2 / 3 |
| Point | 8/0/0 | 8/0/0 | 0.003845 / 0.002799 | 0.000019 / 0.000023 | 0 / 0 |
| Brawler | 7/0/1 | 7/0/1 | 0.017700 / 0.017816 | 0.009544 / 0.008412 | 0 / 0 |

Win scores are unchanged (0.875, 95 % interval about 0.396–0.987); Point damage falls about 27 %,
Brawler incoming damage about 12 %, and Classic adds a fall. In 30 s self-play overlap throws 29
blows against 24 for 0.618539 against 0.611409 HP.

## Low admission

Four 45 s fixtures a candidate (ordinary 90 N s shove at 3 s, attack at 4 s; either side; lying
or recovering foe). No attacker falls, touches the floor with head or trunk, or uses assistance.

| Assignment / opponent | Serial / overlap low blows | Standing return after a low hit |
| --- | --- | --- |
| Left / lying | 14 / 14 | yes / yes |
| Left / recovering | 2 / 2 | yes / yes |
| Right / lying | 1 / 1 | yes / yes |
| Right / recovering | 0 / 0 | no / no |

Both fail the recovering-opponent gate. Source fingerprint
`7e7b4b8dd5884415212c129814ca4ff5803fef5f582704f1d16412da7d2afb04`.
