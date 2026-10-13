# Party movement during reversals

The Crypt's party can fall before completing an ordinary return journey. This currently
breaks `nobody_in_the_fight_is_held_with_the_party_near` in
`tests/crypt-core.test.mjs`: the assertion reports a failure to wake an enemy, but the party
has already fallen and the run has ended. Changing wake distances or extending the timeout
would not fix that failure. This is a problem statement and proposal; movement code and
the failing regression are unchanged.

## Reproduction and evidence

Run the existing test, without changing its fixture:

```powershell
node --test --test-name-pattern=nobody_in_the_fight_is_held_with_the_party_near tests/crypt-core.test.mjs
```

The diagnostic used the Node headless `DungeonRun`, vendored parent-axis Rapier (`rapier`),
120 Hz, Node 24.15.0, and four Warriors under the test's ordinary configuration, with balance
0% for the Warriors and skeleton. It did not replace physical travel with teleports.
These results describe that harness, not a measured
browser run or the `rapier-coordinate` engine.

On seed 1, the return order points toward `(6, 24)` from the away destination `(10, 17)`.
The party ends clustered around `(9, 21)`, far from the held enemy near `(9, 39)`.
The run is `dead` at 27.2917 simulation seconds. The observed fall sequence is:

| Member | Fall time, seconds | Nearest other party member at that step | Distance, metres |
| --- | ---: | --- | ---: |
| ally-1 | 11.5917 | hero, alive | 0.8458 |
| ally-2 | 22.8583 | hero, alive | 0.5754 |
| hero | 23.9167 | ally-2, fallen | 0.8168 |
| ally-0 | 27.2750 | ally-2, fallen | 0.4004 |

Distances are between the actors' reported feet positions, not collider clearances. No
combat blows were recorded at these falls; that does not prove there were no physical
contacts. The diagnostic establishes premature party loss, but does not yet establish the
contact impulse or control error that causes each fall.

As a diagnostic comparison in the same Node/Rapier/120 Hz harness, substituting only the
SIMBICON settings preceding `dae73587` makes the wake test pass on all four of its seeds.
It still loses party members:

| Seed | Members still alive after the test, out of four |
| --- | ---: |
| 1 | 1 |
| 2 | 1 |
| 4 | 3 |
| 5 | 1 |

That is evidence that the changed gait exposes a pre-existing weakness, not evidence that
restoring the old settings solves party movement. The newer settings' commit also records
the wake-test regression. No settings were reverted in the implementation.

## Missing movement contract

`DungeonRun.avoidCrowd` in `src/dungeon/run.ts` checks nearby positions along the requested
direction. It classifies another actor as walking from `other.plan.move`; it does not read
actual velocity or predict the space needed to brake. Plans are assigned sequentially, so
that observation can also mix the previous step's requests with the current step's requests.
Only living actors enter its obstacle list, although fallen bodies remain physical obstacles.
If no tested aside works, it returns the original direction.

`simbicon` in `src/core/skills/simbicon.ts` deliberately brakes before a large reversal.
Its heading waits until measured speed falls to `TURN_ROUND` (0.3 m/s), subject to its
support transition. During that interval the requested direction and physical motion can
point different ways. Steering clear space along the new direction cannot establish that
the current motion is safe.

The architectural defect is that local steering treats a direction request as immediately
executable motion. Braking and turning are physical actions with finite response time, and
the layer choosing requests has no contract for that response. This is a concrete mismatch
in the code; its contribution to each recorded fall still needs a focused physical trace.

## Proposed fix

Make local steering choose movement that the active locomotion controller can execute from
the body's present motion. Keep route finding responsible for destinations and walls, and
keep locomotion responsible for muscle commands.

1. Take one consistent snapshot of nearby bodies before computing any actor's next plan.
   Describe physical position, velocity and occupied space independently of intended motion
   and alive/dead status. Intent may supplement observation, but cannot replace it. A mind's
   observations still come through senses and its own body, without engine handles.
2. Give locomotion a small, explicit way to describe its immediate movement limits: whether
   it is braking or turning, and a conservative prediction of its response to a requested
   speed and heading. Derive or measure that response on the actual body and controller;
   do not mistake a target-speed ramp for guaranteed physical deceleration. If a requested
   turn cannot happen yet, steering must account for the continued motion along the old
   heading. Avoid publishing fields that steering does not use.
3. Evaluate candidate requests against swept occupied space over that response interval.
   Include other bodies' motion and fallen bodies' physical extent. Allow slowing, stopping
   and yielding, as well as walking around an obstruction. When no safe request exists,
   report that condition and choose a feasible braking response instead of silently
   returning the obstructed request. A stop request alone is not proof of clearance.
4. Resolve conflicting requests deterministically from the same snapshot, with stable
   yielding decisions so actors do not alternate sides every step. Do not let actor iteration
   order decide which observations are current. Keep any persistent decision in the normal
   serializable state. Use the simplest prediction and arbitration that the physical cases
   support; do not introduce a general trajectory optimizer without evidence it is needed.

The first investigation should record requested motion, measured motion, locomotion phase,
body contacts and the moment support is lost in this existing reproduction. That distinguishes
collision-driven falls from independent braking instability before selecting a steering
algorithm. If a lone body falls during the same reversal, locomotion itself also needs fixing;
crowd steering cannot promise a stopping ability the body does not have.

## Verification and boundaries

Separate the wake/hold rule's contract from successful party travel, while preserving both
tests. A focused wake test should exercise the actual level update with physically realizable
near/far bodies. A party-travel regression should issue real outward and return orders and
require arrival and survival; the current wake test can pass despite losing three companions.
Do not weaken or delete the existing failure before equivalent travel coverage exists.

Use a small set of physical cases: a lone reversal, a following pair that reverses, crossing
paths, a narrow passage, and a fallen body in the route. Exercise multiple seeds and relevant
bodies/loadouts, including both requested directions and measured motion at the decision
point. Check useful progress as well as clearance, so permanent yielding cannot pass.
Test snapshot/arbitration order independence separately from physics engine ordering.
Name the engine and rate for results; a pass on parent-axis Rapier is not automatically a
pass on the gameplay engine. Any prediction must be checked against actual subsequent motion.

No assistance, stronger muscles, body teleports, seed-specific routes, enlarged wake distances
or relaxed survival assertions should substitute for this work. The existing CI movement
failure remains unresolved pending a separately authorized implementation.
