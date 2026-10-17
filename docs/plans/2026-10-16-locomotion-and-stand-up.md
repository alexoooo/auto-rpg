# Locomotion and the stand-up: the known issues

The owner asked for this plan on 2026-10-16. It collects what is known to be wrong or unfinished
in fast locomotion (the walk, the run, Haste and Balance) and in the stand-up, with what each was
measured on, what has been tried, and what is next. The aims:

- **A run that starts, turns and stops** at 3 to 4 m/s on the Warrior, the Rogue and the skeleton,
  empty-handed and with the club, unassisted as far as it goes, then helped by Balance and taken
  past a person's pace by Haste.
- **A stand-up that works on the run's legs**, then one that is fast: the owner's target is a
  median verified recovery within 4 s ([rising](../reference/rising.md#dynamic-rise)).
- **One set of legs for both** (the owner, 2026-10-16). The body stands up reliably and runs
  reliably on the same legs, cleanly and unassisted, ideally at a person's level. If that is too
  hard, both work cleanly unassisted below a person's level, and the assists (Balance, Haste and a
  stand-up assist) bring them to a person's level and past it.

Every figure below is Node stand, Rapier, 120 Hz, at balance 0 % unless it says otherwise, on the
tree at `8ba554c3`.

## Where things stand

**The run.** The walk (`simbicon`, `src/core/skills/simbicon.ts`) hands over to a person's run
cycle (`runCycle`, `src/core/skills/cycle-run.ts`), which tracks three CMU clips (2.75, 3.94 and
4.38 m/s, `assets/core/run-cycle.json`). The legs are set for the run (`owner-run-body`: hip
x2.49, knee x1.58, calf x2.75, leg speed x1.98; foot friction 0.8). On the gait battery (asked 1.4
to 5 m/s, three stops, two turns, gust seeds 5 to 8, empty and club: 300 trials;
`research/run-cycle-search.mjs --score`):

| Setting | Trials fallen | Steady pace, Warrior / Rogue / skeleton (m/s) |
|---|---|---|
| Balance 0 | 57 | 3.38 / 3.15 / 3.47 |
| Balance 25 | 5 | 3.59 / 2.83 / 3.09 |
| Haste 150, Balance 25 | 15 | 3.68 / 2.99 / 3.21 |

**The stand-up.** Every humanoid stands up by `step-up` (`src/core/mind/ground/step-up.ts`). On the
owner's 64-fall target (`node research/rising-bed.mjs --target --techniques step-up`, 30 s cap),
falls stood of 16, and the median time:

| Tree | Warrior empty | Warrior club | Rogue empty | Rogue club |
|---|---|---|---|---|
| `627ecc3a`, before the run's legs | 16, 14.4 s | 14, 14.6 s | 10, 18.7 s | 5, the cap |
| `bf9cbbc0`, the run's legs | 8 | 2 | 3 | 1 |
| `bf9cbbc0` with foot friction 0.5 | 4 | 3 | 6 | 0 |
| `8ba554c3` | 8, 23.6 s | 2, the cap | 3, the cap | 1, the cap |
| S1: stages searched again, steadying grace | 11, 13.3 s | 14, 14.9 s | 9, 26.3 s | 6, the cap |

The run's legs took the stand-up from 45 of 64 to 14; S1 brings it back to 40. The foot's friction
is not the cause (13 of 64 at 0.5). None stands within 6 s on any tree.

## The locomotion issues

### L1. A stop soon after the run begins falls

- **Seen.** Asked 1.4, 1.8 and 2.4 m/s and to stop at 2.5 to 8 s (calm), 9 of 72 trials fall: the
  skeleton 7, the Warrior 2, the Rogue none.
- **In a bout.** In an Arena bout opened at 8 m, the Warrior is asked 1.4 m/s. It starts running
  0.25 s before the Rogue comes near, and falls as it stops (`tests/move.test.mjs`, a `todo`).
- **Traced** on the Warrior. The walk the run gives way to waits on one stance foot for up to
  0.8 s (`longest`). Its swinging foot comes down to about 5 mm above the ground and rises again,
  carried ahead and up on an arc as the body tips forward past 1.5 m/s. The skeleton falls 2 to
  4 s after it is asked to stop; that is not traced.
- **Kept.** A run gives way only from its second landing (`RUN_SWITCH.landings`). At its first,
  the Warrior fell on every stop asked at 2.5 s. Late in a swing the thigh leans no farther than
  the straight leg reaches the ground, and a landing asked farther bends the stance knee, up to
  0.8 rad; stopping, a landing gives the legs back to the stance under 0.5 m/s in all
  (`90095ac8`).
- **Measured** (Node stand, Rapier, 120 Hz, balance 0, haste 100). The stop battery
  (`run-cycle-search --score --stops 1.4,1.8,2.4,3.5 --stop-at 2.5,4,6,8 --holds empty,club
  --seconds 20`) fell 8 of 96 before and 3 after: none of a stop asked by 6 s. Left: the Rogue
  with the club asked 3.5 and to stop at 8 s falls at 10.8 s; the skeleton falls 9 to 10 s after
  stopping from 1.8 with the club and from 2.4 empty-handed. The gait battery fell 57 of 300
  before and 45 after (stops 18 to 5).
- **Tried and not kept.**
  - Late in a swing, the thigh let lean as asked when the hip is higher over the ground than the
    straight leg is long, where the walk holds it upright: the stop battery fell 8 of 96 against
    14 at a walk slowdown of 0.7 m/s², but 4 against 3 at today's, and the Warrior walking
    backwards with the club fell at 0.4 m/s: its walk envelope backwards went from 2 to 0.3 m/s.
  - Handing back only once the body has slowed 0.2 under the run's pace kept the Warrior and the
    Rogue up, but felled the skeleton 12 times, and the Move bout changed gait 3.8 s after the foe
    came near.
  - The run's phase set only by a landing of the foot that is due (a landing gate): the stop
    battery fell 6 of 96 against 3.
- **Bar.** The stop battery falls in none of its trials on the three bodies at balance 0, and the
  Move bout test passes as written. Not met: 3 of 96 fall, 6 since the narrower run (L8), and the Move bout changes gait 3.3 s
  after the foe comes near against the test's 3 s, which is L2's.

### L2. Braking is slow

- **Seen.** A stop from 3.5 m/s takes about 8 s and 14 m. The planners assume 0.3 m/s² (the
  walker's `SPACE.brake`, the Crypt's `CORNER.brake`).
- **Tried and not kept.** A pace floor under the body's speed; the run slowing by its own `brake`
  (26 of 45 stops fell, against 16 at the walk's 0.47 m/s²); a lower handover speed; a larger `cv`
  or `leanGain`. The search's walk `slowdown` of 0.68 m/s² throws the skeleton's guard walk as it
  stops from 1.2 m/s.
- **Searched** (Node stand, Rapier, 120 Hz, balance 0): the run's settings and the walk's
  `speedup` and `slowdown` together (`run-cycle-search`, 40 generations from L1's). Its best fell
  41 of the gait battery's 300 against 45, but 10 of the stop battery's 96 against 3 (the
  skeleton 8), and stopped from 3.5 m/s in 4.5 s and 9.1 m against 7.6 s and 15.0 m. Not kept. The
  quicker stop is its walk `slowdown`, doubled to 1.0 m/s²: the run's `brake` alone fell 2 of 96
  and stopped in 7.4 s, and its best with today's brake fell 8. The walk's slowdown alone, on the
  stop battery:

  | `slowdown`, m/s² | Fell of 96 | From 3.5 m/s |
  |---|---|---|
  | 0.473, today's | 3 | 7.6 s, 15.0 m |
  | 0.7 | 14 | 5.5 s, 10.6 m |
  | 1.0 | 15 | 4.4 s, 8.4 m |
  | 1.5 | 25 | 3.6 s, 7.1 m |

  The skeleton falls most: its guard walk does not take a quicker slowing. The planners' 0.3 m/s²
  stays; today's stop from 3.5 m/s averages 0.46 m/s² and takes 15 m, against 20 m planned.
- **Traced** (`8d30a6d9`, the skeleton asked 2.4 m/s and to stop at 8 s, at today's slowdown).
  The walk slows to nothing while it drifts across the heading: each left foot lands further left,
  and by 13 s the body goes about 0.4 m/s to its left at no speed forward. The stance takes over
  at a landing under 0.5 m/s, is handed a body still drifting, and falls 1.3 s later. The
  skeleton's other stop falls come as late after it has slowed.
- **Tried and not kept.** The stance taking over only once the last stride's speed is under
  0.5 m/s too: the walk goes on stepping and falls in place. Each landing trim cleared only when
  its own axis's ask changes: no change, since the forward walk's `trimSide` is 0.
- **Next.** A walk that slows faster without felling the skeleton: its placement across the
  heading at no speed forward, the same weakness as its walk to the side (L7). Then raise the
  planners' brake to what holds.

### L3. The Warriors go down at about 7 s in a 12 m bout

- **Seen.** Two Warriors opened at 12 m closed at 1.86 and 2.11 m/s and went down at 7.42 and
  6.84 s, in an 8 s bout by `research/bout.mjs`.
- **Gone.** Since L1's stop (`90095ac8`) neither goes down. Each runs from 5.25 s, stops from
  about 1.3 m/s at a 4.3 m gap and closes standing, empty-handed (9 s) and with the club (12 s).

### L4. The club throws the run

- **Seen.** Trials fallen of 50 each, balance 0:

  | Body | Empty-handed | With the club |
  |---|---|---|
  | Warrior | 1 | 10 |
  | Rogue | 5 | 26 |
  | skeleton | 3 | 12 |

  Most fall within a second or two of the run beginning, drifting across the heading at about
  0.5 m/s as the walk hands over.
- **Now** (the gait battery after L1, `90095ac8`; Node stand, Rapier, 120 Hz, balance 0): 39 of
  the 150 trials with the club fall, against 6 of 150 empty-handed. The Warrior falls in 6 (five
  turns, at 13.7 to 15 s, in the turn), the skeleton in 8, the Rogue in 25. The Rogue falls in
  every trial asked 3.5 m/s or more, at 9.4 to 10.8 s. Traced asked 4: it gains speed for 4 s past
  where it holds empty-handed (3.2 to 3.4 m/s), reaches 3.9, its hips sink from 0.92 to 0.76 m in
  the last 0.3 s, and its trunk goes over backwards: its legs give way at the pace `ahead` keeps
  asking (L5), and it does not drift across the heading.
- **In the game** an order to run, or to go somewhere, asks no more than the fastest forward pace
  that held `RUN.share` (0.6) of its trials in the run envelope (`orderedIntent`,
  `src/core/mind/ordered.ts`; `assets/core/simbicon-run-envelope.json`, the club among its holds):
  4.5 m/s for the Warrior and the skeleton, 3 for the Rogue, which held 3.5 in 5 of 10. The
  Rogue's runaway is asked only by the gait battery, which asks a pace directly; it is a bar on
  the run, not a fall a bout meets.
- **Tried and not kept.**
  - `gainSide` is a knife edge: 0.086 against 0 trades the Warrior's falls for the skeleton's, and
    0.2 or more throws everyone.
  - A search with the club in hand found nothing in 13 generations.
  - A run that begins only below a sideways drift never runs.
  - The club's arm kept in the guard did not help.
  - For the Rogue's runaway: the pace held at the body's own speed once it passes its empty-handed
    pace (`ahead` 0 there) still fell; the stance and ankle at full strength fell sooner; a
    governor braking the pace when the hips sink below their standing height felled the body
    within seconds, since the hip's height swings by more within a stride than it sinks before a
    fall.
- **Since the narrower run** (L8, `8d30a6d9`): 18 of the gait battery's 150 club trials fall,
  the Rogue 16 of its 100 trials, against 30.
- **Next.** A lateral controller of the run that takes up the walk's sway at the handover:
  Raibert's placement across the heading from the drift the walk leaves, not only the run's own.

### L5. The pace stops at about 3.7 m/s

- **Seen.** Asked 4 or 5 m/s, a body settles at the same pace. That pace is the fixed point of a
  pace held `ahead` (0.46 m/s) past the body's own speed. Haste 150 adds 0.2 to 0.3 m/s.
- **Why it is held.** A cycle quickened past what the body has come up to throws it forward of its
  feet; `ahead` is what let Haste help at all.
- **Searched.** L2's search, with cells at 3 and 4 m/s, empty and with the club, moved the
  gait battery's pace asked 4 and 5 m/s from 3.03 to 3.21 m/s for the Warrior and from 2.66 to
  2.68 for the Rogue, and its falls with the club from 39 to 33; not kept for its stops (L2).
- **Read** (`8d30a6d9`, asked 4 and 5 m/s, empty and with the club, calm). The steady pace,
  cadence times step from 4 s on, is 3.5 m/s for the Warrior, at 2.84 landings a second and 1.23 m
  a step; 2.65 for the Rogue and 2.98 for the skeleton. The clips scaled to the Warrior's leg
  (Froude) run 3.5 m/s at about 2.65 a second and 1.3 m, and 4.05 at 2.82 and 1.44 m. At its top
  the body has the clip's cadence at 4 m/s and its step at 3: the stride is what falls short.
- **Tried and not kept.** Each lever traded cadence for step at the same pace:
  - a push-off, the stance ankle plantar flexed from mid-stance by 0.02 to 0.09 rad per m/s of
    pace: step 1.23 to 1.30 m, cadence 2.84 to 2.66, pace 3.49 to 3.45;
  - the cycle's period 0.95 or 1.15 of the clips' (1.15 fells the Warrior and the skeleton);
  - `ankleAdd` +0.1: 3.86 m/s steady, but the Warrior fell in 3 of 4;
  - the ankles at full strength fell the Warrior and the Rogue in every trial, and `ahead` 0.8
    the Rogue.
  - A search of the pace settings with the push-off (19 settings, cells at 3 to 5 m/s calm and in
    gust seed 5, `--narrow 0.3`) found nothing past its start in 10 generations.
  - A knee push, the stance knee straightened from mid-stance by 0.03 to 0.15 rad per m/s:
    cadence up, step down, the pace no faster; from 0.1 the Warrior falls in every trial.
- **What saturates** (the Warrior asked 5 m/s, 8 to 16 s, empty-handed, calm; each leg channel's
  torque against its ceiling at the activation asked and against its full strength at its
  speed). The ankles are at the share of strength the run gives them (`ankle`, 0.66) in 11 to 14
  % of steps; no other channel is at its ceiling in more than 3 %. At the 95th percentile the
  hips use 0.47 to 0.79 of their full strength, against 0.24 to 0.45 at 2.6 m/s, and the knees
  0.36, as at 2.6. The muscles do not cap the stride; the controller does.
- **Next.** A run whose stride comes from what the stance leg does to the centre of mass (its
  flight), not from the clip's angles followed at a quicker cadence.

### L6. Haste and Balance at the edges

- **The Rogue at Haste 150 without Balance** passes 3.5 m/s and falls at 12 to 15 s.
- **Balance costs the Rogue and the skeleton pace**: 2.83 m/s against 3.15, and 3.09 against
  3.47, at 25 %. The skeleton's turns fall more at 10 % (5 of 20) than at 0 (2).
- **Now** (after L1, `90095ac8`; Node stand, Rapier, 120 Hz, balance 0, asked 4 m/s): Haste 200 no
  longer falls at the handover. It takes the Warrior's pace from 3.3 to 3.7 m/s and the
  skeleton's by about 0.05. The Rogue at Haste 200 runs away as in L4 and falls at about 11 s; at
  Haste 100 it is still gaining speed at 16 s (3.24 m/s).
- **Since the narrower run** (L8, `8d30a6d9`; asked 4 and 5 m/s, empty and with the club, and
  turning, calm): Haste 200 takes the steady pace from 3.50 to 3.74 m/s for the Warrior, 2.65 to
  3.14 for the Rogue and 2.98 to 3.22 for the skeleton. The Warrior falls in 3 of its 6 trials
  there, 11 to 16 s in, running away as the Rogue does with the club (L4); at Haste 150 it falls
  in 2 of 6.
- **Searched** with Haste 100 and 200 in the cells (21 lateral, lean, stance and pace settings,
  speeds 3 to 5, a turn and a stop, empty and with the club, calm, `--narrow 0.3`, 16
  generations): its best keeps the Warrior up at Haste 200 (0 of 6) at 3.61 m/s, but the gait
  battery at Haste 100 fell 30 of 300 against 19, the Rogue 27 against 16. Not kept.
- **Bar** (Haste 200 adds at least 0.5 m/s to the Warrior, and the Rogue does not run away): not
  met.
- **Next.** The pace comes before Haste (L5): Haste quickens a cycle whose stride does not
  lengthen. Measure the pace Balance costs, and whether the assist's pitch term is what slows
  them ([assist](../reference/assist.md#a-gaits-assist)).

### L7. The walk's smaller items

- The skeleton's walk to its sides is weak. In the walk's envelope
  (`assets/core/simbicon-envelope.json`), its fastest held at 0, 90, 180, 270 and 45 degrees from
  its facing are 1.5, 1.2, 1.4, 0.7 and 1.2 m/s, against the Warrior's 1.5, 1.4, 2, 1.5 and 1.4.
- A half turn at the next rate past the envelope's now and then runs away sideways and falls, one
  to three of 56 in four cells ([turning](../reference/human-and-strikes.md#turning)).
- In about a fifth of steps the pelvis and lumbar alternate by about 2 mrad, traced to the stance
  hip's spin term.
- The stance's and the stride's turn tables count a turn held where the body stayed up, not where
  it faced round (two `todo` turn tests).
- Acceleration is slow. Asked 3.5 m/s, calm (`8d30a6d9`; Node stand, Rapier, 120 Hz, balance 0),
  from 1 to 3 m/s takes the Warrior 6.5 s empty-handed and 5 s with the club, the Rogue 8.25 s
  with the club, and the skeleton 8.5 s. The Rogue empty-handed reaches 2.5 m/s 6 s after 1 m/s
  and holds 2.74. That is 0.24 to 0.4 m/s², against the run's `accel` of 1.14 m/s²: `ahead`
  keeps the run's pace at most 0.46 m/s past the body's own speed, so the run gains speed only as
  fast as the body follows it.

### L8. The Warrior runs with its feet wide

- **Seen** by the owner in the Lab and the Crypt, 2026-10-16: the Warrior's legs run wide, the
  Rogue's look right. The gait battery measures the median sole separation across the heading
  between landings, 4 s on: 0.534 m on the Warrior at 3 to 5 m/s, 0.398 on the Rogue, 0.327 on the
  skeleton. Runners land their feet nearly in line, and stepping out to 15 to 25 % of the leg
  costs them more (Arellano and Kram 2011, J Biomech 44:1291).
- **Why.** The swing hip aimed its abduction as if the reference pose stood the legs together; the
  humans' stands them out by 0.094 rad (Warrior) and 0.111 (Rogue), so each foot landed that much
  further out than `width` asked. The Warrior is wider than the Rogue also through `cdSide`, which
  steps out per m the centre of mass is out from the stance ankle: a wide stance asks a wider one.
- **Kept** (`8d30a6d9`). The swing and the unloaded stance hip subtract the abduction bind, and the
  lateral, lean, stance and swing settings were searched again with gusts in the cells and the
  score cut past a width of 0.3 of the leg (`run-cycle-search --narrow 0.3`). The bind alone, or a
  cut at 0.15 to 0.2 of the leg, ran the Warrior and the Rogue away at 4 to 5 m/s and fell 115 of
  the gait battery's 300 in gusts.

  | | Gait battery fell | Width W / R / S, m | Pace asked 4-5, W / R / S | Stop battery fell |
  |---|---|---|---|---|
  | Before | 45 | 0.534 / 0.398 / 0.327 | 3.03 / 2.66 / 3.04 | 3 |
  | After | 19 | 0.307 / 0.207 / 0.222 | 3.01 / 2.38 / 2.63 | 6 |

  The pace is the battery's mean speed over a trial, start included. The stop battery's falls
  are the Rogue with the club (3, against 1) and the skeleton as it slows to a halt (3, as
  before), L2's; 3 against 6 of 96 is within the noise.
- **Bar.** The Warrior's width is about 0.3 m, 0.31 of its leg: wider than a runner's, as narrow as
  held in gusts. Eye gate: the owner's look at the Warrior's run in the Lab.

## The stand-up issues

### S1. Step-up does not stand the run's legs

- **Seen.** 14 of 64 target falls, from 45 before `bf9cbbc0`; see the table above.
- **Kept.**
  - Step-up's stages searched again per model on today's legs (`rising-step-search.mjs`, 16
    training falls, first attempts). The Warrior's search stood 12 of its 16 at a 14 s cap; the
    Rogue's plateaued at 10 of 16 at a 24 s cap from its ninth generation, its later best standing
    one fewer of the target's.
  - The steadying stance that takes over from the rise failed on the first moment its body was
    read off two feet: a foot unloaded for 50 ms as the Rogue swayed, upright at 0.96 of its
    standing height. It now fails after 0.3 s off its feet (`12a4835d`): the Rogue 11 of 32 to 16,
    the Warrior 27 either way, at the search's full-precision settings.
- **Measured** (Node stand, Rapier, 120 Hz, balance 0, 30 s cap). The landed settings, rounded to
  four figures, stand 40 of 64 on the target (`rising-bed.mjs --target --techniques step-up`; the
  full-precision settings stood 43: a rounding moves two or three falls). On 52 shoves that fell
  the skeleton, of 96, step-up stands 9, as on the old legs; it spends about 11 s rolling.
- **Which of the legs.** The search's settings, scored with one of the run's leg changes undone
  (`rising-step-search.mjs --score`; Warrior / Rogue of 32):

  | Legs | Warrior | Rogue |
  |---|---|---|
  | Today's | 27 | 11 |
  | Leg speed at the curves' (x1) | 26 | 14 |
  | Torques at their measured peaks (x1), speed kept | 30 | 16 |
  | Both undone | 28 | 0 |

  The torques at their peaks stand 46 of 64, but the gait battery falls in 249 of its 300 trials
  on those legs (against 45 on today's), most as the walk sets off: the run's strength is what the
  rise loses, and the run cannot give it up.
- **Not met.** 40 of 64 against the bar's 45.
- **Next.** A set of legs between the two is scored on both batteries only after the walk
  (`SIMBICON`) and the run (`RUN_CYCLE`) are searched on it, since both were searched on today's
  legs; the Rogue's last stage, `even`, is where most of its remaining falls fail.
- **Done when** it stands at least the 45 of 64 it stood before, on the legs the run's battery is
  scored on.
- **If it cannot**, the legs change to a set that does both. Each candidate set is scored on the
  stand-up target and on the gait battery together. A slower unassisted run on legs that stand is
  acceptable; Haste then brings the pace back.

### S2. The fixtures built on the old body

**Triaged.** 34 slow tests failed at `90095ac8` (one, the combat checkpoint, only because the
source changed while it ran). Each was read against `2c524ff9`, `627ecc3a` (the hip's and the
calf's muscle curves, the blows searched again) and `bf9cbbc0` (the run's legs).

- **The premise changed, re-seeded or rewritten as a property (20).** The assist's pull is an
  eighth of the body's weight; the side roll, the shin's support, the limp body, the support
  transition's fork, the felled and the striking forks, the club's air, the stance's catch and
  wander, the posture's knee stop and toe, the Crypt hearing's window, the lab routine's seed,
  the lab targets' club height and the Warrior's balance shove.
- **A controller broke on the run's legs, set aside as `todo` with the reason (19).**
  - The rise: the support-recovery baseline stands none of eight Lab falls in 45 s; the research
    rise's references stand neither lab fall; a clubbed Crypt walker ordered home as it runs falls
    at the about-turn and does not stand.
  - The blows: the timed whole-body strike's return fells the body; the left front kick's second
    miss and the competency kick do not place the foot; the planted punch's sole tips past
    `STRIKE_SUPPORT.footGap` after an admitted impact; the placed blow's footing leaves the body
    0.2 m short. From `627ecc3a`: the Combat fighter's lead straights fall short (none of 14
    touch), and the grounded downward blow is never admitted.
  - The Rogue: at 25 % balance a backward shove fells it that it stands alone (60 N s).
  - Three support fixtures load world snapshots (`tests/fixtures/*.bin`) saved on the old legs:
    loading one restores their foot friction (0.5, averaged) over the body's (0.8, the larger),
    and no script captures them again.
- **The engine.** A held body's fixed segment turns by about 7.5e-9 in its quaternion's w each
  step, on a bare stand after a limp fall, so the Crypt's held dead are not still to the bit.
- **Seen on the way.** The Lab's first stored club blow (`LAB_BLOWS[0]`) now fells the Warrior
  before it lands. Shoved back at 39 N s or more as it shifts its weight, the Warrior's catch
  takes a second step, and the step asked then sometimes ends in a slow fall.

**Next.** Each `todo` comes back when the controller it names is fixed: the rise's under S1 and
S3, the blows' under their own searches on today's legs. The snapshots are captured again on the
settled legs with S5's falls, by a script that the tests name.

### S3. The stand-up is slow

- **Seen.** Before the run's legs, the medians were 14 to 19 s, none within 6 s. The time is the
  route's, not the muscles':
  - brace about 0.7 s, settle 0.7, roll 2.7, rise 9, steady 1.4;
  - then the target's verification.
- **Tried and not kept.**
  - Searches at twice the Warrior's strength and 1.5 times the Rogue's stood as often and were no
    faster, so Grit is not built.
  - Every stage's seconds scaled by 0.6 or 0.4 broke the rise.
  - On the run's legs, step-up's stages searched for speed at a 10 s cap
    (`research/rising-step-search.mjs --cap 10`, 40 generations from S1's tuning): first attempts
    standing within 10 s went from none to 5 of 16 training falls, at 8.9 to 9.3 s. On the
    Warrior's 32 target falls at the 30 s cap it stood 24 against S1's 25, median 13.8 s against
    14.4, fastest 9.4 against 10.1, none within 6 s (Node stand, Rapier, 120 Hz, balance 0). Not
    kept: a difference within the noise of 32 falls, for one stand fewer. The route's floor is
    about 9 s: about 1.7 s from the fall to the takeover, and the roll and stages after it.
  - `plant-up`, the shorter fours-to-standing route, searched for the Warrior by backward
    chaining (`research/rising-search.mjs --model workshop-fighter`, its whole budget of 34 560
    episodes at an 8 s cap, strength raised to 1.5 times and back): its last stages alone, from the
    states just before them, stood none of 8; at best 1 of 8 starts reached standing, from the
    stage before; from the falls, none. Standalone it stood 0 of 108. No second round: its last
    stage does not finish on these legs.
- **Next.** A different route, not more strength. The research leads are in
  [stand-up planning](../analysis/2026-10-11-stand-up-planning.md): measured feedback reached
  5.9 s and 5.775 s fresh development recoveries from side falls, and a library completes 3 of 16
  frozen cases, none within 6 s. Those were measured on the old legs.

### S4. Where the rise stops

These are from [rising](../reference/rising.md#where-the-rise-stops), read on the old legs:

- The kneel-up goes down forward in two of nine forward topples.
- The Rogue's arms do not raise its chest.
- The humans' roll does not turn the skeleton from its back to its front.
- A limp body does not always come to rest: a skeleton on its front crawls at 25 cm a second.
- Independent joint feedback holds no installed pose within 2 cm for 10 s on the hands' hulls.
- Support entry acquires support in 2 of 4 and 3 of 4 development shoves.

### S5. The frozen acceptance

**Done.** The legs are taken as settled: the set that stands (S1) needs the walk and the run
searched on it first. The screen is pinned again on today's body (`stand-up-acceptance-v2`,
commit `72c9ccb4`):

- Its sixteen falls are saved on the game's body and the run's legs, with the game's Stand up
  (`step-up`) as the baseline and standard support recovery as the built-in comparison. Step-up
  completes 11 of the 16, the fastest in 14.8 s.
- `npm run setup:frozen` and `npm run test:frozen` now prepare and test that checkout, on Node
  24.19.0. The frozen tests check that a saved fall keeps its state and clock across controllers,
  replays its recorded baseline to the bit, and rejects a requested assist.
- What ran only against `v1`'s checkout is deleted: its saved-fall, rollout, path, response and
  replay scripts, the saved actions and the trace viewer. Their records stay
  (`stand-up-path-results.json`, `stand-up-saved-result.json`) as the evidence the
  [stand-up planning study](../analysis/2026-10-11-stand-up-planning.md) cites.

### S6. A stand-up assist

The owner wants one (2026-10-16), on the same terms as the gait's: unassisted first, as far as it
goes, then an assist to fill the gap and to take a character past a person.

- **Why Grit was not built.** It was a joint-torque surge. Searched at twice the Warrior's strength
  and 1.5 times the Rogue's, step-up stood as often and no faster: the route's time goes to its
  stages waiting on balance, and more torque does not shorten a wait on balance.
- **What Balance gives the rise today.** Step-up's bearing stage asks the body's assist for what
  its patches cannot give, within Balance's ceiling. On the target (`rising-step-search.mjs
  --score "" --cap 30 --balance <b>`, S1's tunings; Node stand, Rapier, 120 Hz), stood of the
  falls the shove still fells, and the median with a fall not stood counted at the cap:

  | Balance | Warrior | Rogue |
  |---|---|---|
  | 0 % | 25 of 32, 14.4 s | 15 of 32, the cap |
  | 10 % | 26 of 30, 15.2 s | 17 of 32, 27.4 s |
  | 25 % | 20 of 26, 14.8 s | 15 of 32, the cap |
  | 50 % | 20 of 27, 14.9 s | 14 of 27, 20.5 s |

  It keeps some shoves from felling the body, and stands about as many of the rest. It shortens no
  rise: none stands within 6 s. Before step-up's steadying stance could lose a foot for 0.3 s, the
  Warrior's assisted rises failed in that stance, 7 of 26 at 25 %, on the even stage's first steps
  asking the assist for about 100 N across.
- **Searched with it on.** Step-up's stages searched for the Warrior at 25 % (40 generations from
  S1's) stand 23 of 26 at 25 %, median 12.3 s, none within 6 s; the same tuning at 0 % stands 2 of
  32. A tuning searched with an assist on is one for that assist only. Not kept.
- **Tried and not kept**, before the steadying grace: the rise's bearing given no assist, or only
  a lift (the ceiling's force upward while a stage bears), stood 18 and 22 of the Warrior's 26 at
  25 %. Any help in the pose stages fells the body: a lift through them stood 0 of 32 Rogue falls,
  and a damper on the centre of mass's speed and the pelvis's spin 0 of 32.
- **Candidates**, each a force or moment at the root no muscle gives (`Assist`), metered every
  step, and acting where the rise waits:
  - **Lift**: an upward force through the centre of mass while a stage bears, a share of body
    weight. It unweights the supports, so a limb lifts sooner and a stage's balance margin grows.
  - **Over the support**: a horizontal force and a righting moment that carry the centre of mass
    over the support the next stage stands on, as the gait's assist rights the pelvis toward the
    gait's.
  - **Along the route**: the root pulled toward the technique's next waypoint, its root position
    and attitude, at a capped force.
- **How it is chosen.** Each candidate is scored on the stand-up target, at a 10, 25 and 50 %
  ceiling, for falls stood, the median time and the share stood within 4 s and 6 s. The ceiling
  is an attribute's per cent of body weight: Balance's, or one of its own if the measurement
  shows the rise wants a different amount from the gait. Whether to give it its own attribute is
  the owner's choice when that measurement is in.
- **Done when** a stand-up assist at its ceiling takes the target's median under 4 s, with the
  unassisted figure reported beside it.
- **Not met.** Today's shortfall and a lift were measured, and the stages searched with the
  former on; the best assisted median is 12.3 s against 14.4 s unassisted (the Warrior, 25 %).
  The route along its waypoints is not built. The time is the route's (S3), so an assist that
  waits less needs a quicker route first.

### S7. To apply once a rise meets its bar

The owner decided on 2026-10-01: a body that is down may be struck, and a fall takes nobody out
unless a context has its own rule.

## Order of work

1. **Instruments.**
   - The stop battery (L1).
   - Read the 12 m bout's Warrior falls (L3).
   - Triage the red fixtures (S2).

   None of these changes the game.
2. **Step-up on today's legs (S1).** It is the largest regression and the game's default rise.
3. **Stopping (L1, L2)**, then the planners' brake.
4. **The club's run (L4).**
5. **Pace past 3.7 m/s and Haste 200 (L5, L6).**
6. **A fast stand-up (S3, S4)**, unassisted as far as it goes, screened through the acceptance
   pinned again on the settled legs (S5).
7. **The stand-up assist (S6)**, measured against the unassisted figure.

Each step lands in small commits, gated by `npm run check` and `npm test`, with the slow tests it
touches run by name. A step that fails its bar is reported as failed; a measurement names its
harness, its bodies and each side's balance.

## Decided

The owner's answers, 2026-10-16:

- **The frozen screen** is pinned again on the settled legs, and `v1` is deleted (S5).
- **One set of legs** stands up and runs; see the aims and S1.
- **A stand-up assist** is designed (S6).

## Out of scope

- The Crypt party's movement, which can topple every member on the way back (`todo` "nobody in the
  fight is held"; party control is not a priority).
- The punch, the kicks and the strike recipes searched on capsule hands (their `todo`s), except
  where a stand-up fixture needs a blow.
