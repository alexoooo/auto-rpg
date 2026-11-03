# The table

Option Mind on every body, loadout and skill against its bar (`src/evaluation/table/`): 88 cells,
each judged by its drills' readings (`verdictOf`): 9 met, 73 short, 6 not read.
`npm run evaluate -- table --play --workers 22` plays every reading not current and writes it;
Node, core world, `rapier-coordinate`, 120 Hz, each command 1 step late (`COMMAND_DELAY`). Each
reading below is its record's, read in that record's harness, and links its Ratings page.

| Skill | Met | Short | Not read |
| --- | ---: | ---: | ---: |
| stand-up | 0 | 15 | 0 |
| walk | 6 | 9 | 0 |
| run | 0 | 10 | 0 |
| punch | 0 | 9 | 0 |
| stomp | 3 | 12 | 0 |
| club-blow | 0 | 6 | 0 |
| cut | 0 | 0 | 6 |
| thrust | 0 | 6 | 0 |
| buckler-cover | 0 | 6 | 0 |

## Open causes

- **Every reading is of an earlier version**: none is current, and `--play` reads each again. The
  Skeleton's stomps holding an item, and its punches walking, in a fight or holding an item, are
  read on a version with no Skeleton record for them, and refuse every trial.
- **Skills with no record for the body**: `usableSkills` (`src/core/skills/action-config.ts`)
  leaves them out and the drill counts every trial refused. The Rogue and the Skeleton have no
  club-blow, cut or thrust record (`assets/core/club-blow.json`, `cut.json` and `sword-thrust.json`
  hold the Warrior's alone). The Skeleton has punch and stomp records (`crypt-skeleton+toes` in
  `assets/core/straight-punch.json` and `stomp.json`): read with them, it throws 32 punches standing
  still, none at its scaled bar, and lands 8 of 11 stomps with one fall.
- **Blows of the hands under their bar**: none lands 90 % of what it throws. The Warrior's
  empty-handed punch comes nearest (19 of 22 standing, 52 of 64 walking); the Rogue's lands 10 of
  28 and 19 of 64. The Warrior's club blow lands 0 to 9 of 15 to 29, its thrust 0 to 3 of 14 to 32.
- **The fight rungs**: few blows touch a body. The empty-handed punch lands 1 of 2 (Warrior) and 2
  of 8 (Rogue); holding an item, at most one blow touches in 16 trials, and none lands.
- **The cut is not read**: its walk and fight rungs have no rows under its subject
  (`option/cut@…`), nor its still rung with the sword alone; holding the buckler, the Warrior lands
  1 of 14 standing still.
- **The run**: no cell meets it, and the walk and run does not run. Its measured envelope
  (`assets/core/walk-run-envelope.json`, `walkRunEnvelope`) holds the toed Warrior to 0.7 m/s
  forward and the Rogue to 1.2 m/s, no faster than their walks' 2 and 1.4 m/s
  (`assets/core/stance-envelope.json`), so `walkRun` keeps to the walk (`pays`, its `may`), short
  of the run's 3 m/s.
