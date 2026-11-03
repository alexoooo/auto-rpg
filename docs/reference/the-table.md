# The table

Option Mind on every body, loadout and skill against its bar (`src/evaluation/table/`): 88 cells,
each judged by its drills' readings (`verdictOf`). `npm run evaluate -- table --play --workers 22`
plays every reading not current and writes it; Node, core world, `rapier-coordinate`, 120 Hz,
command delay 0. Each reading links its Ratings page.

## Open causes

- **Skills with no record for the body**: `usableSkills` leaves them out and the drill counts every
  trial refused. The Skeleton has no punch, club, cut or thrust record (`crypt-skeleton+toes`), and
  its stomp lands on nothing; the Rogue has no club, cut or thrust.
- **Blows weak or elsewhere**: in every fight rung but the punch's, no blow meets the foe's body
  past its arms; the punch begins only from standing quiet.
- **The run**: no cell meets it. The walk-run envelope (`assets/core/walk-run-envelope.json`) holds
  the toed Warrior to 0.7 m/s forward and the Rogue to 1.2 m/s, short of the run's 3 m/s.
- **Stand-up speed**: every body stands too slowly for the target, the Rogue and the Skeleton most
  of all holding an item; the Skeleton's roll from the back stalls with the club's arm across.
- **The Skeleton's walk**: holding the club alone, its catch lands short: the body rolls on over
  the catching foot and no second step is in time.
- **The buckler's cover**: it meets fewer blows first than its bar of 4 in 5.

## Each cell

| Body | Loadout | stand-up | walk | run | punch | stomp | club-blow | cut | thrust | buckler-cover |
|---|---|---|---|---|---|---|---|---|---|---|
| Warrior | empty,empty | short | short | short | short | short | – | – | – | – |
| Warrior | empty,club | short | short | short | short | short | short | – | – | – |
| Warrior | buckler,club | short | **met** | short | – | short | short | – | – | short |
| Warrior | empty,sword | short | **met** | short | short | short | – | short | short | – |
| Warrior | buckler,sword | short | **met** | short | – | short | – | short | short | short |
| Rogue | empty,empty | short | short | short | short | **met** | – | – | – | – |
| Rogue | empty,club | short | short | short | short | short | short | – | – | – |
| Rogue | buckler,club | short | short | short | – | short | short | – | – | short |
| Rogue | empty,sword | short | short | short | short | short | – | short | short | – |
| Rogue | buckler,sword | short | **met** | short | – | **met** | – | short | short | short |
| Skeleton | empty,empty | short | short | – | short | short | – | – | – | – |
| Skeleton | empty,club | short | short | – | short | short | short | – | – | – |
| Skeleton | buckler,club | short | short | – | – | short | short | – | – | short |
| Skeleton | empty,sword | short | short | – | short | short | – | short | short | – |
| Skeleton | buckler,sword | short | short | – | – | short | – | short | short | short |

### Warrior

- **empty,empty, stand-up**: short
  - rising-target/standard: 16 of 16 stood, 1 within 6 s, median 8.8 s (`?play=ratings&evaluation=rising-target&subject=game&version=ecb59f5a90d3beb6`)
- **empty,empty, walk**: short
  - locomotion/every: 2 of 47 fell, walk along 1.01 of the pace asked (median) (`?play=ratings&evaluation=locomotion&subject=option&version=a203f2b49d91beaa`)
- **empty,empty, run**: short
  - locomotion/run: 0 of 32 met, 5 fell; short: run-held, run-turn, run-stop (`?play=ratings&evaluation=locomotion&subject=option&version=6903c3a0de3b5adc`)
