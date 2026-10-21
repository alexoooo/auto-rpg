# Pointed-contact load injury

The Arena and Crypt share one contact rule, independent of character and Mind intent: every
surface with a declared pointed direction can injure an opposing body's ordinary surface, with no
receiving tissue layer. For each pointed rigid body, opposing segment and completed interval:

```
HP = rate * max(0, aligned normal impulse - threshold * seconds)
```

`Rulebook.pointLoad` sets the threshold to **1 N** and the rate to **.2 HP/(N s)**: authored game
values (`owner-point-load`), not measured tissue properties.

## The rule

- All aligned contributions of a body's teeth and colliders are summed before the threshold is
  applied once, so splitting a force over more teeth or solver points adds no injury.
- Sustained pressure wounds without further movement; releasing contact stops the load at once,
  with no release payment or episode memory. Colliders stay rigid and unchanged.
- A point's cone is tested in the body's anatomical frame, or a held item's, against the actual
  contact normal. Sides and reverse contacts stay ordinary blunt impacts. Both sides can be wounded
  if both present aligned points.
- A held item intercepts load injury without passing the wound to its holder. Impact sharing and
  recoil still apply, but an aligned point's victim gets no second energy payment. Recoil is read
  before load wounds, so a fatal puncture keeps that interval's recoil.
- `LandedBlow.kind` tells an impact's energy and closing speed from a load's impulse and duration.
  The strongest qualifying pair supplies a grouped load's contact location and shape labels.
- There is no tissue admission, depth backstop, signed reaction-work accounting or world
  contact-work state. Sole compliance against fixed ground remains. The native package is
  unchanged; the gameplay adapter is revision 12.

The reptile's tooth geometry is in [its anatomy](reptile.md#anatomical-model).

## Physical contract

`tests/core-contact-episodes.test.mjs@2a1b29ac`: Node core stand, rapier-coordinate, 120 Hz (960 Hz
for its fine reference), zero gravity, no assists. Declared point boxes press an ordinary rigid slab
under an applied 10 N load; a large HP reservoir keeps the fixture alive.

- The second second's injury matches the force law within 1 %.
- Reversed fighter registration and a rotated world give the same result.
- One against three contacting regions, and 120 against 960 Hz, agree within 5 %.
- Subthreshold loading, side and reverse directions cause no sustained point injury.
- Unloading stops injury; a saved loaded contact continues exactly in a fresh world.
- Replacing the blow observer causes no payment and no change to the continuation.
- Opposing points wound both sides under the same law; held geometry intercepts the point.

`tests/core-points.test.mjs@2a1b29ac` covers anatomical regions, held-item frames, rigid mass
invariance, ordinary recoil and the absence of duplicate point energy damage.
`tests/core-reptile.test.mjs@2a1b29ac` runs the physical jaw: loaded-paw preparation, cancellation,
obstruction, misses and release, with the fixed jaw presenting an exposed corner to the
forward-leaning teeth.

## Measurement

`research/reptile-combat.mjs`: the Node Arena Duel, rapier-coordinate, 120 Hz, empty hands, zero
balance on both sides, default Minds, unlimited recovery, a 30 s cap. Development gaps are 1.5, 2,
3 and 4 m; confirmation gaps 1.75, 2.5, 3.5 and 4.5 m. Each humanoid meets the reptile in both
side assignments.

```
node research/reptile-combat.mjs
node research/reptile-combat.mjs --confirm
node research/reptile-combat.mjs --rate=0.8
node --test tests/reptile-combat-capability.test.mjs   # @2a1b29ac
```

The mirror target is an injury verdict within 30 s without a fall. The humanoid target is two
damaging engagements and at least .5 HP removed within 30 s against each active Rogue, Warrior and
Skeleton; it does not need a win. An engagement begins with actual pointed-load HP loss and begins
again only once the jaw clears every contact with that opponent. Damage is actual pool loss, not
requested damage or incidental blunt injury.

**The forward teeth.** At a 2 m gap, the reptile on the left, the same 6.4 HP/(N s) rate for both
geometries (upright teeth: the implementation at `4d587509`):

| Opponent | Upright teeth, pool loss, HP | Forward teeth, pool loss, HP |
| --- | ---: | ---: |
| Rogue | 0.000 | 1.362 |
| Warrior | 0.000 | 1.895 |
| Skeleton | 0.000 | 1.162 |

**The rate.** The forward geometry allows a much lower common rate. At .05 HP/(N s) a 4 m mirror
reaches the cap; at .1 it ends at 27.625 s. The chosen .2 leaves margin against the deadline and
gives repeated damage in the 2 m humanoid bouts. A much higher rate can sever a contacted limb
early, after which contact with that emptied pool adds nothing: a stronger rate is not a better
bout.

At .2 HP/(N s), all eight mirrors end in a fatal injury with no fall:

| Mirror gap, m | 1.5 | 2 | 3 | 4 | 1.75 | 2.5 | 3.5 | 4.5 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Injury time, s | 6.767 | 8.383 | 10.333 | 16.942 | 7.308 | 9.392 | 11.008 | 11.592 |

A vital part can empty before the body's whole 1 HP pool is spent. Against humanoids, eight
development bouts an opponent (four gaps, both sides):

| Opponent | Pointed-load pool loss, HP | Damaging engagements | Passing bouts |
| --- | --- | --- | --- |
| Rogue | 0.000-2.864 | 0-13 | 4/8 |
| Warrior | 0.336-1.974 | 3-7 | 5/8 |
| Skeleton | 0.175-1.274 | 1-20 | 5/8 |

The humanoid target is not met, so the confirmation gaps are not run for it. The reptile on the
right falls during its approach to the Rogue at 4 m (6.767 s), before any bite; other cases land too
little load, or do not clear jaw and opponent contact between damaging intervals. These are
control and placement limits, not missing receiving materials or per-character exceptions.
