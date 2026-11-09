# Warrior bonk

## Goal

The toed Warrior (`workshop-fighter`, record key `workshop-fighter+toes`, default attributes, no
assistance) bonks a standing body's head with the club at full strength: an intentional overhead
strike that raises the club above the head, brings it down in one descending arc onto the head
with the club's swell, the arm straight as it lands, follows through and returns to guard,
without falling. It does so with either hand, the club alone and with the buckler in the other
hand (`empty,club`, `buckler,club`, `club,empty`, `club,buckler`), at an opponent standing or
moving, from a Warrior standing or on the move, and Option Mind chooses and uses it in the Arena.
The motion reads as intended, not as flailing; the owner judges that from the reel and accepts the
rung.

The work follows [the skill recipe](../recipes/skill.md), then [the training
recipe](../recipes/training.md); this plan holds what is particular to the bonk.

## The tests

A bonk trial is read on the Strike drill at the `high` mark. It lands when it meets every test
below, and it is scored by `barScore` (`src/evaluation/strike/score.ts`) with these tests added as
graded terms: nearness when short, margin when met.

| Test | Reading |
| --- | --- |
| Chamber | Before the stroke, the club hand rises above the head, and the swell at least 0.25 m above the point it then strikes. |
| One stroke | The club's descent from chamber to contact is one arc: no second windup, no reversal of the shaft's swing beyond 10 degrees. The shaft sweeps 45 to 150 degrees. |
| Descent | The swell's path at contact descends at least 45 degrees below horizontal. |
| Swell on the head | The first contact on the target is the swell's collider on the head. |
| Arm straight | The striking elbow is within 30 degrees of straight at contact, as the drill reads a fist's (`Bar.bend`). |
| Full strength | The contact's energy is at least 86.3 J (`Bar.overhead.energy`): 90% of the strongest blow step 2 found that meets every other test (95.9 J), and at least 75.5 J, the mean of an untrained adult's one-handed blow with a crutch (Frantz, Sprenger & Jackowski 2026; the held-blow bar, `Bar.held.energy`, 64.8 J, is that less one SD). On another body both scale by `pairShare`. |
| Back to guard | The hand and club return to guard and settle, as the drill's existing return reading measures. |
| Upright | No fall through the trial and its settle. |

The wrist may cock during the chamber and snap through the stroke: that whip is where a club's
speed comes from, and "one stroke" reads the shaft's swing, not each joint; the elbow is straight
by contact. These tests are frozen once step 1's reader shows them, the full-strength figure once
step 2 sets it; a candidate short of them goes back to development, the tests stay.

## Where it starts

- **The reader** reads a club's blunt blow at the high mark as a bonk against the tests above
  (`Bar.overhead`, `Overhead`, `src/evaluation/strike/read.ts`), graded by `overheadScore`
  (`score.ts`); the `bonk` protocol plays the still rung's places on the Warrior's right hand at
  the arms-lowered target (`drill-open`).