- **empty,empty, punch**: short (still met)
  - strike/still: 31 of 32 thrown, 0 fell, 32 refused, 64 trials (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch&version=e1de089a1341813b`)
  - strike/walk: 52 of 64 thrown, 0 fell, 64 refused, 128 trials (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch&version=b71bc87e110f04bd`)
  - strike/fight: 0 of 3 on the body, 0 fell, 8 refused, 16 trials (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch&version=636a427499ab7f9c`)
- **empty,empty, stomp**: short
  - strike/stomping: 4 of 5 thrown, 0 fell, 7 refused, 12 trials (`?play=ratings&evaluation=strike&subject=stomp60&version=69250816729e6455`)
- **empty,club, stand-up**: short
  - rising-target/standard: 16 of 16 stood, 1 within 6 s, median 10.7 s (`?play=ratings&evaluation=rising-target&subject=game&version=ecb59f5a90d3beb6`)
- **empty,club, walk**: short
  - locomotion/every: 1 of 47 fell, walk along 1.02 of the pace asked (median) (`?play=ratings&evaluation=locomotion&subject=option&version=a203f2b49d91beaa`)
- **empty,club, run**: short
  - locomotion/run: 0 of 32 met, 5 fell; short: run-held, run-turn, run-stop (`?play=ratings&evaluation=locomotion&subject=option&version=6903c3a0de3b5adc`)
- **empty,club, punch**: short
  - strike/still: 5 of 14 thrown, 0 fell, 50 refused, 64 trials (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Cclub&version=1d6a9d8194d2b690`)
  - strike/walk: 6 of 24 thrown, 0 fell, 97 refused, 128 trials (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Cclub&version=9b635ab1b9e7dd52`)
  - strike/fight: 0 of 0 on the body, 0 fell, 7 refused, 16 trials (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Cclub&version=a770874fcc1c91e4`)
- **empty,club, stomp**: short
  - strike/stomping: 2 of 6 thrown, 1 fell, 4 refused, 12 trials (`?play=ratings&evaluation=strike&subject=option%2Fstomp%40empty%2Cclub&version=fb99f066ffa0519e`)
- **empty,club, club-blow**: short
  - strike/still: 6 of 16 thrown, 1 fell, 48 refused, 64 trials (`?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40empty%2Cclub&version=1ef9ec97fd15dd0a`)
  - strike/walk: 9 of 29 thrown, 0 fell, 99 refused, 128 trials (`?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40empty%2Cclub&version=1d1b9ef6e679d6c5`)
  - strike/fight: 0 of 1 on the body, 0 fell, 6 refused, 16 trials (`?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40empty%2Cclub&version=15963d0b5ff800ac`)
- **buckler,club, stand-up**: short
  - equipped-rise/every: 16 of 16 stood, 0 within 6 s, median 9.3 s (`?play=ratings&evaluation=equipped-rise&subject=option&version=fdcddc5fd95608ac`)
- **buckler,club, walk**: met
  - locomotion/every: 0 of 47 fell, walk along 1.02 of the pace asked (median) (`?play=ratings&evaluation=locomotion&subject=option&version=a203f2b49d91beaa`)
- **buckler,club, run**: short
  - locomotion/run: 0 of 32 met, 0 fell; short: run-held, run-turn, run-stop (`?play=ratings&evaluation=locomotion&subject=option&version=6903c3a0de3b5adc`)
- **buckler,club, stomp**: short
  - strike/stomping: 3 of 8 thrown, 0 fell, 2 refused, 12 trials (`?play=ratings&evaluation=strike&subject=option%2Fstomp%40buckler%2Cclub&version=317c4ef6fa502cc1`)
- **buckler,club, club-blow**: short
  - strike/still: 12 of 16 thrown, 0 fell, 48 refused, 64 trials (`?play=ratings&evaluation=strike&subject=club-blow60&version=d02e401d32ed9026`)
  - strike/walk: 6 of 29 thrown, 0 fell, 99 refused, 128 trials (`?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40buckler%2Cclub&version=7f3e41dca14ec88e`)
  - strike/fight: 0 of 0 on the body, 0 fell, 13 refused, 16 trials (`?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40buckler%2Cclub&version=e0dea9fc9459ad43`)
- **buckler,club, buckler-cover**: short
  - cover/club: 2 of 16 blows met by the buckler first, 0 fell, 6 trials (`?play=ratings&evaluation=cover&subject=option&version=b0ac4f4bdb228525`)
  - cover/sword: 6 of 14 blows met by the buckler first, 0 fell, 6 trials (`?play=ratings&evaluation=cover&subject=option&version=02da390f0499ae23`)
