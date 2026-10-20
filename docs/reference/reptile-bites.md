# Pointed-contact load injury

The Arena and Crypt share a general physical contact rule, independent of character and
Mind intent. Every surface with a declared pointed direction can injure an opposing body's
ordinary surface. No receiving tissue layer is required.

For each pointed rigid body, opposing physical segment and completed interval:

```
HP = rate * max(0, aligned normal impulse - threshold * seconds)
```

`Rulebook.pointLoad` sets the shared threshold to **1 N** and rate to **6.4 HP/(N s)**.
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
obstruction, misses and release. No anatomy, torque ceiling or unloaded speed is raised.

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

The shared rate search starts at .05 HP/(N s) and doubles. The 3 m development mirror
rejects every cell through 3.2: .05, .1, .2, .4, .8, 1.6 and 3.2 all reach the 30 s cap.
Some higher cells disable a jaw without yet emptying a vital part, so an individual
stronger bite does not guarantee a shorter bout. The next cell, **6.4**, ends that
mirror by injury and is the first cell to pass the development mirror target.
The measured neck pose is retained through the snap instead of continually re-aiming
an arc that is already under way. Preparation and withdrawal retain their existing
muscle-driven placement and physical release rules.

Current Node Arena Duel results, rapier-coordinate at 120 Hz, with both balances zero:

| Mirror gap, m | Injury time, s | Ending | Falls |
| --- | --- | --- | --- |
| 1.5 | 7.300 | fatal | 0 |
| 2 | 7.592 | fatal | 0 |
| 3 | 11.158 | fatal | 0 |
| 4 | 11.050 | fatal | 0 |
| 1.75 | 7.008 | fatal | 0 |
| 2.5 | 8.417 | fatal | 0 |
| 3.5 | 9.942 | fatal | 0 |
| 4.5 | 19.908 | severed | 0 |

All eight mirrors pass. A vital part can empty before the body's entire 1 HP pool is spent.
The following ranges cover eight development bouts per opponent: four gaps, both side
assignments, in the same Node harness, engine, rate and zero-balance conditions above.

| Opponent | Actual pointed-load pool loss, HP | Separate damaging engagements | Passing bouts |
| --- | --- | --- | --- |
| Rogue | 0.000-0.406 | 0-1 | 0/8 |
| Warrior | 0.000-0.000 | 0-0 | 0/8 |
| Skeleton | 0.000-0.248 | 0-1 | 0/8 |

Fresh humanoid confirmation is conditional on passing development and is not run for these failures.

The complete humanoid target remains unmet. More damage does not correct missed tooth
contact against low legs and feet; ordinary jaw contact can obstruct the tooth path.
The experimental capability check keeps this failure visible, separately from software
contracts and the mirror deadline.

Commands:

```
node research/reptile-combat.mjs
node research/reptile-combat.mjs --confirm
node research/reptile-combat.mjs --rate=0.8
node --test tests/reptile-combat-capability.test.mjs
```
