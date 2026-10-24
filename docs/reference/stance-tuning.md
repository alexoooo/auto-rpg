# Stance tuning

The sweeps behind the stance controller's constants in `src/core/control/stance-tuning.ts`
(`STANCE_SECONDS`, `STANCE_KNEE_BEND`, `STANCE_ANKLE_SPARE`, `STANCE_RECOVERY`, `STANCE_GAIT`,
`STANCE_TRACK`, `SOLE_MARGIN`, `SUPPORT_INSET`, `StanceTuning.heelOff`), the ankle's hold
(`ankleStrength`, `src/core/control/support.ts`), the bearing solve's bounded free limb
(`boundFree`, `src/core/control/bearing.ts`) and the ground wrench's lever (`leverOf`,
`src/core/control/stance.ts`). Each constant's comment links its section.

## Measurement

Node core stand (`tests/harness/core-stand.mjs`), Rapier, 120 Hz, each human 3 cm under its
reference height, `research/core-stance-sweep.mjs` unless a section says otherwise. A table was read
on the controller of its commit, so counts in different tables do not compare row for row; a row
named as read again reads the same at that commit, to the digit.

    node research/core-stance-sweep.mjs --batteries stand,edge,step,gait,shove --top 90 --variants '<list>'

`--variants` is a JSON list of settings (`StanceTuning`), `{}` being the constants. Other flags:
`--hz`, `--models`, `--workers`, `--speeds` and `--ways` (the walks), `--walked` (shoves after a
walk), `--solve` (the whole-body solve), `--balance`, `--gusts`. The batteries
(`research/core-stance-trials.mjs`), one setting moved at a time:

- **places** (`edge`): a place 30 cm out each of 4 ways; the count that failed (fell, over 15 mm
  off the place, 5 mm off height, or 10 mm of slide);
- **steps** (`step`): each foot 15 and 25 cm forward, 15 cm back and 10 cm out (8); the count that
  failed;
- **walks** (`gait`): 0.2, 0.3, 0.4, 0.5 and 0.7 m/s forward, right, back, left and forward right,
  8 s then a stop (25); the count held;
- **shoves** (`shove`): 10 to 90 N s by 5, sixteen ways, at the middle trunk's centre of mass,
  watched 4.5 s (272; 176 to 60 N s without `--top 90`); the count held, then the impulse held each
  way (the largest below the first that fell) as its mean and its least, N s.

At `e4ec0709` the constants (`--variants '[{}]'`) read, Rogue and Warrior: places 0 and 0 failed;
steps 0 and 0; walks 24 and 25 held; shoves 118 (41.9, 35) and 216 (72.2, 55).

## Stance height

