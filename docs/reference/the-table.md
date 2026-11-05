# The table

Option Mind on every body, loadout and skill (`src/evaluation/table/`). Stand-up and the run are
met or short on their definitions (`verdictOf`): stand-up on the [owner's
target](rising.md#the-owners-target), each body and loadout's sixteen falls on its gates, the run
on its bar. Every other cell is best effort: each reading's score (`scoreOf`, better higher),
read against the cell's baseline, its first reading when its work begins (kept by
`npm run evaluate -- table --baseline` in `assets/evaluations/<drill>/baselines.json`), and
beside its best version's; a strike's with the person's figure (`BAR`), a scale that gates
nothing. A scored cell is above, at or below its baseline, or has none.

`npm run evaluate -- table` judges the rows the records hold, as below; `--play --workers 22`
first plays every reading not current and writes it. Node, core world, 120 Hz, each command 1 step
late (`COMMAND_DELAY`). Each reading below is its record's, read in that record's harness, and
links its Ratings page.

83 cells: 4 met, 21 short, 6 not read, 52 no baseline.

| Skill | Met | Short | Not read | No baseline |
| --- | ---: | ---: | ---: | ---: |
| stand-up | 4 | 11 | 0 | 0 |
| walk | 0 | 0 | 0 | 15 |
| run | 0 | 10 | 0 | 0 |
| punch | 0 | 0 | 0 | 9 |
| stomp | 0 | 0 | 0 | 10 |
| club-blow | 0 | 0 | 0 | 6 |
| cut | 0 | 0 | 6 | 0 |
| thrust | 0 | 0 | 0 | 6 |
| buckler-cover | 0 | 0 | 0 | 6 |

## Open causes

- **No scored cell has a baseline**: each is kept when the cell's work begins; until then a
  reading shows its score now and its best version's.
- **Stand-up**: every cell has standard and fresh target readings. The Warrior meets both
  protocols with empty hands and with the club. Its club and buckler loadout and its sword alone
  meet the standard protocol alone; its sword and buckler loadout meets the fresh protocol alone.
  The Rogue and the Skeleton remain short.
- **The run**: no cell meets it; no run trial meets its bar on any body and loadout, and the
  Rogue falls in 0 to 22 of its 32 trials, the Warrior in 0 to 5.
- **The cut is not read**: its walk and fight rungs have no rows under its subject
  (`option/cut@…`), nor its still rung with the sword alone.

## Each cell

| Body | Loadout | stand-up | walk | run | punch | stomp | club-blow | cut | thrust | buckler-cover |
|---|---|---|---|---|---|---|---|---|---|---|
| Warrior | empty,empty | met | no baseline | short | no baseline | no baseline | – | – | – | – |
| Warrior | empty,club | met | no baseline | short | no baseline | no baseline | no baseline | – | – | – |
| Warrior | buckler,club | met | no baseline | short | – | no baseline | no baseline | – | – | no baseline |
| Warrior | empty,sword | met | no baseline | short | no baseline | no baseline | – | not read | no baseline | – |
| Warrior | buckler,sword | short | no baseline | short | – | no baseline | – | not read | no baseline | no baseline |
| Rogue | empty,empty | short | no baseline | short | no baseline | no baseline | – | – | – | – |
| Rogue | empty,club | short | no baseline | short | no baseline | no baseline | no baseline | – | – | – |
| Rogue | buckler,club | short | no baseline | short | – | no baseline | no baseline | – | – | no baseline |
| Rogue | empty,sword | short | no baseline | short | no baseline | no baseline | – | not read | no baseline | – |
| Rogue | buckler,sword | short | no baseline | short | – | no baseline | – | not read | no baseline | no baseline |
| Skeleton | empty,empty | short | no baseline | – | no baseline | – | – | – | – | – |
| Skeleton | empty,club | short | no baseline | – | no baseline | – | no baseline | – | – | – |
| Skeleton | buckler,club | short | no baseline | – | – | – | no baseline | – | – | no baseline |
| Skeleton | empty,sword | short | no baseline | – | no baseline | – | – | not read | no baseline | – |
| Skeleton | buckler,sword | short | no baseline | – | – | – | – | not read | no baseline | no baseline |

### Warrior

- **empty,empty, stand-up**: met
  - rising-target/standard option: met, 16 of 16 stood, 16 within 10 s, median 8.4 s (`?play=ratings&evaluation=rising-target&subject=option&version=15df2e755e943c48`)
- **empty,empty, walk**: no baseline
  - locomotion/every option: 1 share not fallen, 0 of 47 fell, walk along 1.01 of the pace asked (median) (25d720b9 2026-11-03, not the version now: `?play=ratings&evaluation=locomotion&subject=option&version=0908391abf4aaaab`)
    - baseline none; best 1 share not fallen (`?play=ratings&evaluation=locomotion&subject=option&version=0908391abf4aaaab`)
- **empty,empty, run**: short
  - locomotion/run option: short, 0 of 32 met, 2 fell; short: run-held, run-turn, run-stop (4abee5ae 2026-11-04, not the version now: `?play=ratings&evaluation=locomotion&subject=option&version=8154ce132c2b2d65`)
- **empty,empty, punch**: no baseline
  - strike/still option/straight-punch: 7.486 m/s, 22 begun, 22 on the mark, 19 landed, 0 fell, 31 refused, 55 trials (2b33ae18 2026-11-03, not the version now: `?play=ratings&evaluation=strike&subject=option%2Fstraight-punch&version=08d72a19d1a4c514`)
    - baseline none; best 7.529 m/s (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch&version=d8128035105153bf`); the person's 6.8 m/s rear hand, 5.3 m/s lead
  - strike/walk option/straight-punch: 7.353 m/s, 64 begun, 64 on the mark, 52 landed, 0 fell, 64 refused, 128 trials (824d82d1 2026-11-02, not the version now: `?play=ratings&evaluation=strike&subject=option%2Fstraight-punch&version=b71bc87e110f04bd`)
    - baseline none; best 7.53 m/s (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch&version=f71986767906ef87`); the person's 6.8 m/s rear hand, 5.3 m/s lead
  - strike/fight option/straight-punch: 0 m/s, 6 begun, 2 on the mark, 1 landed, 0 fell, 9 refused, 16 trials (a23414ef 2026-11-02, not the version now: `?play=ratings&evaluation=strike&subject=option%2Fstraight-punch&version=ef8b40984a1cef84`)
    - baseline none; best 3.258 m/s (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch&version=ee74a1f94652cead`); the person's 6.8 m/s rear hand, 5.3 m/s lead
- **empty,empty, stomp**: no baseline
  - strike/stomping option/stomp: 4.183 m/s, 11 begun, 11 on the mark, 11 landed, 0 fell, 0 refused, 12 trials (90bdd549 2026-11-03, not the version now: `?play=ratings&evaluation=strike&subject=option%2Fstomp&version=249ee43c1310d34a`)
    - baseline none; best 4.983 m/s (`?play=ratings&evaluation=strike&subject=option%2Fstomp&version=d918ee1d92f0bff7`); the person's 3 m/s
- **empty,club, stand-up**: met
  - rising-target/standard option: met, 16 of 16 stood, 15 within 10 s, median 8.5 s (`?play=ratings&evaluation=rising-target&subject=option&version=15df2e755e943c48`)
- **empty,club, walk**: no baseline
  - locomotion/every option: 0.979 share not fallen, 1 of 47 fell, walk along 1.02 of the pace asked (median) (25d720b9 2026-11-03, not the version now: `?play=ratings&evaluation=locomotion&subject=option&version=0908391abf4aaaab`)
    - baseline none; best 1 share not fallen (`?play=ratings&evaluation=locomotion&subject=option&version=ad519a8ef9bb565f`)
- **empty,club, run**: short
  - locomotion/run option: short, 0 of 32 met, 5 fell; short: run-held, run-turn, run-stop (4abee5ae 2026-11-04, not the version now: `?play=ratings&evaluation=locomotion&subject=option&version=8154ce132c2b2d65`)
- **empty,club, punch**: no baseline
  - strike/still option/straight-punch@empty,club: 6.637 m/s, 14 begun, 13 on the mark, 5 landed, 0 fell, 50 refused, 64 trials (91983216 2026-11-01, not the version now: `?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Cclub&version=1d6a9d8194d2b690`)
    - baseline none; best 6.637 m/s (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Cclub&version=1d6a9d8194d2b690`); the person's 6.8 m/s rear hand, 5.3 m/s lead
  - strike/walk option/straight-punch@empty,club: 7.13 m/s, 24 begun, 21 on the mark, 6 landed, 0 fell, 97 refused, 128 trials (91983216 2026-11-01, not the version now: `?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Cclub&version=9b635ab1b9e7dd52`)
    - baseline none; best 7.13 m/s (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Cclub&version=9b635ab1b9e7dd52`); the person's 6.8 m/s rear hand, 5.3 m/s lead
  - strike/fight option/straight-punch@empty,club: 0 m/s, 0 begun, 0 on the mark, 0 landed, 0 fell, 7 refused, 16 trials (91983216 2026-11-01, not the version now: `?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Cclub&version=a770874fcc1c91e4`)
    - baseline none; best 0 m/s (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Cclub&version=a770874fcc1c91e4`); the person's 6.8 m/s rear hand, 5.3 m/s lead
