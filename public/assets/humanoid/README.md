# The Warrior and the Rogue

`workshop-fighter.glb` (the Warrior) and `workshop-rogue.glb` (the Rogue) are the character
workshop's models without their preview motion, exported from `assets/character-lab/fighter.blend`
and `rogue.blend` by `scripts/humanoid/export-workshop.py`, which also writes
`assets/humanoid/workshop-*.json`. Their anatomy comes from CC0 MakeHuman/MPFB assets; the
clothing, equipment and fitting are this project's work.

The skins (`src/render/skin.ts`) wear them on core bodies, and the core measures them: the
envelope (`scripts/core/workshop-envelope.mjs`) and the stature (`SKIN_TOP` in
`src/core/human/model.ts`). How they are built, exported and rebuilt:
[docs/art/characters.md](../../../docs/art/characters.md).
