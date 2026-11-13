# Warrior punch

Notes on where the Warrior's punch stands. They say what is true now and how to read it again;
what is worked next is the run's brief ([AGENTS.md](../../AGENTS.md#the-rules)), never a line here.

## Goal

Raise the value of the Warrior's punch: the table's `punch` row on `workshop-fighter`, its cells
the loadouts with an empty hand (`empty,empty`, `empty,club`, `empty,sword`). The value is the
life a punch trades a second ([the table](../reference/the-table.md)). The punch is the straight
punch at the trunk with an empty hand; no other blow is part of this goal.

## Where it stands

The row reads a still target (`still`) and a target walked to (`walk`), each standing with its
arms lowered (`drill-stand`). Each asks the straight punch at the trunk, with each empty hand,
against the Warrior, the Rogue and the Skeleton. Read the saved results, playing nothing:

```powershell
npm run evaluate -- table --body workshop-fighter --skill punch
npm run evaluate -- table --body workshop-fighter --skill punch --loadout empty,empty --by gap
```

Values are hp traded a second; counts are begun / on the mark / trials. The cell's mark compares
it with its baseline, using the paired 95% interval.

| Loadout | Cell | Against baseline | Still: value; counts | Walk: value; counts |
| --- | --- | --- | --- | --- |
| `empty,empty` | 0.256 | better | 0.275; 96 / 78 / 96 | 0.246; 192 / 152 / 192 |
| `empty,club` | 0.190 | within noise | 0.169; 48 / 34 / 48 | 0.200; 96 / 74 / 96 |
| `empty,sword` | 0.249 | within noise | 0.252; 48 / 32 / 48 | 0.248; 96 / 74 / 96 |

