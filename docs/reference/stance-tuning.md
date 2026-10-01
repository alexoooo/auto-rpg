# Stance tuning

The measurements behind the stance controller's tuned constants and settings in
`src/core/control/stance-tuning.ts` (`STANCE_SECONDS`, `STANCE_KNEE_BEND`, `STANCE_ANKLE_SPARE`,
`STANCE_RECOVERY`, `STANCE_GAIT`, `STANCE_TRACK`, `SOLE_MARGIN`, `SUPPORT_INSET`, the bounded
swing `StanceTuning.boundedSwing` and the heel-off `StanceTuning.heelOff`), and behind the ground
wrench's lever (`leverOf`, in `stanceControl`, `src/core/control/stance.ts`). Each constant's doc
comment links to its section here. Every table was measured on the Node core stand
(`tests/harness/core-stand.mjs`), Rapier, 120 Hz, each human standing 3 cm under its reference
height, with `research/core-stance-sweep.mjs` unless a section says otherwise. Each table was read
on the controller as it stood when its constant was chosen, so counts in different tables are not
comparable row for row.

**The batteries.** Most sections move one setting at a time, the rest at their values, against
four batteries (`research/core-stance-trials.mjs`):

- **places**: a place 30 cm out each of 4 ways; the count that failed their bars (fell, over 15 mm
  off the held place, 5 mm off height, or 10 mm of slide);
- **steps**: each foot 15 and 25 cm forward, 15 cm back and 10 cm out (8 steps); the count that
  failed the tests' bars;
- **walks**: 0.2, 0.3, 0.4, 0.5 and 0.7 m/s five ways (forward, right, back, left, forward right)
  for 8 s, then a stop (25 walks); the count held (not fallen: the centre 25 cm under the goal's
  height);
- **shoves**: 10 to 90 N s in steps of 5, sixteen ways 22.5 degrees apart, at the middle trunk's
  centre of mass, watched 4.5 s (272 shoves); the count held, then the impulse held each way (the
  largest below the first that fell) as its mean over the ways and its least, N s.

**The command.** A battery table is the sweep's print, a row a variant:

    node research/core-stance-sweep.mjs --batteries stand,edge,step,gait,shove --top 90 --variants '<list>'

`--variants` is a JSON list of settings (`StanceTuning`, `src/core/control/stance-tuning.ts`), `{}`
being the constants. The sweep's `edge` battery is the places, `step` the steps, `gait` the walks
and `shove` the shoves: to 90 N s with `--top 90`, and to 60 N s (176 shoves) without it. Its other
flags are `--hz` (120), `--models` (both humans), `--workers`, `--speeds` and `--ways` for the
walks, and `--walked` for shoves that come after a walk. The lines typed were not recorded. Each
section gives the commit whose controller its table was read on and the settings its rows name,
from which the list is written; where a row was read on a controller that was never committed, the
section says so. A reading a section gives in its prose, outside its table, was taken by hand on
the same stand, with a script that was not kept.

Checked out at its commit, a table reads again: the rows named as read again below were, to the
digit. On another commit the same command reads other counts. At `e4ec0709` the constants
(`--variants '[{}]'`) read, for the Rogue and the Warrior: places 0 and 0 failed; steps 0 and 0;
walks 24 and 25 held of 25; shoves 118 of 272 (41.9 N s the mean, 35 the least) and 216 (72.2,
55).

## Stance height

