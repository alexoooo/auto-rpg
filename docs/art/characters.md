# The characters' art

The game's two humans are the character workshop's models: the fighter, who plays the Warrior,
and the rogue, who plays the Rogue. The male fighter and female rogue use customized
MakeHuman/MPFB CC0 anatomy, skin textures, hair, eyes and rig weights; their clothing, armour,
boots, weapons, equipment fitting and preview motion are this project's work. They reach the game
through shared generated geometry and textures. The workshop descriptor adds authored preview
motion; gameplay moves the same rig through physics. The [asset pipeline](assets.md) owns web
delivery. The reptile and the rat are drawn from their own sources: [the reptile](reptile.md), [the rat](rat.md).

The shared Blender export (`scripts/art/blender.py`) fits each boot's toe box to the bare foot's
toe, stretching only vertices ahead of the ball. The heel, ankle, cuff and skin weights keep their
authored fit. World views and the character workshop use that same exported geometry.

## Where each file comes from

| File | Made by | Read by |
|---|---|---|
| `assets/character-lab/fighter.blend`, `rogue.blend` | the authoring generator and refresh scripts | `npm run assets`, the measurement export below |
| `assets/art/textures/` | the authoring scripts, original bytes named by SHA-256 | both masters and the web encoder |
| `public/assets/generated/` | `npm run assets` | the workshop and gameplay skins through the generated manifest |
| lossless cached GLBs | `npm run assets` | inspection and measurement scripts, `node scripts/fingerprint.mjs --character` |
| `assets/humanoid/skin-bounds.json` | exact skin tops transcribed from the lossless source accessors | `src/core/human/model.ts` |
| `assets/humanoid/workshop-fighter.json`, `workshop-rogue.json` | `scripts/humanoid/export-workshop.py` | the core's rig (`src/core/human/rig.ts`), the skins |
| `assets/humanoid/workshop-*-trunk-hull.json` | `node scripts/core/workshop-envelope.mjs --write`, from the lossless cached GLBs (`losslessModelPath`, `scripts/art/paths.mjs`) | the core's envelope (`src/core/human/envelope.ts`) |
| `assets/humanoid/workshop-*-hands.json` | `node scripts/core/hand-envelope.mjs --write` | the core's hands (`src/core/human/hands.ts`) |

The rig JSON, skin bounds, trunk hulls and hands are `SOURCES` entries (`src/core/sources.ts`).
The core reads this exact metadata; compressed web assets never supply anatomical measurements.

## Building the workshop models

The generator is `scripts/character-lab/realistic/build.py`, run in Blender through its wrapper
(`-Blender` defaults to `blender` on the path):

```powershell
scripts/character-lab/realistic/rebuild.ps1 -Blender PATH_TO_BLENDER_EXE
```

