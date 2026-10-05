# Point control in the arena

`PointFighterConfig` selects an experimental gameplay controller independently of body anatomy.
It is selectable beside Classic for either contender. The ordinary `Duel` owns physics, sensing,
orders, contacts, damage, verdicts and replay; the page only selects the recipe and renders it.

## Controller and settings

- Locomotion, placement and balance use the reference body controller. Strength, inertia,
  assistance ceilings and the gameplay Rapier profile are unchanged. This does not install
  the optional coordinate-limit or Coulomb-friction engine profiles.
- The strike skill selects no searched torque recipes. It uses the anatomical point named by
  `aimOf`, the placed-strike reach and timing (`PLACED`, `STAND`, `APPROACH` in
  [blows](blows.md) and [human and strikes](human-and-strikes.md)), and the research `pointPath`
  quintic. Initial velocity is a difference of successive body-frame point observations at
  the control rate. IK samples this path and the shared muscle-bounded servo tracks it.
  Either hand can attack; alternating hands is sequential, not simultaneous coordination.
- Defense uses the same sensed hand/item rigid-point velocity as Classic cover, including
  angular velocity. `predictIntercept` projects constant velocity to a plane `GUARD_COVER.out`
  ahead of the head along the current threat direction. The horizon is `THREAT.within /
  THREAT.closing`; a point already inside the plane is covered immediately. These are derived
  from the existing threat and cover settings, not new force gains. This mode does not yet
  compensate delayed body observations, head motion, or predict angular acceleration.
- Recovery runs the reference `stagedRise`, then restores standing height and square feet
  through locomotion, retaining control until measured quiet foot support holds. Takeover uses
  the host's down reading and requires no support contacts. No installed pose, teleport, new
  assist or body reconstruction occurs. See [recovery-cycle](recovery-cycle.md) for results.

`recoverySeconds` is a bout rule: continuously down for that duration means defeat; wounds
can still defeat a body immediately. Standing resets its clock. Zero retains ordinary arena
rules. The UI offers 0, 15, 30 and 60 seconds as explicit player choices; links accept any finite
value from 0 to 60. Both sides receive the same allowance regardless of their controller. Classic retains its
passive lying sub-mind; the point fighter attempts recovery.

## Verification

Reproduce integration checks with:

```powershell
node --test tests/arena-point-control.test.mjs tests/core-orders.test.mjs
```

Harness: Node arena, vendored Rapier gameplay profile, 120 Hz, normal arena solids and damage,
Warrior versus Rogue, balance 0% on both sides (their sourced character values). These checks cover:

- Autonomous approach, placement, repeated attacks and measured trajectories from both hands.
- Actual hand contacts causing ordinary damage; a club's item point and damage identity.
- A fork during a club swing, comparing every segment pose at every subsequent step plus
  the entire bout state. Raw serialized engine bytes include internal bookkeeping and are
  not used as the motion fingerprint.
- An external shove from standing, recovery takeover, continued opponent sensing, expiration
  and exact replay of the recovery clock and physical motion.
- Repeated player orders to hit a static fixed collider, with a real hand/collider impulse.
- Controller/recovery link parsing, and a cover placed on the predicted intercept plane.

These are integration gates, not evidence of superiority. A completed requested strike is
not necessarily a hit, and a touch during a fall is not a successful driven attack. A standard
20-second unarmed comparison bout requests several attacks; club use can topple the fighter.
No win-rate or damage-quality claim is made from these fixtures.

## Remaining limits

The point controller is a hybrid, not the full experimental whole-body optimization policy.
It keeps the reference stance/IK execution path to make the primitives playable at game rates.
The independent observation/action and motion-policy interfaces remain available to other AI
approaches. Arena equipment still uses the existing compound right-hand club: separate items,
disarms and shared two-hand grips are not yet integrated with rendering and damage ownership.

The reference recovery sequence still uses timed poses. Its measured handover passes selected
Warrior falls, but one club direction fails and passing recovery is slow. The independent
support-entry research pose has no reliable general standing transition. Impact-aware
braking/re-planning, moving-target return validation, coordinated simultaneous attacks and
measured defense effectiveness remain open.

## Strike cycle

`POINT_RETURN` is the engineering acceptance setting for point preparation and return:
`near = 0.03` m, `slow = 0.2` m/s, `hold = 0.1` s continuously, `limit = 2` s per phase.
These are development thresholds validated by the table below, not anatomical measurements
or optimal values from a sweep. Speed is the finite difference of the striking point in the
body frame. Acceptance also requires an upright body and stance phase `stand`.

Point-only placement subtracts `PLACED.through` from available straight reach so the requested
follow-through fits. At commitment the cycle captures its starting point. Preparation asks for
half the arm's straight reach between point and target, retracting only the shortfall, capped at
`PLACED.through`. This geometric choice supplies a stroke when the guard is already close to the
target; it avoids unnecessary retraction with a longer club. Existing `PLACED.seconds` and
muscle strengths remain unchanged. The chamber and return are fixed body-frame goals; the
outbound goal follows the target. All phases use measured initial point velocity.

`thrown` counts completed outbound durations, not hits. `pointCycle.returned` counts measured
returns to the captured starting point. `failed` counts preparation or return deadlines, and
`interrupted` counts cancellation or recovery takeover. Cancelling a committed cycle returns
its hand; recovery takeover discards the cycle and resumes from the actual body. Preparation
timeout skips release and attempts return. Return timeout releases to guard with a failure.
Thus even a reported return can follow a cancelled or failed preparation; it is not a hit count.

Harness: Node arena Duel, vendored Rapier adapter 8, symmetric actuation, 120 Hz, Warrior,
balance 0% on both sides. Fixed box at head height, 0.65 m forward for empty hands or 1 m for
the club; misses omit the box. Each row runs 20 s after settling. An incoming impact is the
first contact of a swing, from its selected hand/item while upright, with positive pre-step
closing speed and no contact in the preceding step. Persistent pressure and later contact
flicker within the same swing do not count. This is not an energy or damage-quality metric.

| Equipment / hand | Target | Verified returns L / R | Incoming impacts | Phase timeouts | Falls |
| --- | --- | --- | --- | --- | --- |
| Empty / left | Box | 6 / 0 | 6 | 0 | 0 |
| Empty / right | Box | 0 / 6 | 6 | 0 | 0 |
| Empty / alternating | Box | 3 / 3 | 6 | 0 | 0 |
| Empty / left | Miss | 6 / 0 | 0 | 0 | 0 |
| Empty / right | Miss | 0 / 6 | 0 | 0 | 0 |
| Empty / alternating | Miss | 3 / 3 | 0 | 0 | 0 |
| Club / right | Box | 0 / 7 | 7 | 0 | 0 |
| Club / right | Miss | 0 / 6 | 0 | 0 | 0 |

Cancelling an empty right-hand miss 0.1 s into its swing produces one verified return, one
interruption, no completed outbound swing, no timeout and no fall. Whole-state and segment
motion replay passes from mid-return into a fresh Duel. Without preparation, the stricter
incoming-contact test fails because the hand can already be pressing the box at release.
The post-recovery club trial has one phase timeout; these standalone rows do not erase it.

Reproduce with `node --test tests/arena-control-cycle.test.mjs tests/arena-point-control.test.mjs`
and the [19-case runner and raw record](recovery-cycle.md#reproduction).

Built-browser smoke check: the arena renders Warrior versus Rogue with alternating point
control, empty hands and the 60 s recovery allowance; its live HUD advances through approach,
placement and return. Physical recovery and contact acceptance figures above are Node results.