- **Stand-up speed**: no body stands in time. The Warrior stands 14 of 16 within 10 s empty-handed
  (15 needed) and 8 to 13 holding an item; the Rogue 0 to 3, medians 12.9 to 30 s, and holding the
  club or the buckler 7 to 11 of 16 stand at all. The Skeleton's bar asks 15 of 16 falls stood
  (`verdictOf`'s `stood`), and its readings count 14 or 15 falls, so none can meet it; it
  stands 0 to 13 of them, none holding the club alone.
- **The walk**: short by a fall. The Warrior and the Rogue fall in one walk in 47 holding the
  buckler, and the Warrior with the club alone. The Skeleton falls in one empty-handed and in each
  club loadout, in three with the sword alone, and holding an item walks 1.15 to 1.21 of the pace
  asked.
- **Stomps holding an item**: read on an earlier version, with other stomp records than the ones
  now. The Warrior's land 1 to 3 of 5 to 8; the Rogue falls in 3 of 12 holding the club, and in 1
  with the sword alone.
- **The buckler's cover**: against the club it meets its bar, but for the Skeleton holding the
  club, which falls once; against the sword it meets 64 to 79 % of blows first, under its bar of 4
  in 5.

## Each cell

| Body | Loadout | stand-up | walk | run | punch | stomp | club-blow | cut | thrust | buckler-cover |
|---|---|---|---|---|---|---|---|---|---|---|
| Warrior | empty,empty | short | **met** | short | short | **met** | – | – | – | – |
| Warrior | empty,club | short | short | short | short | short | short | – | – | – |
| Warrior | buckler,club | short | short | short | – | short | short | – | – | short |
| Warrior | empty,sword | short | **met** | short | short | short | – | not read | short | – |
| Warrior | buckler,sword | short | short | short | – | short | – | not read | short | short |
| Rogue | empty,empty | short | **met** | short | short | **met** | – | – | – | – |
| Rogue | empty,club | short | **met** | short | short | short | short | – | – | – |
| Rogue | buckler,club | short | short | short | – | short | short | – | – | short |
| Rogue | empty,sword | short | **met** | short | short | short | – | not read | short | – |
| Rogue | buckler,sword | short | short | short | – | **met** | – | not read | short | short |
| Skeleton | empty,empty | short | short | – | short | short | – | – | – | – |
| Skeleton | empty,club | short | short | – | short | short | short | – | – | – |
| Skeleton | buckler,club | short | short | – | – | short | short | – | – | short |
| Skeleton | empty,sword | short | short | – | short | short | – | not read | short | – |
| Skeleton | buckler,sword | short | **met** | – | – | short | – | not read | short | short |

### Warrior

- **empty,empty, stand-up**: short
  - rising-target/standard: short, 15 of 16 stood, 14 within 10 s, median 8.5 s (an earlier version: `?play=ratings&evaluation=rising-target&subject=game&version=cbddb51f16e85a4f`)
- **empty,empty, walk**: met
  - locomotion/every: met, 0 of 47 fell, walk along 1.01 of the pace asked (median) (an earlier version: `?play=ratings&evaluation=locomotion&subject=option&version=0908391abf4aaaab`)
- **empty,empty, run**: short
  - locomotion/run: short, 0 of 32 met, 5 fell; short: run-held, run-turn, run-stop (an earlier version: `?play=ratings&evaluation=locomotion&subject=option&version=6903c3a0de3b5adc`)
- **empty,empty, punch**: short
  - strike/still: short, 19 of 22 thrown, 0 fell, 31 refused, 55 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fstraight-punch&version=08d72a19d1a4c514`)
  - strike/walk: short, 52 of 64 thrown, 0 fell, 64 refused, 128 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fstraight-punch&version=b71bc87e110f04bd`)
  - strike/fight: short, 1 of 2 on the body, 0 fell, 9 refused, 16 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fstraight-punch&version=ef8b40984a1cef84`)
- **empty,empty, stomp**: met
  - strike/stomping: met, 11 of 11 thrown, 0 fell, 0 refused, 12 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fstomp&version=249ee43c1310d34a`)
- **empty,club, stand-up**: short
  - rising-target/standard: short, 16 of 16 stood, 8 within 10 s, median 10.2 s (an earlier version: `?play=ratings&evaluation=rising-target&subject=game&version=cbddb51f16e85a4f`)
- **empty,club, walk**: short
  - locomotion/every: short, 1 of 47 fell, walk along 1.02 of the pace asked (median) (an earlier version: `?play=ratings&evaluation=locomotion&subject=option&version=0908391abf4aaaab`)
- **empty,club, run**: short
  - locomotion/run: short, 0 of 32 met, 5 fell; short: run-held, run-turn, run-stop (an earlier version: `?play=ratings&evaluation=locomotion&subject=option&version=6903c3a0de3b5adc`)
- **empty,club, punch**: short
  - strike/still: short, 5 of 14 thrown, 0 fell, 50 refused, 64 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Cclub&version=1d6a9d8194d2b690`)
  - strike/walk: short, 6 of 24 thrown, 0 fell, 97 refused, 128 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Cclub&version=9b635ab1b9e7dd52`)
  - strike/fight: short, 0 of 0 on the body, 0 fell, 7 refused, 16 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Cclub&version=a770874fcc1c91e4`)
- **empty,club, stomp**: short
  - strike/stomping: short, 2 of 6 thrown, 1 fell, 4 refused, 12 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fstomp%40empty%2Cclub&version=fb99f066ffa0519e`)
