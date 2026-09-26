# Character Workshop

Isolated visual character study at `/character-lab.html`. It does not change arena combat, Havok, or the game's AI.

The male fighter and female rogue use customized MakeHuman/MPFB CC0 anatomy, skin textures, hair, eyes and rig weights. Clothing, armour, boots, weapons, equipment fitting and motion are authored by this experiment. These are not wholly original anatomical meshes.

## Run

`npm ci`, then `npm run dev -- --host 127.0.0.1 --port 5183 --strictPort`.
Open http://127.0.0.1:5183/character-lab.html. Use another explicit port if occupied; do not stop an unrelated server. Stop your server when done.

## Controls

Choose either character and configure footwear, armour, and empty hands / sword / shield / sword and shield / bow. Each character retains its loadout. Drag to orbit, right-drag to pan, scroll to zoom. The default authored motion walks forward, attacks, turns and returns. Pause, scrub, slow down, restart or choose Neutral. Inspect grip pauses at the current frame and frames the equipped hand. Clothing changes preserve motion time; character and weapon changes restart it.

This is an authored animation study, not a physically simulated or AI-generated gait. It demonstrates the visual asset and attachment pipeline separately from the game controller.

## Source and rebuilding

Editable Blender files are in `assets/character-lab`; portable runtime exports are in `public/assets/character-lab`. The active generator is `scripts/character-lab/realistic/build.py`. `motion.py` authors anatomy-relative equipment, finger poses and the walk/attack timeline. `morph_export.py` binds bow flex, string movement and arrow flight to the exported clips.

Run `scripts/character-lab/realistic/rebuild.ps1 -Blender PATH_TO_BLENDER_EXE` with Blender 4.5.12. This downloads the tools and core assets to ignored `.tools/mpfb`; it does not install an add-on in the user's Blender preferences.

MPFB source is pinned to commit `3edf9df0551765be43563d047888cf7877eb89b4`. Its code is GPLv3; its graphical assets and generated output are CC0. See [upstream licensing](https://github.com/makehumancommunity/mpfb2/blob/3edf9df0551765be43563d047888cf7877eb89b4/LICENSE.md) and the included `assets/character-lab/MAKEHUMAN-CC0.txt`.

Core asset archive: [MakeHuman system assets](https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html), SHA256 `B542127A8E25547C7C29C19F2D1D2ADB9A664C80396ECD694095DBC8028A0107`.

Used assets: middleage Caucasian male / young Caucasian female skins, low-poly eyes, eyebrow001, eyelashes01, teeth_base, short02 and ponytail01 hair. All come from the core CC0 pack. Packed maps in the Blender files and GLBs do not depend on `.tools` at runtime.

## Verification

`npm test`, `npm run check`, `npm run build`. The character tests load the actual GLBs and check all 40 loadouts, real forward/return displacement, stance-foot motion, attacks and bow deformation. Browser review is additionally required: these numerical checks do not establish anatomical or artistic quality.

The exported-asset regressions also sample wrist alignment and bow hand/torso clearance throughout the loop, and measure every gripping finger and thumb against the actual exported handle. Contact checks use skin vertices, not continuous triangle collision detection.

Run `npm exec --yes --package=playwright -- node scripts/character-lab/browser-check.mjs URL` against a development or production preview. It checks 40 configurations and 440 animation samples, retained loadouts, orbit/zoom, grip framing, mobile overflow, browser errors and scene resource counts. It saves front/side pose captures to ignored `.review/character-lab/acceptance`. `realistic-grips.mjs` additionally captures hand closeups against port 5183.

The animation is a fixed preview choreography. It is not a general collision-avoiding controller, and the simplified armour and clothing are not a finished production art set.
