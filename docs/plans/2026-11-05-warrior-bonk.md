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
| Full strength | The contact's energy is at least 90% of the strongest blow step 2 finds that meets every other test, and at least 75.5 J, the mean of an untrained adult's one-handed blow with a crutch (Frantz, Sprenger & Jackowski 2026; the held-blow bar, `Bar.held.energy`, 64.8 J, is that less one SD). On another body both scale by `pairShare`. |
| Back to guard | The hand and club return to guard and settle, as the drill's existing return reading measures. |
| Upright | No fall through the trial and its settle. |

The wrist may cock during the chamber and snap through the stroke: that whip is where a club's
speed comes from, and "one stroke" reads the shaft's swing, not each joint; the elbow is straight
by contact. These tests are frozen once step 1's reader shows them, the full-strength figure once
step 2 sets it; a candidate short of them goes back to development, the tests stay.

## Where it starts

- **The bonk executor** (`src/skills/strikes/bonk.ts`, `bonk-course.ts`, `bonk-part.ts`; the
  [course reference](../reference/bonk.md)) tracks a rigid-arm course with the elbow and wrist
  fixed, on the path servo. Its strongest swell-on-head contact is under 5 J, and by estimate its
  course carries the swell at about 6 m/s, near 20 J. It is a seed only if step 3 finds it
  succeeds on some cases; otherwise it is deleted with its reference.
- **The bonk reader** (`src/evaluation/strike/bonk-read.ts`, `bonk-fixture.ts`, the
  `bonk-reference` protocol) judges about thirty pass/fail limits and ranks nothing. Its geometry
  (the swell's collider, contact identity, clearance) is reused by step 1's reader; its gate
  structure and fixtures for later cases are deleted unless step 5 uses them.
- **The club swing** (`src/skills/strikes/swing.ts`, searched by
  `research/skills/strikes/swing/swing-drill.mjs`) is a windup posture with timed pushes. It
  struck the trunk at 54.6 J while flailing, so the body can reach the bar; its form is the
  problem.
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

A shared change (the swing executor, the strike reader, a muscle's speed) is read on every skill
and body it touches, as [AGENTS.md](../../AGENTS.md#developing-skills-and-options) says: the club's
trunk blow, the sword cut, the punch, stand-up and travel. Work goes under `.tmp/warrior-bonk/`.

## Completion

The confirmation reading meets step 7, Option Mind uses the bonk in the Arena, and the owner has
watched the reel and accepts the rung. The motion's reading goes into reference documentation;
the code and reference this plan replaced are gone, and this plan is deleted.
