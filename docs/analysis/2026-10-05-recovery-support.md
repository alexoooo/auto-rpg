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
Before adding more recovery postures, expose and compare the native per-point option, name the
chosen friction law, and validate sticking/sliding selection against it. Then rerun the
installed all-fours hold, followed by hand/shin entry and unloading.
Keep posture feasibility, static hold, transition and useful control after rising as separate
gates. Do not tune strengths or discard contacts to turn a failed gate green.
