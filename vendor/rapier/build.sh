#!/usr/bin/env bash
# Builds the vendored Rapier package: Rapier at TAG with auto-rpg.patch applied, its 3D SIMD
# compatibility package (`@dimforge/rapier3d-simd-compat`, the WebAssembly inlined), packed here as
# dimforge-rapier3d-simd-compat-VERSION.tgz. README.md says what it needs and when to run it.
#
# Rapier's own pipeline (bindings/typescript/rapier-compat: build-rust.sh, gen_src.sh, rollup,
# fix_raw_file.sh), run for the one variant the core uses. The work tree (Rapier's source,
# its npm packages and its Rust target, a few GB) is RAPIER_WORK, outside the repository.
set -euo pipefail

TAG=js-v0.21.0
REVISION=b716d375efc0201003f0cd9ef7168eee0b62c177
VERSION=0.21.0-auto-rpg.2

here="$(cd "$(dirname "$0")" && pwd)"
work="${RAPIER_WORK:-$here/../../.tools/rapier-build}"
origin="${RAPIER_SOURCE:-https://github.com/dimforge/rapier.git}"

# Rapier's source at TAG, LF line endings whatever the machine's git says, and the patch on it.
# What a build leaves (generated crates, generated sources, packages) is cleared; the Rust target
# and the npm packages are kept for the next build.
mkdir -p "$work"
work="$(cd "$work" && pwd -P)"
src="$work/rapier"
marker="$work/.auto-rpg-build"
if [ -e "$src" ] && { [ ! -f "$marker" ] || [ "$(cat "$marker")" != "$src" ]; }; then
  echo "Refusing to reset an unmanaged work tree: $src" >&2
  exit 1
fi
if [ -L "$src" ]; then
  echo "Refusing a symlinked source tree: $src" >&2
  exit 1
fi
printf '%s\n' "$src" > "$marker"
if [ ! -d "$src/.git" ]; then
  git -c core.autocrlf=false clone --quiet "$origin" "$src"
fi
git -C "$src" config core.autocrlf false
git -C "$src" fetch --quiet --tags origin
if [ "$(git -C "$src" rev-parse "$TAG^{commit}")" != "$REVISION" ]; then
  echo "The source tag does not match the pinned revision" >&2
  exit 1
fi
git -C "$src" checkout --quiet --force "$REVISION"
git -C "$src" clean --quiet -fdx -e target -e node_modules
git -C "$src" apply "$here/auto-rpg.patch"

ts="$src/bindings/typescript"
cd "$ts"
npm ci --no-audit --no-fund
# npm holds back install scripts until they are approved; wasm-pack's and wasm-opt's fetch their
# binaries. An npm without approvals runs them in `npm ci` and has no `approve-scripts`.
npm approve-scripts wasm-pack wasm-opt >/dev/null 2>&1 || true
npm rebuild wasm-pack wasm-opt
cargo run --quiet -p prepare_builds -- -d dim3 -f simd

cd rapier-compat
if [ "$(pwd -P)" != "$src/bindings/typescript/rapier-compat" ]; then
  echo "Build directory escaped its managed source tree" >&2
  exit 1
fi
npm ci --no-audit --no-fund
# build-rust.sh for 3D SIMD, with the folders it was built in taken out of the paths the wasm
# keeps for its panics: the same bytes from any folder or machine with the same toolchain, and no
# home folder in them. Paths are given as rustc sees them (Windows' own on Windows).
native() { if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else printf '%s' "$1"; fi; }
flags=(-C target-feature=+simd128
  "--remap-path-prefix=$(native "$src")=/rapier"
  "--remap-path-prefix=$(native "${CARGO_HOME:-$HOME/.cargo}")=/cargo")
cargo clean --quiet --manifest-path ../Cargo.toml
# Working dir in wasm-pack is the crate's, hence "../../".
CARGO_ENCODED_RUSTFLAGS="$(IFS=$'\x1f'; printf '%s' "${flags[*]}")" PATH="$ts/node_modules/.bin:$PATH" \
  wasm-pack build --target web --out-dir ../../rapier-compat/builds/3d-simd/wasm-build ../builds/rapier3d-simd

# gen_src.sh, for 3D alone: the shared sources with the compat overrides, 2D's sections cut.
rm -rf gen3d
mkdir -p gen3d
cp -r ../src.ts/* gen3d
rm -f gen3d/raw.ts gen3d/init.ts
cp -r ./src3d/* gen3d
find gen3d -type f -print0 | LC_ALL=C xargs -0 sed -i '\:#if DIM2:,\:#endif:d'
build=builds/3d-simd
dist="$build/pkg/dist"
mkdir -p "$dist"
cp "$build"/wasm-build/rapier_wasm* "$dist/"
cp -r gen3d "$build/"
cp tsconfig.common.json tsconfig.json "$build/"
cp tsconfig.pkg3d.json "$build/tsconfig.pkg.json"
# "import.meta" is never reached by the compat package and some bundlers refuse it.
sed -i 's/import.meta.url/"<deleted>"/g' "$dist/rapier_wasm3d.js"

# rollup.config.js for this variant alone, its declarations written with LF line endings: the
# TypeScript it pins writes the platform's.
node -e '
const fs = require("fs");
let config = fs.readFileSync("rollup.config.js", "utf8");
const list = /export default \[[^\]]*\];/;
const options = "inlineSources: true,";
if (!list.test(config) || !config.includes(options)) throw new Error("rollup.config.js is not as build.sh expects");
config = config.replace(list, "export default [config(\"3d\", \"3d-simd\")];").replace(options, options + " newLine: \"lf\",");
fs.writeFileSync("rollup.auto-rpg.config.js", config);
'
npx rollup --config rollup.auto-rpg.config.js --bundleConfigAsCjs
echo 'export * from "./rapier_wasm3d";' > "$dist/raw.d.ts"

# The package's version says it is ours, and npm packs it beside this script.
node -e '
const fs = require("fs"), [file, version] = process.argv.slice(1);
const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
manifest.version = version;
fs.writeFileSync(file, JSON.stringify(manifest, undefined, 2));
' "$build/pkg/package.json" "$VERSION"
npm pack "$build/pkg" --pack-destination "$here" --silent
