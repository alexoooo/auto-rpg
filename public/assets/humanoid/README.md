# Armoured warrior

`warrior.glb` is adapted from **Knight (Rigged – Mid Poly)** by **crownjoshua**.

- Source and licence declaration: https://opengameart.org/content/knight-rigged-mid-poly
- Original download: https://opengameart.org/sites/default/files/Knight_0.blend
- Licence: **CC0 1.0 Universal**, https://creativecommons.org/publicdomain/zero/1.0/
- Adaptation: human proportions, physics bind pose, module-separated skin weights,
  simplified materials, removal of the source weapons and animation rig.

The GLB is served locally. No runtime third-party request or Blender installation is needed.
The original author does not endorse this game.

Rebuild from the original `.blend` with Blender 4.5:

```powershell
node scripts/humanoid/export-bind.mjs assets/humanoid/bind.json
blender --background --disable-autoexec Knight_0.blend --python scripts/humanoid/build-assets.py -- assets/humanoid/bind.json public/assets/humanoid/warrior.glb
```

The importer intentionally accepts only the subset emitted by this compiler. The source
file's embedded scripts are disabled during conversion. The generated mesh follows Havok
body transforms; source animation never writes gameplay transforms.
