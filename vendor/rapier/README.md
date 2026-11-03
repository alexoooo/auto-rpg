# Rapier, vendored

The core's physics engine is Rapier's 3D SIMD build (`@dimforge/rapier3d-simd-compat`), built
here from Rapier's source at commit `b716d375efc0201003f0cd9ef7168eee0b62c177`
(`js-v0.21.0`) with our patch, and installed from the tarball `package.json` names.

- Package `0.21.0-auto-rpg.10`, archive SHA256
  `317197f478ddd9b7a09846c1683269ed52d583e91f7f283e009e689e25e75318`. The adapter's snapshot
  revision, `REVISION` in `src/core/engine/rapier.ts`, is `adapter-12` and that hash: a snapshot
  loads only into the package and adapter that wrote it.
- `package.json` and the lockfile name the archive, with SHA512 integrity from its bytes;
  `npm ci` installs it. Rust is needed only to rebuild.
- `node research/rapier-package-parity.mjs --reference <unpacked npm 0.21.0 package>` plays three
  arena recipes on stock Rapier and on this package and compares their digests.

- `auto-rpg.patch`: our change to Rapier, against `js-v0.21.0` (Rapier 0.36.0, its JavaScript
  bindings 0.21.0).
- `build.sh`: Rapier's own build pipeline for the one variant the core uses, from a clone of
  Rapier at the tag with the patch applied, to the tarball.
- `rustc-wrapper.cjs`: gives crates stable package/version/target/feature identities instead of
  Cargo's checkout-dependent metadata. This affects symbol names and constant layout, not
  compiler optimization or the physics configuration. It is scoped to this pinned build.
- `dimforge-rapier3d-simd-compat-<version>.tgz`: the built package. `npm ci` installs it, so
  nothing here needs Rust unless the patch or the tag changes.

The physics bench's plain build (`@dimforge/rapier3d-compat`) stays npm's; its SIMD adapter
uses this vendored package. The package layout remains compatible with the bench's file reads.

## What the patch does

Each addition leaves a caller that does not use it with Rapier's behaviour to the bit. Rapier's own
test of the bounds (`motor_force_bounds_are_signed_and_max_force_keeps_them_symmetric`,
`generic_joint.rs`) passes.

- **Signed motor bounds.** A motor's force has a lower bound of its own (`JointMotor::min_force`,
  `set_motor_force_bounds`); `set_motor_max_force` sets both, as upstream. A motor's force and
  impulse are those applied to the joint's first body, the parent: a negative force turns the
  child toward the axis's positive sense.
- **Joint readings and setters.** The binding reads a joint's impulses in the last solver
  substep: a motor's (`jointMotorImpulse`), a limit's (`jointLimitImpulse`) and a locked axis's
  (`jointLockedImpulse`); it sets an impulse joint's motor bounds (`jointSetMotorForceBounds`),
  and a multibody joint's limits, motor and bounds (`jointSetLimits`, `jointConfigureMotor`,
  `jointSetMotorForceBounds`).