`STANCE_LOWER` (`src/core/skills/locomotion.ts`) is 0.03 m: how far under its reference height
the skills hold a body's centre of mass. It is the height every table of this record was
measured at, and was not itself swept, so a change to it voids them. A crouch is beyond the
stance: asked 8 cm or more lower, a human settles only about 1 cm lower, and falls walking or
stopping from there (the lab's Stance).

## Fallen

The batteries above count a fall at 0.25 m: a body has fallen once its centre of mass is that far
under the height its stance is asked (`research/core-stance-trials.mjs`). It is set, not swept.
The game's bar is the same quarter metre, read from the body at every step: `rising.md#down`.

## Friction

Every table of this record was measured with every contact at one friction coefficient, 0.5
(`CONTACT_FRICTION`, `src/core/engine/engine.ts`), which is Rapier's default
(`rapier-default-friction` in `SOURCES`). The stance's limits on what a sole gives are read from
it, so another friction voids the tables.

## Time constants

`STANCE_SECONDS`: each time constant moved alone against the batteries.

                     Rogue                                  Warrior
                     places  steps  walks  shoves           places  steps  walks  shoves
        across 0.2   0       0      21     126  42.8  15    1       4      22     215  69.1  55
        across 0.3   0       0      19     128  44.7  35    0       0      21     217  66.9  45   chosen
        across 0.4   0       0      18     130  45.3  35    0       0      22     214  68.8  55
        height 0.1   0       0      19     128  44.4  35    0       0      20     223  74.1  55
        height 0.2   0       0      19     126  44.4  35    0       0      21     212  67.5  55
        swing 0.05   0       0      22     133  42.2  15    0       0      21     206  67.5  50
        swing 0.2    0       0      19     112  38.4  15    0       0      21     193  62.2  50

Pulled across at 0.2 s, the Warrior slid a foot 30 cm holding a place and failed four steps, and
the Rogue fell to a shove of 20 N s from one way; at 0.4 each centre still drifts 0.2-0.3 mm in
the last 2 s of a stand, where at 0.3 it is still. A height of 0.1 or 0.2 reads as 0.15. A swing
of 0.2 lands 3 mm off and holds fewer shoves; 0.2 or 0.05 lets the Rogue fall to 20 N s from one
way. The chosen row's Warrior falls to 50 N s from behind, and holds 55 and more. The pelvis's
turn (0.15) was not swept.

Chosen: across 0.3, height 0.15, turn 0.15, swing 0.1.

Command: the sweep at `abfe6153`, a variant a row, each with the four constants written out:
`{"seconds": {"across": 0.2, "height": 0.15, "turn": 0.15, "swing": 0.1}}` is the first. The first
row and the chosen one were read again.

## Knee bend

`STANCE_KNEE_BEND`. Asked to stand higher than its legs reach, a stance held to the height asked
presses its knees on their stops and wanders: over the last 2 s of a 5 s stand, the Rogue asked
10 cm over its reference height drifted 9.5 mm and the Warrior asked 5 cm over 52 mm (10 cm over,
it fell); held for the bend, each drifted 0.03 mm. At 3 cm low, against the batteries:

                     Rogue                                  Warrior
                     places  steps  walks  shoves           places  steps  walks  shoves
        none         0       0      20     119  42.2  35    0       0      23     213  68.4  55
        0.1          0       0      19     128  45.0  35    0       0      21     217  70.9  55
        0.2          0       0      19     128  44.7  35    0       0      21     217  66.9  45   chosen
        0.3          0       0      21     130  45.3  35    0       0      21     217  70.9  55
        0.4          0       1      21     127  44.4  35    2       0      22     215  70.6  55

Chosen: 0.2, the least bend under which no step failed; 0.1 to 0.3 read alike.

Command: the sweep at `abfe6153`; `{"kneeBend": null}` is none, then `{"kneeBend": 0.1}` and so
on. The row for none was read again.

## Ankle spare

`STANCE_ANKLE_SPARE`. Standing 3 cm under the reference height, the Rogue's ankles are already at
0.26 rad of their 0.35 (`humanSpec`). Moved alone against the batteries:

                     Rogue                                  Warrior
                     places  steps  walks  shoves           places  steps  walks  shoves
        none         0       0      20     111  39.7  30    0       0      21     183  60.6  50
        0            0       0      18     127  44.4  35    0       0      21     213  70.6  55
        0.01         0       0      19     128  44.7  35    0       0      21     217  66.9  45   chosen
        0.03         0       2      19     126  44.4  35    0       2      20     214  70.3  55
        0.05         0       6      19     126  44.1  35    0       6      21     214  67.8  55

A larger spare holds a stepping stance too high for its knees, and the long steps fail first.

Chosen: 0.01.

Command: the sweep at `abfe6153`; `{"ankleSpare": null}` is none, then `{"ankleSpare": 0}` and so
on. The row for none was read again.

## Recovery step

`STANCE_RECOVERY`, against the shove battery (272 shoves); "no step" is `recovery: null`.

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

The margin is not for the shoves: at none, a place asked past the soles, held at the edge of what
they hold, sets steps off as the capture point wanders a millimetre over it; each human's feet
walked 30 cm or more, and the Warrior, standing unpushed, slid a foot 25 cm and failed every step.
At 0.01 and 0.02 it stands. A swing of 0.2 s holds a fifth fewer shoves; 0.3 holds most. The rows
within a few shoves of the chosen one differ by where single shoves first fall: the chosen Warrior
falls to 50 N s from behind (ten steps, its feet drawn within 5 cm of each other across) and holds
55 and more. Many held shoves take several steps: a long step leaves a wide stance whose soles hold
a thin band.

Straight to the side, with only the far foot stepping, a step holds little more than standing (the
Warrior 55 N s): the far foot steps in beside the near one again and again. With the near foot
stepping out once the far one is in (`recoveryStep`), the Warrior holds 65 N s to either side and
the Rogue 40 to its left, 35 to its right, and no way of the sixteen holds less (on a later
battery than the table's: Rogue 118 of 272 against 117, Warrior 213 against 209).

Chosen: margin 0.01 (the lesser of the two that stand), reach 0.2, seconds 0.3, lift 0.05.

Command: the sweep at `abfe6153` with `--batteries shove --top 90`; `{"recovery": null}` is no
step, and a row is `{"recovery": {"margin": 0, "reach": 0.2, "seconds": 0.3, "lift": 0.05}}`. The
row for no step was read again. The later battery of the paragraph above, and its commit, were not
recorded.

## Gait

`STANCE_GAIT`, against the walk battery (25 walks a human). Held is the walks that did not fall;
every walk held went, over its last 3 s, 0.8 to 1.25 of the speed asked along and under a quarter
of it across, and stopped. The ratio is the mean speed along over the speed asked, of those held;
"at 0.7" is the walks held at 0.7 m/s. Measured without a double support or pre-swing
(`transfer` and `preswing` unset), the heel-off off.

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

At the chosen settings every walk up to 0.4 m/s holds, and all but one of the Rogue's at 0.5; at
0.7 almost none. The rows differ at 0.5 and 0.7 m/s alone. A slower start (`accel` 0.5) held five
more of the fifty, the most of any row; at 25 walks a human, the best of twelve rows is expected to
read that high by chance, and it waits for a replication on other speeds and heights. A human's
preferred walk is near 1.4 m/s.

Command: the sweep at `abfe6153` with `--batteries gait`, a row a whole gait:
`{"gait": {"seconds": 0.25, "lift": 0.05, "width": 0.2, "longest": 0.8, "accel": 1}}` is the
second. The first two rows and the row at `accel` 0.5 were read again. That commit's controller
has no double support, pre-swing or heel-off.

### Double support and pre-swing

Above 0.4 m/s the swinging hip runs out of strength without a pre-swing. The Rogue walking
forward, 2-6 s in, asked its swing for more torque than the muscles hold (`boundedLeastSquares`
clipping) on none of 481 ticks at 0.3 and 0.4 m/s, 78 at 0.5 and 141 at 0.7, the hip's flexion
every time: asked 150-160 N m where it held 26-46 of its 105, its speed near the 9 rad/s where
Anderson 2007's curve gives none. The leg lifted still extending: the hip turning back at
0.46 rad/s as the foot left the ground at 0.3 m/s, 1.8 at 0.5 and 3.1 at 0.7 (7.3 the worst), the
swing then peaking at 4.7 and 5.8 rad/s (9.2); the knee 0.2 rad bent. People flex the hip and knee
before the toe leaves the ground: the knee is at about 35 degrees at toe-off (Simoneau,
"Kinesiology of Walking", in Neumann, "Kinesiology of the Musculoskeletal System", 2nd ed., 2010,
ch. 15), and a fifth to a quarter of the cycle is on both feet. With the trailing foot rolled on
its toes through a double support, its knee flexing toward 0.61 rad critically damped at 0.04 s
and the ankle free, the hip lifts turning forward 0.54 rad/s at 0.5 m/s and back 0.46 at 0.7 (1.2
the worst), and the swing peaks at 3.5 and 4.2 rad/s (6.4).

Against the walk battery and, besides, forward, forward left and forward right at 0.4, 0.5, 0.6,
0.7, 0.8 and 1.0 m/s (18 walks): walks held and on pace, of 25 and of 18; "by speed" is the
battery's walks held at 0.2, 0.3, 0.4, 0.5 and 0.7 m/s. The first row is `transfer` unset, the
heel-off on. All rows but the last rolled the trailing foot whichever way the body went; walking
back, the Rogue fell at 0.5 m/s on its heel. The code rolls it only while the body goes the toes'
way.

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

A double support alone holds no more than two walks over the control. The knee's angle matters
little at 0.04 s; the time constant and the double support's length do. Stand, edge, step, the
0.3 m/s walks and the shoves at rest read the same; shoved walking at 0.3 m/s, the Rogue holds 119
of 176 either way and the Warrior 173 against 174.

Chosen: knee 0.61 rad (35 degrees, the toe-off bend above), 0.04 s.

Command: the sweep at `608ef66b`, with `--batteries gait` for the 25 walks and
`--batteries gait --speeds 0.4,0.5,0.6,0.7,0.8,1.0 --ways 0,45,315` for the 18; a row is
`{"gait": {"seconds": 0.3, "lift": 0.05, "width": 0.2, "longest": 0.8, "accel": 1, "transfer":
0.05, "preswing": {"knee": 0.6, "seconds": 0.04}}}`, the control the same without `transfer` and
`preswing`, and the last row `{}`. The control and the last row were read again. The rows between
were read on a controller that rolled the trailing foot whichever way the body went, which was
never committed: at `608ef66b` the row at knee 0.6 and 0.04 s reads 21/20 and 5,5,5,4,2 for the
Rogue and 23/23 and 5,5,5,5,3 for the Warrior, its forward walks as the table has them. The
shoves after a walk are `--batteries shove --walked 0.3`.

### Swing time and double support together

With the pre-swing at 0.61 rad and 0.04 s and a swinging leg's height ceiling taken at its landing
(the height rule in `stanceControl`'s `command`), the swing time and the double support swept
together, on the batteries of the last table:

        seconds  transfer    Rogue  by speed   forward    Warrior  by speed   forward
        0.25     0.05        19/14  5,5,5,2,2  14/10      22/21    5,5,5,5,2  15/15
        0.25     0.08        20/16  5,5,5,3,2  14/9       22/20    5,5,5,5,2  16/14
        0.3      0.05        22/21  5,5,5,4,3  18/15      23/23    5,5,5,5,3  18/17
        0.3      0.08        24/22  5,5,5,5,4  18/11      25/24    5,5,5,5,5  18/15   chosen
        0.3      0.1         24/21  5,5,5,5,4  18/8       24/22    5,5,5,5,4  18/13
        0.35     0.05        23/23  5,5,5,4,4  16/14      24/24    5,5,5,5,4  18/18
        0.35     0.08        23/22  5,5,5,5,3  17/12      25/24    5,5,5,5,5  18/16
        0.4      0.05        22/22  5,5,5,5,2  16/15      24/24    5,5,5,5,4  18/18

Chosen for the walks held, then those on pace: at 0.3 s and 0.08 the Warrior walks 0.7 m/s every
way and the Rogue four of five, and none of the 36 forward walks falls; the price is the forward
pace (the Rogue 0.82 of the pace asked on average, against 0.90 at 0.05). Stand, edge, step and the
shoves at rest read the same; shoved walking at 0.3 m/s the Rogue holds 116 of 176 against 120 and
the Warrior 174 either way.

What still slows the fast walks: late in each swing the leg's braking asks the ground for a
pitching moment the bearing sole cannot give with the push the plan asks (the Rogue at 0.8 m/s,
100 N m with 55 N forward); the push is what is missed, the body falls behind its plan, and the
step under way is shortened to catch it.

Command: the sweep at `1444ce42`, with the two gait commands of the table above; a row is
`{"gait": {"seconds": 0.25, "lift": 0.05, "width": 0.2, "longest": 0.8, "accel": 1, "transfer":
0.05, "preswing": {"knee": 0.61, "seconds": 0.04}}}`. The rows at 0.25 s and 0.08, at 0.35 s and
0.05 and the chosen one were read again, and the shoves after a walk
(`--batteries shove --walked 0.3`). The chosen row and those shoves read the same at `e4ec0709`.

## Heel-off

`StanceTuning.heelOff`: a walk's bearing foot rolls onto its front edge only while the other
swings, and only once its ankle's floor is over the knees' ceiling. Which point must be past the
edge before it rolls decides what it costs. Against the walk battery and the 18 forward walks of
the pre-swing's table: held, and on pace, of 25 and 18; and the lab run's mean speed round the
circle over 15 s, asked 0.5 m/s. Measured without a double support or pre-swing.

        heel-off            Rogue  by speed    forward  circle    Warrior  by speed    forward  circle
        none (the control)  19/19  5,5,5,4,0   5/5      0.500     23/23    5,5,5,5,3   10/10    0.448
        on capture point    20/20  5,5,5,5,0   7/6      0.330     24/22    5,5,5,5,4   14/9     0.323
        on centre of mass   20/20  5,5,5,5,0   7/7      0.451     23/23    5,5,5,5,3   12/12    0.448

Keyed on the capture point, the foot rolls on every step of the lab's run, in the guard, with the
centre still behind the edge its pressure sat on, and the walk brakes. Keyed on the centre of mass
it rolls in the fast walks that need it and seldom in the run (the Rogue once in 15 s). With it the
Rogue walks 0.5 m/s every way. Stand, edge, step and the 0.3 m/s walks read the same with it and
without, and so do the shoves at rest (to 60 N s: Rogue 118 of 176, Warrior 174).

Chosen: on, keyed on the centre of mass.

Command: the sweep at `f36962f7`, with the two gait commands of the pre-swing's table;
`{"heelOff": false}` is the control and `{}` the heel-off keyed on the centre of mass. Both rows
were read again. The row keyed on the capture point was read on a controller that was never
committed. The circle's column was read by hand on the lab's run (`src/lab/run-mode.ts`), with a
script that was not kept.

## Track

`STANCE_TRACK`, against the batteries.

                     Rogue                                  Warrior
                     places  steps  walks  shoves           places  steps  walks  shoves
        0.1          0       0      22     120  42.2  35    0       0      23     201  65.9  55
        0.15         0       0      21     123  43.1  35    0       0      23     219  72.5  55
        0.2          0       0      19     128  44.7  35    0       0      21     217  66.9  45   chosen
        0.3          0       0      19     131  45.9  35    0       0      21     220  72.8  55

Every setting stands still (off, drift and speed read 0.0 mm and mm/s) and lands its steps within
2.4 mm. A stiffer track holds two more walks at 0.7 m/s, and at 0.1 fewer shoves.

Chosen: 0.2; 0.15 to 0.3 read alike.

Command: the sweep at `abfe6153`; `{"track": 0.1}` is the first row, which was read again.

## Sole margin

`SOLE_MARGIN`. Asked for a place 30 cm to the side, held at the edge of what the soles hold, each
human with no margin slid its feet 19 cm (Rogue) and 23 cm (Warrior); with 0.05 or more they held
within 0.6 mm. Against the batteries:

                     Rogue                                  Warrior
                     places  steps  walks  shoves           places  steps  walks  shoves
        0            2       0      18     132  45.9  35    2       0      20     215  70.6  55
        0.05         0       0      18     130  45.6  35    0       0      21     215  70.0  55
        0.1          0       0      19     128  44.7  35    0       0      21     217  66.9  45   chosen
        0.2          0       0      20     127  44.4  35    0       0      22     212  68.8  55

Chosen: 0.1; 0.05 to 0.2 read alike.

Command: the sweep at `abfe6153`; `{"soleMargin": 0}` is the first row, which was read again.

## Support inset

`SUPPORT_INSET`, moved alone against the batteries.

                     Rogue                                  Warrior
                     places  steps  walks  shoves           places  steps  walks  shoves
        0.3          2       0      20     127  44.7  35    2       0      21     221  73.4  55
        0.4          0       0      20     130  45.3  35    0       0      22     220  72.5  55
        0.5          0       0      19     128  44.7  35    0       0      21     217  66.9  45   chosen
        0.6          1       0      19     133  46.3  35    2       8      21     177  58.8  40

At 0.3 a place to the side is held off its height; at 0.6 the held region is narrower than the
stance the steps land in: the Rogue slid a foot 22 cm holding a place, and the Warrior, standing
unpushed, 33 cm.

Chosen: 0.5; 0.4 reads alike.

Command: the sweep at `abfe6153`; `{"supportInset": 0.3}` is the first row. The row at 0.6 was
read again.

## Wrench lever

`leverOf` in `stanceControl`: the lever a missed moment of the ground's wrench is weighed against a
missed force at (`shareGroundWrench`). Fixed levers against the root's height, on the shoves to
60 N s (176): the shoves held, and the impulse held each way, mean and least, N s. Measured without
the knee's return from past straight (`fixedSolve`); the first three rows with `STANCE_TRACK` 0.1
and recovery steps of margin 0.01, 0.2 s, lift 0.03 and reach 0.15, the last two with track 0.2
and the recovery steps of `STANCE_RECOVERY`.

        lever              Rogue              Warrior
        0.3 m              109  39.1  30      156  53.8  45
        the root's height  91   33.1  30      165  56.6  50
        3 m                78   29.4  25      148  49.7  40
        0.5 m, track 0.2   101  36.3  30      157  54.1  40
        the root's, 0.2    102  36.6  30      165  56.3  50

No fixed lever is better for both humans. Chosen: the root's height, the one the wrench's geometry
gives.

Command: the sweep with `--batteries shove`, to its 60 N s. The lever is not a setting: each row
was read with `leverOf` written for it, on the controller as it stood in the work that became
`abfe6153`, before the knee's return, and none of those controllers was committed. The first three
rows' settings are `{"track": 0.1, "recovery": {"margin": 0.01, "seconds": 0.2, "lift": 0.03,
"reach": 0.15}}`. The table does not read again from any commit.

## Bounded swing

`StanceTuning.boundedSwing`: a swinging leg's torques solved within its strength together
(`boundedLeastSquares`), against each freedom clipped alone. The lab routine from seeded starts
(`research/core-routine-battery.mjs`: 3 N s at 0.5 s, up to 5 loops; Node core stand, Rapier),
without the planning of freedoms held at a torque: loops completed of those possible, runs through
all five, and falls while walking.

                           Rogue              Warrior
        120 Hz, 24 runs    69/120  8   3      100/120  18  0    bounded
                           43/120  2  11      33/120    2  18   clipped alone
        480 Hz, 12 runs    23/60   2   0      54/60     9   0    bounded
                           23/60   2   4      36/60     5   0    clipped alone

Clipped alone, the Warrior walking in the lab's routine dragged its foot a whole step 1 cm up,
landed 18 cm short, and the walk ran away. On the stance's batteries the bound costs shoves: 117
held, 41.6 N s (35 the least) against 128, 44.7 (35) for the Rogue, and 202, 67.8 (55) against
217, 66.9 (45) for the Warrior; walks 19 and 22 of 25 against 19 and 21; places, steps and stands
read alike. The tables of `STANCE_SECONDS`, `STANCE_KNEE_BEND`, `STANCE_ANKLE_SPARE`,
`STANCE_RECOVERY`, `STANCE_TRACK`, `SOLE_MARGIN` and `SUPPORT_INSET` were read clipped alone.

Chosen: bounded.

Command: `node research/core-routine-battery.mjs --variants '[{}, {"boundedSwing": false}]'
--seeds 24`, and with `--seeds 12 --hz 480`; its other flags are `--loops` (5), `--impulse` (3),
`--models`, `--workers` and `--list`. The table was read before a freedom held at a torque was
planned, on a controller that was never committed, so no row of it reads again. At `3d657452`,
which plans them, the command reads at 120 Hz: bounded, the Rogue 84 of 120 loops with 12 runs
through and the Warrior 109 with 20; clipped alone, 70 with 8 and 53 with 3. At 480 Hz that
commit's message gives 56 and 60 of 60 bounded, which was not read again. The stance's batteries
are the sweep at `3d657452` with
`--batteries gait,shove --top 90 --variants '[{}, {"boundedSwing": false}]'`, read again.
