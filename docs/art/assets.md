# Art sources and web delivery

Characters, environment models and surface textures have full-quality sources and generated web
resources. Large originals are in Git LFS; web delivery and character inspection exports are
reproducible build outputs. The HDR environment and the menu image are served as committed.

## Sources

`assets/art/catalog.json` names character masters, environment inputs, licences and the delivery profile.
The Blender masters reference original images relatively under `assets/art/textures/`. Images
are named by SHA-256 and shared between masters; packed copies are removed. Character authoring
scripts preserve this arrangement. Commit changed masters, original images and recipes together.

`assets/art/environment/` holds the lossless Forge, chamber, crypt-kit, skeleton, rat and reptile
GLBs and the original PNG/JPEG texture maps. These exports preserve the builders' template frames,
batching and skeleton-local coordinates. The editable Blender masters stay in their authoring
folders. `rat/rat.glb` and `reptile/reptile.glb` have no Blender master:
`scripts/rat/build-assets.mjs` and `scripts/reptile/build-assets.mjs` build them, with their maps,
from their published sources ([the rat](rat.md), [the reptile](reptile.md)).
Run the documented authoring builder to update a source export, then `npm run assets` to compile
delivery files. The builders never write full-quality exports into `public/`.

`public/assets/env.hdr`, the environment map, is Poly Haven's `kloofendal_43d_clear` at 1k
(<https://polyhaven.com/a/kloofendal_43d_clear>), released under CC0 1.0; the menu image's source
is [the menu painting](menu.md).

After cloning, run `git lfs install`, `git lfs pull`, `npm ci`, then `npm run assets`. Never
commit an LFS pointer whose content has not been uploaded when publishing the corresponding code.

## Build and inspect

| Command | Result |
|---|---|
| `npm run assets` | Build changed sources, or validate and reuse cached output |
| `npm run assets -- --force` | Rebuild the current source recipe |
| `npm run assets:check` | Check freshness, references, hashes, rig frames, sharing and the size budget |
| `npm run assets:report` | Unique delivery bytes, workshop additions, environment resources and the whole art total |

`npm run dev` and `npm run build` prepare assets automatically. Normal export never saves a master
or updates the physics metadata. Building art needs Windows x64 or Linux x64: the toolchain
(`tool`, `scripts/art/tools.mjs`) refuses any other platform before it reads `ART_BLENDER` or
`ART_KTX`. There it uses checksum-verified Blender 4.5.12 and KTX Software 4.4.2 extracted into
`.cache/art/`; nothing is installed globally. `ART_BLENDER` and `ART_KTX` can select existing
executables of those exact versions. Node tools are pinned in the lockfile. The first build
downloads the toolchain; later builds need only changed inputs.

The cache key covers sources, original textures, recipes, compiler scripts and pinned tools.
`.cache/art/builds/<key>/lossless/` contains inspection GLBs. Node measurement scripts resolve
them through `scripts/art/paths.mjs`. Cache data is disposable and excluded from build identity;
the source inputs remain part of that identity.

## Delivery

`public/assets/generated/` contains hashed resources and a manifest. Two small glTF descriptors
per character reference the same geometry and KTX2 textures. The workshop descriptor also names
its animation buffer; the gameplay descriptor contains no animation. Decoder scripts and WASM
are served from the same deployment base, with their licence notices.

The manifest also maps stable model and texture IDs to their hashed files. Every scene obtains
a ready resolver before constructing textures or opening compressed models. The GLB reader
(`readGlb`, `src/core/bodies/art/glb.ts`), shared by the skeleton's skin (`src/app/browser/render/skeleton-skin.ts`) and
the skinned art (`src/app/browser/render/skinned-art.ts`), decodes Meshopt buffer views and respects accessor
offsets and strides.

The profile limits texture dimensions to 1024 pixels without upscaling. Colour maps use ETC1S
at quality 200; normal and material data use UASTC quality 2 and Zstandard level 18. Mipmaps are
built offline, colour is sRGB, and normal/material channels are linear. Alpha and material modes
are retained. Identical encoded textures share a URL. Geometry and animation use lossless
Meshopt compression; names, authored rig frames, skin weights and topology are retained.
Standalone textures use their original encoding when the KTX2 candidate would be larger; either
selected variant has one hashed delivery URL. A source image is never upscaled. Texture sampling,
normal conventions and physical repeat scales belong to the runtime material descriptors.

Two ceilings bound delivery, both in `assets/art/catalog.json`'s profile: `baseBudgetBytes`, the
combined base resources of both characters, and `totalBudgetBytes`, the entire art inventory with
all decoders, the HDR and the menu image. Both count shared payloads once, before HTTP
compression; manifest and licence text are excluded. Neither is a single scene's download.
Workshop additions and decoders are reported separately. A larger asset needs an explicit budget
change; an encoder failure never relaxes a ceiling.

## Physics authority

The core reads versioned rig, hull, contact and skin-bound JSON. Web texture quality and delivery
compression cannot change those values. `assets/humanoid/skin-bounds.json` records each model's
exact skin top with the accessor it was read from and that GLB's SHA-256, the GLB cited at the
commit that held it (`path@<commit>`); no script writes it. An anatomy update is an explicit
measurement from the lossless exports
([the characters](characters.md#exporting-the-games-derivatives)).

The pipeline validates complete output before publishing it. CI (`.github/workflows/pages.yml`)
checks out LFS originals, caches toolchains and artifacts, builds assets, runs the gate, and
deploys the generated files to GitHub Pages.
