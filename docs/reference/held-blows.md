# Held blows

The toed Warrior's club blow, cut and sword thrust read against the held blow's bar: 64.8 J of
the rules' energy, the cut 18.5 m/s at the blade's far end instead
([section 3](human-strike-reference.md#3-one-handed-sword-cut)), the thrust 4.6 m/s of its
point's closing speed ([section 3a](human-strike-reference.md#3a-one-handed-thrust-a-persons-stab)),
met with the item's face (the club blunt, the cut its edge, the thrust its point), at the mark
asked, the striker up ([the bars](../plans/2026-11-01-option-mind-everywhere.md#the-bars),
`BAR.held`, `src/evaluation/strike/read.ts`). The club, swung, lands 5 of 12 held-out trials and
meets the trunk with its head in every one, 29 to 99 J: near the bar, not at it. The cut and the
thrust do not reach it.

## What is used

- **The club blow and the cut are swings** (`swingExecutor`, `src/core/skills/strikes/swing.ts`;
  `SWINGS`, `swing-part.ts`): from where its window admits it, the trunk and the striking arm wind
  up to the record's angles (`Swing.wound`), each wound channel counted there once within
  `WOUND_WITHIN` (0.1 rad) of its angle or turning slower than `WOUND_STILL` (0.5 rad/s), as near
  as the muscles hold it against the item's weight; the stance stands quiet `settle` s; then each
  channel the schedule names is pushed flat out over its own window (`TimedPush`), the rest held
  wound, and the arm comes back to the guard. The face is the item's (`faceOf`): the club's swell
  meeting the target along the hand's length, the cut's `edge.right` along the edge's direction.
- **The thrust is driven**: the straight punch's whole-body drive (`straightPunchExecutor`) thrown
  with the blade's `tip` along the blade. The arm's contact pose is solved with two points of the
  hand (`solveReach`): the striking point on the line from the shoulder, and a point `FACE_LEVER`
  (0.3 m) behind it against its facing, so the point meets the target along that line. A held
  face's arm is solved from its guard each step, so a chamber that draws the arm back (a negative
  `chamber`) leaves one contact pose to drive at.
- **The records**: `assets/core/club-blow.json`, `cut.json`, `sword-thrust.json`. The club's, the
  toed Warrior's, is its searched swing ([the club swing](#the-club-swing)), admitted with the head
  0.49 m from the target across the ground (`reach`), 0.15 m deeper at most (`band`) and 0.15 m to
  either side (`aside`); the cut's, the toed Warrior's, is the best swing found, short of the bar
  ([the cut](#the-cut)); the thrust's is its searched schedule with no network.
- **What the drill reads**: a held blow lands only where the rules read its contact with the
  mechanism its part meets with (`ExecutorPart.meets`, `StrikeHit.faced`); a blow met otherwise is
  `weak`, whatever its energy.

## Measurement

`research/swing-drill.mjs --blow <kind>`: Option Mind's swing on the Strike drill's still rung,
the Warrior's right hand holding the item and the left the buckler, at the middle mark. Searched by
CMA-ES: each of eleven channels' windup (a share of its range, 5 % in from either stop) and push
(a level, a start and a length), the stand-off and the settle. The window is the record's (band
and aside 0.15 m): the drill walks the body into it from where the trial starts, as a game does. A
candidate is played from each starting gap at 120 and 480 Hz, the worse rate counting at each gap
and the gaps' mean overall (`barScore`: landed 9 and up; else up to 8, half the share of the
bar, half for meeting with the face); a touch before the swing commits, the windup's, counts as
no hit. Node, the bout world, Rapier, at 70f89646 with the swing.

### The club swing

From the arm's free ceiling (the Warrior pinned at the lower trunk, the short sword's tip at 37.8
m/s), searched over 1.0 and 1.4 m starts at both rates: 3 generations of 12 landed all four, 73 J the
least. Held out (starts 0.9, 1.2 and 1.6 m, square on and 0.15 m across):

| Start, across | 120 Hz | 480 Hz |
| --- | --- | --- |
| 0.9 m, 0 | 29 J | 63 J |
| 1.2 m, 0 | 60 J | **landed**, 74 J |
| 1.6 m, 0 | 58 J | **landed**, 92 J |
| 0.9 m, 0.15 | **landed**, 92 J | **landed**, 99 J |
| 1.2 m, 0.15 | 36 J | 61 J |
| 1.6 m, 0.15 | 1 J | **landed**, 82 J |

Every trial meets the upper trunk with the club's head, 0.25 s into the swing; what moves the
energy is where in its window the walk leaves the body.

### The cut

On the drill at 120 Hz alone, from one gap, the cut landed edge first at 24.1 m/s at the far end
(19 m/s closing, 47 J) 0.46 s into the swing; at 480 Hz the same arc met the target's guarding left
hand at 20 m/s and was turned. Searched over both rates and two starts it lands nothing: at 120 Hz
it meets the trunk with the flat at 12 to 14 m/s, at 480 Hz the guard or elsewhere. Searched
with the windup reached before the swing commits (10 generations of 12), every trial meets the
trunk at 20.5 m/s or more at the far end, but with the flat: its record, `weak` on the drill.

### The thrust

The thrust meets with the arm behind its point, 4.4 to 4.8 kg, but slowly: the best of 80
generations drawn back (`--chamber`, the point set on the line before the drive) met the middle
trunk point first at 3.5 m/s closing, 25.4 J at 120 Hz and 27.6 J at 480. Without the chamber
(20 generations) the point came down across the target, 7.7 to 9.8 m/s but 1.2 to 1.9 m/s
closing. The grip lays the blade square to the hand's length, so the arm holds it along the line
only with the wrist near its stops.

Steered by PPO on `research/environments/sword-thrust.json` (the searched schedule, its record's
window), it lands none of 60 held-out trials at either rate after 0.59 M decisions (the closest 4.9
m/s) or after 1.08 M (0.98 M before each body was born on its first decision, 0.1 M after; the
closest 4.6 m/s, with the edge, and 4.4 m/s with the point). Training met the target in 1 % of
episodes or fewer throughout, so the network is not kept.

## Tried and not kept

- **The club and the cut thrown as the punch's drive** (`straightPunchExecutor` with the item's
  face): not how either is used, so they are swings. Drawn back and steered by PPO, the club drive
  landed 183 and 187 of 200 held-out trials at 120 and 480 Hz, a fall in about a hundred, but
  11 of 15 on the ladder's still rung and 9 of 29 after a walk in
  (`assets/core/club-blow.json@4c0e1d89`, `research/environments/club-blow.json@4c0e1d89`). The cut
  drive met the edge at 10.2 m/s closing, 0.40 kg behind it.
- **A swing searched from one gap at 120 Hz**: the club landed at 87 to 94 J from 0.99 m and
  missed 4 cm nearer or further and at 480 Hz; the cut landed there alone.
- **The swing admitted at any range past its stand-off** (a 2 m `band`): the drill walks a body to
  its window's middle, so at some gaps the body backed off 0.5 m before it swung. The window is
  the record's.
- **A window 0.08 m deep**: from 1.0 m the walk never settled the body in it.
- **The toed Rogue's club drive**: searched from the Warrior's, 2 of 24 landed unsteered; steered
  by PPO, none from the Warrior's network and 2 to 9 % from scratch over 5.4 M decisions.
- **Faster or stronger arms for the club drive**: no faster at the target.
- **The thrust drawn back nearer the target** (`--chamber --chamber-range 0.3,0.75`): 4.76 at 33
  generations, under the thrust's 5.57.
