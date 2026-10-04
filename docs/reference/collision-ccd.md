# CCD against a moving thin defense

Harness: Node, NullEngine scene, core World, vendored Rapier `.2`, adapter 2, no gravity or
assists. `src/core/tasks/collision.ts` builds the same fixture for tests and the common runner.
These are numerical collision probes, not anatomical weapons, controllers or combat scores.

## Construction and controls

The free bar has mass 1 kg, centre at its origin, moments `[0.09, 0.0001125, 0.09]` kg m²,
and one capsule from `[0, -0.5, 0]` to `[0, 0.5, 0]` m with radius 0.015 m. The free defense
is a 10 kg box, size `[0.01, 0.02, 1]` m, with the uniform box's principal moments. It starts
at `[0.4, height, 0]` m with velocity `[-1, 0, 0]` m/s. Both start unrotated.

These dimensions and inertias are engineering stress-fixture inputs. The bar's supplied inertia
is independent of its massless collider. There is no claim that it describes a solid uniform rod.
The defense's very narrow face makes a collision possible between consecutive sampled poses.

In `linear`, an initial central impulse gives the bar 120 m/s along x. In `rotate`, an initial
angular impulse gives 80 rad/s about z. No force or controller acts afterward. A trial watches
5/120 s. The seed changes defense height around 0.25 m by at most 0.002 m, using the common
runner's deterministic fraction. The same starts run with the bar's moving-body CCD false/true;
the defense's flag remains false. No collision-group exclusion removes their pair.

The pinned engine automatically sweeps sufficiently fast dynamic bodies against fixed colliders.
Its explicit CCD flag adds dynamic/kinematic targets. This is stated in the pinned native
`src/dynamics/rigid_body.rs` (`enable_ccd`, `is_ccd_enabled`) and
`rigid_body_components.rs` (`RigidBodyCcd`), and a fixed-wall probe gives the same clamped
motion with either flag. A fixed-wall-only experiment cannot validate moving-defense coverage.

`PhysicsWorld.addBody` accepts immutable construction option `{ ccd: true }`, and separate
equipment forwards its `ccd` configuration. The default remains false for compatibility.
The equipment test launches a sourced wooden club at a moving defense to check the whole path.

## Recorded results

Reproduce with:

```powershell
node research/control-foundation.mjs --suite ccd --actuation directional --samples 2 --workers 2 --out research/runs/control-foundation/ccd-120
node research/control-foundation.mjs --suite ccd --actuation directional --samples 2 --hz 480 --workers 2 --out research/runs/control-foundation/ccd-480
```

Both runs use source content hash
`a8dbcbababe7e25be25462745ea0f358e0d944a161e4c59fbc7a5352073e3d3e`.
[The durable results](collision-ccd.json) contain manifests and every sampled pose/velocity/contact
row. Each run also archives its source under the manifest's hash. Development seeds 0 and 1
are used; no held-out seeds were consumed.

| Physics Hz | Motion | Moving-body CCD | Contact within watch | First positive contact impulse, each seed |
|---|---|---|---|---|
| 120 | Linear | false | 0/2 | None |
| 120 | Linear | true | 2/2 | Step 2 (16.667 ms) |
| 120 | Rotation | false | 0/2 | None |
| 120 | Rotation | true | 2/2 | Step 5 (41.667 ms) |
| 480 | Linear | false | 0/2 | None |
| 480 | Linear | true | 2/2 | Step 3 (6.25 ms) |
| 480 | Rotation | false | 0/2 | None |
| 480 | Rotation | true | 2/2 | Step 14 (29.167 ms) |

Every trial replays exactly from its initial physics/clock save. All trajectories are sampled
at 120 Hz: the 480 Hz rows are steps 4, 8, 12, 16 and 20. Contact onset is additionally read
at every physics step. These results establish collision detection in these fixtures, not rate
convergence of the impulse or a general guarantee against tunnelling.

CCD clamps motion before an ordinary contact impulse may be reported on the following step.
Thus a collision event's timestamp is not necessarily the swept time of impact, and positional
motion lost to clamping is not a measured actuator/contact work budget. The force readings are
the adapter's narrow-phase normal impulses, not an integrated work calculation. Parallel-run
timings are recorded only as diagnostics; they are not a performance comparison.

`tests/core-collision.test.mjs` requires physical contact and changed defense momentum for both
motions, exact replay, separate control denominators and the declared sample spacing. The
discrete controls must miss. `tests/core-equipment.test.mjs` separately checks equipment's
forwarding of CCD through an actual collision. Character-held weapons, grip exclusions in an
anatomical closed loop and visible-browser cost remain separate gates.
