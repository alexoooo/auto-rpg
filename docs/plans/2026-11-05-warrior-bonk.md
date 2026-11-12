# Warrior bonk

## Goal

The toed Warrior (`workshop-fighter`, record key `workshop-fighter+toes`, default attributes, no
assistance) bonks a standing body's head with the club as hard as it can: an intentional overhead strike
that raises the club above the head, brings it down in one descending arc onto the head with the
club's swell, the arm straight as it lands, follows through and returns to guard. It does so with either hand, the club alone and with the buckler in the other
hand (`empty,club`, `buckler,club`, `club,empty`, `club,buckler`), at an opponent standing or
moving, from a Warrior standing or on the move, and Option Mind chooses and uses it in the Arena.
The motion reads as intended, not as flailing; the owner judges that from the reel.

The work follows [the skill recipe](../recipes/skill.md), then [the training
recipe](../recipes/training.md); this plan holds what is particular to the bonk.

## The score

A bonk trial is read on the Strike drill at the `high` mark and scored by `barScore`
(`src/evaluation/strike/score.ts`): its value is the energy it delivers to the head, a fall
priced at what it costs in play, and the terms below, the form the owner asks for, graded by
nearness. No term is a gate; a change is kept when the score rises.

| Term | Reading |
| --- | --- |
| Chamber | Before the stroke, the club hand rises above the head, and the swell at least 0.25 m above the point it then strikes. |
| One stroke | The club's descent from chamber to contact is one arc: no second windup, no reversal of the shaft's swing beyond 10 degrees. The shaft sweeps 45 to 150 degrees. |
| Descent | The swell's path at contact descends at least 45 degrees below horizontal. |
| Swell on the head | The first contact on the target is the swell's collider on the head. |
| Arm straight | The striking elbow is within 30 degrees of straight at contact, as the drill reads a fist's (`Bar.bend`). |
| Energy | The contact's energy, higher better. Beside it as a scale: 86.3 J (`Bar.overhead.energy`), 90% of the strongest blow step 2 found with every other term met (95.9 J), and 75.5 J, the mean of an untrained adult's one-handed blow with a crutch (Frantz, Sprenger & Jackowski 2026; `Bar.held.energy`, 64.8 J, is that less one SD). On another body both scale by `pairShare`. |
| Back to guard | The hand and club return to guard and settle, as the drill's existing return reading measures. |
| Falls | A fall through the trial or its settle, priced in the value. |

The wrist may cock during the chamber and snap through the stroke: that whip is where a club's
speed comes from, and "one stroke" reads the shaft's swing, not each joint; the elbow is straight
by contact.

## Where it starts

- **The reader** reads a club's blunt blow at the high mark as a bonk on the terms above
  (`Bar.overhead`, `Overhead`, `src/evaluation/strike/read.ts`), graded by `overheadScore`
  (`score.ts`); the `bonk` protocol plays the still rung's places on the Warrior's right hand at
  the drill's standing target, its arms lowered (`drill-stand`), each of the game's foes (the
  Warrior, the Rogue, the Skeleton).
