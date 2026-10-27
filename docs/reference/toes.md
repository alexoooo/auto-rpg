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
- **Readers**: the stance reads the box, heel to ball, as the sole. The toes give support it does
  not count. The ground reading counts the toes as the foot (a region of it). Drawing and contact
  tracking read the segment's rigid body, which follows the bend.

### `TOE_STEP`

The bend is taken in steps of 0.02 rad (about 1.1°). A change restarts the toes' contacts, and each
step's shape and collider are made once and kept. This is solver bookkeeping, not anatomy: a step
small enough that the slab lies along the ground, and large enough that a foot at rest does not
rebuild its toes every step.

## Measurement

The hand-off study's stand-up harness (Node, `rapier` engine, 120 Hz), the workshop fighter
empty-handed, dorsiflexion stop 0.8 rad, toes 0.06 m long and 0.025 m thick. It starts from the
game's hands and knees and runs plant, sit back, watched rise, handover to the stance, then a
closing step. 32 starts, unassisted, timed to the standing check.

| Foot | Stood | Median, s | Worst, s |
| --- | --- | --- | --- |
| Toes that bend (`TOE_STEP` steps) | 32/32 | 3.29 | 5.88 |
| The box whole, no toes | 0/32 | – | – |
| Toes, but the game's ankle stop (0.36 rad) | 2/32 | – | – |

## Tried and not kept

- **A passive toe joint**: fails on the solver under load ([passive toes](man-passive-toes.md)).
- **Toes that switch on only when the foot tips** (from 0.6 to 1.0 rad), so a flat foot is the old
  box: median 4.2 to 4.3 s on the same 32 starts. The box grows and shrinks under load as a foot
  tips and comes down. Each change restarts the sole's contacts, the catch step lands wide, and a
  closing step follows on 18 of 32 starts against 10. Holding them out until the foot is flat
  again did not help (4.25 s).
- **Rebuilding the box whenever the toes turn**: the same contact restarts, median 4.14 s.
- **A sole and instep shaped as a foot**: no better than the box to the ball.
- **Dropping the toes at the handover**: the box grows back 4.4 cm into the floor and the solver
  kicks the foot.