- **empty,club, stomp**: no baseline
  - strike/stomping option/stomp@empty,club: 0 m/s, 6 begun, 2 on the mark, 2 landed, 1 fell, 4 refused, 12 trials (91983216 2026-11-01, not the version now: `?play=ratings&evaluation=strike&subject=option%2Fstomp%40empty%2Cclub&version=fb99f066ffa0519e`)
    - baseline none; best 0 m/s (`?play=ratings&evaluation=strike&subject=option%2Fstomp%40empty%2Cclub&version=fb99f066ffa0519e`); the person's 3 m/s
- **empty,club, club-blow**: no baseline
  - strike/still option/club-blow@empty,club: 60.522 J, 16 begun, 15 on the mark, 6 landed, 1 fell, 48 refused, 64 trials (91983216 2026-11-01, not the version now: `?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40empty%2Cclub&version=1ef9ec97fd15dd0a`)
    - baseline none; best 60.522 J (`?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40empty%2Cclub&version=1ef9ec97fd15dd0a`); the person's 64.8 J
  - strike/walk option/club-blow@empty,club: 22.71 J, 29 begun, 20 on the mark, 9 landed, 0 fell, 99 refused, 128 trials (91983216 2026-11-01, not the version now: `?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40empty%2Cclub&version=1d1b9ef6e679d6c5`)
    - baseline none; best 22.71 J (`?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40empty%2Cclub&version=1d1b9ef6e679d6c5`); the person's 64.8 J
  - strike/fight option/club-blow@empty,club: 0 J, 2 begun, 0 on the mark, 0 landed, 0 fell, 6 refused, 16 trials (91983216 2026-11-01, not the version now: `?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40empty%2Cclub&version=15963d0b5ff800ac`)
    - baseline none; best 0 J (`?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40empty%2Cclub&version=15963d0b5ff800ac`); the person's 64.8 J
- **buckler,club, stand-up**: met
  - rising-target/standard option: met, 16 of 16 stood, 16 within 10 s, median 7.9 s (`?play=ratings&evaluation=rising-target&subject=option&version=15df2e755e943c48`)
- **buckler,club, walk**: no baseline
  - locomotion/every option: 0.979 share not fallen, 1 of 47 fell, walk along 1.01 of the pace asked (median) (25d720b9 2026-11-03, not the version now: `?play=ratings&evaluation=locomotion&subject=option&version=0908391abf4aaaab`)
    - baseline none; best 1 share not fallen (`?play=ratings&evaluation=locomotion&subject=option&version=ad519a8ef9bb565f`)
- **buckler,club, run**: short
  - locomotion/run option: short, 0 of 32 met, 1 fell; short: run-held, run-turn, run-stop (4abee5ae 2026-11-04, not the version now: `?play=ratings&evaluation=locomotion&subject=option&version=8154ce132c2b2d65`)
- **buckler,club, stomp**: no baseline
  - strike/stomping option/stomp@buckler,club: 0 m/s, 8 begun, 3 on the mark, 3 landed, 0 fell, 2 refused, 12 trials (91983216 2026-11-01, not the version now: `?play=ratings&evaluation=strike&subject=option%2Fstomp%40buckler%2Cclub&version=317c4ef6fa502cc1`)
    - baseline none; best 0 m/s (`?play=ratings&evaluation=strike&subject=option%2Fstomp%40buckler%2Cclub&version=317c4ef6fa502cc1`); the person's 3 m/s
- **buckler,club, club-blow**: no baseline
  - strike/still option/club-blow@buckler,club: 0 J, 15 begun, 0 on the mark, 0 landed, 0 fell, 48 refused, 64 trials (b04deb43 2026-11-03, not the version now: `?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40buckler%2Cclub&version=2208ff3836e4d35e`)
    - baseline none; best 94.674 J (`?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40buckler%2Cclub&version=a3bbc5ba85d335c4`); the person's 64.8 J
  - strike/walk option/club-blow@buckler,club: 8.791 J, 29 begun, 19 on the mark, 6 landed, 0 fell, 99 refused, 128 trials (91983216 2026-11-01, not the version now: `?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40buckler%2Cclub&version=7f3e41dca14ec88e`)
    - baseline none; best 16.688 J (`?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40buckler%2Cclub&version=6eb467fb12544a80`); the person's 64.8 J
  - strike/fight option/club-blow@buckler,club: 0 J, 1 begun, 0 on the mark, 0 landed, 0 fell, 13 refused, 16 trials (91983216 2026-11-01, not the version now: `?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40buckler%2Cclub&version=e0dea9fc9459ad43`)
    - baseline none; best 3.723 J (`?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40buckler%2Cclub&version=b67be3741606aa1c`); the person's 64.8 J
- **buckler,club, buckler-cover**: no baseline
  - cover/club option: 1 share of blows met by the buckler first, 4 of 4 blows, 0 fell, 6 trials (75f35fe3 2026-11-03, not the version now: `?play=ratings&evaluation=cover&subject=option&version=e19fedfbb1a5b309`)
    - baseline none; best 1 share of blows met by the buckler first (`?play=ratings&evaluation=cover&subject=option&version=e19fedfbb1a5b309`)
  - cover/sword option: 0.75 share of blows met by the buckler first, 27 of 36 blows, 0 fell, 6 trials (75f35fe3 2026-11-03, not the version now: `?play=ratings&evaluation=cover&subject=option&version=1178b3e9fc482fdb`)
    - baseline none; best 0.852 share of blows met by the buckler first (`?play=ratings&evaluation=cover&subject=option&version=1ec440f4da47ee35`)