- **empty,sword, stand-up**: short
  - equipped-rise/every: 14 of 16 stood, 3 within 6 s, median 9.2 s (`?play=ratings&evaluation=equipped-rise&subject=option&version=fdcddc5fd95608ac`)
- **empty,sword, walk**: met
  - locomotion/every: 0 of 47 fell, walk along 1.02 of the pace asked (median) (`?play=ratings&evaluation=locomotion&subject=option&version=a203f2b49d91beaa`)
- **empty,sword, run**: short
  - locomotion/run: 0 of 32 met, 5 fell; short: run-held, run-turn, run-stop (`?play=ratings&evaluation=locomotion&subject=option&version=6903c3a0de3b5adc`)
- **empty,sword, punch**: short
  - strike/still: 9 of 14 thrown, 0 fell, 49 refused, 64 trials (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Csword&version=93da62810dee65e5`)
  - strike/walk: 20 of 32 thrown, 0 fell, 96 refused, 128 trials (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Csword&version=cff92bbdd05171f3`)
  - strike/fight: 0 of 0 on the body, 0 fell, 12 refused, 16 trials (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Csword&version=46e48e02a5130bcc`)
- **empty,sword, stomp**: short
  - strike/stomping: 1 of 5 thrown, 0 fell, 5 refused, 12 trials (`?play=ratings&evaluation=strike&subject=option%2Fstomp%40empty%2Csword&version=9ea861b917581918`)
- **empty,sword, cut**: short
  - strike/still: 0 of 13 thrown, 0 fell, 51 refused, 64 trials (`?play=ratings&evaluation=strike&subject=option%2Fsword-cut%40empty%2Csword&version=01cc29283dd92e34`)
  - strike/walk: 0 of 29 thrown, 0 fell, 99 refused, 128 trials (`?play=ratings&evaluation=strike&subject=option%2Fsword-cut%40empty%2Csword&version=4c83e89264450962`)
  - strike/fight: 0 of 0 on the body, 0 fell, 14 refused, 16 trials (`?play=ratings&evaluation=strike&subject=option%2Fsword-cut%40empty%2Csword&version=7f60efc55e0bcf29`)
- **empty,sword, thrust**: short
  - strike/still: 0 of 14 thrown, 0 fell, 49 refused, 64 trials (`?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40empty%2Csword&version=8353008ca3d04383`)
  - strike/walk: 0 of 32 thrown, 0 fell, 96 refused, 128 trials (`?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40empty%2Csword&version=ff8516384533d7a2`)
  - strike/fight: 0 of 0 on the body, 0 fell, 12 refused, 16 trials (`?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40empty%2Csword&version=602f098146aaee3e`)
- **buckler,sword, stand-up**: short
  - equipped-rise/every: 16 of 16 stood, 1 within 6 s, median 8.7 s (`?play=ratings&evaluation=equipped-rise&subject=option&version=fdcddc5fd95608ac`)
- **buckler,sword, walk**: met
  - locomotion/every: 0 of 47 fell, walk along 1.02 of the pace asked (median) (`?play=ratings&evaluation=locomotion&subject=option&version=a203f2b49d91beaa`)
- **buckler,sword, run**: short
  - locomotion/run: 0 of 32 met, 5 fell; short: run-held, run-turn, run-stop (`?play=ratings&evaluation=locomotion&subject=option&version=6903c3a0de3b5adc`)
- **buckler,sword, stomp**: short
  - strike/stomping: 2 of 6 thrown, 0 fell, 6 refused, 12 trials (`?play=ratings&evaluation=strike&subject=option%2Fstomp%40buckler%2Csword&version=75b802fa96711461`)
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
  - rising-target/standard: 15 of 16 stood, 0 within 6 s, median 13.6 s (`?play=ratings&evaluation=rising-target&subject=game&version=ecb59f5a90d3beb6`)
- **empty,empty, walk**: short
  - locomotion/every: 1 of 47 fell, walk along 0.98 of the pace asked (median) (`?play=ratings&evaluation=locomotion&subject=option&version=a203f2b49d91beaa`)
- **empty,empty, run**: short
  - locomotion/run: 0 of 32 met, 28 fell; short: run-held, run-turn, run-stop (`?play=ratings&evaluation=locomotion&subject=option&version=6903c3a0de3b5adc`)
- **empty,empty, punch**: short
  - strike/still: 8 of 30 thrown, 0 fell, 34 refused, 64 trials, her network trained with her elbows at twice their peak (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch&version=d71e316f0c869660`)
  - strike/walk-bodies: 19 of 64 thrown, 0 fell, 64 refused, 128 trials (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch&version=23aeb49499fd7f8a`)
  - strike/fight-bodies: 2 of 8 on the body, 0 fell, 8 refused, 16 trials (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch&version=d17b198620e27fa5`)
