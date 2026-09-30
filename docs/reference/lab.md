# The lab's tuning

The readings behind the lab's constants and fitted poses: the hand poses the skin draws
(`src/core-lab/club-grip.ts`, `src/core-lab/skin.ts`), the page's seek budget
(`src/core-lab/main.ts`), the Routine's gait (`src/core-lab/routine.ts`, `src/core-lab/track.ts`),
how far ahead a walker on a track faces (`src/core-lab/run-mode.ts`), and how far off the track
the run test lets a walker go (`tests/core-lab-run.test.mjs`).

## Club grip

`CLUB_GRIP` was fitted by `scripts/core-lab/haft-fit.mjs` on each model's skin, CPU-skinned from
its GLB, around the wooden club's haft where the core's grip puts it. Each finger's nearest gap
to the haft, proximal to end phalanx, mm (negative inside); both hands read alike:

| Model   | Index           | Middle          | Ring            | Pinky            | Thumb's pad |
|---------|-----------------|-----------------|-----------------|------------------|-------------|
| Warrior | 0.9, 0.1, 0.1   | 0.1, 1.1, 4.4   | 2.2, 0, 2.1     | 2.4, 0.5, 2.7    | 0.8         |
| Rogue   | 0.6, -0.8, 3.8  | 1.6, 3.0, -0.9  | 1.7, -0.2, 4.7  | 3.1, -0.9, -0.3  | -0.9        |

The fit: each finger as near the haft as it lies without sinking in more than 1 mm, and the
thumb's pad on it. `tests/core-lab-grip.test.mjs` holds the pose to 1.5 mm in and 2 mm off.

## Fist

`FIST` was fitted by `scripts/core-lab/fist-fit.mjs` on each model's skin, CPU-skinned from its
GLB. The fit leaves no part deeper in another than 2 mm, or than the relaxed hand already is,
except the thumb's first phalanx in the ball of the thumb:

| Model   | Thumb's first phalanx in the ball, mm | The same, relaxed, mm | Thumb's pad from the fingers, mm |
|---------|---------------------------------------|-----------------------|----------------------------------|
| Warrior | 5.0                                   | 3.5                   | 3.8                              |
| Rogue   | 5.6                                   | 5.5                   | 1.1                              |

The fit: every knuckle at one angle and each middle joint as far closed as it goes; the most
closed fist wins.

## Seek budget

A seek on the lab page runs the world for up to `SEEK_BUDGET_MS` in each page frame. Measured on
the page in a browser automation tab, at 120 Hz, a step taking 0.9 to 1.8 ms: the steps a second
through a 400-step seek, against the budget.

| Budget, ms | Steps a second |
|------------|----------------|
| 16         | 140 to 214     |
| 25         | 162            |
| 40         | 92, the page drawing 3 times a second |

The browser holds back frames that run long, so a longer budget loses more than it gains. 10 ms:
with the draw's 6 ms, one frame of a 60 Hz display.

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

## Aim ahead

A walker round the Routine's path, each human (Node core stand, 120 Hz):

| The walker asks for | Result |
|---------------------|--------|
| the path's own heading | each loop ended some 0.4 m further from where it began |
| the heading to the path's point 1 m on (`AIM_AHEAD`) | each loop came back to its start |
| a velocity toward where the path would be a second on, sideways and faster to catch up | fell in three runs of four |

`AIM_AHEAD`: 1 m.

## Run tolerance

`tests/core-lab-run.test.mjs`: each human round each track for 30 s, asked its fastest walk
(Warrior 0.7 m/s, Rogue 0.5) and round the shuttle's 0.3 m half-turns at what its turn carries
(`paceRound`: 0.6 and 0.5). Node core stand, Rapier, 120 Hz. None fell.

| Track   | Mean speed along it, m/s (Warrior, Rogue) | Farthest off after the first second, cm (Warrior, Rogue) |
|---------|-------------------------------------------|-----------------------------------------------------------|
| Circle  | 0.544, 0.389                              | 12.0, 12.5                                                |
| Shuttle | 0.544, 0.398                              | 26.0, 28.2                                                |

On the circle, pursuing a point 1 m on cuts inside a 4 m circle by about 1 / (2 * 4) m, 12 cm.
A walker that speeds up at a bend's end instead of keeping the bend's pace a metre past it
leaves the bend short of the way back: on the same stand, the Warrior asked 0.5 m/s at 1 rad/s was 0.9 rad short
and went 45.6 cm off the shuttle, against 31.7 cm kept slow.

`OFF`, the test's limit: 0.4 m, over every reading here, under the walker that does not keep a
bend's pace.
