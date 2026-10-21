# Sword and buckler capability readings

What a body with a short sword in its right hand and a buckler in its left does, read by the
tasks of `research/blade-task.mjs`, `research/buckler-task.mjs`, `research/rising-bed.mjs` and
`research/court-task.mjs`, each with a capability test in `tests/experimental.json` and a floor in
the gate. Harness: Node, core world, Rapier, 120 Hz, Balance 0 on every side. Readings 1, 2 and 4
are at `754999fc`; reading 3 at `69afa0e8`, whose rise no later commit moves (the fingerprint moves
no pose).

## 1. A cut that wounds

`node --test tests/blade-capability.test.mjs`: the sword hand's recipe strike (the repertoire's
short-sword recipes, `assets/core/strikes.json`) at a standing Warrior with empty hands, 12 s
from 1.4 m. Bar: the median swing's edge on the trunk or head carries a third of the Warrior's
head at the rulebook's price of an edge, 2.59 J; the striker stays up; every swing returns within
1 s.

| Striker | Mark | Swings | Cut the trunk or head | Median edge, J | Longest return, s | Felled | Bar |
|---|---|---|---|---|---|---|---|
| Warrior | high | 1 | 0 | 0 | 0.55 | no | missed |
| Warrior | middle | 3 | 3 | 0.55 | 0.41 | no | missed |
| Rogue | high | 3 | 1 | 0 | 0.39 | no | missed |
| Rogue | middle | 3 | 3 | 2.68 | 0.41 | no | met |

The recipes were searched against a part hung at its place, and found 1.0 to 2.9 HP net there;
a standing body is not that part. The Warrior's middle swing meets the head with the tip before
the edge reaches the trunk; its high swing meets the head at 36 J with the edge not square to it,
which the rules read as blunt (0.36 HP).

## 2. The buckler against a blade

`node --test tests/buckler-capability.test.mjs`: the Duellist's ward against a sword's recipe
swing at the head, the trunk and the sword arm, facing its attacker head on and 45 degrees either
way. Bar: the buckler meets four of five swings that reach the body before the body does.

| Defender | Own swing under way | Met first / touched | Bar |
|---|---|---|---|
| Warrior | no | 34 / 44 (77 %) | missed |
| Warrior | yes | 22 / 36 (61 %) | missed |
| Rogue | no | 44 / 47 (94 %) | met |
| Rogue | yes | 38 / 42 (90 %) | met |

The Warrior's misses are mostly at -45 degrees, where its own sword hand stands in the line
first, and with its own swing under way, where the sword arm or the forearm meets the blade.

## 3. Up again, holding both

`node research/rising-bed.mjs --loadouts "buckler,sword;empty,club" --sub stand-up`: the target's
sixteen shoves, risen by the game's Stand up (`step-up`). Bar: at least as many recoveries
(stood, verified and walked) with sword and buckler as with the club on the same falls.

| Body | Sword and buckler | Club | Bar |
|---|---|---|---|
| Warrior | 11 / 16, median 19.1 s | 15 / 16, median 14.4 s | missed |
| Rogue | 4 / 16 | 4 / 16 | met |

The buckler is what costs the Warrior: with it alone 12 / 16 stand, with the sword alone 15 / 16.
Whether both items are still held after the rise is not read by the bed.

## 4. The court

`node research/court-task.mjs`: the Duellist from each spawn of the obstacle court, 4 and 6 m from
a Warrior behind the central column that stands or walks across the line at 0.4 m/s. Bar: it
reaches its window in every case within 15 s, without a fall.

| Striker | Gap, m | Still: arrived, s | Moving: arrived, s |
|---|---|---|---|
| Warrior, left | 4 | 10.0 | 9.8 |
| Warrior, right | 4 | 10.0 | 9.6 |
| Warrior, left | 6 | 11.3 | never |
| Warrior, right | 6 | 10.0 | never |
| Rogue, left | 4 | 12.0 | 11.6 |
| Rogue, right | 4 | 11.4 | 10.0 |
| Rogue, left | 6 | 14.0 | never |
| Rogue, right | 6 | 14.0 | never |

No case touched the furniture or fell. Bar missed: 12 of 16 arrive. Within 5 m of its foe a body
moves by the braced gait, about 0.5 m/s, and a walking foe at 6 m keeps its window moving faster
than that brings it in. Running nearer (the braced gait only within 3 m) struck the column and
fell.

## 5. The Duellist

`npm run match -- duellist <mind> --protocol sword-and-buckler`, at `754999fc`, protocol
`facbdef1350c0a0b`: 32 bouts a match, both bodies a side, on the open stage at 3 and 4.5 m and
the court at 4 and 6 m, each way round. Bar: it leads every other mind.

| Against | Won | Drawn | Lost | Score | Match |
|---|---|---|---|---|---|
| Options | 21 | 5 | 6 | 0.734 | `a2cfbe084806a570` |
| Classic | 24 | 8 | 0 | 0.875 | `7b8de75b4d12eee6` |
| Behaviours | 21 | 8 | 3 | 0.781 | `0cff8e5cc5b853f2` |

Met. Puncher, Counter-puncher, Scrapper, Tempo, Direct and Crawl do not fit sword and buckler,
having no blow a sword hand can throw, and play no match.