- **The bonk** is a swing (`swingExecutor`, `SWINGS.bonk` in `src/skills/strikes/swing-part.ts`): a
  chamber posture and timed pushes, its record `assets/skills/strikes/bonk/bonk.json`, thrown by
  its own experimental Option (`strike-bonk`, aimed at the head's centre). It is searched by
  `research/skills/strikes/swing/swing-drill.mjs --blow bonk --protocol bonk --other empty`;
  `--feasible` ranks a blow that meets the form by its energy alone.
- **The straight punch** (`src/skills/strikes/straight-punch.ts`, `learned-punch.ts`) is the
  worked example of every step below: a graded bar, a searched push schedule, a learned actor
  correcting it.

## The target

Development uses a drill opponent that stands with its arms lowered, so the head is open and a
failed trial is the striker's; none of the drill opponents (`DRILL_OPPONENTS`) does yet, so step 1
adds it. The standing opponent in guard (`drill-stand`) is a step 5 case: a bonk that lands on the
raised arm is a landed blow on the arm, read as such, not a failed bonk.

A moving opponent is the Strike drill's own cases: a target carried past on a rail (`moving`) and
an opponent stepping in and out (`stepping`), arms lowered first, then in guard. Against them the
bonk aims where the head will be at contact, not where it is at commitment. The Warrior on the move
strikes as it arrives (`walk`), at the paces its walk serves; faster with
[Warrior travel](2026-11-05-warrior-travel.md).

## Work

1. **Reader and score.** Add the arms-lowered drill opponent, and the tests above to the Strike
   drill's reading of a held blow at the `high` mark, graded in `barScore`; right hand, club
   alone, 120 Hz, the still rung's places. Show the old swing scoring low on its form and the
   current bonk executor scoring low on its energy, both from watched trials. Build nothing else
   first.
2. **Feasibility.** Search an overhead blow with its channels pushed free (shoulder, elbow,
   wrist and trunk, the wrist cocked in the chamber, the elbow straight by contact), scored on
   energy under the form tests. Its strongest blow sets the full-strength figure (90% of it). If
   that is under 75.5 J, tune the Warrior's arm and trunk speed for the result, the least factor
   that reaches it, and search again, before step 3.
3. **Native controller.** A chamber posture and a schedule of timed pushes, the wrist's cock
   and snap among them, CMA-searched on drill trials by the score at 120 and 480 Hz, the worse
   counting. Extend `swing.ts` where its contract fits; the bonk keeps its own Option and record.
   The gate before training: it lands some held-out places.
4. **Learned actor.** Train a residual actor over the schedule by the training recipe, from
   scratch, rewarded by the score, on drill trials at places the window admits. Choose
   checkpoints on development places; held-out places confirm.
5. **Widen.** One at a time, keeping the earlier cases in the mix: 480 Hz weighted with 120 Hz,
   the left hand, the buckler loadouts, the Warrior striking as it walks in, the opponent moving
   (carried past, then stepping in and out), the target in guard, and a miss (the target removed
   at commitment) that still follows through and returns to guard without falling.
6. **Option Mind.** Register the bonk as its own Option with the head as its target, read its
   profiles, and watch Option Mind choose and land it in the Arena.
7. **Confirm.** Held-out places at both rates, each hand and loadout, the opponent still and
   moving, the Warrior standing and walking in: at least 90% land, none falls. Watch the reel,
   failures first, at normal speed and slow motion, and send the drill link with what was seen.

## Where it stands

Steps 1 to 3 are done; step 4 has no trained actor yet.

- **The native swing** (the record, with its footing) lands 29 of 30 held-out still places at
  120 Hz and 29 of 30 at 480 Hz, none falling; the miss at both rates (gap 0.955, across 0.2) is
  never admitted. Mirrored to the left hand (`swing-drill.mjs --verify --hands left`) it meets
  every form test at gap 1.1, 102 J at across −0.1 and 72 J at 0.
- **On the widening rungs** (right hand, `empty,club`, no steer, every condition,
  `punch-policy-check.mjs --all`), landed:

  | Rung | 120 Hz | 480 Hz |
  | --- | --- | --- |
  | `walk`, settled | 8/16 | 14/16 |
  | `walk`, walking | 8/16 | 16/16 |
  | `moving` | 4/18, one fall | 5/18 |
  | `stepping` | 0/3 | 0/3 |
  | `guarding` | 2/3 | 2/3 |

  A walk-in at 120 Hz mostly meets the head with the shaft before the swell, at 88 to 115 J; a
  moving target is struck where it stood at commitment. These are the steer's cases.
- **Outside the swing**: a settled walk-in from 2.4 to 3 m is never asked, its legs stepping in
  place for 5 s after they arrive; against `stepping` the striker is never admitted.
- **The training environment** (`research/skills/strikes/swing/environments/bonk.json`) reads each
  trial as the swing lets go (`releasedScore`, `onward: false`); with zero steer its pooled
  episodes at 120 Hz land 82%, and each reads as the trial played to its end does. The
  development baseline at 120 Hz, the held-out half: still places 29/30, `walk` walking 4/10,
  `moving` 2/9.
- **It trains too slowly to judge**: 100 decisions/s against the recipe's 370. The steered
  swing's learner starts as the swing begins, so a pooled episode's first decision holds the
  windup (the feet set, then the stance settles: 1.6 s, about 190 world steps at 120 Hz), and the
  trainer's 80 environments, stepped together, wait on it. The next change: the environment
  answers that first request itself, with no steer, and plays the windup in its idle time, so an
  episode the trainer sees begins at commitment.
- **Exploration**: at the trainer's default spread (`--log-std -1`) 7.5% of episodes land, at
  −2.5 37%, at −3 about half: the steer adds to an open-loop swing's pushes, so its run starts
  at −3 or lower.
- **On the drill page** the native bonk is recorded on the `bonk` rung as subject
  `option-bonk@empty,club` (`?play=ratings&evaluation=strike&subject=option-bonk@empty,club`):
  8 of the rung's 16 fixed places land at 87 to 112 J, 3 are weak (64 and 68 J at gap 1.1 to
  1.3 m, and 12 J with the arm bent at gap 0.6 m), 5 at gap 0.9 m or nearer are never admitted,
  none falls. Option Mind's
  preset has no bonk Option yet, so `option/bonk` does not resolve; the subject is a file holding
  the preset with the bonk's Option added (`owning` in `research/case-learning-environment.mjs`),
  `{ mind, skill: "bonk", held: { left: "empty", right: "club" } }`, given to
  `npm run evaluate -- strike <file> --protocol bonk --write`.

