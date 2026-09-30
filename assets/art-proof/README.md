# The Forge kit

The arena's room, the Forge, is dressed from this kit: pavement, masonry, columns, bowls, cloth and
outcrops, all original generated work. `public/assets/art-proof/forge-kit.glb` holds the templates
and the PNGs beside it their seamless PBR maps. `src/forge-assets.ts` loads both,
`src/forge-style.ts` builds the look from them, and `src/forge-room.ts` fills the arena's wall
colliders with masonry and decorates its posts with flames.

## Rebuilding

`forge.blend` is an editable shelf; each object is a named GLB template.
`scripts/art-proof/build-assets.py` generates the shelf, the GLB and the maps deterministically.
From the repository root:

```powershell
& '.tools/blender-4.5.12/blender-4.5.12-windows-x64/blender.exe' --background --python scripts/art-proof/build-assets.py
npm run build
```

Normal builds use the committed GLB and maps and need no Blender. The Blender binary is a local
4.5.12 LTS portable installation under the ignored `.tools`; any Blender 4.5 LTS runs the same
script. Rebuilding overwrites the kit and the shelf. Colour maps are sRGB; normal and ORM maps are
linear.
