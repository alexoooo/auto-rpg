# Minds and skills: one way to command a core body

2026-09-30. Part of [the core foundation](2026-09-28-core-foundation.md): it brings stage 6's
"a mind drives the core body through goals" forward, onto the lab, before the arena.

**The owner's ask (2026-09-30):** the lab's scenarios are driven by a mind, the way an AI would
command a body. The Run is commands to move at top speed; the Routine and the Blow use attack
commands for their hands, and the body throws the blow that fits what the hand holds. No
behaviour is built that a later phase throws away, and no searching is done on a path the game
will not use.

**The owner's decision (2026-09-30), strikes:** option A now, then B.
- **A:** a strike is a searched recipe (a chamber pose and timed muscle pushes, `Strike`), stored
  per body, per weapon and per hand, and valid from the start it was searched from: standing in
  guard. The skill aims it with the feet: it walks the body to where the target is at the recipe's
  distance, stands, and throws. The repertoire stays small: today's searched straights and the
  damage unit's club blow.
- **B, next:** a strike is a hand goal (the knuckles or the club's swell at a place, at a speed, at
  a time), which motor control learns to meet with the arm, the trunk and the legs together. The
  strike search moves to B's form; a recipe stays wherever it beats B's strike.
- The mind's command does not change between A and B: it says "attack that", and the skill chooses
  how.

## The layers

1. **The mind** (`src/core/mind/`) sees its body and what it is aimed at, and each control step
   returns an `Intent`: how to move (a velocity across the ground, capped at the body's fastest
   walk), which way to face, and for each hand an action (guard, or attack a point). It never names
   a joint, a pose or a push. A person's keys are one mind (the player's adapter); a scenario's
   script is another; the arena's AI will be a third.
2. **The skills** (`src/core/skills/`) turn an intent into the one `BodyCommand` a body takes
   (`src/core/body.ts`), and report their state back (`SkillReport`: where a strike is, whether
   the body is walking to its range, whether it has fallen), which the mind reads next step.
   - **Locomotion:** the legs under the stance (`stanceLegs`, moved from the lab), the heading
     turned toward the intent's no faster than the body's envelope turns at its pace
     (`turnAt`), not at all for `TURN_LEAD` after it sets off, and the pace capped at the
     envelope's walk.
   - **Strike:** chooses the recipe from what the hand holds; walks the body toward where its feet
     must stand for the target to be in the recipe's window, and sets them there
     (`Locomotion.place`); stands `STAND` seconds; throws the chamber and the pushes. While it works it
     owns the legs and the trunk; the other hand guards.
   - **Guard:** the arms' posture when nothing owns them.
3. **Motor control** (unchanged): the stance solves the legs through the whole body's dynamics,
   and the servo the rest around the pushes. Balancing a blow is the stance's, as it is today.

**Coordination.** The mind states every part's action at once. The skills arbitrate: a strike
outranks moving (a recipe is valid only from standing), and one strike is thrown at a time, the
other hand guarding. Motor control coordinates the physics.

## Where things go

| Now | Becomes |
|---|---|
| `src/core-lab/legs.ts` (`stanceLegs`, `STANCE_LOWER`) | `src/core/skills/locomotion.ts` |
| `GUARD`, `SERVO_SECONDS`, `TURN_LEAD` in `src/core-lab/routine.ts` | `src/core/skills/` |
| `throwBlow`'s stand, chamber and pushes (`src/core-lab/blow.ts`) | the strike skill; `throwBlow` becomes a one-attack mind on it |
| The searched straights (`.review/rapier/fist-rapier-*-guard-*.txt`) and the unit blow (`research/core-club-unit.json`) | `assets/core/strikes.json`, written by `research/core-strike-repertoire.mjs` |
| The Run's driver (`run-mode.ts`) | a track-following mind: toward the aim, at the pace the bend allows |
| The Routine's driver (`routine.ts`), hand-set straights and a set step | a scripted mind: walk out, attack a post three times, turn, walk back |
| The Stance scenario's driver (`stance-mode.ts`) | the keys as a mind's intent; the shove stays the page's instrument |
| The strike searches (`research/core-strike.mjs`, `core-club-strike.mjs`) | throw each candidate through the strike skill, a candidate being a repertoire override |

## Steps

Each step lands on its own, with the gates green.

