# Toes that bend

A foot may have toes (`ToesSpec`, `src/core/build/toes.ts`). Its box runs from the heel to the
ball, and the toes are a thin slab ahead of it, hinged at the box's bottom front edge. Each step,
the slab bends toward the foot's top as far as the foot is tipped heel-up, up to a right angle, so
it lies along the ground. The foot's box never changes. The toes are a contact region of the foot
and carry no mass.

With the ankle's dorsiflexion stop at 0.8 rad, this is what lets the Warrior stand up from hands
and knees on its toes. No body in the game has toes yet.

## What is used

- **The slab**: the box's width, `length` ahead of the ball, `thickness` up from the sole. It is
  no longer than the box is high, so at a right angle it lies along the box's front.
- **The bend**: the foot's tip heel-up, from flat to a right angle. It is scaled by how upright the
  foot's own plane stands, so a foot rolled onto its side has flat toes: its tip there has no
  ground to lie along.
- **Readers**: the stance reads the sole from the heel to the toes' tips while those tips, read
  rigid with the foot, are no more than `DOWN` (0.03 m) over the ball, the height at which it
  counts an end of a sole down: for 0.06 m toes, a bend up to 30°. Bent further, it reads the sole
  from the heel to the ball (`soleCorners`, `fitSole`, `src/core/control/support.ts`). A foot
  standing flat is read as the whole foot was before it had toes. The ground reading counts the
  toes as the foot (a region of it). Drawing and contact tracking read the segment's rigid body,
  which follows the bend.

### `TOE_STEP`

The bend is taken in steps of 0.02 rad (about 1.1°). A change restarts the toes' contacts, and each
step's shape and collider are made once and kept. This is solver bookkeeping, not anatomy: a step
small enough that the slab lies along the ground, and large enough that a foot at rest does not
rebuild its toes every step.

## Measurement

The hand-off study's stand-up harness (Node, `rapier` engine, 120 Hz), the workshop fighter
empty-handed, dorsiflexion stop 0.8 rad, toes 0.06 m long and 0.025 m thick. It starts from the
game's hands and knees and runs plant, sit back, watched rise, handover to the stance, then a
closing step. 32 starts, unassisted, timed to the standing check; read with the stance's foot
reading of flat toes (`fitSole`), which moves none of these figures.

| Foot | Stood (all within 6 s) | Median, s | Worst stood, s |
| --- | --- | --- | --- |
| Toes that bend (`TOE_STEP` steps) | 30/32 | 3.98 | 5.25 |
| The box whole, no toes | 0/32 | – | – |
| Toes, but the game's ankle stop (0.36 rad) | 20/32 | 4.47 | 5.82 |

The two starts that fail with toes time out in the plant, before the stance takes over. Neither
a bend step a quarter as large (0.005 rad: 30/32, 4.09 s) nor toes that ignore the foot's roll
(30/32, 3.98 s) changes this.

Walking, the core stance sweep (`research/core-stance-sweep.mjs`, Node stand, `rapier`, 120 Hz),
the workshop fighter, toes 0.06 m: the shove battery (176 shoves), and 40 walks of order 0.5
shoved at 20 N s (seeds 1 to 40).

| Foot | Shoves held | Least held, N s | Shoved walks fell | Catch steps a walk |
| --- | --- | --- | --- | --- |
| The game's (no toes) | 173/176 | 20 | 0/40 | 1.50 |
| Toes, the stance reading them while within `DOWN` | 172/176 | 30 | 1/40 | 1.82 |
| The same, and the dorsiflexion stop 0.8 rad | 176/176 | 60 | 0/40 | 2.58 |

## Tried and not kept

- **A passive toe joint**: fails on the solver under load ([passive toes](man-passive-toes.md)).
- **Toes that switch on only when the foot tips** (from 0.6 to 1.0 rad), so a flat foot is the old
  box: median 4.2 to 4.3 s on the same 32 starts. The box grows and shrinks under load as a foot
  tips and comes down. Each change restarts the sole's contacts, the catch step lands wide, and a
  closing step follows on 18 of 32 starts against 10. Holding them out until the foot is flat
  again did not help (4.25 s).
- **Rebuilding the box whenever the toes turn**: the same contact restarts, median 4.14 s.
- **The stance reading the toes only while they lie exactly flat** (bend 0): a standing foot tips
  past a half step, so the stance reads the sole short; shoved walks take 2.77 catch steps against
  1.50. Reading them always: 1.80, but a foot on end reads its toes' tips in the air.
- **The stance never reading the toes** (heel to ball): 2.70 catch steps.
- **A sole and instep shaped as a foot**: no better than the box to the ball.
- **Dropping the toes at the handover**: the box grows back 4.4 cm into the floor and the solver
  kicks the foot.
