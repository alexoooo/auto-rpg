# Workshop fighter in the game

Choose **Human → Workshop fighter** in arena setup, or **Workshop fighter** in the
dungeon hero picker. The primary hand supports sword or empty hand; the secondary
hand supports shield or empty hand. Boots and armour toggle the appearance only:
the existing human mass, protection and damage rules remain in effect.

This integration covers the male melee fighter. The legacy warrior and the
character workshop remain available. Rogue, archery and the module bench are not
part of this integration.

## Assets and provenance

`assets/character-lab/fighter.blend` remains the editable source. Its existing
preview export is unchanged. `scripts/humanoid/export-workshop.py` creates
`public/assets/humanoid/workshop-fighter.glb` and
`assets/humanoid/workshop-fighter.json` from that saved Blender file. Run Blender
in background mode with the source file and `--python` pointing to that script.
The script does not save over the source.

The derivative preserves the source mesh, UVs, materials and embedded textures,
but removes preview animations, bow geometry and authoring helpers. All 18
textures retained in the game derivative match their preview counterparts
byte-for-byte. The JSON records the source SHA-256, anatomy dimensions, bone
frames, equipment geometry and authored finger poses. Anatomy is derived from
MakeHuman/MPFB CC0 assets; the workshop clothing, equipment and fitting are project
work. This is not a claim that the base anatomy was sculpted from scratch.

## Runtime boundary

The optional setup field `human: { model: "workshop-fighter", boots, armour }`
selects the profile. Its absence retains the legacy human. Matchup serialization
and copying preserve this field, and validation rejects unsupported loadouts.

The profile fits the existing physical human module chain to source proportions.
The normal human controller, physics clock, contacts, damage and severing still
drive combat. The presentation follows achieved physical transforms rather than
playing the workshop's walk-and-attack animation. The sword and shield visuals
follow their real equipment bodies; their collision geometry comes from the
exported equipment dimensions.

The standard Babylon glTF loader loads one source container per scene. Fighter
instances own their skeletons and material copies, while the scene owns the
source asset. Severing separates skin regions and reveals cut caps. Headless
bouts use the same physical profile without loading visual assets.

## Validation

`tests/workshop-integration.test.mjs` checks source provenance, all sixteen
supported loadout combinations through the matchup codec, profile-specific arm
kinematics and an actual Havok bout with hits and blocks. The full suite passed
1,074 tests, and TypeScript checking and the production build passed.

Browser checks covered arena selection/combat, dungeon selection/entry, all
sixteen loadouts, repeated instance disposal and a separated arm. A deterministic
eight-second legacy-human control bout remained byte-identical after the change.
