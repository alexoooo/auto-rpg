# Contact geometry and force reference points

Harness: Node stand, core World/Rapier `.2`, 120 Hz, no assist. These are mechanical/model
checks, not a passed get-up battery.

## Ground force and the tracked point

`Limb.work.at` is the point whose motion the controller asks for. A ground patch has its own
force reference: a sole's middle or a point contact itself (`patchPlace`). Its reported moment
is about that reference. Carrying the wrench to a joint must use the patch reference too:

`jointTorque = axis · (moment + (patchPlace - jointPivot) × force)`.

The bearing controller used the tracked point for this lever in both muscle torque calculation
and effort-weighted load sharing. That was harmless when both points coincided, but wrong for
a controller tracking one material point while a distributed patch bore elsewhere. Both paths
now read the patch reference. Motion Jacobians continue to use the tracked point.

`tests/core-bearing.test.mjs` constructs the actual Warrior under directional actuation and
asks zero root/joint acceleration with both soles bearing. Each foot carries more than 100 N.
It compares the complete command and load-sharing records before and after translating the
motion reference by `[0.12, 0.03, -0.17]` m, leaving the patch and physical state unchanged.
The records must be identical, with and without effort weighting.

For the unweighted first-step probe, before the correction the largest requested activation
changed from 0.1248965 to 1 solely because the motion reference moved. After correction both
reads give 0.1248965, and their full records are exactly equal. These are requested activations,
not measured delivered torque or a dynamic movement peak. The test fails on the original code.

## Unaveraged manifold geometry

`PhysicsWorld.contactManifoldsOf` reads each shape pair's solver points, signed gaps, normal,
body/fixed identity and stored normal impulse before averaging. Returned numbers and arrays are
detached from the solver. It obeys the same filtering/error/reentrancy rules as `contactsOf`.
The existing aggregate contact API and gameplay observations are unchanged.

A positive gap is a speculative, separated contact. Its presence is not proof of support;
neither is an impulse-free contact automatically a load-bearing support. The impulse is the
narrow phase's stored value, not a new whole-step accumulated contact/work measurement.

`contactMotionRows` maps each world contact to a rigid-body normal closing-velocity row about
an explicit reference point. With `r = contactPoint - reference` and normal `n` from this body
into the other, that row is `[r × n, n]` on `[angularVelocity, referenceVelocity]`.
A positive value closes toward the other surface. A controller must subtract the other body's
point velocity and handle unilateral separation and friction; these rows do not weld contacts.
Acceleration constraints additionally require motion bias and the other body's acceleration.

`tests/core-contact-motion.test.mjs` uses a 1 kg capsule with axis endpoints z = ±0.3 m,
radius 0.05 m, centre initially y = 0.05 m, moments `[0.04, 0.04, 0.0005]` kg m², on a level
fixed floor. These are synthetic fixture numbers, not anatomy. After one gravity step:

- The solver points span more than 0.59 m; replacing them with their average loses this span.
- Unit transverse tilt closes one endpoint at more than 0.29 m/s and opens the other.
- Rolling, yaw and tangential translation are free in the normal rows to the solver normal's
  2e-6 precision tolerance. Upward translation opens all contacts.
- The row agrees with directly calculated point velocity to 1e-12 at an offset reference.
- Geometry replays with the physics snapshot; two contacting dynamic bodies report opposite
  normal conventions and retain their identities.

A separate gravity-free capsule 0.01 m above the floor reports positive gaps and zero impulse.
Filtering, reader exceptions and mutation of a returned array cannot change the physical world.

The staged riser still builds predicted hand/shin supports from its existing geometric rules.
The new manifold/model port is ready for the shared contact controller; it does not by itself
correct its shin/foot load path, support transitions or the flat-hand stall. Those remain open
physical capability gates.

## Compatibility check

`node research/control-foundation.mjs --suite baseline --actuation symmetric --samples 2 --workers 4 --out research/runs/control-foundation/contact-reference-baseline`
repeats all 138 stock screening rows. Outcomes and physical readings, excluding timing, match
the stock record exactly. Source content hash is
`2e8fd86d176326aa7ef022bbe480dbd1d69d3200f2b9c220d683c23cc0efc79a`;
the run archives that source. This confirms compatibility where patch and tracked point already
coincide; it is not a passed directional recovery gate.