- **empty,club, club-blow**: short
  - strike/still: short, 6 of 16 thrown, 1 fell, 48 refused, 64 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40empty%2Cclub&version=1ef9ec97fd15dd0a`)
  - strike/walk: short, 9 of 29 thrown, 0 fell, 99 refused, 128 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40empty%2Cclub&version=1d1b9ef6e679d6c5`)
  - strike/fight: short, 0 of 1 on the body, 0 fell, 6 refused, 16 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40empty%2Cclub&version=15963d0b5ff800ac`)
- **buckler,club, stand-up**: short
  - equipped-rise/every: short, 16 of 16 stood, 13 within 10 s, median 9.3 s (an earlier version: `?play=ratings&evaluation=equipped-rise&subject=option&version=fdcddc5fd95608ac`)
- **buckler,club, walk**: short
  - locomotion/every: short, 1 of 47 fell, walk along 1.01 of the pace asked (median) (an earlier version: `?play=ratings&evaluation=locomotion&subject=option&version=0908391abf4aaaab`)
- **buckler,club, run**: short
  - locomotion/run: short, 0 of 32 met, 0 fell; short: run-held, run-turn, run-stop (an earlier version: `?play=ratings&evaluation=locomotion&subject=option&version=6903c3a0de3b5adc`)
- **buckler,club, stomp**: short
  - strike/stomping: short, 3 of 8 thrown, 0 fell, 2 refused, 12 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fstomp%40buckler%2Cclub&version=317c4ef6fa502cc1`)
- **buckler,club, club-blow**: short
  - strike/still: short, 0 of 15 thrown, 0 fell, 48 refused, 64 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40buckler%2Cclub&version=2208ff3836e4d35e`)
  - strike/walk: short, 6 of 29 thrown, 0 fell, 99 refused, 128 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40buckler%2Cclub&version=7f3e41dca14ec88e`)
  - strike/fight: short, 0 of 0 on the body, 0 fell, 13 refused, 16 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40buckler%2Cclub&version=e0dea9fc9459ad43`)
- **buckler,club, buckler-cover**: short
  - cover/club: met, 4 of 4 blows met by the buckler first, 0 fell, 6 trials (an earlier version: `?play=ratings&evaluation=cover&subject=option&version=e19fedfbb1a5b309`)
  - cover/sword: short, 27 of 36 blows met by the buckler first, 0 fell, 6 trials (an earlier version: `?play=ratings&evaluation=cover&subject=option&version=1178b3e9fc482fdb`)
- **empty,sword, stand-up**: short
  - equipped-rise/every: short, 14 of 16 stood, 10 within 10 s, median 9.2 s (an earlier version: `?play=ratings&evaluation=equipped-rise&subject=option&version=fdcddc5fd95608ac`)
- **empty,sword, walk**: met
  - locomotion/every: met, 0 of 47 fell, walk along 1.01 of the pace asked (median) (an earlier version: `?play=ratings&evaluation=locomotion&subject=option&version=0908391abf4aaaab`)
- **empty,sword, run**: short
  - locomotion/run: short, 0 of 32 met, 5 fell; short: run-held, run-turn, run-stop (an earlier version: `?play=ratings&evaluation=locomotion&subject=option&version=6903c3a0de3b5adc`)
- **empty,sword, punch**: short
  - strike/still: short, 9 of 14 thrown, 0 fell, 49 refused, 64 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Csword&version=93da62810dee65e5`)
  - strike/walk: short, 20 of 32 thrown, 0 fell, 96 refused, 128 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Csword&version=cff92bbdd05171f3`)
  - strike/fight: short, 0 of 0 on the body, 0 fell, 12 refused, 16 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Csword&version=46e48e02a5130bcc`)
- **empty,sword, stomp**: short
  - strike/stomping: short, 1 of 5 thrown, 0 fell, 5 refused, 12 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fstomp%40empty%2Csword&version=9ea861b917581918`)
- **empty,sword, cut**: not read
  - strike/still: unread, no rows (no record)
  - strike/walk: unread, no rows (no record)
  - strike/fight: unread, no rows (no record)
- **empty,sword, thrust**: short
  - strike/still: short, 0 of 14 thrown, 0 fell, 49 refused, 64 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40empty%2Csword&version=8353008ca3d04383`)
  - strike/walk: short, 0 of 32 thrown, 0 fell, 96 refused, 128 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40empty%2Csword&version=ff8516384533d7a2`)
  - strike/fight: short, 0 of 0 on the body, 0 fell, 12 refused, 16 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40empty%2Csword&version=602f098146aaee3e`)
