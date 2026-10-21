# The lab's tuning

The readings behind the lab's constants and the hand poses the skin draws: the club grip and fist
(`src/render/`), the page's seek budget (`src/lab/main.ts`), the Routine's targets and gait
(`src/lab/targets.ts`, `routine.ts`, `track.ts`), how far ahead a walker faces
(`src/lab/locomotion-mode.ts`), how far off a track the locomotion check lets it go, and what the
page hears (`src/lab/sound-log.ts`).

## Club grip

`CLUB_GRIP` is fitted by `scripts/lab/haft-fit.mjs` on each model's skin, CPU-skinned in Node from
its GLB about the wooden club's haft where the core's grip puts it: each finger as near the haft as
it lies without sinking in more than 1 mm, the thumb's pad on it. Each finger's nearest gap to the
haft, proximal to end phalanx, mm (negative inside); both hands alike:

| Model | Index | Middle | Ring | Pinky | Thumb's pad |
|---|---|---|---|---|---|
| Warrior | 0.9, 0.1, 0.1 | 0.1, 1.1, 4.4 | 2.2, 0, 2.1 | 2.4, 0.5, 2.7 | 0.8 |
| Rogue | 0.6, -0.8, 3.8 | 1.6, 3.0, -0.9 | 1.7, -0.2, 4.7 | 3.1, -0.9, -0.3 | -0.9 |

`node scripts/lab/haft-fit.mjs workshop-fighter` (and `workshop-rogue`): no engine, over ten
minutes a model. Fitted at `77097321`; the Warrior's row and pose read the same at `e4ec0709`.

## Fist

`FIST` is fitted by `scripts/lab/fist-fit.mjs` the same way: every knuckle at one angle and each
middle joint as far closed as it goes, the most closed fist that leaves no part deeper in another
than 2 mm, or than the relaxed hand already is, except the thumb's first phalanx in the ball of the
thumb:

| Model | Thumb's first phalanx in the ball, mm | The same, relaxed, mm | Thumb's pad from the fingers, mm |
|---|---:|---:|---:|
| Warrior | 5.0 | 3.5 | 3.8 |
| Rogue | 5.6 | 5.5 | 1.1 |

`node scripts/lab/fist-fit.mjs workshop-fighter` (and `workshop-rogue`) prints each hand's worst
depth by kind (`palm-thumb` is the first column), the pad's gap and the pose. Fitted at
`66b28a12`; the Warrior's reads the same at `e4ec0709`. The relaxed depth is
`scripts/lab/fist-probe.mjs`'s (`penetration`) on the rig's empty grip.

## Fist presentation

`src/render/hand-pose.ts` closes an empty hand in 0.1 s (`CLOSING`) while chambering and relaxes it
in 0.25 s (`OPENING`) on return or interruption: the Routine's by-eye timing, shared by Arena,
Crypt and Lab. Each transition starts at the hand's current closure, and a swing is fully closed
from its first step. Neither timing changes the physical hand or the strike.

`strike-hands.ts` reads the active command owner's skill report after a step, and ignores it while
a sub-mind owns the body, the body is inactive or its pool has ended. Guarding, approaching and
moving leave empty hands relaxed. The simulation clock drives the transitions, Lab snapshots keep
both closures for playback, and a held item's grip stays the skin's fitted pose.

## Seek budget

A seek on the lab page runs the world for up to `SEEK_BUDGET_MS` in each page frame: **10 ms**,
set, so that with the draw's 6 ms it fits one frame of a 60 Hz display (16.7 ms). Every budget read
ran over, and the browser holds back frames that run long, so a longer budget loses more than it
gains:

| Budget, ms | Steps a second |
|---|---|
| 16 | 140 to 214 |
| 25 | 162 |
| 40 | 92, the page drawing 3 times a second |

Read by hand on the page in a browser automation tab at `022077ed`, 120 Hz, a step taking 0.9 to
1.8 ms, through a 400-step seek, on an engine that is gone.

## Targets