- **empty,sword, stand-up**: met
  - rising-target/standard option: met, 16 of 16 stood, 16 within 10 s, median 8.7 s (`?play=ratings&evaluation=rising-target&subject=option&version=15df2e755e943c48`)
- **empty,sword, walk**: no baseline
  - locomotion/every option: 1 share not fallen, 0 of 47 fell, walk along 1.01 of the pace asked (median) (25d720b9 2026-11-03, not the version now: `?play=ratings&evaluation=locomotion&subject=option&version=0908391abf4aaaab`)
    - baseline none; best 1 share not fallen (`?play=ratings&evaluation=locomotion&subject=option&version=0908391abf4aaaab`)
- **empty,sword, run**: short
  - locomotion/run option: short, 0 of 32 met, 2 fell; short: run-held, run-turn, run-stop (4abee5ae 2026-11-04, not the version now: `?play=ratings&evaluation=locomotion&subject=option&version=8154ce132c2b2d65`)
- **empty,sword, punch**: no baseline
  - strike/still option/straight-punch@empty,sword: 7.477 m/s, 14 begun, 13 on the mark, 9 landed, 0 fell, 49 refused, 64 trials (91983216 2026-11-01, not the version now: `?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Csword&version=93da62810dee65e5`)
    - baseline none; best 7.477 m/s (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Csword&version=93da62810dee65e5`); the person's 6.8 m/s rear hand, 5.3 m/s lead
  - strike/walk option/straight-punch@empty,sword: 7.325 m/s, 32 begun, 32 on the mark, 20 landed, 0 fell, 96 refused, 128 trials (91983216 2026-11-01, not the version now: `?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Csword&version=cff92bbdd05171f3`)
    - baseline none; best 7.325 m/s (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Csword&version=cff92bbdd05171f3`); the person's 6.8 m/s rear hand, 5.3 m/s lead
  - strike/fight option/straight-punch@empty,sword: 0 m/s, 0 begun, 0 on the mark, 0 landed, 0 fell, 12 refused, 16 trials (91983216 2026-11-01, not the version now: `?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Csword&version=46e48e02a5130bcc`)
    - baseline none; best 0 m/s (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Csword&version=46e48e02a5130bcc`); the person's 6.8 m/s rear hand, 5.3 m/s lead
- **empty,sword, stomp**: no baseline
  - strike/stomping option/stomp@empty,sword: 0 m/s, 5 begun, 1 on the mark, 1 landed, 0 fell, 5 refused, 12 trials (91983216 2026-11-01, not the version now: `?play=ratings&evaluation=strike&subject=option%2Fstomp%40empty%2Csword&version=9ea861b917581918`)
    - baseline none; best 0 m/s (`?play=ratings&evaluation=strike&subject=option%2Fstomp%40empty%2Csword&version=9ea861b917581918`); the person's 3 m/s
- **empty,sword, cut**: not read
  - strike/still option/cut@empty,sword: no rows
    - baseline none; best none; the person's 18.5 m/s
  - strike/walk option/cut@empty,sword: no rows
    - baseline none; best none; the person's 18.5 m/s
  - strike/fight option/cut@empty,sword: no rows
    - baseline none; best none; the person's 18.5 m/s
- **empty,sword, thrust**: no baseline
  - strike/still option/sword-thrust@empty,sword: 0 m/s, 14 begun, 4 on the mark, 0 landed, 0 fell, 49 refused, 64 trials (91983216 2026-11-01, not the version now: `?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40empty%2Csword&version=8353008ca3d04383`)
    - baseline none; best 0 m/s (`?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40empty%2Csword&version=8353008ca3d04383`); the person's 4.6 m/s
  - strike/walk option/sword-thrust@empty,sword: 0 m/s, 32 begun, 3 on the mark, 0 landed, 0 fell, 96 refused, 128 trials (91983216 2026-11-01, not the version now: `?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40empty%2Csword&version=ff8516384533d7a2`)
    - baseline none; best 0 m/s (`?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40empty%2Csword&version=ff8516384533d7a2`); the person's 4.6 m/s
  - strike/fight option/sword-thrust@empty,sword: 0 m/s, 2 begun, 0 on the mark, 0 landed, 0 fell, 12 refused, 16 trials (91983216 2026-11-01, not the version now: `?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40empty%2Csword&version=602f098146aaee3e`)
    - baseline none; best 0 m/s (`?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40empty%2Csword&version=602f098146aaee3e`); the person's 4.6 m/s
- **buckler,sword, stand-up**: short
  - rising-target/standard option: short, 15 of 16 stood, 14 within 10 s, median 7.7 s; short: within (`?play=ratings&evaluation=rising-target&subject=option&version=15df2e755e943c48`)
- **buckler,sword, walk**: no baseline
  - locomotion/every option: 0.979 share not fallen, 1 of 47 fell, walk along 1.02 of the pace asked (median) (25d720b9 2026-11-03, not the version now: `?play=ratings&evaluation=locomotion&subject=option&version=0908391abf4aaaab`)
    - baseline none; best 1 share not fallen (`?play=ratings&evaluation=locomotion&subject=option&version=ad519a8ef9bb565f`)
- **buckler,sword, run**: short
  - locomotion/run option: short, 0 of 32 met, 0 fell; short: run-held, run-turn, run-stop (4abee5ae 2026-11-04, not the version now: `?play=ratings&evaluation=locomotion&subject=option&version=8154ce132c2b2d65`)
- **buckler,sword, stomp**: no baseline
  - strike/stomping option/stomp@buckler,sword: 1.212 m/s, 6 begun, 3 on the mark, 2 landed, 0 fell, 6 refused, 12 trials (91983216 2026-11-01, not the version now: `?play=ratings&evaluation=strike&subject=option%2Fstomp%40buckler%2Csword&version=75b802fa96711461`)
    - baseline none; best 1.212 m/s (`?play=ratings&evaluation=strike&subject=option%2Fstomp%40buckler%2Csword&version=75b802fa96711461`); the person's 3 m/s
- **buckler,sword, cut**: not read
  - strike/still option/cut@buckler,sword: 0 m/s, 14 begun, 2 on the mark, 1 landed, 0 fell, 49 refused, 64 trials (b04deb43 2026-11-03, not the version now: `?play=ratings&evaluation=strike&subject=option%2Fcut%40buckler%2Csword&version=3e546adac046ce8f`)
    - baseline none; best 0 m/s (`?play=ratings&evaluation=strike&subject=option%2Fcut%40buckler%2Csword&version=3e546adac046ce8f`); the person's 18.5 m/s
  - strike/walk option/cut@buckler,sword: no rows
    - baseline none; best none; the person's 18.5 m/s
  - strike/fight option/cut@buckler,sword: no rows
    - baseline none; best none; the person's 18.5 m/s
- **buckler,sword, thrust**: no baseline
  - strike/still option/sword-thrust@buckler,sword: 6.497 m/s, 15 begun, 13 on the mark, 3 landed, 0 fell, 49 refused, 64 trials (aaf4d013 2026-11-03, not the version now: `?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40buckler%2Csword&version=9ccf9db59f1cb029`)
    - baseline none; best 6.497 m/s (`?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40buckler%2Csword&version=9ccf9db59f1cb029`); the person's 4.6 m/s
  - strike/walk option/sword-thrust@buckler,sword: 0 m/s, 20 begun, 2 on the mark, 0 landed, 0 fell, 98 refused, 128 trials (91983216 2026-11-01, not the version now: `?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40buckler%2Csword&version=4583a7ea3ac03011`)
    - baseline none; best 0 m/s (`?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40buckler%2Csword&version=4583a7ea3ac03011`); the person's 4.6 m/s
  - strike/fight option/sword-thrust@buckler,sword: 0.409 m/s, 2 begun, 1 on the mark, 0 landed, 0 fell, 12 refused, 16 trials (91983216 2026-11-01, not the version now: `?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40buckler%2Csword&version=0375da879c6eadd5`)
    - baseline none; best 0.409 m/s (`?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40buckler%2Csword&version=0375da879c6eadd5`); the person's 4.6 m/s
- **buckler,sword, buckler-cover**: no baseline
  - cover/club option: 1 share of blows met by the buckler first, 5 of 5 blows, 0 fell, 6 trials (75f35fe3 2026-11-03, not the version now: `?play=ratings&evaluation=cover&subject=option&version=e19fedfbb1a5b309`)
    - baseline none; best 1 share of blows met by the buckler first (`?play=ratings&evaluation=cover&subject=option&version=e19fedfbb1a5b309`)
  - cover/sword option: 0.75 share of blows met by the buckler first, 15 of 20 blows, 0 fell, 6 trials (75f35fe3 2026-11-03, not the version now: `?play=ratings&evaluation=cover&subject=option&version=1178b3e9fc482fdb`)
    - baseline none; best 0.826 share of blows met by the buckler first (`?play=ratings&evaluation=cover&subject=option&version=1ec440f4da47ee35`)

### Rogue

- **empty,empty, stand-up**: short
  - rising-target/standard option: short, 16 of 16 stood, 9 within 10 s, median 9.6 s; short: within, cardinals (`?play=ratings&evaluation=rising-target&subject=option&version=15df2e755e943c48`)
- **empty,empty, walk**: no baseline
  - locomotion/every option: 1 share not fallen, 0 of 47 fell, walk along 0.98 of the pace asked (median) (25d720b9 2026-11-03, not the version now: `?play=ratings&evaluation=locomotion&subject=option&version=0908391abf4aaaab`)
    - baseline none; best 1 share not fallen (`?play=ratings&evaluation=locomotion&subject=option&version=0908391abf4aaaab`)
- **empty,empty, run**: short
  - locomotion/run option: short, 0 of 32 met, 20 fell; short: run-held, run-turn, run-stop (4abee5ae 2026-11-04, not the version now: `?play=ratings&evaluation=locomotion&subject=option&version=8154ce132c2b2d65`)
- **empty,empty, punch**: no baseline
  - strike/still option/straight-punch: 6.735 m/s, 28 begun, 26 on the mark, 10 landed, 0 fell, 28 refused, 58 trials (2b33ae18 2026-11-03, not the version now: `?play=ratings&evaluation=strike&subject=option%2Fstraight-punch&version=08d72a19d1a4c514`)
    - baseline none; best 7.501 m/s (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch&version=a4d78d474fe48d4c`); the person's 6.8 m/s rear hand, 5.3 m/s lead
  - strike/walk-bodies option/straight-punch: 6.692 m/s, 64 begun, 62 on the mark, 19 landed, 0 fell, 64 refused, 128 trials (b43f4799 2026-11-02, not the version now: `?play=ratings&evaluation=strike&subject=option%2Fstraight-punch&version=23aeb49499fd7f8a`)
    - baseline none; best 6.692 m/s (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch&version=23aeb49499fd7f8a`); the person's 6.8 m/s rear hand, 5.3 m/s lead
  - strike/fight-bodies option/straight-punch: 6.224 m/s, 8 begun, 8 on the mark, 2 landed, 0 fell, 8 refused, 16 trials (b43f4799 2026-11-02, not the version now: `?play=ratings&evaluation=strike&subject=option%2Fstraight-punch&version=d17b198620e27fa5`)
    - baseline none; best 6.224 m/s (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch&version=d17b198620e27fa5`); the person's 6.8 m/s rear hand, 5.3 m/s lead