- **buckler,sword, stand-up**: short
  - equipped-rise/every: short, 16 of 16 stood, 12 within 10 s, median 8.7 s (an earlier version: `?play=ratings&evaluation=equipped-rise&subject=option&version=fdcddc5fd95608ac`)
- **buckler,sword, walk**: short
  - locomotion/every: short, 1 of 47 fell, walk along 1.02 of the pace asked (median) (an earlier version: `?play=ratings&evaluation=locomotion&subject=option&version=0908391abf4aaaab`)
- **buckler,sword, run**: short
  - locomotion/run: short, 0 of 32 met, 5 fell; short: run-held, run-turn, run-stop (an earlier version: `?play=ratings&evaluation=locomotion&subject=option&version=6903c3a0de3b5adc`)
- **buckler,sword, stomp**: short
  - strike/stomping: short, 2 of 6 thrown, 0 fell, 6 refused, 12 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fstomp%40buckler%2Csword&version=75b802fa96711461`)
- **buckler,sword, cut**: not read
  - strike/still: short, 1 of 14 thrown, 0 fell, 49 refused, 64 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fcut%40buckler%2Csword&version=3e546adac046ce8f`)
  - strike/walk: unread, no rows (no record)
  - strike/fight: unread, no rows (no record)
- **buckler,sword, thrust**: short
  - strike/still: short, 3 of 15 thrown, 0 fell, 49 refused, 64 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40buckler%2Csword&version=9ccf9db59f1cb029`)
  - strike/walk: short, 0 of 20 thrown, 0 fell, 98 refused, 128 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40buckler%2Csword&version=4583a7ea3ac03011`)
  - strike/fight: short, 0 of 1 on the body, 0 fell, 12 refused, 16 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40buckler%2Csword&version=0375da879c6eadd5`)
- **buckler,sword, buckler-cover**: short
  - cover/club: met, 5 of 5 blows met by the buckler first, 0 fell, 6 trials (an earlier version: `?play=ratings&evaluation=cover&subject=option&version=e19fedfbb1a5b309`)
  - cover/sword: short, 15 of 20 blows met by the buckler first, 0 fell, 6 trials (an earlier version: `?play=ratings&evaluation=cover&subject=option&version=1178b3e9fc482fdb`)

### Rogue

- **empty,empty, stand-up**: short
  - rising-target/standard: short, 16 of 16 stood, 3 within 10 s, median 12.9 s (an earlier version: `?play=ratings&evaluation=rising-target&subject=game&version=cbddb51f16e85a4f`)
- **empty,empty, walk**: met
  - locomotion/every: met, 0 of 47 fell, walk along 0.98 of the pace asked (median) (an earlier version: `?play=ratings&evaluation=locomotion&subject=option&version=0908391abf4aaaab`)
- **empty,empty, run**: short
  - locomotion/run: short, 0 of 32 met, 28 fell; short: run-held, run-turn, run-stop (an earlier version: `?play=ratings&evaluation=locomotion&subject=option&version=6903c3a0de3b5adc`)
- **empty,empty, punch**: short
  - strike/still: short, 10 of 28 thrown, 0 fell, 28 refused, 58 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fstraight-punch&version=08d72a19d1a4c514`)
  - strike/walk-bodies: short, 19 of 64 thrown, 0 fell, 64 refused, 128 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fstraight-punch&version=23aeb49499fd7f8a`)
  - strike/fight-bodies: short, 2 of 8 on the body, 0 fell, 8 refused, 16 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fstraight-punch&version=d17b198620e27fa5`)
