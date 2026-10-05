# Recovery support diagnostics

The shared motion interface is usable, but the current staged adapter does not establish
recovery. This study remains open. Its [records and prototype sources](2026-10-05-recovery-support.json)
preserve the experiments against commit `7be4c465`, before the active-contact compatibility
check. The source files are embedded with their original `.tools/` paths; they are experiments,
not installed controller alternatives.

Harness: Node core world, corrected-limit Rapier 0.21.0-auto-rpg.5 / adapter 6, 120 Hz,
directional actuation, ordinary ground, empty hands, no assistance. The fallen-body trials use
one development shove direction (zero degrees), all three bodies and a 40-second watch.
The skeleton has placeholder anatomy. None uses held-out cases or proves replay of the adapter.

## Fallen-body trials

The adapter translates the existing rise recipe into joint and combined-centre/root objectives
for bearing stages, and bounded velocity actions for pose stages. The body host is shared, but
the adapter's recipe and readiness rules remain experimental. It retries when a bearing stage
times out. The diagnostic counter counts rejected contact solves in motion stages; pose stages
do not perform that solve. It is not a count of all rejected physical predictions.

Four checks fail to produce a standing body:

- Including all measured fixed-ground contacts in bearing stages, instead of only the stage's
  named supports, fails for all three bodies with local lift-off on and off.
- Using whole-body joint tracking for pose stages also fails in all six cells. A change of
  actuator interface is not enough to reproduce the old pose controller's motion.
- Asking each hand to reach the ground below its shoulder during `prop`, and waiting for
  positive hand contact, fails in all six cells. The target height uses the hand's current
  geometric extent; this is a local placement experiment, not a collision-free arm planner.
- Replacing the Warrior's prop/fours joint targets and fours centre height with its corrected
  static witness also fails with local lift-off enabled.

The first inspected rejected bearing transition begins with the trunk still grounded and no
positive hand support. The timed prop stage has advanced without establishing its intended
support. Subsequent solves report an inconsistent programme, including ground contact and a
lumbar stop. This identifies an invalid entry condition; it does not establish which alternate
route or contact mode can satisfy the requested motion.

The skeleton's tested route does not reach the bearing stages at all: it repeats rolling from
its back. Its failure is not explained by the bearing solver alone.

## Holding an installed witness

The corrected static all-fours witness is installed on the Warrior before stepping, using the
same placement helper as the posture audit. The optional whole-body controller asks for its
joint angles, root orientation and combined centre. This isolates holding from entry; it is
not a recovery success. The settings are explicit in the archived script: joint feedback
0.3 s/weight 0.1, root and centre feedback 0.4 s, centre weight 10, root weight 1 or 3,
effort regularization 1e-6, near-stop prediction enabled, and the existing contact tolerances.

| Local lift-off | Root weight | Maximum segment drift over 10 s | Rejected contact or stop steps |
|---|---:|---:|---:|
| Off | 1 | 0.615714 m | 981 |
| Off | 3 | 0.442213 m | 1,051 |
| On | 1 | 0.578867 m | 1,192 |
| On | 3 | 0.425801 m | 1,194 |

All finish collapsed. These four configurations do not show that no controller can hold the
witness. They show that the present constrained predictor and task weighting do not do so.
Their rejection counts include both contact and joint-stop rejection and cannot be compared
directly with the fallen-body adapter's narrower counter.

## Next experiment

The active-contact compatibility regression in [contact lift-off](../reference/contact-liftoff.md)
establishes that admissible forces alone do not prove compatible sticking motion. Several
contacts on a spinning flat body cannot all have zero material acceleration. Rejecting such
a prediction is necessary but leaves the controller without a useful alternative.

The [sliding-sphere check](../reference/planar-support.md) validates one geometric support.
The [free sliding/sliding-and-spinning slab](../reference/contact-friction.md) identifies a
separate engine/controller mismatch: Rapier's default rigid-body friction uses a central
tangential constraint and independent twist resistance, rather than friction at each corner.
Its patch prediction matches both spin directions much better than the per-point prediction.
The native per-point option is exposed separately and its projected-impulse sliding response
is measured. Mechanical sticking/sliding and combined ground/stop checks now pass for selected
fixtures, but anatomical forward agreement remains open. The independent installed hold below
establishes another control option before hand/shin entry and unloading.
Keep posture feasibility, static hold, transition and useful control after rising as separate
gates. Do not tune strengths or discard contacts to turn a failed gate green.

## Bounded inverse prediction and independent feedback

An allocating inverse-control prototype uses the local contact/stop forward model on the
Warrior's teleport-installed all-fours witness. Harness: Node core world, 120 Hz,
`rapier-coordinate-coulomb`, package .6 / adapter 7, directional actuation, empty hands,
ordinary ground and no assists. Its sources and selected results are archived in the study's
JSON under `forwardHold`; this prototype has no replay proof and is not an installed policy.