- **The bonk** is a swing (`swingExecutor`, `SWINGS.bonk` in `src/skills/strikes/swing-part.ts`): a
  chamber posture and timed pushes, its record `assets/skills/strikes/bonk/bonk.json`, thrown by
  its own experimental Option (`strike-bonk`, aimed at the head's centre). It is searched on the
  training twins of the body's bonk row's cells by
  `research/skills/strikes/swing/swing-drill.mjs --body workshop-fighter --skill bonk`, scored by
  the cell's value graded (`searchScore`), and confirmed on the cells' own cases (`--confirm`).
- **The straight punch** (`src/skills/strikes/straight-punch.ts`, `learned-punch.ts`) is the
  worked example of every step below: a graded bar, a searched push schedule, a learned actor
  correcting it.

## The target

The drill's struck target stands with its arms lowered (`drill-stand`), so the head is open and a
failed trial is the striker's. A guard over the head is the `guarding` rung's and the fight's
question, not the bonk's.

A moving opponent is the Strike drill's own cases: a target carried past on a rail (`moving`) and
an opponent stepping in and out (`stepping`). Against them the
bonk aims where the head will be at contact, not where it is at commitment. The Warrior on the move
strikes as it arrives (`walk`), at the paces its walk serves; faster with
[Warrior travel](2026-11-05-warrior-travel.md).

## Work

1. **Reader and score.** Add the terms above to the Strike
   drill's reading of a held blow at the `high` mark, graded in `barScore`; right hand, club
   alone, 120 Hz, the still rung's places. Show the old swing scoring low on its form and the
   current bonk executor scoring low on its energy, both from watched trials. Build nothing else
   first.
2. **Feasibility.** Search an overhead blow with its channels pushed free (shoulder, elbow,
   wrist and trunk, the wrist cocked in the chamber, the elbow straight by contact), scored on
   energy under the form terms. Its strongest blow is the scale later readings are shown against.
3. **Native controller.** A chamber posture and a schedule of timed pushes, the wrist's cock
   and snap among them, CMA-searched on the bonk drill's twin by the score at 120 Hz. Extend `swing.ts` where its contract fits; the bonk keeps its own Option and record.
   Before training, it lands some held-out places.
4. **Learned actor.** Train a residual actor over the schedule by the training recipe, from
   scratch, rewarded by the score, on the twin's trials at places the window admits. Choose
   checkpoints on development places; held-out places confirm.
5. **Widen.** One at a time, keeping the earlier cases in the mix: the left hand, the buckler loadouts, the Warrior striking as it walks in, the opponent moving
   (carried past, then stepping in and out), and a miss (the target removed
   at commitment) that still follows through and returns to guard.
6. **Option Mind.** Register the bonk as its own Option with the head as its target, read its
   profiles, and watch Option Mind choose and land it in the Arena.
7. **Confirm.** The cells' places at 120 and 480 Hz, the worse counting, each hand and loadout, the opponent still and
   moving, the Warrior standing and walking in: the score against the baseline. Watch the reel,
   failures first, at normal speed and slow motion, and make [the claim](../recipes/skill.md#the-claim).

## Where it stands

The row, from saved results:
`npm run evaluate -- table --body workshop-fighter --skill bonk --by gap`.

- **Work steps 1 to 3 are done, and step 6**: the native swing (its record, with its footing) is
  the Warrior's bonk, Option Mind's only club blow (`src/entrants/option/mind.ts`), priced by its
  profile from the drill (`research/skills/strikes/strike-profiles.mjs`).
- **`empty,club`**: 12 of 16 land at a median 102 J; the places at a gap of 0.7 m or nearer are
  refused.
- **`buckler,club`**: none of the 14 begun meets the head with the swell: 6 land elsewhere, 5 on
  the guard, 3 miss.
- **Step 4 has no trained actor.** The training environment
  (`research/skills/strikes/swing/environments/bonk.json`), on the `bonk` drill's training twin at
  120 Hz, reads each trial as the swing lets go
  (`releasedScore`, `onward: false`). A pooled episode's first decision holds the windup, about
  190 world steps, so the trainer's environments wait on it and the run makes 100 decisions a
  second ([the training recipe's traps](../recipes/training.md#traps)).
- **What the swing cannot do** is in [the approaches](../approaches.md#weapon-strikes): it strikes
  where the target stood when it committed, and its time is its footwork's steps.

## The next question

Why the bonk never meets the head with the buckler in the other hand, where the same swing lands
12 of 16 without it. Its signal is the `buckler,club` cell's outcomes on the `bonk` protocol's 16
places; watch the cell's reel first (the Ratings link on its line).

After it, step 4: the environment answers an episode's first request itself, with no steer, and
plays the windup in its idle time, so an episode the trainer sees begins at commitment; then the
steered swing is trained from a spread of `--log-std -3` or lower.

## To pick it up

- **Screen the swing or a policy** on the environment's places, the twin's, at 120 Hz; with
  `--cell`, the cells' own cases at 120 and 480 Hz, the worse counting:
  `node research/skills/strikes/straight-punch/punch-policy-check.mjs --config research/skills/strikes/swing/environments/bonk.json --policy none`
  (`--policy <run>/policy-<n>.json` for a checkpoint; `--config` a run's configuration to screen
  on its places).
- **Train** from a configuration naming the environment and its curriculum: `environment`
  `research/skills/strikes/swing/environments/bonk.json`, `workers` 20, `each` 4, on the
  environment's places (the `bonk` drill's twin) and rate; run
  `research/run-train.py --config <it> --output .tmp/warrior-bonk/<run> --keywords released,short,down --log-std -3 --profile`.
  The trainer's default keywords are travel's and fail on this environment.
- The swing executor, the strike reader and a muscle's speed are shared pieces: a change to one
  is read on the club's trunk blow, the sword cut, the punch, stand-up and travel as well. Work
  goes under `.tmp/warrior-bonk/`.

## Completion

The confirmation reading of step 7 is read, Option Mind uses the bonk in the Arena, and its table
cells are claimed as [the skill recipe](../recipes/skill.md#the-claim) says. The motion's reading
goes into reference documentation and this plan is deleted.