- **empty,empty, stomp**: met
  - strike/stomping-bodies: 7 of 7 thrown, 0 fell, 4 refused, 12 trials (`?play=ratings&evaluation=strike&subject=option%2Fstomp&version=922a202826ac9b87`)
- **empty,club, stand-up**: short
  - rising-target/standard: 11 of 16 stood, 0 within 6 s, median 16.7 s (`?play=ratings&evaluation=rising-target&subject=game&version=ecb59f5a90d3beb6`)
- **empty,club, walk**: short
  - locomotion/every: 1 of 47 fell, walk along 0.99 of the pace asked (median) (`?play=ratings&evaluation=locomotion&subject=option&version=a203f2b49d91beaa`)
- **empty,club, run**: short
  - locomotion/run: 0 of 32 met, 6 fell; short: run-held, run-turn, run-stop (`?play=ratings&evaluation=locomotion&subject=option&version=6903c3a0de3b5adc`)
- **empty,club, punch**: short
  - strike/still: 3 of 6 thrown, 0 fell, 56 refused, 64 trials (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Cclub&version=1d6a9d8194d2b690`)
  - strike/walk-bodies: 4 of 22 thrown, 0 fell, 105 refused, 128 trials (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Cclub&version=7a08596f13a5c1ea`)
  - strike/fight-bodies: 0 of 1 on the body, 1 fell, 12 refused, 16 trials (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Cclub&version=0c7d515d9a776a72`)
- **empty,club, stomp**: short
  - strike/stomping-bodies: 4 of 7 thrown, 3 fell, 3 refused, 12 trials (`?play=ratings&evaluation=strike&subject=option%2Fstomp%40empty%2Cclub&version=c529bad1f7156ae0`)
- **empty,club, club-blow**: short
  - strike/still: 0 of 0 thrown, 0 fell, 64 refused, 64 trials (`?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40empty%2Cclub&version=1ef9ec97fd15dd0a`)
  - strike/walk-bodies: 0 of 0 thrown, 0 fell, 128 refused, 128 trials (`?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40empty%2Cclub&version=c568cc3155c017d1`)
  - strike/fight-bodies: 0 of 0 on the body, 0 fell, 16 refused, 16 trials (`?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40empty%2Cclub&version=f6d7c8d2290ad368`)
- **buckler,club, stand-up**: short
  - equipped-rise/every: 9 of 16 stood, 0 within 6 s, median 24.7 s (`?play=ratings&evaluation=equipped-rise&subject=option&version=fdcddc5fd95608ac`)
- **buckler,club, walk**: short
  - locomotion/every: 2 of 47 fell, walk along 0.98 of the pace asked (median) (`?play=ratings&evaluation=locomotion&subject=option&version=a203f2b49d91beaa`)
- **buckler,club, run**: short
  - locomotion/run: 0 of 32 met, 9 fell; short: run-held, run-turn, run-stop (`?play=ratings&evaluation=locomotion&subject=option&version=6903c3a0de3b5adc`)
- **buckler,club, stomp**: short
  - strike/stomping-bodies: 1 of 4 thrown, 3 fell, 7 refused, 12 trials (`?play=ratings&evaluation=strike&subject=option%2Fstomp%40buckler%2Cclub&version=9001c8483c7d2cfb`)
- **buckler,club, club-blow**: short
  - strike/still: 0 of 0 thrown, 0 fell, 64 refused, 64 trials (`?play=ratings&evaluation=strike&subject=club-blow60&version=d02e401d32ed9026`)
  - strike/walk-bodies: 0 of 0 thrown, 0 fell, 128 refused, 128 trials (`?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40buckler%2Cclub&version=6ea887ac74fa57fc`)
  - strike/fight-bodies: 0 of 0 on the body, 0 fell, 0 refused, 16 trials (`?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40buckler%2Cclub&version=e8971e2cdb5b783d`)
- **buckler,club, buckler-cover**: short
  - cover/club: 6 of 19 blows met by the buckler first, 0 fell, 6 trials (`?play=ratings&evaluation=cover&subject=option&version=b0ac4f4bdb228525`)
  - cover/sword: 9 of 18 blows met by the buckler first, 0 fell, 6 trials (`?play=ratings&evaluation=cover&subject=option&version=02da390f0499ae23`)
- **empty,sword, stand-up**: short
  - equipped-rise/every: 14 of 16 stood, 0 within 6 s, median 12.9 s (`?play=ratings&evaluation=equipped-rise&subject=option&version=fdcddc5fd95608ac`)
- **empty,sword, walk**: short
  - locomotion/every: 3 of 47 fell, walk along 0.98 of the pace asked (median) (`?play=ratings&evaluation=locomotion&subject=option&version=a203f2b49d91beaa`)
- **empty,sword, run**: short
  - locomotion/run: 0 of 32 met, 24 fell; short: run-held, run-turn, run-stop (`?play=ratings&evaluation=locomotion&subject=option&version=6903c3a0de3b5adc`)
- **empty,sword, punch**: short
  - strike/still: 4 of 8 thrown, 0 fell, 54 refused, 64 trials (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Csword&version=93da62810dee65e5`)
  - strike/walk-bodies: 21 of 32 thrown, 0 fell, 96 refused, 128 trials (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Csword&version=41f620c429bc99ee`)
  - strike/fight-bodies: 0 of 0 on the body, 0 fell, 11 refused, 16 trials (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Csword&version=cc58bf734f8dec23`)
