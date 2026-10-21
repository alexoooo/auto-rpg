# The Warrior and the Rogue

The Warrior and Rogue use the shared generated resources described in
[the asset pipeline](../../../docs/art/assets.md). `npm run assets` reads the editable Blender
masters and emits delivery files under `public/assets/generated/`. Their anatomy comes from
CC0 MakeHuman/MPFB assets; clothing, equipment and fitting are this project's work.

The skins (`src/render/skin.ts`) wear them on core bodies, and the core measures them: the
envelope (`scripts/core/workshop-envelope.mjs`) reads lossless cached exports, while stature
comes from the exact recorded skin bounds. How they are built, exported and rebuilt:
[docs/art/characters.md](../../../docs/art/characters.md).