`STANCE_LOWER` (`src/core/skills/locomotion.ts`) is 0.03 m: how far under its reference height the
skills hold a body's centre of mass. The reference height is the centre of mass's over the soles'
middle in the reference pose (`standingHeight`, `src/core/control/support.ts`); a body built in its
empty-handed guard is 7 mm (the Rogue) to 11 mm (the skeleton) higher, and the envelope
(`assets/core/stance-envelope.json`) is read built in that guard. Every table here was read at it
and it was not swept, so a change to it voids them. Asked 8 cm or more lower, a human settles only
about 1 cm lower and falls walking or stopping from there (the lab's Stance).

## Fallen

The batteries count a fall at 0.25 m: the centre of mass that far under the height the stance is
asked (`research/core-stance-trials.mjs`). Set, not swept. The game's bar is the same quarter metre,
read from the body at every step: `rising.md#down`.

## Friction

A contact whose colliders name no coefficient has 0.5 (`CONTACT_FRICTION`,
`src/core/read-body.ts`), Rapier's default (`rapier-default-friction` in `SOURCES`); a foot names
0.8 (`FOOT_FRICTION`, `src/core/human/segments.ts`) from `bf9cbbc0`. Tables read before that commit
had every contact at 0.5; the whole-body solve's tables after it had the feet at 0.8. The stance's
limits on a sole are read from the coefficient, so another one voids a table.

## Time constants

`STANCE_SECONDS`: each time constant moved alone, at `abfe6153` (a row is
`{"seconds": {"across": 0.2, "height": 0.15, "turn": 0.15, "swing": 0.1}}`; the first and the
chosen row read again).

                     Rogue                                  Warrior
                     places  steps  walks  shoves           places  steps  walks  shoves
        across 0.2   0       0      21     126  42.8  15    1       4      22     215  69.1  55
        across 0.3   0       0      19     128  44.7  35    0       0      21     217  66.9  45   chosen
        across 0.4   0       0      18     130  45.3  35    0       0      22     214  68.8  55
        height 0.1   0       0      19     128  44.4  35    0       0      20     223  74.1  55
        height 0.2   0       0      19     126  44.4  35    0       0      21     212  67.5  55
        swing 0.05   0       0      22     133  42.2  15    0       0      21     206  67.5  50
        swing 0.2    0       0      19     112  38.4  15    0       0      21     193  62.2  50

Across 0.2 slid the Warrior's foot 30 cm on a place, failed four steps, and let the Rogue fall to
20 N s from one way; at 0.4 each centre drifts 0.2-0.3 mm over a stand's last 2 s, at 0.3 none.
Height 0.1 and 0.2 read as 0.15. The pelvis's turn (0.15) was not swept. Chosen on the bearing
solve: across 0.3, height 0.15, turn 0.15, swing 0.1.

On the whole-body solve the swing alone, at `d3b0f048`, balance 0: the five-way gait battery asked
0.7 to 1.8 m/s (30 walks a body, 8 s then stopped) and the stop battery (0.7, 1.0 and 1.2 m/s four
ways, empty and club, calm and in a 1 m/s gust; 48):

                     gait held          stop held
                     Rogue  Warrior     Rogue  Warrior
        swing 0.1    26     27          43     45
        swing 0.07   28     27          47     47
        swing 0.05   30     27          48     48
        swing 0.04   30     30          48     48      chosen
        swing 0.035  29     30          48     48
        swing 0.025  30     30          47     48

At 0.1 every fall is a walk or stop backward at 1 m/s or more: the swinging foot lags its path by
the constant, most where the path rises late under a leg stepping back (the Warrior at 1.6 m/s had
its toes down from 0.63 of the swing and landed 0.07 m short). At 0.025 the Warrior's club stop in
the gust settles only after 6 s. A stiffer swing walks a little slower (the Warrior asked 1.0 m/s
walks 0.81 of it at 0.1, 0.69 at 0.04).

    --batteries gait --speeds 0.7,1.0,1.2,1.4,1.6,1.8 --ways 0,45,90,180,270 --solve
    --batteries stop --speeds 0.7,1,1.2 --ways 0,90,180,270 --gusts 1:5:5 --solve

## Knee bend

`STANCE_KNEE_BEND`. Asked to stand higher than its legs reach, a stance held to the height presses
its knees on their stops and wanders: over a 5 s stand's last 2 s the Rogue asked 10 cm high drifted
9.5 mm and the Warrior asked 5 cm high 52 mm (at 10 cm it fell); held for the bend, 0.03 mm. At
`abfe6153` (`{"kneeBend": null}` is none; that row read again):

                     Rogue                                  Warrior
                     places  steps  walks  shoves           places  steps  walks  shoves
        none         0       0      20     119  42.2  35    0       0      23     213  68.4  55
        0.1          0       0      19     128  45.0  35    0       0      21     217  70.9  55
        0.2          0       0      19     128  44.7  35    0       0      21     217  66.9  45   chosen
        0.3          0       0      21     130  45.3  35    0       0      21     217  70.9  55
        0.4          0       1      21     127  44.4  35    2       0      22     215  70.6  55

Chosen: 0.2, the least bend under which no step failed; 0.1 to 0.3 read alike.

## Ankle spare

`STANCE_ANKLE_SPARE`. Standing 3 cm low, the Rogue's ankles are already at 0.26 rad of their 0.35
(`humanSpec`). At `abfe6153` (`{"ankleSpare": null}` is none; that row read again):

                     Rogue                                  Warrior
                     places  steps  walks  shoves           places  steps  walks  shoves
        none         0       0      20     111  39.7  30    0       0      21     183  60.6  50
        0            0       0      18     127  44.4  35    0       0      21     213  70.6  55
        0.01         0       0      19     128  44.7  35    0       0      21     217  66.9  45   chosen
        0.03         0       2      19     126  44.4  35    0       2      20     214  70.3  55
        0.05         0       6      19     126  44.1  35    0       6      21     214  67.8  55

A larger spare holds a stepping stance too high for its knees, and the long steps fail first.
Chosen: 0.01.

## Recovery step

`STANCE_RECOVERY`, against the shoves at `abfe6153` with `--batteries shove --top 90`; a row is
`{"recovery": {"margin": 0, "reach": 0.2, "seconds": 0.3, "lift": 0.05}}`, "no step"
`{"recovery": null}` (read again).

        margin  reach   seconds  lift    Rogue held  mean  least    Warrior held  mean  least
        no step                          76          28.8  20       129           45.3  30
        0.01    0.2     0.3      0.05    128         44.7  35       217           66.9  45    chosen
        0       0.2     0.3      0.05    128         44.7  35       170           56.3  40
        0.02    0.2     0.3      0.05    127         44.4  35       217           66.9  45
        0.01    0.1     0.3      0.05    128         44.4  35       213           69.7  55
        0.01    0.3     0.3      0.05    126         43.8  35       216           71.3  55
        0.01    0.2     0.2      0.05    100         35.6  30       182           59.1  35
        0.01    0.2     0.25     0.05    122         42.8  35       207           65.0  40
        0.01    0.2     0.35     0.05    121         42.2  30       203           62.2  35
        0.01    0.2     0.3      0.03    129         45.3  35       219           70.6  55

The margin is for standing, not the shoves: at none, a place held at the edge of what the soles
hold sets steps off as the capture point wanders a millimetre over it (each human's feet walked
30 cm or more, and the unpushed Warrior slid a foot 25 cm and failed every step); at 0.01 and 0.02
it stands. A 0.2 s swing holds a fifth fewer shoves. Rows within a few shoves of the chosen differ
by where single shoves first fall; a long step leaves a wide stance whose soles hold a thin band.

With the near foot stepping out once the far one is in (`recoveryStep`), the Warrior holds 65 N s
to either side and the Rogue 40 and 35, where the far foot alone holds little more than standing
(the Warrior 55 N s); on a later battery whose commit was not recorded, Rogue 118 of 272 against
117, Warrior 213 against 209.

Chosen: margin 0.01 (the lesser that stands), reach 0.2 (since 0: [which foot catches](#which-foot-catches)), seconds 0.3, lift 0.05.

### Fast catch

`STANCE_RECOVERY.fast`: a catch whose landing the leg cannot reach in 0.3 s swings over 0.2 s
instead (`recoveryStep`). Trials that fell, the braced walk given random orders and shoved at a
third of them (`research/core-stance-sweep.mjs --batteries orders --shoves`; seeds 1 to 200 shoved,
1 to 600 not; Node stand, rapier-coordinate, 120 Hz, at `b59188ad`):

| Catch's swing | Warrior, 30 N s | Rogue, 20 N s | Warrior, unshoved |
|---|---:|---:|---:|
| 0.3 s (a placebo: Warrior unshoved 16) | 118 | 125 | 14 |
| 0.2 s, every catch | 90 | 93 | 26 |
| 0.3 s, 0.2 out of reach | 104 | 99 | 12 |

Every catch at 0.15 to 0.25 s falls about alike shoved (78 to 103 of 200). A quicker step every
time falls more where nothing shoves it; one only where the slower falls short keeps the most of
the gain without that. Standing shoves held (`--batteries shove`) are unchanged: Rogue 133 of 176
against 127, Warrior 175 against 175.

Chosen: `fast` 0.2.

### Which foot catches

On both feet a catch (`recoveryStep`, `src/core/control/gait.ts`) is planned both ways, the far
foot stepping from the near one and the near one stepping out from the far, and the one whose
landing ends nearer where the capture point will be as it lands is taken; with one foot holding,
the other steps. `STANCE_RECOVERY.longest` holds a catch to 1.2 of the leg in place of a walk's 0.8
(`STANCE_GAIT.longest`). Trials that fell, the braced walk given random orders and shoved at 20 N s
at a third of them (`research/core-stance-sweep.mjs --batteries orders --shoves 20`, 0.5 m/s; Node
stand, rapier-coordinate, 120 Hz, at `5eff11aa`), of 200:

| Catch | Rogue, seeds 1 to 200 | Rogue, 201 to 400 | Warrior, 1 to 200 | Warrior, 201 to 400 |
|---|---:|---:|---:|---:|
| The far foot; the near steps out once the far has stepped in | 99 | 100 | 35 | 33 |
| The landing nearer the capture point | 63 | 80 | 11 | 13 |
| That, the longest catch 1.2 of the leg (kept) | 42 | 48 | 15 | 10 |

The longest catch over the second row, Rogue: 1 of the leg 51 and 53, 1.2 41 and 47 (a placebo,
the goal's height 1e-9 m higher, 40), 1.5 48 on seeds 201 to 400, none 52 and 48. Past about 1.2
the leg's reach (`reachableStep`) holds the step instead. Unshoved, the Warrior falls in 15 of
seeds 1 to 600 (a placebo 13) against 12. Standing shoves held (`--batteries shove`, Rapier):
Rogue 158 of 176 against 130, Warrior 176 against 173.

Not kept: no crossover (94 of 200 against 99, and 38 and 41 against 35 and 38 with the rest); a
catch's swing planned on 0.8 of the hip's torque in place of `effort`'s 0.5 (44 against 47 on
seeds 201 to 400, the Warrior 13 against 10); the near foot stepping out once the capture point is
past its sole across by a set distance (0.05 m 83, 0.02 m 76, 0 63, -0.03 m 76).

Chosen: the landing nearer, `longest` 1.2.

A landing kept off the bearing sole is put on the foot's own side of it, a left foot's left as the
sole faces (`clearOfBearer`), where it was put on the side the foot swung from: a foot crossed
over stayed crossed, and of the catches within 1.5 s before a fall a step from crossed feet fell
in 46 % and a crossover in 36 %, against 7 % for a step out and 5 % for one in beside. At
`40e8a9c0`, the same battery:

| Kept off to | Rogue, seeds 1 to 200 | Rogue, 201 to 400 | Warrior, 1 to 200 | Warrior, 201 to 400 |
|---|---:|---:|---:|---:|
| The side it swings from (a placebo: Rogue 40) | 42 | 48 | 15 | 10 |
| Its own side (kept) | 32 | 33 | 9 | 6 |

Unshoved, the Warrior falls in 12 of 600; standing shoves held: Rogue 159 of 176, Warrior 176.

`STANCE_RECOVERY.reach`, how far past where the capture point will be a catch lands, at
`a3b46190`, the same battery (Rogue on seeds 201 to 400 and the Warrior read at 0.05 and 0 only):

| Reach | Rogue, seeds 1 to 200 | Rogue, 201 to 400 | Warrior, 1 to 200 | Warrior, 201 to 400 |
|---|---:|---:|---:|---:|
| 0.3 | 44 | | | |
| 0.2 | 32 | 33 | 9 | 6 |
| 0.1 | 23 | 33 | | |
| 0.05 | 22 | 24 | 9 | 6 |
| 0 (kept) | 18 | 19 | 7 | 8 |

A catch's swing over 0.25 s in place of 0.3 fell 30, and `fast` 0.15 in place of 0.2 37, on the
Rogue's first 200. At reach 0 the unshoved Warrior falls in 9 of 600, and the standing shoves hold
Rogue 157 of 176 (least 45 N s, against 35) and Warrior 176. The standing shoves alone could not
choose it ([recovery step](#recovery-step): 0.1 to 0.3 hold alike); landing past the capture point
throws the body back the other way, and on a walk given orders the next step has to catch that.

### Assisted

`STANCE_RECOVERY.assisted`: how much of what the body's assist holds is counted before it steps
(`assistReach`, `src/core/control/gait.ts`). The capture point may lie that share of the assist's
reach outside the soles (a force F at the centre of mass holds F h / (m g), a moment M holds
M / (m g)) before a step is taken; with no assist the reach is nothing. The shoves on the
whole-body solve at 25 % balance (`--batteries shove --top 90 --solve --balance 25`, a row
`{"recovery": {"margin": 0.01, "seconds": 0.3, "lift": 0.05, "reach": 0.2, "assisted": 0.5}}`);
"steps" is recovery steps a held shove:

        assisted   Rogue held  mean  least  steps    Warrior held  mean  least  steps
        0          182         61.6  40     1.90     261           86.6  70     1.70
        0.25       185         62.8  40     0.98     261           86.6  70     0.81
        0.5        197         66.6  50     0.39     262           86.9  70     0.34
        0.75       216         72.5  65     0.20     272           90.0  90     0.06
        1          240         80.0  70     0.11     272           90.0  90     0.00   chosen

A step the assist did not need leaves a wide stance with a thin band. With no assist nothing
changes (the Rogue 163 held on the solve, 142 on the bearing solve; the Warrior 238 and 237). On the
bearing solve at 25 % the chosen row holds 231 (74.4, 60) and 271 (89.7, 85), from 177 and 251 at
0; at 10 % on the solve, 183 and 261. To 150 N s (`--top 150`, 464 shoves) the Warrior at 25 %
holds 361 (117.2, 95). Chosen: 1.

## Gait

`STANCE_GAIT`, against the walks at `abfe6153` (a row `{"gait": {"seconds": 0.25, "lift": 0.05,
"width": 0.2, "longest": 0.8, "accel": 1}}`; the first two rows and `accel` 0.5 read again). That
controller has no double support, pre-swing or heel-off. Every walk held went 0.8 to 1.25 of the
pace asked along over its last 3 s, under a quarter across, and stopped; the ratio is the mean speed
along over the asked, of those held; "at 0.7" is walks held at 0.7 m/s.

        seconds  lift   width  longest  accel   Rogue held  ratio  at 0.7    Warrior held  ratio  at 0.7
        0.3      0.05   0.2    0.8      1       19          0.94   0         21            0.93   1    chosen
        0.25     0.05   0.2    0.8      1       18          0.91   0         20            0.92   1
        0.35     0.05   0.2    0.8      1       18          0.96   0         20            0.95   0
        0.4      0.05   0.2    0.8      1       19          0.92   0         20            0.92   0
        0.3      0.04   0.2    0.8      1       20          0.93   1         22            0.93   2
        0.3      0.07   0.2    0.8      1       19          0.95   0         21            0.93   2
        0.3      0.05   0.15   0.8      1       19          0.94   0         21            0.93   2
        0.3      0.05   0.25   0.8      1       19          0.94   0         21            0.93   1
        0.3      0.05   0.2    0.7      1       19          0.94   0         21            0.93   1
        0.3      0.05   0.2    0.9      1       19          0.94   0         23            0.93   3
        0.3      0.05   0.2    0.8      0.5     22          0.94   2         23            0.93   3
        0.3      0.05   0.2    0.8      2       18          0.94   0         22            0.93   2

The rows differ only at 0.5 and 0.7 m/s. `accel` 0.5 held five more of fifty, the most of any row,
which the best of twelve rows at 25 walks reads by chance; it is not replicated. A human's
preferred walk is near 1.4 m/s.

### Double support and pre-swing

Above 0.4 m/s the swinging hip runs out of strength without a pre-swing: the Rogue walking forward
clipped its swing (`boundedLeastSquares`) on none of 481 ticks at 0.3 and 0.4 m/s, 78 at 0.5 and
141 at 0.7, the hip's flexion every time, asked 150-160 N m where it held 26-46 of its 105 at near
9 rad/s (the body's hip takes Thelen's curvature, `speed.ts`). The leg lifted still extending (the
hip turning back at 0.46 rad/s at toe-off at 0.3 m/s, 3.1 at 0.7), the swing then peaking at 4.7
and 5.8 rad/s. People flex the hip and knee before the toe leaves the ground: the knee is at about
35 degrees at toe-off (Simoneau, "Kinesiology of Walking", in Neumann, "Kinesiology of the
Musculoskeletal System", 2nd ed., 2010, ch. 15), with a fifth to a quarter of the cycle on both
feet. With the trailing foot rolled on its toes through a double support, its knee flexing toward
0.61 rad critically damped at 0.04 s and the ankle free, the hip lifts turning forward 0.54 rad/s
at 0.5 m/s and back 0.46 at 0.7, and the swing peaks at 3.5 and 4.2 rad/s.

At `608ef66b`: the 25 walks and 18 more forward, forward left and forward right at 0.4, 0.5, 0.6,
0.7, 0.8 and 1.0 m/s (`--speeds 0.4,0.5,0.6,0.7,0.8,1.0 --ways 0,45,315`); walks held and on pace,
of 25 and 18; "by speed" is held at 0.2, 0.3, 0.4, 0.5 and 0.7. A row is the gait with
`"transfer": 0.05, "preswing": {"knee": 0.6, "seconds": 0.04}`; the control is `transfer` unset with
the heel-off on, the last row `{}` (both read again). The middle rows rolled the trailing foot
whichever way the body went, on a controller never committed (at `608ef66b`, knee 0.6 and 0.04 s
reads 21/20 and 5,5,5,4,2 for the Rogue, 23/23 and 5,5,5,5,3 for the Warrior); the code rolls it
only while the body goes the toes' way, since walking back the Rogue fell at 0.5 m/s on its heel.

        transfer  knee  seconds    Rogue  by speed   forward    Warrior  by speed   forward
        none (the control)         20/20  5,5,5,5,0  7/7        23/23    5,5,5,5,3  12/12
        0.05      none             21/21  5,5,5,5,1  9/9        23/23    5,5,5,5,3  12/12
        0.1       none             19/17  5,5,5,3,1  10/4       22/22    5,5,5,5,2  11/11
        0.05      0.6   0.015      19/19  5,5,5,4,0  10/8       24/24    5,5,5,5,4  13/12
        0.05      0.6   0.04       24/23  5,5,5,5,4  16/13      25/25    5,5,5,5,5  17/16
        0.05      0.6   0.1        23/22  5,5,5,5,3  11/8       25/25    5,5,5,5,5  13/13
        0.05      0.8   0.04       22/21  5,5,5,5,2  16/13      24/24    5,5,5,5,4  18/17
        0.05      1.0   0.04       22/22  5,5,5,5,2  16/14      25/25    5,5,5,5,5  17/16
        0.07      0.6   0.06       25/24  5,5,5,5,5  16/12      25/25    5,5,5,5,5  16/14
        0.04      0.6   0.04       24/23  5,5,5,5,4  16/13      25/25    5,5,5,5,5  16/15
        0.05      0.61  0.04       22/21  5,5,5,5,2  16/13      23/23    5,5,5,5,3  17/16

A double support alone holds no more than two walks over the control; the knee's angle matters
little at 0.04 s, the time constant and the double support's length do. Stand, edge, step, the
0.3 m/s walks and the shoves at rest read the same; shoved walking at 0.3 m/s (`--batteries shove
--walked 0.3`) the Rogue holds 119 of 176 either way and the Warrior 173 against 174. Chosen: knee
0.61 rad (35 degrees, the toe-off bend), 0.04 s.

### Swing time and double support together

At `1444ce42`, with the pre-swing at 0.61 rad and 0.04 s and a swinging leg's height ceiling taken
at its landing (`stanceControl`'s `command`), on the batteries of the last table (a row
`{"gait": {"seconds": 0.25, "lift": 0.05, "width": 0.2, "longest": 0.8, "accel": 1, "transfer": 0.05,
"preswing": {"knee": 0.61, "seconds": 0.04}}}`; rows 0.25/0.08, 0.35/0.05 and the chosen read again,
and the chosen row reads the same at `e4ec0709`):

        seconds  transfer    Rogue  by speed   forward    Warrior  by speed   forward
        0.25     0.05        19/14  5,5,5,2,2  14/10      22/21    5,5,5,5,2  15/15
        0.25     0.08        20/16  5,5,5,3,2  14/9       22/20    5,5,5,5,2  16/14
        0.3      0.05        22/21  5,5,5,4,3  18/15      23/23    5,5,5,5,3  18/17
        0.3      0.08        24/22  5,5,5,5,4  18/11      25/24    5,5,5,5,5  18/15   chosen
        0.3      0.1         24/21  5,5,5,5,4  18/8       24/22    5,5,5,5,4  18/13
        0.35     0.05        23/23  5,5,5,4,4  16/14      24/24    5,5,5,5,4  18/18
        0.35     0.08        23/22  5,5,5,5,3  17/12      25/24    5,5,5,5,5  18/16
        0.4      0.05        22/22  5,5,5,5,2  16/15      24/24    5,5,5,5,4  18/18

Chosen for walks held, then on pace: at 0.3 s and 0.08 the Warrior walks 0.7 m/s every way and the
Rogue four of five, and none of the 36 forward walks falls, at the price of forward pace (the Rogue
0.82 of the asked against 0.90 at 0.05). Stand, edge, step and the shoves at rest read the same;
shoved walking, the Rogue holds 116 of 176 against 120 and the Warrior 174 either way. What slows
the fast walks: late in each swing the leg's braking asks a pitching moment the bearing sole cannot
give with the push planned (the Rogue at 0.8 m/s, 100 N m with 55 N forward), and the step under way
is shortened to catch up.

### Pace cap, crouch and horizon

The walk goes no faster than its legs can step its way with the hips lowered by `crouch` at most
(`fastestPace`, `paceToward`), lowers them no further than the steps need (`walkHeight`,
`StanceState.crouch`), and plans each step within `reserve` of the leg's reach (`reachableStep`).
On the whole-body solve, balance 0, the cap reads (forward, forward-right, sideways, back, m/s):

| `reserve` | Warrior | Rogue |
|---|---|---|
| 1 | 1.49, 0.91, 0.70, 1.31 | 1.24, 0.77, 0.60, 1.03 |
| 0.8 | 1.41, 0.91, 0.70, 0.94 | 1.22, 0.77, 0.60, 0.74 |

Every sideways walk at 0.7 m/s and above is the cap's and goes 0.75 to 0.95 of it. `crouch` 0.1 m
was not swept.

`horizon`, at `09c0a519` (`--batteries gait --speeds 0.7,1.0,1.2,1.4,1.6 --ways 0,45,90,180,270
--solve`, `reserve` 1, a row the whole `STANCE_GAIT`): walks held of 25, and the pace walked forward
at each ask (x fell).

        horizon  Rogue held  forward walked                Warrior held  forward walked
        0.05     21          0.72 1.02 1.13 1.11 1.11      23            0.71 1.03 1.17 x    x
        0.1      21          0.71 0.95 x    x    x         23            0.72 1.01 1.11 1.28 1.30   chosen
        0.15     23          0.70 0.90 0.95 x    x         25            0.71 0.97 1.03 1.13 1.14
        0.2      22          0.70 0.86 0.93 0.93 0.93      24            0.71 0.94 1.00 1.10 1.12

A shorter horizon paces nearer the ask and falls near the cap; a longer one holds more and paces
lower. Walking back falls in every row. Two walks apart on one seed a cell is not a difference, so
0.1 stays.

`reserve` is set on [the two-link reach](#reach-landing-lean-and-the-soles-path). On the straight
reach before it (the commit after `09c0a519`, each step at the pace its leg can take from the
measured capture point, `reachablePace`) a step planned at the whole reach landed short whenever the
body lagged its plan: at 0.9 and 1 the Rogue fell forward from 1.2 m/s asked, at 0.8 every walk held
and stopped, and the shoves to 90 N s read the same.

### Reach, landing lean and the sole's path

- **The swing leg's reach is its two links'** (`SwingLeg`, `reachAt`): the ankle's distance from
  the hip with the knee bent no less than the stance's bend, the ankle behind the sole's middle by
  the heel's shortfall (`FootState.back`), from the hip where the body carries it (`FootMemory.hip`,
  read each step). Planned under the centre, the Rogue holding the club in the guard (its centre
  0.08 m ahead of its hips) had every step back clamped to 0.85 of its reach and fell stopping;
  read, it stops in two steps.
- **A step lands leaning** as its line from the hip has it (`landingLean`, `SwingGoal.lean`): flat
  where the ankle's range less its spare reaches the lean, pitched by the rest where it does not
  (`landingTurnToRef`). Asked flat, a foot stepping back landed on its toes with the sole asked
  below the ground and bounced.
- **The swing path is the sole's lowest corner's** (`soleDrop`), from lift-off to landing. Asked on
  the sole's middle, a pitched foot had its toes asked below the path.
- **The pace cap reckons a steady step back on a straight leg** at the hip's range (`stepsWithin`,
  `reachableStep`'s `bends`); a landing, a catch's and a stop's, still bends the knee. Reckoned
  bent, each swing rode the ankle's stop with its toe 7 to 9 cm low and met the ground 0.1 s early.

Walks back asked 0.9 to 1.3 m/s back, back-left and back-right, empty and with the club, calm and
on gust seeds 5, 6 and 7, each walked then stopped, balance 0; held of 120 a human
(`--batteries stop --speeds 0.9,1.0,1.1,1.2,1.3 --ways 135,180,225 --gusts 1:5:5,6,7`):

        cap reckons a step back      Rogue held  Warrior held  walked back at 1.2 asked (Rogue, Warrior)
        knee bent                    113         118           0.90  0.96
        straight leg                 120         119           0.75  0.90   chosen
        straight leg, every step     119         120           0.78  0.86

Capped straight for every step, catch and stop too, a club stop from 1.0 m/s back could not brake
and fell. The stop battery holds 48 and 48 of 48 (from 47 and 47), the five-way gait battery to
1.8 m/s 25 and 25 (from 23 and 25), the shoves 126 and 176 of 176.

The commit after `76773653`, the six-speed five-way gait battery (0.7 to 1.8 m/s, 30 walks a human,
`--solve`, a row the whole `STANCE_GAIT` with `reserve`, `effort` and `transfer` set): walks held of
30 (every one held stopped), the pace forward at 1.2, 1.4, 1.6 and 1.8 asked, sideways at 1.0 and
back at 1.0.

        reserve  effort  transfer  Rogue held  forward              side  back    Warrior held  forward              side  back
        0.8      0.5     0.08      30          1.02 1.02 1.02 1.02  0.56  0.47    30            1.15 1.19 1.19 1.19  0.67  0.59
        0.9      0.5     0.08      30          1.06 1.04 1.04 1.04  0.59  0.63    30            1.17 1.19 1.22 1.22  0.69  0.80   chosen
        1        0.5     0.08      26          x    x    x    x     0.60  0.70    25            1.16 x    x    x     0.62  0.86
        0.8      0.7     0.08      27          1.11 x    x    x     0.56  0.47    30            1.19 1.31 1.26 1.26  0.67  0.59
        0.9      0.7     0.08      27          1.10 x    x    x     0.59  0.63    28            1.21 1.37 x    x     0.69  0.80
        1        0.7     0.08      27          1.09 x    x    x     0.51  0.81    24            1.20 1.39 1.46 x     0.62  x
        0.8      0.7     0.06      21          1.11 x    x    x     0.61  x       25            1.15 1.29 1.34 1.36  0.72  x

The two-link reach is shorter than the straight line, most of all back, and needs less reserve: 0.9
holds every walk and paces the Warrior 0.80 m/s back against 0.59 at 0.8. `effort` 0.7 caps higher
forward and falls there, as `reserve` 1 does. With the double support at 0.06 s every walk back
falls, the pace creeping past the cap a step at a time with the plan's pivot and the measured centre
of pressure at the heel's edge; through a double support the measured pivot is 0.08 to 0.16 m from
the plan's, which models no reaction there. The shoves to 90 N s are unchanged (160 and 237).

## Heel-off

`StanceTuning.heelOff`: a walk's bearing foot rolls onto its front edge only while the other swings,
and only once its ankle's floor is over the knees' ceiling. Which point must be past the edge before
it rolls decides what it costs. At `f36962f7`, without a double support or pre-swing, on the 25
walks and the 18 forward walks of the pre-swing's table, held and on pace; and the lab run's mean
speed round the circle over 15 s, asked 0.5 m/s (`src/lab/locomotion-mode.ts`, read by hand).
`{"heelOff": false}` is the control and `{}` the centre of mass (both read again); the capture
point's row was read on a controller never committed.

        heel-off            Rogue  by speed    forward  circle    Warrior  by speed    forward  circle
        none (the control)  19/19  5,5,5,4,0   5/5      0.500     23/23    5,5,5,5,3   10/10    0.448
        on capture point    20/20  5,5,5,5,0   7/6      0.330     24/22    5,5,5,5,4   14/9     0.323
        on centre of mass   20/20  5,5,5,5,0   7/7      0.451     23/23    5,5,5,5,3   12/12    0.448

Keyed on the capture point, the foot rolls on every step of the lab's run with the centre still
behind the edge, and the walk brakes; keyed on the centre of mass it rolls in the fast walks that
need it and seldom in the run. With it the Rogue walks 0.5 m/s every way; stand, edge, step, the
0.3 m/s walks and the shoves at rest read the same (to 60 N s: Rogue 118 of 176, Warrior 174).
Chosen: on, keyed on the centre of mass.

A foot kept rolled once the body has stopped over it bears only on its edge: a weight shift with
no double support (a step of the walk's own taking up a still body, `place`) takes the body over
the sole's middle and waits for the capture point to be over the edge, and never lifts. The
Rogue, its run braked to 0.14 m/s and handed to the walk 0.6 m short of a place, stood in that
shift for good with its left foot on its toes. The foot rolls back as that shift goes onto it
(`rollFeet`, `src/core/control/stance.ts`); it moves no fingerprint case, and the Rogue's shoved
braced walk empty-handed falls in the same 8 of seeds 1 to 200 either way (Node stand,
rapier-coordinate, 120 Hz, at `aaf7f462`).

## Track

`STANCE_TRACK`, at `abfe6153` (`{"track": 0.1}` is the first row, read again).

                     Rogue                                  Warrior
                     places  steps  walks  shoves           places  steps  walks  shoves
        0.1          0       0      22     120  42.2  35    0       0      23     201  65.9  55
        0.15         0       0      21     123  43.1  35    0       0      23     219  72.5  55
        0.2          0       0      19     128  44.7  35    0       0      21     217  66.9  45   chosen
        0.3          0       0      19     131  45.9  35    0       0      21     220  72.8  55

Every setting stands still and lands its steps within 2.4 mm; a stiffer track holds two more walks
at 0.7 m/s, and at 0.1 fewer shoves. Chosen: 0.2; 0.15 to 0.3 read alike.

## Sole margin

`SOLE_MARGIN`. Asked for a place 30 cm to the side, held at the edge of the soles, each human with
no margin slid its feet 19 cm (Rogue) and 23 cm (Warrior); with 0.05 or more, within 0.6 mm. At
`abfe6153` (`{"soleMargin": 0}` is the first row, read again):

                     Rogue                                  Warrior
                     places  steps  walks  shoves           places  steps  walks  shoves
        0            2       0      18     132  45.9  35    2       0      20     215  70.6  55
        0.05         0       0      18     130  45.6  35    0       0      21     215  70.0  55
        0.1          0       0      19     128  44.7  35    0       0      21     217  66.9  45   chosen
        0.2          0       0      20     127  44.4  35    0       0      22     212  68.8  55

Chosen: 0.1; 0.05 to 0.2 read alike.

## Support inset

`SUPPORT_INSET`, at `abfe6153` (`{"supportInset": 0.3}` is the first row; the row at 0.6 read
again).

                     Rogue                                  Warrior
                     places  steps  walks  shoves           places  steps  walks  shoves
        0.3          2       0      20     127  44.7  35    2       0      21     221  73.4  55
        0.4          0       0      20     130  45.3  35    0       0      22     220  72.5  55
        0.5          0       0      19     128  44.7  35    0       0      21     217  66.9  45   chosen
        0.6          1       0      19     133  46.3  35    2       8      21     177  58.8  40

At 0.3 a place to the side is held off its height; at 0.6 the held region is narrower than the
stance the steps land in (the Rogue slid a foot 22 cm, the unpushed Warrior 33 cm). Chosen: 0.5;
0.4 reads alike. The table was read with the inset drawing in the outline of the placed soles
(`withinSupport`), as it still does for a reader of bare soles; for the stance it draws each sole's
edges toward its ankle, bounded further by what the ankle holds ([Ankle hold](#ankle-hold)).

## Ankle hold

`ankleStrength` (`src/core/control/support.ts`): an ankle's hold toward the toes and the heel is
its muscles' isometric peak that way, and to a side the invertors' and evertors' peak times their
lengthening ceiling (`eccentricCeiling`, 1.4, Thelen 2003). A load that pushes a sole onto its edge
lengthens the muscles holding it, and they resist up to that; a sole held past its peak along it
tips onto its toes or heel, which the stance plans on (`bearingEnd`). A bearing sole loads its
ankle no more than the hold (`BearingSole.hold`, `shareGroundWrench`). The regions the stance plans
in (`FootState.hold`, `heldBy`) reach from under the ankle as far as the hold carries at the foot's
load, within the sole drawn in by `SUPPORT_INSET`. The Rogue's hold reads 261 N m toward the toes,
26.9 toward the heel and 29.9 to a side; the Warrior's 418, 43.0 and 47.9. At the whole weight both
reach the drawn sole to a side, 3.5 cm, where 0.8 of the isometric peak held the Rogue 3 cm.

Shoved under orders (`--batteries orders --orders 0.5:1-200 --shoves 20`: the braced walk with the
club, a shove of 20 N s at a third of its orders; Node stand, rapier-coordinate, 120 Hz, at
`62c7a814`), falls of 200, the hold as a share of the isometric peak, along the sole and across it:

| Hold, along / across | Rogue, seeds 1 to 200 | Rogue, 201 to 400 | Warrior, 1 to 200 | Warrior, 201 to 400 |
|---|---:|---:|---:|---:|
| 0.6 / 0.6 | 28 | | | |
| 0.8 / 0.8 (a set share, before) | 19 | 10 | 0 | 1 |
| 1.0 / 1.0 | 11 | | | |
| 1.2 / 1.2 | 8 | | | |
| 1.4 / 1.4 | 6 | 5 | 1 | 1 |
| 1.5 / 1.5 | 5 | | | |
| 2.0 / 2.0 | 7 | | | |
| 0.8 / 1.2 | 7 | | | |
| 0.8 / 1.4 | 5 | | | |
| 1.0 / 1.4 (kept) | 5 | 2 | 1 | 2 |

The stance envelope's walks (`research/core-stance-envelope.mjs --walks`; every body and thing held,
forward and back, m/s; a speed falls a step where one of its 4 trials does not hold, so a step either
way is within its noise):

| Hold, along / across | Warrior, forward / back | Rogue | skeleton |
|---|---|---|---|
| 0.8 / 0.8 | 1.7 / 1.2 to 1.5 | 1.4 to 1.5 / 1 | 1.5 / 1.2 |
| 1.4 / 1.4 | 1.5 to 1.7 / 1.2 to 1.4 | 1 to 1.5 / 1.2 | 1.5 to 1.7 / 1 to 1.2 |
| 1.2 / 1.4 | 1.5 to 1.7 / 1.2 | 1.2 to 1.5 / 1 | 1.5 / 1.2 |
| 1.0 / 1.4 (kept) | 1.7 / 1.2 to 1.4 | 1.5 / 1 to 1.2 | 1.5 to 1.7 / 1 |

The Rogue with the club walks forward 1 m/s at 1.4 along the sole, 1.4 at 0.8 and 1.5 at 1.

Unshoved, seeds 1 to 300, at 1.4 / 1.4: the Rogue 0 against 0, the Warrior 0 against 2.

What found it: the Rogue fell 19 where the Warrior, shoved to the same change of speed (27.4 N s:
the Rogue is 57.6 kg, the Warrior 79), fell 4. With every torque 1.3 times its own (a physique's
`strength`) the Rogue fell 9, with its mass 1.3 times 19, and with only one group's torque raised
1.3 times: the hips 24, the knees 22, the ankle's flexion 19, its inversion and eversion 14. The
stance counted on less of the side than the ankle gives.

Tried against the same falls and not kept (Rogue, seeds 1 to 200, 19 before): a walk's step moved
out to its own side counted as out of the leg's reach, 19; a catch on both feet never lifting the
only foot the ground presses, 93 (pushed toward one foot, the other goes light and must still
bear the step out); no crossover catch, 20 (a crossover lands half its catches on a fall, but at
the speed it is taken no other catch holds either); a catch's swing planned at 0.8 or 1 of the
hip's torque, 21 and 18; the heading turned at the rate for the body's measured speed, 20; a
swing's turn carried from where its foot leaves the ground, 21.

## Wrench lever

`leverOf` in `stanceControl`: the lever a missed moment of the ground's wrench is weighed against a
missed force at (`shareGroundWrench`). Fixed levers against the root's height, on the shoves to
60 N s (176; held, mean, least), without the knee's return from past straight (`fixedSolve`). The
first three rows have `STANCE_TRACK` 0.1 and recovery steps of margin 0.01, 0.2 s, lift 0.03, reach
0.15; the last two track 0.2 and `STANCE_RECOVERY`.

        lever              Rogue              Warrior
        0.3 m              109  39.1  30      156  53.8  45
        the root's height  91   33.1  30      165  56.6  50
        3 m                78   29.4  25      148  49.7  40
        0.5 m, track 0.2   101  36.3  30      157  54.1  40
        the root's, 0.2    102  36.6  30      165  56.3  50

No fixed lever is better for both humans. Chosen: the root's height, the one the wrench's geometry
gives. The lever is not a setting: each row had `leverOf` written for it, on controllers before
`abfe6153` that were never committed, so the table reads again from no commit.

## Bounded swing

The bearing solve's free limb (`boundFree`): its torques solved within its strength together
(`boundedLeastSquares`), against each freedom clipped alone, read as the stance's swinging leg on
the bearing solve (`StanceTuning.boundedSwing`). The lab routine from seeded starts
(`research/core-routine-battery.mjs`: 3 N s at 0.5 s, up to 5 loops; Node core stand, Rapier),
without the planning of freedoms held at a torque: loops completed, runs through all five, falls
walking.

                           Rogue              Warrior
        120 Hz, 24 runs    69/120  8   3      100/120  18  0    bounded
                           43/120  2  11      33/120    2  18   clipped alone
        480 Hz, 12 runs    23/60   2   0      54/60     9   0    bounded
                           23/60   2   4      36/60     5   0    clipped alone

Clipped alone, the Warrior dragged its foot a whole step 1 cm up, landed 18 cm short, and the walk
ran away. On the stance's batteries the bound costs shoves: the Rogue 117 (41.6, 35) against 128
(44.7, 35), the Warrior 202 (67.8, 55) against 217 (66.9, 45); walks 19 and 22 against 19 and 21;
places, steps and stands alike. The tables of `STANCE_SECONDS`, `STANCE_KNEE_BEND`,
`STANCE_ANKLE_SPARE`, `STANCE_RECOVERY`, `STANCE_TRACK`, `SOLE_MARGIN` and `SUPPORT_INSET` were read
clipped alone. Chosen: bounded.

    node research/core-routine-battery.mjs --variants '[{}, {"boundedSwing": false}]' --seeds 24
    (and --seeds 12 --hz 480; other flags --loops, --impulse, --models, --workers, --list)

The table was read on a controller never committed. At `3d657452`, which plans the held freedoms,
120 Hz reads bounded: the Rogue 84 of 120 loops with 12 runs through, the Warrior 109 with 20;
clipped alone, 70 with 8 and 53 with 3 (480 Hz, by that commit's message, 56 and 60 of 60 bounded,
not read again). The batteries are the sweep at `3d657452` with `--batteries gait,shove --top 90
--variants '[{}, {"boundedSwing": false}]'`, read again.