`TARGET_BOX` (`src/lab/targets.ts`): where a target is drawn, in the statures of the body that
strikes at it, about the place the control hangs (`POST_BEYOND` beyond the Routine's walk out,
where the fists' recipes land). Set: the box is an arm's reach either side and a step nearer or
further, and the three bands divide the body's height.

| | From, statures | To | For the Warrior (1.8 m), m | What it spans |
|---|---|---|---|---|
| Across the heading | -0.2 | 0.2 | -0.36 to 0.36 | an arm's reach to either side |
| Along it | -0.1 | 0.1 | -0.18 to 0.18 | a step nearer or further |
| Up, high | 0.75 | 1 | 1.35 to 1.80 | the shoulders to the crown |
| Up, middle | 0.5 | 0.75 | 0.90 to 1.35 | the hips to the shoulders |
| Up, low | 0.15 | 0.5 | 0.27 to 0.90 | the shins to the hips |

A target's stratum is its turn's, high, middle and low in that order after the control, so every
seed has the same number in each.

- `TARGET_WATCH`: 0.5 s after a strike's pushes end before its target's reading closes. Set: the
  Warrior's club lands within the quarter second before its pushes end
  (`tests/lab-targets.test.mjs@2a1b29ac`), and the half second after is for a blow that lands
  late.
- `TARGET_CLEAR`: 0.02 m between every shape of the body and a dummy's surface as the dummy is
  hung. Set: a body made inside another is thrown out of it by the solver
  ([blows.md](blows.md#targets)), and the margin keeps a dummy from being made in touch.

## Routine gait

`ROUTINE_GAIT`: 0.3 m/s (`TURN_PACE`) at 1 rad/s (`LAB_TURN_RATE`), a half-turn of 0.3 m radius.
The Routine sets off from standing at its targets into its half-turn, and the turn decides what
holds. `research/core-routine-battery.mjs`, each human 6 runs of 10 loops, pushed 3 N s at the
start, at 120 and 480 Hz (Node core stand, Rapier), striking three times in the air at one place:

| Pace, m/s | Turn, rad/s | What happened |
|---|---|---|
| 0.5 (the Rogue's fastest walk) | 2 | fell in the second loop of every run |
| 0.3 | 4 | the Warrior pivoted half round and ran off sideways, in 1 run of 6 at each rate |
| 0.3 | 1 | each human held all 60 loops at both rates |

Standing still after each strike before walking on changed nothing: the turn is the cause. The
first two rows were read with `ROUTINE_GAIT` written for them and not committed; the last reads the
same at `e4ec0709`.

**With its targets** (ten a loop, each a body from its strike's beginning,
[blows.md](blows.md#targets)): loops held of 60 and runs that stood through of 6, with strikes
thrown and landed. Read at `b72e4ebe`, where a blow was a hand's landing:

| Rate, Hz | The loop | Warrior | Rogue |
|---|---|---|---|
| 120 | the walk alone (`--targets 0`) | 60, 6 | 60, 6 |
| 120 | the control alone (`--targets 1`) | 53, 5; 54 thrown, 54 landed | 60, 6; 60 thrown, 60 landed |
| 120 | ten targets | 41, 3; 426 thrown, 169 landed | 60, 6; 600 thrown, 298 landed |
| 120 | ten targets, no dummy hung | 58, 5; 590 thrown | 60, 6; 600 thrown |
| 480 | the walk alone | 60, 6 | 60, 6 |
| 480 | ten targets | 27, 0; 285 thrown, 97 landed | 50, 5; 507 thrown, 275 landed |
| 120 | ten targets, placed blows | 43, 2; 446 thrown, 335 landed | 60, 6; 600 thrown, 438 landed |
| 480 | ten targets, placed blows | 45, 4; 464 thrown, 353 landed | 60, 6; 600 thrown, 429 landed |
| 120 | ten targets, the searched repertoire | 52, 4; 534 thrown, 415 landed | 54, 4; 550 thrown, 399 landed |

The gait holds the walk and the turn from standing at both rates. The falls come closing on a
target or setting the feet for one, mostly the Warrior's; six runs a row are counts, not rates.
One fall is read in [blows.md](blows.md#a-loop-of-ten); the placed rows are the tree of
[placed blows](blows.md#placed), the last of the [searched repertoire](blows.md#searched).

`node research/core-routine-battery.mjs --seeds 6 --loops 10`, with `--targets` and `--hz 480`
for the other rows (also `--variants`, `--impulse`, `--models`, `--workers`, `--list`). The row with
no dummy hung was read with `TARGET_CLEAR` written past any reach, not committed.

## Aim ahead

`AIM_AHEAD`: 1 m. A walker round the Routine's path asks for the heading to the path's point 1 m
on (Node core stand, 120 Hz, each human; read at `f58bf6cd` on an engine that is gone, with no
script kept):

| The walker asks for | Result |
|---|---|
| the path's own heading | each loop ended some 0.4 m further from where it began |
| the heading to the path's point 1 m on | each loop came back to its start |
| a velocity toward where the path would be a second on, sideways and faster to catch up | fell in three runs of four |

On the core, the locomotion check holds a walker facing 1 m ahead within 0.4 m of each track
([below](#locomotion-tolerance)).

`AIM_ALONG`: 1.25 m. A walker facing along a track turns into a bend over the arc from its heading
to the point it faces, and the Locomotion scenario asks no faster than its turns carry it round
that arc. It brakes for each bend as if it were as much nearer as the body goes in 0.3 s (`LEAD`).
On the locomotion bed (`research/locomotion-run.mjs --played`: the Warrior, the Rogue and the
skeleton on the circle and the shuttle, paces 0.5 to 2.5 m/s, calm and 20 N gusts on seeds 1–6,
60 s; Node core stand, Rapier, 120 Hz; the SIMBICON walk), the mean speed along the track, before
`LEAD`:

| Faced ahead | Circle W / R / S, m/s | Shuttle W / R / S, m/s | Falls of 168 | Most off the track, m |
|---|---|---|---:|---:|
| 1 m | 0.98 / 0.84 / 0.91 | 0.77 / 0.71 / 0.78 | 0 | 0.51 |
| 1.25 m | 0.98 / 0.84 / 0.92 | 0.79 / 0.74 / 0.81 | 0 | 0.45 |
| 1.5 m | 0.99 / 0.85 / 0.92 | 0.83 / 0.77 / 0.80 | 2 | 0.70 |
| 2 m | 1.01 / 0.87 / 0.94 | 0.93 / 0.85 / 0.64 | 21 | 0.89 |

Past 1.25 m the skeleton reaches the shuttle's half-turn still going about 1.1 m/s and falls: its
speed trails the walk asked by about half a second, which `LEAD` answers. Faced further, the walker
cuts the course by about the square of how far it faces over twice the radius (0.38 m inside the
circle at 1.75 m). Faced 1.25 m ahead with `LEAD`, the shuttles read 0.81 / 0.75 / 0.82, and the
same on gust seeds 7–12.

## Locomotion tolerance

`OFF`, the limit of `tests/lab-locomotion-capability.test.mjs@2a1b29ac`: **0.4 m**, over every
reading here and under a walker that does not keep a bend's pace. Each human goes round each track
for 30 s asked its fastest walk (Warrior 0.5 m/s, Rogue 0.4), which its turn carries round the
shuttle's 0.3 m half-turns (`paceRound`). Node core stand, Rapier, 120 Hz; none fell.

| Track | Mean speed along it, m/s (Warrior, Rogue) | Farthest off after the first second, cm (Warrior, Rogue) |
|---|---|---|
| Circle | 0.463, 0.347 | 11.4, 11.9 |
| Shuttle | 0.480, 0.364 | 26.5, 28.0 |

`node --test tests/lab-locomotion-capability.test.mjs@2a1b29ac` reports each run's two readings.
Pursuing a point 1 m on cuts inside the 4 m circle by about 1 / (2 * 4) m, 12 cm.

### Tried and not kept

- **Speeding up at a bend's end** instead of keeping the bend's pace a metre past it: the Warrior
  asked 0.5 m/s at 1 rad/s was 0.9 rad short and went 45.6 cm off the shuttle, against 31.7 cm kept
  slow (`0c36b21d`).

## Sound

The page logs what its body sounds of against the mind's time (`createSoundLog`, `logSounds`,
`src/lab/sound-log.ts`) and plays what the time shown passes; the rules and their numbers are
[look.md](look.md#sound)'s.

- **A frame plays at most `CATCH_UP_MS` of sound**, 100 ms: what the player lets one page frame
  run (`src/lab/player.ts`). A seek or a Restart plays its last 100 ms and no more.
- **A target is heard with the body.** A scenario that puts another body in the world hands it to
  the page (`ScenarioContext.hears`), as Attack does for its targets: its touches are logged keyed
  `other:body` and `other:ground`, from the step it is hung until its reading closes.
- **`AIR_SECONDS`** (`src/lab/main.ts`), 30 s of the body's air: as long as Attack's recording, the
  longest a scenario keeps. The log keeps its latest 1024 cues (`CAPACITY`), a numeric setting.
- **A shove's energy** is what its impulse J gives the mass m it meets from rest, J squared over
  2 m (`shoveSound`), with m the body's at the middle trunk's centre along the push
  (`contactMass`). Node core stand, Rapier, 120 Hz, standing in guard, balance 0 %:

  | Model | Mass met, kg: from behind, from the side | Strength at 10, 20, 30, 40, 60 N s, from behind |
  |---|---|---|
  | workshop-fighter | 20.9, 31.3 | 0.20, 0.40, 0.60, 0.80, 1 |
  | workshop-rogue | 14.1, 20.7 | 0.24, 0.49, 0.73, 0.97, 1 |
  | crypt-skeleton | 21.5, 33.1 | 0.20, 0.39, 0.59, 0.79, 1 |

- **On the page** (Chrome, Rapier, 120 Hz, stepped by hand): the Warrior walking at 0.3 m/s is
  heard a footfall every 0.375 s, strength 0.064 to 0.069; its unit club blow lands 103.2 J at
  2.383 s, strength 1, its air at 19.6 m/s the step before, and the target is heard on the ground
  0.73 s after, strength 0.43. Paused, the page starts no voice; a scrub starts none; a replay
  starts the air again.
