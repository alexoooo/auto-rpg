# Rapier package and physical parity

The core's Rapier: `@dimforge/rapier3d-simd-compat` built from a pinned upstream and a patch, and
installed from the committed archive in `vendor/rapier`. This records its identity (`REVISION` in
`src/core/engine/rapier.ts` cites it), what the patch adds, how its effort reading was checked, and
its parity with stock Rapier. The bench's plain package stays npm's.

## Source and installation

- Upstream commit `b716d375efc0201003f0cd9ef7168eee0b62c177`, tag `js-v0.21.0`; patch
  `vendor/rapier/auto-rpg.patch`.
- Package `0.21.0-auto-rpg.9`, archive SHA256
  `0bcb12014c0e982ea2bda99a3d1ab8e263bb81f0d2abcb7d2ade2b578b87b77c`; the adapter's snapshot
  revision is `adapter-12`.
- Toolchain: Rust 1.97.1, Node 24.15.0; wasm-pack 0.12.1 and wasm-bindgen 0.2.129 from the upstream
  lockfiles. Source and cache paths are remapped; declarations are written with LF.
- `package.json` and the lockfile name the archive, with SHA512 integrity from its bytes;
  `npm ci --offline --no-audit --no-fund` installs it. Rust is needed only to rebuild.

The patch adds signed motor bounds with symmetric defaults, last-substep motor, limit and
locked-axis impulse reads, multibody setters, and the features below by the package that brought
them. Ordinary contacts and joints solve as upstream's.

