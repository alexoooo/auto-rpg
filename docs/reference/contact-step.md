# Local per-point contact step

What `build/contact-step.ts::predictPointContacts` predicts and how well. Through an updated coupled
body/equipment model it predicts one step's fixed-plane contact impulses and, optionally, angular
joint-stop impulses, from the caller's bounded actuator torques, known loads, candidate points,
inward normals, lower normal velocities and step. It returns detached data and applies nothing to
physics. It is a diagnostic that allocates, used by no gameplay controller.

## The model

- **Velocity projection first.** Measured velocities are mass-projected onto the anatomical and
  grip constraints (`coupledDynamics.projectVelocity`): raw solver velocities carry small joint
  errors that can make the reduced contact equations incompatible. Every installed model row is
  homogeneous in this projection; acceleration targets do not become velocity targets.
- Lever arms are frozen for the step, each point's centripetal acceleration removed. Unit loads
  through the coupled model give the contact mobility (mass, joint coupling, declared constraints).
- Normal impulses cannot pull. Each tangent pair solves its two-axis stopping impulse and projects
  it onto the friction disk, as native per-point friction does ([projected law](contact-friction.md);
  the projection's metric: [contact-projection](contact-projection.md)). Passes repeat from zero
  impulse to the caller's budget; nothing is warmstarted across queries.
- The final velocity is rebuilt from the mobility and accumulated impulses and checked for
  nonpenetration, complementary support, the friction disk and the tangent fixed point. Status
  separates convergence, iteration limit, residual failure and nonfinite results; a failed
  candidate justifies no action. Convergence means the local equations pass, not that an impact
  or changing geometry matches the engine.

## Transition fixture

Node core stand, `rapier-coordinate-coulomb`, package `.6`, adapter 7, 120 or 1920 Hz. A free 1 kg
box 0.6 × 0.1 × 0.4 m, principal inertia `[.02, .04, .04] kg m²`, settles one second (spin variants
then get ±3 rad/s about the vertical), and takes known centre forces, the same in model and physics:

| Interval | Applied force | Intended physical condition |
|---|---|---|
| 0–1 s | ±7 N horizontal | Driven sliding |
| 1–2 s | zero | Friction stops the body |
| 2–3 s | ±3 N horizontal | Friction supports a sublimit load |
| 3–3.25 s | 15 N upward | Unload and lift away |
| 3.25–4 s | zero | Fall and strike the ground |

Candidates are box vertices within 1 mm of the lowest feature and 5 mm of the plane; a positive gap
may close at `-gap / dt`, with no extra correction for penetration. Settings: 2,048 passes, impulse
tolerance `1e-10 N s`, velocity tolerance `1e-7 m/s`, friction 0.5. Every branch replays; the body
rises above 0.2 m and returns to rest near 0.05 m. Largest next-step velocity component errors:

| Rate and initial spin | Driven/coast/hold/lift linear, m/s | Angular, rad/s | Landing linear, m/s | Angular, rad/s | Landing rejected steps |
|---|---:|---:|---:|---:|---:|
| 120 Hz, zero | 0.000312 | 0.000072 | 0.006932 | 0.041512 | 0 / 0 |
| 120 Hz, ±3 rad/s | 0.003170 | 0.020155 | 0.006930 | 0.039368 | 0 / 0 |
| 1920 Hz, zero | 0.000092 | 0.000086 | 0.173597 | 0.397777 | 1 / 2 |

The fine-step landing is not validated: acquisition and substeps differ, and some solves end at the
budget unresolved. [Record](contact-step.json).

## Linked supports and velocity consistency

`research/contact-linked.mjs`, same stand, profile, rates and settings: two slabs at x = ±0.35 m
joined by a z-axis hinge at (0, 0.05, 0), limits ±1 rad. After a second's settling, ±14 N at the
left slab's centre for one second, then a second's coast; a second variant adds a ±0.4 N m couple
about the hinge during the drive (a prescribed load, not a controller or assist).

Without the velocity projection, the zero-torque case rejected 240/240 steps at 120 Hz and
1,732/3,840 at 1920 Hz (`contact-step.ts@7c1a2cf9`; first normal residual 1.93e-6 m/s against the
1e-7 tolerance). With it:

| Rate | Prescribed torque magnitude, N m | Linear, m/s | Angular, rad/s | Rejected steps, negative / positive drive |
|---|---:|---:|---:|---:|
| 120 Hz | 0 | 0.003057 | 0.001768 | 0 / 0 |
| 120 Hz | 0.4 | 0.003115 | 0.002637 | 0 / 1 |
| 1920 Hz | 0 | 0.000358 | 0.000332 | 0 / 0 |
| 1920 Hz | 0.4 | 0.000455 | 0.000399 | 0 / 1 |

All eight branches replay, slide above 2 m/s and stop within 1 mm of their height. The two
torque-case rejections come at stopping (1.55833 and 1.5625 s), with tangent residuals of 1.54e-9
and 1.97e-10 N s. Replacing the projected velocities with raw ones in
`tests/core-contact-step.test.mjs@2a1b29ac` rejects all 120 driven steps of its first case.
[Record](contact-linked.json).

## Angular stops

Optional inward angular-stop rows share the contact mobility and iteration. A stop gives a lower
end-step row velocity (rad/s), an impulse tolerance (N m s) and a velocity tolerance (rad/s); its
row is angular only, and the model must not already constrain it. A stop holds with nonnegative
impulse or releases with zero; changes are normalized by each column's tolerance, and the
certificate checks each stop's inward velocity and complementary reaction.

The fixture's rows come from `nearJointStops` ([joint-coordinate rows](joint-stop-tracking.md#joint-coordinate-rows)):
with acceleration target `target`, raw inward rate `rate` and step `dt`, the end-step bound is
`rate + dt * target` (equivalently `-gap / dt` plus the coordinate curvature term).

Node core stand, `rapier-coordinate-coulomb`, package `.6`, adapter 7, 120 and 1920 Hz. A free 10 kg
base at `(0, .1, 0)` m (`1.2 × .2 × .6` m box, inertia `[.4, 1.2, 1.2] kg m²`) and a 1 kg arm at
`(±.6, .6, 0)` m (`.6 × .1 × .2` m, `[.01, .04, .04] kg m²`), joined by a z hinge at `(±.2, .6, 0)`
with limits `[0, .4]` rad or the mirror `[-.4, 0]`, gravity pressing the stop. After a second's
settling, each branch runs 1/30 s: holding applies no joint torque; releasing applies ±6 N m to lift
the arm; sliding variants add ±80 N at the base, over the system's 0.5 friction load. Stops are
admitted within 0.01 rad; budget and tolerances as above.

| Rate | Angular condition | Linear, m/s | Angular, rad/s | Maximum passes |
|---|---|---:|---:|---:|
| 120 Hz | Holding | 0.004104 | 0.010748 | 23 |
| 120 Hz | Releasing | 0.000834 | 0.000385 | 23 |
| 1920 Hz | Holding | 0.001028 | 0.002518 | 20 |
| 1920 Hz | Releasing | 0.000164 | 0.000543 | 20 |

All sixteen branches converge and replay. Holding predicts
positive stop impulse and keeps the angle within 0.0001 rad; releasing predicts zero and moves at
least 0.004 rad inward. The base slides above 0.05 m/s loaded and stays below 0.001 m/s sticking.
An analytic case (`tests/core-contact-step.test.mjs@2a1b29ac`) balances 10 N on a point 0.04 m off centre with a stop (normal impulse
`10 * dt N s`, stop `0.4 * dt N m s`, zero acceleration). The fixture ends before the far limit: hard arrivals and rebounds are not read.
[Record](contact-stops.json).

```powershell
node research/contact-step.mjs
node research/contact-linked.mjs
node research/contact-stops.mjs
```
