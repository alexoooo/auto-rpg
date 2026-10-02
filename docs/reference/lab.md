# The lab's tuning

The readings behind the lab's constants and fitted poses: the hand poses the skin draws
(`src/lab/club-grip.ts`, `src/render/skin.ts`), the page's seek budget
(`src/lab/main.ts`), where the Routine's targets are drawn and how they are read
(`src/lab/targets.ts`), the Routine's gait (`src/lab/routine.ts`, `src/lab/track.ts`),
how far ahead a walker on a track faces (`src/lab/run-mode.ts`), how far off the track
the run test lets a walker go (`tests/lab-run.test.mjs`), and what the page hears
(`src/lab/sound-log.ts`).

## Club grip

`CLUB_GRIP` was fitted by `scripts/lab/haft-fit.mjs` on each model's skin, CPU-skinned from
its GLB, around the wooden club's haft where the core's grip puts it. Each finger's nearest gap
to the haft, proximal to end phalanx, mm (negative inside); both hands read alike:

| Model   | Index           | Middle          | Ring            | Pinky            | Thumb's pad |
|---------|-----------------|-----------------|-----------------|------------------|-------------|
| Warrior | 0.9, 0.1, 0.1   | 0.1, 1.1, 4.4   | 2.2, 0, 2.1     | 2.4, 0.5, 2.7    | 0.8         |
| Rogue   | 0.6, -0.8, 3.8  | 1.6, 3.0, -0.9  | 1.7, -0.2, 4.7  | 3.1, -0.9, -0.3  | -0.9        |

The fit: each finger as near the haft as it lies without sinking in more than 1 mm, and the
thumb's pad on it. `tests/lab-grip.test.mjs` holds the pose to 1.5 mm in and 2 mm off.

Command: `node scripts/lab/haft-fit.mjs workshop-fighter`, and with `workshop-rogue`; no engine,
the skin posed in Node from the GLB, over ten minutes a model. It prints each hand's gaps as
"nearest to the haft, mm (negative inside)", the thumb pad's gap, and the pose. Fitted at
`77097321`, as `scripts/core-lab/haft-fit.mjs`; at `e4ec0709` the Warrior's reads the table's row
and the pose `CLUB_GRIP` holds, to the digit. The Rogue's was not run again.

## Fist

`FIST` was fitted by `scripts/lab/fist-fit.mjs` on each model's skin, CPU-skinned from its
GLB. The fit leaves no part deeper in another than 2 mm, or than the relaxed hand already is,
except the thumb's first phalanx in the ball of the thumb:

| Model   | Thumb's first phalanx in the ball, mm | The same, relaxed, mm | Thumb's pad from the fingers, mm |
|---------|---------------------------------------|-----------------------|----------------------------------|
| Warrior | 5.0                                   | 3.5                   | 3.8                              |
| Rogue   | 5.6                                   | 5.5                   | 1.1                              |

The fit: every knuckle at one angle and each middle joint as far closed as it goes; the most
closed fist wins.

Command: `node scripts/lab/fist-fit.mjs workshop-fighter`, and with `workshop-rogue`; no engine,
the skin posed in Node from the GLB. It prints each hand's worst depth by kind (its `palm-thumb`
is the table's first column), the thumb pad's gap, and the pose. Fitted at `66b28a12`, as
`scripts/core-lab/fist-fit.mjs`; at `e4ec0709` the Warrior's reads the same 5.0 and 3.8 mm and the
pose `FIST` holds. The relaxed hand's depth is the probe's (`penetration`,
`scripts/lab/fist-probe.mjs`) on the rig's empty grip, by a line that was not kept.

## Seek budget

A seek on the lab page runs the world for up to `SEEK_BUDGET_MS` in each page frame. Measured on
the page in a browser automation tab, at 120 Hz, a step taking 0.9 to 1.8 ms: the steps a second
through a 400-step seek, against the budget. The page was read at `022077ed`, on an engine that is
gone, by hand: no script was kept, and the table has not been read on the engine the lab runs on
now.

| Budget, ms | Steps a second |
|------------|----------------|
| 16         | 140 to 214     |
| 25         | 162            |
| 40         | 92, the page drawing 3 times a second |

The browser holds back frames that run long, so a longer budget loses more than it gains. The
budget is 10 ms, set rather than measured: with the draw's 6 ms it fits one frame of a 60 Hz
display (16.7 ms), where every budget above ran over.

## Targets