- **empty,empty, stomp**: no baseline
  - strike/stomping-bodies option/stomp: 6.71 m/s, 9 begun, 9 on the mark, 9 landed, 0 fell, 3 refused, 12 trials (b0f21223 2026-11-03, not the version now: `?play=ratings&evaluation=strike&subject=option%2Fstomp&version=1e9a1173bf3d22a1`)
    - baseline none; best 6.71 m/s (`?play=ratings&evaluation=strike&subject=option%2Fstomp&version=1e9a1173bf3d22a1`); the person's 3 m/s
- **empty,club, stand-up**: short
  - rising-target/standard option: short, 11 of 16 stood, 3 within 10 s, median 14.2 s; short: within, cardinals, median (`?play=ratings&evaluation=rising-target&subject=option&version=15df2e755e943c48`)
- **empty,club, walk**: no baseline
  - locomotion/every option: 1 share not fallen, 0 of 47 fell, walk along 0.99 of the pace asked (median) (25d720b9 2026-11-03, not the version now: `?play=ratings&evaluation=locomotion&subject=option&version=0908391abf4aaaab`)
    - baseline none; best 1 share not fallen (`?play=ratings&evaluation=locomotion&subject=option&version=0908391abf4aaaab`)
- **empty,club, run**: short
  - locomotion/run option: short, 0 of 32 met, 9 fell; short: run-held, run-turn, run-stop (4abee5ae 2026-11-04, not the version now: `?play=ratings&evaluation=locomotion&subject=option&version=8154ce132c2b2d65`)
