# The character workshop's models

`fighter.glb` and `rogue.glb` are the workshop models with their authored preview motion and every
loadout, shown by `/character-lab.html` (`src/character-lab/main.ts`) and checked by
`tests/character-lab.test.mjs` and `tests/character-motion.test.mjs`. They are built with their
Blender sources (`assets/character-lab/`) by `scripts/character-lab/realistic/build.py`, from
customized MakeHuman/MPFB CC0 anatomy with clothing, equipment and motion authored here. How to
rebuild them: [docs/art/characters.md](../../../docs/art/characters.md).
