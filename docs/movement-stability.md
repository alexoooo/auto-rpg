# Coordinated physical movement

2026-09-20. The current arm controller replaces the earlier endpoint-driven arm and its
hold-only damping. Those fixes stabilized the trunk and improved settling, but did not
control the elbow throughout mouse sweeps.

## Current controller

The existing continuous cursor, reach and wrist-tip correction produce a bounded arm target.
A 25 ms arrival easing runs on the 240 Hz physics clock within the existing hand-speed cap;
it prevents uneven display/input samples from repeatedly kicking velocity feedforward. It
filters the command, never the rendered body, and snaps within 0.1 mm to finish acquisition.

The two-bone solution supplies shoulder yaw, shoulder pitch and elbow angle to three
`JointServo` controllers. Each owns one finite-effort `JointActuator`. There is no endpoint
force constraint and no separate hold-only brake. The legacy `anchor` readout now reports the
commanded hand point without allocating a physics body. The wrist retains ownership of roll
and bend. Existing hand commands and published envelope/axis interfaces remain compatible.

The serial shoulder and elbow links retain their geometry and mass. Their rotational inertia
has a 0.15 kg m² floor, preserving larger original components, to condition the small bearings
against the carried load. Angular feedback uses hinge twist rather than Euler pitch, which
would fold beyond 90 degrees. Targets are seeded from the actual construction pose.

Joint response is 40/s; yaw, shoulder pitch and elbow effort ceilings are 720/1200/720 Nm.
Those ceilings are shared across carried loads, not torques continuously applied to the body.
The weaker 180/300/180 trial left up to 41 cm of elbow error. The neck's holding ceiling is
100 Nm rather than 42: arm reactions otherwise produced 9.91 degrees of head tilt on the
plated ram; the braced test measured under a degree. The torso controller is unchanged.

Controllers and actuators remain separate. A future low-level controller can replace target
tracking without replacing the physical arm or requiring gestures. Severing, disposal and
passive two-handed trailing arms release all three arm actuators. Contacts can block the hand,
and impulses can displace it; no controller teleports bodies or overwrites their velocity.

## Validation

The new arm tests measure the actual elbow against the public commanded two-bone pose during
repeated reversals, not just the hand or upright head after stopping. They cover both headings,
low/level/high aim, short/long reach, 1/2 Hz sweeps, 30/60 Hz input and jittered frames, with
bodies forced awake and observations after every fixed solver step.

At 60 Hz input, the worst elbow errors across the pose grid are 0.97 cm at 1 Hz and 1.82 cm at
2 Hz; worst moving-hand errors are 1.42 cm and 2.79 cm. Tests require elbow errors below
3/8 cm respectively, moving-hand error below 8 cm, and residual limb speed below 0.03 m/s
within one second. A fresh browser replay using real pointer events measured 0.74 cm elbow
error and 0.000036 m/s residual speed, without contact with the opponent.

A separate physical test applies an impulse, obstructs the hand with a world collider, and
removes that obstruction: the arm yields and recovers. Existing tests cover startup, walking,
turning, heavy builds, two-handed grips, severing and controller handovers. Rest tracking allows
2 mm of static load error rather than the endpoint constraint's previous 1 mm bound.

The bench's misleadingly named `idleAnchorStrayMm` includes continuously moving commands.
Its bound is now the same 8 cm moving-hand bound, alongside separate elbow and rest tests.
The 64-cell sword candidate grid was re-swept: its chosen bench candidate now misses by
1.82 cm at 14.09 m/s with 27.53 mm peak hand error. This is a benchmark candidate; the shipped
policy's stroke and its existing speed/AI combat checks remain intact. Its old 15 m/s candidate
floor is replaced by 13 m/s to record the accepted speed-for-coordination tradeoff.

`npm run check` and `npm run build` pass. The complete suite passes 586 of 589 tests.
Three pre-existing failures remain: a source scanner matches a comment in `wear.ts`, and two
ram-post scoring fixtures fail. These are not counted as successful validation. The arm tests
also fail against the previous controller restored in memory, without poisoning Vite's cache.