- **empty,sword, stomp**: short
  - strike/stomping-bodies: 7 of 7 thrown, 1 fell, 2 refused, 12 trials (`?play=ratings&evaluation=strike&subject=option%2Fstomp%40empty%2Csword&version=9f157fde6037e3f3`)
- **empty,sword, cut**: short
  - strike/still: 0 of 0 thrown, 0 fell, 64 refused, 64 trials (`?play=ratings&evaluation=strike&subject=option%2Fsword-cut%40empty%2Csword&version=01cc29283dd92e34`)
  - strike/walk-bodies: 0 of 0 thrown, 0 fell, 128 refused, 128 trials (`?play=ratings&evaluation=strike&subject=option%2Fsword-cut%40empty%2Csword&version=9f6be6021a2cf3ed`)
  - strike/fight-bodies: 0 of 0 on the body, 0 fell, 12 refused, 16 trials (`?play=ratings&evaluation=strike&subject=option%2Fsword-cut%40empty%2Csword&version=40bf4d613b3fc9f2`)
- **empty,sword, thrust**: short
  - strike/still: 0 of 0 thrown, 0 fell, 64 refused, 64 trials (`?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40empty%2Csword&version=8353008ca3d04383`)
  - strike/walk-bodies: 0 of 0 thrown, 0 fell, 128 refused, 128 trials (`?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40empty%2Csword&version=90ae4c33cab980a6`)
  - strike/fight-bodies: 0 of 0 on the body, 0 fell, 12 refused, 16 trials (`?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40empty%2Csword&version=0ab5d39b17d82bb9`)
- **buckler,sword, stand-up**: short
  - equipped-rise/every: 11 of 16 stood, 0 within 6 s, median 23.8 s (`?play=ratings&evaluation=equipped-rise&subject=option&version=fdcddc5fd95608ac`)
- **buckler,sword, walk**: met
  - locomotion/every: 0 of 47 fell, walk along 0.97 of the pace asked (median) (`?play=ratings&evaluation=locomotion&subject=option&version=a203f2b49d91beaa`)
- **buckler,sword, run**: short
  - locomotion/run: 0 of 32 met, 24 fell; short: run-held, run-turn, run-stop (`?play=ratings&evaluation=locomotion&subject=option&version=6903c3a0de3b5adc`)