- **empty,empty, stomp**: met
  - strike/stomping-bodies: met, 9 of 9 thrown, 0 fell, 3 refused, 12 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fstomp&version=1e9a1173bf3d22a1`)
- **empty,club, stand-up**: short
  - rising-target/standard: short, 7 of 16 stood, 2 within 10 s, median 30.0 s (an earlier version: `?play=ratings&evaluation=rising-target&subject=game&version=cbddb51f16e85a4f`)
- **empty,club, walk**: met
  - locomotion/every: met, 0 of 47 fell, walk along 0.99 of the pace asked (median) (an earlier version: `?play=ratings&evaluation=locomotion&subject=option&version=0908391abf4aaaab`)
- **empty,club, run**: short
  - locomotion/run: short, 0 of 32 met, 6 fell; short: run-held, run-turn, run-stop (an earlier version: `?play=ratings&evaluation=locomotion&subject=option&version=6903c3a0de3b5adc`)
- **empty,club, punch**: short
  - strike/still: short, 3 of 6 thrown, 0 fell, 56 refused, 64 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Cclub&version=1d6a9d8194d2b690`)
  - strike/walk-bodies: short, 4 of 22 thrown, 0 fell, 105 refused, 128 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Cclub&version=7a08596f13a5c1ea`)
  - strike/fight-bodies: short, 0 of 1 on the body, 1 fell, 12 refused, 16 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Cclub&version=0c7d515d9a776a72`)
- **empty,club, stomp**: short
  - strike/stomping-bodies: short, 4 of 7 thrown, 3 fell, 3 refused, 12 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fstomp%40empty%2Cclub&version=c529bad1f7156ae0`)
- **empty,club, club-blow**: short
  - strike/still: short, 0 of 0 thrown, 0 fell, 64 refused, 64 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40empty%2Cclub&version=1ef9ec97fd15dd0a`)
  - strike/walk-bodies: short, 0 of 0 thrown, 0 fell, 128 refused, 128 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40empty%2Cclub&version=c568cc3155c017d1`)
  - strike/fight-bodies: short, 0 of 0 on the body, 0 fell, 16 refused, 16 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40empty%2Cclub&version=f6d7c8d2290ad368`)
- **buckler,club, stand-up**: short
  - equipped-rise/every: short, 9 of 16 stood, 0 within 10 s, median 24.7 s (an earlier version: `?play=ratings&evaluation=equipped-rise&subject=option&version=fdcddc5fd95608ac`)
- **buckler,club, walk**: short
  - locomotion/every: short, 1 of 47 fell, walk along 0.98 of the pace asked (median) (an earlier version: `?play=ratings&evaluation=locomotion&subject=option&version=0908391abf4aaaab`)
- **buckler,club, run**: short
  - locomotion/run: short, 0 of 32 met, 9 fell; short: run-held, run-turn, run-stop (an earlier version: `?play=ratings&evaluation=locomotion&subject=option&version=6903c3a0de3b5adc`)
- **buckler,club, stomp**: short
  - strike/stomping-bodies: short, 1 of 4 thrown, 3 fell, 7 refused, 12 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fstomp%40buckler%2Cclub&version=9001c8483c7d2cfb`)
- **buckler,club, club-blow**: short
  - strike/still: short, 0 of 0 thrown, 0 fell, 64 refused, 64 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40buckler%2Cclub&version=2208ff3836e4d35e`)
  - strike/walk-bodies: short, 0 of 0 thrown, 0 fell, 128 refused, 128 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40buckler%2Cclub&version=6ea887ac74fa57fc`)
  - strike/fight-bodies: short, 0 of 0 on the body, 0 fell, 0 refused, 16 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40buckler%2Cclub&version=e8971e2cdb5b783d`)
- **buckler,club, buckler-cover**: short
  - cover/club: met, 8 of 8 blows met by the buckler first, 0 fell, 6 trials (an earlier version: `?play=ratings&evaluation=cover&subject=option&version=e19fedfbb1a5b309`)
  - cover/sword: short, 15 of 19 blows met by the buckler first, 0 fell, 6 trials (an earlier version: `?play=ratings&evaluation=cover&subject=option&version=1178b3e9fc482fdb`)
- **empty,sword, stand-up**: short
  - equipped-rise/every: short, 14 of 16 stood, 3 within 10 s, median 12.9 s (an earlier version: `?play=ratings&evaluation=equipped-rise&subject=option&version=fdcddc5fd95608ac`)
