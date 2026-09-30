# The Cinder Forge kit

The arena's environment templates: pavement, masonry, columns, bowls, cloth and outcrops, with
their seamless 2K PBR maps, all original generated work in `public/assets/art-proof/forge-kit.glb`
and its images. `src/forge-style.ts` loads them; `src/forge-room.ts` fills the arena's wall
colliders with masonry and decorates its posts with flames.

The art proof page and the stone golem it dressed went with the old path
(`docs/plans/2026-09-30-old-path-removal.md`, step 5). `source.json` is the golem's exported shell
geometry, which the Blender script still reads; the golem's pieces still land on the `.blend`'s
shelf, but only the kit is exported.

## Rebuilding

`forge.blend` is an editable asset shelf; each object is a named GLB template. From the
repository root:

```powershell
& '.tools/blender-4.5.12/blender-4.5.12-windows-x64/blender.exe' --background --python scripts/art-proof/build-assets.py
npm run build
```

Normal builds use the committed GLB and images and need no Blender. The Blender binary is a local
4.5.12 LTS portable installation under ignored `.tools`; any Blender 4.5 LTS runs the same script.
Rebuilding overwrites the kit and the Blender shelf. Colour maps are sRGB; normal and ORM maps are
linear. Shader code is limited to animated flame cards.