The prototype freezes mobility for each step and searches bounded muscle torques by numerical
Gauss-Newton updates. It targets all segment positions and rotations (0.3 s feedback,
linear/angular weights 1/0.1, root multiplier 3, regularization 1e-6, three updates,
normalized finite difference 0.001, update cap 0.25, line-search factors 1/0.5/0.25/0.125).
It applies only a final certified prediction. Over one second it rejects none, yet drifts
90.157 mm. At the first step its largest next-velocity errors are 0.140457 m/s and
2.025060 rad/s. Raising native iterations to 64 or 256, or internal iterations to 16,
does not reduce that first-step disagreement. Torque delivery closely matches the request.
Convergence therefore does not certify anatomical physical accuracy.

Initial clearance and static gravity-torque seeding do not close the hold gate. Removing
negative-gap positional correction from stop bounds also fails. The hands are capsules;
their initial geometric endpoint candidates differ from the native manifold's three points
and contact acquisition. This is a lead for comparison, not an established engine defect.

The existing independent velocity-feedback policy supplies a separate positive result.
With joint response 0.01 s, full activation, a 10 rad/s speed cap and unchanged native
iterations, it holds all fours. The durable [installed-pose task](../reference/posture-hold.md)
uses the shared pose builder, not the teleport helper, and measures ten seconds including
startup. It passes on both corrected-limit friction profiles and replays in Node and browser.
Half-kneel and squat fail. No recovery entry, disturbance rejection or useful standing
handover is established. Continue support entry/transfer experiments while keeping the
independent feedback and model-based options behind the same physical enforcement path.

## Entering all fours after a shove

Node core world, corrected-limit per-point profile .6 / adapter 7, 120 Hz, directional bounds,
Warrior with empty hands and zero assistance. Four development shoves at 0, 90, 180 and 270
degrees use the existing fallen-body harness. The independent policy takes over from the
fallen body without changing its physics. Sources and readings are archived under
`independentEntry`; these prototypes have not yet established replay or cross-browser parity.

Direct all-fours joint targets alone fail all four twenty-second trials. In two, joint error
falls below 0.006 rad while the trunk remains grounded. Joint-angle convergence does not
establish the intended world orientation or support.

Adding the existing rolling poses, a stillness wait and retries before all-fours acquisition
produces sustained support in three of four forty-second trials with 0.01 s joint response
and a 10 rad/s cap. The criterion requires both hands and both shins in positive ground
contact, pelvis facing down, and no head or trunk contact. The longest uninterrupted measured
runs are 1,841, 1, 3,727 and 3,700 steps respectively. The 90-degree case remains supported
on its head as well as hands and shins. With the old 0.2 s response and 3 rad/s default cap,
only the zero-degree case sustains support (3,082 steps). These four selected directions are
not a robustness estimate. Holding all fours still leaves kneeling, standing and handover open.

Adding the existing fold/tuck/prop preparation before the final pose produces sustained
support in all four directions with the fast response in that prototype. The installed
[support-entry task](../reference/support-entry.md) supplies the durable contract and stronger
acceptance: a separate floor/fall fixture, two seconds of quiet support and ten seconds with
at most 2 cm drift. Its results differ and are the reference for that task; the prototype's
four successful contact runs do not imply four task passes.

## Transfer and kinematic feedback checks

The `transferFollowups` archive retains two unsuccessful alternatives, both Node core world,
corrected-limit per-point .6 / adapter 7, 120 Hz, directional bounds, empty-handed Warrior,
zero assistance and unchanged native iterations. No replay or browser proof is claimed for
these diagnostic scripts.

From the shared builder's installed all-fours pose, after two seconds of direct holding,
playing the old sit/kneel pose sequence fails to retain an upright trunk. Stopping at the
kneeling hold, tall kneel or foot reach all collapses, at response times 0.2, 0.03 and 0.01 s
with a 10 rad/s cap. At twenty seconds the pelvis up-axis y is between -0.0491 and 0.0154,
with head/trunk/thigh ground contacts. These nine cells do not validate a support transfer.

A separate velocity-level least-squares controller combines current contact-point zero-velocity
rows (weight 100), initial pelvis orientation (weight 1), initial combined centre (weight 10),
and joint feedback (weights 0.01, 0.1 or 1). Root/centre response is 0.3 s, joint response
0.01 s, speed bounds are +/-10 rad/s, and regularization is 1e-6. It computes kinematic rows
from the coupled model and sends only muscle velocity commands; the floating root receives
no force. All solves converge, but all nine ten-second installed-pose trials fail the 2 cm
gate: all-fours drift is 0.1113, 0.09345 and 0.05808 m; half-kneel drift is 1.9301, 1.6646
and 0.13072 m; squat drift is 1.6727, 1.6577 and 1.6651 m. This weighting does not improve the
independent direct hold. Contact-compatible requested velocities alone do not establish
dynamic balance or a feasible support transfer.