- **empty,club, punch**: no baseline
  - strike/still option/straight-punch@empty,club: 6.019 m/s, 6 begun, 6 on the mark, 3 landed, 0 fell, 56 refused, 64 trials (91983216 2026-11-01, not the version now: `?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Cclub&version=1d6a9d8194d2b690`)
    - baseline none; best 6.019 m/s (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Cclub&version=1d6a9d8194d2b690`); the person's 6.8 m/s rear hand, 5.3 m/s lead
  - strike/walk-bodies option/straight-punch@empty,club: 5.72 m/s, 22 begun, 18 on the mark, 4 landed, 0 fell, 105 refused, 128 trials (91983216 2026-11-01, not the version now: `?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Cclub&version=7a08596f13a5c1ea`)
    - baseline none; best 5.72 m/s (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Cclub&version=7a08596f13a5c1ea`); the person's 6.8 m/s rear hand, 5.3 m/s lead
  - strike/fight-bodies option/straight-punch@empty,club: 3.757 m/s, 2 begun, 1 on the mark, 0 landed, 1 fell, 12 refused, 16 trials (91983216 2026-11-01, not the version now: `?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Cclub&version=0c7d515d9a776a72`)
    - baseline none; best 3.757 m/s (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Cclub&version=0c7d515d9a776a72`); the person's 6.8 m/s rear hand, 5.3 m/s lead
- **empty,club, stomp**: no baseline
  - strike/stomping-bodies option/stomp@empty,club: 2.174 m/s, 7 begun, 4 on the mark, 4 landed, 3 fell, 3 refused, 12 trials (91983216 2026-11-01, not the version now: `?play=ratings&evaluation=strike&subject=option%2Fstomp%40empty%2Cclub&version=c529bad1f7156ae0`)
    - baseline none; best 2.174 m/s (`?play=ratings&evaluation=strike&subject=option%2Fstomp%40empty%2Cclub&version=c529bad1f7156ae0`); the person's 3 m/s
- **empty,club, club-blow**: no baseline
  - strike/still option/club-blow@empty,club: 0 J, 0 begun, 0 on the mark, 0 landed, 0 fell, 64 refused, 64 trials (91983216 2026-11-01, not the version now: `?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40empty%2Cclub&version=1ef9ec97fd15dd0a`)
    - baseline none; best 0 J (`?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40empty%2Cclub&version=1ef9ec97fd15dd0a`); the person's 64.8 J
  - strike/walk-bodies option/club-blow@empty,club: 0 J, 0 begun, 0 on the mark, 0 landed, 0 fell, 128 refused, 128 trials (91983216 2026-11-01, not the version now: `?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40empty%2Cclub&version=c568cc3155c017d1`)
    - baseline none; best 0 J (`?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40empty%2Cclub&version=c568cc3155c017d1`); the person's 64.8 J
  - strike/fight-bodies option/club-blow@empty,club: 0 J, 0 begun, 0 on the mark, 0 landed, 0 fell, 16 refused, 16 trials (91983216 2026-11-01, not the version now: `?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40empty%2Cclub&version=f6d7c8d2290ad368`)
    - baseline none; best 0 J (`?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40empty%2Cclub&version=f6d7c8d2290ad368`); the person's 64.8 J
- **buckler,club, stand-up**: short
  - rising-target/standard option: short, 8 of 16 stood, 2 within 10 s, median 28.2 s; short: within, cardinals, median (`?play=ratings&evaluation=rising-target&subject=option&version=15df2e755e943c48`)
- **buckler,club, walk**: no baseline
  - locomotion/every option: 0.979 share not fallen, 1 of 47 fell, walk along 0.98 of the pace asked (median) (25d720b9 2026-11-03, not the version now: `?play=ratings&evaluation=locomotion&subject=option&version=0908391abf4aaaab`)
    - baseline none; best 1 share not fallen (`?play=ratings&evaluation=locomotion&subject=option&version=ad519a8ef9bb565f`)
- **buckler,club, run**: short
  - locomotion/run option: short, 0 of 32 met, 0 fell; short: run-held, run-turn, run-stop (4abee5ae 2026-11-04, not the version now: `?play=ratings&evaluation=locomotion&subject=option&version=8154ce132c2b2d65`)
- **buckler,club, stomp**: no baseline
  - strike/stomping-bodies option/stomp@buckler,club: 0 m/s, 4 begun, 1 on the mark, 1 landed, 3 fell, 7 refused, 12 trials (91983216 2026-11-01, not the version now: `?play=ratings&evaluation=strike&subject=option%2Fstomp%40buckler%2Cclub&version=9001c8483c7d2cfb`)
    - baseline none; best 0 m/s (`?play=ratings&evaluation=strike&subject=option%2Fstomp%40buckler%2Cclub&version=9001c8483c7d2cfb`); the person's 3 m/s
- **buckler,club, club-blow**: no baseline
  - strike/still option/club-blow@buckler,club: 0 J, 0 begun, 0 on the mark, 0 landed, 0 fell, 64 refused, 64 trials (b04deb43 2026-11-03, not the version now: `?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40buckler%2Cclub&version=2208ff3836e4d35e`)
    - baseline none; best 0 J (`?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40buckler%2Cclub&version=2208ff3836e4d35e`); the person's 64.8 J
  - strike/walk-bodies option/club-blow@buckler,club: 0 J, 0 begun, 0 on the mark, 0 landed, 0 fell, 128 refused, 128 trials (91983216 2026-11-01, not the version now: `?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40buckler%2Cclub&version=6ea887ac74fa57fc`)
    - baseline none; best 0 J (`?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40buckler%2Cclub&version=6ea887ac74fa57fc`); the person's 64.8 J
  - strike/fight-bodies option/club-blow@buckler,club: 0 J, 0 begun, 0 on the mark, 0 landed, 0 fell, 0 refused, 16 trials (91983216 2026-11-01, not the version now: `?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40buckler%2Cclub&version=e8971e2cdb5b783d`)
    - baseline none; best 0 J (`?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40buckler%2Cclub&version=e8971e2cdb5b783d`); the person's 64.8 J
- **buckler,club, buckler-cover**: no baseline
  - cover/club option: 1 share of blows met by the buckler first, 8 of 8 blows, 0 fell, 6 trials (75f35fe3 2026-11-03, not the version now: `?play=ratings&evaluation=cover&subject=option&version=e19fedfbb1a5b309`)
    - baseline none; best 1 share of blows met by the buckler first (`?play=ratings&evaluation=cover&subject=option&version=e19fedfbb1a5b309`)
  - cover/sword option: 0.789 share of blows met by the buckler first, 15 of 19 blows, 0 fell, 6 trials (75f35fe3 2026-11-03, not the version now: `?play=ratings&evaluation=cover&subject=option&version=1178b3e9fc482fdb`)
    - baseline none; best 0.789 share of blows met by the buckler first (`?play=ratings&evaluation=cover&subject=option&version=1178b3e9fc482fdb`)
- **empty,sword, stand-up**: short
  - rising-target/standard option: short, 16 of 16 stood, 5 within 10 s, median 10.9 s; short: within, cardinals, median (`?play=ratings&evaluation=rising-target&subject=option&version=15df2e755e943c48`)
- **empty,sword, walk**: no baseline
  - locomotion/every option: 1 share not fallen, 0 of 47 fell, walk along 0.99 of the pace asked (median) (25d720b9 2026-11-03, not the version now: `?play=ratings&evaluation=locomotion&subject=option&version=0908391abf4aaaab`)
    - baseline none; best 1 share not fallen (`?play=ratings&evaluation=locomotion&subject=option&version=0908391abf4aaaab`)
- **empty,sword, run**: short
  - locomotion/run option: short, 0 of 32 met, 22 fell; short: run-held, run-turn, run-stop (4abee5ae 2026-11-04, not the version now: `?play=ratings&evaluation=locomotion&subject=option&version=8154ce132c2b2d65`)
- **empty,sword, punch**: no baseline
  - strike/still option/straight-punch@empty,sword: 6.083 m/s, 8 begun, 8 on the mark, 4 landed, 0 fell, 54 refused, 64 trials (91983216 2026-11-01, not the version now: `?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Csword&version=93da62810dee65e5`)
    - baseline none; best 6.083 m/s (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Csword&version=93da62810dee65e5`); the person's 6.8 m/s rear hand, 5.3 m/s lead
  - strike/walk-bodies option/straight-punch@empty,sword: 6.104 m/s, 32 begun, 32 on the mark, 21 landed, 0 fell, 96 refused, 128 trials (91983216 2026-11-01, not the version now: `?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Csword&version=41f620c429bc99ee`)
    - baseline none; best 6.104 m/s (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Csword&version=41f620c429bc99ee`); the person's 6.8 m/s rear hand, 5.3 m/s lead
  - strike/fight-bodies option/straight-punch@empty,sword: 0 m/s, 1 begun, 0 on the mark, 0 landed, 0 fell, 11 refused, 16 trials (91983216 2026-11-01, not the version now: `?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Csword&version=cc58bf734f8dec23`)
    - baseline none; best 0 m/s (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Csword&version=cc58bf734f8dec23`); the person's 6.8 m/s rear hand, 5.3 m/s lead
