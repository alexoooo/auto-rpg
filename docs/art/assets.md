# Art sources and web delivery

Character art has one editable source and generated web resources. Large originals are in Git
LFS; delivery files and lossless inspection exports are reproducible build outputs. The Fighter
and Rogue use this pipeline. Other art keeps its documented builders until it is migrated.

## Sources

`assets/art/catalog.json` names each character's master, licence, consumers and delivery profile.
The Blender masters reference original images relatively under `assets/art/textures/`. Images
are named by SHA-256 and shared between masters; packed copies are removed. Character authoring
scripts preserve this arrangement. Commit changed masters, original images and recipes together.

After cloning, run `git lfs install`, `git lfs pull`, `npm ci`, then `npm run assets`. Never
commit an LFS pointer whose content has not been uploaded when publishing the corresponding code.

## Build and inspect

| Command | Result |
|---|---|
| `npm run assets` | Build changed sources, or validate and reuse cached output |
| `npm run assets -- --force` | Rebuild the current source recipe |
| `npm run assets:check` | Check freshness, references, hashes, rig frames, sharing and the size budget |
| `npm run assets:report` | Unique delivery bytes, workshop additions and decoder sizes |

`npm run dev` and `npm run build` prepare assets automatically. Normal export never saves a master
or updates the physics metadata. Windows x64 and Linux x64 use checksum-verified Blender 4.5.12
and KTX Software 4.4.2 extracted into `.cache/art/`; nothing is installed globally. `ART_BLENDER`
and `ART_KTX` can select existing executables of those exact versions. Node tools are pinned in
the lockfile. The first build downloads the toolchain; later builds need only changed inputs.

The cache key covers sources, original textures, recipes, compiler scripts and pinned tools.
`.cache/art/builds/<key>/lossless/` contains inspection GLBs. Node measurement scripts resolve
them through `scripts/art/paths.mjs`. Cache data is disposable and excluded from build identity;
the source inputs remain part of that identity.

## Delivery

`public/assets/generated/` contains hashed resources and a manifest. Two small glTF descriptors
per character reference the same geometry and KTX2 textures. The workshop descriptor also names
its animation buffer; the gameplay descriptor contains no animation. Decoder scripts and WASM
are served from the same deployment base, with their licence notices.

The profile limits texture dimensions to 1024 pixels without upscaling. Colour maps use ETC1S
at quality 200; normal and material data use UASTC quality 2 and Zstandard level 18. Mipmaps are
built offline, colour is sRGB, and normal/material channels are linear. Alpha and material modes
are retained. Identical encoded textures share a URL. Geometry and animation use lossless
Meshopt compression; names, authored rig frames, skin weights and topology are retained.

The combined base resources of both characters have an 8,000,000-byte ceiling, counting shared
resources once, before HTTP compression. Workshop additions and decoders are reported separately.
This is a character budget, not the whole Arena's download. A larger asset needs a visible purpose
and an explicit recipe budget change; an encoder failure never relaxes the ceiling automatically.
The kept [delivery-size record](../reference/art-delivery.md) gives the measured comparison.

## Physics authority

The core reads versioned rig, hull, contact and skin-bound JSON. Web texture quality and delivery
compression cannot change those values. `assets/humanoid/skin-bounds.json` records the exact skin
tops with their original lossless source hashes. Anatomy updates remain explicit measurements
from lossless exports, with their existing scripts and checks.

The pipeline validates complete output before publishing it. CI checks out LFS originals, caches
toolchains and artifacts, builds assets, runs the gate, and deploys ordinary generated files to
GitHub Pages. Historical Git blobs are not removed by this forward-only storage migration.
