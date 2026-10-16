# Locomotion and the stand-up: the known issues

The owner asked for this plan on 2026-10-16. It collects what is known to be wrong or unfinished
in fast locomotion (the walk, the run, Haste and Balance) and in the stand-up, with what each was
measured on, what has been tried, and what is next. The aims:

- **A run that starts, turns and stops** at 3 to 4 m/s on the Warrior, the Rogue and the skeleton,
  empty-handed and with the club, unassisted as far as it goes, then helped by Balance and taken
  past a person's pace by Haste.
- **A stand-up that works on the run's legs**, then one that is fast: the owner's target is a
  median verified recovery within 4 s ([rising](../reference/rising.md#dynamic-rise)).

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
  the Warrior fell on every stop asked at 2.5 s.
- **Tried and not kept.** Handing back only once the body has slowed 0.2 under the run's pace kept
  the Warrior and the Rogue up, but felled the skeleton 12 times, and the Move bout changed gait
  3.8 s after the foe came near.
- **Next.**
  1. A stop battery: stops asked at several times after setting off, in the search's scorer
     (`STOP.at` is 12 s alone today, long after the run is steady).
  2. Then a walk that takes a body back from a run and stops it. One way is a late swing that
     puts the foot down when the centre of mass runs ahead of the stance foot, as the walk's own
     stops do at a walking pace. Another is a run-to-stop clip tracked by the cycle, if CMU has one.
- **Done when** the stop battery falls in none of its trials on the three bodies at balance 0, and
  the Move bout test passes as written.

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

- **Seen.** Two Warriors opened at 12 m close at 1.86 and 2.11 m/s and go down at 7.42 and 6.84 s.
  Two Rogues (1.86, 2.02) and two skeletons (2.06, 1.25) stay up. The probe is an 8 s bout by
  `research/bout.mjs`.
- **Not traced.** The fix of L1's first landing does not change it. Whether it is a stop, a blow
  or a clinch is the first thing to read.

### L4. The club throws the run

- **Seen.** Trials fallen of 50 each, balance 0:

  | Body | Empty-handed | With the club |
  |---|---|---|
  | Warrior | 1 | 10 |
  | Rogue | 5 | 26 |
  | skeleton | 3 | 12 |

  Most fall within a second or two of the run beginning, drifting across the heading at about
  0.5 m/s as the walk hands over.
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
- **Done when** it stands at least the 45 of 64 it stood before.

### S2. The fixtures built on the old body

Since `bf9cbbc0` 33 slow tests fail (34 with the Crypt corpse test this tree mends). Many are
stand-up and support fixtures whose falls land otherwise on the new legs, or no longer fall:

- `core-rise`: a 90° shove no longer rolls the Warrior on over its side; and "0 corners of its
  right sole are on the ground".
- `research-rise`: a battery shove's body still moves 7.95 s after the fall.
- `core-assist`: the pull that felled a body no longer fells it.
- `core-supported-rise`, `core-support-load`, `core-support-transition`, `lab-research-rise`,
  `research-recovery-native`, `core-fork` ("down at step 185").

Further `todo`s say why they were set aside:

- "the open hand bears on its palm's measured hull, and this support was tuned on the open
  capsule" (about seventeen);
- "the legs are the run's", whose host recovery does not stand the body in 40 s or 26 s (five);
- "the Combat fighter's second empty-handed rise stalls at stage 3".

**Next.** Triage each into one of two kinds. Either the body changed and the fixture's premise no
longer holds (re-seed the fall, or rewrite the bar as a property). Or the rise broke, which goes
under S1. A fixture is not re-tuned until the controller it holds is fixed.

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
- It therefore screens the pinned body, not the run's legs.
- Its criteria, cases and configuration are not changed without the owner.

### S6. To apply once a rise meets its bar

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
6. **A fast stand-up (S3, S4)**, screened through the frozen acceptance (S5).

Each step lands in small commits, gated by `npm run check` and `npm test`, with the slow tests it
touches run by name. A step that fails its bar is reported as failed; a measurement names its
harness, its bodies and each side's balance.

## The owner's choices

- **The frozen screen.** `stand-up-acceptance-v1` screens a body the game no longer has. Should it
  stay pinned to the old legs, or be pinned again on the run's legs?
- **The body's two jobs.** If step-up cannot get back to 45 of 64 on the run's legs, should the
  legs stay as they are (the run's), or be set between the run's and the rise's?

## Out of scope

- The Crypt party's movement, which can topple every member on the way back (`todo` "nobody in the
  fight is held"; party control is not a priority).
- The punch, the kicks and the strike recipes searched on capsule hands (their `todo`s), except
  where a stand-up fixture needs a blow.
