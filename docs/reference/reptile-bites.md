# Pointed-contact load injury

The Arena and Crypt share a general physical contact rule, independent of character and
Mind intent. Every surface with a declared pointed direction can injure an opposing body's
ordinary surface. No receiving tissue layer is required.

For each pointed rigid body, opposing physical segment and completed interval:

```
HP = rate * max(0, aligned normal impulse - threshold * seconds)
```

`Rulebook.pointLoad` sets the shared threshold to **1 N** and rate to **.2 HP/(N s)**.
These are authored game values (`owner-point-load`), not measured tissue properties.
All aligned tooth/collider contributions are summed before applying the threshold once.
Splitting the same force over more teeth or solver points creates no extra injury.
Both sides can receive load injury if both present aligned points. Sustained pressure
can wound without further movement. Releasing contact removes the load immediately;
there is no release payment or episode memory. Colliders remain rigid and unchanged.

A point's cone is tested in the body's anatomical reference frame, or a held item's
frame, against the actual contact normal. Sides and reverse contacts remain ordinary
blunt impacts. A held item intercepts load injury without transmitting that wound to
its holder. Ordinary impact sharing and recoil still apply; an aligned point's victim
receives no second energy payment. Impact recoil is read before load wounds so a fatal
puncture does not erase that interval's recoil. `LandedBlow.kind` distinguishes an
impact's energy/closing speed from a load's impulse/duration. The strongest qualifying
pair supplies the representative contact location and shape labels for a grouped load.

The rule removes tissue admission, depth backstops for bites, signed reaction-work
accounting and world contact-work state. Sole compliance against fixed ground remains.
The native package remains unchanged; the gameplay adapter is revision 12.

## Physical contract

`tests/core-contact-episodes.test.mjs` uses the Node core stand, rapier-coordinate,
120 Hz (960 Hz for its fine reference), zero gravity and no assists. Declared point
boxes press an ordinary rigid slab through an applied 10 N load. A large HP reservoir
keeps the fixture alive throughout settling and measurement.

- The second second's injury matches the stated force law within 1%.
- Reversing fighter registration and rotating the world preserve the result.
- One versus three contacting regions, and 120 versus 960 Hz, agree within 5%.
- Subthreshold measured loading, side and reverse directions do not cause sustained point injury.
- Unloading stops injury; a saved loaded contact continues exactly in a fresh world.
- Replacing the blow observer causes no immediate payment or change to continuation.
- Opposing points wound both sides under the same law; held geometry intercepts the point.

`tests/core-points.test.mjs` covers anatomical regions, held-item frames, rigid mass
invariance, ordinary recoil and the absence of duplicate point energy damage.
`tests/core-reptile.test.mjs` runs the physical jaw, loaded-paw preparation, cancellation,
obstruction, misses and release. Torque ceilings and unloaded speeds are unchanged.
The fixed-jaw witness presents an exposed corner to the forward-leaning teeth; it
retains fast closure, actual load injury, cancellation and verified release.

## Calibration and combat conditions

`research/reptile-combat.mjs` runs the Node Arena Duel on rapier-coordinate at **120 Hz**,
empty hands, **zero balance on both sides**, default Minds, unlimited recovery, and a
30 s cap. Development gaps are 1.5, 2, 3 and 4 m. Confirmation gaps are 1.75, 2.5, 3.5
and 4.5 m. Each humanoid is tested with the Reptile in both side assignments.

The mirror target is an injury verdict within 30 s without a fall. The separate humanoid
target is two damaging engagements and at least .5 HP removed within 30 s against each
active Rogue, Warrior and Skeleton; it does not require winning. An engagement begins
with actual pointed-load HP loss and can begin again only after the jaw clears every
contact with that opponent. Damage includes actual pool loss, not requested damage or
incidental blunt injury. The harness reports each opponent and side separately.

The tooth bases stay attached at reference y .2175 m and z .481-.489 m. The
owner-authorized geometry experiment moves only the tips and the named bite point
18 mm forward, to z .503 m at the same y .2255 m. The tips lead the blunt jaw front
by 8 mm. Their declared piercing direction follows the base-to-tip axis
`[0, .008, .018]`, normalized. Mass, inertia, HP, joint limits and muscles are unchanged.
The measured neck pose is retained through the snap instead of continually re-aiming
an arc already under way. Preparation and withdrawal retain their muscle-driven
placement and physical release rules.

A comparison in the Node Arena Duel, rapier-coordinate at 120 Hz, zero balance,
2 m gap and Reptile on the left uses the same 6.4 HP/(N s) rate for both geometries:

| Opponent | Upright teeth, actual pool loss, HP | Forward teeth, actual pool loss, HP |
| --- | --- | --- |
| Rogue | 0.000 | 1.362 |
| Warrior | 0.000 | 1.895 |
| Skeleton | 0.000 | 1.162 |

The upright-tooth reference is the implementation at `4d587509`. The forward geometry
allows a much lower common rate. A .05 HP/(N s) 4 m mirror reaches the 30 s cap;
.1 ends it at 27.625 s. The selected **.2** gives more margin against the deadline and
material repeated damage in the 2 m humanoid bouts. Raising the rate excessively
can sever a contacted limb early; repeated contact with that detached pool then
adds no injury. A stronger rate does not guarantee a better bout.

Current Node Arena Duel results, rapier-coordinate at 120 Hz, both balances zero,
at the selected .2 HP/(N s):

| Mirror gap, m | Injury time, s | Ending | Falls |
| --- | --- | --- | --- |
| 1.5 | 6.767 | fatal | 0 |
| 2 | 8.383 | fatal | 0 |
| 3 | 10.333 | fatal | 0 |
| 4 | 16.942 | fatal | 0 |
| 1.75 | 7.308 | fatal | 0 |
| 2.5 | 9.392 | fatal | 0 |
| 3.5 | 11.008 | fatal | 0 |
| 4.5 | 11.592 | fatal | 0 |

All eight mirrors pass. A vital part can empty before the body's entire 1 HP pool is spent.
The following ranges cover eight development bouts per opponent: four gaps, both side
assignments, in the same Node harness, engine, rate and zero-balance conditions above.

| Opponent | Actual pointed-load pool loss, HP | Separate damaging engagements | Passing bouts |
| --- | --- | --- | --- |
| Rogue | 0.000-2.864 | 0-13 | 4/8 |
| Warrior | 0.336-1.974 | 3-7 | 5/8 |
| Skeleton | 0.175-1.274 | 1-20 | 5/8 |

At 2 m with the Reptile on the left, actual load injury is 2.052 HP against Rogue,
1.310 HP against Warrior and 1.274 HP against Skeleton, with 13, 5 and 20 separate
damaging engagements respectively, in the same Node Arena conditions.
Fresh humanoid confirmation is conditional on passing development and is not run
for these failures.

The complete humanoid target remains unmet. In particular, the Reptile on the
right falls during approach at 6.767 s against Rogue at 4 m, before any bite.
Other cases land insufficient load or do not fully clear jaw/opponent contact
between damaging intervals. These are control and placement limitations rather
than missing receiving materials or per-character damage exceptions. The
experimental capability check keeps the failures visible separately from software
contracts and the mirror deadline.

Commands:

```
node research/reptile-combat.mjs
node research/reptile-combat.mjs --confirm
node research/reptile-combat.mjs --rate=0.8
node --test tests/reptile-combat-capability.test.mjs
```