- **empty,sword, stomp**: no baseline
  - strike/stomping-bodies option/stomp@empty,sword: 3.599 m/s, 7 begun, 7 on the mark, 7 landed, 1 fell, 2 refused, 12 trials (91983216 2026-11-01, not the version now: `?play=ratings&evaluation=strike&subject=option%2Fstomp%40empty%2Csword&version=9f157fde6037e3f3`)
    - baseline none; best 3.599 m/s (`?play=ratings&evaluation=strike&subject=option%2Fstomp%40empty%2Csword&version=9f157fde6037e3f3`); the person's 3 m/s
- **empty,sword, cut**: not read
  - strike/still option/cut@empty,sword: no rows
    - baseline none; best none; the person's 18.5 m/s
  - strike/walk-bodies option/cut@empty,sword: no rows
    - baseline none; best none; the person's 18.5 m/s
  - strike/fight-bodies option/cut@empty,sword: no rows
    - baseline none; best none; the person's 18.5 m/s
- **empty,sword, thrust**: no baseline
  - strike/still option/sword-thrust@empty,sword: 0 m/s, 0 begun, 0 on the mark, 0 landed, 0 fell, 64 refused, 64 trials (91983216 2026-11-01, not the version now: `?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40empty%2Csword&version=8353008ca3d04383`)
    - baseline none; best 0 m/s (`?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40empty%2Csword&version=8353008ca3d04383`); the person's 4.6 m/s
  - strike/walk-bodies option/sword-thrust@empty,sword: 0 m/s, 0 begun, 0 on the mark, 0 landed, 0 fell, 128 refused, 128 trials (91983216 2026-11-01, not the version now: `?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40empty%2Csword&version=90ae4c33cab980a6`)
    - baseline none; best 0 m/s (`?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40empty%2Csword&version=90ae4c33cab980a6`); the person's 4.6 m/s
  - strike/fight-bodies option/sword-thrust@empty,sword: 0 m/s, 0 begun, 0 on the mark, 0 landed, 0 fell, 12 refused, 16 trials (91983216 2026-11-01, not the version now: `?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40empty%2Csword&version=0ab5d39b17d82bb9`)
    - baseline none; best 0 m/s (`?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40empty%2Csword&version=0ab5d39b17d82bb9`); the person's 4.6 m/s
- **buckler,sword, stand-up**: short
  - rising-target/standard option: short, 14 of 16 stood, 3 within 10 s, median 13.0 s; short: within, cardinals, median (`?play=ratings&evaluation=rising-target&subject=option&version=15df2e755e943c48`)
- **buckler,sword, walk**: no baseline
  - locomotion/every option: 0.979 share not fallen, 1 of 47 fell, walk along 0.99 of the pace asked (median) (25d720b9 2026-11-03, not the version now: `?play=ratings&evaluation=locomotion&subject=option&version=0908391abf4aaaab`)
    - baseline none; best 1 share not fallen (`?play=ratings&evaluation=locomotion&subject=option&version=ad519a8ef9bb565f`)
- **buckler,sword, run**: short
  - locomotion/run option: short, 0 of 32 met, 21 fell; short: run-held, run-turn, run-stop (4abee5ae 2026-11-04, not the version now: `?play=ratings&evaluation=locomotion&subject=option&version=8154ce132c2b2d65`)
- **buckler,sword, stomp**: no baseline
  - strike/stomping-bodies option/stomp@buckler,sword: 2.792 m/s, 1 begun, 1 on the mark, 1 landed, 0 fell, 9 refused, 12 trials (91983216 2026-11-01, not the version now: `?play=ratings&evaluation=strike&subject=option%2Fstomp%40buckler%2Csword&version=cfffa7f264b50376`)
    - baseline none; best 2.792 m/s (`?play=ratings&evaluation=strike&subject=option%2Fstomp%40buckler%2Csword&version=cfffa7f264b50376`); the person's 3 m/s
- **buckler,sword, cut**: not read
  - strike/still option/cut@buckler,sword: 0 m/s, 0 begun, 0 on the mark, 0 landed, 0 fell, 64 refused, 64 trials (b04deb43 2026-11-03, not the version now: `?play=ratings&evaluation=strike&subject=option%2Fcut%40buckler%2Csword&version=3e546adac046ce8f`)
    - baseline none; best 0 m/s (`?play=ratings&evaluation=strike&subject=option%2Fcut%40buckler%2Csword&version=3e546adac046ce8f`); the person's 18.5 m/s
  - strike/walk-bodies option/cut@buckler,sword: no rows
    - baseline none; best none; the person's 18.5 m/s
  - strike/fight-bodies option/cut@buckler,sword: no rows
    - baseline none; best none; the person's 18.5 m/s
- **buckler,sword, thrust**: no baseline
  - strike/still option/sword-thrust@buckler,sword: 0 m/s, 0 begun, 0 on the mark, 0 landed, 0 fell, 64 refused, 64 trials (aaf4d013 2026-11-03, not the version now: `?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40buckler%2Csword&version=9ccf9db59f1cb029`)
    - baseline none; best 0 m/s (`?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40buckler%2Csword&version=9ccf9db59f1cb029`); the person's 4.6 m/s
  - strike/walk-bodies option/sword-thrust@buckler,sword: 0 m/s, 0 begun, 0 on the mark, 0 landed, 0 fell, 128 refused, 128 trials (91983216 2026-11-01, not the version now: `?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40buckler%2Csword&version=a5f7b22a993f2aa0`)
    - baseline none; best 0 m/s (`?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40buckler%2Csword&version=a5f7b22a993f2aa0`); the person's 4.6 m/s
  - strike/fight-bodies option/sword-thrust@buckler,sword: 0 m/s, 0 begun, 0 on the mark, 0 landed, 0 fell, 0 refused, 16 trials (91983216 2026-11-01, not the version now: `?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40buckler%2Csword&version=7fa82eb52db5d6fc`)
    - baseline none; best 0 m/s (`?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40buckler%2Csword&version=7fa82eb52db5d6fc`); the person's 4.6 m/s
- **buckler,sword, buckler-cover**: no baseline
  - cover/club option: 1 share of blows met by the buckler first, 9 of 9 blows, 0 fell, 6 trials (75f35fe3 2026-11-03, not the version now: `?play=ratings&evaluation=cover&subject=option&version=e19fedfbb1a5b309`)
    - baseline none; best 1 share of blows met by the buckler first (`?play=ratings&evaluation=cover&subject=option&version=e19fedfbb1a5b309`)
  - cover/sword option: 0.643 share of blows met by the buckler first, 9 of 14 blows, 0 fell, 6 trials (75f35fe3 2026-11-03, not the version now: `?play=ratings&evaluation=cover&subject=option&version=1178b3e9fc482fdb`)
    - baseline none; best 0.818 share of blows met by the buckler first (`?play=ratings&evaluation=cover&subject=option&version=5d1465a64b05da7c`)

### Skeleton

- **empty,empty, stand-up**: short
  - rising-target/standard option: short, 16 of 16 stood, 4 within 10 s, median 12.5 s; short: within, cardinals, median (`?play=ratings&evaluation=rising-target&subject=option&version=15df2e755e943c48`)
- **empty,empty, walk**: no baseline
  - locomotion/every option: 0.979 share not fallen, 1 of 47 fell, walk along 1.00 of the pace asked (median) (25d720b9 2026-11-03, not the version now: `?play=ratings&evaluation=locomotion&subject=option&version=0908391abf4aaaab`)
    - baseline none; best 0.979 share not fallen (`?play=ratings&evaluation=locomotion&subject=option&version=0908391abf4aaaab`)
