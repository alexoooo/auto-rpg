# CCD against a moving thin defense

Whether moving-body continuous collision detection catches a fast bar against a thin moving
defense. `src/core/tasks/collision.ts` builds the fixture for tests and the common runner; the
engine contract's CCD option (`src/core/engine/engine.ts`) cites the engine's default behaviour
recorded here. The numbers are engineering stress inputs, not weapons, controllers or scores.

## Construction and controls

- **Bar**: 1 kg, centre at its origin, moments `[0.09, 0.0001125, 0.09]` kg m², one capsule from
  `[0, -0.5, 0]` to `[0, 0.5, 0]` m, radius 0.015 m. Its inertia is supplied apart from the
  massless collider; it does not claim to be a uniform rod.
- **Defense**: a free 10 kg box `[0.01, 0.02, 1]` m with the uniform box's moments, at
  `[0.4, height, 0]` m moving `[-1, 0, 0]` m/s. Its narrow face lets a collision fall between two
  sampled poses.
- **Motions**: `linear`, a central impulse giving the bar 120 m/s along x; `rotate`, an angular
  impulse giving 80 rad/s about z. Nothing acts afterward; a trial watches 5/120 s.
- The seed moves the defense's height about 0.25 m by at most 0.002 m. The same starts run with
  the bar's CCD off and on; the defense's stays off, and no collision group excludes the pair.

The pinned engine sweeps fast dynamic bodies against fixed colliders by default; the CCD flag adds
dynamic and kinematic targets (native `src/dynamics/rigid_body.rs`, `enable_ccd`,
`is_ccd_enabled`; `rigid_body_components.rs`, `RigidBodyCcd`). A fixed wall gives the same clamped
motion with either flag, so it cannot test a moving defense.

`PhysicsWorld.addBody` takes `{ ccd: true }` at construction, and separate equipment forwards its
`ccd` configuration; the default is off. `tests/core-equipment.test.mjs` launches the wooden club
at a moving defense through that path.

## Recorded results

Node, NullEngine scene, core World, vendored Rapier `.2`, adapter 2, no gravity or assists;
development seeds 0 and 1; source content hash
`a8dbcbababe7e25be25462745ea0f358e0d944a161e4c59fbc7a5352073e3d3e`.
[The records](collision-ccd.json) hold the manifests and every sampled row.

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

Every trial replays exactly. Trajectories are sampled at 120 Hz; contact onset is read every
physics step. CCD clamps motion before the ordinary contact impulse, which may come on the next
step, so an event's time is not the swept time of impact, and the impulses are the narrow phase's
normal impulses, not work. This shows detection in these fixtures, not a guarantee against
tunnelling. `tests/core-collision.test.mjs` requires contact and changed defense momentum with CCD,
misses without it, and exact replay.

```powershell
node research/control-foundation.mjs --suite ccd --actuation directional --samples 2 --workers 2 --out research/runs/control-foundation/ccd-120
node research/control-foundation.mjs --suite ccd --actuation directional --samples 2 --hz 480 --workers 2 --out research/runs/control-foundation/ccd-480
```
