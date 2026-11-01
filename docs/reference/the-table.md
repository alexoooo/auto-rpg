# The table

Option Mind on every body, loadout and skill against its bar
([the plan](../plans/2026-11-01-option-mind-everywhere.md#3-the-table)), first read at `91983216`:
**103 cells, 8 met, 95 short**. `npm run evaluate -- table --play --workers 22`, every reading
played and written (`assets/evaluations/*/2026-11-01-91983216-*.jsonl`); Node, core world,
`rapier-coordinate`, 120 Hz, command delay 0. The met cells: the Warrior's walk holding the club
and buckler, the sword, and the sword and buckler; the Rogue's walk with the sword and buckler; the
Warrior's low kick holding the sword (one thrown of 18 trials); the Rogue's stomp with empty hands
and with the sword and buckler. No cell is accepted by the owner.

## What falls short, by cause

- **Skills with no record for the body** (`usableSkills` leaves them out; the drill counts every
  trial refused): the Skeleton has only the low kick (no punch, stomp, club, cut or thrust is
  tuned for `crypt-skeleton+toes`); the Rogue has the punch and the stomp (no club, cut, thrust or
  kick). Option Mind does not refuse the Rogue's punch: it throws it on the still rung, 23 of 30.
  The Skeleton's "no such choice on its menu" is the drill Commander finding no punch in its kit.
- **Blows thrown but weak or elsewhere**: the Warrior's punch on the still rung (26 of 32 thrown),
  the club (6 and 12 of 16), the cut and the thrust (none of 7 to 32); in every fight rung no blow
  meets the foe's body past its arms (0 on the body, all bodies and blows).
- **The run**: no cell meets it. On toes the run gait is held to its envelope, about 0.7 m/s forward
  ([toes](toes.md#on-the-game-bodies)), so the held run cannot reach 3 m/s; the Rogue falls in 24
  to 28 of its 32 run trials with empty hands or the sword.
- **Stand-up speed**: the Warrior stands every fall but slowly (16 of 16, 1 within 6 s, median 8.6
  s); the Rogue stands 13 of 16 empty (median 16.7 s) and 3 and 6 of 16 holding the buckler with
  the club and the sword (median 30 s, the cap).
- **The Skeleton's rise**: none of its 80 falls stood. Its mind runs the staged roll from the back
  and the roll never finishes (it brakes while tumbling and lies back), so it spends 1,462 of
  about 2,400 s on its back. The record's `attempts` read none for these: the reading misses the
  tries of a rise it never hands back.
- **The Skeleton's walk**: 26 to 30 of its 47 trials fall in every loadout, but 20 to 24 of those
  are the shoves, which the protocol gives every body at the Warrior's 30, 45 and 60 N s
  (`SCREEN` through `EVERY`, `src/evaluation/locomotion/cases.ts`): 2 to 4 m/s on its 15 kg against 0.4
  to 0.8 on the Warrior. Holding the buckler and the club (2.1 kg, 14 % of its mass) it sinks 0.2 m
  at the root and never steps in calm air (0.02 m in 4 s, every way and pace), and falls in the
  lab's gusts at 1.6 s; with the buckler and the sword it sinks 0.15 m and walks.
- **The buckler's cover**: it meets 1 to 20 of 13 to 30 blows first, 6 to 67 %, against 80 %; the
  Skeleton falls in 2 to 3 of 6 trials.
- **The walk**: the Warrior falls in its turns with empty hands and the club (2 and 1 of 2); the
  Rogue in 1 or 2 of 24 shoves and a walk with the club.

## Each cell


| Body | Loadout | stand-up | walk | run | punch | stomp | front-kick | club-blow | cut | thrust | buckler-cover |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Warrior | empty,empty | short | short | short | short | short | short | – | – | – | – |
| Warrior | empty,club | short | short | short | short | short | short | short | – | – | – |
| Warrior | buckler,club | short | **met** | short | – | short | short | short | – | – | short |
| Warrior | empty,sword | short | **met** | short | short | short | **met** | – | short | short | – |
| Warrior | buckler,sword | short | **met** | short | – | short | **met** | – | short | short | short |
| Rogue | empty,empty | short | short | short | short | **met** | short | – | – | – | – |
| Rogue | empty,club | short | short | short | short | short | short | short | – | – | – |
| Rogue | buckler,club | short | short | short | – | short | short | short | – | – | short |
| Rogue | empty,sword | short | short | short | short | short | short | – | short | short | – |
| Rogue | buckler,sword | short | **met** | short | – | **met** | short | – | short | short | short |
| Skeleton | empty,empty | short | short | – | short | short | short | – | – | – | – |
| Skeleton | empty,club | short | short | – | short | short | short | short | – | – | – |
| Skeleton | buckler,club | short | short | – | – | short | short | short | – | – | short |
| Skeleton | empty,sword | short | short | – | short | short | short | – | short | short | – |
| Skeleton | buckler,sword | short | short | – | – | short | short | – | short | short | short |


### Warrior

- **empty,empty, stand-up**: short
  - rising-target/standard: 16 of 16 stood, 1 within 6 s, median 8.6 s (`?play=ratings&evaluation=rising-target&subject=game&version=91066ec772586741`)
- **empty,empty, walk**: short
  - locomotion/every: 2 of 47 fell, walk along 1.01 of the pace asked (median) (`?play=ratings&evaluation=locomotion&subject=option&version=f1c53e291ae6948e`)
- **empty,empty, run**: short
  - locomotion/run: 0 of 32 met, 5 fell; short: run-held, run-turn, run-stop (`?play=ratings&evaluation=locomotion&subject=option&version=6903c3a0de3b5adc`)
- **empty,empty, punch**: short
  - strike/still: 26 of 32 thrown, 0 fell, 32 refused, 64 trials (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch&version=d8128035105153bf`)
  - strike/walk: 54 of 64 thrown, 0 fell, 64 refused, 128 trials (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch&version=f71986767906ef87`)
  - strike/fight: 0 of 0 on the body, 0 fell, 10 refused, 16 trials (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch&version=27282924d20db673`)
- **empty,empty, stomp**: short
  - strike/stomping: 4 of 5 thrown, 0 fell, 7 refused, 12 trials (`?play=ratings&evaluation=strike&subject=stomp60&version=69250816729e6455`)
- **empty,empty, front-kick**: short
  - strike/kicking: 1 of 3 thrown, 1 fell, 4 refused, 18 trials (`?play=ratings&evaluation=strike&subject=option%2Flow-kick&version=54900567d308105b`)
- **empty,club, stand-up**: short
  - rising-target/standard: 16 of 16 stood, 1 within 6 s, median 10.8 s (`?play=ratings&evaluation=rising-target&subject=game&version=91066ec772586741`)
- **empty,club, walk**: short
  - locomotion/every: 1 of 47 fell, walk along 1.02 of the pace asked (median) (`?play=ratings&evaluation=locomotion&subject=option&version=f1c53e291ae6948e`)
- **empty,club, run**: short
  - locomotion/run: 0 of 32 met, 5 fell; short: run-held, run-turn, run-stop (`?play=ratings&evaluation=locomotion&subject=option&version=6903c3a0de3b5adc`)
- **empty,club, punch**: short
  - strike/still: 5 of 14 thrown, 0 fell, 50 refused, 64 trials (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Cclub&version=1d6a9d8194d2b690`)
  - strike/walk: 6 of 24 thrown, 0 fell, 97 refused, 128 trials (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Cclub&version=9b635ab1b9e7dd52`)
  - strike/fight: 0 of 0 on the body, 0 fell, 7 refused, 16 trials (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Cclub&version=a770874fcc1c91e4`)
- **empty,club, stomp**: short
  - strike/stomping: 2 of 6 thrown, 1 fell, 4 refused, 12 trials (`?play=ratings&evaluation=strike&subject=option%2Fstomp%40empty%2Cclub&version=fb99f066ffa0519e`)
- **empty,club, front-kick**: short
  - strike/kicking: 0 of 0 thrown, 1 fell, 6 refused, 18 trials (`?play=ratings&evaluation=strike&subject=option%2Flow-kick%40empty%2Cclub&version=cb32ea3ac2d899fe`)
- **empty,club, club-blow**: short
  - strike/still: 6 of 16 thrown, 1 fell, 48 refused, 64 trials (`?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40empty%2Cclub&version=1ef9ec97fd15dd0a`)
  - strike/walk: 9 of 29 thrown, 0 fell, 99 refused, 128 trials (`?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40empty%2Cclub&version=1d1b9ef6e679d6c5`)
  - strike/fight: 0 of 1 on the body, 0 fell, 6 refused, 16 trials (`?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40empty%2Cclub&version=15963d0b5ff800ac`)
- **buckler,club, stand-up**: short
  - equipped-rise/every: 15 of 16 stood, 0 within 6 s, median 9.1 s (`?play=ratings&evaluation=equipped-rise&subject=option&version=dae4771ef480669b`)
- **buckler,club, walk**: met
  - locomotion/every: 0 of 47 fell, walk along 1.02 of the pace asked (median) (`?play=ratings&evaluation=locomotion&subject=option&version=f1c53e291ae6948e`)
- **buckler,club, run**: short
  - locomotion/run: 0 of 32 met, 0 fell; short: run-held, run-turn, run-stop (`?play=ratings&evaluation=locomotion&subject=option&version=6903c3a0de3b5adc`)
- **buckler,club, stomp**: short
  - strike/stomping: 3 of 8 thrown, 0 fell, 2 refused, 12 trials (`?play=ratings&evaluation=strike&subject=option%2Fstomp%40buckler%2Cclub&version=317c4ef6fa502cc1`)
- **buckler,club, front-kick**: short
  - strike/kicking: 0 of 1 thrown, 0 fell, 6 refused, 18 trials (`?play=ratings&evaluation=strike&subject=option%2Flow-kick%40buckler%2Cclub&version=7f82a348886e2e32`)
- **buckler,club, club-blow**: short
  - strike/still: 12 of 16 thrown, 0 fell, 48 refused, 64 trials (`?play=ratings&evaluation=strike&subject=club-blow60&version=d02e401d32ed9026`)
  - strike/walk: 6 of 29 thrown, 0 fell, 99 refused, 128 trials (`?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40buckler%2Cclub&version=7f3e41dca14ec88e`)
  - strike/fight: 0 of 0 on the body, 0 fell, 13 refused, 16 trials (`?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40buckler%2Cclub&version=e0dea9fc9459ad43`)
- **buckler,club, buckler-cover**: short
  - cover/club: 2 of 16 blows met by the buckler first, 0 fell, 6 trials (`?play=ratings&evaluation=cover&subject=option&version=b0ac4f4bdb228525`)
  - cover/sword: 6 of 14 blows met by the buckler first, 0 fell, 6 trials (`?play=ratings&evaluation=cover&subject=option&version=02da390f0499ae23`)
- **empty,sword, stand-up**: short
  - equipped-rise/every: 15 of 16 stood, 3 within 6 s, median 9.3 s (`?play=ratings&evaluation=equipped-rise&subject=option&version=dae4771ef480669b`)
- **empty,sword, walk**: met
  - locomotion/every: 0 of 47 fell, walk along 1.02 of the pace asked (median) (`?play=ratings&evaluation=locomotion&subject=option&version=f1c53e291ae6948e`)
- **empty,sword, run**: short
  - locomotion/run: 0 of 32 met, 5 fell; short: run-held, run-turn, run-stop (`?play=ratings&evaluation=locomotion&subject=option&version=6903c3a0de3b5adc`)
- **empty,sword, punch**: short
  - strike/still: 9 of 14 thrown, 0 fell, 49 refused, 64 trials (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Csword&version=93da62810dee65e5`)
  - strike/walk: 20 of 32 thrown, 0 fell, 96 refused, 128 trials (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Csword&version=cff92bbdd05171f3`)
  - strike/fight: 0 of 0 on the body, 0 fell, 12 refused, 16 trials (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Csword&version=46e48e02a5130bcc`)
- **empty,sword, stomp**: short
  - strike/stomping: 1 of 5 thrown, 0 fell, 5 refused, 12 trials (`?play=ratings&evaluation=strike&subject=option%2Fstomp%40empty%2Csword&version=9ea861b917581918`)
- **empty,sword, front-kick**: met
  - strike/kicking: 1 of 1 thrown, 0 fell, 7 refused, 18 trials (`?play=ratings&evaluation=strike&subject=option%2Flow-kick%40empty%2Csword&version=301b98d4b4600118`)
- **empty,sword, cut**: short
  - strike/still: 0 of 13 thrown, 0 fell, 51 refused, 64 trials (`?play=ratings&evaluation=strike&subject=option%2Fsword-cut%40empty%2Csword&version=01cc29283dd92e34`)
  - strike/walk: 0 of 29 thrown, 0 fell, 99 refused, 128 trials (`?play=ratings&evaluation=strike&subject=option%2Fsword-cut%40empty%2Csword&version=4c83e89264450962`)
  - strike/fight: 0 of 0 on the body, 0 fell, 14 refused, 16 trials (`?play=ratings&evaluation=strike&subject=option%2Fsword-cut%40empty%2Csword&version=7f60efc55e0bcf29`)
- **empty,sword, thrust**: short
  - strike/still: 0 of 14 thrown, 0 fell, 49 refused, 64 trials (`?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40empty%2Csword&version=8353008ca3d04383`)
  - strike/walk: 0 of 32 thrown, 0 fell, 96 refused, 128 trials (`?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40empty%2Csword&version=ff8516384533d7a2`)
  - strike/fight: 0 of 0 on the body, 0 fell, 12 refused, 16 trials (`?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40empty%2Csword&version=602f098146aaee3e`)
- **buckler,sword, stand-up**: short
  - equipped-rise/every: 16 of 16 stood, 1 within 6 s, median 8.9 s (`?play=ratings&evaluation=equipped-rise&subject=option&version=dae4771ef480669b`)
- **buckler,sword, walk**: met
  - locomotion/every: 0 of 47 fell, walk along 1.02 of the pace asked (median) (`?play=ratings&evaluation=locomotion&subject=option&version=f1c53e291ae6948e`)
- **buckler,sword, run**: short
  - locomotion/run: 0 of 32 met, 5 fell; short: run-held, run-turn, run-stop (`?play=ratings&evaluation=locomotion&subject=option&version=6903c3a0de3b5adc`)
- **buckler,sword, stomp**: short
  - strike/stomping: 2 of 6 thrown, 0 fell, 6 refused, 12 trials (`?play=ratings&evaluation=strike&subject=option%2Fstomp%40buckler%2Csword&version=75b802fa96711461`)
- **buckler,sword, front-kick**: met
  - strike/kicking: 1 of 1 thrown, 0 fell, 8 refused, 18 trials (`?play=ratings&evaluation=strike&subject=option%2Flow-kick%40buckler%2Csword&version=0fa3a97418a046f5`)
- **buckler,sword, cut**: short
  - strike/still: 0 of 7 thrown, 0 fell, 55 refused, 64 trials (`?play=ratings&evaluation=strike&subject=option%2Fsword-cut%40buckler%2Csword&version=4d9bd33612d360d0`)
  - strike/walk: 0 of 24 thrown, 0 fell, 101 refused, 128 trials (`?play=ratings&evaluation=strike&subject=option%2Fsword-cut%40buckler%2Csword&version=ff308da17bc8c5b7`)
  - strike/fight: 0 of 1 on the body, 0 fell, 12 refused, 16 trials (`?play=ratings&evaluation=strike&subject=option%2Fsword-cut%40buckler%2Csword&version=896cc3d59ed46a63`)
- **buckler,sword, thrust**: short
  - strike/still: 0 of 11 thrown, 0 fell, 50 refused, 64 trials (`?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40buckler%2Csword&version=f757fd8b891338c6`)
  - strike/walk: 0 of 20 thrown, 0 fell, 98 refused, 128 trials (`?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40buckler%2Csword&version=4583a7ea3ac03011`)
  - strike/fight: 0 of 1 on the body, 0 fell, 12 refused, 16 trials (`?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40buckler%2Csword&version=0375da879c6eadd5`)
- **buckler,sword, buckler-cover**: short
  - cover/club: 4 of 18 blows met by the buckler first, 0 fell, 6 trials (`?play=ratings&evaluation=cover&subject=option&version=b0ac4f4bdb228525`)
  - cover/sword: 7 of 20 blows met by the buckler first, 0 fell, 6 trials (`?play=ratings&evaluation=cover&subject=option&version=02da390f0499ae23`)

### Rogue

- **empty,empty, stand-up**: short
  - rising-target/standard: 13 of 16 stood, 0 within 6 s, median 16.7 s (`?play=ratings&evaluation=rising-target&subject=game&version=91066ec772586741`)
- **empty,empty, walk**: short
  - locomotion/every: 2 of 47 fell, walk along 0.98 of the pace asked (median) (`?play=ratings&evaluation=locomotion&subject=option&version=f1c53e291ae6948e`)
- **empty,empty, run**: short
  - locomotion/run: 0 of 32 met, 28 fell; short: run-held, run-turn, run-stop (`?play=ratings&evaluation=locomotion&subject=option&version=6903c3a0de3b5adc`)
- **empty,empty, punch**: short
  - strike/still: 23 of 30 thrown, 0 fell, 34 refused, 64 trials (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch&version=d8128035105153bf`)
  - strike/walk-bodies: 42 of 64 thrown, 0 fell, 64 refused, 128 trials (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch&version=f05aee0b47b0a119`)
  - strike/fight-bodies: 0 of 2 on the body, 0 fell, 10 refused, 16 trials (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch&version=fb8eeedcb7df65ba`)
- **empty,empty, stomp**: met
  - strike/stomping-bodies: 7 of 7 thrown, 0 fell, 4 refused, 12 trials (`?play=ratings&evaluation=strike&subject=option%2Fstomp&version=922a202826ac9b87`)
- **empty,empty, front-kick**: short
  - strike/kicking-bodies: 0 of 0 thrown, 0 fell, 18 refused, 18 trials (`?play=ratings&evaluation=strike&subject=option%2Flow-kick&version=bcab44e5c1b8fb24`)
- **empty,club, stand-up**: short
  - rising-target/standard: 11 of 16 stood, 0 within 6 s, median 21.7 s (`?play=ratings&evaluation=rising-target&subject=game&version=91066ec772586741`)
- **empty,club, walk**: short
  - locomotion/every: 3 of 47 fell, walk along 0.99 of the pace asked (median) (`?play=ratings&evaluation=locomotion&subject=option&version=f1c53e291ae6948e`)
- **empty,club, run**: short
  - locomotion/run: 0 of 32 met, 6 fell; short: run-held, run-turn, run-stop (`?play=ratings&evaluation=locomotion&subject=option&version=6903c3a0de3b5adc`)
- **empty,club, punch**: short
  - strike/still: 3 of 6 thrown, 0 fell, 56 refused, 64 trials (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Cclub&version=1d6a9d8194d2b690`)
  - strike/walk-bodies: 4 of 22 thrown, 0 fell, 105 refused, 128 trials (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Cclub&version=7a08596f13a5c1ea`)
  - strike/fight-bodies: 0 of 1 on the body, 1 fell, 12 refused, 16 trials (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Cclub&version=0c7d515d9a776a72`)
- **empty,club, stomp**: short
  - strike/stomping-bodies: 4 of 7 thrown, 3 fell, 3 refused, 12 trials (`?play=ratings&evaluation=strike&subject=option%2Fstomp%40empty%2Cclub&version=c529bad1f7156ae0`)
- **empty,club, front-kick**: short
  - strike/kicking-bodies: 0 of 0 thrown, 0 fell, 18 refused, 18 trials (`?play=ratings&evaluation=strike&subject=option%2Flow-kick%40empty%2Cclub&version=29b44f3f5056f5ef`)
- **empty,club, club-blow**: short
  - strike/still: 0 of 0 thrown, 0 fell, 64 refused, 64 trials (`?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40empty%2Cclub&version=1ef9ec97fd15dd0a`)
  - strike/walk-bodies: 0 of 0 thrown, 0 fell, 128 refused, 128 trials (`?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40empty%2Cclub&version=c568cc3155c017d1`)
  - strike/fight-bodies: 0 of 0 on the body, 0 fell, 16 refused, 16 trials (`?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40empty%2Cclub&version=f6d7c8d2290ad368`)
- **buckler,club, stand-up**: short
  - equipped-rise/every: 3 of 16 stood, 0 within 6 s, median 30.0 s (`?play=ratings&evaluation=equipped-rise&subject=option&version=dae4771ef480669b`)
- **buckler,club, walk**: short
  - locomotion/every: 3 of 47 fell, walk along 0.98 of the pace asked (median) (`?play=ratings&evaluation=locomotion&subject=option&version=f1c53e291ae6948e`)
- **buckler,club, run**: short
  - locomotion/run: 0 of 32 met, 9 fell; short: run-held, run-turn, run-stop (`?play=ratings&evaluation=locomotion&subject=option&version=6903c3a0de3b5adc`)
- **buckler,club, stomp**: short
  - strike/stomping-bodies: 1 of 4 thrown, 3 fell, 7 refused, 12 trials (`?play=ratings&evaluation=strike&subject=option%2Fstomp%40buckler%2Cclub&version=9001c8483c7d2cfb`)
- **buckler,club, front-kick**: short
  - strike/kicking-bodies: 0 of 0 thrown, 0 fell, 18 refused, 18 trials (`?play=ratings&evaluation=strike&subject=option%2Flow-kick%40buckler%2Cclub&version=c1ac4e8bae92baeb`)
- **buckler,club, club-blow**: short
  - strike/still: 0 of 0 thrown, 0 fell, 64 refused, 64 trials (`?play=ratings&evaluation=strike&subject=club-blow60&version=d02e401d32ed9026`)
  - strike/walk-bodies: 0 of 0 thrown, 0 fell, 128 refused, 128 trials (`?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40buckler%2Cclub&version=6ea887ac74fa57fc`)
  - strike/fight-bodies: 0 of 0 on the body, 0 fell, 0 refused, 16 trials (`?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40buckler%2Cclub&version=e8971e2cdb5b783d`)
- **buckler,club, buckler-cover**: short
  - cover/club: 6 of 19 blows met by the buckler first, 0 fell, 6 trials (`?play=ratings&evaluation=cover&subject=option&version=b0ac4f4bdb228525`)
  - cover/sword: 9 of 18 blows met by the buckler first, 0 fell, 6 trials (`?play=ratings&evaluation=cover&subject=option&version=02da390f0499ae23`)
- **empty,sword, stand-up**: short
  - equipped-rise/every: 11 of 16 stood, 0 within 6 s, median 18.0 s (`?play=ratings&evaluation=equipped-rise&subject=option&version=dae4771ef480669b`)
- **empty,sword, walk**: short
  - locomotion/every: 5 of 47 fell, walk along 0.98 of the pace asked (median) (`?play=ratings&evaluation=locomotion&subject=option&version=f1c53e291ae6948e`)
- **empty,sword, run**: short
  - locomotion/run: 0 of 32 met, 24 fell; short: run-held, run-turn, run-stop (`?play=ratings&evaluation=locomotion&subject=option&version=6903c3a0de3b5adc`)
- **empty,sword, punch**: short
  - strike/still: 4 of 8 thrown, 0 fell, 54 refused, 64 trials (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Csword&version=93da62810dee65e5`)
  - strike/walk-bodies: 21 of 32 thrown, 0 fell, 96 refused, 128 trials (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Csword&version=41f620c429bc99ee`)
  - strike/fight-bodies: 0 of 0 on the body, 0 fell, 11 refused, 16 trials (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Csword&version=cc58bf734f8dec23`)
- **empty,sword, stomp**: short
  - strike/stomping-bodies: 7 of 7 thrown, 1 fell, 2 refused, 12 trials (`?play=ratings&evaluation=strike&subject=option%2Fstomp%40empty%2Csword&version=9f157fde6037e3f3`)
- **empty,sword, front-kick**: short
  - strike/kicking-bodies: 0 of 0 thrown, 0 fell, 18 refused, 18 trials (`?play=ratings&evaluation=strike&subject=option%2Flow-kick%40empty%2Csword&version=fed90a2f98d4868d`)
- **empty,sword, cut**: short
  - strike/still: 0 of 0 thrown, 0 fell, 64 refused, 64 trials (`?play=ratings&evaluation=strike&subject=option%2Fsword-cut%40empty%2Csword&version=01cc29283dd92e34`)
  - strike/walk-bodies: 0 of 0 thrown, 0 fell, 128 refused, 128 trials (`?play=ratings&evaluation=strike&subject=option%2Fsword-cut%40empty%2Csword&version=9f6be6021a2cf3ed`)
  - strike/fight-bodies: 0 of 0 on the body, 0 fell, 12 refused, 16 trials (`?play=ratings&evaluation=strike&subject=option%2Fsword-cut%40empty%2Csword&version=40bf4d613b3fc9f2`)
- **empty,sword, thrust**: short
  - strike/still: 0 of 0 thrown, 0 fell, 64 refused, 64 trials (`?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40empty%2Csword&version=8353008ca3d04383`)
  - strike/walk-bodies: 0 of 0 thrown, 0 fell, 128 refused, 128 trials (`?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40empty%2Csword&version=90ae4c33cab980a6`)
  - strike/fight-bodies: 0 of 0 on the body, 0 fell, 12 refused, 16 trials (`?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40empty%2Csword&version=0ab5d39b17d82bb9`)
- **buckler,sword, stand-up**: short
  - equipped-rise/every: 6 of 16 stood, 0 within 6 s, median 30.0 s (`?play=ratings&evaluation=equipped-rise&subject=option&version=dae4771ef480669b`)
- **buckler,sword, walk**: met
  - locomotion/every: 0 of 47 fell, walk along 0.97 of the pace asked (median) (`?play=ratings&evaluation=locomotion&subject=option&version=f1c53e291ae6948e`)
- **buckler,sword, run**: short
  - locomotion/run: 0 of 32 met, 24 fell; short: run-held, run-turn, run-stop (`?play=ratings&evaluation=locomotion&subject=option&version=6903c3a0de3b5adc`)
- **buckler,sword, stomp**: met
  - strike/stomping-bodies: 1 of 1 thrown, 0 fell, 9 refused, 12 trials (`?play=ratings&evaluation=strike&subject=option%2Fstomp%40buckler%2Csword&version=cfffa7f264b50376`)
- **buckler,sword, front-kick**: short
  - strike/kicking-bodies: 0 of 0 thrown, 0 fell, 18 refused, 18 trials (`?play=ratings&evaluation=strike&subject=option%2Flow-kick%40buckler%2Csword&version=e5f68e99fb12eebb`)
- **buckler,sword, cut**: short
  - strike/still: 0 of 0 thrown, 0 fell, 64 refused, 64 trials (`?play=ratings&evaluation=strike&subject=option%2Fsword-cut%40buckler%2Csword&version=4d9bd33612d360d0`)
  - strike/walk-bodies: 0 of 0 thrown, 0 fell, 128 refused, 128 trials (`?play=ratings&evaluation=strike&subject=option%2Fsword-cut%40buckler%2Csword&version=a3d2506d93c54a03`)
  - strike/fight-bodies: 0 of 0 on the body, 0 fell, 0 refused, 16 trials (`?play=ratings&evaluation=strike&subject=option%2Fsword-cut%40buckler%2Csword&version=43f447a5855d6953`)
- **buckler,sword, thrust**: short
  - strike/still: 0 of 0 thrown, 0 fell, 64 refused, 64 trials (`?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40buckler%2Csword&version=f757fd8b891338c6`)
  - strike/walk-bodies: 0 of 0 thrown, 0 fell, 128 refused, 128 trials (`?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40buckler%2Csword&version=a5f7b22a993f2aa0`)
  - strike/fight-bodies: 0 of 0 on the body, 0 fell, 0 refused, 16 trials (`?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40buckler%2Csword&version=7fa82eb52db5d6fc`)
- **buckler,sword, buckler-cover**: short
  - cover/club: 1 of 13 blows met by the buckler first, 0 fell, 6 trials (`?play=ratings&evaluation=cover&subject=option&version=b0ac4f4bdb228525`)
  - cover/sword: 13 of 21 blows met by the buckler first, 0 fell, 6 trials (`?play=ratings&evaluation=cover&subject=option&version=02da390f0499ae23`)

### Skeleton

- **empty,empty, stand-up**: short
  - equipped-rise/every: 0 of 15 stood, median - s of those (`?play=ratings&evaluation=equipped-rise&subject=option&version=dae4771ef480669b`)
- **empty,empty, walk**: short
  - locomotion/every: 30 of 47 fell, walk along 0.93 of the pace asked (median) (`?play=ratings&evaluation=locomotion&subject=option&version=f1c53e291ae6948e`)
- **empty,empty, punch**: short
  - strike/still-bodies: 0 of 0 thrown, 0 fell, 64 refused, 64 trials (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch&version=aed3a7a7518f44e2`)
  - strike/walk-bodies: 0 of 0 thrown, 0 fell, 128 refused, 128 trials (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch&version=f05aee0b47b0a119`)
  - strike/fight-bodies: 0 of 0 on the body, 0 fell, 0 refused, 16 trials (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch&version=fb8eeedcb7df65ba`)
- **empty,empty, stomp**: short
  - strike/stomping-bodies: 0 of 0 thrown, 0 fell, 12 refused, 12 trials (`?play=ratings&evaluation=strike&subject=option%2Fstomp&version=922a202826ac9b87`)
- **empty,empty, front-kick**: short
  - strike/kicking: 0 of 1 thrown, 1 fell, 1 refused, 18 trials (`?play=ratings&evaluation=strike&subject=option%2Flow-kick&version=54900567d308105b`)
- **empty,club, stand-up**: short
  - equipped-rise/every: 0 of 15 stood, median - s of those (`?play=ratings&evaluation=equipped-rise&subject=option&version=dae4771ef480669b`)
- **empty,club, walk**: short
  - locomotion/every: 27 of 47 fell, walk along 0.74 of the pace asked (median) (`?play=ratings&evaluation=locomotion&subject=option&version=f1c53e291ae6948e`)
- **empty,club, punch**: short
  - strike/still-bodies: 0 of 0 thrown, 0 fell, 64 refused, 64 trials (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Cclub&version=c400e237ce1f0258`)
  - strike/walk-bodies: 0 of 0 thrown, 0 fell, 128 refused, 128 trials (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Cclub&version=7a08596f13a5c1ea`)
  - strike/fight-bodies: 0 of 0 on the body, 0 fell, 0 refused, 16 trials (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Cclub&version=0c7d515d9a776a72`)
- **empty,club, stomp**: short
  - strike/stomping-bodies: 0 of 0 thrown, 0 fell, 12 refused, 12 trials (`?play=ratings&evaluation=strike&subject=option%2Fstomp%40empty%2Cclub&version=c529bad1f7156ae0`)
- **empty,club, front-kick**: short
  - strike/kicking: 0 of 0 thrown, 0 fell, 0 refused, 18 trials (`?play=ratings&evaluation=strike&subject=option%2Flow-kick%40empty%2Cclub&version=cb32ea3ac2d899fe`)
- **empty,club, club-blow**: short
  - strike/still-bodies: 0 of 0 thrown, 0 fell, 64 refused, 64 trials (`?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40empty%2Cclub&version=0723cb4b2798dbed`)
  - strike/walk-bodies: 0 of 0 thrown, 0 fell, 128 refused, 128 trials (`?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40empty%2Cclub&version=c568cc3155c017d1`)
  - strike/fight-bodies: 0 of 0 on the body, 0 fell, 0 refused, 16 trials (`?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40empty%2Cclub&version=f6d7c8d2290ad368`)
- **buckler,club, stand-up**: short
  - equipped-rise/every: 0 of 15 stood, median - s of those (`?play=ratings&evaluation=equipped-rise&subject=option&version=dae4771ef480669b`)
- **buckler,club, walk**: short
  - locomotion/every: 30 of 47 fell, walk along 0.00 of the pace asked (median) (`?play=ratings&evaluation=locomotion&subject=option&version=f1c53e291ae6948e`)
- **buckler,club, stomp**: short
  - strike/stomping-bodies: 0 of 0 thrown, 0 fell, 12 refused, 12 trials (`?play=ratings&evaluation=strike&subject=option%2Fstomp%40buckler%2Cclub&version=9001c8483c7d2cfb`)
- **buckler,club, front-kick**: short
  - strike/kicking: 0 of 0 thrown, 0 fell, 0 refused, 18 trials (`?play=ratings&evaluation=strike&subject=option%2Flow-kick%40buckler%2Cclub&version=7f82a348886e2e32`)
- **buckler,club, club-blow**: short
  - strike/still-bodies: 0 of 0 thrown, 6 fell, 58 refused, 64 trials (`?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40buckler%2Cclub&version=2ec436447acc3afd`)
  - strike/walk-bodies: 0 of 0 thrown, 4 fell, 124 refused, 128 trials (`?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40buckler%2Cclub&version=6ea887ac74fa57fc`)
  - strike/fight-bodies: 0 of 0 on the body, 0 fell, 0 refused, 16 trials (`?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40buckler%2Cclub&version=e8971e2cdb5b783d`)
- **buckler,club, buckler-cover**: short
  - cover/club: 9 of 18 blows met by the buckler first, 3 fell, 6 trials (`?play=ratings&evaluation=cover&subject=option&version=b0ac4f4bdb228525`)
  - cover/sword: 10 of 17 blows met by the buckler first, 2 fell, 6 trials (`?play=ratings&evaluation=cover&subject=option&version=02da390f0499ae23`)
- **empty,sword, stand-up**: short
  - equipped-rise/every: 0 of 14 stood, median - s of those (`?play=ratings&evaluation=equipped-rise&subject=option&version=dae4771ef480669b`)
- **empty,sword, walk**: short
  - locomotion/every: 27 of 47 fell, walk along 1.17 of the pace asked (median) (`?play=ratings&evaluation=locomotion&subject=option&version=f1c53e291ae6948e`)
- **empty,sword, punch**: short
  - strike/still-bodies: 0 of 0 thrown, 0 fell, 64 refused, 64 trials (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Csword&version=ecd5ddcfbc387f43`)
  - strike/walk-bodies: 0 of 0 thrown, 0 fell, 128 refused, 128 trials (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Csword&version=41f620c429bc99ee`)
  - strike/fight-bodies: 0 of 0 on the body, 0 fell, 0 refused, 16 trials (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Csword&version=cc58bf734f8dec23`)
- **empty,sword, stomp**: short
  - strike/stomping-bodies: 0 of 0 thrown, 0 fell, 12 refused, 12 trials (`?play=ratings&evaluation=strike&subject=option%2Fstomp%40empty%2Csword&version=9f157fde6037e3f3`)
- **empty,sword, front-kick**: short
  - strike/kicking: 0 of 0 thrown, 0 fell, 0 refused, 18 trials (`?play=ratings&evaluation=strike&subject=option%2Flow-kick%40empty%2Csword&version=301b98d4b4600118`)
- **empty,sword, cut**: short
  - strike/still-bodies: 0 of 0 thrown, 0 fell, 64 refused, 64 trials (`?play=ratings&evaluation=strike&subject=option%2Fsword-cut%40empty%2Csword&version=d0b7c6f86b54957e`)
  - strike/walk-bodies: 0 of 0 thrown, 0 fell, 128 refused, 128 trials (`?play=ratings&evaluation=strike&subject=option%2Fsword-cut%40empty%2Csword&version=9f6be6021a2cf3ed`)
  - strike/fight-bodies: 0 of 0 on the body, 0 fell, 0 refused, 16 trials (`?play=ratings&evaluation=strike&subject=option%2Fsword-cut%40empty%2Csword&version=40bf4d613b3fc9f2`)
- **empty,sword, thrust**: short
  - strike/still-bodies: 0 of 0 thrown, 0 fell, 64 refused, 64 trials (`?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40empty%2Csword&version=1aca0d592ddb77ba`)
  - strike/walk-bodies: 0 of 0 thrown, 0 fell, 128 refused, 128 trials (`?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40empty%2Csword&version=90ae4c33cab980a6`)
  - strike/fight-bodies: 0 of 0 on the body, 0 fell, 0 refused, 16 trials (`?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40empty%2Csword&version=0ab5d39b17d82bb9`)
- **buckler,sword, stand-up**: short
  - equipped-rise/every: 0 of 14 stood, median - s of those (`?play=ratings&evaluation=equipped-rise&subject=option&version=dae4771ef480669b`)
- **buckler,sword, walk**: short
  - locomotion/every: 26 of 47 fell, walk along 0.75 of the pace asked (median) (`?play=ratings&evaluation=locomotion&subject=option&version=f1c53e291ae6948e`)
- **buckler,sword, stomp**: short
  - strike/stomping-bodies: 0 of 0 thrown, 0 fell, 12 refused, 12 trials (`?play=ratings&evaluation=strike&subject=option%2Fstomp%40buckler%2Csword&version=cfffa7f264b50376`)
- **buckler,sword, front-kick**: short
  - strike/kicking: 0 of 0 thrown, 0 fell, 0 refused, 18 trials (`?play=ratings&evaluation=strike&subject=option%2Flow-kick%40buckler%2Csword&version=0fa3a97418a046f5`)
- **buckler,sword, cut**: short
  - strike/still-bodies: 0 of 0 thrown, 4 fell, 60 refused, 64 trials (`?play=ratings&evaluation=strike&subject=option%2Fsword-cut%40buckler%2Csword&version=4a75a1fab824d414`)
  - strike/walk-bodies: 0 of 0 thrown, 0 fell, 128 refused, 128 trials (`?play=ratings&evaluation=strike&subject=option%2Fsword-cut%40buckler%2Csword&version=a3d2506d93c54a03`)
  - strike/fight-bodies: 0 of 0 on the body, 0 fell, 0 refused, 16 trials (`?play=ratings&evaluation=strike&subject=option%2Fsword-cut%40buckler%2Csword&version=43f447a5855d6953`)
- **buckler,sword, thrust**: short
  - strike/still-bodies: 0 of 0 thrown, 4 fell, 60 refused, 64 trials (`?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40buckler%2Csword&version=450da44c623a18a0`)
  - strike/walk-bodies: 0 of 0 thrown, 0 fell, 128 refused, 128 trials (`?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40buckler%2Csword&version=a5f7b22a993f2aa0`)
  - strike/fight-bodies: 0 of 0 on the body, 0 fell, 0 refused, 16 trials (`?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40buckler%2Csword&version=7fa82eb52db5d6fc`)
- **buckler,sword, buckler-cover**: short
  - cover/club: 14 of 26 blows met by the buckler first, 2 fell, 6 trials (`?play=ratings&evaluation=cover&subject=option&version=b0ac4f4bdb228525`)
  - cover/sword: 20 of 30 blows met by the buckler first, 0 fell, 6 trials (`?play=ratings&evaluation=cover&subject=option&version=02da390f0499ae23`)

