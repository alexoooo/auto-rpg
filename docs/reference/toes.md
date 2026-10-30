# Toes that bend

A foot may have toes (`ToesSpec`, `src/core/build/toes.ts`). Its box runs from the heel to the
ball, and the toes are a thin slab ahead of it, hinged at the box's bottom front edge. Each step,
the slab bends toward the foot's top as far as the foot is tipped heel-up, up to a right angle, so
it lies along the ground. The foot's box never changes. The toes are a contact region of the foot
and carry no mass.

With the ankle's dorsiflexion stop at 0.8 rad, this is what lets the Warrior stand up from hands
and knees on its toes. Every humanoid has them, with no setting to take them away (the owner,
2026-10-30: a body cannot stand up well without them; `toedFigure`, `src/core/human/toes.ts`):
0.06 m long at size 1, scaled with size, 0.025 m thick, ending at the boot's toe, the foot's box
cut short by them, and the toed ankle's stop at 0.8 rad past the reference pose (`owner-toes`).
The game's Stand up rises on them (`STAND_UP`); step-up, flat-footed, stands none of the target's
64 falls on them ([below](#on-the-game-bodies)), and the run does not hold forward on them.

What depends on the foot is read under the body's key (`bodyKey`, `src/core/spec/body.ts`), the
model and `+toes`: the walk's envelopes, the ground techniques' profiles, the learned punch's
settings and the searched strikes. Step-up is tuned by model alone, so a toed body plays the flat
foot's stages.

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

The stand-up harness (`research/stand-controller/c/sitback.mjs`, its settings `BASE` and `NOW` in
`c/.runvar.sh`, the foot `dorsi0.8+toe0.06` of `bodies.mjs`; read at commit 20ea40e6, its first
row replayed at the sit-back's commit; Node, `rapier` engine, 120 Hz), the workshop fighter
empty-handed, dorsiflexion stop 0.8 rad, toes 0.06 m long and 0.025 m thick. It starts from the
game's hands and knees and runs plant, sit back, watched rise, handover to the stance, then a
closing step. 32 starts, unassisted, timed to the standing check; read with the stance's foot
reading of flat toes (`fitSole`), which moves none of these figures.

| Foot | Stood (all within 6 s) | Median, s | Worst stood, s |
| --- | --- | --- | --- |
| Toes that bend (`TOE_STEP` steps) | 30/32 | 3.98 | 5.25 |
| The box whole, no toes | 0/32 | – | – |
| Toes, but the game's ankle stop (0.36 rad) | 20/32 | 4.47 | 5.82 |

The two starts that fail with toes time out in the plant, before the stance takes over. The game's
rise from hands and knees is this one's simplest form ([the sit-back](rising.md#the-sit-back)). Neither
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

### On the game bodies

The Warrior and the Rogue with toes 0.06 m long, ending at the boot's toe, the box cut short by
them, 0.025 m thick, and toed ankles dorsiflexing to 0.8 rad past the reference pose; Node,
`rapier`, 120 Hz, at `5e7b28d0`. The shoves and shoved walks are `research/core-stance-sweep.mjs`
(`--batteries shove`; `--batteries orders --orders 0.5:1-120 --shoves 20`, the club in hand), the
stand-up `npm run evaluate -- rising-target step-up`.

| Foot | Shoves held, Warrior / Rogue, of 176 | Shoved walks fell, Warrior / Rogue, of 120 | Step-up stood, of 64 |
| --- | --- | --- | --- |
| Flat | 173 / 160 | 0 / 4 | 56 |
| Toes | 176 / 159 | 1 / 5 | 0 |
| Toes to the rig's ball (0.074 m) | 175 / 154 | 1 / 9 | – |

- **Step-up**: a foot it swings forward hangs its toes up at a right angle and lands on end on
  them, and its half kneel never gets the body over that foot. Its stages are timed by a search on
  the foot without toes; with toes the toes' bends tried below do not rescue it.
- **The learned punch** (`research/punch-policy-check.mjs`, seed 5001, 160 places): 141 of 160 at
  120 Hz and 128 at 480 Hz, against 155 and 140 without toes; none fell. The misses move from the
  fist's mass to its speed and straightness. That network was trained on the flat foot
  (`assets/core/learned-punch.json@f59b8a75`); the learned punch is now trained on the toed
  Warrior alone ([learned punch](learned-punch.md)).
- **The walk's envelopes** (`research/core-stance-envelope.mjs --toes`, at `2a7af07b`, the Warrior
  with each thing held; the walk and run calm and in the lab's gusts, seeds 1 to 4), m/s forward,
  right, back, left:

  | Walk | Toes | Without |
  | --- | --- | --- |
  | The stance's | 1.7, 0.7, 1.4, 0.7 | 1.7, 0.7, 1.2, 0.7 |
  | The walk and run | 0.7, 0.7, 1.5, 0.7 | 4.5, 0.7, 1.0, 0.7 |

  On toes the run does not hold forward: asked 2 or 3 m/s in calm air it falls, and asked 1 m/s it
  goes 1.8. A toed body's run is held to its envelope, so it gets about forward no faster than
  0.7 m/s while it may run. Its turns are its own (`turns` in `walk-run-envelope.json`), where a
  flat body reads the run's.
- **Fights** (`npm run match -- duellist options`, the standard protocol): the Duellist scores
  0.671 over 120 bouts with toes (match `295cf7a438bb68ea`), against 0.788 over 118 without
  (`c1ec7b0cefd3f3c8`); the Rogue's side loses most (Rogue against Warrior 0.586 to 0.417).
- **The Vanguard's support fold** sinks to 0.41 m under standing on the toed ankle, against 0.30 m
  on the 0.36 rad stop, where its low guard's hands rest on the thighs and settle anywhere within
  10 cm; asked for 0.30 m (`COMBAT_FOLD.lower`) it holds as before.
- **A limp body** stands on the 0.36 rad stop for a second and sags through the toed ankle's
  range in about two thirds of one.

## Tried and not kept

- **Toes that bend only as the ground pushes them**, rigid with the foot until their tips meet the
  floor (`b = max(0, tip - asin(h / L))`, h the hinge's height): a swinging foot hangs them
  straight, and step-up stands 13 of 64 on the game bodies. A foot coming down rests on the tips
  of its straight toes, its ball 6.6 cm up: the Recovery stand-up stands none of its 32 starts.
  Shoves held 176 / 166, shoved walks fell 0 / 8.
- **The same, yielding until the tips are 1 cm clear** (`b = min(tip, max(0, tip - asin((h -
  0.01) / L)))`): the Recovery stand-up 27 of 32 (median 4.00 s), step-up 1 of 64.

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
