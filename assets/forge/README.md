# The Forge kit

The arena's room, the Forge, is dressed from this kit: pavement, masonry, columns, bowls, cloth and
outcrops, all original generated work. `assets/art/environment/forge/forge-kit.glb` holds the templates
and the PNGs beside it their seamless PBR maps. The art compiler emits compressed delivery from
both; `src/app/browser/arena/forge-assets.ts` loads the generated resources,
`src/app/browser/arena/forge-style.ts` builds the look from them, and `src/app/browser/arena/forge-room.ts` fills the
arena's wall colliders with masonry and decorates its posts with flames. The art stays inside the
colliders it dresses and adds none.

## Rebuilding

`forge.blend` is an editable shelf; each object is a named GLB template.
`scripts/forge/build-assets.py` generates the shelf, the GLB and the maps deterministically.
From the repository root, with the pinned Blender that `npm run assets` extracts into
`.cache/art/` (`scripts/art/tools.mjs`; any Blender 4.5 LTS runs the same script):

```powershell
& '.cache/art/tools/blender-4.5.12/blender-4.5.12-windows-x64/blender.exe' --background --python scripts/forge/build-assets.py
npm run assets
```

`npm run assets` compiles the lossless GLB and maps to hashed delivery files, reusing its encoder
cache. Rebuilding overwrites the kit and the shelf. Colour maps are sRGB; normal and ORM maps are
linear.