- **empty,sword, walk**: met
  - locomotion/every: met, 0 of 47 fell, walk along 0.99 of the pace asked (median) (an earlier version: `?play=ratings&evaluation=locomotion&subject=option&version=0908391abf4aaaab`)
- **empty,sword, run**: short
  - locomotion/run: short, 0 of 32 met, 24 fell; short: run-held, run-turn, run-stop (an earlier version: `?play=ratings&evaluation=locomotion&subject=option&version=6903c3a0de3b5adc`)
- **empty,sword, punch**: short
  - strike/still: short, 4 of 8 thrown, 0 fell, 54 refused, 64 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Csword&version=93da62810dee65e5`)
  - strike/walk-bodies: short, 21 of 32 thrown, 0 fell, 96 refused, 128 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Csword&version=41f620c429bc99ee`)
  - strike/fight-bodies: short, 0 of 0 on the body, 0 fell, 11 refused, 16 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Csword&version=cc58bf734f8dec23`)
- **empty,sword, stomp**: short
  - strike/stomping-bodies: short, 7 of 7 thrown, 1 fell, 2 refused, 12 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fstomp%40empty%2Csword&version=9f157fde6037e3f3`)
- **empty,sword, cut**: not read
  - strike/still: unread, no rows (no record)
  - strike/walk-bodies: unread, no rows (no record)
  - strike/fight-bodies: unread, no rows (no record)
- **empty,sword, thrust**: short
  - strike/still: short, 0 of 0 thrown, 0 fell, 64 refused, 64 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40empty%2Csword&version=8353008ca3d04383`)
  - strike/walk-bodies: short, 0 of 0 thrown, 0 fell, 128 refused, 128 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40empty%2Csword&version=90ae4c33cab980a6`)
  - strike/fight-bodies: short, 0 of 0 on the body, 0 fell, 12 refused, 16 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40empty%2Csword&version=0ab5d39b17d82bb9`)
- **buckler,sword, stand-up**: short
  - equipped-rise/every: short, 11 of 16 stood, 1 within 10 s, median 23.8 s (an earlier version: `?play=ratings&evaluation=equipped-rise&subject=option&version=fdcddc5fd95608ac`)
- **buckler,sword, walk**: short
  - locomotion/every: short, 1 of 47 fell, walk along 0.99 of the pace asked (median) (an earlier version: `?play=ratings&evaluation=locomotion&subject=option&version=0908391abf4aaaab`)
- **buckler,sword, run**: short
  - locomotion/run: short, 0 of 32 met, 24 fell; short: run-held, run-turn, run-stop (an earlier version: `?play=ratings&evaluation=locomotion&subject=option&version=6903c3a0de3b5adc`)
- **buckler,sword, stomp**: met
  - strike/stomping-bodies: met, 1 of 1 thrown, 0 fell, 9 refused, 12 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fstomp%40buckler%2Csword&version=cfffa7f264b50376`)
- **buckler,sword, cut**: not read
  - strike/still: short, 0 of 0 thrown, 0 fell, 64 refused, 64 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fcut%40buckler%2Csword&version=3e546adac046ce8f`)
  - strike/walk-bodies: unread, no rows (no record)
  - strike/fight-bodies: unread, no rows (no record)
- **buckler,sword, thrust**: short
  - strike/still: short, 0 of 0 thrown, 0 fell, 64 refused, 64 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40buckler%2Csword&version=9ccf9db59f1cb029`)
  - strike/walk-bodies: short, 0 of 0 thrown, 0 fell, 128 refused, 128 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40buckler%2Csword&version=a5f7b22a993f2aa0`)
  - strike/fight-bodies: short, 0 of 0 on the body, 0 fell, 0 refused, 16 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40buckler%2Csword&version=7fa82eb52db5d6fc`)
- **buckler,sword, buckler-cover**: short
  - cover/club: met, 9 of 9 blows met by the buckler first, 0 fell, 6 trials (an earlier version: `?play=ratings&evaluation=cover&subject=option&version=e19fedfbb1a5b309`)
  - cover/sword: short, 9 of 14 blows met by the buckler first, 0 fell, 6 trials (an earlier version: `?play=ratings&evaluation=cover&subject=option&version=1178b3e9fc482fdb`)

### Skeleton

