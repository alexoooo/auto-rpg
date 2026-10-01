# The lab's tuning

The readings behind the lab's constants and fitted poses: the hand poses the skin draws
(`src/lab/club-grip.ts`, `src/render/skin.ts`), the page's seek budget
(`src/lab/main.ts`), the Routine's gait (`src/lab/routine.ts`, `src/lab/track.ts`),
how far ahead a walker on a track faces (`src/lab/run-mode.ts`), and how far off the track
the run test lets a walker go (`tests/lab-run.test.mjs`).

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

## Routine gait

The Routine sets off from standing at the post into its half-turn, where the envelope's turns,
measured on a walk under way, do not hold: a second after setting off the walk is at 0.1 m/s.
`research/core-routine-battery.mjs` ran each human through 6 runs of 10 loops, pushed 3 N s at
the start, at 120 and at 480 Hz (Node core stand, Rapier).

| Pace, m/s | Turn, rad/s | What happened |
|-----------|-------------|---------------|
| 0.5 (the Rogue's fastest walk) | 2 | fell in the second loop of every run |
| 0.3 | 4 (the envelope's turn at that pace) | the Warrior pivoted half round nearly where it stood and ran off sideways, in 1 run of 6 at 120 Hz and 1 of 6 at 480 Hz |
| 0.3 | 1 | each human held all 60 loops, at 120 and 480 Hz |

Standing still after each strike before walking on changed nothing: the turn is the cause.
`ROUTINE_GAIT`: 0.3 m/s (`TURN_PACE`) at 1 rad/s (`LAB_TURN_RATE`), a half-turn of 0.3 m radius.

Command: `node research/core-routine-battery.mjs --seeds 6 --loops 10`, and with `--hz 480`; its
other flags are `--variants` (stance settings), `--impulse` (3), `--models`, `--workers` and
`--list`. The gait is not a flag: the first two rows were read with `ROUTINE_GAIT` written for
them, in the work that became `8ee70e1e`, and were not committed. The last row is the command as
it stands, and reads the same at `e4ec0709`: each human 60 of 60 loops at 120 and at 480 Hz.

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