1. **The intent, the mind and the skills, with locomotion.** The Run becomes a mind. Acceptance:
   the new Run gives the same world, to the bit, as the old driver over 20 s of each human (Node
   stand, 120 Hz), before the old driver is deleted.
2. **The strike skill and the repertoire.** The Blow becomes a mind attacking the head; the
   searches throw through the skill. Acceptance: the unit blow's reading is the same to the bit
   as `throwBlow`'s (`tests/core-lab-blow.test.mjs`), and a fist search of one generation gives
   the same scores as before.
   *Landed 2026-09-30:* the same to the digit (Node core stand, Rapier): eight blows at 120 and
   480 Hz (both humans' searched straights, a third seed's, the unit club blow), and a fist search
   of one generation from the Warrior's straight (best 8.11 m/s, three hitting). A recipe is
   thrown once the head has stood `STAND` s: the head settles 3 to 6 cm from where it was built, so
   the Blow reads its target from the head until then, as the searches do.
3. **The Routine as a mind.** Its straights become the searched ones, left mirrored from right
   (the channels' sides swapped and the trunk's turns reversed); the set step goes (it does not
   converge with the rate, `blow.ts`). Acceptance: measured, not matched: each strike's fist
   speed at 120 and 480 Hz against the recipe's own reading, how far from the recipe's range the
   body stood, and whether the loop holds its feet over ten loops of each human.
   *Landed 2026-09-30.* The Routine is `routineMind`: the Run's track mind out and back, and at the
   post an attack with each hand in turn, which the strike skill carries out. Measured with
   `research/core-routine-battery.mjs` (Node core stand, Rapier; 6 starts pushed 3 N s, 10 loops
   each): each human held all 60 loops at 120 and at 480 Hz, and every strike stood inside its
   window. Peak fist speed, mean (least), m/s, right and left:

   | | 120 Hz | 480 Hz | recipe's searched peak, 120 / 480 |
   |---|---|---|---|
   | Warrior | 10.10 (9.81), 10.47 (10.40) | 11.50 (10.81), 11.52 (10.96) | 9.28 / 10.84 |
   | Rogue | 11.29 (10.75), 11.09 (10.33) | 11.87 (11.26), 12.09 (11.63) | 7.95 / 8.64 |

   The Routine reads its peak in the air, to the pushes' end; the search's is to the landing, so
   the columns are not like for like. Where the head stood from each recipe's place, cm: the
   Warrior -1 to 7 along, and for its right straight 0 to 8 to the left of it; the Rogue -8 to -5
   along, and 3 to 4 to the right; the left hand's mirrored. Found on the way:
   - **A recipe lands over a window, not at a point** (`Recipe.window`,
     `research/core-strike-window.mjs`: where it still lands at 95 % of its reading at 120 and
     480 Hz). The Warrior's straight: -2 to 8 cm along, 14 cm to 0 across, to its left; the Rogue's
     -8 to 2 and -2 to 8; the club blow -2 to 8 and -4 to 0. The Warrior's straight misses a target
     4 cm nearer, the fist starting inside it. The club blow lands harder 6-8 cm further out than
     its place (131.7 J against 119.45 at 120 Hz): the damage unit was not thrown from its best
     distance.
   - **A walk does not stand a body where it stops.** Stopped, the stance steps a foot out from
     the gait's 20 cm to the 39 cm it was built at, which moves the body 10 cm sideways, and the
     body walked round and round the post trying to stand in range. The skill now chooses where the
     feet stand for the target to be mid-window, and sets them there (`Locomotion.place`).
   - **The envelope does not cover setting off into a turn.** Its turns were measured on a walk
     under way; a second after setting off from standing the walk is not (0.1 m/s). At the Rogue's
     fastest walk it fell in every run's second loop setting off from the post into the half-turn,
     and at 0.3 m/s and the envelope's 4 rad/s the Warrior pivoted half round where it stood and
     ran away sideways, 1 run in 6 at each rate. The Routine walks and turns at 0.3 m/s and 1 rad/s
     (`ROUTINE_GAIT`). Standing still after each strike before setting off changed nothing (60 of
     60 loops each way at both rates). A turn from standing is for the envelope to measure.
4. **The Stance scenario through the player's intent.** Acceptance: the lab test's walks and
   shoves read as before.
5. **Option B**, planned when 1-4 are in: speed goals for a hand, then the strike search in their
   form.

## Not in this plan

- Attacking a moving body, blocking, and the arena's mind: stage 6.
- A strike while walking: B's.