- **empty,empty, stand-up**: short
  - equipped-rise/every: short, 13 of 15 stood, median 13.4 s of those (an earlier version: `?play=ratings&evaluation=equipped-rise&subject=option&version=fdcddc5fd95608ac`)
- **empty,empty, walk**: short
  - locomotion/every: short, 1 of 47 fell, walk along 1.00 of the pace asked (median) (an earlier version: `?play=ratings&evaluation=locomotion&subject=option&version=0908391abf4aaaab`)
- **empty,empty, punch**: short
  - strike/still-bodies: short, 0 of 32 thrown, 0 fell, 32 refused, 64 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fstraight-punch&version=1f7c0cbc0ed97ba7`)
  - strike/walk-bodies: short, 0 of 0 thrown, 0 fell, 128 refused, 128 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fstraight-punch&version=23aeb49499fd7f8a`)
  - strike/fight-bodies: short, 0 of 0 on the body, 0 fell, 0 refused, 16 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fstraight-punch&version=d17b198620e27fa5`)
- **empty,empty, stomp**: short
  - strike/stomping-bodies: short, 8 of 11 thrown, 1 fell, 0 refused, 12 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fstomp&version=1e9a1173bf3d22a1`)
- **empty,club, stand-up**: short
  - equipped-rise/every: short, 0 of 15 stood, median - s of those (an earlier version: `?play=ratings&evaluation=equipped-rise&subject=option&version=fdcddc5fd95608ac`)
- **empty,club, walk**: short
  - locomotion/every: short, 1 of 47 fell, walk along 1.17 of the pace asked (median) (an earlier version: `?play=ratings&evaluation=locomotion&subject=option&version=0908391abf4aaaab`)
- **empty,club, punch**: short
  - strike/still-bodies: short, 0 of 0 thrown, 0 fell, 64 refused, 64 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Cclub&version=c400e237ce1f0258`)
  - strike/walk-bodies: short, 0 of 0 thrown, 0 fell, 128 refused, 128 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Cclub&version=7a08596f13a5c1ea`)
  - strike/fight-bodies: short, 0 of 0 on the body, 0 fell, 0 refused, 16 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Cclub&version=0c7d515d9a776a72`)
- **empty,club, stomp**: short
  - strike/stomping-bodies: short, 0 of 0 thrown, 0 fell, 12 refused, 12 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fstomp%40empty%2Cclub&version=c529bad1f7156ae0`)
- **empty,club, club-blow**: short
  - strike/still-bodies: short, 0 of 0 thrown, 0 fell, 64 refused, 64 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40empty%2Cclub&version=0723cb4b2798dbed`)
  - strike/walk-bodies: short, 0 of 0 thrown, 0 fell, 128 refused, 128 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40empty%2Cclub&version=c568cc3155c017d1`)
  - strike/fight-bodies: short, 0 of 0 on the body, 0 fell, 0 refused, 16 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40empty%2Cclub&version=f6d7c8d2290ad368`)
- **buckler,club, stand-up**: short
  - equipped-rise/every: short, 1 of 15 stood, median 13.1 s of those (an earlier version: `?play=ratings&evaluation=equipped-rise&subject=option&version=fdcddc5fd95608ac`)
- **buckler,club, walk**: short
  - locomotion/every: short, 1 of 47 fell, walk along 1.18 of the pace asked (median) (an earlier version: `?play=ratings&evaluation=locomotion&subject=option&version=0908391abf4aaaab`)
- **buckler,club, stomp**: short
  - strike/stomping-bodies: short, 0 of 0 thrown, 0 fell, 12 refused, 12 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fstomp%40buckler%2Cclub&version=9001c8483c7d2cfb`)
