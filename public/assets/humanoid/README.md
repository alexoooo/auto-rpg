# Armoured warrior

`warrior.glb` is adapted from **Knight (Rigged – Mid Poly)** by **crownjoshua**.

- Source and licence declaration: https://opengameart.org/content/knight-rigged-mid-poly
- Original download: https://opengameart.org/sites/default/files/Knight_0.blend
- Licence: **CC0 1.0 Universal**, https://creativecommons.org/publicdomain/zero/1.0/
- Adaptation: human proportions, physics bind pose, continuous body skin with separable module seams,
  clothed body, rigid armour, authored palm grips, and removal of the source weapons and animation controls.

The GLB is served locally. No runtime third-party request or Blender installation is needed.
The original author does not endorse this game.

Rebuild from the checked-in, stripped editable source with Blender 4.5:

```powershell
node scripts/humanoid/export-bind.mjs assets/humanoid/bind.json
blender --background --disable-autoexec assets/humanoid/knight-source.blend --python scripts/humanoid/build-assets.py -- assets/humanoid/bind.json public/assets/humanoid/warrior.glb
```

The importer intentionally accepts only the subset emitted by this compiler. The source
file's embedded scripts are disabled during conversion. The generated mesh follows Havok
body transforms; source animation never writes gameplay transforms.

The editable `assets/humanoid/knight-source.blend` retains the source body and armour meshes,
materials, weights and deform bones. `scripts/humanoid/prepare-source.py` reproduces it from
the original download, removing unused scene objects, animation constraints and embedded scripts.
All retargeting and grip corrections are reproducible in `build-assets.py` and `grips.json`.

`grips.json` defines the palm centre and handle/edge axes in the physical hand's local frame.
The mesh compiler and runtime import the same values. The handle runs across the closed fingers;
it does not continue down the forearm. Human swords have a hilt behind the blade, and mace/whip
welds sit inside their handles. The maul has two separated grips with matching hand orientation.

For repeatable inspection of **achieved physics poses**, including clothing beneath armour:

```powershell
node scripts/humanoid/export-pose.mjs .review/human.json mace raised
blender --background --python scripts/humanoid/render-pose.py -- .review/human.json .review/human-side.png side
blender --background --python scripts/humanoid/render-pose.py -- .review/human.json .review/human-body.png body
```

Equipment arguments: blade, mace, maul, plate, whip, fist. Pose arguments: guard, raised,
cross, thrust, roll. View arguments: front, side, rear, top, grip. These renders are inspection
artifacts; Blender never drives game physics. The `body` switch is diagnostic only.
