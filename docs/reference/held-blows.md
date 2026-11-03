# Held blows

The toed Warrior's club blow, cut and sword thrust read against the held blow's bar: 64.8 J of
the rules' energy, the cut 18.5 m/s at the blade's far end instead
([section 3](human-strike-reference.md#3-one-handed-sword-cut)), the thrust 4.6 m/s of its
point's closing speed ([section 3a](human-strike-reference.md#3a-one-handed-thrust-a-persons-stab)),
met with the item's face (the club blunt, the cut its edge, the thrust its point), at the mark
asked, the striker up ([what is required](../plans/2026-11-03-options-training.md#what-is-required),
`BAR.held`, `src/evaluation/strike/read.ts`). None reaches it on the still rung: of the Warrior's
16 right-hand trials at the middle mark, the club lands none, the cut one and the thrust three
([on the still rung](#on-the-still-rung)). The Rogue and the Skeleton hold no record of any of the
three, so their trials are refused.

## What is used

- **The club blow and the cut are swings** (`swingExecutor`, `src/core/skills/strikes/swing.ts`;
  `SWINGS`, `swing-part.ts`): from where its window admits it, the trunk and the striking arm wind
  up to the record's angles (`Swing.wound`), each wound channel counted there once within
  `WOUND_WITHIN` (0.1 rad) of its angle or turning slower than `WOUND_STILL` (0.5 rad/s), as near
  as the muscles hold it against the item's weight; the stance stands quiet `settle` s; then each
  channel the schedule names is pushed flat out over its own window (`TimedPush`), the rest held
  wound, and the arm comes back to the guard. The face is the item's (`faceOf`): the club's swell
  meeting the target along the hand's length, the cut's `edge.right` along the edge's direction.
- **The wrist is servoed** (`faceAligner`, `face-aligner.ts`): each step asks the wrist's three
  freedoms the damped least-squares turn that brings the face's facing onto a way: the cut's
  through its stroke, once the edge moves faster than `ALIGN_SPEED` (1 m/s, `swing.ts`), onto its
  path, either edge leading; the thrust's from its chamber through its drive onto the line from
  the point to the target, point first. The schedule's wrist pushes are dropped.
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

### On the still rung

`npm run evaluate -- strike option/<blow>@buckler,<item> --protocol still --write` at b04deb43,
the thrust's at aaf4d013: Node, the bout world, Rapier, 120 Hz, each record's settings as the core
reads them. The 16 trials
of the Warrior's right hand at the middle mark (gaps 0.6 to 1.3 m, square on and 0.2 m across);
the high mark, the left hand (the buckler's) and the Rogue (no record) are refused.

| Blow | Landed | Otherwise | Record |
| --- | --- | --- | --- |
| club | 0 | 15 missed, 1 outside | `assets/evaluations/strike/2026-11-03T133555-b04deb43-1bc383da.jsonl` |
| cut | 1 | 7 guarded, 5 missed, 1 weak, 1 outside, 1 refused | `assets/evaluations/strike/2026-11-03T133034-b04deb43-1314046a.jsonl` |
| thrust | 3 | 10 weak, 1 elsewhere, 1 missed, 1 refused | `assets/evaluations/strike/2026-11-03T140109-aaf4d013-43dbc322.jsonl` |

The thrust's record is its kept search's best ([searches stopped](#searches-stopped)); the schedule
before it landed 1 (9 guarded, 6 missed,
`assets/evaluations/strike/2026-11-03T133535-b04deb43-f0482724.jsonl`). Its 10 weak trials meet the
trunk at 4.4 to 9.6 m/s, 8 of them blunt, the point not the face that met, and 2 point
first but short of 4.6 m/s closing.

What fails is when and where the blow is thrown, not its speed. The drill orders it once the body
has walked into its window and settled there (`settledAt`, `src/core/command/drill.ts`), and the
body drifts in the window at about 0.1 m/s: read again at 56b007f0 (`drillTrial`,
`research/punch-drill.mjs`), 13 of the club's 15 swings commit 4 to 8.3 s in, and every one passes
0.24 to 0.37 m short of the mark, the two committed at 1.23 s as well. Neither the buckler's ward
nor its lead moves this: with the ward's lead off, 0 land (1 weak); with no ward, 0 land (9 guarded).

### Searches stopped

Three searches ran on 8b2fee9e, a base without main's walk into a window or the ward's lead, each
from two gaps at 120 and 480 Hz on the Warrior: the club and the cut from 1 and 1.4 m, the thrust
from 1.2 and 1.5 m. They were stopped unfinished, because what fails at main is the commit's
timing above, which the swing's settings do not reach:

- **The club** (from the arm's free ceiling, with the trunk's side bend): 36 generations; the best
  meets the upper trunk with the head in all four trials, the weakest 59.3 J against 64.8 J.
- **The cut** (the wrist servo pushing its turn): 25 generations; the best meets with no edge.
- **The thrust** (drawn back, the wrist servo setting the point): 31 generations; the best lands
  all four, point first, the weakest 7.3 m/s and 25.2 J (480 Hz, 1.5 m); its search is
  `research/sword-thrust-search.json` (`research/punch-drill.mjs --verify`), and its best the
  thrust's record.

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
