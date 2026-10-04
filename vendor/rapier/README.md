# Rapier, vendored

The core's physics engine is Rapier's 3D SIMD build (`@dimforge/rapier3d-simd-compat`), built
here from Rapier's source at commit `b716d375efc0201003f0cd9ef7168eee0b62c177`
(`js-v0.21.0`) with our patch, and installed from the tarball `package.json` names.
The reproduction and parity results are in
[the engine record](../../docs/reference/rapier-vendor.md).

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

- **A motor's force has a lower bound of its own** (`JointMotor::min_force`,
  `set_motor_force_bounds`), where Rapier bounds it by `-max_force`. `set_motor_max_force` sets
  both, as before, so a caller that never sets them apart gets Rapier's behaviour to the bit.
- **The binding reads a joint's impulses** in the last solver substep: a motor's
  (`jointMotorImpulse`), a limit's (`jointLimitImpulse`) and a locked axis's
  (`jointLockedImpulse`); and it sets an impulse joint's motor bounds
  (`jointSetMotorForceBounds`). A multibody joint gains `jointSetLimits`, `jointConfigureMotor` and
  `jointSetMotorForceBounds`.
- **Whole-step motor impulse** (`jointMotorStepImpulse`) sums every solver substep, including
  CCD subdivisions, and resets once per pipeline step even for inactive impulse joints. It is
  serialized with the joint, and never used as a warm-start seed. Scalar, SIMD (without duplicate
  padding lanes) and external multibody constraint rows contribute; internal multibody motors
  have no effort readback. This is signed impulse, not work or an absolute effort integral.
- A motor's force and impulse are the ones applied to the joint's first body, the parent: a
  negative force turns the child toward the axis's positive sense.
- **CCD-only pair filtering** (`ActiveHooks.FILTER_CCD_PAIRS`) calls the pair filter for sweeps
  without disabling ordinary contact recycling. It lets the adapter apply connected-pair
  exclusions to continuous collision detection; see [grip clearance](../../docs/reference/grip-clearance.md).
- Rapier's own test of the bounds (`motor_force_bounds_are_signed_and_max_force_keeps_them_symmetric`,
  `generic_joint.rs`) passes.

## Building

Needs git, bash (Git Bash on Windows), Node and npm, and Rust with the `wasm32-unknown-unknown`
target (`rustup target add wasm32-unknown-unknown`). wasm-pack 0.12.1 and wasm-bindgen 0.2.129 come
pinned by Rapier's own lockfiles. Built with rustc 1.97.1 and Node 24.19.

```bash
bash vendor/rapier/build.sh   # RAPIER_WORK=<dir> to choose the work tree; CARGO_BUILD_JOBS to spare the machine
```

The work tree (Rapier's source, its packages and its Rust target, a few GB) defaults to
`.tools/rapier-build`, ignored by Git. `RAPIER_WORK` selects another isolated directory;
`RAPIER_SOURCE` can name a local source mirror instead of GitHub. The tag must resolve to the
pinned commit. The script resets only a work tree bearing its own marker and refuses a symlinked
source directory or an existing unmanaged tree. Do not use a development checkout as its work tree.
The script remaps diagnostic source paths and uses the metadata wrapper for the WASM build;
both are needed to reproduce its bytes in another directory.

## Changing it

1. Change Rapier in the work tree's clone (or a clone of your own at the tag), and write the patch
   again: `git diff js-v0.21.0 > <repo>/vendor/rapier/auto-rpg.patch`.
2. Raise `VERSION` in `build.sh` (`0.21.0-auto-rpg.N`), and run it.
3. Point `package.json` at the new tarball. Update the matching root dependency and installed
   package record in `package-lock.json`, including the tarball's SHA512 integrity, then run
   `npm ci`. Remove an old archive only once nothing references it.
4. `npm test`, `npm run check`, `npm run build`. A change meant to move no bout is checked to the bit:
   an arena bout's digest (`playBout(recipe, seconds).digest`, `research/bout.mjs`) before and
   after.

Taking a new Rapier is the same with `TAG` and `REVISION` raised: the patch is applied to it, and where it no
longer applies it is made again by hand. Nothing upstream reaches the game until then.