Every Warrior punch trial begins, across all three loadouts. Each still reading is better than
its baseline; the empty-handed walk is better, the club and sword walks within noise. The
empty-handed still reading's median fist speed on the mark is 6.94 m/s; the walk's is 7.16 m/s
(the person's rear hand 6.8 m/s, lead 5.3 m/s). The walks end down in three empty-handed trials,
one with the club and one with the sword; their values include the fall's price.

What is not checked: no fresh agent has checked the installed steer
([the claim](../recipes/skill.md#the-claim)); Option Mind’s combat footwork remains unread for this goal.

### Why the close trials do not begin

The empty-handed still cases at gaps 0.6–0.9 m begin on all 48 conditions: 45 land, three miss.
The saved readings use Node, `rapier-coordinate`, at 120 Hz with one command step of delay.

**Facing on the final approach.** Place and range orders with an explicit facing keep it over
the final metre (`FACE_NEAR`, `src/minds/ordered.ts`), so a short backing correction faces the
target throughout. Before that, navigation supplies the route's facing (`facesTravel`,
`src/skills/framework/intent.ts`, applied in `arbiter.ts`), allowing the forward-only run on a
long trip. With no explicit facing, the route supplies it throughout. A direct walk keeps its
explicit facing. Standing holds the stance's heading (`walking`,
`src/skills/locomotion/locomotion.ts`), so the final facing is asked while the body still walks.

**An unbegun strike is positioned again.** The drill (`src/minds/command/drill.ts`) reads the
menu while its strike order has not begun. When readiness becomes `position`, it resumes its
ordinary walk into the window, then orders the strike again once admitted. A strike already
under way is carried through.

The window is attainable and quiet enough for admission on every Warrior still condition.
Whether a useful punch can be delivered without backing out remains open. Unchecked: the
remaining not-begun conditions on the Rogue and Skeleton, other strikes, walk and run drills,
480 Hz, fights outside the fingerprint, Option Mind's combat footwork and every reel.

### Why the punch does not land in fights

The empty-handed Warrior lands 2 of 8 reached trials in `fight`, and 13 of 42 reached trials in
`fights`; six further `fights` moments are unreached. Each reading is whole and fault-free. The
harness is Node, `rapier-coordinate`, 120 Hz, with each command one step late. The subject is
`option/straight-punch`, both hands at the trunk, against Option Mind on the Warrior.
`fight` takes moments 1–4 from the open stage’s 4 m gap; `fights` takes moments 1–8 from gaps
3, 4 and 5 m. The drill takes over at that body-directed action, carries it on when it matches
the requested punch, and otherwise waits for its resources before positioning and asking its own.
The `fight` readings match the corresponding gap-4 `fights` readings in full.

Read the kept outcomes on [fight Ratings](http://localhost:5180/?play=ratings&evaluation=strike&protocol=fight&subject=option%2Fstraight-punch) and
[fights Ratings](http://localhost:5180/?play=ratings&evaluation=strike&protocol=fights&subject=option%2Fstraight-punch). These links use the local game’s address; use the same
query on a preview served at another address. Each row there opens its condition’s reel.

Every Warrior condition replays to its complete saved reading: 8 `fight` and 48 `fights` trials.
The trace wraps the evaluation’s own reader and records every step’s readiness, window, body
positions, orders, actions and blows. The classifications below name the first identified cause;
a prior action on the other hand and later failures are named where they matter.

Each entry below is **outcome / cause**, hands left then right. `landed` has no cause code.
P = punch delivery, with the native-drive/learned-correction split unresolved; S = learned heading
and centre requests; A = learned arm pushes; G = foe guard; B = foe blow; D = drill footwork;
T = foe step; U = fight does not reach the moment. The gap-4 columns also give every `fight` case.

| Moment | 3 m left | 3 m right | 4 m left | 4 m right | 5 m left | 5 m right |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | landed | missed / P | landed | landed | guarded / B | missed / P |
| 2 | missed / P | landed | guarded / G | outside / D | missed / P | missed / P |
| 3 | guarded / B | missed / P | missed / P | elsewhere / P | landed | missed / P |
| 4 | fell / S | missed / P | elsewhere / P | guarded / G | guarded / B | landed |
| 5 | fell / S | landed | landed | missed / P | fell / S | fell / S |
| 6 | landed | outside / T | landed | guarded / G | outside / A | fell / A |
| 7 | outside / T | missed / P | landed | landed | unreached / U | unreached / U |
| 8 | unreached / U | unreached / U | missed / P | landed | unreached / U | unreached / U |

| Cause | `fight` | `fights` | Outcomes in `fights`, by moment (count) |
| --- | --- | --- | --- |
| P: punch delivery | 3 | 14 | missed: m1 (2), m2 (3), m3 (3), m4 (1), m5 (1), m7 (1), m8 (1); elsewhere: m3 (1), m4 (1) |
| S: punch learned stance | 0 | 4 | fell, 4 (1); fell, 5 (3) |
| A: punch learned arm | 0 | 2 | outside, 6 (1); fell, 6 (1) |
| G: foe guard | 2 | 3 | guarded, 2 (1); guarded, 4 (1); guarded, 6 (1) |
| B: foe blow | 0 | 3 | guarded, 3 (1); guarded, 1 (1); guarded, 4 (1) |
| D: drill footwork | 1 | 1 | outside, 2 (1) |
| T: foe step | 0 | 2 | outside, 7 (1); outside, 6 (1) |
| U: moment unreached | 0 | 6 | unreached, 8 (4); unreached, 7 (2) |

**Punch delivery (P), trace evidence.** At 4 m, left, moment 3 ([fight Ratings](http://localhost:5180/?play=ratings&evaluation=strike&protocol=fight&subject=option%2Fstraight-punch)),
the punch commits at 12.317 s but its fist comes no closer than 0.161 m to its moving aim.
The foe moves 0.071 m during the action. Removing only foe travel still misses; suppressing only
learned arm pushes still misses. Across P’s 12 missed trials, closest fist-to-aim distances are
0.106–0.442 m; the other two P trials hit the head while aimed at the trunk (4 m, right moment 3,
left moment 4). The drive and its corrections are in `straightTechnique.drive` and
`straightPunchExecutor.command` (`src/skills/strikes/straight-punch.ts`, `steerPushes`). The trace
establishes the missing or misplaced delivery; these ablations do not isolate its native and
learned contributions. Removing learned pushes changes 3 m right moment 7 from missed to guarded
and left moment 2 from missed to elsewhere: their later obstruction or misplaced contact is secondary.

**Learned stance (S), confirmed.** At 5 m, left, moment 5 ([fights Ratings](http://localhost:5180/?play=ratings&evaluation=strike&protocol=fights&subject=option%2Fstraight-punch)),
the fist misses, the foe hits the trunk at 12.075 s, and the striker falls at 12.600 s. Suppressing
only the learned heading and centre requests changes `fell` to `landed`. The same removal prevents
the falls at 3 m left moments 4 and 5, and 5 m right moment 5; those become missed. The right-hand
case first waits for the original left punch, whose stance requests destabilize the body before
the requested right can begin. The later foe blow is secondary. The source is `stanceAsks`
and the `heading`/`centre` legs goals in `straightPunchExecutor.command`.

**Learned arm (A), confirmed.** At 5 m, right, moment 6 ([fights Ratings](http://localhost:5180/?play=ratings&evaluation=strike&protocol=fights&subject=option%2Fstraight-punch)),
the fist misses before the foe contacts the head at 22.783 s. Suppressing only learned arm pushes
changes `fell` to `guarded`, with no fall. In the corresponding left-hand trial the original right
punch owns the body first; its arm pushes destabilize the approach. Removing them changes `outside`
to `guarded` and lets the requested left begin. Foe contact, temporary height refusal and the drill’s
subsequent movement are secondary. The source is the `steerPushes` call in `straightTechnique.drive`.

**Foe guard (G).** At 4 m, right, moment 4 ([fight Ratings](http://localhost:5180/?play=ratings&evaluation=strike&protocol=fight&subject=option%2Fstraight-punch)),
the fist meets the held left hand at 14.125 s and forearm at 14.133 s; the foe has no action.
Lowering only its guard after takeover changes `guarded` to `landed`. At 4 m right moment 6,
the guard intercepts at 21.250 s before an incoming blow at 21.500 s; lowering it leaves a miss,
so delivery remains secondary. At 4 m left moment 2 the held forearm is direct trace evidence;
lowering the guard only after takeover does not clear it in time, and is not a confirming change.
The guard’s pose and cover are `src/skills/guard/guard.ts`, applied by `arbiter.ts`.

**Foe blow (B), confirmed.** At 3 m, left, moment 3 ([fights Ratings](http://localhost:5180/?play=ratings&evaluation=strike&protocol=fights&subject=option%2Fstraight-punch)),
the foe begins its right punch at 8.225 s; the two hands meet at 8.358 s, then fist meets forearm.
Removing only new foe attacks after takeover changes `guarded` to `missed`: delivery remains
secondary. At 5 m left moment 1, removing the simultaneous foe punch changes guarded to fell,
exposing the punch’s balance and delivery. At 5 m left moment 4, the foe hits the trunk at
10.183 s before the requested fist meets its upper arm at 10.292 s; suppressing only new foe
attacks from 9.983 s, before that attack starts, leaves a miss. Guard obstruction is secondary.
The foe’s attack runs the same straight-punch executor; `readStrike` classifies an arm-only
fist contact as `guarded`, including a punching arm (`src/evaluation/strike/read.ts`).

**Drill footwork (D), trace evidence.** At 4 m, right, moment 2 ([fight Ratings](http://localhost:5180/?play=ratings&evaluation=strike&protocol=fight&subject=option%2Fstraight-punch)),
the original left punch meets the guard before the requested right is available. At 8.150 s
the drill asks for a place toward +z while actual stance velocity is −1.191 m/s in z. The right
never begins; the final along-window offset is 1.104 m. Removing foe travel leaves outside;
replacing place orders with direct movement still leaves it unbegun; bypassing position admission
begins a punch that falls. The failed return to the window is visible in `drillCommander`’s
`straightSpot`/`placeMovement` approach and the stance it receives (`src/minds/command/drill.ts`).
The navigation/stance contribution remains unresolved; the preceding guard contact is secondary.

**Foe step (T), confirmed.** At 3 m, left, moment 7 ([fights Ratings](http://localhost:5180/?play=ratings&evaluation=strike&protocol=fights&subject=option%2Fstraight-punch)),
the foe retreats across the moving window and the requested punch never begins. Removing only
foe travel after takeover changes outside to guarded. At the same gap, right moment 6 becomes
missed under that removal. Guard or delivery remains secondary, with stance quietness also
limiting the right-hand admission. The moving window is `strikeWindow` and `quietToStrike`
(`src/skills/strikes/strike-window.ts`), pursued by the drill’s ordinary approach.

**Unreached (U), trace evidence.** At 3 m, either hand, moment 8 ([fights Ratings](http://localhost:5180/?play=ratings&evaluation=strike&protocol=fights&subject=option%2Fstraight-punch)),
the fight reaches seven body-directed actions before 30 s. At 5 m it reaches six, so moments
7 and 8 on both hands are unreached. Falls and recovery precede the absent moments. The takeover
counter is `reached` in `drill.ts`; `readStrike` keeps `handed` null until takeover. These six
conditions are excluded from the landed/reached denominator.

The confirming trials use a disposable source copy and the installed network, with each
intervention selected independently and the two body centres bit-equal to their saved traces
until its cutoff. There are 59 controlled replays, including one unchanged-copy control that
reproduces the full saved reading and centres throughout. Suppressing a component exposes other
failures; it is diagnostic evidence, not an installed improvement. The per-trial trace findings,
intervention results and counts are in the finding commit’s message.

Unchecked: the precise native/learned split in P and navigation/stance split in D; Rogue and
Skeleton causes; held items; Option Mind’s own punch choice and combat footwork; profiles;
480 Hz; every reel. This reading does not establish the goal’s required gain on `fight`.
## Open questions

- **Why trunk punches are refused**: against the guarded target 5 of 32 still and 7 of 64 walked
  to ended `refused` with no reason, in the window and ready. A trial's last phase and its times are read with `playTrial`
  (`research/drill-trials.mjs`: its reading's `phase`) on the cell's subject, one case at a time; the
  reel (the Ratings link on each reading's line, opened as
  [the table](../reference/the-table.md) says) shows it.
- **Whether a later checkpoint of the steer lands more**: a checkpoint is screened on
  `punch-policy-check.mjs` (its environment's twin places at 120 Hz; with `--cell`, the cells'
  own cases at 120 and 480 Hz, the worse counting) against the installed network.

## To pick it up

- **The skill**: the executor `src/skills/strikes/straight-punch.ts`, its part `punch-part.ts`,
  what its network reads `learned-punch.ts`, its window `strike-window.ts`; its record and the
  network's layout in `assets/skills/strikes/straight-punch/`.
- **The Option**: `strikeKind` and `STRAIGHT_PUNCH_OPTION` in `src/minds/option/kinds.ts`; the
  game's config in `src/entrants/option/mind.ts`; its profiles, which price it for the Mind, are
  built from the Strike drill's fights (`--protocol fights`) by
  `research/skills/strikes/strike-profiles.mjs` into
  `assets/skills/strikes/strike-profiles/strike-profiles.json`. The asset's are still the ones
  measured at a drill's target; no fight is played for them yet.
- **The drill**: its cases `src/evaluation/strike/cases.ts`, its reader and what each outcome
  means `src/evaluation/strike/read.ts`, its score `score.ts`.
- **Research**: `research/skills/strikes/straight-punch/` holds the schedule search on
  the row's training twins (`punch-drill.mjs`, its `--confirm` on the cells' own cases), the screen
  of a schedule or a policy (`punch-policy-check.mjs`) and the training environment, on the twin. The installed network is the record's own; a policy is screened
  against it by extracting it (`network` in the record) to a file.
- **One protocol of the drill**, played and not kept:
  `npm run evaluate -- strike option/straight-punch --protocol still`; with `--write` it becomes
  the newest result the table reads. Price it from its first trials.
- **The row, played again on the code now**:
  `npm run evaluate -- table --body workshop-fighter --skill punch --fresh --workers <logical processors>`.
  Each reading has its baseline, so the lines then say better, worse or within noise.
- Work goes under `.tmp/warrior-punch/`.

## Completion

The owner takes the row as it reads. What worked then goes into the recipes, what the owner
accepts a mechanism cannot do into the approaches, and these notes are deleted.