- **buckler,club, club-blow**: short
  - strike/still-bodies: short, 0 of 0 thrown, 6 fell, 58 refused, 64 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40buckler%2Cclub&version=2ec436447acc3afd`)
  - strike/walk-bodies: short, 0 of 0 thrown, 4 fell, 124 refused, 128 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40buckler%2Cclub&version=6ea887ac74fa57fc`)
  - strike/fight-bodies: short, 0 of 0 on the body, 0 fell, 0 refused, 16 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40buckler%2Cclub&version=e8971e2cdb5b783d`)
- **buckler,club, buckler-cover**: short
  - cover/club: short, 10 of 10 blows met by the buckler first, 1 fell, 6 trials (an earlier version: `?play=ratings&evaluation=cover&subject=option&version=e19fedfbb1a5b309`)
  - cover/sword: short, 16 of 25 blows met by the buckler first, 1 fell, 6 trials (an earlier version: `?play=ratings&evaluation=cover&subject=option&version=1178b3e9fc482fdb`)
- **empty,sword, stand-up**: short
  - equipped-rise/every: short, 6 of 14 stood, median 18.3 s of those (an earlier version: `?play=ratings&evaluation=equipped-rise&subject=option&version=fdcddc5fd95608ac`)
- **empty,sword, walk**: short
  - locomotion/every: short, 3 of 47 fell, walk along 1.15 of the pace asked (median) (an earlier version: `?play=ratings&evaluation=locomotion&subject=option&version=0908391abf4aaaab`)
- **empty,sword, punch**: short
  - strike/still-bodies: short, 0 of 0 thrown, 0 fell, 64 refused, 64 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Csword&version=ecd5ddcfbc387f43`)
  - strike/walk-bodies: short, 0 of 0 thrown, 0 fell, 128 refused, 128 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Csword&version=41f620c429bc99ee`)
  - strike/fight-bodies: short, 0 of 0 on the body, 0 fell, 0 refused, 16 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Csword&version=cc58bf734f8dec23`)
- **empty,sword, stomp**: short
  - strike/stomping-bodies: short, 0 of 0 thrown, 0 fell, 12 refused, 12 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fstomp%40empty%2Csword&version=9f157fde6037e3f3`)
- **empty,sword, cut**: not read
  - strike/still-bodies: unread, no rows (no record)
  - strike/walk-bodies: unread, no rows (no record)
  - strike/fight-bodies: unread, no rows (no record)
- **empty,sword, thrust**: short
  - strike/still-bodies: short, 0 of 0 thrown, 0 fell, 64 refused, 64 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40empty%2Csword&version=1aca0d592ddb77ba`)
  - strike/walk-bodies: short, 0 of 0 thrown, 0 fell, 128 refused, 128 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40empty%2Csword&version=90ae4c33cab980a6`)
  - strike/fight-bodies: short, 0 of 0 on the body, 0 fell, 0 refused, 16 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40empty%2Csword&version=0ab5d39b17d82bb9`)
- **buckler,sword, stand-up**: short
  - equipped-rise/every: short, 3 of 14 stood, median 26.1 s of those (an earlier version: `?play=ratings&evaluation=equipped-rise&subject=option&version=fdcddc5fd95608ac`)
- **buckler,sword, walk**: met
  - locomotion/every: met, 0 of 47 fell, walk along 1.21 of the pace asked (median) (an earlier version: `?play=ratings&evaluation=locomotion&subject=option&version=0908391abf4aaaab`)
- **buckler,sword, stomp**: short
  - strike/stomping-bodies: short, 0 of 0 thrown, 0 fell, 12 refused, 12 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fstomp%40buckler%2Csword&version=cfffa7f264b50376`)
- **buckler,sword, cut**: not read
  - strike/still-bodies: unread, no rows (no record)
  - strike/walk-bodies: unread, no rows (no record)
  - strike/fight-bodies: unread, no rows (no record)
- **buckler,sword, thrust**: short
  - strike/still-bodies: short, 0 of 0 thrown, 4 fell, 60 refused, 64 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40buckler%2Csword&version=450da44c623a18a0`)
  - strike/walk-bodies: short, 0 of 0 thrown, 0 fell, 128 refused, 128 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40buckler%2Csword&version=a5f7b22a993f2aa0`)
  - strike/fight-bodies: short, 0 of 0 on the body, 0 fell, 0 refused, 16 trials (an earlier version: `?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40buckler%2Csword&version=7fa82eb52db5d6fc`)
- **buckler,sword, buckler-cover**: short
  - cover/club: met, 11 of 13 blows met by the buckler first, 0 fell, 6 trials (an earlier version: `?play=ratings&evaluation=cover&subject=option&version=e19fedfbb1a5b309`)
  - cover/sword: short, 12 of 18 blows met by the buckler first, 0 fell, 6 trials (an earlier version: `?play=ratings&evaluation=cover&subject=option&version=1178b3e9fc482fdb`)