- **empty,empty, punch**: no baseline
  - strike/still-bodies option/straight-punch: 10.77 m/s, 32 begun, 32 on the mark, 0 landed, 0 fell, 32 refused, 64 trials (8ed9abf4 2026-11-03, not the version now: `?play=ratings&evaluation=strike&subject=option%2Fstraight-punch&version=1f7c0cbc0ed97ba7`)
    - baseline none; best 10.77 m/s (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch&version=1f7c0cbc0ed97ba7`); the person's 6.8 m/s rear hand, 5.3 m/s lead
  - strike/walk-bodies option/straight-punch: 0 m/s, 0 begun, 0 on the mark, 0 landed, 0 fell, 128 refused, 128 trials (b43f4799 2026-11-02, not the version now: `?play=ratings&evaluation=strike&subject=option%2Fstraight-punch&version=23aeb49499fd7f8a`)
    - baseline none; best 0 m/s (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch&version=23aeb49499fd7f8a`); the person's 6.8 m/s rear hand, 5.3 m/s lead
  - strike/fight-bodies option/straight-punch: 0 m/s, 0 begun, 0 on the mark, 0 landed, 0 fell, 0 refused, 16 trials (b43f4799 2026-11-02, not the version now: `?play=ratings&evaluation=strike&subject=option%2Fstraight-punch&version=d17b198620e27fa5`)
    - baseline none; best 0 m/s (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch&version=d17b198620e27fa5`); the person's 6.8 m/s rear hand, 5.3 m/s lead
- **empty,club, stand-up**: short
  - rising-target/standard option: short, 0 of 16 stood, 0 within 10 s, median 30.0 s; short: within, cardinals, median (`?play=ratings&evaluation=rising-target&subject=option&version=15df2e755e943c48`)
- **empty,club, walk**: no baseline
  - locomotion/every option: 0.979 share not fallen, 1 of 47 fell, walk along 1.17 of the pace asked (median) (25d720b9 2026-11-03, not the version now: `?play=ratings&evaluation=locomotion&subject=option&version=0908391abf4aaaab`)
    - baseline none; best 0.979 share not fallen (`?play=ratings&evaluation=locomotion&subject=option&version=0908391abf4aaaab`)
- **empty,club, punch**: no baseline
  - strike/still-bodies option/straight-punch@empty,club: 0 m/s, 0 begun, 0 on the mark, 0 landed, 0 fell, 64 refused, 64 trials (91983216 2026-11-01, not the version now: `?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Cclub&version=c400e237ce1f0258`)
    - baseline none; best 0 m/s (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Cclub&version=c400e237ce1f0258`); the person's 6.8 m/s rear hand, 5.3 m/s lead
  - strike/walk-bodies option/straight-punch@empty,club: 0 m/s, 0 begun, 0 on the mark, 0 landed, 0 fell, 128 refused, 128 trials (91983216 2026-11-01, not the version now: `?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Cclub&version=7a08596f13a5c1ea`)
    - baseline none; best 0 m/s (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Cclub&version=7a08596f13a5c1ea`); the person's 6.8 m/s rear hand, 5.3 m/s lead
  - strike/fight-bodies option/straight-punch@empty,club: 0 m/s, 0 begun, 0 on the mark, 0 landed, 0 fell, 0 refused, 16 trials (91983216 2026-11-01, not the version now: `?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Cclub&version=0c7d515d9a776a72`)
    - baseline none; best 0 m/s (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Cclub&version=0c7d515d9a776a72`); the person's 6.8 m/s rear hand, 5.3 m/s lead
- **empty,club, club-blow**: no baseline
  - strike/still-bodies option/club-blow@empty,club: 0 J, 0 begun, 0 on the mark, 0 landed, 0 fell, 64 refused, 64 trials (91983216 2026-11-01, not the version now: `?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40empty%2Cclub&version=0723cb4b2798dbed`)
    - baseline none; best 0 J (`?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40empty%2Cclub&version=0723cb4b2798dbed`); the person's 64.8 J
  - strike/walk-bodies option/club-blow@empty,club: 0 J, 0 begun, 0 on the mark, 0 landed, 0 fell, 128 refused, 128 trials (91983216 2026-11-01, not the version now: `?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40empty%2Cclub&version=c568cc3155c017d1`)
    - baseline none; best 0 J (`?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40empty%2Cclub&version=c568cc3155c017d1`); the person's 64.8 J
  - strike/fight-bodies option/club-blow@empty,club: 0 J, 0 begun, 0 on the mark, 0 landed, 0 fell, 0 refused, 16 trials (91983216 2026-11-01, not the version now: `?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40empty%2Cclub&version=f6d7c8d2290ad368`)
    - baseline none; best 0 J (`?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40empty%2Cclub&version=f6d7c8d2290ad368`); the person's 64.8 J
- **buckler,club, stand-up**: short
  - rising-target/standard option: short, 0 of 16 stood, 0 within 10 s, median 30.0 s; short: within, cardinals, median (`?play=ratings&evaluation=rising-target&subject=option&version=15df2e755e943c48`)
- **buckler,club, walk**: no baseline
  - locomotion/every option: 0.979 share not fallen, 1 of 47 fell, walk along 1.18 of the pace asked (median) (25d720b9 2026-11-03, not the version now: `?play=ratings&evaluation=locomotion&subject=option&version=0908391abf4aaaab`)
    - baseline none; best 1 share not fallen (`?play=ratings&evaluation=locomotion&subject=option&version=ad519a8ef9bb565f`)
- **buckler,club, club-blow**: no baseline
  - strike/still-bodies option/club-blow@buckler,club: 0 J, 0 begun, 0 on the mark, 0 landed, 6 fell, 58 refused, 64 trials (91983216 2026-11-01, not the version now: `?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40buckler%2Cclub&version=2ec436447acc3afd`)
    - baseline none; best 0 J (`?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40buckler%2Cclub&version=2ec436447acc3afd`); the person's 64.8 J
  - strike/walk-bodies option/club-blow@buckler,club: 0 J, 0 begun, 0 on the mark, 0 landed, 4 fell, 124 refused, 128 trials (91983216 2026-11-01, not the version now: `?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40buckler%2Cclub&version=6ea887ac74fa57fc`)
    - baseline none; best 0 J (`?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40buckler%2Cclub&version=6ea887ac74fa57fc`); the person's 64.8 J
  - strike/fight-bodies option/club-blow@buckler,club: 0 J, 0 begun, 0 on the mark, 0 landed, 0 fell, 0 refused, 16 trials (91983216 2026-11-01, not the version now: `?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40buckler%2Cclub&version=e8971e2cdb5b783d`)
    - baseline none; best 0 J (`?play=ratings&evaluation=strike&subject=option%2Fclub-blow%40buckler%2Cclub&version=e8971e2cdb5b783d`); the person's 64.8 J
- **buckler,club, buckler-cover**: no baseline
  - cover/club option: 1 share of blows met by the buckler first, 10 of 10 blows, 1 fell, 6 trials (75f35fe3 2026-11-03, not the version now: `?play=ratings&evaluation=cover&subject=option&version=e19fedfbb1a5b309`)
    - baseline none; best 1 share of blows met by the buckler first (`?play=ratings&evaluation=cover&subject=option&version=e19fedfbb1a5b309`)
  - cover/sword option: 0.64 share of blows met by the buckler first, 16 of 25 blows, 1 fell, 6 trials (75f35fe3 2026-11-03, not the version now: `?play=ratings&evaluation=cover&subject=option&version=1178b3e9fc482fdb`)
    - baseline none; best 0.778 share of blows met by the buckler first (`?play=ratings&evaluation=cover&subject=option&version=5d1465a64b05da7c`)
