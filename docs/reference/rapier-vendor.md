# Rapier package and physical parity

The core installs `@dimforge/rapier3d-simd-compat` from the committed archive in `vendor/rapier`.
The plain package used by the bench remains npm's. The engine adapter still uses symmetric
motor bounds; vendoring exposes additional capability without enabling different actuation.

## Source and installation

- Upstream commit: `b716d375efc0201003f0cd9ef7168eee0b62c177`, tag `js-v0.21.0`.
- Patch: `vendor/rapier/auto-rpg.patch`. It adds signed motor bounds with symmetric defaults,
  last-substep motor/limit/locked-axis impulse reads, and multibody setters.
- Package version: `0.21.0-auto-rpg.1`.
- Archive SHA256: `b9f7c0017c02ced5a9632dffba6805fcffb43ba12cfff2fa6c6b72d98dd3c155`.
- Build toolchain: Rust 1.97.1, Node 24.19.0; wasm-pack 0.12.1 and wasm-bindgen 0.2.129 from
  the upstream lockfiles. The build remaps source/cache paths and writes declarations with LF.
- Installation: package metadata and lockfile name the same archive; SHA512 integrity is
  computed from its bytes. `npm ci --offline --no-audit --no-fund` successfully installs it
  with the existing cache. Rust is needed only to rebuild the package.

A read of a motor's stored impulse is a read of the last solver substep. Its force acts on the
parent; the child's torque has the opposite sign. Last-substep torque is not the average or
integral over the world step. Accumulated effort and corrected directional actuation are separate
work from this package replacement.

## Current-code parity

Harness: Node 24.19.0, arena core world, Rapier SIMD, 120 Hz, at most 12 s or the verdict,
balance 0% on both sides. The stock and installed packages run through the same
`createRapierPhysics` adapter and `playBout` path. Each package initializes its own WebAssembly
once. The comparison asserts equality of the entire returned record, not just the final winner.

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
against the pinned commit. A build in another directory must reproduce the archive hash above
before replacing it. Re-run package parity and the task baseline if any physical source changes.

The original archive built under the sibling experiment's cache and the fresh build under
`.tools/rapier-rebuild-a` have identical bytes (SHA256 above), with the same declared toolchain.
The fresh build used the existing local upstream mirror, `CARGO_BUILD_JOBS=4`, and the committed
patch. Its source, generated files and Rust output all lived in the new managed directory.
This establishes path-independent reproduction on that toolchain, not across arbitrary compilers.
