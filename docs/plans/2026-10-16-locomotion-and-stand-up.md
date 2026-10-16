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

The run's legs took the stand-up from 45 of 64 to 14. The foot's friction is not the cause (13 of
64 at 0.5): step-up's stages were searched on the old legs. None stands within 6 s on either tree.

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
  - Handing back only once the body has slowed 0.2 under the run's pace kept the Warrior and the
    Rogue up, but felled the skeleton 12 times, and the Move bout changed gait 3.8 s after the foe
    came near.
  - The run's phase set only by a landing of the foot that is due (a landing gate): the stop
    battery fell 6 of 96 against 3.
- **Bar.** The stop battery falls in none of its trials on the three bodies at balance 0, and the
  Move bout test passes as written. Not met: 3 of 96 fall, and the Move bout changes gait 3.3 s
  after the foe comes near against the test's 3 s, which is L2's.

### L2. Braking is slow

- **Seen.** A stop from 3.5 m/s takes about 8 s and 14 m. The planners assume 0.3 m/s² (the
  walker's `SPACE.brake`, the Crypt's `CORNER.brake`).
- **Tried and not kept.** A pace floor under the body's speed; the run slowing by its own `brake`
  (26 of 45 stops fell, against 16 at the walk's 0.47 m/s²); a lower handover speed; a larger `cv`
  or `leanGain`. The search's walk `slowdown` of 0.68 m/s² throws the skeleton's guard walk as it
  stops from 1.2 m/s.
- **Next.** The same fix as L1, measured as metres to stop; then raise the planners' brake to what
  holds.

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
- **Tried and not kept.**
  - `gainSide` is a knife edge: 0.086 against 0 trades the Warrior's falls for the skeleton's, and
    0.2 or more throws everyone.
  - A search with the club in hand found nothing in 13 generations.
  - A run that begins only below a sideways drift never runs.
  - The club's arm kept in the guard did not help.
- **Next.** A lateral controller of the run that takes up the walk's sway at the handover:
  Raibert's placement across the heading from the drift the walk leaves, not only the run's own.

### L5. The pace stops at about 3.7 m/s

- **Seen.** Asked 4 or 5 m/s, a body settles at the same pace. That pace is the fixed point of a
  pace held `ahead` (0.46 m/s) past the body's own speed. Haste 150 adds 0.2 to 0.3 m/s.
- **Why it is held.** A cycle quickened past what the body has come up to throws it forward of its
  feet; `ahead` is what let Haste help at all.
- **Next.** Make the body come up to the pace, not let the pace run away: the stride's length at
  the clip's (Froude), the push-off at the clip's ankle, and the swing's reach at speed. Read
  stride length and cadence against the clip's at 3, 4 and 5 m/s first.

### L6. Haste and Balance at the edges

- **Haste 200** falls at the walk-to-run handover, at about 2.9 s; walking at 200 is fine.
- **The Rogue at Haste 150 without Balance** passes 3.5 m/s and falls at 12 to 15 s.
- **Balance costs the Rogue and the skeleton pace**: 2.83 m/s against 3.15, and 3.09 against
  3.47, at 25 %. The skeleton's turns fall more at 10 % (5 of 20) than at 0 (2).
- **Next.** Search with Haste 200 in the cells. Measure the pace Balance costs, and whether the
  assist's pitch term is what slows them ([assist](../reference/assist.md#a-gaits-assist)).

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
- Acceleration took about 6 s from 1 to 3.5 m/s before the run's last search. It is not measured
  since `speedup` became 1.16 m/s² and `accel` 1.08.

## The stand-up issues

### S1. Step-up does not stand the run's legs

- **Seen.** 14 of 64 target falls, from 45 before `bf9cbbc0`; see the table above.
- **Next.**
  1. Search step-up's stages again per model on today's legs
     (`research/rising-step-search.mjs`), and score it on the target.
  2. Then the skeleton's 48 shoves: step-up stood 9 there on the old legs.
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

- `stand-up-acceptance-v1` pins its evaluator, baseline, saved falls and body. A candidate runs
  through that checkout's `node research/stand-up-acceptance.mjs --candidate <module>`.
- It therefore screens a body the game no longer has.
- **Decided** (the owner, 2026-10-16): the codebase keeps no dead code. Once the legs are settled
  (S1), the screen is pinned again on them, with falls saved on that body. Then `v1`, its setup
  (`npm run setup:frozen`, `npm run test:frozen`) and what only it reads are deleted, and
  `AGENTS.md`'s "Frozen stand-up acceptance" names the new ref. Until then nothing is screened
  through `v1`.

### S6. A stand-up assist

The owner wants one (2026-10-16), on the same terms as the gait's: unassisted first, as far as it
goes, then an assist to fill the gap and to take a character past a person.

- **Why Grit was not built.** It was a joint-torque surge. Searched at twice the Warrior's strength
  and 1.5 times the Rogue's, step-up stood as often and no faster: the route's time goes to its
  stages waiting on balance, and more torque does not shorten a wait on balance.
- **What Balance gives the rise today.** Step-up's bearing stage asks the body's assist for what
  its patches cannot give, within Balance's ceiling. On shoves from seeds 1 to 8
  (`rising-bed.mjs --starts shoved --models workshop-fighter,workshop-rogue --seeds 1-8 --sub
  stand-up --techniques step-up --balance <b>`; most shoves no longer fell the run's legs), stood
  of those that fell:

  | Balance | Warrior empty | Warrior club | Rogue empty | Rogue club |
  |---|---|---|---|---|
  | 0 % | 3 of 5 | 2 of 5 | 1 of 29 | 1 of 33 |
  | 25 % | 3 of 4 | 0 of 4 | 7 of 20 | 0 of 17 |
  | 50 % | 5 of 6 | 2 of 5 | 6 of 23 | 1 of 18 |

  It helps the Rogue empty-handed a little, and nothing else.
- **What it costs the Warrior.** On the target (`rising-step-search.mjs --score --cap 30
  --balance <b>`, the S1 searches' tunings, stood of the falls the shove still fells), with the
  rise's bearing given today's shortfall, nothing, or only a lift (the ceiling's force upward while
  a stage bears, nothing in the pose stages):

  | Balance | Warrior: today / none / lift | Rogue: today / none / lift |
  |---|---|---|
  | 10 % | 13 / 21 / 23 of 30 | 12 / 11 / 10 of 32 |
  | 25 % | 7 / 18 / 22 of 26 | 7 / 9 / 7 of 32 |
  | 50 % | 8 / 20 / 2 of 27 | 9 / 4 / 2 of 27 |

  The Warrior's assisted rises reach the last stage and fail there: the even stage's first steps
  ask the assist for about 100 N across and 50 N m that the patches would not give, and the body
  leaves the steadying stance off one foot. Without its horizontal part the shortfall stood 11 of
  26 at 25 %. Any help in the pose stages fells the body: a lift through them stood 0 of 32 Rogue
  falls, and a damper on the centre of mass's speed and the pelvis's spin 0 of 32. None stands a
  fall within 6 s. The stages were searched at 0 %; a candidate is not judged until they are
  searched with it on.
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