| Package | Adds | Archive SHA256 |
|---|---|---|
| `.1` | the first build | `b9f7c0017c02ced5a9632dffba6805fcffb43ba12cfff2fa6c6b72d98dd3c155` |
| `.2` | whole-step motor impulse (`jointMotorStepImpulse`) | |
| `.3` | CCD-only pair filtering, `FILTER_CCD_PAIRS` ([grip clearance](grip-clearance.md)) | |
| `.4` | current-pose solver contact separation ([contact motion](contact-motion.md#current-pose-separation)) | `58ff3f5e80911ceefd46ff7d03fb77858d54d6c0062fb3c44229fb7b045e8676` |
| `.5` | opt-in measured-angle gradient for angular limits ([joint limits](joint-limits.md)) | `2970fabe1650f5fb5eb0a55b28b72a729095fcddb98e58ed82b2d25861cebcc4` |
| `.6` | the native rigid-body friction-model selector ([contact friction](contact-friction.md)) | `07af259dc277cac77daa9c95eaded0ed2bc8aeb5feac08bfd9e58d23e58feebd` |
| `.7` | the whole-step accumulator in double precision ([effort precision](effort-precision.md)) | `1bb36b24cc07719a35bd7d078ba247bf476de23684bbade15d32fe33097a6dde` |
| `.8` | pair-local spring/damper normal rows with a rigid depth backstop, and signed whole-step contact reaction work | `983fdf9572894a7903a45d3e4286aad7919dc6a510fd58978fe01e8a4ee1c54f` |
| `.9` | active-contact impulse aggregation (`totalSolverContactImpulse`) | `0bcb12014c0e982ea2bda99a3d1ab8e263bb81f0d2abcb7d2ade2b578b87b77c` |

## Readings the adapter takes

- **Motor effort.** `jointMotorImpulse` reads the last solver substep; `jointMotorStepImpulse` sums
  every substep, CCD subdivisions included, reset once at the start of the pipeline step (inactive
  joints too). It acts on the parent; the engine contract's `motorStepImpulse` converts to the
  child's sign, and the muscle driver's `pulled` divides by the step and converts to the channel's
  sign. Both survive save/load. The sum includes warmstarting and corrections; SIMD padding lanes
  count once; external multibody rows count toward the impulse joint, internal multibody motors have
  no readback. Signed impulse is not work: cancellation within a step is lost.
- **Compliant contact.** `contactLayer` gives an admitted manifold's stiffness, damping and
  compression depth; `layerStiffness` and `contactLayerWork` expose its law and signed work, which
  accumulates from solver-anchor displacement and reaction impulse at every substep and resets once
  a step. Both survive snapshots; ordinary contacts keep the original row. The adapter gives no
  collider a compliant layer: every contact is rigid.
- **Active contact load.** `totalSolverContactImpulse` sums normal impulses only over the geometric
  points the current solver contacts reference, each once, in geometric order, in double precision;
  a discarded point's cached impulse adds nothing. Contact observations and the compliant layer read
  it. `tests/core-active-contact.test.mjs@2a1b29ac` loads a Lab fall checkpoint with four separated
  solver points and a fifth, discarded one holding a cached impulse, and reads zero load.
- The adapter also gives stable collider-shape replacement, admitted-pair clearance queries and
  grip observation for coarse hand poses; collider geometry restores through the native snapshot.

## Measurement

**Effort** (Node, core adapter, Rapier SIMD, no gravity or assists): a centred rotor on a fixed
parent at 120, 240 and 960 Hz reports a step impulse equal to the directional bound times the step
and to its change of angular momentum, either way, within `1e-5` (reading one of 16 substeps fails).
At 120 Hz a rotor of inertia `0.2 * 0.2 / 6 kg m²`, target `0.07 rad/s` and `0.12 N m` ceiling
reaches its target before the last substep: the accumulated impulse is about `0.000466667 N m s`,
the last substep's nearly zero. Snapshots restore it; disabled motors clear it; islands with 0, 4
and 12 extra iterations keep their totals through a CCD collision. Tests:
`tests/core-engine.test.mjs@2a1b29ac`, `tests/core-rapier-effort.test.mjs@2a1b29ac`, the native
`step_motor_impulse_includes_every_substep_and_resets`.

**Parity with stock** (Node 24.19.0, arena core world, 120 Hz, at most 12 s, balance 0 % a side): the
stock and vendored packages through the same `createRapierPhysics` and `playBout`, comparing the
whole returned record (stock has no accumulated effort; the harness marks it unavailable). The
reference is an unpacked npm 0.21.0 package, ESM entry SHA256
`889ab6afcdb530ab41c08a6e72400876c5b17e8573e5b21973d7ce431c9267bf`.

| Recipe | Stock digest | Vendored digest |
|---|---|---|
| Warrior / Rogue, default gap | `e71c657a6924a58c` | `e71c657a6924a58c` |
| Warrior / Warrior, gap 3 m | `dfbe30c2743645db` | `dfbe30c2743645db` |
| Rogue / Skeleton, gap 3.5 m | `a4c192dbe518bc26` | `a4c192dbe518bc26` |

Every package from `.2` to `.7` kept these digests and the
[common task baseline's](control-foundation.md#stock-baseline) 138 physical rows, timing excluded.
`.7` and `.8` give the same `84e3797a45f1d5aa` pose digest and ten blows in a 15 s Warrior/Rogue
bout. The compliant layer's two-sphere stand on `rapier-coordinate` at 120 Hz agrees with 960 Hz
within 10 % in all twelve cells of its grid (`docs/reference/reptile-bites.md@4ac44224`).

```powershell
node research/rapier-package-parity.mjs --reference ../rapier-npm-pkg
```

## Rebuilding

`vendor/rapier/build.sh` takes a fresh `RAPIER_WORK` directory and an optional local mirror in
`RAPIER_SOURCE`, refuses to reset an unmanaged checkout, and checks the tag against the pinned
commit. A build elsewhere must reproduce the archive's hash before replacing it; package parity and
the task baseline are read again whenever a physical source changes.

Builds in two managed directories (`.tools/rapier-rebuild-a`, `-b`) are byte-identical. Path
remapping alone left 76 differing WASM bytes (three data objects reordered), so the build's compiler
wrapper (`rustc-wrapper.cjs`) replaces Cargo's checkout-dependent crate metadata with a hash of
package and version, crate name and type, target and features. This holds for the pinned pipeline,
not across toolchains.