The wrapper downloads MPFB and MakeHuman's core assets to the ignored `.tools/mpfb`; it installs
nothing into the user's Blender preferences. MPFB is pinned to commit
`3edf9df0551765be43563d047888cf7877eb89b4`; its code is GPLv3, and its graphical assets and
generated output are CC0 (see [its licence](https://github.com/makehumancommunity/mpfb2/blob/3edf9df0551765be43563d047888cf7877eb89b4/LICENSE.md)
and `assets/character-lab/MAKEHUMAN-CC0.txt`). The asset archive is
[MakeHuman's system assets](https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html),
downloaded by the wrapper (`makehuman_system_assets_cc0.zip`, saved as `.tools/mpfb/assets.zip`) and checked against SHA256 `B542127A8E25547C7C29C19F2D1D2ADB9A664C80396ECD694095DBC8028A0107`. The
models use the middle-aged Caucasian male and young Caucasian female skins, low-poly eyes,
eyebrow001, eyelashes01, teeth_base, and the short02 and ponytail01 hair, all from that CC0 pack.
Original maps are shared outside the masters under `assets/art/textures/`; generated web maps
are self-hosted. Nothing depends on `.tools` at runtime.

The build's helpers, beside it:

- `motion.py`: equipment placed relative to the anatomy, fitted finger poses, and the
  walk-and-attack timeline. Equipped poses refuse unreachable wrist targets while authoring.
- `rig.py`: shoulder and forearm twist spread across helper joints, skin influences normalized.
  Shoulder plates follow the upper arm's swing without its full axial twist.
- `grip_fit.py`: finger flexion fitted against a handle using the weighted skin itself.
- `phases.py`: one timeline for the bow's poses, string flex, fingers and the arrow's release;
  `morph_export.py` binds the flex and string to the exported clips. The arrow has its own joint,
  so it leaves the hand in world space.
- `refresh_motion.py` and `refresh_deformation.py`: re-author the motion, or rebake the
  deformation helpers, on a saved body without rebuilding MPFB.

## Exporting the game's derivatives

`npm run assets` builds the shared runtime descriptors and lossless inspection exports without
saving over the sources or changing physics metadata. An explicit anatomy update uses
`scripts/humanoid/export-workshop.py`, which writes a lossless measurement GLB under
`.tmp/art-measurements/` and updates the rig JSON:

```powershell
blender --background --disable-autoexec assets/character-lab/fighter.blend --python scripts/humanoid/export-workshop.py
blender --background --disable-autoexec assets/character-lab/rogue.blend --python scripts/humanoid/export-workshop.py -- rogue
```

The GLB keeps the source's mesh, UVs, materials, embedded textures and rest transforms, and drops
the preview animation, authoring helpers and (for the fighter) the bow. The JSON holds the source's
SHA-256, the anatomy's lengths, bone frames, the palm, grip frames, equipment geometry and the
authored finger poses.

## Checking the models

The checks (`scripts/character-lab/validation.mjs`) read the real GLBs: that the palm and finger
pads lie on the sword's, shield's and bow's grips (`gripDistances`, `contactPatch` and `gripGap`),
that the wrists keep their area (`wristAreaRatio`) and the forearms their girth
(`forearmExpansion`), and that the arms and what they carry clear the head, the body and each
other (`surfaceIndex`, `meshCrossesSurface`, `skinPart`). They are sampled surface checks, not
proof of clearance between samples; a person looks as well.

### What the checks read

The checks find their regions on the skin in the rest pose (`skinRegions`,
`scripts/character-lab/validation.mjs`), by the numbers of `SKIN`:

| Field | Value |
|---|---|
| `hand` | 0.1209 m, the fighter's wrist to middle knuckle (the rogue's is 0.09919 m). The generator authors the grips on this hand and scales them to each model's (`handScale`, `scripts/character-lab/realistic/motion.py`); the checks scale their lengths along the hand the same way |
| `palm` | the skin bound to the hand by more than 0.6, from 0.055 to 0.115 m along the hand from the wrist, whose normal has a cosine above 0.25 with the palm's. A grip's line crosses the palm 0.095 m from the wrist, with a radius of 0.018 m (`point(s, x, .095, .046)` in `motion.py`) |
| `pad` | a digit's pad is the skin bound to its two outer bones by more than 0.65, whose normal has a cosine above 0.05 with the palm's |
| `wrist` | the skin from 0.72 to 1.02 of the way from the elbow to the wrist, within 0.07 m of the forearm's axis. Its area is read at 0.77, 0.84, 0.91 and 0.98, over the skin within 0.027 of each |
| `forearm` | the skin from 0.2 to 0.75 of the way from the elbow to the wrist, between 0.015 and 0.065 m from the axis |
| `patch` | a pad's contact is read at the distance a tenth of the way up its order from the nearest (`contactPatch`) |
| `part` | a triangle belongs to a part of the body when each corner is bound to the part's bones by more than 0.65 (`skinPart`) |

The surface index's cell is `CELL`, 0.12 m, which changes how fast it answers and not what.

`node scripts/fingerprint.mjs --character` prints a hash of what these checks measure on both
models, at three frames of every clip: a change to the checks that is meant to change nothing
leaves it as it was.

With a server on the script's port, and Playwright fetched for the run (it is not a dependency);
every script launches Microsoft Edge (`channel: 'msedge'`). Without a URL, a script opens
`http://127.0.0.1:5183/character-lab.html` (`browser-check.mjs`, `visual-review.mjs`,
`realistic-grips.mjs`) or port 5182 (`anatomy-review.mjs`, `grip-review.mjs`): after
`npm run build`, serve that port with
`npm run preview -- --port <port> --strictPort --host 127.0.0.1`, and stop the preview by its PID
after.

- `npm exec --yes --package=playwright -- node scripts/character-lab/browser-check.mjs URL`: every
  loadout and animation sample, retained loadouts, orbit and zoom, grip framing, browser errors and
  resource counts; captures go to `.tmp/character-lab/`.
- `visual-review.mjs URL fighter` (or `rogue`, with `armour` to add it): grip close-ups and front,
  side, rear and overhead attack poses. Look at the frames between poses too.
- `anatomy-review.mjs` and `grip-review.mjs` (URL argument, default port 5182) and
  `realistic-grips.mjs` (fixed to port 5183): further captures.
  `geometry-report.mjs` and `contact-report.mjs` print measurements from the GLBs in Node.