`TARGET_BOX` (`src/lab/targets.ts`): where a target is drawn, in the statures of the body that
strikes at it, about the place the control hangs (`POST_BEYOND` beyond the Routine's walk out,
where the fists' recipes land). Set, and not measured: the box is the reach of an arm either side
and a step nearer or further, and the three bands divide the height a body has.

| | From, statures | To | For the Warrior (1.8 m), m | What it spans |
|---|---|---|---|---|
| Across the heading | -0.2 | 0.2 | -0.36 to 0.36 | an arm's reach to either side |
| Along it | -0.1 | 0.1 | -0.18 to 0.18 | a step nearer or further |
| Up, high | 0.75 | 1 | 1.35 to 1.80 | the shoulders to the crown |
| Up, middle | 0.5 | 0.75 | 0.90 to 1.35 | the hips to the shoulders |
| Up, low | 0.15 | 0.5 | 0.27 to 0.90 | the shins to the hips |

A target's stratum is its turn's, high, middle and low in that order after the control, so every
seed has the same number in each.

`TARGET_WATCH`: 0.5 s after a strike's pushes end before its target's reading closes. Set: the
Warrior's club lands within the quarter second before its pushes end
(`tests/lab-targets.test.mjs`), and the half second after is for a blow that lands late.

`TARGET_CLEAR`: 0.02 m between every shape of the body and a dummy's surface as the dummy is
hung. Set, and not measured: a body made inside another is thrown out of it by the solver
([blows.md](blows.md#targets)), and the margin keeps a dummy from being made in touch.

## Routine gait

The Routine sets off from standing at its targets into its half-turn, where the envelope's turns,
measured on a walk under way, do not hold: a second after setting off the walk is at 0.1 m/s.
`research/core-routine-battery.mjs` ran each human through 6 runs of 10 loops, pushed 3 N s at
the start, at 120 and at 480 Hz (Node core stand, Rapier). The Routine these rows read struck
three times in the air at one place.

| Pace, m/s | Turn, rad/s | What happened |
|-----------|-------------|---------------|
| 0.5 (the Rogue's fastest walk) | 2 | fell in the second loop of every run |
| 0.3 | 4 (the envelope's turn at that pace) | the Warrior pivoted half round nearly where it stood and ran off sideways, in 1 run of 6 at 120 Hz and 1 of 6 at 480 Hz |
| 0.3 | 1 | each human held all 60 loops, at 120 and 480 Hz |

Standing still after each strike before walking on changed nothing: the turn is the cause.
`ROUTINE_GAIT`: 0.3 m/s (`TURN_PACE`) at 1 rad/s (`LAB_TURN_RATE`), a half-turn of 0.3 m radius.

The gait is not a flag: the first two rows were read with `ROUTINE_GAIT` written for them, in the
work that became `8ee70e1e`, and were not committed. The last row read the same at `e4ec0709`.

**With its targets.** The Routine strikes at ten targets a loop, each a body from its strike's
beginning ([blows.md](blows.md#targets)). The same battery, each run's targets drawn from its
seed, `ROUTINE_GAIT` as it stands: loops held of 60, runs that stood through of 6, and the
strikes thrown and landed. Read at `b72e4ebe`, where a blow was a hand's landing: a touch by any
part of the arm is one now, and counts as landed.

| Rate, Hz | The loop | Warrior | Rogue |
|----------|----------|---------|-------|
| 120 | the walk alone (`--targets 0`) | 60, 6 | 60, 6 |
| 120 | the control alone (`--targets 1`) | 53, 5; 54 thrown, 54 landed | 60, 6; 60 thrown, 60 landed |
| 120 | ten targets | 41, 3; 426 thrown, 169 landed | 60, 6; 600 thrown, 298 landed |
| 120 | ten targets, no dummy hung | 58, 5; 590 thrown | 60, 6; 600 thrown |
| 480 | the walk alone | 60, 6 | 60, 6 |
| 480 | ten targets | 27, 0; 285 thrown, 97 landed | 50, 5; 507 thrown, 275 landed |
| 120 | ten targets, placed blows | 43, 2; 446 thrown, 335 landed | 60, 6; 600 thrown, 438 landed |
| 480 | ten targets, placed blows | 45, 4; 464 thrown, 353 landed | 60, 6; 600 thrown, 429 landed |

The gait holds the walk and the turn from standing, at both rates. The Warrior's falls at 120 Hz
came closing on a target (twice) and setting its feet for one, with its blows landing; walking
back, with the control alone and with no dummy hung. At 480 Hz with ten targets it fell in every
run, closing on a target or setting its feet for one, and the Rogue fell once setting its feet
and once did not end its loops in their time. Six runs a row: counts, and no rates. What one of
the falls was: [blows.md](blows.md#a-loop-of-ten).

The two rows with placed blows are of the tree where a target off a recipe's height is struck
by a placed blow ([blows.md](blows.md#placed)): of the ten targets of a loop the Warrior's
recipe is thrown at one or two and the Rogue's at two, and the rest are placed. The Rogue holds
every loop at both rates. The Warrior falls in four runs of six at 120 Hz, in its third, fourth
and tenth loops (the tenth twice), and in two of six at 480 Hz, in its first and sixth: five of
the six setting its feet for a target and one closing on one.

Command: `node research/core-routine-battery.mjs --seeds 6 --loops 10`, with `--targets` and
`--hz 480` for the other rows; its other flags are `--variants` (stance settings), `--impulse`
(3), `--models`, `--workers` and `--list`. The row with no dummy hung was read with
`TARGET_CLEAR` (`src/lab/targets.ts`) written past any reach, so that every place read as filled
and its strike was thrown at nothing, and was not committed.

## Aim ahead

A walker round the Routine's path, each human (Node core stand, 120 Hz). The readings are
`f58bf6cd`'s, on an engine that is gone, each with the walker written for it; no script was kept.

| The walker asks for | Result |
|---------------------|--------|
| the path's own heading | each loop ended some 0.4 m further from where it began |
| the heading to the path's point 1 m on (`AIM_AHEAD`) | each loop came back to its start |
| a velocity toward where the path would be a second on, sideways and faster to catch up | fell in three runs of four |

`AIM_AHEAD`: 1 m. Set: the readings behind it have not been taken on the engine the lab runs on
now, where the run test below holds a walker facing 1 m ahead within 0.4 m of each track.

## Run tolerance

`tests/lab-run.test.mjs`: each human round each track for 30 s, asked its fastest walk
(Warrior 0.7 m/s, Rogue 0.5) and round the shuttle's 0.3 m half-turns at what its turn carries
(`paceRound`: 0.6 and 0.5). Node core stand, Rapier, 120 Hz. None fell.

| Track   | Mean speed along it, m/s (Warrior, Rogue) | Farthest off after the first second, cm (Warrior, Rogue) |
|---------|-------------------------------------------|-----------------------------------------------------------|
| Circle  | 0.543, 0.388                              | 12.0, 12.5                                                |
| Shuttle | 0.543, 0.398                              | 26.0, 28.2                                                |

Command: `node --test tests/lab-run.test.mjs`, which reports each run's two readings as its
diagnostic; the speed is the distance gone along the track over the 30 s. The walker read is
`e4ec0709`'s.

On the circle, pursuing a point 1 m on cuts inside a 4 m circle by about 1 / (2 * 4) m, 12 cm.
A walker that speeds up at a bend's end instead of keeping the bend's pace a metre past it
leaves the bend short of the way back: on the same stand, the Warrior asked 0.5 m/s at 1 rad/s was
0.9 rad short and went 45.6 cm off the shuttle, against 31.7 cm kept slow. Those two are
`0c36b21d`'s readings, by this test as it then was; the walker that speeds up is not in the code.

`OFF`, the test's limit: 0.4 m, over every reading here, under the walker that does not keep a
bend's pace.

## Sound

The page logs what its body sounds of against the mind's time (`createSoundLog`, `logSounds`,
`src/lab/sound-log.ts`) and plays what the time shown passes: the rules and their numbers are
[look.md](look.md#sound)'s.

- **A frame plays at most `CATCH_UP_MS` of sound**, 100 ms: what the player lets one page frame
  run of the world or of a replay (`src/lab/player.ts`). A jump of the time shown, as on a seek
  or a Restart, plays its last 100 ms and no more.
- **A target is heard with the body.** A scenario that puts another body in the world hands it to
  the page (`ScenarioContext.hears`), as the Routine does each target it hangs
  (`src/lab/targets.ts`): its touches on the body are logged with the body's own, keyed
  `other:body`, from the step it is hung until its reading closes.
- **`AIR_SECONDS`** (`src/lab/main.ts`), 30 s of the body's air: as long as the Routine's
  recording, the longest a scenario keeps. The log keeps its latest 1024 cues (`CAPACITY`), a
  numeric setting.
- **A shove's energy** is what its impulse J gives the mass m it meets from rest, J squared over
  2 m (`shoveSound`), with m the body's at the middle trunk's centre along the push
  (`contactMass`). Node core stand, Rapier, 120 Hz, standing in guard, balance 0 %, pushed from
  behind:

  | Model | Mass met, kg: from behind, from the side | Strength at 10, 20, 30, 40, 60 N s |
  |---|---|---|
  | workshop-fighter | 20.9, 31.3 | 0.20, 0.40, 0.60, 0.80, 1 |
  | workshop-rogue | 14.1, 20.7 | 0.24, 0.49, 0.73, 0.97, 1 |
  | crypt-skeleton | 21.5, 33.1 | 0.20, 0.39, 0.59, 0.79, 1 |

- **On the page** (Chrome, Rapier, 120 Hz, a 40 m ground, balance 0 %, stepped by hand): the
  Warrior walking at 0.3 m/s is heard a footfall every 0.375 s, strength 0.064 to 0.069; its Blow
  lands 123.8 J on the mark at 2.375 s, strength 1, and its air's fastest point reaches 19.8 m/s
  the step after. Paused, the page starts no voice; a scrub starts none; a replay starts the air
  again.
