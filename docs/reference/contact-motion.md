# Contact geometry and force reference points

Three pieces of contact geometry the controllers read: the point a ground patch's moment is taken
about, the unaveraged manifold with its normal motion rows, and the current-pose separation of a
solver contact. Node stand, core World/Rapier, 120 Hz, no assist; model checks, not a get-up.

## Ground force and the tracked point

`Limb.work.at` is the point whose motion the controller asks for; a ground patch has its own force
reference (`patchPlace`: a sole's middle, or a point contact itself), about which its moment is
reported. Carrying the wrench to a joint uses the patch reference:

`jointTorque = axis · (moment + (patchPlace - jointPivot) × force)`.

Muscle torque and effort-weighted load sharing read the patch reference; motion Jacobians read the
tracked point. `tests/core-bearing.test.mjs` builds the Warrior under directional actuation, both
soles bearing over 100 N, asks zero acceleration, and requires identical command and load-sharing
records after moving the motion reference by `[0.12, 0.03, -0.17]` m. With the tracked point as the
lever, the largest requested activation read 1 instead of 0.1248965.

## Unaveraged manifold geometry

`PhysicsWorld.contactManifoldsOf` reads each shape pair's solver points, signed gaps, normal,
body/fixed identity and stored normal impulse before averaging, detached from the solver, with
`contactsOf`'s filtering and reentrancy rules. A positive gap is a speculative contact: neither it
nor an impulse-free contact proves support, and the impulse is the narrow phase's stored value.

`contactMotionRows` maps each contact to a normal closing-velocity row about a reference point: with
`r = contactPoint - reference` and normal `n` into the other body, `[r × n, n]` on
`[angularVelocity, referenceVelocity]`, positive closing. A controller still subtracts the other
body's point velocity and handles separation and friction; the rows weld nothing.

`tests/core-contact-motion.test.mjs`: a 1 kg capsule (axis z = ±0.3 m, radius 0.05 m, moments
`[0.04, 0.04, 0.0005]` kg m²) on a level floor, after one gravity step:

- the solver points span more than 0.59 m, which their average loses;
- unit transverse tilt closes one end at more than 0.29 m/s and opens the other;
- rolling, yaw and tangential translation are free in the rows to 2e-6; upward translation opens
  every contact;
- the row matches directly computed point velocity to 1e-12 at an offset reference;
- geometry replays with the snapshot, and two dynamic bodies report opposite normals.

## Current-pose separation

The native solver stores `SolverContact.dist` at the last full narrow-phase update, while contact
recycling and substeps rebuild live separation from body-local anchors, so upstream's
`solverContactDist` paired with a current-pose `solverContactPoint` mixes two times. The vendored
`solverContactSeparation` rebuilds both anchors with `solver_contact_world_points` (contact skins
and world-attached sides included) and returns `(point2 - point1) · normal`: the solver's current
anchor separation along its normal, not a fresh closest-surface query. The adapter reads it.

A sphere of radius 0.05 m starting 0.01 m clear (Node core-engine fixture, 120 Hz): after the first
gravity step the cached reading is 0.0099999979 m and the geometric clearance 0.0096382134 m. The
regression requires agreement within 2e-6 m through settling and a later 0.1 N s upward impulse,
and a retained separated contact must report lift-off.

## Measurement

The common baseline's 138 stock rows repeat exactly, timing excluded (source content hash
`2e8fd86d176326aa7ef022bbe480dbd1d69d3200f2b9c220d683c23cc0efc79a`):

```powershell
node research/control-foundation.mjs --suite baseline --actuation symmetric --samples 2 --workers 4 --out research/runs/control-foundation/contact-reference-baseline
```