- **empty,sword, stand-up**: short
  - rising-target/standard option: short, 5 of 16 stood, 0 within 10 s, median 30.0 s; short: within, cardinals, median (`?play=ratings&evaluation=rising-target&subject=option&version=15df2e755e943c48`)
- **empty,sword, walk**: no baseline
  - locomotion/every option: 0.936 share not fallen, 3 of 47 fell, walk along 1.15 of the pace asked (median) (25d720b9 2026-11-03, not the version now: `?play=ratings&evaluation=locomotion&subject=option&version=0908391abf4aaaab`)
    - baseline none; best 0.979 share not fallen (`?play=ratings&evaluation=locomotion&subject=option&version=ad519a8ef9bb565f`)
- **empty,sword, punch**: no baseline
  - strike/still-bodies option/straight-punch@empty,sword: 0 m/s, 0 begun, 0 on the mark, 0 landed, 0 fell, 64 refused, 64 trials (91983216 2026-11-01, not the version now: `?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Csword&version=ecd5ddcfbc387f43`)
    - baseline none; best 0 m/s (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Csword&version=ecd5ddcfbc387f43`); the person's 6.8 m/s rear hand, 5.3 m/s lead
  - strike/walk-bodies option/straight-punch@empty,sword: 0 m/s, 0 begun, 0 on the mark, 0 landed, 0 fell, 128 refused, 128 trials (91983216 2026-11-01, not the version now: `?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Csword&version=41f620c429bc99ee`)
    - baseline none; best 0 m/s (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Csword&version=41f620c429bc99ee`); the person's 6.8 m/s rear hand, 5.3 m/s lead
  - strike/fight-bodies option/straight-punch@empty,sword: 0 m/s, 0 begun, 0 on the mark, 0 landed, 0 fell, 0 refused, 16 trials (91983216 2026-11-01, not the version now: `?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Csword&version=cc58bf734f8dec23`)
    - baseline none; best 0 m/s (`?play=ratings&evaluation=strike&subject=option%2Fstraight-punch%40empty%2Csword&version=cc58bf734f8dec23`); the person's 6.8 m/s rear hand, 5.3 m/s lead
- **empty,sword, cut**: not read
  - strike/still-bodies option/cut@empty,sword: no rows
    - baseline none; best none; the person's 18.5 m/s
  - strike/walk-bodies option/cut@empty,sword: no rows
    - baseline none; best none; the person's 18.5 m/s
  - strike/fight-bodies option/cut@empty,sword: no rows
    - baseline none; best none; the person's 18.5 m/s
- **empty,sword, thrust**: no baseline
  - strike/still-bodies option/sword-thrust@empty,sword: 0 m/s, 0 begun, 0 on the mark, 0 landed, 0 fell, 64 refused, 64 trials (91983216 2026-11-01, not the version now: `?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40empty%2Csword&version=1aca0d592ddb77ba`)
    - baseline none; best 0 m/s (`?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40empty%2Csword&version=1aca0d592ddb77ba`); the person's 4.6 m/s
  - strike/walk-bodies option/sword-thrust@empty,sword: 0 m/s, 0 begun, 0 on the mark, 0 landed, 0 fell, 128 refused, 128 trials (91983216 2026-11-01, not the version now: `?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40empty%2Csword&version=90ae4c33cab980a6`)
    - baseline none; best 0 m/s (`?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40empty%2Csword&version=90ae4c33cab980a6`); the person's 4.6 m/s
  - strike/fight-bodies option/sword-thrust@empty,sword: 0 m/s, 0 begun, 0 on the mark, 0 landed, 0 fell, 0 refused, 16 trials (91983216 2026-11-01, not the version now: `?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40empty%2Csword&version=0ab5d39b17d82bb9`)
    - baseline none; best 0 m/s (`?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40empty%2Csword&version=0ab5d39b17d82bb9`); the person's 4.6 m/s
- **buckler,sword, stand-up**: short
  - rising-target/standard option: short, 5 of 16 stood, 1 within 10 s, median 30.0 s; short: within, cardinals, median (`?play=ratings&evaluation=rising-target&subject=option&version=15df2e755e943c48`)
- **buckler,sword, walk**: no baseline
  - locomotion/every option: 1 share not fallen, 0 of 47 fell, walk along 1.21 of the pace asked (median) (25d720b9 2026-11-03, not the version now: `?play=ratings&evaluation=locomotion&subject=option&version=0908391abf4aaaab`)
    - baseline none; best 1 share not fallen (`?play=ratings&evaluation=locomotion&subject=option&version=0908391abf4aaaab`)
- **buckler,sword, cut**: not read
  - strike/still-bodies option/cut@buckler,sword: no rows
    - baseline none; best none; the person's 18.5 m/s
  - strike/walk-bodies option/cut@buckler,sword: no rows
    - baseline none; best none; the person's 18.5 m/s
  - strike/fight-bodies option/cut@buckler,sword: no rows
    - baseline none; best none; the person's 18.5 m/s
- **buckler,sword, thrust**: no baseline
  - strike/still-bodies option/sword-thrust@buckler,sword: 0 m/s, 0 begun, 0 on the mark, 0 landed, 4 fell, 60 refused, 64 trials (91983216 2026-11-01, not the version now: `?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40buckler%2Csword&version=450da44c623a18a0`)
    - baseline none; best 0 m/s (`?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40buckler%2Csword&version=450da44c623a18a0`); the person's 4.6 m/s
  - strike/walk-bodies option/sword-thrust@buckler,sword: 0 m/s, 0 begun, 0 on the mark, 0 landed, 0 fell, 128 refused, 128 trials (91983216 2026-11-01, not the version now: `?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40buckler%2Csword&version=a5f7b22a993f2aa0`)
    - baseline none; best 0 m/s (`?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40buckler%2Csword&version=a5f7b22a993f2aa0`); the person's 4.6 m/s
  - strike/fight-bodies option/sword-thrust@buckler,sword: 0 m/s, 0 begun, 0 on the mark, 0 landed, 0 fell, 0 refused, 16 trials (91983216 2026-11-01, not the version now: `?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40buckler%2Csword&version=7fa82eb52db5d6fc`)
    - baseline none; best 0 m/s (`?play=ratings&evaluation=strike&subject=option%2Fsword-thrust%40buckler%2Csword&version=7fa82eb52db5d6fc`); the person's 4.6 m/s
- **buckler,sword, buckler-cover**: no baseline
  - cover/club option: 0.846 share of blows met by the buckler first, 11 of 13 blows, 0 fell, 6 trials (75f35fe3 2026-11-03, not the version now: `?play=ratings&evaluation=cover&subject=option&version=e19fedfbb1a5b309`)
    - baseline none; best 0.846 share of blows met by the buckler first (`?play=ratings&evaluation=cover&subject=option&version=e19fedfbb1a5b309`)
  - cover/sword option: 0.667 share of blows met by the buckler first, 12 of 18 blows, 0 fell, 6 trials (75f35fe3 2026-11-03, not the version now: `?play=ratings&evaluation=cover&subject=option&version=1178b3e9fc482fdb`)
    - baseline none; best 0.733 share of blows met by the buckler first (`?play=ratings&evaluation=cover&subject=option&version=5d1465a64b05da7c`)
