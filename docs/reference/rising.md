# Down, and getting up

The records the core's reading of a fall, and what a body does after one, are measured against.

## Down

A body is down while its centre of mass is more than `FALLEN`, 0.25 m, under the height it is
asked to hold (`uprightness`, `src/core/control/ground.ts`). The bar is set, not swept: it is the
one the stance's batteries count a fall by (`stance-tuning.md#fallen`).

- **The height is over the body's lowest point**: the least over every segment's shape, a
  capsule's ends and a sphere's centre less the radius, a box's corners, a hull's points. The
  ground is level, and a body on it touches it there. The soles' middles, which the stance
  measures its own height from, are not on the ground once a body lies, so a height over them says
  nothing of a lying body. What a hand holds weighs in the centre of mass, and is not a point the
  body lies on.
- **The height asked is the stance goal's** (`MotorControl.standing`), and no more than the body's
  standing height by its spec: a body asked to stand taller than it can is not down for failing
  to. A body with no stance goal is read against its standing height. So a body held low on
  purpose is not down for it: a crouch, a kneel or a roll asks its own height.
- **It is a reading, not a memory**: taken from the body at every step (`BodyView.down`), true
  while the body is down and false once it is up again. A fight, a page and a test read the one
  view, so none can disagree with the body's mind about it.

The standing heights by their specs, m: Warrior 1.0145 (1.0174 with the wooden club in its right
hand), Rogue 0.9098, skeleton 0.8824. Node stand (`tests/harness/core-stand.mjs`), Rapier,
120 Hz: built on the ground each is within 1 mm of its centre of mass's height over the ground,
and lying limp within 5 mm of it (a lying body rests 2 to 3 mm into the ground).

Against the reading it replaced (the centre of mass over the soles' middles, kept once true), a
bout that ends by a fall ends 0.05 to 0.6 s later, and is the same bout to the bit until the step
it used to end at (`bouts.md#down-read-from-the-body`).

## Battery

The falls a riser is measured on (`research/core-rise-trials.mjs`), and their table
(`research/core-rise.mjs`). Harness: Node, the core world (`src/core/world.ts`), Rapier, 120 Hz,
each fall in a world of its own with the arena's solids.

```powershell
node research/core-rise.mjs --workers 14
```

- **A shove** (`shoved`): a body built as the arena builds one, ordered to stand in guard
  (`STAND_ORDERS`), is shoved after 1 s at its middle trunk's centre by 1.5 N s for each kilogram
  of the whole body, across the ground. Sixteen shoves, 22.5 degrees apart about up, for each
  model with the wooden club in its right hand and with nothing (`LOADOUTS`). It fell if it is
  down within 3 s; a shove it holds is counted and left out of the rates.
- **A bout's fall** (`boutFall`): each of the arena's nine matchups at 4 m is played to the first
  step a side is down; the other side is then ordered to stand. A bout nobody falls in is counted
  and left out.
- **The watch**: 15 s from the fall (`WATCH_SECONDS`). A body has risen at the start of the first
  2 s it is up running (`UP_SECONDS`, `risenAt`): up for less and down again is not a rise.

The columns: how many falls of how many trials; how many of those rose; the median seconds from
the fall to the rise; the median, over the falls, of the fastest any segment's centre of mass
moved from 1 s after the fall to the watch's end, m/s (how much it thrashes); and the most the
stance asked of the ground beyond what its soles gave over the same span, in the body's weights
(`StanceReading.shortfall`; `inf` once its size is past what a number holds).

## Driven

The game as it is: a body that is down is driven on by its stance, which bears on soles that are
not under it. Every character's balance is 0, so no assist answers the ask.

| falls | of | fell | rose | median s to rise | median peak, m/s | worst asked, weights |
|---|---|---|---|---|---|---|
| workshop-fighter, club, shoved | 16 | 15 | 0 | - | 12.11 | inf |
| workshop-fighter, empty, shoved | 16 | 16 | 0 | - | 11.98 | inf |
| workshop-rogue, club, shoved | 16 | 16 | 0 | - | 12.47 | inf |
| workshop-rogue, empty, shoved | 16 | 16 | 0 | - | 14.62 | inf |
| crypt-skeleton, club, shoved | 16 | 16 | 0 | - | 12.74 | inf |
| crypt-skeleton, empty, shoved | 16 | 16 | 0 | - | 11.54 | inf |
| bouts | 9 | 7 | 0 | - | 10.41 | inf |

Of 102 falls none rises. A body on the ground is thrown about at 10 to 15 m/s by its own
muscles, and what its stance asks of the ground grows without bound: read on the Warrior with the
club shoved to its right and sampled once a second, the ask is 3 to 82 weights from 1 to 4 s
after the shove, past 1e30 at 6 s and past 1e100 at 16 s.