- **Whole-step motor impulse** (`jointMotorStepImpulse`): the signed sum over every solver
  substep, CCD subdivisions included, reset once a pipeline step, accumulated in double precision
  (single-precision sums of many substeps drift off a motor's cap), serialized with the joint and
  never a warm-start seed: an observation, not a solver input. Scalar, SIMD and external multibody rows
  contribute; internal multibody motors have no readback. It is not work or an absolute effort.
- **CCD-only pair filtering** (`ActiveHooks.FILTER_CCD_PAIRS`) runs the pair filter for sweeps
  without disabling contact recycling, so connected-pair exclusions reach continuous collision
  detection: a CCD sweep otherwise ignores a joint's exclusion, and a gripped item, which overlaps
  its hand by construction, would hit it.
- **Contact readings.** `solverContactSeparation` projects the separation of the solver's two
  anchors, resolved through the current poses, on its normal (`solverContactDist` keeps its
  upstream meaning, a cached distance). `totalSolverContactImpulse` sums the normal impulses of
  the points current solver contacts reference, each once, in double precision. Neither changes
  contact solving.
- **Pair-local compliant contact** (`PhysicsHooks.contactLayer`): spring stiffness, damping and
  maximum compression for a manifold, an implicit normal row with a rigid depth backstop, and
  `contactLayerWork`, the reaction times anchor displacement over substeps. Parameters and
  readings are serialized. The core installs no layer: every contact it makes is rigid.
- **Angular-limit gradients** (`coordinateAngularLimits`): impulse-joint and external limit rows
  follow the spatial gradient of their reported coordinate; motor rows are unchanged. Serialized;
  the adapter's `rapier-coordinate`. For the relative rotation `q = (w, x, y, z)` the limited
  coordinate is `theta_i = 2 atan2(q_i, w)`; with `j = (i + 1) mod 3`, `k = (i + 2) mod 3` its
  gradient in the parent's joint frame is `g_i = 1`, `g_j = (q_i q_j + w q_k) / (w^2 + q_i^2)`,
  `g_k = (q_i q_k - w q_j) / (w^2 + q_i^2)`. The parent-axis row omits the cross terms, so motion
  about the other axes can carry the angle through a limit unseen. At `q_i = w = 0` the coordinate
  is undefined and the parent-axis row is kept.
- **Friction selection** (`pointContactFriction`): the native per-point Coulomb model for rigid
  bodies in place of central and twist friction (multibody contacts always use it). The patch
  adds only accessors; the adapter refuses snapshots across the two configurations.
- **Bulk calls**, each one crossing into the wasm with a typed array the caller keeps, each value
  the one the per-item calls give, widened to double precision:
  - `RawNarrowPhase.contact_readings(bodies, handles, out)`: every contact of the listed
    colliders, in their order: each pair as `contact_pairs_with` gives them (the other collider,
    whether the pair names it first), each manifold's solver contact count, normal and
    `totalSolverContactImpulse`, and each solver contact's point and current-pose separation. It
    returns how many numbers that takes, and writes them only if `out` is that long.
  - `RawImpulseJointSet.jointSetMotors(commands, count)`: motor commands, seven numbers each, made
    by the setter calls each stands for, in order: a velocity motor with a maximum force or with
    signed bounds, or a force-based spring with signed bounds.
  - `RawRigidBodySet.rbPosesAndVelocities(handles, out)`: each listed body's translation,
    rotation, linear and angular velocity, thirteen numbers a body.

## Building

Needs git, bash (Git Bash on Windows), Node and npm, and Rust with the `wasm32-unknown-unknown`
target (`rustup target add wasm32-unknown-unknown`). wasm-pack 0.12.1 and wasm-bindgen 0.2.129 come
pinned by Rapier's own lockfiles. The archive is built with rustc 1.97.1 and Node 24.15.0; the
build reproduces its bytes only on that toolchain.

```bash
bash vendor/rapier/build.sh   # RAPIER_WORK=<dir> to choose the work tree; CARGO_BUILD_JOBS to spare the machine
```

The work tree (Rapier's source, its packages and its Rust target, a few GB) defaults to
`.tools/rapier-build`, ignored by Git. `RAPIER_WORK` selects another isolated directory;
`RAPIER_SOURCE` can name a local source mirror instead of GitHub. The tag must resolve to the
pinned commit. The script resets only a work tree bearing its own marker and refuses a symlinked
source directory or an existing unmanaged tree. Do not use a development checkout as its work tree.
The script remaps diagnostic source and Cargo paths, writes the declarations with LF, and uses the
metadata wrapper for the WASM build; all are needed to reproduce its bytes in another directory.
`build.sh` checks no hash, and at an unchanged `VERSION` it packs over the committed archive. A
reproduction is checked by hand: build, compare the archive's SHA256 (`sha256sum`) with the one
above, and commit only an archive whose hash matches; otherwise restore the archive from Git.

## Changing it

1. Change Rapier in the work tree's clone (or a clone of your own at the tag), and write the patch
   again: `git diff js-v0.21.0 > <repo>/vendor/rapier/auto-rpg.patch`.
2. Raise `VERSION` in `build.sh` (`0.21.0-auto-rpg.N`), and run it. Set `REVISION` in
   `src/core/engine/rapier.ts` (`rapier/adapter-<n>/sha256:<archive hash>`) to the new archive's
   SHA256, and this README's package and hash with it.
3. Point `package.json` at the new tarball. Update the matching root dependency and installed
   package record in `package-lock.json`, including the tarball's SHA512 integrity, then run
   `npm ci`. Remove an old archive only once nothing references it.
4. `npm test`, `npm run check`, `npm run build`. A change meant to move no bout is checked to the bit:
   an arena bout's digest (`playBout(recipe, seconds).digest`, `research/bout.mjs`) before and
   after.

Taking a new Rapier is the same with `build.sh`'s `TAG` and `REVISION` set to the new tag and its
commit: the patch is applied to it, and where it no longer applies it is made again by hand.
Nothing upstream reaches the game until then.
