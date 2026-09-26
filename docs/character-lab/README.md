# Character Workshop

An isolated character-authoring experiment: original male fighter and female rogue, fitted boots and armour, sword/shield combinations, and a two-handed bow. This page has no connection to arena state, combat, AI, or Havok.

## Run

From this experiment worktree:

```powershell
npm ci
npm run dev -- --host 127.0.0.1 --port 5182 --strictPort
```

Open **http://127.0.0.1:5182/character-lab.html**. Stop the server with Ctrl+C when finished. Port 5182 is separate from the game's 5180; if occupied, choose another explicit port rather than terminating an unrelated process.

For the production version, run `npm run build`, then `npm run preview -- --host 127.0.0.1 --port 5182 --strictPort` and open the same route.

## Controls

- Choose a character; each retains its own loadout until page reload.
- Toggle boots and armour independently. No armour leaves a tunic and trousers; no boots exposes bare feet.
- Select empty hands, sword, shield, sword + shield, or bow. Bow replaces both hand assignments.
- Use **Inspect grip** to frame the equipped hand, then rotate to inspect both sides. Right-drag pans between the two bow hands.
- Drag to orbit; wheel or pinch to zoom; right-drag to pan; Reset view restores framing.
- With the canvas focused, Left/Right rotate, Up/Down change the inspection height, and +/− zoom.
- Inspect shows an equipment-specific relaxed pose; Ready applies the equipment pose. Fit checks exposes raised arms and a planted-foot crouch.

## Authoring and rebuilding

All character, clothing, hair, face, and equipment geometry is authored in `scripts/character-lab/build.py` and `scripts/character-lab/grips.py`. No downloaded warrior geometry, third-party textures, or generated image assets are used. Materials are original constant PBR colours. The two bodies share semantic bone names but have separate proportions and fitted geometry.

Run Blender 4.5 LTS from this worktree:

```powershell
& 'C:/Users/ostro/IdeaProjects/auto-rpg/.tools/blender-4.5.12/blender-4.5.12-windows-x64/blender.exe' --background --python scripts/character-lab/build.py
```

Alternatively substitute your Blender executable. Output consists of editable `assets/character-lab/{fighter,rogue}.blend`, runtime `public/assets/character-lab/{fighter,rogue}.glb`, and a mesh-count manifest. The script is the reproducible source of truth; regeneration overwrites manual edits to generated Blender files. Blender may create `.blend1` backups; do not commit these.

Each GLB contains one armature, all fitted equipment meshes, and twenty equipment-specific pose clips. Mesh prefixes identify `base`, `bare`, `boots`, `armour`, `sword`, `shield`, and `bow`. Hiding boots also reveals bare feet. Invisible equipment is disabled, not repeatedly constructed or disposed. Materials and skeletons belong to the loaded asset containers, which are disposed with the page.

The local catalog declares character assets, starting loadouts, equipment mesh groups, and pose selection. It does not modify gameplay `Intent`, body families, or equipment registries. Imported animation controls only these preview models. Later physics integration must map achieved physical transforms to the semantic bones and define real equipment collision, mass, damage, and grip constraints.

## Validation

`tests/character-lab.test.mjs` imports the real GLBs under Babylon's NullEngine. It checks all 40 loadout combinations, skin bindings and required pose clips, actual hand movement, finger contact against the actual skinned grip and bowstring surfaces, palm/thumb clearance, and a 170 mm crouch with stationary feet. These tests do not claim to validate combat physics or cloth collision.

Browser review covers equipment and character switching, stable mesh/material/skeleton counts, camera controls, multiple viewing angles, fit poses, mobile layout, and the built page. Screenshot examples are included alongside this document.

Run the browser checks against a running dev or preview server with Microsoft Edge installed:

```powershell
npm exec --yes --package=playwright -- node scripts/character-lab/browser-check.mjs http://127.0.0.1:5183/character-lab.html
```

Playwright runs in a separate headless browser and is not added to the game's dependencies. Review artifacts go into `.review/character-lab`; representative screenshots are refreshed in this directory.

The original visibility-only acceptance was insufficient: it did not verify grasping. The correction adds open, power-grip and string-hook hand variants; solid shield geometry with connected handle mounts; equipment-specific wrist frames; and close-up rendering that does not cull moved fingers using bind-pose bounds. Contact checks sample vertices, triangle centres and edge midpoints, with a 1 mm tolerance and deliberately detached negative controls. These are geometry checks, not simulated grasp forces.

[Fighter preview](fighter.jpg) · [Rogue preview](rogue.jpg) · [Mobile preview](mobile.jpg)

## Limits of this experiment

This is stylized prototype art, not a production realistic-human pipeline. Holding poses are authored samples, not locomotion or combat animation. The bow does not draw or fire; skin deformation does not simulate cloth, fingers, severing, or contact. The lab validates these authored bodies and equipment sets, not arbitrary third-party assets or unrestricted body-shape changes.

Grip correction verification (2026-09-26): 1,024 repository tests passed; the final geometry contact tests, TypeScript check and production build passed. Production browser checks covered 40 loadouts and 160 poses with no browser errors. Four close-up angles per item and character were captured and reviewed.

[Actual sword grip](sword-grip.png) · [Shield handle and mounts](shield-grip.png) · [Both bow hands](bow-grip.png)
