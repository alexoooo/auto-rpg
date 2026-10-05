# Ground contact and angular stops in one impulse prediction

`build/contact-step.ts::predictPointContacts` accepts optional inward angular-stop rows in
addition to fixed-plane contact points. Both use the updated coupled body/equipment mobility.
A stop supplies a lower end-step row velocity in rad/s, an impulse tolerance in N m s and a
velocity tolerance in rad/s. Its row contains only angular entries; nonzero linear entries,
invalid tolerances and singular mobility are rejected. Point-contact tolerances retain their
own units. The model must not already constrain the stops it is being asked to select.

The predictor alternates unilateral normal and angular impulses with the two-axis projected
friction impulses. A stop can hold with nonnegative impulse or release with zero impulse.
Its impulse influences every contact's motion, and every contact impulse influences its
angular motion. Iteration changes are normalized by each column's own impulse tolerance.
Independent reconstruction checks each stop's inward velocity and complementary reaction,
alongside the point-contact certificate. The detached report includes each stop's impulse,
velocity, violation and holding/free mode. No predicted reaction is applied to physics.

The caller supplies the coordinate geometry and velocity bound. The mechanical fixture uses
`nearJointStops`, whose rows follow the measured-angle gradient, including its velocity bias.
If its acceleration target is `target`, raw inward rate is `rate`, and step is `dt`, the
end-step row bound is `rate + dt * target`: equivalently `-gap / dt` plus the coordinate
curvature term. Raw rate cancels in this conversion. The predictor starts from mass-projected
joint/grip-compatible velocities, as described in [contact-step](contact-step.md).

## Established-support and release fixture

Harness: Node core stand, `rapier-coordinate-coulomb`, package `.6`, adapter 7, 120 and 1920 Hz.
No assists or modified anatomical strength. This is a mechanical fixture with prescribed
loads, not a character controller or a successful recovery demonstration.

A 10 kg base at `(0, .1, 0)` m has a `1.2 × .2 × .6` m box and principal inertia
`[.4, 1.2, 1.2] kg m²`. A 1 kg arm at `(±.6, .6, 0)` m has a `.6 × .1 × .2` m box and
inertia `[.01, .04, .04] kg m²`. A z-axis hinge at `(±.2, .6, 0)` joins them. The positive-x
fixture has limits `[0, .4]` rad; its mirror has `[-.4, 0]`. Both start at zero, where gravity
presses the lower or upper stop respectively. The base is free, supported only by the ground.

After one second settling, each branch runs for 1/30 s. A holding branch applies no joint
torque. A releasing branch applies ±6 N m about the parent-carried hinge axis, equal and
opposite on base and arm, to lift against gravity. Sliding variants also apply ±80 N at the
base centre, exceeding the whole system's nominal coefficient-0.5 friction load. The model
receives exactly the same prescribed force and torque that physics receives.

Ground candidates are geometric box vertices within 1 mm of the lowest feature and 5 mm of
the floor. Positive gap permits closing at `-gap / dt`. Stops are admitted within 0.01 rad
of a limit. Both kinds use a 2,048-pass budget, `1e-10` impulse tolerance and `1e-7` velocity
tolerance in their respective units. These are explicit fixture settings, not body anatomy.

Maximum component error in next-step COM velocity and spin, over both signs and ground modes:

| Rate | Angular condition | Linear, m/s | Angular, rad/s | Maximum passes |
|---|---|---:|---:|---:|
| 120 Hz | Holding | 0.004104 | 0.010748 | 23 |
| 120 Hz | Releasing | 0.000834 | 0.000385 | 23 |
| 1920 Hz | Holding | 0.001028 | 0.002518 | 20 |
| 1920 Hz | Releasing | 0.000164 | 0.000543 | 20 |

All sixteen branches converge, satisfy their separate residual checks and replay exactly.
The declared local velocity gate is 0.005 m/s and 0.015 rad/s. Holding branches predict
positive stop impulse and keep the physical angle within 0.0001 rad of zero. Releasing
branches predict zero stop impulse throughout and move at least 0.004 rad inward. The base
slides above 0.05 m/s in loaded sliding trials and remains below 0.001 m/s in sticking trials.
Every query leaves the physical save unchanged. The [record](contact-stops.json) retains
all maxima and common 120 Hz samples. These maxima do not imply a between-rate physical result.

An independent analytic test balances a 10 N downward load using a point 0.04 m off centre
and an opposing angular stop: normal impulse is `10 * dt N s`, stop impulse is `0.4 * dt N m s`,
and the resulting acceleration is zero. Reversing the stop releases it and changes the
normal impulse. Tests also cover an angular-only solve, insufficient work budget, detached
outputs and invalid input. Suppressing stop reactions or allowing them to pull makes this
test fail. Existing no-stop slab and linked-body records remain separate regression fixtures.

```powershell
node research/contact-stops.mjs
node --test tests/core-contact-step.test.mjs
```

## Limits and next integration

The established-support fixture intentionally ends before reaching the opposite limit. It
does not validate hard arrivals, rebounds, distant stop acquisition or a whole recovery route.
The predictor remains an allocating forward diagnostic; no gameplay controller uses it.
Next combine admissible contact/stop predictions with bounded actuator objectives, verify
an installed all-fours hold, and then validate entering and leaving that support. A converged
local prediction alone does not establish accurate impact dynamics or acceptable frame cost.