- **buckler,sword, stomp**: met
  - strike/stomping-bodies: 1 of 1 thrown, 0 fell, 9 refused, 12 trials (`?play=ratings&evaluation=strike&subject=option%2Fstomp%40buckler%2Csword&version=cfffa7f264b50376`)
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
  - equipped-rise/every: 13 of 15 stood, median 13.4 s of those (`?play=ratings&evaluation=equipped-rise&subject=option&version=fdcddc5fd95608ac`)
- **empty,empty, walk**: short
  - locomotion/every: 5 of 47 fell, walk along 0.93 of the pace asked (median) (`?play=ratings&evaluation=locomotion&subject=option&version=a203f2b49d91beaa`)
- **empty,empty, punch**: short
  - strike/still-bodies: 0 of 0 thrown, 0 fell, 64 refused, 64 trials (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch&version=aed3a7a7518f44e2`)
  - strike/walk-bodies: 0 of 0 thrown, 0 fell, 128 refused, 128 trials (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch&version=f05aee0b47b0a119`)
  - strike/fight-bodies: 0 of 0 on the body, 0 fell, 0 refused, 16 trials (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch&version=fb8eeedcb7df65ba`)
- **empty,empty, stomp**: short
  - strike/stomping-bodies: 0 of 0 thrown, 0 fell, 12 refused, 12 trials (`?play=ratings&evaluation=strike&subject=option%2Fstomp&version=922a202826ac9b87`)
- **empty,club, stand-up**: short
  - equipped-rise/every: 0 of 15 stood, median - s of those (`?play=ratings&evaluation=equipped-rise&subject=option&version=fdcddc5fd95608ac`)
- **empty,club, walk**: short
  - locomotion/every: 8 of 47 fell, walk along 0.74 of the pace asked (median) (`?play=ratings&evaluation=locomotion&subject=option&version=a203f2b49d91beaa`)
- **empty,club, punch**: short
  - strike/still-bodies: 0 of 0 thrown, 0 fell, 64 refused, 64 trials (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Cclub&version=c400e237ce1f0258`)
  - strike/walk-bodies: 0 of 0 thrown, 0 fell, 128 refused, 128 trials (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Cclub&version=7a08596f13a5c1ea`)
  - strike/fight-bodies: 0 of 0 on the body, 0 fell, 0 refused, 16 trials (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Cclub&version=0c7d515d9a776a72`)
- **empty,club, stomp**: short
  - strike/stomping-bodies: 0 of 0 thrown, 0 fell, 12 refused, 12 trials (`?play=ratings&evaluation=strike&subject=option%2Fstomp%40empty%2Cclub&version=c529bad1f7156ae0`)
- **empty,club, club-blow**: short
  - strike/still-bodies: 0 of 0 thrown, 0 fell, 64 refused, 64 trials (`?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40empty%2Cclub&version=0723cb4b2798dbed`)
  - strike/walk-bodies: 0 of 0 thrown, 0 fell, 128 refused, 128 trials (`?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40empty%2Cclub&version=c568cc3155c017d1`)
  - strike/fight-bodies: 0 of 0 on the body, 0 fell, 0 refused, 16 trials (`?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40empty%2Cclub&version=f6d7c8d2290ad368`)
- **buckler,club, stand-up**: short
  - equipped-rise/every: 1 of 15 stood, median 13.1 s of those (`?play=ratings&evaluation=equipped-rise&subject=option&version=fdcddc5fd95608ac`)
- **buckler,club, walk**: short
  - locomotion/every: 8 of 47 fell, walk along 0.00 of the pace asked (median) (`?play=ratings&evaluation=locomotion&subject=option&version=a203f2b49d91beaa`)
- **buckler,club, stomp**: short
  - strike/stomping-bodies: 0 of 0 thrown, 0 fell, 12 refused, 12 trials (`?play=ratings&evaluation=strike&subject=option%2Fstomp%40buckler%2Cclub&version=9001c8483c7d2cfb`)
