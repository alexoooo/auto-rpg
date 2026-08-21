# Warrior prototype

An independent browser rendering experiment: one original armored warrior in a lit,
interactive turntable. It deliberately has no source, runtime, asset, or build dependency
on the auto-rpg game beside sharing this repository.

```powershell
npm ci
npm run dev
```

Drag or swipe to orbit, use the wheel or a pinch to zoom, press Space to pause or resume,
and press R to reset. A reduced-motion preference starts the turntable paused.

## Asset work

`asset-src/build_warrior.py` is the editable source for `public/assets/warrior.glb`.
Regenerate and validate it with:

```powershell
$env:BLENDER_PATH = "C:\path\to\blender.exe" # optional
npm run asset:build
npm run asset:validate
```

The build script also writes four ignored review renders under `.review/`.
`concept/warrior-angles.png` is the canonical turnaround for silhouette, equipment,
materials, and palette. It is source reference only and is not loaded by the web app.

```powershell
npm test
npm run build
```
