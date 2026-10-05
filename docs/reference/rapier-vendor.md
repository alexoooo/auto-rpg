# Rapier package and physical parity

The core installs `@dimforge/rapier3d-simd-compat` from the committed archive in `vendor/rapier`.
The plain package used by the bench remains npm's. The engine adapter exposes directional motor
bounds and accumulated effort. The muscle driver selects symmetric reference or directional
bounds from immutable world configuration. Gameplay retains the reference while corrected-law
control is measured separately in the [common battery](control-foundation.md).

## Source and installation

- Upstream commit: `b716d375efc0201003f0cd9ef7168eee0b62c177`, tag `js-v0.21.0`.
- Patch: `vendor/rapier/auto-rpg.patch`. It adds signed motor bounds with symmetric defaults,
  last-substep motor/limit/locked-axis impulse reads, whole-step motor impulse, multibody setters,
  CCD-only pair filtering that preserves ordinary contact recycling, and current-pose
  solver contact separation, an opt-in measured-angle gradient for angular limits, and accessors
  for the native rigid-body friction-model selector.
- Package version: `0.21.0-auto-rpg.6`.
- Archive SHA256: `07af259dc277cac77daa9c95eaded0ed2bc8aeb5feac08bfd9e58d23e58feebd`.
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

The `.3` archive reproduces byte for byte in `.tools/rapier-rebuild-a` and
`.tools/rapier-rebuild-b`. Path remapping alone left 76 differing WASM bytes: three data objects
changed order and their references changed with them. Single-threaded linking did not change
that result. The build's compiler wrapper replaces Cargo's checkout-dependent crate metadata
with a hash of package/version, crate name/type, target and selected features. Both the raw
linked WASM and the final archives then match. This is scoped to the pinned release pipeline;
it does not assert reproducibility across toolchains or configurations.

The `.3` collision change and native regression are recorded in [grip clearance](grip-clearance.md).
Validation of `.3`: offline `npm ci`, type checking, production build, and 721 tests (719 pass,
zero failures, two existing TODOs). The three package-parity bouts retain the digests above.
All 138 physical baseline rows equal stock, excluding wall-clock timing, in
`research/runs/control-foundation/ccd-filter-baseline-v3`; archived source SHA256
`12c96f36b94ff0b9418fae42f88c6cf249e1c4a2f6d8d33ad4bd4dbe2f70cd84`.
The installed CJS entry SHA256 is
`a1fa07eb651dfa34a44ff68fa1059ac32c8d366fb18efcf0e9b965d9f051d618`.

Validation of `.2`: `npm ci --offline --no-audit --no-fund`, `npm run check`, `npm run build`,
and the full suite (679 tests: 676 pass, no failures, three existing TODOs). The baseline replay
at `research/runs/control-foundation/effort-baseline-v2` matches all 138 preserved stock physical
records, excluding wall-clock timing. The previously pending delivered-torque regression passes.

The `.4` read-only binding corrects the model port's cached gap, as recorded in
[contact motion](contact-motion.md#current-pose-separation). Two managed rebuild directories
produce the identical archive, SHA256
`58ff3f5e80911ceefd46ff7d03fb77858d54d6c0062fb3c44229fb7b045e8676`;
offline `npm ci` installs it. Adapter revision 5 exposes
the current-pose reading. The installed CJS entry SHA256 is
`b606f739d3b53c5e774308dc4c566d83616951e08063e81a18a8d798f9c64762`.
Validation of `.4`: 738 tests (736 pass, no failures, two existing TODOs), type checking and
production build pass. The three package-parity bouts retain the digests above. All 138
baseline records equal stock after excluding timing, in
`research/runs/control-foundation/contact-gap-baseline-v4`; archived source content SHA256
`7d674f595a32705decd1b5b11d9623011f02ffeef1450b6b9461b7f624e978ae`.

The `.5` package adds the opt-in [angular-limit correction](joint-limits.md). Adapter revision 6
identifies `rapier-coordinate` separately and rejects cross-configuration snapshots. The native
default remains parent-axis limits, as does gameplay. Corrected limits pass mechanical checks
but require controller migration; their task outcomes are not parity claims.

The `.5` archives from `.tools/rapier-rebuild-a` and `.tools/rapier-rebuild-b` are byte-identical
at SHA256 `2970fabe1650f5fb5eb0a55b28b72a729095fcddb98e58ed82b2d25861cebcc4`.
Offline installation, type checking and production build pass; the suite
reads 792 tests, 790 pass, zero failures and two existing TODOs. The installed CJS entry SHA256
is `db4bb690d953983eae032de094f67bb49674def40757f0d7b55e5f77d831eb3a`.
All 138 default physical rows equal `.4`, excluding timing, in
`research/runs/control-foundation/limit-reference-baseline-v5`; source content SHA256
`cd8a1186cfc93f6f1fd0283e84fce96d24f3e9ec92169a1574d96d22ddcd6d19`, manifest SHA256
`06010421afbb85f731ce5af4418942bb3c940686c05593869804e59314ea04e8`.
The three stock-package parity bout hashes above are unchanged. Browser and Node checks of both
configurations are recorded with the [limit measurements](joint-limits.md#package-and-browser-validation).

The `.6` package exposes native [friction-model selection](contact-friction.md), with no change
to either native solver or its default. Adapter revision 7 identifies the two additional
per-point profiles and checks friction selection when loading snapshots. Its archives from
`.tools/rapier-rebuild-a` and `.tools/rapier-rebuild-b` are byte-identical at the current SHA256
in the source section. The installed CJS entry SHA256 is
`d0e9b190bd0ec74136918a4268a00b4a3cb3e19e28bc8ab5d2fb055af01a7054`.

Offline installation, type checking and production build pass. The full suite reads 814 tests,
812 pass, zero failures and two existing TODOs. All 138 default physical rows equal a matched
`.5` run after excluding timing (`friction-v5-reference` and `friction-v6-reference` under
`research/runs/control-foundation`). The three stock-package parity bout hashes remain unchanged.
The friction fixture covers 48 cases across all four profiles, both translation/spin signs,
zero spin and both physics rates, with exact physical replay. The common CLI also records
the corrected-limit per-point profile and exact replay in two Warrior standing-bar trials,
releasing either hand, under `friction-v6-coulomb-bar`.

Built-browser and Node observation hashes and outcomes match for three standing-bar cases:
Warrior/corrected-limit per-point, Rogue/reference-limit per-point, and skeleton/gameplay
reference. All three return upright, contact the obstacle and replay exactly. Their full
configurations and results are in [the browser record](contact-friction-browser.json).
These development checks establish package/configuration behavior, not general recovery or a
reason to migrate gameplay to per-point friction.