- **In the Arena** Option Mind offers the bonk (`src/entrants/option/mind.ts`) as its only club
  blow, priced by its profile from that record (`research/skills/strikes/strike-profiles.mjs`);
  the club blow is experimental, a drill opponent's. In a minute's Warrior bout, both holding
  `empty,club` (Node, `Duel` on a flat floor, seed 2), each side finishes 5 bonks and lets 8 to
  17 go before they commit; the left one punches 3 times. The left side falls once a bout while
  it walks to the bonk's window ("braced to bonk hand.right's window"), the range opening from
  1.0 to 1.7 m in 0.2 s before it goes down; with the club blow in the bonk's place neither side
  fell. That fall is the defect to fix first.

To pick it up:

- **Screen the swing or a policy** on held-out places, every rung's condition with `--all`:
  `node research/skills/strikes/straight-punch/punch-policy-check.mjs --config research/skills/strikes/swing/environments/bonk.json --policy none --rates 120,480`
  (`--policy <run>/policy-<n>.json` for a checkpoint; `--config` a run's configuration to screen
  on its places).
- **Train** from a configuration naming the environment and its curriculum: `environment`
  `research/skills/strikes/swing/environments/bonk.json`, `workers` 20, `each` 4, `rates` `[120]`,
  and `places` the environment's `bonk` draw, `walk` where `{ mark: "high", hand: "right", start:
  "walking" }` and `moving` where `{ mark: "high", hand: "right" }`; run
  `research/run-train.py --config <it> --output .tmp/warrior-bonk/<run> --keywords released,short,down --log-std -3 --profile`.
  The trainer's default keywords are travel's and fail on this environment.

A shared change (the swing executor, the strike reader, a muscle's speed) is read on every skill
and body it touches, as [AGENTS.md](../../AGENTS.md#developing-skills-and-options) says: the club's
trunk blow, the sword cut, the punch, stand-up and travel. Work goes under `.tmp/warrior-bonk/`.

## Completion

The confirmation reading meets step 7, Option Mind uses the bonk in the Arena, and the owner has
watched the reel and accepts the rung. The motion's reading goes into reference documentation;
the code and reference this plan replaced are gone, and this plan is deleted.