- **buckler,club, club-blow**: short
  - strike/still-bodies: 0 of 0 thrown, 6 fell, 58 refused, 64 trials (`?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40buckler%2Cclub&version=2ec436447acc3afd`)
  - strike/walk-bodies: 0 of 0 thrown, 4 fell, 124 refused, 128 trials (`?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40buckler%2Cclub&version=6ea887ac74fa57fc`)
  - strike/fight-bodies: 0 of 0 on the body, 0 fell, 0 refused, 16 trials (`?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40buckler%2Cclub&version=e8971e2cdb5b783d`)
- **buckler,club, buckler-cover**: short
  - cover/club: 9 of 18 blows met by the buckler first, 3 fell, 6 trials (`?play=ratings&evaluation=cover&subject=option&version=b0ac4f4bdb228525`)
  - cover/sword: 10 of 17 blows met by the buckler first, 2 fell, 6 trials (`?play=ratings&evaluation=cover&subject=option&version=02da390f0499ae23`)
- **empty,sword, stand-up**: short
  - equipped-rise/every: 6 of 14 stood, median 18.3 s of those (`?play=ratings&evaluation=equipped-rise&subject=option&version=fdcddc5fd95608ac`)
- **empty,sword, walk**: short
  - locomotion/every: 3 of 47 fell, walk along 1.17 of the pace asked (median) (`?play=ratings&evaluation=locomotion&subject=option&version=a203f2b49d91beaa`)
- **empty,sword, punch**: short
  - strike/still-bodies: 0 of 0 thrown, 0 fell, 64 refused, 64 trials (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Csword&version=ecd5ddcfbc387f43`)
  - strike/walk-bodies: 0 of 0 thrown, 0 fell, 128 refused, 128 trials (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Csword&version=41f620c429bc99ee`)
  - strike/fight-bodies: 0 of 0 on the body, 0 fell, 0 refused, 16 trials (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Csword&version=cc58bf734f8dec23`)
- **empty,sword, stomp**: short
  - strike/stomping-bodies: 0 of 0 thrown, 0 fell, 12 refused, 12 trials (`?play=ratings&evaluation=strike&subject=option%2Fstomp%40empty%2Csword&version=9f157fde6037e3f3`)
- **empty,sword, cut**: short
  - strike/still-bodies: 0 of 0 thrown, 0 fell, 64 refused, 64 trials (`?play=ratings&evaluation=strike&subject=option%2Fsword-cut%40empty%2Csword&version=d0b7c6f86b54957e`)
  - strike/walk-bodies: 0 of 0 thrown, 0 fell, 128 refused, 128 trials (`?play=ratings&evaluation=strike&subject=option%2Fsword-cut%40empty%2Csword&version=9f6be6021a2cf3ed`)
  - strike/fight-bodies: 0 of 0 on the body, 0 fell, 0 refused, 16 trials (`?play=ratings&evaluation=strike&subject=option%2Fsword-cut%40empty%2Csword&version=40bf4d613b3fc9f2`)
- **empty,sword, thrust**: short
  - strike/still-bodies: 0 of 0 thrown, 0 fell, 64 refused, 64 trials (`?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40empty%2Csword&version=1aca0d592ddb77ba`)
  - strike/walk-bodies: 0 of 0 thrown, 0 fell, 128 refused, 128 trials (`?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40empty%2Csword&version=90ae4c33cab980a6`)
  - strike/fight-bodies: 0 of 0 on the body, 0 fell, 0 refused, 16 trials (`?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40empty%2Csword&version=0ab5d39b17d82bb9`)
- **buckler,sword, stand-up**: short
  - equipped-rise/every: 3 of 14 stood, median 26.1 s of those (`?play=ratings&evaluation=equipped-rise&subject=option&version=fdcddc5fd95608ac`)
- **buckler,sword, walk**: short
  - locomotion/every: 2 of 47 fell, walk along 0.75 of the pace asked (median) (`?play=ratings&evaluation=locomotion&subject=option&version=a203f2b49d91beaa`)
- **buckler,sword, stomp**: short
  - strike/stomping-bodies: 0 of 0 thrown, 0 fell, 12 refused, 12 trials (`?play=ratings&evaluation=strike&subject=option%2Fstomp%40buckler%2Csword&version=cfffa7f264b50376`)
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
