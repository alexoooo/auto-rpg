# Rapier package and physical parity

The core installs `@dimforge/rapier3d-simd-compat` from the committed archive in `vendor/rapier`.
The plain package used by the bench remains npm's. The engine adapter exposes directional motor
bounds and accumulated effort. The muscle driver selects symmetric reference or directional
bounds from immutable world configuration. Gameplay retains the reference while corrected-law
control is measured separately in the [common battery](control-foundation.md).

## Source and installation

- Upstream commit: `b716d375efc0201003f0cd9ef7168eee0b62c177`, tag `js-v0.21.0`.
- Patch: `vendor/rapier/auto-rpg.patch`. It adds signed motor bounds with symmetric defaults,
  last-substep motor/limit/locked-axis impulse reads, whole-step motor impulse, and multibody setters.
- Package version: `0.21.0-auto-rpg.2`.
- Archive SHA256: `2787130f67465fa8fb07bf4217b0b2fab1681a416b99668ac831e1129b810122`.
- Build toolchain: Rust 1.97.1, Node 24.19.0; wasm-pack 0.12.1 and wasm-bindgen 0.2.129 from
  the upstream lockfiles. The build remaps source/cache paths and writes declarations with LF.
- Installation: package metadata and lockfile name the same archive; SHA512 integrity is
  computed from its bytes. `npm ci --offline --no-audit --no-fund` successfully installs it
  with the existing cache. Rust is needed only to rebuild the package.

`jointMotorImpulse` reads the last solver substep. `jointMotorStepImpulse` sums every solver
substep, including CCD subdivisions, with one reset at the start of the pipeline step, including
inactive joints. Its force acts on the parent; the engine contract's `motorStepImpulse` converts
to the child's sign. The muscle driver's `pulled` divides that impulse by the world step's
duration and converts to the channel's sign. Both readings survive save/load.

The sum includes each substep's final motor impulse, including warmstarting and solver
corrections, without changing constraint solving. SIMD padding lanes count once. External
multibody constraint rows contribute to the impulse joint's total; internal multibody motors
still have no effort readback. Signed impulse is not work, and cancellation within a step means
its magnitude is not an integral of absolute torque.

## Effort checks

Harness: Node, core engine adapter, Rapier SIMD, no gravity or assists. A centred rotor on a fixed
parent has no external moment. At 120, 240 and 960 Hz, its step impulse agrees with both the
directional torque bound times the step and its change in angular momentum, in either direction.
The single-precision momentum comparison allows relative error `1e-5`; it rejects reading only
one of the solver's 16 substeps.

At 120 Hz, a rotor with inertia `0.2 * 0.2 / 6 kg m²`, target `0.07 rad/s` and a `0.12 N m`
ceiling reaches the target before the final substep. The accumulated impulse is approximately
`0.000466667 N m s`, while the last substep supplies essentially zero. A snapshot restores the
reading immediately and reproduces the next step exactly. Disabled motors and inactive joints
clear nonzero readings. Separate islands with 0, 4 and 12 extra solver iterations retain their
correct totals during a fast sphere's CCD collision with a thin wall.

`tests/core-engine.test.mjs`, `core-rapier-effort.test.mjs` and the muscle readback regression
exercise these paths. The vendored Rust regression
`step_motor_impulse_includes_every_substep_and_resets` also checks a real rotor; native 3D
motor tests and shared 2D bounds tests pass with serialization enabled. Corrected muscle bounds
and their control retuning remain separate work.

## Current-code parity

Harness: Node 24.19.0, arena core world, Rapier SIMD, 120 Hz, at most 12 s or the verdict,
balance 0% on both sides. The stock and installed packages run through the same
`createRapierPhysics` adapter and `playBout` path. Each package initializes its own WebAssembly
once. The comparison asserts equality of the entire returned record, not just the final winner.
Stock has no accumulated effort API: the parity harness explicitly marks that diagnostic
unavailable. The compared policies do not use it; effort is validated by the physical tests above.

```powershell
node research/rapier-package-parity.mjs --reference ../rapier-npm-pkg
```

The reference is an unpacked npm `@dimforge/rapier3d-simd-compat` 0.21.0 package, with its
`package.json` directly in that directory. Its ESM entry SHA256 is
`889ab6afcdb530ab41c08a6e72400876c5b17e8573e5b21973d7ce431c9267bf`.

| Recipe | Stock digest | Vendored digest |
|---|---|---|
| Warrior / Rogue, default gap | `e71c657a6924a58c` | `e71c657a6924a58c` |
| Warrior / Warrior, gap 3 m | `dfbe30c2743645db` | `dfbe30c2743645db` |
| Rogue / Skeleton, gap 3.5 m | `a4c192dbe518bc26` | `a4c192dbe518bc26` |

The earlier fork experiment's digests belong to its game revision. They do not match current
code even on stock Rapier; changing the package is judged against stock on the same code.

The [common task baseline](control-foundation.md#stock-baseline) also repeats unchanged:
138/138 rows equal the preserved stock record after excluding wall-clock timing, including
every outcome, sampled pose digest, joint-anchor error, fixed-contact impulse and assist reading.
The six unsupported rows remain unsupported. This proves parity on the measured cases, not
equivalence for every possible simulation or improved control from the new motor bounds.

## Rebuilding

`vendor/rapier/build.sh` accepts a fresh `RAPIER_WORK` directory and optional local mirror in
`RAPIER_SOURCE`. It refuses to reset an existing unmanaged checkout and verifies the source tag
against the pinned commit. A build in another directory must reproduce the archive hash for its
version before replacing it. Re-run package parity and the task baseline if any physical source changes.

The original `.1` archive built under the sibling experiment's cache and the fresh build under
`.tools/rapier-rebuild-a` have identical bytes, SHA256
`b9f7c0017c02ced5a9632dffba6805fcffb43ba12cfff2fa6c6b72d98dd3c155`, with the same declared toolchain.
The fresh build used the existing local upstream mirror, `CARGO_BUILD_JOBS=4`, and the committed
patch. Its source, generated files and Rust output all lived in the new managed directory.
This establishes path-independent reproduction on that toolchain, not across arbitrary compilers.
The `.2` package uses the same build pipeline with the accumulated-impulse patch and regression.

Validation of `.2`: `npm ci --offline --no-audit --no-fund`, `npm run check`, `npm run build`,
and the full suite (679 tests: 676 pass, no failures, three existing TODOs). The baseline replay
at `research/runs/control-foundation/effort-baseline-v2` matches all 138 preserved stock physical
records, excluding wall-clock timing. The previously pending delivered-torque regression passes.
